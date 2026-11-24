import { core } from './sim.mjs';
import { makeStrongBot } from './strong-bot.mjs';
const O = core(); const seed = +(process.argv[2]||2); const g = new O.Game(seed); const bot = makeStrongBot(O, g);
const C = g.cfg.cols;
function play(stopAt) {
  bot.start(); g.begin(); const log = [];
  while (g.status === 'play') {
    const d = bot.decide(); const t = g.run.t; const h = g.run.hi(t);
    log.push({t, x:g.run.px[h], y:g.run.py[h], d, len:g.run.lens[t]});
    g.input(d); g.step();
  }
  return log;
}
while (g.status !== 'final') {
  const log = play();
  if (g.status === 'dead') {
    const dr = g.death; console.log('dead', JSON.stringify(dr), 'day', g.dayIndex+1);
    // when did we enter the death cell? 
    const run = g.run;
    for (let i = 0; i <= run.hi(run.t); i++) if (run.px[i]===dr.x && run.py[i]===dr.y) console.log('path idx', i, 'tick', i-(run.len0-1), 'lens at then', run.lens[Math.max(0,i-(run.len0-1))], 'now len', run.lens[run.t]);
    // eat ticks
    console.log('ate ticks', run.ateId.map((a,i)=>a>=0?i:-1).filter(x=>x>=0).join(','));
    const e = g.echoes[dr.echo]; console.log('echo head at death tick', e.px[e.hi(run.t)], e.py[e.hi(run.t)]);
    break;
  }
  if (g.status === 'dayDone') g.nextDay();
}
// ascii of situation at ticks
function show(t) {
  const R = g.cfg.rows, Cc = g.cfg.cols; const grid = Array.from({length:R},()=>Array(Cc).fill('.'));
  const run = g.run; const hi=run.hi(t), si=run.si(t);
  for (let i=si;i<=hi;i++) grid[run.py[i]][run.px[i]] = i===hi?'@':'o';
  g.echoes.forEach((e,k)=>{ const te=Math.min(t,e.t); for (let i=e.si(te);i<=e.hi(te);i++) grid[e.py[i]][e.px[i]] = i===e.hi(te)?'E':'e'; });
  for (const f of g.fruits) if (f.t0<=t && t<f.t1 && g.owner[f.id]<0) grid[f.y][f.x]='*';
  console.log('t='+t+'\n'+grid.map(r=>r.join('')).join('\n'));
}
for (const t of [548, 562, 572, 580]) show(t);
