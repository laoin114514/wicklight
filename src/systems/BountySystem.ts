/**
 * 悬赏的进度机件。
 *
 * 只负责"数数"和"判定完成"，发奖由 Game 做——因为奖励要动金币、生命、灯油，
 * 那些都攥在 Game 手里；这里保持纯粹，方便单独测。
 */
import { BOUNTIES, type BountyDef, type BountyKind } from '../data/bounties';
import { ENEMY_MAP } from '../data/enemies';
import type { Random } from '../core/Random';

export interface BountyState {
  def: BountyDef;
  kind: BountyKind;
  progress: number;
  target: number;
  /** 已达成、等待发奖（发完置 settled） */
  done: boolean;
  settled: boolean;
}

export class BountySystem {
  state: BountyState | null = null;
  /** 累计完成的悬赏数（本局）。 */
  completedThisRun = 0;
  private lastId: string | null = null;

  /** 该悬赏在当前深度是否可行（要猎杀的敌人得真的刷得出来、要会的机制得先见过）。 */
  private available(def: BountyDef, depth: number): boolean {
    if (def.minDepth && depth < def.minDepth) return false;
    if (def.kind !== 'hunt') return true;
    const enemy = def.enemy ? ENEMY_MAP[def.enemy] : null;
    if (!enemy) return false;
    return (enemy.minWave ?? 1) <= 1 + depth;
  }

  /** 抽一张悬赏。`depth` 越大可选池越大（无尽模式随波次增长）。 */
  roll(rng: Random, depth: number): BountyDef {
    let pool = BOUNTIES.filter((b) => this.available(b, depth));
    if (!pool.length) pool = BOUNTIES.filter((b) => b.kind !== 'hunt');
    if (pool.length > 1) {
      const withoutLast = pool.filter((b) => b.id !== this.lastId);
      if (withoutLast.length) pool = withoutLast;
    }
    const def = rng.pick(pool);
    this.lastId = def.id;
    this.state = { def, kind: def.kind, progress: 0, target: def.target, done: false, settled: false };
    return def;
  }

  /** 直接指定一张悬赏（今日灯芯用）。 */
  force(def: BountyDef): BountyDef {
    this.lastId = def.id;
    this.state = { def, kind: def.kind, progress: 0, target: def.target, done: false, settled: false };
    return def;
  }

  clear(): void {
    this.state = null;
  }

  reset(): void {
    this.state = null;
    this.completedThisRun = 0;
    this.lastId = null;
  }

  get frac(): number {
    if (!this.state) return 0;
    return Math.max(0, Math.min(1, this.state.progress / this.state.target));
  }

  /** 进度文本，HUD 直接用。 */
  get label(): string {
    const s = this.state;
    if (!s) return '';
    if (s.kind === 'untouched') return `${Math.floor(s.progress)}/${s.target} 秒`;
    return `${Math.floor(s.progress)}/${s.target}`;
  }

  private advance(value: number): void {
    const s = this.state;
    if (!s || s.done) return;
    s.progress = Math.min(s.target, value);
    if (s.progress >= s.target) s.done = true;
  }

  onKill(defId: string): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'hunt' || s.def.enemy !== defId) return;
    this.advance(s.progress + 1);
  }

  onCombo(combo: number): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'combo') return;
    this.advance(Math.max(s.progress, combo));
  }

  onNova(): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'nova') return;
    this.advance(s.progress + 1);
  }

  onPyre(): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'pyre') return;
    this.advance(s.progress + 1);
  }

  /** 掠影一次（`Game.grazeEvent` 调用）：两张掠影悬赏共用这一个入口。 */
  onGraze(): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'graze') return;
    // 两张卡数的是不同的东西：一张数擦身次数，一张数点着了几次焰
    if (s.def.id === 'blaze2') return;
    this.advance(s.progress + 1);
  }

  /** 点着一次「灯焰高涨」（`Game.igniteBlaze` 调用）。 */
  onBlaze(): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'graze') return;
    if (s.def.id !== 'blaze2') return;
    this.advance(s.progress + 1);
  }

  tick(dt: number): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'untouched') return;
    this.advance(s.progress + dt);
  }

  /** 受伤会把"静默"的计时打回原点。 */
  onPlayerHit(): void {
    const s = this.state;
    if (!s || s.done || s.kind !== 'untouched') return;
    s.progress = 0;
  }

  /** 取走已完成的悬赏（只返回一次）。 */
  takeCompleted(): BountyDef | null {
    const s = this.state;
    if (!s || !s.done || s.settled) return null;
    s.settled = true;
    this.completedThisRun += 1;
    return s.def;
  }
}
