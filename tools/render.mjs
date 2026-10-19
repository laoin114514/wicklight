/**
 * 无头画面渲染器：在没有浏览器的沙箱里把真实游戏渲染成 PNG，
 * 用于人眼检查画面效果（相当于手动开浏览器看一眼）。
 *
 * 模拟只跑 update（不渲染），最后只渲染少数几帧，因此速度可以接受。
 * 用法: node tools/render.mjs --scene play --out /tmp/wl/play.png [--ss 2] [--crop x,y,w,h --zoom N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { installDomStubs } from '../tests/dom-stubs.mjs';
import { SoftCanvas, canvasToPNG, cropToPNG } from './softcanvas.mjs';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const SS = parseInt(arg('ss', '2'), 10);
const ENTRY = new URL('../dist/app.js', import.meta.url);
const OUTDIR = arg('outdir', '/tmp/wl');
const OUT = arg('out', null);

const env = installDomStubs({
  canvasClass: class extends SoftCanvas {
    constructor() {
      super(300, 150, SS);
    }
  },
});
globalThis.devicePixelRatio = 1;

const errors = [];
const origError = console.error;
console.error = (...a) => errors.push(a.map(String).join(' '));

await import(`${ENTRY.href}?t=${Date.now()}`);
const handle = globalThis.window.__WICKLIGHT__;
const game = handle.game;
const STAGES = handle.catalog.stages;
const hud = handle.hud;
handle.loop.stop();
for (let i = 0; i < 8; i += 1) env.frame();
game.bootDone();

const RNG = (() => {
  let s = 1234567;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
})();

/** 只推进模拟，不渲染。 */
function step(dt = 1 / 60) {
  game.update(dt);
  hud.update(dt);
  hud.setVisible(game.state === 'playing' || game.state === 'levelup' || game.state === 'paused');
  if (game.state === 'levelup') game.chooseUpgrade(game.currentOffers[0]);
}

function fight(frames, { spawnEvery = 26, spawnCount = 2, rng = RNG, pool } = {}) {
  const ids = pool ?? ['shade', 'crawler', 'spitter', 'moth', 'bomber', 'oilsapper', 'bulwark', 'splinter'];
  for (let f = 0; f < frames; f += 1) {
    if (f % spawnEvery === 0) {
      for (let k = 0; k < spawnCount; k += 1) {
        const a = rng() * Math.PI * 2;
        const d = 170 + rng() * 240;
        game.enemies.spawn(ids[(rng() * ids.length) | 0], game.player.x + Math.cos(a) * d, game.player.y + Math.sin(a) * d, 1 + f * 0.004, 1);
      }
    }
    if (f % 37 === 0) {
      game.player.x += (rng() - 0.5) * 70;
      game.player.y += (rng() - 0.5) * 70;
    }
    step();
  }
}

