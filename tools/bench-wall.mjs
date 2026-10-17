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
 *   · `dashwall` —— **玩家自己**朝墙冲刺（v86）。量的是"这一发冲刺有多少帧是白压在墙上的、
 *                  撞完按住反方向多久能走开 30px"。怪那边 v84 早就有了交代，玩家这边到 v85
 *                  还是不声不响的：冲刺是拿来躲的，撞墙该收掉的是这一次冲刺，不是把人钉在那里。
 *   · `dashfree` —— 同一发冲刺，在**空地**上跑满，然后按住反方向（v87）。这一栏量的是冲刺**正常跑完**
 *                  那一下的收力：残余速度是走速的 3.4 倍（748px/s），手上那个方向键要多久才扳得回来。
 *                  v87 之前它是 20 帧（0.33 秒），而"撞墙收掉冲刺"那一发（`dashwall`，速度清零）
 *                  第 1 帧就能动——同一件事两套手感，这一栏就是拿来盯这个的。
 *   · `dashege` —— 同一发冲刺，改朝**场地边界**冲。这一栏是 `dashwall` 的对照组，**不用改代码**：
 *                  `clampToArena` 一样把人拦住，但这条规矩（`Game.update` 里那一段）明写只看墙、
 *                  不看边界——所以它量出来的就是"改前"那套空转（冲刺照旧跑满 0.18 秒、人压在线外不动）。
 *                  两栏放在同一份产物里跑，差的那几帧就是这条规矩挣来的。
 *   · `selflight`（v88）—— **你自己身上那两圈火**隔着墙还烫不烫得到。燎灯与环形火环是全场
 *                  最后两件穿墙的东西（子弹进墙判死、光矛停在墙面、怪绕着墙走），这一栏量的就是
 *                  那一刀：同一只怪、同一个距离，只差"墙在中间 / 墙在旁边 / 没有墙"。
 *                  期望是 **81.0 / 0.0 / 81.0**（燎灯）与 **48.6 / 0.0 / 48.6**（火环）——
 *                  "墙在旁边"那一格必须与"没有墙"**逐位相同**：这一刀只该管那条直线。
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
const ONLY = (args.get('only') ?? 'block,pocket,bash,wide,selflight,dashwall,dashfree,dashege').split(',');
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

/**
 * 玩家冲刺的那两个场景（见文件头）。不走 `run()`：量的是**玩家自己**身上那几帧，没有怪。
 *
 * 每一栏都从"**撞上那一帧**"起算，而不是等它跑完再统计：撞上墙的人会当场往回推杆，
 * 量的是那一推推不动的帧数。三栏：
 *   · 停下(帧)   —— 从起步到"撞上 / 跑完"用了几个物理帧（一发冲刺 0.18s = 10~11 帧，满速一帧 12.47px）；
 *   · 停时冲刺   —— 停下那一刻冲刺还剩多少秒。撞墙那种是 0（被收掉）；空地上跑满那种也是 0
 *                  （自己跑完）；场地边界那一种是 0.08——边界拦得住人，但那条规矩明写不管它，
 *                  所以冲刺照旧跑完。这一列把"收掉冲刺"与"没收到"分开给你看。
 *   · 起步(帧)   —— 停下之后立刻按住反方向，第几帧开始往回动（停下那一帧之后的帧数）；
 *   · 走开30px   —— 从撞上到离墙面 30px 用了多少帧（上限 60 帧）；
 *   · 这一发走了 / 响了几声。
 */
