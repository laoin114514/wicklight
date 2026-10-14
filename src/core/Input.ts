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
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'sheet',
};

export class Input {
  private held = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  state: InputState = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, dash: false, nova: false, focus: false, pause: false, sheet: false };
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
      if (action === 'dash' || action === 'nova' || action === 'pause' || action === 'sheet') e.preventDefault();
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
    const onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.pointer.active = true;
    };
    const onMouseDown = (e: MouseEvent) => {
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
