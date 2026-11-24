// Shared helpers for the red-team scripts.  Run any script with:  node tests/redteam/<name>.cjs
const pw = require('/opt/node-tools/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');

const HTML = path.resolve(__dirname, '..', '..', 'ouroboros.html');
const URL = (q) => 'file://' + HTML + (q || '');

// Replaces rAF with a manual clock so tests are deterministic, and wraps canvas calls to catch bad numbers and measure text.
const INIT = `
(() => {
  const q = []; let now = 0;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.__frames = (n, dt) => { for (let i = 0; i < n; i++) { now += dt; const cbs = q.splice(0); for (const cb of cbs) cb(now); } };
  window.__rafPending = () => q.length;
  const rt = window.__rt = { bad: [], texts: [], calls: 0, count: {} };
  const P = CanvasRenderingContext2D.prototype;
  const NUM = ['arc','arcTo','bezierCurveTo','clearRect','createLinearGradient','createRadialGradient','drawImage','ellipse','fillRect','fillText','lineTo','moveTo','quadraticCurveTo','rect','strokeRect','translate','scale','rotate','setTransform','setLineDash','strokeText'];
  for (const m of NUM) {
    const orig = P[m];
    P[m] = function () {
      rt.calls++; rt.count[m] = (rt.count[m] || 0) + 1;
      if (m === 'strokeRect') rt.board = Array.prototype.slice.call(arguments);
      const args = Array.prototype.slice.call(arguments);
      const flat = m === 'setLineDash' ? args[0] : args;
      for (const a of flat) if (typeof a === 'number' && !isFinite(a)) { if (rt.bad.length < 50) rt.bad.push(m + '(' + args.map(String).join(',') + ')'); break; }
      if (m === 'fillText') {
        try {
          const s = String(args[0]), x = args[1], y = args[2], mt = this.measureText(s), w = mt.width;
          const size = parseFloat((/(\\d+(?:\\.\\d+)?)px/.exec(this.font) || [0, 0])[1]);
          const tr = this.getTransform(), dpr = Math.min(window.devicePixelRatio || 1, 2);
          const al = this.textAlign;
          const lx = al === 'center' ? x - w / 2 : (al === 'right' ? x - w : x);
          rt.texts.push({ s, l: (tr.a * lx + tr.e) / dpr, r: (tr.a * (lx + w) + tr.e) / dpr, cy: (tr.d * y + tr.f) / dpr, size: size * tr.a / dpr, alpha: this.globalAlpha });
        } catch (e) {}
      }
      return orig.apply(this, arguments);
    };
  }
})();`;

async function launch() { return pw.chromium.launch(); }

// opts: {w,h,dpr,query,manual:true,noStorage,noAudio,noMatchMedia,throwStorage,init}
async function open(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 800 }, deviceScaleFactor: opts.dpr || 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push('console.' + m.type() + ': ' + m.text()); });
  if (opts.manual !== false) await page.addInitScript(INIT);
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(URL(opts.query === undefined ? '?seed=7' : opts.query));
  const api = {
    page, ctx, errors,
    frames: (n, dt) => page.evaluate(([n, dt]) => window.__frames(n, dt), [n, dt || 16]),
    phase: () => page.evaluate(() => window.__ouro.phase),
    status: () => page.evaluate(() => window.__ouro.game && window.__ouro.game.status),
    key: async (code, extra) => page.evaluate(([code, extra]) => {
      const e = new KeyboardEvent('keydown', Object.assign({ code, key: code, bubbles: true, cancelable: true }, extra || {}));
      window.dispatchEvent(e); return e.defaultPrevented;
    }, [code, extra]),
    close: () => ctx.close()
  };
  return api;
}

// Autopilot injected into the page (and usable in Node by passing the core).  Looks 3 moves ahead for safety and chases fruit.
const AUTOPILOT = fs.readFileSync(path.join(__dirname, 'autopilot.js'), 'utf8');

module.exports = { pw, HTML, URL, INIT, launch, open, AUTOPILOT };
