import { Pool } from '../../core/Pool';
import { ENEMY_MAP } from '../../data/enemies';
import { HUNT } from '../../data/hunt';
import type { EnemyDef } from '../../types';
import { drawEnemy } from './EnemyArt';
import { slideStep, wallBetween } from '../../systems/CollisionSystem';
import type { Rect } from '../../systems/LevelGen';

/**
 * 冲刺撞在墙上之后，那只怪在原地发呆多久（秒）。
 *
 * 这一个数就是「墙从障碍变成掩体」的全部：刺脊的预警线画出来之后，把那次冲锋骗到墙面上，
 * 换来的就是这一段。它必须长到够你转身走两步、或者把一发重武器打完，又必须短到不会让
 * 每一面墙都变成一台刷怪机——刺脊自己的一次出手周期是 0.6s 蓄力 + 2.3s 冷却 = 2.9s，
 * 撞一次墙发呆 0.55s，等于它每次撞墙白丢自己五分之一的出手机会。
 */
const WALL_BASH_STUN = 0.55;

/**
 * 贴着墙磨了这么久还没挪窝就算"卡死"，下帧换个方向重来（秒）。
 * 只有凹角 / 太窄的缝才会走到这一步——它是兜底，不是常规路径。
 */
const WALL_STUCK_SPAN = 0.8;

/**
 * 离开所有墙多久之后才算"这一轮绕行结束了"（秒）。
 *
 * 绕过凸角的那一两帧本来就不碰墙（圆心刚过角点、切向还在往外走，0.03s 量级），
 * 一离开就清记忆的话，下一帧蹭回墙面上会被当成"新的一轮绕行"，重新按"玩家在哪边"选一次方向——
 * 于是它转身沿着刚走完的那面墙原路折返回去。所以这一轮绕行**按时间**收尾：0.5 秒自由行走
 * （影蛭 68px/s 已经是 34px 的直线距离，比绕角那一下宽两个数量级）足够走过这段缝，
 * 又不至于让它绕完一面墙走出老远还记着上一次的方向。
 */
const WALL_MEM_SPAN = 0.5;

/**
 * 正对着墙面撞上来的时候（切向点积 ≈ 0），左右两边"离玩家的方位"一样远——这时候绕**近的那一头**。
 *
 * 原先这里按 `e.id` 的奇偶掷硬币。它的问题不是"随机"（掷出来是多少，同一只怪这一辈子都是那个数），
 * 而是掷出来的那个数跟"哪一头近"没有任何关系：台架 `tools/bench-wall.mjs --only=wide` 那一栏
 * （1200px 的墙、撞点离右端 100px、4 颗种子 × 4 只怪）量出来——改前最后一只 39.9s，
 * 改后 14.3s（首只都是 10.3s）。窄墙上两头一样近，两者没区别；宽墙上差一个数量级。
 *
 * 输入是**切向的正方向**（法线转 90°），返回 `+1 / −1`：谁的投影更近就归谁。
 */
function nearerEnd(wall: Rect | null, x: number, y: number, tx: number, ty: number): number {
  if (!wall) return 1;
  let plus = 0;
  let minus = 0;
  for (const cx of [wall.x, wall.x + wall.w]) {
    for (const cy of [wall.y, wall.y + wall.h]) {
      const p = (cx - x) * tx + (cy - y) * ty;
      if (p > plus) plus = p;
      if (-p > minus) minus = -p;
    }
  }
  return plus <= minus ? 1 : -1;
}

export interface Enemy {
  active: boolean;
  id: number;
  defId: string;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  xp: number;
  oil: number;
  color: string;
  elite: boolean;
  boss: boolean;
  phase: number;
  burn: number;
  burnTimer: number;
  /**
   * 身上这层火烧**是谁点的**（武器 id / 'nova' / 'lantern' …）。
   * 只用来记「本局伤害构成」——灼烧的伤害不是 `applyHit` 那一瞬间打出去的，
   * 而是接下来三秒里每帧从 `EnemySystem` 里扣的，那条路上没有"谁打的"这个信息，
   * 所以点火的这一下得把它记在怪身上。多个来源轮流点火时记的是**最后一次**点的那个
   * （常见构筑里只有一件武器带火，这条规则就够用；写死了反而更难解释）。
   */
  burnSource: string | null;
  slowTimer: number;
  /**
   * 「标灯」（遗物，v78）：被旋灯拽住的这几只"被照出来了"，剩下的时间里它们受到的**所有**
   * 打出去的伤害都多一份（倍率在 `Game.applyHit` 里读，强度在 `player.flags.vortexMark` 上）。
   * 它和减速一样是**每帧续的**状态：在圈里就一直亮着，出圈之后再留 `VORTEX.markSpan` 秒——
   * 所以它记住的是"刚才被拢过"，而不是"此刻在圈里"（玩家补的那一下正好落在收网之后）。
   */
  vortexMark: number;
  /** 当前减速的强度（0.5 = 移速砍一半）。多条线都能减速，合并规矩见 `applySlow` */
  slowFactor: number;
  hitFlash: number;
  attackCd: number;
  /** 首领专属招式的独立计时器（不和行为共用，免得贴脸时放不出招牌技） */
  bossCd: number;
  stateTimer: number;
  spawnTimer: number;
  wobble: number;
  angle: number;
  dashVx: number;
  dashVy: number;
  dashing: number;
  scale: number;
  dr: number;
  affix: string | null;
  /** 来自「引灯」/「疾风」光环的速度倍率，每帧重算 */
  buff: number;
  /** 掠影记账：这只怪下一次能记「掠影」还要等多久（同一只怪不许每帧都算一次） */
  grazeCd: number;
  /**
   * 「循灯」：收尾阶段（一波刷完、场上只剩最后几只）还没到场的那几只直奔玩家。
   * 见 `data/hunt.ts`——`hunt` 是"这一帧吃不吃这条规则"，`huntSpeed` 是按距离算出来的脚力倍率
   * （1 = 到场了，不再加速）。
   */
  hunt: boolean;
  huntSpeed: number;
  /**
   * 撞上墙之后打算**从哪一侧绕过去**（+1 / −1，0 = 这一轮绕行已经结束）。
   *
   * 一次选定就绕到底，中途不改主意（见 `moveWithWalls`）——每帧重算的话，
   * 目标正对着墙面的时候点积会正负翻转，怪就在墙面中间左右横跳，永远走不到拐角。
   */
  wallSide: number;
  /** 离墙之后过了多久（秒，见 `WALL_MEM_SPAN`）：它决定 `wallSide` 什么时候作废。 */
  wallGapT: number;
  /**
   * 冲刺撞在墙上之后剩下的发呆时间（秒）。大于 0 时它既不动也不出手——
   * 这是玩家把冲锋骗进墙里换来的那段空档，也是"墙是掩体"这句话唯一能被兑现的地方。
   */
  wallStun: number;
  /**
   * 贴着墙磨了多久还没挪窝（秒，见 `moveWithWalls`）：用来判"真的卡死了吗"。
   * 不挪窝不是"速度慢"——贴着墙面滑的时候它仍然是满速的，只有两边都堵住才会动不了。
   */
  wallStuckT: number;
  /**
   * 掠影记账：这只怪**已经贴着玩家多久了**（连续待在掠影带里的秒数）。
   * 「掠影」是擦身而过，不是搂着不放——同一只怪贴久了贡献会一路衰减到 0
   * （见 Game.resolveGraze），不然"绕着最慢的那只怪转圈"就能一直刷。
   */
  grazeHold: number;
}

