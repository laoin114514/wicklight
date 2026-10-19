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

export interface Pyre {
  x: number;
  y: number;
  /** 已经点燃（本关内一直亮着） */
  lit: boolean;
  /** 点燃进度 0~1：站在旁边慢慢涨，走开会回落 */
  progress: number;
  /** 灯焰剩余 0~1：点亮后是满的，被「吹灯客」抽干就重新熄灭 */
  flame: number;
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
  /** 熄灭的灯台：散落在远处的探索目标，点亮后既换增益也照亮一片地方。 */
  pyres: Pyre[];
  theme: StageDef['theme'];
}

/**
 * 布景与细节的散布：单独一颗随机源，和墙 / 神龛 / 灯台那串随机数分开。
 * 这样"同一种子在手机与桌面上是同一张地图"——只有陈设的疏密不同。
 */
export function scatterDecor(
  halfW: number,
  halfH: number,
  seed: number,
  detailScale = 1,
): { decor: Decor[]; details: Decor[] } {
  const rng = new Random(((seed ^ 0x9e3779b9) >>> 0) || 1);
  const decor: Decor[] = [];
  const decorCount = Math.round(96 * detailScale);
  for (let i = 0; i < decorCount; i += 1) {
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
  const detailCount = Math.round(420 * detailScale);
  for (let i = 0; i < detailCount; i += 1) {
    details.push({
      x: rng.range(-halfW + 40, halfW - 40),
      y: rng.range(-halfH + 40, halfH - 40),
      r: 4 + rng.next() * 12,
      kind: Math.floor(rng.next() * 5),
    });
  }
  return { decor, details };
}

/** 画质档位变了：重铺陈设，但地图本身（墙 / 神龛 / 灯台）原样不动。 */
export function refinishLevel(level: Level, seed: number, detailScale: number): void {
  const s = scatterDecor(level.halfW, level.halfH, seed, detailScale);
  level.decor = s.decor;
  level.details = s.details;
}

export function generateLevel(stage: StageDef, seed: number, detailScale = 1): Level {
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
  const { decor, details } = scatterDecor(halfW, halfH, seed, detailScale);
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
  const pyres: Pyre[] = [];
  const pyreCount = stage.pyres ?? 3;
  for (let i = 0; i < pyreCount; i += 1) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = rng.range(-halfW + 200, halfW - 200);
      const y = rng.range(-halfH + 200, halfH - 200);
      // 灯台是"要跑过去"的目标：别贴着脸生，也别挤在一起
      if (Math.hypot(x, y) < 620) continue;
      if (walls.some((w) => x > w.x - 70 && x < w.x + w.w + 70 && y > w.y - 70 && y < w.y + w.h + 70)) continue;
      if (shrines.some((s) => Math.hypot(s.x - x, s.y - y) < 320)) continue;
      if (pyres.some((p) => Math.hypot(p.x - x, p.y - y) < 760)) continue;
      pyres.push({ x, y, lit: false, progress: 0, flame: 0 });
      break;
    }
  }
  return { halfW, halfH, walls, decor, details, shrines, pyres, theme: stage.theme };
}
