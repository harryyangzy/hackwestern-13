/* Gion Taxi crew play (the laptop side). Runs after drive.js and uses its API (window.GionTaxi).
   The laptop is the authority: it owns the one shared taxi, the roles, the ready states and the shift. Phones
   (pad.html) send input and actions over the crew server (server.js); this file checks every message, merges the
   phones' pedals and wheel into GionTaxi.remote, and sends the phones a 10 Hz picture of the shift.
   Opened from file:// there is no server, so the menu just explains how to start one. */
(() => {
const GT = window.GionTaxi, $ = id => document.getElementById(id);
if (!GT) return;
const SC = GT.scene, HALF = SC.meta.half;
const served = /^https?:$/.test(location.protocol);

/* ---------- roles: which roles each phone holds, by crew size (seat order) ---------- */
const ROLE_SETS = {
  1: [['steer', 'pedals', 'ops']],
  2: [['steer', 'ops'], ['pedals', 'nav']],
  3: [['steer'], ['pedals'], ['nav', 'ops']],
  4: [['steer'], ['pedals'], ['nav'], ['ops']],
};
const ROLE_NAMES = { steer: 'Wheel', pedals: 'Pedals', nav: 'Navigator', ops: 'Doors & camera' };
const COLORS = ['#c8513a', '#36594b', '#c9932c', '#4f6d8a'];
const CALLS = { left: ['◀', 'Turn left'], right: ['▶', 'Turn right'], straight: ['▲', 'Straight on'], uturn: ['↶', 'Turn around'], stop: ['■', 'Stop here'] };
const STALE_MS = 700, GRACE_MS = 20000;

let ws = null, room = null, key = null, ips = [], publicUrl = null, ipIndex = 0, port = location.port, wsOk = false, retry = 0;
let phase = 'off';             // off | lobby | count | driving | results
let crew = [];                 // seat order: [{ pid, name, color, on, ready, offAt, input, lastIn }]
let result = null, countT = null;
const rolesOf = p => (ROLE_SETS[crew.length] || [])[crew.indexOf(p)] || [];
const holder = role => crew.find(p => p.on && rolesOf(p).includes(role));
const find = pid => crew.find(p => p.pid === pid);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- UI: a menu button, the lobby card, the crew strip and the navigator's callouts ---------- */
const menu = $('gt-menu');
$('gt-start').insertAdjacentHTML('afterend', served
  ? '<button id="gt-mp" class="gt-ghost">Play with phones</button><p class="gt-keys gt-mpnote">2–4 phones share one taxi: wheel, pedals, navigator, doors.</p>'
  : '<p class="gt-keys gt-mpnote">Play with phones: run <kbd>node gion-drive/server.js</kbd> and open the address it prints.</p>');
$('stage').insertAdjacentHTML('beforeend', `
<div id="gt-lobby" class="gt-card" hidden>
  <button id="gt-lclose" class="gt-x" aria-label="Close the room">×</button>
  <h2>Gion Taxi <span>crew shift</span></h2>
  <p class="gt-lsub">One taxi, up to four phones. Scan to join, pick up fares together.</p>
  <div id="gt-lresult"></div>
  <div class="gt-lgrid">
    <figure class="gt-qr">
      <div id="gt-qr" aria-live="polite"></div>
      <figcaption><small>Room</small><b id="gt-room">····</b><span id="gt-url"></span><span id="gt-net"></span><button id="gt-ip" hidden>Other network ›</button></figcaption>
    </figure>
    <div class="gt-crewcol"><ol id="gt-seats"></ol><p class="gt-lnote" id="gt-lnote"></p></div>
  </div>
  <button id="gt-lstart" disabled>Start shift</button>
  <p class="gt-keys gt-lhelp gt-lanhelp">Phones on the same Wi-Fi as this laptop. Campus Wi-Fi often blocks phones from reaching a laptop: then restart the server with <kbd>--tunnel</kbd>, or put everyone on one phone's Personal Hotspot.</p>
</div>
<div id="gt-count" hidden></div>`);
$('gt-hud').insertAdjacentHTML('beforeend', '<div id="gt-call" class="gt-card" hidden></div><div id="gt-crew" class="gt-card" hidden></div>');
const mapG = $('gt-map').querySelector('g');
mapG.insertAdjacentHTML('beforeend', '<g id="gt-mping" visibility="hidden"><circle r="7" fill="none" stroke-width="1.6"><animate attributeName="r" values="3;9;3" dur="1.4s" repeatCount="indefinite"/></circle><circle r="2.6"/></g>');

function showLobby(on) {
  $('gt-lobby').hidden = !on;
  if (on) { menu.hidden = true; $('gt-open').hidden = true }
  GT.lockMenu = on;
}
function renderLobby() {
  if (phase === 'off') return;
  $('gt-room').textContent = room || '····';
  const url = joinURL();
  if (url) {
    $('gt-qr').innerHTML = GTQR.svg(url);
    $('gt-url').textContent = url.replace(/^https?:\/\//, '').replace(/\?r=.*/, '');
    $('gt-net').textContent = publicUrl ? 'Over the internet: any network works' : 'Same Wi-Fi as this laptop';
  } else $('gt-qr').innerHTML = `<p class="gt-qrmsg">${!wsOk ? 'Connecting to the crew server…' : 'No network found. Connect this laptop to Wi-Fi or a phone’s hotspot.'}</p>`;
  $('gt-ip').hidden = ips.length < 2 || isLanHost() || !!publicUrl;
  $('gt-lobby').classList.toggle('public', !!publicUrl);
  const seats = [];
  for (let i = 0; i < 4; i++) {
    const p = crew[i];
    if (!p) { seats.push(`<li class="empty"><i></i><div><b>Seat ${i + 1}</b><small>${i === 0 ? 'Scan the code to join' : 'Waiting for a phone'}</small></div></li>`); continue }
    const status = !p.on ? 'Reconnecting…' : phase === 'driving' || phase === 'count' ? 'On shift' : p.ready ? 'Ready' : 'Not ready';
    seats.push(`<li style="--c:${p.color}" class="${p.on ? '' : 'off'} ${p.ready ? 'ready' : ''}"><i></i><div><b>${esc(p.name)}</b><small>${rolesOf(p).map(r => ROLE_NAMES[r]).join(' · ')}</small></div>
      <span class="st">${status}</span>${crew.length > 1 ? `<button data-swap="${i}" title="Swap roles with the next seat" aria-label="Swap roles">⇅</button>` : ''}<button data-kick="${i}" title="Remove this phone" aria-label="Remove ${esc(p.name)}">×</button></li>`);
  }
  $('gt-seats').innerHTML = seats.join('');
  const notReady = crew.filter(p => !p.ready || !p.on).length;
  $('gt-lstart').disabled = !canStart();
  $('gt-lstart').textContent = result ? 'Start next shift' : 'Start shift';
  $('gt-lnote').textContent = !wsOk ? 'Can’t reach the crew server. Is node gion-drive/server.js still running?'
    : !crew.length ? 'Up to four phones. Two or more is best: roles are shared out by crew size.'
    : notReady ? `Waiting for ${notReady} phone${notReady === 1 ? '' : 's'} to get ready.` : 'Everyone’s ready.';
  $('gt-lresult').innerHTML = result ? resultHTML(result) : '';
  $('gt-lobby').classList.toggle('has-result', !!result);
  renderCrewStrip();
}
function rating(r) { return r.yen >= 15000 ? 3 : r.yen >= 8000 ? 2 : r.yen >= 3000 ? 1 : 0 }
function resultHTML(r) {
  const stars = '★'.repeat(rating(r)) + '☆'.repeat(3 - rating(r));
  return `<div class="gt-res"><b>Shift over</b><span class="gt-stars" aria-label="${rating(r)} of 3">${stars}</span>
    <div class="gt-resrow"><div><small>Fares</small><b>${r.fares}</b></div><div><small>Yen</small><b>¥${r.yen.toLocaleString()}</b></div>
    <div><small>Bumps</small><b>${r.bumps}</b></div><div><small>Penalties</small><b>−¥${r.penaltyYen.toLocaleString()}</b></div></div>
    <p>${r.fares ? `Average ride ${r.avgFare.toFixed(0)} s, fastest ${r.fastest.toFixed(0)} s. ` : 'No fares this time. '}${r.bumps ? `Bumps cost ${Math.round(r.penaltyTime)} s on the clock. ` : 'Not a scratch on the taxi. '}Best ever ¥${r.best.toLocaleString()}.</p></div>`;
}
function renderCrewStrip() {
  const el = $('gt-crew'), on = phase === 'driving' && crew.length;
  el.hidden = !on;
  if (on) el.innerHTML = crew.map(p => `<span class="${p.on ? '' : 'off'}" style="--c:${p.color}"><i></i>${rolesOf(p).map(r => ROLE_NAMES[r]).join(' · ')}</span>`).join('');
}
let callT = 0;
function showCall(dir, p) {
  const [icon, text] = CALLS[dir];
  const el = $('gt-call');
  el.innerHTML = `<i style="background:${p.color}"></i><span class="gt-callicon">${icon}</span><span>${text}</span>`;
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(callT); callT = setTimeout(() => { el.hidden = true }, 3200);
}
function showPing(x, y, color) {
  GT.setPing(x, y, color, 6000);
  const g = $('gt-mping'); g.setAttribute('transform', `translate(${x} ${y})`); g.setAttribute('visibility', 'visible');
  g.querySelector('circle').setAttribute('stroke', color); g.lastElementChild.setAttribute('fill', color);
  clearTimeout(showPing.t); showPing.t = setTimeout(() => g.setAttribute('visibility', 'hidden'), 6000);
}

/* ---------- networking ---------- */
const isLanHost = () => !['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
function joinURL() {
  if (!room) return null;
  if (publicUrl) return `${publicUrl}/join?r=${room}`;   // a public tunnel works from any network, so it wins
  const host = isLanHost() ? location.host : ips.length ? `${ips[ipIndex % ips.length]}:${port}` : null;
  return host ? `${location.protocol}//${host}/join?r=${room}` : null;
}
function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)) }
const toPhones = (m, to = '*') => send({ t: 'to', to, m });
function connect() {
  const s = ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  s.onopen = () => {
    wsOk = true; retry = 0;
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('gtRoom') || '{}') } catch {}
    send({ t: 'host', room: saved.room, key: saved.key });
  };
  s.onmessage = e => { let m; try { m = JSON.parse(e.data) } catch { return } onServer(m) };
  s.onclose = () => {
    if (ws !== s) return;
    wsOk = false; ws = null;
    for (const p of crew) { p.on = false; p.offAt = p.offAt || performance.now() }
    applyInputs(); renderLobby();
    if (phase !== 'off') setTimeout(connect, Math.min(4000, 500 * 2 ** retry++));
  };
}
function onServer(m) {
  if (m.t === 'room') {
    if (room && m.room !== room) { crew = []; result = null }   // the server forgot our room (it restarted): a new room, phones must rescan
    room = m.room; key = m.key; ips = m.ips || []; publicUrl = m.publicUrl || null; port = m.port || port;
    try { sessionStorage.setItem('gtRoom', JSON.stringify({ room, key })) } catch {}
    renderLobby();
  } else if (m.t === 'peer') {
    let p = find(m.pid);
    if (m.on && !p) {
      if (crew.length >= 4) return send({ t: 'drop', pid: m.pid });
      const used = new Set(crew.map(c => c.color)), names = new Set(crew.map(c => c.name));
      p = { pid: m.pid, name: 'Player ' + [1, 2, 3, 4].find(n => !names.has('Player ' + n)), color: COLORS.find(c => !used.has(c)),
        on: true, ready: false, offAt: 0, input: { turn: 0, gas: 0, brake: 0 }, lastIn: 0 };
      crew.push(p); rolesChanged();
    } else if (p) {
      p.on = !!m.on; p.offAt = m.on ? 0 : performance.now();
      if (!m.on) { p.input = { turn: 0, gas: 0, brake: 0 }; applyInputs() }   // release a dropped phone's wheel and pedals at once
    }
    broadcastLobby();
  } else if (m.t === 'from') {
    const p = find(m.pid);
    if (p) onPhone(p, m.m || {});
  }
}
const num = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function onPhone(p, m) {
  p.on = true;
  const roles = rolesOf(p);
  switch (m.t) {
    case 'hello': sendMap(p.pid); broadcastLobby(); if (lastRoute) toPhones(lastRoute, p.pid); break;
    case 'ready':
      if (phase === 'lobby' || phase === 'results') { p.ready = !!m.v; broadcastLobby() }
      break;
    case 'in':   // continuous controls; only from the role's holder and only during a shift
      if (phase !== 'driving') break;
      if (roles.includes('steer') && num(m.turn)) p.input.turn = clamp(m.turn, -1, 1);
      if (roles.includes('pedals')) { if (num(m.gas)) p.input.gas = clamp(m.gas, 0, 1); if (num(m.brake)) p.input.brake = clamp(m.brake, 0, 1) }
      p.lastIn = performance.now(); applyInputs();
      break;
    case 'door': if (phase === 'driving' && roles.includes('ops')) GT.openDoor(); break;
    case 'cam': if (phase === 'driving' && roles.includes('ops') && typeof m.chase === 'boolean' && m.chase !== GT.chase) GT.toggleCam(); break;
    case 'call': if (phase === 'driving' && roles.includes('nav') && CALLS[m.d]) { showCall(m.d, p); toPhones({ t: 'ev', k: 'call', d: m.d }) } break;
    case 'ping':
      if (phase === 'driving' && roles.includes('nav') && num(m.x) && num(m.y) && Math.abs(m.x) <= HALF && Math.abs(m.y) <= HALF) {
        showPing(m.x, m.y, p.color); toPhones({ t: 'ev', k: 'ping', x: m.x, y: m.y });
      }
      break;
  }
}
// merge the phones into the shared input; a phone that stopped sending (backgrounded, out of range) lets go
function applyInputs() {
  const now = performance.now(), r = GT.remote;
  let turn = 0, gas = 0, brake = 0;
  if (phase === 'driving') for (const p of crew) {
    if (!p.on || now - p.lastIn > STALE_MS) continue;
    turn += p.input.turn; gas = Math.max(gas, p.input.gas); brake = Math.max(brake, p.input.brake);
  }
  r.turn = clamp(turn, -1, 1); r.gas = gas; r.brake = brake;
  GT.doorNeeded = phase === 'driving' && !!holder('ops');
}
function rolesChanged() {
  for (const p of crew) p.input = { turn: 0, gas: 0, brake: 0 };
  applyInputs();
}
function broadcastLobby() {
  renderLobby();
  toPhones({ t: 'lobby', phase, room, result, canStart: canStart(),
    seats: crew.map(p => ({ pid: p.pid, name: p.name, color: p.color, roles: rolesOf(p), on: p.on, ready: p.ready })) });
}
function sendMap(to) {
  const ring = r => 'M' + r.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
  toPhones({ t: 'map', half: HALF, roads: SC.roads.map(rs => rs.map(ring).join('')).join(''), water: SC.water.map(rs => rs.map(ring).join('')).join(''),
    bldg: SC.buildings.map(b => ring(b.ring)).join('') }, to);
}
const canStart = () => wsOk && crew.length > 0 && crew.every(p => p.on && p.ready) && (phase === 'lobby' || phase === 'results');

