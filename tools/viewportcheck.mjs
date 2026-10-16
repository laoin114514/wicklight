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

/**
 * 参与体检的元素：HUD 的每一块 + 两个触摸控件 + 公告 + 卡片。
 * 卡片是 v60 加的：844×390 上"开局那几张说明卡"曾经一路堆到 y=413（屏幕才 390 高），
 * 覆盖 21% 的屏幕、正好压在站在正中的玩家身上——这条只有自动量才拦得住。
 */
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
  '.hud__pause',
  // ⚠ 提示卡的 class 是 `toast toast--tip`：写 `.toast` 会把同一张卡量两遍，
  // 于是"自己和自己压住"——必须用 :not() 把两种卡片分开。
  '.toast:not(.toast--tip)',
  '.toast--tip',
];

/**
 * 第二遍量什么：把开局那几秒真实会连着冒出来的东西一次全推出来。
 * 先走 6 秒的卡片计时（掌上横屏上公告与卡片轮流用那条横带，得让它先讲完），
 * 再推三条短公告 + 关卡卡 + 武器卡 + 精英卡——v59 的翻车现场就是这一串。
 */
const BURST = () => {
  const g = window.__WICKLIGHT__.game;
  const h = g.hud;
  for (let i = 0; i < 60; i += 1) h.updateCards(0.1);
  h.toast('📖 图鉴 +2 条');
  h.toast('🎯 悬赏 · 燃爆 · 三次清场（本关）');
  h.toast('☄ 陨石雨');
  h.tip('关卡 · 幽林', '光照不见的树影。险境：浓雾 / 陨石雨 / 荆棘回廊；首领：荆棘领主。');
  g.showTip('weapon:fireball', '武器 · 爆裂火球', '落地炸开一圈。给火球加范围就是给一整片人加伤害。');
  g.showTip('enemy:shade', '精英 · 影蛭', '贴着你走，靠数量耗你的油。别站着不动。');
};

/**
 * 第三遍量什么：全游戏最长的那张提示卡，外加两条短公告。
 * 卡片长短差着四倍（"分灯"两行讲完、"掠影"六行），按屏幕高度在 CSS 里写死"最多几行"
 * 必然有一档会漏——844×390 就漏过（两张卡片叠到下沿 y=190，玩家头顶 181）。
 * 现在超出去的那几行由 HUD.fitCard 按真实行高砍掉，这条用例就是去量它砍得准不准。
 */
const LONG = () => {
  const h = window.__WICKLIGHT__.game.hud;
  h.clearCards();
  // ⚠ 悬赏牌是随机出现的、灯台牌只有带灯台的关卡才有：不点亮它们，这一遍十次里有九次
  // 量不到"卡片压在悬赏牌上"那条边（v62 就是靠一次偶然出现才逮到那条 4px 的缝）。
  // 直接往两块牌子里灌一份内容并挂上 is-on：HUD 那两处签名没变就不会回来覆盖它，
  // 量到的几何和它们真亮着的时候一模一样。
  const chip = document.querySelector('.hud__bounty');
  chip.innerHTML = '<b>🎯 悬赏 · 燃爆 · 三次清场</b><span>1/3</span><i><u style="width:33%"></u></i>';
  chip.classList.add('is-on');
  const pyre = document.querySelector('.hud__pyre');
  pyre.innerHTML = '<b>🏮 灯台 1/3</b><span>靠近并停留片刻点亮 · 长明一处</span>';
  pyre.classList.add('is-on');
  h.tip(
    '掠影 · 擦着危险走过去',
    '贴着敌人或弹幕走（脚边那圈符文会长）就攒热度，还会回一点灯油：离得越近、走得越快，涨得越快；' +
      '站着不动不算。攒满会点着一阵「灯焰高涨」——照得更远、伤害 +25%、走得更快、' +
      '代价是火大油也烧得凶（+30%），但焰里每杀一只怪都会给它续一点时间。冲刺里从弹幕正中穿过，那一下是双倍。',
  );
  h.toast('📖 图鉴 6/155 · 阴影回廊');
  h.toast('🏆 成就解锁 · 第一簇火 +10 余烬');
};

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
        const measure = () =>
          page.evaluate((sels) => {
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
            // 屏幕正中偏上那一坨是**玩家自己**（半径 14 的精灵，相机就把他钉在正中）：
            // 卡片压到它，玩家就看不见自己，等于直接挨打。上面那套"两两互相压住"管不到它，
            // 因为玩家不是 HUD 元素——那口气留 2px（卡片自己已经让了 6px）。
            const playerTop = innerHeight / 2 - 16;
            const overPlayer = list.filter((x) => x.s.includes('toast') && x.b > playerTop).map((x) => `${x.s} 下沿 ${Math.round(x.b)}`);
            return { clashes, outside, overPlayer, visible: list.length, seen: list.map((x) => x.s) };
          }, SELS);
        const problems = [];
        // 第一遍：开局那一秒（公告 + 关卡卡）
        const first = await measure();
        // 第二遍：把开局那几秒真实会连着冒出来的卡片一次全推出来
        await page.evaluate(BURST);
        await sleep(300);
        const burst = await measure();
        // 第三遍：全游戏最长的那张卡（"掠影"有 160 个字，844 宽的横带上要六行）。
        // 它一个人就得占满整条横带——这里量的正是 fitCard 那把尺子：
        // 卡片的正文要么整句讲完，要么按真实行高砍到刚好停在玩家头顶，两条路都不许过线。
        await page.evaluate(LONG);
        await sleep(300);
        const long = await measure();
        // ⚠ 长卡这一遍是"这套判据到底量到了什么"的底线：长卡与悬赏牌少一块，
        //   上面那几条"没压住"就全是空过（悬赏是随机出现的，正是这么漏过一次）。
        for (const need of ['.toast--tip', '.hud__bounty', '.hud__pyre']) {
          if (!long.seen.includes(need)) problems.push(`长卡这一遍没量到 ${need}`);
        }
        for (const [tag, out] of [['开局', first], ['卡片', burst], ['长卡', long]]) {
          if (out.clashes.length) problems.push(`${tag}压住：${out.clashes.join(' · ')}`);
          if (out.outside.length) problems.push(`${tag}出界：${out.outside.join(',')}`);
          if (out.overPlayer.length) problems.push(`${tag}压住玩家：${out.overPlayer.join(' · ')}`);
        }
        if (errors.length) problems.push(`报错：${errors.join('|')}`);
        const ok = problems.length === 0;
        if (!ok) bad += 1;
        console.log(
          `${String(w).padStart(4)}×${String(h).padEnd(4)} ${ok ? '✔' : '✖'} ${first.visible} 件` +
            `${burst.visible} 件（卡片）${problems.length ? ' ' + problems.join(' · ') : ''}`,
        );
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
