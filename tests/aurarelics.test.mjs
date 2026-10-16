/**
 * 「燎灯」这条线（v75）回归测试：把"亮着烧"从**一件武器**接成**一套牌**。
 *
 * v73 把"你自己这盏灯"变成了武器（射程 = 灯火半径，罩到谁就烤谁）。可它交出来的也是
 * 一句话、不是一个打法：光罩到谁就烤谁，听起来和"把怪放进来"没有关系。这一版补上四件
 * 回答那四个问题的遗物，**一族一件**（照「焰路」「爆灯」「拨芯」三条线的规矩）：
 *   · **旺火**（焰火）一次脉冲里每多罩住一只，那一下每只就多受 6%（最多 +60%）——"人越挤，光越旺"；
 *   · **漫光**（长明）灯火半径 +10%，但灯油烧快 12%——它是**拨芯的反面**；
 *   · **吮灯**（灯油）每烫到一只回 0.05% 油（一次脉冲封顶 0.5%）——"烧回来的油接着烧"；
 *   · **烟熏**（暗影）被烫到的敌人移速 -22%、慢 1.2 秒——"放进来之后走不掉"。
 *
 * 这里要盯的是**这些数到底是谁在改**，而不是"伤害更高了"：
 *   · 旺火是**整拍统一**加成的（先数后打），所以同一拍里每一只的伤害必须**完全相等**；
 *   · 漫光改的是半径与油耗**两个**数，而且方向相反（一个白拿、一个付账），只量到一个都算没量全；
 *   · 吮灯只在**真的烫到东西**时结账——空拍回油等于把这条遗物的代价抹掉了；
 *   · 烟熏的减速不能顶掉更狠的那条线（霜冻是 0.5 倍），这是 `Enemy.slowFactor` 存在的理由。
 *
 * 每一条都对着一个具体的数，不写"大概是这样"的断言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：不刷怪、不弹说明卡、血量给到打不死，并把地图随机性钉死。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=aurarel-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  env.intervals.length = 0;
  const realRandom = Math.random;
  Math.random = () => 0.20250815;
  game.bootDone();
  game.newRun('warden', 'normal', false);
  Math.random = realRandom;
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  // 灯台也要挪走（v74）：站在旁边就会被点着，而点燃回 14% 的油——
  // 这个场合玩家常常是"钉在一个固定坐标上量几秒的油"的，那时量到的是"油 +14%"，而且是随机的
  // （实测 40 局里有 5 局会把灯台刷在 (700,700) 的 200px 内）。场面本来就该全由测试自己摆。
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
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

/** 只留一件武器（等级可调），再塞进指定的遗物。 */
function build(game, weapons = [['aura', 5]], relics = []) {
  const p = game.player;
  p.weapons.clear();
  for (const [id, lv] of weapons) p.weapons.set(id, lv);
  p.relics.clear();
  for (const id of relics) p.relics.add(id);
  p.recomputeStats();
  // ⚠ 暴击是可变的（`Math.random`），而这里量的是"这一下多重"。不关掉它，量到的是运气。
  p.stats.critChance = 0;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return p;
}

/** 跑 n 帧：不动、不开火以外的事。 */
const run = (game, frames) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, false);
    game.update(1 / 60);
  }
};

/** 把油钉到一个数上（灯火 = 96 + 油 × 224，见 Player.update）。 */
const oilAt = (game, frac) => {
  const p = game.player;
  p.oil = p.oilMax * frac;
  return p;
};

/** 钉在某个位置、打不死的靶。 */
function dummy(game, x, y) {
  const e = game.enemies.spawn('shade', x, y, 1, 0);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 在半径 `r` 上摆一圈 `count` 只靶。 */
function ring(game, count, r) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    out.push(dummy(game, Math.cos(a) * r, Math.sin(a) * r));
  }
  return out;
}

const RELICS = () => globalThis.window.__WICKLIGHT__.data.relics;
const AURA_OF = () => globalThis.window.__WICKLIGHT__.data.aura;

