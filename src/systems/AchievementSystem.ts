import { ACHIEVEMENT_MAP } from '../data/achievements';
import type { SaveData } from '../types';

export class AchievementSystem {
  private unlockedThisRun = new Set<string>();

  constructor(private save: SaveData, private onUnlock: (id: string) => void) {}

  reset(): void {
    this.unlockedThisRun.clear();
  }

  unlock(id: string): boolean {
    if (this.save.achievements.includes(id)) return false;
    if (this.unlockedThisRun.has(id)) return false;
    this.unlockedThisRun.add(id);
    this.save.achievements.push(id);
    this.onUnlock(id);
    return true;
  }

  get def() {
    return ACHIEVEMENT_MAP;
  }
}
