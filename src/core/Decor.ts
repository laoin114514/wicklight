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
  const variant = Math.sin(d.x * 0.021 + d.y * 0.017);
  const mirror = variant < 0 ? -1 : 1;
  const body = night ? '#2b2340' : '#252a3a';
  const lit = night ? '#3e315a' : '#343b52';
  const dark = night ? '#171222' : '#151723';
  const edge = night ? 'rgba(193,165,247,0.14)' : 'rgba(168,188,231,0.13)';
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;
  const stone = (
    x: number,
    y: number,
    w: number,
    h: number,
    rot: number,
    fill: string,
    crack: boolean,
  ): void => {
    const sw = w * d.r;
    const sh = h * d.r;
    ctx.save();
    ctx.translate(px(x), py(y));
    ctx.rotate((rot + variant * 0.04) * mirror);
    ctx.beginPath();
    ctx.moveTo(-sw * 0.5, sh * 0.15);
    ctx.lineTo(-sw * 0.41, -sh * 0.31);
    ctx.lineTo(-sw * 0.15, -sh * 0.5);
    ctx.lineTo(sw * 0.2, -sh * 0.46);
    ctx.lineTo(sw * 0.47, -sh * 0.12);
    ctx.lineTo(sw * 0.5, sh * 0.26);
    ctx.lineTo(sw * 0.18, sh * 0.47);
    ctx.lineTo(-sw * 0.22, sh * 0.44);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(0.7, d.r * 0.014);
    ctx.stroke();
    ctx.fillStyle = lit;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(-sw * 0.41, -sh * 0.27);
    ctx.lineTo(-sw * 0.14, -sh * 0.46);
    ctx.lineTo(sw * 0.17, -sh * 0.42);
    ctx.lineTo(sw * 0.38, -sh * 0.12);
    ctx.lineTo(sw * 0.08, -sh * 0.06);
    ctx.lineTo(-sw * 0.18, -sh * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(0.55, d.r * 0.008);
    ctx.beginPath();
    ctx.moveTo(-sw * 0.38, -sh * 0.3);
    ctx.lineTo(-sw * 0.13, -sh * 0.47);
    ctx.lineTo(sw * 0.16, -sh * 0.43);
    ctx.stroke();
    if (crack) {
      ctx.strokeStyle = 'rgba(6,8,13,0.42)';
      ctx.lineWidth = Math.max(0.6, d.r * 0.01);
      ctx.beginPath();
      ctx.moveTo(sw * 0.05, -sh * 0.4);
      ctx.lineTo(sw * 0.09, -sh * 0.16);
      ctx.lineTo(sw * 0.01, sh * 0.02);
      ctx.lineTo(sw * 0.08, sh * 0.19);
      ctx.stroke();
    }
    ctx.restore();
  };

  ctx.fillStyle = 'rgba(0,0,0,0.33)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.02 * mirror, d.y + d.r * 0.27, d.r * 0.63, d.r * 0.15, -0.03 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? 'rgba(63,46,91,0.2)' : 'rgba(45,49,68,0.2)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.02, d.y + d.r * 0.24, d.r * 0.72, d.r * 0.12, -0.04 * mirror, 0, TAU);
  ctx.fill();

  stone(-0.27, 0.04, 0.56, 0.43, -0.08, body, true);
  stone(0.3, 0.1, 0.4, 0.32, 0.21, dark, false);
  stone(-0.1, -0.08, 0.44, 0.19, -0.24, lit, false);
  stone(-0.4, 0.23, 0.28, 0.23, 0.12, body, false);
  stone(-0.08, 0.28, 0.38, 0.2, -0.04, lit, false);
  stone(0.24, 0.26, 0.3, 0.22, 0.23, body, true);
  stone(0.49, 0.29, 0.17, 0.14, -0.2, dark, false);

  ctx.fillStyle = dark;
  for (const [x, y, rx, ry, rot] of [
    [-0.56, 0.31, 0.08, 0.04, 0.3],
    [0.04, 0.4, 0.07, 0.035, -0.12],
    [0.4, 0.38, 0.055, 0.03, 0.22],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = night ? 'rgba(108,87,145,0.2)' : 'rgba(95,105,130,0.18)';
  ctx.lineWidth = Math.max(0.5, d.r * 0.007);
  ctx.beginPath();
  ctx.moveTo(px(-0.49), py(0.17));
  ctx.lineTo(px(-0.37), py(0.14));
  ctx.moveTo(px(0.38), py(0.18));
  ctx.lineTo(px(0.47), py(0.22));
  ctx.stroke();
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
  const phase = d.x * 0.019 + d.y * 0.013;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const pulse = 0.64 + Math.sin(time * 2.2 + phase) * 0.24;
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

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.32, d.r * 0.36, d.r * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(101,52,31,0.17)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.02, d.y + d.r * 0.28, d.r * 0.44, d.r * 0.09, -0.05 * mirror, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#1e1110';
  ctx.strokeStyle = 'rgba(5,2,2,0.56)';
  ctx.lineWidth = Math.max(0.8, d.r * 0.016);
  shape([
    [-0.22, 0.32],
    [-0.33, 0.04],
    [-0.41, -0.3],
    [-0.2, 0.02],
    [-0.02, 0.32],
  ]);
  ctx.fill();
  ctx.stroke();
  shape([
    [0.07, 0.32],
    [0.18, 0.03],
    [0.35, -0.24],
    [0.26, 0.08],
    [0.24, 0.31],
  ]);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,116,42,${0.2 + pulse * 0.16})`;
  ctx.lineWidth = Math.max(0.6, d.r * 0.009);
  ctx.beginPath();
  ctx.moveTo(px(-0.3), py(0.12));
  ctx.lineTo(px(-0.34), py(-0.08));
  ctx.lineTo(px(-0.37), py(-0.22));
  ctx.moveTo(px(0.19), py(0.08));
  ctx.lineTo(px(0.24), py(-0.08));
  ctx.stroke();

  const outer: readonly (readonly [number, number])[] = [
    [-0.31, 0.33],
    [-0.225, 0.04],
    [-0.16, -0.33],
    [0.03, -0.86],
    [0.095, -0.34],
    [0.17, -0.01],
    [0.27, 0.32],
  ];
  shape(outer);
  ctx.fillStyle = '#281714';
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,2,2,0.72)';
  ctx.lineWidth = Math.max(1, d.r * 0.02);
  ctx.stroke();

  shape([
    [-0.31, 0.33],
    [-0.225, 0.04],
    [-0.16, -0.33],
    [0.03, -0.86],
    [0.01, 0.33],
  ]);
  ctx.fillStyle = '#170d0d';
  ctx.fill();
  shape([
    [0.03, -0.86],
    [0.095, -0.34],
    [0.17, -0.01],
    [0.27, 0.32],
    [0.01, 0.33],
  ]);
  ctx.fillStyle = '#3b2017';
  ctx.fill();
  shape([
    [0.03, -0.86],
    [0.04, -0.32],
    [0.035, 0.05],
    [0.01, 0.33],
    [-0.035, 0.33],
    [-0.022, -0.31],
  ]);
  ctx.fillStyle = 'rgba(88,43,26,0.72)';
  ctx.fill();

  ctx.save();
  shape(outer);
  ctx.clip();
  const inner = ctx.createRadialGradient(px(0.01), py(-0.05), 0, px(0.01), py(-0.05), d.r * 0.5);
  inner.addColorStop(0, `rgba(255,104,33,${0.24 * pulse})`);
  inner.addColorStop(0.55, `rgba(175,58,22,${0.09 * pulse})`);
  inner.addColorStop(1, 'rgba(80,24,12,0)');
  ctx.fillStyle = inner;
  ctx.fillRect(px(-0.35), py(-0.9), d.r * 0.7, d.r * 1.3);
  ctx.restore();

  ctx.strokeStyle = 'rgba(14,6,4,0.72)';
  ctx.lineWidth = Math.max(1, d.r * 0.018);
  ctx.beginPath();
  ctx.moveTo(px(-0.2), py(-0.36));
  ctx.lineTo(px(-0.08), py(-0.12));
  ctx.lineTo(px(0.02), py(0.09));
  ctx.lineTo(px(-0.03), py(0.3));
  ctx.moveTo(px(0.075), py(-0.41));
  ctx.lineTo(px(0.12), py(-0.14));
  ctx.moveTo(px(-0.12), py(0.12));
  ctx.lineTo(px(-0.26), py(0.27));
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,122,43,${0.32 + pulse * 0.25})`;
  ctx.lineWidth = Math.max(0.7, d.r * 0.012);
  ctx.beginPath();
  ctx.moveTo(px(-0.2), py(-0.36));
  ctx.lineTo(px(-0.08), py(-0.12));
  ctx.lineTo(px(0.02), py(0.09));
  ctx.lineTo(px(-0.03), py(0.3));
  ctx.moveTo(px(0.075), py(-0.41));
  ctx.lineTo(px(0.12), py(-0.14));
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,218,137,${0.18 + pulse * 0.16})`;
  ctx.lineWidth = Math.max(0.45, d.r * 0.005);
  ctx.beginPath();
  ctx.moveTo(px(-0.08), py(-0.12));
  ctx.lineTo(px(0.02), py(0.09));
  ctx.lineTo(px(-0.03), py(0.3));
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,126,48,0.2)';
  shape([
    [-0.18, 0.31],
    [-0.1, 0.23],
    [-0.02, 0.31],
    [0.11, 0.21],
    [0.25, 0.32],
    [0.17, 0.36],
    [-0.15, 0.36],
  ]);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(d.x, d.y + d.r * 0.02, 0, d.x, d.y + d.r * 0.02, d.r * 0.54);
  halo.addColorStop(0, `rgba(255,104,36,${0.13 * pulse})`);
  halo.addColorStop(0.5, `rgba(210,65,20,${0.04 * pulse})`);
  halo.addColorStop(1, 'rgba(120,32,10,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(d.x, d.y + d.r * 0.02, d.r * 0.54, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 3; i += 1) {
    const rise = (time * 0.17 + i * 0.31 + phase * 0.1) % 1;
    const ex = d.x + Math.sin(phase * 2 + i * 2.3 + rise * 4) * d.r * 0.07;
    const ey = d.y + d.r * 0.05 - rise * d.r * 0.82;
    ctx.fillStyle = `rgba(255,157,77,${(1 - rise) * 0.32})`;
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(0.55, d.r * (0.016 - rise * 0.005)), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function crack(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const phase = d.x * 0.021 + d.y * 0.017;
  const variant = Math.sin(phase);
  const mirror = variant < 0 ? -1 : 1;
  const pulse = 0.58 + Math.sin(time * 1.8 + phase) * 0.24;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;
  const main: readonly (readonly [number, number])[] = [
    [-0.78, -0.17],
    [-0.55, -0.22],
    [-0.39, -0.06],
    [-0.22, -0.11],
    [-0.02, 0.02],
    [0.16, -0.09],
    [0.34, 0.05],
    [0.52, 0.02],
    [0.73, 0.21],
  ];
  const trace = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    });
  };

  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.08, d.r * 0.69, d.r * 0.18, -0.03 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(18,8,5,0.55)';
  for (const [x, y, rx, ry, rot] of [
    [-0.49, -0.12, 0.2, 0.07, -0.12],
    [-0.08, 0.01, 0.24, 0.08, 0.04],
    [0.36, 0.05, 0.2, 0.065, -0.1],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror, 0, TAU);
    ctx.fill();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(main);
  ctx.strokeStyle = 'rgba(83,38,22,0.16)';
  ctx.lineWidth = d.r * 0.3;
  ctx.stroke();
  trace(main);
  ctx.strokeStyle = 'rgba(12,5,3,0.72)';
  ctx.lineWidth = d.r * 0.17;
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  trace(main);
  ctx.strokeStyle = `rgba(255,96,28,${0.16 + pulse * 0.12})`;
  ctx.lineWidth = d.r * 0.062;
  ctx.stroke();
  trace(main);
  ctx.strokeStyle = `rgba(255,128,43,${0.38 + pulse * 0.24})`;
  ctx.lineWidth = d.r * 0.025;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,226,154,${0.27 + pulse * 0.22})`;
  ctx.lineWidth = Math.max(0.65, d.r * 0.008);
  trace(main);
  ctx.stroke();

  for (const [points, width] of [
    [[[-0.22, -0.11], [-0.32, 0.14], [-0.21, 0.29]] as const, 0.017],
    [[[0.16, -0.09], [0.22, -0.3], [0.35, -0.37]] as const, 0.015],
    [[[0.34, 0.05], [0.43, 0.27], [0.59, 0.33]] as const, 0.014],
  ] as const) {
    trace(points);
    ctx.strokeStyle = `rgba(255,120,39,${0.28 + pulse * 0.2})`;
    ctx.lineWidth = Math.max(0.7, d.r * width);
    ctx.stroke();
  }

  for (const [x, y, rx, ry, rot] of [
    [-0.39, -0.06, 0.032, 0.016, -0.2],
    [-0.02, 0.02, 0.04, 0.019, 0.1],
    [0.34, 0.05, 0.03, 0.016, -0.25],
    [0.52, 0.02, 0.023, 0.012, 0.2],
  ] as const) {
    ctx.fillStyle = `rgba(255,150,54,${0.36 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,238,178,${0.22 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx * 0.45, d.r * ry * 0.48, rot * mirror, 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < 3; i += 1) {
    const rise = (time * 0.14 + i * 0.33 + phase * 0.07) % 1;
    const ex = px(-0.34 + i * 0.35) + Math.sin(phase + rise * 5 + i) * d.r * 0.03;
    const ey = py(0.02) - rise * d.r * 0.62;
    ctx.fillStyle = `rgba(255,164,82,${(1 - rise) * 0.28})`;
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(0.5, d.r * (0.012 - rise * 0.004)), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const chip = (x: number, y: number, w: number, h: number, rot: number): void => {
    ctx.save();
    ctx.translate(px(x), py(y));
    ctx.rotate(rot * mirror);
    ctx.fillStyle = '#21110d';
    ctx.beginPath();
    ctx.moveTo(-w * d.r * 0.5, h * d.r * 0.18);
    ctx.lineTo(-w * d.r * 0.2, -h * d.r * 0.5);
    ctx.lineTo(w * d.r * 0.45, -h * d.r * 0.25);
    ctx.lineTo(w * d.r * 0.36, h * d.r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,118,47,0.13)';
    ctx.lineWidth = Math.max(0.5, d.r * 0.007);
    ctx.beginPath();
    ctx.moveTo(-w * d.r * 0.17, -h * d.r * 0.42);
    ctx.lineTo(w * d.r * 0.36, -h * d.r * 0.2);
    ctx.stroke();
    ctx.restore();
  };
  chip(-0.55, 0.08, 0.1, 0.08, -0.2);
  chip(-0.18, 0.19, 0.08, 0.07, 0.18);
  chip(0.24, 0.18, 0.09, 0.065, -0.26);
  chip(0.56, 0.17, 0.07, 0.06, 0.12);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
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
  const phase = time * 1.05 + d.x * 0.04 + d.y * 0.017;
  const mirror = Math.sin(d.x * 0.021 + d.y * 0.033) < 0 ? -1 : 1;
  const wind = Math.sin(phase) * d.r * 0.08 + Math.sin(phase * 0.57 + 1.3) * d.r * 0.035;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(2,7,4,0.26)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.36, d.r * 0.58, d.r * 0.2, 0.03 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(14,35,21,0.54)';
  for (const [x, y, rx, ry] of [
    [-0.25, 0.3, 0.28, 0.12],
    [0.03, 0.31, 0.24, 0.1],
    [0.27, 0.28, 0.18, 0.09],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, -0.08 * mirror, 0, TAU);
    ctx.fill();
  }

  const blades: readonly (readonly [number, number, number, number, number, string])[] = [
    [-0.38, 0.27, -0.61, -0.62, 0.06, 'rgba(57,102,70,0.5)'],
    [-0.19, 0.3, -0.28, -0.9, 0.075, 'rgba(75,134,88,0.52)'],
    [0.02, 0.32, 0.1, -1.02, 0.082, 'rgba(100,163,105,0.52)'],
    [0.2, 0.3, 0.43, -0.78, 0.068, 'rgba(72,129,86,0.5)'],
    [0.36, 0.27, 0.6, -0.55, 0.052, 'rgba(55,96,66,0.48)'],
    [-0.08, 0.2, -0.03, -0.43, 0.048, 'rgba(86,139,91,0.4)'],
    [0.25, 0.22, 0.32, -0.42, 0.045, 'rgba(78,123,78,0.38)'],
  ];
  blades.forEach(([rootX, rootY, tipX, tipY, width, tint], index) => {
    const bend = Math.sin(phase + index * 0.72) * d.r * (0.045 + Math.abs(tipY) * 0.025) + wind;
    const bx = px(rootX);
    const by = py(rootY);
    const tx = px(tipX) + bend;
    const ty = py(tipY);
    const mx = bx + (tx - bx) * 0.38;
    const my = by + (ty - by) * 0.52;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(bx - d.r * width * 0.5, by);
    ctx.quadraticCurveTo(mx - d.r * width * 0.7, my, tx, ty);
    ctx.quadraticCurveTo(mx + d.r * width * 0.55, my, bx + d.r * width * 0.5, by);
    ctx.closePath();
    ctx.fill();
  });

  if (d.r > 9) {
    const stemX = px(0.22) + wind * 1.2;
    ctx.strokeStyle = 'rgba(121,124,76,0.32)';
    ctx.lineWidth = Math.max(0.45, d.r * 0.035);
    ctx.beginPath();
    ctx.moveTo(px(0.16), py(0.25));
    ctx.quadraticCurveTo(px(0.24), py(-0.12), stemX, py(-0.54));
    ctx.stroke();
    ctx.fillStyle = 'rgba(142,137,88,0.38)';
    ctx.beginPath();
    ctx.ellipse(stemX, py(-0.56), d.r * 0.055, d.r * 0.11, 0.26 * mirror, 0, TAU);
    ctx.fill();
  }
}

function pebble(ctx: CanvasRenderingContext2D, d: Decor, tint: string): void {
  const phase = d.x * 0.017 + d.y * 0.023;
  const rot = Math.sin(phase) * 0.62;
  const mirror = Math.cos(phase * 1.3) < 0 ? -1 : 1;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const point = (x: number, y: number): readonly [number, number] => [
    d.x + (x * cos - y * sin) * d.r * mirror,
    d.y + (x * sin + y * cos) * d.r * 0.78,
  ];
  const trace = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const [wx, wy] = point(x, y);
      if (index === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    });
    ctx.closePath();
  };

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.08 * mirror, d.y + d.r * 0.24, d.r * 0.74, d.r * 0.26, rot * 0.35, 0, TAU);
  ctx.fill();

  const body: readonly (readonly [number, number])[] = [
    [-0.82, 0.08],
    [-0.58, -0.3],
    [-0.22, -0.5],
    [0.2, -0.48],
    [0.62, -0.22],
    [0.78, 0.12],
    [0.42, 0.4],
    [-0.08, 0.47],
    [-0.6, 0.32],
  ];
  trace(body);
  ctx.fillStyle = tint;
  ctx.fill();

  trace([
    [-0.7, 0.02],
    [-0.5, -0.28],
    [-0.18, -0.42],
    [0.08, -0.39],
    [0.02, -0.13],
    [-0.26, -0.02],
    [-0.39, 0.19],
  ]);
  ctx.fillStyle = 'rgba(225,236,255,0.1)';
  ctx.fill();
  trace([
    [0.18, -0.4],
    [0.58, -0.2],
    [0.71, 0.09],
    [0.39, 0.34],
    [0.06, 0.38],
    [0.2, 0.12],
    [0.34, -0.1],
  ]);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(0.4, d.r * 0.025);
  ctx.beginPath();
  const [crackX, crackY] = point(0.08, -0.36);
  const [crackX2, crackY2] = point(-0.02, -0.08);
  const [crackX3, crackY3] = point(0.18, 0.11);
  ctx.moveTo(crackX, crackY);
  ctx.lineTo(crackX2, crackY2);
  ctx.lineTo(crackX3, crackY3);
  ctx.stroke();

  const [chipX, chipY] = point(-0.46, 0.37);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(chipX, chipY, d.r * 0.2, d.r * 0.12, rot * 0.5, 0, TAU);
  ctx.fill();
}

function chip(ctx: CanvasRenderingContext2D, d: Decor, tint: string): void {
  const phase = d.x * 0.021 + d.y * 0.016;
  const rot = Math.sin(phase) * 0.5;
  const mirror = Math.cos(phase * 1.4) < 0 ? -1 : 1;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const point = (x: number, y: number): readonly [number, number] => [
    d.x + (x * cos - y * sin) * d.r * mirror,
    d.y + (x * sin + y * cos) * d.r * 0.58,
  ];
  const trace = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const [wx, wy] = point(x, y);
      if (index === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    });
    ctx.closePath();
  };

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.1 * mirror, d.y + d.r * 0.27, d.r * 0.7, d.r * 0.22, rot * 0.3, 0, TAU);
  ctx.fill();

  trace([
    [-0.91, -0.08],
    [-0.67, -0.4],
    [-0.21, -0.52],
    [0.27, -0.44],
    [0.82, -0.29],
    [0.58, -0.06],
    [0.84, 0.07],
    [0.58, 0.31],
    [0.04, 0.42],
    [-0.58, 0.35],
    [-0.84, 0.14],
  ]);
  ctx.fillStyle = tint;
  ctx.fill();
  trace([
    [-0.67, -0.4],
    [-0.21, -0.52],
    [0.27, -0.44],
    [0.61, -0.33],
    [0.24, -0.13],
    [-0.51, -0.16],
  ]);
  ctx.fillStyle = 'rgba(218,228,255,0.11)';
  ctx.fill();
  trace([
    [0.82, -0.29],
    [0.84, 0.07],
    [0.58, 0.31],
    [0.32, 0.18],
    [0.53, -0.03],
  ]);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.26)';
  ctx.lineWidth = Math.max(0.4, d.r * 0.024);
  const [c1x, c1y] = point(-0.16, -0.36);
  const [c2x, c2y] = point(-0.05, -0.1);
  const [c3x, c3y] = point(0.24, 0.02);
  ctx.beginPath();
  ctx.moveTo(c1x, c1y);
  ctx.lineTo(c2x, c2y);
  ctx.lineTo(c3x, c3y);
  ctx.stroke();

  trace([
    [-0.64, 0.34],
    [-0.46, 0.19],
    [-0.2, 0.27],
    [-0.29, 0.43],
  ]);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  const [edgeX, edgeY] = point(0.55, -0.25);
  const [edgeX2, edgeY2] = point(0.18, -0.39);
  ctx.strokeStyle = 'rgba(220,230,255,0.12)';
  ctx.lineWidth = Math.max(0.4, d.r * 0.022);
  ctx.beginPath();
  ctx.moveTo(edgeX, edgeY);
  ctx.lineTo(edgeX2, edgeY2);
  ctx.stroke();
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
  const phase = time * 2.05 + d.x * 0.043 + d.y * 0.029;
  const pulse = 0.42 + Math.sin(phase) * 0.2;
  const mirror = Math.sin(d.x * 0.017 + d.y * 0.023) < 0 ? -1 : 1;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(5,2,2,0.24)';
  ctx.beginPath();
  ctx.ellipse(px(0.04), py(0.2), d.r * 0.6, d.r * 0.22, 0.04 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(28,12,7,0.6)';
  ctx.beginPath();
  ctx.moveTo(px(-0.48), py(0.02));
  ctx.lineTo(px(-0.16), py(-0.22));
  ctx.lineTo(px(0.25), py(-0.15));
  ctx.lineTo(px(0.42), py(0.09));
  ctx.lineTo(px(0.12), py(0.26));
  ctx.lineTo(px(-0.29), py(0.21));
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,91,24,${0.07 + pulse * 0.05})`;
  ctx.beginPath();
  ctx.ellipse(px(0.02), py(0.1), d.r * 0.72, d.r * 0.27, 0.02 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,144,52,${0.18 + pulse * 0.16})`;
  ctx.beginPath();
  ctx.ellipse(px(-0.11), py(-0.04), d.r * 0.2, d.r * 0.1, 0.16 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,207,125,${0.22 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(px(-0.12), py(-0.06), Math.max(0.4, d.r * 0.055), 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,108,33,${0.09 + pulse * 0.08})`;
  ctx.beginPath();
  ctx.arc(px(0.2), py(0.02), Math.max(0.35, d.r * 0.04), 0, TAU);
  ctx.fill();

  const rise = (time * 0.2 + d.x * 0.0017 + d.y * 0.0023) % 1;
  ctx.fillStyle = `rgba(255,157,66,${(1 - rise) * 0.16})`;
  ctx.beginPath();
  ctx.arc(px(0.04 + Math.sin(phase * 0.6) * 0.06), py(-0.08 - rise * 0.48), Math.max(0.35, d.r * 0.016), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function mushroomDot(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const phase = time * 0.7 + d.x * 0.023 + d.y * 0.031;
  const mirror = Math.sin(d.x * 0.017 + d.y * 0.013) < 0 ? -1 : 1;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(2,7,5,0.24)';
  ctx.beginPath();
  ctx.ellipse(px(0.04), py(0.4), d.r * 0.62, d.r * 0.2, 0.04 * mirror, 0, TAU);
  ctx.fill();

  const stem = (x: number, baseY: number, capY: number, lean: number, width: number): void => {
    ctx.fillStyle = 'rgba(82,108,87,0.5)';
    ctx.beginPath();
    ctx.moveTo(px(x - width * 0.5), py(baseY));
    ctx.quadraticCurveTo(px(x - width * 0.35 + lean), py((baseY + capY) * 0.5), px(x - width * 0.24 + lean), py(capY));
    ctx.lineTo(px(x + width * 0.26 + lean), py(capY));
    ctx.quadraticCurveTo(px(x + width * 0.38), py((baseY + capY) * 0.5), px(x + width * 0.5), py(baseY));
    ctx.closePath();
    ctx.fill();
  };
  const cap = (x: number, y: number, rx: number, ry: number, tint: string): void => {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(px(x - rx), py(y));
    ctx.quadraticCurveTo(px(x - rx * 0.9), py(y - ry * 1.55), px(x + rx * 0.05), py(y - ry * 1.62));
    ctx.quadraticCurveTo(px(x + rx * 0.95), py(y - ry * 1.4), px(x + rx), py(y));
    ctx.quadraticCurveTo(px(x + rx * 0.48), py(y + ry * 0.42), px(x - rx * 0.46), py(y + ry * 0.36));
    ctx.closePath();
    ctx.fill();
  };

  stem(-0.48, 0.34, 0.13, 0.03, 0.1);
  cap(-0.44, 0.12, 0.17, 0.1, 'rgba(75,116,95,0.43)');
  stem(0, 0.42, -0.18, 0.045, 0.14);
  cap(0.03, -0.16, 0.42, 0.25, 'rgba(96,146,116,0.48)');
  stem(0.43, 0.36, 0.07, -0.025, 0.09);
  cap(0.42, 0.08, 0.23, 0.14, 'rgba(81,126,101,0.45)');

  ctx.strokeStyle = 'rgba(169,210,173,0.21)';
  ctx.lineWidth = Math.max(0.45, d.r * 0.028);
  ctx.beginPath();
  ctx.moveTo(px(-0.35), py(-0.17));
  ctx.quadraticCurveTo(px(-0.28), py(-0.37), px(0.02), py(-0.42));
  ctx.quadraticCurveTo(px(0.28), py(-0.38), px(0.36), py(-0.22));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(34,66,50,0.48)';
  ctx.lineWidth = Math.max(0.35, d.r * 0.018);
  for (const [x, y, dx] of [
    [-0.19, 0.01, -0.08],
    [0, 0.04, 0.01],
    [0.18, 0.01, 0.1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(px(x), py(y));
    ctx.lineTo(px(x + dx), py(y + 0.09));
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i += 1) {
    const rise = (time * 0.12 + phase * 0.05 + i * 0.37) % 1;
    const sx = px(0.08 + Math.sin(phase + i * 2.1) * 0.3);
    const sy = py(-0.26 - rise * 0.36);
    ctx.fillStyle = `rgba(146,211,158,${(1 - rise) * (0.08 + i * 0.01)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.35, d.r * 0.015), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function leafLitter(ctx: CanvasRenderingContext2D, d: Decor): void {
  const phase = d.x * 0.019 + d.y * 0.027;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const spin = Math.sin(phase * 1.7) * 0.22;
  ctx.fillStyle = 'rgba(2,6,4,0.2)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.05 * mirror, d.y + d.r * 0.16, d.r * 0.7, d.r * 0.26, 0.06 * mirror, 0, TAU);
  ctx.fill();

  const leaves: readonly (readonly [number, number, number, number, number, string])[] = [
    [-0.42, 0.11, -2.45 + spin, 0.64, 0.21, 'rgba(66,102,66,0.42)'],
    [-0.03, -0.16, 0.55 - spin, 0.72, 0.24, 'rgba(119,98,58,0.4)'],
    [0.43, 0.13, 2.35 + spin, 0.57, 0.2, 'rgba(79,119,78,0.42)'],
    [-0.05, 0.27, 1.92 - spin, 0.48, 0.17, 'rgba(104,88,54,0.36)'],
    [0.24, -0.23, -0.84 + spin, 0.38, 0.14, 'rgba(56,91,61,0.34)'],
  ];
  leaves.forEach(([x, y, angle, length, width, tint], index) => {
    const a = angle * mirror;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const cx = d.x + x * d.r * mirror;
    const cy = d.y + y * d.r;
    const half = d.r * length * 0.5;
    const halfW = d.r * width;
    const px = -sin * halfW;
    const py = cos * halfW;
    const tipX = cx + cos * half;
    const tipY = cy + sin * half;
    const baseX = cx - cos * half;
    const baseY = cy - sin * half;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(cx + cos * half * 0.12 + px, cy + sin * half * 0.12 + py, tipX, tipY);
    ctx.quadraticCurveTo(cx - cos * half * 0.18 - px, cy - sin * half * 0.18 - py, baseX, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = index === 1 ? 'rgba(156,126,73,0.2)' : 'rgba(111,151,92,0.17)';
    ctx.lineWidth = Math.max(0.35, d.r * 0.018);
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX - cos * half * 0.12, tipY - sin * half * 0.12);
    ctx.stroke();
    if (index < 4) {
      ctx.strokeStyle = 'rgba(30,45,27,0.22)';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX - cos * d.r * 0.09, baseY - sin * d.r * 0.09);
      ctx.stroke();
    }
  });
}

function fallenTwig(ctx: CanvasRenderingContext2D, d: Decor): void {
  const phase = d.x * 0.031 + d.y * 0.023;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const rot = Math.sin(phase * 1.4) * 0.48;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const px = (v: number): number => d.x + (v * cos) * d.r * mirror;
  const py = (v: number): number => d.y + (v * sin + Math.abs(v) * 0.08) * d.r;

  ctx.fillStyle = 'rgba(2,6,4,0.18)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.08 * mirror, d.y + d.r * 0.2, d.r * 0.72, d.r * 0.17, rot * 0.4, 0, TAU);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(58,46,29,0.58)';
  ctx.lineWidth = Math.max(0.6, d.r * 0.075);
  ctx.beginPath();
  ctx.moveTo(px(-0.88), py(0.1));
  ctx.lineTo(px(-0.34), py(-0.08));
  ctx.lineTo(px(0.08), py(0.04));
  ctx.lineTo(px(0.52), py(-0.12));
  ctx.lineTo(px(0.82), py(-0.04));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(92,77,47,0.38)';
  ctx.lineWidth = Math.max(0.5, d.r * 0.048);
  ctx.beginPath();
  ctx.moveTo(px(-0.3), py(-0.08));
  ctx.lineTo(px(-0.52), py(-0.38));
  ctx.moveTo(px(0.28), py(-0.03));
  ctx.lineTo(px(0.38), py(0.3));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(137,122,78,0.18)';
  ctx.lineWidth = Math.max(0.35, d.r * 0.025);
  ctx.beginPath();
  ctx.moveTo(px(-0.78), py(0.03));
  ctx.lineTo(px(-0.32), py(-0.15));
  ctx.lineTo(px(0.06), py(-0.03));
  ctx.stroke();

  ctx.fillStyle = 'rgba(151,144,91,0.3)';
  ctx.beginPath();
  ctx.ellipse(px(0.84), py(-0.02), d.r * 0.035, d.r * 0.07, rot, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(69,104,66,0.32)';
  ctx.beginPath();
  ctx.ellipse(px(-0.38), py(-0.11), d.r * 0.1, d.r * 0.045, rot, 0, TAU);
  ctx.fill();
}

function mossPatch(ctx: CanvasRenderingContext2D, d: Decor): void {
  const phase = d.x * 0.023 + d.y * 0.019;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const tilt = Math.sin(phase * 1.3) * 0.32;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(41,74,55,0.23)';
  for (const [x, y, rx, ry, rot] of [
    [-0.25, 0.04, 0.46, 0.22, -0.12],
    [0.2, 0.02, 0.34, 0.18, 0.16],
    [0.02, 0.17, 0.3, 0.13, 0.02],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror + tilt, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(41,74,55,0.18)';
  for (const [x, y, rx, ry, rot] of [
    [-0.54, -0.08, 0.16, 0.08, -0.32],
    [-0.32, 0.21, 0.14, 0.07, 0.18],
    [0.12, -0.15, 0.15, 0.07, 0.26],
    [0.38, 0.14, 0.13, 0.06, -0.2],
    [0.46, -0.08, 0.1, 0.045, 0.3],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror + tilt, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(82,121,76,0.16)';
  ctx.beginPath();
  ctx.ellipse(px(-0.1), py(-0.03), d.r * 0.31, d.r * 0.13, tilt, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(118,154,91,0.15)';
  for (const [x, y, radius] of [
    [-0.38, -0.02, 0.026],
    [-0.13, 0.08, 0.02],
    [0.1, -0.06, 0.023],
    [0.31, 0.08, 0.018],
  ] as const) {
    ctx.beginPath();
    ctx.arc(px(x), py(y), Math.max(0.35, d.r * radius), 0, TAU);
    ctx.fill();
  }
}

function ashMound(ctx: CanvasRenderingContext2D, d: Decor): void {
  const phase = d.x * 0.029 + d.y * 0.021;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const pulse = 0.45 + Math.sin(phase * 2.1) * 0.18;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(7,4,3,0.22)';
  ctx.beginPath();
  ctx.ellipse(px(0.04), py(0.2), d.r * 0.72, d.r * 0.2, 0.03 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(62,51,48,0.5)';
  ctx.beginPath();
  ctx.moveTo(px(-0.67), py(0.15));
  ctx.quadraticCurveTo(px(-0.56), py(-0.28), px(-0.16), py(-0.38));
  ctx.quadraticCurveTo(px(0.39), py(-0.34), px(0.67), py(0.08));
  ctx.quadraticCurveTo(px(0.34), py(0.33), px(-0.12), py(0.3));
  ctx.quadraticCurveTo(px(-0.48), py(0.28), px(-0.67), py(0.15));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(119,102,98,0.24)';
  ctx.beginPath();
  ctx.ellipse(px(-0.12), py(-0.22), d.r * 0.34, d.r * 0.12, -0.04 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(29,23,23,0.5)';
  for (const [x, y, rx, ry] of [
    [-0.34, 0.05, 0.12, 0.05],
    [0.14, 0.14, 0.1, 0.04],
    [0.39, -0.06, 0.08, 0.035],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, 0.08 * mirror, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,118,38,${0.1 + pulse * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(px(0.08), py(0.02), d.r * 0.17, d.r * 0.07, 0.05 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,188,96,${0.16 + pulse * 0.13})`;
  ctx.beginPath();
  ctx.arc(px(0.09), py(0.01), Math.max(0.35, d.r * 0.035), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function glassShard(ctx: CanvasRenderingContext2D, d: Decor): void {
  const phase = d.x * 0.025 + d.y * 0.031;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const tilt = Math.sin(phase * 1.6) * 0.38;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(2,2,8,0.2)';
  ctx.beginPath();
  ctx.ellipse(px(0.03), py(0.16), d.r * 0.58, d.r * 0.17, tilt * 0.3, 0, TAU);
  ctx.fill();
  const shards: readonly (readonly [number, number, number, number, number])[] = [
    [-0.43, 0.14, -0.19, -0.31, 0.18],
    [0.01, 0.15, 0.31, -0.06, 0.22],
    [0.31, 0.15, 0.57, 0.2, 0.14],
  ];
  shards.forEach(([x, y, tipX, tipY, width], index) => {
    ctx.fillStyle = index === 1 ? 'rgba(102,76,145,0.36)' : 'rgba(76,62,108,0.34)';
    ctx.beginPath();
    ctx.moveTo(px(x - width * 0.5), py(y));
    ctx.lineTo(px(tipX), py(tipY));
    ctx.lineTo(px(x + width * 0.55), py(y + 0.04));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = index === 1 ? 'rgba(194,166,247,0.19)' : 'rgba(145,120,194,0.13)';
    ctx.lineWidth = Math.max(0.35, d.r * 0.02);
    ctx.beginPath();
    ctx.moveTo(px(x - width * 0.2), py(y));
    ctx.lineTo(px(tipX), py(tipY));
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(225,208,255,0.2)';
  ctx.beginPath();
  ctx.arc(px(0.28), py(-0.02), Math.max(0.35, d.r * 0.024), 0, TAU);
  ctx.fill();
}

function puddle(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const phase = time * 1.15 + d.x * 0.019 + d.y * 0.013;
  const mirror = Math.sin(d.x * 0.017 + d.y * 0.021) < 0 ? -1 : 1;
  const shimmer = 0.38 + Math.sin(phase) * 0.1;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;

  ctx.fillStyle = 'rgba(7,11,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.03 * mirror, d.y + d.r * 0.15, d.r * 1.03, d.r * 0.36, -0.02 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(21,29,48,0.66)';
  ctx.beginPath();
  ctx.ellipse(px(-0.06), py(0), d.r * 0.91, d.r * 0.45, -0.03 * mirror, 0, TAU);
  ctx.ellipse(px(0.34), py(0.04), d.r * 0.38, d.r * 0.22, 0.03 * mirror, 0, TAU);
  ctx.ellipse(px(-0.46), py(0.07), d.r * 0.27, d.r * 0.16, -0.04 * mirror, 0, TAU);
  ctx.fill();

  ctx.fillStyle = `rgba(128,158,220,${0.045 + shimmer * 0.035})`;
  ctx.beginPath();
  ctx.ellipse(px(-0.13), py(-0.09), d.r * 0.5, d.r * 0.18, -0.12 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(3,7,13,0.28)';
  ctx.beginPath();
  ctx.ellipse(px(0.08), py(0.12), d.r * 0.57, d.r * 0.14, 0.02 * mirror, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = `rgba(145,174,232,${0.14 + shimmer * 0.08})`;
  ctx.lineWidth = Math.max(0.55, d.r * 0.04);
  ctx.beginPath();
  ctx.ellipse(px(-0.06), py(0), d.r * 0.91, d.r * 0.45, -0.03 * mirror, Math.PI * 1.04, Math.PI * 1.93);
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(170,198,255,${0.08 + shimmer * 0.05})`;
  ctx.beginPath();
  ctx.ellipse(px(0.015), py(-0.01), d.r * 0.045, d.r * 0.23, 0.04 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(184,210,255,${0.11 + shimmer * 0.07})`;
  ctx.beginPath();
  ctx.ellipse(px(-0.16), py(-0.13), d.r * 0.2, d.r * 0.035, -0.1 * mirror, 0, TAU);
  ctx.fill();

  const ripple = (offset: number, scale: number, alpha: number): void => {
    ctx.strokeStyle = `rgba(176,201,255,${alpha})`;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(px(offset), py(0.015), d.r * scale, d.r * scale * 0.22, -0.03 * mirror, 0, TAU);
    ctx.stroke();
  };
  ripple(0.05 + Math.sin(phase * 0.55) * 0.02, 0.22 + Math.sin(phase * 0.7) * 0.025, 0.09);
  ripple(-0.24, 0.12, 0.07);
  ctx.fillStyle = `rgba(189,214,255,${0.09 + shimmer * 0.05})`;
  ctx.beginPath();
  ctx.arc(px(0.3), py(-0.03), Math.max(0.45, d.r * 0.025), 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = 'rgba(43,48,68,0.5)';
  ctx.beginPath();
  ctx.ellipse(px(0.73), py(0.13), d.r * 0.11, d.r * 0.055, 0.18 * mirror, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(145,168,216,0.15)';
  ctx.lineWidth = Math.max(0.45, d.r * 0.022);
  ctx.beginPath();
  ctx.ellipse(px(0.73), py(0.13), d.r * 0.08, d.r * 0.03, 0.18 * mirror, Math.PI * 1.08, Math.PI * 1.9);
  ctx.stroke();
}

function candleStub(ctx: CanvasRenderingContext2D, d: Decor, time: number, themeId: string): void {
  const night = themeId === 'nightcity';
  const phase = time * 7.6 + d.x * 0.05 + d.y * 0.017;
  const flick = 0.8 + Math.sin(phase) * 0.2;
  const lit = Math.sin(d.x * 0.031 + d.y * 0.023) > -0.45;
  const wax = lit ? (night ? '#6b577e' : '#776d58') : night ? '#584a67' : '#665f50';
  const waxLit = lit ? (night ? '#9c82b8' : '#aa9c7d') : night ? '#78638c' : '#827a67';
  const waxDark = night ? '#443650' : '#4d463a';
  const metal = night ? '#8066a8' : '#59617d';

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.03, d.y + d.r * 0.31, d.r * 0.25, d.r * 0.085, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = waxDark;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.28, d.r * 0.2, d.r * 0.055, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = metal;
  ctx.lineWidth = Math.max(0.55, d.r * 0.035);
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.28, d.r * 0.2, d.r * 0.055, 0, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = wax;
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.1, d.y - d.r * 0.22);
  ctx.quadraticCurveTo(d.x - d.r * 0.12, d.y + d.r * 0.05, d.x - d.r * 0.12, d.y + d.r * 0.26);
  ctx.quadraticCurveTo(d.x, d.y + d.r * 0.32, d.x + d.r * 0.12, d.y + d.r * 0.26);
  ctx.quadraticCurveTo(d.x + d.r * 0.11, d.y + d.r * 0.03, d.x + d.r * 0.1, d.y - d.r * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(d.x + d.r * 0.035, d.y - d.r * 0.21);
  ctx.quadraticCurveTo(d.x + d.r * 0.075, d.y + d.r * 0.05, d.x + d.r * 0.075, d.y + d.r * 0.25);
  ctx.quadraticCurveTo(d.x + d.r * 0.1, d.y + d.r * 0.27, d.x + d.r * 0.12, d.y + d.r * 0.26);
  ctx.quadraticCurveTo(d.x + d.r * 0.11, d.y + d.r * 0.03, d.x + d.r * 0.1, d.y - d.r * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = waxLit;
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.01, d.y - d.r * 0.22, d.r * 0.105, d.r * 0.035, -0.04, 0, TAU);
  ctx.fill();
  ctx.fillStyle = waxDark;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - d.r * 0.215, d.r * 0.062, d.r * 0.019, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = waxLit;
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.1, d.y + d.r * 0.08, d.r * 0.028, d.r * 0.085, 0.04, 0, TAU);
  ctx.fill();
  ctx.fillStyle = wax;
  ctx.beginPath();
  ctx.ellipse(d.x + d.r * 0.105, d.y - d.r * 0.02, d.r * 0.025, d.r * 0.065, -0.06, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? 'rgba(196,154,235,0.34)' : 'rgba(201,185,145,0.3)';
  ctx.beginPath();
  ctx.ellipse(d.x - d.r * 0.055, d.y + d.r * 0.02, d.r * 0.018, d.r * 0.085, 0.08, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#241c17';
  ctx.lineWidth = Math.max(0.55, d.r * 0.028);
  ctx.beginPath();
  ctx.moveTo(d.x, d.y - d.r * 0.225);
  ctx.quadraticCurveTo(d.x - d.r * 0.01, d.y - d.r * 0.29, d.x + d.r * 0.008, d.y - d.r * 0.32);
  ctx.stroke();

  if (!lit) {
    ctx.fillStyle = 'rgba(151,142,126,0.2)';
    ctx.beginPath();
    ctx.arc(d.x + d.r * 0.008, d.y - d.r * 0.33, Math.max(0.35, d.r * 0.022), 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = night ? `rgba(143,92,230,${0.055 * flick})` : `rgba(101,149,255,${0.05 * flick})`;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - d.r * 0.32, d.r * 0.52, d.r * 0.44, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = night ? `rgba(188,135,255,${0.11 * flick})` : `rgba(153,191,255,${0.1 * flick})`;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y - d.r * 0.33, d.r * 0.27, d.r * 0.23, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = night ? 'rgba(207,166,255,0.56)' : 'rgba(168,200,255,0.54)';
  ctx.beginPath();
  ctx.moveTo(d.x - d.r * 0.045, d.y - d.r * 0.31);
  ctx.bezierCurveTo(d.x - d.r * 0.085, d.y - d.r * 0.39, d.x - d.r * 0.04, d.y - d.r * 0.47 * flick, d.x + d.r * 0.008, d.y - d.r * 0.5 * flick);
  ctx.bezierCurveTo(d.x + d.r * 0.06, d.y - d.r * 0.42 * flick, d.x + d.r * 0.075, d.y - d.r * 0.35, d.x + d.r * 0.045, d.y - d.r * 0.31);
  ctx.fill();
  ctx.fillStyle = night ? 'rgba(250,238,255,0.88)' : 'rgba(238,247,255,0.86)';
  ctx.beginPath();
  ctx.moveTo(d.x, d.y - d.r * 0.31);
  ctx.quadraticCurveTo(d.x - d.r * 0.03, d.y - d.r * 0.38, d.x, d.y - d.r * 0.43 * flick);
  ctx.quadraticCurveTo(d.x + d.r * 0.03, d.y - d.r * 0.37, d.x, d.y - d.r * 0.31);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function heatCrack(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const phase = d.x * 0.027 + d.y * 0.019;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const pulse = 0.5 + Math.sin(time * 1.7 + phase) * 0.2;
  const px = (v: number): number => d.x + v * d.r * mirror;
  const py = (v: number): number => d.y + v * d.r;
  const main: readonly (readonly [number, number])[] = [
    [-1.02, -0.12],
    [-0.82, 0.01],
    [-0.66, -0.08],
    [-0.47, 0.09],
    [-0.27, 0.02],
    [-0.07, 0.11],
    [0.14, -0.05],
    [0.34, 0.05],
    [0.55, -0.03],
    [0.78, 0.13],
    [1.02, 0.08],
  ];
  const branches: readonly (readonly (readonly [number, number])[])[] = [
    [
      [-0.42, 0.07],
      [-0.53, 0.27],
      [-0.47, 0.45],
    ],
    [
      [0.27, 0.04],
      [0.41, -0.18],
      [0.38, -0.36],
    ],
    [
      [0.66, 0.05],
      [0.79, 0.27],
      [0.73, 0.39],
    ],
  ];
  const trace = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    });
  };

  ctx.fillStyle = 'rgba(5,2,2,0.28)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.08, d.r * 0.98, d.r * 0.36, 0.04 * mirror, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(12,5,3,0.42)';
  for (const [x, y, rx, ry, rot] of [
    [-0.51, 0.05, 0.31, 0.12, -0.08],
    [-0.06, 0.06, 0.34, 0.13, 0.03],
    [0.44, 0.02, 0.27, 0.1, -0.05],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px(x), py(y), d.r * rx, d.r * ry, rot * mirror, 0, TAU);
    ctx.fill();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(main);
  ctx.strokeStyle = 'rgba(119,58,35,0.16)';
  ctx.lineWidth = Math.max(1.5, d.r * 0.24);
  ctx.stroke();
  trace(main);
  ctx.strokeStyle = 'rgba(12,4,3,0.66)';
  ctx.lineWidth = Math.max(0.85, d.r * 0.12);
  ctx.stroke();
  for (const branch of branches) {
    trace(branch);
    ctx.strokeStyle = 'rgba(92,46,31,0.13)';
    ctx.lineWidth = Math.max(1.1, d.r * 0.16);
    ctx.stroke();
    trace(branch);
    ctx.strokeStyle = 'rgba(12,4,3,0.55)';
    ctx.lineWidth = Math.max(0.65, d.r * 0.085);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(169,112,73,0.13)';
  ctx.lineWidth = Math.max(0.45, d.r * 0.045);
  ctx.beginPath();
  ctx.moveTo(px(-0.7), py(-0.05));
  ctx.lineTo(px(-0.52), py(0.02));
  ctx.lineTo(px(-0.34), py(-0.02));
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  trace([main[3], main[4], main[5], main[6], main[7]]);
  ctx.strokeStyle = `rgba(255,112,35,${0.13 + pulse * 0.12})`;
  ctx.lineWidth = Math.max(0.6, d.r * 0.055);
  ctx.stroke();
  trace([main[4], main[5], main[6]]);
  ctx.strokeStyle = `rgba(255,202,109,${0.2 + pulse * 0.16})`;
  ctx.lineWidth = Math.max(0.45, d.r * 0.028);
  ctx.stroke();
  trace(branches[1]);
  ctx.strokeStyle = `rgba(255,126,42,${0.09 + pulse * 0.07})`;
  ctx.lineWidth = Math.max(0.5, d.r * 0.04);
  ctx.stroke();

  const ember = 0.18 + pulse * 0.22;
  ctx.fillStyle = `rgba(255,164,72,${ember})`;
  ctx.beginPath();
  ctx.arc(px(-0.07), py(0.1), Math.max(0.4, d.r * 0.035), 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,215,142,${ember * 0.72})`;
  ctx.beginPath();
  ctx.arc(px(0.54), py(-0.04), Math.max(0.35, d.r * 0.022), 0, TAU);
  ctx.fill();

  const rise = (time * 0.32 + phase * 0.13) % 1;
  ctx.fillStyle = `rgba(255,154,63,${(1 - rise) * 0.22})`;
  ctx.beginPath();
  ctx.arc(px(0.18 + Math.sin(time * 0.7 + phase) * 0.035), py(-0.06 - rise * 0.4), Math.max(0.35, d.r * 0.018), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function runeInlay(ctx: CanvasRenderingContext2D, d: Decor, time: number): void {
  const phase = d.x * 0.023 + d.y * 0.017;
  const mirror = Math.sin(phase) < 0 ? -1 : 1;
  const lit = Math.sin(d.x * 0.026 + d.y * 0.021) > -0.65;
  const pulse = 0.5 + Math.sin(time * 1.55 + phase) * 0.17;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate((d.x * 0.007 + d.y * 0.003) * 0.55);
  ctx.scale(1, 0.68);

  ctx.fillStyle = 'rgba(3,3,9,0.28)';
  ctx.beginPath();
  ctx.ellipse(d.r * 0.08, d.r * 0.38, d.r * 0.73, d.r * 0.32, 0, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  for (const [x, y] of [
    [-0.94, 0.03],
    [-0.76, -0.41],
    [-0.31, -0.57],
    [0.23, -0.53],
    [0.72, -0.27],
    [0.91, 0.08],
    [0.68, 0.39],
    [0.18, 0.51],
    [-0.38, 0.46],
    [-0.84, 0.25],
  ] as const) {
    const xPos = x * d.r * mirror;
    if (x === -0.94) ctx.moveTo(xPos, y * d.r);
    else ctx.lineTo(xPos, y * d.r);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(29,23,46,0.5)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(99,83,132,0.18)';
  ctx.lineWidth = Math.max(0.5, d.r * 0.045);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(124,103,164,0.11)';
  ctx.lineWidth = Math.max(0.45, d.r * 0.035);
  ctx.beginPath();
  ctx.moveTo(-d.r * 0.57 * mirror, -d.r * 0.23);
  ctx.lineTo(-d.r * 0.28 * mirror, -d.r * 0.37);
  ctx.lineTo(d.r * 0.22 * mirror, -d.r * 0.34);
  ctx.lineTo(d.r * 0.55 * mirror, -d.r * 0.13);
  ctx.stroke();

  ctx.fillStyle = 'rgba(5,4,12,0.26)';
  ctx.beginPath();
  ctx.ellipse(-d.r * 0.39 * mirror, d.r * 0.17, d.r * 0.22, d.r * 0.1, -0.16 * mirror, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = lit ? 'lighter' : 'source-over';
  ctx.strokeStyle = lit ? `rgba(164,125,235,${0.13 + pulse * 0.1})` : 'rgba(95,82,121,0.16)';
  ctx.lineWidth = Math.max(0.65, d.r * 0.075);
  ctx.beginPath();
  ctx.arc(0, 0, d.r * 0.57, Math.PI * 1.06, Math.PI * 1.91);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, d.r * 0.57, Math.PI * 0.12, Math.PI * 0.76);
  ctx.stroke();

  ctx.strokeStyle = lit ? `rgba(184,147,255,${0.22 + pulse * 0.17})` : 'rgba(108,94,131,0.18)';
  ctx.lineWidth = Math.max(0.6, d.r * 0.06);
  ctx.beginPath();
  ctx.moveTo(-d.r * 0.03 * mirror, -d.r * 0.34);
  ctx.lineTo(d.r * 0.16 * mirror, -d.r * 0.1);
  ctx.lineTo(-d.r * 0.15 * mirror, d.r * 0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -d.r * 0.34);
  ctx.lineTo(-d.r * 0.05 * mirror, d.r * 0.34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-d.r * 0.05 * mirror, d.r * 0.34);
  ctx.lineTo(d.r * 0.25 * mirror, d.r * 0.2);
  ctx.stroke();

  ctx.fillStyle = lit ? `rgba(219,195,255,${0.28 + pulse * 0.2})` : 'rgba(112,99,136,0.18)';
  ctx.beginPath();
  ctx.arc(-d.r * 0.03 * mirror, -d.r * 0.37, Math.max(0.5, d.r * 0.045), 0, TAU);
  ctx.fill();

  if (lit) {
    ctx.fillStyle = `rgba(197,160,255,${0.08 + pulse * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(d.r * 0.02 * mirror, d.r * 0.03, d.r * 0.32, d.r * 0.17, 0, 0, TAU);
    ctx.fill();
  }
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
        else if (d.kind === 2) mushroomDot(ctx, d, time);
        else if (d.kind === 3) leafLitter(ctx, d);
        else fallenTwig(ctx, d);
        break;
      case 'ashenkeep':
        if (d.kind === 0) chip(ctx, d, 'rgba(70,74,96,0.62)');
        else if (d.kind === 1) pebble(ctx, d, 'rgba(60,64,84,0.7)');
        else if (d.kind === 2) puddle(ctx, d, time);
        else if (d.kind === 3) candleStub(ctx, d, time, themeId);
        else mossPatch(ctx, d);
        break;
      case 'emberhold':
        if (d.kind === 0) pebble(ctx, d, 'rgba(66,42,38,0.78)');
        else if (d.kind === 1) chip(ctx, d, 'rgba(78,48,42,0.6)');
        else if (d.kind === 2) heatCrack(ctx, d, time);
        else if (d.kind === 3) emberDot(ctx, d, time);
        else ashMound(ctx, d);
        break;
      case 'nightcity':
        if (d.kind === 0) pebble(ctx, d, 'rgba(60,52,88,0.72)');
        else if (d.kind === 1) chip(ctx, d, 'rgba(74,64,108,0.6)');
        else if (d.kind === 2) runeInlay(ctx, d, time);
        else if (d.kind === 3) candleStub(ctx, d, time, themeId);
        else glassShard(ctx, d);
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
