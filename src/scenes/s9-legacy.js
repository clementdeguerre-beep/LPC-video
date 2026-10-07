// SCENE 9 (82–90s) — THE LEGACY. Echoes of every scene (spark, gear, leather, tyre, crystal, key,
// seal) dissolve into a swirl of gold particles around the black car, which then draw the logo:
// the car's profile traced in gold with the name set into its flank. Final macro on the emblem.
// Realism: both sets are lit by a real photographed studio (HDR panorama) — the black lacquer, chrome
// wire wheels, glass and the gold emblem reflect real softboxes; the car stands on a black glossy floor
// that mirrors it; the emblem is set into a lacquered body panel and a real softbox sweeps across it.
import { THREE, makeSet, spot, dust, shot, M, v3, clamp, smooth, lerp, rng, aim } from './common.js';
import { buildCar, emblemMaterial, reflectionOf, contactShadow } from '../models/car.js';
import { gearGeo, lathe } from '../models/geo.js';
import { outlineOf } from '../models/engine.js';
import { FONT_SERIF } from '../engine/textures.js';
import { TAU } from '../engine/util.js';
import { HDRI, hdri } from '../engine/assets.js';

import { LOGO } from './logo.js';
export { LOGO };

/**
 * A real photographed studio turned into a black-flagged product stage: the panorama's own light sources
 * (softboxes, strips, spot — kept photographic, edges and falloff included) over a darkened room, as a
 * photographer would flag the walls and floor black for a black car. Rendered once into a PMREM.
 */
const _envs = new Map();
const panoDir = (u, el) => { const th = (u - 0.5) * TAU; return new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)); };
const panoUp = (u, el) => { const th = (u - 0.5) * TAU; return new THREE.Vector3(-Math.cos(th) * Math.sin(el), Math.cos(el), -Math.sin(th) * Math.sin(el)); };
/** Rotation (scene → panorama) that puts the panorama's (u, el) light at scene direction `at`, its vertical axis along scene `axis`. */
function placeLight(u, el, at, axis) {
  const e2 = v3(...at).normalize(), e1 = v3(...axis); e1.addScaledVector(e2, -e1.dot(e2)).normalize(); const e3 = e1.clone().cross(e2);
  const f2 = panoDir(u, el), f1 = panoUp(u, el), f3 = f1.clone().cross(f2);
  const P = new THREE.Matrix4().makeBasis(f1, f2, f3), Sb = new THREE.Matrix4().makeBasis(e1, e2, e3);
  return { P: new THREE.Matrix3().setFromMatrix4(P), SbT: new THREE.Matrix3().setFromMatrix4(Sb.transpose()) };
}
/**
 * o.strip: a second panorama's softbox placed at scene direction `at` (width < 1 narrows it; `tint` colours the strip only;
 *          `soft` widens the cone-mask edge).
 * o.fill:  a broad, dim, yaw-invariant dome of warm light (brighter overhead) — the low constant fill a product
 *          photographer bounces onto polished metal so its relief always reads: { k, tint, lo, hi, base }.
 * o.flipY: mirror the whole studio vertically — for the mirrored copy of a car standing on a mirror floor: the
 *          scale.y = −1 clone samples the environment at mirror(r), so a mirrored studio returns the correct (dark,
 *          floor-side) light instead of the overhead strips.
 */
