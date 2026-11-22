/* Gion Taxi crew play (the laptop side). Runs after drive.js and uses its API (window.GionTaxi).
   The laptop is the authority: it owns the one shared taxi, the roles, the ready states and the shift. Phones
   (pad.html) send input and actions over the crew server (server.js); this file checks every message, merges the
   phones' pedals and wheel into GionTaxi.remote, and sends the phones a 10 Hz picture of the shift.
   Opened from file:// there is no server, so the menu just explains how to start one. */
(() => {
const GT = window.GionTaxi, $ = id => document.getElementById(id);
if (!GT) return;
const CHAR = window.GionCrew || null;   // crew.js: the seat characters (fox, bear, owl, raccoon); kept on the export below
const SC = GT.scene, HALF = SC.meta.half;
const served = /^https?:$/.test(location.protocol);

/* ---------- roles: which roles each phone holds, by crew size (seat order) ---------- */
// The shooter took the navigator's seat (shoot.js). With four phones the last seat rubs fog off the glass (fog.js),
// so doors move to the pedals. The 'nav' code below
// stays for now but no crew size hands it out.
// No crew has a wiper any more: stuck visitors clear themselves after 10 s (shoot.js). The 'wipe' role code stays.
const ROLE_SETS = {
  1: [['steer', 'pedals', 'ops']],          // one phone drives; no shooter, so no targets either
  2: [['steer', 'ops'], ['pedals', 'shoot']],
  3: [['steer'], ['pedals'], ['shoot', 'ops']],
  4: [['steer'], ['pedals', 'ops'], ['shoot'], ['fog']],
};
const ROLE_NAMES = { steer: 'Wheel', pedals: 'Pedals', nav: 'Navigator', ops: 'Doors', shoot: 'Shooter', wipe: 'Wipers', fog: 'Fog' };
const COLORS = ['#c8513a', '#36594b', '#c9932c', '#4f6d8a'];
const CALLS = { left: ['◀', 'Turn left'], right: ['▶', 'Turn right'], straight: ['▲', 'Straight on'], uturn: ['↶', 'Turn around'], stop: ['■', 'Stop here'] };
const STALE_MS = 700, GRACE_MS = 20000;
// one line per role for the briefing before a shift
const ROLE_BRIEF = { steer: 'Wheel: steer the taxi.', pedals: 'Pedals: gas and brake; D/R to reverse.', nav: 'Navigator: call the turns.',
  shoot: 'Shooter: pop whatever flies at the windshield.', wipe: 'Wipers: swipe the glass clean.', ops: 'Doors: open the door at each lantern.',
  fog: 'Fog: rub the fog off the windshield so the driver can see.' };

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
  ? '<p class="gt-keys gt-mpnote">2–4 phones share one taxi: wheel, pedals, shooter, doors &amp; fog.</p>'
  : '<p class="gt-keys gt-mpnote">Play with phones: run <kbd>node gion-drive/server.js</kbd> and open the address it prints.</p>');
$('stage').insertAdjacentHTML('beforeend', `
<div id="gt-lobby" class="gt-card" hidden>
  <button id="gt-lclose" class="gt-x" aria-label="Close the room">×</button>
  <div id="gt-lresult"></div>
  <div class="gt-modes" role="group" aria-label="Game"><span class="gt-clay" aria-hidden="true"></span><button data-game="taxi" aria-pressed="true">Taxi shift</button><button data-game="bowling" aria-pressed="false">${GT.city.bowl}</button></div>
  <div class="gt-lgrid">
    <figure class="gt-qr">
      <div id="gt-qr" aria-live="polite"></div>
      <figcaption><small>Room</small><b id="gt-room">····</b><span id="gt-url"></span><button id="gt-ip" hidden>Other network ›</button></figcaption>
    </figure>
    <div class="gt-crewcol"><ol id="gt-seats"></ol><p class="gt-lnote" id="gt-lnote" hidden></p><button id="gt-lstart" disabled>Start shift</button></div>
  </div>
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
// a seat's character; falls back to the old colour dot if crew.js is missing
const face = color => CHAR ? `<span class="gt-face">${CHAR.icon(color, 40)}</span>` : '<i></i>';
function renderLobby() {
  if (phase === 'off') return;
  $('gt-room').textContent = room || '····';
  const url = joinURL();
  if (url) {
    $('gt-qr').innerHTML = GTQR.svg(url);
    $('gt-url').textContent = url.replace(/^https?:\/\//, '').replace(/\?r=.*/, '');
  } else $('gt-qr').innerHTML = `<p class="gt-qrmsg">${!wsOk ? 'Connecting to the crew server…' : 'No network found. Connect this laptop to Wi-Fi or a phone’s hotspot.'}</p>`;
  $('gt-ip').hidden = ips.length < 2 || isLanHost() || !!publicUrl;
  $('gt-lobby').classList.toggle('public', !!publicUrl);
  const seats = [], free = COLORS.filter(c => !crew.some(p => p.color === c));   // the characters still to be taken, in join order
  for (let i = 0; i < 4; i++) {
    const p = crew[i];
    if (!p) { seats.push(`<li class="empty" title="Open seat" aria-label="Seat ${i + 1}, open">${face(free.shift())}</li>`); continue }
    const status = !p.on ? 'Reconnecting…' : phase === 'driving' || phase === 'count' ? 'On shift' : p.ready ? 'Ready' : 'Not ready';
    seats.push(`<li style="--c:${p.color}" class="${p.on ? '' : 'off'} ${p.ready ? 'ready' : ''}">${face(p.color)}<div><b>${esc(p.name)}</b><small>${rolesOf(p).map(r => ROLE_NAMES[r]).join(' · ')}</small></div>
      <span class="st">${status}</span>${crew.length > 1 ? `<button data-swap="${i}" title="Swap roles with the next seat" aria-label="Swap roles">⇅</button>` : ''}<button data-kick="${i}" title="Remove this phone" aria-label="Remove ${esc(p.name)}">×</button></li>`);
  }
  $('gt-seats').innerHTML = seats.join('');
  const notReady = crew.filter(p => !p.ready || !p.on).length;
  $('gt-lstart').disabled = !canStart();
  // the Start button says what it's waiting for, so the card needs no notes
  $('gt-lstart').textContent = !crew.length ? 'Scan the code to join' : notReady ? `Waiting for ${notReady} to get ready` : (result ? 'Start next ' : 'Start ') + (game === 'bowling' ? 'round' : 'shift');
  for (const b of document.querySelectorAll('.gt-modes button')) b.setAttribute('aria-pressed', b.dataset.game === game);
  $('gt-lnote').textContent = wsOk ? '' : 'Can’t reach the crew server. Is node gion-drive/server.js still running?';
  $('gt-lnote').hidden = wsOk;
  // only redraw the results card for a new result, or its route animation would restart every time someone gets ready
  if ($('gt-lresult')._r !== result) { $('gt-lresult')._r = result; $('gt-lresult').innerHTML = result ? resultHTML(result) : '' }
  $('gt-lobby').classList.toggle('has-result', !!result);
  renderCrewStrip();
}
function rating(r) { return r.mode === 'bowling' ? (r.score >= 4000 ? 3 : r.score >= 2000 ? 2 : r.score >= 600 ? 1 : 0) : r.yen >= 15000 ? 3 : r.yen >= 8000 ? 2 : r.yen >= 3000 ? 1 : 0 }
// the results card: the shift's route drawn on the city map, then the "lights go off" and the route and stats glow
// like glow-in-the-dark ink before settling to a softer glow
function routeMap(r) {
  const t = r.trail || [];
  if (!GT.mapBase || t.length < 2) return '';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of t) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const A = 2.5, pad = 14;   // a wide frame around the route, never tighter than 70 m across
  let w = Math.max(x1 - x0 + 2 * pad, 70), h = Math.max(y1 - y0 + 2 * pad, 28);
  if (w / h < A) w = h * A; else h = w / A;
  const H = GT.half;   // stay inside the city plot, so the frame never shows the blank beyond its edge
  if (w > 2 * H) { w = 2 * H; h = w / A }
  const clamp = (v, half) => Math.min(H - half, Math.max(-H + half, v));
  const cx = clamp((x0 + x1) / 2, w / 2), cy = clamp((y0 + y1) / 2, h / 2), sw = (w / 600).toFixed(2);
  const d = 'M' + t.map(p => p[0] + ' ' + p[1]).join('L');
  const dots = (r.marks || []).map(([x, y, k], i) => `<circle class="gt-rm gt-rm-${k}" cx="${x}" cy="${y}" r="${(k === 'p' || k === 'd' ? 5.5 : 3.6) * sw}" style="animation-delay:${(.3 + 1.6 * i / Math.max(1, r.marks.length)).toFixed(2)}s"/>`).join('');
  const [sx, sy] = t[0], [ex, ey] = t[t.length - 1];
  return `<svg class="gt-rmap" viewBox="${(cx - w / 2).toFixed(1)} ${(-cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><filter id="gt-rblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(sw * 3).toFixed(2)}"/></filter></defs>
    <g transform="scale(1,-1)">${GT.mapBase()}
      <rect class="gt-rdusk" x="${-GT.half}" y="${-GT.half}" width="${2 * GT.half}" height="${2 * GT.half}"/>
      <path class="gt-rglow" d="${d}" pathLength="1" style="stroke-width:${(sw * 9).toFixed(2)}"/>
      <path class="gt-rline" d="${d}" pathLength="1" style="stroke-width:${(sw * 3.2).toFixed(2)}"/>
      ${dots}
      <circle class="gt-rstart" cx="${sx}" cy="${sy}" r="${sw * 4}" style="stroke-width:${sw * 2}"/>
      <circle class="gt-rend" cx="${ex}" cy="${ey}" r="${sw * 6}" style="stroke-width:${sw * 2.4}"/></g></svg>`;
}
function resultHTML(r) {
  const n = rating(r), stars = `<span class="gt-stars" aria-label="${n} of 3">${'★'.repeat(n)}<i>${'☆'.repeat(3 - n)}</i></span>`;
  const km = r.dist >= 1000 ? (r.dist / 1000).toFixed(1) + '<u>km</u>' : Math.round(r.dist || 0) + '<u>m</u>';
  const stat = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
  const bowl = r.mode === 'bowling';
  const big = bowl ? r.score.toLocaleString() : GT.money(r.yen);
  const stats = bowl ? [stat(r.pins, 'Hits'), stat(km, 'Driven'), stat(r.bumps, 'Car bumps'), stat(r.best.toLocaleString(), 'Best')]
    : [stat(r.fares, r.fares === 1 ? 'Fare' : 'Fares'), stat(km, 'Driven'), stat(r.fares ? r.fastest.toFixed(0) + '<u>s</u>' : '–', 'Fastest ride'),
       stat(r.bumps, r.bumps === 1 ? 'Bump' : 'Bumps'), ...(r.shots != null ? [stat(`${r.hits}<u>/${r.shots}</u>`, 'Popped')] : [])];
  const map = routeMap(r);
  return `<div class="gt-res gt-glow${map ? '' : ' nomap'}">
    ${map}
    <div class="gt-rhead"><b>${bowl ? 'Time!' : 'Shift over'}</b>${stars}</div>
    <div class="gt-rstats">
      <div class="gt-rbig"><small>${bowl ? 'Score' : GT.moneyLabel}</small><b>${big}</b>${!bowl && r.penaltyYen ? `<em>${GT.money(-r.penaltyYen)} in bumps</em>` : `<em>Best ${bowl ? r.best.toLocaleString() : GT.money(r.best)}</em>`}</div>
      <div class="gt-rrow">${stats.join('')}</div>
    </div></div>`;
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
window.GionCrew = { ...(CHAR || {}), open: openRoom, toPhones, holder, get phase() { return phase }, get room() { return room }, get crew() { return crew.map(p => ({ ...p, roles: rolesOf(p) })) }, joinURL, route: () => GT.state() && route(GT.state()),
  // used by Wrong Turn mode (wt.js)
  send, canStart, startCountdown, get game() { return game }, get wsOk() { return wsOk }, onDx: null };
})();
