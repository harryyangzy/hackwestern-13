/* Gion Taxi "Wrong Turn": the laptop side of the deception mode. Runs after mp.js and uses window.GionCrew.
   The laptop never learns who the imposter is until the reveal: the server tells each phone its own role, and passes
   sabotage on as anonymous "glitches". Here: the lobby switch, the wager-locking panel, the trip rules (hidden
   destination, brake fade, doors that open themselves), the glitches, the vote, and the reveal. */
(() => {
const GT = window.GionTaxi, C = window.GionCrew, $ = id => document.getElementById(id);
if (!GT || !C || !/^https?:$/.test(location.protocol)) return;
const GOAL = 3000;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sol = l => (l / 1e9).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
const yen = v => GT.money ? GT.money(v) : '¥' + Math.round(v).toLocaleString();   // the city's currency

let on = false, avail = null, phase = 'off', withBots = false;   // off | setup | driving | vote | final
let goal = GOAL, lastStatus = null;

/* ---------- UI ---------- */
$('gt-lstart').insertAdjacentHTML('beforebegin', `<label class="wt-switch" id="wt-switch"><input type="checkbox" id="wt-on">
  <span><b>Wrong Turn</b> One of you is secretly the imposter. Wagers in devnet SOL (test tokens). 3–4 phones.</span></label>
  <label class="wt-bots" id="wt-bots-l" hidden><input type="checkbox" id="wt-bots"> Fill empty seats with bots (for testing with fewer than 3 phones)</label>`);
$('stage').insertAdjacentHTML('beforeend', `
<div id="wt-panel" class="gt-card" hidden></div>
<div id="wt-goal" class="gt-card" hidden></div>
<div id="wt-vote" class="gt-card" hidden></div>
<div id="wt-reveal" hidden></div>`);
const panel = $('wt-panel'), voteEl = $('wt-vote'), revealEl = $('wt-reveal'), goalEl = $('wt-goal');
$('wt-on').onchange = e => { on = e.target.checked; $('wt-switch').classList.toggle('on', on); $('wt-bots-l').hidden = !on; if (on) C.send({ t: 'dx-check' }); renderSwitch() };
$('wt-bots').onchange = e => { withBots = e.target.checked; renderSwitch() };
function renderSwitch() {
  const n = C.crew.length, span = $('wt-switch').querySelector('span');
  let note = '';
  if (on && avail) note = `<em class="wt-bad">${esc(avail)}</em>`;
  else if (on && n < 3 && withBots) note = n ? `<em>${3 - n} bot${3 - n === 1 ? '' : 's'} will fill the empty seats.</em>` : '<em class="wt-bad">Needs at least one phone.</em>';
  else if (on && n < 3) note = `<em class="wt-bad">Needs ${3 - n} more phone${3 - n === 1 ? '' : 's'} to start, or untick it for a normal shift.</em>`;
  span.innerHTML = `<b>Wrong Turn</b> One of you is secretly the imposter. Wagers in devnet SOL (test tokens). 3–4 phones. ${note}`;
}
setInterval(() => { if (!$('gt-lobby').hidden) renderSwitch() }, 1000);

/* ---------- 1. before the trip: secret roles out, wagers locked in on-chain ---------- */
C.beforeStart = () => {
  if (!on || C.game !== 'taxi') return false;   // Wrong Turn is a taxi trip; bowling plays as usual
  if (C.crew.length < (withBots ? 1 : 3) || avail) {   // say why Start did nothing, right where the eye is
    renderSwitch(); const sw = $('wt-switch'); sw.classList.remove('wt-shake'); void sw.offsetWidth; sw.classList.add('wt-shake');
    return true;
  }
  phase = 'setup';
  C.send({ t: 'dx-setup', goal, bots: withBots, seats: C.crew.map(p => ({ pid: p.pid, name: p.name, color: p.color, roles: p.roles })) });
  renderPanel({ phase: 'setup', msg: 'Opening the escrow on Solana devnet…', n: C.crew.length, committed: 0 });
  return true;
};
function renderPanel(st, err) {
  lastStatus = st || lastStatus; const s = lastStatus || {};
  panel.hidden = false;
  const dots = Array.from({ length: s.n || 0 }, (_, i) => `<i class="${i < (s.committed || 0) ? 'on' : ''}"></i>`).join('');
  panel.innerHTML = `<small class="wt-cap">Wrong Turn · Solana devnet</small>
    <h2>${err ? 'Something went wrong' : s.phase === 'locked' ? 'Sealed. Get in the taxi.' : 'Check your phone. Quietly.'}</h2>
    <p>${err ? esc(err) : s.phase === 'locked' ? 'The imposter and every wager are committed on-chain. Nobody can change them now.'
      : 'Everyone has a secret role. Hold your phone close, read it, and lock in a wager: everyone deposits the same stake, so nobody can tell how much you bet.'}</p>
    ${err ? '' : `<div class="wt-dots">${dots}</div><p class="wt-sub">${s.msg ? esc(s.msg) : `${s.committed || 0} of ${s.n} wagers locked in · stake ${s.stakeSol ?? ''} SOL each`}</p>`}
    <button class="gt-ghost" id="wt-cancel">${err ? 'Back to the lobby' : 'Cancel and refund'}</button>`;
  $('wt-cancel').onclick = () => { C.send({ t: 'dx-abort' }); if (err) { panel.hidden = true; phase = 'off' } };
}

/* ---------- 2. the trip ---------- */
let active = false, brakeHeld = 0, atDoorT = 0, fadeWarned = false;
GT.on('start', () => {
  if (phase !== 'setup') return;
  active = true; phase = 'driving'; brakeHeld = 0; atDoorT = 0; fadeWarned = false;
  GT.mods.hideTarget = !!C.holder('nav');   // only the navigator's phone knows where the passenger is (if there is a navigator)
  C.send({ t: 'dx-start' });
  goalEl.hidden = false;
});
GT.on('stop', r => {
  if (!active) return;
  active = false; resetMods(); goalEl.hidden = true;
  phase = 'vote';
  C.send({ t: 'dx-result', yen: r ? r.yen : 0, fares: r ? r.fares : 0 });
});
function resetMods() { Object.assign(GT.mods, { hideTarget: false, turnBias: 0, gasCutUntil: 0, brakeScale: 1, doorJamUntil: 0 }) }
setInterval(() => {
  if (!active) return;
  const st = GT.state(); if (!st) return;
  const dt = .1, near = Math.hypot(st.tx - st.x, st.ty - st.y) < 14;
  // brakes fade if someone stands on them away from a lantern: stopping the taxi for good takes more than one foot
  if (GT.remote.brake > .3 && !near) brakeHeld += dt; else brakeHeld = Math.max(0, brakeHeld - 2 * dt);
  GT.mods.brakeScale = brakeHeld > 2 ? Math.max(.2, 1 - (brakeHeld - 2) * .5) : 1;
  if (brakeHeld > 2.4 && !fadeWarned) { fadeWarned = true; GT.toast('The brakes are fading…') }
  if (brakeHeld === 0) fadeWarned = false;
  // the door opens by itself after a while: holding it shut only buys a few seconds
  atDoorT = st.atDoor ? atDoorT + dt : 0;
  if (atDoorT > 4.5) { atDoorT = 2.5; GT.openDoor() }
  goalEl.innerHTML = `<small>Trip goal</small><b class="${st.yen >= goal ? 'ok' : ''}">${yen(st.yen)}</b><span>of ${yen(goal)}</span><em>Someone in this taxi is lying.</em>`;
}, 100);

// a glitch looks like bad luck or bad driving; the server never says whose phone sent it
function glitch(kind) {
  const now = performance.now();
  if (kind === 'drift') { GT.mods.turnBias = (Math.random() < .5 ? -1 : 1) * .45; setTimeout(() => GT.mods.turnBias = 0, 900) }
  else if (kind === 'stall') GT.mods.gasCutUntil = now + 1500;
  else if (kind === 'jam') GT.mods.doorJamUntil = now + 3000;
  else if (kind === 'fog') window.GionFog?.bank(true);   // a thick bank rolls over the glass
  else if (kind === 'flurry') window.GionShoot?.flurry(3);   // a gust of stickers lands on the glass at once
  else if (kind === 'seize') window.GionShoot?.seize(4000);   // the wipers won't move for 4 s
  else if (kind === 'decoy') {   // a marker "from the navigator" somewhere plausible and wrong
    const st = GT.state(); if (!st) return;
    const pts = GT.scene.roads.flat(2).filter(p => { const d = Math.hypot(p[0] - st.x, p[1] - st.y); return d > 25 && d < 80 && Math.hypot(p[0] - st.tx, p[1] - st.ty) > 30 });
    if (!pts.length) return;
    const p = pts[Math.floor(Math.random() * pts.length)], nav = C.holder('nav');
    GT.setPing(p[0], p[1], nav ? nav.color : '#c9932c');
    C.toPhones({ t: 'ev', k: 'ping', x: p[0], y: p[1] });
  }
}

/* ---------- 3. the vote ---------- */
let voteT = null;
function renderVote(m, st) {
  voteEl.hidden = false;
  const s = st || {}, left = Math.max(0, Math.ceil((m.until - Date.now()) / 1000));
  voteEl.innerHTML = `<small class="wt-cap">Shift over</small>
    <h2>Who took the wrong turn?</h2>
    <p class="wt-tripline ${m.success ? 'ok' : 'bad'}">${m.success ? `The trip made it: ${yen(m.yen)} of ${yen(m.goal)}.` : `The trip fell short: ${yen(m.yen)} of ${yen(m.goal)}.`}</p>
    <p>${m.success ? 'The crew already won, but name the imposter anyway.' : 'Vote on your phones. A majority on the imposter still wins it for the crew.'}</p>
    <ul class="wt-seats">${m.seats.map(p => `<li style="--c:${p.color}"><i></i>${esc(p.name)}</li>`).join('')}</ul>
    <p class="wt-sub">${s.voted ?? 0} of ${m.seats.length} voted · ${left} s</p>`;
}
let voteMsg = null;

/* ---------- 4. the reveal ---------- */
function renderReveal(f) {
  phase = 'final'; voteEl.hidden = true; panel.hidden = true; clearInterval(voteT);
  const imp = f.players.find(p => p.imposter);
  const head = f.aborted ? 'Trip cancelled' : f.crewWins ? (f.caught ? 'Caught at the wheel.' : 'The crew got there.') : 'The imposter got away.';
  const sub = f.aborted ? 'Every stake went back to its owner.'
    : `${f.result ? `${yen(f.result.yen)} of ${yen(f.goal)}` : ''}${imp ? ` · ${esc(imp.name)} was the imposter, ${imp.votesAgainst} vote${imp.votesAgainst === 1 ? '' : 's'} against` : ''}`;
  const order = [...f.players].sort((a, b) => a.imposter - b.imposter);   // the imposter turns over last
  const cards = order.map((p, i) => {
    const net = p.payout - f.stake, wagered = p.wager != null;
    return `<div class="wt-card ${p.imposter ? 'imp' : ''}" style="--c:${p.color};--d:${.6 + i * .7 + (p.imposter ? .5 : 0)}s">
      <div class="wt-face wt-front"><i></i><b>${esc(p.name)}</b><span>?</span></div>
      <div class="wt-face wt-back"><i></i><b>${esc(p.name)}</b>
        <span class="wt-role">${f.aborted ? 'Refunded' : p.imposter ? 'Imposter' : 'Crew'}</span>
        <small>${f.aborted ? (p.payout ? `${sol(p.payout)} SOL back` : 'never staked') : wagered ? `wagered ${sol(p.wager)} SOL` : 'no reveal: stake forfeited'}</small>
        ${f.aborted ? '' : `<em class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}${sol(Math.abs(net))} SOL</em>`}
        ${f.aborted ? '' : `<span class="wt-votes">${'●'.repeat(p.votesAgainst)}<small>${p.votesAgainst ? '' : 'no votes'}</small></span>`}
      </div></div>`;
  }).join('');
  const links = Object.entries({ create: 'Escrow opened', lock: 'Roles sealed', report: 'Result', settle: 'Payout', refund: 'Refund' })
    .filter(([k]) => f.tx[k]).map(([k, label]) => `<a href="${f.tx[k]}" target="_blank" rel="noopener">${label} ↗</a>`).join('');
  const last = .6 + order.length * .7 + .5;
  revealEl.hidden = false;
  revealEl.innerHTML = `<div class="wt-sheet gt-card">
    <small class="wt-cap">Trip report · settled on Solana devnet</small>
    <div class="wt-cards">${cards}</div>
    <h2 class="wt-head ${f.crewWins || f.aborted ? 'crew' : 'imp'}" style="--d:${last + .3}s">${head}</h2>
    <p class="wt-subhead" style="--d:${last + .5}s">${sub}</p>
    <p class="wt-links" style="--d:${last + .7}s">${links}</p>
    <button class="gt-ghost" id="wt-done" style="--d:${last + .7}s">Back to the lobby</button></div>`;
  $('wt-done').onclick = () => { revealEl.hidden = true; phase = 'off' };
}

/* ---------- server messages ---------- */
C.onDx = m => {
  if (m.t === 'dx-avail') { avail = m.why; renderSwitch() }
  else if (m.t === 'dx-status') {
    if (phase === 'setup') renderPanel(m);
    else if (phase === 'vote' && voteMsg) renderVote(voteMsg, m);
    else if (phase === 'vote' && m.msg) { voteEl.querySelector('.wt-sub') && (voteEl.querySelector('.wt-sub').textContent = m.msg) }
  }
  else if (m.t === 'dx-error') { if (phase === 'setup') renderPanel(null, m.why); else GT.toast(m.why) }
  else if (m.t === 'dx-locked') {
    renderPanel({ ...lastStatus, phase: 'locked' });
    setTimeout(() => { panel.hidden = true; C.startCountdown(true) }, 1600);
  }
  else if (m.t === 'dx-glitch') glitch(m.kind);
  else if (m.t === 'dx-vote') {
    phase = 'vote'; voteMsg = { ...m, until: Date.now() + m.secs * 1000 };
    renderVote(voteMsg); clearInterval(voteT);
    voteT = setInterval(() => { if (phase === 'vote') renderVote(voteMsg, lastStatus) }, 1000);
  }
  else if (m.t === 'dx-final') renderReveal(m);
  if (m.t === 'dx-status') lastStatus = m;
};
})();
