/* Gion Taxi crew play: the shooter and the wipers (laptop side). Runs after drive.js, before mp.js.
   Little paper-sticker visitors (cuties.js: cats, sparrows, blossoms, maple leaves, lanterns, ladybugs, mochi) drift in from the street ahead and stick to the windshield unless the
   shooter (phone gyro → crosshair, tap → shoot) pops them first. Whatever sticks, the wiper player sweeps off.
   The laptop is the authority, as for the rest of crew play: phones send aim/fire/wipe through mp.js
   (window.GionCrewExt.onPhone), this file runs the targets and sends phones a 10 Hz picture ('sh') plus events ('sx').
   Solo play never sees any of this: targets only appear in a crew shift while a phone holds the shooter role. */
(() => {
const GT = window.GionTaxi, $ = id => document.getElementById(id);
if (!GT) return;
const crew = () => window.GionCrew;
const holder = r => { const c = crew(); return c && c.holder ? c.holder(r) : null };
const toPhones = m => { const c = crew(); if (c && c.toPhones) c.toPhones(m) };

/* ---------- the visitors: drawn by cuties.js, which the phone shares ---------- */
const CU = window.GionCuties;
if (!CU) return;
const SPR = CU.META, KINDS = CU.KINDS;   // per kind: how it moves, and how many hits it takes (hp)
// colours that sit in each season's scenery (soft inks, never neon); at night they become lit lantern tones
const PALETTE = {
  spring: ['#d9738f', '#e79aac', '#7f9f5c', '#b98a2e', '#9a6fb0', '#c8513a'],
  summer: ['#2f7f78', '#d96b4f', '#c9932c', '#4f7ea8', '#6b9a4f', '#a85a7a'],
  autumn: ['#ac4931', '#c9782e', '#8a4a2a', '#b8902a', '#6d5a8a', '#4f6d5a'],
  winter: ['#4f6d8a', '#7d93ad', '#b0566a', '#7f78ad', '#3f6f66', '#9a7a4a'],
  night:  ['#ffd98a', '#fbd3dd', '#fff3c4', '#ffb85c', '#bfe0e6', '#f6c445'],
};
// the page's chosen scene: Pocket City's page globals `season` (an id) and SEASONS/OCCASIONS (with night/leaves flags)
let sceneId = null, sceneLook = 'summer';
function scenery() {
  let id = null; try { id = typeof season !== 'undefined' ? season : null } catch {}
  if (id === sceneId) return sceneLook;
  let s = {}; try { s = [...(typeof SEASONS !== 'undefined' ? SEASONS : []), ...(typeof OCCASIONS !== 'undefined' ? OCCASIONS : [])].find(x => x.id === id) || {} } catch {}
  sceneId = id;
  return sceneLook = s.night ? 'night' : PALETTE[s.id] ? s.id : s.leaves === 'blossom' ? 'spring' : s.leaves === 'autumn' ? 'autumn' : s.leaves === 'bare' ? 'winter' : 'summer';
}

/* ---------- levels: gentle first, more and livelier with every fare delivered ---------- */
// just a couple at a time: `live` fly at once, at most `cap` stick. A full glass (cap reached) stops the taxi until it's wiped.
const LV = [
  { every: 5.5, approach: 6.6, live: 1, cap: 2, kinds: ['blossom', 'lantern', 'neko'], moves: ['drift'], note: 'Level 1 · a visitor or two' },
  { every: 5.0, approach: 6.0, live: 2, cap: 2, kinds: ['blossom', 'lantern', 'neko', 'sparrow'], moves: ['drift', 'wobble'], note: 'Level 2 · sparrows join in' },
  { every: 4.5, approach: 5.4, live: 2, cap: 3, kinds: ['blossom', 'lantern', 'neko', 'sparrow', 'leaf'], moves: ['drift', 'wobble', 'zigzag'], note: 'Level 3 · maple leaves zigzag' },
  { every: 4.0, approach: 4.9, live: 2, cap: 3, kinds: KINDS, moves: ['drift', 'wobble', 'zigzag', 'orbit'], note: 'Level 4 · ladybugs and mochi circle in' },
  { every: 3.6, approach: 4.4, live: 3, cap: 3, kinds: KINDS, moves: ['wobble', 'zigzag', 'orbit', 'dart'], note: 'Level 5 · everything darts' },
];

/* ---------- the layer ---------- */
$('gt-hud').insertAdjacentHTML('beforebegin', '<canvas id="gt-shoot" aria-hidden="true"></canvas>');
$('gt-hud').insertAdjacentHTML('beforeend', '<div id="gt-shootbar" class="gt-card" hidden></div><div id="gt-shootnote" hidden></div>');
const cv = $('gt-shoot'), g = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function fit() {
  const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1);
  if (r.width && (Math.round(r.width * DPR) !== cv.width || Math.round(r.height * DPR) !== cv.height)) { cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR) }
  W = r.width; H = r.height;
}

