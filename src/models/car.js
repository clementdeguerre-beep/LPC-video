// Parametric car: a lofted body with real panel gaps, greenhouse, lamps, wheels, brakes,
// suspension, V8, interior and a cloud of fasteners. Every part knows how to explode.
import * as THREE from 'three';
import { mspline, patch, patchOutline, lineGeo, lathe, tube, roundBox, merge, xf, mesh, boltGeo, springGeo, washerGeo } from './geo.js';
import { M, glow } from '../engine/materials.js';
import { drawTexture, drawNormal, drawEmblem } from '../engine/textures.js';
import { buildV8, outlineOf } from './engine.js';
import { rng, clamp, smooth, lerp, TAU } from '../engine/util.js';

const sgnpow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

export const PRESETS = {
  // 1960s Berlinetta: long bonnet, fastback, wire wheels, covered lamps, oval grille.
  classic: {
    L: 4.38, wf: 0.205, wr: 0.752, R: 0.335, rimR: 0.215, tireW: 0.2, track: 0.71, archR: 0.39, shoulder: 0.58, nU: 2.5, nL: 3.6,
    top: [[0, 0.5], [0.02, 0.58], [0.06, 0.655], [0.14, 0.71], [0.26, 0.75], [0.4, 0.79], [0.47, 0.81], [0.6, 0.82], [0.72, 0.845], [0.84, 0.84], [0.93, 0.8], [0.975, 0.73], [1, 0.62]],
    bot: [[0, 0.3], [0.05, 0.23], [0.12, 0.19], [0.3, 0.17], [0.72, 0.17], [0.9, 0.21], [1, 0.3]],
    W: [[0, 0.42], [0.025, 0.62], [0.07, 0.76], [0.18, 0.84], [0.32, 0.83], [0.48, 0.82], [0.64, 0.85], [0.77, 0.875], [0.9, 0.84], [0.97, 0.76], [1, 0.66]],
    crown: [[0, 0], [0.05, 0.035], [0.17, 0.07], [0.3, 0.045], [0.42, 0.01], [0.6, 0.0], [0.7, 0.05], [0.79, 0.06], [0.9, 0.03], [1, 0]],
    gh: { ws: 0.445, rs: 0.545, re: 0.675, end: 0.925, yr: [[0.445, 0.81], [0.5, 1.06], [0.545, 1.195], [0.6, 1.225], [0.675, 1.19], [0.76, 1.07], [0.85, 0.93], [0.925, 0.835]], wb: 0.8, wr: 0.56, n: 3.2 },
    wheel: 'wire', lamps: 'covered', grille: 'oval', bumpers: true, color: 0x050505, exhaust: 4,
  },
  // 1970s grand tourer: wedge-ish, notchback, five-spoke.
  gt: {
    L: 4.6, wf: 0.19, wr: 0.76, R: 0.34, rimR: 0.23, tireW: 0.23, track: 0.74, archR: 0.39, shoulder: 0.62, nU: 3.2, nL: 4,
    top: [[0, 0.52], [0.03, 0.6], [0.1, 0.66], [0.3, 0.73], [0.44, 0.78], [0.62, 0.82], [0.8, 0.86], [0.95, 0.85], [1, 0.72]],
    bot: [[0, 0.28], [0.06, 0.2], [0.3, 0.16], [0.75, 0.16], [0.94, 0.22], [1, 0.3]],
    W: [[0, 0.6], [0.04, 0.78], [0.15, 0.88], [0.5, 0.88], [0.8, 0.9], [0.96, 0.86], [1, 0.8]],
    crown: [[0, 0], [0.15, 0.04], [0.35, 0.02], [0.6, 0], [0.8, 0.03], [1, 0]],
    gh: { ws: 0.43, rs: 0.53, re: 0.7, end: 0.84, yr: [[0.43, 0.78], [0.53, 1.18], [0.62, 1.2], [0.7, 1.17], [0.8, 0.95], [0.84, 0.86]], wb: 0.82, wr: 0.6, n: 4 },
    wheel: 'spoke5', lamps: 'twin', grille: 'slot', bumpers: true, color: 0x3d0b12, exhaust: 2,
  },
  // Modern mid-engine supercar: low, wide, cab-forward.
  supercar: {
    L: 4.55, wf: 0.2, wr: 0.735, R: 0.35, rimR: 0.26, tireW: 0.28, track: 0.8, archR: 0.39, shoulder: 0.5, nU: 3.0, nL: 4.5,
    top: [[0, 0.36], [0.03, 0.45], [0.12, 0.6], [0.28, 0.7], [0.36, 0.72], [0.62, 0.9], [0.78, 0.92], [0.92, 0.9], [1, 0.82]],
    bot: [[0, 0.16], [0.08, 0.12], [0.5, 0.11], [0.92, 0.14], [1, 0.25]],
    W: [[0, 0.68], [0.06, 0.88], [0.2, 0.98], [0.45, 0.92], [0.72, 1.0], [0.92, 0.98], [1, 0.9]],
    crown: [[0, 0], [0.18, 0.06], [0.35, 0.0], [0.7, 0.05], [1, 0]],
    gh: { ws: 0.3, rs: 0.43, re: 0.6, end: 0.88, yr: [[0.3, 0.7], [0.36, 0.92], [0.43, 1.1], [0.52, 1.14], [0.6, 1.1], [0.75, 0.98], [0.88, 0.9]], wb: 0.74, wr: 0.5, n: 3.6 },
    wheel: 'spoke10', lamps: 'led', grille: 'none', bumpers: false, color: 0x5d5f63, exhaust: 2,
  },
  // Endurance prototype: very low, long tail, bubble canopy.
  prototype: {
    L: 4.75, wf: 0.18, wr: 0.74, R: 0.34, rimR: 0.25, tireW: 0.3, track: 0.8, archR: 0.38, shoulder: 0.45, nU: 2.8, nL: 5,
    top: [[0, 0.3], [0.05, 0.42], [0.12, 0.66], [0.2, 0.74], [0.3, 0.6], [0.45, 0.62], [0.7, 0.8], [0.85, 0.82], [1, 0.8]],
    bot: [[0, 0.1], [0.5, 0.08], [1, 0.12]],
    W: [[0, 0.7], [0.08, 0.95], [0.2, 1.0], [0.4, 0.86], [0.72, 0.98], [0.9, 0.95], [1, 0.9]],
    crown: [[0, 0], [0.18, 0.1], [0.32, 0.0], [0.7, 0.08], [1, 0]],
    gh: { ws: 0.33, rs: 0.42, re: 0.56, end: 0.82, yr: [[0.33, 0.6], [0.42, 1.0], [0.5, 1.06], [0.56, 1.02], [0.7, 0.92], [0.82, 0.84]], wb: 0.5, wr: 0.38, n: 2.6 },
    wheel: 'spoke10', lamps: 'led', grille: 'none', bumpers: false, color: 0xcdb48a, exhaust: 2, fin: true,
  },
  // 1950s roadster: open top, voluptuous fenders.
  roadster: {
    L: 4.1, wf: 0.21, wr: 0.76, R: 0.33, rimR: 0.2, tireW: 0.18, track: 0.66, archR: 0.385, shoulder: 0.55, nU: 2.3, nL: 3.2,
    top: [[0, 0.52], [0.04, 0.64], [0.15, 0.73], [0.3, 0.74], [0.45, 0.76], [0.6, 0.76], [0.75, 0.82], [0.9, 0.78], [1, 0.62]],
    bot: [[0, 0.3], [0.08, 0.2], [0.3, 0.18], [0.72, 0.18], [0.92, 0.22], [1, 0.32]],
    W: [[0, 0.45], [0.04, 0.68], [0.18, 0.8], [0.45, 0.76], [0.75, 0.82], [0.95, 0.72], [1, 0.6]],
    crown: [[0, 0], [0.14, 0.09], [0.3, 0.04], [0.45, 0], [0.6, 0], [0.76, 0.09], [0.9, 0.04], [1, 0]],
    gh: { ws: 0.44, rs: 0.5, re: 0.5, end: 0.5, yr: [[0.44, 0.76], [0.5, 1.02]], wb: 0.74, wr: 0.7, n: 3, screenOnly: true },
    wheel: 'wire', lamps: 'round', grille: 'oval', bumpers: true, color: 0x1a2a22, exhaust: 2,
  },
};

