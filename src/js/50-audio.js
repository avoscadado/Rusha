// ---------- sound: the score ----------
// Each world is a short composition, not a texture. On arrival its motif is
// stated once, then there is a deliberate rest, then sparse fragments of the
// same motif with silence between them. Underneath sits one quiet drone and
// one noise bed. Never more than three pitched lines sound together, and all
// pitched material in a world uses that world's single timbre.
//
// Signal path:  voices, beds -> dry bus ----------------------> limiter -> out
//                            -> send -> generated-impulse reverb ^
//
// Timing: everything is scheduled on the context clock with AudioParam
// automation. AUDIO.tick() looks a little way ahead and commits whatever falls
// inside that window, so it works the same in a realtime context and in an
// OfflineAudioContext that is stepped with suspend() and resume().

const AU_MAXV = 3;      // pitched lines allowed at once, the drone included
const AU_LEAD = 0.8;    // seconds a melody line is reserved before its first note
const AU_LOOK = 0.3;    // scheduler horizon when ticks arrive at frame rate
const AU_EPS = 0.001;   // a portal tone below this is treated as silent

// One synthesis recipe per timbre. att/dec/rel are seconds (dec and rel are time
// constants), sus is the held level after the decay, perc marks struck timbres
// that ring down instead of holding, norm brings a held tone to unit RMS and
// hit scales the peak of a played note.
const AU_TM = {
  glass:  { perc: true,  att: 0.006, dec: 0.9, sus: 0,    rel: 0.16, norm: 1.40, hit: 1.25 },
  reed:   { perc: false, att: 0.09,  dec: 0.4, sus: 0.8,  rel: 0.11, norm: 1.16, hit: 0.80 },
  bowed:  { perc: false, att: 0.32,  dec: 0.6, sus: 0.86, rel: 0.26, norm: 2.10, hit: 0.80 },
  bell:   { perc: true,  att: 0.004, dec: 1.7, sus: 0,    rel: 0.24, norm: 1.40, hit: 1.15 },
  breath: { perc: false, att: 0.16,  dec: 0.5, sus: 0.82, rel: 0.2,  norm: 53.0, hit: 1.00 },
  organ:  { perc: false, att: 0.2,   dec: 0.5, sus: 0.9,  rel: 0.18, norm: 1.10, hit: 0.90 },
};
const AU_BEDS = ['wind', 'sea', 'room', 'rain', 'still'];
// Bed gains at bedLevel 1. Each is set so the bed sits far below the notes.
const AU_BEDN = { wind: 0.15, sea: 0.16, room: 0.2, rain: 0.085, still: 0.0025 };
// Linear levels of each role, before the limiter. Nothing here is loud.
const AU_LV = {
  note: 0.115, drone: 0.021, fifth: 0.011, swell: 0.03, portal: 0.07,
  pivot: 0.075, peak: 0.105, pluck: 0.036, breath: 0.05,
};
const AU_OUT = 0.95;    // output trim after the limiter (see au_build)

let au_ctx = null;      // the BaseAudioContext in use
let au_own = false;     // true when init created the context itself
let au_rt = false;      // true for a realtime context (resume and suspend exist)
let au_m = null;        // master chain nodes and shared buffers
let au_world = null;    // the world being scored
let au_kin = null;      // kin portal tone
let au_str = null;      // stranger portal tone
let au_destKey = '';
const au_pw = [0, 0];   // wanted portal gains, kin and stranger, 0..1
let au_on = true;
let au_paused = false;
let au_pauseT = 0;
let au_timer = 0;
let au_suspT = 0;
let au_lastTick = -1;
let au_horizon = AU_LOOK;
let au_lastPulse = -9;
let au_pulseAlt = 0;
let au_lvl = 0;
let au_lvlBuf = null;
const au_stat = { live: 0, voices: 0, maxVoices: 0, notes: 0, pulses: 0, first: null };

const au_mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// move a MIDI note by octaves into [lo, lo + 12)
const au_fold = (m, lo) => lo + ((((m - lo) % 12) + 12) % 12);
const au_want = (near, look) => {
  const n = sat(+near || 0);
  return n * n * (0.35 + 0.65 * sat(+look || 0));
};

// ---------- node bookkeeping ----------
// A group is the set of nodes behind one voice or one bed. All its sources stop
// at the same time; when the first one ends, every node is disconnected.
function au_group() { return { srcs: [], nodes: [], done: false }; }
function au_arm(G, cb) {
  au_stat.live++;
  G.srcs[0].onended = () => {
    if (G.done) return;
    G.done = true;
    au_stat.live--;
    for (const n of G.nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } }
    G.nodes.length = 0; G.srcs.length = 0;
    if (cb) cb();
  };
}
function au_end(G, t) {
  for (const s of G.srcs) { try { s.stop(t); } catch (e) { /* already ended */ } }
}

// ---------- generated buffers ----------
function au_noiseBuf(ctx, secs, label) {
  const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const r = stream(0x4b494e + ch, label), d = buf.getChannelData(ch);
    let sum = 0;
    for (let i = 0; i < n; i++) { d[i] = r() * 2 - 1; sum += d[i]; }
    const mean = sum / n;
    for (let i = 0; i < n; i++) d[i] -= mean;
  }
  return buf;
}
// Rain: mostly silence, with short decaying grains at random moments.
function au_sparseBuf(ctx, secs) {
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = stream(0x5241494e + ch, 'au-rain'), d = buf.getChannelData(ch);
    const drops = Math.floor(secs * 80);
    for (let k = 0; k < drops; k++) {
      const i0 = Math.floor(r() * (n - sr * 0.02)), len = Math.floor(sr * r.range(0.0015, 0.005));
      const a = 0.35 + 0.65 * r() * r();
      for (let i = 0; i < len; i++) d[i0 + i] += (r() * 2 - 1) * a * Math.exp(-5 * i / len) * Math.min(1, i / 6);
    }
  }
  return buf;
}
// Reverb impulse: seeded noise under an exponential decay that reaches -60 dB at
// 3.5 s, through a one-pole lowpass that closes as the tail dies (air absorbs
// the top first).
function au_impulse(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(sr * 3.5), buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = stream(0x524f4f4d + ch, 'au-ir'), d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fc = mix(5200, 1100, sat(t / 2.5));
      lp += (1 - Math.exp(-TAU * fc / sr)) * ((r() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-t / 0.507) * sat(t / 0.012) * sat((3.5 - t) / 0.06);
    }
  }
  return buf;
}