/* ---------- state ---------- */
let on = false, level = 0, spawnT = 0, nextId = 1, targets = [], stuck = [], parts = [], fx = [];
let aim = null, aimShown = null, aimAt = 0, aimColor = '#c8513a', recoil = 0, combo = 0, lastFire = 0;
let wipe = null, stats = null, lastFares = 0, sendT = 0, pal = 'summer';
const resetStats = () => ({ shots: 0, hits: 0, stuck: 0, wiped: 0, bestCombo: 0 });
stats = resetStats();
const VP = { x: .5, y: .38 };                       // where they come from: the street ahead, just above the taxi
const inCore = (x, y) => ((x - .5) / .17) ** 2 + ((y - .56) / .30) ** 2 < 1;   // the taxi and the road ahead stay clear
const underHud = (x, y) => y < .2 || (x > .8 && y < .34) || (x < .22 && y > .8) || (x > .76 && y > .82);   // stats, minimap, crew strip, shooter bar

function reset() {
  targets = []; stuck = []; parts = []; fx = []; wipe = null; seizeUntil = 0; aim = null; aimShown = null; level = 0; spawnT = 1.6; combo = 0; recoil = 0;
  lastFares = 0; stats = resetStats(); $('gt-shootbar').hidden = true; g.clearRect(0, 0, cv.width, cv.height);
}
GT.on('start', reset);
// shooter stats go into the shift summary before mp.js shows the results (this file loads first, so it hears 'stop' first)
GT.on('stop', r => {
  if (r && on) Object.assign(r, { shots: stats.shots, hits: stats.hits, stuckOn: stats.stuck, wiped: stats.wiped, bestCombo: stats.bestCombo });
  on = false; reset();
});

function pickFinal() {
  let best = null, bestD = -1;
  for (let k = 0; k < 40; k++) {
    const x = .07 + Math.random() * .86, y = .2 + Math.random() * .7;
    if (inCore(x, y) || underHud(x, y)) continue;
    let d = 9; for (const o of [...stuck, ...targets]) d = Math.min(d, Math.hypot((o.fx - x) * W / H, o.fy - y));
    if (d > .22) return [x, y];
    if (d > bestD) { bestD = d; best = [x, y] }
  }
  return best || [Math.random() < .5 ? .14 : .86, .5];
}
function spawn() {
  const L = LV[level], kind = L.kinds[Math.floor(Math.random() * L.kinds.length)], [fx0, fy0] = pickFinal();
  const colors = PALETTE[pal];
  targets.push({ id: nextId++, kind, move: L.moves[Math.floor(Math.random() * L.moves.length)], t: 0, T: L.approach * (.85 + Math.random() * .3),
    fx: fx0, fy: fy0, ph: Math.random() * 6.28, color: colors[Math.floor(Math.random() * colors.length)], hp: SPR[kind].hp || 1, flash: 0, x: VP.x, y: VP.y, s: .2 });
}

