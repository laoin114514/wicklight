/**
 * 触感反馈（震动）。
 *
 * 手机上"冲刺"和"燃爆"是两个按在屏幕上的按钮，按下去有没有生效，手指感觉不到——
 * 短震一下是最便宜的反馈。三件事要做对：
 *   1. 只在掌上设备上震（带触摸屏的笔记本不该嗡一下）；
 *   2. 设置里能关掉（有人就是不想被震）；
 *   3. 不支持（iOS Safari 没有 navigator.vibrate）或调用抛错时安静跳过，游戏照常玩。
 */
import { isHandheld } from './Perf';

type Vibrate = (pattern: number | number[]) => boolean;

function vibrateFn(): Vibrate | null {
  if (typeof navigator === 'undefined') return null;
  const v = (navigator as Navigator & { vibrate?: Vibrate }).vibrate;
  return typeof v === 'function' ? v : null;
}

/** 是否支持触感（供设置面板决定要不要显示这一项）。 */
export function hapticsAvailable(): boolean {
  return vibrateFn() !== null;
}

export function haptic(pattern: number | number[], enabled = true): void {
  if (!enabled || !isHandheld()) return;
  const v = vibrateFn();
  if (!v) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    v.call(navigator, pattern);
  } catch {
    /* 用户设置里禁了 / 权限策略拦了：不是什么大事 */
  }
}

/**
 * 战斗里的触感节奏。
 *
 * 为什么要单独做这一层：手机上两只拇指都压在屏幕上，血条掉没掉、油尽没尽、
 * 挨的是小怪还是首领，全在那两个角上——手是唯一空着的"显示器"。
 *   · 受伤：12ms 一下，最短间隔 220ms（被围殴时不能把手机震成按摩棒）；
 *   · 濒死：血量首次跌破 25% 来一段"心跳"（26-70-26-70-26），
 *     回到 35% 以上才重新武装——不然喝血的时候会一直震；
 *   · 升级：18-50-18，和受伤区分开，别让人以为挨打了；
 *   · 死亡：160ms 长震。
 * 全部走设置里的「震动」开关；桌面（非掌上设备）上整段是空转。
 */
export class CombatHaptics {
  private hurtCd = 0;
  private mineCd = 0;
  private lowArmed = true;
  private readonly on: () => boolean;

  /** @param on 设置里开着震动、且这台设备真的支持时才算数（由调用方给结论） */
  constructor(on: () => boolean) {
    this.on = on;
  }

  /** 每帧：濒死心跳 + 受伤节流。dt 用游戏自己的时间，不碰 performance.now（好测）。 */
  update(dt: number, hpFrac: number): void {
    if (this.hurtCd > 0) this.hurtCd -= dt;
    if (this.mineCd > 0) this.mineCd -= dt;
    if (hpFrac <= 0.25) {
      if (this.lowArmed) {
        this.lowArmed = false;
        haptic([26, 70, 26, 70, 26], this.on());
      }
    } else if (hpFrac >= 0.35) {
      this.lowArmed = true;
    }
  }

  /** 挨了一下。 */
  hurt(): void {
    if (this.hurtCd > 0) return;
    this.hurtCd = 0.22;
    haptic(12, this.on());
  }

  levelUp(): void {
    haptic([18, 50, 18], this.on());
  }

  /**
   * 「灯焰高涨」点着的那一下：短 - 停顿 - 稍长，跟受伤（12ms 一下）和升级（18-50-18）
   * 都不同——它是一件"你主动换来的好事"，手感上得是"腾"地一窜，不是"挨了一下"。
   */
  blaze(): void {
    haptic([6, 34, 22], this.on());
  }

  /**
   * 「伏灯」被踩响的那一下：短促的两下。它和燃爆（一次性的大震）不一样——
   * 这是"你自己埋的东西生效了"，手感上更该像敲了一下，而不是挨了一下。
   * 一串雷连爆时（每节只隔 0.09 秒）也只震头一下：连震四下就变成按摩棒了。
   */
  mine(): void {
    if (this.mineCd > 0) return;
    this.mineCd = 0.3;
    haptic([8, 26, 8], this.on());
  }

  died(): void {
    haptic(160, this.on());
  }

  /** 重开一局：把节流与"濒死武装"复位。 */
  reset(): void {
    this.hurtCd = 0;
    this.mineCd = 0;
    this.lowArmed = true;
  }
}