// ---------- master chain ----------
function au_build(ctx) {
  const m = {};
  m.dry = ctx.createGain();
  m.send = ctx.createGain();
  m.sendHp = ctx.createBiquadFilter();           // keep the drone's lows out of the tail
  m.sendHp.type = 'highpass'; m.sendHp.frequency.value = 170; m.sendHp.Q.value = 0.5;
  m.conv = ctx.createConvolver();
  m.conv.buffer = au_impulse(ctx);
  m.wet = ctx.createGain(); m.wet.gain.value = 1;
  m.hp = ctx.createBiquadFilter();               // no DC, no subsonics
  m.hp.type = 'highpass'; m.hp.frequency.value = 28; m.hp.Q.value = 0.5;
  // Used as a limiter. Everything normally sits well under the threshold. The
  // node adds its own make-up gain, which AU_OUT takes into account.
  m.comp = ctx.createDynamicsCompressor();
  m.comp.threshold.value = -9; m.comp.knee.value = 5; m.comp.ratio.value = 20;
  m.comp.attack.value = 0.003; m.comp.release.value = 0.25;
  m.trim = ctx.createGain(); m.trim.gain.value = AU_OUT;
  m.duck = ctx.createGain();                     // pause
  m.out = ctx.createGain();                      // enable / disable
  m.out.gain.value = au_on ? 1 : 0;
  m.dry.connect(m.hp);
  m.send.connect(m.sendHp); m.sendHp.connect(m.conv); m.conv.connect(m.wet); m.wet.connect(m.hp);
  m.hp.connect(m.comp); m.comp.connect(m.trim); m.trim.connect(m.duck); m.duck.connect(m.out);
  m.out.connect(ctx.destination);
  try {
    m.an = ctx.createAnalyser(); m.an.fftSize = 512;
    m.out.connect(m.an);
    au_lvlBuf = new Float32Array(m.an.fftSize);
  } catch (e) { m.an = null; }
  m.noise = au_noiseBuf(ctx, 6, 'au-noise');
  m.sparse = au_sparseBuf(ctx, 7);
  return m;
}

// ---------- timbres ----------
// Builds the tone generator for one voice into group G and returns its output
// node (unit level) plus the list of parameters that follow the pitch, so a held
// tone can be retuned. Envelopes are applied by the caller.
//   o.sus    a held tone (drone, portal, swell, pivot) rather than a played note
//   o.pluck  a muted tick: no slow internal motion
function au_norm(tm, f) {
  let k = AU_TM[tm].norm * clamp(Math.pow(f / 220, -0.25), 0.62, 1.4);
  if (tm === 'breath' && f > 420) k *= Math.sqrt(420 / f);   // its band widens with pitch
  return k;
}
function au_tone(G, tm, f, t, o) {
  const c = au_ctx, sus = !!o.sus, pluck = !!o.pluck;
  const br = o.bright == null ? 0.5 : o.bright;
  const out = c.createGain(), tun = [];
  G.nodes.push(out);
  const osc = (type, mult, cents) => {
    const n = c.createOscillator();
    n.type = type; n.frequency.value = f * mult;
    if (cents) n.detune.value = cents;
    tun.push([n.frequency, mult]);
    G.srcs.push(n); G.nodes.push(n); n.start(t);
    return n;
  };
  const gn = (v) => { const n = c.createGain(); n.gain.value = v; G.nodes.push(n); return n; };
  const bq = (type, mult, q) => {
    const n = c.createBiquadFilter();
    n.type = type; n.frequency.value = Math.min(f * mult, 15000); n.Q.value = q;
    tun.push([n.frequency, mult]); G.nodes.push(n);
    return n;
  };
  if (tm === 'reed') {
    // saw and square through a lowpass: hollow, a little nasal; vibrato arrives late
    const lp = bq('lowpass', mix(2.4, 5, br), 1.3);
    const a = osc('sawtooth', 1), b = osc('square', 1), ga = gn(0.55), gb = gn(0.45);
    a.connect(ga); ga.connect(lp); b.connect(gb); gb.connect(lp); lp.connect(out);
    if (!pluck) {
      const l = c.createOscillator(), lg = gn(0);
      l.frequency.value = 4.7;
      lg.gain.setValueAtTime(0, t); lg.gain.setTargetAtTime(sus ? 4 : 7, t + 0.2, 0.35);
      l.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
      G.srcs.push(l); G.nodes.push(l); l.start(t);
    }
  } else if (tm === 'bowed') {
    // two saws a few cents apart; the lowpass opens as the bow takes hold
    const m0 = mix(2.6, 5, br), lp = bq('lowpass', m0, 0.9);
    if (!sus && !pluck) {
      lp.frequency.setValueAtTime(f * 1.3, t);
      lp.frequency.setTargetAtTime(Math.min(f * m0, 15000), t, 0.28);
    }
    const a = osc('sawtooth', 1, -7), b = osc('sawtooth', 1, 7), g = gn(0.5);
    a.connect(g); b.connect(g); g.connect(lp); lp.connect(out);
  } else if (tm === 'bell') {
    // FM at an inharmonic ratio; the index falls away after the strike
    const car = osc('sine', 1), mod = osc('sine', 1.4), mg = gn(0);
    const hi = osc('sine', 2.76), hg = gn(0);
    if (sus) {
      mg.gain.value = f * 1.4 * 0.45; tun.push([mg.gain, 1.4 * 0.45]);
      hg.gain.value = 0.03;
    } else {
      mg.gain.setValueAtTime(f * 1.4 * (pluck ? 1.1 : 2.1), t);
      mg.gain.setTargetAtTime(f * 1.4 * 0.2, t, pluck ? 0.04 : 0.45);
      hg.gain.setValueAtTime(0.15, t); hg.gain.setTargetAtTime(0, t, 0.3);
    }
    mod.connect(mg); mg.connect(car.frequency); car.connect(out);
    hi.connect(hg); hg.connect(out);
  } else if (tm === 'breath') {
    // noise through a narrow resonance at the pitch, a weaker one an octave up,
    // a trace of air above, and a faint sine that steadies the pitch
    const src = c.createBufferSource();
    src.buffer = au_m.noise; src.loop = true;
    G.srcs.push(src); G.nodes.push(src); src.start(t, (f * 0.137 + t * 0.61) % 5);
    const q = pluck ? 9 : clamp(f / 14, 6, 30);
    const b1 = bq('bandpass', 1, q), b2 = bq('bandpass', 2, q * 0.8), g2 = gn(0.22);
    const air = c.createBiquadFilter(), ga = gn(sus ? 0.003 : 0.006);
    air.type = 'bandpass'; air.frequency.value = 2400 + 2600 * br; air.Q.value = 0.6;
    G.nodes.push(air);
    for (const n of [b1, b2, air]) { n.channelCount = 1; n.channelCountMode = 'explicit'; }
    src.connect(b1); b1.connect(out);
    src.connect(b2); b2.connect(g2); g2.connect(out);
    src.connect(air); air.connect(ga); ga.connect(out);
    const s = osc('sine', 1), sg = gn(0.009);
    s.connect(sg); sg.connect(out);
  } else if (tm === 'organ') {
    // four sine partials, like a small flue stop
    for (const [mult, a] of [[1, 1], [2, 0.5], [3, 0.26], [4, 0.13]]) {
      const p = osc('sine', mult), g = gn(a);
      p.connect(g); g.connect(out);
    }
  } else {
    // glass: a sine with one soft inharmonic partial, and a brighter one at the strike
    const a = osc('sine', 1), b = osc('sine', 2.756), gb = gn(0);
    a.connect(out); b.connect(gb); gb.connect(out);
    if (sus) gb.gain.value = 0.05;
    else {
      gb.gain.setValueAtTime(0.16, t); gb.gain.setTargetAtTime(0.015, t, 0.2);
      const d = osc('sine', 5.404), gd = gn(0);
      gd.gain.setValueAtTime(0.06, t); gd.gain.setTargetAtTime(0, t, 0.06);
      d.connect(gd); gd.connect(out);
    }
  }
  out.gain.value = au_norm(tm, f);
  return { out, tun };
}