async function blackStudio(renderer, o = {}) {
  const id = JSON.stringify(o); if (_envs.has(id)) return _envs.get(id);
  const { name = HDRI.studio, yaw = 0, pitch = 0, wall = 0.04, floor = 0.012, lo = 1.2, hi = 5, max = 10, gain = 1, tint = [1, 1, 1], size = 256, strip = null, fill = null, flipY = false } = o;
  const A = await hdri(name); const B = strip ? await hdri(strip.name ?? HDRI.studioTall) : A;
  const rot = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')));
  const rotB = strip ? placeLight(strip.u, strip.el, strip.at, strip.axis) : { P: new THREE.Matrix3(), SbT: new THREE.Matrix3() };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      map: { value: A.equirect }, rot: { value: rot }, wall: { value: wall }, floorK: { value: floor }, lo: { value: lo }, hi: { value: hi }, mx: { value: max }, gain: { value: gain }, tint: { value: new THREE.Vector3(...tint) }, flip: { value: flipY ? -1 : 1 },
      mapB: { value: B.equirect }, rotP: { value: rotB.P }, rotS: { value: rotB.SbT }, wB: { value: strip?.width ?? 1 }, kB: { value: strip ? strip.k ?? 1 : 0 }, mxB: { value: strip?.max ?? 12 }, atB: { value: strip ? v3(...strip.at).normalize() : v3(0, 1, 0) }, coneB: { value: Math.cos(strip?.cone ?? 0.6) }, softB: { value: strip?.soft ?? 0.08 }, tintB: { value: new THREE.Vector3(...(strip?.tint ?? [1, 1, 1])) },
      fillK: { value: fill?.k ?? 0 }, fillTint: { value: new THREE.Vector3(...(fill?.tint ?? [1, 1, 1])) }, fillLo: { value: fill?.lo ?? -0.6 }, fillHi: { value: fill?.hi ?? 0.9 }, fillBase: { value: fill?.base ?? 0.3 },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `#include <common>
      uniform sampler2D map, mapB; uniform mat3 rot, rotP, rotS; uniform float wall, floorK, lo, hi, mx, gain, kB, mxB, coneB, softB, wB, flip, fillK, fillLo, fillHi, fillBase; uniform vec3 atB, tint, tintB, fillTint; varying vec3 vD;
      vec3 capped(vec3 c, float m){ float k = max(max(c.r, c.g), c.b); return k > m ? c * (m / k) : c; }
      void main(){
        vec3 d = normalize(vD); d.y *= flip; vec3 s = normalize(rot * d); vec3 c = texture2D(map, equirectUv(s)).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(mix(floorK, wall, smoothstep(-0.2, 0.05, s.y)), 1.0, smoothstep(lo, hi, l));
        c = capped(c, mx) * gain;
        if (fillK > 0.0) c += fillTint * fillK * mix(fillBase, 1.0, smoothstep(fillLo, fillHi, d.y));
        if (kB > 0.0) { vec3 ld = rotS * d; ld.z /= wB; vec3 b = texture2D(mapB, equirectUv(normalize(rotP * normalize(ld)))).rgb; float lb = dot(b, vec3(0.2126, 0.7152, 0.0722));
          c += capped(b, mxB) * tintB * kB * smoothstep(1.5, 5.0, lb) * smoothstep(coneB, coneB + softB, dot(d, atB)); }
        gl_FragColor = vec4(c * tint, 1.0);
      }`,
  });
  const sphere = new THREE.SphereGeometry(50, 128, 64); const sc = new THREE.Scene(); sc.add(new THREE.Mesh(sphere, mat));
  const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(sc, 0, 0.1, 100, { size }).texture; pm.dispose(); mat.dispose(); sphere.dispose();
  _envs.set(id, tex); return tex;
}

/** Materials that carry their own envMap follow the set's environment yaw and intensity every frame: [material, k]. */
function envFollower(scene) {
  const list = [];
  return {
    add(mat, k, envMap = scene.environment) { mat.envMap = envMap; mat.envMapIntensity = k * scene.environmentIntensity; mat.needsUpdate = true; list.push([mat, k]); return mat; },
    update() { for (const [m, k] of list) { m.envMapIntensity = k * scene.environmentIntensity; m.envMapRotation.copy(scene.environmentRotation); } },
  };
}

/** A mirror image is lit by image-based light only (direct spots would light the reflection's underside). */
function envOnly(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0);
      #ifdef USE_CLEARCOAT
        clearcoatSpecularDirect = vec3(0.0);
      #endif
      #ifdef USE_SHEEN
        sheenSpecularDirect = vec3(0.0);
      #endif`);
  };
  mat.customProgramCacheKey = () => 'lpc-s9-envonly';
  return mat;
}

/**
 * A photographer's black flag: scales every specular reflection (studio and spots) on the part of the lacquer inside a
 * world-space box (x, y ranges, soft edges) by the returned uniform's value — 1 = no flag, 0 = clean black lacquer.
 */
