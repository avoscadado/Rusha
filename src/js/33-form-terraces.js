// ---- TERRACES: hillsides cut into level shelves, a valley along the flight line ----
FORMS.terraces = {
  weight: 1.1,
  // set pieces: half width in units of scale, and whether the way goes through
  SETW: { 1: [1.25, true], 2: [1.0, false], 3: [1.65, true], 4: [0.5, false], 5: [0.7, false], 6: [1.5, true], 7: [0.9, false], 8: [1.25, false] },
  // the hillside in profile: an S from 0 to 1 that leans toward the valley (the same curve as rawG in the shader)
  profile(s, lean) { const c = clamp(s, 0, 1), b = c * (1 + lean) / (1 + lean * c); return b * b * (3 - 2 * b); },
  build(g, S) {
    const r = S('terraces');
    const T = r.pick([3, 3, 4, 4, 5, 6, 8]);
    const H = r.range(85, 160);
    const slope = r.range(0.32, 1.15);
    let run = H / slope;
    let W = r.range(12, 34);
    const cove = r.chance(0.75) ? r.range(10, 34) : 0;
    const wave = r.range(230, 420);
    const c1 = r.range(0.4, 0.7);
    const lean = r.range(0, 1.8);
    const ks = TAU / r.range(150, 320), spur = r.chance(0.8) ? Math.min(r.range(20, 52), 1.5 / ks) : 0;
    const wet = r.weighted([[0, 3], [1, 3.5], [0.5, 2.5]]);
    const huts = r.chance(0.6) ? r.range(0.3, 0.75) : 0;
    g.speed = r.range(12, 18); g.lead = 90; g.focal = 2.0;
    const P = g.path;
    // the valley winds, and the line with it: the sway has its own stream
    const sw = S('sway');
    P.ax = sw.range(14, 55); P.fx = TAU / sw.range(520, 900); P.px = sw.range(0, TAU);
    P.ay = sw.range(0, 1.5); P.fy = TAU / sw.range(300, 500); P.py = sw.range(0, TAU);
    P.y0 = Math.max(11, H * r.range(0.1, 0.4));
    const doorR = 5.5;
    // one set piece on the valley floor, beside the line or across it; a narrow valley takes only the slim ones
    const rs = S('terraces set'), hasSet = rs.chance(0.36);
    let type = 0, scale = 10, onLine = false, hw = 1;
    if (hasSet) {
      type = rs.pick(W > 22 ? [1, 2, 3, 4, 5, 6, 7, 8, 8] : [1, 3, 4, 4, 6, 8]);
      [hw, onLine] = this.SETW[type];
      scale = onLine ? rs.range(8, 13) : clamp((W - 5) / (2 * hw), 5, rs.range(9, 15));
      if (type === 3) P.y0 = 1.55 * scale;
      if (type === 1) P.y0 = Math.min(P.y0, 2.0 * scale);
      if (type === 6) P.y0 = Math.min(P.y0, 1.5 * scale);
      if (onLine) P.ay = 0;
    }
    // water: a lake on the valley floor, a sea of mist, or dry. It stays under the portals.
    const clear = P.y0 - P.ay - doorR - 1.5;
    const water = r.weighted([['lake', 4], ['mist', 1], ['dry', 3]]);
    let drowned = 0;
    if (water === 'lake') {
      drowned = r.chance(0.35) ? Math.max(0, Math.min(r.int(1, 2), Math.floor(clear / T - 0.6))) : 0;
      g.sea = [r.chance(0.7) ? 2 : 1, Math.min(T * (drowned + r.range(0.3, 0.6)), clear), r.range(0.4, 1), 0];
    } else if (water === 'mist') {
      g.sea = [3, Math.min(T * r.range(1.3, 2.5), clear), 1, 0];
    }
    const dry = water === 'dry', level = dry ? 0 : g.sea[1];
    if (type === 3) P.y0 += level;
    g.tilt = onLine ? -0.02 - 0.0016 * P.y0 : -0.03 - 0.003 * P.y0;
    // the hills keep clear of the portals: widen the valley floor until they do
    const reach = 11 + doorR + 1.5, under = P.y0 - P.ay - 2.5;
    while (H * this.profile((reach - W) / run, lean) > under && W < 60) W += 1;
    // bounds on the slope and the curvature of the uncut ground, for the march
    let p1 = 0, p2 = 0;
    for (let i = 0; i <= 200; i++) {
      const s = i / 200, q = 1 + lean * s, b = s * (1 + lean) / q, b1 = (1 + lean) / (q * q), b2 = -2 * lean * (1 + lean) / (q * q * q);
      p1 = Math.max(p1, 6 * b * (1 - b) * b1); p2 = Math.max(p2, Math.abs(6 * (1 - 2 * b) * b1 * b1 + 6 * b * (1 - b) * b2));
    }
    const K = 1 / wave, nG = 2.12 * K, nH = 10.5 * K * K, ps = P.ax * P.fx;
    // no hillside steeper than two in one, however the spurs and the bends of the valley fall together
    const lat = Math.hypot(1, ps + 0.5 * spur * ks) + cove * nG;
    run = Math.max(run, H * (p1 * lat + c1 * nG * run) / 2);
    const ds = lat / run, hs = (P.ax * P.fx * P.fx + 0.5 * spur * ks * ks + cove * nH) / run;
    const G = H * (p1 * ds + c1 * nG);
    const C = H * (p2 * ds * ds + p1 * hs + 2 * p1 * c1 * ds * nG + c1 * nH);
    g.tr.set([T, H, W, cove, run, K, lean, c1, wet, huts, 1 / Math.hypot(1, G), C, ks, 0, r.pick([0, 1, 1]), spur]);
    g.floodTo = Math.max(Math.min(T * 2.55, clear), 0.5); g.mistTop = Math.min(T * 3 + 2, P.y0 - 2);
    g.door = { r: doorR, kin: [0, 0.5], stranger: [(r.chance(0.5) ? 1 : -1) * 11, 4.5] };
    g.pulse = 46; g.space = 0.75;
    g.timbres = ['reed', 'bell', 'breath'];
    // the numbers the words state: the tallest hills come to about nine tenths of H
    g.facts = { T, shelves: Math.round((0.9 * H) / T), floor: Math.round(2 * W), wet, water, drowned, huts: huts > 0, steep: slope > 0.85,
      under: dry ? 0 : Math.floor(level / T + 0.05) };
    if (hasSet) {
      const z = g.speed * rs.range(22, 27);
      const side = (rs.chance(0.5) ? 1 : -1) * (hw * scale + rs.range(4, 6));
      const x0 = P.ax * Math.sin(z * P.fx + P.px), tan = P.ax * P.fx * Math.cos(z * P.fx + P.px);
      g.set = { type, pos: [x0 + (onLine ? 0 : side), dry ? 0 : level - 0.05, z], scale, yaw: -Math.atan(tan), attend: onLine ? 0.15 : 0.7, eye: 2, move: 0, lit: 0 };
      g.ev = { id: 1, type: 'rise', t0: 9, dur: 13 };
      g.facts.setM = Math.round(SETS[type].tall * scale);
    } else {
      const pick = r.weighted([['none', 3], ['lights', huts && g.pal.hour !== 2 ? 4 : 0], ['mist', dry ? 2.5 : water === 'lake' ? 0.8 : 0], ['snow', 1.6],
        ['tide', water === 'lake' ? 3 : 0], ['sunset', g.pal.hour === 1 ? 4 : 0]]);
      if (pick === 'lights') { g.ev = { id: 2, type: 'lights', t0: 8, dur: 30 }; g.facts.lamps = true; }
      else if (pick === 'mist') g.ev = { id: 3, type: 'mist', t0: 12, dur: 24 };
      else if (pick === 'snow') g.ev = { id: 4, type: 'snow', t0: 10, dur: 22 };
      else if (pick === 'sunset') g.ev = { id: 5, type: 'sunset', t0: 8, dur: 34, toPal: r.pick(['Lamp Black', 'Indigo Vat', 'Mulberry Night', 'Prussian']) };
      else if (pick === 'tide') {
        // the lake comes up over whole shelves, or goes down and gives them back
        const up = drowned > 0 ? r.chance(0.25) : true;
        const n = up ? Math.min(2, Math.floor((clear - level) / T)) : drowned;
        if (n > 0) { g.ev = { id: 6, type: 'tide', t0: 9, dur: 30, amount: (up ? 1 : -1) * n * T }; g.facts.tide = up ? 'up' : 'down'; g.facts.tideN = n; }
      }
    }
  },
  words(g) {
    const f = g.facts, ev = g.ev.type, bits = [];
    const each = `${numWord(f.T)} metres above the last`;
    let name;
    if (g.set.type) {
      const s = SETS[g.set.type];
      name = `${cap(s.noun)} below the Terraces`;
      bits.push(`${cap(numWord(f.shelves))} shelves go up each side of the valley, each ${each}.`);
      bits.push(s.line(f.setM) + (ev === 'rise' ? ' ' + s.rise : ''));
    } else if (f.water === 'mist') {
      name = 'Shelves above the Mist';
      bits.push(`Mist fills the valley ${f.under > 1 ? numWord(f.under) + ' shelves' : 'one shelf'} deep.`);
      bits.push(`Every shelf is ${each}, and ${numWord(Math.max(f.shelves - f.under, 1))} of them stand clear.`);
    } else if (f.tide) {
      const n = f.tideN > 1 ? `${numWord(f.tideN)} shelves` : 'one shelf';
      name = f.tide === 'up' ? 'The Lake Rising' : 'Low Water at the Terraces';
      bits.push(`A lake lies on the valley floor and the shelves go up from it ${numWord(f.T)} metres at a time.`);
      bits.push(f.tide === 'up' ? `The water takes ${n} while you are here.` : `The water goes down and gives back ${n}.`);
    } else if (f.lamps) {
      name = 'Lamps on the Shelves';
      bits.push(`${cap(numWord(f.shelves))} shelves go up each side, each ${each}.`);
      bits.push('There is a house on a few of them. The lamps come on one at a time.');
    } else if (f.wet === 1) {
      name = f.water === 'lake' ? 'Paddies above the Lake' : 'Terraces';
      bits.push(`Every shelf is ${each}, and each one is full of water.`);
      if (f.water === 'lake') bits.push(`The lake below them is ${numWord(f.floor)} metres across at its narrowest.`);
      else if (f.huts) bits.push('Somebody keeps them.');
    } else if (f.T >= 6) {
      name = 'The Great Steps';
      bits.push(`Each step is ${numWord(f.T)} metres high. ${cap(numWord(f.shelves))} of them reach the top.`);
      if (f.water === 'lake') bits.push('The lowest stands in a lake.');
    } else if (f.water === 'lake') {
      name = f.drowned ? 'The Drowned Shelves' : 'The Stepped Lake';
      bits.push(`A lake ${numWord(f.floor)} metres across lies on the valley floor. The hills go up from it in ${numWord(f.shelves)} shelves.`);
      if (f.drowned) bits.push(f.drowned > 1 ? `${cap(numWord(f.drowned))} more are under the water.` : 'One more is under the water.');
    } else if (f.huts) {
      name = f.steep ? 'Steep Farms' : 'Hill Farms';
      bits.push(`${cap(numWord(f.shelves))} shelves go up each side, each ${each}. A few have a house on them.`);
    } else {
      name = 'The Stepped Valley';
      bits.push(`${cap(numWord(f.shelves))} shelves up each side and nobody on any of them.`);
      bits.push(`The floor between is ${numWord(f.floor)} metres wide.`);
    }
    if (bits.length < 3) {
      if (ev === 'sunset') bits.push('The sun goes while you are here.');
      else if (ev === 'mist') bits.push('The mist comes up the valley.');
      else if (ev === 'snow') bits.push('It begins to snow.');
    }
    return { name, line: bits.join(' ') };
  },
  changeLines: {
    later: 'The same hillsides a long time afterwards. Nobody keeps the shelves and every second one has slumped.',
    flooded: 'The same valley with the water let in. The lowest shelves are under it.',
    drained: 'The same valley with the lake let out. The floor is level and dry.',
    snow: 'The same terraces under snow. Every shelf is white and every riser is not.',
    mist: 'The same valley with mist lying along the bottom of it.',
  },
  // much later: nobody keeps the shelves. They are dry, every second one has slumped and the houses are gone.
  later(g) { g.tr[13] = 0.62; g.tr[8] = 0; g.tr[9] = 0; if (g.ev.type === 'lights') g.ev.type = 'none'; },
};
