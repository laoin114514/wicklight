/**
 * HUD 卡片的分寸：不叠重复的、手机上别堆成一面墙、一条横带一次只讲一条。
 *
 * 起因是 844×390 上的实测截图：开局那几秒图鉴 / 悬赏 / 关卡卡一起冒出来，
 * 四条卡片正好盖住站在屏幕中央的玩家——玩家看不见自己，等于直接挨打。
 * v60 之前是"短公告限 3 条、提示卡不限额"，实测下来提示卡才是糊屏的主力：
 * 5 张卡片一路堆到 413px（屏幕才 390 高），覆盖 21% 的屏幕。
 * 现在的规矩：
 *   · 掌上横屏只有一条能放卡片的横带（左上是生命/灯油那一列、右上是记分列、
 *     屏幕正中是**你自己**），所以短公告与提示卡各占一条车道、**一次只挂一条**，
 *     多余的排队等着，讲完一张再上一张；
 *   · 排队也不是无限等：短公告等超过 3 条就从最旧的开始丢（它说的是"此刻"）；
 *   · 公告亮着的时候整条横带归它，正讲着的卡片退回队列（不是被丢掉）；
 *   · 桌面照旧堆叠（5 条）——那里的屏幕高度不是稀缺资源。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 装成横屏手机：触点数 > 0 且视口够小（和 haptics 那条测试同样的装法）。 */
function pretendHandheld() {
  globalThis.window.innerWidth = 844;
  globalThis.window.innerHeight = 390;
  globalThis.navigator.maxTouchPoints = 5;
}

const said = (el) => String(el.textContent ?? el.innerHTML ?? '');

/** 开一局并把 HUD 的每帧推进也接上（主循环里是 game.update 之后紧跟 hud.update）。 */
async function boot(t, tag, handheld = false) {
  const env = installDomStubs();
  // ⚠ 触屏判定在模块里缓存，必须在 import 之前装好环境（装晚了整条掌上分支都走不到）
  if (handheld) pretendHandheld();
  await import(`${ENTRY.href}?v=${tag}-${Date.now()}`);
  env.frame();
  const { game, loop, hud } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  return { env, game, hud };
}

