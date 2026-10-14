/**
 * 浏览器返回键 / 侧滑返回守卫（只管掌上设备）。
 *
 * 手机横屏时左边缘那道手势带正好压在左手拇指的活动范围里：正往左跑着，一个侧滑，
 * 浏览器直接离开页面，这一局就没了。所以战斗里要往历史里塞一条"守卫"，
 * 让返回键先撞在它上面——撞上就暂停，走不走由玩家决定。
 * 两侧都测：装守卫（会 push、会接管、不会每帧塞一条）、撤守卫（离开战斗别让玩家按两次返回），
 * 以及桌面上压根不该动历史（键盘玩家的 Alt+← 没这个毛病）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 面板根节点下的那块 screen（UIManager 动态建的，名字上拿不到，只能顺着树找）。 */
function screenText(env) {
  return String(env.getElement('ui-root').children[0]?.className ?? '');
}

test('手机上：战斗里装返回守卫，按返回只暂停不退出；离开战斗把守卫撤掉', async (t) => {
  const env = installDomStubs();
  globalThis.window.innerWidth = 900;
  globalThis.window.innerHeight = 390;
  globalThis.navigator.maxTouchPoints = 5;

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, backGuard } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  const base = env.history.length;
  assert.equal(backGuard.armed, false, '主菜单里不该动历史（还没开局呢）');

  game.newRun('warden', 'normal', false);
  assert.equal(game.state, 'playing');
  assert.equal(backGuard.armed, false, '刚开局还没走一帧，守卫是下一帧才装的');

  // 主循环每帧做的那件事
  backGuard.sync(game.state === 'playing');
  assert.equal(backGuard.armed, true, '战斗中要把守卫装进历史');
  assert.equal(env.history.length, base + 1, '守卫就是多出来的那一条历史');

  // 再走几帧：装了就别反复 push（否则历史会被塞满，返回键点十下都退不出去）
  for (let i = 0; i < 5; i += 1) backGuard.sync(true);
  assert.equal(env.history.length, base + 1, '守卫只装一次，不是每帧一条');

  // ── 玩家按下返回（侧滑）：浏览器弹掉的是守卫，popstate 由我们接住 ──
  env.history.back();
  assert.equal(game.state, 'paused', '按返回要先停在暂停面板上，不能直接丢一局');
  assert.equal(backGuard.armed, false, '接住之后就松开了：历史里我们塞的那条已经被弹掉');
  assert.ok(screenText(env).includes('is-visible'), '暂停面板得真的出来');
  const toasts = env.getElement('toast-root').children.map((c) => c.textContent).join('|');
  assert.ok(toasts.includes('暂停'), `要告诉玩家发生了什么（toast="${toasts}"）`);

  // 已经是暂停态了，同一帧的 sync 不该再装守卫（装了就变成"返回键点不动"）
  backGuard.sync(false);
  assert.equal(env.history.length, base, '暂停之后不再装守卫');
  env.history.back();
  assert.equal(env.history.length, base, '没有守卫挡着，再按返回历史也不会有别的条目冒出来');
  assert.equal(game.state, 'paused', '第二次返回我们不再接管，状态不变');

  // ── 回到战斗：守卫要重新装上；离开战斗（死了 / 回菜单）要撤掉 ──
  game.state = 'playing';
  backGuard.sync(true);
  assert.equal(backGuard.armed, true, '回去接着打，守卫要重新装上');
  assert.equal(env.history.length, base + 1);

  game.state = 'dead';
  backGuard.sync(false);
  assert.equal(backGuard.armed, false, '离开战斗要撤守卫');
  assert.equal(env.history.length, base, '撤守卫就是把多出来的那一条吃掉，别让玩家按两次返回');
  backGuard.sync(false);
  assert.equal(env.history.length, base, '撤完了也是空转，不会一直 history.back()');
});

test('桌面上：整段空转，键盘玩家不该被塞进两条历史', async (t) => {
  const env = installDomStubs(); // maxTouchPoints: 0 / 1280×720 → 桌面档
  await import(`${ENTRY.href}?v=desk-${Date.now()}`);
  env.frame();
  const { game, loop, backGuard } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  const base = env.history.length;
  for (let i = 0; i < 3; i += 1) backGuard.sync(true);
  assert.equal(env.history.length, base, '桌面上不装守卫（Alt+← 本来也不会误触）');
  assert.equal(backGuard.armed, false);
  env.history.back();
  assert.equal(game.state, 'playing', '桌面按返回不该被我们接住');
});
