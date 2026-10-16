/**
 * 手柄回归测试（v81）：键盘 / 鼠标 / 触摸之外的第四条输入路。
 *
 * 这一套要回答的是四个问题：
 *   · **映射对不对**：摇杆与十字键走位、Ⓐ/Ⓧ（或 RT/LT）冲刺与燃爆、Ⓑ 分灯、Ⓨ 拨芯、
 *     右摇杆给「倾灯」手动瞄准、Start / Back 在战斗里是暂停与构筑总览——
 *     而它们在**面板上换一套**（脸键 = 第 1~4 张、Start = 确认、Back = 重掷）；
 *   · **一次性输入真的只给一次**：按住不放不该变成"每帧按一下"
 *     （拨芯会一秒翻 60 格、重掷会把点花光）——这是这一条路上最容易写错的地方；
 *   · **它真的接进了主循环**：不是"类写好了但没人调用"——喂一只假手柄进 `navigator.getGamepads`
 *     推着摇杆跑几帧，角色的坐标必须真的动起来（死区内一动不动）；
 *   · **接上 / 拔掉要有交代**：HUD 底部那行说明换成手柄那一份、接上的那一刻给一句话、
 *     第一次接上还要讲一次完整映射（只讲一次，写进存档）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 一只假手柄：只做真实 `Gamepad` 用得到的那几个字段（id / connected / buttons / axes）。 */
function fakePad(over = {}) {
  const pad = {
    id: 'Fake Pad (STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
    ...over,
  };
  pad.down = (i) => { pad.buttons[i] = { pressed: true, value: 1 }; return pad; };
  pad.up = (i) => { pad.buttons[i] = { pressed: false, value: 0 }; return pad; };
  pad.stick = (x, y) => { pad.axes[0] = x; pad.axes[1] = y; return pad; };
  pad.aimStick = (x, y) => { pad.axes[2] = x; pad.axes[3] = y; return pad; };
  return pad;
}

async function open(t, tag = 'a') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pad-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  // ⚠ 启动动画那个 `setInterval` 在桩件里**清不掉**（`clearInterval` 是空函数），
  //   而它每跑一次就 `game.bootDone()` 一次（状态被按回 'menu'）——本文件是**唯一**
  //   一个要连着走很多帧的测试（手柄得靠真主循环），所以这里把那个队列清空。
  //   台架（tools/bench-waves.mjs）同一件事同一个做法。
  env.intervals.length = 0;
  const w = globalThis.window.__WICKLIGHT__;
  const { game, loop } = w;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) { s.x = 9e5; s.y = 9e5; }
  for (const py of game.level.pyres) { py.x = 9e5; py.y = 9e5; }
  game.enemies.clear();
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.player.x = 0;
  game.player.y = 0;
  /** 插上 / 拔掉一只手柄（主循环每一帧都读 `navigator.getGamepads`）。 */
  const plug = (pads) => { globalThis.navigator.getGamepads = () => (pads === null ? [] : Array.isArray(pads) ? pads : [pads]); };
  plug(null);
  return { env, game, w, plug };
}

/** 走几帧（`env.frame` 推的是真实的 rAF 队列，主循环那一整套都会跑）。 */
function frames(env, n) {
  for (let i = 0; i < n; i += 1) env.frame();
}

/** 一件东西现在到几级了（和 `tests/hotkeys.test.mjs` 同一个口径）。 */
function levelOf(game, offer) {
  if (!offer) return -1;
  if (offer.kind === 'weapon') return game.player.weapons.get(offer.id) ?? 0;
  if (offer.kind === 'passive') return game.player.passives.get(offer.id) ?? 0;
  return game.player.relics.has(offer.id) ? 1 : 0;
}

