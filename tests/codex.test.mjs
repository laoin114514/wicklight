/**
 * 图鉴回归测试：条目总数必须等于数据表总和、发现流程可复现、
 * 且"已发现 / 未发现"在界面上确实区分得出来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('图鉴：目录完整、发现流程与界面区分', async (t) => {
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

  // ── 目录完整性：每条都要有名字和说明，且不能重复 ──
  const seen = new Set();
  for (const e of game.codex.entries) {
    const key = `${e.kind}:${e.id}`;
    assert.ok(!seen.has(key), `图鉴条目重复：${key}`);
    seen.add(key);
    assert.equal(typeof e.name, 'string', `${key} 缺名称`);
    assert.ok(e.name.length > 0, `${key} 名称为空`);
    assert.ok(e.blurb && e.blurb.length > 0, `${key} 缺说明文字（界面上会留白）`);
  }
  assert.equal(game.codex.total(), game.codex.entries.length, '总数与目录一致');
  assert.ok(game.codex.total() >= 95, `图鉴条目应当足够丰富（${game.codex.total()}）`);

  // 每个分类都得有条目，否则界面上会出现空标题
  for (const section of ['enemy', 'weapon', 'relic', 'passive', 'curse', 'affix', 'lantern', 'stage']) {
    assert.ok(game.codex.sectionTotal(section) > 0, `${section} 分类为空`);
  }

  // ── 新存档：一条都没发现，界面上应该全是问号 ──
  game.resetSave();
  game.newRun('warden', 'normal', false);
  // 开局扫描会记录灯火 / 关卡 / 初始武器 —— 那是设计如此
  const baseline = game.codex.seenCount();
  assert.ok(baseline >= 3, `开局应记录灯火/关卡/初始武器（实际 ${baseline}）`);
  assert.ok(!game.codex.has('enemy', 'shade'), '开局不该已经发现敌人');

  const lockedHtml = (game.ui.screen.innerHTML = '', game.ui.showScreen('codex'), game.ui.screen.innerHTML);
  assert.ok(lockedHtml.includes('？？？'), '未发现条目应显示为问号');
  assert.ok(lockedHtml.includes('尚未发现'), '未发现条目应有提示');
  assert.ok(!lockedHtml.includes('undefined') && !lockedHtml.includes('NaN'), '图鉴界面不应出现缺字段');

  // ── 击杀敌人后该条被发现，且界面立刻显示真名与说明 ──
  const shade = game.enemies.spawn('shade', game.player.x + 40, game.player.y, 1, 1);
  // 敌人管理器是在 update() 里拿到回调上下文的，所以先跑一帧再结算伤害
  game.update(1 / 60);
  game.enemies.damage(shade, 1e9, game.lightCtx(), 0, 0, 0);
  assert.ok(game.codex.has('enemy', 'shade'), '击杀后应记录该敌人');
  const foundHtml = (game.ui.showScreen('codex'), game.ui.screen.innerHTML);
  assert.ok(foundHtml.includes('影蛭'), '已发现条目应显示真名');
  assert.ok(foundHtml.includes('最普通的夜行者'), '已发现条目应显示说明');

  // ── 武器 / 被动 / 遗物的发现走的是"扫描玩家状态"这条路 ──
  game.player.addWeapon('wisp');
  game.player.addPassive('might', 1);
  game.player.addRelic('whetstone');
  // 扫描按 0.75 秒节流，跑够时间才会命中（这是刻意的设计）
  for (let i = 0; i < 50; i += 1) game.update(1 / 60);
  assert.ok(game.codex.has('weapon', 'wisp'), '新武器应被扫描到');
  assert.ok(game.codex.has('passive', 'might'), '新被动应被扫描到');
  assert.ok(game.codex.has('relic', 'whetstone'), '新遗物应被扫描到');

  // ── 发现是幂等的，且写进了存档 ──
  const before = game.codex.seenCount();
  game.codex.discover('enemy', 'shade');
  assert.equal(game.codex.seenCount(), before, '重复发现不应增加计数');
  assert.ok(game.save.codex.includes('enemy:shade'), '发现结果应写入存档');
  assert.equal(game.save.codex.length, game.codex.seenCount(), '存档条目数应与已知数一致');

  assert.equal(errors.length, 0, `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
