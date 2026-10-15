/**
 * 「倾灯」回归测试：这一版第一次让玩家**花自己的光**。
 *
 * 到 v58 为止灯油只是一个"捡得越多越亮"的曲线（火力、视野、亮度三合一）；
 * 倾灯把它变成弹药——倒出去一瓢是一片刻意留在敌人脚下的火，
 * 代价是自己的灯暗一阵。于是要钉住的事是：
 *
 *   1. 它真的**从灯的油桶里**扣钱，而不是凭空泼出一团火；
 *   2. 灯火不够满时**整发不出手**，而且**不吃冷却**（射速看的是补油多快，不是冷却多短）；
 *   3. 自己倒的那片火**只烧怪、不烧自己**（自动开火的武器不该罚玩家没按扳机）；
 *   4. 火会一层层给火里的怪续灼烧，往自家火上再倒一瓢解「火上浇油」（先数、再放这片新火）；
 *   5. 进化那把一次三瓢，而且"还是那一瓢的价钱"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 和 vortex.test.mjs 一样：开一局干净的，人挪到 700px 外，场面全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pour-${tag}-${Date.now()}-${Math.random()}`);
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
  game.enemies.clear();
  game.projectiles.clear();
  // 把墙清掉：这几条测的是"瓢从人飞到怪身上"这条线，墙上多一面都会让落点飘
  game.level.walls.length = 0;
  game.player.x = 700;
  game.player.y = 700;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.xpToNext = 1e9;
  game.player.weapons.clear();
  game.player.recomputeStats();
  return game;
}

const POUR_OF = () => globalThis.window.__WICKLIGHT__.data.pour;

/** 站着不动的一只怪：测的是火本身，不该让它自己走过来。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

const run = (game, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
};

/** 场上自己烧的那几片火（倾灯落下的那些）。 */
const ownFires = (game) => game.grounds.filter((g) => g.ignites && g.kind === 'fire');

