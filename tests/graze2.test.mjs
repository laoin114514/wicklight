/**
 * 「焰路」回归测试：把掠影从一个"走法"接成一套"构筑"。
 *
 * v52 把"擦着危险走过去"变成了资源，可它身上什么都没动过——不管拿了什么，
 * 热度涨的速度、焰烧多久、擦一次回多少油，对所有人都是同一套数。
 * 于是"贴着打"只是一种风格，不是一次决定。这一版补的是**决定**：
 *   · 四件遗物（焰心 / 长风 / 撩芯 / 影缝）各改一个数，但它们乘的是同一条算式；
 *   · 焰里每杀一只怪续 0.3 秒——焰是自己擦出来的，让它烧下去的是击杀；
 *   · 两张掠影悬赏（第二关起才进池）把"贴着走"变成一张要交的作业；
 *   · 图鉴多一章「机制」，数值直接从 data/graze.ts 取，改调参时不会写漂。
 *
 * 这里盯的就是这几件事真的接上了：数值各自生效、互不串线，没带遗物时一个都不该动。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：关掉刷怪与祭坛，血量给到打不死，场面完全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=graze2-${tag}-${Date.now()}-${Math.random()}`);
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
  // 灯台也要挪走（v74）：它跟祭坛不一样，**站在旁边就会被点着**，而点燃会回 14% 的油、
  // 还顺带加余温。这个场合玩家常常是"钉在一个固定坐标上量十几秒"的（比如量爆灯烧掉的那口油），
  // 只要那一局的地图恰好在那个坐标上刷了一座灯台，量出来的就是"油 +14%"，而且是随机的——
  // 实测 40 局里有 5 局会把灯台刷在 (700,700) 的 200px 内。场面本来就该全由测试自己摆。
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

/** 摆一只打不死的怪（默认影蛭：半径 13，接触距离 27，掠影带再往外 32）。 */
function statue(game, x, y, id = 'shade', speed = 0) {
  const e = game.enemies.spawn(id, x, y, 1, 1);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = speed;
  return e;
}

const run = (game, frames, mx = 0, my = 0) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(mx, my, false, false);
    game.update(1 / 60);
  }
};

/** 同一段"从怪旁边擦过去"的路，跑两遍：一遍不带遗物，一遍带遗物。 */
function heatOver(game, relic) {
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.enemies.clear();
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  if (relic) game.player.addRelic(relic);
  game.player.recomputeStats();
  statue(game, 70, -44);
  run(game, 60, 1, 0);
  return game.player.heat;
}

test('焰心：热度攒得更快，而没带它的时候一点都不该多', async (t) => {
  const game = await open(t, 'heat');
  const plain = heatOver(game, null);
  const cored = heatOver(game, 'blazecore');
  assert.ok(plain > 0, `不带遗物时也该攒到热度（实际 ${plain}）`);
  const ratio = cored / plain;
  assert.ok(Math.abs(ratio - 1.45) < 0.02, `焰心应让热度快 45%（实测 ×${ratio.toFixed(3)}）`);
});

test('长风：灯焰高涨从六秒变九秒，符文刻度用的是同一个数', async (t) => {
  const game = await open(t, 'wind');
  const p = game.player;
  assert.ok(Math.abs(p.blazeDuration - 6) < 1e-9, `不带遗物就是六秒（实际 ${p.blazeDuration}）`);
  p.addRelic('longwind');
  p.recomputeStats();
  assert.ok(Math.abs(p.blazeDuration - 9) < 1e-9, `长风应把六秒变成九秒（实际 ${p.blazeDuration}）`);

  statue(game, 0, -44);
  p.heat = 27;
  p.oil = 1;
  run(game, 2, 1, 0);
  assert.ok(p.blazing, '攒满应该点着');
  assert.ok(p.blazeTimer > 8.9, `点着的焰该是九秒（实际 ${p.blazeTimer.toFixed(2)}）`);
  // 刻度按同一个时长归一：刚点着时是满格，烧掉一半就是半格
  assert.ok(Math.abs(p.gaugeFrac - 1) < 0.02, `刚点着时符文该是满的（实际 ${p.gaugeFrac.toFixed(3)}）`);
  p.blazeTimer = 4.5;
  assert.ok(Math.abs(p.gaugeFrac - 0.5) < 0.02, `烧到一半时符文该是一半（实际 ${p.gaugeFrac.toFixed(3)}）`);
});

