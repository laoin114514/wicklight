/**
 * 「燎灯」回归测试（v73）：把**你自己这盏灯**变成武器的那一件。
 *
 * 到 v72 为止，玩家手里所有的火都要"打出去"——枪管在哪儿、往哪儿指，都是索敌说了算。
 * 灯火只在 `damageScale` 那一条曲线上变成伤害（灯越亮，打出去的一切越重）。
 * 燎灯反过来：它没有枪管，**射程就是灯火半径**，判定是"被光罩住"这件事本身。
 *
 * 于是要证明的就不是"它有没有伤害"，而是它跟灯火**绑得对不对**（这一件的好坏全在这条线上）：
 *   1. 光里的挨打、光外的一点不动（射程 = 灯火，不是 `range` 那个字段）；
 *   2. 灯火一暗（半缸油 / 拨了芯），它跟着小下去——范围收、伤害降，两样都要量到；
 *   3. 它是**脉冲**：一秒里响几下是可数的（不是每帧扣血，那样画面上什么都看不见）；
 *   4. 「燎野」每一跳留一层火，而燎灯不留；
 *   5. 它不推人（推了就是把怪推出自己的光，等于自己拆自己的台）；
 *   6. 一次脉冲烤到 8 只解「照单全收」，第一次烫到东西就进图鉴「机制」。
 *
 * 每一条都对着一个具体的数，不写"大概是这样"的断言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/**
 * 开一局干净的：把关卡随机性钉死（地图、灯台位置），不刷怪，人摆在原点、打不死。
 * ⚠ 灯火在这一版里是**被测的输入**，所以这里只在用例内部改油量，
 *   不让 `open` 顺手补油——不然量到的会是"台架自己补进来的那口油"。
 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=aura-${tag}-${Date.now()}-${Math.random()}`);
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
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

/** 只留一件武器（等级可调）。 */
function equip(game, id, level = 5) {
  game.player.weapons.clear();
  game.player.weapons.set(id, level);
  game.player.recomputeStats();
}

/** 跑 n 帧：不动、不开火以外的事。 */
const run = (game, frames) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, false);
    game.update(1 / 60);
  }
};

/** 钉在某个位置、打不死的靶：它自己不会动，动量出来的只会是这一件武器。 */
function dummy(game, x, y) {
  const e = game.enemies.spawn('shade', x, y, 1, 0);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  return e;
}

/** 把油钉到一个数上（灯火 = 96 + 油 × 224，见 Player.update）。 */
function oilAt(game, frac) {
  const p = game.player;
  p.oil = p.oilMax * frac;
  return p;
}

const dmgOf = (game, id) => game.damageBySource.get(id) ?? 0;
const AURA_OF = () => globalThis.window.__WICKLIGHT__.data.aura;

test('燎灯：武器在池里、图鉴收录、进化链闭合、而且是唯一的"没有枪管"那一类', async (t) => {
  const game = await open(t, 'data');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const a = weapons.find((w) => w.id === 'aura');
  const w = weapons.find((w) => w.id === 'aura_wild');
  assert.ok(a && w, '武器池里应有燎灯与它的进化');
  assert.equal(a.kind, 'aura', '它自成一类（不是火球、不是火环）');
  assert.equal(a.evolve.passive, 'scorch', '进化要的被动是「燎原」——管灼烧的那一件');
  assert.deepEqual(a.evolve, { passive: 'scorch', into: 'aura_wild' }, '进化链应为 满级+燎原 → 燎野');
  assert.ok(w.evolved, '燎野应标记为进化形态');
  assert.equal(weapons.filter((x) => x.kind === 'aura').length, 2, '这一类就是这两件');
  // 它不发射任何东西：这几个字段留 0 是**设计**，不是漏填——改数据的人该被这里挡一下
  for (const k of ['count', 'speed', 'radius']) {
    assert.equal(a.levels[0][k], 0, `燎灯的 ${k} 应当是 0（它不发射任何东西）`);
  }
  assert.equal(a.levels[0].range, 0, '燎灯的射程写在灯火上，不是 range 这个字段');
  // 只有伤害与心跳跟着等级长
  const last = a.levels[a.levels.length - 1];
  assert.ok(last.damage > a.levels[0].damage && last.cooldown < a.levels[0].cooldown, '升级只该让它更重、更快');
  assert.ok(w.levels[0].burn > 0 && !a.levels[0].burn, '只有「燎野」留火');
  assert.ok(w.levels[0].range > 0, '「燎野」的 range 是"灯外还烧到多远"（不是 0，见 data/aura.ts）');
  for (const [id, def] of [['aura', a], ['aura_wild', w]]) {
    assert.equal(def.levels[0].knockback, 0, `${def.name} 不推人：推了就是把怪推出自己的光`);
    assert.ok(game.codex.entry(`weapon:${id}`), `图鉴应收录 ${def.name}`);
  }
  assert.ok(game.codex.entry('mechanic:aura'), '图鉴应有一条「机制 · 燎灯」');
  const AURA = AURA_OF();
  assert.ok(AURA.crowd >= 6, '「照单全收」的门槛不该是"顺手就够"');
  assert.ok(AURA.pulseFade > 0 && AURA.edgeEmbers > 0, '脉冲的余温与火星都该是正数');
});

