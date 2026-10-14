import type { Game } from '../core/Game';
import { isTouchDevice } from '../core/Perf';
import { haptic } from '../core/Haptics';

/**
 * 摇杆死区：手指按在摇杆中心附近时总会有几像素的抖动，直接当输入会让角色慢慢漂。
 * 12% 以内当作没动，之后按比例重映射到 0~1（不是硬切，推得越远走得越快）。
 */
const DEAD_ZONE = 0.12;

export class TouchControls {
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private active = false;
  private pointerId = -1;
  private cx = 0;
  private cy = 0;
  /** 摇杆最大行程（跟着样式表里的直径走：横屏会把摇杆收小一号）。 */
  private maxR = 52;
  private moveX = 0;
  private moveY = 0;
  private dash = false;
  private nova = false;
  /** 分灯是一次性动作（按下就放，不需要按住），所以只记"这一帧按过" */
  private lampQueued = false;
  private isTouch = false;
  /** 上屏状态（只在触屏上有意义）：null = 还没同步过 */
  private visible: boolean | null = null;
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.root = document.getElementById('touch-root') as HTMLElement;
    this.stick = document.getElementById('touch-stick') as HTMLElement;
    this.knob = this.stick.querySelector('.touch-stick__knob') as HTMLElement;
    // 和性能档位用同一套判定（core/Perf）：两处各拍一个条件的话，
    // 会出现"性能按手机算、摇杆却不显示"这种自相矛盾的状态。
    this.isTouch = isTouchDevice();
    if (!this.isTouch) {
      this.root.style.display = 'none';
      return;
    }
    // 让样式表知道"这是触屏"，好把底部的构筑信息挪开、别被摇杆压住
    document.body.classList.add('is-touch');
    this.bind();
  }

  private bind(): void {
    const base = this.stick.querySelector('.touch-stick__base') as HTMLElement;
    const start = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const rect = base.getBoundingClientRect();
      this.cx = rect.left + rect.width / 2;
      this.cy = rect.top + rect.height / 2;
      this.maxR = rect.width * 0.42;
      this.pointerId = t.identifier;
      this.active = true;
      this.updateStick(t.clientX, t.clientY);
      e.preventDefault();
    };
    const move = (e: TouchEvent) => {
      if (!this.active) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.pointerId) this.updateStick(t.clientX, t.clientY);
      }
      e.preventDefault();
    };
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.pointerId) {
          this.active = false;
          this.moveX = 0;
          this.moveY = 0;
          this.knob.style.transform = 'translate(-50%, -50%)';
        }
      }
      e.preventDefault();
    };
    this.stick.addEventListener('touchstart', start, { passive: false });
    this.stick.addEventListener('touchmove', move, { passive: false });
    this.stick.addEventListener('touchend', end, { passive: false });
    this.stick.addEventListener('touchcancel', end, { passive: false });

    this.bindButton('[data-action="dash"]', 'dash', 12);
    this.bindButton('[data-action="nova"]', 'nova', 22);
    this.bindLampButton('[data-action="lamp"]', 16);
  }

  /**
   * 按钮按下 / 抬起。除了 touchend，**touchcancel 也必须复位**：来电话、系统手势、
   * 通知下拉都会取消触摸，只监听 touchend 的话按钮会永远卡在"按着"的状态，
   * 冲刺则一路无敌、燃爆则每帧都在放。
   */
  private bindButton(selector: string, action: 'dash' | 'nova', buzz: number): void {
    const btn = this.root.querySelector(selector) as HTMLElement | null;
    if (!btn) return;
    const press = (e: TouchEvent) => {
      this[action] = true;
      this.buzz(buzz);
      e.preventDefault();
    };
    const release = (e: TouchEvent) => {
      this[action] = false;
      e.preventDefault();
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    // 手指按住后滑出按钮再抬起：浏览器会把事件继续发给这个元素，但鼠标/笔路径没有 touch 事件
    btn.addEventListener('pointerup', () => { this[action] = false; });
    btn.addEventListener('pointercancel', () => { this[action] = false; });
  }

  /**
   * 分灯按钮：**按下就放**，不是按住。所以只记一个"这一帧按过"的标记，
   * 由 `apply()` 交给游戏，交给之后就清掉（不然会一帧一帧地放着）。
   */
  private bindLampButton(selector: string, buzz: number): void {
    const btn = this.root.querySelector(selector) as HTMLElement | null;
    if (!btn) return;
    const press = (e: TouchEvent) => {
      this.lampQueued = true;
      this.buzz(buzz);
      e.preventDefault();
    };
    btn.addEventListener('touchstart', press, { passive: false });
    // 鼠标 / 笔也要能点（调试与桌面触屏）
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.lampQueued = true;
        this.buzz(buzz);
      }
    });
  }

  private buzz(ms: number): void {
    // 按键反馈：手机上按下去要有"啪"的一下，设置里可以关掉
    haptic(ms, this.game.settings.data.vibrate !== false);
  }

  private updateStick(x: number, y: number): void {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const max = this.maxR;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;
    // 摇杆帽跟手走（死区内也跟手，只是不产生输入），玩家看得见自己推了多少
    this.knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    let mx = dx / max;
    let my = dy / max;
    const m = Math.hypot(mx, my);
    if (m <= DEAD_ZONE) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    // 死区外重新归一化：刚出死区时速度从 0 连续长起来，不会"啪"地跳到最小值
    const scaled = Math.min(1, (m - DEAD_ZONE) / (1 - DEAD_ZONE)) / (m || 1);
    this.moveX = mx * scaled;
    this.moveY = my * scaled;
  }

  /**
   * 触摸控件只在"真在打"的时候上屏（样式里靠 `#touch-root.is-on` 开关）。
   * 菜单 / 暂停 / 升级 / 商店 / 结算这些面板和它同一层，而它在 DOM 里更靠后、默认盖在上面：
   * 844×390 的主菜单实测，右下角那两枚圆按钮正好压住"成就 / 设置"两行菜单键，
   * 点击会被吃掉（按钮不响应点击，但事件也不会再落到下面的菜单上）；灯火选择那屏更糟，
   * 左下摇杆加右下按钮同时压在两张灯火卡上。
   */
  setActive(on: boolean): void {
    if (!this.isTouch) return;
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('is-on', on);
    // 手指还按着的时候切了状态（暂停 / 死亡 / 掉进竖屏）：直接松手，
    // 不然恢复战斗后角色会带着上一次的摇杆输入自己往前跑。
    if (!on) this.release();
  }

  /** 松开全部输入：摇杆归零、两个按钮弹起。 */
  private release(): void {
    this.active = false;
    this.pointerId = -1;
    this.moveX = 0;
    this.moveY = 0;
    this.dash = false;
    this.nova = false;
    this.lampQueued = false;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  apply(target: { moveX: number; moveY: number; dash: boolean; nova: boolean; lamp: boolean }): void {
    if (!this.isTouch) return;
    target.moveX = this.moveX;
    target.moveY = this.moveY;
    target.dash = this.dash;
    target.nova = this.nova;
    if (this.lampQueued) {
      target.lamp = true;
      this.lampQueued = false;
    }
  }
}