/* where a flying target is now: from the vanishing point out to its spot on the glass, growing as it nears */
function place(o) {
  const p = Math.min(1, o.t / o.T), grow = p ** 1.55, fade = 1 - p ** 4, t = o.t, a = Math.min(W, H) / Math.max(1, W);
  let dx = 0, dy = 0;
  if (o.move === 'wobble') dx = Math.sin(t * 2.3 + o.ph) * .07;
  else if (o.move === 'zigzag') dx = (2 / Math.PI) * Math.asin(Math.sin(t * 2.2 + o.ph)) * .09;
  else if (o.move === 'orbit') { dx = Math.cos(t * 2.6 + o.ph) * .07; dy = Math.sin(t * 2.6 + o.ph) * .06 }
  else if (o.move === 'dart') dx = Math.tanh(5 * Math.sin(t * 1.4 + o.ph)) * .1;
  const k = SPR[o.kind].move;
  if (k === 'hop') dy -= Math.abs(Math.sin(t * 5 + o.ph)) * .025;
  else if (k === 'flutter') dy += Math.sin(t * 8 + o.ph) * .018;
  else if (k === 'sway') dx += Math.sin(t * 3 + o.ph) * .012;
  o.x = VP.x + (o.fx - VP.x) * grow + dx * a * fade * (.4 + grow);
  o.y = VP.y + (o.fy - VP.y) * grow + dy * fade * (.4 + grow);
  o.s = .16 + .84 * grow;
  if (k === 'beat') o.s *= 1 + .07 * Math.max(0, Math.sin(t * 6.5 + o.ph));
}
const fontPx = () => Math.max(13, Math.min(26, Math.min(W, H) * .03));
function box(o, scale) {   // the sticker's size on screen, in px (r is its radius)
  const r = fontPx() * 1.55 * scale;
  return { w: 2 * r, h: 2 * r, r };
}
const look = o => o.flash > 0 ? 'hit' : 'fly';

/* ---------- the shooter ---------- */
function fire(x, y, color) {
  const now = performance.now();
  if (now - lastFire < 110) return;   // a trigger, not a hose
  lastFire = now; stats.shots++; recoil = 1;
  const px = x * W, py = y * H;
  let hit = null, hitD = Infinity;
  for (const o of targets) {   // nearest (largest) first; stuck ones are behind the glass's reach: they're the wipers' job
    const b = box(o, o.s), dx = Math.abs(px - o.x * W), dy = Math.abs(py - o.y * H);
    if (dx < b.w * .6 + 10 && dy < b.h * .6 + 10) { const d = -o.s; if (d < hitD) { hitD = d; hit = o } }
  }
  if (!hit) { combo = 0; sound.miss(); fx.push({ x: px, y: py, t: 0, color, miss: true }); toPhones({ t: 'sx', k: 'miss' }); return }
  hit.hp--; hit.flash = .18;
  if (hit.hp > 0) { sound.tink(); toPhones({ t: 'sx', k: 'nick', kind: hit.kind }); return }
  targets.splice(targets.indexOf(hit), 1);
  stats.hits++; combo++; stats.bestCombo = Math.max(stats.bestCombo, combo);
  burst(hit, hit.s, 1); sound.pop(combo);
  fx.push({ x: hit.x * W, y: hit.y * H, t: 0, color: hit.color });
  toPhones({ t: 'sx', k: 'hit', kind: hit.kind, combo });
}
function burst(o, scale, power) {   // the sticker pops into petals and confetti in its own colours
  const b = box(o, scale), cx = o.x * W, cy = o.y * H;
  for (const q of CU.confetti(o.color, 14)) {
    const ang = Math.random() * 6.283, d = b.r * Math.random() * .6, sp = (90 + Math.random() * 170) * power * (.6 + scale * .6);
    parts.push({ ...q, x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60 * power,
      r: Math.random() * 6, vr: (Math.random() - .5) * 10, life: .7 + Math.random() * .35, t: 0, fs: b.r * .22 * q.size });
  }
}

