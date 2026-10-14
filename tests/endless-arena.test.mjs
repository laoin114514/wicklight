/**
 * 无尽之夜：一轮一片战场。
 *
 * 无尽原本从头到尾钉在「长夜之城」——四位首领每五波轮一个、招式早就背熟了，
 * 脚下的战场却一直没换过。现在每打完一轮（结算点是补给站），战场也跟着换：
 * 主题、布景、险境池、精英池、灯台与祭坛全部重铺，第 5 轮回到幽林再走一圈。
 *
 * 三条边界要守住：
 *   1. 换的是**战场**，不是难度——难度档位与物价（`stageIndex`）一直钉在最后一关，
 *      否则第 5 轮回到第一片战场时物价会突然便宜下来；
 *   2. 换场**不送血也不送油**——那一口补给得在补给站里花钱买（换关那 40% 是战役的规矩）；
 *   3. 补给站里写着"下一片战场是什么"，而且写的必须是出去之后真的会到的那一片。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('无尽之夜：一轮换一片战场，难度与补给不跟着变', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, hud, catalog } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  const stages = catalog.stages;
  assert.ok(stages.length >= 3, `得有几片战场可轮（${stages.length}）`);

  game.bootDone();
  game.newRun('warden', 'normal', true);
  game.enemies.update(1 / 60, game.enemyCtx());

  // ── 开局：战场是第一片，难度档位仍钉在最后一关 ──
  assert.equal(game.currentStage().id, stages[0].id, '无尽之夜从第一片战场开始');
  assert.equal(game.stageIndex, stages.length - 1, '难度 / 物价档位仍在最后一关');
  const tier = game.stageIndex;

  // ── 一整轮：打完第 5 波的首领 → 补给站 → 出门就是下一片战场 ──
  const visited = [game.currentStage().id];
  /** 每片战场的布局指纹：回到同一片战场时该是一局新铺的，而不是上次那张图 */
  const layout = () =>
    `${game.level.walls.length}|${game.level.pyres.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';')}`;
  const sigs = [{ id: game.currentStage().id, sig: layout() }];
  game.player.stats.maxHp = 1e6;
  game.player.hp = 123456;          // 故意留一个"不整"的血量，换场不该把它补满
  game.player.oil = 0.42;
  game.gold = 300;

  for (let round = 1; round <= stages.length + 1; round += 1) {
    const hpBefore = game.player.hp;
    const oilBefore = game.player.oil;
    const levelBefore = game.level;
    const warmthBefore = game.player.pyreMods.damageMult;
    game.director.wave = round * 5;
    game.wave = round * 5;
    // 走真实的结算路径：首领倒下 → 这一轮结算 → 补给站（标题与商品都由它填）
    game.onStageComplete();
    assert.equal(game.state, 'shop', `第 ${round} 轮清场后应进补给站`);

    // 补给站上写的就是出去之后真会到的那一片
    const promised = game.nextArena();
    assert.ok(promised, `无尽之夜的补给站要给出下一片战场（第 ${round} 轮）`);
    assert.ok(game.shopHeader.includes('补给站'), `无尽补给站标题（${game.shopHeader}）`);
    game.ui.showScreen('shop');
    const shopHtml = String(game.ui.screen.innerHTML);
    assert.ok(shopHtml.includes('下一片战场'), `补给站要写出下一片战场（第 ${round} 轮）`);
    assert.ok(shopHtml.includes(promised.theme.name), `写的是「${promised.theme.name}」（第 ${round} 轮）`);

    game.leaveShop();
    assert.equal(game.state, 'playing', '出门就继续打');

    assert.equal(game.currentStage().id, promised.id, `出去的战场就是补给站里承诺的那一片（第 ${round} 轮）`);
    assert.notEqual(game.level, levelBefore, '战场是重新铺过的');
    visited.push(game.currentStage().id);
    sigs.push({ id: game.currentStage().id, sig: layout() });

    // 难度与物价档位不跟着战场走
    assert.equal(game.stageIndex, tier, `第 ${round} 轮之后难度档位仍是最后一关`);
    // 不送血不送油：那一口要在补给站里买
    assert.equal(game.player.hp, hpBefore, `换战场不该回血（第 ${round} 轮）`);
    assert.equal(game.player.oil, oilBefore, `换战场不该补油（第 ${round} 轮）`);
    assert.equal(game.player.pyreMods.damageMult, warmthBefore, '灯台余温是攒在身上的，不随战场重铺');
    assert.equal(game.gold, 300, '换战场不碰钱包');
    // 战场自己的东西：灯台按新关卡重算，祭坛与险境也重铺
    assert.equal(game.pyreTotal, game.level.pyres.length, '灯台数按新战场重算');
    assert.equal(game.pyresLit, 0, '新战场的灯台都是黑着的');
    assert.equal(game.hazards.length, 0, '旧战场的险境不该跟过来');
    const dist = Math.hypot(game.player.x, game.player.y);
    assert.ok(dist < 1, `换场后玩家站在战场中心（实际离中心 ${dist.toFixed(1)}）`);
    assert.ok(game.runPyres >= game.pyreTotal, '这一局一共点过多少座灯台要累计得上');
  }

  // ── 轮着来：走完一圈回到第一片，而且不是同一张地图 ──
  assert.equal(visited[0], stages[0].id);
  assert.equal(visited[stages.length], stages[0].id, `第 ${stages.length + 1} 轮应回到第一片战场（${visited.join(' → ')}）`);
  assert.equal(new Set(visited.slice(0, stages.length)).size, stages.length, `一圈里每片战场各来一次（${visited.join(' → ')}）`);
  const firstWood = sigs[0];
  const secondWood = sigs.find((x, i) => i > 0 && x.id === firstWood.id);
  assert.ok(secondWood, `一圈里应回到过「${firstWood.id}」`);
  assert.notEqual(secondWood.sig, firstWood.sig, '第二次进同一片战场应是新铺的一局，不是上次那张图');

  // ── 一关一张的新关卡提示卡：四片战场各讲一次 ──
  for (const st of stages.slice(0, stages.length)) {
    assert.ok(game.save.tips.includes(`stage:${st.id}`), `走进「${st.theme.name}」该弹一张关卡卡`);
  }
  assert.ok(game.save.codex.some((k) => String(k).endsWith(`:${stages[1].id}`)), '图鉴要记下走过的战场');
  assert.ok(hud.toastRoot.children.length > 0, '换场时公告里要说一声');

  // ── 战役模式不受影响：那边一关换一次，且照旧给那口补给 ──
  game.newRun('warden', 'normal', false);
  assert.equal(game.currentStage().id, stages[0].id, '战役从第一关开始');
  assert.equal(game.nextArena(), null, '战役里没有"下一片战场"这回事');
  game.state = 'shop';
  game.ui.showScreen('shop');
  assert.ok(!String(game.ui.screen.innerHTML).includes('下一片战场'), '战役的补给站不该出现无尽的那行字');
  const lowHp = game.player.stats.maxHp * 0.2;
  const lowOil = game.player.oilMax * 0.3;
  game.player.hp = lowHp;
  game.player.oil = lowOil;
  game.continueStage();
  assert.equal(game.currentStage().id, stages[1].id, '战役照旧推进到第二关');
  assert.ok(game.player.hp > lowHp, `战役换关仍然给那口 40% 补给（${lowHp} → ${game.player.hp}）`);
  assert.ok(game.player.oil > lowOil, '那一口补给里也有油');

  assert.deepEqual(errors, [], `不应有 console 错误：${errors.slice(0, 3).join(' | ')}`);
});