// ------------------------------------------------------------------------------------------------
export class CarShape {
  constructor(spec) {
    this.s = spec; this.L = spec.L;
    this.top = mspline(spec.top); this.bot = mspline(spec.bot); this.W = mspline(spec.W); this.crown = mspline(spec.crown);
    this.yr = mspline(spec.gh.yr);
    this.wheels = [spec.wf, spec.wr].map((u) => ({ u, x: this.x(u) }));
  }
  x(u) { return this.L / 2 - u * this.L; }
  u(x) { return (this.L / 2 - x) / this.L; }
  archY(u) {
    const x = this.x(u); let y = -1e9; const { R, archR } = this.s;
    for (const w of this.wheels) { const dx = x - w.x; if (Math.abs(dx) < archR) y = Math.max(y, R + Math.sqrt(archR * archR - dx * dx) - 0.03); }
    return y;
  }
  /** Body section: φ ∈ [-π/2, 3π/2]; -π/2 bottom centre, π/2 top centre; +z is the right flank. */
  body(u, phi, o, inset = 0) {
    const { shoulder, nU, nL } = this.s; const t = this.top(u) - inset, b = this.bot(u) + inset, w = this.W(u) - inset; const yc = b + (t - b) * shoulder;
    const s = Math.sin(phi), c = Math.cos(phi); let y, z;
    if (s >= 0) { y = yc + (t - yc) * Math.pow(s, 2 / nU); z = w * sgnpow(c, 2 / nU); const zz = Math.abs(z) / w; y += this.crown(u) * Math.exp(-(((zz - 0.74) / 0.2) ** 2)) * Math.min(1, s * 2.5); }
    else { y = yc - (yc - b) * Math.pow(-s, 2 / nL); z = w * sgnpow(c, 2 / nL); }
    y = Math.max(y, this.archY(u) - inset);
    o.set(this.x(u), y, z); return o;
  }
  /** Height of the body's upper surface at lateral offset z (for seating the greenhouse). */
  bodyYAt(u, z) {
    let lo = 0, hi = Math.PI / 2; const p = new THREE.Vector3(); const az = Math.abs(z);
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; this.body(u, m, p); if (p.z > az) lo = m; else hi = m; }
    return p.y;
  }
  greenhouse(u, psi, o, grow = 0) {
    const g = this.s.gh; const wb = this.W(u) * g.wb + grow, wr = this.W(u) * g.wr + grow;
    const yb = this.bodyYAt(u, wb) - 0.035; const yr = Math.max(this.yr(u) + grow, yb + 0.001);
    const s = Math.sin(psi), c = Math.cos(psi); const k = Math.pow(Math.max(s, 0), 2 / g.n);
    o.set(this.x(u), yb + (yr - yb) * k, sgnpow(c, 2 / g.n) * lerp(wb, wr, k)); return o;
  }
  normal(u, phi, o) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    this.body(u + 0.002, phi, a); this.body(u - 0.002, phi, b); this.body(u, phi + 0.01, c); this.body(u, phi - 0.01, d);
    return o.copy(c.sub(d)).cross(a.sub(b)).normalize();
  }
  /** Side silhouette polyline [[x,y],...] (closed), for logos and particle targets. */
  silhouette(n = 160) {
    const top = [], bottom = []; const p = new THREE.Vector3(); const g = this.s.gh;
    for (let i = 0; i <= n; i++) {
      const u = i / n; let y = -1; for (let k = 0; k <= 24; k++) { this.body(u, Math.PI / 2 * (k / 24), p); y = Math.max(y, p.y); }
      if (!g.screenOnly && u > g.ws && u < g.end) { this.greenhouse(u, Math.PI / 2, p); y = Math.max(y, p.y); }
      top.push([this.x(u), y]);
      this.body(u, -Math.PI / 2, p); bottom.push([this.x(u), Math.max(this.bot(u), this.archY(u))]);
    }
    return top.concat(bottom.reverse());
  }
}

