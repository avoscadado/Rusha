// ---- PLAIN: one kind of thing repeated across level ground, and one exception ----
FORMS.plain = {
  weight: 1.2,
  THINGS: {
    1: { one: 'pylon', many: 'pylons', line: (n) => `Pylons stand every ${numWord(n)} metres in every direction.` },
    2: { one: 'stone', many: 'stones', line: (n) => `Stones were stood on end here, about ${numWord(n)} metres apart.` },
    3: { one: 'lamp', many: 'lamps', line: (n) => `There is a lamp post every ${numWord(n)} metres and no road.` },
    4: { one: 'gate', many: 'gates', line: (n) => `Gates stand ${numWord(n)} metres apart, each one leading to the next.` },
    5: { one: 'dome', many: 'domes', line: (n) => `Something round is buried here every ${numWord(n)} metres or so.` },
  },
  ODD: {
    1: { name: (t) => (t.one === 'lamp' ? 'The Lamp Left On' : `The Painted ${cap(t.one)}`), line: (t) => (t.one === 'lamp' ? 'One of them is on.' : 'One of them has been painted.') },
    2: { name: (t) => `The Missing ${cap(t.one)}`, line: () => 'One is missing.' },
    3: { name: (t) => `The Large ${cap(t.one)}`, line: () => 'One is more than twice the size of the others.' },
    4: { name: (t) => `The Fallen ${cap(t.one)}`, line: () => 'One has fallen over.' },
  },
  build(g, S) {
    const r = S('plain');
    const kind = r.weighted([[1, 3], [2, 3], [3, 3], [4, 2], [5, 1.5]]);
    const spacing = Math.round(r.range(26, 46));
    const H = { 1: r.range(9, 20), 2: r.range(3.5, 7), 3: r.range(6, 9), 4: r.range(7, 12), 5: r.range(3, 6) }[kind];
    const W = { 1: r.range(0.9, 1.6), 2: r.range(1.1, 1.9), 3: 1.0, 4: r.range(0.8, 1.1), 5: 1 }[kind];
    g.speed = r.range(11, 16); g.lead = 70; g.tilt = -0.012;
    g.path.y0 = r.range(3.4, 6.5);
    // the line wanders a little between its two rows
    g.path.ax = r.range(1.5, Math.min(5, spacing * 0.5 - W - 3.5)); g.path.fx = TAU / r.range(260, 420); g.path.px = r.range(0, TAU);
    const lineX = (z) => g.path.ax * Math.sin(z * g.path.fx + g.path.px);
    const hasSet = r.chance(0.5);
    let odd = kind === 5 ? r.pick([1, 3]) : kind === 3 ? r.pick([1, 2, 3, 4]) : r.int(1, 4);
    if (hasSet && r.chance(0.5)) odd = 0;
    // the exception stands beside the line, where the flight will pass it
    const oz = Math.round((g.speed * r.range(15, 21)) / spacing), ox = r.chance(0.5) ? 0 : -1;
    g.tr.set([kind, spacing, H, kind === 2 ? 0.8 : r.range(0, 0.22), kind === 5 ? 0.45 : r.range(0.78, 1), odd ? ox : 9999, oz, odd, 0, r.int(0, 1), W]);
    if (r.chance(0.55)) g.sea = [2, 0.03, r.range(0.4, 1), 0];
    g.floodTo = 0.6; g.mistTop = H * 0.55 + 1;
    g.door = { r: 5.5, kin: [0, 0.6], stranger: [10, 7.5] };
    g.pulse = spacing;
    g.timbres = ['glass', 'bell', 'reed'];
    g.facts = { kind, spacing, odd, wet: g.sea[0] > 0.5 };
    if (hasSet) {
      const type = r.pick([1, 2, 3, 4, 5, 6, 7, 8]);
      const scale = type === 8 ? r.range(7, 12) : r.range(9, 20);
      const onLine = type === 1 || type === 3 || type === 6;
      const side = (r.chance(0.5) ? 1 : -1) * (type === 4 ? r.range(2.6, 3.8) : r.range(1.4, 2.4)) * scale;
      const sz = g.speed * r.range(25, 30);
      g.set = { type, pos: [(onLine ? 0 : side) + lineX(sz), 0, sz], scale, yaw: 0, attend: onLine ? 0.15 : 0.8, eye: 2, move: 0, lit: 0 };
      if (type === 3) g.path.y0 = 1.55 * scale;                // the way goes through the ring
      if (type === 1) g.path.y0 = Math.min(g.path.y0, 2.2 * scale);
      g.ev = { id: 1, type: 'rise', t0: 9, dur: 13 };
      g.facts.setM = Math.round(SETS[type].tall * scale);
    } else if (kind === 3 && odd !== 1) {
      g.ev = { id: 2, type: 'lights', t0: 8, dur: 30 };
    } else {
      const pick = r.weighted([['none', 3], ['mist', 2], ['snow', 1.5], ['sunset', g.pal.hour === 1 ? 4 : 0]]);
      if (pick === 'mist') g.ev = { id: 3, type: 'mist', t0: 14, dur: 22 };
      else if (pick === 'snow') g.ev = { id: 4, type: 'snow', t0: 10, dur: 22 };
      else if (pick === 'sunset') g.ev = { id: 5, type: 'sunset', t0: 8, dur: 34, toPal: r.pick(['Lamp Black', 'Indigo Vat', 'Mulberry Night', 'Prussian']) };
    }
  },
  words(g) {
    const f = g.facts, t = this.THINGS[f.kind], bits = [t.line(f.spacing)];
    let name;
    if (g.set.type) {
      const s = SETS[g.set.type];
      name = `${cap(s.noun)} among ${cap(t.many)}`;
      bits.push(s.line(f.setM) + (g.ev.type === 'rise' ? ' ' + s.rise : ''));
    } else {
      name = f.odd ? this.ODD[f.odd].name(t) : `${cap(t.many)}`;
      if (f.odd) bits.push(this.ODD[f.odd].line(t));
      if (g.ev.type === 'lights') bits.push('The others come on one at a time.');
      else if (g.ev.type === 'sunset') bits.push('The sun goes while you are here.');
      else if (g.ev.type === 'mist') bits.push('The mist comes up to meet them.');
      else if (g.ev.type === 'snow') bits.push('It begins to snow.');
      else if (f.wet) bits.push('The ground is a hand\'s depth of water.');
    }
    return { name, line: bits.join(' ') };
  },
  changeLines: { later: 'The same field a long time afterwards. Most of them are down.', emptied: 'The same ground with everything taken off it.' },
  empty(g) { g.tr[0] = 0; g.set.type = 0; if (g.ev.type === 'rise' || g.ev.type === 'lights') g.ev.type = 'none'; },
  later(g) { g.tr[4] *= 0.4; g.tr[3] = 0.9; g.tr[7] = 4; if (g.ev.type === 'lights') g.ev.type = 'none'; },
};
