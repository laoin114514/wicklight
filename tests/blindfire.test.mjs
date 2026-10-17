/**
 * 「看不见你就不吊着了」（v90）回归测试。
 *
 * 喷糜者（`behavior: 'ranged'`）的性格写在 `data/enemies.ts` 里："保持距离吐射糜液，**逼你离开掩体**"。
 * 可到 v89 为止它只认**距离**：你躲到墙后面、它恰好落在"保持距离"那一档里（180~260px），
 * 它就站在那儿把一梭子一梭子全打在墙面上（子弹进墙就死，`resolveProjectiles`）——
 * 20 秒 9 枪、0 命中、一步没挪。墙从 v84 起就是实心的，于是这句"逼你离开掩体"在墙多的地方
 * 等于没写：掩体后面站着一个永远不会打中你的靶子。
 *
 * 这一版给它加上"看不看得见"这一条：**看不见你的时候不保持距离、也不开枪**——
 * 它得先压过来（路上靠 v84 那套沿墙滑绕过去），绕到看得见你，再开始吐。
 *
 * 怎么量"它有没有在打墙"：`scene` 里给每一发敌人子弹问一句**游戏自己那份**墙判据
 * （`playerCtx().sight(子弹起点 → 你)`）——沿被挡住的直线打出去的那一发，一定会死在墙面上。
 * 这一个数（`blindShots`）才是判据；"开了几枪 / 命中几次"是读数，别拿它们相减当结论
 * （最后一发可能还在飞，而且场上还有别的伤害源）。
 *
 * 量出来的三格（同一份探针、同一颗种子，20 秒游戏时间，玩家钉在原点打不死）：
 *   喷糜者 @250px · 无墙    ：改前 9 枪 / 命中 9 次 / 站定 250px —— 改后**逐位相同**（这一条不该碰看得见的场合）；
 *   喷糜者 @250px · 墙在旁边：同上（逐位相同：这一刀只该管那条被挡住的直线）；
 *   喷糜者 @250px · 隔着墙  ：改前 9 枪 / **0 命中** / 原地不动 —— 改后 **4 枪 / 4 命中** / 绕到 (-62.7,-252.3)。
 * 也就是说：它不是"变少打了"，是**把打在墙上的那几发换成了真的打在你身上**。
 *
 * 两条边界写死在用例里：
 *   1. **只动 `ranged` 那一支**：首领（焚天，也是 `ranged`）的**环形弹幕**照旧不看这一条——
 *      那是"炸出去的一下"（v88 就把它和旋灯 / 燃爆 / 雷弧摆在一起），隔着墙照旧 32 发 / 5 秒；
 *   2. **看得见的时候一个字节都不变**：站定距离、开火节奏、"墙在旁边"那一格全部逐位相同。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 一堵竖墙：x 落在 -110 ~ -90，y 铺得很长（挡得住 -x 那半边的所有目标）。 */
const WALL = { x: -110, y: -300, w: 20, h: 600 };
/** 对照组：同一堵墙，摆到 +x 那一头（那条瞄准线与它不相交）。 */
const BESIDE = { x: 300, y: -300, w: 20, h: 600 };

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=blind-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
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
  return { game, p };
}

/**
 * 摆好场地：一只怪、一堵（或没有）墙，玩家钉在原点、血与油每帧补满。
 * 数的是**它开了几枪**（敌人弹体的生成次数）与**命中你几次**（`damagePlayer` 被叫到的次数）——
 * 这个场上只有它会伤害玩家，所以这两个数就是"打在墙上"与"打在你身上"的直读。
 */
