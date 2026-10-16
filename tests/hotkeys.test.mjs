/**
 * 「面板热键」回归测试：三块会打断战斗的面板——升级卡 / 祭坛 / 商店——键盘也能走完。
 *
 * 为什么值得钉：这一局的开火是自动的，手一直停在 WASD 上。可每升一级都要把手挪到鼠标上
 * 点一张卡——一局三四十次，每次都把节奏切断一次。热键把这几次选择接回键盘。
 *
 * 这条链子上有两处最容易坏，而且坏了都**看不出来**：
 *   1. **哪个键对应哪个动作**（`Input.KEYMAP` → `InputState`）：漏一个小键盘、或者把
 *      "第几张"折错了，界面上毫无异样——只是按下去没反应或选了别的卡；
 *   2. **门禁**（不在那块面板上时不许有副作用）：R 在战场上按一下，会白吃一次重掷、
 *      或者悄悄扣掉 8 金币刷新商品。这一条尤其阴——重掷点数是稀缺资源，
 *      被吃掉一次玩家只会觉得"怎么少了"，根本不会想到是自己按了 R。
 *
 * 这两处都在无头环境里能整条走通：`Input` 的键盘监听挂在 `window` 上（桩件真的派发），
 * 规则本身在 `Game.panelHotkeys` 里（不是埋在 main.ts 的主循环里）——所以这里量得到。
 * "真按下键、主循环真的把状态喂进去"那一环由真实浏览器实测 (`tools/playtest.mjs`) 兜。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

async function open(t, tag) {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=hotkey-${tag}-${Date.now()}-${Math.random()}`);
  env.frame();
  const { game, loop, input, ui } = globalThis.window.__WICKLIGHT__;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });
  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.director.introTimer = 1e9;
  // 关卡里的祭坛挪到天边去：它自己会开（走近就弹），别来抢镜头
  for (const s of game.level.shrines) {
    s.x = 9e5;
    s.y = 9e5;
  }
  // 灯台也要挪走（v74）：它跟祭坛不一样，**站在旁边就会被点着**，而点燃会回 14% 的油、
  // 还顺带加余温。这个场合玩家常常是"钉在一个固定坐标上量十几秒"的（比如量爆灯烧掉的那口油），
  // 只要那一局的地图恰好在那个坐标上刷了一座灯台，量出来的就是"油 +14%"，而且是随机的——
  // 实测 40 局里有 5 局会把灯台刷在 (700,700) 的 200px 内。场面本来就该全由测试自己摆。
  for (const py of game.level.pyres) {
    py.x = 9e5;
    py.y = 9e5;
  }
  return { game, env, input, ui };
}

/**
 * 真按一个键：派发到 window（`Input` 就挂在那儿）→ 走一遍 `Input.update()` → 读这一帧的状态。
 * 读完就 `endFrame()`，因为这些都是**一次性**输入（按住不算、读一次就该没了）。
 */
function press(env, input, code) {
  env.dispatch('keydown', { code });
  input.update();
  const picked = { pick: input.state.pick, reroll: input.state.reroll, confirm: input.state.confirm };
  input.endFrame();
  env.dispatch('keyup', { code });
  return picked;
}

/**
 * 一件东西现在"到几级了"（武器 / 被动各有一份等级表，遗物没有等级、有就是 1 级）。
 *
 * ⚠ 量的是**等级**而不是"有没有"：升级卡里有很大一部分是**已经拿着的那件再加一级**
 * （那是这一局的主旋律），照"有没有"去量，第一张卡会因为它本来就在身上而永远算"生效了"——
 * 这条断言就会在抽到某几张卡时无缘无故地红（实测 10 次里红 1 次）。要比就比前后两个数。
 */
function levelOf(game, offer) {
  if (!offer) return -1;
  if (offer.kind === 'weapon') return game.player.weapons.get(offer.id) ?? 0;
  if (offer.kind === 'passive') return game.player.passives.get(offer.id) ?? 0;
  return game.player.relics.has(offer.id) ? 1 : 0;
}

