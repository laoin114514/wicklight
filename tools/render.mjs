/**
 * 无头画面渲染器：在没有浏览器的沙箱里把真实游戏渲染成 PNG，
 * 用于人眼检查画面效果（相当于手动开浏览器看一眼）。
 *
 * 模拟只跑 update（不渲染），最后只渲染少数几帧，因此速度可以接受。
 * 用法: node tools/render.mjs --scene play --out /tmp/wl/play.png [--ss 2] [--frames 420]
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
    b.attackCd = 0.5;
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
    b.attackCd = 0.35;
    fight(130, { spawnEvery: 400 });
  },
  stage3() {
    game.newRun('warden', 'normal', false);
    game.loadStage(game.director.stageDef, 2, false);
    fight(520);
  },
  elite() {
    game.newRun('warden', 'normal', false);
    fight(200);
    game.enemies.clear();
    game.enemies.spawn('wickmother', 170, 40, 1, 1);
    game.enemies.spawn('darkless', -180, -60, 1, 1);
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
fs.mkdirSync(OUTDIR, { recursive: true });
const crop = arg('crop', null);
let out = path.join(OUTDIR, `${scene}.png`);
if (crop) {
  const [cx, cy, cw, ch] = crop.split(',').map(Number);
  const zoom = parseFloat(arg('zoom', '3'));
  out = path.join(OUTDIR, `${scene}-crop.png`);
  fs.writeFileSync(out, cropToPNG(canvas, cx, cy, cw, ch, zoom));
} else {
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
