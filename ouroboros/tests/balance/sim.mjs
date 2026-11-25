// Plays one complete Ouroboros run (all days, real rewind rules) with a bot and returns a plain record.
import { loadCore } from '../load-core.mjs';
import { makeStrongBot } from './strong-bot.mjs';
import { makeHumanBot } from './human-bot.mjs';

let _O = null;
export function core() { return _O || (_O = loadCore()); }

export function playRun(seed, over, kind, botOpts) {
  const O = core();
  const g = new O.Game(seed, over);
  const rng = O.mulberry32((seed * 2654435761) >>> 0 ^ 0x9e3779b9);
  const bot = kind === 'strong' ? makeStrongBot(O, g, botOpts) : makeHumanBot(O, g, rng, botOpts);
  const days = g.cfg.days;
  const rec = {
    seed, total: g.total, ticks: 0, deaths: 0,
    attempts: new Array(days).fill(0), dieds: new Array(days).fill(0), eaten: new Array(days).fill(0),
    reasons: { wall: 0, self: 0, echo: 0 }, deathTick: [], skill: bot.skill || null
  };
  let guard = 0;
  while (g.status !== 'final' && guard++ < 400) {
    if (g.status === 'ready') {
      rec.attempts[g.dayIndex]++;
      bot.start();
      g.begin();
    }
    while (g.status === 'play') {
      const d = bot.decide();
      if (d >= 0) g.input(d);
      g.step(); rec.ticks++;
    }
    if (g.status === 'dead') {
      if (bot.died) bot.died();
      rec.deaths++; rec.dieds[g.dayIndex]++; rec.reasons[g.death.reason]++; rec.deathTick.push(g.run.t);
      g.afterDeath();
    } else if (g.status === 'dayDone') g.nextDay();
  }
  const f = g.final;
  g.history.forEach(h => { rec.eaten[h.day - 1] = h.eaten; });
  rec.banked = g.echoes.reduce((a, e) => a + e.count, 0);       // fruit that really became Echo harvest
  rec.gameHarvested = f.harvested;                               // what the game itself reports (see bug note)
  rec.victory = f.victory; rec.ranOut = f.died && !f.victory;
  rec.endDay = g.dayIndex + 1;
  rec.minutes = rec.ticks * g.cfg.tickMs / 60000;
  rec.score = f.score;
  if (bot.stats) rec.bs = bot.stats;
  return rec;
}