const SCENES = {
  menu() {
    game.state = 'menu';
  },
  play() {
    game.newRun('warden', 'normal', false);
    fight(420);
  },
  stage2() {
    game.newRun('warden', 'normal', false);
    game.loadStage(STAGES[1], 1, false);
    fight(460);
  },
  // 灯影（v94）：固定的一间靶房，只看"光停在墙的哪一面"。
  // 两堵竖墙在左侧留一道缝，右上方留一只可见的靶、墙后放一只看不见的靶。
  wallshadow() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
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
    game.hazards.length = 0;
    game.grounds.length = 0;
    game.level.walls.length = 0;
    game.level.walls.push(
      { x: -230, y: -300, w: 86, h: 250 },
      { x: -230, y: 60, w: 86, h: 250 },
    );
    const p = game.player;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    const visible = game.enemies.spawn('bulwark', -120, -130, 1, 0);
    const hidden = game.enemies.spawn('bulwark', -470, -40, 1, 0);
    for (const e of [visible, hidden]) {
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.damage = 0;
      e.speed = 0;
    }
    for (let i = 0; i < 4; i += 1) step();
  },
  lantern() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
    game.xpToNext = 1e9;
    for (let i = 0; i < 40; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.pickups.clear();
    game.hazards.length = 0;
    game.particles.clear();
    const p = game.player;
    p.weapons.clear();
    p.recomputeStats();
    p.hp = p.stats.maxHp;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    const target = game.enemies.spawn('shade', 340, 0, 1, 0);
    target.hp = 1e9;
    target.maxHp = 1e9;
    target.damage = 0;
    target.speed = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    for (let i = 0; i < 3; i += 1) step();
  },
  swarm() {
    game.newRun('ember', 'normal', false);
    fight(900, { spawnEvery: 7, spawnCount: 4 });
  },
  boss1() {
    game.newRun('warden', 'normal', false);
    fight(240);
    game.enemies.clear();
    const b = game.enemies.spawn('thornlord', 190, 0, 1, 1);
    b.hp = b.maxHp * 0.62;
    b.bossCd = 0.5;
    fight(70, { spawnEvery: 400 });
  },
  boss2() {
    game.newRun('warden', 'normal', false);
    game.stageIndex = 1;
    game.loadStage(game.currentStage(), 1, false);
    game.enemies.clear();
    const b = game.enemies.spawn('extinguisher', 220, 0, 1, 1);
    b.hp = b.maxHp * 0.55;
    fight(110, { spawnEvery: 400 });
  },
  boss3() {
    game.newRun('warden', 'normal', false);
    game.stageIndex = 2;
    game.loadStage(game.currentStage(), 2, false);
    game.enemies.clear();
    const b = game.enemies.spawn('emberwake', 240, 0, 1, 1);
    b.hp = b.maxHp * 0.4;
    b.bossCd = 0.35;
    fight(130, { spawnEvery: 400 });
  },
  stage3() {
    game.newRun('warden', 'normal', false);
    game.loadStage(STAGES[2], 2, false);
    fight(520);
  },
  boss4() {
    game.newRun('warden', 'normal', false);
    game.loadStage(STAGES[3], 3, false);
    game.enemies.clear();
    const b = game.enemies.spawn('nightfall', 230, -20, 1, 1);
    b.hp = b.maxHp * 0.28; // 压到第三相位：环形弹幕 + 召唤回响 + 脚下结雾
    b.bossCd = 0.35;
    fight(120, { spawnEvery: 400 });
  },
  bosstelegraph() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
    game.xpToNext = 1e9;
    for (let i = 0; i < 40; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.pickups.clear();
    game.hazards.length = 0;
    game.particles.clear();
    const p = game.player;
    p.hp = 1e9;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    for (const [id, x, y, cd] of [
      ['thornlord', -210, -108, 0.24],
      ['extinguisher', 208, -112, 0.31],
      ['emberwake', -196, 132, 0.37],
      ['nightfall', 206, 134, 0.43],
    ]) {
      const b = game.enemies.spawn(id, x, y, 1, 0);
      b.hp = b.maxHp * 0.55;
      b.speed = 0;
      b.damage = 0;
      b.bossCd = cd;
    }
  },
  stage4() {
    game.newRun('warden', 'normal', false);
    game.loadStage(STAGES[3], 3, false);
    // 长夜之城难度最高，人肉看画面时把血油顶住，免得半路躺下变成死亡红幕
    for (let i = 0; i < 5; i += 1) {
      fight(90);
      game.player.hp = game.player.stats.maxHp;
      game.player.oil = game.player.oilMax;
    }
  },
  elite() {
    game.newRun('warden', 'normal', false);
    fight(200);
    game.enemies.clear();
    const a = game.enemies.spawn('wickmother', 170, 40, 1, 1);
    const b = game.enemies.spawn('darkless', -180, -60, 1, 1);
    // 词缀纹章（v128）：给两只精英各挂一条，截图里能同时看到暖金精英光与冷色词缀环
    a.affix = 'warded';
    b.affix = 'haste';
    fight(60, { spawnEvery: 30, spawnCount: 1 });
  },
  lowhp() {
    game.newRun('warden', 'normal', false);
    fight(300);
    game.player.hp = game.player.stats.maxHp * 0.2;
    fight(24, { spawnEvery: 300 });
  },
  arc() {
    game.newRun('warden', 'normal', false);
    game.player.weapons.clear();
    game.player.levelWeapon('arc');
    game.player.levelWeapon('arc');
    game.player.levelWeapon('arc');
    game.player.levelWeapon('arc');
    game.player.recomputeStats();
    game.enemies.clear();
    for (let i = 0; i < 9; i += 1) {
      game.enemies.spawn('shade', game.player.x + 110 + i * 62, game.player.y + (i % 3 - 1) * 46, 6, 1);
    }
    game.enemies.spawn('bulwark', game.player.x + 380, game.player.y, 6, 1);
    game.player.stats.cooldownMult = 0.35;
    fight(70, { spawnEvery: 400 });
    // 立刻再放一道电弧，保证截图里能看到闪电
    game.chainZap(game.player.x, game.player.y, 20, 5, 460, '#8ff0ff', {});
  },
  beam() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.player.weapons.clear();
    game.player.weapons.set('beam', 3);
    game.player.recomputeStats();
    game.player.stats.cooldownMult = 0.35;
    for (const d of [110, 200, 290, 380]) {
      game.enemies.spawn('shade', game.player.x + d, game.player.y - 8, 26, 1);
    }
    game.enemies.spawn('bulwark', game.player.x + 450, game.player.y, 8, 1);
    fight(26, { spawnEvery: 400 });
    // 收尾再放一道，保证截图里正亮着
    game.fireBeam(game.player.x, game.player.y, 0, game.player.stats.areaMult * 430, 15, 30, '#fff3c4', { knockback: 120 });
    for (let i = 0; i < 2; i += 1) step();
  },
  blade() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.player.weapons.clear();
    game.player.weapons.set('boomerang', 1);
    game.player.recomputeStats();
    game.player.stats.cooldownMult = 1;
    for (const [d, dy] of [[150, 0], [255, 30], [350, -20]]) {
      game.enemies.spawn('shade', game.player.x + d, game.player.y + dy, 30, 1);
    }
    // 只掷一轮，抓"刃在半路"的那一帧
    game.player.cooldowns.set('boomerang', 0);
    game.player.update(1 / 60, { moveX: 0, moveY: 0, dash: false, nova: false }, game.playerCtx());
    for (let i = 0; i < 16; i += 1) step();
  },
  pyres() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 60; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    const [a, b] = game.level.pyres;
    // 一座正在点燃（半途的进度环）、一座已经长明、剩下的留在远处给屏幕边缘的箭头
    game.player.x = a.x - 46;
    game.player.y = a.y + 24;
    b.x = game.player.x + 250;
    b.y = game.player.y - 78;
    b.lit = true;
    b.flame = 1;
    game.pyresLit = 1;
    for (let i = 0; i < 40; i += 1) step();
    for (let i = 0; i < 4; i += 1) {
      const ang = (i / 4) * Math.PI * 2;
      game.enemies.spawn('shade', game.player.x + Math.cos(ang) * 150, game.player.y + Math.sin(ang) * 130, 3, 1);
    }
    for (let i = 0; i < 3; i += 1) step();
  },
  snuffer() {
    // 点亮的灯台被吹灯客围着抽灯焰：火已经小下去，看得出来这座快守不住了
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 60; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    const a = game.level.pyres[0];
    a.x = game.player.x + 190;
    a.y = game.player.y - 40;
    a.lit = true;
    a.flame = 0.34;
    game.pyresLit = 1;
    for (let i = 0; i < 3; i += 1) {
      const ang = (i / 3) * Math.PI * 2 - 0.6;
      const s = game.enemies.spawn('snuffer', a.x + Math.cos(ang) * 46, a.y + Math.sin(ang) * 40, 3, 1);
      s.vx = 0;
      s.vy = 0;
    }
    for (let i = 0; i < 2; i += 1) step();
  },
  shrine() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    const s = game.level.shrines[0];
    s.x = game.player.x + 96;
    s.y = game.player.y - 12;
    game.player.angle = 0.2;
    game.player.hp = game.player.stats.maxHp * 0.75;
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.enemies.spawn('crawler', game.player.x - 150, game.player.y + 90, 3, 1);
    for (let i = 0; i < 3; i += 1) step();
  },
  splinter() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    game.player.angle = -0.4;
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      game.enemies.spawn('splinter', game.player.x + Math.cos(a) * 130, game.player.y + Math.sin(a) * 110, 4, 1);
    }
    game.enemies.spawn('bulwark', game.player.x + 250, game.player.y - 60, 6, 1);
    for (let i = 0; i < 3; i += 1) step();
  },
  lancer() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      const e = game.enemies.spawn('lancer', game.player.x + Math.cos(a) * 170, game.player.y + Math.sin(a) * 150, 4, 1);
      e.attackCd = 0;
    }
    fight(30, { spawnEvery: 400 });
  },
  beacon() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.enemies.spawn('beacon', game.player.x + 120, game.player.y - 40, 5, 1);
    game.enemies.spawn('beacon', game.player.x - 150, game.player.y + 90, 5, 1);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      game.enemies.spawn('shade', game.player.x + Math.cos(a) * 150, game.player.y + Math.sin(a) * 130, 5, 1);
    }
    fight(24, { spawnEvery: 400 });
  },
  echo() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      game.enemies.spawn('echo', game.player.x + Math.cos(a) * 190, game.player.y + Math.sin(a) * 160, 5, 1);
    }
    game.enemies.spawn('skitter', game.player.x + 240, game.player.y + 120, 5, 1);
    game.enemies.spawn('skitter', game.player.x - 230, game.player.y - 130, 5, 1);
    fight(30, { spawnEvery: 400 });
  },
  weaver() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    for (const [dx, dy] of [[190, -60], [-200, 90], [40, -190]]) {
      const e = game.enemies.spawn('weaver', game.player.x + dx, game.player.y + dy, 6, 1);
      e.attackCd = 0;
    }
    fight(40, { spawnEvery: 400 });
  },
  siphon() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.enemies.spawn('siphon', game.player.x + 260, game.player.y - 40, 1, 1);
    game.enemies.spawn('siphon', game.player.x - 250, game.player.y + 60, 1, 1);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      game.enemies.spawn('shade', game.player.x + Math.cos(a) * 150, game.player.y + Math.sin(a) * 130, 5, 1);
    }
    fight(24, { spawnEvery: 400 });
  },
  // 噬灯魅的抽油线（v98）：右边那只隔着墙，线必须停在墙面；左边那只没有遮挡，线照旧连到玩家。
  siphonwall() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
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
    game.hazards.length = 0;
    game.grounds.length = 0;
    game.level.walls.length = 0;
    game.level.walls.push({ x: 70, y: -300, w: 60, h: 600 });
    const p = game.player;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    for (const [x, y] of [[300, -60], [-280, 70]]) {
      const e = game.enemies.spawn('siphon', x, y, 1, 0);
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.damage = 0;
      e.spawnTimer = 0;
      e.hitFlash = 0;
    }
    for (let i = 0; i < 4; i += 1) step();
  },
  // 旋灯撞墙（v116）：固定一间靶房，只看灯心、可见光圈和接触点火星停在墙的哪一面。
  // 灯心应停在墙面左侧 18px；右侧那只只负责说明"墙后还有目标"，不该被吸过来。
  vortexwall() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
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
    game.hazards.length = 0;
    game.grounds.length = 0;
    game.level.walls.length = 0;
    game.level.walls.push({ x: 150, y: -300, w: 60, h: 600 });
    const p = game.player;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    const behind = game.enemies.spawn('shade', 280, 0, 1, 0);
    behind.hp = 1e6;
    behind.maxHp = 1e6;
    behind.damage = 0;
    behind.speed = 0;
    game.placeVortexFrom(0, 0, 320, 0, 28, 200, 0, 0, 'vortex');
    for (let i = 0; i < 4; i += 1) step();
  },
  solo() {
    game.newRun('warden', 'normal', false);
    // 先跑够帧数让转场黑幕完全淡出，再清场，得到"静态肖像"式画面
    for (let i = 0; i < 80; i += 1) step();
    game.enemies.clear();
    game.pickups.clear();
    game.projectiles.clear();
    game.hazards.length = 0;
    game.player.angle = -0.5;
    game.player.hp = game.player.stats.maxHp;
    for (let i = 0; i < 3; i += 1) step();
  },
  bomber() {
    game.newRun('warden', 'normal', false);
    game.enemies.clear();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const b = game.enemies.spawn('bomber', game.player.x + Math.cos(a) * 105, game.player.y + Math.sin(a) * 105, 1, 1);
      b.stateTimer = 0.85;
    }
    fight(26, { spawnEvery: 400 });
  },
  dead() {
    game.newRun('warden', 'normal', false);
    fight(300);
    game.player.revives = 0;
    game.player.hp = -1;
    step();
  },
  endless() {
    game.save.best = 3;
    game.newRun('warden', 'normal', true);
    fight(600);
  },
  // 燎灯（v73）：灯光本身在烧。这一屏是给**那一圈**看的——它不发射任何东西，
  // 所以"它开火了"只剩这一圈冲击波（Player 里那一行 `particles.shockwave`）。
  // 先跑一段真的战斗（相机 / 光照 / 地面都落到位），再把武器位换成单独的燎灯、
  // 摆一圈 10 只打不死的靶在光里（外加一只在灯外，它永远不挨打），
  // 最后手动放一圈冲击波、把它往前推几帧——于是这一帧正好是"烫到一半"的样子。
  // ⚠ 这里一律走 `step()`（只推进模拟），不走 `env.frame()`：后者会跑真实的 rAF 循环，
  //    而那一套在体检场景里会把局面带到别的地方去（人死了 / 回了菜单）。
  aura() {
    game.newRun('warden', 'normal', false);
    fight(420);
    const p = game.player;
    p.weapons.clear();
    p.weapons.set('aura', 5);
    p.recomputeStats();
    game.enemies.clear();
    game.projectiles.clear();
    // 这一屏是给"那一圈"看的：别再刷波、别再弹升级面板，也别让人物在镜头前躺下
    p.hp = p.stats.maxHp;
    p.oil = p.oilMax;
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
    game.xpToNext = 1e9;
    step();
    const R = p.lightRadius;
    const es = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      es.push(game.enemies.spawn('shade', p.x + Math.cos(a) * R * 0.82, p.y + Math.sin(a) * R * 0.82, 1, 0));
    }
    es.push(game.enemies.spawn('shade', p.x + R * 1.35, p.y, 1, 0));
    for (const e of es) {
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.damage = 0; // 不咬人：这一屏量的是"那一圈"，不是挨打
      e.speed = 0;
      e.spawnTimer = 0;
    }
    p.hp = p.stats.maxHp;
    step();
    p.auraCd = 1e9; // 不再有新的脉冲把这一拍顶掉
    game.particles.clear();
    game.particles.shockwave(p.x, p.y, '#ffd08a', R, 0.3);
    for (let i = 0; i < 5; i += 1) game.particles.update(1 / 60); // 推到半路（后面的 4 帧还会再推一点）
  },
  // 战斗特效与拾取物：给爆炸、烟尘、碎屑和五类掉落一个固定机位，方便逐版对照。
  fx() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
    game.xpToNext = 1e9;
    for (let i = 0; i < 50; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.pickups.clear();
    game.hazards.length = 0;
    game.grounds.length = 0;
    game.particles.clear();
    const p = game.player;
    p.hp = p.stats.maxHp;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    for (const [dx, dy, kind] of [
      [-112, -58, 'xp'],
      [-52, -82, 'gold'],
      [22, -102, 'oil'],
      [94, -64, 'heart'],
      [136, 26, 'chest'],
    ]) {
      const item = game.pickups.spawn(dx, dy, kind, 1);
      item.vx = 0;
      item.vy = 0;
    }
    game.blast(176, -18, 118, 1, { ring: '#ff9d2e', spark: '#ffd9a0', sparkCount: 24 });
    for (let i = 0; i < 7; i += 1) step();
  },
  // 险境预警（v123）：三种落点预警同屏，分别停在外圈、中段与压线三拍。
  hazardfx() {
    game.newRun('warden', 'normal', false);
    game.director.introTimer = 1e9;
    game.director.hazardTimer = 1e9;
    game.xpToNext = 1e9;
    for (let i = 0; i < 50; i += 1) step();
    game.enemies.clear();
    game.projectiles.clear();
    game.pickups.clear();
    game.hazards.length = 0;
    game.grounds.length = 0;
    game.particles.clear();
    const p = game.player;
    p.hp = p.stats.maxHp;
    p.oil = p.oilMax;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    game.camera.x = 0;
    game.camera.y = 0;
    game.hazards.push(
      { kind: 'meteor', timer: 1.16, x: -164, y: -38, r: 96 },
      { kind: 'collapse', timer: 0.72, x: 142, y: -54, r: 120 },
      { kind: 'thorn', timer: 0.34, x: 12, y: 136, r: 54 },
    );
  },
};

