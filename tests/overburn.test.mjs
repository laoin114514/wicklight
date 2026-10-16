/**
 * 「爆灯」回归测试：把燃爆从"冷却到了就按"变成"要不要把这一口油打出去"。
 *
 * 到 v61 为止，燃爆是一发**固定**收费的大招：不论灯是刚满的还是快灭的，都是 0.16 桶、
 * 都一样大。于是玩家手里那盏灯有多满，跟这一发毫无关系——而它偏偏是这个游戏里
 * 唯一同时管着**看**（视野）和**打**（伤害）的那笔资源。
 *
 * v62 之后：灯火旺过 `overburnAt` 时按燃爆会「爆灯」——这一发自己烧掉两倍的油，
 * 换一圈更大、更狠、还带灼烧的火（数值都在 data/nova.ts 里）。要钉住的是：
 *
 *   1. 过线才烧两倍、没过线照旧 0.16，而且**烧的是这一发自己的账**；
 *   2. 这一发的伤害按**烧之前**的亮度算——不然越舍得烧，反而打得越轻（那道旧账顺手修掉）；
 *   3. 半径真的长了（0.3 倍不是写在说明里好看的）；
 *   4. 四件遗物各动一个数：火盆降门槛、引线把油烧回来、猛火接那四秒、炭衣挡那三秒；
 *   5. `overburnReady` 说得清楚"现在按下去会不会爆灯"——触屏按钮那一圈亮不亮就看它。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 pour / vortex 那几条一样：开一局干净的，人挪到 700px 外，场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=overburn-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  const p = game.player;
  p.x = 700;
  p.y = 700;
  p.weapons.clear();
  game.xpToNext = 1e9;
  p.recomputeStats();
  // ⚠ 这三行必须排在 recomputeStats **之后**：血上限 / 暴击都会在那一步按基表重算回去。
  //   第一版写在前面，于是"血上限 1e6"被冲掉成 100——后面那条炭衣用例里
  //   一次 100 的伤害直接把玩家打死了，报出来的却是"那层炭不在身上"。
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  p.stats.critChance = 0;
  return game;
}

const NOVA_OF = () => globalThis.window.__WICKLIGHT__.data.nova;

/** 站着不动的一只怪：测的是这一发本身，不该让它自己走过来。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  e.dr = 0;
  return e;
}

/** 按一下燃爆（一帧）。返回这一发打在 `dist` 那只怪身上的伤害与扣掉的油。 */
function nova(game, p, oil, dist = 100) {
  p.oil = oil;
  p.novaCd = 0;
  // ⚠ 挨打之后那一帧是"顿帧"（hitStop）：Game.update 会先把它吃掉，玩家这一帧根本不走。
  //   直接按下去的话油一点没掉、冷却也没动，看着像"爆灯没生效"，其实是这一帧没轮到玩家。
  game.hitStop = 0;
  const e = statue(game, p.x + dist, p.y);
  const before = { hp: e.hp, scale: p.damageScale, oil: p.oil };
  for (let i = 0; i < 6 && p.novaCd <= 0; i += 1) {
    game.setInput(0, 0, false, true);
    game.update(1 / 60);
  }
  game.setInput(0, 0, false, false);
  // 灼烧层数当场记下来：后面的用例还会在同一个位置放别的怪、再放别的燃爆，
  // 那些会连着把这一只也烧到——层数要按"这一发之后"的快照算，不是回头再看一眼。
  return { e, dmg: before.hp - e.hp, burn: e.burn, scale: before.scale, before: before.oil, after: p.oil };
}

const run = (game, sec) => {
  for (let i = 0; i < Math.round(sec * 60); i += 1) {
    game.setInput(0, 0, false, false);
    game.update(1 / 60);
  }
};

