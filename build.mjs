// Folds src/ into one self-contained index.html. No dependencies.
//   node build.mjs            -> index.html
//   node build.mjs out.html   -> a build somewhere else, for testing without touching index.html
// Layout: src/shell.html holds the page with three markers, /*CSS*/ /*GLSL*/ /*JS*/.
// GLSL files become entries of a GLSL table keyed by their path under src/glsl
// without the extension, for example "forms/highlands".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(path.join(src, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// Strip comments and blank lines from GLSL to keep the file small. Line numbers in
// shader errors are reported against the assembled source the page prints itself.
function squeezeGlsl(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/\s+$/, ''))
    .filter((l) => l.trim().length)
    .join('\n');
}

const glsl = {};
for (const f of walk('glsl', '.glsl')) {
  const key = f.slice('glsl/'.length, -'.glsl'.length).split(path.sep).join('/');
  glsl[key] = squeezeGlsl(read(f));
}
// World programs must compile on slow, strict shader compilers. Keep them plain.
const worldKeys = Object.keys(glsl).filter((k) => k === 'a-head' || k === 'z-main' || k.startsWith('forms/'));
for (const k of worldKeys) {
  const banned = [/\btexture\s*\(/, /\bdFd[xy]\b/, /\bfwidth\b/, /fract\s*\(\s*sin/, /\bcontinue\b/, /\bswitch\b/, /\bwhile\b/];
  for (const b of banned) if (b.test(glsl[k])) throw new Error(`lint: ${k}.glsl uses ${b}`);
  for (const m of glsl[k].matchAll(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g)) {
    if (+m[1] > +m[2]) throw new Error(`lint: ${k}.glsl has smoothstep(${m[1]}, ${m[2]}, ..) with its edges reversed, which is undefined`);
  }
  const calls = (glsl[k].match(/\bmap\s*\(/g) || []).length - (/float\s+map\s*\(/.test(glsl[k]) ? 1 : 0);
  if (k === 'z-main' && calls !== 3) throw new Error(`lint: z-main must call map() exactly 3 times, found ${calls}`);
  if (k !== 'z-main' && calls !== 0) throw new Error(`lint: ${k}.glsl must not call map(), found ${calls}`);
}
// A source file that does not parse is left out with a warning, so one unfinished
// part cannot break the whole page while it is being written.
const jsFiles = walk('js', '.js').filter((f) => {
  try { new Function(read(f)); return true; } catch (e) { console.warn(`skipping ${f}: ${e.message}`); return false; }
});
const js = jsFiles.map((f) => `// ---- ${path.basename(f)}\n${read(f)}`).join('\n');
const css = read('ui.css');

let html = read('shell.html');
const put = (marker, text) => {
  if (!html.includes(marker)) throw new Error('missing marker ' + marker);
  html = html.split(marker).join(text);   // split/join: no $ substitution surprises
};
put('/*CSS*/', css);
// --artifact: the same page without its document wrapper, for hosts that supply their own,
// and without the two controls such a host cannot honour (file downloads, its own address).
const artifact = process.argv.includes('--artifact');
if (artifact) {
  html = html.replace(/<!doctype html>\s*/i, '').replace(/<\/?(html|head|body)[^>]*>\s*/gi, '')
    .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
}
put('/*GLSL*/', 'const ARTIFACT = ' + artifact + ';\nconst GLSL = ' + JSON.stringify(glsl).replace(/<\/script/gi, '<\\/script') + ';');
put('/*JS*/', js.replace(/<\/script/gi, '<\\/script'));

if (/\b(?:src|href)\s*=\s*["']https?:/i.test(html) || /\bfetch\s*\(|XMLHttpRequest|importScripts/.test(html)) {
  throw new Error('index.html must stay self-contained: found an external reference or network call');
}
const outArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const outFile = outArg ? path.resolve(outArg) : path.join(root, 'index.html');
fs.writeFileSync(outFile, html);
console.log(`${path.basename(outFile)} ${(html.length / 1024).toFixed(1)} KB  (${Object.keys(glsl).length} glsl, ${jsFiles.length} js)`);
