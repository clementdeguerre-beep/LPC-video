// SCENE 1 (0–8s) — THE SPARK. Spark-plug arc → flame → bore dive past piston and con-rod →
// intake runner → burst into a monumental hangar; ends on a wide aerial of the car alone.
// Realism layer: every set is lit and reflected by a real photographed HDR panorama (studio for the
// macro / engine interiors, an industrial hall for the hangar); large surfaces carry photo textures
// (brick vault and end wall, photo-derived machining / casting micro-detail) and the practicals are
// real lens-flare sprites.
import { THREE, envOn, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, lightCone, aim, at, curve, easeInOutCubic } from './common.js';
import { buildSparkPlug, Arc, flameKernel, flameBurst, buildBottomEnd, buildRunner } from '../models/engine.js';
import { buildCar, reflectionOf, contactShadow } from '../models/car.js';
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
  const wh = await useHdri(s, HDRI.warehouse, { env: 0.34, rotation: Math.PI / 2 - 0.2 });
  const [brick, brickBump, brickRough, wallBrick, wallBump, wallRough, flare] = await Promise.all([
    photo('textures/brick_diffuse.jpg', { repeat: [1, 1] }), photo('textures/brick_bump.jpg', { srgb: false, repeat: [1, 1] }), photo('textures/brick_roughness.jpg', { srgb: false, repeat: [1, 1] }),
    photo('textures/brick_diffuse.jpg', { repeat: [18, 9] }), photo('textures/brick_bump.jpg', { srgb: false, repeat: [18, 9] }), photo('textures/brick_roughness.jpg', { srgb: false, repeat: [18, 9] }),
    photo('textures/lensflare/lensflare0.png'),
  ]);
  // mirrored car seen through the glossy floor: its own (dimmer) material copies so the hall's bright tubes don't punch through
  const refl = reflectionOf(hero.group); const rm = new Map();
  refl.traverse((o) => { o.renderOrder = -1; if (o.isMesh && o.material && !Array.isArray(o.material) && !o.material.isShaderMaterial) { if (!rm.has(o.material)) rm.set(o.material, envAt(o.material.clone(), s, 0.12)); o.material = rm.get(o.material); } });
  s.add(hero.group); s.add(refl); s.add(contactShadow(hero, 0.95));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), M.floor(0xa8a8ac)); floor.material.transparent = true; floor.material.opacity = 0.9; floor.rotation.x = -Math.PI / 2; s.add(floor); envAt(floor.material, s, 0); // the floor reflects only this vault (mirrored car + practicals), never the photographed hall
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
        vec3 alb = texture2D(map, uv).rgb; alb = alb * alb;      // sRGB-ish → linear
        float b = texture2D(bump, uv).r; float bUp = texture2D(bump, uv + vec2(0., 0.004)).r;
        float lum = dot(alb, vec3(0.3, 0.55, 0.15)); alb = mix(vec3(lum), alb, 0.55) * vec3(1.0, 0.86, 0.78);
        float h = clamp(vW.y / 16.2, 0., 1.);
        float dx = mod(vW.x + 3., 6.) - 3.; float w = 0.7 + h * 9.;
        float pool = exp(-dx * dx / (2. * w * w)) * exp(-h * 3.2) * (1. + 2.5 * exp(-h * 18.));      // scalloped uplight wash
        float graze = clamp(0.55 + (b - bUp) * 5.0, 0.2, 1.6);                                    // uplight grazing the brick relief
        vec3 warm = vec3(1.0, 0.62, 0.32) * (pool * 0.55 * graze + exp(-h * 4.5) * 0.09);
        vec3 cool = vec3(0.45, 0.52, 0.65) * pow(h, 6.) * 0.3;
        float ao = mix(0.35, 1.0, smoothstep(0.25, 0.6, b));
        float endFade = smoothstep(39., 20., abs(vW.x));
        float spec = (1. - texture2D(rough, uv).r) * pool * 0.04;
        vec3 c = (alb * (warm + cool) * 2.2 * ao + spec * vec3(1., 0.8, 0.6)) * (0.25 + 0.75 * endFade);
        gl_FragColor = vec4(c, 1.); }` });
  // skylight along the apex
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(78, 1.6), M.emissive(0xbcc8dc, 2.6)); sky.position.set(0, R * 0.85 - 0.05, 0); sky.rotation.x = Math.PI / 2; s.add(sky);
  // brick end wall with a slit of light between the hangar doors
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x5a4a44, map: wallBrick, bumpMap: wallBump, bumpScale: 2.5, roughnessMap: wallRough, roughness: 1, metalness: 0 }));
  wall.position.set(-38, 8, 0); wall.rotation.y = Math.PI / 2; s.add(wall);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 16), M.emissive(0xffd6a0, 3.5)); slit.position.set(-37.9, 8, 0); slit.rotation.y = Math.PI / 2; s.add(slit);
  const shaft = lightCone(40, 6, 0xffcc8a, 0.05); shaft.position.set(-37.5, 8, 0); shaft.rotation.z = -Math.PI / 2 + 0.06; s.add(shaft);
  // pendant practicals: spun-brass shade + bulb seen through a real lens flare
  const r = rng(12);
  const shadeGeo = new THREE.CylinderGeometry(0.05, 0.32, 0.26, 32, 1, true); const shadeMat = new THREE.MeshStandardMaterial({ color: 0xb08a55, metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
  const bulbMat = M.emissive(0xffd29a, 6); const bulbGeo = new THREE.SphereGeometry(0.06, 12, 8); const cordMat = M.matte(0x050505);
  for (let i = 0; i < 26; i++) {
    const x = r.range(-34, 34), z = r.range(-12, 12); if (Math.abs(x) < 6 && Math.abs(z) < 5) continue; const y = r.range(7, 9);
    const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.set(x, y + 0.1, z); s.add(shade);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(x, y, z); s.add(bulb);
    const gl = flareSprite(flare, 0xffd5a0, 2.4, 1.5); gl.position.set(x, y - 0.04, z); s.add(gl);
    const rf = glow(0xffd5a0, 1.5, 1.4); rf.scale.set(1.1, 2.6, 1); rf.material.fog = false; rf.position.set(x, -y, z); rf.renderOrder = -1; s.add(rf); // its soft reflection in the polished floor
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, R * 0.85 - y, 4), cordMat); cord.position.set(x, (R * 0.85 + y) / 2, z); s.add(cord);
  }
  // museum key light + volumetric cone + dust
  spot(s, { intensity: 520, pos: [0.3, 11, 0.8], target: [0, 0.4, 0], angle: 0.35, penumbra: 0.9, color: 0xfff0dc }); // wide enough to pool on the photographed concrete
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
  return set;
}

export async function buildS1(ctx) {
  const shots = [];
  const [lathe, waterN, grain] = await Promise.all([
    photo('textures/hardwood2_roughness.jpg', { srgb: false, repeat: [1, 14] }), photo('textures/waternormals.jpg', { srgb: false, repeat: [3, 3] }),
    photo('textures/waternormals.jpg', { srgb: false, repeat: [16, 16] }),
  ]);
  // ---------------------------------------------------------------- 1.1 spark macro
  const sp = makeSet(null); const plug = buildSparkPlug(); sp.scene.add(plug);
  // real photo studio (octagonal softbox + spot) in every chrome/nickel/ceramic reflection; the studio itself is a
  // dim, heavily defocused backdrop so the macro keeps its black void but gains photographic depth
  await useHdri(sp.scene, HDRI.studio, { env: 0.55, background: true, blur: 0.6, bgIntensity: 0.018, rotation: -0.6 });
  ownMaterials(plug, (m, src, o) => {
    if (src === M.polished()) { m.roughness = 0.3; m.roughnessMap = lathe; }                         // lathe-turned threads and shell
    else if (src === M.steel()) { m.roughness = 0.6; m.roughnessMap = lathe; }
    else if (src === M.ceramic()) { m.vertexColors = true; m.normalMap = waterN; m.normalScale = new THREE.Vector2(0.015, 0.015); }
    else if (o.geometry.type === 'ExtrudeGeometry') { // ground strap: heat-tinted nickel alloy, darker and violet-bronze where the flame kernel sits
      m.color.setRGB(1, 1, 1); m.vertexColors = true; m.roughness = 0.34; m.normalMap = grain; m.normalScale = new THREE.Vector2(0.015, 0.015);
      vertexRamp(o.geometry, 'y', [[-0.1, [0.36, 0.3, 0.24]], [0.5, [0.34, 0.25, 0.16]], [0.95, [0.3, 0.19, 0.11]], [1.15, [0.22, 0.13, 0.08]], [1.35, [0.2, 0.12, 0.09]]],
        (c, x) => { const k = clamp((0.62 - x) / 0.7); c.lerp(new THREE.Color(0.13, 0.08, 0.09), k * 0.35); });
    }
  }, (o, src) => { if (src === M.ceramic()) vertexRamp(o.geometry, 'y', [[-5, [0.8, 0.8, 0.8]], [-0.6, [0.74, 0.73, 0.71]], [0.05, [0.66, 0.6, 0.52]], [0.4, [0.48, 0.4, 0.32]]]); }); // fired insulator nose
  const gap = plug.userData.gap; const arc = new Arc(v3(0, 1.02, 0), v3(0.02, 1.11, 0.01)); sp.scene.add(arc.group);
  const arcLight = point(sp.scene, { color: 0xb8c8ff, intensity: 0, pos: [0, 1.06, 0.15], decay: 2 });
  const flame = flameKernel(); flame.position.copy(gap); flame.scale.setScalar(0.01); sp.scene.add(flame); flame.visible = false;
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
    const k = clamp((t - 1.0) / 1.6); flame.visible = false; flame.scale.setScalar(0.05 + easeInCubic(k) * 6 + k * 0.5);
    flame.userData.set(t, smooth(k * 2) * (0.12 + k * 0.5), smooth(k * 1.3));
    burst.visible = t > 0.95; burst.material.uniforms.tau.value = Math.max(0, t - 0.95) * 0.9; burst.material.uniforms.scale.value = 1.6;
    flameLight.intensity = smooth(k * 2) * 4 * (1 + k * 2);
  });
  shots.push(shot('s1.1', 0, 2.55, sp, keyCam([v3(-1.2, 1.5, 4.2), v3(-0.7, 1.25, 2.8), v3(-0.3, 1.1, 1.7)], [v3(0.15, 0.55, 0), v3(0.12, 0.85, 0), v3(0.1, 1.04, 0)], { fov: 24, aperture: (u) => 6 + u * 10, near: 0.05, far: 60, driftAmp: 0.006 }),
    { trans: { type: 'cut', dur: 0 }, grade: { exposure: 1.1, bloom: 0.55, streak: 0.3, streakTint: [0.6, 0.75, 1.1], threshold: 1.2 } }));

  // ---------------------------------------------------------------- 1.2 bore dive
  const be = makeSet(null); const bottom = buildBottomEnd(); be.scene.add(bottom);
  await useHdri(be.scene, HDRI.studio, { env: 0.3, rotation: 1.1 + Math.PI });
  ownMaterials(bottom, (m, src) => {
    if (src === M.castAlu() || src === M.iron()) { m.normalMap = waterN; m.normalScale = new THREE.Vector2(0.12, 0.12); if (src === M.castAlu()) envAt(m, be.scene, 0.06); } // sand-cast skin (crown kept out of the softbox)
    else if (src === M.polished() || src === M.chrome()) { m.roughnessMap = lathe; m.roughness = Math.max(src.roughness, 0.05) / 0.33; envAt(m, be.scene, 0.1); }  // polished with real machining marks (same mean gloss); softbox kept to a glint
  });
  envAt(bottom.userData.sleeve.material, be.scene, 0.2); // honed bore: real studio in the cross-hatch, kept low so the bore stays gold and dark
  const chamberGlow = point(be.scene, { color: 0xff8a3a, intensity: 0, pos: [0, 0.08, 0], decay: 2 });
  be.scene.fog = new THREE.FogExp2(0x000000, 2.0);
  spot(be.scene, { color: 0xffc070, intensity: 0.3, pos: [0.4, -0.12, 0.35], target: [0, -0.18, 0], angle: 0.45, penumbra: 0.8 });
  spot(be.scene, { color: 0xb8c8ff, intensity: 0.35, pos: [-0.4, -0.05, -0.3], target: [0, -0.2, 0], angle: 0.5, penumbra: 0.9 });
  const rim = point(be.scene, { color: 0xffd9a0, intensity: 0.12, pos: [0.12, -0.16, 0.16] });
  point(be.scene, { color: 0xffb060, intensity: 0.04, pos: [-0.1, -0.3, 0.12] });
  spot(be.scene, { color: 0xfff0dc, intensity: 0.25, pos: [0.3, -0.2, 0.25], target: [0, -0.2, 0], angle: 0.35, penumbra: 1 });
  const sparks = dust(be.scene, { count: 30, box: [0, -0.1, 0, 0.3, 0.4, 0.3], size: 0.012, intensity: 1.2, color: 0xffa860, speed: 0.02, res: ctx.res, seed: 8 });
  be.onUpdate((t) => {
    const k = clamp((t - 2.3) / 2.4); const theta = easeOutCubic(k) * Math.PI * 1.55; bottom.userData.setAngle(theta);
    chamberGlow.intensity = 0.012 * (1 - smooth(k * 1.4)); chamberGlow.position.y = 0.05 - k * 0.06; sparks.set(t);
  });
  const boreCam = (() => {
    const pc = curve([v3(0, 0.09, 0.004), v3(0.0, 0.045, 0.006), v3(0.01, -0.0, 0.02), v3(0.09, -0.11, 0.1), v3(0.16, -0.2, 0.14)]);
    return (lt, u, cam, t) => {
      const k = easeInOutCubic(clamp(u)); const p = at(pc, k + (u > 1 ? (u - 1) * 0.4 : 0));
      const crown = bottom.userData.piston.position.y; const tgt = k < 0.45 ? v3(0, crown - 0.02, 0) : v3(0, lerp(crown - 0.02, -0.2, smooth((k - 0.45) / 0.4)), 0);
      if (k < 0.4) p.y = Math.max(p.y, crown + 0.035);
      const d = aim(cam, p, tgt, { fov: lerp(78, 46, smooth(k * 1.3)), near: 0.002, far: 10, roll: k * 0.6 }); return { focus: d, aperture: lerp(6, 14, k) };
    };
  })();
  shots.push(shot('s1.2', 2.55, 4.65, be, boreCam, { trans: { type: 'flash', dur: 0.5 }, grade: { exposure: 1.15, bloom: 0.75, streak: 0.35, threshold: 1.0, gain: [1.05, 0.98, 0.9] } }));

  // ---------------------------------------------------------------- 1.3 intake runner
  const ru = makeSet(null); const runner = buildRunner(); ru.scene.add(runner);
  await useHdri(ru.scene, HDRI.studio, { env: 0.2, rotation: 2.2 });
  ownMaterials(runner, (m) => { if (m.side === THREE.BackSide) { m.color.setHex(0x9a968e); m.normalMap = waterN; m.normalScale = new THREE.Vector2(0.012, 0.012); m.roughness = 0.1; } }); // hand-ported cast runner
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), M.emissive(0xffe6c4, 1.5)); mouth.position.set(1.0, 0, 0); mouth.rotation.y = -Math.PI / 2; ru.scene.add(mouth);
  const mouthLight = point(ru.scene, { color: 0xffe2b0, intensity: 0.02, pos: [0.55, 0, 0] });
  point(ru.scene, { color: 0xffb070, intensity: 0.0015, pos: [0.1, 0.02, 0] });
  for (let i = 1; i <= 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0305 + Math.pow(i / 6, 3) * 0.05, 0.0006, 6, 96), M.emissive(0xffd29a, 1.1)); ring.position.x = i * 0.1; ring.rotation.y = Math.PI / 2; ru.scene.add(ring); }
  // the polished runner reflects itself: capture its own interior (mouth glow, rings, walls) once into a cube map
  { const crt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }); const cc = new THREE.CubeCamera(0.002, 10, crt); cc.position.set(0.3, 0, 0); ru.scene.add(cc);
    mouth.material.color.setRGB(1, 0.9, 0.77).multiplyScalar(1.5); cc.update(ctx.renderer, ru.scene); ru.scene.remove(cc);
    runner.traverse((o) => { if (o.isMesh && o.material.side === THREE.BackSide) { o.material.envMap = crt.texture; o.material.envMapIntensity = 0.06; o.material.needsUpdate = true; } }); }
  ru.onUpdate((t) => { const k = clamp((t - 4.6) / 1.2); mouthLight.intensity = 0.01 + k * 0.05; mouth.material.color.setRGB(1, 0.9, 0.77).multiplyScalar(1.0 + k * k * 5); });
  shots.push(shot('s1.3', 4.65, 5.75, ru, (lt, u, cam) => {
    const k = easeInCubic(clamp(u * 0.92 + 0.08)); const x = lerp(-0.05, 0.66, k); const d = aim(cam, v3(x, 0.004 * Math.sin(lt * 3), 0.003), v3(x + 1, 0, 0), { fov: 70, near: 0.002, far: 10, roll: lt * 0.9 });
    return { focus: 0.12, aperture: 0 };
  }, { trans: { type: 'zoom', dur: 0.45, center: [0.5, 0.5] }, grade: { exposure: 0.85, bloom: 0.3, streak: 0.12, threshold: 2.0 } }));

  // ---------------------------------------------------------------- 1.4 hangar reveal
  const hero = buildCar('classic', { fasteners: false });
  const hs = await hangarSet(ctx, hero);
  const hc = keyCam(
    [v3(2.9, 0.62, 1.55), v3(3.4, 0.9, 4.6), v3(0.6, 1.05, 7.4), v3(-1.4, 4.2, 10.5), v3(-2.2, 9, 12.5)],
    [v3(2.1, 0.55, 0.62), v3(1.2, 0.55, 0.3), v3(0.1, 0.55, 0), v3(0, 0.3, 0), v3(0, 0, 0)],
    { fov: (u) => lerp(32, 42, smooth(u)), aperture: (u) => lerp(9, 2, smooth(u * 1.5)), ease: (u) => easeInOutCubic(u) },
  );
  shots.push(shot('s1.4', 5.75, 8.0, hs, hc, { trans: { type: 'flash', dur: 0.5 }, grade: { exposure: 1.25, bloom: 0.5, streak: 0.3, threshold: 1.2, lift: [0.004, 0.003, 0.002] } }));
  return { shots, hero };
}
