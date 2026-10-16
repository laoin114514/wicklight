/**
 * 手柄（v81）：这个游戏到 v80 为止有三条输入的路——键盘 / 鼠标（桌面）、触摸（手机），
 * 而手柄是第四种，也是唯一一种**两只手都在同一块东西上**的路。
 *
 * 为什么值得单独做一条：这一局里玩家左手做两件事（走位 + 冲刺），右手做三件
 * （燃爆 / 分灯 / 拨芯），键盘上它们分给两只手的两片区域，鼠标那块地方还留给了"倾灯手动瞄准"——
 * 于是桌面上"一边跑一边瞄"只有**按住右键**这一种做法（指针指哪儿倒哪儿，方向与力度都归指针）。
 * 手柄把它变成这个游戏本来就该有的样子：**左摇杆走位、右摇杆瞄准**，
 * 推多远就是推多远（和触屏那根手指是同一个编码：方向 + 0~1 的力度）。
 *
 * 三条设计规矩：
 *   · **一只手柄说了算**：同时插着两只时只认第一只（`getGamepads()` 的顺序），
 *     不做"谁的输入大听谁的"——两只手在同一个角色身上抢方向盘只会让人以为游戏坏了。
 *   · **一次性输入要做边沿检测**：分灯 / 拨芯 / 暂停 / 构筑总览 / 面板上那几下"按一下"，
 *     都只在**按下的那一帧**给一次。不做这一步的话，按住一个键就会变成"每帧按一下"
 *     （拨芯会一秒翻 60 格，重掷会把点花光）。
 *   · **它按情境分家，和键盘一样**：手柄上就那么几个键，所以 Start 在战斗里是暂停、
 *     在面板上是确认；Back 在战斗里是构筑总览、在面板上是重掷——这正好是键盘上那两对键
 *     （Esc / 回车、Tab / R）的分法，玩家在两个设备之间切换时不会长第二套直觉。
 *
 * 这一份只负责"读出一帧的意图"，不碰游戏：`poll()` 返回一个快照，主循环把它和键盘 / 触摸
 * 合起来交给 `Game.setInput`。于是它可以脱离浏览器单独测（喂一只假手柄进去就行）。
 */

/** 左摇杆的死区：手搭在摇杆上不该让角色慢慢漂（触屏摇杆那边是 12%，这里是 18%）。 */
export const PAD_DEADZONE = 0.18;
/**
 * 右摇杆（手动瞄准）的死区，比走位那个大一点：瞄准是"推出去才算在瞄"——
 * 手感上推一点点就开始改落点，会让人觉得自己在跟游戏抢那盏灯。
 */
export const PAD_AIM_DEAD = 0.25;

/**
 * 菜单导航（焦点环）用的死区，比走位那个大得多：菜单上"手搭在摇杆上"是个**静止动作**——
 * 玩家一边看面板一边把拇指放在杆上，回中不准的杆会一直报 0.2~0.3，那个量级够把环一格一格推走。
 * 45% 的意思是"真的要往那边推"，而走位那边 18% 已经够灵敏（那是连续量，漂一点看不出来）。
 */
export const PAD_NAV_DEAD = 0.45;

/** 标准布局（Standard Gamepad）的那几个按钮号——写下来是因为它们是**约定**，不是随手挑的数。 */
export const PAD_BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  // 肩键：面板上只有四个面键，而商店的货架是六件（和键盘那排数字键同一个位置）
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  dup: 12,
  ddown: 13,
  dleft: 14,
  dright: 15,
} as const;

/** HUD 底部那一行说明（接了手柄就把键盘那行换掉——手柄玩家看"空格冲刺"是没有用的）。 */
export const PAD_HINT =
  '左摇杆移动 · Ⓐ 冲刺 · Ⓧ 燃爆 · Ⓑ 分灯 · Ⓨ 拨芯 · 右摇杆瞄准 · Start 暂停 · Back 构筑';

/** 第一次接上手柄时讲一次的那张卡（"首次遭遇"那套规矩：同一条只讲一次）。 */
export const PAD_TIP = {
  title: '🎮 手柄',
  text:
    '左摇杆 / 十字键移动 · Ⓐ 或 RT 冲刺（有无敌帧）· Ⓧ 或 LT 燃爆 · Ⓑ 分灯 · Ⓨ 拨芯（开关）· ' +
    '右摇杆给「倾灯」手动瞄准（推多远落多远）· Start 暂停 · Back 构筑总览。' +
    '面板上：Ⓐ Ⓑ Ⓧ Ⓨ 选第 1~4 张（商店再加 LB / RB 选第 5、6 件）、Back 重掷；' +
    '结算屏上 Start 就是那颗主按钮（对应键盘的回车）。',
};

/** 只需要这几个字段：真实 `Gamepad` 与测试里的假手柄都长得下来。 */
export interface PadLike {
  id?: string;
  index?: number;
  connected?: boolean;
  buttons?: { pressed?: boolean; value?: number }[];
  axes?: number[];
}

