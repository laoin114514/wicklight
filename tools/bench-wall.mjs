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
 *   · `aimpick`（v89）—— **索敌挑谁**：墙后面那只更近（(-150,0)）、看得见的那只更远（(0,150)），
 *                  自动瞄准该把子弹递给谁。三格与 `selflight` 同一套摆法（无墙 / 墙在中间 / 墙在旁边）：
 *                  期望是 **180.0 / 90.0 / 180.0**（度），挨打也跟着翻——"隔着墙"那一格是
 *                  墙后那只 **0.0**、看得见的那只 **27.0**；另外两格逐位相同（都是墙后那只 27.0）。
 *                  这一栏是"读数为什么值得改"的现场：改前（v88）三格**都是 180.0**，子弹全打在墙上。
 *   · `spitblind`（v90）—— **隔着墙的喷糜者**：它站的位置正好落在自己那个"保持距离"的档里
 *                  （250px，档位是 180~260px），墙在两人中间。三格与 `selflight` 同一套摆法
 *                  （无墙 / 墙在中间 / 墙在旁边），量的是 20 秒游戏时间里：**它开了几枪 / 命中你几次 /
 *                  它挪了多远**。期望是——无墙与"墙在旁边"两格逐位相同（9 / 9 / 站着不动），
 *                  "墙在中间"那一格改后是 **4 / 4 / 挪 314.2px**（改前是 **9 / 0 / 一动不动**：
 *                  那一梭子全打在墙面上）。这一栏量的不是"伤害多少"，是**它有没有在打墙**。
 *   · `spitaim`（v91）—— **那一口打的是"你在的地方"还是"你要去的地方"**：五种走位、每种十个出手周期，
 *                  量它开了几枪、打中你几次。五个图案**只在"开火之后有没有改方向"上不同**：
 *                  `stand` 站着 / `run` 一头直线跑 / `turn` 开火后 0.35s 拐 90° / `stop` 开火后 0.35s 急停 /
 *                  `zig` 0.6s 一条腿、侧向摆 ±96px。改前（v90）只有"站着"会挨打（40 发 40 中），
 *                  另外四种全是 40 发 1 中（那一发还是地图上落下来的陨火）；改后 `run` 追平 40 发 40 中，
 *                  而拐弯 / 急停 / 折线照旧一发不中——**"改方向就躲得掉"是这一版的判据**。
 *   · `orbit`（v93，挂在 `spitaim` 下面）—— **稳定绕圈是不是仍然免伤**：v91 的一阶预瞄只会
 *                  押切线，r≥220 的连续绕圈在 v92 是 40 发 0 中；v93 读横向加速度、把弹道
 *                  顺着弯掰半个弧角之后，r=180 / 220 / 260 / 300 每格都该是 40 发 40 中。
 *                  “折返300”那一格每 0.7s 把切向整个翻过来，仍应是 40 发 0 中——
 *                  这一栏量的不是“子弹更快了”，是“只惩罚一直顺着同一个弯走”。
 *   · `spitsplash`（v92）—— **糜液砸在墙上会不会溅到墙背**：从 (96,0) 往 +x 发一颗喷糜者的弹，
 *                  墙在 x=100~120，玩家分别站在无墙（整口 9）/ 贴墙背（38px，半口 4.5）/
 *                  退 20px（58px，0）/ 退 40px（78px，0）/ 第二堵墙背后（48px，0）。
 *                  最后两格是同一件事的两条边界：**离墙一步就安全**，**第二堵墙照旧挡得住**。
 *                  这一栏用同一颗弹、同一帧、同一套伤害读数，种子只影响地图外的随机数。
 *   · `siphon`（v97/98）—— **噬灯魅隔墙还抽不抽得动**：它从 400px 外吊住你，墙在 x=180~230。
 *                  三格与 `selflight` 同一套摆法（无墙 / 隔着墙 / 墙在旁边），量 2 秒内真正
 *                  记到 `snuffLight` 上的油与它压上来多少。期望是 **0.05 / 0 / 0.05** 的油，
 *                  隔着墙那一格还会比另两格多挪一截（先绕过来再抽）。
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
const ONLY = (args.get('only') ?? 'block,pocket,bash,wide,selflight,pyre,aimpick,spitblind,spitaim,spitsplash,siphon,vortex,dashwall,dashfree,dashege').split(',');
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

