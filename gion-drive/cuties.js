/* Gion Taxi crew play: the little visitors the shooter pops and the wipers sweep off, drawn as paper stickers.
   Shared by the laptop (built into the page before shoot.js) and the phone (served as /cuties.js before pad-shoot.js),
   so the phone's small picture of the glass matches the windshield.

   GionCuties.draw(g, kind, x, y, r, color, { t, state, alpha, sx, sy, night, ph })
     r      radius in px (the sticker is about 2r across)
     color  the season's ink for this one (shoot.js PALETTE); faces and details stay in the map's dark ink
     state  'fly' (blinks and flaps), 'hit' (wide eyes, flinch) or 'stuck' (squeezed shut against the glass)
   Each sticker has a cream outline, like the map's paper cut-outs, so it reads on any street or sky. */
(() => {
const INK = '#263c35', CREAM = '#fffcf3', BLUSH = '#ee9a92', GOLD = '#f2c94c';
const KINDS = ['neko', 'sparrow', 'blossom', 'leaf', 'lantern', 'ladybug', 'mochi'];
// how each one moves on the way in (shoot.js), and how many hits it takes
const META = {
  neko: { move: 'hop' }, sparrow: { move: 'flutter' }, blossom: { move: 'sway' }, leaf: { move: 'tumble' },
  lantern: { move: 'beat', hp: 2 }, ladybug: { move: 'wobble' }, mochi: { move: 'squish' },
};

// mix a #rrggbb colour toward white (k > 0) or toward ink (k < 0)
function tint(hex, k) {
  const n = parseInt(hex.slice(1, 7), 16), to = k > 0 ? 255 : 30, a = Math.abs(k);
  const c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v + (to - v) * a));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
// draw a shape twice: a fat cream outline underneath, then the fill (the sticker look)
function sticker(g, path, fill, night, lw = .26) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  path(); g.strokeStyle = night ? '#1d2b26cc' : CREAM; g.lineWidth = lw; g.stroke();
  path(); g.fillStyle = fill; g.fill();
}
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 6.2832) };
const dot = (g, x, y, r, c) => { ell(g, x, y, r, r); g.fillStyle = c; g.fill() };
function shine(g, x, y, rx, ry) { g.save(); g.globalAlpha *= .45; ell(g, x, y, rx, ry, -.5); g.fillStyle = '#ffffff'; g.fill(); g.restore() }

// a face: eyes at ±dx, y; blush under them; a tiny mouth
function face(g, o, y = 0, dx = .3, size = 1, mouth = true) {
  const e = .075 * size, blink = o.state === 'fly' && ((o.t + o.ph) % 3.1) < .12;
  g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = .07 * size; g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = s * dx;
    if (o.state === 'stuck') { g.beginPath(); g.moveTo(x - s * .09 * size, y - .07 * size); g.lineTo(x + s * .05 * size, y); g.lineTo(x - s * .09 * size, y + .07 * size); g.stroke() }   // > <
    else if (o.state === 'hit') { dot(g, x, y, e * 1.6, INK); dot(g, x - e * .5, y - e * .6, e * .55, '#ffffff') }
    else if (blink) { g.beginPath(); g.moveTo(x - .07 * size, y); g.lineTo(x + .07 * size, y); g.stroke() }
    else { dot(g, x, y, e, INK); dot(g, x - e * .35, y - e * .4, e * .35, '#ffffff') }
    g.save(); g.globalAlpha *= .75; ell(g, x + s * .07 * size, y + .16 * size, .11 * size, .065 * size); g.fillStyle = BLUSH; g.fill(); g.restore();
  }
  if (!mouth) return;
  g.beginPath(); g.lineWidth = .055 * size;
  if (o.state === 'hit') { ell(g, 0, y + .17 * size, .05 * size, .065 * size); g.fillStyle = INK; g.fill() }
  else if (o.state === 'stuck') { g.moveTo(-.07 * size, y + .17 * size); g.quadraticCurveTo(0, y + .11 * size, .07 * size, y + .17 * size); g.stroke() }
  else { g.moveTo(-.08 * size, y + .12 * size); g.quadraticCurveTo(-.04 * size, y + .18 * size, 0, y + .13 * size); g.quadraticCurveTo(.04 * size, y + .18 * size, .08 * size, y + .12 * size); g.stroke() }
}

