// Procedural textures generated on the CPU at startup (no external image assets).
import * as THREE from 'three';
import { fbm2, noise2, rng, clamp, lerp, TAU } from './util.js';

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function fromHeight(height, w, h, strength = 2, wrap = true) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  const at = (x, y) => { if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1); } return height[y * w + x]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

function fromFn(w, h, fn) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data; const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { fn(x, y, out); const i = (y * w + x) * 4; d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3] ?? 255; }
  ctx.putImageData(img, 0, 0); return c;
}

function tex(c, { repeat = [1, 1], srgb = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.needsUpdate = true; return t;
}

/** Fine metallic-flake normal map (paint macro). */
export const flakeNormal = () => once('flake', () => {
  const w = 256, r = rng(7); const c = canvas(w, w); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, w); const d = img.data;
  for (let i = 0; i < w * w; i++) {
    const big = r() < 0.08; const nx = (r() * 2 - 1) * (big ? 0.9 : 0.35), ny = (r() * 2 - 1) * (big ? 0.9 : 0.35); const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    d[i * 4] = (nx * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; d[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return tex(c, { repeat: [40, 40] });
});

/** Low-frequency orange-peel for clearcoat. */
export const orangePeel = () => once('peel', () => {
  const w = 256, hgt = new Float32Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) hgt[y * w + x] = fbm2(x / 16, y / 16, 3, 3, 16);
  return tex(fromHeight(hgt, w, w, 1.6), { repeat: [6, 6] });
});

/** Brushed metal: roughness variation streaks (use for roughnessMap + as subtle color). */
export const brushed = () => once('brushed', () => {
  const w = 512, r = rng(11); const rows = new Float32Array(w); for (let y = 0; y < w; y++) rows[y] = r();
  const c = fromFn(w, w, (x, y, o) => {
    const s = rows[y] * 0.5 + fbm2(x / 128, y * 2.0, 2, 5, 4) * 0.5; const v = 120 + s * 90; o[0] = o[1] = o[2] = v; o[3] = 255;
  });
  return tex(c, { repeat: [2, 2] });
});

/** Carbon fibre 2x2 twill: albedo and normal. */
export const carbon = () => once('carbon', () => {
  const w = 512, cells = 16, cs = w / cells, hgt = new Float32Array(w * w);
  const col = fromFn(w, w, (x, y, o) => {
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs); const horiz = ((cx + cy) >> 1) % 2 === 0; // twill offset
    const lx = (x % cs) / cs, ly = (y % cs) / cs; const along = horiz ? lx : ly, across = horiz ? ly : lx;
    const fibre = 0.5 + 0.5 * Math.sin(across * TAU * 6); const bulge = Math.sin(Math.PI * across) * Math.sin(Math.PI * along * 0.999 + 0.0001);
    hgt[y * w + x] = bulge * 0.8 + fibre * 0.08;
    const v = 18 + bulge * 34 + fibre * 10; o[0] = v; o[1] = v; o[2] = v * 1.05; o[3] = 255;
  });
  return { map: tex(col, { srgb: true, repeat: [4, 4] }), normalMap: tex(fromHeight(hgt, w, w, 3), { repeat: [4, 4] }) };
});

/** Leather pebble grain (normal) + stitch-free albedo variation. */
export const leather = () => once('leather', () => {
  const w = 512, r = rng(23); const pts = []; for (let i = 0; i < 900; i++) pts.push([r() * w, r() * w]);
  const grid = new Map(); const G = 32; for (const p of pts) { const k = `${Math.floor(p[0] / G)},${Math.floor(p[1] / G)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const hgt = new Float32Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    let d1 = 1e9, d2 = 1e9; const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const kx = (gx + ox + w / G) % (w / G), ky = (gy + oy + w / G) % (w / G); const list = grid.get(`${kx},${ky}`); if (!list) continue;
      for (const p of list) { let dx = Math.abs(p[0] - x), dy = Math.abs(p[1] - y); dx = Math.min(dx, w - dx); dy = Math.min(dy, w - dy); const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    }
    hgt[y * w + x] = clamp((Math.sqrt(d2) - Math.sqrt(d1)) / 6) * 0.8 + fbm2(x / 40, y / 40, 3, 9, 512 / 40) * 0.2;
  }
  const alb = fromFn(w, w, (x, y, o) => { const v = 200 + hgt[y * w + x] * 55; o[0] = o[1] = o[2] = v; o[3] = 255; });
  return { normalMap: tex(fromHeight(hgt, w, w, 2.2), { repeat: [3, 3] }), map: tex(alb, { srgb: true, repeat: [3, 3] }) };
});

/** Tyre tread (u around circumference, v across width). */
export const tread = () => once('tread', () => {
  const w = 1024, h = 128, hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / h, u = x / w; let g = 1;
    if (Math.abs(v - 0.33) < 0.035 || Math.abs(v - 0.67) < 0.035) g = 0; // circumferential grooves
    const block = (u * 96 + (v > 0.5 ? 0.5 : 0) + (v - 0.5) * 1.2) % 1; if (v > 0.12 && v < 0.88 && block < 0.12) g = 0.15; // sipes
    if (v < 0.06 || v > 0.94) g = 0.6;
    hgt[y * w + x] = g;
  }
  return tex(fromHeight(hgt, w, h, 1.4), { repeat: [1, 1] });
});

/** Asphalt albedo + normal. */
export const asphalt = () => once('asphalt', () => {
  const w = 512, r = rng(31), hgt = new Float32Array(w * w);
  const alb = fromFn(w, w, (x, y, o) => {
    const n = fbm2(x / 3, y / 3, 3, 4, 512 / 3); const agg = r() < 0.06 ? r() * 0.6 : 0; const h = n * 0.6 + agg; hgt[y * w + x] = h;
    const v = 34 + n * 36 + agg * 90 + fbm2(x / 90, y / 90, 3, 2, 512 / 90) * 18; o[0] = v; o[1] = v * 0.98; o[2] = v * 0.96; o[3] = 255;
  });
  return { map: tex(alb, { srgb: true, repeat: [8, 8] }), normalMap: tex(fromHeight(hgt, w, w, 2.5), { repeat: [8, 8] }) };
});

/** Dark walnut with satin lacquer. */
export const walnut = () => once('walnut', () => {
  const w = 1024;
  const c = fromFn(w, w, (x, y, o) => {
    const warp = fbm2(x / 200, y / 30, 4, 41) * 6; const ring = 0.5 + 0.5 * Math.sin((y / 18 + warp) * Math.PI);
    const fine = fbm2(x / 6, y / 1.5, 2, 43); const k = Math.pow(ring, 2.2) * 0.55 + fine * 0.25;
    o[0] = lerp(48, 105, k); o[1] = lerp(26, 62, k); o[2] = lerp(16, 38, k); o[3] = 255;
  });
  return tex(c, { srgb: true, repeat: [1, 1] });
});

/** Polished concrete / epoxy floor albedo. */
export const concrete = () => once('concrete', () => {
  const w = 512;
  const c = fromFn(w, w, (x, y, o) => { const n = fbm2(x / 50, y / 50, 5, 51, 512 / 50); const s = fbm2(x / 4, y / 4, 2, 53, 128); const v = 70 + n * 50 + s * 12; o[0] = v; o[1] = v; o[2] = v * 1.02; o[3] = 255; });
  return tex(c, { srgb: true, repeat: [6, 6] });
});

/** Roughness variation for floors (smudges). */
export const smudge = () => once('smudge', () => {
  const w = 512;
  const c = fromFn(w, w, (x, y, o) => { const n = fbm2(x / 70, y / 70, 5, 61, 512 / 70); const v = 70 + n * 120; o[0] = o[1] = o[2] = v; o[3] = 255; });
  return tex(c, { repeat: [3, 3] });
});

/** Honed cylinder bore cross-hatch. */
export const crosshatch = () => once('hatch', () => {
  const w = 512, r = rng(71), hgt = new Float32Array(w * w);
  const lines = []; for (let i = 0; i < 220; i++) lines.push([r() * w, r() < 0.5 ? 1 : -1, r() * 0.5 + 0.5]);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    let h = 0; for (let i = 0; i < lines.length; i += 3) { const [o, s, a] = lines[i]; const d = ((x + s * y * 0.55 - o) % 24 + 24) % 24; if (d < 0.9) h += a * 0.4; }
    hgt[y * w + x] = h + fbm2(x / 8, y / 8, 2, 73, 64) * 0.2;
  }
  return tex(fromHeight(hgt, w, w, 1.5), { repeat: [3, 2] });
});

/** Engine-turned / guilloché pattern for watch dials and badges. */
export function guilloche(w = 512, rings = 70) {
  const hgt = new Float32Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = x / w - 0.5, dy = y / w - 0.5; const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    hgt[y * w + x] = 0.5 + 0.5 * Math.sin(r * rings * TAU + Math.sin(a * 24) * 1.4);
  }
  return hgt;
}

/** Generic canvas → texture helper with hi-dpi drawing callback. */
export function drawTexture(w, h, draw, opts = {}) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); draw(ctx, w, h); const t = tex(c, { srgb: opts.srgb ?? true, repeat: [1, 1] });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Height drawn with canvas (white = raised) converted to a normal map. */
export function drawNormal(w, h, draw, strength = 3) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); draw(ctx, w, h);
  const px = ctx.getImageData(0, 0, w, h).data; const hgt = new Float32Array(w * h);
  // light blur so engraved edges have a bevel
  for (let i = 0; i < w * h; i++) hgt[i] = px[i * 4] / 255;
  const out = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const xx = clamp(x + ox, 0, w - 1), yy = clamp(y + oy, 0, h - 1); s += hgt[yy * w + xx]; n++; }
      out[y * w + x] = s / n;
    }
    hgt.set(out);
  }
  const t = tex(fromHeight(hgt, w, h, strength, false)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export { fromHeight, fromFn, tex, canvas };

export const FONT_SERIF = '"Cormorant Garamond", "Cormorant", Georgia, serif';

/** The LPC monogram/emblem drawn into a 2D context centred at (cx,cy), radius R. */
export function drawEmblem(ctx, cx, cy, R, { fill = '#fff', stroke = '#fff', bg = null } = {}) {
  ctx.save(); ctx.translate(cx, cy);
  if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  ctx.lineWidth = R * 0.035; ctx.beginPath(); ctx.arc(0, 0, R * 0.96, 0, TAU); ctx.stroke();
  ctx.lineWidth = R * 0.012; ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, TAU); ctx.stroke();
  // ring lettering
  ctx.font = `600 ${R * 0.11}px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ring = 'LEGEND · PADDOCK · CLUB · '; const chars = ring.split(''); const step = TAU / chars.length;
  chars.forEach((ch, i) => { ctx.save(); ctx.rotate(-Math.PI / 2 + i * step); ctx.translate(R * 0.91, 0); ctx.rotate(Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore(); });
  // car profile line
  ctx.lineWidth = R * 0.03; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); const s = R * 0.62;
  const prof = [[-1, 0.05], [-0.98, 0.16], [-0.62, 0.22], [-0.3, 0.26], [-0.12, 0.44], [0.18, 0.47], [0.52, 0.3], [0.9, 0.22], [1, 0.12], [0.98, 0.04]];
  prof.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, -y * s + R * 0.06) : ctx.moveTo(x * s, -y * s + R * 0.06)));
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1.02 * s, R * 0.1); ctx.lineTo(1.02 * s, R * 0.1); ctx.lineWidth = R * 0.012; ctx.stroke();
  for (const wx of [-0.58, 0.6]) { ctx.beginPath(); ctx.arc(wx * s, R * 0.04, R * 0.1, 0, TAU); ctx.lineWidth = R * 0.026; ctx.stroke(); }
  // monogram
  ctx.font = `600 ${R * 0.42}px ${FONT_SERIF}`; ctx.fillText('LPC', 0, R * 0.44);
  ctx.restore();
}
