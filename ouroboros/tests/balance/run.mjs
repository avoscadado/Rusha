// Balance experiment runner (multi-core).
//
//   node ouroboros/tests/balance/run.mjs --bot strong|human|human-harsh --seeds 200 [--from 1] [--over '{"waveSize":9}']
//        [--opts '{"depth":3}'] [--workers 4] [--label base] [--raw out.json]
//   node ouroboros/tests/balance/run.mjs --bot classic --seeds 400
//
// strong        exact space-time planner (strong-bot.mjs)
// human         degraded player model, slips happen on ticks where a key is pressed (human-bot.mjs)
// human-harsh   same model but the 2-3 % slip can hit EVERY tick (also spurious sideways presses)
// classic       classic 20x20 Snake driven by the same skill model (classic.mjs)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }

export async function runSeeds(bot, seeds, over, opts, workers) {
  const chunks = Array.from({ length: workers }, () => []);
  seeds.forEach((s, i) => chunks[i % workers].push(s));
  const parts = await Promise.all(chunks.filter(c => c.length).map(c => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { bot, seeds: c, over, opts } });
    w.on('message', res); w.on('error', rej);
  })));
  return parts.flat().sort((a, b) => a.seed - b.seed);
}

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = x => (100 * x).toFixed(1) + '%';

export function summarize(recs, days) {
  const n = recs.length, out = {};
  const tot = recs.map(r => r.total);
  out.n = n; out.planMean = mean(tot); out.planMedian = q(tot, 0.5);
  out.dayShare = Array.from({ length: days }, (_, d) => mean(recs.map(r => r.eaten[d] / r.total)));
  out.cumShare = out.dayShare.reduce((a, v) => (a.push((a.length ? a[a.length - 1] : 0) + v), a), []);
  out.dayAttempts = Array.from({ length: days }, (_, d) => recs.reduce((a, r) => a + r.attempts[d], 0));
  out.dayDeaths = Array.from({ length: days }, (_, d) => recs.reduce((a, r) => a + r.dieds[d], 0));
  out.deathRate = out.dayDeaths.map((x, d) => out.dayAttempts[d] ? x / out.dayAttempts[d] : NaN);
  out.reachedDay = Array.from({ length: days }, (_, d) => recs.filter(r => r.attempts[d] > 0).length / n);
  out.deathsPerRun = mean(recs.map(r => r.deaths));
  const ratio = r => r.banked / r.total;
  out.victory = recs.filter(r => r.victory).length / n;
  out.ge90 = recs.filter(r => ratio(r) >= 0.9).length / n;
  out.ge75 = recs.filter(r => ratio(r) >= 0.75).length / n;
  out.ranOut = recs.filter(r => r.ranOut).length / n;
  out.finalMean = mean(recs.map(ratio)); out.finalMedian = q(recs.map(ratio), 0.5);
  out.endDay = mean(recs.map(r => r.endDay));
  out.min = mean(recs.map(r => r.minutes)); out.minMedian = q(recs.map(r => r.minutes), 0.5);
  out.minMin = Math.min(...recs.map(r => r.minutes)); out.minMax = Math.max(...recs.map(r => r.minutes));
  // day on which cumulative banked harvest first reaches a threshold (0 = never)
  const firstDay = (r, th) => { let c = 0; for (let d = 0; d < days; d++) { c += r.eaten[d]; if (c / r.total >= th) return d + 1; } return 0; };
  out.d90 = Array.from({ length: days + 1 }, (_, d) => recs.filter(r => firstDay(r, 0.9) === d).length / n);
  out.d100 = Array.from({ length: days + 1 }, (_, d) => recs.filter(r => firstDay(r, 0.999999) === d).length / n);
  out.bugDiff = recs.filter(r => r.gameHarvested !== r.banked).length / n;
  out.bugDiffMean = mean(recs.map(r => (r.gameHarvested - r.banked) / r.total));
  out.reasons = recs.reduce((a, r) => { for (const k in r.reasons) a[k] = (a[k] || 0) + r.reasons[k]; return a; }, {});
  out.day1Median = q(recs.map(r => r.eaten[0] / r.total), 0.5);
  out.day1Cleared = recs.filter(r => r.eaten[0] > 0 || r.attempts[1] > 0).length / n;
  return out;
}

export function printSummary(label, s, days) {
  const L = [];
  L.push(`== ${label}  (n=${s.n}, fruit in plan mean ${s.planMean.toFixed(1)} median ${s.planMedian})`);
  const row = (name, arr, f) => L.push(name.padEnd(34) + arr.map(f).map(x => String(x).padStart(8)).join(''));
  const dh = Array.from({ length: days }, (_, d) => 'day' + (d + 1));
  L.push(''.padEnd(34) + dh.map(x => x.padStart(8)).join(''));
  row('share of plan harvested that day', s.dayShare, pct);
  row('cumulative share', s.cumShare, pct);
  row('runs reaching the day', s.reachedDay, pct);
  row('attempts that die (deaths/attempts)', s.deathRate, x => isNaN(x) ? '-' : pct(x));
  row('first day cumulative >= 90%', s.d90.slice(1), pct);
  row('first day cumulative = 100%', s.d100.slice(1), pct);
  L.push(`never reaches 90% / 100%: ${pct(s.d90[0])} / ${pct(s.d100[0])}`);
  L.push(`mean deaths/run ${s.deathsPerRun.toFixed(2)} | victory ${pct(s.victory)} | >=90% ${pct(s.ge90)} | >=75% ${pct(s.ge75)} | out of rewinds ${pct(s.ranOut)} | mean end day ${s.endDay.toFixed(2)}`);
  L.push(`final share mean ${pct(s.finalMean)} median ${pct(s.finalMedian)} | minutes mean ${s.min.toFixed(2)} median ${s.minMedian.toFixed(2)} min ${s.minMin.toFixed(2)} max ${s.minMax.toFixed(2)}`);
  L.push(`death causes ${JSON.stringify(s.reasons)} | game-reported harvest differs from banked in ${pct(s.bugDiff)} of runs (mean +${pct(s.bugDiffMean)})`);
  console.log(L.join('\n'));
}

if (isMainThread) {
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const bot = arg('bot', 'strong'), nSeeds = +arg('seeds', 200), from = +arg('from', 1);
    const over = JSON.parse(arg('over', '{}')), opts = JSON.parse(arg('opts', '{}'));
    const workers = +arg('workers', Math.max(1, os.cpus().length));
    const label = arg('label', bot);
    const seeds = Array.from({ length: nSeeds }, (_, i) => from + i);
    const t0 = Date.now();
    if (bot === 'classic') {
      const { runClassic, summarizeClassic } = await import('./classic.mjs');
      const recs = runClassic(seeds, opts);
      console.log(summarizeClassic(recs, opts));
    } else {
      const recs = await runSeeds(bot, seeds, over, opts, workers);
      const { core } = await import('./sim.mjs');
      const days = Object.assign({}, core().CFG, over).days;
      printSummary(`${label} over=${JSON.stringify(over)} opts=${JSON.stringify(opts)}`, summarize(recs, days), days);
      if (arg('raw')) fs.writeFileSync(arg('raw'), JSON.stringify(recs));
    }
    console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
} else {
  const { playRun } = await import('./sim.mjs');
  const { bot, seeds, over, opts } = workerData;
  const kind = bot === 'strong' ? 'strong' : 'human';
  const o = Object.assign({}, opts);
  if (bot === 'human-harsh') o.slipOn = 'all';
  parentPort.postMessage(seeds.map(s => playRun(s, over, kind, o)));
}
