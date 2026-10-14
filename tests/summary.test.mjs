/**
 * 结算与开局引导。
 *
 * 一局结束时最该讲清楚的两件事：你是怎么没的（被谁扑灭），
 * 以及这一局到底打出了什么（灯台 / 悬赏 / 最强一击 / 燃爆）——别只丢一串击杀数给玩家。
 * 顺带盯住首局引导：只放一次，第二局不该再刷。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('结算交代与首局引导', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, ui, catalog } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;

  // ── 死因：接触伤害记下是谁 ──
  game.enemies.clear();
  const brute = game.enemies.spawn('bulwark', game.player.x + 10, game.player.y, 1, 1);
  game.enemyCtx();
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(game.lastKiller, '挨打之后要记住来源');
  assert.equal(game.lastKiller.name, '石守', `接触伤害应记下敌人名（${JSON.stringify(game.lastKiller)}）`);
  assert.ok(game.lastKiller.color.startsWith('#'), '来源要带颜色，面板才画得出高亮');

  // ── 死因：敌人子弹也认得出主人 ──
  game.lastKiller = null;
  game.enemies.clear();
  const wpn = catalog.enemies.find((e) => e.id === 'nightfall');
  assert.ok(wpn, '终夜在敌人表里');
  let owner = '';
  game.enemyCtx().shoot(0, 0, 0, 200, 5, '#fff', true, 'nightfall');
  const bullet = [...game.projectiles.all].find((p) => p.active && p.ownerId === 'nightfall');
  assert.ok(bullet, '敌人子弹应带上放它的敌人 id');
  owner = bullet.ownerId;
  assert.equal(owner, 'nightfall');
  game.player.invuln = 0;
  game.player.hp = 1e6;
  game.damagePlayer(5, game.player.x, game.player.y, 0, owner);
  assert.equal(game.lastKiller.name, '终夜', '子弹命中也要认得出是谁打的');

  // ── 死因：环境伤害说人话 ──
  game.player.invuln = 0;
  game.damagePlayer(5, game.player.x, game.player.y, 0, 'meteor');
  assert.equal(game.lastKiller.name, '陨石雨', '陨石砸死也得说得出名字');
  assert.equal(ui && typeof ui.showScreen, 'function', '界面管理器在位');

  // ── 高光：最强一击 / 燃爆 / 灯台 ──
  game.maxHit = 0;
  const dummy = game.enemies.spawn('shade', game.player.x + 120, game.player.y, 1, 1);
  game.applyHit(dummy, 321, false, 1, 0, 0);
  assert.ok(Math.abs(game.maxHit - 321) < 1e-6, `最强一击应记账（${game.maxHit}）`);
  const novasBefore = game.novaCount;
  game.hitStop = 0; // 刚才那几下挨打会留下卡帧，不清掉主循环会直接返回
  game.player.novaCd = 0;
  game.player.oil = game.player.oilMax;
  game.setInput(0, 0, false, true);
  game.enemies.clear();
  game.update(1 / 60);
  game.setInput(0, 0, false, false);
  assert.equal(game.novaCount, novasBefore + 1, '燃爆要走真实输入路径计数');

  const py = game.level.pyres[0];
  game.player.x = py.x;
  game.player.y = py.y;
  for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
  assert.equal(game.pyresLitTotal, 1, '本局点亮的灯台要累计');
  assert.ok(game.runPyres >= 3, `本局总灯台数要有分母（${game.runPyres}）`);

  // ── 本局构筑：这一局长成了什么样，结算里也该摊开 ──
  // 攒一套有代表性的：一把满级武器、一条被动、一族凑够 3 件的共鸣、外加一条夜咒
  const build = game.player;
  build.addWeapon('wisp');
  for (let i = 0; i < 4; i += 1) build.levelWeapon('wisp');
  build.addPassive('might', 3);
  build.addRelic('whetstone');
  build.addRelic('oilcan');
  build.addRelic('honeypot');
  build.addRelic('wickbrand');
  build.recomputeStats();
  const curse = handle.data.curses[0];
  game.curse = curse;
  assert.equal(build.tribeCount('oil'), 3, '灯油族应凑到 3 件');
  assert.equal(build.tribeTier('oil'), 1, '3 件应解锁第一档共鸣');

  // ── 结算面板：死因与高光都在，且没有缺字段 ──
  game.player.revives = 0;
  game.player.hp = -1;
  game.update(1 / 60);
  assert.equal(game.state, 'dead');
  const html = ui.screen.innerHTML;
  assert.ok(html.includes('灯火熄灭'), '死亡面板有标题');
  assert.ok(html.includes('陨石雨'), `死亡面板要写出死因（${game.lastKiller?.name}）`);
  assert.ok(html.includes('点亮灯台'), '结算要交代点亮的灯台');
  assert.ok(html.includes('最强一击') && html.includes('321'), '结算要展示最强一击');
  assert.ok(html.includes('完成悬赏'), '结算要交代悬赏完成数');
  assert.ok(html.includes('本局构筑'), '结算要摊开这一局的构筑');
  assert.ok(html.includes('追踪火苗'), '构筑里应写出本局的武器');
  assert.ok(html.includes('Lv 5'), '武器要带上等级');
  assert.ok(html.includes('灼心'), '构筑里应写出被动');
  for (const relic of ['磨石', '油壶', '蜜罐', '芯印']) {
    assert.ok(html.includes(relic), `构筑里应列出遗物「${relic}」`);
  }
  assert.ok(html.includes('灯火共鸣'), '凑齐一族要标出灯火共鸣');
  assert.ok(html.includes('灯油 3 件 · 1 档'), `共鸣要写清族名与件数（${(html.match(/灯油 \d+ 件 · \d 档/) ?? [''])[0]}）`);
  assert.ok(html.includes(curse.name), `背着的夜咒也要写出来（${curse.name}）`);
  for (const bad of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!html.includes(bad), `结算面板出现了 ${bad}`);
  }

  // ── 一件遗物都没有时也要留个占位符，而不是留空或露 undefined ──
  game.player.relics.clear();
  game.player.recomputeStats();
  ui.showScreen('dead');
  const bare = ui.screen.innerHTML;
  assert.ok(bare.includes('本局构筑') && bare.includes('——'), '没有遗物时应给出占位符');
  assert.ok(!/undefined|NaN|\[object Object\]/.test(bare), '空构筑也不该出现缺字段');

  // ── 首局引导：第一次跑会排队，第二局不再有 ──
  game.save.hintsSeen = false;
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  assert.ok(game.hintQueue.length >= 2, '首局应有开局引导');
  const seen = [];
  for (let i = 0; i < 60 * 30; i += 1) {
    game.enemies.clear();
    game.update(1 / 60);
    for (const h of game.hintQueue) if (!seen.includes(h.at)) seen.push(h.at);
  }
  assert.equal(game.hintQueue.length, 0, '引导应按时放完');
  assert.equal(game.save.hintsSeen, true, '放完要记进存档');

  game.newRun('warden', 'normal', false);
  assert.equal(game.hintQueue.length, 0, '第二局不该再刷引导');

  // ── 通关面板的文案不再写死"三段"（第四关加进来之后就过期了）──
  game.save.achievements = game.save.achievements.filter((a) => a !== 'conqueror');
  game.stageIndex = catalog.stages.length - 1;
  game.onStageComplete();
  assert.equal(game.state, 'victory');
  const vh = ui.screen.innerHTML;
  assert.ok(!vh.includes('三段'), '通关文案不该再写死关卡数');
  assert.ok(vh.includes('长夜之城'), '通关文案要提到终点');
  assert.ok(vh.includes('座灯台'), '通关面板要交代沿途点亮的灯台');
  for (const bad of ['undefined', 'NaN']) assert.ok(!vh.includes(bad), `通关面板出现了 ${bad}`);

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
