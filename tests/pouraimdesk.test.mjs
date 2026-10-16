/**
 * 「倾灯」的手动瞄准（桌面）：按住**鼠标右键**，指针指哪儿这一瓢就倒哪儿。
 *
 * 触屏那条路（手指按住屏幕右侧拖）见 pouraim.test.mjs；这里管的是桌面：两条路的编码是同一种
 * （方向 + 0~1 的力度，见 `InputState` 上那一段），只是"推了多远"由不同的尺子量
 * （手指有自己的起点，鼠标没有起点，只能拿屏幕当行程）。要钉住的三件事和触屏一模一样：
 *
 *   1. 指哪儿倒哪儿——右键按住的时候这一瓢不听自动瞄准的（哪怕怪就站在另一边）；
 *   2. 越远落得越远——指针贴在脚前 = 射程最近那一档，推到"小半个屏高" = 原来那个射程，
 *      再远也不再涨（钳位，不是线性外推）；
 *   3. 松手就还给自动瞄准——不按的时候这一件一点没变。
 *
 * 另外两件"没有它这套就没法用"的事：
 *   · 指针压在人物身上那几像素不算在瞄（点一下、手抖都不该让这一瓢拐向随便一个方向），
 *     而"不算在瞄"必须表现为**没有落点标记 + 还给自动瞄准**，不能是"瞄向一个乱七八糟的方向"；
 *   · 手里没有倾灯时，右键在屏幕上什么都不做——这是这一件专属的动作，别的武器照旧自动瞄准。
 *
 * ⚠ 这个文件**全程走主循环**（`env.frame()`），不像 pouraim.test.mjs 那样直接调 `game.update`：
 * "鼠标右键 → 方向 + 力度"是挂在主循环里的（见 `Input.aimVector` 与 main.ts 里那一段），
 * 绕开主循环就等于绕开了要测的那一段。所以它也是唯一一个真的往画布 / 窗口派鼠标事件的测试
 * ——桩件里元素的 `addEventListener` 因此真的记监听、`dispatchEvent` 也真的派发（tests/dom-stubs.mjs）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：人挪到 700px 外，场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pouraimdesk-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, input, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  // 点火进度条那个定时器：桩件的 clearInterval 是空实现，跑满 100% 之后它每帧还会再叫一次
  // bootDone()，把状态推回 menu。这里摘掉它，之后每一帧才是纯游戏帧。
  env.intervals.length = 0;
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
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
  return { game, input, env };
}

/** 跑 n 帧（整帧走主循环：输入快照、setInput、update、render 一样不少）。 */
const frames = (env, n) => {
  for (let i = 0; i < n; i += 1) env.frame();
};

/**
 * 鼠标：挪到某点 / 按住右键 / 松开右键。
 * 事件都按真浏览器那样带着坐标发（`mousemove` 挂在 window 上、`mousedown` 挂在画布上、
 * `mouseup` 挂在 window 上——和 Input.bind 一致）；不带坐标的话指针会变成 NaN，
 * 于是"按了右键却没在瞄"，测出来的会是假绿。
 */
const mouse = (env) => ({
  move(x, y) {
    env.dispatch('mousemove', { clientX: x, clientY: y });
  },
  down(x, y) {
    env.getElement('game').dispatchEvent({ type: 'mousedown', button: 2, clientX: x, clientY: y, preventDefault() {} });
  },
  up() {
    env.dispatch('mouseup', { button: 2 });
  },
});

/** 站着不动的一只怪：测的是这一瓢往哪儿飞，不该让它自己走过来。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

/** 刚飞出去的那一瓢（倾灯是唯一会带 poolRadius 的子弹）。 */
const shots = (game) => game.projectiles.all.filter((p) => p.active && p.poolRadius > 0);

const POUR_OF = () => globalThis.window.__WICKLIGHT__.data.pour;

/** 摆好"下一瓢马上就能倒"的状态（自动瞄准那条路本来就通）。 */
function reload(game) {
  game.projectiles.clear();
  game.player.oil = game.player.oilMax;
  game.player.cooldowns.set('pour', 0);
}

