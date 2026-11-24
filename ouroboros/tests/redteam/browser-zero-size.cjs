// Zero-size / hidden window, and what F (fullscreen) does while playing.
// Run: node tests/redteam/browser-zero-size.cjs
const { launch, open } = require('./lib.cjs');
(async () => {
  const browser = await launch();
  // window reports 0x0 (e.g. a hidden or collapsed window)
  const A = await open(browser, { w: 800, h: 600, query: '?seed=7', init: `Object.defineProperty(window,'innerWidth',{get:()=>0});Object.defineProperty(window,'innerHeight',{get:()=>0})` });
  await A.frames(5, 16); await A.key('Space'); await A.frames(5, 16); await A.key('ArrowDown'); await A.frames(30, 50);
  const bad = await A.page.evaluate(() => window.__rt.bad.slice(0, 3));
  console.log('innerWidth/innerHeight = 0: errors=' + JSON.stringify(A.errors) + ' non-finite=' + JSON.stringify(bad) + ' phase=' + await A.phase());
  await A.close();
  // F while playing: does the run keep going (macOS fullscreen animation would stutter the game)?
  const B = await open(browser, { w: 1000, h: 650, query: '?seed=7' });
  await B.key('Space'); await B.key('ArrowDown'); await B.frames(5, 50);
  const t0 = await B.page.evaluate(() => window.__ouro.game.run.t);
  await B.key('KeyF'); await B.frames(10, 50);
  console.log('F during play: phase=' + await B.phase() + ' ticks ' + t0 + ' -> ' + await B.page.evaluate(() => window.__ouro.game.run.t) + ' (no auto-pause, no guard)');
  await B.close(); await browser.close();
})();
