/**
 * 拾取物也认墙（v108）。
 *
 * 到 v107 为止，掉落物只做直线积分：只要落进拾取范围，磁吸就会把它从墙那边直接拽过来；
 * 掉在墙边时也没有碰撞，可以停在墙体内部。这里把两件事一起钉住：
 *   1. 墙在中间时先不吸、不收集，墙挪到旁边才恢复；
 *   2. 掉落点落进墙里时，第一次更新就把它推回墙外，别留下永远捡不到的一口油。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pickupwall-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.hazardTimer = 1e9;
  game.enemies.clear();
  game.projectiles.clear();
  game.pickups.clear();
  game.level.walls.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

function overlapsWall(p, walls) {
  return walls.some(
    (w) =>
      p.x + p.radius > w.x &&
      p.x - p.radius < w.x + w.w &&
      p.y + p.radius > w.y &&
      p.y - p.radius < w.y + w.h,
  );
}

test('拾取物不隔墙吸：墙后先留着，墙挪到旁边才被收走（v108）', async (t) => {
  const game = await open(t, 'magnet');
  const drop = game.pickups.spawn(140, 0, 'oil', 1);
  drop.vx = 0;
  drop.vy = 0;
  game.level.walls.push({ x: 50, y: -40, w: 20, h: 80 });
  let collected = 0;

  for (let i = 0; i < 60; i += 1) {
    game.pickups.update(1 / 60, 0, 0, 200, () => (collected += 1), game.level.walls);
  }
  assert.equal(collected, 0, '墙后的油不该隔墙吸过来');
  assert.equal(drop.active, true, '墙后那口油应还留在地上');
  assert.equal(drop.attracted, false, '看不见时不该进入磁吸状态');
  assert.ok(drop.x > 100, `没有磁吸时不该朝玩家飞（x=${drop.x}）`);

  // 同一堵墙只挪到旁边：玩家与掉落物在同一侧，磁吸恢复。
  game.level.walls[0] = { x: 0, y: 100, w: 180, h: 16 };
  for (let i = 0; i < 120; i += 1) {
    game.pickups.update(1 / 60, 0, 0, 200, () => (collected += 1), game.level.walls);
  }
  assert.equal(collected, 1, '墙旁边应照旧吸得过来并收走');
});

test('掉进墙里的拾取物会被推回墙外（v108）', async (t) => {
  const game = await open(t, 'inside');
  const drop = game.pickups.spawn(60, 0, 'oil', 1);
  drop.vx = 0;
  drop.vy = 0;
  game.level.walls.push({ x: 50, y: -10, w: 20, h: 20 });
  game.pickups.update(1 / 60, 500, 0, 0, () => {}, game.level.walls);
  assert.equal(overlapsWall(drop, game.level.walls), false, `掉落物不该停在墙里（x=${drop.x}）`);
  assert.ok(drop.x <= 50 - drop.radius + 1e-6 || drop.x >= 70 + drop.radius - 1e-6, '应被推到最近的那一面墙外');
});