const DRAW = {
  neko(g, c, o) {   // a round cat face with tall ears
    const ear = s => { const p = [[s * .78, -.12], [s * .6, -.92], [s * .12, -.58]]; if (s > 0) p.reverse(); g.moveTo(...p[0]); g.lineTo(...p[1]); g.lineTo(...p[2]); g.closePath() };   // same winding both sides, so the fill has no gap
    sticker(g, () => { g.beginPath(); ear(-1); ear(1); g.moveTo(.84, .06); g.ellipse(0, .06, .84, .7, 0, 0, 6.2832) }, c, o.night);
    g.fillStyle = tint(c, .45); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * .62, -.28); g.lineTo(s * .56, -.72); g.lineTo(s * .27, -.5); g.closePath(); g.fill() }
    shine(g, -.38, -.18, .2, .1);
    face(g, o, .04, .32, 1.1);
    g.fillStyle = BLUSH; g.beginPath(); g.moveTo(-.05, .12); g.lineTo(.05, .12); g.lineTo(0, .17); g.closePath(); g.fill();   // nose
    g.strokeStyle = tint(c, -.35); g.lineWidth = .04;   // whiskers
    for (const s of [-1, 1]) for (const k of [-1, 1]) { g.beginPath(); g.moveTo(s * .58, .2 + k * .03); g.lineTo(s * .92, .16 + k * .1); g.stroke() }
  },
  sparrow(g, c, o) {   // a puffed-up round bird, wing flapping on the way in
    const flap = o.state === 'fly' ? Math.sin(o.t * 14 + o.ph) : o.state === 'hit' ? 1 : -.3;
    sticker(g, () => { g.beginPath(); g.moveTo(-.68, .05); g.lineTo(-1.02, -.18); g.lineTo(-.95, .22); g.closePath(); g.ellipse(0, .04, .76, .7, 0, 0, 6.2832) }, c, o.night);
    sticker(g, () => { g.beginPath(); g.moveTo(.7, -.04); g.lineTo(1.0, .06); g.lineTo(.7, .17); g.closePath() }, GOLD, o.night, .16);   // beak
    ell(g, .08, .34, .5, .32); g.fillStyle = tint(c, .6); g.fill();   // belly
    g.save(); g.translate(-.18, .06); g.scale(1, .55 + .45 * flap); ell(g, 0, 0, .38, .26, -.35); g.fillStyle = tint(c, -.2); g.fill(); g.restore();   // wing
    shine(g, -.25, -.38, .2, .09);
    g.save(); g.translate(.3, 0); face(g, o, -.12, .17, .8, false); g.restore();   // it looks the way it flies
  },
  blossom(g, c, o) {   // five round petals, a little face in the middle
    const turn = o.state === 'fly' ? Math.sin(o.t * 1.3 + o.ph) * .35 : 0;
    const petals = () => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = turn + i * 1.2566 - 1.5708; g.moveTo(Math.cos(a) * .95, Math.sin(a) * .95); g.ellipse(Math.cos(a) * .55, Math.sin(a) * .55, .4, .36, a, 0, 6.2832) } };
    sticker(g, petals, c, o.night);
    for (let i = 0; i < 5; i++) { const a = turn + i * 1.2566 - 1.5708; g.save(); g.globalAlpha *= .35; ell(g, Math.cos(a) * .62, Math.sin(a) * .62, .2, .12, a); g.fillStyle = '#ffffff'; g.fill(); g.restore() }   // soft petal light
    ell(g, 0, 0, .36, .36); g.fillStyle = GOLD; g.fill();
    face(g, o, -.02, .14, .75);
  },
  leaf(g, c, o) {   // a maple leaf, tumbling
    const spin = o.state === 'fly' ? Math.sin(o.t * 2.4 + o.ph) * .6 : .15;
    g.rotate(spin);
    const path = () => {
      g.beginPath();
      const tips = [[0, -1], [.62, -.66], [1, -.12], [.56, .36], [0, .22], [-.56, .36], [-1, -.12], [-.62, -.66]];
      const dips = [[.26, -.6], [.6, -.36], [.62, .12], [.2, .4], [-.2, .4], [-.62, .12], [-.6, -.36], [-.26, -.6]];   // plump lobes, so it reads as a leaf when small
      g.moveTo(...tips[0]);
      for (let i = 0; i < 8; i++) { g.lineTo(...dips[i]); g.lineTo(...tips[(i + 1) % 8]) }
      g.closePath();
    };
    sticker(g, path, c, o.night);
    g.strokeStyle = tint(c, -.3); g.lineWidth = .05;
    g.beginPath(); for (const [x, y] of [[0, -.8], [.75, -.2], [-.75, -.2], [.45, -.5], [-.45, -.5]]) { g.moveTo(0, .1); g.lineTo(x, y) } g.moveTo(0, .1); g.lineTo(.05, .82); g.stroke();   // veins + stem
    face(g, o, -.12, .2, .7);
  },
  lantern(g, c, o) {   // a paper chōchin, like the ones the fares wait at; it glows as it pulses
    if (o.state === 'fly') {   // a soft glow that pulses with it
      const p = .5 + .5 * Math.sin(o.t * 6.5 + o.ph), gr = g.createRadialGradient(0, 0, .3, 0, 0, 1.3);
      gr.addColorStop(0, '#ffd98acc'); gr.addColorStop(1, '#ffd98a00');
      g.save(); g.globalAlpha *= .35 + .35 * p; ell(g, 0, 0, 1.3, 1.3); g.fillStyle = gr; g.fill(); g.restore();
    }
    g.strokeStyle = INK; g.lineWidth = .06; g.beginPath(); g.moveTo(0, -.92); g.lineTo(0, -1.1); g.stroke();
    sticker(g, () => { g.beginPath(); g.ellipse(0, 0, .66, .78, 0, 0, 6.2832) }, c, o.night);
    g.strokeStyle = tint(c, -.22); g.lineWidth = .04;
    for (const y of [-.45, -.15, .15, .45]) { g.beginPath(); g.ellipse(0, y, .62 * Math.sqrt(1 - (y / .8) ** 2), .07, 0, 0, Math.PI); g.stroke() }   // ribs
    g.fillStyle = INK; for (const y of [-.92, .78]) { g.beginPath(); g.roundRect ? g.roundRect(-.34, y, .68, .15, .05) : g.rect(-.34, y, .68, .15); g.fill() }
    shine(g, -.3, -.3, .14, .22);
    face(g, o, .02, .24, .95);
  },
  ladybug(g, c, o) {   // a round beetle with a dark head and spots
    sticker(g, () => { g.beginPath(); g.ellipse(0, .12, .78, .74, 0, 0, 6.2832); g.moveTo(.42, -.5); g.ellipse(0, -.5, .42, .36, 0, 0, 6.2832) }, c, o.night);
    ell(g, 0, -.5, .42, .36); g.fillStyle = INK; g.fill();
    g.strokeStyle = INK; g.lineWidth = .06; g.beginPath(); g.moveTo(0, -.18); g.lineTo(0, .84); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * .15, -.8); g.quadraticCurveTo(s * .25, -1.05, s * .42, -1.02); g.stroke(); dot(g, s * .43, -1.02, .06, INK) }   // antennae
    for (const [x, y, r] of [[-.42, .02, .13], [.42, .02, .13], [-.36, .48, .11], [.36, .48, .11]]) dot(g, x, y, r, INK);
    shine(g, -.4, -.12, .15, .07);
    for (const s of [-1, 1]) {   // white eyes, so they read on the dark head
      const x = s * .16, y = -.52;
      if (o.state === 'stuck') { g.strokeStyle = '#ffffff'; g.lineWidth = .05; g.beginPath(); g.moveTo(x - s * .07, y - .06); g.lineTo(x + s * .04, y); g.lineTo(x - s * .07, y + .06); g.stroke() }
      else { const big = o.state === 'hit' ? 1.35 : 1; dot(g, x, y, .085 * big, '#ffffff'); dot(g, x + s * .015, y + .01, .045 * big, INK) }
    }
  },
  mochi(g, c, o) {   // a soft round mochi that squishes as it bounces
    const sq = o.state === 'fly' ? 1 + .08 * Math.sin(o.t * 7 + o.ph) : 1;
    g.save(); g.scale(sq, 1 / sq);
    sticker(g, () => { g.beginPath(); g.moveTo(-.9, .45); g.bezierCurveTo(-1.0, -.55, -.5, -.78, 0, -.78); g.bezierCurveTo(.5, -.78, 1.0, -.55, .9, .45); g.quadraticCurveTo(0, .7, -.9, .45); g.closePath() }, tint(c, .55), o.night);
    ell(g, 0, .38, .7, .14); g.fillStyle = tint(c, .2); g.fill();   // the darker base
    g.beginPath(); g.moveTo(-.22, -.78); g.quadraticCurveTo(0, -.62, .22, -.78); g.strokeStyle = c; g.lineWidth = .1; g.stroke();   // a leaf ribbon on top
    shine(g, -.45, -.4, .2, .1);
    face(g, o, .0, .3, 1.05);
    g.restore();
  },
};

