// ---------- worlds ----------
// A world is a pure function of its key { base, change, heir, age }.
//   base    the place itself: its form, layout, set piece, event
//   change  0 for the place as first found; otherwise how this kin differs
//   heir    what is handed down a line of worlds: a moon and a tune
//   age     how many plates the heirloom has lasted
// Every trait draws from its own named stream, so adding a trait later never
// disturbs the traits a seed already has.
const FORMS = {};

const numWord = (n) => {
  n = Math.round(n);
  const ones = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n < 20) return ones[n];
  if (n < 100) return tens[(n / 10) | 0] + (n % 10 ? '-' + ones[n % 10] : '');
  if (n < 1000) return ones[(n / 100) | 0] + ' hundred' + (n % 100 ? ' and ' + numWord(n % 100) : '');
  return String(n);
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The set pieces: one colossal thing a world may hold. `tall` and `wide` are in
// units of the set piece's scale, so sentences can state true sizes.
const SETS = {
  1: { noun: 'door', tall: 4, eye: 2.0, line: (m) => `A door ${numWord(m / 3)} storeys high stands here by itself.`, rise: 'It opens as you come.' },
  2: { noun: 'ball', tall: 2, eye: 1.4, line: (m) => `A ball ${numWord(m)} metres across rests on the ground.`, rise: 'Then it does not rest.' },
  3: { noun: 'ring', tall: 3.1, eye: 1.55, line: (m) => `A ring ${numWord(m)} metres across stands on its edge, and the way goes through it.`, rise: 'It takes the light as you pass.' },
  4: { noun: 'tower', tall: 6.3, eye: 3.4, line: (m) => `A tower ${numWord(m)} metres high has one room at the top.`, rise: 'The light in the room is on.' },
  5: { noun: 'stair', tall: 4.3, eye: 3.2, line: (m) => `A stair climbs ${numWord(m)} metres and stops.`, rise: 'Nothing is at the top.' },
  6: { noun: 'arch', tall: 3.2, eye: 1.8, line: (m) => `An arch ${numWord(m)} metres high has no wall on either side of it.`, rise: 'The way goes under.' },
  7: { noun: 'slab', tall: 3.0, eye: 1.8, line: (m) => `A slab ${numWord(m)} metres tall hangs a little off the ground.`, rise: 'It goes up as you watch.' },
  8: { noun: 'tree', tall: 3.1, eye: 2.2, line: () => 'There is one tree.', rise: 'It is in flower.' },
};

const CHANGES = {
  night:   { label: 'at night',       line: 'Night has come and nothing else has moved.' },
  dusk:    { label: 'at dusk',        line: 'The sun is going. Everything has a long shadow and keeps it.' },
  dawn:    { label: 'at first light', line: 'First light. Nobody is up.' },
  noon:    { label: 'at noon',        line: 'The sun is overhead and there is nowhere to hide.' },
  flooded: { label: 'flooded',        line: 'The water came and has not left.' },
  drained: { label: 'drained',        line: 'The water has gone and left its floor behind.' },
  mist:    { label: 'in mist',        line: 'Mist has taken everything below the knee.' },
  snow:    { label: 'under snow',     line: 'It has been snowing for some time.' },
  emptied: { label: 'emptied',        line: 'Everything has been taken away but the ground.' },
  later:   { label: 'much later',     line: 'A long time has passed. It shows.' },
};

const MOONS = [
  { id: 'none',     w: 3 },
  { id: 'ringed',   w: 2, label: 'ringed moon' },
  { id: 'red',      w: 2, label: 'red moon' },
  { id: 'crescent', w: 2, label: 'thin moon' },
  { id: 'pale',     w: 2, label: 'full moon' },
];

