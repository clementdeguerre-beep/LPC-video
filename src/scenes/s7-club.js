// SCENE 7 (62–72s) — THE CLUB. Crystal clink, numbered metal card on dark wood, watch on a wrist at
// the gear lever, a handshake by a car door → the members' lounge: fireplace, leather, cars beyond glass.
//
// Realism: the club sits on a real photographed waterfront at sunset (Poly Haven "venice_sunset"). The toast is
// framed against that very sunset, defocused over the lagoon; the card and the watch are lit and reflected by a real
// interior panorama re-graded low-key (window and sconces glint in titanium, lacquered walnut and gold). The handshake
// uses two hands sculpted as signed-distance fields (palm pads, knuckles, tapered phalanges, nails) polygonised into
// one continuous skin each, with wrapped subsurface shading, beside the photoreal CarConcept in burgundy reflecting
// a real hall. The lounge opens through steel windows onto the panorama projected on the ground (the cars stand on
// its stone quay, the photographed sun sets over the water and streams in as a low warm light), with real photo
// materials (oak planks, timber ceiling, brick) and photoreal furnishings: carved-wood leather sofa, champagne velvet
// sofa, silk pouf, velvet chairs, Tiffany lamps, flowers, a bellows camera and brushed-brass barn sconces raking the brick.
import { THREE, makeSet, spot, point, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, easeInOutCubic } from './common.js';
import { buildFigure, POSES } from '../models/figure.js';
import { mesh, roundBox, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { drawTexture, drawEmblem, FONT_SERIF, guilloche, fromHeight, fromFn, tex } from '../engine/textures.js';
import { easeOutCubic, TAU, noise1, fbm2 } from '../engine/util.js';
import { hdri, HDRI, photo, model, hide, selectVariant, groundedBackdrop } from '../engine/assets.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Look constants.
const VIEW = { k: 0.28, rot: -0.25, x: 8, z: 13, clamp: 25, sun: 1.2 }; // lounge view: panorama brightness, yaw, projection centre, sun-disc clamp, sunlight
const FLOOR_CCR = 0.3; // lounge floor lacquer roughness (spreads the low sun's glare into a soft sheen)
const HSKIN = 0x958d89, WSKIN = 0xa38d7c; // hand / wrist skin tints (neutral beige: the warm light and grade supply the warmth)
const HAND_RES = 128, HKEY = 0.2, HTILT = 0.04, HAPT = 70; // hand polygonisation grid, handshake key (rim-lit near-silhouette), clasp tilt, aperture
const CARD = { aniso: 0.85 }; // brushed titanium card face
const CP = { blur: 0.08, k: 0.15, rot: 2.35, env: 0.15, edge: [0.7, 0.62, 0.5] }; // coupes: sunset backdrop defocus, brightness, yaw; crystal reflections; grazing-edge absorption
const FIRE_YAW = -1.0, CAM_YAW = -0.27; // flames face the lounge camera path; the bellows camera is trained on the cars outside
const SCONCES = [[-6.2, -4.8, 0], [-3.6, -4.8, 0], [2.6, -4.8, 0], [5.3, 3.7, -Math.PI / 2], [5.3, -4.15, -Math.PI / 2]], SC_I = 30, SC_BULB = [0.073, -0.012]; // [x, z of the wall, facing]; bulb [height above the fixture base, offset from its anchor]

// ------------------------------------------------------------------------------------------------
// Photographic light

/**
 * A real HDR panorama re-graded for a low-key interior: pixels brighter than lo..hi (windows, lamps,
 * tubes) keep their photographed HDR value, everything else is crushed and warmed. Baked to a PMREM.
 */
const _envs = new Map();
async function gradedEnv(renderer, name, o = {}) {
  const id = name + JSON.stringify(o); if (_envs.has(id)) return _envs.get(id);
  const { wall = 0.06, floor = 0.03, lo = 1, hi = 4, floorKeep = 0.25, tint = [1, 0.8, 0.6], light = [1, 0.93, 0.82], max = 40, gain = 1, size = 256 } = o;
  const H = await hdri(name);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: H.equirect }, wall: { value: wall }, floorK: { value: floor }, lo: { value: lo }, hi: { value: hi }, floorKeep: { value: floorKeep }, mx: { value: max }, gain: { value: gain }, tintC: { value: new THREE.Vector3(...tint) }, lightC: { value: new THREE.Vector3(...light) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `#include <common>
      uniform sampler2D map; uniform float wall, floorK, lo, hi, floorKeep, mx, gain; uniform vec3 tintC, lightC; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); vec3 c = texture2D(map, equirectUv(d)).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float up = smoothstep(-0.12, 0.04, d.y); float keep = smoothstep(lo, hi, l) * mix(floorKeep, 1.0, up);
        c *= mix(mix(floorK, wall, up) * tintC, lightC, keep);
        float k = max(max(c.r, c.g), c.b); if (k > mx) c *= mx / k;
        gl_FragColor = vec4(c * gain, 1.0);
      }`,
  });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 96, 48), mat));
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(sc, 0, 0.1, 100, { size }).texture; pm.dispose(); mat.dispose();
  _envs.set(id, t); return t;
}

/** Use a PMREM as a set's environment (+ optional defocused photographic backdrop). */
function lightWith(scene, env, { k = 1, rot = 0, bg = 0, blur = 0.4 } = {}) {
  scene.environment = env; scene.environmentIntensity = k; scene.environmentRotation.set(0, rot, 0);
  if (bg > 0) { scene.background = env; scene.backgroundBlurriness = blur; scene.backgroundIntensity = bg; scene.backgroundRotation.set(0, rot, 0); }
}
/** Per-material reflection strength (three ignores envMapIntensity unless envMap is set on the material). */
function envK(mat, scene, k) { mat.envMap = scene.environment; mat.envMapIntensity = k * scene.environmentIntensity; mat.envMapRotation.copy(scene.environmentRotation); mat.needsUpdate = true; return mat; }

// ------------------------------------------------------------------------------------------------
// Real-scale photo materials

/** Plane whose UVs are in real-world tiles (photo textures keep their physical scale on any size). */
const tilePlane = (w, h, tw, th = tw) => { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tw, (uv.getY(i) * h) / th); return g; };

async function photoMaps(kind, { repeat = [1, 1], rotation = 0, offset = [0, 0] } = {}) {
  const b = `textures/${kind}_`;
  const src = await Promise.all([photo(b + 'diffuse.jpg'), photo(b + 'bump.jpg', { srgb: false }), photo(b + 'roughness.jpg', { srgb: false })]);
  return src.map((t) => { const c = t.clone(); c.repeat.set(...repeat); c.offset.set(...offset); c.center.set(0.5, 0.5); c.rotation = rotation; return c; });
}
/** Real hardwood (planks, knots, grain) stained dark and lacquered; or real brick. */
async function photoMat(kind, { color = 0xffffff, bump = 1, rough = 1, clearcoat = 0, ccRough = 0.1, sheen = 0, ...o } = {}) {
  const [map, bumpMap, roughnessMap] = await photoMaps(kind === 'wood' ? 'hardwood2' : 'brick', o);
  return new THREE.MeshPhysicalMaterial({ color, map, bumpMap, bumpScale: bump, roughnessMap, roughness: rough, metalness: 0, clearcoat, clearcoatRoughness: ccRough, sheen, sheenColor: new THREE.Color(0x6a4a3a) });
}

/**
 * Continuous furniture veneer from the real hardwood photo, with no butt joints, grooves or knots: four knot-free planks are cut
 * out of the photo (diffuse, bump and roughness alike) and laid edge to edge with 24 px feathered seams, like flitches of one
 * log, at the photo's full resolution. Plane UVs: u along the grain (0..1 = one plank length, keep the repeat under 1, it does
 * not wrap), v across (1 = the four flitches; wraps seamlessly).
 */
const FLITCH = { cuts: [[1000, 10], [615, 140], [615, 396], [615, 908]], w: 930, h: 108, ov: 24 }; // [x, y] of 930×108 px cuts in hardwood2 (2048×1024)
const _veneer = new Map();
async function veneerMaps() {
  if (_veneer.has('m')) return _veneer.get('m');
  const src = await Promise.all([photo('textures/hardwood2_diffuse.jpg'), photo('textures/hardwood2_bump.jpg', { srgb: false }), photo('textures/hardwood2_roughness.jpg', { srgb: false })]);
  const { cuts, w, h, ov } = FLITCH, pitch = h - ov, ch = cuts.length * pitch;
  const out = src.map((t, i) => {
    // read the four cuts once (a single drawImage + readback each), then blend rows in JS: weights sum to 1 across each seam
    const im = t.image, k = im.width / 2048, sw = Math.round(w * k), sh = Math.round(h * k);
    const cut = cuts.map(([sx, sy]) => { const c = document.createElement('canvas'); c.width = sw; c.height = sh; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, sx * k, sy * k, sw, sh, 0, 0, sw, sh); return g.getImageData(0, 0, sw, sh).data; }); // CPU canvas: no GPU readback stall
    const c = document.createElement('canvas'); c.width = 1024; c.height = ch; const g = c.getContext('2d'); const img = g.createImageData(1024, ch), d = img.data;
    for (let y = 0; y < ch; y++) cuts.forEach((_, j) => {
      const ly = (((y - (j * pitch - ov / 2)) % ch) + ch) % ch; if (ly >= h) return;
      const wgt = ly < ov ? (ly + 0.5) / ov : ly >= h - ov ? (h - ly - 0.5) / ov : 1; const row = Math.min(sh - 1, Math.round(ly * k)) * sw * 4, src = cut[j];
      for (let x = 0; x < 1024; x++) { const fx = (x / 1023) * (sw - 1), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), f = fx - x0, o = (y * 1024 + x) * 4, a = row + x0 * 4, b = row + x1 * 4;
        for (let q = 0; q < 3; q++) d[o + q] += (src[a + q] * (1 - f) + src[b + q] * f) * wgt; d[o + 3] = 255; }
    });
    g.putImageData(img, 0, 0);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.wrapS = THREE.ClampToEdgeWrapping; tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8; return tx;
  });
  _veneer.set('m', out); return out;
}
/** Lacquered walnut veneer material (photo flitches, stained dark). along: plank lengths over the plane's u; across: flitch sets over v.
 *  Real scale: one plank ≈ 0.46 m long, one set of four flitches ≈ 0.165 m wide. */
async function veneerMat({ color = 0x5a3a2c, bump = 0.4, rough = 0.85, clearcoat = 1, ccRough = 0.07, along = 0.9, across = 1, offset = [0, 0] } = {}) {
  const [map, bumpMap, roughnessMap] = (await veneerMaps()).map((t) => { const c = t.clone(); c.repeat.set(along, across); c.offset.set(...offset); return c; });
  return new THREE.MeshPhysicalMaterial({ color, map, bumpMap, bumpScale: bump, roughnessMap, roughness: rough, metalness: 0, clearcoat, clearcoatRoughness: ccRough });
}

/** drawNormal (engine/textures.js) on a CPU-backed canvas: same result, without the multi-second first GPU-canvas readback
 *  stall of the software renderer. Height drawn with canvas (white = raised) → bevelled normal map. */
