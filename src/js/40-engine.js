// ---------- the engine ----------
// Draws one world, the views through its two portals, and carries the viewer
// from one world into the next. The worlds themselves come from WORLD.make().
const ENG = {
  gl: null, canvas: null,
  cw: 2, ch: 2,            // canvas backing store
  rw: 2, rh: 2,            // size of the world pass (the plate is printed small, then enlarged)
  budget: 0.45e6,          // pixels in the world pass; the governor moves this
  budgetMax: 3.2e6, budgetMin: 0.1e6,
  quality: { steps: 96, reflect: 44, shadow: 26 },
  progs: new Map(),        // form name -> program, kept for the session
  badForms: new Set(),
  cur: null,               // the world we are in
  cand: [null, null],      // kin, stranger: the worlds behind the portals
  doors: null,             // { z, born, chosen, auto } once the portals are open
  look: { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, idle: 9 },
  camOff: [0, 0], roll: 0, carry: [0, 0], focalFrom: 0,
  fade: 0, fadeInk: [0, 0, 0],
  clock: 0, frame: 0, paused: false, gentle: false, started: false, linger: false, hurry: false,
  journey: { seed: 1, step: 0, kinRun: 0, plates: [] },
  on: {},                  // callbacks: arrive(world), doors(open), choose(k), cross(world), fail(msg)
  stats: { fps: 0, ms: 0, compileMs: 0, px: 0, cost: 0 },
  errors: [],
  debug: 0, fixed: false,

  init(canvas) {
    const gl = GLX.init(canvas);
    if (!gl) return false;
    this.gl = gl; this.canvas = canvas;
    // one lattice of random bytes drives all noise; fixed seed so every device agrees
    const r = rngFrom(0x51ced), bytes = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (r() * 256) | 0;
    this.noise = GLX.dataTexture(256, bytes, { linear: true });
    this.dummy = GLX.dataTexture(1, new Uint8Array([0, 0, 0, 255]), { linear: false });
    const head = '#version 300 es\n';
    this.post = {
      pre: GLX.program(head + GLSL['post/glowpre'], 'glowpre'),
      blur: GLX.program(head + GLSL['post/blur'], 'blur'),
      fin: GLX.program(head + GLSL['post/final'], 'final'),
    };
    if (!this.bound) {                                    // once only: rebuild() comes back through here
      this.bound = true;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); GLX.lost = true; if (this.on.lost) this.on.lost(); });
      canvas.addEventListener('webglcontextrestored', () => { GLX.lost = false; this.rebuild(); });
    }
    return true;
  },

  // after a lost context every GL object is gone; worlds are rebuilt from their keys
  rebuild() {
    const old = this.cur;
    // nothing a lost context did to a shader says anything about the shader
    this.progs.clear(); this.badForms.clear(); this.tg = null; this.warmed = false;
    this.init(this.canvas); this.resize(true);
    if (old) {
      const w = this.goTo(old.key, { quiet: true, kind: 'again' });
      w.t = old.t; w.ta = old.ta; w.z = old.z;               // the visit carries on from where it was
    }
    if (this.on.restored) this.on.restored();
  },

  programFor(form) {
    let p = this.progs.get(form);
    if (!p) {
      const src = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
        GLSL['a-head'] + '\n' + GLSL['forms/' + form] + '\n' + GLSL['z-main'];
      p = GLX.program(src, form);
      this.progs.set(form, p);
    }
    return p;
  },
  compiling() { for (const p of this.progs.values()) if (p.state === 'compiling') return true; return false; },

  // Compile every form's program, one at a time, as soon as the first world is on
  // screen. Most of this happens behind the start veil, so by the time a portal
  // needs a program it is already built and has been drawn with once.
  warm() {
    if (this.warmed || this.compiling() || !this.tg) return;
    for (const name of WORLD.formNames()) {
      if (this.badForms.has(name) || (FORMS[name].weight ?? 1) <= 0) continue;   // unfinished forms are never picked
      const had = this.progs.has(name), p = this.programFor(name);
      if (!had) return;                                    // just started: come back when it is done
      if (p.state === 'failed') { this.badForms.add(name); if (this.errors.length < 20) this.errors.push('form ' + name + ': ' + (p.error || 'failed')); continue; }
      if (p.state === 'ready' && !p.drawn) {
        // one pixel through the real pipeline, so the driver finishes its own late work now
        const rec = this.makeRecord({ base: 0x1234567, change: 0, heir: 1, age: 0, form: name });
        const cam = { pos: [0, rec.g.path.y0, 0], right: [1, 0, 0], up: [0, 1, 0], fwdUser: [0, 0, 1], fwd: [0, 0, 1], focal: 2, aspect: 1 };
        this.setWorld(rec, cam, { clip: [0, 0, 1, 0] });
        GLX.draw(this.tg.p0, this.rw, this.rh, [0, 0, 1, 1]);
        p.drawn = true;
      }
    }
    this.warmed = true;
  },

  // ---- sizes ----
  resize(force) {
    const c = this.canvas;
    let cw, ch;
    if (this.fixed && !this.fixedLayout) { cw = c.width; ch = c.height; }
    else {
      const dpr = this.fixed ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const box = c.getBoundingClientRect();
      cw = Math.max(2, Math.round(box.width * dpr)); ch = Math.max(2, Math.round(box.height * dpr));
      const cap = 3.7e6 / (cw * ch);
      if (cap < 1) { cw = Math.round(cw * Math.sqrt(cap)); ch = Math.round(ch * Math.sqrt(cap)); }
      if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    }
    // with power to spare the plate is drawn larger than the screen and reduced, which smooths its edges
    const s = this.fixed ? 1 : Math.min(1.42, Math.sqrt(this.budget / (cw * ch)));
    const rw = Math.max(2, Math.round(cw * s / 2) * 2), rh = Math.max(2, Math.round(ch * s / 2) * 2);
    if (!force && this.tg && rw === this.rw && rh === this.rh && cw === this.cw && ch === this.ch) return;
    this.cw = cw; this.ch = ch; this.rw = rw; this.rh = rh;
    if (this.tg) for (const k in this.tg) GLX.freeTarget(this.tg[k]);
    const o = { hdr: false, linear: true };
    const gw = Math.max(2, rw >> 2), gh = Math.max(2, rh >> 2);
    this.tg = {
      scene: GLX.target(rw, rh, o), p0: GLX.target(rw, rh, { hdr: false, linear: false }), p1: GLX.target(rw, rh, { hdr: false, linear: false }),
      ga: GLX.target(gw, gh, o), gb: GLX.target(gw, gh, o),
    };
    this.stats.px = rw * rh;
  },

  // ---- journeys ----
  makeRecord(key) {
    const g = WORLD.make(key);
    return { key, g, prog: this.programFor(g.form), t: 0, ta: 0, z: 0, warmed: false, live: null };
  },
  // Go straight to a world, with a fade. Used at the start, for jumps and after failures.
  goTo(key, opts = {}) {
    this.cur = this.makeRecord(key);
    this.cur.z = 0; this.cur.ta = 0;
    this.cand = [null, null]; this.doors = null;
    this.camOff = [0, 0]; this.carry = [0, 0]; this.focalFrom = 0; this.look.yaw = this.look.pitch = this.look.tyaw = this.look.tpitch = 0;
    this.fade = 0; this.arrived = false; this.hurry = false;
    this.arrivalKind = opts.kind || 'first';
    if (!opts.quiet) { this.journey.step = opts.step || 0; }
    return this.cur;
  },
  childKeys(w) {
    const j = this.journey, k = w.key;
    const r = stream(mix32(j.seed ^ Math.imul(j.step + 1, 0x9e3779b1)), 'next');
    const kin = { base: k.base, change: mix32((k.change || 0) + 0x632be5ab + j.step) || 1, heir: k.heir, age: (k.age || 0) + 1, gen: (k.gen || 0) + 1, form: k.form };
    let base = (r() * 4294967296) >>> 0;
    const keepHeir = r() < 0.4;
    const stranger = { base, change: 0, heir: keepHeir ? k.heir : (r() * 4294967296) >>> 0, age: keepHeir ? (k.age || 0) + 1 : 0, gen: (k.gen || 0) + 1 };
    return [kin, stranger];
  },
  prepareCandidates() {
    const [kk, sk] = this.childKeys(this.cur);
    let kin = this.makeRecord(kk);
    // a kin should differ from this place in a new way, not repeat the last change
    for (let i = 0; i < 4 && kin.g.changeType === this.cur.g.changeType; i++) { kk.change = mix32(kk.change + 7919) || 1; kin = this.makeRecord(kk); }
    let stranger = this.makeRecord(sk);
    // a stranger is a different kind of place, and never a form whose shader failed on this device
    let tries = 0;
    const usable = WORLD.formNames().filter((n) => !this.badForms.has(n) && (FORMS[n].weight ?? 1) > 0).length;
    while ((this.badForms.has(stranger.g.form) || (usable > 1 && stranger.g.form === this.cur.g.form)) && tries++ < 16) { sk.base = mix32(sk.base + 977); stranger = this.makeRecord(sk); }
    this.cand = [kin, stranger];
  },

  // ---- per frame ----
  step(dt) {
    const w = this.cur;
    if (!w) return;
    const st = GLX.ready(w.prog);
    for (const p of this.progs.values()) {
      if (p.state === 'compiling') {
        GLX.ready(p);
        if (GLX.lost) p.started = performance.now();          // the clock does not run while the context is gone
        else if (p.state === 'compiling' && performance.now() - p.started > 25000) { p.state = 'failed'; p.error = 'compile timed out'; }
      }
    }
    if (st === 'failed') { this.failWorld(w); return; }
    if (st !== 'ready') return;
    this.warm();
    if (!this.arrived) { this.arrived = true; if (this.on.arrive) this.on.arrive(w, this.arrivalKind || 'first'); }
    this.fade = Math.min(1, this.fade + dt / 2.2);         // a plate fades in even while paused
    if (this.paused) dt = 0;
    this.clock += dt; this.frame++;
    const g = w.g;
    w.t += dt; w.ta += dt;
    if (!this.started) w.ta = Math.min(w.ta, 0.5);          // behind the veil the visit has not begun
    for (const c of this.cand) if (c) c.t += dt;

    // candidates: made a few seconds in, opened when both shaders are ready
    if (!this.cand[0] && w.ta > 3) this.prepareCandidates();
    if (this.cand[0] && !this.doors) {
      for (let k = 0; k < 2; k++) {
        const c = this.cand[k], s = GLX.ready(c.prog);
        if (s === 'failed') { this.badForms.add(c.g.form); const keys = this.childKeys(w); keys[1].base = mix32(keys[1].base + 31 * this.badForms.size + w.ta * 1000); this.cand[k] = this.makeRecord(k ? keys[1] : keys[0]); }
      }
      const ready = this.cand.every((c) => c.prog.state === 'ready');
      if (ready && (w.ta > g.doorsAt || this.hurry) && !this.linger) this.openDoors();
    }

    // flight
    let pace = 1;
    if (this.hurry && this.doors) pace = 3.2;
    const z0 = w.z;
    w.z += g.speed * pace * dt;
    if (g.pulse > 0 && Math.floor(w.z / g.pulse) !== Math.floor(z0 / g.pulse) && this.on.pulse) this.on.pulse(w);
    const ev = g.ev;
    if (ev.type !== 'none' && this.on.event) {
      if (w.ta >= ev.t0 && w.ta - dt < ev.t0) this.on.event('start', w);
      if (w.ta >= ev.t0 + ev.dur && w.ta - dt < ev.t0 + ev.dur) this.on.event('peak', w);
    }

    // looking around: springs back to the line of flight when left alone
    const L = this.look;
    L.idle += dt;
    if (L.idle > 2.2) { L.tyaw = damp(L.tyaw, 0, 0.9, dt); L.tpitch = damp(L.tpitch, 0, 0.9, dt); }
    L.yaw = damp(L.yaw, L.tyaw, 5, dt); L.pitch = damp(L.pitch, L.tpitch, 5, dt);

    if (this.doors) this.stepDoors(dt);
    // nobody can stay for ever: far from the origin the numbers that draw the place lose their fineness
    if (w.z > 9000) this.linger = false;
  },

  openDoors() {
    const w = this.cur, g = w.g;
    const ahead = g.speed * 15;
    let z = w.z + ahead;
    if (g.door.snap) {                                     // keep clear of bridges and the like
      const [per, ph] = g.door.snap;
      let zs = (Math.floor((z - ph) / per) + 0.5) * per + ph;
      if (zs < z - 0.25 * per) zs += per;
      z = zs;
    }
    const p = WORLD.pathAt(g, z);
    const mk = (o) => ({ c: [p[0] + o[0], p[1] + o[1], z], r: g.door.r });
    // whatever offset was still easing away after the last crossing is taken as it stands
    const eased = Math.exp(-Math.max(0, w.ta) * 0.9);
    this.camOff = [this.camOff[0] * eased, this.camOff[1] * eased];
    // hands-off, the flight looks once more at each place, changed, and then moves on
    const auto = this.journey.kinRun >= 1 ? 1 : 0;
    this.doors = { z, born: w.ta, auto, chosen: auto, picked: false, d: [mk(g.door.kin), mk(g.door.stranger)], open: 0, gaze: [0, 0] };
    for (const c of this.cand) { c.t = 0; c.ta = 0; }
    this.hurry = false;
    if (this.on.doors) this.on.doors(this.cand);
  },

  stepDoors(dt) {
    const w = this.cur, g = w.g, D = this.doors;
    D.open = Math.min(1, D.open + dt / 3.5);
    const left = D.z - w.z;
    // turning to face a portal for a moment chooses it
    const cam = this.camera(w);
    for (let k = 0; k < 2; k++) {
      const to = V.norm(V.sub(D.d[k].c, cam.pos));
      const facing = V.dot(to, cam.fwdUser);
      D.gaze[k] = damp(D.gaze[k], smooth(0.955, 0.995, facing), 3, dt);
    }
    // only once the doors are open enough to tell apart, and only when one is plainly meant
    if (this.look.idle < 2.2 && left > g.speed * 2.5 && D.open > 0.6 && Math.abs(D.gaze[0] - D.gaze[1]) > 0.2) {
      const pick = D.gaze[0] > 0.6 && D.gaze[0] > D.gaze[1] ? 0 : D.gaze[1] > 0.6 ? 1 : -1;
      if (pick >= 0) this.choose(pick);
    }
    // the line of flight bends to pass through the centre of the chosen portal
    const o = D.chosen === 0 ? g.door.kin : g.door.stranger;
    const pull = 1 - smooth(g.speed * 2.5, g.speed * (g.door.from || 10), left);
    this.camOff[0] = damp(this.camOff[0], o[0] * pull, 2.5, dt);
    this.camOff[1] = damp(this.camOff[1], o[1] * pull, 2.5, dt);
    if (left <= g.speed * 0.004) this.cross();             // a hair early: on the plane itself the door has no depth
  },

  cross() {
    const D = this.doors, w = this.cur, k = D.chosen;
    const camA = this.camera(w);
    const next = this.cand[k];
    const C = D.d[k].c, E = WORLD.pathAt(next.g, 0);
    // both worlds fly along +z and portals face +z, so the mapping is a translation
    next.z = camA.pos[2] - C[2];
    this.camOff = [camA.pos[0] - C[0], camA.pos[1] - C[1]];
    next.ta = 0;
    this.journey.step++;
    this.journey.kinRun = k === 0 ? this.journey.kinRun + 1 : 0;
    this.cur = next; this.cand = [null, null]; this.doors = null; this.hurry = false;
    void E;
    this.carry = [0, 0]; this.focalFrom = 0;
    const camB = this.camera(next);
    this.focalFrom = camA.focal / (camB.focal / next.g.focal);   // the lens the door was seen through
    const fB = camB.fwd, fA = camA.fwd;
    let dy = Math.atan2(fA[0], fA[2]) - Math.atan2(fB[0], fB[2]);
    if (dy > Math.PI) dy -= TAU; else if (dy < -Math.PI) dy += TAU;
    this.carry = [dy, Math.asin(clamp(fA[1], -1, 1)) - Math.asin(clamp(fB[1], -1, 1))];
    if (this.on.cross) this.on.cross(next, k);
  },
  choose(k) {
    const D = this.doors;
    if (!D || !this.cand[k] || D.z - this.cur.z < this.cur.g.speed * 2.5) return;
    if (D.chosen !== k) { D.chosen = k; D.picked = true; if (this.on.choose) this.on.choose(k); }
  },

  failWorld(w) {
    this.badForms.add(w.g.form);
    if (this.errors.length < 20) this.errors.push('world ' + w.g.form + ': ' + (w.prog.error || 'failed'));
    const usable = WORLD.formNames().filter((n) => (FORMS[n].weight ?? 1) > 0);
    if (usable.every((n) => this.badForms.has(n))) { if (this.on.fail) this.on.fail('This device could not draw any of the places.'); this.cur = null; return; }
    let key = { ...w.key }, tries = 0, rec;
    do { key.base = mix32(key.base + 1013); key.change = 0; rec = this.makeRecord(key); } while (this.badForms.has(rec.g.form) && tries++ < 40);
    this.cur = rec; this.cand = [null, null]; this.doors = null; this.arrived = false;
  },

  // ---- camera ----
  camera(w) {
    const g = w.g, z = w.z;
    const p = WORLD.pathAt(g, z);
    const settle = Math.exp(-Math.max(0, w.ta) * 0.9);     // offsets carried through a portal ease away
    const off = this.doors ? this.camOff : [this.camOff[0] * settle, this.camOff[1] * settle];
    const pos = [p[0] + off[0], p[1] + off[1], z];
    const lead = g.lead;
    const q = WORLD.pathAt(g, z + lead);
    let tgt = [q[0], q[1] + g.tilt * lead, z + lead];
    // attention drifts to the set piece as it comes up, then lets go
    const live = w.live || (w.live = WORLD.live(g, w.ta, w.t));
    if (g.set.type && g.set.attend > 0) {
      const sp = [live.set[0], live.set[1] + g.set.eye * g.set.scale, live.set[2]];
      const dz = sp[2] - z;
      const a = g.set.attend * smooth(g.speed * 16, g.speed * 9, dz) * smooth(g.set.scale * 1.2, g.set.scale * 5, dz);
      const dir = V.norm(V.sub(sp, pos)), base = V.norm(V.sub(tgt, pos));
      tgt = V.add(pos, V.norm(V.mix(base, dir, a)));
    }
    if (this.doors) {
      const D = this.doors, c = D.d[D.chosen].c, left = D.z - z;
      const a = 0.75 * smooth(g.speed * 13, g.speed * 5, left) * D.open;
      // aim through the door at a point well beyond it: aiming at its centre has no meaning at the threshold
      const dir = V.norm(V.sub([c[0], c[1], c[2] + 30], pos)), base = V.norm(V.sub(tgt, pos));
      tgt = V.add(pos, V.norm(V.mix(base, dir, a)));
    }
    let f = V.norm(V.sub(tgt, pos));
    // the heading carried through the last portal eases into this world's own line
    const cy = this.carry[0] * settle, cp = this.carry[1] * settle;
    const by = Math.atan2(f[0], f[2]) + cy, bp = clamp(Math.asin(clamp(f[1], -1, 1)) + cp, -1.2, 1.2);
    const fwdBase = [Math.sin(by) * Math.cos(bp), Math.sin(bp), Math.cos(by) * Math.cos(bp)];
    // the viewer's own look, on top
    const L = this.look;
    const yaw = by + L.yaw, pitch = clamp(bp + L.pitch, -1.3, 1.3);
    f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    // bank a little into the bends of the line
    const bend = (WORLD.pathAt(g, z + 30)[0] - 2 * WORLD.pathAt(g, z + 15)[0] + p[0]) / 225;
    const roll = this.gentle ? 0 : clamp(bend * g.speed * g.speed * 0.02, -0.12, 0.12);
    let r = V.norm(V.cross([0, 1, 0], f));                 // +x is to the right of the picture
    let u = V.cross(f, r);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2 = V.add(V.mul(r, cr), V.mul(u, sr)), u2 = V.sub(V.mul(u, cr), V.mul(r, sr));
    const aspect = this.rw / this.rh;
    const lens = this.focalFrom ? mix(g.focal, this.focalFrom, settle) : g.focal;   // eases from the last world's lens
    const focal = lens * (aspect < 1.2 ? Math.pow(aspect / 1.2, 0.55) : 1);
    return { pos, fwd: fwdBase, fwdUser: f, right: r2, up: u2, focal, aspect };
  },

  // ---- drawing ----
  setWorld(w, cam, { clip = null, doors = null, steps } = {}) {
    const g = w.g, gl = this.gl;
    const live = w.live = WORLD.live(g, w.ta, w.t);
    GLX.use(w.prog);
    GLX.tex('uNoise', 0, this.noise);
    GLX.v2('uRes', this.rw, this.rh);
    GLX.v3('uCamP', cam.pos); GLX.v3('uCamR', cam.right); GLX.v3('uCamU', cam.up);
    GLX.v3('uCamF', V.mul(cam.fwdUser, cam.focal));
    GLX.f('uPix', 2 / (this.rh * cam.focal));
    GLX.f('uTime', w.t % 3600); GLX.i('uZero', 0);
    GLX.v3v('uInk[0]', live.inks);
    GLX.v3('uSunDir', live.sunDir);
    GLX.v4('uSun', ...live.sun); GLX.v4('uAir', ...live.air); GLX.v4('uSea', ...live.sea);
    GLX.v4('uPathA', g.path.ax, g.path.fx, g.path.px, g.path.ay);
    GLX.v4('uPathB', g.path.fy, g.path.py, g.path.y0, 0);
    GLX.fv('uTr[0]', live.tr);
    GLX.v4('uSet', live.set[0], live.set[1], live.set[2], g.set.scale);
    GLX.v4('uSetK', g.set.type, g.set.yaw, live.setMotion, live.setLit);
    GLX.v4('uEv', live.ev, g.ev.id, live.cover, 0);
    GLX.v4('uSky', ...live.sky);
    gl.uniform4fv(GLX.loc('uBody[0]') || null, live.body);
    gl.uniform4fv(GLX.loc('uBodyK[0]') || null, live.bodyK);
    GLX.v4('uPart', ...live.part);
    { const f = V.norm(g.fill); GLX.v4('uFill', f[0], f[1], f[2], g.fill[3]); }
    if (clip) { GLX.v4('uClip', clip[0], clip[1], clip[2], clip[3]); GLX.f('uClipOn', 1); } else GLX.f('uClipOn', 0);
    const pc = new Float32Array(8), pn = new Float32Array(8), pk = new Float32Array(6);
    if (doors) {
      for (let k = 0; k < 2; k++) {
        const d = doors.d[k];
        pc.set([d.c[0], d.c[1], d.c[2], d.r], k * 4);
        pn.set([0, 0, 1, doors.open * (0.9 + 0.1 * Math.sin(w.t * 0.7 + k * 2))], k * 4);
        const ink = this.cand[k] ? this.cand[k].g.doorInk : [1, 1, 1];
        const hot = doors.chosen === k ? 1 : 0.72;
        pk.set([ink[0] * hot, ink[1] * hot, ink[2] * hot], k * 3);
      }
      GLX.tex('uPortTex0', 1, this.tg.p0.tex); GLX.tex('uPortTex1', 2, this.tg.p1.tex);
    } else {
      GLX.tex('uPortTex0', 1, this.dummy); GLX.tex('uPortTex1', 2, this.dummy);
    }
    gl.uniform4fv(GLX.loc('uPortC[0]') || null, pc);
    gl.uniform4fv(GLX.loc('uPortN[0]') || null, pn);
    gl.uniform3fv(GLX.loc('uPortInk[0]') || null, pk);
    const q = this.quality;
    GLX.v4('uQ', steps || q.steps, q.reflect, q.shadow, this.debug);
  },

  // screen rectangle that contains a portal, in pixels of the world pass; null when off screen
  doorRect(cam, d, open) {
    const R = d.r * open * 1.06;
    if (R <= 0.01) return null;
    const v = V.sub(d.c, cam.pos);
    const depth = V.dot(v, cam.fwdUser);
    if (V.len(v) < R * 2.2) return [0, 0, this.rw, this.rh];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, p = [v[0] + Math.cos(a) * R * 1.09, v[1] + Math.sin(a) * R * 1.09, v[2]];
      const zc = V.dot(p, cam.fwdUser);
      if (zc < 0.2) { if (depth < 0) return null; return [0, 0, this.rw, this.rh]; }
      const x = (V.dot(p, cam.right) * cam.focal / zc) * this.rh / 2 + this.rw / 2;
      const y = (V.dot(p, cam.up) * cam.focal / zc) * this.rh / 2 + this.rh / 2;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
    x1 = Math.min(this.rw, Math.ceil(x1) + 2); y1 = Math.min(this.rh, Math.ceil(y1) + 2);
    if (x1 <= x0 || y1 <= y0) return null;
    return [x0, y0, x1 - x0, y1 - y0];
  },

  render() {
    const gl = this.gl, w = this.cur;
    if (!w || w.prog.state !== 'ready' || GLX.lost) return false;
    for (const k in this.post) if (GLX.ready(this.post[k]) !== 'ready') return false;
    const cam = this.camera(w), D = this.doors;
    // 1. what lies through each portal, only where the portal is on screen
    if (D) {
      for (let k = 0; k < 2; k++) {
        const c = this.cand[k], rect = this.doorRect(cam, D.d[k], D.open);
        if (!c || !rect) continue;
        const E = WORLD.pathAt(c.g, 0), C = D.d[k].c;
        const camB = { ...cam, pos: [cam.pos[0] - C[0] + E[0], cam.pos[1] - C[1] + E[1], cam.pos[2] - C[2]] };
        const far = rect[2] * rect[3] < this.rw * this.rh * 0.04;
        this.setWorld(c, camB, { clip: [0, 0, 1, 0], steps: far ? Math.round(this.quality.steps * 0.6) : 0 });
        GLX.draw(k ? this.tg.p1 : this.tg.p0, this.rw, this.rh, rect);
      }
    }
    // 2. the world itself
    this.setWorld(w, cam, { doors: D });
    GLX.draw(this.tg.scene, this.rw, this.rh);
    // 3. glow: quarter size, blurred twice
    const ga = this.tg.ga, gb = this.tg.gb;
    GLX.use(this.post.pre); GLX.tex('uSrc', 0, this.tg.scene.tex); GLX.v2('uTexel', 1 / ga.w, 1 / ga.h); GLX.draw(ga, ga.w, ga.h);
    GLX.use(this.post.blur);
    for (let i = 0; i < 2; i++) {
      GLX.tex('uSrc', 0, ga.tex); GLX.v2('uTexel', 1 / ga.w, 1 / ga.h); GLX.v2('uDir', 1 + i, 0); GLX.draw(gb, gb.w, gb.h);
      GLX.tex('uSrc', 0, gb.tex); GLX.v2('uDir', 0, 1 + i); GLX.draw(ga, ga.w, ga.h);
    }
    // 4. to the screen
    GLX.use(this.post.fin);
    GLX.tex('uSrc', 0, this.tg.scene.tex); GLX.tex('uGlow', 1, ga.tex); GLX.tex('uNoise', 2, this.noise);
    GLX.v2('uOut', this.cw, this.ch); GLX.v2('uSrcSize', this.rw, this.rh);
    GLX.v4('uK', 0.9, this.debug ? 0 : 0.05, this.fixed ? 1 : this.fade, this.debug);
    GLX.v3('uFadeInk', w.g.pal.paper);
    GLX.draw(null, this.cw, this.ch);
    return true;
  },

  // ---- the governor ----
  // Holds the frame rate by changing how many pixels are marched. It aims at the
  // display's own rate, sixty a second unless it learns otherwise, and takes care
  // not to mistake its own slowness for the display's.
  gov: { acc: 0, n: 0, hold: 0, wait: 2, period: 1 / 60, idle: [], drop: null, calm: 0 },
  govern(dt, drew) {
    const G = this.gov;
    if (this.fixed) return;
    if (!drew) {
      // frames in which nothing was drawn (shaders still compiling) show the display's true interval
      if (dt > 0.003 && dt < 0.05) {
        G.idle.push(dt);
        if (G.idle.length >= 12) { G.period = clamp(G.idle.slice().sort((x, y) => x - y)[6], 1 / 144, 1 / 30); G.idle.length = 0; }
      }
      G.acc = 0; G.n = 0; return;
    }
    if (this.paused || this.compiling() || dt > 0.5) { G.acc = 0; G.n = 0; return; }
    G.acc += dt; G.n++;
    if (G.acc < 0.8) return;
    const avg = G.acc / G.n; G.acc = 0; G.n = 0;
    this.stats.fps = 1 / avg;
    const target = Math.max(G.period * 1.12, 1 / 58);
    if (G.drop) {
      // a cut in pixels that bought no time means something else sets this pace (a display
      // held at thirty, say): take the pixels back and stop chasing it
      const d = G.drop; G.drop = null;
      if (avg > d.avg * 0.93 && avg < 0.06) {
        this.budget = d.budget; G.period = clamp(avg, G.period, 1 / 24); G.hold = 0; this.resize(); return;
      }
    }
    if (avg > target * 1.18) {
      // at the floor already: give up reflections of the scene and some shadow detail before anything else
      if (this.budget <= this.budgetMin * 1.01 && !this.lite) { this.lite = true; this.quality = { steps: Math.min(this.quality.steps, 80), reflect: 0, shadow: 14 }; }
      const before = this.budget;
      this.budget = Math.max(this.budgetMin, this.budget * (avg > target * 1.8 ? 0.6 : 0.82));
      if (this.budget < before * 0.9) G.drop = { avg, budget: before };
      G.hold = 0; G.calm = 0; G.wait = Math.min(G.wait * 1.6, 40);
      this.resize();
    } else if (avg < target * 1.04) {
      G.hold += 0.8; G.calm += 0.8;
      if (G.calm > 30) {                                     // a long quiet spell: be quicker to try for more again
        G.calm = 0; G.wait = Math.max(2, G.wait * 0.7);
        if (this.lite && this.budget > this.budgetMin * 3) { this.lite = false; this.quality = { ...this.fullQuality }; }
        if (G.period > 1 / 58) G.period = Math.max(1 / 60, G.period * 0.9);   // and test now and then whether the display has sped up
      }
      if (G.hold >= G.wait && this.budget < this.budgetMax && this.rw < this.cw * 1.4) {
        this.budget = Math.min(this.budgetMax, this.budget * 1.15); G.hold = 0; this.resize();
      }
    } else G.hold = 0;
  },
};