/* ---------- lifecycle: lobby → countdown → shift → results → (ready again) → next shift ---------- */
function openRoom() {
  phase = result ? 'results' : 'lobby'; showLobby(true); renderLobby();
  if (!ws) connect();
  refreshInfo();
}
function closeRoom() {
  send({ t: 'close' }); try { sessionStorage.removeItem('gtRoom') } catch {}
  const s = ws; ws = null; if (s) s.close();
  phase = 'off'; room = null; crew = []; result = null; wsOk = false; applyInputs();
  showLobby(false); menu.hidden = false; renderCrewStrip();
}
function startCountdown() {
  if (!canStart()) return;
  phase = 'count'; for (const p of crew) p.ready = false;
  showLobby(false); menu.hidden = true; broadcastLobby();
  let n = 3; const el = $('gt-count');
  const tick = () => {
    if (phase !== 'count') { el.hidden = true; return }
    if (n === 0) { el.hidden = true; GT.lockMenu = false; GT.start(); return }
    el.textContent = n; el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    toPhones({ t: 'count', n }); n--; countT = setTimeout(tick, 900);
  };
  tick();
}
GT.on('start', () => {
  if (phase === 'off') return;
  phase = 'driving'; GT.lockMenu = true; lastTarget = null; lastRoute = null;
  for (const p of crew) { p.input = { turn: 0, gas: 0, brake: 0 }; p.lastIn = 0 }   // nothing carries over from the last shift
  applyInputs(); broadcastLobby(); sendState();
});
GT.on('stop', r => {
  if (phase === 'off') return;
  phase = 'results'; result = r; for (const p of crew) { p.ready = false; p.input = { turn: 0, gas: 0, brake: 0 } }
  applyInputs(); showLobby(true); broadcastLobby();
});
for (const k of ['bump', 'pickup', 'dropoff', 'scrape', 'door', 'atdoor']) GT.on(k, d => { if (phase === 'driving') toPhones({ t: 'ev', k, ...(d && typeof d === 'object' ? d : { v: d }) }) });
GT.on('cam', chase => { if (phase === 'driving') toPhones({ t: 'ev', k: 'cam', chase }) });

