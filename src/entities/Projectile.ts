import { Pool } from '../core/Pool';

export interface Projectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  radius: number;
  pierce: number;
  hitIds: number[];
  color: string;
  knockback: number;
  burn: number;
  homing: number;
  explode: number;
  speed: number;
  trail: boolean;
  slow: number;
  spin: number;
  angle: number;
  weaponId: string;
}

export class ProjectileSystem {
  private pool = new Pool<Projectile>(() => ({
    active: false,
    fromPlayer: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    damage: 0,
    radius: 6,
    pierce: 0,
    hitIds: [],
    color: '#fff',
    knockback: 0,
    burn: 0,
    homing: 0,
    explode: 0,
    speed: 300,
    trail: true,
    slow: 0,
    spin: 0,
    angle: 0,
    weaponId: '',
  }), 512);

  spawn(cfg: Partial<Projectile> & { x: number; y: number; vx: number; vy: number; damage: number }): Projectile {
    const p = this.pool.acquire();
    p.active = true;
    p.fromPlayer = cfg.fromPlayer ?? true;
    p.x = cfg.x;
    p.y = cfg.y;
    p.vx = cfg.vx;
    p.vy = cfg.vy;
    p.maxLife = cfg.maxLife ?? 1.4;
    p.life = p.maxLife;
    p.damage = cfg.damage;
    p.radius = cfg.radius ?? 6;
    p.pierce = cfg.pierce ?? 0;
    p.hitIds = [];
    p.color = cfg.color ?? '#ffb14e';
    p.knockback = cfg.knockback ?? 0;
    p.burn = cfg.burn ?? 0;
    p.homing = cfg.homing ?? 0;
    p.explode = cfg.explode ?? 0;
    p.speed = Math.hypot(p.vx, p.vy) || 1;
    p.trail = cfg.trail ?? true;
    p.slow = cfg.slow ?? 0;
    p.spin = cfg.spin ?? 0;
    p.angle = Math.atan2(p.vy, p.vx);
    p.weaponId = cfg.weaponId ?? '';
    return p;
  }

  update(dt: number, homingTarget: (p: Projectile) => { x: number; y: number } | null): void {
    for (const p of this.pool.all) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.homing > 0) {
        const target = homingTarget(p);
        if (target) {
          const desired = Math.atan2(target.y - p.y, target.x - p.x);
          let d = desired - p.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          p.angle += Math.max(-p.homing * dt, Math.min(p.homing * dt, d));
          p.vx = Math.cos(p.angle) * p.speed;
          p.vy = Math.sin(p.angle) * p.speed;
        }
      }
      if (p.spin !== 0) p.angle += p.spin * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool.all) {
      if (!p.active) continue;
      const r = p.radius;
      if (p.trail) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = r * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.clear();
  }

  get all(): readonly Projectile[] {
    return this.pool.all;
  }

  get count(): number {
    return this.pool.activeCount;
  }
}
