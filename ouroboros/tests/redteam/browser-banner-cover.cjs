// The 'ready' banner is drawn over the top of the board. Does it ever cover your own start position or an echo at tick 0?
// Run: node tests/redteam/browser-banner-cover.cjs
const { launch, open, AUTOPILOT } = require('./lib.cjs');
const WS = [640, 800, 1024, 1280, 1680, 2560], HS = [400, 500, 650, 800, 1000, 1440];
(async () => {
  const browser = await launch();
  const B = await open(browser, { w: 1280, h: 800, query: '?seed=7' }); await B.page.evaluate(AUTOPILOT);
  await B.key('Space');
  await B.page.evaluate(() => { const O = window.__ouro; O.onDir(O.game.run.dir === 1 ? 0 : 1); let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); } });
  await B.frames(60, 20); await B.key('Space'); await B.frames(30, 20);     // day 2 ready, banner fully faded in
  const hits = [];
  for (const W of WS) for (const H of HS) {
    await B.page.setViewportSize({ width: W, height: H });
    await B.page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [W, H]);
    await B.page.evaluate(() => window.dispatchEvent(new Event('resize'))); await B.frames(2, 16);
    const r = await B.page.evaluate(() => {
      window.__rt.texts.length = 0; window.__rt.board = null; window.__ouro.render();
      const b = window.__rt.board, g = window.__ouro.game; if (!b) return null;
      const cs = (b[2] - 2) / g.cfg.cols, ox = b[0] + 1, oy = b[1] + 1;
      const t = window.__rt.texts.filter(x => x.alpha > 0.3 && x.cy > oy && x.cy < oy + cs * 12);   // banner text lines
      const bottom = Math.max(...t.map(x => x.cy + x.size * 1.2));
      const rows = []; const run = g.run; for (let i = run.si(0); i <= run.hi(0); i++) rows.push(['you', run.py[i]]);
      g.echoes.forEach((e, k) => { for (let i = e.si(0); i <= e.hi(0); i++) rows.push(['echo ' + (k + 1), e.py[i]]); });
      const covered = [...new Set(rows.filter(r => oy + r[1] * cs < bottom).map(r => r[0]))];
      return { bottomRow: ((bottom - oy) / cs).toFixed(1), covered, lines: t.length };
    });
    if (r && r.covered.length) hits.push(W + 'x' + H + ': banner reaches row ' + r.bottomRow + ' and hides ' + r.covered.join(', '));
  }
  console.log(hits.length ? hits.join('\n') : 'banner never covered a snake at tick 0 in ' + WS.length * HS.length + ' sizes');
  await browser.close();
})();
