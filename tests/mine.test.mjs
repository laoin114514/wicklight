/**
 * 「伏灯」回归测试：这一局里开火是自动的、瞄准也是自动的，所以**位置**才是玩家握着的东西。
 * 到这一版为止，位置只被用来躲（离远点）和擦（掠影，贴着走过去）；
 * 伏灯是第三种用法——事先把它放在那儿，等一件还没发生的事。
 *
 * 于是要证明的事情也很具体：
 *   1. 它真的撒在**身后**（不然"跑着撒"这个手感是假的）；
 *   2. **上弦**那半秒踩不响（刚放下就炸的话，它是手雷不是陷阱）；
 *   3. 上弦之后才认踩，认的是"怪自己的边缘"（大块头该更早踩响）；
 *   4. 自己烧尽**不炸**——不然"跑过去把雷耗掉"就成了清场手段；
 *   5. 地上最多六颗、爆炸不伤玩家；进化的那颗炸完留一片火；
 *   6. 一次炸到五只解「伏击」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/**
 * 开一局干净的：关掉刷怪与祭坛，血量给到打不死，场面完全由测试自己摆。
 *
 * 玩家默认站到 (700,700)，离所有摆件都很远。这是被坑过的地方：
 * 怪贴着人站会一直触发接触伤害，而接触会带上打击停顿（`Game.hitStop`），
 * 那几帧**整个世界都不更新**——伏灯的上弦、寿命、踩响全在这几帧里，
 * 量出来的数就变成了随机的。要量伏灯的伤害，先把人从场面里挪开。
 */
