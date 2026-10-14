import type { Random } from '../core/Random';
import { NORMAL_ENEMIES, ENEMY_MAP } from '../data/enemies';
import { STAGES } from '../data/stages';
import type { Difficulty, StageDef } from '../types';
import { DIFFICULTIES } from './DifficultySystem';

export interface DirectorContext {
  spawnEnemy: (defId: string, x: number, y: number, hpMult: number, dmgMult: number) => string | void;
  aliveCount: () => number;
  spawnPoint: () => { x: number; y: number };
  announce: (text: string, big?: boolean) => void;
  hazard: (kind: string) => void;
  onBossSpawn: (defId: string) => void;
  onStageComplete: () => void;
  isBossAlive: () => boolean;
  playerPos: () => { x: number; y: number };
}

export type DirectorPhase = 'intro' | 'spawning' | 'clearing' | 'boss' | 'complete';

/** 无尽之夜的首领轮换顺序：每 5 波一位。 */
export const ENDLESS_BOSSES = ['thornlord', 'extinguisher', 'emberwake', 'nightfall'];
/** 从第几轮开始，首领成对出现（第 3 轮 = 第 15 波）。 */
export const ENDLESS_PAIR_ROUND = 3;

export class Director {
  phase: DirectorPhase = 'intro';
  wave = 0;
  endless = false;
  stageIndex = 0;
  /** 当前这一波是不是「双首领」。 */
  bossPair = false;
  /** 本关夜咒带来的敌人强化。 */
  curse: { countMult: number; hpMult: number; dmgMult: number; extraWaves: number } = {
    countMult: 1,
    hpMult: 1,
    dmgMult: 1,
    extraWaves: 0,
  };
  private spawnTimer = 0;
  private spawned = 0;
  private waveBudget = 0;
  private hpMult = 1;
  private dmgMult = 1;
  private introTimer = 2.2;
  private hazardTimer = 12;
  private aliveCap = 0;

  constructor(private stage: StageDef, private difficulty: Difficulty, private rng: Random) {}

  get stageDef(): StageDef {
    return this.stage;
  }

  setStage(stage: StageDef, index: number): void {
    this.stage = stage;
    this.stageIndex = index;
    this.phase = 'intro';
    this.introTimer = 2.4;
    this.wave = 0;
    this.spawned = 0;
    this.spawnTimer = 0;
    this.hazardTimer = 12;
    this.aliveCap = 0;
    this.bossPair = false;
  }

  /** 设置本关夜咒的敌人强化（在 setStage 之后调用）。 */
  setCurse(mods: { countMult?: number; hpMult?: number; dmgMult?: number; extraWaves?: number } | null): void {
    this.curse = {
      countMult: mods?.countMult ?? 1,
      hpMult: mods?.hpMult ?? 1,
      dmgMult: mods?.dmgMult ?? 1,
      extraWaves: mods?.extraWaves ?? 0,
    };
  }

  enableEndless(): void {
    this.endless = true;
  }

  get totalWaves(): number {
    return this.endless ? Infinity : this.stage.waves + this.curse.extraWaves;
  }

  /** 这一波是不是"首领前的最后一波"：是的话该给个预告，而不是让首领突然站在脸上。 */
  get bossNext(): boolean {
    if (this.endless) return this.wave % 5 === 4;
    return !!this.stage.boss && this.wave === this.totalWaves - 1;
  }

  /** 无尽之夜的轮次（每 5 波一轮，第 1 轮就是第 5 波）。 */
  get round(): number {
    return Math.floor(this.wave / 5);
  }

  private mods() {
    return DIFFICULTIES[this.difficulty];
  }

