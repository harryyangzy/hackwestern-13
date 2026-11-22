/* Gion Taxi: a driving game on top of the Pocket City of Gion Shirakawa.
   Runs after the Pocket City page script and shares its globals (camera, goal, view, iso, setPlay, redraw).
   The taxi lives here (physics, fares, score); the render worker draws it from window.PLAYER (see player.js).
   Input comes through one interface (readInput): the keyboard and touch pad write `keys`, phone controllers (mp.js)
   write `remote`. window.GionTaxi is the API mp.js uses: state, events, door, camera and navigator pings.
   Two modes: 'taxi' (the fare shift) and 'bowling' (Gion Bowling: 60 s to knock over as many pedestrians as you can). */
(() => {
const $ = id => document.getElementById(id);
const SC = new Function($('data').textContent + ';return SCENE;')();
const HALF = SC.meta.half;
// the city's settings, written by build.py (window.GT_CITY); Gion's are the defaults
const CITYCFG = Object.assign({ id: 'gion', name: 'Gion', brand: 'Gion Taxi', bowl: 'Gion Bowling', drivePaths: false, cities: [],
  blurb: 'Drive a taxi through the lanes of Gion, Kyoto.' }, window.GT_CITY || {});
document.title = CITYCFG.brand + ' · ' + document.title.replace(/^[^·]*·\s*/, '');

/* ---------- geometry ---------- */
function inside(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j];
  if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const inRings = (p, groups) => groups.some(rs => { let c = false; for (const r of rs) if (inside(p, r)) c = !c; return c });
// where the taxi may drive: the roads, plus the footpaths in a city that allows them (Western's campus)
const DRIVE = SC.roads.concat(CITYCFG.drivePaths ? (SC.paths || []) : []);
// an open city (London): anywhere on the plot that isn't inside a building (each building's box is checked first)
const BLDG = SC.buildings.map(b => { const xs = b.ring.map(p => p[0]), ys = b.ring.map(p => p[1]);
  return { ring: b.ring, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } });
const inBuilding = p => BLDG.some(b => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 && inside(p, b.ring));
const onRoad = CITYCFG.open ? p => Math.abs(p[0]) < HALF - .8 && Math.abs(p[1]) < HALF - .8 && !inBuilding(p) : p => inRings(p, DRIVE);
// the collision box is a little smaller than the drawn taxi (4.5 × 1.75 m), so it doesn't snag on kerb corners it
// visibly clears: on Amsterdam's narrow quays the full box failed at 18% of the points traffic drives through, this 2%
const CAR = { L: 3.8, W: 1.4 };
function corners(x, y, h, grow = 0) {
  const d = [Math.cos(h), Math.sin(h)], n = [-d[1], d[0]], hl = CAR.L / 2 + grow, hw = CAR.W / 2 + grow;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([a, b]) => [x + d[0] * hl * a + n[0] * hw * b, y + d[1] * hl * a + n[1] * hw * b]);
}
const fits = (x, y, h) => corners(x, y, h).every(onRoad);

/* drivable spots: points along the mapped car routes, where a fare can wait */
const SPOTS = [];
for (const r of SC.routes.filter(r => r.kind === 'car' || (CITYCFG.drivePaths && r.kind === 'ped'))) for (let i = 0; i < r.p.length - 1; i++) {
  const a = r.p[i], b = r.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let s = 0; s < L; s += 6) {
    const p = [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L], h = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (Math.abs(p[0]) < HALF - 6 && Math.abs(p[1]) < HALF - 6 && fits(p[0], p[1], h) && (CITYCFG.drivePaths || fits(p[0], p[1], h + Math.PI / 2))) SPOTS.push({ x: p[0], y: p[1], h });
  }
}
const START = SPOTS.find(s => fits(s.x, s.y, s.h)) || { x: 0, y: 0, h: 0 };

/* ---------- the road grid: which spots connect, and the navigator's route (a breadth-first distance field over road
   cells, rebuilt per fare stage, the path pulled tight with line-of-sight checks) ---------- */
