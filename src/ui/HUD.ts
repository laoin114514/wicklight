import type { Game } from '../core/Game';
import type { HUDHost } from '../core/Game';
import { isTouchDevice } from '../core/Perf';
import { WEAPON_MAP } from '../data/weapons';
import { PASSIVE_MAP } from '../data/upgrades';
import { RELIC_MAP, TRIBES } from '../data/relics';
import { STAGES } from '../data/stages';
import { POUR } from '../data/pour';

/** 卡片车道：掌上横屏的一条横带上一张提示卡 + 一张短公告就是上限（见 postCard）。 */
type CardLane = 'tip' | 'toast';

export class HUD implements HUDHost {
  private root: HTMLElement;
  private hpFill!: HTMLElement;
  private oilFill!: HTMLElement;
  private xpFill!: HTMLElement;
  private levelEl!: HTMLElement;
  private waveEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private stageEl!: HTMLElement;
  private waveBarEl!: HTMLElement;
  private waveFill!: HTMLElement;
  private waveBoss!: HTMLElement;
  private killEl!: HTMLElement;
  private emberEl!: HTMLElement;
  private goldEl!: HTMLElement;
  private buildEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboNum!: HTMLElement;
  private comboBar!: HTMLElement;
  private curseEl!: HTMLElement;
  private curseSig = '~';
  private bountyEl!: HTMLElement;
  private bountySig = '~';
  private pyreEl!: HTMLElement;
  private pyreSig = '~';
  private waveSig = '~';
  private buildSig = '';
  private bossWrap!: HTMLElement;
  private bossRows!: HTMLElement;
  private bossRowEls: { row: HTMLElement; name: HTMLElement; fill: HTMLElement }[] = [];
  private bossSig = '';
  private announceEl!: HTMLElement;
  private toastRoot: HTMLElement;
  private hudEl!: HTMLElement;
  private announceTimer = 0;
  /** 公告淡出那 0.3 秒也继续占着横带：不然卡片会在它还没淡完时就挤上来（两坨字叠在一起）。 */
  private announceLinger = 0;
  /** 排队中的卡片（掌上横屏用，见 postCard）：元素已经造好，只等横带上腾出位置。 */
  private waiting: { el: HTMLElement; key: string; lane: CardLane; hold: number; life: number }[] = [];
  /** 卡片自己的停留 / 淡出计时，由 update(dt) 推着走——不靠 setTimeout（理由见 updateCards）。 */
  private cardTimers = new WeakMap<HTMLElement, { hold: number; life: number; out: boolean }>();
  /** 上一次真正写进 DOM 的值：每帧无脑写 style / textContent 会让浏览器反复排队样式重算。 */
  private lastText = new WeakMap<HTMLElement, string>();
  private lastWidth = new WeakMap<HTMLElement, string>();
  /** 触屏的冲刺 / 燃爆按钮（桌面为 null）：冷却圈的角度按 1/32 档记忆，别每帧写 style。 */
  private dashBtn: HTMLElement | null = null;
  private novaBtn: HTMLElement | null = null;
  private lampBtn: HTMLElement | null = null;
  private lastCd = new WeakMap<HTMLElement, string>();
  private dashFiring = false;
  private lampEmpty = false;

  constructor(private game: Game) {
    this.root = document.getElementById('ui-root') as HTMLElement;
    this.toastRoot = document.getElementById('toast-root') as HTMLElement;
    this.build();
    // 触屏按钮写在 index.html 里（#touch-root），桌面上整块 display:none，这里也就是 null。
    if (isTouchDevice()) {
      this.dashBtn = document.querySelector('.touch-btn--dash');
      this.novaBtn = document.querySelector('.touch-btn--nova');
      this.lampBtn = document.querySelector('.touch-btn--lamp');
    }
  }

