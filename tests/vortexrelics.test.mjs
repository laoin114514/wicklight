/**
 * 「旋灯」这条线（v78）回归测试：把"你决定它们站在哪儿"接成**一套牌**。
 *
 * 旋灯（v62）是这个游戏里唯一一件**不制造伤害**的武器：它把一圈人拢到一点，让别的武器去打那一点。
 * 到 v77 为止它是六条线里唯一没有自己一族的（「焰路」「爆灯」「拨芯」「燎灯」「倾灯」「伏灯」都有了），
 * 于是这一版照同样的规矩**一族一件**补上四件：
 *   · **张网**（长明）吸入半径 +18%、多转 0.3 秒——一网罩得更宽，也收得更慢；
 *   · **标灯**（焰火）被拽住的敌人受到的**所有**伤害 +25%（离开那圈后还留 0.5 秒）；
 *   · **榨油**（灯油）收网打到的每一只回 0.4% 油；
 *   · **缠网**（暗影）圈里的敌人移速 -35%——吸力之外再拖一层。
 *
 * 这里要盯的是**这些数到底是谁在改**，以及三件最容易悄悄写错的事：
 *   · 「张网」的半径不是"只影响吸力"：收尾那一圈是 `半径 × VORTEX.burst`，两件事共用同一个数
 *     （"拢得多狠"和"收尾多疼"从 v57 起就是同一件事）——所以加宽吸入半径会顺带加宽收尾圈，
 *     这一条得量出来，不然哪天有人把它拆成两个数，玩法会悄悄变味；
 *   · 「标灯」是**唯一**在 `applyHit` 里往上乘的一个数（别的遗物都在更前面改玩家属性），
 *     所以它从"打出去的那一下"起生效：灼烧不吃它（灼烧是每帧从怪身上扣的，不经过那里）；
 *   · 「缠网」走的是 `applySlow` 那条共用的减速账（合并规矩只有一份）——
 *     它和一条更狠的减速（霜印那 0.5 倍）撞在一起时，不该把人家顶回快的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 vortex.test.mjs 同一套清场：人挪到 700、清墙、场面全由测试自己摆。
 *  （墙要清掉：这份用例里有几条量的是"谁走了多远"，地图上横着一堵墙就量不出来了。） */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=vortexrel-${tag}-${Date.now()}-${Math.random()}`);
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

/** 只留旋灯（但**不放进武器栏**：这一页量的是"转起来之后"，不是"它自己转不转"）+ 指定的遗物。 */
function build(game, relics = []) {
  const p = game.player;
  p.weapons.clear();
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

/** 站着不动、打不死的靶。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 记下"环"（收尾那一下画的圈就是它的收尾半径）。 */
function spyRings(game) {
  const seen = [];
  const sw = game.particles.shockwave.bind(game.particles);
  game.particles.shockwave = (x, y, color, size, life) => {
    seen.push(size);
    return sw(x, y, color, size, life);
  };
  return seen;
}

const VORTEX_OF = () => globalThis.window.__WICKLIGHT__.data.vortex;
const RELICS = () => globalThis.window.__WICKLIGHT__.data.relics;

/** 转一盏：走的是真路径 `placeVortex`。 */
function spin(game, x, y, radius = 200, damage = 40) {
  game.placeVortex(x, y, damage, radius, 0, 0, 'vortex');
  return game.vortexes[game.vortexes.length - 1];
}

test('旋灯这套：正好四件、一族一件、五个数各归一件，而且都进图鉴', async (t) => {
  const game = await open(t, 'shape');
  const { data } = globalThis.window.__WICKLIGHT__;
  const LINE = { vortexnet: 'lamp', vortexmark: 'flame', vortexpress: 'oil', vortexsnare: 'shade' };
  const KEYS = ['vortexSpread', 'vortexTime', 'vortexMark', 'vortexHarvest', 'vortexSnare'];
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
  assert.deepEqual(counts, { flame: 16, lamp: 16, oil: 16, shade: 16 }, '四族应各 16 件');
  // 装上也真的不炸：四件同时在身上，五个数都得到身上
  const p = build(game, Object.keys(LINE));
  assert.ok(p.flags.vortexSpread > 0 && p.flags.vortexTime > 0 && p.flags.vortexMark > 0, '前三个数该上身');
  assert.ok(p.flags.vortexHarvest > 0 && p.flags.vortexSnare > 0, '后两个数该上身');
  assert.ok(Number.isFinite(p.oilFrac) && Number.isFinite(p.damageScale), '四件在身时那几个数都要算得出来');
});

test('张网：吸入半径 +18%、多转 0.3 秒，而收尾圈跟着一起大', async (t) => {
  const net = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    const rings = spyRings(game);
    const v = spin(game, 700, 900, 200, 40);
    const shot = { radius: v.radius, life: v.life };
    run(game, 60 * 3); // 转完
    assert.equal(game.vortexes.length, 0, '这一盏该转完了');
    return { ...shot, ring: rings[0] ?? 0, rings: rings.length };
  };
  const VORTEX = VORTEX_OF();
  const bare = await net('netBare', null);
  const netted = await net('netOn', 'vortexnet');
  assert.ok(
    Math.abs(netted.radius / bare.radius - 1.18) < 1e-9,
    `吸入半径该正好 +18%（${bare.radius} → ${netted.radius}px）`,
  );
  assert.ok(
    Math.abs(netted.life - (bare.life + 0.3)) < 1e-9,
    `该多转 0.3 秒（${bare.life.toFixed(2)}s → ${netted.life.toFixed(2)}s）`,
  );
  assert.equal(bare.life, VORTEX.life, `裸装就是数据里那个数（${VORTEX.life}s）`);
  // ⚠ 收尾圈 = 吸入半径 × burst：它是**同一个数**的两种用法（"拢得多狠"和"收尾多疼"是一件事）。
  //   这一条钉的是"加宽吸入半径也顺带加宽了收尾圈"——哪天有人把它拆成两个数，这条会红。
  assert.ok(
    Math.abs(bare.ring - bare.radius * VORTEX.burst) < 1e-6,
    `裸装的收尾圈 = 吸入半径 × ${VORTEX.burst}（实测 ${bare.ring.toFixed(1)}px）`,
  );
  assert.ok(
    Math.abs(netted.ring / bare.ring - 1.18) < 1e-9,
    `带上张网，收尾圈跟着一起大（${bare.ring.toFixed(1)} → ${netted.ring.toFixed(1)}px）`,
  );
});

test('标灯：被拽住的挨打多两成五，出圈之后还留半秒，圈外的没有', async (t) => {
  const VORTEX = VORTEX_OF();
  // 挨一下（直接调 `applyHit`，量的是"这一下被放大了多少"）
  const hit = (game, foe, amount = 100) => {
    const before = foe.hp;
    game.applyHit(foe, amount, false, 0, 0, 0, { source: 'whip' });
    return before - foe.hp;
  };
  const marked = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    const inside = statue(game, 900, 900); // 圈里（离中心 40px）
    const outside = statue(game, 1200, 900); // 圈外（离中心 340px，圈只有 200）
    const far = hit(game, outside); // 先在圈外挨一下（这时候谁都没被标）
    spin(game, 860, 900, 200, 0);
    run(game, 2); // 让 `applyVortexPull` 把圈里那只标上
    const inRing = hit(game, inside);
    if (relic) assert.ok(inside.vortexMark > 0, '圈里那只该被标上（量"标灯"的前提）');
    else assert.equal(inside.vortexMark, 0, '没拿这一件时谁都不该被标上');
    assert.equal(outside.vortexMark, 0, '圈外那只是 0（标的是"此刻在圈里"的那些）');
    // 转完之后再挨一下：标记只留 markSpan 秒，跑够就走完了
    run(game, 60 * 3);
    assert.equal(game.vortexes.length, 0, '这一盏该转完了');
    run(game, 60);
    assert.ok(inside.vortexMark <= 0, `标记该已经走完了（实测还剩 ${inside.vortexMark.toFixed(2)}s）`);
    const after = hit(game, inside);
    return { far, inRing, after };
  };
  const bare = await marked('markBare', null);
  const lit = await marked('markOn', 'vortexmark');
  assert.ok(
    Math.abs(bare.inRing / bare.far - 1) < 1e-9,
    `没拿标灯时圈里圈外一样疼（${bare.far.toFixed(1)} → ${bare.inRing.toFixed(1)}）`,
  );
  assert.ok(
    Math.abs(lit.inRing / lit.far - 1.25) < 1e-9,
    `带标灯：被拽住的那只多挨两成五（${lit.far.toFixed(1)} → ${lit.inRing.toFixed(1)}）`,
  );
  assert.ok(
    Math.abs(lit.after / lit.far - 1) < 1e-9,
    `圈收完了、那半秒也过完了，就回到原价（${lit.after.toFixed(1)} vs ${lit.far.toFixed(1)}）`,
  );
  assert.ok(
    Math.abs(bare.after / bare.far - 1) < 1e-9 && Math.abs(lit.after - bare.after) < 1e-9,
    '没拿这一件的话，圈里待过和没待过一模一样',
  );
  // 那半秒到底有多长：圈还在的时候它一直被续上（"此刻在圈里"），收完那一刻还剩满格；
  // 之后没人再续，它自己走完——这就是 `markSpan` 的意思。
  // ⚠ 上一段那两个 `run(60*3)` 里圈早就没了，所以那条"标记走完"的断言量的是"圈没了之后"。
  const game = await open(t, 'markSpan');
  build(game, ['vortexmark']);
  const foe = statue(game, 900, 900);
  spin(game, 860, 900, 200, 0);
  run(game, 30);
  assert.ok(
    Math.abs(foe.vortexMark - VORTEX.markSpan) < 1e-9,
    `圈还在的时候它一直被续满（"此刻在圈里"，实测 ${foe.vortexMark.toFixed(2)}s）`,
  );
  // 一圈一圈跑到圈自己收掉：那一刻标记还是满的，之后没人再续
  let frames = 30;
  while (game.vortexes.length > 0 && frames < 200) {
    run(game, 1);
    frames += 1;
  }
  assert.equal(game.vortexes.length, 0, '这一盏该转完了');
  assert.ok(foe.vortexMark > 0, `圈刚收完那一下标记还在（实测还剩 ${foe.vortexMark.toFixed(2)}s）`);
  run(game, Math.ceil(VORTEX.markSpan * 60) + 2);
  assert.ok(foe.vortexMark <= 0, '最多留这半秒，之后自己走完（不用等谁去清它）');
});

test('榨油：收网打到每一只回 0.4% 油，而够不着的一只都不算', async (t) => {
  // 摆 n 只靶在收尾圈里（离中心 30px：圈只有 半径 × 0.72），转完量油面抬了多少
  const harvest = async (tag, relic, count) => {
    const game = await open(t, tag);
    const p = build(game, relic ? [relic] : []);
    for (let i = 0; i < count; i += 1) statue(game, 830 + i * 30, 900);
    statue(game, 1500, 900); // 这一只离中心 640px：吸力圈都够不着，更别说收尾圈
    p.oil = 0.5 * p.oilMax;
    spin(game, 800, 900, 200, 40);
    const before = p.oil;
    run(game, 60 * 3);
    assert.equal(game.vortexes.length, 0, '这一盏该转完了');
    return { gained: p.oil - before, oilMax: p.oilMax };
  };
  const one = await harvest('harvest1', 'vortexpress', 1);
  const three = await harvest('harvest3', 'vortexpress', 3);
  const none = await harvest('harvestBare', null, 3);
  assert.ok(
    Math.abs(one.gained - one.oilMax * 0.004) < 1e-9,
    `一只该回 0.4%（实测 ${((one.gained / one.oilMax) * 100).toFixed(3)}%）`,
  );
  assert.ok(
    Math.abs(three.gained / one.gained - 3) < 1e-9,
    `三只该是三倍（实测 ×${(three.gained / one.gained).toFixed(2)}）——它是按"这一网真的打到几只"算的`,
  );
  assert.equal(none.gained, 0, '没拿榨油时一滴油都不该回');
});

test('缠网：圈里的走不动（-35%），圈外的不受影响，而且它不把更狠的减速顶回去', async (t) => {
  const VORTEX = VORTEX_OF();
  // ① 状态：圈里那只被挂上 0.65 倍的减速，而且是**每帧续**的（0.4 秒的余量）
  const state = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    const inRing = statue(game, 900, 900);
    const outRing = statue(game, 1200, 900);
    spin(game, 860, 900, 200, 0);
    run(game, 2);
    return { slow: inRing.slowFactor, timer: inRing.slowTimer, outTimer: outRing.slowTimer };
  };
  const bare = await state('snareBare', null);
  const webbed = await state('snareOn', 'vortexsnare');
  assert.equal(bare.timer, 0, `裸装圈里不该有减速（实测 slowTimer=${bare.timer}）`);
  assert.ok(
    Math.abs(webbed.slow - 0.65) < 1e-9 && webbed.timer > 0,
    `带缠网该是 0.65 倍（实测 ${webbed.slow} 倍 / 剩 ${webbed.timer.toFixed(2)}s）`,
  );
  assert.equal(webbed.outTimer, 0, '圈外那只（离中心 340px，圈只有 200）一点没慢');

  // ② 合并规矩：一条更狠的减速（霜印那 0.5 倍）在场时，缠网不该把它顶回快的
  const game = await open(t, 'snareMerge');
  build(game, ['vortexsnare']);
  // 先给它挂上一条更狠的（0.5 倍，霜印 / 霜棱走的就是这条），时长也长得多
  const tough = statue(game, 900, 900);
  tough.slowTimer = 9;
  tough.slowFactor = 0.5;
  spin(game, 860, 900, 200, 0);
  run(game, 2);
  assert.ok(
    Math.abs(tough.slowFactor - 0.5) < 1e-9,
    `它不该把更狠的那条减速顶回去（实测 ${tough.slowFactor} 倍）`,
  );
  assert.ok(tough.slowTimer > 1, `而且是"时长取长的那个"——那条 9 秒的不该被 0.4 秒换掉（实测 ${tough.slowTimer.toFixed(2)}s）`);

  // ③ 脚力：圈里那一帧，它**自己**走的那一份少了 35%（68 → 44.2）。
  //    ⚠ 刻意不量"谁走得更远"：吸力上限是 175px/s，在这个圈里压过任何走路速度，
  //    两只最后都会被拽到中心附近——那是这件武器本来的设计（"把人拢起来"），
  //    不是缠网买到的东西。所以量**速度**：同一盏灯、同一个起点，吸力那一份两边一模一样
  //    （它只跟"离圆心多远"有关），差出来的就是脚力。
  //    `vx/vy` 是这一帧 `behave` 写下的走速、之后又被 `applyVortexPull` 加上吸力的结果，
  //    所以读出来就是它此刻的速度。`wobble` 钉成 0：不然'chase'那条路会带一点侧移，
  //    数值就不是那个整洁的 68 了（两边的侧移还不一样，因为它由随机数起头）。
  const walk = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    const chaser = statue(game, 700, 400);
    chaser.hp = 1e9;
    chaser.maxHp = 1e9;
    chaser.speed = 68;
    chaser.wobble = 0;
    spin(game, 700, 500, 200, 0); // 圈心在它和人之间（吸力朝下，和它走的方向一致）
    // ⚠ 先跑一帧：减速是在 `applyVortexPull` 里挂上去的，而它排在"这一帧的走速已经算完"之后，
    //   所以**第二帧**才读得到被砍过的脚力（第一帧还是原速）。吸力那一份按这一刻的位置算。
    run(game, 1);
    const x0 = chaser.x;
    const y0 = chaser.y;
    run(game, 1);
    const d0 = Math.hypot(x0 - 700, y0 - 500);
    const pull0 = VORTEX.pull * (1 - d0 / 200) ** VORTEX.pullShape;
    const speed = Math.hypot(chaser.vx, chaser.vy);
    return { speed, walkPart: speed - pull0, d0, slow: chaser.slowFactor, timer: chaser.slowTimer };
  };
  const plain = await walk('walkBare', null);
  const stuck = await walk('walkOn', 'vortexsnare');
  assert.equal(plain.timer, 0, '裸装那只一点没慢（它只是被吸着走）');
  assert.ok(
    Math.abs(plain.walkPart - 68) < 0.05,
    `裸装圈里它自己走 68px/s（实测 ${plain.walkPart.toFixed(3)}）`,
  );
  assert.ok(
    Math.abs(stuck.walkPart - 68 * 0.65) < 0.05,
    `带缠网只剩 44.2px/s（实测 ${stuck.walkPart.toFixed(3)}）——脚力砍掉 35%`,
  );
  assert.ok(
    Math.abs(plain.speed - stuck.speed - 68 * 0.35) < 0.05,
    `两边的速度差正好是 68 的 35%（${plain.speed.toFixed(1)} → ${stuck.speed.toFixed(1)}px/s，吸力那一份两边一模一样）`,
  );
});
