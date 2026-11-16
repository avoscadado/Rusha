// ---- CANAL: a water street between two rows of houses ----
FORMS.canal = {
  weight: 1.1,
  hours: [0, 1, 1, 2],
  mist: false,
  build(g, S) {
    const r = S('canal');
    const half = r.range(6.5, 11), B = Math.round(r.range(10, 17)), storey = r.range(3.0, 3.6);
    const low = storey * r.int(3, 5), more = storey * r.int(1, 5);
    const quay = r.range(2.2, 4);
    const bridges = r.chance(0.75) ? Math.round(r.range(80, 150) / B) * B : 0;
    const crown = r.range(5.6, 7.2);
    const odd = r.weighted([[0, 3], [1, 2.5], [2, 2.5], [3, 2]]);
    g.speed = r.range(5.4, 7.4); g.lead = 44; g.tilt = 0.012; g.focal = 1.9;
    g.path.y0 = r.range(2.6, 3.6);
    const oz = Math.round((g.speed * r.range(15, 21)) / B), side = r.chance(0.5) ? 1 : -1;
    const dusk = g.pal.hour !== 2;
    const lit = g.pal.hour === 0 ? r.range(0.12, 0.3) : g.pal.hour === 1 ? r.range(0, 0.08) : 0;
    g.tr.set([half, B, low, more, quay, bridges, crown, r.range(2.3, 3.1), storey, lit, oz, side, odd, r.chance(0.7) ? 1 : 0, r.range(0, 0.6), 0]);
    g.sea = [r.chance(0.6) ? 2 : 1, 0, r.range(0.5, 1), 0];
    g.air = [r.range(0.0032, 0.0048), r.int(5, 7), -100, 0];
    g.sky[3] = 0;
    // the sun or moon looks down the water, a little to one side
    g.sunAz = (r.chance(0.5) ? 1 : -1) * r.range(0.2, 0.5);
    if (g.pal.hour === 2) g.sunEl = r.range(0.5, 0.85);
    g.fill = [-Math.sign(g.sunAz) * 0.8, 0.5, -0.4, g.pal.hour === 0 ? 0.9 : 0.5];
    g.timbres = ['reed', 'bowed', 'glass']; g.space = 0.7;
    g.pulse = B; g.floodTo = 1.45;
    // the doors hang over the middle of the water, half way between two bridges
    g.door = { r: Math.min(half * 0.62, 4.6), kin: [0, 0.4], stranger: [0, 10.5], from: 5.5, snap: bridges ? [bridges, 0] : null };
    g.facts = { width: Math.round(half * 2), floors: Math.round(low / storey), floorsMax: Math.round((low + more) / storey), odd, bridges, dusk };
    const ev = r.weighted([['lights', dusk ? 6 : 0], ['tide', 2.5], ['sunset', g.pal.hour === 1 ? 2 : 0], ['snow', 1], ['none', dusk ? 1 : 3]]);
    if (ev === 'lights') g.ev = { id: 1, type: 'lights', t0: 6, dur: 34 };
    else if (ev === 'tide') { const up = r.chance(0.55); g.ev = { id: 0, type: 'tide', t0: 10, dur: 30, amount: up ? 1.25 : -1.3 }; g.facts.tide = up ? 'up' : 'down'; }
    else if (ev === 'sunset') g.ev = { id: 0, type: 'sunset', t0: 8, dur: 34, toPal: r.pick(['Indigo Vat', 'Mulberry Night', 'Prussian', 'Lamp Black']) };
    else if (ev === 'snow') g.ev = { id: 0, type: 'snow', t0: 10, dur: 22 };
    if (!odd && r.chance(0.3)) {                              // something standing in the water instead
      const type = r.pick([2, 3, 6]), scale = type === 3 ? (half - 1) / 1.62 : type === 6 ? (half - 0.5) / 1.5 : half * 0.42;
      g.set = { type, pos: [0, type === 3 ? g.path.y0 - 1.55 * scale : type === 2 ? 0.2 : -0.4, g.speed * r.range(22, 27)], scale, yaw: 0, attend: 0.1, eye: 1.5, move: 0, lit: 0 };
      if (type === 2) { g.set.pos[0] = half * 0.45; g.set.attend = 0.7; }
      if (g.ev.type === 'none') g.ev = { id: 0, type: 'rise', t0: 9, dur: 13 };
      g.facts.setM = Math.round(SETS[type].tall * scale);
    }
  },
  words(g) {
    const f = g.facts;
    const range = f.floorsMax > f.floors ? `${numWord(f.floors)} to ${numWord(f.floorsMax)}` : numWord(f.floors);
    const bits = [`Houses of ${range} storeys stand along a canal ${numWord(f.width)} metres wide.`];
    let name = 'The Canal';
    if (g.set.type) { const s = SETS[g.set.type]; name = `${cap(s.noun)} in the Canal`; bits.push(s.line(f.setM).replace('on the ground', 'on the water').replace('here by itself', 'in the water')); }
    else if (f.odd === 1) { name = 'The Painted House'; bits.push('One of them has been painted.'); }
    else if (f.odd === 2) { name = 'The Missing House'; bits.push('One is missing. The gap is exactly as wide as a house.'); }
    else if (f.odd === 3) { name = 'The Tall House'; bits.push('One is twice as high as its neighbours.'); }
    if (g.ev.type === 'lights') { if (name === 'The Canal') name = 'Rooms on the Water'; bits.push('The rooms light up one at a time.'); }
    else if (f.tide === 'up') { if (name === 'The Canal') name = 'High Water'; bits.push('The water comes up over the quays while you are here.'); }
    else if (f.tide === 'down') { if (name === 'The Canal') name = 'Low Water'; bits.push('The water goes down and leaves the walls dark.'); }
    else if (g.ev.type === 'sunset') bits.push('The sun goes while you are here.');
    else if (g.ev.type === 'snow') bits.push('It begins to snow.');
    else if (f.bridges && bits.length < 2) bits.push(`A bridge crosses every ${numWord(f.bridges)} metres.`);
    return { name, line: bits.join(' ') };
  },
  changeLines: {
    flooded: 'The same canal with the water over the quays and at the doors.',
    drained: 'The same canal with the water let out. The bed is three metres down.',
    later: 'The same canal a long time afterwards. Half the houses are gone and the water has not noticed.',
  },
  later(g) { g.tr[15] = 0.5; g.tr[9] = 0; if (g.ev.type === 'lights') g.ev.type = 'none'; g.sky[3] = 0.05; },
  night(g) { g.tr[9] = Math.max(g.tr[9], 0.22); },
};
