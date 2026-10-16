/**
 * 冲刺 / 燃爆的「按下缓冲」回归测试。
 *
 * 背景（这里量到过的真实缺陷）：压力测试里机器人一秒按几十次冲刺，其中 97% 以上
 * 落在冷却里被直接吃掉——玩家看到的是"我按了，人没动"。这不是难度，是把操作丢了。
 *
 * 这一版给这两个键各加了一小段缓冲（冲刺 0.2 秒、燃爆 0.15 秒，跟着 dt 走）：
 * 冷却只差一点点的时候按下的那一下，先替他记着，冷却一转完立刻放出去。
 *
 * 这个文件盯住两条边界，缺一条缓冲就会变成"延迟施法"这种更糟的手感：
 *   1. **窗口内**：冷却是 0.1 秒时按下，冷却归零就该冲出去；
 *   2. **窗口外**：冷却是 1 秒时按下，那一下**不能**攒到 1 秒后再放——早按的那一下
 *      已经过期了，那时候玩家早就改主意了。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：血量给到打不死，怪清空，只留玩家自己。 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=buf-${tag}-${Date.now()}-${Math.random()}`);
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
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.player.oilMax = 1;
  game.player.oil = 1;
  return game;
}

/** 跑 n 帧，把冲刺/燃爆键设成给定的按下状态。 */
function run(game, n, dash, nova) {
  for (let i = 0; i < n; i += 1) {
    game.setInput(0, 0, dash, nova);
    game.update(1 / 60);
  }
}

test('冲刺缓冲：冷却只差一点点时按下的那一下，会替玩家冲出去', async (t) => {
  const game = await open(t, 'dash-in');
  const p = game.player;
  p.dashCd = 0.1; // 冷却还差 0.1 秒 —— 落在 0.2 秒的缓冲窗口里
  run(game, 1, true, false); // 按下（一帧就松开）
  assert.equal(p.dashTimer, 0, '冷却还没到，这一帧不该冲');

  run(game, 6, false, false); // 冷却归零
  assert.ok(p.dashTimer > 0, '冷却一转完，被记住的那一下应该立刻冲出去');
});

test('冲刺缓冲：早于窗口按下的那一下不该攒着，更不该过期后突然放出去', async (t) => {
  const game = await open(t, 'dash-out');
  const p = game.player;
  const firedBefore = p.dashCdMax;
  p.dashCd = 1; // 冷却还有 1 秒，远超过 0.2 秒的缓冲窗口
  run(game, 1, true, false); // 按下（一帧就松开）
  run(game, 60, false, false); // 等 1 秒：冷却归零，但缓冲早就过期了

  // 冲刺一放出去就会把 dashCdMax 设成整条冷却长度，所以它没变就说明从没冲过
  assert.equal(p.dashCdMax, firedBefore, '过期的按键不该在 1 秒后突然把玩家冲出去');
});

test('燃爆缓冲：冷却将尽时按下的那一下不会白按', async (t) => {
  const game = await open(t, 'nova-in');
  const p = game.player;
  p.novaCd = 0.05; // 落在 0.15 秒的缓冲窗口里
  run(game, 1, false, true); // 按下
  assert.ok(p.novaCd > 0 && p.novaCd < 0.1, `冷却还没到，这一帧不该放（novaCd=${p.novaCd}）`);

  run(game, 5, false, false);
  assert.ok(p.novaCdMax > 0, '冷却一转完，被记住的那一下应该立刻放出去');
});

test('燃爆缓冲：远早于窗口按下、冷却又很久的那一下，不该在冷却结束时自动放', async (t) => {
  const game = await open(t, 'nova-out');
  const p = game.player;
  p.novaCd = 3;
  p.novaCdMax = 3;
  run(game, 1, false, true); // 按下
  run(game, 200, false, false); // 等 3.3 秒，冷却归零

  assert.ok(p.novaCd <= 0, '冷却确实转完了（不然这条断言就没意义）');
  assert.equal(p.novaCdMax, 3, '缓冲过期后不该自己补放——冷却不该被重新点起');
});
