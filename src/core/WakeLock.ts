import { isHandheld } from './Perf';

/**
 * 屏幕常亮。
 *
 * 一局打十几分钟，中间可能一直在用摇杆（手指压着屏幕）——但看血条、躲弹幕的时候手会离开，
 * 手机就可能按自己的息屏时间去暗屏。浏览器有 Wake Lock API：申请到之后系统不会因为
 * 没交互而锁屏，松开手也不会。
 *
 * 只对掌上设备申请（桌面上没意义），只在真正在玩的时候持有（暂停 / 菜单里放掉，省电），
 * 页面切到后台时浏览器会自动释放，回来要重新申请一次。
 */
interface Sentinel {
  release: () => Promise<void>;
}

export class WakeLock {
  private sentinel: Sentinel | null = null;
  private want = false;
  private pending = false;
  private readonly supported =
    typeof navigator !== 'undefined' && typeof (navigator as Navigator & { wakeLock?: unknown }).wakeLock === 'object';

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.want) void this.acquire();
      });
    }
  }

  /** 当前"想不想要常亮"（供测试断言：拿到没拿到要看系统给不给）。 */
  get wanted(): boolean {
    return this.want;
  }

  /** 想不想要常亮——调用方每帧喊一次就行，这里只在状态真的翻转时才动。 */
  set(on: boolean): void {
    const next = on && this.supported && isHandheld();
    if (next === this.want) return;
    this.want = next;
    if (next) void this.acquire();
    else void this.drop();
  }

  private async acquire(): Promise<void> {
    if (!this.want || this.pending || this.sentinel) return;
    this.pending = true;
    try {
      const wl = (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<Sentinel> } }).wakeLock;
      this.sentinel = await wl.request('screen');
    } catch {
      // 不支持 / 当前不在前台 / 用户设置里禁了：安静地算了，游戏照常玩
    } finally {
      this.pending = false;
      // 申请回来的时候已经不需要了（比如刚点了暂停），立刻放掉
      if (!this.want) void this.drop();
    }
  }

  private async drop(): Promise<void> {
    const s = this.sentinel;
    this.sentinel = null;
    if (!s) return;
    try {
      await s.release();
    } catch {
      /* 已经自己释放过了 */
    }
  }
}