function scene(game, p, { id = 'spitter', x = -250, walls = [], seconds = 5 } = {}) {
  game.level.walls.length = 0;
  for (const w of walls) game.level.walls.push(w);
  game.enemies.clear();
  game.projectiles.clear();
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.oil = p.oilMax;
  const e = game.enemies.spawn(id, x, 0, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  let shots = 0;
  let blindShots = 0;
  let hits = 0;
  const realSpawn = game.projectiles.spawn.bind(game.projectiles);
  const realDamage = game.damagePlayer.bind(game);
  game.projectiles.spawn = (q) => {
    if (!q.fromPlayer) {
      shots += 1;
      if (!game.playerCtx().sight(q.x, q.y, p.x, p.y)) blindShots += 1;
    }
    return realSpawn(q);
  };
  game.damagePlayer = (amount, hx, hy, drain, source) => {
    if (source === id) hits += 1;
    return realDamage(amount, hx, hy, drain, source);
  };
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) {
    p.hp = 1e6;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  game.projectiles.spawn = realSpawn;
  game.damagePlayer = realDamage;
  return { shots, blindShots, hits, endX: e.x, endY: e.y, alive: e.active };
}

test('隔墙且正好落在"保持距离"那一档：它不再对着墙打，而是压上来', async (t) => {
  const { game, p } = await open(t, 'camp');
  // (1) 看不见：5 秒里**一枪都不开**（改前是 2 枪，全打在墙上），而且它挪窝了
  const blind = scene(game, p, { walls: [WALL], seconds: 5 });
  assert.equal(blind.shots, 0, `看不见你就别开枪（那几发只会在墙上开花）：${blind.shots}`);
  assert.ok(blind.endX > -250 + 20, `它得朝你压过来，不是站在原地：x ${blind.endX.toFixed(1)}`);
  // (2) 20 秒里它绕过来了：一发都没打在墙上，而且真的打到了你（改前是 9 发里 9 发打在墙上）
  const around = scene(game, p, { walls: [WALL], seconds: 20 });
  assert.ok(around.shots > 0, `绕到看得见之后照旧要吐你：它开了 ${around.shots} 枪`);
  assert.equal(around.blindShots, 0, `一发都不许打在墙上（沿被挡住的直线打出去的有 ${around.blindShots} 发）`);
  assert.ok(around.hits > 0, `而且真的打到了你：命中 ${around.hits}`);
  assert.ok(around.endX > -250 + 100, `它是真的绕过来了（x ${around.endX.toFixed(1)}）`);
  assert.ok(Math.abs(around.endY) > 200, `绕墙走的那一段会离开原来那条直线（y ${around.endY.toFixed(1)}）`);
});

test('看得见的场合一个字节都不变：站定在保持距离那一档、照常开火', async (t) => {
  const { game, p } = await open(t, 'seen');
  const open_ = scene(game, p, { walls: [], seconds: 20 });
  assert.equal(open_.shots, 9, `没有墙时照旧 20 秒 9 枪：${open_.shots}`);
  assert.equal(open_.hits, 9, `而且照旧枪枪命中：${open_.hits}`);
  assert.equal(open_.blindShots, 0, `没有墙就谈不上"打在墙上"：${open_.blindShots}`);
  assert.ok(Math.abs(open_.endX + 250) < 1, `250px 落在"保持距离"档里，它站定不动：${open_.endX.toFixed(1)}`);
  // 墙在旁边（不在那条线上）：读数与"没有墙"逐位相同——这一刀只该管那条被挡住的直线
  const beside = scene(game, p, { walls: [BESIDE], seconds: 20 });
  assert.deepEqual(
    { shots: beside.shots, blindShots: beside.blindShots, hits: beside.hits, x: +beside.endX.toFixed(6), y: +beside.endY.toFixed(6) },
    { shots: open_.shots, blindShots: open_.blindShots, hits: open_.hits, x: +open_.endX.toFixed(6), y: +open_.endY.toFixed(6) },
    '墙在旁边时读数该逐位相同',
  );
});

test('远一点（400px）也照旧：隔着墙它会绕过来，而路上不白打', async (t) => {
  const { game, p } = await open(t, 'far');
  const around = scene(game, p, { x: -400, walls: [WALL], seconds: 20 });
  assert.ok(around.shots > 0, `20 秒够它绕过那堵墙（它开了 ${around.shots} 枪）`);
  assert.equal(around.blindShots, 0, `路上那些"隔着墙打出去的"一发都不许有：${around.blindShots}`);
  assert.ok(around.hits > 0, `而且真的打到了你：命中 ${around.hits}`);
  assert.ok(Math.abs(around.endY) > 150, `它走的是绕墙那条路（y ${around.endY.toFixed(1)}）`);
  // 对照：没有墙时它在 260px 处站定、9 枪 9 中（这一格与改前逐位相同）
  const open_ = scene(game, p, { x: -400, walls: [], seconds: 20 });
  assert.equal(open_.shots, 9, `没有墙时照旧 9 枪：${open_.shots}`);
  assert.equal(open_.hits, 9, `没有墙时照旧 9 中：${open_.hits}`);
  assert.equal(open_.blindShots, 0, `没有墙时也谈不上"打在墙上"：${open_.blindShots}`);
});

test('钉子：刺脊照旧会一头撞在墙上——"骗它撞墙"那条战术不能因为这一版没了', async (t) => {
  const { game, p } = await open(t, 'lancer');
  // v84 那份用例的同一套装法：一堵 400 宽的墙横在两人中间。蓄力冲锋**故意不看墙**，
  // 所以它一定会撞上去、发呆一段（`wallStun`）——那一段就是"墙当掩体"的全部。
  // 这一版只该管"瞄着你吐的那一口"，不该顺手把刺脊的冲锋也变成"看不见就不冲"。
  game.level.walls.push({ x: -200, y: -100, w: 400, h: 80 });
  p.x = 0;
  p.y = -300;
  const lancer = game.enemies.spawn('lancer', 0, 300, 1, 1);
  lancer.hp = 1e9;
  lancer.maxHp = 1e9;
  lancer.damage = 0;
  let bashed = -1;
  for (let i = 0; i < 600 && bashed < 0; i += 1) {
    p.hp = 1e6;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = -300;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
    if (lancer.wallStun > 0) bashed = i;
  }
  // 它得先走到 340px 那条线上才谈得上蓄力（600 → 340 是 7 秒出头），第 463 帧撞上；
  // 接上"看不看得见"那一档之后它永远等不到蓄力的机会（10 秒里一次都没撞）——上界卡在 9 秒。
  assert.ok(bashed >= 0 && bashed < 540, `它该在 9 秒内一头撞在那面墙上（第 ${bashed} 帧）`);
});

test('钉子：首领的环形弹幕照旧不看这一条（它炸的是"一圈"，不是"瞄着你"）', async (t) => {
  const { game, p } = await open(t, 'boss');
  // 焚天（`emberwake`）是唯一一个 `behavior: 'ranged'` 的首领：它的齐射来自 `bossAura`，
  // 和"瞄着你吐的那一口"不是同一条路——这一版只该掐掉后者。
  const blind = scene(game, p, { id: 'emberwake', walls: [WALL], seconds: 5 });
  assert.equal(blind.shots, 32, `隔着墙照旧两轮环形齐射（每轮 16 发）：${blind.shots}`);
  const seen = scene(game, p, { id: 'emberwake', walls: [], seconds: 5 });
  assert.equal(seen.shots, 34, `看得见时多出来的正是那两发"瞄着你打的"：${seen.shots}`);
});
