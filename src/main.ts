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
import { WEAPONS as weapons, NEW_WEAPON_POOL as newWeaponPool, STARTER_WEAPONS as starterWeapons } from './data/weapons';
import { AURA as aura } from './data/aura';
import { RELICS as relics, TRIBES as tribes, WICK_FAMILY_IDS as wickFamily } from './data/relics';
import { PASSIVES as passives } from './data/upgrades';
import { CURSES as curses } from './data/curses';
import { ENEMIES as enemies, NORMAL_ENEMIES as normalEnemies } from './data/enemies';
import { AFFIXES as affixes } from './data/affixes';
import { BOUNTIES as bounties } from './data/bounties';
import { META_TREE as meta } from './data/meta';
import { GRAZE as graze } from './data/graze';
import { WICK as wick } from './data/wick';
import { MINE as mines } from './data/mines';
import { VORTEX as vortex } from './data/vortex';
import { POUR as pour } from './data/pour';
import { NOVA as nova } from './data/nova';
import { EMBERWIND as emberwind } from './data/emberwind';
import { HUNT } from './data/hunt';
import { ARRIVAL } from './data/arrival';
import { PACTS, PACT_MAP, PACT_EMBER_EACH, noPacts, pactEmberMult, pactMods, pactsUnlocked } from './data/pacts';
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
    // graze / mines / vortex / pour / nova / wick 也放进来：掠影、伏灯、旋灯、倾灯、爆灯、拨芯那几串调参值
    // （带子宽度、引信、吸力、油价、爆灯的代价与门槛……）
    // 全是"文档里写过、测试要对着断言"的数，散在代码里迟早会漂
    data: {
      weapons, newWeaponPool, starterWeapons, relics, passives, curses, bounties, tribes, meta,
      graze, mines, vortex, pour, nova, emberwind, wick, wickFamily, aura,
      hunt: HUNT, arrival: ARRIVAL,
      // 「深宵之约」这一套（v79）：表和那几个纯函数一起放进来——测试要对着它断"七条各改了哪个数"，
      // 而 `pactMods / pactEmberMult / pactsUnlocked` 是这套规则唯一的三条真话，
      // 让测试自己再抄一遍就等于把那三条真话抄成六条。
      // ⚠ 它是一个**包**（表 + 纯函数），不是"条目列表"——`tests/data.test.mjs` 里那张
      // 逐个条目校验 id/name/blurb 的循环要把它跳过去（跳过去之后按它自己的形状单测）。
      pacts: { PACTS, PACT_MAP, PACT_EMBER_EACH, pactMods, pactEmberMult, pactsUnlocked, noPacts },
    },
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
      const snap = {
        moveX: st.moveX,
        moveY: st.moveY,
        dash: st.dash,
        nova: st.nova,
        lamp: st.lamp,
        // 拨芯（见 InputState.dim）：一次性输入、翻的是玩家身上那个开关
        dim: st.dim,
        // 手动瞄准（触屏）：方向 + 力度合成一个向量，见 InputState 上那一段
        aim: false,
        aimX: 0,
        aimY: 0,
      };
      // 触摸控件只在真正在打的时候上屏：面板就在同一层，它会盖住面板右下角的按钮
      touch.setActive(game.state === 'playing');
      if (game.state === 'playing') touch.apply(snap);
      backGuard.sync(game.state === 'playing');
      // 手动瞄准有两条路，编码是同一种（方向 + 0~1 的力度），所以游戏那边只认一个向量：
      // · 触屏：手指按住屏幕右侧拖（见 TouchControls），`snap` 里已经写好了；
      // · 桌面：**按住鼠标右键**，指针指哪儿这一瓢就倒哪儿（见 Input.aimVector）。
      // 两条路各自量自己的行程（手指按下的那一点 / 指针到屏幕中心），主循环只负责二选一：
      // 手指按着的时候以触屏为准——同一个玩家身上两种设备都在时，刚按下去的那根手指说了算。
      const aim = snap.aim
        ? { x: snap.aimX, y: snap.aimY }
        : input.aimVector(game.renderer.width, game.renderer.height);
      game.setInput(snap.moveX, snap.moveY, snap.dash, snap.nova, snap.lamp, aim, snap.dim);
      if (st.pause) {
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'loadout') game.togglePause();
      }
      if (st.sheet) game.toggleSheet();
      // 面板热键（见 InputState 上那一整段）：三块会打断战斗的面板——升级卡 / 祭坛 / 商店——
      // 都能用键盘走完，手不必从 WASD 上拿开。规则全在 `Game.panelHotkeys` 里，
      // 这里只把这一帧的键盘状态交过去；回车那一下换的是面板，归界面管。
      game.panelHotkeys(st.pick, st.reroll);
      if (st.confirm) ui.panelPrimary();
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
