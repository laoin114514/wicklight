import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../data/achievements';
import { LANTERNS, LANTERN_MAP } from '../data/lanterns';
import { FIRE_LEVELS_TOTAL, FIRE_LINES, META_TREE, fireCost } from '../data/meta';
import { PASSIVE_MAP, type PlayerStats } from '../data/upgrades';
import { CODEX_SECTIONS, HAZARD_LABEL } from '../systems/CodexSystem';
import { RELIC_MAP, TRIBES } from '../data/relics';
import { WEAPON_MAP, weaponAt } from '../data/weapons';
import { STAGES, STAGE_MAP } from '../data/stages';
import type { RunRecord } from '../types';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../systems/DifficultySystem';
import { buildDailyPlan, dailyLabel } from '../systems/DailySystem';
import { BOUNTY_MAP } from '../data/bounties';
import { CURSE_MAP } from '../data/curses';
import { GRAZE } from '../data/graze';
import { WICK } from '../data/wick';
import { AURA } from '../data/aura';
import { POUR } from '../data/pour';
import { MINE } from '../data/mines';
import { VORTEX } from '../data/vortex';
import { LAMP } from '../data/lamp';
import { PACTS, PACT_MAP, pactEmberMult } from '../data/pacts';
import { FocusRing } from '../core/Focus';
import type { Game, GameState, UIHost } from '../core/Game';
import { haptic, hapticsAvailable } from '../core/Haptics';
import { isHandheld } from '../core/Perf';
import type { Difficulty, MetaNodeDef, UpgradeOffer, WeaponStats } from '../types';

/**
 * 「第几张」那几块面板：它们的选项本来就用**数字键 / 脸键**直接挑（见 Game.panelHotkeys），
 * 所以焦点环在这几块上不出现——同一个位置两套挑法（"环挪到第 3 张"和"按 3 = 第 3 张"）
 * 只会互相打架。其余十几屏没有这套热键，环就是它们的键盘 / 手柄入口。
 */
const PICK_STATES: ReadonlySet<GameState> = new Set<GameState>(['levelup', 'shop', 'shrine', 'curse']);

export class UIManager implements UIHost {
  private root: HTMLElement;
  /** 焦点环（v82）：把屏幕上那些按钮接给键盘与手柄，见 core/Focus.ts。 */
  private focus = new FocusRing();
  /** 上一次画的是哪一屏：焦点环靠它分辨"换屏"与"原地重画"（见 showScreen）。 */
  private focusState: GameState | null = null;
  /** 这一次 `show` 是不是同一屏的原地重画（showScreen 里算好，show 里用掉）。 */
  private focusSame = false;
  private screen!: HTMLElement;
  private offers: UpgradeOffer[] = [];
  private rerolls = 0;
  private selectedLantern = 'warden';
  private selectedDifficulty: Difficulty = 'normal';
  /** 开局前勾上的「深宵之约」（v79）。跟着这一次会话走，不写进存档：它每局重选。 */
  private selectedPacts = new Set<string>();
  private endless = false;
  private returnState: GameState = 'menu';
  /** 图鉴里正在查看详情的条目（`kind:id`），为空时显示目录。 */
  codexFocus: string | null = null;
  /** 图鉴搜索词（v113）：只看已发现条目，搜索框本身不会把 ??? 翻出来。 */
  private codexQuery = '';

