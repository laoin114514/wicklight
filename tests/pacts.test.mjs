/**
 * 「深宵之约」回归测试（v79）：自己给自己加的难度。
 *
 * 这一套要回答的是三个问题，而且三个都得真量出来：
 *   · **每一条都真的在咬**：七个条款各改一个数，那就一个一个量——数量、血量、伤害、油耗、
 *     视野、进油、精英只数。哪个数没接上，对应的那一条就是"面板上写着、场上一动不动"，
 *     而这种错在画面上一点都看不出来（玩家只会觉得"这一条好像不太行"）；
 *   · **一条都没背时，游戏和 v78 逐字一样**：倍率全 1、精英还是 1 只。这是"加法式改动"的护栏
 *     （`bench --waves --fixed` 也量同一条，那是全局的，这里是单点的）；
 *   · **钱怎么给**：每一条 +15% 余烬、只认通关、锁着的门是"通关过一次"（读的是生涯档案里
 *     早就有的那个数，不是另存一个开关——那会多出第二种真话）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局：`pacts` 传这一局要背的那几条。 */
async function open(t, { pacts = [], tag = '', difficulty = 'normal' } = {}) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=pacts-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', difficulty, false, null, pacts);
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
  game.pickups.clear();
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.enemies.update(1 / 60, game.enemyCtx());
  return game;
}

const PACTS_OF = () => globalThis.window.__WICKLIGHT__.data.pacts;
/** 场上活着的那些怪（`pool` 是系统自己的对象池，测试只读不碰）。 */
const foes = (g) => g.enemies.pool.all.filter((e) => e.active);
/** 敌人表按 id 查（`__WICKLIGHT__` 里放的是数组，这里自己搭一张表）。 */
let ENEMY_INDEX = null;
const ENEMY_MAP = () => {
  if (!ENEMY_INDEX) {
    ENEMY_INDEX = Object.fromEntries(
      globalThis.window.__WICKLIGHT__.catalog.enemies.map((e) => [e.id, e]),
    );
  }
  return ENEMY_INDEX;
};
/** 这一波刷出来的怪里有几位是精英。 */
const eliteCount = (g) => foes(g).filter((e) => ENEMY_MAP()[e.defId]?.elite === true).length;
const ALL = () => PACTS_OF().PACTS.map((p) => p.id);

/** 摆一波（走的是真导演路径）：读这一波的预算与刷出来那些敌人的血/伤害。 */
function wave(game, n = 1) {
  const d = game.director;
  d.phase = 'intro';
  d.introTimer = 0;
  d.wave = n - 1;
  game.enemies.clear();
  for (let i = 0; i < 600; i += 1) {
    game.director.update(0.1, game.directorCtx());
    if (game.director.phase !== 'spawning' && game.director.spawned > 0) break;
  }
  return {
    budget: d.waveBudget,
    spawned: d.spawned,
    hp: d.hpMult,
    dmg: d.dmgMult,
    enemies: foes(game).map((e) => ({ defId: e.defId, hp: e.maxHp, dmg: e.damage })),
  };
}

