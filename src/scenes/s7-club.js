// SCENE 7 (62–72s) — THE CLUB. Crystal clink, numbered metal card on dark wood, watch on a wrist at
// the gear lever, a handshake by a car door → the members' lounge: fireplace, leather, cars beyond glass.
//
// Realism pass: every macro is lit and reflected by a real photographed interior (Poly Haven HDR
// panorama, re-graded low-key so only its window and wall sconces survive as light: they glint in
// the crystal, the titanium, the lacquered walnut and the gold); the handshake car is the photoreal
// CarConcept in burgundy, mirroring a real industrial hall's ceiling-light rows. Real photo materials
// (hardwood planks, reclaimed brick) replace the procedural surfaces at true physical scale. The
// lounge is furnished with photoreal models (carved-wood leather sofa, champagne velvet sofa, silk
// pouf, Tiffany lamps, flowers, a heritage bellows camera), opens through steel windows onto a real
// night-sky photograph over lit cars, and is reflected in itself by a probe baked from the room.
import { THREE, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, easeInOutCubic } from './common.js';
import { buildFigure, POSES, buildHand } from '../models/figure.js';
import { mesh, roundBox, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { drawTexture, drawNormal, drawEmblem, FONT_SERIF, guilloche, fromHeight, fromFn, tex } from '../engine/textures.js';
import { easeOutCubic, TAU, noise1, fbm2 } from '../engine/util.js';
import { hdri, HDRI, photo, model, hide, selectVariant } from '../engine/assets.js';

// ------------------------------------------------------------------------------------------------
// Photographic light

/**
 * A real HDR panorama re-graded for a low-key interior: pixels brighter than lo..hi (windows, lamps,
 * tubes) keep their photographed HDR value, everything else is crushed and warmed. Baked to a PMREM.
 */
const _envs = new Map();
async function gradedEnv(renderer, name, o = {}) {
  const id = name + JSON.stringify(o); if (_envs.has(id)) return _envs.get(id);
  const { wall = 0.06, floor = 0.03, lo = 1, hi = 4, floorKeep = 0.25, tint = [1, 0.8, 0.6], light = [1, 0.93, 0.82], max = 40, gain = 1, size = 256 } = o;
  const H = await hdri(name);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: H.equirect }, wall: { value: wall }, floorK: { value: floor }, lo: { value: lo }, hi: { value: hi }, floorKeep: { value: floorKeep }, mx: { value: max }, gain: { value: gain }, tintC: { value: new THREE.Vector3(...tint) }, lightC: { value: new THREE.Vector3(...light) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `#include <common>
      uniform sampler2D map; uniform float wall, floorK, lo, hi, floorKeep, mx, gain; uniform vec3 tintC, lightC; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); vec3 c = texture2D(map, equirectUv(d)).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float up = smoothstep(-0.12, 0.04, d.y); float keep = smoothstep(lo, hi, l) * mix(floorKeep, 1.0, up);
        c *= mix(mix(floorK, wall, up) * tintC, lightC, keep);
        float k = max(max(c.r, c.g), c.b); if (k > mx) c *= mx / k;
        gl_FragColor = vec4(c * gain, 1.0);
      }`,
  });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 96, 48), mat));
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(sc, 0, 0.1, 100, { size }).texture; pm.dispose(); mat.dispose();
  _envs.set(id, t); return t;
}

/** Use a PMREM as a set's environment (+ optional defocused photographic backdrop). */
function lightWith(scene, env, { k = 1, rot = 0, bg = 0, blur = 0.4 } = {}) {
  scene.environment = env; scene.environmentIntensity = k; scene.environmentRotation.set(0, rot, 0);
  if (bg > 0) { scene.background = env; scene.backgroundBlurriness = blur; scene.backgroundIntensity = bg; scene.backgroundRotation.set(0, rot, 0); }
}
/** Per-material reflection strength (three ignores envMapIntensity unless envMap is set on the material). */
function envK(mat, scene, k) { mat.envMap = scene.environment; mat.envMapIntensity = k * scene.environmentIntensity; mat.envMapRotation.copy(scene.environmentRotation); mat.needsUpdate = true; return mat; }

// ------------------------------------------------------------------------------------------------
// Real-scale photo materials

/** Plane whose UVs are in real-world tiles (photo textures keep their physical scale on any size). */
const tilePlane = (w, h, tw, th = tw) => { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tw, (uv.getY(i) * h) / th); return g; };

async function photoMaps(kind, { repeat = [1, 1], rotation = 0, offset = [0, 0] } = {}) {
  const b = `textures/${kind}_`;
  const src = await Promise.all([photo(b + 'diffuse.jpg'), photo(b + 'bump.jpg', { srgb: false }), photo(b + 'roughness.jpg', { srgb: false })]);
  return src.map((t) => { const c = t.clone(); c.repeat.set(...repeat); c.offset.set(...offset); c.center.set(0.5, 0.5); c.rotation = rotation; return c; });
}
/** Real hardwood (planks, knots, grain) stained dark and lacquered; or real brick. */
async function photoMat(kind, { color = 0xffffff, bump = 1, rough = 1, clearcoat = 0, ccRough = 0.1, sheen = 0, ...o } = {}) {
  const [map, bumpMap, roughnessMap] = await photoMaps(kind === 'wood' ? 'hardwood2' : 'brick', o);
  return new THREE.MeshPhysicalMaterial({ color, map, bumpMap, bumpScale: bump, roughnessMap, roughness: rough, metalness: 0, clearcoat, clearcoatRoughness: ccRough, sheen, sheenColor: new THREE.Color(0x6a4a3a) });
}

/** Normal map from a height function (RepeatWrapping). */
function heightNormal(w, fn, strength = 2, repeat = [1, 1]) {
  const H = new Float32Array(w * w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) H[y * w + x] = fn(x, y);
  return tex(fromHeight(H, w, w, strength), { repeat });
}
let _weave = null, _pores = null;
const weave = () => (_weave ??= heightNormal(128, (x, y) => 0.5 + 0.35 * Math.sin(((x + y * 2) / 6) * TAU) + 0.2 * fbm2(x / 2, y / 2, 2, 7, 64), 1.1, [1, 1]));
const pores = () => (_pores ??= heightNormal(256, (x, y) => fbm2(x / 3, y / 3, 3, 11, 256 / 3) * 0.7 + fbm2(x / 22, y / 9, 2, 13, 256 / 22) * 0.3, 0.9, [1, 1]));

const goldMat = (rough = 0.1, color = 0xe2b872) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough });
let _skinA = null;
const skinAlbedo = () => (_skinA ??= tex(fromFn(256, 256, (x, y, o) => { const n = fbm2(x / 18, y / 18, 4, 31, 256 / 18), f = fbm2(x / 3, y / 3, 2, 33, 256 / 3); const k = 0.84 + n * 0.2 + f * 0.06; o[0] = clamp(k * 250, 0, 255); o[1] = clamp(k * (232 - n * 34), 0, 255); o[2] = clamp(k * (220 - n * 40), 0, 255); o[3] = 255; }), { srgb: true }));
const skinMat = () => new THREE.MeshPhysicalMaterial({ color: 0x8c6a5a, map: skinAlbedo(), roughness: 0.6, metalness: 0, normalMap: pores(), normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xb08878), clearcoat: 0.06, clearcoatRoughness: 0.45 });
const woolMat = (color) => { const n = weave().clone(); n.repeat.set(26, 18); return new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45), sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0x8a8f9a), 0.35) }); };
const cottonMat = () => { const n = weave().clone(); n.repeat.set(40, 10); return new THREE.MeshPhysicalMaterial({ color: 0xece7de, roughness: 0.78, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(0.3, 0.3), sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) }); };

// ------------------------------------------------------------------------------------------------
// Crystal and champagne

function coupeProfile() {
  const P = [[0.0001, 0], [0.036, 0], [0.039, 0.0015], [0.036, 0.004], [0.012, 0.008], [0.0045, 0.016], [0.0038, 0.06], [0.0054, 0.07], [0.0038, 0.08], [0.004, 0.1], [0.007, 0.108]];
  const E = (a, b, f) => [a * Math.sin(f), 0.16 - b * Math.cos(f)];
  for (let i = 1; i <= 18; i++) P.push(E(0.062, 0.052, 0.16 + (Math.PI / 2 - 0.16) * (i / 18)));
  P.push([0.0628, 0.1615], [0.0618, 0.1625]);
  for (let i = 18; i >= 0; i--) P.push(E(0.0605, 0.0485, 0.05 + (Math.PI / 2 - 0.05) * (i / 18)));
  P.push([0.0001, 0.1115]); return P;
}
// clear crystal: no diffuse, only its Fresnel reflections and glints are added over what lies behind
const crystalMat = () => new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.0, transparent: true, blending: THREE.AdditiveBlending, ior: 1.5, specularIntensity: 0.55, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });

