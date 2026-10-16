/**
 * 难度档「灯油进项」回归测试。
 *
 * 难度面板给三档各写了一句承诺：放松是"灯油充足"、噩梦是"奖励丰厚"。
 * 这句话原来只兑现在**击杀掉落**上，而放松那一档的敌人本来就更少
 * （countMult 1.1 vs 标准 1.35）——于是越弱的档位反而越缺油，承诺是反着写的。
 *
 * 这一版把难度档的灯油倍率（relaxed 1.35 / normal 1 / nightmare 0.75）改成
 * 乘在"玩的时候一直在发生的那三条进项"上：击杀掉落、擦身回油、灯台余温。
 * 这个文件就盯住这三条都听话，而且一次性的结算（不是"进项"）不该被乘。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：血量给到打不死，场面由测试自己摆。 */
async function open(t, difficulty, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', difficulty, false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.pickups.clear();
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  // 让 EnemySystem 先拿到 onDeath 上下文：不然 damage() 打死的怪不会走死亡结算
  game.enemies.update(1 / 60, game.enemyCtx());
  return game;
}

/** 干掉一只"油量刚好是 100"的影蛭，读出它掉在脚边的那口油。 */
function killOil(game) {
  game.pickups.clear();
  const e = game.enemies.spawn('shade', 0, 0, 1, 1);
  e.oil = 100;
  game.enemies.damage(e, 1e9, game.lightCtx(), 0, 0, 0);
  const drop = game.pickups.all.find((p) => p.active && p.kind === 'oil');
  assert.ok(drop, '影蛭尸体旁应留下一口油');
  return drop.value;
}

/** 直接走一次「掠影」结算（移动路径最终也落到同一个 grazeEvent 上）。 */
function grazeOil(game) {
  game.player.oil = 0;
  game.player.oilMax = 1;
  game.player.stats.oilGainMult = 1;
  game.grazeEvent(0, 0, 'enemy', false);
  return game.player.oil;
}

/** 点燃一座灯台，读它补了多少油。 */
function pyreOil(game, difficulty) {
  game.newRun('warden', difficulty, false);
  game.player.oilMax = 1;
  game.player.oil = 0;
  game.ignitePyre(game.level.pyres[0]);
  return game.player.oil;
}

test('难度档的灯油进项：击杀掉落三档一致地缩放', async (t) => {
  const relaxed = killOil(await open(t, 'relaxed', 'kill-ly'));
  const normal = killOil(await open(t, 'normal', 'kill-nt'));
  const nightmare = killOil(await open(t, 'nightmare', 'kill-nm'));

  assert.equal(normal, 100, `标准档掉落应等于敌人油量（${normal}）`);
  assert.equal(relaxed, 135, `放松档掉落应是 1.35 倍（${relaxed}）`);
  assert.equal(nightmare, 75, `噩梦档掉落应是 0.75 倍（${nightmare}）`);
  assert.ok(relaxed > normal && normal > nightmare, '放松 > 标准 > 噩梦');
});

test('难度档的灯油进项：擦身回油也跟着缩放', async (t) => {
  const relaxed = grazeOil(await open(t, 'relaxed', 'graze-ly'));
  const normal = grazeOil(await open(t, 'normal', 'graze-nt'));
  const nightmare = grazeOil(await open(t, 'nightmare', 'graze-nm'));

  assert.ok(Math.abs(normal - 0.008) < 1e-9, `标准档擦身油应是基准值（${normal}）`);
  assert.ok(Math.abs(relaxed - 0.008 * 1.35) < 1e-9, `放松档应 ×1.35（${relaxed}）`);
  assert.ok(Math.abs(nightmare - 0.008 * 0.75) < 1e-9, `噩梦档应 ×0.75（${nightmare}）`);
});

test('难度档的灯油进项：灯台余温同样按档位给', async (t) => {
  const game = await open(t, 'relaxed', 'pyre');
  const relaxed = pyreOil(game, 'relaxed');
  const normal = pyreOil(game, 'normal');
  const nightmare = pyreOil(game, 'nightmare');

  assert.ok(Math.abs(normal - 0.14) < 1e-9, `标准档余温应是油箱的 14%（${normal}）`);
  assert.ok(Math.abs(relaxed - 0.14 * 1.35) < 1e-9, `放松档应 ×1.35（${relaxed}）`);
  assert.ok(Math.abs(nightmare - 0.14 * 0.75) < 1e-9, `噩梦档应 ×0.75（${nightmare}）`);
});

test('难度档的灯油进项：油箱容量与一次性补给都不该被这条倍率碰到', async (t) => {
  const relaxed = await open(t, 'relaxed', 'tank-ly');
  const normal = await open(t, 'normal', 'tank-nt');
  // 油箱容量是"起步条件"，不是"玩的时候的进项"——放松档不该把油箱也放大
  assert.equal(relaxed.player.oilMax, normal.player.oilMax, '难度不该改变油箱容量');

  // 悬赏奖励是一次给的补给，不走"进项"这条路，所以不该被难度倍率缩放
  const { data } = globalThis.window.__WICKLIGHT__;
  const oilBounty = data.bounties.find((b) => b.reward.oil);
  assert.ok(oilBounty, '悬赏表里应有一张补油的悬赏');
  const game = relaxed;
  game.player.oil = 0;
  game.player.oilMax = 1;
  game.bounties.force(oilBounty);
  game.bounties.state.done = true;
  game.checkBounty();
  assert.ok(Math.abs(game.player.oil - oilBounty.reward.oil) < 1e-9,
    `悬赏补油应原样给出，不乘难度倍率（${game.player.oil} vs ${oilBounty.reward.oil}）`);
});
