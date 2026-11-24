// quick A/B of strong-bot options on day-1 harvest only: node cmp.mjs '{"depth":3}' seeds
import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(); const opts = JSON.parse(process.argv[2] || '{}'), n = +(process.argv[3] || 8), over = process.argv[4] ? JSON.parse(process.argv[4]) : {};
let sum = 0, ms = 0;
for (let s = 1; s <= n; s++) {
  const g = new O.Game(s, over), bot = makeStrongBot(O, g, opts); const t0 = Date.now();
  bot.start(); g.begin(); while (g.status === 'play') { g.input(bot.decide()); g.step(); }
  sum += g.run.count; ms += Date.now() - t0;
  process.stdout.write(g.run.count + ' ');
}
console.log('\nmean day1', (sum / n).toFixed(2), 'ms/day', (ms / n).toFixed(0));
