// Shared helper: for a game whose Echoes are fixed for the day, nextEcho[T*N + cell] is the first tick >= T
// at which some Echo body covers `cell` (BIG if never within the day). Built from Game.echoOcc, so it is exact.
export const BIG = 30000;

export function buildNextEcho(g) {
  const C = g.cfg.cols, R = g.cfg.rows, N = C * R, D = g.cfg.dayTicks;
  const ne = new Int16Array((D + 2) * N).fill(BIG);
  if (!g.echoes.length) return ne;
  const occ = new Uint8Array(N);
  for (let T = D; T >= 0; T--) {
    g.echoOcc(T, occ);
    const b = T * N, nb = (T + 1) * N;
    for (let c = 0; c < N; c++) ne[b + c] = occ[c] ? T : ne[nb + c];
  }
  return ne;
}

// Cache per game object, rebuilt when a new Echo is added.
export function echoTable(g) {
  if (!g._ne || g._neKey !== g.echoes.length) { g._ne = buildNextEcho(g); g._neKey = g.echoes.length; }
  return g._ne;
}
