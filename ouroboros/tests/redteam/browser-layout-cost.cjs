// layout() rebuilds a board-sized offscreen canvas on every 'resize' event (no debounce). Measure its cost and the canvases allocated.
// Run: node tests/redteam/browser-layout-cost.cjs
const { launch, open } = require('./lib.cjs');
(async () => {
  const browser = await launch();
  for (const [w, h, dpr] of [[1280, 800, 1], [1920, 1080, 2], [2560, 1440, 2]]) {
    const A = await open(browser, { w, h, dpr, query: '?seed=7' });
    const r = await A.page.evaluate(() => {
      let made = 0; const orig = document.createElement.bind(document);
      document.createElement = (t) => { if (String(t).toLowerCase() === 'canvas') made++; return orig(t); };
      const t0 = performance.now(); const N = 60;
      for (let i = 0; i < N; i++) window.dispatchEvent(new Event('resize'));
      return { msPerResize: (performance.now() - t0) / N, canvasesCreated: made, N };
    });
    console.log(w + 'x' + h + '@' + dpr + ': layout() ' + r.msPerResize.toFixed(1) + ' ms per resize event; ' + r.canvasesCreated + ' new <canvas> elements for ' + r.N + ' events');
    await A.close();
  }
  await browser.close();
})();
