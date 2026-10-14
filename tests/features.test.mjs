/**
 * 玩法系统回归测试：灯光可用性、精英词缀、连杀奖励、转场淡入、毒性地面。
 * 这些断言都对应真实可达的游戏状态，防止重构成“看起来能跑但其实是坏的”。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('核心玩法系统（灯光 / 词缀 / 连杀 / 转场）', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;

  const frame = (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      game.setInput(0, 0, false, false);
      game.update(1 / 60);
      game.render();
    }
  };

  // ── 灯光：渲染时必须有光源，且亮度随灯油变化 ──
  frame(30);
  assert.ok(game.light.lastLightCount >= 2, '玩家至少投射两盏灯（外圈+内芯）');
  game.player.oil = game.player.oilMax;
  frame(2);
  const brightRadius = game.player.lightRadius;
  game.player.oil = game.player.oilMax * 0.1;
  frame(2);
  assert.ok(game.player.lightRadius < brightRadius, '灯油不足时照明半径应变小');
  game.player.oil = game.player.oilMax;
  frame(2);

  // ── 精英词缀 ──
  const giant = game.enemies.spawn('shade', 400, 400, 1, 1);
  const baseRadius = giant.radius;
  const baseHp = giant.maxHp;
  game.applyAffix(giant, 'giant');
  assert.ok(giant.radius > baseRadius && giant.hp > baseHp, '「巨化」应同时增大体型与生命');
  assert.equal(giant.affix, 'giant');

  const regen = game.enemies.spawn('shade', 400, 400, 1, 1);
  game.applyAffix(regen, 'regen');
  regen.hp = regen.maxHp * 0.3;
  const hpBefore = regen.hp;
  game.enemies.update(1, game.enemyCtx());
  assert.ok(regen.hp > hpBefore, '「再生」词缀应回血');

  const venom = game.enemies.spawn('shade', 400, 400, 1, 1);
  game.applyAffix(venom, 'venom');
  game.grounds.length = 0;
  game.enemies.damage(venom, 1e9, game.lightCtx(), 0, 0, 0);
  assert.ok(game.grounds.some((g) => g.kind === 'poison'), '「剧毒」死亡应留下毒液地面');

  // ── 连杀奖励 ──
  game.combo = 5;
  game.comboTier = 0;
  game.gold = 0;
  const fodder = game.enemies.spawn('shade', game.player.x + 800, game.player.y + 800, 1, 1);
  game.enemies.damage(fodder, 1e9, game.lightCtx(), 0, 0, 0);
  assert.equal(game.combo, 6, '击杀应累计连杀');
  assert.ok(game.gold > 0, '连杀跨过档位应发放奖励');
  game.comboTimer = 0.0001;
  frame(3);
  assert.equal(game.combo, 0, '连杀计时结束后应清零');
  assert.equal(game.comboTier, 0);

  // ── 转场淡入 ──
  game.screenFade = 1;
  game.update(1 / 60);
  const partial = game.screenFade;
  assert.ok(partial < 1 && partial > 0, '黑幕应逐帧淡出');
  frame(90);
  assert.equal(game.screenFade, 0, '黑幕最终应完全淡出');

  // ── 幽林 Boss 已接入 ──
  assert.equal(game.director.stageDef.boss, 'thornlord', '第一关应配置 Boss');
  const boss = game.enemies.spawn('thornlord', 260, 0, 1, 1);
  boss.hp = boss.maxHp * 0.1;
  game.enemyCtx();
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.equal(boss.phase, 3, '荆棘领主应进入第三相位');
  game.hazards.length = 0;
  boss.attackCd = 0;
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(game.hazards.some((h) => h.kind === 'thorn'), '荆棘领主应召唤荆棘地刺');

  // ── 雷弧：连锁闪电 ──
  game.enemies.clear();
  game.arcs.length = 0;
  game.player.stats.critChance = 0;
  const z0 = game.enemies.spawn('shade', game.player.x + 90, game.player.y, 4, 1);
  const z1 = game.enemies.spawn('shade', game.player.x + 170, game.player.y + 20, 4, 1);
  const z2 = game.enemies.spawn('shade', game.player.x + 250, game.player.y - 20, 4, 1);
  game.chainZap(game.player.x, game.player.y, 30, 3, 320, '#8ff0ff', {});
  assert.ok(z0.hp < z0.maxHp && z1.hp < z1.maxHp && z2.hp < z2.maxHp, '雷弧应该沿敌群跳跃并伤害多个目标');
  assert.equal(game.arcs.length, 1, '雷弧应该留下电弧特效');
  game.player.levelWeapon('arc');
  assert.ok(game.player.weapons.has('arc'), '雷弧应该能进入武器槽');
  assert.ok(game.upgrades.generate(game.player, 3, game.rng).length > 0, '加入雷弧后升级池仍应可用');

  // ── 祭坛：风险 / 回报抉择 ──
  game.enemies.clear();
  game.hazards.length = 0;
  assert.ok(game.level.shrines.length >= 2, '每关应生成祭坛');
  const altar = game.level.shrines[0];
  altar.x = game.player.x + 10;
  altar.y = game.player.y;
  game.update(1 / 60);
  assert.equal(game.state, 'shrine', '靠近祭坛应进入抉择界面');
  assert.equal(game.shrineOffers.length, 3, '祭坛应给出三张卡牌');
  const goldBefore = game.gold;
  game.shrineOffers = [{ id: 'tithe', name: '献金', blurb: '', icon: '', color: '' }];
  game.chooseShrine('tithe');
  assert.equal(game.state, 'playing', '做出抉择后应回到游戏');
  assert.equal(game.gold, goldBefore + 60, '「献金」应立即结算金币');
  assert.equal(altar.used, true, '用过的祭坛应被标记');
  assert.ok(game.save.achievements.includes('shrine_first'), '首次祭祀应解锁成就');

  // 血契：生命上限下降并换取一件遗物
  const altar2 = game.level.shrines[1];
  altar2.x = game.player.x;
  altar2.y = game.player.y;
  const hpMultBefore = game.player.shrineMods.maxHpMult;
  const relicsBefore = game.player.relics.size;
  game.update(1 / 60);
  assert.equal(game.state, 'shrine');
  game.shrineOffers = [{ id: 'blood_pact', name: '血契', blurb: '', icon: '', color: '' }];
  game.chooseShrine('blood_pact');
  assert.ok(game.player.shrineMods.maxHpMult < hpMultBefore, '「血契」应降低生命上限倍率');
  assert.ok(game.player.relics.size >= relicsBefore, '「血契」应换取遗物');

  // 守夜：回血、回满灯油、惊动黑暗
  game.enemies.clear();
  game.player.hp = game.player.stats.maxHp * 0.3;
  game.player.oil = 0;
  const altar3 = { x: game.player.x, y: game.player.y, used: false, prompted: false };
  game.level.shrines.push(altar3);
  game.update(1 / 60);
  assert.equal(game.state, 'shrine');
  game.shrineOffers = [{ id: 'vigil', name: '守夜', blurb: '', icon: '', color: '' }];
  game.chooseShrine('vigil');
  assert.ok(game.player.hp > game.player.stats.maxHp * 0.3, '「守夜」应回复生命');
  assert.equal(game.player.oil, game.player.oilMax, '「守夜」应回满灯油');
  assert.ok(game.enemies.count >= 6, '「守夜」应惊动黑暗（刷出敌人）');

  // 原样离开：不消耗祭坛
  const altar4 = { x: game.player.x, y: game.player.y, used: false, prompted: false };
  game.level.shrines.push(altar4);
  game.update(1 / 60);
  assert.equal(game.state, 'shrine');
  game.leaveShrine();
  assert.equal(game.state, 'playing', '离开祭坛应回到游戏');
  assert.equal(altar4.used, false, '未做选择的祭坛不该被消耗');
  assert.equal(altar4.prompted, true, '离开后不应反复弹出');
  game.update(1 / 60);
  assert.equal(game.state, 'playing', '离开后站在祭坛上不应再次弹出');

  // 调色板一致性：灯油倍率改动会持久到下一次 recomputeStats
  const oilMult = game.player.shrineMods.oilDecayMult;
  game.player.recomputeStats();
  assert.equal(game.player.shrineMods.oilDecayMult, oilMult, '祭坛改动应在重算属性后保留');

  // ── 碎魂：死亡时分裂 ──
  game.enemies.clear();
  game.grounds.length = 0;
  const splinter = game.enemies.spawn('splinter', game.player.x + 60, game.player.y, 1, 1);
  assert.ok(splinter.def.splits, '碎魂应配置分裂');
  game.onEnemyDeath(splinter);
  const spawned = [];
  game.enemies.forEach((x) => {
    if (x.active && x.defId === 'shade') spawned.push(x);
  });
  assert.equal(spawned.length, splinter.def.splits.count, '碎魂死亡应分裂出对应数量的影蛭');
  // 累计击碎 12 只应解锁成就
  game.save.achievements = game.save.achievements.filter((a) => a !== 'splinter_slain');
  game.splinterKills = 0;
  for (let i = 0; i < 12; i += 1) {
    const e = game.enemies.spawn('splinter', game.player.x + 40 + i, game.player.y, 1, 1);
    game.onEnemyDeath(e);
  }
  assert.ok(game.save.achievements.includes('splinter_slain'), '击碎 12 只碎魂应解锁成就');

  // ── 夜咒：敌人更强、金币更多 ──
  const mkCtx = (calls) => ({
    spawnEnemy: (id, x, y, hp, dmg) => {
      calls.push({ id, hp, dmg });
      return 'swift';
    },
    aliveCount: () => 0,
    spawnPoint: () => ({ x: 0, y: 0 }),
    announce: () => {},
    hazard: () => {},
    onBossSpawn: () => {},
    onStageComplete: () => {},
    isBossAlive: () => false,
    playerPos: () => ({ x: 0, y: 0 }),
  });

  const STAGE0 = { ...game.director.stageDef, waves: game.director.stageDef.waves };
  const dir = game.director;
  // intro → beginWave → 刷怪，需要推进几秒
  const runWave = (ctx) => {
    dir.update(3, ctx);
    for (let i = 0; i < 4; i += 1) dir.update(1, ctx);
  };
  // 基准：无夜咒
  const base = [];
  dir.setStage(game.director.stageDef, 0);
  dir.setCurse(null);
  runWave(mkCtx(base));
  const plainHp = base[0]?.hp ?? 0;
  const plainDmg = base[0]?.dmg ?? 0;
  assert.ok(base.length > 0, '基准波次应该刷出敌人');

  // 施加夜咒后同样的波次应该明显更强
  const cursed = [];
  dir.setStage(game.director.stageDef, 0);
  dir.setCurse({ hpMult: 2, dmgMult: 1.5, countMult: 1 });
  runWave(mkCtx(cursed));
  const curseHp = cursed[0]?.hp ?? 0;
  const curseDmg = cursed[0]?.dmg ?? 0;
  assert.ok(curseHp > plainHp * 1.9, `夜咒应让敌人生命翻倍（${plainHp} -> ${curseHp}）`);
  assert.ok(curseDmg > plainDmg * 1.4, `夜咒应提升敌人伤害（${plainDmg} -> ${curseDmg}）`);

  // 「长夜」延长本关波次
  dir.setStage(game.director.stageDef, 0);
  dir.setCurse({ extraWaves: 2 });
  assert.equal(dir.totalWaves, game.director.stageDef.waves + 2, '「长夜」应增加本关波次');
  dir.setCurse(null);

  // 游戏层：非首关会抽到夜咒，并且金币倍率生效
  game.state = 'playing';
  game.continueStage();
  assert.equal(game.stageIndex, 1, '应进入第二关');
  assert.ok(game.curse, '非首关应降临夜咒');
  assert.ok(game.curse.goldMult > 1, '夜咒应附带金币加成');
  assert.equal(game.director.stageDef.id, game.currentStage().id, '关卡与导演应指向同一张图');
  assert.ok(
    game.director.totalWaves >= game.currentStage().waves,
    `夜咒后的总波次不应减少（totalWaves=${game.director.totalWaves} stageWaves=${game.currentStage().waves}）`,
  );
  // 首关（教学关）保持干净
  game.loadStage(STAGE0, 0, false);
  assert.equal(game.curse, null, '第一关不应有夜咒');
  assert.equal(game.director.totalWaves, STAGE0.waves, '第一关波次应按原表');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
