/**
 * 「冲刺一头撞在墙面上」（v86）回归测试。
 *
 * 到 v85 为止，墙对战场上的三样东西都做实了：怪（`moveWithWalls`：撞墙推出去、沿墙滑、绕过去）、
 * 子弹（进墙判死）、光（`rayWalls`：停在墙面上）。**只有玩家自己撞上去是不声不响的**——
 * 冲刺撞进墙里，人只会觉得"我这下没冲出去"，看不出是自己撞了墙。
 *
 * 这一版给的那一下交代刻意**不是**怪那一份（怪撞墙是撞停 + 发呆 0.55 秒，那是它把一次出手撞掉了；
 * 玩家这边罚站比撞墙本身更难受）：收掉的是**这次冲刺**，控制权当场还给你，
 * 外加一记闷响（借怪撞墙那个 `bash`）、一撮尘、一点点屏震。
 *
 * 要证明的四条：
 *   1. 正面撞墙：冲刺当场收掉（不是自己走完那 0.18 秒）、有声、人没被挤进墙里，而且立刻能走开；
 *   2. 对照组：同样的冲刺在没有墙的地方照旧跑满，而且不响（这一刀不该碰它）；
 *   3. **贴着墙平行冲是满速**：位移与空地那一发逐位相同（墙罚的是路，不是速度——和怪同一条规矩）；
 *   4. **斜着擦上去照旧滑过去**：前进量与空地那一发逐位相同，而且不响（撞的是墙，可你还是在往前走）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 一堵 400×80 的墙横在 (0,-100)：近面 y=-140。 */
const BARRIER = () => ({ x: -200, y: -140, w: 400, h: 80 });

/** 开一局干净的：没有神龛 / 灯台 / 墙 / 怪，只留玩家自己（冲刺那点账全由用例量）。 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=dashwall-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
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
  // 声效记账：这一版的新反馈是"听得见"，所以直接把它数下来
  const sounds = [];
  const real = game.audio.play.bind(game.audio);
  game.audio.play = (n) => {
    sounds.push(n);
    return real(n);
  };
  return { game, p, sounds };
}

function step(game, p, wx, wy, dash) {
  p.hp = 1e6;
  p.oil = p.oilMax;
  game.hitStop = 0;
  game.setInput(wx, wy, dash, false);
  game.update(dt);
}

/** 站在 (x,y)、朝 (wx,wy) 冲一次，跑 frames 帧；返回位移、冲刺帧数、声效、这一路的屏震峰值。 */
function dashRun(game, p, sounds, x, y, wx, wy, frames) {
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  p.invuln = 0;
  const s0 = sounds.length;
  let dashFrames = 0;
  let peakTrauma = game.camera.trauma;
  for (let i = 0; i < frames; i += 1) {
    step(game, p, wx, wy, i === 0);
    if (p.dashTimer > 0) dashFrames += 1;
    peakTrauma = Math.max(peakTrauma, game.camera.trauma);
  }
  return {
    dx: p.x - x,
    dy: p.y - y,
    dashFrames,
    sounds: sounds.slice(s0),
    peakTrauma,
    x: p.x,
    y: p.y,
  };
}

/** 圆心到矩形的重叠深度（px）：0 = 贴住或在外，正数 = 陷进去了。 */
function penetration(cx, cy, r, w) {
  const nx = Math.max(w.x, Math.min(cx, w.x + w.w));
  const ny = Math.max(w.y, Math.min(cy, w.y + w.h));
  const d = Math.hypot(cx - nx, cy - ny);
  if (d > 0) return Math.max(0, r - d);
  return r + Math.min(cx - w.x, w.x + w.w - cx, cy - w.y, w.y + w.h - cy);
}

/** 跑一路，逐帧盯"陷进墙里最深有多少"（这一条和怪那边同一个判据）。 */
function deepest(game, p, frames, wall, probe) {
  let deepestPen = 0;
  for (let i = 0; i < frames; i += 1) {
    step(game, p, probe.wx, probe.wy, i === 0);
    deepestPen = Math.max(deepestPen, penetration(p.x, p.y, p.radius, wall));
  }
  return deepestPen;
}

/** 画一遍场上的刺脊，只取那条从它脚下出发的蓄力预警线。 */
function lancerLine(game, walls) {
  const segments = [];
  let last = null;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key === 'moveTo') return (x, y) => { last = [x, y]; };
        if (key === 'lineTo') return (x, y) => { segments.push([...(last ?? []), x, y]); };
        if (key === 'createRadialGradient' || key === 'createLinearGradient' || key === 'createPattern') {
          return () => gradient;
        }
        if (key === 'measureText') return () => ({ width: 6 });
        if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (key in target) return target[key];
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  game.enemies.draw(ctx, 0, 0, 0, undefined, walls);
  return segments.filter(([x0, y0]) => Math.abs(x0) < 1e-9 && Math.abs(y0) < 1e-9);
}

