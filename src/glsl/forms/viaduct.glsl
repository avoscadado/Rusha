// ---------------------------------------------------------------------------
// VIADUCT: arches that cross nothing, from one horizon to the other. The flight
// goes beside it, or between two of them, or under its deck between two rows of
// piers. Every bay is the same, so plain domain repetition is exact here: along
// the line, and up the tiers. The datum is y = 0: the water, the mist or the
// ground the piers stand in.
//   uTr[0] bay            uTr[1] top of the main arcade      uTr[2] height of one tier
//   uTr[3] tiers + 10 * (small arches to a bay in the arcade on top, 0 for none)
//   uTr[4] half width of a pier along the line   uTr[5] half thickness of the wall
//   uTr[6] arch: 1 round, more than 1 pointed (rise over half span)
//   uTr[7] springing height within a tier        uTr[8] height of the top arcade
//   uTr[9] where the viaduct stands: x of its centre plane (layouts 1 and 2: on both sides)
//   uTr[10] layout: 0 one viaduct, 1 an avenue of two, 2 a nave under one deck
//   uTr[11] the floor     uTr[12] exception: 0 none, 1 a fallen arch, 2 a painted pier, 3 a blind arch
//   uTr[13] its bay (signed by its side in an avenue)   uTr[14] share of spans that are down (much later)
//   uTr[15] bits: 1 lamps, 2 lamps already lit, 4 pilasters, 8 openings over the piers, 16 shafts of light
// ---------------------------------------------------------------------------
#define FAR 5200.0
#define STEPK 0.9
#define SHFAR 900.0

float vBit(float b) { return step(0.5, mod(floor(uTr[15] / b), 2.0)); }

// An arch-shaped opening seen square on. q.y is measured from the springing line;
// the legs go down to q.y = -sill. k is rise over half span: 1 round, more is pointed.
float archSD(vec2 q, float a, float k, float sill) {
  float leg = max(max(abs(q.x) - a, q.y), -sill - q.y);
  float R = a * (k * k + 1.0) * 0.5;
  float top = max(length(vec2(abs(q.x) + R - a, q.y)) - R, -q.y - min(sill, 0.5 * a));   // overlaps the legs: no film at the springing
  return min(leg, top);
}

// The frame of the nearest viaduct: x across it (0 on its centre plane). sgn is which
// way its x runs in the world, sid tells the two of an avenue apart, cdx is how far
// the eye stands from its plane.
vec3 vFrame(vec3 p, out float sgn, out float sid, out float cdx) {
  sid = 0.0; sgn = 1.0;
  float X = uTr[9];
  if (uTr[10] < 0.5) { cdx = abs(uCamP.x - X); return vec3(p.x - X, p.y, p.z); }
  sgn = p.x < 0.0 ? -1.0 : 1.0;
  if (uTr[10] < 1.5) sid = sgn;
  cdx = abs(uCamP.x * sgn - X);
  return vec3(abs(p.x) - X, p.y, p.z);
}
float vTop() { return uTr[1] + (uTr[3] > 9.5 ? uTr[8] : 0.0); }       // underside of the cornice
bool vDown(float bay, float sid) { return cell1(ivec2(int(bay), 9 + int(sid))) < uTr[14]; }
bool vOdd(float bay, float sid) { return abs(bay - abs(uTr[13])) < 0.5 && (uTr[10] < 0.5 || uTr[10] > 1.5 || sid * uTr[13] > 0.0); }