test('撩芯：擦出去的那口灯油翻倍——没带它时一口就是 GRAZE.oil', async (t) => {
  const game = await open(t, 'oil');
  const p = game.player;
  const GRAZE = globalThis.window.__WICKLIGHT__.data.graze;
  const sip = () => {
    p.oil = 0.5;
    const before = p.oil;
    game.grazeEvent(p.x, p.y, 'enemy', false);
    return p.oil - before;
  };
  const plain = sip(null);
  assert.ok(Math.abs(plain - GRAZE.oil) < 1e-9, `不带撩芯时一口油就是 ${GRAZE.oil}（实际 ${plain}）`);
  p.addRelic('wickpick');
  p.recomputeStats();
  const doubled = sip();
  assert.ok(Math.abs(doubled - GRAZE.oil * 2) < 1e-9, `撩芯应把这一口翻倍（实际 ${doubled}）`);
});

test('影缝：焰里挨打少三成，焰灭了就该挨满', async (t) => {
  const game = await open(t, 'stitch');
  const p = game.player;
  // 一次正面挨打：难度是 normal（1 倍），所以数值就是那一口
  const bite = (amount) => {
    p.invuln = 0;
    p.dashTimer = 0;
    const before = p.hp;
    game.damagePlayer(amount);
    return before - p.hp;
  };
  const cold = bite(100);
  assert.ok(Math.abs(cold - 100) < 1e-6, `没烧着时该挨满（实际 ${cold}）`);

  p.addRelic('shadowstitch');
  p.recomputeStats();
  const coldWithRelic = bite(100);
  assert.ok(Math.abs(coldWithRelic - 100) < 1e-6, `焰没烧着时影缝不该生效（实际 ${coldWithRelic}）`);

  p.blazeTimer = 5;
  const hot = bite(100);
  assert.ok(Math.abs(hot - 70) < 1e-6, `焰里应少挨三成（实际 ${hot}）`);
});

test('焰里击杀续焰：每杀一只 +0.3 秒，顶到上限就不再涨', async (t) => {
  const game = await open(t, 'extend');
  const p = game.player;
  const GRAZE = globalThis.window.__WICKLIGHT__.data.graze;
  // 先摆一只远处的怪并跑一帧（敌人管理器要跑一帧才拿得到回调上下文），
  // 然后单独结算它的死亡——这样"这一下给焰续了多久"就只剩击杀本身这一个变量。
  const slay = () => {
    const e = statue(game, p.x + 600, p.y);
    game.update(1 / 60);
    const before = p.blazeTimer;
    game.enemies.damage(e, 1e9, game.lightCtx(), 0, 0, 0);
    return p.blazeTimer - before;
  };

  // 没烧着的时候：击杀不该凭空点出一段焰来
  p.blazeTimer = 0;
  slay();
  assert.equal(p.blazeTimer, 0, '焰没烧着时，击杀不该点着它');

  p.blazeTimer = 3;
  assert.ok(Math.abs(slay() - GRAZE.blazeExtend) < 1e-6, `焰里每杀一只应续 ${GRAZE.blazeExtend} 秒`);

  // 顶到上限：再杀也不会更长
  p.blazeTimer = p.blazeMax - 0.05;
  slay();
  assert.ok(Math.abs(p.blazeTimer - p.blazeMax) < 1e-6, `续焰应在上限处停住（实际 ${p.blazeTimer.toFixed(3)} / 上限 ${p.blazeMax}）`);
  // 到顶之后每一只只能"补回上一帧烧掉的那一点"（1/60 秒），永远顶不出上限
  assert.ok(slay() <= 1 / 60 + 1e-9, '到顶之后不该继续涨');
  assert.ok(Math.abs(p.blazeTimer - p.blazeMax) < 1e-6, '到顶之后应一直停在上限');
});

