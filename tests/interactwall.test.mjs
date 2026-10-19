/**
 * 墙后的交互（v106）：灯台与祭坛都不是隔墙按得动的按钮。
 *
 * 这两处到 v105 为止都只问“玩家离目标中心有多近”：点燃灯台是 84px、祭坛自动开启是 46px。
 * 可 v94 起灯火已经停在墙面上，v105 又让余烬风的灯台庇护只认墙这一侧的光；如果交互仍能
 * 隔着墙发生，玩家就会看到“光照不到这里，火却点着了 / 祭坛却开门了”。这一份把两条都钉住：
 * 墙在中间时进度不动、祭坛不弹；墙挪到旁边（不是把地图上的墙清空）才恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=interact-${tag}-${Date.now()}-${Math.random()}`);
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
  game.level.walls.length = 0;
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

test('灯台点燃认墙：墙后进度不动，墙挪到旁边才点得着（v106）', async (t) => {
  const game = await open(t, 'pyre');
  const pyre = { x: 70, y: 0, lit: false, progress: 0, flame: 0 };
  game.level.pyres.splice(0, game.level.pyres.length, pyre);

  // 70px 在 84px 的点燃半径里，但一堵墙横在玩家与灯台中间。
  game.level.walls.push({ x: 28, y: -60, w: 16, h: 120 });
  for (let i = 0; i < 12; i += 1) game.updatePyres(1 / 60);
  assert.equal(pyre.progress, 0, '墙后不该积累点燃进度');
  assert.equal(game.pyreChannel, null, '墙后的灯台不该被认成正在点燃的那一座');

  // 只把墙挪到旁边：玩家与灯台仍在同一侧，证明挡路的是中间那堵墙。
  game.level.walls[0] = { x: 0, y: 100, w: 140, h: 16 };
  game.updatePyres(1 / 60);
  assert.ok(pyre.progress > 0, '墙在旁边时仍应开始点燃');
  assert.equal(game.pyreChannel, pyre, '同一侧时应照旧认作正在点燃的灯台');
});

test('祭坛开启认墙：墙后不弹面板，墙挪到旁边才自动开启（v106）', async (t) => {
  const game = await open(t, 'shrine');
  const shrine = { x: 40, y: 0, used: false, prompted: false };
  game.level.shrines.splice(0, game.level.shrines.length, shrine);

  // 40px 在 46px 的自动开启半径里，但墙从中间穿过。
  game.level.walls.push({ x: 18, y: -30, w: 10, h: 60 });
  game.updateShrines();
  assert.equal(game.state, 'playing', '墙后不该被祭坛打断战斗');
  assert.equal(game.shrineOpen, null, '墙后不该打开祭坛面板');
  assert.equal(shrine.prompted, false, '墙后也不该记成已经提示过');

  // 墙挪到旁边而不是清空：同一侧仍应正常开启。
  game.level.walls[0] = { x: 0, y: 70, w: 120, h: 14 };
  game.updateShrines();
  assert.equal(game.state, 'shrine', '墙在旁边时应正常打开祭坛');
  assert.equal(game.shrineOpen, shrine, '打开的应是半径里的那座祭坛');
});
