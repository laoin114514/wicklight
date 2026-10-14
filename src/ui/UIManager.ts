import { ACHIEVEMENTS } from '../data/achievements';
import { LANTERNS, LANTERN_MAP } from '../data/lanterns';
import { META_TREE } from '../data/meta';
import { PASSIVE_MAP } from '../data/upgrades';
import { CODEX_SECTIONS } from '../systems/CodexSystem';
import { RELIC_MAP } from '../data/relics';
import { WEAPON_MAP, weaponAt } from '../data/weapons';
import { STAGES, STAGE_MAP } from '../data/stages';
import type { RunRecord } from '../types';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../systems/DifficultySystem';
import type { Game, GameState, UIHost } from '../core/Game';
import type { Difficulty, MetaNodeDef, UpgradeOffer } from '../types';

export class UIManager implements UIHost {
  private root: HTMLElement;
  private screen!: HTMLElement;
  private offers: UpgradeOffer[] = [];
  private rerolls = 0;
  private selectedLantern = 'warden';
  private selectedDifficulty: Difficulty = 'normal';
  private endless = false;
  private returnState: GameState = 'menu';

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
      case 'shrine': this.shrine(); break;
      case 'victory': this.victory(); break;
      case 'dead': this.dead(); break;
      case 'meta': this.meta(); break;
      case 'codex': this.codex(); break;
      case 'records': this.records(); break;
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
      <div class="panel panel--menu">
        <div class="title">WICK<span>LIGHT</span></div>
        <div class="subtitle">灯芯 · 让光活下去</div>
        <div class="menu-buttons">
          <button class="btn btn--primary" data-act="play">开始冒险</button>
          <button class="btn ${endlessUnlocked ? '' : 'is-locked'}" data-act="endless">无尽之夜${endlessUnlocked ? '' : ' · 通关幽林解锁'}</button>
          <button class="btn" data-act="meta">余烬解锁 <b>${save.embers}</b></button>
          <button class="btn" data-act="codex">图鉴 <b>${this.game.codex.seenCount()}/${this.game.codex.total()}</b></button>
          <button class="btn" data-act="records">生涯档案</button>
          <button class="btn" data-act="achievements">成就 <b>${save.achievements.length}/${ACHIEVEMENTS.length}</b></button>
          <button class="btn" data-act="settings">设置</button>
        </div>
        <div class="menu-foot">
          <span>最高关卡 ${cleared}/3</span>
          <span>余烬 ${save.embers}</span>
          <span>总击杀 ${save.killsTotal}</span>
          <span>无尽最佳 ${save.bestEndlessWave} 波</span>
          <span>生涯 ${save.runs} 局</span>
        </div>
      </div>
    `);
    this.on('[data-act="play"]', () => { this.endless = false; this.openSelect(); });
    this.on('[data-act="endless"]', () => {
      if (!endlessUnlocked) return;
      this.endless = true;
      this.openSelect();
    });
    this.on('[data-act="meta"]', () => { this.returnState = 'menu'; this.game.openMenu('meta'); });
    this.on('[data-act="codex"]', () => { this.returnState = 'menu'; this.game.openMenu('codex'); });
    this.on('[data-act="records"]', () => { this.returnState = 'menu'; this.game.openMenu('records'); });
    this.on('[data-act="achievements"]', () => { this.returnState = 'menu'; this.game.openMenu('achievements'); });
    this.on('[data-act="settings"]', () => { this.returnState = 'menu'; this.game.openMenu('settings'); });
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

  private offerCard(o: UpgradeOffer): string {
    const tagLabel = o.tag === 'evolve' ? '进化' : o.tag === 'new' ? '新' : '升级';
    return `<button class="card" data-offer="${o.kind}:${o.id}" style="--accent:${o.color}">
      <div class="card__icon">${o.icon}</div>
      <div class="card__tag">${tagLabel} · ${o.level}/${o.maxLevel}</div>
      <div class="card__name">${o.name}</div>
      <div class="card__blurb">${o.blurb}</div>
    </button>`;
  }

  private levelup(): void {
    const cards = this.offers.map((o) => this.offerCard(o)).join('');
    this.show(`
      <div class="panel panel--levelup">
        <div class="panel__title">灯火更亮 · Lv ${this.game.playerLevel}</div>
        <div class="card-grid">${cards}</div>
        <div class="row-actions">
          <button class="btn ${this.rerolls > 0 ? '' : 'is-locked'}" data-act="reroll">重掷 (${this.rerolls})</button>
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
      <div class="panel panel--small">
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

