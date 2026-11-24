// "Human-like" bot = a degraded player model. It is deliberately game-agnostic (HumanPolicy) so the very same
// skill model can also drive the classic-Snake baseline (classic.mjs).
//
// Degradations (see report for the justification):
//   delay  2-3 ticks : it decides from a snapshot taken `delay` ticks ago. It knows its own key presses, so it
//                      predicts where its head is now, but it does NOT see the effect of a missed/wrong press until
//                      `delay` ticks later (that is what makes a slip costly).
//   look   6-8 cells : safety search is an exhaustive tree over the next `look` moves; nothing beyond is checked.
//   echoes           : only what the UI shows: current bodies + dashed head path 14 ticks ahead of the snapshot.
//   err    2-3 %/tick: with that probability the tick's input is slipped: half the time dropped, half the time a
//                      random sideways key is pressed instead (even if no turn was wanted).
//   no tours         : target = nearest reachable-looking visible fruit (Manhattan), no ordering/echo-timing plan.
import { echoTable, BIG } from './echo-table.mjs';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export function sampleSkill(rng, o = {}) {
  return {
    delay: o.delay != null ? o.delay : (rng() < 0.5 ? 2 : 3),
    look: o.look != null ? o.look : 6 + Math.floor(rng() * 3),
    err: o.err != null ? o.err : 0.02 + rng() * 0.01,
    preview: o.preview != null ? o.preview : 14,
    slipOn: o.slipOn || 'turns'
  };
}

export class HumanPolicy {
  constructor(skill, rng, C, R) {
    this.sk = skill; this.rng = rng; this.C = C; this.R = R; this.N = C * R;
    this.occ = new Uint8Array(this.N);
    this.cells = new Int16Array(512);
    this.seen = new Int32Array(this.N); this.stamp = 0;
    this.queue = new Int32Array(this.N);
    this.reset();
  }
  reset() { this.sent = []; this.tgt = -1; }

