/* Toronto City Hall (Viljo Revell, opened 1965): two curved towers, the east 27 storeys (99.5 m) and the west 20 storeys
   (79.4 m), around a domed, saucer-shaped council chamber that sits on the podium (en.wikipedia.org/wiki/Toronto_City_Hall;
   toronto.ca City Hall tours). Footprints and heights are OpenStreetMap's (podium w198500761, towers w27767543/w27767544,
   chamber w27767545). The towers' ribbing and glazing and the chamber's profile are drawn by eye from photographs. */
const CH = { podium: 'w198500761', west: 'w27767543', east: 'w27767544', chamber: 'w27767545' };
const CONCRETE = ['#e6e2d8', '#dedad0'], GLASS = ['#8fa6b3', '#9cb2be'];
const LANDMARKS = [{
  name: 'Toronto City Hall',
  ids: Object.values(CH),
  build() {
    const pod = findBuilding(CH.podium), west = findBuilding(CH.west), east = findBuilding(CH.east), ch = findBuilding(CH.chamber);
    if (!pod || !west || !east || !ch) return null;
    const P = 8, podRing = ccw(pod.ring);
    // the chamber: a circle fitted to the mapped outline
    const cx = ch.ring.reduce((s, p) => s + p[0], 0) / ch.ring.length, cy = ch.ring.reduce((s, p) => s + p[1], 0) / ch.ring.length;
    const R = ch.ring.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / ch.ring.length;
    const disc = (r, z) => atZ(polygon(cx, cy, r, 40), z);
    const tower = (b, top) => block(ccw(b.ring), P, top, { facade: 'office', wall: CONCRETE, glass: GLASS, trim: '#f2efe8', floor: 3.65, bay: 1.6, shop: 'none', top: '#cfcbc2', parapet: 1.2 });
    const draw = () => {
      const podium = block(podRing, 0, P, { facade: 'office', wall: CONCRETE, glass: GLASS, floor: 4, bay: 4, shop: 'none', top: '#cfcabd', parapet: .9 });
      const col = { fp: polygon(cx, cy, 5, 16), z1: 14, svg: stick([cx, cy, P], [cx, cy, 13.2], 4.2, '#d6d2c8') };
      const saucer = { fp: polygon(cx, cy, R, 24), z1: 24.5, svg:
        loft(disc(R * .4, 12.6), disc(R, 17.4), n => tone(n, soft('#e9e5dc'))) +
        loft(disc(R, 17.4), disc(R, 18.2), n => tone(n, soft('#d8d4ca'))) +
        loft(disc(R, 18.2), disc(R * .78, 21.6), n => tone(n, soft('#eeebe4'))) +
        loft(disc(R * .78, 21.6), disc(R * .42, 23.9), n => tone(n, soft('#f1eee8'))) +
        shape(disc(R * .42, 23.9), '#f1eee8', .3) };
      const wt = tower(west, west.h || 79.4), et = tower(east, east.h || 99.5);
      return podium.draw() + planSort([{ fp: wt.fp, z1: wt.z1, svg: wt.draw() }, { fp: et.fp, z1: et.z1, svg: et.draw() }, col, saucer]);
    };
    return obj(podRing, 100, draw);
  }
}];
