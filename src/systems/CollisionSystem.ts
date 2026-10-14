import type { Rect } from './LevelGen';

export function resolveCircleRect(cx: number, cy: number, r: number, rect: Rect): { x: number; y: number } {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r || d2 === 0) {
    // Inside the rect or fully outside
    if (d2 === 0 && cx > rect.x && cx < rect.x + rect.w && cy > rect.y && cy < rect.y + rect.h) {
      const left = cx - rect.x;
      const right = rect.x + rect.w - cx;
      const top = cy - rect.y;
      const bottom = rect.y + rect.h - cy;
      const m = Math.min(left, right, top, bottom);
      if (m === left) return { x: rect.x - r, y: cy };
      if (m === right) return { x: rect.x + rect.w + r, y: cy };
      if (m === top) return { x: cx, y: rect.y - r };
      return { x: cx, y: rect.y + rect.h + r };
    }
    return { x: cx, y: cy };
  }
  const d = Math.sqrt(d2);
  const push = (r - d) / d;
  return { x: cx + dx * push, y: cy + dy * push };
}

export function collideWalls(x: number, y: number, r: number, walls: readonly Rect[]): { x: number; y: number } {
  let px = x;
  let py = y;
  for (const w of walls) {
    if (px + r < w.x || px - r > w.x + w.w || py + r < w.y || py - r > w.y + w.h) continue;
    const res = resolveCircleRect(px, py, r, w);
    px = res.x;
    py = res.y;
  }
  return { x: px, y: py };
}

export function clampToArena(x: number, y: number, r: number, halfW: number, halfH: number): { x: number; y: number } {
  return {
    x: Math.max(-halfW + r, Math.min(halfW - r, x)),
    y: Math.max(-halfH + r, Math.min(halfH - r, y)),
  };
}

export function pointInWalls(x: number, y: number, walls: readonly Rect[], pad = 0): boolean {
  for (const w of walls) {
    if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) return true;
  }
  return false;
}