// 2 m cells; 1 m where footpaths are drivable (Western's paths are 2-3 m wide)
const CELL = CITYCFG.drivePaths && !CITYCFG.open ? 1 : 2, N = Math.ceil(2 * HALF / CELL), CLEAR = CITYCFG.drivePaths ? .6 : .8;
let walk = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cx = i => -HALF + (i + .5) * CELL;
function buildWalk() {
  walk = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), y = cx(j);
    walk[j * N + i] = [[0, 0], [CLEAR, 0], [-CLEAR, 0], [0, CLEAR], [0, -CLEAR]].every(([dx, dy]) => onRoad([x + dx, y + dy])) ? 1 : 0;
  }
}
const cellOf = (x, y) => [clamp(Math.floor((x + HALF) / CELL), 0, N - 1), clamp(Math.floor((y + HALF) / CELL), 0, N - 1)];
function nearestWalk(x, y) {
  const [i0, j0] = cellOf(x, y);
  for (let r = 0; r < 16 / CELL; r++) {
    let best = null, bd = Infinity;
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N || !walk[j * N + i]) continue;
      const d = Math.hypot(cx(i) - x, cx(j) - y); if (d < bd) { bd = d; best = j * N + i }
    }
    if (best != null) return best;
  }
  return null;
}
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
let field = null, fieldKey = null;
function buildField(tx, ty) {
  field = new Int32Array(N * N).fill(-1);
  const s = nearestWalk(tx, ty); if (s == null) return;
  const q = [s]; field[s] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], i = c % N, j = (c - i) / N;
    for (const [di, dj] of NB) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni;
      if (walk[n] && field[n] < 0 && (!di || !dj || walk[j * N + ni] || walk[nj * N + i])) { field[n] = field[c] + 1; q.push(n) }
    }
  }
}
function clear(a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / .8);
  for (let k = 1; k < n; k++) { const [i, j] = cellOf(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); if (!walk[j * N + i]) return false }
  return true;
}
function route(st) {
  if (!walk) buildWalk();
  const tk = st.tx.toFixed(1) + ',' + st.ty.toFixed(1);
  if (tk !== fieldKey) { buildField(st.tx, st.ty); fieldKey = tk }
  let c = nearestWalk(st.x, st.y); if (c == null || field[c] < 0) return null;
  const cells = [c];
  while (field[c] > 0 && cells.length < N * 4) {
    const i = c % N, j = (c - i) / N; let nx = c;
    for (const [di, dj] of NB) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue; const n = nj * N + ni; if (field[n] >= 0 && field[n] < field[nx]) nx = n }
    if (nx === c) break; c = nx; cells.push(c);
  }
  const raw = [[st.x, st.y], ...cells.map(c => [cx(c % N), cx(Math.floor(c / N))]), [st.tx, st.ty]];
  const pts = [raw[0]];   // pull the string tight: keep only the corners the road forces
  for (let a = 0; a < raw.length - 1;) { let b = raw.length - 1; while (b > a + 1 && !clear(raw[a], raw[b])) b--; pts.push(raw[b]); a = b }
  let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return { pts: pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]), len: Math.round(len) };
}

// keep only fare spots the taxi can reach from where it starts (a path that touches no road can't be a fare)
buildWalk(); buildField(START.x, START.y);
{
  const reach = SPOTS.filter(s => { const c = nearestWalk(s.x, s.y); return c != null && field[c] >= 0 });
  if (reach.length >= 4) SPOTS.splice(0, SPOTS.length, ...reach);
  fieldKey = null;
}

