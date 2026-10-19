import type { AchievementDef, AchievementGroup } from '../types';

/** 成就面板里的分组顺序 */
export const ACHIEVEMENT_GROUPS: AchievementGroup[] = ['战斗', '关卡与首领', '抉择与风险', '收集与档案'];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: '第一簇火', blurb: '取得第一次击杀。', embers: 10, group: '战斗' },
  { id: 'level10', name: '火势渐旺', blurb: '单局内达到 10 级。', embers: 15, group: '战斗' },
  { id: 'evolved', name: '觉醒', blurb: '进化出任意一件武器。', embers: 40, group: '战斗' },
  { id: 'greedy', name: '光芒万丈', blurb: '单局点亮 6 件以上升级。', embers: 25, group: '战斗' },
  { id: 'combo30', name: '烽火连天', blurb: '单局连杀达到 30。', embers: 40, group: '战斗' },
  { id: 'splinter_slain', name: '碎魂者', blurb: '单局击碎 12 只「碎魂」。', embers: 30, group: '战斗' },
  { id: 'echo_bane', name: '回声止步', blurb: '单局击杀 10 只「回响」。', embers: 35, group: '战斗' },
  { id: 'siphon_slain', name: '灯火不可夺', blurb: '单局击杀 5 只「噬灯魅」。', embers: 45, group: '战斗' },
  { id: 'mirewalker', name: '踏雾而行', blurb: '单局在滞行雾里累计待满 20 秒。', embers: 35, group: '战斗' },
  { id: 'wickwalk', name: '省着烧', blurb: '单局拨着小火（拨芯）累计走满 60 秒。', embers: 35, group: '抉择与风险' },
  { id: 'frost_walker', name: '霜行者', blurb: '单局在寒潮的霜冻里累计待满 6 秒。', embers: 40, group: '战斗' },
  { id: 'pierce_line', name: '一线穿心', blurb: '一次光矛贯穿 5 个敌人。', embers: 40, group: '战斗' },
  { id: 'blade_return', name: '去而复返', blurb: '单局用回旋灯刃回程命中 25 次。', embers: 40, group: '战斗' },
  { id: 'graze60', name: '影中行', blurb: '单局掠影 60 次（擦着敌人或弹幕走过去）。', embers: 35, group: '战斗' },
  { id: 'blaze6', name: '焰路常燃', blurb: '单局点着 6 次「灯焰高涨」。', embers: 45, group: '战斗' },
  { id: 'mine_multi', name: '伏击', blurb: '一颗「伏灯」同时炸到 5 个敌人。', embers: 40, group: '战斗' },
  { id: 'minechain', name: '一串灯', blurb: '一次连爆把 4 颗以上「伏灯」串成一条线。', embers: 40, group: '战斗' },
  { id: 'mine_moth', name: '以灯为饵', blurb: '一颗「伏灯」一次炸到 4 只「灯蛾」。', embers: 40, group: '战斗' },
  { id: 'vortex_crowd', name: '一网打尽', blurb: '一个「旋灯」里同时拽住 6 只敌人。', embers: 40, group: '战斗' },
  { id: 'vortex_payoff', name: '收网', blurb: '一次「旋灯」收网，收尾那一下同时打到 10 只敌人。', embers: 40, group: '战斗' },
  { id: 'pour_douse', name: '火上浇油', blurb: '往自己倒出来的那片火上再浇一瓢，那一刻火里已经有 5 只敌人在烧。', embers: 40, group: '战斗' },
  { id: 'aura_crowd', name: '照单全收', blurb: '一次「燎灯」的脉冲同时烤到 8 只敌人。', embers: 40, group: '战斗' },
  { id: 'wallfire_crowd', name: '一壁五焚', blurb: '一次「壁火」同时烧到 5 只敌人。', embers: 40, group: '战斗' },
  // 「弃灯」这一族（v83）：一条量"它真的引来了一群"（门槛 8 只，见 data/lamp.ts 的 `crowd`），
  // 一条量"收网那一下炸到了几只"（「焚灯」）。两条都数**只数**，不数伤害——
  // 伤害要乘灯火（满油 ≈ 1.35 倍、烧干 ≈ 0.65 倍），同一个操作能差两倍，只数才不会飘。
  { id: 'lamp_crowd', name: '空城', blurb: '一盏「弃灯」引来的敌人攒到 8 只。', embers: 40, group: '战斗' },
  { id: 'lamp_burst', name: '灯灭一击', blurb: '「焚灯」炸开的那一下同时打到 6 只敌人。', embers: 40, group: '战斗' },

  { id: 'survivor', name: '守夜有成', blurb: '通关「幽林」。', embers: 30, group: '关卡与首领' },
  { id: 'conqueror', name: '焚尽长夜', blurb: '通关全部关卡。', embers: 120, group: '关卡与首领' },
  { id: 'nightmare', name: '噩梦生还', blurb: '在噩梦难度通关任意关卡。', embers: 100, group: '关卡与首领' },
  { id: 'thorn_king', name: '斩断荆棘', blurb: '击败「荆棘领主」。', embers: 40, group: '关卡与首领' },
  { id: 'boss_rush', name: '熄灯不成', blurb: '击败「熄灯者」。', embers: 50, group: '关卡与首领' },
  { id: 'ashen_king', name: '熄灭焚天', blurb: '击败「焚天」。', embers: 60, group: '关卡与首领' },
  { id: 'nightfall_king', name: '长夜终有尽', blurb: '击败「终夜」。', embers: 70, group: '关卡与首领' },
  { id: 'endless20', name: '不灭之灯', blurb: '在无尽模式抵达第 20 波。', embers: 60, group: '关卡与首领' },
  { id: 'endless40', name: '长夜不熄', blurb: '在无尽模式抵达第 40 波。', embers: 120, group: '关卡与首领' },
  { id: 'endless60', name: '长夜尽头', blurb: '在无尽模式抵达第 60 波。', embers: 150, group: '关卡与首领' },
  { id: 'twin_boss', name: '双首同焚', blurb: '在无尽模式同一波里击败两位首领。', embers: 120, group: '关卡与首领' },
  { id: 'trio_boss', name: '三首同辉', blurb: '在无尽模式同一波里击败三位首领。', embers: 150, group: '关卡与首领' },
  { id: 'blaze_boss', name: '焰中斩', blurb: '在「灯焰高涨」期间击败一位首领。', embers: 50, group: '关卡与首领' },
  { id: 'clears3', name: '三度长明', blurb: '累计通关 3 次。', embers: 90, group: '关卡与首领' },
  { id: 'pact3', name: '深宵行者', blurb: '背着 3 条「深宵之约」通关。', embers: 120, group: '关卡与首领' },
  { id: 'pactall', name: '长夜独行', blurb: '背着全部「深宵之约」通关。', embers: 220, group: '关卡与首领' },

  { id: 'shrine_first', name: '与暗交易', blurb: '在祭坛上做出第一次抉择。', embers: 15, group: '抉择与风险' },
  { id: 'curse_bearer', name: '负咒而行', blurb: '带着夜咒平定一整关。', embers: 25, group: '抉择与风险' },
  { id: 'curse_veteran', name: '咒中行', blurb: '带着「低语」或「枯灯」平定一整关。', embers: 30, group: '抉择与风险' },
  { id: 'pyre_first', name: '点灯人', blurb: '点亮第一座灯台。', embers: 20, group: '抉择与风险' },
  { id: 'pyre_all', name: '长夜灯塔', blurb: '单局点亮一关里的全部灯台。', embers: 70, group: '抉择与风险' },
  { id: 'forge_first', name: '淬火', blurb: '在商店的熔铸台上换掉一件遗物。', embers: 20, group: '抉择与风险' },
  { id: 'relic_first', name: '遗物猎手', blurb: '获得第一件遗物。', embers: 15, group: '抉择与风险' },
  { id: 'relic_hoard', name: '拾荒者', blurb: '单局收集 4 件遗物。', embers: 30, group: '抉择与风险' },
  { id: 'resonance', name: '灯火同源', blurb: '凑齐任意一族的灯火共鸣。', embers: 40, group: '抉择与风险' },
  { id: 'resonance_pair', name: '双辉共鸣', blurb: '单局同时凑齐两族灯火共鸣。', embers: 90, group: '抉择与风险' },

  { id: 'codex50', name: '博物学者', blurb: '图鉴中记录 50 个条目。', embers: 80, group: '收集与档案' },
  { id: 'codex_all', name: '无所不窥', blurb: '把图鉴里的条目全部点亮。', embers: 200, group: '收集与档案' },
  { id: 'bounty_first', name: '赏金猎人', blurb: '完成第一次悬赏。', embers: 15, group: '收集与档案' },
  { id: 'bounty40', name: '赏金贯日', blurb: '累计完成 40 次悬赏。', embers: 80, group: '收集与档案' },
  { id: 'runs25', name: '长明不熄', blurb: '累计进行 25 局冒险。', embers: 60, group: '收集与档案' },
  { id: 'firemax', name: '添到顶', blurb: '把「薪火」里任意一条梯子烧到满级。', embers: 150, group: '收集与档案' },
  { id: 'fireall', name: '长夜不熄', blurb: '把「薪火」那三条梯子全部烧满。', embers: 260, group: '收集与档案' },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
