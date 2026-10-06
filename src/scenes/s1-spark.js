// SCENE 1 (0–8s) — THE SPARK. Spark-plug arc → flame → bore dive past piston and con-rod →
// intake runner → burst into a monumental hangar; ends on a wide aerial of the car alone.
// Realism layer: every set is lit and reflected by a real photographed HDR panorama (studio for the
// macro / engine interiors, an industrial hall for the hangar); large surfaces carry photo textures
// (brick vault and end wall), machined parts carry finish-true micro-relief (turning, grinding, sand-cast
// grain, fly-cut pockets) and the practicals are real lens-flare sprites.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, lightCone, aim, at, curve, easeInOutCubic } from './common.js';
import { buildSparkPlug, Arc, flameBurst, buildBottomEnd, buildRunner } from '../models/engine.js';
import { buildCar, reflectionOf } from '../models/car.js';
import { HDRI, useHdri, photo } from '../engine/assets.js';
import { glow } from '../engine/materials.js';
import { invLerp, easeOutCubic, easeInCubic, hash1 } from '../engine/util.js';

// ------------------------------------------------------------------------------------------------
// helpers (scene-local)

/** Give a group its own material instances (the library memoises shared ones), then edit them. */
function ownMaterials(root, edit, perMesh = null) {
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const src = o.material; if (!done.has(src)) { const c = src.clone(); edit?.(c, src, o); done.set(src, c); }
    o.material = done.get(src); perMesh?.(o, src);
  });
}

