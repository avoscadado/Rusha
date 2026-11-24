import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
import { makeHumanBot } from './human-bot.mjs';
const O = core(); const seed = +(process.argv[2]||3), kind = process.argv[3]||'strong';
const g = new O.Game(seed);
const bot = kind==='strong' ? makeStrongBot(O, g) : makeHumanBot(O, g, O.mulberry32(5), {err:0});
bot.start(); g.begin();
const eats=[]; 
while (g.status === 'play') { const d = bot.decide(); if (d>=0) g.input(d); const ev = g.step(); if (ev && ev.ate>=0) eats.push([g.run.t, ev.ate]); }
console.log(kind, 'status', g.status, 'ate', eats.length, 'ticks', g.run.t);
console.log(eats.map(e=>e.join(':')).join(' '));
// which fruits were not eaten and why: count per wave
const got = new Set(eats.map(e=>e[1])); const byWave={};
for (const f of g.fruits) { byWave[f.wave] = byWave[f.wave]||[0,0]; byWave[f.wave][1]++; if (got.has(f.id)) byWave[f.wave][0]++; }
console.log(JSON.stringify(byWave));
