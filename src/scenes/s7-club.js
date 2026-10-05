// SCENE 7 (62–72s) — THE CLUB. Crystal clink, numbered metal card on dark wood, watch on a wrist at
// the gear lever, a handshake by a car door → the members' lounge: fireplace, leather, cars beyond glass.
import { THREE, envOn, makeSet, spot, point, dirLight, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, lightStrip } from './common.js';
import { buildCar, contactShadow, emblemMaterial } from '../models/car.js';
import { buildFigure, POSES, buildHand, buildWatch } from '../models/figure.js';
import { mesh, roundBox, lathe, patch } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { drawTexture, drawNormal, drawEmblem, FONT_SERIF } from '../engine/textures.js';
import { invLerp, easeOutCubic, easeInCubic, TAU, noise1 } from '../engine/util.js';

export function crystalGlass(h = 0.2) {
  const g = new THREE.Group();
  const prof = [[0.0001, 0], [0.038, 0.0], [0.04, 0.004], [0.006, 0.012], [0.004, 0.1], [0.01, 0.11], [0.045, 0.14], [0.058, 0.18], [0.06, 0.205], [0.057, 0.205], [0.055, 0.18], [0.043, 0.143], [0.008, 0.114]];
  g.add(mesh(lathe(prof, 64), M.crystal()));
  g.add(mesh(lathe([[0.0001, 0.115], [0.04, 0.142], [0.05, 0.165], [0.0001, 0.165]], 48), new THREE.MeshPhysicalMaterial({ color: 0xd9a24a, transparent: true, opacity: 0.55, roughness: 0, clearcoat: 1, emissive: 0x2a1404 })));
  g.scale.setScalar(h / 0.205); return g;
}

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

function armchair(leatherM) {
  const g = new THREE.Group();
  g.add(mesh(roundBox(0.9, 0.42, 0.85, 0.08, 4), leatherM, { p: [0, 0.25, 0] }));
  g.add(mesh(roundBox(0.9, 0.62, 0.2, 0.09, 4), leatherM, { p: [0, 0.68, -0.34] }));
  for (const x of [-0.42, 0.42]) g.add(mesh(roundBox(0.18, 0.5, 0.85, 0.08, 4), leatherM, { p: [x, 0.5, 0] }));
  for (const x of [-0.38, 0.38]) for (const z of [-0.36, 0.36]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.06, 12), M.goldPolished(), { p: [x, 0.03, z] }));
  return g;
}

