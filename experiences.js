import * as THREE from 'three';

const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const MOBILE = matchMedia('(max-width:860px)').matches || matchMedia('(hover:none)').matches;
const HAS_MOUSE = matchMedia('(hover:hover)').matches;
const LOW = MOBILE || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

/* ---------- aurora sky ---------- */
const canvas = $('#sky');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOW ? .5 : Math.min(devicePixelRatio, 1.25));
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
const PAL = {
  intro: ['#3cf0a0', '#2a7bff', '#c060ff', .6], day: ['#ff9d6a', '#7a5cff', '#ffd27a', .5], trips: ['#45e6ff', '#3a4cff', '#9d6bff', .45],
  dining: ['#ff9d4a', '#c43a6a', '#ffd27a', .45], guide: ['#3cf0a0', '#2a7bff', '#ff6a9a', .75], seasons: ['#8fe8ff', '#4a6cff', '#e0f0ff', .5],
};
const zones = Object.keys(PAL).map(id => ({ el: document.getElementById(id), c: PAL[id].slice(0, 3).map(h => new THREE.Color(h)), p: PAL[id][3] }));
const zoneNow = () => { const mid = scrollY + innerHeight * .5; let z = zones[0]; for(const q of zones) if(q.el && q.el.offsetTop <= mid) z = q; return z; };

/* ---------- chrome ---------- */
const topBar = $('.top'); addEventListener('scroll', () => topBar.classList.toggle('sc', scrollY > 40), { passive: true });
const dot = $('#dot'); let mx = innerWidth / 2, my = innerHeight / 2, smx = mx, smy = my, last = 0;
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; last = performance.now(); dot.style.transform = `translate(${mx}px,${my}px)`; });
document.querySelectorAll('a,button,summary,figure').forEach(el => { el.addEventListener('pointerenter', () => dot.classList.add('big')); el.addEventListener('pointerleave', () => dot.classList.remove('big')); });
const io = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .1 });
/* reveals handled by the inline script in the page */

