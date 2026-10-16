/**
 * 「墙」回归测试（v84）：到 v83 为止，怪是**直接穿过墙**走过来的。
 *
 * `Enemy.behave` 每帧把速度积分成位移那一步只有两行裸加法（`e.x += e.vx * dt`），
 * 从来没问过墙；只有玩家走 `collideWalls`。于是墙对怪来说等于不存在——
 * README 里那句"怪撞上墙也走不动"和实现对不上，而墙又是**唯一**一种玩家能改动战场几何的东西
 *（其余全是数值），所以这件事得钉死。
 *
 * 五条要证明的规矩：
 *   1. 穿不过去：怪的圆心到墙的重叠深度任何时候都不许超过半个像素（改前是 53px，一路穿到底）；
 *   2. 但也不是"撞上就停"：正对着墙面撞的那一帧如果只把位置推出去，怪就永远贴着墙不动了——
 *      它得**贴着墙面滑**，一直绕到拐角、绕到你面前（这一条量的是"能不能过来"，不是"拦没拦住"）；
 *   3. 贴上去之后**一次选定就绕到底**：每帧按"目标在哪边"重算切向的话，怪会在墙面中间左右横跳
 *      （正对着墙面时点积正好是 0），永远走不到拐角；
 *   4. 贴着墙滑是**满速**的，墙罚的是路，不是速度；
 *   5. 冲刺撞墙是**自己把这次出手撞掉了**：当场结束冲刺 + 发呆一段（这一段就是"墙当掩体"的全部）。
 *
 * 其中 1 / 2 / 5 各带一个对照组（`--` 那几条用"撤掉墙规则"或"没有墙"的同一套脚本跑），
 * 免得写出一条"墙有没有都这样"的假断言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);
const dt = 1 / 60;

/**
 * 开一局干净的空场：不刷怪、没有神龛 / 灯台、没有武器、打不死。
 * 墙也先撤光——这一份用例把墙**自己摆**（不然量到的可能是这一局随机生成的那几面）。
 */
async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=enemywalls-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  game.xpToNext = 1e9;
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  for (const p of game.level.pyres) {
    p.x = 9e5;
    p.y = 9e5;
  }
  game.enemies.clear();
  game.level.walls.length = 0;
  game.level.halfW = 900;
  game.level.halfH = 900;
  const p = game.player;
  p.weapons.clear();
  p.relics.clear();
  p.recomputeStats();
  p.stats.maxHp = 1e6;
  p.hp = 1e6;
  return game;
}

/** 圆心到矩形的重叠深度（px）：0 = 刚好贴着墙，正数 = 真的陷进墙里了。 */
function penetration(cx, cy, r, w) {
  const nx = Math.max(w.x, Math.min(cx, w.x + w.w));
  const ny = Math.max(w.y, Math.min(cy, w.y + w.h));
  const d = Math.hypot(cx - nx, cy - ny);
  if (d > 0) return Math.max(0, r - d);
  return r + Math.min(cx - w.x, w.x + w.w - cx, cy - w.y, w.y + w.h - cy);
}

/** 一只打不死的追兵（不咬血：这一份量的是"走到哪儿"，不是"掉了多少血"）。 */
function foe(game, id, x, y) {
  const e = game.enemies.spawn(id, x, y, 1, 1);
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.damage = 0;
  e.spawnTimer = 0;
  return e;
}

/** 跑 n 帧（玩家不动：这一份是"站着挨打"，把玩家从走位里摘出去）。 */
function run(game, n) {
  for (let i = 0; i < n; i += 1) {
    game.player.hp = 1e6;
    game.player.oil = game.player.oilMax;
    game.hitStop = 0;
    game.setInput(0, 0, false, false);
    game.update(dt);
  }
}

/** 一堵 400×80 的墙横在 (0,0)：玩家在 -y 那侧，追兵从 +y 那侧来。 */
const BARRIER = () => ({ x: -200, y: -40, w: 400, h: 80 });

/**
 * 从 +y 那侧贴上来的怪，最终停在墙下沿外**一个半径**的地方（推进去那一步是精确解）。
 * ⚠ 这个数不能凭手感写：影蛭半径 13、墙下沿 40 → 53；刺脊半径 15、那道墙下沿 -20 → -5。
 * 一开始我把它写死成 -5，量出来的"贴墙帧数"就永远是 0（怪其实停在 53 那条线上）。
 */
