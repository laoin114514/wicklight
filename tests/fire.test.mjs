/**
 * 「薪火」回归测试（v80）：余烬的第二个出口。
 *
 * 这一套要回答的是四个问题，而且都得真量出来：
 *   · **价格阶梯的形状**：一级比一级贵 45%、封顶之后买不动、全烧满正好 19170 余烬
 *     （这个数是**文档里写着**的，价格一漂这里就红）；
 *   · **买下来的那一级真的落到开局上**：火力 / 灯火 / 灯油容量三条各量一次——
 *     "面板上写着 +4%、场上一动不动"正是这种系统最容易犯的错（树那边也有同样的断言）；
 *   · **它不会把同一个数加两遍、也不会被中途重算冲掉**：拿到遗物会 `recomputeStats`，
 *     元进度那几笔得跟着回来（走的是 `Player.metaMods`，和移速同一条路）；
 *   · **封顶的说法**：一条烧满解「添到顶」、三条全满解「长夜不熄」，而且**满级就不再卖**
 *     （不封顶的话，这个系统就变成了"比谁攒得久"，难度那几条线也就没意义了）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局：`prep` 里可以先动存档（买树 / 塞余烬），然后按标准路子开局。 */
async function open(t, { tag = '', prep = null } = {}) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=fire-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.save.meta = [];
  game.save.achievements = [];
  game.save.fire = {};
  game.save.embers = 1e6;
  prep?.(game);
  game.newRun('warden', 'normal', false);
  return game;
}

const FIRE = () => globalThis.window.__WICKLIGHT__.data.fire;
const LINE = (id) => FIRE().FIRE_LINES.find((l) => l.id === id);

test('价格阶梯：一级比一级贵 45%、封顶不再卖、全烧满正好 19170 余烬', async (t) => {
  const game = await open(t, { tag: 'price' });
  const { fireCost } = FIRE();
  for (const line of FIRE().FIRE_LINES) {
    for (let i = 1; i < line.levels; i += 1) {
      const ratio = fireCost(line, i) / fireCost(line, i - 1);
      assert.ok(
        Math.abs(ratio - line.growth) < 0.02,
        `${line.name} 第 ${i + 1} 级该比上一级贵 ${Math.round((line.growth - 1) * 100)}%（实际 ×${ratio.toFixed(3)}）`,
      );
    }
  }
  // 全烧满：钱正好花掉那么多，而且第 7 级不再存在
  const full = await open(t, { tag: 'full' });
  let spent = 0;
  for (const line of FIRE().FIRE_LINES) {
    for (let i = 0; i < line.levels; i += 1) {
      spent += fireCost(line, i);
      assert.equal(full.buyMetaFire(line.id), true, `${line.name} 第 ${i + 1} 级该买得下来`);
    }
    assert.equal(full.meta.fireLevel(line.id), line.levels, `${line.name} 该正好烧到 ${line.levels} 级`);
    assert.equal(full.buyMetaFire(line.id), false, `${line.name} 封顶之后不该还能买`);
  }
  // 买满三条会给两笔成就余烬（添到顶 150 + 长夜不熄 260），所以这里对的是"花掉的钱"
  assert.equal(spent, 19170, `全烧满该花掉 19170 余烬（实际 ${spent}）`);
  assert.equal(
    full.save.embers,
    1e6 - 19170 + 150 + 260,
    `余烬该正好按阶梯扣掉、再进两笔成就奖励（${1e6} → ${full.save.embers}）`,
  );
  assert.equal(full.meta.fireLevelsTotal(), FIRE().FIRE_LEVELS_TOTAL, '烧满之后总级数该等于分母');
  assert.ok(full.save.achievements.includes('firemax'), '烧满一条该解「添到顶」');
  assert.ok(full.save.achievements.includes('fireall'), '三条全满该解「长夜不熄」');
});

test('钱不够就买不动，而且一分钱都不许扣', async (t) => {
  const game = await open(t, { tag: 'poor' });
  const line = LINE('fire_damage');
  game.save.embers = FIRE().fireCost(line, 0) - 1;
  assert.equal(game.meta.canBuyFire(line), false, `差 1 枚余烬时不该能买（价格 ${FIRE().fireCost(line, 0)}）`);
  assert.equal(game.buyMetaFire(line.id), false, '买不动就不该返回成功');
  assert.equal(game.meta.fireLevel(line.id), 0, '失败不该记账');
  assert.equal(game.save.embers, FIRE().fireCost(line, 0) - 1, '失败不该扣钱');
  game.save.embers = FIRE().fireCost(line, 0);
  assert.equal(game.buyMetaFire(line.id), true, '刚够就该买得动（边界是"够"而不是"多"）');
  assert.equal(game.save.embers, 0, '刚好够时余额该是 0');
});

