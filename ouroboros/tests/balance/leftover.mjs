// Which fruit does the strong bot never manage to harvest, and why?   node leftover.mjs '{overrides}' [seeds]
import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(), over = JSON.parse(process.argv[2] || '{}'), n = +(process.argv[3] || 12);
for (let seed = 1000; seed < 1000 + n; seed++) {
  const g = new O.Game(seed, over), bot = makeStrongBot(O, g, {}); const spawns = [];
  while (g.status !== 'final') {
    if (g.status === 'ready') { const h = g.run.hi(0); spawns.push([g.run.px[h], g.run.py[h], g.run.startDir]); bot.start(); g.begin(); }
    while (g.status === 'play') { g.input(bot.decide()); g.step(); }
    if (g.status === 'dead') g.afterDeath(); else if (g.status === 'dayDone') g.nextDay();
  }
  const left = g.fruits.filter(f => g.owner[f.id] < 0 && !g.eaten[f.id]);
  if (g.final.victory) continue;
  console.log('seed', seed, 'left', left.length, 'of', g.total, left.map(f => `#${f.id}@(${f.x},${f.y}) t${f.t0}-${f.t1} d=${spawns.map(s => Math.abs(s[0] - f.x) + Math.abs(s[1] - f.y)).join('/')}`).join('  '));
}
