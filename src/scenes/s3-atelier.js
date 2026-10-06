// SCENE 3 (18–30s) — THE ATELIER. Macro craft (panel gap, torque click, polish, paint gauge,
// pinstripe) then a pull-out onto a team of master craftsmen moving in sync around one car.
// Realism pass: the atelier is lit and reflected by real photographed interiors (HDR panoramas,
// graded to a moody low-key: lights kept at full HDR strength, walls and floors crushed), built
// from real photo materials (reclaimed brick walls, oiled plank floor, butcher-block bench) under
// photoreal brushed-copper barn lamps that rake real light down the brick; the macro stages are lit
// by a real photo studio so chrome, clear-coat and gold read photographic, with the workshop
// defocused behind them. Swirl marks are true clear-coat micro-scratches (they only appear inside
// the reflection of the light, as on real paint), and every figure / prop is grounded with contact
// shadows.
import { THREE, makeSet, spot, point, dust, shot, M, v3, clamp, smooth, lerp, rng, aim, lightStrip } from './common.js';
import { buildCar, contactShadow } from '../models/car.js';
import { buildFigure, POSES, buildHand } from '../models/figure.js';
import { buildGauge, buildTorqueWrench, buildHub, buildPolisher, buildStripingBrush, buildToolWall, buildToolChest } from '../models/props.js';
import { mesh, roundBox, patch, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { invLerp, easeOutCubic, TAU } from '../engine/util.js';
import { hdri, HDRI, photo, model, findIn, tint } from '../engine/assets.js';

const BEAT = 2.0; // the ensemble moves on the score's 2-second bar

function openHood(car, angle) {
  const hood = car.panels.find((p) => p.name === 'hood'); const u = 0.43; const H = v3(car.shape.x(u), car.shape.top(u), 0);
  const q = new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), angle); const p = H.clone().sub(H.clone().applyQuaternion(q));
  hood.position.copy(p); hood.quaternion.copy(q);
}

function paintPanel(w = 0.8, h = 0.5, color = 0x050505, opts) {
  const geo = patch((u, v, o) => o.set((u - 0.5) * w, (v - 0.5) * h, -Math.pow((u - 0.5) * w, 2) * 0.3), 0, 1, 48, 0, 1, 24, { flip: false });
  return new THREE.Mesh(geo, M.paint(color, opts));
}

// ------------------------------------------------------------------------------------------------
// Photographic light

/**
 * A real HDR panorama re-graded for a low-key interior: pixels brighter than `lo..hi` (the lamps,
 * tubes, softboxes) keep their full photographed HDR value, everything else (walls / floor) is
 * crushed and warmed. Baked to a PMREM (reflections + IBL); yaw rotates the panorama. Cached.
 */
const _envs = new Map();
async function gradedEnv(renderer, key, o = {}) {
  const id = key + JSON.stringify(o); if (_envs.has(id)) return _envs.get(id);
  const { yaw = 0, wall = 0.12, floor = 0.05, lo = 1.2, hi = 5, max = 40, tint = [1, 0.86, 0.7], light = [1, 0.95, 0.88], gain = 1, size = 256, minY = -2 } = o;
  const H = await hdri(HDRI[key] ?? key);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: H.equirect }, minY: { value: minY }, yaw: { value: yaw }, wall: { value: wall }, floorK: { value: floor }, lo: { value: lo }, hi: { value: hi }, mx: { value: max }, gain: { value: gain }, tintC: { value: new THREE.Vector3(...tint) }, lightC: { value: new THREE.Vector3(...light) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `#include <common>
      uniform sampler2D map; uniform float yaw, wall, floorK, lo, hi, mx, gain, minY; uniform vec3 tintC, lightC; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float c = cos(yaw), s = sin(yaw); d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
        vec3 col = texture2D(map, equirectUv(d)).rgb; float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float keep = smoothstep(lo, hi, l) * smoothstep(minY, minY + 0.15, d.y); float base = mix(floorK, wall, smoothstep(-0.12, 0.06, d.y));
        col *= mix(base * tintC, lightC, keep);
        float k = max(max(col.r, col.g), col.b); if (k > mx) col *= mx / k;
        gl_FragColor = vec4(col * gain, 1.0);
      }`,
  });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 96, 48), mat));
  const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(sc, 0, 0.1, 100, { size }).texture; pm.dispose(); mat.dispose();
  _envs.set(id, tex); return tex;
}

// ------------------------------------------------------------------------------------------------
// Real-scale photo materials

/** Plane with UVs in real-world tiles, so a photo texture keeps its physical scale on any size. */
function tiledPlane(w, h, tile, off = [0, 0]) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile[0] + off[0], (uv.getY(i) * h) / tile[1] + off[1]);
  return g;
}
const tileBox = (geo, scale) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scale[0], uv.getY(i) * scale[1]); return geo; };

/** Large-scale weathering (soot towards the roof, damp near the floor, low-frequency patchiness)
 *  so a tiled photo never reads as a repeat. World-space, so walls of any size stay consistent. */