test('这一套正好七条、每条一个数、都进图鉴，而且每条都保证"一直在咬"', async (t) => {
  const game = await open(t, { tag: 'shape' });
  const { PACTS, PACT_MAP, PACT_EMBER_EACH } = PACTS_OF();
  assert.equal(PACTS.length, 7, `这一套该是七条（实际 ${PACTS.length}）`);
  assert.equal(new Set(PACTS.map((p) => p.id)).size, PACTS.length, 'id 不许重复');
  assert.equal(Object.keys(PACT_MAP).length, PACTS.length, '查表该和表一样长');
  const KEYS = ['countMult', 'hpMult', 'dmgMult', 'oilDecayMult', 'lightMult', 'oilIncomeMult', 'extraElites'];
  // 每个数各归一条：两条改同一个数就是"两条其实是一条"（玩家会以为自己在加两种难度）
  for (const k of KEYS) {
    const owners = PACTS.filter((p) => k in p.mods);
    assert.equal(owners.length, 1, `${k} 只该由一条之约改（实际 ${owners.map((o) => o.name).join('/')}）`);
  }
  for (const p of PACTS) {
    assert.ok(p.name && p.blurb && p.detail && p.icon, `${p.id} 该写全名字 / 说明 / 细目 / 图标`);
    assert.ok(!/undefined|NaN/.test(`${p.blurb}${p.detail}`), `${p.id} 的说明里不该有缺字段`);
    const entry = game.codex.entry(`mechanic:pacts`);
    assert.ok(entry, '「深宵之约」该进图鉴的机制章');
    assert.ok(entry.rows.some(([k]) => k.includes(p.name)), `图鉴里该列出「${p.name}」`);
    // 没有"附加条件"这一类字段：每一条都一直在咬（见 data/pacts.ts 第一条设计规矩）
    assert.equal(p.requires, undefined, `${p.id} 不该有前置条件——那种条款对另一部分玩家等于没加`);
  }
  assert.ok(PACT_EMBER_EACH > 0, '每一条该值一份余烬');

  // 锁着的门：通关一次之后才开（读的是生涯档案里那个数）
  const { pactsUnlocked } = PACTS_OF();
  assert.equal(pactsUnlocked(0), false, '一次都没通关时锁着');
  assert.equal(pactsUnlocked(1), true, '通关一次之后开');
  assert.equal(game.pactsAvailable(), false, '刚开一局的存档（没通关过）该是锁着的');
});

test('一条都不背时：七个倍率全是 1、精英还是 1 只——和 v78 逐字一样', async (t) => {
  const game = await open(t, { tag: 'none' });
  const mods = game.pactMods;
  assert.deepEqual(
    { ...mods },
    { countMult: 1, hpMult: 1, dmgMult: 1, oilDecayMult: 1, lightMult: 1, oilIncomeMult: 1, extraElites: 0 },
    '不背之约时那份修正该是"什么都不改"',
  );
  assert.deepEqual(game.pacts, [], '身上不该挂着任何一条');
  assert.equal(game.pactsAvailable(), false, '没通关过的存档该是锁着的');
  // 精英那一条：第 3 波只来一位
  wave(game, 3);
  assert.equal(eliteCount(game), 1, `不背「成群」时精英波该只有 1 只（实测 ${eliteCount(game)}）`);
});

