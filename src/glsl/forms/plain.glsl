// ---------------------------------------------------------------------------
// PLAIN: a level country with one kind of thing repeated across it, and
// one exception. The flight line runs straight down the gap between two rows.
//   uTr[0] object: 0 none, 1 pylon, 2 stone, 3 lamp, 4 gate, 5 dome
//   uTr[1] spacing    uTr[2] height     uTr[3] jitter 0..1   uTr[4] how many cells are filled 0..1
//   uTr[5], uTr[6] the exception's cell (x, z)   uTr[7] exception: 1 lit, 2 absent, 3 colossal, 4 fallen
//   uTr[8] dune height   uTr[9] ground: 0 bare, 1 salt polygons, 2 furrows   uTr[10] width of object
// ---------------------------------------------------------------------------
#define FAR 1500.0
#define STEPK 0.92
#define SHFAR 160.0

float groundH(vec2 x) {
  return uTr[8] > 0.01 ? uTr[8] * (vnoise(x * 0.012) - 0.5) * smoothstep(8.0, 40.0, abs(x.x)) : 0.0;
}
bool isOdd(ivec2 c) { return c.x == int(uTr[5]) && c.y == int(uTr[6]); }

float thing(vec3 q, float kind, float H, float W, vec4 r, bool odd) {
  float ex = odd ? uTr[7] : 0.0;
  if (ex > 1.5 && ex < 2.5) return 1e5;                       // the absent one
  if (ex > 2.5 && ex < 3.5) { H *= 2.4; W *= 1.9; }           // the colossal one
  if (ex > 3.5) { q.xy = rot(1.32) * (q.xy - vec2(0.0, W)); q.y += W; }   // the fallen one
  float d;
  if (kind < 1.5) {                                            // pylon
    float w = W * (1.0 - 0.55 * clamp(q.y / H, 0.0, 1.0));
    d = max(sdBox2(q.xz, vec2(w)), abs(q.y - H * 0.5) - H * 0.5) * 0.9;
  } else if (kind < 2.5) {                                     // standing stone
    q.xz = rot(r.w * 6.283) * q.xz;
    float h = H * (0.6 + 0.4 * r.x);
    d = sdBox(q - vec3(0.0, h * 0.5, 0.0), vec3(W, h * 0.5, W * 0.38)) - W * 0.18;
  } else if (kind < 3.5) {                                     // lamp
    d = sdCyl(q - vec3(0.0, H * 0.5, 0.0), W * 0.12, H * 0.5);
    d = min(d, length(q - vec3(0.0, H + W * 0.55, 0.0)) - W * 0.6);
  } else if (kind < 4.5) {                                     // gate
    vec3 g = q; g.x = abs(g.x) - W * 2.2;
    d = sdBox(g - vec3(0.0, H * 0.5, 0.0), vec3(W * 0.3, H * 0.5, W * 0.3));
    d = min(d, sdBox(q - vec3(0.0, H * 0.94, 0.0), vec3(W * 3.0, W * 0.28, W * 0.38)));
    d = min(d, sdBox(q - vec3(0.0, H * 0.74, 0.0), vec3(W * 2.4, W * 0.18, W * 0.26)));
  } else {                                                     // dome
    d = length(q - vec3(0.0, -H * 0.15, 0.0)) - H * 0.75;
  }
  return d;
}

float map(vec3 p) {
  float d = p.y - groundH(p.xz);
  d = min(d, setPiece(p));
  gD = d;
  float kind = uTr[0];
  if (kind < 0.5) return d;
  float S = uTr[1], H = uTr[2], W = uTr[10];
  float top = H * 2.5 + 2.0;
  if (p.y > top) { d = min(d, p.y - top + 1.0); gD = d; return d; }
  ivec2 c = ivec2(floor(p.xz / S));
  vec4 r = cell4(c);
  vec3 q = vec3(p.x - (float(c.x) + 0.5) * S, p.y, p.z - (float(c.y) + 0.5) * S);
  float ex = cellExit(q.xz, S);                                  // never step past a neighbour
  bool odd = isOdd(c);
  if (r.x < uTr[4] || odd) {
    q.xz -= (r.yz - 0.5) * S * 0.42 * uTr[3] * (odd ? 0.0 : 1.0);
    d = min(d, thing(q, kind, H, W, r, odd));
  }
  gD = d;
  return min(d, ex);
}

Surf surf(vec3 p, vec3 n, float t) {
  float gh = groundH(p.xz);
  if (setPiece(p) < 0.02 + 0.002 * t) return setSurf(p);
  if (p.y - gh > 0.03 + 0.003 * t || n.y < 0.6) {              // one of the repeated things
    Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.3), mix(uInk[SHADE], uInk[DEEP], 0.5), 0.0, 1.0);
    float S = uTr[1];
    ivec2 c = ivec2(floor(p.xz / S));
    vec4 r = cell4(c);
    bool odd = isOdd(c);
    float kind = uTr[0];
    // lamps come on one at a time as the event runs; the lit exception is always on
    bool lamp = kind > 2.5 && kind < 3.5 && p.y > uTr[2] * (odd && uTr[7] > 2.5 && uTr[7] < 3.5 ? 2.4 : 1.0);
    float on = lamp ? step(r.w, uEv.x * 1.02 - 0.01) : 0.0;
    if (odd && uTr[7] > 0.5 && uTr[7] < 1.5 && (lamp || kind < 2.5 || kind > 3.5)) on = 1.0;
    if (on > 0.5) { s.lit = uInk[ACCENT]; s.shade = mix(uInk[ACCENT], uInk[PAPER], 0.25); s.glow = lamp ? 1.0 : 0.3; }
    return s;
  }
  Surf s = Surf(uInk[LIT], uInk[SHADE], 0.0, 0.0);
  float fade = exp(-t * 0.006);
  if (uTr[9] > 0.5 && uTr[9] < 1.5) {                           // salt polygons: cell borders in a darker ink
    vec2 x = p.xz * 0.16; ivec2 ci = ivec2(floor(x)); vec2 f = fract(x);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec4 r = cell4(ci + ivec2(i, j) + 53);
      float d = length(vec2(float(i), float(j)) + r.xy - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    float line = 1.0 - smoothstep(0.02, 0.05 + 2.0 * uPix * t, d2 - d1);
    s.lit = mix(s.lit, mix(uInk[LIT], uInk[SHADE], 0.55), line * fade);
    s.shade = mix(s.shade, uInk[DEEP], line * fade * 0.4);
  } else if (uTr[9] > 1.5) {                                    // furrows
    float line = smoothstep(0.42, 0.5, abs(fract(p.x * 0.5) - 0.5));
    s.lit = mix(s.lit, mix(uInk[LIT], uInk[SHADE], 0.4), line * fade);
  }
  return s;
}
