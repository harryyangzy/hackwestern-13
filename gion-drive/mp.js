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
// The shooter took the navigator's seat (shoot.js); the wipers ride with doors & camera. The 'nav' code below stays
// for now but no crew size hands it out.
const ROLE_SETS = {
  1: [['steer', 'pedals', 'ops']],          // one phone drives; no shooter, so no targets either
  2: [['steer', 'ops', 'wipe'], ['pedals', 'shoot']],
  3: [['steer'], ['pedals'], ['shoot', 'ops', 'wipe']],
  4: [['steer'], ['pedals'], ['shoot'], ['ops', 'wipe']],
};
const ROLE_NAMES = { steer: 'Wheel', pedals: 'Pedals', nav: 'Navigator', ops: 'Doors', shoot: 'Shooter', wipe: 'Wipers' };
const COLORS = ['#c8513a', '#36594b', '#c9932c', '#4f6d8a'];
const CALLS = { left: ['◀', 'Turn left'], right: ['▶', 'Turn right'], straight: ['▲', 'Straight on'], uturn: ['↶', 'Turn around'], stop: ['■', 'Stop here'] };
const STALE_MS = 700, GRACE_MS = 20000;
// one line per role for the briefing before a shift
const ROLE_BRIEF = { steer: 'Wheel: steer the taxi.', pedals: 'Pedals: gas and brake; D/R to reverse.', nav: 'Navigator: call the turns.',
  shoot: 'Shooter: pop whatever flies at the windshield.', wipe: 'Wipers: swipe the glass clean.', ops: 'Doors: open the door at each lantern.' };

let ws = null, room = null, key = null, ips = [], publicUrl = null, ipIndex = 0, port = location.port, wsOk = false, retry = 0;
let phase = 'off';             // off | lobby | count | driving | results
let crew = [];                 // seat order: [{ pid, name, color, on, ready, offAt, input, lastIn }]
let result = null, countT = null, game = 'taxi';   // game: 'taxi' or 'bowling', picked in the lobby
const rolesOf = p => (ROLE_SETS[crew.length] || [])[crew.indexOf(p)] || [];
const holder = role => crew.find(p => p.on && rolesOf(p).includes(role));
const find = pid => crew.find(p => p.pid === pid);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- UI: a menu button, the lobby card, the crew strip and the navigator's callouts ---------- */
const menu = $('gt-menu');
if (served) $('gt-start').insertAdjacentHTML('afterend', '<button id="gt-mp" class="gt-ghost">Play with phones</button>');
menu.querySelector('.gt-menu-actions').insertAdjacentHTML('afterend', served
  ? '<p class="gt-keys gt-mpnote">2–4 phones share one taxi: wheel, pedals, shooter, doors &amp; wipers.</p>'
  : '<p class="gt-keys gt-mpnote">Play with phones: run <kbd>node gion-drive/server.js</kbd> and open the address it prints.</p>');
