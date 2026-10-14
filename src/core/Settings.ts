import { storage } from './Storage';
import type { SettingsData } from '../types';

export class Settings {
  data: SettingsData;
  private listeners = new Set<() => void>();

  constructor() {
    this.data = storage.load().settings;
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    storage.update((save) => {
      save.settings = { ...this.data };
    });
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get qualityScale(): number {
    if (this.data.quality === 'low') return 0.6;
    if (this.data.quality === 'medium') return 0.8;
    return 1;
  }

  get motionScale(): number {
    return this.data.reduceMotion ? 0 : 1;
  }
}
