/**
 * 触屏按钮上的冷却圈（数据侧）：`dashCdFrac` / `novaCdFrac` 是 HUD 画那一圈的唯一输入。
 * 键盘上"按下去没反应"玩家自己知道是在冷却，手机上只有一个圆按钮——这一圈就是那句话，
 * 所以它必须说得清楚：刚放完 ≈ 1，转完是 0 且不带负数 / NaN。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('冲刺 / 燃爆的冷却比例：满圈 → 退回去 → 干净', async (t) => {
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
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  const p = game.player;

  assert.equal(p.dashCdFrac, 0, '没放过冲刺时不该有圈（分母 0 也不能算出 NaN）');
  assert.equal(p.novaCdFrac, 0, '没放过燃爆时不该有圈');

  // ── 冲刺 ──
  game.setInput(0, 0, true, false);
  game.update(1 / 60);
  game.setInput(0, 0, false, false);
  assert.ok(p.dashCd > 0, '按住冲刺要真的放出去');
  assert.ok(p.dashCdMax > 0, '放完要记下这一圈的总时长（冲刺时长会随遗物变化，只有剩余时间画不出角度）');
  const full = p.dashCdFrac;
  assert.ok(full > 0.9 && full <= 1, `刚放完几乎是满圈（${full}）`);

  const steps = Math.ceil(p.dashCdMax * 60);
  for (let i = 0; i < Math.floor(steps / 2); i += 1) game.update(1 / 60);
  const mid = p.dashCdFrac;
  assert.ok(mid > 0 && mid < full, `冷却过半时圈要退到中间（${mid}）`);

  for (let i = 0; i < steps; i += 1) game.update(1 / 60);
  assert.equal(p.dashCdFrac, 0, '转完了就是 0（不留负数）');

  // ── 燃爆 ──
  game.setInput(0, 0, false, true);
  game.update(1 / 60);
  game.setInput(0, 0, false, false);
  assert.ok(p.novaCd > 0 && p.novaCdMax > 0, '燃爆也要记下总时长');
  assert.ok(Math.abs(p.novaCdFrac - 1) < 0.05, `刚放完是满圈（${p.novaCdFrac}）`);

  // ── 重开一局：上一局的冷却不能留在新局的按钮上 ──
  game.newRun('warden', 'normal', false);
  assert.equal(game.player.dashCdFrac, 0, '新局里冲刺是干净的');
  assert.equal(game.player.novaCdFrac, 0, '新局里燃爆是干净的');
});
