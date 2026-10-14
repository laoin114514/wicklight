import type { Game } from '../core/Game';

export class TouchControls {
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private active = false;
  private pointerId = -1;
  private cx = 0;
  private cy = 0;
  private moveX = 0;
  private moveY = 0;
  private dash = false;
  private nova = false;
  private isTouch = false;

  constructor(_game: Game) {
    this.root = document.getElementById('touch-root') as HTMLElement;
    this.stick = document.getElementById('touch-stick') as HTMLElement;
    this.knob = this.stick.querySelector('.touch-stick__knob') as HTMLElement;
    this.isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
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

    const dashBtn = this.root.querySelector('[data-action="dash"]') as HTMLElement;
    const novaBtn = this.root.querySelector('[data-action="nova"]') as HTMLElement;
    dashBtn.addEventListener('touchstart', (e) => { this.dash = true; e.preventDefault(); }, { passive: false });
    dashBtn.addEventListener('touchend', (e) => { this.dash = false; e.preventDefault(); }, { passive: false });
    novaBtn.addEventListener('touchstart', (e) => { this.nova = true; e.preventDefault(); }, { passive: false });
    novaBtn.addEventListener('touchend', (e) => { this.nova = false; e.preventDefault(); }, { passive: false });
  }

  private updateStick(x: number, y: number): void {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const max = 52;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;
    this.knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    this.moveX = dx / max;
    this.moveY = dy / max;
    const m = Math.hypot(this.moveX, this.moveY);
    if (m > 1) {
      this.moveX /= m;
      this.moveY /= m;
    }
  }

  apply(target: { moveX: number; moveY: number; dash: boolean; nova: boolean }): void {
    if (!this.isTouch) return;
    target.moveX = this.moveX;
    target.moveY = this.moveY;
    target.dash = this.dash;
    target.nova = this.nova;
  }
}