test('倾灯：武器在池里、图鉴收录、进化链闭合', async (t) => {
  const game = await open(t, 'data');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const p = weapons.find((w) => w.id === 'pour');
  const tide = weapons.find((w) => w.id === 'pour_tide');
  assert.ok(p && tide, '武器池里应有倾灯与它的进化');
  assert.equal(p.kind, 'pour', '它自成一类（不是火球也不是雷）');
  assert.deepEqual(p.evolve, { passive: 'oilrain', into: 'pour_tide' }, '进化链应为 满级+油雨 → 灯潮');
  assert.ok(tide.evolved, '灯潮应标记为进化形态');
  assert.ok(tide.levels.length >= 5, '灯潮至少应有 5 级');
  assert.ok(tide.levels[0].count > p.levels[p.levels.length - 1].count, '灯潮一次三瓢（进化是把"一片"变成"一片接一片"）');
  assert.ok(tide.levels[0].damage > p.levels[p.levels.length - 1].damage, '进化第一级的伤害不该比满级倾灯低（不然卡面读成缩水）');
  assert.ok(game.codex.entry('weapon:pour') && game.codex.entry('weapon:pour_tide'), '图鉴应收录两件');
  assert.ok(game.codex.entry('mechanic:pour'), '图鉴应有一条「机制 · 倾灯」');

  // 数据表里那几条关系：它们错了不会抛异常，只会让手感变味
  const POUR = POUR_OF();
  for (const [k, v] of Object.entries(POUR)) {
    assert.equal(typeof v, 'number', `pour.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `pour.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(POUR.minOil > 0.5 && POUR.minOil < 1, '门槛要卡在"大半桶"上：满油才发太苛刻，随时能倒又成了替玩家做决定');
  assert.ok(POUR.fireSpread > 1, '火海要比爆炸大一圈，不然盖不住锁定的那只怪身后那一片人');
  assert.ok(POUR.douse >= 4, '「火上浇油」的门槛不该再倒一瓢顺手就够');
  for (const w of [p, tide]) {
    for (const [i, l] of w.levels.entries()) {
      assert.ok(Number.isFinite(l.pour), `${w.name} 第 ${i + 1} 级的一瓢油要是有限数`);
      assert.ok(l.pour > 0 && l.pour < 1, `${w.name} 第 ${i + 1} 级一瓢的油该在一桶之内（实际 ${l.pour}）`);
      assert.ok(l.pour < POUR.minOil, `${w.name} 第 ${i + 1} 级：一瓢不该贵到超过倒油门槛本身（那样倒不下去）`);
    }
  }
  // 倾灯：升级之后同一瓢更省油（"越用越划算"该在卡面上看得见）
  assert.ok(p.levels[p.levels.length - 1].pour < p.levels[0].pour, '倾灯升级之后同一瓢该更省油');
  // 灯潮：还是那一瓢的价钱（进化是把一瓢变三瓢，不是把价钱翻三倍）
  assert.ok(Math.abs(tide.levels[0].pour - p.levels[0].pour) < 1e-9, '灯潮一次三瓢，但收的还是基础倾灯那一瓢的油钱');
});

test('倾灯：灯火够满才倒，倒一瓢就从灯里少一瓢', async (t) => {
  const game = await open(t, 'pour');
  const weapons = globalThis.window.__WICKLIGHT__.data.weapons;
  const st = weapons.find((w) => w.id === 'pour').levels[0];
  assert.equal(game.pourCount, 0, '开局没倒过');
  assert.equal(game.pourSpent, 0, '开局没花过油');

  // 一瓢要落在谁脸上：摆一只，站着别动
  const mark = statue(game, 760, 700);
  game.player.oil = game.player.oilMax; // 满油
  game.player.addWeapon('pour');
  game.player.recomputeStats();

  run(game, 1);
  assert.equal(game.pourCount, 1, '满油时第一帧就倒出去了');
  assert.ok(Math.abs(game.pourSpent - st.pour) < 1e-9, `账面记下的是这一瓢的油（实际 ${game.pourSpent}）`);
  // 油桶里真的少了一瓢（1.8%/秒的自然衰减也在这几帧里，所以留一点余量）
  assert.ok(Math.abs(game.player.oilFrac - (1 - st.pour)) < 2e-3, `油桶里真的少了一瓢（现在 ${(game.player.oilFrac * 100).toFixed(1)}%）`);

  // 瓢落在怪脸上，炸开之后地上要留一片**自己烧的火**
  run(game, 30);
  assert.ok(mark.active, '怪还站着（血很厚）');
  const fires = ownFires(game);
  assert.equal(fires.length, 1, `地上应留下 1 片自己的火（实际 ${fires.length}）`);
  assert.ok(Math.abs(fires[0].life - POUR_OF().fireLife) < 0.6, '这片火该是"留一会儿"的，不是一帧');
  assert.ok(Math.abs(fires[0].r - st.radius * POUR_OF().fireSpread) < 1e-6, '火海的半径 = 爆炸半径 × fireSpread');
  // 瓢一落地，图鉴「机制 · 倾灯」那条就该被记上（和伏灯 / 旋灯一样，由"真倒过一瓢"来发现）
  assert.ok(game.codex.has('mechanic', 'pour'), '倒出第一瓢之后，图鉴「机制 · 倾灯」就收录了');
});

test('倾灯：灯火不满就整发不出手，而且不吃冷却', async (t) => {
  const game = await open(t, 'gate');
  const POUR = POUR_OF();
  statue(game, 760, 700);
  game.player.addWeapon('pour');
  game.player.recomputeStats();

  // 半桶油：低于门槛，倒不出去
  game.player.oil = 0.5 * game.player.oilMax;
  run(game, 30);
  assert.equal(game.pourCount, 0, `灯火 ${(game.player.oilFrac * 100).toFixed(0)}% 时不该能倒（门槛 ${POUR.minOil * 100}%）`);
  assert.equal(ownFires(game).length, 0, '地上也不该有火');

  // 补满之后**第一帧**就得能倒：说明刚才那段"倒不出去"没有偷偷吃掉冷却
  game.player.oil = game.player.oilMax;
  run(game, 1);
  assert.equal(game.pourCount, 1, '补满灯油后第一帧就倒出去了（被门槛挡住的那几帧不该记成冷却）');

  // 再等一段（冷却 2.5s 早过了），可偏偏油又不够 → 还是倒不出来；冷却始终不是它的开关，油才是
  run(game, 200);
  const before = game.pourCount;
  game.player.oil = 0.4 * game.player.oilMax;
  run(game, 10);
  assert.equal(game.pourCount, before, '油不够时，就算冷却早就走完了也照样倒不出去');
});

test('倾灯：自己倒的火只烧怪，不烧自己', async (t) => {
  const game = await open(t, 'self');
  const mark = statue(game, 756, 700);
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  run(game, 40);

  const fires = ownFires(game);
  assert.equal(fires.length, 1, '地上有一片火');
  // 玩家离火心 44px、远远在火圈里（半径 ~100px）：站在火里也该一根汗毛都不掉
  const dToPlayer = Math.hypot(fires[0].x - game.player.x, fires[0].y - game.player.y);
  assert.ok(dToPlayer < fires[0].r, `玩家确实站在自己的火里（离火心 ${dToPlayer.toFixed(0)}px / 火圈 ${fires[0].r.toFixed(0)}px）`);
  const hp0 = game.player.hp;
  run(game, 120);
  assert.equal(game.player.hp, hp0, '站在自己倒的火里不该被烧');
  assert.ok(mark.burn >= 1, `怪在火里被点着了（实际 ${mark.burn} 层）`);

  // 对照：同样是火，连珠伏灯留下的那层是**烧玩家**的——它不是这一件倒出来的油
  game.grounds.push({ x: game.player.x, y: game.player.y, r: 60, life: 3, dps: 40, kind: 'fire', ignites: false, igniteIn: 0 });
  run(game, 30);
  assert.ok(game.player.hp < hp0, '别的火（不是倾灯倒的）照旧烧玩家——这条豁免只给倾灯');
});

test('倾灯：往自家火上再倒一瓢解「火上浇油」（先数、再放这片新火）', async (t) => {
  const game = await open(t, 'douse');
  const POUR = POUR_OF();
  assert.equal(game.save.achievements.includes('pour_douse'), false, '开局不该有这个成就');

  // 第一瓢：只为了在地上点起一片自家火
  statue(game, 760, 700);
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour');
  game.player.recomputeStats();
  run(game, 30);
  const fire = ownFires(game)[0];
  assert.ok(fire, '第一瓢留下了一片火');

  // 让一整片怪**先站到那片火里**（这是「火上浇油」认的东西）
  game.enemies.clear();
  for (let i = 0; i < 6; i += 1) statue(game, fire.x + (i % 3) * 8 - 8, fire.y + Math.floor(i / 3) * 8 - 4);
  run(game, 2);
  assert.equal(game.save.achievements.includes('pour_douse'), false, '光站着还不算——得再倒一瓢');

  // 等冷却走完 + 补满油，第二瓢落在同一片火上：此时火里已经站着 6 只
  game.player.oil = game.player.oilMax;
  run(game, 170);
  assert.equal(game.pourCount, 2, '第二瓢倒出去了');
  assert.ok(game.save.achievements.includes('pour_douse'), `往自家火上再倒一瓢该解「火上浇油」（门槛 ${POUR.douse} 只）`);

  // 反过来：一片**空**地上倒，谁也不在火里，就不该算数
  const bare = await open(t, 'douse-bare');
  bare.player.oil = bare.player.oilMax;
  bare.player.addWeapon('pour');
  bare.player.recomputeStats();
  statue(bare, 760, 700);
  run(bare, 30);
  const f2 = ownFires(bare)[0];
  // 那一片怪挪到**离开这片火**的地方站着（离火心远出火圈），第二瓢落在它们身上
  bare.enemies.clear();
  const far = [];
  for (let i = 0; i < 6; i += 1) far.push(statue(bare, 900 + (i % 3) * 8 - 8, 700 + Math.floor(i / 3) * 8 - 4));
  run(bare, 2);
  assert.ok(Math.hypot(far[0].x - f2.x, far[0].y - f2.y) > f2.r, '它们确实站在那片火**外面**');
  bare.player.oil = bare.player.oilMax;
  run(bare, 170);
  assert.equal(bare.pourCount, 2, '人堆里照样能倒');
  assert.equal(bare.save.achievements.includes('pour_douse'), false, '但那几只是"刚被这瓢浇到"的，不是"预先已经站在火里"的，不算火上浇油');
});

test('倾灯：进化（灯潮）一次三瓢，而且只收一瓢的油钱', async (t) => {
  const game = await open(t, 'tide');
  const tide = globalThis.window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour_tide');
  // 摆一列怪，正对着那三瓢摊开的扇面：三瓢各自落在各自那只身上
  for (let i = 0; i < 9; i += 1) statue(game, 800, 640 + i * 15);
  game.player.oil = game.player.oilMax;
  game.player.addWeapon('pour_tide');
  game.player.recomputeStats();
  run(game, 1);
  assert.equal(game.pourCount, 1, '一次开火算作倒一瓢（一次三发的账，不是三瓢的账）');
  assert.ok(Math.abs(game.pourSpent - tide.levels[0].pour) < 1e-9, `一次开火只收一瓢的油钱（实际 ${game.pourSpent}）`);
  const flying = game.projectiles.all.filter((p) => p.active && p.weaponId === 'pour_tide');
  assert.equal(flying.length, 3, `灯潮一次泼出三瓢（实际 ${flying.length}）`);
  run(game, 90);
  assert.equal(ownFires(game).length, 3, '三瓢在地上留下三片火，一片接着一片');
});
