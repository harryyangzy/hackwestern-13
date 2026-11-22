/* Gion Taxi phone controller: the shooter and wiper instruments. Loaded by pad.html after its own script; uses
   window.GionPad (send, roles, phase, pid, room, buzz, toast) and gets the laptop's 'sh'/'sx' messages through
   window.GionPadExt. The laptop (shoot.js) owns the targets; this page only aims, shoots and wipes, and draws a small
   picture of the glass from the laptop's 10 Hz updates.

   Aiming: deviceorientation → the direction out of the phone's back → heading and pitch, relative to a centre the
   player sets by pointing at the middle of the laptop. A One Euro filter takes out the jitter without adding lag.
   Browsers only give motion data to secure pages, so on the LAN's plain-HTTP address "Tilt to aim" moves this phone to
   the server's HTTPS port (same seat: the id goes along in the link). Without tilt, dragging on the panel aims. */
(() => {
const P = window.GionPad, $ = id => document.getElementById(id);
if (!P) return;
const has = r => P.roles.includes(r);
const driving = () => P.phase === 'driving';

/* ---------- the visitors, small: cuties.js draws them, the same as the windshield ---------- */
const CU = window.GionCuties, KINDS = CU ? CU.KINDS : [];
let sh = null;   // the laptop's latest picture

/* ---------- One Euro filter: smooth when still, responsive when moving ---------- */
function oneEuro(minCut = 1.1, beta = .45, dCut = 1) {
  let x = null, dx = 0, t = 0;
  const alpha = (c, dt) => { const r = 2 * Math.PI * c * dt; return r / (r + 1) };
  return { reset() { x = null; dx = 0 }, f(v, now) {
    if (x == null) { x = v; t = now; return v }
    const dt = Math.max(1e-3, (now - t) / 1000); t = now;
    dx += alpha(dCut, dt) * ((v - x) / dt - dx);
    x += alpha(minCut + beta * Math.abs(dx), dt) * (v - x); return x;
  } };
}
const fx = oneEuro(), fy = oneEuro();

/* ---------- aiming ---------- */
const RANGE_X = 24, RANGE_Y = 15;   // degrees from the centre to the edge of the laptop screen
let mode = 'none', centre = null, raw = null, aimX = 0, aimY = 0, lastSent = 0, sentKey = '', kick = 0, orientAt = 0;
const D = Math.PI / 180;
function onOrient(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  const a = e.alpha * D, b = e.beta * D, g = e.gamma * D;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  // world direction out of the phone's back: −(third column of Rz(α)·Rx(β)·Ry(γ)); x east, y north, z up
  const vx = -(ca * sg + sa * sb * cg), vy = -(sa * sg - ca * sb * cg), vz = -(cb * cg);
  raw = { h: Math.atan2(vx, vy) / D, p: Math.asin(Math.max(-1, Math.min(1, vz))) / D };
  orientAt = performance.now();
  if (mode !== 'tilt') { mode = 'tilt'; recentre(); updateHints() }
  if (!centre) recentre();
  let dh = raw.h - centre.h; dh = ((dh + 540) % 360) - 180;
  const now = performance.now();
  aimX = clamp(fx.f(dh / RANGE_X, now), -1.08, 1.08);
  aimY = clamp(fy.f(-(raw.p - centre.p) / RANGE_Y, now), -1.08, 1.08);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function recentre() { if (raw) { centre = { ...raw }; fx.reset(); fy.reset(); aimX = aimY = 0 } }
async function enableTilt() {
  if (!window.isSecureContext) {   // motion sensors need https: hop to the server's https port, keeping this seat
    let port = null; try { port = (await (await fetch('/info', { cache: 'no-store' })).json()).httpsPort } catch {}
    if (!port) { P.toast('Tilt needs the https link. Drag on the panel to aim instead.'); mode = 'drag'; updateHints(); return }
    $('aimHint').textContent = 'Opening the secure link… if the phone warns about the certificate, choose to continue.';
    location.href = `https://${location.hostname}:${port}/join?r=${encodeURIComponent(P.room)}&pid=${P.pid}&tilt=1`;
    return;
  }
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') { P.toast('Motion access was declined. Drag to aim.'); mode = 'drag'; updateHints(); return }
    }
  } catch { /* asked outside a tap: the button tap will ask again */ }
  addEventListener('deviceorientation', onOrient);
  $('aimHint').textContent = 'Waiting for the gyroscope…';
  setTimeout(() => { if (mode !== 'tilt') { mode = 'drag'; P.toast('No gyroscope data. Drag to aim.'); updateHints() } }, 1500);
}
function updateHints() {
  $('aimTilt').hidden = mode === 'tilt';
  $('aimCentre').hidden = mode !== 'tilt';
  $('aimHint').textContent = mode === 'tilt' ? 'Point at the middle of the laptop and tap Centre · tap anywhere here to shoot'
    : mode === 'drag' ? 'Drag to move the crosshair · tap to shoot' : 'Tap “Tilt to aim” to aim with the phone, or drag here';
}
$('aimTilt').addEventListener('click', e => { e.stopPropagation(); enableTilt() });
$('aimCentre').addEventListener('click', e => { e.stopPropagation(); recentre(); P.buzz(10) });
for (const b of ['aimTilt', 'aimCentre']) $(b).addEventListener('pointerdown', e => e.stopPropagation());

// the panel is the trigger; in drag mode it is also a trackpad (a short, still touch is a shot)
const pad = $('c-aim');
let drag = null;
pad.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  if (mode === 'tilt') return shoot();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, ax: aimX, ay: aimY };
  pad.setPointerCapture(e.pointerId);
  if (mode === 'none') { mode = 'drag'; updateHints() }
});
pad.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const r = pad.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
  aimX = clamp(drag.ax + dx / r.width * 2.4, -1.05, 1.05); aimY = clamp(drag.ay + dy / r.height * 2.4, -1.05, 1.05);
});
const up = e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.moved < 10 && performance.now() - drag.t < 300) shoot();
  drag = null;
};
for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, up);
function shoot() {
  if (!driving() || !has('shoot')) return;
  P.send({ t: 'fire', x: +aimX.toFixed(3), y: +aimY.toFixed(3) }); lastSent = performance.now();
  kick = 1; P.buzz(12);
  pad.classList.remove('shot'); void pad.offsetWidth; pad.classList.add('shot');
}
let cameForTilt = !!new URLSearchParams(location.search).get('tilt'); try { cameForTilt = cameForTilt || !!sessionStorage.getItem('gtTilt') } catch {}
if (cameForTilt) {   // arrived from the http address
  try { sessionStorage.setItem('gtTilt', '1') } catch {}
  addEventListener('deviceorientation', onOrient);   // Android starts at once; iOS waits for the button tap to ask
  setTimeout(() => { if (mode !== 'tilt') updateHints() }, 800);
}

