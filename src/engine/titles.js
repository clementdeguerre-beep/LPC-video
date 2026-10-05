// On-screen typography: elegant serif, champagne gold on black, one line at a time (≤ 4 words).
import * as THREE from 'three';
import { FONT_SERIF } from './textures.js';
import { clamp, smooth, invLerp, easeOutCubic } from './util.js';

export class Titles {
  constructor(w, h, cues) {
    this.w = w; this.h = h; this.cues = cues;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h; this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.NoColorSpace; this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.last = '';
  }
  /** Returns { tex, on } or null if nothing on screen. */
  update(t) {
    const cue = this.cues.find((c) => t >= c.start && t <= c.end);
    if (!cue) { this.last = ''; return null; }
    const g = this.ctx, w = this.w, h = this.h, s = h / 1080; const lt = t - cue.start, dur = cue.end - cue.start;
    const fadeIn = cue.fadeIn ?? 1.1, fadeOut = cue.fadeOut ?? 0.9;
    const alpha = smooth(lt / fadeIn) * (1 - smooth((lt - (dur - fadeOut)) / fadeOut));
    const key = `${cue.text}|${alpha.toFixed(3)}|${lt.toFixed(2)}`; if (key === this.last) return { tex: this.tex, on: 1 }; this.last = key;
    g.clearRect(0, 0, w, h);
    const size = (cue.size ?? 54) * s; const y = (cue.y ?? 0.5) * h; const tracking0 = (cue.tracking ?? 0.32);
    const words = cue.words ? cue.text.split(' ') : [cue.text];
    g.textBaseline = 'middle'; g.font = `${cue.weight ?? 500} ${size}px ${FONT_SERIF}`;
    // letter-spacing eases from wide to settled; a soft blur resolves into focus
    const settle = cue.noSettle ? 1 : easeOutCubic(clamp(lt / (fadeIn * 2.2)));
    const tracking = (tracking0 + (1 - settle) * 0.25) * size;
    const measure = (str) => { let x = 0; for (const ch of str) x += g.measureText(ch).width + tracking; return x - tracking; };
    const full = words.join(' '); const totalW = measure(full); let x = w / 2 - totalW / 2;
    // soft black halo so the gold always reads "gold on black", whatever is behind it
    g.save(); g.globalAlpha = alpha * 0.55; const halo = g.createRadialGradient(w / 2, y, 0, w / 2, y, totalW * 0.75); halo.addColorStop(0, 'rgba(0,0,0,0.9)'); halo.addColorStop(0.6, 'rgba(0,0,0,0.5)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.translate(w / 2, y); g.scale(1, (size * 2.2) / (totalW * 0.75)); g.translate(-w / 2, -y); g.fillRect(0, y - totalW, w, totalW * 2); g.restore();
    const grd = g.createLinearGradient(0, y - size * 0.6, 0, y + size * 0.6);
    grd.addColorStop(0, '#f4e2b8'); grd.addColorStop(0.45, '#d9b273'); grd.addColorStop(0.55, '#c49a58'); grd.addColorStop(1, '#e9cf96');
    const sweep = clamp((lt - fadeIn * 0.8) / 1.6); // light sweep travelling across letters
    let idx = 0;
    words.forEach((word, wi) => {
      const wordDelay = cue.words ? wi * (cue.wordStep ?? 0.42) : 0; const wa = alpha * smooth((lt - wordDelay) / fadeIn);
      for (const ch of word + (wi < words.length - 1 ? ' ' : '')) {
        const cw = g.measureText(ch).width; const blur = (1 - smooth((lt - wordDelay) / (fadeIn * 1.2))) * 6 * s;
        g.save(); g.globalAlpha = wa; if (blur > 0.3) g.filter = `blur(${blur.toFixed(1)}px)`; g.fillStyle = grd; g.fillText(ch, x, y + (1 - settle) * 6 * s);
        const sx = (x - (w / 2 - totalW / 2)) / totalW; const sh = Math.exp(-(((sx - sweep * 1.4 + 0.2) / 0.08) ** 2)) * (sweep > 0 && sweep < 1 ? 1 : 0);
        if (sh > 0.01) { g.globalAlpha = wa * sh * 0.85; g.fillStyle = '#fff6df'; g.fillText(ch, x, y + (1 - settle) * 6 * s); }
        g.restore(); x += cw + tracking; idx++;
      }
    });
    if (cue.rule) { // hairline rules either side
      const rw = 90 * s * smooth(lt / (fadeIn * 1.5)); g.globalAlpha = alpha * 0.8; g.fillStyle = '#c9a463';
      g.fillRect(w / 2 - totalW / 2 - 40 * s - rw, y, rw, Math.max(1, s)); g.fillRect(w / 2 + totalW / 2 + 40 * s, y, rw, Math.max(1, s)); g.globalAlpha = 1;
    }
    this.tex.needsUpdate = true; return { tex: this.tex, on: 1 };
  }
}
