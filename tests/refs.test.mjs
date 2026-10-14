/**
 * 引用自洽：数据表之间互相引用的 id 必须都存在。
 *
 * 这类错误不会在构建时暴露——写错一个字的后果是"打到那一刻才炸"或者"永远拿不到"：
 *   · 关卡写了一个不存在的精英 id → 精英登场时 `ENEMY_MAP[id].name` 当场抛异常；
 *   · 悬赏指向不存在的敌人 → 那张悬赏永远做不完；
 *   · 险境 id 不在 HAZARD_LABEL 里 → 图鉴里的名字是 undefined。
 * 所以把它们钉在测试里，而不是等着玩家踩。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('数据表之间的 id 引用都成立', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, data, catalog } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  const enemies = new Set(catalog.enemies.map((e) => e.id));
  const normal = new Set(catalog.normalEnemies);
  const stages = catalog.stages;

  // ── 关卡：首领 / 精英 / 险境 ──
  for (const s of stages) {
    assert.ok(enemies.has(s.boss), `关卡 ${s.id} 的首领 ${s.boss} 不在敌人表里`);
    for (const e of s.elites) assert.ok(enemies.has(e), `关卡 ${s.id} 的精英 ${e} 不在敌人表里`);
    assert.ok(s.hazards.length > 0, `关卡 ${s.id} 至少要有一处险境`);
  }
  // 险境的 id 得进得了图鉴（名字 / 应付办法都不缺）
  const hazardEntries = new Map();
  for (const entry of (game.codex?.catalog ?? [])) if (entry.kind === 'hazard') hazardEntries.set(entry.id, entry);
  const allHazards = new Set(stages.flatMap((s) => s.hazards));
  for (const id of allHazards) {
    const entry = hazardEntries.get(id);
    assert.ok(entry, `险境 ${id} 在关卡里出现了，但图鉴里没有`);
    assert.ok(entry.name && entry.name !== 'undefined', `险境 ${id} 在图鉴里没有名字`);
    assert.ok(
      entry.rows.some(([, v]) => v && v !== '——'),
      `险境 ${id} 的图鉴条目里没有"怎么应付"`,
    );
  }

  // ── 悬赏：猎杀对象要在表里，且是可刷出来的普通敌人 ──
  for (const b of data.bounties) {
    if (!b.enemy) continue;
    assert.ok(enemies.has(b.enemy), `悬赏 ${b.id} 指向的敌人 ${b.enemy} 不存在`);
    assert.ok(normal.has(b.enemy), `悬赏 ${b.id} 指向的 ${b.enemy} 不是会被刷出来的普通敌人（永远做不完）`);
  }

  // ── 灯火 / 遗物 / 被动 / 夜咒 / 元进程：互相引用的 id ──
  const relics = new Set(data.relics.map((r) => r.id));
  const passives = new Set(data.passives.map((p) => p.id));
  const weapons = new Set(data.weapons.map((w) => w.id));
  for (const w of data.weapons) {
    if (!w.evolve) continue;
    assert.ok(weapons.has(w.evolve.into), `武器 ${w.id} 进化指向的 ${w.evolve.into} 不存在`);
    assert.ok(passives.has(w.evolve.passive), `武器 ${w.id} 进化要求的被动 ${w.evolve.passive} 不存在`);
  }
  for (const r of data.relics) {
    for (const w of r.require ?? []) {
      if (typeof w === 'string') assert.ok(weapons.has(w) || relics.has(w) || passives.has(w), `遗物 ${r.id} 依赖的 ${w} 不存在`);
    }
  }
});

test('认不出来的敌人 id 会降级成兜底那种，而且死得掉', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=dead-${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  const bad = game.enemies.spawn('definitely_not_an_enemy', 60, 0, 1, 1);
  assert.equal(bad.defId, 'shade', '兜底成影蛭之后，defId 也要是解析后的 id（否则死亡结算会炸）');

  // 打死它：走一遍完整死亡结算（图鉴发现 / 连杀 / 掉落 / 死亡特效）
  assert.doesNotThrow(() => {
    game.enemies.damage(bad, 1e9, game.lightCtx(), 0, 0, 0);
  }, '兜底怪也要能正常死掉——这里正是"数据写错一个字母，一局打到它死才崩"的那一步');
  for (let i = 0; i < 10; i += 1) game.update(1 / 60);
  assert.equal(game.enemies.count, 0, '死了要回收掉');
});
