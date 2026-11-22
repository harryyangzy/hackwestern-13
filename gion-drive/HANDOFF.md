# Gion Taxi: handoff for the next development session

Last updated 2026-11-21, after adding crew (QR-code multiplayer) play on branch `gion-multiplayer`. Covers only
`gion-drive/`. The repo-level [`../HANDOFF.md`](../HANDOFF.md) is the team status doc for every project.
Player-facing instructions: [`README.md`](README.md).

**Rules for future work:** keep the Pocket City visuals and the HUD styling. The driving was retuned after playtesting
(2026-11-21, see §5): quicker reverse, tighter turning, sliding along walls, a low kart camera, 60 fps while driving. Make changes in the source
files and rebuild (§4); never hand-edit only `gion-taxi.html`.

---

## 0. Cities (added 2026-11-21)

| City | Page | Plot | Scene files |
|---|---|---|---|
| Gion, Kyoto | `gion-taxi.html` | the skill's Gion example | `~/Downloads/pocket-city/assets/examples/gion/` |
| London, Ontario | `taxi-london.html` | 320 m: University College (west) to Middlesex College (east) across UC Hill, Western main campus | `cities/london/work/` |
| Toronto | `taxi-toronto.html` | 200 m: City Hall whole, the square, half the pool (a bigger plot cuts Old City Hall or Osgoode Hall) | `cities/toronto/work/` |
| Amsterdam | `taxi-amsterdam.html` | 200 m at Reguliersgracht × Keizersgracht | `cities/amsterdam/work/` |

Each new city was made with the skill's pipeline (`fetch_osm.py` → `plot.py` → `prep.py`, then a hand-written
`city.json` with sourced season and occasion notes and `landmarks.js`): London has a hand-built University College
with the Middlesex Memorial Tower and Middlesex College with its clock tower and copper spire (the tower's place on
the building is interpreted: drawn over the round bay at its south end; the Thames, outside the plot, was dropped from
London's osm.json because the skill's boat placer fails when wide water lies just outside the square); Toronto has City Hall's podium, both curved towers (heights from OSM) and the saucer
council chamber; Amsterdam has no landmark inside the plot. `osm.json` and the skill's test pages are git-ignored;
re-fetch with `fetch_osm.py` (coordinates in each `plot.json`). Python needs `shapely` for plot/prep.

`build.py` holds the per-city settings (`CITIES`): brand ("London Taxi"), bowling-mode name, the menu blurb and
`drivePaths` (London: Western's campus is nearly all footpaths, so the paths are drivable; kerbs, the minimap, fare
spots and navigator routes all follow). They reach the page as `window.GT_CITY` and the worker as `GT_CITY`.
The road grid (connectivity + navigator routes) now lives in `drive.js` (`GionTaxi.route`); fare spots are limited to
the network connected to the start, so every fare is reachable (tested: 16/16 fare stages routable in every city).
In every camera the worker hides trees over the taxi and between it and the camera, and draws buildings in front of it
see-through (x-ray), so canal elms and tall buildings never hide the taxi.

## 1. What it is

A browser driving game on Pocket City's illustrated isometric diorama of a 200 m × 200 m patch of Gion Shirakawa,
Kyoto (real OpenStreetMap streets). One taxi, a 90 s shift, pick up at the orange lantern, drop off at the gold one.
Each fare pays yen and adds time; bumping people, bikes or cars costs yen and 3 s.

- **Solo:** keyboard (or the on-screen touch pad), opened straight from `file://`. Unchanged from the original.
- **Crew:** `node server.js`; the laptop shows a QR code and 1–4 phones each control part of the same taxi.

## 2. Architecture