function drawNormalCPU(w, h, draw, strength = 3) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); draw(ctx, w, h);
  const px = ctx.getImageData(0, 0, w, h).data; const hgt = new Float32Array(w * h), out = new Float32Array(w * h); for (let i = 0; i < w * h; i++) hgt[i] = px[i * 4] / 255;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sum = 0, n = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { sum += hgt[clamp(y + oy, 0, h - 1) * w + clamp(x + ox, 0, w - 1)]; n++; } out[y * w + x] = sum / n; }
    hgt.set(out);
  }
  const t = tex(fromHeight(hgt, w, h, strength, false)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Normal map from a height function (RepeatWrapping). */
function heightNormal(w, fn, strength = 2, repeat = [1, 1]) {
  const H = new Float32Array(w * w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) H[y * w + x] = fn(x, y);
  return tex(fromHeight(H, w, w, strength), { repeat });
}
let _weave = null, _pores = null;
const weave = () => (_weave ??= heightNormal(128, (x, y) => 0.5 + 0.35 * Math.sin(((x + y * 2) / 6) * TAU) + 0.2 * fbm2(x / 2, y / 2, 2, 7, 64), 1.1, [1, 1]));
const pores = () => (_pores ??= heightNormal(256, (x, y) => fbm2(x / 3, y / 3, 3, 11, 256 / 3) * 0.7 + fbm2(x / 22, y / 9, 2, 13, 256 / 22) * 0.3, 0.9, [1, 1]));

// fine skin relief: pores, a rhombic micro-wrinkle lattice and soft transverse creases (wrist and back of the hand)
let _skinRelief = null, _oxford = null, _creases = null;
const skinRelief = () => (_skinRelief ??= heightNormal(256, (x, y) => {
  const a = (x + y) / 16, b = (x - y) / 16; const lat = Math.pow(Math.abs(Math.sin(a * Math.PI)), 0.35) + Math.pow(Math.abs(Math.sin(b * Math.PI)), 0.35);
  const crease = Math.pow(Math.abs(Math.sin((y / 256) * 7 * Math.PI + fbm2(x / 32, y / 32, 2, 41, 8) * 2.5)), 0.25) * fbm2(x / 64, y / 64, 2, 43, 4);
  return fbm2(x / 2, y / 2, 2, 11, 128) * 0.45 + lat * 0.18 * (0.5 + fbm2(x / 32, y / 32, 2, 45, 8)) + crease * 0.35;
}, 1.4));
// knuckle creases: tight, slightly wavy lines across the finger (constant u), as on the back of a finger joint
const knuckleCreases = () => (_creases ??= heightNormal(256, (x, y) => { const w = fbm2(x / 64, y / 64, 2, 47, 4) * 10; const l = Math.abs(Math.sin(((x + w + Math.sin((y / 256) * TAU) * 6) / 256) * 9 * Math.PI)); return -Math.pow(1 - l, 8) * (0.6 + 0.4 * fbm2(x / 16, y / 16, 2, 49, 16)); }, 3));
// oxford cotton: basket of soft yarns with slubs, fine enough to read as cloth, large enough to resolve at macro
const oxfordH = (x, y) => {
  const cx = x % 16, cy = y % 16, ix = Math.floor(x / 16), iy = Math.floor(y / 16); const over = (ix + iy) % 2 === 0;
  const warp = Math.sin((cx / 16) * Math.PI), weft = Math.sin((cy / 16) * Math.PI); const fib = fbm2(x / 2, y / 2, 2, 51, 128) * 0.25;
  return (over ? warp * 0.8 + weft * 0.25 : weft * 0.8 + warp * 0.25) + fib + fbm2(x / 32, y / 32, 2, 53, 8) * 0.2;
};
const oxford = () => (_oxford ??= { normal: heightNormal(256, oxfordH, 2.2), map: tex(fromFn(256, 256, (x, y, o) => { const k = clamp(0.8 + oxfordH(x, y) * 0.16) * 255; o[0] = k; o[1] = k; o[2] = k; o[3] = 255; }), { srgb: true }) });
// wrist albedo: low-frequency tone (redder over the bones and toward the hand, paler underneath), faint blue-green veins on top
let _wristA = null;
const wristAlbedo = () => (_wristA ??= tex(fromFn(512, 512, (x, y, o) => {
  const u = x / 512, v = y / 512; const n = fbm2(x / 70, y / 70, 3, 61, 512 / 70), m = fbm2(x / 18, y / 18, 2, 63, 512 / 18);
  const top = Math.exp(-(((u - 0.55) / 0.22) ** 2)), front = Math.exp(-(((u - 0.75) / 0.12) ** 2)), under = Math.exp(-(((u - 0.0) / 0.18) ** 2)) + Math.exp(-(((u - 1.0) / 0.18) ** 2));
  const red = clamp((n - 0.42) * 1.6) * 0.5 + top * 0.12 + clamp((v - 0.7) * 2) * 0.15 + front * 0.08;
  let vein = 0; for (const [u0, f, a] of [[0.52, 2.1, 0.035], [0.6, 1.4, 0.03], [0.68, 2.7, 0.025]]) { const c = u0 + Math.sin(v * f * Math.PI + u0 * 9) * a + (fbm2(v * 9, u0 * 20, 2, 65, 9) - 0.5) * 0.03; vein += Math.exp(-(((u - c) / 0.006) ** 2)) * clamp((v - 0.35) * 3) * (0.6 + 0.4 * m); }
  vein = clamp(vein) * top * 0.85; const k = 0.92 + m * 0.08 + under * 0.05;
  o[0] = clamp(k * (240 - vein * 52 + red * 8), 0, 255); o[1] = clamp(k * (220 - red * 38 - vein * 14), 0, 255); o[2] = clamp(k * (204 - red * 36 + vein * 20), 0, 255); o[3] = 255;
}), { srgb: true }));

const goldMat = (rough = 0.1, color = 0xe2b872) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough });
let _skinA = null;
// skin albedo: even tone with soft blotches of redness, faint freckling and pore darkening (no large stains)
const skinAlbedo = () => (_skinA ??= tex(fromFn(256, 256, (x, y, o) => {
  const n = fbm2(x / 24, y / 24, 3, 31, 256 / 24), f = fbm2(x / 2.5, y / 2.5, 2, 33, 256 / 2.5), fr = fbm2(x / 6, y / 6, 2, 35, 256 / 6);
  const red = clamp((n - 0.45) * 2.2) * 0.5, pore = f > 0.72 ? 0.9 : 1, frk = fr > 0.8 ? 0.93 : 1; const k = (0.95 + f * 0.05) * pore * frk;
  o[0] = clamp(k * 246, 0, 255); o[1] = clamp(k * (226 - red * 26), 0, 255); o[2] = clamp(k * (214 - red * 24), 0, 255); o[3] = 255; }), { srgb: true }));
const skinMat = () => new THREE.MeshPhysicalMaterial({ color: 0x8c6a5a, map: skinAlbedo(), roughness: 0.6, metalness: 0, normalMap: pores(), normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xb08878), clearcoat: 0.06, clearcoatRoughness: 0.45 });
const woolMat = (color) => { const n = weave().clone(); n.repeat.set(26, 18); return new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45), sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0x8a8f9a), 0.35) }); };

// ------------------------------------------------------------------------------------------------
// Crystal and champagne

function coupeProfile() {
  const P = [[0.0001, 0], [0.036, 0], [0.039, 0.0015], [0.036, 0.004], [0.012, 0.008], [0.0045, 0.016], [0.0038, 0.06], [0.0054, 0.07], [0.0038, 0.08], [0.004, 0.1], [0.007, 0.108]];
  const E = (a, b, f) => [a * Math.sin(f), 0.16 - b * Math.cos(f)];
  for (let i = 1; i <= 18; i++) P.push(E(0.062, 0.052, 0.16 + (Math.PI / 2 - 0.16) * (i / 18)));
  P.push([0.0628, 0.1615], [0.0618, 0.1625]);
  for (let i = 18; i >= 0; i--) P.push(E(0.0605, 0.0485, 0.05 + (Math.PI / 2 - 0.05) * (i / 18)));
  P.push([0.0001, 0.1115]); return P;
}
// clear crystal: no diffuse, only its Fresnel reflections and glints are added over what lies behind
const crystalMat = () => new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.0, transparent: true, blending: THREE.AdditiveBlending, ior: 1.5, specularIntensity: 0.3, clearcoat: 0, side: THREE.DoubleSide, depthWrite: false });
/** What crystal takes away: at grazing angles the thick glass refracts the dark surroundings in, so silhouettes of bowl and stem
 *  read as fine warm-dark lines (multiplied over the backdrop and champagne) instead of glowing outlines. */
const crystalEdgeMat = (tint = CP.edge) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.MultiplyBlending, premultipliedAlpha: true, uniforms: { tint: { value: new THREE.Vector3(...tint) } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vN = normalize(normalMatrix * normal); vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
  // solid stem and foot (profile y < 0.108): a thick rod refracts more of the dark room, so its edges are wider and darker
  fragmentShader: 'uniform vec3 tint; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float c = abs(dot(normalize(vN), normalize(vV))); float stem = 1.0 - smoothstep(0.1, 0.11, vY); float f = pow(1.0 - c, mix(2.2, 1.1, stem)); gl_FragColor = vec4(mix(vec3(1.0), tint * mix(1.0, 0.75, stem), f), 1.0); }',
});

/** Champagne coupe (rim at height h): crystal, champagne, rising bead trains and a fine mousse ring. */
export function crystalGlass(h = 0.19, { bubbles = 48, seed = 5, edge = true } = {}) {
  const g = new THREE.Group(); const yF = 0.149; const geo = lathe(coupeProfile(), 72);
  const glass = mesh(geo, crystalMat()); glass.renderOrder = 4; g.add(glass);
  if (edge) { const e = mesh(geo, crystalEdgeMat()); e.renderOrder = 3; g.add(e); }
  const lq = [[0.0001, 0.1121]]; const fF = Math.acos((0.16 - yF) / 0.0485);
  for (let i = 0; i <= 14; i++) { const f = 0.05 + (fF - 0.05) * (i / 14); lq.push([0.0602 * Math.sin(f), 0.16 - 0.0482 * Math.cos(f)]); }
  lq.push([0.0001, yF]);
  const lqGeo = lathe(lq, 64);
  const tintL = mesh(lqGeo, new THREE.MeshBasicMaterial({ color: 0xe6b45a, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false })); tintL.renderOrder = 1; g.add(tintL); // light through champagne turns gold
  const glowL = mesh(lqGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.11, 0.028), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glowL.renderOrder = 1; g.add(glowL); // light scattered inside
  const surf = mesh(lathe([[0.0001, yF], [0.0601 * Math.sin(fF), yF]], 64), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); surf.renderOrder = 2; g.add(surf); // meniscus reflections
  const rF = 0.0602 * Math.sin(fF);
  const mousse = mesh(new THREE.TorusGeometry(rF - 0.0011, 0.0009, 6, 72), new THREE.MeshPhysicalMaterial({ color: 0xf2e2c2, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }), { p: [0, yF, 0], r: [Math.PI / 2, 0, 0] });
  mousse.renderOrder = 2; g.add(mousse);
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.84).multiplyScalar(1.15), transparent: true, opacity: 0.9, depthWrite: false }), bubbles);
  bub.renderOrder = 2; bub.frustumCulled = false; g.add(bub);
  const r = rng(seed); const trains = Array.from({ length: 4 }, () => [r.range(-0.006, 0.006), r.range(-0.006, 0.006), r.range(0.45, 0.7)]); const ph = Array.from({ length: bubbles }, () => r());
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  g.userData.update = (t) => {
    for (let i = 0; i < bubbles; i++) {
      const [bx, bz, sp] = trains[i % trains.length]; const k = (t * sp + ph[i]) % 1; const y = 0.1125 + k * (yF - 0.1135);
      const wob = Math.sin(t * 9 + i) * 0.0004 * k; pv.set(bx * (1 + k * 1.5) + wob, y, bz * (1 + k * 1.5)); sv.setScalar(0.00035 + k * 0.0006);
      m4.compose(pv, q, sv); bub.setMatrixAt(i, m4);
    }
    bub.instanceMatrix.needsUpdate = true;
  };
  g.userData.update(0); g.scale.setScalar(h / 0.1625); return g;
}

// ------------------------------------------------------------------------------------------------
// Watch, wrist and tailoring (real scale, metres)

let _dial = null;
function dialTextures() {
  if (_dial) return _dial;
  const map = drawTexture(512, 512, (g, w) => {
    const c = w / 2; const grd = g.createRadialGradient(c, c, 0, c, c, c); grd.addColorStop(0, '#1b1612'); grd.addColorStop(0.75, '#0d0b0a'); grd.addColorStop(1, '#060505');
    g.fillStyle = grd; g.fillRect(0, 0, w, w); g.strokeStyle = '#cfa862'; g.fillStyle = '#cfa862';
    for (let i = 0; i < 60; i++) { if (i % 5 === 0) continue; const a = (i / 60) * TAU; g.lineWidth = 2.2; g.beginPath(); g.moveTo(c + Math.sin(a) * c * 0.895, c - Math.cos(a) * c * 0.895); g.lineTo(c + Math.sin(a) * c * 0.955, c - Math.cos(a) * c * 0.955); g.stroke(); }
    g.lineWidth = 1.6; for (const k of [0.965, 0.885]) { g.beginPath(); g.arc(c, c, c * k, 0, TAU); g.stroke(); }
    drawEmblem(g, c, c - c * 0.4, c * 0.17, { fill: '#cfa862', stroke: '#cfa862' });
  });
  _dial = { map, normalMap: tex(fromHeight(guilloche(512, 46), 512, 512, 1.2, false)) }; return _dial;
}

const handGeo = (len, w, tail) => {
  const s = new THREE.Shape(); s.moveTo(0, -tail); s.lineTo(w, len * 0.14); s.lineTo(0, len); s.lineTo(-w, len * 0.14); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.00012, bevelEnabled: true, bevelThickness: 0.00018, bevelSize: 0.00014, bevelSegments: 1 }); geo.rotateX(-Math.PI / 2); return geo;
};

/** Gold dress watch, real scale (case Ø 39 mm). Face +y, 12 o'clock toward -z, crown +x. */
function luxuryWatch() {
  const g = new THREE.Group(); const R = 0.0195; const gold = goldMat(0.07), satin = goldMat(0.24), applied = goldMat(0.17, 0xf2cc8c);
  g.add(mesh(lathe([[0.0001, -0.0045], [R * 0.9, -0.0045], [R * 1.02, -0.0037], [R * 1.075, -0.0015], [R * 1.08, 0.0015], [R * 1.06, 0.0032], [R * 1.02, 0.0042], [R * 0.985, 0.0047], [R * 0.955, 0.0047], [R * 0.95, 0.004]], 128), gold));
  g.add(mesh(new THREE.TorusGeometry(R * 1.0, 0.00045, 8, 128), satin, { p: [0, 0.0044, 0], r: [Math.PI / 2, 0, 0] }));
  const { map, normalMap } = dialTextures();
  g.add(mesh(new THREE.CircleGeometry(R * 0.955, 96), new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.22, 0.22), metalness: 0.5, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.1 }), { p: [0, 0.0036, 0], r: [-Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU; const rr = R * 0.73;
    for (const o of i === 0 ? [-0.0011, 0.0011] : [0]) { const b = mesh(new THREE.BoxGeometry(i % 3 ? 0.0009 : 0.0012, 0.0006, i % 3 ? 0.0034 : 0.0044), applied); b.position.set(Math.sin(a) * rr + Math.cos(a) * o, 0.0039, -Math.cos(a) * rr + Math.sin(a) * o); b.rotation.y = -a; g.add(b); }
  }
  const hh = new THREE.Group(); hh.position.y = 0.0042; hh.add(mesh(handGeo(R * 0.5, 0.0012, 0.002), applied)); g.add(hh);
  const mh = new THREE.Group(); mh.position.y = 0.0046; mh.add(mesh(handGeo(R * 0.8, 0.001, 0.0026), applied)); g.add(mh);
  const sh = new THREE.Group(); sh.position.y = 0.005; sh.add(mesh(new THREE.BoxGeometry(0.00022, 0.00018, R * 0.98), gold, { p: [0, 0, -(R * 0.49 - 0.0042)] })); sh.add(mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.0002, 20), gold, { p: [0, 0, 0.0034] })); g.add(sh);
  g.add(mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.0012, 20), gold, { p: [0, 0.0051, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0028, 22), new THREE.MeshPhysicalMaterial({ color: 0xe2b872, metalness: 1, roughness: 0.14, flatShading: true }), { p: [R * 1.08 + 0.0019, 0, 0], r: [0, 0, Math.PI / 2] }));
  g.add(mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0016, 12), gold, { p: [R * 1.08 + 0.0002, 0, 0], r: [0, 0, Math.PI / 2] }));
  const horn = lugHorn(), lugM = goldMat(0.5, 0xd2a866); for (const sx of [1, -1]) for (const sz of [1, -1]) g.add(mesh(horn, lugM, { p: [sx * 0.0112, 0, 0], r: [0, sz > 0 ? 0 : Math.PI, 0] })); // tapered, satin-brushed lug horns
  const th = 0.26, Rc = (R * 0.955) / Math.sin(th);
  const cr = mesh(new THREE.SphereGeometry(Rc, 96, 10, 0, TAU, 0, th), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: 0.05, clearcoat: 1, specularIntensity: 1, ior: 1.76, depthWrite: false }), { p: [0, 0.0043 - Rc * Math.cos(th), 0] });
  cr.renderOrder = 2; g.add(cr);
  g.userData = { R, crystal: cr.material, lugs: lugM, set: (sec) => { sh.rotation.y = -(sec / 60) * TAU; mh.rotation.y = -((sec / 3600) % 1) * TAU; hh.rotation.y = -((sec / 43200) % 1) * TAU; } };
  g.userData.set(10 * 3600 + 9 * 60 + 12); return g;
}

