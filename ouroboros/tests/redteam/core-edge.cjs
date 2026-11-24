// Hand-built edge cases against the pure core.  Run: node tests/redteam/core-edge.cjs
const path = require('node:path');
const { pick } = require('./autopilot.js');
(async () => {
  const { loadCore } = await import('file://' + path.resolve(__dirname, '..', 'load-core.mjs'));
  const O = loadCore(); const { Game, DIRS, Run, CFG } = O;
  const say = (...a) => console.log(...a);
  const setup = (echoRun, playerRun, over) => { const g = new Game(11, over); echoRun.color = 0; g.echoes.push(echoRun); g.beginDay(); g.run = playerRun; g.begin(); return g; };

  // ---- T1: shadowing an echo's head farms "close shave" points: +25 every 8 ticks, no risk beyond the lane itself
  { const echo = new Run(3, 10, 1, 4); for (let x = 4; x < 44; x++) echo.push(x, 10, -1);
    const g = setup(echo, new Run(3, 11, 1, 4)); let n = 0; while (g.status === 'play' && n++ < 60) g.step();
    say('[T1] shadow lane for ' + g.run.t + ' ticks: close shaves=' + g.stats.near + ' (+' + g.dayScore + ' pts); status=' + g.status + '; ceiling per day = ' + Math.floor(CFG.dayTicks / 8) + ' x ' + CFG.nearMiss + ' = ' + Math.floor(CFG.dayTicks / 8) * CFG.nearMiss); }

  // ---- T2: rewinds accounting
  { const g = new Game(5); const log = [];
    g.begin(); while (g.status === 'play') { g.input(0); g.step(); }                    // die on the wall
    log.push('start 3; after 1st death -> rewinds=' + (g.afterDeath(), g.rewinds) + ' attempt=' + g.attempt);
    g.finishDay(false); log.push('attempt 2 finishes day: rewinds=' + g.rewinds + ' gained=' + g.gainedRewind + ' (no bonus expected: not a clean day)');
    g.nextDay(); g.finishDay(false); log.push('clean day 2: rewinds=' + g.rewinds + ' gained=' + g.gainedRewind);
    g.nextDay(); g.finishDay(false); log.push('clean day 3: rewinds=' + g.rewinds + ' gained=' + g.gainedRewind);
    g.nextDay(); g.finishDay(false); log.push('clean day 4 (cap 5): rewinds=' + g.rewinds + ' gained=' + g.gainedRewind + ' status=' + g.status);
    g.nextDay(); g.finishDay(false); log.push('clean day 5 -> status=' + g.status + ' final.victory=' + g.final.victory + ' rewinds=' + g.rewinds);
    say('[T2]\n    ' + log.join('\n    ')); }

  // ---- T3: victory triggers exactly when the last free fruit is eaten; nothing is playable afterwards
  { let victories = 0, bad = 0, nonVictoryFull = 0; const cfg = { waveSize: 2 };
    for (let seed = 1; seed <= 80; seed++) {
      const g = new Game(seed * 7, cfg); let guard = 0;
      while (g.status !== 'final' && guard++ < 60) {
        g.begin(); let n = 0;
        while (g.status === 'play' && n++ < 700) { const d = pick(g, DIRS); if (d !== null) g.input(d); const ev = g.step(); if (ev && ev.victory && g.freeCount() !== 0) bad++; }
        if (g.status === 'dead') g.afterDeath(); else if (g.status === 'dayDone') g.nextDay();
      }
      if (g.final.victory) { victories++; if (g.final.harvested !== g.final.total || g.step() !== null || g.nextDay() !== false || g.final.rank !== 'OUROBOROS') bad++; }
      else if (g.final.harvested === g.final.total) nonVictoryFull++;
    }
    say('[T3] sparse schedule (waveSize 2): victories ' + victories + '/80, inconsistent victory states: ' + bad + ', full harvest without victory flag: ' + nonVictoryFull); }

  // ---- T4: fruit lying on the cell your own tail is leaving: stepping onto it kills you (growth stops the tail from vacating)
  { const mk = (withFruit) => {
      const g = new Game(1); const C = g.cfg.cols;
      g.fruits = withFruit ? [{ id: 0, x: 9, y: 14, t0: 0, t1: 300, wave: 0 }] : [];
      g.cellFruit = new Array(C * g.cfg.rows); if (withFruit) g.cellFruit[9 + 14 * C] = [0];
      g.owner = new Int16Array(g.fruits.length).fill(-1); g.eaten = new Uint8Array(g.fruits.length);
      g.run = new Run(10, 14, 1, 4); g.begin(); g.input(0); g.step(); g.input(3); g.step(); g.input(2); const ev = g.step();
      return { status: g.status, reason: g.death && g.death.reason, ate: ev.ate };
    };
    say('[T4] step into the tail cell: no fruit -> ' + JSON.stringify(mk(false)) + ' | fruit on that cell -> ' + JSON.stringify(mk(true))); }

  // ---- T6: echo = exact snapshot of the recorded run (positions, length, meals) and stays frozen after the day
  { const g = new Game(42); g.begin(); const snap = []; let n = 0;
    while (g.status === 'play' && n++ < 700) { const d = pick(g, DIRS); if (d !== null) g.input(d); g.step(); if (g.status === 'play' || g.status === 'dayDone') { const r = g.run, t = r.t, cells = []; for (let i = r.si(t); i <= r.hi(t); i++) cells.push(r.px[i] + ',' + r.py[i]); snap[t] = cells.join(';') + '|' + r.lens[t] + '|' + r.ateId[t]; } }
    const e = g.echoes[0]; let mism = 0;
    for (let t = 0; t <= e.t; t++) { const cells = []; for (let i = e.si(t); i <= e.hi(t); i++) cells.push(e.px[i] + ',' + e.py[i]); if (t > 0 && snap[t] !== cells.join(';') + '|' + e.lens[t] + '|' + e.ateId[t]) mism++; }
    say('[T6] echo vs recorded snapshots over ' + e.t + ' ticks: mismatches=' + mism + ' (status ' + g.status + ')'); }

  // ---- T7: double calls
  { const g = new Game(5); g.begin(); while (g.status === 'play') { g.input(0); g.step(); }
    const a = g.afterDeath(), r1 = g.rewinds, b = g.afterDeath(), r2 = g.rewinds;
    say('[T7] afterDeath x2: ' + a + ',' + b + ' rewinds ' + r1 + ' -> ' + r2 + ' deaths=' + g.stats.deaths + ' status=' + g.status);
    g.finishDay(false); const n1 = g.nextDay(), n2 = g.nextDay(); say('     nextDay x2: ' + n1 + ',' + n2 + ' dayIndex=' + g.dayIndex); }

  // ---- T8: input buffer
  { const g = new Game(5); g.begin(); const r = [g.input(0), g.input(3), g.input(3), g.input(2), g.input(1)]; say('[T8] buffer results (up,left,left,down,right)=' + r.join(',') + ' queue=' + g.queue.join('')); }

  // ---- T9: every fruit reachable at all in time from some spawn (Manhattan lower bound) and none shares cell+time
  { let unreachable = 0, total = 0;
    for (let seed = 1; seed <= 200; seed++) { const g = new Game(seed); for (const f of g.fruits) { total++; const sp = g.run; const hx = sp.px[sp.hi(0)], hy = sp.py[sp.hi(0)]; const dist = Math.abs(f.x - hx) + Math.abs(f.y - hy); if (f.t1 - 1 < dist) unreachable++; } }
    say('[T9] fruit that cannot be reached by day-1 spawn in time even in a straight line: ' + unreachable + '/' + total); }
})();
