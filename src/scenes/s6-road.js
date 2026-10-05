// SCENE 6 (50–62s) — THE ROAD. Tyre on wet asphalt, glowing brake disc, gearshift, helmet visor →
// convoy on a Mediterranean coast road at golden hour → vertigo aerial → slow-motion circuit pass.
import { THREE, envOn, makeSet, spot, point, dirLight, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic } from './common.js';
import { buildCar } from '../models/car.js';
import { buildCoast, buildCircuit } from '../models/landscape.js';
import { buildHand } from '../models/figure.js';
import { mesh, roundBox, lathe, tube } from '../models/geo.js';
import { skyDome, glow, dotTexture } from '../engine/materials.js';
import { asphalt } from '../engine/textures.js';
import { invLerp, easeOutCubic, easeInCubic, TAU, hash1 } from '../engine/util.js';

function droplets(scene, n, box, seed = 3) {
  const r = rng(seed); const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transparent: true, opacity: 0.35, clearcoat: 1, envMapIntensity: 2.5 }), n);
  const m = new THREE.Matrix4(); const data = [];
  for (let i = 0; i < n; i++) { const s = r.range(0.0015, 0.006); const p = v3(box[0] + r.range(-box[3], box[3]), box[1] + s * 0.4, box[2] + r.range(-box[5], box[5])); data.push({ p, s }); m.compose(p, new THREE.Quaternion(), v3(s, s * 0.55, s)); im.setMatrixAt(i, m); }
  scene.add(im); return { im, data };
}

/** Spark streaks (slow-motion grinding sparks) as additive points with velocity trails. */
function sparkStream(n = 900, res = 1) {
  const r = rng(17); const vel = new Float32Array(n * 3), birth = new Float32Array(n), life = new Float32Array(n);
  for (let i = 0; i < n; i++) { vel.set([r.range(-6, -1.5), r.range(0.4, 3.2), r.range(-1.6, 1.6)], i * 3); birth[i] = r(); life[i] = r.range(0.25, 0.7); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('vel', new THREE.BufferAttribute(vel, 3)); g.setAttribute('birth', new THREE.BufferAttribute(birth, 1)); g.setAttribute('life', new THREE.BufferAttribute(life, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, rate: { value: 1 }, res: { value: res }, on: { value: 1 } },
    vertexShader: `uniform float time, rate, res, on; attribute vec3 vel; attribute float birth; attribute float life; varying float vA;
      void main(){ float age = fract(time * rate * 0.5 + birth) * 1.2; vec3 p = vel * age + vec3(0., -4.9 * age * age, 0.); p.y = abs(p.y);
        vA = on * (1. - smoothstep(life * 0.6, life, age)); vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(60. * res / -mv.z, 2., 16. * res); }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d,d)*18.); gl_FragColor = vec4(vec3(2.4, 1.1, 0.35) * a * vA * 3.0, 1.); }` });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; return pts;
}

