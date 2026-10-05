// SCENE 1 (0–8s) — THE SPARK. Spark-plug arc → flame → bore dive past piston and con-rod →
// intake runner → burst into a monumental hangar; ends on a wide aerial of the car alone.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, lightCone, aim, at, curve, easeInOutCubic } from './common.js';
import { buildSparkPlug, Arc, flameKernel, flameBurst, buildBottomEnd, buildRunner } from '../models/engine.js';
import { buildCar, reflectionOf, contactShadow } from '../models/car.js';
import { glow } from '../engine/materials.js';
import { invLerp, easeOutCubic, easeInCubic, hash1 } from '../engine/util.js';

export function hangarSet(ctx, hero) {
  const set = makeSet('museum', { envIntensity: 0.6, fog: new THREE.FogExp2(0x0a0908, 0.018) }); const s = set.scene;
  s.add(hero.group); s.add(reflectionOf(hero.group)); s.add(contactShadow(hero, 0.95));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), M.floor(0x1c1c1e)); floor.material.transparent = true; floor.material.opacity = 0.9; floor.rotation.x = -Math.PI / 2; s.add(floor); envOn(floor.material, s, 0.35);
  // barrel-vault ribs
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.6, roughness: 0.45 }); const R = 19;
  const ribs = [];
  for (let i = -6; i <= 6; i++) {
    const pts = []; for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI; pts.push(new THREE.Vector3(i * 6, Math.sin(a) * R * 0.85, Math.cos(a) * R)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.22, 6); ribs.push(tg);
  }
  for (const g of ribs) s.add(new THREE.Mesh(g, ribMat));
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 78, 64, 1, true, 0, Math.PI), M.matte(0x060607, 0.95)); shell.rotation.z = Math.PI / 2; shell.scale.set(0.85, 1, 1); shell.material.side = THREE.BackSide; s.add(shell);
  // skylight along the apex
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(78, 1.6), M.emissive(0xbcc8dc, 2.6)); sky.position.set(0, R * 0.85 - 0.05, 0); sky.rotation.x = Math.PI / 2; s.add(sky);
  // end wall with a slit of light between the hangar doors
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), M.matte(0x070708, 0.9)); wall.position.set(-38, 8, 0); wall.rotation.y = Math.PI / 2; s.add(wall);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 16), M.emissive(0xffd6a0, 3.5)); slit.position.set(-37.9, 8, 0); slit.rotation.y = Math.PI / 2; s.add(slit);
  const shaft = lightCone(40, 6, 0xffcc8a, 0.05); shaft.position.set(-37.5, 8, 0); shaft.rotation.z = -Math.PI / 2 + 0.06; s.add(shaft);
  // pendant practicals
  const r = rng(12);
  for (let i = 0; i < 26; i++) { const x = r.range(-34, 34), z = r.range(-12, 12); if (Math.abs(x) < 6 && Math.abs(z) < 5) continue; const y = r.range(7, 9); const gl = glow(0xffc985, 0.9, 2.2); gl.position.set(x, y, z); s.add(gl); const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, R * 0.85 - y, 4), M.matte(0x050505)); cord.position.set(x, (R * 0.85 + y) / 2, z); s.add(cord); }
  // museum key light + volumetric cone + dust
  spot(s, { intensity: 520, pos: [0.3, 11, 0.8], target: [0, 0.4, 0], angle: 0.27, penumbra: 0.8, color: 0xfff0dc });
  spot(s, { intensity: 90, pos: [-6, 3, -7], target: [0, 0.6, 0], angle: 0.4, penumbra: 1, color: 0xffb46a });
  spot(s, { intensity: 60, pos: [6, 2.5, 8], target: [0, 0.6, 0], angle: 0.4, penumbra: 1, color: 0xb9c8ff });
  const cone = lightCone(11, 3.2, 0xffe6c0, 0.07); cone.position.set(0.3, 11, 0.8); s.add(cone);
  const d = dust(s, { count: 260, box: [0.2, 4.5, 0.5, 3.2, 9, 3.2], size: 0.9, intensity: 0.7, res: ctx.res });
  // rib-base uplights give the vault its scale
  for (let i = -6; i <= 6; i++) for (const zs of [1, -1]) { const u = spot(s, { intensity: 0, pos: [i * 6, 0.2, zs * (R - 1)], target: [i * 6, 8, zs * (R - 6)], angle: 0.5, penumbra: 1 }); s.remove(u); const gl = glow(0xffc070, 1.2, 1.4); gl.position.set(i * 6, 0.3, zs * (R - 0.6)); s.add(gl); }
  // floor inlays: a ring of light around the car and long runways that give the aerial its scale
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.63, 160), M.emissive(0xffd9a0, 2.2)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; s.add(ring);
  for (const z of [-7, 7]) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(76, 0.04), M.emissive(0xffd9a0, 1.3)); ln.rotation.x = -Math.PI / 2; ln.position.set(0, 0.004, z); s.add(ln); }
  const wash = new THREE.HemisphereLight(0x3a3630, 0x050505, 0.6); s.add(wash);
  // cove-lit vault: warm glow rising from the base, cool wash from the skylight
  shell.material = new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, uniforms: {},
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec3 vW; void main(){ float h = clamp(vW.y / 16.2, 0., 1.); vec3 warm = vec3(1.0,0.62,0.3)*exp(-h*4.5)*0.13; vec3 cool = vec3(0.45,0.52,0.65)*pow(h, 8.)*0.22; float endFade = smoothstep(39., 20., abs(vW.x)); gl_FragColor = vec4((warm + cool) * (0.25 + 0.75*endFade), 1.); }' });
  set.onUpdate((t) => { d.set(t); hero.lights(0.0, 0.0); });
  return set;
}

