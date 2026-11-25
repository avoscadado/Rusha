// Regression tests for bugs found by red-teaming, driven through real keyboard events in headless Chromium.
//   node ouroboros/tests/browser-regress.mjs
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { htmlPath } from './load-core.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch();
let failures = 0, passed = 0;
async function test(name, fn, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(pathToFileURL(htmlPath).href + '?seed=7');
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    // capture every string the page draws
    window.__texts = [];
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { window.__texts.push(String(s)); return ft.apply(this, arguments); };
    const O = window.Ouro, D = O.DIRS;
    window.__pick = function () {
      const g = window.__ouro.game, C = g.cfg.cols, R = g.cfg.rows, run = g.run, t = run.t, hi = run.hi(t), si = run.si(t);
      const hx = run.px[hi], hy = run.py[hi], cur = g.queue.length ? g.queue[g.queue.length - 1] : run.dir;
      const occ = g.echoOcc(t + 1, new Uint8Array(C * R)), body = new Set();
      for (let i = si + 1; i <= hi; i++) body.add(run.px[i] + run.py[i] * C);
      const targets = g.fruits.filter(f => g.owner[f.id] < 0 && !g.eaten[f.id] && f.t1 > t + 2 && f.t0 <= t + 8);
      let bd = null, bs = -1e9;
      for (const d of [cur, (cur + 1) & 3, (cur + 3) & 3]) {
        const nx = hx + D[d].x, ny = hy + D[d].y;
        if (nx < 0 || ny < 0 || nx >= C || ny >= R || body.has(nx + ny * C) || occ[nx + ny * C]) continue;
        let room = 0; for (let k = 1; k <= 6; k++) { const x = nx + D[d].x * k, y = ny + D[d].y * k; if (x < 0 || y < 0 || x >= C || y >= R || body.has(x + y * C)) break; room++; }
        let s = room * 0.5 + (d === cur ? 0.2 : 0); if (targets.length) s -= Math.min(...targets.map(f => Math.abs(f.x - nx) + Math.abs(f.y - ny)));
        if (s > bs) { bs = s; bd = d; }
      }
      return bd;
    };
    window.__finishDay = function () {
      const o = window.__ouro; let n = 0;
      while (o.phase === 'play' && n++ < 2000) { const d = window.__pick(); if (d !== null) o.game.input(d); o.update(o.game.cfg.tickMs); }
    };
  });
  try { await fn(page); passed++; console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
  if (!opts.allowErrors && errors.length) { failures++; console.log('  FAIL ' + name + ' (page errors)\n       ' + errors.join('\n       ')); }
  await page.close();
}
const phase = (p) => p.evaluate(() => window.__ouro.phase);
const texts = async (p) => { await p.evaluate(() => { window.__texts.length = 0; window.__ouro.render(); }); return p.evaluate(() => window.__texts.slice()); };
const startDay1 = async (p) => { await p.keyboard.press('Space'); await p.waitForTimeout(320); await p.keyboard.press('ArrowRight'); assert.equal(await phase(p), 'play'); };
// play day 1 to its end without dying (retry via the real flow if the autopilot is unlucky)
async function toDayDone(p) {
  for (let k = 0; k < 8; k++) {
    await p.evaluate(() => window.__finishDay());
    let ph = await phase(p);
    if (ph === 'dead') { await p.evaluate(() => window.__ouro.update(1400)); await p.evaluate(() => window.__ouro.update(800)); await p.waitForTimeout(300); await p.keyboard.press('ArrowUp'); }
    else break;
  }
  await p.evaluate(() => window.__ouro.update(1000));
  assert.equal(await phase(p), 'daydone');
}

