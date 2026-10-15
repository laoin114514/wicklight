import './styles/main.css';
import { Game } from './core/Game';
import { Loop } from './core/Loop';
import { Input } from './core/Input';
import { HUD } from './ui/HUD';
import { UIManager } from './ui/UIManager';
import { TouchControls } from './ui/TouchControls';
import { setupOrientation } from './ui/Orientation';
import { BackGuard } from './ui/BackGuard';
import { WakeLock } from './core/WakeLock';
import { WEAPONS as weapons } from './data/weapons';
import { RELICS as relics, TRIBES as tribes } from './data/relics';
import { PASSIVES as passives } from './data/upgrades';
import { CURSES as curses } from './data/curses';
import { ENEMIES as enemies, NORMAL_ENEMIES as normalEnemies } from './data/enemies';
import { AFFIXES as affixes } from './data/affixes';
import { BOUNTIES as bounties } from './data/bounties';
import { META_TREE as meta } from './data/meta';
import { GRAZE as graze } from './data/graze';
import { MINE as mines } from './data/mines';
import { VORTEX as vortex } from './data/vortex';
import { POUR as pour } from './data/pour';
import { NOVA as nova } from './data/nova';
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
  const wake = new WakeLock();
  // 手机上按返回（或侧滑返回）时不要直接离开页面：暂停，让玩家自己决定
  const backGuard = new BackGuard(() => {
    if (game.state === 'playing') {
      game.togglePause();
      hud.toast('按了返回键 · 已暂停');
    }
  });

  game.setUI(ui, hud);
  ui.mountMenus();

  (window as unknown as { __WICKLIGHT__?: unknown }).__WICKLIGHT__ = {
    game,
    loop: null,
    input,
    ui,
    hud,
    touch,
    backGuard,
    wake,
    // 供测试/调试读取的静态数据表（无副作用）
    // graze / mines / vortex / pour / nova 也放进来：掠影、伏灯、旋灯、倾灯、爆灯那几串调参值
    // （带子宽度、引信、吸力、油价、爆灯的代价与门槛……）
    // 全是"文档里写过、测试要对着断言"的数，散在代码里迟早会漂
    data: { weapons, relics, passives, curses, bounties, tribes, meta, graze, mines, vortex, pour, nova },
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
      const snap = { moveX: st.moveX, moveY: st.moveY, dash: st.dash, nova: st.nova, lamp: st.lamp };
      // 触摸控件只在真正在打的时候上屏：面板就在同一层，它会盖住面板右下角的按钮
      touch.setActive(game.state === 'playing');
      if (game.state === 'playing') touch.apply(snap);
      backGuard.sync(game.state === 'playing');
      game.setInput(snap.moveX, snap.moveY, snap.dash, snap.nova, snap.lamp);
      if (st.pause) {
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'loadout') game.togglePause();
      }
      if (st.sheet) game.toggleSheet();
      game.update(dt);
      // 战斗里 HUD 整块跟着走；其他界面（暂停 / 结算 / 菜单）也要推卡片与公告的计时，
      // 不然"按了返回键 · 已暂停"这种排队上屏的消息会一直等在那里
      if (game.state === 'playing') hud.update(dt);
      else hud.updateCards(dt);
      // 打的时候别让手机自己息屏：战斗里手会离开屏幕，一暗屏就等于被打断
      wake.set(game.state === 'playing');
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
  // 切到后台（接电话、切应用、锁屏）自动暂停：rAF 本来就停了，但直接回到战场上，
  // 玩家会先挨一顿打才反应过来。回来时停在暂停面板上，由玩家自己决定何时继续。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.togglePause();
  });

  const orientation = setupOrientation((blocked) => {
    if (blocked) {
      if (game.state === 'playing') game.togglePause();
      // 主循环马上要停，最后一帧的状态得在这里收干净（竖屏牌盖着的时候控件不该还留在下面）
      touch.setActive(false);
      wake.set(false);
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
