// Asset preview (not part of the film): ?asset=Name&hdri=key&bg=1 — a 6 s turntable of one photoreal model.
import { THREE, makeSet, shot, v3, aim } from './common.js';
import { useHdri, model, HDRI, selectVariant, hide, variants } from '../engine/assets.js';

export async function buildAssetPreview(ctx) {
  const q = ctx.params; const name = q.get('asset'); const h = HDRI[q.get('hdri') || 'studio'] || q.get('hdri');
  const set = makeSet(null); await useHdri(set.scene, h, { env: +(q.get('env') || 1), background: q.has('bg'), blur: +(q.get('blur') || 0) });
  const m = await model(name, { size: q.has('size') ? +q.get('size') : null }); set.scene.add(m);
  if (q.has('variant')) console.log(`[asset] variants ${variants(m).join(',')} → ${await selectVariant(m, q.get('variant'))}`); if (q.has('hide')) console.log(`[asset] hidden ${hide(m, new RegExp(q.get('hide'), 'i'))}`);
  const box = new THREE.Box3().setFromObject(m); const sph = box.getBoundingSphere(new THREE.Sphere()); const c = sph.center, r = sph.radius;
  set.onUpdate((t) => { m.rotation.y = t * 0.6; });
  const s = shot('preview', 0, 6, set, (lt, u, cam) => { const d = aim(cam, v3(c.x + r * 1.6, c.y + r * 0.7, c.z + r * 2.2), c, { fov: 35, near: r * 0.01, far: r * 50 }); return { focus: d, aperture: 0 }; }, { trans: { type: 'cut', dur: 0 } });
  console.log(`[asset] ${name} size ${box.getSize(new THREE.Vector3()).toArray().map((x) => x.toFixed(3)).join(' x ')}`);
  return { shots: [s], duration: 6, titles: [], fadeIn: 0.01, fadeOutStart: 100 };
}
