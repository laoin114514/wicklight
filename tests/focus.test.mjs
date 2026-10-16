/**
 * 焦点环（v82）回归测试：把"键盘 / 手柄能不能走完那十几屏"这件事钉住。
 *
 * 这一套分两半：
 *   · **导航打分**（`pickNearest`）是纯函数——"往下该挑哪一项"是这一整套里最容易出错、
 *     又最看不出来的地方（挑错了只是"按下去跳到了旁边那一列"，没人会以为是 bug）；
 *   · **环本身**（`FocusRing`）要管住三件事：第一次按方向只是"亮出来"（不猜你想去哪儿）、
 *     按住会自己走（先 0.35 秒、之后每 0.11 秒一格）、重画之后要回到原来那一项
 *     （设置里点一下开关整屏都会重画，环掉回第 0 项的话玩家就迷路了）。
 *
 * 屏幕上那圈光是谁画的（`.is-focus` 与 CSS）在真实浏览器那一条里量（tools/playtest.mjs）——
 * 无头环境的桩件**不解析 HTML**（`innerHTML` 只存字符串），所以这里用的是手搓的假元素：
 * 只喂 `getBoundingClientRect` / `dataset` / `classList` 这几样 `FocusRing` 真的会读的东西。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 一个假元素：只做 FocusRing 真的会读的那几样。 */
function fakeEl(box, over = {}) {
  const classes = new Set(over.classes ?? []);
  const el = {
    dataset: over.dataset ?? {},
    textContent: over.text ?? '',
    disabled: !!over.disabled,
    hasAttribute: (name) => (name === 'disabled' ? !!over.disabled : false),
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    getBoundingClientRect: () => ({ left: box.x, top: box.y, width: box.w, height: box.h, right: box.x + box.w, bottom: box.y + box.h }),
    clicks: 0,
    scrolled: 0,
    scrollIntoView() { el.scrolled += 1; },
    click() { el.clicks += 1; if (over.onClick) over.onClick(el); },
    classes,
  };
  return el;
}

/** 假根节点：`querySelectorAll` 给一份固定名单，`querySelector` 只认"返回"那颗按钮。 */
function fakeRoot(items, back = null) {
  return {
    querySelectorAll: () => items,
    querySelector: (sel) => (sel === '[data-act="back"]' ? back : null),
  };
}

/** 一排三个（同一行，x = 0 / 100 / 200）：量重复节奏就用这一排。 */
function rowOf3() {
  return [fakeEl({ x: 0, y: 0, w: 80, h: 30 }, { text: '甲' }), fakeEl({ x: 100, y: 0, w: 80, h: 30 }, { text: '乙' }), fakeEl({ x: 200, y: 0, w: 80, h: 30 }, { text: '丙' })];
}

