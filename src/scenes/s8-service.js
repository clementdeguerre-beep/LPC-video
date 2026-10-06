// SCENE 8 (72–82s) — THE SERVICE. Key on a velvet tray, an enclosed carrier sealing its doors,
// a private track day at sunset, a rare car turning before a silent audience, a gold wax seal.
// Realism pass: every set is lit and reflected by a real photographic HDR panorama (warm lounge, Venetian
// sunset, golden-hour field, photo studios); exteriors show the photographed sky; large surfaces use photo
// textures (lacquered hardwood, real asphalt, real turf); hero props are photoreal glTF models (aviator sunglasses,
// glass vases with roses, traffic cones, the concept car), cleaned of every third-party mark.
import { THREE, envOn, makeSet, spot, point, dirLight, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, easeInOutCubic, lightCone } from './common.js';
import { buildCar, emblemMaterial } from '../models/car.js';
import { buildFigure, POSES } from '../models/figure.js';
import { mesh, roundBox, lathe } from '../models/geo.js';
import { glow } from '../engine/materials.js';
import { drawTexture, drawNormal, drawEmblem, FONT_SERIF } from '../engine/textures.js';
import { easeOutCubic, easeInCubic, TAU, easeOutQuint } from '../engine/util.js';
import { hdri, useHdri, HDRI, model, hide, findIn, photo, selectVariant } from '../engine/assets.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------------
// Asset helpers (local to this scene)

/** Photoreal glTF with the punctual lights / cameras it ships with removed (we light every set ourselves). */
async function prop(name, opts) {
  const m = await model(name, opts); const drop = [];
  m.traverse((o) => { if (o.isLight || o.isCamera) drop.push(o); }); for (const o of drop) o.parent?.remove(o);
  return m;
}
/** Drop the glTF parser handle from a loaded model so it can be cloned with Object3D.clone() (userData is JSON-copied). */
function cloneable(m) { m.userData = { size: m.userData.size }; return m; }
/** Clone-and-edit every material of a model once (shared cache materials stay untouched). fn(clone, name). */
function editMats(root, fn) {
  const done = new Map();
  const f = (m) => { if (!done.has(m)) { const c = m.clone(); fn(c, m.name || ''); done.set(m, c); } return done.get(m); };
  root.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
  return root;
}
/** Replace KHR transmission glass with cheap transparent glass (no extra transmission render pass). */
function cheapGlass(root, { opacity = 0.2, color = 0xffffff } = {}) {
  return editMats(root, (c) => { if (!c.transmission) return; c.transmission = 0; c.thickness = 0; c.transparent = true; c.opacity = opacity; c.color.set(color); c.roughness = 0.02; c.depthWrite = false; });
}
/** PMREM of a real HDR panorama with its sun clamped to `max` (hue kept): the sun's direct light comes from a matching
 *  DirectionalLight instead, so mirror-smooth clear coats show a crisp sun glint rather than a frame-filling bloom. */
async function clampedEnv(renderer, name, max = 40) {
  const h = await hdri(name); const src = h.equirect; const d = src.image?.data; if (!d || src.type !== THREE.HalfFloatType) return h.pmrem;
  const out = new Uint16Array(d); const H = THREE.DataUtils; const cap = H.toHalfFloat(max);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] <= cap && out[i + 1] <= cap && out[i + 2] <= cap) continue;
    // the sun core overflows half float (Infinity): give it the clamp value, keep the hue of finite pixels
    const c = [out[i], out[i + 1], out[i + 2]].map((v) => H.fromHalfFloat(v)); const fin = c.every(Number.isFinite);
    const k = fin ? max / Math.max(...c) : 1; for (let j = 0; j < 3; j++) out[i + j] = H.toHalfFloat(Number.isFinite(c[j]) ? (fin ? c[j] * k : Math.min(c[j], max)) : max);
  }
  const t = new THREE.DataTexture(out, src.image.width, src.image.height, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = src.colorSpace; t.flipY = src.flipY; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  const gen = new THREE.PMREMGenerator(renderer); const pm = gen.fromEquirectangular(t).texture; gen.dispose(); t.dispose(); return pm;
}

/** Photoreal aviator sunglasses, cleaned: logo-printed temple texture removed (plain black acetate), smoked lenses. */
async function sunglasses() {
  const m = await prop('SunglassesKhronos', { size: 0.15, axis: 'x' });
  editMats(m, (c, n) => {
    if (/temple|earhook/i.test(n)) { c.map = null; c.emissiveMap = null; c.color.set(0x0c0b0b); c.roughness = 0.28; c.metalness = 0; }
    if (/lens/i.test(n)) { c.transmission = 0; c.iridescence = 0; c.transparent = true; c.opacity = 0.88; c.color.set(0x16110c); c.roughness = 0.03; c.metalness = 0.3; c.depthWrite = /exterior/i.test(n); }
    if (/nose/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.5; }
  });
  return m;
}

