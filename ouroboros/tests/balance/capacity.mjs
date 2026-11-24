// Day-1 capacity of the strong bot (no echoes yet) for a list of overrides: prints fruit eaten, plan size, share.
//   node tests/balance/capacity.mjs '[{"life":30},{"waveSize":9}]' [seeds=8]
import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(); const list = JSON.parse(process.argv[2]), n = +(process.argv[3] || 8);
for (const over of list) {
  let eat = 0, tot = 0;
  for (let s = 1; s <= n; s++) {
    const g = new O.Game(s, over), bot = makeStrongBot(O, g, {});
    bot.start(); g.begin(); while (g.status === 'play') { g.input(bot.decide()); g.step(); }
    eat += g.run.count; tot += g.total;
  }
  console.log(JSON.stringify(over), 'eaten', (eat / n).toFixed(1), 'of', (tot / n).toFixed(1), 'share', (100 * eat / tot).toFixed(0) + '%');
}