/* ---------- wipers: swipe across the glass ---------- */
const glass = $('c-wipe');
let sw = null, wipeLocal = 0, wipeLocalAt = 0;
glass.addEventListener('pointerdown', e => { e.preventDefault(); sw = { id: e.pointerId, x: e.clientX, t: performance.now(), done: false }; glass.setPointerCapture(e.pointerId) });
glass.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id || sw.done) return;
  const dx = e.clientX - sw.x, w = glass.getBoundingClientRect().width;
  if (Math.abs(dx) > Math.max(40, w * .25)) { sw.done = true; wipeNow(Math.sign(dx)) }
});
for (const ev of ['pointerup', 'pointercancel']) glass.addEventListener(ev, e => { if (sw && e.pointerId === sw.id) sw = null });
function wipeNow(d) {
  if (!driving() || !has('wipe')) return;
  P.send({ t: 'wipe', d }); P.buzz(18); wipeLocal = d; wipeLocalAt = performance.now();
}

/* ---------- messages from the laptop ---------- */
window.GionPadExt = m => {
  if (m.t === 'sh') { sh = m; return }
  if (m.t !== 'sx') return;
  // hits, misses and levels show on the laptop: the phones only feel them
  if (m.k === 'stick' && has('wipe')) { P.buzz([30, 40, 30]); glass.classList.remove('shot'); void glass.offsetWidth; glass.classList.add('shot') }
};

