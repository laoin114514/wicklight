/**
 * 焦点环（v82）：把"屏幕上那些按钮"接给键盘与手柄。
 *
 * 到 v81 为止，只有**战斗里**的那几块面板（升级卡 / 祭坛 / 商店 / 夜咒）能用键盘走完——
 * 其它十几块屏幕（主菜单 / 选灯火 / 图鉴 / 生涯档案 / 成就 / 设置 / 解锁树 / 今日灯芯 / 暂停 / 结算）
 * 全是"鼠标或手指的活"。手柄插上以后这件事就露出来了：手柄没有指针，玩家点不动"开始冒险"，
 * 于是"战斗里彻底不用碰键鼠"这句话只成了一半——他还得在开局前摸一次鼠标。
 *
 * 这一份补的就是那一半：一个**焦点环**。方向键 / 十字键 / 左摇杆把环挪到某个按钮上，
 * 回车 / Ⓐ 按下它，`Esc` / `Ⓑ` 走 `[data-act="back"]`（如果这一屏有的话）。
 *
 * 三条设计规矩：
 *   · **空间导航，不是"列表上下"**：主菜单是两列、解锁树是三层、灯火那一屏是网格——
 *     只按 DOM 顺序上下挪，玩家按"右"会跳到"下一行的第一个"。所以这里按**几何**挑，分两步：
 *     先只看"侧轴投影和你交叠"的候选（那就是同一列 / 同一行），挑**最正对着你**的那一个；
 *     一条都没有才退回按曼哈顿距离挑最近的一个。这条规则是纯函数 `pickNearest`，能离线单测
 *     （怎么定下来的、量到什么，见 `pickNearest` 上面那一整段）。
 *   · **按住会自己走**：第一下立刻走一格，按住超过 0.35 秒之后每 0.11 秒一格——
 *     菜单里挪三格不该按三次，但也不能一按就冲到对面去。
 *   · **环只在用键盘 / 手柄时才亮**（第一次按方向才出现，换一屏也收掉）：手机上根本没这个东西，
 *     一直挂着只会让人以为"这里有个能点的东西"；换屏不收的话它会"记得"上一屏的第 4 项，
 *     于是新的一屏上没按方向就挂着一圈光（实测就是这个症状，见 `attach`）。
 *
 * 环只认**看得见**的元素（尺寸为 0 的跳过——面板里那几块是靠 `is-hidden` / `display:none` 收起来的）。
 * 它不管"这一下按下去会发生什么"：那是 `UIManager` 里各自挂好的 click 处理器。
 */

/** 一项在屏幕上的位置（只有这四样参与导航打分）。 */
export interface FocusBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 按住方向键多久开始自己走（秒）。 */
export const NAV_REPEAT_DELAY = 0.35;
/** 自己走起来之后每一格之间的间隔（秒）。 */
export const NAV_REPEAT_EVERY = 0.11;

/**
 * 两项在侧轴上要有这么多**真的交叠**才算"同一列 / 同一行"（不是"允许差这么多"）。
 *
 * 门限是 4px 而不是 0：两张卡片边缘差一两个像素就"挨上"了，那种交叠是版式的巧合，不是"它们同列"。
 * 真实版式里这个数很少说话——真正同列的那一项一般交叠几十像素（主菜单那颗 425px 宽的大按钮
 * 底下并排的两颗都是几十像素），它管的是异形网格里的边缘相碰。所以它是一条**兜底**：
 * 把整条"同列池"规则去掉、只留打分，六个真屏（1280×720，逐项跑四个方向）的结果一模一样；
 * 主力是下面那条结构性规则，这个常数只在边缘上站岗。
 */
export const NAV_OVERLAP_TOLERANCE = 4;

