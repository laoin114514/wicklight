/**
 * 手机端性能体检：把游戏放进"手机横屏"的浏览器环境里量帧时间，并按阶段拆开。
 *
 *   node tools/mobileperf.mjs            # 默认 844x390 @3x + 4x CPU 降频
 *   THROTTLE=0 node tools/mobileperf.mjs # 关掉 CPU 降频
 *   VW=915 VH=412 DSF=3 node tools/mobileperf.mjs
 *
 * 为什么要有这个脚本：容器里只有软件光栅化，绝对帧率不代表真机；
 * 但它能稳定地量出"每一步占多少毫秒"，所以优化前后对比、以及回归拦截都靠它。
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
  throw new Error('需要 playwright-core 才能跑手机性能体检');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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

const VW = +(process.env.VW || 844);
const VH = +(process.env.VH || 390);
const DSF = +(process.env.DSF || 3);
const THROTTLE = +(process.env.THROTTLE ?? 4);
const QUALITY = process.env.Q || 'high';
const ADAPTIVE = process.env.ADAPT !== '0';
const WAVE = +(process.env.WAVE || 20);
const SOAK = +(process.env.SOAK || 12);
/** 消融开关：逗号分隔。Chromium 的 canvas 命令是延迟提交的，按方法掐表会把整块画布的
 *  栅格化都算到"第一个跨画布操作"头上，所以改成"逐个关掉再对比总帧时间"。 */