  constructor(private game: Game) {
    this.root = document.getElementById('ui-root') as HTMLElement;
    this.build();
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (this.game.state !== 'codex' || this.codexFocus) return;
        const active = document.activeElement as HTMLElement | null;
        const editing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (editing) return;
        if (e.key !== '/' && e.code !== 'Slash' && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) return;
        const input = this.screen.querySelector('.cx-search__input') as HTMLInputElement | null;
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
      });
    }
  }

  private build(): void {
    const screen = document.createElement('div');
    screen.className = 'screen';
    this.root.appendChild(screen);
    this.screen = screen;
  }

  mountMenus(): void {
    /* screens built on demand */
  }

  setOffers(offers: UpgradeOffer[], rerolls: number): void {
    this.offers = offers;
    this.rerolls = rerolls;
  }

  setMeta(): void {
    /* meta is read live from game */
  }

  refresh(): void {
    this.showScreen(this.game.state);
  }

  showScreen(state: GameState): void {
    // 焦点环要知道"这是换了屏，还是同一屏原地重画"：换了屏环收掉，原地重画按身份找回原处
    // （见 FocusRing.attach）。'select' 那一屏是个好例子——挑灯火 / 挑难度都是原地重画。
    this.focusSame = this.focusState === state;
    this.focusState = state;
    this.screen.className = 'screen';
    switch (state) {
      case 'menu': this.menu(); break;
      case 'select': this.select(); break;
      case 'levelup': this.levelup(); break;
      case 'paused': this.paused(); break;
      case 'loadout': this.loadout(); break;
      case 'shop': this.shop(); break;
      case 'curse': this.curse(); break;
      case 'shrine': this.shrine(); break;
      case 'victory': this.victory(); break;
      case 'dead': this.dead(); break;
      case 'meta': this.meta(); break;
      case 'codex': this.codex(); break;
      case 'records': this.records(); break;
      case 'daily': this.daily(); break;
      case 'achievements': this.achievements(); break;
      case 'settings': this.settings(); break;
      default: this.screen.innerHTML = ''; this.screen.className = 'screen is-hidden'; break;
    }
  }

  private show(html: string, cls = ''): void {
    this.screen.className = `screen is-visible ${cls}`;
    this.screen.innerHTML = html;
    // 每画一屏都重新收一遍焦点环能落到的东西（换屏 / 重画面板之后环要回到原处或就地夹住，
    // 见 FocusRing.attach）；那三块"第几张"的面板直接关掉环，理由见上面 PICK_STATES。
    this.focus.attach(this.screen, !PICK_STATES.has(this.game.state), this.focusSame);
  }

  private on(sel: string, fn: (el: HTMLElement) => void): void {
    const el = this.screen.querySelector(sel) as HTMLElement | null;
    if (el) el.addEventListener('click', () => fn(el));
  }

  private onAll(sel: string, fn: (el: HTMLElement) => void): void {
    this.screen.querySelectorAll(sel).forEach((el) => {
      el.addEventListener('click', () => fn(el as HTMLElement));
    });
  }

  // ─────────────────── screens ───────────────────

  private menu(): void {
    const save = this.game.save;
    const endlessUnlocked = save.best >= 1;
    const cleared = Math.min(save.best, 3);
    this.show(`
      <div class="panel panel--menu panel--banner">
        <div class="menu-head">
          <div class="title">WICK<span>LIGHT</span></div>
          <div class="subtitle">灯芯 · 让光活下去</div>
        </div>
        <div class="menu-body">
          <div class="menu-main">
            <button class="btn btn--primary btn--hero" data-act="play">
              <span class="btn__glyph">✦</span>
              <span class="btn__label">开始冒险<span class="key">回车</span></span>
              <span class="btn__sub">幽林 → 长夜之城</span>
            </button>
            <div class="menu-runs">
              <button class="btn btn--run ${endlessUnlocked ? '' : 'is-locked'}" data-act="endless">
                <span class="btn__glyph">∞</span>
                <span class="btn__label">无尽之夜</span>
                <i class="btn__note">${endlessUnlocked ? '一波接一波' : '通关幽林解锁'}</i>
              </button>
              <button class="btn btn--run btn--daily" data-act="daily">
                <span class="btn__glyph">☾</span>
                <span class="btn__label">今日灯芯</span>
                <i class="btn__note">${dailyLabel(buildDailyPlan())}</i>
              </button>
            </div>
          </div>
          <div class="menu-ledger">
            <button class="ledger-row" data-act="meta">
              <span class="ledger-row__mark"></span><span class="ledger-row__name">余烬解锁</span><b class="ledger-row__val">${save.embers}</b>
            </button>
            <button class="ledger-row" data-act="codex">
              <span class="ledger-row__mark"></span><span class="ledger-row__name">图鉴</span><b class="ledger-row__val">${this.game.codex.seenCount()}/${this.game.codex.total()}</b>
            </button>
            <button class="ledger-row" data-act="records">
              <span class="ledger-row__mark"></span><span class="ledger-row__name">生涯档案</span><b class="ledger-row__val">${save.runs} 局</b>
            </button>
            <button class="ledger-row" data-act="achievements">
              <span class="ledger-row__mark"></span><span class="ledger-row__name">成就</span><b class="ledger-row__val">${save.achievements.length}/${ACHIEVEMENTS.length}</b>
            </button>
            <button class="ledger-row" data-act="settings">
              <span class="ledger-row__mark"></span><span class="ledger-row__name">设置</span><b class="ledger-row__val ledger-row__val--hint">画质 · 触感 · 音效</b>
            </button>
          </div>
          <div class="menu-foot">
            <span>最高关卡 ${cleared}/3</span>
            <span>余烬 ${save.embers}</span>
            <span>总击杀 ${save.killsTotal}</span>
            <span>无尽最佳 ${save.bestEndlessWave} 波</span>
            <span>生涯 ${save.runs} 局</span>
          </div>
        </div>
      </div>
    `);
    this.on('[data-act="play"]', () => { this.endless = false; this.openSelect(); });
    this.on('[data-act="endless"]', () => {
      if (!endlessUnlocked) return;
      this.endless = true;
      this.openSelect();
    });
    this.on('[data-act="daily"]', () => { this.returnState = 'menu'; this.game.openMenu('daily'); });
    this.on('[data-act="meta"]', () => { this.returnState = 'menu'; this.game.openMenu('meta'); });
    this.on('[data-act="codex"]', () => { this.returnState = 'menu'; this.codexFocus = null; this.game.openMenu('codex'); });
    this.on('[data-act="records"]', () => { this.returnState = 'menu'; this.game.openMenu('records'); });
    this.on('[data-act="achievements"]', () => { this.returnState = 'menu'; this.game.openMenu('achievements'); });
    this.on('[data-act="settings"]', () => { this.returnState = 'menu'; this.game.openMenu('settings'); });
  }

  // ─────────────────── 焦点环（v82）───────────────────

  /**
   * 这一帧的方向意图（战斗之外由 main.ts 每帧调一次）。
   * `now` 是秒；"按住会自己走"那个节奏在 FocusRing 里（先 0.35 秒、之后每 0.11 秒一格）。
   */
  focusMove(now: number, dx: number, dy: number): boolean {
    return this.focus.move(now, dx, dy);
  }

  /** 按下环上那一项。环还没亮（或者这一屏没有可点的东西）就返回假，交给面板自己的主按钮。 */
  focusActivate(): boolean {
    return this.focus.activate();
  }

  /** `Esc` / `Ⓑ`：这一屏有"返回"就按它。 */
  focusBack(): boolean {
    return this.focus.backAction();
  }

  /** 环现在在第几项（-1 = 还没亮）。测试与调试用：屏幕上那圈光是画出来的，读不到就只能问它。 */
  get focusIndex(): number {
    return this.focus.index;
  }

  /**
   * 结算面板上的**主按钮**，交给键盘走：死亡 = 再点一盏、通关 = 挑战无尽之夜。
   *
   * 它和 `Game.pickOffer` 是同一类东西（把面板上那颗按钮接给键盘），但落点不一样：
   * 那三个"选第几张"选的是一份游戏状态，而这两个按钮按下去是**换一块面板**
   * （其中"挑战无尽之夜"还要先把 `endless` 这个界面自己的开关拨上去）——
   * 面板的班次该由面板自己交代。
   *
   * v82 起它也认**主菜单**（开始冒险）与**选灯火**（点燃灯芯）：手柄没有指针，
   * 而手柄玩家的第一件事就是把这一局点起来——`Start` / 回车在这两屏上按下去
   * 正是那颗主按钮（`Ⓐ` 也行，见 main.ts 里那一段）。
   *
   * 只认这两处（结算 / 菜单 / 选灯火）：商店那颗"继续前进"是另一回事。它意味着"我买完了"，
   * 而这里意味着"我读完了"——同一颗回车在两处各自表示什么，得说清楚，不然迟早有人在补给站里
   * 习惯性按下回车，然后带着一钱包金币上了下一关。
   */
  panelPrimary(): boolean {
    if (this.game.state === 'dead' || this.game.state === 'menu') {
      this.game.openMenu('select');
      return true;
    }
    if (this.game.state === 'victory') {
      this.endless = true;
      this.openSelect();
      return true;
    }
    if (this.game.state === 'select') {
      this.game.newRun(this.selectedLantern, this.selectedDifficulty, this.endless, null, [...this.selectedPacts]);
      return true;
    }
    return false;
  }

  private openSelect(): void {
    this.selectedLantern = LANTERNS.find((l) => this.game.save.unlockedLanterns.includes(l.id))?.id ?? 'warden';
    this.game.openMenu('select');
  }

  private select(): void {
    const unlocked = this.game.save.unlockedLanterns;
    const lanternCards = LANTERNS.map((l) => {
      const ok = unlocked.includes(l.id);
      const sel = l.id === this.selectedLantern;
      const weapon = WEAPON_MAP[l.weapon]?.name ?? l.weapon;
      const passive = PASSIVE_MAP[l.passive]?.name ?? l.passive;
      const badge = sel
        ? '<span class="lantern__state is-on">已选</span>'
        : ok ? '' : '<span class="lantern__state is-locked">未解锁</span>';
      return `
        <button class="lantern ${sel ? 'is-selected' : ''} ${ok ? '' : 'is-locked'}" data-lantern="${l.id}" aria-pressed="${sel}" style="--accent:${l.color}">
          ${badge}
          <span class="lantern__flame" style="background:radial-gradient(circle at 50% 40%, #fff, ${l.color} 45%, transparent 75%)"></span>
          <span class="lantern__copy">
            <span class="lantern__name">${l.name}</span>
            <span class="lantern__title">${l.title}</span>
          </span>
          <span class="lantern__blurb">${ok ? l.blurb : '尚未解锁 · 前往余烬解锁'}</span>
          ${ok ? `<span class="lantern__kit"><i><span>武器</span><b>${weapon}</b></i><i><span>被动</span><b>${passive}</b></i></span>` : ''}
        </button>`;
    }).join('');

    // 「深宵之约」（v79）：自己给自己加难度。锁着的时候把**规矩**说出来（什么时候开、
    // 它不吃今日灯芯），而不是只画一排灰按钮——玩家该知道那是什么，才谈得上期待。
    const pactOpen = this.game.pactsAvailable();
    const pactCount = this.selectedPacts.size;
    const pactCards = PACTS.map((p) => {
      const on = this.selectedPacts.has(p.id);
      return `<button class="pact ${on ? 'is-selected' : ''}" data-pact="${p.id}" style="--accent:${p.color}">
        <b>${p.icon} ${p.name}</b><span>${p.detail}</span>
      </button>`;
    }).join('');
    const pactRow = pactOpen
      ? `<div class="pact-row">${pactCards}</div>
        <div class="pact-note">${
          pactCount
            ? `背 ${pactCount} 条 · 结算余烬 ×${pactEmberMult([...this.selectedPacts]).toFixed(2)}`
            : '一条不背 · 就是平常那一夜'
        }</div>`
      : `<div class="pact-locked">🔒 通关一次之后开启：那之后你可以自己决定这一夜有多难（今日灯芯不吃这一套）</div>`;

    const diffTones: Record<Difficulty, { tone: string; sigil: string; rank: number }> = {
      relaxed: { tone: '#9bd6c7', sigil: '◔', rank: 1 },
      normal: { tone: '#ffd28a', sigil: '◐', rank: 2 },
      nightmare: { tone: '#ff7a6f', sigil: '●', rank: 3 },
    };
    const diffCards = DIFFICULTY_ORDER.map((d) => {
      const mods = DIFFICULTIES[d];
      const tone = diffTones[d];
      const pips = [0, 1, 2].map((i) => `<i class="${i < tone.rank ? 'is-lit' : ''}"></i>`).join('');
      return `<button class="diff ${d === this.selectedDifficulty ? 'is-selected' : ''}" data-diff="${d}" style="--c:${tone.tone}">
        <span class="diff__top"><span class="diff__sigil" aria-hidden="true">${tone.sigil}</span><b>${mods.label}</b></span>
        <span class="diff__blurb">${mods.blurb}</span>
        <span class="diff__foot">
          <span class="diff__meter" aria-hidden="true">${pips}</span>
          <span class="diff__stats"><i>敌血 <b>×${mods.hpMult.toFixed(2)}</b></i><i>余烬 <b>×${mods.emberMult.toFixed(2)}</b></i></span>
        </span>
      </button>`;
    }).join('');

    this.show(`
      <div class="panel panel--select">
        <header class="select-head">
          <span class="select-head__kicker">守夜整备</span>
          <div class="panel__title select-head__title">${this.endless ? '无尽之夜' : '冒险 · 选择灯火与难度'}</div>
          <p class="select-head__sub">${LANTERNS.length} 盏灯，${LANTERNS.length} 种开局。选中的灯火会一路陪你到天亮。</p>
        </header>
        <div class="lantern-grid">${lanternCards}</div>
        <div class="diff-row">${diffCards}</div>
        <div class="pact-block">
          <div class="pact-head"><b>深宵之约</b><span>每背一条，敌人与这一夜都更狠一点，结算的余烬也多一份</span></div>
          ${pactRow}
        </div>
        <div class="row-actions select-actions">
          <button class="btn" data-act="back">返回</button>
          <button class="btn btn--primary" data-act="start">点燃灯芯<span class="key">回车</span></button>
        </div>
      </div>
    `);
    this.onAll('[data-lantern]', (el) => {
      const id = el.dataset.lantern as string;
      if (!this.game.save.unlockedLanterns.includes(id)) return;
      this.selectedLantern = id;
      this.showScreen('select');
    });
    this.onAll('[data-diff]', (el) => {
      this.selectedDifficulty = el.dataset.diff as Difficulty;
      this.showScreen('select');
    });
    this.onAll('[data-pact]', (el) => {
      if (!this.game.pactsAvailable()) return;
      const id = el.dataset.pact as string;
      if (this.selectedPacts.has(id)) this.selectedPacts.delete(id);
      else this.selectedPacts.add(id);
      this.showScreen('select');
    });
    this.on('[data-act="back"]', () => this.game.goMenu());
    this.on('[data-act="start"]', () =>
      this.game.newRun(this.selectedLantern, this.selectedDifficulty, this.endless, null, [...this.selectedPacts]),
    );
  }

  /** 这张卡是否会把某件武器推过进化门槛（满级武器 + 被动点满）。 */
  private evolutionHint(o: UpgradeOffer): string {
    const p = this.game.player;
    if (o.kind === 'passive') {
      const passive = PASSIVE_MAP[o.id];
      if (!passive || o.level < passive.maxLevel) return '';
      const targets = [...p.weapons.entries()]
        .filter(([id, lvl]) => {
          const def = WEAPON_MAP[id];
          return def?.evolve?.passive === o.id && lvl >= def.levels.length;
        })
        .map(([id]) => WEAPON_MAP[id]);
      if (!targets.length) return '';
      return `<div class="card__hint">🌟 点满即可进化：${targets.map((d) => WEAPON_MAP[d.evolve!.into]?.name ?? '').filter(Boolean).join('、')}</div>`;
    }
    if (o.kind === 'weapon' && o.tag === 'level') {
      const def = WEAPON_MAP[o.id];
      if (!def?.evolve) return '';
      if (o.level < def.levels.length) return '';
      const need = PASSIVE_MAP[def.evolve.passive]?.maxLevel ?? 0;
      const have = p.passiveLevel(def.evolve.passive);
      return have >= need
        ? `<div class="card__hint">🌟 满足进化条件，下一张卡即可进化</div>`
        : `<div class="card__hint">满级后再点满「${PASSIVE_MAP[def.evolve.passive]?.name ?? def.evolve.passive}」（${have}/${need}）即可进化</div>`;
    }
    if (o.tag === 'evolve') return `<div class="card__hint">🌟 满级武器 + 满级被动 = 进化</div>`;
    return '';
  }

  /**
   * 等级刻度：一格一级，已经拿到的亮着，这张卡要点亮的那一格在呼吸。
   * 三选一里最该一眼看出的就是"这一张是把谁推到第几级"。
   */
  private levelPips(o: UpgradeOffer): string {
    const pips = Array.from({ length: Math.max(1, o.maxLevel) }, (_, i) => {
      const cls = i < o.level - 1 ? 'is-on' : i === o.level - 1 ? 'is-next' : '';
      return `<i${cls ? ` class="${cls}"` : ''}></i>`;
    }).join('');
    return `<div class="card__pips" title="Lv ${o.level}/${o.maxLevel}">${pips}</div>`;
  }

  /**
   * 卡片左上角那枚数字小片：它说的是"按这个键等于点这张卡"（见 InputState 里"面板热键"那一段）。
   *
   * 做成一个方法而不是各面板手写一遍，是为了让"第几张"这个意思只有一处产出——
   * 三块面板上的卡片是三条不同的 DOM，索引却必须是同一个（`Game.pickOffer` 那边的下标）。
   * 手机上没有键盘，`body.is-touch .key` 会把整片藏掉（沿用 `Tab` 提示那条老规矩）。
   */
  private hotkey(index: number): string {
    return `<span class="key hotkey">${index + 1}</span>`;
  }

  private offerCard(o: UpgradeOffer, index: number): string {
    const tagLabel = o.tag === 'evolve' ? '进化' : o.tag === 'new' ? '新' : '升级';
    return `<button class="card ${o.tag === 'evolve' ? 'card--evolve' : ''}" data-offer="${o.kind}:${o.id}" style="--accent:${o.color}">
      <div class="card__icon">${o.icon}</div>
      <div class="card__top">
        <span class="card__tag">${this.hotkey(index)}${tagLabel}</span>
        <span class="card__lv">Lv ${o.level}/${o.maxLevel}</span>
      </div>
      ${this.levelPips(o)}
      <div class="card__name">${o.name}</div>
      <div class="card__blurb">${o.blurb}</div>
      ${this.offerDelta(o, o.tag === 'evolve' ? 2 : 3)}
      ${this.evolutionHint(o)}
    </button>`;
  }

  /** 一行"这一级改了什么"：`伤害 12 → 15`。
   *  升级卡光有一句简介不够——简介说的是这把武器是什么，玩家真正要权衡的是下一级的数。 */
  private offerDelta(o: UpgradeOffer, max = 3): string {
    const rows = this.deltaRows(o).slice(0, max);
    if (!rows.length) return '';
    const cells = rows
      .map((r) => {
        const from = r.from === undefined ? '' : `<span class="dl__from">${r.from}</span><span class="dl__arrow">→</span>`;
        return `<span class="dl"><span class="dl__k">${r.k}</span>${from}<span class="dl__to">${r.to}</span></span>`;
      })
      .join('');
    return `<div class="card__delta">${cells}</div>`;
  }

  private deltaRows(o: UpgradeOffer): { k: string; from?: string; to: string }[] {
    if (o.kind === 'weapon') {
      const cur = this.game.player.weapons.get(o.id) ?? 0;
      if (o.tag === 'evolve') {
        const pred = Object.entries(WEAPON_MAP).find(([, d]) => d.evolve?.into === o.id);
        const before = pred ? weaponAt(pred[0], pred[1].levels.length) : null;
        // 进化卡只留两行，而且先排"变强"的那几个：进化本来就是换一种打法，
        // 进阶武器少一两发/少一层穿透是设计，把它当成"缩水"写出来只会误导。
        return weaponRows(before, weaponAt(o.id, 1), ['damage', 'cooldown', 'range', 'speed', 'count', 'radius', 'pierce', 'knockback', 'burn', 'slow']);
      }
      if (o.tag === 'new') return weaponRows(null, weaponAt(o.id, 1));
      return weaponRows(weaponAt(o.id, cur), weaponAt(o.id, cur + 1));
    }
    const before = this.game.player.previewStats();
    const after = this.game.player.previewStats({ id: o.id, level: o.level });
    const rows = PASSIVE_STAT_ROWS.filter((row) => changed(before[row.key], after[row.key]))
      .map((row) => ({
        k: row.label,
        from: formatStat(row, before[row.key]),
        to: formatStat(row, after[row.key]),
        score: Math.abs(after[row.key] - before[row.key]) / Math.max(1e-6, Math.abs(before[row.key])),
      }))
      .sort((a, b) => b.score - a.score);
    return rows;
  }

  private levelup(): void {
    const cards = this.offers.map((o, i) => this.offerCard(o, i)).join('');
    const count = this.offers.length;
    const hotkeys = this.offers.map((_, i) => i + 1).join(' / ');
    this.show(`
      <div class="panel panel--levelup panel--plank">
        <header class="lvl-head">
          <div class="lvl-head__copy">
            <span class="lvl-head__kicker">夜火抉择</span>
            <div class="panel__title lvl-head__title">灯火更亮 · Lv ${this.game.playerLevel}</div>
            <p class="lvl-head__sub">${count} 簇火，只添一簇。选中的路会一直亮到这一夜结束。</p>
          </div>
          <div class="lvl-head__count" aria-hidden="true"><b>${count}</b><span>选一</span></div>
        </header>
        <div class="card-grid lvl-grid">${cards}</div>
        <div class="row-actions lvl-actions">
          <button class="btn ${this.rerolls > 0 ? '' : 'is-locked'}" data-act="reroll">重掷 (${this.rerolls})<span class="key">R</span></button>
          <span class="lvl-actions__hint">按 ${hotkeys} 直接选牌</span>
        </div>
      </div>
    `);
    this.onAll('[data-offer]', (el) => {
      const key = el.dataset.offer as string;
      const [kind, id] = key.split(':');
      const offer = this.offers.find((o) => o.kind === kind && o.id === id);
      if (offer) this.game.chooseUpgrade(offer);
    });
    this.on('[data-act="reroll"]', () => {
      if (this.rerolls <= 0) return;
      this.game.reroll();
    });
  }

  private paused(): void {
    const g = this.game;
    const s = g.runStats();
    const lantern = LANTERN_MAP[g.lanternId];
    const stage = STAGES[Math.min(g.stageIndex, STAGES.length - 1)];
    const diff = DIFFICULTIES[g.difficulty];
    const mode = g.endless ? '无尽之夜' : g.dailyPlan ? '今日灯芯' : diff.label;
    const where = g.endless ? `无尽 · 第 ${s.wave} 波` : `第 ${s.stage} 关 · ${stage.theme.name} · 波次 ${s.wave}`;
    const curse = g.curse;
    const bounty = g.bounties.state;
    this.show(`
      <div class="panel panel--pause panel--board">
        <header class="pause-head">
          <div class="pause-head__copy">
            <span class="pause-head__kicker">夜巡暂歇 · 灯火未熄</span>
            <div class="panel__title pause-head__title">暂停</div>
          </div>
          <div class="pause-clock"><span>本夜已守</span><b>${UIManager.clock(s.time)}</b><i>${where}</i></div>
        </header>

        <div class="pause-body">
          <section class="pause-brief">
            <div class="pause-brief__label"><span>当前局</span><i>${mode}</i></div>
            <div class="pause-ident" style="--accent:${lantern?.color ?? '#ffb14e'}">
              <i class="pause-ident__glyph" aria-hidden="true">${(lantern?.name ?? '灯').slice(0, 1)}</i>
              <div class="pause-ident__text">
                <b>${lantern?.name ?? g.lanternId}</b>
                <span>${diff.label} · ${stage.theme.name} · 波次 ${s.wave}</span>
              </div>
            </div>
            <div class="pause-stats">
              <div><span>击杀</span><b>${s.kills}</b></div>
              <div><span>等级</span><b>Lv ${s.level}</b></div>
              <div><span>最高连杀</span><b>${s.bestCombo}</b></div>
              <div><span>首领</span><b>${s.bossKills}</b></div>
            </div>
            <div class="pause-threats">
              <span class="pause-chip${curse ? '' : ' is-calm'}" style="--accent:${curse?.color ?? '#9ba48f'}"><i>夜咒</i><b>${curse?.name ?? '无'}</b></span>
              ${bounty ? `<span class="pause-chip${bounty.done ? ' is-done' : ''}" style="--accent:${bounty.def.color}"><i>悬赏</i><b>${bounty.def.name}</b></span>` : ''}
            </div>
          </section>

          <section class="pause-actions">
            <button class="btn btn--primary pause-act" data-act="resume">
              <b>继续</b><span>回到灯火里</span><span class="key pause-act__key">Esc</span>
            </button>
            <button class="btn pause-act" data-act="sheet">
              <b>构筑总览</b><span>武器 · 遗物 · 夜咒</span><span class="key pause-act__key">Tab</span>
            </button>
            <button class="btn pause-act" data-act="settings">
              <b>设置</b><span>声音 · 画面 · 手感</span><span class="key pause-act__key">⚙</span>
            </button>
            <button class="btn pause-act pause-act--danger" data-act="quit">
              <b>放弃本次冒险</b><span>这一夜的收获不会结算</span><span class="pause-act__mark" aria-hidden="true">熄</span>
            </button>
          </section>
        </div>
      </div>
    `);
    this.on('[data-act="resume"]', () => this.game.togglePause());
    this.on('[data-act="sheet"]', () => {
      this.returnState = 'paused';
      this.game.toggleSheet();
    });
    this.on('[data-act="settings"]', () => this.openOverlay('settings'));
    this.on('[data-act="quit"]', () => this.game.goMenu());
  }

  private loadout(): void {
    const g = this.game;
    const p = g.player;
    const s = g.runStats();
    const diff = DIFFICULTIES[g.difficulty];
    const stage = STAGES[Math.min(g.stageIndex, STAGES.length - 1)];

    const weapons = [...p.weapons.entries()]
      .map(([id, lvl]) => {
        const def = WEAPON_MAP[id];
        if (!def) return '';
        const max = def.levels.length;
        const full = lvl >= max;
        const stats = weaponAt(id, lvl);
        // 「燎灯」那一行的读法和别的武器不一样：它那一下就烫**光里全体**，
        // 只写"伤害 10"会被读成一件很弱的武器（那是**每只**挨的）。这一行是构筑总览，
        // 玩家就是在这儿决定"要不要往这一件上再投一级"，所以这里必须说清楚。
        const hitAll = def.kind === 'aura' ? ' · 光里全体' : '';
        return `<div class="lo-row" style="--c:${def.color}">
          <span class="lo-row__name">${def.name}${def.evolved ? '<i class="lo-tag lo-tag--evo">进化</i>' : ''}</span>
          <span class="lo-row__lv ${full ? 'is-full' : ''}">Lv ${lvl}/${max}</span>
          <span class="lo-row__blurb">伤害 ${Math.round(stats.damage)} · 间隔 ${stats.cooldown > 0 ? `${stats.cooldown.toFixed(2)}s` : '常驻'}${stats.count > 1 ? ` · ${stats.count} 发` : ''}${hitAll}</span>
        </div>`;
      })
      .join('');

    const relics = [...p.relics]
      .map((id) => {
        const def = RELIC_MAP[id];
        if (!def) return '';
        return `<div class="lo-row" style="--c:${def.color}">
          <span class="lo-row__name">${def.icon} ${def.name}</span>
          <span class="lo-row__lv">${def.rarity === 'epic' ? '史诗' : def.rarity === 'rare' ? '稀有' : '普通'}</span>
          <span class="lo-row__blurb">${def.blurb}</span>
        </div>`;
      })
      .join('');

    // 灯火共鸣：把「还差几件、凑齐了给什么」写在遗物旁边，构筑方向才看得见
    const tribeRows = TRIBES.map((t) => {
      const n = p.tribeCount(t.id);
      const tier = p.tribeTier(t.id);
      const next = t.tiers[tier];
      const on = tier > 0;
      const active = on ? t.tiers.slice(0, tier).map((x) => x.blurb).join(' · ') : '';
      const hint = next ? `${on ? '还差' : '再集'} ${next.count - n} 件 → ${next.blurb}` : '已满';
      return `<div class="lo-tri ${on ? 'is-on' : ''}" style="--c:${t.color}">
        <span class="lo-tri__head"><b>${t.icon} ${t.name}</b><i>${n} 件</i></span>
        <span class="lo-tri__body">${on ? active : t.blurb} ｜ ${hint}</span>
      </div>`;
    }).join('');

    const passives = [...p.passives.entries()]
      .map(([id, lvl]) => {
        const def = PASSIVE_MAP[id];
        if (!def) return '';
        return `<div class="lo-row lo-row--tight">
          <span class="lo-row__name">${def.name}</span>
          <span class="lo-row__lv is-full">Lv ${lvl}/${def.maxLevel}</span>
        </div>`;
      })
      .join('');

    // 进化路线：把"离进化还差什么"直接写出来，肉鸽里最该给玩家的就是这种确定信息
    const evoRows = [...p.weapons.entries()]
      .map(([id, lvl]) => {
        const def = WEAPON_MAP[id];
        if (!def || !def.evolve) return '';
        const max = def.levels.length;
        const passive = PASSIVE_MAP[def.evolve.passive];
        const need = passive?.maxLevel ?? 0;
        const have = p.passiveLevel(def.evolve.passive);
        const into = WEAPON_MAP[def.evolve.into];
        const ready = lvl >= max && have >= need;
        return `<div class="lo-evo ${ready ? 'is-ready' : ''}" style="--c:${def.color}">
          <div class="lo-evo__head">
            <i class="lo-evo__seal" aria-hidden="true"></i>
            <b>${def.name}</b>
            <i class="lo-evo__route" aria-hidden="true"></i>
            <em>${into?.name ?? def.evolve.into}</em>
          </div>
          <div class="lo-evo__need">
            <span class="lo-evo__req ${lvl >= max ? 'is-met' : ''}">武器 ${lvl}/${max}</span>
            <span class="lo-evo__req ${have >= need ? 'is-met' : ''}">${passive?.name ?? def.evolve.passive} ${have}/${need}</span>
          </div>
        </div>`;
      })
      .join('') || '<div class="lo-empty">当前武器还没有可走的进化路线</div>';

    const st = p.stats;
    const attrs = [
      ['伤害倍率', `×${st.damageMult.toFixed(2)}`],
      ['攻击冷却', `×${st.cooldownMult.toFixed(2)}`],
      ['范围', `×${st.areaMult.toFixed(2)}`],
      ['暴击', `${Math.round(st.critChance * 100)}% / ×${st.critMult.toFixed(2)}`],
      ['移动速度', `${Math.round(st.moveSpeed)}`],
      ['生命上限', `${Math.round(st.maxHp)}`],
      ['灯油耗率', `×${st.oilDecayMult.toFixed(2)}`],
      ['拾取范围', `${Math.round(st.pickupRange)}`],
    ]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
      .join('');

    const curse = g.curse
      ? `<div class="lo-curse"><b>${g.curse.name}</b><span>${g.curse.blurb}</span></div>`
      : '<div class="lo-empty">本关暂无夜咒</div>';

    const graze = this.grazeBlock();
    const mineBlock = this.mineBlock();
    const vortexBlock = this.vortexBlock();
    const lampBlock = this.lampBlock();

    const b = g.bounties.state;
    const bounty = b
      ? `<div class="lo-bounty ${b.done ? 'is-done' : ''}" style="--c:${b.def.color}">
          <b>${b.def.icon} ${b.def.name}</b>
          <span>${b.done ? '已完成 · 奖励已发放' : `${b.def.blurb}（${g.bounties.label}）· 奖励 ${b.def.reward.gold} 金币`}</span>
        </div>`
      : '<div class="lo-empty">本关没有悬赏</div>';

    this.show(`
      <div class="panel panel--loadout panel--board">
        <div class="panel__title">构筑总览</div>
        <div class="lo-head">
          <b>${LANTERN_MAP[g.lanternId]?.name ?? '灯火'}</b>
          <span>${diff.label}${g.endless ? ' · 无尽之夜' : ''} · 第 ${g.stageIndex + 1} 关 · ${stage.theme.name} · 波次 ${g.wave}</span>
        </div>
        <div class="stats">
          <div><span>击杀</span><b>${s.kills}</b></div>
          <div><span>等级</span><b>${s.level}</b></div>
          <div><span>存活</span><b>${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</b></div>
          <div><span>金币</span><b>${g.gold}</b></div>
          <div><span>造成伤害</span><b>${num(s.damageDealt)}</b></div>
          <div><span>最高连击</span><b>${s.bestCombo}</b></div>
        </div>
        <div class="lo-grid">
          <section class="lo-col">
            <h4>武器 <b>${p.weapons.size}</b></h4>
            ${weapons || '<div class="lo-empty">还没有武器</div>'}
            <h4>被动 <b>${p.passives.size}</b></h4>
            ${passives || '<div class="lo-empty">还没有被动</div>'}
            <h4>进化路线</h4>
            ${evoRows}
            ${this.damageBlock()}
          </section>
          <section class="lo-col">
            <h4>遗物 <b>${p.relics.size}</b></h4>
            ${relics || '<div class="lo-empty">还没有遗物</div>'}
            <h4>灯火共鸣</h4>
            ${tribeRows}
            <h4>灯火</h4>
            ${this.lightBlock()}
            <h4>夜咒</h4>
            ${curse}
            <h4>深宵之约</h4>
            ${this.pactBlock()}
            <h4>悬赏</h4>
            ${bounty}
            <h4>掠影</h4>
            ${graze}
            ${mineBlock ? `<h4>伏灯</h4>${mineBlock}` : ''}
            ${vortexBlock ? `<h4>旋灯</h4>${vortexBlock}` : ''}
            ${lampBlock ? `<h4>弃灯</h4>${lampBlock}` : ''}
          </section>
        </div>
        <div class="lo-attrs">${attrs}</div>
        <div class="row-actions"><button class="btn btn--primary" data-act="sheet-close">返回战斗 <span class="key">Tab</span></button></div>
      </div>
    `);
    this.on('[data-act="sheet-close"]', () => this.game.toggleSheet());
  }

  /**
   * 构筑总览里的「灯火」栏：半径 / 亮度 / 火力这三个数，以及拨芯现在开着没有。
   *
   * 为什么要单独放一栏：这三个数从前一个都不在界面上——玩家只知道"灯亮了 / 灯暗了"，
   * 却不知道**暗下来意味着多少**（索敌范围就是跟着半径走的，怪站在 340px 外就完全打不到）。
   * 拨芯把"烧多旺"变成玩家自己拨的一格之后，这三个数就成了一笔**要自己算的账**：
   * 拨小 65% 油耗、代价是半径与火力一起缩——把两边并排写出来，这笔账才看得见。
   *
   * v75 / v76 起，围绕这桶油的三族遗物（拨芯 / 燎灯 / 倾灯）都写在这一栏里。
   * 为什么不是各开一栏：它们买的是**同一个东西**的三个方向——收着烧、照着烧、泼出去烧——
   * 玩家的决定本来就是"我这桶油怎么用"。分成三栏等于把一次取舍拆成三张清单给他做。
   */
  private lightBlock(): string {
    const p = this.game.player;
    const dim = p.wickOn;
    const f = p.flags;
    // 「拨芯」这条线上的四件遗物（一族一件，见 data/relics.ts）：拿到哪件写哪件。
    // 为什么写在这里：这一栏讲的就是"拨芯这笔账"，而那四件改的正是这笔账的四个角。
    // 没拿的时候不写——空格子不叫信息。
    const family: string[] = [];
    if (f.wickGuard) family.push(`遮光 减伤 ${Math.round(f.wickGuard * 100)}%`);
    if (f.wickEmber) family.push(`暗火 每次命中 +${f.wickEmber} 层灼烧`);
    if (f.wickStride) family.push(`夜步 移速 +${Math.round(f.wickStride * 100)}%`);
    if (f.wickThrift) family.push(`守芯 每秒回油 +${(f.wickThrift * 100).toFixed(1)}%`);
    // 「燎灯」这条线上的四件（v75，一族一件，见 data/relics.ts）：和拨芯那四件**同住一栏**是刻意的——
    // 玩家要读到的正是它们**在打架**（一边说"收小省油"，一边说"照宽多烧"），
    // 摆成两栏等于让"一次开局只该选一边"这句话没有地方可写。
    // 漫光的代价挂在**同一个数的旁边**（半径 +10% 用的是 `lightSpread`，油烧快 12% 是另一条 mod）：
    // 只写收益不写代价，这一行就成了店里那张说明的残句。
    const auraFam: string[] = [];
    if (f.auraCrowd) auraFam.push(`旺火 每多一只 +${Math.round(f.auraCrowd * 100)}%（最多 +${Math.round(AURA.crowdBonusMax * 100)}%）`);
    if (f.lightSpread) {
      const cost = RELIC_MAP.auralantern?.mods.oilDecayMult ?? 0;
      auraFam.push(`漫光 灯火半径 +${Math.round(f.lightSpread * 100)}% · 油烧快 ${Math.round(cost * 100)}%`);
    }
    if (f.auraSiphon) auraFam.push(`吮灯 每烫到一只回油 ${(f.auraSiphon * 100).toFixed(2)}%`);
    if (f.auraSnare) auraFam.push(`烟熏 被烫到的慢 ${Math.round(f.auraSnare * 100)}% · ${AURA.snareSpan}s`);
    // 「倾灯」这条线上的四件（v76，一族一件）：也住在这里，理由和上面那条一样——
    // 三族买的全是**同一桶油**的三个方向（拨芯：收着烧 · 漫光：照着烧 · 倾灯：泼出去烧），
    // 摆在同一栏里，那笔账才是"我这桶油到底怎么用"，而不是三张互不相干的清单。
    const pourFam: string[] = [];
    if (f.pourStacks) pourFam.push(`浇油 火每 ${POUR.igniteEvery}s 续 ${POUR.igniteStacks + f.pourStacks} 层`);
    if (f.pourSpread || f.pourLife) {
      pourFam.push(`大瓢 火海 +${Math.round(f.pourSpread * 100)}% · 多烧 ${f.pourLife.toFixed(1)}s`);
    }
    if (f.pourEmber) pourFam.push(`拾油 每只回 ${(f.pourEmber * 100).toFixed(2)}%（一瓢封顶 ${Math.round(POUR.emberCap * 100)}%）`);
    if (f.pourShelter) pourFam.push(`烬护 自己火里减伤 ${Math.round(f.pourShelter * 100)}%`);
    const walk = p.wickTime >= 1 ? ` · 本局拨芯 ${Math.round(p.wickTime)}s` : '';
    return `<div class="lo-bounty lo-light ${dim ? 'is-dim' : ''}" style="--c:${WICK.color}">
        <b>${dim ? '🌒 拨芯中 · 微光' : '🔥 灯火全开'}</b>
        <span>灯火半径 ${Math.round(p.lightRadius)}px · 亮度 ×${p.brightness.toFixed(2)} · 火力 ×${p.damageScale.toFixed(2)}${walk}</span>
        ${family.length ? `<span>拨芯这套：${family.join(' · ')}</span>` : ''}
        ${auraFam.length ? `<span>燎灯这套：${auraFam.join(' · ')}</span>` : ''}
        ${pourFam.length ? `<span>倾灯这套：${pourFam.join(' · ')}</span>` : ''}
        <span>${
          dim
            ? `灯油耗率 ×${WICK.oilMult} · 索敌跟着灯火一起变近 · 再按一下 C 拨回来`
            : `按 C 拨芯：看得近一半、打得轻三成五，换一桶油多烧近两倍（×${WICK.oilMult} 油耗）`
        }</span>
      </div>`;
  }

  /**
   * 构筑总览里的「掠影」栏。
   *
   * 掠影那条线是**看不见的**——热度攒在脚边那圈符文上，一闪就过去了。
   * 打开总览的人想知道的其实就三件事：这条线我走起来了没有（擦了 / 点着了几次）、
   * 现在攒到哪儿了、以及身上那些围绕它的东西到底改了什么数。
   * 所以这里把"基础值 → 你现在的值"并排写出来，跟升级卡上那张数值对照是同一个道理。
   */
  /**
   * 构筑总览里的「伏灯」栏（v77）：地上还剩几颗、这一局撒了多少颗、最长串了几颗、
   * 一共有几只蛾是被灯引过去炸死的，以及身上那四件遗物到底改了哪个数。
   *
   * 为什么要单独一栏：伏灯的钱全花在**看不见的地方**——它炸得多不多取决于
   * "刚刚你把雷撒在哪儿"，而这件事在结算之前没有任何地方能读到。这一栏把"这一局的路
   * 铺得怎么样"摊开（撒了几颗、最长一串连了几颗、几只蛾是被饵引来的），
   * 于是"下一局我该怎么撒"才有东西可看。
   *
   * 什么时候才画：手里有伏灯（或进化那一把）、或者身上挂着这一族的遗物。
   * 「掠影」那一栏是无条件画的——那条机制人人都有；伏灯是一件**要拿到手里**的武器，
   * 没有它的玩家在这里只会读到一行"地上 0 颗"，那是占地方。
   */
  private mineBlock(): string {
    const g = this.game;
    const p = g.player;
    const f = p.flags;
    const has = p.weapons.has('mine') || p.weapons.has('mine_chain');
    const fam: string[] = [];
    if (f.mineMax || f.mineLife) fam.push(`灯阵 地上 ${MINE.max + f.mineMax} 颗 · 能等 ${MINE.life + f.mineLife}s`);
    if (f.mineChain) fam.push(`接火 连爆 +${Math.round(f.mineChain * 100)}%`);
    if (f.mineLure) fam.push(`香饵 引蛾 ${Math.round(MINE.lure * (1 + f.mineLure))}px · 每只回 ${(f.mineMothOil * 100).toFixed(2)}%`);
    if (f.mineSnare) fam.push(`绊线 拖住 ${Math.round(f.mineSnare * 100)}% · ${MINE.snareSpan}s`);
    if (!has && !fam.length) return '';
    const chain = g.mineChainBest > 1 ? ` · 最长一串 ${g.mineChainBest} 颗` : '';
    const moth = g.mineMothHits > 0 ? ` · 灯上的蛾 ${g.mineMothHits} 只` : '';
    return `<div class="lo-bounty lo-mine" style="--c:#ffca7a">
        <b>🕯️ 伏灯 · 地上 ${g.mines.length}/${MINE.max + f.mineMax} 颗</b>
        <span>本局撒了 ${g.mineCount} 颗${chain}${moth}</span>
        <span>${
          fam.length
            ? `伏灯这套：${fam.join(' · ')}`
            : `撒在身后、上弦 ${MINE.arm}s，之后谁踩上来就炸一圈；「灯蛾」在 ${MINE.lure}px 内会拐过来扑它——拿它当饵`
        }</span>
      </div>`;
  }

  /**
   * 构筑总览里的「旋灯」栏（v78）：本局转了几盏、一次拽住几只、最狠的一网收了几只，
   * 以及身上那四件遗物到底改了哪个数。
   *
   * 它和「伏灯」那一栏是同一种东西的两面：伏灯那一栏量的是"这一局的路铺得怎么样"，
   * 这一栏量的是"这一局的网撒得怎么样"——旋灯是**不给伤害**的那件武器，
   * 它的成绩单只能是"拢住了几只"和"收成多少"，所以这一栏把这几个数摆在最前面。
   *
   * 什么时候才画：手里有旋灯（或进化那一把）、或者身上挂着这一族的遗物——和伏灯同一条规矩
   * （没有这件武器的玩家读到"本局转了 0 盏"是占地方）。
   */
  /**
   * 构筑总览里的「深宵之约」一栏（v79）：这一局背了哪几条、每条改了什么、余烬翻了多少倍。
   *
   * 为什么非写不可：之约是玩家自己选的**唯一**一件事，而它的代价全是看不见的数
   * （敌人血量 / 伤害 / 数量、油耗、视野、进油）。不写出来，玩起来只会觉得"今天手感怪"。
   * 没背的时候也不留空——那一行顺手承担了"这东西在哪儿"的指路（锁着的时候写解锁条件）。
   */
  private pactBlock(): string {
    const g = this.game;
    if (!g.pacts.length) {
      return g.pactsAvailable()
        ? '<div class="lo-empty">这一局没背 · 平常的一夜</div>'
        : '<div class="lo-empty">通关一次之后可以自己给自己加难度</div>';
    }
    const rows = g.pacts
      .map((id) => PACT_MAP[id])
      .filter(Boolean)
      .map((p) => `<div class="lo-pact" style="--c:${p.color}"><b>${p.icon} ${p.name}</b><span>${p.blurb}</span></div>`)
      .join('');
    return `${rows}<div class="lo-pact__sum">背 ${g.pacts.length} 条 · 结算余烬 ×${pactEmberMult(g.pacts).toFixed(2)}</div>`;
  }

  private vortexBlock(): string {
    const g = this.game;
    const p = g.player;
    const f = p.flags;
    const has = p.weapons.has('vortex') || p.weapons.has('vortex_maelstrom');
    const fam: string[] = [];
    if (f.vortexSpread || f.vortexTime) {
      fam.push(`张网 吸入 +${Math.round(f.vortexSpread * 100)}% · 多转 ${f.vortexTime.toFixed(1)}s`);
    }
    if (f.vortexMark) fam.push(`标灯 被拽住的挨打 +${Math.round(f.vortexMark * 100)}% · 留 ${VORTEX.markSpan}s`);
    if (f.vortexHarvest) fam.push(`榨油 每只回 ${(f.vortexHarvest * 100).toFixed(2)}%`);
    if (f.vortexSnare) fam.push(`缠网 圈里慢 ${Math.round(f.vortexSnare * 100)}%`);
    if (!has && !fam.length) return '';
    const best = g.vortexBest > 1 ? `一次拽住 ${g.vortexBest} 只` : '';
    const payoff = g.vortexCaught > 1 ? `最狠的一网 ${g.vortexCaught} 只 · ${g.vortexPayoff}` : '';
    const score = [best, payoff].filter(Boolean).join(' · ');
    return `<div class="lo-bounty lo-vortex" style="--c:#8fb8ff">
        <b>🌀 旋灯 · 本局转了 ${g.vortexCount} 盏</b>
        <span>${score || '这一局还没拢到过东西'}</span>
        <span>${
          fam.length
            ? `旋灯这套：${fam.join(' · ')}`
            : `转 ${VORTEX.life}s 然后把圈里那几只拢到一点收网——它不给伤害，它让别人打得疼`
        }</span>
      </div>`;
  }

  /**
   * 构筑总览里的「弃灯」栏（v83）：本局分了几盏、**一次引走了最多几只**、收回来多少油，
   * 以及身上那四件遗物到底改了哪个数。
   *
   * 为什么单开一栏：这一族买的是一段**很难自己感觉到**的东西——几秒钟的转身余地。
   * 不写出来的话，玩家只会看到"按了 E，然后什么都没发生"。所以这里把两个真正发生的数
   * 摆在最前面：**引走了几只**（`lampBest`，在灯被吃掉的那一帧点的人头）与**收回来多少油**。
   *
   * 什么时候才画：这一局分过灯、或者身上挂着这一族的遗物——和伏灯 / 旋灯同一条规矩
   * （没碰过这件事的玩家读到"本局分了 0 盏"是占地方）。
   */
  private lampBlock(): string {
    const g = this.game;
    const f = g.player.flags;
    const fam: string[] = [];
    if (f.lampLure || f.lampSpan) {
      fam.push(`灯罩 引怪 +${Math.round(f.lampLure * 100)}% · 多亮 ${f.lampSpan.toFixed(0)}s`);
    }
    if (f.lampBurst) fam.push(`焚灯 被吃掉时炸 ${LAMP.burstRadius}px / ${LAMP.burstDamage} 伤害`);
    if (f.lampEmber) {
      fam.push(`拾灯 每只回 ${(f.lampEmber * 100).toFixed(2)}%（一盏封顶 ${Math.round(LAMP.emberCap * 100)}%）`);
    }
    if (f.lampSnare) fam.push(`灯晕 光里慢 ${Math.round(f.lampSnare * 100)}%`);
    if (!g.lampCount && !fam.length) return '';
    const score = [g.lampBest > 1 ? `一次引走 ${g.lampBest} 只` : '', g.lampOilBack > 0 ? `收回来 ${(g.lampOilBack * 100).toFixed(1)}% 油` : '']
      .filter(Boolean)
      .join(' · ');
    return `<div class="lo-bounty lo-lamp" style="--c:#ffca7a">
        <b>🕯️ 弃灯 · 本局分了 ${g.lampCount} 盏</b>
        <span>${score || '这一局还没引到过东西'}</span>
        <span>${
          fam.length
            ? `弃灯这套：${fam.join(' · ')}`
            : `引怪 ${LAMP.lure}px、亮 ${LAMP.life}s，被啃到 ${LAMP.snuffR}px 以内就灭——它是一盏灯，摆在哪一边才是你的活`
        }</span>
      </div>`;
  }

  private grazeBlock(): string {
    const g = this.game;
    const p = g.player;
    const f = p.flags;
    const buffs: string[] = [];
    if (f.grazeHeat) buffs.push(`攒热 ×${(1 + f.grazeHeat).toFixed(2)}`);
    if (f.blazeTime) buffs.push(`焰时长 ×${(1 + f.blazeTime).toFixed(2)}`);
    if (f.grazeOil) buffs.push(`擦身回油 ×${(1 + f.grazeOil).toFixed(2)}`);
    if (f.blazeGuard) buffs.push(`焰中减伤 ${Math.round(f.blazeGuard * 100)}%`);
    const heat = p.blazing
      ? `<b>🔥 灯焰高涨中 · 还剩 ${p.blazeTimer.toFixed(1)}s</b>`
      : `<b>👣 热度 ${Math.round(p.heat)}/${GRAZE.heatMax}</b>`;
    return `<div class="lo-bounty lo-graze ${p.blazing ? 'is-blazing' : ''}" style="--c:#ffb14e">
        ${heat}
        <span>本局掠影 ${g.grazeCount} 次 · 点着 ${p.blazeCount} 次${
          buffs.length ? ` · ${buffs.join(' · ')}` : ''
        }</span>
        <span>${
          p.blazing
            ? `灯火 ×${GRAZE.blazeLight} · 伤害 +${Math.round(GRAZE.blazeDamage * 100)}% · 焰里每杀一只续 ${GRAZE.blazeExtend}s`
            : `贴着敌人或弹幕擦过去就攒热度：攒满 ${GRAZE.heatMax} 点着「灯焰高涨」· 站着不动不算`
        }</span>
      </div>`;
  }

  /**
   * 「本局伤害构成」：每一件武器（以及燃爆 / 灯火 / 灼烧）在这一局里打了多少。
   *
   * 为什么要做：这一局的枪法是自动的，玩家唯一一直在做的决定是**把升级给谁**——
   * 可结算页从前只给一个总伤害，哪件在扛、哪件在刮只能靠感觉猜。
   * 肉鸽的乐趣就长在"下一步堆什么"上，那就得把"上一堆堆得怎么样"摊开给他看。
   *
   * 只在**两个来源以上**时才出现：手里只有一件武器的时候，这张表说到底就是
   * "100% 是它"，占地方而已。条长按占全额的百分比画（所以几条加起来正好一整条），
   * 数字写出来，百分比写在后面——"它到底占多少"和"它打了多少"是两件事，都该看得见。
   */
  private damageBlock(): string {
    const rows = this.game.damageBreakdown();
    if (rows.length < 2) return '';
    const body = rows
      .map((r) => {
        const pct = Math.round(r.frac * 100);
        return `<div class="dmg-row" style="--c:${r.color}">
          <span class="dmg-row__name">${r.name}</span>
          <span class="dmg-row__bar"><i style="width:${Math.max(2, r.frac * 100).toFixed(1)}%"></i></span>
          <span class="dmg-row__val">${num(r.amount)}<u>${pct}%</u></span>
        </div>`;
      })
      .join('');
    return `<div class="dmg-block">
      <div class="dmg-block__title">本局伤害构成 <span>（含灼烧；合计 ${num(this.game.damageDealt)}）</span></div>
      ${body}
    </div>`;
  }

  private statsBlock(): string {
    const g = this.game;
    const s = g.runStats();
    const pyre = g.runPyres > 0 ? `<div><span>点亮灯台</span><b>${g.pyresLitTotal}/${g.runPyres}</b></div>` : '';
    return `
      <div class="stats">
        <div><span>击杀</span><b>${s.kills}</b></div>
        <div><span>等级</span><b>${s.level}</b></div>
        <div><span>存活</span><b>${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</b></div>
        <div><span>波次</span><b>${s.wave}</b></div>
        <div><span>最高连击</span><b>${s.bestCombo}</b></div>
        <div><span>造成伤害</span><b>${num(s.damageDealt)}</b></div>
        <div><span>承受伤害</span><b>${num(s.damageTaken)}</b></div>
        <div><span>击败首领</span><b>${s.bossKills}</b></div>
        ${pyre}
        <div><span>完成悬赏</span><b>${g.bounties.completedThisRun}</b></div>
        <div><span>最强一击</span><b>${num(g.maxHit)}</b></div>
        <div><span>燃爆</span><b>${g.novaCount} 次</b></div>
        ${g.lampCount > 0 ? `<div><span>分灯</span><b>${g.lampCount} 盏</b></div>` : ''}
        ${g.lampBest > 1 ? `<div><span>一盏灯引来</span><b>${g.lampBest} 只</b></div>` : ''}
        ${g.lampOilBack > 0 ? `<div><span>拾灯收回</span><b>${(g.lampOilBack * 100).toFixed(1)}% 油</b></div>` : ''}
        ${g.mineCount > 0 ? `<div><span>伏灯</span><b>${g.mineCount} 颗</b></div>` : ''}
        ${g.mineChainBest > 1 ? `<div><span>最长一串</span><b>${g.mineChainBest} 颗</b></div>` : ''}
        ${g.mineMothHits > 0 ? `<div><span>灯上的蛾</span><b>${g.mineMothHits} 只</b></div>` : ''}
        ${g.vortexCount > 0 ? `<div><span>旋灯</span><b>${g.vortexCount} 盏</b></div>` : ''}
        ${g.vortexBest > 1 ? `<div><span>一次拽住</span><b>${g.vortexBest} 只</b></div>` : ''}
        ${g.vortexCaught >= 3 ? `<div><span>最狠的一网</span><b>${g.vortexCaught} 只 · ${g.vortexPayoff}</b></div>` : ''}
        ${g.pourCount > 0 ? `<div><span>倾灯</span><b>${g.pourCount} 瓢 · ${g.pourSpent.toFixed(1)} 桶油</b></div>` : ''}
        ${g.mineSnuffed > 0 ? `<div><span>被吹灭</span><b>${g.mineSnuffed} 颗</b></div>` : ''}
        ${g.grazeCount > 0 ? `<div><span>掠影</span><b>${g.grazeCount} 次</b></div>` : ''}
        ${g.player.blazeCount > 0 ? `<div><span>灯焰高涨</span><b>${g.player.blazeCount} 次</b></div>` : ''}
      </div>`;
  }

  /**
   * 这一局到底攒出了一套什么。
   *
   * 结算里一向只有数字（击杀 / 伤害 / 灯台），可肉鸽真正被记住的是"我这一局长成了什么样"：
   * 哪几把武器点满了、凑齐了哪一族的共鸣、背着哪条夜咒走完的。复盘时最想看的其实是这些。
   */
  private runBuildBlock(): string {
    const g = this.game;
    const p = g.player;
    const parts: string[] = [];

    const weapons = [...p.weapons.entries()]
      .map(([id, lvl]) => {
        const def = WEAPON_MAP[id];
        if (!def) return '';
        const tag = def.evolved ? '<i class="lo-tag lo-tag--evo">进化</i>' : '';
        return `<span class="rb-item" style="--c:${def.color}">${def.name}${tag}<u>Lv ${lvl}</u></span>`;
      })
      .filter(Boolean);
    parts.push(`<div class="run-build__row"><span>武器</span><b>${weapons.join('') || '——'}</b></div>`);

    const passives = [...p.passives.entries()]
      .map(([id, lvl]) => {
        const def = PASSIVE_MAP[id];
        return def ? `<span class="rb-item">${def.name}<u>Lv ${lvl}</u></span>` : '';
      })
      .filter(Boolean);
    if (passives.length) parts.push(`<div class="run-build__row"><span>被动</span><b>${passives.join('')}</b></div>`);

    const relics = [...p.relics]
      .map((id) => {
        const def = RELIC_MAP[id];
        return def ? `<span class="rb-item" style="--c:${def.color}">${def.name}</span>` : '';
      })
      .filter(Boolean);
    const resonance = TRIBES.map((t) => {
      const n = p.tribeCount(t.id);
      const tier = p.tribeTier(t.id);
      if (!tier) return '';
      return `<span class="rb-tribe" style="--c:${t.color}">${t.icon} ${t.name} ${n} 件 · ${tier} 档</span>`;
    }).filter(Boolean);
    parts.push(
      `<div class="run-build__row"><span>遗物</span><b>${relics.join('') || '——'}${resonance.length ? `<i class="rb-reso">灯火共鸣</i>${resonance.join('')}` : ''}</b></div>`,
    );

    if (g.curse) parts.push(`<div class="run-build__row"><span>夜咒</span><b><span class="rb-item" style="--c:${g.curse.color}">${g.curse.name}</span></b></div>`);

    if (g.pacts.length) {
      const items = g.pacts
        .map((id) => PACT_MAP[id])
        .filter(Boolean)
        .map((p) => `<span class="rb-item" style="--c:${p.color}">${p.icon} ${p.name}</span>`);
      parts.push(`<div class="run-build__row"><span>深宵</span><b>${items.join('')}<i class="rb-reso">余烬 ×${pactEmberMult(g.pacts).toFixed(2)}</i></b></div>`);
    }

    return `<div class="run-build"><div class="run-build__title">本局构筑</div>${parts.join('')}</div>`;
  }

  /** 死亡时说清楚是被谁扑灭的——比"你死了"有用得多。 */
  private killerLine(): string {
    const k = this.game.lastKiller;
    if (!k) return '';
    return `<div class="killer">灯火熄灭于 <b style="--c:${k.color}">${k.name}</b></div>`;
  }

  private shop(): void {
    const g = this.game;
    const items = g.shopItems
      .map(
        (it, i) => `
      <button class="shop-item ${it.sold ? 'is-sold' : g.gold < it.price ? 'is-poor' : ''}" data-buy="${i}" style="--accent:${it.color}">
        <div class="shop-item__icon">${it.icon}</div>
        <div class="shop-item__name">${it.name}</div>
        <div class="shop-item__blurb">${it.blurb}</div>
        ${it.offer ? this.offerDelta(it.offer, 2) : ''}
        <div class="shop-item__price">${this.hotkey(i)}${it.sold ? '已售出' : `${it.price} 🪙`}</div>
      </button>`,
      )
      .join('');
    this.show(`
      <div class="panel panel--shop panel--vellum">
        <div class="panel__title">${g.shopHeader}</div>
        <div class="shop-wallet">金币 <b>🪙 ${g.gold}</b></div>
        ${this.nextArenaLine()}
        <div class="shop-grid">${items}</div>
        ${this.forgeBlock()}
        <div class="row-actions">
          <button class="btn ${g.gold >= 8 ? '' : 'is-locked'}" data-act="reroll">刷新商品 (8 🪙)<span class="key">R</span></button>
          <button class="btn btn--primary" data-act="leave">${g.endless ? '继续战斗' : '继续前进'}</button>
        </div>
      </div>
    `);
    this.onAll('[data-buy]', (el) => {
      this.game.buyShop(Number(el.dataset.buy));
    });
    this.on('[data-act="reroll"]', () => this.game.rerollShop());
    this.on('[data-act="leave"]', () => this.game.leaveShop());
    this.onAll('[data-forge]', (el) => this.game.forgeRelic(el.dataset.forge as string));
  }

  /**
   * 无尽之夜：下一片战场会是什么。
   *
   * 战场是一轮一换的，而"换到哪儿"这件事在补给站里就该知道——
   * 身上没血没油的时候看到下一片是「熔窟」（熔岩 / 陨石雨），和看到「幽林」，买的东西是不一样的。
   */
  private nextArenaLine(): string {
    const stage = this.game.nextArena();
    if (!stage) return '';
    const hazards = stage.hazards.map((h) => HAZARD_LABEL[h] ?? h).join(' / ');
    return `<div class="shop-arena">下一片战场 · <b>${stage.theme.name}</b>${
      hazards ? `<span>险境：${hazards}</span>` : ''
    }</div>`;
  }

  /** 熔铸台：把一件已有遗物烧掉换一件新的——契约型遗物的代价终于有了出口。 */
  private forgeBlock(): string {
    const g = this.game;
    const owned = [...g.player.relics];
    if (!owned.length) return '';
    const price = g.forgePrice;
    const used = g.forgeUsed;
    const poor = g.gold < price;
    const foot = used ? '炉门已经冷了' : poor ? '金币不足，炉门打不开' : '投入一件已有遗物';
    const chips = owned
      .map((id) => {
        const d = RELIC_MAP[id];
        return `<button class="forge-chip" data-forge="${id}" title="${d?.blurb ?? id}" style="--c:${d?.color ?? '#fff'}">${d?.icon ?? ''} ${d?.name ?? id}</button>`;
      })
      .join('');
    const note = used ? '本店已熔铸过' : poor ? `还差 ${price - g.gold} 金币` : `换掉哪一件？`;
    return `
      <div class="forge ${used || poor ? 'is-off' : ''}">
        <div class="forge__sigil" aria-hidden="true">🔥</div>
        <div class="forge__head">
          <b>熔铸台</b>
          <span>${note}</span>
          <i>${price} 🪙</i>
        </div>
        <div class="forge__row">${chips}</div>
        <div class="forge__foot"><span>${foot}</span><i>回炉重铸为一件随机遗物 · 每店一次</i></div>
      </div>`;
  }

  /**
   * 夜咒岔口：离开商店之后，下一关的夜咒由玩家从三条里挑一条。
   * 卡片按回报从轻到重排，把"要钱还是要命"摆到台面上。
   */
  private curse(): void {
    const g = this.game;
    const stage = STAGES[Math.min(g.stageIndex + 1, STAGES.length - 1)];
    const cards = g.curseOffers
      .map(
        (c, i) => `
      <button class="curse-card" data-curse="${c.id}" style="--accent:${c.color}">
        ${this.hotkey(i)}
        <div class="curse-card__icon">${c.icon}</div>
        <div class="curse-card__name">${c.name}</div>
        <div class="curse-card__blurb">${c.blurb}</div>
        <div class="curse-card__gold">金币 ×${c.goldMult.toFixed(2)}</div>
      </button>`,
      )
      .join('');
    this.show(`
      <div class="panel panel--curse panel--rite">
        <div class="panel__title">夜咒</div>
        <div class="subtitle">下一关是「${stage.theme.name}」——向夜借多少，由你开口。</div>
        <div class="curse-grid">${cards}</div>
        <div class="curse-hint">夜咒不会缺席：挑一条，然后带着它走完这一关。</div>
      </div>
    `);
    this.onAll('[data-curse]', (el) => {
      this.game.chooseCurse(el.dataset.curse as string);
    });
  }

  private shrine(): void {
    const g = this.game;
    const cards = g.shrineOffers
      .map(
        (o, i) => `
      <button class="shrine-card" data-shrine="${o.id}" style="--accent:${o.color}">
        ${this.hotkey(i)}
        <div class="shrine-card__icon">${o.icon}</div>
        <div class="shrine-card__name">${o.name}</div>
        <div class="shrine-card__blurb">${o.blurb}</div>
      </button>`,
      )
      .join('');
    this.show(`
      <div class="panel panel--shrine panel--stone">
        <div class="panel__title">静默的祭坛</div>
        <div class="subtitle">灯火之外的馈赠，总要付出点什么。</div>
        <div class="shrine-grid">${cards}</div>
        <div class="row-actions">
          <button class="btn" data-act="shrine-leave">原样离开</button>
        </div>
      </div>
    `);
    this.onAll('[data-shrine]', (el) => {
      this.game.chooseShrine(el.dataset.shrine as string);
    });
    this.on('[data-act="shrine-leave"]', () => this.game.leaveShrine());
  }

  private dead(): void {
    this.resultScreen(false);
  }

  private victory(): void {
    this.resultScreen(true);
  }

  /** 死亡 / 通关共用一张战报：上半截交代结局与收益，下半截留给这一局本身。 */
  private resultScreen(win: boolean): void {
    const g = this.game;
    const s = g.runStats();
    const stage = STAGES[Math.min(g.stageIndex, STAGES.length - 1)];
    const flags = `${this.dailyLine()}${this.achievementEmbersLine()}${this.recordBadges()}`;
    const action = win
      ? '<button class="btn btn--primary" data-act="endless">挑战无尽之夜<span class="key">回车</span></button>'
      : '<button class="btn btn--primary" data-act="again">再点一盏<span class="key">回车</span></button>';
    this.show(`
      <div class="panel panel--result panel--vellum ${win ? 'panel--triumph' : 'panel--defeat'}">
        <header class="result-head">
          <div class="outcome-seal ${win ? 'outcome-seal--clear' : 'outcome-seal--defeat'}">${win ? '✦' : '✧'}</div>
          <div class="result-head__copy">
            <span class="result-head__kicker">${win ? '长夜已尽 · 灯火长明' : `第 ${s.stage} 关 · ${stage.theme.name}`}</span>
            <div class="panel__title result-head__title">${win ? '焚尽长夜' : '灯火熄灭'}</div>
            ${win ? '<p class="result-head__sub">你举着灯，走完了长夜之城的最后一段黑暗。</p>' : this.killerLine()}
            ${this.tourLine()}
          </div>
          <div class="result-pay">
            <span>本局余烬</span>
            <b>+${g.embersEarned}</b>
            <i>${win ? '长夜已焚' : '守到最后一刻'}</i>
          </div>
        </header>
        ${flags ? `<div class="result-meta">${flags}</div>` : ''}
        <div class="result-grid">
          <section class="result-column result-column--stats">
            <div class="result-col-head"><b>本局战报</b><span>${s.kills} 击杀 · ${UIManager.clock(s.time)} · 第 ${s.stage} 关</span></div>
            ${this.statsBlock()}
          </section>
          <aside class="result-column result-column--build">
            ${this.runBuildBlock()}
            ${this.damageBlock()}
          </aside>
        </div>
        <footer class="row-actions result-actions">
          ${action}
          <button class="btn" data-act="menu">返回主菜单</button>
        </footer>
      </div>
    `);
    this.on('[data-act="again"]', () => this.game.openMenu('select'));
    this.on('[data-act="endless"]', () => { this.endless = true; this.openSelect(); });
    this.on('[data-act="menu"]', () => this.game.goMenu());
  }

  /** 通关时把这一路点过的灯台数一并交代：它本来就不是必做项。 */
  private tourLine(): string {
    const g = this.game;
    if (!g.runPyres) return '';
    return `<div class="tour">沿途点亮了 <b>${g.pyresLitTotal}</b> 座灯台（共 ${g.runPyres} 座）</div>`;
  }

  private nodeCard(n: MetaNodeDef): string {
    const bought = this.game.save.meta.includes(n.id);
    const can = this.game.meta.canBuy(n);
    const locked = n.requires ? !this.game.save.meta.includes(n.requires) : false;
    const cls = bought ? 'is-bought' : can ? 'is-can' : locked ? 'is-locked' : 'is-poor';
    return `<button class="node ${cls}" data-node="${n.id}">
      <div class="node__name">${n.name}</div>
      <div class="node__blurb">${n.blurb}</div>
      <div class="node__cost">${bought ? '已解锁' : locked ? '需先解锁前置' : `${n.cost} 余烬`}</div>
    </button>`;
  }

  /**
   * 「薪火」那一块（v80）：解锁树买完之后余烬的去处。
   *
   * 为什么另开一块而不是并进 `node-grid`：树上那 16 个节点是**一次性的**（买过就标"已解锁"），
   * 这三条是**可重复**的（同一张卡点第二下就是第 2 级，价格也变了）。两种卡片的形状不一样，
   * 混在一个网格里，玩家会去点那张已经灰掉的树节点，以为"梯子怎么买不了"。
   *
   * 头部那一行顺手指一次路（"树还剩 N 个节点"）：炉子比树贵得多（60 余烬换 +18% 油 vs
   * 320 换 +5%），价格差本身就是引导，但**指路得写出来**——不然新手会先来烧炉子，
   * 那才是真的把钱花错了地方。
   */
  private fireBlock(): string {
    const meta = this.game.meta;
    const total = meta.fireLevelsTotal();
    const lines = FIRE_LINES.map((line) => {
      const lv = meta.fireLevel(line.id);
      const maxed = lv >= line.levels;
      const can = meta.canBuyFire(line);
      const cls = maxed ? 'is-max' : can ? 'is-can' : 'is-poor';
      // 刻度：一格一级（和升级卡同一套 `card__pips`），已经烧着的亮、下一格在呼吸
      const pips = Array.from({ length: line.levels }, (_, i) => {
        const c = i < lv ? ' class="is-on"' : i === lv && !maxed ? ' class="is-next"' : '';
        return `<i${c}></i>`;
      }).join('');
      return `<button class="fire ${cls}" data-fire="${line.id}">
        <div class="fire__top">${line.icon} <b>${line.name}</b><span class="fire__lv">${lv}/${line.levels}</span></div>
        <div class="fire__per">${line.per} · ${line.blurb}</div>
        <div class="card__pips">${pips}</div>
        <div class="fire__cost">${maxed ? '已烧满' : `${fireCost(line, lv)} 余烬`}</div>
      </button>`;
    }).join('');
    const left = META_TREE.filter((n) => !this.game.save.meta.includes(n.id)).length;
    return `
      <div class="fire-block">
        <div class="fire-head">🔥 薪火 · <b>${total}/${FIRE_LEVELS_TOTAL}</b> 级
          <span class="fire-note">${left ? `解锁树还剩 ${left} 个节点 —— 先买树，再添柴` : '树已经买全了：这里就是余烬的去处'}</span>
        </div>
        <div class="fire-grid">${lines}</div>
      </div>`;
  }

  private meta(): void {
    const nodes = META_TREE.map((n) => this.nodeCard(n)).join('');
    this.show(`
      <div class="panel panel--meta panel--board">
        <div class="panel__title">余烬解锁 · <b>${this.game.save.embers}</b> 余烬</div>
        <div class="node-grid">${nodes}</div>
        ${this.fireBlock()}
        <div class="row-actions">
          <button class="btn" data-act="reset">清空存档</button>
          <button class="btn btn--primary" data-act="back">返回</button>
        </div>
      </div>
    `);
    this.onAll('[data-node]', (el) => {
      this.game.buyMeta(el.dataset.node as string);
      this.showScreen('meta');
    });
    this.onAll('[data-fire]', (el) => {
      this.game.buyMetaFire(el.dataset.fire as string);
      this.showScreen('meta');
    });
    this.on('[data-act="back"]', () => this.backToOrigin());
    this.on('[data-act="reset"]', () => {
      if (confirm('确定清空所有存档（余烬、解锁、成就）？')) {
        this.game.resetSave();
        this.showScreen('meta');
      }
    });
  }

  private openOverlay(state: GameState): void {
    this.returnState = this.game.state === 'paused' ? 'paused' : 'menu';
    this.game.openMenu(state);
  }

  private backToOrigin(): void {
    if (this.returnState === 'paused') this.game.openMenu('paused');
    else this.game.goMenu();
  }


  /** 图鉴条目详情：不只是收藏，也是一本可以查数值的手册。 */
  private codexDetailView(): void {
    const entry = this.game.codex.entry(this.codexFocus ?? '');
    if (!entry) {
      this.codexFocus = null;
      this.codex();
      return;
    }
    const section = CODEX_SECTIONS.find((s) => s.kind === entry.kind);
    const sectionEntries = this.game.codex.entries.filter((e) => e.kind === entry.kind);
    const ordinal = Math.max(1, sectionEntries.findIndex((e) => e.id === entry.id) + 1);
    const number = String(ordinal).padStart(2, '0');
    const count = String(sectionEntries.length).padStart(2, '0');
    const rows = (entry.rows ?? [])
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
      .join('');
    this.show(`
      <div class="panel panel--detail panel--vellum cx-sheet" style="--c:${entry.color ?? '#8fa7ff'}">
        <div class="cx-sheet__rail" aria-hidden="true">
          <span>${section?.title ?? '档案'}</span>
          <b>${number}</b>
          <i>/${count}</i>
        </div>
        <div class="cx-sheet__seal" aria-hidden="true"><span>已收录</span><i>WL</i></div>
        <div class="cx-head">
          <div class="cx-head__icon">${entry.icon ?? '●'}</div>
          <div class="cx-head__text">
            <div class="cx-head__eyebrow">${section?.title ?? '档案'} · 第 ${number} 号</div>
            <div class="cx-head__name">${entry.name}${entry.tag ? `<i class="cx__tag">${entry.tag}</i>` : ''}</div>
            <div class="cx-head__kind">${section?.hint ?? '已收录'} · 共 ${count} 份记录</div>
          </div>
        </div>
        <p class="cx-blurb">${entry.blurb}</p>
        ${rows ? `<div class="cx-rows">${rows}</div>` : ''}
        ${entry.extra ? `<p class="cx-extra">${entry.extra}</p>` : ''}
        <div class="row-actions"><button class="btn btn--primary" data-act="detail-back">返回图鉴</button></div>
      </div>
    `);
    this.on('[data-act="detail-back"]', () => {
      this.codexFocus = null;
      this.codex();
    });
  }

  private codex(): void {
    if (this.codexFocus) {
      this.codexDetailView();
      return;
    }
    const cx = this.game.codex;
    const seen = cx.seenCount();
    const total = cx.total();
    const pct = total ? Math.round((seen / total) * 100) : 0;
    const sections = CODEX_SECTIONS.map((sec) => {
      const entries = cx.entries.filter((e) => e.kind === sec.kind);
      if (!entries.length) return '';
      const cards = entries
        .map((e) => {
          if (!cx.has(e.kind, e.id)) {
            return `<div class="cx is-locked"><div class="cx__dot"></div><div class="cx__name">？？？</div><div class="cx__blurb">尚未发现</div></div>`;
          }
          return `<button class="cx is-open" data-cx="${e.kind}:${e.id}" style="--c:${e.color ?? '#8fa7ff'}">
            <div class="cx__dot">${e.icon ?? '●'}</div>
            <div class="cx__name">${e.name}${e.tag ? `<i class="cx__tag">${e.tag}</i>` : ''}</div>
            <div class="cx__blurb">${e.blurb}</div>
            <div class="cx__more">查看数值 ›</div>
          </button>`;
        })
        .join('');
      const got = cx.sectionSeen(sec.kind);
      const progress = (got / entries.length) * 100;
      return `<section class="cx-sec">
        <h4>${sec.title} <b>${got}/${entries.length}</b><i class="cx-sec__rule" style="--codex-progress:${progress.toFixed(1)}%" aria-hidden="true"><span></span></i><span>${sec.hint}</span></h4>
        <div class="cx-grid">${cards}</div>
      </section>`;
    }).join('');
    this.show(`
      <div class="panel panel--codex panel--vellum">
        <div class="panel__title">图鉴 · ${seen}/${total}</div>
        <div class="cx-bar"><i style="width:${pct}%"></i></div>
        <label class="cx-search">
          <input class="cx-search__input" type="search" placeholder="搜索已发现条目…（名称 / 说明 / 数值 · / 聚焦）" aria-label="搜索图鉴" />
          <span class="cx-search__hit"></span>
        </label>
        ${sections}
        <div class="cx-none" hidden>没有找到已发现条目。搜索不会剧透尚未发现的 ???。</div>
        <div class="row-actions"><button class="btn btn--primary" data-act="back">返回</button></div>
      </div>
    `);
    const input = this.screen.querySelector('.cx-search__input') as HTMLInputElement | null;
    const hit = this.screen.querySelector('.cx-search__hit') as HTMLElement | null;
    const none = this.screen.querySelector('.cx-none') as HTMLElement | null;
    const applyFilter = () => {
      const tokens = (input?.value ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      let found = 0;
      this.screen.querySelectorAll<HTMLElement>('.cx-sec').forEach((section) => {
        let visible = 0;
        section.querySelectorAll<HTMLElement>('.cx').forEach((card) => {
          const locked = card.classList.contains('is-locked');
          if (!locked) found += 1;
          const text = (card.textContent ?? '').toLowerCase();
          const match = tokens.length === 0 ? true : !locked && tokens.every((token) => text.includes(token));
          card.hidden = !match;
          if (!match) return;
          visible += 1;
          if (!locked) shown += 1;
        });
        section.hidden = tokens.length > 0 && visible === 0;
      });
      if (hit) hit.textContent = tokens.length ? `找到 ${shown} 个已发现条目` : `${found} 个已发现条目`;
      if (none) none.hidden = tokens.length === 0 || shown > 0;
    };
    if (input) {
      input.value = this.codexQuery;
      input.addEventListener('input', applyFilter);
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const first = [...this.screen.querySelectorAll<HTMLElement>('[data-cx]')].find((card) => !card.hidden);
        if (!first) return;
        e.preventDefault();
        first.click();
      });
      applyFilter();
    }
    this.on('[data-act="back"]', () => this.backToOrigin());
    this.onAll('[data-cx]', (el) => {
      this.codexQuery = input?.value ?? this.codexQuery;
      this.codexFocus = el.dataset.cx as string;
      this.codex();
    });
  }

  /** 结算界面上的"新纪录"徽章。 */
  private recordBadges(): string {
    const hi = this.game.recordHighlights;
    if (!hi.length) return '';
    const shown = hi.slice(0, 4);
    const badges = shown.map((h) => `<span class="hl">🏅 新纪录 · ${h.label} <b>${h.value}</b></span>`);
    if (hi.length > shown.length) badges.push(`<span class="hl hl--more">还有 ${hi.length - shown.length} 项新纪录</span>`);
    return `<div class="hl-row">${badges.join('')}</div>`;
  }

  /** 今日灯芯的成绩行（只在今日灯芯的结算里出现）。 */
  private dailyLine(): string {
    if (!this.game.dailyPlan) return '';
    const score = this.game.dailyScore;
    const best = this.game.dailyBest ? ' · 刷新个人最好' : '';
    return `<div class="daily-score ${this.game.dailyBest ? 'is-best' : ''}">今日灯芯 <b>${score}</b> 分${best}</div>`;
  }

  /** 本局成就奖励（和局内余烬分开显示，免得玩家以为是同一笔）。 */
  private achievementEmbersLine(): string {
    const n = this.game.achievementEmbers;
    if (n <= 0) return '';
    return `<div class="ember-gain ember-gain--ach">成就奖励 <b>+${n}</b> 余烬</div>`;
  }

  private static clock(sec: number): string {
    const m = Math.floor(sec / 60);
    return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  }

  private static ago(at: number): string {
    const d = Math.max(0, (Date.now() - at) / 1000);
    if (d < 60) return '刚刚';
    if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
    if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
    return `${Math.floor(d / 86400)} 天前`;
  }

  private static hours(total: number): string {
    if (total < 3600) return `${Math.floor(total / 60)} 分`;
    return `${(total / 3600).toFixed(1)} 小时`;
  }

  private runRow(r: RunRecord): string {
    const lantern = LANTERN_MAP[r.lantern];
    const stageName = STAGE_MAP[r.stageId]?.theme.name ?? '未知之地';
    const diff = DIFFICULTIES[r.difficulty]?.label ?? r.difficulty;
    const where = r.endless ? `无尽 · 第 ${r.wave} 波` : `${stageName} · 第 ${r.stage} 关`;
    return `<div class="rec-run ${r.cleared ? 'is-clear' : 'is-fall'}">
      <div class="rec-run__mark" role="img" aria-label="${r.cleared ? '通关' : '熄灭'}">${r.cleared ? '通' : '灭'}</div>
      <div class="rec-run__body">
        <div class="rec-run__top">
          <b style="color:${lantern?.color ?? 'var(--amber)'}">${lantern?.name ?? r.lantern}</b>
          <span class="rec-run__diff">${diff}</span>
          <span class="rec-run__where">${where}</span>
          ${r.daily ? '<span class="rec-run__daily">今日灯芯</span>' : ''}
        </div>
        <div class="rec-run__sub">
          <span>击杀 <b>${r.kills}</b></span>
          <span>Lv <b>${r.level}</b></span>
          <span>用时 <b>${UIManager.clock(r.time)}</b></span>
          <span>连杀 <b>${r.bestCombo}</b></span>
          ${r.bossKills ? `<span>首领 <b>${r.bossKills}</b></span>` : ''}
          ${r.pacts ? `<span>深宵 <b>${r.pacts}</b></span>` : ''}
        </div>
      </div>
      <div class="rec-run__side"><b>+${r.embers}</b><span>${UIManager.ago(r.at)}</span></div>
    </div>`;
  }

  /** 今日灯芯：一天的固定剧本，成绩之间才有比较的意义。 */
  private daily(): void {
    const plan = buildDailyPlan();
    const d = this.game.dailySave();
    const lantern = LANTERN_MAP[plan.lantern];
    const difficulty = DIFFICULTIES[plan.difficulty];
    const lanternName = lantern?.name ?? plan.lantern;
    const lanternTitle = lantern?.title ?? '';
    const lanternColor = lantern?.color ?? '#ffb14e';
    const diffTone = plan.difficulty === 'relaxed' ? '#7fd8b5' : plan.difficulty === 'nightmare' ? '#e38181' : '#ffd28a';
    const diffRank = DIFFICULTY_ORDER.indexOf(plan.difficulty) + 1;
    const diffMeter = [1, 2, 3]
      .map((step) => `<i class="${step <= diffRank ? 'is-lit' : ''}"></i>`)
      .join('');
    const legs = STAGES.map((stage, i) => {
      const curse = plan.curses[i] ? CURSE_MAP[plan.curses[i] as string] : null;
      const bounty = BOUNTY_MAP[plan.bounties[i]];
      return `<article class="daily-leg${i === STAGES.length - 1 ? ' is-final' : ''}">
        <div class="daily-leg__head">
          <span class="daily-leg__no">${String(i + 1).padStart(2, '0')}</span>
          <div class="daily-leg__stage"><b>${stage.theme.name}</b><span>${stage.theme.subtitle}</span></div>
          <i class="daily-leg__pin" style="--accent:${stage.theme.accent}" aria-hidden="true"></i>
        </div>
        <div class="daily-leg__rows">
          <div class="daily-leg__row${curse ? '' : ' is-calm'}" style="--accent:${curse?.color ?? '#9ba48f'}">
            <span>夜咒</span><b>${curse?.name ?? '无'}</b>
          </div>
          <div class="daily-leg__row" style="--accent:${bounty?.color ?? '#ffd24e'}">
            <span>悬赏</span><b>${bounty?.name ?? plan.bounties[i]}</b>
          </div>
        </div>
      </article>`;
    }).join('');
    const tallyKind = d.cleared ? 'is-clear' : d.bestScore > 0 ? 'is-open' : 'is-empty';
    const tallyStamp = d.cleared ? '通' : d.bestScore > 0 ? '行' : '待';
    const bestScore = d.bestScore > 0 ? `${d.bestScore}` : '未出手';
    const bestDetail = d.bestScore > 0
      ? `第 ${d.bestStage} 关 · 击杀 ${d.bestKills}${d.cleared ? ' · 已通关' : ''} · 尝试 ${d.attempts} 次`
      : `今天还没有人举起灯 · 尝试 ${d.attempts} 次`;
    this.show(`
      <div class="panel panel--daily panel--vellum">
        <header class="daily-mast">
          <div class="daily-mast__copy">
            <span class="daily-mast__kicker">每日夜报 · 同一夜</span>
            <div class="panel__title daily-mast__title">今日灯芯 <span>·</span> <b>${plan.key}</b></div>
            <p class="subtitle daily-mast__sub">同一个夜晚，同一套条件——比的只是谁打得更远。</p>
          </div>
          <div class="daily-seal" role="img" aria-label="今日同题，共 ${STAGES.length} 关">
            <span>同题</span><b>${STAGES.length}</b><i>关</i>
          </div>
        </header>

        <section class="daily-brief">
          <article class="daily-fact daily-fact--lamp" style="--accent:${lanternColor}">
            <div class="daily-fact__label"><span>灯火</span></div>
            <div class="daily-fact__main">
              <i class="daily-fact__glyph" aria-hidden="true">${lanternName.slice(0, 1)}</i>
              <div class="daily-fact__text"><b>${lanternName}</b><span>${lanternTitle}</span></div>
            </div>
            <p>${lantern?.blurb ?? ''}</p>
          </article>
          <article class="daily-fact daily-fact--risk" style="--accent:${diffTone}">
            <div class="daily-fact__label"><span>难度</span></div>
            <div class="daily-fact__main daily-fact__main--risk">
              <div class="daily-fact__text"><b>${difficulty.label}</b><span>${difficulty.blurb}</span></div>
              <span class="daily-meter" aria-label="危险刻度 ${diffRank} / 3">${diffMeter}</span>
            </div>
            <div class="daily-riskstats">
              <span>敌血 <b>${Math.round(difficulty.hpMult * 100)}%</b></span>
              <span>敌伤 <b>${Math.round(difficulty.dmgMult * 100)}%</b></span>
              <span>余烬 <b>${Math.round(difficulty.emberMult * 100)}%</b></span>
            </div>
          </article>
        </section>

        <section class="daily-route">
          <div class="daily-route__head"><h4>今夜行程 <b>${STAGES.length} 关</b></h4><span>随机种子 ${plan.seed}</span></div>
          <div class="daily-legs">${legs}</div>
        </section>

        <section class="daily-tally">
          <div class="daily-tally__best">
            <span>今日最佳</span><b>${bestScore}</b>${d.bestScore > 0 ? '<em>分</em>' : ''}
            <i>${bestDetail}</i>
          </div>
          <div class="daily-tally__stamp ${tallyKind}" aria-hidden="true">${tallyStamp}</div>
        </section>

        <div class="row-actions daily-actions">
          <button class="btn" data-act="back">返回</button>
          <button class="btn btn--primary" data-act="daily-start">点燃今日灯芯</button>
        </div>
      </div>
    `);
    this.on('[data-act="back"]', () => this.game.goMenu());
    this.on('[data-act="daily-start"]', () => {
      this.returnState = 'menu';
      this.game.startDailyRun(plan.key);
    });
  }

  private records(): void {
    const save = this.game.save;
    const rec = this.game.records.data;
    const runs = save.history;

    const hero = [
      ['总局数', `${save.runs}`, '☾'],
      ['累计击杀', `${save.killsTotal}`, '✦'],
      ['累计守夜', UIManager.hours(rec.totalTime), '◷'],
      ['通关次数', `${rec.clearedRuns}`, '✧'],
      ['完成悬赏', `${rec.bounties}`, '⌖'],
      ['今日灯芯', this.game.dailySave().bestScore > 0 ? `${this.game.dailySave().bestScore} 分` : '未出手', '❖'],
      ['无尽最佳', `${save.bestEndlessWave} 波`, '∞'],
      ['当前余烬', `${save.embers}`, '◈'],
    ]
      .map(([k, v, sigil], i) => `<div class="rec-stat ${i < 4 ? 'is-core' : ''}"><i class="rec-stat__sigil" aria-hidden="true">${sigil}</i><b>${v}</b><span>${k}</span></div>`)
      .join('');

    const bestTime = rec.bestTime > 0 ? UIManager.clock(rec.bestTime) : '—';
    const personal = [
      ['最高连杀', `${rec.bestCombo}`],
      ['单局击杀', `${rec.bestKills}`],
      ['单局等级', rec.bestLevel > 0 ? `Lv ${rec.bestLevel}` : '—'],
      ['单局伤害', `${rec.bestDamage}`],
      ['单局余烬', rec.bestEmbers > 0 ? `+${rec.bestEmbers}` : '—'],
      ['最快通关', bestTime],
    ]
      .map(([k, v]) => `<div class="rec"><span>${k}</span><b>${v}</b></div>`)
      .join('');

    const lanterns = this.game.records
      .lanternRows()
      .map((row) => {
        const locked = !save.unlockedLanterns.includes(row.id);
        const r = row.rec;
        const progress = r.bestWave > 0 ? `无尽 ${r.bestWave} 波` : r.bestStage > 0 ? `第 ${r.bestStage} 关` : '尚未出航';
        const time = r.bestTime > 0 ? ` · 最快 ${UIManager.clock(r.bestTime)}` : '';
        const reached = locked ? 0 : Math.min(STAGES.length, r.bestWave > 0 ? STAGES.length : r.bestStage);
        const steps = STAGES.map((_, i) => `<i class="${i < reached ? 'is-lit' : ''}"></i>`).join('');
        return `<article class="rec-lantern ${locked ? 'is-locked' : ''}" style="--accent:${row.color}">
          <div class="rec-lantern__glyph" aria-hidden="true">${row.name.slice(0, 1)}</div>
          <div class="rec-lantern__head">
            <div class="rec-lantern__name">${row.name}${locked ? '<i>未解锁</i>' : ''}</div>
            <span class="rec-lantern__runs"><b>${r.runs}</b> 局</span>
          </div>
          <div class="rec-lantern__line">${progress}${time}</div>
          <div class="rec-lantern__line rec-lantern__line--dim">单局最高击杀 ${r.bestKills} · 通关 ${r.cleared} 次</div>
          <div class="rec-lantern__steps" aria-hidden="true">${steps}</div>
        </article>`;
      })
      .join('');

    const history = runs.length
      ? runs.map((r) => this.runRow(r)).join('')
      : '<div class="rec-empty">还没有战报 · 去点亮第一盏灯吧</div>';

    this.show(`
      <div class="panel panel--records panel--vellum">
        <div class="panel__title">生涯档案</div>
        <div class="subtitle">灯火熄灭过很多次，但每一簇都被记下来了。</div>
        <div class="rec-hero">${hero}</div>
        <section class="rec-sec"><h4>个人纪录</h4><div class="rec-grid">${personal}</div></section>
        <section class="rec-sec"><h4>灯火战绩</h4><div class="rec-lanterns">${lanterns}</div></section>
        <section class="rec-sec"><h4>最近对局 <b>${runs.length}</b></h4><div class="rec-runs">${history}</div></section>
        <div class="row-actions"><button class="btn btn--primary" data-act="back">返回</button></div>
      </div>
    `);
    this.on('[data-act="back"]', () => this.backToOrigin());
  }

  private achievements(): void {
    const row = (a: (typeof ACHIEVEMENTS)[number]) => {
      const ok = this.game.save.achievements.includes(a.id);
      return `<div class="ach ${ok ? 'is-ok' : ''}">
        <div class="ach__mark">${ok ? '🏆' : '🔒'}</div>
        <div class="ach__body"><div class="ach__name">${a.name}</div><div class="ach__blurb">${a.blurb}</div></div>
        ${a.embers ? `<div class="ach__reward ${ok ? 'is-ok' : ''}">+${a.embers} 余烬</div>` : ''}
      </div>`;
    };
    // 分组展示：30 条成就在一个平铺列表里很难扫，分组之后"下一步该冲什么"一眼可见
    const list = ACHIEVEMENT_GROUPS.map((group) => {
      const items = ACHIEVEMENTS.filter((a) => a.group === group);
      if (!items.length) return '';
      const got = items.filter((a) => this.game.save.achievements.includes(a.id)).length;
      const progress = (got / items.length) * 100;
      return `<div class="ach-group">
        <div class="ach-group__title">
          <span>${group}</span>
          <i class="ach-group__rule" style="--ach-progress:${progress.toFixed(1)}%" aria-hidden="true"><span></span></i>
          <b>${got}/${items.length}</b>
        </div>
        <div class="ach-list">${items.map(row).join('')}</div>
      </div>`;
    }).join('');
    const earned = ACHIEVEMENTS.reduce((n, a) => n + (this.game.save.achievements.includes(a.id) ? a.embers ?? 0 : 0), 0);
    const totalReward = ACHIEVEMENTS.reduce((n, a) => n + (a.embers ?? 0), 0);
    this.show(`
      <div class="panel panel--list panel--vellum">
        <div class="panel__title">成就 · ${this.game.save.achievements.length}/${ACHIEVEMENTS.length}</div>
        <div class="subtitle">已领取成就奖励 ${earned} / ${totalReward} 余烬</div>
        <div class="ach-list">${list}</div>
        <div class="row-actions"><button class="btn btn--primary" data-act="back">返回</button></div>
      </div>
    `);
    this.on('[data-act="back"]', () => this.backToOrigin());
  }

  private settings(): void {
    const s = this.game.settings.data;
    // 只有"掌上设备 + 浏览器支持震动"才显示触感开关，桌面上多一行没意义
    const showHaptics = hapticsAvailable() && isHandheld();
    const hapticRow = showHaptics
      ? `<div class="setting setting--row setting--switch">
          <span class="setting__mark" aria-hidden="true">触</span>
          <label>触感反馈<small>命中与受创时轻震</small></label>
          <button class="toggle ${s.vibrate !== false ? 'is-on' : ''}" data-toggle="vibrate">${s.vibrate !== false ? '开' : '关'}</button>
        </div>`
      : '';
    this.show(`
      <div class="panel panel--settings panel--board">
        <header class="set-head">
          <div class="set-head__copy">
            <span class="set-head__kicker">灯房调校</span>
            <div class="panel__title set-head__title">设置</div>
            <p class="set-head__sub">把灯火、声音与手感调到适合这一夜。</p>
          </div>
          <div class="set-head__status"><i aria-hidden="true"></i><span>自动保存</span></div>
        </header>

        <div class="set-grid">
          <section class="set-panel">
            <div class="set-panel__head"><span class="set-panel__sigil">声</span><div><b>声与触感</b><i>调音台</i></div></div>
            <div class="setting setting--dial"><span class="setting__mark" aria-hidden="true">总</span><label>总音量</label><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-key="master"><b>${Math.round(s.master * 100)}%</b></div>
            <div class="setting setting--dial"><span class="setting__mark" aria-hidden="true">乐</span><label>音乐</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-key="music"><b>${Math.round(s.music * 100)}%</b></div>
            <div class="setting setting--dial"><span class="setting__mark" aria-hidden="true">效</span><label>音效</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-key="sfx"><b>${Math.round(s.sfx * 100)}%</b></div>
            <div class="setting setting--dial"><span class="setting__mark" aria-hidden="true">震</span><label>屏幕震动</label><input type="range" min="0" max="1.5" step="0.1" value="${s.shake}" data-key="shake"><b>${Math.round(s.shake * 100)}%</b></div>
          </section>

          <section class="set-panel">
            <div class="set-panel__head"><span class="set-panel__sigil">画</span><div><b>画面与动作</b><i>观感台</i></div></div>
            <div class="setting setting--row setting--switch">
              <span class="setting__mark" aria-hidden="true">静</span>
              <label>减少动态效果<small>收起闪光与漂移</small></label>
              <button class="toggle ${s.reduceMotion ? 'is-on' : ''}" data-toggle="reduceMotion">${s.reduceMotion ? '开' : '关'}</button>
            </div>
            <div class="setting setting--row setting--switch">
              <span class="setting__mark" aria-hidden="true">析</span>
              <label>动态分辨率<small>掉帧时自动让出像素</small></label>
              <button class="toggle ${s.adaptive ? 'is-on' : ''}" data-toggle="adaptive">${s.adaptive ? '开' : '关'}</button>
            </div>
            ${hapticRow}
            <div class="setting setting--row setting--quality">
              <span class="setting__mark" aria-hidden="true">质</span>
              <label>画质<small>像素与光雾的精细度</small></label>
              <div class="seg">
                ${(['low', 'medium', 'high'] as const).map((q) => `<button class="seg__b ${s.quality === q ? 'is-on' : ''}" data-quality="${q}">${q === 'low' ? '低' : q === 'medium' ? '中' : '高'}</button>`).join('')}
              </div>
            </div>
          </section>
        </div>

        <footer class="set-foot">
          <span class="set-foot__hint"><i aria-hidden="true"></i>改动即时生效 · 自动写入存档</span>
          <button class="btn btn--primary" data-act="back">返回</button>
        </footer>
      </div>
    `);
    this.screen.querySelectorAll('input[type="range"]').forEach((el) => {
      const input = el as HTMLInputElement;
      const paintFill = (): void => {
        const min = Number(input.min || 0);
        const max = Number(input.max || 1);
        const ratio = max > min ? (Number(input.value) - min) / (max - min) : 0;
        input.style.setProperty('--fill', `${(ratio * 100).toFixed(1)}%`);
      };
      paintFill();
      input.addEventListener('input', () => {
        const key = input.dataset.key as 'master' | 'music' | 'sfx' | 'shake';
        this.game.settings.set(key, Number(input.value));
        const b = input.nextElementSibling as HTMLElement;
        b.textContent = `${Math.round(Number(input.value) * 100)}%`;
        paintFill();
      });
    });
    this.on('[data-toggle="vibrate"]', (el) => {
      const v = this.game.settings.data.vibrate === false;
      this.game.settings.set('vibrate', v);
      el.classList.toggle('is-on', v);
      el.textContent = v ? '开' : '关';
      if (v) haptic(14);
    });
    this.on('[data-toggle="adaptive"]', (el) => {
      const v = !this.game.settings.data.adaptive;
      this.game.settings.set('adaptive', v);
      el.classList.toggle('is-on', v);
      el.textContent = v ? '开' : '关';
    });
    this.on('[data-toggle="reduceMotion"]', (el) => {
      const v = !this.game.settings.data.reduceMotion;
      this.game.settings.set('reduceMotion', v);
      el.classList.toggle('is-on', v);
      el.textContent = v ? '开' : '关';
    });
    this.onAll('[data-quality]', (el) => {
      this.game.settings.set('quality', el.dataset.quality as 'low' | 'medium' | 'high');
      this.showScreen('settings');
    });
    this.on('[data-act="back"]', () => this.backToOrigin());
  }
}