  private build(): void {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div class="hud__topleft">
        <div class="bar bar--hp"><i></i><span class="bar__label">生命</span></div>
        <div class="bar bar--oil"><i></i><span class="bar__label">灯油</span></div>
        <div class="bar bar--xp"><i></i><span class="bar__label">经验</span></div>
        <div class="hud__level">Lv <b>1</b></div>
      </div>
      <div class="hud__topright">
        <button class="hud__pause" data-act="pause" type="button" aria-label="暂停"><i></i><i></i></button>
        <div class="hud__stat"><span>波次</span><b class="js-wave">0</b></div>
        <div class="hud__stat"><span>时间</span><b class="js-time">0:00</b></div>
        <div class="hud__stat"><span>击杀</span><b class="js-kill">0</b></div>
        <div class="hud__stat hud__stat--gold"><span>金币</span><b class="js-gold">0</b></div>
        <div class="hud__stat hud__stat--ember"><span>余烬</span><b class="js-ember">0</b></div>
      </div>
      <div class="hud__stage js-stage">幽林</div>
      <div class="hud__wave js-wavebar"><i></i><u></u></div>
      <div class="hud__boss js-boss">
        <div class="hud__boss-rows js-boss-rows"></div>
      </div>
      <div class="hud__combo js-combo">
        <b class="js-combo-n">0</b>
        <span class="hud__combo-label">连杀</span>
        <i class="hud__combo-bar"><u class="js-combo-bar"></u></i>
      </div>
      <div class="hud__curse js-curse"></div>
      <div class="hud__bounty js-bounty"></div>
      <div class="hud__pyre js-pyre"></div>
      <div class="hud__hint">WASD 移动 · 空格冲刺 · Q 燃爆 · E 分灯 · 自动开火 · Esc 暂停</div>
    `;
    this.root.appendChild(hud);
    this.hudEl = hud;
    // 手机上唯一的暂停入口（键盘的 Esc / P 在手机上不存在）：暂停面板里才有构筑总览。
    // tabindex 与 aria-label 都有了，键盘（桌面）按不到也没关系——桌面上它是 hidden 的。
    hud.querySelector('.hud__pause')?.addEventListener('click', () => this.game.togglePause());

    const q = <T extends HTMLElement>(sel: string) => hud.querySelector(sel) as T;
    this.hpFill = hud.querySelector('.bar--hp i') as HTMLElement;
    this.oilFill = hud.querySelector('.bar--oil i') as HTMLElement;
    this.xpFill = hud.querySelector('.bar--xp i') as HTMLElement;
    this.levelEl = hud.querySelector('.hud__level b') as HTMLElement;
    this.waveEl = q('.js-wave');
    this.timeEl = q('.js-time');
    this.killEl = q('.js-kill');
    this.emberEl = q('.js-ember');
    this.goldEl = q('.js-gold');
    this.stageEl = q('.js-stage');
    this.waveBarEl = q('.js-wavebar');
    this.waveFill = q('.js-wavebar i');
    this.waveBoss = q('.js-wavebar u');
    this.bossWrap = q('.js-boss');
    this.bossRows = q('.js-boss-rows');
    this.comboEl = q('.js-combo');
    this.comboNum = q('.js-combo-n');
    this.comboBar = q('.js-combo-bar');
    this.curseEl = q('.js-curse');
    this.bountyEl = q('.js-bounty');
    this.pyreEl = q('.js-pyre');

    const build = document.createElement('div');
    build.className = 'hud__build';
    hud.appendChild(build);
    this.buildEl = build;

    const ann = document.createElement('div');
    ann.className = 'announce';
    this.root.appendChild(ann);
    this.announceEl = ann;
  }

  /** 只在文本真的变了才写：时间一秒才变一次，没必要 60 次/秒地碰 DOM。 */
  private text(el: HTMLElement, v: string): void {
    if (this.lastText.get(el) === v) return;
    this.lastText.set(el, v);
    el.textContent = v;
  }

  /** 同理，宽度按 0.1% 取整后再比——肉眼看不出的抖动不必每帧重排一次。 */
  private width(el: HTMLElement, frac: number): void {
    const v = `${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10}%`;
    if (this.lastWidth.get(el) === v) return;
    this.lastWidth.set(el, v);
    el.style.width = v;
  }

  setVisible(v: boolean): void {
    this.hudEl.style.display = v ? '' : 'none';
  }

  setBoss(name: string | null, frac: number): void {
    this.setBosses(name ? [{ name, frac }] : []);
  }

  /** 首领血条：一列写下来，同台几位就有几行。 */
  setBosses(list: { name: string; frac: number }[]): void {
    // 没有首领的时候这一路每帧都被调用，先比一次签名，别让"清空"也跟着每帧跑
    const sig = list.map((b) => `${b.name}|${Math.round(b.frac * 1000)}`).join(',');
    if (sig === this.bossSig) return;
    const wasEmpty = !this.bossSig;
    this.bossSig = sig;
    if (!list.length) {
      if (wasEmpty) return;
      this.bossWrap.classList.remove('is-active', 'is-multi');
      this.bossRows.textContent = '';
      this.bossRowEls = [];
      return;
    }
    this.bossWrap.classList.add('is-active');
    this.bossWrap.classList.toggle('is-multi', list.length > 1);
    if (this.bossRowEls.length !== list.length) {
      this.bossRows.textContent = '';
      this.bossRowEls = list.map(() => {
        const row = document.createElement('div');
        row.className = 'hud__boss-row';
        const name = document.createElement('div');
        name.className = 'hud__boss-name';
        const bar = document.createElement('div');
        bar.className = 'hud__boss-bar';
        const fill = document.createElement('i');
        bar.appendChild(fill);
        row.appendChild(name);
        row.appendChild(bar);
        this.bossRows.appendChild(row);
        return { row, name, fill };
      });
    }
    list.forEach((b, i) => {
      const slot = this.bossRowEls[i];
      if (!slot) return;
      this.text(slot.name, b.name);
      this.width(slot.fill, b.frac);
    });
  }

  toast(text: string): void {
    // 同样的话还挂在屏幕上就别再叠一条：开局那一串事件本来就会连着弹
    // （"图鉴 +2 条" 曾经同时出现两条），重复的公告只会把战场糊住。
    if (this.hasCard(text)) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.postCard(el, text, 'toast', 1.8, 2.6);
  }

  /**
   * 首次遭遇的提示卡：比 toast 多一行说明，停得也久一些。
   * 掌上横屏上收短一点（4.6 秒）：那里是一次只讲一条的队列，一条占太久会把后面几条拖成陈年旧事。
   */
  tip(title: string, text: string): void {
    if (this.hasCard(title)) return;
    const el = document.createElement('div');
    el.className = 'toast toast--tip';
    el.innerHTML = `<b>${title}</b><span>${text}</span>`;
    this.postCard(el, title, 'tip', this.tipHold(), this.tipLife());
  }

  /**
   * 屏幕上已经挂着同一句话了吗（只看还没开始淡出的那几条）。
   * 认的是往元素上写的 `cardKey`，不是从 DOM 里抠文本：提示卡的标题藏在 <b> 里，
   * 抠文本既多绕一圈，也在无头桩件里抠不出来。
   */
  private hasCard(key: string): boolean {
    for (const el of this.liveCards()) {
      if (el.classList.contains('is-out')) continue;
      if (el.dataset.cardKey === key) return true;
    }
    // 还排着队的那几条也算"已经在讲"：不然同一句话会在队列里攒成三四条。
    return this.waiting.some((w) => w.key === key);
  }

  /** 屏幕上挂着的卡片（含正在淡出的：淡出中的那条还占着横带的位置）。 */
  private liveCards(): HTMLElement[] {
    return Array.from(this.toastRoot.children as HTMLCollectionOf<HTMLElement>);
  }

  /** 这张卡走的是哪条车道。 */
  private laneOf(el: HTMLElement): CardLane {
    return el.classList.contains('toast--tip') ? 'tip' : 'toast';
  }

  /**
   * 这条车道上还挂着卡片吗。
   * ⚠ 320~380 高的横屏（SE 那种）只有一条车道：整条横带只放得下一张卡片，
   * 所以短公告与提示卡共用同一个位置——那时它们只能一张一张地来。
   */
  private laneBusy(lane: CardLane): boolean {
    // 横带上的公告正亮着（含正在淡出的那 0.3 秒）：这一整条横带现在归它
    if (this.holdBand()) return true;
    return this.liveCards().some((el) => this.oneLane() || this.laneOf(el) === lane);
  }

  /** 掌上横屏上"公告正占着那条横带"（亮着 + 淡出中）。 */
  private holdBand(): boolean {
    return this.feedMode() && (this.announceTimer > 0 || this.announceLinger > 0);
  }

  /** 掌上提示卡的停留时长（秒），和 tip() 里那两档共用一份，别写出第二个真值。 */
  private tipHold(): number {
    return this.feedMode() ? 4.6 : 6.4;
  }

  private tipLife(): number {
    return this.feedMode() ? 5.4 : 7.2;
  }

  /**
   * 掌上横屏（feedMode）：屏幕矮，能放卡片的横带只有顶上那一条
   * （左上是生命/灯油那一列，右上是记分那一列，屏幕正中是**你自己**）。
   * 一条横带放得下一张提示卡 + 一张短公告，于是这里按车道排队：
   * 同一条车道上前一张讲完并摘掉，才轮到下一张。宁可讲得慢一点，也不糊住战场。
   * 桌面照旧——那里的屏幕高度不是稀缺资源，堆叠反而能一眼看到上下文。
   */
  private postCard(el: HTMLElement, key: string, lane: CardLane, hold: number, life: number): void {
    el.dataset.cardKey = key;
    if (this.feedMode() && this.laneBusy(lane)) {
      this.enqueue({ el, key, lane, hold, life });
      return;
    }
    this.showCard(el, hold, life);
    if (lane === 'toast') this.trimCards();
  }

  private showCard(el: HTMLElement, hold: number, life: number): void {
    this.toastRoot.appendChild(el);
    this.cardTimers.set(el, { hold, life, out: false });
  }

  /** 排队等着上屏（队伍的长短由 trimWaiting 管）。 */
  private enqueue(item: { el: HTMLElement; key: string; lane: CardLane; hold: number; life: number }): void {
    if (this.hasCard(item.key)) return;
    this.waiting.push(item);
    this.trimWaiting();
  }

  /**
   * 排队也不能排成一条长龙。
   * ⚠ 这里**只丢短公告**（超过 3 条就从最旧的开始丢）：公告说的是"此刻发生的事"，
   * 拖到十几秒后再讲等于没讲。提示卡一条都不丢——它是"讲一次就够"的教学，
   * 而 Game.showTip 早把它记进存档了，丢掉就是这一局永远学不到（屏幕不够就慢慢讲，
   * 反正提示卡的总数是有限的，一次只讲一张自然会把队排完）。
   */
  private trimWaiting(): void {
    const cap = 3;
    for (const w of [...this.waiting]) {
      if (this.waiting.filter((x) => x.lane === 'toast').length <= cap) break;
      if (w.lane === 'toast') this.waiting.splice(this.waiting.indexOf(w), 1);
    }
  }

  /** 还有几条排着队（调试 / 测试用）。 */
  get queued(): number {
    return this.waiting.length;
  }

  /**
   * 把屏幕上的卡片和排着队的消息一起清掉。
   * 新开一局时必须清（Game.newRun 里调的就是它）：上一局的"图鉴 +2 条"和它身后
   * 那一串排队的话，不该飘进这一局的开场——尤其是"关卡 · xxx"那张教学卡，
   * 那是新一关开局第一句话。⚠ 得在 loadStage 之前清，那张卡就是 loadStage 里弹的。
   */
  clearCards(): void {
    for (const el of this.liveCards()) this.toastRoot.removeChild(el);
    this.waiting.length = 0;
    this.announceEl.className = 'announce';
    this.announceTimer = 0;
    this.announceLinger = 0;
  }

  /**
   * 掌上横屏：横过来的触屏，屏幕矮到堆不下几张卡片。
   * ⚠ 门槛是 700 而不是 CSS 那一档的 560：1024×700 的平板横屏照样只有一条能放卡片的横带，
   * 六张卡一起堆下来同样会盖住屏幕正中的自己（实测 v59 在 1024×700 上正是如此）。
   */
  private feedMode(): boolean {
    return isTouchDevice() && window.innerWidth > window.innerHeight && window.innerHeight <= 700;
  }

  /** 只有一条横带的那种矮屏（320~380）：连"一张提示卡 + 一张短公告"都放不下。 */
  private oneLane(): boolean {
    return isTouchDevice() && window.innerHeight <= 380;
  }

  /**
   * 空出来的车道上把下一条端上去。
   * 只有一条车道的矮屏（320~380）一次只端一张，而且严格按先来后到——
   * 两条车道都能上屏时才各补各的。队列本身就是按入队顺序排的，取队头就是"先来的先讲"。
   */
  private pumpFeed(): void {
    if (!this.feedMode() || this.waiting.length === 0) return;
    if (this.holdBand()) return; // 公告正占着横带，卡片等它讲完
    if (this.oneLane()) {
      if (this.liveCards().length > 0) return;
      const [pick] = this.waiting.splice(0, 1);
      this.showCard(pick.el, pick.hold, pick.life);
      return;
    }
    for (const lane of ['tip', 'toast'] as CardLane[]) {
      if (this.laneBusy(lane)) continue;
      const i = this.waiting.findIndex((w) => w.lane === lane);
      if (i < 0) continue;
      const [pick] = this.waiting.splice(i, 1);
      this.showCard(pick.el, pick.hold, pick.life);
    }
  }

  /**
   * 卡片的停留与淡出、公告的停留与淡出，全靠这里推（dt 是秒）。
   *
   * 主循环里**每一帧**都会调它，不只是战斗里（见 main.ts）：暂停面板上那条
   * "按了返回键 · 已暂停"也是排队上屏的，只在战斗里推就永远等不到它。
   * 也别改回 setTimeout：桩件里的定时器只入队不执行，旧写法在无头测试里卡片从没淡出过
   * （"淡出中"那条分支只能靠手动加 class 才测得到）；而浏览器切后台时 rAF 本来就会停，
   * 用帧时间推，卡片就和游戏一起停、一起走，切回来不会一次冒出五条旧消息。
   */
  updateCards(dt: number): void {
    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) {
        this.announceEl.className = 'announce';
        this.announceLinger = 0.32; // 淡出 0.3s 的 transition：这段时间横带还归它
      }
    } else if (this.announceLinger > 0) {
      this.announceLinger -= dt;
    }
    for (const el of this.liveCards()) {
      const t = this.cardTimers.get(el);
      if (!t) continue;
      t.hold -= dt;
      t.life -= dt;
      if (t.life <= 0) {
        // 走 removeChild 而不是 el.remove()：浏览器里两者等价，
        // 但无头桩件只实现了 removeChild，不这么写这一条就测不到。
        this.toastRoot.removeChild(el);
        this.cardTimers.delete(el);
        continue;
      }
      if (t.hold <= 0 && !t.out) {
        t.out = true;
        el.classList.add('is-out');
      }
    }
    this.pumpFeed();
  }

  /**
   * 手机横屏上短公告要**限个数**：开局那几秒图鉴 / 悬赏 / 险境预警会连着冒出来，
   * 实测 844×390 能同时挂住三四条，正好盖住站在屏幕中央的自己。
   * 挂不下就把**最旧的**那条摘掉——它已经读过一遍了，留着只会挡视线。
   *
   * 只数短公告，不数提示卡：提示卡是"讲一次就够"的教学（精英 / 首领 / 险境），
   * 被顶掉等于教学白讲；而会成串冒出来的本来就是短公告。
   * 掌上横屏那条横带现在由 postCard 的车道排队兜着，这里主要管桌面的堆叠。
   */
  private trimCards(): void {
    const cap = isTouchDevice() ? 3 : 5;
    const isToast = (el: Element) => !el.classList.contains('toast--tip');
    let count = Array.from(this.toastRoot.children).filter(isToast).length;
    for (const el of Array.from(this.toastRoot.children)) {
      if (count <= cap) break;
      if (!isToast(el)) continue;
      // 走 removeChild 而不是 el.remove()：浏览器里两者等价，
      // 但无头桩件只实现了 removeChild，不这么写这一条就测不到。
      this.toastRoot.removeChild(el);
      count -= 1;
    }
  }

  /**
   * 公告（关卡名 / 第 N 波 / 首领与精英登场）。
   * 掌上横屏上它和卡片共用那条横带——公告亮着的时候卡片不上屏，而正讲着的卡片先让位：
   * 提示卡退回队头（那句话还得讲完），短公告也退回去（等它讲完公告再讲）。
   * ⚠ 不退让的话就是"公告 + 两张卡片"一起堆下来，正好糊在屏幕正中的自己身上。
   */
  announce(text: string, big = false): void {
    this.announceEl.textContent = text;
    this.announceEl.className = `announce is-show${big ? ' is-big' : ''}`;
    this.announceTimer = big ? 2.4 : 1.6;
    this.announceLinger = 0;
    if (!this.feedMode()) return;
    for (const el of this.liveCards()) {
      const lane = this.laneOf(el);
      const key = el.dataset.cardKey ?? '';
      this.toastRoot.removeChild(el);
      this.cardTimers.delete(el);
      // 让位的提示卡排到队头：它比队里那些还等着的东西更该先讲。
      // 短公告排到队尾之后（讲的就是"此刻"，先让公告把话说完）。
      el.classList.remove('is-out'); // 半透明地"让位"回来的时候要恢复原样
      const item = { el, key, lane, hold: lane === 'tip' ? this.tipHold() : 1.8, life: lane === 'tip' ? this.tipLife() : 2.6 };
      if (this.oneLane() || lane === 'tip') this.waiting.unshift(item);
      else this.waiting.push(item);
    }
    this.trimWaiting();
  }

  private updateBuild(): void {
    const p = this.game.player;
    const sig =
      [...p.weapons].map(([k, v]) => k + v).join(',') +
      '|' +
      [...p.passives].map(([k, v]) => k + v).join(',') +
      '|' +
      [...p.relics].join(',') +
      '|' +
      TRIBES.map((t) => p.tribeTier(t.id)).join('');
    if (sig === this.buildSig) return;
    this.buildSig = sig;
    const w = [...p.weapons]
      .map(([id, lvl]) => {
        const d = WEAPON_MAP[id];
        return `<span class="chip" style="--c:${d?.color ?? '#fff'}">${d?.name ?? id}<i>${lvl}</i></span>`;
      })
      .join('');
    const pas = [...p.passives]
      .map(([id, lvl]) => {
        const d = PASSIVE_MAP[id];
        return `<span class="chip chip--passive" style="--c:${d?.color ?? '#fff'}" title="${d?.name ?? id}">${d?.icon ?? ''}<i>${lvl}</i></span>`;
      })
      .join('');
    const rel = [...p.relics]
      .map((id) => {
        const d = RELIC_MAP[id];
        return `<span class="chip chip--relic" style="--c:${d?.color ?? '#fff'}" title="${d?.name ?? id}">${d?.icon ?? ''}</span>`;
      })
      .join('');
    // 已点亮的共鸣：压缩成一个小芯片挂在遗物后面，战斗中也能一眼看到体系成没成
    const tri = TRIBES.filter((t) => p.tribeTier(t.id) > 0)
      .map((t) => {
        const n = p.tribeCount(t.id);
        return `<span class="chip chip--tri" style="--c:${t.color}" title="灯火共鸣 · ${t.name} ${n} 件">${t.icon}<i>${n}</i></span>`;
      })
      .join('');
    this.buildEl.innerHTML = `<div class="build-row">${w}</div><div class="build-row">${pas}${rel}${tri}</div>`;
  }

  /** 本关夜咒提示（有夜咒才显示）。 */
  private updateCurse(): void {
    const c = this.game.curse;
    const sig = c ? `${c.id}:${this.game.stageIndex}` : '~';
    if (sig === this.curseSig) return;
    this.curseSig = sig;
    if (!c) {
      this.curseEl.textContent = '';
      this.curseEl.classList.remove('is-on');
      return;
    }
    this.curseEl.textContent = `夜咒 · ${c.name} ${c.blurb}`;
    this.curseEl.style.setProperty('--c', c.color);
    this.curseEl.classList.add('is-on');
  }

  /** 本关悬赏：进度条随击杀 / 连杀 / 燃爆 / 静默计时推进。 */
  private updateBounty(): void {
    const b = this.game.bounties.state;
    const sig = b ? `${b.def.id}:${b.done}:${Math.floor(b.progress)}` : '~';
    if (sig === this.bountySig) return;
    this.bountySig = sig;
    if (!b) {
      this.bountyEl.textContent = '';
      this.bountyEl.classList.remove('is-on');
      return;
    }
    const frac = this.game.bounties.frac;
    this.bountyEl.innerHTML =
      `<b>${b.def.icon} ${b.def.name}</b>` +
      `<span>${b.done ? '✓ 已完成' : this.game.bounties.label}</span>` +
      `<i><u style="width:${Math.round(frac * 100)}%"></u></i>`;
    this.bountyEl.style.setProperty('--c', b.def.color);
    this.bountyEl.classList.toggle('is-done', b.done);
    this.bountyEl.classList.add('is-on');
  }

  /** 关卡进度条：填到哪就是打到第几波，最后一段是首领波。 */
  private updateWaveBar(wave: number, total: number, endless: boolean): void {
    const sig = `${wave}/${total}/${endless}`;
    if (sig === this.waveSig) return;
    this.waveSig = sig;
    const fill = this.waveFill;
    const boss = this.waveBoss;
    if (endless) {
      // 无尽没有分母，但每一轮仍是 5 波——进度条改成"离下一轮首领还有几波"
      this.waveBarEl.classList.add('is-endless');
      const phase = wave % 5;
      const frac = wave > 0 && phase === 0 ? 1 : phase / 5;
      fill.style.width = `${frac * 100}%`;
      boss.style.display = '';
      boss.style.left = '80%';
      boss.style.width = '20%';
      return;
    }
    this.waveBarEl.classList.remove('is-endless');
    boss.style.display = '';
    fill.style.width = `${Math.min(100, (wave / total) * 100)}%`;
    // 首领波那一段单独标红：进度条本身就是"还有多久"的答案
    boss.style.left = `${((total - 1) / total) * 100}%`;
    boss.style.width = `${(1 / total) * 100}%`;
  }

  /** 灯台进度：只在还有没点亮的灯台时占屏幕。 */
  private updatePyreChip(): void {
    const total = this.game.pyreTotal;
    const lit = this.game.pyresLit;
    const sig = `${lit}/${total}`;
    if (sig === this.pyreSig) return;
    this.pyreSig = sig;
    if (total <= 0) {
      this.pyreEl.textContent = '';
      this.pyreEl.classList.remove('is-on');
      return;
    }
    const left = total - lit;
    this.pyreEl.innerHTML =
      `<b>🏮 灯台 ${lit}/${total}</b>` +
      `<span>${left > 0 ? '靠近并停留片刻点亮 · 长明一处' : '✓ 此夜长明'}</span>`;
    this.pyreEl.classList.toggle('is-done', left === 0);
    this.pyreEl.classList.add('is-on');
  }

  update(dt: number): void {
    const g = this.game;
    this.updateCards(dt);
    this.width(this.hpFill, g.player.hp / g.player.stats.maxHp);
    this.width(this.oilFill, g.player.oilFrac);
    this.width(this.xpFill, g.xpFrac);
    this.text(this.levelEl, String(g.playerLevel));
    // 波次写出分母：玩家该知道"还剩几波就出首领"，而不是只能数着等
    const totalWaves = g.director.totalWaves;
    const endless = g.endless || !Number.isFinite(totalWaves);
    this.text(this.waveEl, endless ? `∞${g.wave}` : `${g.wave}/${totalWaves}`);
    this.updateWaveBar(g.wave, totalWaves, endless);
    const t = Math.floor(g.runTime);
    this.text(this.timeEl, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.text(this.killEl, String(g.kills));
    this.text(this.emberEl, String(g.save.embers));
    this.text(this.goldEl, String(g.gold));
    this.updateBuild();
    const stage = g.endless ? '无尽 · 长夜' : (STAGES[Math.min(g.stageIndex, STAGES.length - 1)]?.theme.name ?? '');
    this.text(this.stageEl, stage);
    this.setBosses(g.bossList ?? []);
    this.updateCurse();
    this.updateBounty();
    this.updatePyreChip();
    this.updateTouchButtons();

    const comboOn = g.combo >= 3;
    if (comboOn !== this.comboEl.classList.contains('is-on')) this.comboEl.classList.toggle('is-on', comboOn);
    if (comboOn) {
      this.text(this.comboNum, String(g.combo));
      this.width(this.comboBar, g.comboTimer / 2.2);
      this.comboEl.classList.toggle('is-hot', g.combo >= 15);
    }

    const dim = g.player.oilFrac < 0.25;
    const oilBar = this.oilFill.parentElement;
    oilBar?.classList.toggle('is-low', dim);
    // 手里有「倾灯」的时候，油条上刻一道线：那是它"够不够倒"的门槛。
    // 这件武器会自己停下来（灯火不足就整发不出手），光靠观察很难学会这条规矩——
    // 一条刻痕比一句说明管用。没有这件武器就不画（别给别的构筑添噪音）。
    if (oilBar) {
      const hasPour = g.player.weapons.has('pour') || g.player.weapons.has('pour_tide');
      if (hasPour !== oilBar.classList.contains('has-pour')) oilBar.classList.toggle('has-pour', hasPour);
      if (hasPour) oilBar.style.setProperty('--pour-floor', `${(POUR.minOil * 100).toFixed(1)}%`);
    }

  }

  /**
   * 触屏的冲刺 / 燃爆按钮要自己说明"现在能不能按"。
   * 键盘上这两个键在提示条里写着，按下去没反应玩家也知道是冷却；手机上只有一个圆按钮——
   * 冷却圈（`--cd` 驱动的一圈暗色扇面）就是那句"还差多久"，冲刺中再给一下闪光，
   * 告诉玩家"这 0.3 秒你打不到我"（无敌帧在手机上本来是看不见的）。
   * 分档写 style：60fps 下每帧写会让浏览器反复排队样式重算，1/32 档在小圆上看不出来。
   */
  private updateTouchButtons(): void {
    if (!this.dashBtn && !this.novaBtn && !this.lampBtn) return;
    const p = this.game.player;
    if (this.lampBtn) {
      // 分灯不算"按住"，它只有"能不能按"：冷却走一圈，油不够就暗下去
      this.cdRing(this.lampBtn, this.game.lampCdFrac);
      const empty = p.oil < 0.2;
      if (empty !== this.lampEmpty) {
        this.lampEmpty = empty;
        this.lampBtn.classList.toggle('is-empty', empty);
      }
    }
    if (this.dashBtn) {
      this.cdRing(this.dashBtn, p.dashCdFrac);
      const firing = p.dashTimer > 0;
      if (firing !== this.dashFiring) {
        this.dashFiring = firing;
        this.dashBtn.classList.toggle('is-firing', firing);
      }
    }
    if (this.novaBtn) this.cdRing(this.novaBtn, p.novaCdFrac);
  }

  private cdRing(btn: HTMLElement, frac: number): void {
    const step = Math.round(Math.max(0, Math.min(1, frac)) * 32) / 32;
    const key = String(step);
    if (this.lastCd.get(btn) === key) return;
    this.lastCd.set(btn, key);
    if (step <= 0) {
      btn.classList.remove('is-cooling');
      btn.style.removeProperty('--cd');
      return;
    }
    btn.classList.add('is-cooling');
    btn.style.setProperty('--cd', key);
  }
}
