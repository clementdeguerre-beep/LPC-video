// SCENE 6 (50–62s) — THE ROAD. Tyre on wet asphalt, glowing brake disc, gearshift, helmet visor →
// convoy on a Mediterranean coast road at golden hour → vertigo aerial → slow-motion circuit pass.
import { THREE, envOn, makeSet, spot, point, dirLight, shot, M, v3, clamp, smooth, lerp, rng, aim } from './common.js';
import { buildCar } from '../models/car.js';
import { buildCoast, buildCircuit } from '../models/landscape.js';
import { mesh } from '../models/geo.js';
import { asphalt } from '../engine/textures.js';
import { TAU, fbm2 } from '../engine/util.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { useHdri, hdri, HDRI, model, hide, selectVariant, photo } from '../engine/assets.js';

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

// ---------------------------------------------------------------------------------------------- photo-real helpers
/** World direction of a panorama feature at equirect (u, vTop) once the panorama is applied with useHdri(..., { rotation }). */
const panoDir = (u, vTop, rot) => { const phi = (u - 0.5) * TAU - rot; const el = (0.5 - vTop) * Math.PI; return v3(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi)); };
const SPRUIT_SUN = [0.5988, 0.4545]; // the sun in spruit_sunrise (measured on the HDR: 8° above the horizon)
/** Panorama rotation that puts the sun at world azimuth phi = atan2(z, x). */
const rotFor = (phi, u = SPRUIT_SUN[0]) => (u - 0.5) * TAU - phi;

/** HDR sun core + halo (real lens-flare sprite) so the photographic sun blooms like a real one; occluded by geometry. */
function sunSprite(scene, map, dir, { dist = 1500, size = 260, color = 0xffd9a0, intensity = 6 } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
  s.position.copy(dir).multiplyScalar(dist); s.scale.setScalar(size); scene.add(s); return s;
}

/** Soft contact shadow (AO under the body, darker at the tyres) + a long low-sun shadow trailing away from the sun. Car-local, length along +x. */
const carShadowCache = {}; // the AO and long-shadow alpha maps are the same for every car: drawn (and blurred) once
function carShadowMaps() {
  if (carShadowCache.ao) return carShadowCache;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 512, 256); // alphaMap reads the green channel: white = shadow
  x.filter = 'blur(16px)'; x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.roundRect(56, 52, 400, 152, 64); x.fill();
  x.filter = 'blur(6px)'; x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); for (const px of [118, 390]) for (const py of [66, 190]) { x.moveTo(px + 44, py); x.ellipse(px, py, 44, 18, 0, 0, TAU); } x.fill();
  const c2 = document.createElement('canvas'); c2.width = 512; c2.height = 128; const y = c2.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, 512, 128);
  const gr = y.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  y.filter = 'blur(10px)'; y.fillStyle = gr; y.beginPath(); y.roundRect(10, 22, 492, 84, 40); y.fill();
  carShadowCache.ao = new THREE.CanvasTexture(c); carShadowCache.long = new THREE.CanvasTexture(c2); return carShadowCache;
}
function carShadow(L = 4.45, W = 1.95, { sun = null, long = 0, strength = 0.9 } = {}) {
  const g = new THREE.Group(); const maps = carShadowMaps();
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.2, W * 1.35), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: maps.ao, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.006; ao.renderOrder = 2; g.add(ao);
  if (sun && long > 0) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(long, W * 1.1), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: maps.long, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    sh.geometry.translate(long / 2, 0, 0); sh.geometry.rotateX(-Math.PI / 2); sh.position.y = 0.005; sh.renderOrder = 2;
    const piv = new THREE.Group(); piv.rotation.y = -Math.atan2(-sun.z, -sun.x); piv.add(sh); g.add(piv); g.userData.long = piv; // the strip (+x) turned to point away from the sun
  }
  return g;
}

/** Chain-link catch-fence mesh as an alpha texture (one diamond per tile). */
function chainLink() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 32); x.lineTo(32, 0); x.lineTo(64, 32); x.lineTo(32, 64); x.closePath(); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** Per-material IBL strength that keeps the panorama's yaw (an explicit envMap ignores scene.environmentRotation). */
const envK = (mat, scene, k) => { envOn(mat, scene, k); mat.envMapRotation.copy(scene.environmentRotation ?? new THREE.Euler()); return mat; };

/** Weathering maps for galvanised steel, derived from a photograph (the grass photo's grain → zinc spangle, oxide and road grime). */
function dirtMaps(photoTex) {
  const mk = (filter, srgb) => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.filter = filter; x.drawImage(photoTex.image, 0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; };
  return { rough: mk('grayscale(1) contrast(1.1) brightness(1.7)', false), albedo: mk('grayscale(1) contrast(0.8) brightness(1.9)', true) };
}
/** Weathered galvanised steel: a soft sheen, never a light-emitting line (rough, half-metal, dimmed IBL, photo grime). */
function galvanised(scene, dirt, { color = 0x8f9195, k = 0.5, repeat = [1, 1], side = THREE.FrontSide } = {}) {
  const r = dirt.rough.clone(), a = dirt.albedo.clone(); for (const t of [r, a]) { t.repeat.set(...repeat); t.needsUpdate = true; }
  return envK(new THREE.MeshStandardMaterial({ color, map: a, roughness: 0.82, roughnessMap: r, metalness: 0.6, side }), scene, k);
}

/** W-beam cross-section (depth, height) in metres. */
const wBeam = [[0, -0.155], [0.018, -0.135], [0.07, -0.095], [0.074, -0.05], [0.03, -0.012], [0.03, 0.012], [0.074, 0.05], [0.07, 0.095], [0.018, 0.135], [0, 0.155]];

/** Galvanised double W-beam Armco on posts, catch-fence posts and mesh: the circuit's real trackside furniture. */
function trackside(scene, fenceTex, dirt, { z = -11.4, len = 400 } = {}) {
  const g = new THREE.Group();
  const pos = [], uv = [], idx = []; wBeam.forEach(([dz, dy], i) => { pos.push(-len / 2, dy, -dz, len / 2, dy, -dz); uv.push(0, i / 9, len / 2.5, i / 9); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const beam = new THREE.BufferGeometry(); beam.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); beam.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); beam.setIndex(idx); beam.computeVertexNormals();
  const steel = galvanised(scene, dirt, { color: 0x8a8c90, side: THREE.DoubleSide });
  for (const yy of [0.5, 0.86]) { const b = new THREE.Mesh(beam, steel); b.position.set(0, yy, z); g.add(b); }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.0, 0.12), galvanised(scene, dirt, { color: 0x55575a, k: 0.4, repeat: [0.2, 0.6] }), 200); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 200; i++) { m4.makeTranslation(-len / 2 + i * 2, 0.5, z - 0.16); posts.setMatrixAt(i, m4); } g.add(posts);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 3.6, 8), galvanised(scene, dirt, { color: 0x3a3b3d, k: 0.4, repeat: [0.2, 1] }), 80);
  for (let i = 0; i < 80; i++) { m4.makeTranslation(-len / 2 + i * 5, 1.8, z - 0.9); poles.setMatrixAt(i, m4); } g.add(poles);
  const ft = fenceTex.clone(); ft.repeat.set(len / 0.11, 3.4 / 0.11); ft.needsUpdate = true;
  const fence = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.4), envK(new THREE.MeshStandardMaterial({ color: 0x8a8c90, metalness: 0.6, roughness: 0.6, alphaMap: ft, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), scene, 0.5));
  fence.position.set(0, 1.75, z - 0.92); g.add(fence);
  return g;
}

const VENICE_SUN = [0.5993, 0.4804]; // the sun in venice_sunset (3.5° above the sea horizon)

/** Inject world-space photo detail + a baked sun-shadow map into a standard material (direct sun only is shadowed).
 *  Triplanar: the photo is projected along x, y and z and blended by pow(|normal|, 4), so it never smears on steep cuts.
 *  rock: ground steeper than ~35° turns to pale limestone (strata and cracks driven by the same photo grain); rockAll: all rock. */
