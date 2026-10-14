/**
 * 屏幕边缘的方位指引：两个目标在同一方向时，标签不能叠在一起。
 *
 * 手机横屏实测过这一幕：灯台与祭坛都在右前方，"灯台 1000" 与 "祭坛 800" 两行字
 * 直接压在彼此身上，谁也读不出来——指引反而变成了噪声。
 * 这里把两个目标摆到同一个方向，逐条读回 fillText 的位置来断言"不重叠"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

/** 把 fillText 的落点记下来（桩件的 ctx 只计数，不记内容）。 */
function recordText(ctx) {
  const out = [];
  const orig = ctx.fillText.bind(ctx);
  ctx.fillText = (text, x, y) => {
    out.push({ text: String(text), x, y, w: ctx.measureText(String(text)).width });
    return orig(text, x, y);
  };
  return out;
}

test('方位指引：同方向的两个目标，标签要错开', async (t) => {
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
  const lvl = game.level;
  const cam = game.camera;

  // 两个目标摆在右前方、几乎同一条射线上：不改的话两个标签必然重叠
  assert.ok(lvl.pyres.length >= 2 && lvl.shrines.length >= 1, '至少要有两座灯台与一座祭坛');
  lvl.pyres[0].lit = false;
  lvl.pyres[1].lit = false;
  lvl.shrines[0].used = false;
  lvl.pyres[0].x = cam.x + 2000;
  lvl.pyres[0].y = cam.y + 40;
  lvl.pyres[1].x = cam.x + 2000;
  lvl.pyres[1].y = cam.y + 90;
  lvl.shrines[0].x = cam.x + 1980;
  lvl.shrines[0].y = cam.y + 150;
  for (let i = 2; i < lvl.pyres.length; i += 1) lvl.pyres[i].lit = true; // 只留这三条
  for (let i = 1; i < lvl.shrines.length; i += 1) lvl.shrines[i].used = true;

  const ctx = game.renderer.ctx;
  const w = game.renderer.width;
  const h = game.renderer.height;
  const texts = recordText(ctx);
  game.drawTargetPointers(ctx, w, h);

  const labels = texts.filter((r) => /灯台|祭坛/.test(r.text) && /\d/.test(r.text));
  assert.ok(labels.length >= 2, `三个目标都该在屏幕外并给出指引（拿到 ${texts.length} 条文字）`);
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i];
      const b = labels[j];
      const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1;
      const overlapY = Math.abs(a.y - b.y) < 13;
      assert.ok(!(overlapX && overlapY), `标签互相压住了：${a.text}@${Math.round(a.x)},${Math.round(a.y)} 与 ${b.text}@${Math.round(b.x)},${Math.round(b.y)}`);
    }
  }
  // 让开之后也不能跑出安全带（左右两列 HUD 的位置）
  for (const l of labels) {
    assert.ok(l.x > 20 && l.x < w - 20, `${l.text} 落到了屏幕边缘外（x=${Math.round(l.x)}/${w}）`);
    assert.ok(l.y > 0 && l.y < h, `${l.text} 落到了屏幕外（y=${Math.round(l.y)}/${h}）`);
  }
});