/* ---------- HUD ---------- */
const stage = $('stage');
stage.insertAdjacentHTML('beforeend', `
<div id="gt-hud" hidden>
  <div class="gt-card gt-stats">
    <div><small id="gt-l1">Fares</small><b id="gt-fares">0</b></div>
    <div><small id="gt-l2">Yen</small><b id="gt-yen">¥0</b></div>
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
  <h2>${CITYCFG.brand}</h2>
  <p>${CITYCFG.blurb} Pick up the passenger by the orange lantern, then take them to the gold one before the clock runs out.</p>
  <p class="gt-keys"><kbd>↑</kbd><kbd>W</kbd> drive · <kbd>↓</kbd><kbd>S</kbd> brake/reverse · <kbd>←</kbd><kbd>→</kbd> steer · <kbd>C</kbd> camera · <kbd>Esc</kbd> stop</p>
  <p class="gt-keys">Stay inside the red and cream kerbs: that’s the road.</p>
  <p class="gt-keys">People and bikes step aside for the taxi; only a car bump costs you a little ¥. Change the season on the left, even mid-ride.</p>
  <p id="gt-result"></p>
  <button id="gt-start">Start driving</button>
  <p class="gt-keys gt-bowlnote">Bonus mode: <button id="gt-bowl" class="gt-link">${CITYCFG.bowl}</button>: 60 seconds to bowl over as many pedestrians as you can.</p>
  ${CITYCFG.cities.length > 1 ? `<p class="gt-cities">${CITYCFG.cities.map(c => c.id === CITYCFG.id ? `<b>${c.name}</b>` : `<a href="${c.href}">${c.name}</a>`).join('')}</p>` : ''}
</div>
<button id="gt-open" class="gt-card" hidden>🚕 Drive</button>`);
const map = $('gt-map');
const ringPath = groups => groups.map(rs => rs.map(r => 'M' + r.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z').join('')).join('');
// the minimap is in plan coordinates with y up, so flip it; north is roughly up (the plot is turned only a few degrees)
map.innerHTML = `<g transform="scale(1,-1)">
  <rect x="${-HALF}" y="${-HALF}" width="${2 * HALF}" height="${2 * HALF}" fill="#efe7d4"/>
  <path d="${ringPath(SC.water)}" fill="#9cc3c4" fill-rule="evenodd"/>
  <path d="${ringPath(DRIVE)}" fill="#cbbab3" fill-rule="evenodd"/>
  <path d="${SC.buildings.map(b => 'M' + b.ring.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z').join('')}" fill="#d9c7a8" stroke="#a89a85" stroke-width=".4"/>
  <circle id="gt-mt" r="5" fill="#f26a2e" stroke="#263c35" stroke-width="1.2"/>
  <path id="gt-me" d="M6 0-4 4-2 0-4-4Z" fill="#c8513a" stroke="#263c35" stroke-width="1.2" transform="scale(1.6)"/></g>`;

/* ---------- state ---------- */
const keys = new Set();
let driving = false, cam = 'kart', mode = 'taxi', car, fare, yen = 0, fares = 0, clock = 90, last = 0, bumpCool = 0, toastT = 0, shake = 0, camYaw = 0, finished = false;
// crew play (mp.js): phone inputs, the door the operator opens at a lantern, and shift stats for the results card
const remote = { gas: 0, brake: 0, turn: 0, gear: 'D' };   // phone pedals: gas drives in the gear's direction, brake only brakes
// Wrong Turn mode (wt.js) bends these; at their defaults the game is exactly as before
const mods = { hideTarget: false, turnBias: 0, gasCutUntil: 0, brakeScale: 1, doorJamUntil: 0 };
let doorNeeded = false, doorOpen = 0, bumpCount = 0, penaltyYen = 0, penaltyTime = 0, fareTimes = [], ping = null;
// Gion Bowling: pedestrians knocked over this round (hidden by the render worker), score, combo, little dust pops
let pins = 0, score = 0, combo = 0, comboT = 0, hit = new Set(), pops = [];
const CAMS = {   // kart: low and close behind the taxi, which sits in the lower third looking up the road
  kart: { label: 'Kart camera', pitch: 42, zoom: 5.4, rate: 5, low: .2 },
  chase: { label: 'Chase camera', pitch: 54, zoom: 4.2, rate: 3.2, low: 0 },
  top: { label: 'Overhead camera', pitch: 72, zoom: 3.4, rate: 6, low: 0 },
};
const CAM_ORDER = ['kart', 'chase', 'top'];
const handlers = {};
const emit = (name, data) => (handlers[name] || []).forEach(f => { try { f(data) } catch (e) { console.error(e) } });
const TASKS = { pickup: 'Pick up the passenger at the orange lantern', drop: 'Take them to the gold lantern' };
const setTask = () => { $('gt-task').textContent = fare.atDoor ? (fare.mode === 'pickup' ? 'Stopped at the lantern: open the door' : 'Arrived: open the door to let them out') : TASKS[fare.mode] };
function clearRemote() { remote.gas = remote.brake = remote.turn = 0; remote.gear = 'D' }
const bestKey = () => mode === 'bowling' ? 'gionBowlBest' : 'gionTaxiBest';
const best = () => { try { return +(localStorage.getItem(bestKey()) || 0) } catch { return 0 } };
const saveBest = v => { try { if (v > best()) localStorage.setItem(bestKey(), v) } catch {} };
function toast(msg, good) { const t = $('gt-toast'); t.textContent = msg; t.className = good ? 'good show' : 'show'; toastT = 1.8 }
function spotAway(from, min) {
  const far = SPOTS.filter(s => Math.hypot(s.x - from.x, s.y - from.y) > min);
  const list = far.length ? far : SPOTS;
  return list[Math.floor(Math.random() * list.length)];
}
function newFare() {
  const p = spotAway(car, 45), d = spotAway(p, 70);
  fare = { mode: 'pickup', p, d, dist: Math.hypot(d.x - p.x, d.y - p.y) };
  setTask();
}
function start(m) {
  mode = m === 'bowling' ? 'bowling' : 'taxi';
  car = { x: START.x, y: START.y, h: START.h, v: 0, steer: 0 };
  yen = 0; fares = 0; clock = mode === 'bowling' ? 60 : 120; finished = false; camYaw = car.h * 180 / Math.PI + 180;
  pins = 0; score = 0; combo = 0; comboT = 0; hit = new Set(); pops = [];
  bumpCount = 0; penaltyYen = 0; penaltyTime = 0; fareTimes = []; doorOpen = 0; bumpCool = 0; ping = null; keys.clear(); clearRemote();
  if (mode === 'taxi') newFare(); else { fare = null; $('gt-task').textContent = CITYCFG.bowl + ': knock over as many pedestrians as you can' }
  $('gt-l1').textContent = mode === 'bowling' ? 'Pins' : 'Fares'; $('gt-l2').textContent = mode === 'bowling' ? 'Score' : 'Yen';
  $('gt-arrow').hidden = mode === 'bowling'; $('gt-mt').style.display = mode === 'bowling' ? 'none' : '';
  driving = true; $('gt-menu').hidden = true; $('gt-open').hidden = true; $('gt-hud').hidden = false;
  if (!playing) setPlay(true);
  stage.querySelector('canvas').focus?.();
  emit('start', mode);
}
function stop(result) {
  const was = driving;
  driving = false; window.PLAYER = null; keys.clear(); clearRemote(); ping = null;
  $('gt-hud').hidden = true; $('gt-menu').hidden = false;
  if (result) {
    if (mode === 'bowling') { saveBest(score); $('gt-result').innerHTML = `<b>Time!</b> ${pins} pin${pins === 1 ? '' : 's'}, ${score.toLocaleString()} points · best ${best().toLocaleString()}` }
    else { saveBest(yen); $('gt-result').innerHTML = `<b>Shift over.</b> ${fares} fare${fares === 1 ? '' : 's'}, ¥${yen.toLocaleString()} · best ¥${best().toLocaleString()}` }
  }
  $('gt-start').textContent = result ? 'Drive again' : 'Start driving';
  setView('cine');
  if (was) emit('stop', summary());
}
function summary() {
  return { mode, pins, score, fares, yen, best: best(), bumps: bumpCount, penaltyYen, penaltyTime,
    avgFare: fareTimes.length ? fareTimes.reduce((a, b) => a + b, 0) / fareTimes.length : 0, fastest: fareTimes.length ? Math.min(...fareTimes) : 0 };
}
$('gt-start').onclick = () => start('taxi');
$('gt-bowl').onclick = () => start('bowling');
$('gt-open').onclick = () => { $('gt-menu').hidden = false; $('gt-open').hidden = true };
$('gt-menu').insertAdjacentHTML('beforeend', '<button id="gt-close" class="gt-x" aria-label="Close">×</button>');
$('gt-close').onclick = () => { $('gt-menu').hidden = true; $('gt-open').hidden = false };

/* ---------- input ---------- */
const KEYMAP = { ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
addEventListener('keydown', e => {
  if (!driving) { if (e.key === 'Enter' && !$('gt-menu').hidden && !api.lockMenu) start('taxi'); return }
  if (e.target.closest && e.target.closest('select,input,dialog')) return;
  if (KEYMAP[e.key]) { keys.add(KEYMAP[e.key]); e.preventDefault(); e.stopPropagation() }
  else if (e.key === 'c' || e.key === 'C') toggleCam();
  else if (e.key === 'e' || e.key === 'E') openDoor();
  else if (e.key === 'Escape') stop(true);
  else if (e.key === ' ' || ['+', '=', '-', 'Home'].includes(e.key)) { e.preventDefault(); e.stopPropagation() }
}, true);
addEventListener('keyup', e => { if (KEYMAP[e.key]) keys.delete(KEYMAP[e.key]) }, true);
addEventListener('blur', () => keys.clear());
function setCam(name) { if (!CAMS[name] || name === cam) return; cam = name; toast(CAMS[cam].label, true); emit('cam', cam) }
function toggleCam() { setCam(CAM_ORDER[(CAM_ORDER.indexOf(cam) + 1) % CAM_ORDER.length]) }
// The rear door: in crew play the operator opens it at a lantern; solo, the passenger lets themself in (doorNeeded = false)
function openDoor() {
  if (!driving || !doorNeeded || !fare) return;
  if (performance.now() < mods.doorJamUntil) { toast('The door is stuck!'); emit('jammed'); return }
  doorOpen = 1.2; emit('door');
  if (!fare.atDoor) toast('Door opened');
}
// the shared input: keyboard/touch pad (0 or 1) merged with the phones (analog).
//   gas      forward throttle (keyboard ↑, or the phone's gas in D)
//   back     reverse throttle (the phone's gas in R)
//   brake    keyboard ↓: brakes, then reverses once stopped (arcade style)
//   stopper  the phone's brake pedal: brakes to a stop and never reverses
function readInput() {
  const kTurn = (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0), r = remote.gear === 'R';
  const cut = performance.now() < mods.gasCutUntil;   // Wrong Turn: a stall cuts the throttle for a moment
  return { gas: cut ? 0 : Math.max(keys.has('gas') ? 1 : 0, r ? 0 : remote.gas), back: cut || !r ? 0 : remote.gas,
    brake: keys.has('brake') ? 1 : 0, stopper: remote.brake * mods.brakeScale, turn: Math.max(-1, Math.min(1, kTurn + remote.turn + mods.turnBias)) };
}
for (const b of document.querySelectorAll('#gt-pad button')) {
  const k = b.dataset.k;
  b.onpointerdown = e => { e.preventDefault(); keys.add(k); b.setPointerCapture(e.pointerId) };
  b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => keys.delete(k);
}

/* ---------- physics ---------- */
// Arcade handling tuned for Gion's narrow lanes: quick reverse, a tight turning circle at walking pace, and walls you
// slide along instead of bouncing off. A full pedal is 1 (keyboard); phones send anything in between.
const MAX = 11, REV = 5.5, WHEELBASE = 2.7;
// how many of the car's 8 outline points are on the road (8 = it fits)
const onCount = (x, y, h) => { let n = 0; for (const c of corners(x, y, h)) if (onRoad(c)) n++; return n };
function step(dt) {
  const { gas, back, brake, stopper, turn } = readInput();
  const coast = -Math.sign(car.v) * Math.min(Math.abs(car.v), 2.2 * dt);
  if (gas > 0) car.v += gas * (car.v < 0 ? 16 : 6.2 * (1 - car.v / MAX)) * dt + (1 - gas) * coast;
  else if (back > 0) car.v -= back * (car.v > .05 ? 16 : 7 * (1 + car.v / REV)) * dt - (1 - back) * coast;   // gas in R: brake, then reverse
  else if (brake > 0) car.v -= brake * (car.v > .05 ? 16 : 7) * dt - (1 - brake) * coast;   // keyboard ↓: hard brake, then a brisk reverse
  else if (stopper > 0) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), (stopper * 16 + (1 - stopper) * 2.2) * dt);   // phone brake: to a stop
  else car.v += coast;
  car.v = Math.max(-REV, Math.min(MAX, car.v));
  const steerMax = .66 / (1 + Math.abs(car.v) * .055);   // ≈3.5 m turning radius at walking pace
  car.steer += (turn * steerMax - car.steer) * Math.min(1, dt * 11);
  move(dt);
}
function move(dt) {
  const dist = car.v * dt, nh = car.h + car.v * Math.tan(car.steer) / WHEELBASE * dt;
  if (!dist) return;
  const now = onCount(car.x, car.y, car.h);
  // a pose is allowed if it fits, or (when the car is already clipping a kerb) if it doesn't clip any more than now
  const ok = (x, y, h) => { const n = onCount(x, y, h); return n === 8 || (now < 8 && n >= now && onRoad([x, y])) };
  const at = (h, d) => [car.x + Math.cos(h) * d, car.y + Math.sin(h) * d];
  let p = at(nh, dist);
  if (ok(p[0], p[1], nh)) { car.x = p[0]; car.y = p[1]; car.h = nh; return }
  // blocked: slide along the wall. Try directions turned a little either way, keep the part of the speed that goes along
  // the wall, and turn the body gently toward the wall's direction.
  const side = Math.sign(car.steer * car.v) || 1;   // try the way the driver is steering first
  for (const a of [.18, .36, .6, .9].flatMap(a => [a * side, -a * side])) {
    const f = Math.cos(a); p = at(nh + a, dist * f);
    for (const h of [nh + Math.sign(a) * Math.min(Math.abs(a) * .5, 1.6 * dt), nh]) if (ok(p[0], p[1], h)) {   // body turns toward the wall's line, gently
      car.x = p[0]; car.y = p[1]; car.h = h; car.v *= 1 - (1 - f) * Math.min(1, dt * 7);
      if (Math.abs(car.v) > 5 && Math.abs(a) > .5) { shake = Math.max(shake, .12) }
      return;
    }
  }
  // head-on into a wall: stop (no bounce). Arcade assist: still pushing and steering, the taxi pivots slowly toward
  // the steering, so it can turn away from a wall without backing up first.
  if (Math.abs(car.v) > 4) { toast('Scrape!'); shake = .25; emit('scrape') }
  if (Math.abs(car.steer) > .05) { const ph = car.h + Math.sign(car.steer) * Math.sign(car.v) * 1.1 * dt; if (ok(car.x, car.y, ph)) car.h = ph }
  else {
    // no steering: turn toward whichever side opens up first, so a nose-on wall becomes a turn instead of a dead stop
    const step = 1.6 * dt;
    for (let k = 1; k <= 12; k++) for (const sg of [1, -1]) {
      const th = car.h + sg * k * .12, q = at(th, Math.sign(car.v) * .6);
      if (ok(q[0], q[1], th)) { const ph = car.h + sg * step; if (ok(car.x, car.y, ph)) car.h = ph; k = 99; break }
    }
  }
  car.v = 0;
}
function bumps(dt) {
  bumpCool -= dt; comboT -= dt; if (comboT <= 0) combo = 0;
  const near = window.NEAR_IN || window.NEAR;
  if (!near) return;
  const d = [Math.cos(car.h), Math.sin(car.h)], n = [-d[1], d[0]];
  for (const a of near) {
    // An easy, flowing drive: in a taxi shift people and cyclists step aside (the worker fades them as the taxi comes
    // near, see player.js), so only cars can be bumped, with a forgiving box and only above walking pace.
    if (mode === 'taxi' && (a.k !== 'car' || Math.abs(car.v) < 3)) continue;
    const rx = a.x - car.x, ry = a.y - car.y, along = rx * d[0] + ry * d[1], side = rx * n[0] + ry * n[1];
    const reach = a.k === 'car' ? Math.max(a.L, a.W) * (mode === 'taxi' ? .5 : .8) : a.k === 'bike' ? .8 : .35;
    const shrink = mode === 'taxi' ? .8 : 1;
    if (Math.abs(along) < CAR.L / 2 * shrink + reach && Math.abs(side) < CAR.W / 2 * shrink + reach * .6) {
      if (mode === 'bowling' && a.k !== 'car') {   // a pin! each person or cyclist counts once a round
        if (hit.has(a.k + a.id)) continue;
        hit.add(a.k + a.id); pins++; combo++; comboT = 2.2;
        const pts = (a.k === 'bike' ? 150 : 100) * Math.min(combo, 5); score += pts;
        pops.push({ x: a.x, y: a.y, t: performance.now() }); shake = Math.max(shake, .15); car.v *= .9;
        toast((combo >= 3 ? `Strike ×${Math.min(combo, 5)}! ` : a.k === 'bike' ? 'Spare! ' : 'Strike! ') + '+' + pts, true);
        emit('pin', { kind: a.k, pts, combo });
        continue;
      }
      if (bumpCool > 0) return;
      // a car bump: a small fee and a nudge, no time lost (bowling keeps its 3 s)
      const cost = mode === 'taxi' ? 200 : a.k === 'ped' ? 600 : a.k === 'bike' ? 400 : 300, lost = mode === 'taxi' ? 0 : 3;
      penaltyYen += Math.min(yen, cost); penaltyTime += Math.min(clock, lost); bumpCount++;
      yen = Math.max(0, yen - cost); clock = Math.max(0, clock - lost); car.v *= mode === 'taxi' ? .75 : .3; bumpCool = mode === 'taxi' ? 2 : 1.2; shake = .2;
      emit('bump', { kind: a.k, cost });
      toast(a.k === 'ped' ? 'Watch the pedestrians! −¥' + cost : a.k === 'bike' ? 'You clipped a bike! −¥' + cost : 'Fender bender! −¥' + cost);
      return;
    }
  }
}
function fareLogic() {
  if (!fare) return null;
  const target = fare.mode === 'pickup' ? fare.p : fare.d, dist = Math.hypot(target.x - car.x, target.y - car.y);
  if (dist < 4.5 && Math.abs(car.v) < 4) {   // a generous stop: near the lantern and slowing down
    if (doorNeeded && doorOpen <= 0) {   // crew play: wait at the lantern until the operator opens the door
      if (!fare.atDoor) { fare.atDoor = true; setTask(); emit('atdoor', fare.mode) }
      return target;
    }
    doorOpen = 0; fare.atDoor = false;
    if (fare.mode === 'pickup') { fare.mode = 'drop'; fare.t = 0; toast('Passenger aboard!', true); setTask(); emit('pickup') }
    else {
      const pay = Math.round((500 + fare.dist * 12 + Math.max(0, 40 - fare.t) * 25) / 10) * 10, bonus = Math.round(8 + fare.dist / 12);
      yen += pay; fares++; clock += bonus; fareTimes.push(fare.t); toast('Fare paid ¥' + pay + ' · +' + bonus + ' s', true); newFare();
      emit('dropoff', { pay, bonus });
    }
  } else if (fare.atDoor) { fare.atDoor = false; setTask() }
  return target;
}

/* ---------- the loop ---------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  if (!driving) return;
  step(dt); bumps(dt); doorOpen = Math.max(0, doorOpen - dt);
  if (fare && fare.mode === 'drop') fare.t += dt;
  const target = fareLogic();
  clock -= dt;
  if (clock <= 0) { clock = 0; stop(true); return }
  if (ping && now > ping.until) ping = null;
  pops = pops.filter(p => now - p.t < 900);
  window.PLAYER = { x: car.x, y: car.y, h: car.h, v: car.v, cut: true, ghost: mode === 'taxi', cy: camYaw, cp: CAMS[cam].pitch, ...(target ? { tx: target.x, ty: target.y, mode: fare.mode } : {}),
    ...(ping ? { px: ping.x, py: ping.y, pc: ping.color } : {}), ...(mode === 'bowling' ? { hit: [...hit], pops: pops.map(p => [p.x, p.y, (now - p.t) / 900]) } : {}) };
  // camera: kart (low, close, taxi in the lower third), chase (the original), or overhead at the plot's iso angle
  const C = CAMS[cam], want = cam === 'top' ? iso.yaw : car.h * 180 / Math.PI + 180;
  let dy = ((want - camYaw + 180) % 360 + 360) % 360 - 180; camYaw += dy * Math.min(1, dt * C.rate);
  shake = Math.max(0, shake - dt);
  const zoom = iso.zoom * C.zoom * (1 - Math.abs(car.v) / MAX * .12);
  // push the view centre up the road so the taxi sits `low` of the screen height below the middle
  const vbH = stage.clientHeight / (Math.min(stage.clientWidth / 302, stage.clientHeight / 202) * zoom || 1);
  const j = shake > 0 ? (Math.random() - .5) * shake * 2 : 0, ahead = Math.max(0, car.v) * .5 + C.low * vbH / Math.sin(C.pitch * Math.PI / 180);
  const fx = cam === 'top' ? Math.cos(car.h) : -Math.cos(camYaw * Math.PI / 180), fy = cam === 'top' ? Math.sin(car.h) : -Math.sin(camYaw * Math.PI / 180);
  view = 'drive';
  goal = camera = { yaw: camYaw, pitch: C.pitch, zoom, x: car.x + fx * ahead + j, y: car.y + fy * ahead + j, z: 1 };
  $('viewName').textContent = CITYCFG.brand;
  // HUD
  $('gt-fares').textContent = mode === 'bowling' ? pins : fares; $('gt-yen').textContent = mode === 'bowling' ? score.toLocaleString() : '¥' + yen.toLocaleString();
  $('gt-time').textContent = Math.ceil(clock); $('gt-time').classList.toggle('low', clock < 15);
  $('gt-speed').textContent = Math.round(Math.abs(car.v) * 3.6);
  $('gt-me').setAttribute('transform', `translate(${car.x} ${car.y}) rotate(${car.h * 180 / Math.PI}) scale(1.6)`);
  toastT -= dt; if (toastT <= 0) $('gt-toast').classList.remove('show');
  redraw();
  if (!target) return;
  // the arrow points from the taxi to the target, as seen on screen (camera right = (-sin yaw, cos yaw), up = -(cos yaw, sin yaw))
  const gx = target.x - car.x, gy = target.y - car.y, t = camYaw * Math.PI / 180;
  const sx = -gx * Math.sin(t) + gy * Math.cos(t), sy = gx * Math.cos(t) + gy * Math.sin(t);
  const arrow = $('gt-arrow');
  arrow.style.top = (50 + CAMS[cam].low * 100) + '%';   // around the taxi, which the kart camera keeps below the middle
  arrow.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(sx, -sy) * 180 / Math.PI}deg) translateY(-110px)`;
  arrow.querySelector('path').setAttribute('fill', fare.mode === 'pickup' ? '#f26a2e' : '#f2c94c');
  arrow.style.opacity = mods.hideTarget ? 0 : Math.hypot(gx, gy) < 12 ? .25 : 1;
  const mt = $('gt-mt'); mt.style.visibility = mods.hideTarget ? 'hidden' : ''; mt.setAttribute('cx', target.x); mt.setAttribute('cy', target.y); mt.setAttribute('fill', fare.mode === 'pickup' ? '#f26a2e' : '#f2c94c');
}
requestAnimationFrame(frame);
const api = window.GionTaxi = {
  start, stop, keys, remote, mods, toggleCam, setCam, openDoor, toast, scene: SC, onRoad, fits, lockMenu: false, CAM_ORDER, city: CITYCFG, drive: DRIVE, route,
  get car() { return car }, get driving() { return driving }, get cam() { return cam }, get mode() { return mode },
  get doorNeeded() { return doorNeeded }, set doorNeeded(v) { doorNeeded = !!v; if (!doorNeeded && fare && fare.atDoor) { fare.atDoor = false; setTask() } },
  on(name, f) { (handlers[name] = handlers[name] || []).push(f) },
  setPing(x, y, color, ms = 6000) { ping = { x, y, color, until: performance.now() + ms } },
  state() {
    if (!car) return null;
    const base = { driving, clock, cam, game: mode, gear: remote.gear, x: car.x, y: car.y, h: car.h, v: car.v, doorNeeded, ...summary() };
    if (!fare) return { ...base, atDoor: false, fareEst: 0 };
    const target = fare.mode === 'pickup' ? fare.p : fare.d;
    return { ...base, mode: fare.mode, tx: target.x, ty: target.y, atDoor: !!fare.atDoor, fareDist: fare.dist, fareT: fare.t || 0,
      fareEst: fare.mode === 'drop' ? Math.round((500 + fare.dist * 12 + Math.max(0, 40 - (fare.t || 0)) * 25) / 10) * 10 : 0 };
  },
};
})();
