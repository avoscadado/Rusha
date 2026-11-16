// ---------------------------------------------------------------------------
// CANAL: a straight water street between two rows of houses. The flight keeps
// to the middle of the water and passes under the footbridges.
//   uTr[0] half width of the water   uTr[1] width of a house   uTr[2] lowest roof   uTr[3] how much higher roofs may go
//   uTr[4] depth of the quay   uTr[5] distance between bridges (0 none)   uTr[6] height of a bridge at its crown
//   uTr[7] window spacing   uTr[8] height of a storey   uTr[9] share of windows always lit
//   uTr[10] cell of the odd house   uTr[11] its side   uTr[12] odd: 0 none, 1 painted, 2 missing, 3 tall
//   uTr[13] mooring poles   uTr[14] how far fronts step back   uTr[15] share of houses that are gone
// ---------------------------------------------------------------------------
#define FAR 800.0
#define STEPK 0.9
#define SHFAR 140.0

float shafts(vec3 ro, vec3 rd, float t, float jit) { return 0.0; }

vec4 house(float cz, float side) { return cell4(ivec2(int(cz) * 3 + (side > 0.0 ? 1 : 0), 97)); }
bool oddHouse(float cz, float side) { return uTr[12] > 0.5 && abs(cz - uTr[10]) < 0.5 && side * uTr[11] > 0.0; }
float houseH(float cz, float side, vec4 r) {
  float h = uTr[2] + uTr[3] * r.x;
  bool odd = oddHouse(cz, side);
  if (odd && uTr[12] > 2.5) h = (uTr[2] + uTr[3]) * 1.8;
  if ((odd && uTr[12] > 1.5 && uTr[12] < 2.5) || (!odd && r.z < uTr[15])) return 0.0;
  return floor(h / uTr[8]) * uTr[8] + 1.1;
}
float houseD(vec3 p, float cz, float side, float ax) {
  vec4 r = house(cz, side);
  float h = houseH(cz, side, r);
  if (h <= 0.0) return 1e5;
  float B = uTr[1];
  vec3 q3 = vec3(uTr[0] + uTr[4] + uTr[14] * r.y - ax, p.y - h, abs(p.z - (cz + 0.5) * B) - B * 0.5);
  return length(max(q3, 0.0)) + min(max(q3.x, max(q3.y, q3.z)), 0.0);
}
float bridgeD(vec3 p) {
  float Wc = uTr[0], hs = uTr[6];
  float zb = mod(p.z + uTr[5] * 0.5, uTr[5]) - uTr[5] * 0.5;
  float R = (Wc * Wc + (hs - 1.0) * (hs - 1.0)) / (2.0 * (hs - 1.0));
  float ring = abs(length(vec2(p.x, p.y - hs + R)) - R - 0.4) - 0.4;
  return max(max(ring, abs(zb) - 1.7), max(abs(p.x) - Wc - 0.6, 0.8 - p.y));
}

float map(vec3 p) {
  float Wc = uTr[0], B = uTr[1], Q = uTr[4];
  float ax = abs(p.x), side = p.x < 0.0 ? -1.0 : 1.0;
  float d = p.y + 3.0;                                       // the bed of the canal
  vec2 q2 = vec2(Wc - ax, p.y - 1.0);                        // the quays
  d = min(d, length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0));
  float roofs = (uTr[2] + uTr[3]) * 1.8 + 2.0;                // nothing stands higher than this
  if (p.y > roofs + 1.0) { gD = 1e3; return p.y - roofs; }    // a safe step; no surface is near, so no shadow or ink line
  float cz = floor(p.z / B), qz = p.z - (cz + 0.5) * B;
  // this house and its nearer neighbour: a side wall stands on the line between two cells,
  // and has to be there from both sides
  d = min(d, houseD(p, cz, side, ax));
  d = min(d, houseD(p, cz + (qz > 0.0 ? 1.0 : -1.0), side, ax));
  if (uTr[5] > 1.0) d = min(d, bridgeD(p));
  if (uTr[13] > 0.5) {                                       // mooring poles, which sink out of sight far away
    float away = length(p.xz - uCamP.xz);
    float zp = mod(p.z, 9.0) - 4.5;
    float top = 2.7 * (1.0 - smoothstep(70.0, 120.0, away));
    d = min(d, max(length(vec2(ax - Wc + 1.3, zp)) - 0.16 - min(0.7 * uPix * away, 0.2), p.y - top));
  }
  d = min(d, setPiece(p));
  gD = d;
  return min(d, cellExitZ(qz, B));
}