test('导航打分：只挑那一侧，同一列 / 同一行优先，剩下的退回曼哈顿距离', async (t) => {
  installDomStubs();
  await import(`${ENTRY.href}?v=focus-${Date.now()}`);
  const { pickNearest } = globalThis.window.__WICKLIGHT__;
  const g = (x, y, w = 100, h = 40) => ({ x, y, w, h });

  // 一条横排：往右就是从第 0 项走到第 1 项，往左是往回走
  const row = [g(0, 100), g(140, 100), g(280, 100)];
  assert.equal(pickNearest(row, 0, 1, 0), 1, '往右：下一项');
  assert.equal(pickNearest(row, 2, -1, 0), 1, '往左：上一项');
  assert.equal(pickNearest(row, 0, -1, 0), -1, '左边没东西就是没东西（不绕回去）');
  assert.equal(pickNearest(row, 2, 1, 0), -1, '到头了不动');

  // 两列：左列窄、右列宽，按下要留在自己这一列里
  const twoCols = [g(0, 100, 200), g(360, 100, 300), g(0, 200, 200), g(360, 200, 300), g(0, 300, 200)];
  assert.equal(pickNearest(twoCols, 0, 0, 1), 2, '往下：同一列的下一行，不是右边那一列');
  assert.equal(pickNearest(twoCols, 2, 0, 1), 4, '接着往下还是自己这一列');
  assert.equal(pickNearest(twoCols, 1, 0, 1), 3, '右列自己往下');
  assert.equal(pickNearest(twoCols, 1, -1, 0), 0, '往左：横着跨到左列那一行');

  // 同一列优先：底下那一项**更远**也一样挑它——只要它和当前这一项在横向有交叠。
  // （纯曼哈顿距离在这里会跳到旁边那一列去：320+30 = 350 < 100+300 = 400。真实的界面上
  //   主菜单 / 选灯火 / 解锁树各有 5 / 5 / 4 下就是这一类的，见文件头那一段测量。）
  const wide = [{ x: 0, y: 0, w: 400, h: 40 }, { x: 0, y: 300, w: 200, h: 40 }, { x: 420, y: 30, w: 200, h: 40 }];
  assert.equal(pickNearest(wide, 0, 0, 1), 1, '同一列里那个更远，但它在同一列');

  // 三列的网格：往下走同一列
  const grid = [g(0, 0), g(120, 0), g(240, 0), g(0, 60), g(120, 60), g(240, 60)];
  assert.equal(pickNearest(grid, 0, 0, 1), 3, '3 列的网格：往下走同一列');
  assert.equal(pickNearest(grid, 0, 1, 0), 1, '往右走同一行');
  assert.equal(pickNearest(grid, 0, 0, -1), -1, '第一行再往上没有了');

  // 同列里挑哪一个：**正下方那个优先**，哪怕另一个按曼哈顿距离更近。
  // 这一条量的是主菜单那颗 425×97 的大按钮底下并排着两颗（无尽之夜 / 每日灯芯）——
  // 那两个到它的曼哈顿距离只差两像素，只按距离挑等于抛硬币，按"下"会有一半概率落到偏右那颗上。
  // 这里把它摆成"偏右那颗确实更近"（198 < 200），规则仍该挑正下方那颗。
  const hero = [{ x: 0, y: 0, w: 400, h: 100 }, { x: 20, y: 160, w: 180, h: 60 }, { x: 220, y: 128, w: 180, h: 60 }];
  const mh = (i) => {
    const a = hero[0];
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const b = hero[i];
    return Math.abs(b.x + b.w / 2 - ax) + Math.abs(b.y + b.h / 2 - ay);
  };
  assert.ok(mh(2) < mh(1), `前提：偏右那颗按曼哈顿距离更近（${mh(2)} < ${mh(1)}）`);
  assert.equal(pickNearest(hero, 0, 0, 1), 1, '按「下」挑的是正下方那颗，不是距离更近但偏着的');

  // 「同一列」是**结构**上的判断（侧轴投影交叠），不是"侧向距离小就赢"：
  // 一个又宽又偏的同列候选，侧向距离可以比旁边那一列里那颗小东西更远——按"下"仍该留在自己这一列。
  // 这是一块**摆出来的**极端版式：六个真屏（1280×720，逐项跑四个方向）上两种规则的落点完全一样，
  // 所以它守的是规则本身，不是某块屏幕上的手感。
  const guard = [{ x: 0, y: 0, w: 100, h: 40 }, { x: -290, y: 300, w: 400, h: 40 }, { x: 106, y: 60, w: 10, h: 40 }];
  assert.equal(pickNearest(guard, 0, 0, 1), 1, '同列那一项偏得再多也是它赢（不跨列去挑侧向更近的那颗）');
});

