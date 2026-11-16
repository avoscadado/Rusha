// ---------------------------------------------------------------------------
// Shared tail of every world program: sky, the march, plate shading, water,
// portals, drift. A form module above has defined map(), surf() and the
// constants FAR, STEPK and SHFAR.
// ---------------------------------------------------------------------------
out vec4 O;

// ---- sky: a bokashi gradient, flat clouds, flat moons ----
vec3 skyBase(vec3 rd) {
  float e = clamp(rd.y, 0.0, 1.0);
  float g = pow(1.0 - e, 3.4);
  vec3 c = mix(uInk[TOP], uInk[LOW], g);
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-4, 0.0));
  vec2 rxz = normalize(rd.xz + vec2(0.0, 1e-4));
  float toward = max(dot(rxz, sxz), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.55, uSunDir.y);            // strongest when the sun is low
  float wash = pow(toward, 3.0) * pow(1.0 - e, 5.0) * (0.35 + 0.65 * low);
  c = mix(c, uInk[GLOW], wash * 0.85);
  float halo = pow(max(dot(rd, uSunDir), 0.0), 24.0 / max(uSun.y, 0.05));
  c = mix(c, uInk[GLOW], halo * 0.6 * step(-0.08, uSunDir.y));
  if (rd.y < 0.0) c = mix(c, mix(uInk[LOW], uInk[SHADE], 0.45), clamp(-rd.y * 4.0, 0.0, 1.0));
  return c;
}
vec3 hazeInk(vec3 rd) { return skyBase(normalize(vec3(rd.x, 0.035, rd.z))); }

vec3 sky(vec3 rd, out float glow) {
  glow = 0.0;
  vec3 c = skyBase(rd);
  float e = rd.y;
  if (e < -0.02) return c;
  // stars: one per lattice cell at most, never smaller than a pixel
  if (uSky.z > 0.01) {
    vec2 u = rd.xz / (abs(e) + 0.35) * 26.0;
    ivec2 ci = ivec2(floor(u));
    vec4 r = cell4(ci);
    if (r.x > 1.0 - 0.07 * uSky.z) {
      float d = length(fract(u) - 0.5 - (r.yz - 0.5) * 0.7);
      float rad = max(0.035 + 0.05 * r.w, uPix * 30.0);
      c = mix(c, uInk[PAPER], smoothstep(rad, rad * 0.45, d) * smoothstep(0.0, 0.25, e) * (0.45 + 0.55 * r.w));
    }
  }
  // moons: flat discs with a hard terminator
  for (int i = uZero; i < 2; i++) {
    float r = uBody[i].w;
    if (r > 0.0) {
    vec3 dir = uBody[i].xyz;
    vec3 dl = rd - dir;
    float d = length(dl);
    float aa = uPix * 1.2;
    float disc = smoothstep(r + aa, r - aa, d);
    if (disc > 0.0) {
      vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
      float ph = uBodyK[i].x;
      float lit = abs(ph) < 0.01 ? 1.0 : smoothstep(-aa, aa, length(dl - side * r * ph * 1.3) - r);
      vec3 ink = mix(uInk[PAPER], uInk[ACCENT], uBodyK[i].z);
      c = mix(c, mix(mix(c, uInk[SHADE], 0.25), ink, lit), disc);
      glow = max(glow, disc * lit * 0.25);
    }
    if (uBodyK[i].y > 0.5) {                // a ring, seen nearly edge on
      vec3 up = normalize(vec3(0.35, 1.0, 0.2));
      vec3 sx = normalize(cross(dir, up)), sy = cross(sx, dir);
      vec2 q = vec2(dot(dl, sx), dot(dl, sy) * 3.6) / r;
      float ring = abs(length(q) - 1.75);
      float hide = disc * step(0.0, dot(dl, sy));
      c = mix(c, uInk[PAPER], smoothstep(0.16, 0.08, ring) * (1.0 - hide) * 0.8);
    }
    }
  }
  // the sun
  if (uSunDir.y > -0.05) {
    float d = length(rd - uSunDir), aa = uPix * 1.2;
    float disc = smoothstep(uSun.x + aa, uSun.x - aa, d);
    c = mix(c, mix(uInk[PAPER], uInk[GLOW], 0.25), disc);
    glow = max(glow, disc);
  }
  // far ridges: three flat planes of country, each a lighter ink than the last
  if (uSky.w > 0.001) {
    float az = atan(rd.x, rd.z);
    vec3 hz = hazeInk(rd);
    for (int i = uZero; i < 3; i++) {
      float fi = float(i);
      float h = uSky.w * (1.0 - 0.27 * fi) * (0.25 + 0.75 * vnoise1(az * (5.0 + 4.0 * fi) + 19.0 * fi + 3.0))
              + uSky.w * 0.12 * vnoise1(az * (23.0 + 9.0 * fi) + 7.0 * fi);
      float m = smoothstep(h + uPix, h - uPix, e);
      c = mix(c, mix(hz, uInk[SHADE], 0.16 + 0.17 * fi), m);
      glow *= 1.0 - m;
    }
  }
  // clouds: long flat bars with one lighter lip, as a block would print them
  if (uSky.x > 0.01 && e > 0.0) {
    float az = atan(rd.x, rd.z);
    vec2 u = vec2(az * 1.7 + uTime * 0.002, e * 13.0 * uSky.y);
    float n = 0.62 * vnoise(u) + 0.38 * vnoise(u * vec2(2.3, 1.9) + 17.0);
    float th = 0.86 - 0.42 * uSky.x;
    float band = smoothstep(0.03, 0.12, e) * (1.0 - smoothstep(0.3, 0.5, e));
    float w = 0.012 + 2.0 * uPix;
    float m = smoothstep(th, th + w, n) * band;
    float lip = 1.0 - smoothstep(th + 0.02, th + 0.075, n);
    vec2 sxz = normalize(uSunDir.xz + vec2(1e-4, 0.0));
    float toward = max(dot(normalize(rd.xz + vec2(0.0, 1e-4)), sxz), 0.0);
    vec3 body = mix(mix(c, uInk[PAPER], 0.5), uInk[GLOW], 0.45 * toward);
    vec3 edge = mix(mix(c, uInk[PAPER], 0.85), uInk[GLOW], 0.3 * toward);
    c = mix(c, mix(body, edge, lip), m);
    glow *= 1.0 - 0.8 * m;
  }
  return c;
}

