// Photographic and photoreal assets: real HDR panoramas (Poly Haven, CC0), photo textures and
// photoreal glTF models (Khronos sample assets, CC0 / CC-BY 4.0). See assets/LICENSES.md.
//
//   await hdri('studio_small_03_1k')            → { equirect, pmrem }   (cached)
//   await useHdri(scene, 'venice_sunset_1k', { env: 1, background: true, blur: 0.04, bgIntensity: 0.8, rotation: 1.2 })
//   await model('ChronographWatch', { size: 0.045, axis: 'x' })  → Group (fresh clone, shared GPU data)
//   await photo('textures/hardwood2_diffuse.jpg', { srgb: true, repeat: [4, 4] })
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';

let renderer = null, pmrem = null;
const hdrCache = new Map(), gltfCache = new Map(), texCache = new Map();
const BASE = new URL('../../assets/', import.meta.url).href;

export function initAssets(r) { renderer = r; pmrem = new THREE.PMREMGenerator(r); pmrem.compileEquirectangularShader(); }

/** Catalogue of what lives in assets/ (agents and scenes pick from here). */
export const HDRI = {
  studio: 'studio_small_03_1k', studioTall: 'monochrome_studio_02_1k', studioColour: 'ferndale_studio_04_1k',
  warehouse: 'empty_warehouse_01_1k', interiorWarm: 'lebombo_1k', interiorModern: 'st_fagans_interior_1k', mall: 'royal_esplanade_2k.hdr.jpg',
  sunriseField: 'spruit_sunrise_1k', sunriseField4k: 'spruit_sunrise_4k.hdr.jpg', sunsetSea: 'venice_sunset_1k', sunriseBeach: 'blouberg_sunrise_2_1k',
  quarry: 'quarry_01_1k', dawnDesert: 'kiara_1_dawn_1k', alpine: 'immenstadter_horn_1k', canal: 'san_giuseppe_bridge_2k', bridge: 'pedestrian_overpass_1k',
  city: 'potsdamer_platz_1k', night: 'dikhololo_night_1k', nightGolf: 'moonless_golf_1k',
};
export const MODELS = {
  CarConcept: 'CarConcept/CarConcept.gltf', ChronographWatch: 'ChronographWatch/ChronographWatch.gltf',
  SheenWoodLeatherSofa: 'SheenWoodLeatherSofa/SheenWoodLeatherSofa.glb', GlamVelvetSofa: 'GlamVelvetSofa/GlamVelvetSofa.glb', SheenChair: 'SheenChair/SheenChair.glb',
  ChairDamaskPurplegold: 'ChairDamaskPurplegold/ChairDamaskPurplegold.glb', SpecularSilkPouf: 'SpecularSilkPouf/SpecularSilkPouf.glb',
  StainedGlassLamp: 'StainedGlassLamp/StainedGlassLamp.gltf', GlassHurricaneCandleHolder: 'GlassHurricaneCandleHolder/GlassHurricaneCandleHolder.glb',
  GlassVaseFlowers: 'GlassVaseFlowers/GlassVaseFlowers.glb', AntiqueCamera: 'AntiqueCamera/AntiqueCamera.glb', AnisotropyBarnLamp: 'AnisotropyBarnLamp/AnisotropyBarnLamp.glb',
  TrafficCone: 'TrafficCone/TrafficCone.glb', SunglassesKhronos: 'SunglassesKhronos/SunglassesKhronos.glb', Lantern: 'Lantern/Lantern.glb',
};

/** Load an HDR panorama: equirect (for visible backgrounds) + PMREM (for reflections/lighting). */
export async function hdri(name) {
  if (hdrCache.has(name)) return hdrCache.get(name);
  const file = name.includes('.') ? name : `${name}.hdr`; let equirect;
  if (file.endsWith('.jpg')) { // gain-map JPEG: use its SDR base image (fine for backgrounds) — linearised
    equirect = await new THREE.TextureLoader().loadAsync(BASE + 'hdri/' + file); equirect.colorSpace = THREE.SRGBColorSpace;
  } else { equirect = await new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(BASE + 'hdri/' + file); }
  equirect.mapping = THREE.EquirectangularReflectionMapping; equirect.generateMipmaps = false; equirect.minFilter = THREE.LinearFilter; equirect.magFilter = THREE.LinearFilter;
  const pm = pmrem.fromEquirectangular(equirect).texture;
  const out = { equirect, pmrem: pm }; hdrCache.set(name, out); return out;
}

/**
 * Light a scene with a real HDR panorama and optionally show it as a photographic backdrop.
 * env: environmentIntensity · background: show the panorama · blur: 0..1 (photographic defocus)
 * bgIntensity: brightness of the backdrop · rotation: yaw (radians) applied to both.
 */
export async function useHdri(scene, name, { env = 1, background = false, blur = 0, bgIntensity = 1, rotation = 0 } = {}) {
  const h = await hdri(name);
  scene.environment = h.pmrem; scene.environmentIntensity = env; scene.environmentRotation = new THREE.Euler(0, rotation, 0);
  if (background) { scene.background = blur > 0 ? h.pmrem : h.equirect; scene.backgroundBlurriness = blur; scene.backgroundIntensity = bgIntensity; scene.backgroundRotation = new THREE.Euler(0, rotation, 0); }
  return h;
}