function draw(g, kind, x, y, r, color, o = {}) {
  const f = DRAW[kind] || DRAW.neko;
  const opt = { t: o.t || 0, ph: o.ph || 0, state: o.state || 'fly', night: !!o.night };
  g.save(); g.translate(x, y); g.scale(r * (o.sx || 1), r * (o.sy || 1)); g.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (opt.state === 'hit') g.rotate(Math.sin((opt.t + opt.ph) * 40) * .12);   // a flinch
  f(g, color, opt);
  g.restore();
}

// a pop: petals and confetti in the sticker's colours (the caller moves them)
function confetti(color, n = 12) {
  const cols = [color, tint(color, .5), CREAM, GOLD];
  return Array.from({ length: n }, (_, i) => ({ shape: i % 3 ? 'petal' : 'dot', color: cols[i % cols.length], size: .5 + Math.random() * .6 }));
}
function drawBit(g, q, x, y, s, rot, alpha) {
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = alpha; g.fillStyle = q.color;
  if (q.shape === 'petal') { g.beginPath(); g.ellipse(0, 0, s, s * .55, 0, 0, 6.2832); g.fill() }
  else { g.beginPath(); g.arc(0, 0, s * .6, 0, 6.2832); g.fill() }
  g.restore();
}

window.GionCuties = { KINDS, META, draw, confetti, drawBit, tint };
})();
