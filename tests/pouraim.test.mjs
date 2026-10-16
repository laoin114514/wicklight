/**
 * 「倾灯」的手动瞄准（v63）：触屏上没有鼠标，原来这一瓢的落点只有自动瞄准锁着的那只怪。
 *
 * 手指按住屏幕右侧拖动之后，**方向和距离**都归玩家，而这三件事得钉住：
 *
 *   1. 指哪儿倒哪儿——手指按住的时候这一瓢不听自动瞄准的（哪怕怪就站在另一边）；
 *   2. 推得越远落得越远——近端落在脚前（那一瓢是用来补在自己刚倒的那片火上的），
 *      远端和原来的射程对齐（手指推到底 = 这一版之前的那一瓢）；
 *   3. 松手就还给自动瞄准——不按的时候这一件一点没变。
 *
 * 另外钉住两件"没有它这套就没法用"的事：
 *   · `Player.pourAim`（落点标记的唯一输入）只在"手指在瞄 + 手里有倾灯"时才有值，
 *     而且它给的 `away / pool` 必须和真落下来的那片火**对得上**——
 *     标记画得和真实落点不一样，这个标记就是在骗人；
 *   · 飞完射程还没碰到东西的那一瓢**必须落地**（`ProjectileSystem.onExpire`）：
 *     手动瞄准之后落点不再保证站着怪，不收尾的话玩家花了 0.15 桶油，地上什么都没有。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 pour.test.mjs 一样：开一局干净的，人挪到 700px 外，场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pouraim-${tag}-${Date.now()}-${Math.random()}`);
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

const POUR_OF = () => globalThis.window.__WICKLIGHT__.data.pour;

/** 站着不动的一只怪：测的是这一瓢往哪儿飞，不该让它自己走过来。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

/** 跑几帧，全程带着同一个手动瞄准输入（不传就是"没在瞄"）。 */
const run = (game, frames, aim = null, dt = 1 / 60) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, false, false, aim);
    game.update(dt);
  }
};

/** 场上自己烧的那几片火（倾灯落下的那些）。 */
const ownFires = (game) => game.grounds.filter((g) => g.ignites && g.kind === 'fire');

/** 刚飞出去的那一瓢（倾灯是唯一会带 poolRadius 的子弹）。 */
const shots = (game) => game.projectiles.all.filter((p) => p.active && p.poolRadius > 0);

test('倾灯：手指按住右侧拖动，这一瓢就往你指的方向倒（不听自动瞄准）', async (t) => {
  const game = await open(t, 'dir');
  const st0 = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour').levels[0];
  // 怪站在**右边**：自动瞄准会锁它，所以"往左倒"只可能来自手指
  statue(game, 780, 700);
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  run(game, 1);
  assert.equal(game.pourCount, 1, '第一帧就倒了（自动瞄准那条路本来就是通的）');

  // 下一条冷却要 2.5 秒，先把油和冷却都摆好，再用手指指一个相反的方向
  game.projectiles.clear();
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', 0);
  const before = game.pourCount;
  run(game, 1, { x: -1, y: 0 });
  assert.equal(game.pourCount, before + 1, '手指按住时这一瓢照样自己开火（它是自动开火的武器）');
  const [shot] = shots(game);
  assert.ok(shot, '飞出去了一瓢');
  assert.ok(shot.vx < -1, `这一瓢该往左飞（实际 vx=${shot.vx.toFixed(1)}）——怪在右边，自动瞄准会让它往右`);
  // 单瓢本来就有 ±0.07 弧度的抖动（"一瓢是准的"指的是它瞄着目标，不是数学上笔直）
  assert.ok(Math.abs(shot.vy) < st0.speed * 0.1, '方向就是手指那一条（只剩那点原来的抖动）');
  // 人也要转过去：这一下是"把灯偏向一边"，朝向不跟着动就看不出来
  assert.ok(Math.abs(game.player.angle - Math.PI) < 1e-6, '人跟着转过去（朝左）');

  // 松手：还给自动瞄准（怪在右边 → 往右飞）
  game.projectiles.clear();
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', 0);
  run(game, 1);
  const [back] = shots(game);
  assert.ok(back && back.vx > 1, '松手之后又回到"打向最近那只怪"');
});

