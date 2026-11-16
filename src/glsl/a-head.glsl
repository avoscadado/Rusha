// ---------------------------------------------------------------------------
// Shared head of every world program: uniforms, noise, distance helpers, the
// flight line, and the set pieces. A form module follows it, then z-main.
//
// Rules for everything in a world program (the build lints for these):
//   - no texture(), dFdx, dFdy or fwidth: only texelFetch
//   - no fract(sin(..)) hashes: lattice randoms come from the noise texture
//   - map() is called from exactly three places, all in z-main
// ---------------------------------------------------------------------------
uniform sampler2D uNoise;        // 256 x 256 RGBA8 random lattice
uniform sampler2D uPortTex0;     // the view through portal 0, same pixel grid as this pass
uniform sampler2D uPortTex1;
uniform vec2 uRes;               // size of this pass in pixels
uniform vec3 uCamP, uCamR, uCamU, uCamF;   // eye, right, up, forward * focal
uniform float uPix;              // angular size of one pixel
uniform float uTime;             // world clock, seconds
uniform int uZero;               // always 0: stops compilers unrolling and inlining
uniform vec3 uInk[8];            // top, low, glow, lit, shade, deep, paper, accent
uniform vec3 uSunDir;
uniform vec4 uSun;               // disc radius, glow width, bands of light, shadow softness
uniform vec4 uAir;               // haze density, haze planes, ground mist top, ground mist density
uniform vec4 uSea;               // mode (0 none, 1 water, 2 mirror, 3 mist), level, ripple, unused
uniform vec4 uPathA;             // x amplitude, x frequency, x phase, y amplitude
uniform vec4 uPathB;             // y frequency, y phase, y base, unused
uniform float uTr[16];           // traits of the form
uniform vec4 uSet;               // set piece: position, scale
uniform vec4 uSetK;              // set piece: type, yaw, motion 0..1, lit 0..1
uniform vec4 uEv;                // event: progress 0..1, type, two spare
uniform vec4 uSky;               // cloud cover, cloud height, stars, far ridge height
uniform vec4 uBody[2];           // moons: direction, angular radius (0 = none)
uniform vec4 uBodyK[2];          // moons: phase, ring, ink mix, unused
uniform vec4 uPart;              // drift: type (0 none, 1 snow, 2 motes, 3 petals, 4 rain), density, speed, birds
uniform vec4 uClip;              // portal views only: entry plane normal and offset
uniform float uClipOn;
uniform vec4 uPortC[2];          // portals: centre, radius (0 = none)
uniform vec4 uPortN[2];          // portals: normal, open 0..1
uniform vec3 uPortInk[2];        // portals: the light that comes through
uniform vec4 uQ;                 // march steps, reflection steps, shadow steps, debug view

#define TOP 0
#define LOW 1
#define GLOW 2
#define LIT 3
#define SHADE 4
#define DEEP 5
#define PAPER 6
#define ACCENT 7

// the distance to real surfaces at the last map() call, without cell-exit steps: ink lines use it
float gD;
// direction of the ray being marched: lets repeated forms step exactly to the next cell
vec3 gRd;
// distance along gRd to the wall of a cell of size S, from a point q measured from the cell's centre
float cellExit(vec2 q, float S) {
  vec2 inv = 1.0 / max(abs(gRd.xz), vec2(1e-4));
  vec2 tw = (S * 0.5 - q * sign(gRd.xz)) * inv;
  return min(tw.x, tw.y) + 0.02 * S;
}

struct Surf { vec3 lit; vec3 shade; float glow; float line; };

// ---- lattice randoms and value noise ----
vec4 cell4(ivec2 c) { return texelFetch(uNoise, c & 255, 0); }
float cell1(ivec2 c) { return texelFetch(uNoise, c & 255, 0).r; }
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = cell1(c), b = cell1(c + ivec2(1, 0)), d = cell1(c + ivec2(0, 1)), e = cell1(c + ivec2(1, 1));
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  int c = int(i);
  return mix(cell1(ivec2(c, 71)), cell1(ivec2(c + 1, 71)), f);
}
// two rotated octaves, enough to shape a silhouette
float vnoise2(vec2 x) {
  return 0.65 * vnoise(x) + 0.35 * vnoise(mat2(1.6, 1.2, -1.2, 1.6) * x + 31.7);
}
// interleaved gradient noise from pixel coordinates: dither, never geometry
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// ---- distance helpers ----
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdBox2(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdCyl(vec3 p, float r, float h) { vec2 d = vec2(length(p.xz) - r, abs(p.y) - h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xy) - R, p.z)) - r; }
float sdSeg(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r; }
// a stepped line: quantises x into treads of height s, with a short riser
float stairs(float x, float s) { float k = x / s; return s * (floor(k) + smoothstep(0.0, 0.08, fract(k))); }

// ---- the flight line ----
vec2 pathXY(float z) {
  return vec2(uPathA.x * sin(z * uPathA.y + uPathA.z),
              uPathB.z + uPathA.w * sin(z * uPathB.x + uPathB.y));
}