test('手机横屏：短公告与提示卡各一条车道，其余排队讲、讲完自己接上', async (t) => {
  const env = installDomStubs();
  pretendHandheld();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, hud } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  const root = hud.toastRoot;
  hud.clearCards();
  const cards = () => Array.from(root.children);
  const tips = () => cards().filter((c) => c.classList.contains('toast--tip'));
  const toasts = () => cards().filter((c) => !c.classList.contains('toast--tip'));
  const keys = (list) => list.map((c) => c.dataset.cardKey);
  /** 卡片的时间由 hud.update(dt) 推（不是 setTimeout：桩件里的定时器只入队不执行）。 */
  const tick = (sec) => {
    for (let i = 0; i < Math.round(sec * 60); i += 1) hud.update(1 / 60);
  };

  // ── 连着弹 5 条短公告：横带上只留一条，其余排队 ──
  for (let i = 0; i < 5; i += 1) hud.toast(`公告 ${i}`);
  assert.equal(toasts().length, 1, `掌上档横带上只该挂一条短公告（实为 ${toasts().length} 条）`);
  assert.deepEqual(keys(toasts()), ['公告 0'], '先来的先讲');
  assert.equal(hud.queued, 3, '排队最多留 3 条：等轮到它时说的那件事早就过去了');

  // ── 同一条再弹一次不该多出一条（"图鉴 +2 条" 曾经同时出现两条）──
  hud.toast('公告 0');
  assert.equal(hud.queued, 3, '屏幕上还挂着的同样一句话不该再排一条');

  // ── 讲完一张，队列里的下一条自己接上（不是把话吞了）──
  tick(3);
  assert.deepEqual(keys(toasts()), ['公告 2'], '讲完 公告 0，队列里的 公告 2 接着上屏');
  hud.toast('公告 3');
  assert.equal(hud.queued, 2, '排队里已经有 公告 3 了，不该再排一条');
  tick(2.8);
  assert.deepEqual(keys(toasts()), ['公告 3'], '再讲完一条，接着上 公告 3');
  tick(3);
  assert.deepEqual(keys(toasts()), ['公告 4'], '队列一直讲到空');
  tick(4);
  assert.equal(cards().length, 0, '讲完了就该真的摘掉，不是只标个淡出');

  // ── 淡出中的那条不再拦同一句话：它已经读完了，但位置还占着 ──
  hud.clearCards();
  hud.toast('公告 2');
  tick(2); // 1.8s 之后开始淡出
  assert.ok(toasts()[0].classList.contains('is-out'), '过了停留时间要先淡出');
  hud.toast('公告 2');
  assert.equal(hud.queued, 1, '淡出中的卡片不该拦住同一句话再排一次');

  // ── 提示卡是另一条车道：和短公告可以并排，但同一条车道上一次只讲一张 ──
  hud.clearCards();
  hud.tip('咒盾烛母', '它免疫灼烧，先拆盾。');
  hud.tip('终夜', '别在它起身时贴脸。');
  hud.tip('险境 · 回声', '回声里的敌人会复读你的位移。');
  hud.toast('公告 A');
  assert.equal(tips().length, 1, '提示卡一次也只讲一张');
  assert.equal(toasts().length, 1, '短公告占另一条车道');
  assert.deepEqual(keys(tips()), ['咒盾烛母'], '先讲第一张提示卡');
  assert.equal(hud.queued, 2, '另外两张提示卡排队等着');
  tick(6); // 4.6s 停留 + 淡出
  assert.deepEqual(keys(tips()), ['终夜'], '讲完一张，下一张自己接上');
  tick(6);
  assert.deepEqual(keys(tips()), ['险境 · 回声'], '三张提示卡一张不落，只是排着队讲');

  // ── 提示卡一条都不丢：它是"讲一次就够"的教学，而 Game.showTip 早就把它记进存档了 ──
  const told = new Set(keys(tips()));
  for (const [key, text] of [['一盏新灯', '按 X 分灯。'], ['一阵回声', '回声会复读你。'], ['第三条', '再排一条。']]) {
    hud.tip(key, text);
  }
  assert.ok(hud.queued <= 3, `提示卡不会积压成一条长龙（实测 ${hud.queued} 条）`);
  for (let i = 0; i < 4; i += 1) {
    tick(6);
    for (const key of keys(tips())) told.add(key);
  }
  for (const key of ['一盏新灯', '一阵回声', '第三条']) {
    assert.ok(told.has(key), `排着队的提示卡也该讲到「${key}」（讲过的：${[...told].join('/')}）`);
  }

  // ── 同一个标题的提示卡不该叠两张（屏幕上挂着的、和排着队的都算）──
  tick(8);
  assert.equal(cards().length, 0, '先等屏幕讲空，下面才好数');
  hud.tip('险境 · 回声', '回声里的敌人会复读你的位移。');
  assert.equal(cards().length, 1, '横带空了就该立刻上屏');
  hud.tip('险境 · 回声', '回声里的敌人会复读你的位移。');
  assert.equal(cards().length, 1, '屏幕上挂着的同一个标题不该叠第二张');
  hud.tip('终夜', '别在它起身时贴脸。');
  assert.equal(hud.queued, 1, '换个标题才排得进去');
  hud.tip('终夜', '别在它起身时贴脸。');
  assert.equal(hud.queued, 1, '排在队里的同一个标题也不该再排一条');
});

