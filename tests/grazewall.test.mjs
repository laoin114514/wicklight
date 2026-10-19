/**
 * 掠影也认墙（v109）。
 *
 * 掠影量的是“这一帧走过的线段离危险有多近”。到 v108 为止它只算几何距离：
 * 玩家贴着墙跑、怪压在墙另一侧时，两边圆心仍在掠影带里，于是热度、回油和计数照拿——
 * 墙反而成了一台稳定的刷分机。这里把同一句 `wallBetween` 接到敌人与弹幕两条判定上：
 * 墙在中间时不算擦到，墙挪到旁边才恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=grazewall-${Date.now()}-${Math.random()}`);
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
  game.player.heat = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

test('掠影不隔墙计：墙后的怪不算擦到，墙挪到旁边才算（v109）', async (t) => {
  const game = await open(t);
  const enemy = game.enemies.spawn('shade', 0, 40, 1, 1);
  enemy.hp = 1e6;
  enemy.maxHp = 1e6;
  enemy.speed = 0;

  // 玩家这一帧沿 y=0 从 x=-60 走到 -40，怪在墙另一侧 (0,40)。
  // 圆心距离 40：正好落在 27px 贴身圈之外的掠影带（27~59px）里。
  game.grazeFromX = -60;
  game.grazeFromY = 0;
  game.player.x = -40;
  game.player.y = 0;
  game.level.walls.push({ x: -100, y: 20, w: 200, h: 10 });
  game.resolveGraze(1 / 60);
  assert.equal(game.grazeCount, 0, '墙后的怪不该记成一次掠影');
  assert.equal(game.player.heat, 0, '墙后的怪不该加热度');
  assert.equal(enemy.grazeHold, 0, '看不见的怪不该开始累计贴靠时间');

  // 同一堵墙只挪到脚下另一侧：没有墙挡在中间，擦身恢复。
  game.level.walls[0] = { x: -100, y: -40, w: 200, h: 10 };
  game.grazeFromX = -60;
  game.grazeFromY = 0;
  game.player.x = -40;
  game.player.y = 0;
  game.resolveGraze(1 / 60);
  assert.equal(game.grazeCount, 1, '墙在旁边时应照旧记一次掠影');
  assert.ok(game.player.heat > 0, '墙在旁边时应照旧加热度');
});