// ---------- played notes ----------
// n: { midi, dur, vel, kind, last }  kind is 'mel', 'peak' or 'pluck'.
function au_note(w, n, t) {
  const c = au_ctx, sp = w.spec, P = AU_TM[sp.timbre], G = au_group();
  const pluck = n.kind === 'pluck', soft = n.kind === 'peak';
  const tone = au_tone(G, sp.timbre, au_mtof(n.midi), t, { bright: sp.bright, pluck });
  const env = c.createGain();
  env.gain.value = 0; G.nodes.push(env);
  tone.out.connect(env); env.connect(w.pitch);
  const e = env.gain;
  let att, tOff, rel;
  e.setValueAtTime(0, t);
  if (pluck) {
    att = 0.004; rel = 0.03; tOff = t + 0.3;
    e.linearRampToValueAtTime(n.vel * AU_LV.pluck * P.hit, t + att);
    e.setTargetAtTime(0, t + att, 0.045);
  } else if (P.perc) {
    const pk = n.vel * (soft ? AU_LV.peak : AU_LV.note) * P.hit;
    att = soft ? 0.05 : P.att; rel = P.rel;
    e.linearRampToValueAtTime(pk, t + att);
    e.setTargetAtTime(0, t + att, soft ? 2.4 : clamp(n.dur * 0.9, 0.45, P.dec));
    tOff = t + n.dur + (n.last ? P.dec * 1.5 : 0.4);
  } else {
    const pk = n.vel * (soft ? AU_LV.peak : AU_LV.note) * P.hit;
    att = Math.min(soft ? 0.5 : P.att, n.dur * 0.45);
    rel = P.rel * (n.last || soft ? 1.8 : 1);
    e.linearRampToValueAtTime(pk, t + att);
    e.setTargetAtTime(pk * P.sus, t + att, P.dec);
    tOff = t + n.dur * (n.last ? 1 : 0.96);
  }
  e.setTargetAtTime(0, tOff, rel);
  au_end(G, tOff + 8 * rel + 0.05);
  const v = {
    G, tA: t + att, tOff,
    // let go early: a later note on the same line takes over
    damp(td, tau) {
      const x = Math.max(td, v.tA + 0.004);
      if (x >= v.tOff) return;
      v.tOff = x;
      e.setTargetAtTime(0, x, tau);
      au_end(G, x + 8 * tau + 0.05);
    },
  };
  w.live.add(v);
  au_arm(G, () => w.live.delete(v));
  return v;
}

// ---------- held tones ----------
// tone -> [lowpass] -> [breathing gain] -> level gain -> dip gain -> dest(s)
//   o.lp       lowpass cutoff as a multiple of the pitch (0 for none)
//   o.breathe  [seconds, seconds]: periods of the slow level and filter motion
//   o.extra    further nodes to disconnect together with this voice
function au_hold(tm, midi, t, dest, o) {
  const c = au_ctx, G = au_group(), f = au_mtof(midi);
  const tone = au_tone(G, tm, f, t, { sus: true, bright: o.bright });
  let node = tone.out, filt = null;
  if (o.lp) {
    filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = 0.6; filt.frequency.value = Math.min(f * o.lp, 15000);
    G.nodes.push(filt); node.connect(filt); node = filt;
  }
  if (o.breathe) {
    const amp = c.createGain(), l1 = c.createOscillator(), d1 = c.createGain();
    l1.frequency.value = 1 / o.breathe[0]; d1.gain.value = 0.22;
    l1.connect(d1); d1.connect(amp.gain);
    G.srcs.push(l1); G.nodes.push(amp, l1, d1); l1.start(t);
    if (filt) {
      const l2 = c.createOscillator(), d2 = c.createGain();
      l2.frequency.value = 1 / o.breathe[1]; d2.gain.value = 420;      // cents
      l2.connect(d2); d2.connect(filt.detune);
      G.srcs.push(l2); G.nodes.push(l2, d2); l2.start(t);
    }
    node.connect(amp); node = amp;
  }
  const g = c.createGain(), dip = c.createGain();
  g.gain.value = 0; g.gain.setValueAtTime(0, t);
  node.connect(g); g.connect(dip);
  for (const d of [].concat(dest)) dip.connect(d);
  G.nodes.push(g, dip);
  if (o.extra) for (const x of o.extra) G.nodes.push(x);
  au_arm(G);
  return { G, g, dip, filt, tone, tm, midi, lp: o.lp || 0, open: 1, lvl: 0, busy: 0 };
}
// Approach a new level. Skips the call when nothing meaningful changed, so a
// per-frame caller does not pile up automation events.
function au_set(h, v, t, tau) {
  if (v === h.lvl) return;
  if (v !== 0 && h.lvl !== 0 && Math.abs(v - h.lvl) < 0.0006) return;
  h.lvl = v;
  h.g.gain.setTargetAtTime(v, t, tau);
}
// Change pitch without a slide: dip, retune in the trough, come back.
function au_retune(h, midi, t) {
  const f = au_mtof(midi), tt = t + 0.52;
  h.dip.gain.setTargetAtTime(0, t, 0.13);
  for (const [p, mult] of h.tone.tun) p.setTargetAtTime(f * mult, tt, 0.02);
  h.tone.out.gain.setTargetAtTime(au_norm(h.tm, f), tt, 0.02);
  if (h.filt) h.filt.frequency.setTargetAtTime(Math.min(f * h.lp * h.open, 15000), tt, 0.02);
  h.dip.gain.setTargetAtTime(1, tt + 0.08, 0.4);
  h.midi = midi; h.busy = tt + 1.5;
}
function au_kill(h, t, tau) {
  h.lvl = 0;
  h.g.gain.setTargetAtTime(0, t, tau);
  au_end(h.G, t + 8 * tau + 0.05);
}

