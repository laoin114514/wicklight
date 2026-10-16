/**
 * 真实浏览器实测：用 Playwright 驱动真 Chromium 打开构建产物，
 * 用真实键盘/鼠标走一遍「菜单 → 选灯火 → 战斗 → 升级 → 暂停 → 商店 → 祭坛 → 死亡 → 局外」，
 * 并对每一屏做布局与像素校验，最后把截图写到 /tmp/wl/shots/。
 *
 *   node tools/playtest.mjs [--headed] [--keep]
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** 「拨芯」这条线四件遗物的名字，移动端那条检查要拿它对面板上写出来的字（见 3a2c / 手机那段）。 */
const RELIC_NAME = { wickveil: '遮光', wickember: '暗火', wickstride: '夜步', wickthrift: '守芯' };
/** 「燎灯」这条线四件遗物的名字（v75，见 3a9c / 手机那段）。 */
const AURA_RELIC_NAME = { auraflare: '旺火', auralantern: '漫光', aurasiphon: '吮灯', aurasmother: '烟熏' };
/** 「倾灯」这条线四件遗物的名字（v76，见 3a9d / 手机那段）。 */
const POUR_RELIC_NAME = { pourstoke: '浇油', pourladle: '大瓢', pourgather: '拾油', pourward: '烬护' };
/** 「伏灯」这条线四件遗物的名字（v77，见 3a5b / 手机那段）。 */
const MINE_RELIC_NAME = { minerack: '灯阵', minelink: '接火', minebait: '香饵', minetrip: '绊线' };
/** 「旋灯」这条线四件遗物的名字（v78，见 3a8b / 手机那段）。 */
const VORTEX_RELIC_NAME = { vortexnet: '张网', vortexmark: '标灯', vortexpress: '榨油', vortexsnare: '缠网' };
/** 「弃灯」这条线四件遗物的名字（v83，见 3a8c / 手机那段）。 */
const LAMP_RELIC_NAME = { lampburst: '焚灯', lampshade: '灯罩', lampember: '拾灯', lamphaze: '灯晕' };
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

  /**
   * 按**游戏内时间**等，不按墙上时间：容器里帧被拖慢时主循环会夹住 dt，墙上 2.4 秒可能只走了
   * 不到 1 秒游戏时间——而这几条量的都是"蛾闻着灯走过来""吹灯客走到雷上"这种**世界真的转过几秒**
   * 才发生的事（本文件在别处已经踩过这个坑：16 秒墙钟只走了 4 秒游戏时间）。
   * `ready` 是"已经成了"的判据（传进来的是在页面里跑的函数）；没传就纯等满这么久。
   * 还是会带一个墙上时间的保险：真卡住了（标签页被挂起之类）不该把整轮体检吊死在这儿。
   */
  const waitGame = async (secs, ready) => {
    const t0 = await page.evaluate(() => window.__WICKLIGHT__.game.runTime);
    const wall0 = Date.now();
    for (;;) {
      if (ready && (await page.evaluate(ready))) return true;
      if ((await page.evaluate(() => window.__WICKLIGHT__.game.runTime)) - t0 >= secs) return false;
      if (Date.now() - wall0 > secs * 4000) return false;
      await sleep(80);
    }
  };

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
      /** 触感被调用了几次、都是什么节奏（震动在真机上肉眼看不见，只能这样验）。 */
      vibes: {
        log: [],
        install() {
          if (typeof navigator.vibrate === 'function') {
            navigator.vibrate = (p) => {
              window.__PROBE__.vibes.log.push(Array.isArray(p) ? p.slice() : p);
              return true;
            };
          }
        },
      },
    };
    window.__PROBE__.vibes.install();
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

  // ── 2b. 「深宵之约」（v79）：自己给自己加难度 ──
  // 离线单测（tests/pacts.test.mjs）量的是"七条各改了哪个数"，这里量界面那两件事：
  // **锁着的时候说不说得清**（还没通关过的人该看到解锁条件，而不是一排灰按钮），
  // 以及**背着它开一局之后，界面认不认这件事**（开局公告 / 构筑总览那一栏 / HUD 的构筑行）。
  const pactLocked = await page.evaluate(() => ({
    chips: document.querySelectorAll('[data-pact]').length,
    text: document.querySelector('.pact-locked')?.textContent ?? '',
  }));
  expect(
    pactLocked.chips === 0 && pactLocked.text.includes('通关'),
    '没通关时「深宵之约」锁着，而且写清了怎么开（不是一排灰按钮）',
    JSON.stringify(pactLocked),
  );
  // 解锁走的是**真判据**（生涯档案里的通关次数），这里把它临时设成 1
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    window.__PACT_CLEARS__ = g.save.records.clearedRuns;
    g.save.records.clearedRuns = 1;
    g.ui.showScreen('select');
  });
  await sleep(250);
  const pactRow = await page.evaluate(() => ({
    chips: window.__PROBE__.layout('.pact'),
    panel: window.__PROBE__.layout('.panel--select'),
  }));
  expect(pactRow.chips.count === 7, '通关之后那七条之约都画出来了', `count=${pactRow.chips.count}`);
  expect(
    pactRow.chips.issues.length === 0 && pactRow.panel.issues.length === 0 && pactRow.panel.hOverflow === 0,
    '多了「深宵之约」这一块，选灯火那屏仍然不越界、也不横向滚动',
    `${pactRow.chips.issues.join('; ')} | ${pactRow.panel.issues.join('; ')} hOverflow=${pactRow.panel.hOverflow}`,
  );
  await shot('02b-pacts');
  for (const id of ['dense', 'shell', 'claw']) {
    await page.click(`[data-pact="${id}"]`);
    await sleep(120);
  }
  const pactPick = await page.evaluate(() => ({
    selected: document.querySelectorAll('.pact.is-selected').length,
    note: document.querySelector('.pact-note')?.textContent ?? '',
    text: document.querySelector('.pact-block')?.textContent ?? '',
  }));
  expect(pactPick.selected === 3, '点三下就选中三条（这一排是**可多选**的）', `${pactPick.selected} 条`);
  expect(
    pactPick.note.includes('背 3 条') && pactPick.note.includes('1.45'),
    '面板上写清"背几条 · 结算余烬多少倍"',
    pactPick.note,
  );
  for (const name of ['来客更密', '壳更硬', '爪更利']) {
    expect(pactPick.text.includes(name), `选项上写着「${name}」这一条是什么`, pactPick.text.slice(-160));
  }
  await page.click('[data-act="start"]');
  await sleep(800);
  const pactRun = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return {
      pacts: g.pacts.slice(),
      mult: window.__WICKLIGHT__.data.pacts.pactEmberMult(g.pacts),
      announce: document.querySelector('.announce')?.textContent ?? '',
    };
  });
  expect(pactRun.pacts.length === 3 && pactRun.pacts.join('/') === 'dense/shell/claw', '开局真的背着这三条（走的是界面那条路）', pactRun.pacts.join('/'));
  expect(
    pactRun.announce.includes('深宵 3 条'),
    '开局那条大公告里读得出"这一局背着之约"——不写出来，玩家只会觉得今天手感怪',
    pactRun.announce,
  );
  // （结算屏上「本局构筑」那一行由离线单测盯：`run-build` 只在死亡 / 通关那两屏上，
  //   而打仗的时候它不在 DOM 里——在战场上调 `showScreen('dead')` 就是伪造一个死，
  //   那会把后面的生涯档案搅乱。这一条量的是"开局那一刻玩家看不看得见"。）
  // 构筑总览：那三条要连"改了什么"一起写出来（和遗物那一族同一条规矩）
  await page.keyboard.press('Tab');
  await sleep(400);
  await shot('02b-pacts-run');
  const pactSheet = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.lo-pact')].map((e) => e.textContent),
    sum: document.querySelector('.lo-pact__sum')?.textContent ?? '',
    text: document.querySelector('.panel')?.textContent ?? '',
    layout: window.__PROBE__.layout('.panel'),
  }));
  expect(pactSheet.rows.length === 3, '构筑总览里列出这一局背的那三条', JSON.stringify(pactSheet.rows));
  expect(
    pactSheet.rows.join('|').includes('敌人血量 +30%'),
    '总览里写的是这条之约**改了什么**，不只是它的名字',
    pactSheet.rows.join('|'),
  );
  expect(pactSheet.sum.includes('3 条') && pactSheet.sum.includes('1.45'), '总览里同样写清条数与余烬倍率', pactSheet.sum);
  expect(!/undefined|NaN/.test(pactSheet.text), '「深宵」那一栏没有缺字段', pactSheet.text.match(/undefined|NaN/g)?.slice(0, 2).join(',') ?? '');
  expect(pactSheet.layout.issues.length === 0, '多了「深宵」那一栏，总览仍然正常', pactSheet.layout.issues.join('; '));
  await page.keyboard.press('Tab');
  await sleep(300);
  // 收尾：把这一局换回"一条都不背"，后面的检查照旧（走的是同一条开局路径）。
  // ⚠ 选择屏上勾过的三条也要还回去——它跟着会话走，不还的话后面每一局都会背着它开（而且没人看得出）。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.records.clearedRuns = window.__PACT_CLEARS__;
    g.ui.selectedPacts.clear();
    g.newRun('warden', 'normal', false);
  });
  await sleep(450);
  const pactClean = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { pacts: g.pacts.length, mult: window.__WICKLIGHT__.data.pacts.pactEmberMult(g.pacts), announce: document.querySelector('.announce')?.textContent ?? '' };
  });
  expect(
    pactClean.pacts === 0 && pactClean.mult === 1 && !pactClean.announce.includes('深宵'),
    '把之约还回去之后，这一局就是平常那一夜',
    JSON.stringify(pactClean),
  );

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

  // ── 3a2. 分灯（E）：真按键 → 地上多一盏灯、扣掉自己的油、进冷却 ──
  // 这是这一版新加的"动词"，所以要用真键盘走一遍，而不是只跑离线测试。
  const oilBeforeLamp = await page.evaluate(() => window.__WICKLIGHT__.game.player.oil);
  await page.keyboard.press('KeyE');
  await sleep(200);
  const lampState = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { lamps: g.lamps.length, oil: +g.player.oil.toFixed(3), cd: +g.lampCd.toFixed(1), ready: g.lampReady };
  });
  expect(lampState.lamps === 1, '按 E 分灯：地上多了一盏灯', JSON.stringify(lampState));
  expect(lampState.oil < oilBeforeLamp, '分灯扣的是自己的灯油（油就是光）', `${oilBeforeLamp.toFixed(3)} → ${lampState.oil}`);
  expect(lampState.cd > 0 && lampState.ready === false, '分完灯要进冷却，冷却中不该报可用', JSON.stringify(lampState));

  // ── 3a2b0. 拨芯这条线（v72）：还没按过 C 的人第一次拿到那四件，得先被讲一次 ──
  // README 的「已知取舍」里挂着这条线的代价：从不按 C 的人，抽到这四件等于什么都没抽到
  // （48 件里有 4 件对一部分人不存在）。v72 补的不是数值，而是**把条件说出来**——
  // 拿到手的那一刻讲一次。离线测试量的是"讲没讲"，这里量真浏览器里那**一张卡**
  // （字、位置、尺寸），而且要走主循环里那一遍 0.75 秒的扫描（不是直接调那个函数）。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.tips = (g.save.tips ?? []).filter((k) => k !== 'relic:wick-family');
    g.wickHintDone = false;
    g.player.addRelic('wickveil');
  });
  await sleep(1000); // 扫描是每 0.75 秒一遍，走主循环
  const wickTip = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const el = [...document.querySelectorAll('.toast--tip')].pop();
    const r = el?.getBoundingClientRect();
    return {
      knows: g.codex.has('mechanic', 'wick'), // 前置条件：这一局还没按过 C
      text: (el?.innerText ?? '').replace(/\n/g, ' '),
      recorded: (g.save.tips ?? []).includes('relic:wick-family'),
      w: Math.round(r?.width ?? 0),
      h: Math.round(r?.height ?? 0),
      left: Math.round(r?.left ?? 0),
      right: Math.round(r?.right ?? 0),
    };
  });
  expect(wickTip.knows === false, '这一条的前提是真的：还没按过 C，图鉴里还没有「拨芯」', JSON.stringify(wickTip.knows));
  expect(wickTip.recorded, '拿到那四件里的头一件、又没按过 C：该主动弹一张说明卡', wickTip.text);
  expect(/拨芯/.test(wickTip.text) && /按 C/.test(wickTip.text), '那张卡上写着怎么用（按 C）', wickTip.text);
  expect(
    wickTip.w > 0 && wickTip.h > 0 && wickTip.left >= 0 && wickTip.right <= 1280,
    '这张说明卡有尺寸、也在视口里',
    JSON.stringify(wickTip),
  );
  await shot('03j0-wick-family-tip');
  await page.evaluate(() => {
    const hud = window.__WICKLIGHT__.hud;
    const g = window.__WICKLIGHT__.game;
    hud.clearCards(); // 别让这张卡飘到后面那些检查的画面上
    g.player.removeRelic('wickveil');
    g.player.recomputeStats();
  });

  // ── 3a2b0b. 「弃灯」这条线（v83）：一次都没分过灯的人拿到那四件，同样得先被讲一次 ──
  // 和拨芯那一句一模一样的坑：焚灯 / 灯罩 / 拾灯 / 灯晕全部只长在**你按 E 分出去的那盏灯**身上，
  // 一次都不分，它们在手里就是四张废牌。而这一句还得多讲一件事：**摆在哪一边**
  // （台架上量过：摆在追兵本来就要路过的线上几乎一点都不省，拐个弯才买得到那两三秒）。
  // 这里量真浏览器里那**一张卡**（字、尺寸、位置），并且走主循环那一遍 0.75 秒的扫描。
  // ⚠ 这一段要先把"已经分过灯"这件事抹掉：前面 3a2 已经按过一次 E，图鉴里早就有 `mechanic:lamp` 了
  //   （这一版刚刚把那条记录挪到"分出去的那一刻"）。所以存档里那条与内存里那个集合都要摘掉——
  //   `codex.has` 读的是内存里那个 Set，只删存档不管用。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.tips = (g.save.tips ?? []).filter((k) => k !== 'relic:lamp-family');
    g.save.codex = (g.save.codex ?? []).filter((k) => k !== 'mechanic:lamp');
    g.codex.known.delete('mechanic:lamp');
    g.lampHintDone = false;
    g.player.addRelic('lampburst');
  });
  await sleep(1000); // 扫描是每 0.75 秒一遍，走主循环
  const lampTip = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const el = [...document.querySelectorAll('.toast--tip')].pop();
    const r = el?.getBoundingClientRect();
    return {
      knows: g.codex.has('mechanic', 'lamp'), // 前置条件：这一局还没分过灯
      text: (el?.innerText ?? '').replace(/\n/g, ' '),
      recorded: (g.save.tips ?? []).includes('relic:lamp-family'),
      w: Math.round(r?.width ?? 0),
      h: Math.round(r?.height ?? 0),
      left: Math.round(r?.left ?? 0),
      right: Math.round(r?.right ?? 0),
    };
  });
  expect(lampTip.knows === false, '这一条的前提是真的：还没分过灯，图鉴里还没有「弃灯」', JSON.stringify(lampTip.knows));
  expect(lampTip.recorded, '拿到那四件里的头一件、又没分过灯：该主动弹一张说明卡', lampTip.text);
  expect(/弃灯/.test(lampTip.text) && /按 E/.test(lampTip.text), '那张卡上写着怎么用（按 E）', lampTip.text);
  expect(/方向/.test(lampTip.text), '还得讲清"摆在哪一边"——这一族一半的账在这儿', lampTip.text);
  expect(
    lampTip.w > 0 && lampTip.h > 0 && lampTip.left >= 0 && lampTip.right <= 1280,
    '这张说明卡有尺寸、也在视口里',
    JSON.stringify(lampTip),
  );
  await shot('03j0b-lamp-family-tip');
  await page.evaluate(() => {
    const hud = window.__WICKLIGHT__.hud;
    const g = window.__WICKLIGHT__.game;
    hud.clearCards(); // 别让这张卡飘到后面那些检查的画面上
    g.player.removeRelic('lampburst');
    g.player.recomputeStats();
  });

  // ── 3a2b. 拨芯（C）：真按键 → 火真的矮下去（像素量出来）、油烧得更慢、油条挂牌子 ──
  // 这一版第一次把"灯火烧多旺"交给玩家，而它的四个乘数住在代码的不同角落——
  // 离线测试钉的是数，这里钉的是"这一条链子真的接上了"：键盘 → 主循环 → 玩家 → 画面。
  const wickRead = () =>
    page.evaluate(() => {
      const p = window.__WICKLIGHT__.game.player;
      return {
        on: p.wickOn,
        wick: +p.wick.toFixed(2),
        r: Math.round(p.lightRadius),
        bright: +p.brightness.toFixed(3),
        chip: document.querySelector('.bar--oil')?.classList.contains('is-dim') ?? null,
      };
    });
  // ⚠ 像素那一条要先把场面清干净再量（v70 补的）：这一条量的是**拨芯**，
  //   不该被"刚好有一座点着的灯台 / 一堆怪在眼前发光 / 地上还躺着一盏分出去的灯"影响——
  //   那些光不跟着灯芯走，会把"暗下去多少"这个读数稀释掉（实测撞到过：litFrac 只掉了 17%）。
  const cleanScene = () =>
    page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      g.enemies.clear();
      g.projectiles.clear();
      g.pickups.clear();
      g.particles.clear();
      g.lamps.length = 0;
      g.player.oil = 0.6;
    });
  await cleanScene();
  await sleep(120);
  const lit0 = await page.evaluate(() => window.__PROBE__.canvasStats());
  const wick0 = await wickRead();
  await page.keyboard.press('KeyC');
  await sleep(650);
  const lit1 = await page.evaluate(() => window.__PROBE__.canvasStats());
  const wick1 = await wickRead();
  expect(wick1.on === true && wick1.wick === 1, '按 C 拨芯：灯芯该拨到底', JSON.stringify(wick1));
  expect(
    Math.abs(wick1.r - wick0.r * 0.5) <= 2,
    '拨芯把灯火半径砍掉一半（索敌范围也跟着缩）',
    `半径 ${wick0.r} → ${wick1.r}`,
  );
  expect(wick1.bright < wick0.bright * 0.6, '亮度跟着掉（火是真的矮下去了）', `${wick0.bright} → ${wick1.bright}`);
  expect(
    lit1.litFrac < lit0.litFrac * 0.6,
    '画面真的暗下去：被照亮的那一片少掉六成以上（这是这个动作真正的代价）',
    `litFrac ${lit0.litFrac} → ${lit1.litFrac}，mean ${lit0.mean} → ${lit1.mean}`,
  );
  expect(wick1.chip === true, '灯油条上挂起「拨芯」的牌子', JSON.stringify(wick1));
  await shot('03j-wick');

  // 拨回来：火要真的回到原来那个量级。
  // ⚠ 这里不能拿"半径 == 拨芯之前那个数"去比：这几秒钟里油一直在烧，灯火半径本来就跟着油在掉
  //   （320px → 160px 与 300px → 150px 都是"拨掉一半"）。要比的是**拨芯消掉的那一半回来了**。
  await page.keyboard.press('KeyC');
  await sleep(750);
  const wickBack = await wickRead();
  expect(
    wickBack.on === false && wickBack.wick === 0 && wickBack.r > wick1.r * 1.7 && wickBack.bright > wick1.bright * 1.7,
    '再按一下拨回来：灯火回到原样（半径与亮度都回到没拨的那个量级）',
    JSON.stringify(wickBack) + ` 拨芯时 ${JSON.stringify(wick1)}`,
  );
  expect(wickBack.chip === false, '油条上的「拨芯」牌子收起来', JSON.stringify(wickBack));

  // 油耗：同一个人、同样站着不动 1 秒，拨着芯烧的油该只有三成五。
  // 先把场上的东西清掉再量：捡到一滴油都会让这 1 秒的读数失真（这一条量的是"烧掉多少"）。
  const burnOf = async () => {
    await page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      g.enemies.clear();
      g.pickups.clear();
      g.player.oil = 0.6;
    });
    const a = await page.evaluate(() => window.__WICKLIGHT__.game.player.oil);
    await sleep(1000);
    const b = await page.evaluate(() => window.__WICKLIGHT__.game.player.oil);
    return a - b;
  };
  const burnFull = await burnOf();
  await page.keyboard.press('KeyC');
  await sleep(650);
  const burnDim = await burnOf();
  const burnRatio = burnDim / burnFull;
  expect(
    Math.abs(burnRatio - 0.35) < 0.08,
    '拨着芯每秒烧掉的油是原来的三成五（一桶油从 55 秒变成 158 秒）',
    `实测 ${burnRatio.toFixed(3)}（${burnDim.toFixed(4)} / ${burnFull.toFixed(4)}）`,
  );
  await page.keyboard.press('KeyC'); // 拨回来，后面的检查照旧
  await sleep(650);

  // ── 3a2c. 「拨芯」这条线（四件遗物）：界面得能把它读出来，面板也不许被撑破 ──
  // 离线测试（tests/wickrelics.test.mjs）量的是四个数各自生效、以及"没拨芯时一个都不许动"。
  // 这里量的是**另一件事**：四件都是有条件（拨着芯）的加成，而玩家唯一能读到这个条件的地方
  // 就是「灯火」那一栏加上海报上那枚牌子——所以真浏览器里要看到它们被写出来，
  // 而且多出的这一行不许把 1280×720 的面板撑出去（一行一行加下去，最容易撞到的就是这里）。
  const familyIds = ['wickveil', 'wickember', 'wickstride', 'wickthrift'];
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, familyIds);
  await page.keyboard.press('KeyC'); // 拨着芯
  await sleep(650);
  await page.keyboard.press('Tab');
  await sleep(300);
  const famText = await page.evaluate(() => document.querySelector('.lo-light')?.textContent ?? '');
  const famLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  // ⚠ 面板是 `max-height: 92vh; overflow: auto` 的滚动容器：这一栏本来就在折线以下，
  //   所以要先把它滚进视野再量——量的不是"它恰好在第一屏里"，而是"它滚得进来、且不越界"
  //   （面板一多行就滚不到底，那才是真会出事的那种坏法）。
  await page.evaluate(() => document.querySelector('.lo-light')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const famLight = await page.evaluate(() => window.__PROBE__.layout('.lo-light'));
  expect(famLight.issues.length === 0, '「灯火」那一栏滚得进视野、也不越界', famLight.issues.join('; '));
  expect(famLayout.hOverflow === 0, '总览没有被撑出横向滚动', `hOverflow=${famLayout.hOverflow}`);
  expect(famLayout.issues.length === 0, '带满四件拨芯遗物的构筑总览布局正常', famLayout.issues.join('; '));
  for (const [name, bit] of [['遮光', '减伤 25%'], ['暗火', '+1 层灼烧'], ['夜步', '移速 +12%'], ['守芯', '每秒回油']]) {
    expect(famText.includes(name) && famText.includes(bit), `「灯火」栏写出 ${name}（${bit}）`, famText.slice(0, 200));
  }
  expect(!/undefined|NaN/.test(famText), '「灯火」栏没有缺字段', famText);
  await shot('03k-wick-family');

  // 图鉴里那条「机制：拨芯」也要点出这四件：玩家是在那里学会"它们是为一件事准备的"
  const codexWick = await page.evaluate(() => {
    const e = window.__WICKLIGHT__.game.codex.entry('mechanic:wick');
    return { name: e?.name, text: JSON.stringify(e?.rows ?? []) + (e?.extra ?? '') };
  });
  expect(
    codexWick.text.includes('遮光') && codexWick.text.includes('守芯'),
    '图鉴的「拨芯」条目里点出了这四件遗物',
    codexWick.text.slice(-180),
  );

  // 反过来（v72）：**已经按过 C 的人**不该再吃"要你先按 C"那张卡——他早就知道按一下会发生什么。
  // 这里把"讲过了没有"的开关和记录都清掉、四件又都在身上，再扫一遍：图鉴那条 `mechanic:wick` 自己会拦住它。
  const wickNoRepeat = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.tips = (g.save.tips ?? []).filter((k) => k !== 'relic:wick-family');
    g.wickHintDone = false;
    const knows = g.codex.has('mechanic', 'wick');
    g.scanWickFamily();
    return { knows, recorded: (g.save.tips ?? []).includes('relic:wick-family') };
  });
  expect(
    wickNoRepeat.knows && wickNoRepeat.recorded === false,
    '已经按过 C 的人不该再吃一张「要你先按 C」',
    JSON.stringify(wickNoRepeat),
  );

  // 收尾：这一局要还原（后面还有别的检查在跑，不能让这四件留在身上，也不能让灯芯留在拨小的状态）
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.relics.delete(id);
    g.player.recomputeStats();
  }, familyIds);
  await page.keyboard.press('KeyC'); // 拨回来
  await sleep(650);
  const famRestored = await page.evaluate(() => {
    const p = window.__WICKLIGHT__.game.player;
    return { on: p.wickOn, wick: +p.wick.toFixed(2), family: [...p.relics].filter((r) => r.startsWith('wick')).length };
  });
  expect(
    famRestored.on === false && famRestored.wick === 0 && famRestored.family === 0,
    '这一条检查完，灯芯与那四件都还原（后面的检查照旧）',
    JSON.stringify(famRestored),
  );

  // ── 3a3. 掠影：贴着危险擦过去算数、不挨打，脚边那圈符文真的画出来了 ──
  // 这一版新加的核心规则，所以用真键盘 + 真像素验一遍，而不是只跑离线测试。
  /**
   * 脚边那圈符文有没有真的画出来：同一个位置、同一个人不动，先采一份"没热度"的画面，
   * 再把热度调上去采第二份，数一数**变亮了多少个像素**。
   * 不用"数琥珀色像素"那种写法：灯火本身也是暖色，一路扫过去全是干扰。
   */
  const ringShot = () =>
    page.evaluate(() => {
      const r = window.__WICKLIGHT__.game.renderer;
      const g = window.__WICKLIGHT__.game;
      const s = g.camera.worldToScreen(g.player.x, g.player.y);
      const dpr = r.dpr;
      const x = Math.max(0, Math.round((s.x - 70) * dpr));
      const y = Math.max(0, Math.round((s.y - 6) * dpr));
      const w = Math.round(140 * dpr);
      const hh = Math.round(52 * dpr);
      return [...r.canvas.getContext('2d').getImageData(x, y, w, hh).data];
    });
  const ringDiff = (a, b) => {
    let brighter = 0;
    for (let i = 0; i < a.length; i += 4) {
      const l0 = a[i] + a[i + 1] + a[i + 2];
      const l1 = b[i] + b[i + 1] + b[i + 2];
      if (l1 - l0 > 36) brighter += 1;
    }
    return brighter;
  };

  const grazeSetup = () =>
    page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      g.enemies.clear();
      g.projectiles.clear();
      g.player.x = 0;
      g.player.y = 0;
      g.player.vx = 0;
      g.player.vy = 0;
      g.player.heat = 0;
      g.grazeCount = 0;
      g.player.blazeTimer = 0;
      g.player.stats.maxHp = 1e6;
      g.player.hp = 1e6;
      // 怪摆在路线旁边 44px：接触距离 27、掠影带再往外 32 → 落在带子里，又碰不到
      const e = g.enemies.spawn('shade', 70, -44, 1, 1);
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.speed = 0;
      e.spawnTimer = 0;
      return true;
    });

  await grazeSetup();
  await sleep(160);
  await page.keyboard.down('KeyD');
  let grazed = 0;
  for (let i = 0; i < 12 && grazed === 0; i += 1) {
    await sleep(120);
    grazed = await page.evaluate(() => window.__WICKLIGHT__.game.grazeCount);
  }
  await sleep(160);
  await page.keyboard.up('KeyD');
  await sleep(120);
  const graze = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return {
      count: g.grazeCount,
      heat: +g.player.heat.toFixed(2),
      hp: Math.round(g.player.hp),
      tip: (g.save.tips ?? []).includes('verb:graze'),
    };
  });
  expect(graze.count > 0, '贴着怪擦过去算了一次「掠影」', JSON.stringify(graze));
  expect(graze.heat > 0, '掠影真的攒上了热度', JSON.stringify(graze));
  expect(graze.hp >= 1e6, '擦过去不该挨打（这一条是"贴着走"能成立的前提）', `hp=${graze.hp}`);
  expect(graze.tip, '第一次掠影弹了那张说明卡');
  // 符文本身：把热度调上去，同一个人、同一个位置，脚边那一块该明显变亮
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.player.heat = 0;
    g.player.blazeTimer = 0;
  });
  await sleep(420);
  const ringBefore = await ringShot();
  await page.evaluate(() => {
    window.__WICKLIGHT__.game.player.heat = 18;
  });
  await sleep(420);
  const ringAfter = await ringShot();
  const lit = ringDiff(ringBefore, ringAfter);
  expect(lit > 40, '脚边那圈符文真的画出来了（热度一涨，那片像素就亮起来）', `变亮像素 ${lit} 个`);

  // 攒满 → 灯焰高涨：灯该真的变亮（半径 +30%）
  const blaze = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.player.heat = 27.9;
    const before = g.player.lightRadius;
    return { before };
  });
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 16; i += 1) {
    await sleep(120);
    if (await page.evaluate(() => window.__WICKLIGHT__.game.player.blazing)) break;
  }
  await page.keyboard.up('KeyD');
  const blazeAfter = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { on: g.player.blazing, light: g.player.lightRadius, count: g.player.blazeCount };
  });
  expect(blazeAfter.on && blazeAfter.count === 1, '攒满就点着「灯焰高涨」', JSON.stringify(blazeAfter));
  expect(
    blazeAfter.light > blaze.before * 1.2,
    `灯焰高涨期间灯火明显更远（${Math.round(blaze.before)} → ${Math.round(blazeAfter.light)}）`,
  );
  // ── 3a4. 焰路：掠影那套东西在界面上真的接上了 ──
  // 热度攒在脚边那圈符文上，一闪就过去了；构筑总览是唯一能"停下来读"的地方，
  // 所以它必须写清三件事：这条线走起来没有、现在到哪儿了、身上那些围绕它的东西改了什么数。
  await page.keyboard.press('Tab');
  await sleep(260);
  const sheetGraze = await page.evaluate(() => {
    const html = document.getElementById('ui-root').innerHTML;
    return {
      state: window.__WICKLIGHT__.game.state,
      graze: html.includes('掠影'),
      heat: html.includes('热度'),
      blaze: html.includes('灯焰高涨中'),
      count: (html.match(/本局掠影\s*\d+\s*次/) ?? [''])[0],
    };
  });
  expect(sheetGraze.state === 'loadout', 'Tab 打开构筑总览', sheetGraze.state);
  expect(sheetGraze.graze, '构筑总览里有一栏「掠影」');
  // 烧着的时候那一行写的是"还剩多久"，没烧着才写"热度 n/22"——两者必居其一
  expect(sheetGraze.heat || sheetGraze.blaze, '总览里写出当前热度（烧着时写成还剩多久）', JSON.stringify(sheetGraze));
  expect(sheetGraze.blaze, '烧着的时候总览里写明「灯焰高涨中」', JSON.stringify(sheetGraze));
  expect(sheetGraze.count.length > 0, '总览里写出本局掠影次数', sheetGraze.count);
  // 图鉴多了一章「机制」：擦过一次、点着过一次，两条都该记上，而且点得开、查得到数值。
  // 趁总览还开着（世界是停住的）翻一眼图鉴，翻完再翻回来——免得这一局在后台被人打。
  const mech = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.ui.showScreen('codex');
    const html = document.getElementById('ui-root').innerHTML;
    const entry = g.codex.entry('mechanic:blaze');
    const rows = entry ? entry.rows.length : 0;
    g.ui.showScreen('loadout');
    return {
      graze: g.codex.has('mechanic', 'graze'),
      blaze: g.codex.has('mechanic', 'blaze'),
      total: g.codex.sectionTotal('mechanic'),
      chapter: html.includes('机制'),
      named: html.includes('灯焰高涨'),
      rows,
      bad: /undefined|NaN/.test(html),
    };
  });
  expect(mech.graze && mech.blaze, '第一次擦身 / 第一次点着焰都记进了图鉴「机制」章', JSON.stringify(mech));
  expect(mech.total >= 2 && mech.chapter, '图鉴里多出一章「机制」', JSON.stringify(mech));
  expect(mech.named && mech.rows >= 5 && !mech.bad, '这一章的条目有名字、有数值、没有缺字段', JSON.stringify(mech));

  await page.keyboard.press('Tab');
  await sleep(200);
  expect(
    await page.evaluate(() => window.__WICKLIGHT__.game.state === 'playing'),
    '再按一次 Tab 回到战斗（总览只是"停下来看一眼"，不该把这一局憋住）',
  );

  // 截图前把卡片清掉、等镜头跟上：这张图要看的是**脚边那圈符文**，不是公告
  await page.evaluate(() => {
    document.getElementById('toast-root').innerHTML = '';
    document.querySelector('.announce').className = 'announce';
  });
  await sleep(600);
  await shot('03c-graze-blaze');
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.player.blazeTimer = 0;
    g.player.heat = 0;
    g.player.x = 0;
    g.player.y = 0;
    g.enemies.clear();
  });
  await sleep(200);

  // ── 3a5. 伏灯：跑着撒、上弦之后踩得响、地上那盏灯真的画出来了 ──
  // 这是"位置"的第二种用法（第一种是掠影）。位置这件事全落在地皮上，
  // 所以"跑着撒"要用真键盘跑一段才算数，光在离线测试里调 placeMine 证明不了。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    g.projectiles.clear();
    g.mines.length = 0;
    g.mineCount = 0;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    // 这一段只留伏灯：要量的是"上弦那半秒踩上去吃不吃伤害"，
    // 别的武器（守夜人开局那个火环就够得着 240px 外）会把账搅乱。
    // 不用 recomputeStats —— 那是重算属性，会把这一局撑到 1e6 的血量收回去。
    window.__SAVED_WEAPONS__ = [...p.weapons.entries()];
    p.weapons.clear();
    p.weapons.set('mine', 3);
  });
  await sleep(120);
  await page.keyboard.down('KeyD');
  await sleep(700);
  await page.keyboard.up('KeyD');
  await sleep(200);
  const dropped = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const m = g.mines[0];
    return { n: g.mines.length, px: Math.round(g.player.x), mx: m ? Math.round(m.x) : null, count: g.mineCount };
  });
  expect(dropped.n > 0, '按着方向键跑，身后会留下伏灯', JSON.stringify(dropped));
  expect(dropped.mx !== null && dropped.mx < dropped.px, '它撒在**身后**，不是脚底下', JSON.stringify(dropped));
  expect(dropped.count > 0, '布下的颗数记在结算里', `mineCount=${dropped.count}`);

  // 上弦 / 触发：自己摆一枚离人 240px 的雷，再往雷上放一只石守。
  // 离人远是为了量得干净——人这半秒里什么都不做，它吃到的每一滴血都只可能来自伏灯。
  const staged = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    // 场上原来那些怪要清掉：它们会把这只石守从雷心上挤开（怪与怪之间会让位），
    // 那这一炸吃到的就成了边缘的衰减伤害（实测撞到过一次 41，判据是"正中该吃满 60"）。
    g.enemies.clear();
    g.mines.length = 0;
    g.placeMine(240, 0, 60, 80, 40, 0, 'mine');
    window.__MINE__ = g.mines[0];
    const e = g.enemies.spawn('bulwark', 240, 0, 1, 0);
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.speed = 0;
    window.__MINE_TARGET__ = e;
    return { arm: +g.mines[0].arm.toFixed(2) };
  });
  expect(staged.arm > 0, '刚放下的伏灯还在上弦', JSON.stringify(staged));
  await sleep(220);
  const still = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { gone: !g.mines.includes(window.__MINE__), hp: Math.round(window.__MINE_TARGET__.hp) };
  });
  expect(!still.gone, '上弦还没走完：石守站在雷上也踩不响', JSON.stringify(still));
  expect(still.hp === 1e6, '那半秒里踩上去不该吃一点伤害', `hp=${still.hp}`);
  await sleep(760);
  const boom = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { gone: !g.mines.includes(window.__MINE__), hp: Math.round(window.__MINE_TARGET__.hp) };
  });
  expect(boom.gone, '上弦之后被踩到就炸了（那颗从地上消失）', JSON.stringify(boom));
  expect(boom.hp <= 1e6 - 50, '这一炸真的打到了踩上来的那只（正中该吃满 60）', `hp=${boom.hp}`);

  // 画面上：伏灯是"看得见的一盏灯"，不是一颗隐形的雷。
  // 同一个窗口，先在没有雷的时候采一次，再摆上两颗（都上弦好，触发圈也画出来）采第二次。
  const mineShot = () =>
    page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      const r = g.renderer;
      const s = g.camera.worldToScreen(g.player.x, g.player.y);
      const dpr = r.dpr;
      const x = Math.max(0, Math.round((s.x + 6) * dpr));
      const y = Math.max(0, Math.round((s.y - 76) * dpr));
      const w = Math.round(130 * dpr);
      const hh = Math.round(160 * dpr);
      return [...r.canvas.getContext('2d').getImageData(x, y, w, hh).data];
    });
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    // 清场：刚才那只石守就站在雷旁边，留着他这一枪会当场炸掉，
    // 像素比对与截图都会变成一团白光（雷要"静静地摆着"才看得出它长什么样）
    g.enemies.clear();
    g.mines.length = 0;
  });
  await sleep(360);
  const noMine = await mineShot();
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.placeMine(g.player.x + 70, g.player.y, 40, 60, 34, 2, 'mine');
    g.placeMine(g.player.x + 70, g.player.y + 58, 40, 60, 34, 0, 'mine');
    g.mines.forEach((m) => {
      m.arm = 0;
    });
  });
  await sleep(360);
  const withMine = await mineShot();
  const litMine = ringDiff(noMine, withMine);
  expect(litMine > 40, '地上那盏伏灯真的画出来了（摆了雷，那片像素亮起来）', `变亮像素 ${litMine} 个`);
  await shot('03d-mine');

  // ── 3a6. 连爆：一蹦一蹦地烧过去，不是同一帧一起炸 ──
  // 四颗雷排成一条线（间距 50px < 一颗的爆炸半径 60px），石守站在离人最近的那颗上
  // （它半径 22 + 触发 40 = 62，挨着的那颗也在它的圈里——所以这里顺带验了
  // "一帧只响一颗、而且响离怪最近的那一颗"）。
  // 这一段必须是**真的帧**：引信烧的是真时间，离线测试里把 arm 抹成 0 再空跑推不出
  // "每一节各占一帧"。采样器挂在 requestAnimationFrame 上，逐帧记'还活着哪几颗、哪几颗引信在烧'。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    g.projectiles.clear();
    g.mines.length = 0;
    g.mineChainBest = 0;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    // 这一局手里那把伏灯会一直往地上撒新的雷（站着不动就撒在脚边），把账搅乱——先摘掉。
    // （3a5 结尾本来就要把武器还回去，这里不必自己恢复。）
    p.weapons.clear();
    [150, 200, 250, 300].forEach((x, i) => {
      g.placeMine(x, 0, 40, 60, 40, 0, 'mine');
      g.mines[g.mines.length - 1].cid = i;
      g.mines[g.mines.length - 1].arm = 0;
    });
    // 这一波还在刷怪。引信只隔 0.09 秒，随便一只新刷出来的影蛭踩歪一颗，
    // "一串四颗"就量不干净了——把导演挂起一会儿（下面原样还回去），场上只留摆好的那一只。
    const d = g.director;
    window.__DIR__ = { phase: d.phase, intro: d.introTimer, spawn: d.spawnTimer, spawned: d.spawned, wave: d.wave, hazard: d.hazardTimer };
    d.phase = 'intro';
    d.introTimer = 1e9;
    d.hazardTimer = 1e9;
    const e = g.enemies.spawn('bulwark', 150, 0, 1, 0);
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.speed = 0;
    e.spawnTimer = 0;
    const log = [];
    let shotData = null;
    let frames = 0;
    let blown = 0;
    let prevLen = 4;
    const step = () => {
      const gg = window.__WICKLIGHT__.game;
      const mine = gg.mines.filter((m) => m.cid !== undefined);
      log.push({
        alive: mine.map((m) => m.cid),
        lit: mine.filter((m) => m.fuse > 0).map((m) => m.cid),
        foes: gg.enemies.count,
      });
      // 引信正烧着的那一帧把画面存下来：一蹦一蹦中间的样子，截图才拍得到。
      // 特意等火花烧到半路（而不是刚点着那一帧）——刚点着的时候火花头还贴在上一颗的残骸上，
      // 图里看不出"有一根引信正在烧"。引信总共约 5 帧，blow 过半大概落在第 2~3 帧。
      if (mine.length < prevLen) blown += 1;
      prevLen = mine.length;
      // 等烧到第二跳之后再截：头一炸的白光还盖在地上，引信那点火花画在一团爆闪旁边就等于没画。
      // 第二跳的起点是上一颗的残骸（一颗熄灭的小灯），火花这时候才看得清。
      const fuseMax = window.__WICKLIGHT__.data.mines.chainFuse;
      if (!shotData && blown >= 2 && mine.some((m) => m.fuse > 0 && m.fuse <= fuseMax * 0.8)) {
        shotData = gg.renderer.canvas.toDataURL('image/png');
      }
      frames += 1;
      if (frames < 90) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    window.__CHAIN__ = { log: () => log, shot: () => shotData };
  });
  await sleep(1700);
  const chain = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const c = window.__CHAIN__;
    return { log: c.log(), shot: c.shot(), best: g.mineChainBest, ach: g.save.achievements.includes('minechain') };
  });
  const chainLog = chain.log;
  // 第一响和"开局那四颗"之间必须比一次：引信是 0.09 秒，石守踩上去那一帧可能就落在
  // 第一个采样点之前（采样器挂上 rAF 的时候，世界已经又走过一帧了）——不垫这一下会漏掉头一响。
  const drops = [];
  let prev = [0, 1, 2, 3];
  for (let i = 0; i < chainLog.length; i += 1) {
    if (chainLog[i].alive.length < prev.length) drops.push(i);
    prev = chainLog[i].alive;
  }
  expect(
    chainLog.every((r) => r.foes === 1),
    '这 1.7 秒里场上只有摆好的那一只（没被新刷的怪踩歪）',
    `敌人数量 ${[...new Set(chainLog.map((r) => r.foes))].join('/')}`,
  );
  expect(drops.length === 4, '四颗雷全都响了', `响了几次：${drops.length}`);
  expect(new Set(drops).size === drops.length, '每颗各占一帧（不是同一帧一起炸）', JSON.stringify(drops));
  const gaps = drops.slice(1).map((f, i) => f - drops[i]);
  expect(
    gaps.every((d) => d >= 3 && d <= 12),
    '一节和一节之间隔着引信那 0.09 秒（约 5 帧）',
    `间隔帧数 ${JSON.stringify(gaps)}`,
  );
  const firstLit = chainLog[drops[0]]?.lit ?? [];
  expect(firstLit.length === 1, '第一炸只点着挨着它的那一颗（够不着的不点）', JSON.stringify(firstLit));
  expect(
    (chainLog[drops[0]]?.alive ?? []).length === 3,
    '这一炸只少一颗（另外三颗还在原地）',
    JSON.stringify(chainLog[drops[0]]?.alive),
  );
  expect(chain.best === 4, '最长的一串记 4 颗', `mineChainBest=${chain.best}`);
  expect(chain.ach, '串到 4 颗解「一串灯」');
  if (chain.shot) {
    await writeFile(join(SHOTS, '03e-mine-chain.png'), Buffer.from(String(chain.shot).split(',')[1], 'base64'));
    ok('连爆中间那一帧存了下来', '03e-mine-chain.png');
  } else {
    fail('连爆中间那一帧存了下来', '采样器没抓到引信烧着的那一帧');
  }

  // ── 3a7. 它是一盏灯：蛾拐过来扑它；吹灯客踩进来是把它吹灭 ──
  // 两条都只在地皮上成立，而且是"看几秒钟"才看得出来的事，所以放在真帧里跑一遍。
  const baitBefore = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.enemies.clear();
    g.mines.length = 0;
    g.player.x = 0;
    g.player.y = 0;
    // 灯摆在人斜上方 240px：蛾离灯 180px、离人 420px——扑最近的那盏光就该拐弯
    g.placeMine(0, -240, 40, 70, 40, 0, 'mine');
    g.mines[0].arm = 0;
    for (let i = 0; i < 3; i += 1) g.enemies.spawn('moth', -40 + i * 40, -420, 1, 0);
    return { mines: g.mines.length, hits: g.mineMothHits };
  });
  await waitGame(3, () => window.__WICKLIGHT__.game.mines.length === 0);
  const baited = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { mines: g.mines.length, hits: g.mineMothHits, alive: g.enemies.count };
  });
  expect(baitBefore.mines === 1, '灯摆好了', JSON.stringify(baitBefore));
  expect(baited.mines === 0, '蛾真的拐过来扑它，把灯踩响了', JSON.stringify(baited));
  expect(baited.hits > baitBefore.hits, '这一炸数到了蛾（「以灯为饵」的计数）', JSON.stringify(baited));
  expect(baited.alive < 3, '至少炸死了一只蛾', `剩 ${baited.alive} 只`);
  const snuffBefore = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.enemies.clear();
    g.mines.length = 0;
    g.placeMine(0, -120, 40, 70, 40, 0, 'mine');
    g.mines[0].arm = 0;
    const e = g.enemies.spawn('snuffer', 0, -190, 1, 0);
    e.hp = 1e6;
    e.maxHp = 1e6;
    return { snuffed: g.mineSnuffed, chains: g.mineChainBest, hp: Math.round(g.player.hp) };
  });
  await waitGame(2, () => window.__WICKLIGHT__.game.mines.length === 0);
  const snuffed = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { mines: g.mines.length, snuffed: g.mineSnuffed, chains: g.mineChainBest, hp: Math.round(g.player.hp) };
  });
  expect(snuffed.snuffed === snuffBefore.snuffed + 1, '吹灯客踩进圈里，那颗雷被吹灭', JSON.stringify(snuffed));
  expect(snuffed.mines === 0, '地上那颗没了');
  expect(snuffed.chains === snuffBefore.chains, '它没炸——连爆计数一动没动', JSON.stringify(snuffed));
  expect(snuffed.hp >= snuffBefore.hp, '玩家一滴血都没掉', `${snuffBefore.hp} → ${snuffed.hp}`);

  // 图鉴里认得这两件：名字与进化都该在
  const mineCodex = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return {
      mine: g.codex.entry('weapon:mine')?.name ?? '',
      chain: g.codex.entry('weapon:mine_chain')?.name ?? '',
      mech: g.codex.has('mechanic', 'mine'),
    };
  });
  expect(mineCodex.mine.includes('伏灯') && mineCodex.chain.includes('连珠'), '图鉴收录了伏灯与它的进化', JSON.stringify(mineCodex));
  expect(mineCodex.mech, '布过第一颗雷之后，图鉴「机制」章多出一条伏灯', JSON.stringify(mineCodex));

  // ── 3a5b. 「伏灯」这条线（四件遗物，v77）：把"把它放在那儿"这笔账也读出来 ──
  // 离线单测（tests/minerelics.test.mjs）量的是四个数各自生效（地上 6 → 8 颗、等 10 → 13 秒；
  // 排成一列时裸装串不起来、带接火能一路烧过去；蛾从 405px 外就闻得到并且炸死回油；
  // 踩响的那一圈在 1.2 秒里只走一半的路）。
  // 这里量的是**界面读不读得出来**：手里有伏灯的时候，构筑总览要多出「伏灯」那一栏
  // （撒了几颗、最长一串几颗、几只蛾是被灯引来的），而且那四件遗物要连条件一起写出来。
  const mineFamIds = ['minerack', 'minelink', 'minebait', 'minetrip'];
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, mineFamIds);
  await page.keyboard.press('Tab');
  await sleep(300);
  const mineFamText = await page.evaluate(() => document.querySelector('.lo-mine')?.textContent ?? '');
  const mineFamLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(mineFamLayout.hOverflow === 0, '加了伏灯那四件，总览仍没被撑出横向滚动', `hOverflow=${mineFamLayout.hOverflow}`);
  expect(mineFamLayout.issues.length === 0, '带满四件伏灯遗物的构筑总览布局正常', mineFamLayout.issues.join('; '));
  await page.evaluate(() => document.querySelector('.lo-mine')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const mineFamBlock = await page.evaluate(() => window.__PROBE__.layout('.lo-mine'));
  expect(mineFamBlock.count === 1, '手里有伏灯时，构筑总览多出「伏灯」那一栏', JSON.stringify(mineFamBlock));
  expect(mineFamBlock.issues.length === 0, '「伏灯」栏滚得进视野、也不越界', mineFamBlock.issues.join('; '));
  for (const bit of ['伏灯 · 地上', '本局撒了', '灯阵 地上 8 颗', '能等 13s', '接火 连爆 +45%', '香饵 引蛾 570px', '每只回 0.50%', '绊线 拖住 50%', '1.4s']) {
    expect(mineFamText.includes(bit), `「伏灯」栏写出「${bit}」`, mineFamText.slice(-260));
  }
  expect(!/undefined|NaN/.test(mineFamText), '「伏灯」栏没有缺字段', mineFamText);
  await shot('03l4-mine-family');
  const codexMineFam = await page.evaluate(() => {
    const e = window.__WICKLIGHT__.game.codex.entry('mechanic:mine');
    return { text: JSON.stringify(e?.rows ?? []) + (e?.extra ?? '') };
  });
  expect(
    Object.values(MINE_RELIC_NAME).every((n) => codexMineFam.text.includes(n)),
    '图鉴的「伏灯」条目里点出了这四件遗物',
    codexMineFam.text.slice(-200),
  );
  // 收尾：把塞进去的四件拿掉（后面的检查照旧）
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.removeRelic(id);
    g.player.recomputeStats();
  }, mineFamIds);
  await sleep(150);

  // 收尾：把这一段借走的东西还回去（武器、地上的雷、敌人），别让后面的段落量到别人的账
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.mines.length = 0;
    g.enemies.clear();
    if (window.__DIR__) {
      const d = g.director;
      d.phase = window.__DIR__.phase;
      d.introTimer = window.__DIR__.intro;
      d.spawnTimer = window.__DIR__.spawn;
      d.spawned = window.__DIR__.spawned;
      d.wave = window.__DIR__.wave;
      d.hazardTimer = window.__DIR__.hazard;
      delete window.__DIR__;
    }
    delete window.__CHAIN__;
    p.weapons.clear();
    for (const [id, lv] of window.__SAVED_WEAPONS__ ?? []) p.weapons.set(id, lv);
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    delete window.__SAVED_WEAPONS__;
    delete window.__MINE__;
    delete window.__MINE_TARGET__;
  });
  await sleep(200);

  // ── 3a8. 旋灯：把一群人拢到一点 ──
  // 这是这一版给玩家的**第三个**关于位置的动词：到 v56 为止，"位置"只有两个用法——
  // **你**站在哪儿（躲 / 擦）、**东西**放在哪儿（分灯 / 伏灯）。旋灯反过来：
  // **你决定它们站在哪儿**。所以这一段要证明的不是"它有伤害"，而是**它们真的在往一块儿靠**：
  // 离线测试能钉住吸力的数和帧率无关，但"拢"这件事是手感，得在真帧里逐帧看着才对得起这两个字。
  // 走的是真开火路径（给玩家一把旋灯，让它自己锁定最近那只怪开一炮），不是直接调 placeVortex。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    // 只留旋灯这一把：别的武器会当场把人打散，量出来的"靠近"就成了两件事叠加的结果
    window.__SAVED_WEAPONS2__ = [...p.weapons];
    p.weapons.clear();
    p.addWeapon('vortex');
    p.recomputeStats();
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    g.enemies.clear();
    g.projectiles.clear();
    g.mines.length = 0;
    g.vortexes.length = 0;
    g.vortexCount = 0;
    g.vortexBest = 0;
    // 这一波还在刷怪。新刷出来的一只走过来就会把"同时拽住几只"这个数搅乱——把导演挂起一会儿。
    const d = g.director;
    window.__DIRV__ = { phase: d.phase, intro: d.introTimer, spawn: d.spawnTimer, spawned: d.spawned, wave: d.wave, hazard: d.hazardTimer };
    d.phase = 'intro';
    d.introTimer = 1e9;
    d.hazardTimer = 1e9;
    // 四只站桩的怪挤在右前方一小片里：旋灯自动落在最近那只身上（也就是这片人的中间）
    const foes = [];
    for (const [x, y] of [[200, 0], [206, -34], [206, 34], [238, 6]]) {
      const e = g.enemies.spawn('shade', x, y, 1, 0);
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.speed = 0;
      e.spawnTimer = 0;
      foes.push(e);
    }
    const st = (window.__VORT__ = { foes, log: [], shot: null, center: null, base: 0, frames: 0, labels: [], rings: [] });
    // 收成那一下会多飘一个字、多一圈金环：这两样也得在真浏览器里量一遍（不是只有单测）。
    // 四只的场面收不成网——门槛是"一次 10 只"，所以这儿应该一个字都不多。
    const fl = g.floaters.label.bind(g.floaters);
    g.floaters.label = (x, y, text, color, size) => {
      st.labels.push({ text, color });
      return fl(x, y, text, color, size);
    };
    const sw = g.particles.shockwave.bind(g.particles);
    g.particles.shockwave = (x, y, color, size, life) => {
      st.rings.push(color);
      return sw(x, y, color, size, life);
    };
    const step = () => {
      const gg = window.__WICKLIGHT__.game;
      const v = gg.vortexes[0];
      if (v && !st.center) {
        st.center = { x: v.x, y: v.y };
        st.base = v.damage; // 收尾伤害 = 这个数 + 每拢住一只的奖励（下面要对账）
      }
      st.log.push({
        n: gg.vortexes.length,
        count: gg.vortexCount,
        best: gg.vortexBest,
        pos: st.foes.map((e) => [Math.round(e.x), Math.round(e.y)]),
      });
      // 转到一半那一帧把画面存下来：那时候三条旋臂、往里跑的碎屑、中心那点灯芯都在，
      // 而且被拽进来的怪正好挤在灯心里——"拢到一点"在图上看得见。
      if (!st.shot && v && v.life < v.maxLife * 0.62 && v.life > v.maxLife * 0.34) {
        st.shot = gg.renderer.canvas.toDataURL('image/png');
      }
      st.frames += 1;
      if (st.frames < 120) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await sleep(1900);
  const vort = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const st = window.__VORT__;
    return {
      log: st.log,
      center: st.center,
      shot: st.shot,
      base: st.base,
      labels: st.labels,
      rings: st.rings,
      net: g.save.achievements.includes('vortex_payoff'),
      left: g.vortexes.length,
      count: g.vortexCount,
      best: g.vortexBest,
      caught: g.vortexCaught,
      payoff: g.vortexPayoff,
      reward: window.__WICKLIGHT__.data.vortex.reward,
    };
  });
  const vLog = vort.log;
  expect(vort.count >= 1, '真开火路径真的扔出了一盏旋灯（走的 Player 那条分支，不是直接摆）', `vortexCount=${vort.count}`);
  expect(!!vort.center, '旋灯落在了场上（采样器抓到了它的位置）');
  const toCenter = (p) => Math.hypot(p[0] - vort.center.x, p[1] - vort.center.y);
  const meanOf = (r) => r.pos.reduce((a, p) => a + toCenter(p), 0) / r.pos.length;
  const spreadAtFire = meanOf(vLog.find((r) => r.n > 0) ?? vLog[0]);
  const closest = vLog.reduce((m, r) => Math.min(m, meanOf(r)), Infinity);
  expect(spreadAtFire > 30, '开炮那一刻人是散的（四只都在圈里、离灯心有一段距离）', `平均 ${spreadAtFire.toFixed(0)}px`);
  expect(
    closest < spreadAtFire - 18,
    '旋灯一转起来，它们真的被拽近了（是"拢"，不是"站着不动"）',
    `平均距离 ${spreadAtFire.toFixed(0)} → ${closest.toFixed(0)}px`,
  );
  expect(vort.best >= 3, '一个漩涡里同时拽住好几只（结算面板那个数真的会涨）', `一次拽住 ${vort.best} 只`);
  // 收网：收尾那一下的伤害 = 基础 + 每打到一只加一笔。这是 v58 给这把武器补的"回报"——
  // 拢得好不好，在它自己身上也有一笔账。
  expect(vort.caught >= 3, '收尾真的把拢住的那几只一起打了（数的是收尾圈里的，不是吸入圈里的）', `这一下打到 ${vort.caught} 只`);
  expect(
    vort.payoff === Math.round(vort.base + vort.reward * vort.caught),
    '收尾伤害对得上账（基础 + 每一只的奖励）',
    `${vort.base} + ${vort.reward} × ${vort.caught} = ${vort.payoff}`,
  );
  // 「收网」数的是**只数**，不是伤害：伤害随等级和灯火飘（同一个操作能差两倍），只数才不会。
  // 四只的场面离门槛（10 只）还远——所以这一局里飘字该是普通色、不该有金环、更不该解锁。
  const catchLine = vort.labels.find((l) => l.text.startsWith('收网 ') && l.text.includes('只'));
  expect(!!catchLine, '收网那一下头顶上飘出"按住了几只 · 伤害"', catchLine ? catchLine.text : vort.labels.map((l) => l.text).join(' / '));
  expect(catchLine.color === '#cfe8ff', '四只还不够门槛，那串字还是原来那个颜色（金色是收成了才给的）', catchLine?.color ?? '');
  expect(!vort.rings.includes('#ffd24e'), '没到门槛就不该有那一圈金环', vort.rings.join(' '));
  expect(vort.net === false, '四只的场面收不成网（门槛是一次 10 只）');
  const netRow = await page.evaluate(() => window.__WICKLIGHT__.game.ui.statsBlock());
  expect(netRow.includes('最狠的一网'), '结算面板里写出了"最狠的一网"', netRow.includes('一次拽住') ? '一次拽住那行也在' : '');
  expect(vLog.some((r) => r.n === 0) || vort.left === 0, '转完那 1.2 秒它就收了（不是一直挂在地上）', `剩 ${vort.left} 盏`);
  const vortCodex = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const mech = g.codex.entry('mechanic:vortex');
    return {
      w: g.codex.entry('weapon:vortex')?.name ?? '',
      m: g.codex.entry('weapon:vortex_maelstrom')?.name ?? '',
      k: g.codex.has('mechanic', 'vortex'),
      rows: (mech?.rows ?? []).map((r) => r[0]).join('/'),
    };
  });
  expect(vortCodex.w.includes('旋灯') && vortCodex.m.includes('漩涡'), '图鉴收录了旋灯与它的进化', JSON.stringify(vortCodex));
  expect(vortCodex.k, '扔出第一盏旋灯之后，图鉴「机制」章多出一条', JSON.stringify(vortCodex));
  expect(vortCodex.rows.includes('收网'), '图鉴里写清了「收网」这一行（拢得多，那一下才够疼）', vortCodex.rows);
  if (vort.shot) {
    await writeFile(join(SHOTS, '03f-vortex.png'), Buffer.from(String(vort.shot).split(',')[1], 'base64'));
    ok('漩涡转到一半的那一帧存了下来', '03f-vortex.png');
  } else {
    fail('漩涡转到一半的那一帧存了下来', '采样器没抓到那一帧');
  }
  // ── 3a8b. 「旋灯」这条线（四件遗物，v78）：把"你决定它们站在哪儿"这笔账也读出来 ──
  // 离线单测（tests/vortexrelics.test.mjs）量的是四个数各自生效（吸入半径 +18%、多转 0.3 秒，
  // 而且收尾圈跟着一起大；被拽住的挨打 ×1.25、出圈还留 0.5 秒；收网打到每一只回 0.4% 油；
  // 圈里的脚力砍掉 35%，而且它不把更狠的减速顶回去）。
  // 这里量的是**界面读不读得出来**：手里有旋灯（或挂着这一族的遗物）时，
  // 构筑总览要多出「旋灯」那一栏，而且那四件要连条件一起写出来。
  const vortexFamIds = ['vortexnet', 'vortexmark', 'vortexpress', 'vortexsnare'];
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, vortexFamIds);
  await page.keyboard.press('Tab');
  await sleep(300);
  const vortexFamText = await page.evaluate(() => document.querySelector('.lo-vortex')?.textContent ?? '');
  const vortexFamLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(vortexFamLayout.hOverflow === 0, '加了旋灯那四件，总览仍没被撑出横向滚动', `hOverflow=${vortexFamLayout.hOverflow}`);
  expect(vortexFamLayout.issues.length === 0, '带满四件旋灯遗物的构筑总览布局正常', vortexFamLayout.issues.join('; '));
  await page.evaluate(() => document.querySelector('.lo-vortex')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const vortexFamBlock = await page.evaluate(() => window.__PROBE__.layout('.lo-vortex'));
  expect(vortexFamBlock.count === 1, '挂着这一族的遗物时，构筑总览多出「旋灯」那一栏', JSON.stringify(vortexFamBlock));
  expect(vortexFamBlock.issues.length === 0, '「旋灯」栏滚得进视野、也不越界', vortexFamBlock.issues.join('; '));
  for (const bit of ['旋灯 · 本局转了', '张网 吸入 +18%', '多转 0.3s', '标灯 被拽住的挨打 +25%', '留 0.5s', '榨油 每只回 0.40%', '缠网 圈里慢 35%']) {
    expect(vortexFamText.includes(bit), `「旋灯」栏写出「${bit}」`, vortexFamText.slice(-260));
  }
  expect(!/undefined|NaN/.test(vortexFamText), '「旋灯」栏没有缺字段', vortexFamText);
  await shot('03l5-vortex-family');
  const codexVortexFam = await page.evaluate(() => {
    const e = window.__WICKLIGHT__.game.codex.entry('mechanic:vortex');
    return { text: JSON.stringify(e?.rows ?? []) + (e?.extra ?? '') };
  });
  expect(
    Object.values(VORTEX_RELIC_NAME).every((n) => codexVortexFam.text.includes(n)),
    '图鉴的「旋灯」条目里点出了这四件遗物',
    codexVortexFam.text.slice(-200),
  );
  // 收尾：把塞进去的四件拿掉（后面的检查照旧）
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.removeRelic(id);
    g.player.recomputeStats();
  }, vortexFamIds);
  await sleep(150);

  // 收尾：把这一段借走的东西还回去（武器、地上的漩涡、敌人、导演）
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.vortexes.length = 0;
    g.enemies.clear();
    p.weapons.clear();
    for (const [id, lv] of window.__SAVED_WEAPONS2__ ?? []) p.weapons.set(id, lv);
    p.recomputeStats();
    if (window.__DIRV__) {
      const d = g.director;
      d.phase = window.__DIRV__.phase;
      d.introTimer = window.__DIRV__.intro;
      d.spawnTimer = window.__DIRV__.spawn;
      d.spawned = window.__DIRV__.spawned;
      d.wave = window.__DIRV__.wave;
      d.hazardTimer = window.__DIRV__.hazard;
      delete window.__DIRV__;
    }
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    delete window.__VORT__;
    delete window.__SAVED_WEAPONS2__;
  });
  await sleep(200);

  // ── 3a8c. 「弃灯」这条线（四件遗物，v83）：把"这盏灯摆在哪一边"这笔账也读出来 ──
  // 分灯（E）是这一局里最老的一个动词，可到 v82 为止它是唯一一个"有教学卡、有手机按钮、
  // 有代价，却一件遗物都没有"的机制。这一版照老规矩一族一件补上四件，都挂在
  // **它被吃掉的那一帧**或者**它亮着的那几秒**上。
  // 离线单测（tests/lamprelics.test.mjs）量的是四个数各自生效；台架（tools/bench-lamp.mjs）量的
  // 是它到底买到了什么——灯摆在"追兵本来就要路过"的那条线上一点用都没有（挡住 0.0s），
  // 拐弯甩在身后才买到 3 秒多（见 README「已知取舍」）。
  // 这里量的是**界面读不读得出来**：手里有这一族的时候，构筑总览要多出「弃灯」那一栏，
  // 四件连条件一起写出来，而且真分下去一盏之后，"本局分了几盏"要跟着动。
  const lampFamIds = ['lampburst', 'lampshade', 'lampember', 'lamphaze'];
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, lampFamIds);
  await page.keyboard.press('Tab');
  await sleep(300);
  const lampFamLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(lampFamLayout.hOverflow === 0, '加了弃灯那四件，总览仍没被撑出横向滚动', `hOverflow=${lampFamLayout.hOverflow}`);
  expect(lampFamLayout.issues.length === 0, '带满四件弃灯遗物的构筑总览布局正常', lampFamLayout.issues.join('; '));
  await page.evaluate(() => document.querySelector('.lo-lamp')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const lampFamBlock = await page.evaluate(() => window.__PROBE__.layout('.lo-lamp'));
  expect(lampFamBlock.count === 1, '挂着这一族的遗物时，构筑总览多出「弃灯」那一栏', JSON.stringify(lampFamBlock));
  expect(lampFamBlock.issues.length === 0, '「弃灯」栏滚得进视野、也不越界', lampFamBlock.issues.join('; '));
  // 这一局在前面那段（按 E 分灯）里已经分过一盏了，所以这里量的是"真账"：先读一眼现在几盏，
  // 再分一盏，看这个数有没有跟着动——不是拿一个写死的 1 去对。
  const lampBefore = await page.evaluate(() => window.__WICKLIGHT__.game.lampCount);
  const lampFamText = await page.evaluate(() => document.querySelector('.lo-lamp')?.textContent ?? '');
  for (const bit of [
    `弃灯 · 本局分了 ${lampBefore} 盏`,
    '灯罩 引怪 +40% · 多亮 4s',
    '焚灯 被吃掉时炸 120px / 34 伤害',
    '拾灯 每只回 0.60%（一盏封顶 60%）',
    '灯晕 光里慢 30%',
  ]) {
    expect(lampFamText.includes(bit), `「弃灯」栏写出「${bit}」`, lampFamText.slice(-260));
  }
  expect(!/undefined|NaN/.test(lampFamText), '「弃灯」栏没有缺字段', lampFamText);
  await shot('03l6-lamp-family');
  const codexLampFam = await page.evaluate(() => {
    const e = window.__WICKLIGHT__.game.codex.entry('mechanic:lamp');
    return { text: JSON.stringify(e?.rows ?? []) + (e?.extra ?? '') };
  });
  expect(
    Object.values(LAMP_RELIC_NAME).every((n) => codexLampFam.text.includes(n)),
    '图鉴的「弃灯」条目里点出了这四件遗物',
    codexLampFam.text.slice(-200),
  );
  // 真分一盏下去：那一栏上的"本局分了几盏"得跟着动（不是一个只会写 0 的框）
  await page.keyboard.press('Tab');
  await sleep(250);
  const planted = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const lamps = g.lamps.length;
    g.lampCd = 0;
    g.player.oil = g.player.oilMax;
    const ok = g.tryPlantLamp();
    return { ok, lamps, after: g.lamps.length, count: g.lampCount, state: g.state };
  });
  expect(
    planted.ok && planted.after === planted.lamps + 1 && planted.count === lampBefore + 1,
    '这一栏量的是真账：真的分下去一盏',
    JSON.stringify({ ...planted, lampBefore }),
  );
  await page.keyboard.press('Tab');
  await sleep(300);
  const lampAfter = await page.evaluate(() => document.querySelector('.lo-lamp')?.textContent ?? '');
  expect(lampAfter.includes(`本局分了 ${lampBefore + 1} 盏`), `分完一盏之后，那一栏写成「本局分了 ${lampBefore + 1} 盏」`, lampAfter.slice(-200));
  // 收尾：把这一盏灯与塞进去的四件拿走，别让后面的段落量到别人的账
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    g.lamps.length = 0;
    g.lampCount = 0;
    g.lampBest = 0;
    g.lampOilBack = 0;
    for (const id of ids) g.player.removeRelic(id);
    g.player.recomputeStats();
  }, lampFamIds);
  await sleep(150);

  // ── 3a9. 倾灯：把灯火本身倒出去 ──
  // 到 v58 为止灯油只是一条"捡得越多越亮"的曲线（它同时是火力、视野、亮度）。
  // 倾灯是这一局里第一件**花油**的武器：倒出去一瓢，地上留下一片刻意烧给敌人看的火，
  // 代价是自己接下来暗一阵。离线单测钉住了数，这里要在真帧里看住四件事：
  //   ① 一瓢真的从灯的油桶里扣（不是凭空泼出一团火）；
  //   ② 地上真的多了一片**自己烧的**火，而且火里的怪被一层层续上灼烧；
  //   ③ 站在自己倒的火里**不掉血**（自动开火的武器不该罚玩家没按扳机）；
  //   ④ 往自家火上再倒一瓢，解「火上浇油」。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    window.__SAVED_WEAPONS3__ = [...p.weapons];
    p.weapons.clear();
    p.addWeapon('pour');
    p.recomputeStats();
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.oil = p.oilMax;
    p.stats.maxHp = 1e6;
    p.hp = 1e6;
    g.xpToNext = 1e9; // 打死的怪会给经验 → 升级面板一弹整局就暂停了
    g.enemies.clear();
    g.projectiles.clear();
    g.mines.length = 0;
    g.grounds.length = 0; // 场上只留这一瓢留下的火
    g.pourCount = 0;
    g.pourSpent = 0;
    // 这一波还在刷怪，新刷出来的一只走过来就会踩进火里、把"火里的怪"这个数搅乱——挂起导演
    const d = g.director;
    window.__DIRP__ = { phase: d.phase, intro: d.introTimer, spawn: d.spawnTimer, spawned: d.spawned, wave: d.wave, hazard: d.hazardTimer };
    d.phase = 'intro';
    d.introTimer = 1e9;
    d.hazardTimer = 1e9;
    // 一小撮站桩的怪挤在人右前方 75px 处：一瓢锁着最近那只落下，火心离人不到 50px——
    // 于是"人站在自己的火里"这件事在真帧里也成立，下面才量得出"不掉血"。
    const foes = [];
    for (const [x, y] of [[75, 0], [75, -9], [75, 9], [67, -5], [83, 5], [75, 17]]) {
      const e = g.enemies.spawn('bulwark', x, y, 1, 0);
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.speed = 0;
      e.spawnTimer = 0;
      foes.push(e);
    }
    const st = (window.__POUR__ = { foes, log: [], shot: null, oil0: p.oilFrac, hp0: p.hp, frames: 0 });
    const step = () => {
      const gg = window.__WICKLIGHT__.game;
      const fires = gg.grounds.filter((gr) => gr.ignites);
      const burn = Math.max(0, ...st.foes.map((e) => e.burn));
      st.log.push({
        pours: gg.pourCount,
        spent: gg.pourSpent,
        oil: gg.player.oilFrac,
        fires: fires.length,
        burn, // 火里那几只身上最多续到几层（"一层层叠上去"看的就是这个数在涨）
        hp: gg.player.hp,
        fx: fires.length ? Math.round(fires[0].x) : 0,
        fy: fires.length ? Math.round(fires[0].y) : 0,
        px: Math.round(gg.player.x),
        py: Math.round(gg.player.y),
      });
      // 火正烧着、怪也点着了的那一帧存下来：地上那片火 + 火里那几只头上的灼烧层数。
      // 特意等火落地半秒之后再截——刚炸开那一帧整屏都是爆闪和烟，火海在图上根本看不见。
      if (fires.length) st.fireFrames = (st.fireFrames ?? 0) + 1;
      if (!st.shot && burn >= 3 && (st.fireFrames ?? 0) >= 30) st.shot = gg.renderer.canvas.toDataURL('image/png');
      st.frames += 1;
      if (st.frames < 330) requestAnimationFrame(step); // 5.5 秒：够倒两瓢（冷却各 2.5 秒）
    };
    requestAnimationFrame(step);
  });
  await sleep(5600);
  const pour = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const st = window.__POUR__;
    return {
      log: st.log,
      shot: st.shot,
      oil0: st.oil0,
      hp0: st.hp0,
      pours: g.pourCount,
      spent: g.pourSpent,
      fires: g.grounds.filter((gr) => gr.ignites).length,
      douse: g.save.achievements.includes('pour_douse'),
      unit: window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour').levels[0].pour,
      minOil: window.__WICKLIGHT__.data.pour.minOil,
    };
  });
  const pLog = pour.log;
  const first = pLog[0];
  expect(pour.pours >= 1, '真开火路径真的倒出去了一瓢（走的是 Player 那条分支，不是直接摆一片火）', `pourCount=${pour.pours}`);
  expect(
    Math.abs(pour.spent - pour.unit * pour.pours) < 1e-6,
    '账面记下的就是这一瓢的油（一瓢 = 卡面上那个数）',
    `${pour.spent.toFixed(3)} vs ${pour.unit} × ${pour.pours}`,
  );
  expect(
    Math.abs(first.oil - (1 - pour.unit)) < 0.01,
    '倒完这一瓢，灯真的暗了一瓢（这就是它全部的代价）',
    `${(pour.oil0 * 100).toFixed(0)}% → ${(first.oil * 100).toFixed(1)}%`,
  );
  // 采样器挂上 rAF 的那一刻瓢还在半路上：火是几帧之后才落地的，所以看的是整段的峰值
  const maxFires = Math.max(0, ...pLog.map((r) => r.fires));
  expect(maxFires >= 1, '地上多了一片**自己烧的**火（`ignites` 那一片）', `fires=${maxFires}`);
  const maxBurn = Math.max(0, ...pLog.map((r) => r.burn));
  expect(maxBurn >= 3, '火里的怪被一层层续上灼烧（不是烧一下就算）', `最多续到 ${maxBurn} 层`);
  // ① 人确实站在自己的火里（不然"不掉血"这条是空话），② 而且真的不掉血
  const inFire = pLog.some((r) => r.fires && Math.hypot(r.px - r.fx, r.py - r.fy) <= 100);
  expect(inFire, '玩家确实一度站在自己倒的火圈里（火心离人不到 100px）', `火心 ${pLog.find((r) => r.fires)?.fx}`);
  expect(
    pLog.every((r) => r.hp === pour.hp0),
    '站在自己倒的火里一根汗毛都不掉（自动开火的武器不罚玩家）',
    `血量 ${pour.hp0} → ${pLog[pLog.length - 1].hp}`,
  );
  expect(pour.douse, `往自家火上再倒一瓢解「火上浇油」（门槛 ${pour.minOil} 那一片火里 5 只）`);
  const pourCodex = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const mech = g.codex.entry('mechanic:pour');
    return {
      w: g.codex.entry('weapon:pour')?.name ?? '',
      m: g.codex.entry('weapon:pour_tide')?.name ?? '',
      k: g.codex.has('mechanic', 'pour'),
      rows: (mech?.rows ?? []).map((r) => r[0]).join('/'),
    };
  });
  expect(pourCodex.w.includes('倾灯') && pourCodex.m.includes('灯潮'), '图鉴收录了倾灯与它的进化', JSON.stringify(pourCodex));
  expect(pourCodex.k, '倒出第一瓢之后，图鉴「机制」章多出一条', JSON.stringify(pourCodex));
  expect(pourCodex.rows.includes('一瓢多少钱'), '图鉴里写清了一瓢的油钱与那道门槛', pourCodex.rows);
  const pourRow = await page.evaluate(() => window.__WICKLIGHT__.game.ui.statsBlock());
  expect(pourRow.includes('倾灯') && pourRow.includes('桶油'), '结算面板里写出了"倾灯 n 瓢 · x 桶油"', pourRow.includes('倒完自己也暗一阵') ? '' : '');
  if (pour.shot) {
    await writeFile(join(SHOTS, '03g-pour.png'), Buffer.from(String(pour.shot).split(',')[1], 'base64'));
    ok('火海正烧着、怪被点着的那一帧存了下来', '03g-pour.png');
  } else {
    fail('火海正烧着、怪被点着的那一帧存了下来', '采样器没抓到那一帧');
  }
  // 倾灯的手动瞄准（桌面）：按住**鼠标右键**，指针指哪儿这一瓢就倒哪儿。
  // 和手机那一段（`mobile` 里那一块）是同一件事的两条输入路：编码一样（方向 + 力度），
  // 只是量"推了多远"的尺子不同（手指有自己的起点，鼠标没有，只能拿屏幕当行程）。
  // ⚠ 这里派发的是**真的鼠标事件**（page.mouse）：主循环每帧都用真实输入覆盖 `game.setInput`，
  //   从外面灌 `setInput` 打不过它（v62 在手机那条路上踩过）；顺带也证明右键没被浏览器
  //   的右键菜单吃掉（画布上 preventDefault 了 contextmenu——游戏里右键是"瞄准"）。
  const deskAim = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    g.projectiles.clear();
    g.grounds.length = 0;
    p.oil = p.oilMax;
    // 一只站在**右边**的怪：自动瞄准会锁它，所以"往左飞"只可能来自鼠标
    const e = g.enemies.spawn('shade', p.x + 90, p.y, 1, 0);
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.speed = 0;
    p.cooldowns.set('pour', 0.5); // 让那一瓢在按住右键之后才出去（不然它先按自动瞄准飞了）
    return { cx: Math.round(window.innerWidth / 2), cy: Math.round(window.innerHeight / 2) };
  });
  await page.mouse.move(deskAim.cx - 260, deskAim.cy);
  await page.mouse.down({ button: 'right' });
  await sleep(700);
  const deskHeld = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    const pour = window.__WICKLIGHT__.data.pour;
    const unit = window.__WICKLIGHT__.data.weapons.find((w) => w.id === 'pour').levels[0];
    const shots = (g.projectiles.all || []).filter((q) => q.active && q.poolRadius > 0);
    // 指针停在离人 260px 处、屏幕高 H：力度 = 260 / (H × 0.45)，落点按 POUR.aimNear 插值
    const pull = Math.min(1, 260 / (window.innerHeight * 0.45));
    return {
      shots: shots.length,
      vx: shots[0] ? Math.round(shots[0].vx) : 0,
      away: p.pourAim ? Math.round(p.pourAim.away) : -1,
      range: Math.round(unit.range),
      near: Math.round(unit.range * pour.aimNear),
      want: Math.round(unit.range * (pour.aimNear + (1 - pour.aimNear) * pull)),
    };
  });
  expect(deskHeld.shots >= 1, '按住右键时倾灯照常开火（它是自动开火的武器）', JSON.stringify(deskHeld));
  expect(deskHeld.vx < -1, '这一瓢往指针指的方向飞（怪在右边，自动瞄准会让它往右）', JSON.stringify(deskHeld));
  expect(
    deskHeld.away > deskHeld.near && deskHeld.away < deskHeld.range && Math.abs(deskHeld.away - deskHeld.want) <= 4,
    `按住右键时场上有落点标记，而且落点跟着指针推了多远走（${deskHeld.away}，期望 ≈ ${deskHeld.want}；近端 ${deskHeld.near} / 射程 ${deskHeld.range}）`,
  );
  await shot('03h-pour-aim-desktop');
  await page.mouse.up({ button: 'right' });
  await sleep(150);
  expect(
    await page.evaluate(() => window.__WICKLIGHT__.game.player.pourAim === null),
    '一松开右键就还给自动瞄准（落点标记也收起来）',
  );

  // 收尾：把这一段借走的东西还回去（武器、地上的火、敌人、导演、血上限）
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.grounds.length = 0;
    g.enemies.clear();
    p.weapons.clear();
    for (const [id, lv] of window.__SAVED_WEAPONS3__ ?? []) p.weapons.set(id, lv);
    p.recomputeStats();
    p.hp = p.stats.maxHp;
    if (window.__DIRP__) {
      const d = g.director;
      d.phase = window.__DIRP__.phase;
      d.introTimer = window.__DIRP__.intro;
      d.spawnTimer = window.__DIRP__.spawn;
      d.spawned = window.__DIRP__.spawned;
      d.wave = window.__DIRP__.wave;
      d.hazardTimer = window.__DIRP__.hazard;
      delete window.__DIRP__;
    }
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    delete window.__POUR__;
    delete window.__SAVED_WEAPONS3__;
  });
  await sleep(200);

  // ── 3a9b. 燎灯（v73）：灯光本身就是武器 ──
  // 离线单测（tests/aura.test.mjs）盯的是"光里挨打、光外不动""拨芯压下去多少"这些数，
  // 这里要在**真帧**里看住另外三件事——它们只有在真实的渲染循环 + 真实 DOM 里才成立：
  //   ① 光罩子的半径真的是 `player.lightRadius`（量出来是它，不是别的什么）；
  //   ② 一次脉冲把光里的**每一只**都烫一遍（一圈 10 只，一次心跳里 10 只全掉血）；
  //   ③ 构筑总览那一行写得出"光里全体"（不然"伤害 10"会被读成一件很弱的武器）。
  const aura = await page.evaluate(async () => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    window.__SAVED_WEAPONS4__ = [...p.weapons];
    window.__AURA_DIR__ = { phase: g.director.phase, intro: g.director.introTimer, wave: g.director.wave };
    p.weapons.clear();
    p.addWeapon('aura');
    p.recomputeStats();
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.oil = p.oilMax;
    p.stats.maxHp = 1e6;
    p.hp = 1e6;
    g.xpToNext = 1e9;
    g.enemies.clear();
    g.projectiles.clear();
    g.mines.length = 0;
    g.grounds.length = 0;
    g.director.phase = 'intro';
    g.director.introTimer = 1e9;
    g.director.hazardTimer = 1e9;
    // 先把"灯亮到多大"落定再摆靶：`lightRadius` 是每帧从油量重算的，直接读拿到的是**上一屏**
    // 那个人剩下的半径（实测 282 vs 落定后的 320），而"圈外"要按真的那一圈摆才对。
    p.oil = p.oilMax;
    g.setInput(0, 0, false, false);
    g.update(1 / 60);
    const R = p.lightRadius;
    // 一圈 10 只：全都在光圈里（0.8R），但只留 6 只活着——脉冲那一下要**一次**全打中
    const foes = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const e = g.enemies.spawn('shade', Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, 1, 0);
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.speed = 0;
      e.damage = 0;
      e.spawnTimer = 0;
      foes.push(e);
    }
    // 一只站在圈外（1.4R）：它一下都不该挨
    const out = g.enemies.spawn('shade', R * 1.4, 0, 1, 0);
    out.hp = 1e6;
    out.maxHp = 1e6;
    out.speed = 0;
    out.damage = 0;
    out.spawnTimer = 0;
    // 跑到"第一次脉冲"为止：逐帧看这一下打到了几只
    const hp0 = foes.map((e) => e.hp);
    const out0 = out.hp;
    let best = 0;
    // 顺手量"那一拍长什么样"：这一件不发射任何东西，所以"它开火了"只有画面上的那一圈，
    // 而那一圈**停在哪儿**就是它打得到哪儿——数记在放圈的那一刻（灯火是每帧从油量重算的）。
    const rings = [];
    // 每一拍顺手把"圈外那只"当时离人多远记下来：这一条要是红了，得能一眼看出
    // 是"光真的伸过去了"还是"它自己走进了光里"——只报一个 R 的话，这两种分不出来。
    const outsideGap = [];
    const shock = g.particles.shockwave.bind(g.particles);
    g.particles.shockwave = (x, y, color, size, life) => {
      rings.push({ size: +size.toFixed(2), at: +p.lightRadius.toFixed(2), life });
      outsideGap.push(+(Math.hypot(out.x - p.x, out.y - p.y) - size).toFixed(1));
      return shock(x, y, color, size, life);
    };
    for (let f = 0; f < 90; f += 1) {
      // 圈外那一只**钉住**：它旁边那些被烫飞的圈内怪会把它撞进光里（实测有一次被挪到 y=-91 才挨的），
      // 那是推挤的账，不是燎灯够得着。钉住它，这一条问的才是"光伸不伸得过去"。
      out.x = R * 1.4;
      out.y = 0;
      g.setInput(0, 0, false, false);
      g.update(1 / 60);
      const hit = foes.filter((e, i) => e.hp < hp0[i]).length;
      if (hit > best) best = hit;
    }
    return {
      R: Math.round(R),
      best,
      rings,
      outsideHp: out.hp === out0,
      // 红了才有用：它最后站在哪儿、还活不活跃（真挨了打 / 被谁挪了 / 被回收了，三种情况一眼分开）
      out: { x: Math.round(out.x), y: Math.round(out.y), gap: Math.round(Math.hypot(out.x - p.x, out.y - p.y) - p.lightRadius), hp: Math.round(out.hp), active: out.active },
      outsideGap,
      px: Math.round(p.x),
      py: Math.round(p.y),
      oil: +p.oilFrac.toFixed(2),
      dps: Math.round(g.damageBySource.get('aura') ?? 0),
    };
  });
  expect(aura.R > 240 && aura.R < 340, '燎灯的罩子就是玩家自己的灯火半径', JSON.stringify(aura));
  expect(aura.best >= 8, '一次脉冲把光里的每一只都烫一遍（不是只打最近的那一只）', JSON.stringify(aura));
  expect(aura.outsideHp, '光圈外的敌人一点都挨不到（它的射程写在灯火上）', JSON.stringify(aura));
  expect(aura.rings.length >= 2, '真帧里每一次心跳都放出一圈（不是"偶尔"）', JSON.stringify(aura.rings));
  expect(
    aura.rings.every((r) => Math.abs(r.size - r.at) < 1e-6 && Math.abs(r.life - 0.22) < 1e-6),
    '那一圈是从人身上扩出去、正好停在灯火半径上、0.22 秒走完',
    JSON.stringify(aura.rings),
  );
  await shot('03l-aura');

  // 构筑总览那一行：光里全体
  await page.keyboard.press('Tab');
  await sleep(300);
  const auraSheet = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.lo-row')].find((r) => r.textContent.includes('燎灯'));
    return { text: row?.textContent?.replace(/\s+/g, ' ').trim() ?? '', layout: window.__PROBE__.layout('.panel') };
  });
  expect(/燎灯/.test(auraSheet.text) && /光里全体/.test(auraSheet.text), '构筑总览把燎灯读成"光里全体"', auraSheet.text);
  expect(auraSheet.layout.issues.length === 0, '带燎灯的构筑总览布局正常', auraSheet.layout.issues.join('; '));
  await page.keyboard.press('Tab');
  await sleep(250);

  // 收尾：把这一段借走的东西还回去
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    p.weapons.clear();
    for (const [id, lv] of window.__SAVED_WEAPONS4__ ?? []) p.weapons.set(id, lv);
    p.recomputeStats();
    p.hp = p.stats.maxHp;
    if (window.__AURA_DIR__) {
      g.director.phase = window.__AURA_DIR__.phase;
      g.director.introTimer = window.__AURA_DIR__.intro;
      g.director.wave = window.__AURA_DIR__.wave;
      delete window.__AURA_DIR__;
    }
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    delete window.__SAVED_WEAPONS4__;
  });
  await sleep(200);

  // ── 3a9c. 「燎灯」这条线（四件遗物，v75）：界面得能把它读出来，而且和拨芯**共用同一栏** ──
  // 离线单测（tests/aurarelics.test.mjs）量的是四个数各自生效、同一拍里每只同价、空拍不回油。
  // 这里量的是**另一件事**：这四件改的是"亮着烧"这笔账的四个角，而玩家唯一能读到它们的地方
  // 就是构筑总览的「灯火」栏——四个数（三个加成 + 一个代价）要连条件一起被写出来，
  // 而且多出的这一行不许把 1280×720 的面板撑出去。它们和拨芯那四件**住在同一栏**是刻意的：
  // 玩家要读到的正是"一边收小、一边照宽，一局只该选一边"。
  const auraFamIds = ['auraflare', 'auralantern', 'aurasiphon', 'aurasmother'];
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, auraFamIds);
  await page.keyboard.press('Tab');
  await sleep(300);
  const auraFamText = await page.evaluate(() => document.querySelector('.lo-light')?.textContent ?? '');
  const auraFamLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(auraFamLayout.hOverflow === 0, '加了燎灯那四件，总览仍没被撑出横向滚动', `hOverflow=${auraFamLayout.hOverflow}`);
  expect(auraFamLayout.issues.length === 0, '带满四件燎灯遗物的构筑总览布局正常', auraFamLayout.issues.join('; '));
  // ⚠ 这一栏在 `max-height: 92vh; overflow: auto` 的面板里、本来就在折线以下：
  //   先把它滚进视野再量（和 3a2c 同一个做法）——量的是"滚得进来、且不越界"，
  //   面板一行一行加下去最容易出事的地方就是这里（滚不到底）。
  await page.evaluate(() => document.querySelector('.lo-light')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const auraFamLight = await page.evaluate(() => window.__PROBE__.layout('.lo-light'));
  expect(auraFamLight.issues.length === 0, '「灯火」栏滚得进视野、也不越界', auraFamLight.issues.join('; '));
  // 三个加成 + 漫光那一笔代价，一个都不能少：这一栏短一句，店里的说明就白写了
  for (const bit of ['旺火', '每多一只 +6%', '漫光', '灯火半径 +10%', '油烧快 12%', '吮灯', '烟熏']) {
    expect(auraFamText.includes(bit), `「灯火」栏写出「${bit}」`, auraFamText.slice(0, 240));
  }
  expect(!/undefined|NaN/.test(auraFamText), '「灯火」栏没有缺字段', auraFamText);
  await shot('03l2-aura-family');
  // 图鉴里那条「机制：燎灯」也要点出这四件（玩家是在那里学会"它们是为一件事准备的"）
  const codexAuraFam = await page.evaluate(() => {
    const e = window.__WICKLIGHT__.game.codex.entry('mechanic:aura');
    return { text: JSON.stringify(e?.rows ?? []) + (e?.extra ?? '') };
  });
  expect(
    Object.values({ auraflare: '旺火', auralantern: '漫光', aurasiphon: '吮灯', aurasmother: '烟熏' }).every((n) =>
      codexAuraFam.text.includes(n),
    ),
    '图鉴的「燎灯」条目里点出了这四件遗物',
    codexAuraFam.text.slice(-180),
  );
  // 收尾：把塞进去的四件拿掉（后面的检查照旧）
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.removeRelic(id);
    g.player.recomputeStats();
  }, auraFamIds);
  await sleep(150);

  // ── 3a9d. 「倾灯」这条线（四件遗物，v76）：把"把油泼出去"这笔账也读出来 ──
  // 离线单测（tests/pourrelics.test.mjs）量的是四个数各自生效（火烧到顶快三倍、火海半径与时长、
  // 死在你火里的怪回油并且**按瓢**封顶、站在自己火里少挨两成五）。
  // 这里量的是**界面读不读得出来**：这一族和拨芯 / 燎灯那两族住在**同一栏**里（三族买的是同一桶油），
  // 所以三族一起挂上时那一栏最长——窄屏 / 720p 上最容易出事的正是这一栏。
  const pourFamIds = ['pourstoke', 'pourladle', 'pourgather', 'pourward'];
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, pourFamIds);
  await page.keyboard.press('Tab');
  await sleep(300);
  const pourFamText = await page.evaluate(() => document.querySelector('.lo-light')?.textContent ?? '');
  const pourFamLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(pourFamLayout.hOverflow === 0, '加了倾灯那四件，总览仍没被撑出横向滚动', `hOverflow=${pourFamLayout.hOverflow}`);
  expect(pourFamLayout.issues.length === 0, '带满四件倾灯遗物的构筑总览布局正常', pourFamLayout.issues.join('; '));
  await page.evaluate(() => document.querySelector('.lo-light')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const pourFamLight = await page.evaluate(() => window.__PROBE__.layout('.lo-light'));
  expect(pourFamLight.issues.length === 0, '「灯火」栏滚得进视野、也不越界', pourFamLight.issues.join('; '));
  for (const bit of ['倾灯这套', '浇油', '每 0.6s 续 3 层', '大瓢', '多烧 1.2s', '拾油', '一瓢封顶 60%', '烬护', '自己火里减伤 25%']) {
    expect(pourFamText.includes(bit), `「灯火」栏写出「${bit}」`, pourFamText.slice(-260));
  }
  expect(!/undefined|NaN/.test(pourFamText), '「灯火」栏没有缺字段', pourFamText);
  await shot('03l3-pour-family');
  const codexPourFam = await page.evaluate(() => {
    const e = window.__WICKLIGHT__.game.codex.entry('mechanic:pour');
    return { text: JSON.stringify(e?.rows ?? []) + (e?.extra ?? '') };
  });
  expect(
    Object.values({ pourstoke: '浇油', pourladle: '大瓢', pourgather: '拾油', pourward: '烬护' }).every((n) =>
      codexPourFam.text.includes(n),
    ),
    '图鉴的「倾灯」条目里点出了这四件遗物',
    codexPourFam.text.slice(-200),
  );
  // 收尾：把塞进去的四件拿掉（后面的检查照旧）
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.removeRelic(id);
    g.player.recomputeStats();
  }, pourFamIds);
  await sleep(150);

  // ── 3a-2. 「余烬风」：不动血，动油 ──
  // 这一版新加的险境，真实浏览器里要证明三件事：
  //   ① 火种真的从**上风**一侧一排排飘过来（不是凭空刷在脸上）；
  //   ② 逆着风跑会被糊上一层层的火；
  //   ③ 一键冲刺（空格）当场把它抖干净——这是这个险境唯一的解。
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    const st = { log: [], shot: null };
    window.__EMBER__ = st;
    g.enemies.clear();
    g.projectiles.clear();
    g.grounds.length = 0;
    p.stats.maxHp = 1e6;
    p.hp = p.stats.maxHp;
    p.oil = p.oilMax;
    p.emberStacks = 0;
    g.handleHazard('emberwind');
    g.emberwindDirX = 1; // 风往东吹：往西（A 键）就是逆风
    g.emberwindDirY = 0;
    const c = document.querySelector('#game');
    const tick = () => {
      if (window.__EMBER__ !== st) return;
      st.log.push({ stacks: g.emberStacks, motes: g.embers.length, oil: p.oil });
      // 沾上第一层的那一帧存下来：那才是"身上带着火"的样子
      if (!st.shot && g.emberStacks > 0) st.shot = c.toDataURL('image/png');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down('a'); // 逆着风走
  // ⚠ 这里要**等条件**（沾上第一层），不能等一个固定的时长：离线台架上第一层落在
  // 1.2~2.1 秒（五颗种子），但浏览器里模拟时间的流速取决于帧率——模拟器上常常只有 30fps 上下，
  // 固定 2.6 秒的窗口会时不时地什么都等不到（这一版就撞到过两次，红在"峰值 0 层"上）。
  // 一阵风是 8 秒，等到 6 秒为止都是"还在这一阵风里"。
  await page.evaluate(async () => {
    const g = window.__WICKLIGHT__.game;
    const t0 = performance.now();
    while (g.emberStacks === 0 && performance.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 50));
  });
  const emberHeld = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    const st = window.__EMBER__;
    const west = g.embers.filter((m) => m.x < p.x - 200).length;
    return {
      dbg: {
        pyreNear: g.emberPyreNear,
        litPyres: g.level.pyres.filter((q) => q.lit).length,
        nearestLit: Math.round(Math.min(...g.level.pyres.filter((q) => q.lit).map((q) => Math.hypot(q.x - p.x, q.y - p.y)), 1e9)),
        px: Math.round(p.x), py: Math.round(p.y), stacksNow: p.emberStacks,
      },
      log: st.log,
      shot: st.shot,
      stacks: p.emberStacks,
      peak: Math.max(0, ...st.log.map((r) => r.stacks)),
      motes: g.embers.length,
      west,
      oil0: st.log[0]?.oil ?? -1,
      oil: p.oil,
      dir: [g.emberwindDirX, g.emberwindDirY],
    };
  });
  await shot('03i-emberwind');
  await page.keyboard.up('a');
  expect(emberHeld.motes > 0, '余烬风起风之后场上真的飘着火种', `motes=${emberHeld.motes}`);
  expect(
    emberHeld.dir[0] === 1 && emberHeld.dir[1] === 0 && emberHeld.west > 0,
    '火种是从上风一侧飘过来的（风往东吹，玩家西边就还有一排）',
    `风向 ${emberHeld.dir} · 西侧火种 ${emberHeld.west}`,
  );
  expect(emberHeld.peak >= 1, '逆着风跑会被火种糊上', `峰值 ${emberHeld.peak} 层 ${JSON.stringify(emberHeld.dbg)}`);
  // 顺带把"没有点亮的灯台"也钉住：这一版的「余烬风」多了第二条解（灯台的光会扑火），
  // 万一这一局的灯台是亮的，上面那条"糊上"就可能在量别的东西
  expect(emberHeld.dbg.litPyres === 0, '这一局里没有点亮的灯台（所以上面量到的层数都是火种糊上来的）', JSON.stringify(emberHeld.dbg));
  expect(emberHeld.oil < emberHeld.oil0, '沾上之后灯油一直在掉（它咬的是油，不是血）', `${emberHeld.oil0.toFixed(3)} → ${emberHeld.oil.toFixed(3)}`);
  // 冲刺 = 扑火。⚠ 看的是**冲刺那一帧**的层数，而不是"过一会儿再看一眼"：
  // 风还在吹、身上还飘着火种，冲刺清完的下一层随时会再糊上来（隔 0.4 秒就能来一层），
  // 固定等 200 毫秒再读，读到的是"新糊上的那一层"——量的是刷新的速度，不是冲刺的效果。
  // 所以按一个采样器把那一整段记下来，取最小值。
  const dashSampler = page.evaluate(async () => {
    const g = window.__WICKLIGHT__.game;
    const from = g.player.dashCount;
    let min = g.emberStacks;
    const t0 = performance.now();
    while (performance.now() - t0 < 700) {
      await new Promise((r) => setTimeout(r, 30));
      min = Math.min(min, g.emberStacks);
    }
    return { dashes: g.player.dashCount - from, min, peak: Math.max(min, g.emberStacks) };
  });
  await sleep(90); // 让采样器先跑起来，再按键
  // 按住一小会儿再松：主循环是**每帧轮询**按键状态的，按下和松开落在同一帧之间就什么都读不到
  await page.keyboard.down('Space'); // 冲刺 = 扑火
  await sleep(160);
  await page.keyboard.up('Space');
  const emberDash = await dashSampler;
  expect(emberDash.dashes > 0, '空格真的冲出去了（走的是真实键盘那条路）', JSON.stringify(emberDash));
  expect(emberDash.min === 0, '冲刺那一帧把身上的火全抖掉（哪怕风还在往身上糊新的）', JSON.stringify(emberDash));
  if (emberHeld.shot) {
    await writeFile(join(SHOTS, '03i-emberwind-stacked.png'), Buffer.from(String(emberHeld.shot).split(',')[1], 'base64'));
    ok('身上带着火的那一帧存了下来', '03i-emberwind-stacked.png');
  } else {
    fail('身上带着火的那一帧存了下来', '采样器没抓到');
  }

  // ── 3a-3. 「余烬风」的第二条解：跑向一盏亮着的灯 ──
  // 冲刺是"立刻那一个"，灯台是"跑过去站一会儿那一个"（见 data/emberwind.ts 的 pyreDecay）。
  // 这里在真实页面里验的是**接线**：亮着的灯台旁边，火种扑上来不再叠层、身上的层数自己往下掉。
  const emberPyre = await page.evaluate(async () => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    const py = g.level.pyres[0];
    g.enemies.clear();
    g.projectiles.clear();
    // 点一座灯台出来放在玩家旁边（真实流程是站过去等它点亮，这里只问"亮着的灯台能不能扑火"）
    py.x = p.x + 90;
    py.y = p.y;
    py.lit = true;
    py.flame = 1;
    py.progress = 1;
    g.handleHazard('emberwind');
    g.emberwindDirX = 1;
    g.emberwindDirY = 0;
    // ⚠ 层数挂在 **game** 上，不是 player 上（`p.emberStacks = 3` 只会写到一个没人看的属性上，
    //  然后量到的就是"灯台一点用都没有"——这一版在这里绕过一次弯）
    g.emberStacks = 3;
    const t0 = performance.now();
    while (g.emberStacks > 0 && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
    return { stacks: g.emberStacks, near: g.emberPyreNear, secs: +((performance.now() - t0) / 1000).toFixed(1) };
  });
  expect(emberPyre.near === true, '玩家站在灯台的光里（这一条量的是"光把火按灭"）', JSON.stringify(emberPyre));
  expect(emberPyre.stacks === 0, '灯台边上三层会自己掉干净（每秒一层）', JSON.stringify(emberPyre));
  expect(emberPyre.secs <= 4.5, '而且是在三四秒里掉的，不是等到天荒地老', JSON.stringify(emberPyre));

  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    delete window.__EMBER__;
    g.emberwindTimer = 0;
    g.embers.length = 0;
    g.emberStacks = 0;
    g.player.hp = g.player.stats.maxHp;
    g.player.x = 0;
    g.player.y = 0;
  });
  await sleep(200);

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

  // 打满一整轮：等敌人走进灯火，再用燃爆收场。
  // ⚠ 按**游戏内时间**收工，不按墙上时间：容器里帧被拖慢时，主循环夹住了 dt，
  // 16 秒墙上时间可能只走了 4 秒游戏时间——敌人还没走到灯火里，测试就会莫名其妙地红
  // （这块以前就有：10 轮 = 16 秒墙钟，偶发 kills=0）。
  // 这一段量的是"按键真的打得出去"，不是"这个脚本活不活得下来"：血一空，`Escape` 就不再暂停
  // （`state !== 'playing'`），后面几十条会跟着一起塌（v85 复查时撞到过一次，红在"点不到继续按钮"）。
  // 所以先把血上限**临时**抬起来撑住这一段，跑完立刻还回去（后面结算那一屏用的是真身板）。
  const maxHpBefore = await page.evaluate(() => {
    const p = window.__WICKLIGHT__.game.player;
    const before = p.stats.maxHp;
    p.stats.maxHp = 1e6;
    p.hp = 1e6;
    return before;
  });
  let kills = 0;
  for (let i = 0; i < 40 && kills === 0; i += 1) {
    const ranFor = await page.evaluate(() => window.__WICKLIGHT__.game.runTime);
    if (ranFor > 36) break;
    await drainLevelUps();
    await page.keyboard.down(i % 2 === 0 ? 'KeyA' : 'KeyD');
    await sleep(700);
    await page.keyboard.up(i % 2 === 0 ? 'KeyA' : 'KeyD');
    await page.keyboard.press('KeyQ'); // 燃爆
    await sleep(900);
    kills = (await page.evaluate(() => window.__WICKLIGHT__.game.kills));
  }
  await drainLevelUps();
  await page.evaluate((before) => {
    const p = window.__WICKLIGHT__.game.player;
    p.stats.maxHp = before;
    p.hp = p.stats.maxHp;
  }, maxHpBefore);

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
    // 场上别的灯台先熄掉：吹灯客挑的是**最近的那盏亮灯**（`quenchPyre` 里就是挑最近），
    // 两盏都亮着时"到 pyres[0] 的距离"完全可能越走越大——那是它在扑另一盏，不是扑错了人
    // （v85 复查时撞到过两次：586→590、581→624）。
    for (const py of g.level.pyres) if (py !== pyre && py.lit) g.extinguishPyre(py);
    g.enemies.clear();
    g.player.x = pyre.x;
    g.player.y = pyre.y;
    for (let i = 0; i < 90; i += 1) g.updatePyres(1 / 60);
    const list = [];
    g.enemies.forEach((e) => list.push(e));
    const one = list.find((e) => e.defId === 'snuffer');
    const before = one ? Math.hypot(one.x - pyre.x, one.y - pyre.y) : 0;
    // 这一条要证明的是"它扑的是灯，不是你"，所以**把人挪到它鼻子底下**（60px），而灯在 586px 外——
    // 躲得远远的那种摆法证明不了什么（它本来就只能在灯和你之间挑一个近的）。
    if (one) {
      // 站到它**背后**（灯那一侧的反方向）60px：这样"朝灯走"和"离你更远"永远是同一件事，
      // 不然灯正好在你那个方向时，两条断言会互相打架
      const away = Math.hypot(pyre.x - one.x, pyre.y - one.y) || 1;
      g.player.x = one.x - ((pyre.x - one.x) / away) * 60;
      g.player.y = one.y - ((pyre.y - one.y) / away) * 60;
    }
    const toManBefore = one ? Math.hypot(one.x - g.player.x, one.y - g.player.y) : 0;
    if (one) for (let i = 0; i < 30; i += 1) g.enemies.update(1 / 60, g.enemyCtx());
    const after = one ? Math.hypot(one.x - pyre.x, one.y - pyre.y) : 0;
    const toManAfter = one ? Math.hypot(one.x - g.player.x, one.y - g.player.y) : 0;
    const out = {
      lit: pyre.lit,
      flame: pyre.flame,
      snuffers: list.filter((e) => e.defId === 'snuffer').length,
      others: list.filter((e) => e.defId !== 'snuffer').length,
      before: Math.round(before),
      after: Math.round(after),
      toManBefore: Math.round(toManBefore),
      toManAfter: Math.round(toManAfter),
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
  // 两条一起看才算数：离灯更近**而且**离人更远（人就站在它旁边 60px，灯在五百多像素外）
  expect(snuffer.after < snuffer.before, '吹灯客直奔灯台', JSON.stringify(snuffer));
  expect(snuffer.toManAfter > snuffer.toManBefore, '人就在它鼻子底下，它也不扑你', JSON.stringify(snuffer));
  expect(snuffer.afterCleanup.lit === false && snuffer.afterCleanup.pyresLit === 0, '熄灭后灯台与计数都归位', JSON.stringify(snuffer.afterCleanup));
  await shot('04f-snuffer');

  await drainLevelUps();

  // ── 4. 暂停 ──
  // ⚠ 这一步原来是**看运气**的（v78 两跑一红，就红在这里）：`Escape` 只在 `state === 'playing'` 时才算数
  //   （升级面板上按它什么都不做），而真实击杀随时可能在"排空升级面板"和"按下 Esc"之间那一瞬间
  //   把面板再顶出来。它要量的是"Esc 能不能暂停"，不是"这几毫秒里有没有恰好升级"——
  //   所以按完看一眼状态，没进暂停就先排空再按一次。
  let paused = null;
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => {
      const p = window.__WICKLIGHT__.game.player;
      p.hp = p.stats.maxHp;
    });
    await drainLevelUps();
    await page.keyboard.press('Escape');
    await sleep(300);
    paused = await page.evaluate(() => window.__PROBE__.state());
    if (paused && paused.state === 'paused') break;
  }
  expect(paused && paused.state === 'paused', 'Esc 能暂停', JSON.stringify(paused));
  const pauseLayout = await page.evaluate(() => window.__PROBE__.layout('.panel'));
  expect(pauseLayout.issues.length === 0, '暂停面板布局正常', pauseLayout.issues.join('; '));
  await shot('05-pause');
  // 没进暂停就别去点那颗按钮：面板不在的时候 `click` 会干等满 30 秒再抛异常，
  // 而抛异常会把整轮体检**打断**（后面几十条一条都跑不到，也看不出红的是哪一条）。
  // 这里退化成一条断言失败：这条红了，后面照旧跑完。
  if (paused && paused.state === 'paused') {
    await page.click('[data-act="resume"]');
  } else {
    expect(false, '暂停面板上那颗「继续」点得到', '面板就没出来，这一条没法点');
  }
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

  // ── 4c. 本局伤害构成（真浏览器里再量一次版式与口径）──
  // 记账最怕的不是报错，而是**悄悄错**：少记一笔、记到别的桶里，光看总伤害都发现不了。
  // 软件测试已经钉住恒等（各来源之和 === 造成伤害），这里在真浏览器里量**看得见的那半边**：
  // 两把武器各打一会儿，表得出来、条按占比画、行按伤害从多到少排，而且塞得进面板。
  const dmgSetup = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    g.projectiles.clear();
    // 量完要还回去：这一局真的长成什么样，后面几张截图还得照着它画
    g.__dmgBak = new Map(p.weapons);
    p.weapons.clear();
    for (let i = 0; i < 3; i += 1) p.levelWeapon('fireball');
    for (let i = 0; i < 3; i += 1) p.levelWeapon('whip');
    p.recomputeStats();
    p.stats.cooldownMult = 0.4; // 让两把都在这 1.7 秒里各打几轮，免得钝的那把 0 伤害、干脆不上表
    p.x = 0;
    p.y = 0;
    // 站着挨打的靶子：血厚（不触发击杀顿帧）、脚力 0（不会贴上来蹭出「灯火」接触伤害污染口径）
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      const e = g.enemies.spawn('shade', Math.cos(a) * 130, Math.sin(a) * 130, 4, 1);
      e.hp = e.maxHp = 1e6;
      e.speed = 0;
    }
    return { weapons: p.weapons.size };
  });
  expect(dmgSetup.weapons === 2, '摆好两把武器来量伤害构成', JSON.stringify(dmgSetup));
  await sleep(1700);
  await page.keyboard.press('Tab');
  await sleep(300);
  const dmgBlock = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const rows = g.damageBreakdown();
    const els = [...document.querySelectorAll('.dmg-block .dmg-row')];
    const bars = els.map((el) => parseFloat(el.querySelector('.dmg-row__bar > i').style.width));
    // 条**真的**画了那么长吗：拿量出来的像素宽除以轨道宽，和声明宽比一比。
    // （宽度是 CSS 变量算的，DOM 上写得对不等于桌上画得对。）
    const pxErr = els.map((el, i) => {
      const track = el.querySelector('.dmg-row__bar').getBoundingClientRect().width;
      const fill = el.querySelector('.dmg-row__bar > i').getBoundingClientRect().width;
      return track > 0 ? Math.abs((fill / track) * 100 - bars[i]) : 999;
    });
    const labelPct = els.map((el) => parseFloat(el.querySelector('.dmg-row__val > u').textContent));
    const dataPct = rows.map((r) => Math.round(r.frac * 100));
    const box = document.querySelector('.panel--loadout') || document.querySelector('.panel');
    const r = box.getBoundingClientRect();
    return {
      total: g.damageDealt,
      sumBreakdown: rows.reduce((s, x) => s + x.amount, 0),
      sumFrac: rows.reduce((s, x) => s + x.frac, 0),
      sorted: rows.every((x, i) => i === 0 || rows[i - 1].amount >= x.amount),
      rows: els.length,
      names: els.map((el) => el.querySelector('.dmg-row__name').textContent),
      barSum: bars.reduce((s, x) => s + x, 0),
      maxPxErr: Math.max(...pxErr),
      pctOk: labelPct.every((v, i) => v === dataPct[i]),
      title: document.querySelector('.dmg-block__title')?.textContent ?? '',
      fits: r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
      bad: /undefined|NaN/.test(box.textContent),
    };
  });
  expect(dmgBlock.rows >= 2, '本局伤害构成列出每一件出过力的武器', JSON.stringify(dmgBlock.names));
  expect(Math.abs(dmgBlock.sumBreakdown - dmgBlock.total) < 0.5, '各来源之和正好等于造成伤害（不多记也不少记）', JSON.stringify({ sum: dmgBlock.sumBreakdown, total: dmgBlock.total }));
  expect(Math.abs(dmgBlock.sumFrac - 1) < 1e-6, '各来源占比加起来正好是 1', `sumFrac=${dmgBlock.sumFrac}`);
  // 每条按占比画；细得看不见的那几条会被垫到最小 2%（所以总量最多被抬到 100% + 2% × (条数-1)）。
  // 这个上界就是"最小宽度"这条规则的边界——超过了说明有别的脏东西在撑宽。
  // ⚠ 下界不能写成 99.9（v75 修）：那一条宽度是 `frac * 100` **四舍五入到 0.1%** 之后写进 style 的
  //   （见 UIManager 那行 `Math.max(2, r.frac * 100).toFixed(1)`），所以每条最多短 0.05%，
  //   六条加起来正好可能落在 99.90 —— 再被浮点加法磨成 99.89999999999999，就红在一个"本来没错"的数上。
  //   这里量得出的就是"舍入的代价"：下界 = 100 − 0.05% × 条数，上界 = 最小宽度垫出来的那点余量。
  const barLow = 100 - 0.05 * dmgBlock.rows - 1e-9;
  expect(dmgBlock.barSum >= barLow && dmgBlock.barSum <= 100 + 2 * (dmgBlock.rows - 1) + 0.5, '条长之和就是总量（上下两头都是舍入的边界）', `barSum=${dmgBlock.barSum} rows=${dmgBlock.rows} 允许区间 [${barLow}, ${100 + 2 * (dmgBlock.rows - 1) + 0.5}]`);
  expect(dmgBlock.maxPxErr < 0.6, '条在桌上真的画了那么长（不是只有 DOM 上写着）', `maxPxErr=${dmgBlock.maxPxErr}`);
  expect(dmgBlock.pctOk, '百分比写的是这一行自己的占比', JSON.stringify(dmgBlock.names));
  expect(dmgBlock.sorted, '行按伤害从多到少排（扛的那件在最上面）', JSON.stringify(dmgBlock.names));
  expect(/合计/.test(dmgBlock.title), '表头写出合计', dmgBlock.title);
  expect(dmgBlock.fits && !dmgBlock.bad, '伤害构成塞得进面板、没有缺字段', JSON.stringify(dmgBlock));
  await shot('05d-damage');
  await page.keyboard.press('Tab');
  await sleep(250);
  await page.evaluate(() => {
    // 收摊：靶子撤掉（别让 4 只厚血雕像跟着这一局走到结算），武器还回原样。
    // 这一局的伤害账不清——它本来就该记着这一局真打过什么，正是这张表的意义。
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    g.projectiles.clear();
    p.weapons.clear();
    for (const [id, lv] of g.__dmgBak ?? []) p.weapons.set(id, lv);
    delete g.__dmgBak;
    p.recomputeStats();
  });

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
  const cardInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-offer]')];
    const deltas = all.map((c) => (c.querySelector('.card__delta')?.textContent ?? '').trim());
    const pips = all.map((c) => c.querySelectorAll('.card__pips i').length);
    return { deltas, pips, lv: all.map((c) => (c.querySelector('.card__lv')?.textContent ?? '').trim()) };
  });
  expect(cardInfo.deltas.some((d) => d.length > 0), `升级卡要写出这一级改了什么（${JSON.stringify(cardInfo.deltas)}）`);
  expect(cardInfo.pips.every((n) => n > 0), `每张卡都要有等级刻度（${cardInfo.pips.join(',')}）`);
  expect(cardInfo.lv.every((t) => /^Lv \d+\/\d+$/.test(t)), `卡上要写清第几级（${cardInfo.lv.join(' | ')}）`);
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

  // ── 5b. 面板热键：真按下数字键 / R（这条链子只有在这儿量得到）──
  // "哪个键对应哪张卡"在无头测试里能整条走通，但"主循环有没有把键盘状态交给 Game"
  // 只活在 main.ts 的那两行里——离线测试跑的是主循环之外那条路，永远碰不到它。
  // 所以这里用**真键盘**按下去，量三件事：键是哪一枚、按下之后生效的是不是那张卡、
  // 以及按错地方（战斗中）会不会有副作用。
  await page.evaluate(() => window.__WICKLIGHT__.game.gainXp(window.__WICKLIGHT__.game.xpToNext + 1));
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'levelup', null, { timeout: 8000 }).catch(() => {});
  const hotkeys = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const lvl = (id) => (g.player.weapons.get(id) ?? 0) + (g.player.passives.get(id) ?? 0) + (g.player.relics.has(id) ? 1 : 0);
    const [first, second] = g.currentOffers;
    const chips = [...document.querySelectorAll('[data-offer] .hotkey')];
    return {
      chips: chips.map((e) => e.textContent.trim()),
      chipsShown: chips.length > 0 && chips.every((e) => e.getBoundingClientRect().width > 0),
      first: first.id,
      second: second.id,
      firstLv: lvl(first.id),
      secondLv: lvl(second.id),
      rerollChip: document.querySelector('[data-act="reroll"] .key')?.textContent ?? '',
    };
  });
  expect(hotkeys.chips.join(',') === '1,2,3', '升级卡上写着"按哪个键"', JSON.stringify(hotkeys.chips));
  expect(hotkeys.chipsShown, '桌面端那几枚数字片是真的画出来了（不是 display:none）');
  expect(hotkeys.rerollChip === 'R', '重掷按钮上挂着 R', JSON.stringify(hotkeys.rerollChip));
  await shot('06b-levelup-hotkeys');

  // 按 2：生效的必须是**第二张**（不是第一张，也不是"随手一张"）
  await page.keyboard.press('Digit2');
  await sleep(350);
  const afterKey = await page.evaluate(({ firstId, secondId }) => {
    const g = window.__WICKLIGHT__.game;
    const lvl = (id) => (g.player.weapons.get(id) ?? 0) + (g.player.passives.get(id) ?? 0) + (g.player.relics.has(id) ? 1 : 0);
    return { state: g.state, firstLv: lvl(firstId), secondLv: lvl(secondId) };
  }, { firstId: hotkeys.first, secondId: hotkeys.second });
  expect(afterKey.state === 'playing', '按数字键选完卡就该回到战场', JSON.stringify(afterKey));
  expect(afterKey.secondLv > hotkeys.secondLv, `按 2 生效的该是第二张（${hotkeys.second}）`, JSON.stringify({ before: hotkeys.secondLv, after: afterKey.secondLv }));
  expect(afterKey.firstLv === hotkeys.firstLv, `第一张不该被顺手也塞进来（${hotkeys.first}）`, JSON.stringify({ before: hotkeys.firstLv, after: afterKey.firstLv }));

  // R：升级面板里按一下，三张卡真的换了、重掷点真的少了，而且**屏幕上的牌就是手里的牌**。
  // 最后这条不是洁癖：面板是一张静态 DOM，卡片点下去时按屏幕上那个 id 回 `offers` 里找，
  // 找不到就什么都不做——"数据换了、画没换"会让整块面板看着好好的却一张都点不动。
  await page.evaluate(() => window.__WICKLIGHT__.game.gainXp(window.__WICKLIGHT__.game.xpToNext + 1));
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'levelup', null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.rerollsLeft = 2; // 面板一打开就会把重掷点重置成局外解锁的那份，所以在这里发牌
    g.ui.setOffers(g.currentOffers, g.rerollsLeft);
    g.ui.showScreen('levelup');
  });
  const rerollBefore = await page.evaluate(() => window.__WICKLIGHT__.game.currentOffers.map((o) => `${o.kind}:${o.id}`).join(','));
  await page.keyboard.press('KeyR');
  await sleep(350);
  const rerollAfter = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const dom = [...document.querySelectorAll('[data-offer]')].map((e) => e.dataset.offer);
    const data = g.currentOffers.map((o) => `${o.kind}:${o.id}`);
    return {
      state: g.state,
      left: g.rerollsLeft,
      data: data.join(','),
      orphans: dom.filter((k) => !data.includes(k)),
      domCount: dom.length,
      label: document.querySelector('[data-act="reroll"]')?.textContent ?? '',
    };
  });
  expect(rerollAfter.left === 1, '升级面板里按 R 花掉一次重掷', JSON.stringify({ after: rerollAfter.left }));
  expect(rerollAfter.state === 'levelup' && rerollAfter.data !== rerollBefore, '重掷真的换掉了那三张卡，而且人还停在面板上', JSON.stringify(rerollAfter.data));
  expect(rerollAfter.orphans.length === 0 && rerollAfter.domCount === 3, '重掷之后面板上的牌就是手里的牌（没有点不动的孤儿卡）', JSON.stringify(rerollAfter.orphans));
  expect(/1/.test(rerollAfter.label), '重掷按钮上的数字跟着往下走了', JSON.stringify(rerollAfter.label));
  // 换完牌照样点得动：这一下走的是鼠标那条老路（键盘那条上面已经量过）
  await page.click('[data-offer]');
  await sleep(300);
  const afterRerollPick = await page.evaluate(() => window.__PROBE__.state());
  expect(afterRerollPick && afterRerollPick.state !== 'levelup', '重掷之后那三张卡还是点得动（不是一块死面板）', JSON.stringify(afterRerollPick));

  // 把可能排队的升级面板走完，然后回战场量"按错地方"那一条
  for (let i = 0; i < 6; i += 1) {
    const st = await page.evaluate(() => window.__WICKLIGHT__.game.state);
    if (st !== 'levelup') break;
    await page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      g.chooseUpgrade(g.currentOffers[0]);
    });
    await sleep(180);
  }
  const idleKey = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.rerollsLeft = 3;
    return { state: g.state, left: g.rerollsLeft, gold: g.gold, kit: g.player.weapons.size + g.player.passives.size + g.player.relics.size };
  });
  expect(idleKey.state === 'playing', '热键量完，人该在战场上', JSON.stringify(idleKey));
  await page.keyboard.press('KeyR');
  await page.keyboard.press('Digit1');
  await sleep(300);
  const idleAfter = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { state: g.state, left: g.rerollsLeft, gold: g.gold, kit: g.player.weapons.size + g.player.passives.size + g.player.relics.size };
  });
  expect(idleAfter.left === idleKey.left && idleAfter.gold === idleKey.gold, '战斗中按 R 不该白吃一次重掷、也不该扣金币刷新商品', JSON.stringify({ before: idleKey, after: idleAfter }));
  expect(idleAfter.kit === idleKey.kit && idleAfter.state === 'playing', '战斗中按数字键不该凭空多出一件东西', JSON.stringify({ before: idleKey, after: idleAfter }));

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

  // 商店也归键盘管：数字键买第 n 件、R 刷新货架（刷新是**一口价 8 金币**，得真的扣）
  const shopKeys = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.gold = Math.max(g.gold, 400);
    g.ui.showScreen('shop');
    return {
      gold: g.gold,
      price: g.shopItems[1]?.price ?? null,
      sold: g.shopItems[1]?.sold ?? null,
      // 前面用鼠标买过第 0 件，所以"别的货没动"要拿这一份当基准去比，不能假定全都还没卖
      soldBefore: g.shopItems.map((it) => it.sold),
      chips: [...document.querySelectorAll('.shop-item .hotkey')].map((e) => e.textContent.trim()).slice(0, 3),
    };
  });
  expect(shopKeys.chips.join(',') === '1,2,3', '商品上写着"按哪个键"', JSON.stringify(shopKeys.chips));
  if (shopKeys.price !== null && !shopKeys.sold) {
    await page.keyboard.press('Digit2');
    await sleep(350);
    const bought = await page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      return { gold: g.gold, sold: g.shopItems.map((it) => it.sold) };
    });
    // 只有第 1 件变了状态，别的货一件都没动
    const others = bought.sold.filter((_, i) => i !== 1);
    const othersBefore = shopKeys.soldBefore.filter((_, i) => i !== 1);
    expect(bought.sold[1] === true && JSON.stringify(others) === JSON.stringify(othersBefore), '按 2 买的是第二件（别的货一件都没动）', JSON.stringify({ before: shopKeys.soldBefore, after: bought.sold }));
    expect(bought.gold === shopKeys.gold - shopKeys.price, '扣的该正好是那一件的价', JSON.stringify({ before: shopKeys.gold, price: shopKeys.price, after: bought.gold }));
    const beforeReroll = bought.gold;
    await page.keyboard.press('KeyR');
    await sleep(350);
    const rerolled = await page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      return { gold: g.gold, state: g.state, sold: g.shopItems.filter((it) => it.sold).length };
    });
    expect(rerolled.gold === beforeReroll - 8, 'R 刷新商品：一口价 8 金币', JSON.stringify({ before: beforeReroll, after: rerolled.gold }));
    expect(rerolled.state === 'shop' && rerolled.sold === 0, '刷新之后还是那家店，货架是新的', JSON.stringify(rerolled));
  } else {
    fail('商店热键', `第二件买不了（价 ${shopKeys.price} / 已售 ${shopKeys.sold}）`);
  }

  // 货架最下面那两件（热汤 / 满壶灯油）：v81 起键盘也认 5 / 6——之前只认 1~4，
  // 这两件永远得挪手去点鼠标，而那正是"打残了先买一口"的时候
  const shopLow = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.gold = Math.max(g.gold, 400);
    g.ui.showScreen('shop');
    return { gold: g.gold, n: g.shopItems.length, price: g.shopItems[4]?.price ?? null, sold: g.shopItems[4]?.sold ?? null };
  });
  if (shopLow.price !== null && !shopLow.sold) {
    await page.keyboard.press('Digit5');
    await sleep(350);
    const five = await page.evaluate(() => {
      const g = window.__WICKLIGHT__.game;
      return { gold: g.gold, sold: g.shopItems.map((it) => it.sold) };
    });
    expect(five.sold.length === shopLow.n && five.sold[4] === true, '按 5 买的是第五件', JSON.stringify(five.sold));
    expect(five.gold === shopLow.gold - shopLow.price, '扣的该正好是那一件的价', JSON.stringify({ before: shopLow.gold, price: shopLow.price, after: five.gold }));
  } else {
    fail('商店热键 5 / 6', `第五件买不了（货架 ${shopLow.n} 件 / 价 ${shopLow.price} / 已售 ${shopLow.sold}）`);
  }

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
  // v82：这一块是四块"打断战斗"的面板里最后一块接上键盘的——卡上要写着按哪个键
  const curseChips = await page.evaluate(() => [...document.querySelectorAll('[data-curse] .hotkey')].map((e) => e.textContent.trim()));
  expect(curseChips.join(',') === '1,2,3', '夜咒卡上写着"按哪个键"', curseChips.join(','));

  // 挑回报最高的那一条，落地的夜咒必须就是它挑的（鼠标那条老路）
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

  // 键盘也能在岔口上拿主意：再走一遍"打完这一关 → 补给站 → 岔口"（岔口只有这一处，
  // 想量第二次就得真的再过一关），这一遍不碰鼠标，只按数字键
  await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.gold = 200;
    g.onStageComplete();
  });
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'shop', null, { timeout: 8000 }).catch(() => {});
  await page.click('[data-act="leave"]');
  await page.waitForFunction(() => window.__WICKLIGHT__.game.state === 'curse', null, { timeout: 8000 }).catch(() => {});
  const curseAgain = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return {
      state: g.state,
      ids: [...document.querySelectorAll('[data-curse]')].map((c) => c.dataset.curse),
      chips: [...document.querySelectorAll('[data-curse] .hotkey')].map((e) => e.textContent.trim()),
    };
  });
  expect(curseAgain.state === 'curse' && curseAgain.ids.length === 3, '再过一关还是三条夜咒', JSON.stringify(curseAgain));
  // 按中间那一条：不挑最高回报，量的是"按下的键对应哪张卡"本身
  const keyedCurse = curseAgain.ids[1];
  await page.keyboard.press('Digit2');
  await sleep(900);
  const curseByKey = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    return { state: g.state, curse: g.curse?.id ?? null, gold: g.curseGoldMult, offers: g.curseOffers.length };
  });
  expect(
    curseByKey.curse === keyedCurse,
    `岔口上按 2 带走的是第二张夜咒（该是 ${keyedCurse}，实际 ${curseByKey.curse}）`,
    JSON.stringify(curseByKey),
  );
  expect(curseByKey.state === 'playing' && curseByKey.offers === 0, '键盘选完夜咒就回到战场，那三条也收走了', JSON.stringify(curseByKey));

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
    // 祭坛也归键盘管：按 1 就等于点第一张卡（面板上的按钮一点没变，只是多了个入口）
    await page.keyboard.press('Digit1');
    await sleep(350);
    const afterShrine = await page.evaluate(() => window.__PROBE__.state());
    expect(afterShrine && afterShrine.state === 'playing', '按数字键选完祭坛供物就回到战斗', JSON.stringify(afterShrine));
    const shrineUsed = await page.evaluate(() => window.__WICKLIGHT__.game.level.shrines.filter((x) => x.used).length);
    expect(shrineUsed >= 1, '按下去的那件供物得真的用掉（不然玩家能回来再拿一次）', `used=${shrineUsed}`);
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

  // 结算面板的回车 = 面板上那颗主按钮（"再点一盏"），然后从选灯火那一屏自己退回来。
  // 先确认它只在结算面板里认：战斗中按下去不该有任何动静。
  const idleEnter = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.state = 'playing';
    const ok = g.ui.panelPrimary();
    const after = g.state;
    g.state = 'dead';
    g.ui.showScreen('dead');
    return { ok, after };
  });
  expect(idleEnter.ok === false && idleEnter.after === 'playing', '战斗中按回车不该有动作', JSON.stringify(idleEnter));
  const primaryChip = await page.evaluate(() => document.querySelector('[data-act="again"] .key')?.textContent ?? '');
  expect(primaryChip === '回车', '主按钮上挂着回车', JSON.stringify(primaryChip));
  await page.keyboard.press('Enter');
  await sleep(350);
  const afterEnter = await page.evaluate(() => window.__PROBE__.state());
  expect(afterEnter && afterEnter.state === 'select', '结算面板按回车 = 走主按钮（去选灯火那一屏）', JSON.stringify(afterEnter));
  await page.click('[data-act="back"]');
  await sleep(400);
  // 从那一屏退回来就是主菜单（原来这一步是点结算面板上的"返回主菜单"，现在回车那条路已经把它走完了）
  const backAtMenu = await page.evaluate(() => window.__PROBE__.state());
  expect(backAtMenu && backAtMenu.state === 'menu', '从选灯火那一屏退回来就是主菜单', JSON.stringify(backAtMenu));

  // ── 9. 局外成长 / 设置 / 成就 ──
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

  // ── 9b. 「薪火」（v80）：余烬的第二个出口 ──
  // 离线单测（tests/fire.test.mjs）量的是价格阶梯与"三条各改了哪个数"，这里量的是**隔着真界面点下去**
  // 那件事：三张卡画出来了没有、点一下是不是真的扣钱并涨一级、以及第二级的价格有没有比第一级贵
  // （"可重复"这件事只有在界面上成立才算数——卡片自己长着一套刻度与价格，不是静态的一段说明）。
  const fireCards = await page.evaluate(() => ({
    cards: window.__PROBE__.layout('.fire'),
    head: document.querySelector('.fire-head')?.textContent ?? '',
    note: document.querySelector('.fire-note')?.textContent ?? '',
  }));
  expect(fireCards.cards.count === 3, '「薪火」三张卡都画出来了', `count=${fireCards.cards.count}`);
  expect(fireCards.cards.issues.length === 0, '三张薪火卡不越界、不被切', fireCards.cards.issues.join('; '));
  expect(fireCards.head.includes('/18'), '头部写清了整个炉子的总级数（分母 = 三条加起来）', fireCards.head);
  expect(fireCards.note.includes('解锁树还剩'), '树还没买完时那一行要指路：先买树，再添柴', fireCards.note);
  // ⚠ 面板先等一帧再拍：`.screen` 挂着 `backdrop-filter: blur(3px)`，软件光栅化的合成器
  //   会晚一帧才把面板内容画进那一层里——当场拍下去得到的是"背景糊了一层、面板不见踪影"的空图
  //   （v80 实测撞到的：断言全绿、截图是空的）。
  await sleep(220);
  await shot('10b-meta-fire');
  const fireBuy = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.embers = 5000;
    g.save.fire = {};
    g.ui.showScreen('meta');
    const priceOf = (id) => Number((document.querySelector(`[data-fire="${id}"] .fire__cost`)?.textContent ?? '').replace(/[^0-9]/g, ''));
    const first = priceOf('fire_light');
    const before = g.save.embers;
    document.querySelector('[data-fire="fire_light"]')?.click();
    const mid = g.save.embers;
    const second = priceOf('fire_light');
    document.querySelector('[data-fire="fire_light"]')?.click();
    const after = g.save.embers;
    // 收尾：这一块买下的两级要还回去，后面的检查照旧（不然之后每一局都多 6% 灯火，
    // 而那种差别在界面上看不出来，只会让后面某一条像素断言量到另一个世界）
    const level = g.meta.fireLevel('fire_light');
    g.save.fire = {};
    g.save.embers = before;
    g.ui.showScreen('meta');
    return { first, second, before, mid, after, level };
  });
  expect(fireBuy.level === 2, '点两下就是第 2 级（这是**可重复**的那一种卡）', JSON.stringify(fireBuy));
  expect(
    fireBuy.mid === fireBuy.before - fireBuy.first && fireBuy.after === fireBuy.mid - fireBuy.second,
    '每一级都按牌价扣钱',
    JSON.stringify(fireBuy),
  );
  expect(fireBuy.second > fireBuy.first, '第 2 级比第 1 级贵（价格阶梯在界面上也成立）', JSON.stringify(fireBuy));
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

  // ── 无尽：一轮一片战场——补给站先告诉你要去哪儿，出门就真的到那儿 ──
  const arena = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const before = g.currentStage().theme.name;
    g.director.wave = 15;
    g.wave = 15;
    g.onStageComplete();
    g.ui.showScreen('shop');
    return {
      before,
      line: (document.querySelector('.shop-arena')?.textContent ?? '').trim(),
      promised: g.nextArena()?.theme.name ?? null,
      tier: g.stageIndex,
      state: g.state,
      issues: window.__PROBE__.layout('.panel').issues,
    };
  });
  expect(arena.state === 'shop', '无尽这一轮打完进补给站', JSON.stringify(arena));
  expect(arena.issues.length === 0, '补给站布局正常（多了一行"下一片战场"）', arena.issues.join('; '));
  expect(!!arena.promised && arena.line.includes(arena.promised), `补给站要写出下一片战场（实际「${arena.line}」）`);
  await shot('13c-endless-shop');

  const rotated = await page.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    const hp = g.player.hp;
    const oil = g.player.oil;
    const tier = g.stageIndex;
    g.enemies.clear();
    g.leaveShop();
    return {
      theme: g.currentStage().theme.name,
      label: document.querySelector('.hud__stage')?.textContent ?? '',
      hpSame: g.player.hp === hp,
      oilSame: g.player.oil === oil,
      tierSame: g.stageIndex === tier,
      tier: g.stageIndex,
      state: g.state,
    };
  });
  expect(rotated.theme === arena.promised, `出门后到的就是承诺的那片战场（承诺 ${arena.promised} / 实际 ${rotated.theme}）`);
  expect(rotated.theme !== arena.before, `战场确实换了（${arena.before} → ${rotated.theme}）`);
  expect(rotated.hpSame && rotated.oilSame, '换战场不送血也不送油', JSON.stringify(rotated));
  expect(rotated.tierSame && arena.tier === rotated.tier, '难度与物价档位不跟着战场走', JSON.stringify(rotated));
  expect(rotated.state === 'playing', '出门就继续打', JSON.stringify(rotated));
  await sleep(600);
  await shot('13d-endless-arena');

  // ── 10b. 桌面不该有任何触感：打了一整局，navigator.vibrate 一次都不该被调到 ──
  expect(
    (await page.evaluate(() => window.__PROBE__.vibes.log.length)) === 0,
    '桌面（非掌上设备）全程不震动',
  );

  // ── 10c. 手柄（v81）：真浏览器里插一只手柄，一路量到角色真的动了 ──
  // 离线那套（tests/gamepad.test.mjs）量的是"`poll` 出来的意图对不对"；这里量的是
  // **同一条路在真主循环里走通**：`navigator.getGamepads` → 主循环 → 角色 / 面板 / 底部那行说明。
  // 浏览器里没有"合成手柄按键"这种东西（Gamepad API 是设备级的，不是 DOM 事件），所以做法是
  // 把 `navigator.getGamepads` 换成一份**我们捏着走**的读数——主循环读到的东西和真手柄逐字段一样。
  const padFrames = (n) =>
    page.evaluate(
      (k) =>
        new Promise((res) => {
          let i = 0;
          const tick = () => {
            i += 1;
            if (i >= k) res(i);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      n,
    );
  const padBefore = await page.evaluate(() => ({
    connected: window.__WICKLIGHT__.game.padConnected,
    hint: document.querySelector('.js-hint')?.textContent ?? '',
  }));
  expect(padBefore.connected === false, '插上之前游戏认得出来"没手柄"', JSON.stringify(padBefore));
  expect(/空格/.test(padBefore.hint), '没手柄时底部那行说的还是键盘', padBefore.hint);
  await page.evaluate(() => {
    window.__PAD__ = { buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    navigator.getGamepads = () => [
      { id: 'Playwright Pad (STANDARD GAMEPAD)', index: 0, connected: true, buttons: window.__PAD__.buttons, axes: window.__PAD__.axes },
    ];
    window.__WICKLIGHT__.game.enemies.clear();
  });
  await padFrames(4);
  const padOn = await page.evaluate(() => {
    const el = document.querySelector('.js-hint');
    return {
      connected: window.__WICKLIGHT__.game.padConnected,
      text: el?.textContent ?? '',
      isPad: el?.classList.contains('is-pad') ?? false,
      h: Math.round(el?.getBoundingClientRect().height ?? 0),
      tip: window.__WICKLIGHT__.game.save.tips.includes('input:gamepad'),
    };
  });
  expect(padOn.connected === true, '插上之后主循环认得出手柄', JSON.stringify(padOn));
  expect(padOn.isPad && /摇杆/.test(padOn.text) && !/空格/.test(padOn.text), '底部那行当场换成手柄那一份（不写键盘的键）', padOn.text);
  expect(padOn.h > 0, '换成的那行真的画在屏幕上（不是换了个藏起来的元素）', String(padOn.h));

  // 走位：死区里那点漂移不该让角色动，推到底才动——而且动的是**真角色**，不是"意图对象"
  const padWalk = await page.evaluate(async () => {
    const g = window.__WICKLIGHT__.game;
    const start = { x: g.player.x, y: g.player.y };
    window.__PAD__.axes[0] = 0.15; // 手搭在摇杆上
    await new Promise((r) => setTimeout(r, 200));
    const drift = { x: g.player.x - start.x, y: g.player.y - start.y };
    window.__PAD__.axes[0] = 1; // 推到底
    await new Promise((r) => setTimeout(r, 260));
    const moved = { x: g.player.x - start.x, y: g.player.y - start.y };
    window.__PAD__.axes[0] = 0;
    // Ⓨ 拨芯：按下的那一帧就翻（意图不等插值，见 Player.dimmed）
    const before = g.player.wickOn;
    window.__PAD__.buttons[3] = { pressed: true, value: 1 };
    await new Promise((r) => setTimeout(r, 120));
    const after = g.player.wickOn;
    await new Promise((r) => setTimeout(r, 260)); // 按住不放
    const held = g.player.wickOn;
    window.__PAD__.buttons[3] = { pressed: false, value: 0 };
    // Start：暂停，再按一下回来
    window.__PAD__.buttons[9] = { pressed: true, value: 1 };
    await new Promise((r) => setTimeout(r, 120));
    const paused = g.state;
    window.__PAD__.buttons[9] = { pressed: false, value: 0 };
    await new Promise((r) => setTimeout(r, 120));
    window.__PAD__.buttons[9] = { pressed: true, value: 1 };
    await new Promise((r) => setTimeout(r, 120));
    const resumed = g.state;
    window.__PAD__.buttons[9] = { pressed: false, value: 0 };
    return { drift, moved, before, after, held, paused, resumed };
  });
  expect(Math.abs(padWalk.drift.x) < 0.01 && Math.abs(padWalk.drift.y) < 0.01, '手搭在摇杆上角色不漂（死区真的在起作用）', JSON.stringify(padWalk.drift));
  expect(padWalk.moved.x > 20, '推着摇杆角色就真的走起来（真主循环，不是离线桩件）', JSON.stringify(padWalk.moved));
  expect(padWalk.before === false && padWalk.after === true, 'Ⓨ 按一下当场拨上芯', JSON.stringify(padWalk));
  expect(padWalk.held === true, '按住不放也只翻一格（一秒 60 格就废了）', JSON.stringify(padWalk));
  expect(padWalk.paused === 'paused' && padWalk.resumed === 'playing', 'Start 是暂停开关', JSON.stringify(padWalk));
  await shot('13e-pad');

  // 拔掉：那行说明要换回键盘那一份，游戏也要认得出来（别把"没手柄"当成"手柄一动不动"）
  await page.evaluate(() => {
    delete navigator.getGamepads;
    window.__WICKLIGHT__.game.enemies.clear();
  });
  await padFrames(3);
  const padOff = await page.evaluate(() => {
    const el = document.querySelector('.js-hint');
    return { connected: window.__WICKLIGHT__.game.padConnected, text: el?.textContent ?? '', isPad: el?.classList.contains('is-pad') ?? true };
  });
  expect(padOff.connected === false, '拔掉之后认得出来', JSON.stringify(padOff));
  expect(/空格/.test(padOff.text) && !padOff.isPad, '底部那行换回键盘那一份', padOff.text);

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

  // 触摸控件只在"真在打"的时候上屏：它和菜单面板同一层、DOM 里更靠后，默认盖在上面。
  // 844×390 的主菜单里那两枚圆按钮正好压在"成就 / 设置"上，点击会被它们吃掉。
  const steal = await mobile.evaluate(() => {
    const root = document.getElementById('touch-root');
    const hit = [];
    document.querySelectorAll('button, [data-act], [data-toggle], .card').forEach((el) => {
      if (el.closest('#touch-root')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      const cx = Math.round(b.x + b.width / 2);
      const cy = Math.round(b.y + b.height / 2);
      const top = document.elementFromPoint(cx, cy);
      if (top && root.contains(top)) hit.push(`${el.className || el.tagName} @${cx},${cy}`);
    });
    return { on: root.classList.contains('is-on'), opacity: getComputedStyle(document.querySelector('.touch-stick')).opacity, hit };
  });
  expect(steal.on === false && Number(steal.opacity) < 0.05, '菜单里触摸控件不上屏', JSON.stringify(steal));
  expect(steal.hit.length === 0, '菜单键不会被摇杆 / 按钮挡住点击', steal.hit.join('; '));

  await mobile.click('[data-act="play"]');
  await sleep(250);
  // 手机上的选灯火那屏（v79 起它多了「深宵之约」那一块）：窄屏横带上最容易出事的就是"多一整行"。
  // 这一份存档已经通关过了（后面的流程会真打通一次），所以这里量的是**解锁之后**的那一排：
  // 七块小卡要在 844×390 里排得下、不许把面板撑出横向滚动。
  const mobilePacts = await mobile.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    window.__MOB_CLEARS__ = g.save.records.clearedRuns;
    g.save.records.clearedRuns = Math.max(1, g.save.records.clearedRuns);
    g.ui.showScreen('select');
    return true;
  });
  expect(mobilePacts === true, '手机上打开选灯火那一屏');
  await sleep(250);
  // 选灯火那一屏本来就比 390 高的横屏长（4 盏灯 2×2 就 304px），从 v72 起就是**滚着看**的——
  // 所以这里和「伏灯 / 旋灯」那两栏同一个做法：先滚进来，再量它在不在视野里、有没有被切。
  await mobile.evaluate(() => document.querySelector('.pact-block')?.scrollIntoView({ block: 'center' }));
  await sleep(200);
  const mobilePactLayout = await mobile.evaluate(() => ({
    chips: window.__PROBE__.layout('.pact'),
    panel: window.__PROBE__.layout('.panel--select'),
    scroll: document.querySelector('.panel--select')?.scrollWidth ?? 0,
    client: document.querySelector('.panel--select')?.clientWidth ?? 0,
    // 几行：按所有小卡的 y 去重（`repeat(auto-fit)` 折成几行就数得出来）
    rows: new Set([...document.querySelectorAll('.pact')].map((e) => Math.round(e.getBoundingClientRect().y))).size,
  }));
  expect(mobilePactLayout.chips.count === 7, '手机上七条之约也都画出来了', `count=${mobilePactLayout.chips.count}`);
  expect(
    mobilePactLayout.chips.issues.length === 0,
    '手机横带上「深宵之约」那一排滚得进视野、也不被切',
    mobilePactLayout.chips.issues.join('; '),
  );
  expect(
    mobilePactLayout.panel.hOverflow === 0 && mobilePactLayout.scroll <= mobilePactLayout.client + 1,
    '多出那一块也没把手机上的选灯火撑出横向滚动',
    JSON.stringify(mobilePactLayout.panel),
  );
  expect(
    mobilePactLayout.chips.count === 7 && mobilePactLayout.rows === 1,
    '矮横屏上那七条收成一排（说明那一行摘了，免得白白多滚一屏）',
    `${mobilePactLayout.chips.count} 块 / ${mobilePactLayout.rows} 行`,
  );
  await mobile.screenshot({ path: join(SHOTS, '16b-mobile-pacts.png') });
  await mobile.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.records.clearedRuns = window.__MOB_CLEARS__;
  });
  await mobile.click('[data-act="start"]');
  await sleep(1500);
  expect(
    await mobile.evaluate(() => document.getElementById('touch-root').classList.contains('is-on')),
    '开局后触摸控件要上屏',
  );
  const mobileOverlap = await mobile.evaluate(() => window.__PROBE__.overlaps('#touch-stick', '.hud__build'));
  expect(mobileOverlap.length === 0, '移动端摇杆不遮挡构筑信息', mobileOverlap.join('; '));

  // 暂停键的命中圈：圆按钮"点得中"是按半径算的，48px 的圈里 8 个方向都要命中
  const pauseHit = await mobile.evaluate(() => {
    const el = document.querySelector('.hud__pause');
    const b = el.getBoundingClientRect();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dirs = (r) =>
      Array.from({ length: 8 }, (_, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        const t = document.elementFromPoint(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r));
        return !!t && (t === el || el.contains(t));
      });
    return { w: Math.round(b.width), h: Math.round(b.height), edge: dirs(22), inner: dirs(17) };
  });
  expect(pauseHit.w >= 44 && pauseHit.h >= 44, '暂停键命中圈不小于 44px（拇指点得中）', JSON.stringify(pauseHit));
  expect(pauseHit.edge.every(Boolean), '命中圈边缘 8 个方向都点得中', JSON.stringify(pauseHit));
  expect(pauseHit.inner.every(Boolean), '命中圈里（原来那枚 36px 圆的范围）更得点得中', JSON.stringify(pauseHit));

  const mobBounty = await mobile.evaluate(() => window.__PROBE__.layout('.hud__bounty'));
  expect(mobBounty.issues.length === 0, '移动端悬赏芯片布局正常', mobBounty.issues.join('; '));
  const mobClash = await mobile.evaluate(() => [
    ...window.__PROBE__.overlaps('.hud__topleft', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.hud__topright', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.hud__build', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.hud__bounty', '.hud__stage'),
  ]);
  expect(mobClash.length === 0, '移动端悬赏芯片不压住状态栏 / 构筑信息 / 关卡名', mobClash.join('; '));
  // 手机上那第三枚圆按钮：布局要在视口里、不压芯片，而且真按下去要放得下灯
  const lampBtn = await mobile.evaluate(() => {
    const el = document.querySelector('.touch-btn--lamp');
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: Math.round(b.width), h: Math.round(b.height) };
  });
  expect(lampBtn.w >= 48 && lampBtn.h >= 48, '分灯按钮够大（拇指点得中）', JSON.stringify(lampBtn));
  const lampBtnLayout = await mobile.evaluate(() => window.__PROBE__.layout('.touch-btn--lamp'));
  expect(lampBtnLayout.issues.length === 0, '分灯按钮布局正常', lampBtnLayout.issues.join('; '));
  const lampBtnClash = await mobile.evaluate(() => [
    ...window.__PROBE__.overlaps('.touch-btn--lamp', '.hud__pyre'),
    ...window.__PROBE__.overlaps('.touch-btn--lamp', '.hud__bounty'),
    ...window.__PROBE__.overlaps('.touch-btn--lamp', '.hud__stage'),
  ]);
  expect(lampBtnClash.length === 0, '分灯按钮不压住右侧那几枚芯片', lampBtnClash.join('; '));
  const lampsBefore = await mobile.evaluate(() => {
    window.__WICKLIGHT__.game.player.oil = 1;
    return window.__WICKLIGHT__.game.lamps.length;
  });
  await mobile.touchscreen.tap(lampBtn.x, lampBtn.y);
  await sleep(220);
  expect(
    (await mobile.evaluate(() => window.__WICKLIGHT__.game.lamps.length)) === lampsBefore + 1,
    '手机上点「分灯」真的放得下一盏灯（触摸路径不是摆设）',
  );
  await mobile.screenshot({ path: join(SHOTS, '17-mobile-lamp.png') });

  // 手机上那**第四**枚圆按钮「拨芯」：它是四枚里唯一的开关，所以除了"点得中、不压芯片"，
  // 还要真的按下一次、看到那个开关翻过去（触摸路径同样不能是摆设）。
  const wickBtn = await mobile.evaluate(() => {
    const el = document.querySelector('.touch-btn--wick');
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: Math.round(b.width), h: Math.round(b.height) };
  });
  expect(wickBtn.w >= 48 && wickBtn.h >= 48, '拨芯按钮够大（拇指点得中）', JSON.stringify(wickBtn));
  const wickBtnLayout = await mobile.evaluate(() => window.__PROBE__.layout('.touch-btn--wick'));
  expect(wickBtnLayout.issues.length === 0, '拨芯按钮布局正常', wickBtnLayout.issues.join('; '));
  const wickClash = await mobile.evaluate(() => [
    ...window.__PROBE__.overlaps('.touch-btn--wick', '.touch-btn--lamp'),
    ...window.__PROBE__.overlaps('.touch-btn--wick', '#touch-stick'),
    ...window.__PROBE__.overlaps('.touch-btn--wick', '.hud__combo'),
    ...window.__PROBE__.overlaps('.touch-btn--wick', '.hud__pyre'),
    ...window.__PROBE__.overlaps('.touch-btn--wick', '.hud__bounty'),
  ]);
  expect(wickClash.length === 0, '拨芯按钮不压摇杆 / 别的按钮 / 底部连杀 / 右侧芯片', wickClash.join('; '));
  const wickBefore = await mobile.evaluate(() => window.__WICKLIGHT__.game.player.wickOn);
  await mobile.touchscreen.tap(wickBtn.x, wickBtn.y);
  await sleep(400);
  const wickMobile = await mobile.evaluate(() => {
    const p = window.__WICKLIGHT__.game.player;
    return {
      on: p.wickOn,
      on2: document.querySelector('.touch-btn--wick')?.classList.contains('is-active') ?? null,
      chip: document.querySelector('.bar--oil')?.classList.contains('is-dim') ?? null,
    };
  });
  expect(wickMobile.on === !wickBefore, '手机上点「拨芯」真的把开关翻过去了（触摸路径不是摆设）', JSON.stringify(wickMobile));
  expect(wickMobile.on2 === true, '拨芯按钮亮起来（它同时是开关和指示灯）', JSON.stringify(wickMobile));
  expect(wickMobile.chip === true, '手机上拨芯之后油条也挂上牌子和冷色', JSON.stringify(wickMobile));
  await mobile.screenshot({ path: join(SHOTS, '17b-mobile-wick.png') });
  await mobile.touchscreen.tap(wickBtn.x, wickBtn.y); // 拨回来，后面的检查照旧
  await sleep(400);

  // 「倾灯」的手动瞄准（v63）：手指按住**屏幕右侧**拖着，这一瓢就往指的方向飞，松手还给自动瞄准。
  // ⚠ 派发真的 touchstart/touchmove：主循环每一帧都会用真实（键鼠 / 触摸）输入覆盖 `setInput`，
  //   从外面注入 `game.setInput(...)` 是打不过它的（v62 踩过一次）。
  const pourAim = await mobile.evaluate(async () => {
    const g = window.__WICKLIGHT__.game;
    const p = g.player;
    g.enemies.clear();
    g.projectiles.clear();
    p.weapons.clear();
    p.addWeapon('pour');
    p.recomputeStats();
    p.oil = p.oilMax;
    // 一只站在**右边**的怪：自动瞄准会锁它，所以"往左飞"只可能来自手指
    const e = g.enemies.spawn('shade', p.x + 90, p.y, 1, 0);
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.speed = 0;
    // 冷却留 0.5 秒：让那一瓢在手指按住之后才出去（不然它在拖动之前就按自动瞄准飞了）
    p.cooldowns.set('pour', 0.5);
    const fire = (type, x, y) =>
      document.body.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [new Touch({ identifier: 51, target: document.body, clientX: x, clientY: y })],
          targetTouches: [],
          changedTouches: [new Touch({ identifier: 51, target: document.body, clientX: x, clientY: y })],
          bubbles: true,
          cancelable: true,
        }),
      );
    const x0 = window.innerWidth * 0.8;
    const y0 = window.innerHeight * 0.6;
    fire('touchstart', x0, y0);
    fire('touchmove', x0 - 60, y0); // 往左推 60px（超过 AIM_FULL = 56）
    await new Promise((r) => setTimeout(r, 700));
    const marks = (g.projectiles.all || []).filter((q) => q.active && q.poolRadius > 0);
    const shot = marks[0];
    const held = {
      shots: marks.length,
      vx: shot ? Math.round(shot.vx) : 0,
      mark: p.pourAim ? { away: Math.round(p.pourAim.away), charge: p.pourAim.charge > 0.01 } : null,
      oil: Math.round(p.oilFrac * 100),
    };
    fire('touchend', x0 - 60, y0);
    await new Promise((r) => setTimeout(r, 140));
    return { held, freed: p.pourAim === null, vxAfter: (g.projectiles.all || []).filter((q) => q.active && q.poolRadius > 0).map((q) => Math.round(q.vx)) };
  });
  expect(pourAim.held.shots >= 1, '手指按住右侧时倾灯照常开火（它是自动开火的武器）', JSON.stringify(pourAim));
  expect(pourAim.held.vx < -1, '这一瓢往手指指的方向飞（怪在右边，自动瞄准会让它往右）', JSON.stringify(pourAim));
  expect(pourAim.held.mark !== null, '按住时场上有落点标记（方向和距离都归玩家）', JSON.stringify(pourAim));
  expect(pourAim.freed === true, '一松手就还给自动瞄准（标记也收起来）', JSON.stringify(pourAim));

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

  // 触屏按钮的冷却圈：手机上没有键盘，按下去没反应时全靠这一圈说"还在转"。
  // 真按一下（要让它跑过一帧才真的放出去），看圈出来了、会退、放完自己消失。
  const cdRing = await mobile.evaluate(async () => {
    const btn = document.querySelector('[data-action="dash"]');
    const p = window.__WICKLIGHT__.game.player;
    const t = new Touch({ identifier: 21, target: btn, clientX: 0, clientY: 0 });
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
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    send('touchstart');
    await wait(140);
    send('touchend');
    const fired = p.dashCd > 0;
    const ring = btn.style.getPropertyValue('--cd');
    const cooling = btn.classList.contains('is-cooling');
    await wait(420);
    const later = btn.style.getPropertyValue('--cd');
    await wait(1800);
    return { fired, ring, cooling, later, cd: p.dashCd, cdMax: p.dashCdMax, done: btn.style.getPropertyValue('--cd'), doneCooling: btn.classList.contains('is-cooling') };
  });
  const mobVibes = await mobile.evaluate(() => window.__PROBE__.vibes.log);
  expect(mobVibes.length > 0, '手机上按钮反馈会真的调用震动', JSON.stringify(mobVibes.slice(0, 4)));
  expect(cdRing.fired === true, '按住冲刺按钮会真的放出去', JSON.stringify(cdRing));
  expect(cdRing.cooling && Number(cdRing.ring) > 0, '冷却时按钮上要画冷却圈', JSON.stringify(cdRing));
  expect(Number(cdRing.later) < Number(cdRing.ring), '冷却圈会随时间退回去（不是画着不动）', JSON.stringify(cdRing));
  expect(cdRing.done === '' && cdRing.doneCooling === false, '转完了圈要消失（没圈 = 能按）', JSON.stringify(cdRing));

  // 按下缓冲（v65）在按钮上要看得见：冷却**快转完**的那一瞬间按下去，游戏会替你记下来、转完立刻放。
  // 这里真的把时间等到剩 0.15 秒再按（缓冲窗口只有 0.2 秒，早按等于没按——那正是这条规则的边界），
  // 然后看三件事：记下来了（is-buffered 亮起）、转完真的放出去了、放完那一下样子就收了。
  const bufferedTap = await mobile.evaluate(async () => {
    const btn = document.querySelector('[data-action="dash"]');
    const p = window.__WICKLIGHT__.game.player;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = new Touch({ identifier: 27, target: btn, clientX: 0, clientY: 0 });
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
    const tap = async (hold) => {
      send('touchstart');
      await wait(hold);
      send('touchend');
      await wait(80);
    };
    p.dashCd = 0;
    p.dashTimer = 0;
    const n0 = p.dashCount;
    await tap(120); // 先真的放一次，进入冷却
    const first = p.dashCount;
    for (let i = 0; i < 300 && p.dashCd > 0.15; i += 1) await wait(16);
    const left = p.dashCd;
    // 冷却只剩 0.15 秒时按下那一下。⚠ 这两个读数必须在**还按着**的时候取：
    // 冷却一转眼就转完了（0.15 秒），松手再等 80 毫秒，那一发已经被放出去了、
    // 缓冲也早就被消费掉了——量到的就是"从没记过"（第一版就是这么红的两条）。
    send('touchstart');
    await wait(50);
    const armed = p.dashBuffer > 0;
    const cls = btn.classList.contains('is-buffered');
    const stillCooling = p.dashCd > 0;
    send('touchend');
    await wait(420);
    return { n0, first, left, armed, cls, stillCooling, n1: p.dashCount, after: btn.classList.contains('is-buffered') };
  });
  expect(bufferedTap.first === bufferedTap.n0 + 1, '先按一下要真的放出去（后面才好比）', JSON.stringify(bufferedTap));
  expect(bufferedTap.left < 0.2 && bufferedTap.left > 0, '要卡在缓冲窗口里按（剩不到 0.2 秒）', JSON.stringify(bufferedTap));
  expect(bufferedTap.armed === true, '冷却快转完时按下的那一下会被记下来', JSON.stringify(bufferedTap));
  expect(bufferedTap.cls === true && bufferedTap.stillCooling === true, '记下了要说一声：is-buffered 亮起，但圈还在转', JSON.stringify(bufferedTap));
  expect(bufferedTap.n1 === bufferedTap.n0 + 2, '冷却一转完就替玩家把那一发放出去（不用再按一次）', JSON.stringify(bufferedTap));
  expect(bufferedTap.after === false, '放完就不该再挂着"记下了"的样子', JSON.stringify(bufferedTap));

  // 暂停时手还搭在摇杆上是常事：那一刻必须松手，恢复后角色不能自己往前跑
  const holdPause = await mobile.evaluate(async () => {
    const stick = document.getElementById('touch-stick');
    const ctl = window.__WICKLIGHT__.touch;
    const base = stick.querySelector('.touch-stick__base') || stick;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const t = new Touch({ identifier: 31, target: stick, clientX: cx, clientY: cy });
    const fire = (type, x, y) =>
      stick.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [new Touch({ identifier: 31, target: stick, clientX: x, clientY: y })],
          targetTouches: [],
          changedTouches: [new Touch({ identifier: 31, target: stick, clientX: x, clientY: y })],
          bubbles: true,
          cancelable: true,
        }),
      );
    fire('touchstart', cx, cy);
    fire('touchmove', cx + 46, cy);
    const held = { x: ctl.moveX, y: ctl.moveY };
    window.__WICKLIGHT__.game.togglePause();
    await new Promise((r2) => setTimeout(r2, 260));
    const after = { x: ctl.moveX, y: ctl.moveY, on: document.getElementById('touch-root').classList.contains('is-on') };
    window.__WICKLIGHT__.game.togglePause();
    await new Promise((r2) => setTimeout(r2, 260));
    const back = { on: document.getElementById('touch-root').classList.contains('is-on') };
    return { held, after, back, t: !!t };
  });
  expect(holdPause.held.x > 0.5, '摇杆推到底会有输入', JSON.stringify(holdPause));
  expect(holdPause.after.x === 0 && holdPause.after.y === 0, '暂停时摇杆要松手（回来不能自己跑）', JSON.stringify(holdPause));
  expect(holdPause.after.on === false, '暂停时触摸控件收起来（别压着暂停面板）', JSON.stringify(holdPause));
  expect(holdPause.back.on === true, '继续游戏后触摸控件回来', JSON.stringify(holdPause));

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
  // 手机上那几枚键盘提示要整片藏掉：没有键盘可用，画出来只会占地方
  // （`body.is-touch .key` 这条老规矩，新加的面板热键小片也得走它）。
  const keyChips = await mobile.evaluate(() => {
    const chips = [...document.querySelectorAll('.panel .key')];
    return { total: chips.length, shown: chips.filter((e) => e.getBoundingClientRect().width > 0).length };
  });
  expect(keyChips.total > 0 && keyChips.shown === 0, '手机上键盘提示全部藏掉', JSON.stringify(keyChips));
  expect(pausedByTap.wake === false, '暂停后放掉屏幕常亮', JSON.stringify(pausedByTap));

  // 手机上接了手柄（安卓上很常见）：底部那行说明平时是藏着的（没有键盘可用），
  // 但手柄那一份要露出来——`body.is-touch .hud__hint.is-pad` 那条规则只有在这儿量得到。
  await mobile.evaluate(() => {
    window.__PAD__ = { buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    navigator.getGamepads = () => [
      { id: 'BT Pad (STANDARD GAMEPAD)', index: 0, connected: true, buttons: window.__PAD__.buttons, axes: window.__PAD__.axes },
    ];
  });
  await sleep(300);
  const mobilePad = await mobile.evaluate(() => {
    const el = document.querySelector('.js-hint');
    const cs = getComputedStyle(el);
    return {
      connected: window.__WICKLIGHT__.game.padConnected,
      text: el.textContent,
      isPad: el.classList.contains('is-pad'),
      display: cs.display,
      h: Math.round(el.getBoundingClientRect().height),
      scroll: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(mobilePad.connected && mobilePad.isPad && /摇杆/.test(mobilePad.text), '手机上接了手柄，底部那行换成手柄那一份', mobilePad.text);
  expect(mobilePad.display === 'block' && mobilePad.h > 0, '触屏上也真的露出来（键盘那份藏掉，手柄这份露出来）', JSON.stringify(mobilePad));
  expect(mobilePad.scroll <= 1, '多出来的那行没把页面撑出横向滚动', String(mobilePad.scroll));
  await mobile.evaluate(() => {
    delete navigator.getGamepads;
  });
  await sleep(300);
  const mobilePadOff = await mobile.evaluate(() => {
    const el = document.querySelector('.js-hint');
    return { connected: window.__WICKLIGHT__.game.padConnected, display: getComputedStyle(el).display, isPad: el.classList.contains('is-pad') };
  });
  expect(mobilePadOff.connected === false && mobilePadOff.isPad === false, '拔掉手柄后那行回到键盘那一份', JSON.stringify(mobilePadOff));
  expect(mobilePadOff.display === 'none', '触屏上"空格冲刺"那行还是藏着的（没有键盘可用）', JSON.stringify(mobilePadOff));

  // 手机上那本构筑总览：v70 往「灯火」栏里加了一行（拨芯那四件遗物），v75 又加了**第二**行
  // （燎灯那四件），v76 是**第三**行（倾灯那四件）——三族买的是同一桶油，所以都住在这一栏里。
  // v77 又加了一栏「伏灯」（那一族买的是"位置"，所以它有自己的一栏，不长在灯火里），
  // v78 再加一栏「旋灯」（同一个理由：它买的是"你决定它们站在哪儿"），
  // v83 补上最后一栏「弃灯」（分灯到 v82 为止一件遗物都没有）。
  // 窄屏横带上最容易出事的正是"多一行 / 多一栏把面板撑出横向溢出"，所以这里也量一次
  // （和桌面那条同一个做法：那几栏在滚动容器里，先滚进视野再量）。
  // 为了把"最坏情况"量出来，**六族二十四件全塞上**：窄屏上那几栏最长就是这样。
  const mFamily = ['wickveil', 'wickember', 'wickstride', 'wickthrift'];
  const mAuraFamily = ['auraflare', 'auralantern', 'aurasiphon', 'aurasmother'];
  const mPourFamily = ['pourstoke', 'pourladle', 'pourgather', 'pourward'];
  const mMineFamily = ['minerack', 'minelink', 'minebait', 'minetrip'];
  const mVortexFamily = ['vortexnet', 'vortexmark', 'vortexpress', 'vortexsnare'];
  const mLampFamily = ['lampburst', 'lampshade', 'lampember', 'lamphaze'];
  const mFamAll = [...mFamily, ...mAuraFamily, ...mPourFamily, ...mMineFamily, ...mVortexFamily, ...mLampFamily];
  await mobile.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.addRelic(id);
    g.player.recomputeStats();
  }, mFamAll);
  // 手里也得有伏灯与旋灯：那两栏只在"有这件武器（或者挂着这一族的遗物）"时才画
  await mobile.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    window.__SAVED_MINE__ = g.player.weapons.has('mine');
    if (!window.__SAVED_MINE__) g.player.weapons.set('mine', 1);
    window.__SAVED_VORTEX__ = g.player.weapons.has('vortex');
    if (!window.__SAVED_VORTEX__) g.player.weapons.set('vortex', 1);
    g.player.recomputeStats();
  });
  await mobile.click('[data-act="sheet"]');
  await sleep(350);
  await mobile.evaluate(() => document.querySelector('.lo-light')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const mobileSheet = await mobile.evaluate(() => {
    const light = window.__PROBE__.layout('.lo-light');
    const panel = window.__PROBE__.layout('.panel--loadout');
    return {
      count: light.count,
      issues: light.issues,
      hOverflow: panel.hOverflow,
      text: document.querySelector('.lo-light')?.textContent ?? '',
    };
  });
  expect(mobileSheet.count === 1, '手机上构筑总览也有「灯火」那一栏', JSON.stringify(mobileSheet));
  expect(mobileSheet.issues.length === 0, '手机横带上「灯火」栏不越界', mobileSheet.issues.join('; '));
  expect(mobileSheet.hOverflow === 0, '手机横带上总览没被撑出横向滚动', `hOverflow=${mobileSheet.hOverflow}`);
  // 「伏灯」那一栏在「灯火」下面，窄屏上得自己滚进来再量一次（和桌面那条同一个做法）
  await mobile.evaluate(() => document.querySelector('.lo-mine')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const mobileMine = await mobile.evaluate(() => {
    const mine = window.__PROBE__.layout('.lo-mine');
    const panel = window.__PROBE__.layout('.panel--loadout');
    return {
      count: mine.count,
      issues: mine.issues,
      hOverflow: panel.hOverflow,
      text: document.querySelector('.lo-mine')?.textContent ?? '',
    };
  });
  expect(mobileMine.count === 1, '手机上也有「伏灯」那一栏', JSON.stringify(mobileMine));
  expect(mobileMine.issues.length === 0, '手机横带上「伏灯」栏不越界', mobileMine.issues.join('; '));
  expect(mobileMine.hOverflow === 0, '多出「伏灯」那一栏也没把手机上的总览撑出横向滚动', `hOverflow=${mobileMine.hOverflow}`);
  // 「旋灯」那一栏在伏灯下面，同样得自己滚进来再量一次
  await mobile.evaluate(() => document.querySelector('.lo-vortex')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const mobileVortex = await mobile.evaluate(() => {
    const vx = window.__PROBE__.layout('.lo-vortex');
    const panel = window.__PROBE__.layout('.panel--loadout');
    return {
      count: vx.count,
      issues: vx.issues,
      hOverflow: panel.hOverflow,
      text: document.querySelector('.lo-vortex')?.textContent ?? '',
    };
  });
  expect(mobileVortex.count === 1, '手机上也有「旋灯」那一栏', JSON.stringify(mobileVortex));
  expect(mobileVortex.issues.length === 0, '手机横带上「旋灯」栏不越界', mobileVortex.issues.join('; '));
  expect(mobileVortex.hOverflow === 0, '多出「旋灯」那一栏也没把手机上的总览撑出横向滚动', `hOverflow=${mobileVortex.hOverflow}`);
  // 「弃灯」那一栏在最下面
  await mobile.evaluate(() => document.querySelector('.lo-lamp')?.scrollIntoView({ block: 'center' }));
  await sleep(150);
  const mobileLamp = await mobile.evaluate(() => {
    const lp = window.__PROBE__.layout('.lo-lamp');
    const panel = window.__PROBE__.layout('.panel--loadout');
    return {
      count: lp.count,
      issues: lp.issues,
      hOverflow: panel.hOverflow,
      text: document.querySelector('.lo-lamp')?.textContent ?? '',
    };
  });
  expect(mobileLamp.count === 1, '手机上也有「弃灯」那一栏', JSON.stringify(mobileLamp));
  expect(mobileLamp.issues.length === 0, '手机横带上「弃灯」栏不越界', mobileLamp.issues.join('; '));
  expect(mobileLamp.hOverflow === 0, '多出「弃灯」那一栏也没把手机上的总览撑出横向滚动', `hOverflow=${mobileLamp.hOverflow}`);
  const LIGHT_NAMES = { ...RELIC_NAME, ...AURA_RELIC_NAME, ...POUR_RELIC_NAME };
  const OWN_NAMES = { ...MINE_RELIC_NAME, ...VORTEX_RELIC_NAME, ...LAMP_RELIC_NAME };
  expect(
    mFamAll.every((id) => id in OWN_NAMES || LIGHT_NAMES[id]),
    '这一条的前提：二十四件遗物的名字都登记在案（少一件这一条就量不全）',
    mFamAll.join('/'),
  );
  expect(
    mFamAll.every((id) => {
      const where =
        id in VORTEX_RELIC_NAME
          ? mobileVortex.text
          : id in MINE_RELIC_NAME
            ? mobileMine.text
            : id in LAMP_RELIC_NAME
              ? mobileLamp.text
              : mobileSheet.text;
      return where.includes(OWN_NAMES[id] ?? LIGHT_NAMES[id]);
    }),
    '手机上也把六族二十四件遗物连条件一起写出来了',
    `${mobileSheet.text.slice(-160)} | ${mobileMine.text.slice(-160)} | ${mobileVortex.text.slice(-160)} | ${mobileLamp.text.slice(-160)}`,
  );
  await mobile.screenshot({ path: join(SHOTS, '17c-mobile-light.png') });
  await mobile.click('[data-act="sheet-close"]');
  await sleep(300);
  // 收尾：把塞进去的二十四件拿掉、把借来的那两把武器还回去（后面的检查照旧）
  await mobile.evaluate((ids) => {
    const g = window.__WICKLIGHT__.game;
    for (const id of ids) g.player.relics.delete(id);
    if (!window.__SAVED_MINE__) g.player.weapons.delete('mine');
    if (!window.__SAVED_VORTEX__) g.player.weapons.delete('vortex');
    g.player.recomputeStats();
  }, mFamAll);

  await mobile.click('[data-act="resume"]');
  await sleep(400);

  // 侧滑返回：横屏左边缘那道手势带正好压在左手拇指的活动范围里——正往左跑着，
  // 一个侧滑，浏览器就离开页面，这一局直接没了。所以战斗里要往历史里塞一条守卫，
  // 让返回键先撞在它上面：撞上就暂停，走不走由玩家自己决定。
  const backGuard = await mobile.evaluate(async () => {
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__WICKLIGHT__.game;
    const armed = { state: history.state, len: history.length };
    history.back(); // 等价于玩家按返回 / 侧滑返回
    await nap(320);
    const hit = {
      state: g.state,
      hasResume: !!document.querySelector('[data-act="resume"]'),
      histState: history.state,
      len: history.length,
    };
    const afterBack = g.state;
    // 回菜单：多出来的那一条历史得吃掉，别让玩家为了退出要按两次返回
    g.goMenu();
    await nap(360);
    const menu = { state: g.state, histState: history.state, len: history.length };
    // 再开一局：守卫得重新装上（不然只有第一局受保护）
    g.newRun('warden', 'normal', false);
    await nap(360);
    const again = { state: g.state, histState: history.state, len: history.length };
    return { armed, hit, afterBack, menu, again };
  });
  expect(
    backGuard.armed.state && backGuard.armed.state.wicklightGuard === 1,
    '战斗中历史里塞着一条守卫（返回键先撞它）',
    JSON.stringify(backGuard.armed),
  );
  expect(backGuard.hit.state === 'paused', '手机上按返回＝暂停这一局，不是直接离开页面', JSON.stringify(backGuard.hit));
  expect(backGuard.hit.hasResume, '返回之后停在暂停面板上', JSON.stringify(backGuard.hit));
  expect(backGuard.hit.histState === null, '守卫被弹掉了：再按一次返回就是真的离开（不是按不动）', JSON.stringify(backGuard.hit));
  expect(backGuard.menu.state === 'menu', '离开战斗回到菜单', JSON.stringify(backGuard.menu));
  expect(
    backGuard.menu.histState === null && backGuard.menu.len <= backGuard.armed.len,
    '离开战斗就撤守卫：不会攒下一串历史让玩家按好几次返回',
    JSON.stringify(backGuard.menu),
  );
  expect(
    backGuard.again.histState && backGuard.again.histState.wicklightGuard === 1,
    '第二局照样有守卫（不是只有第一局受保护）',
    JSON.stringify(backGuard.again),
  );

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

  // 手机上的「薪火」那一块（v80）：844×390 上解锁树本来就是滚着看的，
  // 炉子加进来之后要量的是（1）三张卡排成**一排**（折行就是白白多滚一屏）、
  // （2）面板没有被撑出横向滚动、（3）矮横屏上那句指路的话收起来了（省下的正是那一行的高度）。
  await mobile.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.save.embers = Math.max(5000, g.save.embers);
    g.togglePause();
    g.ui.showScreen('meta');
  });
  await sleep(320);
  await mobile.evaluate(() => document.querySelector('.fire-block')?.scrollIntoView({ block: 'center' }));
  await sleep(200);
  const mobileFire = await mobile.evaluate(() => {
    const cards = window.__PROBE__.layout('.fire');
    const panel = document.querySelector('.panel--meta');
    return {
      count: cards.count,
      issues: cards.issues,
      rows: new Set([...document.querySelectorAll('.fire')].map((e) => Math.round(e.getBoundingClientRect().y))).size,
      scroll: panel?.scrollWidth ?? 0,
      client: panel?.clientWidth ?? 0,
      noteH: Math.round(document.querySelector('.fire-note')?.getBoundingClientRect().height ?? -1),
      perH: Math.round(document.querySelector('.fire__per')?.getBoundingClientRect().height ?? -1),
      head: document.querySelector('.fire-head')?.textContent ?? '',
    };
  });
  expect(mobileFire.count === 3, '手机上「薪火」三张卡也都画出来了', `count=${mobileFire.count}`);
  expect(mobileFire.issues.length === 0, '矮横屏上三张薪火卡不被切、也不出界', mobileFire.issues.join('; '));
  expect(mobileFire.rows === 1, '矮横屏上三张卡排成一排（不白白多滚一屏）', `${mobileFire.rows} 行`);
  expect(mobileFire.scroll <= mobileFire.client + 1, '多出「薪火」那一块也没把解锁树撑出横向滚动', `${mobileFire.scroll}/${mobileFire.client}`);
  expect(mobileFire.noteH === 0 && mobileFire.perH > 0, '矮横屏上收掉的是指路那句话，不是"每一级改什么"', JSON.stringify({ noteH: mobileFire.noteH, perH: mobileFire.perH }));
  await mobile.screenshot({ path: join(SHOTS, '16c-mobile-meta.png') });
  // 收尾：这一屏是从暂停面板进来的，量完要**回到这一局**（`togglePause` 只看 playing / paused
  // 两个状态，留在 meta 上不还回去的话，后面那一步的 `togglePause` 就翻不动了）
  await mobile.evaluate(() => {
    const g = window.__WICKLIGHT__.game;
    g.ui.showScreen('paused');
    g.togglePause();
  });
  await sleep(250);

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

  // ── 12. 焦点环（v82）：键盘 / 手柄也能把这十几屏走完 ──
  // 这一条量的是**那一圈光真的画出来了、而且按下的确实是它圈住的那一项**——
  // 离线那套（tests/focus.test.mjs）量的是"往下该挑哪一项"的打分，量不到 DOM。
  await page.evaluate(() => window.__WICKLIGHT__.game.goMenu());
  await sleep(420);
  const ringOff = await page.evaluate(() => ({
    idx: window.__WICKLIGHT__.ui.focusIndex,
    marks: document.querySelectorAll('.screen .is-focus').length,
  }));
  expect(ringOff.idx === -1 && ringOff.marks === 0, '菜单刚画出来时环还没亮（一按方向才亮，手机上不该看见它）', JSON.stringify(ringOff));

  await page.keyboard.press('ArrowDown');
  await sleep(240);
  const ringOn = await page.evaluate(() => {
    const el = document.querySelector('.screen .is-focus');
    const r = el ? el.getBoundingClientRect() : null;
    return {
      idx: window.__WICKLIGHT__.ui.focusIndex,
      marks: document.querySelectorAll('.screen .is-focus').length,
      act: el?.dataset?.act ?? null,
      label: (el?.textContent ?? '').replace(/\s+/g, '').slice(0, 16),
      w: r ? Math.round(r.width) : 0,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      outline: el ? getComputedStyle(el).outlineWidth : null,
    };
  });
  expect(ringOn.marks === 1 && ringOn.act === 'play', '第一次按方向：环亮在第一个可点的东西上（开始冒险）', JSON.stringify(ringOn));
  expect(ringOn.w > 0 && ringOn.outline === '2px', '那一圈光是画出来的（2px 描边），而且没把面板撑出滚动', JSON.stringify(ringOn));
  expect(ringOn.overflow <= 1, '环不占布局（outline 不参与排版）', String(ringOn.overflow));
  await shot('18-focus-menu');

  // 回车 = 按下环上那一项：主菜单 →（开始冒险）→ 选灯火
  await page.keyboard.press('Enter');
  await sleep(380);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'select', '回车按下的是环上那一项（开始冒险 → 选灯火）');

  // 选灯火那一屏是**网格**（四张灯火卡 + 三档难度 + 返回 / 点燃灯芯）：一路往下挪，
  // 到底了往右一格——「点燃灯芯」就在「返回」右边那一格（几何上没有东西在「返回」下面）。
  // 量的是"环真的按几何走"，所以这里不做任何"直接把环设到第 N 项"的捷径，只按键。
  const ringWhere = () =>
    page.evaluate(() => {
      const el = document.querySelector('.screen .is-focus');
      return {
        act: el?.dataset?.act ?? null,
        sig: el ? (el.dataset.lantern ? `lantern:${el.dataset.lantern}` : el.dataset.diff ? `diff:${el.dataset.diff}` : el.dataset.act ?? '?') : null,
        r: Math.round(el?.getBoundingClientRect().width ?? 0),
        i: window.__WICKLIGHT__.ui.focusIndex,
        marks: document.querySelectorAll('.screen .is-focus').length,
      };
    });
  const walkTo = async (act, tries = 10) => {
    const seen = [];
    for (let i = 0; i < tries; i += 1) {
      const at = await ringWhere();
      seen.push(at.sig);
      if (at.act === act) return { ...at, seen };
      await page.keyboard.press('ArrowDown');
      await sleep(150);
    }
    // 往下到头了（这一列下面什么都没有）：往右一格找那颗主按钮
    await page.keyboard.press('ArrowRight');
    await sleep(150);
    const at = await ringWhere();
    return { ...at, seen: [...seen, '→', at.sig] };
  };
  const walked = await walkTo('start');
  expect(walked.act === 'start', '方向键能一路挪到「点燃灯芯」上（往下走到底，再往右一格）', JSON.stringify(walked));
  expect(walked.r > 0 && walked.marks === 1, '环圈住的是那颗主按钮，而且整屏只有一圈光', JSON.stringify(walked));
  await shot('18b-focus-select');
  await page.keyboard.press('Enter');
  await sleep(1500);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'playing', '回车点起来这一局（键盘全程不碰鼠标）');

  // 主菜单右边那一列账目（图鉴 / 档案 / 成就 / 设置）也能用环 + 回车走进去，`Esc` 走回来。
  // 那一列在右边：往下亮出「开始冒险」，往右跨一列到「生涯档案」，再往下就是「图鉴」。
  await page.evaluate(() => window.__WICKLIGHT__.game.goMenu());
  await sleep(420);
  const crossed = await page.evaluate(() => ({ idx: window.__WICKLIGHT__.ui.focusIndex, marks: document.querySelectorAll('.screen .is-focus').length }));
  expect(crossed.idx === -1 && crossed.marks === 0, '换了一屏：环收掉了（不会留在上一屏的第 4 项上）', JSON.stringify(crossed));
  const menuPath = [];
  const stepTo = async (code) => {
    await page.keyboard.press(code);
    await sleep(160);
    const at = await ringWhere();
    menuPath.push(`${code}:${at.sig}@${at.i}`);
    return at;
  };
  expect((await stepTo('ArrowDown')).act === 'play', '往下：环亮在「开始冒险」上（那一颗最宽，占着左列）');
  expect((await stepTo('ArrowDown')).act === 'endless', '再往下：同一列里正下方那一颗（不是并排偏右的「每日灯芯」）');
  expect((await stepTo('ArrowUp')).act === 'play', '往回往上：回到同一列上面那一颗');
  expect((await stepTo('ArrowRight')).act === 'meta', '往右：跨到右列那一项上');
  const codexAt = await stepTo('ArrowDown');
  expect(codexAt.act === 'codex', '再往下：右列里的「图鉴」', menuPath.join(' '));
  await page.keyboard.press('Enter');
  await sleep(400);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'codex', '回车进图鉴（这一屏从前只能用鼠标点）');
  // Esc = 返回：图鉴 / 设置 / 档案那几屏的返回钮从前只能用鼠标点，而键盘和手柄到这儿就断了
  await page.keyboard.press('Escape');
  await sleep(400);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'menu', 'Esc 在图鉴上 = 返回主菜单');

  // 设置那一屏：三条开关 + 一排画质（低 / 中 / 高）+ 返回。
  // 环从第一条开关往下走，落在**画质那一排的「高」**上——那一排三格是横着排的，
  // 而「高」正好在开关那一列的正下方（这一条正是"同列优先"那条规则量出来的样子）。
  // 再往左一格到「中」，按下回车：画质真的要动，而环要**留在「中」那一格**上
  // （点一下整屏都会重画，环掉回第一项的话玩家就迷路了）。
  await page.evaluate(() => {
    window.__WICKLIGHT__.game.settings.set('quality', 'high');
    window.__WICKLIGHT__.ui.showScreen('settings');
  });
  await sleep(300);
  const segWalk = [];
  for (let i = 0; i < 8; i += 1) {
    const at = await page.evaluate(() => {
      const el = document.querySelector('.screen .is-focus');
      return { q: el?.dataset?.quality ?? null, t: el?.dataset?.toggle ?? null, i: window.__WICKLIGHT__.ui.focusIndex };
    });
    segWalk.push(`${at.t ? `开关:${at.t}` : at.q ? `画质:${at.q}` : '-'}@${at.i}`);
    if (at.q) break;
    await page.keyboard.press('ArrowDown');
    await sleep(150);
  }
  const onHigh = await page.evaluate(() => {
    const el = document.querySelector('.screen .is-focus');
    return { q: el?.dataset?.quality ?? null, value: window.__WICKLIGHT__.game.settings.data.quality, marks: document.querySelectorAll('.screen .is-focus').length };
  });
  expect(onHigh.q === 'high' && onHigh.value === 'high', '方向键能挪到画质那一排上，而且落在开关那一列正下方的「高」上', `${segWalk.join(' ')} | ${JSON.stringify(onHigh)}`);
  await page.keyboard.press('ArrowLeft');
  await sleep(160);
  const onMedium = await page.evaluate(() => document.querySelector('.screen .is-focus')?.dataset?.quality ?? null);
  expect(onMedium === 'medium', '往左一格：环到「中」上（那一排一共三格）', String(onMedium));
  await page.keyboard.press('Enter');
  await sleep(300);
  const segAfter = await page.evaluate(() => {
    const el = document.querySelector('.screen .is-focus');
    return { q: el?.dataset?.quality ?? null, value: window.__WICKLIGHT__.game.settings.data.quality, marks: document.querySelectorAll('.screen .is-focus').length };
  });
  expect(segAfter.value === 'medium', '按下回车真的把画质切到「中」', JSON.stringify(segAfter));
  expect(segAfter.q === 'medium' && segAfter.marks === 1, '整屏重画之后环还留在「中」那一格上', JSON.stringify(segAfter));
  await shot('18c-focus-settings');

  // 手柄：十字键挪环、Ⓐ 按下、Start = 那颗主按钮（菜单那一屏）
  await page.evaluate(() => {
    window.__WICKLIGHT__.game.goMenu();
    window.__PAD__ = { buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    navigator.getGamepads = () => [
      { id: 'Playwright Pad (STANDARD GAMEPAD)', index: 0, connected: true, buttons: window.__PAD__.buttons, axes: window.__PAD__.axes },
    ];
  });
  await sleep(320);
  await page.evaluate(() => { window.__PAD__.buttons[13] = { pressed: true, value: 1 }; }); // 十字键下
  await padFrames(4);
  await page.evaluate(() => { window.__PAD__.buttons[13] = { pressed: false, value: 0 }; });
  await padFrames(2);
  const padRing = await page.evaluate(() => {
    const el = document.querySelector('.screen .is-focus');
    return { act: el?.dataset?.act ?? null, idx: window.__WICKLIGHT__.ui.focusIndex, label: (el?.textContent ?? '').replace(/\s+/g, '').slice(0, 16) };
  });
  expect(padRing.act === 'play' && padRing.idx === 0, '手柄十字键也能把环亮出来（而且亮在「开始冒险」上）', JSON.stringify(padRing));
  await page.evaluate(() => { window.__PAD__.buttons[0] = { pressed: true, value: 1 }; }); // Ⓐ
  await padFrames(4);
  await page.evaluate(() => { window.__PAD__.buttons[0] = { pressed: false, value: 0 }; });
  await padFrames(3);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'select', 'Ⓐ 按下环上那一项（开始冒险）');
  // Ⓑ 在战斗之外 = 返回（战斗里它才是分灯）：选灯火那一屏上按一下该回到主菜单
  await page.evaluate(() => { window.__PAD__.buttons[1] = { pressed: true, value: 1 }; }); // Ⓑ
  await padFrames(4);
  await page.evaluate(() => { window.__PAD__.buttons[1] = { pressed: false, value: 0 }; });
  await padFrames(4);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'menu', 'Ⓑ 在选灯火那一屏 = 返回主菜单（战斗里它才是分灯）');
  // Start = 那一屏的主按钮（换屏之后环还没亮，所以走的是 `panelPrimary` 那条路）：
  // 主菜单 →「开始冒险」→ 选灯火 →「点燃灯芯」。手柄一路只按键，一次都没碰键鼠
  const padStart = async () => { await page.evaluate(() => { window.__PAD__.buttons[9] = { pressed: true, value: 1 }; }); await padFrames(4); };
  const padRelease = async () => { await page.evaluate(() => { window.__PAD__.buttons[9] = { pressed: false, value: 0 }; }); await padFrames(3); };
  await padStart();
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'select', 'Start 在主菜单上 = 「开始冒险」');
  await padRelease();
  await padStart();
  await padRelease();
  await padFrames(3);
  expect((await page.evaluate(() => window.__WICKLIGHT__.game.state)) === 'playing', 'Start 在选灯火那一屏 = 「点燃灯芯」（手柄也能自己开一局）');
  await shot('18d-focus-pad');
  // 拔掉：别把后面几条（还要用键盘 / 鼠标）拖下水
  await page.evaluate(() => { delete navigator.getGamepads; });
  await padFrames(2);

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
