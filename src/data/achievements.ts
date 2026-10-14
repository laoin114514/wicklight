import type { AchievementDef } from '../types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: '第一簇火', blurb: '取得第一次击杀。' },
  { id: 'level10', name: '火势渐旺', blurb: '单局内达到 10 级。' },
  { id: 'survivor', name: '守夜有成', blurb: '通关「幽林」。' },
  { id: 'conqueror', name: '焚尽长夜', blurb: '通关全部三关。' },
  { id: 'evolved', name: '觉醒', blurb: '进化出任意一件武器。' },
  { id: 'endless20', name: '不灭之灯', blurb: '在无尽模式抵达第 20 波。' },
  { id: 'thorn_king', name: '斩断荆棘', blurb: '击败「荆棘领主」。' },
  { id: 'boss_rush', name: '熄灯不成', blurb: '击败「熄灯者」。' },
  { id: 'ashen_king', name: '熄灭焚天', blurb: '击败「焚天」。' },
  { id: 'nightmare', name: '噩梦生还', blurb: '在噩梦难度通关任意关卡。' },
  { id: 'greedy', name: '光芒万丈', blurb: '单局点亮 6 件以上升级。' },
  { id: 'shrine_first', name: '与暗交易', blurb: '在祭坛上做出第一次抉择。' },
  { id: 'relic_first', name: '遗物猎手', blurb: '获得第一件遗物。' },
  { id: 'relic_hoard', name: '拾荒者', blurb: '单局收集 4 件遗物。' },
  { id: 'curse_bearer', name: '负咒而行', blurb: '带着夜咒平定一整关。' },
  { id: 'combo30', name: '烽火连天', blurb: '单局连杀达到 30。' },
  { id: 'splinter_slain', name: '碎魂者', blurb: '单局击碎 12 只「碎魂」。' },
  { id: 'endless40', name: '长夜不熄', blurb: '在无尽模式抵达第 40 波。' },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
