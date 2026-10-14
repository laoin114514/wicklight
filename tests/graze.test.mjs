/**
 * 「掠影」回归测试：擦着危险走过去，热度就往上走；攒满点着一阵「灯焰高涨」。
 *
 * 这是这一版新加的、也是全局**唯一一条"贴得近有好处"的规则**，所以它得同时证明五件事：
 *   1. 擦过去真的算——计数、热度、那口灯油，还有那张只弹一次的说明卡；
 *   2. "在动"是前提——站着不动被围住，热度不该自己涨；
 *   3. "擦"不等于"黏"——同一只怪贴久了贡献归零（不然绕着最慢的那只怪转圈就能刷）；
 *   4. 攒满真的有增益，而且**有代价**（烧得更亮，也烧得更快）；
 *   5. 冲刺从弹幕正中穿过去是最赚的那条路：不挨打，还双倍。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 开一局干净的：关掉刷怪与祭坛，血量给到打不死，场面完全由测试自己摆。 */
async function open(t, tag = '') {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=graze-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  game.enemies.clear();
  game.projectiles.clear();
  game.player.x = 0;
  game.player.y = 0;
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  return game;
}

/**
 * 摆一只打不死的怪（默认影蛭：半径 13，接触距离 13+14=27，掠影带再往外 32）。
 * @param speed 0 = 钉在原地（当靶子用）；给正数它就会自己走过来。
 */
function statue(game, x, y, id = 'shade', speed = 0) {
  const e = game.enemies.spawn(id, x, y, 1, 1);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = speed;
  return e;
}

const run = (game, frames, mx = 0, my = 0) => {
  for (let i = 0; i < frames; i += 1) {
    game.setInput(mx, my, false, false);
    game.update(1 / 60);
  }
};

test('掠影：从怪旁边擦过去算数——计数、热度、那口灯油', async (t) => {
  const game = await open(t, 'pass');
  // 怪在路线旁边 44px：接触距离是 27，掠影带宽 32 → 44 落在带子里，不会挨打
  statue(game, 70, -44);
  game.player.oil = 0.5;
  const oilBefore = game.player.oil;

  run(game, 60, 1, 0); // 往右跑 1 秒，从它旁边过去

  assert.equal(game.grazeCount, 1, '擦过去应该记一次掠影');
  assert.ok(game.player.heat > 0, `热度应该涨（实际 ${game.player.heat}）`);
  assert.ok(game.player.oil > oilBefore - 0.018, '那口灯油应该顶掉这一秒的基础衰减');
  assert.equal(game.player.hp, 1e6, '擦过去不该挨打');
  assert.ok((game.save.tips ?? []).includes('verb:graze'), '第一次掠影应该弹那张说明卡');
  assert.ok(game.ui.statsBlock().includes('掠影'), '结算面板里应该看得到掠影次数');

  // 说明卡只弹一次：再擦一次不该重复写进存档
  const tips = game.save.tips.length;
  game.player.x = -60;
  game.player.y = 0;
  game.grazeCount = 0;
  run(game, 90, 1, 0);
  assert.ok(game.grazeCount >= 1, '第二次擦过去照样算数');
  assert.equal(game.save.tips.length, tips, '同一张说明卡只该弹一次');
});

test('掠影：站着不动不算，被围住也不会自己涨', async (t) => {
  const game = await open(t, 'still');
  statue(game, 120, 0, 'shade', 68); // 让它自己走过来
  run(game, 120, 0, 0);
  assert.equal(game.grazeCount, 0, '没动就不该有掠影');
  assert.equal(game.player.heat, 0, '没动热度就该是 0');
  assert.ok(game.player.hp < 1e6, '（它确实贴上来了，所以"没涨"不是因为没靠近）');
});

test('掠影：同一只怪 0.55 秒才记一次（不然待在带子里就是每秒 60 次）', async (t) => {
  const game = await open(t, 'cd');
  statue(game, 0, -44);
  const at = [];
  let last = 0;
  for (let i = 0; i < 150; i += 1) {
    const dir = Math.cos(i / 8) > 0 ? 1 : -1;
    game.setInput(dir, 0, false, false);
    game.update(1 / 60);
    if (game.grazeCount > last) {
      at.push(i);
      last = game.grazeCount;
    }
  }
  assert.ok(at.length >= 3, `两秒半待在带子里该记好几次（实际 ${at.length}）`);
  for (let i = 1; i < at.length; i += 1) {
    const gap = (at[i] - at[i - 1]) / 60;
    assert.ok(gap >= 0.54, `两次记账之间至少 0.55 秒（实测间隔 ${gap.toFixed(2)} 秒）`);
  }
});

