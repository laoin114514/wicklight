/**
 * 生涯档案回归测试：结算必须同时落进"纪录 / 灯火战绩 / 最近对局"三处，
 * 通关要给余烬（旧版本通关反而不结算），成就奖励要真的发到余烬上。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const KEY = 'wicklight.save.v1';

test('生涯档案：结算、纪录与成就奖励', async (t) => {
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

  game.bootDone();
  game.resetSave();

  // ── 全新存档：纪录全 0、战报为空 ──
  const rec = game.records.data;
  assert.equal(rec.bestCombo, 0);
  assert.equal(rec.bestKills, 0);
  assert.equal(rec.bestTime, 0);
  assert.equal(rec.clearedRuns, 0);
  assert.equal(rec.totalTime, 0);
  assert.deepEqual(game.save.history, []);
  assert.deepEqual(rec.lanterns, {});

  // ── 成就奖励：每条都得有余烬，解锁时真的进账 ──
  for (const a of game.achievements.def ? Object.values(game.achievements.def) : []) {
    assert.ok((a.embers ?? 0) > 0, `成就「${a.name}」应带余烬奖励`);
  }
  const embersBefore = game.save.embers;
  game.achievements.unlock('first_blood');
  assert.equal(game.save.embers, embersBefore + 10, '解锁成就应发放余烬');
  assert.equal(game.achievementEmbers, 10, '成就余烬应单独计数');
  game.achievements.unlock('first_blood');
  assert.equal(game.save.embers, embersBefore + 10, '重复解锁不应重复发奖');

  // ── 死亡结算：写入战报、刷新纪录 ──
  game.resetSave();
  game.newRun('warden', 'normal', false);
  game.kills = 42;
  game.bestCombo = 17;
  game.playerLevel = 6;
  game.damageDealt = 5000;
  game.runTime = 123;
  game.player.revives = 0;
  game.player.hp = -1;
  game.state = 'playing';
  game.update(1 / 60);

  assert.equal(game.state, 'dead');
  assert.equal(game.runOutcome, 'defeat');
  assert.ok(game.embersEarned > 0, '死亡也该结算余烬');

  const afterDeath = game.records.data;
  assert.equal(afterDeath.bestKills, 42, '单局击杀应记为纪录');
  assert.equal(afterDeath.bestCombo, 17, '最高连杀应记为纪录');
  assert.equal(afterDeath.bestLevel, 6);
  assert.equal(afterDeath.bestDamage, 5000);
  assert.equal(afterDeath.bestEmbers, game.embersEarned);
  assert.equal(afterDeath.clearedRuns, 0, '死亡不算通关');
  assert.ok(Math.abs(afterDeath.totalTime - 123) < 0.05, `累计守夜时长应累加（${afterDeath.totalTime}）`);

  const hist = game.save.history;
  assert.equal(hist.length, 1, '应写入一条战报');
  assert.equal(hist[0].kills, 42);
  assert.equal(hist[0].lantern, 'warden');
  assert.equal(hist[0].difficulty, 'normal');
  assert.equal(hist[0].cleared, false);
  assert.equal(hist[0].stage, 1);
  assert.ok(hist[0].at > 0, '战报应带时间戳');

  const warden = game.records.lantern('warden');
  assert.equal(warden.runs, 1, '灯火战绩应记一局');
  assert.equal(warden.bestStage, 1);
  assert.equal(warden.bestKills, 42);
  assert.equal(warden.cleared, 0);

  // 首局刷新了纪录 → 结算界面必须拿到徽章
  assert.ok(game.recordHighlights.length >= 3, `首局应刷出多条新纪录（${game.recordHighlights.length}）`);
  const hlLabels = game.recordHighlights.map((h) => h.label);
  assert.ok(hlLabels.includes('单局击杀') && hlLabels.includes('最高连杀'));

  // 第二局更差：不该覆盖纪录，也不该再发同类徽章
  game.newRun('warden', 'normal', false);
  assert.deepEqual(game.recordHighlights, [], '新的一局应清空徽章');
  assert.equal(game.achievementEmbers, 0, '新的一局应重置成就余烬计数');
  game.kills = 3;
  game.bestCombo = 2;
  game.player.revives = 0;
  game.player.hp = -1;
  game.state = 'playing';
  game.update(1 / 60);
  assert.equal(game.records.data.bestKills, 42, '更差的一局不应覆盖纪录');
  assert.ok(!game.recordHighlights.some((h) => h.label === '单局击杀'), '没破纪录就不该给徽章');
  assert.equal(game.save.history.length, 2, '战报应继续累积');
  assert.equal(game.save.history[0].kills, 3, '最新的战报排在最前');

  // ── 通关结算：给余烬、记通关、最快通关时间 ──
  const lastStage = globalThis.window.__WICKLIGHT__.catalog.stages.length - 1;
  game.newRun('lamplighter', 'normal', false);
  game.stageIndex = lastStage;
  game.runTime = 90;
  game.kills = 10;
  game.onStageComplete();
  assert.equal(game.state, 'victory');
  assert.equal(game.runOutcome, 'clear');
  assert.ok(game.embersEarned > 0, '通关必须结算余烬（旧版本这里是 0）');
  assert.equal(game.records.data.clearedRuns, 1, '通关应记一次');
  assert.equal(game.records.data.bestTime, 90, '应记录最快通关时间');
  assert.equal(game.save.history[0].cleared, true, '战报应标记通关');
  assert.equal(game.records.lantern('lamplighter').cleared, 1);
  assert.equal(game.records.lantern('lamplighter').bestTime, 90);

  // 更慢的通关不该刷新最快时间
  game.newRun('lamplighter', 'normal', false);
  game.stageIndex = lastStage;
  game.runTime = 400;
  game.onStageComplete();
  assert.equal(game.records.data.bestTime, 90, '更快的那次才该保留');
  assert.ok(!game.recordHighlights.some((h) => h.label === '最快通关'), '更慢的通关不该给徽章');

  // ── 生涯类成就 ──
  assert.ok(game.save.runs >= 4, `累计局数应被统计（${game.save.runs}）`);

  // ── 界面：生涯档案渲染干净、含全部灯火、战报不为空 ──
  game.ui.showScreen('records');
  const html = game.ui.screen.innerHTML;
  for (const needle of ['生涯档案', '个人纪录', '灯火战绩', '最近对局', '累计击杀', '最高连杀']) {
    assert.ok(html.includes(needle), `生涯档案缺少「${needle}」`);
  }
  for (const bad of ['undefined', 'NaN', '[object Object]', '${']) {
    assert.ok(!html.includes(bad), `生涯档案界面出现了 ${bad}`);
  }
  assert.ok((html.match(/class="rec-lantern/g) ?? []).length >= 4, '应列出全部灯火');

  // ── 存档：records/history 落盘，重新读也是同一份 ──
  const raw = globalThis.localStorage.getItem(KEY);
  assert.ok(raw, '存档应写入 localStorage');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.records.bestKills, 42, '纪录应写进存档');
  assert.equal(parsed.history.length, game.save.history.length, '战报应写进存档');
  assert.equal(parsed.history[0].cleared, true);

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});

test('老存档缺 records/history 字段也能平滑升级', async (t) => {
  const env = installDomStubs();
  // 模拟一份 v2 存档：有图鉴，没有任何生涯字段
  globalThis.localStorage.setItem(
    KEY,
    JSON.stringify({ version: 1, embers: 40, unlockedLanterns: ['warden'], meta: [], achievements: ['first_blood'], best: 2, runs: 5, killsTotal: 300, codex: ['enemy:shade'] }),
  );

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now() + 1}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  const rec = game.records.data;
  assert.equal(rec.bestCombo, 0, '缺失的纪录应补成 0');
  assert.deepEqual(game.save.history, [], '缺失的战报应补成空数组');
  assert.equal(game.save.embers, 40, '已有字段不能被迁移覆盖');
  assert.equal(game.save.runs, 5);
  assert.deepEqual(game.save.codex, ['enemy:shade'], '图鉴数据应保留');

  game.ui.showScreen('records');
  const html = game.ui.screen.innerHTML;
  for (const bad of ['undefined', 'NaN', '${']) {
    assert.ok(!html.includes(bad), `迁移后的生涯界面出现了 ${bad}`);
  }
  assert.ok(html.includes('还没有战报'), '没有记录时应显示空状态文案');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
