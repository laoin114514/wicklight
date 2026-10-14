/**
 * 性能档位：把"这台设备该怎么画"收在一处，别散在各个系统里各拍一个数。
 *
 * 为什么手机要单独一档：手机是**GPU 快、CPU 慢、电池小**，而且横屏之后 CSS 视口
 * 只有 800×390 左右——像素不多，但每个整屏 pass（光照贴图 / 泛光 / 暗角）都要按
 * 设备像素再乘一次 dpr，开销立刻翻几倍。所以手机档做四件事：
 *   1. 压低像素预算与倍率上限（少画点像素，画面差别远小于帧率差别）；
 *   2. 光照贴图按半分辨率画再放大（它是低频的柔光，半分辨率看不出来）；
 *   3. 泛光降采样更狠、只叠一层，布景与粒子密度收一点；
 *   4. 帧率钉在 60：高刷屏跑满 120 只是把同一块画面画两遍。
 * 单元测试环境（node + DOM stub）里 `maxTouchPoints` 为 0，走的仍是桌面档。
 */

export type Quality = 'low' | 'medium' | 'high';

export interface PerfProfile {
  /** 是否按掌上设备（手机 / 平板）来画。 */
  handheld: boolean;
  /** 后备缓冲倍率上限。 */
  maxDpr: number;
  /** 每帧渲染像素总数上限。 */
  pixelBudget: number;
  /** 光照贴图分辨率相对画布的倍率（1 = 与画布同分辨率）。 */
  lightScale: number;
  /** 泛光降采样倍数：4 → 取 1/4 分辨率。 */
  bloomDivisor: number;
  /** 泛光叠加层数：2 = 更宽的光晕，1 = 省一次整屏加法。 */
  bloomPasses: number;
  /** 布景 / 细节密度倍率。 */
  detailScale: number;
  /** 粒子数量倍率。 */
  particleScale: number;
  /** 帧率上限（0 = 不限）。 */
  frameCap: number;
  /**
   * 动态分辨率能降到的最低倍率。桌面 0.5 就够（大屏降太多会糊），
   * 手机多留一档 0.4：横屏本来就只有 0.18MPx 上下，再少 20% 面积去换 60fps 是划算的，
   * 而且只有在实测帧时间确实够不着 60 的时候才会被走到。
   */
  minScale: number;
}

let memo: { key: string; profile: PerfProfile } | null = null;
let touchCache: boolean | null = null;
let handheldCache: boolean | null = null;

/** 触屏设备判定（和 TouchControls 用同一套判断，避免两处结论不一致）。 */
export function isTouchDevice(): boolean {
  if (touchCache !== null) return touchCache;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return (touchCache = false);
  const coarse =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);
  touchCache =
    'ontouchstart' in window ||
    (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) ||
    coarse === true;
  return touchCache;
}

/**
 * 掌上设备：主指针是"粗"的（手指），或者视口本来就不大（竖屏手机）。
 * 带触摸屏的笔记本（鼠标是主指针、窗口够大）不算——不该白降它的画质。
 * 横屏遮罩与性能档位都用它，保证"要不要按手机来优化"只有一处结论。
 */
export function isHandheld(): boolean {
  if (handheldCache !== null) return handheldCache;
  if (!isTouchDevice() || typeof window === 'undefined') return (handheldCache = false);
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const small = vw > 0 && vh > 0 && Math.min(vw, vh) <= 560;
  return (handheldCache = coarse || small);
}

/** 仅供测试：清掉记忆化，让环境变化能重新判定。 */
export function resetPerfCache(): void {
  memo = null;
  touchCache = null;
  handheldCache = null;
}

export function perfProfile(quality: Quality = 'high', handheld: boolean = isHandheld()): PerfProfile {
  const key = `${quality}|${handheld ? 'handheld' : 'desktop'}`;
  if (memo && memo.key === key) return memo.profile;
  let profile: PerfProfile;
  if (handheld) {
    if (quality === 'low') {
      profile = {
        handheld,
        maxDpr: 1,
        pixelBudget: 1.0e6,
        lightScale: 0.5,
        bloomDivisor: 8,
        bloomPasses: 1,
        detailScale: 0.5,
        particleScale: 0.55,
        frameCap: 60,
        minScale: 0.4,
      };
    } else if (quality === 'medium') {
      profile = {
        handheld,
        maxDpr: 1.25,
        pixelBudget: 1.4e6,
        lightScale: 0.5,
        bloomDivisor: 6,
        bloomPasses: 1,
        detailScale: 0.6,
        particleScale: 0.7,
        frameCap: 60,
        minScale: 0.4,
      };
    } else {
      profile = {
        handheld,
        maxDpr: 1.5,
        pixelBudget: 1.9e6,
        lightScale: 0.5,
        bloomDivisor: 6,
        bloomPasses: 1,
        detailScale: 0.7,
        particleScale: 0.8,
        frameCap: 60,
        minScale: 0.4,
      };
    }
  } else if (quality === 'low') {
    profile = {
      handheld,
      maxDpr: 1,
      pixelBudget: 1.8e6,
      lightScale: 0.5,
      bloomDivisor: 8,
      bloomPasses: 1,
      detailScale: 0.7,
      particleScale: 0.7,
      frameCap: 0,
      minScale: 0.5,
    };
  } else if (quality === 'medium') {
    profile = {
      handheld,
      maxDpr: 1.5,
      pixelBudget: 2.4e6,
      lightScale: 1,
      bloomDivisor: 5,
      bloomPasses: 1,
      detailScale: 0.85,
      particleScale: 0.85,
      frameCap: 0,
      minScale: 0.5,
    };
  } else {
    profile = {
      handheld,
      maxDpr: 2,
      pixelBudget: 3.0e6,
      lightScale: 1,
      bloomDivisor: 4,
      bloomPasses: 2,
      detailScale: 1,
      particleScale: 1,
      frameCap: 0,
      minScale: 0.5,
    };
  }
  memo = { key, profile };
  return profile;
}
