// SCENE 5 (40–50s) — THE PADDOCK. Vault lock turning, analogue hygrometer, a car cover lifted in
// slow motion → the private paddock (bays on lit platforms, concierge) → crane up outside at dusk.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, lightStrip, lightCone } from './common.js';
import { buildCar, contactShadow, emblemMaterial } from '../models/car.js';
import { buildGauge } from '../models/props.js';
import { buildFigure, POSES } from '../models/figure.js';
import { mesh, roundBox, patch, gearGeo, lathe } from '../models/geo.js';
import { skyDome, glow } from '../engine/materials.js';
import { invLerp, easeOutCubic, easeInCubic, TAU, fbm1, noise1 } from '../engine/util.js';

function vaultMechanism() {
  const g = new THREE.Group(); const steel = M.alu(), dark = M.darkChrome(), gold = M.goldPolished();
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 128), M.titanium(), { r: [Math.PI / 2, 0, 0], p: [0, 0, -0.1] }));
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

export async function buildS5(ctx) {
  const shots = [];
  // ---------------------------------------------------------------- 5.1 vault lock mechanism
  const vs = makeSet('studio', { envIntensity: 1.1 }); const vault = vaultMechanism(); vs.scene.add(vault);
  spot(vs.scene, { intensity: 14, pos: [1.2, 1.6, 2.2], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xfff0dc });
  spot(vs.scene, { intensity: 10, pos: [-2, -0.8, 1.2], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffb46a });
  vs.onUpdate((t) => vault.userData.set(smooth(clamp((t - 39.8) / 1.6))));
  shots.push(shot('s5.1', 40.0, 41.2, vs, (lt, u, cam) => {
    const k = smooth(u); const d = aim(cam, v3(lerp(0.5, 0.2, k), lerp(0.25, 0.1, k), lerp(0.55, 2.4, k)), v3(lerp(0.4, 0, k), lerp(0.15, 0, k), 0), { fov: 34, near: 0.01, far: 40, roll: lerp(0.3, 0, k) });
    return { focus: d, aperture: lerp(14, 4, k) };
  }, { trans: { type: 'iris', dur: 0.7, center: [0.5, 0.5] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.2, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 5.2 hygrometer (analogue)
  const hs = makeSet('studio', { envIntensity: 0.9 }); const hyg = buildGauge({ min: 0, max: 100, major: 10, minor: 2, label: '% RH', sub: 'climate', radius: 0.06, arc: [-2.2, 2.2] });
  hs.scene.add(hyg); const wallM = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), M.walnut()); wallM.position.z = -0.025; hs.scene.add(wallM);
  const thermo = buildGauge({ min: 10, max: 30, major: 5, minor: 1, label: '°C', sub: '', radius: 0.035, arc: [-2.2, 2.2] }); thermo.position.set(0.12, -0.03, 0); hs.scene.add(thermo);
  spot(hs.scene, { intensity: 1.0, pos: [0.25, 0.3, 0.4], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  hs.onUpdate((t) => { const lt = t - 41.0; hyg.userData.setValue(50 + Math.exp(-lt * 3) * Math.cos(lt * 9) * 18); thermo.userData.setValue(18 + Math.exp(-lt * 3) * Math.cos(lt * 7 + 1) * 2); });
  shots.push(shot('s5.2', 41.2, 42.1, hs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.07, -0.03, u), 0.03, 0.16), v3(lerp(0.0, 0.03, u), 0.0, 0), { fov: 32, near: 0.004, far: 20, roll: 0.08 }); return { focus: d, aperture: 9 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.18, threshold: 1.3 } }));

  // ---------------------------------------------------------------- 5.3 + 5.4 the paddock hall (cover lift, bays)
  const ps = makeSet('studio', { envIntensity: 0.9, fog: new THREE.FogExp2(0x0d0a07, 0.012) }); const P = ps.scene;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), M.floor(0x232220)); floor.rotation.x = -Math.PI / 2; P.add(floor); envOn(floor.material, P, 0.45);
  const presets = [['classic', 0x3d0b12], ['gt', 0x050505], ['supercar', 0x9a9b9f], ['roadster', 0x101a14], ['prototype', 0xcdb48a], ['gt', 0x3d0b12], ['classic', 0xcdb48a], ['supercar', 0x0b0b0c], ['classic', 0x5d5f63], ['roadster', 0x050505]];
  const bays = [];
  for (let i = 0; i < 10; i++) {
    const row = i < 5 ? -1 : 1; const x = ((i % 5) - 2) * 6.2; const z = row * 4.2;
    const plat = new THREE.Group(); plat.position.set(x, 0, z); P.add(plat);
    plat.add(mesh(roundBox(5.4, 0.16, 2.9, 0.06), M.blackGloss(), { p: [0, 0.08, 0] }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(1, 1.012, 4, 1, Math.PI / 4), M.emissive(0xffcf8a, 3)); edge.scale.set(3.85, 2.06, 1); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.165; plat.add(edge);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })); up.rotation.x = -Math.PI / 2; up.position.y = 0.01; plat.add(up);
    if (i === 2) { bays.push(plat); continue; } // the hero bay (cover lift) is filled below
    const [preset, color] = presets[i]; const c = buildCar(preset, { lite: true, color, seed: 60 + i }); c.group.position.y = 0.16; c.group.rotation.y = row > 0 ? Math.PI : 0; plat.add(c.group); { const sh = contactShadow(c, 0.8); sh.position.y = 0.165; plat.add(sh); }
    // glass partitions
    const glassP = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), M.glass()); glassP.position.set(3.1, 1.3, 0); glassP.rotation.y = Math.PI / 2; plat.add(glassP);
    plat.add(mesh(new THREE.BoxGeometry(0.03, 2.6, 0.03), M.gold(), { p: [3.1, 1.3, row * -1.6] }));
    bays.push(plat);
  }
  // hero car under its cover in bay 2 (front row centre)
  const hero = buildCar('classic', { fasteners: false, engine: false, color: 0x3d0b12, seed: 77 }); hero.group.position.y = 0.16; bays[2].add(hero.group); { const sh = contactShadow(hero, 0.8); sh.position.y = 0.165; bays[2].add(sh); }
  const cover = carCover(hero); cover.position.y = 0.16; bays[2].add(cover);
  // ceiling: linear warm lights, a discreet security dome
  for (let i = -3; i <= 3; i++) lightStrip(P, { w: 0.08, h: 22, pos: [i * 4.5, 5.2, 0], rot: [Math.PI / 2, 0, Math.PI / 2], intensity: 3.2, color: 0xffd9a8 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), M.matte(0x0d0c0b, 0.9)); ceil.position.y = 5.3; ceil.rotation.x = Math.PI / 2; P.add(ceil);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), M.matte(0x16130f, 0.8)); back.position.set(0, 3, -9); P.add(back);
  const dome = mesh(new THREE.SphereGeometry(0.09, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2), M.blackGloss(), { p: [9, 5.25, 0] }); P.add(dome);
  // concierge at the far end
  const desk = mesh(roundBox(2.2, 1.05, 0.7, 0.05), M.walnut(), { p: [17, 0.52, 0] }); desk.rotation.y = Math.PI / 2; P.add(desk);
  const concierge = buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }); concierge.position.set(17.7, 0, 0); concierge.rotation.y = -Math.PI / 2; concierge.userData.pose(POSES.standHandsBehind); P.add(concierge);
  const lamp = glow(0xffc985, 0.6, 2.5); lamp.position.set(16.9, 1.25, 0.6); P.add(lamp);
  spot(P, { intensity: 260, pos: [0.5, 5, -1.2], target: [0, 0.6, -4.2], angle: 0.55, penumbra: 0.9, color: 0xfff0dc }); // hero bay key
  spot(P, { intensity: 260, pos: [6.2, 5, 1.5], target: [6.2, 0.6, 4.2], angle: 0.7, penumbra: 1, color: 0xffd9a8 });
  spot(P, { intensity: 180, pos: [14, 4.5, 0], target: [17, 1, 0], angle: 0.5, penumbra: 1, color: 0xffc98a });
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x1a1410, 0.7); P.add(hemi);
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
  const ex = makeSet('dusk', { envIntensity: 0.8, bg: null, fog: new THREE.FogExp2(0x3a2a2a, 0.0045) }); const E = ex.scene;
  skyDome(E, 0x0a1430, 0xd8743e, 0x0b0a0c, [-0.9, 0.02, -0.2], 0xff8a3d, 1.0, 5).scale.setScalar(6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.matte(0x0c0d0c, 0.95)); ground.rotation.x = -Math.PI / 2; E.add(ground);
  const bld = new THREE.Group(); E.add(bld);
  bld.add(mesh(new THREE.BoxGeometry(44, 0.5, 20), M.matte(0x1c1b1a, 0.7), { p: [0, 6.6, 0] })); // roof slab with overhang
  bld.add(mesh(new THREE.BoxGeometry(40, 6.4, 16), M.matte(0x111111, 0.8), { p: [0, 3.2, 0] }));
  const r = rng(55);
  for (let i = 0; i < 40; i++) { const x = -19.5 + i; const warm = r() < 0.15 ? 0.25 : 0.6 + r() * 0.5; const win = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 5.6), M.emissive(0xffc27a, 0.75 * warm)); win.position.set(x, 3.1, 8.01); bld.add(win); const fin = mesh(new THREE.BoxGeometry(0.08, 6.2, 0.4), M.matte(0x0a0a0a, 0.6), { p: [x + 0.5, 3.1, 8.15] }); bld.add(fin); }
  for (let i = 0; i < 16; i++) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 5.6), M.emissive(0xffc27a, 0.6)); win.position.set(20.01, 3.1, -7.5 + i); win.rotation.y = Math.PI / 2; bld.add(win); }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshStandardMaterial({ color: 0x020304, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.7 })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, 13); E.add(pool); envOn(pool.material, E, 1.2);
  const mirrorB = bld.clone(); mirrorB.scale.y = -1; mirrorB.position.set(0, 0, 0); const clip = new THREE.Group(); clip.add(mirrorB); clip.position.set(0, 0, 0); E.add(clip); mirrorB.traverse((o) => { if (o.material?.color && o.material.type === 'MeshBasicMaterial') { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } });
  for (let i = 0; i < 24; i++) { const x = r.range(-60, 60), z = r.range(-40, -15) * (r() < 0.5 ? 1 : -1.6); const h = r.range(5, 9); const tree = mesh(new THREE.SphereGeometry(h * 0.5, 12, 8), M.matte(0x070807, 1), { p: [x, h * 0.55, z], s: [1.4, 0.7, 1.4] }); E.add(tree); E.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, h * 0.5, 6), M.matte(0x070807, 1), { p: [x, h * 0.25, z] })); }
  for (let i = 0; i < 9; i++) { const bl = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), M.emissive(0xffd9a0, 2.5), { p: [-16 + i * 4, 0.3, 17.5] }); E.add(bl); }
  const exCar = buildCar('classic', { lite: true, color: 0x050505, seed: 81 }); exCar.group.position.set(6, 0, 19.5); exCar.group.rotation.y = 0.25; exCar.lights(1, 1); E.add(exCar.group);
  spot(E, { intensity: 120, pos: [6, 6, 24], target: [6, 0.5, 19.5], angle: 0.4, penumbra: 1, color: 0xffd9a8 });
  const amb = new THREE.HemisphereLight(0x3a4a70, 0x100c08, 0.6); E.add(amb);
  shots.push(shot('s5.5', 46.6, 50.0, ex, keyCam([v3(3.5, 0.9, 25), v3(-2, 3.5, 32), v3(-9, 8, 42), v3(-14, 11, 48)], [v3(5, 1.2, 18), v3(2, 3, 8), v3(0, 4, 0), v3(0, 5, 0)], { fov: (u) => lerp(36, 40, u), aperture: (u) => lerp(4, 0.6, smooth(u * 2)), ease: (x) => easeInOutCubic(x), far: 1200 }),
    { trans: { type: 'dissolve', dur: 0.7 }, grade: { exposure: 1.25, bloom: 0.55, streak: 0.25, threshold: 1.1, lift: [0.004, 0.005, 0.012] } }));
  return { shots };
}
