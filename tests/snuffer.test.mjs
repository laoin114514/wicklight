/**
 * 吹灯客：会绕过你，直接去吹灭你点亮的灯台。
 *
 * 灯台本来是纯赚的——站过去点着，余温永久叠加。有了吹灯客，"点亮"不再是一次性结算，
 * 而变成一处要守的据点：点灯招它来，灯焰被抽干就会重新熄灭，余温也跟着收回。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('吹灯客：扑灯台、吹灭灯焰、余温收回', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, hud, catalog } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;

  const def = catalog.enemies.find((e) => e.id === 'snuffer');
  assert.ok(def, '敌人表里应有「吹灯客」');
  assert.equal(def.behavior, 'quench', '吹灯客应该用扑灯台的行为');
  assert.ok(!def.elite && !def.boss, '吹灯客应是普通敌人');
  assert.ok(!catalog.normalEnemies.includes('snuffer'), '吹灯客不该混进普通刷怪池——它是点灯招来的');
  assert.ok(catalog.normalEnemies.length > 0, '普通刷怪池不该被清空');
  assert.ok((def.note ?? '').includes('灯台'), '图鉴说明要讲清它冲着灯台来');

  // ── 点亮一座灯台：灯焰是满的，而且会招来吹灯客 ──
  const pyre = game.level.pyres[0];
  game.enemies.clear();
  game.player.x = pyre.x;
  game.player.y = pyre.y;
  for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
  assert.equal(pyre.lit, true, '站足够久应点亮灯台');
  assert.equal(pyre.flame, 1, '刚点亮的灯台灯焰应是满的');
  const alive = [];
  game.enemies.forEach((e) => alive.push(e));
  const snuffers = alive.filter((e) => e.defId === 'snuffer');
  assert.ok(snuffers.length >= 1, `点灯应招来吹灯客（实际 ${snuffers.length}）`);
  for (const s of snuffers) {
    const d = Math.hypot(s.x - pyre.x, s.y - pyre.y);
    assert.ok(d > 300 && d < 900, `吹灯客应刷在灯台附近的黑暗里（${Math.round(d)}）`);
  }
  assert.ok(alive.some((e) => e.defId !== 'snuffer'), '点灯的动静照旧会叫来普通敌人');

  // ── 它朝灯台走，而不是朝你走 ──
  const walker = snuffers[0];
  // 把玩家挪到灯台另一边，看它是扑灯还是扑人
  game.player.x = pyre.x + 900;
  game.player.y = pyre.y;
  const before = Math.hypot(walker.x - pyre.x, walker.y - pyre.y);
  for (let i = 0; i < 30; i += 1) game.enemies.update(1 / 60, game.enemyCtx());
  const after = Math.hypot(walker.x - pyre.x, walker.y - pyre.y);
  assert.ok(after < before, `吹灯客该朝灯台靠近（${Math.round(before)} → ${Math.round(after)}）`);

  // ── 贴上去抽灯焰：灯焰下降，灯台还亮着 ──
  walker.x = pyre.x + 30;
  walker.y = pyre.y;
  game.enemies.update(0.5, game.enemyCtx());
  assert.ok(pyre.flame < 1, `贴着灯台应开始抽灯焰（${pyre.flame.toFixed(2)}）`);
  assert.ok(pyre.lit, '灯焰没抽干之前灯台还是亮的');

  // ── 抽干：灯台重新熄灭，余温按原路收回 ──
  game.player.x = 0;
  game.player.y = 0;
  const dmgLit = game.player.stats.damageMult;
  const lightLit = game.player.pyreMods.lightMult;
  const litCount = game.pyresLit;
  for (let i = 0; i < 200 && pyre.lit; i += 1) {
    walker.x = pyre.x + 30;
    walker.y = pyre.y;
    game.enemies.update(0.25, game.enemyCtx());
  }
  assert.equal(pyre.lit, false, '灯焰被抽干后灯台应重新熄灭');
  assert.equal(pyre.flame, 0, '熄灭的灯台灯焰归零');
  assert.equal(pyre.progress, 0, '熄灭的灯台点燃进度归零');
  assert.equal(game.pyresLit, litCount - 1, '已点亮计数应退回');
  assert.ok(game.player.stats.damageMult < dmgLit, `灯被吹灭后伤害该降回去（${game.player.stats.damageMult.toFixed(3)} < ${dmgLit.toFixed(3)}）`);
  assert.ok(game.player.pyreMods.lightMult < lightLit, '灯火余温也该收回去');

  // ── 没有点亮的灯台时，它退化成普通追击，不会卡住 ──
  game.enemies.clear();
  const loner = game.enemies.spawn('snuffer', game.player.x + 300, game.player.y, 1, 1);
  for (let i = 0; i < 40; i += 1) game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(Math.hypot(loner.x - game.player.x, loner.y - game.player.y) < 300, '没有灯可吹时它会照常追人');

  // ── 灯焰只影响画面，不影响它能不能被点回来 ──
  game.player.x = pyre.x;
  game.player.y = pyre.y;
  for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
  assert.equal(pyre.lit, true, '熄灭的灯台可以重新点亮');
  assert.equal(pyre.flame, 1, '重新点亮后灯焰回到满值');

  // ── 走主循环也不会报错（挂载点没被改坏）──
  game.enemies.clear();
  for (let i = 0; i < 120; i += 1) {
    game.hitStop = 0;
    game.update(1 / 60);
  }
  assert.ok(game.player.hp > 0, '主循环跑完玩家还在');
  assert.deepEqual(errors, [], `不应有 console 错误：${errors.slice(0, 3).join(' | ')}`);
});
