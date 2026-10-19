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
  kind: 'damage' | 'crit' | 'label';
  /** 同一个目标的短时间连击合成一条，避免怪群上叠出一堵字墙。 */
  key: string | null;
  value: number;
}

const MAX_ACTIVE = 140;

export class FloatingTextSystem {
  private thinTick = 0;
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
    kind: 'damage',
    key: null,
    value: 0,
  }), 128);

  private spawn(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    crit: boolean,
    life: number,
    kind: 'damage' | 'crit' | 'label',
  ): FloatText | null {
    if (this.pool.activeCount > MAX_ACTIVE) return null;
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
    f.kind = kind;
    f.key = null;
    f.value = 0;
    return f;
  }

  private shown(value: number, crit: boolean): string {
    const n = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return crit ? `${n}!!` : `${n}`;
  }

  damage(x: number, y: number, amount: number, crit: boolean, key?: string): void {
    // 同一目标在 0.24 秒内的连续命中并成一条：数字累加、停留时间续满，
    // 暴击则把这一条升级成暴击样式。这样环形火环、喷射和燎灯打在同一只身上时，
    // 玩家读到的是"这一阵总共掉了多少"，而不是满屏互相踩踏的个位数。
    if (key) {
      for (const f of this.pool.all) {
        if (!f.active || f.key !== key || f.kind === 'label') continue;
        if (f.maxLife - f.life > 0.24) continue;
        f.value += amount;
        f.life = f.maxLife;
        f.text = this.shown(f.value, f.crit || crit);
        if (crit && !f.crit) {
          f.crit = true;
          f.kind = 'crit';
          f.color = '#fff0a8';
          f.size = 20;
          f.maxLife = 0.9;
          f.life = 0.9;
        } else if (!f.crit) {
          f.size = 13 + Math.min(2, f.value / 90);
        }
        return;
      }
    }
    // 画面已经被伤害字塞满时，普通数字只抽样显示三分之一；暴击与标签从不抽样。
    // 这个门槛只在极端怪群里触发，普通战斗的每一下仍会照常报数。
    if (!crit && this.pool.activeCount > 76) {
      this.thinTick = (this.thinTick + 1) % 3;
      if (this.thinTick !== 0) return;
    }
    const f = this.spawn(
      x,
      y,
      this.shown(amount, crit),
      crit ? '#fff0a8' : '#ffe6c0',
      crit ? 20 : 13,
      crit,
      crit ? 0.9 : 0.7,
      crit ? 'crit' : 'damage',
    );
    if (!f) return;
    f.key = key ?? null;
    f.value = amount;
  }

  label(x: number, y: number, text: string, color: string, size = 15): void {
    this.spawn(x, y, text, color, size, true, 1.1, 'label');
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
      const age = 1 - t;
      const alpha = t > 0.7 ? 1 : t / 0.7;
      // 暴击的第一个呼吸里先“炸开”一点，再迅速收稳；普通伤害只做极轻的沉降。
      const scale = f.kind === 'crit'
        ? 1 + Math.max(0, 0.11 - age) * 1.8
        : f.kind === 'damage' ? 1 - age * 0.035 : 1;
      ctx.globalAlpha = alpha;
      const family = f.kind === 'label'
        ? "'Noto Serif CJK SC', 'Songti SC', Georgia, serif"
        : "'Noto Sans SC', system-ui, sans-serif";
      ctx.font = `${f.kind === 'label' ? 700 : 800} ${f.size * scale}px ${family}`;
      ctx.lineWidth = f.kind === 'label' ? 3.4 : 3;
      ctx.strokeStyle = f.kind === 'label' ? 'rgba(2,3,6,0.9)' : 'rgba(0,0,0,0.86)';
      if (f.kind === 'label') {
        ctx.shadowColor = 'rgba(0,0,0,0.72)';
        ctx.shadowBlur = 7;
      } else if (f.kind === 'crit') {
        ctx.shadowColor = 'rgba(255,176,72,0.62)';
        ctx.shadowBlur = 12;
      }
      ctx.strokeText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;

      if (f.kind === 'crit') {
        // 四道短促的金线：只在暴击最亮的那半程存在，不把画面糊成烟花。
        const flare = Math.max(0, 1 - age / 0.46);
        if (flare > 0.02) {
          const reach = f.size * (0.72 + (1 - flare) * 0.42);
          const inner = f.size * 0.4;
          ctx.save();
          ctx.globalAlpha = alpha * flare * 0.55;
          ctx.strokeStyle = '#ffd98e';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let i = 0; i < 4; i += 1) {
            const a = i * Math.PI * 0.5 + Math.PI * 0.25 + Math.sin(f.x * 0.017 + i) * 0.06;
            const c = Math.cos(a);
            const s = Math.sin(a);
            ctx.moveTo(f.x + c * inner, f.y + s * inner);
            ctx.lineTo(f.x + c * reach, f.y + s * reach);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // 底部一层极淡的暗影，把字从草地与火光里托起来。
      ctx.globalAlpha = alpha * 0.24;
      ctx.fillStyle = '#050609';
      ctx.fillText(f.text, f.x + 0.8, f.y + 1.4);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      if (f.kind === 'label') {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 5;
      }
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.clear();
    this.thinTick = 0;
  }

  get count(): number {
    return this.pool.activeCount;
  }
}