/**
 * 从 `from` 出发朝 (dx, dy) 找最近的一项；那个方向什么都没有就返回 -1（不挪）。
 *
 * 分两步：
 *   1. **先只看"侧轴上有交叠"的候选**——按下的时候横向投影和你重叠的那几项，就是"同一列"；
 *      里面有东西就挑**最正对着你**的那一个（侧向偏得少优先，一样近才比纵深）。主菜单（两列）、选灯火（网格）、解锁树（三层）都靠这一步：
 *      它让"按上下"永远留在自己那一列里，不管两列的行高差多少、卡片多宽。
 *   2. 一条都没有才退回到全部候选，按曼哈顿距离（主轴 + 侧轴）挑最近的那个——
 *      解锁树那种错位的网格总会有走到"这一列下面什么都没有"的时候，那时横向挪一格是合理的。
 *
 * 为什么不是"主轴 + 2×侧轴"那种加权距离（第一版就是这么写的）：在真实界面上量过
 * （`/tmp/wl/navmeasure.mjs` / `navmeasure2.mjs`，1280×720，逐项跑四个方向）：
 *   · 主菜单（8 项，两列）：有同列候选的 19 下里，0 下挑到别列；其中 **5 下**跟纯曼哈顿距离
 *     挑得不一样——那 5 下正是纯距离会跨列的地方（左边"开始冒险"那么宽、右边那一列的行高又不一样）；
 *   · 选灯火（9 项，网格）：24 下同列，0 下跨列，**6 下**与纯距离不同；
 *   · 解锁树（21 项，三层）：64 下同列，0 下跨列，**7 下**与纯距离不同；
 *   · 而那套"加权"在第一版里实测更差（解锁树 38 下里 6 下跨列，加权后 8 下）——
 *     "侧向要更贵"这个直觉在**子项宽度不一**的网格上不成立，所以换成了现在这条结构性的规则。
 * 同列候选存在时，这条规则**不可能**挑到别列去——这一点是构造上的，不靠像素差碰运气。
 * （这一句也验证过：把第一步那个"同列池"整个去掉、只留第二步的打分，上面那六个屏逐项跑四个方向
 *   的结果**一模一样**——同宽的两项里，真正同列的那个侧向偏得一定更少，所以池子是个兜底。
 *   留着它是因为它给的是"不可能跨列"这条保证，而打分函数随时可能被下一次调参改坏。）
 *
 * 同列池里"谁算正下方"也有讲究：主菜单那颗 425×97 的大按钮底下并排着两颗（无尽之夜 / 每日灯芯），
 * 两个到它的曼哈顿距离只差两像素——只按距离挑等于抛硬币。所以同列候选先按**侧向偏得少**排，
 * 偏得一样近才比纵深（真实版式里"两个都偏 0"只会出现在整齐的一列里）。
 */
export function pickNearest(boxes: FocusBox[], from: number, dx: number, dy: number): number {
  if (from < 0 || from >= boxes.length) return -1;
  const a = boxes[from];
  if (!a) return -1;
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  /** 在那一侧、且在侧轴上和当前这一项有交叠的候选 */
  const overlapped: number[] = [];
  const all: number[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    if (i === from) continue;
    const b = boxes[i];
    if (!b) continue;
    const rx = b.x + b.w / 2 - ax;
    const ry = b.y + b.h / 2 - ay;
    // 只认"在那一侧"的：往上找就不该挑到下面的东西
    if (dx > 0 ? rx <= 1 : dx < 0 ? rx >= -1 : false) continue;
    if (dy > 0 ? ry <= 1 : dy < 0 ? ry >= -1 : false) continue;
    all.push(i);
    const overlap = dx !== 0 ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (overlap > NAV_OVERLAP_TOLERANCE) overlapped.push(i);
  }
  const pool = overlapped.length > 0 ? overlapped : all;
  // 同列候选里挑哪一个：**先看谁在正下方**（侧向偏得少），再看谁离得近。
  // 这一点在主菜单那颗大按钮上看得最清楚：它底下是并排的两颗（无尽之夜 / 每日灯芯），
  // 两个到它的曼哈顿距离只差两个像素——只按距离挑等于抛硬币，按"下"会有一半概率
  // 挪到偏右的那一个上。按侧向偏多少挑就总是正下面那一个，而且不随几像素的版式抖动翻脸。
  // 退回全部候选那一步（没有同列的东西）仍旧只按曼哈顿距离：那时本来就是"横着挪一格"。
  const bySideFirst = overlapped.length > 0;
  let best = -1;
  let bestKey: [number, number] = [Infinity, Infinity];
  for (const i of pool) {
    const b = boxes[i];
    if (!b) continue;
    const rx = b.x + b.w / 2 - ax;
    const ry = b.y + b.h / 2 - ay;
    const side = dx !== 0 ? Math.abs(ry) : Math.abs(rx);
    const main = dx !== 0 ? Math.abs(rx) : Math.abs(ry);
    const key: [number, number] = bySideFirst ? [side, main] : [side + main, 0];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      bestKey = key;
      best = i;
    }
  }
  return best;
}

/** 环里那些元素的身份：重画一面板之后要能回到同一条（比如设置里点一下开关，整屏会重画）。 */
export function sigOf(el: HTMLElement): string {
  const d = (el.dataset ?? {}) as Record<string, string | undefined>;
  for (const key of ['act', 'lantern', 'diff', 'pact', 'node', 'entry', 'toggle', 'tab', 'buy', 'offer', 'curse', 'shrine', 'forge', 'quality']) {
    const v = d[key];
    if (v != null && v !== '') return `${key}:${v}`;
  }
  return `text:${(el.textContent ?? '').trim().slice(0, 24)}`;
}

/** 这一屏里能落到环上的东西：按钮为主，外加几个不是 `<button>` 的可点元素。 */
const FOCUS_SELECTOR = 'button, [role="button"], [data-entry], [data-node], [data-lantern], [data-pact]';

export class FocusRing {
  private root: HTMLElement | null = null;
  private items: HTMLElement[] = [];
  private idx = -1;
  private sig = '';
  /** 环现在亮着没有（第一次按方向才亮，见文件头第三条）。 */
  private shown = false;
  private heldDx = 0;
  private heldDy = 0;
  private nextAt = 0;

