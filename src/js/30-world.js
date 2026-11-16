// ---------- worlds ----------
// A world is a pure function of its key { base, change, heir, age }.
//   base    the place itself: its form, layout, set piece, event
//   change  0 for the place as first found; otherwise how this kin differs
//   heir    something handed down a line of worlds (a moon, a tune)
// Every trait draws from its own named stream, so new traits never disturb old ones.
const FORMS = {};
const WORLD = {
  formNames() { return Object.keys(FORMS); },

  pathAt(g, z) {
    const p = g.path;
    return [p.ax * Math.sin(z * p.fx + p.px), p.y0 + p.ay * Math.sin(z * p.fy + p.py)];
  },

  make(key) {
    const base = key.base >>> 0;
    const S = (label) => stream(base, label);
    const g = {
      key, form: null,
      tr: new Float32Array(16),
      path: { ax: 0, fx: 0, px: 0, ay: 0, fy: 0, py: 0, y0: 6 },
      speed: 14, lead: 60, tilt: 0, focal: 2.05,
      sunAz: 0.6, sunEl: 0.35, sun: [0.03, 1, 3, 9],
      air: [0.0016, 6, -100, 0], sea: [0, 0, 1, 0],
      set: { type: 0, pos: [0, 0, 0], scale: 10, yaw: 0, attend: 0.6, eye: 2.5, move: 0, lit: 0 },
      ev: { id: 0, type: 'none', t0: 22, dur: 16 },
      sky: [0.3, 1, 0, 0],
      body: new Float32Array(8), bodyK: new Float32Array(8),
      part: [0, 0, 0, 1],
      door: { r: 7, kin: [0, 0], stranger: [0, 0] }, doorsAt: 44,
      facts: {},
    };
    // 1. the place
    const formPick = S('form');
    const names = Object.keys(FORMS);
    g.form = key.form && FORMS[key.form] ? key.form : formPick.weighted(names.map((n) => [n, FORMS[n].weight || 1]));
    const F = FORMS[g.form];
    // 2. its inks and its hour
    const pr = S('ink');
    const pool = PALETTES.filter((p) => !F.hours || F.hours.includes(p.hour));
    g.pal = key.pal && PALETTE_BY_NAME[key.pal] ? PALETTE_BY_NAME[key.pal] : pr.pick(pool);
    WORLD.light(g, S('light'));
    // 3. the form lays out its ground, set piece and event
    F.build(g, S);
    // 4. kin: the same place, changed
    if (key.change) WORLD.change(g, key.change >>> 0);
    g.inks = g.pal;
    g.inkFlat = new Float32Array(24);
    INK_KEYS.forEach((k, i) => g.inkFlat.set(g.pal[k], i * 3));
    g.doorInk = V.mix(g.pal.glow, g.pal.low, 0.35);
    return g;
  },

  // Sun or moon, sky furniture, weather: decided from the palette's hour.
  light(g, r) {
    const hour = g.pal.hour;
    const side = r.chance(0.5) ? 1 : -1;
    if (hour === 1) { g.sunAz = side * r.range(0.12, 0.5); g.sunEl = r.range(0.05, 0.16); g.sun = [0.045, 1.6, 3, 10]; }
    else if (hour === 2) { g.sunAz = side * r.range(0.5, 1.1); g.sunEl = r.range(0.42, 0.85); g.sun = [0.026, 0.7, 3, 14]; }
    else { g.sunAz = side * r.range(0.25, 0.8); g.sunEl = r.range(0.3, 0.6); g.sun = [0.05, 0.9, 2, 12]; }
    g.sky = [r.chance(0.7) ? r.range(0.2, 0.75) : 0, r.range(0.7, 1.6), hour === 0 ? r.range(0.6, 1) : (hour === 1 ? r.range(0, 0.35) : 0), r.chance(0.55) ? r.range(0.03, 0.09) : 0];
    g.air = [r.range(0.0011, 0.0026), r.int(5, 8), -100, 0];
  },

  change(g, change) {
    // filled in with the kin transformations
    const r = stream(change, 'kind');
    const others = PALETTES.filter((p) => p !== g.pal);
    g.pal = r.pick(others);
    WORLD.light(g, stream(change, 'light'));
  },

  // What the world looks like at this moment of the visit. ta is seconds since
  // arrival (drives the event); t is the world's own running clock.
  live(g, ta, t) {
    const e = g.ev.type === 'none' ? 0 : smooth(0, 1, (ta - g.ev.t0) / g.ev.dur);
    const L = {
      ev: e, inks: g.inkFlat, tr: g.tr,
      sun: g.sun, air: g.air.slice(), sea: g.sea.slice(), sky: g.sky, body: g.body, bodyK: g.bodyK, part: g.part,
      set: g.set.pos, setMotion: g.set.move, setLit: g.set.lit,
    };
    let el = g.sunEl, az = g.sunAz;
    const ty = g.ev.type;
    if (ty === 'rise') { L.setMotion = e; L.setLit = e; }
    else if (ty === 'lights') { L.setLit = e; }
    else if (ty === 'tide') { L.sea[1] = g.sea[1] + g.ev.amount * e; }
    else if (ty === 'mist') { L.air[2] = mix(g.air[2], g.ev.amount, e); L.air[3] = mix(g.air[3], 0.03, e); }
    else if (ty === 'sunset') { el = mix(g.sunEl, -0.04, e); }
    L.sunDir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    return L;
  },
};