// ---------- beds ----------
function au_bed(w, t, delay) {
  const c = au_ctx, sp = w.spec, G = au_group(), r = stream(sp.seed, 'au-bed');
  const out = c.createGain();
  G.nodes.push(out);
  out.gain.value = 0; out.gain.setValueAtTime(0, t);
  out.gain.setTargetAtTime(AU_BEDN[sp.bed] * sp.bedLevel, t + delay, 2);
  out.connect(w.fb);
  const src = (buf) => {
    const n = c.createBufferSource();
    n.buffer = buf; n.loop = true;
    G.srcs.push(n); G.nodes.push(n); n.start(t, r() * (buf.duration - 0.1));
    return n;
  };
  const bq = (type, f, q) => {
    const n = c.createBiquadFilter();
    n.type = type; n.frequency.value = f; n.Q.value = q; G.nodes.push(n);
    return n;
  };
  const gn = (v) => { const n = c.createGain(); n.gain.value = v; G.nodes.push(n); return n; };
  const lfo = (period, depth, target) => {
    const l = c.createOscillator(), d = gn(depth);
    l.frequency.value = 1 / period;
    l.connect(d); d.connect(target);
    G.srcs.push(l); G.nodes.push(l); l.start(t);
  };
  if (sp.bed === 'wind') {
    // a band that wanders, with gusts
    const bp = bq('bandpass', mix(330, 760, sp.bright), 1.4), gust = gn(0.7);
    lfo(r.range(13, 19), 650, bp.detune); lfo(r.range(37, 53), 380, bp.detune);
    lfo(r.range(9, 13), 0.28, gust.gain);
    src(au_m.noise).connect(bp); bp.connect(gust); gust.connect(out);
  } else if (sp.bed === 'sea') {
    // low surf that comes in about every eight seconds and brightens as it does
    const lp = bq('lowpass', 480, 0.5), swell = gn(0.55);
    lfo(8, 0.4, swell.gain); lfo(13, 0.1, swell.gain); lfo(8, 620, lp.detune);
    src(au_m.noise).connect(lp); lp.connect(swell); swell.connect(out);
  } else if (sp.bed === 'room') {
    // the hum of an enclosed place
    const lp = bq('lowpass', 115, 0.7), hp = bq('highpass', 38, 0.7);
    src(au_m.noise).connect(lp); lp.connect(hp); hp.connect(out);
  } else if (sp.bed === 'rain') {
    // separate grains, bright, over a trace of hiss
    const hp = bq('highpass', 1700, 0.7), pk = bq('peaking', 5200, 0.8), hiss = bq('highpass', 5200, 0.7), hg = gn(0.012);
    pk.gain.value = 5;
    src(au_m.sparse).connect(hp); hp.connect(pk); pk.connect(out);
    src(au_m.noise).connect(hiss); hiss.connect(hg); hg.connect(out);
  } else {
    // still: no noise at all, a faint cluster of high sines that beat slowly
    const top = au_fold(sp.root, 84);
    const degs = [0, sp.mode.includes(7) ? 7 : sp.mode[2], 12 + sp.mode[1]];
    degs.forEach((d, i) => {
      for (const off of [0, r.range(0.25, 0.9)]) {
        const o = c.createOscillator(), g = gn(i === 0 ? 1 : 0.7);
        o.frequency.value = au_mtof(top + d) + off;
        o.connect(g); g.connect(out);
        G.srcs.push(o); G.nodes.push(o); o.start(t);
      }
    });
  }
  au_arm(G);
  w.groups.push(G);
}

// ---------- spec handling ----------
// The spec belongs to the world generator. Copy it, and tolerate a bad one.
function au_clean(s) {
  s = s || {};
  const num = (v, d) => (Number.isFinite(+v) && v != null ? +v : d);
  let mode = Array.isArray(s.mode) ? s.mode.map((x) => Math.round(+x)).filter((x) => x >= 0 && x < 12) : [];
  mode = Array.from(new Set(mode)).sort((a, b) => a - b);
  if (mode[0] !== 0) mode.unshift(0);
  if (mode.length < 3) mode = [0, 2, 4, 7, 9];
  let motif = Array.isArray(s.motif) ? s.motif.filter(Boolean).map((n) => ({
    deg: Math.round(num(n.deg, 0)), oct: clamp(Math.round(num(n.oct, 1)), -2, 4), beats: clamp(num(n.beats, 1), 0.25, 8),
  })) : [];
  if (motif.length < 2) motif = [{ deg: 0, oct: 1, beats: 1 }, { deg: 2, oct: 1, beats: 1 }, { deg: 1, oct: 1, beats: 1 }, { deg: 0, oct: 1, beats: 2 }];
  return {
    seed: num(s.seed, 1) >>> 0,
    root: clamp(Math.round(num(s.root, 45)), 24, 72),
    mode,
    timbre: Object.prototype.hasOwnProperty.call(AU_TM, s.timbre) ? s.timbre : 'glass',
    tempo: clamp(num(s.tempo, 54), 30, 120),
    motif,
    bed: AU_BEDS.includes(s.bed) ? s.bed : 'still',
    bedLevel: sat(num(s.bedLevel, 0.5)),
    bright: sat(num(s.bright, 0.5)),
    space: sat(num(s.space, 0.5)),
    heirloom: !!s.heirloom,
  };
}
// scale degree (may run past the mode in either direction) to a MIDI note
function au_pitch(sp, deg, oct) {
  const n = sp.mode.length, k = ((deg % n) + n) % n;
  return sp.root + 12 * (oct + Math.floor(deg / n)) + sp.mode[k];
}
// A pitch class held across a crossing: shared by both modes where possible,
// and weightier the more it matters to each world. Otherwise the new root.
function au_pivotPc(a, b) {
  const pcs = (sp) => sp.mode.map((x) => (sp.root + x) % 12);
  const wgt = (sp, pc) => {
    const d = (((pc - sp.root) % 12) + 12) % 12;
    return d === 0 ? 3 : d === 7 ? 2 : d === 3 || d === 4 ? 1.5 : 1;
  };
  const pb = pcs(b);
  let best = b.root % 12, score = -1;
  for (const pc of pcs(a)) {
    if (!pb.includes(pc)) continue;
    const s = wgt(a, pc) + wgt(b, pc) + (pc === b.root % 12 ? 0.25 : 0);
    if (s > score) { score = s; best = pc; }
  }
  return best;
}

