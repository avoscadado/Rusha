// Deterministic state-machine probes: key mashing across transitions, repeat events, pause in odd phases, blur, R/Q reachability.
// Run: node tests/redteam/browser-races.cjs
const { launch, open, AUTOPILOT } = require('./lib.cjs');

(async () => {
  const browser = await launch();
  const mk = async (q) => { const A = await open(browser, { w: 1100, h: 700, query: q || '?seed=7' }); await A.page.evaluate(AUTOPILOT); return A; };
  const die = (A) => A.page.evaluate(() => { const O = window.__ouro; if (O.phase === 'ready') O.onDir(O.game.run.dir === 0 ? 1 : 0); let n = 0; while (O.phase === 'play' && n++ < 300) { O.game.input(O.game.run.dir === 0 ? 1 : 0); O.tickOnce(); } });
  const cleanDay = (A) => A.page.evaluate(() => { const O = window.__ouro; O.onDir(O.game.run.dir === 1 ? 0 : 1); let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); } });
  const say = (s) => console.log(s);

  // 1. double-tap Space on the day-complete card starts the next day with no time to read the 'ready' banner
  { const A = await mk(); await A.key('Space'); await A.frames(2, 16); await cleanDay(A); await A.frames(60, 20);
    const p0 = await A.phase(); await A.key('Space'); await A.frames(2, 16); const p1 = await A.phase(); await A.key('Space'); await A.frames(1, 16);
    say('[1] Space,Space on day-complete: ' + p0 + ' -> ' + p1 + ' -> ' + await A.phase() + '   (second tap starts day 2 with echoes running)'); await A.close(); }

  // 2. a held (auto-repeating) arrow key starts the next attempt by itself after a death
  { const A = await mk(); await A.key('Space'); await A.frames(2, 16); await die(A); await A.frames(5, 100);
    await A.key('Space'); await A.frames(60, 20);       // -> rewind -> ready
    const before = await A.phase(); await A.key('ArrowLeft', { repeat: true }); await A.frames(1, 16);
    say('[2] ready then ArrowLeft{repeat:true}: ' + before + ' -> ' + await A.phase() + '   (repeat events should not start a run)'); await A.close(); }

  // 3. P / Esc in phases other than play/paused, and what they do to the default action
  { const A = await mk(); const res = {};
    await A.key('Space'); await A.frames(2, 16); res.ready = await A.key('KeyP') ; res.readyPhase = await A.phase();
    await A.key('ArrowUp'); await die(A); await A.frames(20, 16); await A.key('KeyP'); res.deadPhase = await A.phase();
    await A.frames(60, 20); await A.key('KeyP'); res.afterDeadPhase = await A.phase();
    say('[3] P in ready -> ' + res.readyPhase + '; P in dead -> ' + res.deadPhase + '; P after rewind/ready -> ' + res.afterDeadPhase + '  (pause is ignored outside play)'); await A.close(); }

  // 4. blur / hidden while paused or in transitions
  { const A = await mk(); await A.key('Space'); await A.frames(2, 16); await A.key('ArrowDown'); await A.frames(10, 16); await A.key('KeyP');
    await A.page.evaluate(() => window.dispatchEvent(new Event('blur'))); const pp = await A.phase();
    await A.key('Space'); const resumed = await A.phase();
    await die(A); await A.page.evaluate(() => window.dispatchEvent(new Event('blur'))); const pd = await A.phase();
    say('[4] blur while paused -> ' + pp + '; Space resumes -> ' + resumed + '; blur during dead -> ' + pd); await A.close(); }

  // 5. R and Q reachability
  { const A = await mk(); const out = [];
    await A.key('Space'); await A.frames(2, 16); await A.key('KeyR'); out.push('R in ready -> ' + await A.phase() + ' (game kept: ' + await A.page.evaluate(() => !!window.__ouro.game) + ')');
    await A.key('KeyQ'); out.push('Q in ready -> ' + await A.phase());
    await A.key('ArrowDown'); await A.frames(5, 16); await A.key('KeyR'); out.push('R in play -> ' + await A.phase());
    await A.key('KeyP'); const seedBefore = await A.page.evaluate(() => window.__ouro.game.seed); await A.key('KeyR');
    out.push('R in paused -> ' + await A.phase() + ' (new run, seed ' + seedBefore + ' -> ' + await A.page.evaluate(() => window.__ouro.game.seed) + ')');
    await A.key('ArrowDown'); await A.frames(5, 16); await cleanDay(A); await A.frames(60, 20);
    out.push('R in daydone -> ' + (await A.key('KeyR'), await A.phase())); out.push('Q in daydone -> ' + (await A.key('KeyQ'), await A.phase()));
    await A.key('Space'); await A.frames(2, 16); await A.key('ArrowDown'); await A.frames(3, 16); await A.key('KeyP'); await A.key('KeyQ');
    out.push('Q in paused -> ' + await A.phase() + ' game=' + await A.page.evaluate(() => window.__ouro.game));
    await A.key('NumpadEnter'); out.push('NumpadEnter on title -> ' + await A.phase()); await A.key('Enter'); out.push('Enter on title -> ' + await A.phase());
    say('[5] ' + out.join('\n    ')); await A.close(); }

  // 6. final screen: R works immediately (during the fade), Space only after 800 ms
  { const A = await mk(); await A.key('Space'); await A.frames(2, 16);
    for (let k = 0; k < 30 && (await A.phase()) !== 'final'; k++) { await die(A); await A.frames(100, 25); }
    const ph = await A.phase(); await A.frames(5, 16); await A.key('Space'); const s1 = await A.phase(); await A.key('KeyR'); const r1 = await A.phase();
    say('[6] final(' + ph + ') +80ms: Space -> ' + s1 + ' (ignored by design), R -> ' + r1); await A.close(); }

  // 7. Space/Enter while playing do nothing; arrows while paused/dead/daydone do nothing
  { const A = await mk(); await A.key('Space'); await A.frames(2, 16); await A.key('ArrowDown'); await A.frames(5, 16);
    const t0 = await A.page.evaluate(() => window.__ouro.game.run.t); await A.key('Space'); await A.key('Enter'); await A.frames(10, 112);
    const t1 = await A.page.evaluate(() => window.__ouro.game.run.t);
    say('[7] Space+Enter in play advanced normally: ticks ' + t0 + ' -> ' + t1 + ' phase ' + await A.phase()); await A.close(); }

  await browser.close();
})();