/** Private clone of a cached photo texture with its own tiling. */
function tiled(tex, rx, ry, rot = 0) { const c = tex.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.rotation = rot; c.needsUpdate = true; return c; }

/** Lacquered hardwood from the real photo set (diffuse + roughness + bump), stained dark. */
async function woodMat({ color = 0x7a4a30, repeat = [2.5, 0.8], rot = 0, coat = 1, coatRough = 0.06, bump = 0.6 } = {}) {
  const [map, rough, bmp] = await Promise.all([
    photo('textures/hardwood2_diffuse.jpg', { srgb: true }), photo('textures/hardwood2_roughness.jpg', { srgb: false }), photo('textures/hardwood2_bump.jpg', { srgb: false }),
  ]);
  return new THREE.MeshPhysicalMaterial({
    color, map: tiled(map, ...repeat, rot), roughnessMap: tiled(rough, ...repeat, rot), bumpMap: tiled(bmp, ...repeat, rot), bumpScale: bump,
    roughness: 0.8, metalness: 0, clearcoat: coat, clearcoatRoughness: coatRough,
  });
}

/** Photoreal concept car (Khronos CarConcept) cleaned for the brief: no logos / plates / dash display / sidewall lettering,
 *  palette paint, cheap dark glass. Length along the film's +x (nose forward). env: optional private reflection map. */
async function conceptCar({ paint = 0x5e6066, metal = 0.85, rough = 0.3, coatRough = 0.03, trim = 0x3d0b12, length = 4.45, lights = 0, env = null, envI = 1, cabin = true } = {}) {
  const m = await prop('CarConcept', { size: length, axis: 'z' });
  hide(m, /license|emblem/i); await selectVariant(m, 'Graphite');
  editMats(m, (c, n) => {
    if (c.emissiveMap) { c.emissiveMap = null; c.emissive?.set(0x000000); } // third-party marks live in emissive maps (rims, mirrors) + the dash display
    if (/Glass/i.test(n)) { c.transmission = 0; c.transparent = true; c.opacity = 0.62; c.color.set(0x07080a); c.roughness = 0.02; c.metalness = 0; c.depthWrite = false; }
    if (/Paint 1/i.test(n)) { c.color.set(paint); c.metalness = metal; c.roughness = rough; c.clearcoat = 1; c.clearcoatRoughness = coatRough; c.iridescence = 0; }
    if (/Paint 2/i.test(n)) { c.color.set(0x050506); c.metalness = 0.2; c.roughness = 0.25; c.clearcoat = 1; c.clearcoatRoughness = 0.04; c.iridescence = 0; }
    if (/Interior 3/i.test(n)) c.color.set(trim);
    if (/Headlight/i.test(n)) { c.emissive?.set(lights ? 0xfff1dc : 0x000000); c.emissiveIntensity = lights ? 6 : 0.05; }
    if (/Brakelight/i.test(n)) { c.emissive?.set(0xff1408); c.emissiveIntensity = lights ? 2.2 : 0.05; }
    if (/Signallight|Dashboard/i.test(n)) { c.emissive?.set(0x000000); c.emissiveIntensity = 0; }
    if (/Tireside/i.test(n)) { c.map = null; c.normalMap = null; c.color.set(0x131313); c.roughness = 0.6; } // sidewall texture + relief carry third-party lettering
    if (/Rim2/i.test(n)) { c.color.set(0x9a9b9f); c.roughness = 0.24; } // brushed-titanium spokes
    if (env && 'envMap' in c) { c.envMap = env; c.envMapIntensity = envI; }
  });
  hide(m, /^(Engine|Axles|InteriorPedal|InteriorFloor|InteriorCage|InteriorSeatsFrame|InteriorSteering|BodyWindshieldWipers|BodyHood(Interior|Under)|Wheel.*BrakePad)/); // hidden by body / dark glass
  hide(m, cabin ? /^Interior(Dash|Floormats|Pillar)/ : /^Interior(?!Seats)/); // seen through dark glass: seats are enough
  m.rotation.y = Math.PI / 2; // model length is +z → the film's +x convention
  const holder = new THREE.Group(); holder.add(m); return holder;
}

/** Low sun straight into the lens: mirror-smooth glass / clear coat turn the DirectionalLight into frame-filling glints.
 *  Give this object's (cloned) materials a believable minimum micro-roughness instead (shared library materials untouched). */
function softenGlints(root, { rough = 0.12, coat = 0.1 } = {}) {
  return editMats(root, (c) => { if ('roughness' in c && c.roughness < rough) c.roughness = rough; if (c.clearcoat > 0 && c.clearcoatRoughness < coat) c.clearcoatRoughness = coat; });
}

