
/* ---------- Gion Taxi: the player's car, drawn by the render worker ----------
   Appended after the Gion landmarks. The page sends self.PLAYER with each frame ({x, y, h, v, tx, ty, mode});
   we draw the player's taxi, the fare marker, the navigator's ping ({px, py, pc}), the road kerbs and bowling pops with the kit's own parts, and hand back the traffic near the car
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
// the navigator's ping (crew play): a small ring and a hanging lantern in the navigator's colour, where they tapped the map
function pingMarker(x, y, col, t) {
  const far = [0, 1, 2, 3].map(k => [x + Math.cos(k * Math.PI / 2) * 1.6, y + Math.sin(k * Math.PI / 2) * 1.6])
    .sort((a, b) => depthOf([...a, 0]) - depthOf([...b, 0]))[0];
  const bob = Math.sin(t * 3.1) * .15;
  return [{ fp: rect(far[0], far[1], .05, .05), h: .06, draw: () => shape(atZ(polygon(x, y, 1.6, 24), .04), col, 0) + shape(atZ(polygon(x, y, 1.15, 24), .05), '#fbefd5', 0) },
    { fp: rect(x, y, .4, .4), h: 6, draw: () => { const z0 = 4.6 + bob, fp = rect(x, y, .5, .5), cap = rect(x, y, .58, .58);
      return loft(atZ(fp, z0), atZ(fp, z0 + 1), () => col) + shape(atZ(cap, z0 + 1.02), '#3a2e26', .2) + shape(atZ(cap, z0 - .02), '#3a2e26', .2) } }];
}
// kerbs: red and cream stripes along every road edge (dark and cream where the road leaves the plot), so it's always clear
// where the taxi can go. Built once from the scene's road rings, in 1.6 m pieces that sort with everything else.
let KERBS = null;
function buildKerbs() {
  KERBS = [];
  const H = SCENE.meta.half, DRIVE = SCENE.roads.concat(typeof GT_CITY === 'object' && GT_CITY.drivePaths ? (SCENE.paths || []) : []);
  const onRoad = p => DRIVE.some(rs => { let c = false; for (const r of rs) if (inside(p, r)) c = !c; return c });
  let k = 0;
  for (const rs of DRIVE) for (const r of rs) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .05) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const left = onRoad([mid[0] - uy * .4, mid[1] + ux * .4]), right = onRoad([mid[0] + uy * .4, mid[1] - ux * .4]);
    if (left === right) continue;   // an edge inside the drivable area (a path meeting a road): no kerb
    const s = left ? 1 : -1, nx = -uy * s, ny = ux * s;   // toward the road
    const edge = [a, b].every(p => Math.abs(p[0]) > H - .8) || [a, b].every(p => Math.abs(p[1]) > H - .8);
    for (let d = 0; d < L - .01; d += 1.6, k++) {
      const e = Math.min(L, d + 1.6), W = edge ? .55 : .36;
      const q = [[a[0] + ux * d, a[1] + uy * d], [a[0] + ux * e, a[1] + uy * e]];
      const quad = [q[0], q[1], [q[1][0] + nx * W, q[1][1] + ny * W], [q[0][0] + nx * W, q[0][1] + ny * W]];
      const col = k % 2 ? '#fffcf3' : edge ? '#263c35' : '#c8513a', cx = (q[0][0] + q[1][0]) / 2, cy = (q[0][1] + q[1][1]) / 2;
      KERBS.push({ cx, cy, quad, col });
    }
  }
}
function kerbParts(me) {
  if (!KERBS) buildKerbs();
  const out = [];
  for (const kb of KERBS) {
    if (Math.abs(kb.cx - me.x) > 70 || Math.abs(kb.cy - me.y) > 70) continue;
    const far = kb.quad.slice().sort((a, b) => depthOf([...a, 0]) - depthOf([...b, 0]))[0];   // flat: sort by its farthest corner
    out.push({ fp: rect(far[0], far[1], .05, .05), h: .05, draw: () => shape(atZ(kb.quad, .045), kb.col, 0) });
  }
  return out;
}
// Gion Bowling: a puff of dust where someone was knocked over
function popPart(x, y, f) {
  const r = .6 + f * 1.8, o = (1 - f).toFixed(2);
  return { fp: rect(x, y, .3, .3), h: 1.5, draw: () => `<g opacity="${o}">` + shape(atZ(polygon(x, y, r, 14), .08), '#f2c94c', 0) + shape(atZ(polygon(x, y, r * .55, 10, f * 3), .9 + f), '#fffcf3', 0) + '</g>' };
}
// the people knocked over this round stay down: hide them from the street simulation (this also keeps them out of NEAR)
function hideHit() {
  if (!TRAFFIC || TRAFFIC.__gt) return;
  const to = TRAFFIC.to.bind(TRAFFIC);
  TRAFFIC.to = t => { const all = to(t), h = self.HIT; return h && h.size ? all.filter(a => !h.has(a.kind + a.id)) : all };
  TRAFFIC.__gt = true;
}
// cutaway: in the close cameras, leave out the trees over the taxi and between it and the camera, so canal elms and
// campus maples never hide it. The engine finds a tree's crown by its index in TREES, so every slot stays: a hidden
// tree's slot holds a copy parked far off the plot, which the engine culls.
let ALL_TREES = null, GHOSTS = null;
// the ground direction from the taxi toward the camera (the page sends the camera's yaw); the heading if it doesn't
function towardCamera(me) {
  if (!me || !me.cut) return [0, 0];
  if (me.cy != null) { const a = me.cy * Math.PI / 180; return [Math.cos(a), Math.sin(a)] }
  return [-Math.cos(me.h), -Math.sin(me.h)];
}
// x-ray: in the close cameras a building standing between the camera and the taxi is drawn see-through, so the taxi
// shows behind it (the engine keeps buildings in the models array, filled once; each slot gets an x-ray twin)
let ALL_MODELS = null, XRAY = null;
function xrayModels(me) {
  if (typeof models === 'undefined' || !Array.isArray(models) || !models.length) return;
  if (!ALL_MODELS) { ALL_MODELS = models.slice(); XRAY = ALL_MODELS.map(m => ({ ...m, draw: () => '<g opacity=".3">' + m.draw() + '</g>' })) }
  const cut = me && me.cut, [bx, by] = towardCamera(me), reach = cut ? 1 / Math.tan((me.cp || 42) * Math.PI / 180) : 0;
  for (let i = 0; i < ALL_MODELS.length; i++) {
    const m = ALL_MODELS[i];
    let hit = false;
    if (cut && m.fp) {
      // the stretch of ground a building of this height can cover in front of the taxi, sampled every 1.5 m
      const L = Math.min(40, (m.h || 10) * reach + 2);
      for (let s = 1; s <= L && !hit; s += 1.5) for (const o of [-1.4, 0, 1.4]) {
        if (inside([me.x + bx * s - by * o, me.y + by * s + bx * o], m.fp)) { hit = true; break }
      }
    }
    models[i] = hit ? XRAY[i] : m;
  }
}
function cutawayTrees(me) {
  if (typeof TREES === 'undefined' || !Array.isArray(TREES)) return;
  if (!ALL_TREES) { ALL_TREES = TREES.slice(); GHOSTS = ALL_TREES.map(tr => ({ ...tr, x: 1e6, y: 1e6 })) }
  const cut = me && me.cut, [bx, by] = towardCamera(me);
  for (let i = 0; i < ALL_TREES.length; i++) {
    const tr = ALL_TREES[i];
    let near = false;
    if (cut) { const r = (tr.ext || 3) + 2.5; for (let s = 0; s <= 14 && !near; s += 3.5) near = Math.hypot(tr.x - (me.x + bx * s), tr.y - (me.y + by * s)) < r + s * .15 }
    TREES[i] = near ? GHOSTS[i] : tr;
  }
}
CITY_EXTRA = function (t) {
  const out = GION_EXTRA ? [].concat(GION_EXTRA(t) || []) : [];
  const me = self.PLAYER;
  self.NEAR = null;
  self.HIT = me && me.hit ? new Set(me.hit) : null;
  hideHit(); cutawayTrees(me); xrayModels(me);
  if (!me) return out;
  out.push(...kerbParts(me));
  if (me.pops) for (const [x, y, f] of me.pops) out.push(popPart(x, y, f));
  if (!PLAYER_MESH) PLAYER_MESH = makeCar('sedan', { plate: VEH.plate || '#f2f2ee', sign: '#faeaa2' });
  const car = carDraw({ p: [me.x, me.y], d: [Math.cos(me.h), Math.sin(me.h)], mesh: PLAYER_MESH, m: soft('#c8513a'), v: Math.abs(me.v) });
  out.push({ fp: car.fp, h: car.z1, svg: car.svg });
  if (me.tx != null) out.push(...fareMarker(me.tx, me.ty, me.mode, t));
  if (me.px != null) out.push(...pingMarker(me.px, me.py, me.pc || '#4f6d8a', t));
  self.NEAR = TRAFFIC.to(t).filter(a => Math.hypot(a.p[0] - me.x, a.p[1] - me.y) < 14 && a.alpha > .5)
    .map(a => ({ k: a.kind, id: a.id, x: a.p[0], y: a.p[1], dx: a.d[0], dy: a.d[1], L: a.shape[0], W: a.shape[1] }));
  return out;
};
