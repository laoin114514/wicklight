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
  // 掠影、伏灯那一串调参值是"名字 → 数"的表，不是条目列表，单独按数值校验（见下）
  for (const [name, arr] of Object.entries(data)) {
    if (name === 'graze' || name === 'mines') continue;
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