  private beginWave(ctx: DirectorContext): void {
    this.wave += 1;
    const mods = this.mods();
    const w = this.wave;
    const endlessBonus = this.endless ? Math.floor(this.wave / 5) : 0;
    const curse = this.curse;
    this.hpMult = mods.hpMult * curse.hpMult * (1 + (w - 1) * 0.16 + this.stageIndex * 0.4 + endlessBonus * 0.2);
    this.dmgMult = mods.dmgMult * curse.dmgMult * (1 + (w - 1) * 0.05 + this.stageIndex * 0.14 + endlessBonus * 0.08);
    const base = 6 + w * 2.4;
    this.waveBudget = Math.round(base * mods.countMult * curse.countMult);
    this.aliveCap = Math.min(90, 14 + w * 3);
    this.spawned = 0;
    this.spawnTimer = 0.4;

    const bossIndex = Math.floor(this.wave / 5 - 1) % ENDLESS_BOSSES.length;
    const bossId = this.endless ? ENDLESS_BOSSES[bossIndex] : this.stage.boss;
    const isBossWave = this.endless
      ? this.wave % 5 === 0
      : this.wave === this.stage.waves + curse.extraWaves && !!bossId;
    if (isBossWave && bossId) {
      this.phase = 'boss';
      // 第 3 轮起，两位首领一起上场——单只首领的招式已经背熟了，成对才是新的题
      const pair = this.endless && this.wave / 5 >= ENDLESS_PAIR_ROUND;
      this.bossPair = pair;
      const hp = this.hpMult * (pair ? 0.62 : 0.9);
      const def = ENEMY_MAP[bossId];
      const pos = ctx.spawnPoint();
      ctx.spawnEnemy(bossId, pos.x, pos.y, hp, this.dmgMult);
      ctx.onBossSpawn(def.id);
      if (pair) {
        const secondId = ENDLESS_BOSSES[(bossIndex + 1) % ENDLESS_BOSSES.length];
        const def2 = ENEMY_MAP[secondId];
        const pos2 = ctx.spawnPoint();
        ctx.spawnEnemy(secondId, pos2.x, pos2.y, hp, this.dmgMult);
        ctx.onBossSpawn(def2.id);
        ctx.announce(`第 ${this.round} 轮 · ${def2.name} 与 ${def.name} 一同苏醒`, true);
      } else {
        ctx.announce(`${def.name} 苏醒`, true);
      }
    } else {
      this.phase = 'spawning';
      // 首领前那一波把话说在前面：不然"下一波直接站着首领"会显得不讲道理
      const warning = this.bossNext ? ' · 首领将至' : '';
      if (this.wave % 3 === 0 && this.stage.elites.length) {
        const eliteId = this.rng.pick(this.stage.elites);
        const pos = ctx.spawnPoint();
        const affix = ctx.spawnEnemy(eliteId, pos.x, pos.y, this.hpMult * 0.85, this.dmgMult);
        ctx.announce(`精英来袭：${ENEMY_MAP[eliteId].name}${affix ? ' · ' + affix : ''}${warning}`, true);
      } else {
        ctx.announce(`第 ${this.wave} 波${warning}`);
      }
    }
  }

  update(dt: number, ctx: DirectorContext): void {
    const mods = this.mods();
    switch (this.phase) {
      case 'intro':
        this.introTimer -= dt;
        if (this.introTimer <= 0) this.beginWave(ctx);
        break;
      case 'spawning': {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.spawned < this.waveBudget) {
          const alive = ctx.aliveCount();
          if (alive < this.aliveCap) {
            const batch = 1 + Math.floor(mods.countMult);
            for (let i = 0; i < batch && this.spawned < this.waveBudget; i += 1) {
              const pool = NORMAL_ENEMIES.filter((id) => (ENEMY_MAP[id].minWave ?? 1) <= this.wave + this.stageIndex);
              const id = pool.length ? this.rng.pick(pool) : 'shade';
              const pos = ctx.spawnPoint();
              ctx.spawnEnemy(id, pos.x, pos.y, this.hpMult, this.dmgMult);
              this.spawned += 1;
            }
          }
          this.spawnTimer = 0.9 * mods.spawnRate;
        }
        if (this.spawned >= this.waveBudget) this.phase = 'clearing';
        break;
      }
      case 'clearing': {
        if (ctx.aliveCount() === 0) {
          if (!this.endless && this.wave >= this.stage.waves + this.curse.extraWaves) {
            if (!this.stage.boss) {
              this.phase = 'complete';
              ctx.onStageComplete();
            }
          } else {
            this.beginWave(ctx);
          }
        }
        break;
      }
      case 'boss': {
        // 双首领要两只都倒下才算清场（isBossAlive 会一直为真直到最后一只倒下）
        if (!ctx.isBossAlive()) {
          if (this.endless) {
            ctx.onStageComplete();
            this.beginWave(ctx);
          } else {
            this.phase = 'complete';
            ctx.onStageComplete();
          }
        }
        break;
      }
      case 'complete':
        break;
      default:
        break;
    }

    // Hazards
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0 && this.stage.hazards.length) {
      this.hazardTimer = this.rng.range(11, 18);
      ctx.hazard(this.rng.pick(this.stage.hazards));
    }
  }

  nextStage(): boolean {
    const next = this.stageIndex + 1;
    if (next < STAGES.length) {
      this.setStage(STAGES[next], next);
      return true;
    }
    return false;
  }

  get bossHpMult(): number {
    return this.hpMult;
  }

  get bossDmgMult(): number {
    return this.dmgMult;
  }
}
