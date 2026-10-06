// SCENE 2 (8–18s) — THE ANATOMY. The car separates into a floating exploded view traced in gold,
// macro passes over a bolt thread, a titanium washer, a wiring harness and a stitched steering
// seam, then everything re-assembles in one wave; pull back to a top-down on a mirror floor.
// Realism pass: every set is lit and reflected by real photographed studios (HDR panoramas, graded
// to a black void), the floor pans and macro props carry real carbon-fibre photo textures, and the
// macro props are rebuilt at macro fidelity (helical thread, chamfered hex, real leather grain scale).
import { THREE, makeSet, spot, point, dust, shot, keyCam, M, v3, clamp, smooth, lerp, rng, aim, at, curve, easeInOutCubic, mirrorFloor, envOn } from './common.js';
import { buildCar, reflectionOf, contactShadow, emblemMaterial } from '../models/car.js';
import { tube, mesh, merge } from '../models/geo.js';
import { invLerp, easeOutCubic, easeInOutQuint, TAU } from '../engine/util.js';
import { hdri, HDRI, photo } from '../engine/assets.js';

const T0 = 8;

/** Explosion state over global time: out (front→back), hold, back in one wave (rear→front). */
export function explodeAt(t, key) {
  const out = smooth(invLerp(T0 + 0.7 + key * 0.9, T0 + 2.9 + key * 0.9, t));
  const back = easeInOutQuint(invLerp(14.3 + (1 - key) * 1.0, 15.6 + (1 - key) * 1.0, t));
  return out * (1 - back);
}

// ------------------------------------------------------------------------------------------------
// Photographic light

/** Direction (panorama space) of an equirect pixel at horizontal coord u (0..1) and elevation (degrees) — inverse of three's equirectUv(). */
const panoDir = (u, elevDeg) => { const th = (u - 0.5) * TAU, el = (elevDeg * Math.PI) / 180; return new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)); };

/**
 * Real photographic studio light (HDR panoramas, Poly Haven CC0) graded for the black void.
 * Base layer: a photographed studio whose softboxes / strip lights keep full HDR strength while
 * walls and floor are crushed. Over layer: a real softbox from a studio photo (picked by its
 * panorama position `overAt`), re-aimed overhead (only its bright pixels, upper hemisphere only) so
 * roofs, bonnets and the top-down frame carry a genuine softbox reflection. Returns a PMREM texture (cached).
 */
const _envs = new Map();
async function photoStudio(renderer, o = {}) {
  const id = JSON.stringify(o); if (_envs.has(id)) return _envs.get(id);
  const { base = 'studioTall', yaw = 0, wall = 0.08, floor = 0.03, lo = 1.5, hi = 6, max = 8, gain = 1,
    over = 'studioTall', overAt = [0.405, -8.4], overSpin = 0, overK = 1, overMax = 8, overMinY = 0.45, size = 256 } = o;
  const [A, B] = await Promise.all([hdri(HDRI[base] ?? base), hdri(HDRI[over] ?? over)]);
  const rotA = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(yaw));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), panoDir(...overAt)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), overSpin));
  const rotB = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      mapA: { value: A.equirect }, mapB: { value: B.equirect }, rotA: { value: rotA }, rotB: { value: rotB },
      wall: { value: wall }, floorK: { value: floor }, lo: { value: lo }, hi: { value: hi }, mx: { value: max }, gain: { value: gain },
      overK: { value: overK }, overMax: { value: overMax }, overMinY: { value: overMinY },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `#include <common>
      uniform sampler2D mapA, mapB; uniform mat3 rotA, rotB; uniform float wall, floorK, lo, hi, mx, gain, overK, overMax, overMinY; varying vec3 vD;
      vec3 capped(vec3 c, float m){ float k = max(max(c.r, c.g), c.b); return k > m ? c * (m / k) : c; }
      void main(){
        vec3 d = normalize(vD);
        vec3 s = normalize(rotA * d); vec3 c = texture2D(mapA, equirectUv(s)).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(mix(floorK, wall, smoothstep(-0.15, 0.05, s.y)), 1.0, smoothstep(lo, hi, l));
        c = capped(c, mx);
        vec3 b = texture2D(mapB, equirectUv(normalize(rotB * d))).rgb; float lb = dot(b, vec3(0.2126, 0.7152, 0.0722));
        c += capped(b, overMax) * overK * smoothstep(2.0, 6.0, lb) * smoothstep(overMinY, overMinY + 0.25, d.y);
        gl_FragColor = vec4(c * gain, 1.0);
      }`,
  });
  const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 128, 64), mat));
  const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(sc, 0, 0.1, 100, { size }).texture; pm.dispose(); mat.dispose();
  _envs.set(id, tex); return tex;
}

