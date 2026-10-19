/**
 * 「伏灯」这条线（v77）回归测试：把"把它放在那儿"从**一件武器**接成**一套牌**。
 *
 * 伏灯（v66）是这个游戏里唯一一件把东西**留在身后**的武器：它买的不是伤害，是位置和时间。
 * 到 v76 为止，"位置"这条线一件构筑都没长出来——拿它当主力的玩家手里没有一张牌是为它准备的。
 * 这一版照「焰路」「爆灯」「拨芯」「燎灯」「倾灯」那五条线的规矩补上四件，**一族一件**：
 *   · **灯阵**（长明）地上能留 8 颗、放着能等 13 秒——一条更长的路，而且它等得起；
 *   · **接火**（焰火）连爆够得着的半径 +45%——撒得开也串得起来；
 *   · **香饵**（灯油）引蛾的距离 +50%，被炸死的蛾每只回 0.5% 油——饵做香了，蛾自己把油送回来；
 *   · **绊线**（暗影）踩响时炸到的那一圈移速砍一半、拖住 1.4 秒——它替你拦下那几步。
 *
 * 这里要盯的是**这些数到底是谁在改**，以及三件最容易悄悄写错的事：
 *   · 「香饵」的引蛾距离——Enemy 那边原来抄了一份同样的 380，两处真话只要有一处没跟上，
 *     就会出现"店里写着引得更远、实际一只蛾都没多引来"这种谁都看不出来的错（v77 删掉了那一份）；
 *   · 「香饵」的油数是按**炸死的灯蛾**算的，不是"炸到"、也不是"炸死什么都算"；
 *   · 「绊线」走的是 `applySlow` 那条共用的减速账（合并规矩只有一份），
 *     所以它和霜印 / 烟熏撞在一起时不会叠着算两次。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 pourrelics.test.mjs 一样：人挪到 700px 外、清墙、场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=minerel-${tag}-${Date.now()}-${Math.random()}`);
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
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.player.x = 700;
  game.player.y = 700;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

/** 只留伏灯（满级，但它自己不开火：这一页量的是"撒下去之后")+ 指定的遗物。 */
function build(game, relics = [], withWeapon = false) {
  const p = game.player;
  p.weapons.clear();
  if (withWeapon) p.weapons.set('mine', 5);
  p.relics.clear();
  for (const id of relics) p.relics.add(id);
  p.recomputeStats();
  p.oilDecayPerSec = 0;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  p.stats.critChance = 0;
  return p;
}

const run = (game, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
};

/** 跑一段**场上什么都没有**的时间：这一页有几条量的是"雷自己能等多久"，
 *  而这一局在刷怪——刷出来的怪踩上去就把那颗等着的雷炸了（量的就不是"等"了）。 */
const runQuiet = (game, frames) => {
  for (let i = 0; i < frames; i += 1) {
    game.enemies.clear();
    game.setInput(0, 0, false, false);
    game.update(1 / 60);
  }
};