test('爆灯：过线才烧两倍，没过线照旧；这一发按烧之前的亮度算', async (t) => {
  const game = await open(t, 'cost');
  const p = game.player;
  const N = NOVA_OF();

  // ── 灯火过线：烧掉 0.32 桶 ──
  const over = nova(game, p, 0.9);
  assert.ok(Math.abs(over.before - over.after - N.overburnCost) < 0.004, `爆灯该烧掉两倍的油（${over.before - over.after}）`);
  assert.ok(over.dmg > 0, '半径内那只怪要真的挨到');

  // ── 灯火没过线：照旧的 0.16 桶、照旧的威力 ──
  const plain = nova(game, p, 0.3);
  assert.ok(Math.abs(0.3 - plain.after - N.cost) < 0.004, `没过线就还是 0.16 桶（${0.3 - plain.after}）`);
  assert.ok(over.dmg > plain.dmg * 2, `爆灯该明显更狠（${over.dmg.toFixed(1)} vs ${plain.dmg.toFixed(1)}）`);

  // ── 伤害按"烧之前"那盏灯的亮度算 ──
  // 满灯的 damageScale = 0.65 + 0.7 × 0.9 = 1.28；烧完之后只剩 0.58 → 1.056。
  // 差着两成——拿烧完的亮度算，等于在这一发里把代价扣了两遍（v62 之前正是这么算的）。
  const dm = p.stats.damageMult;
  const want = 34 * dm * over.scale * (1 + N.overburnDamage);
  assert.ok(Math.abs(over.dmg - want) / want < 0.01, `爆灯这一发该按烧之前的亮度算（实为 ${over.dmg.toFixed(1)}，按 0.9 桶算应是 ${want.toFixed(1)}）`);

  // ── 半径真的长了 ──
  const normalFar = nova(game, p, 0.3, 200);
  assert.equal(normalFar.dmg, 0, '平常那一发（半径 180）够不到 200px');
  const overFar = nova(game, p, 0.9, 200);
  assert.ok(overFar.dmg > 0, '爆灯那一发（半径 ×1.3 = 234）要够得到 200px');

  // ── 灼烧：爆灯的火是"烧出去的一口油"，不管哪个流派都带，而且叠得更多 ──
  assert.ok(over.burn >= N.overburnBurn, `爆灯要压上灼烧（${over.burn} 层）`);
  assert.equal(plain.burn, 0, '守夜人平常那一发不带灼烧');

  // ── overburnReady 说得清"现在按下去会不会爆灯"（触屏按钮那一圈亮不亮就看它） ──
  p.oil = 0.9;
  p.novaCd = 0;
  assert.equal(p.overburnReady, true, '灯火够、冷却也转完了 → 按下去就是爆灯');
  p.novaCd = 2;
  assert.equal(p.overburnReady, false, '还在冷却就别亮那一圈（亮了玩家会以为按得动）');
  p.novaCd = 0;
  p.oil = 0.4;
  assert.equal(p.overburnReady, false, '灯火不够就不算爆灯');
  assert.ok(Math.abs(p.overburnAt - 0.55) < 1e-9, `门槛是 55%（${p.overburnAt}）`);
});