/* ---------- experiences accordion (animated height) ---------- */
document.querySelectorAll('.x').forEach(x => {
  const b = x.querySelector('button'), p = x.querySelector('.panel');
  b.addEventListener('click', () => {
    const open = !x.classList.contains('open');
    document.querySelectorAll('.x.open').forEach(o => { if(o !== x){ const op = o.querySelector('.panel'); op.style.height = op.scrollHeight + 'px'; requestAnimationFrame(() => { op.style.height = '0px'; }); o.classList.remove('open'); o.querySelector('button').setAttribute('aria-expanded', 'false'); } });
    if(open){ x.classList.add('open'); p.style.height = p.scrollHeight + 'px'; b.setAttribute('aria-expanded', 'true');
      setTimeout(() => { if(x.classList.contains('open')) p.style.height = 'auto'; }, 750);
      setTimeout(() => { const r = x.getBoundingClientRect(); if(r.top < 60 || r.top > innerHeight * .5) scrollTo({ top: scrollY + r.top - 80, behavior: 'smooth' }); }, 380);
    } else { p.style.height = p.scrollHeight + 'px'; requestAnimationFrame(() => { p.style.height = '0px'; }); x.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
  });
});

/* ---------- guide tabs ---------- */
const tabs = [...document.querySelectorAll('#guide .tabs button')], panes = [...document.querySelectorAll('.gp')];
tabs.forEach((t, i) => t.addEventListener('click', () => { tabs.forEach((u, j) => u.classList.toggle('on', i === j)); panes.forEach((p, j) => p.classList.toggle('on', i === j)); }));

/* ---------- seasons ---------- */
const M = [
  ['January', 'Jan', 62, 20, '−17 °C', '1 h 50 m', 'Polar twilight', 'The darkest and quietest month. The sun does not rise until the 17th, but the sky is pink and blue for five hours every day.', 'Deep, dry snow and the coldest nights — sometimes below −30 °C. Clear, still air means some of the strongest aurora nights of the year. Husky and reindeer trips at their best; the lake is frozen solid for ice fishing.'],
  ['February', 'Feb', 66, 15, '−15 °C', '7 h 30 m', 'Light returns', 'Our favourite month. Days get longer fast, the snow is deep and white, and the nights are still long and dark.', 'Bright sunny days for snowshoeing and skiing, long dark nights for the aurora. Statistically the month with the most clear nights. Book early — February fills first.'],
  ['March', 'Mar', 64, 11, '−10 °C', '11 h 40 m', 'Spring winter', 'Sun on the snow, warm afternoons, cold nights. Aurora activity peaks around the equinox.', 'Perfect for being outside all day: skiing, snowshoes, picnics on the ice. The equinox brings some of the most active geomagnetic nights. The light is bright — bring sunglasses.'],
  ['April', 'Apr', 38, 5, '−3 °C', '16 h', 'Crust snow', 'The last aurora weeks. Hard crust snow you can walk on anywhere and long, golden evenings.', 'The aurora is possible until about the 15th; after that the nights become too bright. The Sámi Easter festival with reindeer racing takes place in nearby villages.'],
  ['May', 'May', 0, 0, '+4 °C', '21 h', 'Breakup', 'Snow melts, ice breaks on the lake. The hotel is closed for rest and repairs.', 'The quietest weeks of the year. Polaris is closed from 1 May to 15 June.'],
  ['June', 'Jun', 0, 0, '+11 °C', '24 h', 'Midnight sun', 'The sun does not set at all. We reopen mid-June for midnight-sun stays.', 'Hiking, fishing, canoeing, and sleeping under a glass roof in daylight at 2 am. No aurora — but a completely different kind of magic.'],
  ['July', 'Jul', 0, 0, '+15 °C', '24 h', 'Midnight sun', 'Warm days, endless light, berries starting to ripen. Mosquitoes, too — we give you nets.', 'Lake swimming, canoe trips to the islands, long hikes in the fells. The sauna with a jump into the open lake is at its best.'],
  ['August', 'Aug', 12, 6, '+11 °C', '17 h', 'Night returns', 'Cloudberries, mushrooms and the first dark nights. The aurora season begins in the last week.', 'Cloudberry picking in the bogs, blueberries everywhere. From around the 20th the first aurora of the season appears — often reflected in the still, unfrozen lake.'],
  ['September', 'Sep', 58, 10, '+5 °C', '12 h 30 m', 'Ruska', 'Ruska: the whole landscape turns red, orange and gold. Excellent aurora with reflections in the lake.', 'Our secret season. Warm enough to sit outside at night, autumn colours by day, and the aurora mirrored in open water. Lower prices, fewer guests.'],
  ['October', 'Oct', 55, 14, '−1 °C', '8 h 45 m', 'First snow', 'First snow, dark nights, very active sky around the equinox and after.', 'A month of contrasts: the last colours, the first snow, the lake still open. Long nights for the aurora and the Observer’s Room telescope.'],
  ['November', 'Nov', 52, 18, '−9 °C', '4 h 10 m', 'Twilight', 'Days shrink fast. Blue light all day, the lake freezes, the world goes quiet.', 'Very long nights and a soft blue light all day. Snow arrives for good. A peaceful month with good aurora and our winter season opening on the 20th.'],
  ['December', 'Dec', 60, 20, '−14 °C', '0 h', 'Kaamos', 'Kaamos — polar night. The sun stays below the horizon for more than a month.', 'Candles everywhere, Christmas in a log cabin, the deepest snow. A few hours of blue and pink twilight at noon and very long nights for the sky. Christmas weeks are the busiest of the year.'],
];
const ms = $('#months'), mc = $('#mcard');
ms.innerHTML = M.map((m, i) => `<button data-i="${i}" style="--a:${Math.max(2, m[2] * 1.4)};--d:${m[3] / 24 * 100}" aria-label="${m[0]}"><div class="dk"></div><div class="bar"></div><span class="mono">${m[1]}</span></button>`).join('');
function showMonth(i){
  const m = M[i]; ms.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', i === j));
  mc.innerHTML = `<div><span class="mono" style="color:var(--glow)">${m[6]}</span><h3>${m[0]}</h3></div><div><div class="st mono"><div><span>Aurora chance</span><b>${m[2] ? m[2] + '%' : '—'}</b></div><div><span>Darkness</span><b>${m[3]} h</b></div><div><span>Average</span><b>${m[4]}</b></div><div><span>Daylight</span><b>${m[5]}</b></div></div><p class="v">${m[7]}</p><p>${m[8]}</p></div>`;
  mc.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2,.7,.2,1)' });
}
ms.addEventListener('click', e => { const b = e.target.closest('button'); if(b) showMonth(+b.dataset.i); });
ms.addEventListener('pointerover', e => { const b = e.target.closest('button'); if(b && HAS_MOUSE) showMonth(+b.dataset.i); });
showMonth(1);

/* ---------- loop ---------- */
const tl = $('#tl'), hrs = [...document.querySelectorAll('.hr')];
let skip = false;
function tlUpdate(){ const r = tl.getBoundingClientRect(), line = innerHeight * .6; if(r.top > innerHeight || r.bottom < 0) return;
  tl.style.setProperty('--fill', clamp((line - r.top) / r.height) * 100 + '%'); hrs.forEach(h => h.classList.toggle('lit', h.getBoundingClientRect().top < line)); }
addEventListener('scroll', tlUpdate, { passive: true }); tlUpdate();
const clock = new THREE.Clock();
function frame(){
  const dt = Math.min(clock.getDelta(), .05), T = clock.elapsedTime, k = 1 - Math.pow(.02, dt);
  if(!HAS_MOUSE || performance.now() - last > 4000){ mx = innerWidth * (.5 + .35 * Math.sin(T * .3)); my = innerHeight * (.35 + .2 * Math.sin(T * .47)); }
  smx = lerp(smx, mx, k); smy = lerp(smy, my, k);
  skyU.uTime.value = T; skyU.uScroll.value = scrollY / innerHeight * .3; skyU.uMouse.value.set(smx / innerWidth, 1 - smy / innerHeight);
  const z = zoneNow(); ['uA', 'uB', 'uC'].forEach((u, j) => skyU[u].value.lerp(z.c[j], k * .6)); skyU.uPower.value = lerp(skyU.uPower.value, z.p, k * .6);
  // the sky moves slowly: on phones 30 fps is plenty and halves the GPU work
  if(!LOW || (skip = !skip)) renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
