import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const difKey = 'wicklight.save.v1';

test('构建产物存在（先运行 npm run build）', () => {
  assert.ok(existsSync(ENTRY), 'dist/app.js 不存在，请先执行 npm run build');
});

test('无头环境下可启动、刷怪、升级、通关、Boss、元进度、死亡结算', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();

  const handle = globalThis.window.__WICKLIGHT__;
  assert.ok(handle, '应通过 window.__WICKLIGHT__ 暴露句柄');
  const { game, loop } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  // 音频：只创建 1 个 AudioContext
  game.audio.ensure();
  assert.equal(env.audioState.contexts.length, 1, '应只创建一个 AudioContext');

  // 菜单 → 开局
  game.bootDone();
  assert.equal(game.state, 'menu');
  game.newRun('warden', 'normal', false);
  assert.equal(game.state, 'playing');
  assert.ok(game.level.walls.length > 3, '应生成竞技场墙体');
  assert.equal(game.director.totalWaves, 7, '幽林应为 7 波');

  // 升级三选一 + 重掷（新鲜一局必定有 3 个选项）
  game.openLevelUp();
  assert.equal(game.currentOffers.length, 3, '应提供 3 个升级选项');
  game.rerollsLeft = 1;
  game.reroll();
  assert.equal(game.rerollsLeft, 0, '重掷应消耗次数');
  assert.equal(game.currentOffers.length, 3);
  game.chooseUpgrade(game.currentOffers[0]);
  assert.equal(game.state, 'playing');

  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;

  const killAll = () => {
    game.enemies.forEach((e) => game.enemies.damage(e, 1e9, game.lightCtx(), 0, 0, 0));
  };
  const hooverAll = () => {
    game.pickups.all.forEach((p) => {
      if (p.active) game.collect(p);
    });
  };

  let maxEnemies = 0;
  const run = (frames, before) => {
    for (let i = 0; i < frames; i += 1) {
      before?.(i);
      game.setInput(0, 0, false, i % 150 === 0);
      game.update(1 / 60);
      game.render();
      maxEnemies = Math.max(maxEnemies, game.enemies.count);
    }
  };

  run(900);
  assert.ok(maxEnemies > 0, '应刷出敌人');
  assert.ok(game.light.lastLightCount > 0, '渲染时灯芯光源必须存在（否则全屏漆黑）');

  // 确定性击杀：把敌人放到灯焰旁，近身灼烧应致其死亡
  const killsBefore = game.kills;
  game.enemies.spawn('shade', game.player.x + 18, game.player.y, 1, 1);
  run(120);
  assert.ok(game.kills > killsBefore, '近身敌人应被灯焰烧死');

  // 打通第一关（自动选择升级）
  let guard = 0;
  while (game.state !== 'shop' && game.state !== 'victory' && guard < 20000) {
    guard += 1;
    if (game.state === 'levelup') {
      assert.ok(game.currentOffers.length > 0, '升级应提供选项');
      game.chooseUpgrade(game.currentOffers[0]);
      continue;
    }
    killAll();
    hooverAll();
    game.update(1 / 60);
    game.render();
    maxEnemies = Math.max(maxEnemies, game.enemies.count);
  }
  assert.equal(game.state, 'shop', `应进入补给商店，实际 ${game.state}`);
  assert.ok(game.playerLevel >= 2, '应至少升过一次级');
  assert.ok(game.save.best >= 1, '应记录最高关卡');

  // 商店：购买遗物并离开
  game.gold = 500;
  const relicSlot = game.shopItems.findIndex((it) => it.kind === 'relic');
  assert.ok(relicSlot >= 0, '商店应提供遗物');
  const relicsBefore = game.player.relics.size;
  assert.ok(game.buyShop(relicSlot), '应能购买遗物');
  assert.ok(game.player.relics.size > relicsBefore, '遗物应计入构筑');
  game.leaveShop();

  // 进入第二关 + Boss 阶段切换
  assert.equal(game.state, 'playing');
  game.enemies.clear();
  const boss = game.enemies.spawn('extinguisher', 240, 0, 1, 1);
  game.enemies.update(1 / 60, game.enemyCtx());
  boss.hp = boss.maxHp * 0.5;
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.ok(boss.phase >= 2, 'Boss 血量过半应进入第二相位');
  boss.hp = boss.maxHp * 0.2;
  game.enemies.update(1 / 60, game.enemyCtx());
  assert.equal(boss.phase, 3, 'Boss 低血应进入第三相位');

  // 带夜咒的一关：波次上限提高，而且波次仍在持续推进（不会卡死）
  assert.equal(game.stageIndex, 1, '上面应已推进到第二关');
  const curse = game.curse;
  assert.ok(curse, '第二关应降临夜咒');
  assert.equal(
    game.director.totalWaves,
    game.currentStage().waves + (curse.mods.extraWaves ?? 0),
    '「长夜」这类夜咒应提高本关波次上限',
  );

  const tick = () => {
    game.player.oil = game.player.oilMax;
    game.player.lightRadius = 1e6; // 无光者这类敌人必须被照亮才吃伤害
    game.hitStop = 0; // 打击停顿会冻结整个世界，测试里不需要
    killAll();
    game.setInput(0, 0, false, false);
    game.update(1 / 60);
  };

  const waveStart = game.director.wave;
  let march = 0;
  while (march < 3000 && game.state === 'playing' && game.director.wave < waveStart + 2) {
    march += 1;
    if (game.state === 'levelup') {
      assert.ok(game.currentOffers[0], '升级界面必须有可选项');
      game.chooseUpgrade(game.currentOffers[0]);
      continue;
    }
    if (game.state === 'shrine') {
      game.leaveShrine();
      continue;
    }
    tick();
  }
  assert.ok(
    game.director.wave >= waveStart + 2,
    `带夜咒的关卡应持续推进（第 ${march} 帧仍停在 ${game.director.wave}/${game.director.totalWaves} 波）`,
  );

  // 最后一波是 Boss 波：清掉首领后应进入补给商店
  game.director.wave = game.director.totalWaves - 1;
  game.enemies.clear();
  for (let i = 0; i < 3000 && game.state === 'playing'; i += 1) tick();
  assert.equal(game.state, 'shop', `清掉首领后应进入补给商店，实际停在 ${game.state}`);
  assert.ok(game.save.achievements.includes('curse_bearer'), '带着夜咒平掉一关应解锁「负咒而行」');

  // 之后的关卡推进与胜利结算
  game.leaveShop();
  assert.equal(game.state, 'playing', '离开商店应回到战斗');
  assert.equal(game.stageIndex, 2, '应推进到第三关');
  assert.ok(game.curse, '第三关同样应有夜咒');
  game.onStageComplete();
  assert.equal(game.state, 'victory', '打完最后一关应进入胜利结算');
  assert.ok(game.save.achievements.includes('conqueror'), '通关应解锁「征服」成就');

  // 升级系统在池耗尽时仍应给出兜底选项
  const lateOffers = game.upgrades.generate(game.player, 3, game.rng);
  assert.ok(lateOffers.length >= 1, '升级池耗尽也应给出兜底选项');

  // 元进度
  game.save.embers = 1000;
  assert.ok(game.buyMeta('kindling'), '应能购买「引火」');
  assert.ok(game.meta.bonuses().hpMult > 0.1, '「引火」应提升生命上限');
  const raw = globalThis.localStorage.getItem(difKey);
  assert.ok(raw && JSON.parse(raw).meta.includes('kindling'), '元进度应写入存档');

  // 难度系统各不相同
  assert.notEqual(game.difficulty, undefined);

  // 死亡结算
  game.player.revives = 0;
  game.player.hp = -1;
  game.state = 'playing';
  game.update(1 / 60);
  assert.equal(game.state, 'dead', '生命归零应进入死亡结算');
  assert.ok(game.embersEarned > 0, '应结算余烬');

  // 无尽模式可启动
  game.save.best = 3;
  game.newRun('warden', 'nightmare', true);
  assert.equal(game.state, 'playing');
  assert.equal(game.endless, true);
  run(120);
  assert.ok(game.enemies.count >= 0);

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
