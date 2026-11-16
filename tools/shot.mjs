// Renders stills of the built page in headless Chromium (software WebGL).
//   node tools/shot.mjs out.png "seed=ABC&form=plain" [--t 12] [--w 640 --h 360] [--look 0.3,0] [--sheet a,b,c] [--cols 3] [--page other.html] [--cost]
// With --sheet, the query is a template: each comma-separated item replaces {} in it
// and the stills are laid out in a grid. Prints one JSON line of info per still.
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = args[0], query = args[1] || '';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const W = +opt('w', 640), H = +opt('h', 360), T = opt('t', '6').split(',').map(Number), cols = +opt('cols', 3);
const items = opt('sheet', null) ? opt('sheet', '').split(',') : [null];
const look = opt('look', null);
const cost = args.includes('--cost');
const pageFile = path.resolve(opt('page', path.join(root, 'index.html')));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shots = [];
let failed = false;
for (const item of items) {
  const q = item === null ? query : query.split('{}').join(item);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const log = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/GPU stall|GL Driver Message/.test(t)) log.push(t.slice(0, 1500)); } });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + String(e).slice(0, 600)));
  await page.goto(pathToFileURL(pageFile).href + `?shot=1&w=${W}&h=${H}&${q}${cost ? '&debug=1' : ''}`);
  const ok = await page.evaluate(() => window.__ks && window.__ks.wait ? window.__ks.wait() : false).catch((e) => { log.push(String(e)); return false; });
  if (!ok) { failed = true; console.log(JSON.stringify({ item: q, ok: false, log })); await page.close(); continue; }
  let t0 = 0;
  for (const t of T) {
    await page.evaluate(([a, b, lk]) => { if (lk) window.__ks.look(lk[0], lk[1]); window.__ks.advance(a - b); }, [t, t0, look ? look.split(',').map(Number) : null]);
    t0 = t;
    const info = await page.evaluate((c) => ({ ...window.__ks.info(), ...(c ? { px: window.__ks.pixels() } : {}), errors: window.__ks.errors }), cost);
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    shots.push({ buf, label: (item ?? '') + (T.length > 1 ? ' t' + t : '') + ' ' + info.form + ' / ' + info.pal });
    console.log(JSON.stringify({ item: q, t, ...info, log: log.length ? log : undefined }));
    if (log.length || (info.errors && info.errors.length)) failed = true;
  }
  await page.close();
}
if (shots.length === 1) { (await import('node:fs')).writeFileSync(out, shots[0].buf); }
else if (shots.length) {
  const rows = Math.ceil(shots.length / cols);
  const page = await browser.newPage({ viewport: { width: cols * W, height: rows * H } });
  await page.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${W}px);font:11px sans-serif">` +
    shots.map((s) => `<div style="position:relative;width:${W}px;height:${H}px"><img src="data:image/png;base64,${s.buf.toString('base64')}" style="width:100%;height:100%"><span style="position:absolute;left:3px;bottom:2px;color:#fff;background:#0009;padding:1px 4px">${s.label}</span></div>`).join('') + '</body>');
  await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png', quality: out.endsWith('.jpg') ? 90 : undefined });
}
await browser.close();
process.exit(failed ? 1 : 0);