const faceY = (w, e) => w.y + w.h + e.radius;

test('怪穿不过墙：圆心陷进墙里的深度任何时候都不超过半个像素', async (t) => {
  const game = await open(t, 'block');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const e = foe(game, 'shade', 0, 300);

  let deepest = 0;
  let held = 0;
  for (let i = 0; i < 900; i += 1) {
    run(game, 1);
    deepest = Math.max(deepest, penetration(e.x, e.y, e.radius, wall));
    if (e.wallSide !== 0) held += 1;
  }
  // 0.5px 是留给浮点的余量：推出去那一步是精确解，只有"刚好擦着"的帧会落在 1e-9 这个量级上。
  // 对照组（把墙规则撤掉）同一套脚本量到的是 **53px**——影蛭半径 13 + 墙的半厚 40，
  // 一路穿到底（见 tools/bench-wall.mjs 的 `--nocollide`）。
  assert.ok(deepest <= 0.5, `怪不该陷进墙里（最深 ${deepest.toFixed(2)}px）`);
  assert.ok(held > 60, `它得真的撞上这面墙（贴着墙走了 ${held} 帧）`);
  assert.ok(e.y < 0, `绕完应该在墙的另一侧（y=${e.y.toFixed(0)}，墙下沿在 40）`);
});

test('撞上墙不是停下不动：它会贴着墙面滑、绕过拐角，最后走到你面前', async (t) => {
  const game = await open(t, 'round');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const e = foe(game, 'shade', 0, 300);

  let contactAt = -1;
  for (let i = 0; i < 60 * 25 && contactAt < 0; i += 1) {
    run(game, 1);
    if (Math.hypot(e.x - game.player.x, e.y - game.player.y) <= e.radius + game.player.radius + 1) {
      contactAt = i * dt;
    }
  }
  // 上界是绝对数（25 秒）：改前它是直穿过去的（8 秒出头），改后要绕一段路——
  // 但"绕不过去"（贴着墙呆住）必须红。影蛭 68px/s，绕这面 400×80 的墙多走 430px ≈ 6.3 秒。
  assert.ok(contactAt > 0, '怪必须能绕过这面墙（贴着墙停住 = 玩家蹲墙后面就无敌了）');
  assert.ok(contactAt < 25, `绕过来该在 25 秒内（实际 ${contactAt.toFixed(1)}s）`);
  // 它得真的往墙的那一头走过去：绕路的终点在玩家那侧（y < 0）
  assert.ok(e.y < 0, `绕完应该在墙的另一侧（y=${e.y.toFixed(0)}）`);
});

test('贴上去之后一次选定就绕到底：不在墙面中间左右横跳', async (t) => {
  const game = await open(t, 'commit');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const e = foe(game, 'shade', 0, 300);

  // 从"撞上墙"那一帧开始，记下它沿墙面（x 方向）的每一次换向
  const xs = [];
  let hits = 0;
  for (let i = 0; i < 60 * 12; i += 1) {
    run(game, 1);
    if (penetration(e.x, e.y, e.radius, wall) === 0 && Math.abs(e.y - faceY(wall, e)) < 1.5) {
      hits += 1;
      xs.push(e.x);
    }
  }
  assert.ok(hits > 60, `它总得在墙面上呆一会儿（实测 ${hits} 帧）`);
  // 换向要**攒够 1.5px** 才算数：追人的那点左右飘（`chase` 里的 strafe，±0.25）会让贴墙的
  // 单帧位移偶尔倒退半个像素——那不是横跳，是脚下没站稳。改这条容差之前量过：新墙规下
  // 每一次跑都会看到这种 0.4~0.6px 的往返（30 次全有），而真正的横跳是每帧换向、能连着翻十几次。
  let turns = 0;
  let dir = 0;
  let back = 0;
  for (let i = 1; i < xs.length; i += 1) {
    // 只数"真的挪动了"的那些帧：贴着墙站着不动的帧不算换向
    if (Math.abs(xs[i] - xs[i - 1]) < 1e-6) continue;
    const d = Math.sign(xs[i] - xs[i - 1]);
    if (dir !== 0 && d !== dir) {
      back += Math.abs(xs[i] - xs[i - 1]);
      if (back > 1.5) {
        turns += 1;
        dir = d;
        back = 0;
      }
      continue;
    }
    back = 0;
    dir = d;
  }
  // 真的换向最多一次（绕过第一个拐角时那一下是允许的——撞上的是**另一面**墙，本来就该重选）。
  // 每帧按"目标在哪边"重算切向的写法在墙面中间会翻好几次，这一条就会红。
  assert.ok(turns <= 1, `贴墙期间不该来回横跳（真的换向 ${turns} 次，贴墙 ${hits} 帧）`);
});

