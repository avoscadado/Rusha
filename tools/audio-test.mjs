// Renders the sound engine offline in headless Chromium and checks the result.
//   node tools/audio-test.mjs            run all checks, print a table
//   node tools/audio-test.mjs --profile  also print a per-second level profile
// For each demo spec a scripted 40 second session is rendered through an
// OfflineAudioContext that is suspended every 0.1 s, so the engine's own
// scheduler (AUDIO.tick) and the public calls run at the right moments.
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  // playwright lives in a shared tools directory here, not in the repository
  ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const profile = process.argv.includes('--profile');

// Runs inside the page. Returns plain numbers only.
async function renderSession(job) {
  const SR = 44100, DUR = job.dur, STEP = 0.1;
  const a = AUDIO.demoSpec(job.seed);
  a.timbre = job.timbre; a.bed = job.bed;
  const kin = Object.assign({}, a, { seed: (a.seed ^ 0x9e3779b9) >>> 0, bed: job.kinBed, bright: Math.max(0, a.bright - 0.2), heirloom: true });
  const stranger = AUDIO.demoSpec(job.seed * 7 + 13);
  stranger.timbre = job.strangerTimbre;
  const next = job.crossTo === 'kin' ? kin : stranger;

  AUDIO.reset();
  const ctx = new OfflineAudioContext(2, SR * DUR, SR);
  if (!AUDIO.init(ctx)) return { error: 'init failed' };
  let maxVoices = 0, pulsesAsked = 0, levelMax = 0, threw = '', first = null;
  const at = (t, lo) => Math.abs(t - lo) < STEP / 2;

  const full = (t) => {
    if (at(t, 0)) AUDIO.enter(a);
    if (t >= 2 && t < 11 && Math.round(t * 10) % 4 === 0) { AUDIO.pulse(0.4 + 0.6 * Math.abs(Math.sin(t * 1.7))); pulsesAsked++; }
    if (t >= 20 && t < 21) for (let i = 0; i < 5; i++) { AUDIO.pulse(1); pulsesAsked++; }   // far over the rate limit
    if (at(t, 12)) { first = AUDIO.stats().first; AUDIO.event('start'); }
    if (at(t, 18)) AUDIO.event('peak');
    if (at(t, 22)) AUDIO.setDestinations(kin, stranger);
    if (t >= 22 && t < 30) {
      const u = (t - 22) / 8, turn = 0.5 + 0.5 * Math.sin(t * 1.3);
      AUDIO.portals(u, u * 0.9, turn, 1 - turn);
    } else AUDIO.portals(0, 0, 0, 0);
    if (at(t, 30)) AUDIO.cross(next);
  };
  // a shorter session that leans on pause, mute and a hard jump
  const controls = (t) => {
    if (at(t, 0)) AUDIO.enter(a);
    if (t >= 1 && Math.round(t * 10) % 3 === 0) AUDIO.pulse(0.8);
    if (at(t, 3)) AUDIO.setPaused(true);
    if (at(t, 5)) AUDIO.setPaused(false);
    if (at(t, 6.5)) AUDIO.setEnabled(false);
    if (at(t, 8)) AUDIO.setEnabled(true);
    if (at(t, 9)) AUDIO.enter(stranger);
    if (at(t, 10)) { AUDIO.setDestinations(kin, null); AUDIO.event('start'); }
    if (t >= 10 && t < 12) AUDIO.portals(1, 1, 1, 1); else AUDIO.portals(0, 0, 0, 0);
    if (at(t, 12)) AUDIO.cross(kin);
    if (at(t, 12.5)) AUDIO.event('peak');
    if (at(t, 13)) AUDIO.cross(a);
  };
  const run = (t) => {
    try {
      (job.script === 'controls' ? controls : full)(t);
      AUDIO.tick();
      maxVoices = Math.max(maxVoices, AUDIO.stats().maxVoices);
      levelMax = Math.max(levelMax, AUDIO.level());
    } catch (e) { threw = threw || String(e && e.stack || e); }
  };
  run(0);
  const steps = Math.round(DUR / STEP);
  for (let i = 1; i < steps; i++) {
    const t = i * STEP;
    ctx.suspend(t).then(() => { run(t); ctx.resume(); });
  }
  const buf = await ctx.startRendering();
  await new Promise((r) => setTimeout(r, 50));       // let the last ended events land
  const st = AUDIO.stats();

  const L = buf.getChannelData(0), R = buf.getChannelData(1), N = L.length;
  let bad = 0, peak = 0, sum = 0, sq = 0, diff = 0, diffAt = 0;
  for (const d of [L, R]) {
    let prev = d[0];
    for (let i = 0; i < N; i++) {
      const x = d[i];
      if (!Number.isFinite(x)) { bad++; continue; }
      const ax = x < 0 ? -x : x;
      if (ax > peak) peak = ax;
      sum += x; sq += x * x;
      const dd = Math.abs(x - prev);
      if (dd > diff) { diff = dd; diffAt = i / SR; }
      prev = x;
    }
  }
  const rms = (t0, t1) => {
    const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor(t1 * SR));
    if (i1 <= i0) return 0;
    let s = 0;
    for (let i = i0; i < i1; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / (2 * (i1 - i0)));
  };
  const out = {
    spec: { root: a.root, tempo: a.tempo, notes: a.motif.length, mode: a.mode.join(' ') },
    threw, bad, peak, diff, diffAt, dc: Math.abs(sum / (2 * N)), rms: Math.sqrt(sq / (2 * N)),
    first, second: st.first, heirloom: job.crossTo === 'kin', maxVoices: Math.max(maxVoices, st.maxVoices), live: st.live, notes: st.notes,
    pulses: st.pulses, pulsesAsked, levelMax,
    w: {},
  };
  if (job.script !== 'controls') {
    const gap0 = first ? first.until + 1.5 : 9;
    out.gapAt = gap0;
    out.w = { intro: rms(0, 1), motif: rms(2, 8), gap: rms(gap0, gap0 + 2), portal: rms(22, 30), portalEarly: rms(25, 26.5), portalLate: rms(28.5, 30), after: rms(31, 38), tail: rms(39, 40) };
  }
  if (job.profile) { out.profile = []; for (let s = 0; s < DUR; s++) out.profile.push(rms(s, s + 1)); }
  AUDIO.reset();
  return out;
}

