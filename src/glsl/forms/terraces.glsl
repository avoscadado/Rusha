// ---------------------------------------------------------------------------
// TERRACES: a stepped country. Hillsides cut into level shelves that follow
// the contours, with a valley running along the flight line.
//
// The ground is a smooth height r(x, z) whose value is quantised: a shelf is
// level at T * floor(r / T) and its riser stands upright where r crosses a
// multiple of T. Because r, its gradient and a bound on its curvature are all
// known, a ray can be walked from one contour to the next, like a ray through
// a stack of cut card, instead of creeping up on a heightfield.
//
//   uTr[0] shelf height T      uTr[1] hill height H      uTr[2] half width of the valley floor
//   uTr[3] extra width where the hills are low           uTr[4] run of the hillside, foot to shoulder
//   uTr[5] 1 / wavelength of the hills                   uTr[6] how early the hillside steepens (0 = an even S)
//   uTr[7] how much the hills differ in height: H * (1 - uTr[7] + uTr[7] * noise)
//   uTr[8] how many fields hold water 0..1               uTr[9] huts: share of cells with one, 0 none
//   uTr[10] 1 / sqrt(1 + G * G), G the steepest slope    uTr[11] bound on the curvature of r
//   uTr[12] spurs: 2 pi / their spacing along the valley uTr[13] slump 0..1: every second shelf has sunk this far
//   uTr[14] valley floor: 0 bare, 1 a road               uTr[15] spurs: how far the coves between them go back
// ---------------------------------------------------------------------------
#define FAR 1900.0
#define STEPK 0.9
#define SHFAR 340.0
#define LODPX 7.0        // a riser is never drawn thinner than this many pixels: far shelves merge instead
#define HCELL 72.0       // one hut at most in a square of this size
#define HTALL 7.0        // nothing built stands higher than this above its shelf

float gU;                // sideways distance from the flight line at the last rawG()
vec3 gHq;                // the last hut, in its own frame: x downhill, y up from its floor, z along the shelf
vec4 gHr;                // and its lattice randoms
bool gFree;              // the last walk() met nothing

// the smooth height before it is cut into shelves, and its gradient
vec3 rawG(vec2 x) {
  float pz = uPathA.y * x.y + uPathA.z;
  float u = x.x - uPathA.x * sin(pz);
  float uz = -uPathA.x * uPathA.y * cos(pz);
  gU = u;
  vec2 q = x * uTr[5];
  vec2 f = fract(q);
  ivec2 c = ivec2(floor(q));
  vec2 w = f * f * (3.0 - 2.0 * f), dw = 6.0 * f * (1.0 - f);
  float a = cell1(c), b = cell1(c + ivec2(1, 0)), d = cell1(c + ivec2(0, 1)), e = cell1(c + ivec2(1, 1));
  float n = mix(mix(a, b, w.x), mix(d, e, w.x), w.y);
  vec2 dn = uTr[5] * vec2(dw.x * mix(b - a, e - d, w.y), dw.y * mix(d - a, e - b, w.x));
  float sg = u < 0.0 ? -1.0 : 1.0;
  float ph = x.y * uTr[12] + sg * 1.9;                 // coves scalloped into each side, out of step with each other
  float s = (abs(u) - uTr[2] - uTr[3] * (1.0 - n) - uTr[15] * (0.5 + 0.5 * sin(ph))) / uTr[4];
  vec2 ds = (sg * vec2(1.0, uz) + uTr[3] * dn - vec2(0.0, 0.5 * uTr[15] * uTr[12] * cos(ph))) / uTr[4];
  float sc = clamp(s, 0.0, 1.0), kb = 1.0 / (1.0 + uTr[6] * sc);
  float bs = sc * (1.0 + uTr[6]) * kb;                 // the profile: an S, leaning toward the valley
  float P = bs * bs * (3.0 - 2.0 * bs), dP = 6.0 * bs * (1.0 - bs) * (1.0 + uTr[6]) * kb * kb;
  float M = 1.0 - uTr[7] + uTr[7] * n;
  return vec3(uTr[1] * P * M, uTr[1] * (dP * M * ds + P * uTr[7] * dn));
}

// Far shelves sink into the ones below, pair by pair, before their risers get
// thinner than a few pixels. x: the shelf height here, y: how far the odd
// shelves have sunk, z: 1 where huts stand, 0 where they have sunk away.
vec3 shelf(vec3 p) {
  float L = log2(max(length(p - uCamP) * uPix * LODPX / uTr[0], 0.25));
  float o = max(floor(L), 0.0);
  float f = smoothstep(0.08, 0.7, L - o);
  if (o < 0.5) f = max(f, uTr[13]);
  return vec3(uTr[0] * exp2(o), f, 1.0 - smoothstep(-0.55, -0.1, L));
}
float topOf(float j, vec3 sh) { return sh.x * (j - sh.y * mod(j, 2.0)); }

