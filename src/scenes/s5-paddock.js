// SCENE 5 (40–50s) — THE PADDOCK. Vault lock turning, analogue hygrometer, a car cover lifted in
// slow motion → the private paddock (bays on lit platforms, concierge) → crane up outside at dusk.
// Realism pass: the macros are lit by a real photographed studio (HDR panorama), the paddock hall
// reflects a real industrial hall and is built from photo materials (smoked-oak floor, old brick
// walls washed by brushed-metal sconces) with photoreal concept cars on two platforms and a Tiffany
// lamp on the concierge desk; the exterior sits under a real sunset sky photograph, mirrored in a
// true planar water reflection, with photoreal lanterns along the drive and a photoreal car.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, lightStrip, lightCone } from './common.js';
import { buildCar, contactShadow, emblemMaterial } from '../models/car.js';
import { buildGauge } from '../models/props.js';
import { buildFigure, POSES } from '../models/figure.js';
import { mesh, roundBox, patch, gearGeo, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { invLerp, easeOutCubic, easeInCubic, TAU, fbm1, noise1 } from '../engine/util.js';
import { useHdri, HDRI, model, hide, selectVariant, photo, findIn } from '../engine/assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Water } from 'three/addons/objects/Water.js';

function vaultMechanism(plate = M.titanium()) {
  const g = new THREE.Group(); const steel = M.alu(), dark = M.darkChrome(), gold = M.goldPolished();
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 128), plate, { r: [Math.PI / 2, 0, 0], p: [0, 0, -0.1] }));
  // polished steel door bezel: a thick lathed ring that catches the photographed softbox
  g.add(mesh(lathe([[1.0, -0.16], [1.08, -0.15], [1.13, -0.1], [1.14, -0.04], [1.1, 0.0], [1.02, 0.0], [0.99, -0.03]], 160), M.polished(), { r: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; g.add(mesh(new THREE.BoxGeometry(0.004, 0.06, 0.01), dark, { p: [Math.cos(a) * 0.93, Math.sin(a) * 0.93, -0.035], r: [0, 0, a] })); }
  const wheel = new THREE.Group(); g.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(0.42, 0.03, 16, 96), steel));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; wheel.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 16), steel, { p: [Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0], r: [0, 0, a + Math.PI / 2] })); wheel.add(mesh(new THREE.SphereGeometry(0.035, 20, 12), gold, { p: [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0] })); }
  wheel.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 64), emblemMaterial(), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.02] })); wheel.children.at(-1).geometry.rotateY(Math.PI / 2);
  const gears = []; const gearDefs = [[0, 0, 0.3, 36, -0.06], [0.52, 0.18, 0.2, 24, -0.06], [-0.5, 0.26, 0.17, 20, -0.06], [0.2, -0.55, 0.15, 18, -0.06], [-0.35, -0.48, 0.13, 16, -0.06]];
  for (const [x, y, r, n, z] of gearDefs) { const ge = mesh(gearGeo(r, n, 0.03, r * 0.09, r * 0.25), x === 0 ? gold : steel, { p: [x, y, z] }); g.add(ge); gears.push({ m: ge, ratio: 0.3 / r }); }
  const bolts = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; const b = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 32), M.chrome(), { r: [0, 0, a + Math.PI / 2] }); g.add(b); bolts.push({ m: b, a }); }
  g.userData = { wheel, gears, bolts, set: (k) => { wheel.rotation.z = -k * 2.2; gears.forEach((ge, i) => (ge.m.rotation.z = (i % 2 ? 1 : -1) * k * 2.2 * ge.ratio)); bolts.forEach((b) => { const r = lerp(0.98, 0.72, smooth(clamp(k * 1.4 - 0.3))); b.m.position.set(Math.cos(b.a) * r, Math.sin(b.a) * r, -0.04); }); } };
  g.userData.set(0); return g;
}