test('燎灯这套：正好四件、一族一件、四个数各归一件，而且都进图鉴', async (t) => {
  const game = await open(t, 'shape');
  const { data } = globalThis.window.__WICKLIGHT__;
  const LINE = { auraflare: 'flame', auralantern: 'lamp', aurasiphon: 'oil', aurasmother: 'shade' };
  const KEYS = ['auraCrowd', 'lightSpread', 'auraSiphon', 'auraSnare'];
  // 名单从 `mods` 里认出来（不是手抄的 id 列表）：以后再加一件、或者把某一件挪走，这里会当场红。
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
  // 四个数各归一件：单拿一件只买到一件事——凑齐才是"把怪放进来、亮着烧、烧回来接着烧"
  // （和「拨芯」那四件同一个规矩：一件改两个数就变成纯战力了）。
  for (const k of KEYS) {
    const owners = RELICS().filter((r) => k in r.mods);
    assert.equal(owners.length, 1, `${k} 只该由一件遗物改（实际 ${owners.map((o) => o.name).join('/')}）`);
  }
  // 一族一件：四族等量，第二档共鸣（5 件）的门槛才一直是那个数
  const counts = {};
  for (const r of data.relics) counts[r.tribe] = (counts[r.tribe] ?? 0) + 1;
  // ×v76：「倾灯」那四件（浇油 / 大瓢 / 拾油 / 烬护）照同样的规矩一族一件，于是变成各 14 件；
  // ×v77：「伏灯」那四件（灯阵 / 接火 / 香饵 / 绊线）再各补一件，于是现在是各 15 件。
  assert.deepEqual(counts, { flame: 15, lamp: 15, oil: 15, shade: 15 }, '四族应各 15 件');
  // 装上也真的不炸：四件同时在身上，四个数都得到身上
  const p = build(game, [], Object.keys(LINE));
  assert.ok(p.flags.auraCrowd > 0 && p.flags.lightSpread > 0, '旺火与漫光的数该上身');
  assert.ok(p.flags.auraSiphon > 0 && p.flags.auraSnare > 0, '吮灯与烟熏的数该上身');
  assert.ok(Number.isFinite(p.damageScale) && Number.isFinite(p.brightness), '四件在身时那几个数都要算得出来');
});

test('旺火：光里每多一只，这一拍每只都更重——同一拍里每一只同价、11 只以上咬住上限', async (t) => {
  // 一次脉冲里挨个量"这一下多重"。关掉暴击之后这个数只由三件事决定：
  // 武器等级、灯火（`damageScale`）、以及**光里挤着几只**。
  const pulse = async (tag, count, relic) => {
    const game = await open(t, tag);
    build(game, [['aura', 5]], relic ? [relic] : []);
    oilAt(game, 1);
    const got = [];
    const real = game.applyHit.bind(game);
    game.applyHit = (e, dmg, ...rest) => {
      got.push(dmg);
      return real(e, dmg, ...rest);
    };
    ring(game, count, 120);
    for (let i = 0; i < 40 && got.length < count; i += 1) run(game, 1);
    assert.equal(got.length, count, `这一拍该把 ${count} 只全烤到（实为 ${got.length}）——量不到就是台架错了`);
    return got;
  };

  const one = await pulse('flare1', 1, null);
  const sixBare = await pulse('flare6bare', 6, null);
  const six = await pulse('flare6', 6, 'auraflare');
  const twelve = await pulse('flare12', 12, 'auraflare');
  const AURA = AURA_OF();
  assert.ok(Math.abs(AURA.crowdBonusMax - 0.6) < 1e-9, `上限写在数据里（实为 ${AURA.crowdBonusMax}）`);

  // 没带遗物时人多人少一个价：不然下面那两条量到的可能是别的东西
  assert.ok(Math.abs(sixBare[0] / one[0] - 1) < 1e-9, `裸装时 6 只与 1 只同价（${sixBare[0]} vs ${one[0]}）`);
  // 6 只：(6-1) × 6% = +30%
  assert.ok(
    Math.abs(six[0] / one[0] - 1.3) / 1.3 < 0.01,
    `6 只该 +30%（${one[0].toFixed(2)} → ${six[0].toFixed(2)}，实测 ×${(six[0] / one[0]).toFixed(3)}）`,
  );
  // 12 只：账面 (12-1) × 6% = +66%，被上限咬到 +60%
  assert.ok(
    Math.abs(twelve[0] / one[0] - 1.6) / 1.6 < 0.01,
    `12 只该咬住 +60% 的上限（实测 ×${(twelve[0] / one[0]).toFixed(3)}）——没有上限时这一条会量到 1.66`,
  );
  // "先数再打"：同一拍里每一只拿到的是同一个倍率（一只一个价的话，人越多就越乱）
  for (const d of twelve) {
    assert.ok(Math.abs(d - twelve[0]) < 1e-9, `同一拍里每一只同价（${twelve[0]} vs ${d}）`);
  }
});

