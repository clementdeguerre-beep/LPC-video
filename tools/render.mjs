// Offline renderer: deterministic frame capture (Playwright + SwiftShader/GPU) → JPEG frames →
// ffmpeg (H.264 / ProRes-friendly settings) muxed with the procedural score.
//   node tools/render.mjs [--width 1920 --height 1080] [--fps 24] [--from 0 --to 90] [--out renders/LPC_film_1080p.mp4]
//   node tools/render.mjs --audio-only        (renders renders/score.wav)
//   node tools/render.mjs --encode-only       (re-encodes existing frames + audio)
//   --workers N   splits the frame range across N browser processes
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import { serve } from './serve.mjs';

const argv = process.argv.slice(2); const flag = (k) => argv.includes(`--${k}`); const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const W = +opt('width', 1920), H = +opt('height', 1080), FPS = +opt('fps', 24), FROM = +opt('from', 0), TO = +opt('to', 90), WORKERS = +opt('workers', 1);
const OUT = opt('out', `renders/LPC_film_${H}p.mp4`); const FRAMES = opt('frames', `renders/frames_${H}p`); const WAV = 'renders/score.wav';
const Q = +opt('quality', 0.95);
fs.mkdirSync(FRAMES, { recursive: true }); fs.mkdirSync(path.dirname(OUT), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'];

async function openPage(port, w, h) {
  const browser = await chromium.launch({ args: flag('gpu') ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ARGS });
  const page = await browser.newPage({ viewport: { width: Math.min(w, 1920), height: Math.min(h, 1080) } });
  page.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exit(1); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?render=1&w=${w}&h=${h}`);
  await page.waitForFunction(() => window.__film?.ready, null, { timeout: 900000 });
  return { browser, page };
}

async function renderAudio(port) {
  const { browser, page } = await openPage(port, 320, 180); const t0 = Date.now();
  const b64 = await page.evaluate(() => window.__film.audioWav());
  fs.writeFileSync(WAV, Buffer.from(b64, 'base64')); await browser.close();
  console.log(`audio → ${WAV} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

async function renderFrames(port, frames, tag) {
  const { browser, page } = await openPage(port, W, H); let done = 0; const t0 = Date.now();
  for (const f of frames) {
    const file = path.join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`); if (fs.existsSync(file) && fs.statSync(file).size > 1000) { done++; continue; }
    await page.evaluate((t) => window.__film.frame(t), f / FPS);
    const data = await page.evaluate((q) => window.__film.capture('image/jpeg', q), Q);
    fs.writeFileSync(file + '.tmp', Buffer.from(data.split(',')[1], 'base64')); fs.renameSync(file + '.tmp', file); done++;
    if (done % 24 === 0) { const el = (Date.now() - t0) / 1000; console.log(`[${tag}] ${done}/${frames.length} frames, ${(el / done).toFixed(2)} s/frame, eta ${((frames.length - done) * el / done / 60).toFixed(1)} min`); }
  }
  await browser.close();
}

function encode() {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-framerate', String(FPS), '-start_number', String(Math.round(FROM * FPS)), '-i', path.join(FRAMES, 'f%05d.jpg')];
    if (fs.existsSync(WAV)) args.push('-ss', String(FROM), '-i', WAV);
    args.push('-frames:v', String(Math.round((TO - FROM) * FPS)), '-c:v', 'libx264', '-preset', 'slow', '-crf', H > 1500 ? '16' : '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'film', '-movflags', '+faststart', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
    if (fs.existsSync(WAV)) args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=18', '-ar', '48000', '-c:a', 'aac', '-b:a', '320k', '-shortest');
    args.push(OUT); console.log('ffmpeg', args.join(' '));
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`))));
  });
}

const { port, close } = await serve();
try {
  if (flag('audio-only')) { await renderAudio(port); }
  else if (flag('encode-only')) { await encode(); }
  else {
    if (!fs.existsSync(WAV) || flag('audio')) await renderAudio(port);
    const all = []; for (let f = Math.round(FROM * FPS); f < Math.round(TO * FPS); f++) all.push(f);
    const chunks = Array.from({ length: WORKERS }, (_, i) => all.filter((_, k) => k % WORKERS === i));
    await Promise.all(chunks.map((c, i) => renderFrames(port, c, `w${i}`)));
    await encode();
  }
} finally { close(); }
console.log('done');
