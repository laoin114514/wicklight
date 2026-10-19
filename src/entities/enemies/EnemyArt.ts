/**
 * 敌人美术：每种敌人有可辨识的剪影、朝向感与受灯光影响的明暗，
 * 让玩家在黑暗里也能一眼分辨威胁类型。
 */
import type { Enemy } from './Enemy';
import { AFFIX_MAP } from '../../data/affixes';
import { rayWalls } from '../../systems/CollisionSystem';
import type { Rect } from '../../systems/LevelGen';

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

function bossTelegraph(ctx: CanvasRenderingContext2D, e: Enemy, time: number, t: number): void {
  const r = e.radius;
  const color = e.defId === 'thornlord' ? '#a8e05f' : e.defId === 'extinguisher' ? '#b7a5ff' : e.defId === 'emberwake' ? '#ff8a3c' : '#9fa8ff';
  const count = e.defId === 'thornlord' ? 9 + e.phase * 3 : e.defId === 'extinguisher' ? 8 + e.phase * 3 : e.defId === 'nightfall' ? 13 + e.phase * 4 : 12 + e.phase * 4;
  const ring = r * (1.18 + t * 1.65);
  const spin = time * 0.55 + e.wobble * 0.16;
  const pulse = 0.5 + 0.5 * Math.sin(time * 22 + e.wobble);

  ctx.save();

  // 蓄力不是一圈静止的刻度：先在外环内侧压一层暗雾，把地面的亮光往里收，
  // 再用错速的细弧和向心丝线表现"空气正在被抽进首领身体"。
  const press = ctx.createRadialGradient(e.x, e.y, r * 0.78, e.x, e.y, ring * 1.08);
  press.addColorStop(0, 'rgba(2,3,8,0)');
  press.addColorStop(0.58, `rgba(2,3,8,${0.08 + t * 0.16})`);
  press.addColorStop(1, 'rgba(2,3,8,0)');
  ctx.fillStyle = press;
  ctx.beginPath();
  ctx.arc(e.x, e.y, ring * 1.08, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;

  ctx.globalAlpha = 0.2 + t * 0.3;
  ctx.lineWidth = 1.2 + t * 1.2;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 1.04, spin, spin + Math.PI * 1.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 1.04, spin + Math.PI, spin + Math.PI * 2.5);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.45 + t * 0.42;
  ctx.lineWidth = 2 + t * 2.6;
  ctx.beginPath();
  ctx.arc(e.x, e.y, ring, 0, TAU);
  ctx.stroke();

  const innerRing = r * (1.08 + t * 0.14);
  ctx.globalAlpha = 0.12 + t * 0.26;
  ctx.lineWidth = 0.9 + t * 0.7;
  ctx.setLineDash([2 + t * 2, 5 - t * 2]);
  ctx.lineDashOffset = -time * (10 + t * 8);
  ctx.beginPath();
  ctx.arc(e.x, e.y, innerRing, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  ctx.lineCap = 'round';
  for (const [dir, phase, span] of [[1, 0.12, 1.34], [-1, 2.28, 0.92]] as const) {
    ctx.globalAlpha = 0.12 + t * 0.2;
    ctx.lineWidth = 0.9 + t * 0.55;
    ctx.beginPath();
    ctx.arc(e.x, e.y, innerRing + r * 0.1, dir * time * (0.9 + t * 0.9) + phase, dir * time * (0.9 + t * 0.9) + phase + span);
    ctx.stroke();
  }

  // 向心丝线随蓄力伸长，外端贴在警示环内侧，内端逐渐逼近首领轮廓。
  ctx.globalAlpha = 0.14 + t * 0.28;
  ctx.lineWidth = 0.75 + t * 0.55;
  for (let i = 0; i < 6; i += 1) {
    const a = -spin * 1.9 + (i / 6) * TAU;
    const bend = 0.075 + (i % 2) * 0.035;
    const outer = ring - 2.5;
    const inner = innerRing + (1 - t) * r * (0.3 + (i % 3) * 0.05);
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(a + bend) * outer, e.y + Math.sin(a + bend) * outer);
    ctx.quadraticCurveTo(
      e.x + Math.cos(a + bend * 0.35) * (outer * 0.7 + inner * 0.3),
      e.y + Math.sin(a + bend * 0.35) * (outer * 0.7 + inner * 0.3),
      e.x + Math.cos(a) * inner,
      e.y + Math.sin(a) * inner,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 0.34 + t * 0.46;
  ctx.lineWidth = 1.3 + t * 0.8;
  for (let i = 0; i < count; i += 1) {
    const a = spin + (i / count) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const inner = ring + 2 + t * 2;
    const outer = ring + 7 + t * 9 + (i % 3) * 2;
    if (e.defId === 'thornlord') {
      const spread = 0.045;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a - spread) * inner, e.y + Math.sin(a - spread) * inner);
      ctx.lineTo(e.x + c * outer, e.y + s * outer);
      ctx.lineTo(e.x + Math.cos(a + spread) * inner, e.y + Math.sin(a + spread) * inner);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    } else if (e.defId === 'nightfall') {
      ctx.beginPath();
      ctx.arc(e.x + c * outer, e.y + s * outer, 1.5 + t * 1.4, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(e.x + c * inner, e.y + s * inner);
      ctx.lineTo(e.x + c * (outer - 2), e.y + s * (outer - 2));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(e.x + c * inner, e.y + s * inner);
      ctx.lineTo(e.x + c * outer, e.y + s * outer);
      ctx.stroke();
      if (e.defId === 'emberwake') {
        ctx.beginPath();
        ctx.arc(e.x + c * (outer + 2), e.y + s * (outer + 2), 1.3 + pulse * 1.2, 0, TAU);
        ctx.fillStyle = '#ffd08a';
        ctx.fill();
      }
    }
  }

  ctx.globalAlpha = 0.24 + t * 0.34;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const a = -spin * 1.4 + (i / 3) * TAU;
    ctx.moveTo(e.x + Math.cos(a) * r * 0.84, e.y + Math.sin(a) * r * 0.84);
    ctx.lineTo(e.x + Math.cos(a + 0.42) * r * 0.98, e.y + Math.sin(a + 0.42) * r * 0.98);
  }
  ctx.stroke();
  ctx.restore();
}

