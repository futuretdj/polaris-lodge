import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const MOBILE = matchMedia('(max-width:860px)').matches || matchMedia('(hover:none)').matches;
// LOW = phones / weak devices: no bloom, fewer particles, cheaper sky, lower resolution
const LOW = MOBILE || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const HAS_MOUSE = matchMedia('(hover:hover)').matches;

/* ======================= renderer ======================= */
const canvas = $('#sky');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let DPR = LOW ? Math.min(devicePixelRatio, 1) * .8 : Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

/* ======================= sky (aurora over a forest) ======================= */
const skyScene = new THREE.Scene();
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const skyU = {
  uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(.5, .5) },
  uA: { value: new THREE.Color('#3cf0a0') }, uB: { value: new THREE.Color('#2a7bff') }, uC: { value: new THREE.Color('#c060ff') },
  uScroll: { value: 0 }, uPower: { value: 1 },
};
skyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: skyU, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: /* glsl */`
  precision highp float;
  #define OCT ${LOW ? 3 : 5}
  varying vec2 vUv;
  uniform float uTime, uScroll, uPower; uniform vec2 uRes, uMouse; uniform vec3 uA, uB, uC;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<OCT;i++){ v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v; }
  void main(){
    vec2 uv = vUv; float asp = uRes.x / uRes.y; vec2 p = vec2((uv.x - .5) * asp, uv.y);
    float t = uTime * .045;
    // night gradient
    vec3 col = mix(vec3(.004,.006,.018), vec3(.012,.022,.05), smoothstep(.15, 1., uv.y));
    // stars (pixel space, two layers)
    vec2 sp = gl_FragCoord.xy / 2.2;
    float s1 = hash(floor(sp)); float tw = .55 + .45 * sin(uTime * (1.5 + s1 * 4.) + s1 * 60.);
    float star = step(.9975, s1) * tw * smoothstep(.0, .9, fract(sp.x) * (1. - fract(sp.x)) * fract(sp.y) * (1. - fract(sp.y)) * 16.);
    // aurora curtains
    vec3 aur = vec3(0.);
    for(int i = 0; i < 3; i++){
      float fi = float(i);
      float x = p.x * (.75 + fi * .18) + fi * 2.3 - uScroll * .25;
      float base = .5 + fi * .07 + .16 * fbm(vec2(x * .7 + t * (1. + fi * .4), fi * 4.1)) + .05 * sin(x * 1.7 + t * 5.);
      float d = uv.y - base;
      float edge = smoothstep(-.012, .02, d);
      float body = exp(-max(d, 0.) * (3.2 + fi * 1.6));
      float rays = .35 + .65 * pow(fbm(vec2(x * 18. + t * 6., d * 1.2 - t)), 1.6) * 1.6;
      float fold = .6 + .4 * sin(x * 6. + fbm(vec2(x * 2., t * 3.)) * 6.);
      vec3 c = mix(uA, uB, smoothstep(.0, .35, d));
      c = mix(c, uC, smoothstep(.22, .5, d) * .8);
      aur += c * edge * body * rays * fold * (.46 - fi * .1);
    }
    aur *= uPower;
    // mouse: the sky brightens softly where you look
    float md = distance(vec2((uMouse.x - .5) * asp, uMouse.y), p);
    aur *= 1. + .22 * exp(-md * 3.5);
    col += aur;
    col += vec3(.85, .9, 1.) * star * (1. - clamp(length(aur) * 1.6, 0., 1.)) * smoothstep(.3, .55, uv.y);
    // sweeping light rays
    float ray = pow(max(0., sin((p.x * .9 - uv.y * .55) * 5. - uTime * .22)), 60.) + .6 * pow(max(0., sin((p.x * 1.4 + uv.y * .3) * 3. + uTime * .13)), 90.);
    col += ray * mix(uA, uC, .4) * .07 * smoothstep(.25, .9, uv.y);
    // hills + tree line with snow reflection
    float hx = p.x + uScroll * .08;
    float hill = .2 + .06 * fbm(vec2(hx * 1.1, 3.)) + .02 * sin(hx * 2.3);
    float cell = floor(hx * 46.); float fx = fract(hx * 46.);
    float has = step(.28, hash(vec2(cell, 7.)));
    float th = (.02 + .045 * hash(vec2(cell, 3.))) * has;
    float tree = hill + th * (1. - abs(fx - .5) * 2.) * step(.0, th);
    float far = .25 + .04 * fbm(vec2(hx * 2.2 + 9., 1.)) ;
    if(uv.y < far){ col = mix(col, vec3(.02,.03,.055) + aur * .12, .75); }
    if(uv.y < tree){
      float snow = smoothstep(hill - .09, hill - .005, uv.y) * .0;
      col = vec3(.006,.008,.016) + aur * .03;
      if(uv.y < hill - .005){
        // snow field reflecting the sky
        float g = smoothstep(.0, hill, uv.y);
        col = mix(vec3(.05,.065,.1), vec3(.11,.13,.19), g) + aur * (.55 * (1. - g) + .25) + snow;
        col *= .75 + .25 * noise(gl_FragCoord.xy * .7);
      }
    }
    // vignette
    vec2 q = vUv - .5; col *= 1. - dot(q, q) * .9;
    gl_FragColor = vec4(col, 1.);
  }`,
})));