test('热键：数字键（含小键盘）读成"第几张"，R / 回车各归各的', async (t) => {
  const { env, input } = await open(t, 'map');
  assert.equal(press(env, input, 'Digit1').pick, 1, '主键区 1');
  assert.equal(press(env, input, 'Numpad2').pick, 2, '小键盘也得认——右手正在小键盘上的人不该被漏掉');
  assert.equal(press(env, input, 'Digit3').pick, 3);
  assert.equal(press(env, input, 'Digit4').pick, 4);
  assert.equal(press(env, input, 'Digit5').pick, 0, '没接的键不该凭空变成"第 5 张"');
  assert.equal(press(env, input, 'KeyR').reroll, true);
  assert.equal(press(env, input, 'Enter').confirm, true);
  assert.equal(press(env, input, 'NumpadEnter').confirm, true, '小键盘的回车也是回车');

  // 一次性：按住不放（浏览器会连着发 keydown）不该连着选两张卡
  env.dispatch('keydown', { code: 'Digit2' });
  input.update();
  assert.equal(input.state.pick, 2, '按下的那一帧要能读到');
  input.endFrame();
  env.dispatch('keydown', { code: 'Digit2', repeat: true });
  input.update();
  assert.equal(input.state.pick, 0, '按住不放（repeat）不算新的一次按下');
});

test('热键：升级面板按 2 = 点第二张卡（不是第一张、也不是"随手一张"）', async (t) => {
  const { game } = await open(t, 'levelup');
  game.gainXp(game.xpToNext + 1);
  assert.equal(game.state, 'levelup');
  const [first, second] = game.currentOffers;
  assert.ok(second, '得有第二张卡，这条断言才量得出"按的是第二张"');
  const firstBefore = levelOf(game, first);
  const secondBefore = levelOf(game, second);

  game.panelHotkeys(2, false);
  assert.equal(game.state, 'playing', '选完就该回到战场（不是停在那儿等）');
  assert.ok(levelOf(game, second) > secondBefore, `按 2 之后该长一级的是第二张（${second.kind}:${second.id}）`);
  assert.equal(levelOf(game, first), firstBefore, `第一张不该被顺手也长一级（${first.kind}:${first.id}）`);
});

test('热键：R 只在该重掷的地方花掉重掷点', async (t) => {
  const { game } = await open(t, 'reroll');
  game.rerollsLeft = 2;

  // 战场上按 R：一次都不许花（重掷点是稀缺资源，被吃掉玩家只会觉得"怎么少了"）
  assert.equal(game.state, 'playing');
  game.panelHotkeys(0, true);
  assert.equal(game.rerollsLeft, 2, '战场上按 R 不该白吃一次重掷');
  game.reroll(); // 直接调也一样——门禁在规则里，不在调用点
  assert.equal(game.rerollsLeft, 2, '不在升级面板时，reroll() 自己就该拒绝');

  // 升级面板里按 R：花一次，而且三张卡真的换了
  game.gainXp(game.xpToNext + 1);
  assert.equal(game.state, 'levelup');
  // ⚠ 升级面板一打开就会把重掷点重置成"局外解锁的那一份"（见 openLevelUp），
  //   所以在**打开之后**再发牌，否则上面那句赋值会被它悄悄冲掉。
  game.rerollsLeft = 2;
  const before = game.currentOffers.map((o) => `${o.kind}:${o.id}`).join(',');
  game.panelHotkeys(0, true);
  assert.equal(game.rerollsLeft, 1, '升级面板里按 R 该花掉一次');
  const after = game.currentOffers.map((o) => `${o.kind}:${o.id}`).join(',');
  assert.notEqual(after, before, `重掷得真的换掉那三张卡（还是 ${after}）`);
  assert.ok(game.currentOffers.length > 0, '重掷之后得还有卡可选');
});

test('重掷：面板要跟着重画（不然屏幕上留着上一把牌）', async (t) => {
  const { game, ui } = await open(t, 'redraw');
  game.gainXp(game.xpToNext + 1);
  game.rerollsLeft = 3;
  const before = game.currentOffers.map((o) => `${o.kind}:${o.id}`);
  game.reroll();
  const after = game.currentOffers.map((o) => `${o.kind}:${o.id}`);
  assert.notEqual(after.join(','), before.join(','), '重掷该真的换掉那三张卡');

  // 屏幕上写的必须就是**新那三张**。这不是洁癖：卡片点下去时按屏幕上那个 id 回 `offers` 里找，
  // 找不到就 `return`——"数据换了、画没换"的结果是一块看着好好的、却一张都点不动的面板
  // （真实浏览器里撞到过，见 README 的「已知取舍」）。
  const html = ui.screen.innerHTML;
  for (const key of after) assert.ok(html.includes(key), `面板上该写着新抽到的 ${key}`);
  const stale = before.filter((k) => !after.includes(k) && html.includes(k));
  assert.deepEqual(stale, [], `上一把的牌不该还留在屏幕上（${stale.join(',')}）`);
});