function spitterCharge(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  if (e.boss || e.def.behavior !== 'ranged' || e.attackCd > 0.68) return;
  const charge = Math.min(1, Math.max(0, 1 - Math.max(0, e.attackCd) / 0.68));
  const pulse = 0.5 + 0.5 * Math.sin(time * (10 + 7 * charge) + e.wobble * 1.7);
  const r = e.radius;
  const dirX = Math.cos(e.angle);
  const dirY = Math.sin(e.angle);
  const backX = e.x - dirX * r * 0.58;
  const backY = e.y - dirY * r * 0.58;
  const frontX = e.x + dirX * r * 0.9;
  const frontY = e.y + dirY * r * 0.9;
  const sacRadius = r * (0.28 + 0.38 * charge) * (0.92 + 0.16 * pulse);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.2 + 0.24 * charge;
  ctx.fillStyle = '#352046';
  ctx.beginPath();
  ctx.ellipse(backX, backY, sacRadius * 1.12, sacRadius * 0.82, e.angle, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(backX, backY, 0, backX, backY, sacRadius * 2.1);
  halo.addColorStop(0, `rgba(218,188,255,${0.14 + 0.22 * charge})`);
  halo.addColorStop(0.46, `rgba(153,101,218,${0.06 + 0.13 * charge})`);
  halo.addColorStop(1, 'rgba(91,52,149,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(backX, backY, sacRadius * 2.1, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 4; i += 1) {
    const angle = e.wobble + i * 1.9 + time * (1.05 + i * 0.13);
    const distance = sacRadius * (0.26 + 0.14 * (i % 2));
    ctx.globalAlpha = (0.18 + 0.3 * charge) * (0.58 + 0.42 * Math.sin(time * 3.7 + i * 1.6 + e.wobble));
    ctx.fillStyle = i % 2 === 0 ? '#e2caff' : '#b88bef';
    ctx.beginPath();
    ctx.arc(
      backX + Math.cos(angle) * distance,
      backY + Math.sin(angle) * distance * 0.78,
      0.7 + (0.4 + 0.55 * charge) * (i % 3) * 0.4,
      0,
      TAU,
    );
    ctx.fill();
  }

  const mouthRadius = r * (0.12 + 0.18 * charge) * (0.9 + 0.24 * pulse);
  const mouthGlow = ctx.createRadialGradient(frontX, frontY, 0, frontX, frontY, mouthRadius * 2.4);
  mouthGlow.addColorStop(0, `rgba(255,244,255,${0.24 + 0.42 * charge})`);
  mouthGlow.addColorStop(0.32, `rgba(211,170,255,${0.18 + 0.32 * charge})`);
  mouthGlow.addColorStop(1, 'rgba(120,64,190,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = mouthGlow;
  ctx.beginPath();
  ctx.arc(frontX, frontY, mouthRadius * 2.4, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.68 + 0.24 * charge;
  ctx.fillStyle = '#f3e4ff';
  ctx.beginPath();
  ctx.arc(frontX, frontY, mouthRadius * 0.74, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 0.2 + 0.36 * charge;
  ctx.strokeStyle = '#d9bcff';
  ctx.lineWidth = 1 + 0.55 * charge;
  ctx.beginPath();
  ctx.arc(frontX, frontY, mouthRadius * 2.2, e.angle + 0.58, e.angle + TAU - 0.58);
  ctx.stroke();

  const travelX = frontX - backX;
  const travelY = frontY - backY;
  for (let i = 0; i < 3; i += 1) {
    const travel = (time * (1.15 + i * 0.09) + i * 0.31 + e.wobble * 0.13) % 1;
    ctx.globalAlpha = (0.18 + 0.52 * charge) * Math.sin(Math.PI * travel);
    ctx.fillStyle = i === 1 ? '#fff0ff' : '#d8b6ff';
    ctx.beginPath();
    ctx.arc(backX + travelX * travel, backY + travelY * travel, r * (0.04 + 0.04 * charge), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
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
  const g = ctx.createRadialGradient(lx, ly, r * 0.04, e.x, e.y, r * 1.3);
  g.addColorStop(0, shade(body, 0.52));
  g.addColorStop(0.2, shade(body, 0.24));
  g.addColorStop(0.58, body);
  g.addColorStop(0.86, shade(body, -0.38));
  g.addColorStop(1, shade(body, -0.7));
  ctx.fillStyle = g;
  ctx.fill();

  // 身体不是一张平涂色块：底部压一圈暗面、迎光侧再补一层很薄的暖色反射，
  // 让圆形/多边形轮廓在近景里也能读出厚度。
  ctx.save();
  ctx.clip();
  const shadeG = ctx.createLinearGradient(e.x, e.y - r, e.x, e.y + r);
  shadeG.addColorStop(0, 'rgba(255,255,255,0)');
  shadeG.addColorStop(0.58, 'rgba(0,0,0,0)');
  shadeG.addColorStop(1, `rgba(1,3,8,${e.boss ? 0.42 : 0.32})`);
  ctx.fillStyle = shadeG;
  ctx.fillRect(e.x - r * 1.4, e.y - r * 1.4, r * 2.8, r * 2.8);

  const reach = Math.max(180, Math.hypot(dx, dy) + r);
  const bounce = ctx.createRadialGradient(px, py, 0, px, py, reach);
  bounce.addColorStop(0, 'rgba(255,214,158,0.15)');
  bounce.addColorStop(0.34, 'rgba(255,174,94,0.07)');
  bounce.addColorStop(1, 'rgba(255,145,60,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = bounce;
  ctx.fillRect(e.x - r * 1.5, e.y - r * 1.5, r * 3, r * 3);
  ctx.restore();
}

function rimStroke(ctx: CanvasRenderingContext2D, e: Enemy, w: number, px: number, py: number): void {
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const r = e.radius;

  // 外轮廓先压一道近黑，避免亮色怪物在暗幕里"漏光"。
  ctx.lineWidth = w + 0.8;
  ctx.strokeStyle = 'rgba(2,3,8,0.72)';
  ctx.stroke();

  // 轮廓光沿"玩家 → 怪物"的方向渐变：背光侧冷、暗，迎光侧有很薄的一线暖金。
  const glow = ctx.createLinearGradient(e.x - ux * r, e.y - uy * r, e.x + ux * r, e.y + uy * r);
  glow.addColorStop(0, 'rgba(92,111,158,0.12)');
  glow.addColorStop(0.58, 'rgba(210,222,255,0.17)');
  glow.addColorStop(0.9, 'rgba(255,205,142,0.46)');
  glow.addColorStop(1, 'rgba(255,239,201,0.68)');
  ctx.lineWidth = Math.max(1, w * 0.56);
  ctx.strokeStyle = e.hitFlash > 0 ? 'rgba(255,255,255,0.95)' : glow;
  ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, color: string, pupil: string): void {
  const ex = x + Math.cos(angle) * r * 0.38;
  const ey = y + Math.sin(angle) * r * 0.38;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(ex, ey, Math.max(3, r * 0.3), Math.max(2, r * 0.23), angle, 0, TAU);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(ex, ey, Math.max(2, r * 0.18), Math.max(1.8, r * 0.15), angle, 0, TAU);
  ctx.fill();
  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.ellipse(ex + Math.cos(angle) * r * 0.045, ey + Math.sin(angle) * r * 0.045, Math.max(1, r * 0.075), Math.max(1.2, r * 0.105), angle, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.beginPath();
  ctx.arc(ex - Math.sin(angle) * r * 0.05, ey + Math.cos(angle) * r * 0.05, Math.max(0.65, r * 0.028), 0, TAU);
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
  const r = e.radius;
  ctx.save();
  ctx.translate(e.x + r * 0.04, e.y + r * 0.82);
  ctx.scale(1, 0.4);
  const soft = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r * 1.34);
  soft.addColorStop(0, 'rgba(1,2,6,0.56)');
  soft.addColorStop(0.48, 'rgba(1,2,6,0.38)');
  soft.addColorStop(0.82, 'rgba(1,2,6,0.12)');
  soft.addColorStop(1, 'rgba(1,2,6,0)');
  ctx.fillStyle = soft;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.34, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,1,4,0.46)';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.03, r * 0.68, r * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * 精英的「在场感」：一圈随呼吸明灭的薄光，外面巡游四枚菱形刻点。
 * 精英本来就比杂兵大一圈，但黑暗里只剩剪影时，尺寸差异会先被灯光吃掉；
 * 这层光不提高亮度，只是让轮廓先被看见——有词缀时直接借词缀的颜色。
 */
function eliteHalo(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const r = e.radius;
  const aff = e.affix ? AFFIX_MAP[e.affix] : null;
  const color = aff?.color ?? '#ffcf8a';
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + e.wobble);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const halo = ctx.createRadialGradient(e.x, e.y, r * 0.72, e.x, e.y, r * 1.56);
  halo.addColorStop(0, rgba(color, 0));
  halo.addColorStop(0.62, rgba(color, 0.05 + pulse * 0.035));
  halo.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 1.56, 0, TAU);
  ctx.fill();

  const spin = time * 0.18 + e.wobble * 0.2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.globalAlpha = 0.2 + pulse * 0.12;
  ctx.setLineDash([2, 9]);
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 1.22, spin, spin + Math.PI * 1.38);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 1.22, spin + Math.PI, spin + Math.PI * 2.38);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  for (let i = 0; i < 4; i += 1) {
    const a = spin * 1.3 + (i / 4) * TAU;
    const x = e.x + Math.cos(a) * r * 1.22;
    const y = e.y + Math.sin(a) * r * 1.22;
    const s = 1.8 + (i % 2) * 0.9;
    ctx.globalAlpha = 0.28 + pulse * 0.24;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.72, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.72, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 词缀纹章：三段反向旋转的细弧，外面三枚菱刻。
 * 原来只是一圈虚线，和减速 / 标灯那些状态环混在一起；改成印记之后，
 * 「这只怪带着词缀」和「这只怪此刻中了什么状态」能分开读。
 */
function affixSigil(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const aff = e.affix ? AFFIX_MAP[e.affix] : null;
  if (!aff) return;
  const r = e.radius;
  const spin = time * 0.4 + e.wobble * 0.35;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3 + e.wobble);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = aff.color;
  ctx.fillStyle = aff.color;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.4 + pulse * 0.18;
  for (let i = 0; i < 3; i += 1) {
    const a = spin + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 7, a, a + 0.4);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i += 1) {
    const a = -spin * 0.9 + (i / 3) * TAU + 0.5;
    const x = e.x + Math.cos(a) * (r + 7);
    const y = e.y + Math.sin(a) * (r + 7);
    const s = 2.4 + pulse * 0.5;
    ctx.globalAlpha = 0.55 + pulse * 0.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.72, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.72, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** 朝向灯火的湿润高光与细碎材质反光。只裁在身体里，不改剪影。 */
function bodySheen(ctx: CanvasRenderingContext2D, e: Enemy, id: string, time: number, body: string): void {
  const r = e.radius;
  ctx.save();
  bodyPath(ctx, e, id, time);
  ctx.clip();
  const sx = e.x - r * 0.3 + Math.cos(e.wobble) * r * 0.08;
  const sy = e.y - r * 0.34;
  const sheen = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.95);
  sheen.addColorStop(0, 'rgba(255,255,255,0.2)');
  sheen.addColorStop(0.24, 'rgba(255,246,224,0.1)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sheen;
  ctx.fillRect(e.x - r * 1.4, e.y - r * 1.4, r * 2.8, r * 2.8);

  const flecks = e.boss ? 7 : e.elite ? 5 : 2;
  for (let i = 0; i < flecks; i += 1) {
    const a = e.wobble * 0.32 + i * 2.399;
    const rr = r * (0.26 + ((i * 37) % 23) / 52);
    const px = e.x + Math.cos(a) * rr;
    const py = e.y + Math.sin(a) * rr * 0.78;
    const glint = 0.08 + 0.1 * (0.5 + Math.sin(time * 2.2 + i * 1.7) * 0.5);
    ctx.fillStyle = i % 3 === 0 ? rgba(body, glint * 1.6) : `rgba(255,244,217,${glint})`;
    ctx.beginPath();
    ctx.ellipse(px, py, Math.max(0.7, r * 0.035), Math.max(1, r * 0.07), a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
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
    case 'skitter': {
      // 细长的梭形：一眼看出"很快、很脆"
      const ca = Math.cos(e.angle);
      const sa = Math.sin(e.angle);
      ctx.beginPath();
      ctx.moveTo(e.x + ca * r * 1.5, e.y + sa * r * 1.5);
      ctx.lineTo(e.x - sa * r * 0.62, e.y + ca * r * 0.62);
      ctx.lineTo(e.x - ca * r * 0.9, e.y - sa * r * 0.9);
      ctx.lineTo(e.x + sa * r * 0.62, e.y - ca * r * 0.62);
      ctx.closePath();
      break;
    }
    case 'echo': {
      // 空心环：借用非零填充规则挖掉一侧，做成"回音"般的月牙
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.arc(e.x + Math.cos(e.angle) * r * 0.44, e.y + Math.sin(e.angle) * r * 0.44, r * 0.7, 0, TAU, true);
      break;
    }
    case 'weaver':
      blob(ctx, e.x, e.y, r, 11, 0.07, wob * 0.5);
      break;
    case 'siphon':
      // 六棱提灯：和「引灯」的梯形区分开，是"吊着你灯火"的那类东西
      poly(ctx, e.x, e.y, r, 6, Math.PI / 6 + wob * 0.05, 1.06);
      break;
    case 'snuffer': {
      // 兜帽 + 向后拖的破布：不是又一个圆，而是"专程来掐灯"的瘦长剪影。
      const ca = Math.cos(e.angle);
      const sa = Math.sin(e.angle);
      const nx = -sa;
      const ny = ca;
      ctx.beginPath();
      ctx.moveTo(e.x - ca * r * 1.08 + nx * r * 0.12, e.y - sa * r * 1.08 + ny * r * 0.12);
      ctx.quadraticCurveTo(e.x + nx * r * 0.92, e.y + ny * r * 0.92, e.x + ca * r * 0.72, e.y + sa * r * 0.72);
      ctx.quadraticCurveTo(e.x + ca * r * 0.92, e.y + sa * r * 0.92, e.x + ca * r * 0.9 - nx * r * 0.3, e.y + sa * r * 0.9 - ny * r * 0.3);
      ctx.quadraticCurveTo(e.x - nx * r * 0.82 - ca * r * 0.34, e.y - ny * r * 0.82 - sa * r * 0.34, e.x - ca * r * 1.08 + nx * r * 0.12, e.y - sa * r * 1.08 + ny * r * 0.12);
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
    case 'nightfall': {
      // 蚀缺的月：一整轮黑月被咬掉一块，和「回响」的小月牙同源但压得更重
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.arc(e.x + r * 0.34, e.y - r * 0.18, r * 0.88, 0, TAU, true);
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
    case 'nightfall': {
      const breath = 0.5 + Math.sin(time * 1.3 + w) * 0.5;

      // 月面上留几块被夜色浸透的月海，以及被擦掉一半的环形山。
      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const maria: Array<[number, number, number, number, number]> = [
        [-0.46, -0.2, 0.23, 0.16, -0.38],
        [-0.22, -0.47, 0.17, 0.11, 0.32],
        [-0.38, 0.34, 0.19, 0.13, 0.66],
      ];
      for (const [mx, my, rx, ry, angle] of maria) {
        ctx.fillStyle = 'rgba(20,14,55,0.22)';
        ctx.beginPath();
        ctx.ellipse(e.x + mx * r, e.y + my * r, rx * r, ry * r, angle, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,177,242,0.09)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      const craters: Array<[number, number, number]> = [
        [-0.43, -0.08, 0.095],
        [-0.25, -0.37, 0.062],
        [-0.54, 0.23, 0.07],
        [-0.2, 0.27, 0.052],
        [-0.5, -0.44, 0.045],
      ];
      for (const [cx, cy, rad] of craters) {
        const px = e.x + cx * r;
        const py = e.y + cy * r;
        const rr = rad * r;
        ctx.fillStyle = 'rgba(15,11,43,0.3)';
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(210,200,255,0.2)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.arc(px, py, rr, Math.PI * 0.68, Math.PI * 1.46);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(8,5,25,0.36)';
        ctx.beginPath();
        ctx.arc(px + rr * 0.06, py + rr * 0.05, rr * 0.92, Math.PI * 1.62, Math.PI * 0.48);
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(196,182,247,${0.12 + breath * 0.05})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.62, e.y - r * 0.7);
      ctx.quadraticCurveTo(e.x - r * 0.5, e.y - r * 0.48, e.x - r * 0.58, e.y - r * 0.27);
      ctx.stroke();
      ctx.restore();

      // 被啃掉的那一口也有一条冷边：不只是空白，而是夜蚀过的断面。
      ctx.save();
      ctx.strokeStyle = 'rgba(8,5,24,0.48)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(e.x + r * 0.34, e.y - r * 0.18, r * 0.88, Math.PI * 0.56, Math.PI * 1.44);
      ctx.stroke();
      ctx.strokeStyle = `rgba(218,207,255,${0.18 + breath * 0.07})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x + r * 0.34, e.y - r * 0.18, r * 0.88, Math.PI * 0.58, Math.PI * 1.42);
      ctx.stroke();
      ctx.restore();

      // 环月的星屑：缓慢绕着本体转，让它看起来"正在笼罩这片地方"
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#e8dcff';
      for (let i = 0; i < 5; i += 1) {
        const a = time * 0.45 + (i / 5) * TAU;
        const rr = r * (1.35 + Math.sin(time * 1.4 + i) * 0.12);
        ctx.globalAlpha = 0.5 + Math.sin(time * 2 + i) * 0.25;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 2.6 + Math.sin(time * 3 + i) * 0.9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.32;
      const ng = ctx.createRadialGradient(e.x, e.y, r * 0.4, e.x, e.y, r * 1.9);
      ng.addColorStop(0, 'rgba(150,130,230,0.55)');
      ng.addColorStop(1, 'rgba(90,75,181,0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.9, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'moth': {
      const flap = 0.55 + Math.abs(Math.sin(time * 11 + w)) * 0.5;
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 1.55);
      halo.addColorStop(0, 'rgba(255,244,199,0.12)');
      halo.addColorStop(0.5, 'rgba(255,226,146,0.05)');
      halo.addColorStop(1, 'rgba(255,208,104,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.55, 0, TAU);
      ctx.fill();
      ctx.restore();

      for (const side of [-1, 1]) {
        const wingAngle = e.angle + side * 1.5;
        const centerX = e.x + Math.cos(wingAngle) * r * 0.5;
        const centerY = e.y + Math.sin(wingAngle) * r * 0.5;
        const veinAngle = e.angle + side * 0.6;
        const rx = r * 1.15 * flap;
        const ry = r * 0.62;

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx, ry, veinAngle, 0, TAU);
        ctx.fillStyle = rgba('#f7e7bb', 0.31);
        ctx.fill();
        ctx.strokeStyle = rgba('#e2bd72', 0.55);
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,248,220,0.08)';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx * 0.72, ry * 0.62, veinAngle, 0, TAU);
        ctx.fill();

        const rootX = e.x + Math.cos(e.angle + side * 0.42) * r * 0.18;
        const rootY = e.y + Math.sin(e.angle + side * 0.42) * r * 0.18;
        const veinX = Math.cos(veinAngle);
        const veinY = Math.sin(veinAngle);
        ctx.strokeStyle = 'rgba(64,44,16,0.45)';
        ctx.lineWidth = 1.1;
        for (let vein = 0; vein < 3; vein += 1) {
          const across = (vein - 1) * r * 0.22;
          const reach = rx * (0.56 + vein * 0.08);
          const tipX = centerX + veinX * reach - veinY * across;
          const tipY = centerY + veinY * reach + veinX * across;
          const ctrlX = centerX + veinX * rx * 0.18 - veinY * across * 0.4;
          const ctrlY = centerY + veinY * rx * 0.18 + veinX * across * 0.4;
          ctx.beginPath();
          ctx.moveTo(rootX, rootY);
          ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
          ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255,247,218,0.28)';
        for (let spot = 0; spot < 2; spot += 1) {
          const along = rx * (0.34 + spot * 0.22);
          const across = (spot === 0 ? -1 : 1) * r * 0.17;
          ctx.beginPath();
          ctx.arc(centerX + veinX * along - veinY * across, centerY + veinY * along + veinX * across, r * 0.08, 0, TAU);
          ctx.fill();
        }
      }

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      ctx.strokeStyle = 'rgba(92,68,32,0.4)';
      ctx.lineWidth = 1;
      for (let band = 0; band < 3; band += 1) {
        const back = r * (0.08 + band * 0.2);
        const half = r * (0.38 - band * 0.045);
        const centerX = e.x - facingX * back;
        const centerY = e.y - facingY * back;
        ctx.beginPath();
        ctx.moveTo(centerX + sideX * half, centerY + sideY * half);
        ctx.quadraticCurveTo(centerX - facingX * r * 0.07, centerY - facingY * r * 0.07, centerX - sideX * half, centerY - sideY * half);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,231,178,0.42)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const sway = Math.sin(time * 4.6 + w + side * 0.9) * r * 0.05;
        const startX = e.x + facingX * r * 0.56 + sideX * side * r * 0.08;
        const startY = e.y + facingY * r * 0.56 + sideY * side * r * 0.08;
        const tipX = startX + facingX * r * 0.78 + sideX * side * (r * 0.42 + sway);
        const tipY = startY + facingY * r * 0.78 + sideY * side * (r * 0.42 + sway);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(startX + facingX * r * 0.34 + sideX * side * r * 0.04, startY + facingY * r * 0.34 + sideY * side * r * 0.04, tipX, tipY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,244,207,0.46)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, Math.max(0.55, r * 0.045), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'lancer': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;
      const charging = e.stateTimer > 0;
      const charge = charging ? Math.max(0, Math.min(1, 1 - e.stateTimer / 0.6)) : 0;
      const pulse = 0.5 + 0.5 * Math.sin(time * 20 + w);

      if (e.dashing > 0) {
        const trailLength = Math.hypot(e.dashVx, e.dashVy);
        if (trailLength > 1) {
          const backX = -e.dashVx / trailLength;
          const backY = -e.dashVy / trailLength;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (let streak = 0; streak < 3; streak += 1) {
            const offset = (streak - 1) * r * 0.28;
            ctx.strokeStyle = rgba('#ff6f9b', 0.22 - streak * 0.045);
            ctx.lineWidth = 2.1 - streak * 0.45;
            ctx.beginPath();
            ctx.moveTo(e.x + backX * r * 0.65 - sideX * offset, e.y + backY * r * 0.65 - sideY * offset);
            ctx.lineTo(e.x + backX * r * (1.65 + streak * 0.28) - sideX * offset, e.y + backY * r * (1.65 + streak * 0.28) - sideY * offset);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,225,237,0.13)';
      ctx.beginPath();
      ctx.moveTo(e.x + facingX * r * 1.04, e.y + facingY * r * 1.04);
      ctx.lineTo(e.x + sideX * r * 0.62 - facingX * r * 0.45, e.y + sideY * r * 0.62 - facingY * r * 0.45);
      ctx.lineTo(e.x - facingX * r * 0.08, e.y - facingY * r * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(55,8,32,0.2)';
      ctx.beginPath();
      ctx.moveTo(e.x + facingX * r * 1.04, e.y + facingY * r * 1.04);
      ctx.lineTo(e.x - sideX * r * 0.62 - facingX * r * 0.45, e.y - sideY * r * 0.62 - facingY * r * 0.45);
      ctx.lineTo(e.x - facingX * r * 0.08, e.y - facingY * r * 0.08);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(58,9,34,0.46)';
      ctx.lineWidth = 1.1;
      for (let band = 0; band < 2; band += 1) {
        const back = r * (0.34 + band * 0.24);
        const half = r * (0.44 - band * 0.07);
        const centerX = e.x - facingX * back;
        const centerY = e.y - facingY * back;
        ctx.beginPath();
        ctx.moveTo(centerX + sideX * half, centerY + sideY * half);
        ctx.lineTo(centerX - facingX * r * 0.09, centerY - facingY * r * 0.09);
        ctx.lineTo(centerX - sideX * half, centerY - sideY * half);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,230,239,0.36)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(e.x + facingX * r * 1.02, e.y + facingY * r * 1.02);
      ctx.lineTo(e.x + facingX * r * 0.22, e.y + facingY * r * 0.22);
      ctx.lineTo(e.x - facingX * r * 0.42, e.y - facingY * r * 0.42);
      ctx.stroke();
      ctx.restore();

      for (const side of [-1, 1]) {
        const pitX = e.x + Math.cos(e.angle + side * 2.3) * r * 0.62;
        const pitY = e.y + Math.sin(e.angle + side * 2.3) * r * 0.62;
        ctx.fillStyle = shade(body, -0.36);
        ctx.beginPath();
        ctx.arc(pitX, pitY, r * 0.24, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,195,217,0.34)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        if (charging) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,142,178,${0.22 + 0.42 * charge * pulse})`;
          ctx.beginPath();
          ctx.arc(pitX, pitY, r * (0.1 + charge * 0.08), 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      if (charging) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const coreX = e.x - facingX * r * 0.12;
        const coreY = e.y - facingY * r * 0.12;
        const core = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, r * (0.46 + charge * 0.38));
        core.addColorStop(0, `rgba(255,234,242,${0.25 + charge * 0.34})`);
        core.addColorStop(0.28, `rgba(255,101,150,${0.18 + charge * 0.34})`);
        core.addColorStop(1, 'rgba(164,28,82,0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(coreX, coreY, r * (0.46 + charge * 0.38), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,139,177,${0.2 + 0.36 * charge})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(coreX, coreY, r * (0.3 + charge * 0.2), e.angle + 0.65, e.angle + TAU - 0.65);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'beacon': {
      const bob = Math.sin(e.wobble * 0.9) * r * 0.06;
      const flicker = 0.72 + Math.sin(time * 7 + w) * 0.28;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(e.x, e.y + bob, 0, e.x, e.y + bob, r * 1.55 * flicker);
      g.addColorStop(0, 'rgba(255,247,216,0.95)');
      g.addColorStop(0.42, rgba('#ffd77a', 0.5));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y + bob, r * 1.55 * flicker, 0, TAU);
      ctx.fill();

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
      const glass = ctx.createLinearGradient(e.x - r * 0.4, e.y - r * 0.5, e.x + r * 0.36, e.y + r * 0.62);
      glass.addColorStop(0, 'rgba(255,250,221,0.2)');
      glass.addColorStop(0.46, 'rgba(255,211,112,0.06)');
      glass.addColorStop(1, 'rgba(72,42,8,0.17)');
      ctx.fillStyle = glass;
      ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
      ctx.fillStyle = 'rgba(27,18,8,0.34)';
      ctx.fillRect(e.x - r * 0.78, e.y - r * 0.46 + bob, r * 1.56, r * 1.16);

      ctx.globalCompositeOperation = 'lighter';
      const flameGlow = ctx.createRadialGradient(e.x, e.y - r * 0.06 + bob, 0, e.x, e.y - r * 0.06 + bob, r * 0.58);
      flameGlow.addColorStop(0, `rgba(255,255,232,${0.34 + flicker * 0.26})`);
      flameGlow.addColorStop(0.45, `rgba(255,205,92,${0.16 + flicker * 0.22})`);
      flameGlow.addColorStop(1, 'rgba(255,168,54,0)');
      ctx.fillStyle = flameGlow;
      ctx.beginPath();
      ctx.arc(e.x, e.y - r * 0.06 + bob, r * 0.58, 0, TAU);
      ctx.fill();

      const flameTipY = e.y - r * (0.3 + flicker * 0.13) + bob;
      const flameBaseY = e.y + r * 0.18 + bob;
      ctx.fillStyle = 'rgba(255,143,40,0.66)';
      ctx.beginPath();
      ctx.moveTo(e.x, flameBaseY);
      ctx.bezierCurveTo(e.x - r * 0.32, e.y + r * 0.04 + bob, e.x - r * 0.22, e.y - r * 0.2 + bob, e.x, flameTipY);
      ctx.bezierCurveTo(e.x + r * 0.22, e.y - r * 0.2 + bob, e.x + r * 0.32, e.y + r * 0.04 + bob, e.x, flameBaseY);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,249,205,0.92)';
      ctx.beginPath();
      ctx.moveTo(e.x, flameBaseY - r * 0.14);
      ctx.quadraticCurveTo(e.x - r * 0.13, e.y - r * 0.04 + bob, e.x, e.y - r * 0.24 + bob);
      ctx.quadraticCurveTo(e.x + r * 0.13, e.y - r * 0.04 + bob, e.x, flameBaseY - r * 0.14);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,223,135,0.5)';
      for (let mote = 0; mote < 3; mote += 1) {
        const rise = (time * 0.9 + mote * 0.31 + w * 0.08) % 1;
        const mx = e.x + Math.sin(time * 2.8 + mote * 2.4 + w) * r * 0.3;
        const my = e.y + r * 0.14 - rise * r * 0.52 + bob;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(0.5, r * (0.028 + (1 - rise) * 0.025)), 0, TAU);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(44,33,13,0.82)';
      ctx.lineWidth = 1.7;
      for (const rail of [-0.55, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(e.x + r * rail, e.y - r * 0.55 + bob);
        ctx.lineTo(e.x + r * (rail * 0.87), e.y + r * 0.72 + bob);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(56,41,16,0.8)';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.79, e.y - r * 0.48 + bob);
      ctx.lineTo(e.x + r * 0.79, e.y - r * 0.48 + bob);
      ctx.moveTo(e.x - r * 0.64, e.y + r * 0.64 + bob);
      ctx.lineTo(e.x + r * 0.64, e.y + r * 0.64 + bob);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,172,0.24)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.75, e.y - r * 0.51 + bob);
      ctx.lineTo(e.x + r * 0.75, e.y - r * 0.51 + bob);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,249,224,0.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.58, e.y + r * 0.42 + bob);
      ctx.lineTo(e.x - r * 0.18, e.y - r * 0.34 + bob);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = 'rgba(38,30,14,0.85)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(e.x, e.y - r * 0.6 + bob, r * 0.44, Math.PI, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,222,134,0.28)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(e.x, e.y - r * 0.6 + bob, r * 0.44, Math.PI + 0.22, TAU - 0.22);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,222,134,0.32)';
      ctx.beginPath();
      ctx.arc(e.x, e.y - r * 1.04 + bob, Math.max(0.8, r * 0.07), 0, TAU);
      ctx.fill();
      break;
    }
    case 'skitter': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;
      const speed = Math.hypot(e.vx, e.vy);

      if (speed > 1) {
        const backX = -e.vx / speed;
        const backY = -e.vy / speed;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let ghost = 0; ghost < 2; ghost += 1) {
          const distance = r * (0.82 + ghost * 0.72);
          const scale = 1 - ghost * 0.16;
          const cx = e.x + backX * distance;
          const cy = e.y + backY * distance;
          ctx.fillStyle = rgba('#7be0ff', 0.1 - ghost * 0.038);
          ctx.beginPath();
          ctx.moveTo(cx + facingX * r * 1.5 * scale, cy + facingY * r * 1.5 * scale);
          ctx.lineTo(cx + sideX * r * 0.62 * scale, cy + sideY * r * 0.62 * scale);
          ctx.lineTo(cx - facingX * r * 0.9 * scale, cy - facingY * r * 0.9 * scale);
          ctx.lineTo(cx - sideX * r * 0.62 * scale, cy - sideY * r * 0.62 * scale);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const tipX = e.x + facingX * r * 1.42;
      const tipY = e.y + facingY * r * 1.42;
      const rearX = e.x - facingX * r * 0.82;
      const rearY = e.y - facingY * r * 0.82;
      ctx.fillStyle = 'rgba(205,249,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(e.x - sideX * r * 0.72, e.y - sideY * r * 0.72);
      ctx.lineTo(rearX, rearY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(8,76,103,0.24)';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(e.x + sideX * r * 0.72, e.y + sideY * r * 0.72);
      ctx.lineTo(rearX, rearY);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(191,247,255,0.42)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(rearX, rearY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#7be0ff', 0.45);
      ctx.lineCap = 'round';
      for (let streak = 0; streak < 3; streak += 1) {
        const side = (streak - 1) * r * 0.34;
        const sway = Math.sin(time * 8 + w + streak * 1.9) * 2.2;
        ctx.strokeStyle = rgba('#7be0ff', 0.42 - streak * 0.07);
        ctx.lineWidth = 1.75 - streak * 0.28;
        ctx.beginPath();
        ctx.moveTo(e.x - facingX * r * 0.9 + sideX * side, e.y - facingY * r * 0.9 + sideY * side);
        ctx.lineTo(
          e.x - facingX * (r * 0.9 + 16 + streak * 5) + sideX * (side + sway),
          e.y - facingY * (r * 0.9 + 16 + streak * 5) + sideY * (side + sway),
        );
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'echo': {
      // 逐层散开的回音环：它追的是"过去的你"，所以轮廓本身就带着时间差
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const speed = Math.hypot(e.vx, e.vy);
      if (speed > 1) {
        const backX = -e.vx / speed;
        const backY = -e.vy / speed;
        for (let ghost = 1; ghost <= 2; ghost += 1) {
          const cx = e.x + backX * r * (0.5 + ghost * 0.44);
          const cy = e.y + backY * r * (0.5 + ghost * 0.44);
          const scale = 1 - ghost * 0.09;
          ctx.fillStyle = `rgba(159,216,255,${0.095 - ghost * 0.033})`;
          ctx.beginPath();
          ctx.arc(cx, cy, r * scale, 0, TAU);
          ctx.arc(
            cx + Math.cos(e.angle) * r * 0.44 * scale,
            cy + Math.sin(e.angle) * r * 0.44 * scale,
            r * 0.7 * scale,
            0,
            TAU,
            true,
          );
          ctx.fill();
        }
      }

      ctx.strokeStyle = '#9fd8ff';
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i += 1) {
        ctx.globalAlpha = (0.26 - i * 0.06) * (0.7 + Math.sin(time * 3 + w - i) * 0.3);
        ctx.setLineDash(i > 1 ? [3 + i * 1.5, 6 + i * 2] : []);
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * (1 + i * 0.42), 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(190,230,255,0.2)';
      ctx.lineWidth = 0.8;
      const tickRot = time * 0.16 + w * 0.04;
      ctx.beginPath();
      for (let tick = 0; tick < 12; tick += 1) {
        const angle = tickRot + (tick / 12) * TAU;
        const inner = r * 1.22;
        const outer = inner + (tick % 3 === 0 ? r * 0.16 : r * 0.08);
        ctx.moveTo(e.x + Math.cos(angle) * inner, e.y + Math.sin(angle) * inner);
        ctx.lineTo(e.x + Math.cos(angle) * outer, e.y + Math.sin(angle) * outer);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.36;
      ctx.strokeStyle = 'rgba(226,246,255,0.72)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.9, e.angle + Math.PI * 0.64, e.angle + Math.PI * 1.56);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'weaver': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;
      const webRot = w * 0.16 + Math.sin(time * 0.7 + w) * 0.08;
      const webRadius = r * (1.76 + Math.sin(time * 1.3 + w) * 0.035);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(207,231,243,0.14)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = webRot + (spoke / 8) * TAU;
        ctx.moveTo(e.x + Math.cos(angle) * r * 1.08, e.y + Math.sin(angle) * r * 1.08);
        ctx.lineTo(e.x + Math.cos(angle) * webRadius, e.y + Math.sin(angle) * webRadius);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(216,238,248,0.17)';
      for (let ring = 0; ring < 2; ring += 1) {
        const radius = r * (1.34 + ring * 0.35);
        ctx.beginPath();
        for (let spoke = 0; spoke <= 8; spoke += 1) {
          const angle = webRot + (spoke / 8) * TAU;
          const px = e.x + Math.cos(angle) * radius;
          const py = e.y + Math.sin(angle) * radius;
          if (spoke === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(229,247,255,0.34)';
      for (let bead = 0; bead < 4; bead += 1) {
        const angle = webRot + (bead / 4) * TAU + 0.18;
        const radius = r * (bead % 2 === 0 ? 1.34 : 1.69);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(angle) * radius, e.y + Math.sin(angle) * radius, Math.max(0.5, r * 0.04), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let leg = 0; leg < 2; leg += 1) {
          const along = leg === 0 ? -r * 0.2 : r * 0.16;
          const rootX = e.x + facingX * along + sideX * side * r * 0.56;
          const rootY = e.y + facingY * along + sideY * side * r * 0.56;
          const jointX = rootX + sideX * side * r * 0.43 - facingX * r * (leg === 0 ? 0.18 : 0.08);
          const jointY = rootY + sideY * side * r * 0.43 - facingY * r * (leg === 0 ? 0.18 : 0.08);
          const footX = jointX + sideX * side * r * 0.28 - facingX * r * 0.48;
          const footY = jointY + sideY * side * r * 0.28 - facingY * r * 0.48;
          ctx.strokeStyle = 'rgba(46,62,73,0.56)';
          ctx.lineWidth = 1.65;
          ctx.beginPath();
          ctx.moveTo(rootX, rootY);
          ctx.quadraticCurveTo(jointX, jointY, footX, footY);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(225,242,250,0.32)';
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }
      ctx.restore();

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      ctx.strokeStyle = 'rgba(228,242,249,0.24)';
      ctx.lineWidth = 0.9;
      for (let band = 0; band < 2; band += 1) {
        const back = r * (0.18 + band * 0.28);
        const half = r * (0.58 - band * 0.09);
        const centerX = e.x - facingX * back;
        const centerY = e.y - facingY * back;
        ctx.beginPath();
        ctx.moveTo(centerX + sideX * half, centerY + sideY * half);
        ctx.quadraticCurveTo(centerX - facingX * r * 0.08, centerY - facingY * r * 0.08, centerX - sideX * half, centerY - sideY * half);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 + Math.sin(time * 2.4 + w) * 0.05;
      const wg = ctx.createRadialGradient(e.x, e.y, r * 0.3, e.x, e.y, r * 1.9);
      wg.addColorStop(0, 'rgba(159,183,201,0.5)');
      wg.addColorStop(1, 'rgba(159,183,201,0)');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.9, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'siphon': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const backX = -facingX;
      const backY = -facingY;
      const sideX = -facingY;
      const sideY = facingX;
      const spin = Math.PI / 6 + w * 0.05;
      const pull = 0.4 + Math.sin(time * 5 + w) * 0.22;

      // 暗玻璃罩住被夺来的火，六根灯框再从中心向外撑住剪影。
      ctx.fillStyle = 'rgba(19,8,30,0.44)';
      poly(ctx, e.x, e.y, r * 0.64, 6, spin, 1.06);
      ctx.fill();

      // 空芯里的"被抽走的火"：越亮说明它抽得越起劲
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 0.78);
      sg.addColorStop(0, `rgba(255,243,209,${0.58 * pull})`);
      sg.addColorStop(0.34, `rgba(223,174,255,${0.4 * pull})`);
      sg.addColorStop(1, 'rgba(164,95,214,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.78, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(20,10,30,0.8)';
      ctx.lineWidth = 2.4;
      poly(ctx, e.x, e.y, r * 0.64, 6, spin, 1.06);
      ctx.stroke();

      // 六根铜紫灯骨：深框 + 内侧冷光，近景能读出灯的结构。
      for (let rib = 0; rib < 6; rib += 1) {
        const a = spin + (rib / 6) * TAU;
        const innerX = e.x + Math.cos(a) * r * 0.6;
        const innerY = e.y + Math.sin(a) * r * 0.6;
        const outerX = e.x + Math.cos(a) * r * 0.9;
        const outerY = e.y + Math.sin(a) * r * 0.9;
        ctx.strokeStyle = 'rgba(24,12,36,0.72)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(innerX, innerY);
        ctx.lineTo(outerX, outerY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(249,225,255,0.28)';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(innerX - sideX * r * 0.025, innerY - sideY * r * 0.025);
        ctx.lineTo(outerX - sideX * r * 0.025, outerY - sideY * r * 0.025);
        ctx.stroke();

        ctx.fillStyle = 'rgba(27,13,41,0.86)';
        ctx.beginPath();
        ctx.arc(outerX, outerY, Math.max(1.2, r * 0.065), 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(249,224,255,0.44)';
        ctx.beginPath();
        ctx.arc(outerX - sideX * r * 0.015, outerY - sideY * r * 0.015, Math.max(0.55, r * 0.024), 0, TAU);
        ctx.fill();
      }

      // 侧后拖出的短链：让“提灯”不只靠六边形，也有悬挂物的重量。
      const chainX = backX * 0.5 + sideX * 0.86;
      const chainY = backY * 0.5 + sideY * 0.86;
      const chainAngle = Math.atan2(chainY, chainX);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(201,143,232,0.18)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(e.x + chainX * r * 0.86, e.y + chainY * r * 0.86);
      ctx.lineTo(e.x + chainX * r * 1.92, e.y + chainY * r * 1.92);
      ctx.stroke();
      for (let link = 0; link < 4; link += 1) {
        const distance = r * (0.98 + link * 0.22);
        const cx = e.x + chainX * distance;
        const cy = e.y + chainY * distance;
        const sway = Math.sin(time * 1.7 + w + link * 0.7) * r * 0.025;
        ctx.save();
        ctx.translate(cx - sideX * sway, cy - sideY * sway);
        ctx.rotate(chainAngle + (link % 2 === 0 ? 0 : Math.PI / 2));
        ctx.strokeStyle = 'rgba(24,12,36,0.78)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.16, r * 0.09, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(201,143,232,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(249,225,255,0.38)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(-r * 0.018, -r * 0.014, r * 0.13, r * 0.062, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(201,143,232,0.34)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(
        e.x + chainX * r * 1.95 - sideX * r * 0.06,
        e.y + chainY * r * 1.95 - sideY * r * 0.06,
        r * 0.1,
        chainAngle - Math.PI * 0.8,
        chainAngle + Math.PI * 0.45,
      );
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'crawler': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;
      const rushing = e.dashing > 0;
      const trailX = rushing ? e.dashVx : e.vx;
      const trailY = rushing ? e.dashVy : e.vy;
      const trailLength = Math.hypot(trailX, trailY);

      if (rushing && trailLength > 1) {
        const backX = -trailX / trailLength;
        const backY = -trailY / trailLength;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let streak = 0; streak < 3; streak += 1) {
          const offset = (streak - 1) * r * 0.32;
          const start = r * (0.82 + streak * 0.12);
          const sway = Math.sin(time * 9 + w + streak * 2.1) * r * 0.1;
          ctx.strokeStyle = rgba(body, 0.2 - streak * 0.045);
          ctx.lineWidth = 1.25 - streak * 0.2;
          ctx.beginPath();
          ctx.moveTo(e.x + backX * start - sideX * offset, e.y + backY * start - sideY * offset);
          ctx.lineTo(
            e.x + backX * (start + r * (0.72 + streak * 0.18)) - sideX * (offset + sway),
            e.y + backY * (start + r * (0.72 + streak * 0.18)) - sideY * (offset + sway),
          );
          ctx.stroke();
        }
        ctx.fillStyle = rgba('#d9b98a', 0.26);
        ctx.beginPath();
        for (let mote = 0; mote < 3; mote += 1) {
          const cycle = (time * 1.8 + mote * 0.31 + w * 0.07) % 1;
          const drift = Math.sin(time * 5 + mote * 2.4 + w) * r * 0.28;
          const cx = e.x + backX * r * (1.05 + cycle * 1.15) - sideX * drift;
          const cy = e.y + backY * r * (1.05 + cycle * 1.15) - sideY * drift;
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, Math.max(0.55, r * (0.055 + (1 - cycle) * 0.035)), 0, TAU);
        }
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let leg = 0; leg < 2; leg += 1) {
          const along = leg === 0 ? -r * 0.28 : r * 0.22;
          const rootX = e.x + facingX * along + sideX * side * r * 0.52;
          const rootY = e.y + facingY * along + sideY * side * r * 0.52;
          const jointX = rootX + sideX * side * r * 0.46 - facingX * r * (leg === 0 ? 0.08 : 0.16);
          const jointY = rootY + sideY * side * r * 0.46 - facingY * r * (leg === 0 ? 0.08 : 0.16);
          const footX = jointX + sideX * side * r * 0.34 - facingX * r * 0.36;
          const footY = jointY + sideY * side * r * 0.34 - facingY * r * 0.36;
          ctx.strokeStyle = 'rgba(30,18,9,0.7)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(rootX, rootY);
          ctx.quadraticCurveTo(jointX, jointY, footX, footY);
          ctx.stroke();
          ctx.strokeStyle = rgba('#e3c08b', 0.24);
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }
      ctx.restore();

      ctx.fillStyle = shade(body, -0.48);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + facingX * r * 0.56 + sideX * side * r * 0.18, e.y + facingY * r * 0.56 + sideY * side * r * 0.18);
        ctx.lineTo(e.x + facingX * r * 1.12 + sideX * side * r * 0.54, e.y + facingY * r * 1.12 + sideY * side * r * 0.54);
        ctx.lineTo(e.x + facingX * r * 0.42 + sideX * side * r * 0.5, e.y + facingY * r * 0.42 + sideY * side * r * 0.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const frontX = e.x + facingX * r * 0.68;
      const frontY = e.y + facingY * r * 0.68;
      const backX = e.x - facingX * r * 0.68;
      const backY = e.y - facingY * r * 0.68;
      const leftX = e.x - sideX * r * 0.82;
      const leftY = e.y - sideY * r * 0.82;
      const rightX = e.x + sideX * r * 0.82;
      const rightY = e.y + sideY * r * 0.82;
      ctx.fillStyle = 'rgba(255,231,190,0.08)';
      ctx.beginPath();
      ctx.moveTo(frontX, frontY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(backX, backY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(24,14,7,0.22)';
      ctx.beginPath();
      ctx.moveTo(frontX, frontY);
      ctx.lineTo(rightX, rightY);
      ctx.lineTo(backX, backY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(38,23,11,0.52)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(e.x + facingX * r * 0.18 + sideX * r * 0.08, e.y + facingY * r * 0.18 + sideY * r * 0.08);
      ctx.lineTo(e.x + sideX * r * 0.34 - facingX * r * 0.06, e.y + sideY * r * 0.34 - facingY * r * 0.06);
      ctx.lineTo(e.x + sideX * r * 0.62 + facingX * r * 0.04, e.y + sideY * r * 0.62 + facingY * r * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.x - facingX * r * 0.2 - sideX * r * 0.12, e.y - facingY * r * 0.2 - sideY * r * 0.12);
      ctx.lineTo(e.x - sideX * r * 0.42 - facingX * r * 0.38, e.y - sideY * r * 0.42 - facingY * r * 0.38);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffe7ba', 0.16);
      ctx.lineWidth = 0.9;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + facingX * r * 0.46 + sideX * side * r * 0.2, e.y + facingY * r * 0.46 + sideY * side * r * 0.2);
        ctx.lineTo(e.x - facingX * r * 0.42 + sideX * side * r * 0.48, e.y - facingY * r * 0.42 + sideY * side * r * 0.48);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = rgba('#ffe7ba', 0.2);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(e.angle) * r * 0.68, e.y + Math.sin(e.angle) * r * 0.68);
      ctx.lineTo(e.x - Math.cos(e.angle) * r * 0.7, e.y - Math.sin(e.angle) * r * 0.7);
      ctx.stroke();
      break;
    }
    case 'spitter': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;
      const breath = 0.5 + Math.sin(time * 2.6 + w) * 0.5;

      // 体内的糜斑：让紫色软体不是一整块平色。
      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      for (let blotch = 0; blotch < 3; blotch += 1) {
        const a = w * 0.34 + blotch * 2.15;
        const rr = r * (0.24 + blotch * 0.17);
        ctx.fillStyle = blotch === 1 ? 'rgba(39,18,58,0.22)' : 'rgba(224,190,255,0.12)';
        ctx.beginPath();
        ctx.ellipse(
          e.x + Math.cos(a) * rr,
          e.y + Math.sin(a) * rr * 0.82,
          r * (0.18 + blotch * 0.025),
          r * (0.11 + blotch * 0.018),
          a,
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.restore();

      // 口器：平时也留一点湿亮的暗缝，蓄力时再叠上 spitterCharge 的亮口。
      const mouthX = e.x + facingX * r * 0.86;
      const mouthY = e.y + facingY * r * 0.86;
      ctx.fillStyle = 'rgba(35,15,48,0.62)';
      ctx.beginPath();
      ctx.ellipse(mouthX, mouthY, r * 0.17, r * 0.09, e.angle, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(230,205,255,${0.22 + breath * 0.08})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(mouthX - facingX * r * 0.025, mouthY - facingY * r * 0.025, r * 0.12, r * 0.052, e.angle, 0, TAU);
      ctx.stroke();

      // 三枚半透明孢子囊：短导管把囊挂在身体上，里面再压几粒孢子。
      for (let i = 0; i < 3; i += 1) {
        const a = w * 0.45 + (i / 3) * TAU + 0.24;
        const sacRadius = r * (0.27 + Math.sin(time * 1.9 + i * 1.4 + w) * 0.018);
        const sacX = e.x + Math.cos(a) * r * 1.03;
        const sacY = e.y + Math.sin(a) * r * 1.03;
        const rootX = e.x + Math.cos(a) * r * 0.68;
        const rootY = e.y + Math.sin(a) * r * 0.68;

        ctx.strokeStyle = 'rgba(38,17,52,0.6)';
        ctx.lineWidth = Math.max(1.15, r * 0.09);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rootX, rootY);
        ctx.lineTo(sacX, sacY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(229,204,255,0.18)';
        ctx.lineWidth = 0.65;
        ctx.stroke();

        const membrane = ctx.createRadialGradient(
          sacX - facingX * sacRadius * 0.32,
          sacY - facingY * sacRadius * 0.32,
          0,
          sacX,
          sacY,
          sacRadius * 1.08,
        );
        membrane.addColorStop(0, 'rgba(244,226,255,0.62)');
        membrane.addColorStop(0.48, 'rgba(193,136,232,0.5)');
        membrane.addColorStop(1, 'rgba(69,32,96,0.54)');
        ctx.fillStyle = membrane;
        ctx.beginPath();
        ctx.arc(sacX, sacY, sacRadius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(43,20,61,0.72)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(237,215,255,0.24)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(sacX, sacY, sacRadius * 0.88, Math.PI * 0.72, Math.PI * 1.52);
        ctx.stroke();

        for (let spore = 0; spore < 3; spore += 1) {
          const sa = w * 0.6 + spore * 2.1 + i * 1.3;
          const sr = sacRadius * (0.25 + spore * 0.12);
          ctx.fillStyle = spore === 1 ? 'rgba(255,244,255,0.58)' : 'rgba(226,198,255,0.4)';
          ctx.beginPath();
          ctx.arc(sacX + Math.cos(sa) * sr, sacY + Math.sin(sa) * sr, Math.max(0.4, sacRadius * 0.14), 0, TAU);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255,250,255,0.42)';
        ctx.beginPath();
        ctx.arc(sacX - sideX * sacRadius * 0.28, sacY - sideY * sacRadius * 0.28, Math.max(0.4, sacRadius * 0.11), 0, TAU);
        ctx.fill();

        const drift = (time * 0.3 + i * 0.27 + w * 0.05) % 1;
        ctx.fillStyle = `rgba(223,194,255,${(1 - drift) * 0.24})`;
        ctx.beginPath();
        ctx.arc(
          e.x + Math.cos(a + 0.3) * r * (1.18 + drift * 0.34),
          e.y + Math.sin(a + 0.3) * r * (1.18 + drift * 0.34),
          Math.max(0.35, r * 0.024),
          0,
          TAU,
        );
        ctx.fill();
      }
      break;
    }
    case 'bulwark': {
      const vertices = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 6 + (index / 6) * TAU;
        return { x: e.x + Math.cos(angle) * r, y: e.y + Math.sin(angle) * r };
      });

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      for (let panel = 0; panel < 3; panel += 1) {
        const first = vertices[panel * 2];
        const second = vertices[panel * 2 + 1];
        ctx.fillStyle = panel === 1 ? 'rgba(255,244,220,0.055)' : 'rgba(5,8,14,0.1)';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(first.x, first.y);
        ctx.lineTo(second.x, second.y);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(7,10,16,0.36)';
      ctx.lineWidth = 1.5;
      for (let seam = 0; seam < 6; seam += 2) {
        const vertex = vertices[seam];
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(vertex.x, vertex.y);
        ctx.stroke();
      }

      const plate = ctx.createLinearGradient(e.x - r * 0.55, e.y - r * 0.62, e.x + r * 0.42, e.y + r * 0.58);
      plate.addColorStop(0, 'rgba(255,247,228,0.13)');
      plate.addColorStop(0.5, 'rgba(187,198,211,0.035)');
      plate.addColorStop(1, 'rgba(3,6,11,0.2)');
      ctx.fillStyle = plate;
      poly(ctx, e.x, e.y, r * 0.62, 6, Math.PI / 6, 1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(9,13,20,0.48)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(232,241,250,0.12)';
      ctx.lineWidth = 0.8;
      poly(ctx, e.x - r * 0.025, e.y - r * 0.04, r * 0.54, 6, Math.PI / 6, 1);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(5,8,13,0.58)';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.72, e.y - r * 0.12);
      ctx.lineTo(e.x - r * 0.29, e.y + r * 0.02);
      ctx.lineTo(e.x - r * 0.38, e.y + r * 0.34);
      ctx.lineTo(e.x - r * 0.08, e.y + r * 0.58);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,237,246,0.14)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.68, e.y - r * 0.15);
      ctx.lineTo(e.x - r * 0.26, e.y - r * 0.02);
      ctx.lineTo(e.x - r * 0.34, e.y + r * 0.3);
      ctx.lineTo(e.x - r * 0.04, e.y + r * 0.54);
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(199,225,243,0.23)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(e.x + r * 0.2, e.y - r * 0.52);
      ctx.lineTo(e.x + r * 0.1, e.y - r * 0.18);
      ctx.lineTo(e.x + r * 0.36, e.y + r * 0.04);
      ctx.lineTo(e.x + r * 0.27, e.y + r * 0.32);
      ctx.stroke();
      ctx.fillStyle = 'rgba(222,240,252,0.28)';
      for (const [gx, gy, gr] of [[0.1, -0.18, 0.065], [0.36, 0.04, 0.045]] as const) {
        ctx.beginPath();
        ctx.arc(e.x + r * gx, e.y + r * gy, Math.max(0.55, r * gr), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(8,10,15,0.34)';
      for (const [vx, vy] of [[0.77, -0.44], [-0.7, 0.5]] as const) {
        ctx.beginPath();
        ctx.moveTo(e.x + r * vx, e.y + r * vy);
        ctx.lineTo(e.x + r * (vx - 0.15), e.y + r * (vy + 0.02));
        ctx.lineTo(e.x + r * (vx - 0.04), e.y + r * (vy + 0.18));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'oilsapper': {
      const f = 0.75 + Math.sin(time * 9 + w) * 0.25;
      const sway = Math.sin(time * 3.2 + w) * r * 0.035;
      const flameX = e.x + sway;
      const flameY = e.y - r * 1.15;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, r * 0.94);
      g.addColorStop(0, 'rgba(255,240,200,0.95)');
      g.addColorStop(0.45, rgba(body, 0.7));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(flameX, flameY, r * 0.94 * f, 0, TAU);
      ctx.fill();

      const flameBaseY = e.y - r * 0.92;
      const flameTipY = flameY - r * (0.5 + f * 0.08);
      ctx.fillStyle = 'rgba(255,146,56,0.72)';
      ctx.beginPath();
      ctx.moveTo(flameX, flameBaseY);
      ctx.bezierCurveTo(flameX - r * 0.24, flameY + r * 0.06, flameX - r * 0.16, flameY - r * 0.2, flameX, flameTipY);
      ctx.bezierCurveTo(flameX + r * 0.16, flameY - r * 0.2, flameX + r * 0.24, flameY + r * 0.06, flameX, flameBaseY);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,248,205,0.92)';
      ctx.beginPath();
      ctx.moveTo(flameX, flameBaseY - r * 0.1);
      ctx.quadraticCurveTo(flameX - r * 0.09, flameY - r * 0.02, flameX, flameY - r * 0.24);
      ctx.quadraticCurveTo(flameX + r * 0.09, flameY - r * 0.02, flameX, flameBaseY - r * 0.1);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,220,143,0.55)';
      for (let spark = 0; spark < 2; spark += 1) {
        const rise = (time * 0.85 + spark * 0.43 + w * 0.06) % 1;
        ctx.beginPath();
        ctx.arc(flameX + Math.sin(time * 3.7 + spark * 2.4 + w) * r * 0.22, flameY - r * (0.18 + rise * 0.54), Math.max(0.5, r * (0.03 + (1 - rise) * 0.028)), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(57,28,16,0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(e.x + sway * 0.4, e.y - r * 0.93);
      ctx.lineTo(flameX, flameBaseY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const stolen = ctx.createRadialGradient(e.x, e.y - r * 0.18, 0, e.x, e.y - r * 0.18, r * 0.78);
      stolen.addColorStop(0, `rgba(255,226,157,${0.12 + f * 0.14})`);
      stolen.addColorStop(0.46, 'rgba(224,148,118,0.12)');
      stolen.addColorStop(1, 'rgba(78,20,39,0)');
      ctx.fillStyle = stolen;
      ctx.fillRect(e.x - r, e.y - r * 1.2, r * 2, r * 2.4);
      ctx.strokeStyle = 'rgba(78,22,42,0.32)';
      ctx.lineWidth = 0.85;
      for (let vein = 0; vein < 3; vein += 1) {
        const side = (vein - 1) * r * 0.3;
        ctx.beginPath();
        ctx.moveTo(e.x + side * 0.45, e.y - r * 0.82);
        ctx.quadraticCurveTo(e.x + side * 1.18, e.y - r * 0.2, e.x + side * 0.72 + Math.sin(time * 1.7 + vein + w) * r * 0.05, e.y + r * 0.8);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,209,152,0.12)';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(e.x + side * 0.47 - r * 0.035, e.y - r * 0.78);
        ctx.quadraticCurveTo(e.x + side * 1.12 - r * 0.035, e.y - r * 0.2, e.x + side * 0.68, e.y + r * 0.76);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(78,22,42,0.32)';
        ctx.lineWidth = 0.85;
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(255,214,124,0.22)';
      for (let i = 0; i < 3; i += 1) {
        const a = w * 0.3 + (i / 3) * TAU;
        ctx.beginPath();
        ctx.ellipse(e.x + Math.cos(a) * r * 0.52, e.y + Math.sin(a) * r * 0.78, r * 0.07, r * 0.18, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,235,190,0.22)';
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r * 0.52 - r * 0.015, e.y + Math.sin(a) * r * 0.78 - r * 0.04, Math.max(0.45, r * 0.025), 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,214,124,0.22)';
      }
      ctx.strokeStyle = 'rgba(255,234,185,0.3)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.46, e.y - r * 0.7);
      ctx.quadraticCurveTo(e.x, e.y - r * 0.96, e.x + r * 0.46, e.y - r * 0.7);
      ctx.stroke();
      break;
    }
    case 'bomber': {
      const armed = e.stateTimer > 0;
      const pressure = armed ? 1 - e.stateTimer / 1.1 : 0;
      const pulse = 0.5 + 0.5 * Math.sin(time * 18 + w);

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      ctx.strokeStyle = 'rgba(91,31,16,0.18)';
      ctx.lineWidth = 0.9;
      for (let ridge = 0; ridge < 6; ridge += 1) {
        const angle = Math.PI + 0.28 + (ridge / 5) * (Math.PI - 0.56);
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(angle) * r * 0.16, e.y - r * 0.28 + Math.sin(angle) * r * 0.16);
        ctx.lineTo(e.x + Math.cos(angle) * r * 1.02, e.y - r * 0.28 + Math.sin(angle) * r * 1.02);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255,231,191,0.3)';
      ctx.strokeStyle = 'rgba(99,34,16,0.34)';
      ctx.lineWidth = 0.8;
      for (const [sx, sy, sr, stretch] of [[-0.45, -0.24, 0.15, 0.82], [-0.08, -0.52, 0.18, 0.72], [0.32, -0.38, 0.14, 0.94], [0.48, -0.02, 0.105, 0.8]] as const) {
        ctx.beginPath();
        ctx.ellipse(e.x + r * sx, e.y + r * sy, r * sr, r * sr * stretch, -0.35 + sx * 0.6, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(74,23,12,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.88, e.y + r * 0.46);
      ctx.quadraticCurveTo(e.x, e.y + r * 0.36, e.x + r * 0.88, e.y + r * 0.46);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,199,126,0.16)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.84, e.y + r * 0.41);
      ctx.quadraticCurveTo(e.x, e.y + r * 0.31, e.x + r * 0.84, e.y + r * 0.41);
      ctx.stroke();

      for (let gill = 0; gill < 7; gill += 1) {
        const x = e.x - r * 0.7 + (gill / 6) * r * 1.4;
        ctx.strokeStyle = gill % 2 === 0 ? 'rgba(72,21,10,0.52)' : 'rgba(111,37,14,0.34)';
        ctx.lineWidth = gill === 3 ? 1.2 : 0.85;
        ctx.beginPath();
        ctx.moveTo(x, e.y + r * 0.48);
        ctx.quadraticCurveTo(x + Math.sin(gill * 1.4 + w) * r * 0.05, e.y + r * 0.62, x - r * 0.03, e.y + r * 0.8);
        ctx.stroke();
        if (gill % 2 === 1) {
          ctx.strokeStyle = 'rgba(255,190,112,0.12)';
          ctx.lineWidth = 0.55;
          ctx.beginPath();
          ctx.moveTo(x + r * 0.035, e.y + r * 0.51);
          ctx.lineTo(x + r * 0.01, e.y + r * 0.77);
          ctx.stroke();
        }
      }

      if (armed) {
        ctx.globalCompositeOperation = 'lighter';
        const core = ctx.createRadialGradient(e.x, e.y - r * 0.16, 0, e.x, e.y - r * 0.16, r * (0.58 + pressure * 0.32));
        core.addColorStop(0, `rgba(255,247,214,${0.14 + pressure * 0.34 * (0.72 + pulse * 0.28)})`);
        core.addColorStop(0.38, `rgba(255,128,55,${0.1 + pressure * 0.28})`);
        core.addColorStop(1, 'rgba(187,48,10,0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(e.x, e.y - r * 0.16, r * (0.58 + pressure * 0.32), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,157,76,${0.18 + pressure * 0.44})`;
        ctx.lineWidth = 1.1;
        for (let crack = 0; crack < 4; crack += 1) {
          const angle = Math.PI + 0.5 + (crack / 3) * (Math.PI - 1);
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(angle) * r * 0.12, e.y - r * 0.2 + Math.sin(angle) * r * 0.12);
          ctx.lineTo(e.x + Math.cos(angle + 0.08) * r * 0.42, e.y - r * 0.2 + Math.sin(angle + 0.08) * r * 0.42);
          ctx.lineTo(e.x + Math.cos(angle - 0.04) * r * 0.66, e.y - r * 0.2 + Math.sin(angle - 0.04) * r * 0.66);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,218,161,${0.18 + pressure * 0.3})`;
        for (let mote = 0; mote < 3; mote += 1) {
          const rise = (time * 0.62 + mote * 0.27 + w * 0.05) % 1;
          const drift = Math.sin(time * 3.4 + mote * 2.1 + w) * r * 0.34;
          const mx = e.x - r * 0.52 + mote * r * 0.48 + drift;
          const my = e.y - r * (0.42 + rise * 0.82);
          ctx.beginPath();
          ctx.arc(mx, my, Math.max(0.55, r * (0.035 + (1 - rise) * 0.035)), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      break;
    }
    case 'wickmother': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const backX = -facingX;
      const backY = -facingY;
      const sideX = -facingY;
      const sideY = facingX;
      const breath = 0.5 + Math.sin(time * 2.1 + w) * 0.5;

      // 蜡体不是一整块平色：靠灯的一侧透出暖芯，背光侧沉成旧蜡。
      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const wax = ctx.createRadialGradient(
        e.x + facingX * r * 0.28,
        e.y + facingY * r * 0.28,
        r * 0.08,
        e.x,
        e.y,
        r * 1.04,
      );
      wax.addColorStop(0, 'rgba(255,229,173,0.18)');
      wax.addColorStop(0.56, 'rgba(216,127,59,0.04)');
      wax.addColorStop(1, 'rgba(54,16,9,0.34)');
      ctx.fillStyle = wax;
      ctx.fillRect(e.x - r * 1.4, e.y - r * 1.4, r * 2.8, r * 2.8);

      // 三层向后叠的凝固蜡纹，让圆身体有“蜡堆起来”的厚度。
      ctx.lineCap = 'round';
      for (let layer = 0; layer < 3; layer += 1) {
        const back = r * (0.04 + layer * 0.2);
        const half = r * (0.72 - layer * 0.1);
        const cx = e.x + backX * back;
        const cy = e.y + backY * back;
        const sag = Math.sin(w * 0.7 + layer * 1.4) * r * 0.045;
        ctx.beginPath();
        ctx.moveTo(cx + sideX * half, cy + sideY * half);
        ctx.quadraticCurveTo(
          cx + backX * r * 0.1 + sideX * sag,
          cy + backY * r * 0.1 + sideY * sag,
          cx - sideX * half,
          cy - sideY * half,
        );
        ctx.strokeStyle = layer === 1 ? 'rgba(255,218,157,0.18)' : 'rgba(73,23,11,0.25)';
        ctx.lineWidth = layer === 1 ? 0.95 : 1.45;
        ctx.stroke();
      }

      // 细裂纹沿着身体边缘散开，避免中央出现第二只“眼睛”。
      ctx.strokeStyle = 'rgba(72,22,12,0.3)';
      ctx.lineWidth = 0.8;
      for (let crack = 0; crack < 3; crack += 1) {
        const a = w * 0.16 + crack * 2.1 + 0.35;
        const start = r * 0.3;
        const end = r * (0.62 + crack * 0.07);
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * start, e.y + Math.sin(a) * start);
        ctx.quadraticCurveTo(
          e.x + Math.cos(a + 0.2) * r * 0.47,
          e.y + Math.sin(a + 0.2) * r * 0.47,
          e.x + Math.cos(a - 0.05) * end,
          e.y + Math.sin(a - 0.05) * end,
        );
        ctx.stroke();
      }
      ctx.restore();

      // 边缘垂下的蜡滴：只多出一点点剪影，远近都能读出“融化的烛母”。
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(69,21,11,0.24)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.92, 0.16, Math.PI - 0.16);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,204,141,0.18)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      const drips: Array<[number, number, number]> = [
        [0.64, 0.09, 0.075],
        [1.16, 0.14, 0.065],
        [2.02, 0.11, 0.06],
        [2.58, 0.17, 0.075],
        [3.64, 0.1, 0.065],
      ];
      for (let i = 0; i < drips.length; i += 1) {
        const [a, length, width] = drips[i];
        const baseX = e.x + Math.cos(a) * r * 0.9;
        const baseY = e.y + Math.sin(a) * r * 0.9;
        const drip = r * (length + Math.sin(time * 1.4 + i) * 0.012);
        const sway = Math.sin(w * 0.8 + i * 1.7) * r * 0.035;
        const tipX = baseX + sway;
        const tipY = baseY + drip;
        ctx.strokeStyle = 'rgba(71,21,11,0.5)';
        ctx.lineWidth = Math.max(1.1, r * width * 1.8);
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(baseX + sway * 0.45, baseY + drip * 0.55, tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(232,153,82,0.42)';
        ctx.lineWidth = Math.max(0.55, r * width * 0.72);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239,171,100,0.54)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, Math.max(0.8, r * width * 0.95), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 侧上方的烛芯与余烬：避开血条，烛母的身份在第一眼就能读出来。
      ctx.save();
      const wickOutX = -sideX;
      const wickOutY = -sideY;
      const wickX = e.x + wickOutX * r * 0.55 + backX * r * 0.72;
      const wickY = e.y + wickOutY * r * 0.55 + backY * r * 0.72;
      const emberX = wickX + wickOutX * r * 0.16 + backX * r * 0.23;
      const emberY = wickY + wickOutY * r * 0.16 + backY * r * 0.23;
      ctx.fillStyle = 'rgba(59,17,10,0.36)';
      ctx.beginPath();
      ctx.ellipse(wickX, wickY, r * 0.25, r * 0.12, e.angle + Math.PI / 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,206,142,0.28)';
      ctx.beginPath();
      ctx.ellipse(
        wickX - wickOutX * r * 0.035,
        wickY - wickOutY * r * 0.035,
        r * 0.21,
        r * 0.075,
        e.angle + Math.PI / 2,
        0,
        TAU,
      );
      ctx.fill();
      ctx.strokeStyle = 'rgba(38,12,9,0.88)';
      ctx.lineWidth = Math.max(1.4, r * 0.055);
      ctx.beginPath();
      ctx.moveTo(wickX + backX * r * 0.03, wickY + backY * r * 0.03);
      ctx.quadraticCurveTo(
        wickX + wickOutX * r * 0.06 + backX * r * 0.17,
        wickY + wickOutY * r * 0.06 + backY * r * 0.17,
        emberX,
        emberY,
      );
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,197,116,0.26)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      const flameX = wickOutX * 0.5 + backX * 0.86;
      const flameY = wickOutY * 0.5 + backY * 0.86;
      const flameLength = r * (0.64 + breath * 0.09);
      const flameGlow = ctx.createRadialGradient(emberX, emberY, 0, emberX, emberY, r * 0.55);
      flameGlow.addColorStop(0, `rgba(255,184,79,${0.32 + breath * 0.16})`);
      flameGlow.addColorStop(1, 'rgba(255,116,35,0)');
      ctx.fillStyle = flameGlow;
      ctx.beginPath();
      ctx.arc(emberX, emberY, r * 0.55, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,174,65,${0.56 + breath * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(emberX - wickOutX * r * 0.18, emberY - wickOutY * r * 0.18);
      ctx.quadraticCurveTo(
        emberX + flameX * flameLength * 0.48,
        emberY + flameY * flameLength * 0.48,
        emberX + flameX * flameLength,
        emberY + flameY * flameLength,
      );
      ctx.quadraticCurveTo(
        emberX + flameX * flameLength * 0.4 + wickOutX * r * 0.13,
        emberY + flameY * flameLength * 0.4 + wickOutY * r * 0.13,
        emberX + wickOutX * r * 0.18,
        emberY + wickOutY * r * 0.18,
      );
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,249,220,${0.72 + breath * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(emberX - wickOutX * r * 0.05, emberY - wickOutY * r * 0.05);
      ctx.quadraticCurveTo(
        emberX + flameX * flameLength * 0.28,
        emberY + flameY * flameLength * 0.28,
        emberX + flameX * flameLength * 0.48,
        emberY + flameY * flameLength * 0.48,
      );
      ctx.quadraticCurveTo(
        emberX + flameX * flameLength * 0.2 + wickOutX * r * 0.055,
        emberY + flameY * flameLength * 0.2 + wickOutY * r * 0.055,
        emberX + wickOutX * r * 0.05,
        emberY + wickOutY * r * 0.05,
      );
      ctx.closePath();
      ctx.fill();
      const emberGlow = ctx.createRadialGradient(emberX, emberY, 0, emberX, emberY, r * 0.32);
      emberGlow.addColorStop(0, `rgba(255,240,185,${0.4 + breath * 0.18})`);
      emberGlow.addColorStop(1, 'rgba(255,129,45,0)');
      ctx.fillStyle = emberGlow;
      ctx.beginPath();
      ctx.arc(emberX, emberY, r * 0.32, 0, TAU);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(247,225,194,0.16)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(emberX + flameX * r * 0.2, emberY + flameY * r * 0.2);
      ctx.bezierCurveTo(
        emberX + flameX * r * 0.42 - wickOutX * r * 0.09,
        emberY + flameY * r * 0.42 - wickOutY * r * 0.09,
        emberX + flameX * r * 0.58 + wickOutX * r * 0.1,
        emberY + flameY * r * 0.58 + wickOutY * r * 0.1,
        emberX + flameX * r * 0.86 - wickOutX * r * 0.1,
        emberY + flameY * r * 0.86 - wickOutY * r * 0.1,
      );
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'splinter': {
      const rot = e.angle + w * 0.08;
      const vertices = Array.from({ length: 5 }, (_, index) => {
        const angle = rot + (index / 5) * TAU;
        return { x: e.x + Math.cos(angle) * r * 1.05, y: e.y + Math.sin(angle) * r * 1.05 * 0.94 };
      });

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      for (let facet = 0; facet < 5; facet += 1) {
        const first = vertices[facet];
        const second = vertices[(facet + 1) % 5];
        ctx.fillStyle = facet % 2 === 0 ? 'rgba(196,225,255,0.09)' : 'rgba(9,28,58,0.1)';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(first.x, first.y);
        ctx.lineTo(second.x, second.y);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(13,31,62,0.36)';
      ctx.lineWidth = 1.1;
      for (let seam = 0; seam < 5; seam += 1) {
        const vertex = vertices[seam];
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(vertex.x, vertex.y);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      const core = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 0.72);
      core.addColorStop(0, 'rgba(228,245,255,0.28)');
      core.addColorStop(0.42, 'rgba(125,181,243,0.14)');
      core.addColorStop(1, 'rgba(57,91,158,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.72, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(226,243,255,0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.58, e.y - r * 0.18);
      ctx.lineTo(e.x - r * 0.1, e.y + r * 0.02);
      ctx.lineTo(e.x + r * 0.14, e.y + r * 0.27);
      ctx.lineTo(e.x + r * 0.5, e.y + r * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.1, e.y + r * 0.02);
      ctx.lineTo(e.x - r * 0.18, e.y - r * 0.48);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(16,36,73,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(e.x - r * 0.56, e.y - r * 0.14);
      ctx.lineTo(e.x - r * 0.08, e.y + r * 0.06);
      ctx.lineTo(e.x + r * 0.16, e.y + r * 0.31);
      ctx.lineTo(e.x + r * 0.52, e.y + r * 0.46);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let shard = 0; shard < 3; shard += 1) {
        const angle = time * 0.38 + w * 0.12 + (shard / 3) * TAU;
        const orbit = r * (1.3 + Math.sin(time * 1.4 + shard * 1.7 + w) * 0.07);
        const cx = e.x + Math.cos(angle) * orbit;
        const cy = e.y + Math.sin(angle) * orbit * 0.9;
        const shardAngle = angle + 0.65 + shard * 0.3;
        const length = r * (0.2 + shard * 0.025);
        const width = length * 0.48;
        ctx.fillStyle = rgba(body, 0.58);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(shardAngle) * length, cy + Math.sin(shardAngle) * length);
        ctx.lineTo(cx + Math.cos(shardAngle + Math.PI / 2) * width, cy + Math.sin(shardAngle + Math.PI / 2) * width);
        ctx.lineTo(cx - Math.cos(shardAngle) * length, cy - Math.sin(shardAngle) * length);
        ctx.lineTo(cx + Math.cos(shardAngle - Math.PI / 2) * width, cy + Math.sin(shardAngle - Math.PI / 2) * width);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(207,235,255,0.28)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'darkless': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const backX = -facingX;
      const backY = -facingY;
      const sideX = -facingY;
      const sideY = facingX;
      const pulse = 0.5 + Math.sin(time * 1.8 + w) * 0.5;

      // 壳内没有反光，只有被压扁的冷灰褶层和几点没被完全吞掉的灰烬。
      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const voidCore = ctx.createRadialGradient(
        e.x + facingX * r * 0.16,
        e.y + facingY * r * 0.16,
        r * 0.05,
        e.x,
        e.y,
        r * 1.03,
      );
      voidCore.addColorStop(0, 'rgba(0,0,0,0.46)');
      voidCore.addColorStop(0.62, 'rgba(0,1,5,0.2)');
      voidCore.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = voidCore;
      ctx.fillRect(e.x - r * 1.4, e.y - r * 1.4, r * 2.8, r * 2.8);

      ctx.lineCap = 'round';
      for (let fold = 0; fold < 3; fold += 1) {
        const back = r * (0.05 + fold * 0.21);
        const half = r * (0.66 - fold * 0.11);
        const cx = e.x + backX * back;
        const cy = e.y + backY * back;
        ctx.beginPath();
        ctx.moveTo(cx + sideX * half, cy + sideY * half);
        ctx.quadraticCurveTo(
          cx + backX * r * 0.12,
          cy + backY * r * 0.12,
          cx - sideX * half,
          cy - sideY * half,
        );
        ctx.strokeStyle = 'rgba(2,4,10,0.34)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = fold === 1 ? 'rgba(137,158,201,0.16)' : 'rgba(111,132,177,0.1)';
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      for (let mote = 0; mote < 5; mote += 1) {
        const a = w * 0.18 + mote * 2.13;
        const rr = r * (0.2 + ((mote * 29) % 19) / 34);
        ctx.fillStyle = `rgba(190,208,241,${0.1 + (mote % 2) * 0.045})`;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr * 0.78, Math.max(0.55, r * 0.023), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 外圈不是完整光环，而是被它吃掉一半的弧；内圈再补一道更冷的断线。
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(160,190,255,0.42)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.12, w, w + Math.PI * 1.25);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(197,216,255,0.18)';
      ctx.lineWidth = 0.9;
      ctx.setLineDash([5, 10]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.3, -w * 0.7 + 0.5, -w * 0.7 + Math.PI * 1.7);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let mote = 0; mote < 3; mote += 1) {
        const cycle = (time * 0.19 + mote * 0.31 + w * 0.04) % 1;
        const fade = Math.sin(cycle * Math.PI);
        const a = -time * 0.24 + mote * (TAU / 3) + 0.4;
        const near = r * (1.58 - cycle * 0.52);
        const far = near + r * 0.18;
        ctx.strokeStyle = `rgba(174,201,255,${fade * 0.16})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * far, e.y + Math.sin(a) * far);
        ctx.lineTo(e.x + Math.cos(a) * near, e.y + Math.sin(a) * near);
        ctx.stroke();
        ctx.fillStyle = `rgba(211,226,255,${fade * (0.26 + pulse * 0.1)})`;
        ctx.beginPath();
        ctx.arc(
          e.x + Math.cos(a) * near,
          e.y + Math.sin(a) * near,
          Math.max(0.65, r * (0.022 + (1 - cycle) * 0.024)),
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'shade': {
      // 影蛭的烟尾：身体停下来时仍有一点点"被拖在后面"的黑雾。
      const trail = Math.atan2(-e.vy, -e.vx);
      const moving = Math.hypot(e.vx, e.vy) > 8;
      const dirX = Math.cos(e.angle);
      const dirY = Math.sin(e.angle);
      const sideX = -dirY;
      const sideY = dirX;

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const core = ctx.createRadialGradient(
        e.x - dirX * r * 0.12,
        e.y - dirY * r * 0.12,
        0,
        e.x,
        e.y,
        r * 0.92,
      );
      core.addColorStop(0, 'rgba(127,158,238,0.24)');
      core.addColorStop(0.55, 'rgba(64,88,164,0.1)');
      core.addColorStop(1, 'rgba(18,26,58,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = core;
      ctx.fillRect(e.x - r * 1.2, e.y - r * 1.2, r * 2.4, r * 2.4);

      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      for (let segment = 0; segment < 3; segment += 1) {
        const back = r * (0.12 + segment * 0.22);
        const half = r * (0.68 - segment * 0.08);
        const centerX = e.x - dirX * back;
        const centerY = e.y - dirY * back;
        const curl = Math.sin(time * 2.1 + segment * 1.4 + w) * r * 0.05;
        ctx.moveTo(centerX + sideX * half, centerY + sideY * half);
        ctx.quadraticCurveTo(
          centerX - dirX * r * 0.12 + sideX * curl,
          centerY - dirY * r * 0.12 + sideY * curl,
          centerX - sideX * half,
          centerY - sideY * half,
        );
      }
      ctx.strokeStyle = 'rgba(4,8,18,0.52)';
      ctx.lineWidth = 1.35;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(136,164,236,0.18)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(body, moving ? 0.28 : 0.15);
      ctx.lineWidth = 1.55;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const sway = Math.sin(time * 2.3 + side * 1.7 + w) * r * 0.13;
        const startX = e.x - dirX * r * 0.12 + sideX * side * r * 0.62;
        const startY = e.y - dirY * r * 0.12 + sideY * side * r * 0.62;
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(
          startX - dirX * r * 0.45 + sideX * side * (r * 0.2 + sway * 0.4),
          startY - dirY * r * 0.45 + sideY * side * (r * 0.2 + sway * 0.4),
          startX - dirX * r * 0.78 + sideX * side * (r * 0.14 + sway),
          startY - dirY * r * 0.78 + sideY * side * (r * 0.14 + sway),
        );
      }
      ctx.stroke();
      ctx.fillStyle = rgba(body, 0.4);
      ctx.beginPath();
      for (let mote = 0; mote < 3; mote += 1) {
        const cycle = (time * 0.32 + mote * 0.29 + w * 0.11) % 1;
        const drift = Math.sin(time * 1.7 + mote * 2.3 + w) * r * 0.34;
        ctx.moveTo(e.x - dirX * r * (0.72 + cycle * 0.85) + sideX * drift, e.y - dirY * r * (0.72 + cycle * 0.85) + sideY * drift);
        ctx.arc(
          e.x - dirX * r * (0.72 + cycle * 0.85) + sideX * drift,
          e.y - dirY * r * (0.72 + cycle * 0.85) + sideY * drift,
          Math.max(0.55, r * (0.06 + (1 - cycle) * 0.055)),
          0,
          TAU,
        );
      }
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(body, moving ? 0.26 : 0.16);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i += 1) {
        const off = (i - 1) * 0.34;
        const len = r * (0.82 + i * 0.16) * (moving ? 1 : 0.55);
        ctx.lineWidth = 2.6 - i * 0.5;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(trail + off) * r * 0.45, e.y + Math.sin(trail + off) * r * 0.45);
        ctx.quadraticCurveTo(
          e.x + Math.cos(trail + off + 0.3) * len,
          e.y + Math.sin(trail + off + 0.3) * len,
          e.x + Math.cos(trail + off + 0.1) * len * 1.35,
          e.y + Math.sin(trail + off + 0.1) * len * 1.35,
        );
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'snuffer': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const sideX = -facingY;
      const sideY = facingX;
      const faceX = e.x + facingX * r * 0.34;
      const faceY = e.y + facingY * r * 0.34;
      const breath = 0.55 + Math.sin(time * 2.4 + w) * 0.45;

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      for (let fold = -1; fold <= 1; fold += 1) {
        const offset = fold * r * 0.4;
        const sway = Math.sin(time * 1.5 + fold * 1.8 + w) * r * 0.05;
        ctx.strokeStyle = 'rgba(20,13,39,0.46)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(e.x - facingX * r * 0.74 + sideX * offset * 0.45, e.y - facingY * r * 0.74 + sideY * offset * 0.45);
        ctx.quadraticCurveTo(
          e.x - facingX * r * 0.06 + sideX * (offset * 1.18 + sway),
          e.y - facingY * r * 0.06 + sideY * (offset * 1.18 + sway),
          e.x + facingX * r * 0.42 + sideX * offset * 0.62,
          e.y + facingY * r * 0.42 + sideY * offset * 0.62,
        );
        ctx.stroke();
        ctx.strokeStyle = 'rgba(180,160,238,0.16)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(e.x - facingX * r * 0.7 + sideX * (offset * 0.45 - r * 0.045), e.y - facingY * r * 0.7 + sideY * (offset * 0.45 - r * 0.045));
        ctx.quadraticCurveTo(
          e.x - facingX * r * 0.05 + sideX * (offset * 1.16 + sway),
          e.y - facingY * r * 0.05 + sideY * (offset * 1.16 + sway),
          e.x + facingX * r * 0.39 + sideX * (offset * 0.62 - r * 0.035),
          e.y + facingY * r * 0.39 + sideY * (offset * 0.62 - r * 0.035),
        );
        ctx.stroke();
      }
      const hoodShade = ctx.createRadialGradient(faceX, faceY, 0, faceX, faceY, r * 0.66);
      hoodShade.addColorStop(0, 'rgba(19,12,37,0.28)');
      hoodShade.addColorStop(1, 'rgba(19,12,37,0)');
      ctx.fillStyle = hoodShade;
      ctx.beginPath();
      ctx.arc(faceX, faceY, r * 0.66, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(22,16,40,0.78)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(faceX, faceY, r * 0.5, e.angle + Math.PI * 0.56, e.angle + Math.PI * 1.44);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(176,154,238,0.38)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = 'rgba(8,6,18,0.9)';
      ctx.beginPath();
      ctx.ellipse(faceX, faceY, r * 0.34, r * 0.3, e.angle, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(78,58,130,0.28)';
      ctx.beginPath();
      ctx.ellipse(faceX - facingX * r * 0.04, faceY - facingY * r * 0.04, r * 0.26, r * 0.23, e.angle, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(156,136,220,0.35)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i += 1) {
        const a = e.angle + Math.PI + (i - 1) * 0.42;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.4, e.y + Math.sin(a) * r * 0.4);
        ctx.quadraticCurveTo(
          e.x + Math.cos(a + 0.15) * r * 1.05,
          e.y + Math.sin(a + 0.15) * r * 1.05,
          e.x + Math.cos(a + 0.3 + Math.sin(time * 2 + i) * 0.18) * r * 1.5,
          e.y + Math.sin(a + 0.3 + Math.sin(time * 2 + i) * 0.18) * r * 1.5,
        );
        ctx.stroke();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const plumeReach = r * (1.28 + breath * 0.36);
      const plumeSway = Math.sin(time * 2.8 + w) * r * 0.12;
      const plumeGradient = ctx.createLinearGradient(faceX, faceY, faceX + facingX * plumeReach, faceY + facingY * plumeReach);
      plumeGradient.addColorStop(0, `rgba(214,199,255,${0.16 + breath * 0.08})`);
      plumeGradient.addColorStop(0.48, `rgba(170,150,236,${0.075 + breath * 0.06})`);
      plumeGradient.addColorStop(1, 'rgba(126,105,206,0)');
      ctx.fillStyle = plumeGradient;
      ctx.beginPath();
      ctx.moveTo(faceX + facingX * r * 0.18 - sideX * r * 0.12, faceY + facingY * r * 0.18 - sideY * r * 0.12);
      ctx.bezierCurveTo(
        faceX + facingX * r * 0.68 - sideX * (r * 0.22 + plumeSway * 0.4),
        faceY + facingY * r * 0.68 - sideY * (r * 0.22 + plumeSway * 0.4),
        faceX + facingX * plumeReach - sideX * (r * 0.35 + plumeSway),
        faceY + facingY * plumeReach - sideY * (r * 0.35 + plumeSway),
        faceX + facingX * plumeReach,
        faceY + facingY * plumeReach,
      );
      ctx.bezierCurveTo(
        faceX + facingX * plumeReach + sideX * (r * 0.35 + plumeSway),
        faceY + facingY * plumeReach + sideY * (r * 0.35 + plumeSway),
        faceX + facingX * r * 0.68 + sideX * (r * 0.22 + plumeSway * 0.4),
        faceY + facingY * r * 0.68 + sideY * (r * 0.22 + plumeSway * 0.4),
        faceX + facingX * r * 0.18 + sideX * r * 0.12,
        faceY + facingY * r * 0.18 + sideY * r * 0.12,
      );
      ctx.closePath();
      ctx.fill();
      for (const wisp of [-1, 1]) {
        const sway = Math.sin(time * 3.1 + wisp * 1.7 + w) * r * 0.09;
        ctx.strokeStyle = `rgba(214,201,255,${0.09 + breath * 0.07})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(faceX + facingX * r * 0.24 + sideX * wisp * r * 0.06, faceY + facingY * r * 0.24 + sideY * wisp * r * 0.06);
        ctx.quadraticCurveTo(
          faceX + facingX * r * 0.66 + sideX * (wisp * r * 0.3 + sway),
          faceY + facingY * r * 0.66 + sideY * (wisp * r * 0.3 + sway),
          faceX + facingX * plumeReach * 0.9 + sideX * (wisp * r * 0.16 + sway * 1.7),
          faceY + facingY * plumeReach * 0.9 + sideY * (wisp * r * 0.16 + sway * 1.7),
        );
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(215,202,255,${0.14 + breath * 0.12})`;
      for (let mote = 0; mote < 3; mote += 1) {
        const travel = (time * 0.5 + mote * 0.29 + w * 0.05) % 1;
        const drift = Math.sin(time * 3.4 + mote * 2.2 + w) * r * 0.14 * travel;
        ctx.beginPath();
        ctx.arc(
          faceX + facingX * plumeReach * (0.24 + travel * 0.72) + sideX * drift,
          faceY + facingY * plumeReach * (0.24 + travel * 0.72) + sideY * drift,
          Math.max(0.45, r * (0.022 + (1 - travel) * 0.025)),
          0,
          TAU,
        );
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'thornlord': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const backX = -facingX;
      const backY = -facingY;
      const sideX = -facingY;
      const sideY = facingX;
      const breath = 0.5 + Math.sin(time * 2.2 + w) * 0.5;

      // 放射荆棘：长短交替，迎光的一侧补一条细木纹高光。
      for (let i = 0; i < 9; i += 1) {
        const ang = (i / 9) * TAU + w * 0.2;
        const base = r * 0.84;
        const len = r * (0.3 + Math.abs(Math.sin(time * 1.7 + i * 0.9)) * 0.24);
        const tipAng = ang + 0.07 + Math.sin(w + i) * 0.03;
        const baseAX = e.x + Math.cos(ang - 0.09) * base;
        const baseAY = e.y + Math.sin(ang - 0.09) * base;
        const baseBX = e.x + Math.cos(ang + 0.09) * base;
        const baseBY = e.y + Math.sin(ang + 0.09) * base;
        const tipX = e.x + Math.cos(tipAng) * (base + len);
        const tipY = e.y + Math.sin(tipAng) * (base + len);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(31,46,16,0.86)' : 'rgba(43,61,22,0.82)';
        ctx.beginPath();
        ctx.moveTo(baseAX, baseAY);
        ctx.lineTo(baseBX, baseBY);
        ctx.lineTo(tipX, tipY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(208,236,148,0.18)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(baseAX, baseAY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      const bark = ctx.createLinearGradient(
        e.x + facingX * r * 0.9,
        e.y + facingY * r * 0.9,
        e.x + backX * r * 0.9,
        e.y + backY * r * 0.9,
      );
      bark.addColorStop(0, 'rgba(33,48,16,0)');
      bark.addColorStop(0.52, 'rgba(25,37,12,0.16)');
      bark.addColorStop(1, 'rgba(8,13,6,0.42)');
      ctx.fillStyle = bark;
      ctx.fillRect(e.x - r * 1.3, e.y - r * 1.3, r * 2.6, r * 2.6);

      // 年轮与根脊：让绿色星形内部像一块被劈开的树心。
      ctx.lineCap = 'round';
      for (let ring = 0; ring < 3; ring += 1) {
        const rr = r * (0.36 + ring * 0.17);
        const start = e.angle + 0.58 + ring * 0.22 + w * 0.06;
        const cx = e.x + backX * r * 0.05;
        const cy = e.y + backY * r * 0.05;
        ctx.strokeStyle = 'rgba(22,35,11,0.32)';
        ctx.lineWidth = 1.55;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, start, start + Math.PI * 1.42);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(192,224,125,0.11)';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.arc(cx + sideX * r * 0.012, cy + sideY * r * 0.012, rr + r * 0.014, start, start + Math.PI * 1.38);
        ctx.stroke();
      }
      for (let ridge = 0; ridge < 5; ridge += 1) {
        const a = w * 0.18 + ridge * (TAU / 5);
        ctx.strokeStyle = 'rgba(17,28,9,0.34)';
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.14, e.y + Math.sin(a) * r * 0.14);
        ctx.quadraticCurveTo(
          e.x + Math.cos(a + 0.16) * r * 0.5,
          e.y + Math.sin(a + 0.16) * r * 0.5,
          e.x + Math.cos(a - 0.05) * r * 0.78,
          e.y + Math.sin(a - 0.05) * r * 0.78,
        );
        ctx.stroke();
        ctx.strokeStyle = 'rgba(198,229,129,0.12)';
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // 苔斑与木纹里的琥珀树脂：暗绿压住整体亮度，暖点负责近景呼吸。
      for (let moss = 0; moss < 7; moss += 1) {
        const a = w * 0.42 + moss * 2.17;
        const rr = r * (0.24 + ((moss * 23) % 29) / 68);
        ctx.fillStyle = `rgba(49,77,28,${0.13 + (moss % 3) * 0.035})`;
        ctx.beginPath();
        ctx.ellipse(
          e.x + Math.cos(a) * rr,
          e.y + Math.sin(a) * rr * 0.84,
          Math.max(1, r * 0.035),
          Math.max(0.7, r * 0.02),
          a,
          0,
          TAU,
        );
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i += 1) {
        const ang = (i / 4) * TAU + w * 0.5 + 0.3;
        const points = [
          [e.x + Math.cos(ang) * r * 0.16, e.y + Math.sin(ang) * r * 0.16],
          [e.x + Math.cos(ang + 0.14) * r * 0.38, e.y + Math.sin(ang + 0.14) * r * 0.38],
          [e.x + Math.cos(ang - 0.06) * r * 0.58, e.y + Math.sin(ang - 0.06) * r * 0.58],
          [e.x + Math.cos(ang + 0.1) * r * 0.78, e.y + Math.sin(ang + 0.1) * r * 0.78],
        ];
        ctx.strokeStyle = `rgba(255,164,54,${0.24 + breath * 0.1})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let point = 1; point < points.length; point += 1) {
          ctx.lineTo(points[point][0], points[point][1]);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,221,137,0.62)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.fillStyle = `rgba(255,206,101,${0.48 + breath * 0.16})`;
        ctx.beginPath();
        ctx.arc(points[2][0], points[2][1], Math.max(0.6, r * 0.025), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 眼窝与琥珀眼：暗色瞳缝把两只空白光点变成有方向的注视。
      for (const side of [-1, 1]) {
        const eyeX = e.x + Math.cos(e.angle + side * 0.42) * r * 0.36;
        const eyeY = e.y + Math.sin(e.angle + side * 0.42) * r * 0.36;
        ctx.strokeStyle = 'rgba(12,20,6,0.66)';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, r * 0.17, e.angle + Math.PI * 0.54, e.angle + Math.PI * 1.46);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(207,237,145,0.2)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, r * 0.19, e.angle + Math.PI * 0.58, e.angle + Math.PI * 1.42);
        ctx.stroke();

        ctx.fillStyle = '#ffd24e';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, r * 0.11, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(44,24,6,0.92)';
        ctx.beginPath();
        ctx.ellipse(
          eyeX + facingX * r * 0.018,
          eyeY + facingY * r * 0.018,
          r * 0.028,
          r * 0.072,
          e.angle,
          0,
          TAU,
        );
        ctx.fill();
        ctx.fillStyle = 'rgba(255,250,191,0.82)';
        ctx.beginPath();
        ctx.arc(eyeX - sideX * r * 0.028, eyeY - sideY * r * 0.028, Math.max(0.55, r * 0.018), 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'extinguisher': {
      const spin = time * 0.12 + w * 0.08;

      // 铁面不是一整块：两层甲环与短接缝把它压成有厚度的熄灭器。
      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();
      ctx.fillStyle = 'rgba(5,3,13,0.18)';
      ctx.fillRect(e.x - r * 1.2, e.y - r * 1.2, r * 2.4, r * 2.4);
      for (let ring = 0; ring < 2; ring += 1) {
        const rr = r * (0.56 + ring * 0.23);
        const rot = spin + ring * (Math.PI / 8);
        ctx.strokeStyle = 'rgba(4,3,12,0.42)';
        ctx.lineWidth = 1.7;
        poly(ctx, e.x, e.y, rr, 8, rot, 1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(189,174,235,0.12)';
        ctx.lineWidth = 0.65;
        poly(ctx, e.x, e.y, rr + r * 0.012, 8, rot, 1);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(4,3,12,0.38)';
      ctx.lineWidth = 1.15;
      for (let seam = 0; seam < 8; seam += 1) {
        const a = spin + seam * (TAU / 8) + Math.PI / 8;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.58, e.y + Math.sin(a) * r * 0.58);
        ctx.lineTo(e.x + Math.cos(a) * r * 0.8, e.y + Math.sin(a) * r * 0.8);
        ctx.stroke();
      }

      // 面心是一圈吞光的暗铁，不额外发光，等眼睛落在它上面。
      const mask = ctx.createRadialGradient(e.x, e.y, r * 0.08, e.x, e.y, r * 0.56);
      mask.addColorStop(0, 'rgba(3,2,9,0.5)');
      mask.addColorStop(0.62, 'rgba(8,5,19,0.25)');
      mask.addColorStop(1, 'rgba(8,5,19,0)');
      ctx.fillStyle = mask;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.56, 0, TAU);
      ctx.fill();

      // 冷凝的冷紫裂纹，避开中央眼睛的位置。
      ctx.strokeStyle = 'rgba(159,137,226,0.2)';
      ctx.lineWidth = 0.9;
      for (let crack = 0; crack < 3; crack += 1) {
        const a = spin * 1.3 + crack * 2.2 + 0.5;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 0.22, e.y + Math.sin(a) * r * 0.22);
        ctx.lineTo(e.x + Math.cos(a + 0.2) * r * 0.42, e.y + Math.sin(a + 0.2) * r * 0.42);
        ctx.lineTo(e.x + Math.cos(a + 0.08) * r * 0.68, e.y + Math.sin(a + 0.08) * r * 0.68);
        ctx.stroke();
      }

      for (let rivet = 0; rivet < 8; rivet += 1) {
        const a = spin + rivet * (TAU / 8) + Math.PI / 8;
        const rr = r * 0.78;
        const rx = e.x + Math.cos(a) * rr;
        const ry = e.y + Math.sin(a) * rr;
        ctx.fillStyle = 'rgba(5,3,13,0.74)';
        ctx.beginPath();
        ctx.arc(rx, ry, Math.max(1.2, r * 0.038), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(188,172,236,0.2)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.restore();

      // 六枚熄灯罩：短铁臂、钟形罩口，再拖一缕被掐灭后的冷烟。
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + time * 0.16;
        const baseX = e.x + Math.cos(a) * r * 0.9;
        const baseY = e.y + Math.sin(a) * r * 0.9;
        const capX = e.x + Math.cos(a) * r * 1.17;
        const capY = e.y + Math.sin(a) * r * 1.17;
        ctx.strokeStyle = 'rgba(7,5,16,0.78)';
        ctx.lineWidth = Math.max(2, r * 0.055);
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(capX, capY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(186,170,235,0.2)';
        ctx.lineWidth = 0.75;
        ctx.stroke();

        ctx.save();
        ctx.translate(capX, capY);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(27,19,46,0.94)';
        ctx.beginPath();
        ctx.moveTo(-r * 0.09, -r * 0.035);
        ctx.quadraticCurveTo(0, -r * 0.15, r * 0.09, -r * 0.035);
        ctx.lineTo(r * 0.115, r * 0.055);
        ctx.quadraticCurveTo(0, r * 0.115, -r * 0.115, r * 0.055);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(211,198,246,0.46)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.fillStyle = 'rgba(2,1,5,0.88)';
        ctx.beginPath();
        ctx.ellipse(r * 0.02, r * 0.035, r * 0.062, r * 0.032, 0, 0, TAU);
        ctx.fill();
        ctx.restore();

        if (i % 2 === 0) {
          const drift = Math.sin(time * 1.4 + i * 1.7 + w) * r * 0.08;
          const lift = r * (0.18 + Math.sin(time * 1.1 + i) * 0.045);
          ctx.strokeStyle = 'rgba(190,183,215,0.26)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(capX + Math.cos(a) * r * 0.08, capY + Math.sin(a) * r * 0.08);
          ctx.bezierCurveTo(
            capX + Math.cos(a) * r * 0.16 + drift,
            capY - lift * 0.35,
            capX - drift * 0.7,
            capY - lift * 0.72,
            capX + drift * 0.4,
            capY - lift,
          );
          ctx.stroke();
        }
      }
      ctx.restore();

      // 最外面仍留一圈熄灭色的冷针，提醒它正在“掐灯”。
      ctx.strokeStyle = 'rgba(181,158,255,0.28)';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + time * 0.16 + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * r * 1.25, e.y + Math.sin(a) * r * 1.25);
        ctx.lineTo(e.x + Math.cos(a) * r * 1.38, e.y + Math.sin(a) * r * 1.38);
        ctx.stroke();
      }
      break;
    }
    case 'emberwake': {
      const facingX = Math.cos(e.angle);
      const facingY = Math.sin(e.angle);
      const breath = 0.5 + Math.sin(time * 3.1 + w) * 0.5;
      const spin = time * 0.25;

      ctx.save();
      bodyPath(ctx, e, id, time);
      ctx.clip();

      // 表面先压一层背光的焦壳，让红色只在裂缝与迎光侧透出来。
      const char = ctx.createRadialGradient(
        e.x + facingX * r * 0.24,
        e.y + facingY * r * 0.24,
        r * 0.06,
        e.x,
        e.y,
        r * 1.04,
      );
      char.addColorStop(0, 'rgba(91,20,11,0.05)');
      char.addColorStop(0.5, 'rgba(47,8,7,0.23)');
      char.addColorStop(1, 'rgba(17,3,4,0.48)');
      ctx.fillStyle = char;
      ctx.fillRect(e.x - r * 1.4, e.y - r * 1.4, r * 2.8, r * 2.8);

      // 三块彼此错开的焦黑壳片，边缘起伏但不破坏八边形剪影。
      for (let plate = 0; plate < 3; plate += 1) {
        const base = spin * 0.7 + plate * 2.15 + w * 0.08;
        const plateX = e.x + Math.cos(base) * r * 0.33;
        const plateY = e.y + Math.sin(base) * r * 0.33;
        const plateRadius = r * (0.31 + plate * 0.045);
        ctx.beginPath();
        for (let point = 0; point < 7; point += 1) {
          const a = base + (point / 7) * TAU + Math.sin(w + point * 1.3 + plate) * 0.08;
          const rr = plateRadius * (0.74 + Math.abs(Math.sin(point * 2.4 + plate + w)) * 0.32);
          const px = plateX + Math.cos(a) * rr;
          const py = plateY + Math.sin(a) * rr;
          if (point === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(29,5,5,0.34)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,174,84,0.13)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // 分叉熔岩：暗红底光、亮黄芯，裂缝随八边形一起慢转。
      ctx.lineCap = 'round';
      for (let crack = 0; crack < 5; crack += 1) {
        const a = spin + crack * (TAU / 5) + w * 0.12 + 0.18;
        const jitter = Math.sin(w * 0.8 + crack * 1.7) * 0.18;
        const points = [
          [e.x + Math.cos(a) * r * 0.12, e.y + Math.sin(a) * r * 0.12],
          [e.x + Math.cos(a + jitter) * r * 0.38, e.y + Math.sin(a + jitter) * r * 0.38],
          [e.x + Math.cos(a - jitter * 0.7) * r * 0.62, e.y + Math.sin(a - jitter * 0.7) * r * 0.62],
          [e.x + Math.cos(a + jitter * 0.5) * r * 0.9, e.y + Math.sin(a + jitter * 0.5) * r * 0.9],
        ];
        ctx.strokeStyle = `rgba(255,103,35,${0.3 + breath * 0.08})`;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let point = 1; point < points.length; point += 1) {
          ctx.lineTo(points[point][0], points[point][1]);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,226,151,0.68)';
        ctx.lineWidth = 1.05;
        ctx.stroke();

        if (crack % 2 === 0) {
          const branchA = a - jitter - 0.26;
          ctx.strokeStyle = 'rgba(255,123,44,0.34)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(points[2][0], points[2][1]);
          ctx.lineTo(e.x + Math.cos(branchA) * r * 0.78, e.y + Math.sin(branchA) * r * 0.78);
          ctx.stroke();
        }
      }

      // 壳片之间的小熔孔，近景提供零星的亮点但不新增光源。
      ctx.globalCompositeOperation = 'lighter';
      for (let vent = 0; vent < 5; vent += 1) {
        const a = spin * 1.2 + vent * (TAU / 5) + 0.8;
        const rr = r * (0.42 + ((vent * 17) % 21) / 48);
        const pulse = 0.45 + Math.sin(time * 4 + vent * 1.9 + w) * 0.3;
        ctx.fillStyle = `rgba(255,190,88,${0.3 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, Math.max(0.6, r * 0.026), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 外围上升的余烬：越远越暗，像战场被它烤热后自己浮起来。
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let spark = 0; spark < 5; spark += 1) {
        const cycle = (time * 0.24 + spark * 0.19 + w * 0.02) % 1;
        const a = spin * 0.35 + spark * (TAU / 5) + 0.4;
        const outward = r * (1.01 + cycle * 0.26);
        const px = e.x + Math.cos(a) * outward + Math.sin(time * 2 + spark * 1.7) * r * 0.05;
        const py = e.y + Math.sin(a) * outward - r * 0.24 * cycle;
        ctx.fillStyle = `rgba(255,142,54,${(1 - cycle) * 0.44})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.55, r * (0.025 - cycle * 0.008)), 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(132,67,46,0.14)';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      for (let plume = 0; plume < 2; plume += 1) {
        const startX = e.x + (plume === 0 ? -1 : 1) * r * 0.22;
        const startY = e.y - r * 0.74;
        const sway = Math.sin(time * 1.5 + plume * 2.3 + w) * r * 0.12;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(
          startX - r * 0.12 + sway,
          startY - r * 0.24,
          startX + r * 0.16 - sway,
          startY - r * 0.46,
          startX + sway * 1.4,
          startY - r * 0.7,
        );
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    default:
      break;
  }
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  time: number,
  px: number,
  py: number,
  walls: readonly Rect[] = [],
): void {
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
  // 回响是"过去的你的影子"，所以整体压成半透明，跟实体敌人区分开
  if (id === 'echo' && e.hitFlash <= 0) ctx.globalAlpha = 0.82;
  shadow(ctx, e);
  if (e.elite) eliteHalo(ctx, e, time);
  bodyPath(ctx, e, id, time);
  litFill(ctx, e, px, py, body, r);
  bodySheen(ctx, e, id, time, body);
  rimStroke(ctx, e, e.boss ? 4 : 2, px, py);
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
    // 无光者只剩一道惨白的裂口；裂口不是一个整齐的椭圆，而是被折开的冷光。
    const dirX = Math.cos(e.angle);
    const dirY = Math.sin(e.angle);
    const sideX = -dirY;
    const sideY = dirX;
    const cx = e.x + dirX * r * 0.27;
    const cy = e.y + dirY * r * 0.27;
    const length = r * 0.38;
    const width = r * 0.115;
    const knot = Math.sin(e.wobble * 1.9) * width * 0.12;
    const riftPoint = (along: number, across: number): [number, number] => [
      cx + dirX * length * along + sideX * width * across,
      cy + dirY * length * along + sideY * width * across,
    ];
    const rift = [
      riftPoint(0.62, 0.05),
      riftPoint(0.35, 0.96),
      riftPoint(0.18, 0.36 + knot),
      riftPoint(-0.12, 0.9),
      riftPoint(-0.34, 0.3 - knot),
      riftPoint(-0.82, -0.12),
      riftPoint(-0.42, -0.94),
      riftPoint(-0.1, -0.36 + knot),
      riftPoint(0.22, -0.88),
      riftPoint(0.42, -0.3 - knot),
    ];
    const frontX = rift[0][0];
    const frontY = rift[0][1];
    const backX = rift[5][0];
    const backY = rift[5][1];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const riftGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.52);
    riftGlow.addColorStop(0, 'rgba(171,201,255,0.16)');
    riftGlow.addColorStop(0.52, 'rgba(102,133,215,0.05)');
    riftGlow.addColorStop(1, 'rgba(78,103,182,0)');
    ctx.fillStyle = riftGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath();
    ctx.moveTo(rift[0][0], rift[0][1]);
    for (let point = 1; point < rift.length; point += 1) {
      ctx.lineTo(rift[point][0], rift[point][1]);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(95,136,218,0.8)';
    ctx.lineWidth = Math.max(0.75, r * 0.026);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(backX + dirX * length * 0.08, backY + dirY * length * 0.08);
    ctx.lineTo(cx - sideX * width * 0.18, cy - sideY * width * 0.18);
    ctx.lineTo(cx + sideX * width * 0.24 + dirX * length * 0.08, cy + sideY * width * 0.24 + dirY * length * 0.08);
    ctx.lineTo(frontX, frontY);
    ctx.stroke();
  } else {
    spitterCharge(ctx, e, time);
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

  // 「标灯」：被旋灯照出来的那几只挂一圈细环。刻意不用慢/灼烧那种**实心**光晕——
  // 那两种是"状态"，这一种是"被标出来了"，环才读得出是这个意思（而且它常和缠网的蓝晕同时在场，
  // 两个实心块叠在一起就分不出谁是谁了）。
  if (e.vortexMark > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#d8c0ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.3, 0, TAU);
    ctx.stroke();
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
    const beat = Math.abs(Math.sin(time * 22));
    const rr = 118 * (0.55 + 0.45 * t);

    // 引信烧到哪儿，脚下的焦痕就先压到哪儿：一圈内暗外透的热土把爆炸半径坐实。
    ctx.globalCompositeOperation = 'source-over';
    const scorch = ctx.createRadialGradient(e.x, e.y, rr * 0.12, e.x, e.y, rr);
    scorch.addColorStop(0, `rgba(49,11,5,${0.08 + t * 0.08})`);
    scorch.addColorStop(0.72, `rgba(83,20,8,${0.05 + t * 0.07})`);
    scorch.addColorStop(1, 'rgba(110,30,10,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = scorch;
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07 + t * 0.06;
    ctx.strokeStyle = '#ff4d1f';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.45 + 0.45 * beat;
    ctx.strokeStyle = '#ff6a2f';
    ctx.lineWidth = 2.2 + t * 1.1;
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr, 0, TAU);
    ctx.stroke();

    // 内圈比外环走得更快，像引信在圈里一圈圈收紧。
    ctx.globalAlpha = 0.18 + t * 0.32;
    ctx.strokeStyle = '#ffc07a';
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3 + t * 4, 8 - t * 3]);
    ctx.lineDashOffset = -time * (18 + t * 26);
    ctx.beginPath();
    ctx.arc(e.x, e.y, rr * 0.82, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // 十道向内扎的刻度：主环之外不再画第二条承诺，只让这一圈的“心跳”更硬。
    ctx.strokeStyle = '#ff9a52';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + time * 0.22;
      ctx.globalAlpha = (0.18 + t * 0.36) * (0.66 + 0.34 * beat);
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
      ctx.lineTo(e.x + Math.cos(a) * (rr - 4 - t * 3), e.y + Math.sin(a) * (rr - 4 - t * 3));
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  if (e.def.behavior === 'charge' && e.stateTimer > 0) {
    const t = 1 - e.stateTimer / 0.6;
    // v101：预警线是"它这一下会冲到哪儿"，而冲锋本身会撞停在墙面上（v84）。
    // 线画满 340px 会穿过墙，给一个实际到不了的承诺；和光矛 / 抽油线一样只画到墙面。
    const dirX = Math.cos(e.angle);
    const dirY = Math.sin(e.angle);
    const sideX = -dirY;
    const sideY = dirX;
    const reach = rayWalls(e.x, e.y, dirX, dirY, 340, walls);
    const endX = e.x + dirX * reach;
    const endY = e.y + dirY * reach;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 先铺一条低亮度的冲锋走廊：宽度从刺脊脚下微微张开，和"它这么宽会撞过来"对得上。
    const lane = ctx.createLinearGradient(e.x, e.y, endX, endY);
    lane.addColorStop(0, `rgba(255,90,134,${0.025 + t * 0.035})`);
    lane.addColorStop(0.72, `rgba(255,90,134,${0.045 + t * 0.08})`);
    lane.addColorStop(1, 'rgba(255,90,134,0)');
    ctx.fillStyle = lane;
    const half = 5.2 + t * 3.2;
    ctx.beginPath();
    ctx.moveTo(e.x - sideX * half * 0.35, e.y - sideY * half * 0.35);
    ctx.lineTo(endX - sideX * half, endY - sideY * half);
    ctx.lineTo(endX + sideX * half, endY + sideY * half);
    ctx.lineTo(e.x + sideX * half * 0.35, e.y + sideY * half * 0.35);
    ctx.closePath();
    ctx.fill();

    // 中轴仍是那条可量的预警线；虚线向前流动，蓄力越满走得越快。
    ctx.globalAlpha = 0.34 + 0.48 * t;
    ctx.strokeStyle = '#ffd0de';
    ctx.lineWidth = 1.7 + 1.2 * t;
    ctx.setLineDash([12 + 8 * t, 9 - 3 * t]);
    ctx.lineDashOffset = -time * (34 + t * 46);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // 两条侧轨把"危险走廊"框出来，不和中间那条判读线抢亮度。
    const rail = 6.4 + t * 4.2;
    ctx.strokeStyle = '#ff5a86';
    ctx.lineWidth = 1 + 0.8 * t;
    for (const side of [-1, 1]) {
      ctx.globalAlpha = 0.16 + 0.32 * t;
      ctx.beginPath();
      ctx.moveTo(e.x + sideX * rail * side, e.y + sideY * rail * side);
      ctx.lineTo(endX + sideX * rail * side, endY + sideY * rail * side);
      ctx.stroke();
    }

    // 走廊里向前游动的短箭纹：一眼能看出它要往哪边冲，而不是只看到一根红线。
    const span = Math.max(0, reach - 22);
    const gap = 43;
    const scroll = (time * (42 + t * 30)) % gap;
    ctx.strokeStyle = '#ff8aa7';
    ctx.lineWidth = 1.1;
    for (let d = 16 + scroll; d < span; d += gap) {
      const px = e.x + dirX * d;
      const py = e.y + dirY * d;
      const size = 3 + 1.8 * t;
      ctx.globalAlpha = (0.16 + t * 0.3) * (0.72 + 0.28 * Math.sin(time * 6 + d * 0.11));
      ctx.beginPath();
      ctx.moveTo(px - sideX * size, py - sideY * size);
      ctx.lineTo(px + dirX * size * 1.7, py + dirY * size * 1.7);
      ctx.lineTo(px + sideX * size, py + sideY * size);
      ctx.stroke();
    }

    // 末端的横括弧就是它实际会停下的地方；墙前与空地上的长度仍是同一个 `reach`。
    ctx.globalAlpha = 0.34 + 0.38 * t;
    ctx.strokeStyle = '#ffd0de';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(endX - sideX * 6.5, endY - sideY * 6.5);
    ctx.lineTo(endX + sideX * 6.5, endY + sideY * 6.5);
    ctx.stroke();

    ctx.globalAlpha = 0.3 + 0.5 * t;
    ctx.strokeStyle = '#ff5a86';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * (1.35 + t * 0.6), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  if (e.defId === 'beacon') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const radius = 210;
    // v102：速度光环已经只增益墙这一侧（v99），虚线却还画满整圆。
    // 这圈线是"它能照顾到哪儿"的承诺，得和光照一样停在墙面上：
    // 用 72 个角度采样问同一句 `rayWalls`，只把可见的连续区间画成弧。
    const segments = 72;
    const visible: boolean[] = [];
    for (let i = 0; i < segments; i += 1) {
      const a = ((i + 0.5) / segments) * TAU;
      visible.push(rayWalls(e.x, e.y, Math.cos(a), Math.sin(a), radius, walls) >= radius);
    }

    const traceAura = (rr: number): void => {
      if (visible.every(Boolean)) {
        ctx.arc(e.x, e.y, rr, 0, TAU);
        return;
      }
      for (let i = 0; i < segments;) {
        if (!visible[i]) {
          i += 1;
          continue;
        }
        let end = i;
        while (end + 1 < segments && visible[end + 1]) end += 1;
        const a0 = (i / segments) * TAU;
        const a1 = ((end + 1) / segments) * TAU;
        ctx.moveTo(e.x + Math.cos(a0) * rr, e.y + Math.sin(a0) * rr);
        ctx.arc(e.x, e.y, rr, a0, a1);
        i = end + 1;
      }
    };

    // 同一条路径先压宽热晕，再落虚线主缘；墙后的缺口在三层里完全一致。
    ctx.beginPath();
    traceAura(radius);
    ctx.strokeStyle = '#ffe9a8';
    ctx.globalAlpha = 0.045;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.globalAlpha = 0.13;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 内圈的短刻线以更慢的速度反向走，像灯罩里绕行的祝祷纹。
    ctx.beginPath();
    traceAura(radius * 0.94);
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#ffd98f';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([2.5, 12]);
    ctx.lineDashOffset = time * 13;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // 六枚沿环巡游的菱形刻点：只落在没有墙的角度，不越过自己的承诺。
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i += 1) {
      const a = time * 0.19 + (i / 6) * TAU + e.wobble * 0.1;
      const slot = Math.floor((a % TAU) / TAU * segments) % segments;
      if (!visible[slot]) continue;
      const rr = radius - 13;
      const mx = e.x + Math.cos(a) * rr;
      const my = e.y + Math.sin(a) * rr;
      const s = 1.8 + (i % 2) * 0.7;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(a + Math.PI / 4);
      ctx.globalAlpha = 0.2 + 0.12 * Math.sin(time * 2.4 + i * 1.7);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  if (e.def.behavior === 'siphon' && e.hitFlash <= 0) {
    const dx = px - e.x;
    const dy = py - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1 && d < 460) {
      // v98：抽油已经停在墙面上（v97），画出来的那根线也得停在同一处。
      // `rayWalls` 与 `wallBetween` 用的是同一条线段：1 = 一路通到玩家，
      // 小于 1 就是先撞上了墙，线只画到墙面为止。
      const reach = rayWalls(e.x, e.y, dx, dy, 1, walls);
      const endX = e.x + dx * reach;
      const endY = e.y + dy * reach;
      const nx = -dy / d;
      const ny = dx / d;
      const len = d * reach;
      const bendMax = Math.min(13, 3.5 + len * 0.018);
      const strand = (offset: number, phase: number): [number, number, number, number] => {
        // 固定偏置 + 行进波：任何一帧都不会恰好绷成直线，但起伏仍然连续。
        const fixed = Math.sin(phase * 1.9 + e.wobble * 1.3) * bendMax * 0.52;
        const sway = fixed + Math.sin(time * 3.1 + phase + e.wobble) * bendMax * (0.48 + offset * 0.22);
        const cross = offset * Math.min(9, 2.5 + len * 0.01);
        return [
          e.x + dx * reach * 0.34 + nx * (cross + sway),
          e.y + dy * reach * 0.34 + ny * (cross + sway),
          e.x + dx * reach * 0.68 + nx * (cross - sway * 0.7),
          e.y + dy * reach * 0.68 + ny * (cross - sway * 0.7),
        ];
      };

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // 先压一根近黑的缆芯：抽取线穿过灯火最亮的地方时也要有实体感。
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = '#140a1e';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.quadraticCurveTo(
        e.x + dx * reach * 0.5 + nx * Math.sin(time * 2.7 + e.wobble) * bendMax * 0.55,
        e.y + dy * reach * 0.5 + ny * Math.sin(time * 2.7 + e.wobble) * bendMax * 0.55,
        endX,
        endY,
      );
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';

      // 宽而暗的底束先把"有东西连着他"铺出来，再让两股细丝互相绞着走。
      ctx.globalAlpha = 0.11 + 0.035 * Math.sin(time * 4.2 + e.wobble);
      ctx.strokeStyle = '#a75be0';
      ctx.lineWidth = 6.2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      for (let i = 0; i < 2; i += 1) {
        const [c1x, c1y, c2x, c2y] = strand(i === 0 ? -1 : 1, i * 2.37);
        ctx.globalAlpha = 0.25 + 0.13 * Math.sin(time * 7.4 + i * 2.1 + e.wobble);
        ctx.strokeStyle = i === 0 ? '#c98fe8' : '#e6bdff';
        ctx.lineWidth = i === 0 ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
        ctx.stroke();
      }

      // 光珠从灯这一端被抽回吸取者：走向本身就是这套机制最直观的说明。
      for (let i = 0; i < 3; i += 1) {
        const travel = (time * 0.42 + i / 3 + e.wobble * 0.08) % 1;
        const u = 1 - travel;
        const drift = Math.sin(time * 4.6 + i * 2.1 + e.wobble) * Math.min(4.5, 1.2 + len * 0.006);
        const bx = e.x + dx * reach * u + nx * drift;
        const by = e.y + dy * reach * u + ny * drift;
        const glow = Math.sin(Math.PI * travel);
        ctx.globalAlpha = glow * 0.2;
        ctx.fillStyle = '#a75be0';
        ctx.beginPath();
        ctx.arc(bx, by, 3.1 + glow * 1.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.28 + glow * 0.52;
        ctx.fillStyle = i === 1 ? '#fff2d2' : '#d6a0f4';
        ctx.beginPath();
        ctx.arc(bx, by, 0.9 + glow * 1.45, 0, TAU);
        ctx.fill();
      }

      ctx.globalAlpha = 0.22 + 0.12 * Math.sin(time * 8.3 + e.wobble);
      ctx.strokeStyle = '#b978e4';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(endX, endY, 3.2 + Math.sin(time * 5.2 + e.wobble) * 0.7, 0.15, Math.PI * 1.15);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (e.affix) {
    affixSigil(ctx, e, time);
  }

  if (e.boss && e.bossCd > 0 && e.bossCd < 0.6) {
    const t = 1 - e.bossCd / 0.6;
    bossTelegraph(ctx, e, time, t);
  }

  if (e.elite || e.boss) {
    const bw = e.boss ? 140 : 48;
    const bh = e.boss ? 7 : 5;
    const y = e.y - r - 14;
    const frac = Math.max(0, Math.min(1, e.hp / e.maxHp));
    const x0 = e.x - bw / 2;
    const accent = e.boss ? '#ff4d6d' : '#ffb14e';
    const frame = e.boss ? 'rgba(255,120,144,0.5)' : 'rgba(255,208,146,0.42)';

    // 暗玻璃铭牌：切角端头 + 双层细边，血条不再像一条贴在背景上的矩形色块。
    const notch = e.boss ? 3.5 : 2.5;
    const plate = (): void => {
      ctx.beginPath();
      ctx.moveTo(x0 - 2 + notch, y - 2);
      ctx.lineTo(x0 + bw + 2 - notch, y - 2);
      ctx.lineTo(x0 + bw + 2, y - 2 + bh * 0.5);
      ctx.lineTo(x0 + bw + 2 - notch, y + bh + 2);
      ctx.lineTo(x0 - 2 + notch, y + bh + 2);
      ctx.lineTo(x0 - 2, y - 2 + bh * 0.5);
      ctx.closePath();
    };
    ctx.fillStyle = 'rgba(3,3,8,0.8)';
    plate();
    ctx.fill();
    ctx.strokeStyle = frame;
    ctx.lineWidth = 0.9;
    plate();
    ctx.stroke();

    // 血槽：底是一条冷黑凹槽，活下来的部分用熔色渐变，末端保留一枚亮血锋。
    ctx.fillStyle = 'rgba(1,2,6,0.72)';
    ctx.fillRect(x0, y, bw, bh);
    if (frac > 0.001) {
      const fill = ctx.createLinearGradient(0, y, 0, y + bh);
      fill.addColorStop(0, e.boss ? '#ff9bad' : '#ffe1a1');
      fill.addColorStop(0.42, accent);
      fill.addColorStop(1, e.boss ? '#7b1029' : '#8f4d0a');
      ctx.fillStyle = fill;
      ctx.fillRect(x0, y, bw * frac, bh);
      ctx.fillStyle = 'rgba(255,244,226,0.72)';
      ctx.fillRect(x0 + bw * frac - Math.min(1.4, bw * frac), y, Math.min(1.4, bw * frac), bh);
    }

    // 十等分刻度：只压一点点暗线，既能读进度，又不会把血条切成串珠。
    ctx.fillStyle = 'rgba(3,3,8,0.34)';
    for (let i = 1; i < 10; i += 1) {
      ctx.fillRect(x0 + (bw * i) / 10, y + (e.boss ? 0.8 : 0.5), 0.65, bh - (e.boss ? 1.6 : 1));
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(x0 - 1, y - 3, bw + 2, 1.2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (e.elite) {
      const aff = e.affix ? AFFIX_MAP[e.affix] : null;
      ctx.fillStyle = aff?.color ?? '#ffd9a0';
      ctx.fillRect(e.x - bw / 2 - 3.5, y, 1.5, bh);
      // 两端各一枚小小的灯钉，让这条血条像器物上的铭牌，而不是 UI 浮层
      ctx.beginPath();
      ctx.moveTo(e.x - bw / 2 - 4.5, y - 4);
      ctx.lineTo(e.x - bw / 2 - 2, y - 4.5);
      ctx.lineTo(e.x - bw / 2 - 2, y - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(e.x + bw / 2 + 4.5, y - 4);
      ctx.lineTo(e.x + bw / 2 + 2, y - 4.5);
      ctx.lineTo(e.x + bw / 2 + 2, y - 1.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (spawnT < 1) ctx.restore();
}
