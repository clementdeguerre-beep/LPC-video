// Entry point: player UI for live viewing, and the window.__film API used by the offline renderer.
import { Film } from './film.js';
import { buildTimeline } from './timeline.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const W = +params.get('w') || (RENDER ? 1920 : 1600), H = +params.get('h') || Math.round((W * 9) / 16);
if (RENDER) document.body.classList.add('render');
if (RENDER && params.get('offscreen') !== '0') document.body.classList.add('offscreen');

const canvas = RENDER && params.get('offscreen') !== '0' ? new OffscreenCanvas(W, H) : document.getElementById('film'); canvas.width = W; canvas.height = H;
const status = document.getElementById('status');

await Promise.all([400, 500, 600].map((w) => document.fonts.load(`${w} 48px "Cormorant Garamond"`)));
if (params.has('msaa')) { const { Pipeline } = await import('./engine/pipeline.js'); Pipeline.MSAA = +params.get('msaa'); }
const film = new Film(canvas, W, H);
await film.init((ctx) => buildTimeline({ ...ctx, only: params.get('only') }), (msg) => { status.textContent = msg; });

let audioBuffer = null;
async function renderAudio() {
  const { renderScore } = await import('../audio/score.js');
  audioBuffer = await renderScore(film.duration); return audioBuffer;
}
function wavBase64(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate; const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  const bytes = new Uint8Array(data.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin);
}

window.__film = {
  ready: true, duration: film.duration, fps: film.fps, width: W, height: H,
  frame: (t) => film.renderAt(t),
  profile: (on = true) => { film.profile = on ? {} : null; return film.profile; },
  getProfile: () => ({ ...film.profile, tris: film.renderer.info.render.triangles, calls: film.renderer.info.render.calls, progs: film.renderer.info.programs.length }),
  capture: async (type = 'image/jpeg', q = 0.95) => {
    if (canvas.toDataURL) return canvas.toDataURL(type, q);
    const blob = await canvas.convertToBlob({ type, quality: q }); const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return `data:${type};base64,${btoa(bin)}`;
  },
  audioWav: async () => wavBase64(await renderAudio()),
  shots: () => film.shots.map((s) => ({ name: s.name, start: s.start, end: s.end })),
};

if (!RENDER) {
  // ---- live player ----
  const ui = { toggle: document.getElementById('toggle'), bar: document.getElementById('bar'), fill: document.querySelector('#bar i'), time: document.getElementById('time'), mute: document.getElementById('mute'), play: document.getElementById('play'), splash: document.getElementById('splash') };
  for (const s of film.shots) if (s.name.endsWith('.1')) { const b = document.createElement('b'); b.style.left = `${(s.start / film.duration) * 100}%`; ui.bar.appendChild(b); }
  let t = +(params.get('t') || 0), playing = false, last = 0, actx = null, src = null, muted = false;
  const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  const startAudio = () => { if (!audioBuffer || muted) return; actx ??= new AudioContext(); src?.stop(); src = actx.createBufferSource(); src.buffer = audioBuffer; src.connect(actx.destination); src.start(0, t); };
  const stopAudio = () => { src?.stop(); src = null; };
  const setPlaying = (p) => { playing = p; ui.toggle.textContent = p ? 'Pause' : 'Play'; last = performance.now(); if (p) startAudio(); else stopAudio(); };
  ui.toggle.onclick = () => setPlaying(!playing);
  ui.mute.onclick = () => { muted = !muted; ui.mute.textContent = muted ? 'Sound off' : 'Sound on'; if (muted) stopAudio(); else if (playing) startAudio(); };
  ui.bar.onclick = (e) => { const r = ui.bar.getBoundingClientRect(); t = ((e.clientX - r.left) / r.width) * film.duration; if (playing) startAudio(); film.renderAt(t); };
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); } if (e.code === 'ArrowRight') { t = Math.min(film.duration, t + 2); if (playing) startAudio(); } if (e.code === 'ArrowLeft') { t = Math.max(0, t - 2); if (playing) startAudio(); } });
  let idle; addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 2200); });
  status.textContent = 'Composing the score…';
  renderAudio().then(() => { status.textContent = 'Ready.'; ui.play.disabled = false; }).catch(() => { status.textContent = 'Ready (silent).'; ui.play.disabled = false; });
  ui.play.onclick = () => { ui.splash.classList.add('gone'); setPlaying(true); };
  const loop = (now) => {
    if (playing) { t += (now - last) / 1000; last = now; if (t >= film.duration) { t = film.duration; setPlaying(false); } }
    film.renderAt(t); ui.fill.style.width = `${(t / film.duration) * 100}%`; ui.time.textContent = `${fmt(t)} / ${fmt(film.duration)}`;
    requestAnimationFrame(loop);
  };
  film.renderAt(t); requestAnimationFrame(loop);
}
