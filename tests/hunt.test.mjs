/**
 * 「循灯」回归测试：一波刷完、场上只剩最后几只的时候，还没到场的那几只直奔玩家。
 *
 * 这条规则的来历是台架读数（见 `src/data/hunt.ts` 的表）：一波 26 秒里有 20.7 秒在清场，
 * 而尾巴（≤2 只）平均 8.3 秒、最长 62 秒——玩家把身边清完了，然后站着等一个还在半路的东西。
 * 所以要钉住的是四件事：
 *   1. **窗口只有那一个**：一波还在打（场上剩得还多）时，谁都不许提前加速；
 *   2. **看得见的那几只一点没变**：`near` 以内的速度与行为都不动（不许变成"隐身加速"）；
 *   3. **追不上走路的你**：绝对速度有上限，且上限低于玩家基础步速——这是"不用回头去捡"，
 *      不是"跑不掉"；
 *   4. **性格只在收尾时作废**：保持距离的（喷糜者）、扑灯台的（吹灯客）在窗口里都改奔玩家，
 *      窗口外一律照旧。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：不刷怪、不打、场地清空，场面完全由测试自己摆。 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=hunt-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.rng.reseed(97);
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  game.level.pyres.length = 0;
  game.enemies.clear();
  game.projectiles.clear();
  game.pickups.clear();
  game.level.walls.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

/** 摆一只"站着让你量"的怪：不追人、不还手，速度就是我们想知道的那个数。 */
function statue(game, id, x, y) {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  return e;
}

/**
 * 把导演摆成想要的状态，并把玩家挪回原点。
 * 注意它**不动场上的怪**：调用方摆完怪再调（早先的写法把"摆怪"和"清怪"混在一个辅助函数里，
 * 连着调两次就会把上一次摆的那几只 clear 掉——量出来的 `hunt` 自然是 false）。
 */
function phase(game, ph) {
  // 先让导演按真实规则开一波（这一波的预算 / 上限就都摆正了），再把它按到想要的阶段。
  // 不这么做的话 `waveBudget` 还是 0，`spawned >= 0` 立刻为真，下一个 tick 就自己跳到清场阶段了。
  const ctx = game.directorCtx(game.director.stageDef);
  game.director.beginWave(ctx);
  game.director.phase = ph;
  game.director.spawned = ph === 'spawning' ? 0 : 99;
  game.enemies.clear();
  game.player.x = 0;
  game.player.y = 0;
  return game;
}

/** 场上一只怪都不留（摆新的之前先叫它）。 */
function empty(game) {
  game.enemies.clear();
  return game;
}

/** 一帧（不推方向，只让世界走一格）。 */
function tick(game) {
  game.setInput(0, 0, false, false);
  game.update(1 / 60);
  return game;
}

/** 走 n 帧，返回每一帧里那只怪"脚力的实际倍率"（位移 / 它自己的速度 / 时间）。 */
function speeds(game, e, frames) {
  const out = [];
  for (let i = 0; i < frames; i += 1) {
    const x0 = e.x;
    const y0 = e.y;
    game.setInput(0, 0, false, false);
    game.update(1 / 60);
    out.push(Math.hypot(e.x - x0, e.y - y0) / e.speed * 60);
  }
  return out;
}

const HUNT_OF = () => globalThis.window.__WICKLIGHT__.data.hunt;

test('循灯：一波还在打的时候，谁都不许提前加速', async (t) => {
  const game = await open(t, 'off');
  const HUNT = HUNT_OF();
  // 只剩 aliveAt 只 → 窗口开
  phase(game, 'clearing');
  empty(game);
  const few = [statue(game, 'crawler', 1400, 0), statue(game, 'crawler', 1400, 120),
    statue(game, 'crawler', 1400, -120), statue(game, 'crawler', 1400, 240)];
  tick(game);
  assert.equal(few[0].hunt, true, `只剩 ${HUNT.aliveAt} 只时窗口该打开`);
  assert.ok(few[0].huntSpeed > 1.5, `远处的余党应当加速（实际 ${few[0].huntSpeed.toFixed(2)}）`);

  // 再多一只 → 那还是"正在打的一波"，谁都不许加速
  empty(game);
  const five = [];
  for (let i = 0; i < HUNT.aliveAt + 1; i += 1) five.push(statue(game, 'crawler', 1400, i * 120 - 240));
  tick(game);
  assert.equal(five[0].hunt, false, `还剩 ${HUNT.aliveAt + 1} 只时窗口不该打开（那还是"正在打的一波"）`);
  assert.equal(five[0].huntSpeed, 1, '窗口没开时倍率必须是 1');

  // 窗口关掉之后倍率要自己回到 1：不能留一个"这只怪从此很快"的后遗症
  empty(game);
  phase(game, 'spawning');
  // 刷怪还没刷完（spawned 不到预算），而且这一帧不刷新的：这是一个"正在进行的一波"
  game.director.spawned = 0;
  game.director.spawnTimer = 1e9;
  const e = statue(game, 'crawler', 1400, 0);
  tick(game);
  assert.equal(e.hunt, false, '刷怪阶段没有循灯');
  assert.equal(e.huntSpeed, 1, '刷怪阶段的倍率是 1');
});