/** A satin car cover draped over a car's body; lift(k, t) peels it off front→back. */
function carCover(car) {
  const sh = car.shape; const nu = 120, nv = 90; const base = [], norm = [], uvs = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = -0.03 + 1.06 * (i / nu), phi = -0.55 + (Math.PI + 1.1) * (j / nv); const uc = clamp(u, 0, 1);
    sh.body(uc, phi, P); let y = P.y; const gy = sh.s.gh.screenOnly ? 0 : (uc > sh.s.gh.ws && uc < sh.s.gh.end ? (() => { const Q = new THREE.Vector3(); sh.greenhouse(uc, phi, Q); return Q.y; })() : 0);
    y = Math.max(y, gy * (Math.abs(Math.cos(phi)) < 0.75 ? 1 : 0)); const wob = Math.sin(i * 0.9) * Math.sin(j * 0.7) * 0.006;
    const x = sh.x(uc) + (u < 0 ? -u * 4 : u > 1 ? -(u - 1) * 4 : 0);
    const out = 1.025 + wob; base.push(new THREE.Vector3(x, Math.max(0.05, y * out + 0.01), P.z * out + Math.sign(P.z) * 0.01)); uvs.push(i / nu, j / nv);
  }
  const geo = new THREE.BufferGeometry(); const pos = new Float32Array(base.length * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const idx = []; for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); } geo.setIndex(idx);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x1c1a18, roughness: 0.5, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xc9a46a), side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.userData.lift = (k, t) => {
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const id = j * (nu + 1) + i; const b = base[id]; const u = i / nu; const peel = smooth(clamp((k * 1.5 - u) * 2.2));
      const flutter = noise1(t * 2.3 + i * 0.13 + j * 0.07) * 0.08 * peel;
      pos[id * 3] = b.x - peel * peel * 2.2; pos[id * 3 + 1] = b.y + peel * (0.9 + u * 0.4) + flutter + Math.sin(peel * Math.PI) * 0.3; pos[id * 3 + 2] = b.z * (1 + peel * 0.25);
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  };
  m.userData.lift(0, 0); return m;
}

// ------------------------------------------------------------------ photoreal asset helpers (local)
/** Bake a loaded model into one mesh per material (≈100 glTF nodes → ≈25 draw calls); hidden nodes are dropped. */
function bakeByMaterial(root) {
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(); const groups = new Map(); const rel = new THREE.Matrix4();
  const shown = (o) => { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !shown(o)) return;
    const g0 = o.geometry; const key = `${o.material.uuid}|${Object.keys(g0.attributes).sort().join(',')}|${g0.index ? 1 : 0}|${Object.keys(g0.morphAttributes).length}`;
    rel.multiplyMatrices(inv, o.matrixWorld); const g = g0.clone().applyMatrix4(rel);
    if (rel.determinant() < 0 && g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
    if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [] }); groups.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat, geos } of groups.values()) { const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0]; if (merged) out.add(new THREE.Mesh(merged, mat)); else for (const g of geos) out.add(new THREE.Mesh(g, mat)); }
  return out;
}

/** Photoreal concept car (Khronos CarConcept) cleaned for the brief: no logos/plates/display, palette paint, cheap dark glass.
 *  Length along the film's +x (nose forward). lights: 0 = parked, 1 = headlamps + tail lamps on. */
async function conceptCar({ paint = 0x6d6f74, metal = 0.85, rough = 0.3, trim = 0x3d0b12, length = 4.45, lights = 0, cabin = 'seats' } = {}) {
  const m = await model('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Graphite');
  const done = new Map();
  const fix = (mat) => {
    if (done.has(mat)) return done.get(mat); const n = mat.name || ''; const c = mat.clone();
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); } // third-party marks live in emissive maps (rims, calipers, mirrors) + the dash display
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.62; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; }
    if (/Paint 1/i.test(n)) { c.color.set(paint); c.metalness = metal; c.roughness = rough; c.clearcoat = 1; c.clearcoatRoughness = 0.03; c.iridescence = 0; }
    if (/Paint 2/i.test(n)) { c.color.set(0x050506); c.metalness = 0.2; c.roughness = 0.25; c.clearcoat = 1; c.clearcoatRoughness = 0.04; c.iridescence = 0; }
    if (/Interior 3/i.test(n)) c.color.set(trim);
    if (/Headlight/i.test(n)) { c.emissive?.set(lights ? 0xfff1dc : 0x000000); c.emissiveIntensity = lights ? 6 : 0.05; }
    if (/Brakelight/i.test(n)) { c.emissive?.set(0xff1408); c.emissiveIntensity = lights ? 2.2 : 0.05; }
    if (/Signallight/i.test(n)) c.emissiveIntensity = 0.05;
    if (/Tireside/i.test(n)) { c.map = null; c.normalMap = null; c.color.set(0x131313); c.roughness = 0.6; } // sidewall texture + relief carry third-party lettering
    if (/Rim2/i.test(n)) { c.color.set(0x9a9b9f); c.roughness = 0.24; } // brushed-titanium spokes instead of mirror chrome
    done.set(mat, c); return c;
  };
  m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material); });
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorFloor|InteriorCage|InteriorSeatsFrame|InteriorSteering|BodyWindshieldWipers|BodyHood(Interior|Under)|Wheel.*BrakePad)/); // hidden by the body / dark glass (fewer triangles for the software renderer)
  if (cabin === false) hide(m, /^Interior/); else if (cabin !== 'full') hide(m, /^Interior(Dash|Floormats|Pillar)/); // false: no cabin at all (dark glass, seen from afar)
  m.rotation.y = Math.PI / 2; // model length is +z → the film's +x convention
  const holder = new THREE.Group(); holder.add(m); return bakeByMaterial(holder);
}

