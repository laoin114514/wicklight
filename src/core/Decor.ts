/**
 * 关卡布景：为每个主题绘制可辨识的地面陈设（树、蘑菇、石柱、熔岩裂隙……）。
 * 亮部交给泛光处理，因此不需要额外光源就能“发光”。
 */
import type { Decor } from '../systems/LevelGen';

const TAU = Math.PI * 2;

function tree(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const sway = Math.sin(time * 0.6 + d.x * 0.01) * 2.5;
  // 树干（带一点根部阴影，别让它像飘在空中）
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.58, d.r * 0.34, d.r * 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1b1710';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.13, d.y + d.r * 0.58);
  ctx.lineTo(d.x - d.r * 0.06, d.y - d.r * 0.15);
  ctx.lineTo(d.x + d.r * 0.06, d.y - d.r * 0.15);
  ctx.lineTo(d.x + d.r * 0.13, d.y + d.r * 0.58);
  ctx.closePath();
  ctx.fill();
  // 三层树冠：外深内浅，边缘压深轮廓让它从雾里"切"出来
  const crown = (ox: number, oy: number, rr: number, fill: string, outline: boolean): void => {
    ctx.beginPath();
    ctx.arc(ox, oy, rr, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = 'rgba(4,10,7,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  crown(d.x + sway * 0.4, d.y - d.r * 0.2, d.r * 0.6, '#16301f', true);
  crown(d.x - d.r * 0.34 + sway * 0.5, d.y - d.r * 0.02, d.r * 0.44, '#1c3d26', true);
  crown(d.x + d.r * 0.34 + sway * 0.5, d.y - d.r * 0.06, d.r * 0.4, '#1a3823', true);
  crown(d.x + sway * 0.6, d.y - d.r * 0.52, d.r * 0.4, '#24492e', false);
  // 顶部一点冷色天光/反向的叶隙高光
  ctx.fillStyle = 'rgba(150,235,180,0.16)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.18 + sway * 0.6, d.y - d.r * 0.58, d.r * 0.24, d.r * 0.15, -0.5, 0, TAU);
  ctx.fill();
}

function mushrooms(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const pulse = 0.7 + Math.sin(time * 1.6 + d.x * 0.02) * 0.3;
  // 柔和的菌丝辉光（克制一点，别糊成一团绿雾）
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 1.5);
  halo.addColorStop(0, `rgba(140,240,190,${0.2 * pulse})`);
  halo.addColorStop(1, 'rgba(60,180,130,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 1.5, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // 三朵有柄有伞帽的小蘑菇
  for (let i = 0; i < 3; i += 1) {
    const ox = d.x + Math.cos(i * 2.1) * d.r * 0.42;
    const oy = d.y + Math.sin(i * 1.7) * d.r * 0.3;
    const sr = d.r * (0.12 + i * 0.035);
    ctx.fillStyle = '#375c47';
    ctx.fillRect(ox - sr * 0.16, oy, sr * 0.32, sr * 0.9);
    const cap = ctx.createRadialGradient(ox - sr * 0.25, oy - sr * 0.2, sr * 0.05, ox, oy, sr);
    cap.addColorStop(0, `rgba(190,255,220,${0.75 + 0.25 * pulse})`);
    cap.addColorStop(0.55, `rgba(110,215,165,${0.7 * pulse})`);
    cap.addColorStop(1, 'rgba(40,120,85,0.85)');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(ox, oy, sr, sr * 0.62, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
  }
}

function rock(ctx: CanvasRenderingContext2D, d: Decor): void {
  ctx.fillStyle = '#1d2a22';
  ctx.beginPath();
  for (let i = 0; i <= 6; i += 1) {
    const a = (i / 6) * TAU;
    const rr = d.r * (0.34 + (i % 2) * 0.14);
    const px = d.x + Math.cos(a) * rr;
    const py = d.y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.1, d.y - d.r * 0.12, d.r * 0.2, d.r * 0.1, 0, 0, TAU);
  ctx.fill();
}

function pillar(ctx: CanvasRenderingContext2D, d: Decor, themeId: string): void {
  const night = themeId === 'nightcity';
  const w = d.r * 0.52;
  const h = d.r * 1.05;
  const top = d.y - h * 0.62;
  const body = night ? '#31264a' : '#2b2e42';
  const lit = night ? '#4e3d70' : '#3a3d52';
  const dark = night ? '#171322' : '#171927';

  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(d.x + w * 0.12, d.y + h * 0.43, w * 0.86, h * 0.18, -0.12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.fillRect(d.x - w / 2, top, w, h);
  ctx.fillStyle = lit;
  ctx.fillRect(d.x - w * 0.72, d.y - h * 0.72, w * 1.44, h * 0.14);
  ctx.fillRect(d.x - w / 2, top, w * 0.18, h);
  ctx.fillStyle = dark;
  ctx.fillRect(d.x + w * 0.28, top, w * 0.22, h);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(d.x - w / 2, d.y + h * 0.2, w, h * 0.2);
  ctx.fillStyle = night ? '#241b38' : '#222537';
  ctx.fillRect(d.x - w * 0.7, top + h * 0.87, w * 1.4, h * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  for (const at of [0.24, 0.53, 0.79]) {
    ctx.beginPath();
    ctx.moveTo(d.x - w * 0.45, top + h * at);
    ctx.lineTo(d.x + w * 0.45, top + h * at + 1.4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(d.x - w * 0.2, d.y - h * 0.5);
  ctx.lineTo(d.x + w * 0.1, d.y - h * 0.1);
  ctx.lineTo(d.x - w * 0.05, d.y + h * 0.3);
  ctx.stroke();
  ctx.strokeStyle = night ? 'rgba(180,150,255,0.16)' : 'rgba(160,185,235,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(d.x + w * 0.15, top + h * 0.16);
  ctx.lineTo(d.x + w * 0.03, top + h * 0.34);
  ctx.stroke();

  if (night) {
    ctx.save();
    ctx.translate(d.x, top + h * 0.54);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#c9a3ff';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.09);
    ctx.lineTo(w * 0.18, 0);
    ctx.lineTo(0, h * 0.09);
    ctx.lineTo(-w * 0.18, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.3, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function rubble(ctx: CanvasRenderingContext2D, d: Decor, themeId: string): void {
  const night = themeId === 'nightcity';
  ctx.fillStyle = night ? '#251e38' : '#232638';
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.9;
    const ox = d.x + Math.cos(a) * d.r * 0.42;
    const oy = d.y + Math.sin(a) * d.r * 0.3;
    ctx.fillStyle = i % 2 ? night ? '#34284f' : '#2c3043' : night ? '#201a30' : '#1d2030';
    ctx.beginPath();
    ctx.ellipse(ox, oy, d.r * 0.18, d.r * 0.12, a, 0, TAU);
    ctx.fill();
    ctx.fillStyle = night ? 'rgba(190,160,255,0.08)' : 'rgba(190,205,245,0.07)';
    ctx.beginPath();
    ctx.ellipse(ox - d.r * 0.04, oy - d.r * 0.045, d.r * 0.08, d.r * 0.04, a, 0, TAU);
    ctx.fill();
  }
}

function brazier(ctx: CanvasRenderingContext2D, d: Decor, time: number, themeId: string): void {
  const night = themeId === 'nightcity';
  const flick = 0.75 + Math.sin(time * 8 + d.x * 0.05) * 0.25;
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.3, d.r * 0.38, d.r * 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? '#2b213f' : '#2b2e42';
  ctx.fillRect(d.x - d.r * 0.1, d.y + d.r * 0.05, d.r * 0.2, d.r * 0.24);
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.3, d.y + d.r * 0.06);
  ctx.lineTo(d.x + d.r * 0.3, d.y + d.r * 0.06);
  ctx.lineTo(d.x + d.r * 0.2, d.y + d.r * 0.28);
  ctx.lineTo(d.x - d.r * 0.2, d.y + d.r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = night ? '#8066a8' : '#59617d';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.06, d.r * 0.31, d.r * 0.11, 0, 0, TAU);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(d.x, d.y - d.r * 0.25, 0, d.x, d.y - d.r * 0.25, d.r * 1.15);
  g.addColorStop(0, night ? `rgba(235,215,255,${0.5 * flick})` : `rgba(200,225,255,${0.48 * flick})`);
  g.addColorStop(0.38, night ? `rgba(170,120,255,${0.2 * flick})` : `rgba(130,160,255,${0.18 * flick})`);
  g.addColorStop(1, night ? 'rgba(110,60,200,0)' : 'rgba(60,80,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(d.x, d.y - d.r * 0.25, d.r * 1.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? 'rgba(225,195,255,0.72)' : 'rgba(205,225,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(d.x, d.y + d.r * 0.04);
  ctx.bezierCurveTo(d.x - d.r * 0.16, d.y - d.r * 0.1, d.x - d.r * 0.11, d.y - d.r * 0.34 * flick, d.x, d.y - d.r * 0.44 * flick);
  ctx.bezierCurveTo(d.x + d.r * 0.11, d.y - d.r * 0.32 * flick, d.x + d.r * 0.16, d.y - d.r * 0.08, d.x, d.y + d.r * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = night ? 'rgba(250,242,255,0.82)' : 'rgba(240,248,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(d.x, d.y);
  ctx.quadraticCurveTo(d.x - d.r * 0.05, d.y - d.r * 0.16, d.x, d.y - d.r * 0.27 * flick);
  ctx.quadraticCurveTo(d.x + d.r * 0.06, d.y - d.r * 0.14, d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function shard(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  ctx.fillStyle = '#2a1a18';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.3, d.y + d.r * 0.3);
  ctx.lineTo(d.x - d.r * 0.05, d.y - d.r * 0.85);
  ctx.lineTo(d.x + d.r * 0.22, d.y + d.r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,140,60,0.22)';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.05, d.y - d.r * 0.85);
  ctx.lineTo(d.x + d.r * 0.1, d.y + d.r * 0.3);
  ctx.lineTo(d.x - d.r * 0.02, d.y + d.r * 0.3);
  ctx.closePath();
  ctx.fill();
  const pulse = 0.6 + Math.sin(time * 2.4 + d.y * 0.03) * 0.4;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,120,40,${0.3 * pulse})`;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 0.7, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function crack(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const pulse = 0.65 + Math.sin(time * 1.8 + d.x * 0.02) * 0.35;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,110,40,${0.5 * pulse})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.7, d.y - d.r * 0.2);
  ctx.lineTo(d.x - d.r * 0.2, d.y + d.r * 0.05);
  ctx.lineTo(d.x + d.r * 0.25, d.y - d.r * 0.18);
  ctx.lineTo(d.x + d.r * 0.75, d.y + d.r * 0.22);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,220,150,${0.55 * pulse})`;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function bones(ctx: CanvasRenderingContext2D, d: Decor, themeId: string): void {
  ctx.strokeStyle = themeId === 'nightcity' ? 'rgba(204,180,240,0.48)' : 'rgba(206,196,170,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.2;
    ctx.beginPath();
    ctx.moveTo(d.x + Math.cos(a) * d.r * 0.4, d.y + Math.sin(a) * d.r * 0.3);
    ctx.lineTo(d.x - Math.cos(a) * d.r * 0.4, d.y - Math.sin(a) * d.r * 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = themeId === 'nightcity' ? 'rgba(218,198,248,0.62)' : 'rgba(214,206,182,0.7)';
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 0.16, 0, TAU);
  ctx.fill();
}

// ─────────────────────────── 细碎地面装饰 ───────────────────────────

function grassTuft(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const sway = Math.sin(time * 1.1 + d.x * 0.04) * d.r * 0.16;
  ctx.strokeStyle = 'rgba(88,150,104,0.55)';
  ctx.lineWidth = 1.4;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(d.x + i * d.r * 0.3, d.y + d.r * 0.4);
    ctx.quadraticCurveTo(d.x + i * d.r * 0.42, d.y - d.r * 0.2, d.x + i * d.r * 0.55 + sway, d.y - d.r * 0.85);
    ctx.stroke();
  }
}

function pebble(ctx: CanvasRenderingContext2D, d: Decor, tint: string): void {
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y, d.r * 0.85, d.r * 0.55, d.kind * 0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.16, d.y - d.r * 0.18, d.r * 0.34, d.r * 0.2, 0, 0, TAU);
  ctx.fill();
}

function chip(ctx: CanvasRenderingContext2D, d: Decor, tint: string): void {
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.7, d.y + d.r * 0.4);
  ctx.lineTo(d.x - d.r * 0.1, d.y - d.r * 0.55);
  ctx.lineTo(d.x + d.r * 0.75, d.y + d.r * 0.25);
  ctx.closePath();
  ctx.fill();
}

function hairlineCrack(ctx: CanvasRenderingContext2D, d: Decor): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r, d.y - d.r * 0.3);
  ctx.lineTo(d.x - d.r * 0.25, d.y + d.r * 0.15);
  ctx.lineTo(d.x + d.r * 0.4, d.y - d.r * 0.22);
  ctx.lineTo(d.x + d.r, d.y + d.r * 0.3);
  ctx.stroke();
}

function emberDot(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const pulse = 0.5 + Math.sin(time * 2.6 + d.x * 0.06 + d.y * 0.03) * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 2.6);
  g.addColorStop(0, `rgba(255,196,120,${0.5 * pulse})`);
  g.addColorStop(0.45, `rgba(255,110,40,${0.2 * pulse})`);
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 2.6, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function mushroomDot(ctx: CanvasRenderingContext2D, d: Decor): void {
  ctx.fillStyle = 'rgba(70,112,86,0.7)';
  ctx.fillRect(d.x - 0.8, d.y, 1.6, d.r * 0.5);
  ctx.fillStyle = 'rgba(120,200,160,0.55)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y, d.r * 0.42, d.r * 0.28, 0, 0, TAU);
  ctx.fill();
}

function leafLitter(ctx: CanvasRenderingContext2D, d: Decor): void {
  for (let i = 0; i < 3; i += 1) {
    const a = d.x * 0.01 + i * 2.1;
    const ox = d.x + Math.cos(a) * d.r * 0.58;
    const oy = d.y + Math.sin(a) * d.r * 0.34;
    ctx.fillStyle = i === 1 ? 'rgba(128,110,62,0.42)' : 'rgba(82,112,68,0.42)';
    ctx.beginPath();
    ctx.ellipse(ox, oy, d.r * 0.24, d.r * 0.09, a, 0, TAU);
    ctx.fill();
  }
}

function puddle(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const shimmer = 0.36 + Math.sin(time * 1.4 + d.x * 0.02) * 0.12;
  ctx.fillStyle = 'rgba(19,25,43,0.62)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y, d.r * 0.96, d.r * 0.48, d.kind * 0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(142,170,235,${0.05 + shimmer * 0.05})`;
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.14, d.y - d.r * 0.08, d.r * 0.58, d.r * 0.22, -0.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(170,195,255,${0.1 + shimmer * 0.08})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.12, d.y + d.r * 0.02, d.r * 0.44, d.r * 0.16, -0.16, 0, TAU);
  ctx.stroke();
}

function candleStub(ctx: CanvasRenderingContext2D, d: Decor, time: number, themeId: string): void {
  const night = themeId === 'nightcity';
  const flick = 0.74 + Math.sin(time * 9 + d.x * 0.05) * 0.26;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(d.x + 1, d.y + d.r * 0.28, d.r * 0.26, d.r * 0.1, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? '#5d4b70' : '#746b59';
  ctx.fillRect(d.x - d.r * 0.12, d.y - d.r * 0.22, d.r * 0.24, d.r * 0.5);
  ctx.fillStyle = night ? '#8b6eaa' : '#a69a7b';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - d.r * 0.22, d.r * 0.12, d.r * 0.045, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.24 * flick;
  ctx.fillStyle = night ? '#b77cff' : '#8bbfff';
  ctx.beginPath();
  ctx.arc(d.x, d.y - d.r * 0.38, d.r * 0.7, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = night ? '#f2dcff' : '#e8f4ff';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - d.r * 0.4, d.r * 0.07, d.r * 0.18 * flick, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function heatCrack(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const pulse = 0.5 + Math.sin(time * 2.1 + d.x * 0.03 + d.y * 0.02) * 0.3;
  ctx.strokeStyle = 'rgba(16,5,3,0.58)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r, d.y - d.r * 0.26);
  ctx.lineTo(d.x - d.r * 0.32, d.y + d.r * 0.12);
  ctx.lineTo(d.x + d.r * 0.18, d.y - d.r * 0.14);
  ctx.lineTo(d.x + d.r, d.y + d.r * 0.2);
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,132,44,${0.28 + pulse * 0.24})`;
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,224,156,${0.3 + pulse * 0.22})`;
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.restore();
}

function runeInlay(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const pulse = 0.56 + Math.sin(time * 1.7 + d.x * 0.03) * 0.24;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.x * 0.007 + d.y * 0.003);
  ctx.fillStyle = 'rgba(38,28,60,0.44)';
  ctx.beginPath();
  ctx.ellipse(0, 0, d.r * 0.86, d.r * 0.48, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = '#b58dff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, d.r * 0.5, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -d.r * 0.32);
  ctx.lineTo(d.r * 0.24, 0);
  ctx.lineTo(0, d.r * 0.32);
  ctx.lineTo(-d.r * 0.24, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = pulse * 0.66;
  ctx.fillStyle = '#d9c4ff';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.6, d.r * 0.08), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawDetails(
  ctx: CanvasRenderingContext2D,
  themeId: string,
  details: Decor[],
  view: { x: number; y: number; halfW: number; halfH: number },
  time: number,
): void {
  for (const d of details) {
    if (Math.abs(d.x - view.x) > view.halfW + 30 || Math.abs(d.y - view.y) > view.halfH + 30) continue;
    switch (themeId) {
      case 'gloamwood':
        if (d.kind === 0) grassTuft(ctx, d, time);
        else if (d.kind === 1) pebble(ctx, d, 'rgba(46,62,50,0.75)');
        else if (d.kind === 2) mushroomDot(ctx, d);
        else leafLitter(ctx, d);
        break;
      case 'ashenkeep':
        if (d.kind === 0) chip(ctx, d, 'rgba(70,74,96,0.62)');
        else if (d.kind === 1) pebble(ctx, d, 'rgba(60,64,84,0.7)');
        else if (d.kind === 2) puddle(ctx, d, time);
        else candleStub(ctx, d, time, themeId);
        break;
      case 'emberhold':
        if (d.kind === 0) pebble(ctx, d, 'rgba(66,42,38,0.78)');
        else if (d.kind === 1) chip(ctx, d, 'rgba(78,48,42,0.6)');
        else if (d.kind === 2) heatCrack(ctx, d, time);
        else emberDot(ctx, d, time);
        break;
      case 'nightcity':
        if (d.kind === 0) pebble(ctx, d, 'rgba(60,52,88,0.72)');
        else if (d.kind === 1) chip(ctx, d, 'rgba(74,64,108,0.6)');
        else if (d.kind === 2) runeInlay(ctx, d, time);
        else candleStub(ctx, d, time, themeId);
        break;
      default:
        if (d.kind === 0) hairlineCrack(ctx, d);
        else pebble(ctx, d, 'rgba(52,56,70,0.7)');
        break;
    }
  }
}

export function drawDecor(
  ctx: CanvasRenderingContext2D,
  themeId: string,
  decor: Decor[],
  view: { x: number; y: number; halfW: number; halfH: number },
  time: number,
  details?: Decor[],
): void {
  ctx.save();
  if (details && details.length) drawDetails(ctx, themeId, details, view, time);
  for (const d of decor) {
    if (Math.abs(d.x - view.x) > view.halfW + d.r * 2 || Math.abs(d.y - view.y) > view.halfH + d.r * 2) continue;
    switch (themeId) {
      case 'gloamwood':
        if (d.kind === 0) tree(ctx, d, time);
        else if (d.kind === 1) mushrooms(ctx, d, time);
        else rock(ctx, d);
        break;
      case 'ashenkeep':
        if (d.kind === 0) pillar(ctx, d, themeId);
        else if (d.kind === 1) rubble(ctx, d, themeId);
        else brazier(ctx, d, time, themeId);
        break;
      case 'emberhold':
        if (d.kind === 0) shard(ctx, d, time);
        else if (d.kind === 1) crack(ctx, d, time);
        else bones(ctx, d, themeId);
        break;
      case 'nightcity':
        if (d.kind === 0) pillar(ctx, d, themeId);
        else if (d.kind === 1) brazier(ctx, d, time, themeId);
        else bones(ctx, d, themeId);
        break;
      default:
        rock(ctx, d);
        break;
    }
  }
  ctx.restore();
}
