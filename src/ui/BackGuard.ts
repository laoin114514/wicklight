import { isHandheld } from '../core/Perf';

/**
 * 返回键 / 侧滑返回守卫（只管掌上设备）。
 *
 * 手机上最容易丢掉一局的动作不是被打死，是"侧滑返回"：横屏时左边缘那道手势带
 * 正好压在左手拇指的活动范围里——正往左跑着，一个侧滑，浏览器直接离开页面，
 * 这一局就没了（浏览器里玩、没装成 PWA 的时候尤其如此）。
 *
 * 做法是战斗中往历史里塞一个"守卫"条目，玩家按返回时浏览器弹出的是它，于是
 * popstate 能接住：把游戏暂停、停在暂停面板上，要不要走由玩家自己决定。
 * 一旦停下来守卫立刻撤掉——再按一次返回就是真的离开，不会变成"返回键点不动"。
 * 桌面上（非掌上设备）整段不装：键盘玩家按 Alt+← 本来也不会误触。
 */
export class BackGuard {
  /** 守卫条目现在是否在历史里 */
  private armed = false;
  /** 用户按返回时要不要接管（返回 true = 已经处理，不要再往外走） */
  private readonly onBack: () => void;

  constructor(onBack: () => void) {
    this.onBack = onBack;
    if (typeof window === 'undefined') return;
    window.addEventListener('popstate', () => {
      if (!this.armed) return; // 是我们自己 history.back() 撤守卫，或者根本不是我们塞的那条
      this.armed = false;
      this.onBack();
    });
  }

  /**
   * 每帧同步一次（内部先比再动，空转时什么都不做）：
   * 战斗中 → 保证历史里有守卫；离开战斗 → 把守卫撤掉。
   */
  sync(playing: boolean): void {
    if (typeof window === 'undefined' || !isHandheld()) return;
    const want = playing;
    if (want === this.armed) return;
    if (want) {
      try {
        window.history.pushState({ wicklightGuard: 1 }, '');
        this.armed = true;
      } catch {
        /* 沙箱 iframe / 特殊协议下不给 pushState：那就没有守卫，游戏照常玩 */
      }
      return;
    }
    // 从战斗里出来（打赢了、死了、回菜单）：把多出来的那一条吃掉，
    // 别让玩家之后要按两次返回才能真正离开。
    this.armed = false;
    try {
      window.history.back();
    } catch {
      /* 同上 */
    }
  }
}