test('映射：摇杆与十字键走位、两个动作键、两个动词键、两条边沿输入', async (t) => {
  const { Gamepad, pad: live } = (await open(t, 'map')).w;
  assert.ok(live && typeof live.poll === 'function', '构建产物该把主循环里那只手柄交出来（测试要能单独读它）');
  const pad = fakePad();
  const g = new Gamepad(() => [pad]);
  // 第一帧：什么都没按
  let s = g.poll('run');
  assert.ok(s, '接着手柄时 `poll` 该给出一份快照');
  assert.deepEqual([s.moveX, s.moveY], [0, 0], '没推摇杆时不该有方向');
  assert.equal(s.aim, null, '没推右摇杆时该还给自动瞄准（null）');
  assert.equal(s.dash, false);

  // 走位：左摇杆 + 十字键（两个都要能用——有人用摇杆有人用十字键）
  pad.stick(1, 0);
  s = g.poll('run');
  assert.deepEqual([s.moveX, s.moveY], [1, 0], '左摇杆推到底就是朝右一格');
  pad.stick(0, 0).down(12);
  s = g.poll('run');
  assert.deepEqual([s.moveX, s.moveY], [0, -1], '十字键上 = 朝上');
  pad.up(12);
  // 斜着推不该比直着推快（和键盘 / 触屏同一个口径：走位向量长度最多是 1）
  pad.stick(1, 1);
  s = g.poll('run');
  assert.ok(Math.abs(Math.hypot(s.moveX, s.moveY) - 1) < 1e-9, '斜着推该被归一，不能跑出 √2 倍速');
  pad.stick(0.1, 0);
  s = g.poll('run');
  assert.deepEqual([s.moveX, s.moveY], [0, 0], '死区里一动不动（手搭在摇杆上不该让角色慢慢漂）');
  // ⚠ 这两个数卡在两个死区的**中间**（0.18 < 0.2 < 0.25）：这一对断言是"两个死区各是各的"的
  //   唯一量法——写 0.1 的话，两个死区对调过来也照样是 0（0.1 谁都比它大），变异体实测活下来了。
  pad.stick(0.2, 0);
  assert.equal(g.poll('run').moveX, 0.2, '0.2 出了走位死区，就该按原样推出去');
  pad.stick(0, 0);

  // 动作键：Ⓐ / RT 都是冲刺，Ⓧ / LT 都是燃爆
  pad.down(0);
  assert.equal(g.poll('run').dash, true, 'Ⓐ = 冲刺');
  pad.up(0).down(7);
  assert.equal(g.poll('run').dash, true, 'RT 也是冲刺（手柄上那只食指比面键顺）');
  pad.up(7).down(2);
  assert.equal(g.poll('run').nova, true, 'Ⓧ = 燃爆');
  pad.up(2).down(6);
  assert.equal(g.poll('run').nova, true, 'LT 也是燃爆');

  // 两个动词键：Ⓑ 分灯 / Ⓨ 拨芯，都是"按一下"（键值那一类边沿输入）
  pad.up(6);
  pad.down(1);
  assert.equal(g.poll('run').lamp, true, 'Ⓑ = 分灯（按下的那一帧）');
  assert.equal(g.poll('run').lamp, false, '按住不放的第二帧不该再给一次——不然一秒能放 60 盏灯');
  pad.up(1).down(3);
  assert.equal(g.poll('run').dim, true, 'Ⓨ = 拨芯（按下的那一帧）');
  assert.equal(g.poll('run').dim, false, '拨芯是开关，按住不放只该翻一格');

  // 右摇杆：方向单位化、长度就是力度（和触屏那根手指同一个编码）
  pad.up(3).aimStick(1, 0);
  s = g.poll('run');
  assert.ok(s.aim && Math.abs(s.aim.x - 1) < 1e-9 && Math.abs(s.aim.y) < 1e-9, '右摇杆推到底 = 方向朝右、力度 1');
  pad.aimStick(0.3, 0.4);
  s = g.poll('run');
  assert.ok(s.aim && Math.abs(Math.hypot(s.aim.x, s.aim.y) - 1) < 1e-9, '方向该是单位向量（力度另算，见下一句）');
  pad.aimStick(0.1, 0);
  assert.equal(g.poll('run').aim, null, '右摇杆的死区里不算在瞄（推一点点就开始改落点会像在抢那盏灯）');
  pad.aimStick(0.2, 0);
  assert.equal(g.poll('run').aim, null, '瞄准的死区比走位大：0.2 走得动路，但还不算在瞄');
  pad.aimStick(0, 0);

  // Start / Back：战斗里是暂停与构筑总览
  pad.down(9);
  s = g.poll('run');
  assert.equal(s.pause, true, 'Start 在战斗里是暂停');
  assert.equal(s.confirm, false, '……而不是确认（它在面板上才是确认）');
  pad.up(9).down(8);
  s = g.poll('run');
  assert.equal(s.sheet, true, 'Back 在战斗里是构筑总览');
  assert.equal(s.reroll, false, '……而不是重掷');
  pad.up(8);

  // 面板上换一套：脸键 = 第 1~4 张、Start = 确认、Back = 重掷
  pad.down(1);
  s = g.poll('panel');
  assert.equal(s.pick, 2, '面板上 Ⓑ = 第 2 张');
  pad.up(1).down(9);
  s = g.poll('panel');
  assert.equal(s.confirm, true, '面板上 Start = 确认（对应键盘的回车）');
  assert.equal(s.pause, false, '面板上它不是暂停');
  pad.up(9).down(8);
  s = g.poll('panel');
  assert.equal(s.reroll, true, '面板上 Back = 重掷（对应键盘的 R）');
  assert.equal(s.sheet, false, '面板上它不是构筑总览');
  pad.up(8);

  // 商店的货架是六件，四个面键不够：第 5 / 6 件接在肩上（和键盘那排数字键同一个位置）
  pad.down(4);
  assert.equal(g.poll('panel').pick, 5, '面板上 LB = 第 5 件');
  assert.equal(g.poll('panel').pick, 0, '按下第二帧不该再给一次（同样是边沿）');
  pad.up(4).down(5);
  assert.equal(g.poll('panel').pick, 6, 'RB = 第 6 件');
  pad.up(5);
  pad.down(4);
  assert.equal(g.poll('run').pick, 0, '战斗里没有"第几张"这回事（按了不该有副作用）');
  pad.up(4);

  // 菜单导航（v82）：十字键 / 左摇杆按住给方向，脸键是"按下焦点 / 返回"（不是"第几张"）
  assert.deepEqual(g.poll('menu').nav, { dx: 0, dy: 0 }, '没推就是没方向');
  pad.down(15);
  assert.deepEqual(g.poll('menu').nav, { dx: 1, dy: 0 }, '十字键右 = 往右一格');
  pad.up(15);
  pad.stick(0.3, 0);
  assert.deepEqual(g.poll('menu').nav, { dx: 0, dy: 0 }, '手搭在摇杆上（走位那边算在动，菜单上不算）');
  pad.stick(1, 0);
  assert.deepEqual(g.poll('menu').nav, { dx: 1, dy: 0 }, '推到底才算"往右"');
  pad.stick(0, 0);
  pad.down(0);
  assert.equal(g.poll('menu').activate, true, '菜单上 Ⓐ = 按下焦点上那一项');
  assert.equal(g.poll('menu').activate, false, '按住不放不该连着按（边沿）');
  pad.up(0).down(1);
  // 同一次按下两个字段一起读：`poll` 会把"上一帧按着什么"更新掉，第二遍 poll 就读不到边沿了
  const menuBack = g.poll('menu');
  assert.equal(menuBack.back, true, '菜单上 Ⓑ = 返回上一屏');
  assert.equal(menuBack.pick, 0, '菜单上脸键是「按下焦点 / 返回」，不是「第几张」（那一套只在升级 / 商店 / 祭坛上有）');
  pad.up(1);
  // 战斗里同一次按下是另一件事（冲刺 / 分灯）——两个字段各自表达一件事，用哪个看状态
  pad.down(0);
  const msRun = g.poll('run');
  assert.equal(msRun.dash && msRun.activate, true, '战斗里 Ⓐ 既是冲刺、也是"按下"');
  pad.up(0).down(1);
  const msRun2 = g.poll('run');
  assert.equal(msRun2.lamp && msRun2.back, true, '战斗里 Ⓑ 既是分灯、也是"返回"');
  pad.up(1);

  // 拔掉：没有手柄就是"什么都没有按"
  assert.equal(new Gamepad(() => []).poll('run'), null, '没接手柄时该返回 null（调用方按"没有"处理）');
  // 拔掉再插上：边沿检测要归位（不然"插上那一刻按着的键"会被当成一次新按下）
  const hot = fakePad();
  const g2 = new Gamepad(() => [hot]);
  hot.down(3);
  assert.equal(g2.poll('run').dim, true);
  g2.poll('run');
  assert.equal(g2.poll('run').dim, false, '按着不放第二帧不该再触发');
  // 两只手柄只认第一只：两只手在同一个角色身上抢方向盘只会让人以为游戏坏了
  const a = fakePad().stick(1, 0);
  const b = fakePad();
  b.id = 'Second Pad';
  b.stick(-1, 0);
  const g3 = new Gamepad(() => [a, b]);
  assert.deepEqual([g3.poll('run').moveX, g3.poll('run').id], [1, a.id], '同时插两只时只认第一只');

  // 线松了一下又插回来、手里还按着 Ⓨ：不该凭空翻一格。
  // `null` 表达的是"这一帧没有读数"，不是"按键全松开了"——把边沿状态清掉就等于把
  // "手还按着"读成"刚按下"，玩家什么都没做、灯芯自己翻了一格。
  const hold = fakePad();
  let plugged = [hold];
  const g4 = new Gamepad(() => plugged);
  hold.down(3);
  assert.equal(g4.poll('run').dim, true, '按下的那一帧给一次');
  plugged = [];
  assert.equal(g4.poll('run'), null, '拔掉就是"什么都没有按"');
  plugged = [hold];
  assert.equal(g4.poll('run').dim, false, '插回来时手还按着，那不算新的一次按下');
  hold.up(3);
  g4.poll('run');
  hold.down(3);
  assert.equal(g4.poll('run').dim, true, '松手再按才算新的一次');
});

