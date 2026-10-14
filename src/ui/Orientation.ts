import { isHandheld } from '../core/Perf';

export interface OrientationGate {
  /** 现在是不是"竖屏被挡住"的状态（挡住时主循环应当停下）。 */
  blocked(): boolean;
  /** 重新判定一次（resize / 转屏后调用）。 */
  update(): void;
}

/**
 * 横屏闸门。
 *
 * 手机竖着拿的时候，视野只有一窄条、摇杆和燃爆键又会把 HUD 挤成一团，
 * 与其画一个"能跑但没法玩"的画面，不如直接盖一块牌子请他转过来。
 * 三种情况一起用：
 *   1. 装到桌面的 PWA 走 manifest 的 `orientation: landscape`（安卓直接锁横屏）；
 *   2. 已经在全屏里（装机版 / 手动全屏）就顺手锁一次屏幕方向，iOS 会安静地失败；
 *   3. 剩下的一律走这块遮罩：横过来自动消失，不需要刷新页面。
 */
export function setupOrientation(onChange?: (blocked: boolean) => void): OrientationGate {
  const hint = typeof document !== 'undefined' ? document.getElementById('rotate-hint') : null;
  let blocked: boolean | null = null;

  const portrait = (): boolean => {
    if (!isHandheld()) return false;
    if (typeof window === 'undefined') return false;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    if (vw > 0 && vh > 0) return vh > vw;
    return typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches;
  };

  /** 要一次全屏 + 横屏锁定：安卓 Chrome 会直接把屏幕转过来，iOS 会安静地失败。 */
  const enterLandscape = (): void => {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
      if (req) void Promise.resolve(req.call(el)).catch(() => undefined);
    } catch {
      /* 用户拒绝 / 浏览器不给，都不影响遮罩那套 */
    }
    // 全屏是异步的，锁方向要等它真的进去之后再要一次
    if (typeof window !== 'undefined') window.setTimeout(lock, 240);
  };

  /** 已经在全屏里的话，顺便要一次横屏锁定；没权限就算了，遮罩已经够用。 */
  const lock = (): void => {
    try {
      if (typeof document === 'undefined' || !document.fullscreenElement) return;
      const so = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
      void so?.lock?.('landscape')?.catch?.(() => undefined);
    } catch {
      /* 不支持就各自转屏 */
    }
  };

  const update = (): void => {
    const next = portrait();
    if (next !== blocked) {
      blocked = next;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('is-portrait', next);
        hint?.classList.toggle('is-on', next);
        hint?.setAttribute('aria-hidden', next ? 'false' : 'true');
      }
      onChange?.(next);
    }
    if (!next) lock();
  };

  const fsBtn = typeof document !== 'undefined' ? document.getElementById('rotate-fullscreen') : null;
  if (fsBtn) {
    const canFullscreen =
      typeof document !== 'undefined' &&
      (document.fullscreenEnabled === true || 'webkitFullscreenEnabled' in document);
    // 手机上（iPhone Safari 这种）没有全屏就直接不给这个按钮，别让人点了没反应
    if (canFullscreen) fsBtn.addEventListener('click', enterLandscape);
    else fsBtn.classList.add('is-hidden');
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
  }
  update();
  return { blocked: () => blocked === true, update };
}