test('焦点环：第一次按方向只是"亮出来"，按住会自己走（先慢后快）', async (t) => {
  installDomStubs();
  await import(`${ENTRY.href}?v=focus2-${Date.now()}`);
  const { FocusRing, NAV_REPEAT_DELAY, NAV_REPEAT_EVERY, NAV_OVERLAP_TOLERANCE } = globalThis.window.__WICKLIGHT__;
  assert.equal(NAV_REPEAT_DELAY, 0.35, '第一格之前的等待是 0.35 秒');
  assert.equal(NAV_REPEAT_EVERY, 0.11, '之后每 0.11 秒一格');
  assert.equal(NAV_OVERLAP_TOLERANCE, 4, '侧轴上要有 4px 真交叠才算同一列（1px 的边缘相碰不算）');

  const els = rowOf3();
  const ring = new FocusRing();
  ring.attach(fakeRoot(els));
  assert.equal(ring.size, 3, '三项都收进来了');
  assert.equal(ring.index, -1, '刚画出来时环还没亮');

  assert.equal(ring.move(0, 1, 0), true, '第一次按方向：亮在第一项上');
  assert.equal(ring.index, 0);
  assert.equal(ring.move(0.01, 1, 0), false, `按住的第一格要等 ${NAV_REPEAT_DELAY} 秒`);
  assert.equal(ring.index, 0, '等的时候不能先走一格');
  assert.equal(ring.move(0.36, 1, 0), true, '过了 0.35 秒：自己走一格');
  assert.equal(ring.index, 1);
  assert.equal(ring.move(0.4, 1, 0), false, '离下一格还差一点点');
  assert.equal(ring.move(0.48, 1, 0), true, '每 0.11 秒一格');
  assert.equal(ring.index, 2);
  assert.equal(ring.move(0.6, 1, 0), false, '到头了：那个方向没有东西');
  assert.equal(ring.index, 2, '原地不动');
  assert.equal(ring.move(0.7, 0, 0), false, '松手');
  assert.equal(ring.move(0.72, -1, 0), true, '换方向立刻走（不用再等一次 0.35 秒）');
  assert.equal(ring.index, 1);

  // 亮起来之后，那一项身上要挂着 is-focus（屏幕上那圈光就是这一条 CSS 画的）
  assert.equal(els[1].classList.contains('is-focus'), true, '环上那一项挂着 is-focus');
  assert.equal(els[0].classList.contains('is-focus'), false, '别的那几项没有');
  assert.ok(els[1].scrolled >= 1, '长列表里要把它滚进视野（不然按了看不见自己在哪）');
});