test('绕过凸角之后不许沿着同一面墙折返回去（一次绕行要记住撞的是哪一面墙）', async (t) => {
  // 三面墙围成口袋，怪从上方来、贴上顶墙之后必须绕到一侧再进来。
  // 改前的写法在这里会把"绕过右角的那两帧"当成"第一次撞墙"重选一次方向：
  // 那次重选用的是"玩家在哪个方向"，量出来是**反方向**——它转身把刚走完的顶墙再走一遍，
  // 白走 400px；口袋里 8 只影蛭的到达时间因此从 17 秒摊到 17~33 秒（相位差）。
  // 这一条量的是"最后一只什么时候进来"：折返一发生，这个数就翻上去。
  const game = await open(t, 'corner');
  for (const w of [
    { x: -200, y: -200, w: 400, h: 80 },
    { x: -200, y: -120, w: 80, h: 260 },
    { x: 120, y: -120, w: 80, h: 260 },
  ]) {
    game.level.walls.push(w);
  }
  game.player.x = 0;
  game.player.y = 20;
  const foes = [];
  for (let i = 0; i < 8; i += 1) foes.push(foe(game, 'shade', (i - 3.5) * 30, -520));

  let last = -1;
  let arrived = 0;
  for (let i = 0; i < 60 * 30 && arrived < 8; i += 1) {
    run(game, 1);
    arrived = foes.filter(
      (e) => Math.hypot(e.x - game.player.x, e.y - game.player.y) <= e.radius + game.player.radius + 1,
    ).length;
    if (arrived === 8) last = i / 60;
  }
  // 改后：8 只的到达时间挤在 17.2 秒上下（16 个相位各跑一遍，最慢 17.2s）；
  // 改前最慢的一只落在 23s，相位差的那几次到 33s。22s 这条线卡在两者中间。
  assert.equal(arrived, 8, `8 只都得进来（实测 ${arrived}/8）`);
  assert.ok(last <= 22, `绕行不该有折返那一段（最后一只 ${last.toFixed(1)}s，改前 23~33s）`);
});

test('正对着墙撞上来的时候绕的是近的那一头（不是按 id 掷硬币）', async (t) => {
  // 一堵 1200px 宽的墙横在中间，撞点在离右端 100px 的地方，玩家就在怪的正后方——
  // 这时候切向点积是 0，两边"离玩家的方位"一样远，只剩"哪一头近"这一个判据。
  // 改前按 e.id 的奇偶掷硬币：掷到远的那一头要多走 1100px 再绕回来。
  // 实测（`npm run bench:wall -- --only=wide --secs=45`）：掷硬币那一版最后一只 39.9 秒，
  // 绕近的这一版 14.3 秒（单只 10.3 秒）。13 秒这条线就卡在"绕远"的那条路（25 秒以上）中间。
  const game = await open(t, 'nearer');
  game.level.walls.push({ x: -600, y: -40, w: 1200, h: 80 });
  game.player.x = 500;
  game.player.y = -300;
  const e = foe(game, 'shade', 500, 300);

  let t1 = -1;
  for (let i = 0; i < 60 * 30 && t1 < 0; i += 1) {
    run(game, 1);
    if (Math.hypot(e.x - game.player.x, e.y - game.player.y) <= e.radius + game.player.radius + 1) {
      t1 = i / 60;
    }
  }
  assert.ok(t1 > 0, '它总得到你面前（30 秒都没到说明绕错了头 / 卡住了）');
  assert.ok(t1 <= 13, `该绕近的这一头（实测 ${t1.toFixed(1)}s，绕远的那一头是 25.7~41.3s）`);
});

