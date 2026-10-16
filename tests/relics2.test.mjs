/**
 * 新一批遗物：三件是新的取舍组合，一件（守夜灯）直接把「灯台」这条线拉进构筑里。
 *
 * 灯台在 v22 之后是"点了还得守"的东西，值不值得守就应该跟你带了什么有关：
 * 守夜灯让每座灯台的余温翻倍、灯焰也更难吹灭——点灯从一次性收益变成一条可以投资的路。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('新遗物：余温翻倍、灯更耐吹，以及三件新的取舍', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();

  // ── 四件新遗物都在，族与图鉴都对得上 ──
  const NEW_IDS = { nightwatch: 'lamp', faintheart: 'flame', slowlamp: 'oil', shadowweave: 'shade' };
  for (const [id, tribe] of Object.entries(NEW_IDS)) {
    const def = data.relics.find((r) => r.id === id);
    assert.ok(def, `缺少新遗物：${id}`);
    assert.equal(def.tribe, tribe, `${id} 应属于 ${tribe} 族`);
    assert.ok(def.blurb && def.price > 0, `${id} 应写清说明与价格`);
    const entry = game.codex.entry(`relic:${id}`);
    assert.ok(entry, `${id} 应进图鉴`);
    assert.equal(entry.name, def.name, `${id} 图鉴名应与遗物一致`);
    assert.ok(!/undefined|NaN/.test(entry.blurb + JSON.stringify(entry.rows ?? [])), `${id} 图鉴里不该有缺字段`);
  }
  // 每族各多一件：四族等量，第二档共鸣依然够得到
  // （v53 的「掠影」四件、v62 的「爆灯」四件各补了一族，所以现在是各 11 件。
  //  v70 的「拨芯」四件（遮光 / 暗火 / 夜步 / 守芯）也是四族各一件，于是变成各 12 件；
  //  v75 的「燎灯」四件（旺火 / 漫光 / 吮灯 / 烟熏）同样一族一件，于是变成各 13 件；
  //  v76 的「倾灯」四件（浇油 / 大瓢 / 拾油 / 烬护）再各补一件，于是现在是各 14 件。
  //  这条断言刻意写死数量：四族**等量**才是这套共鸣能一直转下去的前提，
  //  哪天有人只给一族加了一件，第二档（5 件）的门槛就会先在某几族上变松。）
  const counts = {};
  for (const r of data.relics) counts[r.tribe] = (counts[r.tribe] ?? 0) + 1;
  assert.deepEqual(counts, { flame: 14, lamp: 14, oil: 14, shade: 14 }, '四族应各 14 件（第二档共鸣是 5 件）');

  // ── 守夜灯：每座灯台的余温翻倍 ──
  const measure = (relic) => {
    game.newRun('warden', 'normal', false);
    game.player.stats.maxHp = 1e6;
    game.player.hp = 1e6;
    game.player.relics.clear();
    if (relic) game.player.addRelic(relic);
    game.player.recomputeStats();
    const pyre = game.level.pyres[0];
    game.player.x = pyre.x;
    game.player.y = pyre.y;
    const before = game.player.pyreMods.damageMult;
    for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
    assert.equal(pyre.lit, true, '站足够久应点亮灯台');
    return { gain: game.player.pyreMods.damageMult / before, flame: pyre.flame };
  };
  const plain = measure(null);
  const watched = measure('nightwatch');
  assert.ok(Math.abs(plain.gain - 1.05) < 1e-9, `普通情况下点一座灯台余温 +5%（${plain.gain}）`);
  assert.ok(Math.abs(watched.gain - 1.1) < 1e-9, `带守夜灯时点一座灯台余温 +10%（${watched.gain}）`);
  assert.ok(watched.gain > plain.gain, '守夜灯应让余温翻倍');

  // ── 守夜灯：灯焰更难被吹灭 ──
  const drain = (relic) => {
    game.newRun('warden', 'normal', false);
    game.player.stats.maxHp = 1e6;
    game.player.hp = 1e6;
    game.player.relics.clear();
    if (relic) game.player.addRelic(relic);
    game.player.recomputeStats();
    const pyre = game.level.pyres[0];
    game.player.x = pyre.x;
    game.player.y = pyre.y;
    for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
    game.enemies.clear();
    const snuffer = game.enemies.spawn('snuffer', pyre.x + 30, pyre.y, 1, 1);
    assert.equal(game.player.flags.pyreGuard === 1, relic !== 'nightwatch', '守夜灯应降低抽灯焰的速度');
    // 2 秒的抽灯焰：两边都还烧着，才比得出"慢了多少"
    for (let i = 0; i < 20; i += 1) {
      snuffer.x = pyre.x + 30;
      snuffer.y = pyre.y;
      game.enemies.update(0.1, game.enemyCtx());
    }
    return pyre.flame;
  };
  const drainedPlain = drain(null);
  const drainedWatched = drain('nightwatch');
  assert.ok(drainedPlain < 1 && drainedWatched < 1, '两边的灯焰都该被抽掉一些');
  assert.ok(drainedWatched > drainedPlain, `守夜灯让灯焰更耐吹（${drainedWatched.toFixed(3)} > ${drainedPlain.toFixed(3)}）`);
  assert.ok(Math.abs(drainedWatched - (1 - (1 - drainedPlain) * 0.55)) < 1e-9, '耐吹刚好是慢 45%');

  // ── 焚心：伤害与暴击上去，拾取范围下来 ──
  game.newRun('warden', 'normal', false);
  const p = game.player;
  const base = { dmg: p.stats.damageMult, crit: p.stats.critChance, pick: p.stats.pickupRange };
  p.addRelic('faintheart');
  p.recomputeStats();
  assert.ok(p.stats.damageMult > base.dmg, '焚心应提高伤害');
  assert.ok(p.stats.critChance > base.crit, '焚心应提高暴击率');
  assert.ok(p.stats.pickupRange < base.pick, '焚心应降低拾取范围（代价真的生效）');

  // ── 慢灯 / 影织：各自的取舍都落在属性上 ──
  game.newRun('warden', 'normal', false);
  const p2 = game.player;
  const oilBefore = p2.stats.oilDecayMult;
  const hpBefore = p2.stats.maxHp;
  p2.addRelic('slowlamp');
  p2.addRelic('shadowweave');
  p2.recomputeStats();
  assert.ok(p2.stats.oilDecayMult < oilBefore, '慢灯应降低灯油耗率');
  assert.ok(p2.flags.lowOilDamage > 0, '慢灯应带来低油增伤');
  assert.ok(p2.stats.maxHp > hpBefore, '影织应提高生命上限');
  assert.ok(p2.flags.chill >= 1.8, '影织应让命中拖慢敌人');

  // ── 商店里买得到、构筑总览里也列得出来 ──
  game.newRun('warden', 'normal', false);
  game.gold = 10_000;
  game.player.addRelic('nightwatch');
  game.player.recomputeStats();
  game.ui.showScreen('loadout');
  const html = game.ui.screen.innerHTML;
  assert.ok(html.includes('守夜灯'), `构筑总览应写出守夜灯（${html.length} 字）`);
  assert.ok(!/undefined|NaN/.test(html), '构筑总览不该出现缺字段');
  game.state = 'shop';
  game.ui.showScreen('shop');
  assert.ok(!/undefined|NaN/.test(game.ui.screen.innerHTML), '商店面板不该出现缺字段');

  assert.deepEqual(errors, [], `不应有 console 错误：${errors.slice(0, 3).join(' | ')}`);
});
