import type { AchievementDef } from '../types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: '第一簇火', blurb: '取得第一次击杀。', embers: 10 },
  { id: 'level10', name: '火势渐旺', blurb: '单局内达到 10 级。', embers: 15 },
  { id: 'survivor', name: '守夜有成', blurb: '通关「幽林」。', embers: 30 },
  { id: 'conqueror', name: '焚尽长夜', blurb: '通关全部三关。', embers: 120 },
  { id: 'evolved', name: '觉醒', blurb: '进化出任意一件武器。', embers: 40 },
  { id: 'endless20', name: '不灭之灯', blurb: '在无尽模式抵达第 20 波。', embers: 60 },
  { id: 'thorn_king', name: '斩断荆棘', blurb: '击败「荆棘领主」。', embers: 40 },
  { id: 'boss_rush', name: '熄灯不成', blurb: '击败「熄灯者」。', embers: 50 },
  { id: 'ashen_king', name: '熄灭焚天', blurb: '击败「焚天」。', embers: 60 },
  { id: 'nightmare', name: '噩梦生还', blurb: '在噩梦难度通关任意关卡。', embers: 100 },
  { id: 'greedy', name: '光芒万丈', blurb: '单局点亮 6 件以上升级。', embers: 25 },
  { id: 'shrine_first', name: '与暗交易', blurb: '在祭坛上做出第一次抉择。', embers: 15 },
  { id: 'relic_first', name: '遗物猎手', blurb: '获得第一件遗物。', embers: 15 },
  { id: 'relic_hoard', name: '拾荒者', blurb: '单局收集 4 件遗物。', embers: 30 },
  { id: 'curse_bearer', name: '负咒而行', blurb: '带着夜咒平定一整关。', embers: 25 },
  { id: 'combo30', name: '烽火连天', blurb: '单局连杀达到 30。', embers: 40 },
  { id: 'splinter_slain', name: '碎魂者', blurb: '单局击碎 12 只「碎魂」。', embers: 30 },
  { id: 'endless40', name: '长夜不熄', blurb: '在无尽模式抵达第 40 波。', embers: 120 },
  { id: 'codex50', name: '博物学者', blurb: '图鉴中记录 50 个条目。', embers: 80 },
  { id: 'codex_all', name: '无所不窥', blurb: '把图鉴里的条目全部点亮。', embers: 200 },
  { id: 'bounty_first', name: '赏金猎人', blurb: '完成第一次悬赏。', embers: 15 },
  { id: 'bounty40', name: '赏金贯日', blurb: '累计完成 40 次悬赏。', embers: 80 },
  { id: 'runs25', name: '长明不熄', blurb: '累计进行 25 局冒险。', embers: 60 },
  { id: 'clears3', name: '三度长明', blurb: '累计通关 3 次。', embers: 90 },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
