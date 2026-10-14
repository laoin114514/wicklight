/**
 * 「旋灯」回归测试：这一版给玩家的是**第三个**关于位置的动词。
 *
 * 到 v56 为止，位置在玩家手里有两件事：**你**站在哪儿（躲 / 擦）、**东西**放在哪儿（分灯 / 伏灯）。
 * 旋灯是反过来的那一个——**你决定它们站在哪儿**。所以它几乎不靠伤害吃饭，它做的是"把人拢起来"。
 *
 * 于是要证明的事情是：
 *   1. 它真的把人往里拽（而且是加在怪自己的速度上：拽不动的才需要换想法）；
 *   2. 首领 / 精英拽不太动（副手武器不该把首领按在原地）；
 *   3. 转完缩成一下炸，而且**没有击退**（它的用处就是让它们待在一块儿）；
 *   4. 进化那把连弹幕一起卷（卷到中心就吞掉）；
 *   5. 一个漩涡里同时拽住 6 只解「一网打尽」；
 *   6. 吸力和帧率无关（掉帧时不该拽得更狠或更轻）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 mine.test.mjs 一样：开一局干净的，人挪到 700px 外，场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=vortex-${tag}-${Date.now()}-${Math.random()}`);
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
  game.player.x = 700;
  game.player.y = 700;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

const VORTEX_OF = () => globalThis.window.__WICKLIGHT__.data.vortex;

/** 摆一只站着不动的怪（吸力是唯一能挪动它的东西）。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

/** 把"飘字"和"环"记下来：收成那一下会多一个字、多一圈金环，这两样得能被测到。 */
function spy(game) {
  const seen = { labels: [], rings: [] };
  const fl = game.floaters.label.bind(game.floaters);
  game.floaters.label = (x, y, text, color, size) => {
    seen.labels.push({ text, color, size });
    return fl(x, y, text, color, size);
  };
  const sw = game.particles.shockwave.bind(game.particles);
  game.particles.shockwave = (x, y, color, size, life) => {
    seen.rings.push({ color, size });
    return sw(x, y, color, size, life);
  };
  return seen;
}

const run = (game, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
};

test('旋灯：武器在池里、图鉴收录、进化链闭合', async (t) => {
  const game = await open(t, 'data');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const v = weapons.find((w) => w.id === 'vortex');
  const m = weapons.find((w) => w.id === 'vortex_maelstrom');
  assert.ok(v && m, '武器池里应有旋灯与它的进化');
  assert.equal(v.kind, 'vortex', '它自成一类（不是火球也不是雷）');
  assert.equal(v.evolve.passive, 'magnet', '进化要的被动是「拾光」——会吸东西的那一件');
  assert.deepEqual(v.evolve, { passive: 'magnet', into: 'vortex_maelstrom' }, '进化链应为 满级+拾光 → 漩涡灯');
  assert.ok(m && m.evolved, '漩涡灯应标记为进化形态');
  assert.ok(m.levels.length >= 5, '漩涡灯至少应有 5 级');
  assert.ok(m.levels[0].drag > 0 && !v.levels[0].drag, '只有进化那把卷弹幕');
  assert.ok(m.levels[0].damage > v.levels[v.levels.length - 1].damage, '进化第一级的伤害不该比满级旋灯低（不然卡面读成缩水）');
  assert.ok(m.levels[0].count > v.levels[v.levels.length - 1].count, '漩涡灯一次两盏');
  assert.ok(game.codex.entry('weapon:vortex') && game.codex.entry('weapon:vortex_maelstrom'), '图鉴应收录两件');
  assert.ok(game.codex.entry('mechanic:vortex'), '图鉴应有一条「机制 · 旋灯」');
  // 落点与吸力：数据表里该有的都在
  const VORTEX = VORTEX_OF();
  for (const [k, val] of Object.entries(VORTEX)) {
    assert.equal(typeof val, 'number', `vortex.${k} 应当是数字`);
    assert.ok(val > 0, `vortex.${k} 应当是正数（实际 ${val}）`);
  }
  assert.ok(VORTEX.pull > 100, '吸力该比最慢的怪走得快，不然后者根本挪不动');
  assert.ok(VORTEX.bossPull < VORTEX.elitePull && VORTEX.elitePull < 1, '首领比精英更拽不动，普通怪完全拽得动');
  assert.ok(VORTEX.burst < 1, '收缩那一下的半径该比吸入半径小——站在边上没被拽进来的该有机会躲过');
});