/** Real carbon-fibre twill (photo albedo + normal); repeat = tiles per UV unit. */
async function carbonMat(repeat = [4, 4], { color = 0xffffff, side = THREE.FrontSide, normal = 0.8 } = {}) {
  const [map, nrm] = await Promise.all([photo('textures/carbon/Carbon.png', { srgb: true }), photo('textures/carbon/Carbon_Normal.png', { srgb: false })]);
  const m = map.clone(), n = nrm.clone(); m.repeat.set(...repeat); n.repeat.set(...repeat); m.needsUpdate = n.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ color, map: m, normalMap: n, normalScale: new THREE.Vector2(normal, normal), roughness: 0.42, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, side });
}

// ------------------------------------------------------------------------------------------------
// Macro-fidelity props

/** Hex flange bolt at macro fidelity, axis +Y (head up, shank down to −len): a true helical
 *  ISO thread (flat crests / roots), run-out, chamfered tip, bevelled hex head and bearing face. */
function macroBoltGeo({ len = 0.032, rad = 0.0045, pitch = 0.00125, plain = 0.0035 } = {}) {
  const depth = pitch * 0.58, rMin = rad - depth; const nA = 72, nZ = Math.ceil((len / pitch) * 26);
  const pos = [], idx = [];
  for (let j = 0; j <= nZ; j++) {
    const y = -(j / nZ) * len, fromHead = -y, toTip = len - fromHead;
    for (let i = 0; i <= nA; i++) {
      const a = (i / nA) * TAU; const ph = ((fromHead / pitch + a / TAU) % 1 + 1) % 1;
      const prof = clamp(1.7 * (1 - Math.abs(2 * ph - 1)) - 0.3, 0, 1); // trapezoid ISO-ish profile
      let r = rMin + depth * prof;
      const runout = smooth(invLerp(plain, plain + pitch * 1.5, fromHead)); r = lerp(rad * 0.985, r, runout); // plain shank under the head
      r = Math.min(r, rMin * 0.92 + (toTip / 0.0011) * (rad - rMin * 0.92)); // 45° chamfer at the tip
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < nZ; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, b = a + nA + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const shank = new THREE.BufferGeometry(); shank.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shank.setIndex(idx); shank.computeVertexNormals();
  const nrm = shank.attributes.normal; for (let j = 0; j <= nZ; j++) { const a = j * (nA + 1), b = a + nA; const x = nrm.getX(a) + nrm.getX(b), yy = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b); const l = Math.hypot(x, yy, z) || 1; nrm.setXYZ(a, x / l, yy / l, z / l); nrm.setXYZ(b, x / l, yy / l, z / l); }
  const tipCap = new THREE.CircleGeometry(rMin * 0.92, 48); tipCap.rotateX(Math.PI / 2); tipCap.translate(0, -len, 0);
  const AF = rad * 3.2; const hex = new THREE.Shape(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6, rr = AF / 2 / Math.cos(Math.PI / 6); k ? hex.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : hex.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const headH = rad * 1.25, bev = rad * 0.12;
  const head = new THREE.ExtrudeGeometry(hex, { depth: headH - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.9, bevelSegments: 3, curveSegments: 1 });
  head.rotateX(-Math.PI / 2); head.translate(0, rad * 0.28 + bev, 0);
  const flange = new THREE.CylinderGeometry(AF * 0.62, AF * 0.6, rad * 0.28, 96); flange.translate(0, rad * 0.14, 0);
  const geos = [shank, tipCap, head, flange].map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
  return merge(geos);
}

/** Washer with radiused edges (lathe, 128 segments). */
function macroWasherGeo(r = 0.009, ri = 0.005, t = 0.0014) {
  const e = t * 0.28; const prof = [];
  const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 4; k++) { const a = a0 + ((a1 - a0) * k) / 4; prof.push(new THREE.Vector2(cx + Math.cos(a) * e, cy + Math.sin(a) * e)); } };
  arc(ri + e, e, Math.PI, Math.PI * 1.5); arc(r - e, e, -Math.PI / 2, 0); arc(r - e, t - e, 0, Math.PI / 2); arc(ri + e, t - e, Math.PI / 2, Math.PI);
  prof.push(prof[0].clone()); const g = new THREE.LatheGeometry(prof, 128); g.translate(0, -t / 2, 0); return g;
}

