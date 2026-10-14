import { Pool } from '../core/Pool';
import { rng } from '../core/Random';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  glow: boolean;
  ring: boolean;
  gravity: number;
}

export class ParticleSystem {
  private pool = new Pool<Particle>(() => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 3,
    color: '#fff',
    drag: 2,
    glow: true,
    ring: false,
    gravity: 0,
  }), 512);

  burst(x: number, y: number, count: number, color: string, opts: { speed?: number; size?: number; life?: number; drag?: number; glow?: boolean; gravity?: number } = {}): void {
    const speed = opts.speed ?? 160;
    for (let i = 0; i < count; i += 1) {
      const p = this.pool.acquire();
      const a = rng.angle();
      const s = speed * (0.4 + rng.next());
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = (opts.life ?? 0.5) * (0.6 + rng.next() * 0.7);
      p.life = p.maxLife;
      p.size = (opts.size ?? 3) * (0.6 + rng.next() * 0.8);
      p.color = color;
      p.drag = opts.drag ?? 3;
      p.glow = opts.glow ?? true;
      p.ring = false;
      p.gravity = opts.gravity ?? 0;
    }
  }

  ember(x: number, y: number, color: string): void {
    const p = this.pool.acquire();
    p.x = x;
    p.y = y;
    p.vx = (Math.random() * 2 - 1) * 14;
    p.vy = -12 - Math.random() * 20;
    p.maxLife = 1.2 + Math.random() * 1.4;
    p.life = p.maxLife;
    p.size = 1.5 + Math.random() * 2;
    p.color = color;
    p.drag = 0.2;
    p.glow = true;
    p.ring = false;
    p.gravity = -4;
  }

  /** 灯火中缓慢漂浮的微尘：小而长命，用来"把光画出来"。 */
  mote(x: number, y: number, color: string): void {
    const p = this.pool.acquire();
    p.x = x;
    p.y = y;
    p.vx = (Math.random() * 2 - 1) * 9;
    p.vy = -3 - Math.random() * 9;
    p.maxLife = 2.2 + Math.random() * 2.8;
    p.life = p.maxLife;
    p.size = 0.9 + Math.random() * 1.6;
    p.color = color;
    p.drag = 0.7;
    p.glow = true;
    p.ring = false;
    p.gravity = -1.6;
  }

  shockwave(x: number, y: number, color: string, size = 40, life = 0.4): void {
    const p = this.pool.acquire();
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.maxLife = life;
    p.life = life;
    p.size = size;
    p.color = color;
    p.drag = 0;
    p.glow = true;
    p.ring = true;
    p.gravity = 0;
  }

  update(dt: number): void {
    for (const p of this.pool.all) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = 1 - p.drag * dt;
      p.vx *= d > 0 ? d : 0;
      p.vy *= d > 0 ? d : 0;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool.all) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      if (p.ring) {
        const r = p.size * (1 - t) + 6;
        ctx.globalAlpha = t * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + 4 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
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