test('旋灯：它真的把怪往里拽，而且拽不动的（首领）就是拽不动', async (t) => {
  const game = await open(t, 'pull');
  game.placeVortex(0, 0, 20, 200, 0, 0);
  const shade = statue(game, 120, 0);
  const d0 = Math.hypot(shade.x, shade.y);
  run(game, 30);
  const d1 = Math.hypot(shade.x, shade.y);
  assert.ok(d1 < d0 - 15, `站在圈里的怪该被拽近（${Math.round(d0)} → ${Math.round(d1)}）`);

  // 圈外的、和首领：同样的位置，位移差一个量级
  const far = await open(t, 'pull-far');
  far.placeVortex(0, 0, 20, 100, 0, 0);
  const outside = statue(far, 200, 0);
  run(far, 30);
  assert.equal(Math.round(Math.hypot(outside.x, outside.y)), 200, '吸入半径外的怪一动不动');

  const boss = await open(t, 'pull-boss');
  boss.placeVortex(0, 0, 20, 200, 0, 0);
  const lord = statue(boss, 120, 0, 'thornlord');
  const lord0 = Math.hypot(lord.x, lord.y);
  run(boss, 30);
  const lordMoved = lord0 - Math.hypot(lord.x, lord.y);
  const shadeMoved = d0 - d1;
  assert.ok(lordMoved > 0, '首领还是被拽动一点点的');
  assert.ok(lordMoved < shadeMoved * 0.5, `但明显拽不动（首领 ${lordMoved.toFixed(1)}px vs 影蛭 ${shadeMoved.toFixed(1)}px）`);
});

test('旋灯：吸力和帧率无关（掉帧时不该拽得更狠）', async (t) => {
  // 吸力是"加速度 × dt"写进速度里的。这一条钉住它：同样跑 0.5 秒，
  // 30 帧（1/60）和 15 帧（1/30）挪的距离该差不多——不然手机上（掉帧）会变成另一件武器。
  const a = await open(t, 'dt60');
  a.placeVortex(0, 0, 20, 200, 0, 0);
  const s1 = statue(a, 120, 0);
  run(a, 30, 1 / 60);
  const moved60 = 120 - Math.hypot(s1.x, s1.y);
  const b = await open(t, 'dt30');
  b.placeVortex(0, 0, 20, 200, 0, 0);
  const s2 = statue(b, 120, 0);
  run(b, 15, 1 / 30);
  const moved30 = 120 - Math.hypot(s2.x, s2.y);
  const diff = Math.abs(moved60 - moved30) / Math.max(moved60, moved30);
  assert.ok(moved60 > 10, `1/60 下真的挪了（${moved60.toFixed(1)}px）`);
  assert.ok(diff < 0.2, `两种帧率下差了不到两成（${moved60.toFixed(1)}px vs ${moved30.toFixed(1)}px）`);
});

