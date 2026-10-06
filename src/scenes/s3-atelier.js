// SCENE 3 (18–30s) — THE ATELIER. Macro craft (panel gap, torque click, polish, paint gauge,
// pinstripe) then a pull-out onto a team of master craftsmen moving in sync around one car.
// Realism pass: the atelier is lit and reflected by real photographed interiors (HDR panoramas,
// graded to a moody low-key: lights kept at full HDR strength, walls and floors crushed), built
// from real photo materials (reclaimed brick walls, oiled plank floor, butcher-block bench) under
// photoreal brushed-copper barn lamps that rake real light down the brick; the macro stages are lit
// by a real photo studio so chrome, clear-coat and gold read photographic, with the workshop
// defocused behind them. Swirl marks are true clear-coat micro-scratches (they only appear inside
// the reflection of the light, as on real paint), and every figure / prop is grounded with contact
// shadows.
import { THREE, makeSet, spot, point, dust, shot, M, v3, clamp, smooth, lerp, rng, aim, lightStrip } from './common.js';
import { buildCar, contactShadow } from '../models/car.js';
import { buildFigure, POSES, buildHand } from '../models/figure.js';
import { buildGauge, buildTorqueWrench, buildHub, buildPolisher, buildStripingBrush, buildToolWall, buildToolChest } from '../models/props.js';
import { mesh, roundBox, patch, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { invLerp, easeOutCubic, TAU } from '../engine/util.js';
import { hdri, HDRI, photo, model, findIn } from '../engine/assets.js';

const BEAT = 2.0; // the ensemble moves on the score's 2-second bar

function openHood(car, angle) {
  const hood = car.panels.find((p) => p.name === 'hood'); const u = 0.43; const H = v3(car.shape.x(u), car.shape.top(u), 0);
  const q = new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), angle); const p = H.clone().sub(H.clone().applyQuaternion(q));
  hood.position.copy(p); hood.quaternion.copy(q);
}

function paintPanel(w = 0.8, h = 0.5, color = 0x050505, opts) {
  const geo = patch((u, v, o) => o.set((u - 0.5) * w, (v - 0.5) * h, -Math.pow((u - 0.5) * w, 2) * 0.3), 0, 1, 48, 0, 1, 24, { flip: false });
  return new THREE.Mesh(geo, M.paint(color, opts));
}

// ------------------------------------------------------------------------------------------------
// Photographic light

/**
 * A real HDR panorama re-graded for a low-key interior: pixels brighter than `lo..hi` (the lamps,
 * tubes, softboxes) keep their full photographed HDR value, everything else (walls / floor) is
 * crushed and warmed. Baked to a PMREM (reflections + IBL); yaw rotates the panorama. Cached.
 */
const _envs = new Map();
/** Diffusion-panel texture for a photographic softbox: soft falloff to the frame, slightly hot centre. */
const _sb = new Map();
function softboxTex(edge = 0.22, hot = 0.3) {
  const id = `${edge}|${hot}`; if (_sb.has(id)) return _sb.get(id);
  const w = 128, c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d'); const img = g.createImageData(w, w);
  const fall = (a) => 1 - smooth((Math.abs(a) - (1 - edge)) / edge);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const u = ((x + 0.5) / w) * 2 - 1, v = ((y + 0.5) / w) * 2 - 1; const k = fall(u) * fall(v) * (1 - hot + hot * (1 - u * u) * (1 - v * v)); const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; _sb.set(id, t); return t;
}
/** A softbox baked into an environment: centred on direction `dir`, long side along `long`; w/h are angular sizes (deg). */
function softbox({ dir = [0, 0, 1], long = [1, 0, 0], w = 40, h = 10, k = 4, color = 0xfff4e8, edge = 0.22, hot = 0.3 }) {
  const D = 20, Z = v3(...dir).normalize().negate(); const X = v3(...long); X.addScaledVector(Z, -X.dot(Z)).normalize(); const Y = new THREE.Vector3().crossVectors(Z, X);
  const rad = THREE.MathUtils.degToRad; const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * D * Math.tan(rad(w) / 2), 2 * D * Math.tan(rad(h) / 2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), map: softboxTex(edge, hot), side: THREE.DoubleSide }));
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); m.position.copy(Z).multiplyScalar(-D); return m;
}
/** Turn a scene's environment so its softbox (baked at +z, long side +x) is seen along reflection direction `rd`, long side `ad`. */
const _mR = new THREE.Matrix4();
function lockEnv(scene, rd, ad) {
  const Z = rd.clone().normalize(); const X = ad.clone().addScaledVector(Z, -ad.dot(Z)).normalize(); const Y = new THREE.Vector3().crossVectors(Z, X);
  scene.environmentRotation.setFromRotationMatrix(_mR.makeBasis(X, Y, Z));
}
/** Mirror direction of the view ray hitting a surface point p with normal n. */
const reflectDir = (camPos, p, n) => { const v = p.clone().sub(camPos).normalize(); return v.addScaledVector(n, -2 * v.dot(n)); };

async function gradedEnv(renderer, key, o = {}, boxes = []) {
  const id = key + JSON.stringify(o) + JSON.stringify(boxes); if (_envs.has(id)) return _envs.get(id);
  const { yaw = 0, wall = 0.12, floor = 0.05, lo = 1.2, hi = 5, max = 40, tint = [1, 0.86, 0.7], light = [1, 0.95, 0.88], gain = 1, size = 256, minY = -2 } = o;
  const H = await hdri(HDRI[key] ?? key);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: H.equirect }, minY: { value: minY }, yaw: { value: yaw }, wall: { value: wall }, floorK: { value: floor }, lo: { value: lo }, hi: { value: hi }, mx: { value: max }, gain: { value: gain }, tintC: { value: new THREE.Vector3(...tint) }, lightC: { value: new THREE.Vector3(...light) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `#include <common>
      uniform sampler2D map; uniform float yaw, wall, floorK, lo, hi, mx, gain, minY; uniform vec3 tintC, lightC; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float c = cos(yaw), s = sin(yaw); d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
        vec3 col = texture2D(map, equirectUv(d)).rgb; float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float keep = smoothstep(lo, hi, l) * smoothstep(minY, minY + 0.15, d.y); float base = mix(floorK, wall, smoothstep(-0.12, 0.06, d.y));
        col *= mix(base * tintC, lightC, keep);
        float k = max(max(col.r, col.g), col.b); if (k > mx) col *= mx / k;
        gl_FragColor = vec4(col * gain, 1.0);
      }`,
  });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 96, 48), mat)); for (const b of boxes) sc.add(softbox(b));
  const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(sc, 0, 0.1, 100, { size }).texture; pm.dispose(); mat.dispose();
  sc.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== mat) o.material.dispose(); } });
  _envs.set(id, tex); return tex;
}

// ------------------------------------------------------------------------------------------------
// Real-scale photo materials

/** Plane with UVs in real-world tiles, so a photo texture keeps its physical scale on any size. */
function tiledPlane(w, h, tile, off = [0, 0]) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile[0] + off[0], (uv.getY(i) * h) / tile[1] + off[1]);
  return g;
}
const tileBox = (geo, scale) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scale[0], uv.getY(i) * scale[1]); return geo; };

