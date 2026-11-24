// "Strong" bot: exact space-time planner.
//  * Echoes are deterministic, so the full future occupancy of the day is known (echoTable).
//  * BFS over (cell, heading, tick) from the head finds, for every free fruit, the earliest tick the head
//    can be on it while it is live. Own old body blocks cells until the tail leaves; a newly entered cell must
//    stay free of Echoes for as long as the snake will cover it (body length), which also covers Echoes biting the body.
//  * Chains of `depth` fruits are searched (beam), every candidate path is re-simulated with the exact game rules
//    (growth, self bite, echo bite) and must leave the snake a survivable continuation (a live state SURV ticks later).
//  * Falls back to a longest-survival move when no fruit is reachable.
import { echoTable } from './echo-table.mjs';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export function makeStrongBot(O, g, opts = {}) {
  const C = g.cfg.cols, R = g.cfg.rows, N = C * R, D = g.cfg.dayTicks;
  const H1 = opts.H1 || 90, H2 = opts.H2 || 60, SURV = opts.surv || 12;
  const depth = opts.depth || 2;
  const beam = opts.beam || [8, 4, 3];
  const par = new Uint8Array((Math.max(H1, H2) + 2) * N * 4);
  let listA = new Int32Array(N * 4), listB = new Int32Array(N * 4);
  const bodyIdx = new Int16Array(N).fill(-1);
  const cnt = new Uint8Array(N);
  let ne = null;
  let plan = null;
  const stats = { plans: 0, bfs: 0, survival: 0 };

  function bfs(st, H) {
    stats.bfs++;
    const body = st.body, L = body.length, Lb = L + 1;
    H = Math.min(H, D - st.t);
    for (let j = 0; j < L; j++) bodyIdx[body[j]] = j;
    par.fill(255, 0, (H + 1) * N * 4);
    const head = body[L - 1], hx = head % C, hy = (head / C) | 0;
    let cur = listA, nxt = listB, nc = 1;
    par[head * 4 + st.dir] = 4;
    cur[0] = head * 4 + st.dir;
    let reach = 0;
    for (let tau = 0; tau < H; tau++) {
      const T = st.t + tau + 1, eb = T * N, lim = Math.min(T + Lb, D + 1), baseNext = (tau + 1) * N * 4;
      let nn = 0;
      for (let i = 0; i < nc; i++) {
        const s = cur[i], cell = s >> 2, d = s & 3, x = cell % C, y = (cell / C) | 0;
        for (let k = 0; k < 3; k++) {
          const nd = k === 0 ? d : (k === 1 ? (d + 1) & 3 : (d + 3) & 3);
          const nx = x + DX[nd], ny = y + DY[nd];
          if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
          const ncell = nx + ny * C;
          if (bodyIdx[ncell] >= tau + 1) continue;
          if (ne[eb + ncell] < lim) continue;
          const pi = baseNext + ncell * 4 + nd;
          if (par[pi] !== 255) continue;
          par[pi] = d;
          nxt[nn++] = ncell * 4 + nd;
        }
      }
      if (nn === 0) break;
      reach = tau + 1;
      const tmp = cur; cur = nxt; nxt = tmp; nc = nn;
    }
    for (let j = 0; j < L; j++) bodyIdx[body[j]] = -1;
    return reach;
  }

  function pathTo(tau, cell, d) {
    const out = new Array(tau);
    let c = cell;
    for (let k = tau; k >= 1; k--) {
      out[k - 1] = d;
      const pd = par[(k * N + c) * 4 + d];
      c = c - DX[d] - DY[d] * C;
      d = pd;
    }
    return out;
  }

  function findCands(st, reach) {
    const out = [];
    for (let i = 0; i < g.fruits.length; i++) {
      const f = g.fruits[i];
      if (g.owner[i] >= 0 || g.eaten[i] || st.eaten.has(i)) continue;
      const cell = f.x + f.y * C;
      const lo = Math.max(1, f.t0 - st.t), hi = Math.min(reach, f.t1 - 1 - st.t);
      for (let tau = lo; tau <= hi; tau++) {
        const base = (tau * N + cell) * 4;
        let d = -1;
        for (let q = 0; q < 4; q++) if (par[base + q] !== 255) { d = q; break; }
        if (d >= 0) { out.push({ id: i, tau, cell, d }); break; }
      }
    }
    out.sort((a, b) => a.tau - b.tau);
    return out;
  }

  // Exact replay of `path` from state st under the real rules.
  function simulate(st, path) {
    const body = st.body.slice();
    let tail = 0, T = st.t, ok = true;
    const ate = [];
    for (let j = 0; j < body.length; j++) cnt[body[j]]++;
    let head = body[body.length - 1];
    for (let i = 0; i < path.length; i++) {
      T++;
      const d = path[i], hx = (head % C) + DX[d], hy = ((head / C) | 0) + DY[d];
      if (hx < 0 || hy < 0 || hx >= C || hy >= R) { ok = false; break; }
      const nc = hx + hy * C;
      let ateId = -1;
      const list = g.cellFruit[nc];
      if (list) for (let q = 0; q < list.length; q++) {
        const id = list[q], f = g.fruits[id];
        if (g.owner[id] < 0 && !g.eaten[id] && !st.eaten.has(id) && ate.indexOf(id) < 0 && f.t0 <= T && T < f.t1) { ateId = id; break; }
      }
      if (ateId < 0) { cnt[body[tail]]--; tail++; }
      if (cnt[nc] > 0) { ok = false; break; }
      body.push(nc); cnt[nc]++; head = nc;
      if (ateId >= 0) ate.push(ateId);
      for (let j = tail; j < body.length; j++) if (ne[T * N + body[j]] === T) { ok = false; break; }
      if (!ok) break;
    }
    for (let j = 0; j < body.length; j++) cnt[body[j]] = 0;
    if (!ok) return { ok: false };
    // Body left behind must also survive the Echoes it will still be lying under (growth keeps cells longer than planned).
    { const nb = body.length - tail; for (let j = 0; j < nb && ok; j++) { const e = ne[T * N + body[tail + j]]; if (e <= T + j && e <= D) ok = false; } }
    if (!ok) return { ok: false };
    const eaten = new Set(st.eaten); for (const id of ate) eaten.add(id);
    return { ok: true, ate, T, state: { t: T, body: body.slice(tail), dir: path[path.length - 1], eaten } };
  }

  // Chains are ranked by fruit per tick (the day is a race against the clock), survivable ones first.
  const RATE_C = opts.rateC != null ? opts.rateC : 4;
  function better(a, b) {            // is chain a better than chain b ?
    if (!b) return true;
    if (a.surv !== b.surv) return a.surv;
    const ra = a.n / (a.tEnd - a.t0 + RATE_C), rb = b.n / (b.tEnd - b.t0 + RATE_C);
    if (Math.abs(ra - rb) > 1e-9) return ra > rb;
    return a.tEnd < b.tEnd;
  }

  // Best chain of up to `left` fruits starting from state st. At the root (level 0) all verified first legs are
  // returned best-first so the caller can double-check survival exactly.
  function node(st, left, level) {
    const H = level === 0 ? H1 : H2;
    const reach = bfs(st, H);
    const surv = reach >= Math.min(SURV, D - st.t);
    const cands = findCands(st, reach);
    if (!cands.length) return level === 0 ? [] : { surv, n: 0, tEnd: st.t, t0: st.t, path: null };
    if (left <= 1 && level > 0) {
      const c = cands[0];
      return { surv, n: 1, tEnd: st.t + c.tau, t0: st.t, path: null };
    }
    const K = Math.min(cands.length, beam[level] || 3);
    const paths = [];
    for (let i = 0; i < K; i++) paths.push(pathTo(cands[i].tau, cands[i].cell, cands[i].d));
    const chains = [];
    for (let i = 0; i < K; i++) {
      const r = simulate(st, paths[i]);
      if (!r.ok) continue;
      let chain;
      if (left <= 1) chain = { surv: true, n: r.ate.length, tEnd: r.T, t0: st.t, path: paths[i], state: r.state };
      else {
        const sub = node(r.state, left - 1, level + 1);
        chain = { surv: sub.surv, n: r.ate.length + sub.n, tEnd: sub.n > 0 ? sub.tEnd : r.T, t0: st.t, path: paths[i], state: r.state };
      }
      chains.push(chain);
    }
    chains.sort((a, b) => better(a, b) ? -1 : (better(b, a) ? 1 : 0));
    if (level === 0) return chains;
    return chains[0] || { surv: false, n: 0, tEnd: st.t, t0: st.t, path: null };
  }

  function state() {
    const run = g.run, t = run.t, hi = run.hi(t), si = run.si(t), body = [];
    for (let i = si; i <= hi; i++) body.push(run.px[i] + run.py[i] * C);
    return { t, body, dir: g.queue.length ? g.queue[g.queue.length - 1] : run.dir, eaten: new Set() };
  }

  // Exact depth-first search for a path that stays alive `want` ticks (whole body vs Echoes every tick, own body with
  // exact growth). Children are tried roomiest-first (capped flood fill), then nearest to (tx,ty). Bounded by `budget`
  // nodes; returns the longest path found ({path, len}).
  let rs = 12345; function rr() { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; }
  const seenF = new Int32Array(N); let stampF = 0; const qF = new Int32Array(N);
  function survDFS(st, want, budget, tx, ty, variant) {
    variant = variant || 0;
    const cells = new Int16Array(st.body.length + want + 2);
    for (let i = 0; i < st.body.length; i++) { cells[i] = st.body[i]; cnt[st.body[i]]++; }
    let bestLen = -1, bestPath = [];
    const path = [];
    function area(start, T, cap) {
      stampF++; let qh = 0, qt = 0, n = 0; qF[qt++] = start; seenF[start] = stampF;
      while (qh < qt && n < cap) {
        const c = qF[qh++]; n++;
        const x = c % C, y = (c / C) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
          const nc = nx + ny * C;
          if (seenF[nc] === stampF || cnt[nc] || ne[T * N + nc] === T) continue;
          seenF[nc] = stampF; qF[qt++] = nc;
        }
      }
      return n;
    }
    function rec(depth, d, hIdx, tIdx) {
      if (depth > bestLen) { bestLen = depth; bestPath = path.slice(); }
      if (depth >= want) return true;
      if (budget <= 0) return false;
      const T = st.t + depth + 1, h = cells[hIdx], x = h % C, y = (h / C) | 0;
      const opts = [];
      for (let k = 0; k < 3; k++) {
        const nd = k === 0 ? d : (k === 1 ? (d + 1) & 3 : (d + 3) & 3);
        const nx = x + DX[nd], ny = y + DY[nd];
        if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
        const nc = nx + ny * C;
        let eat = false;
        const list = g.cellFruit[nc];
        if (list) for (let q = 0; q < list.length; q++) { const id = list[q], f = g.fruits[id]; if (g.owner[id] < 0 && !g.eaten[id] && !st.eaten.has(id) && f.t0 <= T && T < f.t1) { eat = true; break; } }
        let leaving = -1;
        if (!eat) { leaving = cells[tIdx]; cnt[leaving]--; }
        let ok = cnt[nc] === 0;
        cells[hIdx + 1] = nc;
        if (ok) for (let j = eat ? tIdx : tIdx + 1; j <= hIdx + 1; j++) if (ne[T * N + cells[j]] === T) { ok = false; break; }
        let ar = 0;
        if (ok) { cnt[nc]++; ar = area(nc, T, 70); cnt[nc]--; }
        if (leaving >= 0) cnt[leaving]++;
        if (ok) opts.push({ nd, nc, eat, ar: Math.min(ar, 70), dist: Math.abs(nx - tx) + Math.abs(ny - ty) });
      }
      if (variant === 0) opts.sort((a, b) => (b.ar - a.ar) || (a.dist - b.dist));
      else if (variant === 1) opts.sort((a, b) => (Math.min(b.ar, 40) - Math.min(a.ar, 40)) || (a.dist - b.dist));
      else if (variant === 2) { for (const o of opts) o.r = rr(); opts.sort((a, b) => (b.ar - a.ar) || (a.r - b.r)); }
      else { for (const o of opts) o.r = rr(); opts.sort((a, b) => a.r - b.r); }
      for (const o of opts) {
        budget--;
        let leaving = -1;
        if (!o.eat) { leaving = cells[tIdx]; cnt[leaving]--; }
        cells[hIdx + 1] = o.nc; cnt[o.nc]++; path.push(o.nd);
        const done = rec(depth + 1, o.nd, hIdx + 1, o.eat ? tIdx : tIdx + 1);
        path.pop(); cnt[o.nc]--;
        if (leaving >= 0) cnt[leaving]++;
        if (done) return true;
        if (budget <= 0) return false;
      }
      return false;
    }
    rec(0, st.dir, st.body.length - 1, 0);
    for (let i = 0; i < st.body.length; i++) cnt[st.body[i]] = 0;
    return { len: bestLen, path: bestPath };
  }

  function nextTarget(st) {
    const head = st.body[st.body.length - 1], hx = head % C, hy = (head / C) | 0;
    let tx = C >> 1, ty = R >> 1, bc = 1e9;
    for (let i = 0; i < g.fruits.length; i++) {
      if (g.owner[i] >= 0 || g.eaten[i] || st.eaten.has(i)) continue;
      const f = g.fruits[i], dist = Math.abs(f.x - hx) + Math.abs(f.y - hy), arrive = Math.max(dist, f.t0 - st.t);
      if (st.t + arrive >= f.t1) continue;
      if (arrive < bc) { bc = arrive; tx = f.x; ty = f.y; }
    }
    return [tx, ty];
  }

  // Survival search with randomised restarts (a deep dead-end subtree can eat a whole budget). Returns the first
  // path reaching `want`, else the longest found.
  function survSearch(st, want, tx, ty, budgets) {
    let best = { len: -1, path: [] };
    for (let v = 0; v < budgets.length; v++) {
      const r = survDFS(st, want, budgets[v], tx, ty, v);
      if (r.len > best.len) best = r;
      if (r.len >= want) break;
    }
    return best;
  }

  function survivalPath(st) {
    stats.survival++;
    const [tx, ty] = nextTarget(st);
    const want = Math.min(D - st.t, opts.survWant || 1000);
    return survSearch(st, want, tx, ty, [4000, 4000, 8000, 8000, 16000, 30000]);
  }

  const KEEP = opts.keep || 12;     // ticks of a continuation followed before looking for fruit again
  function makePlan(prev) {
    stats.plans++;
    ne = echoTable(g);
    const st = state();
    const chains = node(st, depth, 0);
    // Invariant: we always hold an exact proof (a concrete move list) that the snake can stay alive to the end of
    // the day. A fruit chain is only taken if, after its first fruit, such a proof still exists.
    let bestC = null, bestV = null;
    for (let i = 0; i < chains.length && i < (opts.verifyK || 4); i++) {
      const c = chains[i];
      const [tx, ty] = nextTarget(c.state);
      const want = Math.min(opts.verify || 1000, D - c.state.t);
      const v = survSearch(c.state, want, tx, ty, [3000, 3000, 6000]);
      if (opts.trace) console.log('  cand', i, 'n', c.n, 'tEnd', c.tEnd, 'verify', v.len, '/', want);
      if (v.len >= want) { bestC = c; bestV = v; break; }
      stats.rejected = (stats.rejected || 0) + 1;
    }
    if (bestC) {
      if (opts.trace) console.log('t=' + st.t, 'len', st.body.length, 'fruit chain n=' + bestC.n, 'tEnd', bestC.tEnd, 'plen', bestC.path.length);
      return { dirs: bestC.path, i: 0, cont: bestV.path, contT: bestC.state.t };
    }
    // no verified chain: follow the proof we already hold (or find one), re-checking for fruit every KEEP ticks
    let cont = null;
    if (prev && prev.cont && prev.contT === st.t && prev.cont.length) cont = prev.cont;
    else { const sp = survivalPath(st); cont = sp.path.length ? sp.path : [st.dir]; }
    const k = Math.min(KEEP, cont.length);
    if (opts.trace) console.log('t=' + st.t, 'len', st.body.length, 'continuation', k, 'of', cont.length, 'chains', chains.length);
    return { dirs: cont.slice(0, k), i: 0, cont: cont.slice(k), contT: st.t + k };
  }

  return {
    stats,
    start() { plan = null; ne = echoTable(g); },
    decide() {
      if (!plan || plan.i >= plan.dirs.length) plan = makePlan(plan);
      return plan.dirs[plan.i++];
    }
  };
}