if (served) $('gt-mp').onclick = openRoom;
$('gt-lclose').onclick = closeRoom;
$('gt-lstart').onclick = startCountdown;
$('gt-ip').onclick = () => { ipIndex++; renderLobby() };
$('gt-seats').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.swap != null) { const i = +b.dataset.swap, j = (i + 1) % crew.length; [crew[i], crew[j]] = [crew[j], crew[i]]; rolesChanged() }
  else if (b.dataset.kick != null) { const p = crew[+b.dataset.kick]; if (p) { send({ t: 'drop', pid: p.pid }); crew.splice(crew.indexOf(p), 1); rolesChanged() } }
  broadcastLobby();
};
addEventListener('keydown', e => { if (e.key === 'Enter' && !$('gt-lobby').hidden && canStart()) { e.preventDefault(); startCountdown() } });
async function refreshInfo() {
  if (!served || phase === 'off') return;
  try { const r = await (await fetch('/info', { cache: 'no-store' })).json(); const before = joinURL(); ips = r.ips || []; publicUrl = r.publicUrl || null; port = r.port || port; if (joinURL() !== before) renderLobby() } catch {}
}
setInterval(() => { if (!$('gt-lobby').hidden) refreshInfo() }, 5000);

/* ---------- the navigator's route: a breadth-first distance field over 2 m road cells, rebuilt per fare stage ---------- */
const CELL = 2, N = Math.ceil(2 * HALF / CELL);
let walk = null;
const cx = i => -HALF + (i + .5) * CELL;
function buildWalk() {
  walk = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), y = cx(j);
    walk[j * N + i] = [[0, 0], [.8, 0], [-.8, 0], [0, .8], [0, -.8]].every(([dx, dy]) => GT.onRoad([x + dx, y + dy])) ? 1 : 0;
  }
}
const cellOf = (x, y) => [clamp(Math.floor((x + HALF) / CELL), 0, N - 1), clamp(Math.floor((y + HALF) / CELL), 0, N - 1)];
function nearestWalk(x, y) {
  const [i0, j0] = cellOf(x, y);
  for (let r = 0; r < 8; r++) {
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
let field = null, lastTarget = null, lastRoute = null;
function buildField(tx, ty) {
  field = new Int32Array(N * N).fill(-1);
  const s = nearestWalk(tx, ty); if (s == null) return;
  const q = [s]; field[s] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], i = c % N, j = (c - i) / N;
    for (const [di, dj] of NB) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni;
      if (walk[n] && field[n] < 0 && (!di || !dj || (walk[j * N + ni] && walk[nj * N + i]))) { field[n] = field[c] + 1; q.push(n) }
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
  if (tk !== lastTarget) { buildField(st.tx, st.ty); lastTarget = tk }
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

/* ---------- the 10 Hz picture of the shift for the phones, and the watchdogs ---------- */
let routeT = 0;
function sendState() {
  const st = GT.state(); if (!st || phase !== 'driving') return;
  const now = performance.now();
  if (now - routeT > 400 && holder('nav')) {
    routeT = now;
    try { const r = route(st); if (r) { const m = { t: 'route', ...r }; if (!lastRoute || JSON.stringify(m.pts) !== JSON.stringify(lastRoute.pts)) toPhones(m); lastRoute = m } } catch (e) { console.error(e) }
  }
  toPhones({ t: 's', clock: +st.clock.toFixed(1), yen: st.yen, fares: st.fares, v: +st.v.toFixed(2), x: +st.x.toFixed(2), y: +st.y.toFixed(2), h: +st.h.toFixed(3),
    mode: st.mode, tx: st.tx, ty: st.ty, atDoor: st.atDoor, doorNeeded: st.doorNeeded, chase: st.chase, fareEst: st.fareEst, dist: lastRoute ? lastRoute.len : null });
}
setInterval(() => {
  if (phase === 'off') return;
  const now = performance.now();
  applyInputs();
  if (phase === 'driving') sendState();
  // a phone gone longer than the grace period gives up its seat; roles are shared out again (keyboard covers meanwhile)
  const gone = crew.filter(p => !p.on && p.offAt && now - p.offAt > GRACE_MS);
  if (gone.length && wsOk) { for (const p of gone) { send({ t: 'drop', pid: p.pid }); crew.splice(crew.indexOf(p), 1) } rolesChanged(); broadcastLobby() }
}, 100);
setInterval(() => send({ t: 'hb' }), 2000);
window.GionCrew = { get phase() { return phase }, get room() { return room }, get crew() { return crew.map(p => ({ ...p, roles: rolesOf(p) })) }, joinURL, route: () => GT.state() && route(GT.state()) };
})();
