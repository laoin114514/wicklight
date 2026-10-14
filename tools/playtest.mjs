/**
 * 真实浏览器实测：用 Playwright 驱动真 Chromium 打开构建产物，
 * 用真实键盘/鼠标走一遍「菜单 → 选灯火 → 战斗 → 升级 → 暂停 → 商店 → 祭坛 → 死亡 → 局外」，
 * 并对每一屏做布局与像素校验，最后把截图写到 /tmp/wl/shots/。
 *
 *   node tools/playtest.mjs [--headed] [--keep]
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SHOTS = '/tmp/wl/shots';

function loadPlaywright() {
  for (const spec of ['playwright-core', 'playwright']) {
    try {
      return require(spec);
    } catch {
      /* try next */
    }
  }
  throw new Error('需要 playwright-core 才能跑真实浏览器实测');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let path = join(DIST, normalize(url));
      if (!path.startsWith(DIST)) return void res.writeHead(403).end('Forbidden');
      let info = await stat(path).catch(() => null);
      if (info?.isDirectory()) {
        path = join(path, 'index.html');
        info = await stat(path).catch(() => null);
      }
      if (!info) return void res.writeHead(404).end('Not found');
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(await readFile(path));
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const failures = [];
const checks = [];
const ok = (name, extra = '') => checks.push(`  ✔ ${name}${extra ? ` — ${extra}` : ''}`);
const fail = (name, detail) => {
  failures.push(`${name}: ${detail}`);
  checks.push(`  ✖ ${name} — ${detail}`);
};
const expect = (cond, name, detail = '') => (cond ? ok(name, detail) : fail(name, detail || '断言失败'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const { chromium } = loadPlaywright();
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

  const shot = async (name) => {
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  };

  // 页面内的小工具：布局体检 + 画布像素采样（每个页面都要注入）
  const probeInit = () => {
    window.__PROBE__ = {
      layout(selector) {
        const els = [...document.querySelectorAll(selector)];
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const boxes = els.map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) };
        });
        const issues = [];
        for (const b of boxes) {
          if (b.w <= 0 || b.h <= 0) issues.push(`零尺寸元素 ${JSON.stringify(b)}`);
          if (b.x < -2 || b.y < -2 || b.x + b.w > vw + 2 || b.y + b.h > vh + 2) {
            issues.push(`超出视口 ${JSON.stringify(b)} viewport=${vw}x${vh}`);
          }
        }
        return {
          count: els.length,
          boxes,
          issues,
          hOverflow: document.documentElement.scrollWidth - vw,
          vOverflow: document.documentElement.scrollHeight - vh,
          vw,
          vh,
        };
      },
      canvasStats(sel = '#game') {
        const c = document.querySelector(sel);
        if (!c) return null;
        const ctx = c.getContext('2d');
        const { width: w, height: h } = c;
        const data = ctx.getImageData(0, 0, w, h).data;
        let sum = 0;
        let nonBlack = 0;
        const colors = new Set();
        const step = 4 * 7; // 采样稀疏一点，够用且快
        for (let i = 0; i < data.length; i += step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = (r + g + b) / 3;
          sum += lum;
          if (lum > 12) nonBlack += 1;
          if (colors.size < 4096) colors.add((r >> 3 << 10) | (g >> 3 << 5) | (b >> 3));
        }
        const n = Math.ceil(data.length / step);
        return { w, h, mean: +(sum / n).toFixed(2), litFrac: +(nonBlack / n).toFixed(3), colors: colors.size };
      },
      wraps(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const rects = el.getClientRects();
        return { lines: [...el.getClientRects()].map((r) => Math.round(r.width)), height: Math.round(el.getBoundingClientRect().height), count: rects.length };
      },
      overlaps(a, b) {
        const ea = document.querySelectorAll(a);
        const eb = document.querySelectorAll(b);
        const hits = [];
        for (const x of ea) {
          const ra = x.getBoundingClientRect();
          for (const y of eb) {
            const rb = y.getBoundingClientRect();
            const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (ox > 2 && oy > 2) hits.push(`${a}∩${b} ${Math.round(ox)}x${Math.round(oy)}`);
          }
        }
        return hits;
      },
      text(sel) {
        const el = document.querySelector(sel);
        return el ? el.innerText.slice(0, 400) : null;
      },
      state() {
        const h = window.__WICKLIGHT__;
        return h ? { state: h.game.state, kills: h.game.kills, wave: h.game.wave, gold: h.game.gold, level: h.game.playerLevel } : null;
      },
    };
  };
  await page.addInitScript(probeInit);

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 15000 });
  // 等开机动画结束
  await page.waitForFunction(() => !document.getElementById('boot-screen'), null, { timeout: 15000 }).catch(() => {});
  await sleep(400);

  // ── 1. 主菜单 ──
  const menu = await page.evaluate(() => window.__PROBE__.layout('.panel--menu, .panel'));
  expect(menu.count > 0, '主菜单渲染出来了');
  expect(menu.issues.length === 0, '主菜单元素都在视口内', menu.issues.join('; '));
  expect(menu.hOverflow <= 1 && menu.vOverflow <= 1, '页面无溢出滚动', `h=${menu.hOverflow} v=${menu.vOverflow}`);
  const menuText = await page.evaluate(() => document.body.innerText);
  expect(/开始冒险/.test(menuText), '菜单包含「开始冒险」');
  await shot('01-menu');

  const menuCanvas = await page.evaluate(() => window.__PROBE__.canvasStats());
  expect(menuCanvas && menuCanvas.mean > 6, '菜单画布真的画了东西（不是纯黑）', JSON.stringify(menuCanvas));

  // ── 2. 选灯火 ──
  await page.click('[data-act="play"]');
  await sleep(220);
  const lanterns = await page.evaluate(() => window.__PROBE__.layout('.lantern'));
  expect(lanterns.count >= 4, '灯火选择列出了至少 4 位灯火', `count=${lanterns.count}`);
  await shot('02-select');
  await page.click('[data-lantern="warden"]');
  await page.click('[data-diff="normal"]');
  await sleep(150);
  await shot('03-select-diff');
  await page.click('[data-act="start"]');
  await sleep(700);

  // ── 3. 战斗：真实键盘输入 ──
  const posAt = () =>
    page.evaluate(() => {
      const p = window.__WICKLIGHT__.game.player;
      return { x: Math.round(p.x), y: Math.round(p.y), oil: +p.oilFrac.toFixed(3), r: Math.round(p.lightRadius) };
    });

  const ann = await page.evaluate(() => window.__PROBE__.wraps('.announce'));
  expect(ann && ann.count === 1, '关卡公告是单行（没有折行压住 HUD）', JSON.stringify(ann));

  const p0 = await posAt();
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await sleep(1200);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await sleep(200);
  const p1 = await posAt();
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  expect(moved > 40, '键盘输入真的驱动了角色移动', `位移 ${moved.toFixed(0)}px`);
  expect(p1.oil < p0.oil, '灯油在战斗中持续燃烧', `${p0.oil} → ${p1.oil}`);

  await page.keyboard.press('Space'); // 冲刺
  await sleep(300);
  // 打满一整轮：等敌人走进灯火，再用燃爆收场
  let kills = 0;
  for (let i = 0; i < 10 && kills === 0; i += 1) {
    await page.keyboard.down(i % 2 === 0 ? 'KeyA' : 'KeyD');
    await sleep(700);
    await page.keyboard.up(i % 2 === 0 ? 'KeyA' : 'KeyD');
    await page.keyboard.press('KeyQ'); // 燃爆
    await sleep(900);
    kills = (await page.evaluate(() => window.__WICKLIGHT__.game.kills));
  }

  const play = await page.evaluate(() => window.__PROBE__.state());
  expect(play && play.state === 'playing', '战斗进行中', JSON.stringify(play));
  expect(play && play.kills > 0, '真实按键操作下产生了击杀', `kills=${play.kills}`);
  const hudText = await page.evaluate(() => window.__PROBE__.text('.hud') ?? document.body.innerText.slice(0, 200));
  expect(hudText && hudText.length > 0, 'HUD 有内容');
  const playCanvas = await page.evaluate(() => window.__PROBE__.canvasStats());
  expect(playCanvas && playCanvas.litFrac > 0.02, '战斗画面有实际内容', JSON.stringify(playCanvas));
  const hudLayout = await page.evaluate(() => window.__PROBE__.layout('.hud, .hud__top, .hud__bottom'));
  expect(hudLayout.issues.length === 0, 'HUD 元素都在视口内', hudLayout.issues.join('; '));
  await shot('04-play');

  // ── 4. 暂停 ──
  await page.keyboard.press('Escape');
  await sleep(300);
  const paused = await page.evaluate(() => window.__PROBE__.state());
  expect(paused && paused.state === 'paused', 'Esc 能暂停', JSON.stringify(paused));
  const pauseLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(pauseLayout.issues.length === 0, '暂停面板布局正常', pauseLayout.issues.join('; '));
  await shot('05-pause');
  await page.click('[data-act="resume"]');
  await sleep(250);

  // ── 4b. 构筑总览（Tab）──
  await page.keyboard.press('Tab');
  await sleep(300);
  const sheetState = await page.evaluate(() => window.__PROBE__.state());
  expect(sheetState && sheetState.state === 'loadout', 'Tab 打开构筑总览', JSON.stringify(sheetState));
  const sheetLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(sheetLayout.issues.length === 0, '构筑总览布局正常', sheetLayout.issues.join('; '));
  const sheetText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  expect(sheetText.includes('构筑总览') && sheetText.includes('武器'), '构筑总览列出了武器区', sheetText.slice(0, 60));
  expect(!/undefined|NaN/.test(sheetText), '构筑总览没有缺字段', sheetText.match(/undefined|NaN/g)?.slice(0, 3).join(',') ?? '');
  await shot('05b-loadout');
  await page.keyboard.press('Tab');
  await sleep(250);
  const sheetClosed = await page.evaluate(() => window.__PROBE__.state());
  expect(sheetClosed && sheetClosed.state === 'playing', 'Tab 再按一次回到战斗', JSON.stringify(sheetClosed));

  // ── 5. 升级面板（游戏内真实触发）──
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.gainXp(g.xpToNext + 5);
  });
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'levelup', null, { timeout: 8000 }).catch(() => {});
  const lvlState = await page.evaluate(() => window.__PROBE__.state());
  expect(lvlState && lvlState.state === 'levelup', '获得经验后弹出升级面板', JSON.stringify(lvlState));
  const cards = await page.evaluate(() => window.__PROBE__.layout('[data-offer]'));
  expect(cards.count >= 3, '升级面板给出三张卡', `count=${cards.count}`);
  expect(cards.issues.length === 0, '升级卡都在视口内', cards.issues.join('; '));
  await shot('06-levelup');
  await page.click('[data-offer]');
  await sleep(250);
  // 一次吃到足够经验会连升多级，升级面板会依次弹出下一组 —— 把队列走完再断言
  for (let i = 0; i < 6; i += 1) {
    const st = await page.evaluate(() => window.__PROBE__.state());
    if (!st || st.state !== 'levelup') break;
    await page.click('[data-offer]');
    await sleep(200);
  }
  const afterUp = await page.evaluate(() => window.__PROBE__.state());
  expect(afterUp && afterUp.state === 'playing', '选择升级后回到战斗', JSON.stringify(afterUp));
  const queued = await page.evaluate(() => window.__WICKLIGHT__.game.pendingLevels);
  expect(queued === 0, '升级队列已被清空', `pendingLevels=${queued}`);

  // ── 6. 商店 ──
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.gold = 200;
    g.onStageComplete();
  });
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'shop', null, { timeout: 8000 }).catch(() => {});
  const shopState = await page.evaluate(() => window.__PROBE__.state());
  expect(shopState && shopState.state === 'shop', '通关后进入商店', JSON.stringify(shopState));
  const shopItems = await page.evaluate(() => window.__PROBE__.layout('[data-buy]'));
  expect(shopItems.count > 0, '商店有可购买商品', `count=${shopItems.count}`);
  expect(shopItems.issues.length === 0, '商店商品布局正常', shopItems.issues.join('; '));
  await shot('07-shop');
  const goldBefore = shopState.gold;
  await page.click('[data-buy="0"]');
  await sleep(300);
  const goldAfter = (await page.evaluate(() => window.__PROBE__.state())).gold;
  expect(goldAfter < goldBefore, '购买后金币减少', `${goldBefore} → ${goldAfter}`);
  await page.click('[data-act="leave"]');
  await sleep(900);

  // 进入第二关后，HUD 应出现夜咒芯片（每关随机降临）
  const curse = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const el = document.querySelector('.hud__curse, .js-curse');
    return {
      hasCurse: !!g.curse,
      curseName: g.curse ? g.curse.name : null,
      chipVisible: !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
    };
  });
  expect(curse.hasCurse, '第二关降临了夜咒', String(curse.curseName));
  expect(curse.chipVisible, 'HUD 显示夜咒芯片');
  await shot('07b-curse-hud');

  // ── 7. 祭坛 ──
  const shrineOk = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const s = g.level.shrines.find((x) => !x.used);
    if (!s) return false;
    g.player.hp = g.player.stats.maxHp * 0.5;
    s.x = g.player.x;
    s.y = g.player.y;
    return true;
  });
  if (shrineOk) {
    await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'shrine', null, { timeout: 8000 }).catch(() => {});
    const sh = await page.evaluate(() => window.__PROBE__.state());
    expect(sh && sh.state === 'shrine', '靠近祭坛弹出抉择', JSON.stringify(sh));
    const shrineCards = await page.evaluate(() => window.__PROBE__.layout('[data-shrine]'));
    expect(shrineCards.count === 3, '祭坛给出三张卡', `count=${shrineCards.count}`);
    expect(shrineCards.issues.length === 0, '祭坛卡布局正常', shrineCards.issues.join('; '));
    await shot('08-shrine');
    await page.click('[data-shrine]');
    await sleep(350);
    const afterShrine = await page.evaluate(() => window.__PROBE__.state());
    expect(afterShrine && afterShrine.state === 'playing', '祭坛抉择后回到战斗', JSON.stringify(afterShrine));
  } else {
    fail('祭坛', '这一关没有可用祭坛');
  }

  // ── 8. 死亡结算 ──
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.player.revives = 0;
    g.player.hp = -1;
  });
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'dead', null, { timeout: 8000 }).catch(() => {});
  const dead = await page.evaluate(() => window.__PROBE__.state());
  expect(dead && dead.state === 'dead', '生命归零进入死亡结算', JSON.stringify(dead));
  const deadText = await page.evaluate(() => document.body.innerText);
  expect(/余烬|击杀|波次/.test(deadText), '死亡结算展示了统计信息');
  const deadLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(deadLayout.issues.length === 0, '死亡面板布局正常', deadLayout.issues.join('; '));
  await shot('09-dead');

  // ── 9. 局外成长 / 设置 / 成就 ──
  await page.click('[data-act="menu"]');
  await sleep(400);
  await page.click('[data-act="meta"]');
  await sleep(350);
  const metaNodes = await page.evaluate(() => window.__PROBE__.layout('[data-node]'));
  expect(metaNodes.count > 0, '解锁树有节点', `count=${metaNodes.count}`);
  const metaLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(metaLayout.issues.length === 0, '解锁树布局正常', metaLayout.issues.join('; '));
  await shot('10-meta');
  await page.click('[data-act="back"]');
  await sleep(300);

  await page.click('[data-act="settings"]');
  await sleep(350);
  const settingsLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(settingsLayout.issues.length === 0, '设置面板布局正常', settingsLayout.issues.join('; '));
  await shot('11-settings');
  await page.click('[data-act="back"]');
  await sleep(300);

  await page.click('[data-act="achievements"]');
  await sleep(350);
  const achLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(achLayout.issues.length === 0, '成就面板布局正常', achLayout.issues.join('; '));
  await shot('12-achievements');
  await page.click('[data-act="back"]');
  await sleep(300);

  // ── 10. 无尽模式 + 移动端视口 ──
  await page.evaluate(() => {
    const h = window.__WICKLIGHT__;
    h.game.save.best = 9;
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 15000 });
  await sleep(500);
  await page.click('[data-act="endless"]');
  await sleep(250);
  await page.click('[data-act="start"]');
  await sleep(1200);
  const endless = await page.evaluate(() => window.__PROBE__.state());
  expect(endless && endless.state === 'playing', '无尽之夜能开局', JSON.stringify(endless));
  await sleep(1500);
  await shot('13-endless');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobileErrors = [];
  mobile.on('pageerror', (e) => mobileErrors.push(String(e)));
  await mobile.addInitScript(probeInit);
  await mobile.goto(base, { waitUntil: 'load' });
  await mobile.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 15000 });
  await sleep(900);
  const m = await mobile.evaluate(() => {
    const r = {
      vw: window.innerWidth,
      vh: window.innerHeight,
      hOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panels: [...document.querySelectorAll('.panel, .btn')].map((el) => {
        const b = el.getBoundingClientRect();
        return { w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) };
      }),
    };
    return r;
  });
  expect(m.hOverflow <= 1, '移动端竖屏无横向溢出', `hOverflow=${m.hOverflow}`);
  expect(m.panels.every((p) => p.h > 0), '移动端面板元素有高度');
  await mobile.screenshot({ path: join(SHOTS, '14-mobile-menu.png') });
  await mobile.click('[data-act="play"]');
  await sleep(250);
  await mobile.click('[data-act="start"]');
  await sleep(1500);
  const mobileOverlap = await mobile.evaluate(() => window.__PROBE__.overlaps('#touch-stick', '.hud__build'));
  expect(mobileOverlap.length === 0, '移动端摇杆不遮挡构筑信息', mobileOverlap.join('; '));
  const mobileAnn = await mobile.evaluate(() => window.__PROBE__.wraps('.announce'));
  expect(!mobileAnn || mobileAnn.count <= 1, '移动端公告不折行', JSON.stringify(mobileAnn));

  const touchVisible = await mobile.evaluate(() => {
    const t = document.getElementById('touch-root');
    return t ? getComputedStyle(t).display : 'missing';
  });
  expect(touchVisible !== 'missing', '移动端存在触摸控件');
  await mobile.screenshot({ path: join(SHOTS, '15-mobile-play.png') });

  // ── 收尾 ──
  expect(consoleErrors.length === 0, '无 console 错误', consoleErrors.slice(0, 4).join(' | '));
  expect(pageErrors.length === 0, '无未捕获异常', pageErrors.slice(0, 4).join(' | '));
  expect(failedRequests.length === 0, '无资源加载失败', failedRequests.slice(0, 4).join(' | '));
  expect(mobileErrors.length === 0, '移动端无未捕获异常', mobileErrors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  console.log('真实浏览器实测（Chromium）');
  console.log(checks.join('\n'));
  console.log(failures.length === 0 ? `\n全部通过（${checks.length} 项）。截图：${SHOTS}` : `\n失败 ${failures.length} 项`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('playtest 崩溃:', err);
  process.exit(2);
});