async function runDash(seed, tag, kind) {
  const { game, p } = await open(seed, tag);
  let bashes = 0;
  const realPlay = game.audio.play.bind(game.audio);
  game.audio.play = (n) => {
    if (n === 'bash') bashes += 1;
    return realPlay(n);
  };
  // 撞墙 / 撞边界这两种摆法是**对称**的：都是"离挡路的那一面 60px 处起步、正对它冲"
  //（冲刺一帧 12.47px，所以撞上那一下落在第 5 帧左右、冲刺还剩一半），差的那一半就是那条规矩管的那一段。
  // `dashfree` 前头什么都没有：让它把 0.18 秒跑满，量"跑完那一刻"的收力。
  const wall = { x: -200, y: -140, w: 400, h: 80 };
  if (kind === 'wall') game.level.walls.push(wall);
  const fromY = kind === 'wall' ? -214 : kind === 'edge' ? -(900 - p.radius - 60) : 0;
  p.x = 0;
  p.y = fromY;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  p.invuln = 0;
  const dy = kind === 'edge' ? -1 : 1; // 墙在 +y 侧，边界在 -y 侧，空地那一种朝场地里侧走
  const tick = (moveY, dash) => {
    p.hp = 1e9;
    p.oil = p.oilMax;
    game.hitStop = 0;
    game.setInput(0, moveY, dash, false);
    game.update(dt);
  };
  // ① 冲上去，直到某一帧"沿冲刺方向几乎没动"（那就是撞上了；满速一帧 12.47px）。
  //    `dashfree` 没有东西可撞，终点换成同一个意思：这一发自己跑完（`dashTimer` 归零）。
  let contactAt = 0;
  for (let i = 0; i < 30; i += 1) {
    const before = p.y;
    tick(dy, i === 0);
    contactAt += 1;
    if (kind === 'free' ? p.dashTimer <= 0 : (p.y - before) * dy < 1) break;
  }
  const along = (p.y - fromY) * dy;
  const dashLeft = p.dashTimer; // 撞上那一刻冲刺还剩多少秒（改前这一段是白熬的）
  const contactY = p.y;
  // ② 撞上之后**当场**按住反方向：第几帧开始动、走开 30px 用几帧
  let startFrame = -1;
  let framesTo30 = -1;
  for (let i = 1; i <= 60; i += 1) {
    tick(-dy, false);
    const away = (p.y - contactY) * -dy;
    if (startFrame < 0 && away > 0.01) startFrame = i;
    if (away >= 30) {
      framesTo30 = i;
      break;
    }
  }
  return { contactAt, dashLeft: Math.max(0, dashLeft), startFrame, framesTo30, along, bashes };
}

const DASH_SCENES = {
  dashwall: (seed) => runDash(seed, 'dashwall', 'wall'),
  dashfree: (seed) => runDash(seed, 'dashfree', 'free'),
  dashege: (seed) => runDash(seed, 'dashege', 'edge'),
};

/**
 * 「自己身上那两圈火」那一栏（v88，见文件头）。量的是**这几件武器打出去多少**，不是玩家自己身上那几帧，
 * 所以也不走 `run()`：一只靶（石守，厚血、站着不动）钉在固定距离上，武器换一件、墙换一种摆法。
 *
 * 每一格都从**零**开始：武器自己的钟表（燎灯那一拍的心跳、火环转到哪儿、每只怪的命中冷却）
 * 必须清掉，不然读数里混着上一格剩的冷却——实测（同一件武器连跑两次）燎灯会读出 12 拍 / 11 拍，
 * 而这一栏要的正是"只差一样东西、读数该逐位相同"。
 */
const LIGHT_CONF = {
  none: [],
  mid: [{ x: -60, y: -300, w: 20, h: 600 }],
  beside: [{ x: 300, y: -300, w: 20, h: 600 }],
};

