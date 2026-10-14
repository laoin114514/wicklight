import { Pool } from '../core/Pool';

export interface FloatText {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
  crit: boolean;
}

const MAX_ACTIVE = 140;

export class FloatingTextSystem {
  private pool = new Pool<FloatText>(() => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0.8,
    text: '',
    color: '#fff',
    size: 14,
    crit: false,
  }), 128);

  private spawn(x: number, y: number, text: string, color: string, size: number, crit: boolean, life: number): void {
    if (this.pool.activeCount > MAX_ACTIVE) return;
    const f = this.pool.acquire();
    f.x = x + (Math.random() * 2 - 1) * 10;
    f.y = y;
    f.vx = (Math.random() * 2 - 1) * 24;
    f.vy = -70 - Math.random() * 30;
    f.maxLife = life;
    f.life = life;
    f.text = text;
    f.color = color;
    f.size = size;
    f.crit = crit;
  }

  damage(x: number, y: number, amount: number, crit: boolean): void {
    const shown = amount >= 100 ? Math.round(amount) : Math.round(amount * 10) / 10;
    const text = crit ? `${shown}!!` : `${shown}`;
    if (crit) this.spawn(x, y, text, '#fff0a8', 20, true, 0.9);
    else this.spawn(x, y, text, '#ffe6c0', 13, false, 0.7);
  }

  label(x: number, y: number, text: string, color: string, size = 15): void {
    this.spawn(x, y, text, color, size, true, 1.1);
  }

  update(dt: number): void {
    for (const f of this.pool.all) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        continue;
      }
      f.vy += 180 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of this.pool.all) {
      if (!f.active) continue;
      const t = f.life / f.maxLife;
      const alpha = t > 0.7 ? 1 : t / 0.7;
      const scale = f.crit ? 1 + (1 - t) * 0.25 : 1;
      ctx.globalAlpha = alpha;
      ctx.font = `${f.crit ? 800 : 700} ${f.size * scale}px 'Noto Sans SC', system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.clear();
  }

  get count(): number {
    return this.pool.activeCount;
  }
}