test('旋灯：转完缩成一下炸，而且不把人推开', async (t) => {
  const game = await open(t, 'burst');
  const VORTEX = VORTEX_OF();
  game.placeVortex(0, 0, 40, 120, 0, 0);
  const inside = statue(game, 40, 0);
  // 挣脱的那只：疾影是**走着**的（玩家摆在 700px 外，所以它本来就朝外走）——
  // 吸力在圈边拉不住它，收尾自然也够不着它。这一条钉的是这一版的新口径：**拽不动的，就打不着**。
  const runner = game.enemies.spawn('skitter', 108, 0, 1, 0);
  runner.hp = 1e6;
  runner.maxHp = 1e6;
  const outside = statue(game, 300, 0);
  // 先让它真的被拽进去一段（这 10 帧里吸力在工作），再让它到点——
  // 不先跑这几帧的话"没被推开"就成了废话：它本来就一步没动。
  run(game, 10);
  const pulled = Math.hypot(inside.x, inside.y);
  assert.ok(pulled < 36, `先被拽进去了一截（40 → ${pulled.toFixed(1)}px）`);
  game.vortexes[0].life = 0.01;
  run(game, 2);
  assert.equal(game.vortexes.length, 0, '到点就收（漩涡从场上消失）');
  assert.ok(inside.hp < 1e6, `圈里的吃到那一下（hp=${inside.hp}）`);
  assert.equal(runner.hp, 1e6, '挣脱出去的那只没吃到（它一直朝外走，吸力拉不住）');
  assert.equal(outside.hp, 1e6, '远处那只更没吃到');
  // 没有击退：它被拽进来之后不该又被推出去（拢起来是为了让下一发打得疼）
  const after = Math.hypot(inside.x, inside.y);
  assert.ok(after <= pulled + 0.5, `收尾那一下没有把它推出去（${pulled.toFixed(1)} → ${after.toFixed(1)}px）`);
  assert.equal(game.vortexCount, 1, '结算里记着转过几盏');
  assert.ok(game.ui.statsBlock().includes('旋灯'), '结算面板里应写出转了几盏');
  assert.ok(game.ui.statsBlock().includes('一次拽住'), '结算面板里应写出最多一次拽住几只');
  assert.equal(game.vortexBest, 2, `这一下同时拽住 2 只（实际 ${game.vortexBest}）`);
  // 但真正吃到收尾的只有 1 只：数的是**收尾圈里**的，不是吸入圈里的——
  // 圈边上还在往外挣的那只不该算进"收网"的账里
  assert.equal(game.vortexCaught, 1, `真正被这一下打到的只有 1 只（实际 ${game.vortexCaught}）`);
  assert.equal(game.vortexPayoff, 40 + VORTEX.reward, `伤害 = 基础 + 打到的那几只（实际 ${game.vortexPayoff}）`);
  assert.ok(VORTEX.life > 0.5, '拽的时长该够把一圈人收拢，不该是一闪而过');
});

test('旋灯：收网——打到的每一只都让收尾更疼', async (t) => {
  const game = await open(t, 'payoff');
  const VORTEX = VORTEX_OF();
  assert.ok(VORTEX.reward > 0, '每多打到一只，收尾就该加一笔');
  game.placeVortex(0, 0, 40, 120, 0, 0);
  for (let i = 0; i < 5; i += 1) statue(game, 24 + i * 9, 0);
  run(game, 12); // 先让吸力把它们拽到中心——"拢"这一步是这一下伤害的来源
  game.vortexes[0].life = 0.01;
  run(game, 2);
  assert.equal(game.vortexCaught, 5, `这一下打到 5 只（实际 ${game.vortexCaught}）`);
  assert.equal(game.vortexPayoff, 40 + VORTEX.reward * 5, `伤害 = 基础 + 5 × 每只的奖励（实际 ${game.vortexPayoff}）`);
  assert.ok(game.ui.statsBlock().includes('最狠的一网'), '结算面板里要写出最狠的一网');

  // 一只都没拢到：只有基础伤害，而且够不到「收网」
  const lone = await open(t, 'payoff-none');
  lone.placeVortex(0, 0, 40, 120, 0, 0);
  lone.vortexes[0].life = 0.01;
  run(lone, 2);
  assert.equal(lone.vortexCaught, 0, '一个人都没拢到');
  assert.equal(lone.vortexPayoff, 40, `那就只有基础伤害（实际 ${lone.vortexPayoff}）`);
  assert.equal(lone.save.achievements.includes('vortex_payoff'), false, '一只都没拢到，当然够不到「收网」');
});

