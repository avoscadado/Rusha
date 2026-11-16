// ---- VIADUCT: arches that cross nothing, from one horizon to the other ----
// The datum is y = 0: the water, the mist or the ground the piers stand in.
FORMS.viaduct = {
  weight: 0,
  build(g, S) {
    const r = S('viaduct'), rv = S('viaduct.view'), rl = S('viaduct.light'), re = S('viaduct.event');
    const hour = g.pal.hour;
    // ---- the structure ----
    const lay = r.weighted([[0, 6], [1, 1.5], [2, 1.7]]);         // one viaduct, an avenue of two, a nave under one deck
    const under = r.weighted([['mist', 4.5], ['mirror', 2], ['water', 1.3], ['dry', 2.8]]);
    const bay = Math.round(r.range(20, 40));
    const gap = r.range(13, 20);                                 // nave only: half the clear width between the two rows
    let Hall = r.range(30, 90);
    if (lay === 2) Hall = Math.max(Hall, gap + 31 + r.range(0, 14));
    const pw = Math.max(2, bay * r.range(0.085, 0.135));
    const a = bay / 2 - pw;
    const k = r.chance(0.3) ? r.range(1.22, 1.45) : 1;
    const rise = k * a, band = r.range(1.9, 3.4);
    // an arcade of small arches along the top, as an aqueduct has
    let nUp = lay === 2 ? 0 : r.weighted([[0, 4.5], [2, 1.2], [3, 2], [4, 1.5]]), hT = 0;
    if (nUp) {
      const a2 = bay / nUp / 2 - Math.max(0.8, 0.15 * bay / nUp);
      hT = a2 * r.range(1.5, 2.4) + 1.3;
      if (hT > Hall * 0.3) { nUp = 0; hT = 0; }
    }
    Hall = Math.round(Hall);
    const Hm = Hall - 2.4 - hT;                                  // cornice and parapet make up the rest
    const tMin = rise + band + 0.3 * a;
    const nMax = clamp(Math.floor(Hm / tMin), 1, 4);
    const N = r.weighted([[1, 3], [2, nMax >= 2 ? 3.2 : 0], [3, nMax >= 3 ? 2.2 : 0], [4, nMax >= 4 ? 1.2 : 0]]);
    const T = N === 1 ? Math.min(Hm, rise + band + 1) : Math.min(Hm / N, tMin * r.range(1, 1.5));
    const hs = T - band - rise;
    const w = r.range(1.9, 2.9) + Hall / 60;
    const pil = r.chance(0.55), open = !pil && r.chance(0.55);
    const eFoot = pil ? 0.35 + 0.5 * w : 0;                      // how far a pier stands out from the wall at the datum
    const reach = w + eFoot + 0.9 + 0.3;                         // nothing of the viaduct is farther from its centre plane, low down
    let lamps = r.chance(0.45);

    // ---- the flight ----
    g.speed = rv.range(10, 15); g.lead = 70;
    const side = lay === 0 ? (rv.chance(0.5) ? 1 : -1) : 1;      // which side the viaduct stands on
    const exSide = rv.chance(0.5) ? 1 : -1;
    const view = lay === 2 ? 'nave' : rv.weighted([['low', 3], ['mid', 2], ['deck', lay === 0 ? 2.6 : 0], ['climb', 2.2]]);
    let X0, doorR = 5;
    const P = g.path;
    if (lay === 0) {
      X0 = view === 'deck' ? rv.range(20, 30) : clamp(Hall * rv.range(0.55, 1.0), 30, 78);
      const room = X0 - reach - doorR - 7;                       // sideways room for the line to wander in
      P.ax = Math.min(room, X0 * rv.range(0.25, 0.5), view === 'deck' ? 5 : 40);
      P.fx = TAU / rv.range(1300, 2100);
      P.px = -side * (Math.PI / 2 + rv.range(-0.25, 0.35));      // far out at first, then closing on the arches
    } else if (lay === 1) {
      X0 = rv.range(24, 36) + reach;
      P.ax = Math.min(X0 - reach - doorR - 9, rv.range(2, 8));
      P.fx = TAU / rv.range(700, 1300); P.px = rv.range(0, TAU);
    } else {
      X0 = gap + w + 0.25;
      doorR = 4.2;
      P.ax = Math.min(X0 - reach - doorR - 2.5, rv.range(2, 6));
      P.fx = TAU / rv.range(500, 900); P.px = rv.range(0, TAU);
    }
    if (view === 'low') { P.y0 = rv.range(5.5, 10); P.ay = rv.range(0, 1.2); P.fy = TAU / rv.range(500, 900); g.tilt = rv.range(0.06, 0.13); g.focal = 1.8; }
    else if (view === 'mid') { P.y0 = Hall * rv.range(0.32, 0.6); P.ay = rv.range(0, 3); P.fy = TAU / rv.range(600, 1100); g.tilt = rv.range(-0.02, 0.04); }
    else if (view === 'deck') { P.y0 = Hall + rv.range(3.5, 9); P.ay = rv.range(0, 1.5); P.fy = TAU / rv.range(600, 1100); g.tilt = rv.range(-0.08, -0.04); }
    else if (view === 'climb') {                                 // from the feet of the piers to the parapet in one visit
      const lo = rv.range(6, 9), hi = Hall + rv.range(2, 7);
      P.y0 = (lo + hi) / 2; P.ay = (hi - lo) / 2; P.fy = Math.PI / (g.speed * rv.range(58, 70)); P.py = -Math.PI / 2; g.tilt = 0.03;
    } else {
      const hr = Hm - 2.3 - gap;                                 // springing of the ribs across the nave
      P.y0 = rv.range(5.5, Math.max(6, Math.min(11, hr - 3 * doorR - 3))); g.tilt = rv.range(0.03, 0.08); g.focal = 1.8;
      g.speed = rv.range(8, 11.5); g.lead = 55;
    }
    P.py = P.py || rv.range(0, TAU);
    const ymin = P.y0 - Math.abs(P.ay);

    // ---- what lies under it, and what happens ----
    let floor = 0, riseTo = 0;
    g.floodTo = 1.2;
    const f = g.facts = { H: Hall, span: Math.round(2 * a), bay, N, nUp, tiers: N + (nUp ? 1 : 0), lay, under, view, pointed: k > 1 };
    const pick = (opts) => re.weighted(opts.concat([['sunset', hour === 1 ? 3 : 0]]));
    let ev;
    if (under === 'mist') {
      g.sea = [3, 0, 0, 0]; floor = -90;
      ev = pick([['none', 3], ['mistup', 1.6], ['mistdown', 1.6], ['fog', 1.5], ['lights', 2.4]]);
      if (ev === 'mistup') {
        riseTo = Math.min(ymin - 4.5, re.range(5, 12));
        if (riseTo < 2) { ev = 'none'; riseTo = 0; } else { g.ev = { id: 1, type: 'tide', t0: 9, dur: 32, amount: riseTo }; f.mist = 'up'; }
      } else if (ev === 'mistdown') { g.ev = { id: 1, type: 'tide', t0: 9, dur: 34, amount: -re.range(9, 22) }; f.mist = 'down'; }
    } else if (under === 'dry') {
      ev = pick([['none', 2], ['mistin', 3.4], ['fog', 1.4], ['lights', 2]]);
      if (ev === 'mistin') {                                     // a sea of mist comes up through the ground and gives it a river
        riseTo = Math.min(ymin - 4.5, re.range(2.5, 6));
        if (riseTo < 1.5) { ev = 'none'; riseTo = 0; } else { g.sea = [3, -1.2, 0, 0]; g.ev = { id: 1, type: 'tide', t0: 12, dur: 26, amount: riseTo + 1.2 }; f.mist = 'in'; }
      }
    } else {
      g.sea = [under === 'mirror' ? 2 : 1, 0, under === 'mirror' ? re.range(0.3, 0.75) : re.range(0.6, 1), 0];
      floor = -0.3;
      ev = pick([['none', 2.2], ['down', 2.4], ['up', 1.2], ['fog', 1.2], ['lights', 2]]);
      if (ev === 'down') { const to = -re.range(2.5, 5); floor = to - 0.4; g.ev = { id: 1, type: 'tide', t0: 10, dur: 30, amount: to }; f.tide = 'down'; }
      else if (ev === 'up') {
        riseTo = Math.min(ymin - 4.5, re.range(1.5, 3));
        if (riseTo < 1) { ev = 'none'; riseTo = 0; } else { g.ev = { id: 1, type: 'tide', t0: 10, dur: 30, amount: riseTo }; f.tide = 'up'; }
      }
    }
    g.mistTop = clamp(Hall * 0.22, 6, 15);
    if (ev === 'fog') { g.ev = { id: 3, type: 'mist', t0: 12, dur: 24 }; f.fog = true; }
    else if (ev === 'lights') { lamps = true; g.ev = { id: 2, type: 'lights', t0: 8, dur: 30 }; }
    else if (ev === 'sunset') g.ev = { id: 5, type: 'sunset', t0: 8, dur: 34, toPal: re.pick(['Lamp Black', 'Indigo Vat', 'Mulberry Night', 'Prussian']) };
    f.lamps = lamps; f.ev = g.ev.type;

    // ---- the one exception, where the flight will pass it ----
    const loud = g.ev.type === 'lights' || f.mist === 'in';
    const ex = r.weighted([[0, loud ? 6 : 2.2], [1, 3.2], [2, 2], [3, 1.8]]);
    const oz = Math.max(2, Math.round((g.speed * r.range(15, 21)) / bay));
    f.ex = ex;

    // ---- portals: both hang in clear air on the open side, above whatever the datum does ----
    const kinY = Math.max(0.4, Math.max(g.floodTo, riseTo) + 1 + doorR - ymin);
    const stranger = lay === 2 ? [0, kinY + 2 * doorR + 0.8]
      : lay === 1 ? [exSide * 3, kinY + 2 * doorR + 0.6]
      : [-side * (2 * doorR + rv.range(1, 3)), kinY + doorR * rv.range(0.7, 1.3)];
    g.door = { r: doorR, kin: [0, kinY], stranger };

    // ---- light: the sun either rakes the face from the open side or comes through the arches ----
    const through = lay === 2 ? true : rl.chance(0.5);
    const sunSide = lay === 0 ? (through ? side : -side) : (rl.chance(0.5) ? 1 : -1);
    const az = hour === 1 ? rl.range(0.3, 0.72) : hour === 2 ? rl.range(0.5, 1.1) : rl.range(0.32, 0.9);
    g.sunAz = sunSide * az;
    if (hour === 1) g.sunEl = rl.range(0.075, 0.17);
    if (hour === 2) g.sunEl = rl.range(0.36, 0.72);
    if (under === 'dry' && g.sunEl < 0.135) g.sunEl = rl.range(0.135, 0.19);   // enough to print shadows on level ground
    if (lay === 2) g.sunEl = Math.min(g.sunEl, 0.5);
    g.fill = through ? [-sunSide, 0.3, -0.15, 1] : [0.1 * sunSide, 0.25, -1, 0.8];
    const shafts = lay === 2 && hour !== 0 && rl.chance(0.7);
    f.through = through;
    g.air = [lay === 2 ? rl.range(0.0022, 0.003) : rl.range(0.0013, 0.0021), rl.int(5, 8), -100, 0];
    if (lay === 2) g.sky[3] = 0;

    g.tr.set([bay, Hm, T, N + 10 * nUp, pw, w, k, hs, hT, lay === 0 ? side * X0 : X0, lay, floor,
      ex, ex ? oz * (lay === 1 ? exSide : 1) : 0, 0, (lamps ? 1 : 0) + (pil ? 4 : 0) + (open ? 8 : 0) + (shafts ? 16 : 0)]);
    g.pulse = bay;
    g.timbres = ['bowed', 'bell', 'organ'];
    g.space = lay === 2 ? 0.9 : 0.75;
  },

  words(g) {
    const f = g.facts, H = numWord(f.H), span = numWord(f.span), bay = numWord(f.bay), tiers = numWord(f.tiers);
    // the structure, in numbers the plate shows
    let first;
    if (f.lay === 2) first = `Two rows of piers carry one deck ${H} metres up, and the way goes between them.`;
    else if (f.lay === 1) first = `Two viaducts ${H} metres high run side by side and do not meet.`;
    else if (f.nUp && f.N === 1) first = `Arches ${span} metres wide carry smaller arches, and those carry a deck that goes nowhere.`;
    else if (f.tiers >= 3) first = `${cap(tiers)} tiers of arches stand one on another, ${H} metres to the deck.`;
    else if (f.tiers === 2) first = `Two tiers of arches ${span} metres wide carry a deck ${H} metres up.`;
    else if (f.view === 'deck') first = `The deck is ${H} metres up and has a pier under it every ${bay} metres.`;
    else first = `Piers ${H} metres high carry arches ${span} metres wide from one horizon to the other.`;
    const nothing = ['It crosses nothing.', f.under === 'mist' ? 'The mist stands where a river would.' : f.under === 'dry' ? 'The ground under it is level and dry.' : 'The water under it is standing water.'];
    const odd = { 1: ['One span is down.', 'The others have not moved.'], 2: ['One pier has been painted.', 'Nobody has painted the next.'], 3: ['One arch has been walled up, with a door in the wall.'] }[f.ex];
    const then = f.mist === 'in' ? 'The mist comes in while you are here and gives it a river.'
      : f.mist === 'up' ? 'The mist is rising up the piers.'
      : f.mist === 'down' ? 'The mist is going out, and the piers are longer than they looked.'
      : f.tide === 'down' ? 'The water goes down while you are here and leaves a dark line on every pier.'
      : f.tide === 'up' ? 'The water is rising.'
      : f.fog ? 'Fog comes in under the arches.'
      : f.ev === 'lights' ? (f.lay === 2 ? 'Lamps stand at the feet of the piers and come on one at a time.' : 'The lamps along the parapet come on one at a time.')
      : f.ev === 'sunset' ? 'The sun goes while you are here.' : '';
    const mid = odd || nothing;
    const bits = then ? [first, mid[0], then] : [first, mid[0], mid[1] || nothing[0]];
    const name = f.ex === 1 ? 'The Fallen Arch' : f.ex === 2 ? 'The Painted Pier' : f.ex === 3 ? 'The Blind Arch'
      : f.mist === 'in' ? 'The Viaduct at Dusk'
      : f.mist === 'down' ? 'Mist Going Out'
      : f.tide === 'down' ? 'Low Water at the Viaduct'
      : f.ev === 'lights' ? (f.lay === 2 ? 'Lamps under the Deck' : 'Lamps on the Parapet')
      : f.lay === 2 ? 'Under the Deck'
      : f.lay === 1 ? 'Two Viaducts'
      : f.tiers >= 3 ? `${cap(tiers)} Tiers`
      : f.tiers === 2 ? 'Two Tiers'
      : f.view === 'deck' ? 'The High Line'
      : f.pointed ? 'The Pointed Arches'
      : f.H >= 60 ? 'The Tall Viaduct' : 'The Viaduct';
    return { name, line: bits.join(' ') };
  },

  changeLines: {
    later: 'The same viaduct a long time afterwards. Spans are down all along it, and some piers stand by themselves.',
    flooded: 'The same viaduct with water under it at last. It comes a little way up the piers.',
    drained: 'The same viaduct with the water gone. Every pier has a dark foot.',
    mist: 'The same viaduct. Mist has come in under the arches and given it a river.',
    night: 'The same viaduct after dark. It still crosses nothing.',
    snow: 'The same viaduct under snow. There is a white line along the parapet.',
  },
  // much later: spans are down all along the line, and nothing is lit
  later(g, r) {
    g.tr[14] = r.range(0.3, 0.46);
    if (g.tr[12] === 1) g.tr[12] = 0;
    g.tr[15] -= (g.tr[15] % 4 >= 2 ? 2 : 0) + (g.tr[15] % 2);
    if (g.ev.type === 'lights') g.ev.type = 'none';
  },
  // after dark the parapet lamps, where there are any, are already on
  night(g) {
    if (g.tr[15] % 2 >= 1 && g.tr[14] === 0 && g.tr[15] % 4 < 2) { g.tr[15] += 2; if (g.ev.type === 'lights') g.ev.type = 'none'; }
  },
};
