/**
 * 灯火共鸣：遗物分「族」，同族凑够 3 件、5 件各解锁一档加成。
 *
 * 遗物原本只是「买哪件更强」，共鸣把取舍推进一步：散着拿是杂牌，
 * 凑成一族才是体系。这里验证分族完整、档位在正确的数量上跳变、
 * 加成只加一次、拿掉就收回，以及面板把进度写清楚。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('灯火共鸣：遗物分族、凑数加成与展示', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data, ui } = globalThis.window.__WICKLIGHT__;
  t.after(() => loop?.stop?.());

  // ── 数据：每件遗物都有族，每个族都够得到第二档，每一档都写得清 ──
  const tribes = data.tribes;
  assert.ok(Array.isArray(tribes) && tribes.length >= 3, '构建产物应导出灯火共鸣的族表');
  const tribeIds = new Set(tribes.map((x) => x.id));
  const byTribe = {};
  for (const relic of data.relics) {
    assert.ok(tribeIds.has(relic.tribe), `遗物 ${relic.id} 的族 ${relic.tribe} 不在族表里`);
    byTribe[relic.tribe] = (byTribe[relic.tribe] ?? 0) + 1;
  }
  for (const id of tribeIds) {
    assert.ok(byTribe[id] >= 5, `族 ${id} 只有 ${byTribe[id]} 件遗物，第二档永远够不到`);
  }
  for (const tribe of tribes) {
    assert.ok(tribe.name && tribe.blurb && tribe.icon, `族 ${tribe.id} 缺少名称 / 说明 / 图标`);
    assert.ok(tribe.tiers.length >= 2, `族 ${tribe.id} 至少要有两档`);
    for (const tier of tribe.tiers) {
      assert.ok(tier.count >= 3, `族 ${tribe.id} 的一档门槛不应低于 3 件`);
      assert.ok(tier.blurb, `族 ${tribe.id} 的一档缺说明`);
      assert.ok(Object.keys(tier.mods).length > 0, `族 ${tribe.id} 的一档没有实际加成`);
    }
  }

  game.bootDone();
  game.newRun('warden', 'normal', false);
  const p = game.player;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;

  // 焰火族的几件遗物（全部确认过归属），按固定顺序拿，避免依赖数组顺序
  const relicDef = (id) => data.relics.find((r) => r.id === id);
  const FLAME_PICKS = ['thornring', 'scope', 'whetstone', 'hunter', 'emberheart'];
  for (const id of FLAME_PICKS) assert.equal(relicDef(id).tribe, 'flame', `${id} 应属于焰火族`);
  const base = p.stats.damageMult;

  // ── 2 件：石沉大海，不触发共鸣 ──
  p.addRelic('thornring');
  p.addRelic('scope');
  assert.equal(p.tribeCount('flame'), 2, '应数得出同族数量');
  assert.equal(p.tribeCount('oil'), 0, '不该把别的族算进来');
  assert.equal(p.tribeTier('flame'), 0, '2 件不该触发共鸣');

  // ── 第 3 件：凑齐，除了它自己的修正还要多一份「共鸣」 ──
  const d2 = p.stats.damageMult;
  p.addRelic('whetstone'); // 只带 damageMult +18%
  const d3 = p.stats.damageMult;
  assert.equal(p.tribeTier('flame'), 1, '3 件应解锁第一档');
  assert.ok(Math.abs(d3 / d2 - 1.18 * 1.12) < 1e-6, `第 3 件应同时吃到自身 18% 与共鸣 12%（实际 ×${(d3 / d2).toFixed(4)}）`);
  assert.ok(d3 > base, '共鸣之后伤害倍率应高于起始');
  assert.equal(p.tribeTier('oil'), 0, '只凑了焰火，其它族不该亮');

  // ── 第 4 件：仍是第一档，不多给 ──
  p.addRelic('hunter');
  assert.equal(p.tribeTier('flame'), 1, '4 件仍在第一档');

  // ── 第 5 件：第二档（伤害 +18% / 暴击伤害 +25%）──
  const d4 = p.stats.damageMult;
  const crit4 = p.stats.critMult;
  p.addRelic('emberheart'); // 自带 critMult +65%
  const d5 = p.stats.damageMult;
  assert.equal(p.tribeTier('flame'), 2, '5 件应解锁第二档');
  assert.ok(Math.abs(d5 / d4 - 1.18) < 1e-6, `第二档应再叠 18% 伤害（实际 ×${(d5 / d4).toFixed(4)}）`);
  assert.ok(Math.abs(p.stats.critMult - (crit4 + 0.65 + 0.25)) < 1e-6, '第二档的暴击伤害应叠上');

  // ── 拿掉一件：共鸣跟着收回 ──
  assert.equal(p.removeRelic('whetstone'), true, '应能移除遗物');
  assert.equal(p.tribeCount('flame'), 4);
  assert.equal(p.tribeTier('flame'), 1, '掉回 4 件应退回第一档');
  p.addRelic('whetstone');
  assert.equal(p.tribeTier('flame'), 2, '补回来应重新点亮第二档');

  // ── 从商店买进最后一件：共鸣要走进公告，成就也要真的记下来 ──
  const hud = globalThis.window.__WICKLIGHT__.hud;
  game.newRun('warden', 'normal', false);
  const q = game.player;
  q.stats.maxHp = 1e6;
  q.hp = 1e6;
  q.addRelic('thornring');
  q.addRelic('scope');
  game.gold = 500;
  game.shopItems = [
    { kind: 'relic', id: 'whetstone', name: '磨石', blurb: '所有伤害 +18%。', icon: '🪨', color: '#ff7a2f', price: 50, sold: false },
  ];
  const cardsBefore = hud.toastRoot.children.length;
  assert.equal(game.buyShop(0), true, '应能买下磨石');
  assert.equal(q.tribeTier('flame'), 1, '买到第 3 件应就地共鸣');
  assert.ok(game.save.achievements.includes('resonance'), '第一次共鸣应解锁成就「灯火同源」');
  const said = hud.toastRoot.children.slice(cardsBefore).map((c) => String(c.textContent ?? c.innerHTML ?? ''));
  assert.ok(said.some((x) => x.includes('灯火共鸣') && x.includes('焰火')), `共鸣要报一声（实际：${said.join(' | ')}）`);

  // HUD 的构筑行也要挂上共鸣芯片，战斗中能一眼看到体系成没成
  hud.update(1 / 60);
  const chips = String(hud.buildEl.innerHTML);
  assert.ok(chips.includes('chip--tri'), 'HUD 构筑行应出现共鸣芯片');
  assert.ok(chips.includes('🔥'), '共鸣芯片带上那一族的图标');
  q.addRelic('oilcan');
  q.addRelic('honeypot');
  game.gold = 500;
  game.shopItems = [
    { kind: 'relic', id: 'hushstone', name: '静默石', blurb: '灯油燃烧 -45%，但移动速度 -8%。', icon: '🪨', color: '#8fa7ff', price: 50, sold: false },
  ];
  game.buyShop(0);
  assert.equal(q.tribeTier('oil'), 1, '第二族也该能共鸣');
  assert.ok(game.save.achievements.includes('resonance_pair'), '两族共鸣应解锁成就「双辉共鸣」');
  hud.update(1 / 60);
  assert.ok((String(hud.buildEl.innerHTML).match(/chip--tri/g) ?? []).length >= 2, '两族共鸣应挂两枚芯片');

  ui.showScreen('loadout');
  const html = ui.screen.innerHTML;
  assert.ok(html.includes('灯火共鸣'), '构筑总览应有一栏灯火共鸣');
  for (const tribe of tribes) assert.ok(html.includes(tribe.name), `构筑总览应列出 ${tribe.name}`);
  assert.ok(/还差|再集|已满/.test(html), '应写出下一档还差几件');
  assert.ok(!/undefined|NaN/.test(html), '构筑总览不该出现缺字段');
  // 焰火已经点亮 → 有 is-on 标记
  assert.ok(/lo-tri is-on/.test(html), '已点亮的一族应带 is-on 标记');
});