/** Tube swept along +x through stations [x, ky, kz] with a super-elliptic cross-section (seam underneath). */
function sweepX(stations, ry, rz, { n = 64, p = 2.6, uvScale = [1, 1], deform = null, arc = false } = {}) {
  const pos = [], uv = [], idx = [];
  // v: station index (default) or, with arc, profile arc length in metres × uvScale[1] (even texel density over rolled hems)
  let s = 0; const sv = stations.map(([x, ky, kz], i) => { if (i) { const [x0, ky0, kz0] = stations[i - 1]; s += Math.hypot(x - x0, ((ky - ky0) * ry + (kz - kz0) * rz) / 2); } return arc ? s * uvScale[1] : (i / (stations.length - 1)) * uvScale[1]; });
  stations.forEach(([x, ky, kz], i) => {
    for (let j = 0; j <= n; j++) { const th = Math.PI + (j / n) * TAU; const c = Math.cos(th), s = Math.sin(th); const d = deform ? deform(x, c, s, j / n) : 1; pos.push(x, ry * ky * d * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), rz * kz * d * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)); uv.push((j / n) * uvScale[0], sv[i]); }
  });
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const supPt = (th, ry, rz, p = 2.6) => { const c = Math.cos(th), s = Math.sin(th); return [ry * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / p)]; };

/** Shirt cuff, real scale: double-folded hem band, a rolled edge, a soft buckle in the cloth and a tone-on-tone stitch line.
 *  Lies along +x around a wrist of radii (ry, rz); the edge sits at xe, the cuff runs back to x0. Returns a Group. */
function shirtCuff(xe, x0, ry, rz, { k = [1.28, 1.15], T = 0.0024, mat, stitchMat, fold = 1, n = 96, weave = [26, 260] } = {}) {
  const kH = [k[0] + 0.0006 / ry, k[1] + 0.0006 / rz], kIn = [kH[0] - T / ry, kH[1] - T / rz]; // hem band stands 0.6 mm proud (folded twice)
  const st = [[x0, k[0], k[1]], [xe - 0.012, k[0], k[1]], [xe - 0.0095, kH[0], kH[1]]];
  for (let i = 0; i <= 10; i++) { const f = (i / 10) * Math.PI; const r = T / 2; st.push([xe - r + Math.sin(f) * r, kH[0] - (r - Math.cos(f) * r) / ry, kH[1] - (r - Math.cos(f) * r) / rz]); } // rolled edge
  st.push([xe - 0.006, kIn[0], kIn[1]], [xe - 0.02, kIn[0] - 0.01, kIn[1] - 0.01]);
  // the cloth is not a tube: a gentle oval, a soft buckle near the top-front and a shallow fold that dies away from the edge
  const deform = (x, c, s, u) => { const e = clamp(1 - (xe - x) / 0.05); const th = Math.PI + u * TAU; return 1 + fold * (0.012 * Math.sin(2 * th + 0.6) + e * (0.018 * Math.sin(3 * th + 2.2) - 0.022 * Math.exp(-(((th - 2.35 * Math.PI) / 0.18) ** 2)))); };
  const g = new THREE.Group(); const m = new THREE.Mesh(sweepX(st, ry, rz, { n, uvScale: weave, deform, arc: true }), mat); m.material.side = THREE.DoubleSide; g.add(m);
  // stitch line 4 mm from the edge, following the deformed surface
  const xs = xe - 0.0042, ns = 64; const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.00036, 0.0019, 0.0006), stitchMat, ns); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < ns; i++) {
    const u = (i + 0.5) / ns, th = Math.PI + u * TAU, d = deform(xs, Math.cos(th), Math.sin(th), u) * 1.006; const [y, z] = supPt(th, ry * kH[0] * d, rz * kH[1] * d);
    const [y2, z2] = supPt(th + 0.01, ry * kH[0] * d, rz * kH[1] * d); e.set(Math.atan2(z2 - z, y2 - y), 0, 0); // long axis along the circumference q.setFromEuler(e); m4.compose(new THREE.Vector3(xs, y, z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4);
  }
  g.add(im); return g;
}

/** Watch lug as a tapered horn: leaves the case flank, sweeps out and down toward the wrist and ends in a rounded tip (along +z). */
function lugHorn({ z0 = 0.0165, z1 = 0.0258, y0 = 0.0006, drop = 0.0052, w = [0.0017, 0.0012], h = [0.0019, 0.0011], n = 28 } = {}) {
  const pos = [], idx = []; const rows = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; rows.push([z0 + (z1 - z0) * t, y0 - drop * t * t, lerp(w[0], w[1], t), lerp(h[0], h[1], t)]); }
  const [zt, yt, wt, ht] = rows.at(-1); for (let i = 1; i <= 6; i++) { const f = (i / 6) * (Math.PI / 2); rows.push([zt + Math.sin(f) * ht * 0.9, yt - drop * 0.05 * Math.sin(f), wt * Math.cos(f) + 1e-5, ht * Math.cos(f) + 1e-5]); }
  rows.forEach(([z, y, a, b]) => { for (let j = 0; j <= n; j++) { const th = (j / n) * TAU, c = Math.cos(th), s = Math.sin(th); pos.push(a * Math.sign(c) * Math.pow(Math.abs(c), 2 / 4), y + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / 4), z); } });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); } // outward normals
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

/** Leather strap ribbon along a y–z path (thickness grows outward), with saddle-stitching along both edges. */
function strap(points, cy, w, t, leather, thread) {
  const cv = new THREE.CatmullRomCurve3(points.map(([y, z]) => new THREE.Vector3(0, y, z))); const L = cv.getLength(); const segs = 48;
  const frame = (u) => { const p = cv.getPointAt(u), tg = cv.getTangentAt(u); let ny = tg.z, nz = -tg.y; if (ny * (p.y - cy) + nz * p.z < 0) { ny = -ny; nz = -nz; } return { p, tg, ny, nz }; };
  const pos = [], uv = [], idx = [];
  for (const [l0, l1] of [[[-1, 0], [1, 0]], [[1, 1], [-1, 1]], [[-1, 1], [-1, 0]], [[1, 0], [1, 1]]]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) { const u = i / segs; const { p, ny, nz } = frame(u); for (const [sx, k] of [l0, l1]) { pos.push((sx * w) / 2, p.y + ny * t * k, p.z + nz * t * k); uv.push((u * L) / 0.03, sx > 0 ? 1 : 0); } }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = new THREE.Group(); const m = new THREE.Mesh(geo, leather); m.material.side = THREE.DoubleSide; g.add(m);
  const nSt = Math.floor((L * 0.55) / 0.0027); const st = new THREE.InstancedMesh(new THREE.BoxGeometry(0.00045, 0.0003, 0.0017), thread, nSt * 2); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let k = 0; for (let i = 0; i < nSt; i++) { const u = 0.03 + (i * 0.0027) / L; const { p, tg, ny, nz } = frame(u); e.set(Math.atan2(-tg.y, tg.z), 0, 0); q.setFromEuler(e); for (const sx of [1, -1]) { m4.compose(new THREE.Vector3(sx * (w / 2 - 0.0014), p.y + ny * t * 1.02, p.z + nz * t * 1.02), q, new THREE.Vector3(1, 1, 1)); st.setMatrixAt(k++, m4); } }
  g.add(st); return g;
}

/** Gold cufflink with the LPC emblem in relief; face toward +z. */
let _emblemN = null;
function cufflink(r = 0.0074) {
  _emblemN ??= drawNormalCPU(256, 256, (g) => { g.fillStyle = '#fff'; drawEmblem(g, 128, 128, 112, { fill: '#fff', stroke: '#fff' }); }, 3);
  const g = new THREE.Group(); const gold = goldMat(0.12);
  g.add(mesh(new THREE.CylinderGeometry(r, r * 0.96, 0.0022, 48), gold, { r: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CircleGeometry(r * 0.94, 48), new THREE.MeshPhysicalMaterial({ color: 0xd9ad62, metalness: 1, roughness: 0.22, normalMap: _emblemN, normalScale: new THREE.Vector2(0.9, 0.9) }), { p: [0, 0, 0.00112] }));
  return g;
}

/** Hide the geometry of glTF nodes whose name matches, without hiding their child nodes (CarConcept's root node is a mesh
 *  that parents the whole car). Multi-primitive nodes are a Group of 'mesh_N' primitives named after the node. */
const EMPTY = new THREE.BufferGeometry();
function dropParts(root, re) {
  root.traverse((o) => { if (!o.isMesh) return; const node = !o.name || /^mesh_\d+/.test(o.name) ? o.parent?.name || '' : o.name; if (!re.test(node)) return; if (o.children.length) o.geometry = EMPTY; else o.visible = false; });
}

// ------------------------------------------------------------------------------------------------
// Photoreal concept car (Khronos CarConcept), cleaned for the brief: no logos/plates/display, palette paint, cheap dark glass.
async function conceptCar({ paint = 0x3d0b12, metal = 0.7, rough = 0.3, length = 4.45, drop = null } = {}) {
  const m = await model('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Graphite');
  const done = new Map();
  const fix = (mat) => {
    if (done.has(mat)) return done.get(mat); const n = mat.name || ''; const c = mat.clone();
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); }
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.62; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; }
    if (/Paint 1/i.test(n)) { c.color.set(paint); c.metalness = metal; c.roughness = rough; c.clearcoat = 1; c.clearcoatRoughness = 0.03; c.iridescence = 0; }
    if (/Paint 2/i.test(n)) { c.color.set(0x050506); c.metalness = 0.2; c.roughness = 0.25; c.clearcoat = 1; c.clearcoatRoughness = 0.04; c.iridescence = 0; }
    if (/Interior 3/i.test(n)) c.color.set(0x3d0b12);
    if (/Headlight|Signallight|Brakelight/i.test(n)) c.emissiveIntensity = 0.05;
    if (/Tireside/i.test(n)) { c.map = null; c.normalMap = null; c.color.set(0x131313); c.roughness = 0.6; } // sidewall print + relief carry third-party lettering (KHRONOS / 3DCommerce / DOT)
    done.set(mat, c); return c;
  };
  m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material); });
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorFloor|InteriorCage|InteriorSteering|BodyWindshieldWipers|BodyHood(Interior|Under)|Wheel.*BrakePad)/);
  if (drop) dropParts(m, drop); // parts the camera cannot see (software renderer: fewer draws, less overdraw)
  m.rotation.y = Math.PI / 2; const holder = new THREE.Group(); holder.add(m); return holder;
}