export interface LightCtx {
  px: number;
  py: number;
  lightRadius: number;
}

export interface EnemyContext {
  px: number;
  py: number;
  lightRadius: number;
  time: number;
  burnDps: number;
  visionUpgrade: number;
  damagePlayer: (amount: number, x: number, y: number, drain?: number, source?: string) => void;
  shoot: (
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: string,
    enemy: boolean,
    owner?: string,
  ) => void;
  addLight: (x: number, y: number, r: number, intensity: number) => void;
  burst: (x: number, y: number, count: number, color: string, opts?: { speed?: number; size?: number; life?: number }) => void;
  onDeath: (e: Enemy) => void;
  /**
   * 灼烧每帧扣掉的那一点伤害（见 `Enemy.burnSource`）。
   * 报告的是**名义值**（和 `applyHit` 记账用的是同一个口径，不按剩余血量截断）。
   */
  onBurn?: (amount: number, source: string | null) => void;
  snuffLight: (amount: number) => void;
  spawnAdd: (defId: string, x: number, y: number) => void;
  ignitGround: (x: number, y: number) => void;
  /** 在战场上留下一片「滞行雾」（织雾者） */
  fog: (x: number, y: number, r: number) => void;
  /**
   * 最近的、还亮着的灯台，或者玩家放下的那盏弃灯（吹灯客的目标）；没有就返回 null。
   * 弃灯也算在内：那盏小灯更脆，一口气就能吹灭。
   */
  pyreTarget: (x: number, y: number) => { x: number; y: number } | null;
  /**
   * 「分灯」放下的那盏弃灯（附近没有就返回 null）：黑暗会被它引走。
   * 只有本来就在追你的那些行为会跟过去——吹灯客（有自己的目标）与
   * 回响（追的是你一秒前站的地方）不在此列，这两种怪的性格才不会被抹平。
   */
  lureTarget?: (x: number, y: number) => { x: number; y: number } | null;
  /**
   * 地上亮着的伏灯（最近的，超过 maxDist 返回 null）。**只有灯蛾认这个**：
   * 「它们扑的是光，不是你」——你埋的那颗雷本来就是一盏灯，蛾拐过去扑它，然后自己踩响。
   * 别的行为不接这条线：不然地上摆一片雷就成了"把全场引开"的万能开关。
   */
  mineLure?: (x: number, y: number) => { x: number; y: number } | null;
  /**
   * 「旋灯」的吸力：在怪把速度积分成位移**之前**调一下，让它自己往里挪。
   * 钩子挂在这一步而不是"每帧直接掰位置"，是为了让吸力真的和怪自己的速度打架——
   * 疾影挣得出去、石守被拖着走，都发生在这一行上。
   *
   * 注意它拿到的是"往 vx/vy 上加一个速度"，不接 dt：这一帧的位移是 `vx * dt`，
   * 帧率换算在那儿做，这里再乘一次 dt 就成了"掉帧时拽得更狠"。
   */
  pull?: (e: Enemy) => void;
  /** 站在灯台边把灯焰抽掉一点（吹灯客） */
  quench: (x: number, y: number, dt: number) => void;
  /**
   * 场上的墙（`level.walls`）。到 v83 为止怪的位移从来没有问过墙——只有玩家走 `collideWalls`，
   * 怪是直接穿墙走过来的。空数组 = 这一局没有墙可撞，movement 就退回老样子那两行裸加法。
   */
  walls?: readonly Rect[];
  /** 冲刺一头撞在墙上那一下（音频 / 屏震用；离线台架里可以不接） */
  bash?: () => void;
  /** 夜咒「低语」：敌人每秒回复的最大生命比例 */
  regen: number;
  /**
   * 「循灯」窗口开没开（收尾阶段只剩最后几只）：开了的话，还没到场的怪一律直奔玩家。
   * 由 Director 判定（"这一波是不是已经结束了"是它的事），这里只管执行。
   */
  hunt?: boolean;
  spikes: (x: number, y: number, r: number) => void;
  shake: (amount: number) => void;
}

// ⚠ 这里原来抄了一份 `MINE_LURE = 380`（"蛾能从多远闻到地上那盏灯"）。v77 把它删掉了：
//   那一份是**第二处**真话，而「香饵」（遗物）要改的正是这个数——两处只要有一处没跟上，
//   就会出现"店里写着引得更远、实际上一只蛾都没多引来"这种谁也看不出来的错。
//   现在这个数只有 data/mines.ts 里的 `lure` 一份，加成由 Game 在那一次调用里算好传进来。

