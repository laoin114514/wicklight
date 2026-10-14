/**
 * 生涯档案：把"每一局"沉淀成可以回看的东西。
 *
 * 分成三层：
 *  1. records —— 只记最好的一次（最高连杀 / 最快通关 / 单局最高伤害……），跨局累积；
 *  2. lanterns —— 每盏灯火各自的战绩（局数、最佳关卡、最快通关），用来比较四种打法；
 *  3. history —— 最近若干局的战报，最新在前，供"最近对局"列表读取。
 *
 * 结算时统一走 `record()`：它返回这一局刷新了哪些纪录，界面拿去做"新纪录"徽章。
 */
import { LANTERNS } from '../data/lanterns';
import type { LanternRecord, RecordsData, RunRecord, RunStats, SaveData } from '../types';

/** 生涯档案里"最近对局"保留的条数。 */
export const HISTORY_CAP = 12;

export function defaultRecords(): RecordsData {
  return {
    bestCombo: 0,
    bestKills: 0,
    bestLevel: 0,
    bestDamage: 0,
    bestEmbers: 0,
    bestTime: 0,
    totalTime: 0,
    clearedRuns: 0,
    endlessRuns: 0,
    lanterns: {},
  };
}

function emptyLanternRecord(): LanternRecord {
  return { runs: 0, bestStage: 0, bestKills: 0, bestWave: 0, cleared: 0, bestTime: 0 };
}

/** 这一局刷新的纪录，界面拿去展示成"新纪录"徽章。 */
export interface RecordHighlight {
  key: string;
  label: string;
  value: string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export class RecordsSystem {
  constructor(private save: SaveData) {
    // 老存档没有这两个字段，或字段形状不对时在这里补齐，避免界面读到 undefined
    if (!this.save.records || typeof this.save.records !== 'object') this.save.records = defaultRecords();
    const r = this.save.records;
    const base = defaultRecords();
    for (const k of Object.keys(base) as (keyof RecordsData)[]) {
      if (k === 'lanterns') continue;
      r[k] = num(r[k]);
    }
    if (!r.lanterns || typeof r.lanterns !== 'object') r.lanterns = {};
    if (!Array.isArray(this.save.history)) this.save.history = [];
  }

  get data(): RecordsData {
    return this.save.records;
  }

  get historyList(): RunRecord[] {
    return this.save.history;
  }

  lantern(id: string): LanternRecord | undefined {
    return this.save.records.lanterns[id];
  }

  /** 所有灯火（含未解锁的）的累计战绩，方便界面按固定顺序列出。 */
  lanternRows(): { id: string; name: string; color: string; rec: LanternRecord }[] {
    return LANTERNS.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      rec: this.save.records.lanterns[l.id] ?? emptyLanternRecord(),
    }));
  }

  /**
   * 结算一局：更新纪录、灯火战绩与历史。
   * `stats` 用 Game.runStats()（此时 embers 已经是本局最终收益）。
   * 返回这一局刷新掉的纪录，供结算界面点亮"新纪录"。
   */
  record(stats: RunStats, cleared: boolean): RecordHighlight[] {
    const r = this.save.records;
    const hi: RecordHighlight[] = [];
    const beat = (value: number, best: number): boolean => value > best && value > 0;
    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    if (beat(stats.bestCombo, r.bestCombo)) {
      r.bestCombo = stats.bestCombo;
      hi.push({ key: 'combo', label: '最高连杀', value: `${stats.bestCombo}` });
    }
    if (beat(stats.kills, r.bestKills)) {
      r.bestKills = stats.kills;
      hi.push({ key: 'kills', label: '单局击杀', value: `${stats.kills}` });
    }
    if (beat(stats.level, r.bestLevel)) {
      r.bestLevel = stats.level;
      hi.push({ key: 'level', label: '单局等级', value: `Lv ${stats.level}` });
    }
    if (beat(stats.damageDealt, r.bestDamage)) {
      r.bestDamage = stats.damageDealt;
      hi.push({ key: 'damage', label: '单局伤害', value: `${stats.damageDealt}` });
    }
    if (beat(stats.embers, r.bestEmbers)) {
      r.bestEmbers = stats.embers;
      hi.push({ key: 'embers', label: '单局余烬', value: `+${stats.embers}` });
    }
    if (cleared && (r.bestTime === 0 || stats.time < r.bestTime)) {
      r.bestTime = stats.time;
      hi.push({ key: 'time', label: '最快通关', value: fmtTime(stats.time) });
    }

    r.totalTime += stats.time;
    if (cleared) r.clearedRuns += 1;
    if (stats.endless) r.endlessRuns += 1;

    const lr = this.save.records.lanterns[stats.lantern] ?? (this.save.records.lanterns[stats.lantern] = emptyLanternRecord());
    lr.runs += 1;
    lr.bestStage = Math.max(lr.bestStage, stats.stage);
    lr.bestKills = Math.max(lr.bestKills, stats.kills);
    if (stats.endless) lr.bestWave = Math.max(lr.bestWave, stats.wave);
    if (cleared) {
      lr.cleared += 1;
      if (lr.bestTime === 0 || stats.time < lr.bestTime) lr.bestTime = stats.time;
    }

    const entry: RunRecord = {
      at: Date.now(),
      lantern: stats.lantern,
      difficulty: stats.difficulty,
      stageId: stats.stageId,
      stage: stats.stage,
      endless: stats.endless,
      wave: stats.wave,
      cleared,
      kills: stats.kills,
      level: stats.level,
      time: stats.time,
      bestCombo: stats.bestCombo,
      damageDealt: stats.damageDealt,
      bossKills: stats.bossKills,
      embers: stats.embers,
    };
    this.save.history.unshift(entry);
    if (this.save.history.length > HISTORY_CAP) this.save.history.length = HISTORY_CAP;

    return hi;
  }
}
