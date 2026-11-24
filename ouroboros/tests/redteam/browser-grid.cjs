// Text-fit grid: worst-case card/banner content at many window sizes. Flags text outside the window, overlapping text,
// non-finite canvas arguments. Run: node tests/redteam/browser-grid.cjs
const { launch, open, AUTOPILOT } = require('./lib.cjs');

const WS = [480, 640, 800, 1024, 1280, 1680, 2560], HS = [300, 400, 500, 650, 800, 1000, 1440];

async function analyse(B, W, H) {
  const res = await B.page.evaluate(() => { window.__rt.texts.length = 0; window.__rt.bad.length = 0; window.__ouro.render(); return { texts: window.__rt.texts.slice(), bad: window.__rt.bad.slice() }; });
  const out = [];
  if (res.bad.length) out.push('non-finite: ' + res.bad[0]);
  const vis = res.texts.filter(t => t.alpha > 0.1 && t.s.trim());
  for (const t of vis) {
    if (t.l < -0.5 || t.r > W + 0.5) out.push('outside x: "' + t.s.slice(0, 50) + '"');
    if (t.cy - t.size / 2 < -0.5 || t.cy + t.size / 2 > H + 0.5) out.push('outside y: "' + t.s.slice(0, 50) + '"');
  }
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j], dy = Math.abs(a.cy - b.cy), minH = Math.min(a.size, b.size), ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    if (dy < minH * 0.6 && ox > 2) out.push('overlap: "' + a.s.slice(0, 30) + '" / "' + b.s.slice(0, 30) + '"');
  }
  return out;
}

const CLEAN_DAY = () => { const O = window.__ouro; if (O.phase === 'ready') O.onDir(O.game.run.dir === 1 ? 0 : 1); let n = 0; while (O.phase === 'play' && n++ < 1000) { const d = window.RT_pick(O.game, window.Ouro.DIRS); if (d !== null) O.game.input(d); O.tickOnce(); } };

const STATES = {
  title: async (B) => { await B.frames(3, 16); },
  ready_day2: async (B) => { await B.key('Space'); await B.page.evaluate(CLEAN_DAY); await B.frames(60, 20); await B.key('Space'); await B.frames(5, 100); },
  paused: async (B) => { await B.key('Space'); await B.key('ArrowDown'); await B.frames(5, 16); await B.key('KeyP'); await B.frames(2, 16); },
  dead: async (B) => { await B.key('Space'); await B.key('ArrowUp'); await B.page.evaluate(() => { let n = 0; while (window.__ouro.phase === 'play' && n++ < 200) window.__ouro.tickOnce(); }); await B.frames(60, 16); },
  daydone: async (B) => { await B.key('Space'); await B.page.evaluate(CLEAN_DAY); await B.frames(80, 20); },
  final_worst: async (B) => {          // five days, 3 tries each, big numbers, victory
    await B.key('Space'); await B.key('ArrowDown'); await B.frames(3, 16);
    await B.page.evaluate(() => { const O = window.__ouro, g = O.game; g.history = [1, 2, 3, 4, 5].map(d => ({ day: d, attempts: 3, eaten: 27 })); g.stats = { deaths: 12, near: 123, bestCombo: 4 }; g.score = 1234567; g.dayScore = 0; g.endGame(true, false); O.setPhase('final'); });
    await B.frames(60, 20);
  }
};

(async () => {
  const browser = await launch();
  const bad = new Map();
  for (const name of Object.keys(STATES)) {
    const B = await open(browser, { w: 1280, h: 800, query: '?seed=7' });
    await B.page.evaluate(AUTOPILOT);
    await STATES[name](B);
    const ph = await B.phase();
    for (const W of WS) for (const H of HS) {
      await B.page.setViewportSize({ width: W, height: H });
      await B.page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [W, H]);
      await B.page.evaluate(() => window.dispatchEvent(new Event('resize'))); await B.frames(2, 16);
      for (const m of await analyse(B, Math.max(200, W), Math.max(200, H))) { const k = name + '(' + ph + ') | ' + m.replace(/"[^"]*"/g, '"..."'); if (!bad.has(k)) bad.set(k, []); bad.get(k).push(W + 'x' + H); }
    }
    if (B.errors.length) bad.set(name + ' | PAGE ERRORS ' + B.errors[0], ['-']);
    await B.close();
  }
  await browser.close();
  if (!bad.size) console.log('no text-fit problems: ' + WS.length * HS.length + ' sizes x ' + Object.keys(STATES).length + ' states');
  for (const [k, v] of bad) console.log(k + '   @ ' + v.filter((x, i) => v.indexOf(x) === i).join(", "));
})();
