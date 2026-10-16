/**
 * 单件武器台架（离线，无头）：一间打靶房，量的是**一件武器自己**打得出多少。
 *
 *   node tools/bench-weapons.mjs                    # 全部武器 · 两圈靶 · 两种排法
 *   node tools/bench-weapons.mjs --weapon=wisp      # 只看一件
 *   node tools/bench-weapons.mjs --dist=110,240,400 --count=12 --secs=30
 *   node tools/bench-weapons.mjs --oil=0.5          # 半缸油（灯火 = 火力那条曲线）
 *   node tools/bench-weapons.mjs --weapon=mine --walk=sweep --secs=60   # 走位：自己跑起来（见下）
 *   node tools/bench-weapons.mjs --json=/tmp/wl/weapons.json
 *
 * 为什么要有这个脚本：README 里两张"单件 DPS"的表（伏灯的四种走位、旋灯的吸力梯度）
 * 是 **tools/ 外面的临时台架**跑出来的——数是真的，但跑完就散了，没法复现，也没法在
 * 改了武器之后对同一份账。这一个进仓库，和别的体检脚本一样：同一份产物、同一颗种子，
 * 两次跑出同一份数（`--walk=` 那一档就是为伏灯那张"看你怎么走"的表补的，见下）。
 *
 * 它要回答的是**一个具体的问题**：把同样一圈靶子摆在同样远的地方，这件武器值多少分。
 * 所以靶房必须是死的，不然量到的是别的东西：
 *   · 靶子**不动**（默认）——动起来量的是"它追不追得上"，不是这把武器；
 *   · 靶子**打不死**（hp 给到 1e9）——不然量的是"它多久死"；
 *   · 靶子**不咬人**（接触伤害清零）——挨打会触发受击停顿，而停顿是"卡住整个模拟"，
 *     时间照走、伤害不出，读数会凭空偏小；
 *   · 玩家**打不死**、**默认站着不动**：量的是武器，不是走位（`--walk` 才让他跑起来，那一档量的刚好反过来）；
 *   · 灯火**钉住**（每帧把油补回 `--oil`）：不然 30 秒里油一直烧、亮度一路往下掉，
 *     而 `damageScale = 0.65 + 油 × 0.7` 这条曲线会让前后两秒不可比。
 *
 * 两种排法是给两种问题用的，缺一个都会把武器看错：
 *   · `ring`——均匀一圈：量的是"够不够得着"（射程、索敌）；
 *   · `pack`——挤成一小片：量的是"清场"（范围武器在这一种里才显出贵在哪里）。
 * 读数也只有两个：**DPS**（这段游戏时间里打出去多少伤害 / 秒）与**覆盖率**
 * （这一圈靶里有几只挨过打）。只看 DPS 会把点杀武器误判成弱，只看覆盖会反过来。
 */
import { installDomStubs } from '../tests/dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url).href;

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const LEVEL = Number(args.get('level') ?? 5);
const DISTS = (args.get('dist') ?? '110,240,400').split(',').map(Number);
const COUNT = Number(args.get('count') ?? 12);
const SECS = Number(args.get('secs') ?? 30);
const OIL = Number(args.get('oil') ?? 1);
const LAYOUTS = (args.get('layout') ?? 'ring,pack').split(',');
/**
 * 走位（`--walk=circle|sweep|zigzag|straight`）：玩家自己跑起来。
 * 站着不动量到的 0 不是"这件武器弱"，而是"它压根没上场"——伏灯就是这一种：
 * 它的账**完全**取决于你怎么走（README「已知取舍」那张表量的就是这件事）。
 * 四种走法各自复现一种玩家，跑出来的是一组**能复跑**的数：
 *   · circle  ——绕圈：雷撒成一个圈，怪从中间穿过去，最不容易踩上（等于不会用它的那种走法）；
 *   · sweep   ——来回拉：跑一段掉头回来，自己的雷正好铺成一条"路"；
 *   · zigzag  ——蛇形：转得急，来回穿自己刚埋下的那几颗；
 *   · straight——一条道跑到黑：撞墙被堵住的那一刻最危险（怪全挤在雷上）。
 * 走位一律是"按方向键"，走的是真实输入路径（`setInput`），不是瞬移。
 */