test('正面撞墙：这次冲刺当场收掉，有声、有尘，人没被挤进墙里', async (t) => {
  const { game, p, sounds } = await open(t, 'head');
  const wall = BARRIER();
  game.level.walls.push(wall);
  // 从 y=-260 往 +y 冲：墙面在 -140，人半径 14 —— 冲得到（满速能走 245px），但撞得响
  p.x = 0;
  p.y = -260;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  p.invuln = 0;
  const s0 = sounds.length;
  let dashFrames = 0;
  let peakTrauma = game.camera.trauma;
  let pen = 0;
  let cutAt = -1;
  // 冲到**撞上那一帧**就停（不再多走）：下面那条"立刻能走开"量的是撞上之后紧跟着的那几帧，
  // 多走几十帧的话量到的就只是"走路加速"了
  for (let i = 0; i < 40 && cutAt < 0; i += 1) {
    const before = p.dashTimer;
    step(game, p, 0, 1, i === 0);
    if (p.dashTimer > 0) dashFrames += 1;
    peakTrauma = Math.max(peakTrauma, game.camera.trauma);
    pen = Math.max(pen, penetration(p.x, p.y, p.radius, wall));
    // 收掉：这一帧之前还在冲刺、这一帧没了，而且不是"自己走完的"（走完会减到负数）
    if (before > 0 && p.dashTimer === 0) cutAt = i;
  }
  const played = sounds.slice(s0);
  assert.ok(played.includes('bash'), `撞墙那一下要听得见（这一路响了 ${JSON.stringify(played)}）`);
  assert.ok(cutAt >= 0, '冲刺该被墙当场收掉（改前它会贴着墙把剩下那 0.18 秒磨完）');
  assert.ok(dashFrames < 10, `冲刺帧数该少于一整发（实测 ${dashFrames} 帧）`);
  assert.ok(peakTrauma > 0, `撞墙要有那一点点屏震（实测峰值 ${peakTrauma.toFixed(3)}）`);
  assert.equal(pen, 0, `人一颗都不许陷进墙里（实测最深 ${pen.toFixed(3)}）`);
  // 位置：贴住墙面（-140 再往外一个半径）
  assert.ok(Math.abs(p.y - (-140 - p.radius)) < 0.51, `撞完该停在墙面上（实测 y=${p.y.toFixed(2)}，墙面 ${-140 - p.radius}）`);

  // 收掉冲刺的**意义**在这一条上：撞完按住反方向，人当场就走得开。
  // 收的时候**把速度也清掉**才算数——不清的话那一下的冲刺速度（748px/s，也就是那一帧还按在墙上）
  // 还得花好几帧才能扳回来。实测：2 帧里就在往回走了；20 帧（0.33s）走开 40px 以上。
  const away0 = p.y;
  let startedBackAt = -1;
  for (let i = 1; i <= 20; i += 1) {
    step(game, p, 0, -1, false);
    if (startedBackAt < 0 && p.y < away0) startedBackAt = i;
  }
  const away = away0 - p.y;
  assert.ok(startedBackAt > 0 && startedBackAt <= 4, `按反方向该当场开始往回走（实测第 ${startedBackAt} 帧动）`);
  assert.ok(away > 30, `20 帧（0.33s）里该走开 30px 以上（实测 ${away.toFixed(1)}px）`);
});

test('对照组：没有墙的时候，同一发冲刺照旧跑满、而且不响', async (t) => {
  const { game, p, sounds } = await open(t, 'free');
  const free = dashRun(game, p, sounds, 0, -260, 0, 1, 40);
  assert.ok(free.dy > 200, `空地上这一发该走满（实测 ${free.dy.toFixed(2)}px）`);
  assert.ok(!free.sounds.includes('bash'), `没撞墙就不许响（响了 ${JSON.stringify(free.sounds)}）`);
  assert.ok(free.dashFrames >= 10, `冲刺该跑满自己的 0.18 秒（实测 ${free.dashFrames} 帧）`);
});

