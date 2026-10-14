/**
 * 静态家具的烘焙：墙（含投影 / 高光 / 暗面 / 描边）一整局都不动，
 * 却每帧每面墙要十几个画布命令，是地面开销里最肥的一块。
 * 这里锁住三件事：① 烘焙真的把每面墙压成 1 条 drawImage；
 * ② 精灵把墙连同投影的外扩一起包住（少留一点就会切掉影子，看起来像悬空）；
 * ③ 关卡换了、主题换了要重新烘（缓存别串关），而且总像素有上限。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

function countOn(ctx, keys) {
  const counts = {};
  for (const k of keys) counts[k] = 0;
  for (const k of keys) {
    const orig = ctx[k].bind(ctx);
    ctx[k] = (...a) => {
      counts[k] += 1;
      return orig(...a);
    };
  }
  return counts;
}

test('墙烘焙成精灵：每面墙 1 条 drawImage，尺寸包住投影，换关重烘', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  const theme = game.currentStage().theme;
  const walls = game.level.walls;
  assert.ok(walls.length >= 8, `一关至少有几面墙可测（${walls.length}）`);

  // ── ① 烘焙路径：每面墙一条 drawImage，不再有逐面墙的填充 / 描边 ──
  const ctx = game.renderer.ctx;
  let c = countOn(ctx, ['drawImage', 'fillRect', 'strokeRect', 'stroke']);
  game.drawWalls(ctx, theme);
  assert.equal(c.drawImage, walls.length, '每面墙一条 drawImage');
  assert.equal(c.fillRect, 0, '烘过之后不该还有逐面墙的填充');
  assert.equal(c.strokeRect, 0, '烘过之后不该还有逐面墙的描边矩形');
  assert.equal(c.stroke, 0, '烘过之后不该还有逐面墙的描边路径');

  // ── ② 精灵把墙 + 投影外扩(6,8) + 2px 描边都包住 ──
  const sprites = game.wallLayer(theme);
  assert.ok(sprites && sprites.length === walls.length, `精灵数与墙数一致（${sprites?.length}）`);
  for (let i = 0; i < walls.length; i += 1) {
    const wall = walls[i];
    const s = sprites[i];
    assert.ok(
      Math.abs(s.w - (wall.w + 24)) <= 1 && Math.abs(s.h - (wall.h + 24)) <= 1,
      `精灵要留出 12px 外扩（墙 ${wall.w}x${wall.h} → 精灵 ${s.w}x${s.h}）`,
    );
    assert.ok(Math.abs(s.x - (wall.x - 12)) <= 1 && Math.abs(s.y - (wall.y - 12)) <= 1, '精灵左上角要跟着外扩走');
  }

  // 总像素上限：极端一局（十几面 350×350 的墙）也不能把内存吃掉几十 MB
  const pixels = sprites.reduce((a, s) => a + s.canvas.width * s.canvas.height, 0);
  assert.ok(pixels <= 6.5e6, `精灵总像素要有上限（${(pixels / 1e6).toFixed(2)}M）`);

  // ── ③ 缓存：同一关同一主题只烘一次；换关 / 换主题要重烘 ──
  assert.equal(game.wallLayer(theme), sprites, '同一关重复取是同一份（不重烘）');
  const firstCanvas = sprites[0].canvas;
  game.newRun('ember', 'normal', false); // 另一盏灯 + 另一关（主题不同）
  const theme2 = game.currentStage().theme;
  const walls2 = game.level.walls;
  const sprites2 = game.wallLayer(theme2);
  assert.ok(sprites2 && sprites2.length === walls2.length, '换关之后精灵要按新关卡重烘');
  assert.notEqual(sprites2, sprites, '换关之后不能还拿着上一关那份');
  assert.notEqual(sprites2[0].canvas, firstCanvas, '新关卡的墙是新画的位图');

  // ── ④ 兜底：建不出位图（无 document / 内存吃紧）时退回逐面墙直接画 ──
  game.wallLayer = () => null;
  c = countOn(game.renderer.ctx, ['drawImage', 'fillRect', 'strokeRect']);
  game.drawWalls(game.renderer.ctx, theme2);
  assert.equal(c.drawImage, 0, '兜底路径不画精灵');
  assert.equal(c.fillRect, walls2.length * 5, `兜底路径每面墙 5 次填充（${c.fillRect} vs ${walls2.length * 5}）`);
  assert.equal(c.strokeRect, walls2.length, '兜底路径每面墙一次描边矩形');
});