// ---------- a world ----------
//   o.delay, o.rise   when and how fast the drone comes up
//   o.first           seconds until the motif is stated
//   o.oldUntil        a world being left is still fading until then
//   o.pivotUntil      a pivot note is still held until then
function au_makeWorld(spec, t, o) {
  const c = au_ctx, sp = au_clean(spec), rs = stream(sp.seed, 'au-score');
  const w = {
    spec: sp, t0: t, rs, q: [], live: new Set(), groups: [], dead: false, voice: null,
    st: { kind: 'first', at: t + o.first },
    mel: { from: -9, until: -9, kind: '' },
    home: true, moveAt: t + rs.range(20, 40),
    swell: null, swellOn: false, swellT: 0, swellGone: 0,
    oldUntil: o.oldUntil || 0, pivotUntil: o.pivotUntil || 0,
    fifthOn: false, fifthOff: -9, pulseSeen: -9, pulseOK: false, pulseAt: -9,
    devN: 0, lastVar: '',
  };
  // buses: pitched material passes the world's brightness filter; pitched and
  // bed each have a fade gain so the whole world can leave together
  w.pitch = c.createGain();
  w.tone = c.createBiquadFilter();
  w.tone.type = 'lowpass'; w.tone.Q.value = 0.5; w.tone.frequency.value = 1400 * Math.pow(2, 3 * sp.bright);
  w.fp = c.createGain(); w.fb = c.createGain();
  const dry = c.createGain(), snd = c.createGain(), bsnd = c.createGain();
  dry.gain.value = 1 - 0.3 * sp.space; snd.gain.value = mix(0.08, 0.5, sp.space); bsnd.gain.value = 0.12 * sp.space;
  w.pitch.connect(w.tone); w.tone.connect(w.fp);
  w.fp.connect(dry); dry.connect(au_m.dry); w.fp.connect(snd); snd.connect(au_m.send);
  w.fb.connect(au_m.dry); w.fb.connect(bsnd); bsnd.connect(au_m.send);

  // the motif keeps its shape but is moved by whole octaves into a clear register
  let mean = 0;
  for (const n of sp.motif) mean += au_pitch(sp, n.deg, n.oct);
  mean /= sp.motif.length;
  w.shift = mean < 57 || mean > 77 ? 12 * Math.round((67 - mean) / 12) : 0;

  // drone on the root, in a register small speakers can still carry
  w.dm = au_fold(sp.root, 43);
  const lp = mix(3, 6.5, sp.bright);
  w.drone = au_hold(sp.timbre, w.dm, t, w.pitch, {
    bright: sp.bright, lp, breathe: [rs.range(11, 17), rs.range(19, 29)],
    extra: [w.pitch, w.tone, w.fp, w.fb, dry, snd, bsnd],
  });
  w.groups.push(w.drone.G);
  au_set(w.drone, AU_LV.drone, t + o.delay, o.rise);
  // some worlds also keep the fifth, when the mode has one and a line is free
  w.fifth = null;
  if (sp.mode.includes(7) && rs.chance(0.6)) {
    w.fifth = au_hold(sp.timbre, w.dm + 7, t, w.pitch, { bright: sp.bright, lp: lp * 0.8, breathe: [rs.range(13, 21), rs.range(23, 31)] });
    w.groups.push(w.fifth.G);
  }
  au_bed(w, t, o.delay + 0.2);
  return w;
}
// Fade a world out and release everything it owns once it is silent.
function au_fadeWorld(w, t, dur) {
  if (!w || w.dead) return;
  w.dead = true; w.q.length = 0;
  for (const g of [w.fp.gain, w.fb.gain]) { g.setValueAtTime(1, t); g.linearRampToValueAtTime(0, t + dur); }
  const T = t + dur + 0.05;
  for (const G of w.groups) au_end(G, T);
  for (const v of w.live) au_end(v.G, T);
}
function au_dropPortals(t, tau) {
  if (au_kin) au_kill(au_kin, t, tau);
  if (au_str) au_kill(au_str, t, tau);
  au_kin = au_str = null; au_destKey = '';
  au_pw[0] = au_pw[1] = 0;
}

