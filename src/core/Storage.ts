import { defaultRecords } from '../systems/RecordsSystem';
import { defaultDaily } from '../systems/DailySystem';
import type { SaveData, SettingsData } from '../types';

const KEY = 'wicklight.save.v1';
const SAVE_VERSION = 1;

export const defaultSettings: SettingsData = {
  master: 0.85,
  music: 0.7,
  sfx: 0.85,
  shake: 1,
  reduceMotion: false,
  adaptive: true,
  quality: 'high',
  showFps: false,
  bloom: true,
  vibrate: true,
};

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    embers: 0,
    unlockedLanterns: ['warden'],
    meta: [],
    fire: {},
    achievements: [],
    best: 0,
    bestEndlessWave: 0,
    runs: 0,
    killsTotal: 0,
    codex: [],
    records: defaultRecords(),
    history: [],
    daily: defaultDaily(),
    settings: { ...defaultSettings },
  };
}

function safeParse(raw: string | null): Partial<SaveData> | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    return typeof data === 'object' && data ? data : null;
  } catch {
    return null;
  }
}

/**
 * 系统里开了"减少动态效果"（iOS 的辅助功能 / 安卓的无障碍）就照做：屏幕震动、
 * 故障切片、抖动这一套对新存档默认关掉。玩家在设置里改过之后以存档为准。
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class Storage {
  private memory: SaveData | null = null;
  private available: boolean;

  constructor() {
    this.available = typeof localStorage !== 'undefined';
  }

  load(): SaveData {
    if (this.memory) return this.memory;
    const base = defaultSave();
    if (this.available) {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(KEY);
      } catch {
        raw = null;
      }
      const parsed = safeParse(raw);
      // 没有存档 = 第一次玩：这时候才按系统偏好来（老存档一律尊重玩家自己的选择）
      if (!parsed && prefersReducedMotion()) base.settings.reduceMotion = true;
      if (parsed) {
        this.memory = {
          ...base,
          ...parsed,
          settings: { ...base.settings, ...(parsed.settings || {}) },
          unlockedLanterns: parsed.unlockedLanterns?.length ? parsed.unlockedLanterns : base.unlockedLanterns,
          meta: parsed.meta ?? base.meta,
          achievements: parsed.achievements ?? base.achievements,
          codex: Array.isArray(parsed.codex) ? parsed.codex : base.codex,
          records: parsed.records && typeof parsed.records === 'object' ? { ...base.records, ...parsed.records } : base.records,
          history: Array.isArray(parsed.history) ? parsed.history : base.history,
          daily: parsed.daily && typeof parsed.daily === 'object' ? { ...base.daily, ...parsed.daily } : base.daily,
        };
        return this.memory;
      }
    }
    this.memory = base;
    return this.memory;
  }

  save(data: SaveData): void {
    this.memory = data;
    if (!this.available) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked; keep in-memory copy */
    }
  }

  update(mutator: (data: SaveData) => void): SaveData {
    const data = this.load();
    mutator(data);
    this.save(data);
    return data;
  }

  reset(): SaveData {
    const fresh = defaultSave();
    this.save(fresh);
    return fresh;
  }
}

export const storage = new Storage();
