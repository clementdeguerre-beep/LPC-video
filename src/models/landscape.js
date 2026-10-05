// Mediterranean coast: terrain with a carved winding road, sea, pines; and a race circuit.
import * as THREE from 'three';
import { M, skyDome } from '../engine/materials.js';
import { asphalt } from '../engine/textures.js';
import { fbm2, rng, clamp, smooth, lerp } from '../engine/util.js';
import { mesh } from './geo.js';

/** Road centreline: coastal run, then switchbacks climbing into the hills. */
export function roadCurve() {
  const pts = [
    [-260, 0, 40], [-200, 0, 30], [-150, 0, 42], [-100, 0, 30], [-60, 0, 38], [-20, 0, 26], [20, 0, 34], [60, 0, 20],
    [90, 0, -5], [70, 0, -30], [30, 0, -42], [10, 0, -62], [45, 0, -82], [95, 0, -88], [120, 0, -110], [90, 0, -135], [40, 0, -145], [10, 0, -170],
  ];
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
}

export function buildCoast({ size = 700, seg = 300, seed = 7 } = {}) {
  const g = new THREE.Group(); const road = roadCurve(); const N = 700; const rp = road.getSpacedPoints(N);
  // road elevation: gentle along the coast, climbing with the switchbacks
  const roadY = rp.map((p, i) => 6 + Math.max(0, -p.z - 10) * 0.28 + Math.sin(i * 0.02) * 1.2);
  rp.forEach((p, i) => (p.y = roadY[i]));
  const terrainH = (x, z) => {
    const coast = 30 + Math.sin(x * 0.012) * 18; // sea boundary along +z
    let h = (coast - z) * 0.35 + fbm2(x * 0.008 + 50, z * 0.008 + 50, 5, seed) * 70 - 20;
    h += Math.max(0, -z - 40) * 0.5 * (0.6 + fbm2(x * 0.01, z * 0.01, 3, seed + 3));
    return h;
  };
  const nearest = (x, z) => { let best = 1e9, bi = 0; for (let i = 0; i < rp.length; i += 2) { const dx = rp[i].x - x, dz = rp[i].z - z; const d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } } return [Math.sqrt(best), bi]; };
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2); const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(0x6b5a3a), c2 = new THREE.Color(0x3d4426), c3 = new THREE.Color(0x8a7a5a), c4 = new THREE.Color(0xb39e72), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); let h = terrainH(x, z); const [d, bi] = nearest(x, z);
    const ry = roadY[bi] - 0.25; const k = smooth(clamp((d - 6) / 26)); h = lerp(ry, Math.max(h, ry - 30), k); if (d < 6) h = ry;
    pos.setY(i, h);
    const n = fbm2(x * 0.05, z * 0.05, 3, seed + 9); tmp.copy(c1).lerp(c2, smooth(n * 1.4 - 0.2)).lerp(c3, clamp((h - 40) / 80)); if (h < 3) tmp.copy(c4); if (d < 9) tmp.lerp(new THREE.Color(0x5a4e3a), 0.4);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })); g.add(terrain);
  // road ribbon
  const W = 3.6; const rPos = [], rUv = [], rIdx = []; let acc = 0;
  for (let i = 0; i <= N; i++) {
    const p = rp[i]; const t = road.getTangentAt(i / N); const side = new THREE.Vector3(-t.z, 0, t.x).normalize(); if (i > 0) acc += rp[i].distanceTo(rp[i - 1]);
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * W); rPos.push(q.x, p.y + 0.05, q.z); rUv.push((s + 1) / 2, acc / 7); }
    if (i < N) { const a = i * 2; rIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2)); rg.setIndex(rIdx); rg.computeVertexNormals();
  const A = asphalt(); const roadTex = A.map.clone(); roadTex.repeat.set(1, 1); roadTex.needsUpdate = true;
  const lines = document.createElement('canvas'); lines.width = 256; lines.height = 512; const lc = lines.getContext('2d'); lc.drawImage(A.map.image, 0, 0, 256, 512); lc.fillStyle = 'rgba(230,225,210,0.85)'; lc.fillRect(8, 0, 6, 512); lc.fillRect(242, 0, 6, 512); lc.fillRect(125, 0, 6, 300);
  const lt = new THREE.CanvasTexture(lines); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 8;
  const roadMesh = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: lt, roughness: 0.75, metalness: 0 })); g.add(roadMesh);
  // guard-rail posts on the sea side + pines
  const r = rng(seed); const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.9, 0.15), M.matte(0xd8d4c8, 0.6), 340); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 340; i++) { const u = i / 340; const p = road.getPointAt(u); const t = road.getTangentAt(u); const side = new THREE.Vector3(-t.z, 0, t.x).normalize(); const q = p.addScaledVector(side, W + 1.2); const yi = roadY[Math.round(u * N)]; m4.makeTranslation(q.x, yi + 0.45, q.z); posts.setMatrixAt(i, m4); }
  g.add(posts);
  const pineTrunk = new THREE.CylinderGeometry(0.25, 0.35, 6, 6); pineTrunk.translate(0, 3, 0); const pineTop = new THREE.SphereGeometry(3.2, 10, 6); pineTop.scale(1, 0.45, 1); pineTop.translate(0, 6.5, 0);
  const cypress = new THREE.ConeGeometry(1.1, 9, 8); cypress.translate(0, 4.5, 0);
  const trunks = new THREE.InstancedMesh(pineTrunk, M.matte(0x2a1e16, 0.9), 260), tops = new THREE.InstancedMesh(pineTop, M.matte(0x2a3a20, 0.9), 260), cyp = new THREE.InstancedMesh(cypress, M.matte(0x1c2a18, 0.9), 160);
  let ti = 0, ci = 0;
  for (let k = 0; k < 2000 && (ti < 260 || ci < 160); k++) {
    const x = r.range(-330, 330), z = r.range(-330, 60); const [d] = nearest(x, z); if (d < 12) continue; const h = terrainH(x, z); if (h < 4) continue;
    const yy = (() => { const [dd, bi] = nearest(x, z); const ry = roadY[bi] - 0.25; const kk = smooth(clamp((dd - 6) / 26)); return lerp(ry, Math.max(h, ry - 30), kk); })();
    const s = r.range(0.7, 1.4); m4.compose(new THREE.Vector3(x, yy - 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new THREE.Vector3(s, s, s));
    if (r() < 0.6 && ti < 260) { trunks.setMatrixAt(ti, m4); tops.setMatrixAt(ti, m4); ti++; } else if (ci < 160) { cyp.setMatrixAt(ci++, m4); }
  }
  trunks.count = tops.count = ti; cyp.count = ci; g.add(trunks); g.add(tops); g.add(cyp);
  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshPhysicalMaterial({ color: 0x0b2236, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15, normalMap: A.normalMap, normalScale: new THREE.Vector2(0.15, 0.15) }));
  sea.material.normalMap = A.normalMap.clone(); sea.material.normalMap.repeat.set(200, 200); sea.material.normalMap.needsUpdate = true;
  sea.rotation.x = -Math.PI / 2; sea.position.y = 0.6; g.add(sea);
  g.userData = { road, roadY, N, terrainH, sea };
  /** World position + heading on the road at arc-length fraction u (lane offset in metres). */
  g.userData.onRoad = (u, lane = -1.6) => { u = ((u % 1) + 1) % 1; const p = road.getPointAt(u); const t = road.getTangentAt(u); const side = new THREE.Vector3(-t.z, 0, t.x).normalize(); p.addScaledVector(side, lane); p.y = roadY[Math.round(u * N)] + 0.05; return { p, t, heading: Math.atan2(-t.z, t.x) }; };
  return g;
}

