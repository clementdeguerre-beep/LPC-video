// Craft props for macro shots: gauges, torque wrench, polisher, striping brush, tool wall, etc.
import * as THREE from 'three';
import { M } from '../engine/materials.js';
import { drawTexture, FONT_SERIF } from '../engine/textures.js';
import { mesh, roundBox, lathe, tube, merge, xf, boltGeo } from './geo.js';
import { rng, TAU, lerp } from '../engine/util.js';

/** Analogue dial face texture. ticks: [min,max,major,minor]; arc in radians (start,end) clockwise from top. */
export function dialTexture({ min = 0, max = 100, major = 10, minor = 2, label = '', sub = '', arc = [-2.36, 2.36], face = '#0b0b0d', ink = '#e7c98e', redFrom = null, fmt = (v) => `${v}` } = {}) {
  return drawTexture(1024, 1024, (g, w) => {
    const c = w / 2; g.fillStyle = face; g.fillRect(0, 0, w, w);
    const grd = g.createRadialGradient(c, c * 0.8, 10, c, c, c); grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = grd; g.fillRect(0, 0, w, w);
    const ang = (v) => arc[0] + ((v - min) / (max - min)) * (arc[1] - arc[0]);
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'butt';
    for (let v = min; v <= max + 1e-6; v += minor) {
      const a = ang(v); const isMaj = Math.abs((v - min) / major - Math.round((v - min) / major)) < 1e-6; const r0 = c * (isMaj ? 0.78 : 0.83), r1 = c * 0.9;
      g.lineWidth = isMaj ? 7 : 3; if (redFrom !== null && v >= redFrom) g.strokeStyle = '#a8202c'; else g.strokeStyle = ink;
      g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.stroke();
      if (isMaj) { g.font = `600 ${w * 0.07}px ${FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(fmt(v), c + Math.sin(a) * c * 0.64, c - Math.cos(a) * c * 0.64); }
    }
    g.font = `500 ${w * 0.05}px ${FONT_SERIF}`; g.textAlign = 'center'; g.fillText(label, c, c * 1.38); g.font = `italic 500 ${w * 0.038}px ${FONT_SERIF}`; g.fillText(sub, c, c * 1.5);
    g.font = `600 ${w * 0.045}px ${FONT_SERIF}`; g.fillText('LPC', c, c * 0.6);
  });
}

/** Round gauge: bezel, dial, needle, crystal. Faces +z. setValue(v). */
export function buildGauge(opts = {}) {
  const g = new THREE.Group(); const R = opts.radius ?? 0.05; const tex = dialTexture(opts);
  const min = opts.min ?? 0, max = opts.max ?? 100, arc = opts.arc ?? [-2.36, 2.36];
  g.add(mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.18, R * 0.35, 96), opts.case ?? M.chrome(), { r: [Math.PI / 2, 0, 0], p: [0, 0, -R * 0.18] }));
  g.add(mesh(new THREE.TorusGeometry(R * 1.08, R * 0.06, 16, 96), opts.bezel ?? M.goldPolished(), { p: [0, 0, 0.004] }));
  g.add(mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1 }), { p: [0, 0, 0.001] }));
  const needle = new THREE.Group(); needle.position.z = 0.004; g.add(needle);
  needle.add(mesh(new THREE.BoxGeometry(R * 0.025, R * 0.9, R * 0.01), opts.needleMat ?? M.emissive(0xd84a30, 1.3), { p: [0, R * 0.38, 0] }));
  needle.add(mesh(new THREE.CylinderGeometry(R * 0.08, R * 0.08, R * 0.04, 32), M.goldPolished(), { r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.SphereGeometry(R * 1.06, 48, 12, 0, TAU, 0, 0.42), M.crystal(), { r: [Math.PI / 2, 0, 0], p: [0, 0, -R * 0.95] }));
  g.userData.setValue = (v) => { const a = arc[0] + ((v - min) / (max - min)) * (arc[1] - arc[0]); needle.rotation.z = -a; };
  g.userData.setValue(min); return g;
}

/** Click-type torque wrench, head at origin, handle along -x. */
export function buildTorqueWrench() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 40), M.chrome(), { r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.036, 6), M.steel(), { r: [Math.PI / 2, 0, 0], p: [0, 0, -0.02] }));
  g.add(mesh(roundBox(0.06, 0.02, 0.022, 0.008), M.chrome(), { p: [-0.04, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.28, 32), M.chrome(), { r: [0, 0, Math.PI / 2], p: [-0.2, 0, 0] }));
  // engraved scale sleeve
  const scale = drawTexture(1024, 128, (c, w, h) => { c.fillStyle = '#c9cbcf'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1a1a'; for (let i = 0; i <= 60; i++) { const x = 40 + i * 15.6; c.fillRect(x, 0, 2, i % 5 ? 30 : 55); if (i % 10 === 0) { c.font = `600 40px ${FONT_SERIF}`; c.fillText(`${20 + i * 2}`, x - 16, 100); } } c.fillStyle = '#a07a3a'; c.font = `600 34px ${FONT_SERIF}`; c.fillText('N·m', 960, 100); });
  g.add(mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.1, 48), new THREE.MeshStandardMaterial({ map: scale, metalness: 0.8, roughness: 0.3 }), { r: [0, 0, Math.PI / 2], p: [-0.28, 0, 0] }));
  const grip = []; for (let i = 0; i < 40; i++) grip.push(xf(new THREE.TorusGeometry(0.0155, 0.0022, 6, 24), { p: [-0.36 - i * 0.003, 0, 0], r: [0, Math.PI / 2, 0] }));
  g.add(new THREE.Mesh(merge(grip), M.matte(0x111111, 0.6)));
  g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 32), M.matte(0x0e0e0e, 0.55), { r: [0, 0, Math.PI / 2], p: [-0.42, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 32), M.goldPolished(), { r: [0, 0, Math.PI / 2], p: [-0.485, 0, 0] }));
  return g;
}

/** Wheel hub flange with five lug nuts (macro stage for the torque wrench). */
export function buildHub() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 96), M.alu(), { r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 64), M.polished(), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.02] }));
  const nuts = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + Math.PI / 2; const n = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 6), M.chrome(), { r: [Math.PI / 2, 0, 0], p: [Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0.018] }); g.add(n); nuts.push(n); g.add(mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 16), M.steel(), { r: [Math.PI / 2, 0, 0], p: [Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0.02] })); }
  g.userData.nuts = nuts; return g;
}

/** Dual-action polisher with spinning foam pad (pad faces -y). */
export function buildPolisher() {
  const g = new THREE.Group();
  const pad = new THREE.Group(); g.add(pad);
  pad.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.025, 64), M.velvet(0x3a0c12), { p: [0, 0.012, 0] }));
  pad.add(mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.008, 64), M.matte(0x0a0a0a), { p: [0, 0.028, 0] }));
  pad.add(mesh(new THREE.BoxGeometry(0.01, 0.003, 0.12), M.matte(0x2a2a2a), { p: [0, 0.033, 0] }));
  g.add(mesh(lathe([[0.03, 0.035], [0.045, 0.05], [0.05, 0.12], [0.042, 0.2], [0.0001, 0.21]], 48), M.paint(0x111214, { metalness: 0.2, roughness: 0.35 })));
  g.add(mesh(roundBox(0.24, 0.04, 0.05, 0.018), M.matte(0x151515, 0.5), { p: [-0.13, 0.17, 0], r: [0, 0, 0.08] }));
  g.add(mesh(new THREE.TorusGeometry(0.045, 0.004, 8, 48), M.goldPolished(), { p: [0, 0.13, 0], r: [Math.PI / 2, 0, 0] }));
  g.userData.pad = pad; return g;
}

/** Sword striping brush; bristle tip at origin, handle rising along +y/-x. */
export function buildStripingBrush() {
  const g = new THREE.Group();
  const br = new THREE.ConeGeometry(0.004, 0.05, 16, 1); br.scale(1, 1, 0.4); br.rotateZ(Math.PI); br.translate(0, 0.025, 0);
  g.add(mesh(br, new THREE.MeshPhysicalMaterial({ color: 0x2a1a10, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0x705030) })));
  const tip = new THREE.ConeGeometry(0.0022, 0.012, 16); tip.rotateZ(Math.PI); tip.translate(0, 0.006, 0); g.add(mesh(tip, M.goldPolished()));
  g.add(mesh(new THREE.CylinderGeometry(0.0045, 0.004, 0.025, 24), M.goldPolished(), { p: [0, 0.062, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.0042, 0.003, 0.16, 24), M.walnut(), { p: [0, 0.155, 0] }));
  return g;
}

/** Tool wall: a pegboard with perfectly graduated tools. */
export function buildToolWall(w = 6, h = 2.2, seed = 1) {
  const g = new THREE.Group(); const r = rng(seed);
  g.add(mesh(new THREE.BoxGeometry(w, h, 0.03), M.matte(0x1b1c1f, 0.8)));
  const holes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.005, 6), M.matte(0x050505, 1), Math.floor(w / 0.05) * Math.floor(h / 0.05));
  let k = 0; const m = new THREE.Matrix4(); for (let x = -w / 2 + 0.05; x < w / 2; x += 0.05) for (let y = -h / 2 + 0.05; y < h / 2; y += 0.05) { if (k >= holes.count) break; m.makeRotationX(Math.PI / 2).setPosition(x, y, 0.016); holes.setMatrixAt(k++, m); }
  holes.count = k; g.add(holes);
  // combination wrenches in graduated sizes
  const wr = []; const N = Math.floor(w / 0.11);
  for (let i = 0; i < N; i++) {
    const s = 0.6 + (i / N) * 0.8; const L = 0.18 * s + 0.08;
    wr.push(xf(new THREE.BoxGeometry(0.014 * s, L, 0.006), { p: [-w / 2 + 0.1 + i * 0.11, h * 0.18, 0.03] }));
    wr.push(xf(new THREE.TorusGeometry(0.014 * s, 0.006 * s, 6, 16), { p: [-w / 2 + 0.1 + i * 0.11, h * 0.18 + L / 2 + 0.01, 0.03] }));
    wr.push(xf(new THREE.CylinderGeometry(0.016 * s, 0.016 * s, 0.008, 12), { r: [Math.PI / 2, 0, 0], p: [-w / 2 + 0.1 + i * 0.11, h * 0.18 - L / 2 - 0.01, 0.03] }));
  }
  g.add(new THREE.Mesh(merge(wr), M.chrome()));
  // screwdrivers and pliers row
  const sd = []; const sdM = [];
  for (let i = 0; i < N * 0.8; i++) { const x = -w / 2 + 0.15 + i * 0.135; sd.push(xf(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 8), { p: [x, -h * 0.12, 0.035] })); sdM.push(xf(new THREE.CylinderGeometry(0.011, 0.012, 0.09, 12), { p: [x, -h * 0.12 + 0.1, 0.035] })); }
  g.add(new THREE.Mesh(merge(sd), M.steel())); g.add(new THREE.Mesh(merge(sdM), M.paint(0x4a0d14, { metalness: 0.1, roughness: 0.3 })));
  // hammers / mallets
  const hm = []; for (let i = 0; i < 6; i++) { const x = -w / 2 + 0.5 + i * (w - 1) / 5; hm.push(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 10), { p: [x, -h * 0.36, 0.04] })); hm.push(xf(roundBox(0.12, 0.05, 0.05, 0.012), { p: [x, -h * 0.36 + 0.17, 0.04] })); }
  g.add(new THREE.Mesh(merge(hm), M.walnut()));
  return g;
}

/** Tool chest with drawers (burgundy lacquer, chrome pulls). */
export function buildToolChest() {
  const g = new THREE.Group();
  g.add(mesh(roundBox(1.4, 1.0, 0.6, 0.02), M.paint(0x3d0b12, { metalness: 0.4, roughness: 0.3 }), { p: [0, 0.6, 0] }));
  g.add(mesh(roundBox(1.42, 0.03, 0.62, 0.01), M.carbon(), { p: [0, 1.11, 0] }));
  for (let i = 0; i < 6; i++) g.add(mesh(roundBox(1.1, 0.016, 0.02, 0.006), M.chrome(), { p: [0, 0.2 + i * 0.15, 0.31] }));
  for (const x of [-0.6, 0.6]) for (const z of [-0.25, 0.25]) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 20), M.rubber(), { p: [x, 0.04, z], r: [Math.PI / 2, 0, 0] }));
  return g;
}