function photoGround(mat, { grass = null, detail = 0.85, scaleA = 0.09, scaleB = 0.0137, shadow = null, box = [-350, -350, 700, 700], rock = 0, rockAll = false, contrast = 1 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: grass }; sh.uniforms.tShadow = { value: shadow }; sh.uniforms.sBox = { value: new THREE.Vector4(...box) }; sh.uniforms.detail = { value: detail };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        #endif
        vWP = (modelMatrix * wp).xyz; vWN = inverseTransformDirection(transformedNormal, viewMatrix); }`);
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; varying vec3 vWN; uniform sampler2D tGrass; uniform sampler2D tShadow; uniform vec4 sBox; uniform float detail;
      vec3 triP(float s, float off, float bias, vec3 w) { return texture2D(tGrass, vWP.zy * s + off, bias).rgb * w.x + texture2D(tGrass, vWP.xz * s + off, bias).rgb * w.y + texture2D(tGrass, vWP.xy * s + off, bias).rgb * w.z; }`);
    if (grass) f = f.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 n = normalize(vWN); vec3 w = pow(abs(n), vec3(4.0)); w /= dot(w, vec3(1.0)); const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
        vec3 a = triP(${scaleA.toFixed(4)}, 0.0, 0.0, w), b = texture2D(tGrass, vWP.xz * ${scaleB.toFixed(4)} + 0.37, 1.5).rgb, c = texture2D(tGrass, vWP.xz * 0.0021 + 0.71, 3.0).rgb; // fine layer triplanar; the soft macro layers are too large to smear
        float la = pow(dot(a, LW) / 0.15, ${contrast.toFixed(2)}), lb = dot(b, LW) / 0.15, lc = dot(c, LW) / 0.15; // contrast > 1: leaf clusters and gaps
        vec3 ground = diffuseColor.rgb * mix(1.0, clamp(la * (0.55 + 0.45 * lb) * (0.7 + 0.3 * lc), 0.25, 2.2), detail);
        float steep = ${rockAll ? '1.0' : 'smoothstep(0.84, 0.74, n.y)'} * ${(+rock).toFixed(2)}; // cos 33° → cos 42°
        if (steep > 0.0) { float strata = 0.5 + 0.5 * sin(vWP.y * 2.3 + lb * 1.7 + lc * 2.6); float crack = smoothstep(0.25, 0.85, la);
          vec3 lime = mix(vec3(0.34, 0.31, 0.26), diffuseColor.rgb, 0.25) * (0.78 + 0.22 * strata) * mix(0.45, 1.05, crack) * clamp(0.8 + 0.25 * lb, 0.7, 1.25);
          ground = mix(ground, lime, steep); }
        diffuseColor.rgb = ground; }`);
    if (shadow) f = f.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float sh = texture2D(tShadow, (vWP.xz - sBox.xy) / sBox.zw).r; reflectedLight.directDiffuse *= sh; reflectedLight.directSpecular *= sh; reflectedLight.indirectDiffuse *= mix(0.6, 1.0, sh); }`);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `pg${!!grass}${!!shadow}${scaleA}${scaleB}${rock}${rockAll}${contrast}`; mat.needsUpdate = true; return mat;
}

/** Smooth lumpy blob: an icosphere welded (smooth normals) and displaced by low-frequency noise; flattened underneath.
 *  hf adds a high-frequency, leafy bumpiness; the displacement also bakes a cavity AO into the vertex colours. */
