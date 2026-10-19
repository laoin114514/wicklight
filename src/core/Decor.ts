/**
 * 关卡布景：为每个主题绘制可辨识的地面陈设（树、蘑菇、石柱、熔岩裂隙……）。
 * 亮部交给泛光处理，因此不需要额外光源就能“发光”。
 */
import type { Decor } from '../systems/LevelGen';

const TAU = Math.PI * 2;

interface TreeLobe {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}

const TREE_OUTER: readonly TreeLobe[] = [
  { x: 0, y: 0, rx: 0.46, ry: 0.39, rot: -0.06 },
  { x: -0.31, y: -0.01, rx: 0.31, ry: 0.28, rot: 0.18 },
  { x: 0.31, y: -0.01, rx: 0.3, ry: 0.28, rot: -0.2 },
  { x: -0.23, y: -0.19, rx: 0.27, ry: 0.22, rot: -0.45 },
  { x: 0.16, y: -0.22, rx: 0.26, ry: 0.2, rot: 0.38 },
  { x: -0.07, y: -0.24, rx: 0.27, ry: 0.21, rot: -0.18 },
  { x: -0.51, y: -0.08, rx: 0.16, ry: 0.22, rot: 0.42 },
  { x: 0.5, y: -0.09, rx: 0.16, ry: 0.21, rot: -0.32 },
  { x: -0.28, y: 0.09, rx: 0.18, ry: 0.13, rot: 0.2 },
  { x: 0.27, y: 0.07, rx: 0.17, ry: 0.12, rot: -0.15 },
];

const TREE_MID: readonly TreeLobe[] = [
  { x: 0, y: 0.01, rx: 0.37, ry: 0.32, rot: -0.08 },
  { x: -0.24, y: 0, rx: 0.24, ry: 0.23, rot: 0.2 },
  { x: 0.24, y: -0.01, rx: 0.23, ry: 0.23, rot: -0.22 },
  { x: -0.13, y: -0.19, rx: 0.23, ry: 0.19, rot: -0.42 },
  { x: 0.13, y: -0.18, rx: 0.22, ry: 0.18, rot: 0.34 },
];

const TREE_INNER: readonly TreeLobe[] = [
  { x: -0.03, y: -0.01, rx: 0.28, ry: 0.25, rot: -0.12 },
  { x: -0.18, y: -0.18, rx: 0.17, ry: 0.14, rot: -0.46 },
  { x: 0.12, y: -0.16, rx: 0.16, ry: 0.13, rot: 0.32 },
  { x: 0.18, y: 0.04, rx: 0.14, ry: 0.12, rot: -0.2 },
];

function addTreeLobes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lobes: readonly TreeLobe[],
): void {
  for (const lobe of lobes) {
    ctx.ellipse(cx + lobe.x * r, cy + lobe.y * r, lobe.rx * r, lobe.ry * r, lobe.rot, 0, TAU);
  }
}

