import type { Difficulty } from '../types';

export interface DifficultyMods {
  hpMult: number;
  dmgMult: number;
  spawnRate: number;
  countMult: number;
  emberMult: number;
  oilMult: number;
  label: string;
  blurb: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyMods> = {
  relaxed: { hpMult: 0.8, dmgMult: 0.75, spawnRate: 1.25, countMult: 1.1, emberMult: 0.85, oilMult: 1.35, label: '放松', blurb: '敌人更少更弱，灯油充足，安心探索。' },
  normal: { hpMult: 1, dmgMult: 1, spawnRate: 1, countMult: 1.35, emberMult: 1, oilMult: 1, label: '标准', blurb: '原汁原味的夜行均衡体验。' },
  nightmare: { hpMult: 1.5, dmgMult: 1.4, spawnRate: 0.78, countMult: 1.7, emberMult: 1.6, oilMult: 0.75, label: '噩梦', blurb: '敌人如潮，灯光微弱，奖励丰厚。' },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['relaxed', 'normal', 'nightmare'];
