// Forces the failure paths: no WebGL 2, and a lost then restored graphics context.
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) bad++; };

{ // 1. no WebGL 2: a plain message, no exception
  const page = await browser.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url + '?nowebgl=1'); await page.waitForTimeout(600);
  const sub = await page.textContent('#veil-sub');
  check('no WebGL 2 shows a message', /WebGL 2/.test(sub), JSON.stringify(sub));
  check('no WebGL 2 throws nothing', errs.length === 0, errs.join(' | '));
  await page.close();
}
{ // 2. context lost and restored mid-flight
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } }); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url + '?form=plain#1-c7-0-c7-0');
  await page.waitForSelector('#veil.peek', { timeout: 90000 });
  await page.click('#go-quiet'); await page.waitForTimeout(3500);
  const before = await page.evaluate(() => window.__ks.info());
  await page.evaluate(() => { window.__lc = document.getElementById('view').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
  await page.waitForTimeout(800);
  const during = await page.textContent('#veil-sub');
  check('lost context shows "one moment"', /one moment/.test(during), JSON.stringify(during));
  await page.evaluate(() => window.__lc.restoreContext());
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => ({ info: window.__ks.info(), errors: window.__ks.errors, veilGone: document.getElementById('veil').classList.contains('gone') }));
  check('same place after restore', after.info && before && after.info.code === before.code, JSON.stringify(after.info));
  check('veil lifted after restore', after.veilGone);
  check('no errors after restore', errs.length === 0 && after.errors.length === 0, errs.concat(after.errors).join(' | ').slice(0, 600));
  const shot = await page.screenshot(); (await import('node:fs')).writeFileSync(process.argv[2] || '/dev/null', shot);
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
