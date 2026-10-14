/**
 * 局外解锁树：新节点要真的改变开局，而不是只改一行文案。
 *
 * 这里的每一项都从"买下 → 开一局"走一遍，验证解锁确实落到了玩家身上：
 * 金币、灯火、移速、开局遗物、生命叠加。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** MetaSystem.bonuses() 认得的所有键——加节点时必须落在这里面，不然买了等于没买。 */
const KNOWN_KEYS = new Set([
  'hpMult',
  'oilMult',
  'emberMult',
  'dashMult',
  'rerolls',
  'weaponLevel',
  'startPassives',
  'revives',
  'lantern',
  'startGold',
  'startRelic',
  'lightMult',
  'moveSpeedMult',
]);

test('解锁树：新节点真的改变开局', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data, ui } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  // ── 表完整性 ──
  const tree = data.meta;
  assert.ok(Array.isArray(tree) && tree.length >= 16, `解锁树节点偏少（${tree.length}）`);
  const ids = new Set(tree.map((n) => n.id));
  assert.equal(ids.size, tree.length, '解锁树节点 id 不该重复');
  for (const n of tree) {
    assert.ok(n.cost > 0, `${n.id} 应有价格`);
    assert.ok(n.blurb && n.name, `${n.id} 缺少名称或说明`);
    assert.ok(KNOWN_KEYS.has(n.effect.key), `${n.id} 的效果键 ${n.effect.key} 没有落地`);
    if (n.requires) assert.ok(ids.has(n.requires), `${n.id} 的前置 ${n.requires} 不存在`);
    assert.ok(!(n.requires === n.id), `${n.id} 不该以自己为前置`);
  }
  // 前置链不该有环：从每个节点往上走，最多走节点数那么多步
  for (const n of tree) {
    let cur = n;
    for (let i = 0; i < tree.length + 1 && cur.requires; i += 1) {
      cur = tree.find((x) => x.id === cur.requires);
    }
    assert.ok(!cur.requires, `${n.id} 的前置链出现了环`);
  }

  game.bootDone();
  game.save.meta = [];
  game.save.embers = 100000;

  // ── 对照组：没买任何节点时的一局 ──
  game.newRun('warden', 'normal', false);
  const baseHp = game.player.stats.maxHp;
  const baseSpeed = game.player.stats.moveSpeed;
  const baseGold = game.gold;
  const baseLight = game.player.baseLightMult;
  const baseRelics = game.player.relics.size;

  // ── 前置没买时不能买后续 ──
  assert.equal(game.meta.canBuy(data.meta.find((n) => n.id === 'coinpurse')), false, '前置没买时不该能买');
  assert.equal(game.buyMeta('coinpurse'), false, '买不了就不该扣余烬');

  // ── 先买「引火 + 薪火」：两个生命节点要按加法叠起来 ──
  const buy = (id) => {
    assert.equal(game.buyMeta(id), true, `应能买下 ${id}`);
    assert.ok(game.save.meta.includes(id), `${id} 应写进存档`);
  };
  buy('kindling');
  buy('kindling2');
  game.newRun('warden', 'normal', false);
  assert.ok(
    Math.abs(game.player.stats.maxHp - baseHp * 1.24) < 1e-6,
    `引火 + 薪火应叠成 +24%（${baseHp} → ${game.player.stats.maxHp}）`,
  );
  assert.equal(game.gold, baseGold, '还没买钱袋，开局金币不该变');
  assert.equal(game.player.relics.size, baseRelics, '还没买旧灯，开局不该带遗物');

  // ── 再买其余节点：金币 / 灯火 / 移速 / 开局遗物 ──
  // 开局遗物会带上自己的修正（有的还牵动灯火共鸣），所以生命单独在上面验
  for (const id of ['purse', 'coinpurse', 'nightvision', 'wicks', 'swiftstep', 'warmstart', 'oldlamp']) {
    buy(id);
  }
  game.newRun('warden', 'normal', false);
  const p = game.player;

  assert.ok(game.gold >= baseGold + 40, `钱袋应让开局金币 +40（${baseGold} → ${game.gold}）`);
  assert.ok(Math.abs(p.baseLightMult - (baseLight + 0.12)) < 1e-6, `暗视应让起始灯火 +12%（${p.baseLightMult}）`);
  // 开局遗物自己也可能带移速（轻羽 / 疾风靴 / 厚皮……），所以先把局外加成摘掉量一次基线，
  // 再比"有它 / 没它"的比值——这样量到的才是夜行那一份，而不是随机遗物的运气
  const speedWithMeta = p.stats.moveSpeed;
  const savedMeta = p.metaMods.moveSpeedMult;
  p.metaMods.moveSpeedMult = 1;
  p.recomputeStats();
  const speedNoMeta = p.stats.moveSpeed;
  p.metaMods.moveSpeedMult = savedMeta;
  p.recomputeStats();
  assert.ok(
    Math.abs(speedWithMeta / speedNoMeta - 1.07) < 1e-6,
    `夜行应让起始移速 +7%（${speedNoMeta} → ${speedWithMeta}）`,
  );
  assert.equal(p.relics.size, baseRelics + 1, `旧灯应让开局多一件遗物（${baseRelics} → ${p.relics.size}）`);
  const relicId = [...p.relics][0];
  assert.ok(game.codex.entry(`relic:${relicId}`), '开局遗物应同时进图鉴');
  assert.ok(Number.isFinite(p.stats.damageMult) && p.stats.damageMult > 0, '开局属性不该被加成弄坏');
  assert.ok(p.stats.maxHp > 0 && p.hp > 0, '开局应是满血');

  // 移速加成要经得起"中途重算"（拿到遗物会 recomputeStats，别把局外加成冲掉）
  const beforeRelic = p.stats.moveSpeed;
  p.addRelic('loom');
  p.recomputeStats();
  // 织光囊只加拾取范围，所以移速应当分毫不动——被冲掉的话这里立刻就会掉下来
  assert.ok(
    Math.abs(p.stats.moveSpeed - beforeRelic) < 1e-6,
    `拿到遗物重算之后，夜行的移速加成仍该在（${beforeRelic} → ${p.stats.moveSpeed}）`,
  );

  // ── 面板：把新节点也渲染出来，且没有缺字段 ──
  ui.showScreen('meta');
  const html = ui.screen.innerHTML;
  for (const n of tree) assert.ok(html.includes(n.name), `解锁树应列出「${n.name}」`);
  assert.ok(!/undefined|NaN/.test(html), '解锁树面板不该出现缺字段');

  assert.deepEqual(errors, [], `不应有 console 错误：${errors.join(' | ')}`);
});
