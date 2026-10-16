/**
 * 「余烬风」回归测试：一阵带火种的风从一侧吹过战场。
 *
 * 这个险境和别的不一样——它不动你的血，它动**油**。所以这个文件要盯住四件事：
 *   1. 起风：火种真的从**上风**方向一排排推过来（"风往哪边吹"得看得出来）；
 *   2. 方向是规矩：迎着风走会被糊满三层，顺着风走一层都沾不上，站着不动也会慢慢挨上；
 *   3. 沾上就是一笔账：层数越多，每秒烧的油越多（而且层数不会自己掉）；
 *   4. 解只有一个，而且是玩家早就会的那个：**冲刺**一下把身上抖干净。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/**
 * 开一局干净的：场地清空（怪 / 拾取 / 墙都拿掉，脚本才量得准"往哪跑"）、血量给到打不死。
 * 随机数钉死：同一颗种子、同一个方向，两次跑出来的必须是同一份数。
 */
async function open(t, tag, seed = 11) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=ember-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  let s = (seed * 2654435761) >>> 0;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.rng.reseed((seed * 40503 + 7) >>> 0);
  game.director.hazardTimer = 1e9;
  for (const sh of game.level.shrines) {
    sh.x = 9e5;
    sh.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.pickups.clear();
  game.level.walls.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

/** 起一阵风，并把方向钉死（不然每次跑的风向都是掷出来的）。 */
function gust(game, dirX, dirY) {
  game.handleHazard('emberwind');
  game.emberwindDirX = dirX;
  game.emberwindDirY = dirY;
  return game;
}

/** 按给定的方向跑 n 秒，返回这一阵里一共沾了几层、峰几层、终油。 */
function run(game, mx, my, seconds) {
  const dt = 1 / 60;
  let hits = 0;
  let peak = 0;
  let last = 0;
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i += 1) {
    game.setInput(mx, my, false, false);
    game.update(dt);
    if (game.emberStacks > last) hits += game.emberStacks - last;
    last = game.emberStacks;
    peak = Math.max(peak, game.emberStacks);
  }
  return { hits, peak, oil: game.player.oil };
}

test('余烬风：起风时火种从上风方向推过来，而且方向只有四个正交方向', async (t) => {
  const game = await open(t, 'gust');
  gust(game, 1, 0);
  assert.equal(game.emberwindTimer > 0, true, '起风后应当有一段持续时间');
  assert.equal(game.embers.length, 0, '刚起风时场上还没有火种');
  assert.ok(Math.abs(game.emberwindDirX) + Math.abs(game.emberwindDirY) === 1, '风向只取四个正交方向之一');

  async function dirOf(seed) {
    const g = await open(t, `dir${seed}`, seed);
    g.handleHazard('emberwind');
    return `${g.emberwindDirX},${g.emberwindDirY}`;
  }
  const dirs = new Set([await dirOf(1), await dirOf(2), await dirOf(3), await dirOf(4)]);
  assert.ok(dirs.size >= 2, `每阵风的方向应当是掷出来的（这几颗种子出现了 ${[...dirs].join(' / ')}）`);

  // 火种生成在**上风**侧：风往 +x 吹，那一排就该落在玩家西边（x < 玩家）
  game.update(1 / 60);
  const fresh = game.embers.filter((m) => m.x < game.player.x - 100);
  assert.ok(fresh.length > 0, '第一批火种应当落在玩家的上风方向');
  for (const m of game.embers) {
    assert.ok(Math.abs(m.y - game.player.y) <= 600, '一排火种的横向铺开不该超过一排的宽度太多');
  }
});

