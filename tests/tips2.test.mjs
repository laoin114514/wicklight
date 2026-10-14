/**
 * 「第一次」讲全：第一次拿到某把武器、第一次完成进化、第一次走进某一关。
 * 和 tips.test.mjs（精英 / 首领 / 险境）互补——这里管的是"我的东西"和"我要去哪儿"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('首次武器 / 进化 / 关卡提示：各讲一次，内容写全', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, hud, data, catalog } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  // newRun 会顺路进第一关，先清空，从第一张卡真正开始数
  game.save.tips = [];

  const allCards = () => hud.toastRoot.children.filter((c) => String(c.className).includes('toast--tip'));
  // newRun 进第一关时可能已经弹过卡，这里只数"从这一刻起"新增的
  const base = allCards().length;
  const cards = () => allCards().length - base;
  const card = (i) => allCards()[base + i];
  const text = (el) => `${el.innerHTML}`;
  const clean = (s) => !/undefined|NaN|\[object Object\]/.test(s);

  // ── 第一次拿到一把武器：讲清它是什么、能长成什么 ──
  const wisp = data.weapons.find((w) => w.id === 'wisp');
  assert.ok(wisp && wisp.evolve, '测试前提：追踪火苗有进化线');
  game.chooseUpgrade({ kind: 'weapon', id: 'wisp', name: wisp.name, blurb: wisp.blurb, icon: '🔥', color: '#7be0ff', level: 1, maxLevel: 5, tag: 'new' });
  assert.equal(cards(), 1, `首次拿到武器应弹一张提示卡（${cards()}）`);
  let body = text(card(0));
  assert.ok(body.includes('武器 · 追踪火苗'), `提示标题应写武器名（${body}）`);
  assert.ok(body.includes('自动追向最近的黑暗'), `提示正文应是这把武器的说明（${body}）`);
  assert.ok(body.includes('满级 + 油雨 满级即可进化成「群萤」'), `提示要给出进化指引（${body}）`);
  assert.ok(clean(body), `提示卡出现了 undefined / NaN / [object Object]：${body}`);
  assert.ok(game.save.tips.includes('weapon:wisp'), '提示应写进存档（weapon:<id>）');

  // ── 再拿一次同款：不再打扰 ──
  game.chooseUpgrade({ kind: 'weapon', id: 'wisp', name: wisp.name, blurb: wisp.blurb, icon: '🔥', color: '#7be0ff', level: 2, maxLevel: 5, tag: 'level' });
  assert.equal(cards(), 1, '同一把武器只讲一次');

  // ── 没有进化线的武器：也得给一句话，别留空 ──
  game.chooseUpgrade({ kind: 'weapon', id: 'ring_corona', name: '日冕', blurb: '恒定的火焰光环，范围巨大且不熄灭。', icon: '☀️', color: '#fff0a8', level: 1, maxLevel: 5, tag: 'new' });
  assert.equal(cards(), 2, '换一把没见过的武器应该再讲一次');
  body = text(card(1));
  assert.ok(body.includes('武器 · 日冕'), `提示标题应写武器名（${body}）`);
  assert.ok(body.includes('没有进化线'), `没有进化线时也要说明（${body}）`);
  assert.ok(clean(body), `提示卡出现了 undefined / NaN：${body}`);

  // ── 第一次完成进化：讲清它是什么东西 ──
  game.chooseUpgrade({ kind: 'weapon', id: 'wisp_swarm', name: '群萤', blurb: '成群的飞萤追踪黑暗，穿刺后继续飞行。', icon: '🔥', color: '#a8f0ff', level: 1, maxLevel: 5, tag: 'evolve' });
  assert.equal(cards(), 3, '首次完成进化应弹一张提示卡');
  body = text(card(2));
  assert.ok(body.includes('进化 · 群萤'), `进化提示标题应是「进化 · 名字」（${body}）`);
  assert.ok(body.includes('成群的飞萤追踪黑暗'), `进化提示要写出进化武器的说明（${body}）`);
  assert.ok(body.includes('不再升级'), `进化提示要说明它不再升级（${body}）`);
  assert.ok(clean(body), `提示卡出现了 undefined / NaN：${body}`);
  assert.ok(game.save.tips.includes('evolve:wisp_swarm'), '进化提示应写进存档（evolve:<id>）');

  // ── 商店里买到武器，也要讲（第二条触发路径）──
  const frost = data.weapons.find((w) => w.id === 'frost');
  assert.ok(frost, '测试前提：霜棱存在');
  game.shopItems = [{ kind: 'upgrade', id: 'frost', price: 0, sold: false, offer: { kind: 'weapon', id: 'frost', name: frost.name, blurb: frost.blurb, icon: '❄️', color: '#a9d8ff', level: 1, maxLevel: 5, tag: 'new' } }];
  game.gold = 10;
  assert.equal(game.buyShop(0), true, '应能买下武器');
  assert.equal(cards(), 4, '商店买到新武器也该弹一次提示');
  assert.ok(text(card(3)).includes(`武器 · ${frost.name}`), `商店提示写的是这把武器的名字（${text(card(3))}）`);
  assert.ok(game.save.tips.includes('weapon:frost'), '商店提示也要写进存档');

  // ── 第一次走进某一关：主题 / 险境 / 首领一起说 ──
  const ashen = catalog.stages[1];
  assert.equal(ashen.id, 'ashenkeep', '测试前提：第二关是残堡');
  game.loadStage(ashen, 1, false);
  assert.equal(cards(), 5, `首次走进一关应弹一张提示卡（${cards()}）`);
  body = text(card(4));
  assert.ok(body.includes('关卡 · 残堡'), `关卡提示标题应是主题名（${body}）`);
  assert.ok(body.includes('被熄灯者占据的废墟'), `关卡提示要写出副标题（${body}）`);
  assert.ok(body.includes('塌方') && body.includes('相位风暴'), `险境要用中文名写出来（${body}）`);
  assert.ok(!body.includes('collapse') && !body.includes('wispstorm'), `险境不该露出原始 id（${body}）`);
  assert.ok(body.includes('熄灯者'), `关卡提示要写出首领名（${body}）`);
  assert.ok(clean(body), `提示卡出现了 undefined / NaN：${body}`);
  assert.ok(game.save.tips.includes('stage:ashenkeep'), '关卡提示应写进存档（stage:<id>）');

  // ── 再进同一关：不再打扰 ──
  game.loadStage(ashen, 1, false);
  assert.equal(cards(), 5, '同一关只讲一次');

  // ── 没有险境、没有首领的关：也得给一句干净的话，不能留空或露 undefined ──
  const plain = catalog.stages[0];
  const bare = {
    ...plain,
    id: 'bare-test',
    theme: { ...plain.theme, name: '空廊', subtitle: '什么都没有' },
    hazards: [],
    boss: null,
  };
  game.loadStage(bare, 3, false);
  assert.equal(cards(), 6, '走进另一关应再弹一次');
  const bareBody = text(card(5));
  assert.ok(bareBody.includes('关卡 · 空廊'), `空关提示标题用主题名（${bareBody}）`);
  assert.ok(bareBody.includes('险境：无'), `没有险境时要写"无"（${bareBody}）`);
  assert.ok(!bareBody.includes('首领'), `没有首领时不该出现"首领"字样（${bareBody}）`);
  assert.ok(clean(bareBody), `空关提示不该有 undefined：${bareBody}`);
  assert.ok(game.save.tips.includes('stage:bare-test'), '空关提示也要写进存档');

  // ── 存档卫生 + 老存档兜底 ──
  assert.ok(Array.isArray(game.save.tips), 'tips 应是数组');
  assert.ok(game.save.tips.every((k) => typeof k === 'string' && k.length > 0), 'tips 里只能是非空字符串');
  delete game.save.tips;
  game.chooseUpgrade({ kind: 'weapon', id: 'spray', name: '喷火', blurb: '向前喷出一道短焰，灼烧成片。', icon: '🔥', color: '#ff9a4d', level: 1, maxLevel: 5, tag: 'new' });
  assert.ok(Array.isArray(game.save.tips) && game.save.tips.includes('weapon:spray'), '老存档没有 tips 字段时应自动补上');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