/** Soft contact shadow for the concept car footprint (canvas AO decal). */
function conceptShadow(L = 4.45, W = 1.95, strength = 0.95) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.filter = 'blur(16px)'; g.fillStyle = 'rgba(0,0,0,0.8)'; g.beginPath(); g.roundRect(56, 52, 400, 152, 64); g.fill();
  g.filter = 'blur(7px)'; g.fillStyle = 'rgba(0,0,0,0.95)'; for (const x of [118, 386]) for (const y of [70, 186]) { g.beginPath(); g.ellipse(x, y, 40, 20, 0, 0, TAU); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.2, W * 1.35), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: strength, depthWrite: false }));
  s.rotation.x = -Math.PI / 2; s.position.y = 0.003; s.renderOrder = 2; return s;
}

/** Per-object environment intensity: clones each material once (shared library materials stay untouched). */
function dimEnv(root, scene, k) { const done = new Map(); root.traverse((o) => { if (!o.isMesh || Array.isArray(o.material) || !('envMapIntensity' in o.material)) return; if (!done.has(o.material)) done.set(o.material, envOn(o.material.clone(), scene, k)); o.material = done.get(o.material); }); }

/** Private clone of a cached photo texture with its own tiling (the shared cache stays untouched). */
function tiled(tex, rx, ry, ox = 0, oy = 0) { const c = tex.clone(); c.repeat.set(rx, ry); c.offset.set(ox, oy); c.needsUpdate = true; return c; }