test('每一条都真的在咬：七个条款一个一个量', async (t) => {
  const { PACTS, PACT_MAP } = PACTS_OF();
  const mod = (id) => PACT_MAP[id].mods;
  /**
   * 每一条都拿**两个干净的存档位**对着量（一个不背、一个背）。
   *
   * ⚠ 这一条是被台架教出来的：最早这一份用例共用一个 `base`，而它在前面的小段里
   * 已经被 `wave()` 摆过场面——场上那些怪会走过来，而它们的攻击里带着 `drain`
   * （`Player.takeDamage(amount, x, y, drain)` 会按比例抽走灯油）。
   * 于是"十秒烧掉多少油"量到的是"油耗 + 被抽掉的油"：裸装 27.46%、带「灯烧得快」22.18%——
   * 一个**反着**的数（带着更难的那一条反而烧得少），因为两边的怪不一样多。
   * 所以每一条的量法都从 `open()` 重新来一遍：场面全空，只有这一条规定的那件事在动。
   */
  const fresh = (tag, pacts = []) => open(t, { pacts, tag });

  // ① 来客更密：每波的预算 ×1.25
  {
    const w0 = wave(await fresh('dense-bare'), 3);
    const w1 = wave(await fresh('dense-on', ['dense']), 3);
    // 预算是 `round(基数 × 各乘数)`（第 3 波：round(13.2 × 1.35) = 18，带上之约是 round(22.275) = 22），
    // 所以这两个整数之间**不会**正好是 1.25——量的是"同一份没有四舍五入的基数乘出来"那一件事：
    // |w1 − w0×1.25| ≤ 0.625 就说明乘数正好落在基数上，没有被别的东西挪动过。
    assert.ok(
      Math.abs(w1.budget - w0.budget * mod('dense').countMult) <= 0.63,
      `「来客更密」该把这一波的预算抬 25%（${w0.budget} → ${w1.budget}，期望 ${(w0.budget * 1.25).toFixed(2)}）`,
    );
  }
  // ② 壳更硬 / ③ 爪更利：刷出来的敌人血 / 伤害各 ×1.3 / ×1.25
  {
    const w0 = wave(await fresh('stat-bare'), 5);
    const shell = wave(await fresh('shell', ['shell']), 5);
    const claw = wave(await fresh('claw', ['claw']), 5);
    assert.ok(
      Math.abs(shell.hp / w0.hp - mod('shell').hpMult) < 1e-9,
      `「壳更硬」该把敌人的血量乘数 ×${mod('shell').hpMult}（${w0.hp.toFixed(3)} → ${shell.hp.toFixed(3)}）`,
    );
    assert.ok(
      Math.abs(claw.dmg / w0.dmg - mod('claw').dmgMult) < 1e-9,
      `「爪更利」该把敌人的伤害乘数 ×${mod('claw').dmgMult}（${w0.dmg.toFixed(3)} → ${claw.dmg.toFixed(3)}）`,
    );
    // 而且真的落在怪身上（不是只改了导演手里那两个数）。
    // ⚠ 只能按**同一种怪**对着量：刷出来的是随机种类，血量本来就差着几倍
    // （第一版按"两波的第一只"比，量到的是两种不同的怪，红得很冤枉）。
    assert.ok(w0.enemies.length > 0 && shell.enemies.length > 0, '这一波该真的刷出怪来');
    const hpOf = (w) => Object.fromEntries(w.enemies.map((e) => [e.defId, e.hp]));
    const dmgOf = (w) => Object.fromEntries(w.enemies.map((e) => [e.defId, e.dmg]));
    const common = Object.keys(hpOf(w0)).filter((id) => id in hpOf(shell) && id in dmgOf(claw));
    assert.ok(common.length > 0, '两波里该有同一种怪可以对着量');
    for (const id of common) {
      assert.ok(
        Math.abs(hpOf(shell)[id] / hpOf(w0)[id] - mod('shell').hpMult) < 1e-9,
        `同一种「${id}」的血该正好 ×${mod('shell').hpMult}（${hpOf(w0)[id].toFixed(0)} → ${hpOf(shell)[id].toFixed(0)}）`,
      );
      assert.ok(
        Math.abs(dmgOf(claw)[id] / dmgOf(w0)[id] - mod('claw').dmgMult) < 1e-9,
        `同一种「${id}」的伤害该正好 ×${mod('claw').dmgMult}（${dmgOf(w0)[id].toFixed(1)} → ${dmgOf(claw)[id].toFixed(1)}）`,
      );
    }
  }
  // ④ 灯烧得快：量**真烧掉的那口油**，不看那个倍率字段（字段对了但没接上去，是最容易漏的一种）。
  // 走的是真主循环（`game.update`），不是自己调 `player.update`——油耗那条路上还有别的乘数
  // （拨芯 / 灯焰高涨 / 地形），自己拼一遍就等于把"玩家在场上会碰到的那条路"抄成第二条。
  {
    const burn = (g) => {
      g.player.oil = 1;
      g.player.oilMax = 1;
      for (let i = 0; i < 600; i += 1) {
        g.setInput(0, 0, false, false);
        g.update(1 / 60);
      }
      return 1 - g.player.oil;
    };
    const bare = burn(await fresh('burn-bare'));
    const fast = burn(await fresh('thirsty', ['thirsty']));
    assert.ok(
      Math.abs(fast / bare - mod('thirsty').oilDecayMult) < 1e-9,
      `十秒里烧掉的油该 ×${mod('thirsty').oilDecayMult}（${(bare * 100).toFixed(2)}% → ${(fast * 100).toFixed(2)}%）`,
    );
  }
  // ⑤ 昏灯：灯火半径 ×0.88
  {
    const light = (g) => {
      g.player.oil = 1;
      g.player.oilMax = 1;
      g.setInput(0, 0, false, false);
      g.update(1 / 60);
      return g.player.lightRadius;
    };
    const bare = light(await fresh('dim-bare'));
    const dim = light(await fresh('dim', ['dim']));
    assert.ok(
      Math.abs(dim / bare - mod('dim').lightMult) < 1e-9,
      `「昏灯」该把灯火半径 ×${mod('dim').lightMult}（${bare.toFixed(1)} → ${dim.toFixed(1)}px）`,
    );
  }
  // ⑥ 薄油：三条进项里的两条（掉落 / 擦身）都听话，一次性的结算不乘
  {
    const drop = (g) => {
      g.pickups.clear();
      const e = g.enemies.spawn('shade', 0, 0, 1, 0);
      e.oil = 100;
      g.enemies.damage(e, 1e9, g.lightCtx(), 0, 0, 0);
      const p = g.pickups.all.find((x) => x.active && x.kind === 'oil');
      return p ? p.value : 0;
    };
    const graze = (g) => {
      g.player.oil = 0;
      g.player.oilMax = 1;
      g.player.stats.oilGainMult = 1;
      g.grazeEvent(0, 0, 'enemy', false);
      return g.player.oil;
    };
    const bare = await fresh('thin-bare');
    const thin = await fresh('thin', ['thin']);
    assert.equal(drop(bare), 100, `基准：油量 100 的怪掉 100（实测 ${drop(bare)}）`);
    assert.equal(drop(thin), 75, `「薄油」：同一只怪只掉 75（实测 ${drop(thin)}）`);
    assert.ok(
      Math.abs(graze(thin) / graze(bare) - mod('thin').oilIncomeMult) < 1e-9,
      `擦身回油也该同样缩（${graze(bare).toFixed(4)} → ${graze(thin).toFixed(4)}）`,
    );
  }
  // ⑦ 成群：第 3 波那一次精英从 1 只变 2 只
  {
    const bare = await fresh('pack-bare');
    wave(bare, 3);
    const bareElites = eliteCount(bare);
    const pack = await fresh('pack', ['pack']);
    wave(pack, 3);
    assert.equal(bareElites, 1, `基准的第 3 波该来 1 位精英（实测 ${bareElites}）`);
    assert.equal(eliteCount(pack), 2, `背「成群」该来 2 位（实测 ${eliteCount(pack)}）`);
  }
  // 全都背上的时候：六个乘数一起乘（不是取最大、也不是只认最后一条），精英还是 2 位
  {
    const g = await fresh('all', ALL());
    const m = g.pactMods;
    const prod = PACTS.reduce(
      (acc, p) => ({
        countMult: acc.countMult * (p.mods.countMult ?? 1),
        hpMult: acc.hpMult * (p.mods.hpMult ?? 1),
        dmgMult: acc.dmgMult * (p.mods.dmgMult ?? 1),
        oilDecayMult: acc.oilDecayMult * (p.mods.oilDecayMult ?? 1),
        lightMult: acc.lightMult * (p.mods.lightMult ?? 1),
        oilIncomeMult: acc.oilIncomeMult * (p.mods.oilIncomeMult ?? 1),
      }),
      { countMult: 1, hpMult: 1, dmgMult: 1, oilDecayMult: 1, lightMult: 1, oilIncomeMult: 1 },
    );
    for (const [k, v] of Object.entries(prod)) {
      assert.ok(Math.abs(m[k] - v) < 1e-9, `${k} 该是七条相乘（${v} vs ${m[k]}）`);
    }
    assert.equal(m.extraElites, 1, '「成群」只有一条，加在一起还是 1');
    wave(g, 3);
    assert.equal(eliteCount(g), 2, '七条一起背也还是 2 位精英（它不是按条数叠的）');
  }
});

