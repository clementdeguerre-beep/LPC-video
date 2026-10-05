// SCENE 8 (72–82s) — THE SERVICE. Key on a velvet tray, an enclosed carrier sealing its doors,
// a private track day at sunset, a rare car turning before a silent audience, a gold wax seal.
import { THREE, envOn, makeSet, spot, point, dirLight, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, lightStrip, lightCone } from './common.js';
import { buildCar, contactShadow, emblemMaterial } from '../models/car.js';
import { buildFigure, POSES } from '../models/figure.js';
import { buildCircuit } from '../models/landscape.js';
import { mesh, roundBox, lathe, patch, merge, xf } from '../models/geo.js';
import { glow, skyDome } from '../engine/materials.js';
import { drawTexture, drawNormal, drawEmblem, FONT_SERIF } from '../engine/textures.js';
import { invLerp, easeOutCubic, easeInCubic, TAU, noise1, easeOutQuint } from '../engine/util.js';

function buildKey() {
  const g = new THREE.Group();
  const blade = new THREE.Shape(); blade.moveTo(0, -0.005); blade.lineTo(0.05, -0.005); blade.lineTo(0.056, 0); blade.lineTo(0.05, 0.005); for (let i = 0; i < 6; i++) { blade.lineTo(0.045 - i * 0.007, 0.005 + (i % 2 ? 0.002 : -0.001)); } blade.lineTo(0, 0.005); blade.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.0022, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 1 }), M.chrome(), { p: [0.012, 0, -0.0011] }));
  const head = mesh(roundBox(0.03, 0.026, 0.009, 0.004, 3), M.blackGloss()); g.add(head);
  const badge = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.0015, 40), emblemMaterial(), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.0048] }); badge.geometry.rotateY(Math.PI / 2); g.add(badge);
  g.add(mesh(new THREE.TorusGeometry(0.006, 0.0012, 8, 32), M.goldPolished(), { p: [-0.017, 0, 0] }));
  const fob = mesh(roundBox(0.035, 0.022, 0.003, 0.004, 2), M.leather(0x2a140c), { p: [-0.038, -0.004, 0], r: [0, 0, 0.35] }); g.add(fob);
  return g;
}

function velvetTray() {
  const g = new THREE.Group(); const s = new THREE.Shape(); const w = 0.16, h = 0.1, r = 0.02;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const base = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3 }), M.goldPolished(), { r: [-Math.PI / 2, 0, 0] }); g.add(base);
  const inner = new THREE.Shape(s.getPoints(32).map((p) => p.multiplyScalar(0.9)));
  g.add(mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.004, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3 }), M.velvet(0x3a0c12), { r: [-Math.PI / 2, 0, 0], p: [0, 0.014, 0] }));
  return g;
}

function flagMesh() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d'); for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#0a0a0a' : '#ece6da'; g.fillRect(x * 32, y * 32, 32, 32); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.0, 0.7, 40, 20); const base = geo.attributes.position.array.slice();
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7, sheen: 0.6 }));
  m.userData.wave = (t) => { const p = geo.attributes.position.array; for (let i = 0; i < p.length; i += 3) { const x = base[i] + 0.5; p[i + 2] = Math.sin(x * 7 - t * 9) * 0.06 * x + Math.sin(x * 13 - t * 13 + base[i + 1] * 4) * 0.02 * x; } geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
  return m;
}

