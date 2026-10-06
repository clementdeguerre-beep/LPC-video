// SCENE 4 (30–40s) — THE COLLECTION. Macro details (oil droplet, speedometer sweep, wheel-cap
// emblem, leather grain) → FPV flight low between iconic cars on a black mirror floor → rocket up
// to reveal the collection arranged like a clock dial.
// Realism pass: every set is lit by a real photographic HDR panorama (studio / warehouse), the
// gallery mixes the parametric classics with three photoreal concept cars, and the macros carry
// photo textures (real wood veneer) and photoreal micro-detail (sand-cast metal, thread, holes).
import { THREE, envOn, makeSet, spot, point, dust, shot, M, v3, clamp, smooth, lerp, aim, at, curve, easeInOutCubic, mirrorFloor, lightCone } from './common.js';
import { buildCar, reflectionOf, contactShadow, emblemMaterial } from '../models/car.js';
import { buildGauge } from '../models/props.js';
import { mesh, patch, lathe } from '../models/geo.js';
import { easeOutCubic, easeInCubic, TAU } from '../engine/util.js';
import { useHdri, HDRI, model, hide, selectVariant, photo } from '../engine/assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const W_ROT = 0.6, CAP_ROT = -1.6; // 4.3 studio yaw (paint, chrome) and the emblem cap's own yaw
export const COLLECTION = [
  ['classic', 0x050505], ['supercar', 0x5d5f63], ['gt', 0x3d0b12], ['prototype', 0xcdb48a], ['roadster', 0x101a14], ['classic', 0x3d0b12],
  ['supercar', 0x0b0b0c], ['gt', 0xb8b9bc], ['classic', 0xcdb48a], ['prototype', 0x0c0c0d], ['roadster', 0x3d0b12], ['gt', 0x050505],
];
/** Ring slots taken by the photoreal concept car (paint in the film palette: titanium, champagne gold, gloss black). */
const CONCEPT_SLOTS = { 1: { paint: 0x6d6f74, metal: 0.85, rough: 0.37 }, 3: { paint: 0xcdb48a, metal: 1, rough: 0.35 }, 6: { paint: 0x060607, metal: 0.05, rough: 0.14 } };

/** Photoreal concept car (Khronos CarConcept), cleaned for the brief: no logos/plates, no dashboard display, palette paint, cheap dark glass. */
async function conceptCar({ paint = 0x6d6f74, metal = 0.85, rough = 0.3, trim = 0x3d0b12, length = 4.45, env = null, envI = 1, envRot = 0 } = {}) {
  const m = await model('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Carmine');
  const done = new Map();
  const fix = (mat) => {
    if (done.has(mat)) return done.get(mat); const n = mat.name || ''; const c = mat.clone();
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); } // Khronos marks live in emissive maps (rims, calipers, mirrors) + the dash display
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.74; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; c.envMapIntensity = 1; }
    // smooth, deep paint: the Carmine powder-coat relief (glitter / sandpaper speckle that shimmers in motion) is dropped
    if (/Paint 1/i.test(n)) { c.color.set(paint); c.metalness = metal; c.roughness = rough; c.normalMap = null; c.clearcoat = 1; c.clearcoatRoughness = 0.03; c.clearcoatNormalMap = null; c.iridescence = 0; c.iridescenceThicknessMap = null; }
    if (/Paint 2/i.test(n)) { c.color.set(0x050506); c.metalness = 0.2; c.roughness = 0.3; c.normalMap = null; c.clearcoat = 1; c.clearcoatRoughness = 0.04; c.clearcoatNormalMap = null; c.iridescence = 0; c.iridescenceThicknessMap = null; }
    if (/Tireside/i.test(n)) { c.map = null; c.normalMap = null; c.color.set(0x131313); c.roughness = 0.6; } // sidewall texture + relief carry third-party lettering (KHRONOS / 3DCommerce / DOT)
    if (/Interior 3/i.test(n)) c.color.set(trim);
    if (/Headlight|Signallight|Brakelight/i.test(n)) c.emissiveIntensity = 0.05; // parked: lamps off
    if (env && 'envMap' in c) { c.envMap = env; c.envMapIntensity = envI; c.envMapRotation.set(0, envRot, 0); }
    done.set(mat, c); return c;
  };
  m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material); });
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorFloor|InteriorCage|InteriorSeatsFrame|InteriorSteering|BodyWindshieldWipers|BodyHood(Interior|Under)|Wheel.*BrakePad)/); // parts hidden by the body/dark glass at gallery distance (fewer triangles for the software renderer)
  m.rotation.y = Math.PI / 2; // model length is +z (nose forward) → the film's +x convention
  const holder = new THREE.Group(); holder.add(m); const hero = bakeByMaterial(holder);
  // mirror-floor copy (seen at ~16 % through the floor): same shapes, cheap standard materials, opaque glass, no cabin
  const cheapOf = new Map(); const cheap = (mm) => {
    if (cheapOf.has(mm)) return cheapOf.get(mm); const glass = /Glass/i.test(mm.name || ''); const plain = /Tireside|Disc/i.test(mm.name || ''); // never copy sidewall / disc maps into the reflection
    const c = new THREE.MeshStandardMaterial({ color: glass ? 0x050506 : plain ? 0x161616 : mm.color, metalness: glass ? 0 : mm.metalness, roughness: glass ? 0.05 : Math.max(0.12, mm.roughness), map: plain ? null : mm.map ?? null, envMap: mm.envMap ?? null, envMapIntensity: mm.envMapIntensity ?? 1 });
    if (/Rim/i.test(mm.name || '')) c.color.multiplyScalar(0.45); // a dimmer rim in the reflection: no bright spoke star floating on the black floor
    if (mm.envMapRotation) c.envMapRotation.copy(mm.envMapRotation); cheapOf.set(mm, c); return c;
  };
  m.traverse((o) => { if (!o.isMesh) return; if (/^(Interior|BodyWindshieldWipers|BodyHood(Interior|Under|Topgrill)|Wheel.*Brake(Pad|Disc))/.test(o.name)) o.visible = false; o.material = cheap(o.material); });
  const mirror = bakeByMaterial(holder); mirror.scale.y = -1; hero.userData.mirror = mirror; return hero;
}

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

