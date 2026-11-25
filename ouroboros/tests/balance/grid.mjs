// Cheap screening grid: strong day-1 capacity (8 seeds) + human multi-day behaviour (150 seeds), one line each.
//   node tests/balance/grid.mjs '{"dayTicks":[620,420],"waveSize":[6,9]}' '{"life":26,"lifeJitter":4}'   (cartesian product + fixed part)
import os from 'node:os';
import { runSeeds, summarize } from './run.mjs';
import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(), W = os.cpus().length;
const axes = JSON.parse(process.argv[2]), fixed = JSON.parse(process.argv[3] || '{}');
const hopts = JSON.parse(process.env.HOPTS || '{}');
const keys = Object.keys(axes); let combos = [{}];
for (const k of keys) combos = combos.flatMap(c => axes[k].map(v => Object.assign({}, c, (v && typeof v === 'object') ? v : { [k]: v })));
const f = x => (100 * x).toFixed(0).padStart(3);
for (const c of combos) {
  const over = Object.assign({}, fixed, c);
  let eat = 0, tot = 0; const n = 6;
  for (let s = 1; s <= n; s++) { const g = new O.Game(s, over), bot = makeStrongBot(O, g, {}); bot.start(); g.begin(); while (g.status === 'play') { g.input(bot.decide()); g.step(); } eat += g.run.count; tot += g.total; }
  const days = Object.assign({}, O.CFG, over).days;
  const H = summarize(await runSeeds('human', Array.from({ length: 150 }, (_, i) => 5000 + i), over, hopts, W), days);
  console.log(JSON.stringify(c).padEnd(46), `plan ${(tot / n).toFixed(0).padStart(3)} strongD1 ${f(eat / tot)}% | H day% ${H.dayShare.map(f).join('/')} cum ${H.cumShare.map(f).join('/')} | death d2-${days} ${H.deathRate.slice(1).map(x => isNaN(x) ? '-' : f(x)).join('/')} | 100% ${f(H.victory)} >=75 ${f(H.ge75)} out ${f(H.ranOut)} med ${f(H.finalMedian)} | min ${H.min.toFixed(1)}`);
}
