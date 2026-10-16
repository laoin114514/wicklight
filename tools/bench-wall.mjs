/**
 * 「墙」台架（离线、无头）：量**墙到底挡住怪没有，一只怪绕过一堵墙要多久，
 * 以及骗一次冲锋撞墙能白拿几秒**。
 *
 *   node tools/bench-wall.mjs                     # 三个场景 × 四颗种子
 *   node tools/bench-wall.mjs --secs=20
 *   node tools/bench-wall.mjs --nocollide         # 对照组：把"怪看不见墙"接回去（改前的行为）
 *   node tools/bench-wall.mjs --json=/tmp/wl/wall.json
 *
 * 对照组的做法：不要去翻旧产物——同一个 `dist/app.js` 换一个 query 再 `import()` 一次，
 * 在 Node 24 上**只有一部分构建物会真的重新求值**（实测：同一进程里第二次导入旧产物时
 * 模块体根本不跑，拿到的是空 `window.__WICKLIGHT__`，量出来的数全是假的）。
 * 所以这里直接改回那条规则本身：`enemyCtx()` 里把 `walls` 抹成空数组，
 * 怪就退回"两行裸加法"——和 v83 逐帧等价，同一份产物里就能对照。
 *
 * 为什么要有这个脚本：到 v83 为止，怪是**直接穿过墙**走过来的——`Enemy.behave` 把速度积分成
 * 位移那一步（老代码里那两行 `e.x += e.vx * dt`）从来没问过墙，只有玩家走 `collideWalls`。
 * 而墙是**唯一**一种玩家能改动战场几何的东西（其余全是数值），所以"它到底管不管用"必须量：
 *
 *   · `block`  —— 一堵 400×80 的墙横在你和追兵之间。量"穿进去多深"（改前是一路穿到底）
 *                  与"逐只追兵绕过来花了多久"（改后罚了多少时间，但**必须真的能过来**）。
 *   · `pocket` —— 三面墙围一个朝下的口袋，你蹲在里面。这是"拿墙当盾"的极端形态：
 *                  改前它们直穿进来，改后必须从两侧绕、再拐进口袋——这一条量的是
 *                  **会不会有怪被永久卡在墙背面**（贴着墙面滑要是写错了，答案就是"8 只里 3 只永远不进来"）。
 *   · `bash`   —— 墙摆在你和刺脊之间，骗它把蓄力冲锋撞在墙上。撞停之后它有一段**站着不动**的
 *                  白给时间（`wallStun`）——这一段是"墙从障碍变成掩体"的那一笔，也必须量出来。
 *   · `wide`   —— 1200px 宽的一堵墙，撞点在离右端 100px、离左端 1100px 的地方，玩家就在怪的正后方。
 *                  正对着撞的时候切向点积是 0，"往玩家那一边滑"这条判据给不出方向——剩下的是
 *                  "绕哪一头"。这一栏量的是那个判据：改前按 `e.id` 的奇偶掷硬币（同一份场景里
 *                  10.4 / 15.4 / 25.7 / 41.3 秒都出现过），改后恒 10.3 秒（绕近的那一头）。
 *                  四只怪都从 500 上下一点点出发（|x−500| < 17px），正好落在"点积≈0"那条带里。
 *
 * 四个场景都清空武器与场上原有的墙：量的是**摆好的那几面墙**，不是这一局随机生成的地图。
 */
import { installDomStubs } from '../tests/dom-stubs.mjs';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const ENTRY = new URL('../dist/app.js', import.meta.url).href;
const SECS = Number(args.get('secs') ?? 30);
/** 对照组：把"怪看不见墙"接回去（见文件头） */
const NOCOLLIDE = args.has('nocollide');
const JSON_OUT = args.get('json') ?? null;
const SEEDS = (args.get('seeds') ?? '11,29,47,83').split(',').map(Number);
const ONLY = (args.get('only') ?? 'block,pocket,bash,wide').split(',');
const dt = 1 / 60;