/** Per-vertex colour ramp along an axis (heat tint, deposits): stops = [[value, [r,g,b]], ...] (linear). */
function vertexRamp(geo, axis, stops, extra = null) {
  const p = geo.getAttribute('position'); const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const v = axis === 'y' ? p.getY(i) : axis === 'x' ? p.getX(i) : p.getZ(i);
    let k = 0; while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, ca] = stops[k], [b, cb] = stops[k + 1]; const f = clamp((v - a) / (b - a));
    c.setRGB(lerp(ca[0], cb[0], f), lerp(ca[1], cb[1], f), lerp(ca[2], cb[2], f)); if (extra) extra(c, p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Per-material env intensity that keeps the panorama's yaw (an explicit envMap ignores scene.environmentRotation). */
function envAt(mat, scene, k) { envOn(mat, scene, k); mat.envMapRotation.copy(scene.environmentRotation); return mat; }

/** The same photographed panorama with its hottest practical flagged down (luminance clamped to `max`), as a PMREM
 *  environment: polished parts then show the studio as graded sheens instead of clipped, blooming hot spots. */
const softEnvs = new Map();
function softEnv(renderer, h, max = 20, tint = [1, 1, 1]) {
  const key = `${h.equirect.uuid}|${max}|${tint}`; if (softEnvs.has(key)) return softEnvs.get(key);
  const { data, width, height } = h.equirect.image; const out = new Uint16Array(data.length); const { fromHalfFloat: f, toHalfFloat: th } = THREE.DataUtils;
  for (let i = 0; i < data.length; i += 4) {
    const r = f(data[i]), g = f(data[i + 1]), b = f(data[i + 2]); const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; const k = l > max ? max / l : 1;
    out[i] = th(r * k * tint[0]); out[i + 1] = th(g * k * tint[1]); out[i + 2] = th(b * k * tint[2]); out[i + 3] = data[i + 3];
  }
  const tex = new THREE.DataTexture(out, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  Object.assign(tex, { colorSpace: THREE.LinearSRGBColorSpace, mapping: THREE.EquirectangularReflectionMapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, flipY: true, needsUpdate: true });
  const gen = new THREE.PMREMGenerator(renderer); const pm = gen.fromEquirectangular(tex).texture; gen.dispose(); tex.dispose();
  softEnvs.set(key, pm); return pm;
}

/** Deterministic micro-relief (rng-seeded DataTextures, linear): { normal, rough } for one surface finish.
 *  'lines': parallel machining / grind / turning marks varying along U (rows: true → along V) · 'sand': isotropic
 *  sand-cast grain · 'rings': concentric fly-cut rings around the UV centre (cylinder caps).
 *  rough holds a gloss multiplier in [lo, 1] (mean ≈ (lo + 1) / 2), so set material.roughness = target / mean. */
function microRelief(kind, seed, { size = 256, rows = false, slope = 3, lo = 0.7 } = {}) {
  const r = rng(seed), N = size, h = new Float32Array(N * N);
  if (kind === 'lines' || kind === 'rings') {
    const L = new Float32Array(N); for (let i = 0; i < N; i++) L[i] = r() - 0.5;
    for (let k = 0; k < N / 20; k++) L[Math.floor(r() * N)] += (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.8); // the odd deeper mark
    const S = L.map((_, i) => (L[(i + N - 1) % N] + 2 * L[i] + L[(i + 1) % N]) / 4); const ph = r() * 6.283;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (kind === 'rings') { const d = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5); const i = Math.floor(d), f = d - i; h[y * N + x] = lerp(S[i % N], S[(i + 1) % N], f); continue; }
      const a = rows ? y : x, b = rows ? x : y; h[y * N + x] = S[a] * (0.82 + 0.18 * Math.sin((b / N) * 6.283 * 2 + a * 0.37 + ph));
    }
  } else { // periodic value noise, three octaves (fine grain dominates)
    const oct = (cells) => { const G = Float32Array.from({ length: cells * cells }, () => r()); const at = (i, j) => G[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
      return (x, y) => { const fx = (x / N) * cells, fy = (y / N) * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy); }; };
    const a = oct(N / 2), b = oct(N / 8), c = oct(N / 32);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = a(x, y) * 0.6 + b(x, y) * 0.28 + c(x, y) * 0.12 - 0.5;
  }
  let mn = Infinity, mx = -Infinity; for (const v of h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const nrm = new Uint8Array(N * N * 4), gl = new Uint8Array(N * N * 4); const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * slope, dy = (H(x, y + 1) - H(x, y - 1)) * slope, l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    nrm[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); nrm[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); nrm[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); nrm[o + 3] = 255;
    const g = Math.round(lerp(lo, 1, (h[y * N + x] - mn) / (mx - mn)) * 255); gl[o] = gl[o + 1] = gl[o + 2] = g; gl[o + 3] = 255;
  }
  const tex = (d) => { const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
  return { normal: tex(nrm), rough: tex(gl), mean: (lo + 1) / 2 };
}
/** The same texture at another tiling (shares the image). */
function rep(t, x, y = x) { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; }

/** Mirror-image material for the glossy floor: no direct key light (the mirrored car's underside faces the lamps,
 *  which a real reflection never shows), and one fade with depth below the floor, so paint, chrome and glass dim together. */
function mirrorShade(mat, { direct = 0.06, fade = 1.3 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vMirY;').replace('#include <project_vertex>', '#include <project_vertex>\nvMirY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMirY;')
      .replace('#include <aomap_fragment>', `reflectedLight.directDiffuse *= ${direct.toFixed(3)}; reflectedLight.directSpecular *= ${direct.toFixed(3)};
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect *= ${direct.toFixed(3)};
        #endif
        #ifdef USE_SHEEN
          sheenSpecularDirect *= ${direct.toFixed(3)};
        #endif
        #include <aomap_fragment>`)
      .replace('#include <opaque_fragment>', `outgoingLight *= exp(min(vMirY, 0.) * ${fade.toFixed(3)});\n#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `mirrorShade${direct}|${fade}`; mat.needsUpdate = true; return mat;
}

/** Clear-coated paint under a hard overhead key: scale the key's direct clearcoat (and base) specular so the roof
 *  carries a graded sheen instead of a clipped hairline, while the photographed reflections stay crisp. */
function softKey(mat, cc, base) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `reflectedLight.directSpecular *= ${base.toFixed(3)};
      #ifdef USE_CLEARCOAT
        clearcoatSpecularDirect *= ${cc.toFixed(3)};
      #endif
      #include <aomap_fragment>`);
  };
  mat.customProgramCacheKey = () => `softKey${cc}|${base}`; mat.needsUpdate = true; return mat;
}

/** Ground contact for the car on the concrete: a soft footprint plus tight, dark tyre-contact occlusion patches
 *  (white-on-black canvas used as alpha), drawn over the transparent floor. */
function groundContact(car, { body = 0.55, tyre = 0.95 } = {}) {
  const { L, track, tireW } = car.spec; const W = track * 2 + 0.9, Lp = L * 1.15; const cw = 1024, ch = Math.round((cw * W) / Lp);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
  const px = (x) => (0.5 + x / Lp) * cw, pz = (z) => (0.5 + z / W) * ch, sx = cw / Lp, sz = ch / W;
  g.filter = `blur(${Math.round(0.22 * sx)}px)`; g.fillStyle = `rgba(255,255,255,${body})`; g.beginPath(); g.ellipse(px(0.05), pz(0), (L * 0.47) * sx, (track + 0.06) * sz, 0, 0, Math.PI * 2); g.fill();
  for (const w of car.shape.wheels) for (const s of [-1, 1]) {
    g.filter = `blur(${Math.round(0.07 * sx)}px)`; g.fillStyle = `rgba(255,255,255,${tyre * 0.7})`; g.beginPath(); g.ellipse(px(w.x), pz(s * track), 0.36 * sx, (tireW * 0.85) * sz, 0, 0, Math.PI * 2); g.fill();
    g.filter = `blur(${Math.round(0.02 * sx)}px)`; g.fillStyle = `rgba(255,255,255,${tyre})`; g.beginPath(); g.ellipse(px(w.x), pz(s * track), 0.15 * sx, (tireW * 0.5) * sz, 0, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(Lp, W), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; m.renderOrder = 3; return m;
}

/** Real photographed lens flare sprite (star + halo) for practical lights. */
function flareSprite(map, color, size, intensity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
  s.scale.setScalar(size); return s;
}

/** Real concrete: project the photographed floor of an HDR panorama (stains, tyre marks, patching) onto a
 *  floor material as albedo + gloss variation, on top of its own fine texture. */
function photoFloor(mat, equirect, { height = 1.7, gain = 2, rotation = 0, mix: amt = 1, fade = 1e4 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { pfMap: { value: equirect }, pfH: { value: height }, pfGain: { value: gain }, pfRot: { value: rotation }, pfAmt: { value: amt }, pfFade: { value: fade } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPF;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPF = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D pfMap; uniform float pfH, pfGain, pfRot, pfAmt, pfFade; varying vec3 vPF; float pfStain = 1.;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float c = cos(pfRot), s = sin(pfRot); vec2 xz = mat2(c, -s, s, c) * vPF.xz; vec3 ph = texture2D(pfMap, equirectUv(normalize(vec3(xz.x, -pfH, xz.y)))).rgb;
          float l = dot(ph, vec3(0.3, 0.59, 0.11)); pfStain = mix(clamp(l * pfGain, 0.25, 2.2), 1., smoothstep(pfFade * 0.6, pfFade, length(vPF.xz)));
          vec3 tint = mix(vec3(1.), ph / max(l, 1e-4), 0.25 * (1. - smoothstep(pfFade * 0.6, pfFade, length(vPF.xz)))); diffuseColor.rgb *= mix(vec3(1.), tint * pfStain, pfAmt); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(1., mix(0.55, 1.5, smoothstep(0.4, 1.6, pfStain)), pfAmt), 0.04, 1.);');
  };
  mat.customProgramCacheKey = () => 'photoFloor'; mat.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------
// hangar

export async function hangarSet(ctx, hero) {
  const set = makeSet(null, { fog: new THREE.FogExp2(0x0a0908, 0.018) }); const s = set.scene;
  // real photographed industrial hall (arched roof, rows of ceiling tubes) lights the car and reflects in its paint, chrome and glass
  const wh = await useHdri(s, HDRI.warehouse, { env: 0.42, rotation: Math.PI / 2 - 0.2 });
  // its fluorescent tubes flagged down and the hall warmed toward the brick vault, so the roof never carries a reflected neon tube
  s.environment = softEnv(ctx.renderer, wh, 4, [1, 0.84, 0.72]);
  const [brick, brickBump, brickRough, wallBrick, wallBump, wallRough, flare] = await Promise.all([
    photo('textures/brick_diffuse.jpg', { repeat: [1, 1] }), photo('textures/brick_bump.jpg', { srgb: false, repeat: [1, 1] }), photo('textures/brick_roughness.jpg', { srgb: false, repeat: [1, 1] }),
    photo('textures/brick_diffuse.jpg', { repeat: [18, 9] }), photo('textures/brick_bump.jpg', { srgb: false, repeat: [18, 9] }), photo('textures/brick_roughness.jpg', { srgb: false, repeat: [18, 9] }),
    photo('textures/lensflare/lensflare0.png'),
  ]);
  // hand-polished lacquer: a touch more clearcoat diffusion, so the key lays a graded sheen along the roof, not a neon line
  hero.paint.clearcoatRoughness = 0.12; hero.paint.roughness = 0.38; softKey(hero.paint, 0.22, 0.6);
  const glass = softKey(M.glass().clone(), 0.4, 0.4); hero.group.traverse((o) => { if (o.isMesh && o.material === M.glass()) o.material = glass; }); // the key glints in the glass, without a blooming star
  // mirrored car seen through the glossy floor: every material (paint, chrome, glass, rubber, lamps) gets the same
  // treatment (dim env, no direct key, one fade with depth), so the reflection stays one coherent, darker image
  const refl = reflectionOf(hero.group); const rm = new Map();
  refl.traverse((o) => { o.renderOrder = -1; if (o.isMesh && o.material && !Array.isArray(o.material) && !o.material.isShaderMaterial) {
    if (!rm.has(o.material)) { const c = o.material.clone(); if (!c.isMeshBasicMaterial) envAt(c, s, c.metalness > 0.5 ? 0.035 : 0.12); rm.set(o.material, mirrorShade(c, { fade: 3 })); } o.material = rm.get(o.material); } });
  s.add(hero.group); s.add(refl); s.add(groundContact(hero));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), M.floor(0xa8a8ac)); floor.material.transparent = true; floor.material.opacity = 0.9; floor.rotation.x = -Math.PI / 2; floor.renderOrder = 0; s.add(floor); envAt(floor.material, s, 0); // the floor reflects only this vault (mirrored car + practicals), never the photographed hall
  photoFloor(floor.material, wh.equirect, { height: 6, gain: 2.2, rotation: 0.4, fade: 13 });
  // barrel-vault ribs
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.6, roughness: 0.45 }); const R = 19;
  const ribs = [];
  for (let i = -6; i <= 6; i++) {
    const pts = []; for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI; pts.push(new THREE.Vector3(i * 6, Math.sin(a) * R * 0.85, Math.cos(a) * R)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.22, 6); ribs.push(tg);
  }
  for (const g of ribs) s.add(new THREE.Mesh(g, ribMat));
  // brick barrel vault: real brick photo (albedo + relief) lit by the rib-base uplight scallops and the cool skylight
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 78, 96, 1, true, 0, Math.PI));
  shell.rotation.z = Math.PI / 2; shell.scale.set(0.85, 1, 1); s.add(shell);
  shell.material = new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false,
    uniforms: { map: { value: brick }, bump: { value: brickBump }, rough: { value: brickRough }, rep: { value: new THREE.Vector2(34, 26) } },
    vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform sampler2D map, bump, rough; uniform vec2 rep; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec2 uv = vec2(vUv.y * rep.x, vUv.x * rep.y);           // brick courses run along the vault
        vec3 alb = texture2D(map, uv).rgb;                         // sRGB texture: already decoded to linear by the sampler
        float b = texture2D(bump, uv).r; float bUp = texture2D(bump, uv + vec2(0., 0.004)).r;
        float lum = dot(alb, vec3(0.3, 0.55, 0.15)); alb = mix(vec3(lum), alb, 0.42) * vec3(1.0, 0.8, 0.86); // aged, burgundy-brown brick
        float h = clamp(vW.y / 16.2, 0., 1.);
        float dx = mod(vW.x + 3., 6.) - 3.; float w = 0.7 + h * 9.;
        float pool = exp(-dx * dx / (2. * w * w)) * exp(-h * 3.2) * (1. + 2.5 * exp(-h * 18.));      // scalloped uplight wash
        float graze = clamp(0.55 + (b - bUp) * 5.0, 0.2, 1.6);                                    // uplight grazing the brick relief
        vec3 warm = vec3(1.0, 0.6, 0.48) * (pool * 0.55 * graze + exp(-h * 4.5) * 0.09);
        vec3 cool = vec3(0.45, 0.52, 0.65) * pow(h, 6.) * 0.3;
        float ao = mix(0.35, 1.0, smoothstep(0.25, 0.6, b));
        float endFade = smoothstep(39., 20., abs(vW.x));
        float spec = (1. - texture2D(rough, uv).r) * pool * 0.04;
        vec3 c = (alb * (warm + cool) * 0.62 * ao + spec * vec3(1., 0.8, 0.6)) * (0.25 + 0.75 * endFade);
        gl_FragColor = vec4(c, 1.); }` });
  // skylight along the apex
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(78, 1.6), M.emissive(0xbcc8dc, 2.6)); sky.position.set(0, R * 0.85 - 0.05, 0); sky.rotation.x = Math.PI / 2; s.add(sky);
  // brick end wall with a slit of light between the hangar doors
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x5a4a44, map: wallBrick, bumpMap: wallBump, bumpScale: 2.5, roughnessMap: wallRough, roughness: 1, metalness: 0 }));
  wall.position.set(-38, 8, 0); wall.rotation.y = Math.PI / 2; s.add(wall);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 16), M.emissive(0xffd6a0, 3.5)); slit.position.set(-37.9, 8, 0); slit.rotation.y = Math.PI / 2; s.add(slit);
  const shaft = lightCone(40, 6, 0xffcc8a, 0.05); shaft.position.set(-37.5, 8, 0); shaft.rotation.z = -Math.PI / 2 + 0.06; s.add(shaft);
  // pendant practicals: spun-brass shade + bulb seen through a real lens flare
  const r = rng(12); const pendRefl = [];
  const shadeGeo = new THREE.CylinderGeometry(0.05, 0.32, 0.26, 32, 1, true); const shadeMat = new THREE.MeshStandardMaterial({ color: 0xb08a55, metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
  const bulbMat = M.emissive(0xffd29a, 6); const bulbGeo = new THREE.SphereGeometry(0.06, 12, 8); const cordMat = M.matte(0x050505);
  for (let i = 0; i < 26; i++) {
    const x = r.range(-34, 34), z = r.range(-12, 12); if (Math.abs(x) < 6 && Math.abs(z) < 5) continue; const y = r.range(7, 9);
    const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.set(x, y + 0.1, z); s.add(shade);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(x, y, z); s.add(bulb);
    const gl = flareSprite(flare, 0xffd5a0, 2.4, 1.5); gl.position.set(x, y - 0.04, z); s.add(gl);
    const rf = glow(0xffd5a0, 1, 0.85); rf.scale.set(0.75, 1.9, 1); rf.material.fog = false; rf.position.set(x, -y, z); rf.renderOrder = -1; s.add(rf); pendRefl.push(rf); // its soft reflection in the polished floor
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, R * 0.85 - y, 4), cordMat); cord.position.set(x, (R * 0.85 + y) / 2, z); s.add(cord);
  }
  // museum key light + volumetric cone + dust
  spot(s, { intensity: 400, pos: [0.3, 11, 0.8], target: [0, 0.4, 0], angle: 0.35, penumbra: 0.9, color: 0xfff0dc }); // wide enough to pool on the photographed concrete
  spot(s, { intensity: 90, pos: [-6, 3, -7], target: [0, 0.6, 0], angle: 0.4, penumbra: 1, color: 0xffb46a });
  spot(s, { intensity: 60, pos: [6, 2.5, 8], target: [0, 0.6, 0], angle: 0.4, penumbra: 1, color: 0xb9c8ff });
  const cone = lightCone(11, 3.2, 0xffe6c0, 0.07); cone.position.set(0.3, 11, 0.8); s.add(cone);
  const d = dust(s, { count: 260, box: [0.2, 4.5, 0.5, 3.2, 9, 3.2], size: 0.9, intensity: 0.7, res: ctx.res });
  // rib-base uplights (their wash is painted into the brick shader); the fittings read as flares
  for (let i = -6; i <= 6; i++) for (const zs of [1, -1]) { const gl = flareSprite(flare, 0xffc070, 1.5, 1.2); gl.position.set(i * 6, 0.3, zs * (R - 0.6)); s.add(gl); const rf = glow(0xffc070, 1.1, 1.8); rf.scale.set(0.8, 2.2, 1); rf.material.fog = false; rf.position.set(i * 6, -0.3, zs * (R - 0.6)); rf.renderOrder = -1; s.add(rf); }
  // floor inlays: a ring of light around the car and long runways that give the aerial its scale
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.63, 160), M.emissive(0xffd9a0, 2.2)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; s.add(ring);
  for (const z of [-7, 7]) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(76, 0.04), M.emissive(0xffd9a0, 1.3)); ln.rotation.x = -Math.PI / 2; ln.position.set(0, 0.004, z); s.add(ln); }
  const wash = new THREE.HemisphereLight(0x3a3630, 0x050505, 0.6); s.add(wash);
  set.onUpdate((t) => { d.set(t); hero.lights(0.0, 0.0); });
  // the pendants' floor reflections only make sense while their lamps are in frame: gone by the time the crane rises to the aerial
  const pendCol = new THREE.Color(0xffd5a0).multiplyScalar(0.85);
  set.camFx = (cam) => { const k = 1 - smooth(invLerp(1.6, 5.0, cam.position.y)); for (const rf of pendRefl) { rf.material.color.copy(pendCol).multiplyScalar(k); rf.visible = k > 0.002; } };
  return set;
}

export async function buildS1(ctx) {
  const shots = [];
  // surface finishes (deterministic micro-relief): turning marks, linear grind / polish, sand-cast grain, fly-cut rings
  const turn = microRelief('lines', 11, { rows: true, lo: 0.72 }), grind = microRelief('lines', 23, { lo: 0.75 }), sand = microRelief('sand', 37, { slope: 4 });
  const flyCut = microRelief('rings', 41, { lo: 0.78 }), flow = microRelief('lines', 53, { size: 512, lo: 0.8, slope: 2 });
  // ---------------------------------------------------------------- 1.1 spark macro
  const sp = makeSet(null); const plug = buildSparkPlug(); sp.scene.add(plug);
  // real photo studio (octagonal softbox, cyc, floor) in every chrome/nickel/ceramic reflection, its spot flagged down so
  // the tip and shell never clip; behind the macro a dark spun-bronze dome carries that same studio as warm, defocused
  // reflections (black + champagne, never the grey cyc as a backdrop)
  const studio = await useHdri(sp.scene, HDRI.studio, { env: 0.55, rotation: -0.6 }); sp.scene.environment = softEnv(ctx.renderer, studio, 20);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 64, 32), new THREE.MeshStandardMaterial({ color: 0x8a6438, metalness: 1, roughness: 0.75, side: THREE.BackSide }));
  dome.position.set(0, 1.2, 0); envAt(dome.material, sp.scene, 0.05); mirrorShade(dome.material, { direct: 0, fade: 0 }); sp.scene.add(dome); // env only: the key and kickers never paint hot spots on it
  ownMaterials(plug, (m, src, o) => {
    if (src === M.polished()) { m.roughnessMap = rep(turn.rough, 1, 6); m.roughness = 0.24 / turn.mean; }   // lathe-turned threads, shell and tip
    else if (src === M.steel()) { m.roughnessMap = rep(turn.rough, 1, 4); m.roughness = 0.4 / turn.mean; }
    else if (src === M.ceramic()) { m.vertexColors = true; m.normalMap = rep(sand.normal, 3, 6); m.normalScale = new THREE.Vector2(0.01, 0.01); } // glaze orange-peel
    else if (o.geometry.type === 'ExtrudeGeometry') { // ground strap: bent nickel alloy, heat-tinted straw → bronze towards the tip over the gap
      m.color.setRGB(1, 1, 1); m.vertexColors = true; m.roughnessMap = rep(grind.rough, 6, 2); m.roughness = 0.25 / grind.mean; m.normalMap = rep(grind.normal, 6, 2); m.normalScale = new THREE.Vector2(0.004, 0.004);
      vertexRamp(o.geometry, 'y', [[-0.1, [0.5, 0.48, 0.45]], [0.5, [0.48, 0.44, 0.38]], [0.95, [0.46, 0.38, 0.25]], [1.15, [0.38, 0.28, 0.17]], [1.35, [0.3, 0.22, 0.15]]],
        (c, x) => { const k = clamp((0.62 - x) / 0.7); c.lerp(new THREE.Color(0.2, 0.17, 0.15), k * 0.3); });
      envAt(m, sp.scene, 0.55); m.envMapRotation.set(0, -0.6 + 4.4, 0); // the faces carry the studio cyc as a long graded sheen, the octabox only as an edge glint
    }
  }, (o, src) => { if (src === M.ceramic()) vertexRamp(o.geometry, 'y', [[-5, [0.8, 0.8, 0.8]], [-0.6, [0.74, 0.73, 0.71]], [0.05, [0.66, 0.6, 0.52]], [0.4, [0.48, 0.4, 0.32]]]); }); // fired insulator nose
  const gap = plug.userData.gap; const arc = new Arc(v3(0, 1.02, 0), v3(0.02, 1.11, 0.01)); sp.scene.add(arc.group);
  const arcLight = point(sp.scene, { color: 0xb8c8ff, intensity: 0, pos: [0, 1.06, 0.15], decay: 2 });
  const burst = flameBurst(900, ctx.res); burst.material.uniforms.gain.value = 1.5; burst.position.copy(gap); sp.scene.add(burst);
  const softbox = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), M.emissive(0xfff0dc, 1.2)); softbox.position.set(-1, 3.2, 4); softbox.lookAt(0, 1, 0); sp.scene.add(softbox);
  const flameLight = point(sp.scene, { color: 0xff8a3a, intensity: 0, pos: [0, 1.4, 0], decay: 2 });
  spot(sp.scene, { color: 0x9fb6ff, intensity: 140, pos: [-2.5, 3.5, -3.5], target: [0, 0.8, 0], angle: 0.35, penumbra: 0.7 });
  spot(sp.scene, { color: 0xffc58a, intensity: 70, pos: [3.5, 0.2, 2.5], target: [0, 0.6, 0], angle: 0.45, penumbra: 0.9 });
  spot(sp.scene, { color: 0xffe2c0, intensity: 40, pos: [-3, -1.5, 2.5], target: [0, 0.2, 0], angle: 0.5, penumbra: 1 });
  sp.onUpdate((t) => {
    const pre = t > 0.52 && t < 0.62 ? (hash1(Math.floor(t * 60)) > 0.5 ? 0.5 : 0) : 0;
    const main = smooth(invLerp(0.68, 0.74, t)) * (1 - smooth(invLerp(1.25, 1.55, t)));
    const a = Math.max(pre, main * (0.75 + 0.25 * hash1(Math.floor(t * 40) + 3))); arc.update(t, a);
    arcLight.intensity = a * 3.5;
    const k = clamp((t - 1.0) / 1.6); // the burst particles carry the flame front
    burst.visible = t > 0.95; burst.material.uniforms.tau.value = Math.max(0, t - 0.95) * 0.9; burst.material.uniforms.scale.value = 1.6;
    flameLight.intensity = smooth(k * 2) * 4 * (1 + k * 2);
  });
  // the blue anamorphic streak belongs to the arc; once the flame takes over it fades to a faint champagne line, so the
  // white-hot tip never smears a grey-blue band across the black
  const s11 = shot('s1.1', 0, 2.55, sp, keyCam([v3(-1.2, 1.5, 4.2), v3(-0.7, 1.25, 2.8), v3(-0.3, 1.1, 1.7)], [v3(0.15, 0.55, 0), v3(0.12, 0.85, 0), v3(0.1, 1.04, 0)], { fov: 24, aperture: (u) => 6 + u * 10, near: 0.05, far: 60, driftAmp: 0.006 }),
    { trans: { type: 'cut', dur: 0 }, grade: { exposure: 1.1, bloom: 0.55, streak: 0.3, streakTint: [0.6, 0.75, 1.1], threshold: 1.2 },
      prep: (lt, u, t) => { const k = smooth(invLerp(1.45, 1.9, t)); s11.grade.streak = lerp(0.3, 0.08, k); s11.grade.streakTint = [lerp(0.6, 1.0, k), lerp(0.75, 0.8, k), lerp(1.1, 0.55, k)]; } });
  shots.push(s11);

  // ---------------------------------------------------------------- 1.2 bore dive
  const be = makeSet(null); const bottom = buildBottomEnd(); be.scene.add(bottom);
  be.scene.environment = softEnv(ctx.renderer, await useHdri(be.scene, HDRI.studio, { env: 0.3, rotation: 1.1 + Math.PI }), 20); // the studio with its spot flagged: sheens, not hot spots
  // valve reliefs on the crown: flat fly-cut pockets in machined steel, reading mid-grey against the cast crown
  const relief = new THREE.MeshStandardMaterial({ color: 0x9a9894, metalness: 0.9, roughnessMap: flyCut.rough, roughness: 0.42 / flyCut.mean, normalMap: flyCut.normal, normalScale: new THREE.Vector2(0.05, 0.05) });
  const upLit = (m, k) => { envAt(m, be.scene, k); m.envMapRotation.set(Math.PI, 1.1 + Math.PI, 0); return m; }; // faces looking up the bore see the studio's lit floor (soft, even)
  upLit(relief, 0.36);
  for (const o of bottom.userData.piston.children) if (o.material === M.iron()) o.material = relief;
  ownMaterials(bottom, (m, src) => {
    if (src === M.castAlu()) { m.normalMap = rep(sand.normal, 4, 2); m.normalScale = new THREE.Vector2(0.025, 0.025); upLit(m, 0.32); }                   // sand-cast piston, crown readable
    else if (src === M.iron()) { m.color.setHex(0x4a4a4e); m.normalMap = rep(sand.normal, 40); m.normalScale = new THREE.Vector2(0.012, 0.012); envAt(m, be.scene, 0.35); m.envMapRotation.y = 4.6; } // cast-iron crank webs: the umbrella as a broad, soft sheen
    else if (src === M.chrome()) { m.roughnessMap = rep(grind.rough, 9); m.roughness = 0.12 / grind.mean; envAt(m, be.scene, 0.22); m.envMapRotation.y = 4.6; } // con-rod: ground along its length, then polished; the umbrella's edge lies across its face as a graded sheen
    else if (src === M.polished()) { m.roughnessMap = rep(turn.rough, 1, 3); m.roughness = 0.12 / turn.mean; envAt(m, be.scene, 0.2); }                  // turned pins
  });
  envAt(bottom.userData.sleeve.material, be.scene, 0.2); // honed bore: real studio in the cross-hatch, kept low so the bore stays gold and dark
  const chamberGlow = point(be.scene, { color: 0xff8a3a, intensity: 0, pos: [0, 0.08, 0], decay: 2 });
  be.scene.fog = new THREE.FogExp2(0x000000, 2.0);
  spot(be.scene, { color: 0xffc070, intensity: 0.3, pos: [0.4, -0.12, 0.35], target: [0, -0.18, 0], angle: 0.45, penumbra: 0.8 });
  spot(be.scene, { color: 0xb8c8ff, intensity: 0.35, pos: [-0.4, -0.05, -0.3], target: [0, -0.2, 0], angle: 0.5, penumbra: 0.9 });
  const rim = point(be.scene, { color: 0xffd9a0, intensity: 0.12, pos: [0.12, -0.26, 0.16] });
  point(be.scene, { color: 0xffb060, intensity: 0.04, pos: [-0.1, -0.3, 0.12] });
  spot(be.scene, { color: 0xfff0dc, intensity: 0.25, pos: [0.3, -0.2, 0.25], target: [0, -0.2, 0], angle: 0.35, penumbra: 1 });
  const sparks = dust(be.scene, { count: 30, box: [0, -0.1, 0, 0.3, 0.4, 0.3], size: 0.012, intensity: 1.2, color: 0xffa860, speed: 0.02, res: ctx.res, seed: 8 });
  // cool kickers from behind the rod: graze the H-beam edges and the crank-web rims so the con-rod silhouette reads at once
  const kickRod = spot(be.scene, { color: 0xc4d4ff, intensity: 0, pos: [-0.2, -0.03, -0.13], target: [-0.025, -0.13, 0], angle: 0.42, penumbra: 0.7 });
  const kickWeb = spot(be.scene, { color: 0xb8c8ff, intensity: 0, pos: [-0.25, -0.15, 0.07], target: [0, -0.22, 0.04], angle: 0.5, penumbra: 0.8 }); // grazes the crank-web faces
  be.onUpdate((t) => { const kk = smooth(invLerp(3.7, 4.1, t)); kickRod.intensity = 0.16 * kk; kickWeb.intensity = 0.2 * kk; rim.intensity = 0.12 * (1 - kk); });
  be.onUpdate((t) => {
    const k = clamp((t - 2.3) / 2.4); const theta = easeOutCubic(k) * Math.PI * 1.55; bottom.userData.setAngle(theta);
    chamberGlow.intensity = 0.012 * (1 - smooth(k * 1.4)); chamberGlow.position.y = 0.05 - k * 0.06; sparks.set(t);
  });
  const boreCam = (() => {
    const pc = curve([v3(0, 0.09, 0.004), v3(0.0, 0.045, 0.006), v3(0.01, -0.0, 0.02), v3(0.09, -0.1, 0.1), v3(0.165, -0.165, 0.15)]);
    return (lt, u, cam, t) => {
      const k = easeInOutCubic(clamp(u)); const p = at(pc, k + (u > 1 ? (u - 1) * 0.4 : 0));
      const crown = bottom.userData.piston.position.y; const s2 = smooth((k - 0.45) / 0.4); const tgt = k < 0.45 ? v3(0, crown - 0.02, 0) : v3(lerp(0, -0.022, s2), lerp(crown - 0.02, -0.15, s2), 0); // ends framed on the con-rod's big end and the crank web
      if (k < 0.4) p.y = Math.max(p.y, crown + 0.035);
      const d = aim(cam, p, tgt, { fov: lerp(78, 46, smooth(k * 1.3)), near: 0.002, far: 10, roll: k * 0.6 }); return { focus: d, aperture: lerp(6, 14, k) };
    };
  })();
  shots.push(shot('s1.2', 2.55, 4.65, be, boreCam, { trans: { type: 'flash', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.75, streak: 0.35, threshold: 1.0, gain: [1.05, 0.98, 0.9] } }));

  // ---------------------------------------------------------------- 1.3 intake runner
  const ru = makeSet(null); const runner = buildRunner(); ru.scene.add(runner);
  await useHdri(ru.scene, HDRI.studio, { env: 0.2, rotation: 2.2 });
  // polished runner: fine longitudinal machining marks that run with the flow (gloss only, no relief to bead the reflection)
  ownMaterials(runner, (m) => { if (m.side === THREE.BackSide) { m.color.setHex(0x9a968e); m.roughnessMap = rep(flow.rough, 3, 1); m.roughness = 0.2 / flow.mean; } });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), M.emissive(0xffe6c4, 1.5)); mouth.position.set(1.0, 0, 0); mouth.rotation.y = -Math.PI / 2; ru.scene.add(mouth);
  const mouthLight = point(ru.scene, { color: 0xffe2b0, intensity: 0.02, pos: [0.55, 0, 0] });
  point(ru.scene, { color: 0xffb070, intensity: 0.0015, pos: [0.1, 0.02, 0] });
  for (let i = 1; i <= 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0305 + Math.pow(i / 6, 3) * 0.05, 0.0006, 6, 96), M.emissive(0xffd29a, 1.6)); ring.position.x = i * 0.1; ring.rotation.y = Math.PI / 2; ru.scene.add(ring); }
  // the polished runner reflects itself: capture its own interior (mouth glow, rings, walls) once into a cube map
  { const crt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType }); const cc = new THREE.CubeCamera(0.002, 10, crt); cc.position.set(0.3, 0, 0); ru.scene.add(cc);
    mouth.material.color.setRGB(1, 0.9, 0.77).multiplyScalar(1.5); cc.update(ctx.renderer, ru.scene); ru.scene.remove(cc);
    runner.traverse((o) => { if (o.isMesh && o.material.side === THREE.BackSide) { o.material.envMap = crt.texture; o.material.envMapIntensity = 0.009; o.material.needsUpdate = true; } }); }
  ru.onUpdate((t) => { const k = clamp((t - 4.6) / 1.2); mouthLight.intensity = 0.01 + k * 0.05; mouth.material.color.setRGB(1, 0.9, 0.77).multiplyScalar(1.0 + k * k * 5); });
  shots.push(shot('s1.3', 4.65, 5.75, ru, (lt, u, cam) => {
    const k = easeInCubic(clamp(u * 0.92 + 0.08)); const x = lerp(-0.05, 0.66, k); const d = aim(cam, v3(x, 0.004 * Math.sin(lt * 3), 0.003), v3(x + 1, 0, 0), { fov: 70, near: 0.002, far: 10, roll: lt * 0.9 });
    return { focus: 0.12, aperture: 0 };
  }, { trans: { type: 'zoom', dur: 0.45, center: [0.5, 0.5] }, grade: { exposure: 0.85, bloom: 0.3, streak: 0.12, threshold: 2.0 } }));

  // ---------------------------------------------------------------- 1.4 hangar reveal
  const hero = buildCar('classic', { fasteners: false });
  const hs = await hangarSet(ctx, hero);
  const hk = keyCam(
    [v3(2.9, 0.62, 1.55), v3(3.4, 0.9, 4.6), v3(0.6, 1.05, 7.4), v3(-1.4, 4.2, 10.5), v3(-2.2, 9, 12.5)],
    [v3(2.1, 0.55, 0.62), v3(1.2, 0.55, 0.3), v3(0.1, 0.55, 0), v3(0, 0.3, 0), v3(0, 0, 0)],
    { fov: (u) => lerp(32, 42, smooth(u)), aperture: (u) => lerp(9, 2, smooth(u * 1.5)), ease: (u) => easeInOutCubic(u) },
  );
  const hc = (lt, u, cam, t) => { const d = hk(lt, u, cam, t); hs.camFx(cam); return d; };
  shots.push(shot('s1.4', 5.75, 8.0, hs, hc, { trans: { type: 'flash', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.4, streak: 0.3, threshold: 1.6, lift: [0.004, 0.003, 0.002] } }));
  return { shots, hero };
}