/** Photoreal model with any punctual lights it ships with removed (we light the set ourselves). */
async function prop(name, opts) { const m = await model(name, opts); const ls = []; m.traverse((o) => { if (o.isLight) ls.push(o); }); for (const l of ls) l.parent.remove(l); return m; }
/** Replace KHR transmission glass with cheap transparent glass (no extra transmission render pass). */
function cheapGlass(root, { opacity = 0.22, color = 0xffffff } = {}) {
  root.traverse((o) => { if (!o.isMesh) return; const f = (m) => { if (!m.transmission) return m; const c = m.clone(); c.transmission = 0; c.thickness = 0; c.transparent = true; c.opacity = opacity; c.color.set(color); c.roughness = 0.02; c.depthWrite = false; return c; }; o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
  return root;
}
function tintMats(root, re, fn) { root.traverse((o) => { if (!o.isMesh) return; const f = (m) => { if (!re.test(m.name || '')) return m; const c = m.clone(); fn(c); return c; }; o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); }); }

/** Restyle a stylised figure: real cloth and skin instead of the mannequin sheen. */
function dressFigure(f, { suit = 0x14151a } = {}) {
  const swap = new Map();
  f.traverse((o) => {
    if (!o.isMesh) return; const m = o.material; if (swap.has(m)) { o.material = swap.get(m); return; }
    let r = m;
    if (m.metalness === 0.15 && m.sheen === 0.5) r = woolMat(suit);
    else if (m.metalness === 0.35) r = skinMat();
    swap.set(m, r); o.material = r;
  });
  return f;
}

// ------------------------------------------------------------------------------------------------
// Sculpted hands: a signed-distance model of a right hand (palm pads, knuckles, tapered phalanges, thumb, nails) blended with
// smooth unions and polygonised once with marching cubes, so skin flows continuously over every joint like a real hand.
// Local frame: wrist at the origin, fingers toward +x, thumb up (+y), back of the hand toward +z (palm faces -z).

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** Tapered capsule a→b (radius ra→rb) as [ax,ay,az, bx,by,bz, ra,rb, bax,bay,baz, 1/|ba|²]. */
const cap = (a, b, ra, rb) => { const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; return [...a, ...b, ra, rb, ...ba, 1 / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)]; };
function dCap(c, x, y, z) {
  const px = x - c[0], py = y - c[1], pz = z - c[2]; let h = (px * c[8] + py * c[9] + pz * c[10]) * c[11]; h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = px - c[8] * h, dy = py - c[9] * h, dz = pz - c[10] * h; return Math.sqrt(dx * dx + dy * dy + dz * dz) - (c[6] + (c[7] - c[6]) * h);
}
const dEll = (x, y, z, c, r) => { const ax = (x - c[0]) / r[0], ay = (y - c[1]) / r[1], az = (z - c[2]) / r[2]; const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt((ax / r[0]) ** 2 + (ay / r[1]) ** 2 + (az / r[2]) ** 2); return (k0 * (k0 - 1)) / (k1 || 1e-9); };

/** Pose of a right hand gripping another hand: joint chains for fingers and thumb, nail frames. */
function gripPose({ flex = [[0.72, 1.2, 0.55], [0.76, 1.22, 0.55], [0.8, 1.25, 0.58], [0.88, 1.28, 0.6]] } = {}) {
  const F = [
    { m: [0.092, 0.024, 0.0], L: [0.043, 0.025, 0.019], r: [0.0098, 0.0088, 0.0078, 0.0068], yaw: -0.05 },
    { m: [0.096, 0.005, 0.0], L: [0.047, 0.029, 0.021], r: [0.0102, 0.0092, 0.008, 0.007], yaw: 0 },
    { m: [0.093, -0.0135, 0.0], L: [0.044, 0.027, 0.02], r: [0.0096, 0.0086, 0.0076, 0.0066], yaw: 0.04 },
    { m: [0.085, -0.0295, -0.001], L: [0.035, 0.021, 0.018], r: [0.0086, 0.0077, 0.0069, 0.006], yaw: 0.1 },
  ];
  const fingers = F.map((f, i) => {
    let p = f.m, phi = 0; const segs = [], joints = [p], dors = [];
    for (let k = 0; k < 3; k++) {
      phi += flex[i][k]; const d = [Math.cos(phi) * Math.cos(f.yaw), Math.sin(f.yaw) * Math.cos(phi), -Math.sin(phi)];
      const q = [p[0] + d[0] * f.L[k], p[1] + d[1] * f.L[k], p[2] + d[2] * f.L[k]]; segs.push(cap(p, q, f.r[k], f.r[k + 1])); joints.push(q);
      dors.push([Math.sin(phi - flex[i][k] / 2), 0, Math.cos(phi - flex[i][k] / 2)]); // back of the finger at the joint just passed
      if (k === 2) { const n = [Math.sin(phi), 0, Math.cos(phi)]; fingers_nail(f, q, d, n); }
      p = q;
    }
    return { segs, joints, r: f.r, nail: f.nail, dors };
  });
  // nails ~60 % of the old size, sunk into the nail bed (no stuck-on stickers)
  function fingers_nail(f, tip, d, n) { const r = f.r[3], h = r - 0.00085; f.nail = { c: [tip[0] - d[0] * 0.0058 + n[0] * h, tip[1] - d[1] * 0.0058 + n[1] * h, tip[2] - d[2] * 0.0058 + n[2] * h], d, n, s: [0.0042, r * 0.52, 0.0012] }; } // top ≈ 0.35 mm proud of the skin
  const T = [[0.014, 0.024, -0.008], [0.048, 0.046, -0.006], [0.078, 0.053, -0.014], [0.103, 0.055, -0.024]];
  const thumb = [cap(T[0], T[1], 0.0135, 0.0116), cap(T[1], T[2], 0.0114, 0.0105), cap(T[2], T[3], 0.0105, 0.0093)];
  const td = [T[3][0] - T[2][0], T[3][1] - T[2][1], T[3][2] - T[2][2]]; const tl = Math.hypot(...td); td.forEach((v, i) => (td[i] = v / tl));
  const tn = new THREE.Vector3(0, 0.55, 0.83).projectOnPlane(new THREE.Vector3(...td)).normalize().toArray();
  const tnail = { c: [T[3][0] - td[0] * 0.0066 + tn[0] * 0.0085, T[3][1] - td[1] * 0.0066 + tn[1] * 0.0085, T[3][2] - td[2] * 0.0066 + tn[2] * 0.0085], d: td, n: tn, s: [0.0048, 0.0047, 0.0012] };
  return { fingers, thumb, T, nails: [...fingers.map((f) => f.nail), tnail] };
}

function handSDF(pose, { knuckle = 0.95 } = {}) {
  const wrist = cap([-0.134, -0.028, 0], [0.004, 0, 0.001], 0.029, 0.0262); // forearm drops ~12° toward the elbow
  const knuckles = pose.fingers.map((f) => [f.joints[0][0] - 0.004, f.joints[0][1], f.joints[0][2] + 0.0055, f.r[0] * knuckle]);
  return (x, y, z) => {
    // palm: a rounded slab, narrower toward the wrist, its edges curling toward the palm side, plus thenar/hypothenar pads
    const t = x < 0 ? 0 : x > 0.09 ? 1 : x / 0.09; const sy = 0.86 + 0.14 * t;
    const qx = Math.abs(x - 0.047) - 0.039, qy = Math.abs(y / sy) - 0.03, qz = Math.abs(z + 2.6 * y * y) - 0.0055;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    let palm = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - 0.0112;
    palm = smin(palm, dEll(x, y, z, [0.03, 0.021, -0.0075], [0.033, 0.021, 0.0155]), 0.01);
    palm = smin(palm, dEll(x, y, z, [0.036, -0.028, -0.005], [0.037, 0.0135, 0.0125]), 0.008);
    for (const k of knuckles) palm = smin(palm, Math.hypot(x - k[0], y - k[1], z - k[2]) - k[3], 0.006);
    // forearm/wrist (oval section, flatter front-to-back)
    palm = smin(palm, dCap(wrist, x, y * 0.97, z * 1.38) / 1.18, 0.016);
    // thumb, blended into the thenar pad
    let th = dCap(pose.thumb[0], x, y, z); th = smin(th, dCap(pose.thumb[1], x, y, z), 0.004); th = smin(th, dCap(pose.thumb[2], x, y, z), 0.003);
    let d = smin(palm, th, 0.011);
    // fingers: each blended into the palm, never into one another (pressed fingers keep their crease)
    for (const f of pose.fingers) { let fd = dCap(f.segs[0], x, y, z); fd = smin(fd, dCap(f.segs[1], x, y, z), 0.0035); fd = smin(fd, dCap(f.segs[2], x, y, z), 0.003); d = Math.min(d, smin(palm, fd, 0.009)); }
    return d;
  };
}

/** Polygonise an SDF over a cube (centre c, half-size h) at resolution n → indexed-free BufferGeometry in metres. */
function polygonise(sdf, c, h, n) {
  const mc = new MarchingCubes(n, new THREE.MeshBasicMaterial(), false, false, 300000); mc.isolation = 0;
  const f = mc.field, step = (2 * h) / n, B = 4; // coarse pass: skip blocks far from the surface
  for (let bz = 0; bz < n; bz += B) for (let by = 0; by < n; by += B) for (let bx = 0; bx < n; bx += B) {
    const cx = c[0] + ((bx + B / 2 - n / 2) / (n / 2)) * h, cy = c[1] + ((by + B / 2 - n / 2) / (n / 2)) * h, cz = c[2] + ((bz + B / 2 - n / 2) / (n / 2)) * h;
    const dc = sdf(cx, cy, cz); const far = Math.abs(dc) > step * B * 1.0;
    for (let z = bz; z < Math.min(bz + B, n); z++) for (let y = by; y < Math.min(by + B, n); y++) for (let x = bx; x < Math.min(bx + B, n); x++) {
      f[x + y * n + z * n * n] = far ? -dc : -sdf(c[0] + ((x - n / 2) / (n / 2)) * h, c[1] + ((y - n / 2) / (n / 2)) * h, c[2] + ((z - n / 2) / (n / 2)) * h);
    }
  }
  mc.update(); const cnt = mc.count; const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    pos[i * 3] = c[0] + mc.positionArray[i * 3] * h; pos[i * 3 + 1] = c[1] + mc.positionArray[i * 3 + 1] * h; pos[i * 3 + 2] = c[2] + mc.positionArray[i * 3 + 2] * h;
    const nx = mc.normalArray[i * 3], ny = mc.normalArray[i * 3 + 1], nz = mc.normalArray[i * 3 + 2], l = Math.hypot(nx, ny, nz) || 1; nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
  }
  mc.geometry.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
}

const _hands = new Map();
/** Right hand in a handshake grip: { skin geometry (uv, flush colour, knuckle-crease weight), nails geometry }.
 *  flex: per-finger joint flexion; knuckle: knuckle-head prominence. */
function gripHandGeometry(res = 128, { flex, knuckle = 0.95 } = {}) {
  const key = `${res}|${flex}|${knuckle}`; if (_hands.has(key)) return _hands.get(key);
  const pose = gripPose(flex ? { flex } : {}); const g = polygonise(handSDF(pose, { knuckle }), [0.005, 0.0, -0.02], 0.14, res);
  const P = g.attributes.position, Nr = g.attributes.normal, N = P.count, uv = new Float32Array(N * 2), col = new Float32Array(N * 3), crease = new Float32Array(N);
  const tips = pose.fingers.map((f) => f.joints[3]).concat([pose.T[3]]), knk = pose.fingers.flatMap((f) => [f.joints[0], f.joints[1], f.joints[2]]);
  const cj = pose.fingers.flatMap((f) => [0, 1, 2].map((k) => ({ p: f.joints[k], n: f.dors[k], r: f.r[k], w: k ? 1 : 0.45 }))); // MCP, PIP, DIP
  for (let i = 0; i < N; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); uv[i * 2] = (x + 0.4 * z) / 0.011; uv[i * 2 + 1] = (y + 0.4 * z) / 0.011;
    let flush = 0; for (const p of tips) flush = Math.max(flush, Math.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2) / 0.00012));
    for (const p of knk) flush = Math.max(flush, 0.25 * Math.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2) / 0.00008));
    const pale = clamp((-z - 0.004) / 0.012) * 0.1; // palm side paler
    col[i * 3] = 1 + pale * 0.6; col[i * 3 + 1] = 1 - flush * 0.07 + pale * 0.68; col[i * 3 + 2] = 1 - flush * 0.08 + pale * 0.7;
    // knuckle creases: on the back of each joint, fading over about one finger radius
    let c = 0; const nx = Nr.getX(i), ny = Nr.getY(i), nz = Nr.getZ(i);
    for (const j of cj) { const d2 = (x - j.p[0]) ** 2 + (y - j.p[1]) ** 2 + (z - j.p[2]) ** 2; const s2 = (j.r * 1.25) ** 2; if (d2 > 9 * s2) continue; c = Math.max(c, j.w * Math.exp(-d2 / s2) * clamp((nx * j.n[0] + ny * j.n[1] + nz * j.n[2] - 0.15) * 2)); }
    crease[i] = c;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('crease', new THREE.BufferAttribute(crease, 1));
  const nails = pose.nails.map((nl) => { const s = new THREE.SphereGeometry(1, 20, 10); const d = new THREE.Vector3(...nl.d), n = new THREE.Vector3(...nl.n), b = new THREE.Vector3().crossVectors(n, d).normalize(); const m = new THREE.Matrix4().makeBasis(d.multiplyScalar(nl.s[0]), b.multiplyScalar(nl.s[1]), n.multiplyScalar(nl.s[2])).setPosition(...nl.c); s.applyMatrix4(m); return s; });
  const out = { skin: g, nails: mergeGeometries(nails) }; _hands.set(key, out); return out;
}

/** Skin with a wrapped, reddened terminator (light scattering under the skin) on top of the physical BRDF. Optional `crease`: a
 *  second normal map of fine joint creases, weighted per vertex by a `crease` attribute (strong over the knuckles, nil elsewhere). */
function sssSkin(m, k = 1, { crease = null, creaseK = 1 } = {}) {
  const A = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  m.onBeforeCompile = (sh) => {
    if (chunk.includes(A)) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', chunk.replace(A, `${A}
      { float nl = dot( geometryNormal, directLight.direction ); float w = saturate( ( nl + 0.55 ) / 1.55 ) - saturate( nl );
        reflectedLight.directDiffuse += ${k.toFixed(2)} * max( w, 0.0 ) * vec3( 1.0, 0.42, 0.28 ) * directLight.color * BRDF_Lambert( material.diffuseContribution ); }`));
    if (crease) {
      sh.uniforms.creaseMap = { value: crease }; sh.uniforms.creaseK = { value: creaseK };
      sh.vertexShader = 'attribute float crease;\nvarying float vCrease;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCrease = crease;');
      sh.fragmentShader = 'uniform sampler2D creaseMap;\nuniform float creaseK;\nvarying float vCrease;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifdef USE_NORMALMAP_TANGENTSPACE
        { vec3 cN = texture2D( creaseMap, vNormalMapUv ).xyz * 2.0 - 1.0; normal = normalize( normal + tbn * vec3( cN.xy * vCrease * creaseK, 0.0 ) ); }
      #endif`);
    }
  };
  m.customProgramCacheKey = () => `s7-skin-${k}-${crease ? creaseK : 0}`;
  return m;
}

