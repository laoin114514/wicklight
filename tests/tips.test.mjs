/**
 * 首次遭遇提示：第一次碰上精英 / 首领 / 险境时该给一句"怎么打"，
 * 而且只给一次——同一个"咒盾烛母"讲两遍就变成噪音了。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('首次遭遇提示：精英 / 首领 / 险境各讲一次', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, hud } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.save.tips = [];

  const cards = () => hud.toastRoot.children.filter((c) => String(c.className).includes('toast--tip'));
  const text = (el) => `${el.innerHTML}`;

  // ── 普通敌人不该弹卡（不然第一关就被提示糊住）──
  game.enemies.clear();
  game.enemies.spawn('shade', game.player.x + 200, game.player.y, 1, 1);
  game.scanEncounters();
  assert.equal(cards().length, 0, '普通敌人不弹提示');
  assert.deepEqual(game.save.tips, [], '普通敌人不该写进提示存档');

  // ── 精英：一条敌人 + 一条词缀，合成一张卡 ──
  game.enemies.clear();
  const elite = game.enemies.spawn('wickmother', game.player.x + 260, game.player.y, 1, 1);
  game.applyAffix(elite, 'warded');
  game.scanEncounters();
  assert.equal(cards().length, 1, `首次遇到精英应弹一张提示卡（${cards().length}）`);
  const card = text(cards()[0]);
  assert.ok(card.includes('烛母') && card.includes('咒盾'), `提示要写清是谁、带什么词缀（${card}）`);
  assert.ok(card.includes('免疫灼烧'), '词缀提示要说清它的效果');
  assert.ok(game.save.tips.includes('wickmother|warded'), '提示应写进存档（按敌人 + 词缀去重）');
  for (const bad of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!card.includes(bad), `提示卡出现了 ${bad}`);
  }

  // ── 同一只精英 + 同一个词缀：不再打扰 ──
  game.enemies.clear();
  const again = game.enemies.spawn('wickmother', game.player.x + 260, game.player.y, 1, 1);
  game.applyAffix(again, 'warded');
  game.scanEncounters();
  assert.equal(cards().length, 1, '同一种精英 + 同一个词缀只讲一次');

  // ── 换个词缀就是新的应对，该讲 ──
  game.enemies.clear();
  const other = game.enemies.spawn('wickmother', game.player.x + 260, game.player.y, 1, 1);
  game.applyAffix(other, 'venom');
  game.scanEncounters();
  assert.equal(cards().length, 2, '换了词缀应该再讲一次');
  assert.ok(text(cards()[1]).includes('剧毒'), '第二张卡讲的是新词缀');

  // ── 首领 ──
  game.enemies.clear();
  game.enemies.spawn('nightfall', game.player.x + 320, game.player.y, 1, 1);
  game.scanEncounters();
  assert.equal(cards().length, 3, '首次遇到首领要弹提示');
  assert.ok(text(cards()[2]).includes('终夜'), '首领提示写的是首领名');
  assert.ok(game.save.tips.includes('nightfall|'), '首领提示按敌人去重');

  // ── 险境：每种只讲一次 ──
  game.enemies.clear();
  const before = cards().length;
  game.handleHazard('echoes');
  assert.equal(cards().length, before + 1, '首次遇到险境要弹提示');
  assert.ok(text(cards()[before]).includes('险境'), '险境提示带了类别前缀');
  assert.ok(game.save.tips.includes('hazard:echoes'), '险境提示应写进存档');
  game.handleHazard('echoes');
  assert.equal(cards().length, before + 1, '同一个险境只讲一次');
  game.handleHazard('meteor');
  assert.equal(cards().length, before + 2, '换个险境要讲');

  // ── 存档里不该因此长出奇怪的东西，且老存档（没有 tips 字段）也能正常用 ──
  assert.ok(Array.isArray(game.save.tips), 'tips 应是数组');
  assert.ok(game.save.tips.every((k) => typeof k === 'string' && k.length > 0), 'tips 里只能是非空字符串');
  delete game.save.tips;
  game.enemies.clear();
  game.handleHazard('oilvoid');
  assert.ok(Array.isArray(game.save.tips) && game.save.tips.includes('hazard:oilvoid'), '老存档没有 tips 字段时应自动补上');

  // ── 走主循环也要能触发（挂载点没被改坏）──
  game.enemies.clear();
  game.save.tips = [];
  game.enemies.spawn('darkless', game.player.x + 200, game.player.y, 1, 1);
  const beforeLoop = cards().length;
  for (let i = 0; i < 60; i += 1) game.update(1 / 60);
  assert.ok(cards().length > beforeLoop, '主循环里的扫描也要能把提示弹出来');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