test('热键：祭坛按第 n 件供物，动的正是那一件说的数', async (t) => {
  const { game } = await open(t, 'shrine');
  const shrine = { x: 0, y: 0, used: false, prompted: false };
  game.openShrine(shrine);
  assert.equal(game.state, 'shrine', '祭坛该开在"选了才走"的状态上');

  const offer = game.shrineOffers[1];
  assert.ok(offer, '得有第二件供物，才量得出"按的是第二件"');
  const before = { ...game.player.shrineMods, gold: game.gold, relics: game.player.relics.size };
  game.panelHotkeys(2, false);

  assert.equal(game.state, 'playing', '选完祭坛就该回到战场');
  assert.equal(shrine.used, true, '这件供物得真的用掉（不然玩家能回来再拿一次）');
  const after = { ...game.player.shrineMods, gold: game.gold, relics: game.player.relics.size };
  // 五件供物各改一样东西：量"那一件说的数"动没动，才证明按的是**那一件**
  const moved = {
    blood_pact: after.maxHpMult < before.maxHpMult && after.relics > before.relics,
    kindle: after.damageMult > before.damageMult,
    tithe: after.gold > before.gold,
    vigil: game.player.hp > 0, // 回血 60%：开局满血，量它回满了油更实在（下面单独断言）
    fasting: after.oilDecayMult < before.oilDecayMult,
  }[offer.id];
  assert.ok(moved, `按 2 之后生效的该是第二件「${offer.name}」（${offer.id}）`);
});

test('热键：商店按第 n 件买第 n 件、R 刷新，且只认自己的那点金币', async (t) => {
  const { game } = await open(t, 'shop');
  game.gold = 500;
  game.openShop('测试 · 补给站');
  assert.equal(game.state, 'shop');
  const price = game.shopItems[1]?.price ?? 0;
  assert.ok(game.shopItems[1] && price <= 500, `第二件得买得起才量得出来（价 ${price}）`);

  game.panelHotkeys(2, false);
  assert.equal(game.shopItems[1].sold, true, '按 2 买的该是第二件');
  assert.equal(game.shopItems[0].sold, false, '第一件不该动');
  assert.equal(game.gold, 500 - price, '扣的该正好是那一件的价');

  const beforeReroll = game.gold;
  game.panelHotkeys(0, true);
  assert.equal(game.gold, beforeReroll - 8, 'R 刷新商品：一口价 8 金币');
  assert.ok(game.shopItems.every((it) => !it.sold), '刷新之后货架是新的（旧的都换掉了）');

  // 同一件再按一次：它已经卖掉了，不该再扣一遍钱
  const goldBefore = game.gold;
  const price0 = game.shopItems[0].price;
  game.panelHotkeys(1, false);
  assert.equal(game.shopItems[0].sold, true);
  assert.equal(game.gold, goldBefore - price0);
  game.panelHotkeys(1, false);
  assert.equal(game.gold, goldBefore - price0, '已经卖掉的商品再按一次不该再扣一遍钱');

  // 不在商店里：连金币都不该看一眼
  game.state = 'playing';
  const gold = game.gold;
  game.panelHotkeys(0, true);
  assert.equal(game.gold, gold, '不在商店里时 R 不该扣金币刷新商品');
});

test('热键：结算面板的回车走"主按钮"，别处按了不该有动作', async (t) => {
  const { game, ui } = await open(t, 'confirm');
  assert.equal(game.state, 'playing');
  assert.equal(ui.panelPrimary(), false, '战斗中回车不该有动作');

  game.player.revives = 0;
  game.player.hp = -1;
  game.update(1 / 60);
  assert.equal(game.state, 'dead', '血空了就该进结算');
  assert.equal(ui.panelPrimary(), true);
  assert.equal(game.state, 'select', '死亡面板的回车 = "再点一盏"（去选灯火）');

  // 通关面板：回车 = "挑战无尽之夜"，而且要把无尽这个开关拨上去
  game.state = 'victory';
  assert.equal(ui.panelPrimary(), true);
  assert.equal(game.state, 'select');
  assert.equal(ui.endless, true, '"挑战无尽之夜"按下之后，选灯火那一屏得是"无尽之夜"');
});