// is this point in the light that comes through an arch?
float inBeam(vec3 p) {
  float X = uTr[9], sx = uSunDir.x;
  if (abs(p.x) > X - uTr[5] || p.y > uTr[1] - 1.4) return 0.0;
  float s = ((sx > 0.0 ? X : -X) - p.x) / (abs(sx) < 1e-3 ? 1e-3 : sx);
  vec3 h = p + uSunDir * s;
  float S = uTr[0], Hm = uTr[1], T = uTr[2], N = mod(uTr[3], 10.0);
  if (h.y > Hm || h.y < uSea.y) return 0.0;
  float yb = Hm - N * T;
  float ti = clamp(floor((h.y - yb) / T), 0.0, N - 1.0);
  float v = mod(h.z, S) - S * 0.5;
  return step(archSD(vec2(v, h.y - yb - ti * T - uTr[7]), S * 0.5 - uTr[4], uTr[6], ti < 0.5 ? 1e4 : uTr[7]), 0.0);
}
// only under the deck of the nave, where the light comes in through the sunward row
float shafts(vec3 ro, vec3 rd, float t, float jit) {
  if (vBit(16.0) < 0.5 || uTr[10] < 1.5 || uSunDir.y < 0.03) return 0.0;
  float far = min(t, 7.0 * uTr[0]), s = 0.0;
  for (int i = uZero; i < 14; i++) {
    float f = (float(i) + 0.3 + 0.4 * jit) / 14.0;
    s += inBeam(ro + rd * far * f) * exp(-far * f * uAir.x * 1.5);
  }
  return s / 14.0 * (far / (5.0 * uTr[0])) * 1.3;
}

