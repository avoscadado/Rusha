// ---------------------------------------------------------------------------
// CISTERN: a hall of columns standing in water, lit through holes in the roof.
// The flight goes straight down one aisle. Every bay is the same, so plain
// domain repetition is exact here.
//   uTr[0] bay size      uTr[1] roof height     uTr[2] springing height of the arches
//   uTr[3] column radius uTr[4] 0 round, 1 square
//   uTr[5] arcades: 0 none, 1 along the aisle, 2 both ways
//   uTr[6] radius of the roof holes (0 none)   uTr[7] a hole every n bays
//   uTr[8] bay of the odd column   uTr[9] odd: 0 none, 1 painted, 2 absent, 3 broken   uTr[10] its side, -1 or 1
//   uTr[11] half thickness of the arcade walls   uTr[12] lamps on the columns   uTr[13] 1 = the roof is gone
// ---------------------------------------------------------------------------
#define FAR 420.0
#define STEPK 0.95
#define SHFAR 70.0

float archHole(vec2 q, float a, float h0) {       // q: across the span, height
  return min(sdBox2(q - vec2(0.0, h0 * 0.5 - 2.0), vec2(a, h0 * 0.5 + 2.0)), length(q - vec2(0.0, h0)) - a);
}

// is this point in the light that falls through a roof hole?
float inBeam(vec3 p) {
  float S = uTr[0];
  vec3 q = p + uSunDir * ((uTr[1] - p.y) / max(uSunDir.y, 0.05));
  float u = mod(q.x + S * 0.5, S) - S * 0.5;
  float n = max(uTr[7], 1.0);
  float vz = mod(q.z + S * 0.5, S * n) - S * n * 0.5;
  return step(max(abs(u), abs(vz)), uTr[6]);
}
float shafts(vec3 ro, vec3 rd, float t, float jit) {
  if (uTr[6] < 0.01 || uTr[13] > 0.5 || uSunDir.y < 0.05) return 0.0;
  float far = min(t, 5.0 * uTr[0]), s = 0.0;
  for (int i = uZero; i < 14; i++) {
    float f = (float(i) + 0.5) / 14.0;
    vec3 p = ro + rd * far * f;
    s += inBeam(p) * step(p.y, uTr[1]) * exp(-far * f * uAir.x * 1.5);
  }
  return s / 14.0 * (far / (4.0 * uTr[0])) * 1.5;
}

float map(vec3 p) {
  float S = uTr[0], H = uTr[1], h0 = uTr[2], r = uTr[3], w = uTr[11];
  float u = mod(p.x + S * 0.5, S) - S * 0.5;       // 0 on the centre of an aisle
  float v = mod(p.z, S) - S * 0.5;                 // 0 at the middle of a bay
  float cu = S * 0.5 - abs(u), cv = S * 0.5 - abs(v);
  float a = S * 0.5 - r;
  // which column is nearest, to find the odd one
  float cz = floor(p.z / S + 0.5), side = sign(p.x);
  bool odd = uTr[9] > 0.5 && abs(cz - uTr[8]) < 0.5 && abs(p.x) < S && side * uTr[10] > 0.0;
  // without a roof you can see a long way: far columns go down into the water before they blur
  float lod = uTr[13] > 0.5 ? 1.0 - smoothstep(9.0 * S, 13.0 * S, length(p.xz - uCamP.xz)) : 1.0;
  H *= lod; h0 *= lod;
  float top = uTr[5] > 0.5 ? h0 + 0.3 : H;
  float col = uTr[4] < 0.5 ? length(vec2(cu, cv)) - r : max(cu, cv) - r * 0.9;
  col = max(col, p.y - top);
  // a plinth at the foot and a block at the head
  col = min(col, max(max(cu, cv) - r * 1.35, abs(p.y - 0.25) - 0.45));
  col = min(col, max(max(cu, cv) - r * 1.3, abs(p.y - top + 0.25) - 0.3));
  if (odd) {
    if (uTr[9] > 1.5 && uTr[9] < 2.5) col = 1e5;
    else if (uTr[9] > 2.5) col = max(col, p.y - 1.6 - 0.5 * cu);
  }
  float d = col;
  if (uTr[5] > 0.5) {
    d = min(d, max(max(cu - w, -archHole(vec2(v, p.y), a, h0)), p.y - H));
    if (uTr[5] > 1.5) d = min(d, max(max(cv - w, -archHole(vec2(u, p.y), a, h0)), p.y - H));
  }
  if (uTr[13] < 0.5) {                             // the roof, with its holes over the aisle crossings
    float roof = max(H - p.y, p.y - H - 0.7);
    if (uTr[6] > 0.01) {
      float n = max(uTr[7], 1.0);
      float vz = mod(p.z + S * 0.5, S * n) - S * n * 0.5;   // centred on every nth column line
      roof = max(roof, uTr[6] - max(abs(u), abs(vz)));
    }
    d = min(d, roof);
  }
  d = min(d, p.y + 0.6);                           // the floor under the water
  d = min(d, setPiece(p));
  gD = d;
  return d;
}

