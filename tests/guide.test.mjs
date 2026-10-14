/**
 * 解说层回归测试：图鉴要查得到数值、构筑总览要说得出"离进化还差什么"、
 * 升级卡要在能进化的时候提醒你。肉鸽里最伤人的就是"该给的信息没给"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('图鉴详情：条目数值可查、详情页渲染干净', async (t) => {
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
  game.newRun('warden', 'normal', false);

  // ── entry() 能按 key 取到每一条 ──
  for (const e of game.codex.entries) {
    const got = game.codex.entry(`${e.kind}:${e.id}`);
    assert.ok(got, `按 key 取不到 ${e.kind}:${e.id}`);
    assert.equal(got.name, e.name);
  }
  assert.equal(game.codex.entry('enemy:__nope__'), undefined, '不存在的 key 应返回空');

  // ── 数值行必须是"能给玩家看的"字符串 ──
  const withRows = game.codex.entries.filter((e) => e.rows && e.rows.length);
  assert.ok(withRows.length >= 30, `应当有足够多的条目带数值（${withRows.length}）`);
  for (const e of game.codex.entries) {
    for (const [k, v] of e.rows ?? []) {
      assert.equal(typeof k, 'string');
      assert.ok(k.length > 0 && typeof v === 'string' && v.length > 0, `${e.kind}:${e.id} 的「${k}」数值为空`);
      assert.ok(!/undefined|NaN|object/.test(v), `${e.kind}:${e.id} 的「${k}」数值异常：${v}`);
    }
  }

  // 敌人要能查到生命/伤害；武器要能查到伤害曲线与进化条件
  const shade = game.codex.entry('enemy:shade');
  const shadeRows = Object.fromEntries(shade.rows);
  assert.equal(shadeRows['生命'], '14');
  assert.equal(shadeRows['接触伤害'], '8');
  const ring = game.codex.entry('weapon:ring');
  const ringRows = Object.fromEntries(ring.rows);
  assert.ok(ringRows['伤害 Lv1 → 满级'].includes('→'), `武器伤害曲线异常：${ringRows['伤害 Lv1 → 满级']}`);
  assert.ok(ring.extra.includes('进化'), '武器详情应写明进化条件');
  assert.ok(ring.extra.includes('长明') && ring.extra.includes('日冕'), `进化条件应含被动与目标武器：${ring.extra}`);

  // ── 已发现条目可点开；未发现的不给点 ──
  game.codex.discover('enemy', 'shade');
  game.ui.showScreen('codex');
  let html = game.ui.screen.innerHTML;
  assert.ok(html.includes('data-cx="enemy:shade"'), '已发现条目应可点击查看');
  assert.ok(html.includes('查看数值'), '已发现条目应有详情入口提示');
  const lockedCards = (html.match(/class="cx is-locked"/g) ?? []).length;
  assert.ok(lockedCards > 0, '未发现条目仍应显示为占位');

  // ── 详情页（无头桩件里没有真正的 DOM，所以直接切到详情视图）──
  game.ui.codexFocus = 'enemy:shade';
  game.ui.showScreen('codex');
  html = game.ui.screen.innerHTML;
  for (const needle of ['影蛭', '生命', '14', '接触伤害', '直线追击', '返回图鉴']) {
    assert.ok(html.includes(needle), `详情页缺少「${needle}」`);
  }
  for (const bad of ['undefined', 'NaN', '[object Object]', '${']) {
    assert.ok(!html.includes(bad), `详情页出现了 ${bad}`);
  }

  // 返回图鉴 → 回到目录
  game.ui.codexFocus = null;
  game.ui.showScreen('codex');
  const backHtml = game.ui.screen.innerHTML;
  assert.ok(backHtml.includes('图鉴 ·'), '返回后应回到图鉴目录');
  assert.ok(backHtml.includes('data-cx='), '返回后仍能看到条目列表');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});

test('进化指引：构筑总览说清差距，升级卡提前提醒', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now() + 7}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  const ringMax = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'ring').levels.length;
  const longMax = globalThis.window.__WICKLIGHT__.data.passives.find((p) => p.id === 'longlasting').maxLevel;

  game.bootDone();
  game.newRun('warden', 'normal', false);

  // ── 构筑总览：写出武器等级与被动进度的对照 ──
  game.ui.showScreen('loadout');
  let html = game.ui.screen.innerHTML;
  assert.ok(html.includes('进化路线'), '构筑总览应有进化路线一栏');
  assert.ok(html.includes('环形火环'), '进化路线应列出当前武器');
  assert.ok(html.includes('长明'), '进化路线应写明所需被动');
  assert.ok(html.includes(`武器 1/${ringMax}`), `应写出武器等级进度：${(html.match(/武器 \d+\/\d+/g) ?? []).join(',')}`);
  assert.equal(html.includes(`长明 1/${longMax}`), true, `应写出所需被动的当前进度：${(html.match(/长明 \d+\/\d+/) ?? [''])[0]}`);

  // 差被动 → 不给"可进化"标记
  assert.ok(!html.includes('is-ready'), '条件不满足时不应标记为可进化');

  // ── 条件齐了 → 标为可进化 ──
  game.player.levelWeapon('ring');
  for (let i = 0; i < ringMax; i += 1) game.player.levelWeapon('ring');
  game.player.addPassive('longlasting', longMax);
  game.player.recomputeStats();
  game.ui.showScreen('loadout');
  html = game.ui.screen.innerHTML;
  assert.ok(html.includes('is-ready'), '武器满级 + 被动满级后应标记为可进化');

  // ── 升级池里应当真的出现进化卡，并且卡上写明来由 ──
  // 三选一里不一定抽得到进化卡（池子很大），所以直接要一整池来看
  const pool = game.upgrades.generate(game.player, 60, game.rng);
  const evolve = pool.find((o) => o.tag === 'evolve');
  assert.ok(evolve, `满级武器 + 满级被动后应给出进化选项（${pool.map((o) => o.name).join(',')}）`);
  assert.equal(evolve.id, 'ring_corona');
  game.currentOffers = pool;
  game.ui.setOffers(pool, 0);
  game.ui.showScreen('levelup');
  const lvlHtml = game.ui.screen.innerHTML;
  assert.ok(lvlHtml.includes('日冕'), '进化卡应显示进化后的武器名');
  assert.ok(lvlHtml.includes('满级武器 + 满级被动 = 进化'), '进化卡应解释进化条件');

  // 点掉进化卡 → 武器被替换，图鉴跟着记录
  game.chooseUpgrade(evolve);
  assert.ok(game.player.weapons.has('ring_corona'), '进化后应拥有日冕');
  assert.ok(!game.player.weapons.has('ring'), '进化后原来的武器应被替换');
  assert.equal(game.state, 'playing');

  // ── 升级卡提示：被动点满就能进化 ──
  game.player.addWeapon('wisp');
  for (let i = 0; i < 5; i += 1) game.player.levelWeapon('wisp');
  const oilMax = globalThis.window.__WICKLIGHT__.data.passives.find((p) => p.id === 'oilrain').maxLevel;
  game.player.addPassive('oilrain', oilMax - 1);
  game.player.recomputeStats();
  game.ui.setOffers(
    [{ kind: 'passive', id: 'oilrain', name: '油雨', blurb: '击杀掉落灯油 +25%', icon: '💧', color: '#8affc1', level: oilMax, maxLevel: oilMax, tag: 'level' }],
    0,
  );
  game.ui.showScreen('levelup');
  html = game.ui.screen.innerHTML;
  assert.ok(html.includes('点满即可进化'), '被动点满前一张卡应提示即将进化');
  assert.ok(html.includes('群萤'), `提示里应写出进化目标：${html.includes('群萤')}`);

  // ── 升级卡提示：武器最后一级时告诉你还差什么 ──
  game.player.weapons.set('wisp', 4);
  game.player.passives.set('oilrain', 1);
  game.ui.setOffers(
    [{ kind: 'weapon', id: 'wisp', name: '追踪火苗', blurb: '自动追向最近的黑暗', icon: '🔥', color: '#7be0ff', level: 5, maxLevel: 5, tag: 'level' }],
    0,
  );
  game.ui.showScreen('levelup');
  html = game.ui.screen.innerHTML;
  assert.ok(html.includes('满级后再点满'), '武器满级卡应说明还差多少被动');
  assert.ok(html.includes('1/5'), `提示里应给出被动进度：${(html.match(/油雨 [^<]*/) ?? [''])[0]}`);

  assert.deepEqual(errors, [], `不应有 console.error：${errors.slice(0, 3).join(' | ')}`);
});
