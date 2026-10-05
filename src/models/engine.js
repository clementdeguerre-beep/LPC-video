// Engine assets: a period V8 (for the car / exploded view / macros) and the macro-scale
// combustion set for the opening shot (spark plug, chamber, piston, con-rod, crank, runners).
import * as THREE from 'three';
import { lathe, tube, roundBox, merge, xf, mesh, lineGeo, boltGeo } from './geo.js';
import { M } from '../engine/materials.js';
import { crosshatch } from '../engine/textures.js';
import { rng, TAU, noise1, hash1 } from '../engine/util.js';

/** Merge EdgesGeometry of every mesh under `group` (in group space) into one LineSegments. */
export function outlineOf(group, mat, threshold = 35) {
  group.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(); const arrs = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noOutline) return; const e = new THREE.EdgesGeometry(o.geometry, threshold);
    e.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); arrs.push(e.attributes.position.array);
  });
  let n = 0; for (const a of arrs) n += a.length; const all = new Float32Array(n); let k = 0; for (const a of arrs) { all.set(a, k); k += a.length; }
  const ls = new THREE.LineSegments(lineGeo(all), mat); ls.visible = false; return ls;
}

export function buildV8(opts = {}) {
  const g = new THREE.Group(); g.name = 'v8';
  const alu = M.castAlu(), crinkle = M.paint(0x4a0d14, { metalness: 0.3, roughness: 0.55, clearcoatRoughness: 0.4 });
  // block + sump
  g.add(mesh(roundBox(0.62, 0.3, 0.34, 0.03), alu, { p: [0, 0.27, 0] }));
  const sump = mesh(roundBox(0.54, 0.12, 0.3, 0.025), M.alu(), { p: [0, 0.08, 0] }); g.add(sump);
  for (let i = -5; i <= 5; i++) g.add(mesh(new THREE.BoxGeometry(0.008, 0.08, 0.3), M.alu(), { p: [i * 0.045, 0.06, 0] }));
  // heads + cam covers (V at ±45°)
  for (const side of [1, -1]) {
    const bank = new THREE.Group(); bank.position.set(0, 0.42, side * 0.12); bank.rotation.x = side * 0.72;
    bank.add(mesh(roundBox(0.6, 0.12, 0.2, 0.025), alu, { p: [0, 0.04, 0] }));
    const cover = mesh(roundBox(0.58, 0.07, 0.17, 0.03), crinkle, { p: [0, 0.13, 0] }); bank.add(cover);
    for (let i = -6; i <= 6; i++) bank.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.15), M.polished(), { p: [i * 0.04, 0.17, 0] }));
    const plate = mesh(new THREE.BoxGeometry(0.16, 0.004, 0.05), M.goldPolished(), { p: [0, 0.172, 0] }); bank.add(plate);
    // plug leads
    for (let i = 0; i < 4; i++) bank.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), M.matte(0x0d0d0d, 0.6), { p: [-0.21 + i * 0.14, 0.06, side * 0.11], r: [side * 0.5, 0, 0] }));
    // exhaust headers sweeping down
    for (let i = 0; i < 4; i++) {
      const x = -0.21 + i * 0.14; const pts = [[x, 0.0, side * 0.1], [x, -0.05, side * 0.2], [x * 0.6 - 0.1, -0.22, side * 0.24], [-0.25, -0.38, side * 0.22]];
      bank.add(new THREE.Mesh(tube(pts.map((p) => new THREE.Vector3(...p)), 0.022, 40, 10), M.titanium()));
    }
    g.add(bank);
  }
  // intake: 8 velocity stacks in the V
  const stack = lathe([[0.03, 0], [0.03, 0.08], [0.034, 0.11], [0.045, 0.135], [0.058, 0.15], [0.062, 0.155], [0.054, 0.152], [0.04, 0.13], [0.026, 0.1], [0.026, 0.0]], 40);
  g.add(mesh(roundBox(0.5, 0.08, 0.16, 0.02), alu, { p: [0, 0.5, 0] }));
  const stacks = [];
  for (let i = 0; i < 4; i++) for (const side of [1, -1]) { const s = mesh(stack, M.chrome(), { p: [-0.21 + i * 0.14, 0.54, side * 0.045] }); g.add(s); stacks.push(s); }
  // front: timing cover, pulleys, belt, alternator
  g.add(mesh(roundBox(0.06, 0.34, 0.3, 0.03), alu, { p: [0.33, 0.28, 0] }));
  for (const [y, z, r] of [[0.16, 0, 0.08], [0.42, 0.0, 0.055], [0.3, 0.14, 0.05]]) g.add(mesh(new THREE.CylinderGeometry(r, r, 0.03, 40), M.steel(), { p: [0.38, y, z], r: [0, 0, Math.PI / 2] }));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 30), M.alu(), { p: [0.3, 0.3, 0.2], r: [0, 0, Math.PI / 2] }));
  // distributor + bellhousing
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 24), M.blackGloss(), { p: [-0.33, 0.5, 0] }));
  g.add(mesh(lathe([[0.1, 0], [0.2, 0.08], [0.2, 0.12], [0.0001, 0.12]], 40), alu, { p: [-0.31, 0.27, 0], r: [0, 0, Math.PI / 2] }));
  if (opts.outline) { const ol = outlineOf(g, opts.outline, 30); g.add(ol); }
  g.userData.stacks = stacks; return g;
}