/** 站着不动、打不死的靶。 */
function statue(game, x, y, defId = 'shade') {
  const e = game.enemies.spawn(defId, x, y, 1, 0);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 满级伏灯那一级的数：撒下去的时候武器自己报的半径 / 伤害 / 触发距离。 */
function mineStats() {
  const w = globalThis.window.__WICKLIGHT__.data.weapons.find((x) => x.id === 'mine');
  return w.levels[w.levels.length - 1];
}
const MINE_OF = () => globalThis.window.__WICKLIGHT__.data.mines;

/** 撒一颗雷（走的是真路径 `placeMine`），返回它。 */
function drop(game, x, y, st = mineStats()) {
  game.placeMine(x, y, st.damage, st.radius, st.range, 0, 'mine');
  return game.mines[game.mines.length - 1];
}

const RELICS = () => globalThis.window.__WICKLIGHT__.data.relics;

test('伏灯这套：正好四件、一族一件、六个数各归一件，而且都进图鉴', async (t) => {
  const game = await open(t, 'shape');
  const { data } = globalThis.window.__WICKLIGHT__;
  const LINE = { minerack: 'lamp', minelink: 'flame', minebait: 'oil', minetrip: 'shade' };
  const KEYS = ['mineMax', 'mineLife', 'mineChain', 'mineLure', 'mineMothOil', 'mineSnare'];
  // 名单从 `mods` 里认出来（不是手抄的 id 列表）：以后再加一件、或者把某一件挪走，这里会当场红
  const family = RELICS().filter((r) => KEYS.some((k) => k in r.mods));
  assert.deepEqual(
    family.map((r) => r.id).sort(),
    Object.keys(LINE).sort(),
    `这条线正好四件（实际 ${family.map((r) => r.name).join('/')}）`,
  );
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
  // 每个数各归一件：单拿一件只买到一件事
  for (const k of KEYS) {
    const owners = RELICS().filter((r) => k in r.mods);
    assert.equal(owners.length, 1, `${k} 只该由一件遗物改（实际 ${owners.map((o) => o.name).join('/')}）`);
  }
  // 一族一件：四族等量，第二档共鸣（5 件）的门槛才一直是那个数
  const counts = {};
  for (const r of data.relics) counts[r.tribe] = (counts[r.tribe] ?? 0) + 1;
  assert.deepEqual(counts, { flame: 17, lamp: 17, oil: 17, shade: 17 }, '四族应各 17 件');
  // 装上也真的不炸：四件同时在身上，六个数都得到身上
  const p = build(game, Object.keys(LINE));
  assert.ok(p.flags.mineMax > 0 && p.flags.mineLife > 0 && p.flags.mineChain > 0, '前三个数该上身');
  assert.ok(p.flags.mineLure > 0 && p.flags.mineMothOil > 0 && p.flags.mineSnare > 0, '后三个数该上身');
  assert.ok(Number.isFinite(p.oilFrac) && Number.isFinite(p.damageScale), '四件在身时那几个数都要算得出来');
});

test('灯阵：地上从 6 颗变 8 颗、放着从 10 秒等到 13 秒', async (t) => {
  const MINE = MINE_OF();
  const capOf = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    // 撒满十颗：多出来的那颗应该把**最老的**那颗挤掉（上限还在，只是抬高了）
    for (let i = 0; i < 10; i += 1) drop(game, 700 + i * 4, 700);
    return { len: game.mines.length, life: game.mines[game.mines.length - 1].life };
  };
  const bare = await capOf('rackBare', null);
  const rack = await capOf('rackOn', 'minerack');
  assert.equal(bare.len, MINE.max, `裸装地上该留 ${MINE.max} 颗（实际 ${bare.len}）`);
  assert.equal(rack.len, MINE.max + 2, `带灯阵该是 ${MINE.max + 2} 颗（实际 ${rack.len}）——抬的是上限，不是取消上限`);
  assert.equal(bare.life, MINE.life, `裸装的寿命就是 ${MINE.life} 秒（实测 ${bare.life}）`);
  assert.equal(rack.life, MINE.life + 3, `带灯阵该等 ${MINE.life + 3} 秒（实测 ${rack.life}）`);

  // 真的等得起：放一颗不管它，11 秒之后（裸装的早烧尽了）带灯阵的还在
  const wait = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    drop(game, 760, 700);
    runQuiet(game, 60 * 11);
    const m = game.mines[0];
    return { left: game.mines.length, life: m ? m.life : 0 };
  };
  const bareWait = await wait('rackWaitBare', null);
  const rackWait = await wait('rackWaitOn', 'minerack');
  assert.equal(bareWait.left, 0, `裸装那 10 秒的雷在第 11 秒已经烧尽了（还剩 ${bareWait.left} 颗）`);
  assert.ok(
    rackWait.left === 1 && rackWait.life > 1 && rackWait.life < 2.2,
    `带灯阵的那颗还在等（还剩 ${rackWait.life.toFixed(2)}s）——这就是"它等得起"`,
  );
});

