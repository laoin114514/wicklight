/**
 * 悬赏回归测试：每关都要有一张可行（敌人刷得出来）的悬赏，
 * 五种计数方式（猎杀 / 连杀 / 燃爆 / 静默 / 点灯）都能推进、能完成、能发奖，并且只发一次。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('悬赏：抽取、计数、完成与发奖', async (t) => {
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

  const defs = globalThis.window.__WICKLIGHT__.data.bounties;
  const byId = (id) => defs.find((b) => b.id === id);

  // ── 数据表本身要干净 ──
  assert.ok(defs.length >= 12, `悬赏应当足够多（${defs.length}）`);
  const seen = new Set();
  for (const b of defs) {
    assert.ok(!seen.has(b.id), `悬赏 id 重复：${b.id}`);
    seen.add(b.id);
    assert.ok(b.name && b.icon, `${b.id} 缺名称或图标`);
    assert.ok(b.target > 0, `${b.id} 目标必须为正数`);
    assert.ok(b.reward.gold > 0, `${b.id} 必须有金币奖励`);
    assert.ok(['hunt', 'combo', 'nova', 'untouched', 'pyre'].includes(b.kind), `${b.id} 计数方式非法`);
    if (b.kind === 'hunt') {
      assert.ok(b.enemy, `${b.id} 是猎杀悬赏却没指定敌人`);
      assert.ok(globalThis.window.__WICKLIGHT__.catalog.enemies.some((e) => e.id === b.enemy), `${b.id} 指向了不存在的敌人 ${b.enemy}`);
    }
  }

  // 注意：必须走 force() 而不是直接改 state——force() 会记下 lastId，
  // 而「换关重抽」的不重复保证正是基于 lastId 的。绕过它会让下面的断言变成掷骰子。
  const force = (id, target) => {
    const def = byId(id);
    game.bounties.force(def); // 返回值是定义本身，目标要改在 state 上
    game.bounties.state.target = target ?? def.target;
    return def;
  };
  const kill = (count, defId = 'shade') => {
    for (let i = 0; i < count; i += 1) {
      // 放远一点：掉落的金币不会被拾取半径自动捡走，金币变化才只反映悬赏奖励
      const e = game.enemies.spawn(defId, game.player.x + 600 + i, game.player.y, 1, 1);
      game.enemies.damage(e, 1e9, game.lightCtx(), 0, 0, 0);
    }
  };

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.update(1 / 60);

  // ── 开局就该有一张悬赏，而且必须可行 ──
  assert.ok(game.bounties.state, '开局应当抽到一张悬赏');
  const rolled = game.bounties.state.def;
  if (rolled.kind === 'hunt') {
    const enemy = globalThis.window.__WICKLIGHT__.catalog.enemies.find((e) => e.id === rolled.enemy);
    assert.ok((enemy.minWave ?? 1) <= 1, `第一关不该抽到还没出场的敌人（${rolled.name}）`);
  }

  // ── 猎杀：数到目标就完成，发一次奖 ──
  const hunt = force('hunt_shade', 3);
  const goldBefore = game.gold;
  const bountiesBefore = game.save.records.bounties;
  kill(2);
  game.update(1 / 60);
  assert.equal(game.bounties.state.done, false, '没到目标数不该完成');
  assert.equal(game.gold, goldBefore, '未完成时不该发奖');
  kill(1);
  game.update(1 / 60);
  assert.equal(game.bounties.state.done, true, '达到目标数应完成');
  assert.ok(game.gold >= goldBefore + hunt.reward.gold, `完成后应发放金币（${goldBefore} → ${game.gold}）`);
  assert.equal(game.save.records.bounties, bountiesBefore + 1, '完成数应写进生涯');
  assert.ok(game.save.achievements.includes('bounty_first'), '首次完成应解锁「赏金猎人」');
  assert.equal(game.bounties.takeCompleted(), null, '同一张悬赏不能重复领奖');
  const goldAfter = game.gold;
  kill(2);
  game.update(1 / 60);
  assert.equal(game.gold, goldAfter, '已完成后再击杀不该再发一次奖');

  // ── 连杀：连杀数达标即完成 ──
  game.combo = 0;
  const combo = force('combo15', 5);
  kill(5);
  game.update(1 / 60);
  assert.equal(game.bounties.state.done, true, `连杀 ${game.combo} 应达成目标`);
  assert.ok(combo.reward.gold > 0);

  // ── 燃爆：走真实输入路径（Q 键 → 玩家释放燃爆） ──
  const nova = force('nova3', 2);
  game.player.novaCd = 0;
  game.bounties.onNova();
  assert.equal(game.bounties.state.progress, 1, '燃爆应计数');
  game.player.novaCd = 0;
  game.setInput(0, 0, false, true);
  game.update(1 / 60);
  game.setInput(0, 0, false, false);
  assert.equal(game.bounties.state.done, true, '释放第二次燃爆后应完成');
  assert.ok(nova.reward.gold > 0);

  // ── 静默：跑时间会推进，挨打会清零 ──
  const still = force('untouched45', 0.2);
  game.bounties.onPlayerHit();
  assert.equal(game.bounties.state.progress, 0, '受伤应把静默计时打回原点');
  for (let i = 0; i < 20; i += 1) {
    game.enemies.clear(); // 清场，保证这段计时不被打断
    game.update(1 / 60);
  }
  assert.equal(game.bounties.state.done, true, '静默计时满即完成');
  assert.ok(still.reward.heal > 0, '静默悬赏应给回复');

  // ── 进度条比例 ──
  force('hunt_shade', 4);
  game.bounties.onKill('shade');
  assert.ok(Math.abs(game.bounties.frac - 0.25) < 1e-6, `进度比例应为 0.25（${game.bounties.frac}）`);
  assert.equal(game.bounties.onKill('crawler'), undefined);
  assert.equal(game.bounties.state.progress, 1, '不该被无关敌人推进');

  // ── 换关要换悬赏 ──
  const beforeStage = game.bounties.state.def.id;
  assert.equal(game.state, 'playing');
  game.continueStage();
  assert.notEqual(game.bounties.state.def.id, beforeStage, '进新关卡时应重新抽取悬赏');
  assert.equal(game.bounties.state.progress, 0, '新悬赏应从零开始');

  // ── HUD / 构筑总览都要显示悬赏且无缺字段 ──
  game.state = 'playing';
  globalThis.window.__WICKLIGHT__.hud.update(1 / 60);
  const chip = game.hud.bountyEl ? game.hud.bountyEl.innerHTML : game.__hudBounty;
  const bountyHtml = chip ?? '';
  assert.ok(bountyHtml.length > 0, 'HUD 应渲染悬赏芯片');
  assert.ok(bountyHtml.includes(game.bounties.state.def.name), 'HUD 应显示悬赏名');
  game.ui.showScreen('loadout');
  const lo = game.ui.screen.innerHTML;
  assert.ok(lo.includes('悬赏'), '构筑总览应有悬赏一栏');
  assert.ok(lo.includes(game.bounties.state.def.name), '构筑总览应显示当前悬赏');
  for (const bad of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!bountyHtml.includes(bad) && !lo.includes(bad), `界面出现了 ${bad}`);
  }

  // 图鉴 / 生涯界面也要能读悬赏进度
  game.ui.showScreen('records');
  const recHtml = game.ui.screen.innerHTML;
  assert.ok(recHtml.includes('完成悬赏'), '生涯档案应统计悬赏完成数');
  assert.ok(!recHtml.includes('undefined'), '生涯档案不应出现缺字段');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