export async function buildS8(ctx) {
  const shots = [];
  // ---------------------------------------------------------------- 8.1 key on the velvet tray → concierge desk
  const ks = makeSet('lounge', { envIntensity: 1.2 }); const K = ks.scene;
  const desk = mesh(new THREE.BoxGeometry(2.4, 0.06, 1.0), M.walnut(), { p: [0, -0.03, 0] }); K.add(desk);
  const tray = velvetTray(); K.add(tray); const key = buildKey(); key.scale.setScalar(1.6); K.add(key);
  const lamp = glow(0xffc985, 0.5, 2.4); lamp.position.set(-0.7, 0.45, -0.45); K.add(lamp); K.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 24, 1, true), M.fabric(0xe8d8b8), { p: [-0.7, 0.45, -0.45] }));
  const bell = mesh(lathe([[0.0001, 0.07], [0.012, 0.068], [0.04, 0.04], [0.05, 0.01], [0.05, 0], [0.0001, 0]], 40), M.goldPolished(), { p: [0.55, 0, -0.25] }); K.add(bell);
  spot(K, { intensity: 2.6, pos: [0.3, 0.8, 0.5], target: [0, 0, 0], angle: 0.35, penumbra: 1, color: 0xffe0b0 }); point(K, { intensity: 0.6, pos: [-0.7, 0.4, -0.3], color: 0xffb060 });
  ks.onUpdate((t) => { const k = easeOutQuint(clamp((t - 72.0) / 0.9)); key.position.set(lerp(0.05, 0.0, k), lerp(0.16, 0.032, k), lerp(-0.04, 0.0, k)); key.rotation.set(-Math.PI / 2 + lerp(0.6, 0, k), 0, lerp(0.5, 0.25, k)); });
  shots.push(shot('s8.1', 72.0, 73.8, ks, (lt, u, cam) => { const k = smooth(clamp((u - 0.45) / 0.55)); const d = aim(cam, v3(lerp(0.12, 0.6, k), lerp(0.12, 0.5, k), lerp(0.16, 0.9, k)), v3(0, 0.03, 0), { fov: 30, near: 0.005, far: 30 }); return { focus: d, aperture: lerp(10, 3, k) }; },
    { trans: { type: 'luma', dur: 0.6 }, grade: { exposure: 1.15, bloom: 0.5, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 8.2 enclosed carrier seals its doors (dusk)
  const tsS = makeSet('dusk', { envIntensity: 0.9, bg: null, fog: new THREE.FogExp2(0x2a2230, 0.006) }); const TR = tsS.scene;
  skyDome(TR, 0x0a1430, 0xd8743e, 0x0b0a0c, [-0.9, 0.04, 0.4], 0xff8a3d, 1.0, 5).scale.setScalar(6);
  { const gr = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), M.floor(0x1a1918)); gr.rotation.x = -Math.PI / 2; TR.add(gr); }
  const trailer = new THREE.Group(); TR.add(trailer); const gloss = M.paint(0x050505, { metalness: 0.5 });
  trailer.add(mesh(roundBox(12, 2.9, 2.55, 0.08), gloss, { p: [0, 2.05, 0] }));
  for (const z of [-1.29, 1.29]) { trailer.add(mesh(new THREE.BoxGeometry(11.6, 0.03, 0.01), M.goldPolished(), { p: [0, 2.9, z] })); trailer.add(mesh(new THREE.BoxGeometry(11.6, 0.012, 0.01), M.goldPolished(), { p: [0, 2.84, z] })); }
  const em = mesh(new THREE.CircleGeometry(0.5, 64), emblemMaterial(), { p: [1.5, 2.1, 1.285] }); trailer.add(em);
  for (const x of [-4.6, -3.4, 3.5, 4.7]) for (const z of [-1.0, 1.0]) trailer.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 32), M.rubber(), { p: [x, 0.5, z], r: [Math.PI / 2, 0, 0] }));
  const cab = new THREE.Group(); cab.add(mesh(roundBox(2.6, 3.1, 2.5, 0.2), gloss, { p: [0, 1.9, 0] })); cab.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 2.2), M.glass(), { p: [1.31, 2.6, 0] })); cab.position.set(7.6, 0, 0); trailer.add(cab);
  const doors = []; for (const s of [1, -1]) { const pivot = new THREE.Group(); pivot.position.set(-6.02, 2.05, s * 1.27); const leaf = mesh(roundBox(0.06, 2.8, 1.26, 0.02), gloss, { p: [0, 0, -s * 0.63] }); pivot.add(leaf); leaf.add(mesh(new THREE.BoxGeometry(0.02, 2.7, 0.02), M.rubber(), { p: [-0.03, 0, -s * 0.62] })); leaf.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 12), M.chrome(), { p: [-0.05, 0, -s * 0.45] })); trailer.add(pivot); doors.push({ pivot, s }); }
  for (const z of [-1.0, 1.0]) { const tl = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.25), M.emissive(0xb0101a, 4), { p: [-6.05, 0.75, z] }); trailer.add(tl); }
  const interiorGlow = mesh(new THREE.PlaneGeometry(2.4, 2.7), M.emissive(0xffcf8a, 1.2), { p: [-5.9, 2.05, 0], r: [0, -Math.PI / 2, 0] }); trailer.add(interiorGlow);
  spot(TR, { intensity: 260, pos: [-12, 5, 5], target: [-6, 2, 0], angle: 0.5, penumbra: 1, color: 0xffd9a8 }); TR.add(new THREE.HemisphereLight(0x3a4a70, 0x100c08, 0.8));
  tsS.onUpdate((t) => { const k = easeInOutCubic(clamp((t - 73.6) / 1.1)); for (const d of doors) d.pivot.rotation.y = d.s * lerp(1.45, 0.0, k); interiorGlow.material.color.setRGB(1, 0.81, 0.54).multiplyScalar(1.2 * (1 - k * 0.9)); });
  shots.push(shot('s8.2', 73.8, 75.8, tsS, keyCam([v3(-9.6, 2.0, 2.8), v3(-12, 2.6, 6.0), v3(-19, 3.6, 10.5)], [v3(-6.05, 2.0, 0.0), v3(-5.0, 2.0, 0), v3(-1, 2.0, 0)], { fov: 36, aperture: (u) => lerp(8, 1.5, u), ease: (x) => easeInOutCubic(x), far: 1200 }),
    { trans: { type: 'zoom', dur: 0.5, center: [0.55, 0.5] }, grade: { exposure: 1.2, bloom: 0.55, streak: 0.3, threshold: 1.2, lift: [0.004, 0.005, 0.012] } }));

  // ---------------------------------------------------------------- 8.3 private track day at sunset
  const tdS = makeSet('golden', { envIntensity: 0.9, bg: null, fog: new THREE.Fog(0xd08850, 80, 600) }); const TD = tdS.scene;
  skyDome(TD, 0x23365a, 0xff9a52, 0x2a1e14, [-0.9, 0.05, 0.2], 0xffa45a, 3.2, 4).scale.setScalar(16);
  TD.add(buildCircuit()); const flag = flagMesh(); flag.position.set(2.2, 2.8, 6.5); TD.add(flag); TD.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 12), M.chrome(), { p: [1.7, 1.7, 6.5] }));
  [['prototype', 0xcdb48a], ['classic', 0x050505], ['supercar', 0x9a9b9f], ['gt', 0x3d0b12], ['roadster', 0x101a14]].forEach(([p, c], i) => { const car = buildCar(p, { lite: true, color: c, seed: 170 + i }); car.group.position.set(-4 - i * 5.5, 0, 3.5); car.group.rotation.y = 0.55; car.lights(1, 1); TD.add(car.group); });
  for (let i = 0; i < 14; i++) TD.add(mesh(new THREE.ConeGeometry(0.15, 0.4, 16), M.paint(0x8a1620, { metalness: 0 }), { p: [6 - i * 3, 0.2, 7.0] }));
  dirLight(TD, { color: 0xffb070, intensity: 3.5, pos: [-200, 40, 80] }); TD.add(new THREE.HemisphereLight(0x8aa6cc, 0x3a2a1a, 0.8));
  tdS.onUpdate((t) => flag.userData.wave(t));
  shots.push(shot('s8.3', 75.8, 77.8, tdS, keyCam([v3(3.6, 2.9, 8.2), v3(6, 3.5, 13), v3(10, 6.5, 20)], [v3(2.3, 2.75, 6.5), v3(-4, 1.5, 4), v3(-12, 0.5, 3)], { fov: 36, aperture: (u) => lerp(8, 1, smooth(u * 1.6)), ease: (x) => easeInOutCubic(x), far: 2000 }),
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.1, bloom: 0.55, streak: 0.32, threshold: 1.2, gain: [1.08, 1.0, 0.86] } }));

  // ---------------------------------------------------------------- 8.4 rotating platform, silent audience
  const rpS = makeSet('studio', { envIntensity: 0.9 }); const RP = rpS.scene;
  const stage = new THREE.Group(); RP.add(stage); stage.add(mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.25, 128), M.blackGloss(), { p: [0, 0.125, 0] }));
  const sRing = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.015, 8, 200), M.emissive(0xffcf8a, 3)); sRing.rotation.x = Math.PI / 2; sRing.position.y = 0.25; stage.add(sRing);
  const rare = buildCar('prototype', { lite: false, fasteners: false, engine: false, color: 0xcdb48a, seed: 181 }); rare.group.position.y = 0.25; stage.add(rare.group);
  const floorR = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), M.floor(0x0c0c0c)); floorR.rotation.x = -Math.PI / 2; RP.add(floorR); envOn(floorR.material, RP, 0.3);
  for (const [x, z] of [[0, 0], [-2.2, 1.5], [2.2, -1.5]]) { spot(RP, { intensity: 110, pos: [x * 0.4, 8, z * 0.4], target: [x * 0.3, 0.5, z * 0.3], angle: 0.32, penumbra: 0.6, color: 0xfff1dc }); const cone = lightCone(8, 2.6, 0xffe6c0, 0.05); cone.position.set(x * 0.4, 8, z * 0.4); RP.add(cone); }
  const aud = rng(9); for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) { const f = buildFigure({ suit: aud() < 0.5 ? 0x0b0b0c : 0x16171b, gender: aud() < 0.35 ? 'f' : 'm' }); f.userData.pose(POSES.sitAudience); f.position.set(-5.4 + i * 1.8 + (row % 2) * 0.9, 0, 6.5 + row * 1.4); f.rotation.y = Math.PI + (i - 3) * 0.06; RP.add(f); }
  rpS.onUpdate((t) => { stage.rotation.y = (t - 77.0) * 0.32; });
  shots.push(shot('s8.4', 77.8, 79.8, rpS, keyCam([v3(1.2, 1.6, 11.5), v3(0.2, 1.9, 10.6)], [v3(0, 0.9, 0), v3(0, 0.8, 0)], { fov: 32, aperture: 2.5, ease: (x) => x }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.2, bloom: 0.6, streak: 0.3, threshold: 1.1 } }));

  // ---------------------------------------------------------------- 8.5 certificate + gold wax seal
  const ce = makeSet('lounge', { envIntensity: 1.1 }); const CE = ce.scene;
  const paperTex = drawTexture(1024, 1400, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h); g.globalAlpha = 0.05; for (let i = 0; i < 4000; i++) { g.fillStyle = i % 2 ? '#8a7a60' : '#ffffff'; g.fillRect((i * 997) % w, (i * 613) % h, 2, 2); } g.globalAlpha = 1;
    g.strokeStyle = '#b8964e'; g.lineWidth = 6; g.strokeRect(40, 40, w - 80, h - 80); g.lineWidth = 2; g.strokeRect(58, 58, w - 116, h - 116);
    g.fillStyle = '#2a2218'; g.textAlign = 'center'; g.font = `600 64px ${FONT_SERIF}`; g.fillText('CERTIFICATE', w / 2, 220); g.font = `500 40px ${FONT_SERIF}`; g.fillText('OF AUTHENTICITY', w / 2, 280);
    g.font = `italic 500 34px ${FONT_SERIF}`; g.fillText('Legend Paddock Club', w / 2, 360);
    g.fillStyle = '#5a4a38'; for (let i = 0; i < 9; i++) g.fillRect(150, 480 + i * 62, w - 300 - (i % 3) * 60, 3);
    g.strokeStyle = '#2a2218'; g.lineWidth = 3; g.beginPath(); g.moveTo(600, 1180); for (let i = 0; i < 40; i++) g.lineTo(600 + i * 6, 1180 + Math.sin(i * 0.9) * 18 - i * 0.6); g.stroke();
  });
  const paper = mesh(new THREE.PlaneGeometry(0.21, 0.29), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.85 }), { r: [-Math.PI / 2, 0, 0] }); CE.add(paper);
  CE.add(mesh(new THREE.PlaneGeometry(1.2, 0.8), M.walnut(), { r: [-Math.PI / 2, 0, 0], p: [0, -0.001, 0] }));
  const sealPos = v3(-0.045, 0, 0.09);
  const waxN = drawNormal(512, 512, (g, w) => { g.fillStyle = '#888'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, TAU); g.fill(); drawEmblem(g, w / 2, w / 2, w * 0.38, { fill: '#fff', stroke: '#fff' }); }, 5);
  const waxMat = new THREE.MeshPhysicalMaterial({ color: 0xc9a050, metalness: 0.85, roughness: 0.28, normalMap: waxN, normalScale: new THREE.Vector2(0, 0), clearcoat: 0.6 });
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.004, 64), waxMat); wax.geometry.rotateY(Math.PI / 2); wax.position.copy(sealPos).add(v3(0, 0.002, 0)); CE.add(wax);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 32, 16), waxMat.clone()); blob.material.normalMap = null; blob.scale.set(1, 0.45, 1); blob.position.copy(sealPos); CE.add(blob);
  const stamp = new THREE.Group(); stamp.add(mesh(lathe([[0.0001, 0], [0.024, 0], [0.025, 0.004], [0.016, 0.02], [0.012, 0.07], [0.02, 0.1], [0.024, 0.12], [0.0001, 0.125]], 48), M.goldPolished())); stamp.add(mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.002, 48), emblemMaterial(), { p: [0, 0.0005, 0] })); CE.add(stamp);
  spot(CE, { intensity: 1.6, pos: [0.25, 0.5, 0.35], target: [-0.03, 0, 0.06], angle: 0.4, penumbra: 1, color: 0xffe0b0 }); spot(CE, { intensity: 0.8, pos: [-0.4, 0.2, -0.2], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffa860 });
  ce.onUpdate((t) => {
    const lt = t - 79.8; const down = easeInCubic(clamp(lt / 0.5)); const up = easeOutCubic(clamp((lt - 0.75) / 0.6)); const y = lerp(0.12, 0.004, down) + up * 0.14;
    stamp.position.set(sealPos.x, y, sealPos.z); const pressed = lt > 0.5; blob.visible = !pressed; wax.visible = pressed; waxMat.normalScale.set(pressed ? 1.4 : 0, pressed ? 1.4 : 0); wax.scale.setScalar(pressed ? 1 + 0.06 * smooth(clamp((lt - 0.5) / 0.15)) : 1);
  });
  shots.push(shot('s8.5', 79.8, 82.0, ce, (lt, u, cam) => { const k = smooth(clamp((u - 0.55) / 0.45)); const d = aim(cam, v3(lerp(0.06, 0.12, k), lerp(0.13, 0.32, k), lerp(0.22, 0.33, k)), v3(lerp(sealPos.x, -0.01, k), 0.01, lerp(sealPos.z, 0.04, k)), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: lerp(10, 5, k) }; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.5, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));
  return { shots };
}