test('燎灯：每一件非进化的武器都真的抽得到（进不了升级池的武器等于不存在）', async (t) => {
  const game = await open(t, 'pool');
  const { newWeaponPool, starterWeapons } = globalThis.window.__WICKLIGHT__.data;
  const p = game.player;
  p.weapons.clear();
  p.weapons.set('ring', 1); // 一个刚开局的玩家：手里只有一件开局的火环
  p.recomputeStats();
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    for (const offer of game.upgrades.generate(p, 3, game.rng)) seen.add(offer.id);
  }
  // 候选表本身要自洽：非进化 + 不在开局那六件里（不然"抽不到"和"已经拿着"会混在一起）
  const all = globalThis.window.__WICKLIGHT__.data.weapons;
  const base = all.filter((w) => !w.evolved);
  for (const w of base) {
    if (starterWeapons.includes(w.id)) continue;
    assert.ok(newWeaponPool.includes(w.id), `${w.name} 该在"新武器"候选表里（不然它一局都抽不到）`);
    assert.ok(seen.has(w.id), `抽三百次升级面板该抽到「${w.name}」一次`);
  }
  assert.ok(newWeaponPool.every((id) => all.some((w) => w.id === id && !w.evolved)), '候选表里不该有进化的形态');
});

test('燎灯：光里的挨打、光外的一点不动——它的射程是灯火，不是别的什么', async (t) => {
  const game = await open(t, 'range');
  equip(game, 'aura');
  oilAt(game, 1);
  const p = game.player;
  // ⚠ 这里量的是"以`player.lightRadius`为界"，所以靶子由**量出来的那个半径**摆，
  //   不写死 320：满油那条算式（96 + 油 × 224）外面还乘着灯火加成，
  //   守夜人身上不是 1（实测 300px），写死了就成了在测一个常数。
  const R = p.lightRadius;
  assert.ok(R > 240 && R < 340, `满油时灯火该在 240~340px 这一档（实际 ${R.toFixed(0)}）`);
  const inside = dummy(game, Math.round(R * 0.75), 0); // 圈里
  const outside = dummy(game, Math.round(R * 1.3), 0); // 圈外
  run(game, 120);
  assert.ok(inside.hp < inside.maxHp, `灯照到的该被烤（${(R * 0.75).toFixed(0)}px < ${R.toFixed(0)}px）`);
  assert.equal(outside.hp, outside.maxHp, `灯照不到的一点都不该动（${(R * 1.3).toFixed(0)}px > ${R.toFixed(0)}px）`);
  assert.ok(dmgOf(game, 'aura') > 0, '这一件的账要记在它自己头上');
});