export async function buildS6(ctx) {
  const shots = [];
  // ---------------------------------------------------------------- 6.1 tyre on wet asphalt
  const ts = makeSet('golden', { envIntensity: 0.9 }); const T = ts.scene; const A = asphalt();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshPhysicalMaterial({ map: A.map, normalMap: A.normalMap, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.1 })); ground.rotation.x = -Math.PI / 2; T.add(ground);
  const tyreCar = buildCar('classic', { fasteners: false, engine: false, interior: false, color: 0x050505, seed: 91 }); T.add(tyreCar.group);
  const drops = droplets(T, 900, [0, 0, 0, 1.6, 0, 1.2], 5);
  dirLight(T, { color: 0xffc27a, intensity: 3.5, pos: [-6, 1.5, 3] });
  const hemiT = new THREE.HemisphereLight(0x9ab0d0, 0x2a2018, 0.6); T.add(hemiT);
  ts.onUpdate((t) => { const x = (t - 50.0) * 1.4 - 1.2; tyreCar.group.position.x = x; tyreCar.spin(x / 0.335); });
  shots.push(shot('s6.1', 50.0, 50.9, ts, (lt, u, cam) => {
    const wx = tyreCar.group.position.x + tyreCar.shape.wheels[0].x; const d = aim(cam, v3(wx + 0.55, 0.05, 1.2), v3(wx + 0.05, 0.06, 0.72), { fov: 30, near: 0.01, far: 60 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 6.2 brake disc glowing
  const bs = makeSet('studio', { envIntensity: 0.6 }); const bcar = buildCar('classic', { fasteners: false, engine: false, interior: false, seed: 92 }); bs.scene.add(bcar.group);
  const wheelF = bcar.wheels.find((w) => w.front && w.side > 0); wheelF.group.visible = true; wheelF.group.userData.spin.children[0].visible = false; // tyre hidden: see the disc through the spokes
  const discGlow = point(bs.scene, { color: 0xff5a10, intensity: 0, pos: [1.3, 0.35, 0.6] });
  bs.onUpdate((t) => { const k = smooth(clamp((t - 50.7) / 0.8)); bcar.brakeGlow(0.25 + k * 0.75); discGlow.intensity = 0.6 + k * 1.6; bcar.spin((t - 50.9) * 2.5); });
  spot(bs.scene, { intensity: 10, pos: [3, 1.5, 2.5], target: [1.3, 0.35, 0.7], angle: 0.3, penumbra: 1, color: 0xffd9a8 });
  shots.push(shot('s6.2', 50.9, 51.7, bs, (lt, u, cam) => {
    const c = v3(bcar.shape.wheels[0].x, 0.335, 0.6); const d = aim(cam, c.clone().add(v3(lerp(0.4, 0.3, u), lerp(0.12, 0.05, u), 0.5)), c.clone().add(v3(-0.02, 0.0, -0.05)), { fov: 34, near: 0.01, far: 30 });
    return { focus: d, aperture: 10 };
  }, { trans: { type: 'flash', dur: 0.3 }, grade: { exposure: 1.1, bloom: 0.7, streak: 0.35, threshold: 1.1 } }));

  // ---------------------------------------------------------------- 6.3 gearshift into the gate
  const gs = makeSet('golden', { envIntensity: 0.9 }); const G = gs.scene;
  const gate = new THREE.Group(); G.add(gate);
  const plate = new THREE.Shape(); plate.moveTo(-0.07, -0.06); plate.lineTo(0.07, -0.06); plate.lineTo(0.07, 0.06); plate.lineTo(-0.07, 0.06); plate.closePath();
  for (const [x0, y0, x1, y1] of [[-0.05, 0, 0.05, 0], [-0.05, -0.04, -0.05, 0.04], [0, -0.04, 0, 0.04], [0.05, -0.04, 0.05, 0.04]]) { const h = new THREE.Path(); const w = 0.006; if (x0 === x1) { h.moveTo(x0 - w, y0); h.lineTo(x0 + w, y0); h.lineTo(x0 + w, y1); h.lineTo(x0 - w, y1); } else { h.moveTo(x0, y0 - w); h.lineTo(x0, y0 + w); h.lineTo(x1, y0 + w); h.lineTo(x1, y0 - w); } h.closePath(); plate.holes.push(h); }
  gate.add(mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), M.polished(), { r: [-Math.PI / 2, 0, 0] }));
  gate.add(mesh(new THREE.PlaneGeometry(0.4, 0.3), M.leather(0x14100e), { r: [-Math.PI / 2, 0, 0], p: [0, -0.004, 0] }));
  const lever = new THREE.Group(); G.add(lever); lever.add(mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.17, 16), M.chrome(), { p: [0, 0.085, 0] })); lever.add(mesh(new THREE.SphereGeometry(0.021, 32, 20), M.walnut(), { p: [0, 0.18, 0] }));
  
  dirLight(G, { color: 0xffc27a, intensity: 2.5, pos: [-2, 2.5, 1.5] });
  gs.onUpdate((t) => {
    const k = smooth(clamp((t - 51.85) / 0.35)); const x = lerp(0, 0.05, smooth(clamp((t - 51.7) / 0.15))); const z = lerp(0, -0.04, k); const tilt = 0.25;
    lever.position.set(0, 0, 0); lever.rotation.set(-z * 6 * 0.0 + (z / 0.04) * -tilt, 0, -(x / 0.05) * tilt);
  });
  shots.push(shot('s6.3', 51.7, 52.5, gs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.3, 0.26, u), lerp(0.24, 0.2, u), 0.34), v3(0.0, 0.1, -0.01), { fov: 32, near: 0.005, far: 20 }); return { focus: d, aperture: 8 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.22, threshold: 1.3, gain: [1.05, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 6.5/6.6 the coast (built before the visor so it can be reflected)
  const cs = makeSet('golden', { envIntensity: 0.8, bg: null, fog: new THREE.Fog(0xd9a070, 250, 1400) }); const C = cs.scene;
  skyDome(C, 0x2a4f7a, 0xffb36b, 0x3a2a1c, [-0.8, 0.12, 0.3], 0xffc27a, 3.0, 4).scale.setScalar(16);
  const coast = buildCoast({}); C.add(coast);
  const sun = dirLight(C, { color: 0xffc27a, intensity: 3.2, pos: [-400, 80, 150] });
  C.add(new THREE.HemisphereLight(0x9ab6d8, 0x4a3a28, 1.6));
  const convoyPresets = [['classic', 0x050505], ['gt', 0x3d0b12], ['roadster', 0x101a14], ['supercar', 0x9a9b9f], ['classic', 0xcdb48a]];
  const convoy = convoyPresets.map(([p, c], i) => { const car = buildCar(p, { lite: true, color: c, seed: 100 + i }); car.lights(1, 1); C.add(car.group); return car; });
  const roadLen = coast.userData.road.getLength();
  const convoyAt = (t) => { const s0 = 0.06 + (t - 52.5) * (17 / roadLen); convoy.forEach((car, i) => { const { p, heading } = coast.userData.onRoad(s0 - i * (16 / roadLen)); car.group.position.copy(p); car.group.rotation.y = heading; car.spin((t - 50) * 50); }); return s0; };
  cs.onUpdate((t) => convoyAt(t));

  // ---------------------------------------------------------------- 6.4 helmet visor reflecting the road
  const hs = makeSet(null, { bg: 0x000000 }); const H = hs.scene;
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }); const cubeCam = new THREE.CubeCamera(0.5, 2000, cubeRT);
  convoyAt(55.0); const capPos = coast.userData.onRoad(0.13).p.add(v3(0, 1.4, 0)); cubeCam.position.copy(capPos); C.add(cubeCam); cubeCam.update(ctx.renderer, C); C.remove(cubeCam);
  const pm = new THREE.PMREMGenerator(ctx.renderer); const roadEnv = pm.fromCubemap(cubeRT.texture).texture; H.environment = roadEnv; H.environmentIntensity = 1.0;
  const helmet = new THREE.Group(); H.add(helmet);
  helmet.add(mesh(new THREE.SphereGeometry(0.15, 64, 48), M.paint(0x3d0b12, { metalness: 0.4 }), { s: [1, 1.08, 1.12] }));
  helmet.add(mesh(new THREE.TorusGeometry(0.152, 0.004, 8, 96, Math.PI), M.goldPolished(), { r: [0, Math.PI / 2, 0], s: [1, 1.08, 1.12] }));
  const visor = mesh(new THREE.SphereGeometry(0.156, 64, 32, -1.05, 2.1, 1.2, 0.75), new THREE.MeshPhysicalMaterial({ color: 0xc8a060, metalness: 1, roughness: 0.03, clearcoat: 1 }), { s: [1, 1.08, 1.12] });
  helmet.add(visor); helmet.rotation.y = Math.PI / 2;
  hs.onUpdate((t) => { helmet.rotation.y = Math.PI / 2 + Math.sin((t - 52.5) * 0.8) * 0.15; });
  spot(H, { intensity: 2, pos: [-0.6, 0.4, 0.6], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffc27a });
  shots.push(shot('s6.4', 52.5, 53.4, hs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.16, 0.1, u), lerp(0.05, 0.03, u), 0.42), v3(0.02, 0.0, 0.14), { fov: 30, near: 0.01, far: 20 }); return { focus: d, aperture: 6 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.2, bloom: 0.5, streak: 0.28, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // 6.5 — convoy on the coast road, tracking then rising
  shots.push(shot('s6.5', 53.4, 56.6, cs, (lt, u, cam, t) => {
    const lead = convoy[0].group, mid = convoy[2].group; const fwd = v3(Math.cos(lead.rotation.y), 0, -Math.sin(lead.rotation.y)); const side = v3(-fwd.z, 0, fwd.x);
    const k = smooth(u); const p = lead.position.clone().addScaledVector(fwd, lerp(9, 22, k)).addScaledVector(side, lerp(5, 16, k)).add(v3(0, lerp(1.4, 9, k), 0));
    const tgt = new THREE.Vector3().lerpVectors(lead.position, mid.position, k).add(v3(0, 0.6, 0));
    const d = aim(cam, p, tgt, { fov: lerp(30, 38, k), near: 0.1, far: 3000, roll: lerp(-0.03, 0.02, k) }); return { focus: d, aperture: lerp(3, 0.8, k) };
  }, { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.0, bloom: 0.55, streak: 0.35, threshold: 1.3, gain: [1.08, 1.0, 0.86], saturation: 1.05 } }));
  // 6.6 — vertigo aerial: top-down, rotating and zooming over the switchbacks
  shots.push(shot('s6.6', 56.6, 59.4, cs, (lt, u, cam, t) => {
    const mid = convoy[2].group.position; const ang = lerp(0.3, -0.5, u); const h = lerp(120, 70, smooth(u));
    const p = v3(mid.x + Math.sin(ang) * 6, mid.y + h, mid.z + Math.cos(ang) * 6); cam.up.set(Math.sin(ang), 0, Math.cos(ang));
    const d = aim(cam, p, mid, { fov: lerp(28, 46, smooth(u)), near: 1, far: 3000 }); cam.up.set(0, 1, 0); return { focus: d, aperture: 0 };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.5, 0.5] }, grade: { exposure: 1.05, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.08, 1.0, 0.86] } }));

  // ---------------------------------------------------------------- 6.7 circuit: slow-motion pass with sparks
  const ci = makeSet('golden', { envIntensity: 0.9, bg: null, fog: new THREE.Fog(0xd08850, 60, 500) }); const CI = ci.scene;
  skyDome(CI, 0x23365a, 0xff9a52, 0x2a1e14, [-0.9, 0.05, 0.2], 0xffa45a, 3.2, 4).scale.setScalar(16);
  CI.add(buildCircuit()); const racer = buildCar('supercar', { lite: true, color: 0x0b0b0c, seed: 120 }); racer.lights(1, 1); CI.add(racer.group);
  const sparks = sparkStream(1100, ctx.res); CI.add(sparks);
  dirLight(CI, { color: 0xffb070, intensity: 3.5, pos: [-200, 40, 80] }); CI.add(new THREE.HemisphereLight(0x8aa6cc, 0x3a2a1a, 0.7));
  ci.onUpdate((t) => { const lt = t - 59.4; const x = -14 + lt * 9.5; racer.group.position.set(x, 0.0, -1.5); racer.group.rotation.y = 0; racer.spin(x / 0.35); sparks.position.set(x + 0.4, 0.05, -1.5); sparks.material.uniforms.time.value = lt * 0.6; sparks.material.uniforms.on.value = smooth(clamp(lt / 0.3)); });
  shots.push(shot('s6.7', 59.4, 62.0, ci, (lt, u, cam) => {
    const x = racer.group.position.x; const d = aim(cam, v3(lerp(-4, 6, u), 0.35, 4.2), v3(x + 0.6, 0.45, -1.5), { fov: 36, near: 0.05, far: 2000 }); return { focus: d, aperture: 5 };
  }, { trans: { type: 'whip', dur: 0.4, dir: [1, 0] }, grade: { exposure: 1.1, bloom: 0.6, streak: 0.35, threshold: 1.1, gain: [1.08, 1.0, 0.86] } }));
  return { shots };
}
