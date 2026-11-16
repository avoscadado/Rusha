// ---- PLAIN: one kind of thing repeated across level ground, and one exception ----
FORMS.plain = {
  weight: 1.2,
  THINGS: {
    1: { one: 'pylon', many: 'pylons', rule: ['Pylons stand in rows to every horizon.', 'Somebody put up pylons here and never strung a wire.', 'Pylons, at even distances, as far as there is ground.'] },
    2: { one: 'stone', many: 'stones', rule: ['Stones were stood on end here, a long time ago and all at once.', 'Standing stones, set out by someone who liked a grid.', 'Every stone here was carried in and stood up.'] },
    3: { one: 'lamp', many: 'lamps', rule: ['Lamp posts and no road for them to light.', 'There are lamp posts in every direction and nothing to see by them.', 'Someone planted street lamps where there is no street.'] },
    4: { one: 'gate', many: 'gates', rule: ['Gates stand in rows, each one leading to the next.', 'There are gates here and no walls.', 'Every gate here opens onto another gate.'] },
    5: { one: 'dome', many: 'domes', rule: ['Something round is buried here, over and over.', 'Domes break the ground at even distances, like the tops of things.', 'The ground has domes in it, each the same.'] },
  },
  ODD: {
    1: { name: (t) => (t.one === 'lamp' ? 'The Lamp Left On' : `The Painted ${cap(t.one)}`), line: (t) => (t.one === 'lamp' ? 'One of them is on.' : 'One of them has been painted.') },
    2: { name: (t) => `The Missing ${cap(t.one)}`, line: () => 'One is missing, and the rows close up around the gap.' },
    3: { name: (t) => `The Large ${cap(t.one)}`, line: () => 'One is more than twice the size of the others.' },
    4: { name: (t) => `The Fallen ${cap(t.one)}`, line: () => 'One has fallen over and nobody has stood it up.' },
  },
  build(g, S) {
    const r = S('plain'), sw = S('sway'), cm = S('vantage');
    const kind = r.weighted([[1, 3], [2, 3], [3, 3], [4, 2], [5, 1.5]]);
    const spacing = Math.round(r.range(26, 46));
    let H = { 1: r.range(9, 20), 2: r.range(3.5, 7), 3: r.range(6, 9), 4: r.range(7, 12), 5: r.range(3, 6) }[kind];
    const W = { 1: r.range(0.9, 1.6), 2: r.range(1.1, 1.9), 3: 1.0, 4: r.range(0.8, 1.1), 5: 1 }[kind];
    g.speed = r.range(11, 16); g.lead = 70;
    g.path.y0 = r.range(3.0, 5.6);
    const hasSet = r.chance(0.5);
    let odd = kind === 5 ? r.pick([1, 3]) : kind === 3 ? r.pick([1, 2, 3, 4]) : r.int(1, 4);
    if (hasSet && r.chance(0.5)) odd = 0;
    if (odd === 4) H = Math.min(H, spacing * 0.38);           // a fallen thing must lie inside its own square
    const jit = kind === 2 ? 0.5 : r.range(0, 0.22);
    // how far the line may stray from the middle of its aisle before it meets anything
    const reach = { 1: W, 2: W * 1.2, 3: W * 0.7, 4: W * 3.1, 5: H * 0.75 }[kind] * (odd === 3 ? 1.9 : 1);
    const clear = Math.max(0.5, spacing * (0.5 - 0.42 * jit) - reach - 2.5);
    g.path.ax = Math.min(2.5, clear * 0.35); g.path.fx = TAU / sw.range(260, 420); g.path.px = sw.range(0, TAU);
    const lineX = (z) => g.path.ax * Math.sin(z * g.path.fx + g.path.px);
    const side = cm.chance(0.5) ? 1 : -1;
    g.comp = { x: side * clear * cm.range(0.3, 0.6), y: 0, yaw: -side * cm.range(0.05, 0.16) };
    // the exception stands beside the line, on the side the eye is turned to
    const oz = Math.round((g.speed * r.range(15, 21)) / spacing), ox = side > 0 ? -1 : 0;
    g.tr.set([kind, spacing, H, jit, kind === 5 ? 0.45 : r.range(0.78, 1), odd ? ox : 9999, oz, odd, 0, r.int(0, 1), W]);
    const wet = r.chance(0.55);
    if (wet) g.sea = [2, 0.03, r.range(0.4, 1), 0];
    // over water the eye is tipped down to the reflections; over dry ground, up to the sky
    g.tilt = wet ? -cm.range(0.05, 0.11) : cm.range(0.07, 0.15);
    g.floodTo = 0.6; g.mistTop = H * 0.55 + 1;
    g.door = { r: 5.5, kin: [-side * 2, 0.6], stranger: [side * 9, 7.5] };
    g.pulse = spacing;
    g.timbres = ['glass', 'bell', 'reed'];
    g.facts = { kind, spacing, odd, wet, v: S('words').int(0, 999) };
    if (hasSet) {
      const type = r.pick([1, 2, 3, 4, 5, 6, 7, 8]);
      const scale = type === 8 ? r.range(7, 12) : r.range(9, 20);
      const onLine = type === 1 || type === 3 || type === 6;
      const off = -side * (type === 4 ? r.range(2.6, 3.8) : r.range(1.4, 2.4)) * scale;
      const sz = g.speed * r.range(25, 30);
      g.set = { type, pos: [(onLine ? 0 : off) + lineX(sz), 0, sz], scale, yaw: 0, attend: onLine ? 0.15 : 0.8, eye: 2, move: 0, lit: 0 };
      if (onLine) g.comp.x *= 0.25;
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
    const f = g.facts, t = this.THINGS[f.kind];
    let name, second;
    if (g.set.type) {
      const s = SETS[g.set.type];
      name = `${cap(s.noun)} among ${cap(t.many)}`;
      second = s.line(f.setM) + (g.ev.type === 'rise' ? ' ' + s.rise : '');
      return { name, line: second, data: `${t.many} every ${f.spacing} m` };
    }
    name = f.odd ? this.ODD[f.odd].name(t) : cap(t.many);
    second = f.odd ? this.ODD[f.odd].line(t)
      : g.ev.type === 'sunset' ? 'The sun goes while you are over them.' : g.ev.type === 'mist' ? 'The mist comes up to meet them.'
      : g.ev.type === 'snow' ? 'It begins to snow.' : f.wet ? 'They stand in a hand\'s depth of water.' : 'Nothing else is here.';
    if (g.ev.type === 'lights' && f.odd !== 1) second += ' The rest come on one at a time.';
    return { name, line: `${t.rule[f.v % t.rule.length]} ${second}`, data: `${t.many} every ${f.spacing} m` };
  },
  changeLines: { later: 'A long time has passed, and most of them are down.', emptied: 'Everything has been taken off it. The ground is the same ground.' },
  empty(g) { g.tr[0] = 0; g.set.type = 0; if (g.ev.type === 'rise' || g.ev.type === 'lights') g.ev.type = 'none'; },
  later(g) { g.tr[4] *= 0.4; g.tr[7] = 4; g.tr[2] = Math.min(g.tr[2], g.tr[1] * 0.38); if (g.ev.type === 'lights') g.ev.type = 'none'; },
};