/* ---------- the glass and the wipers ---------- */
function arrive(o) {
  targets.splice(targets.indexOf(o), 1);
  if (stuck.length >= LV[level].cap) {   // the glass is full enough: it bounces off, so the road stays drivable
    burst(o, 1, .45); sound.bounce(); toPhones({ t: 'sx', k: 'bounce' }); return;
  }
  o.stuckAt = 0; o.hp = SPR[o.kind].hp || 1; o.x = o.fx; o.y = o.fy; o.slide = 0;
  stuck.push(o); stats.stuck++; combo = 0; sound.splat();
  toPhones({ t: 'sx', k: 'stick', kind: o.kind });
}
// Wrong Turn: a gust slaps a few visitors straight onto the glass, past the shooter (looks like a bad wave)
function flurry(n = 3) {
  if (!on) return;
  const L = LV[level], colors = PALETTE[pal];
  let kind = null;
  for (let i = 0; i < n && stuck.length < L.cap; i++) {
    kind = L.kinds[Math.floor(Math.random() * L.kinds.length)];
    const [x, y] = pickFinal();
    stuck.push({ id: nextId++, kind, move: 'drift', t: 0, T: 1, fx: x, fy: y, x, y, s: 1, ph: Math.random() * 6.28, flash: 0,
      color: colors[Math.floor(Math.random() * colors.length)], hp: SPR[kind].hp || 1, stuckAt: 0, slide: 0 });
    stats.stuck++;
  }
  if (!kind) return;
  combo = 0; sound.splat(); toPhones({ t: 'sx', k: 'stick', kind });
}
const PIVOT = () => ({ x: .5 * W, y: H * 1.12 });
const WIPE_S = .55, SWEEP = 72 * Math.PI / 180;
let seizeUntil = 0, seizeToldAt = 0;   // Wrong Turn: the wiper motor seizes for a few seconds
function startWipe(dir) {
  if (wipe) return;   // one sweep at a time
  const now = performance.now();
  if (now < seizeUntil) { if (now - seizeToldAt > 1500) { seizeToldAt = now; GT.toast('The wipers are stuck!') } toPhones({ t: 'sx', k: 'seized' }); return }
  wipe = { t: 0, dir: dir < 0 ? -1 : 1, done: new Set() };
  sound.swish(); toPhones({ t: 'sx', k: 'wipe' });
}
function bladeAngle() { const p = wipe.t / WIPE_S, e = p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; return wipe.dir * SWEEP * (2 * e - 1) }   // from one side to the other
function stepWipe(dt) {
  if (!wipe) return;
  wipe.t += dt;
  const pv = PIVOT(), a = bladeAngle();
  for (const o of [...stuck]) {
    if (wipe.done.has(o.id)) continue;
    const oa = Math.atan2(o.x * W - pv.x, pv.y - o.y * H);   // 0 = straight up from the pivot
    if (wipe.dir * (a - oa) >= 0) {
      wipe.done.add(o.id); o.hp--;
      if (o.hp <= 0) { stuck.splice(stuck.indexOf(o), 1); stats.wiped++; burst(o, 1.45, .35); o.dead = true; toPhones({ t: 'sx', k: 'wiped', kind: o.kind }) }
      else { o.smear = 1; o.x += wipe.dir * .015 }
    }
  }
  if (wipe.t >= WIPE_S) wipe = null;
}

