/* tandem: the crew's characters, one per seat colour. Built like the map: simple geometric parts with softened corners,
   flat fills and no outlines, a hard light/shade split down the middle (light from the upper right), a see-through
   blue-violet ground shadow, and small dot eyes. Just the heads, all facing front, so they read as a set.

   GionCrew.forColor('#c8513a')          → 'fox'   (the seat colours in mp.js COLORS)
   GionCrew.svg(kindOrColor, { size, shadow })  → an <svg> string
     shadow  false to leave out the ground shadow (for small chips)
   GionCrew.icon(color, size, mood)       → the same without the shadow, for lists and chips
   Used by the laptop (built into the page) and the phone (served as /crew.js). */
(() => {
const INK = '#263c35', CREAM = '#f3e6cc', AUTUMN = '#e0702c';
const SHADOW = '#4a4f8a';

// mix #rrggbb toward white (k > 0) or toward the map's ink (k < 0)
function tint(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const to = k > 0 ? [255, 255, 255] : [0x26, 0x3c, 0x35], a = Math.abs(k);
  return '#' + c.map((v, i) => Math.round(v + (to[i] - v) * a).toString(16).padStart(2, '0')).join('');
}
let uid = 0, clipId = '';
// every part is drawn in its lit colour with softened corners, then its left half again in shade (light comes from the
// upper right, like the map, so the split is a hard vertical edge down the middle of the figure)
function part(d, color, { shade = -.18, round = 5 } = {}) {
  const st = (f) => `<path d="${d}" fill="${f}" stroke="${f}" stroke-width="${round}" stroke-linejoin="round"/>`;
  return st(color) + `<g clip-path="url(#${clipId})">${st(tint(color, shade))}</g>`;
}

// a regular-ish octagon of radius r centred on (x, y), for the faceted ears and eye discs
const oct = (x, y, r) => { const k = r * .42; return `M${x - k} ${y - r}H${x + k}L${x + r} ${y - k}V${y + k}L${x + k} ${y + r}H${x - k}L${x - r} ${y + k}V${y - k}Z` };
// plain round dot eyes, no expression
const eyes = (x1, x2, y, { r = 3.6, color = INK } = {}) =>
  `<circle cx="${x1}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${color}"/>`;

const CHARS = {
  // fox: a pointed head with tall dark-tipped ears and a cream muzzle
  fox: { color: '#c8513a', name: 'Fox', draw(c) {
    let s = part('M30 38L33 13L52 32Z', c) + part('M90 38L87 13L68 32Z', c);
    s += part('M33 13L37 20L34 24Z', tint(c, -.5), { round: 3 }) + part('M87 13L83 20L86 24Z', tint(c, -.5), { round: 3 });
    s += part('M30 36H90L84 60L60 80L36 60Z', c);
    s += part('M38 58L60 54L82 58L60 80Z', CREAM, { shade: -.08 });
    s += `<circle cx="60" cy="76" r="3.6" fill="${INK}"/>`;
    return s + eyes(48, 72, 49);
  } },
  // bear: a brown faceted head with eight-sided ears and a pale six-sided muzzle (keeps the green seat; drawn brown)
  bear: { color: '#36594b', name: 'Bear', draw() {
    const lit = '#8a5a3b';
    let s = part(oct(37, 30, 10), lit) + part(oct(83, 30, 10), lit);
    s += part(oct(37, 30, 5), CREAM, { shade: -.08, round: 2 }) + part(oct(83, 30, 5), CREAM, { shade: -.08, round: 2 });
    s += part('M38 30H82L92 40V64L78 80H42L28 64V40Z', lit);
    s += part('M50 55H70L75 62L69 74H51L45 62Z', CREAM, { shade: -.08 });
    s += part('M55 58H65L60 64Z', INK, { shade: 0, round: 3 });
    return s + eyes(46, 74, 46);
  } },
  // owl: a faceted head with two ear tufts, eight-sided pale eye discs and a small beak
  owl: { color: '#c9932c', name: 'Owl', draw(c) {
    const lit = tint(c, .15);
    let s = part('M32 38L34 16L50 30Z', lit) + part('M88 38L86 16L70 30Z', lit);
    s += part('M40 28H80L92 40V62L74 80H46L28 62V40Z', lit);
    s += part(oct(46, 50, 11), CREAM, { shade: -.08 }) + part(oct(74, 50, 11), CREAM, { shade: -.08 });
    s += part('M56 58H64L60 68Z', AUTUMN, { shade: -.15, round: 3 });
    return s + eyes(46, 74, 50);
  } },
  // raccoon: a broad head with a dark band across the eyes and a pale muzzle
  raccoon: { color: '#4f6d8a', name: 'Raccoon', draw(c) {
    const lit = tint(c, .12), dark = tint(c, -.5);
    let s = part('M30 40L32 16L50 32Z', lit) + part('M90 40L88 16L70 32Z', lit);
    s += part('M34 24L36 32L42 30Z', CREAM, { round: 2 }) + part('M86 24L84 32L78 30Z', CREAM, { round: 2 });
    s += part('M32 36H88L94 58L78 78H42L26 58Z', lit);
    s += part('M29 47H91L91 58L72 63L60 58L48 63L29 58Z', dark, { shade: -.1, round: 4 });
    s += part('M48 66L60 61L72 66L60 80Z', CREAM, { shade: -.08 });
    s += `<circle cx="60" cy="67" r="3.4" fill="${INK}"/>`;
    return s + eyes(45, 75, 53, { color: CREAM, r: 3.4 });
  } },
};
const KINDS = Object.keys(CHARS);
const BY_COLOR = Object.fromEntries(KINDS.map(k => [CHARS[k].color.toLowerCase(), k]));
const forColor = color => BY_COLOR[String(color || '').toLowerCase()] || null;

function svg(kindOrColor, { size = 96, shadow = true, title = true } = {}) {
  const kind = CHARS[kindOrColor] ? kindOrColor : forColor(kindOrColor) || KINDS[0], ch = CHARS[kind];
  clipId = 'gc' + (++uid);
  const ground = shadow ? `<ellipse cx="58" cy="90" rx="32" ry="6" fill="${SHADOW}" opacity=".26"/>` : '';
  return `<svg class="gc-char gc-${kind}" viewBox="10 4 100 100" width="${size}" height="${size}" role="img"${title ? ` aria-label="${ch.name}"` : ' aria-hidden="true"'}>` +
    `<clipPath id="${clipId}"><rect x="0" y="0" width="60" height="120"/></clipPath>` + ground + ch.draw(ch.color) + '</svg>';
}

// a small character for lists and chips: no ground shadow, sits inline with text
const icon = (color, size = 24, mood = 'idle') => svg(color, { size, mood, shadow: false, title: false });
if (typeof document !== 'undefined' && !document.getElementById('gc-style')) {
  const st = document.createElement('style'); st.id = 'gc-style';
  st.textContent = '.gc-char{flex:none;display:inline-block;vertical-align:middle;overflow:visible}';
  (document.head || document.documentElement).appendChild(st);
}

window.GionCrew = { CHARS, KINDS, forColor, svg, icon, tint };
})();
