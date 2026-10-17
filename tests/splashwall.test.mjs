/**
 * 「糜液溅墙」（v92）回归测试。
 *
 * 墙从 v84 起就拦住子弹，可那一刀回答的是"正中那一下"：弹体进墙就死。
 * 喷糜者这一口是液体——打在石头上会溅开。墙照旧挡住整颗弹，但贴着墙面站的人
 * 会吃到半口；退开一步就安全。这一条只解释"贴墙"为什么还有代价，不是把墙变透明。
 *
 * 四个边界都钉在这里：
 *   ① 贴墙（落点约 38px）吃 4.5 点，退开 20px（58px）就是 0；
 *   ② 没有墙时照旧是整口 9 点，而且只算一次——这一刀不碰"打中"本身；
 *   ③ 第二堵墙接在第一堵后面时，溅射不许继续穿：差 10px 就够得着的距离也必须是 0；
 *   ④ 首领的环形弹（`nightfall`）、其它来源、玩家自己的弹都不溅。
 *
 * 为什么是 52px：墙厚 20、玩家半径 14、子弹一帧进墙 4px，贴墙背站的人离
 * "进墙前那一点"约 38px；再退 20px 就掉到 60px 外。52 正好夹在两者中间。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 一堵竖墙：x 100~120。弹从 96 往 +x 飞，一帧后就进墙。 */
const WALL = { x: 100, y: -300, w: 20, h: 600 };
/** 第二堵紧贴在第一堵背后：只为证明"溅射也会被下一堵墙拦住"。 */
const WALL2 = { x: 120, y: -300, w: 10, h: 600 };

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=splash-${tag}-${Date.now()}-${Math.random()}`);
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
  game.hazards.length = 0;
  game.grounds.length = 0;
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return { game, p };
}

/**
 * 从 (96, 0) 往 +x 发一颗弹，跑 60 帧，读回真正扣掉的血与命中次数。
 * 玩家钉在 `playerX`，不吃无敌帧以外的任何别的伤害（场上没有别的伤害源）。
 */
function shot(game, p, { walls, playerX, owner = 'spitter', fromPlayer = false, damage = 9 }) {
  game.level.walls.length = 0;
  for (const w of walls) game.level.walls.push(w);
  game.enemies.clear();
  game.projectiles.clear();
  game.grounds.length = 0;
  p.x = playerX;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.oil = p.oilMax;
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  p.invuln = 0;
  p.dashTimer = 0;
  let hits = 0;
  let amount = 0;
  const realDamage = game.damagePlayer.bind(game);
  game.damagePlayer = (a, hx, hy, drain, src) => {
    if (src === owner) {
      hits += 1;
      amount += a;
    }
    return realDamage(a, hx, hy, drain, src);
  };
  game.projectiles.spawn({
    x: 96,
    y: 0,
    vx: 250,
    vy: 0,
    damage,
    radius: 7,
    fromPlayer,
    ownerId: owner,
    maxLife: 3,
    color: '#c9a3ff',
  });
  for (let i = 0; i < 60; i += 1) {
    p.x = playerX;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
  game.damagePlayer = realDamage;
  return { hpLost: 1e6 - p.hp, hits, amount };
}

test('贴墙背会溅到半口，退开 20px 就是 0', async (t) => {
  const { game, p } = await open(t, 'hug');
  // 玩家中心离"进墙前那一点"38px：贴墙（墙背 + 14px 身体半径）
  const hug = shot(game, p, { walls: [WALL], playerX: 134 });
  assert.equal(hug.hits, 1, `贴墙该挨这一下：命中 ${hug.hits} 次`);
  assert.equal(hug.amount, 4.5, `只算半口 4.5：实际 ${hug.amount}`);
  assert.equal(hug.hpLost, 4.5, `血也只掉 4.5：实际 ${hug.hpLost}`);
  // 再退开 20px：58px > 52px，一下都不该挨
  const away = shot(game, p, { walls: [WALL], playerX: 154 });
  assert.deepEqual(
    { hits: away.hits, amount: away.amount, hpLost: away.hpLost },
    { hits: 0, amount: 0, hpLost: 0 },
    `退开 20px 就该安全：${JSON.stringify(away)}`,
  );
  // 圆心量的是"进墙前那一点"（96），不是已经陷进墙里的 100.17：
  // 148.5 离 96 是 52.5px（刚好出圈），离 100.17 只有 48.3px（会误判成挨打）。
  const rim = shot(game, p, { walls: [WALL], playerX: 148.5 });
  assert.deepEqual(
    { hits: rim.hits, amount: rim.amount, hpLost: rim.hpLost },
    { hits: 0, amount: 0, hpLost: 0 },
    `52px 是量到进墙前那一点的：${JSON.stringify(rim)}`,
  );
});

test('没有墙时照旧整口 9 点，而且只算一次', async (t) => {
  const { game, p } = await open(t, 'open');
  const r = shot(game, p, { walls: [], playerX: 134 });
  assert.equal(r.hits, 1, `这一刀不碰"打中"本身：命中 ${r.hits} 次`);
  assert.equal(r.amount, 9, `没有墙就是整口 9：实际 ${r.amount}`);
  assert.equal(r.hpLost, 9, `血掉 9：实际 ${r.hpLost}`);
});

test('第二堵墙挡住溅射：差 10px 也过不去', async (t) => {
  const { game, p } = await open(t, 'second');
  // 只有第一堵墙时，144 离落点 48px（在 52 以内），会挨半口
  const one = shot(game, p, { walls: [WALL], playerX: 144 });
  assert.equal(one.amount, 4.5, `先证明 48px 确实够得着：${one.amount}`);
  // 背后再贴一堵 10px 厚的墙：同一套距离，必须是 0
  const two = shot(game, p, { walls: [WALL, WALL2], playerX: 144 });
  assert.deepEqual(
    { hits: two.hits, amount: two.amount, hpLost: two.hpLost },
    { hits: 0, amount: 0, hpLost: 0 },
    `第二堵墙必须挡住溅射：${JSON.stringify(two)}`,
  );
});

test('首领环 / 其它来源 / 玩家自己的弹都不溅', async (t) => {
  const { game, p } = await open(t, 'owners');
  for (const [label, opts] of [
    ['首领环', { owner: 'nightfall', fromPlayer: false }],
    ['普通敌人', { owner: 'shade', fromPlayer: false }],
    ['玩家弹', { owner: 'spitter', fromPlayer: true }],
  ]) {
    const r = shot(game, p, { walls: [WALL], playerX: 134, ...opts });
    assert.deepEqual(
      { hits: r.hits, amount: r.amount, hpLost: r.hpLost },
      { hits: 0, amount: 0, hpLost: 0 },
      `${label} 打在墙上不该有糜液溅射：${JSON.stringify(r)}`,
    );
  }
});