/** Soft contact shadow for the concept car footprint (canvas AO decal). */
let shadowTex = null; // one AO canvas shared by every concept car
function conceptShadow(L = 4.45, W = 1.95, strength = 0.95) {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.filter = 'blur(16px)'; g.fillStyle = 'rgba(0,0,0,0.8)'; g.beginPath(); g.roundRect(56, 52, 400, 152, 64); g.fill();
    g.filter = 'blur(7px)'; g.fillStyle = 'rgba(0,0,0,0.95)'; for (const x of [118, 386]) for (const y of [70, 186]) { g.beginPath(); g.ellipse(x, y, 40, 20, 0, 0, TAU); g.fill(); }
    shadowTex = new THREE.CanvasTexture(c); shadowTex.colorSpace = THREE.SRGBColorSpace;
  }
  const tex = shadowTex;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.2, W * 1.35), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: strength, depthWrite: false }));
  s.rotation.x = -Math.PI / 2; s.position.y = 0.003; s.renderOrder = 2; return s;
}

export async function galleryRing(set, ctx, { radius = 9, reflections = true, cones = true, conceptEnv = 1, concepts = true } = {}) {
  const s = set.scene; const cars = []; const pools = [];
  const tailLens = new THREE.MeshPhysicalMaterial({ color: 0x4a050b, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x2a0205, emissiveIntensity: 1 });
  for (let i = 0; i < COLLECTION.length; i++) {
    const [preset, color] = COLLECTION[i]; const a = (i / COLLECTION.length) * TAU; const g = new THREE.Group();
    if (concepts && CONCEPT_SLOTS[i]) {
      const c = await conceptCar({ ...CONCEPT_SLOTS[i], env: s.environment, envI: conceptEnv, envRot: s.environmentRotation?.y ?? 0 }); g.add(c); g.add(conceptShadow()); let refl = null; if (reflections) g.add(refl = c.userData.mirror); cars.push({ car: null, concept: c, group: g, angle: a, refl });
    } else {
      const c = buildCar(preset, { lite: true, color, seed: 40 + i }); c.lights(0, 0);
      for (const tl of c.tailGlows) tl.material = tailLens; // parked: a glossy deep-red lens instead of a flat unlit red disc (shared with the mirror copy)
      g.add(c.group); g.add(contactShadow(c, 0.9)); let refl = null; if (reflections) g.add(refl = reflectionOf(c.group)); cars.push({ car: c, group: g, angle: a, refl });
    }
    g.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius); g.rotation.y = -a; s.add(g);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({ color: 0xffe8c0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(g.position.x, 0.01, g.position.z); s.add(pool); pools.push(pool);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.02, 96), M.emissive(0xd9b26a, 1.4)); ring.rotation.x = -Math.PI / 2; ring.position.set(g.position.x, 0.012, g.position.z); s.add(ring);
    if (cones) { const cone = lightCone(9, 2.6, 0xffe6c0, 0.035); cone.position.set(g.position.x, 9, g.position.z); s.add(cone); }
  }
  // central emblem medallion
  const med = new THREE.Mesh(new THREE.CircleGeometry(2.4, 128), emblemMaterial()); med.rotation.x = -Math.PI / 2; med.position.y = 0.01; s.add(med);
  const medRing = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.52, 160), M.emissive(0xd9b26a, 1.2)); medRing.rotation.x = -Math.PI / 2; medRing.position.y = 0.012; s.add(medRing);
  cars.pools = pools; return cars;
}

