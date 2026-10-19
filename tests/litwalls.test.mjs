/**
 * 「被照亮」= 半径 + 无遮挡（v95）。
 *
 * v94 先把墙后的光画暗了；这一条把同一句话接回玩法：无光者隔着墙不再挨打，
 * 索敌也不再把它当成"灯里的目标"，灯火微尘不会在墙影里飘。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=litwalls-${tag}-${Date.now()}-${Math.random()}`);
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
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  const p = game.player;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return { game, p };
}

function dummy(game, id, x, y) {
  const e = game.enemies.spawn(id, x, y, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.spawnTimer = 0;
  e.speed = 0;
  return e;
}

test('墙影里的无光者不挨打，墙头外与被光照到的照旧吃伤害', async (t) => {
  const { game, p } = await open(t, 'darkless');
  p.lightRadius = 400;
  game.level.walls.push({ x: p.x + 90, y: p.y - 120, w: 40, h: 240 });
  const behind = dummy(game, 'darkless', p.x + 180, p.y);
  const front = dummy(game, 'darkless', p.x + 45, p.y - 70);
  const around = dummy(game, 'darkless', p.x + 180, p.y + 300);
  const lc = game.lightCtx();

  assert.equal(game.enemies.isVulnerable(behind, lc), false, '墙后那只不该被算作被照亮');
  assert.equal(game.enemies.isVulnerable(front, lc), true, '墙前那只照旧在光里');
  assert.equal(game.enemies.isVulnerable(around, lc), true, '绕得过墙头的那只照旧在光里');

  const behindHp = behind.hp;
  game.applyHit(behind, 20, false, 0, 0, 0);
  assert.equal(behind.hp, behindHp, '墙后无光者不该吃这一下');
  game.applyHit(front, 20, false, 0, 0, 0);
  assert.ok(front.hp < front.maxHp, '墙前无光者照旧吃伤害');

  game.level.walls.length = 0;
  assert.equal(game.enemies.isVulnerable(behind, game.lightCtx()), true, '撤掉墙后同一只应立刻可被击破');
});

test('索敌的门槛也看墙：无光者藏进墙影就不再占目标，普通怪的全盲兜底不变', async (t) => {
  const { game, p } = await open(t, 'target');
  p.lightRadius = 400;
  game.level.walls.push({ x: p.x + 90, y: p.y - 60, w: 40, h: 120 });
  const hidden = dummy(game, 'darkless', p.x + 160, p.y);
  const visible = dummy(game, 'darkless', p.x + 250, p.y + 250);

  assert.equal(game.nearestEnemy(p.x, p.y, 500, undefined, true), visible, '墙影里的无光者不该压过看得见的');
  visible.x = p.x + 460;
  assert.equal(game.nearestEnemy(p.x, p.y, 500, undefined, true), null, '只剩墙影里的无光者时不该再挑它');

  game.enemies.clear();
  game.level.walls.length = 0;
  game.level.walls.push({ x: p.x + 90, y: p.y - 60, w: 40, h: 120 });
  const shade = dummy(game, 'shade', p.x + 160, p.y);
  assert.equal(
    game.nearestEnemy(p.x, p.y, 500, undefined, true),
    shade,
    '普通怪的全盲兜底是 v89 的刻意规矩，不该被这一刀一起删掉',
  );
});

test('灯火微尘也停在墙面上：墙影那一侧不再发亮', async (t) => {
  const { game, p } = await open(t, 'motes');
  p.lightRadius = 320;
  game.level.walls.push({ x: p.x + 100, y: p.y - 2000, w: 40, h: 4000 });
  const motes = [];
  game.particles.mote = (x, y) => motes.push({ x, y });
  game.setInput(0, 0, false, false);
  for (let i = 0; i < 180; i += 1) game.update(1 / 60);

  assert.ok(motes.length > 0, '这一段里应当真的生成过微尘');
  assert.ok(
    motes.every((m) => m.x <= p.x + 100.001),
    `墙后那一侧不该有微尘：${motes.filter((m) => m.x > p.x + 100.001).length}/${motes.length} 颗漏过去了`,
  );
});
