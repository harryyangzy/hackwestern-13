/* Gion Taxi: a driving game on top of the Pocket City of Gion Shirakawa.
   Runs after the Pocket City page script and shares its globals (camera, goal, view, iso, setPlay, redraw).
   The taxi lives here (physics, fares, score); the render worker draws it from window.PLAYER (see player.js). */
(() => {
const $ = id => document.getElementById(id);
const SC = new Function($('data').textContent + ';return SCENE;')();
const HALF = SC.meta.half;
document.title = 'Gion Taxi · Pocket City of Gion Shirakawa';

/* ---------- geometry ---------- */
function inside(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j];
  if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const inRings = (p, groups) => groups.some(rs => { let c = false; for (const r of rs) if (inside(p, r)) c = !c; return c });
const onRoad = p => inRings(p, SC.roads);
const CAR = { L: 4.5, W: 1.75 };
function corners(x, y, h, grow = 0) {
  const d = [Math.cos(h), Math.sin(h)], n = [-d[1], d[0]], hl = CAR.L / 2 + grow, hw = CAR.W / 2 + grow;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([a, b]) => [x + d[0] * hl * a + n[0] * hw * b, y + d[1] * hl * a + n[1] * hw * b]);
}
const fits = (x, y, h) => corners(x, y, h).every(onRoad);

/* drivable spots: points along the mapped car routes, where a fare can wait */
const SPOTS = [];
for (const r of SC.routes.filter(r => r.kind === 'car')) for (let i = 0; i < r.p.length - 1; i++) {
  const a = r.p[i], b = r.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let s = 0; s < L; s += 6) {
    const p = [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L], h = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (Math.abs(p[0]) < HALF - 6 && Math.abs(p[1]) < HALF - 6 && fits(p[0], p[1], h) && fits(p[0], p[1], h + Math.PI / 2)) SPOTS.push({ x: p[0], y: p[1], h });
  }
}
const START = SPOTS.find(s => fits(s.x, s.y, s.h)) || { x: 0, y: 0, h: 0 };