$('stage').insertAdjacentHTML('beforeend', `
<div id="gt-lobby" class="gt-card" hidden>
  <button id="gt-lclose" class="gt-x" aria-label="Close the room">×</button>
  <h2>${GT.city.brand} <span>crew shift</span></h2>
  <p class="gt-lsub">One taxi, up to four phones. Scan to join, pick up fares together.</p>
  <div id="gt-lresult"></div>
  <div class="gt-modes" role="group" aria-label="Game"><button data-game="taxi" aria-pressed="true">Taxi shift</button><button data-game="bowling" aria-pressed="false">${GT.city.bowl}</button></div>
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
  $('gt-lstart').textContent = (result ? 'Start next ' : 'Start ') + (game === 'bowling' ? 'round' : 'shift');
  for (const b of document.querySelectorAll('.gt-modes button')) b.setAttribute('aria-pressed', b.dataset.game === game);
  $('gt-lnote').textContent = !wsOk ? 'Can’t reach the crew server. Is node gion-drive/server.js still running?'
    : !crew.length ? 'Up to four phones. Two or more is best: roles are shared out by crew size.'
    : notReady ? `Waiting for ${notReady} phone${notReady === 1 ? '' : 's'} to get ready.` : 'Everyone’s ready.';
  $('gt-lresult').innerHTML = result ? resultHTML(result) : '';
  $('gt-lobby').classList.toggle('has-result', !!result);
  renderCrewStrip();
}
function rating(r) { return r.mode === 'bowling' ? (r.score >= 4000 ? 3 : r.score >= 2000 ? 2 : r.score >= 600 ? 1 : 0) : r.yen >= 15000 ? 3 : r.yen >= 8000 ? 2 : r.yen >= 3000 ? 1 : 0 }
function resultHTML(r) {
  if (r.mode === 'bowling') {
    const n = rating(r);
    return `<div class="gt-res"><b>Time!</b><span class="gt-stars" aria-label="${n} of 3">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>
      <div class="gt-resrow"><div><small>Hits</small><b>${r.pins}</b></div><div><small>Score</small><b>${r.score.toLocaleString()}</b></div><div><small>Car bumps</small><b>${r.bumps}</b></div></div>
      <p>Best ${GT.city.bowl} score ${r.best.toLocaleString()}.</p></div>`;
  }
  const stars = '★'.repeat(rating(r)) + '☆'.repeat(3 - rating(r));
  return `<div class="gt-res"><b>Shift over</b><span class="gt-stars" aria-label="${rating(r)} of 3">${stars}</span>
    <div class="gt-resrow"><div><small>Fares</small><b>${r.fares}</b></div><div><small>${GT.moneyLabel}</small><b>${GT.money(r.yen)}</b></div>
    <div><small>Bumps</small><b>${r.bumps}</b></div><div><small>Penalties</small><b>${GT.money(-r.penaltyYen)}</b></div></div>
    <p>${r.fares ? `Average ride ${r.avgFare.toFixed(0)} s, fastest ${r.fastest.toFixed(0)} s. ` : 'No fares this time. '}${r.bumps ? `Bumps cost ${Math.round(r.penaltyTime)} s on the clock. ` : 'Not a scratch on the taxi. '}Best ever ${GT.money(r.best)}.</p>${r.shots != null ? `<p>Shooter ${r.hits} popped of ${r.shots} shot${r.shots === 1 ? '' : 's'}${r.bestCombo > 1 ? `, best streak ${r.bestCombo}` : ''}. ${r.stuckOn ? `${r.stuckOn} reached the glass, ${r.wiped} wiped off.` : 'Nothing reached the glass.'}</p>` : ''}</div>`;
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
  } else if (typeof m.t === 'string' && m.t.startsWith('dx-')) window.GionCrew.onDx?.(m);   // Wrong Turn (wt.js)
}
const num = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function onPhone(p, m) {
  p.on = true;
  const roles = rolesOf(p);
  switch (m.t) {
    case 'hello': sendMap(p.pid); broadcastLobby(); if (lastRoute) toPhones(lastRoute, p.pid); break;
    case 'seat': {   // a phone picks a role set: it swaps seats with whoever holds it (lobby only)
      const i = m.i, j = crew.indexOf(p);
      if ((phase === 'lobby' || phase === 'results') && Number.isInteger(i) && i >= 0 && i < crew.length && i !== j) {
        [crew[i], crew[j]] = [crew[j], crew[i]]; crew[i].ready = crew[j].ready = false; rolesChanged(); broadcastLobby();
      }
      break;
    }
    case 'ready':
      if (phase === 'lobby' || phase === 'results') { p.ready = !!m.v; broadcastLobby() }
      break;
    case 'in':   // continuous controls; only from the role's holder and only during a shift
      if (phase !== 'driving') break;
      if (roles.includes('steer') && num(m.turn)) p.input.turn = clamp(m.turn, -1, 1);
      if (roles.includes('pedals')) { if (num(m.gas)) p.input.gas = clamp(m.gas, 0, 1); if (num(m.brake)) p.input.brake = clamp(m.brake, 0, 1); if (m.gear === 'D' || m.gear === 'R') p.input.gear = m.gear }
      p.lastIn = performance.now(); applyInputs();
      break;
    case 'door': if (phase === 'driving' && roles.includes('ops')) GT.openDoor(); break;
    case 'cam': if (phase === 'driving' && roles.includes('ops') && GT.CAM_ORDER.includes(m.cam)) GT.setCam(m.cam); break;
    case 'call': if (phase === 'driving' && roles.includes('nav') && CALLS[m.d]) { showCall(m.d, p); toPhones({ t: 'ev', k: 'call', d: m.d }) } break;
    case 'ping':
      if (phase === 'driving' && roles.includes('nav') && num(m.x) && num(m.y) && Math.abs(m.x) <= HALF && Math.abs(m.y) <= HALF) {
        showPing(m.x, m.y, p.color); toPhones({ t: 'ev', k: 'ping', x: m.x, y: m.y });
      }
      break;
    default:   // other roles' messages (shoot.js: aim, fire, wipe); the extension checks role and phase itself
      if (window.GionCrewExt && window.GionCrewExt.onPhone) window.GionCrewExt.onPhone(p, m, roles, phase);
  }
}
// merge the phones into the shared input; a phone that stopped sending (backgrounded, out of range) lets go
function applyInputs() {
  const now = performance.now(), r = GT.remote;
  let turn = 0, gas = 0, brake = 0, gear = 'D';
  if (phase === 'driving') for (const p of crew) {
    if (!p.on || now - p.lastIn > STALE_MS) continue;
    turn += p.input.turn; gas = Math.max(gas, p.input.gas); brake = Math.max(brake, p.input.brake);
    if (p.input.gear === 'R') gear = 'R';
  }
  r.turn = clamp(turn, -1, 1); r.gas = gas; r.brake = brake; r.gear = gear;
  GT.doorNeeded = phase === 'driving' && !!holder('ops');
}
function rolesChanged() {
  for (const p of crew) p.input = { turn: 0, gas: 0, brake: 0 };
  applyInputs();
}
function broadcastLobby() {
  renderLobby();
  toPhones({ t: 'lobby', phase, room, result, game, brand: GT.city.brand, bowl: GT.city.bowl, money: GT.city.money, canStart: canStart(),
    seats: crew.map(p => ({ pid: p.pid, name: p.name, color: p.color, roles: rolesOf(p), on: p.on, ready: p.ready })) });
}
function sendMap(to) {
  const ring = r => 'M' + r.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
  toPhones({ t: 'map', half: HALF, roads: GT.drive.map(rs => rs.map(ring).join('')).join(''), water: SC.water.map(rs => rs.map(ring).join('')).join(''),
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
function startCountdown(force) {
  if (!canStart()) return;
  if (force !== true && window.GionCrew.beforeStart?.()) return;   // Wrong Turn: wagers are locked in first, then it calls startCountdown(true)
  phase = 'count'; for (const p of crew) p.ready = false;
  showLobby(false); menu.hidden = true; broadcastLobby();
  // the briefing (flow.js): the objective and each player's job, then a 3-2-1 the phones follow
  if (window.GionBrief) {
    toPhones({ t: 'brief' });
    window.GionBrief({
      title: game === 'bowling' ? GT.city.bowl : 'Crew shift',
      objective: game === 'bowling' ? 'Knock over as many pedestrians as you can in 60 seconds.' : 'Pick up and deliver passengers together before the shift ends.',
      lines: crew.map(p => ({ color: p.color, name: p.name, text: rolesOf(p).map(r => ROLE_BRIEF[r] || r).join(' ') })),
      onCount: n => toPhones({ t: 'count', n }), abort: () => phase !== 'count',
    }).then(() => { if (phase !== 'count') return; GT.lockMenu = false; GT.start(game) });
    return;
  }
  let n = 3; const el = $('gt-count');
  const tick = () => {
    if (phase !== 'count') { el.hidden = true; return }
    if (n === 0) { el.hidden = true; GT.lockMenu = false; GT.start(game); return }
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
for (const k of ['bump', 'pickup', 'dropoff', 'scrape', 'door', 'atdoor', 'pin']) GT.on(k, d => { if (phase === 'driving') toPhones({ t: 'ev', k, ...(d && typeof d === 'object' ? d : { v: d }) }) });
GT.on('cam', cam => { if (phase === 'driving') toPhones({ t: 'ev', k: 'cam', cam }) });

if (served) $('gt-mp').onclick = openRoom;
// close the room; on a ?play=crew page (flow.js) go back to city selection, so no room is left behind
$('gt-lclose').onclick = () => { const home = $('gt-lclose').dataset.home; closeRoom(); if (home) (window.GionFlow ? window.GionFlow.leave(home) : (location.href = home)) };
$('gt-lstart').onclick = () => startCountdown();
document.querySelector('.gt-modes').onclick = e => { const b = e.target.closest('[data-game]'); if (b && (phase === 'lobby' || phase === 'results')) { game = b.dataset.game; broadcastLobby() } };
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

/* ---------- the navigator's route: drive.js keeps the road grid (GT.route) ---------- */
let lastTarget = null, lastRoute = null;
const route = st => GT.route(st);

/* ---------- the 10 Hz picture of the shift for the phones, and the watchdogs ---------- */
let routeT = 0;
function sendState() {
  const st = GT.state(); if (!st || phase !== 'driving') return;
  const now = performance.now();
  if (now - routeT > 400 && holder('nav') && st.tx != null) {
    routeT = now;
    try { const r = route(st); if (r) { const m = { t: 'route', ...r }; if (!lastRoute || JSON.stringify(m.pts) !== JSON.stringify(lastRoute.pts)) toPhones(m); lastRoute = m } } catch (e) { console.error(e) }
  }
  toPhones({ t: 's', game: st.game, clock: +st.clock.toFixed(1), yen: st.yen, fares: st.fares, pins: st.pins, score: st.score, v: +st.v.toFixed(2), x: +st.x.toFixed(2), y: +st.y.toFixed(2), h: +st.h.toFixed(3),
    gear: st.gear, mode: st.mode, tx: st.tx, ty: st.ty, atDoor: st.atDoor, doorNeeded: st.doorNeeded, cam: st.cam, fareEst: st.fareEst, dist: st.tx != null && lastRoute ? lastRoute.len : null });
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
window.GionCrew = { open: openRoom, toPhones, holder, get phase() { return phase }, get room() { return room }, get crew() { return crew.map(p => ({ ...p, roles: rolesOf(p) })) }, joinURL, route: () => GT.state() && route(GT.state()),
  // used by Wrong Turn mode (wt.js)
  send, canStart, startCountdown, get game() { return game }, get wsOk() { return wsOk }, onDx: null };
})();