test('爆灯这条线的四件遗物：门槛 / 回油 / 四秒 / 三秒', async (t) => {
  const game = await open(t, 'relics');
  const p = game.player;
  const N = NOVA_OF();
  // 换遗物要整套重算，而 recomputeStats 会把血上限按基表算回 100——这几条要的是"打不死"，
  // 所以重算之后那两行必须补回来（不然一次 100 的伤害就直接把玩家打死，后面全成了空转）。
  const build = (...ids) => {
    p.relics.clear();
    for (const id of ids) p.addRelic(id);
    p.recomputeStats();
    p.stats.maxHp = 1e6;
    p.hp = 1e6;
  };

  // ── 火盆：门槛从 55% 降到 30%，半桶就能点着 ──
  build('brazier');
  assert.ok(Math.abs(p.overburnAt - (N.overburnAt - 0.25)) < 1e-9, `火盆该把门槛降到 30%（${p.overburnAt}）`);
  const half = nova(game, p, 0.4);
  assert.ok(Math.abs(0.4 - half.after - N.overburnCost) < 0.01, '半桶也点得着（烧掉的是两倍那一档）');

  // ── 引线：烧掉的油一半会在 4 秒里烧回来 ──
  build('fuse');
  p.oil = 0.9;
  const justBurned = nova(game, p, 0.9).after;
  p.stats.oilDecayMult = 0; // 把"油自己会掉"这条关掉：这一条量的是"回来的那一半"

  run(game, N.refundSpan + 0.3);
  const back = p.oil - justBurned;
  assert.ok(Math.abs(back - N.overburnCost * 0.5) < 0.01, `四年之后那一半要真的回来（回来 ${back.toFixed(3)}，应约 ${N.overburnCost * 0.5}）`);
  assert.ok(p.oil < 0.95, '回来的油不许把灯灌爆（上限就是 1）');

  // ── 猛火：爆灯之后那四秒伤害 +35% ──
  build('flareup');
  p.oil = 0.9;
  nova(game, p, 0.9);
  assert.equal(p.overburning, true, '刚爆完要处在"余温"里');
  const lit = p.damageScale;
  const bare = 0.65 + 0.7 * p.oilFrac;
  assert.ok(Math.abs(lit - bare * 1.35) / lit < 0.01, `余温那四秒该有 1.35 倍（实为 ${lit.toFixed(3)}，裸亮度 ${bare.toFixed(3)}）`);
  run(game, N.afterglowSpan + 0.3);
  assert.equal(p.overburning, false, '四秒过了就没了');
  // 没过线的那一发不该点着余温（它不是爆灯）
  p.oil = 0.3;
  nova(game, p, 0.3);
  assert.equal(p.overburning, false, '平常那一发不点余温');

  // ── 炭衣：爆灯之后那三秒少挨四成五 ──
  const hit = () => {
    const before = p.hp;
    game.damagePlayer(100);
    return before - p.hp;
  };
  build();
  p.invuln = 0;
  const bareHit = hit();
  build('charcoat');
  p.oil = 0.9;
  assert.equal(p.ashGuard, 1, '没爆之前那层炭不在');
  nova(game, p, 0.9);
  assert.ok(Math.abs(p.ashGuard - 0.55) < 1e-9, `爆完那三秒该少挨四成五（${p.ashGuard}）`);
  p.invuln = 0;
  const ashHit = hit();
  assert.ok(Math.abs(ashHit - bareHit * 0.55) / bareHit < 0.02, `炭衣那一下该是裸挨的 55%（${ashHit} vs ${bareHit}）`);
  run(game, N.ashSpan + 0.3);
  assert.equal(p.ashGuard, 1, '三秒过了炭就没了');
});

test('爆灯这条线：四件遗物各归一族、都进图鉴、价格与说明都在', async (t) => {
  const game = await open(t, 'data');
  const { data } = globalThis.window.__WICKLIGHT__;
  const LINE = { flareup: 'flame', fuse: 'oil', brazier: 'lamp', charcoat: 'shade' };
  for (const [id, tribe] of Object.entries(LINE)) {
    const def = data.relics.find((r) => r.id === id);
    assert.ok(def, `缺少遗物：${id}`);
    assert.equal(def.tribe, tribe, `${id} 应属于 ${tribe} 族`);
    assert.ok(def.blurb && def.price > 0, `${id} 应写清说明与价格`);
    assert.ok(!/undefined|NaN/.test(def.blurb), `${id} 的说明里不该有缺字段`);
    const entry = game.codex.entry(`relic:${id}`);
    assert.ok(entry, `${id} 应进图鉴`);
    assert.equal(entry.name, def.name, `${id} 图鉴名应与遗物一致`);
  }
  // 四件各补一族：四族仍然等量（第二档共鸣是 5 件，12 件照样够得到）
  // v70 的「拨芯」四件也走同一条规矩，所以这个数是"每次加一族就一起加 1"
  const counts = {};
  for (const r of data.relics) counts[r.tribe] = (counts[r.tribe] ?? 0) + 1;
  assert.deepEqual(counts, { flame: 12, lamp: 12, oil: 12, shade: 12 }, '四族应各 12 件');
  // 装上也真的不炸：四件同时在身上，属性算得出来
  const p = game.player;
  p.relics.clear();
  for (const id of Object.keys(LINE)) p.addRelic(id);
  p.recomputeStats();
  assert.ok(Number.isFinite(p.damageScale) && p.overburnAt > 0, '四件在身时那几个数都要算得出来');
  assert.ok(Math.abs(p.overburnAt - 0.3) < 1e-9, '火盆降下来的门槛要留在身上');
});
