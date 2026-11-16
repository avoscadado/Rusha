// ---- TERRACES: hillsides cut into level shelves, a valley along the flight line ----
FORMS.terraces = {
  weight: 0,
  // half width of each set piece in units of its scale, and whether the way goes through it
  SETW: { 1: [1.25, true], 2: [1.0, false], 3: [1.65, true], 4: [0.5, false], 5: [0.7, false], 6: [1.5, true], 7: [0.9, false], 8: [1.25, false] },
  build(g, S) {
    const r = S('terraces');
    const T = r.pick([2, 3, 3, 4, 4, 5, 6]);
    const H = r.range(50, 140);
    const slope = r.range(0.55, 1.15);
    const run = H / slope;
    const W = r.range(9, 26);
    const cove = r.chance(0.75) ? r.range(12, 55) : 0;
    const wave = r.range(230, 420);
    const c1 = r.range(0.45, 0.8);
    const lean = r.range(0, 1.8);
    const wet = r.weighted([[0, 3], [1, 3.5], [0.5, 2.5]]);
    g.speed = r.range(12, 18); g.lead = 90; g.focal = 2.0;
    g.path.ax = r.range(14, 55); g.path.fx = TAU / r.range(520, 900); g.path.px = r.range(0, TAU);
    g.path.y0 = Math.max(9, H * r.range(0.1, 0.36));
    g.path.ay = r.range(0, 2.5); g.path.fy = TAU / r.range(300, 500); g.path.py = r.range(0, TAU);
    g.tilt = -0.02 - 0.0016 * g.path.y0;
    // bounds on the slope and the curvature of the uncut ground, for the march
    let p1 = 0, p2 = 0;
    for (let i = 0; i <= 200; i++) {
      const s = i / 200, q = 1 + lean * s, b = s * (1 + lean) / q, b1 = (1 + lean) / (q * q), b2 = -2 * lean * (1 + lean) / (q * q * q);
      p1 = Math.max(p1, 6 * b * (1 - b) * b1); p2 = Math.max(p2, Math.abs(6 * (1 - 2 * b) * b1 * b1 + 6 * b * (1 - b) * b2));
    }
    const K = 1 / wave, nG = 1.8 * K, nH = 8 * K * K, ps = g.path.ax * g.path.fx;
    const ds = (Math.hypot(1, ps) + cove * nG) / run, hs = (g.path.ax * g.path.fx * g.path.fx + cove * nH) / run;
    const G = H * (p1 * ds + c1 * nG);
    const C = H * (p2 * ds * ds + p1 * hs + 2 * p1 * c1 * ds * nG + c1 * nH);
    g.tr.set([T, H, W, cove, run, K, lean, c1, wet, 0, 1 / Math.hypot(1, G), C, ps, 0, r.pick([0, 1, 1]), 60]);
    const shelves = Math.round((0.9 * H) / T);
    // water: a lake on the valley floor, a sea of mist, or dry
    const doorR = 5.5, clear = g.path.y0 - g.path.ay - doorR - 2;
    const water = r.weighted([['lake', 4], ['mist', 1.6], ['dry', 3]]);
    let drowned = 0;
    if (water === 'lake') {
      drowned = r.chance(0.35) ? Math.min(r.int(1, 2), Math.floor(clear / T - 0.6)) : 0;
      g.sea = [r.chance(0.7) ? 2 : 1, T * (drowned + r.range(0.3, 0.6)), r.range(0.4, 1), 0];
    } else if (water === 'mist') {
      g.sea = [3, Math.min(T * r.range(1.4, 3.6), clear), 1, 0];
    }
    g.floodTo = Math.min(T * 2.55, clear); g.mistTop = Math.min(T * 3 + 2, g.path.y0 - 2);
    g.door = { r: doorR, kin: [0, 0.5], stranger: [(r.chance(0.5) ? 1 : -1) * 11, 4.5] };
    g.pulse = 46; g.space = 0.75;
    g.timbres = ['reed', 'bell', 'breath'];
    g.facts = { T, shelves, floor: Math.round(2 * W), wet, water, drowned, slope };
    const dry = water === 'dry';
    if (r.chance(0.4)) {
      // one set piece on the valley floor, beside the line or across it
      const type = r.pick([1, 2, 3, 4, 4, 5, 6, 7, 8, 8]);
      const [hw, onLine] = this.SETW[type];
      const scale = onLine ? r.range(7.5, 12) : Math.max(4.5, Math.min(r.range(7, 13), (W - 7) / (2 * hw)));
      const z = g.speed * r.range(25, 30);
      const tan = g.path.ax * g.path.fx * Math.cos(z * g.path.fx + g.path.px);
      const side = (r.chance(0.5) ? 1 : -1) * (hw * scale + r.range(4, 6));
      if (type === 3) g.path.y0 = 1.55 * scale;
      if (type === 1) g.path.y0 = Math.min(g.path.y0, 2.0 * scale);
      if (type === 6) g.path.y0 = Math.min(g.path.y0, 1.5 * scale);
      if (onLine) { g.path.ay = 0; g.tilt = -0.02 - 0.0016 * g.path.y0; }
      const x0 = g.path.ax * Math.sin(z * g.path.fx + g.path.px);
      g.set = { type, pos: [x0 + (onLine ? 0 : side), dry ? 0 : g.sea[1] - 0.05, z], scale, yaw: -Math.atan(tan), attend: onLine ? 0.15 : 0.7, eye: 2, move: 0, lit: 0 };
      g.ev = { id: 1, type: 'rise', t0: 9, dur: 13 };
      g.facts.setM = Math.round(SETS[type].tall * scale);
      if (g.sea[0] > 0.5) g.sea[1] = Math.min(g.sea[1], g.path.y0 - doorR - 2);
    } else {
      const pick = r.weighted([['none', 3], ['mist', dry ? 2.5 : 0.8], ['snow', 1.6], ['tide', water === 'lake' ? 3 : 0], ['sunset', g.pal.hour === 1 ? 4 : 0]]);
      if (pick === 'mist' && water !== 'mist') g.ev = { id: 3, type: 'mist', t0: 12, dur: 24 };
      else if (pick === 'snow') g.ev = { id: 4, type: 'snow', t0: 10, dur: 22 };
      else if (pick === 'sunset') g.ev = { id: 5, type: 'sunset', t0: 8, dur: 34, toPal: r.pick(['Lamp Black', 'Indigo Vat', 'Mulberry Night', 'Prussian']) };
      else if (pick === 'tide') {
        const up = drowned > 0 ? false : r.chance(0.6);
        const n = up ? Math.min(2, Math.floor((clear - g.sea[1]) / T)) : drowned;
        if (n > 0) { g.ev = { id: 6, type: 'tide', t0: 9, dur: 30, amount: (up ? 1 : -1) * n * T }; g.facts.tide = up ? 'up' : 'down'; g.facts.tideN = n; }
      }
    }
    g.facts.y0 = g.path.y0;
  },
  words(g) {
    const f = g.facts;
    return { name: 'Terraces', line: `Every shelf is ${numWord(f.T)} metres above the last.` + JSON.stringify(Array.from(g.tr).map((v) => +v.toFixed(3))) + JSON.stringify(g.sea) + g.path.y0.toFixed(1) };
  },
  changeLines: {},
  later(g) { g.tr[13] = 0.6; g.tr[8] = 0; g.tr[9] = 0; },
};