/** Champagne coupe (rim at height h): crystal, champagne, rising bead trains and a fine mousse ring. */
export function crystalGlass(h = 0.19, { bubbles = 48, seed = 5 } = {}) {
  const g = new THREE.Group(); const yF = 0.149;
  const glass = mesh(lathe(coupeProfile(), 72), crystalMat()); glass.renderOrder = 3; g.add(glass);
  const lq = [[0.0001, 0.1121]]; const fF = Math.acos((0.16 - yF) / 0.0485);
  for (let i = 0; i <= 14; i++) { const f = 0.05 + (fF - 0.05) * (i / 14); lq.push([0.0602 * Math.sin(f), 0.16 - 0.0482 * Math.cos(f)]); }
  lq.push([0.0001, yF]);
  const lqGeo = lathe(lq, 64);
  const tintL = mesh(lqGeo, new THREE.MeshBasicMaterial({ color: 0xe6b45a, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false })); tintL.renderOrder = 1; g.add(tintL); // light through champagne turns gold
  const glowL = mesh(lqGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.11, 0.028), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glowL.renderOrder = 1; g.add(glowL); // light scattered inside
  const surf = mesh(lathe([[0.0001, yF], [0.0601 * Math.sin(fF), yF]], 64), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); surf.renderOrder = 2; g.add(surf); // meniscus reflections
  const rF = 0.0602 * Math.sin(fF);
  const mousse = mesh(new THREE.TorusGeometry(rF - 0.0011, 0.0009, 6, 72), new THREE.MeshPhysicalMaterial({ color: 0xfff4dc, roughness: 0.5, transparent: true, opacity: 0.75, depthWrite: false }), { p: [0, yF, 0], r: [Math.PI / 2, 0, 0] });
  mousse.renderOrder = 2; g.add(mousse);
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.84).multiplyScalar(1.15), transparent: true, opacity: 0.9, depthWrite: false }), bubbles);
  bub.renderOrder = 2; bub.frustumCulled = false; g.add(bub);
  const r = rng(seed); const trains = Array.from({ length: 4 }, () => [r.range(-0.006, 0.006), r.range(-0.006, 0.006), r.range(0.45, 0.7)]); const ph = Array.from({ length: bubbles }, () => r());
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  g.userData.update = (t) => {
    for (let i = 0; i < bubbles; i++) {
      const [bx, bz, sp] = trains[i % trains.length]; const k = (t * sp + ph[i]) % 1; const y = 0.1125 + k * (yF - 0.1135);
      const wob = Math.sin(t * 9 + i) * 0.0004 * k; pv.set(bx * (1 + k * 1.5) + wob, y, bz * (1 + k * 1.5)); sv.setScalar(0.00035 + k * 0.0006);
      m4.compose(pv, q, sv); bub.setMatrixAt(i, m4);
    }
    bub.instanceMatrix.needsUpdate = true;
  };
  g.userData.update(0); g.scale.setScalar(h / 0.1625); return g;
}

// ------------------------------------------------------------------------------------------------
// Watch, wrist and tailoring (real scale, metres)

let _dial = null;
function dialTextures() {
  if (_dial) return _dial;
  const map = drawTexture(512, 512, (g, w) => {
    const c = w / 2; const grd = g.createRadialGradient(c, c, 0, c, c, c); grd.addColorStop(0, '#1b1612'); grd.addColorStop(0.75, '#0d0b0a'); grd.addColorStop(1, '#060505');
    g.fillStyle = grd; g.fillRect(0, 0, w, w); g.strokeStyle = '#cfa862'; g.fillStyle = '#cfa862';
    for (let i = 0; i < 60; i++) { if (i % 5 === 0) continue; const a = (i / 60) * TAU; g.lineWidth = 2.2; g.beginPath(); g.moveTo(c + Math.sin(a) * c * 0.895, c - Math.cos(a) * c * 0.895); g.lineTo(c + Math.sin(a) * c * 0.955, c - Math.cos(a) * c * 0.955); g.stroke(); }
    g.lineWidth = 1.6; for (const k of [0.965, 0.885]) { g.beginPath(); g.arc(c, c, c * k, 0, TAU); g.stroke(); }
    drawEmblem(g, c, c - c * 0.4, c * 0.17, { fill: '#cfa862', stroke: '#cfa862' });
  });
  _dial = { map, normalMap: tex(fromHeight(guilloche(512, 46), 512, 512, 1.2, false)) }; return _dial;
}

const handGeo = (len, w, tail) => {
  const s = new THREE.Shape(); s.moveTo(0, -tail); s.lineTo(w, len * 0.14); s.lineTo(0, len); s.lineTo(-w, len * 0.14); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.00012, bevelEnabled: true, bevelThickness: 0.00018, bevelSize: 0.00014, bevelSegments: 1 }); geo.rotateX(-Math.PI / 2); return geo;
};

/** Gold dress watch, real scale (case Ø 39 mm). Face +y, 12 o'clock toward -z, crown +x. */
function luxuryWatch() {
  const g = new THREE.Group(); const R = 0.0195; const gold = goldMat(0.07), satin = goldMat(0.24), applied = goldMat(0.17, 0xf2cc8c);
  g.add(mesh(lathe([[0.0001, -0.0045], [R * 0.9, -0.0045], [R * 1.02, -0.0037], [R * 1.075, -0.0015], [R * 1.08, 0.0015], [R * 1.06, 0.0032], [R * 1.02, 0.0042], [R * 0.985, 0.0047], [R * 0.955, 0.0047], [R * 0.95, 0.004]], 128), gold));
  g.add(mesh(new THREE.TorusGeometry(R * 1.0, 0.00045, 8, 128), satin, { p: [0, 0.0044, 0], r: [Math.PI / 2, 0, 0] }));
  const { map, normalMap } = dialTextures();
  g.add(mesh(new THREE.CircleGeometry(R * 0.955, 96), new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.22, 0.22), metalness: 0.5, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.1 }), { p: [0, 0.0036, 0], r: [-Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU; const rr = R * 0.73;
    for (const o of i === 0 ? [-0.0011, 0.0011] : [0]) { const b = mesh(new THREE.BoxGeometry(i % 3 ? 0.0009 : 0.0012, 0.0006, i % 3 ? 0.0034 : 0.0044), applied); b.position.set(Math.sin(a) * rr + Math.cos(a) * o, 0.0039, -Math.cos(a) * rr + Math.sin(a) * o); b.rotation.y = -a; g.add(b); }
  }
  const hh = new THREE.Group(); hh.position.y = 0.0042; hh.add(mesh(handGeo(R * 0.5, 0.0012, 0.002), applied)); g.add(hh);
  const mh = new THREE.Group(); mh.position.y = 0.0046; mh.add(mesh(handGeo(R * 0.8, 0.001, 0.0026), applied)); g.add(mh);
  const sh = new THREE.Group(); sh.position.y = 0.005; sh.add(mesh(new THREE.BoxGeometry(0.00022, 0.00018, R * 0.98), gold, { p: [0, 0, -(R * 0.49 - 0.0042)] })); sh.add(mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.0002, 20), gold, { p: [0, 0, 0.0034] })); g.add(sh);
  g.add(mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.0012, 20), gold, { p: [0, 0.0051, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0028, 22), new THREE.MeshPhysicalMaterial({ color: 0xe2b872, metalness: 1, roughness: 0.14, flatShading: true }), { p: [R * 1.08 + 0.0019, 0, 0], r: [0, 0, Math.PI / 2] }));
  g.add(mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0016, 12), gold, { p: [R * 1.08 + 0.0002, 0, 0], r: [0, 0, Math.PI / 2] }));
  for (const sx of [1, -1]) for (const sz of [1, -1]) g.add(mesh(roundBox(0.0032, 0.0034, 0.0085, 0.0011, 2), gold, { p: [sx * 0.0112, -0.0012, sz * (R + 0.0028)], r: [sz * 0.22, 0, 0] }));
  const th = 0.26, Rc = (R * 0.955) / Math.sin(th);
  const cr = mesh(new THREE.SphereGeometry(Rc, 96, 10, 0, TAU, 0, th), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: 0.05, clearcoat: 1, specularIntensity: 1, ior: 1.76, depthWrite: false }), { p: [0, 0.0043 - Rc * Math.cos(th), 0] });
  cr.renderOrder = 2; g.add(cr);
  g.userData = { R, set: (sec) => { sh.rotation.y = -(sec / 60) * TAU; mh.rotation.y = -((sec / 3600) % 1) * TAU; hh.rotation.y = -((sec / 43200) % 1) * TAU; } };
  g.userData.set(10 * 3600 + 9 * 60 + 12); return g;
}

