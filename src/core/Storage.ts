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
};

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    embers: 0,
    unlockedLanterns: ['warden'],
    meta: [],
    achievements: [],
    best: 0,
    bestEndlessWave: 0,
    runs: 0,
    killsTotal: 0,
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
      const parsed = safeParse(localStorage.getItem(KEY));
      if (parsed) {
        this.memory = {
          ...base,
          ...parsed,
          settings: { ...base.settings, ...(parsed.settings || {}) },
          unlockedLanterns: parsed.unlockedLanterns?.length ? parsed.unlockedLanterns : base.unlockedLanterns,
          meta: parsed.meta ?? base.meta,
          achievements: parsed.achievements ?? base.achievements,
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