function tree(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const sway = Math.sin(time * 0.6 + d.x * 0.01) * (1.1 + d.r * 0.018);
  const flip = Math.sin(d.x * 0.019 + d.y * 0.013);
  const crownX = d.x + sway * 0.42 + flip * d.r * 0.012;
  const crownY = d.y - d.r * 0.46;
  const tipX = d.x + sway * 0.32;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.58, d.r * 0.34, d.r * 0.13, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#11190f';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.15, d.y + d.r * 0.36);
  ctx.lineTo(d.x - d.r * 0.27, d.y + d.r * 0.63);
  ctx.quadraticCurveTo(d.x - d.r * 0.16, d.y + d.r * 0.58, d.x - d.r * 0.05, d.y + d.r * 0.52);
  ctx.lineTo(d.x + d.r * 0.07, d.y + d.r * 0.55);
  ctx.quadraticCurveTo(d.x + d.r * 0.18, d.y + d.r * 0.59, d.x + d.r * 0.27, d.y + d.r * 0.62);
  ctx.lineTo(d.x + d.r * 0.15, d.y + d.r * 0.36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1b1d12';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.15, d.y + d.r * 0.57);
  ctx.quadraticCurveTo(d.x - d.r * 0.1, d.y + d.r * 0.25, tipX - d.r * 0.065, d.y - d.r * 0.02);
  ctx.lineTo(tipX + d.r * 0.065, d.y - d.r * 0.02);
  ctx.quadraticCurveTo(d.x + d.r * 0.1, d.y + d.r * 0.3, d.x + d.r * 0.15, d.y + d.r * 0.57);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(113,128,80,0.2)';
  ctx.lineWidth = Math.max(0.8, d.r * 0.026);
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.105, d.y + d.r * 0.5);
  ctx.quadraticCurveTo(d.x - d.r * 0.07, d.y + d.r * 0.22, tipX - d.r * 0.035, d.y - d.r * 0.005);
  ctx.stroke();

  if (d.r > 34) {
    ctx.strokeStyle = 'rgba(4,9,5,0.46)';
    ctx.lineWidth = Math.max(0.7, d.r * 0.014);
    for (const [ox, oy, cxp, cyp] of [
      [-0.025, 0.47, 0.015, 0.24],
      [0.04, 0.42, 0.065, 0.2],
      [0.082, 0.35, 0.085, 0.16],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(d.x + d.r * ox, d.y + d.r * oy);
      ctx.quadraticCurveTo(d.x + d.r * cxp, d.y + d.r * cyp, tipX + d.r * (ox + 0.025), d.y + d.r * 0.04);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(7,10,6,0.52)';
    ctx.lineWidth = Math.max(0.8, d.r * 0.018);
    ctx.beginPath();
    ctx.ellipse(d.x - d.r * 0.012, d.y + d.r * 0.24, d.r * 0.034, d.r * 0.062, 0.18, 0, TAU);
    ctx.stroke();
  }

  ctx.beginPath();
  addTreeLobes(ctx, crownX, crownY, d.r, TREE_OUTER);
  ctx.strokeStyle = 'rgba(3,9,5,0.7)';
  ctx.lineWidth = Math.max(1.2, d.r * 0.028);
  ctx.stroke();
  ctx.fillStyle = '#0e2216';
  ctx.fill();

  ctx.beginPath();
  addTreeLobes(ctx, crownX, crownY, d.r, TREE_MID);
  ctx.fillStyle = '#173320';
  ctx.fill();

  ctx.beginPath();
  addTreeLobes(ctx, crownX, crownY, d.r, TREE_INNER);
  ctx.fillStyle = '#1d3e28';
  ctx.fill();

  ctx.strokeStyle = 'rgba(24,34,20,0.58)';
  ctx.lineCap = 'round';
  for (const [ax, ay, bx, by, width] of [
    [0.03, 0.27, -0.02, 0.02, 0.04],
    [-0.02, 0.02, -0.23, -0.18, 0.03],
    [-0.23, -0.18, -0.34, -0.3, 0.019],
    [0, 0.02, 0.24, -0.16, 0.028],
    [0.24, -0.16, 0.33, -0.29, 0.017],
    [0.23, -0.16, 0.14, -0.32, 0.014],
  ] as const) {
    ctx.lineWidth = Math.max(0.7, d.r * width);
    ctx.beginPath();
    ctx.moveTo(crownX + d.r * ax, crownY + d.r * ay);
    ctx.lineTo(crownX + d.r * bx, crownY + d.r * by);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(101,106,65,0.16)';
  ctx.lineWidth = Math.max(0.5, d.r * 0.007);
  ctx.beginPath();
  ctx.moveTo(crownX + d.r * 0.02, crownY + d.r * 0.24);
  ctx.lineTo(crownX - d.r * 0.02, crownY + d.r * 0.03);
  ctx.lineTo(crownX - d.r * 0.22, crownY - d.r * 0.17);
  ctx.moveTo(crownX - d.r * 0.01, crownY + d.r * 0.01);
  ctx.lineTo(crownX + d.r * 0.23, crownY - d.r * 0.17);
  ctx.stroke();

  ctx.fillStyle = 'rgba(2,9,5,0.3)';
  ctx.beginPath();
  ctx.ellipse(crownX + d.r * 0.01, crownY + d.r * 0.22, d.r * 0.33, d.r * 0.11, 0.02, 0, TAU);
  ctx.ellipse(crownX - d.r * 0.29, crownY + d.r * 0.15, d.r * 0.16, d.r * 0.075, -0.16, 0, TAU);
  ctx.ellipse(crownX + d.r * 0.29, crownY + d.r * 0.14, d.r * 0.16, d.r * 0.07, 0.14, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = 'rgba(3,11,6,0.42)';
  ctx.lineWidth = Math.max(0.7, d.r * 0.018);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(crownX - d.r * 0.2, crownY - d.r * 0.14);
  ctx.quadraticCurveTo(crownX - d.r * 0.08, crownY + d.r * 0.01, crownX - d.r * 0.17, crownY + d.r * 0.15);
  ctx.moveTo(crownX + d.r * 0.02, crownY - d.r * 0.29);
  ctx.quadraticCurveTo(crownX + d.r * 0.13, crownY - d.r * 0.13, crownX + d.r * 0.07, crownY + d.r * 0.03);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  addTreeLobes(ctx, crownX, crownY, d.r, TREE_OUTER);
  ctx.clip();
  ctx.fillStyle = 'rgba(136,225,170,0.065)';
  ctx.beginPath();
  ctx.ellipse(crownX - d.r * 0.2, crownY - d.r * 0.25, d.r * 0.38, d.r * 0.18, -0.28, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(166,236,190,0.14)';
  for (const [ox, oy, rot] of [
    [-0.33, -0.29, -0.72],
    [-0.2, -0.35, -0.5],
    [-0.04, -0.37, -0.24],
    [0.2, -0.3, 0.34],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(crownX + d.r * ox, crownY + d.r * oy, d.r * 0.075, d.r * 0.026, rot, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(76,125,83,0.45)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.1, d.y + d.r * 0.57, d.r * 0.085, d.r * 0.032, -0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(87,125,92,0.34)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.16, d.y + d.r * 0.6, d.r * 0.07, d.r * 0.025, 0.18, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#283021';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.25, d.y + d.r * 0.58, d.r * 0.07, d.r * 0.045, 0.22, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(143,177,112,0.13)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.23, d.y + d.r * 0.555, d.r * 0.055, d.r * 0.018, 0.18, 0, TAU);
  ctx.fill();
  ctx.lineCap = 'butt';
}

function mushrooms(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const pulse = 0.7 + Math.sin(time * 1.6 + d.x * 0.02) * 0.25;
  const phase = time * 1.35 + d.x * 0.021 + d.y * 0.013;
  // 柔和的菌丝辉光（克制一点，别糊成一团绿雾）
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 1.22);
  halo.addColorStop(0, `rgba(140,240,190,${0.14 * pulse})`);
  halo.addColorStop(0.42, `rgba(80,205,145,${0.05 * pulse})`);
  halo.addColorStop(1, 'rgba(50,150,105,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 1.22, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  for (let i = 0; i < 3; i += 1) {
    const sway = Math.sin(phase + i * 1.9) * d.r * 0.012;
    const ox = d.x + Math.cos(i * 2.1) * d.r * 0.42 + sway;
    const oy = d.y + Math.sin(i * 1.7) * d.r * 0.3;
    const sr = d.r * (0.13 + i * 0.034);
    const lean = Math.sin(phase * 0.8 + i * 2.3) * sr * 0.08;

    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(ox, oy + sr * 0.87, sr * 0.34, sr * 0.1, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#315343';
    ctx.beginPath();
    ctx.moveTo(ox - sr * 0.15 + lean, oy + sr * 0.02);
    ctx.quadraticCurveTo(ox - sr * 0.1, oy + sr * 0.48, ox - sr * 0.17, oy + sr * 0.87);
    ctx.quadraticCurveTo(ox, oy + sr * 0.94, ox + sr * 0.17, oy + sr * 0.86);
    ctx.quadraticCurveTo(ox + sr * 0.09, oy + sr * 0.46, ox + sr * 0.15 + lean, oy + sr * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,232,184,0.17)';
    ctx.lineWidth = Math.max(0.55, sr * 0.035);
    ctx.beginPath();
    ctx.moveTo(ox - sr * 0.1 + lean, oy + sr * 0.1);
    ctx.quadraticCurveTo(ox - sr * 0.07, oy + sr * 0.49, ox - sr * 0.12, oy + sr * 0.81);
    ctx.stroke();

    const cap = ctx.createRadialGradient(ox - sr * 0.28, oy - sr * 0.24, sr * 0.04, ox, oy, sr * 1.04);
    cap.addColorStop(0, `rgba(204,255,230,${0.72 + 0.2 * pulse})`);
    cap.addColorStop(0.48, `rgba(126,230,176,${0.58 + 0.12 * pulse})`);
    cap.addColorStop(0.84, `rgba(58,155,105,0.86)`);
    cap.addColorStop(1, 'rgba(29,94,67,0.92)');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.moveTo(ox - sr, oy);
    ctx.bezierCurveTo(ox - sr * 0.94, oy - sr * 0.54, ox - sr * 0.38, oy - sr * 0.78, ox + lean, oy - sr * 0.8);
    ctx.bezierCurveTo(ox + sr * 0.45, oy - sr * 0.79, ox + sr * 0.96, oy - sr * 0.5, ox + sr, oy);
    ctx.quadraticCurveTo(ox, oy + sr * 0.17, ox - sr, oy);
    ctx.fill();

    ctx.strokeStyle = 'rgba(18,66,48,0.45)';
    ctx.lineWidth = Math.max(0.55, sr * 0.03);
    for (const at of [-0.55, -0.18, 0.2, 0.56]) {
      ctx.beginPath();
      ctx.moveTo(ox + lean * 0.35, oy + sr * 0.06);
      ctx.quadraticCurveTo(ox + sr * at * 0.62, oy + sr * 0.08, ox + sr * at, oy - sr * 0.01);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(190,255,218,0.28)';
    ctx.lineWidth = Math.max(0.6, sr * 0.026);
    ctx.beginPath();
    ctx.moveTo(ox - sr * 0.9, oy - sr * 0.02);
    ctx.quadraticCurveTo(ox - sr * 0.73, oy - sr * 0.46, ox - sr * 0.18, oy - sr * 0.69);
    ctx.stroke();
    ctx.fillStyle = 'rgba(225,255,236,0.27)';
    ctx.beginPath();
    ctx.ellipse(ox - sr * 0.3, oy - sr * 0.5, sr * 0.2, sr * 0.07, -0.42, 0, TAU);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i += 1) {
    const mote = 0.45 + Math.sin(phase * 1.7 + i * 2.2) * 0.35;
    const ox = d.x + Math.cos(phase * 0.32 + i * 2.4) * d.r * (0.46 + i * 0.09);
    const oy = d.y - d.r * (0.16 + i * 0.12) + Math.sin(phase * 0.5 + i) * d.r * 0.04;
    ctx.fillStyle = `rgba(165,255,205,${0.16 + mote * 0.14})`;
    ctx.beginPath();
    ctx.arc(ox, oy, Math.max(0.55, d.r * 0.018), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function rock(ctx: CanvasRenderingContext2D, d: Decor): void {
  const mirror = Math.sin(d.x * 0.013 + d.y * 0.017) < 0 ? -1 : 1;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;
  const shape = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    });
    ctx.closePath();
  };

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.02 * mirror, d.y + d.r * 0.32, d.r * 0.5, d.r * 0.12, 0, 0, TAU);
  ctx.fill();

  shape([
    [-0.48, 0.04],
    [-0.4, -0.19],
    [-0.26, -0.35],
    [-0.06, -0.45],
    [0.17, -0.42],
    [0.36, -0.29],
    [0.48, -0.08],
    [0.43, 0.16],
    [0.25, 0.3],
    [0.02, 0.35],
    [-0.24, 0.31],
    [-0.42, 0.2],
  ]);
  ctx.fillStyle = '#223128';
  ctx.fill();
  ctx.strokeStyle = 'rgba(7,14,9,0.62)';
  ctx.lineWidth = Math.max(1, d.r * 0.022);
  ctx.stroke();

  shape([
    [-0.4, -0.17],
    [-0.25, -0.33],
    [-0.07, -0.42],
    [0.14, -0.39],
    [0.06, -0.24],
    [-0.13, -0.1],
    [-0.35, -0.01],
  ]);
  ctx.fillStyle = '#2c3e32';
  ctx.fill();

  shape([
    [-0.02, 0.03],
    [0.27, -0.06],
    [0.43, 0.03],
    [0.38, 0.18],
    [0.22, 0.29],
    [0.01, 0.32],
    [-0.08, 0.15],
  ]);
  ctx.fillStyle = 'rgba(8,17,11,0.34)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(167,195,160,0.13)';
  ctx.lineWidth = Math.max(0.7, d.r * 0.013);
  ctx.beginPath();
  ctx.moveTo(px(-0.26), py(-0.32));
  ctx.lineTo(px(-0.08), py(-0.41));
  ctx.lineTo(px(0.13), py(-0.38));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(4,10,6,0.48)';
  ctx.lineWidth = Math.max(0.7, d.r * 0.016);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px(-0.05), py(-0.43));
  ctx.lineTo(px(-0.01), py(-0.23));
  ctx.lineTo(px(0.08), py(-0.08));
  ctx.lineTo(px(0.04), py(0.12));
  ctx.moveTo(px(0.35), py(-0.27));
  ctx.lineTo(px(0.2), py(-0.13));
  ctx.lineTo(px(0.21), py(0.02));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,171,144,0.1)';
  ctx.lineWidth = Math.max(0.5, d.r * 0.006);
  ctx.beginPath();
  ctx.moveTo(px(0.005), py(-0.24));
  ctx.lineTo(px(0.095), py(-0.09));
  ctx.lineTo(px(0.055), py(0.1));
  ctx.stroke();

  ctx.fillStyle = 'rgba(75,118,80,0.56)';
  for (const [x, y, rx, ry, rot] of [
    [-0.31, -0.24, 0.11, 0.035, -0.56],
    [-0.16, -0.37, 0.1, 0.03, -0.3],
    [0.01, -0.43, 0.08, 0.026, -0.12],
    [0.18, -0.36, 0.07, 0.024, 0.24],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror, 0, TAU);
    ctx.fill();
  }
  if (d.r > 42) {
    ctx.strokeStyle = 'rgba(105,162,112,0.34)';
    ctx.lineWidth = Math.max(0.7, d.r * 0.009);
    for (const [x, y, bend] of [
      [-0.24, -0.34, -0.14],
      [-0.12, -0.4, -0.03],
      [0.08, -0.41, 0.08],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(px(x), py(y));
      ctx.quadraticCurveTo(px(x + bend * 0.35), py(y - 0.09), px(x + bend), py(y - 0.16));
      ctx.stroke();
    }
  }

  ctx.fillStyle = 'rgba(73,109,76,0.34)';
  ctx.beginPath();
  ctx.ellipse(px(-0.31), py(0.28), d.r * 0.12, d.r * 0.035, -0.18 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(179,202,169,0.1)';
  ctx.beginPath();
  ctx.ellipse(px(-0.22), py(-0.29), d.r * 0.1, d.r * 0.025, -0.55 * mirror, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#1b2820';
  ctx.beginPath();
  ctx.ellipse(px(-0.53), py(0.3), d.r * 0.09, d.r * 0.055, 0.2 * mirror, 0, TAU);
  ctx.ellipse(px(0.49), py(0.24), d.r * 0.065, d.r * 0.04, -0.15 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(170,194,160,0.085)';
  ctx.beginPath();
  ctx.ellipse(px(-0.55), py(0.28), d.r * 0.045, d.r * 0.016, 0.2 * mirror, 0, TAU);
  ctx.fill();
  ctx.lineCap = 'butt';
}

function pillar(ctx: CanvasRenderingContext2D, d: Decor, themeId: string): void {
  const night = themeId === 'nightcity';
  const w = d.r * 0.52;
  const h = d.r * 1.05;
  const mirror = Math.sin(d.x * 0.019 + d.y * 0.013) < 0 ? -1 : 1;
  const broken = Math.sin(d.x * 0.027 + d.y * 0.011) > 0.18;
  const body = night ? '#31264a' : '#2b2e42';
  const lit = night ? '#4e3d70' : '#3d4159';
  const mid = night ? '#3b2f57' : '#34384e';
  const dark = night ? '#171322' : '#171927';
  const edge = night ? 'rgba(198,168,255,0.14)' : 'rgba(174,193,235,0.12)';
  const lichen = night ? 'rgba(142,108,196,0.24)' : 'rgba(92,121,103,0.24)';
  const px = (v: number): number => d.x + v * w * mirror;
  const py = (v: number): number => d.y + v * h;
  const shape = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    });
    ctx.closePath();
  };

  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(d.x + w * 0.1 * mirror, d.y + h * 0.43, w * 0.9, h * 0.16, -0.08 * mirror, 0, TAU);
  ctx.fill();

  shape([
    [-0.86, 0.43],
    [-0.82, 0.35],
    [-0.68, 0.31],
    [0.68, 0.31],
    [0.82, 0.35],
    [0.86, 0.43],
  ]);
  ctx.fillStyle = mid;
  ctx.fill();
  ctx.strokeStyle = 'rgba(7,8,14,0.38)';
  ctx.lineWidth = Math.max(0.8, d.r * 0.018);
  ctx.stroke();
  shape([
    [-0.68, 0.33],
    [-0.64, 0.26],
    [0.64, 0.26],
    [0.68, 0.33],
  ]);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.moveTo(px(-0.77), py(0.35));
  ctx.lineTo(px(0.77), py(0.35));
  ctx.lineTo(px(0.8), py(0.39));
  ctx.lineTo(px(-0.8), py(0.39));
  ctx.closePath();
  ctx.fill();

  shape([
    [-0.49, 0.28],
    [-0.43, -0.43],
    [0.43, -0.43],
    [0.49, 0.28],
  ]);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,7,12,0.42)';
  ctx.lineWidth = Math.max(0.8, d.r * 0.016);
  ctx.stroke();

  shape([
    [-0.49, 0.26],
    [-0.44, -0.42],
    [-0.27, -0.42],
    [-0.31, 0.26],
  ]);
  ctx.fillStyle = lit;
  ctx.globalAlpha = 0.62;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(px(0.3), py(-0.4));
  ctx.lineTo(px(0.43), py(-0.42));
  ctx.lineTo(px(0.48), py(0.26));
  ctx.lineTo(px(0.34), py(0.26));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = Math.max(0.7, d.r * 0.012);
  for (const at of [-0.24, 0.02, 0.27]) {
    ctx.beginPath();
    ctx.moveTo(px(at), py(-0.38));
    ctx.quadraticCurveTo(px(at - 0.008), py(-0.05), px(at + 0.012), py(0.25));
    ctx.stroke();
  }
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(0.6, d.r * 0.009);
  for (const at of [-0.16, 0.1]) {
    ctx.beginPath();
    ctx.moveTo(px(at), py(-0.36));
    ctx.quadraticCurveTo(px(at - 0.006), py(-0.03), px(at + 0.01), py(0.23));
    ctx.stroke();
  }

  shape([
    [-0.68, -0.56],
    [-0.6, -0.59],
    [0.6, -0.59],
    [0.68, -0.56],
    [0.61, -0.43],
    [-0.61, -0.43],
  ]);
  ctx.fillStyle = mid;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.stroke();
  const chip = broken ? 0.05 : 0;
  shape([
    [-0.84, -0.61],
    [-0.77, -0.65],
    [0.62, -0.65],
    [0.76, -0.64],
    [0.84, -0.59 + chip],
    [0.81, -0.53],
    [-0.82, -0.53],
  ]);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,7,12,0.44)';
  ctx.stroke();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(0.7, d.r * 0.011);
  ctx.beginPath();
  ctx.moveTo(px(-0.76), py(-0.64));
  ctx.lineTo(px(0.58), py(-0.64));
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.27)';
  ctx.beginPath();
  ctx.moveTo(px(-0.79), py(-0.56));
  ctx.lineTo(px(0.79), py(-0.56));
  ctx.lineTo(px(0.8), py(-0.53));
  ctx.lineTo(px(-0.81), py(-0.53));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px(-0.56), py(-0.43));
  ctx.lineTo(px(-0.52), py(-0.26));
  ctx.moveTo(px(0.57), py(-0.43));
  ctx.lineTo(px(0.54), py(-0.3));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px(-0.44), py(0.17));
  ctx.lineTo(px(0.44), py(0.19));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.54)';
  ctx.lineWidth = Math.max(0.9, d.r * 0.018);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px(-0.25), py(-0.29));
  ctx.lineTo(px(-0.03), py(-0.08));
  ctx.lineTo(px(0.16), py(0.14));
  ctx.lineTo(px(0.07), py(0.3));
  ctx.moveTo(px(-0.03), py(-0.08));
  ctx.lineTo(px(-0.22), py(0.09));
  ctx.lineTo(px(-0.3), py(0.18));
  ctx.stroke();
  ctx.strokeStyle = night ? 'rgba(196,166,255,0.13)' : 'rgba(173,193,235,0.1)';
  ctx.lineWidth = Math.max(0.6, d.r * 0.007);
  ctx.beginPath();
  ctx.moveTo(px(-0.03), py(-0.07));
  ctx.lineTo(px(0.17), py(0.14));
  ctx.lineTo(px(0.08), py(0.29));
  ctx.stroke();

  ctx.fillStyle = lichen;
  for (const [x, y, rx, ry, rot] of [
    [-0.53, 0.32, 0.12, 0.035, -0.18],
    [-0.31, 0.28, 0.08, 0.026, 0.24],
    [0.45, 0.31, 0.09, 0.025, -0.12],
    [-0.63, -0.61, 0.08, 0.024, -0.08],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), w * rx, h * ry, rot * mirror, 0, TAU);
    ctx.fill();
  }
  if (!night && d.r > 40) {
    ctx.strokeStyle = 'rgba(111,137,113,0.28)';
    ctx.lineWidth = Math.max(0.6, d.r * 0.009);
    for (const [x, bend] of [
      [-0.48, -0.08],
      [-0.39, -0.02],
      [-0.31, 0.05],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(px(x), py(0.31));
      ctx.quadraticCurveTo(px(x + bend * 0.4), py(0.22), px(x + bend), py(0.16));
      ctx.stroke();
    }
  }
  ctx.fillStyle = night ? '#21182f' : '#1e2130';
  ctx.beginPath();
  ctx.ellipse(px(-0.82), py(0.4), w * 0.11, h * 0.038, 0.14 * mirror, 0, TAU);
  ctx.ellipse(px(0.78), py(0.37), w * 0.075, h * 0.028, -0.2 * mirror, 0, TAU);
  ctx.fill();

  if (night) {
    ctx.save();
    ctx.translate(px(0), py(-0.09));
    ctx.rotate(mirror * 0.025);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#c9a3ff';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -w * 0.23);
    ctx.lineTo(w * 0.23, 0);
    ctx.lineTo(0, w * 0.23);
    ctx.lineTo(-w * 0.23, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.34, -0.35, Math.PI * 1.35);
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(0, -w * 0.12);
    ctx.lineTo(w * 0.12, 0);
    ctx.lineTo(0, w * 0.12);
    ctx.lineTo(-w * 0.12, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -w * 0.4);
    ctx.lineTo(0, -w * 0.29);
    ctx.moveTo(0, w * 0.29);
    ctx.lineTo(0, w * 0.4);
    ctx.stroke();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = '#d9c4ff';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.6, w * 0.055), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.lineCap = 'butt';
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
  const phase = time * 7.4 + d.x * 0.047 + d.y * 0.019;
  const flick = 0.86 + Math.sin(phase) * 0.14;
  const drift = Math.sin(time * 1.4 + d.x * 0.02) * d.r * 0.025;
  const body = night ? '#2b213f' : '#2b2e42';
  const rim = night ? '#8066a8' : '#59617d';
  const sheen = night ? 'rgba(190,158,242,0.32)' : 'rgba(151,167,205,0.28)';

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.33, d.r * 0.42, d.r * 0.13, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.2, d.y + d.r * 0.27);
  ctx.lineTo(d.x - d.r * 0.17, d.y + d.r * 0.34);
  ctx.lineTo(d.x - d.r * 0.08, d.y + d.r * 0.36);
  ctx.lineTo(d.x + d.r * 0.08, d.y + d.r * 0.36);
  ctx.lineTo(d.x + d.r * 0.17, d.y + d.r * 0.34);
  ctx.lineTo(d.x + d.r * 0.2, d.y + d.r * 0.27);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.03, d.y + d.r * 0.315, d.r * 0.12, d.r * 0.026, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.07, d.y + d.r * 0.1);
  ctx.lineTo(d.x - d.r * 0.095, d.y + d.r * 0.28);
  ctx.lineTo(d.x + d.r * 0.095, d.y + d.r * 0.28);
  ctx.lineTo(d.x + d.r * 0.07, d.y + d.r * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = sheen;
  ctx.lineWidth = Math.max(0.7, d.r * 0.011);
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.052, d.y + d.r * 0.12);
  ctx.lineTo(d.x - d.r * 0.07, d.y + d.r * 0.265);
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(0.8, d.r * 0.015);
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.255, d.r * 0.115, d.r * 0.031, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.175, d.r * 0.064, d.r * 0.018, 0, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.3, d.y + d.r * 0.055);
  ctx.bezierCurveTo(d.x - d.r * 0.285, d.y + d.r * 0.14, d.x - d.r * 0.245, d.y + d.r * 0.22, d.x - d.r * 0.175, d.y + d.r * 0.25);
  ctx.lineTo(d.x + d.r * 0.175, d.y + d.r * 0.25);
  ctx.bezierCurveTo(d.x + d.r * 0.245, d.y + d.r * 0.22, d.x + d.r * 0.285, d.y + d.r * 0.14, d.x + d.r * 0.3, d.y + d.r * 0.055);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(d.x + d.r * 0.055, d.y + d.r * 0.07);
  ctx.bezierCurveTo(d.x + d.r * 0.1, d.y + d.r * 0.14, d.x + d.r * 0.13, d.y + d.r * 0.2, d.x + d.r * 0.15, d.y + d.r * 0.245);
  ctx.lineTo(d.x + d.r * 0.175, d.y + d.r * 0.25);
  ctx.bezierCurveTo(d.x + d.r * 0.245, d.y + d.r * 0.22, d.x + d.r * 0.285, d.y + d.r * 0.14, d.x + d.r * 0.3, d.y + d.r * 0.055);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = sheen;
  ctx.lineWidth = Math.max(0.6, d.r * 0.009);
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.265, d.y + d.r * 0.08);
  ctx.quadraticCurveTo(d.x - d.r * 0.235, d.y + d.r * 0.19, d.x - d.r * 0.17, d.y + d.r * 0.235);
  ctx.stroke();
  ctx.strokeStyle = night ? 'rgba(122,96,165,0.38)' : 'rgba(88,96,123,0.36)';
  ctx.lineWidth = Math.max(0.7, d.r * 0.012);
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.255, d.y + d.r * 0.16);
  ctx.quadraticCurveTo(d.x, d.y + d.r * 0.195, d.x + d.r * 0.255, d.y + d.r * 0.15);
  ctx.stroke();

  ctx.fillStyle = night ? '#3a2d55' : '#373b51';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.055, d.r * 0.32, d.r * 0.105, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? '#171226' : '#151723';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.05, d.r * 0.255, d.r * 0.072, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(0.9, d.r * 0.016);
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.055, d.r * 0.32, d.r * 0.105, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = sheen;
  ctx.lineWidth = Math.max(0.6, d.r * 0.009);
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.005, d.y + d.r * 0.052, d.r * 0.285, d.r * 0.087, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillStyle = night ? 'rgba(216,190,255,0.3)' : 'rgba(167,184,224,0.26)';
  for (const at of [-0.2, 0, 0.2]) {
    ctx.beginPath();
    ctx.arc(d.x + d.r * at, d.y + d.r * 0.065, Math.max(0.65, d.r * 0.014), 0, TAU);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(d.x + drift * 0.2, d.y - d.r * 0.18, 0, d.x + drift * 0.2, d.y - d.r * 0.18, d.r * 1.02);
  g.addColorStop(0, night ? `rgba(234,207,255,${0.4 * flick})` : `rgba(197,222,255,${0.38 * flick})`);
  g.addColorStop(0.34, night ? `rgba(170,107,255,${0.16 * flick})` : `rgba(115,153,255,${0.14 * flick})`);
  g.addColorStop(1, night ? 'rgba(98,48,190,0)' : 'rgba(50,72,190,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(d.x + drift * 0.2, d.y - d.r * 0.18, d.r * 1.02, 0, TAU);
  ctx.fill();

  ctx.fillStyle = night ? 'rgba(201,151,255,0.5)' : 'rgba(139,174,255,0.46)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.11, d.y + d.r * 0.02, d.r * 0.075, d.r * 0.03, -0.2, 0, TAU);
  ctx.ellipse(d.x + d.r * 0.09, d.y + d.r * 0.025, d.r * 0.065, d.r * 0.026, 0.14, 0, TAU);
  ctx.ellipse(d.x + d.r * 0.01, d.y + d.r * 0.042, d.r * 0.05, d.r * 0.02, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = night ? 'rgba(214,165,255,0.35)' : 'rgba(151,184,255,0.32)';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.09, d.y + d.r * 0.02);
  ctx.bezierCurveTo(d.x - d.r * 0.22, d.y - d.r * 0.08, d.x - d.r * 0.22, d.y - d.r * 0.2, d.x - d.r * 0.15, d.y - d.r * 0.29);
  ctx.bezierCurveTo(d.x - d.r * 0.11, d.y - d.r * 0.19, d.x - d.r * 0.08, d.y - d.r * 0.09, d.x - d.r * 0.05, d.y + d.r * 0.01);
  ctx.moveTo(d.x + d.r * 0.08, d.y + d.r * 0.015);
  ctx.bezierCurveTo(d.x + d.r * 0.23, d.y - d.r * 0.07, d.x + d.r * 0.23, d.y - d.r * 0.2, d.x + d.r * 0.16, d.y - d.r * 0.31);
  ctx.bezierCurveTo(d.x + d.r * 0.12, d.y - d.r * 0.2, d.x + d.r * 0.08, d.y - d.r * 0.09, d.x + d.r * 0.05, d.y + d.r * 0.005);
  ctx.fill();

  ctx.fillStyle = night ? 'rgba(229,190,255,0.66)' : 'rgba(179,207,255,0.62)';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.11 + drift, d.y + d.r * 0.035);
  ctx.bezierCurveTo(d.x - d.r * 0.19, d.y - d.r * 0.12, d.x - d.r * 0.14, d.y - d.r * 0.36 * flick, d.x + d.r * 0.015, d.y - d.r * 0.51 * flick);
  ctx.bezierCurveTo(d.x + d.r * 0.14, d.y - d.r * 0.33 * flick, d.x + d.r * 0.17, d.y - d.r * 0.1, d.x + d.r * 0.11 + drift, d.y + d.r * 0.035);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = night ? 'rgba(250,240,255,0.84)' : 'rgba(238,247,255,0.82)';
  ctx.beginPath();
  ctx.moveTo(d.x + drift * 0.7, d.y + d.r * 0.02);
  ctx.quadraticCurveTo(d.x - d.r * 0.06 + drift, d.y - d.r * 0.16, d.x + d.r * 0.005 + drift, d.y - d.r * 0.32 * flick);
  ctx.quadraticCurveTo(d.x + d.r * 0.075 + drift, d.y - d.r * 0.15, d.x + drift * 0.7, d.y + d.r * 0.02);
  ctx.closePath();
  ctx.fill();

  for (const [at, lift, size] of [
    [-0.15, 0.5, 0.017],
    [0.02, 0.65, 0.02],
    [0.14, 0.44, 0.014],
  ] as const) {
    const rise = (Math.sin(phase * 0.55 + at * 19) + 1) * 0.08;
    ctx.fillStyle = night ? `rgba(235,205,255,${0.24 + rise})` : `rgba(205,226,255,${0.22 + rise})`;
    ctx.beginPath();
    ctx.arc(d.x + d.r * at + drift, d.y - d.r * lift - d.r * rise, Math.max(0.6, d.r * size), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.strokeStyle = night ? 'rgba(190,160,230,0.055)' : 'rgba(166,180,214,0.055)';
  ctx.lineWidth = Math.max(0.8, d.r * 0.012);
  ctx.beginPath();
  ctx.moveTo(d.x + d.r * 0.02, d.y - d.r * 0.46);
  ctx.bezierCurveTo(d.x - d.r * 0.06, d.y - d.r * 0.6, d.x + d.r * 0.08, d.y - d.r * 0.7, d.x + d.r * 0.02, d.y - d.r * 0.82);
  ctx.stroke();
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
  const night = themeId === 'nightcity';
  const variant = Math.sin(d.x * 0.017 + d.y * 0.013);
  const mirror = variant < 0 ? -1 : 1;
  const bone = night ? '#958aa8' : '#8a8067';
  const boneLit = night ? '#c1b5d7' : '#b5aa8d';
  const boneDark = night ? '#51475f' : '#4d4739';
  const socket = night ? 'rgba(8,6,14,0.82)' : 'rgba(20,13,9,0.8)';
  const dust = night ? 'rgba(105,78,145,0.14)' : 'rgba(108,83,54,0.15)';
  const sx = d.x + mirror * d.r * 0.018;
  const sy = d.y - d.r * 0.035;
  const px = (v: number): number => sx + v * d.r * mirror;
  const py = (v: number): number => sy + v * d.r;
  const limb = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, width: number): void => {
    ctx.strokeStyle = boneDark;
    ctx.lineWidth = width * 1.55;
    ctx.beginPath();
    ctx.moveTo(px(x1), py(y1));
    ctx.quadraticCurveTo(px(cx), py(cy), px(x2), py(y2));
    ctx.stroke();
    ctx.strokeStyle = bone;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const knob = (x: number, y: number, rx: number, ry: number, rot: number): void => {
    ctx.fillStyle = boneDark;
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), rx * 1.24, ry * 1.3, rot * mirror, 0, TAU);
    ctx.fill();
    ctx.fillStyle = bone;
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), rx, ry, rot * mirror, 0, TAU);
    ctx.fill();
  };

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.26, d.r * 0.44, d.r * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dust;
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.02, d.y + d.r * 0.22, d.r * 0.47, d.r * 0.09, -0.05 * mirror, 0, TAU);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = Math.max(1.3, d.r * 0.032);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(px(-0.34 + i * 0.025), py(0.11 + i * 0.012));
    ctx.quadraticCurveTo(px(-0.2 + i * 0.03), py(-0.04 + i * 0.04), px(-0.05 + i * 0.055), py(0.08 + i * 0.04));
    ctx.stroke();
  }
  ctx.strokeStyle = bone;
  ctx.lineWidth = Math.max(0.9, d.r * 0.018);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(px(-0.34 + i * 0.025), py(0.11 + i * 0.012));
    ctx.quadraticCurveTo(px(-0.2 + i * 0.03), py(-0.04 + i * 0.04), px(-0.05 + i * 0.055), py(0.08 + i * 0.04));
    ctx.stroke();
  }

  limb(-0.5, 0.14, -0.18, 0.02, 0.38, 0.25, Math.max(1.7, d.r * 0.046));
  knob(-0.5, 0.14, d.r * 0.051, d.r * 0.031, -0.35 + variant * 0.1);
  knob(0.38, 0.25, d.r * 0.045, d.r * 0.028, 0.24 + variant * 0.1);
  limb(-0.31, 0.31, 0.02, 0.24, 0.46, 0.12, Math.max(1.5, d.r * 0.038));
  knob(-0.31, 0.31, d.r * 0.043, d.r * 0.026, 0.22);
  knob(0.46, 0.12, d.r * 0.038, d.r * 0.024, -0.3);

  ctx.save();
  ctx.translate(sx, sy - d.r * 0.01);
  ctx.rotate((-0.17 + variant * 0.045) * mirror);
  ctx.fillStyle = boneDark;
  ctx.beginPath();
  ctx.ellipse(0, 0, d.r * 0.195, d.r * 0.168, -0.05 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.moveTo(-d.r * 0.19, 0);
  ctx.bezierCurveTo(-d.r * 0.19, -d.r * 0.115, -d.r * 0.115, -d.r * 0.17, -d.r * 0.01, -d.r * 0.17);
  ctx.bezierCurveTo(d.r * 0.1, -d.r * 0.17, d.r * 0.185, -d.r * 0.1, d.r * 0.185, 0);
  ctx.bezierCurveTo(d.r * 0.18, d.r * 0.055, d.r * 0.135, d.r * 0.09, d.r * 0.09, d.r * 0.105);
  ctx.lineTo(d.r * 0.068, d.r * 0.19);
  ctx.quadraticCurveTo(0, d.r * 0.215, -d.r * 0.066, d.r * 0.19);
  ctx.lineTo(-d.r * 0.088, d.r * 0.105);
  ctx.bezierCurveTo(-d.r * 0.13, d.r * 0.09, -d.r * 0.18, d.r * 0.055, -d.r * 0.19, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(31,24,17,0.2)';
  ctx.beginPath();
  ctx.moveTo(d.r * 0.04, d.r * 0.09);
  ctx.lineTo(d.r * 0.068, d.r * 0.19);
  ctx.quadraticCurveTo(0, d.r * 0.215, -d.r * 0.066, d.r * 0.19);
  ctx.lineTo(-d.r * 0.078, d.r * 0.135);
  ctx.quadraticCurveTo(d.r * 0.01, d.r * 0.155, d.r * 0.04, d.r * 0.09);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = socket;
  ctx.beginPath();
  ctx.ellipse(-d.r * 0.073, -d.r * 0.042, d.r * 0.046, d.r * 0.04, 0.12 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,22,15,0.3)';
  ctx.beginPath();
  ctx.ellipse(d.r * 0.084, -d.r * 0.035, d.r * 0.014, d.r * 0.03, -0.22 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = socket;
  ctx.beginPath();
  ctx.moveTo(-d.r * 0.018, d.r * 0.038);
  ctx.lineTo(d.r * 0.018, d.r * 0.038);
  ctx.lineTo(d.r * 0.004, d.r * 0.082);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = socket;
  ctx.lineWidth = Math.max(0.5, d.r * 0.008);
  for (const at of [-0.03, 0.004]) {
    ctx.beginPath();
    ctx.moveTo(d.r * at, d.r * 0.15);
    ctx.lineTo(d.r * (at + 0.006), d.r * 0.19);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30,24,18,0.34)';
  ctx.lineWidth = Math.max(0.55, d.r * 0.01);
  ctx.beginPath();
  ctx.moveTo(d.r * 0.03, -d.r * 0.16);
  ctx.lineTo(d.r * 0.052, -d.r * 0.09);
  ctx.lineTo(d.r * 0.032, -d.r * 0.03);
  ctx.moveTo(d.r * 0.15, -d.r * 0.07);
  ctx.lineTo(d.r * 0.115, 0);
  ctx.stroke();
  ctx.strokeStyle = boneLit;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = Math.max(0.65, d.r * 0.011);
  ctx.beginPath();
  ctx.moveTo(-d.r * 0.15, -d.r * 0.075);
  ctx.quadraticCurveTo(-d.r * 0.075, -d.r * 0.155, d.r * 0.01, -d.r * 0.155);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  limb(-0.29, 0.2, 0.01, 0.14, 0.3, 0.27, Math.max(1.2, d.r * 0.028));
  knob(-0.29, 0.2, d.r * 0.034, d.r * 0.021, 0.24);
  knob(0.3, 0.27, d.r * 0.031, d.r * 0.019, -0.2);

  ctx.fillStyle = bone;
  for (const [x, y, rx, ry, rot] of [
    [-0.42, 0.29, 0.038, 0.021, 0.45],
    [0.31, 0.32, 0.033, 0.018, -0.28],
    [0.48, 0.3, 0.026, 0.015, 0.3],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
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
