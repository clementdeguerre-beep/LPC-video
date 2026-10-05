// SCENE 9 (82–90s) — THE LEGACY. Echoes of every scene (spark, gear, leather, tyre, crystal, key,
// seal) dissolve into a swirl of gold particles around the black car, which then draw the logo:
// the car's profile traced in gold with the name set into its flank. Final macro on the emblem.
import { THREE, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, easeInOutCubic } from './common.js';
import { buildCar, emblemMaterial } from '../models/car.js';
import { gearGeo, lathe, lineGeo } from '../models/geo.js';
import { outlineOf } from '../models/engine.js';
import { glow } from '../engine/materials.js';
import { FONT_SERIF } from '../engine/textures.js';
import { TAU, invLerp } from '../engine/util.js';

import { LOGO } from './logo.js';
export { LOGO };

/** Sample points of the title rendered exactly like the on-screen serif title (1080p reference). */
function titlePoints(n, r) {
  const W = 1920, H = 1080; const c = document.createElement('canvas'); c.width = W; c.height = 200; const g = c.getContext('2d');
  const size = LOGO.titleSize, tr = LOGO.tracking * size; g.font = `600 ${size}px ${FONT_SERIF}`; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  const text = 'Legend Paddock Club'; let tw = 0; for (const ch of text) tw += g.measureText(ch).width + tr; tw -= tr; let x = W / 2 - tw / 2;
  for (const ch of text) { g.fillText(ch, x, 100); x += g.measureText(ch).width + tr; }
  const px = g.getImageData(0, 0, W, 200).data; const hits = []; for (let y = 0; y < 200; y += 1) for (let xx = 0; xx < W; xx += 1) if (px[(y * W + xx) * 4] > 128) hits.push([xx, y]);
  const d = LOGO.camZ - LOGO.plane; const fh = 2 * d * Math.tan((LOGO.fov / 2) * Math.PI / 180), fw = fh * 16 / 9; const out = [];
  for (let i = 0; i < n; i++) { const [hx, hy] = hits[Math.floor(r() * hits.length)]; out.push(v3(((hx - W / 2) / W) * fw, LOGO.camY - (LOGO.titleY - 0.5) * fh - ((hy - 100) / H) * fh, LOGO.plane)); }
  return out;
}

