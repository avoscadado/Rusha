// ---- CANAL: a water street between two rows of houses ----
FORMS.canal = {
  weight: 1.1,
  hours: [0, 1, 1, 2],
  mist: false,
  build(g, S) {
    const r = S('canal'), cm = S('vantage');
    const half = r.range(6.5, 11), B = Math.round(r.range(10, 17)), storey = r.range(3.0, 3.6);
    const low = storey * r.int(3, 5), more = storey * r.int(1, 5);
    const quay = r.range(2.2, 4);
    const bridges = r.chance(0.75) ? Math.round(r.range(80, 150) / B) * B : 0;
    const crown = r.range(5.6, 7.2);
    const odd = r.weighted([[0, 3], [1, 2.5], [2, 2.5], [3, 2]]);
    g.speed = r.range(5.4, 7.4); g.lead = 44; g.tilt = cm.range(-0.03, 0.09); g.focal = 1.9;
    g.path.y0 = r.range(2.6, 3.6);
    // the canal itself bends, and the line of flight with it
    const sw = S('sway');
    g.path.ax = sw.range(16, 34); g.path.fx = TAU / sw.range(440, 720); g.path.px = sw.range(0, TAU);
    // the eye rides nearer one quay than the other
    const vs = cm.chance(0.5) ? 1 : -1;
    g.comp = { x: vs * (half - 3.4) * cm.range(0.45, 0.85), y: 0, yaw: -vs * cm.range(0.03, 0.09) };
    const oz = Math.round((g.speed * r.range(15, 21)) / B), side = r.chance(0.5) ? 1 : -1;
    const dusk = g.pal.hour !== 2;
    const lit = g.pal.hour === 0 ? r.range(0.12, 0.3) : g.pal.hour === 1 ? r.range(0, 0.08) : 0;
    g.tr.set([half, B, low, more, quay, bridges, crown, r.range(2.3, 3.1), storey, lit, oz, side, odd, r.chance(0.7) ? 1 : 0, r.range(0, 0.6), 0]);
    g.sea = [r.chance(0.6) ? 2 : 1, 0, r.range(0.5, 1), 0];
    g.air = [r.range(0.0046, 0.0064), r.int(4, 5), -100, 0];
    g.sky[3] = 0;
    // the sun or moon looks down the water, a little to one side
    g.sunAz = (r.chance(0.5) ? 1 : -1) * r.range(0.2, 0.5);
    if (g.pal.hour === 2) g.sunEl = r.range(0.5, 0.85);
    g.fill = [-Math.sign(g.sunAz) * 0.8, 0.5, -0.4, g.pal.hour === 0 ? 0.9 : 0.5];
    g.timbres = ['reed', 'bowed', 'glass']; g.space = 0.7;
    g.pulse = B; g.floodTo = 1.45;
    // the doors hang over the middle of the water, half way between two bridges
    // the doors hang over the water half way between two bridges, kin to one side and low, the stranger to the other and high
    const rad = Math.min(half * 0.46, 3.6), dx = Math.min(half - rad - 1.6, 3.4);
    g.door = { r: rad, kin: [-vs * dx, 0.5], stranger: [vs * dx, 7.6], from: 5.5, snap: bridges ? [bridges, 0] : null };
    g.facts = { v: S('words').int(0, 999), width: Math.round(half * 2), floors: Math.round(low / storey), floorsMax: Math.round((low + more) / storey), odd, bridges, dusk };
    const ev = r.weighted([['lights', dusk ? 6 : 0], ['tide', 2.5], ['sunset', g.pal.hour === 1 ? 2 : 0], ['snow', 1], ['none', dusk ? 1 : 3]]);
    if (ev === 'lights') g.ev = { id: 1, type: 'lights', t0: 6, dur: 34 };
    else if (ev === 'tide') { const up = r.chance(0.55); g.ev = { id: 0, type: 'tide', t0: 10, dur: 30, amount: up ? 1.25 : -1.3 }; g.facts.tide = up ? 'up' : 'down'; }
    else if (ev === 'sunset') g.ev = { id: 0, type: 'sunset', t0: 8, dur: 34, toPal: r.pick(['Indigo Vat', 'Mulberry Night', 'Prussian', 'Lamp Black']) };
    else if (ev === 'snow') g.ev = { id: 0, type: 'snow', t0: 10, dur: 22 };
    if (!odd && r.chance(0.3)) {                              // something standing in the water instead
      const type = r.pick([2, 3, 6]), scale = type === 3 ? (half - 1) / 1.62 : type === 6 ? (half - 0.5) / 1.5 : half * 0.42;
      const sz = g.speed * r.range(22, 27), mid = g.path.ax * Math.sin(sz * g.path.fx + g.path.px);
      g.set = { type, pos: [mid, type === 3 ? g.path.y0 - 1.55 * scale : type === 2 ? 0.2 : -0.4, sz], scale, yaw: 0, attend: 0.1, eye: 1.5, move: 0, lit: 0 };
      if (type === 2) { g.set.pos[0] = mid - vs * half * 0.45; g.set.attend = 0.7; }
      else g.comp.x *= 0.2;                                     // through a ring or under an arch, keep to the middle
      if (g.ev.type === 'none') g.ev = { id: 0, type: 'rise', t0: 9, dur: 13 };
      g.facts.setM = Math.round(SETS[type].tall * scale);
    }
  },
  words(g) {
    const f = g.facts;
    const rules = ['Houses stand shoulder to shoulder along the water and nothing passes on it.', 'A street that is all water, with a house on every plot.',
      'The canal bends and the houses bend with it.'];
    let name = 'The Canal', second = '';
    if (g.set.type) {
      const s = SETS[g.set.type]; name = `${cap(s.noun)} in the Canal`;
      second = s.line(f.setM).replace('on the ground', 'on the water').replace('here by itself', 'in the water');
      return { name, line: second + (g.ev.type === 'lights' ? ' The rooms light up one at a time.' : ''), data: `canal ${f.width} m` };
    }
    if (f.odd === 1) { name = 'The Painted House'; second = 'One house has been painted.'; }
    else if (f.odd === 2) { name = 'The Missing House'; second = 'One house is missing. The gap is exactly as wide as a house.'; }
    else if (f.odd === 3) { name = 'The Tall House'; second = 'Every house agreed on a height except one.'; }
    let third = '';
    if (g.ev.type === 'lights') { if (name === 'The Canal') name = 'Rooms on the Water'; third = 'The rooms light up one at a time.'; }
    else if (f.tide === 'up') { if (name === 'The Canal') name = 'High Water'; third = 'The water is coming up over the quays.'; }
    else if (f.tide === 'down') { if (name === 'The Canal') name = 'Low Water'; third = 'The water is going down and leaves the walls dark.'; }
    else if (g.ev.type === 'sunset') third = 'The sun goes.';
    else if (g.ev.type === 'snow') third = 'It begins to snow.';
    const first = second ? '' : rules[f.v % rules.length];
    return { name, line: [first, second, third].filter(Boolean).join(' '), data: `canal ${f.width} m` };
  },
  changeLines: {
    flooded: 'The water is over the quays and at the doors.',
    drained: 'The water has been let out. The bed is three metres down.',
    later: 'Half the houses are gone and the water has not noticed.',
  },
  later(g) { g.tr[15] = 0.5; g.tr[9] = 0; if (g.ev.type === 'lights') g.ev.type = 'none'; g.sky[3] = 0.05; },
  night(g) { g.tr[9] = Math.max(g.tr[9], 0.22); },
};
