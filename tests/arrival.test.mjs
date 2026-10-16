/**
 * 「赴灯」回归测试：怪从多远刷出来，按它自己的脚力算——**距离 = 到场时间 × 脚力**。
 *
 * 这一条和「循灯」是一对：循灯管"一波里最后剩下的几只"，赴灯管"整波怪怎么到场"。
 * 台架（`tools/bench-waves.mjs`）把空场时间拆成"刷怪阶段 / 清场阶段"两半之后，
 * 露出来的是：钉死火力的一局里，**清场阶段还有 4.4 秒是空场**——那个阶段怪已经全刷出来了，
 * 场上就是有东西，只是它们还在 620~940px 外那半路上。根因是生成环按"平均脚力"定，
 * 而脚力差 4 倍（石守 34 / 疾影 132）：最快的 5 秒到脸上，最慢的走 27 秒。
 *
 * 所以要钉住的是四件事：
 *   1. **到场时间大致相等**：没被夹住的那些，`距离 ÷ 脚力` 就是那个目标秒数；
 *   2. **两个夹子各自守一条底线**：近的那头不许进视野（慢怪被夹在 `min`）、
 *      远的那头不许比原来更远（快怪被夹在 `max`）；
 *   3. **精英 / 首领不在这条规则里**：它们的登场是给玩家看的，还是原来那个 620~940 的环；
 *   4. **导演真的把脚力传下去了**：普通怪传、精英与首领不传——这条规则接不上线就白写。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=arrival-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop, catalog } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.rng.reseed(31);
  // 场地清空：刷怪点只该由"脚力 + 玩家位置"决定，别让墙把点挤到别处去
  game.level.walls.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.enemies.clear();
  return { game, catalog };
}

const ARRIVAL_OF = () => globalThis.window.__WICKLIGHT__.data.arrival;

/** 在原点（0,0）的玩家身上量一次刷怪距离。 */
function dist(game, speed) {
  const p = game.randomSpawnPoint(speed);
  return Math.hypot(p.x - game.player.x, p.y - game.player.y);
}

test('赴灯：走得慢的从近处出发——到场时间大致相等', async (t) => {
  const { game, catalog } = await open(t, 'time');
  const A = ARRIVAL_OF();
  // 只挑"算出来落在带子里"的那些：被夹住的（石守那种、疾影那种）单独在另一条里量
  let checked = 0;
  for (const def of catalog.enemies) {
    if (def.boss || def.elite) continue;
    const raw = A.target * def.speed;
    if (raw < A.min || raw > A.max) continue;
    checked += 1;
    // 抖动是 ±jitter，量 12 次取均值：均值该落在目标上（抖动不能偏到一边去）
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += dist(game, def.speed) / def.speed;
    const avg = sum / 12;
    assert.ok(Math.abs(avg - A.target) < A.target * 0.05,
      `${def.name}（${def.speed}px/s）的到场时间该是 ${A.target} 秒上下（实测 ${avg.toFixed(1)} 秒）`);
  }
  assert.ok(checked >= 5, `该有足够多的怪落在带子里可量（实际 ${checked} 种）`);
});

test('赴灯：近的那头夹在 min，远的那头夹在 max（两头都不许越线）', async (t) => {
  const { game, catalog } = await open(t, 'near');
  const A = ARRIVAL_OF();
  const speeds = catalog.enemies.filter((d) => !d.boss && !d.elite).map((d) => d.speed);
  const slow = Math.min(...speeds);
  const fast = Math.max(...speeds);
  assert.ok(A.target * slow < A.min,
    `最慢的那种（${slow}px/s）必须被近夹子往上拉——不然它还是从老远慢慢挪（target×speed = ${A.target * slow}）`);
  assert.ok(A.target * fast > A.max,
    `最快的那种（${fast}px/s）必须被远夹子往里按——不然它就刷到天边去了（target×speed = ${A.target * fast}）`);

  // 每一种、量 40 次，全部落在 [min×(1-jitter), max×(1+jitter)] 里（夹子 + 抖动，没有别的出口）
  const lo = A.min * (1 - A.jitter);
  const hi = A.max * (1 + A.jitter);
  for (const def of catalog.enemies) {
    if (def.boss || def.elite) continue;
    for (let i = 0; i < 40; i += 1) {
      const d = dist(game, def.speed);
      assert.ok(d >= lo - 1e-6 && d <= hi + 1e-6,
        `${def.name} 刷出来的距离越线了：${d.toFixed(0)}px 不在 ${lo.toFixed(0)}~${hi.toFixed(0)} 之间`);
    }
  }
});

