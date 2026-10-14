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
  game.enemies.clear();
  game.projectiles.clear();
  game.player.x = px;
  game.player.y = py;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
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
  game.placeMine(0, 0, 20, 40, 30, 0);
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
  for (let i = 0; i < 10; i += 1) game.placeMine(i * 40, 400, 20, 50, 30, 0);
  assert.equal(game.mines.length, 6, `地上最多留六颗（实际 ${game.mines.length}）`);
  assert.ok(!game.mines.some((m) => m.x === firstX && m.y === 0), '超出上限时最老的那颗应当先消失');
  assert.equal(game.mineCount, 11, '布下的总数要照实记（结算里写的是它）');
});

test('伏灯：上弦那半秒踩不响，上弦之后才认踩', async (t) => {
  const game = await open(t, 'arm');
  const MINE = MINE_OF();
  game.placeMine(0, 0, 40, 50, 32, 0);
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
  game.placeMine(0, 0, 40, 50, 32, 0);
  statue(game, 32 + 13 + 6, 0);
  run(game, Math.ceil(MINE.arm * 60) + 4, 0, 0);
  assert.equal(game.mines.length, 1, '站在触发圈外面不该被踩响');

  // 同样距离换成石守（半径 22）：32 + 22 = 54 > 51，它的边缘已经进圈了
  const big = await open(t, 'range2');
  big.placeMine(0, 0, 40, 50, 32, 0);
  const bul = statue(big, 32 + 13 + 6, 0, 'bulwark');
  run(big, Math.ceil(MINE.arm * 60) + 4, 0, 0);
  assert.equal(big.mines.length, 0, '触发量的是"怪的边缘"，大块头该更早踩响');
  assert.ok(bul.hp < 1e6, '它应当被炸到');
});

test('伏灯：自己烧尽不炸，爆炸也不伤自己', async (t) => {
  const game = await open(t, 'fizzle');
  const p = game.player;
  game.placeMine(0, 0, 40, 60, 32, 0);
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
  game.placeMine(0, 0, 40, 100, 32, 0);
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
  game.placeMine(0, 0, 100, 60, 34, 0);
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
  evo.placeMine(0, 0, 50, 60, 34, 2);
  const e = statue(evo, 0, 0, 'bulwark');
  evo.mines[0].arm = 0;
  run(evo, 2, 0, 0);
  assert.ok(evo.grounds.some((g) => g.kind === 'fire'), '连珠伏灯炸完该留一片火');
  assert.ok(e.burn > 0, '被炸到的敌人还该带灼烧');
  // 不进化（burn = 0）的那颗不该留火：不然"留火"就不是进化的好处了
  const plain = await open(t, 'plain');
  plain.placeMine(0, 0, 50, 60, 34, 0);
  statue(plain, 0, 0, 'bulwark');
  plain.mines[0].arm = 0;
  run(plain, 2, 0, 0);
  assert.equal(plain.grounds.length, 0, '1 级的伏灯只炸一圈，不留火');
});

test('伏灯：一次炸到五只解「伏击」', async (t) => {
  const game = await open(t, 'ach');
  assert.equal(game.save.achievements.includes('mine_multi'), false, '开局不该有这个成就');
  game.placeMine(0, 0, 20, 70, 34, 0);
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