/** Load a photoreal glTF model; returns a fresh clone normalised to `size` metres along `axis` ('x' | 'y' | 'z' | 'max'), sitting on y = 0. */
export async function model(name, { size = null, axis = 'max', center = true, ground = true } = {}) {
  const path = MODELS[name] ?? name;
  if (!gltfCache.has(path)) gltfCache.set(path, new GLTFLoader().loadAsync(BASE + 'models/' + path));
  const gltf = await gltfCache.get(path);
  const src = gltf.scene; const obj = src.clone(true);
  const origOf = new Map(); { const a = [], b = []; src.traverse((o) => a.push(o)); obj.traverse((o) => b.push(o)); b.forEach((o, i) => origOf.set(o, a[i])); }
  obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; if (o.material) { for (const m of [].concat(o.material)) { m.envMapIntensity ??= 1; } } } });
  const wrap = new THREE.Group(); wrap.name = `model:${name}`; wrap.add(obj);
  const box = new THREE.Box3().setFromObject(obj); const dim = box.getSize(new THREE.Vector3());
  if (size) { const ref = axis === 'max' ? Math.max(dim.x, dim.y, dim.z) : dim[axis]; obj.scale.multiplyScalar(size / ref); }
  box.setFromObject(obj); const c = box.getCenter(new THREE.Vector3());
  if (center) { obj.position.x -= c.x; obj.position.z -= c.z; }
  if (ground) obj.position.y -= box.min.y; else if (center) obj.position.y -= c.y;
  wrap.userData.size = box.getSize(new THREE.Vector3()); wrap.userData.gltf = gltf; wrap.userData.origOf = origOf;
  return wrap;
}

/** Find a material/mesh inside a loaded model by (partial) name — for swapping logos or tinting. */
export function findIn(root, re) { const hits = []; root.traverse((o) => { if ((o.isMesh && re.test(o.name)) || (o.material && [].concat(o.material).some((m) => re.test(m.name)))) hits.push(o); }); return hits; }

/** Photo texture from assets/ (cached per path+settings). */
export async function photo(path, { srgb = true, repeat = [1, 1], anisotropy = 8 } = {}) {
  const key = `${path}|${srgb}|${repeat}`; if (texCache.has(key)) return texCache.get(key);
  const t = await new THREE.TextureLoader().loadAsync(BASE + path); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = anisotropy; texCache.set(key, t); return t;
}

/** Names of KHR_materials_variants in a loaded model (e.g. CarConcept: Carmine / Pearl / Graphite). */
export function variants(root) { return (root.userData.gltf?.parser.json.extensions?.KHR_materials_variants?.variants ?? []).map((v) => v.name); }

/** Apply a KHR_materials_variants variant by name to this clone (materials are shared per variant). */
export async function selectVariant(root, name) {
  const parser = root.userData.gltf?.parser; const ext = parser?.json.extensions?.KHR_materials_variants; if (!ext) return false;
  const vi = ext.variants.findIndex((v) => v.name.toLowerCase().includes(name.toLowerCase())); if (vi < 0) return false;
  const jobs = [];
  root.traverse((o) => {
    if (!o.isMesh) return; const a = parser.associations.get(root.userData.origOf.get(o)); if (!a || a.meshes === undefined) return;
    const prim = parser.json.meshes[a.meshes].primitives[a.primitives ?? 0]; const maps = prim?.extensions?.KHR_materials_variants?.mappings; if (!maps) return;
    const hit = maps.find((m) => m.variants.includes(vi)); if (!hit) return;
    jobs.push(parser.getDependency('material', hit.material).then((m) => { o.material = m; }));
  });
  await Promise.all(jobs); return true;
}

/** Hide meshes whose mesh or material name matches (logos, display planes, ground plates). */
export function hide(root, re) { const hits = findIn(root, re); for (const o of hits) o.visible = false; return hits.length; }

/** Tint every material matching `re` (clones the material so other users are unaffected). */
export function tint(root, re, { color, roughness, metalness, sheenColor } = {}) {
  let n = 0; root.traverse((o) => { if (!o.isMesh) return; const mats = [].concat(o.material); const out = mats.map((m) => { if (!re.test(m.name || '')) return m; n++; const c = m.clone(); if (color !== undefined) { c.color = new THREE.Color(color); if (c.map) c.color.multiplyScalar(1); } if (roughness !== undefined) c.roughness = roughness; if (metalness !== undefined) c.metalness = metalness; if (sheenColor !== undefined && 'sheenColor' in c) c.sheenColor = new THREE.Color(sheenColor); return c; }); o.material = Array.isArray(o.material) ? out : out[0]; });
  return n;
}

/** Project an HDR panorama onto a ground disc so objects sit on the photographed ground (car-photography trick).
 *  height: camera height of the original photo (≈1.5–15), radius: size of the projected world. */
export async function groundedBackdrop(scene, name, { height = 4, radius = 60, intensity = 1, rotation = 0 } = {}) {
  const h = await hdri(name); const sky = new GroundedSkybox(h.equirect, height, radius); sky.position.y = height - 0.01; sky.rotation.y = rotation;
  sky.material.color?.setScalar?.(intensity); scene.add(sky); return sky;
}
