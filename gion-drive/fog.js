/* Gion Taxi crew play: the fog and the player who rubs it away (laptop side). Runs after shoot.js, before mp.js.
   Banks of fog roll in from the edges and settle on the windshield until the driver can't see the road. The fog player
   rubs it off on their phone (pad-fog.js); the strokes come here through mp.js (window.GionCrewExt.onPhone) and this
   file sends the fog holder a small picture of the glass ('fg', 8 Hz).

   The fog is a coarse density grid, drawn as a soft see-through mist (render()). Past half the glass the taxi can't
   drive (GionTaxi.blind) until it's rubbed off. Only appears in a crew shift while a phone holds the fog role. */
(() => {
const GT = window.GionTaxi, $ = id => document.getElementById(id);
if (!GT) return;
const crew = () => window.GionCrew;
const holder = r => { const c = crew(); return c && c.holder ? c.holder(r) : null };
const toPhones = m => { const c = crew(); if (c && c.toPhones) c.toPhones(m) };

/* ---------- the layer: under the shooter's stickers, under the HUD ---------- */
($('gt-shoot') || $('gt-hud')).insertAdjacentHTML('beforebegin', '<canvas id="gt-fog" aria-hidden="true"></canvas>');
$('gt-hud').insertAdjacentHTML('beforeend', '<div id="gt-fogbar" class="gt-card" hidden></div>');
const cv = $('gt-fog'), g = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function fit() {
  const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1);
  if (r.width && (Math.round(r.width * DPR) !== cv.width || Math.round(r.height * DPR) !== cv.height)) { cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR) }
  W = r.width; H = r.height;
}

/* ---------- the fog: a density grid, 0 (clear) to 1 (can't see a thing) ---------- */
const GW = 64, GH = 40;
const fog = new Float32Array(GW * GH);
let blindFog = false, banks = [], bankT = 4, on = false, sendT = 0, drawT = 0, stats = { rubbed: 0, peak: 0 };
const cover = () => { let s = 0; for (let i = 0; i < fog.length; i++) s += Math.min(1, fog[i] / .45); return s / fog.length };   // share of the glass you can't see through

// a bank is a few puffs that drift in together and leave fog behind them as they go
function bank(thick = false) {
  const fromLeft = Math.random() < .5, y = .15 + Math.random() * .7;
  const x = thick ? .3 + Math.random() * .4 : fromLeft ? -.08 : 1.08;
  const vx = thick ? (Math.random() - .5) * .03 : (fromLeft ? 1 : -1) * (.05 + Math.random() * .04);
  const puffs = Array.from({ length: thick ? 7 : 4 + Math.floor(Math.random() * 3) }, () => ({ dx: (Math.random() - .5) * .22, dy: (Math.random() - .5) * .16, r: .07 + Math.random() * .07 }));
  banks.push({ x, y, vx, vy: (Math.random() - .5) * .015, puffs, life: thick ? 2.2 : 5 + Math.random() * 3, t: 0, rate: thick ? 1.4 : .5 });
}
function deposit(cx, cy, r, amt) {   // a soft round puff, in glass coordinates (0–1)
  const rx = r * GW, ry = r * GW * (W && H ? W / H : 1.6) * GH / GW, x0 = cx * GW, y0 = cy * GH;
  for (let j = Math.max(0, Math.floor(y0 - ry)); j <= Math.min(GH - 1, Math.ceil(y0 + ry)); j++)
    for (let i = Math.max(0, Math.floor(x0 - rx)); i <= Math.min(GW - 1, Math.ceil(x0 + rx)); i++) {
      const d = ((i - x0) / rx) ** 2 + ((j - y0) / ry) ** 2; if (d >= 1) continue;
      const k = j * GW + i; fog[k] = Math.min(1, fog[k] + amt * (1 - d) ** 2);
    }
}
// rubbing: each point clears a soft round patch, a bit more each pass
function rub(x, y, x1, y1) {
  const steps = Math.max(1, Math.ceil(Math.hypot((x1 - x) * GW, (y1 - y) * GH) / .8));
  for (let s = 0; s <= steps; s++) {
    const px = (x + (x1 - x) * s / steps) * GW, py = (y + (y1 - y) * s / steps) * GH, R = 3.4;
    for (let j = Math.max(0, Math.floor(py - R)); j <= Math.min(GH - 1, Math.ceil(py + R)); j++)
      for (let i = Math.max(0, Math.floor(px - R)); i <= Math.min(GW - 1, Math.ceil(px + R)); i++) {
        const d = ((i - px) ** 2 + (j - py) ** 2) / (R * R); if (d >= 1) continue;
        const k = j * GW + i, before = fog[k]; fog[k] *= 1 - .5 * (1 - d); stats.rubbed += before - fog[k];
      }
  }
}