function flagBand(mat, { x, y, soft }) {
  const flagK = { value: 1 }; const f = (v) => v.toFixed(3);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.flagK = flagK;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlagXY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFlagXY = (modelMatrix * vec4(transformed, 1.0)).xy;');
    const band = `float fb = smoothstep(${f(x[0] - soft)}, ${f(x[0] + soft)}, vFlagXY.x) * (1.0 - smoothstep(${f(x[1] - soft)}, ${f(x[1] + soft)}, vFlagXY.x))
        * smoothstep(${f(y[0] - soft)}, ${f(y[0] + soft)}, vFlagXY.y) * (1.0 - smoothstep(${f(y[1] - soft)}, ${f(y[1] + soft)}, vFlagXY.y)); float fk = mix(1.0, flagK, fb);`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float flagK; varying vec2 vFlagXY;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      #if defined( RE_IndirectSpecular )
      { ${band} radiance *= fk;
        #ifdef USE_CLEARCOAT
          clearcoatRadiance *= fk;
        #endif
      }
      #endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { ${band} reflectedLight.directSpecular *= fk;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect *= fk;
        #endif
      }`);
  };
  mat.customProgramCacheKey = () => 'lpc-s9-flag';
  return flagK;
}

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

/**
 * Clearcoat (R) / roughness (G) / metalness (B) map split from the emblem artwork: gold relief = polished metal under the
 * coat, field = deep black enamel that only takes a faint glint (clearcoat almost off there, so the field stays black).
 */
function enamelORM(map, { ccField = 0.04, ccGold = 0.5, rField = 0.06, rGold = 0.2 } = {}) {
  const src = map.image; const w = src.width, h = src.height; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.drawImage(src, 0, 0); const id = g.getImageData(0, 0, w, h); const d = id.data;
  for (let i = 0; i < d.length; i += 4) { const gold = clamp((d[i] - 40) / 120); d[i] = Math.round(lerp(ccField, ccGold, gold) * 255); d[i + 1] = Math.round(lerp(rField, rGold, gold) * 255); d[i + 2] = Math.round(gold * 255); d[i + 3] = 255; }
  g.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.flipY = map.flipY; return t;
}

export async function buildS9(ctx, opts = {}) {
  const shots = [];
  // ---------------------------------------------------------------- 9.1 echoes → swirl → logo, around the black car
  const set = makeSet(null); const S = set.scene;
  // real photo studio (studio_small_03), flagged black: its octagonal softbox sits behind the car and rims the roofline,
  // and one of monochrome_studio_02's strip softboxes hangs overhead along the car, drawing the long shoulder highlight
  const ENV1 = 0.8, TOP = 0.15; // TOP: overhead strip tilted towards camera (rad)
  const studio1 = { name: HDRI.studio, yaw: 3.2, tint: [1, 0.94, 0.86],
    strip: { u: 0.405, el: -8.4 * Math.PI / 180, at: [0, Math.cos(TOP), Math.sin(TOP)], axis: [1, 0, 0], k: 2.5, max: 12, cone: 0.7 } };
  S.environment = await blackStudio(ctx.renderer, studio1);
  S.environmentIntensity = ENV1; S.environmentRotation = new THREE.Euler(0, 0, 0);
  const follow1 = envFollower(S);
  const car = buildCar('classic', { fasteners: false, engine: false, color: 0x030303, seed: 201 }); S.add(car.group); car.lights(0, 0); // bonnet stays shut: no engine to build
  // side glass: a warm-dark tint that takes only a soft share of the studio; the cabin deck seen through it is dark burgundy
  // leather trim, not mirror-black lacquer (it used to mirror the studio as a flat slate-blue lozenge in the window)
  { const g0 = M.glass(); const g1 = g0.clone(); g1.color.set(0x070503); g1.opacity = 0.86; follow1.add(g1, 0.35);
    const trim = new THREE.MeshPhysicalMaterial({ color: 0x120706, roughness: 0.62, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x3a1812) });
    car.group.traverse((o) => { if (!o.isMesh) return; if (o.material === g0) o.material = g1; if (o.name === 'tub') o.material = trim; }); }
  // black glossy studio floor: the car mirrored beneath a semi-transparent lacquer plane + a soft contact shadow
  car.interior.visible = false; const refl = reflectionOf(car.group); car.interior.visible = true; S.add(refl); // the cabin can't be seen in the floor
  { // the mirror image sees a vertically mirrored studio (a scale.y = −1 copy samples the environment at mirror(r)) and no spot
    // light (the real spots can't reach the car's underside): it returns the floor-side darkness a real mirror shows
    const envFlip = await blackStudio(ctx.renderer, { ...studio1, flipY: true }); const done = new Map();
    const swap = (m) => { if (!m?.isMeshStandardMaterial) return m; if (!done.has(m)) { const c = envOnly(m.clone()); follow1.add(c, m.metalness > 0.8 ? 0.4 : 0.6, envFlip); c.roughness = Math.max(c.roughness, 0.12); if (c.isMeshPhysicalMaterial) c.clearcoatRoughness = Math.max(c.clearcoatRoughness, 0.08); done.set(m, c); } return done.get(m); }; // the lacquer floor softens and dims what it mirrors
    refl.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); });
  }
  // as the name settles on the flank, a black flag takes the studio's reflections off the band of lacquer behind the title
  const flag = flagBand(car.paint, { x: [-1.75, 1.75], y: [0.4, 0.7], soft: 0.06 });
  const floorMat = M.floorMirror(0x020202, 0.12, 0.86, 0.05); follow1.add(floorMat, 0.005); // keep the softboxes out of the floor: black void
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat); floor.rotation.x = -Math.PI / 2; floor.renderOrder = 1; S.add(floor);
  S.add(contactShadow(car, 0.9));
  const rimL = spot(S, { intensity: 78, pos: [-6, 3.5, -4], target: [0, 0.6, 0], angle: 0.45, penumbra: 1, color: 0xffd9a0 });
  const rimR = spot(S, { intensity: 96, pos: [6, 3, -4], target: [0, 0.6, 0], angle: 0.45, penumbra: 1, color: 0xffe8c8 });
  const top = spot(S, { intensity: 72, pos: [0, 9, 3], target: [0, 0.5, 0], angle: 0.4, penumbra: 1, color: 0xfff0dc });
  const rimI = [rimL.intensity, rimR.intensity, top.intensity];
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
  const ENVDIM = 0.55;
  set.onUpdate((t) => {
    const lt = t - 82.0; pmat.uniforms.t.value = lt; sd.set(t);
    const iconA = 1 - smooth(clamp((lt - 0.3) / 1.0)); lineMat.opacity = iconA; icons.visible = iconA > 0.01; icons.children.forEach((h, i) => { h.rotation.y = lt * 0.6 + i; h.rotation.x = lt * 0.3; });
    const dim = smooth(clamp((lt - 2.4) / 1.8)); rimL.intensity = rimI[0] * (1 - dim * 0.75); rimR.intensity = rimI[1] * (1 - dim * 0.75); top.intensity = rimI[2] * (1 - dim * 0.9);
    S.environmentIntensity = ENV1 * (1 - dim * ENVDIM); // the studio dims as the name settles on the flank
    S.environmentRotation.set(0, lerp(-0.14, 0.1, smooth(clamp(lt / 4.6))), 0); // the softboxes glide slowly along the body
    flag.value = 1 - 0.94 * smooth(clamp((lt - 2.6) / 0.8)); // 84.6–85.4: the shoulder line leaves the lettering
    follow1.update();
  });
  shots.push(shot('s9.1', 82.0, 86.6, set, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(1.2, 0, smooth(u * 1.3)), LOGO.camY, lerp(12.5, LOGO.camZ, smooth(u * 1.3))), v3(lerp(0.6, 0, smooth(u * 1.3)), LOGO.camY, 0), { fov: LOGO.fov, near: 0.1, far: 100 });
    return { focus: d, aperture: lerp(2, 0.4, u) };
  }, { trans: { type: 'burn', dur: 0.9, center: [0.5, 0.5], seed: 3 }, grade: { exposure: 1.15, bloom: 0.75, streak: 0.4, threshold: 1.0, gain: [1.04, 1.0, 0.92] } }));

  // ---------------------------------------------------------------- 9.2 the engraved emblem, one last reflection
  const es = makeSet(null); const E = es.scene;
  // the same photographed studio, dim and warm, plus a real strip softbox (slightly slanted, narrowed) behind the camera;
  // turning the studio sweeps that strip across the badge: the one last reflection
  const ENV2 = 1.0, ROT2A = -0.7, ROT2B = 0.7;
  // strip: narrowed to a thin bar and gelled champagne — a jeweller's highlight, not a slab; baked at 512 so its edge stays crisp.
  // fill: a dim warm bounce overhead so the gold relief (car line, LPC) always reads while the enamel field stays black.
  E.environment = await blackStudio(ctx.renderer, { name: HDRI.studio, yaw: 4.71, gain: 0.15, tint: [1, 0.9, 0.78], size: 512,
    fill: { k: 0.2, tint: [1, 0.88, 0.7], lo: -0.7, hi: 0.85, base: 0.45 },
    strip: { u: 0.405, el: -8.4 * Math.PI / 180, at: [0, 0.1, 1], axis: [0.3, 1, 0], k: 1.3, width: 0.1, max: 12, cone: 0.7, tint: [1, 0.8, 0.52] } });
  E.environmentIntensity = ENV2; E.environmentRotation = new THREE.Euler(0, ROT2A, 0);
  const follow2 = envFollower(E);
  // gold relief = polished metal; field = deep black enamel: its specular and clearcoat are nearly off, so a sweep only leaves a faint glint
  const base = emblemMaterial(); const orm = enamelORM(base.map, { ccField: 0, ccGold: 0.5, rField: 0.06, rGold: 0.09 });
  const embMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: base.map, normalMap: base.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), metalness: 1, roughness: 1, metalnessMap: orm, roughnessMap: orm, specularIntensity: 0.02, clearcoat: 1, clearcoatMap: orm, clearcoatRoughness: 0.03 });
  const badge = new THREE.Group(); E.add(badge);
  const emb = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 128), embMat); emb.geometry.rotateY(Math.PI / 2); emb.rotation.x = Math.PI / 2; badge.add(emb);
  const bezelMat = M.goldPolished().clone(); bezelMat.roughness = 0.3; bezelMat.color.set(0xb08a52); // a satin-brushed bezel: a fine gold ring, not a neon hoop
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.018, 16, 160), bezelMat); badge.add(bezel); follow2.add(bezelMat, 0.5); // its grazing edge must not out-shine the relief
  // the badge is set into a black lacquered body panel (gently domed like a bonnet nose); fine orange peel at this macro scale,
  // and the lacquer takes only a dark-champagne share of the studio so the emblem stays the brightest thing in frame
  {
    const R = 7, a = 2.6 / R, b = 1.8 / R;
    const pg = new THREE.SphereGeometry(R, 120, 80, Math.PI / 2 - a, 2 * a, Math.PI / 2 - b, 2 * b); pg.translate(0, 0, -R - 0.012); { const P = pg.attributes.position, U = pg.attributes.uv; for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) * 9, P.getY(i) * 9); } // fine flake and orange peel
    const panelMat = M.paint(0x020202, { roughness: 0.3, clearcoatRoughness: 0.03 }); panelMat.clearcoatNormalScale.set(0.005, 0.005); panelMat.normalScale.set(0.06, 0.06); follow2.add(panelMat, 0.05);
    const panel = new THREE.Mesh(pg, panelMat); badge.add(panel);
    const gap = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 128), new THREE.MeshBasicMaterial({ color: 0x000000 })); gap.position.z = -0.0115; badge.add(gap);
  }
  const fill = spot(E, { intensity: 0.12, pos: [0.5, 0.8, 2.0], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffd9a0 }); // warm point glints on the polished relief (kept below clipping)
  const FILL = fill.intensity;
  es.onUpdate((t) => {
    const k = smooth(clamp((t - 86.6) / 2.6));
    badge.rotation.set(lerp(-0.35, 0.25, k), 0, lerp(0.2, -0.15, k)); // tilt + slow turn in its own plane (as before)
    const sw = smooth(clamp((t - 86.7) / 2.3)); E.environmentRotation.set(0, lerp(ROT2A, ROT2B, sw), 0); // one last reflection: the studio turns past the badge
    E.environmentIntensity = ENV2 * (1 - smooth(clamp((t - 88.95) / 0.7)) * 0.7); // the mark holds until the film's fade (89.0)
    fill.intensity = FILL * (1 - smooth(clamp((t - 88.95) / 0.6)));
    follow2.update();
  });
  shots.push(shot('s9.2', 86.6, 90.0, es, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(0.25, 0.08, smooth(u)), lerp(-0.12, -0.05, smooth(u)), lerp(1.7, 1.15, smooth(u))), v3(0.05, 0.0, 0), { fov: 30, near: 0.01, far: 20, roll: lerp(0.05, 0, u) });
    return { focus: d, aperture: 6 };
  }, { trans: { type: 'black', dur: 0.7 }, grade: { exposure: 1.2, bloom: 0.6, streak: 0.35, threshold: 1.1 } }));
  return { shots };
}
