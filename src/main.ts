import './styles/main.css';
import { Game } from './core/Game';
import { Loop } from './core/Loop';
import { Input } from './core/Input';
import {
  Gamepad,
  PAD_AIM_DEAD as PAD_AIM,
  PAD_NAV_DEAD as PAD_NAV,
  PAD_BUTTON as PAD_BUTTON_MAP,
  PAD_DEADZONE as PAD_DEAD,
  PAD_HINT,
  PAD_TIP,
} from './core/Gamepad';
import { FocusRing, NAV_OVERLAP_TOLERANCE, NAV_REPEAT_DELAY, NAV_REPEAT_EVERY, pickNearest } from './core/Focus';
import { HUD } from './ui/HUD';
import { UIManager } from './ui/UIManager';
import { TouchControls } from './ui/TouchControls';
import { setupOrientation } from './ui/Orientation';
import { BackGuard } from './ui/BackGuard';
import { WakeLock } from './core/WakeLock';
import { WEAPONS as weapons, NEW_WEAPON_POOL as newWeaponPool, STARTER_WEAPONS as starterWeapons } from './data/weapons';
import { AURA as aura } from './data/aura';
import { LAMP_FAMILY_IDS as lampFamily, RELICS as relics, TRIBES as tribes, WICK_FAMILY_IDS as wickFamily } from './data/relics';
import { PASSIVES as passives } from './data/upgrades';
import { CURSES as curses } from './data/curses';
import { ENEMIES as enemies, NORMAL_ENEMIES as normalEnemies } from './data/enemies';
import { AFFIXES as affixes } from './data/affixes';
import { BOUNTIES as bounties } from './data/bounties';
import { FIRE_LINES, FIRE_LEVELS_TOTAL, META_TREE as meta, fireCost } from './data/meta';
import { GRAZE as graze } from './data/graze';
import { WICK as wick } from './data/wick';
import { MINE as mines } from './data/mines';
import { VORTEX as vortex } from './data/vortex';
import { POUR as pour } from './data/pour';
import { NOVA as nova } from './data/nova';
import { EMBERWIND as emberwind } from './data/emberwind';
import { HUNT } from './data/hunt';
import { LAMP as lamp } from './data/lamp';
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
  const pad = new Gamepad();
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
    pad,
    // 手柄那个类本身也交给测试：映射表（哪个键是哪件事）可以脱离浏览器单量——
    // 喂一只假手柄进去就行，不用真的插一只手柄（CI 里也没有）。
    Gamepad,
    // 焦点环那一套（v82）：类 + 导航打分（纯函数）+ 那两个重复节奏常量。
    // 同理——"往下该挑哪一项"是这一套里最容易出错又最看不出来的地方，
    // 做成能脱离浏览器单量的纯函数，才有得测。
    FocusRing,
    pickNearest,
    NAV_OVERLAP_TOLERANCE,
    NAV_REPEAT_DELAY,
    NAV_REPEAT_EVERY,
    // 供测试/调试读取的静态数据表（无副作用）
    // graze / mines / vortex / pour / nova / wick 也放进来：掠影、伏灯、旋灯、倾灯、爆灯、拨芯那几串调参值
    // （带子宽度、引信、吸力、油价、爆灯的代价与门槛……）
    // 全是"文档里写过、测试要对着断言"的数，散在代码里迟早会漂
    data: {
      weapons, newWeaponPool, starterWeapons, relics, passives, curses, bounties, tribes, meta,
      graze, mines, vortex, pour, nova, emberwind, wick, wickFamily, lampFamily, aura,
      hunt: HUNT, arrival: ARRIVAL,
      // 「分灯」那一套（v83）：一张"名字 → 数"的调参表（代价 / 冷却 / 寿命 / 引怪半径 /
      // 被吃掉时炸多大一圈……），和 `mines` / `vortex` 同一类。台架（`tools/bench-lamp.mjs`）
      // 与测试都从这里取那**一份**真话——引怪半径这种数，两处各写一份迟早会漂。
      lamp,
      // 「深宵之约」这一套（v79）：表和那几个纯函数一起放进来——测试要对着它断"七条各改了哪个数"，
      // 而 `pactMods / pactEmberMult / pactsUnlocked` 是这套规则唯一的三条真话，
      // 让测试自己再抄一遍就等于把那三条真话抄成六条。
      // ⚠ 它是一个**包**（表 + 纯函数），不是"条目列表"——`tests/data.test.mjs` 里那张
      // 逐个条目校验 id/name/blurb 的循环要把它跳过去（跳过去之后按它自己的形状单测）。
      pacts: { PACTS, PACT_MAP, PACT_EMBER_EACH, pactMods, pactEmberMult, pactsUnlocked, noPacts },
      // 「薪火」（v80）：那三条可重复的梯子 + 价格函数。同样是一个**包**（表 + 纯函数），
      // `tests/data.test.mjs` 那张列表也要把它跳过去——理由和上面 `pacts` 那一段一样。
      fire: { FIRE_LINES, FIRE_LEVELS_TOTAL, fireCost },
      // 手柄那一套（v81）：映射表 + 那三个常量（走位死区、瞄准死区、菜单导航死区）+ 两段文案。
      // 测试要对着它断"哪个键是哪件事"，而这段文案只该有一份（HUD 那行提示与那张卡共用）。
      pad: { PAD_BUTTON: PAD_BUTTON_MAP, PAD_DEADZONE: PAD_DEAD, PAD_AIM_DEAD: PAD_AIM, PAD_NAV_DEAD: PAD_NAV, PAD_HINT, PAD_TIP },
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
      // 手柄（v81）：和键盘 / 触摸**同一个出口**——它读出一帧的意图，这里合进同一个 snap。
      // 那几块"选第几张"的面板（升级 / 商店 / 祭坛）上，手柄换一套键位
      // （脸键 = 第 1~4 张、LB / RB = 商店的第 5、6 件、Back = 重掷，见 Gamepad 文件头第三条）。
      // 结算屏（阵亡 / 通关）也算"面板"：那一屏上只有一颗按钮（回车 = 那颗主按钮），
      // 所以 Start 在那儿该是确认而不是暂停——不然手柄打到死就卡住了，只能去摸鼠标。
      const panelMode =
        game.state === 'levelup' ||
        game.state === 'shop' ||
        game.state === 'shrine' ||
        game.state === 'curse' ||
        game.state === 'dead' ||
        game.state === 'victory';
      // 剩下那十几屏（主菜单 / 选灯火 / 图鉴 / 档案 / 成就 / 设置 / 解锁树 / 今日灯芯）是第三种情境：
      // 手柄在那儿要的是"挪焦点 + 按下 + 返回"（v82），而不是走位或"第几张"。
      // 战斗 / 暂停 / 构筑总览仍旧走 `run`——那三处 Start 是暂停、Back 是构筑总览，是老规矩。
      const runKeys = game.state === 'playing' || game.state === 'paused' || game.state === 'loadout';
      const ps = pad.poll(panelMode ? 'panel' : runKeys ? 'run' : 'menu');
      game.setPadState(ps ? { connected: true, id: ps.id } : null);
      // 两只手可以同时搭在键盘和手柄上（有人就是这么玩的）：两边的走位加起来再归一，
      // 不然"手柄推一半 + 键盘按一下"会跑出一个人的 1.5 倍速
      let moveX = st.moveX + (ps?.moveX ?? 0);
      let moveY = st.moveY + (ps?.moveY ?? 0);
      const moveLen = Math.hypot(moveX, moveY);
      if (moveLen > 1) {
        moveX /= moveLen;
        moveY /= moveLen;
      }
      const snap = {
        moveX,
        moveY,
        dash: st.dash || !!ps?.dash,
        nova: st.nova || !!ps?.nova,
        lamp: st.lamp || !!ps?.lamp,
        // 拨芯（见 InputState.dim）：一次性输入、翻的是玩家身上那个开关
        dim: st.dim || !!ps?.dim,
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
      // 手动瞄准现在是三条路（见 InputState.aim）：触屏那根手指 → 手柄右摇杆 → 鼠标右键。
      // 优先级按"谁更明确"排：手指按着的时候以触屏为准，其次是推着右摇杆的人，
      // 最后才是鼠标（它没有起点、只能拿屏幕当行程，是三条里最含糊的一条）。
      const aim = snap.aim
        ? { x: snap.aimX, y: snap.aimY }
        : ps?.aim ?? input.aimVector(game.renderer.width, game.renderer.height);
      game.setInput(snap.moveX, snap.moveY, snap.dash, snap.nova, snap.lamp, aim, snap.dim);
      if (st.pause || ps?.pause) {
        // Esc / Start 在那三处是"暂停开关"（老规矩，不动）；在别的屏上它是"返回"——
        // 图鉴 / 设置 / 档案那几屏的返回钮本来就要用鼠标点，而键盘和手柄到这儿就断了
        if (runKeys) game.togglePause();
        else ui.focusBack();
      }
      // 手柄 Ⓑ：战斗之外 = 返回（战斗 / 暂停 / 总览里它是分灯 —— 那条路走 `snap.lamp`）
      if (ps?.back && !runKeys) ui.focusBack();
      if (st.sheet || ps?.sheet) game.toggleSheet();
      // 面板热键（见 InputState 上那一整段）：四块会打断战斗的面板——升级卡 / 祭坛 / 商店 / 夜咒——
      // 都能用键盘走完，手不必从 WASD 上拿开。规则全在 `Game.panelHotkeys` 里，
      // 这里只把这一帧的键盘状态交过去；回车那一下换的是面板，归界面管。
      game.panelHotkeys(st.pick || (ps?.pick ?? 0), st.reroll || !!ps?.reroll);
      // 焦点环（v82）：战斗之外，方向键 / 十字键 / 左摇杆挪环。战斗里方向键照旧是走位
      // （`st.navX` 只是同一份按住状态的另一份读数，见 Input.update）。
      //
      // **每一帧都要调**，哪怕是 (0,0)：环靠"这一帧的方向和上一帧不一样"来区分
      // "新的一下"与"还按着"（见 FocusRing.move）。只在有方向时调，松手那几帧就没人告诉它，
      // 于是"哒、哒"两下同方向的轻点——间隔 60~70ms，远不到 0.35 秒的重复门槛——
      // 第二下会被当成"还按着"而吃掉。（用人手在菜单里连点两下就是这么快。）
      if (game.state !== 'playing') {
        ui.focusMove(performance.now() / 1000, st.navX || (ps?.nav.dx ?? 0), st.navY || (ps?.nav.dy ?? 0));
      }
      // 回车 / Ⓐ / Start：先按焦点上那一项；环还没亮（或者这一屏没有可点的东西）就交给
      // 面板自己的"主按钮"（结算 / 主菜单 / 选灯火那三处，见 UIManager.panelPrimary）。
      if (st.confirm || ps?.activate || ps?.confirm) {
        if (!ui.focusActivate()) ui.panelPrimary();
      }
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
    // 切回来的那一帧不该补响"切走时按着的键"（手柄的边沿检测记着上一帧，见 Gamepad）
    if (document.hidden) pad.reset();
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
