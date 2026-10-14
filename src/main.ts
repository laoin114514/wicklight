import './styles/main.css';
import { Game } from './core/Game';
import { Loop } from './core/Loop';
import { Input } from './core/Input';
import { HUD } from './ui/HUD';
import { UIManager } from './ui/UIManager';
import { TouchControls } from './ui/TouchControls';
import { setupOrientation } from './ui/Orientation';
import { WEAPONS as weapons } from './data/weapons';
import { RELICS as relics, TRIBES as tribes } from './data/relics';
import { PASSIVES as passives } from './data/upgrades';
import { CURSES as curses } from './data/curses';
import { ENEMIES as enemies, NORMAL_ENEMIES as normalEnemies } from './data/enemies';
import { AFFIXES as affixes } from './data/affixes';
import { BOUNTIES as bounties } from './data/bounties';
import { META_TREE as meta } from './data/meta';
import { STAGES as stages } from './data/stages';
import * as daily from './systems/DailySystem';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const bootScreen = document.getElementById('boot-screen');
  const bootHint = document.getElementById('boot-hint');

  const game = new Game(canvas);
  const ui = new UIManager(game);
  const hud = new HUD(game);
  const touch = new TouchControls(game);
  const input = new Input(canvas);

  game.setUI(ui, hud);
  ui.mountMenus();

  (window as unknown as { __WICKLIGHT__?: unknown }).__WICKLIGHT__ = {
    game,
    loop: null,
    input,
    ui,
    hud,
    touch,
    // 供测试/调试读取的静态数据表（无副作用）
    data: { weapons, relics, passives, curses, bounties, tribes, meta },
    daily,
    // 敌人 / 词缀表结构不同（没有 blurb），单独放一份
    catalog: { enemies, affixes, stages, normalEnemies },
  };

  const resize = () => {
    game.renderer.resize(window.innerWidth, window.innerHeight);
    game.camera.resize(game.renderer.width, game.renderer.height);
  };
  window.addEventListener('resize', resize);
  resize();

  let started = false;
  const unlockAudio = () => {
    if (started) return;
    started = true;
    if (!game.audio.ensure()) return;
    game.audio.resume();
    game.audio.applySettings();
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  game.settings.onChange(() => game.audio.applySettings());

  const loop = new Loop({
    update: (dt) => {
      input.update();
      const st = input.state;
      const snap = { moveX: st.moveX, moveY: st.moveY, dash: st.dash, nova: st.nova };
      touch.apply(snap);
      game.setInput(snap.moveX, snap.moveY, snap.dash, snap.nova);
      if (st.pause) {
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'loadout') game.togglePause();
      }
      if (st.sheet) game.toggleSheet();
      game.update(dt);
      if (game.state === 'playing') hud.update(dt);
      hud.setVisible(
        game.state === 'playing' || game.state === 'levelup' || game.state === 'paused' || game.state === 'loadout',
      );
      input.endFrame();
    },
    render: () => game.render(),
  });

  // 竖屏闸门：手机横过来之前不跑主循环——竖屏那点视野本来也没法玩，
  // 而且省下的这些帧正好留给转屏动画。
  let booted = false;
  const orientation = setupOrientation((blocked) => {
    if (blocked) {
      if (game.state === 'playing') game.togglePause();
      loop.stop();
    } else if (booted) {
      loop.start();
    }
  });


  void [weapons, relics, passives, curses, enemies, affixes, bounties, stages, tribes, meta, daily];

  const ready = () => {
    game.renderer.adaptive = game.settings.data.adaptive;
    resize();
    loop.maxFps = game.profile.frameCap;
    booted = true;
    if (!orientation.blocked()) loop.start();
    (window as unknown as { __WICKLIGHT__?: { loop: unknown } }).__WICKLIGHT__!.loop = loop;
    let pct = 0;
    const iv = window.setInterval(() => {
      pct += 24;
      if (bootHint) bootHint.textContent = pct >= 100 ? '点亮完成' : `正在点燃灯芯… ${pct}%`;
      if (pct >= 100) {
        window.clearInterval(iv);
        bootScreen?.classList.add('is-done');
        window.setTimeout(() => bootScreen?.remove(), 600);
        game.bootDone();
      }
    }, 90);
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ready();
  } else {
    window.addEventListener('DOMContentLoaded', ready);
  }
}

boot();
