// Safer autopilot than the one in core.test.mjs.  Works in Node (module.exports) and in the page (window.RT_pick).
// pick(g, DIRS) returns a direction (0..3) or null.  Looks 3 moves ahead against the body and the (deterministic) echoes,
// then prefers big open regions and the nearest edible fruit.
(function (root) {
  function pick(g, DIRS, opts) {
    opts = opts || {};
    const C = g.cfg.cols, R = g.cfg.rows, run = g.run, t = run.t, hi = run.hi(t), si = run.si(t);
    const hx = run.px[hi], hy = run.py[hi];
    const cur = g.queue.length ? g.queue[g.queue.length - 1] : run.dir;
    // echo occupancy at t+1..t+4
    const occ = [];
    for (let k = 1; k <= 4; k++) occ.push(g.echoOcc(t + k, new Uint8Array(C * R)));
    const bodyCells = [];
    for (let i = si; i <= hi; i++) bodyCells.push(run.px[i] + run.py[i] * C);
    // simulate body as a queue (no growth) for the lookahead
    function safeSeq(body, x, y, depth) {
      if (depth === 0) return true;
      for (let m = 0; m < 4; m++) {
        const nx = x + DIRS[m].x, ny = y + DIRS[m].y;
        if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
        const key = nx + ny * C;
        // tail vacates, so exclude body[0]
        let hit = false;
        for (let i = 1; i < body.length; i++) if (body[i] === key) { hit = true; break; }
        if (hit) continue;
        const o = occ[4 - depth];
        if (o[key]) continue;
        const nb = body.slice(1); nb.push(key);
        let bad = false;
        for (let i = 0; i < nb.length; i++) if (o[nb[i]]) { bad = true; break; }
        if (bad) continue;
        if (safeSeq(nb, nx, ny, depth - 1)) return true;
      }
      return false;
    }
    const targets = [];
    for (const f of g.fruits) if (g.owner[f.id] < 0 && !g.eaten[f.id] && f.t1 > t + 2) targets.push(f);
    let best = null, bestS = -1e9;
    for (const d of [cur, (cur + 1) & 3, (cur + 3) & 3]) {
      const nx = hx + DIRS[d].x, ny = hy + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
      const key = nx + ny * C;
      let hit = false;
      for (let i = 0; i < bodyCells.length; i++) if (bodyCells[i] === key) { hit = true; break; }  // tail also blocked: it would not vacate if we eat
      if (hit || occ[0][key]) continue;
      const nb = bodyCells.slice(1); nb.push(key);
      let bad = false;
      for (let i = 0; i < nb.length; i++) if (occ[0][nb[i]]) { bad = true; break; }
      if (bad) continue;
      if (!safeSeq(nb, nx, ny, 3)) continue;
      // flood fill
      const blocked = new Uint8Array(C * R);
      for (const c of nb) blocked[c] = 1;
      for (let i = 0; i < C * R; i++) if (occ[0][i]) blocked[i] = 1;
      const seen = new Uint8Array(C * R); const stack = [key]; seen[key] = 1; let area = 0;
      while (stack.length && area < 400) {
        const c = stack.pop(); area++;
        const cx = c % C, cy = (c / C) | 0;
        for (let m = 0; m < 4; m++) {
          const ax = cx + DIRS[m].x, ay = cy + DIRS[m].y;
          if (ax < 0 || ay < 0 || ax >= C || ay >= R) continue;
          const k2 = ax + ay * C;
          if (seen[k2] || blocked[k2]) continue;
          seen[k2] = 1; stack.push(k2);
        }
      }
      let s = Math.min(area, 3 * nb.length + 20) * 0.4;
      if (area < nb.length + 4) s -= 100;
      if (targets.length && !opts.noChase) {
        let md = 1e9;
        for (const f of targets) {
          const dist = Math.abs(f.x - nx) + Math.abs(f.y - ny);
          if (f.t0 > t + dist + 14) continue;
          if (f.t1 <= t + dist) continue;
          if (dist < md) md = dist;
        }
        if (md < 1e9) s -= md;
      }
      if (d === cur) s += 0.3;
      s -= (nx < 2 || ny < 2 || nx > C - 3 || ny > R - 3) ? 1.5 : 0;
      if (s > bestS) { bestS = s; best = d; }
    }
    return best;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { pick };
  else root.RT_pick = pick;
})(typeof window !== 'undefined' ? window : globalThis);
