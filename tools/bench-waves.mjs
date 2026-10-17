/**
 * 波次节奏台架（离线，无头）：用脚本玩家把真实构建跑起来，逐波记下**时间都花在哪一段**。
 *
 *   node tools/bench-waves.mjs                 # 第一关 · 8 颗种子 · 两种走位
 *   node tools/bench-waves.mjs --stages=4      # 一路打到底（含商店 / 首领）
 *   node tools/bench-waves.mjs --seeds=3 --json=/tmp/wl/waves.json
 *   node tools/bench-waves.mjs --style=holder  # 只跑"守着交战距离"的那一种走位
 *   node tools/bench-waves.mjs --fixed         # 钉死一套武器、不升级：改规则前后 A/B 用这个
 *   node tools/bench-waves.mjs --god --stages=4 # 打不死的脚本玩家跑完全部四关：跨关卡找崩溃用这个
 *   node tools/bench-waves.mjs --fixed --nowalls    # 把这一局的墙每帧清掉：用来证明"某条只在墙前面生效的规则"没碰别的东西
 *
 * `--fixed` 是给"改前 / 改后"对比用的：自然局里玩家会随击杀节奏抽到不一样的升级卡，
 * 两次跑出来根本不是同一局（连波数都不一样），差值里混着"构筑运气"，量不出规则本身的效果。
 * 钉死一套武器 + 关掉升级与商店之后，两次跑里**玩家的火力一模一样**，
 * 剩下的差就只能是那条规则带来的。想读"真实一局长什么样"就用自然模式。
 *
 * 为什么要有这个脚本：README 的「已知取舍」里排队着一条"波次节奏量过但没动"——
 * 当时的读数是 /tmp 里的临时脚本跑出来的（跑完就散了，没法复现也没法对账）。
 * 这一个进仓库，和别的体检脚本一样：同一份产物、同一颗种子、两次跑出同一份数。
 *
 * 它要回答的是**一个具体的问题**：一局里"玩家没事可做"的时间到底有多长，以及那段时间在等谁。
 * 所以三个指标各指一件事，缺一个都说不清：
 *   1. `spawn`  —— 这一段是**游戏在给东西**（每 0.9 秒一批），玩家一定有活干；
 *   2. `tail`   —— 刷怪已经完了、场上只剩 ≤2 只：这是"等余党"的那一段，最可能是垃圾时间；
 *   3. `deadAir`——屏幕里（350px 内）一只怪都没有的秒数。它才是玩家能感觉到的那种"没事干"，
 *      和 tail 不是一回事：尾段如果有两只怪贴着你在打，那 5 秒一点都不难受。
 *
 * 它还会把 `deadAir` **拆成两半**，因为这两半的病根完全不同：
 *   · `deadAirSpawn`——刷怪阶段就没东西：第一批还走在路上，这一段本来就有，压不下去；
 *   · `deadAirClear`——**怪已经全刷出来了**、场上就是有东西，玩家却是空的。
 *     v66 的「赴灯」（`data/arrival.ts`）动的就是这一半：慢怪从更近的地方出发。
 *   还有一个 `firstContact`（开波到第一次看见怪）：它是"开头那一段有多长"的直读。
 *
 * 两种走位是**同一份规则**下的两个极端，读数要成对看：
 *   · `holder`——守着交战距离、绝不主动去追远处的东西（一个"按自己节奏玩"的人）。
 *     它的 deadAir 高，说明**游戏在要求玩家去把余党找出来**，而这正是问题所在；
 *   · `chaser`——永远压向最近的那一只（一个"赶紧推进"的人）。它的 deadAir 天然低，
 *     但如果连它都要等，那才是真的卡住了（例如怪被墙卡死）。
 * 两个数的差距就是"这段垃圾时间到底怪游戏还是怪玩家"。
 */
import { installDomStubs } from '../tests/dom-stubs.mjs';