test('钱怎么给：每一条 +15% 余烬、乘在结算上、只认通关', async (t) => {
  const { PACT_EMBER_EACH, pactEmberMult } = PACTS_OF();
  const ids = ALL();
  assert.ok(Math.abs(pactEmberMult([]) - 1) < 1e-9, '一条不背就是 1 倍');
  assert.ok(
    Math.abs(pactEmberMult(ids.slice(0, 3)) - (1 + PACT_EMBER_EACH * 3)) < 1e-9,
    '三条就是 1 + 3×每一条那一份',
  );
  assert.ok(Math.abs(pactEmberMult(['不存在的 id'])) - 1 < 1e-9, '认不出来的 id 不该算钱');

  // 走真结算：把这一局的读数钉死，量"背 4 条"比"一条不背"多拿多少
  const finish = async (pacts, tag) => {
    const game = await open(t, { pacts, tag });
    game.runTime = 120;
    game.kills = 60;
    game.wave = 10;
    game.bossKills = 1;
    game.playerLevel = 8;
    const before = game.save.embers;
    game.finalizeRun('defeat');
    return { gain: game.save.embers - before, embers: game.embersEarned, highlight: game.recordHighlights };
  };
  await t.test('四条约：正好多 60%', async () => {
    const bare = await finish([], 'ember0');
    const four = await finish(ids.slice(0, 4), 'ember4');
    assert.ok(
      Math.abs(four.gain / bare.gain - 1.6) < 1e-9,
      `背 4 条该是 1.6 倍（${bare.gain} → ${four.gain}）`,
    );
  });
  // 只认通关：背着 6 条死掉，不进档案
  const game = await open(t, { pacts: ids.slice(0, 6), tag: 'ember-death' });
  game.finalizeRun('defeat');
  assert.equal(game.save.records.bestPacts, 0, '死了就不该进"最深宵通关"那条档案');
  game.finalizeRun('clear');
  assert.equal(game.save.records.bestPacts, 6, '通关之后才写下条数');
  // 通关那两条成就
  assert.ok(game.save.achievements.includes('pact3'), '背 3 条以上通关该解「深宵行者」');
  assert.ok(!game.save.achievements.includes('pactall'), '没背满不该解「长夜独行」');
  const full = await open(t, { pacts: ids, tag: 'ember-all' });
  full.finalizeRun('clear');
  assert.ok(full.save.achievements.includes('pactall'), '背满全部通关该解「长夜独行」');
  assert.equal(full.save.records.bestPacts, ids.length, '档案里该记满');
});