test('旋灯：一次收网打到 10 只解「收网」（数的是只数，不是伤害）', async (t) => {
  const game = await open(t, 'net');
  const VORTEX = VORTEX_OF();
  assert.equal(game.save.achievements.includes('vortex_payoff'), false, '开局不该有这个成就');
  // 门槛数的是"收尾圈里按住了几只"：伤害那条路走不通——它随等级（基础 24→68）和灯火
  // （0.65~1.35 倍）飘，同一个操作能差两倍；而且数伤害的话进化那把（基础 166）空放都能白送。
  assert.ok(Number.isInteger(VORTEX.haul), `门槛该是个整只数（实际 ${VORTEX.haul}）`);
  assert.ok(VORTEX.haul > VORTEX.crowd, `该比「一网打尽」那一档（${VORTEX.crowd} 只）更高：前者数吸力圈，后者数更小的收尾圈`);
  const seen = spy(game);
  // 十只摆在**收尾圈外、吸入圈里**——这一下要真收到它们，靠的就是吸力把它们拽进来
  const n = VORTEX.haul;
  const R = 150;
  game.placeVortex(0, 0, 68, R, 0, 0);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    statue(game, Math.cos(a) * 140, Math.sin(a) * 140);
  }
  run(game, 4);
  assert.equal(game.vortexCaught, 0, `刚扔下去的时候一只都不在收尾圈里（收尾圈 ${(R * VORTEX.burst).toFixed(0)}px、它们摆在 140px 上）`);
  run(game, 74); // 拽满这一盏的寿命
  assert.equal(game.vortexes.length, 0, '到点就收');
  assert.equal(game.vortexCaught, n, `吸力把它们全拽进来了（实际 ${game.vortexCaught} 只）`);
  assert.equal(game.vortexPayoff, 68 + VORTEX.reward * n, `收尾伤害 = 基础 + 每只的奖励（实际 ${game.vortexPayoff}）`);
  assert.ok(game.save.achievements.includes('vortex_payoff'), '这一网收到 10 只，该解锁「收网」');
  assert.equal(game.mineCount, 0, '这一段没碰过伏灯');
  // 收成那一下在画面上要看得出来：那一串字变金变大、地上多一圈金环
  const netLabel = seen.labels.find((l) => l.text.startsWith('收网 ') && l.text.includes('只'));
  assert.ok(netLabel, `头顶上飘出"按住了几只"（${seen.labels.map((l) => l.text).join(' / ')}）`);
  assert.equal(netLabel.color, '#ffe9a8', `收成的那一串字该是金色的（实际 ${netLabel.color}）`);
  assert.ok(netLabel.size > 17, `收成的那一串字该更大一号（实际 ${netLabel.size}）`);
  assert.ok(seen.rings.some((r) => r.color === '#ffd24e'), '收成那一下多一圈金环');

  // 差一只就不是收网：10 只的门槛，9 只不该解锁（也不能像数伤害那样白送）
  const shy = await open(t, 'net-shy');
  const shySeen = spy(shy);
  shy.placeVortex(0, 0, 68, R, 0, 0);
  for (let i = 0; i < n - 1; i += 1) {
    const a = (i / (n - 1)) * Math.PI * 2;
    statue(shy, Math.cos(a) * 140, Math.sin(a) * 140);
  }
  run(shy, 78);
  assert.equal(shy.vortexCaught, n - 1, `这一网只收到 ${shy.vortexCaught} 只`);
  assert.equal(shy.save.achievements.includes('vortex_payoff'), false, '差一只就不算收网');
  assert.ok(!shySeen.rings.some((r) => r.color === '#ffd24e'), '没到门槛就不该有金环');
  const shyLabel = shySeen.labels.find((l) => l.text.startsWith('收网 '));
  assert.ok(shyLabel && shyLabel.color === '#cfe8ff', `没到门槛的那一串还是原来那个颜色（实际 ${shyLabel?.color}）`);
  assert.ok(shyLabel.size === 17, `也没变大（实际 ${shyLabel.size}）`);
});