await test('HUD score is not double counted on the day-complete card', async (p) => {
  await startDay1(p); await toDayDone(p);
  const g = await p.evaluate(() => ({ score: window.__ouro.game.score, dayScore: window.__ouro.game.dayScore }));
  assert.equal(g.dayScore, 0);
  const t = await texts(p), fmt = String(g.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  assert.ok(t.includes(fmt), 'HUD shows ' + fmt + ' but drew ' + JSON.stringify(t.filter(s => /^\d[\d,]*$/.test(s))));
});

await test('a double tap on the day-complete card does not skip the briefing', async (p) => {
  await startDay1(p); await toDayDone(p);
  await p.keyboard.press('Space');
  assert.equal(await phase(p), 'ready');
  await p.keyboard.press('Space');                  // about 20 ms later
  assert.equal(await phase(p), 'ready', 'second tap must be ignored');
  await p.keyboard.press('ArrowLeft');
  assert.equal(await phase(p), 'ready', 'a quick arrow must be ignored too');
  await p.waitForTimeout(320);
  await p.keyboard.press('ArrowUp');
  assert.equal(await phase(p), 'play');
});

await test('a held arrow key (auto-repeat) never starts a day', async (p) => {
  await p.keyboard.press('Space'); await p.waitForTimeout(350);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', repeat: true })));
  assert.equal(await phase(p), 'ready');
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', repeat: false })));
  assert.equal(await phase(p), 'play');
});

await test('R and Q on the pause card need a second press; F pauses a live run', async (p) => {
  await startDay1(p);
  const seed0 = await p.evaluate(() => window.__ouro.game);
  await p.keyboard.press('KeyP'); assert.equal(await phase(p), 'paused');
  await p.keyboard.press('KeyR'); assert.equal(await phase(p), 'paused');
  assert.ok((await texts(p)).some(s => /Press R again/.test(s)), 'card asks for confirmation');
  await p.keyboard.press('KeyQ');
  assert.equal(await phase(p), 'paused', 'switching to Q cancels R rather than acting');
  assert.ok((await texts(p)).some(s => /Press Q again/.test(s)));
  await p.keyboard.press('KeyP'); assert.equal(await phase(p), 'play');
  await p.keyboard.press('KeyP'); await p.keyboard.press('KeyR'); await p.keyboard.press('KeyR');
  assert.equal(await phase(p), 'ready', 'second R restarts the run');
  await p.waitForTimeout(320); await p.keyboard.press('ArrowRight'); assert.equal(await phase(p), 'play');
  await p.keyboard.press('KeyF'); assert.equal(await phase(p), 'paused', 'F must pause');
  await p.keyboard.press('KeyP'); await p.keyboard.press('KeyP'); await p.keyboard.press('KeyQ'); await p.keyboard.press('KeyQ');
  assert.equal(await phase(p), 'title');
});

await test('the death banner counts the rewind it is about to spend', async (p) => {
  await startDay1(p);
  for (let i = 0; i < 400 && await phase(p) === 'play'; i++) { await p.evaluate(() => { const o = window.__ouro; o.game.input(0); o.update(o.game.cfg.tickMs); }); }
  assert.equal(await phase(p), 'dead');
  await p.evaluate(() => window.__ouro.update(600));
  const start = await p.evaluate(() => window.__ouro.game.cfg.rewinds), left = start - 1;
  const t = await texts(p);
  const want = new RegExp('\\b' + left + ' rewinds? left after this');
  assert.ok(t.some(s => want.test(s)), 'banner should say ' + left + ' left: ' + JSON.stringify(t.filter(s => /rewind/.test(s))));
  await p.evaluate(() => window.__ouro.update(1300)); await p.evaluate(() => window.__ouro.update(800));
  assert.equal(await p.evaluate(() => window.__ouro.game.rewinds), left);
});

await test('the loop survives garbage in localStorage and an exception while saving', async (p) => {
  await startDay1(p);
  // run out of rewinds so the game ends and saveBest runs
  for (let k = 0; k < 40 && await phase(p) !== 'final'; k++) {
    const ph = await phase(p);
    if (ph === 'play') await p.evaluate(() => { const o = window.__ouro; for (let i = 0; i < 400 && o.phase === 'play'; i++) { o.game.input(0); o.update(o.game.cfg.tickMs); } });
    else if (ph === 'dead') await p.evaluate(() => window.__ouro.update(1400));
    else if (ph === 'rewind') await p.evaluate(() => window.__ouro.update(800));
    else if (ph === 'ready') { await p.waitForTimeout(300); await p.keyboard.press('ArrowUp'); }
  }
  assert.equal(await phase(p), 'final');
  const f0 = await p.evaluate(() => window.__ouro.frame); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => window.__ouro.frame) > f0 + 3, 'frames keep coming after the game ends');
}, { init: () => { try { localStorage.setItem('ouroboros.best.v1', '5'); } catch (e) { /* ignore */ } } });

await test('the lost day does not show in the final result', async (p) => {
  await startDay1(p);
  for (let k = 0; k < 40 && await phase(p) !== 'final'; k++) {
    const ph = await phase(p);
    if (ph === 'play') await p.evaluate(() => window.__finishDay());
    else if (ph === 'dead') await p.evaluate(() => window.__ouro.update(1400));
    else if (ph === 'rewind') await p.evaluate(() => window.__ouro.update(800));
    else if (ph === 'ready') { await p.waitForTimeout(300); await p.keyboard.press('ArrowUp'); }
    else if (ph === 'daydone') { await p.evaluate(() => window.__ouro.update(1000)); await p.keyboard.press('Space'); }
    else break;
  }
  const r = await p.evaluate(() => ({ phase: window.__ouro.phase, f: window.__ouro.game.final, score: window.__ouro.game.score, ds: window.__ouro.game.dayScore, h: window.__ouro.game.harvested() }));
  if (r.phase === 'final') { assert.equal(r.ds, 0); assert.equal(r.f.score, r.score); assert.equal(r.f.harvested, r.h); }
});

await browser.close();
console.log(passed + ' passed' + (failures ? ', ' + failures + ' FAILED' : ''));
process.exit(failures ? 1 : 0);
