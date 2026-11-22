/* Gion Taxi crew play: the little visitors the shooter pops and the wipers sweep off.
   Shared by the laptop (built into the page before shoot.js) and the phone (served as /cuties.js before pad-shoot.js),
   so the phone's small picture of the glass matches the windshield.

   Drawn like the map and the crew characters (crew.js): simple geometric parts with softened corners, flat fills, no
   outlines, a hard light/shade split down the middle (light from the upper right, so the left half is in shade), a
   see-through blue-violet shadow and small dot eyes. No blush, shine or sticker rim.

   GionCuties.draw(g, kind, x, y, r, color, { t, state, alpha, sx, sy, night, ph })
     r      radius in px (the figure is about 2r across)
     color  the season's ink for this one (shoot.js PALETTE)
     state  'fly' (blinks), 'hit' (wide eyes, flinch) or 'stuck' (eyes squeezed shut against the glass) */
(() => {
const INK = '#263c35', CREAM = '#f3e6cc', GOLD = '#c9932c', SHADOW = '#4a4f8a';
const KINDS = ['neko', 'sparrow', 'blossom', 'leaf', 'lantern', 'ladybug', 'mochi'];
// how each one moves on the way in (shoot.js), and how many hits it takes
const META = {
  neko: { move: 'hop' }, sparrow: { move: 'flutter' }, blossom: { move: 'sway' }, leaf: { move: 'tumble' },
  lantern: { move: 'beat', hp: 2 }, ladybug: { move: 'wobble' }, mochi: { move: 'squish' },
};

// mix a #rrggbb colour toward white (k > 0) or toward the map's ink (k < 0), as crew.js does
function tint(hex, k) {
  const n = parseInt(hex.slice(1, 7), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const to = k > 0 ? [255, 255, 255] : [0x26, 0x3c, 0x35], a = Math.abs(k);
  return '#' + c.map((v, i) => Math.round(v + (to[i] - v) * a).toString(16).padStart(2, '0')).join('');
}
// a polygon from [[x, y], …]
const poly = (g, pts) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath() };
// a regular-ish octagon, for faceted heads, eyes and centres
const oct = (x, y, rx, ry = rx) => { const kx = rx * .42, ky = ry * .42; return [[x - kx, y - ry], [x + kx, y - ry], [x + rx, y - ky], [x + rx, y + ky], [x + kx, y + ry], [x - kx, y + ry], [x - rx, y + ky], [x - rx, y - ky]] };
// one part: filled in its lit colour with softened corners, then its left half again in shade
function part(g, path, color, { shade = -.18, round = .09 } = {}) {
  const paint = c => { g.beginPath(); path(); g.fillStyle = c; g.fill(); if (round) { g.strokeStyle = c; g.lineWidth = round; g.lineJoin = 'round'; g.stroke() } };
  paint(color);
  if (!shade) return;
  g.save(); g.beginPath(); g.rect(-3, -3, 3, 6); g.clip(); paint(tint(color, shade)); g.restore();
}
// the shadow under the whole figure, thrown down and to the left
function shadow(g, path, night) {
  g.save(); g.translate(-.12, .16); g.globalAlpha *= night ? .14 : .24;
  g.beginPath(); path(); g.fillStyle = SHADOW; g.fill(); g.strokeStyle = SHADOW; g.lineWidth = .09; g.lineJoin = 'round'; g.stroke();
  g.restore();
}
// plain dot eyes; shut into short dashes when stuck, wider when hit, a quick blink now and then in flight
function eyes(g, o, x1, x2, y, r = .085, color = INK) {
  const blink = o.state === 'fly' && ((o.t + o.ph) % 3.4) < .12;
  g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
  for (const x of [x1, x2]) {
    if (o.state === 'stuck' || blink) { g.lineWidth = r * .9; g.beginPath(); g.moveTo(x - r * 1.1, y); g.lineTo(x + r * 1.1, y); g.stroke() }
    else { g.beginPath(); g.arc(x, y, o.state === 'hit' ? r * 1.4 : r, 0, 6.2832); g.fill() }
  }
}

const DRAW = {
  neko(g, c, o) {   // a faceted cat head with pointed ears
    const head = () => poly(g, [[-.62, -.36], [.62, -.36], [.82, -.04], [.74, .4], [.36, .66], [-.36, .66], [-.74, .4], [-.82, -.04]]);
    const earL = () => poly(g, [[-.74, -.22], [-.6, -.92], [-.18, -.4]]), earR = () => poly(g, [[.74, -.22], [.6, -.92], [.18, -.4]]);
    shadow(g, () => { head(); earL(); earR() }, o.night);
    part(g, earL, c); part(g, earR, c);
    part(g, () => poly(g, [[-.58, -.36], [-.54, -.7], [-.34, -.42]]), tint(c, -.4), { round: .05 });
    part(g, () => poly(g, [[.58, -.36], [.54, -.7], [.34, -.42]]), tint(c, -.4), { round: .05 });
    part(g, head, c);
    part(g, () => poly(g, oct(0, .36, .34, .24)), CREAM, { shade: -.08 });   // muzzle
    g.fillStyle = INK; g.beginPath(); poly(g, [[-.08, .22], [.08, .22], [0, .32]]); g.fill();   // nose
    eyes(g, o, -.32, .32, .04);
  },
  sparrow(g, c, o) {   // a round faceted bird, wing beating on the way in
    const flap = o.state === 'fly' ? Math.sin(o.t * 14 + o.ph) : o.state === 'hit' ? 1 : -.3;
    const body = () => poly(g, oct(0, .06, .74, .66)), tail = () => poly(g, [[-.62, -.02], [-1.0, -.26], [-.92, .24]]);
    shadow(g, () => { body(); tail() }, o.night);
    part(g, tail, tint(c, -.15));
    part(g, body, c);
    part(g, () => poly(g, oct(.1, .36, .46, .26)), CREAM, { shade: -.08 });   // belly
    part(g, () => poly(g, [[.68, -.08], [1.0, .04], [.68, .16]]), GOLD, { shade: 0, round: .05 });   // beak
    g.save(); g.translate(-.16, .04); g.scale(1, .55 + .45 * flap);
    part(g, () => poly(g, [[-.38, -.12], [.3, -.2], [.18, .18], [-.3, .2]]), tint(c, -.25), { shade: 0 });   // wing
    g.restore();
    eyes(g, o, .3, .52, -.16, .075);
  },
  blossom(g, c, o) {   // five faceted petals round a gold centre
    const turn = o.state === 'fly' ? Math.sin(o.t * 1.3 + o.ph) * .3 : 0;
    const petal = i => { const a = turn + i * 1.2566 - 1.5708, ca = Math.cos(a), sa = Math.sin(a), q = (u, v) => [ca * u - sa * v, sa * u + ca * v]; return () => poly(g, [q(.18, -.16), q(.7, -.34), q(.96, 0), q(.7, .34), q(.18, .16)]) };
    shadow(g, () => { for (let i = 0; i < 5; i++) petal(i)() }, o.night);
    for (let i = 0; i < 5; i++) part(g, petal(i), c);
    part(g, () => poly(g, oct(0, 0, .36)), GOLD, { shade: -.12 });
    eyes(g, o, -.13, .13, -.02, .065);
  },
  leaf(g, c, o) {   // a maple leaf, tumbling
    g.rotate(o.state === 'fly' ? Math.sin(o.t * 2.4 + o.ph) * .5 : .12);
    const tips = [[0, -1], [.62, -.66], [1, -.12], [.56, .36], [0, .22], [-.56, .36], [-1, -.12], [-.62, -.66]];
    const dips = [[.26, -.6], [.6, -.36], [.62, .12], [.2, .4], [-.2, .4], [-.62, .12], [-.6, -.36], [-.26, -.6]];
    const path = () => { g.moveTo(...tips[0]); for (let i = 0; i < 8; i++) { g.lineTo(...dips[i]); g.lineTo(...tips[(i + 1) % 8]) } g.closePath() };
    shadow(g, path, o.night);
    part(g, path, c);
    part(g, () => poly(g, [[-.04, .3], [.04, .3], [.07, .86], [-.01, .86]]), tint(c, -.35), { shade: 0, round: .04 });   // stem
    eyes(g, o, -.2, .2, -.12, .075);
  },
  lantern(g, c, o) {   // a paper chōchin, like the ones the fares wait at
    const body = () => poly(g, oct(0, 0, .66, .78));
    shadow(g, body, o.night);
    if (o.state === 'fly') {   // a soft warm glow that pulses with it
      const p = .5 + .5 * Math.sin(o.t * 6.5 + o.ph), gr = g.createRadialGradient(0, 0, .3, 0, 0, 1.3);
      gr.addColorStop(0, '#ffd98a99'); gr.addColorStop(1, '#ffd98a00');
      g.save(); g.globalAlpha *= .3 + .3 * p; g.beginPath(); g.arc(0, 0, 1.3, 0, 6.2832); g.fillStyle = gr; g.fill(); g.restore();
    }
    part(g, body, c);
    for (const y of [-.4, .4]) part(g, () => poly(g, [[-.6, y - .03], [.6, y - .03], [.6, y + .03], [-.6, y + .03]]), tint(c, -.2), { shade: -.1, round: .03 });   // ribs
    for (const y of [-.9, .76]) part(g, () => poly(g, [[-.34, y], [.34, y], [.34, y + .14], [-.34, y + .14]]), INK, { shade: 0, round: .05 });   // caps
    eyes(g, o, -.24, .24, .02);
  },
  ladybug(g, c, o) {   // a round beetle with a dark head and spots
    const shell = () => poly(g, oct(0, .14, .78, .72)), head = () => poly(g, oct(0, -.52, .42, .32));
    shadow(g, () => { shell(); head() }, o.night);
    part(g, head, INK, { shade: 0 });
    part(g, shell, c);
    g.fillStyle = INK;
    g.fillRect(-.03, -.2, .06, 1.04);   // the split between the wings
    for (const [x, y, r] of [[-.42, .02, .13], [.42, .02, .13], [-.36, .48, .11], [.36, .48, .11]]) { g.beginPath(); poly(g, oct(x, y, r)); g.fill() }
    eyes(g, o, -.17, .17, -.54, .075, CREAM);
  },
  mochi(g, c, o) {   // a soft mochi that squishes as it bounces
    const sq = o.state === 'fly' ? 1 + .08 * Math.sin(o.t * 7 + o.ph) : 1;
    g.save(); g.scale(sq, 1 / sq);
    const body = () => poly(g, [[-.5, -.66], [.5, -.66], [.88, -.24], [.9, .42], [.6, .62], [-.6, .62], [-.9, .42], [-.88, -.24]]);
    shadow(g, body, o.night);
    part(g, body, tint(c, .6), { shade: -.1 });
    part(g, () => poly(g, [[-.88, .3], [.88, .3], [.9, .42], [.6, .62], [-.6, .62], [-.9, .42]]), tint(c, .25), { shade: -.1 });   // the darker base
    part(g, () => poly(g, [[0, -.66], [.36, -.9], [.24, -.6]]), tint(c, -.1), { round: .05 });   // a leaf on top
    eyes(g, o, -.3, .3, -.02);
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

// a pop: small faceted bits in the figure's colours (the caller moves them)
function confetti(color, n = 12) {
  const cols = [color, tint(color, .35), tint(color, -.2), GOLD];
  return Array.from({ length: n }, (_, i) => ({ shape: i % 3 ? 'shard' : 'dot', color: cols[i % cols.length], size: .5 + Math.random() * .6 }));
}
function drawBit(g, q, x, y, s, rot, alpha) {
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = alpha; g.fillStyle = q.color; g.beginPath();
  if (q.shape === 'shard') poly(g, [[-s, 0], [0, -s * .55], [s, 0], [0, s * .55]]);
  else poly(g, oct(0, 0, s * .55));
  g.fill(); g.restore();
}

window.GionCuties = { KINDS, META, draw, confetti, drawBit, tint };
})();
