/**
 * 触感反馈（震动）。
 *
 * 手机上"冲刺"和"燃爆"是两个按在屏幕上的按钮，按下去有没有生效，手指感觉不到——
 * 短震一下是最便宜的反馈。三件事要做对：
 *   1. 只在掌上设备上震（带触摸屏的笔记本不该嗡一下）；
 *   2. 设置里能关掉（有人就是不想被震）；
 *   3. 不支持（iOS Safari 没有 navigator.vibrate）或调用抛错时安静跳过，游戏照常玩。
 */
import { isHandheld } from './Perf';

type Vibrate = (pattern: number | number[]) => boolean;

function vibrateFn(): Vibrate | null {
  if (typeof navigator === 'undefined') return null;
  const v = (navigator as Navigator & { vibrate?: Vibrate }).vibrate;
  return typeof v === 'function' ? v : null;
}

/** 是否支持触感（供设置面板决定要不要显示这一项）。 */
export function hapticsAvailable(): boolean {
  return vibrateFn() !== null;
}

export function haptic(pattern: number | number[], enabled = true): void {
  if (!enabled || !isHandheld()) return;
  const v = vibrateFn();
  if (!v) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    v.call(navigator, pattern);
  } catch {
    /* 用户设置里禁了 / 权限策略拦了：不是什么大事 */
  }
}
