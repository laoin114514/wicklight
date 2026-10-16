/**
 * 「倾灯」这条线（v76）回归测试：把"把油泼出去"从**一件武器**接成**一套牌**。
 *
 * 倾灯（v64）是这个游戏里第一件花油的武器：一瓢抠走油桶最上面那一层，换来一片只烧敌人的火海。
 * 它把"油"从一条只能攒的曲线变成了弹药，可一件武器还不是打法——这一版补上四件回答
 * 那四个问题的遗物，**一族一件**（照「焰路」「爆灯」「燎灯」「拨芯」那四条线的规矩）：
 *   · **浇油**（焰火）那片火每 0.6 秒续的灼烧从 1 层变 2 层——烧得更厚；
 *   · **大瓢**（长明）火海半径 +20%、多烧 1.2 秒——铺得更开、留得更久；
 *   · **拾油**（灯油）死在你倒的那片火里的怪回 0.5% 油，**一瓢最多收回代价的六成**；
 *   · **烬护**（暗影）站在你自己倒的油火里受到伤害 -25%——倒完那几步，火里就是掩体。
 *
 * 这里要盯的是**这些数到底是谁在改**，以及两件最容易悄悄写错的事：
 *   · 拾油那条**按瓢**的封顶（不封顶的话一片 30 只的怪群就是一口油井，"油"这个资源当场失效）；
 *   · 烬护认的是"**你自己倒的**那一片"（别的火本来就烧你，躲进去不是掩体）。
 * 另外 "那一瓢倒多大" 有两处实现（真落下的火、手动瞄准的落点标记），它们必须一致——
 * 标记画的圈比真火小一点，玩家就会照着小圈站到火沿上，而烬护靠的正是"我到底在不在火里"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 pour.test.mjs 一样：人挪到 700px 外、清墙、场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pourrel-${tag}-${Date.now()}-${Math.random()}`);
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
  // 灯台也要挪走（v74）：站在旁边会被点着，而点燃回 14% 的油——
  // 这一页量的是"倾灯这套改了哪些数"，油面上多出一口随机的 +14% 会把它淹掉
  // （实测 40 局里有 5 局会把灯台刷在 (700,700) 的 200px 内）。
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

/** 只留倾灯（满级）+ 指定的遗物。油的自然衰减关掉：这一页量的是"这一瓢的账"。 */
function build(game, relics = [], level = 5) {
  const p = game.player;
  p.weapons.clear();
  p.weapons.set('pour', level);
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
function statue(game, x, y) {
  const e = game.enemies.spawn('shade', x, y, 1, 0);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 场上自己烧的那几片火（倾灯落下的那些）。 */
const ownFires = (game) => game.grounds.filter((g) => g.ignites && g.kind === 'fire');

/** 倒出第一瓢、等它落地。返回落点那片火。 */
function cast(game, opts = {}) {
  game.player.oil = game.player.oilMax;
  // ⚠ 跑 3 帧而不是 1 帧：挨过打的话 `hitStop`（顿帧）会让 `Game.update` 早退几帧，
  //   一帧就断言"倒出去了"会红在一个跟倾灯毫无关系的地方。3 帧里它也响不了第二瓢（冷却 1.6 秒）。
  run(game, 3);
  assert.equal(game.pourCount, 1, '满油时第一帧就该倒出去（这一页的前提）');
  run(game, 30);
  const fires = ownFires(game);
  assert.equal(fires.length, 1, `地面上该落下 1 片自己的火（实际 ${fires.length}）`);
  // 量一片火烧到底的场合要**把武器摘掉**：冷却只有 1.6 秒，而这片火烧 4.4 秒——
  // 不摘的话第二瓢会在半路炸进来（给它 +6 层），量到的就不是"这一片火烧到顶要多久"了。
  if (opts.oneShot) {
    game.player.weapons.delete('pour');
    game.player.recomputeStats();
  }
  return fires[0];
}

const RELICS = () => globalThis.window.__WICKLIGHT__.data.relics;
const POUR_OF = () => globalThis.window.__WICKLIGHT__.data.pour;

test('倾灯这套：正好四件、一族一件、四个数各归一件，而且都进图鉴', async (t) => {
  const game = await open(t, 'shape');
  const { data } = globalThis.window.__WICKLIGHT__;
  const LINE = { pourstoke: 'flame', pourladle: 'lamp', pourgather: 'oil', pourward: 'shade' };
  const KEYS = ['pourStacks', 'pourSpread', 'pourLife', 'pourEmber', 'pourShelter'];
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
  // ×v77：「伏灯」那四件（灯阵 / 接火 / 香饵 / 绊线）各补一件，于是变成各 15 件；
  // ×v78：「旋灯」那四件（张网 / 标灯 / 榨油 / 缠网）各补一件，于是现在是各 16 件
  assert.deepEqual(counts, { flame: 16, lamp: 16, oil: 16, shade: 16 }, '四族应各 16 件');
  // 装上也真的不炸：四件同时在身上，五个数都得到身上
  const p = build(game, Object.keys(LINE));
  assert.ok(p.flags.pourStacks > 0 && p.flags.pourSpread > 0 && p.flags.pourLife > 0, '前三个数该上身');
  assert.ok(p.flags.pourEmber > 0 && p.flags.pourShelter > 0, '后两个数该上身');
  assert.ok(Number.isFinite(p.oilFrac) && Number.isFinite(p.damageScale), '四件在身时那几个数都要算得出来');
});

test('浇油：跟着烧起来的那几只，从 6 层烧到最厚（12 层）由 6 拍缩到 2 拍', async (t) => {
  // ⚠ 量的对象不能是"被这一瓢直接砸中的那一只"：满级倾灯那一下自己就带 `burn: 6`，
  //   而命中那一发和爆炸各算一次——**被砸中的怪当场就是 12 层**（顶满了），火再续多少也看不出差别。
  //   真正吃这一件的是**旁边跟着烧起来的那几只**（爆炸只给它们 6 层）。
  // 量法：数拍子。火每 0.6 秒续一次，所以"拍数"是设计上那个数（6 拍 / 2 拍），
  //   而"秒数"要受"落地那一拍正好发生在 0 秒"的影响——所以主断言钉拍数，秒数只做一个范围。
  const ticksToCap = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    statue(game, 760, 700); // 挨那一瓢的
    const near = statue(game, 800, 740); // 站在旁边的（吃爆炸那一下，不被直接砸中）
    const fire = cast(game, { oneShot: true });
    const fireLife = fire.life; // ⚠ 读的是"刚落地时它还能烧多久"：地面对象是活的，跑完再读就只剩零头了
    const base = near.burn;
    assert.ok(base > 6 && base < 12, `爆炸给 6 层 + 落地那一拍续的（实测 ${base} 层）——顶满了就量不出东西`);
    let ticks = 0;
    let prev = near.burn;
    let frames = 0;
    while (near.burn < 12 && frames < 60 * 8) {
      run(game, 1);
      frames += 1;
      if (near.burn > prev) {
        ticks += 1;
        prev = near.burn;
      }
    }
    return { base, ticks, perTick: (12 - base) / ticks, seconds: frames / 60, fireLife, burn: near.burn };
  };
  const bare = await ticksToCap('stokeBare', null);
  const stoked = await ticksToCap('stokeOn', 'pourstoke');

  assert.equal(bare.burn, 12, '裸装这一片火也该顶得到 12 层（顶不到就是台上没量到）');
  assert.equal(stoked.burn, 12, '带浇油也一样是 12 层——顶还是那么高，只是到得更快');
  assert.equal(bare.perTick, 1, `裸装每拍 1 层（实测 ${bare.perTick}）`);
  assert.equal(stoked.perTick, 3, `带浇油每拍 3 层（实测 ${stoked.perTick}）`);
  assert.equal(bare.ticks, 5, `从爆炸那 6 层起，裸装还要 5 拍（实测 ${bare.ticks}）`);
  assert.equal(stoked.ticks, 1, `带浇油只要 1 拍（实测 ${stoked.ticks}）——6 拍变 2 拍`);
  assert.ok(
    bare.seconds > 2.5 && bare.seconds < 3.6,
    `裸装这一路是 3 秒上下（实测 ${bare.seconds.toFixed(2)}s，从火烧起来算 6 拍 = 3.6 秒）`,
  );
  assert.ok(
    stoked.seconds < 1.2,
    `浇油这一路是 0.6 秒上下（实测 ${stoked.seconds.toFixed(2)}s，从火烧起来算 2 拍 = 1.2 秒）`,
  );
  assert.ok(
    stoked.seconds < bare.seconds / 3,
    `这一件买到的"更快到顶"要过三倍身位（${bare.seconds.toFixed(2)}s → ${stoked.seconds.toFixed(2)}s）`,
  );
  assert.ok(
    bare.seconds < bare.fireLife,
    `裸装也得在火灭之前顶满（${bare.seconds.toFixed(2)}s < ${bare.fireLife.toFixed(1)}s），不然这一条量的就不是"更快"`,
  );
});

test('大瓢：火海半径 +20%、多烧 1.2 秒，而且落点标记画的就是这片火', async (t) => {
  const poolOf = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    statue(game, 760, 700);
    const fire = cast(game);
    // 标记那一圈：手动瞄准时才画（这里直接把"手指推到底"那个状态写进去）
    game.player.aimManual = 0;
    game.player.aimPull = 1;
    const aim = game.player.pourAim;
    return { r: fire.r, life: fire.life, aim: aim?.pool ?? 0 };
  };
  const POUR = POUR_OF();
  const bare = await poolOf('ladleBare', null);
  const big = await poolOf('ladleOn', 'pourladle');
  assert.ok(
    Math.abs(big.r / bare.r - 1.2) < 1e-9,
    `火海半径该正好 +20%（${bare.r.toFixed(1)}px → ${big.r.toFixed(1)}px）`,
  );
  const st = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour').levels[4];
  assert.ok(Math.abs(bare.r - st.radius * POUR.fireSpread) < 1e-6, '裸装时半径 = 爆炸半径 × fireSpread');
  assert.ok(
    Math.abs(big.life - (bare.life + 1.2)) < 0.05,
    `该多烧 1.2 秒（${bare.life.toFixed(2)}s → ${big.life.toFixed(2)}s）`,
  );
  // 两处实现必须一致：标记画的圈 === 真落下来的那片火（差一点点就会把人骗到火沿上）
  assert.ok(
    Math.abs(big.aim - big.r) < 1e-9,
    `落点标记的圈要和真火一样大（标记 ${big.aim.toFixed(1)}px vs 真火 ${big.r.toFixed(1)}px）`,
  );
  assert.ok(Math.abs(bare.aim - bare.r) < 1e-9, `裸装时也一样（标记 ${bare.aim.toFixed(1)} vs 真火 ${bare.r.toFixed(1)}）`);
});