    const b = g.bounties.state;
    const bounty = b
      ? `<div class="lo-bounty ${b.done ? 'is-done' : ''}" style="--c:${b.def.color}">
          <b>${b.def.icon} ${b.def.name}</b>
          <span>${b.done ? '已完成 · 奖励已发放' : `${b.def.blurb}（${g.bounties.label}）· 奖励 ${b.def.reward.gold} 金币`}</span>
        </div>`
      : '<div class="lo-empty">本关没有悬赏</div>';

    this.show(`
      <div class="panel panel--loadout">
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
          <div><span>造成伤害</span><b>${s.damageDealt}</b></div>
          <div><span>最高连击</span><b>${s.bestCombo}</b></div>
        </div>
        <div class="lo-grid">
          <section class="lo-col">
            <h4>武器 <b>${p.weapons.size}</b></h4>
            ${weapons || '<div class="lo-empty">还没有武器</div>'}
            <h4>被动 <b>${p.passives.size}</b></h4>
            ${passives || '<div class="lo-empty">还没有被动</div>'}
          </section>
          <section class="lo-col">
            <h4>遗物 <b>${p.relics.size}</b></h4>
            ${relics || '<div class="lo-empty">还没有遗物</div>'}
            <h4>夜咒</h4>
            ${curse}
            <h4>悬赏</h4>
            ${bounty}
          </section>
        </div>
        <div class="lo-attrs">${attrs}</div>
        <div class="row-actions"><button class="btn btn--primary" data-act="sheet-close">返回战斗 <span class="key">Tab</span></button></div>
      </div>
    `);
    this.on('[data-act="sheet-close"]', () => this.game.toggleSheet());
  }

  private statsBlock(): string {
    const s = this.game.runStats();
    return `
      <div class="stats">
        <div><span>击杀</span><b>${s.kills}</b></div>
        <div><span>等级</span><b>${s.level}</b></div>
        <div><span>存活</span><b>${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</b></div>
        <div><span>波次</span><b>${s.wave}</b></div>
        <div><span>最高连击</span><b>${s.bestCombo}</b></div>
        <div><span>造成伤害</span><b>${s.damageDealt}</b></div>
        <div><span>承受伤害</span><b>${s.damageTaken}</b></div>
        <div><span>击败首领</span><b>${s.bossKills}</b></div>
      </div>`;
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
        <div class="shop-item__price">${it.sold ? '已售出' : `${it.price} 🪙`}</div>
      </button>`,
      )
      .join('');
    this.show(`
      <div class="panel panel--shop">
        <div class="panel__title">${g.shopHeader}</div>
        <div class="shop-wallet">金币 <b>🪙 ${g.gold}</b></div>
        <div class="shop-grid">${items}</div>
        <div class="row-actions">
          <button class="btn ${g.gold >= 8 ? '' : 'is-locked'}" data-act="reroll">刷新商品 (8 🪙)</button>
          <button class="btn btn--primary" data-act="leave">${g.endless ? '继续战斗' : '继续前进'}</button>
        </div>
      </div>
    `);
    this.onAll('[data-buy]', (el) => {
      this.game.buyShop(Number(el.dataset.buy));
    });
    this.on('[data-act="reroll"]', () => this.game.rerollShop());
    this.on('[data-act="leave"]', () => this.game.leaveShop());
  }

  private shrine(): void {
    const g = this.game;
    const cards = g.shrineOffers
      .map(
        (o) => `
      <button class="shrine-card" data-shrine="${o.id}" style="--accent:${o.color}">
        <div class="shrine-card__icon">${o.icon}</div>
        <div class="shrine-card__name">${o.name}</div>
        <div class="shrine-card__blurb">${o.blurb}</div>
      </button>`,
      )
      .join('');
    this.show(`
      <div class="panel panel--shrine">
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
      <div class="panel panel--small">
        <div class="panel__title">灯火熄灭</div>
        <div class="ember-gain">获得余烬 <b>+${this.game.embersEarned}</b></div>
        ${this.achievementEmbersLine()}
        ${this.recordBadges()}
        ${this.statsBlock()}
        <div class="row-actions">
          <button class="btn btn--primary" data-act="again">再点一盏</button>
          <button class="btn" data-act="menu">返回主菜单</button>
        </div>
      </div>
    `);
    this.on('[data-act="again"]', () => this.game.openMenu('select'));
    this.on('[data-act="menu"]', () => this.game.goMenu());
  }

  private victory(): void {
    this.show(`
      <div class="panel panel--small">
        <div class="panel__title">焚尽长夜</div>
        <div class="subtitle">你举着灯，走完了三段黑暗。</div>
        <div class="ember-gain">获得余烬 <b>+${this.game.embersEarned}</b></div>
        ${this.achievementEmbersLine()}
        ${this.recordBadges()}
        ${this.statsBlock()}
        <div class="row-actions">
          <button class="btn btn--primary" data-act="endless">挑战无尽之夜</button>
          <button class="btn" data-act="menu">返回主菜单</button>
        </div>
      </div>
    `);
    this.on('[data-act="endless"]', () => { this.endless = true; this.openSelect(); });
    this.on('[data-act="menu"]', () => this.game.goMenu());
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
      <div class="panel panel--meta">
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

  private codex(): void {
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
          return `<div class="cx" style="--c:${e.color ?? '#8fa7ff'}">
            <div class="cx__dot">${e.icon ?? '●'}</div>
            <div class="cx__name">${e.name}${e.tag ? `<i class="cx__tag">${e.tag}</i>` : ''}</div>
            <div class="cx__blurb">${e.blurb}</div>
          </div>`;
        })
        .join('');
      return `<section class="cx-sec">
        <h4>${sec.title} <b>${cx.sectionSeen(sec.kind)}/${entries.length}</b><span>${sec.hint}</span></h4>
        <div class="cx-grid">${cards}</div>
      </section>`;
    }).join('');
    this.show(`
      <div class="panel panel--codex">
        <div class="panel__title">图鉴 · ${seen}/${total}</div>
        <div class="cx-bar"><i style="width:${pct}%"></i></div>
        ${sections}
        <div class="row-actions"><button class="btn btn--primary" data-act="back">返回</button></div>
      </div>
    `);
    this.on('[data-act="back"]', () => this.backToOrigin());
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
        </div>
        <div class="rec-run__sub">
          击杀 ${r.kills} · Lv ${r.level} · ${UIManager.clock(r.time)} · 连杀 ${r.bestCombo}${r.bossKills ? ` · 首领 ${r.bossKills}` : ''}
        </div>
      </div>
      <div class="rec-run__side"><b>+${r.embers}</b><span>${UIManager.ago(r.at)}</span></div>
    </div>`;
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
      <div class="panel panel--records">
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
    const list = ACHIEVEMENTS.map((a) => {
      const ok = this.game.save.achievements.includes(a.id);
      return `<div class="ach ${ok ? 'is-ok' : ''}">
        <div class="ach__mark">${ok ? '🏆' : '🔒'}</div>
        <div class="ach__body"><div class="ach__name">${a.name}</div><div class="ach__blurb">${a.blurb}</div></div>
        ${a.embers ? `<div class="ach__reward ${ok ? 'is-ok' : ''}">+${a.embers} 余烬</div>` : ''}
      </div>`;
    }).join('');
    const earned = ACHIEVEMENTS.reduce((n, a) => n + (this.game.save.achievements.includes(a.id) ? a.embers ?? 0 : 0), 0);
    const totalReward = ACHIEVEMENTS.reduce((n, a) => n + (a.embers ?? 0), 0);
    this.show(`
      <div class="panel panel--list">
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
    this.show(`
      <div class="panel panel--small">
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