const TIMBRES = ['glass', 'reed', 'bowed', 'bell', 'breath', 'organ'];
const BEDS = ['wind', 'sea', 'room', 'rain', 'still'];
const jobs = [];
for (let i = 0; i < 10; i++) {
  jobs.push({
    name: `${TIMBRES[i % 6]}/${BEDS[i % 5]}`, seed: 1009 + i * 7919, dur: 40, script: 'full', profile,
    timbre: TIMBRES[i % 6], bed: BEDS[i % 5], kinBed: BEDS[(i + 2) % 5],
    strangerTimbre: TIMBRES[(i + 3) % 6], crossTo: i % 2 ? 'stranger' : 'kin',
  });
}
jobs.push({ name: 'controls', seed: 4242, dur: 20, script: 'controls', timbre: 'reed', bed: 'sea', kinBed: 'rain', strangerTimbre: 'bell', crossTo: 'kin' });

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-inf').padStart(6);
const AUDIBLE = -50;      // dBFS: a window with content
const failures = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.setContent('<!doctype html><title>audio test</title>');
  await page.addScriptTag({ content: read('src/js/00-util.js') });
  await page.addScriptTag({ content: read('src/js/50-audio.js') });

  // the engine may add exactly one global besides its au_ / AU_ names; this
  // is checked by loading it and looking at what the API exposes
  const api = await page.evaluate(() => ({
    keys: Object.keys(AUDIO).sort(),
    ready: AUDIO.ready,
    demoOk: (() => {
      for (let s = 1; s < 200; s++) {
        const d = AUDIO.demoSpec(s), secs = d.motif.reduce((x, n) => x + n.beats, 0) * 60 / d.tempo;
        if (d.root < 36 || d.root > 57 || d.tempo < 40 || d.tempo > 80 || d.mode[0] !== 0 || d.mode.length < 5 || d.mode.length > 7) return 'range ' + s;
        if (d.motif.length < 4 || d.motif.length > 7 || secs > 7.6) return 'motif ' + s + ' ' + secs;
      }
      return '';
    })(),
    // calls before init must be harmless
    idle: (() => { try { AUDIO.tick(); AUDIO.pulse(1); AUDIO.enter(AUDIO.demoSpec(1)); AUDIO.portals(1, 1, 1, 1); AUDIO.event('start'); AUDIO.setPaused(true); AUDIO.setPaused(false); return AUDIO.level(); } catch (e) { return String(e); } })(),
  }));
  for (const k of ['init', 'setEnabled', 'enter', 'cross', 'setDestinations', 'portals', 'pulse', 'event', 'setPaused', 'tick', 'level', 'demoSpec', 'ready']) {
    if (!api.keys.includes(k)) failures.push(`API: AUDIO.${k} is missing`);
  }
  if (api.ready !== false) failures.push('API: AUDIO.ready must be false before init');
  if (api.demoOk) failures.push('demoSpec produced an invalid spec: ' + api.demoOk);
  if (api.idle !== 0) failures.push('calls before init are not harmless: ' + api.idle);

  console.log('all levels in dBFS; diff is the largest step between neighbouring samples\n');
  console.log('spec          root bpm n |    rms   peak   diff      dc | intro  motif    gap portal  after | voc live notes pulses');
  for (const job of jobs) {
    const r = await page.evaluate(renderSession, job);
    const fail = (msg) => failures.push(`${job.name}: ${msg}`);
    if (r.error) { fail(r.error); continue; }
    if (r.threw) fail('exception: ' + r.threw);
    const w = r.w;
    console.log(
      `${job.name.padEnd(13)} ${String(r.spec.root).padStart(4)} ${String(r.spec.tempo).padStart(3)} ${r.spec.notes} | ` +
      `${f1(db(r.rms))} ${r.peak.toFixed(3).padStart(6)} ${r.diff.toFixed(3).padStart(6)} ${r.dc.toExponential(1).padStart(7)} | ` +
      (job.script === 'controls' ? '     -      -      -      -      - | ' : `${f1(db(w.intro))} ${f1(db(w.motif))} ${f1(db(w.gap))} ${f1(db(w.portal))} ${f1(db(w.after))} | `) +
      `${String(r.maxVoices).padStart(3)} ${String(r.live).padStart(4)} ${String(r.notes).padStart(5)} ${String(r.pulses).padStart(3)}/${r.pulsesAsked}`,
    );
    if (r.profile) console.log('   per second: ' + r.profile.map((x) => db(x).toFixed(0)).join(' '));

    if (r.bad) fail(`${r.bad} NaN or Infinity samples`);
    if (!(db(r.rms) > -45)) fail(`silent: rms ${f1(db(r.rms))}`);
    if (!(db(r.rms) < -12)) fail(`too loud: rms ${f1(db(r.rms))}`);
    if (!(r.peak < 0.95)) fail(`peak ${r.peak.toFixed(3)}`);
    if (!(r.dc < 0.01)) fail(`dc offset ${r.dc}`);
    if (!(r.diff < 0.25)) fail(`click: step of ${r.diff.toFixed(3)} at ${r.diffAt.toFixed(3)} s`);
    if (r.maxVoices > 3) fail(`${r.maxVoices} pitched lines at once`);
    if (r.live > 24) fail(`${r.live} voices still connected at the end (leak)`);
    if (job.script === 'controls') continue;
    if (!r.first) { fail('the motif was never stated'); continue; }
    if (Math.abs(r.first.from - 1.5) > 0.11) fail(`motif stated at ${r.first.from.toFixed(2)} s, expected 1.5 s`);
    const due = 30 + (r.heirloom ? 3 : 4);     // the returning tune comes a second sooner
    if (!r.second || Math.abs(r.second.from - due) > 0.11) fail(`after the crossing the motif came at ${r.second && r.second.from.toFixed(2)} s, expected ${due} s`);
    if (!(r.gapAt + 2 <= 12)) fail(`test setup: the rest window ${r.gapAt.toFixed(1)} s runs into the event`);
    if (!(db(w.motif) > AUDIBLE)) fail(`motif window 2-8 s inaudible (${f1(db(w.motif))})`);
    if (!(db(w.portal) > AUDIBLE)) fail(`portal window 22-30 s inaudible (${f1(db(w.portal))})`);
    if (!(db(w.after) > AUDIBLE)) fail(`after-crossing window 31-38 s inaudible (${f1(db(w.after))})`);
    if (!(w.intro < w.motif)) fail(`0-1 s (${f1(db(w.intro))}) is not quieter than the motif (${f1(db(w.motif))})`);
    if (!(w.gap < w.motif)) fail(`the rest after the motif (${f1(db(w.gap))}) is not quieter than the motif (${f1(db(w.motif))})`);
    if (!(w.portalLate > w.portalEarly)) fail(`portal tones do not grow with nearness (${f1(db(w.portalEarly))} -> ${f1(db(w.portalLate))})`);
    if (!(r.pulses > 0 && r.pulses < r.pulsesAsked)) fail(`pulse rate limit: ${r.pulses} of ${r.pulsesAsked} played`);
    if (!(r.levelMax > 0 && r.levelMax <= 1)) fail(`level() out of range: ${r.levelMax}`);
  }
  for (const e of pageErrors) failures.push('page error: ' + e);
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`\nFAIL (${failures.length})`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`\nok: ${jobs.length} sessions`);
