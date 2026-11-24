// Confirms (1) the death banner shows the rewind count BEFORE the rewind is spent, contradicting the next screen,
// and (2) the HUD score double-counts the finished day on the day-complete card and after the run ends.
const { launch, open, AUTOPILOT } = require('./lib.cjs');

const texts = (A) => A.page.evaluate(() => { window.__rt.texts.length = 0; window.__ouro.render(); return window.__rt.texts.filter(t => t.alpha > 0.1).map(t => t.s); });

(async () => {
  const browser = await launch();
  const A = await open(browser, { w: 1280, h: 800, query: '?seed=7' });
  const page = A.page; await page.evaluate(AUTOPILOT);
  await page.evaluate(() => window.__ouro.newGame());
  await A.key('ArrowUp');                                   // fly into the top wall
  await page.evaluate(() => { let n = 0; while (window.__ouro.phase === 'play' && n++ < 200) window.__ouro.tickOnce(); });
  await A.frames(40, 16);                                   // let the dead banner fade in
  let t = await texts(A);
  console.log('[1] DEAD  phase=' + await A.phase() + '  game.rewinds=' + await page.evaluate(() => window.__ouro.game.rewinds));
  console.log('    banner:', t.filter(s => /rewind/i.test(s)).join(' | '));
  await A.key('Space');                                      // phaseT > 450 required: frames above gave 640ms
  await A.frames(60, 16);                                    // through 'rewind' into 'ready'
  t = await texts(A);
  console.log('[1] READY phase=' + await A.phase() + '  game.rewinds=' + await page.evaluate(() => window.__ouro.game.rewinds));
  console.log('    banner:', t.filter(s => /rewind/i.test(s)).join(' | '));

  // (2) clean autopilot day -> day-complete card
  await page.evaluate(() => {
    const O = window.__ouro; O.onDir(O.game.run.dir === 1 ? 0 : 1);
    let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); }
  });
  await A.frames(60, 30);
  t = await texts(A);
  const g = await page.evaluate(() => ({ score: window.__ouro.game.score, dayScore: window.__ouro.game.dayScore, dayClear: window.__ouro.game.dayClear }));
  console.log('[2] DAYDONE phase=' + await A.phase() + '  game.score=' + g.score + '  game.dayScore=' + g.dayScore + '  dayClear=' + g.dayClear);
  console.log('    HUD score text (top right):', t.find(s => /^[\d,]+$/.test(s)), ' <- should equal game.score', g.score);

  // (3) same HUD number when the run ends by finishing the last day (cfg.days forced to 1 so one clean day ends the run)
  await page.evaluate(() => window.__ouro.newGame());
  await page.evaluate(() => { window.__ouro.game.cfg.days = 1; });
  await page.evaluate(() => {
    const O = window.__ouro; O.onDir(O.game.run.dir === 1 ? 0 : 1);
    let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); }
  });
  await A.frames(80, 30);
  t = await texts(A);
  const f = await page.evaluate(() => ({ phase: window.__ouro.phase, finalScore: window.__ouro.game.final && window.__ouro.game.final.score, dayScore: window.__ouro.game.dayScore }));
  console.log('[3] FINAL (day limit reached) phase=' + f.phase + '  final.score=' + f.finalScore + '  game.dayScore=' + f.dayScore);
  console.log('    texts containing digits with commas (HUD vs card):', t.filter(s => /^[\d,]+$/.test(s) || /^Score/.test(s)).join(' | '));
  await browser.close();
})();