/** Light-pool map for a wall (used as lightMap on uv channel 0): warm scallops under each sconce. xs in 0..1 along the wall. */
function scallopMap(xs, { w = 1024, h = 128, base = 'rgb(16,13,10)', color = [255, 196, 128], top = 0.28, spread = 0.035, reach = 0.9, power = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
  for (const x of xs) {
    const cx = x * w, cy = top * h; g.save(); g.translate(cx, cy); g.scale(spread * w / (reach * h), 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, reach * h); const [r, gg, b] = color;
    gr.addColorStop(0, `rgba(${r},${gg},${b},${power})`); gr.addColorStop(0.25, `rgba(${r},${gg * 0.92 | 0},${b * 0.8 | 0},${0.55 * power})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, reach * h, 0, TAU); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.channel = 0; return t;
}

export async function buildS5(ctx) {
  const shots = [];
  const [wood0, woodBump0, woodRough0, brick0, brickBump0, brickRough0, grass0, waterN] = await Promise.all([
    photo('textures/hardwood2_diffuse.jpg'), photo('textures/hardwood2_bump.jpg', { srgb: false }), photo('textures/hardwood2_roughness.jpg', { srgb: false }),
    photo('textures/brick_diffuse.jpg'), photo('textures/brick_bump.jpg', { srgb: false }), photo('textures/brick_roughness.jpg', { srgb: false }),
    photo('textures/terrain/grasslight-big.jpg'), photo('textures/waternormals.jpg', { srgb: false }),
  ]);

  // ---------------------------------------------------------------- 5.1 vault lock mechanism
  const vs = makeSet(null); await useHdri(vs.scene, HDRI.studio, { env: 0.42, rotation: 2.4 }); // real photo studio: octagonal softbox + spot glint in chrome, gold and the bezel
  const vault = vaultMechanism(envOn(M.titanium().clone(), vs.scene, 0.03)); vs.scene.add(vault);
  spot(vs.scene, { intensity: 14, pos: [1.2, 1.6, 2.2], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xfff0dc });
  spot(vs.scene, { intensity: 10, pos: [-2, -0.8, 1.2], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffb46a });
  vs.onUpdate((t) => vault.userData.set(smooth(clamp((t - 39.8) / 1.6))));
  shots.push(shot('s5.1', 40.0, 41.2, vs, (lt, u, cam) => {
    const k = smooth(u); const d = aim(cam, v3(lerp(0.5, 0.2, k), lerp(0.25, 0.1, k), lerp(0.55, 2.4, k)), v3(lerp(0.4, 0, k), lerp(0.15, 0, k), 0), { fov: 34, near: 0.01, far: 40, roll: lerp(0.3, 0, k) });
    return { focus: d, aperture: lerp(14, 4, k) };
  }, { trans: { type: 'iris', dur: 0.7, center: [0.5, 0.5] }, grade: { exposure: 1.08, bloom: 0.45, streak: 0.2, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 5.2 hygrometer (analogue) on a real wood panel
  const hs = makeSet(null); await useHdri(hs.scene, HDRI.studio, { env: 0.6, rotation: 0.9 });
  const hyg = buildGauge({ min: 0, max: 100, major: 10, minor: 2, label: '% RH', sub: 'climate', radius: 0.06, arc: [-2.2, 2.2] });
  hs.scene.add(hyg);
  const panelMat = new THREE.MeshPhysicalMaterial({ map: tiled(wood0, 0.42, 0.5, 0.05, 0.2), color: 0x6b4a34, roughnessMap: tiled(woodRough0, 0.42, 0.5, 0.05, 0.2), roughness: 0.9, bumpMap: tiled(woodBump0, 0.42, 0.5, 0.05, 0.2), bumpScale: 0.6, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const wallM = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), panelMat); wallM.position.z = -0.025; hs.scene.add(wallM);
  const thermo = buildGauge({ min: 10, max: 30, major: 5, minor: 1, label: '°C', sub: '', radius: 0.035, arc: [-2.2, 2.2] }); thermo.position.set(0.12, -0.03, 0); hs.scene.add(thermo);
  spot(hs.scene, { intensity: 1.0, pos: [0.25, 0.3, 0.4], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  { const dome = envOn(M.crystal().clone(), hs.scene, 0.3); dome.roughness = 0.18; for (const g of [hyg, thermo]) g.traverse((o) => { if (o.isMesh && o.material === M.crystal()) o.material = dome; }); } // photographed studio glint, softened (no specular aliasing)
  hs.onUpdate((t) => { const lt = t - 41.0; hyg.userData.setValue(50 + Math.exp(-lt * 3) * Math.cos(lt * 9) * 18); thermo.userData.setValue(18 + Math.exp(-lt * 3) * Math.cos(lt * 7 + 1) * 2); });
  shots.push(shot('s5.2', 41.2, 42.1, hs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.07, -0.03, u), 0.03, 0.16), v3(lerp(0.0, 0.03, u), 0.0, 0), { fov: 32, near: 0.004, far: 20, roll: 0.08 }); return { focus: d, aperture: 9 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.18, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 5.3 + 5.4 the paddock hall (cover lift, bays)
  const ps = makeSet(null, { fog: new THREE.FogExp2(0x0d0a07, 0.012) }); const P = ps.scene;
  await useHdri(P, HDRI.warehouse, { env: 0.32, rotation: 0 }); // real industrial hall: rows of ceiling lights reflected in every paint and gloss surface
  // smoked-oak plank floor (real wood photo), planks running down the hall
  const floorMat = new THREE.MeshPhysicalMaterial({ map: tiled(wood0, 21, 21), color: 0x5a4334, roughnessMap: tiled(woodRough0, 21, 21), roughness: 0.75, bumpMap: tiled(woodBump0, 21, 21), bumpScale: 0.8, clearcoat: 0.35, clearcoatRoughness: 0.28 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), floorMat); floor.rotation.x = -Math.PI / 2; P.add(floor);
  const presets = [['classic', 0x3d0b12], ['gt', 0x050505], ['supercar', 0x9a9b9f], ['roadster', 0x101a14], ['prototype', 0xcdb48a], ['gt', 0x3d0b12], ['classic', 0xcdb48a], ['supercar', 0x0b0b0c], ['classic', 0x5d5f63], ['roadster', 0x050505]];
  const CONCEPTS = { 3: { paint: 0x5b5d62, metal: 0.9, rough: 0.16, cabin: false }, 8: { paint: 0x060607, metal: 0.05, rough: 0.12, trim: 0x8a6a3a } }; // brushed titanium · gloss black
  const platMat = envOn(M.blackGloss().clone(), P, 0.025); const partMat = envOn(M.glass().clone(), P, 0.06); const bays = [];
  for (let i = 0; i < 10; i++) {
    const row = i < 5 ? -1 : 1; const x = ((i % 5) - 2) * 6.2; const z = row * 4.2;
    const plat = new THREE.Group(); plat.position.set(x, 0, z); P.add(plat);
    plat.add(mesh(roundBox(5.4, 0.16, 2.9, 0.06), platMat, { p: [0, 0.08, 0] }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(1, 1.012, 4, 1, Math.PI / 4), M.emissive(0xffcf8a, 3)); edge.scale.set(3.85, 2.06, 1); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.165; plat.add(edge);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })); up.rotation.x = -Math.PI / 2; up.position.y = 0.01; plat.add(up);
    if (i === 2) { bays.push(plat); continue; } // the hero bay (cover lift) is filled below
    if (CONCEPTS[i]) {
      const c = await conceptCar({ ...CONCEPTS[i], length: 4.45 }); c.position.y = 0.16; c.rotation.y = row > 0 ? Math.PI : 0; plat.add(c); const sh = conceptShadow(); sh.position.y = 0.165; plat.add(sh);
    } else {
      const [preset, color] = presets[i]; const c = buildCar(preset, { lite: true, color, seed: 60 + i }); if (color === 0xcdb48a || color === 0x9a9b9f) dimEnv(c.group, P, 0.13); c.group.position.y = 0.16; c.group.rotation.y = row > 0 ? Math.PI : 0; plat.add(c.group); { const sh = contactShadow(c, 0.8); sh.position.y = 0.165; plat.add(sh); }
    }
    // glass partitions
    const glassP = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), partMat); glassP.position.set(3.1, 1.3, 0); glassP.rotation.y = Math.PI / 2; plat.add(glassP);
    plat.add(mesh(new THREE.BoxGeometry(0.03, 2.6, 0.03), M.gold(), { p: [3.1, 1.3, row * -1.6] }));
    bays.push(plat);
  }
  // hero car under its cover in bay 2 (front row centre)
  const hero = buildCar('classic', { fasteners: false, engine: false, color: 0x3d0b12, seed: 77 }); hero.group.position.y = 0.16; bays[2].add(hero.group); { const sh = contactShadow(hero, 0.8); sh.position.y = 0.165; bays[2].add(sh); }
  const cover = carCover(hero); cover.position.y = 0.16; bays[2].add(cover);
  // old brick walls (real brick photo) with warm light pools under brushed-metal sconces above every bay
  const bayXs = [-12.4, -6.2, 0, 6.2, 12.4];
  const brickMat = (w, h, xs) => new THREE.MeshStandardMaterial({ map: tiled(brick0, w / 1.9, h / 1.9), color: 0x8c766a, roughnessMap: tiled(brickRough0, w / 1.9, h / 1.9), roughness: 1, bumpMap: tiled(brickBump0, w / 1.9, h / 1.9), bumpScale: 1.4, lightMap: scallopMap(xs), lightMapIntensity: 2.4 });
  const backW = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), brickMat(60, 6, bayXs.map((x) => (x + 30) / 60))); backW.position.set(0, 3, -9); P.add(backW);
  const frontW = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), brickMat(60, 6, bayXs.map((x) => (30 - x) / 60))); frontW.position.set(0, 3, 9); frontW.rotation.y = Math.PI; P.add(frontW);
  const endW = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), brickMat(18, 6, [0.22, 0.5, 0.78])); endW.position.set(21, 3, 0); endW.rotation.y = -Math.PI / 2; P.add(endW);
  const sconce = await model('AnisotropyBarnLamp', { size: 0.42, axis: 'max' });
  sconce.traverse((o) => { if (!o.isMesh) return; const c = o.material.clone(); if (/Glass/i.test(c.name)) { c.transmission = 0; c.transparent = true; c.opacity = 0.25; c.depthWrite = false; } if (/Metal/i.test(c.name)) { c.color.set(0xb9b2a6); c.anisotropy = 0; c.clearcoat = 0; } if (/Filament/i.test(c.name)) c.emissiveIntensity = 30; o.material = c; });
  const sb = new THREE.Box3().setFromObject(sconce), fb = new THREE.Box3().setFromObject(findIn(sconce, /Filament/i)[0]); const sc = sb.getCenter(new THREE.Vector3()), fc = fb.getCenter(new THREE.Vector3());
  const toWall = new THREE.Vector2(sc.x - fc.x, sc.z - fc.z).normalize(); const phi = Math.atan2(toWall.x, toWall.y); const sh0 = sb.getSize(new THREE.Vector3()); const reach = Math.abs(toWall.x) * sh0.x / 2 + Math.abs(toWall.y) * sh0.z / 2;
  const sconceAt = (x, y, z, nx, nz) => { const s = new THREE.Group(); s.add(sconce.children[0].clone()); s.rotation.y = Math.atan2(nx, nz) - phi; s.position.set(x - nx * reach, y, z - nz * reach); P.add(s); }; // (nx, nz): direction into the wall
  for (const x of bayXs) { sconceAt(x, 3.6, -9, 0, -1); sconceAt(x, 3.6, 9, 0, 1); }
  for (const z of [-4, 0, 4]) sconceAt(21, 3.6, z, 1, 0);
  // ceiling: linear warm lights, a discreet security dome
  for (let i = -3; i <= 3; i++) lightStrip(P, { w: 0.08, h: 22, pos: [i * 4.5, 5.2, 0], rot: [Math.PI / 2, 0, Math.PI / 2], intensity: 3.2, color: 0xffd9a8 });
  const band = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgb(6,5,4)'); gr.addColorStop(0.5, 'rgb(150,118,84)'); gr.addColorStop(1, 'rgb(6,5,4)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.channel = 0; return t; })();
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.55, metalness: 0.6, lightMap: band, lightMapIntensity: 3 });
  for (let i = -4; i <= 4; i++) P.add(mesh(new THREE.BoxGeometry(0.22, 0.42, 18), beamMat, { p: [i * 6.2 + 3.1, 5.08, 0] }));
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9, lightMap: band, lightMapIntensity: 2.2 })); ceil.position.y = 5.3; ceil.rotation.x = Math.PI / 2; P.add(ceil);
  const dome = mesh(new THREE.SphereGeometry(0.09, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2), M.blackGloss(), { p: [9, 5.25, 0] }); P.add(dome);
  // concierge at the far end: real-wood desk, photoreal Tiffany lamp
  const deskMat = new THREE.MeshPhysicalMaterial({ map: tiled(wood0, 1.2, 0.7), color: 0x4a2c1c, roughness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.08 });
  const desk = mesh(roundBox(2.2, 1.05, 0.7, 0.05), deskMat, { p: [17, 0.52, 0] }); desk.rotation.y = Math.PI / 2; P.add(desk);
  const concierge = buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }); concierge.position.set(17.7, 0, 0); concierge.rotation.y = -Math.PI / 2; concierge.userData.pose(POSES.standHandsBehind); P.add(concierge);
  const tiffany = await model('StainedGlassLamp', { size: 0.62, axis: 'y' }); tiffany.position.set(16.95, 1.05, 0.62); P.add(tiffany);
  tiffany.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (/stainedglass|bulbs/i.test(o.material.name)) o.material.emissiveIntensity = 2.2; } });
  P.add(mesh(new THREE.BoxGeometry(0.72, 0.025, 2.22), M.goldPolished(), { p: [17, 1.0, 0] }));
  const sofa = await model('SheenWoodLeatherSofa', { size: 2.6, axis: 'max' });
  for (const z of [-4.6, 4.6]) { const s = new THREE.Group(); s.add(sofa.children[0].clone()); s.position.set(20.1, 0, z); s.rotation.y = -Math.PI / 2; P.add(s); } // champagne-gold inlay under the desk top
  point(P, { pos: [19.6, 2.6, -0.6], intensity: 7, color: 0xffc68a }); // warm rim on the concierge against the brick
  spot(P, { intensity: 260, pos: [0.5, 5, -1.2], target: [0, 0.6, -4.2], angle: 0.55, penumbra: 0.9, color: 0xfff0dc }); // hero bay key
  spot(P, { intensity: 260, pos: [6.2, 5, 1.5], target: [6.2, 0.6, 4.2], angle: 0.7, penumbra: 1, color: 0xffd9a8 });
  spot(P, { intensity: 180, pos: [14, 4.5, 0], target: [17, 1, 0], angle: 0.5, penumbra: 1, color: 0xffc98a });
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x1a1410, 0.45); P.add(hemi);
  const pd = dust(P, { count: 350, box: [-4, 2.5, -2, 18, 5, 10], size: 0.7, intensity: 0.45, res: ctx.res, seed: 51 });
  ps.onUpdate((t) => { pd.set(t); cover.userData.lift(smooth(clamp((t - 42.2) / 2.6)), t); cover.visible = t < 45.5; hero.lights(0, 0); });
  const heroWorld = v3(0, 0.16, -4.2);
  shots.push(shot('s5.3', 42.1, 44.0, ps, (lt, u, cam) => {
    const k = smooth(u); const d = aim(cam, v3(heroWorld.x + lerp(2.6, 0.9, k), lerp(0.55, 0.75, k), heroWorld.z + lerp(1.7, 2.2, k)), v3(heroWorld.x + lerp(1.2, -0.6, k), 0.7, heroWorld.z + 0.3), { fov: 34, near: 0.02, far: 100 });
    return { focus: d, aperture: 6 };
  }, { trans: { type: 'luma', dur: 0.4 }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.2, threshold: 1.3, gain: [1.04, 1.0, 0.95] } }));
  shots.push(shot('s5.4', 44.0, 46.6, ps, keyCam([v3(-12.5, 1.6, 0.4), v3(-4, 1.8, 0.2), v3(6, 2.2, -0.2)], [v3(-3, 0.8, -1.5), v3(6, 0.9, 0), v3(16, 1.0, 0)], { fov: 38, aperture: 1.6, ease: (x) => x }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.5, streak: 0.22, threshold: 1.2, gain: [1.05, 1.0, 0.93] } }));

  // ---------------------------------------------------------------- 5.5 exterior at dusk, crane up
  const ex = makeSet(null, { bg: null, fog: new THREE.FogExp2(0x4a3a3a, 0.0035) }); const E = ex.scene;
  await useHdri(E, HDRI.sunsetSea, { env: SUN.env, background: true, blur: 0, bgIntensity: SUN.bg, rotation: SUN.rot }); // real sunset photograph: sky, low sun over the water, reflections
  // lawn (real grass photo, dusk-dark) ending at a shoreline; beyond it the photographed lagoon
  const lawnMat = new THREE.MeshStandardMaterial({ map: tiled(grass0, 70, 70), color: 0x4a5040, roughness: 0.95 });
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(160, 96), lawnMat); lawn.rotation.x = -Math.PI / 2; E.add(lawn);
  // pavilion: stone roof slab with soffit downlights, glass curtain wall on titanium mullions, a lit gallery inside
  const bld = new THREE.Group(); E.add(bld);
  const stone = new THREE.MeshStandardMaterial({ color: 0x6f6961, roughness: 0.72 });
  bld.add(mesh(new THREE.BoxGeometry(44, 0.6, 20), stone, { p: [0, 6.7, 0] }));
  bld.add(mesh(new THREE.BoxGeometry(44.2, 0.05, 20.2), M.matte(0x1a1918, 0.9), { p: [0, 7.02, 0] }));
  bld.add(mesh(new THREE.BoxGeometry(30, 0.1, 1.4), M.emissive(0xffd29a, 1.6), { p: [0, 7.05, 0] })); // roof skylight
  bld.add(mesh(new THREE.BoxGeometry(41, 0.3, 17), M.matte(0x151413, 0.8), { p: [0, 0.15, 0] })); // plinth
  const dlMat = M.emissive(0xffd9a8, 7); for (let i = 0; i < 21; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), dlMat); d.rotation.x = Math.PI / 2; d.position.set(-20 + i * 2, 6.39, 9.1); bld.add(d); }
  // interior seen through the glass: warm brick back wall (photo), ceiling light lines, gloss floor, cars on gold-edged platforms
  const inWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 6.1), new THREE.MeshBasicMaterial({ map: tiled(brick0, 40 / 1.9, 6.1 / 1.9), color: new THREE.Color(0xe8b08a).multiplyScalar(0.5) })); inWall.position.set(0, 3.35, -7.6); bld.add(inWall);
  const inSide = new THREE.MeshBasicMaterial({ map: tiled(brick0, 16 / 1.9, 6.1 / 1.9), color: new THREE.Color(0xe8b08a).multiplyScalar(0.3) });
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(16, 6.1), inSide); w.position.set(s * 19.8, 3.35, 0); w.rotation.y = -s * Math.PI / 2; bld.add(w); }
  const inCeil = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), M.matte(0x1d1915, 0.9)); inCeil.position.set(0, 6.38, 0); inCeil.rotation.x = Math.PI / 2; bld.add(inCeil);
  for (let i = -2; i <= 2; i++) { const ls = new THREE.Mesh(new THREE.PlaneGeometry(38, 0.1), M.emissive(0xffd9a8, 4)); ls.rotation.x = Math.PI / 2; ls.position.set(0, 6.36, i * 3); bld.add(ls); }
  const inGloss = envOn(M.blackGloss().clone(), E, 0.04); const inFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), inGloss); inFloor.rotation.x = -Math.PI / 2; inFloor.position.y = 0.31; bld.add(inFloor);
  const inCars = [];
  [['classic', 0x3d0b12, -13], ['gt', 0x9a9b9f, -4.5], ['prototype', 0xcdb48a, 4.5], ['supercar', 0x0b0b0c, 13]].forEach(([preset, color, x], i) => {
    const plat = mesh(roundBox(5.2, 0.14, 2.7, 0.05), inGloss, { p: [x, 0.38, 1.5] }); bld.add(plat);
    const edge = new THREE.Mesh(new THREE.RingGeometry(1, 1.014, 4, 1, Math.PI / 4), M.emissive(0xffcf8a, 3)); edge.scale.set(3.7, 1.92, 1); edge.rotation.x = -Math.PI / 2; edge.position.set(x, 0.456, 1.5); bld.add(edge);
    const c = buildCar(preset, { lite: true, color, seed: 90 + i }); c.group.position.set(x, 0.45, 1.5); c.group.rotation.y = i % 2 ? Math.PI : 0; c.lights(0, 0); bld.add(c.group); inCars.push(c.group);
  });
  for (const g of inCars) dimEnv(g, E, 0.12); // indoors: no sky in the paint
  point(E, { pos: [-8, 5.2, 3], intensity: 60, color: 0xffcf9a }); point(E, { pos: [8, 5.2, 3], intensity: 60, color: 0xffcf9a });
  // glass: real sky reflected on top of the lit interior (additive reflection layer → interior is never dimmed)
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.04, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02 });
  const glassF = new THREE.Mesh(new THREE.PlaneGeometry(40, 6.1), glassMat); glassF.position.set(0, 3.35, 8.0); bld.add(glassF);
  const mull = M.titanium(); for (let i = 0; i <= 20; i++) bld.add(mesh(new THREE.BoxGeometry(0.07, 6.1, 0.22), mull, { p: [-20 + i * 2, 3.35, 8.05] }));
  bld.add(mesh(new THREE.BoxGeometry(40.2, 0.1, 0.24), mull, { p: [0, 0.35, 8.05] }));
  // reflecting pool: true planar mirror of the real sky + pavilion, rippled by the photographed water normal map; stone coping
  const water = new Water(new THREE.PlaneGeometry(40, 8), { textureWidth: 768, textureHeight: 384, waterNormals: waterN, sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0x000000, waterColor: 0x02050a, distortionScale: 0.35, fog: false });
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.06, 13); water.material.uniforms.size.value = 1.2; water.material.fragmentShader = water.material.fragmentShader.replace('reflectionSample + specularLight', 'reflectionSample * 0.55 + specularLight'); E.add(water);
  const coping = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.6 });
  for (const [w, d, x, z] of [[41.2, 0.6, 0, 8.7], [41.2, 0.6, 0, 17.3], [0.6, 8, -20.3, 13], [0.6, 8, 20.3, 13]]) E.add(mesh(new THREE.BoxGeometry(w, 0.12, d), coping, { p: [x, 0.06, z] }));
  // drive: dark stone pavers (real brick photo, charcoal-stained)
  const paveMat = new THREE.MeshStandardMaterial({ map: tiled(brick0, 70 / 1.6, 5 / 1.6), color: 0x1e1c1b, roughness: 1 });
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(70, 5), paveMat); drive.rotation.x = -Math.PI / 2; drive.position.set(0, 0.012, 20); E.add(drive);
  // photoreal lanterns along the drive (dark timber posts, glowing lamps)
  const lantern = await model('Lantern', { size: 3.3, axis: 'y' });
  lantern.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.55); o.material.emissiveIntensity = 7; } });
  for (const x of [-22, -13, -4, 13, 22]) {
    const l = new THREE.Group(); l.add(lantern.children[0].clone()); l.position.set(x, 0, 17.95); l.rotation.y = LANTERN_RY; E.add(l); l.updateMatrixWorld(true);
    const lampC = new THREE.Box3().setFromObject(findIn(l, /_Lantern/)[0]).getCenter(new THREE.Vector3()); const g = glow(0xffc985, 0.9, 0.45); g.position.copy(lampC); E.add(g);
  }
  // photoreal car on the drive, lamps lit, deep burgundy paint mirroring the sunset
  const exCar = await conceptCar({ paint: 0x3d0b12, metal: 0.6, rough: 0.28, trim: 0x2a1a12, length: 4.45, lights: 1, cabin: false }); exCar.position.set(6, 0.012, 19.8); exCar.rotation.y = 0.25; E.add(exCar);
  exCar.traverse((o) => { if (o.isMesh && /Paint|Rim|Glass/i.test(o.material.name)) envOn(o.material, E, /Paint 1/.test(o.material.name) ? 1.6 : 1.0); });
  { const sh = conceptShadow(); sh.position.set(6, 0.015, 19.8); sh.rotation.z = 0.25; E.add(sh); }
  spot(E, { intensity: 90, pos: [6, 6, 24], target: [6, 0.5, 19.5], angle: 0.4, penumbra: 1, color: 0xffd9a8 });
  const amb = new THREE.HemisphereLight(0x3a4a70, 0x100c08, 0.35); E.add(amb);
  ex.onUpdate((t) => { water.material.uniforms.time.value = t * 0.35; });
  shots.push(shot('s5.5', 46.6, 50.0, ex, keyCam([v3(3.5, 0.9, 25), v3(-2, 3.5, 32), v3(-9, 8, 42), v3(-14, 11, 48)], [v3(5, 1.2, 18), v3(2, 3, 8), v3(0, 4, 0), v3(0, 5, 0)], { fov: (u) => lerp(36, 40, u), aperture: (u) => lerp(4, 0.6, smooth(u * 2)), ease: (x) => easeInOutCubic(x), far: 1200 }),
    { trans: { type: 'dissolve', dur: 0.7 }, grade: { exposure: 1.25, bloom: 0.55, streak: 0.25, threshold: 1.1, lift: [0.004, 0.005, 0.012] } }));
  return { shots };
}

// tuning constants (orientation of the photographed panorama and models)
const SUN = { rot: 2.2, env: 0.45, bg: 0.24 };
const LANTERN_RY = 0;
