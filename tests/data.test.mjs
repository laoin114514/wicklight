/**
 * 数据表完整性检查：武器进化链、遗物、夜咒、被动。
 * 这些表是纯数据，写错一个字（比如进化指向不存在的武器）不会抛异常，
 * 只会让玩家在满级时永远拿不到进化——正是这种错误最容易漏掉。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('武器 / 遗物 / 夜咒 / 被动数据表', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data } = globalThis.window.__WICKLIGHT__;
  t.after(() => loop?.stop?.());

  assert.ok(data, '构建产物应导出静态数据表');

  const ids = (arr) => arr.map((x) => x.id);
  const dup = (arr) => ids(arr).filter((id, i) => ids(arr).indexOf(id) !== i);
  // 掠影 / 伏灯 / 旋灯那一串调参值是"名字 → 数"的表，不是条目列表，单独按数值校验（见下）
  for (const [name, arr] of Object.entries(data)) {
    if (name === 'graze' || name === 'mines' || name === 'vortex' || name === 'pour' || name === 'nova' || name === 'emberwind' || name === 'hunt' || name === 'arrival' || name === 'wick') continue;
    assert.ok(arr.length > 0, `${name} 不应为空`);
    assert.deepEqual(dup(arr), [], `${name} 存在重复 id`);
    for (const item of arr) {
      assert.ok(item.id && typeof item.id === 'string', `${name} 有 item 缺少 id`);
      assert.ok(item.name && item.blurb, `${name}.${item.id} 缺少名称或说明`);
    }
  }

  // ── 掠影 / 灯焰高涨的调参表：全是正数，而且几条关系必须成立 ──
  // 这张表是"改了不会报错、只会让手感变味"的那一类，所以把关系也钉住。
  const graze = data.graze;
  assert.ok(graze, '构建产物应导出掠影调参表');
  for (const [k, v] of Object.entries(graze)) {
    assert.equal(typeof v, 'number', `graze.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `graze.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(graze.rateShot <= graze.rateEnemy, '弹幕那条线的权重不该比敌人还高');
  assert.ok(graze.rangeShot <= graze.rangeEnemy, '弹幕更小更快，带子不该比敌人宽');
  assert.ok(graze.holdBack > 1, '出了带子之后"回味"应当比攒快');
  assert.ok(graze.speedFloor < graze.speedRef, '"动起来"的门槛要低于拉满速度的基准');
  assert.ok(graze.heatMax / graze.decay >= 5, '停手之后热度要能撑几秒，不该一停就归零');
  assert.ok(graze.heatMax >= graze.heatDash, '一次冲刺穿弹幕不该顶满整条表');
  assert.ok(graze.blazeHeatMult >= 0.4 && graze.blazeHeatMult <= 0.6, '烧着时攒热只该攒一半上下');
  assert.ok(graze.blazeCarry > 0 && graze.blazeCarry <= 0.6, '烧完留下的热度不该超过一半');
  assert.ok(graze.blazeExtend > 0 && graze.blazeExtendCap > 1, '焰里击杀应当能续焰，而且有上限');

  // ── 伏灯的调参表：和掠影同一类（改了不报错，只会让手感变味）──
  const mine = data.mines;
  assert.ok(mine, '构建产物应导出伏灯调参表');
  for (const [k, v] of Object.entries(mine)) {
    assert.equal(typeof v, 'number', `mines.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `mines.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(mine.arm < mine.life * 0.2, '上弦只该占寿命的一小截：它是"先放着"的东西，不是手雷');
  assert.ok(mine.max >= 3, '地上至少要能同时摆几颗，不然"布"这个字立不住');
  assert.ok(mine.fireDps > 0 && mine.fireLife > 0, '进化留下的那片火要有时间也有伤害');
  assert.ok(mine.multiHit >= 3, '「伏击」的门槛不该一颗雷炸一下就够');
  assert.ok(mine.lightRadius > mine.glow, '照亮周围的光该比灯身那圈光晕大');
  assert.ok(mine.chainReach >= 0.5, '连爆够得着的范围不该比一颗的爆炸半径小太多（那样就永远串不起来）');
  assert.ok(mine.chainFuse > 0 && mine.chainFuse < mine.arm, '连爆的引信要短到"一串"听起来像一串，又不为 0（同一帧一起炸就只剩一团白光）');
  assert.ok(mine.chainFuse >= 2 / 60, '引信至少得让人看见几帧，不然连爆在画面上是"瞬移"');
  assert.ok(mine.chainBest >= 3, '「一串灯」的门槛不该一颗雷加一颗邻居就够');
  assert.ok(mine.lure > 100, '灯蛾该从一段距离外就闻到这盏灯，不然"拿它当饵"立不住');
  assert.ok(mine.mothBait >= 3, '「以灯为饵」的门槛不该一颗雷炸到一只蛾就够');

  // ── 旋灯的调参表：同样是"改了不报错，只会让手感变味"的那一类 ──
  const vortex = data.vortex;
  assert.ok(vortex, '构建产物应导出旋灯调参表');
  for (const [k, v] of Object.entries(vortex)) {
    assert.equal(typeof v, 'number', `vortex.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `vortex.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(vortex.pull > 100, '吸力该比大多数怪走得快，不然"拢起来"这句话立不住');
  assert.ok(vortex.bossPull < vortex.elitePull && vortex.elitePull < 1, '首领该比精英更拽不动，普通怪完全拽得动');
  assert.ok(vortex.burst < 1, '收缩那一下的半径该比吸入半径小：站在边上的该有机会躲过');
  assert.ok(vortex.swallow < vortex.burst, '弹幕被吞掉的圈得比收缩爆炸还小，不然"卷进来"看不出过程');
  assert.ok(vortex.crowd >= 4, '「一网打尽」的门槛不该同时拽两三只就够');
  assert.ok(vortex.life > 0.5 && vortex.life < 3, '拽的时长该够把一圈人收拢，又不至于把人按在原地');
  assert.ok(vortex.lightRadius > 0 && vortex.lightIntensity > 0, '漩涡中心那盏灯要真的照亮周围');
  assert.ok(vortex.pullShape > 0 && vortex.pullShape < 1, '吸力要往外侧垫起来（1 = 线性，圈边会变成空头承诺：看着进去了，其实一步不动）');
  assert.ok(vortex.reward > 0, '收尾伤害要随"这一下打到几只"涨，不然"拢"这件事在它自己身上没有账');
  assert.ok(
    Number.isInteger(vortex.haul) && vortex.haul > vortex.crowd && vortex.haul <= 16,
    `「收网」的门槛要是比「一网打尽」更高的整只数（实际 ${vortex.haul}）`,
  );
  assert.ok(vortex.spin > 1, '旋臂转得起来才像"在吸"，不该是慢慢挪');

  // ── 倾灯的调参表：同样是"改了不报错，只会让手感变味"的那一类 ──
  const pour = data.pour;
  assert.ok(pour, '构建产物应导出倾灯调参表');
  for (const [k, v] of Object.entries(pour)) {
    assert.equal(typeof v, 'number', `pour.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `pour.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(pour.minOil > 0.5 && pour.minOil < 1, '倒油的门槛要卡在"大半桶"上，不该满油才发、也不该随时能倒');
  assert.ok(pour.fireLife > 1 && pour.fireLife < 10, '一片火要烧够几秒才叫"留下来烧"，又不该像永久地形');
  assert.ok(pour.fireSpread > 1, '火海要比爆炸大一圈，不然锁在最前那只脸上的瓢盖不住后面那一片人');
  assert.ok(pour.igniteEvery > 0 && pour.igniteEvery < 1.5, '续层的间隔要密到看得出"一层层叠上去"，又不该一帧顶满');
  assert.ok(pour.igniteStacks >= 1, '每次续层至少要给一层');
  assert.ok(pour.douse >= 4, '「火上浇油」的门槛不该再倒一瓢顺手就够（要真是"往火里再浇"）');
  assert.ok(pour.costHint > 0 && pour.costHint < pour.minOil, '一瓢的油不该贵到超过倒油门槛本身');

  // ── 爆灯的调参表：这一张表管着"燃爆值不值得把灯打空"，比前几张更难回头改 ──
  const nova = data.nova;
  assert.ok(nova, '构建产物应导出爆灯调参表');
  for (const [k, v] of Object.entries(nova)) {
    assert.equal(typeof v, 'number', `nova.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `nova.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(nova.overburnAt > 0.3 && nova.overburnAt < 0.8, '爆灯的门槛该卡在"大半桶"上，不该随时能爆、也不该满油才爆');
  assert.ok(nova.overburnCost > nova.cost, '爆灯要真的多烧一口油（不然"烧油换爆发"这句话就只剩爆发）');
  assert.ok(nova.overburnAt - nova.overburnCost > 0.1, '爆完还得剩下一口：这条线不该把人直接推到油尽');
  // 和倾灯的关系：爆灯的门槛要**低于**倒油的门槛，这样"先倒一瓢再爆"才连得起来；
  // 两条线一样高的话，一桶油上那两个动词就只剩二选一，看不到连招。
  assert.ok(pour.minOil > nova.overburnAt, '倒油的门槛该高过爆灯：先倒后爆这条连法要立得住');
  assert.ok(nova.overburnDamage >= 0.5, '爆灯至少要把伤害提五成，不然多烧那一口不值');
  assert.ok(nova.overburnArea > 0 && nova.overburnArea < 1, '半径也要长，但不该长到"整屏清场"');
  assert.ok(nova.overburnBurn >= 1, '爆灯的火要留下灼烧，不然它就只是一发更大的爆炸');
  assert.ok(nova.refundSpan > 0 && nova.afterglowSpan > 0 && nova.ashSpan > 0, '这条线那三个窗口都要有时长');

  // ── 余烬风的调参表：这一张管着"风是墙还是背景板"，全看下面这几条关系 ──
  const ember = data.emberwind;
  assert.ok(ember, '构建产物应导出余烬风调参表');
  for (const [k, v] of Object.entries(ember)) {
    assert.equal(typeof v, 'number', `emberwind.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `emberwind.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(ember.speedEnd < 1, '火种永远追不上走路的玩家——"顺着风跑"必须是确定安全的答案（这条是它教的第一句话）');
  assert.ok(ember.speedEnd > ember.speedStart, '风要越吹越急：尾巴比开头快，玩家才有"一直被催着走"的感觉');
  assert.ok(ember.stackMax >= 2 && ember.stackMax <= 4, '层数上限太高就成了一次性罚站，太低就只看得到一层');
  assert.ok(ember.oilPerStack > 0 && ember.stackMax * ember.oilPerStack < 0.06, '顶满时每秒的烧油量不该超过基础衰减（1.8%）的三倍上下：能吃掉一箱油，但不该一击致命');
  assert.ok(ember.upwind > ember.rowSpread * 0.6, '火种要从画面上那一头来：生成点不该落在脸上');
  assert.ok(ember.rowEvery < ember.moteLife, '隔得比寿命还久，场上就永远只有一排（铺不出"一阵风"）');
  assert.ok(ember.rowCount >= 2 && ember.rowSpread / ember.rowCount < ember.radius * 8, '一排里两颗火种之间不能留下一条能大摇大摆穿过去的缝');

  // ── 「循灯」的调参表：改错了不会报错，只会让"收尾"变成"整局都在追你"。
  // 这里守的是它的三条边界（见 data/hunt.ts）：只在收尾、只碰你看不见的、永远追不上走路的你。
  const huntTune = data.hunt;
  assert.ok(huntTune, '构建产物应导出循灯调参表');
  for (const [k, v] of Object.entries(huntTune)) {
    assert.equal(typeof v, 'number', `hunt.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `hunt.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(huntTune.mult > 1, '它是"加速"那条规则：倍数不大于 1 就等于没写');
  assert.ok(huntTune.aliveAt >= 1 && huntTune.aliveAt <= 5, '窗口只该在"一波的最后一小撮"时开，不能一整波都在追');
  assert.ok(huntTune.near >= 250, 'near 以内一点不改：太小就成了"连你看得见的也要加速"（隐身加速）');
  assert.ok(huntTune.span >= 200, '加速要有个坡度：太陡就是"一步到位"，看不见"越远越急"这件事');
  assert.ok(huntTune.ceiling < 220, '绝对速度上限必须低于玩家基础步速(220)：这一条是"不用回头捡"，不是"跑不掉"');
  assert.ok(huntTune.ceiling > huntTune.near * 0.4, '但也不能低到"循灯"根本没在走：它得看得出来在赶路');

  // ── 「赴灯」的调参表：和循灯同一类（改了不报错，只会让"怪从哪儿来"变味）。
  // 两条底线写在这里：**近的那头不许进视野，远的那头不许比原来更远**。
  const arrival = data.arrival;
  assert.ok(arrival, '构建产物应导出赴灯调参表');
  for (const [k, v] of Object.entries(arrival)) {
    assert.equal(typeof v, 'number', `arrival.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `arrival.${k} 应当是正数（实际 ${v}）`);
  }
  assert.ok(arrival.min > 320,
    `min 必须大于灯火常规最亮时能照到的地方（320px）——不然怪会当着玩家的面凭空出现（实际 ${arrival.min}）`);
  assert.ok(arrival.max <= 940,
    `max 不许超过原来那个生成环的外沿（940px）：这条规则只许把慢怪往里拉，不许把谁推得更远（实际 ${arrival.max}）`);
  assert.ok(arrival.max > arrival.min * 1.5, '两头之间要留得下一段距离，不然"按脚力分配"就压成了一条窄缝');
  assert.ok(arrival.jitter > 0 && arrival.jitter < 0.25, '抖动只该是"别落成一圈"的程度，不该把到场时间打乱');
  // "看得见就不许刷"是恒等式：真正生效的近边界是 max(min, 灯火半径 + margin)，
  // 所以 min 只是地板、margin 是灯外那一小圈留白——两个都不许被人顺手抹掉。
  assert.ok(arrival.margin > 0 && arrival.margin < 120,
    `margin 是"灯外再留一小圈"，不是"再推远一大截"（实际 ${arrival.margin}）`);
  assert.ok(arrival.min + arrival.margin < arrival.max, '近端（地板 + 留白）要留得下远边界，不然带子会翻过来');

  // ── 「拨芯」的调参表（v69）：这一张管着"把火压住"到底划不划算，
  // 所以除了"都是正数"，还要钉住那四个乘数之间的**关系**——它们是一条账，
  // 改任何一个而不管另外三个，这个动作就会变成"要么必按、要么永远别按"。
  // （表里有一个 `color` 是配色不是数，单独跳过。）
  const wick = data.wick;
  assert.ok(wick, '构建产物应导出拨芯调参表');
  for (const [k, v] of Object.entries(wick)) {
    if (k === 'color') continue;
    assert.equal(typeof v, 'number', `wick.${k} 应当是数字`);
    assert.ok(Number.isFinite(v) && v > 0, `wick.${k} 应当是正数（实际 ${v}）`);
  }
  for (const k of ['lightMult', 'glowMult', 'damageMult', 'oilMult']) {
    assert.ok(wick[k] < 1, `拨到底的 ${k} 必须小于 1：拨芯要真的改变点什么才有这个动词（实际 ${wick[k]}）`);
  }
  // 省下来的油要明显大于削掉的伤害，否则这笔交换怎么算都亏；但又不能省到"零代价"。
  assert.ok(wick.oilMult < wick.damageMult, '省下的油该比削掉的火力实在——不然这个动作没有理由存在');
  assert.ok(wick.damageMult < 1 && wick.damageMult > 0.4, '火力是这一版的代价之一：削得动，但不该直接哑掉');
  assert.ok(wick.lightMult >= 0.35 && wick.lightMult <= 0.6, '灯火半径砍掉四到六成：看得见的变化要一眼看出来');
  assert.ok(wick.minRadius > 0 && wick.minRadius < 96, '半径地板要低于"油尽时那 96px"：它只是防瞎，不是白送一圈');
  assert.ok(wick.spanDown < wick.spanUp, '拨小要快过拨回来（躲得及时、烧旺得慢）');
  assert.ok(wick.spanDown >= 0.15 && wick.spanUp <= 0.8, '两个时长都该是"一眼看得出来在变"的那个量级（0.1 秒级 = 啪一下换画面）');
  assert.ok(wick.achieveSeconds >= 30, '成就那条线不该是"顺手按两下就解了"');

  // ── 「拨芯」这条线上的四件遗物（v70）：它们都是**有条件的**加成，条件就是 `player.dimmed`。
  // 数值区间单独钉一遍：这四件改的是同一个动词，任何一件给多了，它都会从"另一种活法"
  // 变成"按下去就没有理由拨回来"——而拨芯的全部意思就是"随时可以拨回来"。
  const wickFamily = data.relics.filter((r) => ['wickGuard', 'wickEmber', 'wickStride', 'wickThrift'].some((k) => k in r.mods));
  assert.equal(wickFamily.length, 4, `拨芯这条线就是四件（实际 ${wickFamily.length}）`);
  const mod = (k) => wickFamily.map((r) => r.mods[k]).find((v) => v !== undefined);
  assert.ok(mod('wickGuard') > 0.1 && mod('wickGuard') < 0.4, `遮光的减伤该是"看得见的折扣"，不是无敌（实际 ${mod('wickGuard')}）`);
  assert.ok(mod('wickEmber') >= 1 && mod('wickEmber') <= 2, `暗火每次命中添的层数不该超过"两层"（实际 ${mod('wickEmber')}）`);
  assert.ok(mod('wickStride') > 0.05 && mod('wickStride') < 0.25, `夜步的移速该小于"轻羽 + 疾风靴"那种无条件加成（实际 ${mod('wickStride')}）`);
  assert.ok(mod('wickThrift') > 0.001 && mod('wickThrift') < 0.005, `守芯每秒回的油要低于拨芯省下来的那一档（实际 ${mod('wickThrift')}）`);
  // "它盖不掉拨着芯的油耗"这一条只能**量**出来（净烧速仍然大于零），
  // 所以钉在 `wickrelics.test.mjs` 的「守芯」那一条里，这里只管调理参数区间。

  // ── 敌人 / 词缀目录（结构不同：无 blurb，改为校验数值与行为）──
  const catalog = globalThis.window.__WICKLIGHT__.catalog;
  assert.ok(catalog, '构建产物应导出敌人 / 词缀目录');
  assert.ok(catalog.enemies.length >= 12, `敌人数量偏少（${catalog.enemies.length}）`);
  assert.deepEqual(dup(catalog.enemies), [], '敌人存在重复 id');
  for (const e of catalog.enemies) {
    assert.ok(e.name && e.hp > 0 && e.radius > 0, `敌人 ${e.id} 数值非法`);
    assert.ok(typeof e.behavior === 'string' && e.behavior.length > 0, `敌人 ${e.id} 缺少行为`);
  }
  const behaviors = new Set(catalog.enemies.map((e) => e.behavior));
  for (const b of ['charge', 'beacon']) {
    assert.ok(behaviors.has(b), `应存在 ${b} 行为的敌人`);
  }
  assert.deepEqual(dup(catalog.affixes), [], '词缀存在重复 id');
  for (const a of catalog.affixes) assert.ok(a.name && a.blurb, `词缀 ${a.id} 缺少名称或说明`);

  // ── 武器：等级曲线与进化链 ──
  const wmap = new Map(data.weapons.map((w) => [w.id, w]));
  const evolutions = data.weapons.filter((w) => w.evolve);
  assert.ok(evolutions.length >= 8, `进化数量偏少（${evolutions.length}）`);
  for (const w of data.weapons) {
    assert.ok(w.levels.length >= 5, `${w.name} 至少应有 5 级`);
    for (const [i, l] of w.levels.entries()) {
      for (const k of ['damage', 'cooldown', 'count', 'speed', 'range', 'radius']) {
        const v = l[k];
        assert.ok(Number.isFinite(v), `${w.name} 第 ${i + 1} 级的 ${k} 不是有限数字`);
        assert.ok(v >= 0, `${w.name} 第 ${i + 1} 级的 ${k} 为负数`);
      }
      assert.ok(l.damage > 0, `${w.name} 第 ${i + 1} 级伤害应大于 0`);
    }
    // 等级越高越强：伤害必须单调不减
    for (let i = 1; i < w.levels.length; i += 1) {
      assert.ok(w.levels[i].damage >= w.levels[i - 1].damage, `${w.name} 伤害曲线应单调不降`);
    }
    if (w.evolve) {
      const target = wmap.get(w.evolve.into);
      assert.ok(target, `${w.name} 的进化目标 ${w.evolve.into} 不存在`);
      assert.ok(!target.evolve, `进化武器 ${target.name} 不应该再进化`);
      assert.ok(target.levels.length >= 5, `进化武器 ${target.name} 等级不足`);
    }
    if (w.kind === 'orbit') assert.equal(w.levels[0].cooldown, 0, `${w.name} 是环绕型武器，冷却应为 0`);
  }
  // 每个进化被动都要真实存在
  const passiveIds = new Set(data.passives.map((p) => p.id));
  for (const w of data.weapons) {
    if (w.evolve) assert.ok(passiveIds.has(w.evolve.passive), `${w.name} 的进化被动 ${w.evolve.passive} 不存在`);
  }

  // ── 遗物 ──
  assert.ok(data.relics.length >= 24, `遗物数量偏少（${data.relics.length}）`);
  for (const r of data.relics) {
    assert.ok(r.price > 0, `遗物 ${r.name} 价格应为正数`);
    assert.ok(r.icon && r.color?.startsWith('#'), `遗物 ${r.name} 缺少图标或颜色`);
    assert.ok(['common', 'rare', 'epic'].includes(r.rarity), `遗物 ${r.name} 稀有度非法`);
    assert.ok(Object.keys(r.mods).length > 0, `遗物 ${r.name} 没有任何效果`);
  }

  // ── 夜咒：必须有回报，否则就是纯惩罚 ──
  assert.ok(data.curses.length >= 4, `夜咒数量偏少（${data.curses.length}）`);
  for (const c of data.curses) {
    assert.ok(c.goldMult > 1, `夜咒 ${c.name} 必须附带金币回报`);
    assert.ok(Object.keys(c.mods).length > 0, `夜咒 ${c.name} 没有任何难度修正`);
    for (const v of Object.values(c.mods)) assert.ok(Number.isFinite(v), `夜咒 ${c.name} 的修正值非法`);
  }

  // ── 叠加全部遗物 + 满级被动，属性必须仍然有限且可用 ──
  const p = game.player;
  p.reset(p.stats, { weapon: 'ring', passive: 'might' });
  for (const r of data.relics) p.addRelic(r.id);
  for (const pas of data.passives) p.addPassive(pas.id, pas.maxLevel);
  p.recomputeStats();
  const s = p.stats;
  for (const [k, v] of Object.entries(s)) {
    assert.ok(Number.isFinite(v), `叠加所有遗物后 ${k} 变成 ${v}`);
  }
  assert.ok(s.maxHp > 10, `最大生命被压得过低（${s.maxHp}）`);
  assert.ok(s.moveSpeed > 40, `移动速度被压得过低（${s.moveSpeed}）`);
  assert.ok(s.damageMult > 1, '叠加所有增益后伤害倍率应大于 1');
  assert.ok(s.oilDecayMult > 0, '灯油衰减倍率应为正数');
  assert.ok(p.relics.size === data.relics.length, '所有遗物都应能装备上');

  assert.ok(loop);
});