test('掠影：黏着不算——同一只怪贴久了贡献一路归零', async (t) => {
  const game = await open(t, 'hold');
  const e = statue(game, 0, -44);
  // 把玩家钉在带子里（离圆心 44px）不动窝：位置每帧按回去，速度照给（掠影要求"在动"）
  const hold = (frames) => {
    const from = game.player.heat;
    for (let i = 0; i < frames; i += 1) {
      game.setInput(1, 0, false, false);
      game.update(1 / 60);
      game.player.x = e.x;
      game.player.y = e.y + 44;
    }
    return game.player.heat - from;
  };
  const first = hold(180); // 头三秒
  const second = hold(180); // 再三秒
  assert.ok(first > 0, '刚开始贴着是有热度的');
  assert.ok(
    second < first * 0.5,
    `贴久了以后涨得该明显变慢（前三秒 +${first.toFixed(1)}，后三秒 +${second.toFixed(1)}）`,
  );
});

test('灯焰高涨：攒满点着，加成与代价都生效，烧完只留一半', async (t) => {
  const game = await open(t, 'blaze');
  const p = game.player;
  statue(game, 0, -44);

  // 先把"平时"的两个数取下来（两次都把油量按回 1，免得灯油自然衰减混进来）
  p.blazeTimer = 0;
  p.oil = 1;
  game.update(1 / 60);
  const dmg0 = p.damageScale;
  const light0 = p.lightRadius;

  p.oil = 1;
  p.heat = 27.9;
  run(game, 12, 1, 0);

  assert.ok(p.blazing, '攒满应该当场点着');
  assert.equal(p.blazeCount, 1, '记一次');
  assert.ok(p.heat < 8, `点着那一刻热度从头开始（实际 ${p.heat.toFixed(1)}）`);
  assert.ok(
    Math.abs(p.lightRadius / (light0 * (p.oilFrac || 1)) - 1.3) < 0.05,
    `灯火半径该是平时的 1.3 倍（实际 ×${(p.lightRadius / light0).toFixed(3)}）`,
  );
  assert.ok(
    Math.abs(p.damageScale / dmg0 - 1.25) < 0.05,
    `伤害应该 +25%（实际 ×${(p.damageScale / dmg0).toFixed(3)}）`,
  );

  // 油耗：烧着的时候要多烧三成
  const drain = () => {
    p.oil = 1;
    const before = p.oil;
    for (let i = 0; i < 60; i += 1) {
      p.heat = 20;
      game.update(1 / 60);
    }
    return before - p.oil;
  };
  p.blazeTimer = 5;
  const hot = drain();
  p.blazeTimer = 0;
  const cold = drain();
  assert.ok(hot > cold * 1.2, `灯焰高涨期间油耗该明显更多（${hot.toFixed(4)} vs ${cold.toFixed(4)}）`);

  // 烧完：热度最多留一半，不会一发接一发
  p.heat = 27;
  p.blazeTimer = 0.01;
  game.update(1 / 60);
  assert.equal(p.blazing, false, '时间到就熄灭');
  assert.ok(p.heat <= 14.1, `烧完最多留一半热度（实际 ${p.heat.toFixed(1)}）`);
});

test('掠影：冲刺从弹幕正中穿过去——不挨打，而且算一次双倍的', async (t) => {
  // ① 不冲刺：正面撞上，掉血、不算掠影
  const plain = await open(t, 'bullet');
  const bullet = (g, x, y) =>
    g.projectiles.spawn({ x, y, vx: 0, vy: 0, damage: 12, fromPlayer: false, radius: 5, color: '#c9a3ff' });
  bullet(plain, 70, 0);
  run(plain, 40, 1, 0);
  assert.ok(plain.player.hp < 1e6, '不冲刺就会被打中');
  // 撞上之前会从带子里路过，那一下只值"路过"的那点热度——挨打本身不算掠影
  assert.ok(plain.player.heat < 8, `挨打那一下不该给那一大笔（实际 ${plain.player.heat.toFixed(1)}）`);

  // ② 冲刺穿过去：不挨打，热度按 GRAZE.heatDash 给
  const dashed = await open(t, 'dash');
  bullet(dashed, 70, 0);
  let heat = 0;
  for (let i = 0; i < 20; i += 1) {
    dashed.setInput(1, 0, i === 0, false);
    const before = dashed.player.heat;
    dashed.update(1 / 60);
    heat += dashed.player.heat - before;
  }
  assert.equal(dashed.grazeCount, 1, '穿过去应该记一次掠影');
  assert.equal(dashed.player.hp, 1e6, '无敌帧里穿过去不该挨打');
  assert.ok(heat > 8, `那一下该给一笔明显的热度（实际 ${heat.toFixed(1)}）`);
});

test('掠影：60 次解锁成就「影中行」', async (t) => {
  const game = await open(t, 'ach');
  assert.equal(game.save.achievements.includes('graze60'), false, '开局不该有这个成就');
  game.grazeCount = 59;
  statue(game, 0, -44);
  run(game, 30, 1, 0);
  assert.ok(game.grazeCount >= 60, `该凑够 60 次（实际 ${game.grazeCount}）`);
  assert.ok(game.save.achievements.includes('graze60'), '掠影 60 次应该解锁「影中行」');
});