/* ======================= particles that morph between shapes ======================= */
const N = LOW ? 9000 : 42000;
const ptsScene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(35, 1, .1, 100); cam.position.set(0, 0, 10);
const gauss = () => { let u = 0, v = 0; while(!u) u = Math.random(); while(!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const rot = (a, rx, rz) => { for(let i = 0; i < a.length; i += 3){ let x = a[i], y = a[i+1], z = a[i+2];
  let c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(rz); s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; a[i] = x; a[i+1] = y; a[i+2] = z; } return a; };
function galaxy(){ const a = new Float32Array(N * 3);
  for(let i = 0; i < N; i++){ let x, y, z;
    if(i < N * .16){ const r = Math.abs(gauss()) * .35; const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1); x = r * Math.sin(ph) * Math.cos(th); y = r * Math.cos(ph) * .6; z = r * Math.sin(ph) * Math.sin(th); }
    else { const arm = i % 3, r = Math.pow(Math.random(), .62) * 3.2 + .2, an = arm * 2.094 + r * 1.55 + gauss() * .28 / (r * .6 + .3);
      x = Math.cos(an) * r + gauss() * .06; z = Math.sin(an) * r + gauss() * .06; y = gauss() * .1 * (1 - r / 3.6); }
    a.set([x, y, z], i * 3); } return rot(a, 1.05, .35); }
function planet(){ const a = new Float32Array(N * 3);
  for(let i = 0; i < N; i++){ let x, y, z;
    if(i < N * .6){ const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), r = 1.32 + Math.random() * .03;
      x = r * Math.sin(ph) * Math.cos(th); y = r * Math.cos(ph); z = r * Math.sin(ph) * Math.sin(th);
      if(Math.random() < .35){ const band = Math.round(y * 6) / 6; y = band + gauss() * .015; const k = Math.sqrt(Math.max(0, r * r - y * y)); x = k * Math.cos(th); z = k * Math.sin(th); } }
    else { const r = 1.85 + Math.pow(Math.random(), 1.4) * .95, an = Math.random() * 6.283; x = Math.cos(an) * r; z = Math.sin(an) * r; y = gauss() * .015;
      if(r > 2.35 && r < 2.45) { x *= .2; z *= .2; y += 8; } }
    a.set([x, y, z], i * 3); } return rot(a, .32, .38); }
