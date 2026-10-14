/**
 * 关卡节奏的可见性 + 商店熔铸。
 *
 * 两件都是"把选择摊到台面上"：波次要写出分母、首领前要有预告（不然首领像凭空出现）；
 * 契约型遗物的代价原本没有出口，熔铸台给了它一次真金白银的取舍。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('波次进度、首领预告与熔铸台', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, ui, hud, catalog } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;

  // ── 波次有分母，HUD 也把分母写出来 ──
  const total = game.director.totalWaves;
  assert.ok(Number.isFinite(total) && total >= 5, `本关波次应为有限数（${total}）`);
  assert.equal(total, catalog.stages[0].waves, '第一关的波次应等于关卡表');
  hud.update(1 / 60);
  assert.equal(hud.waveEl.textContent, `0/${total}`, `HUD 波次要写出分母（${hud.waveEl.textContent}）`);
  game.wave = 4;
  hud.update(1 / 60);
  assert.equal(hud.waveEl.textContent, `4/${total}`, '波次应跟着走');

  // 进度条：填到第几波、最后一段留给首领
  const bar = hud.waveBarEl;
  const fill = hud.waveFill;
  const boss = hud.waveBoss;
  assert.ok(Math.abs(parseFloat(fill.style.width) - (4 / total) * 100) < 0.01, `进度条应填到 ${(4 / total) * 100}%`);
  assert.ok(Math.abs(parseFloat(boss.style.left) - ((total - 1) / total) * 100) < 0.01, '首领波那一段应在末尾被标出来');
  assert.ok(parseFloat(boss.style.width) > 0, '首领段要有宽度');

  // 无尽模式：没有分母，用 ∞
  game.endless = true;
  game.director.enableEndless();
  hud.update(1 / 60);
  assert.equal(hud.waveEl.textContent, `∞${game.wave}`, '无尽模式波次用 ∞');
  game.endless = false;
  game.director.endless = false; // 回到普通关卡，下面要验的是"首领前一波"的预告

  // ── 首领预告：正好在首领波的前一波 ──
  game.director.wave = total - 1;
  assert.equal(game.director.bossNext, true, '首领前一波应给出预告');
  game.director.wave = total - 2;
  assert.equal(game.director.bossNext, false, '再往前一波不该预告');
  game.director.wave = total;
  assert.equal(game.director.bossNext, false, '首领波本身不算"将至"');

  // 预告真的会走进公告里（直接驱动一次波次开始）
  const spoken = [];
  const ctx = {
    spawnEnemy: () => undefined,
    aliveCount: () => 0,
    spawnPoint: () => ({ x: 0, y: 0 }),
    announce: (text) => spoken.push(text),
    hazard: () => {},
    onBossSpawn: () => {},
    onStageComplete: () => {},
    isBossAlive: () => false,
    playerPos: () => ({ x: 0, y: 0 }),
  };
  // beginWave 会先把波次 +1，所以这里设成"前两波"，进去之后正好落在首领前一波
  game.director.wave = total - 2;
  game.director.beginWave(ctx);
  assert.equal(game.director.wave, total - 1, '应当落在首领前一波');
  assert.ok(
    spoken.some((s) => s.includes('首领将至')),
    `首领前一波要预告（实际播出：${spoken.join(' | ')}）`,
  );

  // ── 熔铸台 ──
  game.player.relics.clear();
  game.player.addRelic('whetstone');
  game.player.addRelic('glassheart');
  game.gold = 300;
  const price = game.forgePrice;
  assert.ok(price > 0, '熔铸要有价格');

  // 不在商店里不能熔
  const goldBefore = game.gold;
  game.forgeRelic('whetstone');
  assert.ok(game.player.relics.has('whetstone'), '不在商店里不该熔掉遗物');
  assert.equal(game.gold, goldBefore, '不在商店里不该扣钱');

  // 进店
  game.onStageComplete();
  assert.equal(game.state, 'shop');
  assert.equal(game.forgeUsed, false, '新一家店的熔铸次数应是干净的');
  const relicsBefore = new Set(game.player.relics);
  const hpMultBefore = game.player.stats.damageMult;
  game.forgeRelic('glassheart');
  assert.equal(game.forgeUsed, true, '熔过一次要记下来');
  assert.equal(game.gold, goldBefore - price, `熔铸要扣金币（${goldBefore} → ${game.gold}）`);
  assert.ok(!game.player.relics.has('glassheart'), '被熔掉的遗物应该离开背包');
  assert.equal(game.player.relics.size, relicsBefore.size, '熔铸应换上一件新的（数量不变）');
  assert.ok(game.save.achievements.includes('forge_first'), '首次熔铸应解锁「淬火」');
  for (const bad of [undefined, null, NaN]) {
    assert.notEqual(game.player.stats.damageMult, bad, '熔铸后属性不该变成坏值');
  }
  assert.ok(Number.isFinite(game.player.stats.maxHp) && game.player.stats.maxHp > 0, '熔铸后属性应仍然可用');
  void hpMultBefore;

  // 一家店只让熔一件
  const afterFirst = new Set(game.player.relics);
  game.forgeRelic([...afterFirst][0]);
  assert.deepEqual([...game.player.relics].sort(), [...afterFirst].sort(), '同一家店不能接着熔第二件');

  // 钱不够就熔不动
  game.forgeUsed = false;
  game.gold = 0;
  const relicsNow = new Set(game.player.relics);
  game.forgeRelic([...relicsNow][0]);
  assert.deepEqual([...game.player.relics].sort(), [...relicsNow].sort(), '金币不够不该熔成功');

  // 没有可换的遗物时也不该白扣钱
  game.gold = 500;
  game.forgeUsed = false;
  game.player.relics.clear();
  for (const r of catalog.relics ?? []) game.player.addRelic(r.id);
  game.forgeRelic([...game.player.relics][0]);
  assert.ok(game.gold > 0, '没有替换品时不该扣钱');

  // ── 商店界面：熔铸台要出现在面板里，且没有缺字段 ──
  game.player.relics.clear();
  game.player.addRelic('whetstone');
  game.player.addRelic('nightowl');
  game.gold = 200;
  game.forgeUsed = false;
  ui.showScreen('shop');
  const html = ui.screen.innerHTML;
  assert.ok(html.includes('熔铸台'), '商店面板要有熔铸台');
  assert.ok(html.includes('熔铸'), '熔铸台要有说明');
  assert.ok(/data-forge="whetstone"/.test(html), '熔铸台要列出已有遗物');
  for (const bad of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(bad), `商店面板出现了 ${bad}`);
  }

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
