/**
 * HUD 卡片的分寸：不叠重复的、手机上别堆成一面墙。
 *
 * 起因是 844×390 上的实测截图：开局那几秒图鉴 / 悬赏 / 关卡卡一起冒出来，
 * 四条卡片正好盖住站在屏幕中央的玩家——玩家看不见自己，等于直接挨打。
 * 所以短公告在掌上档限 3 条（桌面 5 条），超了摘最旧的那条；
 * 但"讲一次就够"的教学提示卡不在此列：顶掉它等于教学白讲。
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

test('手机横屏：短公告最多挂 3 条，同样的话不再叠一条', async (t) => {
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
  root.innerHTML = '';
  const toasts = () => Array.from(root.children).filter((c) => !c.classList.contains('toast--tip'));

  // ── 连着弹 5 条短公告：只留最新的三条 ──
  for (let i = 0; i < 5; i += 1) hud.toast(`公告 ${i}`);
  assert.equal(toasts().length, 3, `掌上档短公告应限 3 条（实为 ${toasts().length}）`);
  assert.deepEqual(toasts().map(said), ['公告 2', '公告 3', '公告 4'], '超了先摘最旧的那条');

  // ── 同一条再弹一次不该多出一条（"图鉴 +2 条" 曾经同时出现两条）──
  hud.toast('公告 4');
  assert.equal(toasts().length, 3, '屏幕上还挂着的同样一句话不该再叠一条');

  // ── 已经在淡出的那条不再拦：那句话玩家其实已经看完了 ──
  toasts()[0].classList.add('is-out');
  hud.toast('公告 2');
  assert.equal(toasts().map(said).at(-1), '公告 2', '淡出中的卡片不该拦住同一句话再上屏');
  hud.toast('公告 2');
  assert.equal(toasts().filter((c) => said(c) === '公告 2' && !c.classList.contains('is-out')).length, 1, '同一条只该有一张');

  // ── 提示卡是教学，不参与"摘最旧" ──
  root.innerHTML = '';
  hud.tip('咒盾烛母', '它免疫灼烧，先拆盾。');
  hud.tip('终夜', '别在它起身时贴脸。');
  hud.tip('险境 · 回声', '回声里的敌人会复读你的位移。');
  for (let i = 0; i < 4; i += 1) hud.toast(`公告 ${i}`);
  const titles = Array.from(root.children).filter((c) => c.classList.contains('toast--tip'));
  assert.equal(titles.length, 3, '三张提示卡都该留在屏幕上，不被短公告顶掉');
  assert.deepEqual(titles.map((c) => c.dataset.cardKey), ['咒盾烛母', '终夜', '险境 · 回声'], '留下的还是原来的提示卡');
  assert.equal(toasts().length, 3, `短公告仍然限 3 条（实为 ${toasts().length}）`);

  // ── 同一张提示卡讲两遍也只留一张 ──
  const before = root.children.length;
  hud.tip('终夜', '别在它起身时贴脸。');
  assert.equal(root.children.length, before, '同一个标题的提示卡不该叠两张');
});

test('桌面档留 5 条（大屏挂得下，没必要抢玩家的信息）', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=desktop-${Date.now()}`);
  env.frame();
  const { game, loop, hud } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  const root = hud.toastRoot;
  root.innerHTML = '';
  for (let i = 0; i < 9; i += 1) hud.toast(`公告 ${i}`);
  assert.equal(root.children.length, 5, `桌面档应留 5 条（实为 ${root.children.length}）`);
  assert.deepEqual(Array.from(root.children).map(said), ['公告 4', '公告 5', '公告 6', '公告 7', '公告 8']);
});

test('开局真的跑起来：掌上档的短公告不会堆成一面墙', async (t) => {
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
  for (let i = 0; i < 60 * 30; i += 1) {
    game.update(1 / 60);
    const fresh = Array.from(root.children).filter((c) => !c.classList.contains('is-out'));
    worst = Math.max(worst, fresh.filter((c) => !c.classList.contains('toast--tip')).length);
    worstTotal = Math.max(worstTotal, fresh.length);
  }
  assert.ok(worst <= 3, `开局 30 秒里短公告最多同时在屏 3 条（实测峰值 ${worst} 条）`);
  assert.ok(worstTotal <= 6, `连教学卡算上也不该糊满屏幕（实测峰值 ${worstTotal} 条）`);
  assert.ok(root.children.length < 40, '挂过的卡片应该被真的摘掉，不是只标个淡出');
});
