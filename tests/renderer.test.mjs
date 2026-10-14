import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('渲染器：后备缓冲永远跟着窗口尺寸与设备像素比走', async (t) => {
  assert.ok(existsSync(ENTRY), 'dist/app.js 不存在，请先执行 npm run build');
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();

  const handle = globalThis.window.__WICKLIGHT__;
  assert.ok(handle, '应通过 window.__WICKLIGHT__ 暴露句柄');
  const { game, loop } = handle;
  t.after(() => loop?.stop?.());

  const r = game.renderer;
  const canvas = r.canvas;

  /** 后备缓冲 = CSS 尺寸 × 倍率，且 CSS 尺寸与相机视口必须同步。 */
  const sync = (label) => {
    assert.equal(canvas.width, Math.max(1, Math.floor(r.width * r.dpr)), `${label}：后备缓冲宽度应等于 CSS 宽 × 倍率`);
    assert.equal(canvas.height, Math.max(1, Math.floor(r.height * r.dpr)), `${label}：后备缓冲高度应等于 CSS 高 × 倍率`);
    assert.equal(canvas.style.width, `${r.width}px`, `${label}：canvas 的 CSS 宽要跟着同步`);
    assert.equal(canvas.style.height, `${r.height}px`, `${label}：canvas 的 CSS 高要跟着同步`);
    assert.equal(game.camera.vw, r.width, `${label}：相机视口要和渲染尺寸一致，否则镜头中心会偏`);
  };

  sync('初始 1280×720');
  assert.equal(r.dpr, 1, '1280×720 @1x 用满 1 倍');

  // 窗口变大而倍率恰好不变：这是"右侧发虚 / 重影"的那条路径——
  // 后备缓冲若停在 1280×720，浏览器就会把它拉伸到窗口大小。
  globalThis.window.innerWidth = 1600;
  globalThis.window.innerHeight = 900;
  env.dispatch('resize');
  env.frame();
  assert.equal(r.width, 1600, '渲染尺寸跟着窗口走');
  assert.equal(r.dpr, 1, '1600×900 @1x 仍是 1 倍（倍率没变）');
  assert.equal(canvas.width, 1600, '倍率没变也必须重贴后备缓冲');
  assert.equal(canvas.height, 900, '倍率没变也必须重贴后备缓冲');
  sync('1600×900');

  // 非 16:9 的窗口同样成立
  globalThis.window.innerWidth = 1440;
  globalThis.window.innerHeight = 960;
  env.dispatch('resize');
  env.frame();
  sync('1440×960');
  assert.equal(canvas.width, 1440, '换比例也不会被拉伸');

  // 换一块高分屏 / 改浏览器缩放：devicePixelRatio 变了也要重贴
  globalThis.window.devicePixelRatio = 2;
  env.frame();
  assert.ok(r.dpr > 1, `DPR 变 2 后倍率应该抬上去，实际 ${r.dpr}`);
  sync('DPR 2');

  // 换回 1 倍屏：倍率与缓冲都要回落，不能留下旧尺寸
  globalThis.window.devicePixelRatio = 1;
  env.frame();
  assert.equal(r.dpr, 1, 'DPR 回落时倍率也要回落');
  sync('DPR 回 1');

  // 画质档位同样只改倍率，不改"缓冲必须等于 CSS × 倍率"这条约定
  globalThis.window.innerWidth = 2560;
  globalThis.window.innerHeight = 1440;
  env.dispatch('resize');
  env.frame();
  game.settings.data.quality = 'low';
  env.frame();
  sync('2560×1440 低画质');
  assert.ok(r.renderPixels <= 2560 * 1440, `低画质不该超过 1 倍像素，实际 ${r.renderPixels}`);

  game.settings.data.quality = 'high';
  env.frame();
  sync('2560×1440 高画质');
  assert.ok(r.renderPixels <= r.pixelBudget + 1, `像素预算要兜住，实际 ${r.renderPixels} > ${r.pixelBudget}`);
});