test('它真的接进了主循环：推摇杆角色就走、死区内一动不动', async (t) => {
  const { env, game, w, plug } = await open(t, 'loop');
  const pad = fakePad();
  plug(pad);
  frames(env, 3);
  const x0 = game.player.x;
  assert.ok(Math.abs(x0) < 0.5, '前提：还没推摇杆时角色待在原地');

  pad.stick(0.1, 0);
  frames(env, 6);
  assert.ok(Math.abs(game.player.x - x0) < 0.5, `死区里不该动（${x0} → ${game.player.x}）`);

  pad.stick(1, 0);
  frames(env, 6);
  assert.ok(game.player.x > x0 + 4, `推着摇杆该真的走起来（${x0} → ${game.player.x}）`);
  assert.ok(game.player.vx > 0, '速度也要真的给上（不是只有位移）');

  // 走位是**两只手能同时搭两个设备**：键盘按着左、手柄推着右，合起来该是 0（而不是 1.5 倍速）
  const before = game.player.x;
  game.setInput(1, 0, false, false);
  pad.stick(-1, 0);
  frames(env, 4);
  assert.ok(Math.abs(game.player.x - before) < 2, `键盘与手柄反向推该互相抵消（${before} → ${game.player.x}）`);
  // 手柄推着一半、键盘按着一下：向量的长度不该超过 1（超了就是"两个人一起推"的 1.5 倍速）
  pad.stick(0.5, 0);
  game.setInput(1, 0, false, false);
  frames(env, 6);
  assert.ok(Math.abs(game.player.vx) <= game.player.stats.moveSpeed + 1e-6, `合起来的走位速度不该超过基础移速（${game.player.vx}）`);

  // 切到后台再回来（主循环在 visibilitychange 里调 `pad.reset()`）：那一刻手还按着 Ⓨ 的话，
  // 回来那一帧**不该补响**——接个电话回来，灯芯自己翻一格，是玩家根本没做过的事。
  game.setInput(0, 0, false, false);
  game.player.wickOn = false;
  pad.stick(0, 0).down(3);
  frames(env, 3);
  assert.equal(game.player.wickOn, true, '前提：这一下本来是有效的');
  w.pad.reset(); // = 页面切到后台再回来
  frames(env, 4);
  assert.equal(game.player.wickOn, true, '回来那一帧不该把按着的 Ⓨ 再补响一次');
  pad.up(3);
  frames(env, 3);
  pad.down(3);
  frames(env, 3);
  assert.equal(game.player.wickOn, false, '松手再按才是新的一次');
  pad.up(3);
});

