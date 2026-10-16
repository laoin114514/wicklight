/**
 * 「本局伤害构成」回归测试：这一局打出去的伤害，要记得住**是谁打的**。
 *
 * 为什么值得钉：这一局的枪法是自动的，玩家一直在做的决定只有"升级给谁"。
 * 可结算页从前只给一个总伤害——哪件在扛、哪件在刮，只能靠感觉猜；
 * 而肉鸽的乐趣就长在"下一步堆什么"上，这个数不给出来，等于把半个游戏藏起来。
 *
 * 记账这件事最怕的不是报错，而是**悄悄错**：少记一笔看不出来，记到别的桶里也看不出来，
 * 只有"所有桶加起来 ≠ 造成伤害"这一条会露馅。所以这里量四件事：
 *   1. **恒等**：所有桶加起来必须**正好**等于 `damageDealt`（多一个说不清的来源都不行）；
 *   2. **来源接对线**：真开一件武器，账就记在那件武器头上（不是 `other`）；
 *   3. **慢的那几条路也要接上**：爆炸、灼烧都不是"命中那一瞬间"打的，
 *      伏灯记在埋雷的人头上、倾灯那片火记在倒油的人头上；
 *   4. **界面读得出来**：两件以上来源时结算页有一张按伤害排序的表，且不带 undefined / NaN。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：不刷怪、不打、不弹升级面板，场面完全由测试自己摆。 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=dmg-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  game.level.pyres.length = 0;
  game.level.walls.length = 0;
  game.enemies.clear();
  game.projectiles.clear();
  game.pickups.clear();
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

/**
 * 一只站着让你量、打不死的怪：血给到 1e6（于是也不会触发击杀的顿帧），
 * **脚力给到 0**（于是它不会自己走过来贴上你——贴上了就会一直挨「灯火」「接触伤害」，
 * 那口火是按 0.25 秒一跳的，几秒下来会比武器打的还多，量"这件武器打了多少"就量不准了）。
 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

function run(game, frames, nova = false) {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, nova && i === 0);
    game.update(1 / 60);
  }
  return game;
}

/** 账本里某一桶的数额（没有就是 0）。 */
function bucket(game, id) {
  const row = game.damageBreakdown().find((r) => r.id === id);
  return row ? row.amount : 0;
}

/** 所有桶加起来——它必须正好等于 `damageDealt`（这就是"没漏记、没重记"）。 */
function sumBuckets(game) {
  return game.damageBreakdown().reduce((a, r) => a + r.amount, 0);
}

test('伤害构成：真开一件武器，账就记在那件武器头上', async (t) => {
  const game = await open(t, 'whip');
  game.player.weapons.set('whip', 5);
  game.player.recomputeStats();
  // 站得比"灯火贴身灼烧"(_约 35px_)远一点，免得那一口火也混进来
  statue(game, 70, 0);
  run(game, 200);

  assert.ok(game.damageDealt > 0, '这段该打出伤害（不然下面几条都是在量空气）');
  const rows = game.damageBreakdown();
  assert.equal(rows[0].id, 'whip', `伤害最高的该是烈焰鞭（实际 ${rows.map((r) => r.id).join(',')}）`);
  assert.equal(bucket(game, 'other'), 0,
    `来源接对了就不该有"其他"（实际 ${bucket(game, 'other').toFixed(1)}）——说明有条路忘了传 source`);
  assert.ok(Math.abs(sumBuckets(game) - game.damageDealt) < 1e-6,
    `所有桶加起来必须正好等于造成伤害（${sumBuckets(game)} vs ${game.damageDealt}）`);
});

test('伤害构成：爆炸记在"谁放的"头上（伏灯 / 旋灯各归各的）', async (t) => {
  const game = await open(t, 'blast');
  // 伏灯：埋的时候记下是谁埋的，炸的时候才有得记（这条路上"开火"和"炸"隔着好几秒）
  game.placeMine(0, 0, 40, 60, 32, 0, 'mine');
  statue(game, 0, 0);
  run(game, 90);
  assert.ok(bucket(game, 'mine') > 0, `伏灯炸出来的伤害该记在伏灯头上（实际 ${bucket(game, 'mine')}）`);

  // 旋灯：收缩那一下同样是延迟发生的
  game.blast(300, 300, 140, 30, { source: 'vortex' });
  statue(game, 300, 300);
  game.blast(300, 300, 140, 30, { source: 'vortex' });
  assert.ok(bucket(game, 'vortex') > 0, `旋灯收缩那一下该记在旋灯头上（实际 ${bucket(game, 'vortex')}）`);
  assert.equal(bucket(game, 'other'), 0, '两个延迟来源都接上了，就不该有"其他"');
  assert.ok(Math.abs(sumBuckets(game) - game.damageDealt) < 1e-6, '恒等式在这条路上也要成立');
});

