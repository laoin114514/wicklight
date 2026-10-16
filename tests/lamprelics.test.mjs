/**
 * 「弃灯」这条线（v83）回归测试：把**分灯**接成一套牌。
 *
 * 分灯是 v1 就有的动词（按 E 把一小罐油点在地上，把附近的黑暗引过去），
 * 可到 v82 为止它是**唯一**有教学卡、有手机按钮、有代价、却一件遗物都没有的机制——
 * 没有选择长在它身上，于是它一直是"偶尔想起来按一下"的东西。
 * 这一版照老规矩**一族一件**补上四件：
 *   · **焚灯**（焰火）灯被吃掉时炸开一圈（伤害 34 / 半径 120 / 两层灼烧）；
 *   · **灯罩**（长明）引怪半径 +40%（340 → 476px）、多亮 4 秒（11 → 15 秒）；
 *   · **拾灯**（灯油）被吃掉的那一刻，朝它走着的每一只回 0.6% 油，一盏封顶代价的六成；
 *   · **灯晕**（暗影）被它引着的怪走在它的光里移速 -30%。
 *
 * 这份用例盯的是**这四个数各自是谁在改**，以及三件最容易悄悄写错的事：
 *   · 「灯罩」改的是**引怪圈**（`lure`），不是亮芯（`radius`）：灯摆在那儿能不能把
 *     420px 外那只引过来，是这两件事的分界——写反了画面上看不出来（灯亮着，怪照样走过去）；
 *   · 「焚灯」与「拾灯」都结算在**灯被吃掉的那一帧**（那个 `life > 0.35` 的闸门），
 *     不是"放下去就结账"、也不是"每帧结一次"；
 *   · 「灯晕」走的是 `applySlow` 那条共用的减速账（合并规矩只有一份）——
 *     它和一条更狠的减速（霜印那 0.5 倍）撞在一起时，不该把人家顶回快的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 清场开一局：墙清掉（这份用例里有几条量的是"谁走了多远"），人挪到 700。
 *  和 vortexrelics.test.mjs 同一个开法，理由也一样：量的是规则，不是这一局的地图。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=lamprel-${tag}-${Date.now()}-${Math.random()}`);
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
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
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

/** 装备指定的遗物（其余状态一并钉住：油不掉、打不死、不暴击）。 */
function build(game, relics = []) {
  const p = game.player;
  p.relics.clear();
  for (const id of relics) p.relics.add(id);
  p.recomputeStats();
  p.oilDecayPerSec = 0;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  p.stats.critChance = 0;
  p.oil = p.oilMax;
  return p;
}

const run = (game, frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i += 1) {
    game.player.hp = 1e6;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
};

