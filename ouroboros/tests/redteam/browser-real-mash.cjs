// Real requestAnimationFrame + real keyboard events (page.keyboard), mashing for N seconds. Reports page errors and phases visited.
// Run: node tests/redteam/browser-real-mash.cjs [seconds=30]
const { launch, open } = require('./lib.cjs');
const SECS = +process.argv[2] || 30;
(async () => {
  const browser = await launch();
  const A = await open(browser, { w: 1100, h: 700, query: '', manual: false });
  const page = A.page; await page.bringToFront();
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Enter', 'KeyP', 'Escape', 'KeyR', 'KeyQ', 'KeyM'];
  const seen = {}; const t0 = Date.now(); let n = 0;
  let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  while (Date.now() - t0 < SECS * 1000) {
    const k = keys[Math.floor(rnd() * keys.length)];
    if (rnd() < 0.15) await page.keyboard.down(k); else await page.keyboard.press(k);   // some keys are held (auto-repeat is not synthesised, but down/up ordering varies)
    if (rnd() < 0.15) await page.keyboard.up(k).catch(() => {});
    const ph = await page.evaluate(() => window.__ouro.phase); seen[ph] = (seen[ph] || 0) + 1; n++;
    await page.waitForTimeout(10 + Math.floor(rnd() * 90));
  }
  console.log(n + ' key events in ' + SECS + 's; phases observed: ' + JSON.stringify(seen));
  console.log(A.errors.length ? 'ERRORS: ' + [...new Set(A.errors)].slice(0, 5).join(' || ') : 'no page errors / console errors');
  await browser.close();
})();
