/**
 * 「索敌不从墙里挑目标」（v89）回归测试。
 *
 * 索敌（`Game.nearestEnemy`）到 v88 为止只有一条判据：**最近的**（外加"灯外的不算"与"无光者只在灯里"）。
 * 可墙从 v84 起就是实心的——挑中一只**隔着墙**的怪，打出去的那一发（子弹 / 光矛 / 鞭）
 * 会停在墙面上，冷却白转。这一版之前它不是偶发：台架上 **10%** 的索敌挑中的是墙后面那只
 * （钉死火力那套 59833 次里 5948 次），而其中**"明明还有看得见的"占 195.0 次/局（holder）**——
 * 也就是说手上有能打的东西，却在往墙上打。
 *
 * 这一版给索敌加一档：**看得见的排前面**（`preferVisible`，只走 `findTarget` 这条路——
 * 瞄准与「旋灯」落点；雷弧的跳跃照旧不看墙，它走的是另一个调用点）。
 * 三条边界写死在这儿：
 *   1. **全都看不见时照旧返回最近的那一只**——v85 那句"要不要打、往哪儿站仍是你的事"留着，
 *      改的是"挑哪一只"，不是"打不打"（不然武器会哑火，那是另一件事）；
 *   2. **墙不扩大射程**：候选先过射程与灯火那两关，看得见只是排在前面的理由；
 *   3. **没有墙时一个字节都不变**（没有墙就没有"看得见看不见"这回事，那一档根本不进）。
 *
 * 用例之外还量了一条**看得见的账**：那 195.0 次/局（holder）/ 61.2 次/局（chaser）的白打，
 * 改后是 **0.0 / 0.0**——只要射程里有看得见的，挑中的就不会是墙后面那只。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 一堵竖墙：x 落在 -60 ~ -40，y 铺得很长（挡得住 -x 那半边的所有目标）。 */
