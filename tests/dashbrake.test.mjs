/**
 * 「收力」（v87）回归测试：冲刺跑完之后那半秒，手该管用。
 *
 * 冲刺是 0.18 秒、748px/s（走速 220 的 3.4 倍）；这 0.18 秒里方向键是**听不见**的
 * （速度直接写在冲刺方向上，那是刻意的——一次冲刺就是一次承诺）。问题出在它**之后**：
 * 跑完那一刻残余速度还是 748，而手上那个方向键要花 **20 帧（0.33 秒）**才把它扳回来
 * （走路的 180° 掉头只要 7 帧）。v86 把"撞墙收掉冲刺"接上之后这件事变得更刺眼——
 * 撞墙那一发（速度清零）**第 1 帧**就能动，规规矩矩跑完的那一发反而要 20 帧，
 * 两件事的手感倒挂了，而它们对玩家来说是同一件事："我想立刻往回走"。
 *
 * 这一版只改那一半：**逆着残余速度推**的时候刹车更狠（`DASH_BRAKE` 倍率），
 * 而且只在"速度还高于走速"时生效。要证明的四条：
 *   1. 冲刺跑完按住反方向：起步 / 走开 30px 的帧数大幅提前（20 → 3 / 28 → 15）；
 *   2. 倒挂没了：撞墙那一发与跑完那一发，起步帧数只差个位数（1 vs 3）；
 *   3. **顺着推与松手一点都不受影响**：逐帧速度单调不增、每一帧都还在走速之上，
 *      松手照旧滑停（那是惯性该有的样子）——这一刀不许碰这两样；
 *   4. 寻常走路的掉头（7 帧）也不许被碰，而且那条规矩连灰都不该掉（阈值没被走路摸到）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 急刹那一撮灰的颜色（`Player.update` 走路那一段），和冲刺自己的 `#7be0ff` 分得开。 */
const DUST = '#c8d2e6';

/** 开一局干净的：没有神龛 / 灯台 / 墙 / 怪，只留玩家自己。 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=dashbrake-${tag}-${Date.now()}-${Math.random()}`);
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
  // 数尘：按颜色把"急刹那一撮"从别的爆发（冲刺 10 粒 `#7be0ff` 等）里挑出来
  const dust = [];
  const realBurst = game.particles.burst.bind(game.particles);
  game.particles.burst = (x, y, count, color, opts) => {
    if (color === DUST) dust.push(count);
    return realBurst(x, y, count, color, opts);
  };
  return { game, p, dust };
}

function step(game, p, wx, wy, dash) {
  p.hp = 1e6;
  p.oil = p.oilMax;
  game.hitStop = 0;
  game.setInput(wx, wy, dash, false);
  game.update(dt);
}

/** 站到原点、朝 +y 冲一发（11 帧 = 自然跑满），返回停手时的 y 与 vy。 */
function dashForward(game, p, frames = 11) {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  p.invuln = 0;
  for (let i = 0; i < frames; i += 1) step(game, p, 0, 1, i === 0);
  return { y: p.y, vy: p.vy };
}

/** 从冲刺收尾处按住反方向，量"第几帧开始往回走"与"走开 30px 用几帧"。 */
function reverseAfterDash(game, p) {
  const start = dashForward(game, p);
  let startFrame = -1;
  let framesTo30 = -1;
  step(game, p, 0, -1, false);
  // 刹是"刹住"，不是"一帧翻面"：残余速度（748）该在两帧里用完，第一帧还在往前滑一点点。
  // 这条把 `DASH_BRAKE` 钉在"两帧内停下、但不止一帧"那一段里（6 倍就是这一帧直接翻成负数）。
  const brakeFirstVy = p.vy;
  for (let i = 1; i <= 90; i += 1) {
    if (i > 1) step(game, p, 0, -1, false);
    const away = start.y - p.y;
    if (startFrame < 0 && away > 0.01) startFrame = i;
    if (framesTo30 < 0 && away >= 30) {
      framesTo30 = i;
      break;
    }
  }
  return { startFrame, framesTo30, dashVy: start.vy, brakeFirstVy };
}

test('冲刺跑完按住反方向：当场刹住（起步 3 帧、30px 15 帧）', async (t) => {
  const { game, p, dust } = await open(t, 'reverse');
  const r = reverseAfterDash(game, p);
  assert.equal(r.dashVy, 748, `前提：冲刺收尾时速度确实还在 748（实测 ${r.dashVy}）`);
  // 改前实测：起步 20 帧（0.33 秒）、30px 28 帧、60px 37 帧
  assert.ok(r.startFrame <= 4, `起步该在 4 帧内（改前 20 帧，实测 ${r.startFrame} 帧）`);
  assert.ok(r.brakeFirstVy > 0, `刹车那一帧该还在往前滑（不是一帧翻面，实测 vy=${r.brakeFirstVy.toFixed(1)}）`);
  assert.ok(r.framesTo30 <= 18, `走开 30px 该在 18 帧内（改前 28 帧，实测 ${r.framesTo30} 帧）`);
  assert.deepEqual(dust, [5], `那一撮灰该正好一次 5 粒（实测 ${JSON.stringify(dust)}）`);
});

