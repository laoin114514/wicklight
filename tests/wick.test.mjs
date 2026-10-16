/**
 * 「拨芯」回归测试：按一下 C（手机上是右下角那枚按钮），灯火被拨小一格。
 *
 * 为什么值得钉：这一版第一次把"灯火烧多旺"交到玩家手里，而它改的是**四个不同的数**
 * ——灯火半径、亮度、火力、灯油耗率。这四个数各自住在代码的不同角落
 * （`Player.update` 的油、`Player.damageScale`、`lightRadius` 的算式），
 * 任何一个漏掉都不会报错、也不会崩，只会让这个动词变成"纯赚"或者"纯亏"：
 *   · 漏掉油耗，它就成了白送（没有任何理由不按着）；
 *   · 漏掉火力，它就成了零代价的省油刷法（在怪堆里拨小、反正近身照样打得到）；
 *   · 漏掉半径，它会变成"只省油不掉视野"，和这个游戏的每一句话都反着来。
 * 这三条都得在无头环境里量得出来——所以每一档都对着 `data/wick.ts` 里的**数**断言，
 * 不写"看着差不多"。另外两条是"坏了都看不出来"的：
 *   · **门禁**：不在战斗里按下的 C 不能攒着，等回到战场上自己把灯拨小（和分灯同一条规矩）；
 *   · **没拨芯的时候必须逐位不变**：几个乘数是"从 1 插值"，`wick = 0` 时恰好等于 1——
 *     不然这一版会悄悄改掉所有人的手感，而那是最难查的一类回归。
 *
 * ⚠ 全程走主循环（`env.frame()`）："键盘 → 输入快照 → `Game.update` → 玩家"这一整条
 * 才是要测的东西，绕开主循环就等于只测了 `Player` 自己。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：场面清空、人不掉血、不刷怪，测的是拨芯本身。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=wick-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, input, loop, hud } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  // 点火那条进度条的定时器：跑满之后它每帧还会叫 bootDone()，把状态推回菜单
  env.intervals.length = 0;
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return { game, input, env, hud };
}

/** 跑 n 帧（整帧走主循环：输入快照、setInput、update、HUD 一样不少）。 */
const frames = (env, n) => {
  for (let i = 0; i < n; i += 1) env.frame();
};

/** 真按一下 C：派发到 window（`Input` 就挂在那儿）→ 走一帧 → 松开。 */
function tapC(env) {
  env.dispatch('keydown', { code: 'KeyC' });
  env.frame();
  env.dispatch('keyup', { code: 'KeyC' });
}

const WICK_OF = () => globalThis.window.__WICKLIGHT__.data.wick;
/** 把灯芯拧到位（跑够一整个过渡时长），返回这一帧之后的状态。 */
const settle = (env, n = 40) => frames(env, n);

test('拨芯：C 是"按一下翻一格"，按住不放不会连着翻', async (t) => {
  const { game, env, input } = await open(t, 'map');
  // 键位那一层：KeyC 读成 dim，而且是一次性（按住不放不该每帧都翻）
  env.dispatch('keydown', { code: 'KeyC' });
  input.update();
  assert.equal(input.state.dim, true, 'KeyC 该读成"这一帧按了拨芯"');
  input.endFrame();
  env.dispatch('keydown', { code: 'KeyC', repeat: true });
  input.update();
  assert.equal(input.state.dim, false, '按住不放（repeat）不算新的一次按下');
  input.endFrame();
  env.dispatch('keyup', { code: 'KeyC' });

  assert.equal(game.player.wickOn, false, '开局是拨开的');
  tapC(env);
  assert.equal(game.player.wickOn, true, '按一下该拨小');
  assert.ok((game.save.tips ?? []).includes('verb:wick'), '第一次拨小该弹那张说明卡（代价不在按下去的那一瞬）');
  const tips = (game.save.tips ?? []).length;
  tapC(env);
  assert.equal(game.player.wickOn, false, '再按一下该拨回来');
  assert.ok((game.save.tips ?? []).includes('verb:wick'), '拨回来不该再弹一次（拨小的时候已经讲过了）');
  assert.equal((game.save.tips ?? []).length, tips, '说明卡只弹一次');
});

test('拨芯：不在战斗里按下的 C 不该攒着（暂停面板上按一下，回战场后灯自己灭了）', async (t) => {
  const { game, env } = await open(t, 'gate');
  game.state = 'paused';
  tapC(env);
  assert.equal(game.player.wickOn, false, '暂停面板上按的 C 不该生效');
  game.state = 'playing';
  frames(env, 5);
  assert.equal(game.player.wickOn, false, '回到战场之后也不该"补上"那一下');
  assert.ok(game.player.wick < 0.01, '灯芯该还在原位（没有被那一帧偷偷拨下去）');
});

