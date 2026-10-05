// SCENE 2 (8–18s) — THE ANATOMY. The car separates into a floating exploded view traced in gold,
// macro passes over a bolt thread, a titanium washer, a wiring harness and a stitched steering
// seam, then everything re-assembles in one wave; pull back to a top-down on a mirror floor.
import { THREE, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, mirrorFloor } from './common.js';
import { buildCar, reflectionOf, contactShadow, emblemMaterial } from '../models/car.js';
import { boltGeo, washerGeo, tube, mesh, merge } from '../models/geo.js';
import { invLerp, easeOutCubic, easeInOutQuint, TAU } from '../engine/util.js';

const T0 = 8;

/** Explosion state over global time: out (front→back), hold, back in one wave (rear→front). */
export function explodeAt(t, key) {
  const out = smooth(invLerp(T0 + 0.7 + key * 0.9, T0 + 2.9 + key * 0.9, t));
  const back = easeInOutQuint(invLerp(14.3 + (1 - key) * 1.0, 15.6 + (1 - key) * 1.0, t));
  return out * (1 - back);
}

function heroSteering() {
  const g = new THREE.Group(); const leather = M.leather(0x14100e); const R = 0.19, r = 0.017;
  g.add(mesh(new THREE.TorusGeometry(R, r, 24, 160), leather));
  // baseball stitch in gold thread along the inner seam
  const st = []; const n = 440;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU; const side = i % 2 ? 1 : -1; const c = Math.cos(a), s = Math.sin(a);
    const b = new THREE.BoxGeometry(0.0009, 0.0009, 0.0052); b.rotateY(side * 0.55); b.rotateX(Math.PI / 2);
    b.translate((R - r * 0.92) * c, (R - r * 0.92) * s, side * 0.0032); b.rotateZ(0); st.push(b);
  }
  g.add(new THREE.Mesh(merge(st), new THREE.MeshStandardMaterial({ color: 0xd9b26a, metalness: 0.3, roughness: 0.45, emissive: 0x2a1a06 })));
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 1.15; const sp = new THREE.Group(); sp.rotation.z = a;
    sp.add(mesh(new THREE.BoxGeometry(0.17, 0.026, 0.005), M.alu(), { p: [0.09, 0, 0] }));
    for (let h = 0; h < 3; h++) sp.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 20), M.matte(0x020202), { p: [0.05 + h * 0.035, 0, 0], r: [Math.PI / 2, 0, 0] }));
    g.add(sp);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 48), emblemMaterial(), { r: [Math.PI / 2, 0, 0] }); hub.geometry.rotateY(Math.PI / 2); g.add(hub);
  return g;
}

function harness() {
  const g = new THREE.Group(); const cols = [0x6a1018, 0xd8b06a, 0x101010, 0x8a8a8a, 0x3a0a10, 0xc9a050, 0x1a1a1a];
  const path = (k) => { const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; const a = t * TAU * 1.6 + k * (TAU / cols.length); pts.push(new THREE.Vector3(t * 0.7 - 0.35, Math.sin(t * 3) * 0.05 + Math.sin(a) * 0.009, Math.cos(a) * 0.009)); } return pts; };
  cols.forEach((c, k) => g.add(new THREE.Mesh(tube(path(k), 0.0035, 120, 8), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.8 }))));
  for (const x of [-0.36, 0.36]) g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6), M.goldPolished(), { p: [x, Math.sin((x + 0.35) / 0.7 * 3) * 0.05, 0], r: [0, 0, Math.PI / 2] }));
  return g;
}