/** 1-row data texture (RGBA8) sampled across one fin period: f(phase 0..1) → [r,g,b]. */
function periodTex(f, n = 256, srgb = false) {
  const d = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { const [r, g, b] = f((i + 0.5) / n); d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, n, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t;
}

export async function buildS4(ctx) {
  const shots = [];
  const [castN, wood0, woodBump0, woodRough0] = await Promise.all([
    photo('models/CarConcept/Powdercoat_N.webp', { srgb: false, repeat: [56, 42] }),
    photo('textures/hardwood2_diffuse.jpg', { srgb: true, repeat: [0.42, 0.1] }), photo('textures/hardwood2_bump.jpg', { srgb: false, repeat: [0.42, 0.1] }), photo('textures/hardwood2_roughness.jpg', { srgb: false, repeat: [0.42, 0.1] }),
  ]);
  // one knot-free plank of the real wood photo, lacquered dark (walnut-like veneer); private clones so the shared cache is untouched
  const [wood, woodBump, woodRough] = [wood0, woodBump0, woodRough0].map((t) => { const c = t.clone(); c.offset.set(0.53, 0.877); c.needsUpdate = true; return c; });

  // ---------------------------------------------------------------- 4.1 oil droplet on the engine block
  const os = makeSet(null, { envIntensity: 1 }); const O = os.scene; await useHdri(O, HDRI.studio, { env: 0.9, rotation: 2.2 }); // real photo studio: octagonal softbox glint in the drop and on the machined crests
  // machined cooling fins: flat polished crests, filleted flanks, sand-cast grooves darkened with old oil
  const FX = 0.0143, P = 0.019, D = 0.008, TOP = 0.0047, Wd = 0.4, Hh = 0.3;
  const finH = (x) => { const ph = (((x - FX) / P) % 1 + 1) % 1; const dc = Math.min(ph, 1 - ph) * P; return D * (1 - smooth(clamp((dc - TOP) / 0.0026))); };
  const finGeo = patch((u, v, o) => o.set(u * Wd - Wd / 2, v * Hh - Hh / 2, finH(u * Wd - Wd / 2)), 0, 1, 900, 0, 1, 6, { flip: false });
  const dcOf = (ph) => Math.min(ph, 1 - ph) * P;
  const finRough = periodTex((ph) => { const k = clamp((dcOf(ph) - TOP) / 0.0022); return [0, Math.round(lerp(0.13, 0.5, k) * 255), 0]; });
  const finAlb = periodTex((ph) => { const k = clamp((dcOf(ph) - TOP) / 0.0035); const v = lerp(205, 92, k); return [v, v * 0.97, v * 0.9]; }, 256, true);
  for (const t of [finRough, finAlb]) { t.repeat.set(Wd / P, 1); t.offset.set(-(Wd / 2 + FX) / P, 0); }
  const finMat = new THREE.MeshPhysicalMaterial({ color: 0xb4b5b8, map: finAlb, metalness: 1, roughness: 1, roughnessMap: finRough, normalMap: castN, normalScale: new THREE.Vector2(0.1, 0.1) });
  const block = new THREE.Mesh(finGeo, finMat); O.add(block);
  // the droplet: a refracting, amber teardrop (real transmission + attenuation), flattened against the fin face
  // profile (units of 5.2 mm, centred): a round heavy bulb, a straight taper tangent to it and a small hemispherical tip — 68 steps, no facets, no cone
  const dropProf = []; {
    const Rb = 1, cb = -0.5, Rt = 0.26, ct = 1.24, ph = Math.asin((Rb - Rt) / (ct - cb));
    for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + (i / 40) * (ph + Math.PI / 2); dropProf.push([Rb * Math.cos(a), cb + Rb * Math.sin(a)]); }
    for (let i = 1; i < 8; i++) { const k = i / 8; dropProf.push([lerp(Rb, Rt, k) * Math.cos(ph), lerp(cb + Rb * Math.sin(ph), ct + Rt * Math.sin(ph), k)]); }
    for (let i = 0; i <= 20; i++) { const a = ph + (i / 20) * (Math.PI / 2 - ph); dropProf.push([Rt * Math.cos(a), ct + Rt * Math.sin(a)]); }
    for (const q of dropProf) q[0] = Math.max(0.0001, q[0]);
  }
  const oilMat = new THREE.MeshPhysicalMaterial({ color: 0xffb04a, roughness: 0.01, metalness: 0, transmission: 0.94, thickness: 0.006, ior: 1.47, attenuationColor: new THREE.Color(0xc8640a), attenuationDistance: 0.007, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.0, emissive: 0x4a1c02, emissiveIntensity: 0.35 });
  envOn(oilMat, O, 1.6);
  const drop = mesh(lathe(dropProf, 72), oilMat, { s: [0.0052, 0.0052, 0.0033] }); O.add(drop);
  // the light focused through the drop pools as an amber caustic on the metal just below it
  const cc = document.createElement('canvas'); cc.width = cc.height = 64; { const g = cc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const caustic = new THREE.Mesh(new THREE.PlaneGeometry(0.0064, 0.003), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cc), color: new THREE.Color(0xff9a2a).multiplyScalar(0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); O.add(caustic);
  // wet film the droplet leaves on the crest: feathered sides, narrowing and drying out toward the top (alpha gradient, no hard edges)
  const tc = document.createElement('canvas'); tc.width = 64; tc.height = 256; {
    const g = tc.getContext('2d'); const img = g.createImageData(64, 256);
    for (let y = 0; y < 256; y++) { const v = 1 - y / 255; const hw = 0.46 * (1 - 0.55 * v); const fade = Math.pow(1 - v, 1.6) * smooth(clamp(v / 0.04));
      for (let x = 0; x < 64; x++) { const dx = Math.abs((x + 0.5) / 64 - 0.5) / hw; const a = dx >= 1 ? 0 : Math.pow(1 - dx * dx, 1.8) * fade; const i = (y * 64 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255); img.data[i + 3] = 255; } }
    g.putImageData(img, 0, 0);
  }
  const trailMat = new THREE.MeshPhysicalMaterial({ color: 0x7a4a14, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, emissive: 0x4a1c02, emissiveIntensity: 0.18, transparent: true, opacity: 0.5, alphaMap: new THREE.CanvasTexture(tc), depthWrite: false }); envOn(trailMat, O, 1.4); // a faint amber film, glossy
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.0046, 1), trailMat); O.add(trail);
  spot(O, { intensity: 0.6, pos: [0.15, 0.35, 0.3], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  spot(O, { intensity: 0.5, pos: [-0.3, -0.1, 0.15], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffa860 });
  os.onUpdate((t) => { const lt = t - 29.6; const y = 0.06 - easeInCubic(clamp(lt / 1.6)) * 0.12; drop.position.set(FX, y, D + 0.0002); caustic.position.set(FX, y - 0.0086, D + 0.00015); trail.scale.y = Math.max(0.001, 0.06 - y); trail.position.set(FX, (0.06 + y) / 2 + 0.003, D + 0.0003); });
  shots.push(shot('s4.1', 30.0, 31.0, os, (lt, u, cam) => {
    const y = drop.position.y; const d = aim(cam, v3(0.05, y + 0.012, 0.065), v3(0.0143, y - 0.004, 0.009), { fov: 28, near: 0.003, far: 20, roll: 0.06 }); return { focus: d, aperture: 16 };
  }, { trans: { type: 'luma', dur: 0.6 }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.2, threshold: 1.4, gain: [1.04, 1.0, 0.94] } }));

  // ---------------------------------------------------------------- 4.2 vintage speedometer sweep
  const ss = makeSet(null, { envIntensity: 1 }); await useHdri(ss.scene, HDRI.studio, { env: 0.85, rotation: -0.41 }); // softbox placed just off the glass so it glints across one side of the dial
  const speedo = buildGauge({ min: 0, max: 300, major: 20, minor: 10, label: 'km/h', sub: 'Legend Paddock Club', radius: 0.07, arc: [-2.5, 2.5], face: '#08080a', redFrom: 260 });
  speedo.traverse((o) => { if (o.isMesh && o.material === M.crystal()) o.visible = false; }); // small centre dome → full flat cover glass below
  // the printed dial face keeps deep blacks: almost no studio fill (its rough sheen washed the dial grey and showed the round lamp as an orb above the hub)
  speedo.traverse((o) => { if (o.isMesh && o.material.map && o.material.isMeshStandardMaterial) { o.material.roughness = 0.55; envOn(o.material, ss.scene, 0.12); o.material.envMapRotation.set(0, -0.41, 0); } });
  // cover glass: black base + additive blending = pure Fresnel reflection of the real studio. A radial alpha falloff keeps the
  // reflection to a thin crescent along the bezel (it never crosses the needle's path), and the softbox is turned to the upper-left
  // rim, away from the 220-300 payoff and the red zone.
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; { const g = gc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, '#000'); gr.addColorStop(0.78, '#000'); gr.addColorStop(0.9, '#555'); gr.addColorStop(0.985, '#fff'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const coverMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.02, specularIntensity: 1, ior: 1.52, transparent: true, alphaMap: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false });
  envOn(coverMat, ss.scene, 0.35); coverMat.envMapRotation.set(0, -1.39, 0);
  speedo.add(mesh(new THREE.CircleGeometry(0.0745, 96), coverMat, { p: [0, 0, 0.0085] }));
  ss.scene.add(speedo);
  const veneer = new THREE.MeshPhysicalMaterial({ map: wood, color: 0x6a3a22, bumpMap: woodBump, bumpScale: 0.6, roughnessMap: woodRough, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
  const dash = mesh(new THREE.PlaneGeometry(0.6, 0.3), veneer, { p: [0, 0, -0.03] }); ss.scene.add(dash);
  // turned-aluminium bezel ring set into the veneer
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xbfc0c4, metalness: 1, roughness: 0.22, anisotropy: 0.9, anisotropyRotation: Math.PI / 2 });
  const bez = mesh(new THREE.RingGeometry(0.0835, 0.093, 128), ringMat, { p: [0, 0, -0.029] }); ss.scene.add(bez);
  spot(ss.scene, { intensity: 0.9, pos: [0.25, 0.35, 0.35], target: [0, 0, 0], angle: 0.35, penumbra: 1, color: 0xfff0dc });
  point(ss.scene, { intensity: 0.004, pos: [0, 0, 0.02], color: 0xffc070 });
  ss.onUpdate((t) => { const lt = t - 30.9; speedo.userData.setValue(easeOutCubic(clamp(lt / 1.1)) * 248 + Math.sin(lt * 30) * 1.2 * clamp(lt)); });
  shots.push(shot('s4.2', 31.0, 31.9, ss, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.09, 0.06, u), lerp(-0.02, 0.0, u), 0.11), v3(0.0, lerp(0.01, 0.0, smooth(clamp((u - 0.4) / 0.6))), 0), { fov: lerp(32, 29, smooth(clamp((u - 0.4) / 0.6))), near: 0.003, far: 20, roll: -0.2 }); return { focus: d, aperture: 10 }; // settles and pushes in on the gold pivot: the iris opens out of it
  }, { trans: { type: 'whip', dur: 0.32, dir: [1, -0.2] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.2, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 4.3 the emblem on a wheel cap
  // dark photo studio (not the warehouse): the black paint mirrors near-black with one softbox, the chrome picks up soft continuous highlights
  const wsN = makeSet(null, { envIntensity: 1 }); await useHdri(wsN.scene, HDRI.studio, { env: 0.42, rotation: W_ROT });
  const wheelCar = buildCar('classic', { lite: false, fasteners: false, engine: false, interior: false, seed: 44 }); wsN.scene.add(wheelCar.group);
  const capW = wheelCar.wheels.find((w) => w.front && w.side > 0); const capWorld = new THREE.Vector3();
  { // shot-local chrome: a touch of polish haze so the thin spokes read as continuous soft highlights, not dashed light rows
    const soft = M.chrome().clone(); soft.roughness = 0.24; soft.color.set(0xa9a59d); envOn(soft, wsN.scene, 0.3); soft.envMapRotation.set(0, W_ROT, 0); // dim studio → the key light draws one thin line per spoke
    wheelCar.group.traverse((o) => { if (o.isMesh && o.material === M.chrome()) o.material = soft; });
    envOn(wheelCar.paint, wsN.scene, 0.3); wheelCar.paint.envMapRotation.set(0, W_ROT, 0);
    const capMat = capW.group.userData.cap.material; envOn(capMat, wsN.scene, 0.85); capMat.envMapRotation.set(0, CAP_ROT, 0); // the softbox rakes the cap at a grazing angle: dark mirror field, the gold relief edges glow
  }
  spot(wsN.scene, { intensity: 12, pos: [2.6, 1.6, 2.4], target: [1.3, 0.33, 0.8], angle: 0.25, penumbra: 1, color: 0xfff0dc });
  const sweep = spot(wsN.scene, { intensity: 0, pos: [1.0, 0.8, 1.6], target: [1.3, 0.33, 0.8], angle: 0.12, penumbra: 0.6, color: 0xffd9a0 });
  wsN.onUpdate((t) => { wheelCar.spin((t - 31.9) * 0.7); const k = clamp((t - 32.0) / 0.8); sweep.position.set(lerp(0.6, 2.2, k), 0.9, 1.6); sweep.intensity = Math.sin(k * Math.PI) * 6; });
  shots.push(shot('s4.3', 31.9, 32.8, wsN, (lt, u, cam) => {
    capW.group.userData.cap.getWorldPosition(capWorld); const d = aim(cam, capWorld.clone().add(v3(lerp(0.07, 0.04, u), lerp(0.03, 0.015, u), 0.16)), capWorld, { fov: 30, near: 0.005, far: 40 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'iris', dur: 0.4, center: [0.5, 0.5] }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.22, threshold: 1.3, gain: [1.05, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 4.4 leather grain + seam
  const ls = makeSet(null, { envIntensity: 1 }); await useHdri(ls.scene, HDRI.studio, { env: 0.26, rotation: 3.38 }); // softbox reflected low on the far pillow, near leather stays deep
  const leatherM = M.leather(0x45101a); leatherM.normalScale.set(0.3, 0.3); leatherM.roughness = 0.52; leatherM.specularIntensity = 0.7; leatherM.sheen = 0.2; leatherM.sheenColor.set(0x4a161c); leatherM.sheenRoughness = 0.5; leatherM.specularColor.set(0xffe0c0); // warm sheen: a white glaze over burgundy read lavender
  const cushY = (x, z) => { const u = x / 0.5 + 0.5; const az = Math.abs(z); return 0.05 + Math.sin(Math.PI * u) * 0.012 * (az > 0.08 ? 1 : 0.6) * Math.sin(Math.PI * (az > 0.08 ? (az - 0.08) / 0.17 : (z + 0.08) / 0.16)); };
  const cushion = new THREE.Mesh(patch((u, v, o) => { const x = (u - 0.5) * 0.5, z = (v - 0.5) * 0.5; return o.set(x, cushY(x, z), z); }, 0, 1, 120, 0, 1, 200, { flip: true, uvScale: [9, 9] }), leatherM); ls.scene.add(cushion);
  // seams: a dark piped welt sunk in the valley between the pillows, gold thread stitched through visible holes on both sides
  // waxed, twisted gold thread: a diagonal ply normal map gives each stitch its twist
  const ply = document.createElement('canvas'); ply.width = ply.height = 64; { const g = ply.getContext('2d'); const img = g.createImageData(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const ph = ((x + y * 1.5) / 64) * TAU * 3; const nx = Math.cos(ph) * 0.55; const i = (y * 64 + x) * 4; img.data[i] = 128 + nx * 127; img.data[i + 1] = 128 - nx * 60; img.data[i + 2] = 230; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }
  const plyN = new THREE.CanvasTexture(ply); plyN.wrapS = plyN.wrapT = THREE.RepeatWrapping; plyN.repeat.set(1, 3);
  const threadMat = new THREE.MeshPhysicalMaterial({ color: 0x8c7650, roughness: 0.5, metalness: 0.1, normalMap: plyN, normalScale: new THREE.Vector2(0.9, 0.9), sheen: 0.4, sheenColor: new THREE.Color(0xd9c49a), sheenRoughness: 0.4 }); // champagne, not mustard
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050102 });
  const stitchGeo = new THREE.CapsuleGeometry(0.00056, 0.0044, 3, 8); stitchGeo.rotateZ(Math.PI / 2);
  const holeGeo = new THREE.CircleGeometry(0.00058, 10); holeGeo.rotateX(-Math.PI / 2);
  const rows = []; for (const z of [-0.08, 0.08]) for (const side of [-1, 1]) rows.push([z, side]);
  const N = 64; const stitches = new THREE.InstancedMesh(stitchGeo, threadMat, rows.length * N); const holes = new THREE.InstancedMesh(holeGeo, holeMat, rows.length * N * 2);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), qi = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3(); let si = 0, hi = 0;
  const weltMat = M.leather(0x1e0508); weltMat.normalScale.set(0.3, 0.3); weltMat.roughness = 0.68; weltMat.specularIntensity = 0.6; weltMat.sheen = 0.2;
  for (const z of [-0.08, 0.08]) { const welt = mesh(new THREE.CylinderGeometry(0.0023, 0.0023, 0.5, 20, 1), weltMat, { p: [0, 0.0503, z], r: [0, 0, Math.PI / 2] }); ls.scene.add(welt); }
  for (const [z, side] of rows) {
    for (let i = 0; i < N; i++) {
      const x = -0.2205 + i * 0.007; const zz = z + side * 0.0088; const y = cushY(x, zz);
      e.set(0, side * 0.32, 0); q.setFromEuler(e); pp.set(x, y + 0.00012, zz); mtx.compose(pp, q, sc); stitches.setMatrixAt(si++, mtx); // pulled down into the hide
      for (const k of [-1, 1]) { const hx = x + k * 0.0031 * Math.cos(0.32), hz = zz - side * k * 0.0031 * Math.sin(0.32); pp.set(hx, cushY(hx, hz) + 0.00012, hz); mtx.compose(pp, qi, sc); holes.setMatrixAt(hi++, mtx); }
    }
  }
  ls.scene.add(stitches, holes);
  spot(ls.scene, { intensity: 1.05, pos: [-0.3, 0.45, 0.25], target: [0, 0.05, 0], angle: 0.45, penumbra: 1, color: 0xffd9a8 });
  spot(ls.scene, { intensity: 0.5, pos: [0.4, 0.2, -0.3], target: [0, 0.05, 0], angle: 0.5, penumbra: 1, color: 0xf2e6da }); // warm-neutral rim (a cool rim turned the burgundy lavender)
  shots.push(shot('s4.4', 32.8, 33.6, ls, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.12, 0.02, u), 0.1, 0.16), v3(lerp(0.05, -0.05, u), 0.06, 0.08), { fov: 30, near: 0.004, far: 20 }); return { focus: d, aperture: 14 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.15, bloom: 0.35, streak: 0.15, threshold: 1.4, gain: [1.03, 1.0, 0.95] } }));

  // ---------------------------------------------------------------- 4.5 FPV through the gallery → top view
  const gs = makeSet(null, { envIntensity: 1 }); const G = gs.scene; await useHdri(G, HDRI.warehouse, { env: 0.5, background: true, bgIntensity: 0.09, blur: 0.16 }); // the collection lives in a real (dim, defocused) hall
  const cars = await galleryRing(gs, ctx, { radius: 9, conceptEnv: 0.9 }); const floor = mirrorFloor(G, { size: 600, opacity: 0.84, envI: 0.03, rough: 0.18 });
  // rising to the top view the mirror copies sit right under their cars: the floor closes to opaque black and they are skipped
  let floorK = 0; gs.onUpdate((t) => { floorK = smooth(clamp((t - 38.3) / 0.7)); floor.material.opacity = 0.84 + 0.16 * floorK; for (const p of cars.pools) p.material.opacity = 0.05 + 0.05 * floorK; }); // from above, a warmer pool keeps the black cars from sinking into the floor
  // the black floor dissolves into the photographic hall: a soft dark band at the horizon instead of a hard CG edge
  const hc = document.createElement('canvas'); hc.width = 4; hc.height = 256; { const g = hc.getContext('2d'); const img = g.createImageData(4, 256); // rows top→bottom = y 18 m → -2 m
    for (let r = 0; r < 256; r++) { const y = 18 - (r / 255) * 20; const a = 1 - Math.pow(smooth(clamp((y + 1.2) / 9.5)), 0.75); for (let x = 0; x < 4; x++) { const i = (r * 4 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255); img.data[i + 3] = 255; } }
    g.putImageData(img, 0, 0); }
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 20, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0x020202, alphaMap: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }));
  haze.position.y = 8; G.add(haze);
  // mirror copies only for cars near the lens (far ones are a few dim pixels at 16 %): saves the software rasteriser ~40 % of the geometry
  const reflLOD = (cam) => { for (const c of cars) if (c.refl) c.refl.visible = floorK < 1 && cam.position.distanceTo(c.group.position) < 19; };
  spot(G, { intensity: 160, pos: [0, 22, 0], target: [0, 0, 0], angle: 0.25, penumbra: 0.8, color: 0xfff1dc });
  const quad = []; for (let q = 0; q < 4; q++) { const a = (q / 4) * TAU + TAU / 8; quad[q] = spot(G, { intensity: 900, pos: [Math.cos(a) * 6, 13, Math.sin(a) * 6], target: [Math.cos(a) * 9.5, 0.4, Math.sin(a) * 9.5], angle: 0.62, penumbra: 0.9, color: q % 2 ? 0xfff1dc : 0xffe2b8 }); }
  gs.onUpdate((t) => { const up = smooth(clamp((t - 37.4) / 2.2)); for (const l of quad) l.intensity = 900 * (1 - up * 0.85); });
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x050505, 0.25); G.add(hemi);
  const dd = dust(G, { count: 400, box: [0, 3, 0, 24, 6, 24], size: 0.8, intensity: 0.5, res: ctx.res, seed: 41 }); gs.onUpdate((t) => dd.set(t));
  const a0 = TAU * (0.5 / 12); // the gap between car 0 and car 1
  const fpv = curve([
    v3(Math.cos(a0) * 17, 0.9, Math.sin(a0) * 17), v3(Math.cos(a0) * 11, 0.65, Math.sin(a0) * 11), v3(Math.cos(a0) * 6.5, 0.7, Math.sin(a0) * 6.5),
    v3(Math.cos(a0 + 0.9) * 6.0, 0.75, Math.sin(a0 + 0.9) * 6.0), v3(Math.cos(a0 + 1.8) * 6.2, 0.8, Math.sin(a0 + 1.8) * 6.2), v3(Math.cos(a0 + 2.5) * 5.6, 1.2, Math.sin(a0 + 2.5) * 5.6),
  ]);
  shots.push(shot('s4.5', 33.6, 40.0, gs, (lt, u, cam) => {
    const flyK = clamp(lt / 4.2); const upK = smooth(clamp((lt - 3.8) / 2.6));
    const s = easeInOutCubic(flyK) * 0.98 + 0.01; const p = at(fpv, s); const ahead = at(fpv, Math.min(1, s + 0.05));
    const bank = Math.sin(flyK * Math.PI * 2) * 0.22;
    const top = v3(0.0, 40, 0.05); const pos = p.clone().lerp(top, easeInCubic(upK) * 0.4 + smooth(upK) * 0.6);
    ahead.y = Math.min(ahead.y, 0.7); const outward = ahead.clone().setY(0).normalize().multiplyScalar(2.5); let tgt = ahead.clone().add(outward.multiplyScalar(smooth(flyK * 2) * (1 - upK)));
    // on the inward run the outward bias pushed the aim point behind the lens (a 180° snap at 34.8, then 0.6 s staring back at the
    // empty hall): hold the travel heading, then bank round (yaw decreasing, with the path's own left turn) onto that aim by 35.55
    const w = smooth(clamp((flyK - 0.333) / 0.131));
    if (w < 1) {
      const tan = fpv.getTangent(clamp(s)); let yT = Math.atan2(tan.z, tan.x); if (yT < 0) yT += TAU; const od = tgt.clone().sub(p);
      const yaw = lerp(yT, Math.atan2(od.z, od.x), w); const dist = lerp(3, Math.hypot(od.x, od.z), w); tgt = v3(p.x + Math.cos(yaw) * dist, tgt.y, p.z + Math.sin(yaw) * dist);
    }
    tgt.lerp(v3(0, 0, 0), smooth(clamp(upK * 1.4)));
    const d = aim(cam, pos, tgt, { fov: lerp(52, 37, upK), near: 0.05, far: 200, roll: bank * (1 - upK) }); reflLOD(cam);
    return { focus: d, aperture: lerp(3, 0.5, upK) };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.5, 0.5] }, grade: { exposure: 1.25, bloom: 0.5, streak: 0.25, threshold: 1.2 } }));
  return { shots, cars };
}