// ------------------------------------------------------------------------------------------------
let emblemTex = null, emblemNormal = null, discTex = null;
function emblemMaps() {
  if (!emblemTex) {
    emblemTex = drawTexture(512, 512, (g, w) => { g.fillStyle = '#1a1612'; g.fillRect(0, 0, w, w); drawEmblem(g, w / 2, w / 2, w * 0.47, { fill: '#e8c27a', stroke: '#e8c27a' }); });
    emblemNormal = drawNormal(512, 512, (g, w) => drawEmblem(g, w / 2, w / 2, w * 0.47, { fill: '#fff', stroke: '#fff' }), 4);
  }
  return { map: emblemTex, normalMap: emblemNormal };
}
export function emblemMaterial(gold = true) {
  const e = emblemMaps();
  return new THREE.MeshPhysicalMaterial({ color: gold ? 0xffffff : 0xcccccc, map: e.map, normalMap: e.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), metalness: 1, roughness: 0.16, clearcoat: 0.6 });
}
function discMaterial() {
  if (!discTex) discTex = drawTexture(512, 512, (g, w) => {
    g.fillStyle = '#6e6e72'; g.fillRect(0, 0, w, w); const c = w / 2;
    const dr = rng(3);
    for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(255,255,255,${0.05 + dr() * 0.06})`; g.beginPath(); g.arc(c, c, c * (0.55 + dr() * 0.45), 0, TAU); g.stroke(); }
    g.fillStyle = '#121214'; for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + ring * 0.12; const r = c * (0.68 + ring * 0.1); g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, w * 0.012, 0, TAU); g.fill(); }
    g.fillStyle = '#2a2a2c'; g.beginPath(); g.arc(c, c, c * 0.52, 0, TAU); g.fill();
  });
  return new THREE.MeshStandardMaterial({ map: discTex, metalness: 0.9, roughness: 0.35, emissive: new THREE.Color(0xff3a00), emissiveIntensity: 0 });
}

function buildWheel(spec, paint, opts) {
  const g = new THREE.Group(); const { R, rimR, tireW } = spec; const tw = tireW;
  const spin = new THREE.Group(); g.add(spin); // rotates with the car's motion
  // tyre
  const prof = []; const sw = 14;
  for (let i = 0; i <= sw; i++) { const a = -Math.PI / 2 + (i / sw) * Math.PI; prof.push([R - 0.035 + Math.cos(a) * 0.035, Math.sin(a) * (tw / 2 - 0.01) * (Math.abs(Math.sin(a)) > 0.7 ? 1 : 1)]); }
  const tp = [[rimR + 0.005, -tw / 2 * 0.86], [rimR + 0.03, -tw / 2], [R - 0.05, -tw / 2 - 0.004], ...prof, [R - 0.05, tw / 2 + 0.004], [rimR + 0.03, tw / 2], [rimR + 0.005, tw / 2 * 0.86]];
  const tyre = new THREE.Mesh(lathe(tp, 96), M.tyre()); tyre.rotation.x = Math.PI / 2; spin.add(tyre);
  // rim barrel
  const rp = [[rimR * 0.92, -tw / 2 * 0.8], [rimR + 0.012, -tw / 2 * 0.86], [rimR + 0.016, -tw / 2 * 0.8], [rimR, -tw / 2 * 0.7], [rimR, tw / 2 * 0.7], [rimR + 0.016, tw / 2 * 0.82], [rimR + 0.012, tw / 2 * 0.9], [rimR * 0.92, tw / 2 * 0.84]];
  const barrel = new THREE.Mesh(lathe(rp, 72), opts.lite ? M.polished() : M.chrome()); barrel.rotation.x = Math.PI / 2; spin.add(barrel);
  const face = tw / 2 * 0.75; const hubR = 0.055;
  if (spec.wheel === 'wire') {
    const spokes = []; const n = opts.lite ? 36 : 60; const r0 = hubR * 0.9, r1 = rimR * 0.985;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU; const lace = (i % 2 ? 1 : -1) * 0.38; const zIn = (i % 3 === 0 ? -0.05 : i % 3 === 1 ? 0.03 : 0.06);
      const p0 = new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, zIn), p1 = new THREE.Vector3(Math.cos(a + lace) * r1, Math.sin(a + lace) * r1, face * 0.15 * (i % 2 ? 1 : -1));
      const len = p0.distanceTo(p1); const cg = new THREE.CylinderGeometry(0.0022, 0.0022, len, 5, 1, true);
      cg.applyMatrix4(new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 0, 1)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      cg.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); spokes.push(cg);
    }
    spin.add(new THREE.Mesh(merge(spokes), M.chrome()));
    const hub = new THREE.Mesh(lathe([[0.0001, face * 0.9], [hubR * 0.7, face * 0.9], [hubR, face * 0.5], [hubR, -0.06], [0.0001, -0.06]], 32), M.chrome()); hub.rotation.x = Math.PI / 2; spin.add(hub);
    // two-eared knock-off spinner with the emblem cap
    const ear = new THREE.Shape(); ear.moveTo(-0.11, -0.012); ear.quadraticCurveTo(-0.05, -0.03, 0, -0.035); ear.quadraticCurveTo(0.05, -0.03, 0.11, -0.012); ear.lineTo(0.11, 0.012); ear.quadraticCurveTo(0.05, 0.03, 0, 0.035); ear.quadraticCurveTo(-0.05, 0.03, -0.11, 0.012); ear.closePath();
    const spinner = new THREE.Mesh(new THREE.ExtrudeGeometry(ear, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }), M.goldPolished()); spinner.position.z = face * 0.95; spin.add(spinner);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.02, 48), emblemMaterial()); cap.rotation.x = Math.PI / 2; cap.position.z = face * 0.95 + 0.02; spin.add(cap); g.userData.cap = cap;
    cap.geometry.rotateY(Math.PI / 2);
  } else {
    const n = spec.wheel === 'spoke10' ? 10 : 5; const parts = [];
    for (let i = 0; i < n; i++) {
      const sh = new THREE.Shape(); const w0 = spec.wheel === 'spoke10' ? 0.018 : 0.04, w1 = spec.wheel === 'spoke10' ? 0.012 : 0.03;
      sh.moveTo(hubR, -w0); sh.lineTo(rimR * 0.98, -w1); sh.lineTo(rimR * 0.98, w1); sh.lineTo(hubR, w0); sh.closePath();
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.008, bevelSegments: 2 });
      eg.translate(0, 0, face * 0.55); eg.rotateZ((i / n) * TAU); parts.push(eg);
    }
    parts.push(xf(new THREE.CylinderGeometry(hubR * 1.25, hubR * 1.35, 0.06, 32), { r: [Math.PI / 2, 0, 0], p: [0, 0, face * 0.62] }));
    spin.add(new THREE.Mesh(merge(parts), spec.wheel === 'spoke10' ? M.darkChrome() : M.polished()));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 40), emblemMaterial()); cap.geometry.rotateY(Math.PI / 2); cap.rotation.x = Math.PI / 2; cap.position.z = face * 0.62 + 0.035; spin.add(cap); g.userData.cap = cap;
  }
  g.userData.spin = spin; return g;
}

function buildBrake(spec, opts) {
  const g = new THREE.Group(); const dR = spec.rimR * 0.82;
  const discMat = discMaterial();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(dR, dR, 0.026, 64), discMat); disc.rotation.x = Math.PI / 2; disc.geometry.rotateY(Math.PI / 2); g.add(disc);
  const caliper = new THREE.Mesh(roundBox(0.1, 0.17, 0.065, 0.02), opts.caliper ?? M.paint(0x5a0d16, { metalness: 0.2, roughness: 0.4 }));
  caliper.position.set(-dR * 0.62, dR * 0.62, 0.0); caliper.rotation.z = Math.PI / 4; g.add(caliper);
  g.userData = { disc, discMat, caliper }; return g;
}

/**
 * buildCar(preset, opts) → { group, body, parts[], wheels[], shape, setExplode(fn), setOutline(a), update(t) }
 * opts: { color, lite, interior, engine, fasteners, outline }
 */
export function buildCar(preset = 'classic', opts = {}) {
  const spec = { ...PRESETS[preset], ...(opts.spec || {}) }; const shape = new CarShape(spec); const L = spec.L; const lite = !!opts.lite;
  const root = new THREE.Group(); root.name = `car-${preset}`; const R = rng(opts.seed ?? 5);
  const parts = []; // { obj, dir, rot, key, dist }
  const lines = new THREE.Group(); lines.visible = false; root.add(lines);
  const lineMat = M.line(0xe0b76e, 2.2, 0); const lineMats = [lineMat];
  const paint = opts.paintMaterial || M.paint(opts.color ?? spec.color, opts.paintOpts);
  const addPart = (obj, dir, opt = {}) => { root.add(obj); parts.push({ obj, dir: dir.clone(), rot: opt.rot || new THREE.Euler(), key: opt.key ?? 0.5, base: obj.position.clone(), baseRot: obj.rotation.clone(), outline: opt.outline }); return obj; };

  const segU = (a, b) => Math.max(4, Math.round((b - a) * (lite ? 70 : 140)));
  const segP = (a, b) => Math.max(4, Math.round(Math.abs(b - a) * (lite ? 9 : 18)));
  const gU = 0.0011, gP = 0.008;
  const PI = Math.PI, pT = PI / 2 - 0.78;
  const uB = [0, 0.07, 0.43, 0.63, 0.93, 1];
  const pB = { bottom: [PI + 0.35, 2 * PI - 0.35], sideR: [-0.35, pT], top: [pT, PI - pT], sideL: [PI - pT, PI + 0.35] };
  const bodyFn = (u, p, o) => shape.body(u, p, o);
  const panels = [];
  const makePanel = (name, u0, u1, p0, p1, mat = paint) => {
    const a = u0 + (u0 > 0 ? gU : 0), b = u1 - (u1 < 1 ? gU : 0), c = p0 + gP, d = p1 - gP;
    const geo = patch(bodyFn, a, b, segU(a, b), c, d, segP(c, d), { flip: true, uvScale: [L, 1.5] });
    const m = new THREE.Mesh(geo, mat); m.name = name;
    const ctr = new THREE.Vector3(); shape.body((a + b) / 2, (c + d) / 2, ctr);
    const dir = ctr.clone(); dir.y = (dir.y - 0.5) * 1.6; dir.x *= 0.45; dir.z *= 1.5; dir.normalize();
    if (name.includes('hood') || name.includes('deck') || name.includes('tub')) dir.set(dir.x * 0.4, 1, 0).normalize();
    const ol = new THREE.LineSegments(lineGeo(patchOutline(bodyFn, a, b, c, d, 60)), lineMat); m.add(ol); ol.visible = false; m.userData.outline = ol;
    addPart(m, dir, { key: (a + b) / 2, rot: new THREE.Euler(R.range(-0.1, 0.1), 0, R.range(-0.1, 0.1)) });
    panels.push(m); return m;
  };
  makePanel('nose', 0, uB[1], -PI / 2, 3 * PI / 2);
  makePanel('tail', uB[4], 1, -PI / 2, 3 * PI / 2);
  const names = ['front', 'door', 'rear'];
  for (let i = 1; i <= 3; i++) {
    const u0 = uB[i], u1 = uB[i + 1], n = names[i - 1];
    makePanel(n === 'front' ? 'hood' : n === 'door' ? 'tub' : 'deck', u0, u1, ...pB.top);
    makePanel(`${n}-R`, u0, u1, ...pB.sideR); makePanel(`${n}-L`, u0, u1, ...pB.sideL);
    makePanel(`${n}-floor`, u0, u1, ...pB.bottom, M.blackSatin());
  }
  // inner shell so panel gaps read as dark shut-lines
  const shell = new THREE.Mesh(patch((u, p, o) => shape.body(u, p, o, 0.012), 0.004, 0.996, lite ? 60 : 100, -PI / 2, 3 * PI / 2, lite ? 32 : 48, { flip: true }), M.matte(0x020202, 0.9));
  root.add(shell); const shellPart = { obj: shell };
  // end caps: grille (front) / tail panel (rear)
  const capGeo = (u, push) => { const pos = [0, 0, 0]; const ctr = new THREE.Vector3(); shape.body(u, 0, ctr); const yc = (shape.top(u) + shape.bot(u)) / 2; const p = new THREE.Vector3(); const N = 64; const verts = [shape.x(u) + push, yc, 0]; for (let i = 0; i <= N; i++) { shape.body(u, -PI / 2 + (i / N) * TAU, p); verts.push(p.x, p.y, p.z); } const idx = []; for (let i = 1; i <= N; i++) idx.push(0, i, i + 1); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.5 });
  const fcap = new THREE.Mesh(capGeo(0.001, -0.02), grilleMat); fcap.geometry.index.array.reverse(); fcap.geometry.computeVertexNormals(); root.add(fcap);
  const rcap = new THREE.Mesh(capGeo(0.999, -0.03), paint); root.add(rcap);
  parts.find((p) => p.obj.name === 'nose').obj.add(fcap); fcap.position.set(0, 0, 0);
  parts.find((p) => p.obj.name === 'tail').obj.add(rcap);
  if (spec.grille === 'oval') {
    const loop = []; const p = new THREE.Vector3(); for (let i = 0; i <= 64; i++) { shape.body(0.004, -PI / 2 + (i / 64) * TAU, p); loop.push(p.clone()); }
    const ring = new THREE.Mesh(tube(loop, 0.009, 128, 8, true), M.chrome()); parts.find((q) => q.obj.name === 'nose').obj.add(ring);
    // egg-crate bars
    const bars = []; const y0 = shape.bot(0), y1 = shape.top(0), w0 = shape.W(0);
    for (let i = -6; i <= 6; i++) bars.push(xf(new THREE.BoxGeometry(0.006, y1 - y0, 0.004), { p: [shape.x(0) - 0.02, (y0 + y1) / 2, (i / 6) * w0 * 0.9] }));
    for (let j = 1; j < 4; j++) bars.push(xf(new THREE.BoxGeometry(0.006, 0.004, w0 * 1.8), { p: [shape.x(0) - 0.02, y0 + (y1 - y0) * (j / 4), 0] }));
    parts.find((q) => q.obj.name === 'nose').obj.add(new THREE.Mesh(merge(bars), M.polished()));
    if (!lite) { const badge = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 48), emblemMaterial(), { p: [shape.x(0.012), shape.top(0.012) + 0.012, 0], r: [0, 0, -1.2] }); badge.geometry.rotateY(Math.PI / 2); parts.find((q) => q.obj.name === 'nose').obj.add(badge); root.userData.noseBadge = badge; }
  }
  // greenhouse: windscreen, side glass, roof, pillars, backlight
  const gh = spec.gh; const ghFn = (u, p, o) => shape.greenhouse(u, p, o);
  const ghParts = new THREE.Group(); ghParts.name = 'greenhouse';
  const glassMat = M.glass();
  const addGh = (u0, u1, p0, p1, mat, grow = 0) => { const fn = grow ? (u, p, o) => shape.greenhouse(u, p, o, grow) : ghFn; const m = new THREE.Mesh(patch(fn, u0, u1, segU(u0, u1), p0, p1, segP(p0, p1) * 2, { flip: true }), mat); ghParts.add(m); const ol = new THREE.LineSegments(lineGeo(patchOutline(fn, u0, u1, p0, p1, 40)), lineMat); ol.visible = false; m.add(ol); return m; };
  if (gh.screenOnly) {
    addGh(gh.ws, gh.ws + 0.04, 0.35, PI - 0.35, glassMat);
  } else {
    const tR = 0.62; // half-angle of the painted roof band
    addGh(gh.ws, gh.rs, 0, PI, glassMat);
    addGh(gh.rs, gh.re, PI / 2 - tR, PI / 2 + tR, paint, 0.002);
    addGh(gh.rs, gh.re, 0, PI / 2 - tR, glassMat); addGh(gh.rs, gh.re, PI / 2 + tR, PI, glassMat);
    addGh(gh.rs - 0.012, gh.rs + 0.004, 0, PI / 2 - tR + 0.02, paint, 0.003); addGh(gh.rs - 0.012, gh.rs + 0.004, PI / 2 + tR - 0.02, PI, paint, 0.003); // A-pillars
    const cEnd = Math.min(gh.end, gh.re + 0.1);
    addGh(gh.re, cEnd, 0, PI / 2 - tR + 0.05, paint, 0.002); addGh(gh.re, cEnd, PI / 2 + tR - 0.05, PI, paint, 0.002); // sail panels
    addGh(gh.re, gh.end, PI / 2 - tR, PI / 2 + tR, glassMat);
    // chrome drip rail / window surround
    const rail = []; const p = new THREE.Vector3(); for (let i = 0; i <= 40; i++) { shape.greenhouse(lerp(gh.ws + 0.01, gh.end - 0.02, i / 40), 0.06, p, 0.004); rail.push(p.clone()); }
    if (!lite) { ghParts.add(new THREE.Mesh(tube(rail, 0.0045, 80, 6), M.chrome())); ghParts.add(mesh(tube(rail.map((v) => new THREE.Vector3(v.x, v.y, -v.z)), 0.0045, 80, 6), M.chrome())); }
  }
  addPart(ghParts, new THREE.Vector3(0, 1, 0), { key: (gh.ws + gh.end) / 2 });

  // lamps
  const lampGroup = new THREE.Group(); const lampGlows = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  if (spec.lamps === 'covered' || spec.lamps === 'round' || spec.lamps === 'twin') {
    for (const side of [1, -1]) {
      const zs = spec.lamps === 'twin' ? [0.62, 0.45] : [0.64];
      for (const zf of zs) {
        const u = 0.03; shape.body(u, Math.acos(zf) * (side > 0 ? 1 : -1) + (side > 0 ? 0 : PI), P);
        let phi = side > 0 ? 0.35 : PI - 0.35; shape.body(u, phi, P); shape.normal(u, phi, N);
        const lampPos = P.clone().addScaledVector(N, -0.02); lampPos.z = side * shape.W(u) * zf; lampPos.y = Math.max(lampPos.y, shape.top(u) - 0.06);
        const bowl = mesh(new THREE.SphereGeometry(0.075, 32, 16, 0, TAU, 0, Math.PI / 2), M.chrome(), { p: lampPos.toArray(), r: [0, 0, -Math.PI / 2] }); lampGroup.add(bowl);
        const lens = mesh(new THREE.SphereGeometry(0.08, 32, 16), M.lens(), { p: [lampPos.x + 0.02, lampPos.y, lampPos.z], s: [0.7, 1, 1] }); lampGroup.add(lens);
        const gl = glow(0xfff1d6, 0.5, 0); gl.position.set(lampPos.x + 0.04, lampPos.y, lampPos.z); lampGroup.add(gl); lampGlows.push(gl);
        const bulb = mesh(new THREE.SphereGeometry(0.018, 16, 8), M.emissive(0xfff1d6, 0.6), { p: [lampPos.x + 0.01, lampPos.y, lampPos.z] }); lampGroup.add(bulb); lampGlows.push(bulb);
      }
    }
  } else {
    for (const side of [1, -1]) {
      const pts = []; for (let i = 0; i <= 16; i++) { const u = 0.03 + i * 0.004; shape.body(u, side > 0 ? 0.55 : PI - 0.55, P); pts.push(P.clone().add(new THREE.Vector3(0.004, 0.002, 0))); }
      const strip = new THREE.Mesh(tube(pts, 0.006, 32, 6), M.emissive(0xeef3ff, 0.5)); lampGroup.add(strip); lampGlows.push(strip);
    }
  }
  // tail lamps
  const tailGlows = [];
  for (const side of [1, -1]) for (const zf of spec.lamps === 'led' ? [0] : [0.7, 0.5]) {
    const u = 0.996; let p = new THREE.Vector3(); shape.body(u, side > 0 ? 0.25 : PI - 0.25, p);
    if (spec.lamps === 'led') { const pts = []; for (let i = 0; i <= 20; i++) { shape.body(0.995, (side > 0 ? 0.1 : PI - 0.1) + side * (i / 20) * 0.5, p); pts.push(p.clone().add(new THREE.Vector3(-0.012, 0, 0))); } const s = new THREE.Mesh(tube(pts, 0.008, 30, 6), M.emissive(0xff1020, 1.2)); lampGroup.add(s); tailGlows.push(s); continue; }
    const tl = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 32), M.emissive(0xb0101a, 0.9), { p: [p.x - 0.025, p.y - 0.01, side * shape.W(u) * zf], r: [0, 0, Math.PI / 2] }); lampGroup.add(tl); tailGlows.push(tl);
    const rim = mesh(new THREE.TorusGeometry(0.047, 0.006, 8, 32), M.chrome(), { p: [p.x - 0.04, p.y - 0.01, side * shape.W(u) * zf], r: [0, Math.PI / 2, 0] }); lampGroup.add(rim);
  }
  addPart(lampGroup, new THREE.Vector3(0.3, 0.4, 0), { key: 0.02 });

  // bumpers / exhaust / details
  const detail = new THREE.Group();
  if (spec.bumpers) for (const [u0, u1, ph] of [[0.0, 0.06, 0.15], [0.94, 1.0, 0.1]]) for (const side of [1, -1]) {
    const pts = []; for (let i = 0; i <= 14; i++) { const u = lerp(u0, u1, i / 14); const phi = side > 0 ? -ph : PI + ph; shape.body(u, phi, P); shape.normal(u, phi, N); pts.push(P.clone().addScaledVector(N, 0.018)); }
    detail.add(new THREE.Mesh(tube(pts, 0.011, 30, 8), M.chrome()));
  }
  const nEx = spec.exhaust || 2;
  for (let i = 0; i < nEx; i++) { const z = (i - (nEx - 1) / 2) * (nEx > 2 ? 0.11 : 0.5); const ex = mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.3, 24, 1, true), M.chrome(), { p: [shape.x(1) + 0.08, shape.bot(1) - 0.02, z + (nEx > 2 ? Math.sign(z) * 0.15 : 0)], r: [0, 0, Math.PI / 2] }); ex.material = M.chrome(); detail.add(ex); }
  if (!lite) {
    // fender vents, door handles, fuel filler, mirrors
    for (const side of [1, -1]) {
      for (let k = 0; k < 3; k++) { const u = 0.3 + k * 0.025; const phi = side > 0 ? 0.05 : PI - 0.05; shape.body(u, phi, P); shape.normal(u, phi, N); const v = mesh(roundBox(0.012, 0.12, 0.012, 0.005), M.matte(0x010101, 0.6), { p: P.clone().addScaledVector(N, -0.002).toArray(), r: [0, 0, -0.25] }); detail.add(v); }
      { const u = 0.6; const phi = side > 0 ? 0.42 : PI - 0.42; shape.body(u, phi, P); shape.normal(u, phi, N); const h = mesh(roundBox(0.11, 0.016, 0.02, 0.007), M.chrome(), { p: P.clone().addScaledVector(N, 0.006).toArray() }); h.lookAt(P.clone().add(N)); h.rotateY(Math.PI / 2); detail.add(h); }
      { const u = 0.44; const phi = side > 0 ? 0.62 : PI - 0.62; shape.body(u, phi, P); const mi = new THREE.Group(); mi.position.copy(P); mi.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.09, 12), M.chrome(), { p: [0, 0.045, 0] })); mi.add(mesh(new THREE.SphereGeometry(0.05, 24, 12), M.chrome(), { p: [-0.02, 0.1, 0], s: [1.5, 0.75, 0.75] })); detail.add(mi); }
    }
    { const u = 0.8; const phi = 0.62; shape.body(u, phi, P); shape.normal(u, phi, N); const f = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 40), M.chrome(), { p: P.clone().addScaledVector(N, 0.004).toArray() }); f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), N); detail.add(f); root.userData.fuelCap = f; }
  }
  if (spec.fin) { const fin = new THREE.Mesh(patch((u, v, o) => o.set(shape.x(u), shape.top(u) + v * 0.35 * smooth((u - 0.62) / 0.3), 0), 0.62, 1, 30, 0, 1, 4), paint); fin.material.side = THREE.DoubleSide; detail.add(fin); }
  addPart(detail, new THREE.Vector3(0, -0.3, 0), { key: 0.9 });

  // wheels + brakes + suspension
  const wheels = [];
  for (const w of shape.wheels) for (const side of [1, -1]) {
    const wg = buildWheel(spec, paint, opts); wg.position.set(w.x, spec.R, side * spec.track); if (side < 0) wg.rotation.y = Math.PI;
    addPart(wg, new THREE.Vector3(0.1 * Math.sign(w.x), -0.05, side * 1.6).normalize(), { key: w.u, rot: new THREE.Euler(0, side * 0.6, 0) });
    let brake = null;
    if (!lite) {
      brake = buildBrake(spec, opts); brake.position.set(w.x, spec.R, side * (spec.track - spec.tireW * 0.45)); if (side < 0) brake.rotation.y = Math.PI;
      addPart(brake, new THREE.Vector3(0, 0.05, side).normalize(), { key: w.u });
      const sus = new THREE.Group();
      const spring = mesh(springGeo(0.055, 0.008, 0.32, 7), M.paint(0x8a6a2a, { metalness: 0.7, roughness: 0.3 }), { p: [0, 0.28, 0], r: [side * 0.25, 0, 0] }); sus.add(spring);
      const damper = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 16), M.chrome(), { p: [0, 0.28, 0], r: [side * 0.25, 0, 0] }); sus.add(damper);
      for (const yy of [0.12, 0.42]) sus.add(new THREE.Mesh(tube([[0.12, yy, -side * 0.35], [0.0, yy, -side * 0.02], [-0.12, yy, -side * 0.35]], 0.014, 24, 8), M.blackGloss()));
      sus.position.set(w.x, spec.R - 0.2, side * (spec.track - 0.2)); addPart(sus, new THREE.Vector3(0, -0.6, side).normalize(), { key: w.u });
    }
    wheels.push({ group: wg, brake, front: w.u < 0.5, side });
  }

  // engine, drivetrain, interior
  let engine = null; const interior = new THREE.Group();
  if (!lite && opts.engine !== false) {
    engine = buildV8({ outline: lineMat });
    const ex = preset === 'supercar' || preset === 'prototype' ? shape.x(0.62) : shape.x(0.29);
    engine.position.set(ex, 0.13, 0); engine.scale.setScalar(0.84); addPart(engine, new THREE.Vector3(0, 1, 0), { key: 0.29 });
    const trans = new THREE.Group();
    trans.add(mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 24), M.castAlu(), { p: [ex - 0.62, 0.32, 0], r: [0, 0, Math.PI / 2] }));
    trans.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, Math.abs(ex - shape.x(spec.wr)) - 0.7, 16), M.steel(), { p: [(ex - 0.85 + shape.x(spec.wr)) / 2, 0.3, 0], r: [0, 0, Math.PI / 2] }));
    trans.add(mesh(new THREE.SphereGeometry(0.14, 24, 16), M.castAlu(), { p: [shape.x(spec.wr), spec.R, 0], s: [1, 0.9, 1.1] }));
    addPart(trans, new THREE.Vector3(0, -0.5, 0.0).normalize(), { key: 0.55 });
  }
  if (!lite && opts.interior !== false) {
    const leatherMat = M.leather(opts.leather ?? 0x5a2316);
    for (const side of [1, -1]) {
      const seat = new THREE.Group(); const xs = shape.x(0.6);
      seat.add(mesh(roundBox(0.5, 0.1, 0.46, 0.04), leatherMat, { p: [0, 0.0, 0] }));
      seat.add(mesh(roundBox(0.1, 0.62, 0.46, 0.045), leatherMat, { p: [-0.24, 0.3, 0], r: [0, 0, 0.22] }));
      for (let k = -2; k <= 2; k++) seat.add(mesh(new THREE.BoxGeometry(0.4, 0.004, 0.006), M.matte(0x1a0806), { p: [0.02, 0.052, k * 0.07] }));
      seat.position.set(xs, 0.3, side * 0.36); addPart(seat, new THREE.Vector3(-0.2, 1, side * 0.6).normalize(), { key: 0.6 }); interior.userData[`seat${side}`] = seat;
    }
    const dash = mesh(roundBox(0.22, 0.16, 1.4, 0.04), M.matte(0x0a0a0a, 0.7), { p: [shape.x(0.47), 0.72, 0] }); interior.add(dash);
    for (const zz of [-0.47, -0.27]) { const ga = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 40), M.matte(0x111111, 0.4), { p: [shape.x(0.47) - 0.115, 0.76, zz], r: [0, 0, Math.PI / 2] }); interior.add(ga); interior.add(mesh(new THREE.TorusGeometry(0.06, 0.006, 8, 40), M.chrome(), { p: [shape.x(0.47) - 0.12, 0.76, zz], r: [0, Math.PI / 2, 0] })); }
    const sw = new THREE.Group(); sw.add(mesh(new THREE.TorusGeometry(0.19, 0.016, 12, 64), M.walnut()));
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 1.15; sw.add(mesh(new THREE.BoxGeometry(0.17, 0.02, 0.004), M.alu(), { p: [Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0], r: [0, 0, a] })); }
    sw.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 32), emblemMaterial(), { r: [Math.PI / 2, 0, 0] }));
    sw.position.set(shape.x(0.5), 0.78, -0.37); sw.rotation.set(0, Math.PI / 2, 0); sw.rotateX(-0.45); interior.add(sw); interior.userData.steering = sw;
    const lever = new THREE.Group(); lever.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.22, 12), M.chrome(), { p: [0, 0.11, 0] })); lever.add(mesh(new THREE.SphereGeometry(0.022, 24, 16), M.walnut(), { p: [0, 0.23, 0] }));
    lever.position.set(shape.x(0.56), 0.36, 0); interior.add(lever); interior.userData.lever = lever;
    addPart(interior, new THREE.Vector3(0.2, 1, 0).normalize(), { key: 0.5 });
  }

  // fasteners (instanced): assembled = tucked inside body (scale 0), exploded = orbiting cloud
  let fasteners = null;
  if (!lite && opts.fasteners !== false) {
    const r = rng(99); const n = 1400; const bolt = new THREE.InstancedMesh(boltGeo(0.032, 0.0045, 0), new THREE.MeshStandardMaterial({ color: 0x8c8d92, metalness: 1, roughness: 0.5 }), n); const wash = new THREE.InstancedMesh(washerGeo(0.009, 0.005, 0.0014), new THREE.MeshStandardMaterial({ color: 0xc9a060, metalness: 1, roughness: 0.45 }), Math.floor(n / 3));
    const home = [], far = [], rot = [];
    for (let i = 0; i < n; i++) {
      const u = r(), ph = r() * TAU; const p = new THREE.Vector3(); shape.body(u, ph, p, 0.03); home.push(p);
      const d = p.clone(); d.y -= 0.5; d.normalize(); const f = p.clone().addScaledVector(d, 0.6 + r() * 2.2); f.y += r.range(-0.3, 0.9); f.x *= 1 + r() * 0.4; far.push(f);
      rot.push(new THREE.Euler(r() * TAU, r() * TAU, r() * TAU));
    }
    fasteners = { bolt, wash, home, far, rot, n };
    root.add(bolt); root.add(wash);
  }

  if (!lite) for (const p of parts) { const n = p.obj.name || ''; if (p.obj.isMesh || n === 'v8' || n === 'greenhouse') continue; const ol = outlineOf(p.obj, lineMat, 32); p.obj.add(ol); }
  const outlineObjs = [];
  root.traverse((o) => { if (o.isLineSegments) outlineObjs.push(o); });
  if (engine) engine.traverse((o) => { if (o.isLineSegments) outlineObjs.push(o); });

  const state = { explode: 0, wheelAngle: 0, steer: 0 };
  const api = {
    group: root, shape, parts, wheels, engine, interior, paint, fasteners, lampGlows, tailGlows, panels, spec, lineMat, shell,
    /** e(part) → 0..1 per part; or a number for all. */
    setExplode(fn, t = 0) {
      const tmpE = new THREE.Euler(); let maxE = 0;
      for (const p of parts) {
        const e = typeof fn === 'function' ? fn(p) : fn; const ee = e; maxE = Math.max(maxE, e);
        const dist = p.obj === engine ? 1.25 : p.obj.name?.startsWith('greenhouse') ? 1.1 : 1.0;
        p.obj.position.copy(p.base).addScaledVector(p.dir, ee * dist * (p.dist ?? 1));
        const w = Math.sin(t * 0.6 + p.key * 9) * 0.05 * ee; p.obj.position.y += Math.sin(t * 0.8 + p.key * 13) * 0.04 * ee;
        tmpE.set(p.baseRot.x + p.rot.x * ee + w, p.baseRot.y + p.rot.y * ee + w * 0.7, p.baseRot.z + p.rot.z * ee); p.obj.rotation.copy(tmpE);
      }
      shell.visible = maxE < 0.01;
      if (fasteners) {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), e2 = new THREE.Euler();
        for (let i = 0; i < fasteners.n; i++) {
          const key = (fasteners.home[i].x / L) + 0.5; const e = typeof fn === 'function' ? fn({ key: 1 - key }) : fn;
          pos.lerpVectors(fasteners.home[i], fasteners.far[i], e); const sp = t * (0.2 + (i % 7) * 0.05);
          e2.set(fasteners.rot[i].x + sp * e, fasteners.rot[i].y + sp * 0.7 * e, fasteners.rot[i].z); q.setFromEuler(e2); s.setScalar(smooth(e * 3));
          m.compose(pos, q, s); fasteners.bolt.setMatrixAt(i, m); if (i % 3 === 0 && i / 3 < fasteners.wash.count) { pos.y += 0.02; m.compose(pos, q, s); fasteners.wash.setMatrixAt(i / 3, m); }
        }
        fasteners.bolt.instanceMatrix.needsUpdate = true; fasteners.wash.instanceMatrix.needsUpdate = true;
        fasteners.bolt.visible = fasteners.wash.visible = maxE > 0.01;
      }
    },
    setOutline(a) { lineMat.opacity = a; for (const o of outlineObjs) o.visible = a > 0.001; },
    spin(angle) { for (const w of wheels) { w.group.userData.spin.rotation.z = -angle * w.side; } },
    steerTo(a) { for (const w of wheels) if (w.front) w.group.rotation.y = (w.side < 0 ? Math.PI : 0) + a; },
    lights(front = 1, rear = 1) {
      for (const g of lampGlows) { if (g.isSprite) g.material.color.setRGB(1, 0.95, 0.84).multiplyScalar(front * 3); else g.material.color.setRGB(1, 0.95, 0.85).multiplyScalar(0.4 + front * 8); }
      for (const g of tailGlows) g.material.color.setRGB(0.7, 0.04, 0.06).multiplyScalar(0.6 + rear * 5);
    },
    brakeGlow(v) { for (const w of wheels) if (w.brake) { w.brake.userData.discMat.emissiveIntensity = v * 6; } },
  };
  api.setExplode(0); api.setOutline(0); api.lights(0, 0);
  return api;
}

/** Mirror-image copy for glossy floors (shares geometry/materials). */
export function reflectionOf(obj) { const r = obj.clone(true); r.scale.y = -1; r.traverse((o) => { if (o.isLineSegments) o.visible = false; }); return r; }

/** Soft contact shadow / ambient-occlusion decal for a car footprint. */
export function contactShadow(car, strength = 0.9) {
  const { L } = car.spec; const Wd = Math.max(...car.spec.W.map((p) => p[1])) * 2;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.filter = 'blur(18px)'; g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.roundRect(60, 50, 392, 156, 70); g.fill();
  g.filter = 'blur(8px)'; g.fillStyle = 'rgba(0,0,0,0.95)';
  for (const w of car.shape.wheels) for (const s of [-1, 1]) { const x = 256 - (w.x / (L * 1.25)) * 512; const y = 128 + s * (car.spec.track / (Wd * 1.6)) * 256; g.beginPath(); g.ellipse(x, y, 34, 22, 0, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.25, Wd * 1.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: strength, depthWrite: false, color: 0x000000 }));
  m.material.alphaMap = tex; m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; m.position.y = 0.003; m.renderOrder = 2; return m;
}