/** 站着不动、打不死的靶。 */
function statue(game, x, y, id = 'shade') {
  const e = game.enemies.spawn(id, x, y, 1, 0);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 会追人的靶（速度可以调小一点，好量"它走没走"）。 */
function chaser(game, x, y, speed = 68) {
  const e = game.enemies.spawn('shade', x, y, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.speed = speed;
  e.spawnTimer = 0;
  return e;
}

const LAMP_OF = () => globalThis.window.__WICKLIGHT__.data.lamp;
const RELICS = () => globalThis.window.__WICKLIGHT__.data.relics;

test('弃灯这套：正好四件、一族一件、五个数各归一件，而且都进图鉴', async (t) => {
  const game = await open(t, 'shape');
  const { data } = globalThis.window.__WICKLIGHT__;
  const LINE = { lampburst: 'flame', lampshade: 'lamp', lampember: 'oil', lamphaze: 'shade' };
  const KEYS = ['lampSpan', 'lampLure', 'lampBurst', 'lampEmber', 'lampSnare'];
  // 名单从 `mods` 里认出来（不是手抄的 id 列表）：以后再加一件、或者把某一件挪走，这里会当场红
  const family = RELICS().filter((r) => KEYS.some((k) => k in r.mods));
  assert.deepEqual(
    family.map((r) => r.id).sort(),
    Object.keys(LINE).sort(),
    `这条线正好四件（实际 ${family.map((r) => r.name).join('/')}）`,
  );
  for (const [id, tribe] of Object.entries(LINE)) {
    const def = data.relics.find((r) => r.id === id);
    assert.ok(def, `缺少遗物：${id}`);
    assert.equal(def.tribe, tribe, `${id} 应属于 ${tribe} 族`);
    assert.ok(def.blurb && def.price > 0, `${id} 应写清说明与价格`);
    assert.ok(!/undefined|NaN/.test(def.blurb), `${id} 的说明里不该有缺字段`);
    const entry = game.codex.entry(`relic:${id}`);
    assert.ok(entry, `${id} 应进图鉴`);
    assert.equal(entry.name, def.name, `${id} 图鉴名应与遗物一致`);
  }
  for (const k of KEYS) {
    const owners = RELICS().filter((r) => k in r.mods);
    assert.equal(owners.length, 1, `${k} 只该由一件遗物改（实际 ${owners.map((o) => o.name).join('/')}）`);
  }
  const p = build(game, Object.keys(LINE));
  assert.ok(p.flags.lampLure > 0 && p.flags.lampSpan > 0 && p.flags.lampBurst > 0, '前三个数该上身');
  assert.ok(p.flags.lampEmber > 0 && p.flags.lampSnare > 0, '后两个数该上身');
});

test('灯罩：多亮 4 秒、引怪圈宽四成——420px 外那只本来不跟它走', async (t) => {
  const LAMP = LAMP_OF();
  // 量"引没引到"：灯摆在人脚下，然后把靶摆在离灯 420px 的地方（正好卡在 340 与 476 之间），
  // 看它这一路上"朝灯走"还是"朝你走"。两件事有两处坑：
  //   · `chase` 那条行为自带一个 ±0.25 的左右摆动（`Enemy.behave` 里的 `strafe`），
  //     在 68 的脚力下那是每帧 ±17px/s 的横向速度，而它的相位是随机的（`e.wobble` 出生时摇一次）——
  //     不钉住它，量到的就是"这一帧摆动到哪儿了"，而不是"它朝谁走"；
  //   · 人会被场地边界夹住（1500×1100 的场地，人在 (700,700) 分灯、往右下走就停在 1086 那条线上），
  //     所以靶的位置得**从夹完之后的人**推出来，不能照着自己写的坐标摆。
  // 于是这里：把 `wobble` 钉在 0，靶摆在引怪圈里、方向与"灯→你"垂直（两个方向差 100°），
  // 再把整整 157 帧（= 摆动的一个整周期 2π/2.4）的速度取平均——摆动自己互相抵消，
  // 剩下的就是它这一路上真正对着谁。
  const probe = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    assert.equal(game.tryPlantLamp(), true, '开局油满、冷却好了，应该分得出来');
    const lamp = { x: game.lamps[0].x, y: game.lamps[0].y };
    const life = game.lamps[0].maxLife;
    game.player.x = -1200; // 走远一点：于是"朝灯走"和"朝你走"是两个差得很开的方向
    game.player.y = 1400;
    game.player.hp = 1e6;
    game.setInput(0, 0, false, false);
    game.update(1 / 60); // 先让边界把人夹到位（这一帧场上还没有敌人）
    const px = game.player.x;
    const py = game.player.y;
    const d = Math.hypot(px - lamp.x, py - lamp.y);
    const ux = (px - lamp.x) / d;
    const uy = (py - lamp.y) / d;
    const foe = chaser(game, lamp.x - uy * 420, lamp.y + ux * 420); // 与"灯→你"垂直的那一侧
    foe.wobble = 0;
    const frames = 157;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < frames; i += 1) {
      game.player.hp = 1e6;
      game.setInput(0, 0, false, false);
      game.update(1 / 60);
      sx += foe.vx;
      sy += foe.vy;
    }
    sx /= frames;
    sy /= frames;
    const len = Math.hypot(sx, sy);
    const cos = (x, y) => ((x - foe.x) * sx + (y - foe.y) * sy) / (Math.hypot(x - foe.x, y - foe.y) * len);
    return { life, toLamp: cos(lamp.x, lamp.y), toPlayer: cos(px, py), speed: len };
  };
  const bare = await probe('shadeBare', null);
  const shielded = await probe('shadeOn', 'lampshade');
  assert.equal(bare.life, LAMP.life, `裸装就是数据里那个数（${LAMP.life}s）`);
  assert.ok(Math.abs(shielded.life - (LAMP.life + 4)) < 1e-9, `该多亮 4 秒（${bare.life} → ${shielded.life}）`);
  // 裸装：420px 在 340 的圈外 → 它压根没看那盏灯，一路朝你来（实测 朝你 1.00 / 朝灯 -0.21）
  assert.ok(bare.toPlayer > 0.9, `裸装时它该朝你走（实测 朝你 ${bare.toPlayer.toFixed(2)} / 朝灯 ${bare.toLamp.toFixed(2)}）`);
  assert.ok(bare.toLamp < 0.2, `裸装时它不该朝灯走（实测 朝灯 ${bare.toLamp.toFixed(2)}）`);
  // 带上灯罩：476 的圈把它圈进来 → 它眼里只剩那盏灯了（实测 朝灯 1.00 / 朝你 0.11）
  assert.ok(shielded.toLamp > 0.9, `带上灯罩它就只朝灯走了（实测 朝灯 ${shielded.toLamp.toFixed(2)} / 朝你 ${shielded.toPlayer.toFixed(2)}）`);
  assert.ok(
    shielded.toLamp - shielded.toPlayer > 0.5,
    `灯该是它眼里的目标，而不是你（朝灯 ${shielded.toLamp.toFixed(2)} vs 朝你 ${shielded.toPlayer.toFixed(2)}）`,
  );
  assert.ok(Math.abs(shielded.speed - bare.speed) < 2, '引怪只是换了目标，不该顺手改它的脚力');
});

