# Gion Taxi (and London, Toronto, Amsterdam)

Four cities, one game: `gion-taxi.html` (Gion Shirakawa, Kyoto), `taxi-london.html` (Western University's main campus
in London, Ontario, from University College to Middlesex College across UC Hill: the campus paths are drivable), `taxi-toronto.html` (Nathan Phillips
Square and City Hall) and `taxi-amsterdam.html` (where the Reguliersgracht crosses the Keizersgracht). Switch cities
from the menu; with the server running they're also at `/gion`, `/london`, `/toronto`, `/amsterdam`, and a crew keeps
its room when the host switches city.

Drive a taxi through the lanes of Gion Shirakawa, Kyoto. Pick up at the orange lantern, drop off at the gold one,
and do as many fares as you can before the 90-second shift ends. Play solo on the keyboard, or as a crew of 2–4
phones sharing one taxi.

## Solo

Open `gion-taxi.html` in a browser (it works offline, no server needed) and press **Start driving**.
Arrows/WASD drive (hold ↓ to brake, then reverse), `C` cycles the camera (kart → chase → overhead), `Esc` ends the shift.
The red and cream kerbs mark the road; dark and cream ones mark the edge of the map.

**Gion Bowling** (bonus mode, from the menu or the crew lobby): 60 seconds to knock over as many pedestrians as you can.
Each person counts once; hits in quick succession multiply (up to ×5); cars still cost time.

## Crew: phones as controllers

```bash
node gion-drive/server.js
```

Node 18 or newer, no `npm install`. Then:

1. On the laptop, open **http://localhost:8090** and press **Play with phones**.
2. Each phone scans the QR code (or opens the address under it and types the room code).
3. Turn the phones sideways. Everyone taps **Ready**, then the laptop presses **Start shift**.

| Phones | Roles |
|---|---|
| 1 | wheel + pedals + doors |
| 2 | wheel + doors · pedals + navigator |
| 3 | wheel · pedals · navigator + doors |
| 4 | wheel · pedals · navigator · doors & camera |

- **Wheel:** drag the rim round to steer. Let go and it straightens.
- **Pedals:** a touch is a full pedal; slide your thumb up to ease off. The **D / R** switch above the gas picks the
  direction: in R the gas pedal backs up. The brake pedal only ever brakes. (On the keyboard, holding ↓ still brakes, then reverses.)
- **Navigator:** a heading-up map with the route to the lantern. Call turns, or tap the map to drop a marker in the laptop's scene.
- **Doors & camera:** when the taxi stops at a lantern, the passenger waits until you open the door. You also switch the laptop's camera (kart, chase, overhead).

**Full screen on phones:** Android goes full screen on the first tap. iPhone Safari can't go full screen from a web page,
so the controller asks for one swipe up, which makes Safari hide its bars in landscape.

The host can swap roles (⇅) or remove a phone (×) in the lobby. After a shift, **Start next shift** keeps the same room and crew.
The keyboard keeps working during a crew shift. `E` opens the door.

### If phones can't connect (campus Wi-Fi)

```bash
node gion-drive/server.js --tunnel
```

`--tunnel` opens a public https address through localhost.run (it uses the Mac's built-in `ssh`: nothing to install,
no account). The QR code switches to that address, so phones can join from **any network, even mobile data**.
Notes: the address is random and changes on each start. Anyone with the address and the room code could join while
it runs. Traffic goes through localhost.run's servers, which adds some delay. To use your own tunnel instead
(ngrok, cloudflared): `PUBLIC_URL=https://your-tunnel node gion-drive/server.js`.

Without a tunnel:

- Phones and laptop must be on the **same network**. Campus and hackathon Wi-Fi often stop devices from reaching each
  other (client isolation). Fix: turn on one phone's **Personal Hotspot**, then join it with the laptop and the other phones.
  The QR code follows the laptop's current network, so it updates by itself. If the laptop has several networks, use **Other network ›** under the code.
- To force the address in the QR code: `HOST_IP=192.168.1.20 node gion-drive/server.js`. Use another port with `PORT=8091`.
- Plain `http` is enough, so there's no certificate warning. The controllers use touch only, not motion sensors.

## Building

`gion-taxi.html` is generated. Edit `drive.js`, `drive.css`, `mp.js`, `mp.css`, `qr.js` or `player.js`, then run:

```bash
python3 gion-drive/build.py
```

`python3 gion-drive/build.py --city london` builds one city. It uses the Pocket City skill at `~/Downloads/pocket-city` (or `--skill PATH`) when it's installed. Otherwise it rebuilds
from the existing `gion-taxi.html`, swapping in the current files between its `<gion-taxi …>` markers.
`pad.html` and `server.js` are served as they are and aren't built.

Credits: the city drawing engine and street simulation are Pocket City by April Zhu (MIT). Map data © OpenStreetMap contributors.