test('焦点环：按下走 click 通道、有"返回"就返回、重画之后回到原来那一项', async (t) => {
  installDomStubs();
  await import(`${ENTRY.href}?v=focus3-${Date.now()}`);
  const { FocusRing } = globalThis.window.__WICKLIGHT__;

  // 按下 = 点一下（和鼠标同一条路）
  const els = rowOf3();
  const ring = new FocusRing();
  ring.attach(fakeRoot(els));
  ring.move(0, 1, 0);
  assert.equal(ring.activate(), true, '按下焦点上那一项');
  assert.equal(els[0].clicks, 1, '走的是 click（挂在上面的处理器照常跑）');
  assert.equal(els[1].clicks, 0, '别的项不该被点到');

  // 有"返回"就按它；没有就什么都不做（返回假，交给别人）
  const back = fakeEl({ x: 0, y: 0, w: 80, h: 30 }, { dataset: { act: 'back' } });
  const ring2 = new FocusRing();
  ring2.attach(fakeRoot(rowOf3(), back));
  assert.equal(ring2.backAction(), true, '这一屏有返回钮');
  assert.equal(back.clicks, 1, '返回钮被按了一下');
  const ring3 = new FocusRing();
  ring3.attach(fakeRoot(rowOf3()));
  assert.equal(ring3.backAction(), false, '没有返回钮的屏（主菜单）返回假');

  // 重画（设置里点一下开关整屏都会重画）：环要回到**同一条**上，不是掉回第一项
  const before = [
    fakeEl({ x: 0, y: 0, w: 200, h: 30 }, { dataset: { toggle: 'quality' } }),
    fakeEl({ x: 0, y: 40, w: 200, h: 30 }, { dataset: { toggle: 'vibrate' } }),
    fakeEl({ x: 0, y: 80, w: 200, h: 30 }, { dataset: { toggle: 'sound' } }),
  ];
  const ring4 = new FocusRing();
  ring4.attach(fakeRoot(before));
  ring4.move(0, 0, 1); // 第一次按方向：亮在"画质"上
  ring4.move(0.01, 0, 1); // 同一方向的下一帧（还没到 0.35 秒）
  ring4.move(0.36, 0, 1); // 一格
  assert.equal(ring4.index, 1, '前提：环挪到了第二项');
  const after = [
    fakeEl({ x: 0, y: 0, w: 200, h: 30 }, { dataset: { toggle: 'quality' } }),
    fakeEl({ x: 0, y: 40, w: 200, h: 30 }, { dataset: { toggle: 'vibrate' } }),
    fakeEl({ x: 0, y: 80, w: 200, h: 30 }, { dataset: { toggle: 'sound' } }),
  ];
  ring4.attach(fakeRoot(after), true, true);
  assert.equal(ring4.index, 1, '重画之后还停在"触感"那一条上');
  assert.equal(after[1].classList.contains('is-focus'), true, '那圈光也在它身上');
  assert.equal(after[0].classList.contains('is-focus'), false, '没有掉回第一项');

  // 换屏（`sameScreen` 不是真）：环要**收掉**，等玩家下一次按方向再亮。
  // 不收的话它会"记得"上一屏的第 n 项，于是新的一屏上没按方向也挂着一圈光，
  // 而且圈的是新屏第 n 个元素——一个和玩家刚才在干什么毫无关系的东西。
  const ring6 = new FocusRing();
  const menuLike = [
    fakeEl({ x: 0, y: 0, w: 200, h: 30 }, { dataset: { act: 'play' } }),
    fakeEl({ x: 0, y: 40, w: 200, h: 30 }, { dataset: { act: 'endless' } }),
    fakeEl({ x: 0, y: 80, w: 200, h: 30 }, { dataset: { act: 'codex' } }),
    fakeEl({ x: 0, y: 120, w: 200, h: 30 }, { dataset: { act: 'meta' } }),
    fakeEl({ x: 0, y: 160, w: 200, h: 30 }, { dataset: { act: 'settings' } }),
  ];
  ring6.attach(fakeRoot(menuLike));
  for (const now of [0, 0.36, 0.72, 1.1, 1.5]) ring6.move(now, 0, 1);
  assert.equal(ring6.index, 4, '前提：环挪到了第 5 项（那是上一屏上的位置）');
  const fresh = menuLike.map((el) => (el.classList.remove('is-focus'), el));
  ring6.attach(fakeRoot(fresh)); // 换了屏
  assert.equal(ring6.index, -1, '换屏之后环收掉了（没按方向就不该有光）');
  assert.equal(fresh.filter((el) => el.classList.contains('is-focus')).length, 0, '旧的一屏也不能留着那圈光');
  assert.equal(ring6.move(0, 0, 1), true, '新的一屏上第一下方向：老老实实亮在第一项上');
  assert.equal(ring6.index, 0, '不是"接着上一屏的第 5 项往下走"');

  // 收不到东西的屏（那三块有热键的面板直接关掉环）：按方向什么都不做
  const ring5 = new FocusRing();
  ring5.attach(fakeRoot(rowOf3()), false);
  assert.equal(ring5.size, 0, '关掉就是空的');
  assert.equal(ring5.move(0, 1, 0), false, '没有可点的东西时不动作');
  assert.equal(ring5.activate(), false, '按下去也没东西可点');
  assert.equal(ring5.index, -1);
});

test('焦点环：看不见的东西不落环（收起来的面板 / 禁用的按钮）', async (t) => {
  installDomStubs();
  await import(`${ENTRY.href}?v=focus4-${Date.now()}`);
  const { FocusRing } = globalThis.window.__WICKLIGHT__;
  const shown = fakeEl({ x: 0, y: 0, w: 100, h: 30 }, { text: '看得见' });
  const zero = fakeEl({ x: 0, y: 0, w: 0, h: 0 }, { text: '零尺寸' }); // 面板收起来时就是这个样子
  const hidden = fakeEl({ x: 0, y: 40, w: 100, h: 30 }, { text: '藏起来的', classes: ['is-hidden'] });
  const off = fakeEl({ x: 0, y: 80, w: 100, h: 30 }, { text: '禁用的', disabled: true });
  const ring = new FocusRing();
  ring.attach(fakeRoot([shown, zero, hidden, off]));
  assert.equal(ring.size, 1, '只有看得见又没被禁用的那一个落进环里');
  ring.move(0, 1, 0);
  assert.equal(ring.current, shown);
});

