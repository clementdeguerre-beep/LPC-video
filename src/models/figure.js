// Stylised, faceless figures (couture-mannequin aesthetic) and a detailed hand rig for macros.
import * as THREE from 'three';
import { M } from '../engine/materials.js';
import { mesh, roundBox } from './geo.js';
import { lerp } from '../engine/util.js';

const cap = (r, len, seg = 10) => new THREE.CapsuleGeometry(r, len, 6, seg);

/** A jointed figure. Joints are Groups; pose() takes an object of euler triples. */
export function buildFigure({ suit = 0x16171b, skin = null, shirt = 0xd8d2c8, height = 1.0, build = 1.0, gender = 'm', hair = 0x0e0c0b } = {}) {
  const suitM = M.mannequin(suit), skinM = new THREE.MeshPhysicalMaterial({ color: skin ?? 0x2e241e, roughness: 0.38, metalness: 0.35, sheen: 0.5, sheenColor: new THREE.Color(0x8a6a50) }), shirtM = M.fabric(shirt), hairM = M.matte(hair, 0.6);
  const J = {}; const g = new THREE.Group(); g.scale.setScalar(height);
  const joint = (name, parent, p) => { const j = new THREE.Group(); j.position.set(...p); parent.add(j); J[name] = j; return j; };
  const hips = joint('hips', g, [0, 0.95, 0]);
  hips.add(mesh(new THREE.SphereGeometry(0.15 * build, 20, 14), suitM, { s: [1.05, 0.7, 0.75] }));
  const spine = joint('spine', hips, [0, 0.06, 0]);
  spine.add(mesh(cap(0.13 * build, 0.2), suitM, { p: [0, 0.17, 0], s: [1.25, 1, 0.78] }));
  const chest = joint('chest', spine, [0, 0.3, 0]);
  chest.add(mesh(new THREE.SphereGeometry(0.17 * build, 22, 16), suitM, { p: [0, 0.03, 0], s: [1.25, 0.95, 0.75] }));
  if (gender === 'm') chest.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 3, 1), shirtM, { p: [0, 0.05, 0.11], r: [Math.PI, 0, 0], s: [1, 1, 0.3] }));
  const neck = joint('neck', chest, [0, 0.16, 0]);
  neck.add(mesh(cap(0.045, 0.06), skinM, { p: [0, 0.04, 0] }));
  const head = joint('head', neck, [0, 0.12, 0]);
  head.add(mesh(new THREE.SphereGeometry(0.095, 28, 20), skinM, { p: [0, 0.03, 0.01], s: [0.88, 1.1, 0.98] }));
  head.add(mesh(new THREE.SphereGeometry(0.1, 24, 16, 0, Math.PI * 2, 0, gender === 'f' ? 1.9 : 1.45), hairM, { p: [0, 0.045, -0.005], s: [0.92, 1.05, 1.02], r: [-0.25, 0, 0] }));
  for (const s of [1, -1]) {
    const sh = joint(`sh${s}`, chest, [s * 0.2 * build, 0.08, 0]); sh.add(mesh(new THREE.SphereGeometry(0.065 * build, 14, 10), suitM));
    sh.add(mesh(cap(0.05 * build, 0.22), suitM, { p: [0, -0.15, 0] }));
    const el = joint(`el${s}`, sh, [0, -0.29, 0]); el.add(mesh(cap(0.043 * build, 0.2), suitM, { p: [0, -0.13, 0] }));
    const wr = joint(`wr${s}`, el, [0, -0.27, 0]); wr.add(mesh(roundBox(0.075, 0.13, 0.03, 0.013), skinM, { p: [0, -0.06, 0] })); wr.add(mesh(cap(0.012, 0.05), skinM, { p: [s * 0.035, -0.04, 0.015], r: [0, 0, s * 0.5] }));
    const hp = joint(`hp${s}`, hips, [s * 0.095 * build, -0.04, 0]); hp.add(mesh(cap(0.07 * build, 0.32), suitM, { p: [0, -0.22, 0] }));
    const kn = joint(`kn${s}`, hp, [0, -0.45, 0]); kn.add(mesh(cap(0.055 * build, 0.32), suitM, { p: [0, -0.21, 0] }));
    const an = joint(`an${s}`, kn, [0, -0.44, 0]); an.add(mesh(roundBox(0.09, 0.06, 0.26, 0.025), M.blackGloss(), { p: [0, -0.02, 0.06] }));
  }
  g.userData.J = J;
  g.userData.pose = (p) => { for (const k in J) { const v = p[k]; J[k].rotation.set(v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0); } if (p.y !== undefined) J.hips.position.y = p.y; };
  return g;
}

