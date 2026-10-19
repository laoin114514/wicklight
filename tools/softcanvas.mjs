/**
 * 极简软件 Canvas2D 光栅器。
 *
 * 沙箱里没有浏览器也没有网络。为了能真正“看一眼”游戏画面，这里实现了一个覆盖
 * 本项目所用绘图子集的软件 Canvas2D，并把结果编码为 PNG。仅用于离线调试，
 * 不参与游戏运行时。
 */
import zlib from 'node:zlib';

const NAMED = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  lime: [0, 255, 0, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
  cyan: [0, 255, 255, 1],
  aqua: [0, 255, 255, 1],
  magenta: [255, 0, 255, 1],
  fuchsia: [255, 0, 255, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  silver: [192, 192, 192, 1],
  orange: [255, 165, 0, 1],
  purple: [128, 0, 128, 1],
  pink: [255, 192, 203, 1],
  brown: [165, 42, 42, 1],
  gold: [255, 215, 0, 1],
  navy: [0, 0, 128, 1],
  teal: [0, 128, 128, 1],
  olive: [128, 128, 0, 1],
  maroon: [128, 0, 0, 1],
  violet: [238, 130, 238, 1],
  indigo: [75, 0, 130, 1],
  crimson: [220, 20, 60, 1],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function parseColor(input) {
  if (input && typeof input === 'object' && input.__paint) return input;
  if (input == null) return { r: 0, g: 0, b: 0, a: 1, __paint: 'color' };
  const s = String(input).trim().toLowerCase();
  if (s.charCodeAt(0) === 35) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a, __paint: 'color' };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    const num = (v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const a = parts.length > 3 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    return { r: num(parts[0]) | 0, g: num(parts[1]) | 0, b: num(parts[2]) | 0, a: clamp01(a), __paint: 'color' };
  }
  const named = NAMED[s];
  if (named) return { r: named[0], g: named[1], b: named[2], a: named[3], __paint: 'color' };
  return { r: 255, g: 0, b: 255, a: 1, __paint: 'color' };
}

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const pt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  const id = 1 / det;
  return [m[3] * id, -m[1] * id, -m[2] * id, m[0] * id, (m[2] * m[5] - m[3] * m[4]) * id, (m[1] * m[4] - m[0] * m[5]) * id];
}
const IDENT = [1, 0, 0, 1, 0, 0];

class Gradient {
  constructor(type, coords, ctm) {
    this.__paint = 'gradient';
    this.type = type;
    this.coords = coords;
    this.inv = invert(ctm);
    this.stops = [];
    this.lut = null;
  }

  addColorStop(offset, color) {
    this.stops.push([clamp01(offset), parseColor(color)]);
    this.stops.sort((a, b) => a[0] - b[0]);
    this.lut = null;
  }

  bake() {
    const stops = this.stops;
    const lut = new Uint8ClampedArray(256 * 4);
    if (!stops.length) return lut;
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let k = 0; k < stops.length - 1; k += 1) {
        if (t >= stops[k][0] && t <= stops[k + 1][0]) {
          a = stops[k];
          b = stops[k + 1];
          break;
        }
      }
      const span = b[0] - a[0];
      const u = span > 1e-6 ? (t - a[0]) / span : 0;
      lut[i * 4] = a[1].r + (b[1].r - a[1].r) * u;
      lut[i * 4 + 1] = a[1].g + (b[1].g - a[1].g) * u;
      lut[i * 4 + 2] = a[1].b + (b[1].b - a[1].b) * u;
      lut[i * 4 + 3] = (a[1].a + (b[1].a - a[1].a) * u) * 255;
    }
    this.lut = lut;
  }

  t(px, py) {
    const [x, y] = pt(this.inv, px, py);
    if (this.type === 0) {
      const [x0, y0, x1, y1] = this.coords;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      return len2 === 0 ? 0 : clamp01(((x - x0) * dx + (y - y0) * dy) / len2);
    }
    const [x0, y0, r0, x1, y1, r1] = this.coords;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dr = r1 - r0;
    const fx = x - x0;
    const fy = y - y0;
    const a = dx * dx + dy * dy - dr * dr;
    const b = -2 * (fx * dx + fy * dy + r0 * dr);
    const c = fx * fx + fy * fy - r0 * r0;
    if (Math.abs(a) < 1e-9) {
      if (Math.abs(b) < 1e-9) return 0;
      return clamp01(-c / b);
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return 0;
    const sq = Math.sqrt(disc);
    return clamp01(Math.max((-b + sq) / (2 * a), (-b - sq) / (2 * a)));
  }

  colorAt(px, py) {
    if (!this.lut) this.bake();
    const idx = (this.t(px, py) * 255) | 0;
    const o = idx * 4;
    return [this.lut[o], this.lut[o + 1], this.lut[o + 2], this.lut[o + 3] / 255];
  }
}

