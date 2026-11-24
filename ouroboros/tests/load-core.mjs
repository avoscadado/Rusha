// Loads the pure game core out of ouroboros.html so it can be tested in Node without a browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ouroboros.html');

export function loadCore() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('core script not found');
  const ctx = vm.createContext({});
  vm.runInContext(m[1], ctx, { filename: 'ouroboros-core.js' });
  if (!ctx.Ouro) throw new Error('core did not export Ouro');
  return ctx.Ouro;
}