test('燎灯：灯一暗它就小——半缸油和拨芯两条都要量到', async (t) => {
  const game = await open(t, 'dim');
  equip(game, 'aura');
  const p = game.player;

  // ① 满油 vs 半缸油：同一只靶、同一个位置，伤害按 `damageScale` 落下来
  oilAt(game, 1);
  const bright = dummy(game, 120, 0);
  run(game, 120);
  const brightDmg = bright.maxHp - bright.hp;
  const brightR = p.lightRadius;

  const game2 = await open(t, 'dim2');
  equip(game2, 'aura');
  oilAt(game2, 0.25);
  const dim = dummy(game2, 120, 0);
  run(game2, 120);
  const dimDmg = dim.maxHp - dim.hp;
  const dimR = game2.player.lightRadius;
  assert.ok(dimR < brightR, '油少一半，灯火半径该明显小下去');
  assert.ok(
    dimDmg < brightDmg * 0.8,
    '灯火暗了，同一件武器的伤害该跟着落下来（"灯火 = 火力"这条曲线对它也成立）',
    `满油 ${brightDmg.toFixed(0)} → 半缸 ${dimDmg.toFixed(0)}，半径 ${brightR.toFixed(0)} → ${dimR.toFixed(0)}`,
  );

  // ② 拨着芯：半径砍一半（240px 的靶整个掉出光圈）+ damageScale ×0.65
  const game3 = await open(t, 'dim3');
  equip(game3, 'aura');
  oilAt(game3, 1);
  const p3 = game3.player;
  p3.wickOn = true;
  run(game3, 120); // 拨到底要走完那 0.28 秒
  const far = dummy(game3, 240, 0); // 满油时它在圈里，拨了芯之后它在圈外
  const near = dummy(game3, 80, 0);
  const before = dmgOf(game3, 'aura');
  run(game3, 120);
  assert.ok(p3.dimmed, '拨到底之后 `dimmed` 该是 true');
  assert.ok(p3.lightRadius < brightR * 0.6, `拨芯要把灯火砍掉一半（${brightR.toFixed(0)} → ${p3.lightRadius.toFixed(0)}）`);
  assert.equal(far.hp, far.maxHp, '拨了芯之后，240px 那只该整个掉出光圈——一下都不该挨');
  assert.ok(near.hp < near.maxHp, '近处那几只照旧挨打（只是更轻）');
  assert.ok(dmgOf(game3, 'aura') > before, '账还在记，只是记进光里的那几只');

  // ③ 直接对账：拨芯那一刀的账面是 ×0.65（和别的武器同一条 `damageScale`）。
  //    ⚠ 暴击要关掉：`hitEnemy` 每一下都掷一次暴击（×1.35），几下的样本里
  //    掷中一次就够把比值顶到 0.88——那量到的是运气，不是拨芯那一刀。
  const game4 = await open(t, 'dim4');
  equip(game4, 'aura');
  oilAt(game4, 1);
  game4.player.stats.critChance = 0;
  const t4 = dummy(game4, 80, 0);
  run(game4, 180);
  const full = t4.maxHp - t4.hp;
  const game5 = await open(t, 'dim5');
  equip(game5, 'aura');
  oilAt(game5, 1);
  game5.player.stats.critChance = 0;
  game5.player.wickOn = true;
  run(game5, 120);
  const t5 = dummy(game5, 80, 0);
  run(game5, 180);
  const wickDmg = t5.maxHp - t5.hp;
  const ratio = wickDmg / full;
  assert.ok(
    Math.abs(ratio - 0.65) < 0.06,
    '拨着芯时这一件的输出该正好是 ×0.65（灯火那条最外面的一刀）',
    `实测 ${ratio.toFixed(3)}（${wickDmg.toFixed(0)} / ${full.toFixed(0)}）`,
  );
});

test('燎灯：脉冲是"一下一下"，不是每帧扣血', async (t) => {
  const game = await open(t, 'pulse');
  equip(game, 'aura');
  oilAt(game, 1);
  const p = game.player;
  const st = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'aura').levels[4];
  const e = dummy(game, 60, 0);
  // 记下每一次飘字：一次脉冲一只怪 = 一个字
  const pops = [];
  const fl = game.floaters.damage.bind(game.floaters);
  game.floaters.damage = (x, y, amount, crit) => {
    pops.push(amount);
    return fl(x, y, amount, crit);
  };
  const seconds = 4;
  oilAt(game, 1);
  run(game, Math.round(seconds * 60));
  const expect = seconds / (st.cooldown * p.stats.cooldownMult);
  assert.ok(
    Math.abs(pops.length - expect) <= 2,
    `${seconds} 秒里该响约 ${expect.toFixed(1)} 下（不是每帧一下）：实测 ${pops.length}`,
    `间隔 ${st.cooldown}s`,
  );
  assert.ok(e.hp < e.maxHp, '靶子确实在挨打（不然"数够了"没有意义）');
});

