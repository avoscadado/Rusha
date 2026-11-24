import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(); const seed = +(process.argv[2]||2); const g = new O.Game(seed); 
const bot = makeStrongBot(O, g, {trace: true});
let first = true;
while (g.status !== 'final') {
  bot.start(); g.begin();
  while (g.status === 'play') { const d = bot.decide(); g.input(d); g.step(); }
  if (g.status === 'dead') break;
  if (g.status === 'dayDone') g.nextDay();
}
