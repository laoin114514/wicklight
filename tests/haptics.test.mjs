/**
 * 战斗触感：受伤 / 濒死 / 升级 / 死亡各一种节奏，而且各自限流。
 * 手机上两只拇指都压在屏幕上，血条长在视野角上——手是唯一空着的反馈通道，
 * 所以这几种节奏不能搞混、也不能被围殴时震成按摩棒。
 * （测试里把环境装成"掌上设备"：触点数 > 0 且视口够小，否则整段是空转。）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const BURST = [26, 70, 26, 70, 26];

test('触感节奏：受伤有节流、濒死只响一次、升级和受伤分得开', async (t) => {
  const env = installDomStubs();
  const vibes = [];
  globalThis.window.innerWidth = 900;
  globalThis.window.innerHeight = 390;
  globalThis.navigator.maxTouchPoints = 5;
  globalThis.navigator.vibrate = (p) => {
    vibes.push(p);
    return true;
  };

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1000;
  game.player.hp = 1000;
  const tick = (frames = 1) => {
    for (let i = 0; i < frames; i += 1) game.update(1 / 60);
  };

  // ── 受伤：12ms 一下 ──
  game.damagePlayer(10);
  assert.deepEqual(vibes, [12], `挨打要震一下（${JSON.stringify(vibes)}）`);

  // 节流单独测：真实伤害之间隔着 0.65 秒无敌帧，压根走不到这里，但同一帧里
  // 好几个来源（接触伤害 + 地刺 + 雷弧）都会调它，不能各震一下。
  game.haptics.hurt();
  assert.deepEqual(vibes, [12], '220ms 以内的第二下不重复震（无敌帧之外还有一层）');
  tick(20); // 约 0.33 秒（前几帧还在 hitStop 里，节流计时不走）
  game.haptics.hurt();
  assert.deepEqual(vibes, [12, 12], '过了节流窗口，下一次照样震');

  // ── 濒死：跌破 25% 来一段"心跳"，一直低血不会反复震，回血再掉才重新响 ──
  game.player.hp = 200;
  tick(2);
  assert.deepEqual(vibes.slice(2), [BURST], `跌破 25% 要有心跳（${JSON.stringify(vibes.slice(2))}）`);
  tick(120);
  assert.equal(vibes.length, 3, '一直趴在低血上不会反复震');
  game.player.hp = 500;
  tick(2);
  game.player.hp = 150;
  tick(2);
  assert.equal(vibes.length, 4, '回血之后再次跌破才重新武装');
  assert.deepEqual(vibes[3], BURST);

  // ── 升级：和受伤分开的节奏（18-50-18） ──
  game.player.hp = 1000;
  const before = vibes.length;
  game.gainXp(game.xpToNext);
  assert.equal(game.state, 'levelup', '测试前提：攒够经验会弹出升级面板');
  assert.deepEqual(vibes.slice(before), [[18, 50, 18]], `升级要有一套自己的节奏（${JSON.stringify(vibes.slice(before))}）`);

  // ── 伏灯：踩响是一套自己的节奏，而且一串连爆只震头一下 ──
  const beforeMine = vibes.length;
  game.haptics.mine();
  assert.deepEqual(vibes.slice(beforeMine), [[8, 26, 8]], '伏灯踩响是 8-26-8：「你自己埋的东西生效了」，不是挨了一下');
  game.haptics.mine();
  assert.equal(vibes.length, beforeMine + 1, '连爆的第二节（隔 0.09 秒）不重复震——一串雷不能震成按摩棒');
  // 升级面板还挂着，整局是暂停的（节流计时也不走）——先把面板收起来再往下走时间
  game.state = 'playing';
  tick(25);
  game.haptics.mine();
  assert.equal(vibes.length, beforeMine + 2, '过了窗口，下一串照样震');

  // ── 死亡：长震一下 ──
  game.player.hp = 5;
  game.player.invuln = 0;
  game.damagePlayer(999);
  assert.equal(game.state, 'dead', '测试前提：伤害致死');
  assert.equal(vibes[vibes.length - 1], 160, `死亡要长震（${vibes[vibes.length - 1]}）`);

  // ── 设置里关掉震动：一次都不该再响 ──
  game.settings.data.vibrate = false;
  const n = vibes.length;
  game.newRun('warden', 'normal', false);
  game.player.hp = 100;
  game.player.invuln = 0;
  game.damagePlayer(10);
  tick(2);
  assert.equal(vibes.length, n, '关掉震动之后一次都不该响');
});
