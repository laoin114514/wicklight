/**
 * 升级卡要回答的问题：点了它，我会变成什么样。
 *
 * 简介只说"这把武器是什么"，可三选一真正要权衡的是"下一级的数"——
 * 尤其是同一把武器的第 3 级和第 4 级，名字一样、图标一样，差的只有数。
 * 所以卡上要写清这一级改了什么（伤害 42 → 52），以及这是谁的第几级（刻度）。
 * 另一条同样重要：这些数只能是**预览**算出来的，不能为了预览就把属性写进玩家身上
 * （那会让没点的卡先加上属性，还会把血条顶到超过上限）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('升级卡：数值对照 + 等级刻度，而且预览不动真身', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  const p = game.player;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;

  const offer = (o) => {
    game.ui.setOffers([o], 0);
    game.ui.showScreen('levelup');
    return String(game.ui.screen.innerHTML);
  };
  const weapon = (id) => data.weapons.find((w) => w.id === id);

  // ── 预览：算得出来，但不落到玩家身上 ──
  const before = { ...p.stats };
  const hpBefore = p.hp;
  const preview = p.previewStats({ id: 'might', level: 3 });
  assert.ok(preview.damageMult > before.damageMult, `预览应算上第 3 级「灼心」（${preview.damageMult}）`);
  assert.equal(p.stats.damageMult, before.damageMult, '预览不该改玩家的伤害倍率');
  assert.equal(p.stats.maxHp, before.maxHp, '预览不该改玩家的生命上限');
  assert.equal(p.hp, hpBefore, '预览不该碰血条');
  assert.deepEqual(p.passives.get('might') ?? 0, 0, '预览不该把被动塞进玩家身上');
  assert.equal(p.previewStats().damageMult, p.stats.damageMult, '不传参数就是"此刻重算一遍"');

  // ── 武器升级卡：写的是"当前级 → 下一级" ──
  p.addWeapon('fireball');
  p.levelWeapon('fireball');
  p.levelWeapon('fireball'); // 现在 3 级
  const fw = weapon('fireball');
  const from = fw.levels[2];
  const to = fw.levels[3];
  let html = offer({ kind: 'weapon', id: 'fireball', name: fw.name, blurb: fw.blurb, icon: '🔥', color: fw.color, level: 4, maxLevel: 5, tag: 'level' });
  assert.ok(html.includes(`伤害</span><span class="dl__from">${Math.round(from.damage)}`), `要写出升级前的伤害（${Math.round(from.damage)}）`);
  assert.ok(html.includes(`<span class="dl__to">${Math.round(to.damage)}`), `要写出升级后的伤害（${Math.round(to.damage)}）`);
  assert.ok(to.damage > from.damage, '测试前提：这一级确实涨了伤害');
  for (const bad of ['undefined', 'NaN', 'Infinity', '[object']) assert.ok(!html.includes(bad), `卡面出现了 ${bad}`);

  // ── 刻度：几格 = 满级是几级，亮着的 = 已经拿到几级，正在点的那一格在呼吸 ──
  assert.equal((html.match(/card__pips/g) ?? []).length, 1, '卡上应有一排刻度');
  assert.equal((html.match(/class="is-on"/g) ?? []).length, 3, '已到 3 级应亮三格');
  assert.equal((html.match(/class="is-next"/g) ?? []).length, 1, '正在点亮的那一格应只有一格');
  assert.equal((html.match(/<i/g) ?? []).length, 5, '火球满级 5 级，刻度应有 5 格');

  // ── 被动卡：写的是"这套属性会变成什么样"，倍率写成 ×1.xx ──
  html = offer({ kind: 'passive', id: 'might', name: '灼心', blurb: '所有伤害 +12%', icon: '⚔️', color: '#ff7a2f', level: 3, maxLevel: 6, tag: 'level' });
  const now = p.previewStats().damageMult;
  const next = p.previewStats({ id: 'might', level: 3 }).damageMult;
  assert.ok(html.includes(`×${now.toFixed(2)}`), `被动卡要写出现在的伤害倍率（×${now.toFixed(2)}）`);
  assert.ok(html.includes(`×${next.toFixed(2)}`), `以及点下去之后的（×${next.toFixed(2)}）`);

  // ── 进化卡：换的是打法，只写"变强"的那两项，不把少掉的发数当成缩水 ──
  html = offer({ kind: 'weapon', id: 'wisp_swarm', name: '群萤', blurb: '进化：成群的飞萤。', icon: '🌟', color: '#a8f0ff', level: 1, maxLevel: 5, tag: 'evolve' });
  const oldWisp = weapon('wisp').levels.at(-1);
  const swarm = weapon('wisp_swarm').levels[0];
  assert.ok(html.includes(`<span class="dl__to">${Math.round(swarm.damage)}`), `进化卡要写出进化后的伤害（${Math.round(swarm.damage)}）`);
  assert.ok(html.includes(`伤害</span><span class="dl__from">${Math.round(oldWisp.damage)}`), '前半截是满级旧武器的伤害');
  assert.ok(!html.includes('数量'), '进化卡不写"发数变少"那种误导性的对照');
  assert.ok(html.includes('满级武器 + 满级被动 = 进化'), '进化卡仍然解释进化条件');

  // ── 「穿透 99」是数据里的写法，卡面上要写成 ∞ ──
  const beam = weapon('beam');
  assert.equal(beam.levels[0].pierce, 99, '测试前提：光矛在数据里用 99 表示"沿途全部串起来"');
  html = offer({ kind: 'weapon', id: 'beam', name: beam.name, blurb: beam.blurb, icon: '✨', color: beam.color, level: 1, maxLevel: 5, tag: 'new' });
  assert.ok(html.includes('<span class="dl__to">∞'), '穿透该写 ∞');
  assert.ok(!html.includes('99'), '卡面不该把数据里的 99 印出来');

  // ── 整池渲染一遍：任何一张卡都不许出现 NaN / undefined ──
  const pool = game.upgrades.generate(p, 60, game.rng);
  assert.ok(pool.length > 8, `一整池应该有很多候选（${pool.length}）`);
  game.ui.setOffers(pool, 1);
  game.ui.showScreen('levelup');
  const all = String(game.ui.screen.innerHTML);
  for (const bad of ['undefined', 'NaN', 'Infinity', '[object', '×0.00']) {
    assert.ok(!all.includes(bad), `整池卡面出现了 ${bad}`);
  }
  assert.ok((all.match(/card__delta/g) ?? []).length > 0, '至少有一张卡写出了数值对照');

  // ── 商店里买到武器 / 被动的那几格也写这一笔买到了什么 ──
  game.gold = 500;
  game.shopItems = [
    { kind: 'upgrade', id: '__probe', name: '灼心', blurb: '所有伤害 +12%', icon: '⚔️', color: '#ff7a2f', price: 45, sold: false,
      offer: { kind: 'passive', id: 'might', name: '灼心', blurb: '所有伤害 +12%', icon: '⚔️', color: '#ff7a2f', level: 3, maxLevel: 6, tag: 'level' } },
    { kind: 'heal', id: '__soup', name: '热汤', blurb: '回复 40% 生命。', icon: '🍲', color: '#ff6b81', price: 20, sold: false },
  ];
  game.ui.showScreen('shop');
  const shop = String(game.ui.screen.innerHTML);
  assert.ok(shop.includes('card__delta'), '商店里带 offer 的那一格也应写出数值对照');
  assert.equal((shop.match(/card__delta/g) ?? []).length, 1, '不带的（热汤）不该有');
});
