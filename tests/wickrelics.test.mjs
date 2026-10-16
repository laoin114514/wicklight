/**
 * 「拨芯」这条线（v70）回归测试：把"把火压小"从**一个动词**接成**一套牌**。
 *
 * v69 把"灯火烧多旺"交给了玩家，可动词本身还不构成打法：按一下省 65% 的油，
 * 代价是灯火半径与火力一起缩——于是它天然只适合"赶路那十几秒"，
 * 一开打就得拨回来。这一版补的是四个能回答"暗着打怎么活"的遗物，**一族一件**：
 *   · **遮光**（暗影）拨着芯时受到伤害 -25%（黑里不容易被看见）；
 *   · **暗火**（焰火）拨着芯时每次命中添一层灼烧——火不在灯里，拨芯拨不到它；
 *   · **夜步**（长明）拨着芯时移速 +12%（火矮下去了，脚步反而放得开）；
 *   · **守芯**（灯油）拨着芯时每秒回 0.3% 的油（和油壶那条"省"叠得起来）。
 *
 * 这里要盯的是**条件**而不是只有数值。四件都是**有条件的**加成，条件写错（比如忘了判
 * `dimmed`）在界面上完全看不出来——试玩的人只会觉得"这件遗物真强"，
 * 而那正好是设计上最怕的那种"纯赚"。所以每一件都要在**两个方向**上量：
 * 拨着芯时它真的动，没拨芯时一个数都不许动。
 * 另外四件共用同一个门槛（`player.dimmed` = 插值过半），这一条也钉住：
 * 门槛要是各写各的，油条上的牌子和遗物就会对不上（牌子亮着、加成没生效）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：不刷怪、不弹说明卡、血量给到打不死。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=wickrel-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  env.intervals.length = 0;
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

/** 跑 n 帧（走主循环：输入快照 → update），可以带一个方向。 */
const run = (game, frames, mx = 0, my = 0) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(mx, my, false, false);
    game.update(1 / 60);
  }
};

/** 打不死的血池：`recomputeStats()` 会把 hp 夹回真正的上限，所以每次重算之后都要补一次。 */
function tank(game) {
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
}

/**
 * 真按一下 C：`setInput(..., dim)` 是"按下那一帧"的一次性输入，
 * 走的是和键盘同一条路（`Game.update` 顶上的 `inputSnapshot.dim`）。
 */
function tapC(game) {
  game.setInput(0, 0, false, false, false, null, true);
  game.update(1 / 60);
}

/** 拨到底（跑够一整个过渡），或者拨回来。 */
const dimNow = (game) => {
  tapC(game);
  run(game, 30);
};
const undim = (game) => {
  tapC(game);
  run(game, 30);
};

/** 让玩家挨一下（`invuln` 那 0.65 秒得先清掉，不然第二次会被它吃掉）。 */
function hurt(game, amount = 100) {
  const before = game.damageTaken;
  game.player.invuln = 0;
  game.player.dashTimer = 0;
  game.damagePlayer(amount);
  return game.damageTaken - before;
}