/** Soft contact shadow (canvas AO decal) for a car footprint of L × W metres, length along x. */
function footShadow(L = 4.45, W = 1.95, strength = 0.95) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); // alphaMap reads the green channel: white shapes on black
  g.filter = 'blur(16px)'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.roundRect(56, 52, 400, 152, 64); g.fill();
  g.filter = 'blur(7px)'; g.fillStyle = 'rgba(255,255,255,0.95)'; for (const x of [118, 386]) for (const y of [70, 186]) { g.beginPath(); g.ellipse(x, y, 40, 20, 0, 0, TAU); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.2, W * 1.35), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: strength, depthWrite: false }));
  s.rotation.x = -Math.PI / 2; s.position.y = 0.004; s.renderOrder = 2; return s;
}

/** Photoreal traffic cone (single cone, ground plate / bulb removed), recoloured from safety orange to the palette's deep
 *  burgundy (white reflective bands kept). Returns { cone: Group centred on the cone, asphalt: { map, rough } from the plate }. */
async function trackCone(height = 0.5) {
  const m = await prop('TrafficCone', { size: height, axis: 'y' });
  const plate = findIn(m, /plane/i).find((o) => o.isMesh); const asphalt = plate ? { map: plate.material.map, rough: plate.material.roughnessMap } : null;
  hide(m, /plane|bulb|retro/i);
  editMats(m, (c, n) => {
    if (!/ConeBase/i.test(n)) return;
    if (c.specularColor) c.specularColor.setScalar(1); c.specularIntensity = 0.6; c.roughness = 0.42;
    const img = c.map?.image; if (!img) return;
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height); const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gg = p[i + 1], b = p[i + 2]; const s = clamp((r - b) / (r + 1) * 1.15); const f = r / 235;
      p[i] = lerp(r, 112 * f, s); p[i + 1] = lerp(gg, 14 * f, s); p[i + 2] = lerp(b, 24 * f, s); // orange → burgundy, white bands kept
    }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = c.map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = c.map.wrapS; t.wrapT = c.map.wrapT; t.anisotropy = 4; c.map = t;
  });
  m.updateMatrixWorld(true); const coneMesh = findIn(m, /ConeBase/i).find((o) => o.isMesh && o.visible);
  const box = new THREE.Box3().setFromObject(coneMesh); const ctr = box.getCenter(new THREE.Vector3());
  m.position.x -= ctr.x; m.position.z -= ctr.z; cloneable(m); const cone = new THREE.Group(); cone.add(m);
  return { cone, asphalt };
}

// ------------------------------------------------------------------------------------------------
// Procedural hero pieces kept from the original film (now lit by real panoramas)

function buildKey() {
  const g = new THREE.Group();
  const blade = new THREE.Shape(); blade.moveTo(0, -0.005); blade.lineTo(0.05, -0.005); blade.lineTo(0.056, 0); blade.lineTo(0.05, 0.005); for (let i = 0; i < 6; i++) { blade.lineTo(0.045 - i * 0.007, 0.005 + (i % 2 ? 0.002 : -0.001)); } blade.lineTo(0, 0.005); blade.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.0022, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 1 }), M.chrome(), { p: [0.012, 0, -0.0011] }));
  const head = mesh(roundBox(0.03, 0.026, 0.009, 0.004, 6), M.blackGloss()); g.add(head);
  const badge = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.0015, 40), emblemMaterial(), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.0048] }); badge.geometry.rotateY(Math.PI / 2); g.add(badge);
  g.add(mesh(new THREE.TorusGeometry(0.006, 0.0012, 8, 32), M.goldPolished(), { p: [-0.017, 0, 0] }));
  const fob = mesh(roundBox(0.035, 0.022, 0.003, 0.004, 5), M.leather(0x2a140c), { p: [-0.038, -0.004, 0], r: [0, 0, 0.35] }); g.add(fob);
  return g;
}

function velvetTray(velvet = M.velvet(0x3a0c12)) {
  const g = new THREE.Group(); const s = new THREE.Shape(); const w = 0.16, h = 0.1, r = 0.02;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const base = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3 }), M.goldPolished(), { r: [-Math.PI / 2, 0, 0] }); g.add(base);
  const inner = new THREE.Shape(s.getPoints(32).map((p) => p.multiplyScalar(0.9)));
  g.add(mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.004, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3 }), velvet, { r: [-Math.PI / 2, 0, 0], p: [0, 0.014, 0] }));
  return g;
}

function flagMesh() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d'); for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#0a0a0a' : '#ece6da'; g.fillRect(x * 32, y * 32, 32, 32); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.0, 0.7, 40, 20); const base = geo.attributes.position.array.slice();
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color(0xfff0d8) }));
  m.userData.wave = (t) => { const p = geo.attributes.position.array; for (let i = 0; i < p.length; i += 3) { const x = base[i] + 0.5; p[i + 2] = Math.sin(x * 7 - t * 9) * 0.06 * x + Math.sin(x * 13 - t * 13 + base[i + 1] * 4) * 0.02 * x; } geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
  return m;
}

