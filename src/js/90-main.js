// ---------- start ----------
const Q = new URLSearchParams(location.search);
const qn = (k, d) => (Q.has(k) && Number.isFinite(+Q.get(k)) ? +Q.get(k) : d);
const $ = (id) => document.getElementById(id);

function boot() {
  const canvas = $('view');
  const shot = Q.has('shot');
  if (shot) {
    // deterministic stills for the test harness: fixed size, no clock but ours
    document.body.classList.add('bleed');
    canvas.width = qn('w', 640); canvas.height = qn('h', 360);
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${canvas.width}px;height:${canvas.height}px`;
    ENG.fixed = true;
  }
  if (!ENG.init(canvas)) { $('veil-sub').textContent = 'this browser cannot draw the worlds (WebGL 2 is missing)'; window.__ks = { error: 'nowebgl2' }; return; }
  ENG.debug = qn('debug', 0);
  if (Q.has('steps')) ENG.quality.steps = qn('steps', 96);
  ENG.resize(true);
  const seed = Q.has('seed') ? (codeToSeed(Q.get('seed')) ?? 1) : (Math.random() * 4294967296) >>> 0;
  ENG.journey.seed = qn('journey', seed);
  const key = { base: seed, change: qn('change', 0) >>> 0, heir: seed, age: 0, gen: 0 };
  if (Q.has('form')) key.form = Q.get('form');
  if (Q.has('pal')) key.pal = Q.get('pal');
  ENG.goTo(key);

  ENG.on.arrive = (w) => { $('veil').classList.add('gone'); };
  window.addEventListener('resize', () => ENG.resize());

  if (shot) {
    // window.__ks: stepTo(seconds) simulates with a fixed step and draws one frame
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
      stepTo(t, dt = 1 / 20) {
        while (ENG.cur && ENG.cur.ta + ENG.journeyClockOffset() < t - 1e-6) ENG.step(Math.min(dt, t - ENG.cur.ta - ENG.journeyClockOffset()));
        return ENG.render();
      },
      advance(sec, dt = 1 / 20) { for (let t = 0; t < sec - 1e-6; t += dt) ENG.step(dt); return ENG.render(); },
      draw() { return ENG.render(); },
      look(yaw, pitch) { ENG.look.tyaw = ENG.look.yaw = yaw; ENG.look.tpitch = ENG.look.pitch = pitch; ENG.look.idle = 0; },
      info() {
        const w = ENG.cur; if (!w) return null;
        return { form: w.g.form, pal: w.g.pal.name, ta: w.ta, z: w.z, doors: !!ENG.doors, step: ENG.journey.step, key: w.key, name: w.g.name, line: w.g.line, set: w.g.set.type, ev: w.g.ev.type,
          cands: ENG.cand.map((c) => c && { form: c.g.form, pal: c.g.pal.name, state: c.prog.state }), rw: ENG.rw, rh: ENG.rh, compile: w.prog.compileMs };
      },
      // mean and max of the red channel: with ?debug=1 that is march cost / 200
      pixels() {
        const gl = ENG.gl, w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4);
        ENG.render(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let r = 0, g = 0, b = 0, mx = 0, black = 0, over = 0;
        for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; mx = Math.max(mx, px[i]); if (px[i] + px[i + 1] + px[i + 2] < 6) black++; if (px[i + 1] > 250 && px[i] < 5) over++; }
        const n = w * h;
        return { r: r / n, g: g / n, b: b / n, max: mx, black: black / n, over: over / n };
      },
    };
    ENG.journeyClockOffset = () => 0;
    hooks.wait();
    return;
  }

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    ENG.step(dt); ENG.render(); ENG.govern(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.addEventListener('error', (e) => { ENG.errors.push(String(e.message)); });
boot();