/** Steering wheel at macro fidelity: real-scale leather grain, recessed seam and a true baseball
 *  stitch in champagne-gold twisted thread (herringbone of chevrons running along the seam). */
function heroSteering() {
  const g = new THREE.Group(); const R = 0.19, r = 0.017;
  const leather = M.leather(0x1a1310); leather.map = leather.map.clone(); leather.normalMap = leather.normalMap.clone();
  for (const tx of [leather.map, leather.normalMap]) { tx.repeat.set(46, 4.2); tx.needsUpdate = true; }
  leather.normalScale.set(0.32, 0.32); leather.roughness = 0.5; leather.sheen = 0.6; leather.sheenColor = new THREE.Color(0x4a3a30); leather.clearcoat = 0.25; leather.clearcoatRoughness = 0.35;
  g.add(mesh(new THREE.TorusGeometry(R, r, 48, 520), leather));
  // seam: the two leather edges dip into a fine groove on the inner equator
  g.add(mesh(new THREE.TorusGeometry(R - r * 0.985, 0.0007, 8, 900), new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.8 })));
  // baseball stitch: each stitch is a chevron — two thread arms from holes either side of the seam meeting on it
  const n = 420, w = 0.0022, h = ((R - r) * TAU) / n * 0.92, tr = 0.00037; const armLen = Math.hypot(w, h) - tr * 0.6;
  const thread = new THREE.CapsuleGeometry(tr, armLen, 3, 10); thread.rotateX(Math.PI / 2); // long axis → z
  const T = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), Mx = new THREE.Matrix4(), qq = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const st = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU; T.set(-Math.sin(a), Math.cos(a), 0); const rr = R - r - tr * 0.35;
    for (const side of [-1, 1]) { // arm: from the hole on this side of the seam, forward and across to the seam line
      dir.copy(Z).multiplyScalar(-side * w).addScaledVector(T, h).normalize(); qq.setFromUnitVectors(Z, dir);
      p.set(Math.cos(a) * rr, Math.sin(a) * rr, side * w * 0.5); Mx.compose(p, qq, one); st.push(thread.clone().applyMatrix4(Mx));
    }
  }
  // twisted-ply relief for the thread (bump), so the stitch reads as waxed thread, not plastic
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128; const cx = cv.getContext('2d'); const img = cx.createImageData(32, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) { const v = 0.5 + 0.5 * Math.sin(TAU * (x / 32 * 3 + y / 128 * 9)); const o = (y * 32 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255 * v; img.data[o + 3] = 255; }
  cx.putImageData(img, 0, 0); const ply = new THREE.CanvasTexture(cv); ply.wrapS = ply.wrapT = THREE.RepeatWrapping;
  g.add(new THREE.Mesh(merge(st), new THREE.MeshPhysicalMaterial({ color: 0xd6b16e, metalness: 0.3, roughness: 0.46, bumpMap: ply, bumpScale: 1.2, sheen: 1, sheenColor: new THREE.Color(0xffe0a0), sheenRoughness: 0.4 })));
  const spokeMat = M.alu().clone(); spokeMat.roughness = 0.42; spokeMat.color.set(0xb8b9bc);
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 1.15; const sp = new THREE.Group(); sp.rotation.z = a;
    sp.add(mesh(new THREE.BoxGeometry(0.17, 0.026, 0.005), spokeMat, { p: [0.09, 0, 0] }));
    for (let h = 0; h < 3; h++) sp.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 32), M.matte(0x020202), { p: [0.05 + h * 0.035, 0, 0], r: [Math.PI / 2, 0, 0] }));
    g.add(sp);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 64), emblemMaterial(), { r: [Math.PI / 2, 0, 0] }); hub.geometry.rotateY(Math.PI / 2); g.add(hub);
  return g;
}

