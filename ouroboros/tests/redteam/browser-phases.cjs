// Drives every phase at many viewport sizes / DPRs. Reports page errors, non-finite canvas args, text out of the window,
// and overlapping text. Screenshots go to $RT_SHOTS (default: ./shots next to this file, ignored if unset).
// Run: node tests/redteam/browser-phases.cjs
const { launch, open, AUTOPILOT } = require('./lib.cjs');
const fs = require('node:fs'), path = require('node:path');
const SHOTS = process.env.RT_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const SIZES = [[1, 1], [200, 150], [320, 240], [480, 320], [800, 500], [1280, 800], [1920, 1080], [2560, 1440], [3440, 1000], [600, 1400]];
const DPRS = [1, 2];

async function analyse(A, label, W, H) {
  const res = await A.page.evaluate(() => { window.__rt.texts.length = 0; window.__rt.bad.length = 0; window.__ouro.render(); return { texts: window.__rt.texts.slice(), bad: window.__rt.bad.slice() }; });
  const out = [];
  if (res.bad.length) out.push('non-finite canvas args: ' + res.bad.slice(0, 3).join(' | '));
  const vis = res.texts.filter(t => t.alpha > 0.1 && t.s.trim());
  for (const t of vis) if (t.l < -0.5 || t.r > W + 0.5) out.push('text outside window (' + Math.round(t.l) + '..' + Math.round(t.r) + ' of ' + W + '): "' + t.s.slice(0, 60) + '" size ' + t.size.toFixed(1));
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j];
    const dy = Math.abs(a.cy - b.cy), minH = Math.min(a.size, b.size);
    const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    if (dy < minH * 0.6 && ox > 2) out.push('text overlap: "' + a.s.slice(0, 40) + '" / "' + b.s.slice(0, 40) + '"');
  }
  const tiny = vis.filter(t => t.size < 7).length;
  if (tiny) out.push(tiny + ' text runs smaller than 7px');
  return out;
}

(async () => {
  const browser = await launch();
  let total = 0;
  for (const dpr of DPRS) for (const [w, h] of SIZES) {
    const A = await open(browser, { w, h, dpr, query: '?seed=7' });
    const page = A.page;
    await page.evaluate(AUTOPILOT);
    const tag = w + 'x' + h + '@' + dpr;
    const issues = [];
    const check = async (name) => {
      const o = await analyse(A, name, Math.max(200, w), Math.max(200, h));
      if (SHOTS && (dpr === 1) && [[320, 240], [800, 500], [1280, 800]].some(s => s[0] === w && s[1] === h)) await page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
      for (const m of o) issues.push(name + ': ' + m);
    };
    await A.frames(10, 16); await check('title');
    await page.evaluate(() => window.__ouro.newGame()); await A.frames(20, 16); await check('ready');
    await A.key('ArrowDown'); await A.frames(60, 16); await check('play');
    await A.key('KeyP'); await A.frames(5, 16); await check('paused');
    await A.key('KeyP'); await A.frames(5, 16);
    // die into a wall
    await page.evaluate(() => { let n = 0; while (window.__ouro.phase === 'play' && n++ < 200) window.__ouro.tickOnce(); });
    await A.frames(40, 16); await check('dead');
    await A.frames(5, 100); await check('rewind');
    await A.frames(30, 50); await check('ready2');
    // play a clean day with the autopilot, using the real update loop
    await page.evaluate(() => {
      const O = window.__ouro, g = () => O.game; O.onDir(g().run.dir === 1 ? 0 : 1);
      let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(g(), window.Ouro.DIRS); if (d !== null) g().input(d); O.tickOnce(); }
    });
    const ph = await A.phase();
    if (ph === 'daydone') { await A.frames(60, 30); await check('daydone'); } else issues.push('autopilot day ended in ' + ph);
    await A.key('Space'); await A.frames(5, 100);
    await A.key('Space'); await A.frames(5, 100); await A.key('Space'); await A.frames(2, 100);
    // exhaust rewinds -> final (game over)
    await page.evaluate(() => {
      const O = window.__ouro;
      for (let k = 0; k < 8 && O.phase !== 'final'; k++) {
        if (O.phase === 'ready') O.onConfirm();
        let n = 0; while (O.phase === 'play' && n++ < 200) { O.game.run.dir === 0 ? O.game.input(1) : O.game.input(0); O.tickOnce(); }
        if (O.phase === 'dead') { O.update(1400); }
        if (O.phase === 'rewind') O.update(800);
      }
    });
    const ph2 = await A.phase(); if (ph2 !== 'final') issues.push('could not reach final, phase=' + ph2);
    await A.frames(60, 30); await check('final');
    const errs = A.errors.slice();
    total += issues.length + errs.length;
    console.log((issues.length || errs.length ? 'ISSUES ' : 'ok     ') + tag + (errs.length ? '  ERRORS: ' + errs.slice(0, 3).join(' || ') : ''));
    const seen = new Set();
    for (const m of issues) { const k = m.replace(/\d+/g, '#'); if (!seen.has(k)) { seen.add(k); console.log('    ' + m); } }
    await A.close();
  }
  await browser.close();
  console.log('total issues', total);
})();