export async function buildS9(ctx, opts = {}) {
  const shots = [];
  const set = makeSet('studio', { envIntensity: 0.7 }); const S = set.scene;
  const car = buildCar('classic', { fasteners: false, color: 0x030303, seed: 201 }); S.add(car.group); car.lights(0, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.floorMirror(0x020202, 0.15, 0.9, 0.05)); floor.rotation.x = -Math.PI / 2; S.add(floor);
  const rimL = spot(S, { intensity: 130, pos: [-6, 3.5, -4], target: [0, 0.6, 0], angle: 0.45, penumbra: 1, color: 0xffd9a0 });
  const rimR = spot(S, { intensity: 160, pos: [6, 3, -4], target: [0, 0.6, 0], angle: 0.45, penumbra: 1, color: 0xffe8c8 });
  const top = spot(S, { intensity: 120, pos: [0, 9, 3], target: [0, 0.5, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  // echoes of previous scenes, as gold line drawings
  const lineMat = M.line(0xe0b76e, 2.4, 1); const icons = new THREE.Group(); S.add(icons);
  const iconDefs = [
    ['gear', new THREE.Mesh(gearGeo(0.28, 24, 0.05, 0.03, 0.09)), [-3.2, 1.9, 0.8]],
    ['tyre', new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 40)), [3.3, 1.7, 0.6]],
    ['glass', new THREE.Mesh(lathe([[0.0001, 0], [0.12, 0], [0.02, 0.03], [0.015, 0.25], [0.14, 0.32], [0.17, 0.46], [0.0001, 0.46]], 24)), [-2.4, -0.2 + 0.4, 1.4]],
    ['key', new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02)), [2.5, 0.2, 1.5]],
    ['seal', new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.05, 40)), [0.2, 2.3, 0.3]],
    ['spark', new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12)), [-0.6, 2.1, 1.2]],
  ];
  const iconLines = []; for (const [name, m, p] of iconDefs) { const grp = new THREE.Group(); grp.add(m); m.visible = true; const ol = outlineOf(grp, lineMat, 25); ol.visible = true; const holder = new THREE.Group(); holder.add(ol); holder.position.set(...p); icons.add(holder); iconLines.push({ holder, p: v3(...p), geo: ol.geometry }); }
  // particles
  const r = rng(909); const N = 9000; const sil = car.shape.silhouette(220); const k = (LOGO.camZ - LOGO.plane) / LOGO.camZ;
  const silPts = []; for (let i = 0; i < sil.length; i++) { const a = sil[i], b = sil[(i + 1) % sil.length]; const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 160)); for (let j = 0; j < n; j++) { const t = j / n; silPts.push(v3((a[0] + (b[0] - a[0]) * t) * k, LOGO.camY + ((a[1] + (b[1] - a[1]) * t) - LOGO.camY) * k, LOGO.plane)); } }
  const textPts = titlePoints(Math.floor(N * 0.42), r);
  const pos0 = new Float32Array(N * 3), tgt = new Float32Array(N * 3), sw = new Float32Array(N * 4), del = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const ic = iconLines[i % iconLines.length]; const arr = ic.geo.attributes.position.array; const vi = Math.floor(r() * (arr.length / 3)) * 3;
    pos0.set([arr[vi] + ic.p.x, arr[vi + 1] + ic.p.y, arr[vi + 2] + ic.p.z], i * 3);
    const T = i < textPts.length ? textPts[i] : silPts[Math.floor(r() * silPts.length)]; tgt.set([T.x, T.y, T.z], i * 3);
    sw.set([r.range(2.6, 4.6), r.range(-0.1, 2.0), r.range(0.6, 1.3) * (r() < 0.85 ? 1 : -1), r() * TAU], i * 4); del[i] = r();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos0, 3)); g.setAttribute('tgt', new THREE.BufferAttribute(tgt, 3)); g.setAttribute('sw', new THREE.BufferAttribute(sw, 4)); g.setAttribute('del', new THREE.BufferAttribute(del, 1));
  const pmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, res: { value: ctx.res } },
    vertexShader: `uniform float t, res; attribute vec3 tgt; attribute vec4 sw; attribute float del; varying float vA; varying float vS;
      void main(){
        float s1 = smoothstep(0.0, 1.3, t - del * 0.5);              // leave the echoes, join the swirl
        float s2 = smoothstep(2.0 + del * 1.0, 3.3 + del * 1.0, t);   // converge into the logo
        float ang = sw.w + sw.z * t * 1.4; vec3 swirl = vec3(cos(ang) * sw.x, 0.2 + sw.y + sin(t * 1.3 + sw.w) * 0.25, sin(ang) * sw.x * 0.6);
        vec3 p = mix(position, swirl, s1); p = mix(p, tgt, s2 * s2 * (3. - 2. * s2));
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        vS = s2; vA = (0.55 + 0.45 * sin(t * 6. + del * 40.)) * (0.6 + s1 * 0.6);
        gl_PointSize = clamp(mix(40., 10., s2) * res / -mv.z, 1.5 * res, 10. * res); }`,
    fragmentShader: `varying float vA; varying float vS; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d,d) * 14.); vec3 c = mix(vec3(1.5, 0.95, 0.42), vec3(1.25, 0.95, 0.55), vS); gl_FragColor = vec4(c * a * vA * mix(1.5, 0.7, vS), 1.); }` });
  const parts = new THREE.Points(g, pmat); parts.frustumCulled = false; S.add(parts);
  const sd = dust(S, { count: 300, box: [0, 1.5, 0, 12, 4, 6], size: 0.6, intensity: 0.35, res: ctx.res, seed: 91 });
  set.onUpdate((t) => {
    const lt = t - 82.0; pmat.uniforms.t.value = lt; sd.set(t);
    const iconA = 1 - smooth(clamp((lt - 0.3) / 1.0)); lineMat.opacity = iconA; icons.visible = iconA > 0.01; icons.children.forEach((h, i) => { h.rotation.y = lt * 0.6 + i; h.rotation.x = lt * 0.3; });
    const dim = smooth(clamp((lt - 2.4) / 1.8)); rimL.intensity = 130 * (1 - dim * 0.75); rimR.intensity = 160 * (1 - dim * 0.75); top.intensity = 120 * (1 - dim * 0.9);
  });
  shots.push(shot('s9.1', 82.0, 86.6, set, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(1.2, 0, smooth(u * 1.3)), LOGO.camY, lerp(12.5, LOGO.camZ, smooth(u * 1.3))), v3(lerp(0.6, 0, smooth(u * 1.3)), LOGO.camY, 0), { fov: LOGO.fov, near: 0.1, far: 100 });
    return { focus: d, aperture: lerp(2, 0.4, u) };
  }, { trans: { type: 'burn', dur: 0.9, center: [0.5, 0.5], seed: 3 }, grade: { exposure: 1.15, bloom: 0.75, streak: 0.4, threshold: 1.0, gain: [1.04, 1.0, 0.92] } }));

  // ---------------------------------------------------------------- 9.2 the engraved emblem, one last reflection
  const es = makeSet('studio', { envIntensity: 1.0 }); const E = es.scene;
  const emb = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 128), emblemMaterial()); emb.geometry.rotateY(Math.PI / 2); emb.rotation.x = Math.PI / 2; E.add(emb);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.018, 16, 160), M.goldPolished()); E.add(bezel);
  const sweep = spot(E, { intensity: 0, pos: [-1.5, 0.6, 1.2], target: [0, 0, 0], angle: 0.18, penumbra: 0.7, color: 0xfff0d8 });
  const fill = spot(E, { intensity: 0.6, pos: [0.5, 0.8, 2.0], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffd9a0 });
  es.onUpdate((t) => { const k = clamp((t - 86.9) / 1.9); emb.rotation.set(Math.PI / 2 + lerp(-0.35, 0.25, smooth(clamp((t - 86.6) / 2.6))), lerp(0.2, -0.15, smooth(clamp((t - 86.6) / 2.6))), 0); bezel.rotation.set(emb.rotation.x - Math.PI / 2, emb.rotation.y, 0); sweep.position.set(lerp(-1.6, 1.6, k), lerp(0.7, -0.3, k), 1.2); sweep.intensity = Math.sin(Math.PI * k) * 14; fill.intensity = 0.6 * (1 - smooth(clamp((t - 88.6) / 0.8))); });
  shots.push(shot('s9.2', 86.6, 90.0, es, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.25, 0.08, smooth(u)), lerp(-0.12, -0.05, smooth(u)), lerp(1.7, 1.15, smooth(u))), v3(0.05, 0.0, 0), { fov: 30, near: 0.01, far: 20, roll: lerp(0.05, 0, u) });
    return { focus: d, aperture: 6 };
  }, { trans: { type: 'black', dur: 0.7 }, grade: { exposure: 1.2, bloom: 0.6, streak: 0.35, threshold: 1.1 } }));
  return { shots };
}
