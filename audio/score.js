// Legend Paddock Club — procedural score and foley (Web Audio API, deterministic).
// Slow piano and strings build to an orchestral climax over a subtle engine-rumble bass layer;
// precise foley tracks the picture; the last 5 seconds fall silent before a single engine start.
// renderScore(duration) → AudioBuffer (OfflineAudioContext), used by the player and the renderer.

const SR = 48000;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const N = (name) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(name); const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return 12 * (+m[3] + 1) + base; };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Chords (MIDI note lists) by name
const CH = {
  Dm: ['D3', 'A3', 'D4', 'F4'], Dm9: ['D3', 'A3', 'E4', 'F4'], Bb: ['Bb2', 'F3', 'D4', 'F4'], Bbmaj7: ['Bb2', 'F3', 'A3', 'D4'], Gm: ['G2', 'D3', 'Bb3', 'D4'], Gm7: ['G2', 'D3', 'F3', 'Bb3'],
  F: ['F2', 'C3', 'A3', 'C4'], Fmaj7: ['F2', 'C3', 'E4', 'A3'], C: ['C3', 'G3', 'C4', 'E4'], Csus: ['C3', 'G3', 'C4', 'F4'], A: ['A2', 'E3', 'C#4', 'E4'], Asus: ['A2', 'E3', 'D4', 'E4'],
  Eb: ['Eb3', 'Bb3', 'Eb4', 'G4'], D: ['D3', 'A3', 'D4', 'F#4'], Dadd9: ['D3', 'A3', 'E4', 'F#4'],
};
// Harmonic plan [start, end, chord]
const PLAN = [
  [0, 8, 'Dm9'], [8, 12, 'Dm9'], [12, 14, 'Bbmaj7'], [14, 16, 'Gm7'], [16, 18, 'Asus'],
  [18, 20, 'Dm'], [20, 22, 'Bb'], [22, 24, 'F'], [24, 26, 'C'], [26, 28, 'Dm'], [28, 30, 'Bb'],
  [30, 32, 'Dm'], [32, 34, 'Bb'], [34, 36, 'F'], [36, 38, 'C'], [38, 40, 'A'],
  [40, 42, 'Gm'], [42, 44, 'Eb'], [44, 46, 'Bb'], [46, 50, 'F'],
  [50, 52, 'Dm'], [52, 54, 'Bb'], [54, 56, 'C'], [56, 58, 'Dm'], [58, 60, 'Bb'], [60, 62, 'A'],
  [62, 64, 'Fmaj7'], [64, 66, 'Bbmaj7'], [66, 68, 'Gm7'], [68, 70, 'Csus'], [70, 72, 'C'],
  [72, 74, 'Dm'], [74, 76, 'Bb'], [76, 78, 'F'], [78, 80, 'C'], [80, 82, 'A'],
  [82, 83, 'Bb'], [83, 84, 'C'], [84, 85, 'Dadd9'],
];
const SILENCE_AT = 85.0, ENGINE_AT = 88.35;