test('贴着墙滑是满速的：墙罚的是路，不是速度', async (t) => {
  const game = await open(t, 'speed');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const e = foe(game, 'shade', 0, 300);

  // 先让它走到墙面上（305px 的路，影蛭 68px/s 还要左右飘一点，给足 15 秒）
  const face = faceY(wall, e);
  for (let i = 0; i < 900 && Math.abs(e.y - face) > 1.5; i += 1) run(game, 1);
  assert.ok(Math.abs(e.y - face) <= 1.5, `先走到墙面上再量（y=${e.y.toFixed(1)}，应该是 ${face}）`);

  let slideFrames = 0;
  let minStep = Infinity;
  for (let i = 0; i < 120; i += 1) {
    const px = e.x;
    const py = e.y;
    run(game, 1);
    const step = Math.hypot(e.x - px, e.y - py);
    // 只数"贴在同一面墙上横着走"的那些帧（脱离墙面之后的直追不算）
    if (Math.abs(e.y - face) <= 1.5 && Math.abs(e.x) < 195) {
      slideFrames += 1;
      minStep = Math.min(minStep, step);
    }
  }
  assert.ok(slideFrames > 30, `总得贴着墙面滑一段（实测 ${slideFrames} 帧）`);
  const want = e.speed * dt; // 68 / 60 ≈ 1.13px
  assert.ok(
    minStep > want * 0.9,
    `贴墙滑应该是满速（最慢一帧走了 ${minStep.toFixed(2)}px，满速 ${want.toFixed(2)}px）`,
  );

  // 贴墙的速度是"这一帧它本来该走多远"，不是它自己的基础脚力：
  // 挂着减速的时候，贴着墙滑也得跟着慢——不然"减速"在墙边等于没有（绕圈的时候正好最需要它生效）。
  e.slowTimer = 5;
  e.slowFactor = 0.5;
  // ⚠ 这里量的是**最快**那一帧，不是最慢那一帧：第一帧常常是"刚好没挡住"的一帧
  // （它按自己的意图走了半步就脱离墙面了），取最小的话那一帧会把后面的问题盖住——
  // 实测过：把贴墙速度写死成基础脚力（减速在墙边失效）时，取最小竟然还是绿的。
  let slowMost = 0;
  for (let i = 0; i < 40; i += 1) {
    const px = e.x;
    const py = e.y;
    run(game, 1);
    if (Math.abs(e.y - face) <= 1.5 && Math.abs(e.x) < 195) {
      slowMost = Math.max(slowMost, Math.hypot(e.x - px, e.y - py));
    }
  }
  assert.ok(
    slowMost > want * 0.35 && slowMost < want * 0.65,
    `慢一半的时候贴墙也该慢一半（实测最快一帧 ${slowMost.toFixed(2)}px / 满速 ${want.toFixed(2)}px）`,
  );
});

