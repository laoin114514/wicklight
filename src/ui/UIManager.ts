import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../data/achievements';
import { LANTERNS, LANTERN_MAP } from '../data/lanterns';
import { META_TREE } from '../data/meta';
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
import type { Game, GameState, UIHost } from '../core/Game';
import { haptic, hapticsAvailable } from '../core/Haptics';
import { isHandheld } from '../core/Perf';
import type { Difficulty, MetaNodeDef, UpgradeOffer, WeaponStats } from '../types';

export class UIManager implements UIHost {
  private root: HTMLElement;
  private screen!: HTMLElement;
  private offers: UpgradeOffer[] = [];
  private rerolls = 0;
  private selectedLantern = 'warden';
  private selectedDifficulty: Difficulty = 'normal';
  private endless = false;
  private returnState: GameState = 'menu';
  /** 图鉴里正在查看详情的条目（`kind:id`），为空时显示目录。 */
  codexFocus: string | null = null;

  constructor(private game: Game) {
    this.root = document.getElementById('ui-root') as HTMLElement;
    this.build();
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
              <span class="btn__label">开始冒险</span>
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

  /**
   * 结算面板上的**主按钮**，交给键盘走：死亡 = 再点一盏、通关 = 挑战无尽之夜。
   *
   * 它和 `Game.pickOffer` 是同一类东西（把面板上那颗按钮接给键盘），但落点不一样：
   * 那三个"选第几张"选的是一份游戏状态，而这两个按钮按下去是**换一块面板**
   * （其中"挑战无尽之夜"还要先把 `endless` 这个界面自己的开关拨上去）——
   * 面板的班次该由面板自己交代。
   *
   * 只认这两块：商店那颗"继续前进"是另一回事。它意味着"我买完了"，而这里意味着
   * "我读完了"——同一颗回车在两处各自表示什么，得说清楚，不然迟早有人在补给站里
   * 习惯性按下回车，然后带着一钱包金币上了下一关。
   */
  panelPrimary(): boolean {
    if (this.game.state === 'dead') {
      this.game.openMenu('select');
      return true;
    }
    if (this.game.state === 'victory') {
      this.endless = true;
      this.openSelect();
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
      return `
        <button class="lantern ${sel ? 'is-selected' : ''} ${ok ? '' : 'is-locked'}" data-lantern="${l.id}" style="--accent:${l.color}">
          <div class="lantern__flame" style="background:radial-gradient(circle at 50% 40%, #fff, ${l.color} 45%, transparent 75%)"></div>
          <div class="lantern__name">${l.name}</div>
          <div class="lantern__title">${l.title}</div>
          <div class="lantern__blurb">${ok ? l.blurb : '尚未解锁 · 前往余烬解锁'}</div>
        </button>`;
    }).join('');

    const diffCards = DIFFICULTY_ORDER.map((d) => {
      const mods = DIFFICULTIES[d];
      return `<button class="diff ${d === this.selectedDifficulty ? 'is-selected' : ''}" data-diff="${d}">
        <b>${mods.label}</b><span>${mods.blurb}</span>
      </button>`;
    }).join('');

    this.show(`
      <div class="panel panel--select">
        <div class="panel__title">${this.endless ? '无尽之夜' : '冒险 · 选择灯火与难度'}</div>
        <div class="lantern-grid">${lanternCards}</div>
        <div class="diff-row">${diffCards}</div>
        <div class="row-actions">
          <button class="btn" data-act="back">返回</button>
          <button class="btn btn--primary" data-act="start">点燃灯芯</button>
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
    this.on('[data-act="back"]', () => this.game.goMenu());
    this.on('[data-act="start"]', () => this.game.newRun(this.selectedLantern, this.selectedDifficulty, this.endless));
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
    return `<button class="card" data-offer="${o.kind}:${o.id}" style="--accent:${o.color}">
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
    this.show(`
      <div class="panel panel--levelup panel--plank">
        <div class="panel__title">灯火更亮 · Lv ${this.game.playerLevel}</div>
        <div class="card-grid">${cards}</div>
        <div class="row-actions">
          <button class="btn ${this.rerolls > 0 ? '' : 'is-locked'}" data-act="reroll">重掷 (${this.rerolls})<span class="key">R</span></button>
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
    this.show(`
      <div class="panel panel--small panel--board">
        <div class="panel__title">暂停</div>
        <div class="menu-buttons">
          <button class="btn btn--primary" data-act="resume">继续</button>
          <button class="btn" data-act="sheet">构筑总览 <span class="key">Tab</span></button>
          <button class="btn" data-act="settings">设置</button>
          <button class="btn" data-act="quit">放弃本次冒险</button>
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
        return `<div class="lo-row" style="--c:${def.color}">
          <span class="lo-row__name">${def.name}${def.evolved ? '<i class="lo-tag lo-tag--evo">进化</i>' : ''}</span>
          <span class="lo-row__lv ${full ? 'is-full' : ''}">Lv ${lvl}/${max}</span>
          <span class="lo-row__blurb">伤害 ${Math.round(stats.damage)} · 间隔 ${stats.cooldown > 0 ? `${stats.cooldown.toFixed(2)}s` : '常驻'}${stats.count > 1 ? ` · ${stats.count} 发` : ''}</span>
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
          <div class="lo-evo__head"><b>${def.name}</b><span>→ ${into?.name ?? def.evolve.into}</span></div>
          <div class="lo-evo__need">
            武器 ${lvl}/${max} ${lvl >= max ? '✓' : ''} · ${passive?.name ?? def.evolve.passive} ${have}/${need} ${have >= need ? '✓' : ''}
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
            <h4>悬赏</h4>
            ${bounty}
            <h4>掠影</h4>
            ${graze}
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
   */
  private lightBlock(): string {
    const p = this.game.player;
    const dim = p.wickOn;
    const walk = p.wickTime >= 1 ? ` · 本局拨芯 ${Math.round(p.wickTime)}s` : '';
    return `<div class="lo-bounty lo-light ${dim ? 'is-dim' : ''}" style="--c:${WICK.color}">
        <b>${dim ? '🌒 拨芯中 · 微光' : '🔥 灯火全开'}</b>
        <span>灯火半径 ${Math.round(p.lightRadius)}px · 亮度 ×${p.brightness.toFixed(2)} · 火力 ×${p.damageScale.toFixed(2)}${walk}</span>
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
    const chips = owned
      .map((id) => {
        const d = RELIC_MAP[id];
        return `<button class="forge-chip" data-forge="${id}" title="${d?.blurb ?? id}" style="--c:${d?.color ?? '#fff'}">${d?.icon ?? ''} ${d?.name ?? id}</button>`;
      })
      .join('');
    const note = used ? '本店已熔铸过' : poor ? `还差 ${price - g.gold} 金币` : `换掉哪一件？`;
    return `
      <div class="forge ${used || poor ? 'is-off' : ''}">
        <div class="forge__head">
          <b>🔥 熔铸台</b>
          <span>${note}</span>
          <i>${price} 🪙</i>
        </div>
        <div class="forge__row">${chips}</div>
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
        (c) => `
      <button class="curse-card" data-curse="${c.id}" style="--accent:${c.color}">
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
    this.show(`
      <div class="panel panel--small panel--vellum">
        <div class="panel__title">灯火熄灭</div>
        ${this.killerLine()}
        <div class="ember-gain">获得余烬 <b>+${this.game.embersEarned}</b></div>
        ${this.dailyLine()}
        ${this.achievementEmbersLine()}
        ${this.recordBadges()}
        ${this.statsBlock()}
        ${this.damageBlock()}
        ${this.runBuildBlock()}
        <div class="row-actions">
          <button class="btn btn--primary" data-act="again">再点一盏<span class="key">回车</span></button>
          <button class="btn" data-act="menu">返回主菜单</button>
        </div>
      </div>
    `);
    this.on('[data-act="again"]', () => this.game.openMenu('select'));
    this.on('[data-act="menu"]', () => this.game.goMenu());
  }

  private victory(): void {
    this.show(`
      <div class="panel panel--small panel--vellum">
        <div class="panel__title">焚尽长夜</div>
        <div class="subtitle">你举着灯，走完了长夜之城的最后一段黑暗。</div>
        ${this.tourLine()}
        <div class="ember-gain">获得余烬 <b>+${this.game.embersEarned}</b></div>
        ${this.dailyLine()}
        ${this.achievementEmbersLine()}
        ${this.recordBadges()}
        ${this.statsBlock()}
        ${this.damageBlock()}
        ${this.runBuildBlock()}
        <div class="row-actions">
          <button class="btn btn--primary" data-act="endless">挑战无尽之夜<span class="key">回车</span></button>
          <button class="btn" data-act="menu">返回主菜单</button>
        </div>
      </div>
    `);
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

  private meta(): void {
    const nodes = META_TREE.map((n) => this.nodeCard(n)).join('');
    this.show(`
      <div class="panel panel--meta panel--board">
        <div class="panel__title">余烬解锁 · <b>${this.game.save.embers}</b> 余烬</div>
        <div class="node-grid">${nodes}</div>
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
    const rows = (entry.rows ?? [])
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
      .join('');
    this.show(`
      <div class="panel panel--detail panel--vellum" style="--c:${entry.color ?? '#8fa7ff'}">
        <div class="cx-head">
          <div class="cx-head__icon">${entry.icon ?? '●'}</div>
          <div>
            <div class="cx-head__name">${entry.name}${entry.tag ? `<i class="cx__tag">${entry.tag}</i>` : ''}</div>
            <div class="cx-head__kind">${section?.title ?? ''}</div>
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
      return `<section class="cx-sec">
        <h4>${sec.title} <b>${cx.sectionSeen(sec.kind)}/${entries.length}</b><span>${sec.hint}</span></h4>
        <div class="cx-grid">${cards}</div>
      </section>`;
    }).join('');
    this.show(`
      <div class="panel panel--codex panel--vellum">
        <div class="panel__title">图鉴 · ${seen}/${total}</div>
        <div class="cx-bar"><i style="width:${pct}%"></i></div>
        ${sections}
        <div class="row-actions"><button class="btn btn--primary" data-act="back">返回</button></div>
      </div>
    `);
    this.on('[data-act="back"]', () => this.backToOrigin());
    this.onAll('[data-cx]', (el) => {
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
    return `<div class="rec-run ${r.cleared ? 'is-clear' : ''}">
      <div class="rec-run__mark">${r.cleared ? '🏆' : '🕯️'}</div>
      <div class="rec-run__body">
        <div class="rec-run__top">
          <b style="color:${lantern?.color ?? 'var(--amber)'}">${lantern?.name ?? r.lantern}</b>
          <span class="rec-run__diff">${diff}</span>
          <span class="rec-run__where">${where}</span>
          ${r.daily ? '<span class="rec-run__daily">今日灯芯</span>' : ''}
        </div>
        <div class="rec-run__sub">
          击杀 ${r.kills} · Lv ${r.level} · ${UIManager.clock(r.time)} · 连杀 ${r.bestCombo}${r.bossKills ? ` · 首领 ${r.bossKills}` : ''}
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
    const rows: [string, string][] = [
      ['灯火', `${lantern?.name ?? plan.lantern}（${lantern?.title ?? ''}）`],
      ['难度', DIFFICULTIES[plan.difficulty].label],
      ['夜咒', plan.curses.map((id, i) => `${i + 1}关 ${id ? CURSE_MAP[id]?.name ?? id : '无'}`).join(' · ')],
      ['悬赏', plan.bounties.map((id, i) => `${i + 1}关 ${BOUNTY_MAP[id]?.name ?? id}`).join(' · ')],
      ['随机种子', `${plan.seed}`],
    ];
    const best = d.bestScore > 0
      ? `<div class="daily-best">今日最佳 <b>${d.bestScore}</b> 分 · 第 ${d.bestStage} 关 · 击杀 ${d.bestKills}${d.cleared ? ' · 已通关' : ''} · 尝试 ${d.attempts} 次</div>`
      : `<div class="daily-best daily-best--none">今天还没有人举起灯 · 尝试 <b>${d.attempts}</b> 次</div>`;
    this.show(`
      <div class="panel panel--daily panel--vellum">
        <div class="panel__title">今日灯芯 · ${plan.key}</div>
        <div class="subtitle">同一个夜晚，同一套条件——比的只是谁打得更远。</div>
        <div class="cx-rows">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        ${best}
        <div class="row-actions">
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
      ['总局数', `${save.runs}`],
      ['累计击杀', `${save.killsTotal}`],
      ['累计守夜', UIManager.hours(rec.totalTime)],
      ['通关次数', `${rec.clearedRuns}`],
      ['完成悬赏', `${rec.bounties}`],
      ['今日灯芯', this.game.dailySave().bestScore > 0 ? `${this.game.dailySave().bestScore} 分` : '未出手'],
      ['无尽最佳', `${save.bestEndlessWave} 波`],
      ['当前余烬', `${save.embers}`],
    ]
      .map(([k, v]) => `<div class="rec-stat"><b>${v}</b><span>${k}</span></div>`)
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
        return `<div class="rec-lantern ${locked ? 'is-locked' : ''}" style="--accent:${row.color}">
          <div class="rec-lantern__name">${row.name}${locked ? '<i>未解锁</i>' : ''}</div>
          <div class="rec-lantern__line"><b>${r.runs}</b> 局 · ${progress}${time}</div>
          <div class="rec-lantern__line rec-lantern__line--dim">单局最高击杀 ${r.bestKills} · 通关 ${r.cleared} 次</div>
        </div>`;
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
      return `<div class="ach-group">
        <div class="ach-group__title">${group} <b>${got}/${items.length}</b></div>
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
    this.show(`
      <div class="panel panel--small panel--board">
        <div class="panel__title">设置</div>
        <div class="setting"><label>总音量</label><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-key="master"><b>${Math.round(s.master * 100)}%</b></div>
        <div class="setting"><label>音乐</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-key="music"><b>${Math.round(s.music * 100)}%</b></div>
        <div class="setting"><label>音效</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-key="sfx"><b>${Math.round(s.sfx * 100)}%</b></div>
        <div class="setting"><label>屏幕震动</label><input type="range" min="0" max="1.5" step="0.1" value="${s.shake}" data-key="shake"><b>${Math.round(s.shake * 100)}%</b></div>
        <div class="setting setting--row">
          <label>减少动态效果</label>
          <button class="toggle ${s.reduceMotion ? 'is-on' : ''}" data-toggle="reduceMotion">${s.reduceMotion ? '开' : '关'}</button>
        </div>
        <div class="setting setting--row">
          <label>动态分辨率</label>
          <button class="toggle ${s.adaptive ? 'is-on' : ''}" data-toggle="adaptive">${s.adaptive ? '开' : '关'}</button>
        </div>
        ${showHaptics ? `<div class="setting setting--row">
          <label>触感反馈</label>
          <button class="toggle ${s.vibrate !== false ? 'is-on' : ''}" data-toggle="vibrate">${s.vibrate !== false ? '开' : '关'}</button>
        </div>` : ''}
        <div class="setting setting--row">
          <label>画质</label>
          <div class="seg">
            ${(['low', 'medium', 'high'] as const).map((q) => `<button class="seg__b ${s.quality === q ? 'is-on' : ''}" data-quality="${q}">${q === 'low' ? '低' : q === 'medium' ? '中' : '高'}</button>`).join('')}
          </div>
        </div>
        <div class="row-actions"><button class="btn btn--primary" data-act="back">返回</button></div>
      </div>
    `);
    this.screen.querySelectorAll('input[type="range"]').forEach((el) => {
      el.addEventListener('input', () => {
        const input = el as HTMLInputElement;
        const key = input.dataset.key as 'master' | 'music' | 'sfx' | 'shake';
        this.game.settings.set(key, Number(input.value));
        const b = input.nextElementSibling as HTMLElement;
        b.textContent = `${Math.round(Number(input.value) * 100)}%`;
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
