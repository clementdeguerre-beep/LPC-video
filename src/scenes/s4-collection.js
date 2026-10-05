// SCENE 4 (30–40s) — THE COLLECTION. Macro details (oil droplet, speedometer sweep, wheel-cap
// emblem, leather grain) → FPV flight low between iconic cars on a black mirror floor → rocket up
// to reveal the collection arranged like a clock dial.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, mirrorFloor, lightCone } from './common.js';
import { buildCar, reflectionOf, contactShadow, emblemMaterial } from '../models/car.js';
import { buildGauge } from '../models/props.js';
import { mesh, roundBox, patch } from '../models/geo.js';
import { invLerp, easeOutCubic, easeInCubic, TAU } from '../engine/util.js';

export const COLLECTION = [
  ['classic', 0x050505], ['supercar', 0x5d5f63], ['gt', 0x3d0b12], ['prototype', 0xcdb48a], ['roadster', 0x101a14], ['classic', 0x3d0b12],
  ['supercar', 0x0b0b0c], ['gt', 0xb8b9bc], ['classic', 0xcdb48a], ['prototype', 0x0c0c0d], ['roadster', 0x3d0b12], ['gt', 0x050505],
];

export function galleryRing(set, ctx, { radius = 9, reflections = true, cones = true } = {}) {
  const s = set.scene; const cars = [];
  COLLECTION.forEach(([preset, color], i) => {
    const a = (i / COLLECTION.length) * TAU; const c = buildCar(preset, { lite: true, color, seed: 40 + i }); c.lights(0, 0);
    const g = new THREE.Group(); g.add(c.group); g.add(contactShadow(c, 0.9)); if (reflections) g.add(reflectionOf(c.group));
    g.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius); g.rotation.y = -a; s.add(g); cars.push({ car: c, group: g, angle: a });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({ color: 0xffe8c0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(g.position.x, 0.01, g.position.z); s.add(pool);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.02, 96), M.emissive(0xd9b26a, 1.4)); ring.rotation.x = -Math.PI / 2; ring.position.set(g.position.x, 0.012, g.position.z); s.add(ring);
    if (cones) { const cone = lightCone(9, 2.6, 0xffe6c0, 0.035); cone.position.set(g.position.x, 9, g.position.z); s.add(cone); }
  });
  // central emblem medallion
  const med = new THREE.Mesh(new THREE.CircleGeometry(2.4, 128), emblemMaterial()); med.rotation.x = -Math.PI / 2; med.position.y = 0.01; s.add(med);
  const medRing = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.52, 160), M.emissive(0xd9b26a, 1.2)); medRing.rotation.x = -Math.PI / 2; medRing.position.y = 0.012; s.add(medRing);
  return cars;
}

