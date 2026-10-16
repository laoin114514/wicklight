import type { Random } from '../core/Random';
import { NORMAL_ENEMIES, ENEMY_MAP } from '../data/enemies';
import { STAGES } from '../data/stages';
import { HUNT } from '../data/hunt';
import type { Difficulty, StageDef } from '../types';
import { DIFFICULTIES } from './DifficultySystem';
import { noPacts, type PactMods } from '../data/pacts';

export interface DirectorContext {
  spawnEnemy: (defId: string, x: number, y: number, hpMult: number, dmgMult: number) => string | void;
  aliveCount: () => number;
  /**
   * 刷怪点。传 `speed` 就按「赴灯」算到场时间（见 `data/arrival.ts`）——
   * 普通怪都传，精英 / 首领不传（它们的登场是给玩家看的，不许刷在视野边上）。
   */
  spawnPoint: (speed?: number) => { x: number; y: number };
  announce: (text: string, big?: boolean) => void;
  hazard: (kind: string) => void;
  onBossSpawn: (defId: string) => void;
  onStageComplete: () => void;
  isBossAlive: () => boolean;
  playerPos: () => { x: number; y: number };
  /** 收尾窗口刚打开的那一下（"余党循灯而来"）：只讲一次，别每帧重复 */
  onHunt?: () => void;
}

export type DirectorPhase = 'intro' | 'spawning' | 'clearing' | 'boss' | 'complete';

/** 无尽之夜的首领轮换顺序：每 5 波一位。 */
export const ENDLESS_BOSSES = ['thornlord', 'extinguisher', 'emberwake', 'nightfall'];
/** 从第几轮开始，首领成对出现（第 3 轮 = 第 15 波）。 */
export const ENDLESS_PAIR_ROUND = 3;
/** 从第几轮开始，三位首领一同苏醒（第 5 轮 = 第 25 波）。 */
export const ENDLESS_TRIO_ROUND = 5;

export class Director {
  phase: DirectorPhase = 'intro';
  wave = 0;
  endless = false;
  stageIndex = 0;
  /** 当前这一波是不是「双首领」（三位入场时同样为真）。 */
  bossPair = false;
  /** 当前这一波同时上场的首领数量：1 / 2 / 3。 */
  bossCount = 0;
  /**
   * 「循灯」窗口：一波已经刷完、场上只剩最后几只（见 data/hunt.ts）。
   * 开着的时候，还没到场的那几只直奔玩家——不然玩家要为了结束这一波，回头把余党一个个捡回来。
   */
  hunting = false;
  /** 这一波里"循灯"报过没有（一个窗口只提示一次） */
  private huntAnnounced = false;
  /** 本关夜咒带来的敌人强化。 */
  curse: { countMult: number; hpMult: number; dmgMult: number; extraWaves: number } = {
    countMult: 1,
    hpMult: 1,
    dmgMult: 1,
    extraWaves: 0,
  };
  /**
   * 这一局背的「深宵之约」（v79，见 `data/pacts.ts`）。默认是那份"什么都不改"，
   * 所以不背之约的每一局，这里乘上去的三个数都正好是 1——`bench --fixed` 因此**逐字节不变**
   * （那一条就是这条"加法式改动"的护栏：加系统的版本不许悄悄改到没勾它的那一局）。
   *
   * 它走自己的字段、不进 `curse`：夜咒是"这一关"带的（换关重掷），之约是"这一局"背的，
   * 两者的寿命不一样——混在一个袋子里，换关时就会出"夜咒没了、之约也跟着没了"这种错。
   */
  pacts: PactMods = noPacts();
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
    this.bossCount = 0;
    this.hunting = false;
    this.huntAnnounced = false;
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
    const pact = this.pacts;
    this.hpMult =
      mods.hpMult * curse.hpMult * pact.hpMult * (1 + (w - 1) * 0.16 + this.stageIndex * 0.4 + endlessBonus * 0.2);
    this.dmgMult =
      mods.dmgMult * curse.dmgMult * pact.dmgMult * (1 + (w - 1) * 0.05 + this.stageIndex * 0.14 + endlessBonus * 0.08);
    const base = 6 + w * 2.4;
    this.waveBudget = Math.round(base * mods.countMult * curse.countMult * pact.countMult);
    this.aliveCap = Math.min(90, 14 + w * 3);
    this.spawned = 0;
    this.spawnTimer = 0.4;
    this.hunting = false;
    this.huntAnnounced = false;