// ---- PLAIN ----
FORMS.plain = {
  weight: 1,
  build(g, S) {
    const r = S('plain');
    const kind = r.weighted([[1, 3], [2, 3], [3, 3], [4, 2], [5, 1.5]]);
    const spacing = r.range(26, 46);
    const H = { 1: r.range(9, 20), 2: r.range(3.5, 7), 3: r.range(6, 9), 4: r.range(7, 12), 5: r.range(3, 6) }[kind];
    const W = { 1: r.range(0.9, 1.6), 2: r.range(1.1, 1.9), 3: 1.0, 4: r.range(0.8, 1.1), 5: 1 }[kind];
    const odd = r.int(1, 4);
    const oz = Math.round((g.speed * r.range(16, 22)) / spacing), ox = r.chance(0.5) ? 0 : -1;
    g.tr.set([kind, spacing, H, kind === 2 ? 0.8 : r.range(0, 0.25), kind === 5 ? 0.45 : r.range(0.75, 1), ox, oz, odd, r.chance(0.3) ? r.range(2, 6) : 0, r.int(0, 2), W]);
    g.path.y0 = r.range(3.2, 6.5);
    g.speed = r.range(11, 16); g.lead = 70; g.tilt = -0.01;
    if (r.chance(0.6)) g.sea = [2, 0.03, r.range(0.35, 1), 0];
    g.door = { r: 5.5, kin: [0, 0.5], stranger: [spacing * 0.0 + 9, 7] };
    if (r.chance(0.55)) {
      const type = r.pick([1, 2, 3, 4, 5, 6, 7, 8]);
      const scale = r.range(9, 22);
      const onLine = type === 3 || type === 6 || type === 1;
      g.set = { type, pos: [onLine ? 0 : (r.chance(0.5) ? 1 : -1) * r.range(1.2, 2.2) * scale, type === 3 ? -scale * 0.2 : 0, g.speed * r.range(24, 30)], scale, yaw: 0, attend: onLine ? 0.2 : 0.75, eye: 2.6, move: 0, lit: 0 };
      if (onLine) g.path.y0 = Math.max(g.path.y0, type === 3 ? scale * 1.3 : scale * 1.2) * (type === 1 ? 0.9 : 1), g.set.pos[1] = type === 3 ? g.path.y0 - 1.55 * scale : 0;
      g.ev = { id: 1, type: 'rise', t0: 10, dur: 14 };
    } else if (kind === 3) g.ev = { id: 2, type: 'lights', t0: 8, dur: 26 };
  },
};
