/**
 * 灯台回归测试：每关都散落着若干熄灭的石灯，站在旁边能点燃；
 * 点亮会换来长明（视野）、余温（伤害 / 灯火）与一波被惊动的东西，
 * 走开则进度回落；点亮全部会有成就，点灯也能推进悬赏。
 * 顺带盯住一条真会出事的细节：HUD 的关卡名不该只认得前三关。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('灯台：探索目标、点燃与长明', async (t) => {
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
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;

  // ── 关卡里真的有灯台，而且都在"要跑一趟"的距离上 ──
  const pyres = game.level.pyres;
  assert.ok(pyres.length >= 3, `每关应散布若干灯台（${pyres.length}）`);
  assert.equal(game.pyreTotal, pyres.length, 'HUD 用的总数应与关卡一致');
  for (const py of pyres) {
    assert.ok(Math.hypot(py.x, py.y) > 500, '灯台不该生在出生点旁边');
    assert.ok(!py.lit && py.progress === 0, '灯台开局应是熄灭的');
  }
  for (let i = 0; i < pyres.length; i += 1) {
    for (let j = i + 1; j < pyres.length; j += 1) {
      const d = Math.hypot(pyres[i].x - pyres[j].x, pyres[i].y - pyres[j].y);
      assert.ok(d > 640, `灯台之间应彼此散开（${Math.round(d)}）`);
    }
  }
  // 终局关多给一座：最后一关最值得走一趟
  game.loadStage(catalog.stages[catalog.stages.length - 1], catalog.stages.length - 1, false);
  assert.ok(game.level.pyres.length > pyres.length, '长夜之城应比前面多一座灯台');

  // ── 回到第一关，站在灯台旁边点火 ──
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  const target = game.level.pyres[0];
  game.player.x = target.x;
  game.player.y = target.y;
  game.player.oil = game.player.oilMax * 0.5; // 先把灯油用掉一半，才看得出"点燃会补油"

  const dmgBefore = game.player.stats.damageMult;
  const lightBefore = game.player.pyreMods.lightMult;
  const oilBefore = game.player.oil;
  const goldBefore = game.gold;

  game.updatePyres(1 / 60);
  assert.ok(target.progress > 0 && target.progress < 1, `站在旁边应开始点燃（${target.progress}）`);
  assert.equal(target.lit, false, '刚站上去不该立刻点亮');

  for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
  assert.equal(target.lit, true, '停留足够久应点亮灯台');
  assert.equal(game.pyresLit, 1, '已点亮计数应加上');
  assert.ok(game.player.stats.damageMult > dmgBefore, '点燃后伤害应提高');
  assert.ok(game.player.pyreMods.lightMult > lightBefore, '点燃后灯火应更旺');
  assert.ok(game.player.oil > oilBefore, '点燃应补灯油');
  assert.ok(game.gold > goldBefore, '点燃应给金币');
  assert.ok(game.save.achievements.includes('pyre_first'), '首次点灯应解锁「点灯人」');
  assert.ok(game.enemies.count > 0, '点燃的动静应把黑暗里的东西叫过来');

  // 长明的灯台自己就是一处光源（之后可以退守）
  let litLights = 0;
  const origAdd = game.light.addLight;
  game.light.addLight = function spy(...a) {
    litLights += 1;
    return origAdd.apply(this, a);
  };
  game.updatePyres(1 / 60);
  game.light.addLight = origAdd;
  assert.ok(litLights >= 1, '点亮的灯台应持续提供光照');

  // ── 走开：进度回落，熄灭的灯台不该自己亮 ──
  const second = game.level.pyres.find((p) => !p.lit && p !== target);
  game.player.x = second.x;
  game.player.y = second.y;
  game.updatePyres(0.4);
  const partial = second.progress;
  assert.ok(partial > 0 && partial < 1, '中途离开时应停在半途');
  game.player.x = 0;
  game.player.y = 0;
  game.updatePyres(0.3);
  assert.ok(second.progress < partial, '离开后点燃进度应回落');
  assert.equal(second.lit, false, '没点满不该点亮');

  // ── 走真实 update 路径也要能点着（挂载点没被改坏）──
  game.enemies.clear();
  game.player.x = second.x;
  game.player.y = second.y;
  for (let i = 0; i < 90; i += 1) {
    game.enemies.clear();
    game.update(1 / 60);
  }
  assert.equal(second.lit, true, '通过主循环也应该能点亮灯台');

  // ── 点亮本关全部灯台：成就 ──
  for (const py of game.level.pyres) {
    game.player.x = py.x;
    game.player.y = py.y;
    for (let i = 0; i < 90; i += 1) game.updatePyres(1 / 60);
  }
  assert.equal(game.pyresLit, game.pyreTotal, '应把本关灯台全部点亮');
  assert.ok(game.save.achievements.includes('pyre_all'), '点亮全部灯台应解锁「长夜灯塔」');

  // ── 悬赏：点灯也能推进 ──
  const defs = handle.data.bounties;
  const pyreDef = defs.find((b) => b.id === 'pyre3');
  assert.ok(pyreDef && pyreDef.kind === 'pyre', '应有「点灯」类悬赏');
  game.bounties.force(pyreDef);
  game.bounties.onPyre();
  game.bounties.onPyre();
  assert.equal(game.bounties.state.done, false, '没到目标数不该完成');
  assert.ok(game.bounties.frac > 0, '点灯应推进悬赏进度条');
  game.bounties.onPyre();
  assert.equal(game.bounties.state.done, true, '点亮 3 座应完成点灯悬赏');

  // ── 图鉴：关卡的灯台可查 ──
  for (const s of catalog.stages) {
    const entry = game.codex.entry(`stage:${s.id}`);
    assert.ok(entry, `图鉴应收录关卡 ${s.id}`);
    assert.ok(
      entry.rows.some(([k, v]) => k === '灯台' && v.includes(`${s.pyres ?? 3} 座`)),
      `${s.id} 的图鉴应写出灯台数量`,
    );
  }

  // ── HUD：灯台进度 + 关卡名（第四关以前会显示空白）──
  game.ui.showScreen('playing');
  game.hud.update(1 / 60);
  const chip = game.hud.pyreEl.innerHTML;
  assert.ok(chip.includes('灯台'), 'HUD 应显示灯台进度');
  assert.ok(!chip.includes('undefined') && !chip.includes('NaN'), '灯台芯片不应出现缺字段');
  assert.equal(game.hud.stageEl.textContent, '幽林', '第一关关卡名');
  game.loadStage(catalog.stages[catalog.stages.length - 1], catalog.stages.length - 1, false);
  game.hud.update(1 / 60);
  assert.equal(game.hud.stageEl.textContent, '长夜之城', '最后一关的关卡名不该是空白');
  assert.ok(game.hud.pyreEl.innerHTML.includes('灯台'), '新关卡的灯台芯片应重新出现');

  // ── 画面：有灯台在屏外时渲染不应炸 ──
  game.player.x = 0;
  game.player.y = 0;
  game.render();
  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