test('两处界面都认这件事：结算屏的「本局构筑」与总览的「深宵之约」那一栏', async (t) => {
  const game = await open(t, { pacts: ['dense', 'shell', 'claw'], tag: 'ui' });
  // 结算屏（`run-build` 只在死亡 / 通关那两屏上——打仗的时候它不在 DOM 里）
  game.embersEarned = 42;
  game.ui.showScreen('dead');
  const dead = game.ui.screen.innerHTML;
  assert.ok(dead.includes('本局构筑'), '结算屏该有「本局构筑」那一块');
  assert.ok(
    dead.includes('深宵') && dead.includes('来客更密') && dead.includes('1.45'),
    '结算屏上要写清这一局背了哪几条、余烬被翻了几倍',
  );
  assert.ok(!/undefined|NaN/.test(dead), '结算屏里不该出现缺字段');
  // 构筑总览那一栏
  game.ui.showScreen('loadout');
  const sheet = game.ui.screen.innerHTML;
  for (const bit of ['深宵之约', '来客更密', '敌人血量 +30%', '爪更利', '背 3 条', '1.45']) {
    assert.ok(sheet.includes(bit), `总览里该写出「${bit}」`);
  }
  assert.ok(!/undefined|NaN/.test(sheet), '总览里不该出现缺字段');
  // 没背的时候也不留空：那一行顺手承担"这东西在哪儿"的指路。两种"没背"要分别说清——
  // 还没通关的人该读到解锁条件，通关之后没勾的人该读到"现在就是平常那一夜"。
  const locked = await open(t, { tag: 'ui-locked' });
  locked.ui.showScreen('loadout');
  const lockedHtml = locked.ui.screen.innerHTML;
  assert.ok(lockedHtml.includes('通关一次之后'), '还没通关时那一栏该写解锁条件（不是一片空白）');
  assert.ok(!lockedHtml.includes('这一局没背'), '还没通关的人不该读到"平常的一夜"（那会让人以为这功能已经开着）');
  const opened = await open(t, { tag: 'ui-none' });
  opened.save.records.clearedRuns = 1;
  opened.ui.showScreen('loadout');
  assert.ok(opened.ui.screen.innerHTML.includes('这一局没背'), '开过之后没勾的人该读到"这一局没背 · 平常的一夜"');
});

