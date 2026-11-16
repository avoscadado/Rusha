// ---- CISTERN: columns standing in water under a roof with holes in it ----
FORMS.cistern = {
  weight: 1,
  mist: false, snow: false,
  build(g, S) {
    const r = S('cistern');
    const bay = Math.round(r.range(9, 14));
    const rad = r.range(0.55, 0.95);
    const arc = r.weighted([[0, 1.5], [1, 2], [2, 3]]);
    const spring = r.range(4.5, 7.5);
    const H = arc ? spring + (bay * 0.5 - rad) + r.range(0.6, 2.2) : r.range(8, 14);
    const hole = r.chance(0.88) ? r.range(0.3, 0.42) * bay : 0;
    const every = hole ? r.pick([1, 2, 2, 3]) : 1;
    const odd = r.weighted([[0, 3], [1, 2.5], [2, 1.5], [3, 2]]);
    g.speed = r.range(4.6, 6.4); g.lead = 34; g.tilt = 0; g.focal = 1.85;
    g.path.y0 = r.range(2.1, 3.0);
    g.path.ax = r.range(0.3, 0.7); g.path.fx = TAU / r.range(160, 260); g.path.px = r.range(0, TAU);
    const oz = Math.round((g.speed * r.range(15, 21)) / bay), side = r.chance(0.5) ? 1 : -1;
    const lamps = !hole || r.chance(0.3) ? 1 : 0;
    g.tr.set([bay, H, spring, rad, r.chance(0.3) ? 1 : 0, arc, hole, every, oz, odd, side, rad * 0.75, lamps, 0]);
    g.sea = [2, 0, r.range(0.35, 0.8), 0];
    g.air = [2.6 / (13 * bay), r.int(5, 7), -100, 0];
    // the light comes down the holes, so the sun stands high
    g.sunAz = (r.chance(0.5) ? 1 : -1) * r.range(0.35, 1.1); g.sunEl = r.range(0.7, 1.0);
    g.sun = [0.03, 0.8, 3, 16];
    g.sky = [0, 1, g.pal.hour === 0 ? 0.8 : 0, 0];
    g.fill = [-0.25 * Math.sign(g.sunAz), 0.35, -0.9, 1];
    g.interior = true; g.space = 0.95; g.timbres = ['organ', 'bowed', 'bell'];
    g.pulse = bay; g.floodTo = 1.4;
    const clear = Math.min(bay * 0.5 - rad * 1.4 - 0.8, 2.4);
    g.door = { r: clear, kin: [0, 0.1], stranger: [0, arc ? Math.min(spring + 0.5, H - clear - 0.8) - g.path.y0 : H - clear - 1.2 - g.path.y0] };
    g.facts = { bay, H: Math.round(H), odd, hole: !!hole, lamps: !!lamps, arc };
    const ev = r.weighted([['tide', 3], [lamps ? 'lights' : 'none', 3], ['none', 2]]);
    if (ev === 'tide') { const down = r.chance(0.5); g.ev = { id: 1, type: 'tide', t0: 10, dur: 30, amount: down ? -0.55 : 1.0 }; g.facts.tide = down ? 'down' : 'up'; }
    else if (ev === 'lights') g.ev = { id: 2, type: 'lights', t0: 8, dur: 28 };
  },
  words(g) {
    const f = g.facts;
    const name = f.odd === 1 ? 'The Painted Column' : f.odd === 2 ? 'The Missing Column' : f.odd === 3 ? 'The Broken Column'
      : f.tide === 'down' ? 'Low Water in the Cistern' : f.tide === 'up' ? 'The Cistern Filling' : f.arc === 2 ? 'The Long Cistern' : f.arc === 1 ? 'The Arcade' : 'The Columns';
    const bits = [`Columns ${numWord(f.H)} metres high stand in water a hand deep, one every ${numWord(f.bay)} metres.`];
    if (f.odd === 1) bits.push('One of them has been painted.');
    else if (f.odd === 2) bits.push('One is missing and the roof has not noticed.');
    else if (f.odd === 3) bits.push('One is broken off at the knee.');
    if (f.tide === 'down') bits.push('The water goes down while you are here and leaves a dark line.');
    else if (f.tide === 'up') bits.push('The water is rising.');
    else if (g.ev.type === 'lights') bits.push('Someone has left lamps. They come on one at a time.');
    else if (f.hole && bits.length < 2) bits.push('The light comes down through holes in the roof.');
    return { name, line: bits.join(' ') };
  },
  changeLines: {
    later: 'The same hall a long time afterwards. The roof has gone and the columns have not.',
    drained: 'The same hall with the water let out. The floor is stone flags.',
    flooded: 'The same hall with the water a man deep.',
  },
  later(g) { g.tr[13] = 1; g.interior = false; g.sunEl = 0.45; g.air[0] *= 0.55; g.sky[0] = 0.5; g.fill = [0, 1, 0, 0]; },
};
