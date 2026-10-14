/**
 * 今日灯芯（每日挑战）。
 *
 * 同一天里所有玩家面对的是**同一个夜晚**：固定的灯火、固定的难度、每一关的夜咒与悬赏
 * 都从日期里推出来（纯函数，不看运气），于是成绩之间才有比较的意义。
 * 局内依旧是随机应变的——固定的是"条件"，不是"过程"。
 */
import { BOUNTIES } from '../data/bounties';
import { ENEMY_MAP } from '../data/enemies';
import { CURSES } from '../data/curses';
import { LANTERNS } from '../data/lanterns';
import { STAGES } from '../data/stages';
import { DIFFICULTY_ORDER, DIFFICULTIES } from './DifficultySystem';
import type { DailySave, Difficulty } from '../types';

export interface DailyPlan {
  /** YYYY-MM-DD（本地时区） */
  key: string;
  seed: number;
  lantern: string;
  difficulty: Difficulty;
  /** 每关的夜咒 id，第一关固定 null（教学关不施加夜咒） */
  curses: (string | null)[];
  /** 每关的悬赏 id */
  bounties: string[];
}

export function defaultDaily(): DailySave {
  return { key: '', attempts: 0, bestScore: 0, bestKills: 0, bestStage: 0, cleared: false, bestLantern: '' };
}

export function dailyKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 把日期字符串揉成一个整数种子（FNV-1a）。 */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 由种子派生的确定性取值器（同一个 key 永远得到同一个夜晚）。 */
class PlanPicker {
  private state: number;
  constructor(seed: number) {
    this.state = seed || 1;
  }
  private next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
}

export function buildDailyPlan(key: string = dailyKey()): DailyPlan {
  const seed = hashKey(`wicklight:${key}`);
  const rng = new PlanPicker(seed);
  const lantern = rng.pick(LANTERNS).id;
  const difficulty: Difficulty = rng.pick(DIFFICULTY_ORDER);
  const curses: (string | null)[] = STAGES.map((_, i) => (i === 0 ? null : rng.pick(CURSES).id));
  // 悬赏必须当关可行：别把"还没出场的敌人"当猎杀目标派给玩家
  const bounties = STAGES.map((_, i) =>
    rng.pick(
      BOUNTIES.filter((b) => {
        if (b.kind !== 'hunt') return true;
        const enemy = b.enemy ? ENEMY_MAP[b.enemy] : null;
        return !!enemy && (enemy.minWave ?? 1) <= 1 + i;
      }),
    ).id,
  );
  return { key, seed, lantern, difficulty, curses, bounties };
}

export function dailyLabel(plan: DailyPlan): string {
  const lantern = LANTERNS.find((l) => l.id === plan.lantern);
  return `${DIFFICULTIES[plan.difficulty].label} · ${lantern?.name ?? plan.lantern}`;
}

/** 成绩：比"打得多远"更看重推进，所以关卡权重最高。 */
export function dailyScore(stats: { kills: number; stage: number; level: number; bossKills: number; cleared: boolean }): number {
  return Math.round(stats.kills * 2 + stats.stage * 120 + stats.level * 12 + stats.bossKills * 80 + (stats.cleared ? 400 : 0));
}
