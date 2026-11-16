// Steps through a crossing at 120 frames a second and reports how much the picture
// changes from each frame to the next. A flash of the wrong world shows as a spike.
//   node tools/cross.mjs "seed=H1" [--page other.html]
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(pathToFileURL(path.resolve(opt('page', path.join(root, 'index.html')))).href + `?shot=1&w=320&h=180&${args[0] || ''}`);
await page.evaluate(() => window.__ks.wait());
const res = await page.evaluate(() => {
  const k = window.__ks, gl = document.getElementById('view').getContext('webgl2');
  const grab = () => { const px = new Uint8Array(320 * 180 * 4); gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 16) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 16) / 3; };
  // run up to shortly before the crossing, then go frame by frame
  let guard = 0;
  while (k.info().step === 0 && guard++ < 4000) { k.advance(0.1); const i = k.info(); if (i.doors && i.left !== undefined && i.left < 0.5) break; }
  const out = []; let prev = grab(), crossedAt = -1;
  for (let f = 0; f < 150; f++) {
    k.advance(1 / 120, 1 / 120);
    const cur = grab(); out.push(+diff(prev, cur).toFixed(2)); prev = cur;
    if (crossedAt < 0 && k.info().step > 0) crossedAt = f;
    if (crossedAt >= 0 && f > crossedAt + 20) break;
  }
  return { out, crossedAt };
});
const d = res.out, c = res.crossedAt;
const around = d.slice(Math.max(0, c - 6), c + 7);
const base = d.slice(0, Math.max(1, c - 8)).sort((a, b) => a - b), med = base[base.length >> 1] || 0.01;
console.log(JSON.stringify({ crossedAtFrame: c, typicalChange: med, aroundCrossing: around, worst: Math.max(...around) }));
const bad = c < 0 || Math.max(...around) > Math.max(6, med * 12);
console.log(bad ? 'FAIL: the picture jumps at the crossing' : 'ok   the crossing is continuous');
await browser.close();
process.exit(bad ? 1 : 0);
