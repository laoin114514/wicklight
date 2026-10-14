/**
 * v7 内容回归：回响 / 织雾者 / 噬灯魅 / 疾影四种新敌人，
 * 以及「蚀油 / 噬魂 / 荆棘」词缀与「低语 / 枯灯」夜咒。
 * 每条断言都对应一个真实可达的游戏行为，避免内容加进表里却其实不工作。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('新敌人 / 词缀 / 夜咒（回响 · 织雾者 · 噬灯魅）', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, data, catalog } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;

  // ── 数据表 ──
  for (const [id, behavior] of [
    ['skitter', 'dash'],
    ['echo', 'echo'],
    ['weaver', 'weaver'],
    ['siphon', 'siphon'],
  ]) {
    const def = catalog.enemies.find((e) => e.id === id);
    assert.ok(def, `应存在敌人 ${id}`);
    assert.equal(def.behavior, behavior, `${id} 应使用 ${behavior} 行为`);
    assert.ok(def.note && def.note.length > 0, `${id} 应有图鉴说明`);
  }
  assert.ok(catalog.enemies.find((e) => e.id === 'siphon').elite, '噬灯魅应为精英');
  for (const id of ['sappers', 'fell', 'thorn']) {
    const aff = catalog.affixes.find((a) => a.id === id);
    assert.ok(aff && aff.blurb, `应存在词缀 ${id}`);
  }
  const whisper = data.curses.find((c) => c.id === 'whisper');
  const starve = data.curses.find((c) => c.id === 'starve');
  assert.ok(whisper && whisper.mods.enemyRegen > 0, '「低语」应让敌人回血');
  assert.ok(whisper.goldMult > 1, '「低语」必须有金币回报');
  assert.ok(starve && starve.mods.oilDecay > 1, '「枯灯」应加快灯火衰减');
  assert.ok(starve.goldMult > 1, '「枯灯」必须有金币回报');

  // ── 图鉴自动收录新内容，且行为有玩家向的说法 ──
  const codexHas = (kind, id) => game.codex.entries.some((e) => e.kind === kind && e.id === id);
  for (const id of ['echo', 'weaver', 'siphon', 'skitter']) assert.ok(codexHas('enemy', id), `图鉴应收录敌人 ${id}`);
  for (const id of ['sappers', 'fell', 'thorn']) assert.ok(codexHas('affix', id), `图鉴应收录词缀 ${id}`);
  for (const id of ['whisper', 'starve']) assert.ok(codexHas('curse', id), `图鉴应收录夜咒 ${id}`);
  const echoEntry = game.codex.entry('enemy:echo');
  assert.ok(echoEntry.rows.some(([k, v]) => k === '行为' && v.includes('路径')), '回响的行为说明应写出"沿路径追击"');
  assert.ok(game.codex.total() >= 109, `图鉴条目应随内容增长（${game.codex.total()}）`);

  // ── 回响：追的是"一秒前的你"，而不是现在的你 ──
  game.enemies.clear();
  const ctxAt = (x, y) => {
    const c = game.enemyCtx();
    c.px = x;
    c.py = y;
    return c;
  };
  for (let i = 0; i < 90; i += 1) game.enemies.update(1 / 60, ctxAt(0, 0));
  const echo = game.enemies.spawn('echo', 300, 0, 1, 1);
  for (let i = 0; i < 3; i += 1) game.enemies.update(1 / 60, ctxAt(900, 0));
  assert.ok(echo.vx < -50, `回响应朝玩家一秒前的位置（原点）移动（vx=${echo.vx.toFixed(1)}）`);

  // ── 织雾者：留下滞行雾，雾里玩家变慢 ──
  game.enemies.clear();
  game.grounds.length = 0;
  game.player.oil = game.player.oilMax;
  const weaver = game.enemies.spawn('weaver', game.player.x + 120, game.player.y, 1, 1);
  weaver.attackCd = 0;
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(game.grounds.some((g) => g.kind === 'mud'), '织雾者应织出滞行雾');

  // 直接对玩家做一次"同输入、不同地形"的对照，避免把加速起步误判成减速
  const walk = (terrainSlow) => {
    const p = game.player;
    p.terrainSlow = terrainSlow;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    for (let i = 0; i < 30; i += 1) p.update(1 / 60, { moveX: 1, moveY: 0, dash: false, nova: false }, game.playerCtx());
    return p.x;
  };
  const freeWalk = walk(1);
  const mudWalk = walk(0.6);
  assert.ok(mudWalk < freeWalk * 0.75, `滞行雾里应明显更慢（${mudWalk.toFixed(1)} vs ${freeWalk.toFixed(1)}）`);

  // 端到端：站在雾里跑一帧，Game 会把地形减速写回玩家身上
  game.player.terrainSlow = 1;
  game.hitStop = 0;
  game.setInput(0, 0, false, false);
  game.update(1 / 60);
  assert.ok(game.player.terrainSlow < 1, '踩在雾里时 updateTerrain 应把玩家降速');
  game.grounds.length = 0;
  game.setInput(0, 0, false, false);
  game.update(1 / 60);
  assert.equal(game.player.terrainSlow, 1, '离开雾后应立刻恢复');

  // ── 噬灯魅：吊在中距离持续抽油 ──
  game.enemies.clear();
  game.player.oil = 1;
  const siphon = game.enemies.spawn('siphon', game.player.x + 200, game.player.y, 1, 1);
  const siphonX = siphon.x;
  for (let i = 0; i < 60; i += 1) game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(game.player.oil < 1 - 0.01, `噬灯魅应持续抽走灯油（oil=${game.player.oil.toFixed(3)}）`);
  assert.ok(siphon.x > siphonX, '噬灯魅应保持在射程之外，而不是贴脸');
  game.player.oil = game.player.oilMax;

  // ── 词缀：蚀油 ──
  game.enemies.clear();
  const sapper = game.enemies.spawn('shade', game.player.x + 60, game.player.y, 1, 1);
  game.applyAffix(sapper, 'sappers');
  game.player.oil = 1;
  for (let i = 0; i < 60; i += 1) game.enemies.update(1 / 60, game.enemyCtx());
  const sapped = 1 - game.player.oil;
  assert.ok(sapped > 0.005, `「蚀油」光环应抽走灯油（-${sapped.toFixed(4)}）`);
  assert.ok(sapped < 0.08, `「蚀油」不应强到直接抹掉灯火（-${sapped.toFixed(4)}）`);
  game.player.oil = game.player.oilMax;

  // ── 词缀：噬魂（死亡时治疗同伴）──
  game.enemies.clear();
  const feeder = game.enemies.spawn('shade', 400, 400, 1, 1);
  game.applyAffix(feeder, 'fell');
  const ally = game.enemies.spawn('shade', 440, 400, 1, 1);
  ally.hp = ally.maxHp * 0.2;
  const allyBefore = ally.hp;
  game.applyHit(feeder, feeder.maxHp * 4, false, 0, 0, 0);
  assert.ok(!feeder.active, '噬魂怪应被击杀');
  assert.ok(ally.hp > allyBefore, '「噬魂」应把附近同伴喂饱');

  // ── 词缀：荆棘（接触伤害与抽油）──
  game.enemies.clear();
  const thorn = game.enemies.spawn('shade', 400, 400, 1, 1);
  const thornBase = thorn.damage;
  game.applyAffix(thorn, 'thorn');
  assert.ok(thorn.damage > thornBase * 1.4, `「荆棘」应提升接触伤害（${thornBase} -> ${thorn.damage}）`);

  // ── 夜咒：低语（敌人持续回血）──
  game.enemies.clear();
  game.curse = whisper;
  const wounded = game.enemies.spawn('shade', 400, 400, 1, 1);
  wounded.hp = wounded.maxHp * 0.4;
  const whisperCtx = game.enemyCtx();
  assert.ok(whisperCtx.regen > 0, '「低语」夜咒下敌人应获得回血');
  const woundedBefore = wounded.hp;
  game.enemies.update(1, whisperCtx);
  assert.ok(wounded.hp > woundedBefore, '「低语」应让受伤的敌人回血');
  game.curse = null;
  assert.equal(game.enemyCtx().regen, 0, '没有夜咒时不应给敌人回血');

  // ── 夜咒：枯灯（灯火衰减更快）──
  const decayOver = (mult) => {
    const p = game.player;
    p.curseOilMult = mult;
    p.oil = 1;
    for (let i = 0; i < 30; i += 1) p.update(1 / 60, { moveX: 0, moveY: 0, dash: false, nova: false }, game.playerCtx());
    return 1 - p.oil;
  };
  const decayBase = decayOver(1);
  const decayStarved = decayOver(starve.mods.oilDecay);
  game.player.curseOilMult = 1;
  assert.ok(decayStarved > decayBase * 1.3, `「枯灯」应加快灯火衰减（${decayBase.toFixed(4)} -> ${decayStarved.toFixed(4)}）`);

  // ── 新成就：回响 / 噬灯魅 / 滞行雾 / 新夜咒，都要真的能解锁 ──
  const slay = (defId, count) => {
    for (let i = 0; i < count; i += 1) {
      const e = game.enemies.spawn(defId, 400, 400, 1, 1);
      game.enemies.damage(e, 1e9, game.lightCtx(), 0, 0, 0);
    }
  };
  game.save.achievements = game.save.achievements.filter((a) => !['echo_bane', 'siphon_slain', 'mirewalker'].includes(a));
  slay('echo', 9);
  assert.ok(!game.save.achievements.includes('echo_bane'), '差一只不该解锁「回声止步」');
  slay('echo', 1);
  assert.ok(game.save.achievements.includes('echo_bane'), '击杀 10 只回响应解锁「回声止步」');
  slay('siphon', 5);
  assert.ok(game.save.achievements.includes('siphon_slain'), '击杀 5 只噬灯魅应解锁「灯火不可夺」');

  game.mudTime = 0;
  game.grounds.length = 0;
  game.grounds.push({ x: game.player.x, y: game.player.y, r: 160, life: 9999, dps: 0, kind: 'mud' });
  for (let i = 0; i < 1250; i += 1) game.updateTerrain(1 / 60);
  assert.ok(game.save.achievements.includes('mirewalker'), '在滞行雾里待满 20 秒应解锁「踏雾而行」');

  game.save.achievements = game.save.achievements.filter((a) => a !== 'curse_veteran');
  game.stageIndex = 1;
  game.curse = whisper;
  game.onStageComplete();
  assert.ok(game.save.achievements.includes('curse_veteran'), '带着「低语」平定一关应解锁「咒中行」');

  // ── 成就面板要按分组渲染，新成就也在里面 ──
  game.ui.showScreen('achievements');
  const achHtml = game.ui.screen.innerHTML;
  for (const frag of ['战斗', '关卡与首领', '抉择与风险', '收集与档案', '一线穿心', '回声止步']) {
    assert.ok(achHtml.includes(frag), `成就面板应出现「${frag}」`);
  }

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
