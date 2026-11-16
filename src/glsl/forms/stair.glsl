// ---------------------------------------------------------------------------
// STAIR: a long stepped well. Great levels go down to the water on both sides,
// and against each one small flights of steps climb in mirrored pairs, so the
// walls are a lattice of triangles. The flight keeps to the middle of the water.
//   uTr[0] half width of the water   uTr[1] depth of a level   uTr[2] height of a level   uTr[3] levels above the water
//   uTr[4] length of a pair of flights   uTr[5] steps in a flight   uTr[6] distance between frames (0 none)
//   uTr[7] distance between kiosks (0 none)   uTr[8] level of the painted flight   uTr[9] its cell   uTr[10] its side
//   uTr[11] 1 = one flight is painted   uTr[12] lamps in the kiosks   uTr[13] levels under the water
// ---------------------------------------------------------------------------
#define FAR 640.0
#define STEPK 0.9
#define SHFAR 110.0

float shafts(vec3 ro, vec3 rd, float t, float jit) { return 0.0; }

// distance to a solid quarter of the plane whose corner is at the origin of q
float qp(vec2 q) { return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float flightA(float z, float i) { float P = uTr[4]; return P * 0.5 - abs(mod(z + i * P * 0.5, P) - P * 0.5); }

float map(vec3 p) {
  float W0 = uTr[0], D = uTr[1], RH = uTr[2], N = uTr[3], Bn = uTr[13];
  float M = N + Bn, base = -Bn * RH, top = N * RH;
  float d;
  if (p.y > top + 9.0) { gD = 1e3; return (p.y - top - 8.0) * 0.94; }   // a safe step; no surface is near
  // the well bends with the flight line
  float px = p.x - pathXY(p.z).x;
  float ax = abs(px), u = ax - W0;
  float i = clamp(floor(u / D), -1.0, M - 1.0);
  // the level underfoot and the one that rises ahead
  d = qp(vec2(i * D - u, p.y - (base + (i + 1.0) * RH)));
  if (i < M - 1.0) d = min(d, qp(vec2((i + 1.0) * D - u, p.y - (base + (i + 2.0) * RH))));
  // the small flights that stand on this level, against the next
  if (i > -0.5 && i < M - 1.5) {
    float n = uTr[5], tw = uTr[4] * 0.5 / n, sh = RH / n, yb = base + (i + 1.0) * RH;
    float a = flightA(p.z, i), k = clamp(floor(a / tw), 0.0, n - 1.0);
    float df = qp(vec2(k * tw - a, p.y - (yb + (k + 1.0) * sh)));
    if (k < n - 1.5) df = min(df, qp(vec2((k + 1.0) * tw - a, p.y - (yb + (k + 2.0) * sh))));
    // far off, a flight is drawn as the ramp it amounts to, before its steps turn to speckle
    float slope = RH / (uTr[4] * 0.5);
    float ramp = (p.y - yb - sh * 0.5 - a * slope) / sqrt(1.0 + slope * slope);
    df = mix(df, ramp, smoothstep(sh / (3.2 * uPix), sh / (1.6 * uPix), length(p.xz - uCamP.xz)));
    d = min(d, max(df, (i + 0.5) * D - u));
  }
  float away = length(p.xz - uCamP.xz), fat = min(0.7 * uPix * away, 0.25);
  if (uTr[6] > 1.0) {                                       // frames: two piers and a beam across the water
    float zf = mod(p.z, uTr[6]) - uTr[6] * 0.5;
    float pier = sdBox(vec3(ax - W0 + 0.45, p.y - (top + 1.3 + base) * 0.5, zf), vec3(0.45, (top + 1.3 - base) * 0.5, 0.55)) - fat;
    float beam = sdBox(vec3(px, p.y - top - 0.75, zf), vec3(W0, 0.55, 0.55)) - fat;
    d = min(d, min(pier, beam));
  }
  if (uTr[7] > 1.0) {                                       // kiosks along the top: four posts and a roof
    float zk = mod(p.z, uTr[7]) - uTr[7] * 0.5;
    vec3 q = vec3(ax - (W0 + M * D + 2.6), p.y - top, zk);
    float lod = 1.0 - smoothstep(170.0, 260.0, away);
    float roof = sdBox(q - vec3(0.0, 3.1 * lod, 0.0), vec3(1.5, 0.22, 1.5) * lod);
    roof = min(roof, sdBox(q - vec3(0.0, 3.6 * lod, 0.0), vec3(0.8, 0.3, 0.8) * lod));
    float posts = max(length(abs(q.xz) - 1.2) - 0.16 - fat, q.y - 3.0 * lod);
    d = min(d, min(roof, posts));
  }
  d = min(d * 0.94, setPiece(p));                             // the bend shears distances a little
  gD = d;
  return d;
}

Surf surf(vec3 p, vec3 n, float t) {
  if (setPiece(p) < 0.02 + 0.002 * t) return setSurf(p);
  float W0 = uTr[0], D = uTr[1], RH = uTr[2], N = uTr[3], Bn = uTr[13];
  float M = N + Bn, base = -Bn * RH, top = N * RH;
  float px = p.x - pathXY(p.z).x;
  float ax = abs(px), u = ax - W0, side = px < 0.0 ? -1.0 : 1.0;
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.4), mix(uInk[SHADE], uInk[DEEP], 0.25), 0.0, 1.0);
  // kiosks and frames
  if (p.y > top + 0.06) {
    if (uTr[7] > 1.0 && u > M * D + 0.8) {
      bool roof = p.y > top + 2.85;
      s.lit = roof ? uInk[ACCENT] : s.lit; s.shade = roof ? mix(uInk[ACCENT], uInk[DEEP], 0.5) : s.shade;   // the roofs carry the accent ink
      float zc = floor(p.z / uTr[7]);
      if (uTr[12] > 0.5 && roof && n.y < -0.5) {             // a lamp under each roof, coming on in turn
        float on = step(cell1(ivec2(int(zc), int(side) + 9)), uEv.x * 1.02 - 0.01);
        s.lit = mix(s.lit, uInk[ACCENT], on); s.shade = mix(s.shade, uInk[ACCENT], on); s.glow = on;
      }
    }
    return s;
  }
  float i = clamp(floor(u / D), -1.0, M - 1.0);
  bool flight = i > -0.5 && i < M - 1.5 && u > (i + 0.5) * D - 0.02 && p.y > base + (i + 1.0) * RH + 0.02;
  bool riser = abs(n.y) < 0.45;
  if (riser) s.lit = mix(uInk[LIT], uInk[SHADE], 0.18);
  if (flight) {
    s.lit = riser ? uInk[LIT] : mix(uInk[LIT], uInk[PAPER], 0.62);
    float zc = floor((p.z + i * uTr[4] * 0.5) / uTr[4]);
    if (uTr[11] > 0.5 && abs(i - uTr[8]) < 0.5 && abs(zc - uTr[9]) < 0.5 && side * uTr[10] > 0.0) {
      s.lit = uInk[ACCENT]; s.shade = mix(uInk[ACCENT], uInk[DEEP], 0.45); s.glow = 0.08;
    }
  } else if (!riser && u > 0.0) {                            // a joint line along each great tread
    float joint = smoothstep(0.46, 0.49, abs(fract(p.z / 3.0) - 0.5)) * exp(-t * 0.02);
    s.lit = mix(s.lit, uInk[SHADE], joint * 0.3);
  }
  // whatever has been under water stays dark
  float wet = (1.0 - smoothstep(0.12, 0.45, p.y)) * step(base + 0.05, p.y);
  s.lit = mix(s.lit, mix(uInk[SHADE], uInk[LIT], 0.3), wet); s.shade = mix(s.shade, uInk[DEEP], wet * 0.6);
  if (p.y < base + 0.05) { s.lit = mix(uInk[SHADE], uInk[LIT], 0.4); s.line = 0.0; }
  return s;
}
