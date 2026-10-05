// Shared scene-building utilities: sets, lights, dust, floors, shot helpers.
import * as THREE from 'three';
import { env, M, dotTexture, lightCone } from '../engine/materials.js';
import { aim, at, drift, lens } from '../engine/cam.js';
import { rng, clamp, smooth, lerp, curve, v3, easeInOutCubic } from '../engine/util.js';

export { THREE, env, M, aim, at, drift, lens, rng, clamp, smooth, lerp, curve, v3, easeInOutCubic, lightCone };

export function makeSet(envName = 'studio', { bg = 0x000000, envIntensity = 1, fog = null } = {}) {
  const scene = new THREE.Scene(); if (envName) scene.environment = env(envName); scene.background = bg === null ? null : new THREE.Color(bg);
  scene.environmentIntensity = envIntensity; if (fog) scene.fog = fog;
  const updaters = [];
  return { scene, onUpdate: (f) => updaters.push(f), update(t, shot, lt, u) { for (const f of updaters) f(t, shot, lt, u); } };
}

export function spot(scene, { color = 0xfff0dc, intensity = 60, pos = [0, 6, 0], target = [0, 0, 0], angle = 0.5, penumbra = 0.7, distance = 0, decay = 2 } = {}) {
  const l = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay); l.position.set(...pos); l.target.position.set(...target); scene.add(l); scene.add(l.target); return l;
}
export function point(scene, { color = 0xffd9a0, intensity = 2, pos = [0, 1, 0], distance = 0, decay = 2 } = {}) { const l = new THREE.PointLight(color, intensity, distance, decay); l.position.set(...pos); scene.add(l); return l; }
export function dirLight(scene, { color = 0xffffff, intensity = 1, pos = [5, 8, 3], target = [0, 0, 0] } = {}) { const l = new THREE.DirectionalLight(color, intensity); l.position.set(...pos); l.target.position.set(...target); scene.add(l); scene.add(l.target); return l; }

/** Floating dust motes catching light: deterministic drift; box = [cx,cy,cz, sx,sy,sz]. */
export function dust(scene, { count = 600, box = [0, 2, 0, 6, 4, 6], size = 3, color = 0xffe7c2, intensity = 1.2, seed = 3, speed = 0.05, res = 1 } = {}) {
  const r = rng(seed); const pos = new Float32Array(count * 3), ph = new Float32Array(count), sz = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = box[0] + (r() - 0.5) * box[3]; pos[i * 3 + 1] = box[1] + (r() - 0.5) * box[4]; pos[i * 3 + 2] = box[2] + (r() - 0.5) * box[5]; ph[i] = r() * 100; sz[i] = 0.4 + r() * r() * 1.8; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('phase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, size: { value: size }, color: { value: new THREE.Color(color).multiplyScalar(intensity) }, map: { value: dotTexture() }, speed: { value: speed }, res: { value: res }, box: { value: new THREE.Vector3(box[3], box[4], box[5]) }, center: { value: new THREE.Vector3(box[0], box[1], box[2]) } },
    vertexShader: `uniform float time, size, speed, res; uniform vec3 box, center; attribute float phase; attribute float sz; varying float vA;
      void main(){ vec3 p = position; p.x += sin(time*0.31 + phase)*0.12 + time*speed*0.4; p.y += sin(time*0.23 + phase*1.7)*0.1 + time*speed*0.15; p.z += cos(time*0.27 + phase*0.6)*0.12;
        p = center + mod(p - center + box*0.5, box) - box*0.5;
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; float d = -mv.z; gl_PointSize = clamp(size * sz * res * 30. / d, 0., 64.*res);
        vA = (0.55 + 0.45*sin(time*1.3 + phase*3.)) * smoothstep(0.05, 0.6, d); }`,
    fragmentShader: `uniform vec3 color; uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(color * a * vA, 1.); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  return { pts, set(t) { mat.uniforms.time.value = t; } };
}

/** Black mirror floor: semi-transparent glossy plane above mirrored copies of the props. */
export function mirrorFloor(scene, { size = 60, color = 0x040404, rough = 0.26, opacity = 0.84, envI = 0.25 } = {}) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), M.floorMirror(color, rough, opacity, envI)); f.rotation.x = -Math.PI / 2; f.renderOrder = 1; scene.add(f);
  envOn(f.material, scene, envI); return f;
}

/** Per-material environment intensity (three ignores envMapIntensity unless envMap is set explicitly). */
export function envOn(mat, scene, intensity) { mat.envMap = scene.environment; mat.envMapIntensity = intensity; mat.needsUpdate = true; return mat; }

/** Ring/strip of emissive light (practical fixtures). */
export function lightStrip(scene, { w = 4, h = 0.05, color = 0xfff1dc, intensity = 6, pos = [0, 5, 0], rot = [Math.PI / 2, 0, 0] } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.emissive(color, intensity)); m.position.set(...pos); m.rotation.set(...rot); m.material.side = THREE.DoubleSide; scene.add(m); return m;
}

/** Shot factory: absolute times; cam(lt,u,cam) returns dof. */
export function shot(name, start, end, set, cam, extra = {}) { return { name, start, end, set, cam, ...extra }; }

/** Generic orbit/dolly camera from keyframed pos/target lists over u. */
export function keyCam(posKeys, tgtKeys, { fov = 35, aperture = 0, focusOffset = 0, ease = easeInOutCubic, roll = 0, near = 0.05, far = 400, driftAmp = 0 } = {}) {
  const pc = curve(posKeys), tc = curve(tgtKeys);
  return (lt, u, cam) => {
    const k = ease(clamp(u, 0, 1)) + (u > 1 ? (u - 1) * 0.5 : u < 0 ? u * 0.5 : 0); const p = at(pc, k), t = at(tc, k);
    if (driftAmp) p.add(drift(lt, driftAmp));
    const f = typeof fov === 'function' ? fov(u) : fov; const r = typeof roll === 'function' ? roll(u) : roll;
    const d = aim(cam, p, t, { fov: f, roll: r, near, far });
    return { focus: d + focusOffset, aperture: typeof aperture === 'function' ? aperture(u) : aperture };
  };
}