test('循灯：看得见的那几只一点没变，只有还在路上的才加速', async (t) => {
  const game = await open(t, 'near');
  const HUNT = HUNT_OF();
  phase(game, 'clearing');
  empty(game);
  const near = statue(game, 'crawler', HUNT.near - 40, 0);
  const far = statue(game, 'crawler', 900, 0);
  tick(game);
  assert.equal(near.huntSpeed, 1, `\`near\`(${HUNT.near}px) 以内的怪速度必须一点不变`);
  assert.equal(near.hunt, true, '窗口是开了的（行为上仍然直奔玩家）');
  assert.ok(far.huntSpeed > 1, `900px 外的那只该加速（实际 ${far.huntSpeed.toFixed(2)}）`);

  // 越远越快，直到 `mult` 封顶
  const probe = (d) => {
    far.x = d;
    tick(game);
    return far.huntSpeed;
  };
  assert.ok(probe(600) > probe(350), '越远给得越多');
  assert.ok(Math.abs(probe(3000) - HUNT.mult) < 1e-6, '远到没边也只是 mult 倍');
});

test('循灯：追不上走路的你（绝对速度有上限，而且低于玩家基础步速）', async (t) => {
  const game = await open(t, 'cap');
  const HUNT = HUNT_OF();
  phase(game, 'clearing');
  empty(game);
  // 最快的那种（疾影 132）也不能例外：乘完倍数还得被 ceiling 按住
  const fast = statue(game, 'skitter', 2000, 0);
  tick(game);
  assert.ok(fast.speed * fast.huntSpeed <= HUNT.ceiling + 1e-6,
    `实际速度不许超过 ceiling（${(fast.speed * fast.huntSpeed).toFixed(1)} vs ${HUNT.ceiling}）`);
  assert.ok(HUNT.ceiling < game.player.stats.moveSpeed,
    `ceiling(${HUNT.ceiling}) 必须低于玩家基础步速(${game.player.stats.moveSpeed})——不然就成了"跑不掉"`);
  // 位移也不能超过"走路追不上"那条线（拿真实的一秒钟量，不只看那个乘法）
  const frames = speeds(game, fast, 60);
  const maxStep = Math.max(...frames);
  assert.ok(maxStep * fast.speed <= HUNT.ceiling + 1, `真实位移也要被摁住（实测 ${(maxStep * fast.speed).toFixed(0)}px/s）`);
});

test('循灯：保持距离的（喷糜者）在窗口里改奔玩家，窗口外照旧吊着', async (t) => {
  // 先看窗口**关着**的时候：喷糜者吊在 220px 的射程上，不该靠过来。
  // 拿 `boss` 阶段当对照组：那个阶段不在收尾窗口里（首领不吃这条规则）。
  const game = await open(t, 'spitter');
  phase(game, 'boss');
  empty(game);
  const hover = statue(game, 'spitter', 260, 0);
  assert.equal(hover.def.behavior, 'ranged', '这一条讲的必须是"保持距离"的那一类');
  for (let i = 0; i < 90; i += 1) tick(game);
  const hovered = Math.hypot(hover.x, hover.y);
  assert.equal(hover.hunt, false, '窗口关着时不循灯');
  // 它的射程带是 220±40：不但不许贴上来，也不该退到射程之外（那两种都是"行为被改了"）
  assert.ok(hovered > 170 && hovered < 300,
    `窗口关着时它应当吊在自己的射程带里（260px → ${hovered.toFixed(0)}px）`);

  // 再看窗口**开着**的时候：同一只、同一个位置，应当直接压上来
  const game2 = await open(t, 'spitter2');
  phase(game2, 'clearing');
  empty(game2);
  const push = statue(game2, 'spitter', 600, 0);
  // 20 秒：它自己那点脚力（40px/s）走完最后那 300px 也要七八秒，
  // 但"循灯"只负责把它从远处拽回来（600→300 是有加成的），到了你跟前就交给它自己走。
  for (let i = 0; i < 1200; i += 1) tick(game2);
  const closed = Math.hypot(push.x, push.y);
  assert.equal(push.hunt, true, '收尾窗口里它是"循灯"的');
  // 门槛要比"射程带的下沿"更狠：光靠 >400 是量不出区别的——它自己走过来也才到 260px 左右，
  // 那正好还在窗口关着时的吊着位置附近。循灯的样子是**一直走到贴脸**。
  assert.ok(closed < 120,
    `收尾时它必须一路走到贴上来（600px → ${closed.toFixed(0)}px）`);
});

test('循灯：窗口只报一次，而且余党照样得清掉（不许跳过这一波）', async (t) => {
  const game = await open(t, 'announce');
  let calls = 0;
  const ctx = game.directorCtx(game.director.stageDef);
  ctx.onHunt = () => { calls += 1; };
  game.director.setStage(game.director.stageDef, 0);
  game.director.beginWave(ctx);
  // 直接把它推成"刷完了、只剩一只"
  game.director.phase = 'clearing';
  game.enemies.clear();
  statue(game, 'crawler', 900, 0);
  for (let i = 0; i < 60; i += 1) game.director.update(1 / 60, ctx);
  assert.equal(calls, 1, `"余党循灯而来"只该报一次（实际 ${calls} 次）`);
  assert.equal(game.director.hunting, true, '窗口应当开着');
  assert.equal(game.director.phase, 'clearing', '余党还在场上，这一波就不算结束——规则只让它们自己走过来，不替玩家跳过');

  // 把它清掉，这一波才该往下走
  game.enemies.clear();
  game.director.update(1 / 60, ctx);
  assert.notEqual(game.director.phase, 'clearing', '清掉之后这一波该结束');
  assert.equal(game.director.hunting, false, '窗口该关上');
});