test('冲刺撞墙：这次冲刺当场结束，而且它得发呆一会儿（墙当掩体的那一段）', async (t) => {
  const game = await open(t, 'bash');
  // 墙贴在玩家那一侧：刺脊的蓄力冲锋一定会撞在它身上
  const wall = { x: -200, y: -100, w: 400, h: 80 };
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const lancer = foe(game, 'lancer', 0, 300);

  // 撞墙那一下得听得见（它是"对手把出手撞掉了"的好消息，和"你被咬了"必须分得开）
  const sounds = [];
  const realPlay = game.audio.play.bind(game.audio);
  game.audio.play = (n) => {
    sounds.push(n);
    return realPlay(n);
  };

  let bashed = -1;
  let deepest = 0;
  let stunFrames = 0;
  let movedWhileStunned = 0;
  let px = lancer.x;
  let py = lancer.y;
  for (let i = 0; i < 60 * 20; i += 1) {
    run(game, 1);
    deepest = Math.max(deepest, penetration(lancer.x, lancer.y, lancer.radius, wall));
    if (lancer.wallStun > 0) {
      // 20 秒里它会撞好几次，这里只量**第一次**撞停的那一整段。
      // ⚠ 撞上去的那一帧不算：那一帧它还在被墙解算位置（冲刺的最后一步被推到了墙面上），
      // 从下一帧起才是真正的"发呆"。
      if (bashed < 0) {
        bashed = i;
      } else {
        stunFrames += 1;
        movedWhileStunned = Math.max(movedWhileStunned, Math.hypot(lancer.x - px, lancer.y - py));
      }
    } else if (bashed >= 0) {
      break;
    }
    px = lancer.x;
    py = lancer.y;
  }
  assert.ok(bashed >= 0, '刺脊应该会撞到墙上（蓄力冲锋 8 倍脚力，一面墙就在它和你之间）');
  assert.ok(sounds.includes('bash'), `撞墙要有一声闷响（响了这些：${sounds.join(',')}）`);
  // 上面那一句只证明"有人喊了一声 play('bash')"。引擎里要是没这一条，撞墙就是哑的——
  // 所以把两个底层发声口换掉，直接问引擎：这个名字你认得吗？（没有真正出声 = 这一条要红）
  game.audio.started = true;
  game.audio.throttle = () => true; // 真撞的那一声刚响过，节流窗口还开着（按真实时间算的）
  const voiced = [];
  game.audio.tone = (...a) => voiced.push(a);
  game.audio.noise = (...a) => voiced.push(a);
  game.audio.play('bash');
  assert.ok(voiced.length > 0, '音频引擎里得有 bash 这一条（不然撞墙那一下是哑的）');
  assert.ok(deepest <= 0.5, `冲刺也不该穿过去（最深 ${deepest.toFixed(2)}px）`);
  assert.equal(lancer.dashing, 0, '撞上去之后这次冲刺当场结束（不该继续在墙里磨）');
  // 发呆时长：绝对数——够你转身走两步（0.4s 以上），又不是"每面墙都是一台刷怪机"（1 秒以内）
  const stun = stunFrames * dt;
  assert.ok(stun >= 0.4 && stun < 1, `撞停该有半秒上下（实测一次 ${stun.toFixed(2)}s）`);
  assert.ok(movedWhileStunned < 0.05, `发呆期间它就不该动（实测挪了 ${movedWhileStunned.toFixed(3)}px）`);
});

test('大块头一视同仁：坦克 / 精英 / 首领一样过不去（没有"首领可以拆墙"这种特例）', async (t) => {
  // 墙是玩家唯一能改动的战场几何，所以它必须对**所有**怪一视同仁——
  // 只对普通怪生效的话，"精英/首领能穿墙"这件事会在最需要它的那几场里恰好失效。
  for (const id of ['bulwark', 'wickmother', 'thornlord']) {
    const game = await open(t, `big-${id}`);
    const wall = BARRIER();
    game.level.walls.push(wall);
    game.player.x = 0;
    game.player.y = -300;
    const e = foe(game, id, 0, 300);
    let deepest = 0;
    for (let i = 0; i < 60 * 30; i += 1) {
      run(game, 1);
      deepest = Math.max(deepest, penetration(e.x, e.y, e.radius, wall));
    }
    assert.ok(deepest <= 0.5, `${id}（半径 ${e.radius}）也不该陷进墙里（最深 ${deepest.toFixed(2)}px）`);
    assert.ok(e.y < 60 - e.radius, `${id} 得自己绕过来（y=${e.y.toFixed(0)}）`);
  }
});

test('池子复用：新刷出来的怪不带上一只的"绕墙方向"和发呆计时', async (t) => {
  const game = await open(t, 'pool');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const a = foe(game, 'shade', 0, 300);
  for (let i = 0; i < 600 && a.wallSide === 0; i += 1) run(game, 1);
  assert.notEqual(a.wallSide, 0, '先让一只真的撞上墙（这时候它记着"往哪边绕"）');
  a.wallStun = 0.5; // 再让它"刚撞停过一次"
  game.enemies.clear();

  // 怪是**池子**里捞的（`clear` 只是把 active 放下），所以刚才那一只迟早会被再捞出来——
  // 它必须是干净的：带着上一只的绕墙方向 / 发呆计时出场的话，玩家会看到"新刷出来的怪一出场就发呆"。
  for (let i = 0; i < 260; i += 1) {
    const e = game.enemies.spawn('shade', 0, 700, 1, 1);
    assert.equal(e.wallSide, 0, `第 ${i} 只捞出来时不该带着上一只的绕墙方向`);
    assert.equal(e.wallStun, 0, `第 ${i} 只捞出来时不该带着上一只的发呆计时`);
    assert.equal(e.wallStuckT, 0, `第 ${i} 只捞出来时不该带着上一只的卡死计时`);
  }
});