function curtain(){ const a = new Float32Array(N * 3);
  for(let i = 0; i < N; i++){ const x = (Math.random() - .5) * 11, h = Math.pow(Math.random(), 1.7) * 2.6;
    const y = .35 * Math.sin(x * .6) + .18 * Math.sin(x * 1.7 + 1) + h - 1;
    a.set([x + .18 * Math.sin(h * 3 + x), y, .9 * Math.sin(x * .8 + 1) + gauss() * .05 - .5], i * 3); } return a; }
function dome(){ const a = new Float32Array(N * 3);
  for(let i = 0; i < N; i++){ let x, y, z; const R = 1.75, r = Math.random();
    if(r < .7){ let th = Math.random() * 6.283, ph = Math.random() * 1.5708;
      if(r < .25) ph = Math.round(ph / .196) * .196 + gauss() * .004; else if(r < .5) th = Math.round(th / .3927) * .3927 + gauss() * .004;
      x = R * Math.sin(ph) * Math.cos(th); y = R * Math.cos(ph); z = R * Math.sin(ph) * Math.sin(th); }
    else if(r < .93){ const rr = R + Math.pow(Math.random(), 2) * 1.8, an = Math.random() * 6.283; x = Math.cos(an) * rr; z = Math.sin(an) * rr; y = gauss() * .02; }
    else { x = (Math.random() - .5) * 7; y = 2 + Math.random() * 2.2; z = (Math.random() - .5) * 3; }
    a.set([x, y - .8, z], i * 3); } return rot(a, .28, 0); }
function word(text){ const a = new Float32Array(N * 3), c = document.createElement('canvas'); c.width = 1400; c.height = 360;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = '800 230px Syne, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 700, 190);
  const d = g.getImageData(0, 0, 1400, 360).data, on = [];
  for(let y = 0; y < 360; y += 2) for(let x = 0; x < 1400; x += 2) if(d[(y * 1400 + x) * 4 + 3] > 128) on.push(x, y);
  for(let i = 0; i < N; i++){ const k = (Math.random() * (on.length / 2) | 0) * 2;
    a.set([(on[k] - 700) / 1400 * 7.2 + gauss() * .01, -(on[k+1] - 180) / 1400 * 7.2 + gauss() * .01, gauss() * .06], i * 3); } return a; }

const pGeo = new THREE.BufferGeometry();
const rnd = new Float32Array(N); for(let i = 0; i < N; i++) rnd[i] = Math.random();
pGeo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
const pU = { uTime: { value: 0 }, uMorph: { value: 0 }, uPix: { value: DPR }, uSize: { value: LOW ? 30 : 20 }, uOp: { value: 1 },
  uCA: { value: new THREE.Color('#a8ffd8') }, uCB: { value: new THREE.Color('#7fa8ff') } };
