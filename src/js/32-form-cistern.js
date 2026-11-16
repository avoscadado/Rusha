// ---- CISTERN: columns standing in water, under a roof with holes in it, or under none ----
FORMS.cistern = {
  weight: 1,
  mist: false, snow: false,
  build(g, S) {
    const r = S('cistern'), sw = S('sway'), cm = S('vantage');
    const bay = Math.round(r.range(9, 14));
    const rad = r.range(0.55, 0.95);
    const arc = r.weighted([[0, 1.5], [1, 2], [2, 3]]);
    const spring = r.range(4.5, 7.5);
    const H = arc ? spring + (bay * 0.5 - rad) + r.range(0.6, 2.2) : r.range(8, 14);
    const hole = r.chance(0.88) ? r.range(0.3, 0.42) * bay : 0;
    const every = hole ? r.pick([1, 2, 2, 3]) : 1;
    const odd = r.weighted([[0, 3], [1, 2.5], [2, 1.5], [3, 2]]);
    const open = S('roof').chance(0.36);                        // some of these halls never had a roof, or lost it
    g.speed = r.range(4.6, 6.4); g.lead = 34; g.focal = 1.85;
    g.path.y0 = r.range(2.1, 3.0);
    g.path.ax = sw.range(0.2, 0.5); g.path.fx = TAU / sw.range(160, 260); g.path.px = sw.range(0, TAU);
    const oz = Math.round((g.speed * r.range(15, 21)) / bay), side = r.chance(0.5) ? 1 : -1;
    const lamps = !open && (!hole || r.chance(0.3)) ? 1 : 0;
    g.tr.set([bay, H, spring, rad, r.chance(0.3) ? 1 : 0, arc, hole, every, oz, odd, side, rad * 0.75, lamps, open ? 1 : 0]);
    g.sea = [2, 0, r.range(0.35, 0.8), 0];
    const clear = Math.min(bay * 0.5 - rad * 1.4 - 0.8, 2.4);
    // the eye keeps to one side of the aisle and looks across it, so the rows open out
    g.comp = { x: -side * clear * cm.range(0.3, 0.55), y: 0, yaw: side * cm.range(0.06, 0.15) };
    g.tilt = cm.range(-0.05, 0.05);
    g.timbres = ['organ', 'bowed', 'bell']; g.pulse = bay; g.floodTo = 1.4;
    if (open) {
      g.air = [2.6 / (30 * bay), r.int(5, 7), -100, 0];
      g.space = 0.7;
      g.sunAz = (r.chance(0.5) ? 1 : -1) * r.range(0.4, 1.1);
      if (g.pal.hour === 2) g.sunEl = r.range(0.4, 0.75);
    } else {
      g.air = [2.6 / (22 * bay), r.int(5, 7), -100, 0];
      // the light comes down the holes, so the sun stands high
      g.sunAz = (r.chance(0.5) ? 1 : -1) * r.range(0.35, 1.1); g.sunEl = r.range(0.7, 1.0);
      g.sun = [0.03, 0.8, 3, 22]; g.elFix = true;
      g.sky = [0, 1, g.pal.hour === 0 ? 0.8 : 0, 0];
      g.fill = [-0.25 * Math.sign(g.sunAz), 0.35, -0.9, 1];
      g.interior = true; g.space = 0.95;
    }
    g.door = { r: clear, kin: [0, 0.1], stranger: [0, arc ? Math.min(spring + 0.5, H - clear - 0.8) - g.path.y0 : H - clear - 1.2 - g.path.y0] };
    g.facts = { bay, H: Math.round(H), odd, hole: !!hole, lamps: !!lamps, arc, open, v: S('words').int(0, 999) };
    const ev = r.weighted([['tide', 3], [lamps ? 'lights' : 'none', 3], ['none', 2]]);
    if (ev === 'tide') { const down = r.chance(0.5); g.ev = { id: 1, type: 'tide', t0: 10, dur: 30, amount: down ? -0.55 : 1.0 }; g.facts.tide = down ? 'down' : 'up'; }
    else if (ev === 'lights') g.ev = { id: 2, type: 'lights', t0: 8, dur: 28 };
  },
  words(g) {
    const f = g.facts;
    const name = f.odd === 1 ? 'The Painted Column' : f.odd === 2 ? 'The Missing Column' : f.odd === 3 ? 'The Broken Column'
      : f.tide === 'down' ? 'Low Water in the Cistern' : f.tide === 'up' ? 'The Cistern Filling'
      : f.open ? 'Columns in the Open' : f.arc === 2 ? 'The Long Cistern' : f.arc === 1 ? 'The Arcade' : 'The Columns';
    const rules = f.open
      ? ['Columns stand in a hand\'s depth of water and hold up nothing.', 'A hall with no roof, or a roof that left. The columns stayed.', 'Rows of columns in shallow water, open to the sky.']
      : ['A roof on columns over a hand\'s depth of water.', 'Whoever built this left holes for the light and nowhere to stand.', 'Columns in shallow water, and a roof to keep the sky off them.'];
    const second = f.odd === 1 ? 'One of them has been painted.' : f.odd === 2 ? (f.open ? 'One is missing.' : 'One is missing and the roof has not noticed.')
      : f.odd === 3 ? 'One is broken off at the knee.'
      : f.tide === 'down' ? 'The water is going down and leaves a dark line.' : f.tide === 'up' ? 'The water is rising.'
      : g.ev.type === 'lights' ? 'Someone left lamps, and they come on one at a time.' : f.open ? 'They go on further than the eye does.' : 'The rows go on further than the light does.';
    let line = `${rules[f.v % rules.length]} ${second}`;
    if (f.odd && f.tide) line += f.tide === 'down' ? ' The water is going down.' : ' The water is rising.';
    return { name, line, data: `columns ${f.H} m` };
  },
  changeLines: {
    drained: 'The water has been let out. The floor it was hiding is stone flags.',
    flooded: 'The water is a man deep now.',
  },
  later(g) {
    if (g.tr[13] > 0.5) { g.tr[5] = 0; g.tr[9] = 3; g.laterLine = 'The arches have come down. The columns have not.'; }
    else { g.tr[13] = 1; g.interior = false; g.elFix = false; g.sunEl = 0.45; g.air[0] *= 0.6; g.sky[0] = 0.5; g.fill = [0, 1, 0, 0]; g.laterLine = 'The roof has gone and the columns have not.'; }
  },
};