/** Wiring harness: twisted insulated cores (clear-coated), black heat-shrink bands, machined gold hex ferrules. */
async function harness() {
  const g = new THREE.Group(); const cols = [0x6a1018, 0xd8b06a, 0x101010, 0x8a8a8a, 0x3a0a10, 0xc9a050, 0x1a1a1a];
  const cy = (x) => Math.sin(((x + 0.35) / 0.7) * 3) * 0.05;
  const path = (k) => { const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; const a = t * TAU * 1.6 + k * (TAU / cols.length); pts.push(new THREE.Vector3(t * 0.7 - 0.35, Math.sin(t * 3) * 0.05 + Math.sin(a) * 0.009, Math.cos(a) * 0.009)); } return pts; };
  cols.forEach((c, k) => g.add(new THREE.Mesh(tube(path(k), 0.0035, 260, 16), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.12 }))));
  const shrink = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  for (const x of [-0.27, -0.06, 0.16]) {
    const ang = Math.atan2(0.15 * Math.cos(((x + 0.35) / 0.7) * 3), 0.7);
    g.add(mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.018, 48, 1, true), shrink, { p: [x, cy(x), 0], r: [0, 0, -Math.PI / 2 + ang] }));
    for (const e of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.0138, 0.0009, 8, 48), shrink, { p: [x + e * 0.009 * Math.cos(ang), cy(x) + e * 0.009 * Math.sin(ang), 0], r: [0, Math.PI / 2, ang] }));
  }
  // braided loom sleeve between the last two heat-shrink bands — real carbon twill photo texture as the braid
  const sl = []; for (let i = 0; i <= 24; i++) { const x = lerp(-0.058, 0.158, i / 24); sl.push(new THREE.Vector3(x, cy(x), 0)); }
  const braid = await carbonMat([30, 11], { color: 0x9a9a9e, normal: 1.4 }); braid.clearcoat = 0.15; braid.roughness = 0.5; braid.metalness = 0.45;
  g.add(new THREE.Mesh(tube(sl, 0.0131, 120, 48), braid));
  for (const x of [-0.36, 0.36]) g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6), M.goldPolished(), { p: [x, cy(x), 0], r: [0, 0, Math.PI / 2] }));
  return g;
}

// ------------------------------------------------------------------------------------------------