// The hut of the cell this point is in, if it has one: a low wall and a steep roof,
// standing just behind the lip of whatever shelf is under the middle of it.
float hutD(vec3 p, float lod, float within) {
  ivec2 c = ivec2(floor(p.xz / HCELL));
  vec4 r = cell4(c + 31);
  if (r.x > uTr[9]) return 1e5;
  vec2 ctr = (vec2(c) + 0.5 + (r.yz - 0.5) * 0.5) * HCELL;
  vec2 o = p.xz - ctr;
  float bound = length(o) - 10.5;
  if (bound > within) return bound;
  vec3 R = rawG(ctr);
  float j = floor(R.x / uTr[0]);
  if (j < 0.5 || R.x > 0.72 * uTr[1]) return 1e5;
  float g = length(R.yz);
  vec2 dir = g > 1e-4 ? R.yz / g : vec2(1.0, 0.0);
  float back = clamp(3.6 - (R.x - uTr[0] * j) / max(g, 1e-4), 0.0, 3.6);
  float sc = 0.85 + 0.4 * r.w;
  vec3 q = vec3(dot(o, -dir) + back, p.y - uTr[0] * j + (1.0 - lod) * HTALL, dot(o, vec2(-dir.y, dir.x))) / sc;
  gHq = q; gHr = r;
  float body = sdBox(q - vec3(0.0, 0.3, 0.0), vec3(2.3, 1.9, 3.3));
  float roof = max(max(dot(vec2(abs(q.x), q.y - 4.9), vec2(0.69, 0.72)), 2.0 - q.y), abs(q.z) - 3.9);
  return min(body, roof) * sc;
}

// Along the ray gRd from p: how far to the first riser or tread it can meet, looking
// four shelves ahead. With clear > 0 it stops that far above a tread instead.
float walk(vec3 p, vec3 R, vec3 sh, float j0, float clear) {
  float c2 = 0.5 * uTr[11] * dot(gRd.xz, gRd.xz);
  float rp = dot(R.yz, gRd.xz);
  float s0 = 0.0, jb = j0;
  gFree = false;
  for (int k = uZero; k < 4; k++) {
    float top = topOf(jb, sh) + clear;
    if (p.y + gRd.y * s0 < top) return s0;                         // it meets this riser
    float dl = sh.x * (jb + 1.0) - R.x;
    float s1 = 2.0 * dl / max(rp + sqrt(rp * rp + 4.0 * c2 * dl), 1e-6);
    if (gRd.y < 0.0) {
      float sq = (p.y - top) / -gRd.y;
      if (sq < s1) return sq;                                      // it lands on this tread
    }
    s0 = s1; jb += 1.0;
  }
  gFree = true;
  return s0;
}
// No hill stands higher than the envelope H * P((|u| - W) / run): how far from the line a hill can reach this height.
float reach(float y) {
  if (y >= uTr[1]) return 1e5;
  float bn = 0.5 - sin(asin(1.0 - 2.0 * y / uTr[1]) / 3.0);
  return uTr[2] + uTr[4] * bn / (1.0 + uTr[6] * (1.0 - bn));
}
// In the open air of the valley: how far the ray gRd can go before it could be under that envelope.
float openAir(vec3 p, float u, float clear) {
  float lat = max(abs(gRd.x) + abs(uPathA.x * uPathA.y * gRd.z), 1e-4);
  float se = 0.0;
  if (gRd.y < 0.0) {
    float y = 0.6 * p.y - clear;
    if (y > 0.0) se = min((reach(y) - abs(u)) / lat, 0.4 * p.y / -gRd.y);
  } else {
    // a rising ray clears more of the hill the further it goes
    for (int i = uZero; i < 3; i++) {
      float y = p.y + gRd.y * se - clear;
      if (y <= 0.0) break;
      se = max(se, (reach(y) - abs(u)) / lat);
    }
  }
  return se;
}

float shafts(vec3 ro, vec3 rd, float t, float jit) { return 0.0; }

