/**
 * 「灯火也停在墙面上」（v94）回归测试。
 *
 * v88 把伤害接上了墙，但光照贴图还在穿墙：站在墙前面仍能照亮墙后一整圈，
 * 玩家看到的"光"和真正能打到的"光"是两张地图。这一版给点光源算一份可见多边形，
 * 用裁剪把墙后的暗幕留住。
 *
 * 无头环境的 `clip` 是空操作，画不出像素差；所以这里分两层钉：
 *   · 纯几何 `visibilityPolygon`：没有墙 = 整块屏幕；墙后那一点不在多边形里；
 *     近侧与绕过墙角的方向仍在；两块墙之间的缝保留；光源在屏幕外也照样挡；
 *   · 渲染接入：墙靠近灯芯时 `lastShadowedCount` 真的涨起来，把墙移走又回到 0。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';
import { SoftCanvas } from '../tools/softcanvas.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const W = 640;
const H = 360;

function area(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** 标准射线法。边界点不保证稳定，所以用例只问明显在里面 / 外面的点。 */
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=lightwalls-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop } = handle;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  return { handle, game, env };
}

async function openSoft(t, tag) {
  const env = installDomStubs({
    canvasClass: class extends SoftCanvas {
      constructor() {
        super(300, 150, 1);
      }
    },
  });
  await import(`${ENTRY.href}?v=lightwalls-soft-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop } = handle;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  return { handle, game };
}

test('可见多边形：没有墙时就是整块屏幕，四个角都在', async (t) => {
  const { handle } = await open(t, 'open');
  const poly = handle.visibilityPolygon(W / 2, H / 2, [], W, H);
  assert.ok(poly.length >= 3, '没有墙也要返回一圈边界');
  assert.ok(Math.abs(area(poly) - W * H) < 1, `面积应等于屏幕 ${W}×${H}，实际 ${area(poly)}`);
  for (const [x, y] of [
    [1, 1],
    [W - 1, 1],
    [W - 1, H - 1],
    [1, H - 1],
  ]) {
    assert.ok(inside(poly, x, y), `屏幕角 (${x},${y}) 应可见`);
  }
});

test('可见多边形：墙后不可见，墙前与绕过墙角的方向仍可见', async (t) => {
  const { handle } = await open(t, 'wall');
  const wall = { x: 240, y: 130, w: 100, h: 100 };
  const poly = handle.visibilityPolygon(100, 180, [wall], W, H);
  assert.ok(poly.length >= 3, '有墙时仍应有一条可见边界');
  assert.ok(area(poly) < W * H, '墙必须从屏幕面积里吃掉一块');
  assert.ok(inside(poly, 200, 180), '墙前这一点应该照得到');
  assert.ok(!inside(poly, 390, 180), '墙正后方这一点不该被照亮');
  assert.ok(inside(poly, 390, 40), '从上方绕过去的这条路没有被墙切掉');
});

test('可见多边形：两块墙之间的缝保留视线', async (t) => {
  const { handle } = await open(t, 'gap');
  const top = { x: 240, y: 60, w: 80, h: 80 };
  const bottom = { x: 240, y: 220, w: 80, h: 80 };
  const poly = handle.visibilityPolygon(100, 180, [top, bottom], W, H);
  assert.ok(inside(poly, 400, 180), '正对缝隙的那一点应可见');
  assert.ok(!inside(poly, 400, 100), '上块墙后面的那一点应不可见');
  assert.ok(!inside(poly, 400, 260), '下块墙后面的那一点应不可见');
});

test('可见多边形：光源在屏外仍要挡墙 / 退化尺寸不返回多边形', async (t) => {
  const { handle } = await open(t, 'degenerate');
  const openPoly = handle.visibilityPolygon(-120, 180, [], W, H);
  assert.ok(openPoly.length >= 3, '屏外光源没有墙时也该有可见范围');
  for (const [x, y] of [
    [1, 1],
    [W - 1, 1],
    [W - 1, H - 1],
    [1, H - 1],
  ]) {
    assert.ok(inside(openPoly, x, y), `屏外光源照得到屏幕角 (${x},${y})`);
  }
  const wall = { x: 240, y: 130, w: 80, h: 100 };
  const clipped = handle.visibilityPolygon(-120, 180, [wall], W, H);
  assert.ok(!inside(clipped, 400, 180), '光源在屏幕左侧外面时，墙后依然不该亮');
  assert.ok(inside(clipped, 400, 40), '绕过墙上沿的那条视线仍应保留');
  assert.deepEqual(handle.visibilityPolygon(100, 180, [], 0, H), []);
  assert.deepEqual(handle.visibilityPolygon(100, 180, [], W, 0), []);
});

test('可见多边形：屏幕右侧外面的光源不踩 ±π 接缝', async (t) => {
  const { handle } = await open(t, 'seam');
  const wall = { x: 320, y: 130, w: 80, h: 100 };
  const poly = handle.visibilityPolygon(W + 120, 180, [wall], W, H);
  assert.ok(poly.length >= 3, '屏右光源仍应生成可见多边形');
  assert.ok(!inside(poly, 200, 180), '墙正后方不该亮（方向正好落在 atan2 的接缝上）');
  assert.ok(inside(poly, 200, 40), '绕过墙上沿的视线仍应保留');
  assert.ok(inside(poly, 1, 1), '屏幕远角仍在可见范围内');
});

test('可见多边形：墙伸出视口边界时，墙前那一角不能被斜切掉', async (t) => {
  const { handle } = await open(t, 'overhang');
  const wall = { x: 330, y: -20, w: 100, h: 130 };
  const poly = handle.visibilityPolygon(-227, 505, [wall], W, H);
  assert.ok(inside(poly, 316, 13), '墙的上沿在屏幕外时，墙左前方仍应可见');
  assert.ok(inside(poly, 316, 60), '沿墙面往下走也应保持可见');
  assert.ok(!inside(poly, 400, 0), '墙后面仍然不能亮');
});

test('渲染接入：墙靠近灯芯时真的裁，移走之后一刀不裁', async (t) => {
  const { handle, game } = await open(t, 'render');
  handle.loop.stop();
  game.bootDone();
  game.newRun('warden', 'normal', false);
  // 只留玩家内外两盏同芯灯；起手武器那两颗绕身火种各有自己的位置，会把"同芯共用"的账搅浑。
  game.player.weapons.clear();
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
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  game.setInput(0, 0, false, false);
  game.update(1 / 60);
  game.render();
  assert.equal(game.light.lastShadowedCount, 0, '空场上不该进入墙体裁剪');

  game.level.walls.push({ x: game.player.x + 46, y: game.player.y - 100, w: 60, h: 200 });
  game.update(1 / 60);
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  game.render();
  assert.ok(game.light.lastShadowedCount > 0, '墙挨着灯芯时至少有一盏灯要被裁');
  assert.equal(game.light.lastVisibilityLookups, 1, '内外两盏同芯灯只算一次可见多边形');

  game.level.walls.length = 0;
  game.update(1 / 60);
  game.render();
  assert.equal(game.light.lastShadowedCount, 0, '把墙移走之后应完全回到原来的光照路径');
});

test('渲染接入：灯和墙都在屏幕外，墙后的光仍然要停住', async (t) => {
  const { handle, game } = await open(t, 'offscreen-render');
  handle.loop.stop();
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.weapons.clear();
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  game.enemies.clear();
  game.projectiles.clear();
  game.level.walls.length = 0;
  game.camera.zoom = 1;
  game.camera.targetZoom = 1;
  game.setInput(0, 0, false, false);
  game.update(1 / 60);
  const p = game.player;
  // 灯芯投到屏幕左侧外 -120px；墙投在 -70..-20px，整面墙都在屏幕外，但正好挡在灯与屏幕之间。
  game.camera.x = p.x + game.renderer.width / 2 + 120;
  game.camera.y = p.y;
  const screen = game.camera.worldToScreen(p.x, p.y);
  assert.ok(screen.x < -100, `前提：灯芯真的在屏幕外（x=${screen.x.toFixed(1)}）`);
  game.level.walls.push({ x: p.x + 50, y: p.y - 100, w: 50, h: 200 });
  game.render();
  assert.ok(game.light.lastShadowedCount > 0, '屏幕外的墙也得参与屏外灯芯的裁剪');
  assert.equal(game.light.lastVisibilityLookups, 1, '屏外的同芯灯也只算一次');

  game.level.walls.length = 0;
  game.render();
  assert.equal(game.light.lastShadowedCount, 0, '撤掉墙后回到不裁的光照路径');
});

test('像素：屏外灯的光真的停在墙面上，墙上沿照旧亮着', async (t) => {
  const { handle, game } = await openSoft(t, 'pixels');
  handle.loop.stop();
  game.player.weapons.clear();
  const W = 320;
  const H = 180;
  const cam = game.camera;
  cam.resize(W, H);
  cam.x = 0;
  cam.y = 0;
  cam.zoom = 1;
  cam.shakeX = 0;
  cam.shakeY = 0;
  const light = game.light;
  const out = new SoftCanvas(W, H, 1);
  const ctx = out.getContext('2d');
  const lightX = -W / 2 - 80;
  const wall = { x: 100 - W / 2, y: 60 - H / 2, w: 40, h: 60 };
  const lum = (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return d[0] * 0.2126 + d[1] * 0.7152 + d[2] * 0.0722;
  };
  const render = (walls) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    light.begin();
    light.setDarkness(0.94);
    light.setScale(1, 1);
    light.setOccluders(walls);
    light.addLight(lightX, 0, 520, 1, 0);
    light.render(ctx, cam, W, H, 0);
    return { behind: lum(220, 90), above: lum(220, 20), shadowed: light.lastShadowedCount, lookups: light.lastVisibilityLookups };
  };
  const unblocked = render([]);
  const blocked = render([wall]);
  assert.ok(unblocked.behind > 150, `无墙时墙后应被照亮（实际 ${unblocked.behind.toFixed(1)}）`);
  assert.ok(blocked.behind < 60, `有墙时墙后应暗下去（实际 ${blocked.behind.toFixed(1)}）`);
  assert.ok(
    Math.abs(blocked.above - unblocked.above) < 2,
    `墙上沿的亮度不该被这面墙改掉（${unblocked.above.toFixed(1)} → ${blocked.above.toFixed(1)}）`,
  );
  assert.equal(blocked.shadowed, 1, '像素场景里只有这一盏灯被裁');
  assert.equal(blocked.lookups, 1, '这一盏灯只算一份可见多边形');
});

