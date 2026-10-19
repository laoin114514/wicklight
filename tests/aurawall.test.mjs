/**
 * 「引灯」与「疾风」的速度光环也认墙（v99）。
 *
 * 墙已经把引灯的光裁到同一侧（v94），但光环原先只问半径：墙后的影蛭明明站在
 * 墙影里，却还能隔着墙吃到 1.35 倍速度。这一条同时量三种位置（无墙 / 隔墙 / 墙旁），
 * 每个位置连跑三帧——buff 每帧归零重算，只测一帧容易把“恰好没被覆盖”当成修好了。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=aurawall-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.enemies.clear();
  game.player.x = 6000;
  game.player.y = 6000;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

/** 画一遍场上的引灯，只取半径 210 的那圈光环弧。 */
function beaconArcs(game, walls) {
  const arcs = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key === 'arc') {
          return (x, y, radius, start, end) => {
            if (Math.abs(radius - 210) < 1e-9) arcs.push([start, end]);
          };
        }
        if (key === 'createRadialGradient' || key === 'createLinearGradient' || key === 'createPattern') {
          return () => gradient;
        }
        if (key === 'measureText') return () => ({ width: 6 });
        if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (key in target) return target[key];
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  game.enemies.draw(ctx, 0, 0, 0, undefined, walls);
  return arcs;
}

test('引灯与疾风的速度光环停在墙面上', async (t) => {
  const game = await open(t);

  const probe = (kind, walls) => {
    game.level.walls.length = 0;
    for (const wall of walls) game.level.walls.push(wall);
    game.enemies.clear();

    const source = game.enemies.spawn(kind === 'beacon' ? 'beacon' : 'shade', 0, 0, 1, 1);
    if (kind === 'haste') game.applyAffix(source, 'haste');
    const ally = game.enemies.spawn('shade', 120, 0, 1, 1);
    for (const enemy of [source, ally]) {
      enemy.speed = 0;
      enemy.damage = 0;
      enemy.spawnTimer = 0;
    }

    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      game.enemies.update(1 / 60, game.enemyCtx());
      seen.push(ally.buff);
    }
    return seen;
  };

  const between = [{ x: 45, y: -300, w: 30, h: 600 }];
  const beside = [{ x: -500, y: 200, w: 1100, h: 30 }];
  const buffed = [1.35, 1.35, 1.35];
  const plain = [1, 1, 1];

  assert.deepEqual(probe('beacon', []), buffed, '无墙时引灯应连续三帧给附近敌人加速');
  assert.deepEqual(probe('beacon', between), plain, '墙后代应连续三帧吃不到引灯光环');
  assert.deepEqual(probe('beacon', beside), buffed, '墙在旁边时引灯光环应逐帧照旧');

  assert.deepEqual(probe('haste', []), buffed, '无墙时疾风应连续三帧给附近敌人加速');
  assert.deepEqual(probe('haste', between), plain, '墙后代应连续三帧吃不到疾风光环');
  assert.deepEqual(probe('haste', beside), buffed, '墙在旁边时疾风光环应逐帧照旧');

  game.enemies.clear();
  const beacon = game.enemies.spawn('beacon', 0, 0, 1, 1);
  beacon.spawnTimer = 0;
  const ringSpan = (arcs) => arcs.reduce((span, [a0, a1]) => span + Math.abs(a1 - a0), 0);
  const openedRing = beaconArcs(game, []);
  const walledRing = beaconArcs(game, between);
  const besideRing = beaconArcs(game, [{ x: -500, y: 260, w: 1100, h: 30 }]);

  assert.equal(openedRing.length, 1, '无墙时光环应是一整圆');
  assert.ok(Math.abs(ringSpan(openedRing) - Math.PI * 2) < 1e-9, '无墙时光环应画满 360°');
  assert.ok(
    ringSpan(walledRing) < Math.PI * 2 - 1,
    `墙后那一段光环不该画出来（实际只剩 ${ringSpan(walledRing).toFixed(2)} 弧度）`,
  );
  assert.deepEqual(besideRing, openedRing, '墙在旁边时光环应与无墙逐位一致');
});
