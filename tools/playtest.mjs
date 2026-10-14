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
  // 主菜单按钮排得太长会把页脚挤出面板，这里钉死它
  const menuFits = await page.evaluate(() => {
    const panel = document.querySelector('.panel--menu');
    const foot = document.querySelector('.menu-foot');
    const pb = panel.getBoundingClientRect();
    const fb = foot.getBoundingClientRect();
    return { over: Math.round(fb.bottom - pb.bottom), scroll: Math.round(panel.scrollHeight - panel.clientHeight), h: Math.round(pb.height), vh: window.innerHeight };
  });
  expect(menuFits.over <= 2 && menuFits.scroll <= 2, '主菜单的全部内容都在面板内（不需要滚动）', JSON.stringify(menuFits));

  // ── 1b. 图鉴（编年史）──
  const codexBefore = await page.evaluate(() => window.__WICKLIGHT__.game.codex.seenCount());
  await page.click('[data-act="codex"]');
  await sleep(300);
  const codexLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(codexLayout.issues.length === 0, '图鉴布局正常', codexLayout.issues.join('; '));
  const codexText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  const codexTitle = await page.evaluate(() => document.querySelector('.panel__title')?.textContent ?? '');
  expect(codexText.includes('图鉴 ·'), '图鉴显示总进度', codexTitle);
  const missingSection = ['敌人', '武器', '遗物', '被动', '夜咒', '精英词缀', '灯火', '险境', '关卡'].filter((k) => !codexText.includes(k));
  expect(missingSection.length === 0, '图鉴分区齐全', missingSection.join(','));
  expect(!/undefined|NaN/.test(codexText), '图鉴没有缺字段', codexText.match(/undefined|NaN/g)?.slice(0, 2).join(',') ?? '');
  expect(codexText.includes('尚未发现'), '未发现的条目显示为占位');
  expect(codexText.includes('遇上后记录'), '险境一章写明它是"遇上才记录"的');
  const codexCards = await page.evaluate(() => document.querySelectorAll('.cx').length);
  expect(codexCards >= 100, '图鉴列出了全部条目', `${codexCards} 张卡`);
  await shot('01b-codex');

  // 刚开局一条都还没发现，所以这时候不该有任何可点开的条目
  const freshCards = await page.evaluate(() => document.querySelectorAll('[data-cx]').length);
  expect(freshCards === 0, '全新存档下没有可点开的条目', `${freshCards} 条`);

  await page.click('[data-act="back"]');
  await sleep(250);

  // ── 1c. 生涯档案 ──
  await page.click('[data-act="records"]');
  await sleep(300);
  const recLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(recLayout.issues.length === 0, '生涯档案布局正常', recLayout.issues.join('; '));
  const recText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  expect(recText.includes('生涯档案'), '生涯档案标题正确');
  const recParts = ['个人纪录', '灯火战绩', '最近对局', '累计击杀', '最高连杀', '完成悬赏'].filter((k) => !recText.includes(k));
  expect(recParts.length === 0, '生涯档案分区齐全', recParts.join(','));
  expect(!/undefined|NaN/.test(recText), '生涯档案没有缺字段', recText.match(/undefined|NaN/g)?.slice(0, 2).join(',') ?? '');
  const recLanterns = await page.evaluate(() => document.querySelectorAll('.rec-lantern').length);
  expect(recLanterns >= 4, '生涯档案列出了全部灯火', `${recLanterns} 盏`);
  await shot('01c-records');
  await page.click('[data-act="back"]');
  await sleep(250);

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

  // ── 3b. 窗口尺寸：后备缓冲必须跟着窗口走 ──
  // 旧实现里"倍率没变就提前返回"，后备缓冲会停在 1280×720，
  // 浏览器只好把它拉伸到窗口大小 —— 画面整体发虚、镜头中心还会偏。
  await page.setViewportSize({ width: 1600, height: 900 });
  await sleep(600);
  const sized = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const r = g.renderer;
    const c = r.canvas;
    const rect = c.getBoundingClientRect();
    const s = g.camera.worldToScreen(g.player.x, g.player.y);
    return {
      rect: [Math.round(rect.width), Math.round(rect.height)],
      style: [c.style.width, c.style.height],
      buf: [c.width, c.height],
      expect: [Math.round(r.width * r.dpr), Math.round(r.height * r.dpr)],
      dpr: r.dpr,
      center: [Math.round(s.x), Math.round(s.y)],
      half: [Math.round(r.width / 2), Math.round(r.height / 2)],
    };
  });
  expect(
    sized.buf[0] === sized.expect[0] && sized.buf[1] === sized.expect[1],
    '窗口变大后后备缓冲跟着走（不是被 CSS 拉伸）',
    JSON.stringify(sized),
  );
  expect(sized.rect[0] === 1600 && sized.rect[1] === 900, 'canvas 的 CSS 尺寸等于窗口', JSON.stringify(sized));
  expect(
    Math.abs(sized.center[0] - sized.half[0]) <= 40 && Math.abs(sized.center[1] - sized.half[1]) <= 40,
    '窗口变大后角色仍在视野中心',
    JSON.stringify(sized),
  );
  await shot('03b-resize-1600x900');
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(500);

  await page.keyboard.press('Space'); // 冲刺
  await sleep(300);
  // 先走完可能已经排队的升级面板：真实击杀会不会刚好升级取决于时序，
  // 不排空的话 Esc / Tab 会被升级面板挡下，测试就变成看运气。
  const drainLevelUps = async () => {
    for (let i = 0; i < 6; i += 1) {
      const st = await page.evaluate(() => window.__PROBE__.state());
      if (!st || st.state !== 'levelup') return;
      await page.click('[data-offer]');
      await sleep(220);
    }
  };

  // 打满一整轮：等敌人走进灯火，再用燃爆收场
  let kills = 0;
  for (let i = 0; i < 10 && kills === 0; i += 1) {
    await drainLevelUps();
    await page.keyboard.down(i % 2 === 0 ? 'KeyA' : 'KeyD');
    await sleep(700);
    await page.keyboard.up(i % 2 === 0 ? 'KeyA' : 'KeyD');
    await page.keyboard.press('KeyQ'); // 燃爆
    await sleep(900);
    kills = (await page.evaluate(() => window.__WICKLIGHT__.game.kills));
  }
  await drainLevelUps();

  const play = await page.evaluate(() => window.__PROBE__.state());
  expect(play && play.state === 'playing', '战斗进行中', JSON.stringify(play));
  expect(play && play.kills > 0, '真实按键操作下产生了击杀', `kills=${play.kills}`);

  // ── 悬赏：HUD 上应常驻一张本关悬赏，并且进度真的在动 ──
  const bounty = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const st = g.bounties.state;
    const el = document.querySelector('.hud__bounty');
    const r = el?.getBoundingClientRect();
    return st
      ? { name: st.def.name, kind: st.kind, target: st.target, progress: st.progress, done: st.done, text: el?.textContent ?? '', on: el?.classList.contains('is-on') ?? false, w: Math.round(r?.width ?? 0), left: Math.round(r?.left ?? 0) }
      : null;
  });
  expect(!!bounty, '开局就贴了一张悬赏');
  expect(bounty.text.includes(bounty.name), 'HUD 悬赏芯片显示了悬赏名', bounty.text);
  expect(bounty.on, '悬赏芯片可见');
  expect(bounty.left >= 0 && bounty.left + bounty.w <= 1280, '悬赏芯片没有溢出视口', JSON.stringify(bounty));
  const clash = await page.evaluate(() => window.__PROBE__.overlaps('.hud__topleft', '.hud__bounty'));
  expect(clash.length === 0, '悬赏追踪不压住左上角状态条', clash.join('; '));
  const bountyLayout = await page.evaluate(() => window.__PROBE__.layout('.hud__bounty'));
  expect(bountyLayout.issues.length === 0, '悬赏芯片布局正常', bountyLayout.issues.join('; '));

  // ── 灯台：本关的探索目标要真的在场，HUD 也要报得出进度 ──
  const pyre = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const el = document.querySelector('.hud__pyre');
    const r = el?.getBoundingClientRect();
    return {
      total: g.pyreTotal,
      lit: g.pyresLit,
      level: g.level.pyres.length,
      text: el?.textContent ?? '',
      on: el?.classList.contains('is-on') ?? false,
      w: Math.round(r?.width ?? 0),
      left: Math.round(r?.left ?? 0),
    };
  });
  expect(pyre.level >= 3 && pyre.total === pyre.level, '本关散布着若干待点亮的灯台', JSON.stringify(pyre));
  expect(pyre.on && pyre.text.includes('灯台'), 'HUD 显示灯台进度', pyre.text);
  expect(pyre.left >= 0 && pyre.left + pyre.w <= 1280, '灯台芯片没有溢出视口', JSON.stringify(pyre));
  const pyreClash = await page.evaluate(() => window.__PROBE__.overlaps('.hud__bounty', '.hud__pyre'));
  expect(pyreClash.length === 0, '灯台芯片不压住悬赏', pyreClash.join('; '));
  const pyreLayout = await page.evaluate(() => window.__PROBE__.layout('.hud__pyre'));
  expect(pyreLayout.issues.length === 0, '灯台芯片布局正常', pyreLayout.issues.join('; '));
  const hudText = await page.evaluate(() => window.__PROBE__.text('.hud') ?? document.body.innerText.slice(0, 200));
  expect(hudText && hudText.length > 0, 'HUD 有内容');
  const playCanvas = await page.evaluate(() => window.__PROBE__.canvasStats());
  expect(playCanvas && playCanvas.litFrac > 0.02, '战斗画面有实际内容', JSON.stringify(playCanvas));
  const hudLayout = await page.evaluate(() => window.__PROBE__.layout('.hud, .hud__top, .hud__bottom'));
  expect(hudLayout.issues.length === 0, 'HUD 元素都在视口内', hudLayout.issues.join('; '));

  // ── 首次遭遇提示：精英登场时要给一句"怎么打" ──
  const tip = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.tips = [];
    g.enemies.clear();
    const e = g.enemies.spawn('wickmother', g.player.x + 260, g.player.y, 1, 1);
    g.applyAffix(e, 'warded');
    g.scanEncounters();
    g.enemies.clear();
    const el = [...document.querySelectorAll('.toast--tip')].pop();
    const r = el?.getBoundingClientRect();
    return {
      text: (el?.innerText ?? '').replace(/\n/g, ' '),
      w: Math.round(r?.width ?? 0),
      h: Math.round(r?.height ?? 0),
      left: Math.round(r?.left ?? 0),
      right: Math.round(r?.right ?? 0),
    };
  });
  expect(/烛母/.test(tip.text) && /咒盾/.test(tip.text), '首次遇到精英弹出提示卡', tip.text);
  expect(tip.w > 0 && tip.h > 0 && tip.left >= 0 && tip.right <= 1280, '提示卡有尺寸且在视口内', JSON.stringify(tip));
  await shot('04b-tip');

  // ── 新险境：荆棘回廊（围住你，只留一道缝）与寒潮（霜冻拖慢你）──
  const bramble = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.hazards.length = 0;
    g.grounds.length = 0;
    g.handleHazard('bramble');
    const thorns = g.hazards.filter((h) => h.kind === 'thorn');
    const angles = thorns
      .map((h) => (Math.atan2(h.y - g.player.y, h.x - g.player.x) + Math.PI * 2) % (Math.PI * 2))
      .sort((a, b) => a - b);
    let widest = 0;
    for (let i = 0; i < angles.length; i += 1) {
      const next = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
      widest = Math.max(widest, next - angles[i]);
    }
    return { count: thorns.length, widest: Math.round((widest * 180) / Math.PI) };
  });
  expect(bramble.count === 11 && bramble.widest > 80, '荆棘回廊围住玩家并留出一道缝', JSON.stringify(bramble));
  await shot('04c-bramble');

  const coldfront = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.hazards.length = 0;
    g.grounds.length = 0;
    g.handleHazard('coldfront');
    g.hitStop = 0;
    const f = g.grounds.find((x) => x.kind === 'frost');
    g.player.x = f.x;
    g.player.y = f.y;
    g.update(1 / 60);
    return {
      frost: g.grounds.filter((x) => x.kind === 'frost').length,
      slow: Number(g.player.terrainSlow.toFixed(2)),
      oil: Number(g.player.terrainOil.toFixed(2)),
      hp: g.player.hp > 0,
    };
  });
  expect(coldfront.frost === 5, '寒潮铺下霜冻地带', JSON.stringify(coldfront));
  expect(coldfront.slow < 1 && coldfront.oil > 1 && coldfront.hp, '踩进霜冻会变慢且更费油，但不掉血', JSON.stringify(coldfront));
  await shot('04d-coldfront');
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.hazards.length = 0;
    g.grounds.length = 0;
  });

  await drainLevelUps();

  // ── 首次走进一关：主题 / 险境 / 首领一起说清楚（v20）──
  const stageTip = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const stages = window.__WICKLIGHT__.catalog.stages;
    g.save.tips = [];
    g.hitStop = 0;
    g.loadStage(stages[1], 1, false);
    const el = [...document.querySelectorAll('.toast--tip')].pop();
    const r = el?.getBoundingClientRect();
    const text = (el?.innerText ?? '').replace(/\n/g, ' ');
    const recorded = g.save.tips.includes('stage:ashenkeep');
    g.loadStage(stages[0], 0, false); // 回到第一关，后面的流程照旧
    const back = [...document.querySelectorAll('.toast--tip')].pop();
    const seen = g.save.tips.slice();
    return {
      text,
      recorded,
      seen,
      w: Math.round(r?.width ?? 0),
      h: Math.round(r?.height ?? 0),
      left: Math.round(r?.left ?? 0),
      right: Math.round(r?.right ?? 0),
      back: (back?.innerText ?? '').replace(/\n/g, ' '),
    };
  });
  expect(/关卡 · 残堡/.test(stageTip.text), '首次走进一关弹出「关卡」提示卡', stageTip.text);
  expect(/塌方/.test(stageTip.text) && !/collapse/.test(stageTip.text), '险境用中文名写出来，不露原始 id', stageTip.text);
  expect(/熄灯者/.test(stageTip.text), '关卡提示写出这一关的首领名', stageTip.text);
  expect(stageTip.w > 0 && stageTip.h > 0 && stageTip.left >= 0 && stageTip.right <= 1280, '关卡提示卡有尺寸且在视口内', JSON.stringify(stageTip));
  expect(stageTip.recorded && stageTip.seen.includes('stage:ashenkeep'), '关卡提示写进存档（stage:ashenkeep）', JSON.stringify(stageTip.seen));
  expect(/关卡 · 幽林/.test(stageTip.back), '回到第一关也会补上它自己的说明', stageTip.back);
  await shot('04e-stage-tip');

  // ── 吹灯客：点亮灯台会招来专门扑灯台的东西 ──
  const snuffer = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const pyre = g.level.pyres[0];
    g.enemies.clear();
    g.player.x = pyre.x;
    g.player.y = pyre.y;
    for (let i = 0; i < 90; i += 1) g.updatePyres(1 / 60);
    const list = [];
    g.enemies.forEach((e) => list.push(e));
    const one = list.find((e) => e.defId === 'snuffer');
    const before = one ? Math.hypot(one.x - pyre.x, one.y - pyre.y) : 0;
    // 把人挪远：它该扑的是灯，不是玩家
    if (one) {
      g.player.x = pyre.x + 900;
      g.player.y = pyre.y;
      for (let i = 0; i < 30; i += 1) g.enemies.update(1 / 60, g.enemyCtx());
    }
    const after = one ? Math.hypot(one.x - pyre.x, one.y - pyre.y) : 0;
    const out = {
      lit: pyre.lit,
      flame: pyre.flame,
      snuffers: list.filter((e) => e.defId === 'snuffer').length,
      others: list.filter((e) => e.defId !== 'snuffer').length,
      before: Math.round(before),
      after: Math.round(after),
    };
    // 收干净：熄灭这座灯台、清场、把人放回中心，后面的流程照旧
    g.extinguishPyre(pyre);
    g.enemies.clear();
    g.player.x = 0;
    g.player.y = 0;
    out.afterCleanup = { lit: pyre.lit, pyresLit: g.pyresLit };
    return out;
  });
  expect(snuffer.lit && snuffer.flame === 1, '灯台点亮后灯焰是满的', JSON.stringify(snuffer));
  expect(snuffer.snuffers >= 1, '点灯会招来吹灯客', JSON.stringify(snuffer));
  expect(snuffer.others > 0, '点灯的动静照旧会叫来普通敌人', JSON.stringify(snuffer));
  expect(snuffer.after < snuffer.before, '吹灯客直奔灯台，而不是扑向玩家', JSON.stringify(snuffer));
  expect(snuffer.afterCleanup.lit === false && snuffer.afterCleanup.pyresLit === 0, '熄灭后灯台与计数都归位', JSON.stringify(snuffer.afterCleanup));
  await shot('04f-snuffer');

  await drainLevelUps();

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
  await drainLevelUps();
  await page.keyboard.press('Tab');
  await sleep(300);
  const sheetState = await page.evaluate(() => window.__PROBE__.state());
  expect(sheetState && sheetState.state === 'loadout', 'Tab 打开构筑总览', JSON.stringify(sheetState));
  const sheetLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(sheetLayout.issues.length === 0, '构筑总览布局正常', sheetLayout.issues.join('; '));
  const sheetText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  expect(sheetText.includes('构筑总览') && sheetText.includes('武器'), '构筑总览列出了武器区', sheetText.slice(0, 60));
  expect(sheetText.includes('进化路线'), '构筑总览列出了进化路线');
  expect(/武器 \d+\/\d+/.test(sheetText), '进化路线写明了武器等级进度');
  expect(!/undefined|NaN/.test(sheetText), '构筑总览没有缺字段', sheetText.match(/undefined|NaN/g)?.slice(0, 3).join(',') ?? '');
  expect(sheetText.includes('灯火共鸣'), '构筑总览列出了灯火共鸣一栏');
  await shot('05b-loadout');

  // 灯火共鸣：每一族都要写出「还差几件」；凑齐一族后那一族应被点亮
  const resonance = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const local = (sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent.trim());
    const before = local('.lo-tri');
    const prev = [...g.player.relics];
    g.player.relics.clear();
    for (const id of ['thornring', 'scope', 'whetstone']) g.player.addRelic(id);
    g.ui.showScreen('loadout');
    const on = local('.lo-tri.is-on');
    const box = document.querySelector('.panel--loadout') || document.querySelector('.panel');
    const r = box.getBoundingClientRect();
    const out = {
      before,
      on,
      w: r.width,
      h: r.height,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      bad: /undefined|NaN/.test(box.textContent),
    };
    // 还原，别把这一局改花
    g.player.relics.clear();
    for (const id of prev) g.player.addRelic(id);
    g.ui.showScreen('loadout');
    return out;
  });
  expect(resonance.before.length >= 3, '灯火共鸣列出了每一族', resonance.before.join(' | '));
  expect(resonance.before.every((x) => /还差|再集|已满/.test(x)), '每一族都写明下一档还差几件', resonance.before.join(' | '));
  expect(resonance.on.length === 1 && /焰火/.test(resonance.on[0]), '凑齐一族的遗物后面板点亮该族', JSON.stringify(resonance.on));
  expect(resonance.w > 0 && resonance.h > 0 && resonance.overflow <= 1 && !resonance.bad, '共鸣面板有尺寸且不溢出', JSON.stringify(resonance));
  await shot('05c-resonance');
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

  // ── 6b. 熔铸台：真的把一件已有遗物换掉 ──
  const forge = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.gold = Math.max(g.gold, 400);
    g.forgeUsed = false;
    g.ui.showScreen('shop'); // 金币变了，重画一次面板
    const chips = window.__PROBE__.layout('[data-forge]');
    return {
      owned: [...g.player.relics],
      hasBlock: !!document.querySelector('.forge'),
      chips: chips.count,
      chipsOk: chips.issues.length === 0,
      price: g.forgePrice,
      gold: g.gold,
    };
  });
  expect(forge.hasBlock, '商店面板出现熔铸台');
  expect(forge.chips > 0 && forge.chips === forge.owned.length, '熔铸台列出全部已有遗物', JSON.stringify(forge));
  expect(forge.chipsOk, '熔铸台布局正常');
  const forgeResult = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const before = [...g.player.relics];
    window.__PROBE__.forgeBefore = before;
    window.__PROBE__.forgeGold = g.gold;
    return before;
  });
  await page.click(`[data-forge="${forgeResult[0]}"]`);
  await sleep(300);
  const after = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const before = window.__PROBE__.forgeBefore;
    return {
      used: g.forgeUsed,
      goldBefore: window.__PROBE__.forgeGold,
      gold: g.gold,
      size: g.player.relics.size,
      beforeSize: before.length,
      swapped: before.filter((r) => !g.player.relics.has(r)).length,
    };
  });
  expect(after.used, '熔铸后本店标记为已熔铸');
  expect(after.gold < after.goldBefore, '熔铸扣了金币', `${after.goldBefore} → ${after.gold}`);
  expect(after.size === after.beforeSize && after.swapped >= 1, '熔铸是"换一件"而不是凭空增减', JSON.stringify(after));
  await shot('07c-shop-forge');
  const forgeLayout = await page.evaluate(() => window.__PROBE__.layout('.forge'));
  expect(forgeLayout.issues.length === 0, '熔铸台在面板里没有溢出', forgeLayout.issues.join('; '));
  await page.click('[data-act="leave"]');
  await sleep(400);

  // ── 6c. 夜咒岔口：下一关的夜咒由玩家自己挑一条 ──
  const curseChoice = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const cards = [...document.querySelectorAll('[data-curse]')];
    const box = document.querySelector('.panel--curse');
    return {
      state: g.state,
      ids: cards.map((c) => c.dataset.curse),
      golds: cards.map((c) => c.querySelector('.curse-card__gold')?.textContent ?? ''),
      rebate: [...g.curseOffers].map((c) => c.goldMult),
      hasPanel: !!box,
      w: box ? Math.round(box.getBoundingClientRect().width) : 0,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      bad: /undefined|NaN/.test(box ? box.textContent : ''),
    };
  });
  expect(curseChoice.state === 'curse', '离开商店后进入夜咒岔口', curseChoice.state);
  expect(
    curseChoice.ids.length === 3 && new Set(curseChoice.ids).size === 3,
    '夜咒岔口给出三条不同的夜咒',
    curseChoice.ids.join(','),
  );
  expect(curseChoice.golds.every((t) => /金币 ×\d/.test(t)), '每条夜咒都标出金币回报', curseChoice.golds.join(' | '));
  expect(
    curseChoice.rebate.every((v, i, a) => i === 0 || a[i - 1] <= v),
    '夜咒按回报从轻到重排',
    curseChoice.rebate.join(','),
  );
  expect(
    curseChoice.hasPanel && curseChoice.w > 0 && curseChoice.overflow <= 1 && !curseChoice.bad,
    '夜咒岔口布局正常',
    JSON.stringify(curseChoice),
  );
  await shot('07d-curse-choice');

  // 挑回报最高的那一条，落地的夜咒必须就是它挑的
  const picked = curseChoice.ids[curseChoice.ids.length - 1];
  await page.click(`[data-curse="${picked}"]`);
  await sleep(900);

  // 进入第二关后，HUD 应出现夜咒芯片，而且正是玩家挑的那条
  const curse = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const el = document.querySelector('.hud__curse, .js-curse');
    return {
      state: g.state,
      hasCurse: !!g.curse,
      curseId: g.curse ? g.curse.id : null,
      curseName: g.curse ? g.curse.name : null,
      chipVisible: !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
    };
  });
  expect(curse.state === 'playing', '挑完夜咒进入下一关', curse.state);
  expect(curse.hasCurse && curse.curseId === picked, '落地的夜咒正是玩家挑的那条', `${curse.curseId} vs ${picked}`);
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
    // 走真实伤害路径记下死因（结算要写出"被谁扑灭"），再让灯火熄灭
    g.player.invuln = 0;
    g.damagePlayer(5, g.player.x, g.player.y, 0, 'bulwark');
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
  const deadInfo = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const text = document.querySelector('.panel')?.innerText ?? '';
    return { killer: g.lastKiller ? g.lastKiller.name : null, text };
  });
  expect(!!deadInfo.killer && deadInfo.text.includes(deadInfo.killer), '死亡结算写出了"被谁扑灭"', JSON.stringify(deadInfo.killer));
  expect(/点亮灯台/.test(deadInfo.text) && /最强一击/.test(deadInfo.text), '死亡结算展示了本局高光', deadInfo.text.slice(0, 120));
  expect(!/undefined|NaN/.test(deadInfo.text), '死亡结算没有缺字段', deadInfo.text.slice(0, 120));
  await shot('09-dead');

  // ── 9. 局外成长 / 设置 / 成就 ──
  await page.click('[data-act="menu"]');
  await sleep(400);
  await page.click('[data-act="meta"]');
  await sleep(350);
  const metaNodes = await page.evaluate(() => window.__PROBE__.layout('[data-node]'));
  expect(metaNodes.count >= 16, '解锁树有节点', `count=${metaNodes.count}`);
  const metaLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(metaLayout.issues.length === 0, '解锁树布局正常', metaLayout.issues.join('; '));
  const metaText = await page.evaluate(() => document.querySelector('.panel--meta').textContent || '');
  expect(/旧灯|钱袋|暗视|夜行|薪火/.test(metaText), '解锁树列出了局外成长的新节点', metaText.slice(0, 80));
  expect(!/undefined|NaN/.test(metaText), '解锁树没有缺字段');

  // 买一个：余烬真的会少，而且这一局之后就带上了
  const bought = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.embers = 5000;
    g.ui.showScreen('meta');
    const el = document.querySelector('[data-node="kindling"]');
    const card = el ? el.getBoundingClientRect() : null;
    const before = g.save.embers;
    el?.click();
    return {
      cost: 50,
      before,
      after: g.save.embers,
      owned: g.save.meta.includes('kindling'),
      w: Math.round(card?.width ?? 0),
      h: Math.round(card?.height ?? 0),
    };
  });
  expect(bought.owned && bought.after === bought.before - bought.cost, '买下解锁节点会扣余烬', JSON.stringify(bought));
  expect(bought.w > 0 && bought.h > 0, '解锁节点的卡片有尺寸', JSON.stringify(bought));
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

  // 打了一整局之后，图鉴应该真的长东西了（武器/敌人/遗物都会进来）
  const codexAfter = await page.evaluate(() => window.__WICKLIGHT__.game.codex.seenCount());
  expect(codexAfter > codexBefore, '一整局结束后图鉴有新发现', `${codexBefore} → ${codexAfter}`);
  const codexSaved = await page.evaluate(() => {
    const h = window.__WICKLIGHT__;
    return h.game.save.codex.length;
  });
  expect(codexSaved === codexAfter, '图鉴进度写进了存档', `save=${codexSaved} vs ${codexAfter}`);

  // 生涯档案：这一局应该被记进去，并且刷新了纪录（全新存档的第一局必然是纪录）
  const recAfter = await page.evaluate(() => {
    const s = window.__WICKLIGHT__.game.save;
    return { runs: s.runs, hist: s.history.length, best: s.records.bestKills, combo: s.records.bestCombo, clear: s.history[0]?.cleared, stage: s.history[0]?.stage };
  });
  expect(recAfter.runs >= 1, '生涯档案记录了总局数', JSON.stringify(recAfter));
  expect(recAfter.hist >= 1, '最近对局里出现了这一局', JSON.stringify(recAfter));
  expect(recAfter.best > 0 && recAfter.combo > 0, '这一局刷新了击杀/连杀纪录', JSON.stringify(recAfter));
  expect(recAfter.clear === false, '死亡局在战报里标记为未通关');

  await page.click('[data-act="records"]');
  await sleep(300);
  const recAfterText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  expect(recAfterText.includes('守夜人'), '战报里列出了本局的灯火');
  expect(/第 \d 关/.test(recAfterText), '战报里列出了抵达的关卡', recAfterText.slice(0, 120));
  const recRuns = await page.evaluate(() => document.querySelectorAll('.rec-run').length);
  expect(recRuns >= 1, '最近对局里有条目', `${recRuns} 条`);
  await shot('12b-records');
  await page.click('[data-act="back"]');
  await sleep(300);

  // 打完一局后图鉴里有真东西了 —— 这时候才该点得开、查得到数值
  await page.click('[data-act="codex"]');
  await sleep(300);
  const openCards = await page.evaluate(() => document.querySelectorAll('[data-cx]').length);
  expect(openCards >= 3, '开局扫描 + 一局之后图鉴里出现了可点开的条目', `${openCards} 条`);
  const opened = await page.evaluate(() => {
    const el = document.querySelector('[data-cx]');
    el.click();
    return el.dataset.cx;
  });
  await sleep(280);
  const detailLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(detailLayout.issues.length === 0, '图鉴详情布局正常', detailLayout.issues.join('; '));
  const detailText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  expect(detailText.includes('返回图鉴'), '图鉴详情有返回入口');
  expect(!/undefined|NaN/.test(detailText), '图鉴详情没有缺字段', detailText.match(/undefined|NaN/g)?.slice(0, 2).join(',') ?? '');
  const detailRows = await page.evaluate(() => document.querySelectorAll('.cx-rows > div').length);
  expect(detailRows >= 1, '图鉴详情列出了数值', `${opened} → ${detailRows} 行`);
  await shot('01d-codex-detail');
  await page.click('[data-act="detail-back"]');
  await sleep(260);
  const backToCodex = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  expect(backToCodex.includes('图鉴 ·') && backToCodex.includes('尚未发现'), '从详情返回后回到图鉴目录');
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
  // 无尽进度条：没有分母，但每一轮 5 波，条上要填出"离下一轮首领还有几波"
  const endlessBar = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const q = (sel) => document.querySelector(sel);
    g.wave = 7;
    window.__WICKLIGHT__.hud.update(1 / 60);
    const bar = q('.js-wavebar');
    const fill = q('.js-wavebar i');
    const boss = q('.js-wavebar u');
    const r = bar.getBoundingClientRect();
    return {
      endless: bar.classList.contains('is-endless'),
      fill: Math.round(parseFloat(fill.style.width)),
      bossDisplay: boss.style.display,
      bossW: Math.round(parseFloat(boss.style.width)),
      w: Math.round(r.width),
      scroll: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(endlessBar.endless && endlessBar.fill === 40, '无尽进度条填到这一轮的哪一波', JSON.stringify(endlessBar));
  expect(endlessBar.bossDisplay !== 'none' && endlessBar.bossW > 0, '无尽进度条上首领那一段看得见', JSON.stringify(endlessBar));
  expect(endlessBar.w > 0 && endlessBar.scroll <= 1, '无尽进度条有尺寸且不溢出', JSON.stringify(endlessBar));
  await shot('13-endless');

  // ── 第 5 轮：三位首领同台，血条该一列排下来 ──
  const trioHud = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const stages = window.__WICKLIGHT__.catalog.stages;
    const stage = stages[stages.length - 1];
    g.director.setStage(stage, stages.length - 1);
    g.director.endless = true;
    g.director.wave = 24; // 再走一步就是第 25 波 = 第 5 轮
    g.enemies.clear();
    g.state = 'playing';
    g.hitStop = 0;
    g.director.beginWave(g.directorCtx(stage));
    g.hitStop = 0;
    g.update(1 / 60);
    window.__WICKLIGHT__.hud.update(1 / 60);
    const wrap = document.querySelector('.hud__boss');
    const rows = [...document.querySelectorAll('.hud__boss-row')];
    const r = wrap.getBoundingClientRect();
    return {
      count: rows.length,
      names: rows.map((el) => el.querySelector('.hud__boss-name')?.textContent ?? ''),
      widths: rows.map((el) => Math.round(parseFloat(el.querySelector('.hud__boss-bar i')?.style.width ?? '0'))),
      multi: wrap.classList.contains('is-multi'),
      active: wrap.classList.contains('is-active'),
      left: Math.round(r.left),
      right: Math.round(r.right),
      h: Math.round(r.height),
      vw: window.innerWidth,
    };
  });
  expect(trioHud.count === 3, '三首领同台时 HUD 画出三行血条', JSON.stringify(trioHud));
  expect(new Set(trioHud.names).size === 3 && trioHud.names.every(Boolean), '三行血条各写一位首领的名字', JSON.stringify(trioHud.names));
  expect(trioHud.multi && trioHud.active, '多首领血条带 is-multi 且可见', JSON.stringify(trioHud));
  expect(trioHud.widths.every((w) => w > 0), '每行血条都有血量宽度', JSON.stringify(trioHud.widths));
  expect(trioHud.left >= 0 && trioHud.right <= trioHud.vw && trioHud.h > 0, '多首领血条在视口内且有高度', JSON.stringify(trioHud));
  await shot('13b-endless-trio');

  // ── 11. 今日灯芯：全服同一个夜晚 ──
  await page.evaluate(() => window.__WICKLIGHT__.game.goMenu());
  await sleep(400);
  await page.click('[data-act="daily"]');
  await sleep(350);
  const dailyLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(dailyLayout.issues.length === 0, '今日灯芯面板布局正常', dailyLayout.issues.join('; '));
  const dailyText = await page.evaluate(() => document.getElementById('ui-root').textContent || '');
  const dailyParts = ['今日灯芯', '灯火', '难度', '夜咒', '悬赏', '点燃今日灯芯'].filter((k) => !dailyText.includes(k));
  expect(dailyParts.length === 0, '今日灯芯面板内容齐全', dailyParts.join(','));
  expect(!/undefined|NaN/.test(dailyText), '今日灯芯没有缺字段', dailyText.match(/undefined|NaN/g)?.slice(0, 2).join(',') ?? '');
  await shot('16-daily');
  await page.click('[data-act="daily-start"]');
  await sleep(1300);
  const daily = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const plan = window.__WICKLIGHT__.daily.buildDailyPlan();
    return {
      state: g.state, seed: g.startSeed, planSeed: plan.seed,
      lantern: g.lanternId, planLantern: plan.lantern,
      difficulty: g.difficulty, planDifficulty: plan.difficulty,
      bounty: g.bounties.state ? g.bounties.state.def.id : null, planBounty: plan.bounties[0],
    };
  });
  expect(daily.state === 'playing', '今日灯芯能开局', JSON.stringify(daily));
  expect(daily.seed === daily.planSeed, '今日灯芯使用日期派生的种子', JSON.stringify(daily));
  expect(daily.lantern === daily.planLantern && daily.difficulty === daily.planDifficulty, '灯火与难度来自今日剧本', JSON.stringify(daily));
  expect(daily.bounty === daily.planBounty, '第一关悬赏来自今日剧本', JSON.stringify(daily));
  const dailyClash = await page.evaluate(() => window.__PROBE__.overlaps('.hud__topleft', '.hud__bounty'));
  expect(dailyClash.length === 0, '今日灯芯里 HUD 依然不打架', dailyClash.join('; '));
  await sleep(600);
  await shot('16b-daily-play');

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
  const mTitle = await mobile.evaluate(() => {
    const t = document.querySelector('.panel--menu .title');
    const panel = document.querySelector('.panel--menu');
    if (!t || !panel) return null;
    return { w: Math.round(t.getBoundingClientRect().width), panel: Math.round(panel.clientWidth), scroll: Math.round(panel.scrollWidth), clip: Math.round(panel.scrollWidth - panel.clientWidth) };
  });
  expect(mTitle && mTitle.clip <= 1, '移动端主菜单标题不会被面板切掉', JSON.stringify(mTitle));
  expect(m.panels.every((p) => p.h > 0), '移动端面板元素有高度');

  // 竖屏：一块"把手机横过来"的牌子盖住，主循环停下（不是能跑就行，是根本不该开跑）
  const portrait = await mobile.evaluate(() => {
    const hint = document.getElementById('rotate-hint');
    const cs = hint ? getComputedStyle(hint) : null;
    return {
      on: !!hint && hint.classList.contains('is-on'),
      shown: !!cs && cs.display !== 'none',
      text: hint ? hint.textContent.replace(/\s+/g, '') : '',
      running: !!window.__WICKLIGHT__.loop.running,
    };
  });
  expect(portrait.on && portrait.shown, '手机竖屏必须出现横屏提示', JSON.stringify(portrait));
  expect(portrait.text.includes('横过来'), '横屏提示要把话说清楚', portrait.text);
  expect(portrait.running === false, '竖屏时主循环应当停下（不白烧电）', String(portrait.running));
  const fsBtn = await mobile.evaluate(() => {
    const b = document.getElementById('rotate-fullscreen');
    return b ? { shown: getComputedStyle(b).display !== 'none', label: b.textContent.trim() } : null;
  });
  expect(fsBtn?.shown === true && fsBtn.label.length > 0, '竖屏牌子上要给一个"全屏并横屏"的出口', JSON.stringify(fsBtn));
  await mobile.screenshot({ path: join(SHOTS, '14-mobile-portrait.png') });

  // 横过来：牌子自己消失，循环自己起来
  await mobile.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  const land = await mobile.evaluate(() => {
    const hint = document.getElementById('rotate-hint');
    const cs = hint ? getComputedStyle(hint) : null;
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      hidden: !!cs && cs.display === 'none',
      running: !!window.__WICKLIGHT__.loop.running,
      stick: box('#touch-stick'),
      buttons: box('.touch-buttons'),
    };
  });
  expect(land.hidden, '横屏之后提示自动消失', JSON.stringify(land));
  expect(land.running, '横屏之后主循环自己跑起来');
  const inView = (b) => !!b && b.l >= -1 && b.t >= -1 && b.r <= land.vw + 1 && b.b <= land.vh + 1;
  expect(inView(land.stick), '横屏摇杆整块落在视口内', JSON.stringify(land.stick));
  expect(inView(land.buttons), '横屏按钮整块落在视口内', JSON.stringify(land.buttons));
  await mobile.screenshot({ path: join(SHOTS, '15-mobile-menu.png') });
  expect(await mobile.evaluate(() => window.__WICKLIGHT__.wake.wanted) === false, '菜单里不要常亮（没必要一直占着）');

  await mobile.click('[data-act="play"]');
  await sleep(250);
  await mobile.click('[data-act="start"]');
  await sleep(1500);
  const mobileOverlap = await mobile.evaluate(() => window.__PROBE__.overlaps('#touch-stick', '.hud__build'));
  expect(mobileOverlap.length === 0, '移动端摇杆不遮挡构筑信息', mobileOverlap.join('; '));
  const mobBounty = await mobile.evaluate(() => window.__PROBE__.layout('.hud__bounty'));
  expect(mobBounty.issues.length === 0, '移动端悬赏芯片布局正常', mobBounty.issues.join('; '));
  const mobClash = await mobile.evaluate(() => [
    ...window.__PROBE__.overlaps('.hud__topleft', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.hud__topright', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.hud__build', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.hud__bounty', '.hud__stage'),
  ]);
  expect(mobClash.length === 0, '移动端悬赏芯片不压住状态栏 / 构筑信息 / 关卡名', mobClash.join('; '));
  const mobPyre = await mobile.evaluate(() => window.__PROBE__.layout('.hud__pyre'));
  expect(mobPyre.issues.length === 0, '移动端灯台芯片布局正常', mobPyre.issues.join('; '));
  const mobPyreClash = await mobile.evaluate(() => [
    ...window.__PROBE__.overlaps('.hud__topright', '.hud__pyre'),
    ...window.__PROBE__.overlaps('.hud__build', '.hud__pyre'),
    ...window.__PROBE__.overlaps('.hud__pyre', '.hud__stage'),
    ...window.__PROBE__.overlaps('.hud__bounty', '.hud__pyre'),
  ]);
  expect(mobPyreClash.length === 0, '移动端灯台芯片不压住其它 HUD', mobPyreClash.join('; '));

  const mobileAnn = await mobile.evaluate(() => window.__PROBE__.wraps('.announce'));
  expect(!mobileAnn || mobileAnn.count <= 1, '移动端公告不折行', JSON.stringify(mobileAnn));

  const touchVisible = await mobile.evaluate(() => {
    const t = document.getElementById('touch-root');
    return t ? getComputedStyle(t).display : 'missing';
  });
  expect(touchVisible !== 'missing', '移动端存在触摸控件');
  const landHud = await mobile.evaluate(() => [
    ...window.__PROBE__.overlaps('#touch-stick', '.touch-buttons'),
    ...window.__PROBE__.overlaps('#touch-stick', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.touch-buttons', '.hud__pyre'),
    ...window.__PROBE__.overlaps('.hud__build', '#touch-stick'),
  ]);
  expect(landHud.length === 0, '横屏下摇杆 / 按钮 / HUD 互不打架', landHud.join('; '));
  await mobile.screenshot({ path: join(SHOTS, '16-mobile-play.png') });

  // 打一半把手机竖过来：提示要出现、主循环要停、而且得自己先暂停（不能接着挨打）
  await mobile.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  const midPortrait = await mobile.evaluate(() => ({
    state: window.__WICKLIGHT__.game.state,
    running: !!window.__WICKLIGHT__.loop.running,
    hint: document.getElementById('rotate-hint')?.classList.contains('is-on') ?? null,
    wake: window.__WICKLIGHT__.wake.wanted,
  }));
  expect(midPortrait.hint === true, '打一半竖过来：横屏提示要立刻出现', JSON.stringify(midPortrait));
  expect(midPortrait.running === false, '打一半竖过来：主循环要停', JSON.stringify(midPortrait));
  expect(midPortrait.state === 'paused', '打一半竖过来会自己暂停', midPortrait.state);
  expect(midPortrait.wake === false, '停跑之后要把屏幕常亮放掉（别白占着）', JSON.stringify(midPortrait));

  await mobile.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  const backLand = await mobile.evaluate(() => ({
    state: window.__WICKLIGHT__.game.state,
    running: !!window.__WICKLIGHT__.loop.running,
    hint: document.getElementById('rotate-hint')?.classList.contains('is-on') ?? null,
  }));
  expect(backLand.running === true && backLand.hint === false, '转回横屏：提示消失、主循环接着跑', JSON.stringify(backLand));
  expect(backLand.state === 'paused', '转回横屏后停在暂停面板上（由玩家决定何时继续）', backLand.state);

  // 接着打：这一局要申请屏幕常亮（战斗里手会离开屏幕，手机一息屏就等于被打断）
  await mobile.click('[data-act="resume"]');
  await sleep(600);
  const resumed = await mobile.evaluate(() => ({
    state: window.__WICKLIGHT__.game.state,
    wake: window.__WICKLIGHT__.wake.wanted,
  }));
  expect(resumed.state === 'playing', '点了继续就接着打', JSON.stringify(resumed));
  expect(resumed.wake === true, '打起来要申请屏幕常亮', JSON.stringify(resumed));

  // 摇杆死区：手指按在中心附近的抖动不该让角色慢慢漂；推开要有输入；松手要归零
  const stickFeel = await mobile.evaluate(() => {
    const stick = document.getElementById('touch-stick');
    const base = stick.querySelector('.touch-stick__base') || stick;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type, x, y) => {
      const t = new Touch({ identifier: 7, target: stick, clientX: x, clientY: y });
      const empty = type === 'touchend' || type === 'touchcancel';
      stick.dispatchEvent(
        new TouchEvent(type, {
          touches: empty ? [] : [t],
          targetTouches: empty ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    const ctl = window.__WICKLIGHT__.touch;
    fire('touchstart', cx + 4, cy + 3);
    const jitter = +Math.hypot(ctl.moveX, ctl.moveY).toFixed(3);
    fire('touchmove', cx + 40, cy + 6);
    const pushed = +Math.hypot(ctl.moveX, ctl.moveY).toFixed(3);
    fire('touchend', cx + 40, cy + 6);
    const released = +Math.hypot(ctl.moveX, ctl.moveY).toFixed(3);
    return { jitter, pushed, released };
  });
  expect(stickFeel.jitter === 0, '摇杆死区：手指按在中间不产生移动', JSON.stringify(stickFeel));
  expect(stickFeel.pushed > 0.3, '摇杆推开有输入（死区之外照常跟手）', JSON.stringify(stickFeel));
  expect(stickFeel.released === 0, '摇杆松手立刻归零', JSON.stringify(stickFeel));

  // 触屏按钮的 touchcancel：来电话 / 系统手势打断时不能卡在"按着"的状态
  const cancelSafe = await mobile.evaluate(() => {
    const btn = document.querySelector('[data-action="dash"]');
    const ctl = window.__WICKLIGHT__.touch;
    const t = new Touch({ identifier: 9, target: btn, clientX: 0, clientY: 0 });
    const send = (type) =>
      btn.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      );
    send('touchstart');
    const down = ctl.dash;
    send('touchcancel');
    const afterCancel = ctl.dash;
    send('touchstart');
    send('touchend');
    const afterEnd = ctl.dash;
    return { down, afterCancel, afterEnd };
  });
  expect(cancelSafe.down === true, '按下冲刺按钮会进入"按着"状态', JSON.stringify(cancelSafe));
  expect(cancelSafe.afterCancel === false, 'touchcancel（来电 / 系统手势）要松开冲刺，不能卡住', JSON.stringify(cancelSafe));
  expect(cancelSafe.afterEnd === false, '抬起冲刺按钮要松开', JSON.stringify(cancelSafe));

  // 手机上的暂停入口：键盘的 Esc 在手机上不存在，HUD 得有一个按钮，
  // 而且它不能压住记分栏（它就是挂在记分栏左上角外侧的那一枚）
  const pauseBtn = await mobile.evaluate(() => {
    const el = document.querySelector('.hud__pause');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const chip = document.querySelector('.hud__topright').getBoundingClientRect();
    const overlapping = !(b.right <= chip.left + 1 || b.left >= chip.right - 1 || b.bottom <= chip.top + 1 || b.top >= chip.bottom - 1);
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top), overlapping };
  });
  expect(pauseBtn !== null, '手机上 HUD 有暂停按钮', JSON.stringify(pauseBtn));
  expect(pauseBtn && pauseBtn.w >= 32 && pauseBtn.h >= 32, '暂停按钮够大，手指点得中', JSON.stringify(pauseBtn));
  expect(pauseBtn && !pauseBtn.overlapping, '暂停按钮不压住记分栏', JSON.stringify(pauseBtn));
  await mobile.click('.hud__pause');
  await sleep(350);
  const pausedByTap = await mobile.evaluate(() => ({
    state: window.__WICKLIGHT__.game.state,
    hasResume: !!document.querySelector('[data-act="resume"]'),
    wake: window.__WICKLIGHT__.wake.wanted,
  }));
  expect(pausedByTap.state === 'paused', '点暂停按钮会暂停', JSON.stringify(pausedByTap));
  expect(pausedByTap.hasResume, '暂停面板出来了（手机上的构筑总览从这里进）', JSON.stringify(pausedByTap));
  expect(pausedByTap.wake === false, '暂停后放掉屏幕常亮', JSON.stringify(pausedByTap));
  await mobile.click('[data-act="resume"]');
  await sleep(400);

  // 切到后台（接电话 / 切应用 / 锁屏）要自动暂停：回来时别站在怪堆里
  const bgPaused = await mobile.evaluate(async () => {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 80));
    const state = window.__WICKLIGHT__.game.state;
    const hasResume = !!document.querySelector('[data-act="resume"]');
    if (desc) Object.defineProperty(Document.prototype, 'hidden', desc);
    delete document.hidden;
    return { state, hasResume };
  });
  expect(bgPaused.state === 'paused', '切到后台会自动暂停', JSON.stringify(bgPaused));
  expect(bgPaused.hasResume, '后台回来停在暂停面板上', JSON.stringify(bgPaused));
  await mobile.click('[data-act="resume"]');
  await sleep(400);

  // 手机上的设置面板多一项触感开关，点一下要真的翻转并存进设置
  await mobile.evaluate(() => window.__WICKLIGHT__.game.togglePause());
  await sleep(320);
  await mobile.click('[data-act="settings"]');
  await sleep(320);
  const hapBefore = await mobile.evaluate(() => {
    const el = document.querySelector('[data-toggle="vibrate"]');
    return { has: !!el, text: el ? el.textContent.trim() : null, value: window.__WICKLIGHT__.game.settings.data.vibrate };
  });
  expect(hapBefore.has, '手机设置里有触感反馈开关', JSON.stringify(hapBefore));
  await mobile.click('[data-toggle="vibrate"]');
  await sleep(200);
  const hapAfter = await mobile.evaluate(() => {
    const el = document.querySelector('[data-toggle="vibrate"]');
    return { text: el ? el.textContent.trim() : null, value: window.__WICKLIGHT__.game.settings.data.vibrate };
  });
  expect(hapAfter.value === !hapBefore.value && hapAfter.text !== hapBefore.text, '触感开关点得动、写得进设置', JSON.stringify({ hapBefore, hapAfter }));

  // 全新存档 + 系统的"减少动态效果"：第一次玩就该按系统偏好来（存档为空才这么做）
  const freshCtx = await browser.newContext({ viewport: { width: 900, height: 500 } });
  const freshPage = await freshCtx.newPage();
  await freshPage.emulateMedia({ reducedMotion: 'reduce' });
  await freshPage.goto(base, { waitUntil: 'load' });
  await freshPage.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 20000 });
  const rmFresh = await freshPage.evaluate(() => ({
    reduceMotion: window.__WICKLIGHT__.game.settings.data.reduceMotion,
    motionScale: window.__WICKLIGHT__.game.settings.motionScale,
  }));
  expect(rmFresh.reduceMotion === true && rmFresh.motionScale === 0, '新存档会跟随系统的"减少动态效果"', JSON.stringify(rmFresh));
  // 玩过一局之后（存档里有玩家自己的选择）就不再被系统偏好覆盖
  await freshPage.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.settings.set('reduceMotion', false);
  });
  await freshPage.reload({ waitUntil: 'load' });
  await freshPage.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 20000 });
  const rmKept = await freshPage.evaluate(() => window.__WICKLIGHT__.game.settings.data.reduceMotion);
  expect(rmKept === false, '玩家自己关掉"减少动态效果"之后，系统偏好不再覆盖存档', String(rmKept));
  await freshCtx.close();

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
