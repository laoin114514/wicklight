import { clamp, lerp } from './MathUtils';

export class Camera {
  x = 0;
  y = 0;
  shakeX = 0;
  shakeY = 0;
  private shakeTime = 0;
  private trauma = 0;
  zoom = 1;
  targetZoom = 1;
  private baseZoom = 1;
  private vw = 1280;
  private vh = 720;

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
  }

  setBaseZoom(z: number): void {
    this.baseZoom = z;
    this.targetZoom = z;
  }

  follow(tx: number, ty: number, dt: number): void {
    const k = 1 - Math.pow(0.0001, dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.zoom = lerp(this.zoom, this.targetZoom, 1 - Math.pow(0.02, dt));
  }

  punchZoom(delta: number): void {
    this.targetZoom = clamp(this.baseZoom + delta, this.baseZoom * 0.6, this.baseZoom * 1.6);
  }

  addTrauma(amount: number, scale = 1): void {
    this.trauma = clamp(this.trauma + amount * scale, 0, 1);
  }

  updateShake(dt: number, scale = 1): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const mag = this.trauma * this.trauma;
    this.shakeTime += dt * 34;
    const sx = Math.sin(this.shakeTime * 1.7) * mag * 16 * scale;
    const sy = Math.cos(this.shakeTime * 2.3) * mag * 16 * scale;
    this.shakeX = sx;
    this.shakeY = sy;
    this.targetZoom = lerp(this.targetZoom, this.baseZoom, 1 - Math.pow(0.05, dt));
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const z = this.zoom;
    return {
      x: (wx - this.x) * z + this.vw / 2 + this.shakeX,
      y: (wy - this.y) * z + this.vh / 2 + this.shakeY,
    };
  }

  get width(): number {
    return this.vw / this.zoom;
  }

  get height(): number {
    return this.vh / this.zoom;
  }
}