export async function buildS2(ctx, shared = {}) {
  // one photographed studio for every stage: monochrome_studio_02's real strip softboxes around the horizon, plus its
  // other strip softbox re-aimed overhead (long axis along the car) — the classic car-studio overhead strip
  const studio = await photoStudio(ctx.renderer, { base: 'studioTall', over: 'studioTall', overAt: [0.405, -8.4], max: 8, overMax: 12 });
  // macro stages: the photographed studio itself, defocused far behind the subject (reads as real lens bokeh)
  const studioBg = (sc, k) => { sc.background = studio; sc.backgroundBlurriness = 0.25; sc.backgroundIntensity = k; };

  const set = makeSet(null, { envIntensity: 0.5 }); const s = set.scene; s.environment = studio; // black void kept: the studio is seen only in reflections
  const car = buildCar('classic', { seed: 21 }); s.add(car.group);
  envOn(car.paint, s, 1.6); // this car's own paint: stronger photographic softbox reflections in the clear coat
  const cf = await carbonMat([12, 4.2], { side: THREE.DoubleSide }); for (const pnl of car.panels) if (pnl.name.endsWith('-floor')) pnl.material = cf;
  const refl = reflectionOf(car.group); refl.visible = false; s.add(refl);
  const shadow = contactShadow(car, 0.9); s.add(shadow);
  const floor = mirrorFloor(s, { opacity: 0.86, envI: 0.04, rough: 0.2 });
  const topK = 60;
  const top = spot(s, { intensity: topK, pos: [0, 9, 2], target: [0, 0.6, 0], angle: 0.5, penumbra: 1, color: 0xfff1de });
  spot(s, { intensity: 70, pos: [-7, 2.5, -5], target: [0, 0.8, 0], angle: 0.5, penumbra: 1, color: 0xffb870 });
  spot(s, { intensity: 70 * 0.75, pos: [7, 1.5, 6], target: [0, 0.8, 0], angle: 0.5, penumbra: 1, color: 0xc4d0ff });
  const d = dust(s, { count: 220, box: [0, 1.5, 0, 10, 4, 8], size: 0.8, intensity: 0.5, res: ctx.res, seed: 11 });

  const steer = heroSteering(); car.interior.userData.steering.visible = true;
  set.onUpdate((t) => {
    d.set(t);
    car.setExplode((p) => explodeAt(t, p.key), t);
    const eAll = explodeAt(t, 0.5);
    car.setOutline(smooth(invLerp(T0 + 1.0, T0 + 2.4, t)) * (1 - smooth(invLerp(15.6, 16.8, t))));
    car.group.rotation.y = Math.sin((t - T0) * 0.12) * 0.12 * eAll;
    car.spin(0); refl.visible = t > 16.0; shadow.material.opacity = 0.9 * (1 - eAll);
    floor.material.opacity = lerp(0.0, 0.86, smooth(invLerp(14.8, 16.6, t))); floor.visible = floor.material.opacity > 0.01;
    top.intensity = topK * (1 - smooth(invLerp(15.8, 17.0, t)));
  });

  const shots = [];
  // 2.1 — from the hangar aerial down into an orbit around the separating car
  shots.push(shot('s2.1', 8.0, 12.3, set, keyCam(
    [v3(-2.2, 9, 12.5), v3(-5.0, 4.4, 8.0), v3(-6.4, 2.7, 3.4), v3(-5.4, 2.4, -1.8)],
    [v3(0, 0, 0), v3(0, 0.7, 0), v3(0.2, 0.9, 0), v3(0.3, 0.9, 0)],
    { fov: (u) => lerp(42, 34, smooth(u)), aperture: 1.5, ease: (u) => easeInOutCubic(u) }),
  { trans: { type: 'dissolve', dur: 0.9 }, grade: { exposure: 1.2, bloom: 0.4, streak: 0.2, threshold: 1.4 } }));
  // 2.2 — macro stage: a bolt turning on its axis, titanium washer drifting through focus
  const bs = makeSet(null, { envIntensity: 0.25 }); const B = bs.scene; B.environment = studio; B.environmentRotation = new THREE.Euler(0, 0, 0); studioBg(B, 0.04);
  const boltMat = new THREE.MeshPhysicalMaterial({ color: 0xd2d3d6, metalness: 1, roughness: 0.16 });
  const boltPivot = new THREE.Group(); B.add(boltPivot); const bolt = mesh(macroBoltGeo(), boltMat); bolt.rotation.z = -Math.PI / 2; bolt.position.x = 0.016; boltPivot.add(bolt);
  const wGeo = macroWasherGeo(); const wash = mesh(wGeo, M.titanium()); B.add(wash);
  const wash2 = mesh(wGeo, M.gold()); B.add(wash2);
  const bgParts = buildCar('classic', { lite: true, seed: 3 }); bgParts.group.position.set(-0.6, -1.0, -2.6); bgParts.group.rotation.y = 0.5; bgParts.setOutline(1); bgParts.setExplode(0.7); B.add(bgParts.group);
  spot(B, { intensity: 0.03, pos: [0.02, 0.25, 0.12], target: [0, 0, 0], angle: 0.3, penumbra: 1, color: 0xfff0dc });
  spot(B, { intensity: 0.03 * 1.4, pos: [-0.1, 0.05, -0.25], target: [0, 0, 0], angle: 0.4, penumbra: 1, color: 0xffb46a });
  bs.onUpdate((t) => { boltPivot.rotation.set((t - 12.3) * 1.1, 0, 0.08); wash.position.set(lerp(0.03, -0.035, smooth((t - 12.2) / 1.3)), -0.006, 0.03); wash.rotation.set(1.2, 0.3, t * 0.4); wash2.position.set(-0.03, 0.012, -0.03); wash2.rotation.set(0.5, t * 0.5, 0.9); });
  shots.push(shot('s2.2', 12.3, 13.3, bs, (lt, u, cam) => {
    const dd = aim(cam, v3(lerp(0.012, -0.006, u), 0.007, lerp(0.07, 0.055, u)), v3(lerp(0.004, -0.004, u), 0, 0), { fov: 26, near: 0.003, far: 20, roll: 0.04 });
    return { focus: lerp(dd - 0.03, dd, smooth((u - 0.25) * 2.5)), aperture: 20 };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.6, 0.45] }, grade: { exposure: 1.15, bloom: 0.4, streak: 0.2, threshold: 1.3 } }));
  // 2.3 — macro stage: wiring harness glide, whip to the gold baseball stitch on the steering rim
  const hs = makeSet(null, { envIntensity: 0.55 }); const H = hs.scene; H.environment = studio; H.environmentRotation = new THREE.Euler(0, 0, 0); studioBg(H, 0.04);
  const wires = await harness(); wires.position.set(0, 0, 0); H.add(wires); H.add(steer); steer.position.set(0.15, 0.1, -0.35); steer.rotation.set(-0.3, 0.4, 0);
  const bg2 = buildCar('classic', { lite: true, seed: 4 }); bg2.group.position.set(1.2, -0.9, -3.2); bg2.group.rotation.y = -0.6; bg2.setOutline(1); bg2.setExplode(0.8); H.add(bg2.group);
  // harness glide and steering macro share the stage; each gets its own exposure of the photographed studio
  hs.onUpdate((t) => {
    wires.rotation.set(0.1, 0.25 + t * 0.03, 0.05); const st = t >= 13.78;
    H.environmentIntensity = st ? 1.3 : 0.55; H.environmentRotation.set(st ? 0 : 0, st ? 3.1 : 0, 0);
  });
  shots.push(shot('s2.3', 13.3, 13.78, hs, (lt, u, cam) => {
    wires.updateMatrixWorld(true); const p = wires.localToWorld(v3(lerp(-0.47, -0.25, u), lerp(0.05, 0.08, u), 0.13)); const tgt = wires.localToWorld(v3(lerp(-0.35, -0.12, u), lerp(0.0, 0.05, u), 0));
    const dd = aim(cam, p, tgt, { fov: 30, near: 0.004, far: 60, roll: -0.1 }); return { focus: dd, aperture: 10 };
  }, { trans: { type: 'whip', dur: 0.36, dir: [1, 0.2] }, grade: { exposure: 1.2, bloom: 0.4, streak: 0.2, threshold: 1.3 } }));
  shots.push(shot('s2.3b', 13.78, 14.25, hs, (lt, u, cam) => {
    steer.updateMatrixWorld(true); const a = -0.8 + u * 0.3; const p = steer.localToWorld(v3(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.05)); const tgt = steer.localToWorld(v3(Math.cos(a + 0.1) * 0.175, Math.sin(a + 0.1) * 0.175, 0.0));
    const dd = aim(cam, p, tgt, { fov: 30, near: 0.004, far: 60 }); return { focus: dd, aperture: 12 };
  }, { trans: { type: 'whip', dur: 0.3, dir: [-1, -0.3] }, grade: { exposure: 1.25, bloom: 0.4, streak: 0.2, threshold: 1.3 } }));
  // 2.4 — pull back as everything re-assembles in one wave, rise to top-down on the mirror floor
  shots.push(shot('s2.4', 14.25, 18.0, set, (lt, u, cam) => {
    const k = easeInOutCubic(clamp(u));
    const pc = curve([v3(1.9, 1.5, 3.2), v3(3.6, 2.4, 6.2), v3(2.2, 6.5, 4.6), v3(0.0, 10.5, 0.02)]);
    const p = at(pc, k + (u > 1 ? (u - 1) * 0.3 : 0)); const tgt = new THREE.Vector3().lerpVectors(v3(1.2, 1.1, 1.6), v3(0, 0.3, 0), smooth(k * 1.5));
    const dd = aim(cam, p, tgt, { fov: lerp(34, 30, k), near: 0.01, far: 80 });
    return { focus: dd, aperture: lerp(8, 0.8, smooth(k * 2)) };
  }, { trans: { type: 'zoom', dur: 0.5, center: [0.5, 0.5] }, grade: { exposure: 1.2, bloom: 0.45, streak: 0.2, threshold: 1.3 } }));
  return { shots, car };
}
