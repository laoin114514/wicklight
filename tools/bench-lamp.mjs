/**
 * 「分灯」台架（离线，无头）：量**一盏弃灯到底替你挡住了什么**。
 *
 *   node tools/bench-lamp.mjs                        # 三种走位 · 放灯 / 不放灯成对跑
 *   node tools/bench-lamp.mjs --walk=sweep --secs=30
 *   node tools/bench-lamp.mjs --relic=lampburst,lampember   # 带上这一族的遗物再量一遍
 *   node tools/bench-lamp.mjs --json=/tmp/wl/lamp.json
 *
 * 为什么要有这个脚本：分灯（v1 就有的那个动词）到 v82 为止一直没有自己的台架——
 * 它的账全是"感觉上应该有用"，而这一版要围绕它补四件遗物，那四件各自改一个数，
 * 每个数都必须先量出来"它原来值多少"。同一份产物、同一颗种子，两次跑出同一份数。
 *
 * 它要回答的是**一个具体的问题**：放下这盏灯，你少挨了几下、它把几只怪从你身上拿走了几秒。
 * 所以靶房必须是死的（见下），而且两种场景要成对看：
 *   · `--lamp`  放下那盏灯；
 *   · 不带      同一颗种子、同一条脚本，只是没有灯。
 * 两个读数之差才是"这盏灯买到的东西"——单看放灯那一栏会以为它挡住了很多，
 * 其实那些秒数里有一大半是"你本来就在跑"。
 *
 * 三种走位复现的是三种真实的用法（都走真实输入路径 `setInput`，不是瞬移）：
 *   · `stand` —— 站桩：把它当盾（最容易被高估的一种用法，因为灯就摆在你脚下）；
 *   · `sweep` —— 来回拉：跑来跑去、反复穿过怪群（追兵一直咬着你，灯才是雪中送炭）；
 *   · `circle`—— 绕圈：一边跑一边打，灯摆在圈上。
 *
 * 读数里最重要的是**「挡住 n 只·秒」**：每一帧数"有几只的目标是那盏灯"（判据就是游戏里
 * `Enemy.behave` 那一步：自己与最近一盏灯的距离 < 与你的距离，且灯在引怪半径内），
 * 再乘 dt 累加。它比"挨打次数"稳（挨打有随机性、还有受击停顿），
 * 也比"灯活了多久"诚实（灯可以活满全程却一个人都没引到）。
 */
import { installDomStubs } from '../tests/dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url).href;

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const DIST = Number(args.get('dist') ?? 260);
const COUNT = Number(args.get('count') ?? 12);
const SECS = Number(args.get('secs') ?? 30);
const WALKS = (args.get('walk') ?? 'stand,flee,turn,circle').split(',');
/** 带上这一族的遗物再量一遍（`--relic=lampburst`） */
const RELICS = (args.get('relic') ?? '').split(',').filter(Boolean);
/** 靶子：影蛭（最普通的追兵）。速度可以调，用来看"追得更快的怪"这一档。 */
const FOE = args.get('foe') ?? 'shade';
const JSON_OUT = args.get('json') ?? null;
const dt = 1 / 60;

// 引怪半径只有一处真话：`data/lamp.ts`（和「香饵」改伏灯引蛾距离同一条规矩——
// 遗物要改的就是这个数，两处只要有一处没跟上，台架量出来的就不是玩家玩到的那条规则）。
// 先开一次壳把那张表读出来。
const boot = installDomStubs();
await import(`${ENTRY}?bench=lamp-list-${Date.now()}`);
boot.frame();
const LAMP = globalThis.window.__WICKLIGHT__.data.lamp;
globalThis.window.__WICKLIGHT__.loop.stop();
const LAMP_LURE = LAMP.lure;

/**
 * 这一帧该往哪儿走（游戏时间 `t` 秒）。四种走位各自复现一种真实的用法，
 * 全部走方向键（`setInput`），不是瞬移：
 *   · `stand` —— 站桩：追兵从 +x 走过来，你把灯摆在自己脚下（"把它当盾"那种用法）；
 *   · `flee`  —— 一路逃跑：追兵在 -x 后面追，你朝 +x 跑，第 0.7 秒把灯丢在身后。
 *     这是**最容易高估**它的一种用法：灯正好落在追兵要路过的那条线上；
 *   · `turn`  —— 拐弯甩灯：跑一段、丢下灯、然后转 90°。灯摆在"我不打算去的那个方向"，
 *     追兵得先走到灯那儿、再拐过来找你——这一条才是这个动词真正的用法；
 *   · `circle`—— 绕圈：一边跑一边打，灯摆在圈上。
 */