// ---------- the score ----------
// Every statement is the motif or something made from it: its head, a move by a
// mode step, its retrograde, or the same at double length.
function au_phrase(w, kind) {
  const sp = w.spec, r = w.rs, beat = 60 / sp.tempo;
  let ns = sp.motif.map((n) => ({ deg: n.deg, oct: n.oct, beats: n.beats }));
  let step = 0, mul = 1, vel = 0.8;
  if (kind === 'full') vel = w.devN ? 0.86 : 1;
  else if (kind === 'head') {
    ns = ns.slice(0, ns.length > 4 && r.chance(0.5) ? 3 : 2);
    ns[ns.length - 1].beats = Math.max(2, ns[ns.length - 1].beats);
  } else if (kind === 'step') step = r.pick([1, -1, 1, 2, -2]);
  else if (kind === 'retro') ns.reverse();
  else if (kind === 'aug') {
    mul = 2; vel = 0.74;
    let total = 0;
    for (const n of ns) total += n.beats;
    if (total * 2 * beat > 12) ns = ns.slice(0, 3);
  }
  const notes = [];
  let off = 0;
  ns.forEach((n, i) => {
    const dur = Math.max(0.2, n.beats * beat * mul), last = i === ns.length - 1;
    notes.push({ off, midi: au_pitch(sp, n.deg + step, n.oct) + w.shift, dur, vel: vel * (i === 0 ? 1 : last ? 0.9 : 0.94), kind: 'mel', last });
    off += dur;
  });
  return { notes, total: off };
}
function au_variation(w) {
  w.devN++;
  if (w.devN % 5 === 0) return 'full';        // now and then the tune comes back whole
  let k = w.lastVar;
  while (k === w.lastVar) k = w.rs.weighted([['head', 4], ['step', 2.5], ['retro', 2], ['aug', 1.5]]);
  w.lastVar = k;
  return k;
}
// Is a line free for a melody that starts at time at?
function au_room(w, at, kind) {
  let b = AU_MAXV - 1;
  if (at < w.oldUntil) b--;
  if (at < w.pivotUntil) b--;
  if (at < w.swellGone) b--;
  if (au_kin && au_pw[0] > AU_EPS) b--;
  if (au_str && au_pw[1] > AU_EPS) b--;
  if (kind === 'dev' && w.swellOn) b--;       // the swell gives way only to the motif and the resolution
  return b > 0;
}
// The drone leaves the root for another degree of the mode, and later returns.
// Both happen just before a statement, so the harmony turns with the phrase.
function au_harmony(w, at, now) {
  if (w.swellOn || now < w.drone.busy) return;
  if (!w.home) {
    au_retune(w.drone, w.dm, now);
    w.home = true;
  } else if (at >= w.moveAt) {
    const m = w.spec.mode;
    const cands = m.slice(1).map((d) => [d, d === 7 || d === 5 ? 3 : d === 8 || d === 9 ? 2 : d === 3 || d === 4 ? 1.5 : 0.4]);
    let d = w.rs.weighted(cands);
    if (d > 6 && w.dm + d - 12 >= 41) d -= 12;
    au_retune(w.drone, w.dm + d, now);
    w.home = false;
    w.moveAt = at + w.rs.range(20, 40);
  }
}
function au_plan(w, now) {
  const st = w.st, portals = (au_kin && au_pw[0] > AU_EPS) || (au_str && au_pw[1] > AU_EPS);
  // an approach to the portals belongs to their two tones: cut a fragment short
  if (portals && w.mel.kind === 'dev' && w.q.length) {
    w.q.length = 0;
    w.mel.until = Math.min(w.mel.until, now + 1.2);
  }
  // and bring the drone home, so the kin tone sits on its root
  if (portals && !w.home && !w.swellOn && now >= w.drone.busy) { au_retune(w.drone, w.dm, now); w.home = true; }
  if (now < st.at - AU_LEAD) return;
  if (now < w.mel.until) { st.at = w.mel.until + 3; return; }
  const dev = st.kind === 'dev', at = Math.max(st.at, now + 0.5);
  if (!au_room(w, at, st.kind) || (dev && (portals || (w.swellOn && now - w.swellT < 8)))) {
    st.at = now + AU_LEAD + (dev ? 2.5 : 0.3);
    return;
  }
  if (dev) au_harmony(w, at, now);
  const ph = au_phrase(w, dev ? au_variation(w) : 'full');
  for (const n of ph.notes) { n.t = at + n.off; w.q.push(n); }
  const end = at + ph.total;
  w.mel = { from: at, until: end + 0.9, kind: st.kind };
  if (!dev) au_stat.first = { from: at, until: end };
  // after the statement a long rest; after that, fragments well apart
  w.st = { kind: 'dev', at: dev ? Math.max(at + 9, end + 5) + w.rs.range(0, 8) : end + w.rs.range(6, 9) };
}
// Share out the three lines. The drone always has one. What is already sounding
// keeps its line; then the portal tones, the swell, the pulse, and last the
// drone's fifth, which gives way to anything.
function au_alloc(w, now) {
  let b = AU_MAXV - 1, used = 1;
  if (now < w.oldUntil) { b--; used++; }
  if (now < w.pivotUntil) { b--; used++; }
  if (now < w.swellGone) { b--; used++; }
  if (now >= w.mel.from - AU_LEAD && now < w.mel.until) { b--; if (now >= w.mel.from) used++; }
  for (let i = 0; i < 2; i++) {               // the nearer portal first
    const kin = (i === 0) === (au_pw[0] >= au_pw[1]), h = kin ? au_kin : au_str;
    if (!h) continue;
    const want = au_pw[kin ? 0 : 1], ok = want > AU_EPS && b > 0;
    if (ok) { b--; used++; }
    au_set(h, ok ? want * AU_LV.portal * (kin ? 1 : 1.15) : 0, now, ok ? 0.12 : 0.1);
  }
  if (w.swell) {
    const ok = w.swellOn && b > 0;
    if (ok) { b--; used++; }
    au_set(w.swell, ok ? AU_LV.swell : 0, now, ok ? 2 : 0.25);
  }
  const fifthHeard = w.fifthOn || now - w.fifthOff < 0.5;
  w.pulseOK = b > 1 || (b === 1 && !fifthHeard);
  if (now - w.pulseSeen < 1.2) b--;
  if (now - w.pulseAt < 0.2) used++;
  if (w.fifth) {
    const ok = b > 0 && w.home && now >= w.drone.busy;
    if (ok) used++;
    else if (w.fifthOn) w.fifthOff = now;
    w.fifthOn = ok;
    au_set(w.fifth, ok ? AU_LV.fifth : 0, now, ok ? 2.5 : 0.16);
  }
  au_stat.voices = used;
  if (used > au_stat.maxVoices) au_stat.maxVoices = used;
}
// Commit the queued notes that fall inside the horizon. The melody is one line:
// each note lets go of the one before it.
function au_flush(w, now, until) {
  while (w.q.length && w.q[0].t < until) {
    const n = w.q.shift();
    let t = n.t;
    if (t < now + 0.01) {                      // late (a stalled tab): keep the rhythm, move the rest
      const d = now + 0.02 - t;
      t += d;
      for (const x of w.q) x.t += d;
      w.mel.until += d;
    }
    if (w.voice) w.voice.damp(t, AU_TM[w.spec.timbre].perc ? 0.12 : 0.07);
    w.voice = au_note(w, n, t);
    au_stat.notes++;
  }
}
// The one noise gesture: a breath at the instant of crossing.
function au_breath(t) {
  const c = au_ctx, G = au_group();
  const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), snd = c.createGain();
  src.buffer = au_m.noise; src.loop = true;
  bp.type = 'bandpass'; bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(420, t + 2.4);
  g.gain.value = 0; g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(AU_LV.breath, t + 0.07);
  g.gain.setTargetAtTime(0, t + 0.07, 0.65);
  snd.gain.value = 0.5;
  src.connect(bp); bp.connect(g); g.connect(au_m.dry); g.connect(snd); snd.connect(au_m.send);
  G.srcs.push(src); G.nodes.push(src, bp, g, snd);
  src.start(t, 1.3);
  au_arm(G);
  au_end(G, t + 0.07 + 8 * 0.65);
}