export async function renderScore(duration = 90) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * duration), SR);
  const r = rng(2024);
  // ---------------------------------------------------------------- buses
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 2; comp.attack.value = 0.01; comp.release.value = 0.25;
  const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -3; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
  comp.connect(limiter); limiter.connect(master); master.connect(ctx.destination);
  const music = ctx.createGain(); const foley = ctx.createGain(); foley.gain.value = 0.8;
  // dynamic arc of the whole piece: intimate opening → orchestral climax at 82–85
  const ARC = [[0, 0.5], [8, 0.62], [18, 0.72], [30, 0.85], [40, 0.82], [46.6, 1.0], [50, 0.95], [62, 0.72], [72, 0.95], [80, 1.2], [82, 1.45], [85, 1.45]];
  music.gain.setValueAtTime(ARC[0][1], 0); for (const [t, v] of ARC.slice(1)) music.gain.linearRampToValueAtTime(v, t);
  // gate: everything except the final engine start falls silent at SILENCE_AT
  const gate = ctx.createGain(); gate.gain.setValueAtTime(1, 0); gate.gain.setValueAtTime(1, SILENCE_AT - 0.25); gate.gain.linearRampToValueAtTime(0, SILENCE_AT); gate.connect(comp);
  // convolution reverb (generated hall)
  const irLen = Math.floor(SR * 3.6); const ir = ctx.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < irLen; i++) { const t = i / SR; const n = r() * 2 - 1; const k = 0.35 + 0.6 * Math.exp(-t * 2.2); lp = lp + (n - lp) * k; d[i] = lp * Math.pow(1 - i / irLen, 2.2) * Math.exp(-t * 1.1) * (i < SR * 0.012 ? i / (SR * 0.012) : 1); } }
  const verb = ctx.createConvolver(); verb.buffer = ir; const verbIn = ctx.createGain(); verbIn.gain.value = 0.55; const verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(gate);
  const lowCut = ctx.createBiquadFilter(); lowCut.type = 'lowshelf'; lowCut.frequency.value = 140; lowCut.gain.value = -5;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 3500; air.gain.value = 3; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28;
  const dryM = ctx.createGain(); dryM.gain.value = 0.75; music.connect(hp); hp.connect(lowCut); lowCut.connect(air); air.connect(dryM); dryM.connect(gate); air.connect(verbIn);
  const dryF = ctx.createGain(); foley.connect(dryF); dryF.connect(gate); const fSend = ctx.createGain(); fSend.gain.value = 0.25; foley.connect(fSend); fSend.connect(verbIn);
  const engineBus = ctx.createGain(); engineBus.connect(comp); const engVerb = ctx.createGain(); engVerb.gain.value = 0.12; engineBus.connect(engVerb); engVerb.connect(verb); // tail of the last sound only
  // a second, ungated reverb path just for the engine start
  const verb2 = ctx.createConvolver(); verb2.buffer = ir; engVerb.disconnect(); engVerb.connect(verb2); verb2.connect(comp);

  // white noise buffer
  const noiseBuf = ctx.createBuffer(1, SR * 2, SR); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  const noise = (t0, dur, out, { type = 'bandpass', f0 = 1000, f1 = null, q = 1, g = 0.3, a = 0.01, rel = 0.1, pan = 0 } = {}) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); f.Q.value = q;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(g, t0 + a); e.gain.setValueAtTime(g, Math.max(t0 + a, t0 + dur - rel)); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan; s.connect(f); f.connect(e); e.connect(p); p.connect(out); s.start(t0, r() * 1.5); s.stop(t0 + dur + 0.05); return { f, e, p };
  };
  const tone = (t0, dur, freq, out, { type = 'sine', g = 0.2, a = 0.005, decay = null, pan = 0, detune = 0, f1 = null } = {}) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); o.detune.value = detune;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(g, t0 + a);
    if (decay) e.gain.setTargetAtTime(0.0, t0 + a, decay); else { e.gain.setValueAtTime(g, Math.max(t0 + a, t0 + dur - 0.05)); e.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
    const p = ctx.createStereoPanner(); p.pan.value = pan; o.connect(e); e.connect(p); p.connect(out); o.start(t0); o.stop(t0 + dur + 0.02); return { o, e };
  };

  // ---------------------------------------------------------------- instruments
  const piano = ctx.createGain(); piano.gain.value = 0.8; piano.connect(music);
  const playPiano = (t, note, vel = 0.5, dur = 2.5, pan = 0) => {
    const f = midi(typeof note === 'string' ? N(note) : note); const B = 0.00035; const lowBoost = f < 300 ? 1.6 : 1;
    for (let n = 1; n <= 7; n++) {
      const fn = f * n * Math.sqrt(1 + B * n * n); if (fn > 9000) break; const amp = (vel * 0.22) / Math.pow(n, 1.35) * (n === 2 ? 1.2 : 1);
      tone(t, dur + 1.5, fn, piano, { g: amp, a: 0.003, decay: (1.6 * lowBoost) / (1 + n * 0.45), pan, detune: (n === 1 ? 1.5 : 0) });
    }
    noise(t, 0.04, piano, { type: 'bandpass', f0: Math.min(6000, f * 4), q: 1.5, g: vel * 0.03, a: 0.001, rel: 0.03, pan });
  };
  const strings = ctx.createGain(); strings.gain.value = 0.16; strings.connect(music);
  const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vibG = ctx.createGain(); vibG.gain.value = 4; vib.connect(vibG); vib.start(0);
  const pad = (t0, t1, notes, { g = 0.5, cutoff = 1400, attack = 1.2, release = 1.6, bright = 0 } = {}) => {
    for (const nm of notes) {
      const f = midi(typeof nm === 'string' ? N(nm) : nm); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff, t0); lp.frequency.linearRampToValueAtTime(cutoff * (1 + bright), t1); lp.Q.value = 0.5;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(g / notes.length, t0 + attack); e.gain.setValueAtTime(g / notes.length, Math.max(t0 + attack, t1)); e.gain.linearRampToValueAtTime(0.0001, t1 + release);
      lp.connect(e); e.connect(strings);
      for (const d of [-8, 0, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d + (r() - 0.5) * 3; vibG.connect(o.detune); o.connect(lp); o.start(t0); o.stop(t1 + release + 0.05); }
    }
  };
  const brass = ctx.createGain(); brass.gain.value = 0.12; brass.connect(music);
  const horn = (t0, t1, notes, g = 0.5) => {
    for (const nm of notes) {
      const f = midi(N(nm)); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0); lp.frequency.linearRampToValueAtTime(2200, t0 + 0.25); lp.frequency.linearRampToValueAtTime(1500, t1); lp.Q.value = 1.2;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(g / notes.length, t0 + 0.12); e.gain.setValueAtTime(g / notes.length, t1 - 0.1); e.gain.linearRampToValueAtTime(0.0001, t1 + 0.6);
      lp.connect(e); e.connect(brass); for (const d of [-5, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; vibG.connect(o.detune); o.connect(lp); o.start(t0); o.stop(t1 + 0.7); }
    }
  };
  const perc = ctx.createGain(); perc.gain.value = 0.55; perc.connect(music);
  const timpani = (t, note = 'D2', g = 0.6) => { const f = midi(N(note)); tone(t, 1.8, f * 1.4, perc, { g, a: 0.003, decay: 0.55, f1: f }); tone(t, 1.6, f * 2.7, perc, { g: g * 0.25, a: 0.003, decay: 0.3 }); noise(t, 0.25, perc, { type: 'lowpass', f0: 500, g: g * 0.25, a: 0.002, rel: 0.2 }); };
  const kick = (t, g = 0.55) => { tone(t, 0.5, 120, perc, { g, a: 0.002, decay: 0.12, f1: 42 }); noise(t, 0.03, perc, { type: 'highpass', f0: 3000, g: g * 0.08, a: 0.001, rel: 0.02 }); };
  const crash = (t, g = 0.18, dur = 3) => noise(t, dur, perc, { type: 'highpass', f0: 5000, g, a: 0.005, rel: dur * 0.9 });
  const swell = (t0, t1, g = 0.16) => { const n = noise(t0, t1 - t0 + 0.05, perc, { type: 'highpass', f0: 3000, f1: 8000, g, a: t1 - t0 - 0.05, rel: 0.05 }); };
  const ost = (t0, t1, note, step = 0.25, g = 0.2) => { for (let t = t0; t < t1 - 0.01; t += step) { const f = midi(N(note)); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + 0.01); e.gain.setTargetAtTime(0.0001, t + 0.02, 0.06); lp.connect(e); e.connect(strings); for (const d of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + 0.3); } } };
  const sub = ctx.createGain(); sub.gain.value = 0.16; sub.connect(music);

  // ---------------------------------------------------------------- foley helpers
  const click = (t, g = 0.2, pan = 0, f = 3200) => { for (const m of [1, 1.57, 2.31]) tone(t, 0.09, f * m, foley, { g: g / m, a: 0.0008, decay: 0.012, pan }); noise(t, 0.02, foley, { type: 'highpass', f0: 4000, g: g * 0.4, a: 0.0005, rel: 0.015, pan }); };
  const clunk = (t, g = 0.5, pan = 0) => { tone(t, 0.6, 90, foley, { g, a: 0.002, decay: 0.09, f1: 55, pan }); noise(t, 0.2, foley, { type: 'lowpass', f0: 600, g: g * 0.5, a: 0.001, rel: 0.15, pan }); click(t + 0.003, g * 0.3, pan, 1800); };
  const whoosh = (t, dur = 0.6, g = 0.25, up = true, pan = 0) => noise(t, dur, foley, { type: 'bandpass', f0: up ? 250 : 3500, f1: up ? 3500 : 250, q: 1.4, g, a: dur * 0.6, rel: dur * 0.4, pan });
  const ratchet = (t0, t1, rate = 22, g = 0.12, pan = 0) => { for (let t = t0; t < t1; t += 1 / rate) click(t, g * (0.7 + r() * 0.3), pan, 2600 + r() * 600); };
  const chime = (t, g = 0.22, pan = 0) => { for (const [f, d] of [[1876, 2.6], [2961, 1.9], [4410, 1.4], [6150, 0.9], [1882, 2.6]]) tone(t, d + 0.3, f, foley, { g: g * (f > 4000 ? 0.4 : 1) / 2, a: 0.001, decay: d / 4, pan }); };
  const creak = (t0, t1, g = 0.12, pan = 0) => { let t = t0; while (t < t1) { const d = 0.02 + r() * 0.05; noise(t, d, foley, { type: 'bandpass', f0: 700 + r() * 700, q: 9, g: g * (0.4 + r() * 0.6), a: d * 0.3, rel: d * 0.6, pan }); t += d * (0.6 + r() * 1.5); } };
  const hum = (t0, t1, f = 140, g = 0.06, pan = 0) => { for (const [m, a] of [[1, 1], [2, 0.6], [3, 0.3]]) { const o = tone(t0, t1 - t0, f * m, foley, { type: 'sawtooth', g: g * a, a: 0.15, pan }); } noise(t0, t1 - t0, foley, { type: 'bandpass', f0: 1800, q: 2, g: g * 0.6, a: 0.15, rel: 0.2, pan }); };
  const crackle = (t0, t1, density = 60, g = 0.15, pan = 0, hp = 2500) => { const n = Math.floor((t1 - t0) * density); for (let i = 0; i < n; i++) { const t = t0 + r() * (t1 - t0); noise(t, 0.004 + r() * 0.01, foley, { type: 'highpass', f0: hp + r() * 2000, g: g * r(), a: 0.0005, rel: 0.004, pan: pan + (r() - 0.5) * 0.4 }); } };
  const engine = (t0, t1, rpmFn, g = 0.18, out = foley, panFn = null) => {
    const steps = Math.ceil((t1 - t0) * 30); const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; const e = ctx.createGain(); e.gain.value = 0; const p = ctx.createStereoPanner();
    const am = ctx.createGain(); const lope = ctx.createOscillator(); lope.type = 'triangle'; const lopeG = ctx.createGain(); lopeG.gain.value = 0.35; lope.connect(lopeG); lopeG.connect(am.gain); am.gain.value = 0.65;
    o1.connect(lp); o2.connect(lp); const o3g = ctx.createGain(); o3g.gain.value = 0.3; o3.connect(o3g); o3g.connect(lp); lp.connect(am); am.connect(e); e.connect(p); p.connect(out);
    for (let i = 0; i <= steps; i++) {
      const t = t0 + (i / steps) * (t1 - t0); const { rpm, gain } = rpmFn(t); const fire = (rpm / 60) * 4; const set = i === 0 ? 'setValueAtTime' : 'linearRampToValueAtTime';
      o1.frequency[set](fire, t); o2.frequency[set](fire * 0.5, t); o3.frequency[set](fire * 0.25, t); lope.frequency[set](rpm / 60 / 2, t); lp.frequency[set](220 + rpm * 0.32, t); e.gain[set](gain * g, t); if (panFn) p.pan[set](panFn(t), t);
    }
    e.gain.linearRampToValueAtTime(0, t1 + 0.03); for (const o of [o1, o2, o3, lope]) { o.start(t0); o.stop(t1 + 0.05); }
    noise(t0, t1 - t0, out, { type: 'lowpass', f0: 380, g: g * 0.35, a: 0.2, rel: 0.3 });
  };

  // ---------------------------------------------------------------- harmony: strings pads + sub
  for (const [a, b, ch] of PLAN) {
    if (a >= SILENCE_AT) continue; const notes = CH[ch];
    const sec = a < 8 ? 0 : a < 18 ? 1 : a < 30 ? 2 : a < 40 ? 3 : a < 50 ? 4 : a < 62 ? 5 : a < 72 ? 6 : a < 82 ? 7 : 8;
    const g = [0.35, 0.45, 0.55, 0.65, 0.6, 0.75, 0.6, 0.95, 1.25][sec]; const cut = [900, 1100, 1300, 1600, 1500, 2000, 1500, 2600, 3400][sec];
    if (a >= 4 || sec > 0) pad(a === 0 ? 4 : a, b, notes, { g, cutoff: cut, attack: a < 18 ? 1.4 : 0.6, release: 1.2, bright: 0.3 });
    if (sec >= 2) pad(a, b, notes.map((n) => N(n) + 12), { g: g * 0.35, cutoff: cut * 1.3, attack: 0.5, release: 1.0 });
    const root = N(notes[0]) - 12; tone(a, b - a + 0.6, midi(root), sub, { g: 0.5, a: 0.4 }); tone(a, b - a + 0.6, midi(root + 12), sub, { g: 0.12, a: 0.4 });
  }
  // engine-rumble bass layer (subtle, throughout the music)
  engine(0.0, SILENCE_AT, (t) => ({ rpm: 700 + (t > 50 && t < 62 ? 600 : 0) + Math.sin(t * 0.3) * 40, gain: 0.25 * (t < 5 ? t / 5 : 1) * (t > 82 ? 1.4 : 1) }), 0.055, music);

  // ---------------------------------------------------------------- piano writing
  const motif = [['D5', 0.9], ['A4', 2.6], ['F5', 4.3], ['E5', 5.9], ['D5', 7.0]];
  for (const [n, t] of motif) playPiano(t, n, 0.45, 3, 0.1);
  for (let t = 8; t < 18; t += 0.5) { const ch = PLAN.find(([a, b]) => t >= a && t < b)[2]; const notes = CH[ch].map(N).sort((a, b) => a - b); const i = Math.floor((t - 8) / 0.5) % 4; playPiano(t, notes[i] + 12, 0.32, 1.2, (i - 1.5) * 0.15); }
  const melodyA = [['A4', 18], ['D5', 19], ['F5', 20.5], ['E5', 22], ['C5', 23], ['D5', 24.5], ['A4', 26], ['F5', 27], ['E5', 28.5], ['D5', 29.5]];
  for (const [n, t] of melodyA) playPiano(t, n, 0.42, 2, 0.05);
  for (let t = 30; t < 40; t += 0.5) { const ch = PLAN.find(([a, b]) => t >= a && t < b)[2]; const notes = CH[ch].map(N); playPiano(t, notes[(Math.floor(t * 2) % 3) + 1] + 12, 0.28, 0.9, 0.2); }
  const melodyB = [['G4', 40.5], ['Bb4', 41.5], ['D5', 42.5], ['Eb5', 43.5], ['D5', 44.5], ['F5', 45.5], ['A5', 46.6], ['G5', 47.6], ['F5', 48.4], ['C5', 49.2]];
  for (const [n, t] of melodyB) playPiano(t, n, 0.5, 2.2, -0.05);
  const melodyC = [['A4', 62.2], ['C5', 63.0], ['E5', 63.8], ['F5', 64.6], ['D5', 65.4], ['A4', 66.2], ['Bb4', 67.0], ['D5', 67.8], ['G5', 68.6], ['F5', 69.4], ['E5', 70.2], ['C5', 71.0]];
  for (const [n, t] of melodyC) playPiano(t, n, 0.48, 2.2, 0.05);
  for (let t = 72; t < 82; t += 0.25) { const ch = PLAN.find(([a, b]) => t >= a && t < b)[2]; const notes = CH[ch].map(N); playPiano(t, notes[Math.floor(t * 4) % 4] + 12, 0.22, 0.6, (Math.floor(t * 4) % 4 - 1.5) * 0.2); }
  playPiano(82, 'D5', 0.6, 3); playPiano(83, 'E5', 0.6, 3); playPiano(84, 'F#5', 0.7, 3); playPiano(84, 'A5', 0.55, 3);

  // ---------------------------------------------------------------- rhythm + orchestral build
  ost(18, 30, 'D2', 0.5, 0.16); ost(30, 40, 'D2', 0.25, 0.14); ost(50, 62, 'D2', 0.25, 0.2); ost(72, 82, 'D2', 0.25, 0.22);
  for (let t = 24; t < 30; t += 2) kick(t, 0.35); for (let t = 30; t < 40; t += 1) kick(t, 0.4); for (let t = 50; t < 62; t += 0.5) kick(t, t % 1 ? 0.25 : 0.45); for (let t = 72; t < 82; t += 0.5) kick(t, t % 1 ? 0.3 : 0.5);
  for (const t of [30, 32, 34, 36, 38, 40, 46.6, 50, 56.6, 72, 74, 76, 78, 80]) timpani(t, t === 46.6 ? 'F2' : 'D2', 0.5);
  for (let t = 80; t < 82; t += 0.08) timpani(t, 'A1', 0.12 + (t - 80) * 0.12);
  swell(37.6, 40.0, 0.12); swell(44.8, 46.6, 0.1); swell(79.6, 82.0, 0.18);
  crash(40.0, 0.12); crash(46.6, 0.14, 3.5); crash(50.0, 0.1); crash(72.0, 0.12); crash(82.0, 0.22, 3);
  horn(46.6, 50.0, ['F3', 'A3', 'C4'], 0.5); horn(72, 74, ['D3', 'F3', 'A3'], 0.5); horn(74, 76, ['Bb2', 'F3', 'D4'], 0.55); horn(76, 78, ['F3', 'A3', 'C4'], 0.6); horn(78, 80, ['C3', 'G3', 'E4'], 0.65); horn(80, 82, ['A2', 'E3', 'C#4'], 0.7);
  horn(82, 83, ['Bb2', 'F3', 'D4'], 0.85); horn(83, 84, ['C3', 'G3', 'E4'], 0.9); horn(84, 85.0, ['D3', 'A3', 'F#4'], 1.0);
  // gold-particle shimmer
  for (let i = 0; i < 70; i++) { const t = 82 + r() * 3; tone(t, 0.8, 1800 + r() * 4200, music, { g: 0.025, a: 0.002, decay: 0.15, pan: r() * 2 - 1 }); }

  // ---------------------------------------------------------------- foley (picture-locked)
  // S1 spark: pre-flicker, arc crackle + buzz, ignition thump, whooshes
  crackle(0.52, 0.62, 200, 0.25, 0.1); crackle(0.68, 1.4, 260, 0.32, 0.05); tone(0.68, 0.7, 118, foley, { type: 'sawtooth', g: 0.05, a: 0.01, pan: 0.05 });
  noise(1.0, 1.6, foley, { type: 'lowpass', f0: 200, f1: 1800, g: 0.25, a: 1.2, rel: 0.3 }); clunk(1.05, 0.35);
  whoosh(2.25, 0.6, 0.22, true); whoosh(4.4, 0.6, 0.2, true, -0.3); whoosh(5.5, 0.55, 0.3, false, 0.2);
  engine(5.6, 8.4, (t) => ({ rpm: 800, gain: Math.min(1, (t - 5.6) / 0.8) * (1 - Math.max(0, (t - 7.6) / 0.8)) }), 0.22);
  // S2 anatomy: metallic ticks as parts separate, harness swish, reassembly whoosh + clunk
  for (let i = 0; i < 26; i++) click(8.7 + r() * 2.6, 0.08 + r() * 0.06, r() * 2 - 1, 2400 + r() * 2400);
  whoosh(12.05, 0.5, 0.18); ratchet(12.4, 12.9, 6, 0.05); whoosh(13.15, 0.35, 0.15, false); whoosh(13.62, 0.3, 0.15, true);
  creak(13.8, 14.3, 0.08); whoosh(14.3, 1.6, 0.22, false, 0.3); for (let i = 0; i < 14; i++) click(14.6 + i * 0.09, 0.12, (i / 7 - 1) * 0.6, 2200); clunk(16.0, 0.6);
  // S3 atelier: glove on paint, torque ratchet + click, polisher, gauge, brush
  creak(18.1, 18.9, 0.09, -0.2); ratchet(19.1, 19.62, 24, 0.12, 0.1); click(19.65, 0.45, 0.1, 2000); clunk(19.66, 0.18, 0.1);
  hum(20.0, 20.9, 140, 0.05, -0.1); click(20.95, 0.1, 0.2, 3800); for (let i = 0; i < 5; i++) click(21.1 + i * 0.05, 0.03, 0.2, 5200);
  noise(21.7, 1.3, foley, { type: 'bandpass', f0: 2200, q: 3, g: 0.05, a: 0.3, rel: 0.4, pan: -0.1 });
  for (let t = 23.4; t < 30; t += 0.5 + r() * 0.6) { const k = r(); if (k < 0.35) ratchet(t, t + 0.25, 20, 0.05, r() - 0.5); else if (k < 0.6) click(t, 0.07, r() - 0.5); else creak(t, t + 0.3, 0.04, r() - 0.5); }
  hum(23.5, 29.8, 150, 0.018, -0.4);
  // S4 collection: oil drop, needle, badge shimmer, leather, FPV whooshes + pass-bys
  tone(30.55, 0.25, 900, foley, { g: 0.1, a: 0.002, decay: 0.05, f1: 1500 }); tone(31.05, 1.0, 300, foley, { type: 'triangle', g: 0.04, a: 0.05, f1: 1200 });
  chime(32.0, 0.08, 0.2); creak(32.8, 33.6, 0.07); whoosh(33.5, 0.9, 0.25, true);
  engine(33.6, 37.4, (t) => ({ rpm: 1400 + Math.sin((t - 33.6) * 1.2) * 500, gain: 0.5 }), 0.1, foley, (t) => Math.sin(t * 0.9) * 0.6);
  whoosh(34.6, 0.8, 0.18, false, -0.6); whoosh(35.9, 0.8, 0.18, false, 0.6); whoosh(37.4, 2.4, 0.26, true);
  // S5 paddock: vault gears + bolts, hygrometer tick, silk cover, ambience
  ratchet(40.0, 41.1, 14, 0.07, 0); for (const t of [40.55, 40.62, 40.69, 40.76, 40.83, 40.9, 40.97, 41.04]) clunk(t, 0.12, (r() - 0.5) * 0.6);
  click(41.3, 0.08, 0.1, 4200); click(41.5, 0.05, 0.1, 4200);
  noise(42.2, 2.4, foley, { type: 'bandpass', f0: 1200, f1: 3000, q: 0.8, g: 0.12, a: 1.0, rel: 1.0, pan: -0.2 }); noise(42.6, 1.6, foley, { type: 'highpass', f0: 5000, g: 0.03, a: 0.6, rel: 0.6 });
  noise(44.0, 6.0, foley, { type: 'lowpass', f0: 300, g: 0.04, a: 1.0, rel: 2.0 });
  // S6 road: tyre on wet asphalt, brake sizzle, gearshift, helmet wind, convoy, aerial wind, circuit pass + sparks
  noise(50.0, 0.95, foley, { type: 'bandpass', f0: 900, q: 0.6, g: 0.18, a: 0.1, rel: 0.2 }); crackle(50.1, 50.8, 120, 0.06, 0, 6000);
  noise(50.9, 0.8, foley, { type: 'highpass', f0: 4500, g: 0.08, a: 0.2, rel: 0.2 }); tone(50.9, 0.8, 60, foley, { g: 0.1, a: 0.1 });
  click(51.88, 0.25, 0.2, 1500); clunk(51.9, 0.3, 0.2); noise(52.5, 0.95, foley, { type: 'bandpass', f0: 600, f1: 1400, q: 0.5, g: 0.14, a: 0.3, rel: 0.4 });
  engine(53.3, 59.5, (t) => ({ rpm: 2600 + Math.sin(t * 1.4) * 600, gain: 0.8 }), 0.14, foley, (t) => Math.sin(t * 0.7) * 0.4); noise(53.3, 6.2, foley, { type: 'lowpass', f0: 700, g: 0.07, a: 0.5, rel: 0.5 });
  noise(56.6, 2.9, foley, { type: 'bandpass', f0: 400, f1: 900, q: 0.4, g: 0.1, a: 0.8, rel: 1.0 });
  engine(59.3, 62.0, (t) => { const x = (t - 60.6); return { rpm: 4200 - x * 900, gain: Math.exp(-x * x * 0.9) }; }, 0.3, foley, (t) => Math.max(-1, Math.min(1, (t - 60.6) * 0.8)));
  crackle(59.7, 61.8, 220, 0.12, 0.2, 3500);
  // S7 club: crystal clink, card slide, watch ticks, handshake, fire
  chime(62.55, 0.3, 0.05); noise(63.0, 0.9, foley, { type: 'bandpass', f0: 2500, q: 1.5, g: 0.05, a: 0.1, rel: 0.4, pan: -0.2 }); click(63.95, 0.06, -0.2, 2600);
  for (let t = 64.0; t < 65.0; t += 0.125) click(t, 0.035, 0.15, 5500); creak(65.3, 65.8, 0.05, 0.1);
  crackle(66.0, 72.0, 18, 0.06, -0.5, 1200); noise(66.0, 6.0, foley, { type: 'lowpass', f0: 500, g: 0.03, a: 1.0, rel: 1.0, pan: -0.4 });
  // S8 service: key on velvet, carrier door seal, flag, platform hum, wax seal press
  click(72.84, 0.18, 0.1, 3000); click(72.9, 0.08, 0.1, 4200); clunk(74.55, 0.45, -0.2); noise(74.5, 0.3, foley, { type: 'lowpass', f0: 250, g: 0.2, a: 0.01, rel: 0.25 });
  { const f = noise(75.8, 2.0, foley, { type: 'bandpass', f0: 900, q: 0.7, g: 0.08, a: 0.2, rel: 0.4, pan: 0.3 }); const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(f.e.gain); lfo.start(75.8); lfo.stop(77.9); }
  hum(77.8, 79.8, 55, 0.03, 0); clunk(80.32, 0.35, 0); noise(80.3, 0.5, foley, { type: 'lowpass', f0: 700, g: 0.12, a: 0.02, rel: 0.4 });
  whoosh(81.4, 0.8, 0.2, true);

  // ---------------------------------------------------------------- the single engine start (after the silence)
  const T = ENGINE_AT;
  { // starter motor cranking
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(260, T); o.frequency.linearRampToValueAtTime(300, T + 0.7);
    const am = ctx.createGain(); const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2; const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, T); e.gain.linearRampToValueAtTime(0.16, T + 0.03); e.gain.setValueAtTime(0.16, T + 0.62); e.gain.linearRampToValueAtTime(0.0001, T + 0.78);
    o.connect(bp); bp.connect(am); am.connect(e); e.connect(engineBus); o.start(T); o.stop(T + 0.8); lfo.start(T); lfo.stop(T + 0.8);
    for (let t = T; t < T + 0.7; t += 1 / 11) tone(t, 0.12, 70, engineBus, { g: 0.18, a: 0.004, decay: 0.03, f1: 45 });
  }
  engine(T + 0.62, duration, (t) => { const x = t - (T + 0.62); const rpm = x < 0.25 ? 500 + x / 0.25 * 2700 : x < 0.9 ? 3200 - (x - 0.25) / 0.65 * 2300 : 900 + Math.sin(x * 9) * 30; return { rpm, gain: Math.min(1, x / 0.05) * (x < 0.4 ? 1.25 : 0.85) }; }, 0.42, engineBus);
  clunk(T + 0.62, 0.5); noise(T + 0.62, 0.35, engineBus, { type: 'lowpass', f0: 900, g: 0.25, a: 0.01, rel: 0.3 });

  return ctx.startRendering();
}
