// Shared math, easing and deterministic randomness.
// Everything in the film is a pure function of time, so renders are frame-exact.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const easeInExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * clamp(t) - 10));
export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const easeOutQuint = (t) => 1 - Math.pow(1 - clamp(t), 5);
export const easeInOutQuint = (t) => { t = clamp(t); return t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2; };
/** Window: 0 before a, ramps to 1 over [a,b], holds, ramps down over [c,d]. */
export const win = (t, a, b, c, d) => smooth(invLerp(a, b, t)) * (1 - smooth(invLerp(c, d, t)));
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Mulberry32 seeded PRNG. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return r;
}

/** Stateless hash noise, good enough for deterministic flicker. */
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
export function noise1(x) {
  const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
export function fbm1(x, oct = 4) { let a = 0.5, s = 0; for (let i = 0; i < oct; i++) { s += a * noise1(x); x *= 2.03; a *= 0.5; } return s; }

/** 2D value noise + fbm for texture generation (CPU). */
function hash2(x, y, seed) { let h = x * 374761393 + y * 668265263 + seed * 2147483647; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return (h >>> 0) / 4294967296; }
export function noise2(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const P = period || 1e9; const w = (a) => ((a % P) + P) % P;
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed), c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm2(x, y, oct = 5, seed = 0, period = 0) {
  let s = 0, a = 0.5, n = 0, p = period;
  for (let i = 0; i < oct; i++) { s += a * noise2(x, y, seed + i * 17, p); n += a; x *= 2; y *= 2; if (p) p *= 2; a *= 0.5; }
  return s / n;
}

/** Catmull-Rom camera path helper. */
export function curve(points, closed = false, tension = 0.5) {
  return new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed, 'catmullrom', tension);
}
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Smoothly interpolate a list of [t, value] keys (numbers or arrays). */
export function keys(list, t, ease = smooth) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 0; i < list.length - 1; i++) {
    const [t0, a] = list[i], [t1, b] = list[i + 1];
    if (t <= t1) {
      const k = ease(invLerp(t0, t1, t));
      if (Array.isArray(a)) return a.map((x, j) => lerp(x, b[j], k));
      return lerp(a, b, k);
    }
  }
  return list[list.length - 1][1];
}

export function mergeInto(target, src) { for (const k in src) target[k] = src[k]; return target; }