/**
 * 给一只怪挂上减速——**所有**减速都从这里过（v75）。
 *
 * 能减速的线不止一条：霜棱 / 霜印那一路是固定的 0.5 倍，燎灯的「烟熏」是 -22%（0.78 倍）。
 * 规矩是**谁更狠听谁的**：已经慢着的时候不许被一个更弱的减速"顶回快的"，
 * 但时长取长的那个（新的那一路就算更弱，它也续上了自己该续的那一段）。
 *
 * 为什么把它抽成一个函数：这条规矩原来是**手写两遍**的（`Game.applyHit` 里一遍、
 * 燎灯那一拍里一遍）。两遍的写法只要有一遍写漏了 `Math.min`，在界面上完全看不出来——
 * 玩家只会觉得"这件遗物怎么有时候不灵"。而那句"我们其实写了两遍"正是这种错最爱藏的地方。
 */
export function applySlow(e: Enemy, span: number, power: number): void {
  e.slowFactor = e.slowTimer > 0 ? Math.min(e.slowFactor, power) : power;
  e.slowTimer = Math.max(e.slowTimer, span);
}

export class EnemySystem {
  private nextId = 1;
  private ctxRef: EnemyContext | null = null;
  /** 玩家最近几秒的轨迹：给「回响」用的"你一秒前站的地方" */
  private trail: { x: number; y: number; t: number }[] = [];
  private clock = 0;
  private pool = new Pool<Enemy>(() => ({
    active: false,
    id: 0,
    defId: 'shade',
    def: ENEMY_MAP.shade,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    radius: 12,
    speed: 60,
    damage: 8,
    xp: 3,
    oil: 4,
    color: '#fff',
    elite: false,
    boss: false,
    phase: 1,
    burn: 0,
    burnTimer: 0,
    burnSource: null,
    slowTimer: 0,
    slowFactor: 0.5,
    vortexMark: 0,
    hitFlash: 0,
    attackCd: 0,
    bossCd: 0,
    stateTimer: 0,
    spawnTimer: 0,
    wobble: 0,
    angle: 0,
    dashVx: 0,
    dashVy: 0,
    dashing: 0,
    scale: 1,
    dr: 0,
    affix: null,
    buff: 1,
    hunt: false,
    huntSpeed: 1,
    grazeCd: 0,
    grazeHold: 0,
    wallSide: 0,
    wallGapT: 0,
    wallStun: 0,
    wallStuckT: 0,
  }), 256);

  spawn(defId: string, x: number, y: number, hpMult: number, damageMult: number): Enemy {
    const def = ENEMY_MAP[defId] ?? ENEMY_MAP.shade;
    const e = this.pool.acquire();
    e.id = this.nextId++;
    // 认不出来的 id 一律按兜底那一种来：defId 也要跟着改成**解析后**的 id，
    // 否则这只怪活着的时候像 shade，死的时候 `ENEMY_MAP[e.defId].color` 会当场炸掉
    // （数据表里写错一个字，一局打到它死才崩，最难查）。
    e.defId = def.id;
    e.def = def;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = def.hp * hpMult;
    e.hp = e.maxHp;
    e.radius = def.radius;
    e.speed = def.speed;
    e.damage = def.damage * damageMult;
    e.xp = def.xp;
    e.oil = def.oil;
    e.color = def.color;
    e.elite = !!def.elite;
    e.boss = !!def.boss;
    e.phase = 1;
    e.burn = 0;
    e.burnTimer = 0;
    e.burnSource = null;
    e.slowTimer = 0;
    e.slowFactor = 0.5;
    e.vortexMark = 0;
    e.hitFlash = 0;
    e.attackCd = 1;
    e.bossCd = 1.4;
    e.stateTimer = 0;
    e.spawnTimer = 0.4;
    e.wobble = Math.random() * Math.PI * 2;
    e.angle = 0;
    e.dashVx = 0;
    e.dashVy = 0;
    e.dashing = 0;
    e.scale = def.boss ? 1 : def.elite ? 1 : 1;
    e.dr = 0;
    e.affix = null;
    e.buff = 1;
    e.hunt = false;
    e.huntSpeed = 1;
    e.grazeCd = 0;
    e.grazeHold = 0;
    e.wallSide = 0;
    e.wallGapT = 0;
    e.wallStun = 0;
    e.wallStuckT = 0;
    return e;
  }

  private isLit(e: Enemy, lc: LightCtx): boolean {
    const dx = e.x - lc.px;
    const dy = e.y - lc.py;
    return dx * dx + dy * dy <= lc.lightRadius * lc.lightRadius;
  }

  isVulnerable(e: Enemy, lc: LightCtx): boolean {
    if (!e.active) return false;
    return !(e.def.requiresLight && !this.isLit(e, lc));
  }

  damage(e: Enemy, amount: number, lc: LightCtx, knockX = 0, knockY = 0, knockback = 0): boolean {
    if (!e.active) return false;
    if (e.def.requiresLight && !this.isLit(e, lc)) {
      return false;
    }
    e.hp -= amount;
    e.hitFlash = 0.12;
    if (knockback > 0) {
      const d = Math.hypot(knockX, knockY) || 1;
      e.vx += (knockX / d) * knockback;
      e.vy += (knockY / d) * knockback;
    }
    if (e.hp <= 0) {
      this.ctxRef?.onDeath(e);
      e.active = false;
      return true;
    }
    return false;
  }