test('接火：排成一列的雷，裸装串不起来、带接火能一路烧过去', async (t) => {
  // 间距取"一颗爆炸半径的 1.2 倍"：裸装的连爆够不着（reach = 半径 × 1），
  // 带接火（×1.45）才够得着——这条间距就是这一件买到的那个差额。
  const gap = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    const st = mineStats();
    const step = st.radius * 1.2;
    drop(game, 700, 700, st);
    drop(game, 700 + step, 700, st);
    drop(game, 700 + step * 2, 700, st);
    runQuiet(game, 60); // 上弦（这期间场上不能有东西）
    assert.equal(game.mines.length, 3, '三颗都该好好地等在那儿（上弦完）');
    statue(game, 700, 700); // 第一颗上站一只靶 → 踩响
    run(game, 30);
    return { best: game.mineChainBest, left: game.mines.length, step, radius: st.radius };
  };
  const bare = await gap('linkBare', null);
  const linked = await gap('linkOn', 'minelink');
  assert.ok(bare.step > bare.radius, `这一条的前提：间距 ${bare.step.toFixed(1)}px 要大于爆炸半径 ${bare.radius}`);
  assert.equal(bare.best, 1, `裸装只响一颗（实测最长一串 ${bare.best} 颗）——够不着`);
  assert.equal(bare.left, 2, `裸装该剩两颗（实际 ${bare.left}）`);
  assert.equal(linked.best, 3, `带接火该一路烧过去（实测最长一串 ${linked.best} 颗）`);
  assert.equal(linked.left, 0, `带接火该一颗不剩（实际 ${linked.left}）`);
});

test('香饵：蛾从更远就闻得到，而被炸死的蛾把油还回来', async (t) => {
  const MINE = MINE_OF();
  // ① 引蛾的距离：把蛾摆在"裸装够不着、带香饵刚好够得着"的那一圈上（380 与 570 之间），
  //    而且它离**那颗雷**比离你更近（蛾改道扑灯的那条规矩是 `ld < d`）。
  //    人挪到同一侧的远处（雷比人离蛾更近，蛾才有"改不改道"这回事）：地图只有 3000×2200，
  //    所以人和雷得摆在蛾的**同一片**，靠人更远来满足 `ld < d`。
  const lure = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    game.player.x = 1200;
    game.player.y = 900;
    const m = drop(game, 700, 300);
    runQuiet(game, 60); // 上弦
    assert.ok(m.arm <= 0, '这颗雷该已经上弦了（没上弦的蛾不理它）');
    const moth = statue(game, 700, 705, 'moth');
    moth.hp = 18;
    moth.maxHp = 18;
    moth.speed = 96;
    const d0 = Math.hypot(moth.x - m.x, moth.y - m.y);
    const p0 = Math.hypot(moth.x - game.player.x, moth.y - game.player.y);
    run(game, 40);
    const d1 = Math.hypot(moth.x - m.x, moth.y - m.y);
    return { d0, d1, p0 };
  };
  const bare = await lure('baitBare', null);
  const bait = await lure('baitOn', 'minebait');
  assert.ok(
    bare.d0 > MINE.lure && bare.d0 < MINE.lure * 1.5,
    `这一条的前提：蛾摆在一个"裸装闻不到、香饵闻得到"的距离上（实测 ${bare.d0.toFixed(0)}px，裸装 ${MINE.lure}px）`,
  );
  assert.ok(bare.d1 > bare.d0, `裸装：闻不到那颗雷，它朝你走（${bare.d0.toFixed(0)} → ${bare.d1.toFixed(0)}px）`);
  assert.ok(bare.p0 > bare.d0, `而且它离你比离雷远（${bare.p0.toFixed(0)} vs ${bare.d0.toFixed(0)}px）——蛾才会改道`);
  assert.ok(
    bait.d1 < bait.d0 - 30,
    `带香饵：它拐过去扑那颗雷了（${bait.d0.toFixed(0)} → ${bait.d1.toFixed(0)}px）`,
  );

  // ② 油：一颗雷炸死几只蛾就回几份油（每只 0.5%），而**不是蛾**的怪炸死再多也不回。
  const blowUp = async (tag, relic, defId, count) => {
    const game = await open(t, tag);
    const p = build(game, relic ? [relic] : []);
    const st = mineStats();
    drop(game, 820, 700, st);
    runQuiet(game, 60); // 上弦
    const foe = [];
    for (let i = 0; i < count; i += 1) {
      const e = statue(game, 820 + (i - 1) * 30, 700, defId);
      e.hp = defId === 'moth' ? 18 : 14;
      e.maxHp = e.hp;
      foe.push(e);
    }
    p.oil = 0.5 * p.oilMax;
    const before = p.oil;
    run(game, 10);
    assert.equal(game.mines.length, 0, '这颗雷该被踩响了（它自己那圈里站着东西）');
    return { gained: p.oil - before, oilMax: p.oilMax, dead: foe.filter((e) => !e.active).length };
  };
  const three = await blowUp('baitOil', 'minebait', 'moth', 3);
  const one = await blowUp('baitOil1', 'minebait', 'moth', 1);
  const none = await blowUp('baitOilBare', null, 'moth', 3);
  const other = await blowUp('baitOilOther', 'minebait', 'shade', 3);
  assert.equal(one.dead, 1, '这一条的前提：那只蛾真的被炸死了');
  assert.ok(
    Math.abs(one.gained - one.oilMax * 0.005) < 1e-9,
    `一只蛾该回 0.5%（实测 ${((one.gained / one.oilMax) * 100).toFixed(3)}%）`,
  );
  assert.equal(three.dead, 3, '这一条的前提：三只蛾都被炸死了');
  assert.ok(
    Math.abs(three.gained / one.gained - 3) < 1e-9,
    `三只该是三倍（实测 ×${(three.gained / one.gained).toFixed(2)}）——它是按只算的`,
  );
  assert.equal(none.gained, 0, '没拿香饵时一口油都不该回（哪怕炸死了三只蛾）');
  assert.equal(other.dead, 3, '这一条的前提：三只影蛭被炸死了');
  assert.equal(other.gained, 0, '死在雷上的**不是蛾**，一只都不回——这一条认的是"被灯引来的那口油"');
});