test('余烬风：迎着风走会被糊满，顺着风走一层都沾不上', async (t) => {
  const { data } = globalThis.window.__WICKLIGHT__;
  const max = data.emberwind.stackMax;
  const up = await open(t, 'upwind');
  gust(up, 1, 0);
  const into = run(up, -1, 0, 8); // 逆风跑一整阵风
  assert.equal(into.peak, max, `迎着风跑一整阵风应当顶满（实际 ${into.peak}/${max}）`);

  const down = await open(t, 'downwind');
  gust(down, 1, 0);
  const withWind = run(down, 1, 0, 8); // 顺风跑
  assert.equal(withWind.peak, 0, `顺着风跑一整阵风不该沾上（实际 ${withWind.peak} 层）`);
  assert.ok(withWind.oil > into.oil + 0.1, `顺风那一趟的油该明显更经用（${withWind.oil} vs ${into.oil}）`);

  const still = await open(t, 'still');
  gust(still, 1, 0);
  const standing = run(still, 0, 0, 8);
  assert.ok(standing.peak >= 2, `站着不动应当被火种糊上（实际 ${standing.peak}）`);
  assert.ok(standing.peak <= max, '层数不该超过上限');
});

test('余烬风：沾上以后每秒都在烧油，而且层数不会自己掉', async (t) => {
  const game = await open(t, 'burn');
  const { data } = globalThis.window.__WICKLIGHT__;
  const EW = data.emberwind;
  // 把风和火种都停掉，只留身上的层数——量"背着一笔账"本身
  game.emberwindTimer = 0;
  game.embers.length = 0;
  game.emberStacks = 3;
  const before = game.player.oil;
  run(game, 0, 0, 1);
  const burned = before - game.player.oil;
  const base = game.player.oilDecayPerSec * 1; // 每秒的基础衰减（1 秒）
  assert.ok(burned > base * 1.8, `三层的烧油速度该明显快过基础衰减（${burned.toFixed(3)} vs ${base.toFixed(3)}）`);
  assert.ok(Math.abs(burned - (base + EW.stackMax * EW.oilPerStack)) < 0.01,
    `每秒该烧掉 基础衰减 + 层数×${EW.oilPerStack}（实际 ${burned.toFixed(4)}）`);
  assert.equal(game.emberStacks, 3, '层数不该自己往下掉——不然"沾上就等着"会变成第三条路');
});

test('余烬风：冲刺一下把身上的火星抖干净', async (t) => {
  const game = await open(t, 'dash');
  game.emberwindTimer = 0;
  game.embers.length = 0;
  game.emberStacks = 3;
  game.player.dashCd = 0;
  game.setInput(0, 0, true, false);
  game.update(1 / 60);
  assert.ok(game.player.dashCount > 0, '这一帧应当真的冲出去了');
  assert.equal(game.emberStacks, 0, '冲刺应当在同一帧把层数清零（灭火不该慢半拍）');

  // 而"没冲刺"的那几帧里层数也不该自己走掉
  game.emberStacks = 2;
  run(game, 0, 0, 0.5);
  assert.equal(game.emberStacks, 2, '不冲刺就不该掉层');
});

test('余烬风：换关 / 重开把这一阵收干净', async (t) => {
  const game = await open(t, 'clear');
  gust(game, 1, 0);
  run(game, -1, 0, 3);
  assert.ok(game.embers.length > 0 && game.emberStacks > 0, '先制造出一阵正在吹的火 + 身上的层数');
  const { catalog } = globalThis.window.__WICKLIGHT__;
  game.loadStage(catalog.stages[1], 1, false);
  assert.equal(game.embers.length, 0, '换关不该带着上一阵的火种过去');
  assert.equal(game.emberStacks, 0, '换关应当把身上的层数也清掉');
  assert.equal(game.emberwindTimer, 0, '换关后不该还在吹风');
});

test('余烬风：风停了，已经推出去的火种还得自己飘完、自己烧尽', async (t) => {
  const game = await open(t, 'tail');
  gust(game, 1, 0);
  run(game, 0, 0, 1.2); // 先让头几排火种推出来
  assert.ok(game.embers.length > 0, '先得有一批正在飘的火种');

  // 风到此为止：但场上那一批不该跟着"冻住"——它们还要顺风飘、还要烧尽。
  // （早先写成"timer 归零就 return"，火种会冻在画面上不动也不灭。）
  game.emberwindTimer = 0;
  const seen = game.embers.map((m) => ({ m, x: m.x }));
  game.setInput(0, 0, false, false);
  game.update(1 / 60);
  let moved = 0;
  for (const { m, x } of seen) {
    if (game.embers.includes(m) && m.x > x + 0.5) moved += 1;
  }
  assert.ok(moved > 0, `风停之后火种仍要往前飘（实际动了 ${moved} 颗）`);

  run(game, 0, 0, 7); // 飘出场地、或者自己烧尽
  assert.equal(game.embers.length, 0, '风停之后场上的火种该自己散干净，不该永远留在画面上');
  assert.equal(game.emberwindTimer, 0, '风停了就不该再起风');
});