test('按一下就是一下：拨芯按住只翻一格、分灯按住只放一盏', async (t) => {
  const { env, game, plug } = await open(t, 'oneshot');
  const pad = fakePad();
  plug(pad);
  frames(env, 2);
  assert.equal(game.player.wickOn, false, '前提：还没拨过芯');

  // ⚠ 这里量的是**两个数**，不是一个：`wickOn` 是玩家按下去的意图（这一帧就该翻），
  //   `dimmed` 是画面上真实的火（插值过半，按下要 0.14 秒 = 0.28 秒的一半，
  //   见 Player.dimmed 上那一段）。所以第一句要立刻翻，第二句得给够帧数。
  pad.down(3); // Ⓨ
  frames(env, 1);
  assert.equal(game.player.wickOn, true, '按下去那一帧就该拨上（意图不等插值）');
  frames(env, 14);
  assert.equal(game.player.dimmed, true, '给够 0.14 秒，火真的矮下去');
  frames(env, 10);
  assert.equal(game.player.dimmed, true, '按住不放不该翻来翻去（那就是一秒 60 格）');
  pad.up(3);
  frames(env, 2);
  assert.equal(game.player.dimmed, true, '松手不该翻回去——它是开关，不是按住');
  pad.down(3);
  frames(env, 1);
  assert.equal(game.player.wickOn, false, '再按一下才翻回来');
  frames(env, 30);
  assert.equal(game.player.dimmed, false, '火也会自己烧回来');
  pad.up(3);

  // 分灯：按一下一盏，按住不放还是一盏（多出来的是冷却之外的白放）
  const before = game.lamps.length;
  pad.down(1); // Ⓑ
  frames(env, 8);
  const afterOne = game.lamps.length;
  assert.equal(afterOne, before + 1, `Ⓑ 按一下该放下一盏灯（${before} → ${afterOne}）`);
  frames(env, 30);
  assert.equal(game.lamps.length, before + 1, '按住不放不该一秒放 60 盏灯');
  pad.up(1);
});