/**
 * 伤害这类数字动辄六七位（一局打出去十几万是常事），不分组根本数不清是几位。
 * 结算与构筑总览共用这一个：不然"造成伤害 212345"和"合计 212,345"会同时出现在一屏上。
 */
function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 升级卡的能力对照表：只列"可能被被动改动"的那些，顺序即优先级。 */
const PASSIVE_STAT_ROWS: { key: keyof PlayerStats; label: string; kind: 'int' | 'mult' | 'pct' | 'rate' | 'sec' }[] = [
  { key: 'damageMult', label: '伤害', kind: 'mult' },
  { key: 'maxHp', label: '生命上限', kind: 'int' },
  { key: 'cooldownMult', label: '攻击冷却', kind: 'mult' },
  { key: 'critChance', label: '暴击率', kind: 'pct' },
  { key: 'critMult', label: '暴击伤害', kind: 'mult' },
  { key: 'moveSpeed', label: '移动速度', kind: 'int' },
  { key: 'areaMult', label: '技能范围', kind: 'mult' },
  { key: 'pickupRange', label: '拾取范围', kind: 'int' },
  { key: 'regen', label: '每秒回复', kind: 'rate' },
  { key: 'healOnLight', label: '光照回复', kind: 'rate' },
  { key: 'burnMult', label: '灼烧伤害', kind: 'mult' },
  { key: 'oilDecayMult', label: '灯油耗', kind: 'mult' },
  { key: 'oilGainMult', label: '掉落灯油', kind: 'mult' },
  { key: 'dashCooldown', label: '冲刺冷却', kind: 'sec' },
  { key: 'luck', label: '黑暗减速', kind: 'pct' },
];

