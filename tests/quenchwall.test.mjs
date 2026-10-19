/**
 * 吹灯 / 啃灯也认墙（v107）。
 *
 * v94 起弃灯与灯台的光都停在墙面上，v100 又让「灯晕」只慢墙这一侧的怪；但只要墙角和
 * 34px 的啃灯圈 / 70px 的吹焰圈挨上，怪仍能隔着墙把灯掐灭。这里把两条物理接触都接回
 * `wallBetween`：墙在中间时灯还亮着，墙挪到旁边才恢复“凑近就吹/啃”。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=quenchwall-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.hazardTimer = 1e9;
  game.enemies.clear();
  game.projectiles.clear();
  game.pickups.clear();
  game.lamps.length = 0;
  game.level.walls.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

test('弃灯被吃掉认墙：墙后还亮着，墙挪到旁边才被啃（v107）', async (t) => {
  const game = await open(t, 'lamp');
  game.player.oil = 1;
  assert.equal(game.tryPlantLamp(), true, '开局应放得下一盏弃灯');
  const lamp = game.lamps[0];
  lamp.x = 0;
  lamp.y = 0;
  game.player.x = 500;
  game.player.y = 0;
  game.enemies.clear();
  // 30px 在 34px 的啃灯圈里，但一堵墙横在怪与灯之间。
  game.enemies.spawn('shade', 30, 0, 1, 1);
  game.level.walls.push({ x: 12, y: -40, w: 12, h: 80 });

  for (let i = 0; i < 30; i += 1) game.updateLamps(1 / 60);
  assert.equal(game.lamps.length, 1, '墙后的怪不该把灯吃掉');
  assert.ok(lamp.life > 10, `墙后那盏灯应继续烧（life=${lamp.life}）`);

  // 同一堵墙只挪到旁边：怪与灯在同一侧，啃灯恢复。
  game.level.walls[0] = { x: 0, y: 70, w: 120, h: 14 };
  game.updateLamps(1 / 60);
  assert.ok(lamp.life <= 0.36, `墙旁凑近仍应被啃（life=${lamp.life}）`);
});

test('吹灯客抽灯焰认墙：墙后灯焰不动，墙挪到旁边才掉（v107）', async (t) => {
  const game = await open(t, 'snuffer');
  // 一盏弃灯与一座灯台都摆在吹灯客右侧，墙从中间穿过。
  game.lamps.push({ x: 40, y: 0, life: 8, maxLife: 8 });
  const pyre = { x: 40, y: 20, lit: true, progress: 1, flame: 1 };
  game.level.pyres.splice(0, game.level.pyres.length, pyre);
  game.level.walls.push({ x: 18, y: -40, w: 12, h: 90 });

  game.quenchPyre(0, 0, 0.1);
  assert.equal(game.lamps.length, 1, '墙后那盏弃灯不该被吹灭');
  assert.equal(pyre.flame, 1, '墙后灯台的灯焰不该被抽走');

  // 墙挪到旁边：弃灯先被一口气吹灭（它更脆），灯台的账留到下一口。
  game.level.walls[0] = { x: -60, y: 70, w: 160, h: 14 };
  game.quenchPyre(0, 0, 0.1);
  assert.equal(game.lamps.length, 0, '墙旁凑近仍应吹灭弃灯');
  game.quenchPyre(0, 0, 0.1);
  assert.ok(pyre.flame < 1, `墙旁应能抽走灯台灯焰（flame=${pyre.flame}）`);
});