/** 开局：清场、清墙、把玩家与怪都交给脚本摆。 */
async function open(seed, tag) {
  const env = installDomStubs();
  await import(`${ENTRY}?bench=wall-${tag}-${seed}-${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  loop.stop();
  env.intervals.length = 0;
  // 同一颗种子两次跑出同一份数（台架的规矩：写进文档里的数必须是量出来的，不是感觉出来的）
  let s = (seed * 2654435761) >>> 0;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  if (NOCOLLIDE) {
    const realCtx = game.enemyCtx.bind(game);
    game.enemyCtx = () => {
      const c = realCtx();
      c.walls = [];
      return c;
    };
  }
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e9;
  p.hp = 1e9;
  // 神龛 / 灯台挪走：它们会把吹灯客之类的行为拐跑（这里量的是墙）
  for (const sh of game.level.shrines) {
    sh.x = 9e5;
    sh.y = 9e5;
  }
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.enemies.clear();
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  return { game, p };
}

/** 圆心到矩形的重叠深度（px）：0 = 刚好贴着，正数 = 圆真的陷进墙里了。 */
function penetration(cx, cy, r, w) {
  const nx = Math.max(w.x, Math.min(cx, w.x + w.w));
  const ny = Math.max(w.y, Math.min(cy, w.y + w.h));
  const d = Math.hypot(cx - nx, cy - ny);
  if (d > 0) return Math.max(0, r - d);
  return r + Math.min(cx - w.x, w.x + w.w - cx, cy - w.y, w.y + w.h - cy);
}

/**
 * 跑一个场景。`setup(game)` 摆墙、摆人、刷怪；返回要观察的那几只（外加 `walls`）。
 * 观察项：陷进墙里的最大深度 / 陷进去的帧数 / 逐只贴上时间 / 撞墙白给的秒数。
 */
async function run(seed, tag, setup) {
  const { game, p } = await open(seed, tag);
  const { foes, walls } = setup(game, p);
  let deepest = 0;
  let sunkFrames = 0;
  let stuckS = 0;
  let bashes = 0;
  const contactAt = new Map();
  let frames = 0;
  const total = Math.round(SECS / dt);
  for (let i = 0; i < total; i += 1) {
    frames += 1;
    p.hp = 1e9;
    p.oil = p.oilMax;
    for (const e of foes) e.hp = 1e9;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
    for (const e of foes) {
      let pen = 0;
      for (const w of walls) pen = Math.max(pen, penetration(e.x, e.y, e.radius, w));
      if (pen > deepest) deepest = pen;
      if (pen > 0.5) sunkFrames += 1;
      const t = i * dt;
      if (!contactAt.has(e.id) && Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + p.radius + 1) contactAt.set(e.id, t);
      // 撞停：`wallStun` 是改后新增的那个"撞在墙上发呆"的计时器（改前这个字段不存在，读数恒为 0）
      if ((e.wallStun ?? 0) > 0) {
        stuckS += dt;
        if (!e.__bashed) {
          e.__bashed = true;
          bashes += 1;
        }
      } else if (!((e.wallStun ?? 0) > 0)) {
        // 递减到负数也是"醒了"（`0.55 - dt` 最后一次会落到负数上，写 `=== 0` 会漏）
        e.__bashed = false;
      }
    }
  }
  const times = foes.map((e) => (contactAt.has(e.id) ? contactAt.get(e.id) : null));
  const landed = times.filter((v) => v !== null);
  return {
    deepest,
    sunkFrames,
    bashes,
    stuckS,
    landed: landed.length,
    total: foes.length,
    first: landed.length ? Math.min(...landed) : null,
    last: landed.length === foes.length ? Math.max(...landed) : null,
    frames,
  };
}

/** 一堵 400×80 的墙横在中间，6 只影蛭从 +y 那侧走过来。 */
const SCENES = {
  block: async (seed) =>
    run(seed, 'block', (game, p) => {
      const walls = [{ x: -200, y: -40, w: 400, h: 80 }];
      for (const w of walls) game.level.walls.push(w);
      p.x = 0;
      p.y = -300;
      const foes = [];
      for (let i = 0; i < 6; i += 1) {
        const e = game.enemies.spawn('shade', (i - 2.5) * 34, 300, 1, 1);
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
        e.spawnTimer = 0;
        foes.push(e);
      }
      return { foes, walls };
    }),
  /** 三面墙围的口袋（开口朝 +y），8 只影蛭从 -y 那侧来——"拿墙当盾"的极端形态。 */
  pocket: async (seed) =>
    run(seed, 'pocket', (game, p) => {
      const walls = [
        { x: -200, y: -200, w: 400, h: 80 },
        { x: -200, y: -120, w: 80, h: 260 },
        { x: 120, y: -120, w: 80, h: 260 },
      ];
      for (const w of walls) game.level.walls.push(w);
      p.x = 0;
      p.y = 20;
      const foes = [];
      for (let i = 0; i < 8; i += 1) {
        const e = game.enemies.spawn('shade', (i - 3.5) * 30, -520, 1, 1);
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
        e.spawnTimer = 0;
        foes.push(e);
      }
      return { foes, walls };
    }),
  /** 1200px 的宽墙 + 正对着撞的怪：量"绕近的那一头"这条判据（见文件头）。 */
  wide: async (seed) =>
    run(seed, 'wide', (game, p) => {
      const walls = [{ x: -600, y: -40, w: 1200, h: 80 }];
      for (const w of walls) game.level.walls.push(w);
      p.x = 500;
      p.y = -300;
      const foes = [];
      for (let i = 0; i < 4; i += 1) {
        // x 全都落在玩家正对的 ±17px 里（再远一点"往玩家那边滑"这条判据就自己给出方向了），
        // 靠 y 错开，免得四只叠在一条线上看不出相位差
        const e = game.enemies.spawn('shade', 500, 300 + i * 90, 1, 1);
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
        e.spawnTimer = 0;
        foes.push(e);
      }
      return { foes, walls };
    }),
  /** 一只刺脊（蓄力冲锋）隔着一堵墙。改前它穿墙冲刺，改后它把冲刺撞在墙上、有一段白给时间。 */
  bash: async (seed) =>
    run(seed, 'bash', (game, p) => {
      const walls = [{ x: -200, y: -100, w: 400, h: 80 }];
      for (const w of walls) game.level.walls.push(w);
      p.x = 0;
      p.y = -300;
      const e = game.enemies.spawn('lancer', 0, 300, 1, 1);
      e.hp = 1e9;
      e.maxHp = 1e9;
      e.damage = 0;
      e.spawnTimer = 0;
      return { foes: [e], walls };
    }),
};

const pad = (s, n) => String(s).padEnd(n);
const f1 = (v) => (v === null ? '—' : v.toFixed(1));
const out = {};
console.log(`墙台架：${SEEDS.length} 颗种子 · 每场 ${SECS}s 游戏时间${NOCOLLIDE ? ' · 对照组（怪穿墙）' : ''}`);
console.log(`${pad('场景', 9)}${pad('陷进最深', 9)}${pad('陷进去帧', 9)}${pad('撞停', 6)}${pad('白给', 7)}${pad('贴上', 7)}${pad('首只', 7)}${pad('最后一只', 9)}`);
for (const name of ONLY) {
  const acc = { deepest: 0, sunkFrames: 0, bashes: 0, stuckS: 0, landed: 0, total: 0, first: [], last: [] };
  for (const seed of SEEDS) {
    const r = await SCENES[name](seed);
    acc.deepest = Math.max(acc.deepest, r.deepest);
    acc.sunkFrames += r.sunkFrames;
    acc.bashes += r.bashes;
    acc.stuckS += r.stuckS;
    acc.landed += r.landed;
    acc.total += r.total;
    if (r.first !== null) acc.first.push(r.first);
    acc.last.push(r.last);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  out[name] = acc;
  console.log(
    `${pad(name, 9)}${pad(acc.deepest.toFixed(1), 9)}${pad(String(acc.sunkFrames), 9)}${pad(String(acc.bashes), 6)}`
    + `${pad(acc.stuckS.toFixed(1), 7)}${pad(`${acc.landed}/${acc.total}`, 7)}${pad(f1(avg(acc.first)), 7)}${pad(f1(avg(acc.last)), 9)}`,
  );
}
if (JSON_OUT) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(JSON_OUT, JSON.stringify({ secs: SECS, seeds: SEEDS, nocollide: NOCOLLIDE, out }, null, 1));
  console.log(`\n写入 ${JSON_OUT}`);
}