// ------------------------------------------------------------------------------------------------
// Macro combustion set (scale: 1 unit = 1 cm, so the 1 mm spark gap is 0.1).
export function buildSparkPlug() {
  const g = new THREE.Group();
  // threaded shell
  const prof = [[0.0001, 0]]; const turns = 14, L = 1.9, R = 0.7;
  prof.push([R * 0.92, 0]); for (let i = 0; i <= turns * 2; i++) prof.push([i % 2 ? R : R * 0.88, (i / (turns * 2)) * L]); prof.push([0.95, L]); prof.push([0.95, L + 0.6]); prof.push([0.55, L + 0.65]);
  const shell = mesh(lathe(prof.map(([r, y]) => [r, -y]), 72), M.polished()); g.add(shell);
  const hex = mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.9, 6), M.steel(), { p: [0, -L - 1.1, 0] }); g.add(hex);
  // ceramic insulator nose (visible inside shell end) and upper body
  g.add(mesh(lathe([[0.0001, 0.35], [0.12, 0.35], [0.2, 0.2], [0.34, -0.6], [0.5, -1.6], [0.5, -2.2]], 48), M.ceramic(), { p: [0, 0, 0] }));
  g.add(mesh(lathe([[0.6, -2.5], [0.62, -3.5], [0.55, -3.7], [0.58, -3.9], [0.55, -4.1], [0.58, -4.3], [0.5, -4.6], [0.0001, -4.7]], 48), M.ceramic()));
  // centre electrode (nickel) + iridium tip
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 24), M.steel(), { p: [0, 0.55, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 24), M.polished(), { p: [0, 0.92, 0] }));
  // ground strap: one bent piece of heat-tinted nickel alloy, 1 mm (0.1) above the centre tip
  const L2 = new THREE.Shape(); L2.moveTo(0.78, -0.07); L2.lineTo(0.78, 1.06); L2.quadraticCurveTo(0.78, 1.31, 0.52, 1.31); L2.lineTo(-0.16, 1.31); L2.quadraticCurveTo(-0.2, 1.21, -0.16, 1.11); L2.lineTo(0.5, 1.11); L2.quadraticCurveTo(0.58, 1.11, 0.58, 1.03); L2.lineTo(0.58, -0.07); L2.closePath();
  const strap = mesh(new THREE.ExtrudeGeometry(L2, { depth: 0.3, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 16 }), new THREE.MeshStandardMaterial({ color: 0x9a8574, metalness: 1, roughness: 0.32 }), { p: [0, 0, -0.15] });
  g.add(strap);
  g.userData.gap = new THREE.Vector3(0, 1.06, 0); // top of centre tip ~1.01, strap underside ~1.11
  return g;
}

/** Plasma arc between two points: jagged polyline, regenerated per frame from time (deterministic). */
export class Arc {
  constructor(a, b, color = 0xbfd8ff) {
    this.a = a.clone(); this.b = b.clone(); this.n = 18;
    this.core = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(12), toneMapped: false }));
    this.halo = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a6cff).multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.group = new THREE.Group(); this.group.add(this.halo); this.group.add(this.core);
  }
  update(t, intensity = 1) {
    this.group.visible = intensity > 0.01; if (!this.group.visible) return;
    const seed = Math.floor(t * 48); const pts = [];
    for (let i = 0; i <= this.n; i++) {
      const k = i / this.n; const p = new THREE.Vector3().lerpVectors(this.a, this.b, k); const amp = Math.sin(Math.PI * k) * 0.05;
      p.x += (hash1(seed * 31 + i) - 0.5) * 2 * amp; p.z += (hash1(seed * 17 + i * 7) - 0.5) * 2 * amp; pts.push(p);
    }
    const c = new THREE.CatmullRomCurve3(pts); this.core.geometry.dispose(); this.halo.geometry.dispose();
    this.core.geometry = new THREE.TubeGeometry(c, 40, 0.008 * (0.6 + intensity * 0.6), 6); this.halo.geometry = new THREE.TubeGeometry(c, 40, 0.03 * intensity, 8);
    const f = 0.7 + 0.3 * hash1(seed * 3); this.core.material.color.setRGB(0.75, 0.85, 1).multiplyScalar(12 * intensity * f); this.halo.material.opacity = 0.6 * intensity * f;
  }
}

