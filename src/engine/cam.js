// Camera helpers: aim, extrapolating path sampling, handheld micro-drift.
import * as THREE from 'three';
import { clamp, noise1 } from './util.js';

const _t = new THREE.Vector3();

/** Sample a curve at u, extrapolating linearly past the ends so transitions keep moving. */
export function at(curve, u, out = new THREE.Vector3()) {
  if (u >= 0 && u <= 1) return curve.getPoint(u, out);
  const e = u < 0 ? 0 : 1; curve.getPoint(e, out); const tan = curve.getTangent(e, _t); const len = curve.getLength();
  return out.addScaledVector(tan, (u - e) * len);
}

export function aim(cam, pos, target, { fov, roll = 0, near, far } = {}) {
  cam.position.copy(pos); cam.up.set(0, 1, 0); cam.lookAt(target); if (roll) cam.rotateZ(roll);
  let dirty = false;
  if (fov !== undefined && cam.fov !== fov) { cam.fov = fov; dirty = true; }
  if (near !== undefined && cam.near !== near) { cam.near = near; dirty = true; }
  if (far !== undefined && cam.far !== far) { cam.far = far; dirty = true; }
  if (dirty) cam.updateProjectionMatrix();
  return pos.distanceTo(target);
}

/** Subtle organic drift (operator-on-a-gimbal feel), amplitude in metres. */
export function drift(t, amp = 0.01, seed = 0) {
  return new THREE.Vector3(noise1(t * 0.7 + seed) * amp, noise1(t * 0.55 + seed + 10) * amp, noise1(t * 0.6 + seed + 20) * amp);
}

/** fov for a given focal length (mm) on a Super-35-ish 24.9mm-wide sensor at 16:9 → vertical fov. */
export function lens(mm) { const sensorH = 14.0; return (2 * Math.atan(sensorH / (2 * mm)) * 180) / Math.PI; }

export { clamp };
