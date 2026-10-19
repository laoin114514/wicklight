/**
 * 「自己身上那两圈火也停在墙面上」（v88）回归测试。
 *
 * 到 v87 为止，墙对战场上能数出来的东西几乎都做实了：怪撞墙推出去、沿墙滑、绕过去（v84），
 * 光矛停在墙面上（v85），子弹进墙判死，玩家自己撞墙收掉这次冲刺（v86）。**只剩两件还穿墙**——
 * 燎灯与环形火环：它们是仅有的两件"不发射"的武器（伤害写在"照到"上），判定从头到尾是**圆心距离**，
 * 一次都没问过墙。改前读数（同一份产物里跑三遍，暴击关掉）：燎灯隔着墙 **81.0 / 81.0 / 81.0**
 * （无墙 / 墙在旁边 / 墙在中间，**逐位相同**）、环形火环 **48.6 / 48.6 / 48.6**——
 * 墙在这两件身上一个字节都改不了。
 *
 * 这一版给它们补上"看得见"：一趟光从你身上出去，一堵墙后面那截是没有的。
 * 八项钉的是八件事，前六项各自都有**对照组**（撤掉墙 / 墙挪到旁边 / 人换到墙的另一边）：
 *   1. 燎灯隔着墙 0.0；撤掉墙照旧挨满，"墙在旁边"与无墙**逐位相同**；
 *   2. 环形火环同一套四条；
 *   3. 墙只吃掉它背后那一段：两只怪一上一下，只挡上面那只；而且「旺火」的人头**只数照得到的**；
 *   4. 换个地方站就照旧——同一条墙、同一只怪，人走到墙的另一边就挨满；
 *   5. 贴在你身上的那只照旧挨（两点叠在一起时，那句判据不许变成"挡"）；
 *   6. 燎野（燎灯的进化）走同一条规矩；
 *   7. **钉子**：燃爆照旧不看墙（它是炸出去的一下，不是照过去的一条光）——
 *      要把它也接进墙的规矩，先改这一条。
 *   8. v104 把这一拍的**画面**也接上同一句视线：有墙时只画可见弧，墙后不再亮一整圈；
 *      无墙仍走原来的整圆分支。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 一堵竖墙：x 落在 -60 ~ -40，y 铺得很长。 */
const WALL = { x: -60, y: -300, w: 20, h: 600 };
/** 一堵只挡住上半边的墙（见第 3 项）。 */
const HALF = { x: -60, y: -260, w: 20, h: 220 };
/** 对照组：同一堵墙，挪到场地另一头（不在这条光路上）。 */
const BESIDE = { x: 300, y: -300, w: 20, h: 600 };

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=selfwall-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return { game, p };
}

/**
 * 换武器。**每一轮都要把武器自己的钟表清零**：不清的话这一轮的读数里混着上一轮剩的冷却
 * （实测：同一件武器连跑两次，燎灯读出 12 拍 / 11 拍），而这一整个文件靠的就是
 * "两次只差一样东西、读数该逐位相同"。
 */
function arm(p, id) {
  p.weapons.clear();
  p.relics.clear();
  p.weapons.set(id, 1);
  p.recomputeStats();
  p.stats.critChance = 0; // 暴击是掷骰子的；这一份量的是"墙挡了多少"这一个数
  p.stats.critMult = 1;
  p.auraCd = 0;
  p.orbit.angle = 0;
  p.orbit.hitCooldown.clear();
  p.cooldowns.clear();
  p.novaCd = 0;
  p.novaBuffer = 0;
  p.novaHeld = false;
}

/**
 * 站桩打 `frames` 帧，返回**逐只**挨了多少（数组顺序 = `spots` 的顺序）。
 * 怪钉在原地不动：这一版量的是"照不照得到"，不是"它能跑到哪儿"。
 */
function measure(game, p, spots, walls, {
  weapon = 'aura', nova = false, frames = 300, at = [0, 0], foe = 'bulwark', relics = [],
} = {}) {
  game.level.walls.length = 0;
  for (const w of walls) game.level.walls.push(w);
  game.enemies.clear();
  const foes = spots.map(([x, y]) => {
    const e = game.enemies.spawn(foe, x, y, 1, 1);
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
    e.spawnTimer = 0;
    e.speed = 0;
    return e;
  });
  arm(p, weapon);
  for (const id of relics) p.relics.add(id);
  p.recomputeStats();
  p.stats.critChance = 0;
  p.stats.critMult = 1;
  p.x = at[0];
  p.y = at[1];
  p.vx = 0;
  p.vy = 0;
  const lost = foes.map(() => 0);
  for (let i = 0; i < frames; i += 1) {
    foes.forEach((e, k) => {
      e.hp = 1e9;
      e.x = spots[k][0];
      e.y = spots[k][1];
      e.speed = 0;
      e.vx = 0;
      e.vy = 0;
    });
    p.hp = 1e6;
    p.oil = p.oilMax;
    p.x = at[0];
    p.y = at[1];
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, nova && i === 0);
    game.update(dt);
    foes.forEach((e, k) => {
      lost[k] += 1e9 - e.hp;
    });
  }
  return lost;
}

