/**
 * 静态 UI 完整性检查。
 *
 * 这个沙箱里没有浏览器，界面（菜单 / 商店 / 升级卡 / 成就……）没法用眼睛看，
 * 所以用静态分析兜住两类"只有肉眼才能发现"的错误：
 *   1. 某个按钮渲染出来了，但没有绑定处理器（点了没反应）；
 *   2. 某个 class 在 TS 里用了，但 main.css 里没有对应样式（元素没样式 / 布局塌掉）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');

const UI_FILES = ['src/ui/UIManager.ts', 'src/ui/HUD.ts', 'src/ui/TouchControls.ts', 'src/core/Game.ts'];

test('UI：挂载点、交互钩子与样式类', () => {
  const html = read('index.html');
  const css = read('src/styles/main.css');
  const sources = UI_FILES.map((f) => ({ f, txt: read(f) }));
  const ui = read('src/ui/UIManager.ts');

  // ── 1. index.html 必须提供代码里查询的所有挂载点 ──
  const ids = new Set();
  for (const { txt } of sources) {
    for (const m of txt.matchAll(/getElementById\('([^']+)'\)/g)) ids.add(m[1]);
  }
  assert.ok(ids.size >= 4, '应至少有 canvas / ui / toast / touch 几个挂载点');
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `index.html 缺少 #${id}`);

  // ── 2. 每个 data-act 钩子都必须有对应的处理器 ──
  const acts = new Set();
  for (const m of ui.matchAll(/data-act="([^"${]+)"/g)) acts.add(m[1]);
  assert.ok(acts.size >= 12, `交互钩子数量异常（${acts.size}）`);
  for (const act of acts) {
    assert.ok(
      ui.includes(`[data-act="${act}"]`),
      `按钮 data-act="${act}" 没有绑定点击处理器（点击将没有任何反应）`,
    );
  }

  // ── 3. 其余属性钩子（卡片 / 商品 / 祭坛 / 画质……）必须有 on/onAll 绑定 ──
  for (const attr of ['offer', 'buy', 'shrine', 'quality', 'toggle']) {
    assert.ok(ui.includes(`data-${attr}=`), `data-${attr} 应该被使用`);
    assert.ok(
      ui.includes(`[data-${attr}]`) || ui.includes(`[data-${attr}="`),
      `data-${attr} 元素没有绑定事件`,
    );
  }

  // ── 4. TS 里用到的 class 必须都能在样式表里找到定义 ──
  // 先把模板插值整段去掉（含嵌套的引号/三目），否则解析字符串里的引号会截断 class 列表。
  const stripTemplates = (txt) => {
    let out = '';
    let i = 0;
    while (i < txt.length) {
      if (txt[i] === '$' && txt[i + 1] === '{') {
        let depth = 1;
        let j = i + 2;
        while (j < txt.length && depth > 0) {
          if (txt[j] === '{') depth += 1;
          else if (txt[j] === '}') depth -= 1;
          j += 1;
        }
        out += ' ';
        i = j;
      } else {
        out += txt[i];
        i += 1;
      }
    }
    return out;
  };
  const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const used = new Map();
  const add = (c, f) => {
    if (!used.has(c)) used.set(c, new Set());
    used.get(c).add(f);
  };
  for (const { f, txt } of sources) {
    const flat = stripTemplates(txt);
    for (const m of flat.matchAll(/class="([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) add(c, f);
    }
    for (const m of flat.matchAll(/className\s*=\s*[`']([^`']*)[`']/g)) {
      for (const c of m[1].split(/\s+/)) if (c) add(c, f);
    }
    for (const m of txt.matchAll(/classList\.(?:add|toggle|remove)\('([^']+)'/g)) add(m[1], f);
  }
  assert.ok(used.size >= 80, `扫描到的 class 数量异常（${used.size}）`);
  const missing = [...used].filter(([c]) => !cssClasses.has(c) && !c.startsWith('js-'));
  assert.deepEqual(
    missing.map(([c, f]) => `${c} (${[...f].join(',')})`),
    [],
    '这些 class 没有样式定义',
  );

  // ── 5. 设置界面的滑杆必须都有 data-key ──
  const sliders = [...ui.matchAll(/<input type="range"[^>]*>/g)].map((m) => m[0]);
  assert.ok(sliders.length >= 4, '设置界面应有多个滑杆');
  for (const s of sliders) assert.ok(s.includes('data-key='), `滑杆缺少 data-key：${s}`);
});
