// Core-logic probes found while balancing. Run: node ouroboros/tests/balance/bugs.mjs [json-overrides]
import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(), over = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const C = Object.assign({}, O.CFG, over).cols;

// 1. Final harvest after the LAST death includes fruit eaten by the dead (discarded) attempt.
{
  const g = new O.Game(1, { rewinds: 0 });
  const bot = makeStrongBot(O, g, {}); bot.start(); g.begin();
  while (g.status === 'play' && g.run.count < 5) { g.input(bot.decide()); g.step(); }
  const ate = g.run.count;
  while (g.status === 'play') { g.input(0); g.step(); g.input(g.run.dir === 0 ? 1 : 0); }   // steer into a wall
  if (g.status !== 'dead') { g.status = 'dead'; }
  g.afterDeath();
  const banked = g.echoes.reduce((a, e) => a + e.count, 0);
  console.log(`[1] final tally after the LAST death (seed 1, rewinds:0): dead attempt had eaten ${ate}; echoes banked ${banked}; final.harvested = ${g.final.harvested} (${g.final.rank}) -> ${g.final.harvested === banked ? 'OK (fixed in the tree; the first copy I read counted the dead attempt, giving ' + ate + ')' : 'BUG: dead attempt counted'}`);
}

// 2. Fruit that cannot be reached on ANY day: distance from the day's spawn head vs. the fruit's last live tick.
{
  let seeds = 0, bad = 0, badFruit = 0, tot = 0; const ex = [];
  for (let seed = 1; seed <= 300; seed++) {
    const g = new O.Game(seed, over); seeds++;
    const heads = [];
    for (let d = 0; d < g.cfg.days; d++) { g.dayIndex = d; const sp = g.chooseSpawn(); heads.push(sp); }   // echo-free spawn order
    let nb = 0;
    for (const f of g.fruits) {
      tot++;
      const ok = heads.some(h => Math.abs(h.x - f.x) + Math.abs(h.y - f.y) <= f.t1 - 1);
      if (!ok) { nb++; if (ex.length < 3) ex.push({ seed, fruit: f.id, x: f.x, y: f.y, t0: f.t0, t1: f.t1 }); }
    }
    if (nb) { bad++; badFruit += nb; }
  }
  console.log(`[2] unreachable-by-geometry fruit (Manhattan from every day's spawn > last live tick): ${badFruit}/${tot} fruit, in ${bad}/${seeds} seeds`, JSON.stringify(ex));
}

// 3. Spawn safety: clearance (Chebyshev, first 18 ticks, straight run) actually achieved by chooseSpawn, using strong-bot echoes.
{
  const hist = {}; let early = 0, att = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = new O.Game(seed, over), bot = makeStrongBot(O, g, {});
    let guard = 0;
    while (g.status !== 'final' && guard++ < 12) {
      if (g.status === 'ready') {
        att++;
        // measure clearance of the chosen spawn the same way chooseSpawn does
        const sp = { x: g.run.px[g.run.hi(0)], y: g.run.py[g.run.hi(0)], d: g.run.dir }, L = g.cfg.startLen, d = O.DIRS[sp.d];
        let clear = 99;
        for (let k = 0; k <= 18; k++) for (const e of g.echoes) { const te = Math.min(k, e.t); for (let i = e.si(te); i <= e.hi(te); i++) for (let j = 0; j < L; j++) clear = Math.min(clear, Math.max(Math.abs(e.px[i] - (sp.x + d.x * (k - j))), Math.abs(e.py[i] - (sp.y + d.y * (k - j))))); }
        hist[Math.min(clear, 9)] = (hist[Math.min(clear, 9)] || 0) + 1;
        bot.start(); g.begin();
      }
      while (g.status === 'play') { g.input(bot.decide()); g.step(); if (g.status === 'dead' && g.run.t < 12) early++; }
      if (g.status === 'dead') g.afterDeath(); else if (g.status === 'dayDone') g.nextDay();
    }
  }
  console.log(`[3] spawn clearance histogram over ${att} attempt starts (9 = >=9):`, JSON.stringify(hist), 'deaths in first 12 ticks:', early);
}

// 4. startLen larger than the spawn margin puts body cells outside the board (negative x), which then alias into the previous row in echoOcc.
{
  const g = new O.Game(1, { startLen: 12 });
  console.log(`[4] startLen 12: first body x = ${g.run.px[0]} (board starts at 0), y ${g.run.py[0]}; echoOcc would index cell ${g.run.px[0] + g.run.py[0] * 44}`);
}