Surf surf(vec3 p, vec3 n, float t) {
  if (setPiece(p) < 0.02 + 0.002 * t) return setSurf(p);
  float Wc = uTr[0], B = uTr[1], Q = uTr[4], st = uTr[8];
  float ax = abs(p.x), side = p.x < 0.0 ? -1.0 : 1.0;
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.3), mix(uInk[SHADE], uInk[DEEP], 0.3), 0.0, 1.0);
  float wet = uSea.x > 0.5 ? smoothstep(uSea.y + 0.7, uSea.y + 0.35, p.y) : 0.0;
  if (p.y < -2.9) { s.lit = mix(uInk[LIT], uInk[SHADE], 0.45); s.shade = uInk[SHADE]; s.line = 0.0; return s; }
  if (uTr[5] > 1.0 && bridgeD(p) < 0.03 + 0.002 * t) {       // a bridge: pale stone
    s.lit = mix(uInk[LIT], uInk[PAPER], 0.6);
    return s;
  }
  if (ax < Wc - 0.5) {                                        // a mooring pole, with a painted head
    s.lit = mix(uInk[SHADE], uInk[LIT], 0.3); s.shade = uInk[DEEP];
    if (p.y > 2.1) { s.lit = uInk[PAPER]; s.shade = mix(uInk[PAPER], uInk[SHADE], 0.5); }
    return s;
  }
  // which house this point belongs to: step a little into the wall before asking
  float zin = p.z - n.z * 0.06;
  float cz = floor(zin / B), qz = p.z - (cz + 0.5) * B;
  vec4 r = house(cz, side);
  float h = houseH(cz, side, r);
  bool front = abs(n.x) > 0.7 && ax > Wc + Q - 0.05 && p.y > 1.02;
  if (!front && (p.y < 1.06 || ax < Wc + Q - 0.05)) {         // the quay and its wall
    s.lit = mix(s.lit, mix(uInk[SHADE], uInk[LIT], 0.4), wet); s.shade = mix(s.shade, uInk[DEEP], wet * 0.6);
    float flag = smoothstep(0.46, 0.49, abs(fract(p.z / 2.2) - 0.5)) * step(0.5, n.y) * exp(-t * 0.02);
    s.lit = mix(s.lit, uInk[SHADE], flag * 0.35);
    return s;
  }
  // a house: each takes one of four tints of the same inks
  float tint = r.w;
  vec3 wall = tint < 0.25 ? mix(uInk[LIT], uInk[PAPER], 0.55) : tint < 0.5 ? mix(uInk[LIT], uInk[GLOW], 0.45) : tint < 0.75 ? uInk[LIT] : mix(uInk[LIT], uInk[SHADE], 0.3);
  s.lit = wall; s.shade = mix(mix(uInk[SHADE], wall, 0.22), uInk[DEEP], 0.12);
  bool odd = oddHouse(cz, side);
  if (odd && uTr[12] < 1.5) { s.lit = uInk[ACCENT]; s.shade = mix(uInk[ACCENT], uInk[DEEP], 0.45); s.glow = 0.06; }
  if (p.y > h - 0.02) { s.lit = mix(uInk[SHADE], uInk[LIT], 0.4); s.shade = mix(uInk[SHADE], uInk[DEEP], 0.5); return s; }   // the roof
  if (front) {
    float fade = exp(-t * 0.0035);
    // a pale band under the roof and a darker one at the water door
    s.lit = mix(s.lit, uInk[PAPER], 0.6 * step(h - 0.55, p.y));
    float lo = 1.0 - step(1.0 + st * 0.9, p.y);
    s.lit = mix(s.lit, mix(s.lit, uInk[SHADE], 0.3), lo); 
    // windows
    float W = uTr[7];
    float nw = max(floor((B - 1.6) / W), 1.0);
    float u = (qz + nw * W * 0.5) / W;
    float col = floor(u), row = floor((p.y - 1.0) / st);
    vec2 f = vec2(fract(u), fract((p.y - 1.0) / st));
    float inx = step(abs(f.x - 0.5), 0.26), iny = step(0.26, f.y) * step(f.y, lo > 0.5 ? 0.72 : 0.78);
    float win = inx * iny * step(0.0, u) * step(u, nw) * step(p.y, h - st * 0.55);
    if (win > 0.5) {
      float rnd = cell1(ivec2(int(cz) * 13 + int(col) * 3 + (side > 0.0 ? 1 : 0), int(row) * 7 + 31));
      float on = step(rnd, uTr[9] + (1.0 - uTr[9]) * uEv.x * step(0.5, uEv.y) - 0.002);
      vec3 dark = mix(uInk[DEEP], uInk[SHADE], 0.35);
      s.lit = mix(s.lit, mix(dark, uInk[ACCENT], on), fade);
      s.shade = mix(s.shade, mix(uInk[DEEP], uInk[ACCENT], on), fade);
      s.glow = on * fade * 0.9;
      s.line = 0.0;
    }
  }
  return s;
}