test('伤害构成：灼烧是"点火的谁"打的，不是无主的火', async (t) => {
  const game = await open(t, 'burn');
  // 只烧、不开火：把武器全清掉，场面里只有这一只正在烧的怪
  const lit = statue(game, 240, 0);
  const plain = statue(game, -240, 0);
  game.enemies.applyBurn(lit, 3, 'pour');
  game.enemies.applyBurn(plain, 3); // 不传来源 = 说不清是谁点的
  run(game, 90);

  assert.ok(bucket(game, 'pour') > 0,
    '倾灯那片油火自己不打伤害（dps = 0），它的伤害全从灼烧里来——不记账它就显示成"没打伤害"');
  assert.ok(bucket(game, 'other') > 0, '没标来源的火该落到"其他"，而不是被漏掉');
  assert.ok(Math.abs(sumBuckets(game) - game.damageDealt) < 1e-6,
    `灼烧也要算进总账（${sumBuckets(game)} vs ${game.damageDealt}）`);

  // 真实的那条路：倾灯落地留下的那片油火，每隔 0.6 秒给火里的怪续一层灼烧。
  // 这片火自己不打伤害（dps = 0），所以"倾灯打了多少"完全是它续出来的灼烧——
  // 来源得从"倒油的那一件武器"一路传到地面上，断在中间任何一环都会掉进"其他"。
  const g2 = await open(t, 'pour');
  const inFire = statue(g2, 0, 0);
  g2.pourPool(0, 0, 80, 8, 'pour');
  run(g2, 200);
  assert.ok(bucket(g2, 'pour') > 0, `地面上那片火续出来的灼烧该记在倾灯头上（实际 ${bucket(g2, 'pour')}）`);
  assert.equal(bucket(g2, 'other'), 0, '倒出来的那片火是有主的，不该落进"其他"');
  assert.ok(inFire.burn > 0, '火里的怪应当被一遍遍续上灼烧（不然这条测试本身就没在量东西）');
});

test('伤害构成：燃爆记在「燃爆」上，灯火贴身那口火记在「灯火」上', async (t) => {
  const game = await open(t, 'nova');
  statue(game, 90, 0);
  run(game, 30, true);
  assert.ok(bucket(game, 'nova') > 0, `燃爆该记在 nova 这一桶（实际 ${bucket(game, 'nova')}）`);
  const row = game.damageBreakdown().find((r) => r.id === 'nova');
  assert.equal(row.name, '燃爆', '它得有个能读的名字，不该是 id 直接上屏');
  assert.equal(bucket(game, 'other'), 0, '燃爆这条路也要接上来源');

  // 灯火贴身灼烧：把怪放到灯火边上，不动手也会一直掉血
  const g2 = await open(t, 'lantern');
  statue(g2, 20, 0);
  run(g2, 90);
  assert.ok(bucket(g2, 'lantern') > 0, `灯火贴身那口火该记在"灯火"上（实际 ${bucket(g2, 'lantern')}）`);
});

test('伤害构成：每一行都有名字与颜色，按伤害从多到少排，占比加起来是 100%', async (t) => {
  const game = await open(t, 'rows');
  // ⚠ 故意**从小到大**记账：如果表是照着记账顺序吐出来的，这里就会读到 whipped 排最后。
  //   最早那版是按大→小写的，于是这条断言在"完全没排序"的实现上也照样通过——测了个寂寞。
  game.applyHit(statue(game, 0, 200), 10, false, 0, 0, 0, {}); // 没说来源
  game.applyHit(statue(game, -200, 0), 60, false, 0, 0, 0, { source: 'fireball' });
  game.applyHit(statue(game, 200, 0), 100, false, 0, 0, 0, { source: 'whip' });

  const rows = game.damageBreakdown();
  assert.deepEqual(rows.map((r) => r.id), ['whip', 'fireball', 'other'], '该按伤害从多到少排');
  for (const r of rows) {
    assert.ok(r.name && typeof r.name === 'string' && r.name !== r.id || r.id === 'other',
      `每一行都该有玩家看得懂的名字（${r.id} → ${r.name}）`);
    assert.match(r.color, /^#[0-9a-f]{6}$/i, `${r.id} 应当带上一个十六进制颜色（实际 ${r.color}）`);
    assert.ok(r.frac > 0 && r.frac <= 1, `${r.id} 的占比应当在 (0,1] 里（实际 ${r.frac}）`);
  }
  const total = rows.reduce((a, r) => a + r.frac, 0);
  assert.ok(Math.abs(total - 1) < 1e-6, `占比加起来该是 100%（实际 ${(total * 100).toFixed(2)}%）`);
});

test('伤害构成：结算页与构筑总览都读得出来，而且没有缺字段', async (t) => {
  const game = await open(t, 'ui');
  game.applyHit(statue(game, 200, 0), 100, false, 0, 0, 0, { source: 'whip' });
  game.applyHit(statue(game, -200, 0), 60, false, 0, 0, 0, { source: 'fireball' });
  game.player.weapons.set('whip', 3);
  game.player.weapons.set('fireball', 2);
  game.player.recomputeStats();

  for (const [label, state] of [['结算', 'dead'], ['构筑总览', 'loadout']]) {
    game.ui.showScreen(state);
    const html = game.ui.screen.innerHTML;
    assert.ok(html.includes('本局伤害构成'), `${label}页该有这张表`);
    assert.ok(html.includes('烈焰鞭') && html.includes('爆裂火球'), `${label}页该把两件武器的名字写出来`);
    assert.ok(!/undefined|NaN/.test(html), `${label}页的这张表里不该出现 undefined / NaN`);
  }

  // 只有一件来源的时候这张表没有信息量，不该占地方
  const solo = await open(t, 'solo');
  solo.applyHit(statue(solo, 200, 0), 100, false, 0, 0, 0, { source: 'whip' });
  solo.ui.showScreen('dead');
  assert.ok(!solo.ui.screen.innerHTML.includes('本局伤害构成'),
    '只有一件来源时这张表就是"100% 是它"，占地方而已');
});