// ---- set pieces: one colossal thing per world ----
// Types: 1 door, 2 sphere, 3 ring, 4 tower, 5 stair, 6 arch, 7 slab, 8 tree.
// q is in the set piece's own frame, in units of its scale.
float setRaw(vec3 q, float kind, float motion) {
  float d = 1e5;
  if (kind < 1.5) {                       // a door standing open
    float frame = max(sdBox(q - vec3(0.0, 2.0, 0.0), vec3(1.25, 2.0, 0.16)), -sdBox(q - vec3(0.0, 1.8, 0.0), vec3(0.8, 1.8, 0.5)));
    vec3 l = q - vec3(-0.8, 1.8, 0.0);
    l.xz = rot(-1.9 * motion) * l.xz;     // the leaf swings on its hinge
    d = min(frame, sdBox(l - vec3(0.8, 0.0, 0.0), vec3(0.78, 1.78, 0.045)));
  } else if (kind < 2.5) {                // a sphere, which may rise
    d = length(q - vec3(0.0, 1.0 + 2.4 * motion, 0.0)) - 1.0;
  } else if (kind < 3.5) {                // a ring to pass through
    vec3 r = q - vec3(0.0, 1.55, 0.0);
    d = sdTorus(r, 1.5, 0.11);
  } else if (kind < 4.5) {                // a tower with one lit room
    float taper = 0.42 - 0.035 * q.y;
    d = max(sdBox2(q.xz, vec2(taper)), abs(q.y - 3.0) - 3.0);
    d = min(d, sdBox(q - vec3(0.0, 6.15, 0.0), vec3(0.34, 0.15, 0.34)));
    d = max(d, -sdBox(q - vec3(0.0, 5.3, 0.0), vec3(0.08, 0.14, 1.0)));
  } else if (kind < 5.5) {                // a stair that stops
    float tread = q.y - stairs(q.z + 3.0, 0.25) * 0.72;
    d = max(max(tread * 0.7, abs(q.x) - 0.6), max(abs(q.z) - 3.0, -q.y - 0.2));
    d = max(d, -(q.y - (q.z + 3.0) * 0.72 + 0.55) * 0.7);
  } else if (kind < 6.5) {                // an arch
    vec3 a = q - vec3(0.0, 1.6, 0.0);
    float outer = max(sdBox(a, vec3(1.5, 1.6, 0.34)), -a.y - 1.6);
    float hole = min(length(a.xy - vec2(0.0, 0.5)) - 1.0, sdBox2(a.xy - vec2(0.0, -0.6), vec2(1.0, 1.1)));
    d = max(outer, -hole);
  } else if (kind < 7.5) {                // a slab that hangs
    vec3 s = q - vec3(0.0, 1.6 + 0.5 * motion, 0.0);
    s.xy = rot(0.22) * s.xy;
    d = sdBox(s, vec3(0.5, 1.4, 0.22));
  } else {                                // a tree, ruled: one trunk, three crowns
    d = sdCyl(q - vec3(0.0, 1.0, 0.0), 0.09, 1.0);
    d = min(d, length(q - vec3(0.0, 2.3, 0.0)) - 0.8);
    d = min(d, length(q - vec3(0.62, 1.85, 0.1)) - 0.5);
    d = min(d, length(q - vec3(-0.55, 1.95, -0.15)) - 0.55);
  }
  return d;
}
float setPiece(vec3 p) {
  if (uSetK.x < 0.5) return 1e5;
  vec3 q = p - uSet.xyz;
  // a cheap bound first: most of the world is nowhere near the set piece
  float bound = length(q - vec3(0.0, 3.5 * uSet.w, 0.0)) - 5.5 * uSet.w;
  if (bound > 2.0 * uSet.w) return bound;
  q.xz = rot(uSetK.y) * q.xz;
  return setRaw(q / uSet.w, uSetK.x, uSetK.z) * uSet.w;
}
// inks for the set piece: the one place the accent ink is allowed to be loud
Surf setSurf(vec3 p) {
  vec3 q = p - uSet.xyz;
  q.xz = rot(uSetK.y) * q.xz;
  q /= uSet.w;
  Surf s = Surf(mix(uInk[LIT], uInk[PAPER], 0.55), mix(uInk[SHADE], uInk[DEEP], 0.45), 0.0, 1.0);
  float k = uSetK.x, lit = uSetK.w;
  bool accent = false;
  if (k < 1.5) accent = abs(q.z) < 0.6 && abs(q.x) < 0.8 && q.y < 3.6 && lit > 0.5 && false;
  else if (k < 2.5) accent = lit > 0.01;
  else if (k < 3.5) accent = lit > 0.01;
  else if (k < 4.5) accent = q.y > 5.1 && q.y < 5.5 && abs(q.x) < 0.1;
  else if (k < 7.5 && k > 6.5) accent = lit > 0.01;
  else if (k > 7.5) accent = q.y > 1.4 && lit > 0.01;
  if (accent) {
    float a = (k > 3.5 && k < 4.5) ? max(lit, 0.35) : lit;
    s.lit = mix(s.lit, uInk[ACCENT], a);
    s.shade = mix(s.shade, uInk[ACCENT] * 0.72, a);
    s.glow = a * ((k > 3.5 && k < 4.5) ? 1.0 : 0.35);
  }
  return s;
}
