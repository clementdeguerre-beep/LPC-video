// Geometry helpers: monotone splines, loft patches, lathes, tubes, merging.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Monotone cubic (Fritsch–Carlson) interpolant through [[x,y],...] sorted by x. */
export function mspline(pts) {
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Parametric surface patch. fn(u,v,target:Vector3). Returns indexed geometry with uv in [u,v] param space. */
export function patch(fn, u0, u1, nu, v0, v1, nv, { uvScale = [1, 1], flip = false } = {}) {
  const pos = [], uv = [], idx = []; const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = u0 + (u1 - u0) * (i / nu), v = v0 + (v1 - v0) * (j / nv); fn(u, v, p); pos.push(p.x, p.y, p.z); uv.push(u * uvScale[0], v * uvScale[1]);
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}

/** Boundary polyline of a patch (for gold outline lines). Returns Float32Array of segment pairs. */
export function patchOutline(fn, u0, u1, v0, v1, n = 48, inner = []) {
  const segs = []; const a = new THREE.Vector3(), b = new THREE.Vector3();
  const edge = (f) => { for (let i = 0; i < n; i++) { f(i / n, a); f((i + 1) / n, b); segs.push(a.x, a.y, a.z, b.x, b.y, b.z); } };
  edge((t, o) => fn(u0 + (u1 - u0) * t, v0, o)); edge((t, o) => fn(u0 + (u1 - u0) * t, v1, o));
  edge((t, o) => fn(u0, v0 + (v1 - v0) * t, o)); edge((t, o) => fn(u1, v0 + (v1 - v0) * t, o));
  for (const uu of inner) edge((t, o) => fn(uu, v0 + (v1 - v0) * t, o));
  return new Float32Array(segs);
}

export function lineGeo(arr) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g; }

/** Lathe from [[r,y],...] around Y. */
export function lathe(profile, segs = 48, phiStart = 0, phiLen = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLen);
}

export function tube(points, radius = 0.02, segs = 64, radial = 10, closed = false) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed);
  return new THREE.TubeGeometry(c, segs, radius, radial, closed);
}

/** Rounded box via extruded rounded rectangle (bevelled). */
export function roundBox(w, h, d, r = 0.02, seg = 3) {
  const s = new THREE.Shape(); const x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
  s.moveTo(x, y - r); s.lineTo(x + ww, y - r); s.quadraticCurveTo(x + ww + r, y - r, x + ww + r, y); s.lineTo(x + ww + r, y + hh);
  s.quadraticCurveTo(x + ww + r, y + hh + r, x + ww, y + hh + r); s.lineTo(x, y + hh + r); s.quadraticCurveTo(x - r, y + hh + r, x - r, y + hh); s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0001, d - 2 * r), bevelEnabled: true, bevelSize: r * 0.95, bevelThickness: r, bevelSegments: seg, curveSegments: seg * 2 });
  g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g;
}

export function merge(geos) { return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false); }

/** Transform a geometry copy. */
export function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
  return g.clone().applyMatrix4(m);
}

export function mesh(geo, mat, { p, r, s, cast = false, name } = {}) {
  const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s !== undefined) Array.isArray(s) ? m.scale.set(...s) : m.scale.setScalar(s); if (name) m.name = name; return m;
}

/** Hex bolt geometry (head + threaded shank) along +Y. */
export function boltGeo(len = 0.03, rad = 0.004, detail = 1) {
  const head = new THREE.CylinderGeometry(rad * 1.75, rad * 1.75, rad * 1.3, 6); head.translate(0, rad * 0.65, 0);
  const prof = [[0.0001, 0]]; const turns = detail ? 10 : 3; for (let i = 0; i <= turns * 2; i++) prof.push([rad * (i % 2 ? 0.86 : 1), -len * (i / (turns * 2))]); prof.push([0.0001, -len]);
  const shank = lathe(prof, detail ? 12 : 6);
  return merge([head, shank]);
}

/** Washer. */
export function washerGeo(r = 0.008, ri = 0.0045, t = 0.0012) {
  const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, ri, 0, Math.PI * 2, true); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: t * 0.2, bevelThickness: t * 0.2, bevelSegments: 1, curveSegments: 32 }); g.rotateX(-Math.PI / 2); return g;
}

/** Helical coil spring along Y. */
export function springGeo(r = 0.06, wire = 0.008, len = 0.3, turns = 7) {
  const pts = []; const n = turns * 24; for (let i = 0; i <= n; i++) { const a = (i / 24) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, (i / n) * len - len / 2, Math.sin(a) * r)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, wire, 8, false);
}

/** Gear with n teeth in XY plane extruded along Z. */
export function gearGeo(R = 0.1, teeth = 24, depth = 0.02, toothH = 0.012, hole = 0.03) {
  const s = new THREE.Shape(); const N = teeth * 4;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; const ph = i % 4; const r = ph === 1 || ph === 2 ? R + toothH : R; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  if (hole) { const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.08, bevelThickness: depth * 0.08, bevelSegments: 1, curveSegments: 8 }); g.translate(0, 0, -depth / 2); return g;
}