  /**
   * 点一把火（或者往已经烧着的那把上再添一层）。
   *
   * `source` 是**记名**用的：这一局结算时那张「本局伤害构成」要知道这口火是谁点的，
   * 而灼烧是按 0.25 秒一跳、跳在**怪身上**（见 update 里 `ctx.onBurn`）——它跟"命中那一瞬间"
   * 完全脱钩，所以点火的人得在点的时候抄在怪身上。
   *
   * 规则是**"谁最后点的，这一跳就算谁的"**：同一只怪身上的火常被好几件武器轮流续过
   * （烈焰鞭点着、倾灯往上倒油、遗物再添一层），层数只有一个总数（`e.burn`），
   * 要逐层记来源就得在每只怪身上挂一摞小账，而收益只是把"三层里的那一层"换个名字。
   * 传 `null` 表示不记名（那一跳会落进结算表的兜底「其他」栏）。
   */
  applyBurn(e: Enemy, stacks: number, source: string | null = null): void {
    e.burn = Math.min(12, e.burn + stacks);
    e.burnTimer = 3;
    // 只有报了名才覆盖：续火的是"不记名"的那种（比如环境本身），不该把点火的人顶掉
    if (source) e.burnSource = source;
  }

  /** 取 delay 秒前的玩家位置（轨迹不足时返回 null）。 */
  private trailAt(delay: number): { x: number; y: number } | null {
    const target = this.clock - delay;
    let best: { x: number; y: number; t: number } | null = null;
    for (let i = this.trail.length - 1; i >= 0; i -= 1) {
      const s = this.trail[i];
      if (s.t <= target) {
        best = s;
        break;
      }
    }
    if (!best) return null;
    if (this.clock - best.t > delay * 2.2 + 0.6) return null;
    return { x: best.x, y: best.y };
  }