/** Race circuit straight with kerbs and barriers. */
export function buildCircuit() {
  const g = new THREE.Group(); const A = asphalt();
  const track = new THREE.Mesh(new THREE.PlaneGeometry(400, 14), new THREE.MeshStandardMaterial({ map: A.map, normalMap: A.normalMap, roughness: 0.7 })); track.material.map = A.map.clone(); track.material.map.repeat.set(60, 2); track.material.map.needsUpdate = true; track.rotation.x = -Math.PI / 2; g.add(track);
  const kc = document.createElement('canvas'); kc.width = 256; kc.height = 32; const k = kc.getContext('2d'); for (let i = 0; i < 8; i++) { k.fillStyle = i % 2 ? '#e9e4da' : '#8a1620'; k.fillRect(i * 32, 0, 32, 32); }
  const kt = new THREE.CanvasTexture(kc); kt.wrapS = THREE.RepeatWrapping; kt.repeat.set(100, 1); kt.colorSpace = THREE.SRGBColorSpace;
  for (const z of [-7.6, 7.6]) { const kerb = new THREE.Mesh(new THREE.PlaneGeometry(400, 1.2), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.5 })); kerb.rotation.x = -Math.PI / 2; kerb.position.set(0, 0.03, z); g.add(kerb); }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), M.matte(0x3a3a22, 1)); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; g.add(grass);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(400, 1.1, 0.4), M.matte(0xd8d4c8, 0.6)); wall.position.set(0, 0.55, -12); g.add(wall);
  for (let i = 0; i < 40; i++) g.add(mesh(new THREE.BoxGeometry(0.1, 3.5, 0.1), M.matte(0x111111), { p: [-200 + i * 10, 2.2, -12.3] }));
  return g;
}