test('漫光：灯火半径 +10%，代价是灯油烧快 12%——它和「拨芯」是两条相反的路', async (t) => {
  // ⚠ 量半径这一下要把油**冻住**（`oilDecayPerSec = 0`）：漫光的代价就是"油烧快 12%"，
  //    不冻住的话，两局在第 4 帧的油量已经不一样了，量到的是 1.0998 而不是 1.1——
  //    那是它自己的代价混进了它的收益里。代价那一半下面单独量。
  const radius = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, [['aura', 5]], relic ? [relic] : []);
    game.player.oilDecayPerSec = 0;
    oilAt(game, 1);
    run(game, 4);
    return game.player.lightRadius;
  };
  const bare = await radius('lanternBare', null);
  const wide = await radius('lanternWide', 'auralantern');
  assert.ok(
    Math.abs(wide / bare - 1.1) < 1e-9,
    `灯火半径该正好 +10%（${bare.toFixed(1)}px → ${wide.toFixed(1)}px）`,
  );

  // 代价那一半：同一段时间里油掉了多少（两局从同一个油量、同一条衰减曲线出发）
  const burned = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, [['aura', 5]], relic ? [relic] : []);
    oilAt(game, 1);
    run(game, 4);
    const before = game.player.oil;
    run(game, 296);
    return before - game.player.oil;
  };
  const b = await burned('lanternBurnBare', null);
  const w = await burned('lanternBurnWide', 'auralantern');
  assert.ok(
    Math.abs(w / b - 1.12) / 1.12 < 0.01,
    `灯油该烧快 12%（裸烧 ${(b * 100).toFixed(2)}% vs 带遗物 ${(w * 100).toFixed(2)}%）`,
  );

  // 反面：拨芯把同一个数往回拨（收小、省油）。两条路一个向右一个向左，
  // 所以"一次开局只该选一边"不是一句气氛话，它就是这两个方向写在同一个数上。
  const game = await open(t, 'lanternWick');
  build(game, [['aura', 5]], []);
  oilAt(game, 1);
  run(game, 4);
  const lit = game.player.lightRadius;
  game.setInput(0, 0, false, false, false, null, true); // 真按一下 C
  run(game, 30);
  const dim = game.player.lightRadius;
  assert.ok(game.player.dimmed, '这一下真的拨到底了（量"反面"的前提）');
  assert.ok(
    dim < lit * 0.75 && wide > bare,
    `拨芯把半径收小、漫光把它照宽（裸 ${bare.toFixed(0)}px · 拨芯后 ${dim.toFixed(0)}px · 漫光 ${wide.toFixed(0)}px）`,
  );
});

test('吮灯：烫到一只回 0.05%、一次脉冲封顶 0.5%，空拍一滴不给', async (t) => {
  // 量法：两局跑同样的帧数（心跳一样密、衰减一样多），差值就是这一串脉冲补回来的油。
  const siphon = async (tag, count, relic = true) => {
    const game = await open(t, tag);
    build(game, [['aura', 5]], relic ? ['aurasiphon'] : []);
    oilAt(game, 0.5);
    let pulses = 0;
    const shock = game.particles.shockwave.bind(game.particles);
    game.particles.shockwave = (...a) => {
      pulses += 1;
      return shock(...a);
    };
    if (count > 0) ring(game, count, 120);
    run(game, 300); // 5 秒：满级 0.34 秒一下，够响十几下
    return { oil: game.player.oil, pulses };
  };

  const bare = await siphon('sipBare', 0, false);
  const none = await siphon('sipNone', 0, true);
  assert.ok(none.pulses >= 8, `这 5 秒里该响好几下（实测 ${none.pulses}）——不然下面那条断言是空的`);
  assert.ok(
    Math.abs(none.oil - bare.oil) < 1e-12,
    `空拍一滴都不给（带遗物 ${none.oil.toFixed(6)} vs 裸装 ${bare.oil.toFixed(6)}）——对着空气回油就等于没有代价`,
  );

  const one = await siphon('sipOne', 1);
  assert.equal(one.pulses, none.pulses, '回油不许改心跳（同一段时间里响的拍数要一样）');
  const AURA = AURA_OF();
  assert.ok(Math.abs(AURA.siphonMax - 0.005) < 1e-9, `封顶写在数据里（实为 ${AURA.siphonMax}）`);
  const backOne = one.oil - bare.oil;
  assert.ok(
    Math.abs(backOne - one.pulses * 0.0005) < 1e-9,
    `${one.pulses} 拍、每拍一只该回 ${(one.pulses * 0.0005 * 100).toFixed(3)}%（实测 ${(backOne * 100).toFixed(3)}%）`,
  );

  const crowd = await siphon('sipCrowd', 12);
  const backCrowd = crowd.oil - bare.oil;
  // 12 只账面 0.6%，被 0.5% 的封顶咬住 → 正好是"一只"那一路的 10 倍
  assert.ok(
    Math.abs(backCrowd - crowd.pulses * 0.005) < 1e-9,
    `一片 12 只该咬住 0.5% 的封顶（实测每拍 ${((backCrowd / crowd.pulses) * 100).toFixed(3)}%）——没有封顶时是 0.6%`,
  );
  assert.ok(
    Math.abs(backCrowd / backOne - 10) < 0.02,
    `12 只与 1 只只差"封顶"这一段：十倍（实测 ×${(backCrowd / backOne).toFixed(2)}）`,
  );
});