test('凹口袋：三面墙围起来也拦不死它们，8 只要全部能进来', async (t) => {
  const game = await open(t, 'pocket');
  for (const w of [
    { x: -200, y: -200, w: 400, h: 80 },
    { x: -200, y: -120, w: 80, h: 260 },
    { x: 120, y: -120, w: 80, h: 260 },
  ]) {
    game.level.walls.push(w);
  }
  game.player.x = 0;
  game.player.y = 20;
  const foes = [];
  for (let i = 0; i < 8; i += 1) foes.push(foe(game, 'shade', (i - 3.5) * 30, -520));

  let arrived = 0;
  for (let i = 0; i < 60 * 30 && arrived < 8; i += 1) {
    run(game, 1);
    arrived = foes.filter(
      (e) => Math.hypot(e.x - game.player.x, e.y - game.player.y) <= e.radius + game.player.radius + 1,
    ).length;
  }
  // 改前它们直穿进来（7.5 秒全部到齐）；改后要绕两侧，实测 17.2 秒（8 只全到齐，相位无关）。
  // 30 秒是**上界**：有哪怕一只被永久卡在墙背面，这一条就红——那正是"拿墙当盾"的退化写法。
  assert.equal(arrived, 8, `口袋里那 8 只都得进来（实测 ${arrived}/8）`);
});

test('没有墙的时候逐位不变：撤掉墙规则 == 老那两行裸加法', async (t) => {
  const game = await open(t, 'nowall');
  game.player.x = 0;
  game.player.y = -300;
  const e = foe(game, 'shade', 0, 300);
  // 起点到玩家 600px，影蛭 68px/s：10 秒足够走到贴身（`chase` 自己会左右飘着走，
  // 所以 x 那条要留出飘的余量——墙这一版**没有**动它的速度，动的只是位移落点）
  run(game, 600);
  const d = Math.hypot(e.x - 0, e.y - -300);
  assert.ok(d <= e.radius + game.player.radius + 1.5, `没有墙就该直直走过来（还剩 ${d.toFixed(1)}px）`);
  assert.ok(Math.abs(e.x) < 60, `没有墙就没人掰它（x=${e.x.toFixed(1)}，只有追人的左右飘）`);
});

test('墙也拦得住被外力推着走的怪：旋灯的吸力不能把怪拽穿墙', async (t) => {
  const game = await open(t, 'push');
  const wall = BARRIER();
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = -300;
  const e = foe(game, 'bulwark', -60, 260);

  // 每帧直接往怪身上加一个巨大的速度（模拟旋灯吸力 / 击退叠在它自己的速度上）：
  // 位移那一步仍然要过墙，所以它只能贴着墙滑，绝不能出现在墙里。
  let deepest = 0;
  for (let i = 0; i < 300; i += 1) {
    e.vx += 0;
    e.vy = -1400; // 一路往上顶（比它自己 34px/s 的脚力快四十倍）
    run(game, 1);
    deepest = Math.max(deepest, penetration(e.x, e.y, e.radius, wall));
  }
  assert.ok(deepest <= 0.5, `被外力硬推也不该进墙（最深 ${deepest.toFixed(2)}px）`);
  const face = faceY(wall, e);
  assert.ok(e.y >= face - 1, `它应该被这次推力按在墙面上（y=${e.y.toFixed(1)}，停线 ${face}）`);
});