test('拾油：死在你火里的怪回 0.5% 油，而一瓢最多收回代价的六成', async (t) => {
  // 一片火里摆 n 只靶，等火烧上它们，再一次全部打死，量油面抬了多少。
  const killGain = async (tag, relic, count) => {
    const game = await open(t, tag);
    const p = build(game, relic ? [relic] : []);
    const foes = [];
    for (let i = 0; i < count; i += 1) {
      // ⚠ 这一团要摆得离玩家**够远**（不然灯火贴着脸烧，`burnSource` 会变成 `lantern`——
      //   那条账是"谁最后点的火"，而拾油认的是"你倒的那片火"），
      //   又要挤得够紧（火心落在被砸中的那一只身上，满级火海半径 133px）。
      // 60px + 40px 的环正好：最近的那只离人 60px（灯火接触要 35px 以内），最远的那只离火心 86px。
      const a = (i / count) * Math.PI * 2;
      const rr = count > 1 ? 40 : 0;
      foes.push(statue(game, 800 + Math.cos(a) * rr, 700 + Math.sin(a) * rr));
    }
    cast(game);
    // 让火先烧上它们（`burnSource` 要认成倾灯那一件），再把油面钉死、把衰减关掉
    run(game, 40);
    assert.ok(
      foes.every((e) => e.burnTimer > 0 && e.burnSource === 'pour'),
      `每一只都该带着你倒的那层火（实际 ${foes.map((e) => e.burnSource).join('/')}）`,
    );
    p.oil = 0.5 * p.oilMax;
    const before = p.oil;
    for (const e of foes) game.applyHit(e, 1e9, false, 0, 0, 0, { source: 'pour' });
    return { gained: p.oil - before, castCost: game.pourCastCost, oilMax: p.oilMax };
  };
  const POUR = POUR_OF();
  assert.ok(Math.abs(POUR.emberCap - 0.6) < 1e-9, `封顶写在数据里（实为 ${POUR.emberCap}）`);

  const one = await killGain('emberOne', 'pourgather', 1);
  assert.ok(
    Math.abs(one.gained - one.oilMax * 0.005) < 1e-9,
    `一只该回 0.5%（实测 ${((one.gained / one.oilMax) * 100).toFixed(3)}%）`,
  );
  const four = await killGain('emberFour', 'pourgather', 4);
  assert.ok(
    Math.abs(four.gained / one.gained - 4) < 1e-9,
    `四只该是四倍（实测 ×${(four.gained / one.gained).toFixed(2)}）——它是按只算的，还没到顶`,
  );
  // 20 只：账面 10%，被"一瓢最多收回代价的六成"咬住
  const crowd = await killGain('emberCrowd', 'pourgather', 20);
  const cap = POUR.emberCap * crowd.castCost;
  assert.ok(
    Math.abs(crowd.gained - crowd.oilMax * cap) < 1e-9,
    `20 只该正好咬住封顶（实测 ${((crowd.gained / crowd.oilMax) * 100).toFixed(2)}% vs 上限 ${(cap * 100).toFixed(2)}%）`,
  );
  assert.ok(crowd.gained / crowd.oilMax < crowd.castCost, '封顶之后仍然是"收不回本"（这是这条封顶存在的理由）');

  // 反面一：不带遗物，一只都不回
  const without = await killGain('emberBare', null, 4);
  assert.equal(without.gained, 0, '没拿拾油时一口油都不该回');
  // 反面二：身上那层火不是**你倒的**（别的武器点的），也不算
  const game = await open(t, 'emberOther');
  const p = build(game, ['pourgather']);
  const foe = statue(game, 760, 700);
  cast(game);
  foe.burnSource = 'whip'; // 火是别人点的
  p.oil = 0.5 * p.oilMax;
  const before = p.oil;
  game.applyHit(foe, 1e9, false, 0, 0, 0, { source: 'whip' });
  assert.equal(p.oil - before, 0, '死在别人的火里不算——拾油认的是"你倒的那片火"');
});