const WALK = args.get('walk') ?? null;
/** 靶子自己走过来（伏灯 / 旋灯这类"要人等上门"的武器只有这样才量得到；静态靶里它们是 0）。 */
const MOVE = args.has('move') || !!WALK;
/** 拨着芯量（按 C）：灯火半径砍一半、damageScale ×0.65——这是"暗里这件武器还剩多少"的读法。 */
const WICK = args.has('wick');
const ONLY = args.get('weapon') ?? null;
const JSON_OUT = args.get('json') ?? null;
/** 靶子：影蛭。它不吃"要有光才可被击中"那一条，是最干净的靶。 */
const DUMMY = args.get('dummy') ?? 'shade';
/** 「要有一盏亮着的灯才可打」那一类敌人不吃这一套——靶房自己保证照得亮（油钉在 `--oil`）。 */
const dt = 1 / 60;

const lcg = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/** 摆靶：一圈或一小片，摆在离玩家 `dist` 的地方。 */
function arrange(layout, dist, count) {
  const out = [];
  if (layout === 'ring') {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      out.push([Math.cos(a) * dist, Math.sin(a) * dist]);
    }
    return out;
  }
  // pack：3 列 × 4 排的一小片，整片中心落在 dist 上（用来量"清场"）
  const cols = 3;
  const rows = Math.ceil(count / cols);
  const gap = 34;
  for (let i = 0; i < count; i += 1) {
    const cx = (i % cols) - (cols - 1) / 2;
    const cy = Math.floor(i / cols) - (rows - 1) / 2;
    out.push([dist + cx * gap, cy * gap]);
  }
  return out;
}

/**
 * 这一帧该按哪个方向（游戏时间 `t` 秒）。四种走位各自复现上面说的那种玩家：
 * 换成方向向量之后照样走 `setInput`，所以量到的还是"真按键跑出来的那个人"。
 */
function walkDir(t) {
  const phase = (w) => t * ((Math.PI * 2) / w);
  switch (WALK) {
    case 'circle': {
      const a = t * 1.05; // 转一整圈约 6 秒：跑出来的圈半径 ≈ 移速 / 1.05（约 150px）
      return [Math.cos(a), Math.sin(a)];
    }
    case 'sweep': {
      const s = Math.sign(Math.sin(phase(2))) || 1; // 每 1 秒掉一次头
      return [s, 0];
    }
    case 'zigzag': {
      const s1 = Math.sign(Math.sin(phase(1.4))) || 1;
      const s2 = Math.sign(Math.sin(phase(1.4) + 1.1)) || 1;
      return [s1, s2];
    }
    case 'straight':
      return [1, 0];
    default:
      return [0, 0];
  }
}

/**
 * 跑一件武器：返回 { dps, coverage, hits }。
 * 同一颗种子 + 同一份摆法 = 同一份数（`Math.random` 与 `game.rng` 都钉住）。
 */
