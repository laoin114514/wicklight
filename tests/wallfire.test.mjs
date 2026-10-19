/**
 * 「壁火」（v110）回归测试。
 *
 * 它接的是 v86 的"正面冲刺撞墙会收掉这次冲刺"：同一个碰撞，没有遗物时只有代价；
 * 每个玩家撞墙都会炸出一圈只烧墙这一侧的火。要钉住四件事：
 *   1. 有遗物、正面撞墙：墙这一侧的目标挨打并点着，伤害记在「壁火」名下；
 *   2. 墙后的目标不挨打（伤害逐只过 `wallBetween`，不是 `blast()` 那种整圆）；
 *   3. 圈外的目标不挨打，防止把半径写成无限；
 *   4. 空冲、贴着墙平行冲都不触发——它奖励的是主动撞墙，不是每次按冲刺。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;
/** 一堵 400×80 的墙横在 (0,-100)：近面 y=-140、远面 y=-60。 */
const BARRIER = () => ({ x: -200, y: -140, w: 400, h: 80 });

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=wallfire-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
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
  game.grounds.length = 0;
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  const sounds = [];
  const real = game.audio.play.bind(game.audio);
  game.audio.play = (name) => {
    sounds.push(name);
    return real(name);
  };
  return { game, p, sounds };
}

function place(game, p, x = 0, y = -260) {
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.dashTimer = 0;
  p.dashCd = 0;
  p.invuln = 0;
  p.hp = 1e6;
  p.oil = p.oilMax;
  game.hitStop = 0;
}

/** 冲一次，一直跑到冲刺结束；返回这一路听到的音效。 */
function dash(game, p, sounds, wx, wy) {
  const s0 = sounds.length;
  for (let i = 0; i < 40; i += 1) {
    const before = p.dashTimer;
    game.setInput(wx, wy, i === 0, false);
    game.update(dt);
    if (before > 0 && p.dashTimer === 0) break;
  }
  return sounds.slice(s0);
}

function tough(game, x, y) {
  const e = game.enemies.spawn('shade', x, y, 1, 1);
  e.maxHp = 1e6;
  e.hp = 1e6;
  return e;
}

test('壁火：墙这一侧挨打并点着，墙后与圈外都不挨（v110）', async (t) => {
  const { game, p, sounds } = await open(t, 'hit');
  game.level.walls.push(BARRIER());
  const near = tough(game, 74, -170);
  const behind = tough(game, 0, -20);
  const outside = tough(game, 250, -260);

  place(game, p);
  const played = dash(game, p, sounds, 0, 1);
  assert.ok(played.includes('wallfire'), `撞墙那一下要有壁火自己的声音（听到 ${JSON.stringify(played)}）`);
  assert.ok(near.hp < near.maxHp, '墙这一侧、圈里的目标要挨打');
  assert.ok(near.burn >= 2, `壁火要留下两层灼烧（实测 ${near.burn}）`);
  assert.equal(behind.hp, behind.maxHp, '墙后的目标不许挨打');
  assert.equal(outside.hp, outside.maxHp, '半径之外的目标不许挨打');
  assert.ok((game.damageBySource.get('wallfire') ?? 0) > 0, '伤害构成里要有壁火这一笔');
  const row = game.damageBreakdown().find((r) => r.id === 'wallfire');
  assert.equal(row?.name, '壁火', '结算里那一行要叫「壁火」');
  assert.ok(game.codex.has('mechanic', 'wallfire'), '第一次触发要把壁火记进图鉴');
  assert.ok(game.save.tips.includes('wall:fire'), '第一次触发要弹一次壁火说明');
});

test('壁火：空冲与贴着墙平行冲都不触发', async (t) => {
  const { game, p, sounds } = await open(t, 'gate');
  place(game, p);
  let played = dash(game, p, sounds, 0, 1);
  assert.ok(!played.includes('wallfire'), '空地上冲刺不该触发壁火');

  game.level.walls.push(BARRIER());
  place(game, p, 0, -154);
  played = dash(game, p, sounds, 1, 0);
  assert.ok(!played.includes('wallfire'), '贴着墙平行冲照旧是滑行，不该触发壁火');
  assert.equal(game.damageBySource.get('wallfire') ?? 0, 0, '这两种冲刺都不该出现壁火伤害');
});

test('壁火余光：撞完留下一团短暂真实光源与墙脚焦痕（v112）', async (t) => {
  const { game, p, sounds } = await open(t, 'glow');
  game.director.spawnTimer = 1e9;
  game.level.walls.push(BARRIER());
  place(game, p);
  const decals = game.decals.length;
  const played = dash(game, p, sounds, 0, 1);
  assert.ok(played.includes('wallfire'), '这一条的前提是壁火真的触发了');
  assert.equal(game.wallfireGlows.length, 1, '墙脚要留下一团正在烧的余光');
  assert.ok(game.decals.length > decals, '墙脚要有一块焦痕（不是只有粒子）');
  assert.ok(game.wallfireGlows[0].life > 0.5, `余光该从 0.7 秒开始烧（实测 ${game.wallfireGlows[0].life.toFixed(2)}s）`);

  for (let i = 0; i < 50; i += 1) game.update(dt);
  assert.equal(game.wallfireGlows.length, 0, '0.7 秒之后余光要自己烧完');
  assert.ok(game.decals.length > decals, '焦痕比余光留得更久');
});

test('壁火：一次烧到五个解「一壁五焚」（v114）', async (t) => {
  const { game, p, sounds } = await open(t, 'crowd');
  game.level.walls.push(BARRIER());
  for (const x of [-80, -40, 0, 40, 80]) tough(game, x, -170);
  place(game, p);
  const played = dash(game, p, sounds, 0, 1);
  assert.ok(played.includes('wallfire'), '这一条的前提是壁火真的触发了');
  assert.ok(game.save.achievements.includes('wallfire_crowd'), '一次烧到 5 只该解「一壁五焚」');
});