test('烬护：站在你自己倒的油火里少挨两成五，而别的火不顶用', async (t) => {
  // 挨一下（`invuln` 那 0.65 秒得先清掉，不然第二次会被它吃掉）
  const hurt = (game, amount = 100) => {
    const before = game.damageTaken;
    game.player.invuln = 0;
    game.player.dashTimer = 0;
    game.damagePlayer(amount);
    // 挨打会点起顿帧（`hitStop`），而顿帧会让接下来那几帧的 `Game.update` 早退——
    // 这里量的是减伤那条账，顿帧不属于它，清掉免得把后面的"倒一瓢"卡住。
    game.hitStop = 0;
    return game.damageTaken - before;
  };
  const POUR = POUR_OF();
  void POUR;

  // ① 没有遗物：站在自己的火里和站在外面，挨的一样多
  const game = await open(t, 'wardBare');
  build(game, []);
  statue(game, 760, 700);
  const outBare = hurt(game);
  cast(game);
  assert.equal(game.player.inOilFire, true, '这一瓢的火该盖到人身上（量"火里"的前提）');
  const inBare = hurt(game);
  assert.ok(
    Math.abs(inBare / outBare - 1) < 1e-9,
    `没拿烬护时，火里火外一样疼（火里 ${inBare.toFixed(1)} vs 火外 ${outBare.toFixed(1)}）`,
  );

  // ② 带着烬护：火里那一下正好是火外的 75%
  const game2 = await open(t, 'wardOn');
  build(game2, ['pourward']);
  statue(game2, 760, 700);
  const out = hurt(game2);
  cast(game2);
  assert.equal(game2.player.inOilFire, true, '倒完之后人该站在自己的火里');
  const inside = hurt(game2);
  assert.ok(
    Math.abs(inside - out * 0.75) / out < 0.01,
    `火里那一下该是火外的 75%（火外 ${out.toFixed(1)} → 火里 ${inside.toFixed(1)}）`,
  );
  // 火一烧完就不是掩体了：再挨一下就回到原价
  run(game2, 60 * 8);
  assert.equal(ownFires(game2).length, 0, '那瓢火该烧完了');
  assert.equal(game2.player.inOilFire, false, '火没了，"在火里"这件事也结束');
  const after = hurt(game2);
  assert.ok(Math.abs(after - out) / out < 0.01, `火灭了就回到原价（${after.toFixed(1)} vs ${out.toFixed(1)}）`);

  // ③ 别的火不算：爆裂菇词缀那类"本来就烧你"的火，躲进去不是掩体
  const game3 = await open(t, 'wardOther');
  build(game3, ['pourward']);
  statue(game3, 760, 700);
  game3.addGround(game3.player.x, game3.player.y, 120, 5, 8, 'fire', false);
  run(game3, 2);
  assert.equal(game3.player.inOilFire, false, '只有你倒出来的那片油火算掩体（别的火本来就烧你）');
  const plain = hurt(game3, 10);
  const inside3 = hurt(game3, 10);
  assert.ok(Math.abs(inside3 - plain) / plain < 0.01, '站在别人的火里没有任何折扣');
});