test('烟熏：被烫到的敌人慢 22%、慢 1.2 秒，而且顶不掉更狠的霜冻', async (t) => {
  // ① 真的走慢了：同一条直线、同一个起始位置、同一段时间，量的就是位移。
  const walk = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, [['aura', 5]], relic ? [relic] : []);
    oilAt(game, 1);
    const e = game.enemies.spawn('shade', 200, 0, 1, 0);
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 68;
    e.damage = 0;
    e.spawnTimer = 0;
    run(game, 30); // 先让第一拍落地（烟熏是"被烫到才慢"）
    const x0 = e.x;
    run(game, 30); // 半秒：裸走 34px，慢下来 26.5px
    return { e, moved: x0 - e.x };
  };
  const AURA = AURA_OF();
  assert.ok(Math.abs(AURA.snareSpan - 1.2) < 1e-9, `时长写在数据里（实为 ${AURA.snareSpan}）`);
  const bare = await walk('snareBare', null);
  const snared = await walk('snareOn', 'aurasmother');
  assert.equal(bare.e.slowTimer > 0, false, '不带遗物时它一点都没被拖住（不然量到的是别的东西）');
  assert.ok(
    Math.abs(snared.e.slowFactor - 0.78) < 1e-9,
    `被烫到之后强度该是 0.78（实为 ${snared.e.slowFactor}）`,
  );
  // 半秒之后再读：这个时长仍然挂在身上（满级的心跳只有 0.34 秒——若减速只跟这一拍一样长，
  // 这半秒的窗口里它早就该松开、位移也就回到裸走那个数了）。
  assert.ok(
    snared.e.slowTimer > 0.45 && snared.e.slowTimer <= AURA.snareSpan,
    `半秒后它还挂着（剩 ${snared.e.slowTimer.toFixed(2)}s，每一次心跳又会把它顶回 ${AURA.snareSpan}s）`,
  );
  assert.ok(
    Math.abs(snared.moved / bare.moved - 0.78) < 0.02,
    `位移该是裸走的 78%（裸走 ${bare.moved.toFixed(1)}px，带遗物 ${snared.moved.toFixed(1)}px）`,
  );

  // ② 谁更狠听谁的：霜冻那一路是固定的 0.5 倍，烟熏的 0.78 不许把它顶回快的。
  const game = await open(t, 'snareMerge');
  build(game, [['aura', 5]], ['aurasmother']);
  oilAt(game, 1);
  const hard = dummy(game, 120, 0);
  game.applyHit(hard, 1, false, 0, 0, 0, { slow: 3, source: '霜冻' });
  assert.equal(hard.slowFactor, 0.5, '霜冻一路写死 0.5 倍');
  run(game, 20); // 跑一拍
  assert.equal(hard.slowFactor, 0.5, '更弱的那一路不许把更狠的顶掉');
  assert.ok(hard.slowTimer > 1.2, `时长取长的那个（实为 ${hard.slowTimer.toFixed(2)}s）`);

  // 反过来：先被烟熏拖住，再来一发霜冻 → 更狠的接手
  const soft = dummy(game, -120, 0);
  run(game, 20);
  assert.ok(Math.abs(soft.slowFactor - 0.78) < 1e-9, `烟熏先把这只拖住（实为 ${soft.slowFactor}）`);
  game.applyHit(soft, 1, false, 0, 0, 0, { slow: 2, source: '霜冻' });
  assert.ok(Math.abs(soft.slowFactor - 0.5) < 1e-9, `更狠的那一发该接手（实为 ${soft.slowFactor}）`);

  // ③ 新刷出来的怪默认是"没被减速"的：池子捞回来的那只不许带着上一只的强度
  const fresh = game.enemies.spawn('shade', 400, 400, 1, 0);
  assert.equal(fresh.slowFactor, 0.5, '新怪默认 0.5（不带着上一只的减速强度回来）');
});
