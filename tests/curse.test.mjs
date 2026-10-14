/**
 * 夜咒岔口：每关的夜咒从"随机降临"改成"三条里挑一条"。
 *
 * 难度修正原本只能被动接受，玩家唯一能做的是继续或死。
 * 现在它在三条候选里选一条——风险与回报一起摆到台面上，
 * 今日灯芯（夜咒由日期定死）保持不变。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('夜咒岔口：三条候选、挑哪条降临哪条、今日灯芯不受影响', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data, ui, catalog } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  const curseIds = new Set(data.curses.map((c) => c.id));

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;

  // 第一关是教学关：不该有夜咒
  assert.equal(game.curse, null, '第一关不该施加夜咒');

  // 平掉第一关 → 补给站 → 离开 → 应该停在夜咒岔口，而不是直接开打
  game.onStageComplete();
  assert.equal(game.state, 'shop', '平掉第一关应进入补给站');
  game.leaveShop();
  assert.equal(game.state, 'curse', '离开补给站应先停在夜咒岔口');
  assert.equal(game.curseOffers.length, 3, `夜咒岔口应给出三条候选（实际 ${game.curseOffers.length}）`);

  const offers = game.curseOffers;
  assert.equal(new Set(offers.map((c) => c.id)).size, 3, '三条候选应是不同的夜咒');
  for (const c of offers) assert.ok(curseIds.has(c.id), `候选 ${c.id} 应来自夜咒表`);
  for (let i = 1; i < offers.length; i += 1) {
    assert.ok(offers[i - 1].goldMult <= offers[i].goldMult, '候选应按回报从轻到重排');
  }

  // 面板：三条都写出来，且没有缺字段
  ui.showScreen('curse');
  const html = ui.screen.innerHTML;
  for (const c of offers) assert.ok(html.includes(c.name), `岔口应列出「${c.name}」`);
  assert.ok(html.includes(String(offers[0].goldMult.toFixed(2))), '岔口应标出金币回报');
  assert.ok(!/undefined|NaN/.test(html), '夜咒岔口不该出现缺字段');

  // 挑回报最高的那条：降临的必须正是它
  const picked = offers[offers.length - 1];
  game.chooseCurse(picked.id);
  assert.equal(game.state, 'playing', '挑完夜咒应直接开打');
  assert.equal(game.stageIndex, 1, '应已推进到第二关');
  assert.equal(game.curseOffers.length, 0, '挑完应清空候选');
  assert.equal(game.curse?.id, picked.id, '降临的夜咒应是玩家挑的那条');

  // 夜咒的难度修正真的进了导演，玩家侧的回报也跟着改
  assert.equal(game.director.curse.countMult, picked.mods.countMult ?? 1, '敌人数量修正应生效');
  assert.equal(game.director.curse.hpMult, picked.mods.hpMult ?? 1, '敌人生命修正应生效');
  assert.equal(game.director.curse.dmgMult, picked.mods.dmgMult ?? 1, '敌人伤害修正应生效');
  assert.equal(game.director.curse.extraWaves, picked.mods.extraWaves ?? 0, '额外波次修正应生效');
  assert.equal(game.darknessBoost, picked.mods.darkness ?? 0, '额外黑暗修正应生效');
  assert.equal(game.player.curseOilMult, picked.mods.oilDecay ?? 1, '灯火衰减修正应生效');
  const stage = catalog.stages[1];
  assert.equal(
    game.director.totalWaves,
    stage.waves + (picked.mods.extraWaves ?? 0),
    '本关波次上限应算上夜咒',
  );
  assert.ok(game.player.hp > 0, '玩家应还活着');

  // 岔口之外再挑一次不该有副作用
  const beforeId = game.curse.id;
  game.chooseCurse(offers[0].id);
  assert.equal(game.curse.id, beforeId, '不在岔口时挑夜咒应无效');

  // ── 今日灯芯：夜咒由日期定死，不弹岔口 ──
  game.startDailyRun('2026-03-09');
  const plan = game.dailyPlan;
  assert.ok(plan, '今日灯芯应生成剧本');
  game.onStageComplete();
  assert.equal(game.state, 'shop', '今日灯芯平掉第一关同样进补给站');
  game.leaveShop();
  assert.equal(game.state, 'playing', '今日灯芯的夜咒由剧本决定，不该弹岔口');
  assert.equal(game.curse?.id, plan.curses[1], '今日灯芯的夜咒应来自剧本');

  assert.deepEqual(errors, [], `不应有 console 错误：${errors.join(' | ')}`);
});
