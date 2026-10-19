/**
 * 「墙 · 灯火会停在墙面上」（v94）的首次提示。
 *
 * 规矩本身已经有几何与渲染用例；这一条只管"玩家第一次走到墙边时有没有被讲清楚"，
 * 以及"走远了不会补弹、看过之后不会再弹"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './dom-stubs.mjs';

const ENTRY = new URL('../dist/app.js', import.meta.url);

test('第一次贴近墙：讲一次灯火与伤害都停在墙面上', async (t) => {
  const env = installDomStubs();
  await import(`${ENTRY.href}?v=walltip-${Date.now()}-${Math.random()}`);
  env.frame();
  env.intervals.length = 0;
  const handle = globalThis.window.__WICKLIGHT__;
  const { game, loop, hud } = handle;
  t.after(() => {
    loop?.stop?.();
    game.audio.dispose();
  });

  game.bootDone();
  game.newRun('warden', 'normal', false);
  game.player.stats.maxHp = 1e6;
  game.player.hp = 1e6;
  game.save.tips = [];
  game.level.walls.length = 0;
  game.level.walls.push({ x: game.player.x + 180, y: game.player.y - 80, w: 60, h: 160 });
  const cards = () => hud.toastRoot.children.filter((c) => String(c.className).includes('toast--tip'));
  const base = cards().length;

  // 先站远：墙在 180px 外，不该弹。
  game.runTime = 10;
  game.codexTimer = -1;
  game.update(1 / 60);
  assert.equal(cards().length, base, '墙还远着的时候不该弹墙的提示');
  assert.ok(!game.save.tips.includes('wall:shadow'), '没靠近就不该写进存档');

  // 走到墙边：下一次 0.75 秒扫描应弹一次。
  game.player.x = game.level.walls[0].x - 50;
  game.player.y = game.level.walls[0].y + 80;
  game.codexTimer = -1;
  game.update(1 / 60);
  assert.equal(cards().length, base + 1, '第一次贴近墙应弹一张提示卡');
  const card = cards()[base];
  const text = String(card.innerHTML);
  assert.ok(text.includes('灯火会停在墙面上'), `标题要讲清墙挡光（${text}）`);
  assert.ok(
    text.includes('自动索敌') && text.includes('烈焰鞭') && text.includes('燎灯') && text.includes('火环'),
    `正文要讲清哪些东西被挡住（${text}）`,
  );
  assert.ok(text.includes('全都看不见') && text.includes('打在墙上'), `不能把索敌写成绝对看不见墙后（${text}）`);
  assert.ok(text.includes('引灯') && text.includes('疾风') && text.includes('光环也过不去'), `速度光环也认墙（${text}）`);
  assert.ok(text.includes('灯台') && text.includes('庇护'), `余烬风的灯台庇护也只算墙这一侧的光（${text}）`);
  assert.ok(text.includes('灯台') && text.includes('祭坛') && text.includes('墙的这一侧'), `灯台与祭坛的交互也要认墙（${text}）`);
  assert.ok(text.includes('吹灯客') && text.includes('灯焰'), `吹灯客的抽焰也要认墙（${text}）`);
  assert.ok(text.includes('掉落物') && text.includes('墙外'), `拾取物与墙体碰撞也要讲（${text}）`);
  assert.ok(text.includes('掠影') && text.includes('墙这一侧'), `掠影也只认墙这一侧的危险（${text}）`);
  assert.ok(text.includes('燃爆') && text.includes('旋灯') && text.includes('雷弧'), `例外也要讲，别让玩家以为所有东西都挡（${text}）`);
  assert.ok(text.includes('墙前') && text.includes('吸力') && text.includes('卷弹'), `旋灯的落点与吸力也要讲清（${text}）`);
  assert.ok(game.save.tips.includes('wall:shadow'), '提示应写进存档');
  assert.ok(game.codex.has('mechanic', 'wall'), '第一次贴近墙也该把这一页记进图鉴');
  const entry = game.codex.entry('mechanic:wall');
  assert.ok(entry && entry.rows.some(([k, v]) => k === '谁不看墙' && v.includes('雷弧')), '图鉴里要能查到墙的例外');
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '谁不看墙' && v.includes('旋灯的收尾') && v.includes('旋灯的落点')),
    '图鉴里要把旋灯的收尾例外和落点 / 吸力分开讲',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '光里的判定' && v.includes('无光者')),
    '图鉴里要讲清墙影里的无光者不算被照亮',
  );
  assert.ok(
    entry &&
      entry.rows.some(
        ([k, v]) => k === '怪也认墙' && v.includes('引灯') && v.includes('疾风') && v.includes('灯晕'),
      ),
    '图鉴里要讲清引灯、疾风与灯晕也认墙',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '怪也认墙' && v.includes('刺脊')),
    '图鉴里要讲清刺脊的预警线也认墙',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '怪也认墙' && v.includes('吹灯客') && v.includes('弃灯')),
    '图鉴里要讲清吹灯客抽焰与怪啃弃灯也认墙',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '挡什么' && v.includes('灯台')),
    '图鉴里要讲清余烬风的灯台庇护也认墙',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '挡什么' && v.includes('灯台点燃') && v.includes('祭坛开启')),
    '图鉴里要讲清灯台点燃与祭坛开启也要走到墙这一侧',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '挡什么' && v.includes('掉落物') && v.includes('墙外')),
    '图鉴里要讲清掉落物不隔墙吸附、掉进墙里会被推出来',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '挡什么' && v.includes('掠影')),
    '图鉴里要讲清墙后的敌人与弹幕不记掠影',
  );
  assert.ok(
    entry && entry.rows.some(([k, v]) => k === '挡什么' && v.includes('旋灯的落点') && v.includes('吸力')),
    '图鉴里要讲清旋灯落点与吸力也认墙',
  );

  // 再靠近另一面墙：同一局不该再弹。
  game.level.walls[0] = { x: game.player.x + 30, y: game.player.y - 50, w: 60, h: 100 };
  game.codexTimer = -1;
  game.update(1 / 60);
  assert.equal(cards().length, base + 1, '同一条墙提示只弹一次');
});