/* ---------- drawing ---------- */
function draw(dt) {
  fit(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  // flying ones, far to near
  for (const o of [...targets].sort((a, b) => a.s - b.s)) {
    const near = o.s, alpha = Math.min(1, .35 + o.t / o.T * 1.6);
    CU.draw(g, o.kind, o.x * W, o.y * H, box(o, near).r, o.color, { t: o.t, ph: o.ph, state: look(o), alpha: alpha * (o.flash > 0 ? .8 : 1), night: pal === 'night' });
    if (o.t / o.T > .78) {   // about to land: a small soft ring on the glass where it will stick
      const p = (o.t / o.T - .78) / .22; g.save(); g.globalAlpha = .25 * p; g.strokeStyle = o.color; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(o.fx * W, o.fy * H, 26 + 14 * (1 - p), 18 + 10 * (1 - p), 0, 0, 6.283); g.stroke(); g.restore();
    }
  }
  // stuck to the glass: squashed a little, sliding slowly, smeared after a wiper pass
  for (const o of stuck) {
    const k = Math.min(1, o.stuckAt / .18), sq = 1 + .18 * Math.sin(Math.min(1, o.stuckAt / .25) * Math.PI);
    CU.draw(g, o.kind, o.x * W, (o.y + o.slide) * H, box(o, 1.45).r, o.color, { state: 'stuck', ph: o.ph, alpha: (o.smear ? .62 : .92) * (.6 + .4 * k), sx: sq * 1.06, sy: 1 / sq * .94, night: pal === 'night' });
  }
  // the wiper blade
  if (wipe) {
    const pv = PIVOT(), a = bladeAngle(), L = H * 1.02;
    g.save(); g.translate(pv.x, pv.y); g.rotate(a);
    g.strokeStyle = pal === 'night' ? '#fffcf366' : '#263c3577'; g.lineCap = 'round';
    g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * .55); g.stroke();
    g.lineWidth = 6; g.strokeStyle = pal === 'night' ? '#fffcf388' : '#263c35aa'; g.beginPath(); g.moveTo(0, -L * .3); g.lineTo(0, -L); g.stroke();
    g.restore();
  }
  // particles
  for (const q of parts) {
    const a = Math.max(0, 1 - q.t / q.life);
    CU.drawBit(g, q, q.x, q.y, q.fs, q.r, a);
  }
  // hit rings and miss dots
  for (const f of fx) {
    const p = f.t / (f.miss ? .3 : .45);
    g.save(); g.globalAlpha = Math.max(0, 1 - p) * (f.miss ? .5 : .8); g.strokeStyle = f.color; g.lineWidth = f.miss ? 1 : 1.6;
    g.beginPath(); g.arc(f.x, f.y, f.miss ? 3 + 6 * p : 8 + 30 * p, 0, 6.283); g.stroke(); g.restore();
  }
  // the crosshair, in the shooter's seat colour; kicks up a little on each shot
  if (aimShown && performance.now() - aimAt < 1500) {
    const x = aimShown.x * W, y = aimShown.y * H - recoil * 7, r = 15 * (1 + recoil * .22);
    g.save(); g.strokeStyle = '#fffcf3'; g.lineWidth = 4; g.globalAlpha = .7; ring(x, y, r); g.restore();
    g.save(); g.strokeStyle = aimColor; g.lineWidth = 1.8; ring(x, y, r); g.fillStyle = aimColor; g.beginPath(); g.arc(x, y, 1.8, 0, 6.283); g.fill(); g.restore();
  }
}
function ring(x, y, r) {
  g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke();
  g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(x + dx * (r - 4), y + dy * (r - 4)); g.lineTo(x + dx * (r + 6), y + dy * (r + 6)) } g.stroke();
}

/* ---------- sound: small synthesized pops, quiet by default ---------- */
let ac = null;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch { return null } }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
addEventListener('pointerdown', audio, true); addEventListener('keydown', audio, true);
function tone(type, f0, f1, dur, vol, delay = 0) {
  const a = ac; if (!a || a.state !== 'running') return;
  const t = a.currentTime + delay, o = a.createOscillator(), v = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .6);
  v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + .006); v.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(v).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, f0, f1) {
  const a = ac; if (!a || a.state !== 'running') return;
  const t = a.currentTime, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), v = a.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  v.gain.setValueAtTime(vol, t); s.connect(f).connect(v).connect(a.destination); s.start(t);
}
const STEP = [0, 2, 4, 7, 9, 12, 14, 16];   // a pentatonic climb as the combo grows
const sound = {
  pop(c) { const f = 620 * 2 ** (STEP[Math.min(c - 1, 7)] / 12); tone('triangle', f * 1.6, f, .2, .16); tone('sine', f * 2.5, f * 2, .12, .05, .035) },
  tink() { tone('sine', 1500, 1300, .09, .06) },
  miss() { tone('square', 190, 120, .05, .02) },
  splat() { noise(.18, .14, 900, 200); tone('sine', 220, 120, .16, .06) },
  bounce() { tone('sine', 520, 760, .12, .05) },
  swish() { noise(WIPE_S, .07, 400, 2400) },
};

/* ---------- phone messages (called by mp.js for the shooter and wiper roles) ---------- */
const num = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
window.GionCrewExt = Object.assign(window.GionCrewExt || {}, {
  onPhone(p, m, roles, phase) {
    if (phase !== 'driving') return false;
    if ((m.t === 'aim' || m.t === 'fire') && roles.includes('shoot') && num(m.x) && num(m.y)) {
      aim = { x: clamp(.5 + m.x * .5, 0, 1), y: clamp(.5 + m.y * .5, 0, 1) }; aimAt = performance.now(); aimColor = p.color;
      if (!aimShown) aimShown = { ...aim };
      if (m.t === 'fire' && on) fire(aim.x, aim.y, p.color);
      return true;
    }
    if (m.t === 'wipe' && roles.includes('wipe')) { if (on) startWipe(num(m.d) ? m.d : 1); return true }
    return false;
  },
});