test('公告亮着的时候：整条横带归它，卡片退回队列而不是被丢掉', async (t) => {
  const { hud } = await boot(t, 'announce', true);

  const root = hud.toastRoot;
  hud.clearCards();
  const cards = () => Array.from(root.children);
  const keys = (list) => list.map((c) => c.dataset.cardKey);
  const tick = (sec) => {
    for (let i = 0; i < Math.round(sec * 60); i += 1) hud.update(1 / 60);
  };

  hud.tip('关卡 · 幽林', '光照不见的树影。');
  hud.toast('☄ 陨石雨');
  assert.equal(cards().length, 2, '公告没来时，两条车道各挂一张');

  hud.announce('首领 · 荆棘领主', true);
  assert.equal(cards().length, 0, '公告一亮，横带归它——卡片先让位');
  assert.equal(hud.queued, 2, '让位的卡片退回队列（教学讲了一半就不讲了等于白讲）');

  hud.toast('🎯 悬赏 · 燃爆');
  assert.equal(cards().length, 0, '公告还亮着的时候，新卡片也上不了屏');

  tick(3); // 2.4s 公告 + 0.3s 淡出
  const live = cards();
  assert.equal(live.length, 2, '公告讲完，卡片接着讲');
  assert.ok(
    live.some((c) => c.classList.contains('toast--tip') && c.dataset.cardKey === '关卡 · 幽林'),
    '让位的提示卡回来讲完它自己',
  );
  assert.deepEqual(keys(live.filter((c) => !c.classList.contains('toast--tip'))), ['☄ 陨石雨'], '短公告也照旧排在前头');
});

test('桌面档留 5 条、公告不打断卡片（大屏挂得下，没必要抢玩家的信息）', async (t) => {
  const { hud } = await boot(t, 'desktop');
  const root = hud.toastRoot;
  hud.clearCards();
  for (let i = 0; i < 9; i += 1) hud.toast(`公告 ${i}`);
  assert.equal(root.children.length, 5, `桌面档应留 5 条（实为 ${root.children.length}）`);
  assert.deepEqual(Array.from(root.children).map(said), ['公告 4', '公告 5', '公告 6', '公告 7', '公告 8']);
  assert.equal(hud.queued, 0, '桌面不排队：横带够宽，看得下就看得到上下文');

  hud.announce('首领 · 荆棘领主', true);
  assert.equal(root.children.length, 5, '桌面上的公告不去打断已经挂着的卡片');
});

test('开局真的跑起来：掌上档的横带不会堆成一面墙，排队的话也一句不落', async (t) => {
  const env = installDomStubs();
  pretendHandheld();
  await import(`${ENTRY.href}?v=run-${Date.now()}`);
  env.frame();
  const { game, loop, hud } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;

  const root = hud.toastRoot;
  let worst = 0;
  let worstTotal = 0;
  const told = new Set();
  for (let i = 0; i < 60 * 30; i += 1) {
    game.update(1 / 60);
    hud.update(1 / 60); // 主循环里就是这么两步
    const fresh = Array.from(root.children).filter((c) => !c.classList.contains('is-out'));
    for (const c of fresh) told.add(c.dataset.cardKey);
    worst = Math.max(worst, fresh.filter((c) => !c.classList.contains('toast--tip')).length);
    worstTotal = Math.max(worstTotal, fresh.length);
  }
  assert.ok(worst <= 1, `开局 30 秒里短公告最多同时在屏 1 条（实测峰值 ${worst} 条）`);
  assert.ok(worstTotal <= 2, `连教学卡算上也不该糊满屏幕（实测峰值 ${worstTotal} 条）`);
  assert.ok(root.children.length < 40, '挂过的卡片应该被真的摘掉，不是只标个淡出');
  // 排队不能排成"永远讲不到"：开局那几张教学卡得真的讲出来
  assert.ok(hud.queued <= 5, `排队的消息不该越积越多（实测 ${hud.queued} 条）`);
  for (const key of ['关卡 · 幽林']) {
    assert.ok(told.has(key), `开局 30 秒里「${key}」该讲出来（讲过的：${[...told].join('/') || '（空）'}）`);
  }
  assert.ok(told.size >= 4, `开局 30 秒该讲掉好几句话（实测 ${told.size} 条：${[...told].join('/')}）`);
});