test('焚灯：灯被吃掉的那一帧炸开一圈，伤害记在「弃灯」头上；裸装什么都不炸', async (t) => {
  const LAMP = LAMP_OF();
  const eat = async (tag, relic) => {
    const game = await open(t, tag);
    build(game, relic ? [relic] : []);
    game.tryPlantLamp();
    const lamp = { x: game.lamps[0].x, y: game.lamps[0].y };
    // 一只怪走到灯上去（它就是"吃掉"这盏灯的那只）
    const eater = statue(game, lamp.x + 20, lamp.y);
    // 旁边再摆两只（在爆炸半径里）和一只远的（在半径外）。
    // ⚠ 远的那只摆的是**绝对距离 200px**，不是 `burstRadius + 80`：跟着数据一起动的那种写法
    //   是个假把关——把半径从 120 悄悄改成 300，它会把靶子也挪到 380 去，然后照样"通过"
    //   （实测过：那条变异体就是这么活下来的）。200 这个数同时说明它是什么东西：
    //   **一盏小灯被啃掉那一下的余波**，不是半屏清场——半径一旦过了 200，这一条就该红。
    const near1 = statue(game, lamp.x + LAMP.burstRadius - 20, lamp.y);
    const near2 = statue(game, lamp.x, lamp.y + LAMP.burstRadius - 20);
    const far = statue(game, lamp.x + 200, lamp.y);
    game.enemies.applyBurn ?? null;
    game.enemies.forEach((e) => {
      if (e !== eater) e.speed = 0;
    });
    run(game, 120); // 两秒：够它把灯啃掉
    assert.equal(game.lamps.length, 0, '这盏灯该已经被吃掉了');
    return {
      dealt: game.damageBySource.get('lamp') ?? 0,
      eaterBurn: eater.burn,
      nearBurn: near1.burn + near2.burn,
      nearHp: near1.hp + near2.hp,
      farBurn: far.burn,
      best: game.lampBest,
    };
  };
  const bare = await eat('burstBare', null);
  const burst = await eat('burstOn', 'lampburst');
  assert.equal(bare.dealt, 0, '裸装：那盏灯就是被吃掉，什么都不发生');
  assert.equal(bare.nearBurn, 0, '裸装：旁边那几只身上不该有灼烧');
  assert.ok(burst.dealt > 0, `带上焚灯，这一下要记在「弃灯」头上（实际 ${burst.dealt.toFixed(0)}）`);
  assert.ok(burst.nearBurn > 0, '爆炸该给圈里的人点上灼烧');
  assert.equal(burst.farBurn, 0, '圈外那只（200px）不该被烧到——这一下是一盏灯的余波，不是半屏清场');
  assert.ok(burst.nearHp < 2e9, '圈里那两只该真的掉血');
  assert.ok(burst.best >= 3, `被吃掉那一刻该点清人头（引怪圈里有几只），实测 ${burst.best}`);
});

