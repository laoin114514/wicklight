/**
 * 「你往哪儿走，它就往哪儿吐」（v91）回归测试。
 *
 * 喷糜者是这游戏里**唯一的远程怪**，而到 v90 为止它瞄的是"你现在站的地方"。
 * 它站 220px 上开火、弹速 250px/s → 飞行时间接近一秒；你随便走两步，那一口就落在你身后。
 * 量化（`tools/bench-wall.mjs --only=spitaim`，4 颗种子 × 10 个出手周期）：
 *   站着不动 **40 发 40 中**；一头直线跑（160px/s）**只中 1 发**（那 1 发还是地图上落下来的陨火）。
 * 也就是说这件唯一的远程武器，对任何会动的玩家等于不存在。
 *
 * 这一版给它加上预判：瞄"你现在这个速度、飞完这一程之后你会到的地方"，
 * 但只押**速度**、而且只押这一程——所以边界正好是"**改方向就躲得掉**"：
 *   直线跑 → 必中（它押对了）；拐 90° / 急停 / 折线 → 一发不中（它押的还是你原来的那条路）。
 * 这一条很重要：走位是这游戏里唯一握着的东西，预瞄要是变成"必中"，那这个技巧就没了。
 *
 * 两个数各管一件事，用例里都钉着：
 *   ① 押的是**距离 ÷ 弹速**那么长的一程——所以站得远它照样够不着（`SPIT_LEAD_MAX` 封顶：220px）；
 *   ② 只接在"瞄着你打的那一口"上：首领「焚天」的**环形齐射**照旧不看你的速度
 *      （它炸的是"一圈"，不是"追着你的头打"）。它顺带那两发"瞄着你打的"走同一条代码，
 *      所以跟着一起预瞄——这正是这一条该有的样子：规矩落在"瞄着你"这件事实上，不是落在某只怪身上。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 它的一个出手周期：窗首正好开火，窗尾把场地摆回原样（免得把上一发的余弹算进这一窗）。 */
const WINDOW = 2.1;
/** 脚本玩家的速度（px/s）：和台架里"守着交战距离"那套是同一个量级。 */
const SP = 160;

/**
 * 钉住骰子：首领那圈弹幕的**相位**来自生成时抽的那一次 `Math.random()`。
 * 不钉住的话，"站着"与"直线跑"两遍抽到的相位本来就不一样，角度全配不上对，
 * 那条钉子量的就成了骰子而不是规则（台架里也是这么钉的）。
 */
function seed(n) {
  let s = n >>> 0;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=lead-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.hazards.length = 0;
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return { game, p };
}

/**
 * 走位图案：每帧把玩家摆到该在的地方（绕过输入，量的是纯几何）。
 * 出发点在 (0, -170)——斜对着那只怪，一窗 336px 不会跑出地图。
 *
 * `t` 是这一窗里的秒数。**四个图案只在"开火之后有没有改方向"上不同**：
 *   - `run`  → 从头发到尾一个速度（它押得中）；
 *   - `turn` → 前 0.35s 往 +y，之后 90° 拐向 -x（正对着它那一侧拐，对玩家最不利的那种拐）；
 *   - `stop` → 前 0.35s 往 +y，之后原地不动；
 *   - `zig`  → 0.6s 一条腿、侧向摆 ±96px（比命中半径 21px 大一个量级）。
 */
function pose(pattern, t) {
  if (pattern === 'stand') return { x: 0, y: 0, vx: 0, vy: 0 };
  if (pattern === 'run') return { x: 0, y: -170 + SP * t, vx: 0, vy: SP };
  if (pattern === 'turn') {
    if (t < 0.35) return { x: 0, y: -170 + SP * t, vx: 0, vy: SP };
    return { x: -SP * (t - 0.35), y: -170 + SP * 0.35, vx: -SP, vy: 0 };
  }
  if (pattern === 'stop') {
    if (t < 0.35) return { x: 0, y: -170 + SP * t, vx: 0, vy: SP };
    return { x: 0, y: -170 + SP * 0.35, vx: 0, vy: 0 };
  }
  const leg = 0.6;
  const seg = Math.floor(t / leg);
  const local = t - seg * leg;
  let x = 0;
  for (let i = 0; i < seg; i += 1) x += (i % 2 === 0 ? 1 : -1) * SP * leg;
  const dir = seg % 2 === 0 ? 1 : -1;
  return { x: x + dir * SP * local, y: -170 + SP * 0.35, vx: dir * SP, vy: 0 };
}