float map(vec3 p) {
  float sgn, sid, cdx;
  vec3 q = vFrame(p, sgn, sid, cdx);
  float S = uTr[0], Hm = uTr[1], T = uTr[2], pw = uTr[4], w = uTr[5], k = uTr[6], hs = uTr[7], fy = uTr[11];
  float N = mod(uTr[3], 10.0), nUp = floor(uTr[3] * 0.1 + 0.01);
  // pixels covered by a metre of the viaduct's length here: openings close and lamps sink before they alias
  vec2 dl = p.xz - uCamP.xz;
  float dc2 = dot(dl, dl) + 1.0, dc = sqrt(dc2);
  float px1 = cdx / (dc2 * uPix);
  float a0 = S * 0.5 - pw, a = a0 * smoothstep(1.0, 2.6, 2.0 * a0 * px1);
  float yb = Hm - N * T;
  float v = mod(q.z, S) - S * 0.5;                 // 0 at the middle of a span
  float cv = S * 0.5 - abs(v);                     // distance along the line from the middle of a pier
  float ax = abs(q.x);
  bool pil = vBit(4.0) > 0.5, lamps = vBit(1.0) > 0.5, nave = uTr[10] > 1.5;

  // the main arcade: one opening to a bay in every tier; the lowest goes down for good
  float ti = clamp(floor((q.y - yb) / T), 0.0, N - 1.0);
  float yl = q.y - yb - ti * T;
  float d = max(max(ax - w, q.y - Hm), -archSD(vec2(v, yl - hs), a, k, ti < 0.5 ? 1e4 : hs));
  if (vBit(8.0) > 0.5) {                           // a small opening over every pier
    float ao = 0.6 * pw, lo = 0.3 * a0;
    d = max(d, -archSD(vec2(cv, yl - hs - lo), ao * smoothstep(1.0, 2.6, 2.0 * ao * px1), 1.0, lo));
  }
  // a string course along the top of every tier
  float ye = clamp(q.y, yb + 0.5 * T, Hm);
  float m = mod(ye - yb + 0.5 * T, T) - 0.5 * T;
  d = min(d, max(ax - w - 0.5, q.y > Hm ? q.y - Hm : abs(m + 0.45) - 0.45));
  // piers: a pilaster with a batter, and a foot standing in whatever is down there
  float foot = 0.9;
  if (pil) {
    float e = 0.35 + 0.5 * w * clamp((Hm - q.y) / Hm, 0.0, 1.3);
    d = min(d, max(max(ax - w - e, cv - 0.62 * pw), q.y - Hm + 0.9));
    foot += 0.35 + 0.5 * w;
  }
  d = min(d, max(max(ax - w - foot, cv - pw - 0.8), q.y - 2.2));
  // the arcade of small arches on top
  float wt = w;
  if (nUp > 0.5) {
    float S2 = S / nUp, hT = uTr[8];
    float pw2 = max(0.8, 0.15 * S2), a2 = 0.5 * S2 - pw2;
    float v2 = mod(q.z, S2) - 0.5 * S2;
    wt = 0.82 * w;
    float hs2 = hT - 1.3 - a2;
    float h2 = archSD(vec2(v2, q.y - Hm - hs2), a2 * smoothstep(1.0, 2.6, 2.0 * a2 * px1), 1.0, hs2);
    d = min(d, max(max(ax - wt, abs(q.y - Hm - 0.5 * hT) - 0.5 * hT), -h2));
  }
  // cornice, deck and two parapets
  float Hc = vTop(), wd = wt + 0.8;
  d = min(d, sdBox2(vec2(q.x, q.y - Hc - 0.45), vec2(wd, 0.45)));
  d = min(d, sdBox2(vec2(ax - wd + 0.4, q.y - Hc - 1.65), vec2(0.4, 0.75)));
  if (lamps && !nave) {                            // a lamp standard over every pier, on both parapets
    float lod = smoothstep(0.8, 2.2, S * px1);
    vec3 l = vec3(ax - wd + 0.4, q.y - Hc - 2.4, cv);
    float lh = 3.4 * lod;
    d = min(d, sdBox(l - vec3(0.0, lh * 0.5, 0.0), vec3(0.13, lh * 0.5, 0.13) + 0.3 * uPix * dc));
    d = min(d, length(l - vec3(0.0, lh + 0.3, 0.0)) - max(0.5, 0.85 * uPix * dc) * lod);
  }
  if (nave) {                                      // one deck over both rows, and a rib across at every pier
    d = min(d, max(q.x, abs(q.y - Hm + 0.7) - 0.7));
    float ar = uTr[9] - w - 0.25, hr = Hm - 2.3 - ar;
    d = min(d, max(max(max(cv - 0.5 * pw, q.x), q.y - Hm), -archSD(vec2(p.x, q.y - hr), ar, 1.0, 1e4)));
    if (lamps) {                                   // its lamps stand inside, on the feet of the piers
      vec3 l = vec3(q.x + w + foot - 0.55, q.y - 2.2, cv);
      d = min(d, sdBox(l - vec3(0.0, 1.6, 0.0), vec3(0.13, 1.6, 0.13)));
      d = min(d, length(l - vec3(0.0, 3.6, 0.0)) - 0.5);
    }
  }
  // exceptions. A fallen span only takes stone away, and only inside its own bay.
  float bay = floor(q.z / S);
  bool odd = uTr[12] > 0.5 && vOdd(bay, sid);
  if ((odd && uTr[12] < 1.5) || (uTr[14] > 0.001 && vDown(bay, sid))) {
    float ya = yb + hs + 0.5 * k * a0, Ha = Hc + 2.4;
    float cut = max(abs(v) - 0.62 * a0, ya - q.y);
    cut = min(cut, max(abs(v) - 0.86 * a0, mix(ya, Ha, 0.42) - q.y));
    cut = min(cut, max(abs(v) - a0 - 0.3 * pw, mix(ya, Ha, 0.78) - q.y));
    d = max(d, -cut);
  }
  if (uTr[14] > 0.001) {                           // a pier with both its spans down may be broken off short
    float pier = floor(q.z / S + 0.5);
    if (vDown(pier - 1.0, sid) && vDown(pier, sid)) {
      float rr = cell1(ivec2(int(pier), 23 + int(sid)));
      if (rr < 0.75) d = max(d, (q.y - mix(0.12, 0.8, rr / 0.75) * Hm - 0.22 * (q.z - pier * S)) * 0.97);
    }
  }
  if (odd && uTr[12] > 2.5)                        // the blind arch: walled up to the crown
    d = min(d, max(max(ax - 0.55 * w, abs(v) - a0 - 0.1), q.y - yb - T + 0.9));
  if (uTr[12] > 0.5 && uTr[12] < 1.5 && (uTr[10] < 0.5 || uTr[10] > 1.5 || sid * uTr[13] > 0.0)) {
    // the span lies where it fell: one length of wall, tilted, half under
    vec3 b = vec3(q.x, q.y - max(fy, uSea.x > 0.5 ? -4.0 : fy) - 0.2 * a0, q.z - (abs(uTr[13]) + 0.5) * S);
    float bb = sdBox(b, vec3(w, 0.2 * a0 + 2.6, 0.72 * a0 + 1.5));
    if (bb > 1.0) d = min(d, bb);
    else { b.yz = rot(0.21) * b.yz; d = min(d, sdBox(b, vec3(0.95 * w, 2.1, 0.68 * a0))); }
  }
  // far off, the whole line goes down into the horizon
  d = max(d, (q.y - mix(Hc + 12.0, min(fy, uSea.y) - 1.0, smoothstep(0.55 * FAR, 0.97 * FAR, dc))) * 0.97);

  float fl = p.y - fy;
  gD = min(d, fl);
  // Along a ray, some distances are known exactly: to the floor when the ray goes down,
  // and to the slab of air the viaduct stands in when the ray is outside it.
  if (dot(gRd, gRd) > 0.5) {
    if (gRd.y > 1e-4) fl = 1e5; else if (gRd.y < -1e-4) fl = fl / -gRd.y;
    float o = ax - max(w + foot, wd) - 0.15;
    if (o > 0.0 && (q.x > 0.0 || !nave)) {
      float mv = gRd.x * sgn * sign(q.x);          // > 0: going away from the viaduct's plane
      float along = mv < -1e-4 ? o / -mv : 1e5;
      if (mv > 1e-4 && q.x < 0.0 && uTr[10] > 0.5) along = abs(p.x) / mv + 0.05;   // as far as the other one's half of the world
      d = max(d, along);
    }
  }
  return min(d, fl);
}