class Pattern {
  constructor(img, ctm) {
    this.__paint = 'pattern';
    this.img = img;
    this.inv = invert(ctm);
  }

  colorAt(px, py) {
    const img = this.img;
    if (!img || !img.__soft) return [0, 0, 0, 0];
    const [x, y] = pt(this.inv, px, py);
    const w = img.width;
    const h = img.height;
    if (w <= 0 || h <= 0) return [0, 0, 0, 0];
    let tx = Math.floor(x) % w;
    let ty = Math.floor(y) % h;
    if (tx < 0) tx += w;
    if (ty < 0) ty += h;
    const o = ((ty * img.__ss) * img.__bw + tx * img.__ss) * 4;
    const d = img.__data;
    return [d[o], d[o + 1], d[o + 2], d[o + 3] / 255];
  }
}

// 5x7 点阵字模（覆盖伤害数字与常见标签所需的字符，中文以方块占位）。
const FONT = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '%': [17, 2, 4, 4, 8, 17, 0],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '*': [0, 10, 4, 31, 4, 10, 0],
  x: [0, 17, 10, 4, 10, 17, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
};

class SoftCanvas {
  constructor(width = 300, height = 150, ss = 2) {
    this.__soft = true;
    this.__ss = Math.max(1, ss | 0);
    this._w = Math.max(1, width | 0);
    this._h = Math.max(1, height | 0);
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.dataset = {};
    this._listeners = new Map();
    this._alloc();
    this._ctx = null;
  }

  get width() {
    return this._w;
  }

  set width(v) {
    this._w = Math.max(1, v | 0);
    this._alloc();
  }

  get height() {
    return this._h;
  }

  set height(v) {
    this._h = Math.max(1, v | 0);
    this._alloc();
  }

  _alloc() {
    const s = this.__ss;
    this.__bw = Math.max(1, Math.floor(this.width * s));
    this.__bh = Math.max(1, Math.floor(this.height * s));
    this.__data = new Uint8ClampedArray(this.__bw * this.__bh * 4);
  }

  getContext(kind) {
    if (kind !== '2d') return null;
    if (!this._ctx) this._ctx = new Ctx2D(this);
    return this._ctx;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener() {}
  setPointerCapture() {}
  releasePointerCapture() {}

  getBoundingClientRect() {
    return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height, x: 0, y: 0 };
  }

  appendChild() {}
  remove() {}

  toDataURL() {
    return 'data:,';
  }
}

