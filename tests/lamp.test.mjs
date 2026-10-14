/**
 * 「分灯」回归测试：把一小罐灯油点在地上，照亮一小圈，并把附近的黑暗引过去。
 *
 * 这是这一版新加的一个"动词"，所以它得同时证明四件事：
 *   1. 代价是真的——扣油、进冷却、油不够 / 不在战场上就按不出来；
 *   2. 光是真的是——那一圈真的进了光照系统（不是只画了个好看的火苗）；
 *   3. 引怪是真的——朝你来的怪会改朝那盏灯走（而且不是"顺带往那边飘一点"）；
 *   4. 它是有寿命的——时间到自己灭，凑上来的怪会把它吃掉，
 *      连吹灯客也会飞过去一口气吹灭它。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开局：血厚到打不死，免得几百帧的观察变成一局死亡结算。 */
async function open(t) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=lamp-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

test('分灯：扣油、进冷却，油不够或不在战斗中就按不出来', async (t) => {
  const game = await open(t);
  game.player.oil = 1;
  const before = game.player.oil;

  assert.ok(game.lampReady, '开局油满，分灯应该是可用的');
  assert.equal(game.tryPlantLamp(), true, '油满时应该放得下');
  assert.equal(game.lamps.length, 1, '地上应该多了一盏灯');
  assert.ok(game.player.oil < before, '分灯要扣油（油就是光）');
  assert.ok(Math.abs(before - game.player.oil - 0.14) < 1e-9, `扣的应该正好是 14%（实际 ${before - game.player.oil}）`);
  assert.ok(game.lampCd > 0 && game.lampCdFrac > 0.9, '放下之后应立刻进冷却（按钮要画满圈）');
  assert.equal(game.lampReady, false, '冷却中不该报"可用"');

  // 冷却中连按：不该再扣油、也不该再放
  const oilAfter = game.player.oil;
  assert.equal(game.tryPlantLamp(), false, '冷却中不能连放');
  assert.equal(game.lamps.length, 1);
  assert.equal(game.player.oil, oilAfter, '被冷却挡下来时不该白扣油');

  // 冷却走完可以再放
  for (let i = 0; i < 60 * 8; i += 1) game.update(1 / 60);
  assert.equal(game.lampCdFrac, 0, '八秒之后冷却应该转完了');

  // 油见底：不让自己把自己点死
  game.player.oil = 0.1;
  assert.equal(game.lampReady, false, '油不够时不该报可用');
  assert.equal(game.tryPlantLamp(), false, '油不够点不着');
  assert.equal(game.player.oil, 0.1, '点不着就不该扣油');

  // 不在战斗里（暂停 / 菜单）：按了也不算
  game.player.oil = 1;
  game.state = 'paused';
  assert.equal(game.tryPlantLamp(), false, '暂停时不该能分灯');
  assert.equal(game.lamps.length, 1, '暂停时的尝试不该留下灯');
});

test('分灯：那一圈真的进了光照系统', async (t) => {
  const game = await open(t);
  game.player.oil = 1;
  game.render();
  const base = game.light.lastLightCount;
  game.tryPlantLamp();
  game.render();
  assert.equal(
    game.light.lastLightCount,
    base + 2,
    '一盏弃灯要进两个光源：亮芯 + 那一大圈很淡的"饵光"（不是只画了个火苗）',
  );
});

test('分灯：朝你来的怪会改朝那盏灯走', async (t) => {
  const game = await open(t);
  game.player.oil = 1;
  game.player.x = 0;
  game.player.y = 0;
  assert.equal(game.tryPlantLamp(), true);
  const lamp = game.lamps[0];

  // 把人挪远，再在灯的另一侧放一只直冲型的怪：
  // 它离灯 300、离人 900——不引的话它应该往人那边走
  game.player.x = 600;
  game.player.y = 0;
  game.enemies.clear();
  const e = game.enemies.spawn('shade', lamp.x + 300, lamp.y, 1, 1);
  const dLamp0 = Math.hypot(e.x - lamp.x, e.y - lamp.y);
  const dPlayer0 = Math.hypot(e.x - game.player.x, e.y - game.player.y);

  for (let i = 0; i < 40; i += 1) game.update(1 / 60);

  const dLamp1 = Math.hypot(e.x - lamp.x, e.y - lamp.y);
  const dPlayer1 = Math.hypot(e.x - game.player.x, e.y - game.player.y);
  assert.ok(dLamp1 < dLamp0 - 20, `应该朝灯走（离灯 ${Math.round(dLamp0)} → ${Math.round(dLamp1)}）`);
  assert.ok(dPlayer1 > dPlayer0 - 20, `不该同时朝人走（离人 ${Math.round(dPlayer0)} → ${Math.round(dPlayer1)}）`);
});

test('分灯：时间到自己灭，凑上来的怪会把它吃掉', async (t) => {
  const game = await open(t);
  game.player.oil = 1;
  game.player.x = 0;
  game.player.y = 0;
  game.enemies.clear();

  // 时间到：把寿命推到只剩一点，跑一帧就没了
  assert.equal(game.tryPlantLamp(), true);
  game.lamps[0].life = 0.1;
  game.update(0.2);
  assert.equal(game.lamps.length, 0, '寿命到了应该自己灭掉');

  // 怪贴着灯：灯被吃掉（提前熄）
  game.player.oil = 1;
  game.lampCd = 0;
  assert.equal(game.tryPlantLamp(), true);
  const lamp = game.lamps[0];
  game.enemies.spawn('shade', lamp.x + 10, lamp.y, 1, 1);
  for (let i = 0; i < 40; i += 1) game.update(1 / 60);
  assert.equal(game.lamps.length, 0, '怪凑上来应该把灯吃掉');
  assert.ok(lamp.life < 11, '不是自然烧完的（寿命被提前掐了）');
});

test('分灯：吹灯客会飞过去把地上那盏灯吹灭', async (t) => {
  const game = await open(t);
  game.player.oil = 1;
  game.player.x = 0;
  game.player.y = 0;
  game.enemies.clear();
  assert.equal(game.tryPlantLamp(), true);

  // 人挪远，让吹灯客只剩"那盏灯"这一个目标（这一关还没有点亮任何灯台）
  game.player.x = 900;
  game.player.y = 0;
  const snuffer = game.enemies.spawn('snuffer', 150, 0, 1, 1);
  assert.equal(game.nearestLamp(snuffer.x, snuffer.y)?.x ?? null, 0, '吹灯客应该盯上这盏灯');

  for (let i = 0; i < 150; i += 1) game.update(1 / 60);
  assert.equal(game.lamps.length, 0, '吹灯客应该把那盏灯吹灭了');
});