/** Large-scale weathering (soot towards the roof, damp near the floor, low-frequency patchiness)
 *  so a tiled photo never reads as a repeat. World-space, so walls of any size stay consistent. */
function weather(mat, { base = 0.62, top = [3.6, 7.2, 0.5], low = 0.9, mottle = 0.45, roughK = 1, key = 'weather' } = {}) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp;
      float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 q = vec2(vWp.x + vWp.z * 0.93, vWp.y); float n = wn(q * 0.31) * 0.55 + wn(q * 1.17 + 7.0) * 0.3 + wn(q * 4.3) * 0.15;
        float g = mix(1.0 - ${mottle.toFixed(3)}, 1.0, n); g *= mix(${base.toFixed(3)}, 1.0, smoothstep(0.0, ${low.toFixed(3)}, vWp.y));
        g *= mix(1.0, ${top[2].toFixed(3)}, smoothstep(${top[0].toFixed(3)}, ${top[1].toFixed(3)}, vWp.y)); diffuseColor.rgb *= g; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n      roughnessFactor = min(roughnessFactor * ${roughK.toFixed(3)}, 1.0);`); // lift a photo roughness map toward satin
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Normal map (RepeatWrapping) from a height function on a w×w grid. */
function normalTex(w, hfn, strength = 2, repeat = [1, 1]) {
  const H = new Float32Array(w * w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) H[y * w + x] = hfn(x, y);
  const c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d'); const img = g.createImageData(w, w); const d = img.data;
  const at = (x, y) => H[((y + w) % w) * w + ((x + w) % w)];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength; const l = Math.hypot(dx, dy, 1); const i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; return t;
}

/** Cotton twill (workwear). */
let _twill = null;
const twill = () => (_twill ??= (() => { const r = rng(77); const n = new Float32Array(128 * 128).map(() => r()); return normalTex(128, (x, y) => 0.5 + 0.4 * Math.sin(((x + y * 2) / 8) * TAU) + 0.18 * n[y * 128 + x], 0.9, [10, 10]); })());

/** Cotton jersey knit (conservator's glove): columns of interlocking V loops with fibre noise; one tile = 8×8 loops. */
let _knit = null;
const knitH = () => (_knit ??= (() => {
  const r = rng(41); const fib = Float32Array.from({ length: 128 * 128 }, () => r());
  return (x, y) => { const cx = (x % 16) / 16, cy = (y % 16) / 16; const side = cx < 0.5 ? cx * 2 : (1 - cx) * 2; // 0 at the loop edges, 1 at the column centre
    const leg = Math.sin(Math.PI * side) * (0.55 + 0.45 * Math.cos(TAU * (cy + side * 0.35))); return 0.6 * leg + 0.22 * fib[y * 128 + x] + 0.18 * fib[((y * 7) % 128) * 128 + ((x * 3) % 128)]; };
})());
const knitTex = (repeat) => normalTex(128, knitH(), 1.6, repeat);

/** Glove palm: a superellipsoid (squarish outline, gently domed back and front) instead of a flat-faced slab. */
function palmGeo(hx = 0.0425, hy = 0.0475, hz = 0.015) {
  const g = new THREE.SphereGeometry(1, 48, 32); const p = g.attributes.position; const sp = (v, e) => Math.sign(v) * Math.abs(v) ** e;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, hx * sp(p.getX(i), 0.4), hy * sp(p.getY(i), 0.42), hz * sp(p.getZ(i), 0.7));
  g.computeVertexNormals(); return g;
}

/** Soft contact-shadow decal textures: round ambient blob, and a tighter core for feet / knees on the boards. */
const _blobs = new Map();
function blobTex(core = 0.45, mid = 0.65) {
  const id = `${core}|${mid}`; if (_blobs.has(id)) return _blobs.get(id); const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(core, `rgba(255,255,255,${mid})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); _blobs.set(id, t); return t;
}
function blob(scene, x, z, sx, sz, k = 0.7, ry = 0, tex = blobTex()) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: k, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.004, z); m.renderOrder = 2; scene.add(m); return m;
}

/**
 * Ground a posed figure: drop it so its lowest leg point touches the boards, then lay a tight contact shadow under
 * every leg part that rests on the floor (soles, toes, a kneeling knee) — oriented to the footprint and pulled
 * slightly away from the key light — plus a faint ambient pool under the body. Legs do not animate, so this runs once.
 */
function groundFigure(scene, fig, key = v3(0, 6.5, 2.5)) {
  const J = fig.userData.J; fig.updateMatrixWorld(true);
  const legs = []; for (const s of [1, -1]) for (const j of [`hp${s}`, `kn${s}`, `an${s}`]) for (const o of J[j].children) if (o.isMesh) legs.push(o);
  const p = new THREE.Vector3(); let minY = Infinity;
  for (const o of legs) { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); minY = Math.min(minY, p.y); } }
  fig.position.y -= minY; fig.updateMatrixWorld(true);
  const contact = blobTex(0.35, 0.55);
  for (const o of legs) {
    const a = o.geometry.attributes.position; const pts = [];
    for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); if (p.y < 0.035) pts.push([p.x, p.z]); }
    if (pts.length < 3) continue;
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz); const ca = Math.cos(ang), sa = Math.sin(ang); let la = 0, lb = 0;
    for (const [x, z] of pts) { la = Math.max(la, Math.abs((x - cx) * ca + (z - cz) * sa)); lb = Math.max(lb, Math.abs(-(x - cx) * sa + (z - cz) * ca)); }
    const away = v3(cx - key.x, 0, cz - key.z).normalize();
    blob(scene, cx + away.x * 0.025, cz + away.z * 0.025, la * 2 + 0.12, lb * 2 + 0.09, 0.45, -ang, contact);
  }
  const h = new THREE.Vector3(); J.hips.getWorldPosition(h); const away = v3(h.x - key.x, 0, h.z - key.z).normalize();
  blob(scene, h.x + away.x * 0.08, h.z + away.z * 0.08, 0.62, 0.5, 0.22, -Math.atan2(away.z, away.x));
}

/** Linear AO strip where a wall meets the floor. */
let _aoStrip = null;
function wallAO(scene, len, pos, ry, depth = 0.9, k = 0.75) {
  if (!_aoStrip) { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 8, 128); _aoStrip = new THREE.CanvasTexture(c); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, depth), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: _aoStrip, transparent: true, opacity: k, depthWrite: false }));
  const grp = new THREE.Group(); grp.add(m); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.003, depth / 2); grp.position.set(...pos); grp.rotation.y = ry; m.renderOrder = 2; scene.add(grp); return grp;
}

// ------------------------------------------------------------------------------------------------
// Photoreal brushed-copper barn lamps (Khronos AnisotropyBarnLamp) wall-mounted over the tool walls