export const POSES = {
  stand: {},
  standHandsBehind: { 'sh1': [0.25, 0, 0.12], 'sh-1': [0.25, 0, -0.12], 'el1': [-1.2, 0.4, 0], 'el-1': [-1.2, -0.4, 0] },
  gesture: { 'sh1': [-0.9, 0, 0.3], 'el1': [-0.6, 0, 0], 'sh-1': [0.1, 0, -0.1], head: [0.1, 0.3, 0] },
  crouch: { y: 0.55, hips: [0.2, 0, 0], spine: [0.35, 0, 0], 'hp1': [-1.6, 0, 0.15], 'hp-1': [-1.3, 0, -0.15], 'kn1': [2.3, 0, 0], 'kn-1': [2.4, 0, 0], 'an1': [-0.6, 0, 0], 'an-1': [-0.9, 0, 0], 'sh1': [-1.0, 0, 0], 'el1': [-0.9, 0, 0], 'sh-1': [-0.7, 0, 0], 'el-1': [-1.1, 0, 0] },
  kneel: { y: 0.5, spine: [0.2, 0, 0], 'hp1': [-1.5, 0, 0.1], 'kn1': [1.5, 0, 0], 'hp-1': [0, 0, -0.1], 'kn-1': [1.55, 0, 0], 'sh1': [-1.1, 0, 0.1], 'el1': [-0.5, 0, 0], 'sh-1': [-0.9, 0, -0.1], 'el-1': [-0.7, 0, 0] },
  lean: { spine: [0.55, 0, 0], chest: [0.2, 0, 0], 'sh1': [-1.3, 0, 0.2], 'el1': [-0.4, 0, 0], 'sh-1': [-1.2, 0, -0.2], 'el-1': [-0.5, 0, 0], head: [0.2, 0, 0] },
  lying: { y: 0.18, hips: [-Math.PI / 2, 0, 0], 'sh1': [-2.6, 0, 0.1], 'el1': [-0.6, 0, 0], 'sh-1': [-2.8, 0, -0.1], 'el-1': [-0.4, 0, 0], 'kn1': [0.5, 0, 0], 'hp1': [-0.4, 0, 0] },
  sit: { y: 0.52, 'hp1': [-1.5, 0, 0.08], 'hp-1': [-1.5, 0, -0.08], 'kn1': [1.45, 0, 0], 'kn-1': [1.5, 0, 0], spine: [-0.12, 0, 0], 'sh1': [0.2, 0, 0.15], 'el1': [-0.9, 0, 0], 'sh-1': [0.25, 0, -0.15], 'el-1': [-0.9, 0, 0] },
  sitCross: { y: 0.52, 'hp1': [-1.6, 0.25, 0.1], 'kn1': [1.3, 0, 0], 'hp-1': [-1.45, -0.1, -0.1], 'kn-1': [1.6, 0, 0], spine: [-0.15, 0, 0], 'sh1': [0.1, 0, 0.3], 'el1': [-1.4, 0, 0], 'sh-1': [0.2, 0, -0.15], 'el-1': [-0.8, 0, 0], head: [0, 0.4, 0] },
  holdGlass: { 'sh1': [-0.25, 0, 0.12], 'el1': [-1.5, 0.2, 0], head: [0.05, 0.2, 0] },
  sitAudience: { y: 0.5, 'hp1': [-1.5, 0, 0.06], 'hp-1': [-1.5, 0, -0.06], 'kn1': [1.5, 0, 0], 'kn-1': [1.5, 0, 0], 'sh1': [-0.3, 0, 0.1], 'el1': [-1.1, 0, 0], 'sh-1': [-0.3, 0, -0.1], 'el-1': [-1.1, 0, 0] },
};

export function blendPose(a, b, k) {
  const o = {}; const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) { if (key === 'y') { o.y = lerp(a.y ?? 0.95, b.y ?? 0.95, k); continue; } const x = a[key] || [0, 0, 0], y = b[key] || [0, 0, 0]; o[key] = [0, 1, 2].map((i) => lerp(x[i], y[i], k)); }
  return o;
}

