/**
 * 「深宵之约」——自己给自己加的难度（v79）。
 *
 * 为什么要有这一套：到 v78 为止，难度是三档（放松 / 标准 / 噩梦），而三档之间**只差倍数**——
 * 血量、伤害、数量、余烬，全是同一个数的放大镜。玩到熟了之后，"噩梦"只是"同一张题做久一点"，
 * 它不逼你换打法。而余烬这条线也一样：16 个节点买完之后，那个数就再没有出口了。
 *
 * 所以这一版加的是一套**规则**，不是一个第四档：开局前在灯火选择屏上勾一条或几条，
 * 每一条只改**一件事**，勾得越多越难、余烬也越多。它和"夜咒"是一对：
 * 夜咒是**关**自己带的（你只能接受），这一套是**你**自己选的（你可以随时不选）。
 *
 * 三条设计规矩（写下来是因为它们决定了下面每个数为什么是那个数）：
 *   · **每一条都"一直在咬"**：不接受"只在某种构筑下才生效"的条款——
 *     那种条款对另一部分玩家等于没加，和「拨芯那四件在没有拨芯的人手里是废牌」是同一个坑
 *     （见 README 的「已知取舍」）。所以这里没有"禁用复燃""不能重掷"这类只在
 *     有那个元进度时才有意义的条款，改的全是每一局、每一波都在发生的事；
 *   · **每一条只改一件事，而且改得出形状**：六条是最小气的那种"再多一点"（数量 / 血量 / 伤害 /
 *     油耗 / 视野 / 进油），最后一条改的是**节奏**（精英成群）——不只是"数值更大"；
 *   · **一条只值一份余烬**：回报不按"这条有多难"分别定价（那需要一套站不住的难度权重表），
 *     而是**每条一样 +15%**。理由是它要回答的问题只有一个："这一局你想背几条"，
 *     不是"哪一条最划算"——后者会把选择变成一道算术题，而前者的答案是玩家的胆量。
 *     而且它是**乘**在结算上的（和难度那一档、元进度那个数同一个位置），
 *     所以"7 条约"是 ×2.05 而不是别的什么数。
 */

/** 一条之约改的那些数。多条同时勾上时按下面 `pactMods` 的规矩合并。 */
export interface PactMods {
  /** 每波的敌人数量倍率（1 = 不变） */
  countMult: number;
  /** 敌人血量倍率 */
  hpMult: number;
  /** 敌人伤害倍率 */
  dmgMult: number;
  /** 灯油自然衰减倍率（1.4 = 烧快 40%） */
  oilDecayMult: number;
  /** 灯火半径倍率（0.88 = 暗一成二） */
  lightMult: number;
  /** 灯油那三条进项（掉落 / 擦身 / 灯台余温）的倍率 */
  oilIncomeMult: number;
  /** 每关那一次精英波**多**刷几只 */
  extraElites: number;
}

export interface PactDef {
  id: string;
  name: string;
  /** 一句话：这条之约是什么（选择屏上的那行字） */
  blurb: string;
  /** 更细的一句：它到底动了哪个数（构筑总览与图鉴里用） */
  detail: string;
  icon: string;
  color: string;
  mods: Partial<PactMods>;
}

/** 每一条之约值多少余烬（加在一起，乘在结算上）。 */
export const PACT_EMBER_EACH = 0.15;