test('主循环里的那两条路：回车 / Start 在主菜单与选灯火上就是"那颗主按钮"', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=focus-loop-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0; // 开机动画那个 setInterval 清不掉，见 tests/gamepad.test.mjs 上那一段
  const w = globalThis.window.__WICKLIGHT__;
  const { game, loop, ui, input } = w;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  assert.equal(game.state, 'menu', '前提：停在主菜单上');

  // 回车（键盘）与 Start（手柄）在主菜单上都是"开始冒险"那一颗
  const key = (code) => {
    env.dispatch('keydown', { code });
    env.frame();
    env.dispatch('keyup', { code });
  };
  key('Enter');
  assert.equal(game.state, 'select', '主菜单按回车 → 去选灯火');
  assert.equal(ui.focusIndex, -1, '这一屏的焦点环还没亮（键盘那一下走的是"主按钮"那条路）');

  // 焦点环还没亮的时候按下：交给面板自己的主按钮（同上）
  env.dispatch('keydown', { code: 'Enter' });
  env.frame();
  env.dispatch('keyup', { code: 'Enter' });
  assert.equal(game.state, 'playing', '选灯火那一屏按回车 → 这一局就点起来了');

  // 战斗里方向键照旧是走位（navX 只是同一份按住状态的另一份读数）
  input.update();
  assert.equal(input.state.navX, 0);
  assert.equal(input.state.navY, 0);
});

test('焦点环：方向键"轻点一下"也算一格（keydown 与 keyup 落在同一帧里）', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=focus-tap-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0; // 开机动画那个 setInterval 清不掉，见 tests/gamepad.test.mjs 上那一段
  const w = globalThis.window.__WICKLIGHT__;
  const { game, loop, input } = w;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();

  // 真的按下 → 抬起，**中间不推进任何一帧**：这一下整帧落在 keydown 与 keyup 之间。
  // 一帧是 16.7ms（手机档 30fps 就是 33ms），而人手一次轻点 20~40ms——
  // 只认"按住状态"的实现会把这种输入整块吃掉，真机上就是"偶尔按了没反应"。
  env.dispatch('keydown', { code: 'ArrowDown' });
  env.dispatch('keyup', { code: 'ArrowDown' });
  env.frame();
  assert.equal(input.state.navY, 1, '这一帧要认得那次轻点（它就是方向）');
  env.frame();
  assert.equal(input.state.navY, 0, '下一帧就归零了（边沿只算一帧）');

  // 方向键在 `navX/navY` 上有、在战斗的走位上也有：同一份按住状态两种用法（见 Input.update）
  env.dispatch('keydown', { code: 'ArrowLeft' });
  env.frame();
  assert.equal(input.state.navX, -1, '方向键给焦点环一份方向');
  assert.equal(input.state.moveX, -1, '战斗里它还是走位（左边）');
  env.dispatch('keyup', { code: 'ArrowLeft' });
  env.frame();
  // WASD 只走位，不挪环——不然战斗中按 A 会让环也跟着动
  env.dispatch('keydown', { code: 'KeyA' });
  env.frame();
  assert.equal(input.state.moveX, -1, 'WASD 照旧是走位');
  assert.equal(input.state.navX, 0, 'WASD 不喂焦点环');
  env.dispatch('keyup', { code: 'KeyA' });
  env.frame();
});

