import type { InputState, PointerState } from '../types';

interface KeyMap {
  [code: string]: string;
}

const KEYMAP: KeyMap = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'dash',
  KeyK: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyQ: 'nova',
  KeyJ: 'nova',
  KeyE: 'lamp',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'sheet',
  // 面板热键（见 InputState 上那一段）：数字键选第几张卡 / R 重掷 / 回车确认。
  // 小键盘也认——右手正在小键盘上的人不该被漏掉。
  Digit1: 'pick1',
  Digit2: 'pick2',
  Digit3: 'pick3',
  Digit4: 'pick4',
  Numpad1: 'pick1',
  Numpad2: 'pick2',
  Numpad3: 'pick3',
  Numpad4: 'pick4',
  KeyR: 'reroll',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

/**
 * 桌面上「倾灯」手动瞄准（**按住鼠标右键**）的三个刻度，触屏那一套在 TouchControls 里。
 *
 * 这一件在两条路上是**同一种编码**：方向（单位向量）+ 力度（0~1），游戏那边只认这个向量
 * （见 `Player.update` 里"手动瞄准"那一段）。区别只在"推了多远"由什么尺子量：
 * 手指有它自己的起点（按下处就是圆心，行程 56px），鼠标没有起点，只能拿屏幕当行程。
 *
 * · `AIM_DEAD_PX`：指针压在人物身上（点一下、手抖那几像素）不算在瞄——
 *   不然"右键点一下"会让这一瓢拐向随便一个方向。给 null，游戏那边就还给自动瞄准。
 * · `AIM_FULL_H`：指针推到"小半个屏高"就推到底 = 这一个武器自己的射程，
 *   和手指推满 56px 是同一个角色（"推到底 = 原来那一瓢的落点"）。
 * · `AIM_MIN_PULL`：力度下限。**两条路共用这一个数**：过了死区的任何一点位移都算"在瞄"，
 *   而且至少是这一档，否则"往脚前倒"（`POUR.aimNear` 那一端）会退化成"没在瞄"。
 */
export const AIM_DEAD_PX = 6;
export const AIM_FULL_H = 0.45;
export const AIM_MIN_PULL = 0.04;

/**
 * 指针相对屏幕正中的位移 → 方向（单位向量）× 力度（0~1），直接就是 `InputState` 里那两个字段。
 * `null` = 没在瞄（指针压在人物身上）。
 */
export function pointerAim(dx: number, dy: number, height: number): { x: number; y: number } | null {
  const len = Math.hypot(dx, dy);
  if (len <= AIM_DEAD_PX) return null;
  const pull = Math.max(AIM_MIN_PULL, Math.min(1, len / (height * AIM_FULL_H)));
  return { x: (dx / len) * pull, y: (dy / len) * pull };
}

export class Input {
  private held = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  state: InputState = { moveX: 0, moveY: 0, aim: false, aimX: 0, aimY: 0, dash: false, nova: false, focus: false, pause: false, sheet: false, lamp: false, pick: 0, reroll: false, confirm: false };
  pointer: PointerState = { x: 0, y: 0, active: false };
  private listeners: Array<() => void> = [];
  private enabled = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.bind();
  }

  private isAction(code: string): string | undefined {
    return KEYMAP[code];
  }

  private bind(): void {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const action = this.isAction(e.code);
      if (!action) return;
      if (e.repeat) return;
      this.held.add(action);
      this.pressedThisFrame.add(action);
      // 默认行为要挡掉的几个：
      // · 空格 / 方向键会滚动页面、翻滚那个还能"点击"当前获得焦点的按钮；
      // · Tab 会把焦点挪到面板按钮上（这个游戏里 Tab 只有"看构筑"一个意思）；
      // · **回车会激活焦点上的按钮**——鼠标点过"重掷"之后那个按钮就是焦点，
      //   这时候按回车本该走的是结算面板的主按钮，结果会再重掷一次（两件事一起发生）。
      if (
        action === 'dash' ||
        action === 'nova' ||
        action === 'pause' ||
        action === 'sheet' ||
        action === 'confirm'
      )
        e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const action = this.isAction(e.code);
      if (!action) return;
      this.held.delete(action);
      this.releasedThisFrame.add(action);
    };
    const onBlur = () => {
      this.held.clear();
    };
    // 指针位置只在两处更新：移动，以及按下。按下也要记一次——右键瞄准读的就是这个坐标，
    // 而"先按住、再挪"（按下那一刻鼠标还没动过，`active` 还是 false）不该算作"不知道指哪儿"。
    const rememberPointer = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.pointer.active = true;
    };
    const onMouseMove = (e: MouseEvent) => rememberPointer(e);
    const onMouseDown = (e: MouseEvent) => {
      rememberPointer(e);
      if (e.button === 0) {
        this.held.add('novaAlt');
      }
      if (e.button === 2) {
        this.held.add('focus');
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.held.delete('novaAlt');
      if (e.button === 2) this.held.delete('focus');
    };
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this.canvas.addEventListener('contextmenu', onContext);

    this.listeners.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      this.canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      this.canvas.removeEventListener('contextmenu', onContext);
    });
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.held.clear();
  }

  isHeld(action: string): boolean {
    return this.enabled && this.held.has(action);
  }

  /**
   * 桌面上的手动瞄准：**按住鼠标右键**，指针指哪儿这一瓢就倒哪儿（倾灯专用，见 Player）。
   *
   * 为什么在 Input 里出结论、而不是留在主循环里：这是"哪根手指 / 哪个键对应哪个动作"的最后一环，
   * 和 `KEYMAP`、`novaAlt` 是一类东西（右键 = `focus` 也在上面 bind 里）。放在 main.ts 里，
   * 这条规则就只能靠读主循环才知道，而 `held` 与指针都在这个类里，等于没法单独测。
   *
   * 方向和力度直接拿**指针到屏幕中心**的像素位移算，不回头查相机：角色本来就钉在屏幕正中
   * （`camera.follow`），反查那一步只在相机滞后 / 屏震里差几个像素，手感上没人分得出来。
   * 返回 null = 没在瞄（没按右键 / 指针还不知道在哪儿 / 指针压在人物身上）。
   */
  aimVector(width: number, height: number): { x: number; y: number } | null {
    if (!this.isHeld('focus') || !this.pointer.active) return null;
    return pointerAim(this.pointer.x - width / 2, this.pointer.y - height / 2, height);
  }

  wasPressed(action: string): boolean {
    return this.enabled && this.pressedThisFrame.has(action);
  }

  update(): void {
    const s = this.state;
    s.moveX = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    s.moveY = (this.isHeld('down') ? 1 : 0) - (this.isHeld('up') ? 1 : 0);
    s.dash = this.isHeld('dash');
    s.nova = this.isHeld('nova') || this.isHeld('novaAlt');
    s.focus = this.isHeld('focus');
    s.pause = this.wasPressed('pause');
    s.sheet = this.wasPressed('sheet');
    s.lamp = this.wasPressed('lamp');
    // 数字键折成一个数：下游只问"选了第几张"，不该看见四个布尔
    let pick = 0;
    for (let i = 1; i <= 4; i += 1) if (this.wasPressed(`pick${i}`)) pick = i;
    s.pick = pick;
    s.reroll = this.wasPressed('reroll');
    s.confirm = this.wasPressed('confirm');
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
  }
}
