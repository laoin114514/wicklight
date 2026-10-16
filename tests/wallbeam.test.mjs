/**
 * 「光也会被墙挡住」（v85）回归测试。
 *
 * 到 v84 为止，墙对怪已经是实心的了（`Enemy.moveWithWalls`），子弹也一路在墙里判死
 *（`resolveProjectiles`）——**只有光矛那一条射线**是例外：`fireBeam` 把整条线算完，
 * 谁在线上就串谁，从头到尾没问过墙。于是同一个战场上有两套相反的规矩：
 * 火环打不到墙后面的怪，光矛能。
 *
 * 这一版把那一刀补上，而且伤害与画线必须是**同一刀**：光只算到墙面，
 * 画出来的那条线也停在墙面上——不然"墙后面那只为什么挨打"在画面上看不出来。
 *
 * 三条要证明的规矩：
 *   1. 墙后面那只挨不到，墙前面那只照旧吃满（对照组：撤掉墙，后面那只就挨得到了）；
 *   2. 那条线停**墙面上**（正对着是近面，斜着也是——斜着也停，说明走的是线段与矩形的交点，
 *      不是"把整条线画短一点"）；
 *   3. 墙不在这一发的路上时，读数**逐位不变**（这一刀不该动任何没撞墙的东西）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;

/** 开一局干净的：没有神龛 / 灯台 / 墙 / 怪，玩家站在原地不还手（场面全由用例自己摆）。 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=wallbeam-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
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
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  // 暴击是 `Math.random() < critChance`：这一份量的是"打得到 / 打不到"，
  // 让每一发都一样重，对照那两个数才比得干净。
  p.stats.critChance = 0;
  return game;
}

/** 一只钉在地上的靶：不走、不咬人、打不死（量的是"够不够得着"）。 */
function target(game, x, y) {
  const e = game.enemies.spawn('shade', x, y, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 跑 n 帧（玩家不动、不还手；受击停顿每帧清掉，免得它把世界停住）。 */
function run(game, n) {
  for (let i = 0; i < n; i += 1) {
    game.player.hp = 1e6;
    game.player.oil = game.player.oilMax;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
}

/** 一堵 400×40 的墙横在 (0,-120)：近面 y=-140、远面 y=-100。 */
const BARRIER = () => ({ x: -200, y: -140, w: 400, h: 40 });

test('光矛被墙截断：墙后面那只挨不到，墙前面那只照旧吃满', async (t) => {
  const game = await open(t, 'behind');
  game.level.walls.push(BARRIER());
  game.player.x = 0;
  game.player.y = -260;
  game.player.weapons.set('beam', 1);
  const front = target(game, 0, -200); // 玩家与墙之间（60px）
  const back = target(game, 0, -40); // 墙后面（220px）

  run(game, 60 * 4); // 4 秒：按 1.6 秒的冷却至少打出两发

  assert.ok(front.hp < front.maxHp, '墙**前面**那只照旧要挨打（这一刀不该顺手把前面也挡了）');
  assert.equal(back.hp, back.maxHp, '墙**后面**那只一点都挨不到（改前它跟前面那只一样吃满）');

  // 对照组：同样的摆法、撤掉墙，后面那只就挨得到了——不然上一条证明的只是"它站得太远"
  const open2 = await open(t, 'behind-open');
  open2.player.x = 0;
  open2.player.y = -260;
  open2.player.weapons.set('beam', 1);
  const front2 = target(open2, 0, -200);
  const back2 = target(open2, 0, -40);
  run(open2, 60 * 4);
  assert.ok(front2.hp < front2.maxHp, '对照组的近靶照旧挨打');
  assert.ok(back2.hp < back2.maxHp, '没有墙的时候，同样距离的那只挨得到（所以上面那一条挡住的确实是墙）');
});

test('那条线停在墙面上：正对着停在近面，斜着停在同一个面上（走的真是交点）', async (t) => {
  const game = await open(t, 'face');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -260;
  const dmg = () => 24;
  const lastBeam = () => game.beams[game.beams.length - 1];

  // ① 正对着撞：从 (0,-260) 打 +y，墙面 y=-140 → 这一发该走 120px
  game.fireBeam(0, -260, Math.PI / 2, 430, 13, dmg(), '#fff3c4');
  const straight = lastBeam();
  assert.ok(Math.abs(straight.ey - -140) < 1e-6, `线该停在墙面 y=-140 上（实测 ${straight.ey.toFixed(3)}）`);
  assert.ok(Math.abs(straight.ex - 0) < 1e-6, `正对着打，落点 x 还是 0（实测 ${straight.ex.toFixed(3)}）`);

  // ② 斜着撞（40°）：墙面还是 y=-140，交点在 x = 120/tan40° = 143.0
  game.beams.length = 0;
  game.fireBeam(0, -260, (40 * Math.PI) / 180, 430, 13, dmg(), '#fff3c4');
  const slant = lastBeam();
  const want = 120 / Math.tan((40 * Math.PI) / 180);
  assert.ok(Math.abs(slant.ey - -140) < 1e-6, `斜着打也该停在同一个面上（实测 y=${slant.ey.toFixed(3)}）`);
  assert.ok(Math.abs(slant.ex - want) < 0.05, `交点该在 x=${want.toFixed(1)}（实测 ${slant.ex.toFixed(1)}）`);

  // ③ 够不到墙的一发：射程 100 < 120，线该走满自己的长度（这一条是"没撞墙就别动它"的对照）
  game.beams.length = 0;
  game.fireBeam(0, -260, Math.PI / 2, 100, 13, dmg(), '#fff3c4');
  const short = lastBeam();
  assert.ok(Math.abs(short.ey - -160) < 1e-6, `够不到墙就该走满 100px（实测 y=${short.ey.toFixed(3)}）`);

  // ⑤ 路上有两堵墙：停在**近**的那一堵（"取最近的那个交点"，不是"最后一堵算到的墙"）
  game.beams.length = 0;
  game.level.walls.push({ x: -200, y: -40, w: 400, h: 40 }); // 第二堵：近面 y=-40
  game.fireBeam(0, -260, Math.PI / 2, 430, 13, dmg(), '#fff3c4');
  const two = lastBeam();
  assert.ok(
    Math.abs(two.ey - -140) < 1e-6,
    `路上有两堵墙时要停在先撞到的那一堵（近墙 y=-140；实测 ${two.ey.toFixed(3)}）`,
  );
  // ④ 斜着那一发：路上的靶挨打、墙后面那一只挨不到（两只靶都**摆在这条斜线上**，
  //    只差墙这一层——不摆在线上的话，"没挨打"只是因为站偏了，证明不了任何事）
  game.level.walls.length = 0;
  game.level.walls.push(wall); // ④ 要把那一堵放回去
  const ang = (40 * Math.PI) / 180;
  const onRay = (t) => ({ x: Math.cos(ang) * t, y: -260 + Math.sin(ang) * t });
  const nearPt = onRay(90); // 玩家与墙之间
  const farPt = onRay(260); // 墙后面（这一发到不了那儿）
  const onLine = target(game, nearPt.x, nearPt.y);
  const behind = target(game, farPt.x, farPt.y);
  game.beams.length = 0;
  game.fireBeam(0, -260, ang, 430, 13, dmg(), '#fff3c4');
  assert.ok(onLine.hp < onLine.maxHp, '斜着打，路上那只照样挨打');
  assert.equal(behind.hp, behind.maxHp, '斜着打，墙后面那只同样挨不到');

  // 对照组：撤掉墙，同一发、同一个角度，墙后面那一只就挨得到了（否则上一条只是"它站偏了"）
  game.level.walls.length = 0;
  game.fireBeam(0, -260, ang, 430, 13, dmg(), '#fff3c4');
  assert.ok(behind.hp < behind.maxHp, '撤掉墙，同一只就在线上了——所以上一条挡住的确实是墙');

  // ⑥ 起点本来就在墙里面（这一堵是这一帧才落到身上的那种时刻）：这一发长度是 0。
  //    光是在墙面上断的，它不该从墙里冒出来、更不该穿出去——所以"起点在墙里"这一头也得是 0，
  //    不是"从墙心的那一点往外算"。这一条也是那个 `t0 = 0` 的边界（不然长度会变成负数）。
  game.level.walls.length = 0;
  game.level.walls.push(wall);
  const outside = target(game, 0, -60); // 墙外面（离墙心 60px）
  game.beams.length = 0;
  game.fireBeam(0, -120, Math.PI / 2, 430, 13, dmg(), '#fff3c4'); // 起点是墙心
  const fromInside = lastBeam();
  assert.ok(
    fromInside.ex === 0 && fromInside.ey === -120,
    `从墙里开的一发该是 0 长（实测 ${fromInside.ex.toFixed(3)}, ${fromInside.ey.toFixed(3)}）`,
  );
  assert.equal(outside.hp, outside.maxHp, '也不该从墙里冒出去打到外面那只');

  // ⑦ 擦着墙角过去的那一发不短：墙只在**真的挡住**的时候才算挡。
  //    下面这堵挂在路上方的墙，射线在 x / y 两个轴上的区间根本不重叠（从它底下擦过去的）——
  //    这种"擦过去"既不该截断线、也不该少打一只靶。
  game.level.walls.length = 0;
  game.level.walls.push({ x: 100, y: -300, w: 40, h: 80 }); // 挂在上方，射线从它下面过
  const pastPt = onRay(260);
  const past = target(game, pastPt.x, pastPt.y);
  game.beams.length = 0;
  game.fireBeam(0, -260, ang, 430, 13, dmg(), '#fff3c4');
  const grazing = lastBeam();
  const wantEy = -260 + Math.sin(ang) * 430;
  assert.ok(
    Math.abs(grazing.ey - wantEy) < 1e-9,
    `擦过去的一发该走满射程（终点 y 该是 ${wantEy.toFixed(3)}，实测 ${grazing.ey.toFixed(3)}）`,
  );
  assert.ok(past.hp < past.maxHp, '擦着墙角过去的那一发照样打得到线上那只靶');
});

test('雷弧不看墙：这一件是**刻意**留的例外（闪电跳的是怪与怪之间的空气）', async (t) => {
  // 墙在这一版里管住了所有"走直线"的东西：子弹（撞墙判死）、怪（位移）、光矛（截断）。
  // 唯一留下的是雷弧——它本来就不走直线，跳的是"从一具身体到下一具身体"，
  // 这也是它区别于光矛的那一点性格（一个要一条线摆直，一个只要你站得够近）。
  // 这条用例是**钉子**不是凭据：哪一天要把它也接进墙的规矩里，先改这一条。
  const game = await open(t, 'arc');
  game.level.walls.push(BARRIER());
  game.player.x = 0;
  game.player.y = -260;
  game.player.weapons.set('arc', 1);
  const behind = target(game, 0, -40); // 隔着墙的那一只

  run(game, 60 * 4);
  assert.ok(behind.hp < behind.maxHp, '雷弧照旧从墙后面把它串出来（实测改前改后一致）');
});

test('墙不在这一发的路上时，读数逐位不变', async (t) => {
  const clean = await open(t, 'clear');
  clean.player.x = 0;
  clean.player.y = -260;
  clean.player.weapons.set('beam', 1);
  const onlyA = target(clean, 0, -200);
  run(clean, 60 * 4);

  const aside = await open(t, 'aside');
  aside.level.walls.push({ x: 400, y: -300, w: 80, h: 600 }); // 摆在侧面：这一发根本碰不到
  aside.player.x = 0;
  aside.player.y = -260;
  aside.player.weapons.set('beam', 1);
  const onlyB = target(aside, 0, -200);
  run(aside, 60 * 4);

  const lost = (e) => e.maxHp - e.hp;
  assert.ok(lost(onlyA) > 0, '没墙时这一发要真的打中（不然下面那条相等是"两个零相等"）');
  assert.equal(lost(onlyB), lost(onlyA), `侧面那堵墙不许改动这一发（${lost(onlyA)} → ${lost(onlyB)}）`);
});
