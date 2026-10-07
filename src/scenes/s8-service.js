// SCENE 8 (72–82s) — THE SERVICE. Key on a velvet tray, an enclosed carrier sealing its doors,
// a private track day at sunset, a rare car turning before a silent audience, a gold wax seal.
// Realism pass: every set is lit and reflected by a real photographic HDR panorama (warm lounge, Venetian
// sunset, golden-hour field, photo studios); exteriors show the photographed sky; large surfaces use photo
// textures (lacquered hardwood, real asphalt, real turf); hero props are photoreal glTF models (aviator sunglasses,
// glass vases with roses, traffic cones, the concept car), cleaned of every third-party mark.
import { THREE, envOn, makeSet, spot, point, dirLight, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, easeInOutCubic, lightCone } from './common.js';
import { buildCar, emblemMaterial } from '../models/car.js';
import { buildFigure, POSES } from '../models/figure.js';
import { mesh, roundBox, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { drawTexture, drawNormal, drawEmblem, FONT_SERIF, fromHeight, fromFn, tex } from '../engine/textures.js';
import { easeOutCubic, easeInCubic, TAU, easeOutQuint, fbm2 } from '../engine/util.js';
import { hdri, useHdri, HDRI, model, hide, findIn, photo, selectVariant } from '../engine/assets.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------------
// Asset helpers (local to this scene)

/** Photoreal glTF with the punctual lights / cameras it ships with removed (we light every set ourselves). */
async function prop(name, opts) {
  const m = await model(name, opts); const drop = [];
  m.traverse((o) => { if (o.isLight || o.isCamera) drop.push(o); }); for (const o of drop) o.parent?.remove(o);
  return m;
}
/** Drop the glTF parser handle from a loaded model so it can be cloned with Object3D.clone() (userData is JSON-copied). */
function cloneable(m) { m.userData = { size: m.userData.size }; return m; }
/** Clone-and-edit every material of a model once (shared cache materials stay untouched). fn(clone, name). */
function editMats(root, fn) {
  const done = new Map();
  const f = (m) => { if (!done.has(m)) { const c = m.clone(); fn(c, m.name || ''); done.set(m, c); } return done.get(m); };
  root.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
  return root;
}
/** Replace KHR transmission glass with cheap transparent glass (no extra transmission render pass). */
function cheapGlass(root, { opacity = 0.2, color = 0xffffff } = {}) {
  return editMats(root, (c) => { if (!c.transmission) return; c.transmission = 0; c.thickness = 0; c.transparent = true; c.opacity = opacity; c.color.set(color); c.roughness = 0.02; c.depthWrite = false; });
}
/** PMREM of a real HDR panorama with its sun clamped to `max` (hue kept): the sun's direct light comes from a matching
 *  DirectionalLight instead, so mirror-smooth clear coats show a crisp sun glint rather than a frame-filling bloom. */
async function clampedEnv(renderer, name, max = 40) {
  const h = await hdri(name); const src = h.equirect; const d = src.image?.data; if (!d || src.type !== THREE.HalfFloatType) return h.pmrem;
  const out = new Uint16Array(d); const H = THREE.DataUtils; const cap = H.toHalfFloat(max);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] <= cap && out[i + 1] <= cap && out[i + 2] <= cap) continue;
    // the sun core overflows half float (Infinity): give it the clamp value, keep the hue of finite pixels
    const c = [out[i], out[i + 1], out[i + 2]].map((v) => H.fromHalfFloat(v)); const fin = c.every(Number.isFinite);
    const k = fin ? max / Math.max(...c) : 1; for (let j = 0; j < 3; j++) out[i + j] = H.toHalfFloat(Number.isFinite(c[j]) ? (fin ? c[j] * k : Math.min(c[j], max)) : max);
  }
  const t = new THREE.DataTexture(out, src.image.width, src.image.height, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = src.colorSpace; t.flipY = src.flipY; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  _pmrem ??= new THREE.PMREMGenerator(renderer); const pm = _pmrem.fromEquirectangular(t).texture; t.dispose(); return pm; // one generator: shaders compiled once
}
let _pmrem = null;

/** Photoreal aviator sunglasses, cleaned: logo-printed temple texture removed (plain black acetate), smoked lenses. */
async function sunglasses() {
  const m = await prop('SunglassesKhronos', { size: 0.15, axis: 'x' });
  editMats(m, (c, n) => {
    if (/temple|earhook/i.test(n)) { c.map = null; c.emissiveMap = null; c.color.set(0x0c0b0b); c.roughness = 0.28; c.metalness = 0; }
    if (/lens/i.test(n)) { c.transmission = 0; c.iridescence = 0; c.transparent = true; c.opacity = 0.88; c.color.set(0x16110c); c.roughness = 0.03; c.metalness = 0.3; c.depthWrite = /exterior/i.test(n); }
    if (/nose/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.5; }
  });
  return m;
}

/** Private clone of a cached photo texture with its own tiling. */
function tiled(tex, rx, ry, rot = 0, off = [0, 0]) { const c = tex.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.offset.set(...off); c.rotation = rot; c.needsUpdate = true; return c; }

/** Smooth shading for a (non-indexed) extruded / rounded-box geometry: ExtrudeGeometry's normals are per-face, so bevels
 *  render as flat facets — a staircase of blocky reflections at macro distance. Average area-weighted face normals over
 *  coincident vertices (UVs untouched). */