  update(dt: number, ctx: EnemyContext): void {
    this.ctxRef = ctx;
    this.clock += dt;
    this.trail.push({ x: ctx.px, y: ctx.py, t: this.clock });
    if (this.trail.length > 360) this.trail.splice(0, this.trail.length - 360);
    // 引灯 / 疾风光环：每帧重算，让"优先击杀辅助怪"成为有意义的决策
    for (const e of this.pool.all) if (e.active) e.buff = 1;
    for (const e of this.pool.all) {
      if (!e.active) continue;
      const aura = e.defId === 'beacon' ? 210 : e.affix === 'haste' ? 165 : 0;
      if (aura <= 0) continue;
      const rr2 = aura * aura;
      for (const o of this.pool.all) {
        if (!o.active || o === e) continue;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= rr2) o.buff = Math.max(o.buff, 1.35);
      }
    }
    // 「蚀油」：贴着你时持续抽走灯油，逼你拉开距离
    for (const e of this.pool.all) {
      if (!e.active || e.affix !== 'sappers') continue;
      const dx = ctx.px - e.x;
      const dy = ctx.py - e.y;
      if (dx * dx + dy * dy > 150 * 150) continue;
      ctx.snuffLight(dt * 0.02);
      if (Math.random() < dt * 5) ctx.burst(ctx.px, ctx.py, 1, '#c98fe8', { speed: 46, size: 2, life: 0.45 });
    }
    for (const e of this.pool.all) {
      if (!e.active) continue;
      e.wobble += dt * 4;
      if (e.spawnTimer > 0) e.spawnTimer -= dt;
      if (ctx.regen > 0 && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ctx.regen * dt);
        if (Math.random() < dt * 1.5) ctx.burst(e.x, e.y, 1, '#8affc1', { speed: 24, size: 2, life: 0.4 });
      }
      if (e.affix === 'regen' && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
        if (Math.random() < dt * 2) ctx.burst(e.x, e.y, 1, '#8affc1', { speed: 30, size: 2, life: 0.4 });
      }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;
      if (e.vortexMark > 0) e.vortexMark -= dt;
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        const burnDmg = ctx.burnDps * e.burn * dt;
        e.hp -= burnDmg;
        // 灼烧也得算进「本局伤害构成」：不报的话，倾灯 / 带火的构筑会显示成"几乎没打伤害"
        // （倒在地上的那片油火本身只有 `dps = 0`，它全部的伤害都是从这里一帧一帧扣出来的）。
        ctx.onBurn?.(burnDmg, e.burnSource);
        if (Math.random() < dt * 6) ctx.burst(e.x, e.y, 1, '#ff7a2f', { speed: 40, size: 2, life: 0.3 });
        if (e.burnTimer <= 0) e.burn = 0;
        if (e.hp <= 0) {
          ctx.onDeath(e);
          e.active = false;
          continue;
        }
      }
      if (e.dashing > 0) {
        e.dashing -= dt;
        // 冲刺也走"会撞墙"的那一步：一头撞进墙里就是自己把这次出手撞掉了
        const bash = this.moveWithWalls(e, e.dashVx * dt, e.dashVy * dt, dt, ctx);
        if (bash) {
          e.dashing = 0;
          e.dashVx = 0;
          e.dashVy = 0;
          e.wallStun = WALL_BASH_STUN;
          // 得看得见、听得见：一道灰白的尘 + 一记闷响 + 一点点屏震（就一点点，
          // 它每 2.9 秒就可能撞一次，震大了一局下来屏幕会一直抖）
          ctx.burst(e.x, e.y, 10, '#cbd4e8', { speed: 130, size: 3, life: 0.5 });
          ctx.shake(0.16);
          ctx.bash?.();
        }
        e.dashVx *= 1 - Math.min(1, 3 * dt);
        e.dashVy *= 1 - Math.min(1, 3 * dt);
        const dx = ctx.px - e.x;
        const dy = ctx.py - e.y;
        if (dx * dx + dy * dy < (e.radius + 16) ** 2) {
          ctx.damagePlayer(e.damage, e.x, e.y, 0, e.defId);
          e.dashing = 0;
        }
        continue;
      }

      const slow = e.slowTimer > 0 ? e.slowFactor : 1;
      if (e.wallStun > 0) {
        // 撞晕：这一小段里它既不走也不出手（`behave` 整段跳过）——但身上的火照烧、
        // 减速 / 标灯的计时照走，因为那些是**别人**记在它身上的账，不该被它自己撞了一下就免掉。
        // 唯一没被跳过的是"贴身那一口"：它还是一具身体（见 `contactDamage`）。
        e.wallStun -= dt;
        e.vx *= 1 - Math.min(1, 8 * dt);
        e.vy *= 1 - Math.min(1, 8 * dt);
        this.contactDamage(e, ctx);
      } else {
        this.behave(e, dt, ctx, slow);
      }
      if (e.boss) this.bossAura(e, dt, ctx);
    }
  }

  private behave(e: Enemy, dt: number, ctx: EnemyContext, slow: number): void {
    // 地上有灯的话，"追谁"这件事整个换一个人：移动与射程都以那盏灯为准。
    // 两个例外：吹灯客有自己的目标（灯台 / 弃灯），回响追的是你过去的脚印。
    const behavior = e.def.behavior;
    // 「循灯」（data/hunt.ts）：收尾阶段还没到场的这几只不理那些枝杈了——地上的灯不看了、
    // 灯台不吹了，直奔玩家。正在打的那一波里 ctx.hunt 是 false，性格一点没动。
    const hunt = !!ctx.hunt;
    const lure =
      hunt || behavior === 'quench' || behavior === 'echo' ? null : (ctx.lureTarget?.(e.x, e.y) ?? null);
    const tx = lure ? lure.x : ctx.px;
    const ty = lure ? lure.y : ctx.py;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    e.angle = Math.atan2(dy, dx);
    // 有几个行为是"朝你开火 / 抽你的油"：它们仍旧认你，只是被灯牵着走
    const pdx = ctx.px - e.x;
    const pdy = ctx.py - e.y;
    const playerDist = lure ? Math.hypot(pdx, pdy) || 1 : d;
    const lit = this.isLit(e, ctx);
    let speedMul = slow * e.buff;
    // 循灯：离得越远脚力越足，但**绝对速度不超过 HUNT.ceiling**——"永远追不上走路的你"
    // 是这一条的恒等式（不然就成了"跑不掉"，而不是"不用回头去捡"）。
    e.hunt = hunt;
    e.huntSpeed = 1;
    if (hunt) {
      const want = Math.min(e.speed * (1 + (playerDist - HUNT.near) / HUNT.span), HUNT.ceiling);
      // ⚠ `e.speed` 有可能是 0（台架里那种"站着不动的假人"）：`0 / 0` 是 NaN，
      // 而 NaN 一旦落到速度上，这只怪的坐标会在**同一帧**变成 NaN，接着它的每一处几何判断
      // （掠影的距离、接触判定）都跟着是 NaN——掠影那条账会被一帧污染成 NaN 一直挂到结算上。
      // 速度本来就是 0 的怪不该被"循灯"催着走，保持 1（不加速）就是它该有的样子。
      e.huntSpeed = e.speed > 0 ? Math.max(1, Math.min(HUNT.mult, want / e.speed)) : 1;
      speedMul *= e.huntSpeed;
      // 只有真的在"赶路"的那几只冒火星：玩家得看得出它为什么突然快起来了
      if (e.huntSpeed > 1.001 && Math.random() < dt * 6) {
        ctx.burst(e.x, e.y, 1, '#ffb15e', { speed: 40, size: 2.2, life: 0.4 });
      }
    }
    if (e.def.lightShy && lit) speedMul *= 0.55;
    if (e.def.requiresLight && !lit && ctx.visionUpgrade <= 0) speedMul *= 1.6;

    switch (e.def.behavior) {
      case 'chase': {
        const strafe = Math.sin(e.wobble * 0.6) * 0.25;
        e.vx = (nx - ny * strafe) * e.speed * speedMul;
        e.vy = (ny + nx * strafe) * e.speed * speedMul;
        break;
      }
      case 'dash': {
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 340) {
          e.dashing = 0.28;
          e.dashVx = nx * e.speed * 6.5;
          e.dashVy = ny * e.speed * 6.5;
          e.attackCd = 2.4;
          ctx.burst(e.x, e.y, 4, e.color, { speed: 80 });
        } else {
          e.vx = nx * e.speed * 0.5 * speedMul;
          e.vy = ny * e.speed * 0.5 * speedMul;
        }
        break;
      }
      case 'ranged': {
        // 「看不见你就不吊着了」（v90）：到 v89 为止这一条只认**距离**——你躲到墙后面、
        // 它恰好落在"保持距离"那一档里（180~260px），它就站在那儿把一梭子一梭子全打在墙面上
        // （子弹进墙就死），一局都不挪窝：数据里那句"**逼你离开掩体**"在墙做实之后（v84）就走不通了。
        // 现在看不见你的时候 `keep` 归零、也不开枪：它得先压过来（路上靠 v84 那套沿墙滑绕过去），
        // 绕到看得见你，再开始吐糜液。墙拿的是 `ctx.walls`——和"能不能走过去"是同一堵墙，
        // 所以 `bench-wall --nocollide` 那套对照会连着这一条一起关掉（对照才还在同一件事上）。
        const walls = ctx.walls;
        const blind = walls && walls.length > 0 ? wallBetween(e.x, e.y, ctx.px, ctx.py, walls) : false;
        // 循灯的时候不再保持距离：这一波已经结束了，还吊在中距离就只是让人多走一趟
        const keep = hunt || blind ? 0 : 220;
        const dir = d > keep + 40 ? 1 : d < keep - 40 ? -1 : 0;
        e.vx = nx * e.speed * speedMul * dir;
        e.vy = ny * e.speed * speedMul * dir;
        e.attackCd -= dt;
        if (e.attackCd <= 0 && playerDist < 520 && !blind) {
          e.attackCd = 2.1;
          ctx.shoot(e.x, e.y, Math.atan2(pdy, pdx), 250, e.damage, '#c9a3ff', true, e.defId);
        }
        break;
      }
      case 'dive': {
        // 蛾扑的是光：地上那盏灯比"当前目标"更近，就先扑灯（多半就踩响在它身上）。
        // 这一条只在蛾身上接：别的怪不会因为地上摆了雷就集体改道。
        const lamp = ctx.mineLure?.(e.x, e.y) ?? null;
        if (lamp) {
          const lx = lamp.x - e.x;
          const ly = lamp.y - e.y;
          const ld = Math.hypot(lx, ly) || 1;
          if (ld < d) {
            e.angle = Math.atan2(ly, lx);
            e.vx = (lx / ld) * e.speed * speedMul;
            e.vy = (ly / ld) * e.speed * speedMul;
            break;
          }
        }
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        break;
      }
      case 'charge': {
        e.attackCd -= dt;
        if (e.stateTimer > 0) {
          // 蓄力：几乎停住并锁定方向，给玩家闪避的窗口
          e.stateTimer -= dt;
          e.vx *= 1 - Math.min(1, 7 * dt);
          e.vy *= 1 - Math.min(1, 7 * dt);
          if (e.stateTimer <= 0) {
            e.dashing = 0.24;
            e.dashVx = nx * e.speed * 8;
            e.dashVy = ny * e.speed * 8;
            ctx.burst(e.x, e.y, 6, e.color, { speed: 120 });
          }
        } else {
          e.vx = nx * e.speed * 0.5 * speedMul;
          e.vy = ny * e.speed * 0.5 * speedMul;
          if (e.attackCd <= 0 && d < 340) {
            e.stateTimer = 0.6;
            e.attackCd = 2.3;
            ctx.burst(e.x, e.y, 4, '#ffd24e', { speed: 60, size: 2, life: 0.4 });
          }
        }
        break;
      }
      case 'echo': {
        // 追的是"你一秒前站的地方"，而不是你本人——所以直线逃会被抄近路
        const past = this.trailAt(e.def.trailDelay ?? 1);
        const tx = past ? past.x : ctx.px;
        const ty = past ? past.y : ctx.py;
        const ex = tx - e.x;
        const ey = ty - e.y;
        const ed = Math.hypot(ex, ey) || 1;
        const ux = ex / ed;
        const uy = ey / ed;
        const drift = Math.sin(e.wobble * 0.9) * 0.18;
        e.vx = (ux - uy * drift) * e.speed * speedMul;
        e.vy = (uy + ux * drift) * e.speed * speedMul;
        e.angle = Math.atan2(ey, ex);
        if (Math.random() < dt * 3) ctx.burst(e.x, e.y, 1, '#9fd8ff', { speed: 22, size: 2, life: 0.5 });
        break;
      }
      case 'weaver': {
        // 缓慢逼近，边走边在脚下织出滞行雾
        e.vx = nx * e.speed * speedMul * 0.7;
        e.vy = ny * e.speed * speedMul * 0.7;
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 640) {
          e.attackCd = 3.6;
          ctx.fog(e.x, e.y, 134);
          ctx.burst(e.x, e.y, 12, '#9fb7c9', { speed: 64, size: 4, life: 0.7 });
        }
        break;
      }
      case 'siphon': {
        // 吊在中距离持续抽灯油：站着不动只会越来越黑（循灯时同样不再吊着）
        const keep = hunt ? 0 : 300;
        const dir = d > keep + 30 ? 1 : d < keep - 30 ? -1 : 0;
        e.vx = nx * e.speed * speedMul * dir;
        e.vy = ny * e.speed * speedMul * dir;
        if (playerDist < 460) {
          ctx.snuffLight(dt * 0.025);
          if (Math.random() < dt * 8) ctx.burst(e.x, e.y, 1, '#c98fe8', { speed: 30, size: 2, life: 0.5 });
        }
        break;
      }
      case 'beacon': {
        e.vx = nx * e.speed * speedMul * 0.8;
        e.vy = ny * e.speed * speedMul * 0.8;
        ctx.addLight(e.x, e.y, 150 + Math.sin(e.wobble) * 14, 0.6);
        if (Math.random() < dt * 3) ctx.burst(e.x, e.y, 1, '#ffe9a8', { speed: 40, size: 2, life: 0.5 });
        break;
      }
      case 'tank': {
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        break;
      }
      case 'drain': {
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        break;
      }
      case 'quench': {
        // 它不管你，只管你点亮的灯台：扑上去把灯焰一点点吹灭
        // （循灯时没有灯台了：这一波只剩它一个，它就是那个"该收掉的东西"）
        const pyre = hunt ? null : ctx.pyreTarget(e.x, e.y);
        if (pyre) {
          const tx = pyre.x - e.x;
          const ty = pyre.y - e.y;
          const tr = Math.hypot(tx, ty) || 1;
          e.angle = Math.atan2(ty, tx);
          if (tr > 52) {
            e.vx = (tx / tr) * e.speed * speedMul;
            e.vy = (ty / tr) * e.speed * speedMul;
          } else {
            e.vx *= 0.2;
            e.vy *= 0.2;
            ctx.quench(e.x, e.y, dt);
            if (Math.random() < dt * 6) ctx.burst(e.x, e.y - 12, 1, '#b6a6ff', { speed: 40, size: 2, life: 0.5 });
          }
        } else {
          // 没有灯可吹，就退化成普通的追击
          const strafe = Math.sin(e.wobble * 0.6) * 0.22;
          e.vx = (nx - ny * strafe) * e.speed * speedMul;
          e.vy = (ny + nx * strafe) * e.speed * speedMul;
        }
        break;
      }
      case 'bomber': {
        if (e.stateTimer > 0) {
          e.stateTimer -= dt;
          e.vx = 0;
          e.vy = 0;
          if (e.stateTimer <= 0) {
            const blast = 118;
            ctx.burst(e.x, e.y, 26, '#ff9d2e', { speed: 280, size: 4, life: 0.6 });
            ctx.addLight(e.x, e.y, 240, 1);
            ctx.shake(0.45);
            if (Math.hypot(e.x - ctx.px, e.y - ctx.py) <= blast) ctx.damagePlayer(e.damage, e.x, e.y, 0, e.defId);
            e.active = false;
            return;
          }
        } else if (d < 92 + e.radius) {
          e.stateTimer = 1.1;
          e.vx = 0;
          e.vy = 0;
        } else {
          e.vx = nx * e.speed * speedMul;
          e.vy = ny * e.speed * speedMul;
        }
        break;
      }
      default:
        break;
    }

    ctx.pull?.(e);

    // 这一步是怪**唯一**的位移入口（冲刺那条走的是同一个函数）。见 `moveWithWalls`：
    // 到 v83 为止这里只有两行裸加法，怪是直接穿过墙走过来的。
    this.moveWithWalls(e, e.vx * dt, e.vy * dt, dt, ctx);

    this.contactDamage(e, ctx);
  }

  /**
   * 贴到玩家身上那一口。
   *
   * 抽出来是因为它有**两条**调用路径：寻常那一帧在 `behave` 的最后一步，撞晕（`wallStun`）那一帧
   * 走的是 update 里另一条分支。发呆归发呆，它还是**一具身体**——站在一只撞晕的刺脊怀里
   * 照样该挨咬，不然"把冲锋骗进墙里，再站上去白打"就成了一套免费的点数。
   *
   * ⚠ 判据用的是**到你**的距离，不是"这一帧它在往哪儿走"。`behave` 里那个 `d` 是"离这一帧的目标"
   *（地上有弃灯时，它的目标是那盏灯）：拿它当接触距离的话，地上摆一盏灯之后，**贴在你身上**的怪
   * 反倒不咬了（它离灯远）——同一个 `d` 在两条线上是两个意思，这种错在画面上完全看不出来。
   */
  private contactDamage(e: Enemy, ctx: EnemyContext): void {
    if (e.def.behavior === 'bomber') return;
    const dx = ctx.px - e.x;
    const dy = ctx.py - e.y;
    if (dx * dx + dy * dy >= (e.radius + 16) ** 2) return;
    const drain = e.def.behavior === 'drain' ? 22 : e.affix === 'thorn' ? 9 : 0;
    ctx.damagePlayer(e.damage, e.x, e.y, drain, e.defId);
  }

  /**
   * 把这一帧的位移积分进坐标里，撞上墙就**贴着墙面滑**。返回被推开的那一侧法线（没撞墙是 null）。
   *
   * 为什么不能只是"推出去"：正对着墙面撞的那一帧，推出去等于原地不动——怪会永远贴在墙上
   * （玩家蹲在墙背面就成了白嫖）。所以撞上之后沿墙面滑一步：法线转 90° 就是切向，
   * 切向的速度大小仍然是它自己该有的速度（"撞墙不掉速，只是要绕远路"）。
   *
   * 两边选哪一边，规矩是**一次选定就绕到底**（`wallSide`，直到不再撞墙为止）。
   * 这一条是被逼出来的：切向和"目标方向"做点积、每帧重算的话，怪贴在 400px 宽的墙面中间、
   * 目标正对着墙面的时候，点积会随着它左右挪动正负翻转——它就在墙中间来回横跳，
   * 永远走不到拐角，看起来就是"卡住了"。选定之后不再改主意，凸的矩形上滑到头自然绕过拐角。
   *
   * 而"一次选定"的**边界**在哪儿，是量出来的：绕凸角时会有一两帧完全不碰墙（圆心刚过角点），
   * 要是那一帧就把选择清掉，下一帧蹭回墙上会被当成"新的一轮绕行"重选一次——按"玩家在哪边"
   * 重选出来的往往是**反方向**，它就沿着刚走完的那面墙折返回去（实测白走 400px：口袋里的
   * 8 只影蛭从 17 秒变成 23 秒，相位差的那几次到 33 秒）。所以这一轮绕行的边界是**时间**：
   * 离开所有墙满 `WALL_MEM_SPAN` 秒才算绕完（换成"撞的是不是同一堵墙"也能挡住折返，
   * 但那样要多记一个字段、多一条分支，而这条分支在变异测试里没有任何用例能区分——不留）。
   *
   * 万一真的磨死了（两边都堵：凹角 / 缝太窄），`moved` 那一段会数出来——
   * 连续 WALL_STUCK_SPAN 秒几乎没挪窝就换个方向重来（不换的话那就是永久卡死）。
   */
  private moveWithWalls(
    e: Enemy,
    stepX: number,
    stepY: number,
    dt: number,
    ctx: EnemyContext,
  ): { nx: number; ny: number } | null {
    const walls = ctx.walls;
    if (!walls || walls.length === 0) {
      e.x += stepX;
      e.y += stepY;
      return null;
    }
    const res = slideStep(e.x, e.y, e.radius, stepX, stepY, walls);
    if (!res.hit) {
      e.x = res.x;
      e.y = res.y;
      // 这一帧没碰墙 ≠ 绕墙绕完了：绕过凸角那一下本来就有几帧自由行走（见 `WALL_MEM_SPAN`）。
      // 选择过了这个窗口才作废，中间那一两帧蹭回墙上照旧用原来那一侧。
      e.wallGapT += dt;
      if (e.wallGapT > WALL_MEM_SPAN) {
        e.wallSide = 0;
        e.wallGapT = 0;
      }
      e.wallStuckT = 0;
      return null;
    }
    const fromX = e.x;
    const fromY = e.y;
    const speed = Math.hypot(stepX, stepY);
    if (e.wallSide === 0) {
      // 新的一轮绕行（上一轮已经过期，见 `WALL_MEM_SPAN`）：切向（法线转 90°）往"它想去的那一侧"滑。
      // 正对着脸撞上来的时候点积是 0，两边一样远——那就绕近的那一头（见 `nearerEnd`）。
      const along = -res.ny * Math.cos(e.angle) + res.nx * Math.sin(e.angle);
      e.wallSide =
        Math.abs(along) < 0.05 ? nearerEnd(res.wall, e.x, e.y, -res.ny, res.nx) : along > 0 ? 1 : -1;
    }
    e.wallGapT = 0;
    const tx = -res.ny * e.wallSide;
    const ty = res.nx * e.wallSide;
    const slide = slideStep(e.x, e.y, e.radius, tx * speed, ty * speed, walls);
    if (slide.hit) {
      // 沿墙面滑也撞（拐角 / 夹缝）：留在"推出去"那个落点上，下一帧再试——绝不会停在墙里
      e.x = res.x;
      e.y = res.y;
    } else {
      e.x = slide.x;
      e.y = slide.y;
    }
    if (Math.hypot(e.x - fromX, e.y - fromY) < speed * 0.5) {
      e.wallStuckT += dt;
      if (e.wallStuckT > WALL_STUCK_SPAN) {
        e.wallSide = -e.wallSide;
        e.wallStuckT = 0;
      }
    } else {
      e.wallStuckT = 0;
    }
    return { nx: res.nx, ny: res.ny };
  }

  private bossAura(e: Enemy, dt: number, ctx: EnemyContext): void {
    const hpFrac = e.hp / e.maxHp;
    const newPhase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    if (newPhase > e.phase) {
      e.phase = newPhase;
      e.speed *= 1.12;
      ctx.shake(0.6);
      ctx.burst(e.x, e.y, 40, e.color, { speed: 260, size: 5, life: 0.8 });
      ctx.addLight(e.x, e.y, 220, 0.9);
    }

    e.bossCd -= dt;
    if (e.defId === 'extinguisher') {
      if (e.bossCd <= 0) {
        e.bossCd = 3.4 - e.phase * 0.5;
        ctx.shoot(e.x, e.y, e.angle, 260, e.damage, '#8f7bff', true, e.defId);
        const spokes = 8 + e.phase * 3;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble, 200, e.damage * 0.6, '#b7a5ff', true, e.defId);
        }
        ctx.snuffLight(0.18);
        ctx.shake(0.45);
      }
    } else if (e.defId === 'thornlord') {
      if (e.bossCd <= 0) {
        e.bossCd = 3.1 - e.phase * 0.45;
        const spokes = 9 + e.phase * 3;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 0.8, 210, e.damage * 0.55, '#9fd45a', true, e.defId);
        }
        for (let i = 0; i < e.phase + 1; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const dd = 90 + Math.random() * 190;
          ctx.spikes(ctx.px + Math.cos(a) * dd, ctx.py + Math.sin(a) * dd, 68);
        }
        if (e.phase >= 3) ctx.spawnAdd('moth', e.x + 60, e.y + 40);
        ctx.shake(0.5);
      }
    } else if (e.defId === 'nightfall') {
      if (e.bossCd <= 0) {
        e.bossCd = 3.0 - e.phase * 0.45;
        // 环形弹幕
        const spokes = 13 + e.phase * 4;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 1.2, 220, e.damage * 0.6, '#b7a5ff', true, e.defId);
        }
        // 抽走灯火 —— 视野被夺走的那几秒，才是"终夜"真正的主场
        ctx.snuffLight(0.16);
        if (e.phase >= 2) {
          // 召唤回响：它们会沿着你刚才走过的路追过来
          for (let i = 0; i < e.phase - 1; i += 1) {
            const a = Math.random() * Math.PI * 2;
            ctx.spawnAdd('echo', e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120);
          }
        }
        if (e.phase >= 3) {
          // 在你脚下结出滞行雾：想靠跑位拖时间会越来越难
          ctx.fog(ctx.px, ctx.py, 150);
          ctx.fog(ctx.px + (Math.random() - 0.5) * 260, ctx.py + (Math.random() - 0.5) * 260, 120);
        }
        ctx.shake(0.5);
      }
    } else if (e.defId === 'emberwake') {
      if (e.bossCd <= 0) {
        e.bossCd = 2.6 - e.phase * 0.4;
        const spokes = 12 + e.phase * 4;
        for (let i = 0; i < spokes; i += 1) {
          ctx.shoot(e.x, e.y, (i / spokes) * Math.PI * 2 + e.wobble * 1.6, 230, e.damage * 0.7, '#ff7a2f', true, e.defId);
        }
        if (Math.random() < 0.5) {
          for (let i = 0; i < e.phase + 1; i += 1) {
            const a = Math.random() * Math.PI * 2;
            ctx.ignitGround(e.x + Math.cos(a) * 140, e.y + Math.sin(a) * 140);
          }
        }
        ctx.shake(0.5);
      }
    }
    ctx.addLight(e.x, e.y, 130 + e.phase * 20, 0.7);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    time: number,
    px = 0,
    py = 0,
    view?: { x: number; y: number; halfW: number; halfH: number },
  ): void {
    ctx.save();
    // 屏幕外的敌人不必画：每个敌人都要起渐变、描边、画血雾，几十只一起就是几毫秒。
    // 留的余量足够装下首领光环与出生弹出，边缘不会突然少一只。
    const pad = 200;
    for (const e of this.pool.all) {
      if (!e.active) continue;
      if (
        view &&
        (Math.abs(e.x - view.x) > view.halfW + e.radius * 2 + pad ||
          Math.abs(e.y - view.y) > view.halfH + e.radius * 2 + pad)
      ) {
        continue;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      drawEnemy(ctx, e, time, px, py);
    }
    ctx.restore();
  }

  forEach(fn: (e: Enemy) => void): void {
    for (const e of this.pool.all) if (e.active) fn(e);
  }

  clear(): void {
    this.pool.clear();
    this.trail.length = 0;
  }

  get count(): number {
    return this.pool.activeCount;
  }

  get bosses(): Enemy[] {
    return this.pool.all.filter((e) => e.active && e.boss);
  }
}
