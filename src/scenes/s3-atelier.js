// SCENE 3 (18–30s) — THE ATELIER. Macro craft (panel gap, torque click, polish, paint gauge,
// pinstripe) then a pull-out onto a team of master craftsmen moving in sync around one car.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, lightStrip } from './common.js';
import { buildCar, contactShadow } from '../models/car.js';
import { buildFigure, POSES, blendPose, buildHand } from '../models/figure.js';
import { buildGauge, buildTorqueWrench, buildHub, buildPolisher, buildStripingBrush, buildToolWall, buildToolChest } from '../models/props.js';
import { mesh, roundBox, patch } from '../models/geo.js';
import { drawTexture } from '../engine/textures.js';
import { invLerp, easeOutCubic, TAU, noise1 } from '../engine/util.js';

const BEAT = 2.0; // the ensemble moves on the score's 2-second bar

function openHood(car, angle) {
  const hood = car.panels.find((p) => p.name === 'hood'); const u = 0.43; const H = v3(car.shape.x(u), car.shape.top(u), 0);
  const q = new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), angle); const p = H.clone().sub(H.clone().applyQuaternion(q));
  hood.position.copy(p); hood.quaternion.copy(q);
}

function paintPanel(w = 0.8, h = 0.5, color = 0x050505) {
  const geo = patch((u, v, o) => o.set((u - 0.5) * w, (v - 0.5) * h, -Math.pow((u - 0.5) * w, 2) * 0.3), 0, 1, 48, 0, 1, 24, { flip: false });
  return new THREE.Mesh(geo, M.paint(color));
}