test('主循环：两下轻点走两格、松手那一帧要喂给环、回车按下环上那一项', async (t) => {
  // 这一条走的是**整条路**：真键盘事件 → Input → main.ts 的主循环 → 环 → 元素的 click。
  // 桩件里塞一份"可点的东西"进去（见 dom-stubs 的 focusables），于是这一路上每一环都是真的。
  const env = installDomStubs({
    focusables: [
      { box: { x: 100, y: 100, w: 200, h: 40 }, dataset: { act: 'play' } },
      { box: { x: 100, y: 160, w: 200, h: 40 }, dataset: { act: 'endless' } },
      { box: { x: 400, y: 100, w: 200, h: 40 }, dataset: { act: 'codex' } },
    ],
    backElement: { box: { x: 100, y: 600, w: 80, h: 40 } },
  });
  await import(`${ENTRY.href}?v=focus-loop2-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0; // 开机动画那个 setInterval 清不掉，见 tests/gamepad.test.mjs 上那一段
  const w = globalThis.window.__WICKLIGHT__;
  const { game, loop, ui } = w;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  assert.equal(game.state, 'menu', '前提：停在主菜单上');

  const [play, endless, codexEl] = env.focusables;
  const hits = { play: 0, endless: 0, codex: 0 };
  play.addEventListener('click', () => { hits.play += 1; });
  endless.addEventListener('click', () => { hits.endless += 1; });
  codexEl.addEventListener('click', () => { hits.codex += 1; });

  // 一次"轻点" = 按下与抬起落在同一帧里（见底下 gain 那一段）
  const tap = (code) => {
    env.dispatch('keydown', { code });
    env.dispatch('keyup', { code });
    env.frame();
  };
  const idle = (n = 1) => {
    for (let i = 0; i < n; i += 1) env.frame();
  };

  assert.equal(ui.focusIndex, -1, '刚上屏：环还没亮');
  tap('ArrowDown');
  assert.equal(ui.focusIndex, 0, '第一下轻点：环亮在第一项上');
  assert.equal(play.classList.contains('is-focus'), true, '那一项身上挂着 is-focus（屏幕上那圈光就是它）');
  // 下面这几下之间**要隔着帧**（人手一下 50~150ms，60fps 就是好几帧）：
  // 环靠"松手那几帧收到的 (0,0)"来认出"这是一下新的"，而主循环每一帧都会喂给它——
  // 只在有方向时才喂的话，第二下会被当成"还按着"而吃掉（见 main.ts 里那一段）。
  idle();
  tap('ArrowDown');
  assert.equal(ui.focusIndex, 1, '再轻点一下：往下走一格（两下之间隔着释放帧）');
  idle();
  tap('ArrowRight');
  assert.equal(ui.focusIndex, 2, '换方向立刻走（不用等重复那一格的时间）');
  idle();
  tap('ArrowLeft');
  assert.equal(ui.focusIndex, 0, '那一行只有一项在侧轴上和它对着——往左就回到「开始冒险」');
  idle();
  tap('ArrowDown');
  assert.equal(ui.focusIndex, 1, '再往下：同一列里正下方那一项');

  // 回车 = 按下环上那一项：走的是元素自己的 click 通道
  tap('Enter');
  assert.deepEqual(hits, { play: 0, endless: 1, codex: 0 }, '回车按下的正是环圈住的那一项（别的项一次都没碰到）');
  assert.equal(game.state, 'menu', '桩件里那一项没有真的处理器，所以人还停在主菜单上');

  // Esc / Ⓑ 在战斗之外 = 按下这一屏的"返回"（战斗 / 暂停 / 总览里它还是暂停开关，那条路不走这里）
  const back = env.backElement;
  let backs = 0;
  back.addEventListener('click', () => { backs += 1; });
  game.state = 'codex';
  tap('Escape');
  assert.equal(backs, 1, '图鉴那一屏上按 Esc：按的是「返回」那颗');
  game.state = 'menu';

  // 「第几张」那几块面板（升级 / 商店 / 祭坛 / 夜咒）上环是**关着**的：
  // 那几块本来就用数字键 / 脸键直接挑（见 UIManager.PICK_STATES），同一个位置摆两套挑法只会打架
  game.state = 'shop';
  ui.showScreen('shop');
  assert.equal(ui.focusIndex, -1, '商店那一屏上环不亮');
  tap('ArrowDown');
  assert.equal(ui.focusIndex, -1, '在商店上按方向：环也不出现（那块面板归 1…6 与 R 管）');
  game.state = 'menu';
  ui.showScreen('menu');
});
