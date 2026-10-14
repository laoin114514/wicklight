/**
 * 横屏布局体检：把常见手机 / 平板横屏的尺寸挨个跑一遍，检查 HUD 芯片、摇杆、
 * 按钮、公告之间有没有互相压住、有没有谁被挤出视口。
 *
 *   node tools/viewportcheck.mjs                    # 默认 568~1024 宽 × 320~700 高
 *   WS=844,915 HS=390,412 node tools/viewportcheck.mjs
 *
 * 为什么要有这个脚本：横屏的高度只有 320~700px，右上那一列（记分）本身就有 100~130px 高，
 * 悬赏 / 灯台 / 摇杆 / 冲刺键都在抢剩下的空间。肉眼看一两个尺寸是不够的，
 * 而 CSS 里那几档 @media 的边界（320 / 340 / 375 / 400 / 560 / 700）正是最容易翻车的地方。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

function loadPlaywright() {
  for (const spec of ['playwright-core', 'playwright']) {
    try {
      return require(spec);
    } catch {
      /* try next */
    }
  }
  throw new Error('需要 playwright-core 才能跑横屏布局体检');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = join(DIST, normalize(url));
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        file = join(file, 'index.html');
        info = await stat(file).catch(() => null);
      }
      if (!info) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(500).end('error');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/** 参与体检的元素：HUD 的每一块 + 两个触摸控件 + 公告。 */
const SELS = [
  '.hud__topleft',
  '.hud__topright',
  '.hud__stage',
  '.hud__wave',
  '.hud__boss',
  '.hud__combo',
  '.hud__curse',
  '.hud__bounty',
  '.hud__pyre',
  '.hud__build',
  '#touch-stick',
  '.touch-buttons',
  '.announce',
];

const WS = (process.env.WS || '568,640,740,844,915,1024').split(',').map(Number);
const HS = (process.env.HS || '320,340,360,375,390,412,470,560,600,700').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { chromium } = loadPlaywright();
const { server, port } = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let bad = 0;
let runs = 0;

try {
  for (const h of HS) {
    for (const w of WS) {
      if (h > w) continue; // 竖屏由 playtest 的横屏闸门用例覆盖
      runs += 1;
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 100)));
      try {
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 20000 });
        await page.waitForFunction(() => !document.getElementById('boot-screen'), null, { timeout: 20000 }).catch(() => {});
        await page.click('[data-act="play"]');
        await sleep(200);
        await page.click('[data-act="start"]');
        await sleep(1500);
        const out = await page.evaluate((sels) => {
          const box = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            if (b.width < 1 || b.height < 1) return null;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
            return { l: b.left, t: b.top, r: b.right, b: b.bottom, s: sel };
          };
          const list = sels.map(box).filter(Boolean);
          const clashes = [];
          for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 1; j < list.length; j += 1) {
              const a = list[i];
              const c = list[j];
              const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
              const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
              if (ox > 2 && oy > 2) clashes.push(`${a.s} ∩ ${c.s}（${Math.round(ox)}×${Math.round(oy)}px）`);
            }
          }
          const outside = list.filter((x) => x.l < -1 || x.t < -1 || x.r > innerWidth + 1 || x.b > innerHeight + 1).map((x) => x.s);
          return { clashes, outside, visible: list.length };
        }, SELS);
        const ok = out.clashes.length === 0 && out.outside.length === 0 && errors.length === 0;
        if (!ok) bad += 1;
        const note = [
          out.clashes.join(' · '),
          out.outside.length ? `出界：${out.outside.join(',')}` : '',
          errors.length ? `报错：${errors.join('|')}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        console.log(`${String(w).padStart(4)}×${String(h).padEnd(4)} ${ok ? '✔' : '✖'} ${out.visible} 件${note ? ' ' + note : ''}`);
      } catch (err) {
        bad += 1;
        console.log(`${String(w).padStart(4)}×${String(h).padEnd(4)} ✖ 异常 ${String(err).slice(0, 120)}`);
      }
      await context.close();
    }
  }
  // 刘海 / 手势条那几条 env(safe-area-inset-*) 在真机之外量不到（测试环境里恒为 0），
  // 但至少要确认浏览器**认了**这些声明——写错的 calc() 会被整条丢掉，那时 HUD 会掉回默认位置。
  const styleCheck = await (async () => {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    const found = await page.evaluate(() => {
      // @media 包着的规则要钻进去数，不然一律命中 0。
      const cssTexts = [];
      const walk = (rules) => {
        for (const rule of Array.from(rules || [])) {
          if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
          else if (rule.cssText) cssTexts.push(rule.cssText);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules);
        } catch {
          /* 跨域表读不到就跳过 */
        }
      }
      const all = cssTexts.join(String.fromCharCode(10));
      return (all.match(/env\(\s*safe-area-inset-(left|right|top|bottom)/g) || []).length;
    });
    await context.close();
    return found;
  })();
  if (styleCheck < 3) {
    bad += 1;
    console.log(`✖ 刘海安全区样式没被浏览器接受（命中 ${styleCheck} 条，至少要有 3 条）`);
  } else {
    console.log(`✔ 刘海 / 手势条安全区样式已被解析：${styleCheck} 条 env(safe-area-inset-*) 规则`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log(bad === 0 ? `\n横屏布局体检通过：${runs} 个尺寸都没有互相压住或出界。` : `\n有 ${bad} / ${runs} 个尺寸不合格`);
process.exit(bad === 0 ? 0 : 1);
