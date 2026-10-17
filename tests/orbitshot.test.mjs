/**
 * 「绕圈也会被预判」（v93）回归测试。
 *
 * v91 只押**一阶速度**：枪口落在你这一秒的切线上。直线跑因此必中，可绕着喷糜者转圈时，
 * 半径一大，圆弧就从那条切线旁边绕开——`bench:wall` 的连续绕圈读数在 v92 是：
 *   r=180 **40/40**、r=220/260/300 **0/40**。
 * 也就是说“贴着远程怪转圈”成了这个游戏里最省事的免伤姿势，而它恰好也是台架机器人默认的走法。
 *
 * v93 读玩家这一帧的**横向加速度**：`cross(v,a)/|v|²` 是当前转向的角速度，
 * 乘上飞行时间就是这一程会转过的弧角；弦的方向是切线转过**一半弧角**。
 * 只把已经算好的 lead 向量原地转那半个弧角。
 *
 * 四条边界钉在这里：
 *   ① 稳定绕圈：r=180 / 220 / 260 / 300，每格 10 发全中；
 *   ② 改方向就躲得掉：绕到一半折返（0.7s 一换向）仍然 10 发 0 中；
 *   ③ 急拐不会被当成“你会一直这么弯”：折返那一下的横向加速度是上万，被上限丢掉；
 *   ④ 站着不动一个字不变（没有速度就没有切线，也没有曲率可读）。
 *
 * 慢速脚本玩家的速度取房间里的 `p.stats.moveSpeed`（本局是 220px/s），
 * 每一帧直接摆位置与输入，量的是纯几何，不靠键位重放。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 它的一个出手周期；10 个周期之后再留 1 秒，让第 10 发飞完。 */
const WINDOW = 2.1;
const CYCLE_PAD = 1.0;

