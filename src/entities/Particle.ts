import { Pool } from '../core/Pool';
import { rng } from '../core/Random';
import { drawGlow, drawSoftRing } from '../core/SoftFX';

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
  /** 只有 `ring` 粒子会读：这一圈从哪个角度画到哪个角度（默认整圆）。 */
  arcStart: number;
  arcEnd: number;
  gravity: number;
  shape: 'dot' | 'spark' | 'smoke' | 'shard';
  angle: number;
  spin: number;
  stretch: number;
  grow: number;
  strength: number;
}

export interface BurstOptions {
  speed?: number;
  size?: number;
  life?: number;
  drag?: number;
  glow?: boolean;
  gravity?: number;
  shape?: Particle['shape'];
  stretch?: number;
  spin?: number;
  grow?: number;
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
    arcStart: 0,
    arcEnd: Math.PI * 2,
    gravity: 0,
    shape: 'dot',
    angle: 0,
    spin: 0,
    stretch: 1,
    grow: 0,
    strength: 1,
  }), 512);

  /**
   * 粒子密度倍率（性能档位给）。只影响"好看"的碎屑，不动任何玩法判定；
   * 桌面档是 1，此时一行额外逻辑都不走，行为与从前逐位一致。
   */
  density = 1;

  burst(x: number, y: number, count: number, color: string, opts: BurstOptions = {}): void {
    const speed = opts.speed ?? 160;
    const n = this.density >= 1 ? count : Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i += 1) {
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
      p.shape = opts.shape ?? 'dot';
      p.angle = a;
      p.spin = opts.spin ?? 0;
      p.stretch = opts.stretch ?? 1;
      p.grow = opts.grow ?? 0;
    }
  }

  /** 爆炸后铺开的低透明度烟尘：用普通混合，避免加法叠加把夜色洗白。 */
  puff(x: number, y: number, count: number, color: string, opts: BurstOptions = {}): void {
    this.burst(x, y, count, color, { speed: 44, size: 10, life: 1.05, drag: 1.7, ...opts, shape: 'smoke', glow: false });
  }

  /** 飞散的火星：沿速度方向拉成细线，和圆点区分开。 */
  sparks(x: number, y: number, count: number, color: string, opts: BurstOptions = {}): void {
    this.burst(x, y, count, color, { speed: 210, size: 2.1, life: 0.46, drag: 2.6, ...opts, shape: 'spark' });
  }

  /** 爆散的火星：短命、轻微下坠，但仍然是光而不是实体碎片。 */
  debris(x: number, y: number, count: number, color: string, opts: BurstOptions = {}): void {
    this.burst(x, y, count, color, { speed: 145, size: 1.7, life: 0.48, drag: 3.1, gravity: 150, ...opts, shape: 'spark', glow: true });
  }

  ember(x: number, y: number, color: string): void {
    // 环境粒子按密度抽样（用 Math.random，别去动玩法那串确定性随机）
    if (this.density < 1 && Math.random() > this.density) return;
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
    p.shape = 'dot';
    p.angle = 0;
    p.spin = 0;
    p.stretch = 1;
    p.grow = 0;
  }

  /** 灯火中缓慢漂浮的微尘：小而长命，用来"把光画出来"。 */
  mote(x: number, y: number, color: string): void {
    if (this.density < 1 && Math.random() > this.density) return;
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
    p.shape = 'dot';
    p.angle = 0;
    p.spin = 0;
    p.stretch = 1;
    p.grow = 0;
  }

  shockwave(x: number, y: number, color: string, size = 40, life = 0.4): void {
    this.shockwaveArc(x, y, color, size, life, 0, Math.PI * 2);
  }

  /**
   * 爆炸中心的短促亮核。
   *
   * 它**不碰 `rng`**：位置、速度、寿命全由调用方给定，只借现有粒子池的收束与加法混合。
   * 这样补一层火光不会改变玩法随机序列，也不会让同一颗种子下的战局漂移。
   */
  flare(x: number, y: number, color: string, size: number, life = 0.2): void {
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
    p.ring = false;
    p.arcStart = 0;
    p.arcEnd = Math.PI * 2;
    p.gravity = 0;
    p.shape = 'dot';
    p.angle = 0;
    p.spin = 0;
    p.stretch = 1;
    p.grow = 0;
  }

  /**
   * 只画一段圆弧的冲击波（v104）。
   *
   * 燃爆 / 伏灯 / 旋灯那些"炸出去的一下"故意不看墙，继续用整圆的 `shockwave`；
   * 燎灯的脉冲是"光照到哪儿就烤到哪儿"，墙后那一段本就不该画出来。
   */
  shockwaveArc(
    x: number,
    y: number,
    color: string,
    size: number,
    life: number,
    arcStart: number,
    arcEnd: number,
    strength = 1,
  ): void {
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
    p.arcStart = arcStart;
    p.arcEnd = arcEnd;
    p.gravity = 0;
    p.shape = 'dot';
    p.angle = 0;
    p.spin = 0;
    p.stretch = 1;
    p.grow = 0;
    p.strength = strength;
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
      p.angle += p.spin * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, view?: { x: number; y: number; halfW: number; halfH: number }): void {
    ctx.save();
    // 视野外的粒子不必进路径：一团碎屑在屏幕外，画它只是白烧 CPU
    const pad = 40;
    const visible = (p: Particle): boolean =>
      !view || (Math.abs(p.x - view.x) <= view.halfW + p.size * 2 + pad && Math.abs(p.y - view.y) <= view.halfH + p.size * 2 + pad);

    // 烟尘与碎屑先走普通混合，作为实体层；火星和光点随后再加法叠亮。
    // 碎屑不再画白色高光：这一局的光效应是加法叠出来的，实体小片只留一点暗色轮廓。
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    for (const p of this.pool.all) {
      if (!p.active || !visible(p)) continue;
      const t = p.life / p.maxLife;
      if (p.shape === 'smoke') {
        const radius = p.size * (1.15 + (1 - t) * p.grow);
        const g = ctx.createRadialGradient(p.x, p.y, radius * 0.08, p.x, p.y, radius);
        g.addColorStop(0, p.color);
        g.addColorStop(0.52, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.min(0.18, t * 0.18);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'shard') {
        const w = Math.max(0.55, p.size * (0.2 + t * 0.28));
        const len = p.size * (0.92 + p.stretch * 0.52);
        ctx.globalAlpha = Math.min(0.52, t * 0.68);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(-len * 0.55, 0);
        ctx.lineTo(-len * 0.06, -w);
        ctx.lineTo(len * 0.55, 0);
        ctx.lineTo(-len * 0.06, w);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool.all) {
      if (!p.active) continue;
      if (p.shape === 'smoke' || p.shape === 'shard' || !visible(p)) continue;
      const t = p.life / p.maxLife;
      if (p.ring) {
        const r = p.size * (1 - t) + 6;
        // 冲击波是一团被推开的空气：厚而透明，中心留空，只有靠近半径处收成一圈亮缘。
        const thickness = 7 + 13 * t;
        const span = Math.abs(p.arcEnd - p.arcStart);
        if (span >= Math.PI * 2 - 0.001) {
          // 整圆先铺一层几乎看不见的连续热空气，再用五段错开的压力波收边。
          // 小缺口让环读成“被推开的空气”，而不是圆规画出的闭合几何线。
          const phase = (p.x * 0.011 + p.y * 0.017) % (Math.PI * 2);
          drawSoftRing(ctx, p.x, p.y, r, thickness * 2.7, p.color, t * 0.055 * p.strength);
          const segments = 5;
          for (let i = 0; i < segments; i += 1) {
            const a0 = phase + (i / segments) * Math.PI * 2 + 0.055;
            const a1 = phase + ((i + 1) / segments) * Math.PI * 2 - 0.055;
            const wobble = 0.94 + 0.1 * Math.sin(i * 1.7 + phase);
            drawSoftRing(
              ctx,
              p.x,
              p.y,
              r * wobble,
              thickness * (2.15 + 0.25 * (i % 3)),
              p.color,
              t * 0.18 * p.strength,
              a0,
              a1,
              '#fff4d8',
              t * 0.03 * p.strength,
            );
          }
        } else {
          drawSoftRing(
            ctx,
            p.x,
            p.y,
            r,
            thickness * 2.3,
            p.color,
            t * 0.3 * p.strength,
            p.arcStart,
            p.arcEnd,
            '#fff4d8',
            t * 0.05 * p.strength,
          );
        }
      } else if (p.shape === 'spark') {
        const speed = Math.hypot(p.vx, p.vy);
        const ux = speed > 0.01 ? p.vx / speed : 1;
        const uy = speed > 0.01 ? p.vy / speed : 0;
        const len = Math.min(34, p.size * (2.4 + p.stretch * 3.2) + speed * 0.018);
        const angle = Math.atan2(p.vy, p.vx);
        drawGlow(ctx, p.x - ux * len * 0.3, p.y - uy * len * 0.3, len * 0.58, p.size * 1.7, p.color, t * 0.46, angle);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = t * 0.08;
        ctx.lineWidth = Math.max(0.8, p.size * 0.72 * t);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * len, p.y - uy * len);
        ctx.stroke();
        // 白芯只留一瞬的方向感；爆裂的亮度交给外圈柔光，不靠一根根白线塑形。
        ctx.strokeStyle = '#fff8dc';
        ctx.globalAlpha = t * 0.055;
        ctx.lineWidth = Math.max(0.28, p.size * 0.045);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * len * 0.55, p.y - uy * len * 0.55);
        ctx.stroke();
      } else {
        const r = p.size * (0.4 + t * 0.6);
        drawGlow(ctx, p.x, p.y, r * 2.2, r * 2.2, p.color, t * 0.74);
        if (p.size > 2.2) {
          drawGlow(ctx, p.x - r * 0.08, p.y - r * 0.12, Math.max(0.55, r * 0.48), Math.max(0.55, r * 0.48), '#fff4d8', t * 0.36);
        }
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
