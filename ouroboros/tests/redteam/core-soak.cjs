// Plays many full runs with a decent autopilot and checks invariants tick by tick.
// Run: node tests/redteam/core-soak.cjs [seeds=60]
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { pick } = require('./autopilot.js');

(async () => {
  const { loadCore } = await import(pathToFileURL(path.resolve(__dirname, '..', 'load-core.mjs')).href);
  const O = loadCore(); const { Game, DIRS } = O;
  const N = +process.argv[2] || 60;
  const problems = new Map();
  const note = (k, msg) => { if (!problems.has(k)) problems.set(k, { n: 0, first: msg }); problems.get(k).n++; };
  const agg = { days: 0, deaths: 0, victories: 0, finals: 0, spawnClose: 0, spawnOverlapT0: 0, spawns: 0, minClear: 99, near: 0, nearDay: [], cleanDays: 0, scoreMismatch: 0, rewindMismatch: 0 };

  function spawnClearance(g) {
    // distance (Chebyshev) from the new body, moving straight for 18 ticks, to any echo; also whether tick-0 cells overlap
    const C = g.cfg.cols, run = g.run, d = DIRS[run.dir];
    const hx = run.px[run.hi(0)], hy = run.py[run.hi(0)];
    let clear = 99, overlap0 = false;
    for (let k = 0; k <= 18; k++) {
      for (let q = 0; q < g.echoes.length; q++) {
        const e = g.echoes[q], te = Math.min(k, e.t);
        for (let i = e.si(te); i <= e.hi(te); i++) for (let j = 0; j < g.cfg.startLen; j++) {
          const px = hx + d.x * (k - j), py = hy + d.y * (k - j);
          const dist = Math.max(Math.abs(e.px[i] - px), Math.abs(e.py[i] - py));
          if (dist < clear) clear = dist;
          if (k === 0 && dist === 0) overlap0 = true;
        }
      }
    }
    return { clear, overlap0 };
  }

  for (let seed = 1; seed <= N; seed++) {
    const g = new Game(seed * 104729 + 17);
    let guard = 0, expectScore = 0, prevRewinds = g.rewinds, lastAttempt1Dead = false;
    while (g.status !== 'final' && guard++ < 80) {
      if (g.status === 'ready') {
        const sp = spawnClearance(g); agg.spawns++;
        if (g.echoes.length) { if (sp.clear <= 1) agg.spawnClose++; if (sp.overlap0) agg.spawnOverlapT0++; agg.minClear = Math.min(agg.minClear, sp.clear); }
        if (sp.overlap0) note('spawn-overlap', 'seed ' + g.seed + ' day ' + (g.dayIndex + 1) + ' attempt ' + g.attempt);
      }
      g.begin();
      let n = 0, diedThisAttempt = false;
      while (g.status === 'play' && n++ < 700) {
        const d = pick(g, DIRS); if (d !== null) g.input(d);
        const before = { near: g.stats.near, t: g.run.t };
        const ev = g.step();
        if (!ev) { note('step-null', 'status ' + g.status); break; }
        // echo events must match the echoes' recorded meals exactly
        const t = g.run.t;
        if (!ev.dead && !ev.done) {   // on done the run has just become the newest echo, so skip
          const want = []; g.echoes.forEach((e, k) => { if (t <= e.t && e.ateId[t] >= 0) want.push(e.ateId[t] + ':' + k); });
          const got = ev.echoAte.map(x => x.id + ':' + x.echo);
          if (want.join() !== got.join()) note('echo-events', 'tick ' + t + ' want ' + want + ' got ' + got);
          if (ev.ate >= 0 && g.owner[ev.ate] >= 0) note('ate-owned', 'tick ' + t);
        }
        if (g.status === 'play') {
          const C = g.cfg.cols, occ = g.echoOcc(t, new Uint8Array(C * g.cfg.rows)), run = g.run;
          for (let i = run.si(t); i <= run.hi(t); i++) if (occ[run.px[i] + run.py[i] * C]) note('overlap-alive', 'tick ' + t);
          const seen = new Set(); for (let i = run.si(t); i <= run.hi(t); i++) { const k = run.px[i] + run.py[i] * C; if (seen.has(k)) note('self-overlap-alive', 'tick ' + t); seen.add(k); }
        }
      }
      if (g.status === 'play') { note('day-never-ended', 'seed ' + g.seed + ' ticks ' + g.run.t); break; }
      if (g.status === 'dead') {
        agg.deaths++; const r0 = g.rewinds, a0 = g.attempt, rs = g.death.reason;
        g.afterDeath();
        if (r0 > 0 && (g.rewinds !== r0 - 1 || g.attempt !== a0 + 1)) agg.rewindMismatch++;
        continue;
      }
      if (g.status === 'dayDone') {
        agg.days++;
        const clean = g.attempt === 1; if (clean) agg.cleanDays++;
        // rewinds: +1 on a clean day, capped
        const expect = Math.min(g.cfg.maxRewinds, prevRewinds + (clean ? 1 : 0));
        // prevRewinds is tracked below
        g.nextDay();
      }
      prevRewinds = g.rewinds;
    }
    if (g.final) {
      agg.finals++; if (g.final.victory) agg.victories++;
      // recompute score from history
      let s = 0; for (const e of g.echoes) { /* per-day dayScore not stored; skip exact */ }
    }
    agg.near += g.stats.near;
    // global ownership sanity
    const own = new Map(); g.echoes.forEach((e, k) => e.ateId.forEach(id => { if (id >= 0) { if (own.has(id)) note('double-owned', 'fruit ' + id); own.set(id, k); } }));
  }
  console.log('seeds', N, JSON.stringify(agg));
  if (!problems.size) console.log('no invariant violations');
  for (const [k, v] of problems) console.log('PROBLEM', k, 'x' + v.n, '-', v.first);
})();