/* ---------- the loop ---------- */
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  const c = crew(), driving = GT.driving && c && c.phase === 'driving';
  const shooter = driving && holder('shoot'), wiper = driving && holder('wipe');
  if (!driving) { if (on) { on = false; reset() } GT.blind('stickers', false); cv.hidden = true; return }
  on = true; cv.hidden = false;
  const st = GT.state();
  pal = scenery();
  // level: one step per fare delivered
  const nl = Math.min(LV.length - 1, st ? st.fares : 0);
  if (nl !== level) { level = nl; note(LV[level].note); toPhones({ t: 'sx', k: 'level', lv: level + 1 }) }
  // spawn only while someone holds the shooter role (otherwise nobody could stop them)
  if (shooter) {
    spawnT -= dt;
    if (spawnT <= 0 && targets.length < LV[level].live) { spawn(); spawnT = LV[level].every * (.75 + Math.random() * .5) }
  }
  for (const o of [...targets]) { o.t += dt; o.flash = Math.max(0, o.flash - dt); place(o); if (o.t >= o.T) arrive(o) }
  for (const o of stuck) { o.stuckAt += dt; o.slide = Math.min(.035, o.slide + dt * .003); o.smear = Math.max(0, (o.smear || 0) - dt * .15) }
  // with nobody on the wipers, the glass slowly clears itself
  if (!wiper) for (const o of [...stuck]) if (o.stuckAt > 10) { stuck.splice(stuck.indexOf(o), 1); burst(o, 1.45, .2) }
  stepWipe(dt);
  GT.blind('stickers', stuck.length >= LV[level].cap);   // a full glass: the driver can't see, so the taxi won't go
  for (const q of parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 520 * dt; q.r += q.vr * dt }
  parts = parts.filter(q => q.t < q.life);
  for (const f of fx) f.t += dt; fx = fx.filter(f => f.t < .5);
  recoil *= Math.exp(-dt * 12);
  if (aim && aimShown) { const k = 1 - Math.exp(-dt * 22); aimShown.x += (aim.x - aimShown.x) * k; aimShown.y += (aim.y - aimShown.y) * k }
  draw(dt);
  // HUD line
  const bar = $('gt-shootbar');
  bar.hidden = !shooter && !stuck.length;
  bar.innerHTML = `<b>Lv ${level + 1}</b><span>${stats.hits} popped</span><span class="${stuck.length >= LV[level].cap ? 'full' : ''}">${stuck.length ? `${stuck.length} on the glass` : 'Glass clear'}</span>`;
  // the 10 Hz picture for the phones
  if (now - sendT > 100) {
    sendT = now;
    toPhones({ t: 'sh', lv: level + 1, hits: stats.hits, shots: stats.shots, cap: LV[level].cap, pal,
      tg: targets.map(o => [o.id, KINDS.indexOf(o.kind), +o.x.toFixed(3), +o.y.toFixed(3), +o.s.toFixed(2), o.color]),
      st: stuck.map(o => [o.id, KINDS.indexOf(o.kind), +o.x.toFixed(3), +(o.y + o.slide).toFixed(3), o.hp, o.color]),
      wipe: wipe ? +(wipe.t / WIPE_S).toFixed(2) * wipe.dir : 0, ar: +(W / Math.max(1, H)).toFixed(3) });
  }
}
let noteT = 0;
function note(text) {
  const el = $('gt-shootnote'); el.textContent = text; el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(noteT); noteT = setTimeout(() => { el.hidden = true }, 2600);
}
requestAnimationFrame(frame);
cv.hidden = true;
window.GionShoot = {
  get targets() { return targets }, get stuck() { return stuck }, get stats() { return stats }, get level() { return level + 1 }, get on() { return on },
  get palette() { return pal }, fire: (x, y) => fire(x, y, aimColor), wipe: d => startWipe(d || 1),
  flurry, seize: ms => { seizeUntil = performance.now() + (ms || 4000) }, SPR, KINDS, PALETTE,
};
})();
