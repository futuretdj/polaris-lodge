import * as THREE from 'three';

const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const MOBILE = matchMedia('(max-width:860px)').matches || matchMedia('(hover:none)').matches;
const HAS_MOUSE = matchMedia('(hover:hover)').matches;
const LOW = MOBILE || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

/* ---------- aurora sky (same shader as the home page, lighter) ---------- */
const canvas = $('#sky');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, MOBILE ? 1 : 1.25);
renderer.setPixelRatio(LOW ? .5 : DPR);
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const skyU = {
  uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(.5, .5) },
  uA: { value: new THREE.Color('#3cf0a0') }, uB: { value: new THREE.Color('#2a7bff') }, uC: { value: new THREE.Color('#c060ff') },
  uScroll: { value: 0 }, uPower: { value: .55 },
};
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: skyU, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `
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
function resize(){ renderer.setSize(innerWidth, innerHeight, false); skyU.uRes.value.set(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

/* palette per room: the sky changes colour as you scroll */
const PAL = {
  intro: ['#3cf0a0', '#2a7bff', '#c060ff', .6], glass: ['#3cf0a0', '#2a7bff', '#c060ff', .55], observer: ['#45e6ff', '#3a4cff', '#9d6bff', .5],
  shore: ['#2ae08a', '#1e5aa0', '#ff6a9a', .55], kota: ['#ff9d4a', '#c43a6a', '#ffd27a', .5], compare: ['#8fe8ff', '#4a6cff', '#e0f0ff', .4],
  included: ['#8fe8ff', '#4a6cff', '#e0f0ff', .4], book: ['#3cf0a0', '#b05cff', '#ff7ab8', .65], rules: ['#3cf0a0', '#2a7bff', '#c060ff', .45],
};
const zones = Object.keys(PAL).map(id => ({ el: document.getElementById(id), c: PAL[id].slice(0, 3).map(h => new THREE.Color(h)), p: PAL[id][3] }));
function zoneNow(){ const mid = scrollY + innerHeight * .5; let z = zones[0]; for(const q of zones) if(q.el && q.el.offsetTop <= mid) z = q; return z; }

/* ---------- cursor ---------- */
const dot = $('#dot'); let mx = innerWidth / 2, my = innerHeight / 2, smx = mx, smy = my, last = 0;
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; last = performance.now(); dot.style.transform = `translate(${mx}px,${my}px)`; });
document.querySelectorAll('a,button,figure,select,input,summary').forEach(el => { el.addEventListener('pointerenter', () => dot.classList.add('big')); el.addEventListener('pointerleave', () => dot.classList.remove('big')); });

const topBar = document.querySelector('.top');
addEventListener('scroll', () => topBar.classList.toggle('sc', scrollY > 40), { passive: true });
/* ---------- reveals ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
/* reveals handled by the inline script in the page */

/* hero light follows cursor */
const heroes = [...document.querySelectorAll('.hero')];
heroes.forEach(h => h.addEventListener('pointermove', e => { const r = h.getBoundingClientRect(); h.style.setProperty('--lx', (e.clientX - r.left) / r.width * 100 + '%'); h.style.setProperty('--ly', (e.clientY - r.top) / r.height * 100 + '%'); }));

/* ---------- lightbox ---------- */
const lb = $('#lb'), lbImg = lb.querySelector('img'), lbC = lb.querySelector('.c');
document.querySelectorAll('.gal figure').forEach(f => f.addEventListener('click', () => { const i = f.querySelector('img'); lbImg.src = i.src.replace('-800.webp', '-1600.webp'); lbImg.alt = i.alt; lbC.textContent = f.querySelector('figcaption').textContent; lb.classList.add('on'); }));
lb.addEventListener('click', () => lb.classList.remove('on'));
addEventListener('keydown', e => { if(e.key === 'Escape') lb.classList.remove('on'); });

/* ---------- booking ---------- */
const ROOMS = {
  glass: { name: 'Glass Room', rate: { hi: 520, mid: 480, lo: 440 }, max: 2 },
  observer: { name: 'Observer’s Room', rate: { hi: 610, mid: 560, lo: 510 }, max: 2 },
  shore: { name: 'Shore Cabin', rate: { hi: 760, mid: 690, lo: 620 }, max: 4 },
  kota: { name: 'Kota Loft', rate: { hi: 450, mid: 420, lo: 380 }, max: 2 },
};
// rough share of nights with a visible aurora in Inari, by month (Jan..Dec); summer = bright nights
const AUR = [.62, .66, .64, .38, 0, 0, 0, .12, .58, .55, .52, .6];
const season = d => { const m = d.getMonth(); return (m === 11 || m <= 2) ? 'hi' : (m === 8 || m === 9) ? 'lo' : 'mid'; };
let room = 'glass';
const iIn = $('#in'), iOut = $('#out'), iG = $('#guests'), iX = $('#extra');
const iso = d => d.toISOString().slice(0, 10);
{ const a = new Date(); a.setDate(a.getDate() + 30); const b = new Date(a); b.setDate(b.getDate() + 3); iIn.value = iso(a); iOut.value = iso(b); iIn.min = iso(new Date()); }
const eur = n => '€' + n.toLocaleString('en-GB');
function calc(){
  const R = ROOMS[room]; $('#sRoom').textContent = R.name;
  document.querySelectorAll('#pick button').forEach(b => b.classList.toggle('on', b.dataset.r === room));
  const a = new Date(iIn.value + 'T12:00'), b = new Date(iOut.value + 'T12:00');
  let warn = '';
  if(isNaN(a) || isNaN(b) || b <= a){ $('#sDates').textContent = '—'; $('#sNights').textContent = '—'; $('#sRate').textContent = '—'; $('#sTot').textContent = '€0'; $('#warn').textContent = 'Choose a departure after your arrival.'; return; }
  const nights = Math.round((b - a) / 864e5);
  let sum = 0, aur = 0; const d = new Date(a), rates = new Set();
  for(let i = 0; i < nights; i++){ const r = R.rate[season(d)]; sum += r; rates.add(r); aur += AUR[d.getMonth()]; d.setDate(d.getDate() + 1); }
  if(nights < 3) warn = 'Minimum stay is three nights.';
  if(+iG.value > R.max) warn = `${R.name} sleeps up to ${R.max}. Try the Shore Cabin.`;
  if(AUR[a.getMonth()] === 0) warn = 'May–July: no darkness, so no aurora. The season is late Aug — early Apr.';
  const extra = +iX.value;
  const f = x => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  $('#sDates').textContent = `${f(a)} → ${f(b)}`; $('#sNights').textContent = nights;
  $('#sRate').textContent = rates.size > 1 ? `${eur(Math.min(...rates))}–${eur(Math.max(...rates))}` : eur([...rates][0]);
  $('#sExtra').textContent = extra ? eur(extra) : '—';
  animateTotal(sum + extra);
  // probability to see it at least once = 1 - Π(1 - p_night)
  let miss = 1; const d2 = new Date(a); for(let i = 0; i < nights; i++){ miss *= 1 - AUR[d2.getMonth()]; d2.setDate(d2.getDate() + 1); }
  const pr = Math.round((1 - miss) * 100); $('#aurP').textContent = pr + '%'; $('#aurB').style.width = pr + '%';
  $('#warn').textContent = warn; $('#ok').textContent = '';
}
let shown = 0, raf = 0;
function animateTotal(to){ cancelAnimationFrame(raf); const from = shown, t0 = performance.now();
  const step = n => { const p = Math.min(1, (n - t0) / 600), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); shown = v; $('#sTot').textContent = eur(v); if(p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); }
$('#pick').addEventListener('click', e => { const b = e.target.closest('button'); if(b){ room = b.dataset.r; calc(); } });
[iIn, iOut, iG, iX].forEach(el => el.addEventListener('input', calc));
iIn.addEventListener('change', () => { if(iOut.value <= iIn.value){ const d = new Date(iIn.value); d.setDate(d.getDate() + 3); iOut.value = iso(d); } calc(); });
document.querySelectorAll('[data-room]').forEach(a => a.addEventListener('click', () => { room = a.dataset.room; calc(); }));
$('#send').addEventListener('click', () => {
  const m = $('#mail').value.trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ $('#ok').style.color = 'var(--lamp)'; $('#ok').textContent = 'Please add your email so we can reply.'; $('#mail').focus(); return; }
  $('#ok').style.color = ''; $('#ok').textContent = 'Thank you. This is a design study — no request was sent.';
});
if(location.hash && ROOMS[location.hash.slice(1)]) room = location.hash.slice(1);
calc();

/* ---------- loop ---------- */
let skip = false;
const clock = new THREE.Clock(), tmp = new THREE.Color();
function frame(){
  const dt = Math.min(clock.getDelta(), .05), T = clock.elapsedTime, k = 1 - Math.pow(.02, dt);
  if(!HAS_MOUSE || performance.now() - last > 4000){ mx = innerWidth * (.5 + .35 * Math.sin(T * .3)); my = innerHeight * (.35 + .2 * Math.sin(T * .47)); }
  smx = lerp(smx, mx, k); smy = lerp(smy, my, k);
  skyU.uTime.value = T; skyU.uScroll.value = scrollY / innerHeight * .3; skyU.uMouse.value.set(smx / innerWidth, 1 - smy / innerHeight);
  const z = zoneNow(); ['uA', 'uB', 'uC'].forEach((u, j) => skyU[u].value.lerp(z.c[j], k * .6)); skyU.uPower.value = lerp(skyU.uPower.value, z.p, k * .6);
  if(!MOBILE) for(const h of heroes){ const r = h.getBoundingClientRect(); if(r.bottom < 0 || r.top > innerHeight) continue;
    const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; h.querySelector('img').style.setProperty('--par', (p * -60).toFixed(1) + 'px'); }
  // the sky moves slowly: on phones 30 fps is plenty and halves the GPU work
  if(!LOW || (skip = !skip)) renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