function walkDir(walk, t) {
  const phase = (w) => t * ((Math.PI * 2) / w);
  switch (walk) {
    case 'stand':
      return [0, 0];
    case 'flee':
      return [1, 0];
    case 'turn':
      // 前 0.7 秒朝 +x（追兵在 -x 后面），之后转 90° 走 +y
      return t < 0.7 ? [1, 0] : [0, 1];
    case 'circle': {
      const a = t * 0.62; // 一圈约 10 秒：跑出来的圈半径 ≈ 移速 / 0.62（约 355px）
      return [Math.cos(a), Math.sin(a)];
    }
    default:
      return [0, 0];
  }
}

/**
 * 跑一遍：12 只怪挤成一小片摆在玩家正前方 `dist` 处（会追人），玩家按 `walk` 走位。
 * 全程不还手（武器栏清空）——量的是灯，不是火力。
 */
async function measure({ walk, lamp, seed }) {
  const env = installDomStubs();
  await import(`${ENTRY}?bench=lamp-${walk}-${lamp}-${seed}-${Date.now()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  loop.stop();
  env.intervals.length = 0;
  let ms = (seed * 2654435761) >>> 0;
  Math.random = () => ((ms = (ms * 1664525 + 1013904223) >>> 0) / 4294967296);
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.rng.reseed((seed * 40503 + 7) >>> 0);
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  for (const id of RELICS) p.relics.add(id);
  p.recomputeStats();
  p.x = 0;
  p.y = 0;

  // 场地：清墙、放大到 900 的半边，让"来回拉 / 绕圈"跑得开；
  // 但这局要量的**不是**地图——墙会把两者都卡住，差值就变糊了。
  game.level.walls = [];
  game.level.halfW = 900;
  game.level.halfH = 900;

  const foes = [];
  const cols = 3;
  const rows = Math.ceil(COUNT / cols);
  const gap = 34;
  for (let i = 0; i < COUNT; i += 1) {
    const cx = (i % cols) - (cols - 1) / 2;
    const cy = Math.floor(i / cols) - (rows - 1) / 2;
    const e = game.enemies.spawn(FOE, -DIST + cx * gap, cy * gap, 1, 1);
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0; // 不咬血：量的是"贴没贴上"，不是"掉了多少血"（受击停顿会把节奏打乱）
    foes.push(e);
  }

  // 「焚灯」那一下一次炸到几只：一次爆炸发生在**同一帧**，所以按帧数 `source === 'lamp'` 的命中数、
  // 取最大值就是"最狠的那一下炸到了几只"（和结算里那张伤害构成同一个来源名）。
  let burstCatches = 0;
  let frameLampHits = 0;
  const realHit = game.applyHit.bind(game);
  game.applyHit = (e, amount, crit, kx, ky, kb, opts) => {
    if (opts?.source === 'lamp') frameLampHits += 1;
    return realHit(e, amount, crit, kx, ky, kb, opts);
  };
  let firstContact = -1;
  let planted = false;
  let plantAt = -1;
  let snuffAt = -1;
  let lamped = 0;      // Σ 每只怪"目标在灯上"的秒数
  let peak = 0;        // 同时被引走的最多只数
  let contacts = 0;    // 被贴上的次数（一只怪一次，离开再贴上算第二次）
  const touching = new Set();
  let nearSum = 0;
  let nearFrames = 0;
  const frames = Math.round(SECS / dt);
  for (let i = 0; i < frames; i += 1) {
    const t = i * dt;
    p.stats.maxHp = 1e9;
    p.hp = 1e9;
    p.oil = p.oilMax; // 油钉住：分灯的代价单独看（不然 30 秒里它会一路烧干）
    for (const e of foes) e.hp = 1e9;
    game.hitStop = 0;
    // 灯在 t = 0.9s 放下：这时追兵的先头已经进了引怪圈，而人还没被贴上
    if (lamp && !planted && t >= 0.9) {
      planted = game.tryPlantLamp();
      plantAt = planted ? t : -1;
    }
    const [wx, wy] = walkDir(walk, t);
    game.setInput(wx, wy, false, false);
    game.update(dt);

    let nearest = Infinity;
    for (const e of foes) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nearest) nearest = d;
    }
    nearSum += nearest;
    nearFrames += 1;
    // 被引走：游戏的判据是"最近那盏灯在引怪半径内"（`Enemy.behave` 里那一步），
    // 灯摆在你脚下时"离灯比离你近"永远不成立，所以这里只按引怪半径数。
    let n = 0;
    if (game.lamps.length) {
      const l = game.lamps[0];
      const R = LAMP_LURE * (1 + (p.flags.lampLure ?? 0));
      for (const e of foes) {
        if (e.def.behavior === 'quench' || e.def.behavior === 'echo') continue; // 这两种不跟灯走
        if (Math.hypot(e.x - l.x, e.y - l.y) <= R) n += 1;
      }
      if (game.lamps.length && lamped === 0 && plantAt >= 0) snuffAt = snuffAt < 0 ? -1 : snuffAt;
    }
    lamped += n * dt;
    if (n > peak) peak = n;
    for (const e of foes) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      const hit = d <= e.radius + p.radius + 1;
      if (hit && firstContact < 0) firstContact = t;
      if (hit && !touching.has(e.id)) { contacts += 1; touching.add(e.id); }
      if (!hit) touching.delete(e.id);
    }
    if (planted && snuffAt < 0 && !game.lamps.length) snuffAt = t;
    if (frameLampHits > burstCatches) burstCatches = frameLampHits;
    frameLampHits = 0;
  }
  return {
    lamped,
    peak,
    contacts,
    burstCatches,
    firstContact: firstContact < 0 ? SECS : firstContact,
    near: nearSum / Math.max(1, nearFrames),
    lampLife: planted && snuffAt > 0 ? snuffAt - plantAt : planted ? SECS - plantAt : 0,
    oilBack: game.lampOilBack ?? 0,
  };
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 8) => v.toFixed(1).padStart(n);
const SEEDS = [11, 29, 47, 83];

console.log(
  `分灯台架：${COUNT} 只 ${FOE}（玩家身后 ${DIST}px 的一小片、会追人、不咬血） · 玩家不还手 · ${SECS}s 游戏时间`
  + `${RELICS.length ? ` · 遗物 ${RELICS.join('+')}` : ''}`,
);
console.log(`${pad('走位', 8)}${pad('灯', 4)}${pad('挡住', 8)}${'  '}${pad('峰值', 5)}${pad('首次贴上', 9)}${pad('贴上', 6)}${pad('最近距离', 10)}${pad('灯活', 7)}${pad('炸到', 6)}回油`);
for (const walk of WALKS) {
  const rows = [];
  for (const lamp of [true, false]) {
    const acc = { lamped: 0, peak: 0, contacts: 0, near: 0, lampLife: 0, oilBack: 0, burstCatches: 0, firstContact: 0 };
    for (const seed of SEEDS) {
      const r = await measure({ walk, lamp, seed });
      for (const k of Object.keys(acc)) acc[k] += r[k];
    }
    for (const k of Object.keys(acc)) acc[k] /= SEEDS.length;
    rows.push(acc);
    console.log(
      `${pad(walk, 8)}${pad(lamp ? '有' : '无', 4)}${num(acc.lamped)}${'  '}${pad(acc.peak.toFixed(1), 5)}`
      + `${pad(acc.firstContact.toFixed(1), 9)}${pad(acc.contacts.toFixed(1), 6)}${pad(acc.near.toFixed(0), 10)}`
      + `${pad(acc.lampLife.toFixed(1), 7)}${pad(acc.burstCatches.toFixed(1), 6)}${(acc.oilBack * 100).toFixed(2)}%`,
    );
  }
  const [on, off] = rows;
  console.log(
    `${pad('', 12)}→ 这一盏灯买到：挡住 ${(on.lamped).toFixed(1)} 只·秒（每只 ${(on.lamped / COUNT).toFixed(1)}s）`
    + ` · 第一次被贴上 ${(on.firstContact - off.firstContact).toFixed(1)}s（${off.firstContact.toFixed(1)} → ${on.firstContact.toFixed(1)}）`
    + ` · 贴上 ${(off.contacts - on.contacts).toFixed(1)} 下（${off.contacts.toFixed(0)} → ${on.contacts.toFixed(0)}）`
    + ` · 追兵平均远 ${(on.near - off.near).toFixed(0)}px`,
  );
}
if (JSON_OUT) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(JSON_OUT, JSON.stringify({ walks: WALKS, dist: DIST, count: COUNT, secs: SECS }, null, 1));
  console.log(`\n写入 ${JSON_OUT}`);
}