test('贴着墙平行冲是满速：位移与空地那一发逐位相同，而且不响', async (t) => {
  const { game, p, sounds } = await open(t, 'along');
  // 两发都从同一个 x 出发（浮点累加才逐位可比）：一发在空地上，一发贴着墙面 8px 平行过去
  const free = dashRun(game, p, sounds, -150, -260, 1, 0, 40);
  const wall = BARRIER();
  game.level.walls.push(wall);
  const along = dashRun(game, p, sounds, -150, -140 - p.radius - 8, 1, 0, 40);
  assert.ok(free.dx > 200, `前提：空地那一发要真的走满（实测 ${free.dx.toFixed(2)}px）`);
  assert.equal(along.dx, free.dx, `贴墙平行冲的位移该与空地逐位相同（${free.dx.toFixed(2)} → ${along.dx.toFixed(2)}）`);
  assert.ok(!along.sounds.includes('bash'), `贴墙滑不是撞墙，不该响（响了 ${JSON.stringify(along.sounds)}）`);
});

test('撞在**场地边界**上不算撞墙：不响、也不收冲刺（这一条规矩只管墙）', async (t) => {
  const { game, p, sounds } = await open(t, 'edge');
  // 站到场地边上（`halfW` = 900，人半径 14），朝边界冲：一样会被拦下来，但那不是"墙"——
  // 拦你的是场地那条线（`clampToArena`），它没有面、也没有该响的道理。
  const startX = 900 - p.radius - 40;
  const run = dashRun(game, p, sounds, startX, 0, 1, 0, 40);
  assert.ok(run.x < 900, `该被边界拦住（实测 x=${run.x.toFixed(2)}）`);
  assert.ok(run.dashFrames >= 10, `边界不该收掉冲刺（实测 ${run.dashFrames} 帧）`);
  assert.ok(!run.sounds.includes('bash'), `边界不是墙，不该响（响了 ${JSON.stringify(run.sounds)}）`);
});

test('斜着擦上去照旧滑过去：前进量与空地那一发逐位相同，而且不响', async (t) => {
  const { game, p, sounds } = await open(t, 'slant');
  // 空地那一发：同样的 45°，x 方向该走出多少
  // 起点离墙面只隔 46px：撞上那一下必须落在**冲刺途中**（0.18 秒里），
  // 站太远的话冲刺早就走完了，量到的其实是"撞墙之后继续走路"
  const free = dashRun(game, p, sounds, -150, -200, Math.SQRT1_2, Math.SQRT1_2, 40);
  const wall = BARRIER();
  game.level.walls.push(wall);
  p.x = -150;
  p.y = -200;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  const s0 = sounds.length;
  const pen = deepest(game, p, 40, wall, { wx: Math.SQRT1_2, wy: Math.SQRT1_2 });
  const slant = { dx: p.x - -150, dy: p.y - -200, sounds: sounds.slice(s0) };
  assert.ok(free.dx > 120, `前提：空地那一发 x 方向要走出 120px 以上（实测 ${free.dx.toFixed(2)}）`);
  assert.ok(
    Math.abs(slant.dx - free.dx) < 1e-9,
    `斜擦着墙那一下的 x 前进量该逐位不变（空地 ${free.dx.toFixed(2)} → 撞墙 ${slant.dx.toFixed(2)}）`,
  );
  assert.ok(slant.dy > 0 && slant.dy < free.dy, `y 方向该被墙截住（空地 ${free.dy.toFixed(2)} → 撞墙 ${slant.dy.toFixed(2)}）`);
  assert.equal(pen, 0, `斜擦也不许陷进墙里（实测最深 ${pen.toFixed(3)}）`);
  assert.ok(!slant.sounds.includes('bash'), `斜着擦过去还在往前走，不该响（响了 ${JSON.stringify(slant.sounds)}）`);
});

test('刺脊的蓄力预警线也停在墙面上：墙后不画，墙旁与无墙逐位不变', async (t) => {
  const { game } = await open(t, 'chargeLine');
  game.enemies.clear();
  const lancer = game.enemies.spawn('lancer', 0, 0, 1, 1);
  lancer.angle = 0;
  lancer.stateTimer = 0.3;
  lancer.spawnTimer = 0;

  const lengthOf = (walls) => {
    const line = lancerLine(game, walls).find(([x0, y0]) => Math.abs(x0) < 1e-9 && Math.abs(y0) < 1e-9);
    assert.ok(line, '应画出那条从刺脊脚下出发的预警线');
    return line[2] - line[0];
  };
  const opened = lengthOf([]);
  const walled = lengthOf([{ x: 100, y: -200, w: 30, h: 400 }]);
  const beside = lengthOf([{ x: 0, y: 180, w: 400, h: 30 }]);

  assert.ok(Math.abs(opened - 340) < 1e-9, `无墙时预警线该画满 340px（实测 ${opened}）`);
  assert.ok(Math.abs(walled - 100) < 1e-9, `墙后那段不该画出来（实测停在 ${walled}px）`);
  assert.equal(beside, opened, '墙在旁边时预警线应逐位不变');
});
