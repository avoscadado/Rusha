// Long-session soak: hundreds of thousands of update() calls with periodic render(), measuring JS heap after GC and
// canvas draw calls per frame (a proxy for particle/floater array growth, which live inside the closure).
// Run: node tests/redteam/browser-soak.cjs [updates=400000]
const { pw, open, AUTOPILOT } = require('./lib.cjs');
const N = +process.argv[2] || 400000;

(async () => {
  const browser = await pw.chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const A = await open(browser, { w: 1280, h: 800, query: '' });   // random seeds, so every game differs
  const page = A.page; await page.evaluate(AUTOPILOT);
  await page.evaluate(() => window.__ouro.newGame());
  const CHUNK = 50000; const rows = [];
  for (let done = 0; done < N; done += CHUNK) {
    const r = await page.evaluate((CHUNK) => {
      const O = window.__ouro, rt = window.__rt; let maxArcs = 0, games = 0, finals = 0, days = 0, deaths = 0, lastPhase = O.phase, pauses = 0;
      for (let i = 0; i < CHUNK; i++) {
        const p = O.phase;
        if (p === 'ready') { const d = window.RT_pick(O.game, window.Ouro.DIRS); O.onDir(d === null ? 0 : d); }
        else if (p === 'play') {
          if (Math.random() < 0.02) O.onDir(Math.floor(Math.random() * 4));            // noise: causes plenty of deaths and bursts
          else { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.onDir(d); }
        }
        else if (p === 'dead' || p === 'daydone' || p === 'final') { if (O.phaseT === undefined) { /* not exposed */ } O.onConfirm(); }
        if (p !== lastPhase) { if (p === 'dead') deaths++; if (p === 'daydone') days++; if (p === 'final') finals++; lastPhase = p; }
        O.update(16);
        if (i % 3 === 0) { rt.count = {}; rt.texts.length = 0; O.render(); rt.texts.length = 0; const a = rt.count.arc || 0; if (a > maxArcs) maxArcs = a; }
      }
      window.gc && window.gc();
      return { heap: performance.memory.usedJSHeapSize, maxArcs, finals, days, deaths, phase: O.phase };
    }, CHUNK);
    rows.push(r);
    console.log('updates', done + CHUNK, 'heap', (r.heap / 1048576).toFixed(1) + ' MB', 'max arcs/frame', r.maxArcs, 'days', r.days, 'deaths', r.deaths, 'finals', r.finals, 'phase', r.phase);
  }
  const growth = rows[rows.length - 1].heap - rows[0].heap;
  console.log('heap growth first->last chunk: ' + (growth / 1048576).toFixed(2) + ' MB');
  console.log(A.errors.length ? 'ERRORS ' + A.errors.slice(0, 3).join(' || ') : 'no page errors');
  await browser.close();
})();
