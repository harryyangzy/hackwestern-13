/* tandem: the opening flow on a city page. index.html (title → city selection) sends players here with ?play=solo or
   ?play=crew. Solo: a short briefing, a 3-2-1, then the shift. Crew: the lobby opens at once (mp.js), and its Start runs
   the same briefing (window.GionBrief) in sync with the phones. Without ?play the page goes back to the title, so the old
   instruction card never opens first. Runs last in the page, after drive.js, shoot.js, mp.js and wt.js. */
(() => {
const GT = window.GionTaxi, $ = id => document.getElementById(id);
if (!GT) return;
const HOME = 'index.html', play = new URLSearchParams(location.search).get('play');
const served = /^https?:$/.test(location.protocol);
if (play !== 'solo' && !(play === 'crew' && served)) { location.replace(HOME + (play === 'crew' ? '#crew' : '')); return }

document.body.classList.add('gt-flow');   // drive.css: the old card only shows a shift's result now
$('gt-menu').hidden = true; $('gt-open').hidden = true; GT.lockMenu = true;
const back = `${HOME}#${play}`;
const cities = $('gt-menu').querySelector('.gt-cities');
if (cities) cities.innerHTML = `<a href="${back}">← Choose another city</a>`;
// the crew lobby's close button goes back to city selection (mp.js closes the room first)
const lclose = $('gt-lclose');
if (lclose) { lclose.textContent = '← Cities'; lclose.setAttribute('aria-label', 'Close the room and choose another city'); lclose.dataset.home = back }

/* ---------- the briefing: objective, each player's job, then a 3-2-1 ---------- */
$('stage').insertAdjacentHTML('beforeend', `<div id="gt-brief" class="gt-card" hidden>
  <small>Today’s shift</small><h2 id="gt-btitle"></h2><p id="gt-bobj"></p><ul id="gt-blines"></ul><b id="gt-bcount" aria-live="assertive"></b></div>`);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let briefing = false;
// returns a promise that resolves at "go"; onCount(n) fires on each number (mp.js sends it to the phones);
// abort() is checked between steps (a phone leaving, the room closing)
window.GionBrief = ({ title, objective, lines = [], onCount, abort = () => false }) => new Promise(resolve => {
  if (briefing) return;   // never two at once
  briefing = true;
  $('gt-btitle').textContent = title; $('gt-bobj').textContent = objective;
  $('gt-blines').innerHTML = lines.map(l => `<li><i style="background:${esc(l.color)}"></i><b>${esc(l.name)}</b><span>${esc(l.text)}</span></li>`).join('');
  const box = $('gt-brief'), num = $('gt-bcount');
  num.textContent = 'Get ready'; num.className = 'ready'; box.hidden = false;
  const done = ok => { briefing = false; box.hidden = true; if (ok) resolve() };
  let n = 3;
  const tick = () => {
    if (abort()) return done(false);
    if (n === 0) return done(true);
    num.textContent = n; num.className = ''; void num.offsetWidth; num.className = 'pop';
    onCount?.(n); n--; setTimeout(tick, 900);
  };
  setTimeout(tick, 2600);   // time to read the briefing first
});

/* ---------- go ---------- */
const whenLoaded = cb => { const f = () => ($('loading').hidden ? cb() : setTimeout(f, 120)); f() };
if (play === 'solo') {
  whenLoaded(() => window.GionBrief({
    title: GT.city.name, objective: 'Pick up passengers at the orange lantern and deliver them to the gold one before the shift ends.',
    lines: [{ color: '#c8513a', name: 'You', text: '↑ / W gas · ↓ / S brake, then reverse · ← → steer · C camera · Esc ends the shift' }],
  }).then(() => { GT.lockMenu = false; if (!GT.driving) GT.start('taxi') }));
} else {
  whenLoaded(() => window.GionCrew?.open());
}
})();