/* ---------- HUD ---------- */
const stage = $('stage');
stage.insertAdjacentHTML('beforeend', `
<div id="gt-hud" hidden>
  <div class="gt-card gt-stats">
    <div><small>Fares</small><b id="gt-fares">0</b></div>
    <div><small>Yen</small><b id="gt-yen">¥0</b></div>
    <div><small>Time</small><b id="gt-time">90</b></div>
    <div><small>km/h</small><b id="gt-speed">0</b></div>
  </div>
  <div class="gt-card gt-task" id="gt-task">Find the passenger</div>
  <div id="gt-arrow"><svg viewBox="0 0 40 40"><path d="M20 4 34 32 20 25 6 32Z" fill="#f26a2e" stroke="#263c35" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
  <svg id="gt-map" class="gt-card" viewBox="${-HALF} ${-HALF} ${2 * HALF} ${2 * HALF}"></svg>
  <div id="gt-toast"></div>
  <div class="gt-pad" id="gt-pad">
    <button data-k="left">◀</button><button data-k="right">▶</button><button data-k="brake">▼</button><button data-k="gas">▲</button>
  </div>
</div>
<div id="gt-menu" class="gt-card">
  <h2>Gion Taxi</h2>
  <p>Drive a taxi through the lanes of Gion, Kyoto. Pick up the passenger by the orange lantern, then take them to the gold one before the clock runs out.</p>
  <p class="gt-keys"><kbd>↑</kbd><kbd>W</kbd> drive · <kbd>↓</kbd><kbd>S</kbd> brake/reverse · <kbd>←</kbd><kbd>→</kbd> steer · <kbd>C</kbd> camera · <kbd>Esc</kbd> stop</p>
  <p class="gt-keys">Mind the people, bikes and cars: a bump costs ¥ and time. Change the season on the left, even mid-ride.</p>
  <p id="gt-result"></p>
  <button id="gt-start">Start driving</button>
</div>
<button id="gt-open" class="gt-card" hidden>🚕 Drive</button>`);
const map = $('gt-map');
const ringPath = groups => groups.map(rs => rs.map(r => 'M' + r.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z').join('')).join('');
// the minimap is in plan coordinates with y up, so flip it; north is roughly up (the plot is turned only a few degrees)
map.innerHTML = `<g transform="scale(1,-1)">
  <rect x="${-HALF}" y="${-HALF}" width="${2 * HALF}" height="${2 * HALF}" fill="#efe7d4"/>
  <path d="${ringPath(SC.water)}" fill="#9cc3c4" fill-rule="evenodd"/>
  <path d="${ringPath(SC.roads)}" fill="#cbbab3" fill-rule="evenodd"/>
  <path d="${SC.buildings.map(b => 'M' + b.ring.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z').join('')}" fill="#d9c7a8" stroke="#a89a85" stroke-width=".4"/>
  <circle id="gt-mt" r="5" fill="#f26a2e" stroke="#263c35" stroke-width="1.2"/>
  <path id="gt-me" d="M6 0-4 4-2 0-4-4Z" fill="#c8513a" stroke="#263c35" stroke-width="1.2" transform="scale(1.6)"/></g>`;

/* ---------- state ---------- */
const keys = new Set();
let driving = false, chase = true, car, fare, yen = 0, fares = 0, clock = 90, last = 0, bumpCool = 0, toastT = 0, shake = 0, camYaw = 0, finished = false;
const best = () => +(localStorage.getItem('gionTaxiBest') || 0);
function toast(msg, good) { const t = $('gt-toast'); t.textContent = msg; t.className = good ? 'good show' : 'show'; toastT = 1.8 }
function spotAway(from, min) {
  const far = SPOTS.filter(s => Math.hypot(s.x - from.x, s.y - from.y) > min);
  const list = far.length ? far : SPOTS;
  return list[Math.floor(Math.random() * list.length)];
}
function newFare() {
  const p = spotAway(car, 45), d = spotAway(p, 70);
  fare = { mode: 'pickup', p, d, dist: Math.hypot(d.x - p.x, d.y - p.y) };
  $('gt-task').textContent = 'Pick up the passenger at the orange lantern';
}
function start() {
  car = { x: START.x, y: START.y, h: START.h, v: 0, steer: 0 };
  yen = 0; fares = 0; clock = 90; finished = false; camYaw = car.h * 180 / Math.PI + 180;
  newFare(); driving = true; $('gt-menu').hidden = true; $('gt-open').hidden = true; $('gt-hud').hidden = false;
  if (!playing) setPlay(true);
  stage.querySelector('canvas').focus?.();
}
function stop(result) {
  driving = false; window.PLAYER = null; keys.clear();
  $('gt-hud').hidden = true; $('gt-menu').hidden = false;
  if (result) {
    if (yen > best()) localStorage.setItem('gionTaxiBest', yen);
    $('gt-result').innerHTML = `<b>Shift over.</b> ${fares} fare${fares === 1 ? '' : 's'}, ¥${yen.toLocaleString()} · best ¥${best().toLocaleString()}`;
  }
  $('gt-start').textContent = result ? 'Drive again' : 'Start driving';
  setView('cine');
}
$('gt-start').onclick = start;
$('gt-open').onclick = () => { $('gt-menu').hidden = false; $('gt-open').hidden = true };
$('gt-menu').insertAdjacentHTML('beforeend', '<button id="gt-close" class="gt-x" aria-label="Close">×</button>');
$('gt-close').onclick = () => { $('gt-menu').hidden = true; $('gt-open').hidden = false };

/* ---------- input ---------- */
const KEYMAP = { ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
addEventListener('keydown', e => {
  if (!driving) { if (e.key === 'Enter' && !$('gt-menu').hidden) start(); return }
  if (e.target.closest && e.target.closest('select,input,dialog')) return;
  if (KEYMAP[e.key]) { keys.add(KEYMAP[e.key]); e.preventDefault(); e.stopPropagation() }
  else if (e.key === 'c' || e.key === 'C') { chase = !chase; toast(chase ? 'Chase camera' : 'Overhead camera', true) }
  else if (e.key === 'Escape') stop(true);
  else if (e.key === ' ' || ['+', '=', '-', 'Home'].includes(e.key)) { e.preventDefault(); e.stopPropagation() }
}, true);
addEventListener('keyup', e => { if (KEYMAP[e.key]) keys.delete(KEYMAP[e.key]) }, true);
addEventListener('blur', () => keys.clear());
for (const b of document.querySelectorAll('#gt-pad button')) {
  const k = b.dataset.k;
  b.onpointerdown = e => { e.preventDefault(); keys.add(k); b.setPointerCapture(e.pointerId) };
  b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => keys.delete(k);
}

/* ---------- physics ---------- */
const MAX = 11, REV = 4, WHEELBASE = 2.7;
function step(dt) {
  const gas = keys.has('gas'), brake = keys.has('brake'), turn = (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0);
  if (gas) car.v += (car.v < 0 ? 12 : 5.5 * (1 - car.v / MAX)) * dt;
  else if (brake) car.v -= (car.v > 0 ? 12 : 3) * dt;
  else car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), 2.2 * dt);
  car.v = Math.max(-REV, Math.min(MAX, car.v));
  const steerMax = .55 / (1 + Math.abs(car.v) * .06);
  car.steer += (turn * steerMax - car.steer) * Math.min(1, dt * 8);
  const nh = car.h + car.v * Math.tan(car.steer) / WHEELBASE * dt;
  const nx = car.x + Math.cos(nh) * car.v * dt, ny = car.y + Math.sin(nh) * car.v * dt;
  if (fits(nx, ny, nh)) { car.x = nx; car.y = ny; car.h = nh }
  else if (fits(car.x + Math.cos(nh) * car.v * dt, car.y, nh)) { car.x += Math.cos(nh) * car.v * dt * .5; car.h = nh; car.v *= .9 }   // slide along a kerb
  else if (fits(car.x, car.y + Math.sin(nh) * car.v * dt, nh)) { car.y += Math.sin(nh) * car.v * dt * .5; car.h = nh; car.v *= .9 }
  else { if (Math.abs(car.v) > 4) { toast('Scrape!'); shake = .25 } car.v *= -.3 }
}
function bumps(dt) {
  bumpCool -= dt;
  const near = window.NEAR_IN || window.NEAR;
  if (!near || bumpCool > 0) return;
  const d = [Math.cos(car.h), Math.sin(car.h)], n = [-d[1], d[0]];
  for (const a of near) {
    const rx = a.x - car.x, ry = a.y - car.y, along = rx * d[0] + ry * d[1], side = rx * n[0] + ry * n[1];
    const reach = a.k === 'car' ? Math.max(a.L, a.W) * .8 : a.k === 'bike' ? .8 : .35;
    if (Math.abs(along) < CAR.L / 2 + reach && Math.abs(side) < CAR.W / 2 + reach * .6) {
      const cost = a.k === 'ped' ? 600 : a.k === 'bike' ? 400 : 300;
      yen = Math.max(0, yen - cost); clock = Math.max(0, clock - 3); car.v *= -.25; bumpCool = 1.2; shake = .3;
      toast(a.k === 'ped' ? 'Watch the pedestrians! −¥' + cost : a.k === 'bike' ? 'You clipped a bike! −¥' + cost : 'Fender bender! −¥' + cost);
      return;
    }
  }
}
function fareLogic() {
  const target = fare.mode === 'pickup' ? fare.p : fare.d, dist = Math.hypot(target.x - car.x, target.y - car.y);
  if (dist < 3.2 && Math.abs(car.v) < 2.5) {
    if (fare.mode === 'pickup') { fare.mode = 'drop'; fare.t = 0; toast('Passenger aboard!', true); $('gt-task').textContent = 'Take them to the gold lantern' }
    else {
      const pay = Math.round((500 + fare.dist * 12 + Math.max(0, 40 - fare.t) * 25) / 10) * 10, bonus = Math.round(8 + fare.dist / 12);
      yen += pay; fares++; clock += bonus; toast('Fare paid ¥' + pay + ' · +' + bonus + ' s', true); newFare();
    }
  }
  return target;
}

/* ---------- the loop ---------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  if (!driving) return;
  step(dt); bumps(dt);
  if (fare.mode === 'drop') fare.t += dt;
  const target = fareLogic();
  clock -= dt;
  if (clock <= 0) { clock = 0; stop(true); return }
  window.PLAYER = { x: car.x, y: car.y, h: car.h, v: car.v, tx: target.x, ty: target.y, mode: fare.mode };
  // camera: behind the taxi (chase) or the plot's own iso angle, a little ahead of the car
  const want = chase ? car.h * 180 / Math.PI + 180 : iso.yaw;
  let dy = ((want - camYaw + 180) % 360 + 360) % 360 - 180; camYaw += dy * Math.min(1, dt * (chase ? 3.2 : 6));
  shake = Math.max(0, shake - dt);
  const j = shake > 0 ? (Math.random() - .5) * shake * 2 : 0, ahead = Math.max(0, car.v) * .5;
  view = 'drive';
  goal = camera = { yaw: camYaw, pitch: chase ? 54 : 72, zoom: iso.zoom * (chase ? 4.2 : 3.4) * (1 - Math.abs(car.v) / MAX * .12),
    x: car.x + Math.cos(car.h) * ahead + j, y: car.y + Math.sin(car.h) * ahead + j, z: 1 };
  $('viewName').textContent = 'Gion Taxi';
  // HUD
  $('gt-fares').textContent = fares; $('gt-yen').textContent = '¥' + yen.toLocaleString();
  $('gt-time').textContent = Math.ceil(clock); $('gt-time').classList.toggle('low', clock < 15);
  $('gt-speed').textContent = Math.round(Math.abs(car.v) * 3.6);
  // the arrow points from the taxi to the target, as seen on screen (camera right = (-sin yaw, cos yaw), up = -(cos yaw, sin yaw))
  const gx = target.x - car.x, gy = target.y - car.y, t = camYaw * Math.PI / 180;
  const sx = -gx * Math.sin(t) + gy * Math.cos(t), sy = gx * Math.cos(t) + gy * Math.sin(t);
  const arrow = $('gt-arrow');
  arrow.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(sx, -sy) * 180 / Math.PI}deg) translateY(-110px)`;
  arrow.querySelector('path').setAttribute('fill', fare.mode === 'pickup' ? '#f26a2e' : '#f2c94c');
  arrow.style.opacity = Math.hypot(gx, gy) < 12 ? .25 : 1;
  $('gt-me').setAttribute('transform', `translate(${car.x} ${car.y}) rotate(${car.h * 180 / Math.PI}) scale(1.6)`);
  const mt = $('gt-mt'); mt.setAttribute('cx', target.x); mt.setAttribute('cy', target.y); mt.setAttribute('fill', fare.mode === 'pickup' ? '#f26a2e' : '#f2c94c');
  toastT -= dt; if (toastT <= 0) $('gt-toast').classList.remove('show');
  redraw();
}
requestAnimationFrame(frame);
window.GionTaxi = { start, stop, get car() { return car }, keys };
})();
