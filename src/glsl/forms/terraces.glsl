// ---------------------------------------------------------------------------
// TERRACES: a stepped country. Hillsides cut into level shelves that follow
// the contours, with a valley running along the flight line.
//
// The ground is a smooth height r(x, z) whose value is quantised: a shelf is
// level at T * floor(r / T) and its riser stands upright where r crosses a
// multiple of T. Because r, its gradient and a bound on its curvature are all
// known, a ray can be walked from one contour to the next exactly, like a ray
// through a stack of cut card, instead of creeping up on a heightfield.
//
//   uTr[0] shelf height T      uTr[1] hill height H      uTr[2] half width of the valley floor
//   uTr[3] extra width of the coves                      uTr[4] run of the hillside, foot to shoulder
//   uTr[5] 1 / wavelength of the hills                   uTr[6], uTr[7] hill height = H * (uTr[6] + uTr[7] * noise)
//   uTr[8] how many shelves hold water 0..1              uTr[9] huts: share of cells with one, 0 none
//   uTr[10] 1 / sqrt(1 + G * G), G the steepest slope    uTr[11] bound on the curvature of r
//   uTr[12] steepest sideways slope of the flight line   uTr[13] slump 0..1: every second shelf has sunk this far
//   uTr[14] valley floor: 0 bare, 1 a road, 2 fields     uTr[15] size of a hut cell
// ---------------------------------------------------------------------------
#define FAR 1900.0
#define STEPK 0.9
#define SHFAR 340.0
#define LODPX 5.0

float gU;            // sideways distance from the flight line at the last rawG()

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
  float s = (abs(u) - uTr[2] - uTr[3] * (1.0 - n)) / uTr[4];
  vec2 ds = ((u < 0.0 ? -1.0 : 1.0) * vec2(1.0, uz) + uTr[3] * dn) / uTr[4];
  float sc = clamp(s, 0.0, 1.0);
  float P = sc * sc * (3.0 - 2.0 * sc), dP = 6.0 * sc * (1.0 - sc);
  float M = uTr[6] + uTr[7] * n;
  return vec3(uTr[1] * P * M, uTr[1] * (dP * M * ds + P * uTr[7] * dn));
}

// Far shelves sink into the ones below, pair by pair, before their risers get
// thinner than a few pixels. x: the shelf height here, y: how far the odd shelves have sunk.
vec2 shelf(vec3 p) {
  float L = log2(max(length(p - uCamP) * uPix * LODPX / uTr[0], 1.0));
  float o = floor(L);
  float f = smoothstep(0.08, 0.7, L - o);
  if (o < 0.5) f = max(f, uTr[13]);
  return vec2(uTr[0] * exp2(o), f);
}
float topOf(float j, vec2 sh) { return sh.x * (j - sh.y * mod(j, 2.0)); }

float shafts(vec3 ro, vec3 rd, float t, float jit) { return 0.0; }

float map(vec3 p) {
  vec3 R = rawG(p.xz);
  float u = gU;
  vec2 sh = shelf(p);
  float Te = sh.x, C = uTr[11];
  float j0 = floor(R.x / Te);
  float A = p.y - topOf(j0, sh);
  float g = length(R.yz);
  float sp = setPiece(p);
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
  gD = min(d, sp);
  if (dot(gRd, gRd) > 0.5) {
    // along this ray: walk the contours ahead, up to three shelves
    float c2 = 0.5 * C * dot(gRd.xz, gRd.xz);
    float rp = dot(R.yz, gRd.xz);
    float s0 = 0.0, st = 0.0, jb = j0;
    for (int k = uZero; k < 3; k++) {
      float top = topOf(jb, sh);
      if (p.y + gRd.y * s0 < top) { st = s0; break; }             // it meets this riser
      float dl = Te * (jb + 1.0) - R.x;
      float s1 = 2.0 * dl / max(rp + sqrt(rp * rp + 4.0 * c2 * dl), 1e-6);
      if (gRd.y < 0.0) {
        float sq = (p.y - top) / -gRd.y;
        if (sq < s1) { st = sq; break; }                           // it lands on this tread
      }
      s0 = s1; st = s1; jb += 1.0;
    }
    d = max(d, st);
    // the open air of the valley: no hill stands higher than the envelope H * P((|u| - W) / run)
    float Hm = uTr[1] * (uTr[6] + uTr[7]);
    float yr = gRd.y < 0.0 ? 0.6 * p.y : p.y;
    float need = yr >= Hm ? 1e5 : uTr[2] + uTr[4] * (0.5 - sin(asin(1.0 - 2.0 * yr / Hm) / 3.0));
    float se = (need - abs(u)) / max(abs(gRd.x) + uTr[12] * abs(gRd.z), 1e-4);
    if (gRd.y < 0.0) se = min(se, 0.4 * p.y / -gRd.y);
    d = max(d, se);
  }
  return min(d, sp);
}

Surf surf(vec3 p, vec3 n, float t) {
  if (setPiece(p) < 0.02 + 0.002 * t) return setSurf(p);
  vec3 R = rawG(p.xz);
  float u = gU;
  vec2 sh = shelf(p);
  float Te = sh.x;
  float g = length(R.yz);
  float px = uPix * t;
  if (n.y < 0.7) {
    // a riser: the cut edge of the card
    Surf s = Surf(mix(uInk[LIT], uInk[SHADE], 0.12), mix(uInk[SHADE], uInk[DEEP], 0.5), 0.0, exp(-t * 0.005));
    return s;
  }
  float j0 = floor(R.x / Te);
  float fade = exp(-t * 0.005);
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.42), mix(uInk[SHADE], uInk[LIT], 0.38), 0.0, fade);
  if (j0 < 0.5 && p.y < 0.5 * uTr[0]) {
    // the valley floor
    s.lit = uInk[LIT]; s.shade = uInk[SHADE]; s.line = 0.0;
    if (uTr[14] > 0.5) {
      float road = 1.0 - smoothstep(1.6, 1.6 + 1.5 * px, abs(u - 0.45 * uTr[2]));
      s.lit = mix(s.lit, mix(uInk[LIT], uInk[PAPER], 0.6), road); s.shade = mix(s.shade, mix(uInk[SHADE], uInk[PAPER], 0.3), road);
    }
    return s;
  }
  // which field of which shelf: stable as far shelves merge
  float jb = j0 * Te / uTr[0];
  bool alongZ = abs(R.y) > abs(R.z);
  float fl = (alongZ ? p.z : p.x) / 46.0;
  vec4 r = cell4(ivec2(int(jb) + (alongZ ? 0 : 97), int(floor(fl))));
  float wet = step(r.x, uTr[8]);
  s.lit = mix(s.lit, mix(uInk[LOW], uInk[PAPER], 0.5), wet);
  s.shade = mix(s.shade, mix(uInk[LOW], uInk[SHADE], 0.28), wet);
  // the bund: a darker line along the outer edge of each tread, and across it between fields
  float lip = (R.x - Te * j0) / max(g, 1e-5);
  float w = max(0.5, 1.2 * px);
  float bund = 1.0 - smoothstep(w, w + px, lip);
  float cross = 1.0 - smoothstep(0.6 * w, 0.6 * w + px, (0.5 - abs(fract(fl) - 0.5)) * 46.0);
  bund = max(bund, cross) * fade * (0.35 + 0.65 * uTr[8]) * (1.0 - uTr[13]);
  s.lit = mix(s.lit, mix(uInk[LIT], uInk[SHADE], 0.6), bund);
  s.shade = mix(s.shade, mix(uInk[SHADE], uInk[DEEP], 0.5), bund);
  return s;
}
