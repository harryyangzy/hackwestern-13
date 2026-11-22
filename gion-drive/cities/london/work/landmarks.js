/* Western University, London, Ontario: University College (OSM w118764092) and Middlesex College (OSM w118764099).
   Collegiate Gothic by John M. Moore, with Frederick H. Spier on the tower and auditorium, finished 1924; the central
   tower is the Middlesex Memorial Tower (en.wikipedia.org/wiki/University_College_(University_of_Western_Ontario)).
   The tower stands on the square bay in the middle of the east front of the OSM footprint. Heights and the tower's
   proportions are not mapped: they are drawn by eye (three storeys, a tower about three times the eaves height) and
   listed as illustrative in the field notes.
   Middlesex College: Collegiate Gothic, ground broken 1959, opened fall 1960, known for its spire and clock tower; clock
   faces and Gillett & Johnston bells installed 1960 (en.wikipedia.org/wiki/Middlesex_College_(University_of_Western_Ontario)).
   No source here gives the tower's position or size: it is drawn over the round bay at the south end of the OSM
   footprint, its height and spire by eye, and both are listed as illustrative in the field notes. */
const UC = 'w118764092', MX = 'w118764099', STONE = ['#d6c8aa', '#cfc0a1'], STONE_TOP = '#8c8e86', TRIM = '#efe6d0';
const LANDMARKS = [{
  name: 'University College',
  ids: [UC],
  build() {
    const b = findBuilding(UC); if (!b) return null;
    const ring = ccw(b.ring), EAVES = 13.5, TOP = 40;
    // the tower: the square bay on the east front of the footprint (plot metres, 320 m plot)
    const tw = ccw([[-104, -62], [-94, -62], [-94, -51], [-104, -51]]), tc = [-99, -56.5];
    const draw = () => {
      const body = block(ring, 0, EAVES, { facade: 'civic', wall: STONE, trim: TRIM, floor: 4.2, bay: 3, shop: 'none', top: STONE_TOP, parapet: 1.1 });
      const shaft = block(tw, EAVES, TOP - 4, { facade: 'civic', wall: STONE, trim: TRIM, floor: 5.5, bay: 3.2, shop: 'none', top: STONE_TOP });
      // the belfry stage, set back a little, with battlements and corner pinnacles
      const bel = ccw(tw.map(p => [tc[0] + (p[0] - tc[0]) * .9, tc[1] + (p[1] - tc[1]) * .9]));
      const stage = block(bel, TOP - 4, TOP, { facade: 'temple', wall: STONE[0], trim: TRIM, floor: 4, bay: 2.6, shop: 'none', top: STONE_TOP });
      let crown = '';
      for (let i = 0; i < bel.length; i++) {
        const a = bel[i], q = bel[(i + 1) % bel.length];
        for (let k = 0; k < 5; k++) {   // merlons along each side
          const f = (k + .5) / 5, x = a[0] + (q[0] - a[0]) * f, y = a[1] + (q[1] - a[1]) * f;
          crown += block(rect(x, y, .9, .9), TOP, TOP + 1.1, { facade: 'plain', wall: STONE[0], top: '#e4d8bf', shop: 'none' }).draw();
        }
        crown += stick([a[0], a[1], TOP], [a[0], a[1], TOP + 3.2], .45, STONE[1]) + peak(rect(a[0], a[1], .9, .9), TOP + 3.2, [a[0], a[1], TOP + 5.2], '#cdbf9f');
      }
      return body.draw() + shaft.draw() + stage.draw() + crown;
    };
    return obj(ring, TOP + 5.5, draw);
  }
}, {
  name: 'Middlesex College',
  ids: [MX],
  build() {
    const b = findBuilding(MX); if (!b) return null;
    const ring = ccw(b.ring), EAVES = 13, TOP = 33, SPIRE = 52;
    // the round bay at the south end of the footprint carries the clock tower (interpreted, see the note above)
    const cx = 125.5, cy = 21.5, r = 6.2, oct = ccw(polygon(cx, cy, r, 8, Math.PI / 8));
    const [ax0, ay0] = b.obb.ax, faces = [0, 1, 2, 3].map(k => { const a = Math.atan2(ay0, ax0) + k * Math.PI / 2; return [Math.cos(a), Math.sin(a)] });
    const draw = () => {
      const body = block(ring, 0, EAVES, { facade: 'civic', wall: STONE, trim: TRIM, floor: 4, bay: 3, shop: 'none', top: STONE_TOP, parapet: 1 });
      const shaft = block(oct, EAVES, TOP, { facade: 'civic', wall: STONE, trim: TRIM, floor: 5, bay: 2.6, shop: 'none', top: STONE_TOP });
      let s = body.draw() + shaft.draw();
      // four clock faces near the top of the shaft, on the faces that turn toward the viewer
      for (const [ux, uy] of faces) {
        if (ux * CAM_V[0] + uy * CAM_V[1] <= 0) continue;
        const c = [cx + ux * (r * .93 + .05), cy + uy * (r * .93 + .05)], rx = [-uy, ux];
        const disc = k => Array.from({ length: 20 }, (_, i) => { const t = i / 20 * Math.PI * 2; return [c[0] + rx[0] * Math.cos(t) * k, c[1] + rx[1] * Math.cos(t) * k, TOP - 3.4 + Math.sin(t) * k] });
        s += shape(disc(1.9), '#3d4a45', .3) + shape(disc(1.55), '#f3ecd8', .2) +
             edge([c[0], c[1], TOP - 3.4], [c[0] + rx[0] * .2, c[1] + rx[1] * .2, TOP - 2.3], '#2f3238', .12) +
             edge([c[0], c[1], TOP - 3.4], [c[0] + rx[0] * .9, c[1] + rx[1] * .9, TOP - 3.5], '#2f3238', .1);
      }
      // a short belfry drum, then the copper spire
      s += loft(atZ(oct, TOP), atZ(polygon(cx, cy, r * .78, 8, Math.PI / 8), TOP + 1.2), n => tone(n, soft(STONE[1])));
      s += peak(ccw(polygon(cx, cy, r * .78, 8, Math.PI / 8)), TOP + 1.2, [cx, cy, SPIRE], '#7fa38f');
      s += ball([cx, cy, SPIRE + .4], .45, soft('#c9a54a'), .2);
      return s;
    };
    return obj(ring, SPIRE + 1, draw);
  }
}];