function seed(n) {
  let s = n >>> 0;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=orbit-${tag}-${Date.now()}-${Math.random()}`);
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
  game.grounds.length = 0;
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.level.halfW = 10000;
  game.level.halfH = 10000;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return { game, p };
}

/**
 * 每帧摆位：绕喷糜者（它的坐标就是圆心）转圈，或绕到一半开始反复折返。
 * `r=300` 的折返是那一条“改了方向就该躲掉”的边界——它每 0.7s 把切向整个翻过来。
 */
function pose(pattern, t, ex, ey, speed) {
  if (pattern === 'stand') return { x: ex + 250, y: ey, vx: 0, vy: 0, ix: 0, iy: 0 };
  const m = /^orbit(\d+)$/.exec(pattern);
  const r = m ? Number(m[1]) : 300;
  const leg = 0.7;
  const base = -Math.PI / 2;
  if (pattern.startsWith('juke')) {
    const full = Math.floor(t / leg);
    const local = t - full * leg;
    let a = base;
    const step = (speed / r) * leg;
    for (let i = 0; i < full; i += 1) a += (i % 2 === 0 ? 1 : -1) * step;
    const dir = full % 2 === 0 ? 1 : -1;
    a += dir * (speed / r) * local;
    const ix = -Math.sin(a) * dir;
    const iy = Math.cos(a) * dir;
    return { x: ex + Math.cos(a) * r, y: ey + Math.sin(a) * r, vx: ix * speed, vy: iy * speed, ix, iy };
  }
  const a = base + (speed / r) * t;
  const ix = -Math.sin(a);
  const iy = Math.cos(a);
  return { x: ex + Math.cos(a) * r, y: ey + Math.sin(a) * r, vx: ix * speed, vy: iy * speed, ix, iy };
}

/** 连续跑 10 个出手周期（不逐窗归位——加速度要跨帧读，归位会造出假的曲率）。 */
async function volleys(game, p, pattern, cycles = 10) {
  seed(7);
  game.enemies.clear();
  game.projectiles.clear();
  const ex = -250;
  const ey = 0;
  const e = game.enemies.spawn('spitter', ex, ey, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  let shots = 0;
  let hits = 0;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer) shots += 1;
    return realSpawn(q);
  };
  const realDamage = game.damagePlayer.bind(game);
  game.damagePlayer = (amount, hx, hy, drain, source) => {
    if (source === 'spitter') hits += 1;
    return realDamage(amount, hx, hy, drain, source);
  };
  const total = Math.round((cycles * WINDOW + CYCLE_PAD) / dt);
  for (let i = 0; i < total; i += 1) {
    const at = pose(pattern, i * dt, ex, ey, p.stats.moveSpeed);
    p.x = at.x;
    p.y = at.y;
    p.vx = at.vx;
    p.vy = at.vy;
    p.hp = 1e6;
    p.oil = p.oilMax;
    game.hitStop = 0;
    game.setInput(at.ix, at.iy, false, false);
    game.update(dt);
    e.hp = 1e9;
  }
  game.projectiles.spawn = realSpawn;
  game.damagePlayer = realDamage;
  return { shots, hits };
}

test('稳定绕圈不再免疫：r=180 / 220 / 260 / 300 都是 10 发 10 中', async (t) => {
  const { game, p } = await open(t, 'orbits');
  for (const pattern of ['orbit180', 'orbit220', 'orbit260', 'orbit300']) {
    const r = await volleys(game, p, pattern);
    assert.equal(r.shots, 10, `${pattern}：10 个周期该开 10 枪（${r.shots}）`);
    assert.equal(r.hits, 10, `${pattern}：一直顺着同一个弯走，10 发都该落在你身上（${r.hits}）`);
  }
});

test('改方向还是躲得掉：绕到一半反复折返，10 发 0 中', async (t) => {
  const { game, p } = await open(t, 'juke');
  const r = await volleys(game, p, 'juke300');
  assert.equal(r.shots, 10, `折返不影响它出手：${r.shots}`);
  assert.equal(r.hits, 0, `它押的是“你还顺着这个弯走”，可你翻向了——10 发都不该中（${r.hits}）`);
});

test('站着不动一个字不变：没有速度就没有切线，也没有曲率可读', async (t) => {
  const { game, p } = await open(t, 'stand');
  const r = await volleys(game, p, 'stand');
  assert.equal(r.shots, 10, `10 个周期就是 10 枪：${r.shots}`);
  assert.equal(r.hits, 10, `站定在 250px 上，枪枪都该落在你身上：${r.hits}`);
});

test('弹道量的是半个弧角：r=260 那一帧的角度就是切线转过 0.44rad', async (t) => {
  const { game, p } = await open(t, 'angle');
  seed(7);
  game.enemies.clear();
  game.projectiles.clear();
  const ex = -250;
  const ey = 0;
  const e = game.enemies.spawn('spitter', ex, ey, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.spawnTimer = 0;
  e.attackCd = 0;
  // 这一格直接把“这一帧的读数”摆好，不靠跑圈去凑：
  // 人在圆的正下方（r=260），速度 +x，横向加速度 +y（朝圆心）。
  const r = 260;
  const speed = 220;
  const flight = r / 250;
  const realCtx = game.enemyCtx.bind(game);
  game.enemyCtx = () => {
    const c = realCtx();
    c.px = ex;
    c.py = ey - r;
    c.pvx = speed;
    c.pvy = 0;
    c.pax = 0;
    c.pay = speed * speed / r;
    return c;
  };
  let shot = null;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer && !shot) shot = q;
    return realSpawn(q);
  };
  p.x = ex;
  p.y = ey - r;
  p.vx = speed;
  p.vy = 0;
  p.hp = 1e6;
  p.oil = p.oilMax;
  game.hitStop = 0;
  game.setInput(0, 0, false, false);
  game.update(dt);
  game.projectiles.spawn = realSpawn;
  game.enemyCtx = realCtx;
  assert.ok(shot, '这一帧该开火');
  const lead = speed * flight; // 228.8 < 曲率押程上限 340，没有被截短
  const turn = (speed / r) * flight * 0.5;
  const aimX = lead * Math.cos(turn);
  const aimY = -r + lead * Math.sin(turn);
  const angle = Math.atan2(shot.vy, shot.vx);
  const want = Math.atan2(aimY, aimX);
  assert.ok(
    Math.abs(angle - want) < 1e-6,
    `枪口要落在“切线转过半弧角”那个方向：实际 ${((angle * 180) / Math.PI).toFixed(2)}°，该是 ${((want * 180) / Math.PI).toFixed(2)}°`,
  );
});
