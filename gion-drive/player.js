
/* ---------- Gion Taxi: the player's car, drawn by the render worker ----------
   Appended after the Gion landmarks. The page sends self.PLAYER with each frame ({x, y, h, v, tx, ty, mode});
   we draw the player's taxi and the fare marker with the kit's own parts, and hand back the traffic near the car
   (self.NEAR) so the page can tell when the taxi bumps into a car, a bike or a person. */
const GION_EXTRA = typeof CITY_EXTRA === 'function' ? CITY_EXTRA : null;
let PLAYER_MESH = null;
let FARE_LOOK = null;   // made on first use: pedDressed needs the season, set up later in city.js
function fareMarker(x, y, mode, t) {
  const pickup = mode === 'pickup', col = pickup ? '#f26a2e' : '#f2c94c';
  const bob = Math.sin(t * 2.4) * .18;
  const parts = [];
  // a painted ring on the road where the fare waits or wants to go. It lies flat on the road, so it is sorted as if it
  // stood at its farthest point from the viewer: drawn before the taxi, the passenger and anything else standing on it.
  const far = [0, 1, 2, 3].map(k => [x + Math.cos(k * Math.PI / 2) * 2.3, y + Math.sin(k * Math.PI / 2) * 2.3])
    .sort((a, b) => depthOf([...a, 0]) - depthOf([...b, 0]))[0];
  parts.push({ fp: rect(far[0], far[1], .05, .05), h: .06, draw: () =>
    shape(atZ(polygon(x, y, 2.3, 28), .04), col, 0) + shape(atZ(polygon(x, y, 1.7, 28), .05), pickup ? '#fbefd5' : '#fff3c4', 0) });
  // a paper lantern floating high over the spot, so it shows over the roofs from down the street
  parts.push({ fp: rect(x, y, .55, .55), h: 9, draw: () => {
    const z0 = 7 + bob, fp = rect(x, y, .8, .8), cap = rect(x, y, .9, .9);
    return loft(atZ(fp, z0), atZ(fp, z0 + 1.5), () => col) + shape(atZ(cap, z0 + 1.52), '#3a2e26', .2) + shape(atZ(cap, z0 - .02), '#3a2e26', .2);
  } });
  if (pickup) {
    FARE_LOOK = FARE_LOOK || pedDressed(4242);
    const ped = pedestrian({ ...FARE_LOOK, p: [x, y], d: [Math.cos(t * .6), Math.sin(t * .6)], walked: 0 }, t);
    parts.push({ fp: ped.fp, h: ped.z1, svg: ped.svg });
  }
  return parts;
}
CITY_EXTRA = function (t) {
  const out = GION_EXTRA ? [].concat(GION_EXTRA(t) || []) : [];
  const me = self.PLAYER;
  self.NEAR = null;
  if (!me) return out;
  if (!PLAYER_MESH) PLAYER_MESH = makeCar('sedan', { plate: VEH.plate || '#f2f2ee', sign: '#faeaa2' });
  const car = carDraw({ p: [me.x, me.y], d: [Math.cos(me.h), Math.sin(me.h)], mesh: PLAYER_MESH, m: soft('#c8513a'), v: Math.abs(me.v) });
  out.push({ fp: car.fp, h: car.z1, svg: car.svg });
  if (me.tx != null) out.push(...fareMarker(me.tx, me.ty, me.mode, t));
  self.NEAR = TRAFFIC.to(t).filter(a => Math.hypot(a.p[0] - me.x, a.p[1] - me.y) < 14 && a.alpha > .5)
    .map(a => ({ k: a.kind, id: a.id, x: a.p[0], y: a.p[1], dx: a.d[0], dy: a.d[1], L: a.shape[0], W: a.shape[1] }));
  return out;
};