test('结算屏：Start 就是那颗主按钮（不然手柄打到死就卡住了）', async (t) => {
  const { env, game, plug } = await open(t, 'result');
  const pad = fakePad();
  plug(pad);
  frames(env, 2);

  // 摆成"被打死"（这一条量的是结算屏上 Start 的含义，不是死亡流程本身）
  game.player.revives = 0;
  game.player.hp = -1;
  game.update(1 / 60);
  assert.equal(game.state, 'dead', '前提：血空了进结算屏');

  // 结算屏只有一颗按钮（回车 = 那颗主按钮），所以 Start 在那儿该是**确认**而不是暂停——
  // 不然手柄玩家打到死就卡在这一屏，只能去摸鼠标
  pad.down(9);
  frames(env, 3);
  assert.equal(game.state, 'select', 'Start = 那颗主按钮（阵亡 → 去选灯火）');
  pad.up(9);
});

test('主菜单上：Start 就是那颗主按钮（手柄玩家的第一件事是把这一局点起来）', async (t) => {
  const { env, game, plug } = await open(t, 'menu-main');
  const pad = fakePad();
  plug(pad);
  frames(env, 2);
  assert.equal(game.state, 'playing', '前提：这一局已经开打了（open 里开的那一局）');
  game.goMenu();
  assert.equal(game.state, 'menu');

  pad.down(9);
  frames(env, 3);
  assert.equal(game.state, 'select', '主菜单上 Start → 去选灯火');
  pad.up(9);
  frames(env, 2);
  pad.down(9);
  frames(env, 3);
  assert.equal(game.state, 'playing', '再按一下 Start → 这一局就点起来了');
  pad.up(9);
});

test('Start / Back：战斗里是暂停与构筑总览（和键盘的 Esc / Tab 同一个意思）', async (t) => {
  const { env, game, plug } = await open(t, 'keys');
  const pad = fakePad();
  plug(pad);
  frames(env, 2);
  assert.equal(game.state, 'playing');

  pad.down(9);
  frames(env, 3);
  assert.equal(game.state, 'paused', 'Start = 暂停');
  pad.up(9);
  frames(env, 2);
  pad.down(9);
  frames(env, 3);
  assert.equal(game.state, 'playing', '再按一下 Start 继续（它是开关）');
  pad.up(9);
  frames(env, 2);

  pad.down(8);
  frames(env, 3);
  assert.equal(game.state, 'loadout', 'Back = 构筑总览');
  pad.up(8);
  frames(env, 2);
  assert.equal(game.state, 'loadout', '松手不会自己关掉——它是按一下翻一格');
  pad.down(8);
  frames(env, 3);
  assert.equal(game.state, 'playing', '再按一下 Back 收起来');
  pad.up(8);
});