const pMat = new THREE.ShaderMaterial({ uniforms: pU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
  attribute vec3 p0; attribute vec3 p1; attribute vec3 p2; attribute vec3 p3; attribute vec3 p4; attribute float rnd;
  uniform float uTime, uMorph, uPix, uSize; varying float vR; varying float vA;
  vec3 pick(float k){ return k < .5 ? p0 : k < 1.5 ? p1 : k < 2.5 ? p2 : k < 3.5 ? p3 : p4; }
  void main(){
    float f = floor(uMorph), fr = uMorph - f;
    float d = smoothstep(0., 1., clamp((fr - rnd * .35) / .65, 0., 1.));
    vec3 a = pick(f), b = pick(min(f + 1., 4.));
    vec3 pos = mix(a, b, d);
    float burst = sin(d * 3.14159);
    pos += vec3(sin(rnd * 91. + uTime * .7), cos(rnd * 53. + uTime * .9), sin(rnd * 17. + uTime * .5)) * burst * (.9 + rnd * 1.2);
    pos += vec3(sin(uTime * .6 + pos.y * 2. + rnd * 6.), cos(uTime * .5 + pos.x * 2.), sin(uTime * .4 + pos.x)) * .025;
    vec4 mv = modelViewMatrix * vec4(pos, 1.);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (.35 + rnd * rnd * 1.4) * uPix / -mv.z;
    vR = rnd; vA = .55 + .45 * sin(uTime * (1. + rnd * 3.) + rnd * 40.);
  }`,
  fragmentShader: /* glsl */`
  uniform vec3 uCA, uCB; uniform float uOp; varying float vR; varying float vA;
  void main(){ vec2 c = gl_PointCoord - .5; float r = length(c); if(r > .5) discard;
    float core = exp(-r * r * 26.); vec3 col = mix(uCA, uCB, vR) * (.55 + core * 1.3) + core * .35;
    gl_FragColor = vec4(col, core * vA * uOp * ${LOW ? '1.25' : '.8'}); }`,
});
const cloud = new THREE.Points(pGeo, pMat); cloud.frustumCulled = false;
const group = new THREE.Group(); group.add(cloud); ptsScene.add(group);

/* ======================= post-processing: bloom ======================= */
let useBloom = !LOW, composer = null, bloom = null;
function makeComposer(){
  composer = new EffectComposer(renderer);
  const pass1 = new RenderPass(skyScene, orthoCam); composer.addPass(pass1);
  const pass2 = new RenderPass(ptsScene, cam); pass2.clear = false; pass2.clearDepth = true; composer.addPass(pass2);
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .55, .6, .5); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
if(useBloom) makeComposer();
function resize(){ const w = innerWidth, h = innerHeight; renderer.setPixelRatio(DPR); renderer.setSize(w, h, false); pU.uPix.value = DPR;
  if(composer){ composer.setPixelRatio(DPR); composer.setSize(w, h); bloom.resolution.set(w * DPR * .5, h * DPR * .5); }
  skyU.uRes.value.set(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); measure(); }
function draw(dt){
  if(useBloom) composer.render(dt);
  else { renderer.clear(); renderer.render(skyScene, orthoCam); renderer.clearDepth(); renderer.render(ptsScene, cam); }
}

/* ======================= scroll keyframes ======================= */
const C = s => new THREE.Color(s);
const KF = {
  hero:      { m: 0, op: 1,   x: 2.1,  y: .95, s: 1,   spin: .06, sky: ['#3cf0a0', '#2a7bff', '#c060ff'], pc: ['#b8ffe0', '#86a8ff'], pw: 1 },
  manifesto: { m: 1, op: .7, x: 4.0,  y: -.6,  s: .85, spin: .1,  sky: ['#45e6ff', '#3a4cff', '#9d6bff'], pc: ['#c6f6ff', '#9d8cff'], pw: .8 },
  dark:      { m: 1, op: 0,   x: 4.0,  y: -.6,  s: .85, spin: .1,  sky: ['#2ae08a', '#1e5aa0', '#ff6a9a'], pc: ['#c6f6ff', '#9d8cff'], pw: .5 },
  log:       { m: 2, op: .55, x: 0,    y: 1.9, s: 1,   spin: 0,   sky: ['#ff4fa3', '#6a4cff', '#3cf0b0'], pc: ['#ffc2e4', '#9bffd8'], pw: 1.1 },
  sauna:     { m: 2, op: 0,   x: 0,    y: 1.9, s: 1,   spin: 0,   sky: ['#ff9d4a', '#c43a6a', '#ffd27a'], pc: ['#ffd6a8', '#ff8fb0'], pw: .7 },
  rooms:     { m: 3, op: .5,  x: 3.4,  y: 2.0, s: .5, spin: .05, sky: ['#8fe8ff', '#4a6cff', '#e0f0ff'], pc: ['#e6fbff', '#8fb6ff'], pw: .85 },
  close:     { m: 4, op: .9, x: 2.3,  y: 2.08, s: .5, spin: 0,   sky: ['#3cf0a0', '#b05cff', '#ff7ab8'], pc: ['#c8ffe6', '#d6a8ff'], pw: 1.25 },
};
const MOBK = { hero: { x: 0, y: 1.65, s: .62 }, manifesto: { x: 0, y: 2.0, s: .45, op: .5 }, log: { y: 2.2, s: .7 }, rooms: { x: 0, y: 2.1, s: .5, op: .45 }, close: { x: 0, y: 2.3, s: .33, op: .3 } };
const secs = Object.keys(KF).map(id => ({ id, el: document.getElementById(id), k: { ...KF[id], ...(MOBILE ? MOBK[id] || {} : {}) } }));
secs.forEach(s => { s.k.skyC = s.k.sky.map(C); s.k.pcC = s.k.pc.map(C); });

function state(){
  const y = scrollY, vh = innerHeight;
  const holds = L.holds;
  let i = 0; while(i < secs.length - 1 && y > holds[i][1]) i++;
  let A = secs[Math.max(0, i - 1)].k, B = secs[i].k, t = 1;
  if(i > 0 && y < holds[i][0]){ t = ease(clamp((y - holds[i - 1][1]) / (holds[i][0] - holds[i - 1][1]))); }
  else { A = B; }
  return { A, B, t };
}
const cur = { m: 0, op: 0, x: 2.1, y: .95, s: .4, spin: .06, pw: 1 };
const tmp = new THREE.Color();

/* ======================= cached layout (never read layout inside the frame loop) ======================= */
const L = { holds: [], vh: innerHeight, docH: 1 };
function measure(){
  const vh = innerHeight; L.vh = vh;
  L.holds = secs.map(s => { const t = s.el.offsetTop, h = s.el.offsetHeight; return [t - vh * .15, t + Math.max(0, h - vh) - vh * .15]; });
  const g = id => { const e = document.getElementById(id); return [e.offsetTop, e.offsetHeight]; };
  [L.man, L.dark, L.log, L.sauna, L.hero] = ['manifesto', 'dark', 'log', 'sauna', 'hero'].map(g);
  L.trackW = document.getElementById('track') ? document.getElementById('track').scrollWidth : 0;
  L.docH = document.documentElement.scrollHeight;
}
addEventListener('resize', resize); resize();
new ResizeObserver(() => measure()).observe(document.body);
/* ======================= pointer & light ======================= */
let mx = innerWidth * .7, my = innerHeight * .3, smx = mx, smy = my, lastMove = 0;
const dot = $('#dot');
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; lastMove = performance.now(); });
document.querySelectorAll('a,button,.row,.card,select,input').forEach(el => { el.addEventListener('pointerenter', () => dot.classList.add('big')); el.addEventListener('pointerleave', () => dot.classList.remove('big')); });

/* hero long shadow */
const title = $('#title'), tsh = $('#tsh');
function heroLight(lx, ly){
  const r = title.getBoundingClientRect(); if(r.bottom < 0) return;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = cx - lx, dy = cy - ly; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const len = MOBILE ? 10 : 34, sh = [];
  sh.push(`${(-dx * 2).toFixed(1)}px ${(-dy * 2).toFixed(1)}px 26px rgba(138,245,192,.16)`);
  for(let k = 1; k <= len; k++) sh.push(`${(dx * k * 1.6).toFixed(1)}px ${(dy * k * 1.6).toFixed(1)}px 0 rgba(1,2,7,${(.5 * (1 - k / len)).toFixed(3)})`);
  tsh.style.textShadow = sh.join(',');
  title.style.setProperty('--lx', `${clamp((lx - r.left) / r.width, -.2, 1.2) * 100}%`);
  title.style.setProperty('--ly', `${clamp((ly - r.top) / r.height, -.5, 1.5) * 100}%`);
}

/* manifesto: words light up with scroll */
const mt = $('#mtext');
const hotWords = new Set(['four', 'hours', 'minus', 'twenty,', 'sky', 'starts', 'to', 'move.', 'knocks']);
mt.innerHTML = mt.textContent.split(' ').map((w, i) => `<span class="w${hotWords.has(w) && i > 6 ? ' h' : ''}">${w}</span>`).join(' ');
const words = [...mt.querySelectorAll('.w')];

/* flashlight */
const dark = $('#dark'), darkPh = $('#darkPh');
let fx = .5, fy = .5, ftx = .5, fty = .5, fr = 170;
dark.addEventListener('pointermove', e => { const r = dark.getBoundingClientRect(); ftx = (e.clientX - r.left) / r.width; fty = (e.clientY - r.top) / r.height; $('#hint').style.opacity = 0; });

/* horizontal log + card tilt */
const log = $('#log'), track = $('#track');
document.querySelectorAll('.card').forEach(c => {
  c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    c.style.setProperty('--ry', `${(u - .5) * 14}deg`); c.style.setProperty('--rx', `${(.5 - v) * 12}deg`);
    c.style.setProperty('--sx', `${u * 100}%`); c.style.setProperty('--sy', `${v * 100}%`);
    c.style.setProperty('--px', `${(.5 - u) * 18}px`); c.style.setProperty('--py', `${(.5 - v) * 18}px`); });
  c.addEventListener('pointerleave', () => ['--rx', '--ry', '--px', '--py'].forEach(p => c.style.setProperty(p, p.startsWith('--r') ? '0deg' : '0px')));
});

/* sauna circle reveal */
const sauna = $('#sauna'), saunaPin = sauna.querySelector('.pin');

/* rooms peek */
const peek = $('#peek'), peekImgs = [...peek.querySelectorAll('img')];
let px = 0, py = 0;
document.querySelectorAll('.row').forEach(r => {
  r.addEventListener('pointerenter', () => { peek.classList.add('on'); peekImgs.forEach((im, k) => im.classList.toggle('on', k === +r.dataset.img)); });
  r.addEventListener('pointerleave', () => peek.classList.remove('on'));
  r.addEventListener('click', () => { location.href = r.dataset.href; });
});

/* magnetic button */
const go = $('.go');
go.addEventListener('pointermove', e => { const r = go.getBoundingClientRect(); go.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .3}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
go.addEventListener('pointerleave', () => { go.style.transform = ''; });
$('#form').addEventListener('submit', e => { e.preventDefault(); $('#sent').textContent = 'Thank you. This is a design study — no message was sent.'; });

/* reveals */
const io = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
/* reveals handled by the inline script in the page */

/* clock + sky facts (Inari: 68.9°N, 27.0°E) */
function sky(){
  const now = new Date();
  const hm = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' });
  $('#clock').textContent = 'Inari · ' + hm(now); $('#t1').textContent = hm(now);
  const n = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  const decl = 23.44 * Math.sin(2 * Math.PI / 365 * (284 + n)) * Math.PI / 180, lat = 68.9 * Math.PI / 180;
  const cw = -Math.tan(lat) * Math.tan(decl);
  if(cw >= 1){ $('#t2').textContent = 'polar night'; $('#t3').textContent = '24 h'; }
  else if(cw <= -1){ $('#t2').textContent = 'midnight sun'; $('#t3').textContent = '0 h'; }
  else { const w = Math.acos(cw) * 180 / Math.PI / 15, noonUTC = 12 - 27 / 15; const set = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, Math.round((noonUTC + w) * 60)));
    $('#t2').textContent = hm(set); $('#t3').textContent = `${Math.floor(24 - 2 * w)} h ${Math.round((24 - 2 * w) % 1 * 60)} m`; }
  const seed = (n * 9301 + 49297) % 233280 / 233280; $('#t4').textContent = `${seed > .3 ? 'clear' : 'cloud breaks'} · Kp ${2 + Math.floor(seed * 5)}`;
}
sky(); setInterval(sky, 30000);

/* credits */
const CR = [['aurora1', 'Daniele57C', 'CC BY 4.0'], ['aurora2, aurora3, sauna', 'Ximonic (Simo Räsänen)', 'CC BY-SA 4.0 / CC BY 3.0'], ['star trails', 'Martin Stojanovski', 'CC BY-SA 4.0'], ['reindeer', 'Jacek Rużyczka', 'CC BY-SA 4.0'], ['corona', 'YosemiteYamper', 'CC BY-SA 4.0']];
$('#credits').innerHTML = 'Photos via Wikimedia Commons: ' + CR.map(c => `${c[1]} (${c[2]})`).join(' · ');

/* ======================= main loop ======================= */
const meterI = $('#meterI'), meterB = $('#meterB');
const clock = new THREE.Clock();
let started = false, hlx = -1, hly = -1, litN = -1, logP = -1, saunaP = -1;
const lamp = $('#lamp');
/* adaptive quality: if frames are slow, lower resolution, then switch bloom off */
let gT = 0, gN = 0, gSettle = 0;
function govern(dt){
  if(!started) return;
  gT += dt; gN++;
  if(gT < 1.5) return;
  const avg = gT / gN * 1000; gT = 0; gN = 0;
  if(gSettle-- > 0) return;
  if(avg > 24){
    if(useBloom && DPR <= 1){ useBloom = false; gSettle = 1; return; }
    if(DPR > .55){ DPR = Math.max(.5, DPR * .8); resize(); gSettle = 1; }
  }
}
function frame(){
  const dt = Math.min(clock.getDelta(), .05), T = clock.elapsedTime, k = 1 - Math.pow(.002, dt);
  // autopilot light when nobody is moving the mouse
  if(!HAS_MOUSE || performance.now() - lastMove > 4000){ mx = innerWidth * (.5 + .35 * Math.sin(T * .35)); my = innerHeight * (.35 + .25 * Math.sin(T * .53)); }
  smx = lerp(smx, mx, 1 - Math.pow(.0005, dt)); smy = lerp(smy, my, 1 - Math.pow(.0005, dt));
  if(HAS_MOUSE){ lamp.style.transform = `translate(${smx}px,${smy}px)`; dot.style.transform = `translate(${mx}px,${my}px)`; }
  skyU.uMouse.value.set(smx / innerWidth, 1 - smy / innerHeight);
  skyU.uTime.value = T; pU.uTime.value = T;
  skyU.uScroll.value = scrollY / innerHeight;

  // keyframes
  const { A, B, t } = state();
  for(const p of ['m', 'op', 'x', 'y', 's', 'spin', 'pw']) cur[p] = lerp(cur[p], lerp(A[p], B[p], t), k * (started ? 1 : .3));
  pU.uMorph.value = cur.m; pU.uOp.value = cur.op; skyU.uPower.value = cur.pw;
  ['uA', 'uB', 'uC'].forEach((u, j) => { tmp.copy(A.skyC[j]).lerp(B.skyC[j], t); skyU[u].value.lerp(tmp, k); });
  tmp.copy(A.pcC[0]).lerp(B.pcC[0], t); pU.uCA.value.lerp(tmp, k); tmp.copy(A.pcC[1]).lerp(B.pcC[1], t); pU.uCB.value.lerp(tmp, k);
  group.position.set(cur.x + (smx / innerWidth - .5) * .25, cur.y - (smy / innerHeight - .5) * .15, 0);
  group.scale.setScalar(cur.s);
  group.rotation.y += cur.spin * dt * 2.2; if(cur.spin < .01) group.rotation.y = lerp(group.rotation.y, Math.round(group.rotation.y / (Math.PI * 2)) * Math.PI * 2, k);

  // hero shadow: only while the hero is on screen and the light actually moved
  if(scrollY < L.vh && (Math.abs(smx - hlx) + Math.abs(smy - hly) > (LOW ? 6 : .8))){ hlx = smx; hly = smy; heroLight(smx, smy); }

  // manifesto
  { const p = clamp((scrollY - L.man[0] + L.vh * .3) / (L.man[1] - L.vh * .7)), lit = Math.ceil(p * words.length * 1.08);
    if(lit !== litN){ litN = lit; words.forEach((w, i) => { const on = i < lit; w.classList.toggle('on', on); w.classList.toggle('hot', on && w.classList.contains('h')); }); } }

  // flashlight
  { const top = L.dark[0] - scrollY;
    if(top + L.dark[1] > 0 && top < L.vh){
      if(!HAS_MOUSE || performance.now() - lastMove > 2500){ ftx = .5 + .32 * Math.sin(T * .6); fty = .5 + .25 * Math.sin(T * .9 + 1); }
      fx = lerp(fx, ftx, 1 - Math.pow(.001, dt)); fy = lerp(fy, fty, 1 - Math.pow(.001, dt));
      const speed = Math.hypot(ftx - fx, fty - fy); fr = lerp(fr, (MOBILE ? 190 : 300) + speed * 600, k);
      darkPh.style.setProperty('--fx', fx * 100 + '%'); darkPh.style.setProperty('--fy', fy * 100 + '%'); darkPh.style.setProperty('--r', fr + 'px'); } }

  // horizontal log
  { const p = clamp((scrollY - L.log[0]) / (L.log[1] - L.vh)); if(p !== logP){ logP = p; track.style.transform = `translate3d(${-p * Math.max(0, L.trackW - innerWidth)}px,0,0)`; } }

  // sauna
  { const p = clamp((scrollY - L.sauna[0]) / (L.sauna[1] - L.vh)); if(p !== saunaP){ saunaP = p;
    saunaPin.style.setProperty('--c', (7 + 80 * ease(clamp(p / .7))) + '%'); saunaPin.style.setProperty('--z', (1.3 - .3 * ease(clamp(p / .8))).toFixed(3));
    saunaPin.style.setProperty('--o', clamp((p - .55) / .3).toFixed(3)); saunaPin.style.setProperty('--o2', clamp(p / .35).toFixed(3)); } }

  // peek follows cursor
  if(HAS_MOUSE && peek.classList.contains('on')){ px = lerp(px, mx + 40, 1 - Math.pow(.0008, dt)); py = lerp(py, my, 1 - Math.pow(.0008, dt)); peek.style.left = px + 'px'; peek.style.top = py + 'px'; }

  // night meter 22:00 → 04:00
  if(!MOBILE){ const p = clamp(scrollY / (L.docH - L.vh)); meterI.style.height = p * 100 + '%';
    const mins = 22 * 60 + p * 360; meterB.style.top = p * 100 + '%'; meterB.textContent = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`; }

  // skip the WebGL work while a full-screen opaque section covers the canvas
  const covered = (scrollY >= L.dark[0] && scrollY + L.vh <= L.dark[0] + L.dark[1]) || (saunaP > .62 && saunaP < 1);
  if(!covered) draw(dt);
  govern(dt);
  requestAnimationFrame(frame);
}

/* ======================= start ======================= */
const introN = $('#introN');
let pc = 0; const iv = setInterval(() => { pc = Math.min(96, pc + 7 + Math.random() * 9); introN.textContent = `darkness ${Math.round(pc)}%`; }, 90);
document.fonts.load('800 300px Syne').then(() => document.fonts.ready).then(() => {
  [galaxy(), planet(), curtain(), dome(), word('NORTH')].forEach((a, i) => pGeo.setAttribute('p' + i, new THREE.BufferAttribute(a, 3)));
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  renderer.compile(skyScene, orthoCam); renderer.compile(ptsScene, cam);
  frame();
  const seen = sessionStorage.getItem('pol-intro');
  sessionStorage.setItem('pol-intro', '1');
  setTimeout(() => { clearInterval(iv); introN.textContent = 'darkness 100%'; setTimeout(() => { $('#intro').classList.add('gone'); started = true; measure(); }, seen ? 0 : 250); }, seen ? 0 : 700);
});
window.__pol = { cur, KF };