export async function buildS4(ctx) {
  const shots = [];
  // ---------------------------------------------------------------- 4.1 oil droplet on the engine block
  const os = makeSet('studio', { envIntensity: 1.2 }); const O = os.scene;
  const finGeo = patch((u, v, o) => o.set(u * 0.4 - 0.2, v * 0.3 - 0.15, Math.pow(Math.sin(u * TAU * 7), 2) * 0.008), 0, 1, 280, 0, 1, 4, { flip: false });
  const block = new THREE.Mesh(finGeo, M.castAlu()); O.add(block);
  const oilMat = new THREE.MeshPhysicalMaterial({ color: 0xb8741c, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.9, emissive: 0x2a1404, envMapIntensity: 2 });
  const drop = mesh(new THREE.SphereGeometry(0.006, 32, 24), oilMat, { s: [1, 1.35, 0.55] }); O.add(drop);
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 1), new THREE.MeshPhysicalMaterial({ color: 0x3a2008, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55 })); O.add(trail);
  spot(O, { intensity: 0.6, pos: [0.15, 0.35, 0.3], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  spot(O, { intensity: 0.5, pos: [-0.3, -0.1, 0.15], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffa860 });
  os.onUpdate((t) => { const lt = t - 29.6; const y = 0.06 - easeInCubic(clamp(lt / 1.6)) * 0.12; drop.position.set(0.0143, y, 0.0112); trail.scale.y = Math.max(0.001, 0.06 - y); trail.position.set(0.0143, (0.06 + y) / 2 + 0.004, 0.0084); });
  shots.push(shot('s4.1', 30.0, 31.0, os, (lt, u, cam) => {
    const y = drop.position.y; const d = aim(cam, v3(0.05, y + 0.012, 0.065), v3(0.0143, y - 0.004, 0.009), { fov: 28, near: 0.003, far: 20, roll: 0.06 }); return { focus: d, aperture: 16 };
  }, { trans: { type: 'luma', dur: 0.6 }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.2, threshold: 1.4, gain: [1.04, 1.0, 0.94] } }));

  // ---------------------------------------------------------------- 4.2 vintage speedometer sweep
  const ss = makeSet('studio', { envIntensity: 0.9 }); const speedo = buildGauge({ min: 0, max: 300, major: 20, minor: 10, label: 'km/h', sub: 'Legend Paddock Club', radius: 0.07, arc: [-2.5, 2.5], face: '#08080a', redFrom: 260 });
  ss.scene.add(speedo); const dash = mesh(new THREE.PlaneGeometry(0.6, 0.3), M.walnut(), { p: [0, 0, -0.03] }); ss.scene.add(dash);
  spot(ss.scene, { intensity: 0.9, pos: [0.25, 0.35, 0.35], target: [0, 0, 0], angle: 0.35, penumbra: 1, color: 0xfff0dc });
  point(ss.scene, { intensity: 0.004, pos: [0, 0, 0.02], color: 0xffc070 });
  ss.onUpdate((t) => { const lt = t - 30.9; speedo.userData.setValue(easeOutCubic(clamp(lt / 1.1)) * 248 + Math.sin(lt * 30) * 1.2 * clamp(lt)); });
  shots.push(shot('s4.2', 31.0, 31.9, ss, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.09, 0.06, u), lerp(-0.02, 0.0, u), 0.11), v3(0.0, 0.01, 0), { fov: 32, near: 0.003, far: 20, roll: -0.2 }); return { focus: d, aperture: 10 };
  }, { trans: { type: 'whip', dur: 0.32, dir: [1, -0.2] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.2, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 4.3 the emblem on a wheel cap
  const wsN = makeSet('studio', { envIntensity: 1.1 }); const wheelCar = buildCar('classic', { lite: false, fasteners: false, engine: false, interior: false, seed: 44 }); wsN.scene.add(wheelCar.group);
  const capW = wheelCar.wheels.find((w) => w.front && w.side > 0); const capWorld = new THREE.Vector3();
  spot(wsN.scene, { intensity: 12, pos: [2.6, 1.6, 2.4], target: [1.3, 0.33, 0.8], angle: 0.25, penumbra: 1, color: 0xfff0dc });
  const sweep = spot(wsN.scene, { intensity: 0, pos: [1.0, 0.8, 1.6], target: [1.3, 0.33, 0.8], angle: 0.12, penumbra: 0.6, color: 0xffd9a0 });
  wsN.onUpdate((t) => { wheelCar.spin((t - 31.9) * 0.7); const k = clamp((t - 32.0) / 0.8); sweep.position.set(lerp(0.6, 2.2, k), 0.9, 1.6); sweep.intensity = Math.sin(k * Math.PI) * 6; });
  shots.push(shot('s4.3', 31.9, 32.8, wsN, (lt, u, cam) => {
    capW.group.userData.cap.getWorldPosition(capWorld); const d = aim(cam, capWorld.clone().add(v3(lerp(0.07, 0.04, u), lerp(0.03, 0.015, u), 0.16)), capWorld, { fov: 30, near: 0.005, far: 40 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'iris', dur: 0.4, center: [0.5, 0.5] }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.22, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 4.4 leather grain + seam
  const ls = makeSet('studio', { envIntensity: 1.0 }); const leatherM = M.leather(0x4e1c12); leatherM.normalScale.set(0.35, 0.35); leatherM.roughness = 0.5;
  const cushion = new THREE.Mesh(patch((u, v, o) => { const x = (u - 0.5) * 0.5, z = (v - 0.5) * 0.5; const pill = Math.sin(Math.PI * u) * 0.012 * (Math.abs(z) > 0.08 ? 1 : 0.6) * Math.sin(Math.PI * ((Math.abs(z) > 0.08 ? (Math.abs(z) - 0.08) / 0.17 : (z + 0.08) / 0.16))); return o.set(x, 0.05 + pill, z); }, 0, 1, 80, 0, 1, 80, { flip: true, uvScale: [9, 9] }), leatherM); ls.scene.add(cushion);
  for (const z of [-0.08, 0.08]) { const seam = mesh(new THREE.BoxGeometry(0.46, 0.004, 0.012), M.leather(0x3a140c), { p: [0, 0.061, z] }); ls.scene.add(seam); for (let i = 0; i < 66; i++) ls.scene.add(mesh(new THREE.BoxGeometry(0.0042, 0.0009, 0.0008), new THREE.MeshStandardMaterial({ color: 0xc9a25e, roughness: 0.5 }), { p: [-0.225 + i * 0.007, 0.0605, z + 0.009], r: [0, 0.35, 0] })); }
  spot(ls.scene, { intensity: 1.4, pos: [-0.3, 0.45, 0.25], target: [0, 0.05, 0], angle: 0.45, penumbra: 1, color: 0xffd9a8 });
  spot(ls.scene, { intensity: 0.6, pos: [0.4, 0.2, -0.3], target: [0, 0.05, 0], angle: 0.5, penumbra: 1, color: 0xc8d4ff });
  shots.push(shot('s4.4', 32.8, 33.6, ls, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.12, 0.02, u), 0.1, 0.16), v3(lerp(0.05, -0.05, u), 0.06, 0.08), { fov: 30, near: 0.004, far: 20 }); return { focus: d, aperture: 14 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.15, bloom: 0.35, streak: 0.15, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 4.5 FPV through the gallery → top view
  const gs = makeSet('studio', { envIntensity: 1.0 }); const G = gs.scene;
  const cars = galleryRing(gs, ctx, { radius: 9 }); mirrorFloor(G, { size: 90, opacity: 0.84, envI: 0.03, rough: 0.18 });
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
    const p = at(fpv, easeInOutCubic(flyK) * 0.98 + 0.01); const ahead = at(fpv, Math.min(1, easeInOutCubic(flyK) * 0.98 + 0.06));
    const bank = Math.sin(flyK * Math.PI * 2) * 0.22;
    const top = v3(0.0, 40, 0.05); const pos = p.clone().lerp(top, easeInCubic(upK) * 0.4 + smooth(upK) * 0.6);
    ahead.y = Math.min(ahead.y, 0.7); const outward = ahead.clone().setY(0).normalize().multiplyScalar(2.5); const tgt = ahead.clone().add(outward.multiplyScalar(smooth(flyK * 2) * (1 - upK))).lerp(v3(0, 0, 0), smooth(clamp(upK * 1.4)));
    const d = aim(cam, pos, tgt, { fov: lerp(52, 37, upK), near: 0.05, far: 200, roll: bank * (1 - upK) });
    return { focus: d, aperture: lerp(3, 0.5, upK) };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.5, 0.5] }, grade: { exposure: 1.25, bloom: 0.5, streak: 0.25, threshold: 1.2 } }));
  return { shots, cars };
}
