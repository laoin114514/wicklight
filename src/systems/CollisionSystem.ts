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
  const res = collideWallsAt(x, y, r, walls);
  return { x: res.x, y: res.y };
}

/**
 * `collideWalls` 的带出处版本：除了落点，还告诉你**是哪一堵墙**把它推出来的。
 *
 * 为什么需要"哪一堵"：怪正对着墙面撞上来的时候要靠**这堵墙的两个端点在哪儿**才能决定往哪边绕
 * （见 `EnemySystem` 里的 `nearerEnd`）——只有一个落点是不够的，撞在 1200px 长墙的哪一段，
 * 决定了它该往左绕还是往右绕，而这两条路的长度能差一个数量级。
 *
 * 多堵墙同时压着（凹角）时报**推得最狠**的那一堵：那才是它此刻真正贴着的那一面。
 */
export function collideWallsAt(
  x: number,
  y: number,
  r: number,
  walls: readonly Rect[],
): { x: number; y: number; wall: Rect | null } {
  let px = x;
  let py = y;
  let wall: Rect | null = null;
  let deepest = 0;
  for (const w of walls) {
    if (px + r < w.x || px - r > w.x + w.w || py + r < w.y || py - r > w.y + w.h) continue;
    const res = resolveCircleRect(px, py, r, w);
    const push = Math.hypot(res.x - px, res.y - py);
    if (push > deepest) {
      deepest = push;
      wall = w;
    }
    px = res.x;
    py = res.y;
  }
  return { x: px, y: py, wall };
}

/**
 * 一个半径 `r` 的圆从 (x,y) 走 (dx,dy)——撞上墙就**贴着墙面滑**，返回它落在哪儿。
 *
 * `hit` 为真时 `nx/ny` 是"被墙推开的那一侧"的单位法线。调用方拿它转 90° 就是切向，
 * 也就是"沿着这面墙的两个方向里往哪边滑"。这一路输出不是多余的：撞停的那一帧光看落点
 * 是不知道该往哪儿绕的（见 `EnemySystem.moveWithWalls`）。
 *
 * 这里刻意**只**做几何：位移进去、落点出来，怪自己的速度一个字节都不改。
 * 速度是行为那条线算的（追谁、多快、被旋灯拽着），每帧都要重算一遍；
 * 在几何这一步去改它，"贴着墙滑"就会变成一种黏住不放手的状态。
 */
export interface SlideResult {
  x: number;
  y: number;
  hit: boolean;
  nx: number;
  ny: number;
  /** 把它推出来的那一堵墙（`hit` 为假时是 null）。见 `collideWallsAt`。 */
  wall: Rect | null;
}

export function slideStep(
  x: number,
  y: number,
  r: number,
  dx: number,
  dy: number,
  walls: readonly Rect[],
): SlideResult {
  const wantX = x + dx;
  const wantY = y + dy;
  const res = collideWallsAt(wantX, wantY, r, walls);
  const px = res.x - wantX;
  const py = res.y - wantY;
  const push = Math.hypot(px, py);
  // 推出去的距离是浮点噪声级别（1e-6 以下）就不算撞：贴着墙走的时候每一帧都会擦到，
  // 按"撞了"处理会让怪一路都在往切向掰、连直线都走不直。
  if (push <= 1e-6) return { x: wantX, y: wantY, hit: false, nx: 0, ny: 0, wall: null };
  return { x: res.x, y: res.y, hit: true, nx: px / push, ny: py / push, wall: res.wall };
}

/**
 * 一条射线从 (x,y) 沿**单位**方向 (dx,dy) 打出去，撞上第一堵墙时走了多远（px）。
 * 一路没墙就返回 `maxT`；起点本来就在墙里就是 0。
 *
 * 为什么和 `slideStep` 摆在一起、却不是同一个东西：位移那一段问的是"这个身位能不能推出去"
 * （有体积、会被推开），而"一道光能打多远"没有体积、也不会被推开，它只在墙面上断掉。
 * 两件事共用同一批矩形，但用的是两种几何——所以是两个函数，不是两种"墙"。
 *
 * 这里走的是标准的 slab 判法（把射线分别夹进 x / y 两个区间再取交集），
 * 逐面墙算第一个交点、取最近的那个：墙是**轴对齐矩形**，这条判法没有特例，也不需要宽高比。
 *
 * `t1` 从 `Infinity` 起头、只在最后和 `best` 比一次（`t0 < best`），**不**在循环里把它收窄到 `best`。
 * 那一种写法（`let t1 = best`）读起来像是省了一半比较，其实和 `t0 < best` 完全是一回事、
 * 两条守卫各挡一半——删掉任何一条读数都不变（变异台架实测：两条都杀不掉）。
 * 留一条就够了：进不来墙的射线被 `t0 > t1` 挡掉，"不是最近的那堵"被 `t0 < best` 挡掉，
 * 而 `best` 一开始就是 `maxT`，顺带把"墙在射程之外"和"一路没墙"并进同一条路上。
 */
export function rayWalls(
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxT: number,
  walls: readonly Rect[],
): number {
  let best = maxT;
  for (const w of walls) {
    let t0 = 0;
    let t1 = Infinity;
    if (Math.abs(dx) < 1e-9) {
      if (x < w.x || x > w.x + w.w) continue;
    } else {
      const a = (w.x - x) / dx;
      const b = (w.x + w.w - x) / dx;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (Math.abs(dy) < 1e-9) {
      if (y < w.y || y > w.y + w.h) continue;
    } else {
      const a = (w.y - y) / dy;
      const b = (w.y + w.h - y) / dy;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

/**
 * (x0,y0) 到 (x1,y1) 这条**直线段**中间隔着一堵墙吗——「光只沿看得见的直线走」的最短一句。
 *
 * v88 起燎灯与环形火环走它。这两件的伤害本来就写在"照到"上，而到 v87 为止，它们是全场
 * **唯一**两件还穿墙的东西：子弹进墙判死、光矛停在墙面上（v85）、怪绕着墙走（v84）——
 * 只有玩家自己身上那两圈火，照旧穿过墙面烫到墙背后的怪。
 *
 * 方向那两个参数走的是 `rayWalls` 的第 3 / 4 个位置，但**不是单位向量**：直接给它这条线段的增量、
 * `maxT` 给 1，于是 slab 判法里那个 `t` 就是"沿着这条线段走到哪儿"（0 = 起点、1 = 终点），
 * 结果不必先开方求长度。同一个点上（两个人叠在一起、增量为 0）也不会撞上"除以 0"：
 * `rayWalls` 里那两条 `Math.abs(dx) < 1e-9` 的分支各自只问"起点在不在这一面墙的区间里"，
 * 人不在墙里（`collideWalls` 每帧都看着），于是原样返回 `maxT` = 1，答案是"没被挡住"——
 * 正是该有的那个答案（贴在你身上的那只照旧挨打，`tests/selfwall.test.mjs` 钉着它）。
 */
export function wallBetween(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  walls: readonly Rect[],
): boolean {
  return rayWalls(x0, y0, x1 - x0, y1 - y0, 1, walls) < 1;
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