function smoothNormals(g) {
  const p = g.attributes.position; const acc = new Map(); const key = (i) => `${Math.round(p.getX(i) * 2e5)},${Math.round(p.getY(i) * 2e5)},${Math.round(p.getZ(i) * 2e5)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); const keys = [];
  for (let i = 0; i < p.count; i++) keys.push(key(i));
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a); b.cross(c);
    for (let k = 0; k < 3; k++) { const v = acc.get(keys[i + k]); if (v) v.add(b); else acc.set(keys[i + k], b.clone()); }
  }
  const n = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = acc.get(keys[i]).clone().normalize(); n[i * 3] = v.x; n[i * 3 + 1] = v.y; n[i * 3 + 2] = v.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g;
}
const rbox = (w, h, d, r, seg) => smoothNormals(roundBox(w, h, d, r, seg));

/** Lacquered hardwood from the real photo set (diffuse + roughness + bump), stained dark. */
async function woodMat({ color = 0x7a4a30, repeat = [2.5, 0.8], rot = 0, coat = 1, coatRough = 0.06, bump = 0.6, offset = [0, 0] } = {}) {
  const [map, rough, bmp] = await Promise.all([
    photo('textures/hardwood2_diffuse.jpg', { srgb: true }), photo('textures/hardwood2_roughness.jpg', { srgb: false }), photo('textures/hardwood2_bump.jpg', { srgb: false }),
  ]);
  return new THREE.MeshPhysicalMaterial({
    color, map: tiled(map, ...repeat, rot, offset), roughnessMap: tiled(rough, ...repeat, rot, offset), bumpMap: tiled(bmp, ...repeat, rot, offset), bumpScale: bump,
    roughness: 0.8, metalness: 0, clearcoat: coat, clearcoatRoughness: coatRough,
  });
}

/** True when `o` and every ancestor up to `root` are visible (hidden logos / internals are skipped). */
function shown(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }

/** Contact shadow + ambient occlusion baked from the object's own triangles: every surface point near the floor darkens the
 *  floor under it (darker and tighter the lower it is), so tyres, feet and rims get crisp dark contacts and bodies a soft AO
 *  skirt. Built in `root`'s local frame (floor = floorY, default the lowest point) and parented to `root`. */
function contactShadow(root, { floorY = null, reach = 0.02, spread = 0.5, cut = 4, res = 192, strength = 0.9, gamma = 1, filter = null, lift = 0.0006, cast = null } = {}) {
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(), mtx = new THREE.Matrix4(), v = new THREE.Vector3();
  // optional soft cast shadow from a key light at world position cast.from: points are projected along the light onto the floor
  const L = cast ? cast.from.clone().sub(new THREE.Vector3().setFromMatrixPosition(root.matrixWorld)).transformDirection(inv) : null;
  const sx = L ? -L.x / Math.max(0.2, L.y) : 0, sz = L ? -L.z / Math.max(0.2, L.y) : 0; const cH = cast ? cast.reach * 3 : 0;
  const parts = []; let minY = Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes.position || !shown(o, root) || (filter && !filter(o))) return;
    mtx.multiplyMatrices(inv, o.matrixWorld); const pos = o.geometry.attributes.position; const P = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mtx); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; if (v.y < minY) minY = v.y; }
    parts.push({ P, idx: o.geometry.index?.array ?? null, n: o.geometry.index ? o.geometry.index.count : pos.count });
  });
  const fy = floorY ?? minY, H = Math.max(reach * cut, cH); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const { P } of parts) for (let i = 0; i < P.length; i += 3) {
    const dy = P[i + 1] - fy; if (dy >= H) continue; const x = P[i] + Math.max(0, dy) * sx, z = P[i + 2] + Math.max(0, dy) * sz;
    x0 = Math.min(x0, P[i], x); x1 = Math.max(x1, P[i], x); z0 = Math.min(z0, P[i + 2], z); z1 = Math.max(z1, P[i + 2], z);
  }
  const pad = H * Math.max(spread, cast?.spread ?? 0) + Math.max(x1 - x0, z1 - z0) * 0.05; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  const cell = Math.max(x1 - x0, z1 - z0) / res, W = Math.ceil((x1 - x0) / cell), D = Math.ceil((z1 - z0) / cell); let g = new Float32Array(W * D);
  const disc = (x, z, w, r) => {
    const cx = (x - x0) / cell, cz = (z - z0) / cell; const ia = Math.max(0, Math.floor(cx - r)), ib = Math.min(W - 1, Math.ceil(cx + r)), ja = Math.max(0, Math.floor(cz - r)), jb = Math.min(D - 1, Math.ceil(cz + r));
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) { const d2 = ((i + 0.5 - cx) ** 2 + (j + 0.5 - cz) ** 2) / (r * r); if (d2 >= 1) continue; const f = w * (1 - d2) * (1 - d2); const k = j * W + i; if (f > g[k]) g[k] = f; }
  };
  const splat = (x, y, z) => {
    const dy = Math.max(0, y - fy);
    if (dy < reach * cut) disc(x, z, Math.exp(-dy / reach), Math.max(1.3, (cell * 1.2 + dy * spread) / cell));
    if (cast && dy < cH) disc(x + dy * sx, z + dy * sz, cast.k * Math.exp(-dy / cast.reach), Math.max(1.3, (cell * 1.5 + dy * cast.spread) / cell));
  };
  for (const { P, idx, n } of parts) for (let t = 0; t + 2 < n; t += 3) {
    const a = (idx ? idx[t] : t) * 3, b = (idx ? idx[t + 1] : t + 1) * 3, c = (idx ? idx[t + 2] : t + 2) * 3;
    if (Math.min(P[a + 1], P[b + 1], P[c + 1]) - fy >= H) continue;
    const e = Math.max(Math.hypot(P[b] - P[a], P[b + 2] - P[a + 2]), Math.hypot(P[c] - P[a], P[c + 2] - P[a + 2]), Math.hypot(P[c] - P[b], P[c + 2] - P[b + 2]));
    const m = Math.min(48, Math.max(1, Math.ceil(e / (cell * 1.5))));
    for (let i = 0; i <= m; i++) for (let j = 0; i + j <= m; j++) { const u = i / m, w = j / m, s = 1 - u - w; splat(P[a] * s + P[b] * u + P[c] * w, P[a + 1] * s + P[b + 1] * u + P[c + 1] * w, P[a + 2] * s + P[b + 2] * u + P[c + 2] * w); }
  }
  for (let pass = 0; pass < 2; pass++) { // separable 3-tap box blur ×2 → soft penumbra edge
    const h = new Float32Array(W * D); for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) h[j * W + i] = (g[j * W + Math.max(0, i - 1)] + g[j * W + i] + g[j * W + Math.min(W - 1, i + 1)]) / 3;
    const o = new Float32Array(W * D); for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) o[j * W + i] = (h[Math.max(0, j - 1) * W + i] + h[j * W + i] + h[Math.min(D - 1, j + 1) * W + i]) / 3; g = o;
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = D; const ctx = cv.getContext('2d'); const img = ctx.createImageData(W, D);
  for (let k = 0; k < W * D; k++) { const val = 255 * Math.pow(clamp(g[k]), gamma); img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = val; img.data[k * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(W * cell, D * cell), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  s.rotation.x = -Math.PI / 2; s.position.set(x0 + (W * cell) / 2, fy + lift, z0 + (D * cell) / 2); s.renderOrder = 2; root.add(s); return s;
}

/** Sit a model on its tyres: precise vertex bounds of the tyre meshes only (the AABB of the rotated wheel nodes is inflated,
 *  which floated the car above the ground), then a few millimetres of tyre squash. */
function groundOn(holder, inner, re = /^Tire/i, squash = 0.006) {
  holder.updateMatrixWorld(true); const inv = holder.matrixWorld.clone().invert(), mtx = new THREE.Matrix4(), v = new THREE.Vector3(); let min = Infinity;
  holder.traverse((o) => {
    if (!o.isMesh || !shown(o, holder) || ![].concat(o.material).some((m) => re.test(m.name || ''))) return;
    mtx.multiplyMatrices(inv, o.matrixWorld); const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mtx); if (v.y < min) min = v.y; }
  });
  if (Number.isFinite(min)) inner.position.y -= min + squash; holder.updateMatrixWorld(true); return min;
}

/** Soft rectangular contact shadow (paper lying on the desk, flat panels): w × d metres, blurred rim of `soft` metres. */
function rectShadow(w, d, { soft = 0.004, strength = 0.6 } = {}) {
  const R = 256, k = R / Math.max(w + soft * 6, d + soft * 6); const cw = Math.ceil((w + soft * 6) * k), ch = Math.ceil((d + soft * 6) * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
  g.filter = `blur(${Math.max(1, soft * k)}px)`; g.fillStyle = '#fff'; g.fillRect(soft * 3 * k, soft * 3 * k, w * k, d * k);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(cw / k, ch / k), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  s.rotation.x = -Math.PI / 2; s.renderOrder = 2; return s;
}

/** Black radial falloff laid over a floor: clear inside r0, opaque from r1 (an infinite dark showroom, no slab edge). */
function floorFade(size, r0, r1) {
  const R = 1024; const c = document.createElement('canvas'); c.width = c.height = R; const g = c.getContext('2d');
  const grd = g.createRadialGradient(R / 2, R / 2, (r0 / size) * R, R / 2, R / 2, (r1 / size) * R); grd.addColorStop(0, '#000'); grd.addColorStop(0.45, '#7a7a7a'); grd.addColorStop(1, '#fff');
  g.fillStyle = grd; g.fillRect(0, 0, R, R); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1; return m;
}

/** Crushed-velvet maps: soft directional pile variation (albedo) + fine fibre/nap relief (normal). Tileable. */
function velvetMaps() {
  const w = 256, P = 8; const hgt = new Float32Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) hgt[y * w + x] = fbm2((x / w) * 128, (y / w) * 128, 2, 71, 128);
  const alb = fromFn(w, w, (x, y, o) => { const c = fbm2((x / w) * P, (y / w) * P * 0.6, 4, 73, P); const v = 178 + 77 * Math.pow(c, 1.3); o[0] = o[1] = o[2] = v; o[3] = 255; });
  return { map: tex(alb, { srgb: true }), normalMap: tex(fromHeight(hgt, w, w, 2.5)) };
}

/** Sealing-wax puddle with an irregular, squeezed outline. pressed: flat embossed top inside the stamp radius `rs`, a groove
 *  where the die edge bit in, and a squeezed-out lip; otherwise a molten pool (flattened meniscus dome). UVs are planar so
 *  the emblem normal map (circle radius 0.45 in UV) lands exactly on the die face. */
function waxGeo({ rs = 0.0235, R = 0.0285, wob = 0.0022, top = 0.0024, lip = 0.0034, pressed = true, seed = 5, NS = 96 } = {}) {
  const r = rng(seed); const harm = [2, 3, 4, 5, 7, 9].map((k) => [k, r() * TAU, wob * (1.6 / k) * (0.6 + r() * 0.8)]);
  const edge = (a) => R + harm.reduce((s, [k, ph, amp]) => s + Math.sin(k * a + ph) * amp, 0);
  const lipH = (a) => lip * (0.8 + 0.4 * (0.5 + 0.5 * Math.sin(3 * a + harm[0][1])));
  // radial stations: [radius(θ), height(θ)]
  const st = [];
  if (pressed) {
    for (let i = 0; i <= 14; i++) st.push(() => [(rs * 0.97 * i) / 14, top]);
    st.push(() => [rs * 0.99, top * 0.72], () => [rs + 0.0004, top * 0.7]);
    st.push((a) => [rs + 0.0016, lipH(a)], (a) => [rs + 0.0028, lipH(a) * 0.96]);
    for (let i = 1; i <= 8; i++) { const f = i / 8; st.push((a) => { const re = edge(a); const r0 = rs + 0.0028; return [lerp(r0, re, f), lipH(a) * 0.96 * Math.cos((f * Math.PI) / 2) ** 0.7]; }); }
  } else {
    for (let i = 0; i <= 20; i++) { const f = i / 20; st.push((a) => [edge(a) * f, top * Math.pow(Math.max(0, 1 - f * f), 0.32)]); }
  }
  const pos = [], uv = [], ind = []; const kU = 0.45 / rs;
  for (let j = 0; j <= NS; j++) { const a = (j / NS) * TAU; for (const f of st) { const [rr, h] = f(a); const x = Math.cos(a) * rr, z = Math.sin(a) * rr; pos.push(x, h, z); uv.push(0.5 + x * kU, 0.5 - z * kU); } }
  const L = st.length; for (let j = 0; j < NS; j++) for (let i = 0; i < L - 1; i++) { const a = j * L + i, b = (j + 1) * L + i; ind.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ind); geo.computeVertexNormals();
  return geo;
}

/** One model shown many times as InstancedMeshes (one draw call per mesh): matrices place each copy. */
function instanced(root, matrices) {
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(); const g = new THREE.Group(); const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || !shown(o, root)) return; const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length); matrices.forEach((M4, i) => im.setMatrixAt(i, m.multiplyMatrices(M4, local))); im.frustumCulled = false; g.add(im);
  });
  return g;
}

/** Heavy-trailer wheel (outer face +z): rounded tyre whose sidewall wraps a rim recessed ~4.5 cm inside it, machined dark disc
 *  with hand holes, dark hub and a ring of ten lug nuts. */
function trailerWheel() {
  const g = new THREE.Group();
  const rimM = new THREE.MeshStandardMaterial({ color: 0x4a4b4f, metalness: 0.9, roughness: 0.45 }), hubM = new THREE.MeshStandardMaterial({ color: 0x121214, metalness: 0.6, roughness: 0.5 });
  const nutM = new THREE.MeshStandardMaterial({ color: 0x6a6b70, metalness: 1, roughness: 0.35 });
  g.add(mesh(lathe([[0.334, -0.16], [0.35, -0.175], [0.44, -0.177], [0.48, -0.169], [0.497, -0.15], [0.5, -0.12], [0.5, 0.12], [0.497, 0.15], [0.48, 0.169], [0.44, 0.177], [0.35, 0.175], [0.334, 0.16]], 48), M.tyre(), { r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.336, 0.336, 0.02, 40), rimM, { p: [0, 0, 0.13], r: [Math.PI / 2, 0, 0] }));
  const well = mesh(new THREE.CylinderGeometry(0.337, 0.337, 0.05, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.9, roughness: 0.5, side: THREE.DoubleSide }), { p: [0, 0, 0.155], r: [Math.PI / 2, 0, 0] }); g.add(well);
  g.add(mesh(new THREE.TorusGeometry(0.3, 0.007, 6, 48), rimM, { p: [0, 0, 0.14] }));
  const holes = [], nuts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; const h = new THREE.CircleGeometry(0.034, 16); h.scale(1, 1.35, 1); h.rotateZ(a + Math.PI / 2); h.translate(Math.cos(a) * 0.235, Math.sin(a) * 0.235, 0.1405); holes.push(h); }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; const n = new THREE.CylinderGeometry(0.013, 0.013, 0.026, 6); n.rotateX(Math.PI / 2); n.translate(Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0.152); nuts.push(n); }
  g.add(mesh(mergeAll(holes), new THREE.MeshBasicMaterial({ color: 0x020202 }))); g.add(mesh(mergeAll(nuts), nutM));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.112, 0.03, 24), hubM, { p: [0, 0, 0.155], r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.012, 20), hubM, { p: [0, 0, 0.174], r: [Math.PI / 2, 0, 0] }));
  return g;
}
/** Merge a list of (non-indexed-compatible) geometries into one. */
function mergeAll(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g)); const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}

/** Photoreal concept car (Khronos CarConcept) cleaned for the brief: no logos / plates / dash display / sidewall lettering,
 *  palette paint, cheap dark glass. Length along the film's +x (nose forward). env: optional private reflection map. */
async function conceptCar({ paint = 0x5e6066, metal = 0.85, rough = 0.3, coatRough = 0.03, trim = 0x3d0b12, length = 4.45, lights = 0, env = null, envI = 1, cabin = true, shadow = 0.92 } = {}) {
  const m = await prop('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Graphite');
  editMats(m, (c, n) => {
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); } // third-party marks live in emissive maps (rims, mirrors) + the dash display
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.62; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; }
    if (/Paint 1/i.test(n)) { c.color.set(paint); c.metalness = metal; c.roughness = rough; c.clearcoat = 1; c.clearcoatRoughness = coatRough; c.iridescence = 0; }
    if (/Paint 2/i.test(n)) { c.color.set(0x050506); c.metalness = 0.2; c.roughness = 0.25; c.clearcoat = 1; c.clearcoatRoughness = 0.04; c.iridescence = 0; }
    if (/Interior 3/i.test(n)) c.color.set(trim);
    if (/Headlight/i.test(n)) { c.emissive?.set(lights ? 0xfff1dc : 0x000000); c.emissiveIntensity = lights ? 6 : 0.05; }
    if (/Brakelight/i.test(n)) { c.emissive?.set(0xff1408); c.emissiveIntensity = lights ? 2.2 : 0.05; }
    if (/Signallight|Dashboard/i.test(n)) { c.emissive?.set(0x000000); c.emissiveIntensity = 0; }
    if (/Tireside/i.test(n)) { c.map = null; c.normalMap = null; c.color.set(0x131313); c.roughness = 0.6; } // sidewall texture + relief carry third-party lettering
    if (/Rim2/i.test(n)) { c.color.set(0x9a9b9f); c.roughness = 0.24; } // brushed-titanium spokes
    if (env && 'envMap' in c) { c.envMap = env; c.envMapIntensity = envI; }
  });
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorFloor|InteriorCage|InteriorSeatsFrame|InteriorSteering|BodyWindshieldWipers|BodyHood(Interior|Under)|Wheel.*BrakePad)/); // hidden by body / dark glass
  hide(m, cabin ? /^Interior(Dash|Floormats|Pillar)/ : /^Interior(?!Seats)/); // seen through dark glass: seats are enough
  m.rotation.y = Math.PI / 2; // model length is +z → the film's +x convention
  const holder = new THREE.Group(); holder.add(m);
  groundOn(holder, m); // on its tyres, not on the inflated bounding box
  if (shadow) holder.userData.shadow = contactShadow(holder, { floorY: 0, reach: 0.09, spread: 0.55, cut: 4, res: 256, strength: shadow, lift: 0.003 });
  return holder;
}

/** Low sun straight into the lens: mirror-smooth glass / clear coat turn the DirectionalLight into frame-filling glints.
 *  Give this object's (cloned) materials a believable minimum micro-roughness instead (shared library materials untouched). */
function softenGlints(root, { rough = 0.12, coat = 0.1 } = {}) {
  return editMats(root, (c) => { if ('roughness' in c && c.roughness < rough) c.roughness = rough; if (c.clearcoat > 0 && c.clearcoatRoughness < coat) c.clearcoatRoughness = coat; });
}

/** Soft contact shadow (canvas AO decal) for a car footprint of L × W metres, length along x. */
function footShadow(L = 4.45, W = 1.95, strength = 0.95) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); // alphaMap reads the green channel: white shapes on black
  g.filter = 'blur(16px)'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.roundRect(56, 52, 400, 152, 64); g.fill();
  g.filter = 'blur(7px)'; g.fillStyle = 'rgba(255,255,255,0.95)'; for (const x of [118, 386]) for (const y of [70, 186]) { g.beginPath(); g.ellipse(x, y, 40, 20, 0, 0, TAU); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.2, W * 1.35), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: strength, depthWrite: false }));
  s.rotation.x = -Math.PI / 2; s.position.y = 0.004; s.renderOrder = 2; return s;
}

/** Photoreal traffic cone (single cone, ground plate / bulb removed), recoloured from safety orange to the palette's deep
 *  burgundy (white reflective bands kept). Returns { cone: Group centred on the cone, asphalt: { map, rough } from the plate }. */
async function trackCone(height = 0.5) {
  const m = await prop('TrafficCone', { size: height, axis: 'y' });
  const plate = findIn(m, /plane/i).find((o) => o.isMesh); const asphalt = plate ? { map: plate.material.map, rough: plate.material.roughnessMap } : null;
  hide(m, /plane|bulb|retro/i);
  editMats(m, (c, n) => {
    if (!/ConeBase/i.test(n)) return;
    if (c.specularColor) c.specularColor.setScalar(1); c.specularIntensity = 0.6; c.roughness = 0.42;
    const img = c.map?.image; if (!img) return;
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height); const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gg = p[i + 1], b = p[i + 2]; const s = clamp((r - b) / (r + 1) * 1.15); const f = r / 235;
      p[i] = lerp(r, 112 * f, s); p[i + 1] = lerp(gg, 14 * f, s); p[i + 2] = lerp(b, 24 * f, s); // orange → burgundy, white bands kept
    }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = c.map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = c.map.wrapS; t.wrapT = c.map.wrapT; t.anisotropy = 4; c.map = t;
  });
  m.updateMatrixWorld(true); const coneMesh = findIn(m, /ConeBase/i).find((o) => o.isMesh && o.visible);
  const box = new THREE.Box3().setFromObject(coneMesh); const ctr = box.getCenter(new THREE.Vector3());
  m.position.x -= ctr.x; m.position.z -= ctr.z; cloneable(m); const cone = new THREE.Group(); cone.add(m);
  return { cone, asphalt };
}

// ------------------------------------------------------------------------------------------------
// Procedural hero pieces kept from the original film (now lit by real panoramas)

function buildKey() {
  const g = new THREE.Group();
  const blade = new THREE.Shape(); blade.moveTo(0, -0.005); blade.lineTo(0.05, -0.005); blade.lineTo(0.056, 0); blade.lineTo(0.05, 0.005); for (let i = 0; i < 6; i++) { blade.lineTo(0.045 - i * 0.007, 0.005 + (i % 2 ? 0.002 : -0.001)); } blade.lineTo(0, 0.005); blade.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.0022, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 1 }), M.chrome(), { p: [0.012, 0, -0.0011] }));
  // piano-black head: smooth-shaded bevels (no faceted staircase in the reflection) and a hair of micro-roughness
  const head = mesh(rbox(0.03, 0.026, 0.009, 0.004, 8), keyMats().head); g.add(head);
  const badge = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.0015, 40), emblemMaterial(), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.0048] }); badge.geometry.rotateY(Math.PI / 2); g.add(badge);
  g.add(mesh(new THREE.TorusGeometry(0.006, 0.0012, 8, 32), M.goldPolished(), { p: [-0.017, 0, 0] }));
  // leather fob: a smooth-shaded soft cushion (no faceted glassy bevel), fine pebble grain, satin, stitched edge
  const fob = mesh(rbox(0.035, 0.022, 0.0046, 0.0021, 8), keyMats().leather, { p: [-0.038, -0.004, 0], r: [0, 0, 0.35] }); g.add(fob);
  const st = new THREE.Shape(); const sw = 0.0145, sh = 0.0083, sr = 0.0045; st.moveTo(-sw + sr, -sh); st.lineTo(sw - sr, -sh); st.quadraticCurveTo(sw, -sh, sw, -sh + sr); st.lineTo(sw, sh - sr); st.quadraticCurveTo(sw, sh, sw - sr, sh); st.lineTo(-sw + sr, sh); st.quadraticCurveTo(-sw, sh, -sw, sh - sr); st.lineTo(-sw, -sh + sr); st.quadraticCurveTo(-sw, -sh, -sw + sr, -sh);
  const stitch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(st.getSpacedPoints(80).map((p) => new THREE.Vector3(p.x, p.y, 0)), true), 120, 0.00022, 4, true), keyMats().stitch);
  for (const z of [0.00232, -0.00232]) { const s = stitch.clone(); s.position.z = z; fob.add(s); }
  return g;
}
let _keyMats = null;
function keyMats() {
  if (_keyMats) return _keyMats;
  const L = M.leather(0x2a140c); L.map = L.map.clone(); L.normalMap = L.normalMap.clone(); for (const t of [L.map, L.normalMap]) { t.repeat.set(70, 70); t.needsUpdate = true; } // roundBox UVs are in metres
  L.normalScale.set(0.45, 0.45); L.roughness = 0.62; L.sheen = 0.35; L.sheenRoughness = 0.6; L.sheenColor.set(0x4a2a1c);
  _keyMats = {
    head: new THREE.MeshPhysicalMaterial({ color: 0x060606, metalness: 0, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.11 }),
    leather: L, stitch: new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.7 }),
  };
  return _keyMats;
}

function velvetTray(velvet = M.velvet(0x3a0c12)) {
  const g = new THREE.Group(); const s = new THREE.Shape(); const w = 0.16, h = 0.1, r = 0.02;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const base = mesh(smoothNormals(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 5 })), M.goldPolished(), { r: [-Math.PI / 2, 0, 0] }); g.add(base);
  const inner = new THREE.Shape(s.getPoints(32).map((p) => p.multiplyScalar(0.9)));
  g.add(mesh(smoothNormals(new THREE.ExtrudeGeometry(inner, { depth: 0.004, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 4 })), velvet, { r: [-Math.PI / 2, 0, 0], p: [0, 0.014, 0] }));
  return g;
}

function flagMesh() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d'); for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#0a0a0a' : '#ece6da'; g.fillRect(x * 32, y * 32, 32, 32); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.0, 0.7, 40, 20); const base = geo.attributes.position.array.slice();
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color(0xfff0d8) }));
  m.userData.wave = (t) => { const p = geo.attributes.position.array; for (let i = 0; i < p.length; i += 3) { const x = base[i] + 0.5; p[i + 2] = Math.sin(x * 7 - t * 9) * 0.06 * x + Math.sin(x * 13 - t * 13 + base[i + 1] * 4) * 0.02 * x; } geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
  return m;
}

/** Private circuit: real asphalt photo on the track, burgundy/ivory kerbs, real turf photo, pit wall + catch-fence posts. */
async function circuit(asphalt) {
  const g = new THREE.Group();
  const turf = await photo('textures/terrain/grasslight-big.jpg', { srgb: true });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x8c8682, roughness: 1, metalness: 0 });
  if (asphalt?.map) { trackMat.map = tiled(asphalt.map, 100, 3.5); trackMat.roughnessMap = asphalt.rough ? tiled(asphalt.rough, 100, 3.5) : null; trackMat.roughness = 0.95; }
  const track = new THREE.Mesh(new THREE.PlaneGeometry(400, 14), trackMat); track.rotation.x = -Math.PI / 2; g.add(track);
  const kc = document.createElement('canvas'); kc.width = 256; kc.height = 32; const k = kc.getContext('2d'); for (let i = 0; i < 8; i++) { k.fillStyle = i % 2 ? '#a89c88' : '#6a121c'; k.fillRect(i * 32, 0, 32, 32); } // weathered ivory: no bright band under the title
  const kt = new THREE.CanvasTexture(kc); kt.wrapS = THREE.RepeatWrapping; kt.repeat.set(100, 1); kt.colorSpace = THREE.SRGBColorSpace;
  for (const z of [-7.6, 7.6]) { const kerb = new THREE.Mesh(new THREE.PlaneGeometry(400, 1.2), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.45 })); kerb.rotation.x = -Math.PI / 2; kerb.position.set(0, 0.03, z); g.add(kerb); }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshStandardMaterial({ map: tiled(turf, 180, 100), color: 0xb8a878, roughness: 0.95 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; g.add(grass);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(400, 1.1, 0.4), M.floor(0xb8b2a6)); wall.position.set(0, 0.55, -12); g.add(wall);
  const postGeo = new THREE.BoxGeometry(0.1, 3.5, 0.1); for (let i = 0; i < 40; i++) g.add(mesh(postGeo, M.matte(0x111111), { p: [-200 + i * 10, 2.2, -12.3] }));
  return g;
}

/** Sun disc + glow (real lens-flare sprite) kept at a fixed direction from the camera, so it sits on the photographed sun. */
async function sunSprite(dir, { color = 0xffc890, intensity = 5, size = 0.2, dist = 300 } = {}) {
  const tex = await photo('textures/lensflare/lensflare0.png', { srgb: true });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  s.scale.setScalar(size * dist); s.userData.follow = (cam) => s.position.copy(cam.position).addScaledVector(dir, dist); return s;
}
/** Graduated ND filter (as on a matte box): darkens the lower part of the frame, strongest at the bottom edge, so the
 *  lower-third title always sits on a calm, dark band. Full-screen clip-space quad drawn last; writes no depth. */
function gradND({ strength = 0.5, top = 0.42 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, uniforms: { k: { value: strength }, top: { value: top } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float k, top; varying vec2 vUv; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, k * smoothstep(top, 0.0, vUv.y)); }',
  }));
  m.frustumCulled = false; m.renderOrder = 999; return m;
}
/** World direction of a panorama feature (azimuth/elevation in the unrotated photo) after a yaw `rot`. */
function panoDir(azDeg, elDeg, rot) { const az = azDeg * DEG - rot, el = elDeg * DEG; return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); }

// ------------------------------------------------------------------------------------------------
export async function buildS8(ctx) {
  const shots = [];
  const [vase, shades, coneKit] = await Promise.all([prop('GlassVaseFlowers'), sunglasses(), trackCone(0.5)]);
  cheapGlass(vase, { opacity: 0.18 }); editMats(vase, (c, n) => { if (/Flowers/i.test(n)) c.color.set(0xd49a9a); }); // deeper rose petals
  // one lacquered walnut top: long boards along the desk's 2.4 m length (photo planks stretched to ~0.4 m wide boards, the
  // least knotty rows of the photo), dark walnut stain, low relief
  const deskWood = await woodMat({ color: 0x5c3a26, repeat: [0.8, 0.3], offset: [0.08, 0.7], bump: 0.22, coatRough: 0.05 });

  // ---------------------------------------------------------------- 8.1 key on the velvet tray → concierge desk
  const ks = makeSet(null); const K = ks.scene; const ROT1 = 1.9;
  await useHdri(K, HDRI.interiorWarm, { env: 0.42, background: true, blur: 0.32, bgIntensity: 0.075, rotation: ROT1 });
  const desk = mesh(new THREE.BoxGeometry(2.4, 0.06, 1.0), deskWood, { p: [0, -0.03, 0] }); K.add(desk);
  const vm = velvetMaps(); for (const t of [vm.map, vm.normalMap]) t.repeat.set(6, 6); // extrude UVs are metres: 17 cm tiles, ~2 cm crush, ~1.3 mm nap
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x3a0a12, map: vm.map, normalMap: vm.normalMap, normalScale: new THREE.Vector2(0.1, 0.1), roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color(0x8a2a38) });
  const tray = velvetTray(velvet); K.add(tray); const key = buildKey(); key.scale.setScalar(1.6); K.add(key);
  vase.position.set(0.25, 0, -0.26); vase.rotation.y = -0.5; K.add(vase);
  shades.position.set(-0.2, 0, 0.2); shades.rotation.y = 0.9; K.add(shades);
  const bell = new THREE.Group(); bell.position.set(0.36, 0, 0.1); K.add(bell); // concierge service bell: black base, gold dome, plunger
  bell.add(mesh(new THREE.CylinderGeometry(0.056, 0.06, 0.014, 48), M.blackGloss(), { p: [0, 0.007, 0] }));
  bell.add(mesh(lathe([[0.0001, 0], [0.05, 0], [0.05, 0.008], [0.042, 0.032], [0.026, 0.05], [0.01, 0.057], [0.0001, 0.058]], 48), M.goldPolished(), { p: [0, 0.014, 0] }));
  bell.add(mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.014, 12), M.chrome(), { p: [0, 0.078, 0] })); bell.add(mesh(new THREE.SphereGeometry(0.0065, 16, 8), M.blackGloss(), { p: [0, 0.087, 0], s: [1, 0.6, 1] }));
  // contact shadows baked from each prop's own geometry: tight dark rims where they touch the lacquer, soft occlusion around
  // plus a soft cast shadow away from the key spot
  const key1 = v3(0.3, 0.8, 0.5); const cast1 = (k) => ({ from: key1, k, reach: 0.035, spread: 0.3 });
  contactShadow(tray, { floorY: 0, reach: 0.006, spread: 0.7, cut: 4, res: 256, strength: 0.92, cast: cast1(0.6) });
  contactShadow(shades, { reach: 0.006, spread: 0.6, cut: 5, res: 192, strength: 0.85, cast: cast1(0.55) });
  contactShadow(vase, { reach: 0.006, spread: 0.6, cut: 3, res: 160, strength: 0.4, cast: cast1(0.28) }); // clear glass: a light shadow
  contactShadow(bell, { reach: 0.005, spread: 0.7, cut: 4, res: 160, strength: 0.92, cast: cast1(0.6) });
  const lampGlow = glow(0xffb870, 0.3, 1.0); lampGlow.position.set(-1.0, 0.47, 0.1); K.add(lampGlow); // the desk lamp, just off frame
  spot(K, { intensity: 2.6, pos: [0.3, 0.8, 0.5], target: [0, 0, 0], angle: 0.35, penumbra: 1, color: 0xffe0b0 });
  point(K, { intensity: 0.9, pos: [-1.0, 0.42, 0.1], color: 0xffb060 });
  ks.onUpdate((t) => { const k = easeOutQuint(clamp((t - 72.0) / 0.9)); key.position.set(lerp(0.05, 0.0, k), lerp(0.16, 0.032, k), lerp(-0.04, 0.0, k)); key.rotation.set(-Math.PI / 2 + lerp(0.6, 0, k), 0, lerp(0.5, 0.25, k)); });
  shots.push(shot('s8.1', 72.0, 73.8, ks, (lt, u, cam) => { const k = smooth(clamp((u - 0.45) / 0.55)); const d = aim(cam, v3(lerp(0.12, 0.6, k), lerp(0.12, 0.5, k), lerp(0.16, 0.9, k)), v3(0, 0.03, 0), { fov: 30, near: 0.005, far: 30 }); return { focus: d, aperture: lerp(10, 3, k) }; },
    { trans: { type: 'luma', dur: 0.6 }, grade: { exposure: 1.15, bloom: 0.5, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 8.2 enclosed carrier seals its doors (dusk, Venetian sunset sky)
  const tsS = makeSet(null, { fog: new THREE.FogExp2(0x3a2c30, 0.0045) }); const TR = tsS.scene; const ROT2 = 1.73;
  await useHdri(TR, HDRI.sunsetSea, { env: 0.55, background: true, blur: 0.035, bgIntensity: 0.3, rotation: ROT2 });
  TR.environment = await clampedEnv(ctx.renderer, HDRI.sunsetSea, 300);
  {
    const am = coneKit.asphalt; const gm = new THREE.MeshStandardMaterial({ color: 0x4a4542, roughness: 0.6, metalness: 0 });
    if (am?.map) { gm.map = tiled(am.map, 200, 200); if (am.rough) gm.roughnessMap = tiled(am.rough, 200, 200); }
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), gm); gr.rotation.x = -Math.PI / 2; TR.add(gr);
  }
  const trailer = new THREE.Group(); TR.add(trailer); const gloss = M.paint(0x050505, { metalness: 0.5 });
  trailer.add(mesh(rbox(12, 2.9, 2.55, 0.08, 4), gloss, { p: [0, 2.05, 0] }));
  for (const z of [-1.29, 1.29]) { trailer.add(mesh(new THREE.BoxGeometry(11.6, 0.03, 0.01), M.goldPolished(), { p: [0, 2.9, z] })); trailer.add(mesh(new THREE.BoxGeometry(11.6, 0.012, 0.01), M.goldPolished(), { p: [0, 2.84, z] })); }
  const em = mesh(new THREE.CircleGeometry(0.5, 64), emblemMaterial(), { p: [1.5, 2.1, 1.285] }); trailer.add(em);
  const wheel = trailerWheel(); // recessed machined rims, dark hubs, lug nuts (no flush mirror discs)
  for (const x of [-4.6, -3.4, 3.5, 4.7]) for (const z of [-1.0, 1.0]) { const w = wheel.clone(); w.position.set(x, 0.5, z); if (z < 0) w.rotation.y = Math.PI; trailer.add(w); }
  { // rubber wheel chocks behind the rear axle: the carrier is parked and secured for loading
    const cs = new THREE.Shape(); cs.moveTo(0, 0); cs.lineTo(0.3, 0); cs.lineTo(0.3, 0.022); cs.quadraticCurveTo(0.2, 0.08, 0.075, 0.19); cs.lineTo(0, 0.19); cs.closePath();
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.24, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 8 }); cg.translate(-5.06, 0.008, -0.12);
    const chockM = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.85, metalness: 0 });
    for (const z of [-1.0, 1.0]) { const ch = mesh(cg, chockM, { p: [0, 0, z] }); trailer.add(ch); contactShadow(ch, { floorY: 0, reach: 0.02, spread: 0.6, cut: 3, res: 96, strength: 0.85 }); }
  }
  { // vertical panel seams: a built body, not a single glossy box
    const seamM = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.7 }); const seamG = new THREE.BoxGeometry(0.014, 2.72, 0.006);
    for (let x = -4.8; x <= 5.5; x += 1.2) { if (Math.abs(x - 1.5) < 0.62) continue; for (const z of [-1.277, 1.277]) trailer.add(mesh(seamG, seamM, { p: [x, 2.05, z] })); }
  }
  for (const z of [-1.2, 1.2]) trailer.add(mesh(new THREE.BoxGeometry(5.6, 0.42, 0.04), M.blackSatin(), { p: [-0.2, 0.82, z] })); // side skirts
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c2d30, metalness: 0.85, roughness: 0.5 });
  trailer.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 2.3), darkSteel, { p: [-6.08, 0.48, 0] })); // underride bar: dark satin steel, no neon strip
  for (let i = 0; i < 6; i++) for (const z of [-1.3, 1.3]) trailer.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), M.emissive(0xffa040, 2.5), { p: [-5.2 + i * 2.1, 3.42, z] })); // clearance markers
  const cab = new THREE.Group(); cab.add(mesh(rbox(2.6, 3.1, 2.5, 0.2, 5), gloss, { p: [0, 1.9, 0] })); cab.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 2.2), M.glass(), { p: [1.31, 2.6, 0] })); cab.position.set(7.6, 0, 0); trailer.add(cab);
  const lockRodM = new THREE.MeshStandardMaterial({ color: 0x4a4b50, metalness: 1, roughness: 0.48 }); // dark brushed lock rods (not light strips)
  const doors = []; for (const s of [1, -1]) { const pivot = new THREE.Group(); pivot.position.set(-6.02, 2.05, s * 1.27); const leaf = mesh(rbox(0.06, 2.8, 1.26, 0.02, 3), gloss, { p: [0, 0, -s * 0.63] }); pivot.add(leaf); leaf.add(mesh(new THREE.BoxGeometry(0.02, 2.7, 0.02), M.rubber(), { p: [-0.03, 0, -s * 0.62] })); leaf.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 12), lockRodM, { p: [-0.05, 0, -s * 0.45] })); trailer.add(pivot); doors.push({ pivot, s }); }
  for (const z of [-1.0, 1.0]) { const tl = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.25), M.emissive(0xb0101a, 4), { p: [-6.05, 0.75, z] }); trailer.add(tl); }
  const interiorGlow = mesh(new THREE.PlaneGeometry(2.4, 2.7), M.emissive(0xffcf8a, 1.2), { p: [-5.9, 2.05, 0], r: [0, -Math.PI / 2, 0] }); trailer.add(interiorGlow);
  trailer.add(footShadow(13.5, 2.2, 0.85).translateX(0.6));
  spot(TR, { intensity: 220, pos: [-12, 5, 5], target: [-6, 2, 0], angle: 0.5, penumbra: 1, color: 0xffd9a8 });
  tsS.onUpdate((t) => { const k = easeInOutCubic(clamp((t - 73.6) / 1.1)); for (const d of doors) d.pivot.rotation.y = d.s * lerp(1.45, 0.0, k); interiorGlow.material.color.setRGB(1, 0.81, 0.54).multiplyScalar(1.2 * (1 - k * 0.9)); });
  shots.push(shot('s8.2', 73.8, 75.8, tsS, keyCam([v3(-9.6, 2.0, 2.8), v3(-12, 2.6, 6.0), v3(-19, 3.6, 10.5)], [v3(-6.05, 2.0, 0.0), v3(-5.0, 2.0, 0), v3(-1, 2.0, 0)], { fov: 36, aperture: (u) => lerp(8, 1.5, u), ease: (x) => easeInOutCubic(x), far: 1200 }),
    { trans: { type: 'zoom', dur: 0.5, center: [0.55, 0.5] }, grade: { exposure: 1.2, bloom: 0.5, streak: 0.18, threshold: 1.3, lift: [0.004, 0.005, 0.012] } }));

  // ---------------------------------------------------------------- 8.3 private track day at sunset (real golden-hour field)
  const tdS = makeSet(null, { fog: new THREE.Fog(0x9a8466, 70, 330) }); const TD = tdS.scene; const ROT3 = 3.24;
  { // the 4k photographic panorama as a sharp backdrop, sampled directly (same cached texture as S6/S7): no 4k PMREM to build
    const bg = (await photo('hdri/' + HDRI.sunriseField4k, { srgb: true, anisotropy: 4 })).clone(); bg.mapping = THREE.EquirectangularReflectionMapping;
    bg.wrapS = THREE.RepeatWrapping; bg.wrapT = THREE.ClampToEdgeWrapping; bg.needsUpdate = true;
    TD.background = bg; TD.backgroundBlurriness = 0; TD.backgroundIntensity = 0.72; TD.backgroundRotation = new THREE.Euler(0, ROT3, 0);
  }
  await useHdri(TD, HDRI.sunriseField, { env: 1.0, rotation: ROT3 }); TD.environment = await clampedEnv(ctx.renderer, HDRI.sunriseField, 30);
  const sunDir = panoDir(35.5, 8.1, ROT3);
  TD.add(await circuit(coneKit.asphalt)); const flag = flagMesh(); flag.position.set(2.2, 2.8, 6.5); TD.add(flag); TD.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 12), M.steel(), { p: [1.7, 1.7, 6.5] }));
  {
    // warm brushed-titanium paint; satin clear coat (0.22): a crisp sun glint, not a frame-filling bloom; dark glass, so seats
    // are all the cabin needs. Sits on its tyres with a contact shadow baked from its own underside.
    const hero = await conceptCar({ paint: 0xa08c76, metal: 0.5, rough: 0.4, coatRough: 0.22, lights: 1, cabin: false, shadow: 0.85 });
    softenGlints(hero, { rough: 0.16, coat: 0.22 }); hero.position.set(-4, 0, 3.5); hero.rotation.y = 0.55; TD.add(hero);
  }
  // procedural echelon: foot shadows drawn white-on-black (car.js contactShadow's alphaMap is all black, i.e. invisible)
  [['classic', 0x050505], ['prototype', 0xcdb48a], ['gt', 0x3d0b12], ['roadster', 0x101a14]].forEach(([p, c], j) => { const i = j + 1; const car = buildCar(p, { lite: true, color: c, seed: 170 + i }); car.group.position.set(-4 - i * 5.5, 0, 3.5); car.group.rotation.y = 0.55; car.lights(0.35, 1); softenGlints(car.group, { rough: 0.16, coat: 0.22 }); car.group.add(footShadow(car.spec.L, Math.max(...car.spec.W.map((q) => q[1])) * 2, 0.85)); TD.add(car.group); });
  // cone line along the far kerb (out of the lower-third title band during the reveal)
  for (let i = 0; i < 14; i++) { const c = coneKit.cone.clone(); c.position.set(6 - i * 3, 0, -6.7); c.rotation.y = i * 0.7; TD.add(c); }
  dirLight(TD, { color: 0xffb070, intensity: 0.6, pos: sunDir.clone().multiplyScalar(200).toArray() }); // softer sun key: smaller clear-coat glints
  const sun3 = await sunSprite(sunDir, { intensity: 5, size: 0.22 }); TD.add(sun3);
  TD.add(gradND({ strength: 0.5, top: 0.42 })); // 'Collect.' fades in over a calm dark band, not over the bright kerb
  tdS.onUpdate((t) => flag.userData.wave(t));
  const cam3 = keyCam([v3(3.6, 2.9, 8.2), v3(6, 3.5, 13), v3(10, 6.5, 20)], [v3(2.3, 2.75, 6.5), v3(-4, 1.5, 4), v3(-12, 0.5, 3)], { fov: 36, aperture: (u) => lerp(8, 1, smooth(u * 1.6)), ease: (x) => easeInOutCubic(x), far: 2000 });
  shots.push(shot('s8.3', 75.8, 77.8, tdS, (lt, u, cam) => { const r = cam3(lt, u, cam); sun3.userData.follow(cam); return r; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.15, threshold: 2.6, gain: [1.1, 1.0, 0.84], saturation: 1.08, contrast: 1.14 } }));

  // ---------------------------------------------------------------- 8.4 rotating platform, silent audience (photo-studio reflections)
  const rpS = makeSet(null); const RP = rpS.scene;
  await useHdri(RP, HDRI.studio, { env: 0.3, rotation: 0.4 });
  const tall = await hdri(HDRI.studioTall);
  const stage = new THREE.Group(); RP.add(stage); stage.add(mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.25, 128), M.blackGloss(), { p: [0, 0.125, 0] }));
  stage.add(mesh(new THREE.CylinderGeometry(3.31, 3.31, 0.05, 128, 1, true), M.titanium(), { p: [0, 0.03, 0] }));
  const sRing = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.015, 8, 200), M.emissive(0xffcf8a, 3)); sRing.rotation.x = Math.PI / 2; sRing.position.y = 0.25; stage.add(sRing);
  // the rare car sits on its tyres (precise tyre bounds), with a contact shadow baked from its own wheels and underside
  const rare = await conceptCar({ paint: 0xbf9f62, metal: 0.9, rough: 0.26, trim: 0x3d0b12, lights: 1, env: tall.pmrem, envI: 0.65, shadow: 0.95 }); rare.position.y = 0.25; stage.add(rare);
  // lacquered hardwood showroom floor, effectively endless: a radial black falloff from r≈4.6 m swallows the far floor and its
  // grazing reflections, so the stage sits in an infinite dark room (no slab edge, no grey horizon band)
  const floorR = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), await woodMat({ color: 0x3a2618, repeat: [112, 56], rot: Math.PI / 2, coatRough: 0.05, bump: 0.3 })); // boards run toward the lens (no brickwork at grazing angles) floorR.rotation.x = -Math.PI / 2; RP.add(floorR);
  const fade = floorFade(140, 4.0, 6.9); fade.position.y = 0.002; RP.add(fade);
  for (const [x, z] of [[0, 0], [-2.2, 1.5], [2.2, -1.5]]) { spot(RP, { intensity: 74, pos: [x * 0.4, 8, z * 0.4], target: [x * 0.3, 0.5, z * 0.3], angle: 0.32, penumbra: 0.6, color: 0xfff1dc }); const cone = lightCone(8, 2.6, 0xffe6c0, 0.05); cone.position.set(x * 0.4, 8, z * 0.4); RP.add(cone); }
  { // silent audience: seated in photoreal tufted armchairs (instanced), kept in silhouette (no environment light, black heads)
    const chair = await prop('ChairDamaskPurplegold'); hide(chair, /label/i);
    editMats(chair, (c, n) => { if (/fabric/i.test(n)) { c.map = null; c.metalnessMap = null; c.metalness = 0; c.color.set(0x24080c); c.sheenColor?.set(0x5a1a24); c.specularColor?.set(0xffffff); c.specularIntensity = 0.15; } envOn(c, RP, 0.03); }); // deep burgundy velvet (tufting relief kept; the model's purple sheen/specular tint removed), near silhouette
    const sil = envOn(new THREE.MeshPhysicalMaterial({ color: 0x0a0909, roughness: 0.75, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x7a6650) }), RP, 0); // black, only a fabric-sheen rim from the stage
    const mats = []; const aud = rng(9);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
      const f = buildFigure({ suit: aud() < 0.5 ? 0x0b0b0c : 0x16171b, gender: aud() < 0.35 ? 'f' : 'm' }); f.userData.pose(POSES.sitAudience);
      const x = -5.4 + i * 1.8 + (row % 2) * 0.9, z = 6.5 + row * 1.4, ry = Math.PI + (i - 3) * 0.06;
      f.position.set(x, 0, z); f.rotation.y = ry; f.traverse((o) => { if (o.isMesh) o.material = sil; }); RP.add(f);
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z).add(new THREE.Vector3(0, 0, 0.04).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
    }
    RP.add(instanced(chair, mats));
    spot(RP, { intensity: 40, pos: [0, 3.4, 4.0], target: [0, 1.0, 8.2], angle: 0.55, penumbra: 1, color: 0xffd9a0 }); // stage spill: a thin warm rim on shoulders and chair backs
  }
  rpS.onUpdate((t) => { stage.rotation.y = (t - 77.0) * 0.32; });
  shots.push(shot('s8.4', 77.8, 79.8, rpS, keyCam([v3(1.2, 1.6, 11.5), v3(0.2, 1.9, 10.6)], [v3(0, 0.9, 0), v3(0, 0.8, 0)], { fov: 32, aperture: 2.5, ease: (x) => x }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.2, bloom: 0.6, streak: 0.3, threshold: 1.1 } }));

  // ---------------------------------------------------------------- 8.5 certificate + gold wax seal
  const ce = makeSet(null); const CE = ce.scene;
  await useHdri(CE, HDRI.interiorWarm, { env: 0.36, background: true, blur: 0.32, bgIntensity: 0.04, rotation: ROT1 });
  const paperTex = drawTexture(1024, 1400, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h); g.globalAlpha = 0.05; for (let i = 0; i < 4000; i++) { g.fillStyle = i % 2 ? '#8a7a60' : '#ffffff'; g.fillRect((i * 997) % w, (i * 613) % h, 2, 2); } g.globalAlpha = 1;
    g.strokeStyle = '#b8964e'; g.lineWidth = 6; g.strokeRect(40, 40, w - 80, h - 80); g.lineWidth = 2; g.strokeRect(58, 58, w - 116, h - 116);
    g.fillStyle = '#2a2218'; g.textAlign = 'center'; g.font = `600 64px ${FONT_SERIF}`; g.fillText('CERTIFICATE', w / 2, 220); g.font = `500 40px ${FONT_SERIF}`; g.fillText('OF AUTHENTICITY', w / 2, 280);
    g.font = `italic 500 34px ${FONT_SERIF}`; g.fillText('Legend Paddock Club', w / 2, 360);
    g.fillStyle = '#5a4a38'; for (let i = 0; i < 9; i++) g.fillRect(150, 480 + i * 62, w - 300 - (i % 3) * 60, 3);
    g.strokeStyle = '#2a2218'; g.lineWidth = 3; g.beginPath(); g.moveTo(600, 1180); for (let i = 0; i < 40; i++) g.lineTo(600 + i * 6, 1180 + Math.sin(i * 0.9) * 18 - i * 0.6); g.stroke();
  });
  const paper = mesh(new THREE.PlaneGeometry(0.21, 0.29), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.85 }), { r: [-Math.PI / 2, 0, 0], p: [0, 0.0008, 0] }); CE.add(paper);
  const ps = rectShadow(0.21, 0.29, { soft: 0.0025, strength: 0.55 }); ps.position.y = 0.0002; CE.add(ps); // the sheet lies on the desk
  // darker walnut desk (deep shadow under the title band), same long-board layout as the concierge desk
  CE.add(mesh(new THREE.BoxGeometry(2.0, 0.04, 1.4), await woodMat({ color: 0x3a2418, repeat: [0.667, 0.42], offset: [0.08, 0.62], bump: 0.22, coatRough: 0.06 }), { p: [0, -0.02, -0.2] }));
  point(CE, { intensity: 0.8, pos: [-0.55, 0.42, -0.75], color: 0xffb060 });
  const key5 = buildKey(); key5.scale.setScalar(1.1); key5.rotation.set(-Math.PI / 2, 0, 2.72); key5.position.set(0.135, 0.0062, 0.04); CE.add(key5); // the key from 8.1, set down beside the papers
  const sealPos = v3(-0.045, 0, 0.09);
  const waxN = drawNormal(512, 512, (g, w) => { g.fillStyle = '#888'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, TAU); g.fill(); drawEmblem(g, w / 2, w / 2, w * 0.38, { fill: '#fff', stroke: '#fff' }); }, 5);
  // gold sealing wax (pigmented wax, not metal): half-metallic, satin, with a soft sheen; an irregular squeezed puddle with a
  // raised lip once pressed, a molten pool before. The embossed LPC emblem is the die's normal map on the pressed face.
  const waxMat = new THREE.MeshPhysicalMaterial({ color: 0xb98a3e, metalness: 0.45, roughness: 0.35, normalMap: waxN, normalScale: new THREE.Vector2(1.4, 1.4), clearcoat: 0.3, clearcoatRoughness: 0.28, sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffd28a) });
  const wax = new THREE.Mesh(waxGeo({ pressed: true, seed: 11 }), waxMat); wax.position.copy(sealPos).add(v3(0, 0.0008, 0)); CE.add(wax);
  const blob = new THREE.Mesh(waxGeo({ pressed: false, R: 0.0195, wob: 0.0016, top: 0.0042, seed: 11 }), new THREE.MeshPhysicalMaterial({ color: 0xb98a3e, metalness: 0.45, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.12, sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffd28a) }));
  blob.position.copy(sealPos).add(v3(0, 0.0008, 0)); CE.add(blob);
  contactShadow(wax, { floorY: 0, reach: 0.0012, spread: 0.6, cut: 3, res: 128, strength: 0.7, lift: 0.0001 }); contactShadow(blob, { floorY: 0, reach: 0.0012, spread: 0.6, cut: 3, res: 128, strength: 0.7, lift: 0.0001 });
  const stamp = new THREE.Group(); stamp.add(mesh(lathe([[0.0001, 0], [0.024, 0], [0.025, 0.004], [0.016, 0.02], [0.012, 0.07], [0.02, 0.1], [0.024, 0.12], [0.0001, 0.125]], 48), M.goldPolished())); stamp.add(mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.002, 48), emblemMaterial(), { p: [0, 0.0005, 0] })); CE.add(stamp);
  spot(CE, { intensity: 1.7, pos: [0.22, 0.48, 0.12], target: [-0.04, 0, 0.03], angle: 0.3, penumbra: 1, color: 0xffe0b0 }); // pool on seal + certificate, falling off before the near desk spot(CE, { intensity: 1.3, pos: [-0.4, 0.2, -0.3], target: [0, 0, -0.1], angle: 0.5, penumbra: 1, color: 0xffa860 }); // warm back fill: walnut grain beyond the sheet
  ce.onUpdate((t) => {
    const lt = t - 79.8; const down = easeInCubic(clamp(lt / 0.5)); const up = easeOutCubic(clamp((lt - 0.75) / 0.6)); const y = lerp(0.12, 0.004, down) + up * 0.14;
    stamp.position.set(sealPos.x, y, sealPos.z); const pressed = lt > 0.5; blob.visible = !pressed; wax.visible = pressed; const sp = 0.94 + 0.06 * smooth(clamp((lt - 0.5) / 0.15)); wax.scale.set(sp, 1, sp);
  });
  // press framing (79.8–81.0): seal and certificate in the upper two-thirds, the camera aimed ~3 cm in front of the seal so
  // the dark walnut in front of the sheet fills the lower-third title band; then the unchanged pull-back (k→1) into S9's match cut
  shots.push(shot('s8.5', 79.8, 82.0, ce, (lt, u, cam) => {
    const k = smooth(clamp((u - 0.55) / 0.45)); const p = v3(lerp(-0.02, 0.12, k), lerp(0.10, 0.32, k), lerp(0.26, 0.33, k));
    const d = aim(cam, p, v3(lerp(sealPos.x, -0.01, k), lerp(0.0, 0.01, k), lerp(sealPos.z + 0.03, 0.04, k)), { fov: 30, near: 0.005, far: 20 });
    return { focus: lerp(p.distanceTo(sealPos), d, k), aperture: lerp(10, 5, k) };
  }, { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.0, bloom: 0.4, streak: 0.2, threshold: 1.4, contrast: 1.1, gain: [1.06, 1.0, 0.9] } }));
  return { shots };
}
