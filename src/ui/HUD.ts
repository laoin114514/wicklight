import type { Game } from '../core/Game';
import type { HUDHost } from '../core/Game';
import { WEAPON_MAP } from '../data/weapons';
import { PASSIVE_MAP } from '../data/upgrades';
import { RELIC_MAP, TRIBES } from '../data/relics';
import { STAGES } from '../data/stages';

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
  private announceEl!: HTMLElement;
  private toastRoot: HTMLElement;
  private hudEl!: HTMLElement;
  private announceTimer = 0;

  constructor(private game: Game) {
    this.root = document.getElementById('ui-root') as HTMLElement;
    this.toastRoot = document.getElementById('toast-root') as HTMLElement;
    this.build();
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
      <div class="hud__hint">WASD 移动 · 空格冲刺 · Q 燃爆 · 自动开火 · Esc 暂停</div>
    `;
    this.root.appendChild(hud);
    this.hudEl = hud;

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

  setVisible(v: boolean): void {
    this.hudEl.style.display = v ? '' : 'none';
  }

  setBoss(name: string | null, frac: number): void {
    this.setBosses(name ? [{ name, frac }] : []);
  }

  /** 首领血条：一列写下来，同台几位就有几行。 */
  setBosses(list: { name: string; frac: number }[]): void {
    if (!list.length) {
      this.bossWrap.classList.remove('is-active');
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
      if (slot.name.textContent !== b.name) slot.name.textContent = b.name;
      slot.fill.style.width = `${Math.max(0, b.frac) * 100}%`;
    });
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastRoot.appendChild(el);
    window.setTimeout(() => el.classList.add('is-out'), 1800);
    window.setTimeout(() => el.remove(), 2600);
  }

  /** 首次遭遇的提示卡：比 toast 多一行说明，停得也久一些（7 秒）。 */
  tip(title: string, text: string): void {
    const el = document.createElement('div');
    el.className = 'toast toast--tip';
    el.innerHTML = `<b>${title}</b><span>${text}</span>`;
    this.toastRoot.appendChild(el);
    window.setTimeout(() => el.classList.add('is-out'), 6400);
    window.setTimeout(() => el.remove(), 7200);
  }

  announce(text: string, big = false): void {
    this.announceEl.textContent = text;
    this.announceEl.className = `announce is-show${big ? ' is-big' : ''}`;
    this.announceTimer = big ? 2.4 : 1.6;
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
    this.hpFill.style.width = `${Math.max(0, (g.player.hp / g.player.stats.maxHp) * 100)}%`;
    this.oilFill.style.width = `${Math.max(0, g.player.oilFrac * 100)}%`;
    this.xpFill.style.width = `${g.xpFrac * 100}%`;
    this.levelEl.textContent = String(g.playerLevel);
    // 波次写出分母：玩家该知道"还剩几波就出首领"，而不是只能数着等
    const totalWaves = g.director.totalWaves;
    const endless = g.endless || !Number.isFinite(totalWaves);
    this.waveEl.textContent = endless ? `∞${g.wave}` : `${g.wave}/${totalWaves}`;
    this.updateWaveBar(g.wave, totalWaves, endless);
    const t = Math.floor(g.runTime);
    this.timeEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.killEl.textContent = String(g.kills);
    this.emberEl.textContent = String(g.save.embers);
    this.goldEl.textContent = String(g.gold);
    this.updateBuild();
    const stage = g.endless ? '无尽 · 长夜' : (STAGES[Math.min(g.stageIndex, STAGES.length - 1)]?.theme.name ?? '');
    this.stageEl.textContent = stage;
    this.setBosses(g.bossList ?? []);
    this.updateCurse();
    this.updateBounty();
    this.updatePyreChip();

    const comboOn = g.combo >= 3;
    if (comboOn !== this.comboEl.classList.contains('is-on')) this.comboEl.classList.toggle('is-on', comboOn);
    if (comboOn) {
      this.comboNum.textContent = String(g.combo);
      this.comboBar.style.width = `${Math.max(0, Math.min(1, g.comboTimer / 2.2)) * 100}%`;
      this.comboEl.classList.toggle('is-hot', g.combo >= 15);
    }

    const dim = g.player.oilFrac < 0.25;
    this.oilFill.parentElement?.classList.toggle('is-low', dim);

    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.announceEl.className = 'announce';
    }
  }
}
