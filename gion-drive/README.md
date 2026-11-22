# Gion Taxi

Drive a taxi through the lanes of Gion Shirakawa, Kyoto. Pick up at the orange lantern, drop off at the gold one,
and do as many fares as you can before the 90-second shift ends. Play solo on the keyboard, or as a crew of 2–4
phones sharing one taxi.

## Solo

Open `gion-taxi.html` in a browser (it works offline, no server needed) and press **Start driving**.
Arrows/WASD drive, `C` switches camera, `Esc` ends the shift.

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
- **Pedals:** hold gas or brake; slide your thumb down to press harder. Keep holding brake to reverse.
- **Navigator:** a heading-up map with the route to the lantern. Call turns, or tap the map to drop a marker in the laptop's scene.
- **Doors & camera:** when the taxi stops at a lantern, the passenger waits until you open the door. You also switch the laptop's camera.

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

## Wrong Turn: one of you is the imposter (Solana devnet wagers)

A deception mode for 3–4 phones. Tick **Wrong Turn** in the crew lobby before **Start shift**.

1. **Secret roles.** The server picks one player at random to be the imposter and tells only that phone
   (press and hold to read it, so neighbours can't see). The laptop doesn't know until the reveal.
2. **Wagers.** Everyone deposits the same stake (0.01 devnet SOL by default) and picks a wager of 10–100 % of it. The phone
   commits a salted hash; the amount and salt stay on the phone until after the trip.
3. **The trip.** The crew must earn ¥3,000. Only the navigator's phone shows where the passenger is (the laptop's minimap
   and arrow are hidden). The imposter plays their normal role and has 3 press-and-hold sabotages, 12 s apart, that look
   like bad luck: *drift* (wheel pulls), *stall* (engine cuts out), *decoy* (a fake navigator marker), *jam* (door sticks).
   Limits keep it to timing, not brute force: brakes fade when held away from a lantern, and doors open on their own.
4. **Vote.** After the shift, everyone votes on their phone (25 s). The crew wins if the trip made ¥3,000 **or** a strict
   majority named the imposter. Otherwise the imposter wins.
5. **Reveal and payout.** Phones reveal their wagers on-chain, the program pays out, and the laptop flips everyone's card.

Payout: you always get back what you didn't wager; winners split the losers' wagers in proportion to their own; a player
who doesn't reveal forfeits their whole stake to the winners; a cancelled trip refunds every stake. Details, the trust model
and the program: `solana/README.md`.

Setup (once): `npm install` in `gion-drive/` (adds `@solana/web3.js` for the server only), and the server wallet in
`solana/.keys/server.json` needs devnet SOL (https://faucet.solana.com). Each game uses about 0.00002 SOL in fees; the stakes
come back to the server wallet afterwards. `WT_STAKE=0.001 node gion-drive/server.js` sets a different stake.
Plain crew play still needs no install. Keys never leave the server: each player gets a devnet burner wallet the server holds.

## Building

`gion-taxi.html` is generated. Edit `drive.js`, `drive.css`, `mp.js`, `mp.css`, `wt.js`, `wt.css`, `qr.js` or `player.js`, then run:

```bash
python3 gion-drive/build.py
```

It uses the Pocket City skill at `~/Downloads/pocket-city` (or `--skill PATH`) when it's installed. Otherwise it rebuilds
from the existing `gion-taxi.html`, swapping in the current files between its `<gion-taxi …>` markers.
`pad.html`, `wt-pad.js`, `server.js`, `wt-server.js` and `chain.js` are served or run as they are and aren't built.

Credits: the city drawing engine and street simulation are Pocket City by April Zhu (MIT). Map data © OpenStreetMap contributors.