class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.__ss = canvas.__ss;
    this.m = IDENT.slice();
    this.stack = [];
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineDash = [];
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.path = [];
    this.cur = null;
    /** `clip()` 之后的设备像素多边形；空数组 = 不裁。多个 clip 取交集。 */
    this.clipPolys = [];
  }

  get __data() {
    return this.canvas.__data;
  }

  get __bw() {
    return this.canvas.__bw;
  }

  get __bh() {
    return this.canvas.__bh;
  }

  // ── 变换 ──
  setTransform(a, b, c, d, e, f) {
    this.m = [a, b, c, d, e, f];
  }

  resetTransform() {
    this.m = IDENT.slice();
  }

  getTransform() {
    const m = this.m;
    return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
  }

  transform(a, b, c, d, e, f) {
    this.m = mul(this.m, [a, b, c, d, e, f]);
  }

  translate(x, y) {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }

  scale(x, y) {
    this.m = mul(this.m, [x, 0, 0, y, 0, 0]);
  }

  rotate(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.m = mul(this.m, [c, s, -s, c, 0, 0]);
  }

  save() {
    this.stack.push({
      m: this.m.slice(),
      globalAlpha: this.globalAlpha,
      gco: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineDash: this.lineDash.slice(),
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      clipPolys: this.clipPolys.slice(),
    });
  }

  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.m = s.m;
    this.globalAlpha = s.globalAlpha;
    this.globalCompositeOperation = s.gco;
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    this.lineDash = s.lineDash;
    this.font = s.font;
    this.textAlign = s.textAlign;
    this.textBaseline = s.textBaseline;
    this.clipPolys = s.clipPolys;
  }

  /** CSS 坐标 → 设备像素（含超采样倍率）。 */
  __dev() {
    const s = this.__ss;
    const m = this.m;
    return [m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s];
  }

  __scale() {
    const m = this.__dev();
    return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  }

  // ── 画笔 ──
  createLinearGradient(x0, y0, x1, y1) {
    return new Gradient(0, [x0, y0, x1, y1], this.__dev());
  }

  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return new Gradient(1, [x0, y0, r0, x1, y1, r1], this.__dev());
  }

  createPattern(img) {
    return new Pattern(img, this.__dev());
  }

  // ── 路径 ──
  beginPath() {
    this.path = [];
    this.cur = null;
  }

  closePath() {
    if (this.cur) this.cur.closed = true;
  }

  moveTo(x, y) {
    const d = this.__dev();
    this.cur = { pts: [pt(d, x, y)], closed: false };
    this.path.push(this.cur);
  }

  lineTo(x, y) {
    const d = this.__dev();
    if (!this.cur) {
      this.cur = { pts: [pt(d, x, y)], closed: false };
      this.path.push(this.cur);
      return;
    }
    this.cur.pts.push(pt(d, x, y));
  }

  rect(x, y, w, h) {
    const d = this.__dev();
    this.cur = { pts: [pt(d, x, y), pt(d, x + w, y), pt(d, x + w, y + h), pt(d, x, y + h)], closed: true };
    this.path.push(this.cur);
  }

  arc(x, y, r, sa = 0, ea = Math.PI * 2, ccw = false) {
    this.ellipse(x, y, r, r, 0, sa, ea, ccw);
  }

  ellipse(x, y, rx, ry, rot = 0, sa = 0, ea = Math.PI * 2, ccw = false) {
    const d = this.__dev();
    let start = sa;
    let end = ea;
    if (ccw) {
      if (end > start) end -= Math.PI * 2;
    } else if (end < start) {
      end += Math.PI * 2;
    }
    const span = end - start;
    if (Math.abs(span) < 1e-6) return;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const px = (a) => x + Math.cos(a) * rx * cosR - Math.sin(a) * ry * sinR;
    const py = (a) => y + Math.cos(a) * rx * sinR + Math.sin(a) * ry * cosR;
    const steps = Math.max(3, Math.ceil(Math.abs(span) / (Math.PI / 28)));
    const sx = px(start);
    const sy = py(start);
    if (this.cur && this.cur.pts.length) {
      this.lineTo(sx, sy);
    } else {
      this.cur = { pts: [pt(d, sx, sy)], closed: false };
      this.path.push(this.cur);
    }
    for (let i = 1; i <= steps; i += 1) {
      const a = start + (span * i) / steps;
      this.cur.pts.push(pt(d, px(a), py(a)));
    }
  }

  quadraticCurveTo(cx, cy, x, y) {
    const d = this.__dev();
    const last = this.cur && this.cur.pts.length ? this.cur.pts[this.cur.pts.length - 1] : null;
    const a = last ? pt(invert(d), last[0], last[1]) : [x, y];
    const steps = 14;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      this.lineTo(u * u * a[0] + 2 * u * t * cx + t * t * x, u * u * a[1] + 2 * u * t * cy + t * t * y);
    }
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    const d = this.__dev();
    const last = this.cur && this.cur.pts.length ? this.cur.pts[this.cur.pts.length - 1] : null;
    const a = last ? pt(invert(d), last[0], last[1]) : [x, y];
    const steps = 18;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      const bx = u * u * u * a[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x;
      const by = u * u * u * a[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y;
      this.lineTo(bx, by);
    }
  }

  setLineDash(dash) {
    this.lineDash = Array.isArray(dash) ? dash.slice() : [];
  }

  getLineDash() {
    return this.lineDash.slice();
  }

  // ── 光栅化 ──
  __blend(i, r, g, b, a) {
    if (a <= 0) return;
    const data = this.__data;
    const gco = this.globalCompositeOperation;
    if (gco === 'destination-out') {
      data[i + 3] = data[i + 3] * (1 - a);
      return;
    }
    if (gco === 'multiply') {
      const da = data[i + 3] / 255;
      const oa = a + da * (1 - a) || 1;
      const mix = (sn, dn) => ((sn * dn * a + dn * da * (1 - a)) / oa) * 255;
      data[i] = mix(r / 255, data[i] / 255);
      data[i + 1] = mix(g / 255, data[i + 1] / 255);
      data[i + 2] = mix(b / 255, data[i + 2] / 255);
      data[i + 3] = oa * 255;
      return;
    }
    if (gco === 'lighter') {
      data[i] = data[i] + r * a;
      data[i + 1] = data[i + 1] + g * a;
      data[i + 2] = data[i + 2] + b * a;
      const na = data[i + 3] / 255 + a;
      data[i + 3] = (na > 1 ? 1 : na) * 255;
      return;
    }
    const da = data[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      return;
    }
    data[i] = (r * a + data[i] * da * (1 - a)) / oa;
    data[i + 1] = (g * a + data[i + 1] * da * (1 - a)) / oa;
    data[i + 2] = (b * a + data[i + 2] * da * (1 - a)) / oa;
    data[i + 3] = oa * 255;
  }

  /** 像素中心是否在每一层 clip 多边形里（裁剪路径按并集填充，多次 clip 取交集）。 */
  __inClip(x, y) {
    if (!this.clipPolys.length) return true;
    for (const poly of this.clipPolys) {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const xi = poly[i][0];
        const yi = poly[i][1];
        const xj = poly[j][0];
        const yj = poly[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      if (!hit) return false;
    }
    return true;
  }

  /** 对若干多边形做非零环绕扫描线填充。 */
  __fillPolys(polys, paint) {
    const alpha = this.globalAlpha;
    if (alpha <= 0) return;
    const p = parseColor(paint);
    const solid = p.__paint === 'color';
    if (solid && p.a <= 0) return;
    let minY = Infinity;
    let maxY = -Infinity;
    const edges = [];
    for (const poly of polys) {
      const n = poly.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        if (a[1] === b[1]) continue;
        edges.push(a[0], a[1], b[0], b[1], b[1] > a[1] ? 1 : -1);
        if (a[1] < minY) minY = a[1];
        if (b[1] < minY) minY = b[1];
        if (a[1] > maxY) maxY = a[1];
        if (b[1] > maxY) maxY = b[1];
      }
    }
    if (!edges.length) return;
    const y0 = Math.max(0, Math.ceil(minY - 0.5));
    const y1 = Math.min(this.__bh - 1, Math.floor(maxY - 0.5));
    const cross = [];
    const order = [];
    for (let y = y0; y <= y1; y += 1) {
      const yc = y + 0.5;
      cross.length = 0;
      order.length = 0;
      for (let e = 0; e < edges.length; e += 5) {
        const ay = edges[e + 1];
        const by = edges[e + 3];
        if ((yc >= ay && yc < by) || (yc >= by && yc < ay)) {
          const ax = edges[e];
          const bx = edges[e + 2];
          const t = (yc - ay) / (by - ay);
          order.push(cross.length >> 1);
          cross.push(ax + t * (bx - ax), edges[e + 4]);
        }
      }
      if (cross.length < 4) continue;
      order.sort((ia, ib) => cross[ia * 2] - cross[ib * 2]);
      const rowBase = y * this.__bw;
      let wind = 0;
      for (let k = 0; k < order.length - 1; k += 1) {
        wind += cross[order[k] * 2 + 1];
        if (wind === 0) continue;
        const xs = cross[order[k] * 2];
        const xe = cross[order[k + 1] * 2];
        let px0 = Math.ceil(xs - 0.5);
        let px1 = Math.floor(xe - 0.5);
        if (px0 < 0) px0 = 0;
        if (px1 > this.__bw - 1) px1 = this.__bw - 1;
        if (solid) {
          const a = p.a * alpha;
          for (let x = px0; x <= px1; x += 1) {
            if (this.__inClip(x + 0.5, y + 0.5)) this.__blend((rowBase + x) * 4, p.r, p.g, p.b, a);
          }
        } else {
          for (let x = px0; x <= px1; x += 1) {
            if (!this.__inClip(x + 0.5, y + 0.5)) continue;
            const i = (rowBase + x) * 4;
            const c = p.colorAt(x, y);
            if (c[3] > 0) this.__blend(i, c[0], c[1], c[2], c[3] * alpha);
          }
        }
      }
    }
  }

  fill() {
    this.__fillPolys(this.path.map((s) => s.pts), this.fillStyle);
  }

  stroke() {
    const hw = (this.lineWidth * this.__scale()) / 2;
    if (hw <= 0) return;
    const polys = [];
    for (const sp of this.path) {
      let pts = sp.pts;
      if (pts.length === 1) {
        polys.push(circlePoly(pts[0], hw));
        continue;
      }
      if (pts.length < 2) continue;
      if (sp.closed) pts = pts.concat([pts[0]]);
      for (const run of dashSplit(pts, this.lineDash, this.__scale())) {
        if (run.length < 2) continue;
        for (let i = 0; i < run.length - 1; i += 1) polys.push(quadPoly(run[i], run[i + 1], hw));
        for (const pt0 of run) polys.push(circlePoly(pt0, hw));
      }
    }
    this.__fillPolys(polys, this.strokeStyle);
  }

  fillRect(x, y, w, h) {
    const d = this.__dev();
    this.__fillPolys([[pt(d, x, y), pt(d, x + w, y), pt(d, x + w, y + h), pt(d, x, y + h)]], this.fillStyle);
  }

  strokeRect(x, y, w, h) {
    const saved = this.path;
    const savedCur = this.cur;
    this.path = [];
    this.cur = null;
    this.rect(x, y, w, h);
    this.stroke();
    this.path = saved;
    this.cur = savedCur;
  }

  clearRect(x, y, w, h) {
    const d = this.__dev();
    const c = [pt(d, x, y), pt(d, x + w, y), pt(d, x + w, y + h), pt(d, x, y + h)];
    const x0 = Math.max(0, Math.floor(Math.min(c[0][0], c[1][0], c[2][0], c[3][0])));
    const x1 = Math.min(this.__bw - 1, Math.ceil(Math.max(c[0][0], c[1][0], c[2][0], c[3][0])));
    const y0 = Math.max(0, Math.floor(Math.min(c[0][1], c[1][1], c[2][1], c[3][1])));
    const y1 = Math.min(this.__bh - 1, Math.ceil(Math.max(c[0][1], c[1][1], c[2][1], c[3][1])));
    for (let yy = y0; yy <= y1; yy += 1) {
      const base = yy * this.__bw;
      for (let xx = x0; xx <= x1; xx += 1) {
        const i = (base + xx) * 4;
        this.__data[i] = 0;
        this.__data[i + 1] = 0;
        this.__data[i + 2] = 0;
        this.__data[i + 3] = 0;
      }
    }
  }

  drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
    if (!img || !img.__soft) return;
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    let dx = 0;
    let dy = 0;
    let dw = img.width;
    let dh = img.height;
    if (a8 !== undefined) {
      sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8;
    } else if (a4 !== undefined) {
      dx = a1; dy = a2; dw = a3; dh = a4;
    } else {
      dx = a1; dy = a2;
    }
    const d = this.__dev();
    const corners = [pt(d, dx, dy), pt(d, dx + dw, dy), pt(d, dx + dw, dy + dh), pt(d, dx, dy + dh)];
    const x0 = Math.max(0, Math.floor(Math.min(corners[0][0], corners[1][0], corners[2][0], corners[3][0])));
    const x1 = Math.min(this.__bw - 1, Math.ceil(Math.max(corners[0][0], corners[1][0], corners[2][0], corners[3][0])));
    const y0 = Math.max(0, Math.floor(Math.min(corners[0][1], corners[1][1], corners[2][1], corners[3][1])));
    const y1 = Math.min(this.__bh - 1, Math.ceil(Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1])));
    const inv = invert(d);
    const alpha = this.globalAlpha;
    const srcSS = img.__ss;
    const sd = img.__data;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!this.__inClip(x + 0.5, y + 0.5)) continue;
        const q = pt(inv, x + 0.5, y + 0.5);
        const u = (q[0] - dx) / dw;
        const v = (q[1] - dy) / dh;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        let tx = Math.floor((sx + u * sw) * srcSS);
        let ty = Math.floor((sy + v * sh) * srcSS);
        if (tx < 0) tx = 0;
        if (ty < 0) ty = 0;
        if (tx > img.__bw - 1) tx = img.__bw - 1;
        if (ty > img.__bh - 1) ty = img.__bh - 1;
        const o = (ty * img.__bw + tx) * 4;
        const a = (sd[o + 3] / 255) * alpha;
        if (a <= 0) continue;
        this.__blend((y * this.__bw + x) * 4, sd[o], sd[o + 1], sd[o + 2], a);
      }
    }
  }

  __fontSize() {
    const m = String(this.font).match(/(\d+(?:\.\d+)?)px/);
    return m ? parseFloat(m[1]) : 10;
  }

  __glyph(ch, x, y, size, paint, dilate) {
    const rows = FONT[ch] ?? FONT[ch.toUpperCase()] ?? null;
    const cell = size / 8;
    const w = cell * 6;
    const h = cell * 8;
    let ox = x;
    if (this.textAlign === 'center') ox = x;
    else if (this.textAlign === 'right' || this.textAlign === 'end') ox = x - w;
    let oy = y;
    if (this.textBaseline === 'middle') oy = y - h / 2;
    else if (this.textBaseline === 'top') oy = y;
    else oy = y - h;
    const d = this.__dev();
    const polys = [];
    const pad = dilate ? Math.max(0.6, cell * 0.4) : 0;
    if (!rows) {
      polys.push([
        pt(d, ox - pad, oy - pad),
        pt(d, ox + w + pad, oy - pad),
        pt(d, ox + w + pad, oy + h + pad),
        pt(d, ox - pad, oy + h + pad),
      ]);
    } else {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 5; c += 1) {
          if (!((rows[r] >> (4 - c)) & 1)) continue;
          const px = ox + c * cell - pad;
          const py = oy + r * cell - pad;
          const s = cell + pad * 2;
          polys.push([pt(d, px, py), pt(d, px + s, py), pt(d, px + s, py + s), pt(d, px, py + s)]);
        }
      }
    }
    this.__fillPolys(polys, paint);
    return w + cell;
  }

  fillText(text, x, y) {
    const str = String(text);
    const size = this.__fontSize() * this.__scale();
    const cell = size / 8;
    let ox = x;
    if (this.textAlign === 'center') ox = x - (str.length * cell * 7) / 2;
    const paint = this.fillStyle;
    for (const ch of str) ox += this.__glyph(ch, ox, y, size * 0.95, paint, false);
  }

  strokeText(text, x, y) {
    const str = String(text);
    const size = this.__fontSize() * this.__scale();
    const cell = size / 8;
    let ox = x;
    if (this.textAlign === 'center') ox = x - (str.length * cell * 7) / 2;
    const paint = this.strokeStyle;
    for (const ch of str) ox += this.__glyph(ch, ox, y, size * 0.95, paint, true);
  }

  measureText(text) {
    return { width: String(text ?? '').length * this.__fontSize() * 0.6 };
  }

  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) };
  }

  getImageData(x, y, w, h) {
    const iw = Math.max(0, w | 0);
    const ih = Math.max(0, h | 0);
    const data = new Uint8ClampedArray(Math.max(1, iw * ih * 4));
    const ss = this.__ss;
    const src = this.__data;
    // 坐标跟绘制 API 一样按逻辑像素算；超采样画布上取每个逻辑像素中心那一颗。
    for (let py = 0; py < ih; py += 1) {
      const sy = Math.floor((y + py + 0.5) * ss);
      if (sy < 0 || sy >= this.__bh) continue;
      for (let px = 0; px < iw; px += 1) {
        const sx = Math.floor((x + px + 0.5) * ss);
        if (sx < 0 || sx >= this.__bw) continue;
        const si = (sy * this.__bw + sx) * 4;
        const di = (py * iw + px) * 4;
        data[di] = src[si];
        data[di + 1] = src[si + 1];
        data[di + 2] = src[si + 2];
        data[di + 3] = src[si + 3];
      }
    }
    return { width: iw, height: ih, data };
  }

  putImageData() {}
  clip() {
    const polys = this.path.filter((s) => s.pts.length >= 3).map((s) => s.pts.map((p) => [p[0], p[1]]));
    // 空路径在 Canvas 里会把后续绘制全裁掉；用一条退化的多边形表示"什么都不剩"。
    this.clipPolys = polys.length ? this.clipPolys.concat(polys) : [[]];
  }
}

