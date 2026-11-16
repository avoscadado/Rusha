'use strict';
// ---------- small maths ----------
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sat = (x) => clamp(x, 0, 1);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// frame-rate independent approach of a toward b; k is "per second" sharpness
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mix: (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)],
};

// ---------- seeded randomness ----------
// Every trait draws from its own stream, keyed by a label, so adding a trait
// later never reshuffles the traits that already exist for a given seed.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mix32(a) {
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  return (a ^ (a >>> 16)) >>> 0;
}
function rngFrom(seed) {
  let a = seed >>> 0;
  const r = () => {                       // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.chance = (p) => r() < p;
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  // weighted pick: items are [value, weight]
  r.weighted = (items) => {
    let sum = 0; for (const it of items) sum += it[1];
    let x = r() * sum;
    for (const it of items) { x -= it[1]; if (x <= 0) return it[0]; }
    return items[items.length - 1][0];
  };
  return r;
}
const stream = (seed, label) => rngFrom(mix32((seed >>> 0) ^ hashStr(label)));

// ---------- colour: OKLCH -> linear sRGB ----------
// Palettes are composed in OKLCH so that lightness and chroma are perceptual,
// then handed to the shaders as linear RGB.
function oklch(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const cssColor = (rgb, a = 1) =>
  `rgba(${rgb.map((c) => Math.round(255 * sat(lin2srgb(c)))).join(',')},${a})`;

// base-36 world codes: short, typeable, case-insensitive
const seedToCode = (seed) => (seed >>> 0).toString(36).toUpperCase().padStart(7, '0');
const codeToSeed = (code) => {
  const n = parseInt(String(code).replace(/[^0-9a-z]/gi, ''), 36);
  return Number.isFinite(n) ? n >>> 0 : null;
};
