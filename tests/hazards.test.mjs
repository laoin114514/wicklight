/**
 * 新险境：荆棘回廊与寒潮。
 *
 * 两种都把压力放在"位置"而不是"血量"上：
 * 荆棘回廊在四周围一圈、只留一道缝，考的是找出口；
 * 寒潮不咬人，但踩进霜冻会又慢又费油、灯火也暗一截，考的是别站错地方。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('荆棘回廊与寒潮：围住你、拖住你，而且讲得清', async (t) => {
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

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;
  game.director.hazardTimer = 9999; // 别让导演自己插一脚，下面要手控
  game.enemies.clear();

  // ── 关卡表里出现的新险境，图鉴里要读得懂（不是原始 id） ──
  const wood = catalog.stages.find((s) => s.id === 'gloamwood');
  const city = catalog.stages.find((s) => s.id === 'nightcity');
  assert.ok(wood.hazards.includes('bramble'), '幽林该有荆棘回廊');
  assert.ok(city.hazards.includes('coldfront'), '长夜之城该有寒潮');
  const rows = game.codex.entry('stage:gloamwood').rows ?? [];
  const joined = rows.map(([, v]) => v).join(' ');
  assert.ok(joined.includes('荆棘回廊'), '关卡的险境应写出「荆棘回廊」而不是 bramble');
  const cityRows = (game.codex.entry('stage:nightcity').rows ?? []).map(([, v]) => v).join(' ');
  assert.ok(cityRows.includes('寒潮'), '关卡的险境应写出「寒潮」');

  // ── 荆棘回廊：一圈荆棘围着玩家，只留一道缺口 ──
  game.hazards.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.handleHazard('bramble');
  const thorns = game.hazards.filter((h) => h.kind === 'thorn');
  assert.equal(thorns.length, 11, `一圈 15 个位置、留 4 个当缺口（实际 ${thorns.length}）`);
  for (const h of thorns) {
    const r = Math.hypot(h.x - game.player.x, h.y - game.player.y);
    assert.ok(Math.abs(r - 250) < 1, `荆棘应围在固定半径上（实际 ${r.toFixed(1)}）`);
  }
  const angles = thorns.map((h) => (Math.atan2(h.y - game.player.y, h.x - game.player.x) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  let widest = 0;
  for (let i = 0; i < angles.length; i += 1) {
    const next = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
    widest = Math.max(widest, next - angles[i]);
  }
  assert.ok(widest > 1.4, `围栏必须留得出一道缺口（最大空档 ${(widest * 57.3).toFixed(0)}°）`);
  assert.ok(widest < Math.PI * 2 * 0.6, `缺口不该大到围栏形同虚设（${(widest * 57.3).toFixed(0)}°）`);

  // 首次遭遇要讲一句怎么破：围栏的破法是"找缝"
  const tips = hud.toastRoot.children.filter((c) => String(c.className).includes('toast--tip'));
  assert.ok(tips.length >= 1, '第一次遇到荆棘回廊应弹一张提示卡');
  const tipText = String(tips[tips.length - 1].innerHTML);
  assert.ok(tipText.includes('荆棘回廊') && tipText.includes('缺口'), `提示卡要写清怎么破（实际「${tipText}」）`);

  // 站在荆棘上会被扎
  game.hazards.length = 0;
  game.player.x = 120;
  game.player.y = 120;
  game.hazards.push({ kind: 'thorn', timer: 0.02, x: 120, y: 120, r: 54 });
  const hp0 = game.player.hp;
  game.update(1 / 30);
  assert.ok(game.player.hp < hp0, '荆棘炸开时站在上面要挨一下');

  // ── 寒潮：铺下霜冻，踩上去又慢又费油、灯火更暗 ──
  game.hazards.length = 0;
  game.grounds.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.player.hp = 1_000_000;
  game.handleHazard('coldfront');
  const frost = game.grounds.filter((g) => g.kind === 'frost');
  assert.equal(frost.length, 5, `寒潮应铺下 5 片霜冻（实际 ${frost.length}）`);

  // 站在霜冻里：减速 + 更费油 + 灯火更暗
  const f = frost[0];
  game.player.x = f.x;
  game.player.y = f.y;
  game.setInput(0, 0, false, false);
  game.hitStop = 0; // 上面刚挨过荆棘，打击停顿会冻结世界
  game.update(1 / 60);
  assert.ok(game.player.terrainSlow < 1, `霜冻该拖住脚步（slow=${game.player.terrainSlow}）`);
  assert.ok(game.player.terrainOil > 1, `霜冻该让灯油烧得更凶（oil=${game.player.terrainOil}）`);
  assert.ok(game.player.terrainLight < 1, `霜冻该把灯火压暗一截（light=${game.player.terrainLight}）`);
  assert.equal(game.player.hp, 1_000_000, '霜冻不该直接掉血');

  // 离开霜冻就恢复
  game.player.x = f.x + 900;
  game.player.y = f.y + 900;
  game.hitStop = 0;
  game.update(1 / 60);
  assert.equal(game.player.terrainSlow, 1, '离开霜冻应恢复速度');
  assert.equal(game.player.terrainOil, 1, '离开霜冻应恢复灯油耗率');
  assert.equal(game.player.terrainLight, 1, '离开霜冻应恢复灯火');

  // 霜冻会自己化掉
  const life0 = game.grounds.find((g) => g.kind === 'frost').life;
  game.update(1 / 60);
  assert.ok(game.grounds.find((g) => g.kind === 'frost').life < life0, '霜冻应逐渐消退');

  // ── 霜行者：在霜冻里累计踩满 6 秒 ──
  game.frostTime = 5.99;
  const f2 = game.grounds.find((g) => g.kind === 'frost');
  game.player.x = f2.x;
  game.player.y = f2.y;
  for (let i = 0; i < 6; i += 1) {
    game.hitStop = 0;
    game.update(1 / 60);
  }
  assert.ok(game.save.achievements.includes('frost_walker'), '踩满 6 秒霜冻应解锁「霜行者」');

  assert.deepEqual(errors, [], `不应有 console 错误：${errors.join(' | ')}`);
});
