import type { Rect } from '../systems/LevelGen';

/**
 * 点光源在屏幕上的可见多边形（v94）。
 *
 * 它只做一件事：给定光源与一组矩形墙，返回一圈按视角排好序的边界点。
 * 光照贴图拿这圈点做 clip，墙背后的暗幕就不会被灯挖开——v88 把"照到才挨打"
 * 接到了伤害上，这一步把同一条规矩接到画面上。
 *
 * 墙是轴对齐矩形，所以可见区域的边界只会在这几处拐弯：视口边界四角、每面墙的四个角。
 * 对每个角向两侧各偏一个极小角度再打一条射线，就能同时拿到"擦着墙角过去"和
 * "撞在墙面上"两条边界；射线取最近命中，按角度排序就是一条星形多边形。
 * 不铺引航网格、也不做逐像素阴影，原因和墙的碰撞一样：这一局里墙只有十几面。
 */

export interface VisibilityPoint {
  x: number;
  y: number;
}

/** 墙角两侧探针的角度偏移（弧度）。1e-4 在 1920px 外只是亚像素，但足够跨过一条边。 */
const CORNER_EPS = 1e-4;
/** 两个相邻点近到这一步就并掉：重合点会让 clip 路径多一段零长度边。 */
const POINT_EPS = 0.01;

/** 射线与轴对齐矩形最近的**正向**交点距离；不相交返回 null。 */
function rayRect(ox: number, oy: number, dx: number, dy: number, rect: Rect): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, rect.x, rect.x + rect.w],
    [oy, dy, rect.y, rect.y + rect.h],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-12) {
      if (origin < lo || origin > hi) return null;
      continue;
    }
    let a = (lo - origin) / dir;
    let b = (hi - origin) / dir;
    if (a > b) {
      const swap = a;
      a = b;
      b = swap;
    }
    if (a > tmin) tmin = a;
    if (b < tmax) tmax = b;
    if (tmin > tmax) return null;
  }
  // 起点在矩形内时 tmin 会停在 0；这时该取的是出口 tmax（屏幕边界就是这样）。
  // 起点在外侧时 tmin 才是入点；两者都不可能为负，因为 slab 已经把背面排除掉了。
  if (tmin > 0) return Number.isFinite(tmin) ? tmin : null;
  return tmax > 0 && Number.isFinite(tmax) ? tmax : null;
}

function insideRect(x: number, y: number, rect: Rect): boolean {
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

/** 墙伸出可见边界时，真正能投进屏幕的只有相交的那一块。 */
function clipRect(rect: Rect, view: Rect): Rect | null {
  const x0 = Math.max(rect.x, view.x);
  const y0 = Math.max(rect.y, view.y);
  const x1 = Math.min(rect.x + rect.w, view.x + view.w);
  const y1 = Math.min(rect.y + rect.h, view.y + view.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 光源在 `width × height` 视口里的可见边界。
 *
 * 光源可以在视口外：只要它的光斑还碰得到屏幕，墙就该继续挡在它前面。
 * 这时四条屏幕角的射线只剩视口张成的那一段，因此排序改成相对"视口中心方向"的偏角，
 * 免得正好在 ±π 接缝上的灯把多边形首尾接错（灯在屏幕正右/正左时最容易撞上）。
 */
export function visibilityPolygon(
  lightX: number,
  lightY: number,
  walls: readonly Rect[],
  width: number,
  height: number,
): VisibilityPoint[] {
  if (!(width > 0) || !(height > 0)) return [];

  // 屏外光源没有"整块屏幕都在它周围"这个前提，直接拿屏幕四角打射线会只落在近边上，
  // 远侧两个角永远走不到，多边形就塌成一条线。把边界扩到刚好包住光源和屏幕，
  // 光源回到多边形内部，标准做法又能成立；多出来的那圈最后交给画布裁掉。
  const outside = lightX < 0 || lightY < 0 || lightX > width || lightY > height;
  const pad = outside ? 1 : 0;
  const left = Math.min(0, lightX) - pad;
  const top = Math.min(0, lightY) - pad;
  const right = Math.max(width, lightX) + pad;
  const bottom = Math.max(height, lightY) + pad;
  const view: Rect = { x: left, y: top, w: right - left, h: bottom - top };
  // 视口中心不一定在光源的右侧/左侧；把方向统一到中心附近再排序，跨 ±π 的候选点
  // 才会按光线实际转动的顺序排成一圈，而不是先负角后正角地折回去。
  const centerAngle = Math.atan2(height / 2 - lightY, width / 2 - lightX);
  const order = (a: number): number => Math.atan2(Math.sin(a - centerAngle), Math.cos(a - centerAngle));
  const angles: number[] = [];
  const pushAngle = (a: number): void => {
    if (Number.isFinite(a)) angles.push(a);
  };

  // 边界四角：没有墙时，这四条射线画出来就是整块可见范围。
  for (const [x, y] of [
    [view.x, view.y],
    [view.x + view.w, view.y],
    [view.x + view.w, view.y + view.h],
    [view.x, view.y + view.h],
  ]) {
    if (Math.hypot(x - lightX, y - lightY) > POINT_EPS) pushAngle(Math.atan2(y - lightY, x - lightX));
  }

  // 只留与这块边界相交的墙；更远的墙既挡不到屏幕，也进不了射线。
  const active: Rect[] = [];
  for (const wall of walls) {
    const clipped = clipRect(wall, view);
    if (!clipped) continue;
    active.push(wall);
    for (const [x, y] of [
      [clipped.x, clipped.y],
      [clipped.x + clipped.w, clipped.y],
      [clipped.x + clipped.w, clipped.y + clipped.h],
      [clipped.x, clipped.y + clipped.h],
    ]) {
      if (Math.hypot(x - lightX, y - lightY) <= POINT_EPS) continue;
      const a = Math.atan2(y - lightY, x - lightX);
      pushAngle(a - CORNER_EPS);
      pushAngle(a);
      pushAngle(a + CORNER_EPS);
    }
  }

  angles.sort((a, b) => order(a) - order(b));
  const points: VisibilityPoint[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let hit = rayRect(lightX, lightY, dx, dy, view);
    if (hit === null) continue;
    for (const wall of active) {
      // 光源和墙重叠是异常状态（生成时不会发生）；这时宁可让光穿过去，也不要把整屏裁没。
      if (insideRect(lightX, lightY, wall)) continue;
      const t = rayRect(lightX, lightY, dx, dy, wall);
      if (t !== null && t < hit) hit = t;
    }
    const p = { x: lightX + dx * hit, y: lightY + dy * hit };
    const last = points[points.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) <= POINT_EPS) continue;
    points.push(p);
  }

  return points.length >= 3 ? points : [];
}

/** 点到矩形的最近距离；光源周围是否需要做遮挡的先筛。 */
export function distanceToRect(x: number, y: number, rect: Rect): number {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return Math.hypot(x - nx, y - ny);
}