function changed(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9;
}

function formatStat(row: (typeof PASSIVE_STAT_ROWS)[number], v: number): string {
  if (row.kind === 'mult') return `×${v.toFixed(2)}`;
  if (row.kind === 'pct') return `${Math.round(v * 100)}%`;
  if (row.kind === 'rate') return `+${v.toFixed(1)}`;
  if (row.kind === 'sec') return `${v.toFixed(2)}s`;
  return `${Math.round(v)}`;
}

/** 卡面上印得出数值的那些项。`drag` 那种"是/否"的开关不在里面（它不属于"改了多少"）。 */
type WeaponRowKey = Exclude<keyof WeaponStats, 'drag'>;

/**
 * 取一项数值。可选的那些（现在只有「倾灯」的 `pour`）也印在卡上——
 * "升级之后同一瓢更省油"正是这把武器最该看见的一件事，所以不把它踢出去，
 * 只是取的时候认一下"这件武器有没有这一项"。
 */
const rowNum = (st: WeaponStats, k: WeaponRowKey): number => st[k] ?? 0;

/** 武器卡的那几行：`before` 为空 = 这是把新武器，写它的身板而不是变化量。 */
function weaponRows(
  before: WeaponStats | null,
  after: WeaponStats,
  order?: WeaponRowKey[],
): { k: string; from?: string; to: string }[] {
  const int = (v: number) => `${Math.round(v)}`;
  const sec = (v: number) => `${v.toFixed(2)}s`;
  // 光矛 / 冰川这种"打到天边"的武器在数据里写的是 99，那是实现细节，不该印到卡面上
  const pierce = (v: number) => (v >= 90 ? '∞' : String(Math.round(v)));
  if (!before) {
    const rows: { k: string; from?: string; to: string }[] = [{ k: '伤害', to: int(after.damage) }];
    if (after.cooldown > 0) rows.push({ k: '间隔', to: sec(after.cooldown) });
    if (after.count > 1) rows.push({ k: '数量', to: int(after.count) });
    if (after.pierce > 0) rows.push({ k: '穿透', to: pierce(after.pierce) });
    if (after.pour) rows.push({ k: '一瓢的油', to: `${Math.round(after.pour * 100)}%` });
    return rows;
  }
  const fields: { key: WeaponRowKey; label: string; fmt: (v: number) => string }[] = [
    { key: 'damage', label: '伤害', fmt: int },
    { key: 'count', label: '数量', fmt: int },
    { key: 'cooldown', label: '间隔', fmt: sec },
    { key: 'range', label: '距离', fmt: int },
    { key: 'radius', label: '体积', fmt: int },
    { key: 'pierce', label: '穿透', fmt: pierce },
    { key: 'speed', label: '速度', fmt: int },
    { key: 'knockback', label: '击退', fmt: int },
    { key: 'burn', label: '灼烧', fmt: sec },
    { key: 'slow', label: '减速', fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'pour', label: '一瓢的油', fmt: (v) => `${Math.round(v * 100)}%` },
  ];
  const listed = order ? order.map((k) => fields.find((f) => f.key === k)!).filter(Boolean) : fields;
  return listed
    .filter((f) => changed(rowNum(before, f.key), rowNum(after, f.key)))
    .map((f) => ({ k: f.label, from: f.fmt(rowNum(before, f.key)), to: f.fmt(rowNum(after, f.key)) }));
}