test('拾灯：被吃掉那一刻按"朝它走着的几只"回油，一盏封顶代价的六成', async (t) => {
  const LAMP = LAMP_OF();
  const eat = async (tag, foes) => {
    const game = await open(t, tag);
    const p = build(game, ['lampember']);
    game.tryPlantLamp();
    const lamp = { x: game.lamps[0].x, y: game.lamps[0].y };
    const eater = statue(game, lamp.x + 20, lamp.y);
    // 其余的都摆在引怪圈里（200px），它们也在朝灯走——"引来了几只"数的是这个
    for (let i = 0; i < foes; i += 1) {
      const a = (i / Math.max(1, foes)) * Math.PI * 2;
      statue(game, lamp.x + Math.cos(a) * 200, lamp.y + Math.sin(a) * 200);
    }
    p.oil = p.oilMax * 0.5; // 油留一半：好量"回来了多少"
    const before = p.oil / p.oilMax;
    run(game, 120);
    assert.equal(game.lamps.length, 0, '这盏灯该已经被吃掉了');
    void eater;
    return { back: p.oil / p.oilMax - before, best: game.lampBest, had: game.lampOilBack };
  };
  // 封顶线在 14 只上：14 × 0.6% = 8.4% 正好是这一瓢油（14%）的六成，再多也是一样的数。
  // （一开始这里只摆了 9 只 —— 连啃灯那只一共 10 只、回 6.0%，压根没碰到封顶，
  //   于是这条用例量的是"线性那一段"，而不是它想量的那句"收得回来、收不回本"。）
  const few = await eat('ember1', 1);   // 引走 2 只（连啃灯的那只）
  const many = await eat('ember14', 14); // 引走 15 只 → 9% > 封顶，落在 8.4%
  assert.ok(Math.abs(few.back - 2 * LAMP.emberBack) < 1e-9, `引来 2 只就回 2 份油（实际 ${(few.back * 100).toFixed(2)}%）`);
  assert.ok(Math.abs(many.back - LAMP.cost * LAMP.emberCap) < 1e-9, `引来一群也只回代价的六成（实际 ${(many.back * 100).toFixed(2)}%）`);
  assert.ok(many.back < LAMP.cost, '被吃掉一盏灯，收回来的一定比那一瓢油少');
  assert.equal(few.best, 2, '点人头：啃灯那只 + 圈里那只 = 2');
  assert.equal(many.best, 15, `引来的只数要照实记（实际 ${many.best}）`);
});

