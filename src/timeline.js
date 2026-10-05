// Master timeline: assembles every scene's shots on the 90-second clock, plus title cues.
import { buildS1 } from './scenes/s1-spark.js';
import { buildS2 } from './scenes/s2-anatomy.js';
import { buildS3 } from './scenes/s3-atelier.js';
import { buildS4 } from './scenes/s4-collection.js';
import { buildS5 } from './scenes/s5-paddock.js';
import { buildS6 } from './scenes/s6-road.js';
import { buildS7 } from './scenes/s7-club.js';
import { buildS8 } from './scenes/s8-service.js';
import { buildS9, LOGO } from './scenes/s9-legacy.js';

export const DURATION = 90;

export const TITLES = [
  { text: 'Where legends park.', start: 46.9, end: 49.9, size: 66, tracking: 0.28, rule: true, y: 0.8 },
  { text: 'Collect. Care. Drive. Belong.', start: 75.9, end: 81.2, size: 60, tracking: 0.24, words: true, wordStep: 0.55, y: 0.84, halo: 0.9 },
  { text: 'Legend Paddock Club', start: 84.7, end: 86.95, size: LOGO.titleSize, tracking: LOGO.tracking, y: LOGO.titleY, weight: 600, noSettle: true, fadeIn: 1.2, fadeOut: 0.5 },
];

export async function buildTimeline(ctx) {
  if (ctx.params?.has('asset')) { const { buildAssetPreview } = await import('./scenes/preview.js'); return buildAssetPreview(ctx); }
  const only = ctx.only ? ctx.only.split(',') : null; const want = (k) => !only || only.includes(k);
  const shots = []; const prog = (m) => ctx.onProgress?.(m);
  const scenes = [['s1', buildS1], ['s2', buildS2], ['s3', buildS3], ['s4', buildS4], ['s5', buildS5], ['s6', buildS6], ['s7', buildS7], ['s8', buildS8], ['s9', buildS9]];
  for (const [k, fn] of scenes) if (want(k)) { prog(`Building ${k}…`); const r = await fn(ctx); shots.push(...r.shots); }
  return { shots, duration: DURATION, titles: TITLES, fadeIn: 0.5, fadeOutStart: 89.0 };
}