export async function buildS1(ctx) {
  const shots = [];
  // ---------------------------------------------------------------- 1.1 spark macro
  const sp = makeSet('studio', { envIntensity: 1.3 }); const plug = buildSparkPlug(); sp.scene.add(plug);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 64, 32), new THREE.MeshStandardMaterial({ color: 0x3a3836, metalness: 0.9, roughness: 0.45, side: THREE.BackSide })); dome.position.set(0, 1.2, 0); sp.scene.add(dome);
  for (const [x, z] of [[3, 2.2], [-3, 2.2], [2.8, -2.6], [-2.8, -2.6]]) { const v = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.15, 48), M.darkChrome()); v.position.set(x, 6.5, z); sp.scene.add(v); }
  const gap = plug.userData.gap; const arc = new Arc(v3(0, 1.02, 0), v3(0.02, 1.11, 0.01)); sp.scene.add(arc.group);
  const arcLight = point(sp.scene, { color: 0xb8c8ff, intensity: 0, pos: [0, 1.06, 0.15], decay: 2 });
  const flame = flameKernel(); flame.position.copy(gap); flame.scale.setScalar(0.01); sp.scene.add(flame); flame.visible = false;
  const burst = flameBurst(900, ctx.res); burst.material.uniforms.gain.value = 2.6; burst.position.copy(gap); sp.scene.add(burst);
  const softbox = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), M.emissive(0xfff0dc, 1.2)); softbox.position.set(-1, 3.2, 4); softbox.lookAt(0, 1, 0); sp.scene.add(softbox);
  const flameLight = point(sp.scene, { color: 0xff8a3a, intensity: 0, pos: [0, 1.4, 0], decay: 2 });
  spot(sp.scene, { color: 0x9fb6ff, intensity: 140, pos: [-2.5, 3.5, -3.5], target: [0, 0.8, 0], angle: 0.35, penumbra: 0.7 });
  spot(sp.scene, { color: 0xffc58a, intensity: 70, pos: [3.5, 0.2, 2.5], target: [0, 0.6, 0], angle: 0.45, penumbra: 0.9 });
  spot(sp.scene, { color: 0xffe2c0, intensity: 40, pos: [-3, -1.5, 2.5], target: [0, 0.2, 0], angle: 0.5, penumbra: 1 });
  sp.onUpdate((t) => {
    const pre = t > 0.52 && t < 0.62 ? (hash1(Math.floor(t * 60)) > 0.5 ? 0.5 : 0) : 0;
    const main = smooth(invLerp(0.68, 0.74, t)) * (1 - smooth(invLerp(1.25, 1.55, t)));
    const a = Math.max(pre, main * (0.75 + 0.25 * hash1(Math.floor(t * 40) + 3))); arc.update(t, a);
    arcLight.intensity = a * 3.5;
    const k = clamp((t - 1.0) / 1.6); flame.visible = false; flame.scale.setScalar(0.05 + easeInCubic(k) * 6 + k * 0.5);
    flame.userData.set(t, smooth(k * 2) * (0.12 + k * 0.5), smooth(k * 1.3));
    burst.visible = t > 0.95; burst.material.uniforms.tau.value = Math.max(0, t - 0.95) * 0.9; burst.material.uniforms.scale.value = 1.6;
    flameLight.intensity = smooth(k * 2) * 6 * (1 + k * 3);
  });
  shots.push(shot('s1.1', 0, 2.55, sp, keyCam([v3(-1.2, 1.5, 4.2), v3(-0.7, 1.25, 2.8), v3(-0.3, 1.1, 1.7)], [v3(0.15, 0.55, 0), v3(0.12, 0.85, 0), v3(0.1, 1.04, 0)], { fov: 24, aperture: (u) => 6 + u * 10, near: 0.05, far: 60, driftAmp: 0.006 }),
    { trans: { type: 'cut', dur: 0 }, grade: { exposure: 1.1, bloom: 0.55, streak: 0.3, streakTint: [0.6, 0.75, 1.1], threshold: 1.2 } }));

  // ---------------------------------------------------------------- 1.2 bore dive
  const be = makeSet('studio', { envIntensity: 0.55 }); const bottom = buildBottomEnd(); be.scene.add(bottom);
  const chamberGlow = point(be.scene, { color: 0xff8a3a, intensity: 0, pos: [0, 0.08, 0], decay: 2 });
  be.scene.fog = new THREE.FogExp2(0x000000, 2.0);
  spot(be.scene, { color: 0xffc070, intensity: 0.3, pos: [0.4, -0.12, 0.35], target: [0, -0.18, 0], angle: 0.45, penumbra: 0.8 });
  spot(be.scene, { color: 0xb8c8ff, intensity: 0.35, pos: [-0.4, -0.05, -0.3], target: [0, -0.2, 0], angle: 0.5, penumbra: 0.9 });
  const rim = point(be.scene, { color: 0xffd9a0, intensity: 0.05, pos: [0.12, -0.16, 0.16] });
  point(be.scene, { color: 0xffb060, intensity: 0.04, pos: [-0.1, -0.3, 0.12] });
  spot(be.scene, { color: 0xfff0dc, intensity: 0.25, pos: [0.3, -0.2, 0.25], target: [0, -0.2, 0], angle: 0.35, penumbra: 1 });
  const sparks = dust(be.scene, { count: 30, box: [0, -0.1, 0, 0.3, 0.4, 0.3], size: 0.012, intensity: 1.2, color: 0xffa860, speed: 0.02, res: ctx.res, seed: 8 });
  be.onUpdate((t) => {
    const k = clamp((t - 2.3) / 2.4); const theta = easeOutCubic(k) * Math.PI * 1.55; bottom.userData.setAngle(theta);
    chamberGlow.intensity = 0.012 * (1 - smooth(k * 1.4)); chamberGlow.position.y = 0.05 - k * 0.06; sparks.set(t);
  });
  const boreCam = (() => {
    const pc = curve([v3(0, 0.09, 0.004), v3(0.0, 0.045, 0.006), v3(0.01, -0.0, 0.02), v3(0.09, -0.11, 0.1), v3(0.16, -0.2, 0.14)]);
    return (lt, u, cam, t) => {
      const k = easeInOutCubic(clamp(u)); const p = at(pc, k + (u > 1 ? (u - 1) * 0.4 : 0));
      const crown = bottom.userData.piston.position.y; const tgt = k < 0.45 ? v3(0, crown - 0.02, 0) : v3(0, lerp(crown - 0.02, -0.2, smooth((k - 0.45) / 0.4)), 0);
      if (k < 0.4) p.y = Math.max(p.y, crown + 0.035);
      const d = aim(cam, p, tgt, { fov: lerp(78, 46, smooth(k * 1.3)), near: 0.002, far: 10, roll: k * 0.6 }); return { focus: d, aperture: lerp(6, 14, k) };
    };
  })();
  shots.push(shot('s1.2', 2.55, 4.65, be, boreCam, { trans: { type: 'flash', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.75, streak: 0.35, threshold: 1.0, gain: [1.05, 0.98, 0.9] } }));

  // ---------------------------------------------------------------- 1.3 intake runner
  const ru = makeSet('studio', { envIntensity: 0.35 }); const runner = buildRunner(); ru.scene.add(runner);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), M.emissive(0xffe6c4, 1.5)); mouth.position.set(1.0, 0, 0); mouth.rotation.y = -Math.PI / 2; ru.scene.add(mouth);
  const mouthLight = point(ru.scene, { color: 0xffe2b0, intensity: 0.02, pos: [0.55, 0, 0] });
  point(ru.scene, { color: 0xffb070, intensity: 0.0015, pos: [0.1, 0.02, 0] });
  for (let i = 1; i <= 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0305 + Math.pow(i / 6, 3) * 0.05, 0.0006, 6, 96), M.emissive(0xffd29a, 1.1)); ring.position.x = i * 0.1; ring.rotation.y = Math.PI / 2; ru.scene.add(ring); }
  ru.onUpdate((t) => { const k = clamp((t - 4.6) / 1.2); mouthLight.intensity = 0.01 + k * 0.05; mouth.material.color.setRGB(1, 0.9, 0.77).multiplyScalar(1.0 + k * k * 5); });
  shots.push(shot('s1.3', 4.65, 5.75, ru, (lt, u, cam) => {
    const k = easeInCubic(clamp(u * 0.92 + 0.08)); const x = lerp(-0.05, 0.66, k); const d = aim(cam, v3(x, 0.004 * Math.sin(lt * 3), 0.003), v3(x + 1, 0, 0), { fov: 70, near: 0.002, far: 10, roll: lt * 0.9 });
    return { focus: 0.12, aperture: 0 };
  }, { trans: { type: 'zoom', dur: 0.45, center: [0.5, 0.5] }, grade: { exposure: 0.85, bloom: 0.3, streak: 0.12, threshold: 2.0 } }));

  // ---------------------------------------------------------------- 1.4 hangar reveal
  const hero = buildCar('classic', { fasteners: false });
  const hs = hangarSet(ctx, hero);
  const hc = keyCam(
    [v3(2.9, 0.62, 1.55), v3(3.4, 0.9, 4.6), v3(0.6, 1.05, 7.4), v3(-1.8, 5.5, 13), v3(-3, 14, 18)],
    [v3(2.1, 0.55, 0.62), v3(1.2, 0.55, 0.3), v3(0.1, 0.55, 0), v3(0, 0.3, 0), v3(0, 0, 0)],
    { fov: (u) => lerp(32, 42, smooth(u)), aperture: (u) => lerp(9, 2, smooth(u * 1.5)), ease: (u) => easeInOutCubic(u) },
  );
  shots.push(shot('s1.4', 5.75, 8.0, hs, hc, { trans: { type: 'flash', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.5, streak: 0.3, threshold: 1.2, lift: [0.004, 0.003, 0.002] } }));
  return { shots, hero };
}