test('灯晕：被引着的怪走在它的光里慢三成，而一条更狠的减速不会被顶回来', async (t) => {
  const walk = async (tag, relics, slowFirst, slowSpan = 1.4) => {
    const game = await open(t, tag);
    build(game, relics);
    game.tryPlantLamp();
    const lamp = { x: game.lamps[0].x, y: game.lamps[0].y };
    const foe = chaser(game, lamp.x + 200, lamp.y);
    if (slowFirst) game.applyHit(foe, 10, false, 0, 0, 0, { slow: slowSpan, source: 'whip' }); // 霜印那条 0.5 倍
    const x0 = foe.x;
    run(game, 60);
    return Math.abs(foe.x - x0); // 一秒钟走了多少 px
  };
  const bare = await walk('hazeBare', [], false);
  const hazed = await walk('hazeOn', ['lamphaze'], false);
  assert.ok(bare > 50, `裸装时它按自己的脚力走（实测 ${bare.toFixed(1)}px/s）`);
  assert.ok(
    Math.abs(hazed / bare - 0.7) < 0.06,
    `带上灯晕该慢到七成（${bare.toFixed(1)} → ${hazed.toFixed(1)}px/s）`,
  );
  // 合并规矩：更狠的那一条说了算（灯晕 0.7 倍不该把霜印那 0.5 倍顶回快的）
  const chilled = await walk('hazeChill', ['lamphaze'], true);
  assert.ok(
    Math.abs(chilled / bare - 0.5) < 0.06,
    `霜印那条更狠，该是五成（实测 ${chilled.toFixed(1)}px/s，裸装 ${bare.toFixed(1)}）`,
  );
  // 裸装：这盏灯**一点都不碰**别人的减速。慢 0.5 倍那一条只挂 0.4 秒，而这盏灯亮着整整 11 秒——
  // 要是灯的光顺手把别人的减速一遍遍"续"着（`applySlow` 的时长是取长的那个），
  // 那一秒钟就都慢在 0.5 倍上。所以这一条量的是"这盏灯本身什么都不做，一切都从那件遗物开始"：
  // 一秒里 0.4 秒慢一半 + 0.6 秒正常 = 68 × 0.8 ≈ 54.6px（实测 54.7 / 裸装 68.2）。
  const bareChilled = await walk('hazeBareChill', [], true, 0.4);
  assert.ok(
    Math.abs(bareChilled / bare - 0.8) < 0.06,
    `裸装时那 0.4 秒说了算，灯不替它续命（实测 ${bareChilled.toFixed(1)}px/s，裸装 ${bare.toFixed(1)}）`,
  );
});

test('空城：一盏灯引来的敌人攒到门槛就解锁；没到就不解锁，而且吹灯客不算', async (t) => {
  const LAMP = LAMP_OF();
  const lure = async (tag, foes) => {
    const game = await open(t, tag);
    build(game, []);
    game.tryPlantLamp();
    const lamp = { x: game.lamps[0].x, y: game.lamps[0].y };
    statue(game, lamp.x + 20, lamp.y);
    for (let i = 0; i < foes; i += 1) {
      const a = (i / foes) * Math.PI * 2;
      statue(game, lamp.x + Math.cos(a) * 200, lamp.y + Math.sin(a) * 200);
    }
    // 圈里再摆一只**吹灯客**（站着不动）：它有自己的目标（灯台 / 这盏弃灯），
    // 所以"被这盏灯引过来的"那一份人数里不该有它——它的行动不是这盏灯引的，是它自己找上来的。
    const snuffer = statue(game, lamp.x, lamp.y - 200, 'snuffer');
    snuffer.speed = 0;
    assert.equal(snuffer.defId, 'snuffer', '前提：圈里真的站着那只吹灯客');
    run(game, 120);
    let snufferThere = false;
    game.enemies.forEach((e) => {
      if (e === snuffer) snufferThere = true;
    });
    return { best: game.lampBest, snufferThere, got: game.save.achievements.includes('lamp_crowd') };
  };
  const few = await lure('crowdFew', 3);
  const many = await lure('crowdMany', LAMP.crowd);
  assert.ok(few.snufferThere && many.snufferThere, '前提：量到最后那只吹灯客还站在圈里（不然这一条什么都没量到）');
  assert.equal(few.best, 4, '点人头：啃灯那只 + 圈里 3 只影蛭 = 4（吹灯客不算）');
  assert.equal(few.got, false, `${few.best} 只不该解锁（门槛 ${LAMP.crowd}）`);
  assert.equal(many.best, LAMP.crowd + 1, `引来的只数要照实记（实际 ${many.best}）`);
  assert.equal(many.got, true, `${many.best} 只该解锁「空城」`);
});