/**
 * v105：余烬风的灯台庇护。灯台摆在玩家右边 120px，墙换三种摆法；
 * 给身上三层后空跑 2 秒，读回 `emberPyreNear` 与还剩几层。
 * 期望：无墙 / 墙在旁边 → 1 层；墙在中间 → 3 层（灯影不算在光里）。
 */
const PYRE_CONF = {
  none: [],
  mid: [{ x: 50, y: -80, w: 20, h: 160 }],
  beside: [{ x: 0, y: 80, w: 140, h: 20 }],
};

async function runPyreShelter(seed, kind) {
  const { game, p } = await open(seed, `pyre-${kind}`);
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.hp = 1e6;
  p.oil = p.oilMax;
  game.level.walls.length = 0;
  for (const w of PYRE_CONF[kind]) game.level.walls.push(w);
  game.level.pyres.length = 0;
  game.level.pyres.push({ x: 120, y: 0, lit: true, progress: 1, flame: 1 });
  game.emberwindTimer = 0;
  game.embers.length = 0;
  game.emberStacks = 3;
  game.emberPyreT = 1;
  game.director.hazardTimer = 1e9;
  for (let i = 0; i < 120; i += 1) {
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  return { near: game.emberPyreNear ? 1 : 0, stacks: game.emberStacks };
}

/**
 * v89：索敌挑谁。摆两只怪——墙后面那只**更近**（(-150,0)），看得见的那只更远（(0,150)），
 * 站桩打 300 帧，读回瞄准角与"这两只各挨了多少"。
 * 三格的墙和 `selflight` 同一套：`none` 无墙、`mid` 挡在中间、`beside` 摆在旁边。
 * 读数该是 180.0 / 90.0 / 180.0：只有"墙真的在中间"那一格才该换目标，
 * 另外两格必须与"无墙"**逐位相同**（这一刀只该管那条被挡住的直线）。
 */
const AIM_CONF = {
  none: [],
  mid: [{ x: -60, y: -300, w: 20, h: 600 }],
  beside: [{ x: 300, y: -300, w: 20, h: 600 }],
};

async function runAimPick(seed, kind) {
  const { game, p } = await open(seed, `aim-${kind}`);
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  game.level.walls.length = 0;
  for (const w of AIM_CONF[kind]) game.level.walls.push(w);
  game.enemies.clear();
  const near = game.enemies.spawn('bulwark', -150, 0, 1, 1);
  const far = game.enemies.spawn('bulwark', 0, 150, 1, 1);
  for (const e of [near, far]) {
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
    e.spawnTimer = 0;
    e.speed = 0;
  }
  p.weapons.clear();
  p.relics.clear();
  p.weapons.set('shard', 1);
  p.recomputeStats();
  p.stats.critChance = 0; // 同 selflight：暴击是掷骰子的，这一栏要的是"朝谁打"
  p.stats.critMult = 1;
  p.cooldowns.clear();
  p.aimManual = null;
  let lostNear = 0;
  let lostFar = 0;
  for (let i = 0; i < 300; i += 1) {
    for (const [e, x, y] of [[near, -150, 0], [far, 0, 150]]) {
      e.hp = 1e9;
      e.x = x;
      e.y = y;
      e.speed = 0;
      e.vx = 0;
      e.vy = 0;
    }
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.hp = 1e6;
    p.oil = p.oilMax;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
    lostNear += 1e9 - near.hp;
    lostFar += 1e9 - far.hp;
  }
  return { angle: ((p.angle * 180) / Math.PI + 360) % 360, lostNear, lostFar };
}

/**
 * v90：隔着墙的喷糜者。它摆在自己那个"保持距离"档里（250px），墙就在两人中间——
 * 改前它就站在那儿把一梭子全打在墙面上（20 秒 9 枪 0 命中、一步没挪）。
 * 量三个数：**开了几枪**（敌人弹体的生成次数）/ **命中你几次**（`damagePlayer` 被叫到几次）/
 * **它挪了多远**（20 秒后离出发点多远——"压过来"这件事的唯一证据）。
 * 这个场上只有它会伤害玩家，所以前两个数就是"打在墙上"与"打在你身上"的直读。
 */
const SPIT_CONF = {
  none: [],
  mid: [{ x: -110, y: -300, w: 20, h: 600 }],
  beside: [{ x: 300, y: -300, w: 20, h: 600 }],
};

async function runSpit(seed, kind) {
  const { game, p } = await open(seed, `spit-${kind}`);
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  game.level.walls.length = 0;
  for (const w of SPIT_CONF[kind]) game.level.walls.push(w);
  game.enemies.clear();
  game.projectiles.clear();
  p.x = 0;
  p.y = 0;
  p.oil = p.oilMax;
  const e = game.enemies.spawn('spitter', -250, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  let shots = 0;
  let hits = 0;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  const realDamage = game.damagePlayer.bind(game);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer) shots += 1;
    return realSpawn(q);
  };
  game.damagePlayer = (amount, hx, hy, drain, source) => {
    hits += 1;
    return realDamage(amount, hx, hy, drain, source);
  };
  for (let i = 0; i < 20 * 60; i += 1) {
    p.hp = 1e6;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  game.projectiles.spawn = realSpawn;
  game.damagePlayer = realDamage;
  return { shots, hits, moved: Math.hypot(e.x + 250, e.y) };
}

/**
 * v91：那一口打的是"你在的地方"还是"你要去的地方"。
 *
 * 五个图案**只在"开火之后有没有改方向"上不同**（出发点都是 (0, -170)，斜对着那只怪）：
 *   stand 站着不动 / run 一头直线跑 / turn 开火后 0.35s 拐 90°（正对着它那一侧拐，对玩家最不利）/
 *   stop 开火后 0.35s 急停 / zig 0.6s 一条腿、侧向摆 ±96px（比命中半径 21px 大一个量级）。
 * 十个出手周期（每窗 2.1 秒）：窗首正好开火，窗尾把场地摆回原样——免得把上一发的余弹算进这一窗。
 */
const AIM_PATTERNS = ['stand', 'run', 'turn', 'stop', 'zig'];
const AIM_SP = 160;
const AIM_WINDOW = 2.1;

function aimPose(pattern, t) {
  if (pattern === 'stand') return { x: 0, y: 0, vx: 0, vy: 0 };
  if (pattern === 'run') return { x: 0, y: -170 + AIM_SP * t, vx: 0, vy: AIM_SP };
  if (pattern === 'turn') {
    if (t < 0.35) return { x: 0, y: -170 + AIM_SP * t, vx: 0, vy: AIM_SP };
    return { x: -AIM_SP * (t - 0.35), y: -170 + AIM_SP * 0.35, vx: -AIM_SP, vy: 0 };
  }
  if (pattern === 'stop') {
    if (t < 0.35) return { x: 0, y: -170 + AIM_SP * t, vx: 0, vy: AIM_SP };
    return { x: 0, y: -170 + AIM_SP * 0.35, vx: 0, vy: 0 };
  }
  const leg = 0.6;
  const seg = Math.floor(t / leg);
  const local = t - seg * leg;
  let x = 0;
  for (let i = 0; i < seg; i += 1) x += (i % 2 === 0 ? 1 : -1) * AIM_SP * leg;
  const dir = seg % 2 === 0 ? 1 : -1;
  return { x: x + dir * AIM_SP * local, y: -170 + AIM_SP * 0.35, vx: dir * AIM_SP, vy: 0 };
}

/**
 * v93：绕圈 / 折返。连续跑，不逐窗归位——`Game` 的横向加速度要跨帧读，
 * 每窗把位置摆回起点会造出一个根本不存在的“急拐”。脚本玩家的速度取本局的走速。
 */
const ORBIT_CELLS = [
  { id: 'orbit180', name: '绕圈180', r: 180, juke: false },
  { id: 'orbit220', name: '绕圈220', r: 220, juke: false },
  { id: 'orbit260', name: '绕圈260', r: 260, juke: false },
  { id: 'orbit300', name: '绕圈300', r: 300, juke: false },
  { id: 'juke300', name: '折返300', r: 300, juke: true },
];

function orbitPose(cell, t, ex, ey, speed) {
  const leg = 0.7;
  const base = -Math.PI / 2;
  if (!cell.juke) {
    const a = base + (speed / cell.r) * t;
    const ix = -Math.sin(a);
    const iy = Math.cos(a);
    return { x: ex + Math.cos(a) * cell.r, y: ey + Math.sin(a) * cell.r, ix, iy };
  }
  const full = Math.floor(t / leg);
  const local = t - full * leg;
  let a = base;
  const step = (speed / cell.r) * leg;
  for (let i = 0; i < full; i += 1) a += (i % 2 === 0 ? 1 : -1) * step;
  const dir = full % 2 === 0 ? 1 : -1;
  a += dir * (speed / cell.r) * local;
  const ix = -Math.sin(a) * dir;
  const iy = Math.cos(a) * dir;
  return { x: ex + Math.cos(a) * cell.r, y: ey + Math.sin(a) * cell.r, ix, iy };
}

async function runSpitOrbit(seed, cell) {
  const { game, p } = await open(seed, `spitorbit-${cell.id}`);
  game.enemies.clear();
  game.projectiles.clear();
  game.hazards.length = 0;
  game.grounds.length = 0;
  game.level.walls.length = 0;
  const ex = -250;
  const ey = 0;
  const e = game.enemies.spawn('spitter', ex, ey, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  let shots = 0;
  let hits = 0;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  const realDamage = game.damagePlayer.bind(game);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer) shots += 1;
    return realSpawn(q);
  };
  game.damagePlayer = (amount, hx, hy, drain, source) => {
    if (source === 'spitter') hits += 1;
    return realDamage(amount, hx, hy, drain, source);
  };
  const total = Math.round((10 * AIM_WINDOW + 1.0) / dt);
  for (let i = 0; i < total; i += 1) {
    const at = orbitPose(cell, i * dt, ex, ey, p.stats.moveSpeed);
    p.x = at.x;
    p.y = at.y;
    p.vx = at.ix * p.stats.moveSpeed;
    p.vy = at.iy * p.stats.moveSpeed;
    p.hp = 1e9;
    p.oil = p.oilMax;
    game.hitStop = 0;
    game.setInput(at.ix, at.iy, false, false);
    game.update(dt);
    e.hp = 1e9;
  }
  game.projectiles.spawn = realSpawn;
  game.damagePlayer = realDamage;
  return { shots, hits, speed: p.stats.moveSpeed };
}