test('面板上：脸键选第几张、Start 确认、Back 重掷（走的是和键盘同一条规则）', async (t) => {
  const { env, game, plug } = await open(t, 'panel');
  const pad = fakePad();
  plug(pad);
  frames(env, 2);
  game.gainXp(game.xpToNext + 1);
  assert.equal(game.state, 'levelup', '前提：攒够经验会弹出升级面板');
  const [first, second] = game.currentOffers;
  assert.ok(second, '得有第二张卡，这条断言才量得出"按的是第二张"');
  const firstBefore = levelOf(game, first);
  const secondBefore = levelOf(game, second);

  pad.down(1); // Ⓑ = 第 2 张
  frames(env, 3);
  assert.equal(game.state, 'playing', '选完就该回到战场');
  assert.ok(levelOf(game, second) > secondBefore, `Ⓑ 该点亮的是第二张（${second.kind}:${second.id}）`);
  assert.equal(levelOf(game, first), firstBefore, `第一张不该被顺手也长一级（${first.kind}:${first.id}）`);
  pad.up(1);
});

test('接上 / 拔掉要有交代：底部那行说明换掉、第一次还要讲一次完整键位', async (t) => {
  const { env, game, w, plug } = await open(t, 'hint');
  const pad = fakePad();
  const seen = [];
  // 桩件里的 DOM 不解析 HTML，读不到那行字——所以量的是**游戏有没有把该换的那份交出去**
  // （`hud.setHint`）；真的画在屏幕上是 playtest 那一条的事。
  const orig = game.hud.setHint.bind(game.hud);
  game.hud.setHint = (text) => { seen.push(text); orig(text); };

  plug(pad);
  frames(env, 2);
  assert.equal(game.padConnected, true, '主循环该把"接着手柄"这件事告诉游戏');
  const padHint = seen.find((s) => s && /摇杆/.test(s));
  assert.ok(padHint, `接上那一刻要换掉底部那行说明（收到的是 ${JSON.stringify(seen)}）`);
  assert.ok(/Ⓐ/.test(padHint) && !padHint.includes('空格'), `换成的那一份要写手柄的键、不写键盘的键（${padHint}）`);
  assert.ok(game.save.tips.includes('input:gamepad'), '在战斗里接上就当场讲那张完整键位卡，并写进存档');

  // 拔掉：回到键盘那一行（不是留在手柄那一份上）
  plug(null);
  frames(env, 2);
  assert.equal(game.padConnected, false, '拔掉之后要认得出来');
  assert.equal(seen[seen.length - 1], null, '拔掉之后要换回默认那一份（传 null = 用 HUD 自己那行键盘说明）');

  // 再插上：那行说明还是手柄那一份，但键位卡不会再讲第二遍（同一条只讲一次）
  const tipsBefore = game.save.tips.filter((k) => k === 'input:gamepad').length;
  plug(pad);
  frames(env, 2);
  assert.equal(seen[seen.length - 1], padHint, '再插上还是手柄那一行');
  assert.equal(game.save.tips.filter((k) => k === 'input:gamepad').length, tipsBefore, '那张卡不会再讲一遍');

  // 在菜单里接上：那张卡排到下一局（开局那两秒屏幕上已经很满了，见 Game.setPadState）
  const menu = await open(t, 'menu');
  menu.game.goMenu();
  menu.game.save.tips = [];
  menu.plug(pad);
  frames(menu.env, 2);
  assert.equal(menu.game.padConnected, true, '菜单里也要认得出手柄');
  assert.equal(menu.game.padTipAt, 0, '菜单里接上时排的是"下一局开始就讲"（不是丢掉）');
  assert.ok(!menu.game.save.tips.includes('input:gamepad'), '还没讲过的卡不该被偷偷记成"讲过了"');
  menu.game.newRun('warden', 'normal', false);
  assert.equal(menu.game.padTipAt, 26, '新开的这一局里，那张卡排在第 26 秒（躲开开局那两秒）');
  w.pad.reset();
});