/**
 * 跑 `cycles` 个出手周期，数它开了几枪、打中你几次。
 * 计数的是**这个场上唯一的伤害源**（`source === id`）——所以"命中"就是"那一口有没有落在你身上"。
 */
async function volleys(game, p, { pattern, cycles = 10, x = -250, id = 'spitter' } = {}) {
  seed(7);
  game.enemies.clear();
  game.projectiles.clear();
  const e = game.enemies.spawn(id, x, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  let shots = 0;
  let hits = 0;
  const angles = [];
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer) {
      shots += 1;
      angles.push(Math.atan2(q.vy, q.vx));
    }
    return realSpawn(q);
  };
  const realDamage = game.damagePlayer.bind(game);
  game.damagePlayer = (a, hx, hy, drain, src) => {
    if (src === id) hits += 1;
    return realDamage(a, hx, hy, drain, src);
  };
  for (let c = 0; c < cycles; c += 1) {
    e.x = x;
    e.y = 0;
    e.vx = 0;
    e.vy = 0;
    e.attackCd = 0;
    e.bossCd = 0;
    game.projectiles.clear();
    for (let i = 0; i < Math.round(WINDOW / dt); i += 1) {
      const at = pose(pattern, i * dt);
      p.x = at.x;
      p.y = at.y;
      p.vx = at.vx;
      p.vy = at.vy;
      p.hp = 1e6;
      p.oil = p.oilMax;
      game.hitStop = 0;
      game.setInput(0, 0, false, false);
      game.update(dt);
    }
  }
  game.projectiles.spawn = realSpawn;
  game.damagePlayer = realDamage;
  return { shots, hits, angles };
}

/** 两个角度之间的圆周距离。 */
function circDist(a, b) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
}

/** 两组角度里配不成对的各有多少（环形弹幕"换个速度就整圈转过去"会被这一条抓住）。 */
function unmatched(a, b, eps = 1e-9) {
  const rest = [...b];
  let bad = 0;
  for (const ang of a) {
    const i = rest.findIndex((x) => circDist(x, ang) < eps);
    if (i >= 0) rest.splice(i, 1);
    else bad += 1;
  }
  return bad + rest.length;
}

test('站着不动：一个字都不变——你没速度，它就没有什么好押的', async (t) => {
  const { game, p } = await open(t, 'stand');
  const stand = await volleys(game, p, { pattern: 'stand' });
  assert.equal(stand.shots, 10, `10 个出手周期就是 10 枪：${stand.shots}`);
  assert.equal(stand.hits, 10, `站定在 250px 上，枪枪都该落在你身上：${stand.hits}`);
});

test('一头直线跑：它押的就是你这条路，改前那一发是打在你身后的', async (t) => {
  const { game, p } = await open(t, 'run');
  const run = await volleys(game, p, { pattern: 'run' });
  assert.equal(run.shots, 10, `照旧 10 个出手周期 10 枪：${run.shots}`);
  assert.equal(run.hits, 10, `直线跑（160px/s）现在会被预判到：10 发该中 10 发，实际 ${run.hits}`);
});

test('改方向就躲得掉：拐 90° / 急停 / 折线，一发都不中', async (t) => {
  const { game, p } = await open(t, 'dodge');
  for (const pattern of ['turn', 'stop', 'zig']) {
    const r = await volleys(game, p, { pattern });
    assert.equal(r.shots, 10, `${pattern}：它照旧每个周期开一枪（${r.shots}）`);
    assert.equal(r.hits, 0, `${pattern}：它押的是"你还照原样走"，你却改了方向——一发都不该中（实际 ${r.hits}）`);
  }
});