async function open(t, tag = '', px = 700, py = 700) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=mine-${tag}-${Date.now()}-${Math.random()}`);
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
  game.player.x = px;
  game.player.y = py;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  // 也别让"打死几只怪就弹出升级面板"搅进来：面板一挂，整局就是暂停的——
  // 伏灯的寿命、引信、踩响全停在那儿（v56 量"炸到几只蛾"时就是这么少了两只）。
  game.xpToNext = 1e9;
  // 开局那把武器（守夜人是环形火环）会在脚边一直打转，把"这一炸掉了多少"搅成一团。
  // 场面要干净：这一局只留测试自己摆的东西，需要伏灯的时候再单独装上。
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

const MINE_OF = () => globalThis.window.__WICKLIGHT__.data.mines;

/**
 * 摆一只打不动的怪：血量给到打不死（要看的是"有没有被炸到"，不是有没有死），
 * 接触伤害也归零（不然它贴着玩家站着时，掉血的是玩家，量出来的就不是伏灯了）。
 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

const run = (game, frames, mx = 0, my = 0) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(mx, my, false, false);
    game.update(1 / 60);
  }
};

test('伏灯：武器在池里、图鉴收录、进化链闭合', async (t) => {
  const game = await open(t, 'data');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const mine = weapons.find((w) => w.id === 'mine');
  const chain = weapons.find((w) => w.id === 'mine_chain');
  assert.ok(mine && mine.kind === 'mine', '应存在伏灯（mine）');
  assert.deepEqual(mine.evolve, { passive: 'might', into: 'mine_chain' }, '伏灯的进化链应为 满级+灼心 → 连珠伏灯');
  assert.ok(chain && chain.evolved, '连珠伏灯应标记为进化形态');
  assert.ok(chain.levels.length >= 5, '连珠伏灯至少应有 5 级');
  // 留火是进化才有的东西：`burn` 在这里是"留下的那片火烧几层"
  assert.equal(mine.levels[0].burn, 0, '1 级伏灯只炸一圈，不留火');
  assert.ok(chain.levels.every((l) => l.burn > 0), '连珠伏灯每一级都该留火');
  assert.ok(game.codex.entry('weapon:mine') && game.codex.entry('weapon:mine_chain'), '图鉴应收录两件');
  assert.ok(game.upgrades.generate(game.player, 200, game.rng).some((o) => o.id === 'mine'), '武器池里应有伏灯');
  // 一件武器从 1 级到满级，范围与触发距离都该长（不然"升级"只是涨伤害）
  assert.ok(mine.levels[4].radius > mine.levels[0].radius, '满级爆炸范围应更大');
  assert.ok(mine.levels[4].range > mine.levels[0].range, '满级触发距离应更远');
  // 第一颗雷落地就该点亮图鉴「机制」那一章：这一条讲的是"地上那颗雷的规则"，
  // 和别的武器不一样的地方全在那儿，所以它值得单独成一条（数值是从 data/mines.ts 现取的）
  assert.equal(game.codex.has('mechanic', 'mine'), false, '还没布过雷时这条是问号');
  game.placeMine(0, 0, 20, 40, 30, 0, 'mine');
  assert.ok(game.codex.has('mechanic', 'mine'), '布下第一颗伏灯就该记进图鉴「机制」章');
  const mech = game.codex.entry('mechanic:mine');
  assert.ok(
    mech.rows.length >= 6 && mech.rows.every(([k, v]) => k && v && !/undefined|NaN/.test(v)),
    '伏灯那条机制该有名字也有数',
  );
  // 详情页是一段 HTML，行里的数直接插进去——所以那些数不许带星号（Markdown 在这里不会被渲染）
  game.ui.codexFocus = 'mechanic:mine';
  game.ui.showScreen('codex');
  assert.ok(
    !/undefined|NaN|\*\*/.test(game.ui.screen.innerHTML),
    '图鉴详情页不该出现缺字段或 Markdown 残留',
  );
  game.ui.codexFocus = null;

  // 升级卡与进化卡：伏灯第 n 级要写"这一级改了什么"，
  // 进化卡更不能把自己写成一枚缩水的雷（卡上第一行就是伤害，98 → 52 会读成"变弱"）
  const offer = (o) => {
    game.ui.setOffers([o], 0);
    game.ui.showScreen('levelup');
    return String(game.ui.screen.innerHTML);
  };
  // 卡面写的是"当前级 → 下一级"，所以先把雷拿到手、升到 2 级（真开局就是这个路径）
  game.player.addWeapon('mine');
  game.player.levelWeapon('mine');
  const lvCard = offer({ kind: 'weapon', id: 'mine', name: mine.name, blurb: mine.blurb, icon: '🕯️', color: mine.color, level: 3, maxLevel: 5, tag: 'level' });
  assert.ok(
    lvCard.includes(`<span class="dl__to">${Math.round(mine.levels[2].damage)}`),
    '伏灯的升级卡要写出下一级的伤害',
  );
  const evoCard = offer({ kind: 'weapon', id: 'mine_chain', name: chain.name, blurb: chain.blurb, icon: '🕯️', color: chain.color, level: 1, maxLevel: 5, tag: 'evolve' });
  assert.ok(
    evoCard.includes(`<span class="dl__to">${Math.round(chain.levels[0].damage)}`),
    '进化卡要写出连珠伏灯的伤害',
  );
  assert.ok(
    chain.levels[0].damage > mine.levels[mine.levels.length - 1].damage,
    '进化后的第一级不该比满级伏灯还低（不然卡上那行伤害读成缩水）',
  );
  // 进化卡只留两行（先排"变强"的那两个）：这一代是伤害与间隔，两行都要是往上的
  assert.ok(evoCard.includes('间隔'), '进化卡还该写出撒得更勤（间隔）');
  assert.ok(
    chain.levels[0].cooldown < mine.levels[mine.levels.length - 1].cooldown,
    '进化后第一级的间隔该比满级伏灯更短',
  );

  // 图鉴/商店/总览都不该出现空洞
  game.player.addWeapon('mine');
  game.ui.showScreen('loadout');
  assert.ok(!/undefined|NaN/.test(game.ui.screen.innerHTML), '构筑总览不该出现缺字段');
  game.state = 'shop';
  game.ui.showScreen('shop');
  assert.ok(!/undefined|NaN/.test(game.ui.screen.innerHTML), '商店面板不该出现缺字段');
});

test('伏灯：撒在身后，而且地上最多留六颗', async (t) => {
  const game = await open(t, 'drop');
  const p = game.player;
  // 先跑起来（这时候还没有伏灯），让玩家真的有一个"身后"
  run(game, 20, 1, 0);
  assert.ok(p.x > 20, `玩家该往右动起来了（x=${p.x.toFixed(1)}）`);
  p.addWeapon('mine');
  const px = p.x;
  run(game, 2, 1, 0);
  assert.equal(game.mines.length, 1, '装备之后应当在脚边留下一颗');
  assert.ok(game.mines[0].x < px, `它该撒在**身后**（雷 x=${game.mines[0].x.toFixed(1)} vs 人 x=${px.toFixed(1)}）`);

  // 上限：连放十颗，地上只该剩六颗，而且最老的那颗被顶掉
  const firstX = game.mines[0].x;
  for (let i = 0; i < 10; i += 1) game.placeMine(i * 40, 400, 20, 50, 30, 0, 'mine');
  assert.equal(game.mines.length, 6, `地上最多留六颗（实际 ${game.mines.length}）`);
  assert.ok(!game.mines.some((m) => m.x === firstX && m.y === 0), '超出上限时最老的那颗应当先消失');
  assert.equal(game.mineCount, 11, '布下的总数要照实记（结算里写的是它）');
});

test('伏灯：上弦那半秒踩不响，上弦之后才认踩', async (t) => {
  const game = await open(t, 'arm');
  const MINE = MINE_OF();
  game.placeMine(0, 0, 40, 50, 32, 0, 'mine');
  const e = statue(game, 0, 0);
  run(game, 1, 0, 0);
  assert.equal(game.mines.length, 1, '刚放下就炸的话，它是手雷不是陷阱——上弦期间踩不响');
  assert.equal(e.hp, 1e6, '上弦期间那一脚不该有伤害');
  run(game, Math.ceil(MINE.arm * 60) + 4, 0, 0);
  assert.equal(game.mines.length, 0, '上弦之后被踩到就该炸');
  assert.ok(e.hp < 1e6, `炸到了应当掉血（hp=${e.hp}）`);
});

test('伏灯：踩不响的距离不该响；大块头因为体积大，会更早踩响', async (t) => {
  const MINE = MINE_OF();
  // 影蛭（半径 13）站在触发圈外沿之外：32 + 13 = 45 已经够不着，站到 51 更够不着
  const game = await open(t, 'range');
  game.placeMine(0, 0, 40, 50, 32, 0, 'mine');
  statue(game, 32 + 13 + 6, 0);
  run(game, Math.ceil(MINE.arm * 60) + 4, 0, 0);
  assert.equal(game.mines.length, 1, '站在触发圈外面不该被踩响');

  // 同样距离换成石守（半径 22）：32 + 22 = 54 > 51，它的边缘已经进圈了
  const big = await open(t, 'range2');
  big.placeMine(0, 0, 40, 50, 32, 0, 'mine');
  const bul = statue(big, 32 + 13 + 6, 0, 'bulwark');
  run(big, Math.ceil(MINE.arm * 60) + 4, 0, 0);
  assert.equal(big.mines.length, 0, '触发量的是"怪的边缘"，大块头该更早踩响');
  assert.ok(bul.hp < 1e6, '它应当被炸到');
});

test('伏灯：自己烧尽不炸，爆炸也不伤自己', async (t) => {
  const game = await open(t, 'fizzle');
  const p = game.player;
  game.placeMine(0, 0, 40, 60, 32, 0, 'mine');
  // 触发圈外的怪：这样"没炸"只可能是寿终，而不是被踩响
  const far = statue(game, 400, 0);
  const hpBefore = p.hp;
  game.mines[0].life = 0.001;
  run(game, 3, 0, 0);
  assert.equal(game.mines.length, 0, '寿命到了就该消失');
  assert.equal(far.hp, 1e6, '自己烧尽**不炸**（不然"跑过去耗掉它"就成了清场手段）');
  assert.equal(p.hp, hpBefore, '烧尽也不会伤到玩家');

  // 踩响：玩家自己站在爆炸圈里（但没贴到那只怪身上）也不该挨伤害
  p.x = 30;
  p.y = 30;
  game.placeMine(0, 0, 40, 100, 32, 0, 'mine');
  const p2 = statue(game, 0, 0);
  game.mines[0].arm = 0;
  run(game, 2, 0, 0);
  assert.equal(game.mines.length, 0, '踩响了');
  assert.ok(p2.hp < 1e6, '炸到了怪');
  assert.equal(p.hp, hpBefore, '玩家自己的爆炸从来不伤自己（火球也是同一条规矩）');
});

test('伏灯：一圈按距离衰减，进化的那颗还留一片火', async (t) => {
  const game = await open(t, 'fire');
  // 边缘那只站在 40 处：34 + 13 = 47，踩得响；爆炸半径 60 也罩得住它
  game.placeMine(0, 0, 100, 60, 34, 0, 'mine');
  const near = statue(game, 0, 0);
  const edge = statue(game, 40, 0);
  run(game, 1, 0, 0);
  game.mines[0].arm = 0;
  run(game, 2, 0, 0);
  const nearLost = 1e6 - near.hp;
  const edgeLost = 1e6 - edge.hp;
  assert.ok(nearLost > edgeLost && edgeLost > 0, `越靠边掉得越少（正中 ${nearLost.toFixed(1)} vs 边缘 ${edgeLost.toFixed(1)}）`);

  // 进化的连珠伏灯：炸完脚下留一片火（不然"连珠"只是个更大的圈）
  const evo = await open(t, 'evolve');
  evo.placeMine(0, 0, 50, 60, 34, 2, 'mine');
  const e = statue(evo, 0, 0, 'bulwark');
  evo.mines[0].arm = 0;
  run(evo, 2, 0, 0);
  assert.ok(evo.grounds.some((g) => g.kind === 'fire'), '连珠伏灯炸完该留一片火');
  assert.ok(e.burn > 0, '被炸到的敌人还该带灼烧');
  // 不进化（burn = 0）的那颗不该留火：不然"留火"就不是进化的好处了
  const plain = await open(t, 'plain');
  plain.placeMine(0, 0, 50, 60, 34, 0, 'mine');
  statue(plain, 0, 0, 'bulwark');
  plain.mines[0].arm = 0;
  run(plain, 2, 0, 0);
  assert.equal(plain.grounds.length, 0, '1 级的伏灯只炸一圈，不留火');
});

test('伏灯：排得密会连爆成一串，而且是一节一节烧过去的', async (t) => {
  const game = await open(t, 'chain');
  const MINE = MINE_OF();
  // 三颗排成一条线，间距（50）小于一颗的爆炸半径（60）——连爆够得着
  game.placeMine(0, 0, 40, 60, 30, 0, 'mine');
  game.placeMine(50, 0, 40, 60, 30, 0, 'mine');
  game.placeMine(100, 0, 40, 60, 30, 0, 'mine');
  const e = statue(game, 0, 0);
  game.mines.forEach((m) => {
    m.arm = 0;
  });
  run(game, 1, 0, 0);
  assert.equal(game.mines.length, 2, '第一颗被踩响：这一帧只该少一颗');
  // 一串是**一蹦一蹦**烧过去的：这一炸只点得着挨着的那一颗，
  // 隔了一颗远（100px > 爆炸半径 60）的那颗此刻还得凉着。
  const lit = game.mines.filter((m) => m.fuse > 0);
  const cold = game.mines.filter((m) => m.fuse === 0);
  assert.equal(lit.length, 1, '只该点着挨着的那一颗');
  assert.equal(cold.length, 1, '隔了一颗远的那颗还凉着（连爆够不着它）');
  assert.equal(lit[0].link, 1, '被点着的那颗记着自己是这一串的第二节');
  assert.equal(lit[0].arm, 0, '点着的同时就该免掉上弦——它已经被"用掉"了');
  assert.equal(lit[0].fuseX, 0, '引信从前面那一颗的落点烧过来');
  // 引信烧完，第二颗响，这才点着第三颗
  run(game, Math.ceil(MINE.chainFuse * 60) + 2, 0, 0);
  assert.equal(game.mines.length, 1, '第二颗接着响');
  assert.ok(game.mines[0].fuse > 0, '第三颗这时才被点着');
  assert.equal(game.mines[0].link, 2, '第三节');
  run(game, Math.ceil(MINE.chainFuse * 60) + 2, 0, 0);
  assert.equal(game.mines.length, 0, '第三颗也顺着响完——一串三颗');
  assert.equal(game.mineChainBest, 3, `最长一串该记 3 颗（实际 ${game.mineChainBest}）`);
  assert.ok(e.hp < 1e6 - 50, `一串炸过去掉得该比单响多（hp=${e.hp}）`);

  // 引信点着了就不再看有没有人来踩：上弦还没走完、场上一个敌人都没有，时间到照样响
  const solo = await open(t, 'fuse');
  solo.placeMine(0, 0, 40, 60, 30, 0, 'mine');
  solo.mines[0].arm = MINE.arm;
  solo.mines[0].fuse = MINE.chainFuse;
  run(solo, 1, 0, 0);
  assert.equal(solo.mines.length, 1, '引信还没烧到头');
  run(solo, Math.ceil(MINE.chainFuse * 60) + 2, 0, 0);
  assert.equal(solo.mines.length, 0, '引信烧到头就该响（它已经不为踩踏服务了）');

  // 排得开就一颗一颗响：两百像素外那颗既够不着、也不该被点着
  const apart = await open(t, 'apart');
  apart.placeMine(0, 0, 40, 60, 30, 0, 'mine');
  apart.placeMine(200, 0, 40, 60, 30, 0, 'mine');
  statue(apart, 0, 0);
  apart.mines.forEach((m) => {
    m.arm = 0;
  });
  run(apart, 20, 0, 0);
  assert.equal(apart.mines.length, 1, '离得远的那颗还在（连爆够不着它）');
  assert.equal(apart.mines[0].fuse, 0, '它的引信没被点着');
  assert.equal(apart.mineChainBest, 1, '这一响只是单响');
});

test('伏灯：一串连到 4 颗解「一串灯」，结算里写出最长的一串', async (t) => {
  const game = await open(t, 'chain4');
  const MINE = MINE_OF();
  assert.equal(game.save.achievements.includes('minechain'), false, '开局不该有这个成就');
  for (let i = 0; i < 4; i += 1) game.placeMine(i * 40, 0, 40, 60, 30, 0, 'mine');
  statue(game, 0, 0);
  game.mines.forEach((m) => {
    m.arm = 0;
  });
  run(game, 2 + Math.ceil(MINE.chainFuse * 60) * 4, 0, 0);
  assert.equal(game.mines.length, 0, '四颗应当一路串到底');
  assert.equal(game.mineChainBest, 4, `最长一串该是 4 颗（实际 ${game.mineChainBest}）`);
  assert.ok(game.save.achievements.includes('minechain'), '串到 4 颗该解锁「一串灯」');
  assert.ok(game.ui.statsBlock().includes('最长一串'), '结算面板里应写出最长的一串');
  // 单响不该在结算里凑出"最长一串"那一行
  const solo = await open(t, 'chain4solo');
  solo.placeMine(0, 0, 40, 60, 30, 0, 'mine');
  statue(solo, 0, 0);
  solo.mines[0].arm = 0;
  run(solo, 3, 0, 0);
  assert.equal(solo.mineChainBest, 1);
  assert.ok(!solo.ui.statsBlock().includes('最长一串'), '只单响过就不该写"最长一串"');
});

test('伏灯：一次炸到五只解「伏击」', async (t) => {
  const game = await open(t, 'ach');
  assert.equal(game.save.achievements.includes('mine_multi'), false, '开局不该有这个成就');
  game.placeMine(0, 0, 20, 70, 34, 0, 'mine');
  // 触发圈外面站四只（不该被算进这一炸），圈里站五只
  for (let i = 0; i < 4; i += 1) statue(game, 300 + i * 30, 0);
  const pack = [statue(game, 0, 40), statue(game, 0, -40), statue(game, 40, 0), statue(game, -40, 0), statue(game, 0, 0)];
  game.mines[0].arm = 0;
  run(game, 2, 0, 0);
  assert.equal(game.mines.length, 0, '踩响了');
  for (const e of pack) assert.ok(e.hp < 1e6, '圈里的五只都该吃到这一炸');
  assert.ok(game.save.achievements.includes('mine_multi'), '一次炸到五只应解锁「伏击」');
  assert.ok(game.ui.statsBlock().includes('伏灯'), '结算面板里应写出布了多少颗伏灯');
});

test('伏灯：它是一盏灯——灯蛾会拐过来扑它，然后自己踩响', async (t) => {
  // 蛾的图鉴上写着"它们扑的是光，不是你"。这一条要证明那句话是真的：
  // 地上亮着的伏灯也算光，蛾会改道去扑它，而不是继续追人。
  const game = await open(t, 'moth');
  const MINE = MINE_OF();
  // 蛾在 (100,700)，人躲在 (700,700)（`open` 默认就把人放在那儿）
  const moth = game.enemies.spawn('moth', 100, 700, 1, 0);
  // 没摆雷的时候：它朝人（+x）飞
  run(game, 30, 0, 0);
  assert.ok(moth.x > 130, `没有灯的时候蛾朝人飞（x=${Math.round(moth.x)}）`);

  // 摆一盏**上弦好的**灯在它正上方（比人近得多）
  game.placeMine(100, 400, 40, 60, 34, 0, 'mine');
  const mine = game.mines[0];
  mine.arm = 0;
  const before = Math.hypot(moth.x - mine.x, moth.y - mine.y);
  run(game, 40, 0, 0);
  const after = Math.hypot(moth.x - mine.x, moth.y - mine.y);
  assert.ok(after < before - 20, `地上亮着的伏灯该把蛾吸过去（${Math.round(before)} → ${Math.round(after)}）`);
  assert.ok(moth.y < 700 - 50, `它是往那盏灯飞的（y=${Math.round(moth.y)}）`);
  // 扑上去就等于自己踩响：雷没了、蛾也没了
  run(game, 180, 0, 0);
  assert.equal(game.mines.length, 0, '蛾扑到灯上，把它踩响了');
  assert.ok(moth.hp <= 0, `那一下就把蛾炸死了（hp=${moth.hp}）`);

  // 没上弦的那颗不算"亮着的灯"（芯还是冷青色的），蛾不该理它
  const cold = await open(t, 'moth-cold');
  const moth2 = cold.enemies.spawn('moth', 100, 700, 1, 0);
  cold.placeMine(100, 400, 40, 60, 34, 0, 'mine');
  cold.mines[0].arm = MINE.arm;
  run(cold, 30, 0, 0);
  assert.ok(moth2.x > 130, `还没上弦的雷不算灯，蛾不拐弯（x=${Math.round(moth2.x)}）`);
  assert.equal(cold.mines.length, 1, '那颗雷还在地上');

  // 只有蛾认这条线：别的怪不会因为地上摆了雷就集体改道
  const shade = await open(t, 'moth-shade');
  const walker = shade.enemies.spawn('shade', 100, 700, 1, 0);
  shade.placeMine(100, 400, 40, 60, 34, 0, 'mine');
  shade.mines[0].arm = 0;
  run(shade, 30, 0, 0);
  assert.ok(walker.x > 130, `影蛭照旧追人，不会被灯牵走（x=${Math.round(walker.x)}）`);
});

test('伏灯：吹灯客踩进触发圈是把雷吹灭，不是把它踩响', async (t) => {
  // 伏灯是一盏灯，而吹灯客是"专扑灯"的那种怪——它是伏灯唯一的天敌：
  // 埋在地上的一整条路，它能一边走一边掐灭。想用雷，就先把吹灯客点掉。
  const game = await open(t, 'snuff');
  game.placeMine(0, 0, 40, 60, 34, 0, 'mine');
  game.mines[0].arm = 0;
  const snuffer = game.enemies.spawn('snuffer', 0, 30, 1, 0);
  snuffer.hp = 1e6;
  snuffer.maxHp = 1e6;
  const hpBefore = game.player.hp;
  run(game, 4, 0, 0);
  assert.equal(game.mines.length, 0, '雷没了');
  assert.equal(game.mineSnuffed, 1, '它是被吹灭的（记在结算里）');
  assert.ok(snuffer.hp === 1e6, `吹灯客不该吃到这一炸（hp=${snuffer.hp}）`);
  assert.equal(game.player.hp, hpBefore, '玩家一滴血都不该掉');
  assert.ok(game.ui.statsBlock().includes('被吹灭'), '结算面板里应写出被吹灭了几颗');
  // 同一颗雷换成普通怪踩：照炸不误（吹灭这条只对吹灯客成立）
  const other = await open(t, 'snuff-shade');
  other.placeMine(0, 0, 40, 60, 34, 0, 'mine');
  other.mines[0].arm = 0;
  const shade = statue(other, 0, 30);
  run(other, 4, 0, 0);
  assert.equal(other.mines.length, 0, '影蛭踩上来照炸');
  assert.equal(other.mineSnuffed, 0, '这一颗不是被吹灭的');
  assert.ok(shade.hp < 1e6, '它该吃到那一炸');
  // 没炸过、也没被吹灭的一局，结算里不该冒出"被吹灭"那一行
  const clean = await open(t, 'snuff-clean');
  assert.ok(!clean.ui.statsBlock().includes('被吹灭'), '没被吹灭过就不写那一行');
});

test('伏灯：一颗雷一次炸到 4 只灯蛾解「以灯为饵」', async (t) => {
  const game = await open(t, 'bait');
  const MINE = MINE_OF();
  assert.equal(game.save.achievements.includes('mine_moth'), false, '开局不该有这个成就');
  assert.ok(MINE.mothBait >= 3, '一次炸到一只蛾就该算的话，"把它们引到同一盏灯上"这件事就不成立了');
  // 用真的蛾（18 血，一炸就死），不改成打不死的——不然同一只蛾会被下一炸再数一遍
  const flock = [0, 12, 24].map((x) => game.enemies.spawn('moth', x, 0, 1, 0));
  game.placeMine(0, 0, 40, 70, 34, 0, 'mine');
  game.mines[0].arm = 0;
  run(game, 2, 0, 0);
  assert.equal(game.mineMothHits, 3, `这一炸数出 3 只（实际 ${game.mineMothHits}）`);
  assert.ok(flock.every((e) => e.hp <= 0), '圈里那三只都该被炸死');
  assert.equal(game.save.achievements.includes('mine_moth'), false, '三只还不够——门槛要的是"一群"');
  assert.ok(game.ui.statsBlock().includes('灯上的蛾'), '结算面板里会写出这一局灯上落过几只蛾');
  assert.ok(!game.ui.statsBlock().includes('以灯为饵'), '结算面板不该把没解开的成就写上去');
  // 再来一颗，一次炸到四只：这才是"你把这群蛾引到了同一盏灯上"
  game.placeMine(0, 0, 40, 70, 34, 0, 'mine');
  game.mines[0].arm = 0;
  for (const x of [0, 10, 20, 30]) game.enemies.spawn('moth', x, 0, 1, 0);
  // 多跑几帧：上一次那一炸打死三只，会带来一下"打击停顿"（kill 的手感），
  // 那几帧整个世界都不更新——只跑两帧会撞在停顿里，雷还没轮到踩响。
  run(game, 8, 0, 0);
  assert.equal(game.mineMothHits, 7, `累计 7 只（实际 ${game.mineMothHits}）`);
  assert.ok(game.save.achievements.includes('mine_moth'), '一次炸到 4 只该解锁「以灯为饵」');
  // 圈外站着的蛾不算：挨着爆炸半径外一点点
  const edge = await open(t, 'bait-edge');
  edge.placeMine(0, 0, 40, 60, 34, 0, 'mine');
  edge.mines[0].arm = 0;
  // 站在触发圈外（34 + 14），等雷被"踩响"不可能——所以这里直接引爆它
  statue(edge, 200, 0);
  edge.mines[0].fuse = 0.02;
  statue(edge, 90, 0, 'moth');
  run(edge, 4, 0, 0);
  assert.equal(edge.mines.length, 0, '引信烧到了，炸了');
  assert.equal(edge.mineMothHits, 0, `爆炸够不着的那只蛾不该被数进去（实际 ${edge.mineMothHits}）`);
  // 挨着爆炸圈边上的那只（radius + 它自己的半径以内）要数进去
  const near = await open(t, 'bait-near');
  near.placeMine(0, 0, 40, 60, 34, 0, 'mine');
  near.mines[0].arm = 0;
  near.mines[0].fuse = 0.02;
  statue(near, 70, 0, 'moth');
  run(near, 4, 0, 0);
  assert.equal(near.mineMothHits, 1, '爆炸圈边上的蛾算被炸到（判据和 blast 一样）');
  // 离人比离灯近的蛾不算"被灯引过去"：它是冲你来的，顺手被炸了而已
  const pull = await open(t, 'bait-pull');
  pull.player.x = 0;
  pull.player.y = 0;
  pull.placeMine(0, -120, 40, 60, 34, 0, 'mine');
  pull.mines[0].arm = 0;
  pull.mines[0].fuse = 0.02; // 直接点着引信，不靠踩
  statue(pull, 0, -40, 'moth'); // 离灯 80px、离人 40px
  run(pull, 4, 0, 0);
  assert.equal(pull.mines.length, 0, '引信烧到了，炸了');
  assert.equal(pull.mineMothHits, 0, '这只蛾离人更近：它是冲人来的，不该算进"被灯引过去"');
});

test('伏灯：升级会真的改数（等级越高，炸得越狠、撒得越勤）', async (t) => {
  const game = await open(t, 'level');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const mine = weapons.find((w) => w.id === 'mine');
  for (let i = 1; i < mine.levels.length; i += 1) {
    assert.ok(mine.levels[i].damage > mine.levels[i - 1].damage, `第 ${i + 1} 级伤害该更高`);
    assert.ok(mine.levels[i].cooldown < mine.levels[i - 1].cooldown, `第 ${i + 1} 级该撒得更勤`);
  }
  game.player.addWeapon('mine');
  for (let i = 1; i < mine.levels.length; i += 1) game.player.levelWeapon('mine');
  assert.equal(game.player.weapons.get('mine'), mine.levels.length, '这一局真的把它升到了满级');
  game.player.recomputeStats();
  const before = game.mines.length;
  run(game, 2, 0, 0);
  assert.ok(game.mines.length > before, '满级伏灯照样能撒出雷来');
});

/**
 * 这一条是台架跑出来的真崩溃（`tools/bench-waves.mjs` 一局里撞到 `Cannot read properties of
 * undefined (reading 'radius')`）：`resolveMines` 从那头往回遍历，同时会在循环里 splice 掉
 * **烧尽**的与**引信烧完**的雷。它先把"被踩响的那一颗"记成一个**下标**，等循环走完才去
 * `this.mines[stepped]` 取——可这中间只要有一颗更靠前的雷烧尽被 splice 掉，数组整体前移一格，
 * 那个下标就指到了别人身上（数组短了就指到 `undefined`，于是当场崩）。
 *
 * 这一段重现的正是那个次序：**被踩响的那颗排在后面（先访问、先记下下标），
 * 同一帧里烧尽的那颗排在前面（后访问、把数组缩短）**。
 */
test('伏灯：同一帧里"有雷烧尽"和"有雷被踩响"撞在一起，炸的必须是被踩的那一颗', async (t) => {
  const game = await open(t, 'race');
  // 两个摆件都离玩家很远（玩家在 700,700），免得接触伤害带来打击停顿把这一帧吞掉
  game.player.x = 700;
  game.player.y = 700;
  // ① 靠前的那一颗：这一帧就烧尽（不是被踩响，也不炸）
  game.placeMine(0, 0, 20, 46, 30, 0, 'mine');
  const doomed = game.mines[0];
  doomed.life = 1e-6;
  // ② 靠后的那一颗：上弦完毕，脚下站着一只怪 → 这一帧会被踩响
  game.placeMine(0, 0, 20, 46, 30, 0, 'mine');
  const stepped = game.mines[1];
  stepped.arm = 0;
  const victim = statue(game, 0, 0);
  const hpBefore = victim.hp;

  assert.doesNotThrow(() => run(game, 1), '同一帧撞上这两种情况时不该抛异常');

  assert.equal(game.mines.includes(doomed), false, '烧尽的那一颗该离场（而且不炸）');
  assert.equal(game.mines.includes(stepped), false, '被踩响的那一颗该炸掉');
  assert.equal(game.mines.length, 0, '两颗都了结了');
  assert.ok(victim.hp < hpBefore, '炸的必须是**被踩响**的那一颗——脚下的怪要真的掉血');
});