export const PACTS: PactDef[] = [
  {
    id: 'dense',
    name: '来客更密',
    blurb: '每波的敌人数量 +25%',
    detail: '数量 +25%',
    icon: '🌒',
    color: '#8fa7ff',
    mods: { countMult: 1.25 },
  },
  {
    id: 'shell',
    name: '壳更硬',
    blurb: '敌人血量 +30%',
    detail: '血量 +30%',
    icon: '🪨',
    color: '#c9b48a',
    mods: { hpMult: 1.3 },
  },
  {
    id: 'claw',
    name: '爪更利',
    blurb: '敌人伤害 +25%',
    detail: '伤害 +25%',
    icon: '🩸',
    color: '#ff6a6a',
    mods: { dmgMult: 1.25 },
  },
  {
    id: 'thirsty',
    name: '灯烧得快',
    blurb: '灯油自然衰减 +40%',
    detail: '油耗 +40%',
    icon: '🫗',
    color: '#ffc46b',
    mods: { oilDecayMult: 1.4 },
  },
  {
    id: 'dim',
    name: '昏灯',
    blurb: '灯火半径 -12%',
    detail: '视野 -12%',
    icon: '🕯️',
    color: '#7f8bb0',
    mods: { lightMult: 0.88 },
  },
  {
    id: 'thin',
    name: '薄油',
    blurb: '击杀掉落 / 擦身 / 灯台的灯油 -25%',
    detail: '进油 -25%',
    icon: '🛢️',
    color: '#b9982e',
    mods: { oilIncomeMult: 0.75 },
  },
  {
    id: 'pack',
    name: '成群',
    blurb: '每关那一次精英波多来一位',
    detail: '精英 +1',
    icon: '👥',
    color: '#c084fc',
    mods: { extraElites: 1 },
  },
];

export const PACT_MAP: Record<string, PactDef> = Object.fromEntries(PACTS.map((p) => [p.id, p]));

/** 一条都没勾时的那份"什么都不改"——它同时也是测试用的基准。 */
export function noPacts(): PactMods {
  return { countMult: 1, hpMult: 1, dmgMult: 1, oilDecayMult: 1, lightMult: 1, oilIncomeMult: 1, extraElites: 0 };
}

/**
 * 把勾上的那几条合成一份修正。
 *
 * 合并规矩：六个倍率**相乘**（两条都改血量就是两次相乘，而不是取最大——它们本来就不是
 * 同一件事的强弱，是两笔独立的账），`extraElites` **相加**（多来一位就是多来一位）。
 * 认不出来的 id 直接跳过：选择屏是从 `PACTS` 画的，不会给出别的 id，
 * 而存档里的残留（比如以后删掉一条之约）不该让整局跑不起来。
 */
export function pactMods(ids: readonly string[]): PactMods {
  const out = noPacts();
  for (const id of ids) {
    const m = PACT_MAP[id]?.mods;
    if (!m) continue;
    out.countMult *= m.countMult ?? 1;
    out.hpMult *= m.hpMult ?? 1;
    out.dmgMult *= m.dmgMult ?? 1;
    out.oilDecayMult *= m.oilDecayMult ?? 1;
    out.lightMult *= m.lightMult ?? 1;
    out.oilIncomeMult *= m.oilIncomeMult ?? 1;
    out.extraElites += m.extraElites ?? 0;
  }
  return out;
}

/** 勾了 n 条之约，结算的余烬就是这么多倍。 */
export function pactEmberMult(ids: readonly string[]): number {
  const n = ids.filter((id) => !!PACT_MAP[id]).length;
  return 1 + PACT_EMBER_EACH * n;
}

/**
 * 「深宵之约」什么时候开：通关一次之后。
 *
 * 为什么要有这道门：它不是"更多内容"，是"自己给自己加难度"——第一次通关之前，
 * 玩家手里连一张完整的牌都还没打过，让他去勾"敌人 +25%"只会把这一局变成劝退。
 * 通关一次之后他知道了这游戏能打成什么样，这时候"你想背几条"才是一道有意思的题。
 *
 * 判据直接读 `records.clearedRuns`（生涯档案里早就有的那个数），不另存一个开关：
 * 多一个开关就多一条"它和那个数哪个才算数"的第二种真话，而且老存档（已经通关过的人）
 * 会自动拿到这一套，不用等他们再打一次。
 */
export function pactsUnlocked(clearedRuns: number): boolean {
  return clearedRuns >= 1;
}