test('老存档没有 fire 那一格：按"一级都没烧"读，也照样能买', async (t) => {
  const game = await open(t, { tag: 'legacy' });
  game.save.fire = undefined;
  assert.equal(game.meta.fireLevel('fire_damage'), 0, '缺字段该按 0 级读（不是 NaN / undefined）');
  assert.equal(game.meta.fireLevelsTotal(), 0, '总级数也该是 0，而不是把 undefined 加进去');
  assert.equal(game.buyMetaFire('fire_damage'), true, '老存档照样能烧第一级');
  assert.equal(game.meta.fireLevel('fire_damage'), 1, '烧完该写进存档');
  assert.equal(game.buyMetaFire('不存在的线'), false, '不认识的 id 该被挡掉（不是崩掉）');
});

test('烧下来的那一级真的落到开局上：火力 / 灯火 / 灯油容量各量一次', async (t) => {
  const bare = await open(t, { tag: 'bonus0' });
  const baseDmg = bare.player.stats.damageMult;
  const baseLight = bare.player.baseLightMult;
  const baseOilMax = bare.player.oilMax;

  const game = await open(t, { tag: 'bonus6', prep: (g) => { g.save.embers = 1e6; } });
  for (const id of ['fire_damage', 'fire_light', 'fire_oil']) {
    const line = LINE(id);
    for (let i = 0; i < line.levels; i += 1) assert.equal(game.buyMetaFire(id), true, `${line.name} 该买得下来`);
  }
  game.newRun('warden', 'normal', false);
  assert.ok(
    Math.abs(game.player.stats.damageMult / baseDmg - 1.24) < 1e-9,
    `薪柴满级该让开局火力 ×1.24（${baseDmg} → ${game.player.stats.damageMult}）`,
  );
  assert.ok(
    Math.abs(game.player.baseLightMult - (baseLight + 0.18)) < 1e-9,
    `亮芯满级该让灯火半径 +18%（${baseLight} → ${game.player.baseLightMult}）`,
  );
  assert.ok(
    Math.abs(game.player.oilMax - (baseOilMax + 0.3)) < 1e-9,
    `油瓮满级该让灯油容量 +30%（${baseOilMax} → ${game.player.oilMax}）`,
  );
  // 拿到遗物会重算一身属性：局外那三笔得跟着回来（走的是 metaMods，和移速同一条路）
  const before = game.player.stats.damageMult;
  game.player.addRelic('loom');
  game.player.recomputeStats();
  assert.ok(
    Math.abs(game.player.stats.damageMult - before) < 1e-9,
    `重算之后薪火那笔火力也该在（${before} → ${game.player.stats.damageMult}）`,
  );
  assert.ok(
    Math.abs(game.player.oilMax - (baseOilMax + 0.3)) < 1e-9,
    `重算之后油瓮也不该被冲掉（${game.player.oilMax}）`,
  );
});

test('余烬的出口要读得出来：面板上有那三块、有价格、有总级数', async (t) => {
  const game = await open(t, { tag: 'ui', prep: (g) => { g.save.embers = 1e6; } });
  game.buyMetaFire('fire_light');
  game.buyMetaFire('fire_light');
  game.ui.showScreen('meta');
  const html = game.ui.screen.innerHTML;
  for (const line of FIRE().FIRE_LINES) {
    assert.ok(html.includes(line.name), `面板上该列出「${line.name}」`);
    assert.ok(html.includes(line.per), `面板上该写出每一级改什么（${line.per}）`);
  }
  assert.ok(html.includes(`2/${FIRE().FIRE_LINES[1].levels}`), '该写出这一条烧到几级了');
  assert.ok(html.includes(`2/${FIRE().FIRE_LEVELS_TOTAL}`), '该写出整个炉子的总进度（分母 = 三条加起来）');
  assert.ok(html.includes(`${FIRE().fireCost(LINE('fire_light'), 2)} 余烬`), '该写出下一级的价格');
  // 树还没买完时那一行要指路：先买树（炉子比树贵得多，顺序错了就是把钱花错了地方）
  assert.ok(html.includes('解锁树还剩'), '树上还有没买的节点时，该指一句路');
  assert.ok(!/undefined|NaN/.test(html), '面板上不该出现缺字段');

  // 树买全之后那句话要换成"这里就是余烬的去处"
  const all = await open(t, { tag: 'ui-all', prep: (g) => { g.save.meta = globalThis.window.__WICKLIGHT__.data.meta.map((n) => n.id); } });
  all.ui.showScreen('meta');
  assert.ok(all.ui.screen.innerHTML.includes('这里就是余烬的去处'), '树买全之后该换一句话（不是继续喊"还剩 0 个节点"）');
});