/** Tube swept along +x through stations [x, ky, kz] with a super-elliptic cross-section (seam underneath). */
function sweepX(stations, ry, rz, { n = 64, p = 2.6, uvScale = [1, 1], deform = null } = {}) {
  const pos = [], uv = [], idx = [];
  stations.forEach(([x, ky, kz], i) => {
    for (let j = 0; j <= n; j++) { const th = Math.PI + (j / n) * TAU; const c = Math.cos(th), s = Math.sin(th); const d = deform ? deform(x, c, s, j / n) : 1; pos.push(x, ry * ky * d * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), rz * kz * d * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)); uv.push((j / n) * uvScale[0], (i / (stations.length - 1)) * uvScale[1]); }
  });
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const supPt = (th, ry, rz, p = 2.6) => { const c = Math.cos(th), s = Math.sin(th); return [ry * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)]; };

/** Leather strap ribbon along a y–z path (thickness grows outward), with saddle-stitching along both edges. */
function strap(points, cy, w, t, leather, thread) {
  const cv = new THREE.CatmullRomCurve3(points.map(([y, z]) => new THREE.Vector3(0, y, z))); const L = cv.getLength(); const segs = 48;
  const frame = (u) => { const p = cv.getPointAt(u), tg = cv.getTangentAt(u); let ny = tg.z, nz = -tg.y; if (ny * (p.y - cy) + nz * p.z < 0) { ny = -ny; nz = -nz; } return { p, tg, ny, nz }; };
  const pos = [], uv = [], idx = [];
  for (const [l0, l1] of [[[-1, 0], [1, 0]], [[1, 1], [-1, 1]], [[-1, 1], [-1, 0]], [[1, 0], [1, 1]]]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) { const u = i / segs; const { p, ny, nz } = frame(u); for (const [sx, k] of [l0, l1]) { pos.push((sx * w) / 2, p.y + ny * t * k, p.z + nz * t * k); uv.push((u * L) / 0.03, sx > 0 ? 1 : 0); } }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = new THREE.Group(); const m = new THREE.Mesh(geo, leather); m.material.side = THREE.DoubleSide; g.add(m);
  const nSt = Math.floor((L * 0.55) / 0.0027); const st = new THREE.InstancedMesh(new THREE.BoxGeometry(0.00045, 0.0003, 0.0017), thread, nSt * 2); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let k = 0; for (let i = 0; i < nSt; i++) { const u = 0.03 + (i * 0.0027) / L; const { p, tg, ny, nz } = frame(u); e.set(Math.atan2(-tg.y, tg.z), 0, 0); q.setFromEuler(e); for (const sx of [1, -1]) { m4.compose(new THREE.Vector3(sx * (w / 2 - 0.0014), p.y + ny * t * 1.02, p.z + nz * t * 1.02), q, new THREE.Vector3(1, 1, 1)); st.setMatrixAt(k++, m4); } }
  g.add(st); return g;
}

/** Gold cufflink with the LPC emblem in relief; face toward +z. */
let _emblemN = null;
function cufflink(r = 0.0074) {
  _emblemN ??= drawNormal(256, 256, (g) => { g.fillStyle = '#fff'; drawEmblem(g, 128, 128, 112, { fill: '#fff', stroke: '#fff' }); }, 3);
  const g = new THREE.Group(); const gold = goldMat(0.12);
  g.add(mesh(new THREE.CylinderGeometry(r, r * 0.96, 0.0022, 48), gold, { r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CircleGeometry(r * 0.94, 48), new THREE.MeshPhysicalMaterial({ color: 0xd9ad62, metalness: 1, roughness: 0.22, normalMap: _emblemN, normalScale: new THREE.Vector2(0.9, 0.9) }), { p: [0, 0, 0.00112] }));
  return g;
}

/** Fountain pen (black resin, gold furniture), lying along +x with its clip on top. */
function fountainPen() {
  const inner = new THREE.Group(); const resin = new THREE.MeshPhysicalMaterial({ color: 0x050404, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }); const gold = goldMat(0.1);
  inner.add(mesh(lathe([[0.0001, 0], [0.0042, 0.001], [0.0058, 0.008], [0.0061, 0.07], [0.0001, 0.07]], 48), resin));
  inner.add(mesh(lathe([[0.0001, 0.0695], [0.0066, 0.0695], [0.0068, 0.134], [0.0058, 0.1405], [0.0001, 0.142]], 48), resin));
  for (const [y, rr] of [[0.0712, 0.0068], [0.0752, 0.0068], [0.004, 0.0048]]) inner.add(mesh(new THREE.TorusGeometry(rr, 0.00065, 8, 48), gold, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
  inner.add(mesh(roundBox(0.0026, 0.05, 0.0012, 0.0005, 2), gold, { p: [0, 0.111, 0.0074] })); inner.add(mesh(new THREE.SphereGeometry(0.0021, 16, 10), gold, { p: [0, 0.087, 0.0073] }));
  inner.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); const g = new THREE.Group(); g.add(inner); return g;
}

/** Hide the geometry of glTF nodes whose name matches, without hiding their child nodes (CarConcept's root node is a mesh
 *  that parents the whole car). Multi-primitive nodes are a Group of 'mesh_N' primitives named after the node. */
const EMPTY = new THREE.BufferGeometry();
function dropParts(root, re) {
  root.traverse((o) => { if (!o.isMesh) return; const node = !o.name || /^mesh_\d+/.test(o.name) ? o.parent?.name || '' : o.name; if (!re.test(node)) return; if (o.children.length) o.geometry = EMPTY; else o.visible = false; });
}

// ------------------------------------------------------------------------------------------------
// Photoreal concept car (Khronos CarConcept), cleaned for the brief: no logos/plates/display, palette paint, cheap dark glass.
async function conceptCar({ paint = 0x3d0b12, metal = 0.7, rough = 0.3, length = 4.45, drop = null } = {}) {
  const m = await model('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Graphite');
  const done = new Map();
  const fix = (mat) => {
    if (done.has(mat)) return done.get(mat); const n = mat.name || ''; const c = mat.clone();
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); }
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.62; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; }
    if (/Paint 1/i.test(n)) { c.color.set(paint); c.metalness = metal; c.roughness = rough; c.clearcoat = 1; c.clearcoatRoughness = 0.03; c.iridescence = 0; }
    if (/Paint 2/i.test(n)) { c.color.set(0x050506); c.metalness = 0.2; c.roughness = 0.25; c.clearcoat = 1; c.clearcoatRoughness = 0.04; c.iridescence = 0; }
    if (/Interior 3/i.test(n)) c.color.set(0x3d0b12);
    if (/Headlight|Signallight|Brakelight/i.test(n)) c.emissiveIntensity = 0.05;
    done.set(mat, c); return c;
  };
  m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material); });
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorFloor|InteriorCage|InteriorSteering|BodyWindshieldWipers|BodyHood(Interior|Under)|Wheel.*BrakePad)/);
  if (drop) dropParts(m, drop); // parts the camera cannot see (software renderer: fewer draws, less overdraw)
  m.rotation.y = Math.PI / 2; const holder = new THREE.Group(); holder.add(m); return holder;
}