test('燎灯：隔着墙照不到，撤掉墙照旧挨满（墙在旁边时读数逐位相同）', async (t) => {
  const { game, p } = await open(t, 'aura');
  const auraOpen = measure(game, p, [[-280, 0]], [], { weapon: 'aura' })[0];
  const again = measure(game, p, [[-280, 0]], [], { weapon: 'aura' })[0];
  assert.ok(auraOpen > 0, `撤掉墙要真的挨得到（不然下面那条等于没测）：${auraOpen}`);
  assert.equal(again, auraOpen, '同一个场景连跑两遍的读数必须逐位相同（这一份用例的地基）');
  const wall = measure(game, p, [[-280, 0]], [WALL], { weapon: 'aura' })[0];
  assert.equal(wall, 0, `一堵墙隔在中间，燎灯一下都不该烫到：${wall}`);
  const beside = measure(game, p, [[-280, 0]], [BESIDE], { weapon: 'aura' })[0];
  assert.equal(beside, auraOpen, `墙不在那趟光路上时不许改任何读数：${beside} vs ${auraOpen}`);
});

test('环形火环：同一套四条', async (t) => {
  const { game, p } = await open(t, 'ring');
  const ringOpen = measure(game, p, [[-105, 0]], [], { weapon: 'ring' })[0];
  const again = measure(game, p, [[-105, 0]], [], { weapon: 'ring' })[0];
  assert.ok(ringOpen > 0, `撤掉墙要真的挨得到：${ringOpen}`);
  assert.equal(again, ringOpen, '连跑两遍读数逐位相同');
  const wall = measure(game, p, [[-105, 0]], [WALL], { weapon: 'ring' })[0];
  assert.equal(wall, 0, `一堵墙隔在中间，火环一下都不该碰到：${wall}`);
  const beside = measure(game, p, [[-105, 0]], [BESIDE], { weapon: 'ring' })[0];
  assert.equal(beside, ringOpen, `墙不在那条线上时火环读数逐位不变：${beside} vs ${ringOpen}`);
});

test('墙只吃掉它背后那一段：两只怪一上一下，只挡上面那只；「旺火」的人头也照这条数', async (t) => {
  const { game, p } = await open(t, 'half');
  const spots = [[-200, -190], [-200, 190]];
  const pair = measure(game, p, spots, [HALF], { weapon: 'aura' });
  assert.equal(pair[0], 0, `墙背后那只挨不到：${pair[0]}`);
  assert.ok(pair[1] > 0, `墙旁边的另一只照旧挨满：${pair[1]}`);
  const openAll = measure(game, p, spots, [], { weapon: 'aura' });
  assert.equal(pair[1], openAll[1], '没被挡的那一只要与无墙时逐位相同');

  // 「旺火」（遗物）：光里每多罩住一只，那一下每只就多受 6%（最多 +60%）。
  // 人头必须只数**照得到**的那几只——数人头与真的打是两遍循环，各挡各的。
  const three = [[-200, -190], [-200, -230], [-200, 190]];
  const crowd = measure(game, p, three, [HALF], { weapon: 'aura', relics: ['auraflare'] });
  assert.equal(crowd[0], 0, `墙后面第一只不许进人头：${crowd[0]}`);
  assert.equal(crowd[1], 0, `墙后面第二只不许进人头：${crowd[1]}`);
  const onlyMe = measure(game, p, [[-200, 190]], [], { weapon: 'aura' })[0];
  assert.equal(crowd[2], onlyMe, `光里那一只该拿到"只有我一只"的那个数：${crowd[2]} vs ${onlyMe}`);
  const crowdOpen = measure(game, p, three, [], { weapon: 'aura', relics: ['auraflare'] });
  assert.ok(crowdOpen[2] > onlyMe, `三只都露在光里时「旺火」要真的更狠（不然上面那条等于没测）：${crowdOpen[2]}`);
});

test('换个地方站就照旧：同一条墙、同一只怪，人走到墙的另一边就挨满', async (t) => {
  const { game, p } = await open(t, 'side');
  const behind = measure(game, p, [[-280, 0]], [WALL], { weapon: 'aura', at: [-560, 0] })[0];
  assert.ok(behind > 0, `人和怪站在墙的同一边就该挨满：${behind}`);
  // 距离照旧是 280px，只多了一堵挡不住的墙——读数该与"怪在你另一侧 280px"那一发逐位相同
  const spread = measure(game, p, [[280, 0]], [], { weapon: 'aura' })[0];
  assert.equal(behind, spread, `同一边的读数该与无墙那一发逐位相同：${behind} vs ${spread}`);
});

