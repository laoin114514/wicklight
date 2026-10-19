/**
 * 「噬灯魅」的抽取也停在墙面上（v97）。
 *
 * 它是唯一一只靠"吊在中距离"持续抽油的精英；到 v96 为止那条抽取只问距离，
 * 所以一堵墙既能挡住子弹、也能挡住你的灯，却挡不住它把手伸过来。这一条量两件事：
 * 墙后不抽油、而且它会像喷糜者（v90）那样压上来，而不是贴着墙干耗。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=siphonwall-${tag}-${Date.now()}-${Math.random()}`);
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
  game.xpToNext = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.setInput(0, 0, false, false);
  const p = game.player;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  p.weapons.clear();
  return { game, p };
}

/** 站桩 2 秒；返回剩油与噬灯魅朝玩家挪了多少。 */
function drain(game, p, walls) {
  game.level.walls.length = 0;
  for (const w of walls) game.level.walls.push(w);
  game.enemies.clear();
  p.oil = p.oilMax;
  const e = game.enemies.spawn('siphon', p.x + 400, p.y, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.spawnTimer = 0;
  const startX = e.x;
  for (let i = 0; i < 120; i += 1) game.update(1 / 60);
  return { oil: p.oil, moved: startX - e.x };
}

test('墙后抽不到油；墙旁边的无墙对照照旧抽', async (t) => {
  const { game, p } = await open(t, 'siphon');
  const opened = drain(game, p, []);
  const walled = drain(game, p, [{ x: p.x + 180, y: p.y - 500, w: 50, h: 1000 }]);

  assert.ok(opened.oil < p.oilMax * 0.97, `无墙时两秒内应明显被抽油（${opened.oil.toFixed(2)}）`);
  assert.ok(
    walled.oil > opened.oil + p.oilMax * 0.03,
    `墙后不该被抽油（无墙 ${opened.oil.toFixed(2)} / 墙后 ${walled.oil.toFixed(2)}）`,
  );
  assert.ok(
    walled.moved > opened.moved + 30,
    `它该绕过墙压上来，而不是隔着墙吊住（无墙 ${opened.moved.toFixed(1)} / 墙后 ${walled.moved.toFixed(1)}）`,
  );
});

test('「蚀油」词缀的贴身抽取也在墙面上停住', async (t) => {
  const { game, p } = await open(t, 'sappers');
  const drainSappers = (walls) => {
    game.level.walls.length = 0;
    for (const w of walls) game.level.walls.push(w);
    game.enemies.clear();
    p.oil = p.oilMax;
    const e = game.enemies.spawn('shade', p.x + 100, p.y, 1, 1);
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
    e.spawnTimer = 0;
    e.speed = 0;
    game.applyAffix(e, 'sappers');
    for (let i = 0; i < 120; i += 1) game.update(1 / 60);
    return p.oil;
  };
  const opened = drainSappers([]);
  const walled = drainSappers([{ x: p.x + 45, y: p.y - 300, w: 30, h: 600 }]);
  assert.ok(opened < p.oilMax * 0.98, `无墙时蚀油应抽走灯油（${opened.toFixed(2)}）`);
  assert.ok(
    walled > opened + p.oilMax * 0.02,
    `墙后蚀油不该再抽（无墙 ${opened.toFixed(2)} / 墙后 ${walled.toFixed(2)}）`,
  );
});

/** 画一遍场上的噬灯魅，只取那条从它身上出发的抽油线。 */
function siphonBeam(game, walls) {
  const segments = [];
  let last = null;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key === 'moveTo') return (x, y) => { last = [x, y]; };
        if (key === 'lineTo') return (x, y) => { segments.push([...(last ?? []), x, y]); };
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
  return segments.filter(([x0, y0]) => Math.abs(x0 - 100) < 1e-9 && Math.abs(y0) < 1e-9);
}

test('那根紫色的抽油线也停在墙面上，墙在旁边时逐位不变', async (t) => {
  const { game, p } = await open(t, 'beam');
  game.enemies.clear();
  game.level.walls.length = 0;
  p.x = 0;
  p.y = 0;
  const e = game.enemies.spawn('siphon', 100, 0, 1, 1);
  e.spawnTimer = 0;
  e.hitFlash = 0;

  const opened = siphonBeam(game, []);
  const walled = siphonBeam(game, [{ x: 40, y: -50, w: 20, h: 100 }]);
  const beside = siphonBeam(game, [{ x: 40, y: 80, w: 20, h: 100 }]);

  assert.deepEqual(opened, [[100, 0, 0, 0]], `无墙时线要连到玩家（${JSON.stringify(opened)}）`);
  assert.deepEqual(walled, [[100, 0, 60, 0]], `墙在中间时线要断在墙面 x=60（${JSON.stringify(walled)}）`);
  assert.deepEqual(beside, opened, `墙在旁边不该改这一条线（${JSON.stringify(beside)}）`);
});

test('主循环渲染时真的把这一关的墙递给敌人美术', async (t) => {
  const { game } = await open(t, 'draw-walls');
  game.enemies.clear();
  game.level.walls.length = 0;
  const wall = { x: 40, y: -50, w: 20, h: 100 };
  game.level.walls.push(wall);

  let passed = null;
  const realDraw = game.enemies.draw.bind(game.enemies);
  game.enemies.draw = (ctx, time, px, py, view, walls) => {
    passed = walls;
    return realDraw(ctx, time, px, py, view, walls);
  };
  game.render();

  assert.equal(passed, game.level.walls, '传给敌人美术的应当是当前关卡那同一个墙数组');
  assert.equal(passed?.[0], wall, '这个数组里应当有刚摆下的那面墙');
});