/** Expanding flame kernel: nested noisy shells, blue premixed front turning to gold. */
export function flameKernel() {
  const g = new THREE.Group(); const mats = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, power: { value: 0 }, heat: { value: 0 }, seed: { value: i * 7.3 } },
      vertexShader: `uniform float time, seed; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){ vec3 p = position; float d = n3(normal*2.5 + seed + time*0.8)*0.6 + n3(normal*6. - time*1.3 + seed)*0.3; p += normal * d * 0.45; vP = normal*3. + seed;
          vec4 w = modelViewMatrix * vec4(p,1.); vV = normalize(-w.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*w; }`,
      fragmentShader: `uniform float power, heat, time; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){ float ndv = abs(dot(vN, vV)); float fres = pow(1. - ndv, 2.2);
          float wisps = smoothstep(0.35, 0.9, n3(vP*2.2 + vec3(0., -time*1.5, 0.)) * 0.7 + n3(vP*5. + time) * 0.4);
          vec3 blue = vec3(0.18,0.32,1.0); vec3 gold = vec3(1.25,0.55,0.16); vec3 c = mix(blue, gold, heat);
          gl_FragColor = vec4(c * power * (0.04 + fres * 0.55) * (0.35 + wisps * 1.3), 1.); }`,
    });
    mats.push(mat); const m = new THREE.Mesh(new THREE.SphereGeometry(1 - i * 0.22, 64, 32), mat); g.add(m);
  }
  g.userData.set = (time, power, heat) => { for (const m of mats) { m.uniforms.time.value = time; m.uniforms.power.value = power; m.uniforms.heat.value = heat; } };
  return g;
}

/** Cylinder bore (inside view), piston, con-rod and crank at real scale (metres). */
export function buildBottomEnd() {
  const g = new THREE.Group(); const bore = 0.05; // radius
  const hatch = crosshatch();
  const boreMat = new THREE.MeshStandardMaterial({ color: 0x9a9894, metalness: 1, roughness: 0.3, normalMap: hatch, normalScale: new THREE.Vector2(0.12, 0.12), side: THREE.BackSide });
  const sleeve = mesh(new THREE.CylinderGeometry(bore, bore, 0.16, 96, 8, true), boreMat, { p: [0, 0.02, 0] }); g.add(sleeve);
  // chamber roof with valves + plug hole
  const roof = mesh(new THREE.SphereGeometry(bore, 64, 16, 0, TAU, 0, Math.PI * 0.32), M.iron(), { p: [0, 0.095, 0] }); roof.material = roof.material.clone(); roof.material.side = THREE.BackSide; g.add(roof);
  for (const [x, z, r] of [[0.02, 0.016, 0.017], [-0.02, 0.016, 0.017], [0.018, -0.018, 0.015], [-0.018, -0.018, 0.015]]) g.add(mesh(new THREE.CylinderGeometry(r, r, 0.003, 40), M.darkChrome(), { p: [x, 0.108, z] }));
  // piston
  const piston = new THREE.Group();
  piston.add(mesh(lathe([[0.0001, 0.0], [0.046, 0.0], [0.0495, -0.002], [0.0495, -0.07], [0.047, -0.075], [0.0001, -0.075]], 96), M.castAlu()));
  for (let i = 0; i < 3; i++) piston.add(mesh(new THREE.TorusGeometry(0.0495, 0.0012, 6, 96), M.darkChrome(), { p: [0, -0.008 - i * 0.006, 0], r: [Math.PI / 2, 0, 0] }));
  for (const [x, z] of [[0.018, 0.016], [-0.018, 0.016], [0.018, -0.018], [-0.018, -0.018]]) piston.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 32), M.iron(), { p: [x, 0.0005, z] }));
  piston.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 24), M.polished(), { p: [0, -0.045, 0], r: [Math.PI / 2, 0, 0] }));
  g.add(piston);
  // con-rod: H-beam, mirror polished
  const rod = new THREE.Group(); const rodLen = 0.15;
  const beam = new THREE.Shape(); beam.moveTo(-0.012, 0); beam.lineTo(0.012, 0); beam.lineTo(0.02, -rodLen); beam.lineTo(-0.02, -rodLen); beam.closePath();
  rod.add(mesh(new THREE.ExtrudeGeometry(beam, { depth: 0.018, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3 }), M.chrome(), { p: [0, 0, -0.009] }));
  rod.add(mesh(new THREE.TorusGeometry(0.018, 0.007, 16, 40), M.chrome(), { p: [0, 0, 0] }));
  rod.add(mesh(new THREE.TorusGeometry(0.032, 0.01, 16, 48), M.chrome(), { p: [0, -rodLen, 0] }));
  for (const s of [1, -1]) rod.add(mesh(boltGeo(0.04, 0.004), M.titanium(), { p: [s * 0.04, -rodLen - 0.005, 0], r: [Math.PI, 0, 0] }));
  g.add(rod);
  // crank throw + counterweight
  const crank = new THREE.Group();
  crank.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 48), M.polished(), { r: [Math.PI / 2, 0, 0] }));
  const cw = new THREE.Shape(); cw.absarc(0, 0, 0.09, Math.PI * 1.15, Math.PI * 1.85, false); cw.lineTo(0, 0.03); cw.closePath();
  for (const z of [0.04, -0.04]) crank.add(mesh(new THREE.ExtrudeGeometry(cw, { depth: 0.022, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), M.iron(), { p: [0, 0, z - 0.011] }));
  const crankPivot = new THREE.Group(); crankPivot.add(crank); g.add(crankPivot);
  g.userData = { piston, rod, crank, crankPivot, rodLen, bore, sleeve };
  // kinematics: θ crank angle
  g.userData.setAngle = (theta) => {
    const r = 0.045, Lr = rodLen; crankPivot.position.set(0, -0.21, 0);
    const px = Math.sin(theta) * r, py = Math.cos(theta) * r; crank.position.set(px, py, 0); crank.rotation.z = -theta;
    const beta = Math.asin(px / Lr); const pinY = py + Math.cos(beta) * Lr - 0.21;
    piston.position.set(0, pinY + 0.045, 0); rod.position.set(0, pinY, 0); rod.rotation.z = beta;
  };
  g.userData.setAngle(0);
  return g;
}