test('燎野：光外面那 60px 也烧得到——那是火，不是光', async (t) => {
  // 「燎野」的 `range: 60` 是这一条进化唯一"够得到灯外"的地方，也是它和「燎原」连着用才有意义的原因
  // （一半的输出在灼烧那条账上）。它写在数据里很容易，接没接上得在这里量：
  // 靶子按**量出来的**灯火半径摆，比的就是"同一只靶，换成进化形态打不打得到"。
  const game = await open(t, 'wildout');
  equip(game, 'aura_wild');
  oilAt(game, 1);
  // ⚠ `lightRadius` 是每帧从油量重算出来的，刚 `oilAt` 完读到的还是上一帧的旧数——
  //   先跑几帧让它落到真值上，再按它摆靶（不然量到的是"我摆歪了"，不是"它够不够得着"）。
  run(game, 4);
  const R = game.player.lightRadius;
  const beyond = dummy(game, Math.round(R + 30), 0); // 光外面一点点：燎野该烧得到
  const faraway = dummy(game, Math.round(R + 120), 0); // 隔了一百多像素：谁都够不着
  run(game, 120);
  assert.ok(beyond.hp < beyond.maxHp, `「燎野」该烧到灯外那 ${30}px 上（${(R + 30).toFixed(0)}px > 灯火 ${R.toFixed(0)}px）`);
  assert.equal(faraway.hp, faraway.maxHp, '但那也只是"烧出去一点点"——一百多像素外照旧够不着');

  // 没进化的燎灯在同一条线上一点都够不到（那一截是进化买来的）
  const game2 = await open(t, 'wildout2');
  equip(game2, 'aura');
  oilAt(game2, 1);
  run(game2, 4);
  const R2 = game2.player.lightRadius;
  const e2 = dummy(game2, Math.round(R2 + 30), 0);
  run(game2, 120);
  assert.equal(e2.hp, e2.maxHp, `燎灯就该够不到灯外（${(R2 + 30).toFixed(0)}px > 灯火 ${R2.toFixed(0)}px）`);
});

test('燎野：每一跳留一层火，而燎灯不留', async (t) => {
  const game = await open(t, 'burn');
  equip(game, 'aura_wild');
  oilAt(game, 1);
  const e = dummy(game, 60, 0);
  run(game, 90);
  assert.ok(e.burn >= 1, '「燎野」的每一跳都该在敌人身上留一层灼烧');
  assert.ok(e.hp < e.maxHp, '它自己也该有直接伤害（不只是点火）');
  assert.equal(game.damageBySource.get('aura_wild') !== undefined, true, '账记在燎野这一件上');

  const game2 = await open(t, 'noburn');
  equip(game2, 'aura');
  oilAt(game2, 1);
  const e2 = dummy(game2, 60, 0);
  run(game2, 90);
  assert.equal(e2.burn, 0, '燎灯不留火（留火是「燎野」那一件的升级内容）');
});

test('燎灯：每一次心跳都放出一圈冲击波，而且它在光边上停下', async (t) => {
  // 这一件不发射任何东西，所以"它开火了"这件事要有个形状——不然它没烫到人的时候
  // （怪还在灯外走过来）屏幕上就是彻底安静的，玩家没法判断它是在转还是坏了。
  // 那一圈冲击波就是这一拍的形状，而它的**大小**必须等于这一件的射程：
  // 圈停在哪儿，就是它打得到哪儿（燎野会多出那 60px，所以进化的"够得到灯外"也看得见）。
  const game = await open(t, 'wave');
  equip(game, 'aura');
  oilAt(game, 1);
  const waves = [];
  const shock = game.particles.shockwave.bind(game.particles);
  game.particles.shockwave = (x, y, color, size, life) => {
    // ⚠ 灯火是每帧从油量重算的（这一秒里油在烧），所以"该多大的圈"要在**放圈的那一帧**读，
    //    跑完再看就只剩 316.5 了——那量到的是油衰减，不是它接得对不对。
    waves.push({ size, life, d: Math.hypot(x - game.player.x, y - game.player.y), r: game.player.lightRadius });
    return shock(x, y, color, size, life);
  };
  run(game, 60); // 一秒：满级 0.31 秒一下，够响三下
  const AURA = AURA_OF();
  assert.ok(waves.length >= 2, `一秒里该放出去好几圈（实测 ${waves.length}）`);
  for (const w of waves) {
    assert.ok(Math.abs(w.d) < 1e-6, '这一圈是从人身上扩出去的');
    assert.equal(w.life, AURA.pulseFade, '它飞完的时间就是 pulseFade');
    assert.ok(
      Math.abs(w.size - w.r) < 1e-6,
      `没进化时这一圈该正好停在灯火半径上（圈 ${w.size.toFixed(1)} vs 灯火 ${w.r.toFixed(1)}）`,
    );
  }

  // 进化形态：圈要多走 60px——"火能烧到灯照不到的地方"那一条在画面上也是真的
  const game2 = await open(t, 'wave2');
  equip(game2, 'aura_wild');
  oilAt(game2, 1);
  const wild = [];
  const shock2 = game2.particles.shockwave.bind(game2.particles);
  game2.particles.shockwave = (x, y, color, size, life) => {
    wild.push({ size, r: game2.player.lightRadius });
    return shock2(x, y, color, size, life);
  };
  run(game2, 30);
  const wildRange = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'aura_wild').levels[4].range;
  assert.ok(wild.length >= 1, '燎野照样有心跳');
  assert.ok(
    Math.abs(wild[0].size - (wild[0].r + wildRange)) < 1e-6,
    `燎野那一圈该走到灯火外面 ${wildRange}px（${wild[0].size.toFixed(1)} vs 灯火 ${wild[0].r.toFixed(1)}）`,
  );
});