    const bossIndex = Math.floor(this.wave / 5 - 1) % ENDLESS_BOSSES.length;
    const bossId = this.endless ? ENDLESS_BOSSES[bossIndex] : this.stage.boss;
    const isBossWave = this.endless
      ? this.wave % 5 === 0
      : this.wave === this.stage.waves + curse.extraWaves && !!bossId;
    if (isBossWave && bossId) {
      this.phase = 'boss';
      // 第 3 轮起首领成对，第 5 轮起三位同台——单只首领的招式早就背熟了，加人才是新的题
      const round = this.wave / 5;
      const count = this.endless ? (round >= ENDLESS_TRIO_ROUND ? 3 : round >= ENDLESS_PAIR_ROUND ? 2 : 1) : 1;
      this.bossCount = count;
      this.bossPair = count >= 2;
      // 同台的首领越多，各自被压得越低——不然三份满血叠在一起只是把时间拉长
      const share = count >= 3 ? 0.46 : count === 2 ? 0.62 : 0.9;
      const hp = this.hpMult * share;
      const names: string[] = [];
      for (let k = 0; k < count; k += 1) {
        const id = ENDLESS_BOSSES[(bossIndex + k) % ENDLESS_BOSSES.length];
        const def = ENEMY_MAP[id];
        const pos = ctx.spawnPoint();
        ctx.spawnEnemy(id, pos.x, pos.y, hp, this.dmgMult);
        ctx.onBossSpawn(def.id);
        names.push(def.name);
      }
      if (count >= 2) {
        ctx.announce(`第 ${this.round} 轮 · ${names.slice(0, -1).join('、')} 与 ${names[names.length - 1]} 一同苏醒`, true);
      } else {
        ctx.announce(`${names[0]} 苏醒`, true);
      }
    } else {
      this.phase = 'spawning';
      // 首领前那一波把话说在前面：不然"下一波直接站着首领"会显得不讲道理
      const warning = this.bossNext ? ' · 首领将至' : '';
      if (this.wave % 3 === 0 && this.stage.elites.length) {
        // 「成群」那条之约：这一次精英波多来一位。为什么把它做成"多一位"而不是"每波都来"：
        // 每波都来会把这个游戏的节奏改成"一直在打精英"，而"两只同时站在这片地上"考的是
        // 另一件事——你得先决定点哪一只（这一版里唯一一条改**节奏**而不是改数值的条款）。
        // 不背「成群」时 count = 1，下面这一圈和原来那一版**逐字一样**（名字后面挂它自己的词缀）。
        const count = 1 + pact.extraElites;
        const lines: string[] = [];
        for (let k = 0; k < count; k += 1) {
          const eliteId = this.rng.pick(this.stage.elites);
          const pos = ctx.spawnPoint();
          const affix = ctx.spawnEnemy(eliteId, pos.x, pos.y, this.hpMult * 0.85, this.dmgMult);
          lines.push(`${ENEMY_MAP[eliteId].name}${affix ? ' · ' + affix : ''}`);
        }
        ctx.announce(`精英来袭：${lines.join('、')}${warning}`, true);
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
              // 把脚力交给刷怪点：走得慢的从近处出发，让这一波"一起到场"（见 data/arrival.ts）
              const pos = ctx.spawnPoint(ENEMY_MAP[id].speed);
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

    // 「循灯」：一波刷完、场上只剩最后几只的时候开这个窗口（见 data/hunt.ts）。
    // 判定放在 Director 是因为"这一波结束了没有"本来就是它的事；
    // 执行在 EnemySystem（它只知道"我要不要直奔玩家"）。
    const alive = ctx.aliveCount();
    const hunting = this.phase === 'clearing' && alive > 0 && alive <= HUNT.aliveAt;
    if (hunting && !this.huntAnnounced) {
      this.huntAnnounced = true;
      ctx.onHunt?.();
    }
    if (!hunting) this.huntAnnounced = false;
    this.hunting = hunting;

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
