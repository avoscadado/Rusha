import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(); const seed = +(process.argv[2]||2); const g = new O.Game(seed); const bot = makeStrongBot(O, g);
function play() {
  bot.start(); g.begin(); const log = [];
  while (g.status === 'play') {
    const d = bot.decide(); const t = g.run.t; const h = g.run.hi(t);
    log.push([t, g.run.px[h], g.run.py[h], d, g.run.lens[t]]);
    g.input(d); g.step();
  }
  return log;
}
while (g.status !== 'final') {
  const day = g.dayIndex, att = g.attempt;
  const log = play();
  console.log('day', day+1, 'attempt', att, 'status', g.status, 'ticks', g.run.t, g.death ? JSON.stringify(g.death) : '', 'eaten', g.run.count);
  if (g.status === 'dead') { console.log(log.slice(-6).map(x => x.join(' ')).join(' | ')); g.afterDeath(); }
  else if (g.status === 'dayDone') g.nextDay();
}