test('赴灯：精英与首领还是原来那个 620~940 的环', async (t) => {
  const { game } = await open(t, 'elite');
  // 不传脚力 = 老规矩：量 200 次，全部落在 620~940（±8% 抖动都不该有——那一段本来就是随机的）
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < 200; i += 1) {
    const d = dist(game, undefined);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  assert.ok(lo >= 618, `精英 / 首领不该被拉近（最近的 ${lo.toFixed(0)}px）`);
  assert.ok(hi <= 942, `精英 / 首领不该被推远（最远的 ${hi.toFixed(0)}px）`);
  assert.ok(hi - lo > 200, '那一段该是均匀散布的一条环，不是一个固定半径');
});

test('赴灯：不管灯火多亮，怪都不会刷在光里（近边界跟着灯火走）', async (t) => {
  const { game, catalog } = await open(t, 'light');
  const A = ARRIVAL_OF();
  const speeds = catalog.enemies.filter((d) => !d.boss && !d.elite).map((d) => d.speed);
  // 常规灯火是 96~320px；叠满加成（灯焰高涨 + 灯台余温 + 暗视）能推到 520 上下——
  // 这里一路量到 700：远边界是 940，还留得下整条带子，量得出这个不变量。
  for (const lr of [96, 320, 520, 700]) {
    game.player.lightRadius = lr;
    for (const sp of speeds) {
      for (let i = 0; i < 8; i += 1) {
        const d = dist(game, sp);
        assert.ok(d > lr,
          `灯火 ${lr}px 的时候，一只 ${sp}px/s 的怪刷在了 ${d.toFixed(0)}px —— 就在光里`);
      }
    }
  }
  // 而且这个近边界应当**跟着灯火往外让**：灯火越亮，刷怪点越远
  game.player.lightRadius = 320;
  const nearDim = Math.min(...speeds.map((sp) => dist(game, sp)));
  game.player.lightRadius = 700;
  const nearBright = Math.min(...speeds.map((sp) => dist(game, sp)));
  assert.ok(nearBright > nearDim,
    `灯火更亮时生成环该往外让（320px→最慢那只 ${nearDim.toFixed(0)}px；700px→${nearBright.toFixed(0)}px）`);
  assert.ok(nearBright > 700 + A.margin - 1e-6, `近边界应当是"灯火半径 + margin"（实际 ${nearBright.toFixed(0)}px）`);
});

test('赴灯：导演把脚力交给了普通怪，精英与首领不交', async (t) => {
  const { game } = await open(t, 'wire');
  const base = game.directorCtx(game.director.stageDef);
  const seen = [];
  const ctx = {
    ...base,
    spawnEnemy: () => {},
    aliveCount: () => 0,
    hazard: () => {},
    spawnPoint: (speed) => {
      seen.push(speed);
      return base.spawnPoint(speed);
    },
  };
  const stage = game.director.stageDef;
  game.director.setStage(stage, 0);

  // 第 1 波：普通怪 —— 每一次都该带着脚力
  game.director.beginWave(ctx);
  for (let i = 0; i < 400 && game.director.phase === 'spawning'; i += 1) game.director.update(1 / 60, ctx);
  assert.ok(seen.length > 3, `普通波该刷出好几批（实际 ${seen.length} 次）`);
  for (const s of seen) assert.equal(typeof s, 'number', `普通怪必须带着脚力刷（实际 ${s}）`);
  assert.ok(seen.every((s) => s > 0 && Number.isFinite(s)), '脚力该是正数');

  // 第 3 波：精英 —— 不带脚力（走老环）
  seen.length = 0;
  game.director.wave = 2;
  game.director.beginWave(ctx);
  assert.equal(seen.length, 1, '精英波该刷一只精英');
  assert.equal(seen[0], undefined, `精英不该被这条规则碰到（实际传了 ${seen[0]}）`);

  // 最后一波：首领 —— 同样不带
  seen.length = 0;
  game.director.wave = game.director.totalWaves - 1;
  game.director.beginWave(ctx);
  assert.ok(seen.length >= 1, '首领波该刷首领');
  for (const s of seen) assert.equal(s, undefined, `首领不该被这条规则碰到（实际传了 ${s}）`);
  assert.equal(game.director.phase, 'boss', '最后一波该是首领波（不然上面量到的不是首领）');
});
