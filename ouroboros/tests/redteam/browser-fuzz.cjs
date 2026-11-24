// State-machine fuzz: random keys / blur / visibility / resize / pointer / time, checking invariants after every action.
// Run: node tests/redteam/browser-fuzz.cjs [steps=4000] [seed=1]
const { launch, open, AUTOPILOT } = require('./lib.cjs');

const STEPS = +process.argv[2] || 4000;
let rs = (+process.argv[3] || 1) >>> 0;
const rnd = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pickOf = a => a[Math.floor(rnd() * a.length)];

const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Enter', 'KeyP', 'Escape', 'KeyR', 'KeyQ', 'KeyM', 'KeyF', 'NumpadEnter', 'KeyX'];
const MAP = { title: s => s === null, ready: s => s === 'ready', play: s => s === 'play', paused: s => s === 'play', dead: s => s === 'dead', rewind: s => s === 'ready', daydone: s => s === 'dayDone', final: s => s === 'final' };

(async () => {
  const browser = await launch();
  const A = await open(browser, { w: 1000, h: 640, query: '?seed=3' });
  const page = A.page; await page.evaluate(AUTOPILOT);
  const seenPhases = new Map(); const bad = []; let stuckCount = 0;
  const trace = [];
  for (let i = 0; i < STEPS; i++) {
    const r = rnd(); let act;
    if (r < 0.40) { const code = pickOf(KEYS), rep = rnd() < 0.2; act = 'key ' + code + (rep ? ' (repeat)' : ''); await A.key(code, { repeat: rep }); }
    else if (r < 0.62) { const n = 1 + Math.floor(rnd() * 30), dt = pickOf([1, 8, 16, 33, 100, 250]); act = 'frames ' + n + 'x' + dt; await A.frames(n, dt); }
    else if (r < 0.72) { act = 'steer'; await page.evaluate(() => { const O = window.__ouro; if (O.game && (O.phase === 'play' || O.phase === 'ready')) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.onDir(d); } }); }
    else if (r < 0.76) { act = 'blur'; await page.evaluate(() => window.dispatchEvent(new Event('blur'))); }
    else if (r < 0.80) { act = 'hidden/visible'; await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }); }
    else if (r < 0.83) { const w = 200 + Math.floor(rnd() * 1800), h = 150 + Math.floor(rnd() * 1000); act = 'resize ' + w + 'x' + h; try { await page.setViewportSize({ width: w, height: h }); } catch (e) { act += ' (skipped: fullscreen)'; } }
    else if (r < 0.86) { act = 'pointerdown'; await page.evaluate(() => document.getElementById('c').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); }
    else if (r < 0.93) { act = 'tickOnce x' + 5; await page.evaluate(() => { for (let k = 0; k < 5; k++) { const O = window.__ouro; if (O.phase === 'play') { const d = O.game && window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); } } }); }
    else { act = 'autoplay burst'; await page.evaluate(() => { const O = window.__ouro; let n = 0; while (O.phase === 'play' && n++ < 700) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); } }); }
    trace.push(act); if (trace.length > 12) trace.shift();
    const st = await page.evaluate(() => ({ phase: window.__ouro.phase, status: window.__ouro.game ? window.__ouro.game.status : null, hasFinal: !!(window.__ouro.game && window.__ouro.game.final), hasDeath: !!(window.__ouro.game && window.__ouro.game.death), bad: window.__rt.bad.length }));
    seenPhases.set(st.phase, (seenPhases.get(st.phase) || 0) + 1);
    if (!MAP[st.phase] || !MAP[st.phase](st.status)) bad.push('phase/status mismatch: ' + JSON.stringify(st) + ' after ' + trace.join(' > '));
    if (st.phase === 'final' && !st.hasFinal) bad.push('phase final without game.final after ' + trace.join(' > '));
    if (st.phase === 'dead' && !st.hasDeath) bad.push('phase dead without death');
    if (st.bad) bad.push('non-finite canvas args');
    if (A.errors.length) { bad.push('page error: ' + A.errors[0] + ' after ' + trace.join(' > ')); A.errors.length = 0; }
    if (bad.length > 5) break;
  }
  // can we always get out? try the escape routine from wherever we are
  async function escape() {
    for (let k = 0; k < 12; k++) {
      const p = await A.phase();
      if (p === 'play') return true;
      await A.frames(60, 33);
      if (p === 'paused') await A.key('KeyP'); else await A.key('Space');
      await A.frames(10, 100);
    }
    return (await A.phase()) === 'play';
  }
  const ok = await escape();
  console.log('steps', STEPS, 'phases seen', JSON.stringify([...seenPhases]));
  console.log('escape to play from final state:', ok ? 'ok' : 'STUCK in ' + await A.phase());
  console.log(bad.length ? 'FAILURES:\n' + bad.slice(0, 8).join('\n') : 'no invariant failures, no page errors');
  await browser.close();
})();
