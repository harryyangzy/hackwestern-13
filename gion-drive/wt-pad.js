/* Gion Taxi "Wrong Turn": the phone side. Shows this phone its own secret role, takes its wager and locks it in
   as a salted hash (computed here; the amount and the salt stay on this phone until the reveal), gives the imposter
   a few discreet sabotages, runs the vote and sends the reveal. Loaded by pad.html; talks through window.WTPadAPI. */
(() => {
const A = window.WTPadAPI; if (!A) return;

/* ---------- SHA-256 (the page is plain http on the LAN, where crypto.subtle is unavailable) ---------- */
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(bytes) {
  const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
  m.set(bytes); m[l] = 0x80; const dv = new DataView(m.buffer);
  dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) w[i] = (w[i - 16] + (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10))) >>> 0;
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); H.forEach((v, i) => ov.setUint32(i * 4, v)); return out;
}
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const u64 = v => { const b = new Uint8Array(8); let x = BigInt(v); for (let i = 0; i < 8; i++) { b[i] = Number(x & 255n); x >>= 8n } return b };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o };
// byte for byte what the program checks: sha256("gion-wager" ‖ game ‖ player ‖ wager_le ‖ salt)
const commitment = (gameHex, meHex, wager, salt) => hex(sha256(cat(new TextEncoder().encode('gion-wager'), unhex(gameHex), unhex(meHex), u64(wager), salt)));
// self-check against a known SHA-256 value, so a broken hash never locks anyone's stake
if (hex(sha256(new TextEncoder().encode('abc'))) !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') console.error('sha256 self-test failed');

/* ---------- UI ---------- */
document.head.insertAdjacentHTML('beforeend', `<style>
#wt{position:fixed;inset:0;z-index:48;background:radial-gradient(120% 90% at 50% 0%,#fbf8ef 0,var(--paper) 60%,#eee8d8 100%);display:flex;align-items:center;justify-content:center;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
#wt[hidden]{display:none}
.wt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;height:100%}
.wt-box{padding:14px 18px;display:flex;flex-direction:column;gap:8px;justify-content:center;min-height:0;overflow:auto}
.wt-box h2{font-size:22px}
.wt-box p{margin:0;color:var(--muted);font-size:14px}
/* the role card: the player's character on the back; holding it flips it over to the role */
#wt-box-role{padding:10px}
#wt-peek{flex:1;min-height:0;perspective:1100px;touch-action:none;-webkit-user-select:none;user-select:none;cursor:pointer}
.wt-flip{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.3,1.25,.45,1)}
#wt-peek.show .wt-flip{transform:rotateY(180deg)}
.wt-face{position:absolute;inset:0;border-radius:18px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center}
.wt-back{background:radial-gradient(120% 90% at 70% 10%,#fffdf6 0,#f6efe0 55%,#ece3cf 100%);border:1px solid var(--rule);box-shadow:inset 0 1px 0 #fff,0 6px 18px #263c3514}
.wt-back .gc-char{animation:wt-breathe 2.6s ease-in-out infinite;filter:drop-shadow(0 6px 10px #4a4f8a22)}
.wt-back b{font:500 24px/1.1 var(--display,var(--serif));color:var(--ink)}
@keyframes wt-breathe{50%{transform:translateY(-4px) scale(1.03)}}
.wt-front{transform:rotateY(180deg);background:var(--mint,#e3f1e7);border:1px solid #b9dcc6;color:var(--ink)}
.wt-front.imp{background:var(--rose,#f9dce5);border-color:#dcafbc}
.wt-front b{font:500 40px/1 var(--display,var(--serif));color:var(--green)}
.wt-front.imp b{color:var(--rust)}
.wt-front p{margin:0;font:500 15px/1.35 var(--sans);color:var(--ink);max-width:260px}
.wt-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.wt-chips i{font:600 12px var(--sans);font-style:normal;padding:5px 11px;border-radius:999px;background:#fffcf3;border:1px solid #dcafbc;color:var(--rust)}
@media (prefers-reduced-motion:reduce){.wt-flip{transition:none}.wt-back .gc-char{animation:none}}
.wt-amt{font:500 40px/1 var(--display,var(--serif));font-variant-numeric:tabular-nums;color:var(--rust);display:flex;align-items:baseline;gap:8px}
.wt-amt small{font:600 13px var(--sans);color:var(--muted);text-transform:none;letter-spacing:0}
/* the wager: a shuttle slider, pushed from left to right; the chevrons light up the further it goes */
.wt-shuttle{position:relative;height:60px;border-radius:999px;background:#ece4d1;box-shadow:inset 0 1px 3px #263c3524,inset 0 -1px 0 #fff8;touch-action:none;cursor:grab;outline:none;-webkit-user-select:none;user-select:none;margin:6px 0 4px}
.wt-shuttle:focus-visible .wt-knob{box-shadow:0 0 0 3px #fffcf3,0 0 0 5px var(--rust)}
.wt-shuttle.drag{cursor:grabbing}
.wt-trail{position:absolute;left:5px;top:5px;bottom:5px;border-radius:999px;background:linear-gradient(90deg,#ac493110,#ac49314d);pointer-events:none}
.wt-chev{position:absolute;left:64px;right:22px;top:0;bottom:0;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
.wt-chev svg{width:11px;height:16px;stroke:#263c35;opacity:.18;transition:opacity .18s,transform .25s cubic-bezier(.3,1.6,.5,1),stroke .18s}
.wt-chev svg.on{stroke:var(--rust);opacity:1;transform:scale(1.18)}
.wt-knob{position:absolute;top:5px;left:5px;width:50px;height:50px;border-radius:50%;background:var(--ink);display:grid;place-items:center;box-shadow:0 3px 10px #263c3540;pointer-events:none;transition:transform .2s cubic-bezier(.3,1.6,.5,1)}
.wt-shuttle.drag .wt-knob{transform:scale(1.08)}
.wt-knob svg{width:22px;height:22px;stroke:#fffcf3}
.wt-fine{font-size:12px!important}
.wt-center{text-align:center;align-items:center;max-width:460px}
.wt-dots{display:flex;gap:9px;justify-content:center;margin:4px 0}
.wt-dots i{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--rule)}
.wt-dots i.on{background:var(--green);border-color:var(--green)}
.wt-votes{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:6px 0}
.wt-votes button{display:flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;border:1px solid var(--line);background:#fff;font:600 17px var(--serif)}
.wt-votes button i{width:12px;height:12px;border-radius:50%}
.wt-votes button.skip{font:italic 15px var(--serif);color:var(--muted)}
.wt-big{font:600 28px var(--serif)}.wt-big.up{color:var(--green)}.wt-big.down{color:var(--rust)}
.wt-link{font-size:13px;color:var(--ink)}
#wt-sab{position:fixed;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 50px);z-index:46;display:flex;gap:6px}
#wt-sab[hidden]{display:none}
#wt-sab button{padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;touch-action:none}
#wt-sab button i{font-style:normal;letter-spacing:.12em;color:var(--rust)}
#wt-sab button.hold{background:var(--rust);color:#fff;border-color:var(--rust)}#wt-sab button.hold i{color:#fff}
#wt-sab button:disabled{opacity:.45}
</style>`);
document.body.insertAdjacentHTML('beforeend', '<div id="wt" hidden></div><div id="wt-sab" hidden></div>');
const layer = document.getElementById('wt'), sabEl = document.getElementById('wt-sab');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sol = l => (l / 1e9).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
const KIND = {
  drift: ['Drift', 'the wheel pulls to one side for a moment'],
  stall: ['Stall', 'the engine cuts out for a second and a half'],
  decoy: ['Decoy', 'a fake marker appears on the map, as if the navigator dropped it'],
  jam: ['Jam', 'the door sticks the next time it opens'],
  fog: ['Fog bank', 'a thick bank of fog rolls over the windshield'],
  flurry: ['Flurry', 'a gust slaps three stickers onto the windshield at once'],
  seize: ['Seize', 'the wipers stick and won\'t move for four seconds'],
};
let role = null, status = {}, voted = false, revealSent = false, sab = { left: 0, wait: 0, at: 0 };
// the wager's secret, kept per game and per player (r.me is this seat's burner), so tabs in one browser don't overwrite each other
const store = r => { try { return JSON.parse(localStorage.getItem('wt:' + r.game + ':' + r.me) || 'null') } catch { return null } };

// the shuttle: drag the knob from left to right (or tap the track, or use the arrow keys); 10–100 % in steps of 5.
// The knob follows on a spring, so it overshoots a touch and settles; letting go snaps it to the nearest step.
function shuttle(el, onChange) {
  const MIN = 10, MAX = 100, STEP = 5, knob = el.querySelector('.wt-knob'), trail = el.querySelector('.wt-trail'), chevs = [...el.querySelectorAll('.wt-chev svg')];
  const api = { value: MIN };
  let target = 0, pos = 0, vel = 0, raf = 0, last = 0, drag = null;
  const span = () => el.clientWidth - 60;   // the knob's travel in px
  const toValue = p => Math.round((MIN + p * (MAX - MIN)) / STEP) * STEP;
  const toPos = v => (v - MIN) / (MAX - MIN);
  function paint() {
    const x = Math.max(-.04, Math.min(1.04, pos)) * span();
    knob.style.left = 5 + x + 'px'; trail.style.width = x + 50 + 'px';
    const lit = Math.max(0, Math.min(1, pos)) * chevs.length;
    chevs.forEach((c, i) => c.classList.toggle('on', i < lit - .35));
  }
  function set(p, snap) {
    target = Math.max(0, Math.min(1, p));
    const v = toValue(target); if (snap) target = toPos(v);
    if (v !== api.value) { api.value = v; el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', v + '%'); A.buzz(4); onChange(v) }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick) }
  }
  function tick(now) {
    const dt = Math.min(.032, (now - last) / 1000); last = now;
    const k = 520, c = 26;   // stiff and a little under-damped: a small overshoot, then it settles
    vel += ((target - pos) * k - vel * c) * dt; pos += vel * dt; paint();
    if (Math.abs(target - pos) < .0005 && Math.abs(vel) < .002) { pos = target; paint(); raf = 0; return }
    raf = requestAnimationFrame(tick);
  }
  const at = e => { const r = el.getBoundingClientRect(); return (e.clientX - r.left - 30) / span() };
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('drag'); el.focus(); drag = e.pointerId; set(at(e)) });
  el.addEventListener('pointermove', e => { if (drag === e.pointerId) set(at(e)) });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, e => { if (drag !== e.pointerId) return; drag = null; el.classList.remove('drag'); set(target, true) });
  el.addEventListener('keydown', e => {
    const d = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP }[e.key];
    if (d) { e.preventDefault(); set(toPos(api.value + d), true) }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); set(e.key === 'Home' ? 0 : 1, true) }
  });
  addEventListener('resize', paint);
  el.setAttribute('aria-valuenow', MIN); el.setAttribute('aria-valuetext', MIN + '%');
  requestAnimationFrame(() => { paint(); onChange(MIN) });   // it starts at the far left
  return api;
}
function showRole() {
  const r = role, imp = r.imposter, yen = window.GionMoney ? window.GionMoney(r.goal) : '¥' + r.goal.toLocaleString();   // the city's currency
  const front = imp
    ? `<b>Imposter</b><p>Keep the fare under ${yen}. Don’t get caught.</p><div class="wt-chips">${r.kinds.map(k => `<i>${KIND[k][0]}</i>`).join('')}</div>`
    : `<b>Crew</b><p>Reach ${yen}. Find the imposter.</p>`;
  const me = A.me, face = me && window.GionCrew ? GionCrew.svg(me.color, { size: 104 }) : '';
  layer.hidden = false;
  const chev = '<svg viewBox="0 0 11 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l6 6-6 6"/></svg>';
  layer.innerHTML = `<div class="wt-grid">
    <div class="card wt-box" id="wt-box-role">
      <div id="wt-peek"><div class="wt-flip">
        <div class="wt-face wt-back">${face}<b>Hold to reveal</b></div>
        <div class="wt-face wt-front ${imp ? 'imp' : ''}">${front}</div></div></div></div>
    <div class="card wt-box">
      <div class="wt-amt" id="wt-amt"></div>
      <div class="wt-shuttle" id="wt-range" role="slider" tabindex="0" aria-label="Wager" aria-valuemin="10" aria-valuemax="100">
        <i class="wt-trail"></i><div class="wt-chev">${chev.repeat(9)}</div>
        <div class="wt-knob"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6l6 6-6 6M13 6l6 6-6 6"/></svg></div></div>
      <button class="pill" id="wt-lock">Lock in wager</button></div></div>`;
  const peek = document.getElementById('wt-peek');
  const on = e => { e.preventDefault(); peek.classList.add('show'); A.buzz(15) }, off = () => peek.classList.remove('show');
  peek.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) peek.addEventListener(ev, off);
  const range = shuttle(document.getElementById('wt-range'), () => upd()), amt = () => Math.round(r.stake * range.value / 100);
  const upd = () => { document.getElementById('wt-amt').innerHTML = `${sol(amt())} SOL<small>${range.value}%</small>` };
  upd();
  document.getElementById('wt-lock').onclick = () => {
    const wager = Math.max(r.minWager, Math.min(r.stake, amt())), salt = crypto.getRandomValues(new Uint8Array(32));
    try { localStorage.setItem('wt:' + r.game + ':' + r.me, JSON.stringify({ wager, salt: hex(salt) })) } catch {}
    A.send({ t: 'dx-commit', c: commitment(r.game, r.me, wager, salt) });
    showWaiting('Locking in your wager on Solana…');
  };
}
function showWaiting(msg) {
  layer.hidden = false;
  const dots = Array.from({ length: status.n || 0 }, (_, i) => `<i class="${i < (status.committed || 0) ? 'on' : ''}"></i>`).join('');
  layer.innerHTML = `<div class="card wt-box wt-center"><h2>${esc(msg)}</h2><div class="wt-dots">${dots}</div>
    <p>${status.committed || 0} of ${status.n || '?'} wagers locked in. When everyone's in, the imposter is sealed on-chain and the shift starts.</p></div>`;
}
function renderSab() {
  if (!role || !role.imposter || A.screen !== 'drive') { sabEl.hidden = true; return }
  sabEl.hidden = false;
  const cool = Math.max(0, sab.wait - (Date.now() - sab.at));
  sabEl.innerHTML = role.kinds.map(k => `<button data-k="${k}" ${sab.left <= 0 || cool > 0 ? 'disabled' : ''}>${KIND[k][0]} <i>${'●'.repeat(sab.left)}${'○'.repeat(Math.max(0, role.charges - sab.left))}</i></button>`).join('');
  for (const b of sabEl.querySelectorAll('button')) {   // press and hold, so a brush of the thumb doesn't fire it
    let t = null;
    b.onpointerdown = e => { e.preventDefault(); b.classList.add('hold'); t = setTimeout(() => { A.send({ t: 'dx-sab', kind: b.dataset.k }); A.buzz(25) }, 450) };
    b.onpointerup = b.onpointercancel = b.onpointerleave = () => { clearTimeout(t); b.classList.remove('hold') };
  }
}
setInterval(() => { if (role && role.imposter) { const want = A.screen === 'drive'; if (want === sabEl.hidden || (want && sab.wait)) renderSab() } }, 500);