const ROOT = new URL('..', import.meta.url);
const ENTRY = new URL('../dist/app.js', import.meta.url).href;

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const SEEDS = Number(args.get('seeds') ?? 8);
const STAGES = Number(args.get('stages') ?? 1);
const JSON_OUT = args.get('json') ?? null;
const STYLES = args.has('style') ? [args.get('style')] : ['holder', 'chaser'];
const FIXED = args.has('fixed');
/**
 * `--nowalls`：把这一局的墙**每帧**清掉（跨关会重新生成地图，只在开局清一次是不够的——
 * 第一版就是那样写的，第二关的墙上照样会响，量出来的那一栏是假的）。它和 `bench-wall` 的 `--nocollide` 是一对反着的开关——
 * 那个是"把怪撞墙这条规则接回去"，这个是"把墙从这一局里拿掉"。
 * 它的用途只有一个：某条规则**只在墙前面才有话说**的时候（v84 的怪、v86 的玩家冲刺），
 * 想证明"改前 / 改后差出来的那几个数只可能来自墙"，就跑两边各一遍 `--nowalls`——
 * 读数必须**逐位相同**，差一位就说明这一版顺手碰了别的东西。
 *
 * 还有一栏是 v86 加的：**脚本玩家自己的冲刺撞在墙上几次**（数的是"这一次冲刺活了多久"，
 * 见 `run()` 里那一段）。它回答"这条规则一局里会不会真的被摸到"——机器人是 0.2 次/局
 * （12 局里 2 次，它的冲刺几乎都发生在空地上），但那一次就够把整局轨迹岔开：
 * 同一批种子上只有那 2 局读数不同，其余 10 局逐位相同。
 *
 * v88 又加了一栏，问的是同一个问题：**自己身上那两圈火被墙挡掉几次**（燎灯 / 环形火环）。
 * 数法是把 Game 交给玩家的那个 ctx 包一层（`playerCtx`），`sight` 每答一次"看不见"就加一。
 * 它在 `--fixed` 那套（守夜人自带的环形火环照样在场）与自然模式里都数得到；
 * 拿掉墙（`--nowalls`）它必须是 0——那正是"这一条只在墙前面才有话说"的证据。
 *
 * v89 在同一层包装里再加一栏，问的是**索敌挑中的目标是不是被墙挡着**：
 * 包住 `findTarget`，返回的那一只自己再问 `sight` 一次。它答"这一版的账是怎么算的"——
 * 改前（v88）`--fixed` 那一套是 991.3 次/局（59833 次里 5948 次 = 9.9%），自然局 7.7% / 9.5%；
 * 其中还有一档是"**明明射程里还有看得见的**"（改前 195.0 次/局 holder）——
 * 那就是白打，v89 要杀的就是它，改后这一小栏必须是 **0**。
 * 为什么"挑中墙后面"本身不用清零：全都看不见时索敌照旧要挑一只（它答的是"挑哪一只"，
 * 不是"打不打"，见 `Game.nearestEnemy` 那一段）——所以留在这儿当读数，不当判据。
 *
 * v90 在同一层包装里再加一栏，问的是**喷糜者有没有隔着墙开枪**：到 v89 为止它只认距离，
 * 你躲在墙后面它就站着打墙（一局都不挪窝）。这一栏数它"看不见你的时候开的枪"——
 * 改前在真实局里量得到（`--fixed --seeds=6` holder 8.3 次/局 / chaser 3.8，自然局 4.2 / 5.8），
 * 改后必须是 **0**；它一共开了几枪也印出来当分母。
 *
 * v91 起再印一行**掠影 / 点着灯焰高涨**（`game.grazeCount` / `player.blazeCount`）。
 * 它不是一条新规矩，是给"这一版把喷糜者改成预瞄之后，台架上的局为什么变长"查账用的：
 * 预瞄的弹幕贴着人飞，而"贴着飞"正是掠影收账的地方（改前 17.8 次/局 → 改后 63.3）。
 * 量下来灯焰高涨是 **0** 次——所以台架上寿命的变化不是"焰喂出来的"。
 * 记着这两笔，下一版改喷糜者的吐速 / 弹数时，才分得清"难度变了"和"掠影顺带喂了火"。
 */
