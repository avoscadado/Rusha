// An exception anywhere in update()/render() permanently stops the game: loop() calls requestAnimationFrame(loop) only AFTER
// update+render, with no try/finally. Reproduced here with a non-object value under localStorage 'ouroboros.best.v1'
// (saveBest does b.score = ... on a primitive, which throws in strict mode) -- the game freezes on the last frame of the final transition.
// Run: node tests/redteam/browser-loop-dies.cjs
const { launch, open } = require('./lib.cjs');
(async () => {
  const browser = await launch();
  for (const stored of ['null', '5']) {
    const init = `Storage.prototype.getItem=function(k){return k==='ouroboros.best.v1'?${JSON.stringify(stored)}:null}`;
    const A = await open(browser, { w: 900, h: 600, query: '?seed=7', init });
    await A.key('Space'); await A.frames(3, 16);
    // die until out of rewinds (4 deaths on a 3-rewind budget)
    let thrown = '';
    for (let k = 0; k < 6 && !thrown; k++) {
      await A.page.evaluate(() => { const O = window.__ouro; if (O.phase === 'ready') O.onConfirm(); let n = 0; while (O.phase === 'play' && n++ < 200) { O.game.input(O.game.run.dir === 0 ? 1 : 0); O.tickOnce(); } });
      try { await A.frames(60, 50); await A.key('Space'); await A.frames(60, 50); } catch (e) { thrown = String(e.message).split('\n')[0]; }
    }
    const pending = await A.page.evaluate(() => window.__rafPending());
    console.log('stored value ' + stored.padEnd(5) + ' -> ' + (thrown ? 'exception: ' + thrown : 'no exception') + '; rAF callbacks still scheduled: ' + pending + (pending === 0 ? '  => LOOP DEAD, game frozen' : ''));
    await A.close();
  }
  await browser.close();
})();
