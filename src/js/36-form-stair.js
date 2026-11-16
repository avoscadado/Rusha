// ---- STAIR: a stepped well going down to water on both sides ----
FORMS.stair = {
  weight: 1,
  build(g, S) {
    const r = S('stair');
    const half = r.range(5, 8.5), D = r.range(2.6, 3.4), RH = r.range(2.2, 3.0);
    const N = r.int(4, 7), under = 3, n = r.int(4, 6);
    const P = Math.round(r.range(9, 14));
    const frames = r.chance(0.55) ? Math.round(r.range(34, 60)) : 0;
    const kiosks = r.chance(0.7) ? Math.round(r.range(18, 34)) : 0;
    const painted = r.chance(0.45) ? 1 : 0;
    g.speed = r.range(6, 8); g.lead = 46; g.tilt = 0.02; g.focal = 1.9;
    g.path.y0 = r.range(2.6, 3.8);
    g.path.ax = r.range(0.4, Math.min(1.4, half - 4)); g.path.fx = TAU / r.range(240, 380); g.path.px = r.range(0, TAU);
    const side = r.chance(0.5) ? 1 : -1, lvl = under + r.int(1, Math.min(3, N - 2));
    const oz = Math.round((g.speed * r.range(15, 20)) / P);
    const lamps = kiosks && g.pal.hour !== 2 ? 1 : 0;
    g.tr.set([half, D, RH, N, P, n, frames, kiosks, lvl, oz, side, painted, lamps, under]);
    g.sea = [r.chance(0.5) ? 2 : 1, 0, r.range(0.4, 0.9), 0];
    g.air = [r.range(0.0036, 0.0054), r.int(5, 7), -100, 0];
    g.sky[3] = 0;
    // the light comes over one wall and falls across the other
    g.sunAz = (r.chance(0.5) ? 1 : -1) * r.range(0.55, 1.1); g.sunEl = Math.max(g.sunEl, r.range(0.32, 0.6));
    g.fill = [-Math.sign(g.sunAz) * 0.7, 0.6, -0.3, 0.8];
    g.timbres = ['bell', 'glass', 'organ']; g.space = 0.8;
    g.pulse = frames || P * 2; g.floodTo = RH * 2.15; g.mistTop = RH * 1.6;
    const top = N * RH, rad = Math.min(half * 0.6, 4.2) - 0.5;
    g.door = { r: rad, kin: [0, 0.3], stranger: [0, Math.min(8.5, top - rad - g.path.y0 - 0.6)], from: 6, snap: frames ? [frames, 0] : null };
    g.facts = { levels: N, steps: n, width: Math.round(half * 2), painted, frames, kiosks, lamps };
    const ev = r.weighted([['tide', 5], [lamps ? 'lights' : 'none', 2.5], ['sunset', g.pal.hour === 1 ? 2 : 0], ['mist', 1.5], ['none', 2]]);
    if (ev === 'tide') { const down = r.chance(0.65); g.ev = { id: 0, type: 'tide', t0: 8, dur: 30, amount: down ? -RH * 2.02 : RH * 1.5 }; g.facts.tide = down ? 'down' : 'up'; }
    else if (ev === 'lights') g.ev = { id: 1, type: 'lights', t0: 7, dur: 30 };
    else if (ev === 'sunset') g.ev = { id: 0, type: 'sunset', t0: 8, dur: 32, toPal: r.pick(['Indigo Vat', 'Mulberry Night', 'Prussian', 'Lamp Black']) };
    else if (ev === 'mist') g.ev = { id: 0, type: 'mist', t0: 10, dur: 24 };
    if (!painted && r.chance(0.3)) {
      const type = r.pick([2, 3]), scale = type === 3 ? (half - 0.6) / 1.62 : half * 0.5;
      g.set = { type, pos: [0, type === 3 ? g.path.y0 - 1.55 * scale : 5, g.speed * r.range(22, 27)], scale, yaw: 0, attend: type === 2 ? 0.5 : 0.1, eye: 1.5, move: 0, lit: 0 };
      if (g.ev.type === 'none') g.ev = { id: 0, type: 'rise', t0: 9, dur: 13 };
      g.facts.setM = Math.round(SETS[type].tall * scale);
    }
  },
  words(g) {
    const f = g.facts;
    const bits = [`${cap(numWord(f.levels))} levels of steps go down to the water on both sides, ${numWord(f.steps)} steps to a flight.`];
    let name = 'The Stair';
    if (g.set.type) { const s = SETS[g.set.type]; name = `${cap(s.noun)} in the Stair`; bits.push(g.set.type === 2 ? `A ball ${numWord(f.setM)} metres across hangs over the water.` : s.line(f.setM)); }
    else if (f.painted) { name = 'The Painted Flight'; bits.push('One flight has been painted.'); }
    if (f.tide === 'down') { if (name === 'The Stair') name = 'Low Water at the Stair'; bits.push('The water goes out and shows the steps it was hiding.'); }
    else if (f.tide === 'up') { if (name === 'The Stair') name = 'The Stair Filling'; bits.push('The water is coming up the steps.'); }
    else if (g.ev.type === 'lights') bits.push('The lamps along the top come on one at a time.');
    else if (g.ev.type === 'sunset') bits.push('The sun goes while you are here.');
    else if (g.ev.type === 'mist') bits.push('Mist is filling the bottom of it.');
    else if (bits.length < 2) bits.push('Nobody is on any of them.');
    return { name, line: bits.join(' ') };
  },
  changeLines: {
    flooded: 'The same stair with two more levels under water.',
    drained: 'The same stair with the water gone. The steps go on down to a stone floor.',
    snow: 'The same stair. Every tread has its line of snow.',
    mist: 'The same stair with mist lying in the bottom of it.',
  },
};