function lump(r, detail, rad, { top = 1, bottom = 0.7, amp = 0.2, hf = 0 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position; const ph = r() * 20, q = r.range(2.4, 3.4); const col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const lo = amp * Math.sin(x * q + ph) * Math.sin(y * 2.7 + ph * 1.3) * Math.sin(z * q + ph * 0.7) + amp * 0.5 * Math.sin(x * 6.3 + z * 5.1 + y * 2 + ph);
    const hi = hf * (Math.sin(x * 13.1 + ph * 2) * Math.sin(y * 11.7 - ph) * Math.sin(z * 12.3 + ph * 0.4) + 0.55 * Math.sin(x * 23.0 + y * 19.0 - z * 21.0 + ph * 3));
    const n = 1 + lo + hi; p.setXYZ(k, x * rad * n, y * rad * n * (y > 0 ? top : bottom), z * rad * n);
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = clamp(0.8 + 1.1 * lo + (hf ? 2.2 * hi : 0), 0.3, 1.05);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
/** Vertex ambient occlusion by height (multiplied into the cavity AO): undersides and the core of a crown read darker, like real foliage. */
function heightAO(g, y0, y1, lo = 0.35) { const P = g.attributes.position, C = g.attributes.color; for (let k = 0; k < P.count; k++) { const v = lerp(lo, 1, smooth((P.getY(k) - y0) / (y1 - y0))); C.setXYZ(k, C.getX(k) * v, C.getY(k) * v, C.getZ(k) * v); } return g; }

/** Umbrella-pine canopy: a flat-topped mass of needle clusters (bumpy, cavity-shaded clumps) centred like buildCoast's pine top (y ≈ 6.5). */
function pineCrown(seed = 5) {
  const r = rng(seed); const parts = [];
  for (let i = 0; i < 12; i++) {
    const a = r() * TAU, d = i === 0 ? 0 : r.range(0.7, 2.6); const g = lump(r, 2, r.range(0.85, 1.3), { top: 0.55, bottom: 0.36, amp: 0.2, hf: 0.07 });
    g.translate(Math.cos(a) * d, 6.6 + r.range(-0.25, 0.35) - d * 0.13, Math.sin(a) * d); parts.push(g);
  }
  const m = mergeGeometries(parts, false); m.computeVertexNormals(); return heightAO(m, 5.7, 7.3, 0.35);
}
/** Umbrella-pine trunk: tall, slightly leaning, forking into three limbs under the crown. */
function pineTrunk() {
  const t = new THREE.CylinderGeometry(0.17, 0.3, 5.0, 10, 4); t.translate(0, 2.5, 0); const p = t.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setX(k, p.getX(k) + 0.04 * y * y * 0.1); }
  const parts = [t]; for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.4; const b = new THREE.CylinderGeometry(0.07, 0.15, 1.9, 7); b.translate(0, 0.95, 0); b.rotateZ(0.65); b.rotateY(a); b.translate(0.1, 4.6, 0); parts.push(b); }
  const m = mergeGeometries(parts.map((g) => g.toNonIndexed()), false); m.computeVertexNormals(); return m;
}
/** Italian cypress: a short visible trunk, a rounded base, a full flame-shaped body and a soft tip; lumpy, darker inside. */
function cypressGeo() {
  const prof = [[0, 0], [0.12, 0], [0.11, 0.3], [0.1, 0.6], [0.36, 0.64], [0.64, 0.8], [0.85, 1.12], [0.97, 1.65], [1.02, 2.4], [0.98, 3.4], [0.88, 4.5], [0.73, 5.6], [0.55, 6.7], [0.36, 7.7], [0.19, 8.5], [0.07, 9.05], [0, 9.2]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 18); const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k); if (y < 0.62) continue; const a = Math.atan2(z, x); const n = 1 + 0.09 * Math.sin(5 * a + y * 1.9) * Math.sin(y * 2.3) + 0.05 * Math.sin(11 * a - y * 3.7); p.setX(k, x * n); p.setZ(k, z * n); }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), bark = new THREE.Color(0x4a3628), leaf = new THREE.Color(0x34452a);
  for (let k = 0; k < p.count; k++) { const y = p.getY(k); const c = y < 0.62 ? bark : leaf; const ao = y < 0.62 ? 1 : lerp(0.45, 1, smooth((y - 0.6) / 2.2)); col[k * 3] = c.r * ao; col[k * 3 + 1] = c.g * ao; col[k * 3 + 2] = c.b * ao; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
/** Maquis shrub (lentisk / myrtle): a few welded smooth lumps, flat-bottomed, sitting on y = 0. */
function shrubGeo(seed) {
  const r = rng(seed); const parts = [];
  for (let i = 0; i < 4; i++) { const rad = r.range(0.4, 0.72); const g = lump(r, 2, rad, { top: 0.8, bottom: 0.35, amp: 0.18, hf: 0.08 }); g.translate(r.range(-0.6, 0.6), rad * 0.42, r.range(-0.6, 0.6)); parts.push(g); }
  const m = mergeGeometries(parts, false); m.computeVertexNormals(); return heightAO(m, 0, 1.0, 0.45);
}
/** Limestone boulder: a lumpy, flattened, faceted-by-weather stone. */
function rockGeo(seed) { const r = rng(seed); const g = lump(r, 1, 1, { top: 0.62, bottom: 0.5, amp: 0.3 }); g.deleteAttribute('color'); g.computeVertexNormals(); return g; }

/** Re-dress buildCoast(): Mediterranean ground colours with triplanar photo detail and limestone cuts, baked long shadows,
 *  photo-normal sea, smooth umbrella pines and cypresses, maquis shrubs and boulders for scale, galvanised Armco. */
function dressCoast(coast, { scene, sunDir, grass, water, dirt }) {
  const { road, roadY, N } = coast.userData; const [terrain, roadMesh, posts, trunks, tops, cyp, sea] = coast.children;
  // --- terrain colours: dry golden grass / olive maquis / limestone on steep ground / sand at the shore
  const geo = terrain.geometry; const P = geo.attributes.position, Nn = geo.attributes.normal, Col = geo.attributes.color;
  const dry = new THREE.Color(0x8c7444), straw = new THREE.Color(0xa48a52), maquis = new THREE.Color(0x3c4524), rock = new THREE.Color(0x9a8f7e), sand = new THREE.Color(0xc2ab82), verge = new THREE.Color(0x7d6a4c), tmp = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const slope = 1 - Nn.getY(i);
    const n1 = fbm2(x * 0.018 + 11, z * 0.018 - 7, 4, 31), n2 = fbm2(x * 0.09, z * 0.09, 3, 37);
    tmp.copy(dry).lerp(straw, smooth(n2 * 1.8 - 0.4)).lerp(maquis, smooth((n1 - 0.42) * 4.5) * 0.85);
    tmp.lerp(rock, smooth((slope - 0.22) / 0.25) * 0.9); tmp.lerp(sand, smooth((2.6 - y) / 1.6));
    Col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  Col.needsUpdate = true;
  // --- baked sun shadows (terrain self-shadow + long pine shadows) into a 1024² ground map
  const SEG = Math.round(Math.sqrt(P.count)) - 1, SIZE = 700, half = SIZE / 2, cell = SIZE / SEG;
  const H = (x, z) => { const fx = clamp((x + half) / cell, 0, SEG - 1e-3), fz = clamp((z + half) / cell, 0, SEG - 1e-3); const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz; const at = (a, b) => P.getY(b * (SEG + 1) + a); return lerp(lerp(at(ix, iz), at(ix + 1, iz), tx), lerp(at(ix, iz + 1), at(ix + 1, iz + 1), tx), tz); };
  const RES = 1024, SR = 384; const cv = document.createElement('canvas'); cv.width = cv.height = RES; const c2 = cv.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, RES, RES);
  const shadowTex = new THREE.CanvasTexture(cv); shadowTex.colorSpace = THREE.NoColorSpace; shadowTex.flipY = false; shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping; // drawn below, uploaded at first render
  const sd = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize(); const tanE = sunDir.y / Math.hypot(sunDir.x, sunDir.z);
  const small = document.createElement('canvas'); small.width = small.height = SR; const sc = small.getContext('2d'); const img = sc.createImageData(SR, SR);
  for (let j = 0; j < SR; j++) for (let i = 0; i < SR; i++) {
    const x = -half + (i + 0.5) * SIZE / SR, z = -half + (j + 0.5) * SIZE / SR; const h0 = H(x, z) + 0.4; let lit = 1, d = 1.5;
    while (d < 260) { const hh = H(x + sd.x * d, z + sd.z * d); const ry = h0 + d * tanE; if (hh > ry) { lit = Math.max(0, lit - clamp((hh - ry) / 3) ); if (lit <= 0) break; } d *= 1.07; d += 0.6; }
    const v = Math.round(lerp(0.22, 1, lit) * 255); const o = (j * SR + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  sc.putImageData(img, 0, 0); c2.filter = 'blur(2px)'; c2.drawImage(small, 0, 0, RES, RES); c2.filter = 'none';
  const px = (x) => ((x + half) / SIZE) * RES; const m4 = new THREE.Matrix4(), pp = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
  // --- maquis shrubs and limestone boulders in clumps around the filmed stretch (scale cues for 6.5 and the aerial)
  const g1 = grass.clone(); g1.wrapS = g1.wrapT = THREE.RepeatWrapping; g1.needsUpdate = true;
  const rp = road.getSpacedPoints(400), seaY = sea.position.y; const roadDist = (x, z) => { let b = 1e9; for (const q of rp) { const dx = q.x - x, dz = q.z - z; const d = dx * dx + dz * dz; if (d < b) b = d; } return Math.sqrt(b); };
  const rs = rng(61), tv = new THREE.Vector3(), sv = new THREE.Vector3(), eu = new THREE.Euler();
  const scatter = (mesh, n, { dMin, dMax, sMin, sMax, sink, per, spread }) => { let i = 0;
    for (let k = 0; k < n * 6 && i < n; k++) {
      const u = rs.range(0.0, 0.26); const p = road.getPointAt(u); road.getTangentAt(u, tv); sv.set(-tv.z, 0, tv.x).normalize(); const d = (rs() < 0.45 ? 1 : -1) * rs.range(dMin, dMax);
      const cx = p.x + sv.x * d, cz = p.z + sv.z * d; const m = 1 + Math.floor(rs() * per);
      for (let j = 0; j < m && i < n; j++) { const x = cx + rs.range(-spread, spread), z = cz + rs.range(-spread, spread); if (roadDist(x, z) < 6.6) continue; const y = H(x, z); if (y < seaY + 1.4) continue;
        const sc = rs.range(sMin, sMax); eu.set(rs.range(-0.08, 0.08), rs() * TAU, rs.range(-0.08, 0.08)); qq.setFromEuler(eu); m4.compose(pp.set(x, y - sink * sc, z), qq, ss.set(sc * rs.range(0.8, 1.3), sc * rs.range(0.75, 1.1), sc * rs.range(0.8, 1.3))); mesh.setMatrixAt(i++, m4); }
    }
    mesh.count = i; mesh.instanceMatrix.needsUpdate = true; return mesh; };
  const shrubs = scatter(new THREE.InstancedMesh(shrubGeo(5), photoGround(new THREE.MeshStandardMaterial({ color: 0x5d6a3c, vertexColors: true, roughness: 0.9 }), { grass: g1, detail: 1, scaleA: 0.33, scaleB: 0.085, shadow: shadowTex, contrast: 1.8 }), 900), 900, { dMin: 7, dMax: 85, sMin: 0.8, sMax: 1.9, sink: 0.12, per: 6, spread: 4 });
  { const rt = rng(77), tints = [0xc4c8a8, 0xa9b383, 0xd6cc98, 0x9aa47c, 0xc9cab6]; const cc = new THREE.Color(); for (let i = 0; i < shrubs.count; i++) shrubs.setColorAt(i, cc.set(tints[Math.floor(rt() * tints.length)]).multiplyScalar(rt.range(0.85, 1.15))); } // lentisk, myrtle, broom, rosemary: grey-greens and olive
  const rocks = scatter(new THREE.InstancedMesh(rockGeo(8), photoGround(new THREE.MeshStandardMaterial({ color: 0xb0a590, roughness: 0.88 }), { grass: g1, scaleA: 0.45, scaleB: 0.12, rock: 1, rockAll: true, shadow: shadowTex }), 260), 260, { dMin: 8, dMax: 80, sMin: 0.35, sMax: 1.3, sink: 0.3, per: 4, spread: 3 });
  coast.add(shrubs, rocks);
  // long cast shadows of pines, cypresses, shrubs and boulders: hard ellipses on their own layer ('darken': overlapping shadows
  // do not compound), then softened by ONE blur and multiplied onto the terrain map (a blur per stamp costs minutes in software GL)
  const st = document.createElement('canvas'); st.width = st.height = RES; const s2 = st.getContext('2d'); s2.fillStyle = '#fff'; s2.fillRect(0, 0, RES, RES); s2.globalCompositeOperation = 'darken'; s2.fillStyle = 'rgb(70,70,70)';
  const stamp = (mesh, top, rad) => { for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); m4.decompose(pp, qq, ss); const L = (top * ss.y) / tanE; const cx = pp.x + sd.x * (L * 0.5 + 1), cz = pp.z + sd.z * (L * 0.5 + 1);
    s2.save(); s2.translate(px(cx), px(cz)); s2.rotate(Math.atan2(sd.z, sd.x)); s2.beginPath(); s2.ellipse(0, 0, (L * 0.5 + rad * ss.x) / SIZE * RES, (rad * ss.x) / SIZE * RES, 0, 0, TAU); s2.fill(); s2.restore(); } };
  stamp(tops, 6.2, 2.6); stamp(cyp, 8.0, 1.0); stamp(shrubs, 1.0, 0.9); stamp(rocks, 0.6, 0.9);
  c2.globalCompositeOperation = 'multiply'; c2.filter = 'blur(3px)'; c2.drawImage(st, 0, 0); c2.globalCompositeOperation = 'source-over'; c2.filter = 'none';
  terrain.material = photoGround(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }), { grass: g1, shadow: shadowTex, rock: 1 });
  { const ix = roadMesh.geometry.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } roadMesh.geometry.computeVertexNormals(); } // the ribbon was wound face-down (culled from above)
  roadMesh.material = photoGround(roadMesh.material.clone(), { shadow: shadowTex }); roadMesh.material.roughness = 0.62;
  // --- pines: smooth clumped umbrella crowns on forked trunks, cypresses on short trunks; photo needle grain (triplanar, per instance)
  tops.geometry = pineCrown(9); tops.material = photoGround(new THREE.MeshStandardMaterial({ color: 0x55663a, vertexColors: true, roughness: 0.9 }), { grass: g1, detail: 1, scaleA: 0.33, scaleB: 0.085, contrast: 1.8 });
  cyp.geometry = cypressGeo(); cyp.material = photoGround(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }), { grass: g1, detail: 1, scaleA: 0.33, scaleB: 0.085, contrast: 1.8 });
  trunks.geometry = pineTrunk(); trunks.material = new THREE.MeshStandardMaterial({ color: 0x4a3628, roughness: 0.95 });
  // --- Armco along the sea-side edge (posts kept, galvanised)
  posts.material = galvanised(scene, dirt, { color: 0x55575a, k: 0.4, repeat: [0.2, 0.6] }); posts.scale.y = 1;
  const K = 1600, W = 3.6 + 1.05; const pos = [], uv = [], idx = []; const t = new THREE.Vector3(), side = new THREE.Vector3(); const RL = road.getLength();
  for (let k = 0; k <= K; k++) { const u = k / K; const p = road.getPointAt(u); road.getTangentAt(u, t); side.set(-t.z, 0, t.x).normalize(); const yb = roadY[Math.round(u * N)] + 0.62;
    wBeam.forEach(([dz, dy], j) => { const q = p.clone().addScaledVector(side, W + dz); pos.push(q.x, yb + dy, q.z); uv.push((u * RL) / 2.5, j / 9); }); }
  const NP = wBeam.length; for (let k = 0; k < K; k++) for (let j = 0; j < NP - 1; j++) { const a = k * NP + j, b = a + NP; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
  coast.add(new THREE.Mesh(rg, galvanised(scene, dirt, { color: 0x8f9195, side: THREE.DoubleSide })));
  // --- sea: two scales of photographed wave normals, drifting; reflects the real sunset sky
  const w1 = water.clone(), w2 = water.clone(); w1.wrapS = w1.wrapT = w2.wrapS = w2.wrapT = THREE.RepeatWrapping; w1.repeat.set(160, 160); w2.repeat.set(700, 700); w1.needsUpdate = w2.needsUpdate = true;
  sea.material = new THREE.MeshPhysicalMaterial({ color: 0x041821, roughness: 0.12, metalness: 0, normalMap: w1, normalScale: new THREE.Vector2(0.55, 0.55), clearcoat: 1, clearcoatRoughness: 0.02, clearcoatNormalMap: w2, clearcoatNormalScale: new THREE.Vector2(0.45, 0.45), specularIntensity: 1 });
  envK(sea.material, scene, 0.7);
  // --- distance to the shore (chamfer transform of the land mask): turquoise shallows, a sandy wash and a broken surf line, deep navy offshore
  const DR = 256, cellD = SIZE / DR, dist = new Float32Array(DR * DR);
  for (let j = 0; j < DR; j++) for (let i = 0; i < DR; i++) dist[j * DR + i] = H(-half + (i + 0.5) * cellD, -half + (j + 0.5) * cellD) > seaY ? 0 : 1e6;
  const relax = (k, n, w) => { if (dist[n] + w < dist[k]) dist[k] = dist[n] + w; };
  for (let j = 0; j < DR; j++) for (let i = 0; i < DR; i++) { const k = j * DR + i; if (i) relax(k, k - 1, 1); if (j) { relax(k, k - DR, 1); if (i) relax(k, k - DR - 1, 1.414); if (i < DR - 1) relax(k, k - DR + 1, 1.414); } }
  for (let j = DR - 1; j >= 0; j--) for (let i = DR - 1; i >= 0; i--) { const k = j * DR + i; if (i < DR - 1) relax(k, k + 1, 1); if (j < DR - 1) { relax(k, k + DR, 1); if (i < DR - 1) relax(k, k + DR + 1, 1.414); if (i) relax(k, k + DR - 1, 1.414); } }
  const dep = new Uint8Array(DR * DR * 4); for (let k = 0; k < DR * DR; k++) { const v = Math.round(clamp((dist[k] * cellD) / 80) * 255); dep[k * 4] = dep[k * 4 + 1] = dep[k * 4 + 2] = v; dep[k * 4 + 3] = 255; }
  const depthTex = new THREE.DataTexture(dep, DR, DR); depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
  sea.material.onBeforeCompile = (sh) => {
    sh.uniforms.tDepth = { value: depthTex }; sh.uniforms.sBox = { value: new THREE.Vector4(-half, -half, SIZE, SIZE) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D tDepth; uniform vec4 sBox;').replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 q = (vWP.xz - sBox.xy) / sBox.zw; float d = (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) ? 80. : texture2D(tDepth, q).r * 80.; // metres to the shore
        float wv = texture2D(normalMap, vNormalMapUv * 2.3).g;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.14, 0.135), exp(-d / 22.) * 0.9); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.33, 0.25), smoothstep(6., 0., d) * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.78, 0.72), smoothstep(7., 1.5, d) * smoothstep(0.45, 0.72, wv) * 0.7); } // broken surf line`)
      // the sun's glitter on the water comes from the panorama (where its sun really is); the key light's mirror glint would be a second,
      // misplaced sun blooming into a white disc
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directSpecular = vec3(0.); clearcoatSpecularDirect = vec3(0.);');
  };
  sea.material.customProgramCacheKey = () => 'seaDepth';
  return { shadowTex, H, update(tt) { w1.offset.set(tt * 0.0011, tt * 0.0007); w2.offset.set(-tt * 0.0016, tt * 0.0012); } };
}