/** Private circuit: real asphalt photo on the track, burgundy/ivory kerbs, real turf photo, pit wall + catch-fence posts. */
async function circuit(asphalt) {
  const g = new THREE.Group();
  const turf = await photo('textures/terrain/grasslight-big.jpg', { srgb: true });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x8c8682, roughness: 1, metalness: 0 });
  if (asphalt?.map) { trackMat.map = tiled(asphalt.map, 100, 3.5); trackMat.roughnessMap = asphalt.rough ? tiled(asphalt.rough, 100, 3.5) : null; trackMat.roughness = 0.95; }
  const track = new THREE.Mesh(new THREE.PlaneGeometry(400, 14), trackMat); track.rotation.x = -Math.PI / 2; g.add(track);
  const kc = document.createElement('canvas'); kc.width = 256; kc.height = 32; const k = kc.getContext('2d'); for (let i = 0; i < 8; i++) { k.fillStyle = i % 2 ? '#e9e4da' : '#7a1420'; k.fillRect(i * 32, 0, 32, 32); }
  const kt = new THREE.CanvasTexture(kc); kt.wrapS = THREE.RepeatWrapping; kt.repeat.set(100, 1); kt.colorSpace = THREE.SRGBColorSpace;
  for (const z of [-7.6, 7.6]) { const kerb = new THREE.Mesh(new THREE.PlaneGeometry(400, 1.2), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.45 })); kerb.rotation.x = -Math.PI / 2; kerb.position.set(0, 0.03, z); g.add(kerb); }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshStandardMaterial({ map: tiled(turf, 180, 100), color: 0xb8a878, roughness: 0.95 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; g.add(grass);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(400, 1.1, 0.4), M.floor(0xb8b2a6)); wall.position.set(0, 0.55, -12); g.add(wall);
  const postGeo = new THREE.BoxGeometry(0.1, 3.5, 0.1); for (let i = 0; i < 40; i++) g.add(mesh(postGeo, M.matte(0x111111), { p: [-200 + i * 10, 2.2, -12.3] }));
  return g;
}

/** Sun disc + glow (real lens-flare sprite) kept at a fixed direction from the camera, so it sits on the photographed sun. */
async function sunSprite(dir, { color = 0xffc890, intensity = 5, size = 0.2, dist = 300 } = {}) {
  const tex = await photo('textures/lensflare/lensflare0.png', { srgb: true });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  s.scale.setScalar(size * dist); s.userData.follow = (cam) => s.position.copy(cam.position).addScaledVector(dir, dist); return s;
}
/** World direction of a panorama feature (azimuth/elevation in the unrotated photo) after a yaw `rot`. */
function panoDir(azDeg, elDeg, rot) { const az = azDeg * DEG - rot, el = elDeg * DEG; return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); }

