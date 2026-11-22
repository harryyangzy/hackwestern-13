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
#wt-peek{flex:1;border-radius:12px;border:2px dashed var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:14px;touch-action:none;-webkit-user-select:none;user-select:none}
#wt-peek .wt-hold{font:italic 17px var(--serif);color:var(--muted)}
#wt-peek .wt-secret{display:none}
#wt-peek.show{border-style:solid;border-color:var(--ink);background:#fff}
#wt-peek.show.imp{background:var(--rust);border-color:var(--rust);color:#fff}
#wt-peek.show .wt-hold{display:none}#wt-peek.show .wt-secret{display:flex;flex-direction:column;gap:6px}
.wt-secret b{font:600 26px var(--serif)}
.wt-secret span{font-size:13px;line-height:1.35}
#wt-peek.imp .wt-secret span{color:#fffe}
.wt-amt{font:600 30px var(--serif);font-variant-numeric:tabular-nums;color:var(--rust)}
.wt-amt small{font:13px var(--sans);color:var(--muted);text-transform:none;letter-spacing:0;margin-left:4px}
#wt-range{width:100%;accent-color:#ac4931;height:30px}
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
};
let role = null, status = {}, voted = false, revealSent = false, sab = { left: 0, wait: 0, at: 0 };
const store = g => { try { return JSON.parse(localStorage.getItem('wt:' + g) || 'null') } catch { return null } };

function showRole() {
  const r = role, imp = r.imposter, yen = '¥' + r.goal.toLocaleString();
  const secret = imp
    ? `<b>Imposter</b><span>Make the trip fall short of ${yen} without getting caught. Play your part as normal. You have ${r.charges} sabotages that look like bad luck: ${r.kinds.map(k => `<br>· <b style="font-size:14px">${KIND[k][0]}</b>: ${KIND[k][1]}`).join('')}</span>`
    : `<b>Crew</b><span>Earn ${yen} before the clock runs out. Someone in this taxi wants the trip to fail. Watch who drives badly; you'll vote at the end.</span>`;
  layer.hidden = false;
  layer.innerHTML = `<div class="wt-grid">
    <div class="card wt-box"><small>Wrong Turn · your secret role</small>
      <div id="wt-peek" class="${imp ? 'imp' : ''}"><span class="wt-hold">Hold your phone close, then press and hold here to read your role.</span><div class="wt-secret">${secret}</div></div></div>
    <div class="card wt-box"><small>Your wager</small>
      <div class="wt-amt" id="wt-amt"></div>
      <input type="range" id="wt-range" min="10" max="100" step="5" value="50" aria-label="Wager">
      <p>Everyone deposits the same stake, <b>${sol(r.stake)} SOL</b> (devnet test tokens), so nobody can tell what you bet. You get back whatever you don't wager. Winners split the losers' wagers in proportion to their own.</p>
      <button class="pill" id="wt-lock">Lock in wager</button>
      <p class="wt-fine">Only a fingerprint (a salted hash) goes on Solana now. The amount stays on this phone until the reveal.</p></div></div>`;
  const peek = document.getElementById('wt-peek');
  const on = e => { e.preventDefault(); peek.classList.add('show'); A.buzz(15) }, off = () => peek.classList.remove('show');
  peek.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) peek.addEventListener(ev, off);
  const range = document.getElementById('wt-range'), amt = () => Math.round(r.stake * range.value / 100);
  const upd = () => { document.getElementById('wt-amt').innerHTML = `${sol(amt())} SOL<small>${range.value}% of your stake</small>` };
  range.oninput = upd; upd();
  document.getElementById('wt-lock').onclick = () => {
    const wager = Math.max(r.minWager, Math.min(r.stake, amt())), salt = crypto.getRandomValues(new Uint8Array(32));
    try { localStorage.setItem('wt:' + r.game, JSON.stringify({ wager, salt: hex(salt) })) } catch {}
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
  const yen = v => '¥' + v.toLocaleString();
  layer.innerHTML = `<div class="card wt-box wt-center"><small>${m.success ? `The trip made it: ${yen(m.yen)} of ${yen(m.goal)}` : `The trip fell short: ${yen(m.yen)} of ${yen(m.goal)}`}</small>
    <h2>Who took the wrong turn?</h2>
    <div class="wt-votes">${m.seats.filter(s => s.pid !== myPid()).map(s => `<button data-pid="${s.pid}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}<button class="skip" data-pid="">Not sure</button></div>
    <p>${m.success ? 'The crew already won; name the imposter anyway.' : 'A majority on the imposter wins it for the crew.'}</p></div>`;
  for (const b of layer.querySelectorAll('.wt-votes button')) b.onclick = () => {
    if (voted) return; voted = true; A.send({ t: 'dx-vote-for', pid: b.dataset.pid || null }); A.buzz(20);
    layer.innerHTML = `<div class="card wt-box wt-center"><h2>Vote in.</h2><p>Waiting for the others…</p></div>`;
  };
}
const myPid = () => { try { return localStorage.getItem('gtPid') } catch { return null } };
function doReveal() {
  if (!role || revealSent) return;
  const s = store(role.game);
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
  const net = me.payout - f.stake, imp = f.players.find(p => p.imposter);
  const won = f.aborted ? null : me.imposter ? !f.crewWins : f.crewWins;
  layer.innerHTML = `<div class="card wt-box wt-center">
    <small>${f.aborted ? 'Trip cancelled' : me.imposter ? 'You were the imposter' : 'You were crew'}</small>
    <h2>${f.aborted ? (me.payout ? 'Your stake is back.' : 'Nothing was staked.') : won ? 'You won.' : 'You lost.'}</h2>
    ${f.aborted ? '' : `<p>${imp && imp.pid !== me.pid ? `${esc(imp.name)} was the imposter.` : ''} ${f.crewWins ? (f.caught ? 'The crew voted them out.' : 'The crew made the trip.') : 'The trip failed and nobody caught on.'}</p>
    <div class="wt-big ${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}${sol(Math.abs(net))} SOL</div>
    <p>${me.wager != null ? `You wagered ${sol(me.wager)} SOL.` : 'You did not reveal, so your stake was forfeited.'}</p>`}
    ${f.tx.settle || f.tx.refund ? `<a class="wt-link" href="${f.tx.settle || f.tx.refund}" target="_blank" rel="noopener">See the payout on Solana ↗</a>` : ''}
    <button class="pill" id="wt-close">Back to the crew</button></div>`;
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