const NOWALLS = args.has('nowalls');
/**
 * `--god`：血厚到打不死。它不是"难度调参"，是**回归跑**——脚本玩家的水平远不如人，
 * 自然模式下它在第一关就会倒下（4 颗种子全倒在第一关），于是熔窟的余烬风、长夜之城的寒潮
 * 这些代码在台架里从来没被跑过。给一条打不死的命，一局就能把四关的怪 / 险境 / 首领全过一遍，
 * 找的是崩溃和 NaN，不是难度。（真要看难度就用自然模式。）
 */
const GOD = args.has('god');
/** 钉死的那一套（守夜人自带环形火环 + 这三件）：近中远都有，节奏不受升级运气影响 */
const FIXED_LOADOUT = ['fireball', 'whip', 'shard'];
/** 无目标阈值：350px 大约是"屏幕里还看得见"的那条线（视野最亮时 320px）。 */
const DEAD_AIR = 350;
/** 尾巴：清场阶段场上只剩这么多只——再少就只有"追着它跑"一件事可做了。 */
const TAIL_ALIVE = 2;

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 跑一局，返回逐波读数。同一颗种子 + 同一种走位 = 同一份数。 */
async function run({ seed, style, stages }) {
  const env = installDomStubs();
  await import(`${ENTRY}?bench=${seed}-${style}-${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  loop.stop();
  env.intervals.length = 0;
  // 整局可复现：Math.random 与 game.rng 都换成同一颗种子的 LCG。
  // 不钉死的话"改前 / 改后"跑的根本不是同一局，差值就没有意义。
  let ms = (seed * 2654435761) >>> 0;
  Math.random = () => ((ms = (ms * 1664525 + 1013904223) >>> 0) / 4294967296);
  game.bootDone();
  game.newRun('lamplighter', 'normal', false);
  game.rng.reseed((seed * 40503 + 7) >>> 0);
  if (GOD) {
    game.player.stats.maxHp = 1e9;
    game.player.hp = 1e9;
  }
  // 自己冲刺撞在墙上的次数（v86 起这条规则会响）。
  // 数法：记每一次冲刺**活了多久**（`dashCount` 进位那一刻起到 `dashTimer` 掉到 0）。
  // 一次冲刺的自然寿命是 0.18 秒（11 帧 ≈ 0.183）；被墙提前收掉的那一次连 0.15 都到不了。
  // 不去挂 `audio.play`：同一帧里"起步就撞上"的那一次是数不到的（起手时 `dashTimer` 还是 0）。
  let dashSeen = -1;
  let dashBirth = -1;
  let wallBash = 0;
  // 自己被墙挡掉的火（v88）与索敌挑中的目标（v89）：见文件头。
  // 两条都包在这一层 ctx 里（同一层包装叠第二次没有意义，也是白多一层调用）。
  let lightBlocked = 0;
  let lightAsked = 0;
  let aimAsked = 0;
  let aimBlocked = 0;
  let aimWasted = 0;
  const realPlayerCtx = game.playerCtx.bind(game);
  game.playerCtx = () => {
    const ctx = realPlayerCtx();
    const realSight = ctx.sight;
    ctx.sight = (x0, y0, x1, y1) => {
      const ok = realSight(x0, y0, x1, y1);
      lightAsked += 1;
      if (!ok) lightBlocked += 1;
      return ok;
    };
    // 索敌（v89）：挑中的那只**自己**被墙挡着吗？挡着的话，射程里还有看得见的吗？
    // 后面那一问才是这一版的判据——"手上还有能打的东西，却在往墙上打"（`aimWasted`）。
    // 探针里问的是**真的** `realSight`（没插桩的那一个），免得把这一层的计数混进去。
    const realFind = ctx.findTarget;
    ctx.findTarget = (x, y, maxDist, requireLight) => {
      const e = realFind(x, y, maxDist, requireLight);
      aimAsked += 1;
      if (e && !realSight(x, y, e.x, e.y)) {
        aimBlocked += 1;
        const md = Math.min(maxDist, requireLight ? game.player.lightRadius + 40 : maxDist);
        let alt = false;
        game.enemies.forEach((o) => {
          if (o === e || alt) return;
          if ((o.x - x) ** 2 + (o.y - y) ** 2 < md * md && realSight(x, y, o.x, o.y)) alt = true;
        });
        if (alt) aimWasted += 1;
      }
      return e;
    };
    return ctx;
  };

  // 喷糜者隔着墙开枪（v90）：见文件头。数的只是它（`owner === 'spitter'`）——
  // 首领的环形齐射不在此列（那是"炸出去的一圈"，不是"瞄着你打的那一口"，见 `blindfire.test.mjs`）。
  // 判"看不看得见"直接借玩家那一路 `sight`（游戏自己那份墙判据），不在台架里重写一遍几何。
  let spitShots = 0;
  let spitBlind = 0;
  const realEnemyCtx = game.enemyCtx.bind(game);
  game.enemyCtx = () => {
    const ec = realEnemyCtx();
    const realShoot = ec.shoot;
    ec.shoot = (x, y, angle, speed, damage, color, enemy, owner) => {
      if (enemy && owner === 'spitter') {
        spitShots += 1;
        if (!game.playerCtx().sight(x, y, game.player.x, game.player.y)) spitBlind += 1;
      }
      return realShoot(x, y, angle, speed, damage, color, enemy, owner);
    };
    return ec;
  };

  if (FIXED) {
    // 一套固定火力 + 不再升级：这样"改前 / 改后"比的是同一件事（见文件头那一段）
    for (const id of FIXED_LOADOUT) game.player.weapons.set(id, 5);
    game.player.recomputeStats();
    game.xpToNext = 1e9;
  }

  const dt = 1 / 60;
  const p = game.player;
  const rnd = lcg(seed * 7919 + 13);
  let t = 0;
  let frames = 0;
  let waveRec = null;
  const waves = [];
  const levelTimes = [];
  let lastLevel = 1;
  let dashTaps = 0;
  let dashEaten = 0;

  const closeWave = () => {
    if (!waveRec) return;
    waveRec.total = t - waveRec.start;
    waves.push(waveRec);
    waveRec = null;
  };

  const frame = () => {
    const g = game;
    // 面板：升级三选一 / 商店 / 夜咒 / 神龛一律选第一项（台架不比构筑，只比节奏）
    if (g.state === 'levelup') {
      const offer = g.currentOffers[0];
      if (!offer) return false;
      g.chooseUpgrade(offer);
      return true;
    }
    if (g.state === 'shop') { g.leaveShop(); return true; }
    if (g.state === 'curse') { g.chooseCurse(g.curseOffers[0].id); return true; }
    if (g.state === 'shrine') { g.leaveShrine(); return true; }
    if (g.state === 'dead' || g.state === 'victory') return false;
    if (g.state !== 'playing') return true;

    const d = g.director;
    const phase = d.phase;
    if (g.wave !== (waveRec?.wave ?? -1) || g.stageIndex !== (waveRec?.stageIndex ?? -1)) {
      closeWave();
      waveRec = {
        stageIndex: g.stageIndex, stage: g.stageIndex + 1, wave: g.wave, start: t, spawn: 0, clear: 0,
        tail: 0, deadAir: 0, deadAirSpawn: 0, deadAirClear: 0, firstContact: -1,
        aliveAtClearStart: 0, stragglers: [],
        seen: new Set(),
      };
    }
    // 最近的怪：用来判"屏幕里有没有东西可打"
    let nearest = Infinity;
    const count = g.enemies.count;
    g.enemies.forEach((e) => {
      const dd = Math.hypot(e.x - p.x, e.y - p.y);
      if (dd < nearest) nearest = dd;
    });
    // 尾巴里在场的每一只都点名记账（谁最难收，得是具体的名字）
    if (phase === 'clearing' && count <= TAIL_ALIVE) {
      g.enemies.forEach((e) => {
        if (waveRec.seen.has(e.id)) return;
        waveRec.seen.add(e.id);
        waveRec.stragglers.push({ id: e.def.id, d: Math.round(Math.hypot(e.x - p.x, e.y - p.y)), secs: 0 });
      });
    }
    if (phase === 'clearing' && count <= TAIL_ALIVE) {
      for (const s of waveRec.stragglers) s.secs += dt;
    }
    if (phase === 'spawning') waveRec.spawn += dt;
    if (phase === 'clearing') {
      waveRec.clear += dt;
      if (count <= TAIL_ALIVE && count > 0) waveRec.tail += dt;
    }
    if (nearest > DEAD_AIR && phase !== 'intro') waveRec.deadAir += dt;
    if (nearest > DEAD_AIR && phase === 'spawning') waveRec.deadAirSpawn += dt;
    if (nearest > DEAD_AIR && phase === 'clearing') waveRec.deadAirClear += dt;
    if (waveRec.firstContact < 0 && nearest <= DEAD_AIR) waveRec.firstContact = t - waveRec.start;

    // ── 走位：两种风格共用同一套"躲避 + 捡东西"，只在"要不要追"上分家 ──
    let ax = 0;
    let ay = 0;
    let nx = 1;
    let ny = 0;
    let close = 0;
    g.enemies.forEach((e) => {
      const ddx = p.x - e.x;
      const ddy = p.y - e.y;
      const dd = Math.hypot(ddx, ddy) || 1;
      if (dd < nearest) { nearest = dd; nx = ddx / dd; ny = ddy / dd; }
      if (dd < 140) close += 1;
      if (dd < 110) { const w = (1 - dd / 110) * 3.4; ax += (ddx / dd) * w; ay += (ddy / dd) * w; }
    });
    // 交战环：远了压上去（不然武器够不着），近了退一点，中距离绕着转
    const far = style === 'chaser' ? 120 : 240;
    const near0 = style === 'chaser' ? 30 : 95;
    if (nearest > far) { ax += -nx * 2.4; ay += -ny * 2.4; }
    else if (nearest < near0) { ax += nx * 1.6; ay += ny * 1.6; }
    ax += -ny * 1.0;
    ay += nx * 1.0;
    for (const h of g.hazards) {
      const hx = p.x - h.x;
      const hy = p.y - h.y;
      const hd = Math.hypot(hx, hy) || 1;
      if (hd < h.r + 80) { const w = 3.2 * (1 - hd / (h.r + 80)); ax += (hx / hd) * w; ay += (hy / hd) * w; }
    }
    // 捡东西（油少优先油）：活人不会把地上的经验晾着
    let bestD = Infinity;
    let bx = 0;
    let by = 0;
    for (const pk of g.pickups.all) {
      if (!pk.active) continue;
      const pd = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (pd < bestD && pd < 520) { bestD = pd; bx = pk.x - p.x; by = pk.y - p.y; }
    }
    const pull = p.oilFrac < 0.6 ? 2.6 : 1.0;
    if (bestD < Infinity) { const l = bestD || 1; ax += (bx / l) * pull; ay += (by / l) * pull; }
    // 别贴着场边（撞墙卡住是最像 bug 的那种死法）
    const edge = Math.min(g.level.halfW - Math.abs(p.x), g.level.halfH - Math.abs(p.y));
    if (edge < 300) { ax += -Math.sign(p.x) * 2.2; ay += -Math.sign(p.y) * 2.2; }

    let mx = ax;
    let my = ay;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (Math.hypot(mx, my) < 0.05 && Number.isFinite(nearest)) { mx = nx * 0.6; my = ny * 0.6; }

    // 冲刺：贴脸时点一下（"想逃命"的那一下）。按下就算一次意图，冷却吃掉也要记下来。
    let dash = false;
    let nova = false;
    if (nearest < 100) {
      dashTaps += 1;
      if (p.dashCd <= 0 && rnd() < 0.5) dash = true;
      else dashEaten += 1;
    }
    if (close >= 4 && p.novaCd <= 0) nova = true;

    // ⚠ 每帧都要补回来：升级 / 拿遗物都会重算属性表，`maxHp` 会被重算回真实值、
    //   `hp` 也跟着被夹回去（第一版只在开局设了一次，于是"打不死"的玩家还是死在了第一关）
    if (GOD) { p.stats.maxHp = 1e9; p.hp = 1e9; }
    // `--nowalls` 每帧都要清一次：开局那张地图只是这一关的墙，跨关时地图会重生成
    // （第一版只在开局清了一次，于是第二关的墙上照样会响——量出来的一栏是假的）
    if (NOWALLS) g.level.walls.length = 0;
    g.setInput(mx, my, dash, nova);
    g.update(dt);
    if (dashSeen < 0) dashSeen = p.dashCount;
    if (p.dashCount !== dashSeen) {
      dashSeen = p.dashCount;
      dashBirth = t;
    }
    if (dashBirth >= 0 && p.dashTimer <= 0) {
      if (t - dashBirth < 0.15) wallBash += 1;
      dashBirth = -1;
    }
    if (GOD) { p.stats.maxHp = 1e9; p.hp = 1e9; }
    if (g.playerLevel > lastLevel) { levelTimes.push(+t.toFixed(1)); lastLevel = g.playerLevel; }
    t += dt;
    frames += 1;
    return true;
  };

  while (frames < 40 * 3600 && t < 2400) {
    if (!frame()) break;
    if (game.stageIndex + 1 >= stages && game.state === 'victory') break;
  }
  closeWave();

  return {
    seed, style, stage: game.stageIndex + 1, state: game.state,
    seconds: +t.toFixed(1), kills: game.kills, level: game.playerLevel,
    // 难度是不是被顺带改了，得有个数看得见："循灯"只许改节奏，不许偷偷加伤害
    dmgTaken: Math.round(game.damageTaken),
    // v91 记这两笔：预瞄让弹幕更贴着人飞，而"贴着飞"正是掠影（`resolveGraze`）收账的地方——
    // 一版规则的账要连它一起看，不然"波数翻倍"会被当成台架噪声
    grazes: game.grazeCount,
    blazes: p.blazeCount,
    hpFrac: +(game.player.hp / game.player.stats.maxHp).toFixed(2),
    dashTaps, dashEaten, wallBash, lightBlocked, lightAsked, aimAsked, aimBlocked, aimWasted, spitShots, spitBlind, levelTimes, waves,
  };
}

/** 把一局的逐波读数压成几个能对账的数。 */
function summarize(runs) {
  const all = [];
  for (const r of runs) for (const w of r.waves) all.push({ ...w, run: r });
  const pick = (f) => all.map(f).sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const totals = pick((w) => w.total);
  const spawns = pick((w) => w.spawn);
  const clears = pick((w) => w.clear);
  const tails = pick((w) => w.tail);
  const deads = pick((w) => w.deadAir);
  const seconds = runs.reduce((a, r) => a + r.seconds, 0);
  const deadRun = runs.reduce((a, r) => a + r.waves.reduce((b, w) => b + w.deadAir, 0), 0);
  return {
    waves: all.length,
    total: { mean: mean(totals), p50: q(totals, 0.5), p90: q(totals, 0.9), max: totals[totals.length - 1] ?? 0 },
    spawn: { mean: mean(spawns), p90: q(spawns, 0.9) },
    clear: { mean: mean(clears), p90: q(clears, 0.9) },
    tail: { mean: mean(tails), p90: q(tails, 0.9), max: tails[tails.length - 1] ?? 0 },
    deadAir: { mean: mean(deads), p90: q(deads, 0.9), max: deads[deads.length - 1] ?? 0 },
    deadAirSpawn: mean(pick((w) => w.deadAirSpawn)),
    deadAirClear: mean(pick((w) => w.deadAirClear)),
    firstContact: mean(pick((w) => w.firstContact).filter((x) => x >= 0)),
    deadAirShare: seconds > 0 ? deadRun / seconds : 0,
    firstUpgrade: runs.map((r) => r.levelTimes[0] ?? null),
  };
}

function fmt(n) {
  return n.toFixed(1).padStart(6);
}

const out = [];
for (const style of STYLES) {
  const runs = [];
  for (let i = 0; i < SEEDS; i += 1) {
    const seed = 7 + i * 13;
    runs.push(await run({ seed, style, stages: STAGES }));
  }
  const s = summarize(runs);
  const meanFirst = s.firstUpgrade.filter((x) => x !== null);
  out.push({
    style,
    s,
    runs: runs.map((r) => ({ seed: r.seed, seconds: r.seconds, kills: r.kills, level: r.level, wallBash: r.wallBash, lightBlocked: r.lightBlocked, aimBlocked: r.aimBlocked, aimWasted: r.aimWasted, spitBlind: r.spitBlind })),
  });
  console.log(`\n── 走位 ${style} · ${runs.length} 局 · ${FIXED ? '钉死火力' : GOD ? '打不死' : '自然'}`
    + ` · ${runs[0].stage} 关跑完（最远到第 ${Math.max(...runs.map((r) => r.stage))} 关）──────────`);
  console.log(`  波数 ${s.waves}   一波总时长 均 ${fmt(s.total.mean)} / p50 ${fmt(s.total.p50)} / p90 ${fmt(s.total.p90)} / 最长 ${fmt(s.total.max)} 秒`);
  console.log(`  其中刷怪 ${fmt(s.spawn.mean)} 秒（均）   清场 ${fmt(s.clear.mean)} 秒（均，p90 ${fmt(s.clear.p90)}）`);
  console.log(`  尾巴（只剩 ≤${TAIL_ALIVE} 只）均 ${fmt(s.tail.mean)} / p90 ${fmt(s.tail.p90)} / 最长 ${fmt(s.tail.max)} 秒`);
  console.log(`  无目标（${DEAD_AIR}px 内没怪）整局占 ${(s.deadAirShare * 100).toFixed(1)}%   单波均 ${fmt(s.deadAir.mean)} / 最长 ${fmt(s.deadAir.max)} 秒`);
  console.log(`  其中空场（${DEAD_AIR}px 内没怪）拆开：刷怪阶段 ${fmt(s.deadAirSpawn)} 秒 · 清场阶段 ${fmt(s.deadAirClear)} 秒`
    + ` · 开波到第一次看见怪 ${fmt(s.firstContact)} 秒`);
  console.log(`  第一张升级卡：${meanFirst.length ? (meanFirst.reduce((a, b) => a + b, 0) / meanFirst.length).toFixed(1) : 'n/a'} 秒（${meanFirst.length}/${runs.length} 局量到）`);
  const wallBash = runs.reduce((a, r) => a + (r.wallBash ?? 0), 0);
  console.log(`  自己的冲刺撞在墙上：${(wallBash / runs.length).toFixed(1)} 次/局（共 ${wallBash} 次`
    + `${NOWALLS ? ' · 墙已被 --nowalls 拿掉，它必须是 0' : ''}）`);
  const aimB = runs.reduce((a, r) => a + (r.aimBlocked ?? 0), 0);
  const aimA = runs.reduce((a, r) => a + (r.aimAsked ?? 0), 0);
  const aimW = runs.reduce((a, r) => a + (r.aimWasted ?? 0), 0);
  console.log(`  索敌挑中墙后面的目标：${(aimB / runs.length).toFixed(1)} 次/局（共 ${aimB} 次 / 问了 ${aimA} 次`
    + ` = ${aimA ? ((aimB / aimA) * 100).toFixed(1) : '0.0'}% · 这一栏是读数，全看不见时照旧挑一只）`);
  const grazes = runs.reduce((a, r) => a + (r.grazes ?? 0), 0);
  const blazes = runs.reduce((a, r) => a + (r.blazes ?? 0), 0);
  console.log(`  掠影 / 点着灯焰高涨：${(grazes / runs.length).toFixed(1)} 次/局 · ${(blazes / runs.length).toFixed(1)} 次/局`
    + `（v91 起记这两笔：预瞄的弹幕贴着人飞，喂的就是掠影的账）`);
  console.log(`  其中"明明还有看得见的"：${(aimW / runs.length).toFixed(1)} 次/局（共 ${aimW} 次 · v89 那条规矩`
    + ` · 必须是 0）${NOWALLS ? ' · 墙已被 --nowalls 拿掉，这两栏必须是 0' : ''}`);
  const spitS = runs.reduce((a, r) => a + (r.spitShots ?? 0), 0);
  const spitB = runs.reduce((a, r) => a + (r.spitBlind ?? 0), 0);
  console.log(`  喷糜者隔着墙开的枪：${(spitB / runs.length).toFixed(1)} 次/局（共 ${spitB} 次 / 它一共开了 ${spitS} 枪`
    + ` · v90 那条规矩 · 必须是 0）${NOWALLS ? ' · 墙已被 --nowalls 拿掉，它必须是 0' : ''}`);
  const blocked = runs.reduce((a, r) => a + (r.lightBlocked ?? 0), 0);
  const asked = runs.reduce((a, r) => a + (r.lightAsked ?? 0), 0);
  console.log(`  自己身上的火被墙挡掉：${(blocked / runs.length).toFixed(1)} 次/局（共 ${blocked} 次 · v88 那条规矩`
    + ` · 这一条总共问了 ${asked} 次）${NOWALLS ? ' · 墙已被 --nowalls 拿掉，它必须是 0' : ''}`);
  const dmg = runs.map((r) => r.dmgTaken);
  const hp = runs.map((r) => r.hpFrac);
  console.log(`  挨了多少：整关受伤 均 ${(dmg.reduce((a, b) => a + b, 0) / dmg.length).toFixed(0)}（单局 ${dmg.join(' / ')}）`
    + `   收场血量 均 ${(hp.reduce((a, b) => a + b, 0) / hp.length).toFixed(2)}`);
  // 尾巴里点名最多的那几只：改之前先知道"到底在等谁"
  const who = new Map();
  for (const r of runs) {
    for (const w of r.waves) {
      for (const st of w.stragglers) {
        const k = st.id;
        const rec = who.get(k) ?? { id: k, secs: 0, n: 0, d: [] };
        rec.secs += st.secs;
        rec.n += 1;
        rec.d.push(st.d);
        who.set(k, rec);
      }
    }
  }
  const top = [...who.values()].sort((a, b) => b.secs - a.secs).slice(0, 6);
  if (top.length) {
    // ⚠ 看的是"每一次平均待了多久"，不是累计秒数：两次跑的局长度可以差一倍（规则会改变结局），
    //   累计值放在一起比就成了"跑得久的那一次数字更大"，那是跑量不是节奏。
    console.log('  尾巴里出现过谁（每次平均秒数 · 累计 / 次数 / 当时的距离中位）：');
    for (const r of top) {
      const ds = r.d.sort((a, b) => a - b);
      console.log(`    ${r.id.padEnd(12)} ${(r.secs / Math.max(1, r.n)).toFixed(1).padStart(5)} 秒/次 · ${fmt(r.secs)} / ${String(r.n).padStart(3)} 次 / ${Math.round(ds[Math.floor(ds.length / 2)])}px`);
    }
  }
}

if (JSON_OUT) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(JSON_OUT), { recursive: true }).catch(() => {});
  await writeFile(JSON_OUT, JSON.stringify(out, null, 1));
  console.log(`\n逐局读数写入 ${JSON_OUT}`);
}