test('绊线：踩响的那一圈被拖住一半，而圈外的怪一点没慢', async (t) => {
  const MINE = MINE_OF();
  const snare = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    drop(game, 700, 600);
    runQuiet(game, 60); // 上弦
    // 追兵从雷的上方走过来（人在下面），踩响之后：裸装的那只被击退一下、马上就追回来，
    // 带绊线的那只要在原地磨 1.4 秒。⛔ 给它一身血：这一条量的是"走不动"，
    // 不是"被炸死"——死掉的怪没有速度可言。
    const chaser = statue(game, 700, 520);
    chaser.hp = 1e9;
    chaser.maxHp = 1e9;
    chaser.speed = 68;
    const far = statue(game, 400, 520); // 圈外那只（离雷 300px）：一点不该慢
    far.hp = 1e9;
    far.maxHp = 1e9;
    far.speed = 68;
    // 跑到雷响：chaser 往下走，进触发圈（56 + 半径 13）的那一帧就响
    let frames = 0;
    while (game.mines.length > 0 && frames < 120) {
      run(game, 1);
      frames += 1;
    }
    assert.equal(game.mines.length, 0, '追兵走进触发圈，那颗雷该响了');
    const shot = { slow: chaser.slowFactor, timer: chaser.slowTimer, farTimer: far.slowTimer };
    // 先等两边的击退冲量走完（v111 起它会真的推动），再量接下来 1.2 秒**自己走了多远**。
    // 两边的脚力差才是这一件买到的东西；把固定击退量混进同一段位移，比值就不再是 0.5。
    run(game, 9);
    const x0 = chaser.x;
    const y0 = chaser.y;
    run(game, 72);
    return { ...shot, moved: Math.hypot(chaser.x - x0, chaser.y - y0), frames };
  };
  const bare = await snare('snareBare', null);
  const trip = await snare('snareOn', 'minetrip');
  assert.ok(bare.timer === 0, `裸装踩响不该有减速（实测 slowTimer=${bare.timer}）`);
  assert.ok(
    Math.abs(trip.slow - 0.5) < 1e-9 && trip.timer > 1.2 && trip.timer <= MINE.snareSpan,
    `带绊线该是移速砍一半、拖住 ${MINE.snareSpan} 秒（实测 ${trip.slow} 倍 / 剩 ${trip.timer.toFixed(2)}s）`,
  );
  assert.equal(trip.farTimer, 0, '圈外那只（300px 外）不该被拖住');
  const ratio = trip.moved / bare.moved;
  assert.ok(
    Math.abs(ratio - 0.5) < 0.06,
    `被拖住的那只在这 1.2 秒里只走了一半的路（裸装 ${bare.moved.toFixed(0)}px → 带绊线 ${trip.moved.toFixed(0)}px，×${ratio.toFixed(3)}）`,
  );
});