// ---------- public interface ----------
const AUDIO = {
  ready: false,

  // ctx optional. Without one, a realtime context is created, so the caller must
  // be inside a user gesture. Safe to call again. Returns true when sound works.
  init(ctx) {
    if (AUDIO.ready && (!ctx || ctx === au_ctx)) {
      if (au_rt && au_on && au_ctx.state === 'suspended') { try { au_ctx.resume(); } catch (e) { /* needs a gesture */ } }
      return true;
    }
    if (AUDIO.ready) AUDIO.reset();
    try {
      let c = ctx;
      au_own = !c;
      if (!c) {
        const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!AC) return false;
        c = new AC();
      }
      au_ctx = c;
      au_rt = typeof c.startRendering !== 'function' && typeof c.resume === 'function';
      au_m = au_build(c);
      AUDIO.ready = true;
      if (au_rt) {
        if (c.state === 'suspended' && au_on) { try { c.resume(); } catch (e) { /* needs a gesture */ } }
        au_timer = setInterval(() => AUDIO.tick(), 100);   // keeps time when frames stop coming
      }
      return true;
    } catch (e) {
      au_ctx = null; au_m = null; AUDIO.ready = false;
      return false;
    }
  },

  // Drop everything, so init can be given a fresh context. Not part of the
  // running piece; used by tests and after a context is lost.
  reset() {
    if (au_timer) clearInterval(au_timer);
    if (au_suspT) clearTimeout(au_suspT);
    au_timer = 0; au_suspT = 0;
    if (au_ctx && au_world) {
      const now = au_ctx.currentTime;
      au_dropPortals(now, 0.01);
      for (const G of au_world.groups) au_end(G, now);
      for (const v of au_world.live) au_end(v.G, now);
    }
    if (au_m) {
      for (const k of Object.keys(au_m)) { try { if (au_m[k] && au_m[k].disconnect) au_m[k].disconnect(); } catch (e) { /* gone */ } }
    }
    if (au_own && au_ctx && typeof au_ctx.close === 'function') { try { au_ctx.close(); } catch (e) { /* closed */ } }
    au_ctx = null; au_m = null; au_world = null; au_kin = au_str = null; au_destKey = '';
    au_pw[0] = au_pw[1] = 0;
    au_own = false; au_rt = false; au_on = true; au_paused = false;
    au_lastTick = -1; au_horizon = AU_LOOK; au_lastPulse = -9; au_pulseAlt = 0; au_lvl = 0;
    au_stat.live = 0; au_stat.voices = 0; au_stat.maxVoices = 0; au_stat.notes = 0; au_stat.pulses = 0; au_stat.first = null;
    AUDIO.ready = false;
  },

  setEnabled(on) {
    au_on = !!on;
    if (!AUDIO.ready) return;
    if (au_suspT) { clearTimeout(au_suspT); au_suspT = 0; }
    if (au_on && au_rt && au_ctx.state === 'suspended') { try { au_ctx.resume(); } catch (e) { /* needs a gesture */ } }
    au_m.out.gain.setTargetAtTime(au_on ? 1 : 0, au_ctx.currentTime, 0.15);   // settles in about 0.6 s
    if (!au_on && au_rt) {
      au_suspT = setTimeout(() => {
        au_suspT = 0;
        if (!au_on && au_ctx && au_rt && au_ctx.state === 'running') { try { au_ctx.suspend(); } catch (e) { /* fine */ } }
      }, 1200);
    }
  },

  // Start a world from silence. Any previous world fades over 1.5 s.
  enter(spec) {
    if (!AUDIO.ready || !spec) return;
    const now = au_ctx.currentTime, old = au_world;
    au_dropPortals(now, 0.1);
    if (old) au_fadeWorld(old, now, 1.5);
    au_world = au_makeWorld(spec, now, { delay: 0.1, rise: 1.2, first: 1.5, oldUntil: old ? now + 1.5 : 0 });
  },

  // The viewer has passed through a portal. One note that both worlds own is
  // held while the old drone leaves and the new one arrives, under a single
  // breath of noise. Then the new world begins; a motif that is returning (an
  // heirloom) is stated a second sooner.
  cross(spec) {
    if (!AUDIO.ready || !spec) return;
    const old = au_world;
    if (!old) { AUDIO.enter(spec); return; }
    const c = au_ctx, now = c.currentTime, sp = au_clean(spec);
    au_dropPortals(now, 0.07);
    au_fadeWorld(old, now, 2.6);
    const pm = au_fold(au_pivotPc(old.spec, sp), 58);
    const dry = c.createGain(), snd = c.createGain();
    dry.gain.value = 0.8; snd.gain.value = 0.45;
    dry.connect(au_m.dry); snd.connect(au_m.send);
    const pv = au_hold(sp.timbre, pm, now, [dry, snd], { bright: sp.bright, lp: 5, extra: [dry, snd] });
    pv.g.gain.setValueAtTime(0, now + 0.25);
    pv.g.gain.linearRampToValueAtTime(AU_LV.pivot, now + 0.7);
    pv.g.gain.setTargetAtTime(0, now + 2.5, 0.35);
    au_end(pv.G, now + 2.5 + 8 * 0.35);
    au_breath(now);
    au_world = au_makeWorld(spec, now, {
      delay: 0.5, rise: 0.9, first: 2.5 + (sp.heirloom ? 0.5 : 1.5),
      oldUntil: now + 2.6, pivotUntil: now + 2.5 + 1.2,
    });
  },

  // The worlds behind the two portals; either may be null. Each gets one held
  // tone, silent until portals() brings it up. Kin: this world's own root an
  // octave above the drone (or its fifth, when the kin world is rooted there),
  // in this world's timbre and room. Stranger: that world's root in that
  // world's timbre, darker and mostly reverb, so it reads as far away.
  setDestinations(kinSpec, strangerSpec) {
    const w = au_world;
    if (!AUDIO.ready || !w) return;
    const key = (s) => (s ? [s.seed, s.root, s.timbre].join(':') : '-');
    const k = key(kinSpec) + '|' + key(strangerSpec) + '|' + w.t0;
    if (k === au_destKey) return;
    const c = au_ctx, now = c.currentTime;
    au_dropPortals(now, 0.1);
    au_destKey = k;
    let km = -1;
    if (kinSpec) {
      const ks = au_clean(kinSpec);
      const fifth = w.spec.mode.includes(7) && (ks.root - w.spec.root - 7) % 12 === 0;
      km = au_fold(w.spec.root, 57) + (fifth ? 7 : 0);
      au_kin = au_hold(w.spec.timbre, km, now, w.pitch, { bright: w.spec.bright, lp: 6 });
    }
    if (strangerSpec) {
      const ss = au_clean(strangerSpec);
      let sm = au_fold(ss.root, 60);
      if (sm === km) sm += 12;
      const dry = c.createGain(), snd = c.createGain();
      dry.gain.value = 0.45; snd.gain.value = 0.9;
      dry.connect(au_m.dry); snd.connect(au_m.send);
      au_str = au_hold(ss.timbre, sm, now, [dry, snd], { bright: ss.bright, lp: 3, extra: [dry, snd] });
    }
  },

  // Every frame while portals exist. near 0..1, look 0..1. All zeros otherwise.
  portals(kinNear, strangerNear, kinLook, strangerLook) {
    au_pw[0] = au_want(kinNear, kinLook);
    au_pw[1] = au_want(strangerNear, strangerLook);
  },

  // Something seen has just gone by: one muted pluck, root and fifth in turn.
  pulse(strength) {
    const w = au_world;
    if (!AUDIO.ready || !w || au_paused || !au_on) return;
    const s = sat(+strength || 0), now = au_ctx.currentTime;
    if (s < 0.02 || now - au_lastPulse < 1 / 6) return;
    w.pulseSeen = now;                         // asks the drone's fifth to make room
    if (!w.pulseOK) return;
    au_lastPulse = now; w.pulseAt = now;
    const m = w.spec.mode;
    let fifth = m[0];
    for (const d of m) if (Math.abs(d - 7) < Math.abs(fifth - 7)) fifth = d;
    const midi = au_fold(w.spec.root, 57) + (au_pulseAlt++ % 2 ? fifth : 0);
    au_note(w, { midi, dur: 0.1, vel: 0.3 + 0.7 * s, kind: 'pluck', last: true }, now + 0.01);
    au_stat.pulses++;
  },

  // The world's one event. start: the drone opens and a second held voice rises
  // a mode step above the root over about six seconds. peak: that voice lets
  // go and one low, soft, long note on the root answers it.
  event(phase) {
    const w = au_world;
    if (!AUDIO.ready || !w) return;
    const now = au_ctx.currentTime, sp = w.spec, d = w.drone;
    const open = (k, tau) => {
      d.open = k;
      d.filt.frequency.setTargetAtTime(Math.min(au_mtof(d.midi) * d.lp * k, 15000), now, tau);
      au_set(d, AU_LV.drone * (k > 1 ? 1.25 : 1), now, tau);
    };
    if (phase === 'start') {
      if (w.swellOn) return;
      w.swellOn = true; w.swellT = now;
      if (!w.swell) {
        w.swell = au_hold(sp.timbre, w.dm + 12 + sp.mode[1], now, w.pitch, { bright: sp.bright, lp: 5, breathe: [9, 14] });
        w.groups.push(w.swell.G);
      }
      open(2.6, 2);
    } else if (phase === 'peak') {
      w.swellOn = false;
      if (w.swell) {
        au_kill(w.swell, now + 0.1, 0.8);
        w.groups.splice(w.groups.indexOf(w.swell.G), 1);
        w.swell = null; w.swellGone = now + 0.1 + 0.8 * 3.5;
      }
      open(1, 3);
      const at = now + 0.7;
      if (au_paused || (w.mel.kind === 'first' && now < w.mel.until) || !au_room(w, at, 'peak')) return;
      w.q.length = 0;                          // a fragment under way yields to the resolution
      w.q.push({ t: at, midi: au_fold(sp.root, 41), dur: 5.5, vel: 0.9, kind: 'peak', last: true });
      w.mel = { from: at, until: at + 6.5, kind: 'peak' };
      w.st.at = Math.max(w.st.at, w.mel.until + 4);
    }
  },

  // Duck to a quarter and hold the score where it is.
  setPaused(on) {
    on = !!on;
    if (on === au_paused) return;
    au_paused = on;
    if (!AUDIO.ready) return;
    const now = au_ctx.currentTime, w = au_world;
    au_m.duck.gain.setTargetAtTime(on ? 0.25 : 1, now, 0.12);
    if (on) au_pauseT = now;
    else if (w) {
      const d = now - au_pauseT;
      w.st.at += d; w.moveAt += d; w.swellT += d;
      if (w.q.length) { w.mel.until += d; for (const n of w.q) n.t += d; }
    }
  },

  // Run the scheduler. Call every frame; extra calls cost nothing.
  tick() {
    if (!AUDIO.ready) return;
    const now = au_ctx.currentTime, w = au_world;
    // if ticks arrive slowly (a throttled background tab) look further ahead
    const gap = au_lastTick < 0 ? 0 : now - au_lastTick;
    au_lastTick = now;
    au_horizon = clamp(Math.max(AU_LOOK, gap * 2.2, au_horizon * 0.98), AU_LOOK, 3);
    if (!w || au_paused) return;
    au_plan(w, now);
    au_alloc(w, now);
    au_flush(w, now, now + au_horizon);
  },

  // 0..1 smoothed output level for a small meter.
  level() {
    if (!AUDIO.ready || !au_m.an || !au_lvlBuf) return 0;
    try { au_m.an.getFloatTimeDomainData(au_lvlBuf); } catch (e) { return 0; }
    let s = 0;
    for (let i = 0; i < au_lvlBuf.length; i++) s += au_lvlBuf[i] * au_lvlBuf[i];
    const v = sat(Math.sqrt(Math.sqrt(s / au_lvlBuf.length) / 0.2));
    if (!Number.isFinite(v)) return au_lvl;
    au_lvl += (v - au_lvl) * (v > au_lvl ? 0.5 : 0.1);
    return au_lvl;
  },

  // For tests and demos only: counters, and when the first statement fell.
  stats() {
    return { live: au_stat.live, voices: au_stat.voices, maxVoices: au_stat.maxVoices, notes: au_stat.notes, pulses: au_stat.pulses, first: au_stat.first };
  },

  // For tests and demos only: a valid, musically sensible spec from a seed.
  demoSpec(seed) {
    seed = (+seed || 0) >>> 0;
    const r = stream(seed, 'au-demo');
    const mode = r.pick([
      [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 1, 5, 7, 10], [0, 2, 5, 7, 9],
      [0, 2, 3, 5, 7, 9], [0, 2, 4, 5, 7, 9], [0, 1, 3, 5, 7, 8],
      [0, 2, 3, 5, 7, 9, 10], [0, 2, 3, 5, 7, 8, 10], [0, 2, 4, 6, 7, 9, 11], [0, 2, 4, 5, 7, 9, 10],
    ]);
    const root = r.int(36, 57), tempo = r.int(40, 80), beat = 60 / tempo;
    // a small arch: start on a stable degree, move mostly by step, come to rest
    let count = r.int(4, 7), deg = r.pick([0, 0, 2, 4]);
    const motif = [];
    for (let i = 0; i < count; i++) {
      motif.push({ deg, oct: root >= 46 ? 1 : 2, beats: r.weighted([[1, 5], [2, 1.5], [0.5, 1]]) });
      deg = clamp(deg + r.weighted([[1, 3], [-1, 3], [2, 2], [-2, 1.5], [3, 0.5]]), -2, mode.length + 2);
    }
    const last = motif[motif.length - 1];
    last.deg = r.pick([0, 0, 2, mode.length]); last.beats = 2;
    // keep the tune short enough to be remembered: between about 3.5 and 7 seconds
    const secs = () => motif.reduce((s, n) => s + n.beats, 0) * beat;
    for (let i = 0; i < motif.length - 1 && secs() > 7; i++) if (motif[i].beats > 1) motif[i].beats = 1;
    while (secs() > 7 && motif.length > 4) motif.splice(motif.length - 2, 1);
    for (let i = 0; i < motif.length - 1 && secs() > 7; i++) motif[i].beats = 0.5;
    for (let i = 0; i < motif.length - 1 && secs() < 3.5; i++) motif[i].beats = Math.max(1, motif[i].beats * 2);
    return {
      seed, root, mode, tempo, motif,
      timbre: r.pick(Object.keys(AU_TM)),
      bed: r.pick(AU_BEDS),
      bedLevel: r.range(0.3, 0.8),
      bright: r.range(0.25, 0.85),
      space: r.range(0.3, 0.85),
      heirloom: false,
    };
  },
};