test('倾灯（桌面）：按住鼠标右键，这一瓢就往指针指的方向倒（不听自动瞄准）', async (t) => {
  const { game, env } = await open(t, 'dir');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const st0 = weapons.find((w) => w.id === 'pour').levels[0];
  // 怪站在**右边**：自动瞄准会锁它，所以"往左倒"只可能来自鼠标
  statue(game, 780, 700);
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  frames(env, 1);
  assert.equal(game.pourCount, 1, '第一帧就倒了（自动瞄准那条路本来就是通的）');

  // 指针停在人的**左边**、按住右键：下一条冷却要 2.5 秒，这里先把它和油都摆好
  const cursor = mouse(env);
  const aimX = game.renderer.width / 2 - 300;
  const aimY = game.renderer.height / 2;
  reload(game);
  cursor.move(aimX, aimY);
  cursor.down(aimX, aimY);
  const before = game.pourCount;
  frames(env, 1);
  assert.equal(game.pourCount, before + 1, '按住右键时这一瓢照样自己开火（它是自动开火的武器）');
  const [shot] = shots(game);
  assert.ok(shot, '飞出去了一瓢');
  assert.ok(shot.vx < -1, `这一瓢该往左飞（实际 vx=${shot.vx.toFixed(1)}）——怪在右边，自动瞄准会让它往右`);
  assert.ok(Math.abs(shot.vy) < st0.speed * 0.1, '方向就是指针那一条（只剩单瓢本来那点抖动）');
  assert.ok(Math.abs(game.player.angle - Math.PI) < 1e-6, '人跟着转过去（朝左：这一下是"把灯偏向一边"）');

  // 松开右键：还给自动瞄准（怪在右边 → 往右飞）
  reload(game);
  cursor.up();
  frames(env, 1);
  const [back] = shots(game);
  assert.ok(back && back.vx > 1, '松手之后又回到"打向最近那只怪"');
  assert.ok(Math.abs(game.player.angle) < 1e-6, '朝向也跟着还回去了（人的朝向不该停在刚才指的方向上）');
});

test('倾灯（桌面）：指针离人越远落得越远（脚前一档 → 小半个屏高 = 射程，再远不再涨）', async (t) => {
  const { game, input, env } = await open(t, 'len');
  const POUR = POUR_OF();
  const st = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour').levels[0];
  const W = game.renderer.width;
  const H = game.renderer.height;
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  // 场上**一只怪都没有**：瓢会一直飞到射程尽头，`maxLife` 就是"推了多远"的直接读数
  const wantedLife = (pull) => (st.range * (POUR.aimNear + (1 - POUR.aimNear) * pull)) / st.speed;

  // ① 刚过死区（离人 7px）：最小力度那一档——落在脚前，正好够补在自己刚倒的那片火上
  const cursor = mouse(env);
  cursor.move(W / 2 + 7, H / 2);
  cursor.down(W / 2 + 7, H / 2);
  // 0.04 这个下限**两条路共用**（AIM_MIN_PULL）：手指过了死区、鼠标刚离开人物，都给这一档
  assert.ok(Math.abs(Math.hypot(...Object.values(input.aimVector(W, H))) - 0.04) < 1e-6, '刚过死区就是力度下限');
  reload(game);
  frames(env, 1);
  const [near] = shots(game);
  assert.ok(near, '刚过死区也算在瞄（指针确实指着一个方向）');
  assert.ok(
    Math.abs(near.maxLife - wantedLife(0.04)) < 1e-6,
    `近端该落在射程的 ${(POUR.aimNear * 100).toFixed(0)}% 上下（实际 maxLife=${near.maxLife.toFixed(3)}）`,
  );

  // ② 推到"小半个屏高"：就是原来那个射程（这一版之前的那一瓢）
  reload(game);
  cursor.move(W / 2 + H * 0.45, H / 2);
  frames(env, 1);
  const [full] = shots(game);
  assert.ok(full, '推到底也倒得出去');
  assert.ok(Math.abs(full.maxLife - wantedLife(1)) < 1e-6, '推到底 = 原来的射程');
  assert.ok(near.maxLife < full.maxLife * 0.5, '脚前那一档确实比推到底近得多（这一个自由度不是摆设）');

  // ③ 再远也不再涨：推到屏幕角落（离人 700px 开外）还是同一个射程，不是线性外推
  reload(game);
  cursor.move(W, H);
  frames(env, 1);
  const [clamped] = shots(game);
  assert.ok(clamped, '推到屏幕角落照样倒得出去');
  assert.ok(Math.abs(clamped.maxLife - full.maxLife) < 1e-6, '再远也是同一个射程（力度钳在 1）');

  // ④ 一路飞完：这一瓢**必须**落地（不然指着一片空地，0.15 桶油就没了）
  // 射程 300px / 速度 320 ≈ 0.94 秒，留两秒把它飞完
  frames(env, 120);
  assert.ok(
    game.grounds.some((g) => g.ignites && g.kind === 'fire'),
    '飞完射程还没碰到东西的那一瓢也得在地上留下一片火',
  );
});