async function runSpitAim(seed, pattern) {
  const { game, p } = await open(seed, `spitaim-${pattern}`);
  game.enemies.clear();
  game.projectiles.clear();
  const e = game.enemies.spawn('spitter', -250, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  let shots = 0;
  let hits = 0;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  const realDamage = game.damagePlayer.bind(game);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer) shots += 1;
    return realSpawn(q);
  };
  // 只数它那一口（`source === 'spitter'`）：地图上落下来的陨火是别的账
  game.damagePlayer = (amount, hx, hy, drain, source) => {
    if (source === 'spitter') hits += 1;
    return realDamage(amount, hx, hy, drain, source);
  };
  for (let c = 0; c < 10; c += 1) {
    e.x = -250;
    e.y = 0;
    e.vx = 0;
    e.vy = 0;
    e.attackCd = 0;
    game.projectiles.clear();
    for (let i = 0; i < Math.round(AIM_WINDOW / dt); i += 1) {
      const at = aimPose(pattern, i * dt);
      p.x = at.x;
      p.y = at.y;
      p.vx = at.vx;
      p.vy = at.vy;
      p.hp = 1e9;
      p.oil = p.oilMax;
      game.hitStop = 0;
      game.setInput(0, 0, false, false);
      game.update(dt);
    }
  }
  game.projectiles.spawn = realSpawn;
  game.damagePlayer = realDamage;
  return { shots, hits };
}