export async function buildS7(ctx) {
  const shots = [];
  // ---------------------------------------------------------------- 7.1 crystal glasses clink
  const gs = makeSet('lounge', { envIntensity: 1.3 }); const G = gs.scene;
  const gA = crystalGlass(0.2), gB = crystalGlass(0.2); G.add(gA); G.add(gB);
  const bokeh = []; const rb = rng(71); for (let i = 0; i < 28; i++) { const b = glow(rb() < 0.5 ? 0xffb060 : 0xffd9a0, rb.range(0.05, 0.16), rb.range(0.6, 2)); b.position.set(rb.range(-1.2, 1.2), rb.range(-0.2, 0.7), rb.range(-2.5, -1.2)); G.add(b); bokeh.push(b); }
  const glint = glow(0xffffff, 0.08, 0); G.add(glint);
  spot(G, { intensity: 3, pos: [0.5, 0.8, 0.6], target: [0, 0.15, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  spot(G, { intensity: 2.5, pos: [-0.6, 0.4, -0.6], target: [0, 0.15, 0], angle: 0.5, penumbra: 1, color: 0xff9a50 });
  gs.onUpdate((t) => {
    const lt = t - 62.0; const k = smooth(clamp(lt / 0.55)); const recoil = lt > 0.55 ? Math.exp(-(lt - 0.55) * 6) * Math.sin((lt - 0.55) * 30) * 0.004 : 0;
    gA.position.set(lerp(-0.2, -0.062, k) - recoil, 0, 0); gA.rotation.z = lerp(0.1, -0.12, k); gB.position.set(lerp(0.2, 0.062, k) + recoil, 0.005, 0.01); gB.rotation.z = lerp(-0.1, 0.12, k);
    const c = lt > 0.55 ? Math.exp(-(lt - 0.55) * 7) : 0; glint.position.set(0, 0.185, 0.02); glint.material.color.setRGB(1, 0.95, 0.85).multiplyScalar(c * 2.5); glint.scale.setScalar(0.03 + c * 0.04);
  });
  shots.push(shot('s7.1', 62.0, 63.0, gs, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.06, 0.02, u), 0.2, 0.42), v3(0, 0.17, 0), { fov: 30, near: 0.01, far: 20 }); return { focus: d, aperture: 10 }; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.55, streak: 0.3, threshold: 1.2, gain: [1.08, 1.0, 0.88] } }));

  // ---------------------------------------------------------------- 7.2 numbered metal card on dark wood
  const cs = makeSet('lounge', { envIntensity: 1.2 }); const C = cs.scene;
  const table = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), M.walnut()); table.rotation.x = -Math.PI / 2; C.add(table);
  const cardTex = drawTexture(1024, 640, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#2b2b2e'); grd.addColorStop(0.5, '#4a4a4e'); grd.addColorStop(1, '#232326'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.25; for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#5a5a5e' : '#1a1a1c'; g.fillRect(0, y, w, 1); } g.globalAlpha = 1;
    drawEmblem(g, 170, 200, 120, { fill: '#d9b26a', stroke: '#d9b26a' });
    g.fillStyle = '#d9b26a'; g.font = `600 52px ${FONT_SERIF}`; g.fillText('LEGEND PADDOCK CLUB', 330, 190); g.font = `500 34px ${FONT_SERIF}`; g.fillText('MEMBER', 330, 245);
    g.font = `600 110px ${FONT_SERIF}`; g.fillText('Nº 007', 60, 540); g.font = `italic 500 30px ${FONT_SERIF}`; g.fillText('Since 1962', 760, 560);
  });
  const cardN = drawNormal(1024, 640, (g) => { g.fillStyle = '#fff'; drawEmblem(g, 170, 200, 120, { fill: '#fff', stroke: '#fff' }); g.font = `600 52px ${FONT_SERIF}`; g.fillText('LEGEND PADDOCK CLUB', 330, 190); g.font = `600 110px ${FONT_SERIF}`; g.fillText('Nº 007', 60, 540); }, -3);
  const card = mesh(roundBox(0.0856, 0.054, 0.0012, 0.0006, 2), M.titanium()); card.rotation.x = -Math.PI / 2; C.add(card);
  const face = mesh(new THREE.PlaneGeometry(0.0846, 0.053), new THREE.MeshPhysicalMaterial({ map: cardTex, normalMap: cardN, metalness: 0.55, roughness: 0.32, clearcoat: 0.4 }), { p: [0, 0, 0.0007] }); card.add(face);
  spot(C, { intensity: 0.35, pos: [-0.15, 0.35, -0.25], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  spot(C, { intensity: 1.6, pos: [0.3, 0.5, 0.35], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  const cl = glow(0xffb060, 0.5, 1.2); cl.position.set(-0.6, 0.1, -0.8); C.add(cl);
  cs.onUpdate((t) => { const k = easeOutCubic(clamp((t - 62.9) / 1.0)); card.position.set(lerp(-0.22, 0.0, k), 0.0012, lerp(0.05, 0.0, k)); card.rotation.z = lerp(0.35, 0.08, k); });
  shots.push(shot('s7.2', 63.0, 64.0, cs, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.03, 0.05, u), 0.13, 0.11), v3(lerp(-0.05, 0.0, u), 0.0, 0.0), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: 8 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.3 watch on the wrist at the gear lever
  const ws = makeSet('lounge', { envIntensity: 1.2 }); const Wd = ws.scene;
  const watch = buildWatch(); watch.scale.setScalar(2.2); Wd.add(watch);
  const bronze = new THREE.MeshPhysicalMaterial({ color: 0x3a2a20, roughness: 0.42, metalness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0x9a7050) });
  const arm = mesh(new THREE.CapsuleGeometry(0.03, 0.22, 6, 20), bronze, { s: [1.2, 1, 0.8], r: [0, 0, Math.PI / 2] }); Wd.add(arm);
  const cuff = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.08, 32), M.fabric(0xe8e2d8), { r: [0, 0, Math.PI / 2], p: [-0.16, 0, 0] }); Wd.add(cuff);
  const sleeve = mesh(new THREE.CylinderGeometry(0.05, 0.052, 0.2, 32), M.fabric(0x14151a), { r: [0, 0, Math.PI / 2], p: [-0.28, 0, 0] }); Wd.add(sleeve);
  const knob = mesh(new THREE.SphereGeometry(0.03, 32, 20), M.walnut(), { p: [0.2, -0.04, 0] }); Wd.add(knob); Wd.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.2, 16), M.chrome(), { p: [0.2, -0.15, 0] }));
  const hand = buildHand({ material: bronze }); hand.userData.setCurl([0.95, 1.05, 1.1, 1.15], 0.9); hand.rotation.set(0, 0, -Math.PI / 2 - 0.3); hand.position.set(0.12, 0.0, 0); Wd.add(hand); hand.visible = false;
  watch.position.set(-0.035, 0.035, 0); watch.rotation.set(0, 0, 0);
  spot(Wd, { intensity: 1.6, pos: [0.2, 0.6, 0.4], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  spot(Wd, { intensity: 1.2, pos: [-0.5, 0.2, -0.4], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0x9ab0ff });
  ws.onUpdate((t) => { watch.userData.set(10 * 3600 + 8 * 60 + (t - 60) * 1); const k = smooth(clamp((t - 64.2) / 0.5)); Wd.rotation.z = lerp(0, -0.12, k); });
  shots.push(shot('s7.3', 64.0, 65.0, ws, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.02, -0.04, u), 0.2, 0.17), v3(-0.035, 0.04, 0), { fov: 32, near: 0.005, far: 20 }); return { focus: d, aperture: 10 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.4 handshake beside a car door
  const hsS = makeSet('lounge', { envIntensity: 1.1 }); const HS = hsS.scene;
  const doorCar = buildCar('classic', { lite: true, color: 0x050505, seed: 141 }); doorCar.group.position.set(0.0, -0.95, -0.9); HS.add(doorCar.group);
  const bz = new THREE.MeshPhysicalMaterial({ color: 0x3a2a20, roughness: 0.42, metalness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0x9a7050) }); const hL = buildHand({ material: bz, side: 1, cuff: 0xe8e2d8 }), hR = buildHand({ material: bz, side: -1, cuff: 0xe8e2d8 });
  hL.userData.setCurl([0.75, 0.8, 0.85, 0.9], 0.5); hR.userData.setCurl([0.75, 0.8, 0.85, 0.9], 0.5); HS.add(hL); HS.add(hR);
  for (const [h, s] of [[hL, 1], [hR, -1]]) { const sl = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 32), M.fabric(s > 0 ? 0x14151a : 0x22201c), { p: [0, -0.24, 0] }); h.add(sl); }
  spot(HS, { intensity: 0.8, pos: [0.3, 0.6, 0.6], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 }); spot(HS, { intensity: 3.5, pos: [-0.3, 0.4, -0.8], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffb060 });
  hsS.onUpdate((t) => {
    const lt = t - 65.0; const k = smooth(clamp(lt / 0.45)); const pump = Math.sin(clamp((lt - 0.45) / 0.5) * Math.PI) * 0.015;
    hL.position.set(lerp(-0.2, -0.03, k), pump, 0); hL.rotation.set(0, 0, -Math.PI / 2 + 0.15); hR.position.set(lerp(0.2, 0.03, k), pump, -0.02); hR.rotation.set(0, Math.PI, -Math.PI / 2 + 0.15);
  });
  shots.push(shot('s7.4', 65.0, 66.0, hsS, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.3, 0.2, u), 0.12, 0.75), v3(0, 0.0, -0.1), { fov: 30, near: 0.01, far: 30 }); return { focus: d - 0.08, aperture: 8 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.5 the lounge
  const ls = makeSet('lounge', { envIntensity: 0.9 }); const L = ls.scene;
  const floorTex = M.walnut().clone(); floorTex.map = floorTex.map.clone(); floorTex.map.repeat.set(6, 4); floorTex.map.needsUpdate = true; const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), floorTex); floor.rotation.x = -Math.PI / 2; L.add(floor);
  const rug = mesh(new THREE.PlaneGeometry(5, 3.4), M.velvet(0x3a0c12), { r: [-Math.PI / 2, 0, 0], p: [0, 0.005, -1.0] }); L.add(rug);
  const panel = M.walnut().clone(); panel.map = panel.map.clone(); panel.map.repeat.set(5, 1.4); panel.map.needsUpdate = true; for (const [x, z, ry, w] of [[0, -5, 0, 18], [-9, 0, Math.PI / 2, 12], [9, 0, -Math.PI / 2, 12]]) { const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.2), panel); wall.position.set(x, 2.1, z); wall.rotation.y = ry; L.add(wall); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), M.matte(0x0e0a08, 0.9)); ceil.position.y = 4.2; ceil.rotation.x = Math.PI / 2; L.add(ceil);
  // giant windows (z = +5) with the lit paddock beyond
  for (let i = -4; i <= 4; i++) { L.add(mesh(new THREE.BoxGeometry(0.08, 4.2, 0.12), M.matte(0x080706, 0.6), { p: [i * 2, 2.1, 5] })); }
  L.add(mesh(new THREE.BoxGeometry(18, 0.12, 0.14), M.matte(0x080706, 0.6), { p: [0, 3.0, 5] }));
  const glassW = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.2), new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.18, roughness: 0.02, clearcoat: 1, depthWrite: false })); glassW.position.set(0, 2.1, 5.02); glassW.rotation.y = Math.PI; L.add(glassW);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.1), M.emissive(0xffcf8a, 0)); L.add(outside);
  const outFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), M.floor(0x0e0c0a)); outFloor.rotation.x = -Math.PI / 2; outFloor.position.set(0, -0.01, 15); L.add(outFloor);
  [['classic', 0x3d0b12, -5], ['supercar', 0x9a9b9f, 0], ['gt', 0x050505, 5]].forEach(([p, c, x], i) => {
    const car = buildCar(p, { lite: true, color: c, seed: 150 + i }); car.group.position.set(x, 0.12, 10.5); car.group.rotation.y = Math.PI * 0.92; L.add(car.group);
    L.add(mesh(roundBox(5.2, 0.12, 2.6, 0.05), M.blackGloss(), { p: [x, 0.06, 10.5] })); const e = new THREE.Mesh(new THREE.RingGeometry(1, 1.012, 4, 1, Math.PI / 4), M.emissive(0xffcf8a, 3)); e.scale.set(3.7, 1.85, 1); e.rotation.x = -Math.PI / 2; e.position.set(x, 0.125, 10.5); L.add(e);
  });
  spot(L, { intensity: 400, pos: [0, 6, 14], target: [0, 0.4, 10.5], angle: 0.75, penumbra: 1, color: 0xffe2b8 });
  // fireplace
  L.add(mesh(roundBox(2.6, 1.7, 0.5, 0.03), M.paint(0x161412, { metalness: 0.1, roughness: 0.2 }), { p: [0, 0.85, -4.75] }));
  L.add(mesh(new THREE.BoxGeometry(1.3, 0.9, 0.3), M.matte(0x020101, 1), { p: [0, 0.6, -4.55] }));
  L.add(mesh(new THREE.BoxGeometry(2.9, 0.08, 0.6), M.paint(0x161412, { metalness: 0.1, roughness: 0.2 }), { p: [0, 1.72, -4.72] }));
  const fireMat = fireBillboards(L, [0, 0.2, -4.45], 0.9); const fireL = point(L, { color: 0xff8a3a, intensity: 6, pos: [0, 0.7, -4.0] });
  // furniture + members + staff
  const leatherM = M.leather(0x34160c); const rug2 = [];
  const chairs = [[-1.6, -1.6, 0.6], [1.6, -1.6, -0.6], [-1.7, 0.6, 2.4], [1.7, 0.6, -2.4]];
  for (const [x, z, ry] of chairs) { const a = armchair(leatherM); a.position.set(x, 0, z); a.rotation.y = ry + (z > 0 ? Math.PI : 0); L.add(a); }
  L.add(mesh(roundBox(1.2, 0.06, 0.7, 0.02), M.walnut(), { p: [0, 0.42, -0.5] })); L.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 0.5), M.matte(0x0c0907, 0.6), { p: [0, 0.2, -0.5] }));
  for (const x of [-0.25, 0.2]) { const cg = crystalGlass(0.18); cg.position.set(x, 0.45, -0.45); L.add(cg); }
  const members = [
    { f: buildFigure({ suit: 0x14151a }), pose: 'sitCross', pos: [-1.6, 0, -1.55], ry: 0.6 },
    { f: buildFigure({ suit: 0x2a1e18, gender: 'f', hair: 0x2b1d14 }), pose: 'sit', pos: [1.6, 0, -1.55], ry: -0.6 },
    { f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), pose: 'holdGlass', pos: [2.6, 0, 3.6], ry: -2.4 },
    { f: buildFigure({ suit: 0x1c1d22 }), pose: 'gesture', pos: [3.4, 0, 3.1], ry: 2.2 },
    { f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), pose: 'holdGlass', pos: [-4.2, 0, 1.8], ry: 1.4, staff: true },
  ];
  for (const m of members) { m.f.position.set(...m.pos); m.f.rotation.y = m.ry; m.f.userData.pose(POSES[m.pose]); L.add(m.f); }
  const tray = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 48), M.goldPolished(), { p: [-4.0, 1.12, 2.05] }); L.add(tray);
  for (const [x, z] of [[-6, -4.4], [6, -4.4], [-6, 4.6], [6, 4.6]]) { const g = glow(0xffc985, 0.7, 2.2); g.position.set(x, 2.6, z); L.add(g); }
  for (const x of [-3.5, 3.5]) { const lampG = glow(0xffc985, 0.9, 2.6); lampG.position.set(x, 1.1, -3.6); L.add(lampG); L.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.25, 24, 1, true), M.fabric(0xe8d8b8), { p: [x, 1.1, -3.6] })); L.add(mesh(new THREE.BoxGeometry(0.6, 0.7, 0.45), M.walnut(), { p: [x, 0.35, -3.6] })); point(L, { color: 0xffc070, intensity: 2.5, pos: [x, 1.2, -3.5] }); }
  spot(L, { intensity: 90, pos: [0, 4, 1], target: [0, 0.5, -1], angle: 0.8, penumbra: 1, color: 0xffd9a8 });
  L.add(new THREE.HemisphereLight(0xffd9b0, 0x1a1008, 1.3));
  spot(L, { intensity: 120, pos: [-4, 3.8, -1], target: [0, 0.6, -2.5], angle: 0.8, penumbra: 1, color: 0xffc98a });
  const ld = dust(L, { count: 250, box: [0, 2, 0, 12, 4, 9], size: 0.6, intensity: 0.35, res: ctx.res, seed: 73 });
  ls.onUpdate((t) => { fireMat.uniforms.time.value = t; fireL.intensity = 5 + noise1(t * 6) * 1.5 + noise1(t * 13) * 0.8; ld.set(t); members[3].f.userData.J['sh1'].rotation.x = -0.9 + Math.sin(t * 1.4) * 0.15; });
  shots.push(shot('s7.5', 66.0, 72.0, ls, keyCam([v3(-8.4, 1.75, -1.8), v3(-7.2, 1.6, -0.6), v3(-6.0, 1.5, 0.2)], [v3(1.5, 1.0, 1.2), v3(2.0, 1.0, 2.0), v3(2.0, 0.9, 2.6)], { fov: 50, aperture: 1.5, ease: (x) => easeInOutCubic(x) }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.55, streak: 0.28, threshold: 1.2, gain: [1.08, 1.0, 0.88], lift: [0.004, 0.002, 0.0] } }));
  return { shots };
}