test('这一族第一次到手、而你还没分过灯时，要主动讲一次"这四件长在那盏灯上"', async (t) => {
  // 和「拨芯」那四件要你先按 C 是同一个坑：焚灯 / 灯罩 / 拾灯 / 灯晕**全部**只在
  // 你按 E 分出去的那盏灯身上生效——一次都不分，它们在手里就是四张废牌。
  // 所以拿到头一件的那一刻要讲一次；而且这一句要比"按 E"多讲一件事：**摆在哪一边**
  // （台架上量过：摆在追兵本来就要路过的那条线上几乎一点都不省，拐个弯才买得到那两三秒）。
  const game = await open(t, 'hint');
  const { hud } = globalThis.window.__WICKLIGHT__;
  const tips = () => game.save.tips ?? [];
  // 说明卡挂在 `toastRoot` 上（不是屏幕正中那块面板），这里只读那几张卡的 innerHTML
  const cardText = () =>
    hud.toastRoot.children
      .filter((c) => String(c.className).includes('toast--tip'))
      .map((c) => c.innerHTML)
      .join(' | ');
  const p = build(game, []);

  run(game, 50); // 那一遍扫描是每 0.75 秒一次，走的是主循环
  assert.ok(!tips().includes('relic:lamp-family'), '还没拿到那四件，不该讲这一句');

  p.addRelic('lampburst');
  p.recomputeStats();
  run(game, 50);
  assert.ok(tips().includes('relic:lamp-family'), '拿到了、又还没分过灯：该把"它长在那盏灯上"讲一次');
  const html = cardText();
  assert.ok(/弃灯/.test(html) && /按 E/.test(html), '那张卡上要写着怎么用（按 E）', html.slice(0, 200));
  assert.ok(html.includes('方向'), '还得讲清"摆在哪一边"——这一族一半的账在这儿', html.slice(0, 260));
  assert.equal(game.showTip('relic:lamp-family', 'x', 'y'), false, '同一条只讲一次');

  // 已经分过灯的人不用再听：按过 E 的人早就知道会发生什么，图鉴里也已经有了这一条
  const game2 = await open(t, 'hint-known');
  const p2 = build(game2, []);
  game2.save.tips = (game2.save.tips ?? []).filter((k) => k !== 'relic:lamp-family');
  assert.equal(game2.tryPlantLamp(), true, '先分一盏出来');
  assert.ok(game2.save.codex.includes('mechanic:lamp'), '分出一盏就该记进图鉴——判据是"用出来了"，不是"有没有人来吃"');
  p2.addRelic('lamphaze');
  p2.recomputeStats();
  run(game2, 60);
  assert.ok(!(game2.save.tips ?? []).includes('relic:lamp-family'), '已经分过灯的人不该再吃一张说明卡');
});

test('分灯的图鉴条目在"分出去"那一刻就记上（圈里没人也一样）', async (t) => {
  // 这一条盯的是一个很具体的坑：从前 `mechanic:lamp` 挂在"灯被吃掉、而且引怪圈里还有别人"那一帧上。
  // 于是**分了一盏灯却没人来吃**的玩家（在自己家门口放一盏、或者干脆放出去就没管）图鉴里永远没有这一条，
  // 而上面那张说明卡正是拿它当"你已经懂了"的判据——两件事一起错的时候，玩家会一直被当成新手。
  // 判据应当和伏灯 / 旋灯 / 倾灯一样：动词用出来了就算用出来了。
  const game = await open(t, 'codex');
  build(game, []);
  game.save.codex = (game.save.codex ?? []).filter((k) => k !== 'mechanic:lamp');
  assert.equal(game.codex.has('mechanic', 'lamp'), false, '前提：这一局还没分过灯');
  assert.equal(game.tryPlantLamp(), true);
  assert.ok(game.save.codex.includes('mechanic:lamp'), '按 E 分出一盏的这一刻就该记上');
  // 空着手放一盏：圈里一只怪都没有，它最后自己烧完（不炸、不结算）
  run(game, 60 * 12);
  assert.equal(game.lamps.length, 0, '放空一盏：11 秒后它自己烧完');
  assert.equal(game.lampCount, 1, '分过几盏是"按过几次 E"');
});