export interface PadSnapshot {
  /** 这一帧的意图（没接手柄时 `poll` 返回 null，调用方按"没有"处理）。 */
  id: string;
  connected: boolean;
  moveX: number;
  moveY: number;
  /** 右摇杆给出的"方向 × 力度"（没推过死区就是 null = 还给自动瞄准）。 */
  aim: { x: number; y: number } | null;
  dash: boolean;
  nova: boolean;
  lamp: boolean;
  dim: boolean;
  pause: boolean;
  sheet: boolean;
  confirm: boolean;
  reroll: boolean;
  /** 面板上选了第几张（0 = 这一帧没选）。 */
  pick: number;
  /**
   * 焦点环的方向（v82）：十字键 + 左摇杆，**按住**给方向（-1 / 0 / 1），
   * "按住会自己走"那个节奏归 `FocusRing`（它才知道环现在在哪一格）。
   * 战斗里这个字段没人用（那时候左摇杆是走位，走位读的是 `moveX/moveY`）。
   */
  nav: { dx: number; dy: number };
  /** Ⓐ 按下的那一帧（战斗之外 = "按下焦点上那一项"；战斗里它是冲刺，见 `dash`）。 */
  activate: boolean;
  /** Ⓑ 按下的那一帧（战斗之外 = "返回上一屏"；战斗里它是分灯，见 `lamp`）。 */
  back: boolean;
}

/**
 * 三种情境（见文件头第三条）：
 *   · `run`：战斗 / 暂停 / 构筑总览——走位、冲刺、分灯、拨芯、Start 暂停、Back 构筑；
 *   · `panel`：「第几张」那几块（升级 / 商店 / 祭坛 / 夜咒）——脸键 = 第 1~4 张、LB / RB = 第 5 / 6 件、
 *     Start = 确认、Back = 重掷；
 *   · `menu`（v82）：其余那十几屏（主菜单 / 选灯火 / 图鉴 / 档案 / 成就 / 设置 / 解锁树 / 结算……）——
 *     脸键 = 按下焦点 / 返回，Start = 确认（那几屏的"主按钮"），方向键 / 左摇杆挪焦点环。
 */
export type PadMode = 'run' | 'panel' | 'menu';

/** 摇杆读数 → 死区过滤后的二维向量（走位与瞄准共用这一条，只是死区不一样）。 */
export function stickVector(x: number | undefined, y: number | undefined, dead: number): { x: number; y: number } {
  const vx = Number.isFinite(x) ? (x as number) : 0;
  const vy = Number.isFinite(y) ? (y as number) : 0;
  if (Math.hypot(vx, vy) < dead) return { x: 0, y: 0 };
  return { x: vx, y: vy };
}

export class Gamepad {
  /**
   * 上一帧按下的按钮。一次性输入只认"这一帧按下 && 上一帧没按"——
   * 少了它，按住一个键就会变成"每帧按一下"（拨芯一秒翻 60 格、重掷把点花光）。
   */
  private prevDown = new Set<number>();
  private lastId = '';
  private wasConnected = false;

  constructor(private read: () => (PadLike | null)[] = defaultRead) {}

  /** 取第一只连着的手柄（见文件头"一只手柄说了算"）。null = 这一帧没有手柄。 */
  private first(): PadLike | null {
    let list: (PadLike | null)[] = [];
    try {
      list = this.read() ?? [];
    } catch {
      return null;
    }
    for (const pad of list) {
      if (pad && pad.connected !== false) return pad;
    }
    return null;
  }