  // w: world view (see ouroboros/classic adapters). Returns key to press (0-3) or -1.
  decide(w) {
    const { C, R, t } = w, sk = this.sk;
    const s = Math.max(0, t - sk.delay);
    // --- believed state now = snapshot at s + own presses since (assumed to have worked)
    const body = w.obsBody(s); let dir = w.obsDir(s), ok = true;
    for (let k = s + 1; k <= t && ok; k++) {
      const sd = this.sent[k];
      if (sd !== undefined && sd >= 0 && sd !== dir && sd !== ((dir + 2) & 3)) dir = sd;
      const h = body[body.length - 1], nx = (h % C) + DX[dir], ny = ((h / C) | 0) + DY[dir];
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) { ok = false; break; }
      const nc = nx + ny * C;
      body.push(nc);
      if (!w.growth(k, nc)) body.shift();
    }
    const bdir = dir;
    const head = body[body.length - 1], hx = head % C, hy = (head / C) | 0;
    // --- target: nearest visible fruit we can plausibly reach before it rots (sticky by 3 ticks)
    const list = w.targets(s, t);
    let tg = null, bc = 1e9;
    for (let i = 0; i < list.length; i++) {
      const f = list[i], dist = Math.abs(f.x - hx) + Math.abs(f.y - hy), arrive = Math.max(dist, f.t0 - t);
      if (t + arrive >= f.t1 - 1) continue;
      const cost = arrive - (f.id === this.tgt ? 3 : 0);
      if (cost < bc) { bc = cost; tg = f; }
    }
    this.tgt = tg ? tg.id : -1;
    const intended = ok ? this.search(w, body, bdir, t, s + sk.preview, tg) : bdir;
    this.sent[t + 1] = intended !== bdir ? intended : -1;
    // --- slips
    let out = intended !== bdir ? intended : -1;
    if ((sk.slipOn === 'all' || out >= 0) && this.rng() < sk.err) {
      if (this.rng() < 0.5) out = -1;
      else out = (w.actualDir() + (this.rng() < 0.5 ? 1 : 3)) & 3;
    }
    return out;
  }

  // Exhaustive search of `look` moves; returns the best first heading (best[] is bucketed by first move direction).
  search(w, bodyIn, dir, t, known, tg) {
    const C = this.C, R = this.R, look = this.sk.look, occ = this.occ, cells = this.cells;
    const L = bodyIn.length;
    for (let i = 0; i < L; i++) { cells[i] = bodyIn[i]; occ[bodyIn[i]]++; }
    const tgCell = tg ? tg.x + tg.y * C : -1, tx = tg ? tg.x : (C >> 1), ty = tg ? tg.y : (R >> 1), tw = tg ? 1 : 0.15;
    const best = [-1e9, -1e9, -1e9, -1e9];
    const self = this;
    function blocked(T, c, hold) { return w.blocked(T, c, hold, known); }
    function flood(startCell, T, need) {
      self.stamp++; const st = self.stamp, seen = self.seen, q = self.queue;
      let qh = 0, qt = 0, n = 0; q[qt++] = startCell; seen[startCell] = st;
      while (qh < qt && n < need) {
        const c = q[qh++]; n++;
        const x = c % C, y = (c / C) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
          const nc = nx + ny * C;
          if (seen[nc] === st || occ[nc] || blocked(T, nc, 1)) continue;
          seen[nc] = st; q[qt++] = nc;
        }
      }
      return n;
    }
    // Node after `depth` moves has its head at cells[hIdx]; tIdx = first live body index; d0 = first move heading.
    function rec(depth, d, hIdx, tIdx, d0, turns, ate) {
      const T = t + depth + 1;
      const h = cells[hIdx], x = h % C, y = (h / C) | 0;
      let any = false;
      for (let k = 0; k < 3; k++) {
        const nd = k === 0 ? d : (k === 1 ? (d + 1) & 3 : (d + 3) & 3);
        const nx = x + DX[nd], ny = y + DY[nd];
        if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
        const nc = nx + ny * C;
        const eats = nc === tgCell && ate === 0 && T >= tg.t0 && T < tg.t1;
        let leaving = -1;
        if (!eats) { leaving = cells[tIdx]; occ[leaving]--; }
        if (occ[nc] || blocked(T, nc, hIdx - tIdx + 2)) { if (leaving >= 0) occ[leaving]++; continue; }
        any = true;
        cells[hIdx + 1] = nc; occ[nc]++;
        const nturns = turns + (k ? 1 : 0), nate = ate || (eats ? depth + 1 : 0);
        if (depth + 1 >= look) {
          let sc = -(Math.abs(nx - tx) + Math.abs(ny - ty)) * tw - nturns * 0.25;
          if (nate) sc += 340 - nate * 6;
          if (sc > best[d0]) {
            const need = Math.max(hIdx - tIdx + 6, 18);
            const area = flood(nc, T, need);
            if (area < need) sc -= 40 + (need - area) * 12;
            if (sc > best[d0]) best[d0] = sc;
          }
        } else rec(depth + 1, nd, hIdx + 1, eats ? tIdx : tIdx + 1, d0, nturns, nate);
        occ[nc]--; if (leaving >= 0) occ[leaving]++;
      }
      if (!any) {                                    // every continuation dies: score by how long we lasted
        const sc = -2000 + depth * 150 - (Math.abs(x - tx) + Math.abs(y - ty)) * 0.1;
        if (sc > best[d0]) best[d0] = sc;
      }
    }
    let anyFirst = false;
    {
      const h = cells[L - 1], x = h % C, y = (h / C) | 0, T = t + 1;
      for (let k = 0; k < 3; k++) {
        const nd = k === 0 ? dir : (k === 1 ? (dir + 1) & 3 : (dir + 3) & 3);
        const nx = x + DX[nd], ny = y + DY[nd];
        if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
        const nc = nx + ny * C;
        const eats = nc === tgCell && T >= tg.t0 && T < tg.t1;
        let leaving = -1;
        if (!eats) { leaving = cells[0]; occ[leaving]--; }
        if (occ[nc] || blocked(T, nc, L + 1)) { if (leaving >= 0) occ[leaving]++; continue; }
        anyFirst = true;
        cells[L] = nc; occ[nc]++;
        if (look <= 1) best[nd] = -(Math.abs(nx - tx) + Math.abs(ny - ty)) * tw;
        else rec(1, nd, L, eats ? 0 : 1, nd, k ? 1 : 0, eats ? 1 : 0);
        occ[nc]--; if (leaving >= 0) occ[leaving]++;
      }
    }
    for (let i = 0; i < L; i++) occ[bodyIn[i]] = 0;
    if (!anyFirst) return dir;                       // doomed: keep going
    let bd = dir, bv = best[dir];
    for (const d of [(dir + 1) & 3, (dir + 3) & 3]) if (best[d] > bv + 1e-9) { bv = best[d]; bd = d; }
    return bd;
  }
}

// ---------- Ouroboros adapter ----------
export function makeHumanBot(O, g, rng, botOpts = {}) {
  const C = g.cfg.cols, R = g.cfg.rows, N = C * R;
  const skill = sampleSkill(rng, botOpts);
  const pol = new HumanPolicy(skill, rng, C, R);
  let ne = null;
  const tele = g.cfg.telegraph;
  const w = {
    C, R, t: 0,
    obsBody(s) { const r = g.run, a = [], hi = r.hi(s), si = r.si(s); for (let i = si; i <= hi; i++) a.push(r.px[i] + r.py[i] * C); return a; },
    obsDir(s) {
      const r = g.run; if (s === 0) return r.startDir;
      const h = r.hi(s); return DX.findIndex((dx, d) => r.px[h] - r.px[h - 1] === dx && r.py[h] - r.py[h - 1] === DY[d]);
    },
    growth(k, cell) { const r = g.run, h = r.hi(k); return (r.px[h] + r.py[h] * C === cell) ? r.lens[k] - r.lens[k - 1] : 0; },
    actualDir() { return g.queue.length ? g.queue[g.queue.length - 1] : g.run.dir; },
    // an Echo is only "known" up to tick `known` (snapshot + preview); later ticks are assumed empty
    blocked(T, c, hold, known) { const e = ne[T * N + c]; return e <= known && e < T + hold; },
    targets(s, t) {
      const out = [];
      for (let i = 0; i < g.fruits.length; i++) {
        const f = g.fruits[i];
        if (g.owner[i] >= 0 || g.eaten[i] || f.t0 - tele > s || f.t1 <= s + 1) continue;
        out.push(f);
      }
      return out;
    }
  };
  return {
    skill,
    start() { pol.reset(); ne = echoTable(g); },
    decide() { w.t = g.run.t; return pol.decide(w); }
  };
}