async function runLight(seed, id, kind) {
  const { game, p } = await open(seed, `light-${id}-${kind}`);
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  const ex = id === 'aura' ? -280 : -105;
  game.level.walls.length = 0;
  for (const w of LIGHT_CONF[kind]) game.level.walls.push(w);
  game.enemies.clear();
  const e = game.enemies.spawn('bulwark', ex, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.spawnTimer = 0;
  e.speed = 0;
  p.weapons.clear();
  p.relics.clear();
  p.weapons.set(id, 1);
  p.recomputeStats();
  p.stats.critChance = 0; // 暴击是掷骰子的，这一栏要的是"墙挡了多少"这一个数
  p.stats.critMult = 1;
  p.auraCd = 0;
  p.orbit.angle = 0;
  p.orbit.hitCooldown.clear();
  p.cooldowns.clear();
  let lost = 0;
  for (let i = 0; i < 300; i += 1) {
    e.hp = 1e9;
    e.x = ex;
    e.y = 0;
    e.speed = 0;
    e.vx = 0;
    e.vy = 0;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.hp = 1e6;
    p.oil = p.oilMax;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
    lost += 1e9 - e.hp;
  }
  return lost;
}

const pad = (s, n) => String(s).padEnd(n);
const f1 = (v) => (v === null ? '—' : v.toFixed(1));
const out = {};
console.log(`墙台架：${SEEDS.length} 颗种子 · 每场 ${SECS}s 游戏时间${NOCOLLIDE ? ' · 对照组（怪穿墙）' : ''}`);
console.log(`${pad('场景', 9)}${pad('陷进最深', 9)}${pad('陷进去帧', 9)}${pad('撞停', 6)}${pad('白给', 7)}${pad('贴上', 7)}${pad('首只', 7)}${pad('最后一只', 9)}`);
for (const name of ONLY.filter((n) => SCENES[n])) {
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
if (ONLY.includes('selflight')) {
  console.log('');
  console.log(`${pad('自己身上的火', 12)}${pad('无墙', 9)}${pad('隔着墙', 9)}${pad('墙在旁边', 9)}`);
  for (const [id, name] of [['aura', '燎灯'], ['ring', '环形火环']]) {
    const cells = [];
    for (const kind of ['none', 'mid', 'beside']) {
      let acc = 0;
      for (const seed of SEEDS) acc += await runLight(seed, id, kind);
      cells.push(acc / SEEDS.length);
    }
    out[`selflight-${id}`] = { none: cells[0], mid: cells[1], beside: cells[2] };
    console.log(`${pad(name, 12)}${pad(cells[0].toFixed(1), 9)}${pad(cells[1].toFixed(1), 9)}${pad(cells[2].toFixed(1), 9)}`);
  }
}
const DASH_ONLY = ONLY.filter((n) => DASH_SCENES[n]);
if (DASH_ONLY.length) {
  console.log('');
  console.log(`${pad('场景', 9)}${pad('停下(帧)', 9)}${pad('停时冲刺', 10)}${pad('起步(帧)', 9)}${pad('走开30px', 9)}${pad('这一发走了', 11)}${pad('响', 4)}`);
  for (const name of DASH_ONLY) {
    const acc = { contactAt: 0, dashLeft: 0, startFrame: 0, framesTo30: 0, along: 0, bashes: 0 };
    for (const seed of SEEDS) {
      const r = await DASH_SCENES[name](seed);
      acc.contactAt += r.contactAt;
      acc.dashLeft += r.dashLeft;
      acc.startFrame += r.startFrame;
      acc.framesTo30 += r.framesTo30 < 0 ? 0 : r.framesTo30;
      acc.along += r.along;
      acc.bashes += r.bashes;
    }
    const n = SEEDS.length;
    out[name] = acc;
    console.log(
      `${pad(name, 9)}${pad((acc.contactAt / n).toFixed(1), 9)}${pad((acc.dashLeft / n).toFixed(3), 10)}`
      + `${pad((acc.startFrame / n).toFixed(1), 9)}${pad((acc.framesTo30 / n).toFixed(1), 9)}`
      + `${pad((acc.along / n).toFixed(1), 11)}${pad(String(acc.bashes), 4)}`,
    );
  }
}
if (JSON_OUT) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(JSON_OUT, JSON.stringify({ secs: SECS, seeds: SEEDS, nocollide: NOCOLLIDE, out }, null, 1));
  console.log(`\n写入 ${JSON_OUT}`);
}