test('今日灯芯不吃这一套，而且存档里的选择不会漏进下一局', async (t) => {
  const game = await open(t, { pacts: ALL(), tag: 'daily' });
  const { buildDailyPlan } = globalThis.window.__WICKLIGHT__.daily;
  // 今日灯芯走的是它自己那条入口（难度与灯火都由日期定），之约一律不认
  const plan = buildDailyPlan('2026-01-01');
  game.newRun(plan.lantern, plan.difficulty, false, plan, ALL());
  assert.deepEqual(game.pacts, [], '今日灯芯里之约该被丢掉');
  assert.deepEqual({ ...game.pactMods }, { ...PACTS_OF().pactMods([]) }, '那份修正该回到"什么都不改"');

  // 上一局背了 7 条的账不许跟到下一局（背的与不背的连着开，两边都得对）
  const hot = await open(t, { pacts: ALL(), tag: 'carry-hot' });
  const decay = hot.player.stats.oilDecayMult;
  hot.newRun('warden', 'normal', false);
  assert.deepEqual(hot.pacts, [], '新的一局该一条都没有');
  assert.ok(
    hot.player.stats.oilDecayMult < decay,
    `不背之约时油耗该回到基准（${decay.toFixed(3)} → ${hot.player.stats.oilDecayMult.toFixed(3)}）`,
  );
  assert.ok(hot.player.baseLightMult <= 1.0001, '昏灯那一笔也不该跟过来');
  assert.equal(hot.player.difficultyOilMult, 1, '薄油那一笔同样归位（标准档就是 1）');

  // 「旧账归位」这件事落在 `Player.reset` 自己身上，不是在 `newRun` 里事后擦一遍：
  // 重开一局这扇门谁都得走（`newRun` 走的也是它），门口自己干净才不会被下一个调用点绕过。
  // 这一条特意**直接量** reset —— 否则 newRun 里那句覆盖会把保证盖住，把 reset 里那行删掉
  // 也没人发现（变异体实测：删掉它 199 项全绿）。
  const heavy = await open(t, { pacts: ALL(), tag: 'carry-reset' });
  assert.ok(heavy.player.pactOilDecayMult > 1, '前提：这一局确实背着「灯烧得快」');
  heavy.player.reset(heavy.buildStats(), {
    weapon: [...heavy.player.weapons.keys()][0],
    passive: [...heavy.player.passives.keys()][0],
  });
  assert.equal(heavy.player.pactOilDecayMult, 1, '重开一局时 Player.reset 自己就得把这笔账归位');
  assert.ok(
    heavy.player.stats.oilDecayMult <= hot.player.stats.oilDecayMult + 1e-9,
    `归位之后油耗该回到基准那一档（${heavy.player.stats.oilDecayMult.toFixed(3)}）`,
  );
});