float map(vec3 p) {
  vec3 R = rawG(p.xz);
  float u = gU;
  vec3 sh = shelf(p);
  float Te = sh.x, C = uTr[11];
  float j0 = floor(R.x / Te);
  float A = p.y - topOf(j0, sh);
  float g = length(R.yz);
  float sp = setPiece(p);
  bool huts = uTr[9] > 0.001 && sh.z > 0.01;
  float d;
  if (A < 0.0) {
    // inside the ground: the nearer of the tread overhead and the riser in front
    float m = floor(p.y / Te), jn = m + 1.0;
    if (mod(jn, 2.0) > 0.5 && p.y - Te * m >= Te * (1.0 - sh.y)) jn += 1.0;
    d = jn < 0.5 ? A : max(A, (Te * jn - R.x) / max(g, 1e-5));
    gD = min(d, sp);
    return gD;
  }
  // outside: never more than the true distance to the stack
  float d1 = Te * (j0 + 1.0) - R.x, d2 = d1 + Te;
  float B1 = 2.0 * d1 / (g + sqrt(g * g + 2.0 * C * d1));
  float B2 = 2.0 * d2 / (g + sqrt(g * g + 2.0 * C * d2));
  d = min(A, max(max(B1, min(p.y - topOf(j0 + 1.0, sh), B2)), (p.y - R.x) * uTr[10]));
  if (dot(gRd, gRd) < 0.5) {                            // no ray: a plain distance, for the normal
    if (huts) d = min(d, hutD(p, sh.z, d));
    gD = min(d, sp);
    return gD;
  }
  float st = max(max(d, walk(p, R, sh, j0, 0.0)), openAir(p, u, 0.0));
  bool sun = gRd == uSunDir;
  // A shadow ray that has nothing in front of it may go as far as it is above the ground: landing inside a
  // hill is as good as meeting it, and the ray is not then taken to be grazing something it is nowhere near.
  if (sun && gFree) st = max(st, 0.8 * A);
  if (huts) {
    if (sun) {
      // a shadow ray: a hut shades its own cell and no further, so that no step here is cut short by a cell wall
      st = min(st, hutD(p, sh.z, st));
      gD = min(st, sp);
      return gD;
    }
    // near the ground a hut may stand in the way: go cell by cell there, and stay clear of it from above
    float sc = walk(p, R, sh, j0, HTALL);
    if (A < HTALL + 1.5 || sc < 1.0) {
      vec2 q = p.xz - (floor(p.xz / HCELL) + 0.5) * HCELL;
      float dh = min(hutD(p, sh.z, st), cellExit(q, HCELL));
      gD = min(min(d, dh), sp);
      return min(min(st, dh), sp);
    }
    st = max(max(d - HTALL, sc), openAir(p, u, HTALL));
  }
  gD = min(d, sp);
  return min(st, sp);
}

// the tone z-main will print for a face whose normal makes this cosine with the sun, if nothing shades it
float toneOf(float ndl) {
  float nb = max(uSun.z, 1.0), x = smoothstep(-0.02, 0.5, ndl) * step(-0.02, uSunDir.y) * nb;
  return min((floor(x) + smoothstep(0.38, 0.62, fract(x))) / nb, 1.0);
}

