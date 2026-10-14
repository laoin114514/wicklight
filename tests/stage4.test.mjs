/**
 * 第四关（长夜之城）回归：新关卡真的接进了流程与图鉴，
 * 新首领「终夜」的三段式招式（抽灯火 / 召唤回响 / 脚下结雾）真的会放出来，
 * 新险境「回声涌来」真的会刷出回响。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('第四关与首领「终夜」', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, catalog } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;

  // ── 关卡表：四关、最后一关是新关卡 ──
  assert.ok(catalog.stages.length >= 4, `关卡数量偏少（${catalog.stages.length}）`);
  const last = catalog.stages[catalog.stages.length - 1];
  assert.equal(last.id, 'nightcity', '最后一关应是长夜之城');
  assert.equal(last.boss, 'nightfall', '长夜之城的首领应是终夜');
  assert.ok(last.hazards.includes('echoes'), '长夜之城应有「回声涌来」险境');
  assert.ok(last.waves >= 9, '终局关卡的波次不该比前面少');
  const night = catalog.enemies.find((e) => e.id === 'nightfall');
  assert.ok(night && night.boss && night.phases === 3, '终夜应是三相位首领');
  assert.ok(night.note && night.note.length > 0, '图鉴里应写明终夜的打法');

  // ── 图鉴自动收录新关卡与新首领，险境名称可读 ──
  assert.ok(game.codex.entry('stage:nightcity'), '图鉴应收录长夜之城');
  const stageEntry = game.codex.entry('stage:nightcity');
  assert.ok(stageEntry.rows.some(([, v]) => v.includes('回声涌来')), '关卡的险境应写出「回声涌来」而不是原始 id');
  assert.ok(game.codex.entry('enemy:nightfall'), '图鉴应收录终夜');
  assert.ok(game.codex.total() >= 115, `图鉴条目应随内容增长（${game.codex.total()}）`);

  // ── 险境「回声涌来」：真的刷出回响 ──
  game.enemies.clear();
  game.handleHazard('echoes');
  const echoes = [];
  game.enemies.forEach((e) => {
    if (e.defId === 'echo') echoes.push(e);
  });
  assert.ok(echoes.length >= 2, `回声涌来应刷出至少 2 只回响（实际 ${echoes.length}）`);
  for (const e of echoes) {
    assert.ok(Math.hypot(e.x - game.player.x, e.y - game.player.y) > 200, '回响不该刷在脸上');
  }

  // ── 首领招式：抽灯火 + 召唤回响 + 脚下结雾 ──
  game.enemies.clear();
  game.grounds.length = 0;
  const boss = game.enemies.spawn('nightfall', game.player.x + 320, game.player.y, 1, 1);
  boss.hp = boss.maxHp * 0.25; // 直接进入第三相位
  boss.bossCd = 0; // 首领招式有独立计时器，不受普通攻击节奏影响
  game.player.oil = 1;
  const oilBefore = game.player.oil;
  for (let i = 0; i < 12; i += 1) game.enemies.update(1 / 60, game.enemyCtx());
  assert.equal(boss.phase, 3, '低血量的终夜应处于第三相位');
  assert.ok(game.player.oil < oilBefore, '终夜应抽走灯火');
  assert.ok(game.grounds.some((g) => g.kind === 'mud'), '第三相位的终夜应在玩家脚下结出滞行雾');
  let summons = 0;
  game.enemies.forEach((e) => {
    if (e.defId === 'echo') summons += 1;
  });
  assert.ok(summons >= 1, `终夜应召唤回响（实际 ${summons}）`);
  let shots = 0;
  for (const p of game.projectiles.all) if (p.active && !p.fromPlayer) shots += 1;
  assert.ok(shots > 0, '终夜应打出弹幕');

  // ── 首领专属招式不该被"贴脸时的普攻"挤掉（焚天曾经会这样）──
  game.enemies.clear();
  game.grounds.length = 0;
  const ember = game.enemies.spawn('emberwake', game.player.x + 150, game.player.y, 1, 1);
  ember.bossCd = 0;
  for (let i = 0; i < 12; i += 1) game.enemies.update(1 / 60, game.enemyCtx());
  let emberShots = 0;
  for (const p of game.projectiles.all) if (p.active && !p.fromPlayer) emberShots += 1;
  assert.ok(emberShots > 0, '贴脸的焚天同样应该放出环形火幕');

  // ── 击败终夜与通关结算 ──
  game.enemies.clear();
  const doomed = game.enemies.spawn('nightfall', 400, 0, 1, 1);
  game.enemies.damage(doomed, 1e9, game.lightCtx(), 0, 0, 0);
  assert.ok(game.save.achievements.includes('nightfall_king'), '击败终夜应解锁「长夜终有尽」');

  game.save.achievements = game.save.achievements.filter((a) => a !== 'conqueror');
  game.newRun('warden', 'normal', false);
  game.stageIndex = catalog.stages.length - 1;
  game.onStageComplete();
  assert.equal(game.state, 'victory', '打完最后一关应进入胜利结算');
  assert.ok(game.save.achievements.includes('conqueror'), '通关全部关卡应解锁「焚尽长夜」');
  assert.equal(game.save.best, catalog.stages.length, '最好成绩应按关卡总数记录');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
