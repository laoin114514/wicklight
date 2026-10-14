/**
 * 真实浏览器性能体检：用 Playwright 驱动真 Chromium 量帧间隔、动态分辨率与长跑稳定性。
 *
 *   node tools/perf.mjs
 *
 * 关注三件事：
 *  1. 1280x720 @1x 下能否跑满 60fps；
 *  2. 高分屏（deviceScaleFactor=2）下动态分辨率有没有真的把帧率救回来；
 *  3. 高强度长跑 25 秒：无报错、堆内存不涨、模拟确实在推进。
 *
 * 注意：无 GPU 的环境（例如容器里只有软件光栅化）绝对值会很难看 —— 那正是动态分辨率存在的意义，
 * 脚本断言的是「相对改善」而不是绝对帧率。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

function loadPlaywright() {
  for (const spec of ['playwright-core', 'playwright']) {
    try {
      return require(spec);
    } catch {
      /* try next */
    }
  }
  throw new Error('需要 playwright-core 才能跑性能体检');
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
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const results = [];
function check(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openRun(browser, base, { dsf, adaptive, quality = 'high' }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dsf });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 140)}`);
  });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 20000 });
  await page.waitForFunction(() => !document.getElementById('boot-screen'), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(
    ([q, ad]) => {
      const g = window.__WICKLIGHT__.game;
      g.settings.data.quality = q;
      g.settings.data.adaptive = ad;
      g.newRun('warden', 'nightmare', true);
      g.director.wave = 20;
      g.player.stats.maxHp = 1e7;
      g.player.hp = 1e7;
    },
    [quality, adaptive],
  );
  return { page, errors };
}

async function sampleFrames(page, frames = 120) {
  return page.evaluate(async (n) => {
    const dts = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        dts.push(now - last);
        last = now;
        if (dts.length < n) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const s = dts.slice(5).sort((a, b) => a - b);
    const g = window.__WICKLIGHT__.game;
    return {
      avg: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(2),
      p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
      scale: g.renderer.scale,
      canvas: `${g.renderer.canvas.width}x${g.renderer.canvas.height}`,
      pixels: g.renderer.renderPixels,
    };
  }, frames);
}

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}/`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let exitCode = 0;
try {
  // ── 1. 基准分辨率：应当稳稳 60fps ──
  {
    const { page, errors } = await openRun(browser, base, { dsf: 1, adaptive: true });
    await sleep(3000);
    const r = await sampleFrames(page);
    check(r.avg <= 20, '1280x720 @1x 稳定 60fps', `avg ${r.avg}ms (${Math.round(1000 / r.avg)}fps) p95 ${r.p95}ms`);
    check(errors.length === 0, '@1x 无报错', errors.slice(0, 2).join(' | '));
    await page.close();
  }

  // ── 2. 高分屏：动态分辨率必须介入 ──
  {
    const withAdaptive = await openRun(browser, base, { dsf: 2, adaptive: true });
    await sleep(6000);
    const on = await sampleFrames(withAdaptive.page);
    const errsOn = withAdaptive.errors.slice();
    await withAdaptive.page.evaluate(() => {
      window.__WICKLIGHT__.game.settings.data.adaptive = false;
    });
    await sleep(2500);
    const off = await sampleFrames(withAdaptive.page, 90);
    check(on.scale < 1, '高分屏下动态分辨率自动降档', `scale ${on.scale} · ${on.canvas} (${(on.pixels / 1e6).toFixed(2)}MPx)`);
    check(on.avg <= 60, '高分屏下帧率被控制在可用范围', `avg ${on.avg}ms`);
    check(on.avg * 2 <= off.avg, '动态分辨率明显优于固定分辨率', `${off.avg}ms → ${on.avg}ms`);
    check(errsOn.length === 0, '@2x 无报错', errsOn.slice(0, 2).join(' | '));
    await withAdaptive.page.close();
  }

  // ── 3. 高强度长跑 ──
  {
    const { page, errors } = await openRun(browser, base, { dsf: 1, adaptive: true });
    await sleep(1500);
    const before = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 25000) {
      const key = ['KeyW', 'KeyA', 'KeyS', 'KeyD'][i % 4];
      await page.keyboard.down(key);
      await sleep(300);
      await page.keyboard.up(key);
      await page.keyboard.press('Space');
      await page.keyboard.press('KeyQ');
      await sleep(220);
      i += 1;
    }
    const snap = await page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      return {
        state: g.state, wave: g.wave, kills: g.kills,
        enemies: g.enemies.count, particles: g.particles.count,
        heap: performance.memory?.usedJSHeapSize ?? 0,
      };
    });
    const growthMb = (snap.heap - before) / 1048576;
    const last = await sampleFrames(page, 60);
    check(errors.length === 0, '长跑 25 秒无报错', errors.slice(0, 3).join(' | '));
    check(snap.kills > 0 || snap.wave > 20, '长跑中模拟持续推进', `wave ${snap.wave} · kills ${snap.kills} · 场上 ${snap.enemies} 敌 / ${snap.particles} 粒子`);
    check(growthMb < 60, '长跑后堆内存没有爆涨', `+${growthMb.toFixed(1)}MB`);
    check(last.p95 < 90, '长跑后帧时间没有劣化', `avg ${last.avg}ms p95 ${last.p95}ms`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? '全部通过' : '存在失败'}（${results.length} 项）`);
if (failed.length) exitCode = 1;
process.exit(exitCode);
