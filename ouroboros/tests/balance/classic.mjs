// Classic Snake baseline for the "at least twice as long as normal Snake" requirement.
// 20x20 board, one fruit at a time (uniformly random free cell, appears the moment the previous one is eaten),
// wall and self death, no Echoes, 8 ticks/s (125 ms), game over on the first death, start length 3.
// Driven by the SAME HumanPolicy / skill sampling as the Ouroboros human-like bot.
import { core } from './sim.mjs';
import { HumanPolicy, sampleSkill } from './human-bot.mjs';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const CLASSIC = { C: 20, R: 20, len0: 3, tickMs: 125, maxTicks: 40000 };

export function playClassic(seed, opts = {}) {
  const O = core(), { C, R, len0, tickMs, maxTicks } = Object.assign({}, CLASSIC, opts);
  const rng = O.mulberry32((seed * 2246822519) >>> 0 ^ 0x1234567);
  const skill = sampleSkill(rng, opts);
  if (opts.slipOn == null) skill.slipOn = 'turns';
  const pol = new HumanPolicy(skill, rng, C, R);
  const run = new O.Run(C >> 1, R >> 1, 1, len0);
  let queue = [], fruit = null, ticks = 0, score = 0;
  const own = new Uint8Array(C * R);
  function spawn(t) {
    const hi = run.hi(t), si = run.si(t); own.fill(0);
    for (let i = si; i <= hi; i++) own[run.px[i] + run.py[i] * C] = 1;
    const free = []; for (let c = 0; c < C * R; c++) if (!own[c]) free.push(c);
    if (!free.length) return null;
    const c = free[Math.floor(rng() * free.length)];
    return { id: 0, x: c % C, y: (c / C) | 0, t0: t, t1: Infinity };
  }
  fruit = spawn(0);
  const w = {
    C, R, t: 0,
    obsBody(s) { const a = [], hi = run.hi(s), si = run.si(s); for (let i = si; i <= hi; i++) a.push(run.px[i] + run.py[i] * C); return a; },
    obsDir(s) { if (s === 0) return run.startDir; const h = run.hi(s); return DX.findIndex((dx, d) => run.px[h] - run.px[h - 1] === dx && run.py[h] - run.py[h - 1] === DY[d]); },
    growth(k, cell) { const h = run.hi(k); return (run.px[h] + run.py[h] * C === cell) ? run.lens[k] - run.lens[k - 1] : 0; },
    actualDir() { return queue.length ? queue[queue.length - 1] : run.dir; },
    blocked() { return false; },
    targets(s) { return fruit && fruit.t0 <= s ? [fruit] : []; }
  };
  let dead = null;
  while (ticks < maxTicks && !dead) {
    w.t = run.t;
    const k = pol.decide(w);
    if (k >= 0 && queue.length < 2) {                    // same input rules as Ouroboros: 2-deep buffer, no reverse
      const last = queue.length ? queue[queue.length - 1] : run.dir;
      if (k !== last && k !== ((last + 2) & 3)) queue.push(k);
    }
    ticks++;
    if (queue.length) run.dir = queue.shift();
    const h0 = run.hi(run.t), hx = run.px[h0] + DX[run.dir], hy = run.py[h0] + DY[run.dir];
    if (hx < 0 || hy < 0 || hx >= C || hy >= R) { dead = 'wall'; break; }
    const ate = fruit && hx === fruit.x && hy === fruit.y;
    run.push(hx, hy, ate ? 1 : -1);
    const t = run.t, hi = run.hi(t), si = run.si(t);
    for (let i = si; i < hi; i++) if (run.px[i] === hx && run.py[i] === hy) { dead = 'self'; break; }
    if (dead) break;
    if (ate) { score++; fruit = spawn(t); if (!fruit) { dead = 'cleared'; break; } }
  }
  return { seed, ticks, seconds: ticks * tickMs / 1000, score, dead: dead || 'cap', skill };
}

export function runClassic(seeds, opts = {}) { return seeds.map(s => playClassic(s, opts)); }

export function summarizeClassic(recs, opts = {}) {
  const sec = recs.map(r => r.seconds).sort((a, b) => a - b), sc = recs.map(r => r.score).sort((a, b) => a - b);
  const m = a => a.reduce((x, y) => x + y, 0) / a.length, q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const causes = recs.reduce((a, r) => (a[r.dead] = (a[r.dead] || 0) + 1, a), {});
  return `== classic 20x20 (n=${recs.length}, opts=${JSON.stringify(opts)})\n` +
    `play time s: mean ${m(sec).toFixed(1)} median ${q(sec, 0.5).toFixed(1)} p10 ${q(sec, 0.1).toFixed(1)} p90 ${q(sec, 0.9).toFixed(1)} max ${sec[sec.length - 1].toFixed(1)}\n` +
    `fruit eaten: mean ${m(sc).toFixed(1)} median ${q(sc, 0.5)} | end causes ${JSON.stringify(causes)} (cap = ${CLASSIC.maxTicks} ticks)`;
}
