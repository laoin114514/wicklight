/**
 * 追踪火苗的每帧重定向也走同一条索敌（v103）。
 *
 * 发射那一刻的索敌从 v89 起就会优先挑看得见的：墙后更近的那只不会抢走准星。
 * 可 `wisp` 的飞萤在飞行途中每一帧都会再问一次"最近的黑暗在哪儿"，而那个调用点
 * 一直只按距离找——前面明明有一只看得见的，飞萤却会拐向墙后那只、撞在墙面上。
 * 这一份用例把两个承诺钉住：
 *   1. 有墙时，看得见的优先；墙后更近不改变这一点；
 *   2. 没有墙时，最近的那只照旧优先——这一版只补墙这一档，不重写追踪规则。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const DT = 1 / 60;

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=homingwall-${tag}-${Date.now()}-${Math.random()}`);
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
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.critChance = 0;
  p.stats.critMult = 1;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  return { game, p };
}

function dummy(game, id, x, y) {
  const e = game.enemies.spawn(id, x, y, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.spawnTimer = 0;
  e.speed = 0;
  e.vx = 0;
  e.vy = 0;
  return e;
}

/** 从玩家脚下朝正上方放一颗只有追踪、没有初始目标的飞萤，跑完这一发。 */
function fly(game, p, frames = 90) {
  game.projectiles.spawn({
    x: p.x,
    y: p.y,
    vx: 0,
    vy: -300,
    damage: 5,
    radius: 7,
    homing: 6,
    maxLife: 1.6,
    weaponId: 'wisp',
  });
  let maxX = 0;
  for (let i = 0; i < frames; i += 1) {
    p.hp = 1e6;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(DT);
    for (const proj of game.projectiles.all) maxX = Math.max(maxX, proj.x);
    if (!game.projectiles.all.some((proj) => proj.active)) break;
  }
  return maxX;
}

test('墙后更近时，追踪弹改追看得见的那只', async (t) => {
  const { game, p } = await open(t, 'behind');
  game.level.walls.push({ x: 100, y: -120, w: 20, h: 240 });
  const hidden = dummy(game, 'bulwark', 170, 0);
  const visible = dummy(game, 'bulwark', 0, -220);

  fly(game, p);

  assert.equal(hidden.hp, hidden.maxHp, '墙后那只不该被拐过去的飞萤打中');
  assert.ok(visible.hp < visible.maxHp, '看得见的那只才该吃这一发');
});

test('没有墙时，追踪弹照旧追最近的那只', async (t) => {
  const { game, p } = await open(t, 'open');
  const near = dummy(game, 'bulwark', 170, 0);
  const far = dummy(game, 'bulwark', 0, -220);

  fly(game, p);

  assert.ok(near.hp < near.maxHp, '没有墙时最近的那只照旧优先');
  assert.equal(far.hp, far.maxHp, '更远的那只不该抢走目标');
});

test('全都隔着墙时，仍保留最近目标的兜底', async (t) => {
  const { game, p } = await open(t, 'fallback');
  game.level.walls.push({ x: 100, y: -120, w: 20, h: 240 });
  const hidden = dummy(game, 'bulwark', 170, 0);

  const maxX = fly(game, p);

  assert.equal(hidden.hp, hidden.maxHp, '墙后那只照旧挨不到——墙还是实心的');
  assert.ok(maxX > 60, `没有看得见的目标时，飞萤仍应朝最近的那只拐过去（最远只到 x=${maxX.toFixed(1)}）`);
});