test('押的只是"这一程"：450px 外开火时只押 220px（量的是弹道本身，不是结果）', async (t) => {
  const { game, p } = await open(t, 'cap');
  seed(7);
  game.enemies.clear();
  game.projectiles.clear();
  const e = game.enemies.spawn('spitter', -450, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.attackCd = 0;
  let shot = null;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer && !shot) {
      shot = {
        angle: Math.atan2(q.vy, q.vx),
        pvx: p.vx,
        pvy: p.vy,
        dx: p.x - e.x,
        dy: p.y - e.y,
      };
    }
    return realSpawn(q);
  };
  const at = pose('run', 0);
  p.x = at.x;
  p.y = at.y;
  p.vx = at.vx;
  // 这一格故意把速度要到 320px/s（游戏自己的手感会把这一帧压到 262）：不是为了模拟真人，
  // 而是要让"封顶"在这一帧里差出三十度——160px/s 时它只差四度，那条断言就成了噪声。
  p.vy = 320;
  p.hp = 1e6;
  p.oil = p.oilMax;
  game.hitStop = 0;
  game.setInput(0, 0, false, false);
  game.update(dt);
  assert.ok(shot, '450px 还在它的射程（520px）里，这一帧该开火');
  // 它这一帧读到的就是开火那一刻的速度：飞行时间 × 速度，最多 220px
  const flight = Math.hypot(shot.dx, shot.dy) / 250;
  const rawLen = Math.hypot(shot.pvx, shot.pvy) * flight;
  assert.ok(rawLen > 220, `这一格得让封顶真的说话（不封顶要押 ${rawLen.toFixed(0)}px）`);
  const capped = Math.atan2(shot.dy + (shot.pvy / Math.hypot(shot.pvx, shot.pvy)) * 220, shot.dx + (shot.pvx / Math.hypot(shot.pvx, shot.pvy)) * 220);
  const uncapped = Math.atan2(shot.dy + shot.pvy * flight, shot.dx + shot.pvx * flight);
  assert.ok(Math.abs(shot.angle - capped) < 1e-6, `弹道该落在"押 220px"那个角上：实测 ${((shot.angle * 180) / Math.PI).toFixed(2)}°，该是 ${((capped * 180) / Math.PI).toFixed(2)}°`);
  assert.ok(Math.abs(shot.angle - uncapped) > 0.05, `不封顶的话角度会差出一大截（${((uncapped * 180) / Math.PI).toFixed(2)}°）`);
});

test('钉子：首领的环形齐射照旧不看你的速度（它炸的是"一圈"，不是"追着你的头打"）', async (t) => {
  const { game, p } = await open(t, 'boss');
  // 同一只首领、同一批帧、同一颗种子：只把玩家的走位从"站着"换成"直线跑"。
  // 一窗 17 发 = 16 发环 + 1 发"瞄着你打的"（量出来的：w0 就有 17 发）。
  // 只有那一发该跟着变——要是有人把整圈也接上预瞄，换一个速度就是 16 个角度一起转过去。
  const cycles = 3;
  const stand = await volleys(game, p, { pattern: 'stand', id: 'emberwake', cycles });
  const run = await volleys(game, p, { pattern: 'run', id: 'emberwake', cycles });
  assert.equal(stand.shots, run.shots, `两遍的开火数该一样：${stand.shots} vs ${run.shots}`);
  assert.equal(stand.shots, cycles * 17, `一窗 16 发环 + 1 发瞄着的：${stand.shots}`);
  const bad = unmatched(stand.angles, run.angles);
  assert.ok(bad <= cycles * 2, `每窗只该有那一发"瞄着你打的"配不上对（三窗最多 6 个）——实际 ${bad} 个（整圈被接上预瞄的话会是一窗 16 个）`);
});