async function barnLampFactory(size, count) {
  const pool = await Promise.all(Array.from({ length: count }, () => model('AnisotropyBarnLamp', { size, axis: 'y' }))); const proto = pool[0]; proto.updateMatrixWorld(true);
  const fil = findIn(proto, /filament/i)[0]; const fc = new THREE.Box3().setFromObject(fil).getCenter(new THREE.Vector3());
  // the KHR transmission glass would add a full extra scene pass per frame: swap for a light frosted globe
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xfff1dc, roughness: 0.15, transparent: true, opacity: 0.4, depthWrite: false, emissive: 0xffc888, emissiveIntensity: 1.6 });
  let filament = null;
  return (wallPoint, n) => {
    const m = pool.pop();
    m.traverse((o) => { if (!o.isMesh) return; const nm = o.material.name || ''; if (/glass/i.test(nm)) o.material = glass; else if (/filament/i.test(nm)) { filament ??= Object.assign(o.material.clone(), { emissiveIntensity: 45 }); o.material = filament; } });
    m.rotation.y = Math.atan2(n.x, n.z) - Math.atan2(fc.x, fc.z); m.position.set(0, 0, 0); m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m); let d = Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) d = Math.min(d, x * n.x + y * n.y + z * n.z);
    m.position.copy(wallPoint).addScaledVector(n, -d); m.updateMatrixWorld(true);
    const bulb = fc.clone().applyMatrix4(m.matrixWorld); const g = glow(0xffc98a, size * 0.42, 1.1); g.position.copy(bulb).add(v3(0, -0.02, 0)); m.userData.bulb = bulb; m.userData.glow = g;
    return m;
  };
}