/** CarConcept's sidewall relief embosses third-party lettering (KHRONOS, 3DCommerce, DOT, TREADWEAR…). Rebuild it as a pure
 *  ring profile: for every radius, the median radial slope of the original (lettering covers a minority of each circle). */
function cleanSidewall(src) {
  const img = src.image, W = img.width, Hh = img.height; const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); const id = x.getImageData(0, 0, W, Hh), d = id.data;
  const cx = (W - 1) / 2, cy = (Hh - 1) / 2, NB = Math.ceil(Math.hypot(cx, cy)) + 2; const bins = Array.from({ length: NB }, () => []);
  for (let j = 0; j < Hh; j += 2) for (let i = 0; i < W; i += 2) { const o = (j * W + i) * 4, dx = i - cx, dy = cy - j, r = Math.hypot(dx, dy) + 1e-6; bins[Math.round(r)].push(((d[o] / 127.5 - 1) * dx + (d[o + 1] / 127.5 - 1) * dy) / r); } // tangent space: +x right, +y up
  const prof = bins.map((b) => { if (!b.length) return 0; b.sort((p, q) => p - q); return b[b.length >> 1]; });
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const o = (j * W + i) * 4, dx = i - cx, dy = cy - j, r = Math.hypot(dx, dy) + 1e-6, k = Math.floor(r); const nr = lerp(prof[k], prof[k + 1], r - k);
    d[o] = (nr * dx / r * 0.5 + 0.5) * 255; d[o + 1] = (nr * dy / r * 0.5 + 0.5) * 255; d[o + 2] = (Math.sqrt(Math.max(0, 1 - nr * nr)) * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = src.flipY; t.colorSpace = THREE.NoColorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.channel = src.channel; t.anisotropy = 8; return t;
}

/** Photoreal racer: Khronos CarConcept in Torched Graphite, cleaned for the brief (no logos, marks, lettering or display),
 *  gloss clear-coat, champagne-gold calipers, burgundy trim, cheap dark glass; length along +x; wheels track straight,
 *  spin on their own hubs, and the tyres sit on y = 0 with a few millimetres of contact patch. */
