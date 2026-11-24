// Screening sweep: one line per CFG override set.
//   node tests/balance/sweep.mjs '[{"waveSize":9},{"waveSize":9,"life":44}]' [strongSeeds=30] [humanSeeds=150]
import os from 'node:os';
import { runSeeds, summarize } from './run.mjs';
import { core } from './sim.mjs';

const list = JSON.parse(process.argv[2]), nS = +(process.argv[3] || 30), nH = +(process.argv[4] || 150);
const W = os.cpus().length;
const f = x => (100 * x).toFixed(0).padStart(3);
for (const over of list) {
  const days = Object.assign({}, core().CFG, over).days;
  const t0 = Date.now();
  const sSeeds = Array.from({ length: nS }, (_, i) => 1000 + i), hSeeds = Array.from({ length: nH }, (_, i) => 5000 + i);
  const S = nS ? summarize(await runSeeds('strong', sSeeds, over, {}, W), days) : null;
  const H = summarize(await runSeeds('human', hSeeds, over, {}, W), days);
  const Hh = nH ? summarize(await runSeeds('human-harsh', hSeeds.slice(0, 100), over, {}, W), days) : null;
  const cum = s => s.cumShare.map(f).join('/');
  const dr = s => s.deathRate.slice(1).map(x => isNaN(x) ? ' - ' : f(x)).join('/');
  console.log(JSON.stringify(over));
  if (S) console.log(`  STRONG cum% ${cum(S)} | 100%@day ${S.d100.slice(1).map(f).join('/')} never ${f(S.d100[0])} | 90%@day ${S.d90.slice(1).map(f).join('/')} never ${f(S.d90[0])} | min ${S.min.toFixed(2)} deaths/attempt ${S.deathsPerRun.toFixed(2)}`);
  console.log(`  HUMAN  day% ${H.dayShare.map(f).join('/')} cum% ${cum(H)} | death/att d1..${dr(H)} | 100% ${f(H.victory)} >=90 ${f(H.ge90)} >=75 ${f(H.ge75)} ranOut ${f(H.ranOut)} final med ${f(H.finalMedian)} | min ${H.min.toFixed(2)} (${H.minMin.toFixed(1)}-${H.minMax.toFixed(1)})`);
  if (Hh) console.log(`  HARSH  cum% ${cum(Hh)} | 100% ${f(Hh.victory)} >=75 ${f(Hh.ge75)} ranOut ${f(Hh.ranOut)} final med ${f(Hh.finalMedian)} | min ${Hh.min.toFixed(2)}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
}