// ------------------------------------------------------------------------------------------------
export async function buildS8(ctx) {
  const shots = [];
  const [vase, shades, coneKit] = await Promise.all([prop('GlassVaseFlowers'), sunglasses(), trackCone(0.5)]);
  cheapGlass(vase, { opacity: 0.18 }); editMats(vase, (c, n) => { if (/Flowers/i.test(n)) c.color.set(0xd49a9a); }); // deeper rose petals
  const deskWood = await woodMat({ color: 0x8a5a3c, repeat: [2.2, 0.55] });

  // ---------------------------------------------------------------- 8.1 key on the velvet tray → concierge desk
  const ks = makeSet(null); const K = ks.scene; const ROT1 = 1.9;
  await useHdri(K, HDRI.interiorWarm, { env: 0.42, background: true, blur: 0.32, bgIntensity: 0.075, rotation: ROT1 });
  const desk = mesh(new THREE.BoxGeometry(2.4, 0.06, 1.0), deskWood, { p: [0, -0.03, 0] }); K.add(desk);
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x2a060c, roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color(0x8a2a38) });
  const tray = velvetTray(velvet); K.add(tray); const key = buildKey(); key.scale.setScalar(1.6); K.add(key);
  vase.position.set(0.25, 0, -0.26); vase.rotation.y = -0.5; K.add(vase);
  shades.position.set(-0.2, 0, 0.2); shades.rotation.y = 0.9; K.add(shades);
  const bell = new THREE.Group(); bell.position.set(0.36, 0, 0.1); K.add(bell); // concierge service bell: black base, gold dome, plunger
  bell.add(mesh(new THREE.CylinderGeometry(0.056, 0.06, 0.014, 48), M.blackGloss(), { p: [0, 0.007, 0] }));
  bell.add(mesh(lathe([[0.0001, 0], [0.05, 0], [0.05, 0.008], [0.042, 0.032], [0.026, 0.05], [0.01, 0.057], [0.0001, 0.058]], 48), M.goldPolished(), { p: [0, 0.014, 0] }));
  bell.add(mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.014, 12), M.chrome(), { p: [0, 0.078, 0] })); bell.add(mesh(new THREE.SphereGeometry(0.0065, 16, 8), M.blackGloss(), { p: [0, 0.087, 0], s: [1, 0.6, 1] }));
  const lampGlow = glow(0xffb870, 0.3, 1.0); lampGlow.position.set(-1.0, 0.47, 0.1); K.add(lampGlow); // the desk lamp, just off frame
  spot(K, { intensity: 2.6, pos: [0.3, 0.8, 0.5], target: [0, 0, 0], angle: 0.35, penumbra: 1, color: 0xffe0b0 });
  point(K, { intensity: 0.9, pos: [-1.0, 0.42, 0.1], color: 0xffb060 });
  ks.onUpdate((t) => { const k = easeOutQuint(clamp((t - 72.0) / 0.9)); key.position.set(lerp(0.05, 0.0, k), lerp(0.16, 0.032, k), lerp(-0.04, 0.0, k)); key.rotation.set(-Math.PI / 2 + lerp(0.6, 0, k), 0, lerp(0.5, 0.25, k)); });
  shots.push(shot('s8.1', 72.0, 73.8, ks, (lt, u, cam) => { const k = smooth(clamp((u - 0.45) / 0.55)); const d = aim(cam, v3(lerp(0.12, 0.6, k), lerp(0.12, 0.5, k), lerp(0.16, 0.9, k)), v3(0, 0.03, 0), { fov: 30, near: 0.005, far: 30 }); return { focus: d, aperture: lerp(10, 3, k) }; },
    { trans: { type: 'luma', dur: 0.6 }, grade: { exposure: 1.15, bloom: 0.5, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));

  // ---------------------------------------------------------------- 8.2 enclosed carrier seals its doors (dusk, Venetian sunset sky)
  const tsS = makeSet(null, { fog: new THREE.FogExp2(0x3a2c30, 0.0045) }); const TR = tsS.scene; const ROT2 = 1.73;
  await useHdri(TR, HDRI.sunsetSea, { env: 0.55, background: true, blur: 0.035, bgIntensity: 0.3, rotation: ROT2 });
  TR.environment = await clampedEnv(ctx.renderer, HDRI.sunsetSea, 300);
  {
    const am = coneKit.asphalt; const gm = new THREE.MeshStandardMaterial({ color: 0x4a4542, roughness: 0.6, metalness: 0 });
    if (am?.map) { gm.map = tiled(am.map, 200, 200); if (am.rough) gm.roughnessMap = tiled(am.rough, 200, 200); }
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), gm); gr.rotation.x = -Math.PI / 2; TR.add(gr);
  }
  const trailer = new THREE.Group(); TR.add(trailer); const gloss = M.paint(0x050505, { metalness: 0.5 });
  trailer.add(mesh(roundBox(12, 2.9, 2.55, 0.08), gloss, { p: [0, 2.05, 0] }));
  for (const z of [-1.29, 1.29]) { trailer.add(mesh(new THREE.BoxGeometry(11.6, 0.03, 0.01), M.goldPolished(), { p: [0, 2.9, z] })); trailer.add(mesh(new THREE.BoxGeometry(11.6, 0.012, 0.01), M.goldPolished(), { p: [0, 2.84, z] })); }
  const em = mesh(new THREE.CircleGeometry(0.5, 64), emblemMaterial(), { p: [1.5, 2.1, 1.285] }); trailer.add(em);
  const rimGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.02, 32); const hubGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.05, 16);
  for (const x of [-4.6, -3.4, 3.5, 4.7]) for (const z of [-1.0, 1.0]) {
    trailer.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 40), M.tyre(), { p: [x, 0.5, z], r: [Math.PI / 2, 0, 0] }));
    trailer.add(mesh(rimGeo, M.titanium(), { p: [x, 0.5, z + Math.sign(z) * 0.177], r: [Math.PI / 2, 0, 0] })); trailer.add(mesh(hubGeo, M.chrome(), { p: [x, 0.5, z + Math.sign(z) * 0.19], r: [Math.PI / 2, 0, 0] }));
  }
  for (const z of [-1.2, 1.2]) trailer.add(mesh(new THREE.BoxGeometry(5.6, 0.42, 0.04), M.blackSatin(), { p: [-0.2, 0.82, z] })); // side skirts
  trailer.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 2.3), M.titanium(), { p: [-6.08, 0.48, 0] })); // underride bar
  for (let i = 0; i < 6; i++) for (const z of [-1.3, 1.3]) trailer.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), M.emissive(0xffa040, 2.5), { p: [-5.2 + i * 2.1, 3.42, z] })); // clearance markers
  const cab = new THREE.Group(); cab.add(mesh(roundBox(2.6, 3.1, 2.5, 0.2), gloss, { p: [0, 1.9, 0] })); cab.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 2.2), M.glass(), { p: [1.31, 2.6, 0] })); cab.position.set(7.6, 0, 0); trailer.add(cab);
  const doors = []; for (const s of [1, -1]) { const pivot = new THREE.Group(); pivot.position.set(-6.02, 2.05, s * 1.27); const leaf = mesh(roundBox(0.06, 2.8, 1.26, 0.02), gloss, { p: [0, 0, -s * 0.63] }); pivot.add(leaf); leaf.add(mesh(new THREE.BoxGeometry(0.02, 2.7, 0.02), M.rubber(), { p: [-0.03, 0, -s * 0.62] })); leaf.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 12), M.chrome(), { p: [-0.05, 0, -s * 0.45] })); trailer.add(pivot); doors.push({ pivot, s }); }
  for (const z of [-1.0, 1.0]) { const tl = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.25), M.emissive(0xb0101a, 4), { p: [-6.05, 0.75, z] }); trailer.add(tl); }
  const interiorGlow = mesh(new THREE.PlaneGeometry(2.4, 2.7), M.emissive(0xffcf8a, 1.2), { p: [-5.9, 2.05, 0], r: [0, -Math.PI / 2, 0] }); trailer.add(interiorGlow);
  trailer.add(footShadow(13.5, 2.2, 0.85).translateX(0.6));
  for (const [x, z, r] of [[-8.2, 2.1, 0.3], [-8.6, -1.6, -0.5]]) { const c = coneKit.cone.clone(); c.position.set(x, 0, z); c.rotation.y = r; TR.add(c); } // loading-bay cones
  spot(TR, { intensity: 220, pos: [-12, 5, 5], target: [-6, 2, 0], angle: 0.5, penumbra: 1, color: 0xffd9a8 });
  tsS.onUpdate((t) => { const k = easeInOutCubic(clamp((t - 73.6) / 1.1)); for (const d of doors) d.pivot.rotation.y = d.s * lerp(1.45, 0.0, k); interiorGlow.material.color.setRGB(1, 0.81, 0.54).multiplyScalar(1.2 * (1 - k * 0.9)); });
  shots.push(shot('s8.2', 73.8, 75.8, tsS, keyCam([v3(-9.6, 2.0, 2.8), v3(-12, 2.6, 6.0), v3(-19, 3.6, 10.5)], [v3(-6.05, 2.0, 0.0), v3(-5.0, 2.0, 0), v3(-1, 2.0, 0)], { fov: 36, aperture: (u) => lerp(8, 1.5, u), ease: (x) => easeInOutCubic(x), far: 1200 }),
    { trans: { type: 'zoom', dur: 0.5, center: [0.55, 0.5] }, grade: { exposure: 1.2, bloom: 0.55, streak: 0.3, threshold: 1.2, lift: [0.004, 0.005, 0.012] } }));

  // ---------------------------------------------------------------- 8.3 private track day at sunset (real golden-hour field)
  const tdS = makeSet(null, { fog: new THREE.Fog(0x9a8466, 70, 330) }); const TD = tdS.scene; const ROT3 = 3.24;
  await useHdri(TD, HDRI.sunriseField4k, { background: true, blur: 0.012, bgIntensity: 0.72, rotation: ROT3 });
  await useHdri(TD, HDRI.sunriseField, { env: 1.0, rotation: ROT3 }); TD.environment = await clampedEnv(ctx.renderer, HDRI.sunriseField, 30);
  const sunDir = panoDir(35.5, 8.1, ROT3);
  TD.add(await circuit(coneKit.asphalt)); const flag = flagMesh(); flag.position.set(2.2, 2.8, 6.5); TD.add(flag); TD.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 12), M.steel(), { p: [1.7, 1.7, 6.5] }));
  {
    // softer clear coat (0.1): a sun glint rather than a frame-filling bloom; dark glass, so seats are all the cabin needs
    const hero = await conceptCar({ paint: 0x5e6066, metal: 0.7, rough: 0.34, coatRough: 0.1, lights: 1, cabin: false });
    softenGlints(hero); hero.position.set(-4, 0, 3.5); hero.rotation.y = 0.55; TD.add(hero);
    const sh = footShadow(); sh.position.set(-4, 0.004, 3.5); sh.rotation.z = 0.55; TD.add(sh);
  }
  // procedural echelon: foot shadows drawn white-on-black (car.js contactShadow's alphaMap is all black, i.e. invisible)
  [['classic', 0x050505], ['prototype', 0xcdb48a], ['gt', 0x3d0b12], ['roadster', 0x101a14]].forEach(([p, c], j) => { const i = j + 1; const car = buildCar(p, { lite: true, color: c, seed: 170 + i }); car.group.position.set(-4 - i * 5.5, 0, 3.5); car.group.rotation.y = 0.55; car.lights(0.35, 1); softenGlints(car.group); car.group.add(footShadow(car.spec.L, Math.max(...car.spec.W.map((q) => q[1])) * 2, 0.85)); TD.add(car.group); });
  for (let i = 0; i < 14; i++) { const c = coneKit.cone.clone(); c.position.set(6 - i * 3, 0, 7.0); c.rotation.y = i * 0.7; TD.add(c); }
  dirLight(TD, { color: 0xffb070, intensity: 1.0, pos: sunDir.clone().multiplyScalar(200).toArray() });
  const sun3 = await sunSprite(sunDir, { intensity: 5, size: 0.22 }); TD.add(sun3);
  tdS.onUpdate((t) => flag.userData.wave(t));
  const cam3 = keyCam([v3(3.6, 2.9, 8.2), v3(6, 3.5, 13), v3(10, 6.5, 20)], [v3(2.3, 2.75, 6.5), v3(-4, 1.5, 4), v3(-12, 0.5, 3)], { fov: 36, aperture: (u) => lerp(8, 1, smooth(u * 1.6)), ease: (x) => easeInOutCubic(x), far: 2000 });
  shots.push(shot('s8.3', 75.8, 77.8, tdS, (lt, u, cam) => { const r = cam3(lt, u, cam); sun3.userData.follow(cam); return r; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.12, bloom: 0.5, streak: 0.3, threshold: 1.5, gain: [1.1, 1.0, 0.84], saturation: 1.08, contrast: 1.08 } }));

  // ---------------------------------------------------------------- 8.4 rotating platform, silent audience (photo-studio reflections)
  const rpS = makeSet(null); const RP = rpS.scene;
  await useHdri(RP, HDRI.studio, { env: 0.3, rotation: 0.4 });
  const tall = await hdri(HDRI.studioTall);
  const stage = new THREE.Group(); RP.add(stage); stage.add(mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.25, 128), M.blackGloss(), { p: [0, 0.125, 0] }));
  stage.add(mesh(new THREE.CylinderGeometry(3.31, 3.31, 0.05, 128, 1, true), M.titanium(), { p: [0, 0.03, 0] }));
  const sRing = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.015, 8, 200), M.emissive(0xffcf8a, 3)); sRing.rotation.x = Math.PI / 2; sRing.position.y = 0.25; stage.add(sRing);
  const rare = await conceptCar({ paint: 0xbf9f62, metal: 0.9, rough: 0.26, trim: 0x3d0b12, lights: 1, env: tall.pmrem, envI: 0.75 }); rare.position.y = 0.25; stage.add(rare);
  const rs = footShadow(); rs.position.y = 0.254; stage.add(rs);
  const floorR = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), await woodMat({ color: 0x3a2618, repeat: [24, 48], coatRough: 0.05 })); floorR.rotation.x = -Math.PI / 2; RP.add(floorR);
  for (const [x, z] of [[0, 0], [-2.2, 1.5], [2.2, -1.5]]) { spot(RP, { intensity: 110, pos: [x * 0.4, 8, z * 0.4], target: [x * 0.3, 0.5, z * 0.3], angle: 0.32, penumbra: 0.6, color: 0xfff1dc }); const cone = lightCone(8, 2.6, 0xffe6c0, 0.05); cone.position.set(x * 0.4, 8, z * 0.4); RP.add(cone); }
  const aud = rng(9); for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) { const f = buildFigure({ suit: aud() < 0.5 ? 0x0b0b0c : 0x16171b, gender: aud() < 0.35 ? 'f' : 'm' }); f.userData.pose(POSES.sitAudience); f.position.set(-5.4 + i * 1.8 + (row % 2) * 0.9, 0, 6.5 + row * 1.4); f.rotation.y = Math.PI + (i - 3) * 0.06; editMats(f, (c) => envOn(c, RP, 0.06)); RP.add(f); }
  rpS.onUpdate((t) => { stage.rotation.y = (t - 77.0) * 0.32; });
  shots.push(shot('s8.4', 77.8, 79.8, rpS, keyCam([v3(1.2, 1.6, 11.5), v3(0.2, 1.9, 10.6)], [v3(0, 0.9, 0), v3(0, 0.8, 0)], { fov: 32, aperture: 2.5, ease: (x) => x }),
    { trans: { type: 'dissolve', dur: 0.5 }, grade: { exposure: 1.2, bloom: 0.6, streak: 0.3, threshold: 1.1 } }));

  // ---------------------------------------------------------------- 8.5 certificate + gold wax seal
  const ce = makeSet(null); const CE = ce.scene;
  await useHdri(CE, HDRI.interiorWarm, { env: 0.4, background: true, blur: 0.32, bgIntensity: 0.06, rotation: ROT1 });
  const paperTex = drawTexture(1024, 1400, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h); g.globalAlpha = 0.05; for (let i = 0; i < 4000; i++) { g.fillStyle = i % 2 ? '#8a7a60' : '#ffffff'; g.fillRect((i * 997) % w, (i * 613) % h, 2, 2); } g.globalAlpha = 1;
    g.strokeStyle = '#b8964e'; g.lineWidth = 6; g.strokeRect(40, 40, w - 80, h - 80); g.lineWidth = 2; g.strokeRect(58, 58, w - 116, h - 116);
    g.fillStyle = '#2a2218'; g.textAlign = 'center'; g.font = `600 64px ${FONT_SERIF}`; g.fillText('CERTIFICATE', w / 2, 220); g.font = `500 40px ${FONT_SERIF}`; g.fillText('OF AUTHENTICITY', w / 2, 280);
    g.font = `italic 500 34px ${FONT_SERIF}`; g.fillText('Legend Paddock Club', w / 2, 360);
    g.fillStyle = '#5a4a38'; for (let i = 0; i < 9; i++) g.fillRect(150, 480 + i * 62, w - 300 - (i % 3) * 60, 3);
    g.strokeStyle = '#2a2218'; g.lineWidth = 3; g.beginPath(); g.moveTo(600, 1180); for (let i = 0; i < 40; i++) g.lineTo(600 + i * 6, 1180 + Math.sin(i * 0.9) * 18 - i * 0.6); g.stroke();
  });
  const paper = mesh(new THREE.PlaneGeometry(0.21, 0.29), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.85 }), { r: [-Math.PI / 2, 0, 0], p: [0, 0.0008, 0] }); CE.add(paper);
  CE.add(mesh(new THREE.BoxGeometry(2.0, 0.04, 1.4), deskWood, { p: [0, -0.02, -0.2] }));
  point(CE, { intensity: 0.8, pos: [-0.55, 0.42, -0.75], color: 0xffb060 });
  const key5 = buildKey(); key5.scale.setScalar(1.1); key5.rotation.set(-Math.PI / 2, 0, 2.72); key5.position.set(0.135, 0.0062, 0.04); CE.add(key5); // the key from 8.1, set down beside the papers
  const sealPos = v3(-0.045, 0, 0.09);
  const waxN = drawNormal(512, 512, (g, w) => { g.fillStyle = '#888'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, TAU); g.fill(); drawEmblem(g, w / 2, w / 2, w * 0.38, { fill: '#fff', stroke: '#fff' }); }, 5);
  const waxMat = new THREE.MeshPhysicalMaterial({ color: 0xc9a050, metalness: 0.85, roughness: 0.28, normalMap: waxN, normalScale: new THREE.Vector2(0, 0), clearcoat: 0.6 });
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.004, 64), waxMat); wax.geometry.rotateY(Math.PI / 2); wax.position.copy(sealPos).add(v3(0, 0.002, 0)); CE.add(wax);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 32, 16), waxMat.clone()); blob.material.normalMap = null; blob.scale.set(1, 0.45, 1); blob.position.copy(sealPos); CE.add(blob);
  const stamp = new THREE.Group(); stamp.add(mesh(lathe([[0.0001, 0], [0.024, 0], [0.025, 0.004], [0.016, 0.02], [0.012, 0.07], [0.02, 0.1], [0.024, 0.12], [0.0001, 0.125]], 48), M.goldPolished())); stamp.add(mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.002, 48), emblemMaterial(), { p: [0, 0.0005, 0] })); CE.add(stamp);
  spot(CE, { intensity: 1.6, pos: [0.25, 0.5, 0.35], target: [-0.03, 0, 0.06], angle: 0.4, penumbra: 1, color: 0xffe0b0 }); spot(CE, { intensity: 0.8, pos: [-0.4, 0.2, -0.2], target: [0, 0, 0], angle: 0.5, penumbra: 1, color: 0xffa860 });
  ce.onUpdate((t) => {
    const lt = t - 79.8; const down = easeInCubic(clamp(lt / 0.5)); const up = easeOutCubic(clamp((lt - 0.75) / 0.6)); const y = lerp(0.12, 0.004, down) + up * 0.14;
    stamp.position.set(sealPos.x, y, sealPos.z); const pressed = lt > 0.5; blob.visible = !pressed; wax.visible = pressed; waxMat.normalScale.set(pressed ? 1.4 : 0, pressed ? 1.4 : 0); wax.scale.setScalar(pressed ? 1 + 0.06 * smooth(clamp((lt - 0.5) / 0.15)) : 1);
  });
  shots.push(shot('s8.5', 79.8, 82.0, ce, (lt, u, cam) => { const k = smooth(clamp((u - 0.55) / 0.45)); const d = aim(cam, v3(lerp(0.06, 0.12, k), lerp(0.13, 0.32, k), lerp(0.22, 0.33, k)), v3(lerp(sealPos.x, -0.01, k), 0.01, lerp(sealPos.z, 0.04, k)), { fov: 30, near: 0.005, far: 20 }); return { focus: d, aperture: lerp(10, 5, k) }; },
    { trans: { type: 'luma', dur: 0.5 }, grade: { exposure: 1.08, bloom: 0.5, streak: 0.25, threshold: 1.2, gain: [1.06, 1.0, 0.9] } }));
  return { shots };
}