async function conceptRacer({ length = 4.45, paint = null } = {}) {
  const m = await model('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Graphite');
  const done = new Map(); const lamps = { head: [], brake: [] }; let side = null;
  const fix = (mat) => {
    if (done.has(mat)) return done.get(mat); const n = mat.name || ''; const c = mat.clone();
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); } // Khronos marks live in emissive maps (rims, calipers, mirrors, hardware)
    if (/Tireside/i.test(n)) { c.map = null; c.color.set(0x161616); c.roughness = 0.62; if (c.normalMap) c.normalMap = side ??= cleanSidewall(c.normalMap); } // printed KHRONOS / 3DCommerce marks + embossed lettering removed
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.6; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; }
    if (/Paint 1/i.test(n)) { if (paint !== null) c.color.set(paint); c.clearcoat = 1; c.clearcoatRoughness = 0.03; }
    if (/Paint 2/i.test(n)) { c.iridescence = 0; c.clearcoat = 1; c.clearcoatRoughness = 0.04; }
    if (/Interior 3/i.test(n)) c.color.set(0x3d0b12);
    if (/^Brake$/i.test(n)) { c.color.set(0xcdb48a); c.metalness = 0.9; c.roughness = 0.3; }
    if (/Dashboard/i.test(n)) { c.emissive?.set(0x000000); }
    if (/Headlight/i.test(n)) { c.emissive = new THREE.Color(0xfff0dc); lamps.head.push(c); }
    if (/Brakelight/i.test(n)) { c.emissive = new THREE.Color(0xff1a0c); lamps.brake.push(c); }
    if (/Tiretread/i.test(n)) { c.roughness = 0.86; c.normalScale?.multiplyScalar(0.6); } // rubber, not a string of glints along the shoulder
    if (/Paint/i.test(n)) c.side = THREE.FrontSide; // inner faces get a black shell below
    done.set(mat, c); return c;
  };
  m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material); });
  // panel shut lines: the double-sided paint let the low sun light the INSIDE of the panels through every gap (dotted bright
  // seams). Paint renders front faces only; a black back-face shell on the same geometry closes each gap like a real flange.
  const shell = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }); const painted = [];
  m.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && /Paint/i.test(o.material.name)) painted.push(o); });
  for (const o of painted) { const s = new THREE.Mesh(o.geometry, shell); s.name = `${o.name}Shell`; o.add(s); }
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorCage)/); // never seen through the dark glass; the floor and under-bonnet panels stay: they close the shut lines
  // The glTF wheel nodes carry rotations: the rears a spin phase about the axle, the fronts also 30° of steering lock
  // (axle (0.866, -0.5, 0) in the body frame). Yaw every axle back onto the body's +x so all four wheels track straight.
  const wheels = []; m.traverse((o) => { if (/^Wheel(Front|Rear)[LR]$/.test(o.name)) wheels.push(o); });
  for (const w of wheels) { const ax = v3(1, 0, 0).applyQuaternion(w.quaternion); w.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(ax, v3(1, 0, 0))); }
  // wheel pivots: re-centre each wheel's parts on its own hub so it can spin about the axle (calipers / pads stay fixed)
  let radius = 0.35;
  const pivots = wheels.map((w) => {
    w.updateMatrixWorld(true); const inv = w.matrixWorld.clone().invert(); const box = new THREE.Box3(); const tmp = new THREE.Box3();
    w.traverse((o) => { if (!o.isMesh || /BrakePad/.test(o.name)) return; o.geometry.computeBoundingBox(); box.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(inv.clone().multiply(o.matrixWorld))); });
    const ctr = box.getCenter(new THREE.Vector3()); radius = (box.max.y - box.min.y) / 2; const pv = new THREE.Group(); pv.position.copy(ctr);
    for (const c of [...w.children]) if (!/BrakePad/.test(c.name)) { pv.add(c); c.position.sub(ctr); }
    w.add(pv); return pv;
  });
  const scale = m.children[0].scale.x; m.rotation.y = Math.PI / 2; // model length is +z (nose forward) → the film's +x convention
  const group = new THREE.Group(); group.add(m);
  // ground on the real tyre contact (model() grounds on loose rotated boxes, ~14 cm too high): lowest hub minus the tyre radius
  group.updateMatrixWorld(true); const hub = new THREE.Vector3(); let low = Infinity; for (const p of pivots) low = Math.min(low, p.getWorldPosition(hub).y - radius * scale);
  m.position.y -= low + 0.006; // tyres squash ~6 mm into the asphalt: a contact patch, not a kiss
  return {
    group, model: m, radius: radius * scale,
    spin(a) { for (const p of pivots) p.rotation.x = a; },
    lights(f = 1, r = 1) { for (const c of lamps.head) c.emissiveIntensity = f * 6; for (const c of lamps.brake) c.emissiveIntensity = r * 4; },
  };
}

/** Photographic backdrop: the 4K panorama sampled directly on a far dome (same orientation convention as useHdri's rotation).
 *  Avoids the PMREM / cube conversion of a 4K image (minutes in software GL); the DOF defocuses it like a real lens.
 *  warm: golden-hour grade of the sky (luminance kept, blue turned to amber haze, strongest away from the sun disc). */
function panoDome(tex, { rotation = 0, intensity = 1, radius = 1800, warm = 0, lift = 0, sun = v3(1, 0, 0) } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, rot: { value: rotation }, k: { value: intensity }, warm: { value: warm }, lift: { value: lift }, sunD: { value: sun.clone().normalize() } }, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform sampler2D map; uniform float rot, k, warm, lift; uniform vec3 sunD; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float u = (atan(d.z, d.x) + rot) * 0.15915494 + 0.5, v = asin(clamp(d.y, -1., 1.)) * 0.31830989 + 0.5;
        float u1 = fract(u), u2 = fract(u + 0.5) - 0.5; u = fwidth(u1) <= fwidth(u2) + 1e-5 ? u1 : u2; // no mip seam where atan wraps
        float toSun = max(dot(d, sunD), 0.), sky = smoothstep(-0.03, 0.06, d.y);
        vec3 c = texture2D(map, vec2(u, v)).rgb * k * (1. + lift * sky * (1. - toSun)); // the anti-sun sky lifted toward a bright afterglow
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 amber = l * mix(vec3(1.32, 0.95, 0.6), vec3(1.5, 0.9, 0.45), smoothstep(0.25, 0., d.y)) * (1. + 0.35 * pow(toSun, 3.)); // deeper amber toward the horizon and the sun
        c = mix(c, amber, warm * sky * (1. - smoothstep(0.97, 0.999, toSun))); // the sun disc itself keeps its own colour
        gl_FragColor = vec4(c, 1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat); m.renderOrder = -100; m.frustumCulled = false; return m;
}

/** Hot cast-iron brake disc (6.2): turned-and-ground faces (photo grain wrapped round the disc → concentric machining marks
 *  in albedo and roughness), three staggered rows of cross-drilled holes (cut through, with a dark chamfer), a darker hat, and a
 *  heat ramp: deep red at the rim, orange across the swept band, yellow only in its core. Geometry: buildCar's disc (axis = local y). */