export async function buildS3(ctx) {
  const shots = [];
  // ======================================================================== the workshop
  const ws = makeSet('workshop', { envIntensity: 1.1 }); const W = ws.scene;
  const car = buildCar('classic', { fasteners: false, seed: 31 }); W.add(car.group); W.add(contactShadow(car, 0.85)); openHood(car, 0.95);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), M.floor(0x9a9ca0)); floor.rotation.x = -Math.PI / 2; W.add(floor); envOn(floor.material, W, 0.5);
  for (const [x, z, ry, w] of [[0, -8, 0, 28], [-13, 0, Math.PI / 2, 18], [13, 0, -Math.PI / 2, 18]]) { const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 7), M.matte(0x3a3c40, 0.85)); wall.position.set(x, 3.5, z); wall.rotation.y = ry; W.add(wall); }
  for (let i = -1; i <= 1; i++) { const tw = buildToolWall(5.6, 2.2, 3 + i); tw.position.set(i * 6.2, 1.7, -7.95); W.add(tw); lightStrip(W, { w: 5.4, h: 0.04, pos: [i * 6.2, 2.95, -7.85], rot: [0, 0, 0], intensity: 5, color: 0xffe2b8 }); }
  { const tw = buildToolWall(5.6, 2.2, 9); tw.position.set(-12.95, 1.7, -2); tw.rotation.y = Math.PI / 2; W.add(tw); }
  for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) lightStrip(W, { w: 2.6, h: 0.2, pos: [x * 4, 7, z * 4], rot: [Math.PI / 2, 0, 0], intensity: 4, color: 0xf2f5ff });
  const chest = buildToolChest(); chest.position.set(5.5, 0, -6.6); W.add(chest);
  const bench = new THREE.Group(); bench.add(mesh(roundBox(2.6, 0.08, 1.0, 0.02), M.walnut(), { p: [0, 0.92, 0] })); for (const x of [-1.2, 1.2]) for (const z of [-0.4, 0.4]) bench.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), M.darkChrome(), { p: [x, 0.45, z] }));
  const benchSeat = new THREE.Group(); benchSeat.add(mesh(roundBox(0.5, 0.1, 0.48, 0.045), M.leather(0x5a2316))); benchSeat.add(mesh(roundBox(0.12, 0.6, 0.48, 0.05), M.leather(0x5a2316), { p: [-0.24, 0.28, 0], r: [0, 0, 0.2] })); benchSeat.position.set(0, 1.02, 0); benchSeat.rotation.y = 0.4; bench.add(benchSeat);
  bench.position.set(-5.5, 0, -5.0); W.add(bench);
  
  // the team
  const team = [
    { k: 'mechanic', f: buildFigure({ suit: 0x22242a }), pose: 'kneel', pos: [1.25, 0, 1.5], ry: Math.PI, amp: { 'sh1': [-0.2, 0, 0], 'el1': [-0.25, 0, 0] } },
    { k: 'engine', f: buildFigure({ suit: 0x22242a }), pose: 'lean', pos: [1.05, 0, -1.3], ry: 0, amp: { 'el1': [0.25, 0, 0], 'el-1': [-0.2, 0, 0] } },
    { k: 'uph1', f: buildFigure({ suit: 0x2a2320, hair: 0x2b1d14, gender: 'f' }), pose: 'lean', pos: [-6.0, 0, -4.15], ry: Math.PI, amp: { 'sh1': [-0.5, 0, 0.2], 'el1': [-0.6, 0, 0] } },
    { k: 'uph2', f: buildFigure({ suit: 0x2a2320 }), pose: 'lean', pos: [-4.9, 0, -4.15], ry: Math.PI, amp: { 'sh-1': [-0.5, 0, -0.2], 'el-1': [-0.6, 0, 0] } },
    { k: 'body', f: buildFigure({ suit: 0x22242a }), pose: 'crouch', pos: [-1.55, 0, 1.45], ry: Math.PI, amp: { 'sh1': [0.12, 0.25, 0], 'sh-1': [0.12, -0.25, 0] } },
    { k: 'tech', f: buildFigure({ suit: 0x1c1d22 }), pose: 'holdGlass', pos: [2.5, 0, 2.1], ry: Math.PI + 0.6, amp: { head: [0.12, 0, 0] } },
    { k: 'lead', f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), pose: 'gesture', pos: [3.6, 0, 2.3], ry: -2.25, amp: { 'sh1': [-0.25, 0, 0.1], 'el1': [-0.2, 0, 0], head: [0, 0.25, 0] } },
  ];
  for (const m of team) { m.f.position.set(...m.pos); m.f.rotation.y = m.ry; W.add(m.f); }
  const tablet = mesh(roundBox(0.26, 0.18, 0.012, 0.01), M.blackGloss()); W.add(tablet);
  const pol = buildPolisher(); pol.scale.setScalar(1.2); pol.position.set(-1.45, 0.62, 0.9); pol.rotation.set(0, 0, -Math.PI / 2 + 0.15); W.add(pol);
  spot(W, { intensity: 700, pos: [0, 6.5, 2.5], target: [0, 0.4, 0], angle: 0.8, penumbra: 0.9, color: 0xf4f6ff });
  spot(W, { intensity: 400, pos: [-6, 6.5, -2], target: [-5.5, 0.8, -5], angle: 0.6, penumbra: 0.9, color: 0xfff0dc });
  spot(W, { intensity: 160, pos: [6, 4, 5], target: [0, 0.5, 0], angle: 0.6, penumbra: 1, color: 0xffcf96 });
  const hemi = new THREE.HemisphereLight(0xdfe6f0, 0x3a3a3c, 1.6); W.add(hemi);
  const dd = dust(W, { count: 300, box: [0, 2.5, 0, 14, 5, 10], size: 0.7, intensity: 0.45, res: ctx.res, seed: 31 });
  // pinstripe on the flank (grows during 3.5, visible afterwards)
  const stripeU0 = 0.08, stripeU1 = 0.42, stripePhi = 0.32;
  const stripeGeo = patch((u, v, o) => { car.shape.body(u, stripePhi + v * 0.006, o); const n = new THREE.Vector3(); car.shape.normal(u, stripePhi, n); o.addScaledVector(n, 0.0012); }, stripeU0, stripeU1, 300, 0, 1, 1, { flip: true });
  const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshPhysicalMaterial({ color: 0xd8ae62, metalness: 0.9, roughness: 0.22, clearcoat: 1 })); W.add(stripe);
  ws.onUpdate((t) => {
    dd.set(t); car.lights(0, 0);
    const ph = Math.sin(((t - 18) / BEAT) * TAU), ph2 = Math.sin(((t - 18) / BEAT) * TAU * 2);
    for (const m of team) {
      const base = POSES[m.pose]; const p = { ...base }; for (const k in m.amp) { const b = p[k] || [0, 0, 0]; p[k] = b.map((v, i) => v + m.amp[k][i] * (m.k === 'body' ? ph2 : ph)); }
      m.f.userData.pose(p);
    }
    const tech = team.find((m) => m.k === 'tech').f; tech.updateMatrixWorld(true); const wr = tech.userData.J['wr1']; const wp = new THREE.Vector3(); wr.getWorldPosition(wp);
    tablet.position.copy(wp).add(v3(-0.12, -0.02, -0.05).applyAxisAngle(v3(0, 1, 0), tech.rotation.y)); tablet.rotation.set(-0.9, tech.rotation.y, 0);
    pol.userData.pad.rotation.y = t * 30; pol.position.x = -1.45 + Math.sin(((t - 18) / BEAT) * TAU * 2) * 0.12; pol.position.y = 0.62 + Math.cos(((t - 18) / BEAT) * TAU * 2) * 0.04;
    const sk = clamp((t - 21.7) / 1.4); stripe.geometry.setDrawRange(0, Math.floor(smooth(sk) * 300) * 6); stripe.visible = sk > 0;
  });

  // ---------------------------------------------------------------- 3.1 gloved fingertip on the panel gap
  const hand = buildHand({ material: M.glove() }); W.add(hand); hand.userData.setCurl([0.0, 1.0, 1.05, 1.1], 0.7);
  const gapU = 0.43 - 0.0011; const P = new THREE.Vector3(), N = new THREE.Vector3();
  const handAt = (k) => {
    const phi = lerp(0.62, 0.05, k); car.shape.body(gapU, phi, P); car.shape.normal(gapU, phi, N);
    const dir = N.clone().multiplyScalar(-1).add(v3(0.25, -0.35, 0)).normalize();
    hand.quaternion.setFromUnitVectors(v3(0, 1, 0), dir); hand.rotateY(-0.4);
    const tipLocal = v3(-0.03, 0.093 + 0.046, 0); const tip = tipLocal.applyQuaternion(hand.quaternion);
    hand.position.copy(P).addScaledVector(N, 0.006).sub(tip); return P.clone();
  };
  shots.push(shot('s3.1', 18.0, 19.1, ws, (lt, u, cam) => {
    hand.visible = true; const k = smooth(clamp((lt + 0.2) / 1.5)); const tipP = handAt(k);
    const n = N.clone(); const camP = tipP.clone().addScaledVector(n, 0.3).add(v3(-0.16, 0.1 - k * 0.05, 0)); const tgt = tipP.clone().add(v3(0.01, 0.02, 0));
    const d = aim(cam, camP, tgt, { fov: 32, near: 0.01, far: 80, roll: 0.05 }); return { focus: d, aperture: 10 };
  }, { prep: () => { hand.visible = true; }, trans: { type: 'zoom', dur: 0.6, center: [0.5, 0.5] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.15, threshold: 1.4, gain: [0.98, 1.0, 1.04] } }));

  // ---------------------------------------------------------------- 3.2 torque wrench click
  const tw = makeSet('studio', { envIntensity: 0.8 }); const hub = buildHub(); tw.scene.add(hub); const wrench = buildTorqueWrench(); tw.scene.add(wrench);
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

  // ---------------------------------------------------------------- 3.3 micro-polisher removing a swirl mark
  const ps = makeSet('studio', { envIntensity: 1.2 }); const panel = paintPanel(1.0, 0.6); panel.rotation.x = -Math.PI / 2; ps.scene.add(panel);
  const swirlTex = drawTexture(1024, 1024, (g, w) => { g.clearRect(0, 0, w, w); const r = rng(5); g.strokeStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 900; i++) { const cx = w * (0.2 + r() * 0.6), cy = w * (0.3 + r() * 0.4), rad = 20 + r() * 260; const a0 = r() * TAU; g.lineWidth = 0.6 + r() * 0.9; g.beginPath(); g.arc(cx, cy, rad, a0, a0 + 0.3 + r() * 0.9); g.stroke(); } }, { srgb: false });
  const swirlMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { map: { value: swirlTex }, clearX: { value: -1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform sampler2D map; uniform float clearX; varying vec2 vUv; varying vec3 vW; void main(){ float a = texture2D(map, vUv).r; float keep = smoothstep(clearX - 0.03, clearX + 0.06, vW.x); gl_FragColor = vec4(vec3(1.0,0.96,0.9) * a * 0.22 * keep, 1.); }' });
  const swirl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), swirlMat); swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.0015; ps.scene.add(swirl);
  const polisher = buildPolisher(); ps.scene.add(polisher);
  const strip = lightStrip(ps.scene, { w: 3, h: 0.25, pos: [0.0, 1.0, -1.2], rot: [-0.6, 0, 0], intensity: 3, color: 0xfff1de });
  spot(ps.scene, { intensity: 3, pos: [0.4, 0.8, -0.6], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffd9a8 });
  ps.onUpdate((t) => { const lt = t - 20.0; const x = lerp(-0.32, 0.25, smooth(clamp((lt + 0.2) / 1.2))); polisher.position.set(x + Math.sin(lt * 9) * 0.006, 0.0, 0.02 + Math.cos(lt * 9) * 0.006); polisher.userData.pad.rotation.y = lt * 40; swirlMat.uniforms.clearX.value = x - 0.05; });
  shots.push(shot('s3.3', 20.0, 20.9, ps, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.05, 0.1, u), 0.07, 0.3), v3(lerp(-0.12, 0.05, u), 0.0, 0.0), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.18, threshold: 1.5 } }));

  // ---------------------------------------------------------------- 3.4 paint thickness gauge (analogue)
  const gs = makeSet('studio', { envIntensity: 1.0 }); const gp = paintPanel(1.0, 0.6, 0x3d0b12); gp.rotation.x = -Math.PI / 2; gs.scene.add(gp);
  const gauge = buildGauge({ min: 0, max: 500, major: 100, minor: 20, label: 'µm', sub: 'paint depth', radius: 0.045 }); gauge.position.set(0.09, 0.07, -0.06); gauge.rotation.set(-0.5, -0.3, 0); gs.scene.add(gauge);
  const probe = new THREE.Group(); probe.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 32), M.matte(0x111111, 0.4), { p: [0, 0.05, 0] })); probe.add(mesh(new THREE.CylinderGeometry(0.009, 0.003, 0.012, 32), M.chrome(), { p: [0, 0.006, 0] })); probe.add(mesh(new THREE.TorusGeometry(0.0092, 0.0012, 8, 32), M.goldPolished(), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] }));
  probe.rotation.z = 0.3; gs.scene.add(probe);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(-0.03, 0.1, 0), v3(-0.02, 0.15, -0.05), v3(0.06, 0.12, -0.09), v3(0.09, 0.06, -0.07)]), 40, 0.002, 6), M.matte(0x0a0a0a, 0.5)); gs.scene.add(cable);
  spot(gs.scene, { intensity: 1.6, pos: [0.2, 0.5, 0.4], target: [0.04, 0.02, -0.03], angle: 0.45, penumbra: 1, color: 0xfff0dc });
  spot(gs.scene, { intensity: 1.2, pos: [-0.4, 0.2, -0.3], target: [0.05, 0.05, -0.05], angle: 0.5, penumbra: 1, color: 0xffb46a });
  gs.onUpdate((t) => { const lt = t - 20.9; const touch = smooth(clamp(lt / 0.3)); probe.position.set(0, lerp(0.02, 0.0, touch), 0); const v = touch * (118 + Math.exp(-lt * 6) * Math.sin(lt * 26) * 30); gauge.userData.setValue(Math.max(0, v)); });
  shots.push(shot('s3.4', 20.9, 21.7, gs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.12, -0.09, u), 0.05, 0.16), v3(lerp(0.0, 0.07, smooth(u)), lerp(0.01, 0.05, smooth(u)), lerp(0.0, -0.05, smooth(u))), { fov: 30, near: 0.005, far: 20 });
    return { focus: lerp(0.2, d, smooth((u - 0.3) * 2.5)), aperture: 16 };
  }, { trans: { type: 'luma', dur: 0.35 }, grade: { exposure: 1.1, bloom: 0.4, streak: 0.15, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.5 needle-fine pinstripe (on the car itself)
  const brush = buildStripingBrush(); W.add(brush);
  const brushHand = new THREE.Group(); W.add(brushHand);
  const stripeAt = (k, o) => { const u = lerp(stripeU0, stripeU1, k); car.shape.body(u, stripePhi + 0.003, o); return u; };
  const placeBrush = (t) => {
    const k = smooth(clamp((t - 21.7) / 1.4)); const tip = new THREE.Vector3(); const u = stripeAt(k, tip); const n = new THREE.Vector3(); car.shape.normal(u, stripePhi, n);
    brush.position.copy(tip).addScaledVector(n, 0.001); brush.quaternion.setFromUnitVectors(v3(0, 1, 0), n.clone().multiplyScalar(0.7).add(v3(0.45, 0.5, 0)).normalize());
    brushHand.position.copy(brush.position).add(v3(0.07, 0.17, 0.05).applyQuaternion(new THREE.Quaternion())); brushHand.quaternion.copy(brush.quaternion); brushHand.rotateZ(0.6); brushHand.rotateX(-0.4);
    return { tip, n };
  };
  shots.push(shot('s3.5', 21.7, 23.0, ws, (lt, u, cam, t) => {
    hand.visible = false; brush.visible = brushHand.visible = true; const { tip, n } = placeBrush(t);
    const p = tip.clone().addScaledVector(n, 0.22).add(v3(0.16, 0.08, 0)); const d = aim(cam, p, tip.clone().add(v3(-0.03, 0.02, 0)), { fov: 30, near: 0.005, far: 80 });
    return { focus: d, aperture: 10 };
  }, { prep: (lt, u, t) => { hand.visible = false; brush.visible = brushHand.visible = true; }, trans: { type: 'whip', dur: 0.3, dir: [-1, 0.1] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.18, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.6 pull out: the team, orbit, crane up
  shots.push(shot('s3.6', 23.0, 30.0, ws, (lt, u, cam, t) => {
    hand.visible = false; const { tip, n } = placeBrush(t); brush.visible = brushHand.visible = lt < 1.2;
    const k = clamp(u); const orbitA = lerp(0.2, -1.9, smooth(invLerp(0.12, 0.72, k))); const R = lerp(0.3, 7.5, easeOutCubic(invLerp(0.0, 0.25, k)));
    let p = v3(Math.sin(orbitA) * R, lerp(0.8, 2.2, smooth(invLerp(0.05, 0.3, k))), Math.cos(orbitA) * R + 0.4);
    const crane = smooth(invLerp(0.7, 1.0, k)); p = p.lerp(v3(-2.5, 6.4, 9.5), crane);
    if (k < 0.1) p = tip.clone().addScaledVector(n, lerp(0.22, 1.2, k / 0.1)).add(v3(0.16, 0.08 + k * 4, 0));
    const tgt = new THREE.Vector3().lerpVectors(tip, v3(-0.5, 0.6, -0.6), smooth(invLerp(0.0, 0.2, k))).lerp(v3(-1.0, 0.0, -2.0), crane);
    const d = aim(cam, p, tgt, { fov: lerp(28, 40, smooth(k * 3)), near: 0.01, far: 120 });
    return { focus: d, aperture: lerp(14, 1.2, smooth(k * 4)) };
  }, { prep: () => { hand.visible = false; }, trans: { type: 'cut', dur: 0 }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.12, threshold: 1.5, gain: [0.98, 1.0, 1.03] } }));
  // hide macro rigs when not used
  shots[0].prep = () => { hand.visible = true; brush.visible = brushHand.visible = false; };
  return { shots, car };
}
