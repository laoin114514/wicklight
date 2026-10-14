import { Random } from '../core/Random';
import type { StageDef } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Decor {
  x: number;
  y: number;
  r: number;
  kind: number;
}

export interface Shrine {
  x: number;
  y: number;
  /** 已经献祭过 */
  used: boolean;
  /** 已经询问过（离开后不再打扰） */
  prompted: boolean;
}

export interface Level {
  halfW: number;
  halfH: number;
  walls: Rect[];
  decor: Decor[];
  /** 细碎地面装饰（石子、草丛、裂纹……），用来填充光照范围内的地面细节。 */
  details: Decor[];
  shrines: Shrine[];
  theme: StageDef['theme'];
}

export function generateLevel(stage: StageDef, seed: number): Level {
  const rng = new Random(seed);
  const halfW = 1500;
  const halfH = 1100;
  const walls: Rect[] = [];
  const count = 10 + Math.floor(rng.next() * 6);
  let guard = 0;
  while (walls.length < count && guard < 400) {
    guard += 1;
    const w = 90 + rng.next() * 260;
    const h = 90 + rng.next() * 260;
    const x = rng.range(-halfW + 220, halfW - 220 - w);
    const y = rng.range(-halfH + 220, halfH - 220 - h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (Math.hypot(cx, cy) < 260) continue;
    let overlaps = false;
    for (const o of walls) {
      if (x < o.x + o.w + 120 && x + w + 120 > o.x && y < o.y + o.h + 120 && y + h + 120 > o.y) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) walls.push({ x, y, w, h });
  }
  const decor: Decor[] = [];
  for (let i = 0; i < 96; i += 1) {
    const d: Decor = {
      x: rng.range(-halfW, halfW),
      y: rng.range(-halfH, halfH),
      r: 20 + rng.next() * 90,
      kind: Math.floor(rng.next() * 3),
    };
    // 别挡住出生点
    if (Math.hypot(d.x, d.y) < 150) continue;
    decor.push(d);
  }
  const details: Decor[] = [];
  for (let i = 0; i < 420; i += 1) {
    details.push({
      x: rng.range(-halfW + 40, halfW - 40),
      y: rng.range(-halfH + 40, halfH - 40),
      r: 4 + rng.next() * 12,
      kind: Math.floor(rng.next() * 4),
    });
  }
  const shrines: Shrine[] = [];
  for (let i = 0; i < 2; i += 1) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const x = rng.range(-halfW + 260, halfW - 260);
      const y = rng.range(-halfH + 260, halfH - 260);
      if (Math.hypot(x, y) < 420) continue;
      if (walls.some((w) => x > w.x - 90 && x < w.x + w.w + 90 && y > w.y - 90 && y < w.y + w.h + 90)) continue;
      if (shrines.some((s) => Math.hypot(s.x - x, s.y - y) < 700)) continue;
      shrines.push({ x, y, used: false, prompted: false });
      break;
    }
  }
  return { halfW, halfH, walls, decor, details, shrines, theme: stage.theme };
}