```
             ┌──────────────── laptop browser: gion-taxi.html (the authority) ────────────────┐
 keyboard ──►│ drive.js  keys ┐                                                               │
             │                ├─ readInput() → step() physics → fares/bumps → window.PLAYER ──┼─► render workers (player.js
 phones ────►│ mp.js remote ──┘   (window.GionTaxi API, events)                               │   draws taxi, lantern, ping)
 (via ws)    │ mp.js: lobby, roles, ready, countdown, results, input checks, routes, 10 Hz state│
             └─────────────────────────────▲──────────────────────────────────────────────────┘
                                           │ WebSocket /ws (JSON)
                          server.js: rooms, ≤4 phones, seat ids, relay, static files
                                           │
                    phones: pad.html (wheel · pedals+speedometer · map+calls · meter+door+camera)
```

- **The laptop holds all the state:** physics, fares, roles and ready flags live in the laptop page. The server
  only relays messages; phones only send intents.
- **Stack:** vanilla JS, no framework, no npm. Node 18+ standard library for the server. Python 3 for the build.
  Rendering is Pocket City's Canvas-2D painter in Web Workers (not WebGL).

## 3. Files

| File | Built in? | What it does |
|---|---|---|
| `gion-taxi.html` | output | The game. Pocket City base + the game region between `<!-- <gion-taxi game> -->` markers, plus `player.js` between `/* <gion-taxi player.js> */` markers inside the `#landmarks` block |
| `build.py` | — | Builds from the skill (`--skill`) or, if the skill is missing, from the existing HTML (`--from-built`). Applies `PATCHES`: the worker wiring, plus the branding cleanup |
| `drive.js` | yes | Taxi physics, fares, bumps, HUD, minimap, keyboard. **Exposes `window.GionTaxi`** (see below) |
| `drive.css` | yes | Solo HUD/menu styles (unchanged) |
| `player.js` | yes (worker) | Draws the taxi, the fare marker and (new) the navigator's ping `pingMarker()`; returns `self.NEAR` traffic |
| `qr.js` | yes | Self-contained QR encoder (byte mode, ECC M, versions 1–6) → `GTQR.svg(text)` |
| `mp.js` | yes | Crew play on the laptop: lobby UI, socket, roles, input merge, navigator routes, events → phones. Exposes `window.GionCrew` |
| `mp.css` | yes | Lobby, countdown, navigator callout, crew strip. Uses the same `:root` tokens and `.gt-card` |
| `pad.html` | served | The phone controller (all four instruments; lays them out for the phone's roles) |
| `server.js` | runs | Zero-dependency HTTP + WebSocket server: `/` game, `/join` controller, `/info` LAN addresses, `/ws` |
| `README.md` | — | How to play and run it, and the hotspot tip |

### `window.GionTaxi` (drive.js)
`start, stop, keys, remote{gas,brake,turn}, toggleCam(), openDoor(), toast(), scene, onRoad, fits, lockMenu,
car, driving, chase, doorNeeded (get/set), on(event, fn), setPing(x, y, color, ms), state()`.
Events: `start`, `stop` (summary), `bump` {kind, cost}, `scrape`, `pickup`, `dropoff` {pay, bonus}, `atdoor` (mode), `door`, `cam` (chase).
`state()` returns the clock, yen and fares; the car's x, y, h and v; the fare mode and target (tx, ty); the door
state (atDoor, doorNeeded); the fare estimate (fareEst); and the shift summary (bumps, penalties, average and
fastest fare).

## 4. Run, build, test

```bash
open gion-drive/gion-taxi.html          # solo, offline
node gion-drive/server.js               # crew: then http://localhost:8090 → Play with phones
python3 gion-drive/build.py             # after editing any built-in file
```
- `PORT=…` and `HOST_IP=…` override the port and the address in the QR code.
- **The Pocket City skill isn't on this Mac** (`~/Downloads/pocket-city` is missing). `build.py` falls back to
  rebuilding from `gion-taxi.html`, which keeps the base scene byte-for-byte and swaps the marked regions. Running
  it twice gives the same file. With the skill back, `python3 build.py --skill PATH` does a full rebuild with the
  same patches.
- **No test suite is committed.** The tests used for this work were throwaway scripts: raw WebSocket protocol
  checks, plus headless Chrome driven over the DevTools protocol with one laptop page and four phone pages
  emulated at 844×390 with touch. What they covered is in §9. If you add tests, `window.GionCrew` and
  `window.GionPad` (on `pad.html`) are there for inspection.

## 5. Controls and how they move the taxi

**Keyboard (unchanged):** `↑/W` gas, `↓/S` brake → reverse, `←/A` `→/D` steer, `C` camera, `Esc` end shift,
`Enter` start. New: `E` opens the door; it only matters in crew play when a phone holds the doors role.

**One input interface:** `readInput()` merges the keyboard with the phones:
`gas = max(key, remote.gas)`, `brake = max(key, remote.brake)`, `turn = clamp(keyTurn + remote.turn, −1, 1)`, where +1 means left.

**Physics (`step(dt)` + `move(dt)`), retuned after playtesting:** `MAX 11` m/s, `REV 5.5`, `WHEELBASE 2.7`;
acceleration 6.2, braking 16, reverse 7, drag 2.2; steering .66/(1+|v|·.055) (≈3.5 m turning radius at walking
pace), easing ×11. Analog pedals blend with coasting: `dv = p·pedalTerm + (1−p)·coast`.
`move()` replaces the old bounce (`v *= −0.3`): if the next pose doesn't fit, it tries directions turned ±0.18…0.9
rad (the steering side first) and slides along the wall, turning the body toward the wall's line at ≤1.6 rad/s and
losing the speed that went into the wall. Head-on it stops (no bounce) and, if you keep steering, pivots slowly
(1.1 rad/s). A taxi already clipping a kerb may make any move that doesn't clip more and keeps its centre on the road,
so it can never get stuck. Bumps slow the taxi (`v *= .3`) instead of flinging it backwards.

**Cameras (`CAMS` in drive.js):** `kart` (default: pitch 36°, close, the taxi pushed to the lower third by moving
the view centre up the road), `chase` (the original), `top` (overhead). `C` or the operator's phone cycles them.
The renderer is orthographic, so there is no perspective horizon; the kart camera is the closest it gets.
`build.py` patches the page's frame cap to 60 fps while `window.PLAYER` is set (30 on phones); a frame takes ~10 ms.

**Kerbs (`player.js`):** red/cream stripes along every road edge (dark/cream at the plot edge), 1.6 m pieces built
once from `SCENE.roads`, drawn within 70 m of the taxi and sorted by their farthest corner like the fare ring.

**Gion Bowling (`mode === 'bowling'`):** 60 s, no fares; each pedestrian or cyclist scores once (100 / 150 × combo up
to ×5 within 2.2 s); cars still cost 3 s. Hit agents (`kind+id`) travel in `PLAYER.hit`, and `player.js` filters them
out of `TRAFFIC.to()` so they disappear (and leave `NEAR`); `PLAYER.pops` draws dust puffs. Separate best score
(`gionBowlBest`). The crew lobby has a Taxi shift / Gion Bowling switch.

**Phone controls (`pad.html`)**
- **Wheel:** a rotational drag on the rim, ±100° = full lock. When released it springs back (exponential, rate 9/s).
  Turning clockwise on screen = right = negative `turn`.
- **Pedals:** a touch is a full pedal (1); sliding up eases off to 0.3. Release = 0. A **D / R** gear switch sits
  above the gas: `remote.gear`, sent with each `in` message. In `readInput()` the phone's gas becomes `gas` (D) or
  `back` (R, brakes then reverses), and the phone's brake is `stopper`: it brakes to a stop and never reverses. The
  keyboard's ↓ keeps the arcade brake-then-reverse. The gear resets to D between shifts.
- **No zoom, full screen:** `touch-action` off on the controls, multi-touch `touchstart` and `dblclick` prevented
  (iOS ignores `user-scalable=no`). Android: Fullscreen API + landscape lock on the first tap. iPhone: the page is
  made scrollable and a "Swipe up for full screen" overlay asks for one swipe, which makes Safari hide its bars in
  landscape (`checkBars()` shows it again if they return). Not yet tried on a real iPhone.
- **Sending:** about 30 Hz while values change, plus a 150 ms heartbeat while a control is held. The laptop drops a
  phone's input after 700 ms without one (`STALE_MS`).

## 6. Game state, missions, lifecycle

**Solo:** unchanged. Menu → `start()` → `frame()` loop → `stop(true)` on the clock or `Esc` → menu with the result
and best score (`localStorage.gionTaxiBest`).

**Crew** (`mp.js` `phase`): `off → lobby → count (3-2-1) → driving → results → (everyone ready) → count → …`
- **Lobby:** a QR code of `http://<LAN-IP>:<port>/join?r=ROOM` (never localhost; the address list from `/info`
  refreshes every 5 s), the room code as text, four seats (colour, name, roles, ready or reconnecting), ⇅ to swap
  roles, × to kick, and **Start shift** (enabled only when every phone is connected and ready).
- **Roles by crew size:** `ROLE_SETS` in `mp.js` (1: steer+pedals+ops, 2: steer+ops / pedals+nav,
  3: steer / pedals / nav+ops, 4: one each). Roles follow seat order and are recomputed when the crew changes.
- **Doors:** `GionTaxi.doorNeeded` is true while a connected phone holds `ops`. At a lantern (within 3.2 m and
  below 2.5 m/s) the fare then waits (`fare.atDoor`) until `openDoor()`, which opens a 1.2 s window. With no
  operator connected it's automatic, as in solo.
- **Navigator:** `route()` runs a BFS over 2 m road cells (each cell checks the car's width at 5 points), then
  tightens the path with line-of-sight checks. It's sent about every 400 ms with its length. Calls appear on the
  laptop (`#gt-call`) and on the other phones; a map tap → `setPing` → a lantern in the scene (player.js) plus a
  pulse on the minimap.
- **Results:** fares, yen, bumps, penalty yen and time, average and fastest ride, best score, and a 0–3★ rating
  (thresholds ¥3k, ¥8k and ¥15k). Ready flags reset. **Start next shift** keeps the room and the phones.
- **Never carried over:** `start()` and `stop()` clear the keyboard and `remote`, and `mp.js` zeroes every phone's
  input at start, at stop and whenever roles change. Phones release their controls on any screen change, when
  backgrounded, and on disconnect.

## 7. UI, styling, rendering, camera

- The visual system is unchanged: Pocket City's `:root` tokens (`--ink #263c35`, `--paper`, `--panel`,
  `--rust #ac4931`, `--green #36594b`, `--serif` Iowan/Palatino) and the cream `.gt-card` panels. `mp.css` and
  `pad.html` use only these, plus gold `#c9932c` and seat colours (taxi red, green, gold, slate blue).
- Branding: the visible title, wordmark and description say **Gion Taxi**. The MIT credit is kept in the field
  notes ("City drawing engine by April Zhu (MIT licence)") and in a licence comment at the top of the HTML.
- The renderer and camera are untouched (chase and overhead, `C` or the operator's phone). The only renderer
  addition is the ping marker in `player.js`.

## 8. Networking (`server.js`)

- Messages: `host` {room?, key?} → `room` {room, key, ips, port}. Phone `join` {room, pid} → `joined`, or
  `err` with code `room`/`full`/`bad`/`kicked`/`closed`/`replaced`. Laptop gets `peer` {pid, on}; phone
  messages are relayed to it as `from` {pid, m}; `to` {to: pid|'*', m}, `drop` and `close` go the other way.
  `hb` is a heartbeat.
- Phone message types (checked by `mp.js`, each gated on role and phase): `hello`, `ready`, `in`, `door`, `cam`,
  `call`, `ping`. Laptop → phones: `lobby`, `map`, `s` (10 Hz state), `route`, `count`, `ev`.
- **Reliability:** each phone has a random id in `localStorage`, so a reload or reconnect gets its seat back. The
  laptop keeps a dropped phone's seat for 20 s (`GRACE_MS`) and then shares roles out again. A laptop reload takes
  back its room with the key in `sessionStorage` (the server keeps an empty room for 120 s). Silent sockets close
  after 15 s. Messages are capped at 4 KB from phones and 256 KB from the laptop (the map is about 20 KB). A
  socket can't change role, and a phone can't spoof another id.
- **HTTP only:** the controllers use touch, not motion sensors, so no certificate is needed (unlike Laptop Shooter).
- **Public tunnel:** `node server.js --tunnel` runs `ssh -R 80:localhost:PORT nokey@localhost.run`, reads the
  `https://….lhr.life` address it prints, and reconnects if it drops. `PUBLIC_URL=…` sets the address by hand.
  `/info` and the `room` message carry `publicUrl`; `mp.js` `joinURL()` prefers it over LAN addresses, and the
  phones then use `wss://`. Checked with a placeholder `PUBLIC_URL` (the QR decodes to it). **The real
  localhost.run tunnel hasn't been run yet.**
- **Wi-Fi:** campus networks often isolate clients. Use a phone's Personal Hotspot (in the README and the lobby).

## 9. Status

**Verified automatically (2026-11-21, headless Chrome 158 and raw WebSocket clients)**
- **Server protocol, 30/30 checks:** rooms, bad or unknown codes, the 5th phone refused, relay targeting, no role
  switching or id spoofing, phone reconnect, laptop reconnect (and a wrong key refused), kick, close.
- **QR codes:** CoreImage (macOS) decodes the encoder's output for versions 1–6, and decodes a screenshot of the
  lobby's QR to the exact join URL, which is reachable on the LAN address.
- **Keyboard physics:** old `step()` vs new over 200 random runs × 600 frames, including the kerb branches: the
  largest difference is exactly 0. In the browser the solo game plays the same as the original build (same speed
  curve, HUD, camera toggle and results, no errors).
- **Crew end-to-end, 74/74 checks:** all four role sets; ready gating; countdown; the wheel steers, gas and brake
  act on the taxi, and wheel and pedals from two phones combine; keyboard fallback mid-shift; the navigator's
  route stays on the road and ends at the lantern; calls and pings reach the laptop; camera switch; door-gated
  pickup and drop-off with pay and time bonus; bump −¥600/−3 s; a dropped phone releases its pedal within a
  second, keeps its seat and rejoins; no operator → automatic doors; results on the laptop and every phone;
  replay without reconnecting, with no carried-over input; kick → roles shared out for 3, 2 and 1 phones;
  swapping roles; the bad-code message; the portrait prompt; no page errors in any tab.

**Not verified on real devices yet**
- Real phones: iOS Safari and Android Chrome touch feel, wheel ergonomics, safe areas and notches, the address
  bar in landscape, haptics (Android only), Android fullscreen and orientation lock.
- Real network latency and campus Wi-Fi vs hotspot. Performance of the laptop with 4 phones over several shifts.

**Known limitations**
- One shared screen, one taxi (cooperative by design). There's no split screen.
- iOS can't lock orientation or keep the screen awake over plain HTTP (no Wake Lock), so a phone may dim during a long lobby.
- If the server restarts, room codes are lost: the laptop opens a new room and phones have to rescan.
- Traffic still ignores the taxi (Pocket City traffic is scripted), and collision data can lag a rendered frame behind (as before).
- The guide arrow and minimap remain on the laptop, so the navigator helps with the route rather than being the only source of direction.
- A rating's ¥ thresholds are guesses; tune after real play.

## 10. Ideas, not built
- Player names typed on the phone (seats are "Player 1–4" now).
- A navigator-only mode that hides the laptop's guide arrow for a harder co-op challenge.
- A committed test suite: turn the throwaway CDP scripts into `npm test`-free Node scripts under `gion-drive/test/`.