export async function buildS3(ctx) {
  const shots = []; const R = ctx.renderer;
  // real photographic light: the workshop hall (tube rows aligned with the car) and a dark photo studio for the macros
  const own = (t) => { const c = t.clone(); c.needsUpdate = true; return c; }; // private copies: other scenes may re-tile the shared cached photos
  // macro softboxes are baked into the real panoramas (three.js reflects only the environment): each sits where the
  // shot's mirror ray lands, so the clear coat shows a clean photographic softbox gradient instead of black.
  const POLISH_BOX = { dir: [0, 0.21, -0.978], long: [1, 0, 0], w: 120, h: 22, k: 0.7, color: 0xfff3e4, edge: 0.3, hot: 0.8 };
  const GAUGE_BOX = { dir: [0.53, 0.2, -0.82], long: [0.82, 0, 0.53], w: 50, h: 14, k: 0.42, color: 0xffe2c6, edge: 0.55, hot: 0.4 };
  const BAND = { dir: [0, 0, 1], long: [1, 0, 0], w: 110, h: 12, k: 7, color: 0xfff4e6, edge: 0.3, hot: 0.25 }; // long narrow strip, locked per frame
  const [envHall, envHallBg, envStudio, envGauge, envPolish, envBand, bd, bb, br, fd, fb, fr, makeLamp] = await Promise.all([
    gradedEnv(R, 'warehouse', { yaw: 0.75, wall: 0.1, floor: 0.045, lo: 1.4, hi: 6, max: 14, minY: 0.22 }),
    gradedEnv(R, 'warehouse', { yaw: 0.75, wall: 0.16, floor: 0.08, lo: 1.4, hi: 6, max: 3, minY: 0.22, tint: [1, 0.78, 0.55], light: [1, 0.85, 0.65], size: 128 }),
    gradedEnv(R, 'studio', { yaw: 1.51, wall: 0.12, floor: 0.05, lo: 1.5, hi: 8, max: 40, tint: [1, 0.9, 0.8], light: [1, 0.96, 0.9] }),
    gradedEnv(R, 'studio', { yaw: 0.6, wall: 0.25, floor: 0.08, lo: 1.5, hi: 8, max: 20, tint: [1, 0.92, 0.82], light: [1, 0.95, 0.88] }, [GAUGE_BOX]),
    gradedEnv(R, 'studio', { yaw: 2.47, wall: 0.08, floor: 0.03, lo: 1.5, hi: 8, max: 6, tint: [1, 0.95, 0.88], light: [1, 0.97, 0.94] }, [POLISH_BOX]),
    gradedEnv(R, 'warehouse', { yaw: 0.75, wall: 0.07, floor: 0.035, lo: 1.4, hi: 6, max: 0.2, minY: 0.22 }, [BAND]),
    photo('textures/brick_diffuse.jpg').then(own), photo('textures/brick_bump.jpg', { srgb: false }).then(own), photo('textures/brick_roughness.jpg', { srgb: false }).then(own),
    photo('textures/hardwood2_diffuse.jpg').then(own), photo('textures/hardwood2_bump.jpg', { srgb: false }).then(own), photo('textures/hardwood2_roughness.jpg', { srgb: false }).then(own),
    barnLampFactory(0.5, 7),
  ]);

  let _bt = null; const benchTopMat = () => (_bt ??= new THREE.MeshPhysicalMaterial({ map: fd, color: 0x6e5444, bumpMap: fb, bumpScale: 0.8, roughnessMap: fr, roughness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.2 }));

  // ======================================================================== the workshop
  const ws = makeSet(null, { envIntensity: 1.0 }); const W = ws.scene; W.environment = envHall;
  const car = buildCar('classic', { fasteners: false, seed: 31 }); W.add(car.group); W.add(contactShadow(car, 0.9)); openHood(car, 0.95);
  car.shell.material = new THREE.MeshBasicMaterial({ color: 0x000000 }); // shut-lines read as true black gaps
  { const tyre = M.tyre().clone(); tyre.color.set(0x0a0a0b); tyre.roughness = 0.88; tyre.normalScale = new THREE.Vector2(0.4, 0.4); car.group.traverse((o) => { if (o.material === M.tyre()) o.material = tyre; }); } // this car's own satin rubber
  // oiled plank floor (real photo: albedo / bump / roughness), dark-stained, satin varnish
  const floorMat = new THREE.MeshPhysicalMaterial({ map: fd, color: 0x4a3d38, bumpMap: fb, bumpScale: 0.5, roughnessMap: fr, roughness: 1, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  weather(floorMat, { base: 1, top: [50, 60, 1], low: 0.01, mottle: 0.3, roughK: 1.9, key: 'floorWeather' });
  const floor = new THREE.Mesh(tiledPlane(40, 26, [2.4, 1.2]), floorMat); floor.rotation.x = -Math.PI / 2; W.add(floor);
  // reclaimed brick walls (real photo), a closed room; ceiling with hanging linear fixtures
  const brickMat = weather(new THREE.MeshStandardMaterial({ map: bd, color: 0x9a7c70, bumpMap: bb, bumpScale: 2.0, roughnessMap: br, roughness: 1, metalness: 0, envMap: envHall, envMapIntensity: 2.4 }), { key: 'brickWeather' });
  const ROOM = { x0: -13, x1: 13, z0: -8, z1: 11, h: 7.2 };
  for (const [x, z, ry, w] of [[0, ROOM.z0, 0, 26], [0, ROOM.z1, Math.PI, 26], [ROOM.x0, 1.5, Math.PI / 2, 19], [ROOM.x1, 1.5, -Math.PI / 2, 19]]) {
    const wall = new THREE.Mesh(tiledPlane(w, ROOM.h, [2.25, 2.25], [x * 0.37, 0]), brickMat); wall.position.set(x, ROOM.h / 2, z); wall.rotation.y = ry; W.add(wall);
    wallAO(W, w, [x, 0, z], ry);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 19), M.matte(0x0b0b0c, 0.9)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.h, 1.5); W.add(ceil);
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.8, roughness: 0.4 });
  for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) {
    const hx = x * 4, hz = z * 4; W.add(mesh(roundBox(2.8, 0.09, 0.34, 0.02), housingMat, { p: [hx, 6.25, hz] }));
    lightStrip(W, { w: 2.6, h: 0.22, pos: [hx, 6.2, hz], rot: [Math.PI / 2, 0, 0], intensity: 4, color: 0xf6f3ec });
    for (const s of [-1, 1]) W.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, ROOM.h - 6.25, 4), housingMat, { p: [hx + s * 1.2, (ROOM.h + 6.25) / 2, hz] }));
  }
  // tool walls on the brick (oxblood lacquered pegboard), each raked by a barn lamp
  const boardMat = new THREE.MeshPhysicalMaterial({ color: 0x55232a, roughness: 0.55, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, normalMap: twill(), normalScale: new THREE.Vector2(0.08, 0.08) });
  const shadowBoard = (tw) => { tw.children[0].material = boardMat; return tw; };
  const lamps = [];
  // (one lamp + one real spot per tool wall keeps the light count — the dominant software-render cost — low)
  const wallSpots = []; const wallLights = (v) => { for (const l of wallSpots) l.visible = v; }; // off in the 3.1 macro: they light nothing in frame but cost a light pass per pixel
  const lampSpot = (b, n, aimDown, intensity = 22, angle = 1.0) => wallSpots.push(spot(W, { intensity, pos: b.toArray(), target: [b.x + n.x * 0.5, b.y - aimDown, b.z + n.z * 0.5], angle, penumbra: 0.75, color: 0xffc78a }));
  const mountLamp = (pt, n, aimDown = 1.7) => { const l = makeLamp(pt, n); W.add(l); W.add(l.userData.glow); lamps.push(l); if (aimDown) lampSpot(l.userData.bulb, n, aimDown); return l; };
  for (let i = -1; i <= 1; i++) {
    const tw = shadowBoard(buildToolWall(5.6, 2.2, 3 + i)); tw.position.set(i * 6.2, 1.7, ROOM.z0 + 0.05); W.add(tw);
    const l = mountLamp(v3(i * 6.2, 3.4, ROOM.z0), v3(0, 0, 1), 0); lampSpot(l.userData.bulb, v3(0, 0, 1), 1.5, 60, 1.2);
  }
  { const tw = shadowBoard(buildToolWall(5.6, 2.2, 9)); tw.position.set(ROOM.x0 + 0.05, 1.7, -2); tw.rotation.y = Math.PI / 2; W.add(tw); const l = mountLamp(v3(ROOM.x0, 3.4, -2), v3(1, 0, 0), 0); lampSpot(l.userData.bulb, v3(1, 0, 0), 1.5, 42, 1.2); }
  for (const z of [-3.6, 0.4, 4.4]) mountLamp(v3(ROOM.x1, 3.6, z), v3(-1, 0, 0), 2.2);
  // rolling tool cart beside the car: burgundy lacquered drawers, chrome pulls, a torque wrench and a spare knock-off spinner laid on the top
  const cart = new THREE.Group(); { const c = buildToolChest(); c.scale.set(0.62, 0.74, 0.8); cart.add(c);
    const tw0 = buildTorqueWrench(); tw0.rotation.set(Math.PI / 2, 0, 0.12); tw0.position.set(0.26, 0.852, 0.09); tw0.scale.setScalar(1.1); cart.add(tw0);
    const spin = new THREE.Group(); spin.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 6), M.goldPolished())); for (const s of [-1, 1]) spin.add(mesh(roundBox(0.11, 0.02, 0.03, 0.009), M.goldPolished(), { p: [s * 0.06, 0.005, 0], r: [0, 0, s * 0.25] }));
    spin.position.set(-0.2, 0.858, -0.12); spin.rotation.y = 0.4; cart.add(spin); }
  cart.rotation.y = 0.12; cart.position.set(-0.9, 0, -1.95); W.add(cart); blob(W, -0.9, -1.95, 1.1, 0.7, 0.5, -0.12, blobTex(0.4, 0.55));
  const chest = buildToolChest(); chest.position.set(5.5, 0, -6.6); W.add(chest); blob(W, 5.5, -6.6, 1.9, 1.0, 0.6);
  // upholstery bench: butcher-block top (real wood photo), dark steel legs
  const benchTop = benchTopMat();
  const bench = new THREE.Group(); bench.add(mesh(tileBox(roundBox(2.6, 0.08, 1.0, 0.02), [2.6 / 2.4, 1.0 / 1.2]), benchTop, { p: [0, 0.92, 0] })); for (const x of [-1.2, 1.2]) for (const z of [-0.4, 0.4]) bench.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), M.darkChrome(), { p: [x, 0.45, z] }));
  const benchSeat = new THREE.Group(); benchSeat.add(mesh(roundBox(0.5, 0.1, 0.48, 0.045), M.leather(0x5a2316))); benchSeat.add(mesh(roundBox(0.12, 0.6, 0.48, 0.05), M.leather(0x5a2316), { p: [-0.24, 0.28, 0], r: [0, 0, 0.2] })); benchSeat.position.set(0, 1.02, 0); benchSeat.rotation.y = 0.4; bench.add(benchSeat);
  bench.position.set(-5.5, 0, -5.0); W.add(bench); blob(W, -5.5, -5.0, 3.2, 1.5, 0.75);

  // the team (workwear twill instead of the mannequin finish; grounded with contact shadows)
  const team = [
    { k: 'mechanic', f: buildFigure({ suit: 0x22242a }), pose: 'kneel', pos: [1.25, 0, 1.5], ry: Math.PI, amp: { 'sh1': [-0.2, 0, 0], 'el1': [-0.25, 0, 0] } },
    { k: 'engine', f: buildFigure({ suit: 0x22242a }), pose: 'lean', pos: [1.05, 0, -1.3], ry: 0, amp: { 'el1': [0.25, 0, 0], 'el-1': [-0.2, 0, 0] } },
    { k: 'uph1', f: buildFigure({ suit: 0x2a2320, hair: 0x2b1d14, gender: 'f' }), pose: 'lean', pos: [-6.0, 0, -4.15], ry: Math.PI, amp: { 'sh1': [-0.5, 0, 0.2], 'el1': [-0.6, 0, 0] } },
    { k: 'uph2', f: buildFigure({ suit: 0x2a2320 }), pose: 'lean', pos: [-4.9, 0, -4.15], ry: Math.PI, amp: { 'sh-1': [-0.5, 0, -0.2], 'el-1': [-0.6, 0, 0] } },
    { k: 'body', f: buildFigure({ suit: 0x22242a }), pose: 'crouch', over: { 'kn-1': [2.33, 0, 0] }, pos: [-1.55, 0, 1.45], ry: Math.PI, amp: { 'sh1': [0.12, 0.25, 0], 'sh-1': [0.12, -0.25, 0] } }, // both soles level → both on the boards
    { k: 'tech', f: buildFigure({ suit: 0x1c1d22 }), pose: 'holdGlass', pos: [2.5, 0, 2.1], ry: Math.PI + 0.6, amp: { head: [0.12, 0, 0] } },
    { k: 'lead', f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), pose: 'gesture', pos: [3.6, 0, 2.3], ry: -2.25, amp: { 'sh1': [-0.25, 0, 0.1], 'el1': [-0.2, 0, 0], head: [0, 0.25, 0] } },
  ];
  const cloth = new Map(); const workwear = (c) => cloth.get(c) ?? cloth.set(c, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.88, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(c).lerp(new THREE.Color(0x9a8f80), 0.12), normalMap: twill(), normalScale: new THREE.Vector2(0.45, 0.45) })).get(c);
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.62, metalness: 0 });
  for (const m of team) {
    m.base = { ...POSES[m.pose], ...(m.over || {}) };
    m.f.position.set(...m.pos); m.f.rotation.y = m.ry; W.add(m.f);
    const suit = m.f.userData.J.hips.children[0].material; // the figure's suit material (shared by every suit mesh)
    m.f.traverse((o) => { if (o.isMesh && o.material === suit) o.material = workwear(suit.color.getHex()); });
    for (const s of [1, -1]) for (const o of m.f.userData.J[`an${s}`].children) if (o.isMesh) o.material = shoeMat;
    m.f.userData.pose(m.base); groundFigure(W, m.f); // feet on the boards; contact shadows under the real footprints
  }
  // the lead technician's closed leather folio, held flat in the palm (no screens in the atelier)
  const folioLeather = (c) => Object.assign(M.leather(c), { sheen: 0.1, roughness: 0.48 }); // deep oxblood, low sheen (no salmon cast under the warm lamps)
  const folio = new THREE.Group(); folio.add(mesh(roundBox(0.23, 0.31, 0.014, 0.006), folioLeather(0x1e070a))); folio.add(mesh(roundBox(0.012, 0.31, 0.018, 0.005), folioLeather(0x140507), { p: [-0.112, 0, 0] })); folio.add(mesh(new THREE.BoxGeometry(0.05, 0.006, 0.003), M.goldPolished(), { p: [0.05, 0.12, 0.0085] }));
  { const wr = team.find((m) => m.k === 'tech').f.userData.J['wr1']; folio.position.set(0.0, -0.095, 0.034); folio.rotation.set(-0.3, 0, 0.15); wr.add(folio); } // wrist frame: hand along -y, palm up (+z)
  const pol = buildPolisher(); pol.scale.setScalar(1.2); pol.position.set(-1.45, 0.62, 0.9); pol.rotation.set(0, 0, -Math.PI / 2 + 0.15); W.add(pol);
  spot(W, { intensity: 620, pos: [0, 6.5, 2.5], target: [0, 0.4, 0], angle: 0.8, penumbra: 0.9, color: 0xfff3e6 });
  spot(W, { intensity: 300, pos: [-6, 6.5, -2], target: [-5.5, 0.8, -5], angle: 0.6, penumbra: 0.9, color: 0xffe6c8 });
  spot(W, { intensity: 160, pos: [6, 4, 5], target: [0, 0.5, 0], angle: 0.6, penumbra: 1, color: 0xffcf96 });
  const dd = dust(W, { count: 300, box: [0, 2.5, 0, 14, 5, 10], size: 0.7, intensity: 0.45, res: ctx.res, seed: 31 });
  // pinstripe on the flank (grows during 3.5, visible afterwards)
  const stripeU0 = 0.28, stripeU1 = 0.55, stripePhi = 0.32, stripeW = 0.009;
  const stripeGeo = patch((u, v, o) => { car.shape.body(u, stripePhi + v * stripeW, o); const n = new THREE.Vector3(); car.shape.normal(u, stripePhi, n); o.addScaledVector(n, 0.0012); }, stripeU0, stripeU1, 300, 0, 1, 1, { flip: true });
  const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshPhysicalMaterial({ color: 0xd8ae62, metalness: 0.9, roughness: 0.22, clearcoat: 1 })); W.add(stripe);
  ws.onUpdate((t) => {
    dd.set(t); car.lights(0, 0);
    const ph = Math.sin(((t - 18) / BEAT) * TAU), ph2 = Math.sin(((t - 18) / BEAT) * TAU * 2);
    for (const m of team) {
      const p = { ...m.base }; for (const k in m.amp) { const b = p[k] || [0, 0, 0]; p[k] = b.map((v, i) => v + m.amp[k][i] * (m.k === 'body' ? ph2 : ph)); }
      m.f.userData.pose(p);
    }
    pol.userData.pad.rotation.y = t * 30; pol.position.x = -1.45 + Math.sin(((t - 18) / BEAT) * TAU * 2) * 0.12; pol.position.y = 0.62 + Math.cos(((t - 18) / BEAT) * TAU * 2) * 0.04;
    const sk = clamp((t - 21.7) / 1.4); stripe.geometry.setDrawRange(0, Math.floor(smooth(sk) * 300) * 6); stripe.visible = sk > 0;
  });

  // ---------------------------------------------------------------- 3.1 gloved fingertip on the panel gap
  // white cotton conservator's glove: jersey-knit normal at true loop scale (≈1 mm), soft cotton sheen, smooth palm
  const gloveMat = (repeat, k) => new THREE.MeshPhysicalMaterial({ color: 0x4f4c46, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color(0xc9c0b2), normalMap: knitTex(repeat), normalScale: new THREE.Vector2(k, k) });
  const gloveF = gloveMat([7.5, 5], 0.3), gloveP = gloveMat([25, 14], 0.4); // finger capsules · palm (both UV 0..1 round / along; palm ≈0.22 × 0.125 m)
  const gloveHand = () => {
    const h = buildHand({ material: gloveF, cuff: 0x1c1d22 }); const palm = h.children[0]; palm.geometry = palmGeo(); palm.material = gloveP;
    // finely tessellated finger capsules: the stock 10-sided ones intersect in a saw-tooth crease at every knuckle
    h.traverse((o) => { if (o.isMesh && o.material === gloveF && o.geometry.type === 'CapsuleGeometry') { const q = o.geometry.parameters; o.geometry = new THREE.CapsuleGeometry(q.radius, q.height, 8, 28); } });
    return h;
  };
  const hand = gloveHand(); W.add(hand); // under a dark workwear cuff
  hand.userData.setCurl([0.0, 1.0, 1.05, 1.1], 1.15);
  const gapU = 0.43 - 0.0011; const P = new THREE.Vector3(), N = new THREE.Vector3(), PB = new THREE.Vector3(), NB = new THREE.Vector3();
  const _mG = new THREE.Matrix4();
  const camAt = (k) => P.clone().addScaledVector(N, 0.16).add(v3(0.22, 0.035 - N.y * 0.16 - k * 0.015, 0)); // ahead of the gap, off the flank, just above the fingertip (no floor in frame)
  const handAt = (k) => {
    const phi = lerp(0.5, 0.1, k); car.shape.body(gapU, phi, P); car.shape.normal(gapU, phi, N);
    // index finger points into the gap; the curled fist turns its little-finger side to the camera so the fingertip stays in view
    const Y = N.clone().multiplyScalar(-1).add(v3(0.25, -0.35, 0)).normalize(); const c = camAt(k).sub(P); const X = c.addScaledVector(Y, -c.dot(Y)).normalize();
    X.applyAxisAngle(Y, 0.55); const Z = new THREE.Vector3().crossVectors(X, Y); hand.quaternion.setFromRotationMatrix(_mG.makeBasis(X, Y, Z));
    const tip = v3(-0.03, 0.093 + 0.046, 0).applyQuaternion(hand.quaternion);
    hand.position.copy(P).addScaledVector(N, 0.006).sub(tip); return phi;
  };
  /** Lock the long softbox band of envBand onto the flank at (u, phi): the black shut-line then cuts through a bright band. */
  const bandOn = (cam, u, phi) => {
    car.shape.body(u, phi, PB); car.shape.normal(u, phi, NB); const a = car.shape.body(u + 0.01, phi, new THREE.Vector3()), b = car.shape.body(u - 0.01, phi, new THREE.Vector3());
    W.environment = envBand; W.environmentIntensity = 1; lockEnv(W, reflectDir(cam.position, PB, NB), a.sub(b));
  };
  const hallEnv = () => { W.environment = envHall; W.environmentIntensity = 1; W.environmentRotation.set(0, 0, 0); };
  shots.push(shot('s3.1', 18.0, 19.1, ws, (lt, u, cam) => {
    hand.visible = true; wallLights(false); const k = smooth(clamp((lt + 0.2) / 1.5)); const phi = handAt(k); const tipP = P.clone();
    // ahead of the gap and off the flank: the fingertip meets the shut-line in profile, the hand rising out of frame behind it
    const camP = camAt(k); const tgt = tipP.clone().add(v3(-0.03, 0.006, -0.012));
    const d = aim(cam, camP, tgt, { fov: 32, near: 0.01, far: 80, roll: 0.03 }); cam.updateMatrixWorld();
    bandOn(cam, 0.43, phi - 0.06); // the band crosses the gap just under the fingertip
    return { focus: d, aperture: 10 };
  }, { prep: () => { hand.visible = true; }, trans: { type: 'zoom', dur: 0.6, center: [0.5, 0.5] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.15, threshold: 1.4, gain: [0.98, 1.0, 1.04] } }));

  // macro stages: real studio light, the workshop defocused behind
  const macroSet = (env, envI, bgI) => { const s = makeSet(null, { envIntensity: envI }); s.scene.environment = env; s.scene.background = envHallBg; s.scene.backgroundBlurriness = 0.3; s.scene.backgroundIntensity = bgI; return s; };

  // ---------------------------------------------------------------- 3.2 torque wrench click
  const tw = macroSet(envStudio, 0.5, 0.1); const hub = buildHub(); tw.scene.add(hub); const wrench = buildTorqueWrench(); tw.scene.add(wrench);
  { // macro fidelity: lathe-turned concentric finish on the flange, chamfered hex nuts
    const r = rng(9); const rings = Float32Array.from({ length: 2048 }, () => r());
    // anisotropy direction map: tangential everywhere (concentric turning marks → radial 'bow-tie' highlights)
    const aw = 256, ac = document.createElement('canvas'); ac.width = ac.height = aw; const ag = ac.getContext('2d'); const aimg = ag.createImageData(aw, aw);
    for (let y = 0; y < aw; y++) for (let x = 0; x < aw; x++) { const a = Math.atan2(y - aw / 2 + 0.5, x - aw / 2 + 0.5), i = (y * aw + x) * 4, ring = rings[Math.floor(Math.hypot(x - aw / 2, y - aw / 2) * 4) % 2048]; aimg.data[i] = (-Math.sin(a) * 0.5 + 0.5) * 255; aimg.data[i + 1] = (Math.cos(a) * 0.5 + 0.5) * 255; aimg.data[i + 2] = 215 + ring * 40; aimg.data[i + 3] = 255; }
    ag.putImageData(aimg, 0, 0); const anisoMap = new THREE.CanvasTexture(ac); anisoMap.colorSpace = THREE.NoColorSpace; anisoMap.anisotropy = 8;
    hub.children[0].material = new THREE.MeshPhysicalMaterial({ color: 0xa9aaae, metalness: 1, roughness: 0.34, anisotropy: 0.8, anisotropyMap: anisoMap });
    const h = 0.016, rr = 0.0125, c = 0.0022; const nutGeo = lathe([[0.0056, -h / 2], [rr - c, -h / 2], [rr, -h / 2 + c], [rr, h / 2 - c], [rr - c * 1.3, h / 2], [0.0058, h / 2], [0.0056, h / 2 - 0.001]], 6, Math.PI / 6).toNonIndexed(); nutGeo.computeVertexNormals();
    for (const n of hub.userData.nuts) n.geometry = nutGeo;
  }
  const nut = hub.userData.nuts[0]; wrench.position.copy(nut.position).add(v3(0, 0, 0.03));
  spot(tw.scene, { intensity: 2.2, pos: [0.3, 0.6, 0.6], target: [0, 0.05, 0], angle: 0.4, penumbra: 1, color: 0xf4f6ff });
  spot(tw.scene, { intensity: 1.6, pos: [-0.6, -0.2, 0.3], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffc58a });
  const flashL = point(tw.scene, { intensity: 0, color: 0xfff0d0, pos: [0.02, 0.1, 0.08] });
  tw.onUpdate((t) => {
    const lt = t - 19.1; const turn = smooth(clamp(lt / 0.5)) * 0.35; const click = lt > 0.55 ? Math.exp(-(lt - 0.55) * 16) * Math.sin((lt - 0.55) * 90) * 0.025 : 0;
    wrench.rotation.z = 2.6 - turn + click; flashL.intensity = lt > 0.55 ? Math.exp(-(lt - 0.55) * 20) * 0.08 : 0;
  });
  shots.push(shot('s3.2', 19.1, 20.0, tw, (lt, u, cam) => {
    const k = smooth(u); const base = nut.position; const p = v3(base.x + lerp(0.2, 0.26, k), base.y + lerp(0.12, 0.05, k), base.z + lerp(0.26, 0.3, k));
    const d = aim(cam, p, v3(base.x - lerp(0.02, 0.12, k), base.y - lerp(0.0, 0.08, k), base.z + 0.03), { fov: 32, near: 0.005, far: 20, roll: -0.08 }); return { focus: d, aperture: 9 };
  }, { trans: { type: 'whip', dur: 0.35, dir: [-1, 0] }, grade: { exposure: 1.1, bloom: 0.4, streak: 0.18, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.3 micro-polisher removing swirl marks
  // A mirror-black clear coat under a large softbox (baked into envPolish at the camera's mirror point) and two bare
  // bulbs: swirl marks are random micro-scratches in the clear-coat normal, so like on real paint they break the
  // softbox gradient and flare into holograms around each bulb's highlight; the pad leaves the coat optically flat.
  const PW = 1.6, PH = 1.2, SW_TILE = 0.25; // panel (m), metres per swirl tile
  const ps = macroSet(envPolish, 1.0, 0.08); const panel = paintPanel(PW, PH, 0x050505, { roughness: 0.12, metalness: 0.05, clearcoatRoughness: 0.02 }); panel.rotation.x = -Math.PI / 2; ps.scene.add(panel);
  panel.material.specularIntensity = 0.15; // the pigment layer barely reflects: the mirror is the clear coat, so the softbox stays crisp, not hazy
  const swirlN = (() => {
    const w = 1024, c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, w); const r = rng(5);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineCap = 'round';
    for (let i = 0; i < 1400; i++) {
      const cx = w * r(), cy = w * r(), rad = 30 + r() * 320, a0 = r() * TAU, a1 = a0 + 0.2 + r() * 0.7; g.lineWidth = 1.0 + r() * 1.1;
      // every arc is drawn at its 9 periodic images, so the height field wraps and the tiled map has no seams
      for (const dx of [-w, 0, w]) for (const dy of [-w, 0, w]) { const x = cx + dx, y = cy + dy; if (x + rad < 0 || x - rad > w || y + rad < 0 || y - rad > w) continue; g.beginPath(); g.arc(x, y, rad, a0, a1); g.stroke(); }
    }
    const px = g.getImageData(0, 0, w, w).data; return normalTex(w, (x, y) => px[(y * w + x) * 4] / 255, 1.0, [PW / SW_TILE, PH / SW_TILE]);
  })();
  const pm = panel.material; pm.clearcoatNormalMap = swirlN; pm.clearcoatNormalScale = new THREE.Vector2(0.35, 0.35); const clearX = { value: -1 };
  pm.onBeforeCompile = (s) => {
    s.uniforms.clearX = clearX;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWx;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWx = (modelMatrix * vec4(transformed, 1.0)).x;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWx; uniform float clearX;').replace('#include <clearcoat_normal_fragment_maps>', `
      float swirlK = smoothstep(clearX - 0.03, clearX + 0.06, vWx); // 0 behind the pad (corrected), 1 ahead (swirled)
      #ifdef USE_CLEARCOAT_NORMALMAP
        vec3 clearcoatMapN = texture2D(clearcoatNormalMap, vClearcoatNormalMapUv).xyz * 2.0 - 1.0;
        clearcoatMapN.xy *= clearcoatNormalScale * swirlK;
        clearcoatNormal = normalize(tbn2 * clearcoatMapN);
      #endif`).replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n      material.clearcoatRoughness = min(material.clearcoatRoughness + 0.06 * swirlK, 1.0); // swirled coat reads hazy');
  };
  pm.customProgramCacheKey = () => 's3swirl2'; pm.needsUpdate = true;
  const polisher = buildPolisher(); ps.scene.add(polisher);
  polisher.userData.pad.children[0].material = Object.assign(M.velvet(0x2c070c), { sheenColor: new THREE.Color(0x8c2a36), sheenRoughness: 0.45 });
  // bare bulbs far behind the panel, placed so their highlights fall on the swirled paint ahead of the pad
  point(ps.scene, { intensity: 1.4, pos: [0.33, 0.2, -1.35], decay: 0, color: 0xfff1de });
  point(ps.scene, { intensity: 0.55, pos: [-0.2, 0.22, -0.9], decay: 0, color: 0xffe2c0 });
  // kicker from behind camera-left: separates the pad edge and the gold ring from the dark background
  const kick = spot(ps.scene, { intensity: 0.9, pos: [-0.42, 0.2, 0.42], target: [0, 0.03, 0], angle: 0.32, penumbra: 0.8, color: 0xffe0bc });
  ps.onUpdate((t) => {
    const lt = t - 20.0; const x = lerp(-0.32, 0.25, smooth(clamp((lt + 0.2) / 1.2))); polisher.position.set(x + Math.sin(lt * 9) * 0.006, 0.0, 0.02 + Math.cos(lt * 9) * 0.006); polisher.userData.pad.rotation.y = lt * 40; clearX.value = x - 0.05;
    kick.target.position.set(polisher.position.x, 0.03, polisher.position.z); kick.target.updateMatrixWorld();
  });
  shots.push(shot('s3.3', 20.0, 20.9, ps, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.05, 0.1, u), 0.07, 0.3), v3(lerp(-0.12, 0.05, u), 0.0, 0.0), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.18, threshold: 1.5 } }));

  // ---------------------------------------------------------------- 3.4 paint thickness gauge (analogue)
  // the burgundy clear coat reflects a low softbox (baked into envGauge behind the probe) and the probe's own
  // mirror image, so the tip visibly meets the paint; a small spot lights the contact point.
  const gs = macroSet(envGauge, 0.8, 0.1); gs.scene.backgroundRotation = new THREE.Euler(0, 2.2, 0); const gp = paintPanel(1.0, 0.6, 0x3d0b12); gp.rotation.x = -Math.PI / 2; gs.scene.add(gp);
  const gauge = buildGauge({ min: 0, max: 500, major: 100, minor: 20, label: 'µm', sub: 'paint depth', radius: 0.045 }); gauge.position.set(0.09, 0.07, -0.06); gauge.rotation.set(-0.5, -0.3, 0); gs.scene.add(gauge);
  const probe = new THREE.Group(); probe.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 32), M.matte(0x111111, 0.4), { p: [0, 0.05, 0] })); probe.add(mesh(new THREE.CylinderGeometry(0.009, 0.003, 0.012, 32), M.chrome(), { p: [0, 0.006, 0] })); probe.add(mesh(new THREE.TorusGeometry(0.0092, 0.0012, 8, 32), M.goldPolished(), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] }));
  probe.rotation.z = 0.3; gs.scene.add(probe);
  // planar reflection for free: mirror each vertex through the paint plane, then project it back onto the plane along the view ray
  const mirrorMat = (col, op) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { col: { value: new THREE.Color(col) }, op: { value: op } },
    vertexShader: `varying float vH; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vH = w.y; w.y = -w.y;
      float s = (cameraPosition.y - 0.0004) / max(cameraPosition.y - w.y, 1e-4); w.xyz = cameraPosition + (w.xyz - cameraPosition) * s; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 col; uniform float op; varying float vH; void main(){ gl_FragColor = vec4(col, op * (1.0 - smoothstep(0.0, 0.11, vH))); }`,
  });
  const probeImg = probe.clone(); const imgMats = [mirrorMat(0x000000, 0.72), mirrorMat(0x2a1a18, 0.6), mirrorMat(0x9a7438, 0.6)]; // the chrome tip mirrors the dark burgundy
  probeImg.children.forEach((c, i) => { c.material = imgMats[i]; c.renderOrder = 3; }); gs.scene.add(probeImg);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(-0.03, 0.1, 0), v3(-0.02, 0.15, -0.05), v3(0.06, 0.12, -0.09), v3(0.09, 0.06, -0.07)]), 40, 0.002, 6), M.matte(0x0a0a0a, 0.5)); gs.scene.add(cable);
  spot(gs.scene, { intensity: 1.6, pos: [0.2, 0.5, 0.4], target: [0.04, 0.02, -0.03], angle: 0.45, penumbra: 1, color: 0xfff0dc });
  spot(gs.scene, { intensity: 1.2, pos: [-0.4, 0.2, -0.3], target: [0.05, 0.05, -0.05], angle: 0.5, penumbra: 1, color: 0xffb46a });
  spot(gs.scene, { intensity: 1.1, pos: [-0.07, 0.13, 0.12], target: [0, 0, 0], angle: 0.22, penumbra: 1, color: 0xfff2e0 }); // contact point
  gs.onUpdate((t) => { const lt = t - 20.9; const touch = smooth(clamp(lt / 0.3)); probe.position.set(0, lerp(0.02, 0.0, touch), 0); probeImg.position.copy(probe.position); const v = touch * (118 + Math.exp(-lt * 6) * Math.sin(lt * 26) * 30); gauge.userData.setValue(Math.max(0, v)); });
  shots.push(shot('s3.4', 20.9, 21.7, gs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.12, -0.09, u), 0.05, 0.16), v3(lerp(0.0, 0.07, smooth(u)), lerp(0.01, 0.05, smooth(u)), lerp(0.0, -0.05, smooth(u))), { fov: 30, near: 0.005, far: 20 });
    return { focus: lerp(0.2, d, smooth((u - 0.3) * 2.5)), aperture: 16 };
  }, { trans: { type: 'luma', dur: 0.35 }, grade: { exposure: 1.1, bloom: 0.4, streak: 0.15, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.5 needle-fine pinstripe (on the car itself)
  const brush = buildStripingBrush(); W.add(brush);
  brush.children[3].material = new THREE.MeshPhysicalMaterial({ color: 0x2e1a10, roughness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.08 }); // lacquered handle
  brush.children[0].material = new THREE.MeshPhysicalMaterial({ color: 0xa47c3c, metalness: 0.55, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color(0xd8b070) }); // squirrel-hair sword, wet with gold enamel
  brush.children[1].scale.set(1.25, 1.9, 1.25); brush.children[1].material = brush.children[0].material; // a longer bead of wet gold at the tip
  // the striper's gloved hand pinching the handle above the ferrule (palm toward the car, back of the glove to camera)
  const brushHand = new THREE.Group(); W.add(brushHand); const hand2 = gloveHand(); hand2.userData.setCurl([0.5, 0.72, 0.98, 1.08], 0.85, 0.12); hand2.position.set(0.048, -0.118, -0.024); brushHand.add(hand2);
  const FLANK = v3(0.25, 0.55, 0.8).normalize(); const _mH = new THREE.Matrix4();
  const stripeAt = (k, o) => { const u = lerp(stripeU0, stripeU1, k); car.shape.body(u, stripePhi + stripeW / 2, o); return u; };
  const placeBrush = (t) => {
    const k = smooth(clamp((t - 21.7) / 1.4)); const tip = new THREE.Vector3(); const u = stripeAt(k, tip); const n = new THREE.Vector3(); car.shape.normal(u, stripePhi, n);
    const nc = n.clone().multiplyScalar(0.25).addScaledVector(FLANK, 0.75).normalize(); // steadied normal: no camera swing over the wheel-arch crest
    brush.position.copy(tip).addScaledVector(n, 0.001); const ax = nc.clone().multiplyScalar(0.45).add(v3(-0.75, 0.45, 0)).normalize(); brush.quaternion.setFromUnitVectors(v3(0, 1, 0), ax); // handle leads, bristles drag
    // pen grip: fingers run down the handle toward the tip (y), the handle lies along the thumb/index side, back of the glove to camera
    const Y = ax.clone().negate(); const Z = nc.clone().addScaledVector(ax, -nc.dot(ax)).normalize().negate().applyAxisAngle(Y, -1.0); const X = new THREE.Vector3().crossVectors(Y, Z); // palm toward the paint, turned so the thumb and index pinch in view
    brushHand.quaternion.setFromRotationMatrix(_mH.makeBasis(X, Y, Z)); brushHand.position.copy(brush.position).addScaledVector(ax, 0.082);
    const lift = smooth(clamp((t - 23.1) / 0.5)); if (lift > 0) { const o = v3(-0.3, 0.55, 0.15).multiplyScalar(lift); brush.position.add(o); brushHand.position.add(o); } // stroke done: the brush lifts off the paint
    return { tip, n: nc, u };
  };
  /** 3.5 framing: above the flank, ahead of the brush, looking back along the stripe (pull = 0..1 opens into the 3.6 pull-out). */
  const stripeCam = (tip, n, pull = 0) => tip.clone().addScaledVector(n, 0.24 + pull * 1.0).add(v3(0.075, 0.035 + pull * 0.45, -0.035));
  const stripeTgt = (tip) => tip.clone().add(v3(-0.03, 0.006, -0.034)); // aimed slightly inboard: the lower frame stays on the flank, not the floor beyond it
  // the fender louvres (blocky end-on reflections, read as stray studs in the macro) sit out the close-up
  const louvres = []; car.group.traverse((o) => { if (o.isMesh && o.material.color?.getHex() === 0x010101) louvres.push(o); });
  const showLouvres = (v) => { for (const o of louvres) o.visible = v; };
  shots.push(shot('s3.5', 21.7, 23.0, ws, (lt, u, cam, t) => {
    hand.visible = false; brush.visible = brushHand.visible = true; showLouvres(false); wallLights(true); const { tip, n, u: su } = placeBrush(t);
    const d = aim(cam, stripeCam(tip, n), stripeTgt(tip), { fov: 30, near: 0.005, far: 80 }); cam.updateMatrixWorld();
    bandOn(cam, su, stripePhi + 0.07); W.environmentIntensity = 0.6; // a soft strip whose reflection runs just above the stripe
    return { focus: d, aperture: 10 };
  }, { prep: (lt, u, t) => { hand.visible = false; brush.visible = brushHand.visible = true; showLouvres(false); }, trans: { type: 'whip', dur: 0.3, dir: [-1, 0.1] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.1, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.6 pull out: the team, orbit, crane up
  shots.push(shot('s3.6', 23.0, 30.0, ws, (lt, u, cam, t) => {
    hand.visible = false; const { tip, n, u: su } = placeBrush(t); brush.visible = brushHand.visible = lt < 1.2; showLouvres(lt > 0.6); wallLights(true);
    const k = clamp(u); const orbitA = lerp(0.2, -1.9, smooth(invLerp(0.12, 0.72, k))); const R = lerp(0.3, 7.5, easeOutCubic(invLerp(0.0, 0.25, k)));
    let p = v3(Math.sin(orbitA) * R, lerp(0.8, 2.2, smooth(invLerp(0.05, 0.3, k))), Math.cos(orbitA) * R + 0.4);
    const crane = smooth(invLerp(0.7, 1.0, k)); p = p.lerp(v3(-2.5, 6.4, 9.5), crane);
    if (k < 0.2) p = stripeCam(tip, n, k / 0.1).lerp(p, smooth(invLerp(0.06, 0.2, k))); // one continuous move from the stripe macro into the orbit
    const tgt = new THREE.Vector3().lerpVectors(stripeTgt(tip), v3(-0.5, 0.6, -0.6), smooth(invLerp(0.0, 0.2, k))).lerp(v3(-1.0, 0.0, -2.0), crane);
    const d = aim(cam, p, tgt, { fov: lerp(30, 40, smooth(k * 3)), near: 0.01, far: 120 }); cam.updateMatrixWorld();
    if (lt < 0.35) { bandOn(cam, su, stripePhi + 0.07); W.environmentIntensity = 0.6; } else hallEnv(); // the macro strip hands over to the hall light once the camera is off the flank
    return { focus: d, aperture: lerp(10, 1.2, smooth(k * 4)) };
  }, { prep: () => { hand.visible = false; showLouvres(true); }, trans: { type: 'cut', dur: 0 }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.12, threshold: 1.5, gain: [0.98, 1.0, 1.03] } }));
  // hide macro rigs when not used
  shots[0].prep = () => { hand.visible = true; brush.visible = brushHand.visible = false; showLouvres(true); };
  return { shots, car };
}
