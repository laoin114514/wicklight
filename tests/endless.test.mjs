/**
 * 无尽之夜「深潜」：轮次看得见、首领前有预告、第 3 轮起双首领、第 5 轮起三首领。
 *
 * 无尽原本只是一直刷下去，首领每 5 波冒一个、没有节奏也没有预告。
 * 现在每一轮仍是 5 波，进度条改成"离下一轮首领还有几波"，
 * 首领前一波会预告，第 3 轮开始两位首领一起上，第 5 轮三位同台——
 * 单只首领的招式早就背熟了，加人才是新的题。同台越多，各自压得越低。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('无尽之夜：轮次、首领预告与双 / 三首领', async (t) => {
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
  game.newRun('warden', 'normal', true);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;
  // 让敌人系统拿到 context（死亡回调要靠它），不然直接结算伤害不会触发死亡
  game.enemies.update(1 / 60, game.enemyCtx());
  const d = game.director;
  const ctx = () => game.directorCtx(catalog.stages[catalog.stages.length - 1]);

  // ── 轮次：每 5 波一轮 ──
  d.wave = 15;
  assert.equal(d.round, 3, '第 15 波应是第 3 轮');
  d.wave = 19;
  assert.equal(d.round, 3, '第 19 波仍是第 3 轮');
  d.wave = 20;
  assert.equal(d.round, 4, '第 20 波进入第 4 轮');

  // ── 首领预告：无尽里也要给，不然首领就是凭空出现 ──
  d.wave = 3;
  assert.equal(d.bossNext, false, '离首领还两波时不该预告');
  d.wave = 4;
  assert.equal(d.bossNext, true, '首领前一波要预告');
  d.wave = 5;
  assert.equal(d.bossNext, false, '首领波本身不算"将至"');

  // ── 前两轮：一只首领 ──
  for (const wave of [5, 10]) {
    game.enemies.clear();
    d.wave = wave - 1;
    d.beginWave(ctx());
    assert.equal(d.bossPair, false, `第 ${wave} 波不该是双首领`);
    assert.equal(game.enemies.bosses.length, 1, `第 ${wave} 波应只有一位首领（实际 ${game.enemies.bosses.length}）`);
  }

  // ── 第 3 轮：两位不同的首领 ──
  game.enemies.clear();
  d.wave = 14;
  d.beginWave(ctx());
  assert.equal(d.bossPair, true, '第 3 轮应是双首领');
  const pair = [...game.enemies.bosses];
  assert.equal(pair.length, 2, `第 3 轮应上来两位首领（实际 ${pair.length}）`);
  assert.notEqual(pair[0].defId, pair[1].defId, '两位首领应是不同的');
  for (const b of pair) {
    assert.ok(b.maxHp > 0 && Number.isFinite(b.maxHp), `首领 ${b.defId} 的血量不该是坏值`);
    assert.ok(!b.affix, '首领不该被挂上精英词缀');
  }
  // 两位首领按同一倍率强化，而且都被压过血——不能把两只满血首领直接叠在一起
  const baseHp = (id) => catalog.enemies.find((e) => e.id === id).hp;
  const scaleA = pair[0].maxHp / baseHp(pair[0].defId);
  const scaleB = pair[1].maxHp / baseHp(pair[1].defId);
  assert.ok(Math.abs(scaleA - scaleB) < 1e-6, `两位首领该按同一倍率强化（${scaleA.toFixed(3)} vs ${scaleB.toFixed(3)}）`);
  assert.ok(scaleA < d.hpMult * 0.9, `成对出现时每位首领都该被压血（成对 ${scaleA.toFixed(3)} vs 单只 ${(d.hpMult * 0.9).toFixed(3)}）`);
  for (const b of pair) assert.ok(Math.hypot(b.x - game.player.x, b.y - game.player.y) > 120, '首领不该刷在脸上');

  // ── 两位都倒下才算清场：先倒一只，导演还停在首领相位 ──
  const ctxNow = ctx();
  game.enemies.damage(pair[0], 1e9, game.lightCtx(), 0, 0, 0);
  d.update(1 / 60, ctxNow);
  assert.equal(d.phase, 'boss', '还有一只首领站着，这一波不该结束');
  assert.equal(game.enemies.bosses.length, 1);
  assert.ok(!game.save.achievements.includes('twin_boss'), '只倒一只不算双首同焚');

  // ── 第二只倒下：整波结算，进入下一轮的补给站 ──
  game.enemies.damage(pair[1], 1e9, game.lightCtx(), 0, 0, 0);
  assert.ok(game.enemies.bosses.length === 0, '两只都该倒下');
  d.update(1 / 60, ctxNow);
  assert.equal(game.state, 'shop', '清场后应进入补给站');
  assert.ok(game.shopHeader.includes('第 3 轮'), `无尽补给站要写出轮次（实际「${game.shopHeader}」）`);
  assert.ok(game.save.achievements.includes('twin_boss'), '同一波击败两位首领应解锁成就');
  assert.ok(game.player.hp > 0, '玩家应还活着');

  // ── 第 5 轮：三位首领同台 ──
  game.enemies.clear();
  game.state = 'playing';
  d.wave = 24;
  d.beginWave(ctx());
  assert.equal(d.bossCount, 3, '第 5 轮应同时上来三位首领');
  assert.equal(d.bossPair, true, '三位同台时 bossPair 也应为真（继续走双首领的清场逻辑）');
  const trio = [...game.enemies.bosses];
  assert.equal(trio.length, 3, `第 5 轮应上来三位首领（实际 ${trio.length}）`);
  assert.equal(new Set(trio.map((b) => b.defId)).size, 3, '三位首领应互不相同');
  // 同台三位要压得比双首领更低——不然只是把时间拉长
  const trioScale = trio[0].maxHp / baseHp(trio[0].defId);
  assert.ok(trioScale < d.hpMult * 0.62, `三位同台时每位首领该被压得更低（${trioScale.toFixed(3)} vs 双首 ${(d.hpMult * 0.62).toFixed(3)}）`);
  for (const b of trio) {
    assert.ok(Math.abs(b.maxHp / baseHp(b.defId) - trioScale) < 1e-6, '三位首领该按同一倍率强化');
    assert.ok(Number.isFinite(b.maxHp) && b.maxHp > 0, '首领血量不该是坏值');
  }
  // 前两位倒下时这一波还没完，只有第三位也倒下才结算
  for (const b of [trio[0], trio[1]]) game.enemies.damage(b, 1e9, game.lightCtx(), 0, 0, 0);
  d.update(1 / 60, ctx());
  assert.equal(d.phase, 'boss', '还有一位站着，这一波不该结束');
  assert.ok(!game.save.achievements.includes('trio_boss'), '还有一位站着就不该解锁三首同辉');
  game.enemies.damage(trio[2], 1e9, game.lightCtx(), 0, 0, 0);
  d.update(1 / 60, ctx());
  assert.ok(game.save.achievements.includes('trio_boss'), '三位都倒下应解锁「三首同辉」');

  // ── 多首领血条：同台几位就写几行，血量各自对应 ──
  game.enemies.clear();
  game.state = 'playing';
  d.wave = 24;
  d.beginWave(ctx());
  game.hitStop = 0; // 击杀首领有顿帧，先清掉，不然世界是冻住的
  game.update(1 / 60);
  assert.equal(game.bossList.length, 3, `bossList 应记下三位首领（实际 ${game.bossList.length}）`);
  assert.equal(game.bossName, game.bossList[0].name, '单条血条显示的是第一位首领的名字');
  hud.update(1 / 60);
  assert.equal(hud.bossRowEls.length, 3, 'HUD 应画三行首领血条');
  assert.equal(hud.bossRowEls[0].name.textContent, game.bossList[0].name, '第一行写的是第一位首领的名字');
  assert.equal(hud.bossRowEls[2].name.textContent, game.bossList[2].name, '第三行写的是第三位首领的名字');
  assert.ok(parseFloat(hud.bossRowEls[1].fill.style.width) > 0, '中间那行也要有血量宽度');
  // 打掉两位：血条该跟着少两行
  for (const b of [game.enemies.bosses[0], game.enemies.bosses[1]]) game.enemies.damage(b, 1e9, game.lightCtx(), 0, 0, 0);
  game.hitStop = 0; // 击杀首领有顿帧，先清掉，不然世界是冻住的
  game.update(1 / 60);
  hud.update(1 / 60);
  assert.equal(hud.bossRowEls.length, 1, '只剩一位首领时只留一行血条');
  assert.equal(hud.bossRowEls[0].name.textContent, game.bossList[0].name, '留下的那一行是还站着的那位');
  // 全场清空：血条整块收起来
  game.enemies.damage(game.enemies.bosses[0], 1e9, game.lightCtx(), 0, 0, 0);
  game.hitStop = 0; // 击杀首领有顿帧，先清掉，不然世界是冻住的
  game.update(1 / 60);
  hud.update(1 / 60);
  assert.equal(hud.bossRowEls.length, 0, '首领都倒下后血条应清空');
  assert.equal(game.bossName, null, 'bossName 也该归位');

  // ── 无尽进度条：填到这一轮的哪一波，并把首领那一段标出来 ──
  game.endless = true;
  d.endless = true;
  game.wave = 7;
  hud.update(1 / 60);
  assert.equal(hud.waveEl.textContent, '∞7', '无尽波次用 ∞');
  assert.ok(Math.abs(parseFloat(hud.waveFill.style.width) - 40) < 0.01, `第 7 波应填到 40%（实际 ${hud.waveFill.style.width}）`);
  assert.notEqual(hud.waveBoss.style.display, 'none', '无尽里首领那一段要看得见');
  assert.ok(parseFloat(hud.waveBoss.style.width) > 0, '首领段要有宽度');

  assert.deepEqual(errors, [], `不应有 console 错误：${errors.join(' | ')}`);
});
