// Counts what the generator makes over many seeds, without drawing anything:
// forms, palettes, events, names. Also catches any seed whose generation throws.
//   node tools/census.mjs [count]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js');
const files = fs.readdirSync(root).filter((f) => /^(00|20|3\d)-/.test(f)).sort();
const ctx = vm.createContext({ console, Math });
vm.runInContext(files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + '\nthis.WORLD = WORLD; this.FORMS = FORMS; this.mix32 = mix32;', ctx);
const N = +(process.argv[2] || 3000), tally = (o, k) => { o[k] = (o[k] || 0) + 1; };
const forms = {}, pals = {}, evs = {}, names = {}, kin = {}, errors = [];
let longest = '';
for (let i = 0; i < N; i++) {
  const base = ctx.mix32(i * 2654435761 + 17) >>> 0;
  try {
    const g = ctx.WORLD.make({ base, change: 0, heir: ctx.mix32(base ^ 0x7f4a7c15), age: 0 });
    tally(forms, g.form); tally(pals, g.pal.name); tally(evs, g.ev.type); tally(names, g.name);
    if (g.line.length > longest.length) longest = g.line;
    if (!g.name || !g.line || /undefined|NaN/.test(g.name + g.line)) errors.push(`seed ${base}: bad words: ${g.name} | ${g.line}`);
    for (const v of g.tr) if (!Number.isFinite(v)) { errors.push(`seed ${base} (${g.form}): a trait is not a number`); break; }
    for (let c = 1; c <= 3; c++) {
      const k = ctx.WORLD.make({ base, change: ctx.mix32(base + c * 7919) || 1, heir: 1, age: 1 });
      tally(kin, k.changeType);
      if (!k.line || /undefined|NaN/.test(k.name + k.line)) errors.push(`seed ${base} kin ${c}: bad words: ${k.name} | ${k.line}`);
    }
  } catch (e) { errors.push(`seed ${base}: ${e.message}`); }
}
const show = (t, o) => console.log(t + ': ' + Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / Object.values(o).reduce((x, y) => x + y, 0)).toFixed(1)}%`).join(', '));
show('forms', forms); show('events', evs); show('kin changes', kin);
console.log(`palettes used: ${Object.keys(pals).length}; distinct names: ${Object.keys(names).length} in ${N} places`);
console.log('longest caption:', longest.length, 'characters:', longest);
console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.slice(0, 12).join('\n') : 'no generation errors');
process.exit(errors.length ? 1 : 0);