test('燎灯：不烫到人的时候也在烧——每一次心跳在光的边缘飞起一组火星', async (t) => {
  // 一件"什么都没打到时屏幕上完全不存在"的武器是读不出来的：这盏灯的常驻视觉就是
  // 光边缘那几粒火星（真的烫到东西时另外响一声，见 `AURA.sound`）。
  // 这里量的是"它在**没有敌人**的时候也看得见"，所以靶房是空的。
  const game = await open(t, 'embers');
  equip(game, 'aura');
  oilAt(game, 1);
  run(game, 4); // 让 lightRadius 落到真值上（见上一条用例的注释）
  const R = game.player.lightRadius;
  const embers = [];
  const burst = game.particles.burst.bind(game.particles);
  game.particles.burst = (x, y, count, color, opts) => {
    if (count === 1 && opts?.size === 2.4 && opts?.speed === 26) {
      embers.push(Math.hypot(x - game.player.x, y - game.player.y));
    }
    return burst(x, y, count, color, opts);
  };
  run(game, 60); // 一秒：按满级那 0.31 秒一下，够响三下
  const AURA = AURA_OF();
  assert.ok(
    embers.length >= AURA.edgeEmbers && embers.length % AURA.edgeEmbers === 0,
    `每秒该飞出整数组的火星（一组 ${AURA.edgeEmbers} 粒）：实测 ${embers.length}`,
  );
  for (const d of embers) {
    assert.ok(d >= R * 0.85 && d <= R * 1.02, `火星该飞在光的边缘（实测 ${d.toFixed(0)}px，灯火 ${R.toFixed(0)}px）`);
  }
});

test('燎灯：它不推人（推了就是把怪推出自己的光）', async (t) => {
  const game = await open(t, 'knock');
  equip(game, 'aura');
  oilAt(game, 1);
  const e = dummy(game, 100, 0);
  assert.equal(e.vx, 0);
  run(game, 120);
  assert.ok(e.hp < e.maxHp, '它得真的在烤（不然这条断言是空的）');
  assert.ok(Math.abs(e.vx) < 1e-6 && Math.abs(e.vy) < 1e-6, `被打的怪不该被推动（vx=${e.vx}）`);
});

test('燎灯：一次烤到 8 只解「照单全收」，第一次烫到东西就进图鉴', async (t) => {
  const game = await open(t, 'crowd');
  equip(game, 'aura');
  oilAt(game, 1);
  assert.equal(game.save.codex.includes('mechanic:aura'), false, '还没用出来的时候不该有这一条');
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    dummy(game, Math.cos(a) * 120, Math.sin(a) * 120);
  }
  run(game, 40); // 一次心跳
  assert.ok(game.save.codex.includes('mechanic:aura'), '烫到东西之后该把「机制 · 燎灯」记上');
  assert.ok(game.save.achievements.includes('aura_crowd'), '一次烤到 8 只该解「照单全收」');

  // 7 只不够（门槛是 8）：换一局再来一遍
  const game2 = await open(t, 'crowd2');
  equip(game2, 'aura');
  oilAt(game2, 1);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    dummy(game2, Math.cos(a) * 120, Math.sin(a) * 120);
  }
  run(game2, 40);
  assert.ok(
    !game2.save.achievements.includes('aura_crowd'),
    '7 只不该解——门槛写的是 8，松一格它就变成"顺手就有"',
  );
});
