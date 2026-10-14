/**
 * 敌人美术：每种敌人有可辨识的剪影、朝向感与受灯光影响的明暗，
 * 让玩家在黑暗里也能一眼分辨威胁类型。
 */
import type { Enemy } from './Enemy';
import { AFFIX_MAP } from '../../data/affixes';

const TAU = Math.PI * 2;

const rgbCache = new Map<string, [number, number, number]>();

function rgbOf(hex: string): [number, number, number] {
  const cached = rgbCache.get(hex);
  if (cached) return cached;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0x888888;
  const out: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, out);
  return out;
}

/** t > 0 提亮，t < 0 压暗。 */
function shade(hex: string, t: number): string {
  const [r, g, b] = rgbOf(hex);
  const f = (v: number) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, amp: number, phase: number): void {
  ctx.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * TAU;
    const rr = r * (1 + Math.sin(phase + i * 1.7) * amp);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function poly(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, rot = 0, squash = 1): void {
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = rot + (i / n) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** 以灯为光源做一次简单的方向性明暗填充。 */
function litFill(ctx: CanvasRenderingContext2D, e: Enemy, px: number, py: number, body: string, r: number): void {
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const lx = e.x + (dx / d) * r * 0.55;
  const ly = e.y + (dy / d) * r * 0.55;
  const g = ctx.createRadialGradient(lx, ly, r * 0.08, e.x, e.y, r * 1.25);
  g.addColorStop(0, shade(body, 0.3));
  g.addColorStop(0.55, body);
  g.addColorStop(1, shade(body, -0.5));
  ctx.fillStyle = g;
  ctx.fill();
}

function rimStroke(ctx: CanvasRenderingContext2D, e: Enemy, w: number): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.5);
  ctx.strokeStyle = rgba('#ffffff', e.hitFlash > 0 ? 0.9 : 0.16);
  ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, color: string, pupil: string): void {
  const ex = x + Math.cos(angle) * r * 0.38;
  const ey = y + Math.sin(angle) * r * 0.38;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(2, r * 0.2), 0, TAU);
  ctx.fill();
  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.arc(ex + Math.cos(angle) * r * 0.06, ey + Math.sin(angle) * r * 0.06, Math.max(1, r * 0.09), 0, TAU);
  ctx.fill();
}

/** Boss 脚下的光环：让首领在黑暗里显得"有存在感"，同时不喧宾夺主。 */
function bossAura(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const r = e.radius;
  const pulse = 0.75 + Math.sin(time * 1.7 + e.wobble) * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(e.x, e.y, r * 0.55, e.x, e.y, r * 2.1 * pulse);
  g.addColorStop(0, rgba(e.color, 0.16));
  g.addColorStop(0.6, rgba(e.color, 0.07));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 2.1 * pulse, 0, TAU);
  ctx.fill();
  // 两道反向旋转的弧
  ctx.strokeStyle = rgba(e.color, 0.3);
  ctx.lineWidth = 3;
  for (const dir of [1, -1]) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.5, time * 0.7 * dir, time * 0.7 * dir + Math.PI * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

function shadow(ctx: CanvasRenderingContext2D, e: Enemy): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.radius * 0.78, e.radius * 0.95, e.radius * 0.4, 0, 0, TAU);
  ctx.fill();
}