test('旋灯：进化那把连弹幕一起卷（卷到中心就吞掉）', async (t) => {
  const game = await open(t, 'swallow');
  // 寿命给足：默认 1.4s 会先自己到期，那测出来的就不是"被吞掉"而是"飞完了"。
  // 切向飞过（vy 而不是 vx）：切向的弹才会被旋臂拐着打转、一路卷进中心；
  // 径向飞出去的弹加一个反向量之后方向不变（归一化把长度抹掉了），那是"不会被卷"的那一类。
  const tang = (fromPlayer) =>
    game.projectiles.spawn({ x: 90, y: 0, vx: 0, vy: 120, damage: 12, fromPlayer, radius: 5, color: '#c9a3ff', maxLife: 20 });
  // 自己的子弹：正对着中心飞**穿**过去（一路都在吸入圈里），证明它一根汗毛都没掉
  const mine = game.projectiles.spawn({ x: 140, y: 0, vx: -120, vy: 0, damage: 12, fromPlayer: true, radius: 5, color: '#fff', maxLife: 20 });
  game.placeVortex(0, 0, 20, 200, 0, 1); // drag = 1：漩涡灯
  const bullet = tang(false);
  run(game, 60);
  assert.equal(bullet.active, false, '敌人的子弹被卷到中心就吞掉了');
  assert.equal(mine.active, true, '自己的子弹不受影响（它只吃对面的）');
  assert.ok(Math.hypot(mine.x, mine.y) < 140, `自己的子弹真的从漩涡中心穿过去了（现在在 ${Math.hypot(mine.x, mine.y).toFixed(0)}px 上）`);
  const gone = game.projectiles.all.filter((p) => p.active && !p.fromPlayer).length;
  assert.equal(gone, 0, '场上没有剩下的敌方弹幕');

  // 没进化的那一把不卷弹幕：同一颗切向弹直着飞出去，掉毛都不掉
  const plain = await open(t, 'no-drag');
  plain.placeVortex(0, 0, 20, 200, 0, 0);
  const b2 = plain.projectiles.spawn({ x: 90, y: 0, vx: 0, vy: 120, damage: 12, fromPlayer: false, radius: 5, color: '#c9a3ff', maxLife: 20 });
  run(plain, 60);
  assert.equal(b2.active, true, '1 级的旋灯不吞弹幕——那是进化才有的本事');
});

test('旋灯：一个漩涡里同时拽住 6 只解「一网打尽」', async (t) => {
  const game = await open(t, 'crowd');
  const VORTEX = VORTEX_OF();
  assert.equal(game.save.achievements.includes('vortex_crowd'), false, '开局不该有这个成就');
  assert.ok(VORTEX.crowd >= 4, '门槛不该是"拽住两三只"就够——它要的是"把一片拢到一点"');
  game.placeVortex(0, 0, 20, 120, 0, 0);
  for (let i = 0; i < 5; i += 1) statue(game, 20 + i * 10, 0);
  run(game, 2);
  assert.equal(game.vortexBest, 5, `记下 5 只（实际 ${game.vortexBest}）`);
  assert.equal(game.save.achievements.includes('vortex_crowd'), false, '五只还不够');
  statue(game, 0, 30);
  run(game, 2);
  assert.equal(game.vortexBest, 6, `一次 6 只（实际 ${game.vortexBest}）`);
  assert.ok(game.save.achievements.includes('vortex_crowd'), '同时拽住 6 只该解锁「一网打尽」');
  // 圈外的不算
  const outside = await open(t, 'crowd-far');
  outside.placeVortex(0, 0, 20, 120, 0, 0);
  for (let i = 0; i < 6; i += 1) statue(outside, 200 + i * 20, 0);
  run(outside, 2);
  assert.equal(outside.vortexBest, 0, '站在吸入半径外的不算被拽住');
});

test('旋灯：升级会真的改数（等级越高，转得越勤、范围越大）', async (t) => {
  const game = await open(t, 'level');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const v = weapons.find((w) => w.id === 'vortex');
  for (let i = 1; i < v.levels.length; i += 1) {
    assert.ok(v.levels[i].damage > v.levels[i - 1].damage, `第 ${i + 1} 级伤害该更高`);
    assert.ok(v.levels[i].radius > v.levels[i - 1].radius, `第 ${i + 1} 级吸得该更宽`);
    assert.ok(v.levels[i].cooldown < v.levels[i - 1].cooldown, `第 ${i + 1} 级该转得更勤`);
  }
  game.player.addWeapon('vortex');
  for (let i = 1; i < v.levels.length; i += 1) game.player.levelWeapon('vortex');
  assert.equal(game.player.weapons.get('vortex'), v.levels.length, '这一局真的把它升到了满级');
  game.player.recomputeStats();
  run(game, 2);
  assert.ok(game.vortexes.length > 0, '满级旋灯照样转得起来');
  assert.ok(game.vortexes[0].radius >= v.levels[v.levels.length - 1].radius, '半径用的是满级那一档');
});
