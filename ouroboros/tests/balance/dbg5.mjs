import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(); const seed = 3; const g = new O.Game(seed);
const bot = makeStrongBot(O, g, {trace:true});
bot.start(); g.begin();
while (g.status === 'play' && g.run.t < 135) {
  if (g.run.t >= 70 && g.run.t <= 80) { const t=g.run.t; const hi=g.run.hi(t); console.log('t', t, 'head', g.run.px[hi], g.run.py[hi], 'live:', g.fruits.filter(f=>!g.eaten[f.id]&&f.t0-20<=t&&t<f.t1).map(f=>`#${f.id}(${f.x},${f.y}) ${f.t0}-${f.t1}`).join(' ')); }
  const d = bot.decide(); g.input(d); g.step();
}