test('拨芯：四个乘数同时动（光 / 亮 / 火 / 油），没拨的时候逐位不变', async (t) => {
  const { game, env } = await open(t, 'math');
  const p = game.player;
  const W = WICK_OF();
  // 三个数（半径 / 亮度 / 火力）都在 `Player.update` 里按当前油量现算，而油每帧都在掉——
  // 所以每一次读数都先**把油摁回同一个值、再跑一帧**。两边（拨 / 没拨）读到的油量因此一模一样，
  // 差出来的那一点只可能是拨芯干的。
  const readAt = (oilValue) => {
    p.oil = oilValue;
    frames(env, 1);
    return { light: p.lightRadius, bright: p.brightness, damage: p.damageScale };
  };

  // ① 没拨芯 = 和上一版逐位相同：几个乘数在 wick = 0 时恰好是 1
  assert.equal(p.wick, 0, '开局灯芯是全开的');
  const base = readAt(0.6);
  assert.ok(base.light > 200 && base.bright > 0.6, '先确认这是一盏亮着的灯（拿它当基准）');

  // ② 拨到底：半径 / 亮度 / 火力按 data/wick.ts 里的数走，一个都不许漏
  tapC(env);
  settle(env);
  assert.equal(p.wick, 1, '跑够一整个过渡，灯芯该正好拨到底');
  const baseLight = base.light;
  const baseBright = base.bright;
  const baseDamage = base.damage;
  const dim = readAt(0.6);
  assert.ok(
    Math.abs(dim.light - baseLight * W.lightMult) < 0.51,
    `灯火半径该是 ${baseLight.toFixed(1)} × ${W.lightMult} = ${(baseLight * W.lightMult).toFixed(1)}（实际 ${dim.light.toFixed(1)}）`,
  );
  assert.ok(
    Math.abs(dim.bright - baseBright * W.glowMult) < 0.005,
    `亮度该乘 ${W.glowMult}（实际 ${dim.bright.toFixed(3)}）`,
  );
  assert.ok(
    Math.abs(dim.damage - baseDamage * W.damageMult) < 0.005,
    `火力该乘 ${W.damageMult}（实际 ${dim.damage.toFixed(3)}）`,
  );

  // ③ 油：同样的 1 秒，拨着芯该只烧掉 W.oilMult 那一点
  const measure = (seconds) => {
    p.oil = 0.6;
    const before = p.oil;
    frames(env, Math.round(seconds * 60));
    return before - p.oil;
  };
  const burnDim = measure(1);
  tapC(env); // 拨回来
  settle(env);
  assert.equal(p.wick, 0, '再按一下该拨回原位');
  const burnFull = measure(1);
  const ratio = burnDim / burnFull;
  assert.ok(
    Math.abs(ratio - W.oilMult) < 0.03,
    `拨着芯的油耗该是没拨时的 ${W.oilMult}（实测 ${ratio.toFixed(3)}）`,
  );
  // 顺便：省油这件事得**大到值得按**——不然这个动词就是个摆设
  assert.ok(burnFull / burnDim > 2.5, `拨着芯该能多烧一倍以上（实测 ×${(burnFull / burnDim).toFixed(2)}）`);

  // ④ 拨回来之后，几个数要回到基准（不是"回个大概"）
  const back = readAt(0.6);
  assert.ok(Math.abs(back.light - baseLight) < 0.51, `拨回来之后灯火半径该回到基准（${back.light.toFixed(1)} vs ${baseLight.toFixed(1)}）`);
  assert.ok(Math.abs(back.damage - baseDamage) < 0.005, '拨回来之后火力该回到基准');
  assert.ok(Math.abs(back.bright - baseBright) < 0.005, '拨回来之后亮度该回到基准');
});

test('拨芯：拨小快、拨回来慢，而且不是"啪"地上来就换一张画面', async (t) => {
  const { game, env } = await open(t, 'ramp');
  const p = game.player;
  const W = WICK_OF();
  tapC(env);
  frames(env, 1);
  assert.ok(p.wick > 0 && p.wick < 0.2, `第一帧只该拧一点点（实际 ${p.wick.toFixed(3)}）`);
  // 拨小花了多久：spanDown 那一秒里就该到位
  frames(env, Math.ceil(W.spanDown * 60) + 1);
  assert.equal(p.wick, 1, `${W.spanDown} 秒之内该拨到底`);
  // 拨回来：走得比拨小慢
  tapC(env);
  frames(env, Math.ceil(W.spanDown * 60) + 1);
  assert.ok(p.wick > 0, '拨回来不该和拨小一样快（同一个时长的话就白分了两个数）');
  frames(env, Math.ceil((W.spanUp - W.spanDown) * 60) + 2);
  assert.equal(p.wick, 0, `${W.spanUp} 秒之内该拨回原位`);
});

test('拨芯：油见了底也不许把玩家拨瞎（半径地板）', async (t) => {
  const { game, env } = await open(t, 'floor');
  const p = game.player;
  const W = WICK_OF();
  p.oil = 0.01; // 灯火本来就只剩一条缝
  tapC(env);
  settle(env);
  assert.ok(
    p.lightRadius >= W.minRadius - 0.001,
    `拨到底也不该低于地板 ${W.minRadius}px（实际 ${p.lightRadius.toFixed(1)}）`,
  );
  assert.ok(p.lightRadius < 96, '但它仍然该比"没拨"时暗得多——地板不是白送的一圈');
});

test('拨芯：拨着小火走满 60 秒解「省着烧」，并且记进图鉴', async (t) => {
  const { game, env } = await open(t, 'ach');
  const p = game.player;
  const W = WICK_OF();
  assert.ok(!game.save.achievements.includes('wickwalk'), '开局不该已经拿着这条成就');
  tapC(env);
  settle(env);
  assert.ok(game.save.codex.includes('mechanic:wick'), '第一次拨芯该把它记进图鉴（机制那一章）');

  // 差一点点就到线：跑两帧就该解（量的是"拨着芯走了多久"，不是"按过几次"）
  p.wickTime = W.achieveSeconds - 0.05;
  frames(env, 4);
  assert.ok(game.save.achievements.includes('wickwalk'), `拨着芯走满 ${W.achieveSeconds} 秒该解成就`);

  // 拨回来之后不再累计：这条成就奖励的是"暗着走"，不是"按过这个键"
  const stopped = p.wickTime;
  tapC(env);
  settle(env);
  const after = p.wickTime;
  frames(env, 30);
  assert.equal(p.wickTime, after, '拨开之后不该再往这条账上加秒');
  assert.ok(stopped <= p.wickTime, '时间只往上加');
});