/** Photoreal model with any punctual lights it ships with removed (we light the set ourselves). */
async function prop(name, opts) { const m = await model(name, opts); const ls = []; m.traverse((o) => { if (o.isLight) ls.push(o); }); for (const l of ls) l.parent.remove(l); return m; }
/** Replace KHR transmission glass with cheap transparent glass (no extra transmission render pass). */
function cheapGlass(root, { opacity = 0.22, color = 0xffffff } = {}) {
  root.traverse((o) => { if (!o.isMesh) return; const f = (m) => { if (!m.transmission) return m; const c = m.clone(); c.transmission = 0; c.thickness = 0; c.transparent = true; c.opacity = opacity; c.color.set(color); c.roughness = 0.02; c.depthWrite = false; return c; }; o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
  return root;
}
function tintMats(root, re, fn) { root.traverse((o) => { if (!o.isMesh) return; const f = (m) => { if (!re.test(m.name || '')) return m; const c = m.clone(); fn(c); return c; }; o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); }); }

/** Restyle a stylised figure: real cloth and skin instead of the mannequin sheen. */
function dressFigure(f, { suit = 0x14151a } = {}) {
  const swap = new Map();
  f.traverse((o) => {
    if (!o.isMesh) return; const m = o.material; if (swap.has(m)) { o.material = swap.get(m); return; }
    let r = m;
    if (m.metalness === 0.15 && m.sheen === 0.5) r = woolMat(suit);
    else if (m.metalness === 0.35) r = skinMat();
    swap.set(m, r); o.material = r;
  });
  return f;
}

// ------------------------------------------------------------------------------------------------
function fireBillboards(scene, pos, w = 1.2) {
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float time; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec2 uv = vUv; float t = time*1.6; float f = n(vec2(uv.x*6., uv.y*4. - t*2.2))*0.6 + n(vec2(uv.x*13., uv.y*8. - t*3.5))*0.4;
        float shape = (1. - uv.y) * smoothstep(0.5, 0.05, abs(uv.x - 0.5) + uv.y*0.25) ; float a = smoothstep(0.25, 0.9, shape * (0.55 + f*0.9));
        vec3 c = mix(vec3(1.6,0.45,0.08), vec3(2.6,1.6,0.6), smoothstep(0.4, 1.0, a)); gl_FragColor = vec4(c * a * 1.4, 1.); }` });
  const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * (1 - i * 0.2), 0.9 - i * 0.12), mat); m.position.set(pos[0] + (i - 1) * 0.12, pos[1] + 0.42, pos[2] + i * 0.05); g.add(m); }
  scene.add(g); return mat;
}

/** Backlit onyx panel (warm translucent stone) for the back-bar. */
function onyxTexture() {
  const c = fromFn(512, 256, (x, y, o) => {
    const v = fbm2(x / 90 + fbm2(x / 40, y / 40, 3, 5) * 2.2, y / 28, 4, 3); const vein = Math.pow(1 - Math.abs(Math.sin((v * 6 + x / 140) * Math.PI)), 6);
    const k = 0.55 + v * 0.5 - vein * 0.35; o[0] = clamp(k * 255, 0, 255); o[1] = clamp(k * 168, 0, 255); o[2] = clamp(k * 82, 0, 255); o[3] = 255;
  });
  return tex(c, { srgb: true });
}
/** Persian-style rug: deep burgundy field, champagne medallion and border. */
function rugTexture() {
  return drawTexture(1024, 720, (g, w, h) => {
    g.fillStyle = '#2a070c'; g.fillRect(0, 0, w, h);
    const r = rng(17); g.globalAlpha = 0.18; for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? '#4a1018' : '#14040a'; g.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 2); } g.globalAlpha = 1;
    const band = (m, lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(m, m, w - 2 * m, h - 2 * m); };
    band(26, 30, '#140508'); band(50, 6, '#b8945c'); band(78, 14, '#3a0c12'); band(98, 4, '#b8945c');
    g.save(); g.translate(w / 2, h / 2); g.strokeStyle = '#a8844e'; g.fillStyle = '#3d0f16';
    for (const [sx, sy, a] of [[1, 0.62, 1], [0.7, 0.44, 0.8], [0.42, 0.27, 1]]) { g.beginPath(); for (let i = 0; i <= 64; i++) { const t = (i / 64) * TAU; const rr = 1 + 0.12 * Math.cos(t * 8); g.lineTo(Math.cos(t) * 210 * sx * rr, Math.sin(t) * 210 * sy * rr); } g.globalAlpha = a; g.lineWidth = 4; g.fill(); g.stroke(); }
    g.globalAlpha = 1; g.restore();
    g.fillStyle = '#9a7848'; for (const [x, y] of [[150, 150], [w - 150, 150], [150, h - 150], [w - 150, h - 150]]) { g.beginPath(); g.ellipse(x, y, 40, 26, 0, 0, TAU); g.fill(); }
  });
}

export async function buildS7(ctx) {
  const shots = []; const R = ctx.renderer;
  // ROOM: the real room crushed to its practicals (lounge fill). ROOM_M: the same room for the macros, walls kept as a dim warm
  // surround so polished gold, crystal and titanium have something real to reflect; window and sconces at full photographed value.
  const [ROOM, ROOM_M, HALL] = await Promise.all([
    gradedEnv(R, HDRI.interiorWarm, { wall: 0.05, floor: 0.028, lo: 0.9, hi: 3.5, floorKeep: 0.12 }),
    gradedEnv(R, HDRI.interiorWarm, { wall: 0.3, floor: 0.16, lo: 2.5, hi: 8, floorKeep: 0.6, tint: [1, 0.78, 0.56], light: [1, 0.9, 0.76] }),
    gradedEnv(R, HDRI.warehouse, { wall: 0.03, floor: 0.012, lo: 1.2, hi: 5, floorKeep: 0, tint: [1, 0.85, 0.7], light: [1, 0.9, 0.76] }),
  ]);

  // ---------------------------------------------------------------- 7.1 crystal coupes clink
  const WIN = 2.39; // panorama yaw that puts the photographed window straight behind a camera looking down -z
  const gs = makeSet(null); const G = gs.scene; lightWith(G, ROOM_M, { k: 1.0, rot: WIN - 0.3, bg: 0.07, blur: 0.5 });
  const gA = crystalGlass(0.19, { seed: 5 }), gB = crystalGlass(0.19, { seed: 9 }); G.add(gA); G.add(gB);
  for (const gl of [gA, gB]) gl.traverse((o) => { if (o.material?.isMeshPhysicalMaterial && o.material.blending === THREE.AdditiveBlending) envK(o.material, G, 0.42); });
  const bokeh = []; const rb = rng(71); for (let i = 0; i < 12; i++) { const b = glow(rb() < 0.5 ? 0xffb060 : 0xffd9a0, rb.range(0.04, 0.09), rb.range(0.25, 0.7)); const sx = rb.sign(); b.position.set(sx * rb.range(0.35, 1.5), rb.range(-0.1, 0.8), rb.range(-2.8, -1.4)); G.add(b); bokeh.push(b); }
  const glint = glow(0xffffff, 0.08, 0); G.add(glint);
  spot(G, { intensity: 3, pos: [0.5, 0.8, 0.6], target: [0, 0.15, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  spot(G, { intensity: 2.5, pos: [-0.6, 0.4, -0.6], target: [0, 0.15, 0], angle: 0.5, penumbra: 1, color: 0xff9a50 });
  const RIM = 0.0728 * Math.cos(0.12) + 0.19 * Math.sin(0.12);
  gs.onUpdate((t) => {
    const lt = t - 62.0; const k = smooth(clamp(lt / 0.55)); const recoil = lt > 0.55 ? Math.exp(-(lt - 0.55) * 6) * Math.sin((lt - 0.55) * 30) * 0.004 : 0;
    gA.position.set(lerp(-0.24, -RIM, k) - recoil, 0, 0); gA.rotation.z = lerp(0.1, -0.12, k); gB.position.set(lerp(0.24, RIM, k) + recoil, 0.004, 0.012); gB.rotation.z = lerp(-0.1, 0.12, k);
    gA.userData.update(t); gB.userData.update(t + 3.7);
    const c = lt > 0.55 ? Math.exp(-(lt - 0.55) * 7) : 0; glint.position.set(0, 0.19, 0.02); glint.material.color.setRGB(1, 0.95, 0.85).multiplyScalar(c * 2.5); glint.scale.setScalar(0.02 + c * 0.024);
  });
  shots.push(shot('s7.1', 62.0, 63.0, gs, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.06, 0.02, u), 0.2, 0.42), v3(0, 0.165, 0), { fov: 30, near: 0.01, far: 20 }); return { focus: d, aperture: 10 }; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.55, streak: 0.3, threshold: 1.2, gain: [1.08, 1.0, 0.88] } }));

  // ---------------------------------------------------------------- 7.2 numbered titanium card on walnut
  const cs = makeSet(null); const C = cs.scene; lightWith(C, ROOM_M, { k: 0.9, rot: WIN + Math.PI }); // window behind the camera: the lacquer and titanium mirror the warm room, not a white veil
  const tableM = await photoMat('wood', { color: 0x5a3a2c, bump: 0.6, rough: 0.85, clearcoat: 1, ccRough: 0.07 });
  const table = new THREE.Mesh(tilePlane(1.6, 1.0, 1.0, 0.5), tableM); table.rotation.set(-Math.PI / 2, 0, 0.42); C.add(table);
  const cardTex = drawTexture(1024, 640, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#2b2b2e'); grd.addColorStop(0.5, '#4a4a4e'); grd.addColorStop(1, '#232326'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.25; for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#5a5a5e' : '#1a1a1c'; g.fillRect(0, y, w, 1); } g.globalAlpha = 1;
    drawEmblem(g, 170, 200, 120, { fill: '#d9b26a', stroke: '#d9b26a' });
    g.fillStyle = '#d9b26a'; g.font = `600 52px ${FONT_SERIF}`; g.fillText('LEGEND PADDOCK CLUB', 330, 190); g.font = `500 34px ${FONT_SERIF}`; g.fillText('MEMBER', 330, 245);
    g.font = `600 110px ${FONT_SERIF}`; g.fillText('Nº 007', 60, 540); g.font = `italic 500 30px ${FONT_SERIF}`; g.fillText('Since 1962', 760, 560);
  });
  const cardN = drawNormal(1024, 640, (g) => { g.fillStyle = '#fff'; drawEmblem(g, 170, 200, 120, { fill: '#fff', stroke: '#fff' }); g.font = `600 52px ${FONT_SERIF}`; g.fillText('LEGEND PADDOCK CLUB', 330, 190); g.font = `600 110px ${FONT_SERIF}`; g.fillText('Nº 007', 60, 540); }, -3);
  const card = mesh(roundBox(0.0856, 0.054, 0.0012, 0.0006, 2), M.titanium().clone()); card.rotation.x = -Math.PI / 2; C.add(card);
  const face = mesh(new THREE.PlaneGeometry(0.0846, 0.053), new THREE.MeshPhysicalMaterial({ map: cardTex, normalMap: cardN, metalness: 0.5, roughness: 0.34, clearcoat: 0.15 }), { p: [0, 0, 0.0009] }); card.add(face); envK(face.material, C, 0.6); // face sits just above the body (it was coplanar: z-fighting)
  const pen = fountainPen(); pen.position.set(0.05, 0.0068, 0.0); pen.rotation.y = Math.PI / 2 - 0.12; C.add(pen);
  spot(C, { intensity: 0.35, pos: [-0.15, 0.35, -0.25], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  spot(C, { intensity: 1.4, pos: [0.3, 0.5, 0.35], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  const cl = glow(0xffb060, 0.5, 0.9); cl.position.set(-0.6, 0.1, -0.8); C.add(cl);
  cs.onUpdate((t) => { const k = easeOutCubic(clamp((t - 62.9) / 1.0)); card.position.set(lerp(-0.22, 0.0, k), 0.0012, lerp(0.05, 0.0, k)); card.rotation.z = lerp(0.35, 0.08, k); });
  shots.push(shot('s7.2', 63.0, 64.0, cs, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.03, 0.05, u), 0.13, 0.11), v3(lerp(-0.05, 0.0, u), 0.0, 0.0), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: 8 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.3 gold watch on the wrist at the walnut gear knob
  const ws = makeSet(null); const Wd = ws.scene; lightWith(Wd, ROOM_M, { k: 1.0, rot: WIN + 0.5, bg: 0.1, blur: 0.5 });
  const rig = new THREE.Group(); rig.scale.setScalar(2.2); Wd.add(rig);
  const RY = 0.021, RZ = 0.03; const wf = (x) => 1 + clamp(-x / 0.2) * 0.2 + clamp((x - 0.07) / 0.04) * 0.08;
  const wristX = []; for (let i = 0; i <= 30; i++) { const x = lerp(-0.2, 0.115, i / 30); wristX.push([x, wf(x), wf(x)]); }
  // organic wrist: flatter back, radial styloid on the thumb side, extensor tendons toward the hand, low-frequency irregularity
  const gx = (x, m, w) => Math.exp(-((x - m) ** 2) / (w * w)), dir = (c, s, dc, ds, w) => Math.exp(-(1 - (c * dc + s * ds)) / w);
  const wristDeform = (x, c, s, u) => 1 - 0.035 * dir(c, s, 1, 0, 0.12) + 0.05 * gx(x, 0.03, 0.014) * dir(c, s, 0.3, 0.95, 0.08) + clamp((x - 0.025) / 0.06) * 0.018 * Math.pow(Math.max(0, Math.cos((u * TAU - Math.PI) * 6)), 6) * Math.max(0, c) + (fbm2(x * 60, u * 8, 2, 5, 8) - 0.5) * 0.03;
  rig.add(new THREE.Mesh(sweepX(wristX, RY, RZ, { uvScale: [6, 8], n: 96, deform: wristDeform }), skinMat()));
  const cuffX = [[-0.17, 1.3, 1.16], [-0.05, 1.28, 1.15], [-0.046, 1.25, 1.13], [-0.0445, 1.15, 1.08], [-0.045, 1.08, 1.04], [-0.055, 1.06, 1.03]];
  rig.add(new THREE.Mesh(sweepX(cuffX, RY, RZ, { uvScale: [1, 1] }), cottonMat()));
  const sleeveX = [[-0.32, 1.72, 1.45], [-0.085, 1.62, 1.38], [-0.079, 1.58, 1.35], [-0.0765, 1.48, 1.3], [-0.078, 1.4, 1.26], [-0.089, 1.38, 1.25]];
  rig.add(new THREE.Mesh(sweepX(sleeveX, RY, RZ, { uvScale: [1, 1] }), woolMat(0x15171d)));
  const horn = new THREE.MeshPhysicalMaterial({ color: 0x1e140d, roughness: 0.28, metalness: 0, clearcoat: 0.7 });
  for (const [i, x] of [-0.092, -0.103, -0.114].entries()) { const [y, z] = supPt(1.05, RY * 1.62, RZ * 1.38); const b = mesh(new THREE.CylinderGeometry(0.0046, 0.0044, 0.0024, 24), horn, { p: [x - i * 0.0004, y * 1.02, z * 1.02] }); b.lookAt(new THREE.Vector3(x, y * 3, z * 3)); b.rotateX(Math.PI / 2); rig.add(b); }
  { const [y, z] = supPt(0.85, RY * 1.29, RZ * 1.15); const cf = cufflink(); cf.position.set(-0.056, y * 1.04, z * 1.04); cf.lookAt(new THREE.Vector3(-0.056, y * 3, z * 3)); rig.add(cf); }
  const watch = luxuryWatch(); const WX = -0.016, WY = RY * wf(WX) + 0.0037; watch.position.set(WX, WY, 0); rig.add(watch);
  const strapM = M.leather(0x2c0b0d); strapM.roughness = 0.5; const thread = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: 0.7 });
  for (const s of [1, -1]) {
    const pts = [[WY - 0.0016, s * (0.0195 + 0.0035)], [WY - 0.0034, s * (0.0195 + 0.0078)]];
    for (let i = 0; i <= 7; i++) { const th = lerp(1.32, Math.PI - 0.08, i / 7); const [y, z] = supPt(th, RY * wf(WX) + 0.0004, RZ * wf(WX) + 0.0004); pts.push([y, s * z]); }
    const sg = strap(pts, 0, 0.019, 0.0032, strapM, thread); sg.position.x = WX; rig.add(sg);
  }
  const walnutM = await photoMat('wood', { color: 0x6a4030, bump: 0.5, rough: 0.8, clearcoat: 1, ccRough: 0.06, repeat: [2.6, 2.6], rotation: 0.3 });
  const consoleW = new THREE.Mesh(tilePlane(0.5, 0.36, 0.5, 0.25), walnutM); consoleW.rotation.x = -Math.PI / 2; consoleW.position.set(0.02, -0.06, -0.02); rig.add(consoleW);
  const consoleL = mesh(new THREE.PlaneGeometry(1.2, 0.8), M.leather(0x0d0909), { p: [0, -0.062, 0], r: [-Math.PI / 2, 0, 0] }); for (const k of ['map', 'normalMap']) { consoleL.material[k] = consoleL.material[k].clone(); consoleL.material[k].repeat.set(48, 32); } rig.add(consoleL);
  const knob = mesh(new THREE.SphereGeometry(0.024, 48, 32), walnutM, { p: [0.125, -0.005, -0.012], s: [1, 0.92, 1] }); rig.add(knob);
  rig.add(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.012, 40), goldMat(0.14), { p: [0.125, -0.03, -0.012] }));
  rig.add(mesh(lathe([[0.016, 0], [0.03, -0.012], [0.036, -0.03], [0.0001, -0.03]], 40), M.leather(0x120a08), { p: [0.125, -0.033, -0.012] }));
  rig.position.y = 0.04 - WY * 2.2 - 0.0;
  spot(Wd, { intensity: 2.0, pos: [0.2, 0.6, 0.4], target: [0, 0.03, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  spot(Wd, { intensity: 1.1, pos: [-0.5, 0.25, -0.4], target: [0, 0.03, 0], angle: 0.5, penumbra: 1, color: 0x9ab0ff });
  ws.onUpdate((t) => { watch.userData.set(10 * 3600 + 9 * 60 + 12 + (t - 64)); const k = smooth(clamp((t - 64.2) / 0.5)); Wd.rotation.z = lerp(0, -0.12, k); });
  shots.push(shot('s7.3', 64.0, 65.0, ws, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.02, -0.04, u), 0.2, 0.17), v3(-0.035, 0.04, 0), { fov: 32, near: 0.005, far: 20 }); return { focus: d, aperture: 10 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.4 handshake beside a car door
  const hsS = makeSet(null); const HS = hsS.scene; lightWith(HS, HALL, { k: 1.25, rot: -2.51, bg: 0.22, blur: 0.3 });
  const doorCar = await conceptCar({ paint: 0x3d0b12, metal: 0.65, rough: 0.32, drop: /^(Interior|Wheel|Engine|Body(Underside|Hood|Rearwindow|Taillight|TurnsignalsRear|Headlights|Windshield)|$)/ }); HS.add(doorCar);
  { const b = new THREE.Box3().setFromObject(doorCar); doorCar.position.set(0.35, -0.98 - b.min.y, -0.55 - 1.0); }
  const skin = skinMat(); const hL = buildHand({ material: skin, side: 1, cuff: 0xe8e2d8 }), hR = buildHand({ material: skin, side: -1, cuff: 0xe8e2d8 });
  hL.userData.setCurl([0.8, 0.85, 0.9, 0.95], 1.15); hR.userData.setCurl([0.8, 0.85, 0.9, 0.95], 1.15); HS.add(hL); HS.add(hR);
  const cot = cottonMat();
  for (const [h, s] of [[hL, 1], [hR, -1]]) {
    h.traverse((o) => { if (o.isMesh && o.material !== skin && o.material.type === 'MeshStandardMaterial') o.material = skin; });
    h.add(mesh(new THREE.CylinderGeometry(0.041, 0.043, 0.075, 40), cot, { p: [0, -0.115, 0], s: [1.2, 1, 0.85] }));
    h.add(mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.32, 40), woolMat(s > 0 ? 0x14161c : 0x221d1a), { p: [0, -0.3, 0], s: [1.15, 1, 0.9] }));
    const cf = cufflink(0.0068); cf.position.set(0, -0.115, 0.038); h.add(cf);
  }
  const hw = luxuryWatch(); hw.position.set(0, -0.072, -0.03); hw.rotation.x = -Math.PI / 2; hw.scale.setScalar(0.95); hL.add(hw);
  envK(skin, HS, 0.12); envK(cot, HS, 0.25);
  spot(HS, { intensity: 0.14, pos: [0.4, 0.7, 0.8], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 }); spot(HS, { intensity: 3.6, pos: [-0.35, 0.5, -0.4], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffb060 }); spot(HS, { intensity: 2.2, pos: [0.45, 0.4, -0.35], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffd2a0 });
  hsS.onUpdate((t) => {
    const lt = t - 65.0; const k = smooth(clamp(lt / 0.45)); const pump = Math.sin(clamp((lt - 0.45) / 0.5) * Math.PI) * 0.015;
    hL.position.set(lerp(-0.2, -0.03, k), pump, 0); hL.rotation.set(0, 0, -Math.PI / 2 + 0.15); hR.position.set(lerp(0.2, 0.03, k), pump, -0.02); hR.rotation.set(0, Math.PI, -Math.PI / 2 + 0.15);
  });
  shots.push(shot('s7.4', 65.0, 66.0, hsS, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.3, 0.2, u), 0.12, 0.75), v3(0, 0.0, -0.1), { fov: 30, near: 0.01, far: 30 }); return { focus: d - 0.08, aperture: 8 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.5 the members' lounge
  const ls = makeSet(null); const L = ls.scene; lightWith(L, ROOM, { k: 0.5, rot: 0 });
  const NIGHT = await hdri(HDRI.night); L.background = NIGHT.equirect; L.backgroundIntensity = 0.85; L.backgroundRotation.set(0, 2.2, 0); // real night sky, last amber light on the horizon
  const CX = 0.6, CZ = -1.5, XF = 5.5, RW = 9 + XF, RXC = (XF - 9) / 2; // seating group; room spans x -9..XF, z -5..5
  // floor: real oak planks, stained dark and polished
  const floorM = await photoMat('wood', { color: 0x5a3626, bump: 0.8, rough: 0.9, clearcoat: 0.45, ccRough: 0.18 });
  const floor = new THREE.Mesh(tilePlane(RW, 10, 2.2, 1.1), floorM); floor.rotation.x = -Math.PI / 2; floor.position.x = RXC; L.add(floor);
  // walls: real brick above a dark oak wainscot
  const brickM = await photoMat('brick', { color: 0x6a4a42, bump: 1.2, rough: 1 });
  const wainM = await photoMat('wood', { color: 0x2a1810, bump: 0.6, rough: 0.7, clearcoat: 0.4, ccRough: 0.2, rotation: Math.PI / 2 });
  for (const [x, z, ry, w] of [[RXC, -5, 0, RW], [XF, 0, -Math.PI / 2, 10], [-9, 0, Math.PI / 2, 10]]) {
    const wall = new THREE.Mesh(tilePlane(w, 3.2, 1.9, 1.9), brickM); wall.position.set(x, 2.6, z); wall.rotation.y = ry; L.add(wall);
    const wn = new THREE.Mesh(tilePlane(w, 1.0, 1.1, 2.2), wainM); wn.position.set(x, 0.5, z); wn.rotation.y = ry; wn.translateZ(0.02); L.add(wn);
    const rail = mesh(new THREE.BoxGeometry(w, 0.06, 0.06), wainM, { p: [x, 1.0, z], r: [0, ry, 0] }); rail.translateZ(0.04); L.add(rail);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, 10), M.matte(0x0d0907, 0.9)); ceil.position.set(RXC, 4.2, 0); ceil.rotation.x = Math.PI / 2; L.add(ceil);
  const beamM = await photoMat('wood', { color: 0x2a1a12, bump: 0.6, rough: 0.8 });
  for (const z of [-3.6, -1.2, 1.2, 3.6]) L.add(mesh(new THREE.BoxGeometry(RW, 0.32, 0.24), beamM, { p: [RXC, 4.04, z] }));
  // giant steel windows (z = +5) onto the lit cars
  const steel = new THREE.MeshStandardMaterial({ color: 0x15110d, metalness: 0.7, roughness: 0.45 });
  for (let x = -8; x <= 4; x += 2) L.add(mesh(new THREE.BoxGeometry(0.1, 3.85, 0.14), steel, { p: [x, 2.27, 5] }));
  for (const y of [0.35, 3.0, 4.18]) L.add(mesh(new THREE.BoxGeometry(RW, 0.09, 0.14), steel, { p: [RXC, y, 5] }));
  for (let x = -7; x <= 5; x += 2) L.add(mesh(new THREE.BoxGeometry(0.04, 1.15, 0.06), steel, { p: [x, 3.6, 5] }));
  L.add(mesh(new THREE.BoxGeometry(RW, 0.35, 0.3), brickM, { p: [RXC, 0.175, 5.05] }));
  const glassW = new THREE.Mesh(new THREE.PlaneGeometry(RW, 3.85), new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false })); glassW.position.set(RXC, 2.27, 5.02); glassW.rotation.y = Math.PI; L.add(glassW);
  const terrace = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x070606, roughness: 0.4, metalness: 0 })); terrace.rotation.x = -Math.PI / 2; terrace.position.set(0, -0.01, 20); L.add(terrace);
  const plinthM = new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.55, metalness: 0 });
  const farDrop = /^(Interior|Wheel.*Brake|BodyHoodTopgrill|BodyUnderside)/; const outCars = await Promise.all([conceptCar({ paint: 0x3d0b12, metal: 0.65, rough: 0.3, drop: farDrop }), conceptCar({ paint: 0x6d6f74, metal: 0.85, rough: 0.3, drop: farDrop })]);
  [[2.6, 10.0, Math.PI * 0.86], [8.4, 11.4, Math.PI * 1.1]].forEach(([x, z, ry], i) => {
    const car = outCars[i]; car.rotation.y = ry; car.position.set(x, 0.12, z); L.add(car);
    L.add(mesh(roundBox(5.4, 0.12, 2.7, 0.05), plinthM, { p: [x, 0.06, z], r: [0, ry, 0] }));
    const e = new THREE.Mesh(new THREE.RingGeometry(1, 1.012, 4, 1, Math.PI / 4), M.emissive(0xffcf8a, 3)); e.scale.set(3.8, 1.9, 1); e.rotation.set(-Math.PI / 2, 0, ry); e.position.set(x, 0.125, z); L.add(e);
  });
  spot(L, { intensity: 320, pos: [5.4, 9, 7.2], target: [5.4, 0.3, 10.8], angle: 0.62, penumbra: 1, color: 0xffe2b8 });
  // fireplace: black marble surround, sooty brick firebox, burning logs; a framed photographic print with its picture light
  const marble = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex(fromFn(256, 256, (x, y, o) => { const v = fbm2(x / 50 + fbm2(x / 20, y / 20, 3, 21) * 2.5, y / 50, 4, 23); const vein = Math.pow(1 - Math.abs(Math.sin(v * 9 * Math.PI)), 14); const k = 10 + vein * 70; o[0] = k; o[1] = k * 0.97; o[2] = k * 0.95; o[3] = 255; }), { srgb: true }), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 });
  L.add(mesh(roundBox(2.6, 1.6, 0.42, 0.03), marble, { p: [0, 0.8, -4.79] }));
  const fireBrick = await photoMat('brick', { color: 0x2a1a16, bump: 1.4, rough: 1, repeat: [0.5, 0.5] });
  L.add(mesh(new THREE.BoxGeometry(1.3, 0.95, 0.04), fireBrick, { p: [0, 0.58, -4.56] }));
  L.add(mesh(new THREE.BoxGeometry(1.36, 0.98, 0.5), new THREE.MeshStandardMaterial({ color: 0x050404, roughness: 1, side: THREE.BackSide }), { p: [0, 0.59, -4.35] }));
  const bark = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.95, emissive: 0xff5a10, emissiveIntensity: 0.08 });
  for (const [x, rz, ry] of [[-0.18, 0.08, 0.2], [0.16, -0.06, -0.25], [0, 0.0, 0]]) L.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.85, 14), bark, { p: [x, x === 0 ? 0.28 : 0.2, -4.38], r: [0, ry, Math.PI / 2 + rz] }));
  L.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), M.emissive(0xff6a20, 1.6), { p: [0, 0.13, -4.4] }));
  const mantelM = await photoMat('wood', { color: 0x4a2c1c, bump: 0.5, rough: 0.8, clearcoat: 0.8, ccRough: 0.1 });
  L.add(mesh(roundBox(2.95, 0.09, 0.56, 0.02), mantelM, { p: [0, 1.65, -4.74] }));
  const gilt = goldMat(0.32, 0xc89a58);
  L.add(mesh(roundBox(1.85, 1.02, 0.07, 0.03), gilt, { p: [0, 2.55, -4.95] }));
  const printT = (await photo('hdri/spruit_sunrise_4k.hdr.jpg')).clone(); printT.repeat.set(0.33, 0.333); printT.offset.set(0.27, 0.383);
  const printM = new THREE.MeshStandardMaterial({ map: printT, emissiveMap: printT, emissive: new THREE.Color(0.42, 0.36, 0.28), roughness: 0.55 });
  printM.onBeforeCompile = (sh) => { const toned = (v) => `{ float l = dot(${v}, vec3(0.2126, 0.7152, 0.0722)); ${v} = mix(vec3(l) * vec3(1.18, 0.96, 0.7), ${v}, 0.3); }`; sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${toned('diffuseColor.rgb')}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${toned('totalEmissiveRadiance')}`); };
  printM.customProgramCacheKey = () => 's7-print';
  L.add(mesh(new THREE.PlaneGeometry(1.62, 0.8), printM, { p: [0, 2.55, -4.91] }));
  L.add(mesh(new THREE.PlaneGeometry(1.7, 0.88), new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.9 }), { p: [0, 2.55, -4.912] }));
  L.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 16), goldMat(0.2), { p: [0, 3.14, -4.78], r: [0, 0, Math.PI / 2] }));
  L.add(mesh(new THREE.PlaneGeometry(0.86, 0.02), M.emissive(0xffd9a0, 4), { p: [0, 3.118, -4.78], r: [Math.PI / 2, 0, 0] }));
  for (const x of [-1.15, 1.15]) {
    L.add(mesh(lathe([[0.06, 0], [0.065, 0.01], [0.02, 0.03], [0.014, 0.16], [0.03, 0.2], [0.025, 0.22], [0.0001, 0.22]], 32), gilt, { p: [x, 1.695, -4.7] }));
    L.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.6 }), { p: [x, 1.995, -4.7] }));
    const fl = glow(0xffc070, 0.12, 2.0); fl.position.set(x, 2.1, -4.7); L.add(fl);
  }
  const fireMat = fireBillboards(L, [0, 0.12, -4.42], 0.85); const fireL = point(L, { color: 0xff8a3a, intensity: 6, pos: [0, 0.7, -4.0] });
  // rug, coffee table and its still life
  const rugM = new THREE.MeshPhysicalMaterial({ map: rugTexture(), roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x8a3040), normalMap: (() => { const n = weave().clone(); n.repeat.set(60, 42); return n; })(), normalScale: new THREE.Vector2(0.5, 0.5) });
  L.add(mesh(new THREE.BoxGeometry(4.8, 0.012, 3.4), rugM, { p: [CX + 0.1, 0.006, CZ] }));
  L.add(mesh(new THREE.BoxGeometry(2.9, 0.012, 2.0), rugM, { p: [-0.9, 0.006, 3.2], r: [0, 0.08, 0] }));
  const tblM = await photoMat('wood', { color: 0x6a4030, bump: 0.5, rough: 0.8, clearcoat: 1, ccRough: 0.06, repeat: [0.9, 0.9] });
  L.add(mesh(roundBox(1.25, 0.045, 0.7, 0.012), tblM, { p: [CX, 0.42, CZ], r: [0, 0.12, 0] }));
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.28, 0.28]) L.add(mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.4, 12), goldMat(0.2), { p: [CX + sx * Math.cos(0.12) + sz * Math.sin(0.12), 0.2, CZ - sx * Math.sin(0.12) + sz * Math.cos(0.12)] }));
  const coupes = [[-0.32, 0.12], [-0.18, 0.2]].map(([dx, dz], i) => { const cg = crystalGlass(0.16, { bubbles: 12, seed: 30 + i }); cg.position.set(CX + dx, 0.443, CZ + dz); L.add(cg); return cg; });
  const flowers = cheapGlass(await prop('GlassVaseFlowers', { size: 0.34, axis: 'y' })); flowers.position.set(CX + 0.25, 0.443, CZ - 0.08); flowers.rotation.y = 0.6; L.add(flowers);
  // photoreal seating: carved-wood leather sofa, champagne velvet sofa, burgundy silk pouf; velvet club chairs by the window
  const [sofa, velvet, pouf, chA, chB] = await Promise.all([prop('SheenWoodLeatherSofa', { size: 2.6, axis: 'x' }), prop('GlamVelvetSofa', { size: 2.1, axis: 'x' }), prop('SpecularSilkPouf', { size: 0.62, axis: 'x' }), prop('SheenChair', { size: 0.86, axis: 'x' }), prop('SheenChair', { size: 0.86, axis: 'x' })]);
  await selectVariant(velvet, 'champagne');
  tintMats(sofa, /^Brown$/, (m) => { m.color.set(0xa86a5a); });
  tintMats(pouf, /silk/i, (m) => { m.color.set(0x5a0f1a); if (m.sheenColor) m.sheenColor.set(0xa83a4a); });
  for (const ch of [chA, chB]) { hide(ch, /label/i); tintMats(ch, /fabric/i, (m) => { m.color.set(0x7a1824); if (m.sheenColor) m.sheenColor.set(0xc04050); }); tintMats(ch, /wood/i, (m) => { m.color.set(0x3a2418); }); }
  sofa.position.set(CX + 1.6, 0, CZ + 0.1); sofa.rotation.y = -Math.PI / 2 - 0.35; L.add(sofa);
  velvet.position.set(CX - 0.15, 0, CZ - 1.45); velvet.rotation.y = 0.1; L.add(velvet);
  pouf.position.set(CX - 1.05, 0, CZ + 0.95); L.add(pouf);
  chA.position.set(-1.7, 0, 3.0); chA.rotation.y = Math.PI * 0.75; L.add(chA); chB.position.set(-0.1, 0, 3.55); chB.rotation.y = -Math.PI * 0.62; L.add(chB);
  L.add(mesh(lathe([[0.0001, 0.6], [0.3, 0.6], [0.3, 0.635], [0.0001, 0.635]], 48), tblM)); L.children.at(-1).position.set(-0.9, 0, 3.35);
  L.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 16), goldMat(0.2), { p: [-0.9, 0.3, 3.35] })); L.add(mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.02, 32), goldMat(0.2), { p: [-0.9, 0.01, 3.35] }));
  L.add(mesh(lathe([[0.0001, 0], [0.07, 0], [0.07, 0.015], [0.012, 0.03], [0.01, 0.34], [0.0001, 0.34]], 32), goldMat(0.2), { p: [-0.72, 0.636, 3.45] }));
  L.add(mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.2, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffb060, emissiveIntensity: 1.2, roughness: 0.9, side: THREE.DoubleSide }), { p: [-0.72, 1.03, 3.45] }));
  { const g = glow(0xffc070, 0.6, 1.0); g.position.set(-0.72, 1.0, 3.45); L.add(g); point(L, { color: 0xffb46a, intensity: 2.2, pos: [-0.72, 0.95, 3.45] }); }
  for (const [x, y, z] of [[CX - 0.2, 3.05, CZ + 0.3], [CX + 0.9, 3.15, CZ - 0.7], [-0.9, 3.1, 3.2]]) {
    L.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 4.2 - y, 6), M.blackSatin(), { p: [x, (4.2 + y) / 2, z] }));
    L.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), goldMat(0.2), { p: [x, y + 0.13, z] }));
    L.add(mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffc070, emissiveIntensity: 1.15, roughness: 0.3 }), { p: [x, y, z] }));
    const g = glow(0xffc985, 0.45, 1.0); g.position.set(x, y, z); L.add(g);
  }
  const winCoupe = crystalGlass(0.16, { bubbles: 10, seed: 41 }); winCoupe.position.set(-0.98, 0.636, 3.3); L.add(winCoupe); coupes.push(winCoupe);
  // side tables with Tiffany lamps; heritage bellows camera by the hearth
  for (const [dx, dz] of [[1.45, -1.55], [1.95, 1.5]]) {
    const x = CX + dx, z = CZ + dz; L.add(mesh(roundBox(0.5, 0.56, 0.5, 0.015), tblM, { p: [x, 0.28, z] }));
    const lamp = await prop('StainedGlassLamp', { size: 0.66, axis: 'y' }); lamp.position.set(x, 0.56, z); L.add(lamp);
    const lg = glow(0xffb870, 0.55, 1.1); lg.position.set(x, 1.0, z); L.add(lg); point(L, { color: 0xffb46a, intensity: 1.6, pos: [x, 0.98, z] });
  }
  const cam = await prop('AntiqueCamera', { size: 1.55, axis: 'y' }); cam.position.set(-1.95, 0, -4.0); cam.rotation.y = 0.55; L.add(cam);
  // the bar: backlit onyx, bottles, walnut counter, brass rail, stools, pendants
  const onyx = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.0), new THREE.MeshBasicMaterial({ map: onyxTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.4), toneMapped: false })); onyx.position.set(XF - 0.03, 1.95, -0.5); onyx.rotation.y = -Math.PI / 2; L.add(onyx);
  for (const y of [1.25, 1.85, 2.45]) { L.add(mesh(new THREE.BoxGeometry(0.32, 0.035, 5.4), tblM, { p: [XF - 0.2, y, -0.5] })); }
  const br = rng(91); const bottleGeos = [lathe([[0.0001, 0], [0.04, 0], [0.042, 0.005], [0.042, 0.2], [0.036, 0.23], [0.014, 0.26], [0.013, 0.31], [0.0001, 0.31]], 16), lathe([[0.0001, 0], [0.05, 0], [0.05, 0.16], [0.03, 0.19], [0.015, 0.2], [0.015, 0.25], [0.0001, 0.25]], 16), lathe([[0.0001, 0], [0.035, 0], [0.037, 0.24], [0.012, 0.29], [0.012, 0.34], [0.0001, 0.34]], 16)];
  const bottleMats = [0x3a1806, 0x1a2410, 0x6a4a20].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 1, depthWrite: false }));
  const bm4 = new THREE.Matrix4(); const counts = [0, 0, 0]; const slots = [];
  for (const y of [1.27, 1.87, 2.47]) for (let z = -3.0; z < 2.1; z += br.range(0.11, 0.17)) { const k = br.int(0, 2); slots.push([k, y, z]); counts[k]++; }
  const inst = bottleGeos.map((geo, k) => { const im = new THREE.InstancedMesh(geo, bottleMats[k], counts[k]); im.renderOrder = 1; L.add(im); return im; }); counts.fill(0);
  for (const [k, y, z] of slots) { bm4.makeTranslation(XF - 0.2 + br.range(-0.05, 0.05), y, z); inst[k].setMatrixAt(counts[k]++, bm4); }
  const barDark = await photoMat('wood', { color: 0x1c110b, bump: 0.6, rough: 0.6, clearcoat: 0.5, ccRough: 0.2, rotation: Math.PI / 2 });
  const BX = XF - 1.45;
  L.add(mesh(roundBox(0.62, 1.04, 4.6, 0.02), barDark, { p: [BX, 0.52, -0.6] }));
  L.add(mesh(roundBox(0.82, 0.055, 4.8, 0.015), tblM, { p: [BX - 0.05, 1.07, -0.6] }));
  L.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.6, 16), goldMat(0.18), { p: [BX - 0.5, 0.22, -0.6], r: [Math.PI / 2, 0, 0] }));
  const stoolLeather = M.leather(0x2a0a0e);
  for (const z of [-2.2, -0.9, 0.4]) { L.add(mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.09, 32), stoolLeather, { p: [BX - 0.8, 0.78, z] })); L.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 12), goldMat(0.16), { p: [BX - 0.8, 0.38, z] })); L.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 32), goldMat(0.2), { p: [BX - 0.8, 0.01, z] })); }
  for (const z of [-2.4, -0.6, 1.2]) { L.add(mesh(lathe([[0.0001, 0], [0.18, 0], [0.12, 0.16], [0.03, 0.22], [0.0001, 0.22]], 32), goldMat(0.25, 0xb88a50), { p: [BX - 0.15, 2.75, z] })); L.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 6), M.blackSatin(), { p: [BX - 0.15, 3.57, z] })); const b = glow(0xffc985, 0.35, 2.4); b.position.set(BX - 0.15, 2.72, z); L.add(b); }
  spot(L, { intensity: 40, pos: [BX - 0.15, 3.9, -0.6], target: [BX, 1.0, -0.6], angle: 0.9, penumbra: 1, color: 0xffcf98 });
  // members and staff (real cloth, real skin); the barman works behind the counter
  const members = [
    { f: buildFigure({ suit: 0x14151a }), suit: 0x14151a, pose: 'sitCross', pos: [CX + 1.42, 0.06, CZ - 0.42], ry: -Math.PI / 2 - 0.35 },
    { f: buildFigure({ suit: 0x2a1418, gender: 'f', hair: 0x2b1d14 }), suit: 0x2a1418, pose: 'sit', pos: [CX - 0.2, 0.0, CZ - 1.25], ry: 0.1 },
    { f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), suit: 0x0b0b0c, pose: 'holdGlass', pos: [1.5, 0, 3.75], ry: -2.4 },
    { f: buildFigure({ suit: 0x1c1d22 }), suit: 0x1c1d22, pose: 'gesture', pos: [2.3, 0, 3.25], ry: 2.2 },
    { f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), suit: 0x0b0b0c, pose: 'holdGlass', pos: [XF - 0.75, 0, -1.0], ry: -Math.PI / 2 },
  ];
  for (const m of members) { dressFigure(m.f, { suit: m.suit }); m.f.position.set(...m.pos); m.f.rotation.y = m.ry; m.f.userData.pose(POSES[m.pose]); L.add(m.f); }
  // light: fire, lamps, a warm key over the group, the window-side cars; reflections from the room itself
  spot(L, { intensity: 70, pos: [CX - 0.5, 4.0, CZ + 1.5], target: [CX, 0.5, CZ], angle: 0.7, penumbra: 1, color: 0xffd9a8 });
  spot(L, { intensity: 60, pos: [-4, 3.8, -1], target: [0, 0.8, -3.5], angle: 0.8, penumbra: 1, color: 0xffc98a });
  const ld = dust(L, { count: 250, box: [0, 2, 0, 12, 4, 9], size: 0.6, intensity: 0.3, res: ctx.res, seed: 73 });
  ld.pts.visible = false;
  { const pm = new THREE.PMREMGenerator(R); const probe = pm.fromScene(L, 0.02, 0.05, 60, { size: 256, position: new THREE.Vector3(CX - 1.8, 1.4, CZ + 1.4) }).texture; pm.dispose(); L.environment = probe; L.environmentIntensity = 1.0; L.environmentRotation.set(0, 0, 0); }
  ld.pts.visible = true;
  ls.onUpdate((t) => { fireMat.uniforms.time.value = t; fireL.intensity = 4.2 + noise1(t * 6) * 1.2 + noise1(t * 13) * 0.6; ld.set(t); members[3].f.userData.J['sh1'].rotation.x = -0.9 + Math.sin(t * 1.4) * 0.15; for (const c of coupes) c.userData.update(t); });
  shots.push(shot('s7.5', 66.0, 72.0, ls, keyCam([v3(-8.4, 1.75, -1.8), v3(-7.2, 1.6, -0.6), v3(-6.0, 1.5, 0.2)], [v3(1.5, 1.0, 1.2), v3(2.0, 1.0, 2.0), v3(2.0, 0.9, 2.6)], { fov: 50, aperture: 1.5, ease: (x) => easeInOutCubic(x) }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.55, streak: 0.28, threshold: 1.2, gain: [1.08, 1.0, 0.88], lift: [0.004, 0.002, 0.0] } }));
  return { shots };
}
