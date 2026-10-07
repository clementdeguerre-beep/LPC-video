// Master timeline: assembles every scene's shots on the 90-second clock, plus title cues.
import { LOGO } from './scenes/logo.js';

// Scenes are imported lazily so a scene under construction can't break the others (and --only builds just one).
const SCENES = [
  ['s1', () => import('./scenes/s1-spark.js').then((m) => m.buildS1)], ['s2', () => import('./scenes/s2-anatomy.js').then((m) => m.buildS2)],
  ['s3', () => import('./scenes/s3-atelier.js').then((m) => m.buildS3)], ['s4', () => import('./scenes/s4-collection.js').then((m) => m.buildS4)],
  ['s5', () => import('./scenes/s5-paddock.js').then((m) => m.buildS5)], ['s6', () => import('./scenes/s6-road.js').then((m) => m.buildS6)],
  ['s7', () => import('./scenes/s7-club.js').then((m) => m.buildS7)], ['s8', () => import('./scenes/s8-service.js').then((m) => m.buildS8)],
  ['s9', () => import('./scenes/s9-legacy.js').then((m) => m.buildS9)],
];

export const DURATION = 90;

export const TITLES = [
  { text: 'Where legends park.', start: 46.9, end: 49.9, size: 66, tracking: 0.28, rule: true, y: 0.8, fadeIn: 0.6, halo: 0.8 },
  { text: 'Collect. Care. Drive. Belong.', start: 75.9, end: 81.2, size: 60, tracking: 0.24, words: true, wordStep: 0.55, y: 0.84, halo: 0.9 },
  { text: 'Legend Paddock Club', start: 84.7, end: 86.95, size: LOGO.titleSize, tracking: LOGO.tracking, y: LOGO.titleY, weight: 600, noSettle: true, fadeIn: 1.2, fadeOut: 0.5 },
];

export async function buildTimeline(ctx) {
  if (ctx.params?.has('asset')) { const { buildAssetPreview } = await import('./scenes/preview.js'); return buildAssetPreview(ctx); }
  const only = ctx.only ? ctx.only.split(',') : null; const want = (k) => !only || only.includes(k);
  const shots = []; const prog = (m) => ctx.onProgress?.(m);
  for (const [k, load] of SCENES) if (want(k)) { prog(`Building ${k}…`); const fn = await load(); const r = await fn(ctx); shots.push(...r.shots); }
  return { shots, duration: DURATION, titles: TITLES, fadeIn: 0.5, fadeOutStart: 89.0 };
}
