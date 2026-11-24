// Human-bot sanity on day 1 only (no echoes): death rate per attempt and fruit for variants.
import { core } from './sim.mjs';
import { makeHumanBot } from './human-bot.mjs';
const O = core(); const opts = JSON.parse(process.argv[2] || '{}'), n = +(process.argv[3] || 60), over = process.argv[4] ? JSON.parse(process.argv[4]) : {};
let deaths = 0, att = 0, eat = 0, cleared = 0; const reasons = { wall: 0, self: 0, echo: 0 }, dt = [];
for (let s = 1; s <= n; s++) {
  const g = new O.Game(s, over), bot = makeHumanBot(O, g, O.mulberry32(s * 77 + 1), opts);
  bot.start(); g.begin(); att++;
  while (g.status === 'play') { const d = bot.decide(); if (d >= 0) g.input(d); g.step(); }
  if (g.status === 'dead') { deaths++; reasons[g.death.reason]++; dt.push(g.run.t); } else { cleared++; eat += g.run.count; }
}
dt.sort((a, b) => a - b);
console.log(JSON.stringify(opts), 'n', n, 'deathRate', (deaths / att).toFixed(2), JSON.stringify(reasons), 'median death tick', dt[dt.length >> 1], 'mean fruit when cleared', (eat / Math.max(1, cleared)).toFixed(1));