test('倾灯：推得越远落得越远（近端落在脚前，远端和原来的射程对齐）', async (t) => {
  const game = await open(t, 'len');
  const POUR = POUR_OF();
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const st = weapons.find((w) => w.id === 'pour').levels[0];
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  // 场上**一只怪都没有**：这样瓢会一直飞到射程尽头，落点就是"推了多远"的直接读数
  const before = game.player.x;

  // 推到底：maxLife 就是原来那个射程
  game.player.cooldowns.set('pour', 0);
  run(game, 1, { x: 1, y: 0 });
  const [far] = shots(game);
  assert.ok(far, '推到底也倒得出去');
  assert.ok(Math.abs(far.maxLife - st.range / st.speed) < 1e-6, '推到底 = 原来的射程（这一版之前的那一瓢）');

  // 刚过死区：落在脚前那一档
  game.projectiles.clear();
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', 0);
  run(game, 1, { x: 0.04, y: 0 });
  const [near] = shots(game);
  assert.ok(near, '刚过死区也算在瞄（手指确实推出去了）');
  // 0.04 是 TouchControls 那根手指在死区外能给出的最小力度（AIM_DEAD 一过就到这个值）
  const pull = 0.04;
  const wantNear = (st.range * (POUR.aimNear + (1 - POUR.aimNear) * pull)) / st.speed;
  assert.ok(
    Math.abs(near.maxLife - wantNear) < 1e-6,
    `近端该落在射程的 ${(POUR.aimNear * 100).toFixed(0)}% 上下（实际 maxLife=${near.maxLife.toFixed(3)} / 期望 ${wantNear.toFixed(3)}）`,
  );
  assert.ok(near.maxLife < far.maxLife * 0.45, '近端确实比推到底近得多（这一个自由度不是摆设）');

  // 一路飞完：这一瓢**必须**落地（不然手指一指空处，0.15 桶油就没了）
  run(game, 120, { x: 0.04, y: 0 });
  const fires = ownFires(game);
  assert.equal(fires.length, 1, `地上该留下一片火（实际 ${fires.length}）`);
  const away = Math.hypot(fires[0].x - before, fires[0].y - 700);
  assert.ok(
    away > st.range * POUR.aimNear - 40 && away < st.range * POUR.aimNear + 40,
    `落点该在脚前 ${(st.range * POUR.aimNear).toFixed(0)}px 上下（实际 ${away.toFixed(0)}px）`,
  );
});

test('倾灯：落点标记只在"手指在瞄 + 手里有倾灯"时才有，而且和真落点对得上', async (t) => {
  const game = await open(t, 'mark');
  const POUR = POUR_OF();
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const st = weapons.find((w) => w.id === 'pour').levels[0];

  // 手里没有倾灯：手指按下去也不该有标记（这一件之外，屏幕右侧那下拖动什么都不做）
  run(game, 1, { x: 1, y: 0 });
  assert.equal(game.player.pourAim, null, '没有倾灯时不该有落点标记');

  game.player.addWeapon('pour');
  game.player.recomputeStats();
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', 5);
  run(game, 1);
  assert.equal(game.player.pourAim, null, '没在瞄的时候也没有标记（自动瞄准不需要这个圈）');

  // 冷却还剩一半：圆环填到一半——这是"离倒出去还有多远"的读数
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', st.cooldown * 0.5);
  run(game, 1, { x: 1, y: 0 });
  const mark = game.player.pourAim;
  assert.ok(mark, '手指按着、手里有倾灯：该画标记了');
  assert.ok(Math.abs(mark.charge - 0.5) < 0.05, `冷却剩一半时圆环该填一半（实际 ${mark.charge.toFixed(2)}）`);
  const spread = 1 + (game.player.stats.areaMult - 1) * 0.5;
  assert.ok(
    Math.abs(mark.pool - st.radius * POUR.fireSpread * spread) < 1e-6,
    '标记上那个圈必须和真落下来的那片火一样大（同一串乘法）',
  );
  assert.ok(Math.abs(mark.away - st.range) < 1e-6, '手指推到底：标记说的是武器自己那个射程');

  // 这一瓢真落地的时候，落点与标记说的那个地方对得上（推到底 = 射程尽头）
  // 冷却留 1 秒：这一瓢飞完射程要 1.5 秒，所以这 200 帧里只有这一瓢（第二瓢排在它之后）
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', 1);
  run(game, 200, { x: 1, y: 0 });
  const fire = ownFires(game).pop();
  assert.ok(fire, '这一瓢落地了');
  const away = Math.hypot(fire.x - (game.player.x - 0), fire.y - game.player.y);
  void away;
  assert.ok(Math.abs(fire.r - mark.pool) < 1e-6, '地上那片火的大小就是标记上那个圈');
  assert.ok(
    Math.hypot(fire.x - (700 + st.range), fire.y - 700) < 60,
    '落点落在推到底该在的那一带（射程尽头 ± 一帧的位移）',
  );

  // 半桶油：标记还在（看得见"往哪儿倒"），但圆环被油那一头卡住——倾灯真正的开关是油
  game.player.oil = 0.36 * game.player.oilMax;
  game.player.cooldowns.set('pour', 0);
  run(game, 1, { x: 1, y: 0 });
  const low = game.player.pourAim;
  assert.ok(low, '油不够的时候标记照样在——玩家要看得出这一瓢会落在哪儿');
  assert.ok(
    Math.abs(low.charge - 0.5) < 0.03,
    `半桶油（0.36 / 门槛 0.72）时圆环该只填一半（实际 ${low.charge.toFixed(2)}）`,
  );
});