test('图鉴多了一章「机制」：第一次擦身 / 第一次点着焰各记一条', async (t) => {
  const game = await open(t, 'codex');
  const p = game.player;
  assert.equal(game.codex.has('mechanic', 'graze'), false, '开局不该已经记下掠影');
  assert.equal(game.codex.has('mechanic', 'blaze'), false, '开局不该已经记下灯焰高涨');
  assert.ok(game.codex.sectionTotal('mechanic') >= 2, '机制这一章至少要有两条');

  statue(game, 0, -44);
  run(game, 30, 1, 0);
  assert.ok(game.codex.has('mechanic', 'graze'), '擦过一次就该记下掠影');

  p.x = 0;
  p.y = 0;
  p.heat = 27;
  run(game, 12, 1, 0);
  assert.ok(p.blazing, '攒满点着');
  assert.ok(game.codex.has('mechanic', 'blaze'), '点着过就该记下灯焰高涨');

  // 这一章的数值是从 GRAZE 常量现取的：改调参时图鉴跟着走，不该出现空洞
  for (const id of ['graze', 'blaze']) {
    const entry = game.codex.entry(`mechanic:${id}`);
    assert.ok(entry && entry.rows.length >= 5, `机制：${id} 应写出数值表`);
    assert.ok(!/undefined|NaN/.test(JSON.stringify(entry)), `机制：${id} 不该有缺字段`);
  }
});

test('成就：一局点着六次「焰路常燃」、焰里斩首领「焰中斩」', async (t) => {
  const game = await open(t, 'ach');
  const p = game.player;
  assert.equal(game.save.achievements.includes('blaze6'), false, '开局不该有「焰路常燃」');

  statue(game, 0, -44);
  for (let n = 0; n < 6; n += 1) {
    p.heat = 27;
    p.blazeTimer = 0;
    p.x = 0;
    p.y = 0;
    run(game, 12, 1, 0);
  }
  assert.equal(p.blazeCount, 6, `该点着六次（实际 ${p.blazeCount}）`);
  assert.ok(game.save.achievements.includes('blaze6'), '点着六次应解锁「焰路常燃」');

  // 焰里斩首领
  assert.equal(game.save.achievements.includes('blaze_boss'), false, '还没斩过首领');
  p.blazeTimer = 4;
  game.enemies.clear();
  const boss = game.enemies.spawn('thornlord', p.x + 600, p.y, 1, 1);
  game.update(1 / 60);
  game.enemies.damage(boss, 1e9, game.lightCtx(), 0, 0, 0);
  assert.ok(game.save.achievements.includes('blaze_boss'), '焰里击败首领应解锁「焰中斩」');
});

test('构筑总览里有「掠影」栏：次数、热度、以及那些遗物到底改了什么数', async (t) => {
  const game = await open(t, 'loadout');
  const p = game.player;
  p.heat = 9;
  game.ui.showScreen('loadout');
  let html = game.ui.screen.innerHTML;
  assert.ok(html.includes('掠影'), '总览里应有一栏掠影');
  assert.ok(html.includes('热度'), '总览里应写出当前热度');
  assert.ok(!/undefined|NaN/.test(html), '总览不该出现缺字段');

  p.addRelic('blazecore');
  p.addRelic('longwind');
  p.recomputeStats();
  game.ui.showScreen('loadout');
  html = game.ui.screen.innerHTML;
  assert.ok(html.includes('攒热'), '带了焰心就该写出攒热倍率');
  assert.ok(html.includes('焰时长'), '带了长风就该写出焰时长倍率');

  p.blazeTimer = 5;
  game.ui.showScreen('loadout');
  html = game.ui.screen.innerHTML;
  assert.ok(html.includes('灯焰高涨中'), '烧着的时候总览里要写明还剩多久');
  assert.ok(!/undefined|NaN/.test(html), '烧着的时候也不该出现缺字段');
});

test('没带任何一件掠影遗物时，四个数一个都不该动（旁路没接错）', async (t) => {
  const game = await open(t, 'plain');
  const p = game.player;
  p.recomputeStats();
  const f = p.flags;
  assert.equal(f.grazeHeat, 0, '攒热不该有加成');
  assert.equal(f.grazeOil, 0, '回油不该有加成');
  assert.equal(f.blazeTime, 0, '焰时长不该有加成');
  assert.equal(f.blazeGuard, 0, '焰中减伤不该有加成');
  assert.ok(Math.abs(p.blazeDuration - 6) < 1e-9, '焰该是六秒');
  assert.ok(Math.abs(p.blazeMax - 9) < 1e-9, '续焰上限该是九秒');
});
