// Environment maps (built from emissive "light rigs" via PMREM) and the shared material library.
import * as THREE from 'three';
import * as T from './textures.js';

let pmrem = null;
const envCache = new Map();

export function initMaterials(renderer) { pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader(); }

function lightPanel(scene, w, h, intensity, color, pos, lookAt) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
  m.position.set(...pos); m.lookAt(new THREE.Vector3(...lookAt)); scene.add(m); return m;
}

export function skyDome(scene, top, horizon, bottom, sunDir = null, sunColor = 0xffffff, sunPower = 0, horizonSharp = 6) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, bot: { value: new THREE.Color(bottom) }, sunDir: { value: sunDir ? new THREE.Vector3(...sunDir).normalize() : new THREE.Vector3(0, -1, 0) }, sunCol: { value: new THREE.Color(sunColor).multiplyScalar(sunPower) }, sharp: { value: horizonSharp } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,hor,bot,sunCol,sunDir; uniform float sharp; varying vec3 vD;
      void main(){ float y=vD.y; vec3 c = y>0. ? mix(hor, top, pow(clamp(y,0.,1.), 0.55)) : mix(hor, bot, 1.-exp(-(-y)*sharp));
        float s = max(dot(normalize(vD), sunDir), 0.); c += sunCol*(pow(s, 900.)*40. + pow(s, 12.)*0.25 + pow(s,3.)*0.06);
        gl_FragColor = vec4(c,1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat); scene.add(m); return m;
}

/** Named environment rigs. Each returns a PMREM texture (cached). */
export function env(name) {
  if (envCache.has(name)) return envCache.get(name);
  const s = new THREE.Scene();
  switch (name) {
    case 'studio': { // dark product studio: big overhead softbox, vertical strips, faint horizon band
      s.background = new THREE.Color(0x000000);
      lightPanel(s, 12, 4, 4.5, 0xfff4e6, [0, 9, 0], [0, 0, 0]);
      for (const [x, z, c, k] of [[-7, 7, 0xffe2b8, 3], [7, 7, 0xffffff, 2.2], [-7, -7, 0xffffff, 2.2], [7, -7, 0xffd9a8, 3]]) lightPanel(s, 1.2, 7, k, c, [x, 3, z], [0, 3, 0]);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 1.2, 64, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a7a66).multiplyScalar(0.35), side: THREE.BackSide })); band.position.y = 1.2; s.add(band);
      const band2 = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 6, 64, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30302e).multiplyScalar(0.25), side: THREE.BackSide })); band2.position.y = 4.5; s.add(band2);
      lightPanel(s, 30, 30, 0.02, 0xffffff, [0, -1, 0], [0, 0, 0]);
      break;
    }
    case 'museum': // hangar: single cool-warm top light + far rows of practicals
      s.background = new THREE.Color(0x020202);
      lightPanel(s, 6, 6, 5, 0xfff1dc, [0, 12, 0], [0, 0, 0]);
      for (let i = -4; i <= 4; i++) lightPanel(s, 0.4, 3, 2.2, 0xffd9a0, [i * 4, 10, -14], [i * 4, 0, 0]);
      lightPanel(s, 10, 1, 0.8, 0xffc070, [16, 3, 0], [0, 1, 0]);
      break;
    case 'workshop': // grid of cool LED panels
      s.background = new THREE.Color(0x0a0b0d);
      for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) lightPanel(s, 2.4, 0.25, 4, 0xf3f6ff, [x * 3.2, 8, z * 3.2], [x * 3.2, 0, z * 3.2]);
      lightPanel(s, 40, 6, 0.25, 0x9aa0a8, [0, 3, -20], [0, 3, 0]);
      lightPanel(s, 40, 6, 0.2, 0x9aa0a8, [0, 3, 20], [0, 3, 0]);
      lightPanel(s, 6, 3, 1.2, 0xffc785, [20, 3, 0], [0, 2, 0]);
      break;
    case 'golden': // golden-hour exterior
      skyDome(s, 0x2a4f7a, 0xffb36b, 0x3a2a1c, [-0.8, 0.12, 0.3], 0xffc27a, 3.0, 4);
      break;
    case 'dusk':
      skyDome(s, 0x0a1430, 0xd8743e, 0x0b0a0c, [-0.9, 0.02, -0.2], 0xff8a3d, 1.0, 5);
      break;
    case 'lounge': // warm interior: fireplace glow + tall windows
      s.background = new THREE.Color(0x060403);
      lightPanel(s, 2.5, 1.4, 5, 0xff8a3a, [0, 0.8, -7], [0, 1, 0]);
      for (let i = -2; i <= 2; i++) lightPanel(s, 2.2, 6, 1.1, 0xbfd0ff, [i * 3, 3, 8], [i * 3, 3, 0]);
      for (let i = -3; i <= 3; i++) lightPanel(s, 0.5, 0.5, 6, 0xffcc88, [i * 2.5, 6, 0], [i * 2.5, 0, 0]);
      break;
    case 'gallery': // black gallery with spotlight pools
      s.background = new THREE.Color(0x000000);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; lightPanel(s, 1.2, 1.2, 5, 0xfff0d8, [Math.cos(a) * 8, 10, Math.sin(a) * 8], [Math.cos(a) * 8, 0, Math.sin(a) * 8]); }
      lightPanel(s, 20, 0.5, 2.5, 0xffe2b0, [0, 9, 0], [0, 0, 0]);
      break;
    default:
      s.background = new THREE.Color(0x111111);
  }
  const rt = pmrem.fromScene(s, 0.03, 0.1, 100);
  envCache.set(name, rt.texture);
  return rt.texture;
}

