/* Gion Taxi phone controller: the fog instrument. Loaded by pad.html after pad-shoot.js; uses window.GionPad and
   chains onto window.GionPadExt for the laptop's 'fg' pictures. The laptop (fog.js) owns the fog; this page shows it
   on a small pane of glass and sends the player's rubbing as strokes. The rub shows here at once, before the laptop's
   next picture arrives, so it feels like wiping a real window. */
(() => {
const P = window.GionPad, $ = id => document.getElementById(id);
if (!P) return;
const has = r => P.roles.includes(r);
const driving = () => P.phase === 'driving';
let fg = null, local = null, lw = 0, lh = 0;   // the laptop's latest picture, and our copy with fresh rubs applied

/* ---------- messages from the laptop ---------- */
const prev = window.GionPadExt;
window.GionPadExt = m => {
  if (m.t === 'fg') {
    fg = m;
    const n = m.w * m.h, grid = new Float32Array(n);
    for (let i = 0; i < n; i++) grid[i] = (m.d.charCodeAt(i) - 48) / 9;
    // keep our own recent rubbing on top until the laptop has caught up with it
    if (local && lw === m.w && lh === m.h && performance.now() - rubAt < 300) for (let i = 0; i < n; i++) grid[i] = Math.min(grid[i], local[i]);
    local = grid; lw = m.w; lh = m.h;
    return;
  }
  if (prev) prev(m);
};

/* ---------- rubbing ---------- */
const pane = $('c-fog'), view = $('fogView');
let pts = [], lastPt = null, rubAt = 0, finger = null;
function glassRect(w, h) {   // the laptop screen's shape, fitted into the panel
  const ar = fg && fg.ar || 1.6, top = 30, bottom = 30, aw = w - 16, ah = h - top - bottom, gw = Math.min(aw, ah * ar), gh = gw / ar;
  return { x: (w - gw) / 2, y: top + (ah - gh) / 2, w: gw, h: gh };
}
function toGlass(e) {
  const r = view.getBoundingClientRect(), R = glassRect(r.width, r.height);
  return [Math.max(0, Math.min(1, (e.clientX - r.left - R.x) / R.w)), Math.max(0, Math.min(1, (e.clientY - r.top - R.y) / R.h))];
}
function rubLocal(x, y) {   // the same soft patch the laptop clears
  if (!local) return;
  const px = x * lw, py = y * lh, R = 1.7;
  for (let j = Math.max(0, Math.floor(py - R)); j <= Math.min(lh - 1, Math.ceil(py + R)); j++)
    for (let i = Math.max(0, Math.floor(px - R)); i <= Math.min(lw - 1, Math.ceil(px + R)); i++) {
      const d = ((i - px) ** 2 + (j - py) ** 2) / (R * R); if (d < 1) local[j * lw + i] *= 1 - .5 * (1 - d);
    }
}
pane.addEventListener('pointerdown', e => { if (!has('fog')) return; e.preventDefault(); pane.setPointerCapture(e.pointerId); lastPt = toGlass(e); finger = lastPt; pts.push(...lastPt) });
pane.addEventListener('pointermove', e => {
  if (!lastPt || !has('fog')) return;
  const p = toGlass(e); finger = p;
  if (Math.hypot(p[0] - lastPt[0], p[1] - lastPt[1]) < .008) return;
  pts.push(...p); rubLocal(...p); lastPt = p; rubAt = performance.now();
});
const lift = () => { lastPt = null; finger = null };
pane.addEventListener('pointerup', lift); pane.addEventListener('pointercancel', lift);
setInterval(() => {   // strokes go out in small batches, 20 a second
  if (!pts.length) return;
  if (driving() && has('fog')) { P.send({ t: 'rub', p: pts.slice(0, 120).map(v => +v.toFixed(3)) }); if (Math.random() < .3) P.buzz(6) }
  pts = lastPt ? [...lastPt] : [];   // the next batch starts where this one ended, so strokes join up
}, 50);

/* ---------- drawing the pane ---------- */
function canvasFit(c) {
  const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (r.width && (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d))) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d) }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
  return [g, r.width, r.height];
}
const cell = document.createElement('canvas'), cg = cell.getContext('2d');
function draw() {
  const [g, w, h] = canvasFit(view), R = glassRect(w, h);
  // the glass: a soft street-coloured pane, so cleared patches read as "I can see through here"
  const bg = g.createLinearGradient(0, R.y, 0, R.y + R.h); bg.addColorStop(0, '#cfd9d3'); bg.addColorStop(1, '#9fb0a6');
  g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(R.x, R.y, R.w, R.h, 10) : g.rect(R.x, R.y, R.w, R.h); g.fill();
  g.save(); g.clip();
  g.strokeStyle = '#ffffff55'; g.lineWidth = 2; g.beginPath(); g.moveTo(R.x + R.w * .5, R.y + R.h); g.lineTo(R.x + R.w * .46, R.y + R.h * .35); g.moveTo(R.x + R.w * .62, R.y + R.h); g.lineTo(R.x + R.w * .52, R.y + R.h * .35); g.stroke();   // a hint of road
  if (local) {
    if (cell.width !== lw || cell.height !== lh) { cell.width = lw; cell.height = lh }
    const im = cg.createImageData(lw, lh);
    for (let i = 0; i < lw * lh; i++) { const v = local[i], o = i * 4; im.data[o] = 250; im.data[o + 1] = 245; im.data[o + 2] = 233; const k = Math.max(0, Math.min(1, v / .8)); im.data[o + 3] = Math.round(k * k * (3 - 2 * k) * .86 * 255) }
    cg.putImageData(im, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; if ('filter' in g) g.filter = `blur(${Math.round(R.w / lw * .8)}px)`; g.drawImage(cell, R.x, R.y, R.w, R.h); if ('filter' in g) g.filter = 'none';
  }
  g.restore();
  g.strokeStyle = '#afb5a5'; g.lineWidth = 1; g.beginPath(); g.roundRect ? g.roundRect(R.x, R.y, R.w, R.h, 10) : g.rect(R.x, R.y, R.w, R.h); g.stroke();
  if (finger) { g.strokeStyle = '#c9a05c'; g.lineWidth = 2; g.beginPath(); g.arc(R.x + finger[0] * R.w, R.y + finger[1] * R.h, R.w * .055, 0, 6.283); g.stroke() }   // the cloth under your finger
  const cov = fg ? fg.cov : 0, el = $('fogCount');
  el.textContent = cov < .03 ? 'Clear view' : Math.round(cov * 100) + '% fogged'; el.classList.toggle('full', cov > .45);
}
(function loop() { requestAnimationFrame(loop); if (P.screen === 'drive' && has('fog')) draw() })();
})();