/** 各族群的身体剪影。 */
function bodyPath(ctx: CanvasRenderingContext2D, e: Enemy, id: string, time: number): void {
  const r = e.radius;
  const wob = e.wobble;
  switch (id) {
    case 'shade':
      blob(ctx, e.x, e.y, r, 9, 0.12, wob);
      break;
    case 'crawler':
      poly(ctx, e.x, e.y, r * 1.05, 4, e.angle, 0.78);
      break;
    case 'spitter':
      blob(ctx, e.x, e.y, r, 7, 0.06, wob * 0.6);
      break;
    case 'moth':
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, r * 0.62, r * 1.02, e.angle, 0, TAU);
      break;
    case 'bulwark':
      poly(ctx, e.x, e.y, r, 6, Math.PI / 6, 1);
      break;
    case 'oilsapper':
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, r * 0.82, r * 1.1, 0, 0, TAU);
      break;
    case 'bomber':
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, Math.PI, TAU);
      ctx.lineTo(e.x + r * 0.92, e.y + r * 0.85);
      ctx.lineTo(e.x - r * 0.92, e.y + r * 0.85);
      ctx.closePath();
      break;
    case 'splinter': {
      // 五面晶体：和方形石守区分开，棱角分明地暗示"会裂开"
      poly(ctx, e.x, e.y, r * 1.05, 5, e.angle + wob * 0.08, 0.94);
      break;
    }
    case 'lancer': {
      // 尖头飞镖：朝向上有一根明确的"刺"
      const ca = Math.cos(e.angle);
      const sa = Math.sin(e.angle);
      const nx2 = -sa;
      const ny2 = ca;
      const fx = e.x + ca * r * 1.2;
      const fy = e.y + sa * r * 1.2;
      const bx = e.x - ca * r * 0.72;
      const by = e.y - sa * r * 0.72;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(bx + nx2 * r * 0.88, by + ny2 * r * 0.88);
      ctx.lineTo(e.x - ca * r * 0.05, e.y - sa * r * 0.05);
      ctx.lineTo(bx - nx2 * r * 0.88, by - ny2 * r * 0.88);
      ctx.closePath();
      break;
    }
    case 'beacon': {
      // 梯形提灯：一眼可辨的"辅助怪"轮廓
      const bob = Math.sin(e.wobble * 0.9) * r * 0.06;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.86, e.y - r * 0.6 + bob);
      ctx.lineTo(e.x + r * 0.86, e.y - r * 0.6 + bob);
      ctx.lineTo(e.x + r * 0.6, e.y + r * 0.86 + bob);
      ctx.lineTo(e.x - r * 0.6, e.y + r * 0.86 + bob);
      ctx.closePath();
      break;
    }
    case 'wickmother':
      blob(ctx, e.x, e.y, r, 12, 0.09, wob * 0.7);
      break;
    case 'darkless':
      blob(ctx, e.x, e.y, r, 10, 0.1, -wob * 0.9);
      break;
    case 'thornlord': {
      // 扭转的树心：外层是交错尖角的树皮
      ctx.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i += 1) {
        const ang = (i / n) * TAU + Math.sin(time * 0.6) * 0.05;
        const rr = r * (i % 2 === 0 ? 1 : 0.82) * (1 + Math.sin(wob + i) * 0.05);
        const px2 = e.x + Math.cos(ang) * rr;
        const py2 = e.y + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px2, py2);
        else ctx.lineTo(px2, py2);
      }
      ctx.closePath();
      break;
    }
    case 'extinguisher':
      poly(ctx, e.x, e.y, r, 8, Math.PI / 8, 1);
      break;
    case 'emberwake':
      poly(ctx, e.x, e.y, r, 8, time * 0.25, 1);
      break;
    default:
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      break;
  }
}

