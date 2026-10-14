/**
 * 今日灯芯回归测试：同一个日期必须推出同一个夜晚（否则"比较"就无从谈起），
 * 剧本里的每一步都得真的落到局内，成绩要记次数、留最好的一次，跨天要重置。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const KEY = 'wicklight.save.v1';

test('今日灯芯：剧本确定、强制生效、成绩记录', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  const { buildDailyPlan, dailyKey, dailyScore } = globalThis.window.__WICKLIGHT__.daily;
  const data = globalThis.window.__WICKLIGHT__.data;
  const catalog = globalThis.window.__WICKLIGHT__.catalog;

  // ── 纯函数的确定性 ──
  const a = buildDailyPlan('2026-03-09');
  const b = buildDailyPlan('2026-03-09');
  const c = buildDailyPlan('2026-03-10');
  assert.deepEqual(a, b, '同一天的剧本必须完全一致');
  assert.notEqual(a.seed, c.seed, '不同日期的种子应当不同');
  assert.equal(dailyKey(new Date(2026, 2, 9)), '2026-03-09', '日期 key 形如 YYYY-MM-DD');

  // ── 剧本本身要合法、可行 ──
  for (const plan of [a, c, buildDailyPlan('2027-12-31')]) {
    assert.equal(plan.curses.length, 3, '三关都要有安排');
    assert.equal(plan.bounties.length, 3);
    assert.equal(plan.curses[0], null, '第一关不施加夜咒');
    for (const id of plan.curses.slice(1)) assert.ok(id && globalThis.window.__WICKLIGHT__.data.curses.some((x) => x.id === id), `夜咒不存在：${id}`);
    plan.bounties.forEach((id, stage) => {
      const def = data.bounties.find((x) => x.id === id);
      assert.ok(def, `悬赏不存在：${id}`);
      if (def.kind === 'hunt') {
        const enemy = catalog.enemies.find((e) => e.id === def.enemy);
        assert.ok((enemy.minWave ?? 1) <= 1 + stage, `第 ${stage + 1} 关的猎杀目标还没出场：${def.id}`);
      }
    });
  }

  // ── 开局：剧本真的落到局内 ──
  game.bootDone();
  game.resetSave();
  const plan = buildDailyPlan('2026-03-09');
  game.startDailyRun('2026-03-09');

  assert.ok(game.dailyPlan, '应当记住这是今日灯芯');
  assert.equal(game.state, 'playing');
  assert.equal(game.startSeed, plan.seed, '今日灯芯用日期派生的种子');
  assert.equal(game.lanternId, plan.lantern, '灯火由剧本指定');
  assert.equal(game.difficulty, plan.difficulty, '难度由剧本指定');
  assert.equal(game.curse, null, '第一关没有夜咒');
  assert.equal(game.bounties.state.def.id, plan.bounties[0], '第一关悬赏来自剧本');

  // ── 进第二关：夜咒与悬赏同样来自剧本 ──
  game.continueStage();
  assert.ok(game.curse, '第二关应有夜咒');
  assert.equal(game.curse.id, plan.curses[1], `第二关夜咒应来自剧本（实际 ${game.curse.id}）`);
  assert.equal(game.bounties.state.def.id, plan.bounties[1], '第二关悬赏来自剧本');

  // ── 同一份剧本重开：种子相同 ──
  game.startDailyRun('2026-03-09');
  assert.equal(game.startSeed, plan.seed, '重开同一日应当得到同一种子');

  // ── 成绩：记次数、只留最好的一次 ──
  const die = (kills) => {
    game.kills = kills;
    game.player.revives = 0;
    game.player.hp = -1;
    game.state = 'playing';
    game.update(1 / 60);
  };

  game.startDailyRun('2026-03-09');
  die(10);
  let d = game.save.daily;
  assert.equal(d.key, '2026-03-09', '成绩应挂在剧本那一天');
  assert.equal(d.attempts, 1, '应记录尝试次数');
  assert.ok(d.bestScore > 0, '应记录得分');
  assert.equal(d.bestStage, 1);
  assert.equal(d.bestKills, 10);
  assert.equal(d.cleared, false);
  assert.equal(game.dailyBest, true, '第一局必然是个人最好');
  const first = d.bestScore;
  assert.equal(
    first,
    dailyScore({ kills: 10, stage: 1, level: 1, bossKills: 0, cleared: false }),
    '得分算法应与结算一致',
  );

  game.startDailyRun('2026-03-09');
  assert.equal(game.dailyScore, 0, '新的一局应清空上一局得分');
  die(1);
  d = game.save.daily;
  assert.equal(d.attempts, 2, '尝试次数应累加');
  assert.equal(d.bestScore, first, '更差的一局不该覆盖最好成绩');
  assert.equal(game.dailyBest, false, '没破纪录就不该标新纪录');

  game.startDailyRun('2026-03-09');
  game.kills = 120;
  game.stageIndex = 2;
  game.onStageComplete();
  d = game.save.daily;
  assert.equal(d.attempts, 3);
  assert.ok(d.bestScore > first, `通关局应当刷新最好成绩（${first} → ${d.bestScore}）`);
  assert.equal(d.cleared, true, '通关要记下来');
  assert.equal(d.bestLantern, plan.lantern);
  assert.equal(game.dailyBest, true);

  // 今日灯芯也会进"最近对局"，并带上标记
  assert.equal(game.save.history[0].daily, true, '战报应标记这是今日灯芯');
  assert.equal(game.save.history[0].cleared, true);

  // ── 跨天重置 ──
  game.save.daily.key = '2000-01-01';
  const fresh = game.dailySave();
  assert.equal(fresh.key, dailyKey(), '跨天后应换成今天的记录');
  assert.equal(fresh.attempts, 0, '新的一天从 0 开始');
  assert.equal(fresh.bestScore, 0);

  // ── 界面 ──
  game.ui.showScreen('daily');
  const html = game.ui.screen.innerHTML;
  for (const needle of ['今日灯芯', '灯火', '难度', '夜咒', '悬赏', '点燃今日灯芯']) {
    assert.ok(html.includes(needle), `今日灯芯界面缺少「${needle}」`);
  }
  for (const bad of ['undefined', 'NaN', '[object Object]', '${']) {
    assert.ok(!html.includes(bad), `今日灯芯界面出现了 ${bad}`);
  }
  game.ui.showScreen('records');
  assert.ok(game.ui.screen.innerHTML.includes('今日灯芯'), '生涯档案应带今日灯芯成绩');

  // ── 存档 ──
  const parsed = JSON.parse(globalThis.localStorage.getItem(KEY));
  assert.ok(parsed.daily, '成绩应写进存档');
  assert.equal(parsed.daily.key, dailyKey());

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});

test('老存档缺 daily 字段也能平滑升级', async (t) => {
  const env = installDomStubs();
  globalThis.localStorage.setItem(KEY, JSON.stringify({ version: 1, embers: 5, best: 1, runs: 2, codex: [] }));

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now() + 3}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  assert.equal(game.save.daily.key, '', '缺失的 daily 应补成默认值');
  assert.equal(game.save.embers, 5, '已有字段不能被迁移覆盖');
  const d = game.dailySave();
  assert.equal(d.key, globalThis.window.__WICKLIGHT__.daily.dailyKey(), '读取时应落到今天');
  game.ui.showScreen('daily');
  assert.ok(game.ui.screen.innerHTML.includes('今日灯芯'), '迁移后界面仍应正常');
  assert.ok(!game.ui.screen.innerHTML.includes('undefined'), '迁移后不该出现缺字段');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