/* ---------- drawing the two small panels ---------- */
function canvasFit(c) {
  const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (r.width && (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d))) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d) }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
  return [g, r.width, r.height];
}
function glassRect(w, h, top = 22, bottom = 26) {   // the laptop screen's shape, fitted into the panel
  const ar = sh && sh.ar || 1.6, aw = w - 16, ah = h - top - bottom, gw = Math.min(aw, ah * ar), gh = gw / ar;
  return { x: (w - gw) / 2, y: top + (ah - gh) / 2, w: gw, h: gh };
}
function mini(g, k, x, y, r, color, alpha, state = 'fly') {
  if (CU) CU.draw(g, KINDS[k] || KINDS[0], x, y, r, color, { state, alpha, t: performance.now() / 1000, ph: k });
  else { g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.beginPath(); g.arc(x, y, r * .7, 0, 6.283); g.fill(); g.restore() }
}
function drawAim() {
  const [g, w, h] = canvasFit($('aimView')), R = glassRect(w, h, 40, 30);
  g.strokeStyle = '#afb5a5'; g.lineWidth = 1; g.setLineDash([3, 4]); g.strokeRect(R.x, R.y, R.w, R.h); g.setLineDash([]);
  if (sh) {
    for (const [, k, x, y, s, c] of sh.tg) mini(g, k, R.x + x * R.w, R.y + y * R.h, Math.max(6, 15 * s), c, .9);
    for (const [, k, x, y, , c] of sh.st) mini(g, k, R.x + x * R.w, R.y + y * R.h, 15, c, .45, 'stuck');
    // level and score are on the laptop
  }
  // my crosshair, with a small kick on each shot
  const cx = R.x + (.5 + aimX * .5) * R.w, cy = R.y + (.5 + aimY * .5) * R.h - kick * 4, r = 9 * (1 + kick * .3);
  const me = getComputedStyle(document.documentElement).getPropertyValue('--me').trim() || '#c8513a';
  g.strokeStyle = me; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
  g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + dx * (r - 3), cy + dy * (r - 3)); g.lineTo(cx + dx * (r + 5), cy + dy * (r + 5)) } g.stroke();
}
function drawWipe() {
  const [g, w, h] = canvasFit($('wipeView')), R = glassRect(w, h, 30, 26);
  g.fillStyle = '#ffffff66'; g.strokeStyle = '#afb5a5'; g.lineWidth = 1; g.beginPath(); g.roundRect ? g.roundRect(R.x, R.y, R.w, R.h, 8) : g.rect(R.x, R.y, R.w, R.h); g.fill(); g.stroke();
  const n = sh ? sh.st.length : 0;
  if (sh) for (const [, k, x, y, hp, c] of sh.st) mini(g, k, R.x + x * R.w, R.y + y * R.h, Math.max(12, R.w / 19), c, hp > 1 ? .95 : .8, 'stuck');
  // the blade: the laptop's sweep, or a quick local one right after a swipe
  const sweep = sh && sh.wipe ? sh.wipe : 0;
  if (sweep || wipeLocal) {
    const p = sweep ? Math.abs(sweep) : .5, dir = sweep ? Math.sign(sweep) : wipeLocal, a = dir * 72 * D * (2 * p - 1);
    g.save(); g.translate(R.x + R.w / 2, R.y + R.h * 1.12); g.rotate(a); g.strokeStyle = '#263c35aa'; g.lineCap = 'round';
    g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R.h * .6); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(0, -R.h * .35); g.lineTo(0, -R.h * 1.05); g.stroke(); g.restore();
  }
  const el = $('wipeCount'); el.textContent = n ? `${n} on the glass` : 'Glass clear'; el.classList.toggle('full', !!sh && n >= sh.cap);
}

/* ---------- loop: send the aim (≤ 30 Hz while it changes), draw ---------- */
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  kick *= Math.exp(-dt * 14); if (wipeLocal && now - wipeLocalAt > 250) wipeLocal = 0;
  if (driving() && has('shoot') && mode !== 'none') {
    const key = aimX.toFixed(3) + ',' + aimY.toFixed(3);
    if ((key !== sentKey && now - lastSent > 33) || now - lastSent > 500) { P.send({ t: 'aim', x: +aimX.toFixed(3), y: +aimY.toFixed(3) }); sentKey = key; lastSent = now }
  }
  if (P.screen === 'drive') { if (has('shoot')) drawAim(); if (has('wipe')) drawWipe() }
}
requestAnimationFrame(frame);
updateHints();
window.GionPadShoot = { get aim() { return [aimX, aimY] }, get mode() { return mode }, shoot, wipe: wipeNow, recentre, onOrient };
})();