function hotDisc(dR, grain) {
  const u = { heat: { value: 0 }, dR: { value: dR }, tGrain: { value: grain } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x5e5d5c, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLP; uniform float heat, dR; uniform sampler2D tGrain; float dRr, dAng, dHole, dGrain;
      vec3 heatRamp(float t) { t = clamp(t, 0., 1.); vec3 c = mix(vec3(0.), vec3(0.32, 0.012, 0.0), smoothstep(0.0, 0.4, t)); c = mix(c, vec3(1.05, 0.16, 0.012), smoothstep(0.35, 0.68, t)); c = mix(c, vec3(1.7, 0.62, 0.08), smoothstep(0.62, 0.86, t)); return mix(c, vec3(2.3, 1.35, 0.32), smoothstep(0.86, 1.0, t)); }`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      dRr = length(vLP.xz) / dR; dAng = atan(vLP.z, vLP.x); dHole = 1e3;
      { float da = dFdx(dAng), db = dFdy(dAng); da -= 6.2831853 * floor(da / 6.2831853 + 0.5); db -= 6.2831853 * floor(db / 6.2831853 + 0.5); // seam-free gradients across atan's wrap
        vec2 g = vec2(dAng * 0.31830989, dRr * 28.); dGrain = dot(textureGrad(tGrain, g, vec2(da * 0.31830989, dFdx(dRr) * 28.), vec2(db * 0.31830989, dFdy(dRr) * 28.)).rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.15; }
      for (int k = 0; k < 3; k++) { float rk = 0.71 + float(k) * 0.093, a0 = float(k) * 0.116; float ac = (floor((dAng - a0) * 18. / 6.2831853) + 0.5) * 6.2831853 / 18. + a0; dHole = min(dHole, length(vLP.xz / dR - vec2(cos(ac), sin(ac)) * rk)); }
      bool face = abs(vLP.y) > 0.0115;
      if (face && dHole < 0.03) discard; // drilled through: you see the far side of the hole and the dark beyond`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      { float hat = 1. - smoothstep(0.53, 0.56, dRr); float chamfer = face ? 1. - smoothstep(0.03, 0.045, dHole) : 0.;
        diffuseColor.rgb *= mix(0.78 + 0.32 * clamp(dGrain, 0., 2.), 0.45, hat) * (1. - 0.75 * chamfer); }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor * (0.55 + 0.4 * clamp(dGrain, 0., 2.)) + 0.25 * (1. - smoothstep(0.53, 0.56, dRr)), 0.12, 1.);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float band = smoothstep(0.5, 0.6, dRr); float core = exp(-pow((dRr - 0.8) / 0.11, 2.)); float rim = smoothstep(0.9, 1.0, dRr);
        float T = heat * band * (0.42 + 0.58 * core - 0.08 * rim) * (0.9 + 0.12 * clamp(dGrain, 0., 2.));
        if (!face) T = heat * 0.5 * band; // the outer edge: deep red
        totalEmissiveRadiance += heatRamp(T) * 1.3; }`);
  };
  mat.customProgramCacheKey = () => 'hotDisc'; return { mat, u };
}

/** Floating brake caliper (6.2): an arc-shaped monobloc body straddling the disc at radius 0.66–1.1·dR, champagne-gold paint. */
function caliperGeo(dR, span = 0.95) {
  const s = new THREE.Shape(); const r0 = dR * 0.66, r1 = dR * 1.1; s.absarc(0, 0, r1, -span / 2, span / 2, false); s.absarc(0, 0, r0, span / 2, -span / 2, true); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.009, bevelThickness: 0.009, bevelSegments: 3, curveSegments: 24 }); g.translate(0, 0, -0.035); return g;
}

export async function buildS6(ctx) {
  const shots = [];
  const [flare0, grassPhoto, waterN] = await Promise.all([photo('textures/lensflare/lensflare0.png'), photo('textures/terrain/grasslight-big.jpg', { srgb: true }), photo('textures/waternormals.jpg', { srgb: false })]);
  const dirt = dirtMaps(grassPhoto); // photo-derived grime for galvanised steel
  const grass7 = grassPhoto.clone(); grass7.repeat.set(100, 50); grass7.needsUpdate = true;
  const fenceTex = chainLink();
  // ---------------------------------------------------------------- 6.1 tyre on wet asphalt
  // Real low sun (Venice sunset panorama) behind the tyre: it lights the scene, glints on the wet asphalt and the droplets, and is the defocused backdrop.
  const ts = makeSet(null, { bg: null }); const T = ts.scene; const A = asphalt(); const SUN1 = -1.9;
  await useHdri(T, HDRI.sunsetSea, { env: 0.9, background: true, blur: 0.06, bgIntensity: 0.75, rotation: (VENICE_SUN[0] - 0.5) * TAU - SUN1 });
  const am = A.map.clone(), an = A.normalMap.clone(); for (const tx of [am, an]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(10, 10); tx.needsUpdate = true; }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshPhysicalMaterial({ map: am, normalMap: an, normalScale: new THREE.Vector2(3, 3), color: 0x7a7a7a, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.5, clearcoatRoughnessMap: am, clearcoatNormalMap: an, clearcoatNormalScale: new THREE.Vector2(1.2, 1.2) })); envOn(ground.material, T, 0.5); ground.rotation.x = -Math.PI / 2; T.add(ground); // wet film: sky glints broken up by the aggregate
  const tyreCar = buildCar('classic', { fasteners: false, engine: false, interior: false, color: 0x050505, seed: 91 }); T.add(tyreCar.group);
  const drops = droplets(T, 900, [0, 0, 0, 1.6, 0, 1.2], 5);
  dirLight(T, { color: 0xffc27a, intensity: 3.5, pos: [Math.cos(SUN1) * 10, 0.9, Math.sin(SUN1) * 10] }); // key on the panorama's sun: rim light on tread and droplets
  ts.onUpdate((t) => { const x = (t - 50.0) * 1.4 - 1.2; tyreCar.group.position.x = x; tyreCar.spin(x / 0.335); });
  shots.push(shot('s6.1', 50.0, 50.9, ts, (lt, u, cam) => {
    const wx = tyreCar.group.position.x + tyreCar.shape.wheels[0].x; const d = aim(cam, v3(wx + 0.55, 0.05, 1.2), v3(wx + 0.05, 0.06, 0.72), { fov: 30, near: 0.01, far: 60 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 6.2 brake disc glowing
  // A real hot iron disc behind the wire spokes: machined, cross-drilled, glowing by temperature (red rim → yellow swept band),
  // gripped by a champagne-gold caliper; exposure held so the disc keeps its detail.
  const bs = makeSet(null, { bg: 0x000000 }); await useHdri(bs.scene, HDRI.sunsetSea, { env: 0.12, rotation: 0.4 }); // dim warm reflections: the disc is the light
  const bcar = buildCar('classic', { fasteners: false, engine: false, interior: false, seed: 92 }); bs.scene.add(bcar.group);
  const wheelF = bcar.wheels.find((w) => w.front && w.side > 0); wheelF.group.visible = true;
  { const keep = new Set(); for (const g of [wheelF.group, wheelF.brake]) g.traverse((o) => keep.add(o)); bcar.group.traverse((o) => { if (o.isMesh && !keep.has(o)) o.visible = false; }); } // macro: this wheel and its brake only, in the dark
  wheelF.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'ExtrudeGeometry') o.visible = false; }); // the knock-off spinner would stand as a dark slab across the lens
  const { disc, caliper } = wheelF.brake.userData; const dR = disc.geometry.parameters.radiusTop; const hot = hotDisc(dR, grassPhoto); disc.material = hot.mat;
  caliper.geometry = caliperGeo(dR); caliper.position.set(0, 0, 0); caliper.rotation.set(0, 0, 1.3); // gripping the disc at twelve-thirty, in front of the glow
  caliper.material = envOn(new THREE.MeshPhysicalMaterial({ color: 0xcdb48a, metalness: 0.55, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }), bs.scene, 1.4); // champagne gold that reads against the glow
  const discGlow = point(bs.scene, { color: 0xff5a10, intensity: 0, pos: [1.3, 0.35, 0.6] });
  bs.onUpdate((t) => { const k = smooth(clamp((t - 50.7) / 0.8)); hot.u.heat.value = 0.25 + k * 0.75; discGlow.intensity = 0.3 + k * 1.0; bcar.spin((t - 50.9) * 2.5); disc.rotation.y = -(t - 50.9) * 2.5; });
  { const cw = caliper.getWorldPosition(new THREE.Vector3()); bcar.group.updateMatrixWorld(true); caliper.getWorldPosition(cw); // a narrow warm spot just on the caliper
    spot(bs.scene, { intensity: 2.5, pos: cw.clone().add(v3(0.6, 0.9, 1.2)).toArray(), target: cw.toArray(), angle: 0.08, penumbra: 0.8, color: 0xffd2a0 }); }
  shots.push(shot('s6.2', 50.9, 51.7, bs, (lt, u, cam) => {
    const c = v3(bcar.shape.wheels[0].x, 0.335, 0.6); const d = aim(cam, c.clone().add(v3(lerp(0.4, 0.3, u), lerp(0.12, 0.05, u), 0.5)), c.clone().add(v3(-0.02, 0.0, -0.05)), { fov: 34, near: 0.01, far: 30 });
    return { focus: d, aperture: 10 };
  }, { trans: { type: 'flash', dur: 0.3 }, grade: { exposure: 0.92, bloom: 0.35, streak: 0.06, threshold: 1.6 } }));

  // ---------------------------------------------------------------- 6.3 gearshift into the gate
  const gs = makeSet(null, { bg: null }); const G = gs.scene;
  await useHdri(G, HDRI.interiorWarm, { env: 0.8, background: true, blur: 0.35, bgIntensity: 0.12, rotation: 1.2 });
  const [wdD, wdB, wdR] = await Promise.all([photo('textures/hardwood2_diffuse.jpg'), photo('textures/hardwood2_bump.jpg', { srgb: false }), photo('textures/hardwood2_roughness.jpg', { srgb: false })]);
  const veneer = [wdD, wdB, wdR].map((tx) => { const c = tx.clone(); c.repeat.set(0.8, 0.115); c.offset.set(0.1, 0.38); c.rotation = 0; c.needsUpdate = true; return c; });
  const gate = new THREE.Group(); G.add(gate);
  // the open gate: a brushed-titanium plate cut with ONE H-pattern slot (three gear columns joined by the cross-plane, rounded
  // ends); the extrusion bevel chamfers every slot edge so the gate reads at a glance
  const plate = new THREE.Shape(); { const w = 0.075, h = 0.062, r = 0.012; plate.moveTo(-w + r, -h); plate.lineTo(w - r, -h); plate.absarc(w - r, -h + r, r, -Math.PI / 2, 0); plate.lineTo(w, h - r); plate.absarc(w - r, h - r, r, 0, Math.PI / 2); plate.lineTo(-w + r, h); plate.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI); plate.lineTo(-w, -h + r); plate.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5); }
  const GX = [-0.045, 0, 0.045], GY = 0.036, GW = 0.0068; { const h = new THREE.Path(); h.moveTo(GX[0] - GW, GY);
    for (let i = 0; i < 3; i++) { h.absarc(GX[i], GY, GW, Math.PI, 0, true); if (i < 2) { h.lineTo(GX[i] + GW, GW); h.lineTo(GX[i + 1] - GW, GW); } else h.lineTo(GX[i] + GW, -GY); }
    for (let i = 2; i >= 0; i--) { h.absarc(GX[i], -GY, GW, 0, Math.PI, true); if (i > 0) { h.lineTo(GX[i] - GW, -GW); h.lineTo(GX[i - 1] + GW, -GW); } else h.lineTo(GX[0] - GW, GY); }
    plate.holes.push(h); }
  // the slot walls are shadowed by the plate itself (no shadow maps here): darkened in the shader, so each slot reads as a cut, not a groove
  const gateMat = M.titanium().clone(); gateMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float wall = (1. - smoothstep(0.35, 0.8, abs(normalize(vON).z))) * step(abs(vOP.x), 0.06) * step(abs(vOP.y), 0.05); float k = mix(1., 0.12, wall);
        reflectedLight.directDiffuse *= k; reflectedLight.directSpecular *= k; reflectedLight.indirectDiffuse *= k; reflectedLight.indirectSpecular *= k; }`); };
  gateMat.customProgramCacheKey = () => 'gateWalls';
  gate.add(mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.007, bevelEnabled: true, bevelSize: 0.0018, bevelThickness: 0.0018, bevelSegments: 3, curveSegments: 12 }), gateMat, { r: [-Math.PI / 2, 0, 0] }));
  const consoleMat = new THREE.MeshPhysicalMaterial({ map: veneer[0], color: 0x52301e, bumpMap: veneer[1], bumpScale: 0.6, roughnessMap: veneer[2], roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 }); envOn(consoleMat, G, 0.3);
  gate.add(mesh(new THREE.PlaneGeometry(1.4, 1.2), consoleMat, { r: [-Math.PI / 2, 0, 0], p: [0, -0.004, -0.2] })); // walnut-stained, lacquered photo wood falling off into the dark
  gate.add(mesh(new THREE.PlaneGeometry(0.16, 0.135), new THREE.MeshBasicMaterial({ color: 0x000000 }), { r: [-Math.PI / 2, 0, 0], p: [0, -0.03, 0] })); // the slots open onto darkness: a real cut-through gate
  const PIV = 0.2; const lever = new THREE.Group(); lever.position.set(0, -PIV, 0); G.add(lever); // pivots below the gate, so the shaft travels along the slots
  lever.add(mesh(new THREE.CylinderGeometry(0.0046, 0.0062, PIV + 0.17, 20), M.chrome(), { p: [0, (PIV + 0.17) / 2, 0] })); lever.add(mesh(new THREE.SphereGeometry(0.021, 32, 20), M.walnut(), { p: [0, PIV + 0.18, 0] }));
  const boot = mesh(new THREE.SphereGeometry(0.016, 24, 12, 0, TAU, 0, Math.PI / 2), M.leather(0x1c1310), { s: [1, 0.42, 1] }); G.add(boot); // small leather boot round the shaft, seen through the slot
  spot(G, { color: 0xffc27a, intensity: 5, pos: [-0.55, 0.95, 0.45], target: [0, 0.02, 0], angle: 0.32, penumbra: 1 }); // pool of warm light on the gate; the console falls off into the dark
  gs.onUpdate((t) => {
    const x = lerp(0, GX[2], smooth(clamp((t - 51.7) / 0.15))), z = lerp(0, -GY, smooth(clamp((t - 51.85) / 0.35))); // across the plane, then up into fifth
    lever.rotation.set(Math.atan(z / PIV), 0, -Math.atan(x / PIV)); boot.position.set(x, -0.0012, z);
  });
  shots.push(shot('s6.3', 51.7, 52.5, gs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.3, 0.26, u), lerp(0.24, 0.2, u), 0.34), v3(0.0, 0.085, -0.01), { fov: 32, near: 0.005, far: 20 }); return { focus: d, aperture: 8 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.22, threshold: 1.3, gain: [1.05, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 6.5/6.6 the coast (built before the visor so it can be reflected)
  // Real sunset over the sea (Venice lagoon panorama) for sky light, paint/chrome/sea reflections and the backdrop; photo-detailed
  // terrain with baked long golden-hour shadows (terrain + pines), photo-normal-mapped sea, Armco along the cliff edge.
  const cs = makeSet(null, { bg: null, fog: new THREE.Fog(0xc49470, 320, 1800) }); const C = cs.scene;
  const SUN_PHI = 2.78, ROT5 = (VENICE_SUN[0] - 0.5) * TAU - SUN_PHI;
  await useHdri(C, HDRI.sunsetSea, { env: 0.9, background: true, blur: 0.03, bgIntensity: 0.75, rotation: ROT5 });
  const coast = buildCoast({}); C.add(coast);
  const sunDir5 = v3(Math.cos(0.24) * Math.cos(SUN_PHI), Math.sin(0.24), Math.cos(0.24) * Math.sin(SUN_PHI)); // key light on the panorama's sun azimuth, 14° up
  const sun = dirLight(C, { color: 0xffc58a, intensity: 3.4, pos: sunDir5.clone().multiplyScalar(500).toArray() });
  const coastFx = dressCoast(coast, { scene: C, sunDir: sunDir5, grass: grassPhoto, water: waterN, dirt });
  const convoyPresets = [['classic', 0x050505], ['gt', 0x3d0b12], ['roadster', 0x101a14], ['supercar', 0x9a9b9f], ['classic', 0xcdb48a]];
  const sunAng5 = Math.atan2(-sunDir5.z, -sunDir5.x);
  // the key light's mirror glint on gloss paint and chrome bloomed into a white ball over each car; the sunset still reflects from the panorama
  const softGlint = new Map(); const tame = (m) => { if (!m.isMeshStandardMaterial) return m; if (softGlint.has(m)) return softGlint.get(m); const c = m.clone();
    if (c.transparent && c.isMeshPhysicalMaterial) { c.clearcoat = 0; c.opacity = 0.93; envK(c, C, 0.55); } else envK(c, C, 0.6); // glass: tinted dark (the sun's glitter on the sea behind no longer burns through it), one reflection; paint: the HDR sun at grazing incidence stays a highlight
    c.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.directSpecular *= 0.3;${c.isMeshPhysicalMaterial && c.clearcoat > 0 ? ' clearcoatSpecularDirect *= 0.3;' : ''}`); };
    c.customProgramCacheKey = () => `softGlint${c.isMeshPhysicalMaterial && c.clearcoat > 0}`; softGlint.set(m, c); return c; };
  const convoy = convoyPresets.map(([p, c], i) => { const car = buildCar(p, { lite: true, color: c, seed: 100 + i }); car.lights(0.2, 1); C.add(car.group);
    car.group.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(tame) : tame(o.material); }); for (const g of car.lampGlows) if (g.isSprite) g.visible = false; /* lit bulbs, no toy-like halo balls in daylight */ const sh = carShadow(car.spec.L, 1.9, { sun: sunDir5, long: 7, strength: 0.85 }); car.group.add(sh); car.shadow = sh; return car; });
  const roadLen = coast.userData.road.getLength();
  const convoyAt = (t) => { const s0 = 0.06 + (t - 52.5) * (17 / roadLen); convoy.forEach((car, i) => { const { p, heading } = coast.userData.onRoad(s0 - i * (16 / roadLen)); car.group.position.copy(p); car.group.rotation.y = heading; car.spin((t - 50) * 50); car.shadow.userData.long.rotation.y = -sunAng5 - heading; }); return s0; };
  cs.onUpdate((t) => { convoyAt(t); coastFx.update(t); });

  // ---------------------------------------------------------------- 6.4 helmet visor reflecting the road
  const hs = makeSet(null, { bg: 0x000000 }); const H = hs.scene;
  // live capture of the coast road at golden hour (real sunset panorama + road, Armco, sea) → the visor's reflection
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }); const cubeCam = new THREE.CubeCamera(0.5, 2000, cubeRT);
  convoyAt(55.0); const capPos = coast.userData.onRoad(0.13).p.add(v3(0, 1.4, 0)); cubeCam.position.copy(capPos); C.add(cubeCam); cubeCam.update(ctx.renderer, C); C.remove(cubeCam);
  const pm = new THREE.PMREMGenerator(ctx.renderer); const roadEnv = pm.fromCubemap(cubeRT.texture).texture; pm.dispose(); H.environment = roadEnv; H.environmentIntensity = 0.85;
  const helmet = new THREE.Group(); H.add(helmet);
  helmet.add(mesh(new THREE.SphereGeometry(0.15, 64, 48), M.paint(0x3d0b12, { metalness: 0.4 }), { s: [1, 1.08, 1.12] }));
  helmet.add(mesh(new THREE.TorusGeometry(0.152, 0.004, 8, 96, Math.PI), M.goldPolished(), { r: [0, Math.PI / 2, 0], s: [1, 1.08, 1.12] }));
  // gold-film visor: its edges taper into the shell (no slab standing proud), the coast reads through a gold reflection
  const vg = new THREE.SphereGeometry(0.156, 64, 32, -1.05, 2.1, 1.2, 0.75); { const P = vg.attributes.position, UV = vg.attributes.uv;
    for (let i = 0; i < P.count; i++) { const uu = UV.getX(i), vv = 1 - UV.getY(i); const f = lerp(0.1508 / 0.156, 1, smooth(Math.min(uu, 1 - uu) / 0.16) * smooth(Math.min(vv, 1 - vv) / 0.24)); P.setXYZ(i, P.getX(i) * f, P.getY(i) * f, P.getZ(i) * f); }
    vg.computeVertexNormals(); }
  const visor = mesh(vg, new THREE.MeshPhysicalMaterial({ color: 0xd4a24c, metalness: 1, roughness: 0.035, clearcoat: 0.2, clearcoatRoughness: 0.02 }), { s: [1, 1.08, 1.12] });
  helmet.add(visor); helmet.rotation.y = Math.PI / 2;
  hs.onUpdate((t) => { helmet.rotation.y = Math.PI / 2 + Math.sin((t - 52.5) * 0.8) * 0.15; });
  spot(H, { intensity: 2, pos: [-0.6, 0.4, 0.6], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffc27a });
  shots.push(shot('s6.4', 52.5, 53.4, hs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.16, 0.1, u), lerp(0.05, 0.03, u), 0.42), v3(0.02, 0.0, 0.14), { fov: 30, near: 0.01, far: 20 }); return { focus: d, aperture: 6 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.2, bloom: 0.5, streak: 0.28, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // 6.5 — convoy on the coast road, tracking then rising: from the hillside verge, looking back across the convoy to the sea,
  // the horizon and the low sun (side = the sea side of the road)
  shots.push(shot('s6.5', 53.4, 56.6, cs, (lt, u, cam, t) => {
    const lead = convoy[0].group, mid = convoy[2].group; const fwd = v3(Math.cos(lead.rotation.y), 0, -Math.sin(lead.rotation.y)); const side = v3(-fwd.z, 0, fwd.x);
    const k = smooth(u); const p = lead.position.clone().addScaledVector(fwd, lerp(10, 20, k)).addScaledVector(side, -lerp(4.6, 9, k)).add(v3(0, lerp(2.0, 10, k), 0));
    p.y = Math.max(p.y, coastFx.H(p.x, p.z) + 1.8);
    const tgt = new THREE.Vector3().lerpVectors(lead.position, mid.position, k * 0.8).addScaledVector(side, lerp(5, 6.5, k)).add(v3(0, lerp(0.9, -0.5, k), 0)); // the sea and horizon from the first frame; the low sun kept toward the frame edge
    const d = aim(cam, p, tgt, { fov: lerp(30, 38, k), near: 0.1, far: 3000, roll: lerp(-0.03, 0.02, k) }); return { focus: d, aperture: lerp(3, 0.8, k) };
  }, { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.0, bloom: 0.32, streak: 0.2, threshold: 1.8, gain: [1.08, 1.0, 0.86], saturation: 1.05 } }));
  // 6.6 — vertigo aerial: top-down, rotating and zooming over the switchbacks
  shots.push(shot('s6.6', 56.6, 59.4, cs, (lt, u, cam, t) => {
    const mid = convoy[2].group.position; const ang = lerp(0.3, -0.5, u); const h = lerp(120, 70, smooth(u));
    const p = v3(mid.x + Math.sin(ang) * 6, mid.y + h, mid.z + Math.cos(ang) * 6); cam.up.set(Math.sin(ang), 0, Math.cos(ang));
    const d = aim(cam, p, mid, { fov: lerp(28, 46, smooth(u)), near: 1, far: 3000 }); cam.up.set(0, 1, 0); return { focus: d, aperture: 0 };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.5, 0.5] }, grade: { exposure: 1.05, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.08, 1.0, 0.86] } }));

  // ---------------------------------------------------------------- 6.7 circuit: slow-motion pass with sparks
  // Real low sun: the sunrise-field panorama lights the scene (IBL + reflections) and, defocused, is the photographic backdrop.
  // The racer is the photoreal concept car; the concrete wall becomes a galvanised Armco rail + catch fence.
  const ci = makeSet(null, { bg: null }); const CI = ci.scene; const PHI7 = -0.5; const ROT7 = rotFor(PHI7);
  const pano4k = (await photo('hdri/' + HDRI.sunriseField4k, { srgb: true, anisotropy: 4 })).clone(); pano4k.wrapS = THREE.RepeatWrapping; pano4k.wrapT = THREE.ClampToEdgeWrapping; pano4k.needsUpdate = true;
  const sunDir7 = panoDir(SPRUIT_SUN[0], SPRUIT_SUN[1], ROT7);
  CI.add(panoDome(pano4k, { rotation: ROT7, intensity: 0.9, warm: 0.8, lift: 0.9, sun: sunDir7 })); // golden-hour sky throughout the pass, not a cool dawn
  { // IBL graded like the backdrop (the HDR's blue zenith otherwise paints the flanks blue against a golden sky): the 1k HDR
    // through the same warm dome, captured to a cube and prefiltered. The dome is already yawed, so no environment rotation.
    const envScene = new THREE.Scene(); envScene.add(panoDome((await hdri(HDRI.sunriseField)).equirect, { rotation: ROT7, intensity: 1, warm: 0.8, lift: 0.9, sun: sunDir7 }));
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }); new THREE.CubeCamera(1, 3000, rt).update(ctx.renderer, envScene);
    const pg = new THREE.PMREMGenerator(ctx.renderer); CI.environment = pg.fromCubemap(rt.texture).texture; pg.dispose(); rt.dispose();
    CI.environmentIntensity = 0.85; CI.environmentRotation = new THREE.Euler(); }
  dirLight(CI, { color: 0xffb877, intensity: 2.2, pos: sunDir7.clone().multiplyScalar(100).toArray() }); // the low sun itself: warm grazing key on the body, the Armco and the fence
  const circuit = buildCircuit(); CI.add(circuit);
  for (const o of [...circuit.children]) {
    const gp = o.geometry?.parameters ?? {};
    if (gp.width === 400 && gp.height === 14) { // track: albedo and normal tiled together (1.25 m tiles: fine aggregate), shallow relief, neutral grey under the warm grade
      const mt = o.material; mt.map = mt.map.clone(); mt.normalMap = mt.normalMap.clone(); for (const tx of [mt.map, mt.normalMap]) { tx.repeat.set(320, 11.2); tx.anisotropy = 16; tx.needsUpdate = true; }
      mt.color.setRGB(0.56, 0.58, 0.68); mt.roughness = 0.9; mt.normalScale.set(0.3, 0.3); }
    else if (gp.width === 400 && gp.height === 200) { o.material = new THREE.MeshStandardMaterial({ map: grass7, color: 0xa08c5c, roughness: 1 }); } // verge: photo grass
    else if (gp.width === 400 && gp.depth === 0.4) circuit.remove(o); // concrete wall → Armco below
    else if (gp.height === 3.5) circuit.remove(o); // bare poles → catch-fence posts below
  }
  CI.add(trackside(CI, fenceTex, dirt));
  const racer = await conceptRacer({ length: 4.45 }); CI.add(racer.group); racer.lights(1, 1);
  racer.group.add(carShadow(4.45, 1.95, { sun: sunDir7, long: 9 }));
  sunSprite(CI, flare0, sunDir7, { size: 320, intensity: 5 });
  const sparks = sparkStream(1400, ctx.res); CI.add(sparks); // grinding off the rear skid plate, sprayed back and toward the lens so the body doesn't hide them
  ci.onUpdate((t) => { const lt = t - 59.4; const x = -14 + lt * 9.5; racer.group.position.set(x, 0.0, -1.5); racer.group.rotation.y = 0; racer.spin(x / racer.radius); sparks.position.set(x - 1.55, 0.06, -1.05); sparks.rotation.y = 0.45; sparks.material.uniforms.time.value = lt * 0.6; sparks.material.uniforms.on.value = smooth(clamp(lt / 0.3)); });
  shots.push(shot('s6.7', 59.4, 62.0, ci, (lt, u, cam) => {
    const x = racer.group.position.x; const d = aim(cam, v3(lerp(-4, 6, u), 0.35, 4.2), v3(x + 0.6, 0.45, -1.5), { fov: 36, near: 0.05, far: 2000 }); return { focus: d, aperture: 5 };
  }, { trans: { type: 'whip', dur: 0.4, dir: [1, 0] }, grade: { exposure: 1.1, bloom: 0.6, streak: 0.35, threshold: 1.1, gain: [1.1, 1.0, 0.84] } }));
  return { shots };
}