const WALL = { x: -60, y: -300, w: 20, h: 600 };
/** 对照组：同一堵墙，摆到 +x 那一头（两条瞄准线都不经过它）。 */
const BESIDE = { x: 300, y: -300, w: 20, h: 600 };
const deg = (rad) => ((rad * 180) / Math.PI + 360) % 360;

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=aimwall-${tag}-${Date.now()}-${Math.random()}`);
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
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return { game, p };
}

/** 摆好场地与怪，站桩跑几帧；返回逐只挨了多少 + 这一帧的瞄准角（度）。 */
function scene(game, p, spots, walls, {
  weapon = 'shard', frames = 90, foe = 'bulwark', relic = null,
} = {}) {
  game.level.walls.length = 0;
  for (const w of walls) game.level.walls.push(w);
  game.enemies.clear();
  const foes = spots.map(([x, y]) => {
    const e = game.enemies.spawn(foe, x, y, 1, 1);
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
    e.spawnTimer = 0;
    e.speed = 0;
    return e;
  });
  p.weapons.clear();
  p.relics.clear();
  if (weapon) p.weapons.set(weapon, 1);
  if (relic) p.relics.add(relic);
  p.recomputeStats();
  p.stats.critChance = 0; // 暴击是掷骰子的；这一份量的是"朝谁打"
  p.stats.critMult = 1;
  p.cooldowns.clear();
  p.aimManual = null;
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.angle = 0;
  const lost = foes.map(() => 0);
  for (let i = 0; i < frames; i += 1) {
    foes.forEach((e, k) => {
      e.hp = 1e9;
      e.x = spots[k][0];
      e.y = spots[k][1];
      e.speed = 0;
      e.vx = 0;
      e.vy = 0;
    });
    p.hp = 1e6;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
    foes.forEach((e, k) => {
      lost[k] += 1e9 - e.hp;
    });
  }
  return { lost, angle: deg(p.angle) };
}

test('墙后那只更近也不挑它：瞄看得见的那只', async (t) => {
  const { game, p } = await open(t, 'near');
  // 墙后 (-150,0) 是最近的一只（180°），(0,150) 看得见（90°）
  const walled = scene(game, p, [[-150, 0], [0, 150]], [WALL]);
  assert.equal(walled.angle, 90, `该瞄看得见的那只（90°），而不是墙后面那只（180°）：${walled.angle}`);
  assert.ok(walled.lost[1] > 0, `看得见的那只该真的挨打：${walled.lost[1]}`);
  assert.equal(walled.lost[0], 0, `墙后面那只一下都不该挨（子弹死在墙里）：${walled.lost[0]}`);
  // 对照：撤掉墙 → 照旧挑最近的那只（这一档不该改没有墙的战场）
  const openGround = scene(game, p, [[-150, 0], [0, 150]], []);
  assert.equal(openGround.angle, 180, `没有墙时照旧挑最近的那只：${openGround.angle}`);
  // 对照：墙在场上、但不在任何一条瞄准线上 → 与无墙逐位相同
  const beside = scene(game, p, [[-150, 0], [0, 150]], [BESIDE]);
  assert.equal(beside.angle, 180, `墙不在那条线上时照旧挑最近的：${beside.angle}`);
  assert.deepEqual(beside.lost, openGround.lost, '墙上场但不挡路时读数逐位相同');
});

test('全都看不见时照旧锁最近的那只（兜底没变）', async (t) => {
  const { game, p } = await open(t, 'alone');
  const only = scene(game, p, [[-150, 0]], [WALL]);
  assert.equal(only.angle, 180, `只有墙后面那一只时照旧瞄它（v85 那条留着）：${only.angle}`);
  // 两只都在墙后面：挑**最近**的那只（180° 与 135°，后者更远）
  const two = scene(game, p, [[-150, 0], [-200, 200]], [WALL]);
  assert.equal(two.angle, 180, `都看不见时挑最近的那只，不是"最后一只"：${two.angle}`);
});

test('看得见但够不着不算数：这一档不扩大射程', async (t) => {
  const { game, p } = await open(t, 'range');
  // 索敌上限是 `min(520, 灯 + 40)`，而**灯在满油时是 96 + 224 = 320**（不是构造时那个 300），
  // 所以这条线是 360。先把这条线量出来：单独放一只看得见的 —— 330 挑得到、420 挑不到。
  const inReach = scene(game, p, [[0, 330]], []);
  assert.equal(inReach.angle, 90, `330 在 360 以内，该挑得到：${inReach.angle}`);
  const beyond = scene(game, p, [[0, 420]], []);
  assert.equal(beyond.angle, 0, `420 在 360 以外，一只都挑不到（角度留在初值）：${beyond.angle}`);
  // 这一档只许"在够得到的范围里换目标"，不许把射线接到够不到的地方去：
  // 墙后 (-100,0) 够得到但看不见；(0,420) 看得见但够不到。
  const gated = scene(game, p, [[-100, 0], [0, 420]], [WALL]);
  assert.equal(gated.angle, 180, `够不到的那只不该因为这个新档被够到：${gated.angle}`);
  assert.equal(gated.lost[1], 0, `射程外那只一下都不该挨：${gated.lost[1]}`);
  assert.equal(gated.lost[0], 0, `这一枪照样停在墙上（v84 那条没变）：${gated.lost[0]}`);
  // 对照：把看得见的那只挪进 360（330）——读数立刻翻过去，说明卡住的就是**距离**，不是别的
  const inside = scene(game, p, [[-100, 0], [0, 330]], [WALL]);
  assert.equal(inside.angle, 90, `挪进射程就该挑它：${inside.angle}`);
  assert.ok(inside.lost[1] > 0, `挪进射程的那只真的挨打：${inside.lost[1]}`);
});

test('两只都看得见 → 挑更近的那只（跟它坐在池子里的顺序无关）', async (t) => {
  const { game, p } = await open(t, 'order');
  // 先摆近的（90°）、再摆远的（180°）：只挑"最后一只看得见的"那种写法会挑错
  const both = scene(game, p, [[0, 150], [-250, 0]], [BESIDE]);
  assert.equal(both.angle, 90, `两只都看得见时挑更近的那只：${both.angle}`);
  // 再反过来摆一遍（远的先摆）：读数该一样
  const reversed = scene(game, p, [[-250, 0], [0, 150]], [BESIDE]);
  assert.equal(reversed.angle, 90, `调换池子里的顺序，读数不变：${reversed.angle}`);
});

test('距离完全相同时，这一档不另立规矩：跟"没有墙"挑的是同一只', async (t) => {
  const { game, p } = await open(t, 'tie');
  // (150,0) 与 (0,150) 到站位的距离**一模一样**（22500），两只都看得见。
  // 两条路都写成 `d <`，所以都该挑"池子里先摆的那只"——这一档不许悄悄换成"后摆的那只"。
  const openGround = scene(game, p, [[150, 0], [0, 150]], []);
  assert.equal(openGround.angle, 0, `距离相同时挑先摆的那只（0°）：${openGround.angle}`);
  const beside = scene(game, p, [[150, 0], [0, 150]], [BESIDE]);
  assert.equal(beside.angle, 0, `墙在旁边时也是同一只：${beside.angle}`);
  assert.deepEqual(beside.lost, openGround.lost, '没有一只被挡着时读数逐位相同');
  // 再把先摆的那只挪到墙后面（距离仍然相等）：这一档必须翻到看得见的那只去
  const gated = scene(game, p, [[-150, 0], [0, 150]], [WALL]);
  assert.equal(gated.angle, 90, `先摆的那只被挡着时，挑另一只（90°）：${gated.angle}`);
});

test('钉子：雷弧（`chainZap`）照旧不看墙——它跳的是"怪与怪物之间的空气"', async (t) => {
  const { game, p } = await open(t, 'arc');
  game.level.walls.length = 0;
  game.level.walls.push(WALL);
  game.enemies.clear();
  const walled = game.enemies.spawn('bulwark', -150, 0, 1, 1);
  const seen = game.enemies.spawn('bulwark', 0, 150, 1, 1);
  for (const e of [walled, seen]) {
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
    e.spawnTimer = 0;
    e.speed = 0;
  }
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.x = 0;
  p.y = 0;
  game.chainZap(0, 0, 20, 1, 520, '#8ff0ff', {});
  assert.ok(walled.hp < 1e9, `雷弧照旧跳墙后面那只（它是"身体到身体"，不走直线）：${1e9 - walled.hp}`);
  assert.equal(seen.hp, 1e9, `看得见的那只没被串到，说明这一跳没被 v89 那一档接管：${1e9 - seen.hp}`);
});

test('这档管到"打出去的东西"：光矛与旋灯落点都跟着它走', async (t) => {
  const { game, p } = await open(t, 'weapon');
  const beam = scene(game, p, [[-150, 0], [0, 150]], [WALL], { weapon: 'beam', frames: 120 });
  assert.ok(beam.lost[1] > 0, `光矛该串到看得见的那只身上：${beam.lost[1]}`);
  assert.equal(beam.lost[0], 0, `光矛停在那面墙上，墙后那只一点都吃不到：${beam.lost[0]}`);
  // 旋灯：落点也问的是这一句（`findTarget` 的第二个调用点），
  // 所以它该落在看得见的那只身上，而不是墙后面
  const vortex = scene(game, p, [[-150, 0], [0, 150]], [WALL], { weapon: 'vortex', frames: 3 });
  assert.equal(game.vortexes.length, 1, `旋灯该落下一盏：${game.vortexes.length}`);
  const v = game.vortexes[0];
  assert.ok(Math.abs(v.x) < 1 && v.y > 100, `旋灯该落在看得见的那只（+y 方向），而不是墙后：${v.x.toFixed(1)},${v.y.toFixed(1)}`);
  assert.ok(vortex.lost[0] === 0, '旋灯压墙后那只身上等于白扔');
});