function showVote(m) {
  layer.hidden = false; voted = false;
  const yen = v => window.GionMoney ? window.GionMoney(v) : '¥' + v.toLocaleString();
  layer.innerHTML = `<div class="card wt-box wt-center"><small>${m.success ? `The trip made it: ${yen(m.yen)} of ${yen(m.goal)}` : `The trip fell short: ${yen(m.yen)} of ${yen(m.goal)}`}</small>
    <h2>Who took the wrong turn?</h2>
    <div class="wt-votes">${m.seats.filter(s => s.pid !== myPid()).map(s => `<button data-pid="${s.pid}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}<button class="skip" data-pid="">Not sure</button></div>
    <p>${m.success ? 'The crew already won; name the imposter anyway.' : 'A majority on the imposter wins it for the crew.'}</p></div>`;
  for (const b of layer.querySelectorAll('.wt-votes button')) b.onclick = () => {
    if (voted) return; voted = true; A.send({ t: 'dx-vote-for', pid: b.dataset.pid || null }); A.buzz(20);
    layer.innerHTML = `<div class="card wt-box wt-center"><h2>Vote in.</h2><p>Waiting for the others…</p></div>`;
  };
}
const myPid = () => window.gtMyPid ? window.gtMyPid() : null;   // this tab's player (pad.html), not the browser-wide last one
function doReveal() {
  if (!role || revealSent) return;
  const s = store(role);
  layer.hidden = false;
  if (!s) { layer.innerHTML = `<div class="card wt-box wt-center"><h2>Your wager's secret isn't on this phone.</h2><p>Without it the reveal can't be checked, so your stake goes to the winners.</p></div>`; return }
  revealSent = true;
  A.send({ t: 'dx-reveal-v', wager: s.wager, salt: s.salt });
  layer.innerHTML = `<div class="card wt-box wt-center"><h2>Revealing your wager…</h2><p>The program checks it against the fingerprint you locked in before the trip.</p></div>`;
}
function showFinal(f) {
  const me = f.players.find(p => p.pid === myPid());
  layer.hidden = false; sabEl.hidden = true;
  if (!me) { layer.hidden = true; return }
  // just the outcome: won or lost, what it did to this player's SOL, and the way back
  const net = f.aborted ? 0 : me.payout - f.stake, won = me.imposter ? !f.crewWins : f.crewWins;   // a cancelled trip refunds every stake
  layer.innerHTML = `<div class="card wt-box wt-center">
    <h2>${f.aborted ? 'Trip cancelled.' : won ? 'You won.' : 'You lost.'}</h2>
    <div class="wt-big ${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}${sol(Math.abs(net))} SOL</div>
    <button class="pill" id="wt-close">Back</button></div>`;
  document.getElementById('wt-close').onclick = () => { layer.hidden = true; role = null };
}