  /**
   * 每次面板重画都调一次：重新收一遍元素，并按身份找回原来那一项。
   *
   * `sameScreen` = 还是这一屏（原地重画，比如设置里点了一下画质那一排），`false` = 换了屏。
   * 换屏要**把环收掉**：不这么做，从图鉴按 Esc 回主菜单时环会"记得"自己在图鉴里的第 4 项，
   * 于是玩家没按方向，主菜单右边那一列已经挂着圈光了——它还圈着"存档"或别的什么，
   * 看上去像是"上一步点歪了"。（实测过：设置 → 主菜单，环落在右边那一列。）
   */
  attach(root: HTMLElement, enabled = true, sameScreen = false): void {
    this.clear();
    this.root = root;
    if (!sameScreen) {
      this.shown = false;
      this.sig = '';
    }
    if (!enabled || !root) return;
    const all = root.querySelectorAll ? Array.from(root.querySelectorAll(FOCUS_SELECTOR)) : [];
    this.items = (all as HTMLElement[]).filter((el) => this.visible(el));
    if (this.items.length === 0) return;
    // 环还没亮过（这一屏上玩家一次方向都没按）：`idx` 就留在 -1——
    // 第一次按方向是"把环亮在第一项上"，不是"从第一项往下走一格"。
    // （写错这一条的症状特别轻：按一下"下"直接跳到第二项，玩家只会觉得"这游戏有点飘"。）
    if (!this.shown) {
      this.idx = -1;
      return;
    }
    // 环亮着：按**身份**找回原来那一项（重画之后元素是新的，`idx` 这个数字却还指着旧位置）

    const at = this.sig ? this.items.findIndex((el) => sigOf(el) === this.sig) : -1;
    this.idx = at >= 0 ? at : Math.min(Math.max(this.idx, 0), this.items.length - 1);
    this.paint();
  }

  /** 这一屏没有可点的东西（或者环在这儿不适用：升级 / 商店 / 祭坛那几块有热键）。 */
  private clear(): void {
    for (const el of this.items) el.classList?.remove('is-focus');
    this.items = [];
    this.idx = -1;
    this.heldDx = 0;
    this.heldDy = 0;
  }

  private visible(el: HTMLElement): boolean {
    if (!el || el.hasAttribute?.('disabled')) return false;
    if (el.classList?.contains('is-hidden')) return false;
    const r = el.getBoundingClientRect?.();
    if (!r) return false;
    return r.width > 0 && r.height > 0;
  }

  private boxes(): FocusBox[] {
    return this.items.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
  }

  private paint(): void {
    for (const el of this.items) el.classList?.remove('is-focus');
    const el = this.items[this.idx];
    if (!el) return;
    el.classList?.add('is-focus');
    this.sig = sigOf(el);
    // 长列表（解锁树 / 图鉴）里把环滚进视野——不然"按下去了但看不见自己按的是哪个"
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private setIndex(i: number): void {
    this.idx = i;
    this.shown = true;
    this.paint();
  }

  /**
   * 这一帧的方向意图（-1 / 0 / 1）。返回"环有没有动"。
   *
   * `now` 是秒（`performance.now() / 1000`），重复的节奏见 NAV_REPEAT_DELAY / NAV_REPEAT_EVERY。
   */
  move(now: number, dx: number, dy: number): boolean {
    if (this.items.length === 0) return false;
    if (dx === 0 && dy === 0) {
      this.heldDx = 0;
      this.heldDy = 0;
      this.nextAt = 0;
      return false;
    }
    const changed = dx !== this.heldDx || dy !== this.heldDy;
    if (!changed) {
      if (now < this.nextAt) return false;
      this.nextAt = now + NAV_REPEAT_EVERY;
    } else {
      this.heldDx = dx;
      this.heldDy = dy;
      this.nextAt = now + NAV_REPEAT_DELAY;
    }
    // 第一次按方向：把环亮在第一个可点的东西上（而不是先猜玩家想往哪儿走）
    if (this.idx < 0) {
      this.setIndex(0);
      return true;
    }
    const next = pickNearest(this.boxes(), this.idx, dx, dy);
    if (next < 0) return false;
    this.setIndex(next);
    return true;
  }

  /** 按下环上那一项（走的是和鼠标同一条 click 通道）。环没亮着就什么都不做。 */
  activate(): boolean {
    const el = this.items[this.idx];
    if (!el || typeof el.click !== 'function') return false;
    el.click();
    return true;
  }

  /** `Esc` / `Ⓑ`：这一屏有"返回"就按它，没有就算了（战斗里的 Esc 是暂停，那条路不走这里）。 */
  backAction(): boolean {
    const el = this.root?.querySelector?.('[data-act="back"]') as HTMLElement | null;
    if (!el || typeof el.click !== 'function') return false;
    el.click();
    return true;
  }

  get index(): number {
    return this.idx;
  }

  get current(): HTMLElement | null {
    return this.items[this.idx] ?? null;
  }

  get size(): number {
    return this.items.length;
  }
}
