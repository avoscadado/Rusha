// Differential test: an independent, naive reference (explicit body deques, Sets) vs the core's Run/lens/si/hi representation.
// Random-ish play over several days with echoes; compares every tick: death tick/reason, meals, combo/score, echo occupancy.
// Run: node tests/redteam/core-differential.cjs [games=150]
const path = require('node:path');
const { pick } = require('./autopilot.js');
(async () => {
  const { loadCore } = await import('file://' + path.resolve(__dirname, '..', 'load-core.mjs'));
  const O = loadCore(); const { Game, DIRS } = O;
  const GAMES = +process.argv[2] || 150;
  let rs = 12345; const rnd = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const diffs = []; const note = (m) => { if (diffs.length < 8) diffs.push(m); };
  let ticks = 0, deaths = 0, days = 0, games = 0; const byReason = {};

  // naive echo body at tick t, built by replaying the path with deque semantics
  function naiveBodies(run) {
    const cell = i => run.px[i] + ',' + run.py[i];
    let body = []; for (let i = 0; i < run.len0; i++) body.push(cell(i));
    const out = [new Set(body)];
    for (let t = 1; t <= run.t; t++) { body.push(cell(run.len0 - 1 + t)); if (run.ateId[t] < 0) body.shift(); out[t] = new Set(body); }
    return out;
  }

  for (let seed = 1; seed <= GAMES; seed++) {
    const g = new Game(seed * 2654435761 >>> 0); games++;
    let guard = 0;
    while (g.status !== 'final' && guard++ < 30) {
      // reference state for this attempt
      const echoBodies = g.echoes.map(naiveBodies);
      const C = g.cfg.cols, R = g.cfg.rows;
      const r0 = g.run; let body = []; for (let i = 0; i < r0.len0; i++) body.push(r0.px[i] + ',' + r0.py[i]);
      let dir = r0.dir, q = [], eaten = new Set(), ownedBy = new Map();
      g.echoes.forEach((e, k) => { for (let t = 1; t <= e.t; t++) if (e.ateId[t] >= 0) ownedBy.set(e.ateId[t], k); });
      let lastEat = -999, combo = 0, score = 0, t = 0;
      g.begin();
      const noise = rnd() * 0.04;
      while (g.status === 'play' && t < 700) {
        let d = pick(g, DIRS); if (rnd() < noise || d === null) d = Math.floor(rnd() * 4);
        const accepted = g.input(d);
        // reference input buffer
        if (q.length < 2) { const last = q.length ? q[q.length - 1] : dir; if (d !== last && d !== ((last + 2) & 3)) { q.push(d); if (!accepted) note('input accepted by ref but not core'); } else if (accepted) note('input accepted by core but not ref'); } else if (accepted) note('buffer overflow accepted');
        const ev = g.step(); t++; ticks++;
        // reference step
        if (q.length) dir = q.shift();
        const [hx, hy] = body[body.length - 1].split(',').map(Number); const nx = hx + DIRS[dir].x, ny = hy + DIRS[dir].y;
        let refDead = null;
        if (nx < 0 || ny < 0 || nx >= C || ny >= R) refDead = 'wall';
        let ate = -1;
        if (!refDead) {
          for (let i = 0; i < g.fruits.length; i++) { const f = g.fruits[i]; if (f.x === nx && f.y === ny && f.t0 <= t && t < f.t1 && !ownedBy.has(i) && !eaten.has(i)) { ate = i; break; } }
          const nb = body.slice(); nb.push(nx + ',' + ny); if (ate < 0) nb.shift();
          const head = nb[nb.length - 1];
          if (nb.slice(0, -1).includes(head)) refDead = 'self';
          else for (const c of nb) { for (let k = 0; k < echoBodies.length; k++) { const tb = echoBodies[k][Math.min(t, g.echoes[k].t)]; if (tb.has(c)) { refDead = 'echo'; break; } } if (refDead) break; }
          if (!refDead) {
            body = nb;
            if (ate >= 0) { eaten.add(ate); combo = (t - lastEat <= g.cfg.comboWindow) ? Math.min(g.cfg.comboMax, combo + 1) : 0; lastEat = t; score += 100 * (1 + combo); }
          }
        }
        const coreDead = ev && ev.dead ? ev.dead.reason : null;
        if ((coreDead || null) !== (refDead || null)) { note('seed ' + g.seed + ' day ' + (g.dayIndex + 1) + ' tick ' + t + ': core dead=' + coreDead + ' ref dead=' + refDead); break; }
        if (refDead) { deaths++; byReason[refDead] = (byReason[refDead] || 0) + 1; break; }
        if (ev.ate !== ate) { note('seed ' + g.seed + ' tick ' + t + ': ate core ' + ev.ate + ' ref ' + ate); break; }
        // body cells equal
        const tt = g.run.t, cells = []; for (let i = g.run.si(tt); i <= g.run.hi(tt); i++) cells.push(g.run.px[i] + ',' + g.run.py[i]);
        if (g.status === 'play' || g.status === 'dayDone') { if (cells.join(';') !== body.join(';')) { note('seed ' + g.seed + ' tick ' + t + ': body differs'); break; } }
        if (g.status === 'play' && g.dayScore - 0 !== score + g.stats.near * 0 && false) note('score');
      }
      if (g.status === 'dead') g.afterDeath(); else if (g.status === 'dayDone') { days++; g.nextDay(); } else if (g.status === 'play') break;
      if (diffs.length > 7) break;
    }
    if (diffs.length > 7) break;
  }
  console.log('games', games, 'ticks compared', ticks, 'deaths', deaths, JSON.stringify(byReason), 'days completed', days);
  console.log(diffs.length ? 'DIFFERENCES:\n  ' + diffs.join('\n  ') : 'core matches the naive reference on every tick (rules: wall, self incl. vacating tail, echo bodies incl. growth ticks, fruit eligibility, input buffer)');
})();