  /**
   * 读一帧。`mode` 决定那几个"按情境分家"的键（见文件头）：战斗里 Start = 暂停、Back = 构筑总览；
   * 面板上 Start = 确认、Back = 重掷。
   */
  poll(mode: PadMode = 'run'): PadSnapshot | null {
    const pad = this.first();
    if (!pad) {
      // 没有手柄时**不**清边沿状态（`null` 本身就表达了"这一帧什么都没有按"）：
      // 清了的话，"手里还按着 Ⓨ、线松了一下又插回来"会把那一下当成一次新按下，
      // 玩家什么都没做，灯芯却自己翻了一格。留着旧状态只在重连后多要一次"松手再按"，
      // 那是个玩家自己看得见、也修得回来的小事。
      this.wasConnected = false;
      return null;
    }
    const id = String(pad.id ?? '手柄');
    const buttons = pad.buttons ?? [];
    const axes = pad.axes ?? [];
    const down = (i: number): boolean => {
      const b = buttons[i];
      if (!b) return false;
      return b.pressed === true || (b.value ?? 0) > 0.5;
    };
    // ⚠ 这里先把"上一帧"抓成本地的一份：下面 `edge` 会被调用很多次（状态自己一次、面板那几行又一次），
    //   而函数末尾才把这一帧盖到 `this.prevDown` 上。少了这一行，末尾那句赋值会让**最后几次**
    //   `edge()` 读到"已经更新过"的状态——于是 `lamp` / `dim` 那两个永远返回假
    //   （实测：Ⓑ 与 Ⓨ 按下去了，`poll` 却说没按）。一次性输入要"读同一份上一帧"。
    const prev = this.prevDown;
    const edge = (i: number): boolean => down(i) && !prev.has(i);

    const stick = stickVector(axes[0], axes[1], PAD_DEADZONE);
    const dpadX = (down(PAD_BUTTON.dright) ? 1 : 0) - (down(PAD_BUTTON.dleft) ? 1 : 0);
    const dpadY = (down(PAD_BUTTON.ddown) ? 1 : 0) - (down(PAD_BUTTON.dup) ? 1 : 0);
    let moveX = stick.x + dpadX;
    let moveY = stick.y + dpadY;
    // 摇杆推到底就是 1（斜着推不该比直着推快），和键盘 / 触屏那两条路的口径一致
    const ml = Math.hypot(moveX, moveY);
    if (ml > 1) {
      moveX /= ml;
      moveY /= ml;
    }
    const aimRaw = stickVector(axes[2], axes[3], PAD_AIM_DEAD);
    const aimLen = Math.hypot(aimRaw.x, aimRaw.y);
    // 菜单导航：十字键 + 左摇杆（摇杆要推出 PAD_NAV_DEAD 才算数，见那个常量上那一段）
    const navStick = stickVector(axes[0], axes[1], PAD_NAV_DEAD);
    const navDx = (dpadX !== 0 ? dpadX : Math.abs(navStick.x) > 0 ? Math.sign(navStick.x) : 0);
    const navDy = (dpadY !== 0 ? dpadY : Math.abs(navStick.y) > 0 ? Math.sign(navStick.y) : 0);

    const startEdge = edge(PAD_BUTTON.start);
    const backEdge = edge(PAD_BUTTON.back);
    // 面板上四个面键就是"第 1~4 张"（和键盘上那排数字键同一个意思）
    const face = [PAD_BUTTON.a, PAD_BUTTON.b, PAD_BUTTON.x, PAD_BUTTON.y];
    let pick = 0;
    for (let i = 0; i < face.length; i += 1) if (edge(face[i])) pick = i + 1;
    // 第五 / 第六件接在肩上：升级卡与祭坛只有三件，这个数是给商店那六件货架留的，
    // 在没有那么多东西的面板上按下去没有任何副作用（见 Game.panelHotkeys 的门禁）。
    if (edge(PAD_BUTTON.lb)) pick = 5;
    if (edge(PAD_BUTTON.rb)) pick = 6;

    // 收尾：把这一帧按下的按钮留成下一帧的"上一帧"
    this.prevDown = this.sample(pad);
    this.lastId = id;
    this.wasConnected = true;

    const run = mode === 'run';
    // 「第几张」只在升级 / 商店 / 祭坛那三块上有意义（见 Gamepad 文件头第三条）：
    // 其它屏幕（菜单 / 结算 / 图鉴……）上四个脸键是"按下焦点 / 返回"，不是"第 n 张"。
    const pickMode = mode === 'panel';
    return {
      id,
      connected: true,
      moveX,
      moveY,
      aim: aimLen > 0 ? { x: aimRaw.x / aimLen, y: aimRaw.y / aimLen } : null,
      dash: run && (down(PAD_BUTTON.rt) || down(PAD_BUTTON.a)),
      nova: run && (down(PAD_BUTTON.lt) || down(PAD_BUTTON.x)),
      lamp: run && edge(PAD_BUTTON.b),
      dim: run && edge(PAD_BUTTON.y),
      pause: run && startEdge,
      sheet: run && backEdge,
      confirm: !run && startEdge,
      reroll: pickMode && backEdge,
      pick: pickMode ? pick : 0,
      nav: { dx: navDx, dy: navDy },
      activate: edge(PAD_BUTTON.a),
      back: edge(PAD_BUTTON.b),
    };
  }

  get connected(): boolean {
    return this.wasConnected;
  }

  get id(): string {
    return this.lastId;
  }

  /** 一只手柄此刻按下了哪几个键（边沿检测与 `reset` 共用这一份读数）。 */
  private sample(pad: PadLike | null): Set<number> {
    const set = new Set<number>();
    const buttons = pad?.buttons ?? [];
    for (const i of Object.values(PAD_BUTTON)) {
      const b = buttons[i];
      if (b && (b.pressed === true || (b.value ?? 0) > 0.5)) set.add(i);
    }
    return set;
  }

  /**
   * 页面切到后台再回来时调（见 main.ts 的 visibilitychange）：这中间按着的键**不该在回来那一帧补响**。
   *
   * 所以这里是"把现在按着的东西直接记成上一帧就按着了"，而不是清空——清空正好会把
   * "切走时还按着的 Ⓨ"当成一次新按下：接个电话回来，灯芯自己翻了一格，玩家什么都没碰。
   * （切后台时 rAF 本来就停了，所以"上一帧"就是切走前那一帧，这份读数正好接得上。）
   */
  reset(): void {
    const pad = this.first();
    this.prevDown = pad ? this.sample(pad) : new Set<number>();
  }
}

/** 浏览器里的读数：没有这个 API（老浏览器 / 离线测试）就当没接手柄。 */
function defaultRead(): (PadLike | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  return navigator.getGamepads() as unknown as (PadLike | null)[];
}