test('撞晕的怪还是一具身体：站在它身上照样挨咬', async (t) => {
  // 撞停那一段它既不走也不出手（`behave` 整段跳过），但"贴到玩家身上那一口"不该跟着免掉——
  // 不然"把冲锋骗进墙里，再站上去白打"就成了一套免费的点数。
  const game = await open(t, 'daze-bite');
  const p = game.player;
  p.x = 0;
  p.y = 0;
  const e = foe(game, 'lancer', 22, 0); // 贴着你站（接触距离 15 + 14 = 29）
  e.damage = 9;
  e.wallStun = 0.5; // 按住它：这一帧它"发呆"
  p.invuln = 0;
  const hp = p.hp;
  run(game, 1);
  assert.ok(p.hp < hp, `发呆的怪贴着你还是要咬（hp ${hp} → ${p.hp}）`);

  // 对照：它发呆的这几帧里一步都不许挪（发呆就是发呆）
  const x0 = e.x;
  const y0 = e.y;
  run(game, 20);
  assert.ok(Math.hypot(e.x - x0, e.y - y0) < 0.05, `发呆期间不该走动（挪了 ${Math.hypot(e.x - x0, e.y - y0).toFixed(3)}px）`);
});

test('地上有盏弃灯时，贴在你身上的怪照样咬你（那一口量的是你，不是灯）', async (t) => {
  // 怪的"这一帧目标"在分灯之后可能是那盏灯，但**接触伤害**问的永远是"它有没有贴到你身上"。
  // 判据混用的话（拿"离这一帧目标的距离"当接触距离）：地上摆一盏灯之后，
  // 贴在你身上的怪反倒不咬了——它在往灯那儿走，离灯远，于是"贴着你却不咬"，
  // 而画面上完全看不出来（怪就在你身上蹭）。
  const game = await open(t, 'lure-bite');
  const p = game.player;
  p.x = 0;
  p.y = 0;
  p.oil = p.oilMax;
  assert.equal(game.tryPlantLamp(), true, '先把灯放下来');
  assert.equal(game.lamps[0].x, 0, '弃灯就放在你脚下');
  p.x = 0;
  p.y = 140; // 你走开 140px：现在这只怪"离灯远、离你近"
  const e = foe(game, 'shade', 0, 160);
  e.damage = 9;
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius + 1, '它贴在你身上');
  assert.ok(Math.hypot(e.x - game.lamps[0].x, e.y - game.lamps[0].y) > e.radius + 16, '它离那盏灯够不着');
  p.invuln = 0;
  const hp = p.hp;
  run(game, 1);
  assert.ok(p.hp < hp, `贴着你的时候它就该咬（hp ${hp} → ${p.hp}）`);
  assert.equal(e.wallSide, 0, '场上那盏灯不是墙：它这一帧在往灯那儿走，没撞墙');
});

test('大块头不生到墙里：精英 / 首领那一路的刷怪点要留出它自己的半径', async (t) => {
  // 刷怪点本来就在 620~940px 外（屏幕看不见），但 v84 起怪是会撞墙的——
  // 生在墙里的那一下会被"推出去"（半径 66 的终夜就是一帧跳 66px）。
  // 普通怪那一路按石守的 22 留了 26 就够；精英 / 首领那一路原来也是 26，不够。
  const game = await open(t, 'spawn');
  // 一大块墙正好压在那个环上（玩家在原点，环半径 620~940）
  const wall = { x: 500, y: -200, w: 400, h: 400 };
  game.level.walls.push(wall);
  game.player.x = 0;
  game.player.y = 0;
  const rectGap = (x, y) => {
    const dx = Math.max(wall.x - x, 0, x - (wall.x + wall.w));
    const dy = Math.max(wall.y - y, 0, y - (wall.y + wall.h));
    return Math.hypot(dx, dy);
  };
  let inside = 0;
  let close = 0; // 离墙面 70~140px 的那些点：证明这个环真的从那面墙边上过
  for (let i = 0; i < 200; i += 1) {
    const spot = game.randomSpawnPoint(); // 不传 speed = 精英 / 首领那一路
    if (penetration(spot.x, spot.y, 66, wall) > 0.5) inside += 1; // 按最大的身体（终夜半径 66）算
    const gap = rectGap(spot.x, spot.y);
    if (gap >= 70 && gap <= 140) close += 1;
  }
  assert.equal(inside, 0, `按终夜的身材算，200 个刷怪点里 ${inside} 个生在墙里`);
  assert.ok(close > 0, `这一条得真的量到东西（离墙 70~140px 的点有 ${close} 个）`);
});