/** 摆一只打不死的怪（默认影蛭：不吃"要有光才可被击中"那一条）。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 1);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

const WICK_OF = () => globalThis.window.__WICKLIGHT__.data.wick;
const RELICS = () => globalThis.window.__WICKLIGHT__.data.relics;

test('拨芯这套：正好四件、一族一件，而且除它们之外没人动这几个数', async (t) => {
  const game = await open(t, 'shape');
  const keys = ['wickGuard', 'wickEmber', 'wickStride', 'wickThrift'];
  const family = RELICS().filter((r) => keys.some((k) => k in r.mods));
  assert.equal(family.length, 4, `这条线就是四件（实际 ${family.length}：${family.map((r) => r.name).join('/')}）`);
  // 名单是从 `mods` 里认出来的那一份：`Game.scanWickFamily` 与测试读的是同一个来源，
  // 以后加一件（或挪走一件）不用改两处。
  const ids = globalThis.window.__WICKLIGHT__.data.wickFamily;
  assert.deepEqual(
    [...ids].sort(),
    family.map((r) => r.id).sort(),
    '导出的名单要与"改这几个数的遗物"完全一致',
  );
  const tribes = family.map((r) => r.tribe).sort();
  assert.deepEqual(
    tribes,
    ['flame', 'lamp', 'oil', 'shade'],
    '一族一件：凑共鸣的时候，拿哪一件都不算白拿（和「焰路」同一个规矩）',
  );
  for (const r of family) {
    const used = keys.filter((k) => k in r.mods);
    assert.equal(used.length, 1, `${r.name} 只该改一个数（实际 ${used.join('+')}）——四件叠的是同一件事，一件改两个就变成纯战力了`);
    assert.ok(r.price > 0 && r.blurb.includes('拨着芯'), `${r.name} 的说明里得写着它的条件`);
  }
  // 没带遗物时这四个数必须一个都不动：这一版不许悄悄改掉所有人的手感
  const f = game.player.flags;
  for (const k of keys) assert.equal(f[k], 0, `开局 ${k} 应当是 0（实际 ${f[k]}）`);
});

test('遮光：拨着芯才少挨两成五，没拨芯时一点不减', async (t) => {
  const game = await open(t, 'veil');
  const p = game.player;
  const base = hurt(game); // 全开、没遗物：这就是基准
  p.addRelic('wickveil');
  p.recomputeStats();
  tank(game);
  assert.equal(hurt(game), base, '全开的时候遮光不该有任何作用（它是"拨着芯"的价钱，不是无条件护甲）');
  dimNow(game);
  const veiled = hurt(game);
  assert.ok(
    Math.abs(veiled / base - 0.75) < 0.01,
    `拨着芯该少挨 25%（实测 ${veiled.toFixed(1)} / ${base.toFixed(1)} = ×${(veiled / base).toFixed(3)}）`,
  );
  undim(game);
  assert.equal(hurt(game), base, '拨回来之后立刻回到基准');
});

test('暗火：拨着芯时每次命中添一层灼烧，拨开一层都不添', async (t) => {
  const game = await open(t, 'ember');
  const p = game.player;
  p.addRelic('wickember');
  p.recomputeStats();
  tank(game);
  const hit = (e) => game.applyHit(e, 10, false, 0, 0, 0, { source: 'test:hit' });

  const cold = statue(game, 60, 0);
  hit(cold);
  assert.equal(cold.burn, 0, '全开的时候"暗火"不该点火——它要的正是"把灯压住"这个代价');

  dimNow(game);
  const lit = statue(game, 60, 0);
  hit(lit);
  assert.equal(lit.burn, 1, `拨着芯时一次命中该添一层灼烧（实际 ${lit.burn}）`);
  hit(lit);
  assert.equal(lit.burn, 2, '连着打就往上叠（和烈焰鞭 / 倾灯共用同一套灼烧）');
  assert.equal(lit.burnSource, 'test:hit', '这口火该记在打出去的那一下头上，结算里才对得上账');

  // 咒盾：元素免疫连灼烧一起免——暗火点的也是火，不许从旁边绕过去
  const warded = statue(game, 60, 0);
  warded.affix = 'warded';
  hit(warded);
  assert.equal(warded.burn, 0, '咒盾该把暗火一起免掉');

  undim(game);
  const off = statue(game, 60, 0);
  hit(off);
  assert.equal(off.burn, 0, '拨回来之后这一层也不许再有');
});

test('夜步：拨着芯时快 12%，而且只在拨着的时候快', async (t) => {
  const game = await open(t, 'stride');
  const p = game.player;
  const walkOf = () => {
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    run(game, 45, 1, 0);
    return Math.abs(p.vx);
  };
  const plain = walkOf();
  assert.ok(plain > 10, `先确认人真的在走（实际 ${plain.toFixed(1)}px/s）`);
  p.addRelic('wickstride');
  p.recomputeStats();
  tank(game);
  assert.ok(Math.abs(walkOf() / plain - 1) < 0.005, '全开的时候夜步不该加速');
  dimNow(game);
  const quick = walkOf();
  assert.ok(
    Math.abs(quick / plain - 1.12) < 0.01,
    `拨着芯该快 12%（实测 ×${(quick / plain).toFixed(3)}）`,
  );
  undim(game);
  assert.ok(Math.abs(walkOf() / plain - 1) < 0.005, '拨回来之后立刻回到原来的脚力');
});

test('守芯：拨着芯时油面落得更慢，叠上油壶才真的近乎不动', async (t) => {
  const game = await open(t, 'thrift');
  const p = game.player;
  const drain = (seconds = 1) => {
    p.oil = 0.6;
    run(game, Math.round(seconds * 60));
    return 0.6 - p.oil;
  };
  const plain = drain();
  assert.ok(plain > 0.01, `先确认油真的在烧（实际 ${plain.toFixed(4)}）`);
  p.addRelic('wickthrift');
  p.recomputeStats();
  tank(game);
  assert.ok(Math.abs(drain() - plain) < 1e-6, '全开的时候守芯不该回油');
  dimNow(game);
  const thrifty = drain();
  // 拨着芯时油面该按"省 65% 之后，再每秒补回 0.3%"走
  const expect = plain * WICK_OF().oilMult - 0.003;
  assert.ok(
    Math.abs(thrifty - expect) < 5e-4,
    `拨着芯该每秒回 0.3% 的油（实测 ${thrifty.toFixed(4)} vs 期望 ${expect.toFixed(4)}）`,
  );
  assert.ok(thrifty > 0, '但它不该把油耗盖过去——"暗着走"仍然要花油，只是花得慢');
  undim(game);
  assert.ok(Math.abs(drain() - plain) < 1e-6, '拨回来之后不再回油');

  // 和油壶叠起来才是这条线的意思：乘出来的"省"和漏进来的"回"是两笔账，凑到一起油面几乎不动
  p.addRelic('oilcan');
  p.recomputeStats();
  tank(game);
  drain(); // 先把这一秒跑掉，让 `plain` 那份基准还留在原处
  dimNow(game);
  const both = drain();
  assert.ok(
    both < plain * 0.08,
    `守芯 + 油壶 该让拨着芯的油耗近乎为零（实测 ${both.toFixed(5)} vs 全开 ${plain.toFixed(5)}）`,
  );
  assert.ok(both > 0, '但仍然要花——"白烧"就不是取舍了');
});

test('四件共用同一个门槛：插值过半才算，拨到一半不是', async (t) => {
  const game = await open(t, 'gate');
  const p = game.player;
  p.addRelic('wickveil');
  p.recomputeStats();
  tank(game);
  const base = hurt(game);
  // 手拧到"刚好一半以下"：规则是插值过半，所以这时候还不该生效
  p.wick = 0.4;
  assert.equal(hurt(game), base, 'wick = 0.4 不该算拨着芯');
  p.wick = 0.8;
  assert.ok(hurt(game) < base, 'wick = 0.8 该生效');

  // 真按一下：从 0 拧到 1 的一路上，`dimmed` 必须**就是**"插值过半"那一句
  p.wickOn = false;
  p.wick = 0;
  run(game, 2);
  tapC(game);
  let turnedAt = -1;
  for (let i = 0; i < 40; i += 1) {
    run(game, 1);
    assert.equal(p.dimmed, p.wick > 0.5, `dimmed 与"过半"必须永远一致（wick = ${p.wick.toFixed(3)}）`);
    if (p.dimmed && turnedAt < 0) turnedAt = p.wick;
  }
  assert.equal(p.wick, 1, '最后该拨到底');
  assert.ok(turnedAt > 0.5 && turnedAt < 0.6, `它应当就在过半那一帧翻（实际 ${turnedAt.toFixed(3)}）`);

  // 构筑总览里那四条要跟着身上的遗物走（没拿就不写，拿了要写清条件）
  game.ui.showScreen('loadout');
  const html = String(game.ui.screen.innerHTML);
  assert.ok(!/遮蔽|遮光/.test(html) || html.includes('遮光'), '面板该能正常画出来');
  assert.ok(html.includes('遮光') && html.includes('减伤 25%'), '拿了遮光就该在「灯火」那一栏写出来');
  assert.ok(!html.includes('暗火'), '没拿的那三件不该凭空出现');
});

test('拨芯这套：第一次拿到它、又没按过 C 的时候，要主动讲一次"要你先按 C"', async (t) => {
  const game = await open(t, 'hint');
  const { hud } = globalThis.window.__WICKLIGHT__;
  const p = game.player;
  const tips = () => game.save.tips ?? [];
  // 提示卡挂在 `toastRoot` 上（不是屏幕正中那块面板）：这里只读那几张卡的 innerHTML
  const cardText = () =>
    hud.toastRoot.children
      .filter((c) => String(c.className).includes('toast--tip'))
      .map((c) => c.innerHTML)
      .join(' | ');

  // 开局什么都没有：不该讲
  run(game, 50);
  assert.ok(!tips().includes('relic:wick-family'), '还没拿到那四件，不该讲这一句');

  p.addRelic('wickveil');
  tank(game);
  run(game, 50); // 那一遍扫描是每 0.75 秒一次
  assert.ok(tips().includes('relic:wick-family'), '拿到了、又没按过 C：该把"它只在拨着芯时生效"讲一次');
  const html = cardText();
  assert.ok(html.includes('拨芯') && html.includes('按 C'), '那张卡上要写着怎么用（按 C）', html.slice(0, 200));

  // 讲过一次就不再讲（`showTip` 自己写进存档）
  const again = game.showTip('relic:wick-family', 'x', 'y');
  assert.equal(again, false, '同一条只讲一次');

  // 已经按过 C 的人不用再听：这一句本来就是给"还不知道有这件事"的人讲的
  const game2 = await open(t, 'hint-known');
  const p2 = game2.player;
  game2.save.tips = (game2.save.tips ?? []).filter((k) => k !== 'relic:wick-family');
  tapC(game2); // 先自己发现拨芯
  run(game2, 30);
  assert.ok(game2.save.codex.includes('mechanic:wick'), '按过 C 就该记进图鉴了');
  p2.addRelic('wickember');
  tank(game2);
  run(game2, 60);
  assert.ok(!(game2.save.tips ?? []).includes('relic:wick-family'), '已经知道拨芯的人不该再吃一张说明卡');
});
