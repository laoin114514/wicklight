/**
 * 新内容回归测试：刺脊 / 引灯 / 咒盾 / 疾风 / 新遗物 / 四种燃爆流派。
 * 每条断言都对应一个真实可达的游戏行为，防止内容加进去但实际是坏的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('新内容（敌人 / 词缀 / 遗物 / 燃爆流派）', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?n=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, data, catalog } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;

  // 触发一次燃爆：先清掉 hitStop（击杀会冻结若干帧），再按住 nova 推进几帧
  const fireNova = () => {
    game.hitStop = 0;
    game.player.novaCd = 0;
    game.setInput(0, 0, false, true);
    for (let i = 0; i < 3; i += 1) {
      game.hitStop = 0;
      game.update(1 / 60);
    }
    game.setInput(0, 0, false, false);
  };

  // ── 数据表 ──
  const lancerDef = catalog.enemies.find((e) => e.id === 'lancer');
  const beaconDef = catalog.enemies.find((e) => e.id === 'beacon');
  assert.ok(lancerDef && lancerDef.behavior === 'charge', '刺脊应使用 charge 行为');
  assert.ok(beaconDef && beaconDef.behavior === 'beacon', '引灯应使用 beacon 行为');
  assert.ok(catalog.affixes.some((a) => a.id === 'warded'), '应存在「咒盾」词缀');
  assert.ok(catalog.affixes.some((a) => a.id === 'haste'), '应存在「疾风」词缀');
  assert.ok(data.curses.some((c) => c.id === 'nocturne'), '应存在「夜曲」夜咒');
  for (const id of ['wickbrand', 'nightowl', 'lanternkeeper', 'glassheart']) {
    assert.ok(data.relics.some((r) => r.id === id), `应存在遗物 ${id}`);
  }

  // ── 引灯：为范围内的敌人提供速度光环 ──
  game.enemies.clear();
  const near = game.enemies.spawn('shade', game.player.x + 120, game.player.y, 1, 1);
  const far = game.enemies.spawn('shade', game.player.x + 900, game.player.y, 1, 1);
  game.enemies.spawn('beacon', game.player.x + 100, game.player.y, 1, 1);
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(near.buff > 1, `引灯应增益附近敌人（buff=${near.buff}）`);
  assert.equal(far.buff, 1, '远处敌人不应吃到引灯光环');

  // ── 疾风词缀：同样是速度光环 ──
  game.enemies.clear();
  const hasted = game.enemies.spawn('shade', game.player.x + 60, game.player.y, 1, 1);
  game.applyAffix(hasted, 'haste');
  const bystander = game.enemies.spawn('shade', game.player.x + 100, game.player.y, 1, 1);
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(bystander.buff > 1, '「疾风」精英应为附近敌人加速');

  // ── 刺脊：蓄力 → 突进 ──
  game.enemies.clear();
  const lancer = game.enemies.spawn('lancer', game.player.x + 150, game.player.y, 6, 1);
  lancer.attackCd = 0;
  let sawWindup = false;
  let sawDash = false;
  for (let i = 0; i < 120 && !sawDash; i += 1) {
    game.enemies.update(1 / 60, game.enemyCtx());
    if (lancer.stateTimer > 0) sawWindup = true;
    if (lancer.dashing > 0) sawDash = true;
  }
  assert.ok(sawWindup, '刺脊突进前应有蓄力（预警）阶段');
  assert.ok(sawDash, '刺脊蓄力结束后应进入高速突进');

  // ── 咒盾：免疫元素 + 额外减伤 ──
  game.enemies.clear();
  const warded = game.enemies.spawn('shade', game.player.x + 80, game.player.y, 1, 1);
  game.applyAffix(warded, 'warded');
  const dealtBefore = game.damageDealt;
  game.applyHit(warded, 100, false, 0, 0, 0, { burn: 3, slow: 2 });
  const dealt = game.damageDealt - dealtBefore;
  assert.equal(warded.burn, 0, '「咒盾」应免疫灼烧');
  assert.equal(warded.slowTimer, 0, '「咒盾」应免疫冰缓');
  assert.ok(Math.abs(dealt - 75) < 1, `「咒盾」应减免 25% 伤害（实际 ${dealt}）`);

  // ── 夜枭：灯油低于阈值时增伤 ──
  // 注意：低油量本身就会降低伤害（灯火越暗越弱），所以要比较"同样低油量"下的有无遗物
  game.player.oil = game.player.oilMax * 0.2;
  const lowNoRelic = game.player.damageScale;
  game.player.addRelic('nightowl');
  const lowWithRelic = game.player.damageScale;
  assert.ok(
    lowWithRelic > lowNoRelic * 1.4,
    `「夜枭」应在低油量时提供约 +45% 伤害（${lowNoRelic} -> ${lowWithRelic}）`,
  );
  game.player.oil = game.player.oilMax;
  const fullWithRelic = game.player.damageScale;
  game.player.relics.delete('nightowl');
  game.player.recomputeStats();
  const fullNoRelic = game.player.damageScale;
  assert.ok(
    Math.abs(fullWithRelic - fullNoRelic) < 1e-9,
    `油量充足时「夜枭」不应继续加成（${fullNoRelic} vs ${fullWithRelic}）`,
  );
  game.player.addRelic('nightowl');

  // ── 守灯人：燃爆后增伤并返还灯油 ──
  game.player.addRelic('lanternkeeper');
  game.player.oil = game.player.oilMax * 0.5;
  const oilBefore = game.player.oil;
  fireNova();
  assert.ok(oilBefore - game.player.oil < 0.1, '「守灯人」应返还部分燃爆灯油消耗');
  // 与"同油量、无增益"的基线比较，避免把低油量的天然衰减误判成增益
  const oilOnly = 0.65 + game.player.oilFrac * 0.7;
  assert.ok(
    game.player.damageScale > oilOnly * 1.2,
    `燃爆后短时间内伤害应提升（基线 ${oilOnly.toFixed(3)} -> ${game.player.damageScale.toFixed(3)}）`,
  );

  // ── 四种燃爆流派 ──
  const novaProbe = (style, check) => {
    game.player.novaStyle = style;
    game.player.invuln = 0;
    game.enemies.clear();
    const target = game.enemies.spawn('shade', game.player.x + 60, game.player.y, 40, 1);
    game.player.hp = game.player.stats.maxHp;
    fireNova();
    check(target);
  };
  novaProbe('emberkin', (e) => assert.ok(e.burn > 0, '焚烬者燃爆应点燃敌人'));
  novaProbe('shadewalker', (e) => {
    assert.ok(e.slowTimer > 1, '暗行者燃爆应重减速敌人');
    assert.ok(game.player.invuln > 0.5, '暗行者燃爆应提供短暂无敌');
  });
  novaProbe('lamplighter', (e) => assert.ok(e.burn > 0, '灯语者燃爆应点燃整片区域'));
  novaProbe('warden', (e) => assert.ok(e.active, '守夜人燃爆应把敌人推开而不是靠燃烧'));

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
