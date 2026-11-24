// Drives the real page in headless Chromium and saves screenshots of each phase.
//   node ouroboros/tests/shots.mjs [outdir] [--w 1440 --h 900 --dpr 1]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { htmlPath } from './load-core.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'ouroboros-shots';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 1440), H = +opt('h', 900), DPR = +opt('dpr', 1);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const problems = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push('console ' + m.type() + ': ' + m.text()); });
page.on('pageerror', e => problems.push('PAGEERROR ' + e));
await page.goto(pathToFileURL(htmlPath).href + '?seed=7');
await page.waitForTimeout(400);
const shot = async (name) => { await page.evaluate(() => window.__ouro.render()); await page.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };

// the autopilot lives in the page
await page.evaluate(() => {
  const O = window.Ouro, DIRS = O.DIRS;
  window.__pick = function () {
    const g = window.__ouro.game, C = g.cfg.cols, R = g.cfg.rows, run = g.run, t = run.t, hi = run.hi(t), si = run.si(t);
    const hx = run.px[hi], hy = run.py[hi], cur = g.queue.length ? g.queue[g.queue.length - 1] : run.dir;
    const occ = g.echoOcc(t + 1, new Uint8Array(C * R));
    const body = new Set(); for (let i = si + 1; i <= hi; i++) body.add(run.px[i] + run.py[i] * C);
    const targets = g.fruits.filter(f => g.owner[f.id] < 0 && !g.eaten[f.id] && f.t1 > t + 2 && f.t0 <= t + 8);
    let bestD = null, bestS = -1e9;
    for (const d of [cur, (cur + 1) & 3, (cur + 3) & 3]) {
      const nx = hx + DIRS[d].x, ny = hy + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R || body.has(nx + ny * C) || occ[nx + ny * C]) continue;
      let room = 0; for (let k = 1; k <= 6; k++) { const x = nx + DIRS[d].x * k, y = ny + DIRS[d].y * k; if (x < 0 || y < 0 || x >= C || y >= R || body.has(x + y * C)) break; room++; }
      let s = room * 0.5; if (targets.length) s -= Math.min(...targets.map(f => Math.abs(f.x - nx) + Math.abs(f.y - ny)));
      if (d === cur) s += 0.2; if (s > bestS) { bestS = s; bestD = d; }
    }
    return bestD;
  };
  // advance the real UI loop by n ticks of real-time-equivalent updates, steering with the autopilot
  window.__run = function (n, stopAtTick) {
    const o = window.__ouro;
    for (let i = 0; i < n && o.phase === 'play'; i++) {
      const d = window.__pick(); if (d !== null) o.game.input(d);
      o.update(o.game.cfg.tickMs);
      if (stopAtTick && o.game.run.t >= stopAtTick) break;
    }
  };
});

await shot('1-title');
await page.keyboard.press('Space'); await page.waitForTimeout(300);
await shot('2-day1-ready');
await page.keyboard.press('ArrowRight');
await page.evaluate(() => window.__run(240, 240));
await shot('3-day1-play-tick240');
await page.evaluate(() => window.__run(100000));
let phase = await page.evaluate(() => window.__ouro.phase);
console.log('after day 1 attempt, phase =', phase);
// keep trying until the day completes (the real flow handles deaths by rewinding)
let guard = 0;
while (guard++ < 12) {
  phase = await page.evaluate(() => window.__ouro.phase);
  if (phase === 'dead') { await shot('x-dead'); await page.evaluate(() => window.__ouro.update(1400)); }
  else if (phase === 'rewind') { await page.evaluate(() => window.__ouro.update(800)); }
  else if (phase === 'ready') { await page.keyboard.press('ArrowUp'); await page.evaluate(() => window.__run(100000)); }
  else break;
}
phase = await page.evaluate(() => window.__ouro.phase);
console.log('phase now', phase);
await page.evaluate(() => window.__ouro.update(1000));
await shot('4-day1-done');
await page.keyboard.press('Space'); await page.waitForTimeout(300);
await page.evaluate(() => window.__ouro.update(600));
await shot('5-day2-ready');
await page.keyboard.press('ArrowRight');
await page.evaluate(() => window.__run(200, 200));
await shot('6-day2-play-tick200');
await page.evaluate(() => window.__run(5, 0));
await page.keyboard.press('KeyP'); await page.waitForTimeout(100);
await shot('7-paused');
await page.keyboard.press('KeyP');
await page.evaluate(() => window.__run(100000));
for (let day = 2; day < 6 && guard++ < 60; ) {
  phase = await page.evaluate(() => window.__ouro.phase);
  if (phase === 'dead') await page.evaluate(() => window.__ouro.update(1400));
  else if (phase === 'rewind') await page.evaluate(() => window.__ouro.update(800));
  else if (phase === 'ready') { await page.keyboard.press('ArrowUp'); await page.evaluate(() => window.__run(100000)); }
  else if (phase === 'daydone') { await page.evaluate(() => window.__ouro.update(1000)); await page.keyboard.press('Space'); await page.evaluate(() => window.__ouro.update(700)); day++; }
  else if (phase === 'final') break;
  else if (phase === 'play') await page.evaluate(() => window.__run(100000));
  else break;
}
phase = await page.evaluate(() => window.__ouro.phase);
console.log('end phase', phase);
await page.evaluate(() => window.__ouro.update(1200));
await shot('8-' + phase);
console.log('problems:', problems.length ? problems : 'none');
await browser.close();
