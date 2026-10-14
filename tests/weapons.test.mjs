/**
 * v8 武器回归：光矛（贯穿直线）与回旋灯刃（去程/回程各命中一次）。
 * 这两件武器的机制都"看起来能跑但可能其实是坏的"——光束的命中判定、
 * 回旋刃的掉头与二次命中，都必须真的跑一遍。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('新武器（光矛 / 回旋灯刃）与进化链', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, data } = handle;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1_000_000;
  game.player.hp = 1_000_000;
  game.director.phase = 'complete';

  // ── 数据表：两者都在、进化链闭合、被动真实存在 ──
  const beam = data.weapons.find((w) => w.id === 'beam');
  const blade = data.weapons.find((w) => w.id === 'boomerang');
  const dawn = data.weapons.find((w) => w.id === 'beam_dawnbreak');
  const twin = data.weapons.find((w) => w.id === 'blade_twinmoon');
  assert.ok(beam && beam.kind === 'beam', '应存在光矛（beam）');
  assert.ok(blade && blade.kind === 'boomerang', '应存在回旋灯刃（boomerang）');
  assert.deepEqual(beam.evolve, { passive: 'reach', into: 'beam_dawnbreak' }, '光矛的进化链应为 满级+广照 → 晨光破晓');
  assert.deepEqual(blade.evolve, { passive: 'swift', into: 'blade_twinmoon' }, '回旋灯刃的进化链应为 满级+疾行 → 双月轮');
  for (const w of [dawn, twin]) {
    assert.ok(w && w.evolved, `${w?.id} 应标记为进化形态`);
    assert.ok(w.levels.length >= 5, `${w.id} 至少应有 5 级`);
  }
  const passiveIds = new Set(data.passives.map((p) => p.id));
  for (const id of [beam.evolve.passive, blade.evolve.passive]) {
    assert.ok(passiveIds.has(id), `进化被动 ${id} 必须真实存在`);
  }
  for (const id of ['beam', 'boomerang']) {
    assert.ok(game.upgrades.generate(game.player, 200, game.rng).some((o) => o.id === id), `新武器池里应有 ${id}`);
    assert.ok(game.codex.entry(`weapon:${id}`), `图鉴应收录 ${id}`);
  }
  assert.ok(game.codex.total() >= 113, `图鉴条目应随内容增长（${game.codex.total()}）`);

  // ── 光矛：一条直线把排队的敌人全部串起来，站歪的不受影响 ──
  game.enemies.clear();
  const px = game.player.x;
  const py = game.player.y;
  const lined = [120, 240, 360].map((d) => game.enemies.spawn('shade', px + d, py, 8, 1));
  const offside = game.enemies.spawn('shade', px + 200, py + 200, 8, 1);
  const offHp = offside.hp;
  game.fireBeam(px, py, 0, 520, 13, 12, '#fff3c4');
  for (const e of lined) assert.ok(e.hp < e.maxHp, `光束应命中直线上的敌人（x=+${Math.round(e.x - px)}）`);
  assert.equal(offside.hp, offHp, '站歪的敌人不应被光束命中');
  assert.ok(game.beams.length > 0, '光束应留下可见特效');

  // ── 光矛：经由真实开火路径也能放出光束 ──
  game.enemies.clear();
  game.beams.length = 0;
  game.player.weapons.set('beam', 1);
  game.player.cooldowns.set('beam', 0);
  game.enemies.spawn('shade', px + 140, py, 8, 1);
  game.player.update(1 / 60, { moveX: 0, moveY: 0, dash: false, nova: false }, game.playerCtx());
  assert.ok(game.beams.length > 0, '装备光矛后应真的放出光束');
  assert.ok(game.player.cooldowns.get('beam') > 0, '开火后应进入冷却');

  // ── 回旋灯刃：飞出去、掉头、清空命中记录，回到手里才消失 ──
  game.enemies.clear();
  game.projectiles.clear();
  game.player.weapons.set('boomerang', 1);
  game.player.cooldowns.set('boomerang', 0);
  const target = game.enemies.spawn('shade', px + 220, py, 40, 1);
  game.player.update(1 / 60, { moveX: 0, moveY: 0, dash: false, nova: false }, game.playerCtx());
  const bladeP = game.projectiles.all.find((p) => p.active && p.weaponId === 'boomerang');
  assert.ok(bladeP, '装备回旋灯刃后应掷出弹体');
  assert.equal(bladeP.boomerang > 0, true, '弹体应带回收标记');
  assert.ok(bladeP.pierce >= 99, '回旋刃不应在去程被敌人消耗掉');

  const owner = { x: game.player.x, y: game.player.y };
  for (let i = 0; i < 20; i += 1) game.projectiles.update(1 / 60, () => ({ x: target.x, y: target.y }), owner);
  assert.ok(!bladeP.returning, '去程不应该已经掉头');

  // 去程命中过目标 → 命中记录里有它；掉头时必须清空，否则回程打不到同一只敌人
  bladeP.hitIds = [target.id];
  const owner2 = { x: game.player.x, y: game.player.y };
  let returnedAt = -1;
  let lastX = bladeP.x;
  let lastY = bladeP.y;
  for (let i = 0; i < 400 && bladeP.active; i += 1) {
    game.projectiles.update(1 / 60, () => null, owner2);
    if (bladeP.returning && returnedAt < 0) returnedAt = i;
    if (bladeP.active) {
      lastX = bladeP.x;
      lastY = bladeP.y;
    }
  }
  assert.ok(returnedAt >= 0, '回旋灯刃应该会掉头');
  assert.equal(bladeP.hitIds.length, 0, '掉头时应清空命中记录（这样回程能再打一次）');
  assert.ok(!bladeP.active, '回到手里后弹体应消失');
  assert.ok(
    Math.hypot(lastX - owner2.x, lastY - owner2.y) < 60,
    `弹体应在玩家附近收回（${Math.hypot(lastX - owner2.x, lastY - owner2.y).toFixed(1)}px）`,
  );

  // ── 成就：一次贯穿 5 个敌人 ──
  game.enemies.clear();
  game.save.achievements = game.save.achievements.filter((a) => a !== 'pierce_line');
  for (const d of [100, 160, 220, 280, 340]) game.enemies.spawn('shade', px + d, py, 8, 1);
  game.fireBeam(px, py, 0, 520, 13, 8, '#fff3c4');
  assert.ok(game.save.achievements.includes('pierce_line'), '一次光矛贯穿 5 个敌人应解锁「一线穿心」');

  // ── 成就：回旋灯刃回程命中 ──
  game.enemies.clear();
  game.projectiles.clear();
  game.save.achievements = game.save.achievements.filter((a) => a !== 'blade_return');
  const dummy = game.enemies.spawn('shade', px, py, 9_999, 1);
  const ret = game.projectiles.spawn({
    x: dummy.x, y: dummy.y, vx: 60, vy: 0,
    damage: 1, radius: 12, color: '#8ff0c8', pierce: 99, boomerang: 9, maxLife: 4, weaponId: 'boomerang',
  });
  ret.returning = true;
  for (let i = 0; i < 40 && !game.save.achievements.includes('blade_return'); i += 1) {
    ret.hitIds.length = 0; // 模拟"回程每经过一次都算一次命中"
    ret.x = dummy.x;
    ret.y = dummy.y;
    game.resolveProjectiles(1 / 60);
  }
  assert.ok(game.save.achievements.includes('blade_return'), '回旋灯刃回程命中 25 次应解锁「去而复返」');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