test('倒挂没了：撞墙那一发与跑完那一发，起步帧数只差个位数', async (t) => {
  const { game, p } = await open(t, 'inversion');
  const free = reverseAfterDash(game, p);
  // 撞墙那一发：400×80 的墙横在 (0,-100)，近面 y=-140，从 -214 正对着冲（v86 的规矩：第 6 帧撞上、收掉冲刺）
  const wall = { x: -200, y: -140, w: 400, h: 80 };
  game.level.walls.push(wall);
  p.x = 0;
  p.y = -214;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  p.invuln = 0;
  for (let i = 0; i < 30; i += 1) {
    const before = p.y;
    step(game, p, 0, 1, i === 0);
    if ((p.y - before) < 1) break;
  }
  const hitY = p.y;
  let wallStart = -1;
  for (let i = 1; i <= 90; i += 1) {
    step(game, p, 0, -1, false);
    if (wallStart < 0 && (hitY - p.y) > 0.01) wallStart = i;
  }
  assert.ok(wallStart <= 4, `撞墙那一发照旧该当场能走（实测 ${wallStart} 帧）`);
  assert.ok(
    Math.abs(free.startFrame - wallStart) <= 3,
    `两件事的起步帧数不该再倒挂（撞墙 ${wallStart} 帧 vs 跑完 ${free.startFrame} 帧）`,
  );
});

test('顺着推与松手一点都不受影响：速度单调不增、每一帧都还在走速之上', async (t) => {
  const { game, p, dust } = await open(t, 'forward');
  const start = dashForward(game, p);
  let prev = 748;
  for (let i = 0; i < 24; i += 1) {
    step(game, p, 0, 1, false);
    const speed = Math.hypot(p.vx, p.vy);
    assert.ok(speed <= prev + 1e-9, `顺着推的速度只许往下走（第 ${i + 1} 帧 ${speed.toFixed(2)} > 上一帧 ${prev.toFixed(2)}）`);
    assert.ok(speed > p.stats.moveSpeed - 1e-6, `顺着推不许被踩到走速以下（第 ${i + 1} 帧 ${speed.toFixed(2)}）`);
    prev = speed;
  }
  // 松手：照旧滑停（这一刀只在"逆着推"时生效）
  const idleFrom = dashForward(game, p).y;
  const firstFrameVy = p.vy;
  for (let i = 0; i < 60; i += 1) step(game, p, 0, 0, false);
  const slide = p.y - idleFrom;
  assert.ok(firstFrameVy > 700, `松手的第一帧速度该还在 700 以上（实测 ${firstFrameVy.toFixed(1)}）`);
  assert.ok(slide > 45 && slide < 70, `松手该照旧滑停（改前实测 56px，本版实测 ${slide.toFixed(1)}px）`);
  assert.deepEqual(dust, [], `顺着推 / 松手都不该掉灰（实测 ${JSON.stringify(dust)}）`);
});

test('寻常走路的掉头照旧：7 帧起步，而且不碰那条规矩', async (t) => {
  const { game, p, dust } = await open(t, 'walk');
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 99;
  p.invuln = 0;
  for (let i = 0; i < 40; i += 1) step(game, p, 0, 1, false);
  const turnY = p.y;
  let turnBack = -1;
  for (let i = 1; i <= 90; i += 1) {
    step(game, p, 0, -1, false);
    if (turnBack < 0 && p.y < turnY) {
      turnBack = i;
      break;
    }
  }
  // 要的是"不多不少"：这一版**不许**顺手把走路也改快（刹车只在速度高于走速时生效），
  // 所以这里卡的是 6~8 帧这个区间——下界和上界一样重要（只写上界的话，"走路也刹"这种改动照样绿）。
  assert.ok(turnBack >= 6 && turnBack <= 8, `走路掉头照旧该是 7 帧起步（实测 ${turnBack} 帧）`);
  assert.deepEqual(dust, [], `走路的掉头速度（220）够不着那个阈值，不该掉灰（实测 ${JSON.stringify(dust)}）`);
});

test('残余速度不大时照旧刹、但不留痕：那一撮灰只给"冲刺刚收尾"', async (t) => {
  const { game, p, dust } = await open(t, 'smallcarry');
  // 先冲 +y，然后**拐一下**（按 +x 五帧）：残余速度由 748 衰减到 220 的 1.28 倍（282px/s），
  // 这时再反推——它照样在刹（"逆着推就刹"跟残余多大无关），但速度已经不到走速两倍，
  // 所以不该掉灰：那一撮痕是给"冲刺刚收尾那一下"的（一局里按帧算就那么几帧）。
  dashForward(game, p);
  for (let i = 0; i < 5; i += 1) step(game, p, 1, 0, false);
  const carry = Math.hypot(p.vx, p.vy);
  const beforeVy = p.vy;
  step(game, p, 0, -1, false);
  assert.ok(carry > p.stats.moveSpeed * 1.15 && carry < p.stats.moveSpeed * 2,
    `前提：这一步的残余速度该落在"走速的 1.15~2 倍"那一段里（实测 ${carry.toFixed(1)}，走速 ${p.stats.moveSpeed}）`);
  // 不刹的话，这一帧是从 +281 朝 -220 走一格（18% 的老速率）：落到 +190，还是正的。
  assert.ok(beforeVy > 0 && p.vy < 0, `这一段残余也该一帧就刹翻（不刹的话这一帧该是 +190，实测 ${p.vy.toFixed(1)}）`);
  assert.deepEqual(dust, [], `残余不到走速两倍时不该留痕（实测 ${JSON.stringify(dust)}）`);
});

test('一次冲刺最多留一次灰：连着两发，就是两撮', async (t) => {
  const { game, p, dust } = await open(t, 'twice');
  reverseAfterDash(game, p);
  p.dashCd = 0;
  reverseAfterDash(game, p);
  assert.deepEqual(dust, [5, 5], `两发冲刺该正好两撮灰（实测 ${JSON.stringify(dust)}）`);
});