const scene = arg('scene', 'play');
if (!SCENES[scene]) {
  origError(`未知场景: ${scene}（可选 ${Object.keys(SCENES).join(', ')}）`);
  process.exit(1);
}
SCENES[scene]();

const forcedDarkness = arg('darkness', null);
if (forcedDarkness !== null) {
  const v = parseFloat(forcedDarkness);
  game.light.setDarkness = function setDarkness() {
    this.darkness = v;
  };
}

for (let i = 0; i < 4; i += 1) step();
game.render();

const canvas = globalThis.document.getElementById('game');
const crop = arg('crop', null);
let out = OUT ? path.resolve(OUT) : path.join(OUTDIR, `${scene}.png`);
if (crop) {
  const [cx, cy, cw, ch] = crop.split(',').map(Number);
  const zoom = parseFloat(arg('zoom', '3'));
  if (!OUT) out = path.join(OUTDIR, `${scene}-crop.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, cropToPNG(canvas, cx, cy, cw, ch, zoom));
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvasToPNG(canvas));
}

console.error = origError;
console.log(
  JSON.stringify(
    {
      scene,
      out,
      size: `${canvas.width}x${canvas.height}`,
      state: game.state,
      enemies: game.enemies.count,
      projectiles: game.projectiles.all.filter((p) => p.active).length,
      floaters: game.floaters.count,
      kills: game.kills,
      gold: game.gold,
      wave: game.wave,
      errors,
    },
    null,
    2,
  ),
);
