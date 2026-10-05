// HDR post pipeline:  shot render (MSAA, depth) → depth-of-field → transition composite →
// bloom + anamorphic streak → film grade (ACES, grain, vignette, CA, halation, titles) → screen.
import * as THREE from 'three';

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

class FSPass {
  constructor(frag, uniforms = {}, defines = {}) {
    this.mat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  get u() { return this.mat.uniforms; }
  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.scene, this.cam); }
}

const hdr = (w, h, extra = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...extra });

// ---------------------------------------------------------------------------------------------
const DOF_COC = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform float near, far, focus, aperture, maxCoc; varying vec2 vUv;
float linDepth(float d){ float z = d*2.-1.; return 2.*near*far/(far+near - z*(far-near)); }
void main(){ float d = linDepth(texture2D(tDepth, vUv).x); float coc = aperture * (1. - focus/d);
  coc = clamp(coc, -maxCoc, maxCoc); vec3 c = min(texture2D(tColor, vUv).rgb, vec3(800.)); gl_FragColor = vec4(c, coc); }`;

// Single pass "scatter-as-gather" bokeh (golden-angle spiral) at half resolution; .a = signed CoC in px (half-res).
const DOF_BLUR = `
uniform sampler2D tCoc; uniform vec2 texel; uniform float maxCoc; varying vec2 vUv;
const float GOLDEN = 2.39996323;
void main(){
  vec4 cs = texture2D(tCoc, vUv); float cc = abs(cs.a); vec3 col = cs.rgb; float tot = 1.;
  float radius = 0.6;
  for (int i = 0; i < 64; i++) {
    if (radius > maxCoc) break;
    float ang = float(i) * GOLDEN; vec2 tc = vUv + vec2(cos(ang), sin(ang)) * texel * radius;
    vec4 s = texture2D(tCoc, tc); float sc = abs(s.a);
    if (s.a > cs.a) sc = clamp(sc, 0., cc * 2.); // background samples cannot bleed over sharper foreground
    float m = smoothstep(radius - 0.5, radius + 0.5, sc);
    vec3 sCol = s.rgb; float lum = dot(sCol, vec3(0.299,0.587,0.114)); sCol *= 1. + smoothstep(1.2, 6., lum) * 0.6; // bokeh highlights pop
    col += mix(col / tot, sCol, m); tot += 1.; radius += 1.25 / radius;
  }
  gl_FragColor = vec4(col / tot, cs.a);
}`;

const DOF_MERGE = `
uniform sampler2D tSharp; uniform sampler2D tBlur; uniform sampler2D tCoc; varying vec2 vUv;
void main(){ vec3 s = min(texture2D(tSharp, vUv).rgb, vec3(800.)); vec4 b = texture2D(tBlur, vUv); float coc = abs(texture2D(tCoc, vUv).a);
  float k = smoothstep(0.35, 1.6, max(coc, abs(b.a))); gl_FragColor = vec4(mix(s, b.rgb, k), 1.); }`;

// ---------------------------------------------------------------------------------------------
const TRANSITION = `
uniform sampler2D tA; uniform sampler2D tB; uniform float p; uniform int mode; uniform vec2 center; uniform vec2 dir; uniform float aspect; uniform float seed; varying vec2 vUv;
float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 zoomBlur(sampler2D t, vec2 uv, vec2 c, float amt){ vec3 s = vec3(0.); for (int i = 0; i < 12; i++){ float k = float(i)/11.; s += texture2D(t, c + (uv-c)*(1. - amt*k)).rgb; } return s/12.; }
vec3 dirBlur(sampler2D t, vec2 uv, vec2 d, float amt){ vec3 s = vec3(0.); for (int i = 0; i < 12; i++){ float k = float(i)/11. - 0.5; s += texture2D(t, uv + d*amt*k).rgb; } return s/12.; }
void main(){
  vec2 uv = vUv; vec3 a, b; float q = p;
  if (mode == 0) { gl_FragColor = vec4(q < 0.5 ? texture2D(tA, uv).rgb : texture2D(tB, uv).rgb, 1.); return; }
  if (mode == 1) { a = texture2D(tA, uv).rgb; b = texture2D(tB, uv).rgb; gl_FragColor = vec4(mix(a, b, smoothstep(0.,1.,q)), 1.); return; }
  if (mode == 2) { // flash: burn A to white-gold, emerge B
    float e = exp(-pow((q - 0.5) * 4.2, 2.)); a = texture2D(tA, uv).rgb; b = texture2D(tB, uv).rgb;
    vec3 c = mix(a, b, smoothstep(0.42, 0.58, q)); c = c * (1. + e * 2.5) + vec3(1.0, 0.82, 0.55) * e * 1.1; gl_FragColor = vec4(c, 1.); return; }
  if (mode == 3) { // zoom: push into A's centre, B arrives from the same point
    vec2 c = center; float s = smoothstep(0., 1., q);
    vec2 ua = c + (uv - c) / (1. + s * s * 6.); vec2 ub = c + (uv - c) * (1. + (1.-s) * (1.-s) * 0.6);
    a = zoomBlur(tA, ua, c, 0.25 * sin(s*3.1416)); b = zoomBlur(tB, ub, c, 0.25 * sin(s*3.1416));
    gl_FragColor = vec4(mix(a, b, smoothstep(0.35, 0.7, q)), 1.); return; }
  if (mode == 4) { // whip pan
    float s = smoothstep(0., 1., q); vec2 d = normalize(dir) * vec2(1., aspect);
    float blur = sin(s * 3.1416) * 0.35; vec2 off = d * s * 0.6;
    a = dirBlur(tA, uv + off, d, blur); b = dirBlur(tB, uv + off - d * 0.6, d, blur);
    gl_FragColor = vec4(mix(a, b, smoothstep(0.4, 0.6, q)), 1.); return; }
  if (mode == 5) { // luma match: B's bright areas emerge first (light shape match)
    a = texture2D(tA, uv).rgb; b = texture2D(tB, uv).rgb; float l = clamp(lum(b) / (1. + lum(b)), 0., 1.);
    float th = 1. - q * 1.6; float m = smoothstep(th - 0.25, th + 0.05, l + q * 0.6); gl_FragColor = vec4(mix(a, b, clamp(m, 0., 1.)), 1.); return; }
  if (mode == 6) { // iris: circular reveal from centre (wheel → dial)
    vec2 d = (uv - center) * vec2(aspect, 1.); float r = length(d); float R = q * q * 1.6;
    float m = 1. - smoothstep(R - 0.06, R + 0.01, r); a = texture2D(tA, uv).rgb; b = texture2D(tB, uv).rgb;
    float ring = exp(-pow((r - R) * 40., 2.)) * sin(q * 3.1416);
    gl_FragColor = vec4(mix(a, b, m) + vec3(1., 0.78, 0.45) * ring * 2.5, 1.); return; }
  if (mode == 7) { // dip through black
    a = texture2D(tA, uv).rgb; b = texture2D(tB, uv).rgb; float fa = 1. - smoothstep(0., 0.5, q), fb = smoothstep(0.5, 1., q);
    gl_FragColor = vec4(a * fa + b * fb, 1.); return; }
  if (mode == 8) { // particle dissolve: gold-edged noise burn
    a = texture2D(tA, uv).rgb; b = texture2D(tB, uv).rgb; float n = h(floor(uv * vec2(aspect, 1.) * 220.) + seed) * 0.35 + (1. - length((uv-center)*vec2(aspect,1.))) * 0.65;
    float th = 1.2 - q * 1.5; float m = smoothstep(th, th + 0.04, n); float edge = smoothstep(th - 0.04, th, n) - m;
    gl_FragColor = vec4(mix(a, b, m) + vec3(1., 0.75, 0.38) * max(edge, 0.) * 6., 1.); return; }
  gl_FragColor = vec4(texture2D(tB, uv).rgb, 1.);
}`;
export const TRANSITIONS = { cut: 0, dissolve: 1, flash: 2, zoom: 3, whip: 4, luma: 5, iris: 6, black: 7, burn: 8 };

// ---------------------------------------------------------------------------------------------
const PREFILTER = `
uniform sampler2D tSrc; uniform float threshold, knee; uniform vec2 texel; varying vec2 vUv;
void main(){ vec3 c = vec3(0.); c += texture2D(tSrc, vUv + texel*vec2(-1.,-1.)).rgb; c += texture2D(tSrc, vUv + texel*vec2(1.,-1.)).rgb; c += texture2D(tSrc, vUv + texel*vec2(-1.,1.)).rgb; c += texture2D(tSrc, vUv + texel*vec2(1.,1.)).rgb; c *= 0.25;
  c = min(c, vec3(60.)); float br = max(c.r, max(c.g, c.b)); float rq = clamp(br - threshold + knee, 0., 2.*knee); rq = rq*rq/(4.*knee + 1e-4);
  float w = max(rq, br - threshold) / max(br, 1e-4); gl_FragColor = vec4(c * w, 1.); }`;
const DOWN = `
uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
void main(){ vec2 t = texel; vec3 c = texture2D(tSrc, vUv).rgb * 0.125;
  c += (texture2D(tSrc, vUv + t*vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + t*vec2(1.,-1.)).rgb + texture2D(tSrc, vUv + t*vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + t*vec2(1.,1.)).rgb) * 0.125;
  c += (texture2D(tSrc, vUv + t*vec2(-2.,-2.)).rgb + texture2D(tSrc, vUv + t*vec2(2.,-2.)).rgb + texture2D(tSrc, vUv + t*vec2(-2.,2.)).rgb + texture2D(tSrc, vUv + t*vec2(2.,2.)).rgb) * 0.03125;
  c += (texture2D(tSrc, vUv + t*vec2(-2.,0.)).rgb + texture2D(tSrc, vUv + t*vec2(2.,0.)).rgb + texture2D(tSrc, vUv + t*vec2(0.,-2.)).rgb + texture2D(tSrc, vUv + t*vec2(0.,2.)).rgb) * 0.0625;
  gl_FragColor = vec4(c, 1.); }`;
const UP = `
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; uniform float radius; varying vec2 vUv;
void main(){ vec2 t = texel * radius; vec3 c = texture2D(tSrc, vUv).rgb * 4.;
  c += (texture2D(tSrc, vUv + t*vec2(-1.,0.)).rgb + texture2D(tSrc, vUv + t*vec2(1.,0.)).rgb + texture2D(tSrc, vUv + t*vec2(0.,-1.)).rgb + texture2D(tSrc, vUv + t*vec2(0.,1.)).rgb) * 2.;
  c += texture2D(tSrc, vUv + t*vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + t*vec2(1.,-1.)).rgb + texture2D(tSrc, vUv + t*vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + t*vec2(1.,1.)).rgb;
  gl_FragColor = vec4(c / 16. + texture2D(tBase, vUv).rgb, 1.); }`;
const STREAK = `
uniform sampler2D tSrc; uniform vec2 texel; uniform float stride; varying vec2 vUv;
void main(){ vec3 c = vec3(0.); float tw = 0.; for (int i = -6; i <= 6; i++){ float w = exp(-float(i*i)/18.); c += texture2D(tSrc, vUv + vec2(float(i)*stride*texel.x, 0.)).rgb * w; tw += w; } gl_FragColor = vec4(c/tw, 1.); }`;

const GRADE = `
uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tStreak; uniform sampler2D tText;
uniform float exposure, bloom, streak, vignette, grain, ca, fade, time, saturation, contrast, textOn, halation;
uniform vec3 lift, gain, streakTint; uniform vec2 res; varying vec2 vUv;
vec3 aces(vec3 x){ const mat3 i = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  const mat3 o = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  vec3 v = i * x; vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return clamp(o * (a/b), 0., 1.); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-0.055, step(0.0031308, c)); }
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec2 uv = vUv; vec2 d = uv - 0.5; float r2 = dot(d, d);
  vec2 caOff = d * ca * 0.006 * (0.3 + r2 * 2.);
  vec3 c = vec3(texture2D(tColor, uv - caOff).r, texture2D(tColor, uv).g, texture2D(tColor, uv + caOff).b);
  vec3 bl = texture2D(tBloom, uv).rgb; vec3 st = texture2D(tStreak, uv).rgb;
  c += bl * bloom + st * streak * streakTint;
  c += vec3(bl.r * 0.9, bl.g * 0.25, bl.b * 0.05) * halation; // film halation: warm-red glow around highlights
  c *= exposure;
  c = aces(c);
  // grade: lift/gain, contrast around mid-grey, saturation
  c = c * gain + lift * (1. - c);
  float l = dot(c, vec3(0.2126,0.7152,0.0722)); c = mix(vec3(l), c, saturation);
  c = clamp((c - 0.18) * contrast + 0.18, 0., 1.);
  c *= mix(1., smoothstep(0.95, 0.15, length(d * vec2(1.0, 0.85))), vignette);
  c = toSRGB(c);
  vec4 tx = texture2D(tText, vec2(uv.x, uv.y)); c = mix(c, tx.rgb, tx.a * textOn);
  float g = hash(vec3(uv * res, floor(time * 24.))) - 0.5; float lumi = dot(c, vec3(0.333));
  c += g * grain * (0.6 + 0.8 * (1. - lumi)) ;
  c *= (1. - fade);
  c += (hash(vec3(uv * res, 7.)) - 0.5) / 255.;
  gl_FragColor = vec4(c, 1.);
}`;

export class Pipeline {
  static MSAA = 4;
  constructor(renderer, w, h) {
    this.r = renderer; this.w = w; this.h = h;
    this.sceneRT = [0, 1].map(() => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Pipeline.MSAA, depthBuffer: true });
      rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType); return rt;
    });
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.cocRT = hdr(hw, hh); this.blurRT = hdr(hw, hh);
    this.dofRT = [hdr(w, h), hdr(w, h)];
    this.compRT = hdr(w, h);
    this.cocPass = new FSPass(DOF_COC, { tColor: { value: null }, tDepth: { value: null }, near: { value: 0.1 }, far: { value: 100 }, focus: { value: 5 }, aperture: { value: 0 }, maxCoc: { value: 16 } });
    this.blurPass = new FSPass(DOF_BLUR, { tCoc: { value: null }, texel: { value: new THREE.Vector2(1 / hw, 1 / hh) }, maxCoc: { value: 16 } });
    this.mergePass = new FSPass(DOF_MERGE, { tSharp: { value: null }, tBlur: { value: null }, tCoc: { value: null } });
    this.transPass = new FSPass(TRANSITION, { tA: { value: null }, tB: { value: null }, p: { value: 0 }, mode: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.5) }, dir: { value: new THREE.Vector2(1, 0) }, aspect: { value: w / h }, seed: { value: 0 } });
    this.copyPass = new FSPass('uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(min(texture2D(tSrc, vUv).rgb, vec3(800.)), 1.); }', { tSrc: { value: null } });
    // bloom chain
    this.mips = []; let mw = hw, mh = hh; for (let i = 0; i < 6; i++) { this.mips.push(hdr(mw, mh)); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
    this.upRT = this.mips.map((m) => hdr(m.width, m.height));
    this.prePass = new FSPass(PREFILTER, { tSrc: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.5 }, texel: { value: new THREE.Vector2(1 / w, 1 / h) } });
    this.downPass = new FSPass(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.upPass = new FSPass(UP, { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    // streak chain (quarter-width res, 1/8 height)
    const sw = Math.ceil(w / 4), sh = Math.ceil(h / 8); this.streakRT = [hdr(sw, sh), hdr(sw, sh)];
    this.streakPass = new FSPass(STREAK, { tSrc: { value: null }, texel: { value: new THREE.Vector2(1 / sw, 1 / sh) }, stride: { value: 1 } });
    this.empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.empty.needsUpdate = true;
    this.gradePass = new FSPass(GRADE, {
      tColor: { value: null }, tBloom: { value: null }, tStreak: { value: null }, tText: { value: this.empty },
      exposure: { value: 1 }, bloom: { value: 0.6 }, streak: { value: 0.4 }, vignette: { value: 0.5 }, grain: { value: 0.035 }, ca: { value: 0.6 }, fade: { value: 0 }, time: { value: 0 },
      saturation: { value: 1 }, contrast: { value: 1.05 }, textOn: { value: 0 }, halation: { value: 0.12 },
      lift: { value: new THREE.Vector3(0.0, 0.0, 0.0) }, gain: { value: new THREE.Vector3(1, 1, 1) }, streakTint: { value: new THREE.Vector3(1.0, 0.8, 0.55) }, res: { value: new THREE.Vector2(w, h) },
    });
  }

  /** Render a single shot (scene+camera+dof) into dofRT[slot]. */
  renderShot(slot, scene, camera, dof, mark = () => {}) {
    const r = this.r; const rt = this.sceneRT[slot];
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, camera); mark('scene');
    const ap = (dof?.aperture ?? 0) * this.h / 1080; // aperture expressed in px @1080p
    if (ap < 0.25) { this.copyPass.u.tSrc.value = rt.texture; this.copyPass.render(r, this.dofRT[slot]); return this.dofRT[slot].texture; }
    const maxC = Math.min(24, ap * 0.5 + 2); // half-res pixels
    Object.assign(this.cocPass.u, {});
    this.cocPass.u.tColor.value = rt.texture; this.cocPass.u.tDepth.value = rt.depthTexture;
    this.cocPass.u.near.value = camera.near; this.cocPass.u.far.value = camera.far; this.cocPass.u.focus.value = dof.focus; this.cocPass.u.aperture.value = ap * 0.5; this.cocPass.u.maxCoc.value = maxC;
    this.cocPass.render(r, this.cocRT);
    this.blurPass.u.tCoc.value = this.cocRT.texture; this.blurPass.u.maxCoc.value = maxC; this.blurPass.render(r, this.blurRT);
    this.mergePass.u.tSharp.value = rt.texture; this.mergePass.u.tBlur.value = this.blurRT.texture; this.mergePass.u.tCoc.value = this.cocRT.texture;
    this.mergePass.render(r, this.dofRT[slot]); mark('dof');
    return this.dofRT[slot].texture;
  }

  composite(texA, texB, mode, p, opts = {}) {
    const u = this.transPass.u; u.tA.value = texA; u.tB.value = texB ?? texA; u.mode.value = mode; u.p.value = p;
    if (opts.center) u.center.value.set(...opts.center); else u.center.value.set(0.5, 0.5);
    if (opts.dir) u.dir.value.set(...opts.dir); else u.dir.value.set(1, 0);
    u.seed.value = opts.seed ?? 0;
    this.transPass.render(this.r, this.compRT); return this.compRT.texture;
  }

  bloomChain(src, threshold = 1.0) {
    const r = this.r; this.prePass.u.tSrc.value = src; this.prePass.u.threshold.value = threshold; this.prePass.render(r, this.mips[0]);
    for (let i = 1; i < this.mips.length; i++) { const s = this.mips[i - 1]; this.downPass.u.tSrc.value = s.texture; this.downPass.u.texel.value.set(1 / s.width, 1 / s.height); this.downPass.render(r, this.mips[i]); }
    let cur = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) { this.upPass.u.tSrc.value = cur.texture; this.upPass.u.tBase.value = this.mips[i].texture; this.upPass.u.texel.value.set(1 / cur.width, 1 / cur.height); this.upPass.u.radius.value = 1.0; this.upPass.render(r, this.upRT[i]); cur = this.upRT[i]; }
    // anamorphic streak from the prefiltered highlights
    this.streakPass.u.tSrc.value = this.mips[1].texture; this.streakPass.u.stride.value = 1; this.streakPass.render(r, this.streakRT[0]);
    let a = 0; for (const stride of [3, 9, 27]) { this.streakPass.u.tSrc.value = this.streakRT[a].texture; this.streakPass.u.stride.value = stride; this.streakPass.render(r, this.streakRT[1 - a]); a = 1 - a; }
    return { bloom: this.upRT[0].texture, streak: this.streakRT[a].texture };
  }

  grade(src, g, textTex, textOn) {
    const { bloom, streak } = this.bloomChain(src, g.threshold ?? 1.0);
    const u = this.gradePass.u; u.tColor.value = src; u.tBloom.value = bloom; u.tStreak.value = streak; u.tText.value = textTex || this.empty; u.textOn.value = textTex ? textOn : 0;
    for (const k of ['exposure', 'bloom', 'streak', 'vignette', 'grain', 'ca', 'fade', 'time', 'saturation', 'contrast', 'halation']) if (g[k] !== undefined) u[k].value = g[k];
    if (g.lift) u.lift.value.set(...g.lift); if (g.gain) u.gain.value.set(...g.gain); if (g.streakTint) u.streakTint.value.set(...g.streakTint);
    this.gradePass.render(this.r, null);
  }
}
