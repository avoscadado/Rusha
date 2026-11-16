// ---------- start ----------
const Q = new URLSearchParams(location.search);
const qn = (k, d) => (Q.has(k) && Number.isFinite(+Q.get(k)) ? +Q.get(k) : d);

// First plates for a new visitor: seeds chosen by eye from contact sheets.
const PILOTS = [];

function hashKey() {
  if (location.hash.length < 2) return null;
  try { return WORLD.parse(decodeURIComponent(location.hash.slice(1))); } catch (e) { return null; }   // a mangled link is no link
}

function startKey() {
  const fromHash = hashKey();
  if (fromHash) return fromHash;
  if (Q.has('seed')) { const k = WORLD.parse(Q.get('seed')); if (k) return k; }
  const fresh = (Math.random() * 4294967296) >>> 0;
  if (PILOTS.length && !UI.store.plates.length) { const k = WORLD.parse(PILOTS[fresh % PILOTS.length]); if (k) return k; }
  return { base: fresh, change: 0, heir: mix32(fresh ^ 0x7f4a7c15), age: 0, gen: 0 };
}

function boot() {
  const canvas = $('view'), veilSub = $('veil-sub');
  const shot = Q.has('shot'), shotUi = shot && Q.has('ui');
  UI.load();
  if (shot && !shotUi) {
    // deterministic stills for the test harness: fixed size, no clock but ours
    document.body.classList.add('bleed', 'shot');
    canvas.width = qn('w', 640); canvas.height = qn('h', 360);
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${canvas.width}px;height:${canvas.height}px`;
  }
  if (shot) { ENG.fixed = true; ENG.fixedLayout = shotUi; ENG.started = true; }
  if (Q.has('nowebgl') || !ENG.init(canvas)) {
    veilSub.textContent = 'This browser cannot draw the worlds: it has no WebGL 2.';
    window.__ks = { error: 'nowebgl2' }; return;
  }
  ENG.debug = qn('debug', 0);
  if (Q.has('steps')) ENG.quality.steps = qn('steps', 96);
  if (GLX.caps.software && !shot) { ENG.budget = 0.07e6; ENG.budgetMax = 0.16e6; ENG.budgetMin = 0.04e6; ENG.quality = { steps: 72, reflect: 28, shadow: 18 }; }
  else if (matchMedia('(pointer: coarse)').matches) { ENG.budget = 0.3e6; ENG.budgetMax = 1.8e6; }   // phones and tablets start lower
  if (Q.has('mp')) ENG.budget = qn('mp', 0.3) * 1e6;
  ENG.fullQuality = { ...ENG.quality };

  const key = startKey();
  if (Q.has('change')) key.change = qn('change', 0) >>> 0;
  if (Q.has('form')) key.form = Q.get('form');
  if (Q.has('pal')) key.pal = Q.get('pal');
  ENG.journey.seed = qn('journey', (key.base ^ 0x5bd1e995) >>> 0);
  ENG.resize(true);
  ENG.goTo(key);

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // a stored choice wins; otherwise follow the system's reduced-motion setting without storing it
  if (UI.store.gentle === null) { ENG.gentle = !!reduce; $('b-gentle').setAttribute('aria-pressed', String(!!reduce)); }
  else UI.setGentle(UI.store.gentle);
  if (UI.store.bleed || (!shot && Math.min(innerWidth, innerHeight) < 430)) UI.setBleed(true);
  if (shot && !shotUi) document.body.classList.add('bleed');

  let offered = false;
  ENG.on.arrive = (w, kind) => {
    UI.arrive(w, kind);
    if (hasAudio && AUDIO.ready) AUDIO.enter(w.g.audio);
    if (!offered) { offered = true; if (shot) { $('veil').classList.add('gone'); UI.begun = true; } else UI.offer(); }
  };
  ENG.on.cross = (w, k) => { UI.arrive(w, k === 0 ? 'kin' : 'stranger'); if (hasAudio && AUDIO.ready) AUDIO.cross(w.g.audio); };
  ENG.on.doors = (cands) => { UI.doorsOpen(); if (hasAudio && AUDIO.ready) AUDIO.setDestinations(cands[0] && cands[0].g.audio, cands[1] && cands[1].g.audio); };
  ENG.on.choose = (k) => UI.chose(k);
  ENG.on.pulse = () => { if (hasAudio && AUDIO.ready) AUDIO.pulse(0.5); };
  ENG.on.event = (phase) => { if (hasAudio && AUDIO.ready) AUDIO.event(phase); };
  ENG.on.lost = () => { const v = $('veil'); v.className = ''; $('veil-go').hidden = true; $('veil-note').hidden = true; veilSub.textContent = 'one moment'; };
  ENG.on.restored = () => { if (UI.begun) $('veil').classList.add('open', 'gone'); else { offered = false; } };
  ENG.on.fail = (msg) => { const v = $('veil'); v.className = ''; $('veil-go').hidden = true; $('veil-note').hidden = true; veilSub.textContent = msg; };

  if (Q.has('debug')) $('stat').hidden = false;
  UI.wire();
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => ENG.resize(), 120); });
  // the caption changes height from plate to plate, and the picture above it must follow
  if (window.ResizeObserver && !shot) new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => ENG.resize(), 60); }).observe(canvas);
  // a link to another place, pasted into this tab
  window.addEventListener('hashchange', () => {
    const k = hashKey();
    if (k && ENG.cur && WORLD.code(k) !== WORLD.code(ENG.cur.key)) ENG.goTo(k, { kind: 'first', step: ENG.journey.step + 1 });
  });

  if (shot) {
    // window.__ks: advance(seconds) simulates with a fixed step and draws one frame
    const hooks = window.__ks = {
      ready: false, errors: ENG.errors,
      async wait() {
        for (let i = 0; i < 3000; i++) {
          ENG.step(0);
          if (ENG.cur && ENG.cur.prog.state === 'ready' && ENG.render()) { hooks.ready = true; return true; }
          if (!ENG.cur) return false;
          await new Promise((r) => setTimeout(r, 10));
        }
        return false;
      },
      advance(sec, dt = 1 / 20) { for (let t = 0; t < sec - 1e-6; t += dt) ENG.step(dt); return ENG.render(); },
      draw() { return ENG.render(); },
      look(yaw, pitch) { ENG.look.tyaw = ENG.look.yaw = yaw; ENG.look.tpitch = ENG.look.pitch = pitch; ENG.look.idle = 0; },
      choose(k) { ENG.choose(k); },
      info() {
        const w = ENG.cur; if (!w) return null;
        return { form: w.g.form, pal: w.g.pal.name, ta: +w.ta.toFixed(2), z: Math.round(w.z), doors: !!ENG.doors, step: ENG.journey.step, code: WORLD.code(w.key), name: w.g.name, line: w.g.line,
          set: w.g.set.type, ev: w.g.ev.type, change: w.g.changeType, left: ENG.doors ? (ENG.doors.z - w.z) / w.g.speed : undefined,
          cands: ENG.cand.map((c) => c && { form: c.g.form, pal: c.g.pal.name, name: c.g.name, state: c.prog.state }), rw: ENG.rw, rh: ENG.rh, compile: Math.round(w.prog.compileMs) };
      },
      // mean and max of the red channel: with ?debug=1 that is march cost * 255 / 200
      pixels() {
        const gl = ENG.gl, w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4);
        ENG.render(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let r = 0, g = 0, b = 0, mx = 0, black = 0, over = 0;
        for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; mx = Math.max(mx, px[i]); if (px[i] + px[i + 1] + px[i + 2] < 6) black++; if (px[i + 1] > 250) over++; }
        const n = w * h;
        return { r: r / n, g: g / n, b: b / n, max: mx, black: black / n, over: over / n };
      },
    };
    hooks.wait();
    return;
  }

  let last = performance.now();
  const loop = (now) => {
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.1, raw); last = now;
    try { ENG.step(dt); const drew = ENG.render(); ENG.govern(raw, drew); UI.frame(dt); }
    catch (e) { if (ENG.errors.length < 20) { ENG.errors.push(String(e && e.stack || e)); console.error(e); } }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ks = { errors: ENG.errors, info: () => ENG.cur && { name: ENG.cur.g.name, code: WORLD.code(ENG.cur.key), rw: ENG.rw, rh: ENG.rh, fps: ENG.stats.fps } };
}
window.addEventListener('error', (e) => { if (ENG.errors.length < 20) ENG.errors.push(String(e.message)); });
boot();
