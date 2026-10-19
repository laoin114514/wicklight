/**
 * 击退与撞墙硬直（v111）回归测试。
 *
 * v110 之前所有武器的 `knockback` 都写进敌人的 `vx/vy`，而下一帧 `behave` 会按追击方向
 * 重算速度——那只怪一步都不会被推动。这里的四件事：
 *   1. 击退真的推得动，而且不跟 AI 的速度字段打架；
 *   2. 被拍进墙里的那一下会停住并短暂硬直，位置不许进墙；
 *   3. 贴着墙平行推过去只滑行，不触发硬直；
 *   4. 同一只怪有 0.9 秒冷却，高频武器不能把它永久按在墙上。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=knockwall-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.director.spawnTimer = 1e9;
  game.xpToNext = 1e9;
  game.enemies.clear();
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.x = 0;
  p.y = 0;
  p.weapons.clear();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return game;
}

function tough(game, x, y) {
  const e = game.enemies.spawn('shade', x, y, 1, 1);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

function run(game, n) {
  for (let i = 0; i < n; i += 1) {
    game.player.hp = 1e6;
    game.player.oil = game.player.oilMax;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
}

test('击退真的推得动：冲量不再被下一帧 AI 速度抹掉', async (t) => {
  const game = await open(t, 'push');
  const e = tough(game, 200, 0);
  const x0 = e.x;
  game.applyHit(e, 10, false, 1, 0, 200, { source: 'test:push' });
  assert.ok(Math.abs(e.vx) < 1e-9, '冲量不该写进 AI 的 vx——那条下一帧会被覆盖');
  assert.ok(e.knockTimer > 0 && e.knockVx > 0, '它要有一段自己的冲量');
  run(game, 12);
  assert.ok(e.x - x0 > 15, `200 的击退该推出至少十几像素（实测 ${(e.x - x0).toFixed(1)}px）`);
  assert.ok(e.knockTimer === 0 && e.knockVx === 0, '走完 0.14 秒就清干净，不留残余速度');
});

test('拍进墙：停在墙面外并短暂硬直，重复命中受冷却限制', async (t) => {
  const game = await open(t, 'wall');
  const wall = { x: 240, y: -200, w: 80, h: 400 };
  game.level.walls.push(wall);
  const e = tough(game, 200, 0);
  const face = wall.x - e.radius;
  game.applyHit(e, 10, false, 1, 0, 400, { source: 'test:wall' });
  run(game, 18);
  assert.ok(e.wallStun > 0, `撞进墙里该有硬直（实测 ${e.wallStun.toFixed(2)}s）`);
  assert.ok(e.x <= face + 0.5, `人该被墙停在 ${face.toFixed(1)} 这条线上（实测 ${e.x.toFixed(1)}）`);
  assert.ok(e.knockWallCd > 0, '硬直进入冷却');
  const stun = e.wallStun;

  // 把硬直读掉，模拟"它已经缓过来了"；紧接的第二下仍然在冷却里，不该再按一次。
  e.wallStun = 0;
  game.applyHit(e, 10, false, 1, 0, 400, { source: 'test:wall' });
  run(game, 3);
  assert.equal(e.wallStun, 0, '0.9 秒冷却内不许再次硬直');
  assert.ok(stun > 0, '前一下的硬直是真实发生的');
});

test('贴着墙平行推：只滑行，不算撞墙硬直', async (t) => {
  const game = await open(t, 'slide');
  game.level.walls.push({ x: 240, y: -200, w: 80, h: 400 });
  const e = tough(game, 220, 0);
  const y0 = e.y;
  game.applyHit(e, 10, false, 0, -1, 400, { source: 'test:slide' });
  run(game, 12);
  assert.ok(e.y - y0 < -15, '平行冲量应该把它沿着墙面推走');
  assert.equal(e.wallStun, 0, '平行擦墙不该触发硬直');
  assert.equal(e.knockWallCd, 0, '更不该占用撞墙冷却');
});