Surf surf(vec3 p, vec3 n, float t) {
  if (setPiece(p) < 0.02 + 0.002 * t) return setSurf(p);
  float S = uTr[0], H = uTr[1];
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.35), mix(uInk[SHADE], uInk[DEEP], 0.4), 0.0, 1.0);
  if (p.y < -0.5) {                                // the floor: square flags
    s.lit = uInk[LIT]; s.shade = uInk[SHADE];
    vec2 f = abs(fract(p.xz / (S * 0.25)) - 0.5);
    float line = smoothstep(0.47, 0.49, max(f.x, f.y)) * exp(-t * 0.02);
    s.shade = mix(s.shade, uInk[DEEP], line * 0.5); s.lit = mix(s.lit, uInk[SHADE], line * 0.5);
    s.line = 0.0;
    return s;
  }
  if (p.y > H - 0.02 && n.y < -0.5) { s.lit = mix(uInk[LIT], uInk[SHADE], 0.5); return s; }
  // courses of stone on anything upright
  float course = smoothstep(0.44, 0.48, abs(fract(p.y / 0.9) - 0.5)) * step(abs(n.y), 0.5) * exp(-t * 0.03);
  s.lit = mix(s.lit, mix(uInk[LIT], uInk[SHADE], 0.45), course * 0.6);
  // the tide mark: stone is darker where the water has been
  float wet = uSea.x > 0.5 ? smoothstep(uSea.y + 0.9, uSea.y + 0.5, p.y) : 0.0;
  s.lit = mix(s.lit, mix(uInk[SHADE], uInk[LIT], 0.35), wet); s.shade = mix(s.shade, uInk[DEEP], wet * 0.5);
  float cz = floor(p.z / S + 0.5);
  bool odd = uTr[9] > 0.5 && uTr[9] < 1.5 && abs(cz - uTr[8]) < 0.5 && abs(p.x) < S && sign(p.x) * uTr[10] > 0.0;
  float u = mod(p.x + S * 0.5, S) - S * 0.5, v = mod(p.z, S) - S * 0.5;
  bool onCol = length(vec2(S * 0.5 - abs(u), S * 0.5 - abs(v))) < uTr[3] * 1.5;
  if (odd && onCol && p.y < uTr[2] + 0.4) { s.lit = uInk[ACCENT]; s.shade = mix(uInk[ACCENT], uInk[DEEP], 0.4); s.glow = 0.12; }
  // lamps: a small light on each column, coming on in turn
  vec3 lc = vec3(sign(u) * (S * 0.5 - uTr[3]), 2.7, sign(v) * S * 0.5);
  if (uTr[12] > 0.5 && length(vec3(u, p.y, v) - lc) < 0.42) {
    float on = step(cell1(ivec2(int(cz), int(sign(p.x)) + 5)), uEv.x * 1.02 - 0.01);
    s.lit = mix(s.lit, uInk[ACCENT], on); s.shade = mix(s.shade, uInk[ACCENT], on); s.glow = on;
  }
  return s;
}