const MODES = {
  0: [[0, 2, 3, 7, 8], [0, 3, 5, 7, 10], [0, 1, 5, 7, 8]],
  1: [[0, 2, 3, 7, 9], [0, 2, 5, 7, 9], [0, 2, 3, 5, 7, 10]],
  2: [[0, 2, 4, 7, 9], [0, 2, 4, 6, 7, 9, 11], [0, 4, 5, 7, 11]],
};

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
      comp: { x: 0, y: 0, yaw: 0 },                          // the vantage: offset from the line, and a turn
      speed: 14, lead: 60, tilt: 0, focal: 2.05,
      sunAz: 0.6, sunEl: 0.35, sun: [0.03, 1, 3, 9],
      air: [0.0016, 6, -100, 0], sea: [0, 0, 1, 0],
      set: { type: 0, pos: [0, 0, 0], scale: 10, yaw: 0, attend: 0.6, eye: 2.5, move: 0, lit: 0 },
      ev: { id: 0, type: 'none', t0: 22, dur: 16 },
      sky: [0.3, 1, 0, 0],
      body: new Float32Array(8), bodyK: new Float32Array(8),
      part: [0, 0, 0, 1], cover: 0, fill: [0, 1, 0, 0],
      door: { r: 7, kin: [0, 0], stranger: [9, 7] }, doorsAt: 38,
      pulse: 0, mistTop: 3, floodTo: 1.2, interior: false,
      timbres: ['glass', 'bell'], space: 0.6,
      facts: {}, changeType: null,
    };
    // 1. the place
    const names = Object.keys(FORMS);
    g.form = key.form && FORMS[key.form] ? key.form : S('form').weighted(names.map((n) => [n, FORMS[n].weight ?? 1]));
    const F = FORMS[g.form];
    // 2. its inks and its hour
    const pool = PALETTES.filter((p) => !F.hours || F.hours.includes(p.hour));
    g.pal = key.pal && PALETTE_BY_NAME[key.pal] ? PALETTE_BY_NAME[key.pal] : S('ink').pick(pool);
    WORLD.light(g, S('light'));
    // 3. the form lays out its ground, set piece and event
    F.build(g, S);
    if (g.set.type) g.set.eye = SETS[g.set.type].eye;
    // 4. what has been handed down
    WORLD.heirloom(g, key);
    // 5. kin: the same place, changed
    if (key.change) WORLD.change(g, key.change >>> 0, F);
    // 6. everything derived
    g.inkFlat = new Float32Array(24);
    INK_KEYS.forEach((k, i) => g.inkFlat.set(g.pal[k], i * 3));
    if (g.ev.type === 'sunset') {
      const to = PALETTE_BY_NAME[g.ev.toPal] || PALETTES[0];
      g.ev.toFlat = new Float32Array(24);
      INK_KEYS.forEach((k, i) => g.ev.toFlat.set(to[k], i * 3));
    }
    g.doorInk = V.mix(g.pal.glow, g.pal.low, 0.35);
    WORLD.words(g, F);
    WORLD.audio(g, key);
    return g;
  },

  // Sun or moon, sky furniture, air: decided from the palette's hour.
  light(g, r) {
    const hour = g.pal.hour;
    const side = r.chance(0.5) ? 1 : -1;
    if (hour === 1) { g.sunAz = side * r.range(0.12, 0.5); g.sunEl = r.range(0.05, 0.16); g.sun = [0.045, 1.6, 3, 24]; }
    else if (hour === 2) { g.sunAz = side * r.range(0.5, 1.1); g.sunEl = r.range(0.42, 0.85); g.sun = [0.026, 0.7, 3, 22]; }
    else { g.sunAz = side * r.range(0.25, 0.8); g.sunEl = r.range(0.3, 0.6); g.sun = [0.05, 0.9, 2, 20]; }
    g.sky = [r.chance(0.7) ? r.range(0.2, 0.75) : 0, r.range(0.7, 1.6), hour === 0 ? r.range(0.6, 1) : (hour === 1 ? r.range(0, 0.35) : 0), r.chance(0.55) ? r.range(0.03, 0.09) : 0];
    g.air = [r.range(0.0011, 0.0026), r.int(5, 8), -100, 0];
    // by night a little light from the open sky keeps upward faces readable
    g.fill = hour === 0 ? [0, 1, 0, 0.6] : [0, 1, 0, 0];
  },

  moonKind(heir) { return stream(heir >>> 0, 'moon').weighted(MOONS.map((m) => [m, m.w])); },
  heirloom(g, key) {
    const r = stream(key.heir >>> 0, 'moon');
    const m = r.weighted(MOONS.map((x) => [x, x.w]));
    g.heir = { id: m.id, label: m.label || null, age: key.age || 0 };
    if (m.id === 'none' || g.interior) return;
    // opposite the sun, and high enough to clear the horizon furniture
    const side = g.sunAz > 0 ? -1 : 1;
    let az = side * r.range(0.22, 0.5), el = r.range(0.2, 0.36);
    const size = r.range(0.045, 0.085);
    // one body to a sky: by night the heirloom moon is the light itself
    if (g.pal.hour === 0) { az = g.sunAz; el = g.sunEl; g.sun = [0, g.sun[1], g.sun[2], g.sun[3]]; }
    const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    const phase = m.id === 'crescent' ? 0.55 * side : m.id === 'pale' || m.id === 'ringed' ? 0 : r.pick([0, 0.8 * side]);
    g.body.set([dir[0], dir[1], dir[2], m.id === 'crescent' ? size * 1.2 : size], 0);
    g.bodyK.set([phase, m.id === 'ringed' ? 1 : 0, m.id === 'red' ? 0.85 : 0, 0], 0);
  },

  pickChange(g, change, F) {
    const r = stream(change, 'kind');
    const hour = g.pal.hour;
    const opts = [];
    if (hour !== 0 && !g.interior) opts.push(['night', 3]);
    if (hour !== 1) opts.push([g.pal.temp > 0 ? 'dusk' : 'dawn', 2.5]);
    if (hour !== 2 && !g.interior) opts.push(['noon', 1.5]);
    if (g.sea[0] < 0.5 && F.flood !== false) opts.push(['flooded', 3]);
    if (g.sea[0] > 0.5 && g.sea[0] < 2.5 && F.drain !== false) opts.push(['drained', 2.5]);
    if (F.mist !== false && g.sea[0] < 2.5) opts.push(['mist', 2]);
    if (F.snow !== false && !g.interior) opts.push(['snow', 2]);
    if (F.empty) opts.push(['emptied', 1.5]);
    if (F.later) opts.push(['later', 2.5]);
    return { type: r.weighted(opts), r };
  },
  change(g, change, F) {
    const { type, r } = WORLD.pickChange(g, change, F);
    g.changeType = type;
    const want = { night: 0, dusk: 1, dawn: 1, noon: 2 }[type];
    let pool;
    if (want !== undefined) {
      pool = PALETTES.filter((p) => p.hour === want && (type === 'dusk' ? p.temp > 0 : type === 'dawn' ? p.temp <= 0.25 : true));
    } else if (type === 'snow') {
      pool = ['Milk Glass', 'Pewter', 'First Light', 'Salt Flat', 'Cyanotype', 'Lilac Smoke', 'Prussian'].map((n) => PALETTE_BY_NAME[n]);
    } else {
      pool = PALETTES.filter((p) => p !== g.pal && (!F.hours || F.hours.includes(p.hour)));
    }
    pool = pool.filter((p) => p !== g.pal);
    g.pal = r.pick(pool.length ? pool : PALETTES);
    const keepSky = g.sky[3], keep = { az: g.sunAz, el: g.sunEl, fill: g.fill.slice() };
    WORLD.light(g, stream(change, 'light'));
    g.sky[3] = keepSky;                                    // the far country does not move,
    // and the light keeps to the side of the place it was designed for
    g.sunAz = keep.az;
    g.fill = [keep.fill[0], keep.fill[1], keep.fill[2], Math.max(keep.fill[3], g.fill[3])];
    g.sunEl = g.elFix ? keep.el : clamp(g.sunEl, g.elMin ?? -1, g.elMax ?? 2);
    if (type === 'flooded') { g.sea = [r.chance(0.5) ? 2 : 1, g.floodTo, r.range(0.5, 1), 0]; if (g.ev.type === 'tide') g.ev.type = 'none'; }
    else if (type === 'drained') { g.sea = [0, 0, 0, 0]; if (g.ev.type === 'tide') g.ev.type = 'none'; }
    else if (type === 'mist') { g.air[2] = g.mistTop; g.air[3] = 0.022; if (g.ev.type === 'mist') g.ev.type = 'none'; }
    else if (type === 'snow') { g.part = [1, 0.55, 1.6, 1]; g.cover = 0.85; g.sky[0] = Math.max(g.sky[0], 0.5); }
    else if (type === 'emptied') F.empty(g, r);
    else if (type === 'later') F.later(g, r);
    if (type === 'night' && F.night) F.night(g, r);
    // the heirloom moon moves with the new sun
    g.body.fill(0); g.bodyK.fill(0);
    WORLD.heirloom(g, g.key);
  },

  words(g, F) {
    const w = F.words(g);
    let name = w.name, line = w.line;
    if (g.changeType) {
      const c = CHANGES[g.changeType];
      name = `${w.name}, ${c.label}`;
      line = (g.changeType === 'later' && g.laterLine) || (F.changeLines && F.changeLines[g.changeType]) || c.line;
    } else {
      // titled as prints are: the place, then its hour or its weather
      const r = stream(g.key.base >>> 0, 'when'), h = g.pal.hour, e = g.ev.type;
      const when = e === 'snow' ? 'Snow' : e === 'mist' ? 'Mist' : e === 'sunset' ? 'Sunset'
        : h === 0 ? (g.heir.label && !g.interior ? 'Moonlight' : 'Night')
        : h === 1 ? (g.pal.temp > 0.25 ? r.pick(['Evening', 'Dusk']) : r.pick(['Morning', 'First Light']))
        : r.pick(['Noon', 'Afternoon', 'Clear Day']);
      name = `${w.name}, ${when}`;
    }
    if (g.heir.label && g.heir.age >= 2 && !g.interior) {
      line += ` The ${g.heir.label} has followed for ${numWord(g.heir.age + 1)} plates.`;
    }
    g.name = name; g.line = line; g.baseName = w.name; g.data = w.data || '';
  },

  audio(g, key) {
    const rb = stream(key.base >>> 0, 'sound'), rh = stream(key.heir >>> 0, 'tune');
    const mode = rb.pick(MODES[g.pal.hour]);
    const n = rh.int(4, 6), motif = [];
    let deg = rh.int(0, 2);
    for (let i = 0; i < n; i++) {
      motif.push({ deg, oct: 1, beats: i === n - 1 ? 2 : rh.pick([1, 1, 1, 0.5, 2]) });
      deg += rh.pick([1, 1, 2, -1, -2, 3]); deg = clamp(deg, 0, 7);
    }
    g.audio = {
      seed: (key.base ^ (key.change || 0)) >>> 0,
      root: 38 + rb.int(0, 14), mode, timbre: rb.pick(g.timbres),
      tempo: Math.round(mix(44, 66, sat((g.speed - 6) / 16))), motif,
      bed: g.interior ? 'room' : g.part[0] > 3.5 ? 'rain' : g.sea[0] > 0.5 && g.sea[0] < 2.5 ? 'sea' : g.pal.hour === 0 && rb.chance(0.5) ? 'still' : 'wind',
      bedLevel: g.interior ? 0.3 : 0.5, bright: [0.25, 0.5, 0.75][g.pal.hour], space: g.space,
      heirloom: (key.age || 0) > 0,
    };
  },

  // What the world looks like at this moment of the visit. ta is seconds since
  // arrival (drives the event); t is the world's own running clock.
  live(g, ta, t) {
    const ty = g.ev.type;
    const e = ty === 'none' ? 0 : smooth(0, 1, (ta - g.ev.t0) / g.ev.dur);
    const L = {
      ev: e, inks: g.inkFlat, tr: g.tr, cover: g.cover,
      sun: g.sun, air: g.air, sea: g.sea, sky: g.sky, body: g.body, bodyK: g.bodyK, part: g.part,
      set: g.set.pos, setMotion: g.set.move, setLit: g.set.lit,
    };
    let el = g.sunEl;
    const az = g.sunAz;
    if (ty === 'rise') { L.setMotion = e; L.setLit = e; }
    else if (ty === 'lights') { L.setLit = e; }
    else if (ty === 'tide') { L.sea = g.sea.slice(); L.sea[1] = g.sea[1] + g.ev.amount * e; }
    else if (ty === 'mist') { L.air = g.air.slice(); L.air[2] = mix(g.air[2] > -50 ? g.air[2] : g.mistTop - 14, g.mistTop, e); L.air[3] = mix(g.air[3], 0.024, e); }
    else if (ty === 'sunset') {
      el = mix(g.sunEl, -0.03, e);
      const a = g.inkFlat, b = g.ev.toFlat, o = L.inks = new Float32Array(24);
      for (let i = 0; i < 24; i++) o[i] = mix(a[i], b[i], e);
      L.sky = g.sky.slice(); L.sky[2] = mix(g.sky[2], 0.8, smooth(0.5, 1, e));
    } else if (ty === 'snow') { L.part = [1, 0.6 * e, 1.5, 1]; L.cover = Math.max(g.cover, 0.8 * smooth(0.25, 1, e)); }
    L.sunDir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    return L;
  },

  // share codes: version, then the four parts of the key in base 36, joined by hyphens
  // (letters, digits and hyphens survive every kind of link)
  code(key) { return ['1', key.base >>> 0, key.change >>> 0, key.heir >>> 0, key.age | 0].map((v, i) => (i ? (+v).toString(36) : v)).join('-'); },
  parse(s) {
    const p = String(s || '').trim().toLowerCase().split(/[-.]/);
    if (p.length === 5 && p[0] === '1') {
      const v = p.slice(1).map((x) => parseInt(x, 36));
      if (v.every(Number.isFinite)) return { base: v[0] >>> 0, change: v[1] >>> 0, heir: v[2] >>> 0, age: clamp(v[3] | 0, 0, 9999), gen: 0 };
    }
    const one = codeToSeed(s);
    return one === null ? null : { base: one, change: 0, heir: one, age: 0, gen: 0 };
  },
};
