/**
 * 烈焰鞭 / 龙息的弧刃也停在墙面上（v96）。
 *
 * v88 把火环与燎灯接上了墙，v89 的文档又把"鞭"列进了会停在墙面上的攻击，
 * 可 `Player.fireWeapon` 的 `whip` 分支一直只算距离和夹角：墙后那只既挨伤害、也被点着。
 * 这一条用真实主循环把普通鞭与进化形态的墙前 / 墙后各跑一遍。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=whipwall-${tag}-${Date.now()}-${Math.random()}`);
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
  p.stats.critChance = 0;
  p.weapons.clear();
  return { game, p };
}

/** 让只有这一把鞭的玩家站桩打 1.5 秒；返回靶子掉了多少血。 */
function swing(game, p, weapon, walls) {
  game.level.walls.length = 0;
  for (const w of walls) game.level.walls.push(w);
  game.enemies.clear();
  game.projectiles.clear();
  p.cooldowns.clear();
  p.weapons.clear();
  p.weapons.set(weapon, 5);
  p.angle = 0;
  const foe = game.enemies.spawn('bulwark', p.x + 120, p.y, 1, 1);
  foe.hp = 1e9;
  foe.maxHp = 1e9;
  foe.speed = 0;
  foe.spawnTimer = 0;
  foe.damage = 0;
  for (let i = 0; i < 90; i += 1) game.update(1 / 60);
  return 1e9 - foe.hp;
}

test('烈焰鞭：墙前照旧挥得到，墙后一下都不该挨', async (t) => {
  const { game, p } = await open(t, 'whip');
  const openHit = swing(game, p, 'whip', []);
  const wallHit = swing(game, p, 'whip', [{ x: p.x + 55, y: p.y - 80, w: 30, h: 160 }]);
  assert.ok(openHit > 0, `没有墙时这一鞭要真的打到（${openHit}）`);
  assert.equal(wallHit, 0, `墙后的靶子一下都不该挨（${wallHit}）`);
});

test('龙息（进化）走同一条规矩', async (t) => {
  const { game, p } = await open(t, 'dragon');
  const openHit = swing(game, p, 'whip_dragonbreath', []);
  const wallHit = swing(game, p, 'whip_dragonbreath', [{ x: p.x + 55, y: p.y - 80, w: 30, h: 160 }]);
  assert.ok(openHit > 0, `没有墙时龙息要真的打到（${openHit}）`);
  assert.equal(wallHit, 0, `龙息也不该穿过墙面（${wallHit}）`);
});