// ------------------------------------------------------------------------------------------------
/** Detailed hand for macro shots (+y up the fingers, palm faces +z). setCurl([index..pinky], thumb). */
export function buildHand({ material = null, side = 1, watch = false, cuff = null } = {}) {
  const mat = material || M.glove(); const g = new THREE.Group(); const fingers = [];
  const palm = mesh(roundBox(0.085, 0.095, 0.03, 0.012, 4), mat, { p: [0, 0.045, 0] }); g.add(palm);
  const specs = [[-0.03, 0.044, 0.0095], [-0.01, 0.048, 0.01], [0.011, 0.046, 0.0097], [0.031, 0.037, 0.0088]];
  specs.forEach(([x, len, r], i) => {
    let parent = new THREE.Group(); parent.position.set(x * side, 0.093, 0); g.add(parent); const segs = [];
    [len * 0.46, len * 0.32, len * 0.26].forEach((l, k) => {
      const j = new THREE.Group(); j.position.y = k === 0 ? 0 : [len * 0.46, len * 0.32][k - 1]; parent.add(j);
      j.add(mesh(new THREE.CapsuleGeometry(r * (1 - k * 0.08), l, 4, 10), mat, { p: [0, l / 2, 0] })); segs.push(j); parent = j;
    });
    fingers.push(segs);
  });
  const thumbBase = new THREE.Group(); thumbBase.position.set(-0.042 * side, 0.025, 0.012); thumbBase.rotation.set(0.3, 0, side * 0.75); g.add(thumbBase);
  const t1 = new THREE.Group(); thumbBase.add(t1); t1.add(mesh(new THREE.CapsuleGeometry(0.0115, 0.03, 4, 10), mat, { p: [0, 0.02, 0] }));
  const t2 = new THREE.Group(); t2.position.y = 0.04; t1.add(t2); t2.add(mesh(new THREE.CapsuleGeometry(0.0105, 0.022, 4, 10), mat, { p: [0, 0.014, 0] }));
  const wrist = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 14), cuff ? M.fabric(cuff) : mat, { p: [0, -0.07, 0], s: [1.25, 1, 0.75] }); g.add(wrist);
  let watchG = null;
  if (watch) { watchG = buildWatch(); watchG.position.set(0, -0.045, -0.024); watchG.rotation.x = Math.PI / 2; watchG.rotation.z = Math.PI; g.add(watchG); }
  g.userData = { fingers, thumb: [t1, t2], watch: watchG };
  g.userData.setCurl = (c = [0, 0, 0, 0], thumb = 0, spread = 0) => {
    fingers.forEach((segs, i) => { const v = Array.isArray(c) ? c[i] : c; segs[0].rotation.set(v * 1.2, 0, (i - 1.5) * spread * 0.12 * side); segs[1].rotation.x = v * 1.5; segs[2].rotation.x = v * 1.1; });
    t1.rotation.x = thumb * 0.8; t2.rotation.x = thumb * 0.9;
  };
  g.userData.setCurl(0, 0); return g;
}

/** Wristwatch: case, guilloché dial, indices, hands, crystal, strap. Faces +y. */
export function buildWatch() {
  const g = new THREE.Group(); const R = 0.02;
  g.add(mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.15, 0.009, 64), M.goldPolished()));
  g.add(mesh(new THREE.TorusGeometry(R * 1.08, 0.0018, 10, 64), M.goldPolished(), { p: [0, 0.0045, 0], r: [Math.PI / 2, 0, 0] }));
  const dial = mesh(new THREE.CylinderGeometry(R, R, 0.001, 64), M.paint(0x0c0f18, { metalness: 0.6, roughness: 0.25 }), { p: [0, 0.0048, 0] }); g.add(dial);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(mesh(new THREE.BoxGeometry(i % 3 ? 0.0012 : 0.0018, 0.0008, i % 3 ? 0.004 : 0.006), M.goldPolished(), { p: [Math.sin(a) * R * 0.8, 0.0054, Math.cos(a) * R * 0.8], r: [0, a, 0] })); }
  const hh = new THREE.Group(); hh.position.y = 0.0058; hh.add(mesh(new THREE.BoxGeometry(0.0014, 0.0004, 0.011), M.goldPolished(), { p: [0, 0, 0.0045] })); g.add(hh);
  const mh = new THREE.Group(); mh.position.y = 0.0062; mh.add(mesh(new THREE.BoxGeometry(0.001, 0.0004, 0.016), M.goldPolished(), { p: [0, 0, 0.007] })); g.add(mh);
  const sh = new THREE.Group(); sh.position.y = 0.0066; sh.add(mesh(new THREE.BoxGeometry(0.0004, 0.0003, 0.018), M.emissive(0xc84a3a, 1.2), { p: [0, 0, 0.006] })); g.add(sh);
  g.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 16), M.goldPolished(), { p: [R * 1.2, 0, 0], r: [0, 0, Math.PI / 2] }));
  for (const s of [1, -1]) g.add(mesh(roundBox(0.022, 0.004, 0.05, 0.0015), M.leather(0x2a140c), { p: [0, -0.002, s * 0.04] }));
  g.userData = { hh, mh, sh, set: (sec) => { sh.rotation.y = -(sec / 60) * Math.PI * 2; mh.rotation.y = -((sec / 3600) % 1) * Math.PI * 2 - 1.1; hh.rotation.y = -((sec / 43200) % 1) * Math.PI * 2 - 2.6; } };
  g.userData.set(37 * 60 + 12); return g;
}