/** 剪影之外的附加细节（爪子、翅膀、灯芯、裂纹等）。 */
function details(ctx: CanvasRenderingContext2D, e: Enemy, id: string, time: number, body: string): void {
  const r = e.radius;
  const w = e.wobble;
  switch (id) {
    case 'moth': {
      const flap = 0.55 + Math.abs(Math.sin(time * 11 + w)) * 0.5;
      ctx.fillStyle = rgba('#fff3d0', 0.5);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(
          e.x + Math.cos(e.angle + side * 1.5) * r * 0.5,
          e.y + Math.sin(e.angle + side * 1.5) * r * 0.5,
          r * 1.15 * flap,
          r * 0.62,
          e.angle + side * 0.6,
          0,
          TAU,
        );
        ctx.fill();
      }
      break;
    }
    case 'lancer': {
      ctx.fillStyle = shade(body, -0.32);
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(e.angle + k * 2.3) * r * 0.62, e.y + Math.sin(e.angle + k * 2.3) * r * 0.62, r * 0.24, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(e.angle) * r * 0.5, e.y + Math.sin(e.angle) * r * 0.5);
      ctx.lineTo(e.x + Math.cos(e.angle) * r * 1.1, e.y + Math.sin(e.angle) * r * 1.1);
      ctx.stroke();
      break;
    }
    case 'beacon': {
      const bob = Math.sin(e.wobble * 0.9) * r * 0.06;
      ctx.globalCompositeOperation = 'lighter';
      const f = 0.72 + Math.sin(time * 7 + w) * 0.28;
      const g = ctx.createRadialGradient(e.x, e.y + bob, 0, e.x, e.y + bob, r * 1.55 * f);
      g.addColorStop(0, 'rgba(255,247,216,0.95)');
      g.addColorStop(0.42, rgba('#ffd77a', 0.5));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y + bob, r * 1.55 * f, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(38,30,14,0.85)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(e.x, e.y - r * 0.6 + bob, r * 0.44, Math.PI, TAU);
      ctx.stroke();
      break;
    }
    case 'crawler': {
      ctx.fillStyle = shade(body, -0.35);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(e.angle) * r * 0.7, e.y + Math.sin(e.angle) * r * 0.7);
        ctx.lineTo(e.x + Math.cos(e.angle + side * 1.15) * r * 0.35, e.y + Math.sin(e.angle + side * 1.15) * r * 0.35);
        ctx.lineTo(e.x - Math.cos(e.angle) * r * 0.75, e.y - Math.sin(e.angle) * r * 0.75);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'spitter': {
      ctx.fillStyle = shade(body, -0.25);
      for (let i = 0; i < 3; i += 1) {
        const a = w * 0.5 + (i / 3) * TAU;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r * 1.05, e.y + Math.sin(a) * r * 1.05, r * 0.3, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'bulwark': {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.55, e.y - r * 0.2);
      ctx.lineTo(e.x, e.y + r * 0.1);
      ctx.lineTo(e.x + r * 0.5, e.y - r * 0.3);
      ctx.stroke();
      break;
    }
    case 'oilsapper': {
      const f = 0.75 + Math.sin(time * 9 + w) * 0.25;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(e.x, e.y - r * 1.15, 0, e.x, e.y - r * 1.15, r * 0.8);
      g.addColorStop(0, 'rgba(255,240,200,0.95)');
      g.addColorStop(0.45, rgba(body, 0.7));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y - r * 1.15, r * 0.8 * f, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'bomber': {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * TAU + w * 0.3;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r * 0.5, e.y + Math.sin(a) * r * 0.55, r * 0.16, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'wickmother': {
      ctx.fillStyle = rgba('#ffd24e', 0.85);
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * TAU + w * 0.35;
        const cx = e.x + Math.cos(a) * r * 0.62;
        const cy = e.y + Math.sin(a) * r * 0.62;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.12, r * 0.3, a, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'splinter': {
      // 内部裂纹 + 三个小碎面
      ctx.strokeStyle = shade(body, 0.45);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.55, e.y - r * 0.2);
      ctx.lineTo(e.x, e.y + r * 0.1);
      ctx.lineTo(e.x + r * 0.5, e.y - r * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + r * 0.1);
      ctx.lineTo(e.x + r * 0.15, e.y + r * 0.62);
      ctx.stroke();
      ctx.fillStyle = shade(body, 0.25);
      for (let i = 0; i < 3; i += 1) {
        const a = e.wobble * 0.3 + (i / 3) * TAU;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r * 0.42, e.y + Math.sin(a) * r * 0.42, r * 0.12, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'darkless': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(160,190,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.12, w, w + Math.PI * 1.25);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'thornlord': {
      // 放射荆棘
      ctx.fillStyle = shade(body, -0.45);
      for (let i = 0; i < 9; i += 1) {
        const ang = (i / 9) * TAU + w * 0.25;
        const base = r * 0.86;
        const len = r * (0.34 + 0.18 * Math.sin(time * 2 + i));
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(ang) * base, e.y + Math.sin(ang) * base);
        ctx.lineTo(e.x + Math.cos(ang + 0.16) * base, e.y + Math.sin(ang + 0.16) * base);
        ctx.lineTo(e.x + Math.cos(ang + 0.08) * (base + len), e.y + Math.sin(ang + 0.08) * (base + len));
        ctx.closePath();
        ctx.fill();
      }
      // 树皮裂纹里的琥珀光
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,196,90,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        const ang = (i / 4) * TAU + w * 0.5;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(ang) * r * 0.2, e.y + Math.sin(ang) * r * 0.2);
        ctx.lineTo(e.x + Math.cos(ang + 0.4) * r * 0.68, e.y + Math.sin(ang + 0.4) * r * 0.68);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // 一双琥珀眼
      ctx.fillStyle = '#ffd24e';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(e.angle + side * 0.42) * r * 0.36, e.y + Math.sin(e.angle + side * 0.42) * r * 0.36, r * 0.11, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'extinguisher': {
      ctx.strokeStyle = 'rgba(255,110,130,0.55)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + time * 0.4;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.95, e.y + Math.sin(a) * r * 0.95);
        ctx.lineTo(e.x + Math.cos(a) * r * 1.3, e.y + Math.sin(a) * r * 1.3);
        ctx.stroke();
      }
      break;
    }
    case 'emberwake': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,190,90,0.8)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU + w * 0.2;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.3, e.y + Math.sin(a) * r * 0.3);
        ctx.lineTo(e.x + Math.cos(a + 0.5) * r * 0.85, e.y + Math.sin(a + 0.5) * r * 0.85);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    default:
      break;
  }
}

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number, px: number, py: number): void {
  const r = e.radius;
  const id = e.defId;
  // 首领的血肉压得更暗，靠轮廓与光效而不是整体高亮来表现压迫感
  const body = e.hitFlash > 0 ? '#ffffff' : e.boss ? shade(e.color, -0.3) : e.color;

  // 出生弹出
  const spawnT = e.spawnTimer > 0 ? 1 - e.spawnTimer / 0.4 : 1;
  if (spawnT < 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, spawnT);
    ctx.translate(e.x, e.y);
    const k = 0.55 + spawnT * 0.45;
    ctx.scale(k, k);
    ctx.translate(-e.x, -e.y);
  }

  if (e.boss) bossAura(ctx, e, time);
  shadow(ctx, e);
  bodyPath(ctx, e, id, time);
  litFill(ctx, e, px, py, body, r);
  rimStroke(ctx, e, e.boss ? 4 : 2);
  details(ctx, e, id, time, body);
  if (e.boss) {
    // 深色轮廓：在泛光里把首领的剪影重新"切"出来
    bodyPath(ctx, e, id, time);
    ctx.strokeStyle = 'rgba(3,5,9,0.8)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  if (id === 'thornlord') {
    // 已经在 details 里画了双眼
  } else if (id === 'darkless') {
    // 无光者只剩一道惨白的裂口
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath();
    ctx.ellipse(e.x + Math.cos(e.angle) * r * 0.3, e.y + Math.sin(e.angle) * r * 0.3, r * 0.34, r * 0.1, e.angle, 0, TAU);
    ctx.fill();
  } else {
    eye(ctx, e.x, e.y, r, e.angle, e.hitFlash > 0 ? '#000' : '#fff', e.hitFlash > 0 ? '#fff' : 'rgba(10,10,20,0.85)');
  }

  if (e.slowTimer > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#9ad0ff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.18, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (e.burn > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ff7a2f';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.2, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (e.def.behavior === 'bomber' && e.stateTimer > 0) {
    const t = 1 - e.stateTimer / 1.1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(time * 22));
    ctx.strokeStyle = '#ff6a2f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 118 * (0.55 + 0.45 * t), 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (e.def.behavior === 'charge' && e.stateTimer > 0) {
    const t = 1 - e.stateTimer / 0.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + 0.5 * t;
    ctx.strokeStyle = '#ff5a86';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.angle) * 340, e.y + Math.sin(e.angle) * 340);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * (1.35 + t * 0.6), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  if (e.defId === 'beacon') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, 210, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (e.affix) {
    const aff = AFFIX_MAP[e.affix];
    if (aff) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = aff.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 8, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  if (e.boss && e.attackCd > 0 && e.attackCd < 0.6) {
    const t = 1 - e.attackCd / 0.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.4 * t;
    ctx.strokeStyle = '#ff5a6d';
    ctx.lineWidth = 3 + 3 * t;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * (1.2 + t * 1.6), 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (e.elite || e.boss) {
    const bw = e.boss ? 140 : 46;
    const y = e.y - r - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(e.x - bw / 2 - 1, y - 1, bw + 2, (e.boss ? 7 : 5) + 2);
    ctx.fillStyle = e.boss ? '#ff4d6d' : '#ffb14e';
    ctx.fillRect(e.x - bw / 2, y, bw * Math.max(0, e.hp / e.maxHp), e.boss ? 7 : 5);
  }

  if (spawnT < 1) ctx.restore();
}
