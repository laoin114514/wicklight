/**
 * 「重开本夜」（v274）。
 *
 * 这一条要钉住三件事，它们都是"看不出来"的那种错：
 *
 * ① **两下才生效**。这颗按钮按下去这一夜就没了，而它就挂在「继续」下面一格、
 *    和「放弃本次冒险」挨着——一下就把整夜押上去，迟早会有人把面板点掉。
 * ② **带过去的是同一局**。灯火 / 难度 / 无尽 / 深宵之约 / 今日灯芯的种子，
 *    一个都不能退化成默认值（"我今天这局重开之后怎么变成普通局了"）。
 * ③ **这一夜不结算**。重开不是"打到一半交卷"：击杀、时间、余烬、战报都不该动。
 *
 * 顺带钉住「查图鉴」那条新入口：从暂停面板进去，返回时得回到暂停面板，而不是主菜单。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function boot(t) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  return { env, game, ui: game.ui };
}

test('重开本夜：第一下只上膛，第二下才真的重开', async (t) => {
  const { game, ui } = await boot(t);

  game.newRun('warden', 'normal', false);
  game.kills = 7;
  game.runTime = 33;
  const embersBefore = game.save.embers;
  const runsBefore = game.save.runs;

  game.togglePause();
  assert.equal(game.state, 'paused');
  assert.ok(ui.screen.innerHTML.includes('重开本夜'), '暂停面板上要有这颗按钮');

  assert.equal(ui.retryNight(), false, '第一下只上膛');
  assert.equal(game.state, 'paused', '第一下不该把这一夜点掉');
  assert.equal(game.kills, 7, '第一下不该动这一局');
  assert.ok(ui.screen.innerHTML.includes('确认重开'), '上膛之后面板要写成确认态');

  assert.equal(ui.retryNight(), true, '第二下才重开');
  assert.equal(game.state, 'playing', '重开之后直接回到战斗，不用再点一次「开始」');
  assert.equal(game.kills, 0, '重开是全新的一夜');
  assert.ok(game.runTime < 1, '计时从头开始');
  assert.equal(game.save.embers, embersBefore, '这一夜不结算（不给余烬）');
  assert.equal(game.save.runs, runsBefore, '这一夜不写战报');
});

test('重开本夜：带过去的是同一盏灯火、同一档难度、同一套之约', async (t) => {
  const { game, ui } = await boot(t);

  game.newRun('warden', 'nightmare', true, null, ['dense', 'shell']);
  const seed = game.startSeed;
  game.togglePause();
  ui.retryNight(); // 上膛
  ui.retryNight(); // 重开

  assert.equal(game.state, 'playing');
  assert.equal(game.lanternId, 'warden');
  assert.equal(game.difficulty, 'nightmare', '难度不该被重开抹成默认值');
  assert.equal(game.endless, true, '无尽之夜重开之后还是无尽');
  assert.deepEqual(game.pacts, ['dense', 'shell'], '深宵之约跟着这一局走，重开不改它');
  assert.equal(game.startSeed, seed, '重开同一颗种子：这一局还是这一局，只是从头再走');
});

test('重开本夜：今日灯芯重开还是今天那道题', async (t) => {
  const { game, ui } = await boot(t);

  game.startDailyRun('2026-10-30');
  const seed = game.startSeed;
  assert.ok(game.dailyPlan, '今日灯芯要带着一份 plan');

  game.togglePause();
  ui.retryNight();
  ui.retryNight();

  assert.equal(game.state, 'playing');
  assert.ok(game.dailyPlan, '重开之后仍然是今日灯芯，不是普通局');
  assert.equal(game.startSeed, seed, '同一道题：种子由日期决定，重开不变');
  assert.equal(game.dailyPlan.key, '2026-10-30');
});

test('重开本夜：换进暂停面板才清掉上膛，回去接着打再按仍然要两下', async (t) => {
  const { game, ui } = await boot(t);

  game.newRun('warden', 'normal', false);
  game.togglePause();
  ui.retryNight(); // 上膛
  game.togglePause(); // 回去接着打
  assert.equal(game.state, 'playing');

  game.togglePause(); // 又暂停
  assert.equal(ui.retryNight(), false, '重新进暂停面板，按钮该退回未上膛');
  assert.equal(game.state, 'paused');
});

test('查图鉴：从暂停面板进去，回来还在暂停面板', async (t) => {
  const { game, ui } = await boot(t);

  game.newRun('warden', 'normal', false);
  game.togglePause();
  ui.openCodex();
  assert.equal(game.state, 'codex', '暂停面板能打开图鉴');

  // 返回键那一下在无头桩件里点不到（innerHTML 只是字符串），
  // 但"回到暂停面板"这件事本身是一屏：能画出来、而且画的还是这一局的暂停面板。
  game.openMenu('paused');
  assert.equal(game.state, 'paused');
  assert.ok(ui.screen.innerHTML.includes('夜巡暂歇'), '回到的是暂停面板，不是主菜单');
  assert.ok(ui.screen.innerHTML.includes('本夜已守'), '暂停面板还带着这一局的时钟');
});

test('查图鉴：从主菜单进去，回来还是主菜单', async (t) => {
  const { game, ui } = await boot(t);

  game.bootDone();
  game.goMenu();
  ui.openCodex();
  assert.equal(game.state, 'codex');
  game.openMenu('menu');
  assert.ok(ui.screen.innerHTML.includes('开始冒险'), '主菜单那条路不该被改到暂停面板上');
});
