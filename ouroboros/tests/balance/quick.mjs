import { playRun } from './sim.mjs';
const kind = process.argv[2] || 'strong', n = +(process.argv[3] || 3), over = process.argv[4] ? JSON.parse(process.argv[4]) : {};
for (let s = 1; s <= n; s++) {
  const t0 = Date.now(); const r = playRun(s, over, kind);
  console.log(kind, 'seed', s, 'total', r.total, 'banked', r.banked, 'gameH', r.gameHarvested, 'eatenByDay', r.eaten.join(','), 'att', r.attempts.join(','), 'died', r.dieds.join(','), 'victory', r.victory, 'endDay', r.endDay, 'min', r.minutes.toFixed(2), 'reasons', JSON.stringify(r.reasons), 'ms', Date.now() - t0, r.bs ? JSON.stringify(r.bs) : '');
}
