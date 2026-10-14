/**
 * 界面渲染检查：把每个界面（菜单 / 选灯 / 升级 / 商店 / 祭坛 / 结算 / 成就 / 设置）
 * 真正渲染一遍，然后扫描产出的 HTML。
 *
 * 没有浏览器的时候，这是唯一能自动发现"卡片字段缺失导致界面上写着 undefined / NaN"
 * 这类问题的办法——它们不会抛异常，但会让界面看起来很糟。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('所有界面都渲染出干净无缺字段的标记', async (t) => {
  const env = installDomStubs();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));

  await import(`${ENTRY.href}?v=${Date.now()}`);
  env.frame();
  const { game, loop, hud } = globalThis.window.__WICKLIGHT__;

  t.after(() => {
    console.error = originalError;
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  const ui = game.ui;

  const captured = [];
  const capture = (label, state) => {
    ui.showScreen(state);
    captured.push([label, ui.screen.innerHTML]);
  };

  // 依次制造出每个界面需要的状态，然后渲染
  capture('menu', 'menu');
  capture('select', 'select');

  game.pendingLevels = 1;
  game.openLevelUp();
  capture('levelup', 'levelup');

  capture('paused', 'paused');

  // 构筑总览：先塞一点真实的武器/被动/遗物，确保它不是只渲染"空状态"
  game.player.addWeapon('wisp');
  game.player.levelWeapon('wisp');
  game.player.addPassive('might', 2);
  game.player.addRelic('whetstone');
  capture('loadout', 'loadout');

  game.onStageComplete();
  capture('shop', 'shop');

  game.beginShrine?.();
  game.state = 'shrine';
  if (!game.shrineOffers.length) {
    game.shrineOffers = [
      { id: 'tithe', name: '献金', blurb: '立刻获得 60 金币。', icon: '🪙', color: '#ffd24e' },
      { id: 'vigil', name: '守夜', blurb: '回复生命。', icon: '🕯️', color: '#8affc1' },
      { id: 'fasting', name: '节食', blurb: '耗油降低。', icon: '🫗', color: '#8fa7ff' },
    ];
  }
  capture('shrine', 'shrine');

  game.state = 'victory';
  capture('victory', 'victory');
  game.state = 'dead';
  capture('dead', 'dead');
  capture('meta', 'meta');
  capture('achievements', 'achievements');
  capture('settings', 'settings');

  assert.ok(captured.length >= 10, `应渲染到足够多的界面（${captured.length}）`);

  // 先确认每个界面确实渲染了"它自己"的内容（防止上面捕获到的是空白或错的界面）
  const expect = {
    menu: '无尽之夜',
    select: '点燃灯芯',
    levelup: '灯火更亮',
    paused: '暂停',
    loadout: '构筑总览',
    shop: '金币',
    shrine: '原样离开',
    victory: '挑战无尽之夜',
    dead: '返回主菜单',
    meta: '余烬解锁',
    achievements: '成就 ·',
    settings: '总音量',
  };
  for (const [label, needle] of Object.entries(expect)) {
    const found = captured.find(([l]) => l === label);
    assert.ok(found, `缺少 ${label} 界面`);
    assert.ok(found[1].includes(needle), `${label} 界面缺少关键内容「${needle}」`);
  }

  for (const [label, html] of captured) {
    assert.ok(html && html.length > 40, `${label} 界面内容为空`);
    for (const bad of ['undefined', 'NaN', '[object Object]', 'null']) {
      assert.ok(
        !html.includes(bad),
        `${label} 界面出现了 ${bad}：\n${html.slice(Math.max(0, html.indexOf(bad) - 120), html.indexOf(bad) + 60)}`,
      );
    }
    // 界面上不该出现模板插值的残留
    assert.ok(!html.includes('${'), `${label} 界面有未替换的模板变量`);
  }

  {
    const loadout = captured.find(([l]) => l === 'loadout')[1];
    assert.ok(loadout.includes('环形火环'), '构筑总览应列出武器');
    assert.ok(loadout.includes('灼心'), '构筑总览应列出被动');
    assert.ok(loadout.includes('磨石'), '构筑总览应列出遗物');
    assert.ok(loadout.includes('伤害倍率'), '构筑总览应列出关键属性');
  }

  // HUD 也应该干净
  game.update(1 / 60);
  hud.update(1 / 60);
  const hudHtml = hud.hudEl?.innerHTML ?? '';
  for (const bad of ['undefined', 'NaN', '[object Object]']) {
    assert.ok(!hudHtml.includes(bad), `HUD 出现了 ${bad}`);
  }

  // 带着夜咒进入下一关：HUD 的夜咒条与导演都要正常刷新
  game.state = 'playing';
  game.continueStage();
  game.update(1 / 60);
  hud.update(1 / 60);
  assert.ok(game.curse, '第二关应有夜咒');
  assert.ok(
    hud.curseEl.textContent.includes('夜咒'),
    `HUD 夜咒条应显示内容，实际为「${hud.curseEl.textContent}」`,
  );
  assert.ok(hud.curseEl.classList.contains('is-on'), 'HUD 夜咒条应处于显示状态');
  assert.ok(hud.curseEl.style.getPropertyValue('--c'), 'HUD 夜咒条应带上主题色');

  assert.deepEqual(errors, [], `不应有 console.error：${errors.join(' | ')}`);
});