test('倾灯（桌面）：指针压在人物身上不算在瞄（不画落点标记，也不替玩家转向）', async (t) => {
  const { game, input, env } = await open(t, 'dead');
  const st = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour').levels[0];
  const W = game.renderer.width;
  const H = game.renderer.height;
  statue(game, 780, 700);
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  // 冷却留一半：这一瓢不会立刻出去，方便看"标记有没有"
  game.player.cooldowns.set('pour', st.cooldown * 0.5);
  frames(env, 1);
  assert.equal(game.player.pourAim, null, '没按右键就不该有落点标记（这一件之外，右键本来什么都不做）');

  const cursor = mouse(env);
  cursor.move(W / 2, H / 2);
  cursor.down(W / 2, H / 2);
  assert.equal(input.aimVector(W, H), null, '指针就在人身上：那几像素是手抖，不算在瞄');
  game.player.cooldowns.set('pour', st.cooldown * 0.5);
  frames(env, 1);
  assert.equal(game.player.pourAim, null, '不算在瞄就没有落点标记（不能瞄着一个乱七八糟的方向）');
  assert.ok(Math.abs(game.player.angle) < 1e-6, '朝向也还给自动瞄准（怪在右边）');

  // 挪开一点点（7px）就立刻算在瞄
  cursor.move(W / 2 + 7, H / 2);
  assert.ok(input.aimVector(W, H), '挪开一个小指头的距离就该算在瞄');
  game.player.cooldowns.set('pour', st.cooldown * 0.5);
  frames(env, 1);
  assert.ok(game.player.pourAim, '标记跟着回来');

  // 松开右键（指针没动）：也还给自动瞄准
  cursor.up();
  assert.equal(input.aimVector(W, H), null, '松开右键就不是在瞄了');
  game.player.cooldowns.set('pour', st.cooldown * 0.5);
  frames(env, 1);
  assert.equal(game.player.pourAim, null, '松手就没有标记了');
});

test('倾灯（桌面）：手里没有这件武器时，右键在屏幕上什么都不做', async (t) => {
  const { game, env } = await open(t, 'others');
  statue(game, 780, 700);
  game.player.oil = game.player.oilMax;
  // 一把别的武器（追踪火苗）+ 指针指着反方向 + 按住右键
  game.player.addWeapon('wisp');
  game.player.recomputeStats();
  const cursor = mouse(env);
  const aimX = game.renderer.width / 2 - 400;
  const aimY = game.renderer.height / 2;
  cursor.move(aimX, aimY);
  cursor.down(aimX, aimY);
  frames(env, 70);

  assert.equal(game.player.pourAim, null, '没有倾灯就没有落点标记（这一下拖动不属于任何武器）');
  const flying = game.projectiles.all.filter((p) => p.active);
  assert.ok(flying.length > 0, '追踪火苗照旧自己开火');
  assert.ok(flying.every((p) => p.vx > 1), `它仍然打向最近那只怪（右侧），不理会指针指在哪儿（vx=${flying.map((p) => p.vx.toFixed(1)).join(',')}）`);
  assert.ok(Math.abs(game.player.angle) < 1e-6, '人的朝向也不该被右键带走');
});

test('倾灯（桌面）：第一次拿到它，卡片讲的是"按住鼠标右键"', async (t) => {
  const { game, env } = await open(t, 'tip');
  void env;
  const hud = globalThis.window.__WICKLIGHT__.hud;
  const pour = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour');
  game.save.tips = [];
  const before = hud.toastRoot.children.length;
  game.chooseUpgrade({
    kind: 'weapon',
    id: 'pour',
    name: pour.name,
    blurb: pour.blurb,
    icon: '🔥',
    color: pour.color,
    level: 1,
    maxLevel: pour.levels.length,
    tag: 'new',
  });
  const added = hud.toastRoot.children.slice(before);
  assert.equal(added.length, 1, `首次拿到倾灯应弹一张提示卡（${added.length}）`);
  const body = String(added[0].innerHTML);
  assert.ok(/鼠标右键/.test(body), `桌面上这一件该讲鼠标右键（${body}）`);
  assert.ok(
    !/手指按住屏幕右侧/.test(body),
    `桌面上不该讲"手指按住屏幕右侧"——这台设备上做不到（${body}）`,
  );
  assert.ok(/灯火 ≥ 72%/.test(body), `"什么时候才响"那条规矩还得讲（它是自动开火的武器）（${body}）`);
});