/**
 * v92：糜液溅墙。这里不摆怪，直接发一颗喷糜者的弹——这一栏量的是"弹进墙那一帧"
 * 这一条规则本身，不是它隔多久开一枪。弹从 96 出发、墙在 100~120，一帧后就进墙。
 * `playerX` 是玩家圆心：134 = 贴着墙背（身体半径 14），154 = 退开 20px。
 */
const SPLASH_WALL = { x: 100, y: -300, w: 20, h: 600 };
const SPLASH_WALL2 = { x: 120, y: -300, w: 10, h: 600 };
const SPLASH_CELLS = [
  { id: 'open', name: '无墙', x: 134, walls: [] },
  { id: 'hug', name: '贴墙', x: 134, walls: [SPLASH_WALL] },
  { id: 'step20', name: '退20px', x: 154, walls: [SPLASH_WALL] },
  { id: 'step40', name: '退40px', x: 174, walls: [SPLASH_WALL] },
  { id: 'second', name: '第二堵墙', x: 144, walls: [SPLASH_WALL, SPLASH_WALL2] },
];

async function runSpitSplash(seed, cell) {
  const { game, p } = await open(seed, `spitsplash-${cell.id}`);
  game.enemies.clear();
  game.projectiles.clear();
  game.grounds.length = 0;
  game.hazards.length = 0;
  game.level.walls.length = 0;
  for (const w of cell.walls) game.level.walls.push(w);
  p.x = cell.x;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.oil = p.oilMax;
  p.stats.maxHp = 1e9;
  p.hp = 1e9;
  p.invuln = 0;
  p.dashTimer = 0;
  let hits = 0;
  let amount = 0;
  const realDamage = game.damagePlayer.bind(game);
  game.damagePlayer = (a, hx, hy, drain, source) => {
    if (source === 'spitter') {
      hits += 1;
      amount += a;
    }
    return realDamage(a, hx, hy, drain, source);
  };
  game.projectiles.spawn({
    x: 96, y: 0, vx: 250, vy: 0, damage: 9, radius: 7,
    fromPlayer: false, ownerId: 'spitter', maxLife: 3, color: '#c9a3ff',
  });
  for (let i = 0; i < 60; i += 1) {
    p.x = cell.x;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  game.damagePlayer = realDamage;
  return { hits, amount, hpLost: 1e9 - p.hp };
}

const SIPHON_WALL = { x: 180, y: -500, w: 50, h: 1000 };
const SIPHON_CELLS = [
  { id: 'none', name: '无墙', walls: [] },
  { id: 'mid', name: '隔着墙', walls: [SIPHON_WALL] },
  // 同一面墙挪到走廊上方：挡不到 (400,0)→(0,0) 那条线，用来钉住"只该管那条直线"
  { id: 'beside', name: '墙在旁边', walls: [{ x: 180, y: 300, w: 50, h: 500 }] },
];

/** 站桩 2 秒；只数真正进到 `snuffLight` 的那部分油，不受玩家自己烧油影响。 */
async function runSiphon(seed, cell) {
  const { game, p } = await open(seed, `siphon-${cell.id}`);
  game.enemies.clear();
  game.projectiles.clear();
  game.grounds.length = 0;
  game.hazards.length = 0;
  game.level.walls.length = 0;
  for (const w of cell.walls) game.level.walls.push(w);
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.oil = p.oilMax;
  p.stats.maxHp = 1e9;
  p.hp = 1e9;
  const e = game.enemies.spawn('siphon', 400, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.spawnTimer = 0;
  const startX = e.x;
  let snuff = 0;
  const realCtx = game.enemyCtx.bind(game);
  game.enemyCtx = () => {
    const ctx = realCtx();
    const realSnuff = ctx.snuffLight;
    ctx.snuffLight = (amount) => {
      snuff += amount;
      realSnuff(amount);
    };
    return ctx;
  };
  for (let i = 0; i < 120; i += 1) {
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  game.enemyCtx = realCtx;
  return { snuff: snuff / p.oilMax, moved: startX - e.x };
}

/**
 * v116：旋灯的落点、吸力与卷弹认不认墙。三件事共用一张竖墙：
 *   · 落点：从 (-100,0) 往 (200,0) 扔，墙在 x=60~80；灯心该停在墙前 18px（x=42）；
 *   · 吸力：旋灯在原点，墙这一侧的怪该被拽动，墙外那只一步不动；
 *   · 卷弹：墙这一侧的弹幕被中心吞掉，墙外那颗连方向都不该变。
 */
async function runVortexWall(seed, kind) {
  const walled = kind === 'mid';
  const { game, p } = await open(seed, `vortex-${kind}`);
  if (walled) game.level.walls.push({ x: 60, y: -260, w: 20, h: 520 });

  p.x = -100;
  p.y = 0;
  game.placeVortexFrom(p.x, p.y, 200, 0, 20, 200, 0, 0, 'vortex');
  const cast = game.vortexes[0] ?? null;
  const pad = walled && cast ? 60 - cast.x : null;
  game.vortexes.length = 0;

  game.enemies.clear();
  game.projectiles.clear();
  game.placeVortex(0, 0, 20, 500, 0, 1);
  const foe = (x) => {
    const e = game.enemies.spawn('shade', x, 0, 1, 1);
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
    e.spawnTimer = 0;
    e.speed = 0;
    return e;
  };
  const shot = (x) => game.projectiles.spawn({
    x, y: 0, vx: 0, vy: 0, damage: 12, fromPlayer: false, radius: 5, color: '#c9a3ff', maxLife: 20,
  });
  const same = foe(-90);
  const behind = foe(140);
  const sameShot = shot(-90);
  const behindShot = shot(90);
  game.setInput(0, 0, false, false);
  game.update(dt);
  const sameAlive = sameShot.active ? 1 : 0;
  const behindAlive = behindShot.active ? 1 : 0;
  game.projectiles.clear();
  for (let i = 0; i < 30; i += 1) {
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  return {
    pad,
    sameMoved: Math.abs(same.x + 90),
    behindMoved: Math.abs(behind.x - 140),
    sameAlive,
    behindAlive,
  };
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
if (ONLY.includes('vortex')) {
  const cells = [];
  for (const kind of ['none', 'mid']) {
    const acc = { pad: null, sameMoved: 0, behindMoved: 0, sameAlive: 0, behindAlive: 0 };
    for (const seed of SEEDS) {
      const r = await runVortexWall(seed, kind);
      if (r.pad !== null) acc.pad = r.pad;
      acc.sameMoved += r.sameMoved;
      acc.behindMoved += r.behindMoved;
      acc.sameAlive += r.sameAlive;
      acc.behindAlive += r.behindAlive;
    }
    const n = SEEDS.length;
    cells.push({
      pad: acc.pad,
      sameMoved: acc.sameMoved / n,
      behindMoved: acc.behindMoved / n,
      sameAlive: acc.sameAlive / n,
      behindAlive: acc.behindAlive / n,
    });
  }
  console.log('');
  console.log(`${pad('旋灯隔墙（v116）', 18)}${pad('无墙', 9)}${pad('隔着墙', 9)}`);
  const row = (label, vals, digits = 1) => console.log(`${pad(label, 18)}${vals.map((v) => pad(v === null ? '—' : v.toFixed(digits), 9)).join('')}`);
  row('灯心离墙(px)', [null, cells[1].pad]);
  row('同一侧被拽(px)', cells.map((c) => c.sameMoved));
  row('墙后被拽(px)', cells.map((c) => c.behindMoved));
  row('墙后弹幕还在(0/1)', cells.map((c) => c.behindAlive), 0);
  row('同一侧弹幕还在(0/1)', cells.map((c) => c.sameAlive), 0);
  out['vortex-none'] = cells[0];
  out['vortex-mid'] = cells[1];
}
if (ONLY.includes('pyre')) {
  console.log('');
  console.log(`${pad('灯台庇护（v105）', 16)}${pad('无墙', 9)}${pad('隔着墙', 9)}${pad('墙在旁边', 9)}`);
  const near = [];
  const stacks = [];
  for (const kind of ['none', 'mid', 'beside']) {
    let n = 0;
    let s = 0;
    for (const seed of SEEDS) {
      const r = await runPyreShelter(seed, kind);
      n += r.near;
      s += r.stacks;
    }
    near.push(n / SEEDS.length);
    stacks.push(s / SEEDS.length);
    out[`pyre-${kind}`] = { near: n / SEEDS.length, stacks: s / SEEDS.length };
  }
  const row = (label, vals) => console.log(`${pad(label, 16)}${vals.map((v) => pad(v.toFixed(1), 9)).join('')}`);
  row('emberPyreNear', near);
  row('余烬层数(2s后)', stacks);
}
if (ONLY.includes('aimpick')) {
  console.log('');
  console.log(`${pad('索敌挑谁（v89）', 16)}${pad('无墙', 9)}${pad('隔着墙', 9)}${pad('墙在旁边', 9)}`);
  const cell = { angle: [], near: [], far: [] };
  for (const kind of ['none', 'mid', 'beside']) {
    let angle = 0;
    let near = 0;
    let far = 0;
    for (const seed of SEEDS) {
      const r = await runAimPick(seed, kind);
      angle += r.angle;
      near += r.lostNear;
      far += r.lostFar;
    }
    const n = SEEDS.length;
    cell.angle.push(angle / n);
    cell.near.push(near / n);
    cell.far.push(far / n);
    out[`aimpick-${kind}`] = { angle: angle / n, lostNear: near / n, lostFar: far / n };
  }
  const row = (label, vals) => console.log(`${pad(label, 16)}${vals.map((v) => pad(v.toFixed(1), 9)).join('')}`);
  row('瞄准角(°)', cell.angle);
  row('墙后面那只挨了', cell.near);
  row('看得见那只挨了', cell.far);
}
if (ONLY.includes('spitblind')) {
  console.log('');
  console.log(`${pad('隔着墙的喷糜者', 16)}${pad('无墙', 9)}${pad('隔着墙', 9)}${pad('墙在旁边', 9)}`);
  const cell = { shots: [], hits: [], moved: [] };
  for (const kind of ['none', 'mid', 'beside']) {
    let shots = 0;
    let hits = 0;
    let moved = 0;
    for (const seed of SEEDS) {
      const r = await runSpit(seed, kind);
      shots += r.shots;
      hits += r.hits;
      moved += r.moved;
    }
    const n = SEEDS.length;
    cell.shots.push(shots / n);
    cell.hits.push(hits / n);
    cell.moved.push(moved / n);
    out[`spitblind-${kind}`] = { shots: shots / n, hits: hits / n, moved: moved / n };
  }
  const row = (label, vals) => console.log(`${pad(label, 16)}${vals.map((v) => pad(v.toFixed(1), 9)).join('')}`);
  row('它开了几枪(20s)', cell.shots);
  row('命中你几次', cell.hits);
  row('它挪了多远(px)', cell.moved);
}
if (ONLY.includes('spitsplash')) {
  console.log('');
  console.log(`${pad('糜液溅墙（v92）', 16)}${SPLASH_CELLS.map((c) => pad(c.name, 10)).join('')}`);
  const cells = [];
  for (const cell of SPLASH_CELLS) {
    let lost = 0;
    let hits = 0;
    for (const seed of SEEDS) {
      const r = await runSpitSplash(seed, cell);
      lost += r.hpLost;
      hits += r.hits;
    }
    const n = SEEDS.length;
    cells.push(lost / n);
    out[`spitsplash-${cell.id}`] = { damage: lost / n, hits: hits / n };
  }
  console.log(`${pad('你掉的血', 16)}${cells.map((v) => pad(v.toFixed(1), 10)).join('')}`);
}
if (ONLY.includes('siphon')) {
  console.log('');
  console.log(`${pad('噬灯魅（v97/98）', 16)}${SIPHON_CELLS.map((c) => pad(c.name, 9)).join('')}`);
  const snuff = [];
  const moved = [];
  for (const cell of SIPHON_CELLS) {
    let oil = 0;
    let step = 0;
    for (const seed of SEEDS) {
      const r = await runSiphon(seed, cell);
      oil += r.snuff;
      step += r.moved;
    }
    const n = SEEDS.length;
    snuff.push(oil / n);
    moved.push(step / n);
    out[`siphon-${cell.id}`] = { snuff: oil / n, moved: step / n };
  }
  const row = (label, vals) => console.log(`${pad(label, 16)}${vals.map((v) => pad(v.toFixed(3), 9)).join('')}`);
  row('抽走的油(2s)', snuff);
  row('它挪了多远(px)', moved);
}
if (ONLY.includes('spitaim')) {
  console.log('');
  console.log(`${pad('预瞄（v91）', 16)}${AIM_PATTERNS.map((k) => pad({ stand: '站着', run: '直线跑', turn: '拐90°', stop: '急停', zig: '折线' }[k], 9)).join('')}`);
  const cell = { shots: [], hits: [] };
  for (const pattern of AIM_PATTERNS) {
    let shots = 0;
    let hits = 0;
    for (const seed of SEEDS) {
      const r = await runSpitAim(seed, pattern);
      shots += r.shots;
      hits += r.hits;
    }
    const n = SEEDS.length;
    cell.shots.push(shots / n);
    cell.hits.push(hits / n);
    out[`spitaim-${pattern}`] = { shots: shots / n, hits: hits / n };
  }
  const row = (label, vals) => console.log(`${pad(label, 16)}${vals.map((v) => pad(v.toFixed(1), 9)).join('')}`);
  row('它开了几枪', cell.shots);
  row('命中你几次', cell.hits);

  console.log('');
  console.log(`${pad('绕圈预判（v93）', 16)}${ORBIT_CELLS.map((c) => pad(c.name, 9)).join('')}`);
  const orbit = { shots: [], hits: [] };
  for (const c of ORBIT_CELLS) {
    let shots = 0;
    let hits = 0;
    for (const seed of SEEDS) {
      const r = await runSpitOrbit(seed, c);
      shots += r.shots;
      hits += r.hits;
    }
    const n = SEEDS.length;
    orbit.shots.push(shots / n);
    orbit.hits.push(hits / n);
    out[`spitaim-${c.id}`] = { shots: shots / n, hits: hits / n };
  }
  row('它开了几枪', orbit.shots);
  row('命中你几次', orbit.hits);
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