/**
 * 「灯台」那条解：站在**亮着的**灯台旁边，火种扑到身上会灭，身上的层数一分一分往回掉。
 *
 * 这一条是给"解只有一条（冲刺）"那笔代价补的第二条路：不是按一下，是**跑向一盏亮着的灯**。
 * 要钉住三件事：速率（每秒一层）、站在光里不再往上叠（不然清一层来一层，这条跑不通）、
 * 以及"熄了的灯台不算数"（它自己都保不住了）。
 */
/** 摆一座自己的灯台（不依赖关卡生成），亮着、火焰满格。 */
function pyreAt(game, x, y, lit = true) {
  game.level.pyres.length = 0;
  game.level.pyres.push({ x, y, lit, progress: lit ? 1 : 0, flame: lit ? 1 : 0 });
  return game.level.pyres[0];
}

test('余烬风：站在亮着的灯台旁边，层数每秒往下掉一层', async (t) => {
  const game = await open(t, 'pyre');
  const EW = globalThis.window.__WICKLIGHT__.data.emberwind;
  game.emberwindTimer = 0;
  game.embers.length = 0;
  pyreAt(game, EW.pyreRadius - 60, 0);
  game.player.x = 0;
  game.player.y = 0;
  game.emberStacks = EW.stackMax;

  const step = (sec) => run(game, 0, 0, sec).peak;
  run(game, 0, 0, 1.2);
  assert.equal(game.emberStacks, EW.stackMax - 1, `一秒该抖掉一层（3 → ${game.emberStacks}）`);
  run(game, 0, 0, 1.0);
  assert.equal(game.emberStacks, EW.stackMax - 2, '再一秒，再掉一层');
  run(game, 0, 0, 1.2);
  assert.equal(game.emberStacks, 0, '三层该在三四秒里抖干净');
  void step;
});

test('余烬风：在灯台的光里不再往上叠——不然"跑向灯"在算术上根本不通', async (t) => {
  const game = await open(t, 'pyre-safe');
  const EW = globalThis.window.__WICKLIGHT__.data.emberwind;
  pyreAt(game, 120, 0);
  game.player.x = 0;
  game.player.y = 0;
  gust(game, 1, 0); // 风往东吹，火种正面糊上来
  const into = run(game, 0, 0, 6); // 站着不动挨一整段风
  assert.equal(game.emberStacks, 0, `站在灯台的光里不该被叠层（实际 ${game.emberStacks} 层）`);
  assert.equal(into.peak, 0, '整段风里都不该沾上');
});

test('余烬风：熄了的灯台不扑火，站远了也不扑', async (t) => {
  const EW = globalThis.window.__WICKLIGHT__.data.emberwind;
  // ① 灯台是熄的
  const dark = await open(t, 'pyre-dark');
  dark.emberwindTimer = 0;
  dark.embers.length = 0;
  pyreAt(dark, 120, 0, false);
  dark.player.x = 0;
  dark.player.y = 0;
  dark.emberStacks = EW.stackMax;
  run(dark, 0, 0, 3);
  assert.equal(dark.emberStacks, EW.stackMax, '没点亮的灯台一点都不该帮上忙');
  // ② 灯台是亮的，但站得比 pyreRadius 远——那是"离火远"，不是"火在帮你"
  const far = await open(t, 'pyre-far');
  far.emberwindTimer = 0;
  far.embers.length = 0;
  pyreAt(far, EW.pyreRadius + 120, 0);
  far.player.x = 0;
  far.player.y = 0;
  far.emberStacks = EW.stackMax;
  run(far, 0, 0, 3);
  assert.equal(far.emberStacks, EW.stackMax, `站在 ${EW.pyreRadius}px 之外不该扑火`);
});