function circlePoly(c, r) {
  const pts = [];
  const n = Math.max(8, Math.min(26, Math.ceil(r)));
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  if (signedArea(pts) < 0) pts.reverse();
  return pts;
}

function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** 线段加粗为四边形，并统一绕向，以便非零填充求并集。 */
function quadPoly(p0, p1, hw) {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * hw;
  const ny = (dx / len) * hw;
  const pts = [
    [p0[0] + nx, p0[1] + ny],
    [p1[0] + nx, p1[1] + ny],
    [p1[0] - nx, p1[1] - ny],
    [p0[0] - nx, p0[1] - ny],
  ];
  if (signedArea(pts) < 0) pts.reverse();
  return pts;
}

/** 按虚线样式切分折线，返回可见段落。 */
function dashSplit(pts, dash, scale) {
  if (!dash.length || dash.some((v) => v <= 0)) return [pts];
  const pattern = dash.map((v) => v * scale);
  const total = pattern.reduce((a, b) => a + b, 0);
  if (total <= 0) return [pts];
  const runs = [];
  let run = [pts[0]];
  let pi = 0;
  let remain = pattern[0];
  let on = true;
  for (let i = 0; i < pts.length - 1; i += 1) {
    let a = pts[i];
    const b = pts[i + 1];
    let segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (segLen > remain) {
      const t = remain / segLen;
      const mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      run.push(mid);
      if (on) runs.push(run);
      else if (run.length > 1) runs.push(run);
      a = mid;
      segLen -= remain;
      run = [mid];
      pi = (pi + 1) % pattern.length;
      remain = pattern[pi];
      on = !on;
    }
    remain -= segLen;
    run.push(b);
  }
  if (run.length > 1) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

// ── PNG 编码 ──
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/** 降采样超采样缓冲区并编码为 PNG。 */
export function canvasToPNG(canvas) {
  const ss = canvas.__ss;
  const w = canvas.width;
  const h = canvas.height;
  const bw = canvas.__bw;
  const src = canvas.__data;
  const out = Buffer.alloc(w * h * 4);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        const row = (y * ss + sy) * bw;
        for (let sx = 0; sx < ss; sx += 1) {
          const o = (row + x * ss + sx) * 4;
          const sa = src[o + 3] / 255;
          r += src[o] * sa;
          g += src[o + 1] * sa;
          b += src[o + 2] * sa;
          a += sa;
        }
      }
      const o = (y * w + x) * 4;
      const aa = a * inv;
      if (aa > 0) {
        out[o] = r * inv / aa;
        out[o + 1] = g * inv / aa;
        out[o + 2] = b * inv / aa;
      }
      out[o + 3] = Math.round(aa * 255);
    }
  }
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * stride] = 0;
    out.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export { SoftCanvas };