/** Intake runner interior: flared polished tube, camera flies through toward the light. */
export function buildRunner() {
  const g = new THREE.Group(); const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push([0.03 + Math.pow(t, 3) * 0.05, t * 0.6]); }
  const m = new THREE.MeshStandardMaterial({ color: 0xd9d9de, metalness: 1, roughness: 0.08, side: THREE.BackSide });
  g.add(mesh(lathe(pts, 96), m, { r: [0, 0, -Math.PI / 2] }));
  // butterfly valve shaft + plate partway down
  g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 12), M.steel(), { p: [0.12, 0, 0], r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.0015, 48), M.polished(), { p: [0.12, 0, 0], r: [0, 0, 0.15] }));
  return g;
}

/** Combustion burst: GPU particles expanding from a point (blue front → gold flame). */
export function flameBurst(count = 2600, res = 1, seed = 5) {
  const r = rng(seed); const dir = new Float32Array(count * 3), spd = new Float32Array(count), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) { let x, y, z, l; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01); l = Math.sqrt(l); dir.set([x / l, y / l * 0.9 + 0.15, z / l], i * 3); spd[i] = 0.4 + Math.pow(r(), 0.6) * 1.0; ph[i] = r() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); g.setAttribute('dir', new THREE.BufferAttribute(dir, 3)); g.setAttribute('spd', new THREE.BufferAttribute(spd, 1)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tau: { value: 0 }, scale: { value: 1 }, res: { value: res }, gain: { value: 1 } },
    vertexShader: `uniform float tau, scale, res; attribute vec3 dir; attribute float spd; attribute float ph; varying vec3 vC; varying float vA;
      void main(){ float k = 1. - exp(-tau * 2.2 * spd); vec3 p = dir * k * scale * spd;
        p += vec3(sin(ph + tau*3.), cos(ph*1.3 + tau*2.6), sin(ph*0.7 - tau*3.3)) * 0.06 * scale * k;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float heat = smoothstep(0.05, 0.55, tau * (0.8 + spd * 0.4));
        vC = mix(vec3(0.25, 0.45, 1.3), vec3(1.4, 0.62, 0.2), heat) * (0.7 + 0.3 * sin(ph * 5. + tau * 20.));
        vA = smoothstep(0., 0.04, tau) * (1. - smoothstep(0.7, 1.6, tau * spd));
        gl_PointSize = clamp((26. + heat * 70.) * res * scale / max(-mv.z, 0.01), 0., 260. * res); }`,
    fragmentShader: `uniform float gain; varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d, d) * 12.) - 0.0067; gl_FragColor = vec4(vC * max(a, 0.) * vA * gain * 0.05, 1.); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; return pts;
}