Surf surf(vec3 p, vec3 n, float t) {
  float sgn, sid, cdx;
  vec3 q = vFrame(p, sgn, sid, cdx);
  float S = uTr[0], Hm = uTr[1], T = uTr[2], pw = uTr[4], w = uTr[5], k = uTr[6], hs = uTr[7], fy = uTr[11];
  float N = mod(uTr[3], 10.0), nUp = floor(uTr[3] * 0.1 + 0.01);
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.3), mix(uInk[SHADE], uInk[DEEP], 0.4), 0.0, 1.0);
  if (p.y - fy < 0.05 + 0.004 * t && n.y > 0.8) {  // the ground: level and plain
    s.lit = uInk[LIT]; s.shade = uInk[SHADE]; s.line = 0.0;
    return s;
  }
  float a0 = S * 0.5 - pw, yb = Hm - N * T, Hc = vTop();
  float v = mod(q.z, S) - S * 0.5, cv = S * 0.5 - abs(v), ax = abs(q.x);
  vec2 dl = p.xz - uCamP.xz;
  float dc2 = dot(dl, dl) + 1.0, dc = sqrt(dc2);
  float px1 = cdx / (dc2 * uPix);
  float wd = (nUp > 0.5 ? 0.82 * w : w) + 0.8;
  float pier = floor(q.z / S + 0.5);
  // lamps: come on one at a time
  if (vBit(1.0) > 0.5) {
    bool globe = false;
    if (uTr[10] > 1.5) {
      float foot = 0.9 + vBit(4.0) * (0.35 + 0.5 * w);
      globe = q.y < 6.6 && length(vec3(q.x + w + foot - 0.55, q.y - 5.8, cv)) < 0.62 + 0.003 * t;
    } else if (q.y > Hc + 2.45) {
      float lod = smoothstep(0.8, 2.2, S * px1);
      globe = length(vec3(ax - wd + 0.4, q.y - Hc - 2.7 - 3.4 * lod, cv)) < max(0.5, 0.85 * uPix * dc) * lod + 0.2 + 0.003 * t;
    }
    if (globe) {
      float on = max(vBit(2.0), step(cell1(ivec2(int(pier), 40 + int(sgn) + (q.x > 0.0 ? 3 : 0))), uEv.x * 1.02 - 0.01));
      s.lit = mix(s.lit, uInk[ACCENT], on); s.shade = mix(s.shade, uInk[ACCENT], on); s.glow = on;
      return s;
    }
  }
  if (q.y > Hc + 0.85 && n.y > 0.7 && ax < wd - 0.75) {   // the deck: two rails that go nowhere
    s.lit = mix(uInk[LIT], uInk[SHADE], 0.25);
    float rail = 1.0 - smoothstep(0.07, 0.12 + 1.5 * uPix * t, abs(ax - 0.75));
    rail *= 1.0 - smoothstep(0.1, 0.3, uPix * t / 0.75);
    s.lit = mix(s.lit, uInk[DEEP], rail * 0.7); s.shade = mix(s.shade, uInk[DEEP], rail * 0.7);
    return s;
  }
  // courses of stone on anything upright, fading before they are finer than the print
  float up = step(abs(n.y), 0.5);
  float pitch = 1.8;
  float course = smoothstep(0.42, 0.47, abs(fract(q.y / pitch) - 0.5)) * up * (1.0 - smoothstep(0.07, 0.2, uPix * t / pitch));
  // the ring of an arch: a paler band of stone round every opening in the main arcade
  float ti = clamp(floor((q.y - yb) / T), 0.0, N - 1.0), yl = q.y - yb - ti * T;
  float hole = archSD(vec2(v, yl - hs), a0, k, ti < 0.5 ? 1e4 : hs);
  float rw = 0.1 * a0 + 0.5;
  float ring = step(hole, rw) * step(hs - 0.2, yl) * step(q.y, Hm - 0.9) * (1.0 - smoothstep(0.1, 0.3, uPix * t / rw));
  s.lit = mix(s.lit, mix(uInk[LIT], uInk[PAPER], 0.55), ring * 0.8);
  s.lit = mix(s.lit, mix(uInk[LIT], uInk[SHADE], 0.5), course * (1.0 - ring) * 0.55);
  s.shade = mix(s.shade, uInk[DEEP], course * (1.0 - ring) * 0.25);
  float bay = floor(q.z / S);
  bool odd = uTr[12] > 0.5 && vOdd(bay, sid);
  if (odd && uTr[12] > 2.5 && ax < 0.55 * w + 0.06 && abs(v) < a0 && hole < 0.0) {     // the blind arch is brick, with a door nobody uses
    float brick = smoothstep(0.38, 0.46, abs(fract(q.y / 0.7) - 0.5)) * (1.0 - smoothstep(0.1, 0.3, uPix * t / 0.7));
    s.lit = mix(mix(uInk[LIT], uInk[SHADE], 0.35), uInk[SHADE], brick * 0.6);
    s.shade = mix(uInk[SHADE], uInk[DEEP], 0.55);
    float door = archSD(vec2(v, q.y - max(fy, 0.0) - 2.6), 1.1, 1.0, 1e4);
    if (door < 0.0) { s.lit = uInk[DEEP]; s.shade = uInk[DEEP]; }
  }
  // the painted pier
  if (uTr[12] > 1.5 && uTr[12] < 2.5 && vOdd(pier, sid) && cv < pw + 1.0 && q.y < yb + hs && q.y > 2.25) {
    s.lit = uInk[ACCENT]; s.shade = mix(uInk[ACCENT], uInk[DEEP], 0.45); s.glow = 0.1;
  }
  // stone is darker where water has stood
  if (fy > -20.0 && fy < -0.05) {
    float wet = smoothstep(0.12, -0.05, p.y);
    s.lit = mix(s.lit, mix(uInk[SHADE], uInk[LIT], 0.3), wet); s.shade = mix(s.shade, uInk[DEEP], wet * 0.5);
  }
  return s;
}
