// Film runtime: owns the renderer, evaluates the shot list at an absolute time, composites
// transitions and grades the frame. Pure function of time → deterministic offline renders.
import * as THREE from 'three';
import { Pipeline, TRANSITIONS } from './engine/pipeline.js';
import { initMaterials } from './engine/materials.js';
import { Titles } from './engine/titles.js';
import { lerp, clamp, smooth } from './engine/util.js';

export const GRADE_DEFAULT = {
  exposure: 1, bloom: 0.55, streak: 0.22, vignette: 0.55, grain: 0.035, ca: 0.45, saturation: 1, contrast: 1.04,
  halation: 0.14, lift: [0.0, 0.0, 0.0], gain: [1, 1, 1], threshold: 1.1, fade: 0, streakTint: [1.0, 0.8, 0.55],
};

function mixGrade(a, b, k) {
  const o = {}; for (const key of Object.keys(GRADE_DEFAULT)) {
    const x = a[key], y = b[key]; o[key] = Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], k)) : lerp(x, y, k);
  } return o;
}

export class Film {
  constructor(canvas, width, height) {
    this.w = width; this.h = height;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false);
    this.renderer.toneMapping = THREE.NoToneMapping; this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = false; this.renderer.info.autoReset = true;
    initMaterials(this.renderer);
    this.pipe = new Pipeline(this.renderer, width, height);
    this.shots = []; this.duration = 90; this.fps = 24;
  }

  async init(buildTimeline, onProgress = () => {}) {
    const tl = await buildTimeline({ renderer: this.renderer, aspect: this.w / this.h, res: this.h / 1080, onProgress });
    this.shots = tl.shots.sort((a, b) => a.start - b.start); this.duration = tl.duration; this.titles = new Titles(this.w, this.h, tl.titles);
    for (const s of this.shots) { s.camera ??= new THREE.PerspectiveCamera(35, this.w / this.h, 0.05, 400); s.camera.aspect = this.w / this.h; s.camera.updateProjectionMatrix(); s.grade = { ...GRADE_DEFAULT, ...(s.grade || {}) }; s.trans = { type: 'dissolve', dur: 0.4, ...(s.trans || {}) }; }
    this.fadeIn = tl.fadeIn ?? 0.6; this.fadeOutStart = tl.fadeOutStart ?? this.duration - 0.6;
    // warm-up: compile every set's shaders once
    for (const s of this.shots) { this._prepare(s, s.start + 0.01); this.renderer.compile(s.set.scene, s.camera); }
  }

  _prepare(shot, t) {
    const lt = t - shot.start, u = lt / (shot.end - shot.start);
    shot.set.update?.(t, shot, lt, u);
    shot.prep?.(lt, u, t);
    const dof = shot.cam(lt, u, shot.camera, t) || {};
    return dof;
  }

  /** Which shot(s) are visible at t. */
  locate(t) {
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i]; const d = s.trans.dur; const a = s.trans.align ?? 0.5;
      if (i > 0 && d > 0 && t >= s.start - d * a && t < s.start + d * (1 - a)) return { A: this.shots[i - 1], B: s, p: (t - (s.start - d * a)) / d };
    }
    let cur = this.shots[0]; for (const s of this.shots) if (t >= s.start) cur = s; return { A: cur, B: null, p: 0 };
  }

  renderAt(t) {
    t = clamp(t, 0, this.duration); const prof = this.profile; const gl = this.renderer.getContext(); let t0 = performance.now(); const px = new Uint8Array(4); const mark = (k) => { if (!prof) return; const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); const n = performance.now(); prof[k] = (prof[k] || 0) + n - t0; t0 = n; };
    mark('start'); const { A, B, p } = this.locate(t);
    const dofA = this._prepare(A, t); mark('prepare'); const texA = this.pipe.renderShot(0, A.set.scene, A.camera, dofA, mark);
    let src, grade = A.grade;
    if (B) {
      const dofB = this._prepare(B, t); const texB = this.pipe.renderShot(1, B.set.scene, B.camera, dofB);
      const mode = TRANSITIONS[B.trans.type] ?? 1; const q = B.trans.ease === false ? p : smooth(p);
      src = this.pipe.composite(texA, texB, mode, q, B.trans); grade = mixGrade(A.grade, B.grade, smooth(p));
    } else src = this.pipe.composite(texA, null, 0, 0);
    const g = { ...grade, time: t };
    g.fade = Math.max(g.fade, 1 - smooth(t / this.fadeIn), smooth((t - this.fadeOutStart) / 0.5));
    const title = this.titles.update(t); mark('titles');
    this.pipe.grade(src, g, title?.tex, title?.on ?? 0); mark('grade');
    return { shot: B && p > 0.5 ? B.name : A.name };
  }
}