const KILL = (process.env.KILL || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 统计每帧画布命令条数（真机 CPU 侧开销的代理指标）。 */
const OPS = process.env.OPS === '1';

const instrument = () => {
  // 画布调用计数：真机上的瓶颈是"CPU 侧把命令录进 2D 上下文"以及随之而来的
  // 合成/纹理切换，而不是软件光栅化的像素填充。帧时间在容器里量不准这一项，
  // 所以另记一个"每帧多少条画布命令"——它跟真机 CPU 开销正相关。

  const install = () => {
  if (window.__MP_OPS_ON__) {
    const P = CanvasRenderingContext2D.prototype;
    const names = ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'drawImage', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'createRadialGradient', 'createLinearGradient', 'save', 'restore'];
    const counts = { total: 0, by: {} };
    for (const n of names) {
      const orig = P[n];
      if (typeof orig !== 'function') continue;
      P[n] = function (...a) {
        counts.total += 1;
        counts.by[n] = (counts.by[n] || 0) + 1;
        return orig.apply(this, a);
      };
    }
    window.__MP_OPS__ = () => counts;
  }
  const g = window.__WICKLIGHT__.game;
  const acc = {};
  const per = {};
  let on = false;
  const wrap = (obj, key, name) => {
    const orig = obj[key];
    if (typeof orig !== 'function') return;
    obj[key] = function (...a) {
      if (!on) return orig.apply(this, a);
      const t = performance.now();
      const r = orig.apply(this, a);
      acc[name] = (acc[name] || 0) + (performance.now() - t);
      return r;
    };
  };
  wrap(g, 'drawWorld', 'world');
  wrap(g, 'drawPyreGlow', 'pyreGlow');
  wrap(g, 'drawFrostHaze', 'frost');
  wrap(g, 'drawTargetPointers', 'pointers');
  wrap(g.light, 'render', 'light');
  wrap(g.postfx, 'applyBloom', 'bloom');
  wrap(g.postfx, 'applyGrade', 'grade');
  wrap(g.postfx, 'applyMain', 'post');
  wrap(g.hud, 'update', 'hud');

  for (const kill of (window.__MP_KILL__ || [])) {
    if (kill === 'bloom') g.postfx.applyBloom = () => {};
    if (kill === 'grade') g.postfx.applyGrade = () => {};
    if (kill === 'shade') g.postfx.applyMain = () => {};
    if (kill === 'light') g.light.render = () => {};
    // 光照贴图改回全分辨率：量"半分辨率省下多少"，而不是把光照整个关掉
    if (kill === 'lightHalf') {
      const orig = g.light.setScale.bind(g.light);
      g.light.setScale = (dpr) => orig(dpr, 1);
      g.light.setScale(g.renderer.dpr);
    }
    if (kill === 'world') g.drawWorld = () => {};
    if (kill === 'pointers') g.drawTargetPointers = () => {};
    if (kill === 'glow') g.drawPyreGlow = () => {};
    if (kill === 'hud') g.hud.update = () => {};
    if (kill === 'entities') { g.enemies.draw = () => {}; g.particles.draw = () => {}; g.floaters.draw = () => {}; }
  }
  if (window.__MP_DPR__) {
    // render() 每帧都会调 setProfile，所以把两个入口都钉死，避免它把 maxDpr 改回去
    g.renderer.setQuality = () => {};
    g.renderer.setProfile = () => {};
    g.renderer.maxDpr = window.__MP_DPR__;
    // 自适应关闭时没有任何路径会重算 dpr，必须手动 apply 一次
    g.renderer.apply();
  }
  // 量"手机档到底省了多少"：把档位里的某几项按桌面档的数值钉住再对比
  if (window.__MP_OVER__) {
    const o = window.__MP_OVER__;
    if (o.lightScale) {
      const orig = g.light.setScale.bind(g.light);
      g.light.setScale = (dpr) => orig(dpr, o.lightScale);
      g.light.setScale(g.renderer.dpr);
    }
    if (o.bloom) {
      const orig = g.postfx.setProfile.bind(g.postfx);
      g.postfx.setProfile = () => { orig({ bloomDivisor: o.bloom[0], bloomPasses: o.bloom[1] }); };
      g.postfx.setProfile({ bloomDivisor: o.bloom[0], bloomPasses: o.bloom[1] });
    }
    if (o.density || o.detail || o.noCull) {
      const orig = g.refreshPerf.bind(g);
      g.refreshPerf = () => {
        orig();
        if (o.density) g.particles.density = o.density;
        if (o.detail) g.profile = { ...g.profile, detailScale: o.detail };
      };
    }
  }
  if (window.__MP_FRAMECAP__ !== undefined && window.__WICKLIGHT__.loop) {
    window.__WICKLIGHT__.loop.maxFps = window.__MP_FRAMECAP__;
    window.__WICKLIGHT__.loop.capMs = 0;
  }

  window.__MP__ = {
    start() { for (const k of Object.keys(acc)) delete acc[k]; on = true; },
    stop() { on = false; },
    frame() { const c = { ...acc }; for (const k of Object.keys(acc)) delete acc[k]; return c; },
    info() {
      const r = g.renderer;
      return {
        canvas: `${r.canvas.width}x${r.canvas.height}`,
        mp: +(r.canvas.width * r.canvas.height / 1e6).toFixed(2),
        dpr: +r.dpr.toFixed(2),
        maxDpr: r.maxDpr,
        killEnv: (window.__MP_KILL__ || []).join('|'),
        dprEnv: window.__MP_DPR__ ?? null,
        scale: r.scale,
        lights: g.light.lastLightCount,
        lit: g.light.lastLitCount,
        lightTex: typeof g.light.textureScale === 'number' ? +g.light.textureScale.toFixed(2) : 1,
        prof: g.profile
          ? `light${g.profile.lightScale} bloom${g.profile.bloomDivisor}x${g.profile.bloomPasses} detail${g.profile.detailScale} dens${g.profile.particleScale}`
          : 'n/a',
        cap: window.__WICKLIGHT__.loop ? window.__WICKLIGHT__.loop.maxFps : 0,
        enemies: g.enemies.count,
        particles: g.particles.count,
        floaters: g.floaters.count,
        decals: g.decals?.length ?? 0,
        state: g.state,
      };
    },
  };
  };
  // 初始化脚本跑在游戏之前，所以这里等 __WICKLIGHT__ 出现再挂探针
  const wait = window.setInterval(() => {
    if (!window.__WICKLIGHT__?.game?.postfx) return;
    window.clearInterval(wait);
    install();
  }, 20);
};

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}/`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let exitCode = 0;
try {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DSF,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  const OVER = {
    lightScale: +(process.env.LIGHTSCALE || 0),
    bloom: process.env.BLOOMDIV ? [+process.env.BLOOMDIV, +(process.env.BLOOMPASS || 1)] : null,
    density: +(process.env.DENSITY || 0),
    detail: +(process.env.DETAIL || 0),
  };
  await page.addInitScript(
    (cfg) => {
      window.__MP_KILL__ = cfg.kill;
      window.__MP_DPR__ = cfg.dpr;
      window.__MP_OVER__ = cfg.over;
      window.__MP_OPS_ON__ = cfg.ops;
      if (cfg.framecap !== null) window.__MP_FRAMECAP__ = cfg.framecap;
    },
    { kill: KILL, dpr: +(process.env.FORCE_DPR || 0), over: OVER, ops: OPS, framecap: process.env.FRAMECAP === undefined ? null : +process.env.FRAMECAP },
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  if (THROTTLE > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  }
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__WICKLIGHT__, null, { timeout: 20000 });
  await page.waitForFunction(() => !document.getElementById('boot-screen'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => !!window.__MP__, null, { timeout: 20000 });

  console.log(
    `手机横屏 ${VW}x${VH} @${DSF}x · CPU ${THROTTLE}x 降频 · 画质 ${QUALITY} · 自适应 ${ADAPTIVE ? '开' : '关'}` +
      (KILL.length ? ` · 关闭 [${KILL.join(', ')}]` : '') +
      (process.env.FORCE_DPR ? ` · 固定 dpr ${process.env.FORCE_DPR}` : ''),
  );

  await page.evaluate(([q, ad, wave, stress]) => {
    const g = window.__WICKLIGHT__.game;
    g.settings.data.quality = q;
    g.settings.data.adaptive = ad;
    g.newRun('warden', 'nightmare', true);
    g.director.wave = wave;
    g.player.stats.maxHp = 1e7;
    g.player.hp = 1e7;
    // 固定一份"敌人数量"的负载：自适应 / 画质一变帧率就变，靠计时器刷怪会让两次测量的场面不一样
    if (stress > 0) {
      const defs = ['crawler', 'moth'];
      for (let i = 0; i < stress; i += 1) {
        const a = (i / stress) * Math.PI * 2;
        const d = 180 + (i % 5) * 90;
        try {
          const e = g.enemies.spawn(defs[i % defs.length], g.player.x + Math.cos(a) * d, g.player.y + Math.sin(a) * d, 1e6, 0.0001);
          if (e) { e.hp = e.maxHp = 1e9; e.speed = 0; }
        } catch { /* 未收录的敌人 id 就跳过 */ }
      }
    }
  }, [QUALITY, ADAPTIVE, WAVE, +(process.env.STRESS || 0)]);

  // 让动态分辨率先稳定下来
  await sleep(6000);

  const out = await page.evaluate(async (soak) => {
    const MP = window.__MP__;
    const g = window.__WICKLIGHT__.game;
    const dts = [];
    const sums = {};
    let last = performance.now();
    MP.start();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        dts.push(now - last);
        last = now;
        const f = MP.frame();
        for (const k of Object.keys(f)) sums[k] = (sums[k] || 0) + f[k];
        if (now - t0 < soak * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    MP.stop();
    const body = dts.slice(3);
    const sorted = [...body].sort((a, b) => a - b);
    const n = body.length;
    const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
    const stages = {};
    for (const k of Object.keys(sums)) stages[k] = +(sums[k] / n).toFixed(2);
    void g;
    return {
      frames: n,
      avg: avg(body),
      p50: +sorted[Math.floor(n * 0.5)].toFixed(2),
      p95: +sorted[Math.floor(n * 0.95)].toFixed(2),
      max: +sorted[n - 1].toFixed(2),
      fps: Math.round(1000 / avg(body)),
      stages,
      info: MP.info(),
    };
  }, SOAK);

  if (OPS) {
    const ops = await page.evaluate(() => {
      const o = window.__MP_OPS__();
      const g = window.__WICKLIGHT__.game;
      return { total: o.total, by: o.by, enemies: g.enemies.count, particles: g.particles.count, lit: g.light.lastLitCount };
    });
    console.log(
      `\n画布命令：${(ops.total / out.frames).toFixed(0)} 条/帧（场上 ${ops.enemies} 敌 / ${ops.particles} 粒子 / 落屏光源 ${ops.lit}）`,
    );
    console.log(
      '  ' +
        Object.entries(ops.by)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${(v / out.frames).toFixed(1)}`)
          .join(' · '),
    );
  }
  const st = out.stages;
  const known = ['world', 'light', 'bloom', 'grade', 'post', 'hud', 'pyreGlow', 'frost', 'pointers'];
  const sum = known.reduce((a, k) => a + (st[k] || 0), 0);
  console.log(`\n帧数 ${out.frames} · 平均 ${out.avg}ms (${out.fps}fps) · p50 ${out.p50} · p95 ${out.p95} · 最慢 ${out.max}`);
  console.log(`画面 ${out.info.canvas} (${out.info.mp}MPx) dpr ${out.info.dpr} scale ${out.info.scale}`);
  console.log(`[dbg] maxDpr ${out.info.maxDpr} dprEnv ${out.info.dprEnv} killEnv "${out.info.killEnv}"`);
  console.log(`[dbg] 档位 ${out.info.prof} · 光照贴图 ×${out.info.lightTex} · 帧率上限 ${out.info.cap || '不限'} · 落屏光源 ${out.info.lit}/${out.info.lights}`);
  console.log(`场上：${out.info.enemies} 敌 / ${out.info.particles} 粒子 / ${out.info.lights} 光源 / ${out.info.floaters} 飘字`);
  console.log('\n每帧阶段耗时（ms）：');
  for (const k of known) {
    const v = st[k] || 0;
    const bar = '█'.repeat(Math.min(40, Math.round(v * 2)));
    console.log(`  ${k.padEnd(9)} ${v.toFixed(2).padStart(7)}  ${bar}`);
  }
  console.log(`  ${'小计'.padEnd(9)} ${sum.toFixed(2).padStart(7)}  （占 ${Math.round((sum / out.avg) * 100)}%）`);
  console.log(`  ${'其它'.padEnd(9)} ${(out.avg - sum).toFixed(2).padStart(7)}`);
  if (errors.length) {
    console.log(`\n✖ 有报错：${errors.slice(0, 3).join(' | ')}`);
    exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