float hazeStep(float t) {
  float h = 1.0 - exp(-t * uAir.x);
  float n = max(uAir.y, 1.0), x = h * n;
  return min((floor(x) + smoothstep(0.25, 0.75, fract(x))) / n, 1.0);
}

vec3 calcN(vec3 p, float h, out float cav) {
  vec3 n = vec3(0.0); float s = 0.0;
  gRd = vec3(0.0);
  for (int i = uZero; i < 4; i++) {
    vec3 e = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    float d = map(p + e * h);                              // map call site 2 of 3
    n += e * d; s += d;
  }
  cav = s / (4.0 * h);                                     // > 0 on ridges, < 0 in creases
  return normalize(n);
}

// ray against an upright disc; returns distance or -1
float discHit(vec3 ro, vec3 rd, vec4 c, vec4 n, out float rr) {
  rr = 0.0;
  float R = c.w * n.w;
  if (R <= 0.001) return -1.0;
  float dn = dot(rd, n.xyz);
  if (abs(dn) < 1e-5) return -1.0;
  float t = dot(c.xyz - ro, n.xyz) / dn;
  if (t <= 0.0) return -1.0;
  rr = length(ro + rd * t - c.xyz) / R;
  return rr < 1.0 ? t : -1.0;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc * 2.0 - uRes) / uRes.y;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + uCamF);
  vec3 ro = uCamP;
  vec3 rd0 = rd, ro0 = ro;
  float tMin = 0.05;
  if (uClipOn > 0.5) {                                     // a portal view starts at the entry plane
    float dn = dot(rd, uClip.xyz);
    float tc = (uClip.w - dot(ro, uClip.xyz)) / (abs(dn) < 1e-5 ? 1e-5 : dn);
    if (dn > 0.0) tMin = max(tMin, tc);
  }
  int nSteps = int(uQ.x), nShadow = int(uQ.z);
  vec3 acc = vec3(0.0);
  float wgt = 1.0, glowOut = 0.0, tFirst = FAR, travelled = 0.0, cost = 0.0, tHitP = -1.0;

  for (int b = uZero; b < 2; b++) {
    // what bounds this ray: the far plane, the sea, a portal
    float tMax = FAR; int stop = 0; float rr = 0.0; int pi = 0;
    if (uSea.x > 0.5 && rd.y < -1e-4) {
      float ts = (uSea.y - ro.y) / rd.y;
      if (ts > tMin && ts < tMax) { tMax = ts; stop = 1; }
    }
    for (int k = uZero; k < 2; k++) {
      float r1; float tp = discHit(ro, rd, uPortC[k], uPortN[k], r1);
      if (tp > tMin && tp < tMax) { tMax = tp; stop = 2; rr = r1; pi = k; }
    }
    // the march
    float t = tMin, pd = 1e9, edge = 0.0; bool hit = false, spent = true;
    gRd = rd;
    float jit = 0.6 + 0.4 * ign(fc + float(b) * 17.0);
    for (int i = uZero; i < 200; i++) {
      if (i >= nSteps) break;
      float d = map(ro + rd * t);                          // map call site 1 of 3
      cost += 1.0;
      if (d < 0.6 * uPix * t + 0.0008) { hit = true; spent = false; break; }
      if (gD > pd && pd < 1.2 * uPix * t) edge = max(edge, exp(-t * uAir.x * 7.0));   // grazed something near: an ink line
      pd = gD;
      t += d * STEPK * (i == 0 ? jit : 1.0);
      if (t > tMax) { spent = false; break; }
    }
    vec3 c; float g = 0.0; bool bounce = false;
    if (spent && t < tMax * 0.97) {
      c = hazeInk(rd);                                      // ran out of steps: never shade a guess
      if (b == 0) tFirst = t;
    } else if (hit && t < tMax) {
      vec3 p = ro + rd * t;
      float cav; vec3 n = calcN(p, max(0.9 * uPix * t, 0.003), cav);
      n -= max(0.0, dot(n, rd)) * rd; n = normalize(n);
      Surf s = surf(p, n, t);
      if (uEv.z > 0.001) {                                  // snow lies on whatever faces up
        float k = uEv.z * smoothstep(0.5, 0.78, n.y);
        s.lit = mix(s.lit, uInk[PAPER], k); s.shade = mix(s.shade, mix(uInk[PAPER], uInk[SHADE], 0.5), k); s.glow *= 1.0 - k;
      }
      float ndl = dot(n, uSunDir), sh = 0.0;
      if (ndl > 0.0 && uSunDir.y > -0.02) {
        sh = 1.0; float st = 0.02 + 0.004 * t, ph = 1e9; vec3 sp = p + n * (0.01 + 0.002 * t);
        gRd = uSunDir;
        for (int i = uZero; i < 48; i++) {
          if (i >= nShadow) break;
          float d = map(sp + uSunDir * st);                // map call site 3 of 3
          cost += 1.0;
          // real surfaces only (a cell wall casts no shadow); the closest approach is estimated
          // from this sample and the last, which keeps penumbras free of contour lines
          float y = gD * gD / (2.0 * ph), dd = sqrt(max(gD * gD - y * y, 0.0));
          sh = min(sh, uSun.w * dd / max(st - y, 1e-3));
          ph = gD;
          st += clamp(d, 0.02 + 0.01 * st, SHFAR * 0.12);
          if (sh < 0.02 || st > SHFAR) break;
        }
        sh = smoothstep(0.25, 0.6, sh);
      }
      float key = smoothstep(-0.02, 0.5, ndl) * sh;
      float nb = max(uSun.z, 1.0), x = key * nb;
      float tone = min((floor(x) + smoothstep(0.38, 0.62, fract(x))) / nb, 1.0);
      // the fill light can lift a surface by one band at most, and never casts a shadow
      tone = max(tone, uFill.w * smoothstep(0.15, 0.3, dot(n, uFill.xyz)) / nb);
      vec3 shade = mix(s.shade, mix(s.shade, uInk[TOP], 0.22), clamp(n.y, 0.0, 1.0));
      c = mix(shade, s.lit, tone);
      c = mix(c, uInk[DEEP], clamp(-cav * 1.4, 0.0, 0.55) * s.line);
      c = mix(c, uInk[PAPER], clamp(cav * 0.7, 0.0, 0.22) * s.line * tone);
      // light spilling out of the portals
      for (int k = uZero; k < 2; k++) {
        float R = uPortC[k].w * uPortN[k].w;
        if (R > 0.001) {
          vec3 lp = uPortC[k].xyz - p; float l2 = dot(lp, lp);
          float f = R * R / (l2 + R * R) * clamp(dot(n, lp) * inversesqrt(l2) * 0.75 + 0.25, 0.0, 1.0);
          c = mix(c, uPortInk[k], f * 0.55);
        }
      }
      g = s.glow;
      c = mix(c, uInk[DEEP], 0.7 * edge);
      if (b == 0) tHitP = t;
      // ground mist, then the stepped planes of haze
      float mist = (1.0 - exp(-t * uAir.w)) * smoothstep(uAir.z, uAir.z - 5.0, p.y);
      c = mix(c, mix(hazeInk(rd), uInk[PAPER], 0.45), mist);
      float hz = hazeStep(travelled + t);
      c = mix(c, hazeInk(rd), hz * 0.94);
      g *= 1.0 - hz;
      if (b == 0) tFirst = t;
    } else if (stop == 2) {
      // a portal: a clean hole, a hairline rim
      vec3 through = b == 0
        ? (pi == 0 ? texelFetch(uPortTex0, ivec2(fc), 0).rgb : texelFetch(uPortTex1, ivec2(fc), 0).rgb)
        : sqrt(uPortInk[pi]);
      through *= through;
      float lw = clamp(2.2 * uPix * tMax / (uPortC[pi].w * uPortN[pi].w), 0.004, 0.2);
      float rim = smoothstep(1.0 - lw, 1.0 - 0.5 * lw, rr);
      c = mix(through, uInk[PAPER], rim);
      g = rim * 0.5;
      c = mix(c, uInk[DEEP], 0.7 * edge);
      if (b == 0) tFirst = tMax;
    } else if (stop == 1) {
      vec3 pw = ro + rd * tMax;
      float far = hazeStep(travelled + tMax);
      if (b == 0) tFirst = tMax;
      if (uSea.x > 2.5) {                                   // a sea of mist: opaque, banded
        float wv = vnoise2(pw.xz * 0.012 + uTime * 0.01);
        c = mix(mix(hazeInk(rd), uInk[PAPER], 0.35 + 0.3 * step(0.5, wv)), hazeInk(rd), far * 0.9);
      } else {
        // water: a flat tone, reflections with a slow wobble, thin horizontal strokes of light
        float rp = uSea.z * (1.0 - 0.9 * far);
        vec2 rel = pw.xz - ro0.xz;
        float dist = length(rel), ld = log(dist + 2.0);
        float lat = atan(rel.x, rel.y);
        float w1 = vnoise(vec2(lat * 9.0 + uTime * 0.02, ld * 26.0 - uTime * 0.35));
        float w2 = vnoise(vec2(lat * 3.0, ld * 9.0 + uTime * 0.12));
        vec3 nw = normalize(vec3((w2 - 0.5) * 0.05 * rp, 1.0, (w1 - 0.5) * 0.035 * rp));
        float f0 = uSea.x > 1.5 ? 0.86 : 0.42;
        float fr = f0 + (1.0 - f0) * pow(1.0 - clamp(dot(-rd, nw), 0.0, 1.0), 4.0);
        float fine = 1.0 - smoothstep(0.12, 0.3, 26.0 * uPix / max(-rd.y, 0.004));   // strokes fade before they alias
        float stroke = smoothstep(0.71, 0.74, w1) * smoothstep(0.35, 0.5, w2) * rp * fine;
        vec3 body = mix(mix(uInk[SHADE], uInk[TOP], 0.5), hazeInk(rd), far * 0.94);
        body = mix(body, mix(uInk[PAPER], uInk[GLOW], 0.4), stroke * 0.5 * (1.0 - far));
        if (b == 0 && uQ.y > 0.5) {
          float nearK = 0.4 * (1.0 - smoothstep(4.0, 70.0, dist));              // the foreground is printed a tone deeper
          fr *= 1.0 - nearK;
          acc += wgt * (1.0 - fr) * body;
          wgt *= fr * (1.0 - 0.75 * stroke);
          ro = pw + vec3(0.0, 0.01, 0.0);
          rd = reflect(rd, nw); rd.y = max(rd.y, 0.015); rd = normalize(rd);
          travelled = tMax; tMin = 0.05;
          nSteps = int(uQ.y);
          bounce = true;
        } else {
          float gs; c = mix(body, sky(reflect(rd, nw), gs), fr);
        }
      }
    } else {
      c = sky(rd, g);
    }
    if (!bounce) { acc += wgt * c; glowOut += wgt * g; break; }
  }

  // shafts of light, where the form has any: two flat tones laid over the plate
  {
    float sf = shafts(ro0, rd0, min(tFirst, FAR), ign(fc + 7.0));
    if (sf > 0.0) {
      float q = (floor(sf * 3.0) + smoothstep(0.3, 0.7, fract(sf * 3.0))) / 3.0;
      acc = mix(acc, mix(uInk[GLOW], uInk[PAPER], 0.3), min(q, 1.0) * 0.42);
    }
  }

  // drift: snow, motes, petals or rain in three shells, nearer than whatever was hit
  if (uPart.x > 0.5) {
    for (int k = uZero; k < 3; k++) {
      float dk = 5.0 + 9.0 * float(k) * float(k);
      if (dk < tFirst) {
      vec3 p = ro0 + rd0 * dk;
      float cs = 1.6 + 1.3 * float(k);
      float rain = step(3.5, uPart.x);
      p.y += uTime * uPart.z * (1.0 + 0.3 * float(k));
      p.x += uTime * uPart.z * 0.35 + 0.6 * sin(p.y * 0.4 + float(k));
      vec3 q = p / cs; q.y *= mix(1.0, 0.18, rain);
      ivec3 ci = ivec3(floor(q));
      vec4 r = cell4(ci.xy + ci.z * ivec2(37, 17) + k * 91);
      vec3 f = fract(q) - 0.5 - (r.xyz - 0.5) * 0.6;
      f.y /= mix(1.0, 0.18, rain);
      float size = (0.035 + 0.05 * r.x) * uPart.w * mix(1.0, 0.45, rain) / cs * (1.0 + 20.0 * uPix * dk);
      float m = smoothstep(size, size * 0.6, length(f.xy * vec2(1.0, mix(1.0, 0.1, rain)))) * step(r.w, uPart.y);
      vec3 ink = uPart.x < 2.5 ? uInk[PAPER] : (uPart.x < 3.5 ? mix(uInk[ACCENT], uInk[PAPER], 0.35) : mix(uInk[PAPER], uInk[LOW], 0.5));
      acc = mix(acc, ink, m * (uPart.x > 1.5 && uPart.x < 2.5 ? 0.6 : 0.9) * mix(1.0, 0.5, rain));
      }
    }
  }

  if (uQ.w > 0.5) { acc = vec3(cost / 200.0, cost > 160.0 ? 1.0 : 0.0, 0.0); glowOut = 0.0; }
  acc = clamp(acc, 0.0, 1.0);
  vec3 enc = sqrt(acc) + (ign(fc) - 0.5) / 255.0;
  O = vec4(enc, clamp(glowOut, 0.0, 1.0));
}