// ---------------------------------------------------------------------------------------------
// Materials
const lib = {};
const memo = (k, f) => (lib[k] ??= f());

export const M = {
  paint: (color = 0x050505, opts = {}) => {
    const m = new THREE.MeshPhysicalMaterial({
      color, metalness: opts.metalness ?? 0.55, roughness: opts.roughness ?? 0.32,
      clearcoat: 1, clearcoatRoughness: opts.clearcoatRoughness ?? 0.035,
      normalMap: T.flakeNormal(), normalScale: new THREE.Vector2(0.12, 0.12),
      clearcoatNormalMap: T.orangePeel(), clearcoatNormalScale: new THREE.Vector2(0.035, 0.035),
      envMapIntensity: opts.env ?? 1.0,
    });
    return m;
  },
  chrome: () => memo('chrome', () => new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.04 })),
  darkChrome: () => memo('darkChrome', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 1, roughness: 0.12 })),
  polished: () => memo('polished', () => new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.12 })),
  gold: () => memo('gold', () => new THREE.MeshStandardMaterial({ color: 0xd9ad62, metalness: 1, roughness: 0.18 })),
  goldPolished: () => memo('goldPolished', () => new THREE.MeshStandardMaterial({ color: 0xe6bd73, metalness: 1, roughness: 0.06 })),
  titanium: () => memo('titanium', () => new THREE.MeshPhysicalMaterial({ color: 0x9a9b9f, metalness: 1, roughness: 0.32, roughnessMap: T.brushed(), anisotropy: 0.8, anisotropyRotation: 0 })),
  alu: () => memo('alu', () => new THREE.MeshPhysicalMaterial({ color: 0xc9cacd, metalness: 1, roughness: 0.26, roughnessMap: T.brushed(), anisotropy: 0.6 })),
  castAlu: () => memo('castAlu', () => new THREE.MeshStandardMaterial({ color: 0x8d8e90, metalness: 0.9, roughness: 0.55, roughnessMap: T.smudge() })),
  iron: () => memo('iron', () => new THREE.MeshStandardMaterial({ color: 0x2c2c2e, metalness: 0.85, roughness: 0.48, roughnessMap: T.smudge() })),
  steel: () => memo('steel', () => new THREE.MeshStandardMaterial({ color: 0x8a8c90, metalness: 1, roughness: 0.22 })),
  blackSatin: () => memo('blackSatin', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.2, roughness: 0.45 })),
  blackGloss: () => memo('blackGloss', () => new THREE.MeshPhysicalMaterial({ color: 0x050505, metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })),
  rubber: () => memo('rubber', () => new THREE.MeshStandardMaterial({ color: 0x111112, metalness: 0, roughness: 0.82 })),
  tyre: () => memo('tyre', () => new THREE.MeshStandardMaterial({ color: 0x121213, metalness: 0, roughness: 0.78, normalMap: T.tread(), normalScale: new THREE.Vector2(1.4, 1.4) })),
  glass: () => memo('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x050607, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.72, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 1.4, depthWrite: false })),
  crystal: () => memo('crystal', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.0, transparent: true, opacity: 0.08, clearcoat: 1, ior: 1.5, envMapIntensity: 2.4, specularIntensity: 1, depthWrite: false, side: THREE.DoubleSide })),
  lens: (color = 0xfff6e8) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.35, clearcoat: 1, envMapIntensity: 2, depthWrite: false }),
  leather: (color = 0x3a1414) => { const L = T.leather(); return new THREE.MeshPhysicalMaterial({ color, map: L.map, normalMap: L.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.55, metalness: 0, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x553333) }); },
  carbon: () => memo('carbon', () => { const C = T.carbon(); return new THREE.MeshPhysicalMaterial({ map: C.map, normalMap: C.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }); }),
  ceramic: () => memo('ceramic', () => new THREE.MeshPhysicalMaterial({ color: 0xf1ede6, roughness: 0.18, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08 })),
  walnut: () => memo('walnut', () => new THREE.MeshPhysicalMaterial({ map: T.walnut(), roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 })),
  velvet: (color = 0x3a0c12) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xc06070) }),
  fabric: (color = 0x16171a) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }),
  skin: () => memo('skin', () => new THREE.MeshStandardMaterial({ color: 0x8a6a58, roughness: 0.62, metalness: 0 })),
  glove: () => memo('glove', () => new THREE.MeshPhysicalMaterial({ color: 0x9c968c, roughness: 0.9, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xd8d2c8) })), // white cotton conservator's glove
  mannequin: (color = 0x1a1a1c) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0.15, sheen: 0.5, sheenColor: new THREE.Color(0x6a5a48) }),
  floorMirror: (color = 0x050505, rough = 0.28, opacity = 0.84, envI = 0.25) => new THREE.MeshStandardMaterial({ color, metalness: 0.0, roughness: rough, transparent: true, opacity, envMapIntensity: envI }),
  floor: (color = 0x2a2a2a) => new THREE.MeshStandardMaterial({ color, map: T.concrete(), roughness: 0.38, roughnessMap: T.smudge(), metalness: 0.0 }),
  matte: (color = 0x111111, r = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: 0 }),
  emissive: (color = 0xffffff, intensity = 4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }),
  line: (color = 0xd9b16a, intensity = 3, opacity = 1) => new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
};

/** Volumetric light cone (additive, soft falloff); place apex at the lamp. */
export function lightCone(height = 6, radius = 2.2, color = 0xffe3b5, strength = 0.18) {
  const geo = new THREE.ConeGeometry(radius, height, 48, 12, true); geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, h: { value: height } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP=position; vec4 w=modelViewMatrix*vec4(position,1.); vV=normalize(-w.xyz); vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*w; }`,
    fragmentShader: `uniform vec3 color; uniform float strength,h; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float along = clamp(-vP.y/h,0.,1.); float rim = pow(abs(dot(vN,vV)), 1.6);
        float a = strength * rim * (1.-along*0.85) * smoothstep(0.,0.08,along); gl_FragColor = vec4(color*a, 1.); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 10; return m;
}

/** Soft additive sprite texture for particles. */
let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); _dot = new THREE.CanvasTexture(c); return _dot;
}

/** Glow billboard (sprite) for lamps, sparks, sun. */
export function glow(color = 0xffd9a0, size = 1, intensity = 2) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.setScalar(size); return s;
}