export async function buildS2(ctx, shared = {}) {
  const set = makeSet('studio', { envIntensity: 0.9 }); const s = set.scene;
  const car = buildCar('classic', { seed: 21 }); s.add(car.group);
  const refl = reflectionOf(car.group); refl.visible = false; s.add(refl);
  const shadow = contactShadow(car, 0.9); s.add(shadow);
  const floor = mirrorFloor(s, { opacity: 0.86, envI: 0.04, rough: 0.2 });
  const top = spot(s, { intensity: 150, pos: [0, 9, 2], target: [0, 0.6, 0], angle: 0.5, penumbra: 1, color: 0xfff1de });
  spot(s, { intensity: 120, pos: [-7, 2.5, -5], target: [0, 0.8, 0], angle: 0.5, penumbra: 1, color: 0xffb870 });
  spot(s, { intensity: 90, pos: [7, 1.5, 6], target: [0, 0.8, 0], angle: 0.5, penumbra: 1, color: 0xc4d0ff });
  const d = dust(s, { count: 220, box: [0, 1.5, 0, 10, 4, 8], size: 0.8, intensity: 0.5, res: ctx.res, seed: 11 });

  const steer = heroSteering(); car.interior.userData.steering.visible = true;
  set.onUpdate((t) => {
    d.set(t);
    car.setExplode((p) => explodeAt(t, p.key), t);
    const eAll = explodeAt(t, 0.5);
    car.setOutline(smooth(invLerp(T0 + 1.0, T0 + 2.4, t)) * (1 - smooth(invLerp(15.6, 16.8, t))));
    car.group.rotation.y = Math.sin((t - T0) * 0.12) * 0.12 * eAll;
    car.spin(0); refl.visible = t > 16.0; shadow.material.opacity = 0.9 * (1 - eAll);
    floor.material.opacity = lerp(0.0, 0.86, smooth(invLerp(14.8, 16.6, t))); floor.visible = floor.material.opacity > 0.01;
    top.intensity = 150 * (1 - smooth(invLerp(15.8, 17.0, t)));
  });

  const shots = [];
  // 2.1 — from the hangar aerial down into an orbit around the separating car
  shots.push(shot('s2.1', 8.0, 12.3, set, keyCam(
    [v3(-3, 14, 18), v3(-5.5, 5.0, 8.5), v3(-6.6, 2.8, 3.5), v3(-5.4, 2.4, -1.8)],
    [v3(0, 0, 0), v3(0, 0.7, 0), v3(0.2, 0.9, 0), v3(0.3, 0.9, 0)],
    { fov: (u) => lerp(42, 34, smooth(u)), aperture: 1.5, ease: (u) => easeInOutCubic(u) }),
  { trans: { type: 'dissolve', dur: 0.9 }, grade: { exposure: 1.2, bloom: 0.4, streak: 0.2, threshold: 1.4 } }));
  // 2.2 — macro stage: a bolt turning on its axis, titanium washer drifting through focus
  const bs = makeSet('studio', { envIntensity: 1.1 }); const B = bs.scene;
  const boltPivot = new THREE.Group(); B.add(boltPivot); const bolt = mesh(boltGeo(0.032, 0.0045, 1), M.polished()); bolt.rotation.z = -Math.PI / 2; bolt.position.x = 0.016; boltPivot.add(bolt);
  const wash = mesh(washerGeo(0.009, 0.005, 0.0014), M.titanium()); B.add(wash);
  const wash2 = mesh(washerGeo(0.009, 0.005, 0.0014), M.gold()); B.add(wash2);
  const bgParts = buildCar('classic', { lite: true, seed: 3 }); bgParts.group.position.set(-0.6, -1.0, -2.6); bgParts.group.rotation.y = 0.5; bgParts.setOutline(1); bgParts.setExplode(0.7); B.add(bgParts.group);
  spot(B, { intensity: 0.22, pos: [0.02, 0.25, 0.12], target: [0, 0, 0], angle: 0.3, penumbra: 1, color: 0xfff0dc });
  spot(B, { intensity: 0.3, pos: [-0.1, 0.05, -0.25], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffb46a });
  bs.onUpdate((t) => { boltPivot.rotation.set((t - 12.3) * 1.1, 0, 0.08); wash.position.set(lerp(0.03, -0.035, smooth((t - 12.2) / 1.3)), -0.006, 0.03); wash.rotation.set(1.2, 0.3, t * 0.4); wash2.position.set(-0.03, 0.012, -0.03); wash2.rotation.set(0.5, t * 0.5, 0.9); });
  shots.push(shot('s2.2', 12.3, 13.3, bs, (lt, u, cam) => {
    const dd = aim(cam, v3(lerp(0.012, -0.006, u), 0.007, lerp(0.07, 0.055, u)), v3(lerp(0.004, -0.004, u), 0, 0), { fov: 26, near: 0.003, far: 20, roll: 0.04 });
    return { focus: lerp(dd - 0.03, dd, smooth((u - 0.25) * 2.5)), aperture: 20 };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.6, 0.45] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.2, threshold: 1.3 } }));
  // 2.3 — macro stage: wiring harness glide, whip to the gold baseball stitch on the steering rim
  const hs = makeSet('studio', { envIntensity: 1.0 }); const H = hs.scene;
  const wires = harness(); wires.position.set(0, 0, 0); H.add(wires); H.add(steer); steer.position.set(0.15, 0.1, -0.35); steer.rotation.set(-0.3, 0.4, 0);
  const bg2 = buildCar('classic', { lite: true, seed: 4 }); bg2.group.position.set(1.2, -0.9, -3.2); bg2.group.rotation.y = -0.6; bg2.setOutline(1); bg2.setExplode(0.8); H.add(bg2.group);
  spot(H, { intensity: 2.5, pos: [0.1, 0.5, 0.3], target: [0, 0, -0.1], angle: 0.5, penumbra: 1, color: 0xfff0dc });
  spot(H, { intensity: 2.0, pos: [-0.4, 0.2, -0.6], target: [0.1, 0.05, -0.3], angle: 0.5, penumbra: 1, color: 0xffb46a });
  hs.onUpdate((t) => { wires.rotation.set(0.1, 0.25 + t * 0.03, 0.05); });
  shots.push(shot('s2.3', 13.3, 13.78, hs, (lt, u, cam) => {
    wires.updateMatrixWorld(true); const p = wires.localToWorld(v3(lerp(-0.47, -0.25, u), lerp(0.05, 0.08, u), 0.13)); const tgt = wires.localToWorld(v3(lerp(-0.35, -0.12, u), lerp(0.0, 0.05, u), 0));
    const dd = aim(cam, p, tgt, { fov: 30, near: 0.004, far: 60, roll: -0.1 }); return { focus: dd, aperture: 10 };
  }, { trans: { type: 'whip', dur: 0.36, dir: [1, 0.2] }, grade: { exposure: 1.2, bloom: 0.4, streak: 0.2, threshold: 1.3 } }));
  shots.push(shot('s2.3b', 13.78, 14.25, hs, (lt, u, cam) => {
    steer.updateMatrixWorld(true); const a = -0.8 + u * 0.3; const p = steer.localToWorld(v3(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.05)); const tgt = steer.localToWorld(v3(Math.cos(a + 0.1) * 0.175, Math.sin(a + 0.1) * 0.175, 0.0));
    const dd = aim(cam, p, tgt, { fov: 30, near: 0.004, far: 60 }); return { focus: dd, aperture: 12 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [-1, -0.3] }, grade: { exposure: 1.25, bloom: 0.4, streak: 0.2, threshold: 1.3 } }));
  // 2.4 — pull back as everything re-assembles in one wave, rise to top-down on the mirror floor
  shots.push(shot('s2.4', 14.25, 18.0, set, (lt, u, cam) => {
    const k = easeInOutCubic(clamp(u));
    const pc = curve([v3(1.9, 1.5, 3.2), v3(3.6, 2.4, 6.2), v3(2.2, 6.5, 4.6), v3(0.0, 10.5, 0.02)]);
    const p = at(pc, k + (u > 1 ? (u - 1) * 0.3 : 0)); const tgt = new THREE.Vector3().lerpVectors(v3(1.2, 1.1, 1.6), v3(0, 0.3, 0), smooth(k * 1.5));
    const dd = aim(cam, p, tgt, { fov: lerp(34, 30, k), near: 0.01, far: 80 });
    return { focus: dd, aperture: lerp(8, 0.8, smooth(k * 2)) };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.5, 0.5] }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.2, threshold: 1.3 } }));
  return { shots, car };
}