/** 从软件画布裁剪一块区域（CSS 像素坐标）并可放大，便于细看画面。 */
export function cropToPNG(canvas, cx, cy, cw, ch, zoom = 1) {
  const ss = canvas.__ss;
  const bw = canvas.__bw;
  const src = canvas.__data;
  const w = Math.round(cw * zoom);
  const h = Math.round(ch * zoom);
  const out = Buffer.alloc(w * h * 4);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ux = cx + x / zoom;
      const uy = cy + y / zoom;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        const py = Math.min(canvas.height * ss - 1, Math.max(0, Math.floor(uy * ss + sy)));
        const row = py * bw;
        for (let sx = 0; sx < ss; sx += 1) {
          const px = Math.min(bw - 1, Math.max(0, Math.floor(ux * ss + sx)));
          const o = (row + px) * 4;
          const sa = src[o + 3] / 255;
          r += src[o] * sa;
          g += src[o + 1] * sa;
          b += src[o + 2] * sa;
          a += sa;
        }
      }
      const o = (y * w + x) * 4;
      const aa = a * inv;
      if (aa > 0) {
        out[o] = r * inv / aa;
        out[o + 1] = g * inv / aa;
        out[o + 2] = b * inv / aa;
      }
      out[o + 3] = Math.round(aa * 255);
    }
  }
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * stride] = 0;
    out.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