test('贴在你身上的那只照旧挨（那条"线段"没有长度）', async (t) => {
  const { game, p } = await open(t, 'ontop');
  // 这一格读数里混着「灯火贴身烧」（`Player` 里那段 `lantern`，44px 以内贴着就点着），
  // 所以判的是"墙上场与不上场**逐位相同**"，而不是"大于 0"——后者被那口贴身火兜着，
  // 就算这两件武器全被墙闷掉也照样红不了。
  const onTopWall = measure(game, p, [[0, 0]], [WALL], { weapon: 'aura' })[0];
  const onTopOpen = measure(game, p, [[0, 0]], [], { weapon: 'aura' })[0];
  const auraOpen = measure(game, p, [[-280, 0]], [], { weapon: 'aura' })[0];
  assert.ok(onTopOpen > auraOpen, `贴身上的读数里必须有这一件自己的份（不然这条等于没测）：${onTopOpen}`);
  assert.equal(onTopWall, onTopOpen, `站在你身上的那只，墙上场也照旧挨：${onTopWall} vs ${onTopOpen}`);
});

test('燎野（燎灯的进化）走同一条规矩', async (t) => {
  const { game, p } = await open(t, 'wild');
  const wildOpen = measure(game, p, [[-280, 0]], [], { weapon: 'aura_wild' })[0];
  const wildWall = measure(game, p, [[-280, 0]], [WALL], { weapon: 'aura_wild' })[0];
  assert.ok(wildOpen > 0, `燎野撤墙要挨得到：${wildOpen}`);
  assert.equal(wildWall, 0, `燎野也照不到墙后面：${wildWall}`);
});

test('那一圈脉冲也只画墙这一侧（无墙仍是整圆）', async (t) => {
  const { game, p } = await open(t, 'pulse');
  const originalFull = game.particles.shockwave;
  const originalArc = game.particles.shockwaveArc;
  const originalBurst = game.particles.burst;
  let full = 0;
  const arcs = [];
  const bursts = [];
  game.particles.shockwave = (...args) => {
    full += 1;
    void args;
  };
  game.particles.shockwaveArc = (...args) => {
    arcs.push([args[5], args[6]]);
  };
  game.particles.burst = (...args) => {
    bursts.push([args[0], args[1]]);
  };
  t.after(() => {
    game.particles.shockwave = originalFull;
    game.particles.shockwaveArc = originalArc;
    game.particles.burst = originalBurst;
  });

  const pulse = (walls) => {
    game.level.walls.length = 0;
    for (const w of walls) game.level.walls.push(w);
    full = 0;
    arcs.length = 0;
    bursts.length = 0;
    arm(p, 'aura');
    p.x = 0;
    p.y = 0;
    p.auraCd = 0;
    p.updateWeapons(dt, game.playerCtx(), null);
    return { full, arcs: arcs.slice(), bursts: bursts.slice() };
  };

  const opened = pulse([]);
  assert.equal(opened.full, 1, `无墙时仍应是一整圆：${opened.full} 段整圆`);
  assert.equal(opened.arcs.length, 0, '无墙时不该改走弧段分支');
  assert.equal(opened.bursts.length, 5, `无墙时五粒边缘火星不该少：${opened.bursts.length}`);

  const walled = pulse([WALL]);
  assert.equal(walled.full, 0, '有墙时不许再画整圆');
  assert.ok(walled.arcs.length >= 1, '墙这一侧应至少留下一段可见弧');
  const span = walled.arcs.reduce((sum, [a0, a1]) => sum + (a1 - a0), 0);
  assert.ok(span < Math.PI * 2 - 0.5, `墙后那一段弧不该画出来（实际 ${span.toFixed(2)} 弧度）`);
  assert.ok(walled.arcs.every(([a0, a1]) => !(a0 <= Math.PI && Math.PI <= a1)), '墙所在角度 π 不该落在任何可见弧里');
  assert.equal(walled.bursts.length, 5, `墙这一侧仍应固定五粒边缘火星：${walled.bursts.length}`);
  assert.ok(walled.bursts.every(([x]) => x > -40), `边缘火星不该落在墙后：${JSON.stringify(walled.bursts)}`);

  const beside = pulse([BESIDE]);
  assert.equal(beside.full, 1, '墙在旁边时应退回原来的整圆');
  assert.deepEqual(beside.arcs, [], '墙在旁边时不该画弧段');

  // 再把入口真的跑一遍：弧段不是只停在数据里，Canvas 上得到的也必须是 `arc(a0, a1)`。
  game.particles.clear();
  game.particles.shockwaveArc = originalArc;
  originalArc.call(game.particles, 0, 0, '#fff', 100, 0.2, 0.3, 1.1);
  const drawn = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === 'arc') return (x, y, r, a0, a1) => drawn.push([x, y, r, a0, a1]);
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  game.particles.draw(ctx);
  assert.equal(drawn.length, 1, `应只画一段弧：${drawn.length}`);
  assert.ok(Math.abs(drawn[0][3] - 0.3) < 1e-9 && Math.abs(drawn[0][4] - 1.1) < 1e-9, `弧段角度应原样落到 Canvas：${drawn[0]}`);
});

test('钉子：燃爆照旧不看墙（它是炸出去的一下，不是照过去的一条光）', async (t) => {
  const { game, p } = await open(t, 'nova');
  const novaWall = measure(game, p, [[-150, 0]], [WALL], { weapon: 'aura', nova: true, frames: 4 })[0];
  assert.ok(novaWall > 0, `燃爆照旧炸得穿墙（这条是刻意的例外）：${novaWall}`);
});