// ------------------------------------------------------------------------------------------------
function fireBillboards(scene, pos, w = 1.2, yaw = 0) {
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float time; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec2 uv = vUv; float t = time*1.6; float f = n(vec2(uv.x*6., uv.y*4. - t*2.2))*0.6 + n(vec2(uv.x*13., uv.y*8. - t*3.5))*0.4;
        float shape = (1. - uv.y) * smoothstep(0.5, 0.05, abs(uv.x - 0.5) + uv.y*0.25) ; float a = smoothstep(0.25, 0.9, shape * (0.55 + f*0.9));
        vec3 c = mix(vec3(1.6,0.45,0.08), vec3(2.6,1.6,0.6), smoothstep(0.4, 1.0, a)); gl_FragColor = vec4(c * a * 1.4, 1.); }` });
  // tongues spread across the firebox, each turned toward the camera path (yaw) so they are never seen edge-on
  const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * (1 - i * 0.2), 0.9 - i * 0.12), mat); m.position.set(pos[0] + (i - 1) * 0.3, pos[1] + 0.42 - i * 0.04, pos[2] + i * 0.04); m.rotation.y = yaw; g.add(m); }
  scene.add(g); return mat;
}

/** Backlit onyx panel (warm translucent stone) for the back-bar. */
function onyxTexture() {
  const c = fromFn(512, 256, (x, y, o) => {
    const v = fbm2(x / 90 + fbm2(x / 40, y / 40, 3, 5) * 2.2, y / 28, 4, 3); const vein = Math.pow(1 - Math.abs(Math.sin((v * 6 + x / 140) * Math.PI)), 6);
    const k = 0.55 + v * 0.5 - vein * 0.35; o[0] = clamp(k * 255, 0, 255); o[1] = clamp(k * 168, 0, 255); o[2] = clamp(k * 82, 0, 255); o[3] = 255;
  });
  return tex(c, { srgb: true });
}
/** Persian-style rug: deep burgundy field, champagne medallion and border. */
function rugTexture() {
  return drawTexture(1024, 720, (g, w, h) => {
    g.fillStyle = '#2a070c'; g.fillRect(0, 0, w, h);
    const r = rng(17); g.globalAlpha = 0.18; for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? '#4a1018' : '#14040a'; g.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 2); } g.globalAlpha = 1;
    const band = (m, lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(m, m, w - 2 * m, h - 2 * m); };
    band(26, 30, '#140508'); band(50, 6, '#b8945c'); band(78, 14, '#3a0c12'); band(98, 4, '#b8945c');
    g.save(); g.translate(w / 2, h / 2); g.strokeStyle = '#a8844e'; g.fillStyle = '#3d0f16';
    for (const [sx, sy, a] of [[1, 0.62, 1], [0.7, 0.44, 0.8], [0.42, 0.27, 1]]) { g.beginPath(); for (let i = 0; i <= 64; i++) { const t = (i / 64) * TAU; const rr = 1 + 0.12 * Math.cos(t * 8); g.lineTo(Math.cos(t) * 210 * sx * rr, Math.sin(t) * 210 * sy * rr); } g.globalAlpha = a; g.lineWidth = 4; g.fill(); g.stroke(); }
    g.globalAlpha = 1; g.restore();
    g.fillStyle = '#9a7848'; for (const [x, y] of [[150, 150], [w - 150, 150], [150, h - 150], [w - 150, h - 150]]) { g.beginPath(); g.ellipse(x, y, 40, 26, 0, 0, TAU); g.fill(); }
  });
}

export async function buildS7(ctx) {
  const shots = []; const R = ctx.renderer;
  // ROOM: the real room crushed to its practicals (lounge fill). ROOM_M: the same room for the macros, walls kept as a dim warm
  // surround so polished gold, crystal and titanium have something real to reflect; window and sconces at full photographed value.
  const [ROOM, ROOM_M, HALL] = await Promise.all([
    gradedEnv(R, HDRI.interiorWarm, { wall: 0.05, floor: 0.028, lo: 0.9, hi: 3.5, floorKeep: 0.12 }),
    gradedEnv(R, HDRI.interiorWarm, { wall: 0.3, floor: 0.16, lo: 2.5, hi: 8, floorKeep: 0.6, tint: [1, 0.78, 0.56], light: [1, 0.9, 0.76] }),
    gradedEnv(R, HDRI.warehouse, { wall: 0.03, floor: 0.012, lo: 1.2, hi: 5, floorKeep: 0, tint: [1, 0.85, 0.7], light: [1, 0.9, 0.76] }),
  ]);

  // ---------------------------------------------------------------- 7.1 crystal coupes clink
  const WIN = 2.39; // panorama yaw that puts the photographed window straight behind a camera looking down -z
  const gs = makeSet(null); const G = gs.scene; lightWith(G, ROOM_M, { k: 1.0, rot: WIN - 0.3 });
  { // behind the toast: the real sunset over the lagoon (the same photograph the lounge windows open onto), thrown out of focus
    const SEA = await hdri(HDRI.sunsetSea); G.background = SEA.pmrem; G.backgroundBlurriness = CP.blur; G.backgroundIntensity = CP.k; G.backgroundRotation.set(0, CP.rot, 0);
  }
  const gA = crystalGlass(0.19, { seed: 5 }), gB = crystalGlass(0.19, { seed: 9 }); G.add(gA); G.add(gB);
  for (const gl of [gA, gB]) gl.traverse((o) => { if (o.material?.isMeshPhysicalMaterial && o.material.blending === THREE.AdditiveBlending) envK(o.material, G, CP.env); });
  const bokeh = []; const rb = rng(71); for (let i = 0; i < 12; i++) { const b = glow(rb() < 0.5 ? 0xffb060 : 0xffd9a0, rb.range(0.04, 0.09), rb.range(0.25, 0.7)); const sx = rb.sign(); b.position.set(sx * rb.range(0.35, 1.5), rb.range(-0.1, 0.8), rb.range(-2.8, -1.4)); G.add(b); bokeh.push(b); }
  const glint = glow(0xffffff, 0.08, 0); G.add(glint);
  spot(G, { intensity: 3, pos: [0.5, 0.8, 0.6], target: [0, 0.15, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  spot(G, { intensity: 2.5, pos: [-0.6, 0.4, -0.6], target: [0, 0.15, 0], angle: 0.5, penumbra: 1, color: 0xff9a50 });
  const RIM_R = 0.0628 * (0.19 / 0.1625), RIM_H = 0.1615 * (0.19 / 0.1625); // rim radius and height of a 19 cm coupe
  const RIM = RIM_R * Math.cos(0.12) + RIM_H * Math.sin(0.12) - 0.0004, RIM_Y = -RIM_R * Math.sin(0.12) + RIM_H * Math.cos(0.12); // tilted 0.12 rad toward each other: rims kiss at x = 0
  gs.onUpdate((t) => {
    const lt = t - 62.0; const k = smooth(clamp(lt / 0.55)); const recoil = lt > 0.55 ? Math.exp(-(lt - 0.55) * 6) * Math.sin((lt - 0.55) * 30) * 0.004 : 0;
    // both glasses in the same plane: the rims truly meet at x = 0 (≈ 62.55), then recoil apart
    gA.position.set(lerp(-0.24, -RIM, k) - recoil, 0, 0); gA.rotation.z = lerp(0.1, -0.12, k); gB.position.set(lerp(0.24, RIM, k) + recoil, 0, 0); gB.rotation.z = lerp(-0.1, 0.12, k);
    gA.userData.update(t); gB.userData.update(t + 3.7);
    const c = lt > 0.55 ? Math.exp(-(lt - 0.55) * 7) : 0; glint.position.set(0, RIM_Y, 0.004); glint.material.color.setRGB(1, 0.95, 0.85).multiplyScalar(c * 1.3); glint.scale.setScalar(0.003 + c * 0.008);
  });
  shots.push(shot('s7.1', 62.0, 63.0, gs, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.06, 0.02, u), 0.2, 0.42), v3(0, 0.165, 0), { fov: 30, near: 0.01, far: 20 }); return { focus: d - 0.02, aperture: 6 }; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.3, streak: 0.18, threshold: 1.3, gain: [1.08, 1.0, 0.88] } }));

  // ---------------------------------------------------------------- 7.2 numbered titanium card on walnut
  const cs = makeSet(null); const C = cs.scene; lightWith(C, ROOM_M, { k: 0.9, rot: WIN + Math.PI }); // window behind the camera: the lacquer and titanium mirror the warm room, not a white veil
  // the desk: one continuous lacquered walnut veneer (a single photographed plank, book-matched), grain running across the frame
  const tableM = await veneerMat({ color: 0x5a3a2c, bump: 0.35, rough: 0.85, clearcoat: 1, ccRough: 0.07, along: 0.96, across: 2.7, offset: [0, 0.1] });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.45), tableM); table.rotation.set(-Math.PI / 2, 0, 0.42); table.position.set(-0.07, 0, -0.03); C.add(table);
  const cardTex = drawTexture(1024, 640, (g, w, h) => {
    // brushed titanium: light warm-grey satin with fine directional brushing (a real metal value, not a black card)
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#7a7a80'); grd.addColorStop(0.55, '#a2a2a8'); grd.addColorStop(1, '#86868c'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const br = rng(23); for (let y = 0; y < h; y++) { const v = br(); g.globalAlpha = 0.05 + v * 0.1; g.fillStyle = v < 0.5 ? '#5e5e64' : '#c4c4ca'; g.fillRect(0, y, w, 1); }
    g.globalAlpha = 0.08; for (let i = 0; i < 260; i++) { const y = br() * h, x = br() * w; g.fillStyle = br() < 0.5 ? '#4a4a50' : '#d6d6dc'; g.fillRect(x, y, 80 + br() * 400, 1); } g.globalAlpha = 1;
    drawEmblem(g, 170, 200, 120, { fill: '#d9b26a', stroke: '#d9b26a' });
    g.fillStyle = '#d9b26a'; g.font = `600 52px ${FONT_SERIF}`; g.fillText('LEGEND PADDOCK CLUB', 330, 190); g.font = `500 34px ${FONT_SERIF}`; g.fillText('MEMBER', 330, 245);
    g.font = `600 110px ${FONT_SERIF}`; g.fillText('Nº 007', 60, 540); g.font = `italic 500 30px ${FONT_SERIF}`; g.fillText('Since 1962', 760, 560);
  });
  const cardN = drawNormalCPU(1024, 640, (g) => { g.fillStyle = '#fff'; drawEmblem(g, 170, 200, 120, { fill: '#fff', stroke: '#fff' }); g.font = `600 52px ${FONT_SERIF}`; g.fillText('LEGEND PADDOCK CLUB', 330, 190); g.font = `600 110px ${FONT_SERIF}`; g.fillText('Nº 007', 60, 540); }, -3);
  const card = mesh(roundBox(0.0856, 0.054, 0.0012, 0.0006, 2), M.titanium().clone()); card.rotation.x = -Math.PI / 2; C.add(card);
  const face = mesh(new THREE.PlaneGeometry(0.0846, 0.053), new THREE.MeshPhysicalMaterial({ map: cardTex, normalMap: cardN, normalScale: new THREE.Vector2(0.6, 0.6), metalness: 0.85, roughness: 0.32, anisotropy: CARD.aniso, anisotropyRotation: 0 }), { p: [0, 0, 0.0009] }); card.add(face); envK(face.material, C, 0.75); // face sits just above the body (it was coplanar: z-fighting)
  // a soft source low behind the desk: its reflection is drawn into a long brushed streak across the empty right half of the card
  spot(C, { intensity: 0.2, pos: [-0.1, 0.42, -0.34], target: [0.005, 0, 0.012], angle: 0.35, penumbra: 1, color: 0xfff0dc });
  spot(C, { intensity: 0.6, pos: [0.3, 0.5, 0.35], target: [-0.02, 0, -0.02], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  const cl = glow(0xffb060, 0.5, 0.9); cl.position.set(-0.6, 0.1, -0.8); C.add(cl);
  cs.onUpdate((t) => { const k = easeOutCubic(clamp((t - 62.9) / 1.0)); card.position.set(lerp(-0.22, 0.0, k), 0.0012, lerp(0.05, 0.0, k)); card.rotation.z = lerp(0.35, 0.08, k); });
  shots.push(shot('s7.2', 63.0, 64.0, cs, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.03, 0.05, u), 0.13, 0.11), v3(lerp(-0.05, 0.0, u), 0.0, 0.0), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: 8 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.3 gold watch on the wrist at the walnut gear knob
  const ws = makeSet(null); const Wd = ws.scene; lightWith(Wd, ROOM_M, { k: 1.0, rot: WIN + 0.5, bg: 0.1, blur: 0.5 });
  const rig = new THREE.Group(); rig.scale.setScalar(2.2); Wd.add(rig);
  const RY = 0.021, RZ = 0.03; const wf = (x) => 1 + clamp(-x / 0.2) * 0.2 + clamp((x - 0.07) / 0.04) * 0.08;
  const wristX = []; for (let i = 0; i <= 30; i++) { const x = lerp(-0.2, 0.115, i / 30); wristX.push([x, wf(x), wf(x)]); }
  // organic wrist: flatter back, radial styloid on the thumb side, extensor tendons toward the hand, low-frequency irregularity
  const gx = (x, m, w) => Math.exp(-((x - m) ** 2) / (w * w)), dir = (c, s, dc, ds, w) => Math.exp(-(1 - (c * dc + s * ds)) / w);
  const wristDeform = (x, c, s, u) => 1 - 0.035 * dir(c, s, 1, 0, 0.12) + 0.05 * gx(x, 0.03, 0.014) * dir(c, s, 0.3, 0.95, 0.08) + clamp((x - 0.025) / 0.06) * 0.018 * Math.pow(Math.max(0, Math.cos((u * TAU - Math.PI) * 6)), 6) * Math.max(0, c) + (fbm2(x * 60, u * 8, 2, 5, 8) - 0.5) * 0.03;
  // skin: neutral tone with low-frequency colour (redder over the bones and toward the hand, faint veins on top), fine pores,
  // micro-wrinkle lattice and soft creases at a gentle strength (no stucco)
  const wskin = sssSkin(skinMat(), 0.5); wskin.color.set(WSKIN); wskin.map = wristAlbedo(); wskin.roughness = 0.55; wskin.sheen = 0.25; wskin.sheenColor.set(0xb89a88); wskin.clearcoat = 0.0;
  wskin.normalMap = skinRelief().clone(); wskin.normalMap.repeat.set(6, 9); wskin.normalScale.set(0.2, 0.2);
  rig.add(new THREE.Mesh(sweepX(wristX, RY, RZ, { uvScale: [1, 1], n: 96, deform: wristDeform }), wskin));
  // the shirt cuff: oxford weave, double-folded hem band with a rolled edge and stitch line, a soft buckle in the cloth
  const ox = oxford(); const cuffM = new THREE.MeshPhysicalMaterial({ color: 0xe6dfd2, map: ox.map, roughness: 0.82, metalness: 0, normalMap: ox.normal, normalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) });
  rig.add(shirtCuff(-0.0445, -0.17, RY, RZ, { k: [1.28, 1.15], mat: cuffM, stitchMat: new THREE.MeshStandardMaterial({ color: 0xb3a894, roughness: 0.7 }), weave: [26, 133] }));
  const sleeveX = [[-0.32, 1.72, 1.45], [-0.085, 1.62, 1.38], [-0.079, 1.58, 1.35], [-0.0765, 1.48, 1.3], [-0.078, 1.4, 1.26], [-0.089, 1.38, 1.25]];
  rig.add(new THREE.Mesh(sweepX(sleeveX, RY, RZ, { uvScale: [1, 1] }), woolMat(0x15171d)));
  const horn = new THREE.MeshPhysicalMaterial({ color: 0x1e140d, roughness: 0.28, metalness: 0, clearcoat: 0.7 });
  for (const [i, x] of [-0.092, -0.103, -0.114].entries()) { const [y, z] = supPt(1.05, RY * 1.62, RZ * 1.38); const b = mesh(new THREE.CylinderGeometry(0.0046, 0.0044, 0.0024, 24), horn, { p: [x - i * 0.0004, y * 1.02, z * 1.02] }); b.lookAt(new THREE.Vector3(x, y * 3, z * 3)); b.rotateX(Math.PI / 2); rig.add(b); }
  { const [y, z] = supPt(0.85, RY * 1.29, RZ * 1.15); const cf = cufflink(); cf.position.set(-0.066, y * 1.04, z * 1.04); cf.lookAt(new THREE.Vector3(-0.066, y * 3, z * 3)); rig.add(cf); }
  const watch = luxuryWatch(); const WX = -0.016, WY = RY * wf(WX) + 0.0037; watch.position.set(WX, WY, 0); rig.add(watch); envK(watch.userData.lugs, Wd, 0.45); // satin lugs: no hot window glints at their tips
  const strapM = M.leather(0x2c0b0d); strapM.roughness = 0.5; const thread = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: 0.7 });
  for (const s of [1, -1]) {
    const pts = [[WY - 0.0016, s * (0.0195 + 0.0035)], [WY - 0.0034, s * (0.0195 + 0.0078)]];
    for (let i = 0; i <= 7; i++) { const th = lerp(1.32, Math.PI - 0.08, i / 7); const [y, z] = supPt(th, RY * wf(WX) + 0.0004, RZ * wf(WX) + 0.0004); pts.push([y, s * z]); }
    const sg = strap(pts, 0, 0.019, 0.0032, strapM, thread); sg.position.x = WX; rig.add(sg);
  }
  // the console: one continuous lacquered walnut veneer, grain along the arm
  const walnutM = await veneerMat({ color: 0x6a4030, bump: 0.3, rough: 0.8, clearcoat: 1, ccRough: 0.06, along: 0.96, across: 5.5, offset: [0, 0] });
  const consoleW = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.45), walnutM); consoleW.rotation.x = -Math.PI / 2; consoleW.position.set(-0.005, -0.06, -0.08); rig.add(consoleW);
  const consoleL = mesh(new THREE.PlaneGeometry(1.2, 0.8), M.leather(0x0d0909), { p: [0, -0.062, 0], r: [-Math.PI / 2, 0, 0] }); for (const k of ['map', 'normalMap']) { consoleL.material[k] = consoleL.material[k].clone(); consoleL.material[k].repeat.set(48, 32); } rig.add(consoleL);
  // the walnut gear knob just behind the wrist, in the upper right of the frame (soft, but unmistakable)
  const KN = [0.032, -0.004, -0.112], KR = 0.018; const knobM = await veneerMat({ color: 0x5a3426, bump: 0.15, rough: 0.8, clearcoat: 0.6, ccRough: 0.35, along: 0.5, across: 0.6, offset: [0, 0.25] });
  rig.add(mesh(new THREE.SphereGeometry(KR, 48, 32), knobM, { p: KN, s: [1, 1.08, 1] }));
  rig.add(mesh(new THREE.CylinderGeometry(KR * 0.5, KR * 0.62, 0.008, 40), goldMat(0.22), { p: [KN[0], KN[1] - KR * 1.08 - 0.002, KN[2]] }));
  rig.add(mesh(lathe([[KR * 0.6, 0], [KR * 1.2, -0.012], [KR * 1.5, -0.03], [0.0001, -0.03]], 40), M.leather(0x120a08), { p: [KN[0], KN[1] - KR * 1.08 - 0.006, KN[2]] }));
  rig.position.y = 0.04 - WY * 2.2 - 0.0;
  spot(Wd, { intensity: 2.0, pos: [0.2, 0.6, 0.4], target: [0, 0.03, 0], angle: 0.4, penumbra: 1, color: 0xffe0b0 });
  spot(Wd, { intensity: 1.1, pos: [-0.5, 0.25, -0.4], target: [0, 0.03, 0], angle: 0.5, penumbra: 1, color: 0x9ab0ff });
  ws.onUpdate((t) => { watch.userData.set(10 * 3600 + 9 * 60 + 12 + (t - 64)); const k = smooth(clamp((t - 64.2) / 0.5)); Wd.rotation.z = lerp(0, -0.12, k); });
  shots.push(shot('s7.3', 64.0, 65.0, ws, (lt, u, cam) => { const d = aim(cam, v3(lerp(0.02, -0.04, u), 0.2, 0.17), v3(-0.035, 0.04, 0), { fov: 32, near: 0.005, far: 20 }); return { focus: d, aperture: 30 }; },
    { trans: { type: 'whip', dur: 0.3, dir: [-1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.4 handshake beside a car door
  const hsS = makeSet(null); const HS = hsS.scene; lightWith(HS, HALL, { k: 1.25, rot: -2.51, bg: 0.22, blur: 0.3 });
  const doorCar = await conceptCar({ paint: 0x3d0b12, metal: 0.65, rough: 0.32, drop: /^(Interior|Wheel|Engine|Body(Underside|Hood|Rearwindow|Taillight|TurnsignalsRear|Headlights|Windshield)|$)/ }); HS.add(doorCar);
  { const b = new THREE.Box3().setFromObject(doorCar); doorCar.position.set(0.35, -0.98 - b.min.y, -0.55 - 1.0); }
  // two right hands sculpted as one continuous skin each, clasped palm to palm. A (from the left, with the gold watch of the
  // previous shot) shows the back of its hand, its fingers wrapping away round B's palm; B's fingers lie along A's palm, hidden
  // behind it, and only B's thumb crosses over the top. Rim-lit near-silhouettes: the cuffs, watch and burgundy door carry the frame.
  const hgA = gripHandGeometry(HAND_RES, { knuckle: 0.8 }), hgB = gripHandGeometry(HAND_RES, { flex: [[0.24, 0.34, 0.2], [0.24, 0.36, 0.2], [0.27, 0.38, 0.22], [0.3, 0.4, 0.24]], knuckle: 0.6 });
  const hskin = sssSkin(skinMat(), 0.25, { crease: knuckleCreases(), creaseK: 0.9 }); hskin.vertexColors = true; hskin.color.set(HSKIN); hskin.normalMap = skinRelief(); hskin.normalScale.set(0.35, 0.35); hskin.roughness = 0.55; hskin.sheen = 0.25; hskin.sheenColor.set(0xa8a09a);
  const nailM = new THREE.MeshPhysicalMaterial({ color: 0x94796c, roughness: 0.42, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.3 }); // skin-toned, a little glossier
  const cot = new THREE.MeshPhysicalMaterial({ color: 0xd6d0c6, map: oxford().map, roughness: 0.82, metalness: 0, normalMap: oxford().normal, normalScale: new THREE.Vector2(0.5, 0.5), sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) });
  const stitchM = new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.7 });
  const FA = Math.atan2(0.028, 0.134); // forearm drop
  let watchA = null;
  const arm = (suit, withWatch, hg) => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(hg.skin, hskin)); g.add(new THREE.Mesh(hg.nails, nailM));
    const fore = new THREE.Group(); fore.rotation.z = FA; g.add(fore);
    const c0 = withWatch ? 0.064 : 0.046; fore.add(shirtCuff(-c0 + 0.006, -0.22, 0.0345, 0.0282, { k: [1, 1], T: 0.0024, mat: cot, stitchMat: stitchM, fold: 0.6, n: 72, weave: [24, 133] }));
    const s0 = c0 + 0.062; const slv = new THREE.Mesh(sweepX([[-0.5, 1.06, 1.06], [-s0, 1, 1], [-s0 + 0.0075, 0.985, 0.985], [-s0 + 0.011, 0.94, 0.94], [-s0 + 0.009, 0.9, 0.9], [-s0 + 0.002, 0.88, 0.88]], 0.05, 0.046, { uvScale: [1, 1] }), woolMat(suit)); slv.material.side = THREE.DoubleSide; fore.add(slv);
    { const [y, z] = supPt(1.25, 0.0345, 0.0282); const cf = cufflink(0.0066); cf.position.set(-c0 - 0.024, y * 1.03, z * 1.03 + 0.0011); cf.rotation.set(-0.34, 0, 0); fore.add(cf); } // face turned to the lens
    if (withWatch) {
      const w = luxuryWatch(); w.rotation.x = Math.PI / 2; w.position.set(-0.04, -0.001, 0.0246); w.scale.setScalar(0.92); fore.add(w); watchA = w;
      w.userData.crystal.specularIntensity = 0.35; envK(w.userData.crystal, HS, 0.3); // no bright window rectangle in the crystal
      const band = new THREE.Mesh(sweepX([[-0.0485, 1, 1], [-0.0315, 1, 1]], 0.0298, 0.0218, { n: 64 }), M.leather(0x2c0b0d)); band.material.side = THREE.DoubleSide; fore.add(band);
    }
    return g;
  };
  const hA = arm(0x14161c, true, hgA), hB = arm(0x221d1a, false, hgB); HS.add(hA); HS.add(hB);
  envK(hskin, HS, 0.06); envK(cot, HS, 0.22); envK(nailM, HS, 0.12);
  spot(HS, { intensity: HKEY, pos: [-0.25, 0.75, 0.7], target: [0, 0, 0], angle: 0.35, penumbra: 1, color: 0xffe0b8 }); spot(HS, { intensity: 3.6, pos: [-0.35, 0.5, -0.4], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffb060 }); spot(HS, { intensity: 2.2, pos: [0.45, 0.4, -0.35], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffd2a0 });
  hsS.onUpdate((t) => {
    // the clasp closes under the whip-pan, then one firm pump
    const lt = t - 65.0; const k = smooth(clamp(lt / 0.38)); const pump = Math.sin(clamp((lt - 0.42) / 0.5) * Math.PI) * 0.012; const sep = (1 - k) * 0.06;
    const a = HTILT; hA.position.set(-0.06 - sep, pump - 0.005, 0.015); hA.rotation.set(0, 0, a);
    hB.position.set(-0.06 + 0.12 * Math.cos(a) + sep, pump - 0.005 + 0.12 * Math.sin(a), -0.015); hB.rotation.set(0, Math.PI, -a);
  });
  const wpA = new THREE.Vector3(); // focus is pulled to A's watch: the fingers, a few centimetres nearer, fall soft
  shots.push(shot('s7.4', 65.0, 66.0, hsS, (lt, u, cam) => { aim(cam, v3(lerp(0.3, 0.2, u), 0.12, 0.75), v3(0, 0.0, -0.1), { fov: 30, near: 0.01, far: 30 }); hA.updateWorldMatrix(true, true); watchA.getWorldPosition(wpA); return { focus: cam.position.distanceTo(wpA), aperture: HAPT }; },
    { trans: { type: 'whip', dur: 0.3, dir: [1, 0] }, grade: { exposure: 1.15, bloom: 0.45, streak: 0.25, threshold: 1.3, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 7.5 the members' lounge
  const ls = makeSet(null); const L = ls.scene; lightWith(L, ROOM, { k: 0.5, rot: 0 });
  // beyond the glass: a real photographed waterfront at dusk (Venice, Poly Haven), projected onto the ground so the cars stand
  // on its stone quay and the lagoon, the far shore and the afterglow sit at their true distance
  const view = await groundedBackdrop(L, HDRI.sunsetSea, { height: 1.7, radius: 90, intensity: VIEW.k, rotation: VIEW.rot });
  view.position.x = VIEW.x; view.position.z = VIEW.z; view.renderOrder = -10; L.background = new THREE.Color(0x000000);
  view.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb = min(diffuseColor.rgb, vec3(${VIEW.clamp.toFixed(1)}));`); }; // tame the sun disc (no wild streaks)
  view.material.customProgramCacheKey = () => 's7-view';
  { // the low sun itself, streaming in through the glass: warm rims on people and furniture, a glow raking the far brick
    const a = 0.59 - VIEW.rot; // azimuth of the photographed sun on the projected panorama (it sits at u ≈ 0.594 in the photo)
    const sl = new THREE.DirectionalLight(0xffb070, VIEW.sun); sl.position.set(VIEW.x + Math.cos(a) * 88, 5.5, VIEW.z + Math.sin(a) * 88); sl.target.position.set(-1, 0.6, -1); L.add(sl); L.add(sl.target); }
  const CX = 0.6, CZ = -1.5, XF = 5.5, RW = 9 + XF, RXC = (XF - 9) / 2; // seating group; room spans x -9..XF, z -5..5
  // floor: real oak planks, stained dark and polished
  const floorM = await photoMat('wood', { color: 0x5a3626, bump: 0.45, rough: 0.9, clearcoat: 0.45, ccRough: FLOOR_CCR }); // gentle bump: no glints on plank edges
  const floor = new THREE.Mesh(tilePlane(RW, 10, 2.2, 1.1), floorM); floor.rotation.x = -Math.PI / 2; floor.position.x = RXC; L.add(floor);
  // walls: real brick above a dark oak wainscot
  const brickM = await photoMat('brick', { color: 0x6a4a42, bump: 1.2, rough: 1 });
  const wainM = await photoMat('wood', { color: 0x2a1810, bump: 0.6, rough: 0.7, clearcoat: 0.4, ccRough: 0.2, rotation: Math.PI / 2 });
  for (const [x, z, ry, w] of [[RXC, -5, 0, RW], [XF, 0, -Math.PI / 2, 10], [-9, 0, Math.PI / 2, 10]]) {
    const wall = new THREE.Mesh(tilePlane(w, 3.2, 1.9, 1.9), brickM); wall.position.set(x, 2.6, z); wall.rotation.y = ry; L.add(wall);
    const wn = new THREE.Mesh(tilePlane(w, 1.0, 1.1, 2.2), wainM); wn.position.set(x, 0.5, z); wn.rotation.y = ry; wn.translateZ(0.02); L.add(wn);
    const rail = mesh(new THREE.BoxGeometry(w, 0.06, 0.06), wainM, { p: [x, 1.0, z], r: [0, ry, 0] }); rail.translateZ(0.04); L.add(rail);
  }
  const beamM = await photoMat('wood', { color: 0x2a1a12, bump: 0.6, rough: 0.8 });
  const ceil = new THREE.Mesh(tilePlane(RW, 10, 2.4, 1.2), beamM); ceil.position.set(RXC, 4.2, 0); ceil.rotation.x = Math.PI / 2; L.add(ceil); // timber-boarded ceiling
  for (const z of [-3.6, -1.2, 1.2, 3.6]) L.add(mesh(new THREE.BoxGeometry(RW, 0.32, 0.24), beamM, { p: [RXC, 4.04, z] }));
  // giant steel windows (z = +5) onto the lit cars
  const steel = new THREE.MeshStandardMaterial({ color: 0x15110d, metalness: 0.7, roughness: 0.45 });
  for (let x = -8; x <= 4; x += 2) L.add(mesh(new THREE.BoxGeometry(0.1, 3.85, 0.14), steel, { p: [x, 2.27, 5] }));
  for (const y of [0.35, 3.0, 4.18]) L.add(mesh(new THREE.BoxGeometry(RW, 0.09, 0.14), steel, { p: [RXC, y, 5] }));
  for (let x = -7; x <= 5; x += 2) L.add(mesh(new THREE.BoxGeometry(0.04, 1.15, 0.06), steel, { p: [x, 3.6, 5] }));
  L.add(mesh(new THREE.BoxGeometry(RW, 0.35, 0.3), brickM, { p: [RXC, 0.175, 5.05] }));
  const glassW = new THREE.Mesh(new THREE.PlaneGeometry(RW, 3.85), new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false })); glassW.position.set(RXC, 2.27, 5.02); glassW.rotation.y = Math.PI; L.add(glassW);
  const plinthM = new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.55, metalness: 0 });
  const shadowM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, alphaMap: drawTexture(256, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, '#fff'); r.addColorStop(0.55, '#ccc'); r.addColorStop(1, '#000'); g.save(); g.scale(1, h / w); g.fillStyle = r; g.fillRect(0, 0, w, w); g.restore(); }), opacity: 0.85 });
  const farDrop = /^(Interior|Wheel.*Brake|BodyHoodTopgrill|BodyUnderside)/; const outCars = await Promise.all([conceptCar({ paint: 0x3d0b12, metal: 0.65, rough: 0.3, drop: farDrop }), conceptCar({ paint: 0x6d6f74, metal: 0.85, rough: 0.3, drop: farDrop })]);
  [[2.6, 10.0, Math.PI * 0.86], [8.4, 11.4, Math.PI * 1.1]].forEach(([x, z, ry], i) => {
    const car = outCars[i]; car.rotation.y = ry; car.position.set(x, 0.12, z); L.add(car);
    L.add(mesh(roundBox(5.4, 0.12, 2.7, 0.05), plinthM, { p: [x, 0.06, z], r: [0, ry, 0] }));
    const e = new THREE.Mesh(new THREE.RingGeometry(1, 1.012, 4, 1, Math.PI / 4), M.emissive(0xffcf8a, 0.5)); e.scale.set(3.8, 1.9, 1); e.rotation.set(-Math.PI / 2, 0, ry); e.position.set(x, 0.125, z); L.add(e);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 2.25), shadowM); sh.rotation.set(-Math.PI / 2, 0, ry); sh.position.set(x, 0.1215, z); sh.renderOrder = 1; L.add(sh); // contact shadow
  });
  spot(L, { intensity: 320, pos: [5.4, 9, 7.2], target: [5.4, 0.3, 10.8], angle: 0.62, penumbra: 1, color: 0xffe2b8 });
  // fireplace: black marble surround, sooty brick firebox, burning logs; a framed photographic print with its picture light
  const marble = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex(fromFn(256, 256, (x, y, o) => { const v = fbm2(x / 50 + fbm2(x / 20, y / 20, 3, 21) * 2.5, y / 50, 4, 23); const vein = Math.pow(1 - Math.abs(Math.sin(v * 9 * Math.PI)), 14); const k = 10 + vein * 70; o[0] = k; o[1] = k * 0.97; o[2] = k * 0.95; o[3] = 255; }), { srgb: true }), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 });
  L.add(mesh(roundBox(2.6, 1.6, 0.42, 0.03), marble, { p: [0, 0.8, -4.79] }));
  const fireBrick = await photoMat('brick', { color: 0x2a1a16, bump: 1.4, rough: 1, repeat: [0.5, 0.5] });
  L.add(mesh(new THREE.BoxGeometry(1.3, 0.95, 0.04), fireBrick, { p: [0, 0.58, -4.56] }));
  L.add(mesh(new THREE.BoxGeometry(1.36, 0.98, 0.5), new THREE.MeshStandardMaterial({ color: 0x050404, roughness: 1, side: THREE.BackSide }), { p: [0, 0.59, -4.35] }));
  const bark = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.95, emissive: 0xff5a10, emissiveIntensity: 0.08 });
  for (const [x, rz, ry] of [[-0.18, 0.08, 0.2], [0.16, -0.06, -0.25], [0, 0.0, 0]]) L.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.85, 14), bark, { p: [x, x === 0 ? 0.28 : 0.2, -4.38], r: [0, ry, Math.PI / 2 + rz] }));
  L.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), M.emissive(0xff6a20, 1.6), { p: [0, 0.13, -4.4] }));
  const mantelM = await photoMat('wood', { color: 0x4a2c1c, bump: 0.5, rough: 0.8, clearcoat: 0.8, ccRough: 0.1 });
  L.add(mesh(roundBox(2.95, 0.09, 0.56, 0.02), mantelM, { p: [0, 1.65, -4.74] }));
  const gilt = goldMat(0.32, 0xc89a58);
  L.add(mesh(roundBox(1.85, 1.02, 0.07, 0.03), gilt, { p: [0, 2.55, -4.95] }));
  const printT = (await photo('hdri/' + HDRI.sunriseField4k, { srgb: true, anisotropy: 4 })).clone(); // shares S6's texture printT.repeat.set(0.33, 0.333); printT.offset.set(0.27, 0.383);
  const printM = new THREE.MeshStandardMaterial({ map: printT, emissiveMap: printT, emissive: new THREE.Color(0.42, 0.36, 0.28).multiplyScalar(0.2), roughness: 0.55, color: 0x707070 });
  printM.onBeforeCompile = (sh) => { const toned = (v) => `{ float l = dot(${v}, vec3(0.2126, 0.7152, 0.0722)); ${v} = mix(vec3(l) * vec3(1.18, 0.96, 0.7), ${v}, 0.3); }`; sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${toned('diffuseColor.rgb')}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${toned('totalEmissiveRadiance')}`); };
  printM.customProgramCacheKey = () => 's7-print';
  L.add(mesh(new THREE.PlaneGeometry(1.62, 0.8), printM, { p: [0, 2.55, -4.91] }));
  L.add(mesh(new THREE.PlaneGeometry(1.7, 0.88), new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.9 }), { p: [0, 2.55, -4.912] }));
  L.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 16), goldMat(0.2), { p: [0, 3.14, -4.78], r: [0, 0, Math.PI / 2] }));
  L.add(mesh(new THREE.PlaneGeometry(0.86, 0.02), M.emissive(0xffd9a0, 4), { p: [0, 3.118, -4.78], r: [Math.PI / 2, 0, 0] }));
  for (const x of [-1.15, 1.15]) {
    L.add(mesh(lathe([[0.06, 0], [0.065, 0.01], [0.02, 0.03], [0.014, 0.16], [0.03, 0.2], [0.025, 0.22], [0.0001, 0.22]], 32), gilt, { p: [x, 1.695, -4.7] }));
    L.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.6 }), { p: [x, 1.995, -4.7] }));
    const fl = glow(0xffc070, 0.12, 2.0); fl.position.set(x, 2.1, -4.7); L.add(fl);
  }
  // photoreal brushed-brass barn sconces on the brick, each throwing a scallop of light down the wall (grazing light makes the
  // real brick and mortar read)
  const sconce0 = cheapGlass(await prop('AnisotropyBarnLamp', { size: 0.36, axis: 'y' }), { opacity: 0.18, color: 0xfff2dc });
  tintMats(sconce0, /Lamp Metal/, (m) => { m.color.set(0xe0b884); });
  const scD = sconce0.userData.size.z / 2; sconce0.userData = {}; // (glTF parser refs are not clonable)
  for (const [x, z, ry] of SCONCES) {
    const s = sconce0.clone(); s.rotation.y = ry; s.position.set(x, 2.32, z); s.translateZ(scD - 0.2); L.add(s);
    const o = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    spot(L, { intensity: SC_I, pos: [x + o.x * 0.18, 2.1, z + o.z * 0.18], target: [x - o.x * 0.1, 0.2, z - o.z * 0.1], angle: 0.62, penumbra: 0.75, color: 0xffc68a });
    const g = glow(0xffc070, 0.16, 1.0); g.position.set(x + o.x * SC_BULB[1], 2.32 + SC_BULB[0], z + o.z * SC_BULB[1]); L.add(g); // at the bulb, inside the shade
  }
  const fireMat = fireBillboards(L, [0, 0.12, -4.42], 0.5, FIRE_YAW); const fireL = point(L, { color: 0xff8a3a, intensity: 6, pos: [0, 0.5, -3.85] });
  // the fire's spill on the hearth and planks: a flickering warm pool that makes the fireplace read from across the room
  const hearthM = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: drawTexture(256, 256, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, '#fff'); r.addColorStop(0.35, '#7a7a7a'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, w, w); }), opacity: 0.3 });
  const hearth = mesh(new THREE.PlaneGeometry(2.6, 1.6), hearthM, { p: [0, 0.004, -3.75], r: [-Math.PI / 2, 0, 0] }); hearth.renderOrder = 1; L.add(hearth);
  // rug, coffee table and its still life
  const rugM = new THREE.MeshPhysicalMaterial({ map: rugTexture(), roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x8a3040), normalMap: (() => { const n = weave().clone(); n.repeat.set(60, 42); return n; })(), normalScale: new THREE.Vector2(0.5, 0.5) });
  L.add(mesh(new THREE.BoxGeometry(4.8, 0.012, 3.4), rugM, { p: [CX + 0.1, 0.006, CZ] }));
  L.add(mesh(new THREE.BoxGeometry(2.9, 0.012, 2.0), rugM, { p: [-0.9, 0.006, 3.2], r: [0, 0.08, 0] }));
  const tblM = await photoMat('wood', { color: 0x6a4030, bump: 0.5, rough: 0.8, clearcoat: 1, ccRough: 0.06, repeat: [0.9, 0.9] });
  const coffeeM = tblM.clone(); coffeeM.clearcoat = 0.6; coffeeM.clearcoatRoughness = 0.38; // satin lacquer: the pendant above blooms softly instead of a hot mirror spot
  L.add(mesh(roundBox(1.25, 0.045, 0.7, 0.012), coffeeM, { p: [CX, 0.42, CZ], r: [0, 0.12, 0] }));
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.28, 0.28]) L.add(mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.4, 12), goldMat(0.2), { p: [CX + sx * Math.cos(0.12) + sz * Math.sin(0.12), 0.2, CZ - sx * Math.sin(0.12) + sz * Math.cos(0.12)] }));
  const coupes = [[-0.32, 0.12], [-0.18, 0.2]].map(([dx, dz], i) => { const cg = crystalGlass(0.16, { bubbles: 12, seed: 30 + i }); cg.position.set(CX + dx, 0.443, CZ + dz); L.add(cg); return cg; });
  const flowers = cheapGlass(await prop('GlassVaseFlowers', { size: 0.34, axis: 'y' })); flowers.position.set(CX + 0.12, 0.443, CZ + 0.16); flowers.rotation.y = 0.6; L.add(flowers);
  // photoreal seating: carved-wood leather sofa, champagne velvet sofa, burgundy silk pouf; velvet club chairs by the window
  const [sofa, velvet, pouf, chA, chB] = await Promise.all([prop('SheenWoodLeatherSofa', { size: 2.6, axis: 'x' }), prop('GlamVelvetSofa', { size: 2.1, axis: 'x' }), prop('SpecularSilkPouf', { size: 0.62, axis: 'x' }), prop('SheenChair', { size: 0.86, axis: 'x' }), prop('SheenChair', { size: 0.86, axis: 'x' })]);
  await selectVariant(velvet, 'champagne');
  tintMats(sofa, /^(Brown|Frame|Frame_Fabric)$/, (m) => { if (m.name === 'Brown') m.color.set(0xa86a5a); if (m.name !== 'Frame') { m.sheen = 0.25; m.specularIntensity = 0.1; m.roughness = Math.max(m.roughness, 0.85); } m.normalScale?.multiplyScalar(0.45); });
  tintMats(sofa, /^Frame$/, (m) => { m.roughnessMap = null; m.roughness = 0.7; m.specularIntensity = 0.2; }); // waxed, not lacquered: the carved arm fronts mirrored the bright window as chrome-like bars
  { // the arm panels and bolsters are a gold-striped fabric whose pale stripes read as radiator bars under the lamps: cover them in the sofa's own leather
    let leather = null; sofa.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.name === 'Brown') leather = m.map; });
    tintMats(sofa, /^Striped$/, (m) => { if (leather) m.map = leather; m.color.set(0x9a6052); m.sheen = 0.3; m.specularIntensity = 0.12; }); }
  tintMats(pouf, /silk/i, (m) => { m.color.set(0x5a0f1a); if (m.sheenColor) m.sheenColor.set(0xa83a4a); });
  for (const ch of [chA, chB]) { hide(ch, /label/i); tintMats(ch, /fabric/i, (m) => { m.color.set(0x7a1824); if (m.sheenColor) m.sheenColor.set(0xc04050); }); tintMats(ch, /wood/i, (m) => { m.color.set(0x3a2418); }); }
  sofa.position.set(CX + 1.6, 0, CZ + 0.1); sofa.rotation.y = -Math.PI / 2 - 0.35; L.add(sofa);
  velvet.position.set(CX - 0.9, 0, CZ - 1.45); velvet.rotation.y = 0.1; L.add(velvet); // far enough left that its sitter leaves the frame before the move settles
  pouf.position.set(CX - 1.05, 0, CZ + 0.95); L.add(pouf);
  chA.position.set(-1.7, 0, 3.0); chA.rotation.y = Math.PI * 0.75; L.add(chA); chB.position.set(-0.1, 0, 3.55); chB.rotation.y = -Math.PI * 0.62; L.add(chB);
  L.add(mesh(lathe([[0.0001, 0.6], [0.3, 0.6], [0.3, 0.635], [0.0001, 0.635]], 48), tblM)); L.children.at(-1).position.set(-0.9, 0, 3.35);
  L.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 16), goldMat(0.2), { p: [-0.9, 0.3, 3.35] })); L.add(mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.02, 32), goldMat(0.2), { p: [-0.9, 0.01, 3.35] }));
  // (no lamp on the window table: from the lounge camera it would sit on the seated member's head)
  for (const [x, y, z] of [[CX - 0.2, 3.05, CZ + 0.3], [CX + 0.9, 3.15, CZ - 0.7], [-0.9, 3.1, 3.2]]) {
    L.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 4.2 - y, 6), M.blackSatin(), { p: [x, (4.2 + y) / 2, z] }));
    L.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), goldMat(0.2), { p: [x, y + 0.13, z] }));
    L.add(mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffc070, emissiveIntensity: 1.15, roughness: 0.3 }), { p: [x, y, z] }));
    const g = glow(0xffc985, 0.45, 1.0); g.position.set(x, y, z); L.add(g);
  }
  const winCoupe = crystalGlass(0.16, { bubbles: 10, seed: 41 }); winCoupe.position.set(-0.98, 0.636, 3.3); L.add(winCoupe); coupes.push(winCoupe);
  for (const c of coupes) c.traverse((o) => { if (o.material?.isMeshPhysicalMaterial && o.material.blending === THREE.AdditiveBlending) { o.material = o.material.clone(); o.material.roughness = 0.14; o.material.clearcoat = 0; } }); // no pin-point sun glints at room scale
  // side tables with Tiffany lamps; heritage bellows camera in the window corner
  for (const [dx, dz] of [[2.65, -0.7], [2.35, 2.1]]) { // one behind the leather sofa's far end (clear of every head on the move), one by the window side
    const x = CX + dx, z = CZ + dz; L.add(mesh(roundBox(0.5, 0.56, 0.5, 0.015), tblM, { p: [x, 0.28, z] }));
    const lamp = await prop('StainedGlassLamp', { size: 0.66, axis: 'y' }); lamp.position.set(x, 0.56, z); L.add(lamp);
    const lg = glow(0xffb870, 0.55, 1.1); lg.position.set(x, 1.0, z); L.add(lg); point(L, { color: 0xffb46a, intensity: dz > 0 ? 0.7 : 1.6, pos: [x, 1.02, z] }); // the window-side lamp kept low: it rakes the sofa's arm
  }
  const cam = await prop('AntiqueCamera', { size: 1.55, axis: 'y' }); cam.position.set(4.4, 0, 3.4); cam.rotation.y = CAM_YAW; L.add(cam); // in the corner by the bar end, trained on the cars
  // the bar: backlit onyx, bottles, walnut counter, brass rail, stools, pendants
  const onyx = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.0), new THREE.MeshBasicMaterial({ map: onyxTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.4), toneMapped: false })); onyx.position.set(XF - 0.03, 1.95, -0.5); onyx.rotation.y = -Math.PI / 2; L.add(onyx);
  for (const y of [1.25, 1.85, 2.45]) { L.add(mesh(new THREE.BoxGeometry(0.32, 0.035, 5.4), tblM, { p: [XF - 0.2, y, -0.5] })); }
  const br = rng(91); const bottleGeos = [lathe([[0.0001, 0], [0.04, 0], [0.042, 0.005], [0.042, 0.2], [0.036, 0.23], [0.014, 0.26], [0.013, 0.31], [0.0001, 0.31]], 16), lathe([[0.0001, 0], [0.05, 0], [0.05, 0.16], [0.03, 0.19], [0.015, 0.2], [0.015, 0.25], [0.0001, 0.25]], 16), lathe([[0.0001, 0], [0.035, 0], [0.037, 0.24], [0.012, 0.29], [0.012, 0.34], [0.0001, 0.34]], 16)];
  const bottleMats = [0x3a1806, 0x1a2410, 0x6a4a20].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 1, depthWrite: false }));
  const bm4 = new THREE.Matrix4(); const counts = [0, 0, 0]; const slots = [];
  for (const y of [1.27, 1.87, 2.47]) for (let z = -3.0; z < 2.1; z += br.range(0.11, 0.17)) { const k = br.int(0, 2); slots.push([k, y, z]); counts[k]++; }
  const inst = bottleGeos.map((geo, k) => { const im = new THREE.InstancedMesh(geo, bottleMats[k], counts[k]); im.renderOrder = 1; L.add(im); return im; }); counts.fill(0);
  for (const [k, y, z] of slots) { bm4.makeTranslation(XF - 0.2 + br.range(-0.05, 0.05), y, z); inst[k].setMatrixAt(counts[k]++, bm4); }
  const barDark = await photoMat('wood', { color: 0x1c110b, bump: 0.6, rough: 0.6, clearcoat: 0.5, ccRough: 0.2, rotation: Math.PI / 2 });
  const BX = XF - 1.45;
  L.add(mesh(roundBox(0.62, 1.04, 4.6, 0.02), barDark, { p: [BX, 0.52, -0.6] }));
  L.add(mesh(roundBox(0.82, 0.055, 4.8, 0.015), tblM, { p: [BX - 0.05, 1.07, -0.6] }));
  L.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.6, 16), goldMat(0.18), { p: [BX - 0.5, 0.22, -0.6], r: [Math.PI / 2, 0, 0] }));
  const stoolLeather = M.leather(0x2a0a0e);
  for (const z of [-2.2, -0.9, 0.4]) { L.add(mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.09, 32), stoolLeather, { p: [BX - 0.8, 0.78, z] })); L.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 12), goldMat(0.16), { p: [BX - 0.8, 0.38, z] })); L.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 32), goldMat(0.2), { p: [BX - 0.8, 0.01, z] })); }
  for (const z of [-2.4, -0.6, 1.2]) { L.add(mesh(lathe([[0.0001, 0], [0.18, 0], [0.12, 0.16], [0.03, 0.22], [0.0001, 0.22]], 32), goldMat(0.25, 0xb88a50), { p: [BX - 0.15, 2.75, z] })); L.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 6), M.blackSatin(), { p: [BX - 0.15, 3.57, z] })); const b = glow(0xffc985, 0.35, 2.4); b.position.set(BX - 0.15, 2.72, z); L.add(b); }
  spot(L, { intensity: 40, pos: [BX - 0.15, 3.9, -0.6], target: [BX, 1.0, -0.6], angle: 0.9, penumbra: 1, color: 0xffcf98 });
  // members and staff (real cloth, real skin); the barman works behind the counter
  // members and staff are staged as backlit shapes, never front-lit: seated members turned three-quarters away from the lens,
  // standing ones against the glass and the backlit onyx, the barman turned to his back-bar
  chA.rotation.y = Math.PI * 0.55; // the window chair turned toward the bar and the cars
  const members = [
    { f: buildFigure({ suit: 0x14151a }), suit: 0x14151a, pose: 'sitCross', pos: [-1.7, 0.0, 3.0], ry: Math.PI * 0.55 }, // in the window chair
    { f: buildFigure({ suit: 0x2a1418, gender: 'f', hair: 0x2b1d14 }), suit: 0x2a1418, pose: 'sit', pos: [CX - 1.65, 0.0, CZ - 1.33], ry: 0.85 }, // velvet sofa, turned to the room
    { f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), suit: 0x0b0b0c, pose: 'holdGlass', pos: [BX - 0.78, 0, 1.0], ry: Math.PI / 2 - 0.25 }, // at the bar
    { f: buildFigure({ suit: 0x1c1d22 }), suit: 0x1c1d22, pose: 'standHandsBehind', pos: [2.3, 0, 3.6], ry: 0.35 }, // at the glass, looking out at the cars
    { f: buildFigure({ suit: 0x0b0b0c, shirt: 0xe8e2d8 }), suit: 0x0b0b0c, pose: 'holdGlass', pos: [XF - 0.75, 0, -1.0], ry: Math.PI / 2 }, // barman, at the back-bar
  ];
  for (const m of members) { dressFigure(m.f, { suit: m.suit }); m.f.position.set(...m.pos); m.f.rotation.y = m.ry; m.f.userData.pose(POSES[m.pose]); L.add(m.f); }
  // light: fire, lamps, the low sun and the window-side cars (no front key on faces); reflections from the room itself
  spot(L, { intensity: 60, pos: [-4, 3.8, -1], target: [0, 0.8, -3.5], angle: 0.8, penumbra: 1, color: 0xffc98a });
  { const pm = new THREE.PMREMGenerator(R); const probe = pm.fromScene(L, 0.02, 0.05, 200, { size: 256, position: new THREE.Vector3(CX - 1.8, 1.4, CZ + 1.4) }).texture; pm.dispose(); L.environment = probe; L.environmentIntensity = 1.0; L.environmentRotation.set(0, 0, 0); }
  ls.onUpdate((t) => { fireMat.uniforms.time.value = t; const fl = noise1(t * 6) * 0.2 + noise1(t * 13) * 0.1; fireL.intensity = 6.5 * (1 + fl); hearthM.opacity = 0.3 * (1 + fl); members[2].f.userData.J['el1'].rotation.x = -1.5 - Math.max(0, Math.sin(t * 0.9)) * 0.25; for (const c of coupes) c.userData.update(t); });
  shots.push(shot('s7.5', 66.0, 72.0, ls, keyCam([v3(-8.4, 1.75, -1.8), v3(-7.2, 1.6, -0.6), v3(-6.0, 1.5, 0.2)], [v3(1.5, 1.0, 1.2), v3(2.0, 1.0, 2.0), v3(2.0, 0.9, 2.6)], { fov: 50, aperture: 1.5, ease: (x) => easeInOutCubic(x) }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.55, streak: 0.16, threshold: 1.2, gain: [1.08, 1.0, 0.88], lift: [0.004, 0.002, 0.0] } }));
  return { shots };
}
