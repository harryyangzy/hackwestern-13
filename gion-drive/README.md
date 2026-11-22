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
| 2 | wheel + doors + wipers · pedals + shooter |
| 3 | wheel · pedals · shooter + doors + wipers |
| 4 | wheel · pedals · shooter · doors & camera + wipers |

- **Wheel:** drag the rim round to steer. Let go and it straightens.
- **Pedals:** a touch is a full pedal; slide your thumb up to ease off. The **D / R** switch above the gas picks the
  direction: in R the gas pedal backs up. The brake pedal only ever brakes. (On the keyboard, holding ↓ still brakes, then reverses.)
- **Shooter:** little ASCII cats, butterflies, daisies, stars, hearts and shapes fly at the taxi. Tilt the phone to move the
  crosshair on the laptop (tap **Tilt to aim**, point at the middle of the screen, tap **Centre**), tap to shoot. Without
  tilt, drag on the panel to aim. More arrive, and they move more, with every fare delivered (5 levels).
- **Wipers:** whatever the shooter misses sticks to the windshield. Swipe across the glass on your phone to sweep it off
  (hearts take two passes). The taxi and the road ahead are always left clear.
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
- Plain `http` is enough for every role except the shooter's tilt aiming: browsers only give motion sensors to https
  pages. The server also listens on https port 8490 with a self-signed certificate (made with `openssl` on first run,
  kept in `gion-drive/.cert`). **Tilt to aim** moves the shooter's phone there and keeps its seat; accept the certificate
  warning once. With `--tunnel` the address is already https. Drag-to-aim works everywhere.

## Wrong Turn: one of you is the imposter (Solana devnet wagers)

A deception mode for 3–4 phones. Tick **Wrong Turn** in the crew lobby before **Start shift**.

1. **Secret roles.** The server picks one player at random to be the imposter and tells only that phone
   (press and hold to read it, so neighbours can't see). The laptop doesn't know until the reveal.
2. **Wagers.** Everyone deposits the same stake (0.01 devnet SOL by default) and picks a wager of 10–100 % of it. The phone
   commits a salted hash; the amount and salt stay on the phone until after the trip.
3. **The trip.** The crew must earn ¥3,000. The imposter plays their normal role and has 3 press-and-hold sabotages,
   12 s apart, that look like bad luck: *drift* (wheel pulls; steering or shooter), *stall* (engine cuts out; pedals),
   *jam* (door sticks; doors or wipers).
   Limits keep it to timing, not brute force: brakes fade when held away from a lantern, and doors open on their own.
4. **Vote.** After the shift, everyone votes on their phone (25 s). The crew wins if the trip made ¥3,000 **or** a strict
   majority named the imposter. Otherwise the imposter wins.
5. **Reveal and payout.** Phones reveal their wagers on-chain, the program pays out, and the laptop flips everyone's card.

Payout: you always get back what you didn't wager; winners split the losers' wagers in proportion to their own; a player
who doesn't reveal forfeits their whole stake to the winners; a cancelled trip refunds every stake. Details, the trust model
and the program: `solana/README.md`.

Setup (once): `npm install` in `gion-drive/` (adds `@solana/web3.js` for the server only). The server wallet lives in
`solana/.keys/server.json`, which is git-ignored: on a fresh clone the server makes a new one on first start and prints
its address. Paste that address into https://faucet.solana.com (Devnet) and ask for SOL; about 0.05 covers a 4-player game.
You don't need anyone else's key: the deployed program accepts any wallet as a game's authority. Each game uses about 0.00002 SOL in fees; the stakes
come back to the server wallet afterwards. `WT_STAKE=0.001 node gion-drive/server.js` sets a different stake.
Plain crew play still needs no install. Keys never leave the server: each player gets a devnet burner wallet the server holds.

## Building

`gion-taxi.html` is generated. Edit `drive.js`, `drive.css`, `mp.js`, `mp.css`, `wt.js`, `wt.css`, `qr.js` or `player.js`, then run:

```bash
python3 gion-drive/build.py
```

`python3 gion-drive/build.py --city london` builds one city. It uses the Pocket City skill at `~/Downloads/pocket-city` (or `--skill PATH`) when it's installed. Otherwise it rebuilds
from the existing `gion-taxi.html`, swapping in the current files between its `<gion-taxi …>` markers.
`pad.html`, `wt-pad.js`, `server.js`, `wt-server.js` and `chain.js` are served or run as they are and aren't built.

Credits: the city drawing engine and street simulation are Pocket City by April Zhu (MIT). Map data © OpenStreetMap contributors.