async function measure({ weapon, layout, dist, seed }) {
  const env = installDomStubs();
  await import(`${ENTRY}?bench=w-${weapon}-${layout}-${dist}-${seed}-${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  loop.stop();
  env.intervals.length = 0;
  let ms = (seed * 2654435761) >>> 0;
  Math.random = () => ((ms = (ms * 1664525 + 1013904223) >>> 0) / 4294967296);
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.rng.reseed((seed * 40503 + 7) >>> 0);
  const p = game.player;

  // 靶房：不刷怪、不弹面板、只留这一件武器
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  // 墙要清掉（v85 起）：这间靶房是**开在真地图上的**（`newRun` 现生成一关），
  // 于是"距离"那一列里混着"这一局的地图长什么样"。弹体一路上在墙里判死（`resolveProjectiles`），
  // 撞上一堵就没了——同一颗种子清墙前后差得最远的是这几格（seed 11，`--secs=30` 实测）：
  //   光刃碎片 ring 400   0.0 → 55.1（那一发在去路上死在墙里）
  //   回旋灯刃 pack 110   647.3 → 1389.8
  //   双月轮   pack 110  2648.7 → 6373.7
  //   倾灯     pack 400   932.8 → 1715.4
  // 不吃墙的那几件逐位没变（光矛 ring/pack 400 是 90.0 / 510.3，燎灯 482.7，追踪火苗 ring 110 575.3）。
  // 要量"墙挡不挡得住"，用的是带场景的 `tools/bench-wall.mjs`，不是这一间靶房。
  game.level.walls.length = 0;
  p.weapons.clear();
  p.weapons.set(weapon, LEVEL);
  p.recomputeStats();
  p.x = 0;
  p.y = 0;
  p.oil = p.oilMax * OIL; // 灯火钉住（见文件头）
  if (WICK) {
    p.wickOn = true;
    p.wick = 1; // 直接摆到"拨到底"的状态，不走那 0.28 秒的过渡
  }

  const slots = arrange(layout, dist, COUNT);
  const dummies = [];
  for (const [dx, dy] of slots) {
    const e = game.enemies.spawn(DUMMY, dx, dy, 1, 1);
    e.hp = 1e9;
    e.maxHp = 1e9;
    if (!MOVE) e.speed = 0; // 静态靶：量的是"够不够得着"
    e.damage = 0; // 不咬人：挨打会触发受击停顿，把读数压小
    dummies.push(e);
  }
  const hit = new Set();
  const before = game.damageBySource.get(weapon) ?? 0;

  const frames = Math.round(SECS / dt);
  for (let i = 0; i < frames; i += 1) {
    const g = game;
    const [wx, wy] = WALK ? walkDir(i * dt) : [0, 0];
    // 靶子不能被推走、也不能被自己人挤出位置：每一帧按槽位摆回去（"钉在地上"的靶）
    for (let k = 0; k < dummies.length; k += 1) {
      const e = dummies[k];
      if (!MOVE) {
        e.x = slots[k][0];
        e.y = slots[k][1];
      }
      e.hp = 1e9; // 打不死：不然量的是"它多久死"
    }
    g.hitStop = 0; // 停顿 = 整个模拟卡住而时间照走，读数会凭空偏小
    p.stats.maxHp = 1e9;
    p.hp = 1e9; // 打不死的玩家（升级 / 重算会把 hp 夹回去，所以每帧补）
    p.oil = p.oilMax * OIL;
    if (WICK) p.wick = 1;
    g.setInput(wx, wy, false, false);
    g.update(dt);
    for (let k = 0; k < dummies.length; k += 1) if (dummies[k].hitFlash > 0) hit.add(k);
  }
  const dmg = (game.damageBySource.get(weapon) ?? 0) - before;
  return { dps: dmg / SECS, per: hit.size ? dmg / SECS / hit.size : 0, hitCount: hit.size, dmg };
}

// 先开一次只为了拿到武器表（`data` 是构建产物导出来的静态表，改武器名这里不会漂）
const boot = installDomStubs();
await import(`${ENTRY}?bench=w-list-${Date.now()}`);
boot.frame();
const { weapons: WEAPONS } = globalThis.window.__WICKLIGHT__.data;
globalThis.window.__WICKLIGHT__.loop.stop();

const list = ONLY ? WEAPONS.filter((w) => w.id === ONLY) : WEAPONS;
const rows = [];
for (const w of list) {
  for (const layout of LAYOUTS) {
    for (const dist of DISTS) {
      const r = await measure({ weapon: w.id, layout, dist, seed: 11 });
      rows.push({ id: w.id, name: w.name, kind: w.kind, layout, dist, ...r });
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `打靶房：${COUNT} 只 ${DUMMY} · ${MOVE ? '靶自己走过来' : '靶钉在地上'}、都不咬人 · Lv${LEVEL} · ${SECS}s 游戏时间 · 油钉在 ${OIL}${WICK ? ' · 拨着芯' : ''}${WALK ? ` · 走位=${WALK}` : ''}`,
);
console.log(`${pad('武器', 12)}${pad('种类', 10)}${pad('排法', 6)}${pad('距离', 6)}${pad('DPS 总', 9)}${pad('单只', 8)}覆盖`);
for (const r of rows) {
  console.log(
    `${pad(r.name, 12)}${pad(r.kind, 10)}${pad(r.layout, 6)}${pad(r.dist, 6)}${r.dps.toFixed(1).padStart(8)}${' '}${r.per.toFixed(1).padStart(7)}${' '}${`${r.hitCount}/${COUNT}`.padStart(5)}`,
  );
}

if (JSON_OUT) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(JSON_OUT, JSON.stringify(rows, null, 1));
  console.log(`\n写入 ${JSON_OUT}`);
}