/* ---------- drawing: a soft, see-through mist ---------- */
// The density grid becomes a smooth gradient: each cell's alpha rises gently with density (thin fog is a faint veil,
// thick fog a milky wall you can just make out shapes through), upscaled in two smooth steps and blurred so there are
// no cells or bands. Two slowly drifting copies make it breathe. Colours are the map's paper, cooling toward the
// blue-violet of its shadows where the fog is thickest.
const small = document.createElement('canvas'); small.width = GW; small.height = GH;
const sg = small.getContext('2d'), sImg = sg.createImageData(GW, GH);
const MW = GW * 4, MH = GH * 4;
const mid = document.createElement('canvas'); mid.width = MW; mid.height = MH;
const mg = mid.getContext('2d');
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) };
const canBlur = 'filter' in g;
function render(t) {
  const d = sImg.data;
  for (let i = 0; i < fog.length; i++) {
    const v = fog[i], o = i * 4, k = ss(.35, 1, v);
    d[o] = 246 - 24 * k; d[o + 1] = 242 - 20 * k; d[o + 2] = 234 - 4 * k;    // warm paper → a cool grey-violet
    d[o + 3] = Math.round(ss(.02, .8, v) * .86 * 255);
  }
  sg.putImageData(sImg, 0, 0);
  mg.clearRect(0, 0, MW, MH); mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high'; mg.drawImage(small, 0, 0, MW, MH);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (canBlur) g.filter = `blur(${Math.round(W / GW * .9)}px)`;
  const pad = W * .03;   // drawn a little oversize so the blur doesn't leave a clear rim at the edges
  g.globalAlpha = .7; g.drawImage(mid, -pad, -pad, W + 2 * pad, H + 2 * pad);
  // a second, slowly drifting layer: the mist breathes and wisps move across without the density changing
  const dx = Math.sin(t * .23) * W * .012, dy = Math.cos(t * .17) * H * .012, sc = 1 + .015 * Math.sin(t * .31);
  g.globalAlpha = .45; g.drawImage(mid, -pad + dx - W * (sc - 1) / 2, -pad + dy - H * (sc - 1) / 2, (W + 2 * pad) * sc, (H + 2 * pad) * sc);
  g.globalAlpha = 1; if (canBlur) g.filter = 'none';
}

/* ---------- phone messages (called by mp.js for the fog role) ---------- */
const num = v => typeof v === 'number' && Number.isFinite(v);
const prev = window.GionCrewExt && window.GionCrewExt.onPhone;
window.GionCrewExt = Object.assign(window.GionCrewExt || {}, {
  onPhone(p, m, roles, phase) {
    if (m.t === 'rub' && roles.includes('fog')) {
      if (phase !== 'driving' || !on || !Array.isArray(m.p)) return true;
      const pts = m.p.slice(0, 120).filter(num).map(v => Math.max(0, Math.min(1, v)));
      for (let i = 0; i + 1 < pts.length; i += 2) rub(pts[Math.max(0, i - 2)], pts[Math.max(1, i - 1)], pts[i], pts[i + 1]);
      return true;
    }
    return prev ? prev(p, m, roles, phase) : false;
  },
});

function reset() { fog.fill(0); banks = []; bankT = 5; stats = { rubbed: 0, peak: 0 } }
GT.on('start', reset);

/* ---------- the loop ---------- */
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  const c = crew(), fogger = GT.driving && c && c.phase === 'driving' && holder('fog');
  if (!fogger) { if (on) { on = false; reset(); g.clearRect(0, 0, cv.width, cv.height) } blindFog = false; GT.blind('fog', false); cv.hidden = true; $('gt-fogbar').hidden = true; return }
  on = true; cv.hidden = false; fit();
  // banks come more often as the shift goes on (one step per fare, like the shooter's levels)
  const st = GT.state(), lv = Math.min(4, st ? st.fares : 0);
  bankT -= dt;
  if (bankT <= 0) { if (banks.length < 3) bank(); bankT = (7.5 - lv * .9) * (.7 + Math.random() * .6) }
  for (const b of banks) {
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    for (const q of b.puffs) deposit(b.x + q.dx, b.y + q.dy, q.r, b.rate * dt);
  }
  banks = banks.filter(b => b.t < b.life);
  for (let i = 0; i < fog.length; i++) fog[i] = Math.max(0, fog[i] - dt * .004);   // it thins very slowly on its own
  const cov = cover(); stats.peak = Math.max(stats.peak, cov);
  blindFog = blindFog ? cov > .38 : cov > .5; GT.blind('fog', blindFog);   // too thick to see the road: the taxi won't go until it's rubbed off
  if (now - drawT > 33) { drawT = now; render(now / 1000) }   // 30 fps is plenty for fog
  const bar = $('gt-fogbar'); bar.hidden = false;
  bar.innerHTML = `<b>Fog</b><span class="${cov > .45 ? 'full' : ''}">${cov < .03 ? 'Clear view' : Math.round(cov * 100) + '% fogged'}</span>`;
  if (now - sendT > 125) {   // the fog player's picture: the grid at half size, one character (0–9) per cell
    sendT = now; let s = '';
    for (let j = 0; j < GH; j += 2) for (let i = 0; i < GW; i += 2) s += Math.min(9, Math.round((fog[j * GW + i] + fog[j * GW + i + 1] + fog[(j + 1) * GW + i] + fog[(j + 1) * GW + i + 1]) / 4 * 9));
    toPhones({ t: 'fg', w: GW / 2, h: GH / 2, d: s, cov: +cov.toFixed(2), ar: +(W / Math.max(1, H)).toFixed(3) });
  }
}
requestAnimationFrame(frame);
cv.hidden = true;

window.GionFog = { bank, get cover() { return cover() }, get stats() { return stats }, get on() { return on }, rub };
})();