Surf surf(vec3 p, vec3 n, float t) {
  if (setPiece(p) < 0.02 + 0.002 * t) return setSurf(p);
  vec3 sh = shelf(p);
  float px = uPix * max(t, length(p - uCamP));          // a reflection is as far away as the whole way round
  if (uTr[9] > 0.001 && sh.z > 0.01 && hutD(p, sh.z, 1.0) < 0.03 + 0.003 * t) {
    vec3 q = gHq;
    Surf h = Surf(mix(uInk[LIT], uInk[PAPER], 0.62), mix(uInk[SHADE], uInk[LIT], 0.25), 0.0, 1.0);
    if (q.y > 2.02 && n.y > 0.3) {                      // thatch
      h.lit = mix(uInk[SHADE], uInk[LIT], 0.35); h.shade = mix(uInk[SHADE], uInk[DEEP], 0.7);
    } else if (q.x > 2.2 && abs(q.z - 0.8) < 0.8 && abs(q.y - 1.15) < 0.6) {
      // one window, on the side that looks down the hill; lamps are lit in it one hut at a time
      float on = abs(uEv.y - 2.0) < 0.5 ? step(gHr.w, uEv.x * 1.02 - 0.01) : 0.0;
      h.lit = mix(uInk[DEEP], uInk[ACCENT], on); h.shade = h.lit; h.glow = on; h.line = 0.0;
    }
    return h;
  }
  vec3 R = rawG(p.xz);
  float u = gU;
  float Te = sh.x;
  float g = max(length(R.yz), 1e-5);
  float fade = exp(-t * 0.005);
  vec3 view = normalize(p - uCamP);
  float j0 = floor(R.x / Te);
  // the riser: the cut edge of the card
  Surf rs = Surf(mix(uInk[LIT], uInk[SHADE], 0.12), mix(uInk[SHADE], uInk[DEEP], 0.5), 0.0, fade);
  // the tread
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.42), mix(uInk[SHADE], uInk[LIT], 0.38), 0.0, fade);
  bool tread = n.y > 0.7;
  bool floor0 = tread && j0 < 0.5 && p.y < 0.5 * uTr[0];
  // a riser belongs to the shelf it holds up: the lowest one whose top is above this point
  float jt = j0;
  if (!tread) {
    float m = floor(p.y / Te);
    jt = m + 1.0;
    if (mod(jt, 2.0) > 0.5 && p.y - Te * m >= Te * (1.0 - sh.y)) jt += 1.0;
  }
  // which field of which shelf: stable as far shelves merge. The valley floor is ruled into fields along the line.
  float jb = jt * Te / uTr[0];
  bool alongZ = floor0 || abs(R.y) > abs(R.z);
  float fl = (alongZ ? p.z : p.x) / 46.0;
  float fw = 0.5 * uTr[2] + 6.0, fu = floor0 ? u / fw + 0.5 : 0.0;
  vec4 r = cell4(ivec2(int(jb) + (alongZ ? 0 : 97) + 7 * int(floor(fu)), int(floor(fl))));
  float wet = step(r.x, uTr[8]);
  if (floor0) { s.lit = uInk[LIT]; s.shade = uInk[SHADE]; s.line = 0.0; }
  s.lit = mix(s.lit, mix(uInk[LOW], uInk[PAPER], 0.5), wet);
  s.shade = mix(s.shade, mix(uInk[LOW], uInk[SHADE], 0.28), wet);
  // what a level tread prints as when nothing shades it
  vec3 as = mix(mix(s.shade, uInk[TOP], 0.22), s.lit, toneOf(uSunDir.y));
  if (!tread) {
    // the lip: every shelf shows its edge as one ruled line, however little of its tread can be seen;
    // a riser thinner than a pixel or two is printed as tread altogether
    float hr = topOf(jt, sh) - topOf(jt - 1.0, sh);
    float w = max(1.25 * px, 0.05 * uTr[0]);
    float lip = 1.0 - smoothstep(w, w + 0.5 * px, topOf(jt, sh) - p.y);
    lip = max(lip, 1.0 - smoothstep(1.2, 2.6, hr / px));
    rs.lit = mix(rs.lit, as, lip); rs.shade = mix(rs.shade, as, lip); rs.line *= 1.0 - lip;
    return rs;
  }
  // a tread seen so nearly edge on that it is a sliver is printed as the riser behind it: the lip line stays clean
  float thin = floor0 ? 0.0 : 1.0 - smoothstep(0.8, 2.0, Te / g * abs(view.y) / px);
  // the bund: a darker line along the outer edge of each tread, and across it between fields
  float w = max(0.5, 1.2 * px);
  float bund = floor0 ? 1.0 - smoothstep(0.6 * w, 0.6 * w + px, (0.5 - abs(fract(fu) - 0.5)) * fw)
                      : 1.0 - smoothstep(w, w + px, (R.x - Te * j0) / g);
  float cross = 1.0 - smoothstep(0.6 * w, 0.6 * w + px, (0.5 - abs(fract(fl) - 0.5)) * 46.0);
  bund = max(bund, cross) * fade * (floor0 ? 0.3 + 0.7 * uTr[8] : 0.35 + 0.65 * uTr[8]) * (1.0 - uTr[13]) * (1.0 - thin);
  s.lit = mix(s.lit, mix(uInk[LIT], uInk[SHADE], 0.6), bund);
  s.shade = mix(s.shade, mix(uInk[SHADE], uInk[DEEP], 0.5), bund);
  if (floor0 && uTr[14] > 0.5) {
    // a road keeps to one side of the line
    float road = 1.0 - smoothstep(1.5, 1.5 + 1.5 * px, abs(u - 0.5 * fw));
    s.lit = mix(s.lit, mix(uInk[LIT], uInk[PAPER], 0.6), road); s.shade = mix(s.shade, mix(uInk[SHADE], uInk[PAPER], 0.3), road);
  }
  vec3 ar = mix(rs.shade, rs.lit, toneOf(dot(-R.yz / g, uSunDir.xz)));
  s.lit = mix(s.lit, ar, thin); s.shade = mix(s.shade, ar, thin); s.line *= 1.0 - thin;
  return s;
}