function weather(mat, { base = 0.62, top = [3.6, 7.2, 0.5], low = 0.9, patch = 0.45, key = 'weather' } = {}) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp;
      float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 q = vec2(vWp.x + vWp.z * 0.93, vWp.y); float n = wn(q * 0.31) * 0.55 + wn(q * 1.17 + 7.0) * 0.3 + wn(q * 4.3) * 0.15;
        float g = mix(1.0 - ${patch.toFixed(3)}, 1.0, n); g *= mix(${base.toFixed(3)}, 1.0, smoothstep(0.0, ${low.toFixed(3)}, vWp.y));
        g *= mix(1.0, ${top[2].toFixed(3)}, smoothstep(${top[0].toFixed(3)}, ${top[1].toFixed(3)}, vWp.y)); diffuseColor.rgb *= g; }`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Normal map (RepeatWrapping) from a height function on a w×w grid. */
function normalTex(w, hfn, strength = 2, repeat = [1, 1]) {
  const H = new Float32Array(w * w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) H[y * w + x] = hfn(x, y);
  const c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d'); const img = g.createImageData(w, w); const d = img.data;
  const at = (x, y) => H[((y + w) % w) * w + ((x + w) % w)];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength; const l = Math.hypot(dx, dy, 1); const i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; return t;
}

/** Cotton twill (workwear / gloves). */
let _twill = null;
const twill = () => (_twill ??= (() => { const r = rng(77); const n = new Float32Array(128 * 128).map(() => r()); return normalTex(128, (x, y) => 0.5 + 0.4 * Math.sin(((x + y * 2) / 8) * TAU) + 0.18 * n[y * 128 + x], 0.9, [10, 10]); })());

/** Soft round contact shadow decal texture. */
let _blob = null;
function blobTex() {
  if (_blob) return _blob; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.65)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); _blob = new THREE.CanvasTexture(c); return _blob;
}
function blob(scene, x, z, sx, sz, k = 0.7, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex(), transparent: true, opacity: k, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.004, z); m.renderOrder = 2; scene.add(m); return m;
}

/** Linear AO strip where a wall meets the floor. */
let _aoStrip = null;
function wallAO(scene, len, pos, ry, depth = 0.9, k = 0.75) {
  if (!_aoStrip) { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 8, 128); _aoStrip = new THREE.CanvasTexture(c); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, depth), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: _aoStrip, transparent: true, opacity: k, depthWrite: false }));
  const grp = new THREE.Group(); grp.add(m); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.003, depth / 2); grp.position.set(...pos); grp.rotation.y = ry; m.renderOrder = 2; scene.add(grp); return grp;
}

// ------------------------------------------------------------------------------------------------
// Photoreal brushed-copper barn lamps (Khronos AnisotropyBarnLamp) wall-mounted over the tool walls

async function barnLampFactory(size, count) {
  const pool = await Promise.all(Array.from({ length: count }, () => model('AnisotropyBarnLamp', { size, axis: 'y' }))); const proto = pool[0]; proto.updateMatrixWorld(true);
  const fil = findIn(proto, /filament/i)[0]; const fc = new THREE.Box3().setFromObject(fil).getCenter(new THREE.Vector3());
  // the KHR transmission glass would add a full extra scene pass per frame: swap for a light frosted globe
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xfff1dc, roughness: 0.15, transparent: true, opacity: 0.4, depthWrite: false, emissive: 0xffc888, emissiveIntensity: 1.6 });
  let filament = null;
  return (wallPoint, n) => {
    const m = pool.pop();
    m.traverse((o) => { if (!o.isMesh) return; const nm = o.material.name || ''; if (/glass/i.test(nm)) o.material = glass; else if (/filament/i.test(nm)) { filament ??= Object.assign(o.material.clone(), { emissiveIntensity: 45 }); o.material = filament; } });
    m.rotation.y = Math.atan2(n.x, n.z) - Math.atan2(fc.x, fc.z); m.position.set(0, 0, 0); m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m); let d = Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) d = Math.min(d, x * n.x + y * n.y + z * n.z);
    m.position.copy(wallPoint).addScaledVector(n, -d); m.updateMatrixWorld(true);
    const bulb = fc.clone().applyMatrix4(m.matrixWorld); const g = glow(0xffc98a, size * 0.42, 1.1); g.position.copy(bulb).add(v3(0, -0.02, 0)); m.userData.bulb = bulb; m.userData.glow = g;
    return m;
  };
}

export async function buildS3(ctx) {
  const shots = []; const R = ctx.renderer;
  // real photographic light: the workshop hall (tube rows aligned with the car) and a dark photo studio for the macros
  const own = (t) => { const c = t.clone(); c.needsUpdate = true; return c; }; // private copies: other scenes may re-tile the shared cached photos
  const [envHall, envHallBg, envStudio, envGauge, envPolish, bd, bb, br, fd, fb, fr, makeLamp, sofa, tiffany, plate] = await Promise.all([
    gradedEnv(R, 'warehouse', { yaw: 0.75, wall: 0.1, floor: 0.045, lo: 1.4, hi: 6, max: 14, minY: 0.22 }),
    gradedEnv(R, 'warehouse', { yaw: 0.75, wall: 0.16, floor: 0.08, lo: 1.4, hi: 6, max: 3, minY: 0.22, tint: [1, 0.78, 0.55], light: [1, 0.85, 0.65], size: 128 }),
    gradedEnv(R, 'studio', { yaw: 1.51, wall: 0.12, floor: 0.05, lo: 1.5, hi: 8, max: 40, tint: [1, 0.9, 0.8], light: [1, 0.96, 0.9] }),
    gradedEnv(R, 'studio', { yaw: 0.6, wall: 0.25, floor: 0.08, lo: 1.5, hi: 8, max: 60, tint: [1, 0.92, 0.82], light: [1, 0.95, 0.88] }),
    gradedEnv(R, 'studio', { yaw: 2.47, wall: 0.05, floor: 0.03, lo: 1.5, hi: 8, max: 5, tint: [1, 0.95, 0.88], light: [1, 0.97, 0.94] }),
    photo('textures/brick_diffuse.jpg').then(own), photo('textures/brick_bump.jpg', { srgb: false }).then(own), photo('textures/brick_roughness.jpg', { srgb: false }).then(own),
    photo('textures/hardwood2_diffuse.jpg').then(own), photo('textures/hardwood2_bump.jpg', { srgb: false }).then(own), photo('textures/hardwood2_roughness.jpg', { srgb: false }).then(own),
    barnLampFactory(0.5, 7), model('SheenWoodLeatherSofa', { size: 2.4, axis: 'x' }), model('StainedGlassLamp', { size: 0.62, axis: 'y' }), model('AntiqueCamera', { size: 1.6, axis: 'y' }),
  ]);

  let _bt = null; const benchTopMat = () => (_bt ??= new THREE.MeshPhysicalMaterial({ map: fd, color: 0x6e5444, bumpMap: fb, bumpScale: 0.8, roughnessMap: fr, roughness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.2 }));

  // ======================================================================== the workshop
  const ws = makeSet(null, { envIntensity: 1.0 }); const W = ws.scene; W.environment = envHall;
  const car = buildCar('classic', { fasteners: false, seed: 31 }); W.add(car.group); W.add(contactShadow(car, 0.9)); openHood(car, 0.95);
  car.shell.material = new THREE.MeshBasicMaterial({ color: 0x000000 }); // shut-lines read as true black gaps
  // oiled plank floor (real photo: albedo / bump / roughness), dark-stained, satin varnish
  const floorMat = new THREE.MeshPhysicalMaterial({ map: fd, color: 0x4a3d38, bumpMap: fb, bumpScale: 0.5, roughnessMap: fr, roughness: 1.9, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  weather(floorMat, { base: 1, top: [50, 60, 1], low: 0.01, patch: 0.3, key: 'floorWeather' });
  const floor = new THREE.Mesh(tiledPlane(40, 26, [2.4, 1.2]), floorMat); floor.rotation.x = -Math.PI / 2; W.add(floor);
  // reclaimed brick walls (real photo), a closed room; ceiling with hanging linear fixtures
  const brickMat = weather(new THREE.MeshStandardMaterial({ map: bd, color: 0x9a7c70, bumpMap: bb, bumpScale: 2.0, roughnessMap: br, roughness: 1, metalness: 0, envMap: envHall, envMapIntensity: 2.4 }), { key: 'brickWeather' });
  const ROOM = { x0: -13, x1: 13, z0: -8, z1: 11, h: 7.2 };
  for (const [x, z, ry, w] of [[0, ROOM.z0, 0, 26], [0, ROOM.z1, Math.PI, 26], [ROOM.x0, 1.5, Math.PI / 2, 19], [ROOM.x1, 1.5, -Math.PI / 2, 19]]) {
    const wall = new THREE.Mesh(tiledPlane(w, ROOM.h, [2.25, 2.25], [x * 0.37, 0]), brickMat); wall.position.set(x, ROOM.h / 2, z); wall.rotation.y = ry; W.add(wall);
    wallAO(W, w, [x, 0, z], ry);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 19), M.matte(0x0b0b0c, 0.9)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.h, 1.5); W.add(ceil);
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.8, roughness: 0.4 });
  for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) {
    const hx = x * 4, hz = z * 4; W.add(mesh(roundBox(2.8, 0.09, 0.34, 0.02), housingMat, { p: [hx, 6.25, hz] }));
    lightStrip(W, { w: 2.6, h: 0.22, pos: [hx, 6.2, hz], rot: [Math.PI / 2, 0, 0], intensity: 4, color: 0xf6f3ec });
    for (const s of [-1, 1]) W.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, ROOM.h - 6.25, 4), housingMat, { p: [hx + s * 1.2, (ROOM.h + 6.25) / 2, hz] }));
  }
  // tool walls on the brick (oxblood lacquered pegboard), each raked by a barn lamp
  const boardMat = new THREE.MeshPhysicalMaterial({ color: 0x55232a, roughness: 0.55, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, normalMap: twill(), normalScale: new THREE.Vector2(0.08, 0.08) });
  const shadowBoard = (tw) => { tw.children[0].material = boardMat; return tw; };
  const lamps = [];
  // (one lamp + one real spot per tool wall keeps the light count — the dominant software-render cost — low)
  const lampSpot = (b, n, aimDown, intensity = 22, angle = 1.0) => spot(W, { intensity, pos: b.toArray(), target: [b.x + n.x * 0.5, b.y - aimDown, b.z + n.z * 0.5], angle, penumbra: 0.75, color: 0xffc78a });
  const mountLamp = (pt, n, aimDown = 1.7) => { const l = makeLamp(pt, n); W.add(l); W.add(l.userData.glow); lamps.push(l); if (aimDown) lampSpot(l.userData.bulb, n, aimDown); return l; };
  for (let i = -1; i <= 1; i++) {
    const tw = shadowBoard(buildToolWall(5.6, 2.2, 3 + i)); tw.position.set(i * 6.2, 1.7, ROOM.z0 + 0.05); W.add(tw);
    const l = mountLamp(v3(i * 6.2, 3.4, ROOM.z0), v3(0, 0, 1), 0); lampSpot(l.userData.bulb, v3(0, 0, 1), 1.5, 42, 1.2);
  }
  { const tw = shadowBoard(buildToolWall(5.6, 2.2, 9)); tw.position.set(ROOM.x0 + 0.05, 1.7, -2); tw.rotation.y = Math.PI / 2; W.add(tw); const l = mountLamp(v3(ROOM.x0, 3.4, -2), v3(1, 0, 0), 0); lampSpot(l.userData.bulb, v3(1, 0, 0), 1.5, 42, 1.2); }
  for (const z of [-3.6, 0.4, 4.4]) mountLamp(v3(ROOM.x1, 3.6, z), v3(-1, 0, 0), 2.2);
  // client corner against the right wall: photoreal carved-wood leather sofa and a Tiffany lamp
  tint(sofa, /Paisley|Striped|Fringe|Frame_Fabric/i, { color: 0x8a4a42 });
  sofa.rotation.y = -Math.PI / 2; sofa.position.set(ROOM.x1 - 0.62, 0, -3.6); W.add(sofa); blob(W, ROOM.x1 - 0.6, -3.6, 1.3, 2.9, 0.8);
  const sideTable = new THREE.Group(); sideTable.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 48), benchTopMat(), { p: [0, 0.6, 0] })); sideTable.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.58, 16), M.darkChrome(), { p: [0, 0.3, 0] })); sideTable.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 32), M.darkChrome(), { p: [0, 0.01, 0] }));
  sideTable.position.set(ROOM.x1 - 0.55, 0, -5.4); W.add(sideTable); blob(W, ROOM.x1 - 0.55, -5.4, 0.8, 0.8, 0.7);
  tiffany.position.set(ROOM.x1 - 0.55, 0.6175, -5.4); W.add(tiffany); { const g = glow(0xffb070, 0.5, 0.7); g.position.set(ROOM.x1 - 0.55, 0.98, -5.4); W.add(g); }
  // the atelier documents every restoration: a photoreal antique bellows camera on its wooden tripod, trained on the car
  plate.rotation.y = Math.atan2(2.8, 2.6); plate.position.set(-2.8, 0, -2.6); W.add(plate); blob(W, -2.8, -2.6, 1.0, 1.0, 0.65);
  const chest = buildToolChest(); chest.position.set(5.5, 0, -6.6); W.add(chest); blob(W, 5.5, -6.6, 1.9, 1.0, 0.8);
  // upholstery bench: butcher-block top (real wood photo), dark steel legs
  const benchTop = benchTopMat();
  const bench = new THREE.Group(); bench.add(mesh(tileBox(roundBox(2.6, 0.08, 1.0, 0.02), [2.6 / 2.4, 1.0 / 1.2]), benchTop, { p: [0, 0.92, 0] })); for (const x of [-1.2, 1.2]) for (const z of [-0.4, 0.4]) bench.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), M.darkChrome(), { p: [x, 0.45, z] }));
  const benchSeat = new THREE.Group(); benchSeat.add(mesh(roundBox(0.5, 0.1, 0.48, 0.045), M.leather(0x5a2316))); benchSeat.add(mesh(roundBox(0.12, 0.6, 0.48, 0.05), M.leather(0x5a2316), { p: [-0.24, 0.28, 0], r: [0, 0, 0.2] })); benchSeat.position.set(0, 1.02, 0); benchSeat.rotation.y = 0.4; bench.add(benchSeat);
  bench.position.set(-5.5, 0, -5.0); W.add(bench); blob(W, -5.5, -5.0, 3.2, 1.5, 0.75);

  // the team (workwear twill instead of the mannequin finish; grounded with contact shadows)
  const team = [
    { k: 'mechanic', f: buildFigure({ suit: 0x22242a }), pose: 'kneel', pos: [1.25, 0, 1.5], ry: Math.PI, amp: { 'sh1': [-0.2, 0, 0], 'el1': [-0.25, 0, 0] } },
    { k: 'engine', f: buildFigure({ suit: 0x22242a }), pose: 'lean', pos: [1.05, 0, -1.3], ry: 0, amp: { 'el1': [0.25, 0, 0], 'el-1': [-0.2, 0, 0] } },
    { k: 'uph1', f: buildFigure({ suit: 0x2a2320, hair: 0x2b1d14, gender: 'f' }), pose: 'lean', pos: [-6.0, 0, -4.15], ry: Math.PI, amp: { 'sh1': [-0.5, 0, 0.2], 'el1': [-0.6, 0, 0] } },
    { k: 'uph2', f: buildFigure({ suit: 0x2a2320 }), pose: 'lean', pos: [-4.9, 0, -4.15], ry: Math.PI, amp: { 'sh-1': [-0.5, 0, -0.2], 'el-1': [-0.6, 0, 0] } },
    { k: 'body', f: buildFigure({ suit: 0x22242a }), pose: 'crouch', pos: [-1.55, 0, 1.45], ry: Math.PI, amp: { 'sh1': [0.12, 0.25, 0], 'sh-1': [0.12, -0.25, 0] } },
    { k: 'tech', f: buildFigure({ suit: 0x1c1d22 }), pose: 'holdGlass', pos: [2.5, 0, 2.1], ry: Math.PI + 0.6, amp: { head: [0.12, 0, 0] } },
    { k: 'lead', f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), pose: 'gesture', pos: [3.6, 0, 2.3], ry: -2.25, amp: { 'sh1': [-0.25, 0, 0.1], 'el1': [-0.2, 0, 0], head: [0, 0.25, 0] } },
  ];
  const cloth = new Map(); const workwear = (c) => cloth.get(c) ?? cloth.set(c, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.88, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(c).lerp(new THREE.Color(0x9a8f80), 0.12), normalMap: twill(), normalScale: new THREE.Vector2(0.45, 0.45) })).get(c);
  for (const m of team) {
    m.f.position.set(...m.pos); m.f.rotation.y = m.ry; W.add(m.f);
    m.f.traverse((o) => { if (o.isMesh && o.material.isMeshPhysicalMaterial && o.material.metalness === 0.15) o.material = workwear(o.material.color.getHex()); });
    const low = m.pose === 'kneel' || m.pose === 'crouch'; blob(W, m.pos[0], m.pos[2] + (low ? 0.1 : 0), low ? 1.0 : 0.75, low ? 0.9 : 0.6, 0.7, m.ry);
  }
  // the lead technician's leather folio (no screens in the atelier)
  const folio = new THREE.Group(); folio.add(mesh(roundBox(0.24, 0.32, 0.012, 0.006), M.leather(0x3d0b12))); folio.add(mesh(new THREE.PlaneGeometry(0.21, 0.29), M.matte(0xe9e2d2, 0.9), { p: [0, 0, 0.0065] })); folio.add(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.004), M.goldPolished(), { p: [0, 0.135, 0.008] }));
  W.add(folio);
  const pol = buildPolisher(); pol.scale.setScalar(1.2); pol.position.set(-1.45, 0.62, 0.9); pol.rotation.set(0, 0, -Math.PI / 2 + 0.15); W.add(pol);
  spot(W, { intensity: 620, pos: [0, 6.5, 2.5], target: [0, 0.4, 0], angle: 0.8, penumbra: 0.9, color: 0xfff3e6 });
  spot(W, { intensity: 300, pos: [-6, 6.5, -2], target: [-5.5, 0.8, -5], angle: 0.6, penumbra: 0.9, color: 0xffe6c8 });
  spot(W, { intensity: 160, pos: [6, 4, 5], target: [0, 0.5, 0], angle: 0.6, penumbra: 1, color: 0xffcf96 });
  const dd = dust(W, { count: 300, box: [0, 2.5, 0, 14, 5, 10], size: 0.7, intensity: 0.45, res: ctx.res, seed: 31 });
  // pinstripe on the flank (grows during 3.5, visible afterwards)
  const stripeU0 = 0.08, stripeU1 = 0.42, stripePhi = 0.32;
  const stripeGeo = patch((u, v, o) => { car.shape.body(u, stripePhi + v * 0.006, o); const n = new THREE.Vector3(); car.shape.normal(u, stripePhi, n); o.addScaledVector(n, 0.0012); }, stripeU0, stripeU1, 300, 0, 1, 1, { flip: true });
  const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshPhysicalMaterial({ color: 0xd8ae62, metalness: 0.9, roughness: 0.22, clearcoat: 1 })); W.add(stripe);
  ws.onUpdate((t) => {
    dd.set(t); car.lights(0, 0);
    const ph = Math.sin(((t - 18) / BEAT) * TAU), ph2 = Math.sin(((t - 18) / BEAT) * TAU * 2);
    for (const m of team) {
      const base = POSES[m.pose]; const p = { ...base }; for (const k in m.amp) { const b = p[k] || [0, 0, 0]; p[k] = b.map((v, i) => v + m.amp[k][i] * (m.k === 'body' ? ph2 : ph)); }
      m.f.userData.pose(p);
    }
    const tech = team.find((m) => m.k === 'tech').f; tech.updateMatrixWorld(true); const wr = tech.userData.J['wr1']; const wp = new THREE.Vector3(); wr.getWorldPosition(wp);
    folio.position.copy(wp).add(v3(-0.12, -0.02, -0.05).applyAxisAngle(v3(0, 1, 0), tech.rotation.y)); folio.rotation.set(-0.9, tech.rotation.y, 0);
    pol.userData.pad.rotation.y = t * 30; pol.position.x = -1.45 + Math.sin(((t - 18) / BEAT) * TAU * 2) * 0.12; pol.position.y = 0.62 + Math.cos(((t - 18) / BEAT) * TAU * 2) * 0.04;
    const sk = clamp((t - 21.7) / 1.4); stripe.geometry.setDrawRange(0, Math.floor(smooth(sk) * 300) * 6); stripe.visible = sk > 0;
  });

  // ---------------------------------------------------------------- 3.1 gloved fingertip on the panel gap
  const knit = twill().clone(); knit.repeat.set(36, 36); knit.needsUpdate = true;
  const gloveMat = new THREE.MeshPhysicalMaterial({ color: 0x6a665f, roughness: 0.95, metalness: 0, sheen: 0.6, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x8a8378), normalMap: knit, normalScale: new THREE.Vector2(0.5, 0.5) });
  const hand = buildHand({ material: gloveMat, cuff: 0x1c1d22 }); W.add(hand); // cotton conservator's glove under a dark workwear cuff
  hand.userData.setCurl([0.0, 1.0, 1.05, 1.1], 0.7);
  const gapU = 0.43 - 0.0011; const P = new THREE.Vector3(), N = new THREE.Vector3();
  const handAt = (k) => {
    const phi = lerp(0.62, 0.05, k); car.shape.body(gapU, phi, P); car.shape.normal(gapU, phi, N);
    const dir = N.clone().multiplyScalar(-1).add(v3(0.25, -0.35, 0)).normalize();
    hand.quaternion.setFromUnitVectors(v3(0, 1, 0), dir); hand.rotateY(-0.4);
    const tipLocal = v3(-0.03, 0.093 + 0.046, 0); const tip = tipLocal.applyQuaternion(hand.quaternion);
    hand.position.copy(P).addScaledVector(N, 0.006).sub(tip); return P.clone();
  };
  shots.push(shot('s3.1', 18.0, 19.1, ws, (lt, u, cam) => {
    hand.visible = true; const k = smooth(clamp((lt + 0.2) / 1.5)); const tipP = handAt(k);
    const n = N.clone(); const camP = tipP.clone().addScaledVector(n, 0.3).add(v3(-0.16, 0.1 - k * 0.05, 0)); const tgt = tipP.clone().add(v3(0.01, 0.02, 0));
    const d = aim(cam, camP, tgt, { fov: 32, near: 0.01, far: 80, roll: 0.05 }); return { focus: d, aperture: 10 };
  }, { prep: () => { hand.visible = true; }, trans: { type: 'zoom', dur: 0.6, center: [0.5, 0.5] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.15, threshold: 1.4, gain: [0.98, 1.0, 1.04] } }));

  // macro stages: real studio light, the workshop defocused behind
  const macroSet = (env, envI, bgI) => { const s = makeSet(null, { envIntensity: envI }); s.scene.environment = env; s.scene.background = envHallBg; s.scene.backgroundBlurriness = 0.3; s.scene.backgroundIntensity = bgI; return s; };

  // ---------------------------------------------------------------- 3.2 torque wrench click
  const tw = macroSet(envStudio, 0.5, 0.1); const hub = buildHub(); tw.scene.add(hub); const wrench = buildTorqueWrench(); tw.scene.add(wrench);
  { // macro fidelity: lathe-turned concentric finish on the flange, chamfered hex nuts
    const r = rng(9); const rings = Float32Array.from({ length: 2048 }, () => r());
    // anisotropy direction map: tangential everywhere (concentric turning marks → radial 'bow-tie' highlights)
    const aw = 256, ac = document.createElement('canvas'); ac.width = ac.height = aw; const ag = ac.getContext('2d'); const aimg = ag.createImageData(aw, aw);
    for (let y = 0; y < aw; y++) for (let x = 0; x < aw; x++) { const a = Math.atan2(y - aw / 2 + 0.5, x - aw / 2 + 0.5), i = (y * aw + x) * 4, ring = rings[Math.floor(Math.hypot(x - aw / 2, y - aw / 2) * 4) % 2048]; aimg.data[i] = (-Math.sin(a) * 0.5 + 0.5) * 255; aimg.data[i + 1] = (Math.cos(a) * 0.5 + 0.5) * 255; aimg.data[i + 2] = 215 + ring * 40; aimg.data[i + 3] = 255; }
    ag.putImageData(aimg, 0, 0); const anisoMap = new THREE.CanvasTexture(ac); anisoMap.colorSpace = THREE.NoColorSpace; anisoMap.anisotropy = 8;
    hub.children[0].material = new THREE.MeshPhysicalMaterial({ color: 0xa9aaae, metalness: 1, roughness: 0.34, anisotropy: 0.8, anisotropyMap: anisoMap });
    const h = 0.016, rr = 0.0125, c = 0.0022; const nutGeo = lathe([[0.0056, -h / 2], [rr - c, -h / 2], [rr, -h / 2 + c], [rr, h / 2 - c], [rr - c * 1.3, h / 2], [0.0058, h / 2], [0.0056, h / 2 - 0.001]], 6, Math.PI / 6).toNonIndexed(); nutGeo.computeVertexNormals();
    for (const n of hub.userData.nuts) n.geometry = nutGeo;
  }
  const nut = hub.userData.nuts[0]; wrench.position.copy(nut.position).add(v3(0, 0, 0.03));
  spot(tw.scene, { intensity: 2.2, pos: [0.3, 0.6, 0.6], target: [0, 0.05, 0], angle: 0.4, penumbra: 1, color: 0xf4f6ff });
  spot(tw.scene, { intensity: 1.6, pos: [-0.6, -0.2, 0.3], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffc58a });
  const flashL = point(tw.scene, { intensity: 0, color: 0xfff0d0, pos: [0.02, 0.1, 0.08] });
  tw.onUpdate((t) => {
    const lt = t - 19.1; const turn = smooth(clamp(lt / 0.5)) * 0.35; const click = lt > 0.55 ? Math.exp(-(lt - 0.55) * 16) * Math.sin((lt - 0.55) * 90) * 0.025 : 0;
    wrench.rotation.z = 2.6 - turn + click; flashL.intensity = lt > 0.55 ? Math.exp(-(lt - 0.55) * 20) * 0.08 : 0;
  });
  shots.push(shot('s3.2', 19.1, 20.0, tw, (lt, u, cam) => {
    const k = smooth(u); const base = nut.position; const p = v3(base.x + lerp(0.2, 0.26, k), base.y + lerp(0.12, 0.05, k), base.z + lerp(0.26, 0.3, k));
    const d = aim(cam, p, v3(base.x - lerp(0.02, 0.12, k), base.y - lerp(0.0, 0.08, k), base.z + 0.03), { fov: 32, near: 0.005, far: 20, roll: -0.08 }); return { focus: d, aperture: 9 };
  }, { trans: { type: 'whip', dur: 0.35, dir: [-1, 0] }, grade: { exposure: 1.1, bloom: 0.4, streak: 0.18, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.3 micro-polisher removing swirl marks
  // swirl marks = random micro-scratches in the clear-coat normal: like on real paint they only light up
  // inside the reflection of the light; the polisher's pass leaves the coat optically flat behind it.
  const ps = macroSet(envPolish, 0.5, 0.08); const panel = paintPanel(1.0, 0.6, 0x050505, { clearcoatRoughness: 0.02 }); panel.rotation.x = -Math.PI / 2; ps.scene.add(panel);
  const swirlN = (() => {
    const w = 1024, c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, w); const r = rng(5);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 1400; i++) { const cx = w * r(), cy = w * r(), rad = 30 + r() * 320; const a0 = r() * TAU; g.lineWidth = 0.7 + r() * 0.8; g.beginPath(); g.arc(cx, cy, rad, a0, a0 + 0.2 + r() * 0.7); g.stroke(); }
    const px = g.getImageData(0, 0, w, w).data; return normalTex(w, (x, y) => px[(y * w + x) * 4] / 255, 1.0, [4, 4]);
  })();
  const pm = panel.material; pm.clearcoatNormalMap = swirlN; pm.clearcoatNormalScale = new THREE.Vector2(0.22, 0.22); const clearX = { value: -1 };
  pm.onBeforeCompile = (s) => {
    s.uniforms.clearX = clearX;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWx;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWx = (modelMatrix * vec4(transformed, 1.0)).x;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWx; uniform float clearX;').replace('#include <clearcoat_normal_fragment_maps>', `
      #ifdef USE_CLEARCOAT_NORMALMAP
        vec3 clearcoatMapN = texture2D(clearcoatNormalMap, vClearcoatNormalMapUv).xyz * 2.0 - 1.0;
        clearcoatMapN.xy *= clearcoatNormalScale * smoothstep(clearX - 0.03, clearX + 0.06, vWx);
        clearcoatNormal = normalize(tbn2 * clearcoatMapN);
      #endif`);
  };
  pm.customProgramCacheKey = () => 's3swirl'; pm.needsUpdate = true;
  const polisher = buildPolisher(); ps.scene.add(polisher);
  const strip = lightStrip(ps.scene, { w: 3, h: 0.25, pos: [0.0, 1.0, -1.2], rot: [-0.6, 0, 0], intensity: 3, color: 0xfff1de });
  spot(ps.scene, { intensity: 3, pos: [0.4, 0.8, -0.6], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffd9a8 });
  ps.onUpdate((t) => { const lt = t - 20.0; const x = lerp(-0.32, 0.25, smooth(clamp((lt + 0.2) / 1.2))); polisher.position.set(x + Math.sin(lt * 9) * 0.006, 0.0, 0.02 + Math.cos(lt * 9) * 0.006); polisher.userData.pad.rotation.y = lt * 40; clearX.value = x - 0.05; });
  shots.push(shot('s3.3', 20.0, 20.9, ps, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.05, 0.1, u), 0.07, 0.3), v3(lerp(-0.12, 0.05, u), 0.0, 0.0), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: 12 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.18, threshold: 1.5 } }));

  // ---------------------------------------------------------------- 3.4 paint thickness gauge (analogue)
  const gs = macroSet(envGauge, 0.8, 0.1); gs.scene.backgroundRotation = new THREE.Euler(0, 2.2, 0); const gp = paintPanel(1.0, 0.6, 0x3d0b12); gp.rotation.x = -Math.PI / 2; gs.scene.add(gp);
  const gauge = buildGauge({ min: 0, max: 500, major: 100, minor: 20, label: 'µm', sub: 'paint depth', radius: 0.045 }); gauge.position.set(0.09, 0.07, -0.06); gauge.rotation.set(-0.5, -0.3, 0); gs.scene.add(gauge);
  const probe = new THREE.Group(); probe.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 32), M.matte(0x111111, 0.4), { p: [0, 0.05, 0] })); probe.add(mesh(new THREE.CylinderGeometry(0.009, 0.003, 0.012, 32), M.chrome(), { p: [0, 0.006, 0] })); probe.add(mesh(new THREE.TorusGeometry(0.0092, 0.0012, 8, 32), M.goldPolished(), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] }));
  probe.rotation.z = 0.3; gs.scene.add(probe);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(-0.03, 0.1, 0), v3(-0.02, 0.15, -0.05), v3(0.06, 0.12, -0.09), v3(0.09, 0.06, -0.07)]), 40, 0.002, 6), M.matte(0x0a0a0a, 0.5)); gs.scene.add(cable);
  spot(gs.scene, { intensity: 1.6, pos: [0.2, 0.5, 0.4], target: [0.04, 0.02, -0.03], angle: 0.45, penumbra: 1, color: 0xfff0dc });
  spot(gs.scene, { intensity: 1.2, pos: [-0.4, 0.2, -0.3], target: [0.05, 0.05, -0.05], angle: 0.5, penumbra: 1, color: 0xffb46a });
  gs.onUpdate((t) => { const lt = t - 20.9; const touch = smooth(clamp(lt / 0.3)); probe.position.set(0, lerp(0.02, 0.0, touch), 0); const v = touch * (118 + Math.exp(-lt * 6) * Math.sin(lt * 26) * 30); gauge.userData.setValue(Math.max(0, v)); });
  shots.push(shot('s3.4', 20.9, 21.7, gs, (lt, u, cam) => {
    const d = aim(cam, v3(lerp(-0.12, -0.09, u), 0.05, 0.16), v3(lerp(0.0, 0.07, smooth(u)), lerp(0.01, 0.05, smooth(u)), lerp(0.0, -0.05, smooth(u))), { fov: 30, near: 0.005, far: 20 });
    return { focus: lerp(0.2, d, smooth((u - 0.3) * 2.5)), aperture: 16 };
  }, { trans: { type: 'luma', dur: 0.35 }, grade: { exposure: 1.1, bloom: 0.4, streak: 0.15, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.5 needle-fine pinstripe (on the car itself)
  const brush = buildStripingBrush(); W.add(brush);
  brush.children[3].material = new THREE.MeshPhysicalMaterial({ color: 0x2e1a10, roughness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.08 }); // lacquered handle
  const brushHand = new THREE.Group(); W.add(brushHand);
  const FLANK = v3(0.25, 0.55, 0.8).normalize();
  const stripeAt = (k, o) => { const u = lerp(stripeU0, stripeU1, k); car.shape.body(u, stripePhi + 0.003, o); return u; };
  const placeBrush = (t) => {
    const k = smooth(clamp((t - 21.7) / 1.4)); const tip = new THREE.Vector3(); const u = stripeAt(k, tip); const n = new THREE.Vector3(); car.shape.normal(u, stripePhi, n);
    const nc = n.clone().multiplyScalar(0.25).addScaledVector(FLANK, 0.75).normalize(); // steadied normal: no camera swing over the wheel-arch crest
    brush.position.copy(tip).addScaledVector(n, 0.001); const ax = nc.clone().multiplyScalar(0.4).add(v3(-0.4, 0.8, 0)).normalize(); brush.quaternion.setFromUnitVectors(v3(0, 1, 0), ax);
    brushHand.position.copy(brush.position);
    return { tip, n: nc };
  };
  shots.push(shot('s3.5', 21.7, 23.0, ws, (lt, u, cam, t) => {
    hand.visible = false; brush.visible = brushHand.visible = true; const { tip, n } = placeBrush(t);
    const p = tip.clone().addScaledVector(n, 0.22).add(v3(0.16, 0.08, 0)); const d = aim(cam, p, tip.clone().add(v3(-0.03, 0.02, 0)), { fov: 30, near: 0.005, far: 80 });
    return { focus: d, aperture: 10 };
  }, { prep: (lt, u, t) => { hand.visible = false; brush.visible = brushHand.visible = true; }, trans: { type: 'whip', dur: 0.3, dir: [-1, 0.1] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.18, threshold: 1.4 } }));

  // ---------------------------------------------------------------- 3.6 pull out: the team, orbit, crane up
  shots.push(shot('s3.6', 23.0, 30.0, ws, (lt, u, cam, t) => {
    hand.visible = false; const { tip, n } = placeBrush(t); brush.visible = brushHand.visible = lt < 1.2;
    const k = clamp(u); const orbitA = lerp(0.2, -1.9, smooth(invLerp(0.12, 0.72, k))); const R = lerp(0.3, 7.5, easeOutCubic(invLerp(0.0, 0.25, k)));
    let p = v3(Math.sin(orbitA) * R, lerp(0.8, 2.2, smooth(invLerp(0.05, 0.3, k))), Math.cos(orbitA) * R + 0.4);
    const crane = smooth(invLerp(0.7, 1.0, k)); p = p.lerp(v3(-2.5, 6.4, 9.5), crane);
    if (k < 0.1) p = tip.clone().addScaledVector(n, lerp(0.22, 1.2, k / 0.1)).add(v3(0.16, 0.08 + k * 4, 0));
    const tgt = new THREE.Vector3().lerpVectors(tip, v3(-0.5, 0.6, -0.6), smooth(invLerp(0.0, 0.2, k))).lerp(v3(-1.0, 0.0, -2.0), crane);
    const d = aim(cam, p, tgt, { fov: lerp(28, 40, smooth(k * 3)), near: 0.01, far: 120 });
    return { focus: d, aperture: lerp(14, 1.2, smooth(k * 4)) };
  }, { prep: () => { hand.visible = false; }, trans: { type: 'cut', dur: 0 }, grade: { exposure: 1.1, bloom: 0.35, streak: 0.12, threshold: 1.5, gain: [0.98, 1.0, 1.03] } }));
  // hide macro rigs when not used
  shots[0].prep = () => { hand.visible = true; brush.visible = brushHand.visible = false; };
  return { shots, car };
}