window.WTPad = m => {
  switch (m.t) {
    case 'dx-joined': A.send({ t: 'dx-hello' }); break;
    case 'dx-role': {
      if (!role || role.game !== m.game) revealSent = false;
      role = m; sab = { left: m.charges, wait: 0, at: 0 };
      if (m.quiet) break;   // a reload mid-trip: remember the role (and sabotages) without covering the controls
      if (m.committed) showWaiting('Wager locked in.'); else showRole();
      break;
    }
    case 'dx-status': status = m; if (role && !layer.hidden && /locked in|Locking/.test(layer.textContent) && ['commit', 'locking'].includes(m.phase)) showWaiting(layer.querySelector('h2').textContent); break;
    case 'dx-committed': showWaiting('Wager locked in.'); A.buzz(30); break;
    case 'dx-locked': layer.hidden = true; break;
    case 'dx-sab-ack': sab = { left: m.left, wait: m.wait || 0, at: Date.now() }; renderSab(); if (!m.ok && m.wait) A.toast('Not yet: ' + Math.ceil(m.wait / 1000) + ' s'); break;
    case 'dx-vote': sabEl.hidden = true; showVote(m); break;
    case 'dx-reveal': doReveal(); break;
    case 'dx-final': showFinal(m); break;
    case 'dx-error': A.toast(m.why); if (/wager/.test(m.why) && role) showRole(); break;
  }
};
})();
