import type { Settings } from '../core/Settings';

type MusicMood = 'calm' | 'battle' | 'boss';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private started = false;
  private mood: MusicMood = 'calm';
  private musicTimer: number | null = null;
  private musicStep = 0;
  private lastPlay = new Map<string, number>();
  private noiseBuffer: AudioBuffer | null = null;

  constructor(private settings: Settings) {}

  get contextCount(): number {
    return this.ctx ? 1 : 0;
  }

  ensure(): boolean {
    if (this.started && this.ctx) return true;
    const Ctor = typeof window !== 'undefined' ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!Ctor) return false;
    try {
      this.ctx = new Ctor();
    } catch {
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(ctx.destination);
    this.applySettings();
    this.noiseBuffer = this.buildNoise();
    this.started = true;
    this.startMusic();
    return true;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private buildNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  applySettings(): void {
    if (!this.master || !this.musicGain || !this.sfxGain) return;
    this.master.gain.value = this.settings.data.master;
    this.musicGain.gain.value = this.settings.data.music * 0.55;
    this.sfxGain.gain.value = this.settings.data.sfx * 0.9;
  }

  setMood(mood: MusicMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private throttle(key: string, ms: number): boolean {
    const t = performance.now();
    const last = this.lastPlay.get(key) ?? 0;
    if (t - last < ms) return false;
    this.lastPlay.set(key, t);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide?: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number, q = 1): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /**
   * 播一个音效。`step` 目前只有连爆用它——一串雷依次响起来的时候，
   * 每一节要比上一节高一点，耳朵才听得出"这是个串"。
   */
  play(name: string, step = 0): void {
    if (!this.started) return;
    switch (name) {
      case 'shoot':
        if (this.throttle('shoot', 45)) this.tone(620, 0.08, 'square', 0.05, 320);
        break;
      case 'wisp':
        if (this.throttle('wisp', 60)) this.tone(880, 0.12, 'sine', 0.05, 1400);
        break;
      case 'hit':
        if (this.throttle('hit', 30)) this.noise(0.06, 0.08, 1800, 1.2);
        break;
      case 'kill':
        if (this.throttle('kill', 40)) this.tone(300, 0.12, 'sawtooth', 0.05, 120);
        break;
      case 'oil':
        if (this.throttle('oil', 50)) this.tone(1100, 0.08, 'sine', 0.05, 1700);
        break;
      case 'levelup':
        this.tone(523, 0.16, 'triangle', 0.12);
        window.setTimeout(() => this.tone(784, 0.26, 'triangle', 0.12), 90);
        break;
      case 'nova':
        this.noise(0.35, 0.22, 500, 0.6);
        this.tone(180, 0.35, 'sawtooth', 0.12, 60);
        break;
      case 'hurt':
        this.tone(220, 0.22, 'square', 0.14, 80);
        break;
      case 'dash':
        this.tone(400, 0.14, 'sine', 0.07, 900);
        break;
      case 'boss':
        this.tone(120, 0.9, 'sawtooth', 0.18, 60);
        this.noise(0.9, 0.16, 240, 0.5);
        break;
      case 'ui':
        this.tone(700, 0.06, 'triangle', 0.08);
        break;
      case 'lamp':
        // 分灯：一声很轻的"噗"，尾音往上走一点（点着了），不是冲刺那种亮点
        this.noise(0.16, 0.07, 620, 0.4);
        this.tone(300, 0.24, 'sine', 0.09, 620);
        break;
      case 'quench':
        this.noise(0.42, 0.15, 900, 0.5);
        this.tone(300, 0.4, 'sine', 0.07, 90);
        break;
      case 'evolve':
        this.tone(440, 0.5, 'triangle', 0.14, 1320);
        break;
      case 'chain':
        // 连爆：一串雷被挨个点着。压得比引爆本身轻（它是"串起来了"这件事的提示，
        // 不是又炸了一次），音高随节数一级一级往上走。
        if (this.throttle('chain', 45)) {
          this.tone(430 + step * 130, 0.09, 'square', 0.055, 880 + step * 170);
        }
        break;
      case 'vortex':
        // 旋灯扔出去：一声往下滑的呼啸（它是"往里吸"的，所以音高是往下的，和连爆正好相反）
        this.noise(0.26, 0.09, 900, 0.7);
        this.tone(620, 0.3, 'triangle', 0.07, 220);
        break;
      case 'vortex_burst':
        // 收缩那一下：闷的一记爆，比燃爆轻（它是收尾，不是主角）
        this.noise(0.22, 0.13, 1500, 0.8);
        this.tone(180, 0.26, 'sine', 0.11, 70);
        break;
      case 'graze':
        // 掠影：一声很轻的"叮"。它一秒钟能响好几下，所以压得比别的都低、节流也更狠
        //（一轮弹幕擦过去五六下，响成一片就变成噪音了）。
        if (this.throttle('graze', 75)) this.tone(1580, 0.06, 'sine', 0.032, 2100);
        break;
      case 'blaze':
        // 灯焰高涨：火"腾"地一下窜起来——低频的爆 + 往上扫的亮音
        this.noise(0.3, 0.14, 1400, 0.6);
        this.tone(520, 0.42, 'triangle', 0.12, 1040);
        break;
      case 'graze_dash':
        if (this.throttle('graze_dash', 90)) this.tone(2100, 0.07, 'sine', 0.036, 1500);
        break;
      default:
        break;
    }
  }

  private startMusic(): void {
    if (this.musicTimer !== null || typeof window === 'undefined') return;
    this.musicTimer = window.setInterval(() => this.musicTick(), 240);
  }

  private musicTick(): void {
    if (!this.ctx || !this.musicGain) return;
    const step = this.musicStep++;
    const scale = this.mood === 'boss' ? [0, 3, 5, 6, 7, 10] : [0, 2, 3, 5, 7, 9];
    const rootBase = this.mood === 'calm' ? 196 : this.mood === 'battle' ? 220 : 174;
    const note = scale[(step * 3) % scale.length] + 12 * (step % 3 === 0 ? 1 : 0);
    const freq = rootBase * Math.pow(2, note / 12);
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = this.mood === 'boss' ? 'sawtooth' : 'triangle';
    osc.frequency.value = freq / 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.mood === 'calm' ? 0.06 : 0.1, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.45);
    if (step % 4 === 0 && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.04, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      src.connect(filter);
      filter.connect(ng);
      ng.connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.12);
    }
  }

  dispose(): void {
    if (this.musicTimer !== null && typeof window !== 'undefined') window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.started = false;
  }
}
