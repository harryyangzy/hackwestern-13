# Handoff: Harry's work on Hack Western 13

Last updated: 2026-11-21 (late night; everything merged into `main`: crew play via PR #6, Laptop Shooter + GripSense build 2 + Grip Sense Web via PR #4). Repo: https://github.com/harryyangzy/hackwestern-13

This file is the single source of truth on what Harry is working on. It is written so that any Claude Code
session (or teammate) can read it and brief the team. **When you update the team, use only what is in this
file and what you can verify in the repo; don't guess at plans that aren't written here.**

## For Claude Code sessions: how to use this file

- To brief a teammate, summarise the "Status at a glance" table and the "Projects" section that matters to them.
  Keep it short: what exists, where it lives, whether it is on GitHub yet, what's next.
- Before you report anything as "on GitHub" or "merged", check it: `git fetch origin && git branch -a` and
  `gh pr list --state all`.
- When Harry finishes something, update this file in the same commit (status table + the project's section)
  and bump "Last updated".
- Don't add Claude co-author or "Generated with Claude Code" lines to commits or PRs in this repo (Harry's preference).

## Status at a glance

| Project | What it is | Where | On GitHub? |
|---|---|---|---|
| Gion Taxi | Driving game on an isometric map of Gion, Kyoto; solo or a crew of 1–4 phones sharing one taxi | `gion-drive/` | Yes, in `main` (solo PR #1, crew play PR #6) |
| GripSense (iOS) | Estimates grip force from how much the hand damps the phone's vibration | `GripSense/` | Yes, in `main` (build 2, via PR #4) |
| Grip Sense Web | Browser version of GripSense for phones (vibrates on Android only) | `web/index.html` | Yes, in `main` (via PR #4) |
| Laptop Shooter | Phone is the gun, laptop screen is the target | `shooter/` | Yes, in `main` (PR #4, with two-corner calibration) |

> **Branches:** all four projects are in `main`. Laptop Shooter, GripSense build 2 and Grip Sense Web went in
> together through PR #4 (`laptop-shooter`); its GripSense and `web/` files are identical to `vibrate-grip`, so that
> branch has nothing left to merge. Work from `main` (or a new branch off it).

## Projects

### Gion Taxi (`gion-drive/`)
- **Play:** open `gion-drive/gion-taxi.html` in a browser (single file, works offline). Press *Start driving*.
- **Gameplay:** drive a taxi through the real OpenStreetMap streets of Gion Shirakawa. Pick up the passenger at
  the orange lantern, drop them at the gold one. Each fare pays yen and adds time to a 90 s clock; bumping people,
  bikes or traffic costs yen and 3 s. Arrows/WASD to drive, `C` switches camera, `Esc` ends the shift.
  Touch buttons appear on phones. The page's seasons and night scenes still work while driving.
- **How it's built:** on top of April Zhu's *Pocket City* skill (MIT, https://april-zhu.com/pocketcity), using
  its ready-made Gion example. `build.py` runs the skill's build and adds the game:
  `player.js` (draws the taxi and fare markers in the render worker), `drive.js` + `drive.css` (physics, fares,
  collisions, HUD, minimap). Rebuild with `python3 gion-drive/build.py` (expects the skill at
  `~/Downloads/pocket-city`, or pass `--skill PATH`).
- **Tested:** in headless Chrome: driving, steering, pickup, drop-off, payment, season switching, ending a shift;
  no page errors. **Not tested on a real phone yet.**
- **Status:** solo game merged via PR #1, crew play via PR #6; both in `main`.
- **Crew play:** `node gion-drive/server.js` (Node 18+, no install), open
  http://localhost:8090, press *Play with phones*. Phones scan the QR code (plain HTTP, no certificate) and get roles
  by crew size: wheel, pedals, navigator (map with route, turn calls, pings shown on the laptop), and doors & camera
  (passengers wait at the lantern until the door is opened). The lobby has ready-up, a 3-2-1 start, a results card,
  and replay without reconnecting. The laptop runs everything; the keyboard still works. Visible "Pocket City"
  branding was replaced by "Gion Taxi" (MIT credit kept in the field notes). `build.py` now also rebuilds without
  the Pocket City skill (the skill is missing from `~/Downloads/pocket-city` on the Mac this was built on). Details:
  `gion-drive/HANDOFF.md` and `gion-drive/README.md`.
- **Crew play tested:** automatically only (headless Chrome with four emulated phones: 74 end-to-end checks, plus
  30 server protocol checks; the lobby QR decodes to the right LAN URL; keyboard physics bit-identical to before).
  **Not tried on real phones or campus Wi-Fi yet.** Same Wi-Fi caveat as Laptop Shooter: use a phone's hotspot if
  phones can't reach the laptop.

### GripSense iOS app (`GripSense/`)
- **Idea:** the phone vibrates; a tighter grip damps the vibration, so the accelerometer/gyro energy drops.
  Calibrate "light" and "hard" grip, then a meter shows how hard you're squeezing.
- **On GitHub (branch `vibrate-grip`, commit `2a948ad`):** first version: continuous vibration, accel/gyro RMS,
  chart, calibration, grip meter.
- **Build 2 (branch `vibrate-grip`, commit `9a4e322`; also on TestFlight):**
  - A *Sharpness* slider (changes the vibration frequency).
  - A *Pulsed* mode (on by default): the vibration switches on and off at 5 Hz and the app measures only the
    sensor energy that follows that rhythm (lock-in detection), so hand movement doesn't look like grip.
  - A *Signal* readout so you can check vibration is actually detected; build number bumped to 2.
- **TestFlight:** App Store Connect app "GripSense HW13", bundle ID `com.harryyangzy.hw13.gripsense`.
  Build 1 is in external beta review. Build 2 went to an internal group (no review needed).
- **Results so far:** on build 1 (from TestFlight), the graph barely moved when Harry squeezed. Build 2 hasn't
  been checked on a device yet; Harry is testing it.
- **Install by cable doesn't work right now:** Harry's iPhone runs iOS 27.0.1 and this Mac has Xcode 26.4, which
  can't deploy to it. Updating to Xcode 27 (App Store) fixes that and also clears Apple's SDK warning email
  (ITMS-90725). Until then, install through TestFlight.
- **Project file is generated:** after editing `GripSense/project.yml`, run `xcodegen generate` in `GripSense/`.
- **Likely cause of the weak signal:** the iPhone's motion sensors are capped at about 100 Hz. **Proposed next
  step (waiting on Harry's go-ahead):** a ForcePhone-style audio mode that plays an inaudible ~18–20 kHz tone
  from the speaker and listens with the mic. The published version of that approach works on iOS.
- **Next:** check build 2 on the phone and decide on the audio mode.

### Grip Sense Web (`web/index.html`)
- A browser version of GripSense for phones: Start/Stop, sensor choice, live graph and grip meter.
- **Vibration only works on Android** (`navigator.vibrate`). The trick of rapidly toggling an iOS switch
  control to get haptic ticks does **not** work: Harry felt no vibration on his iPhone.
- Served from Harry's Mac through a temporary ngrok URL (the link changes, so don't hand it out as permanent).
- In `main` (via PR #4).

### Laptop Shooter (`shooter/`)
- "Your laptop is the target, your phone is the gun." Run `node shooter/server.js` (Node 18+, no install).
  Laptop opens http://localhost:8080; phones on the same network open the `https://…:8443/gun` URL shown
  (self-signed cert; HTTPS is needed for motion sensors). Tilt to aim, tap to fire, shake to reload. Several
  phones can play at once; mouse works as a fallback. Full instructions in `shooter/README.md`.
- **Gameplay:** 60 s rounds, 8-shot clip, combo multiplier up to x5. Targets are bugs, beach balls, popups and
  stars; shooting the "unsaved_thesis.docx" file costs 50 points.
- **Networking:** campus/hackathon Wi-Fi blocked phone-to-laptop traffic (probably client isolation). Fix:
  connect the laptop to the phone's Personal Hotspot. The server now looks up the laptop's network address on
  every request, so switching networks no longer leaves a stale link. `shooter/README.md` doesn't mention the
  hotspot tip yet.
- **Tested:** the phone-to-laptop relay was tested with a script (join, aim, fire, hit sent back to the phone,
  leave), and both pages load in headless Chrome with no errors. The phone page loads on Harry's phone.
  **Full gameplay on a real phone (gyro aiming, firing) isn't confirmed yet.**
- Harry has a separate private setup & troubleshooting doc for sharing with friends (ask him for it; the link
  isn't kept in the repo).
- **Aim calibration:** each phone aims at the laptop screen's top-left, then bottom-right corner and taps FIRE; the
  screen shows a pulsing marker at the corner being calibrated. This sets the aim range and fixes inverted axes.
  A *Calibrate* button on the phone redoes it; *Recenter* still works.
- In `main` (PR #4). The HTTPS certificate in `shooter/.cert/` is made locally
  and is git-ignored, so a fresh clone generates its own.

## Open items
1. GripSense: check build 2 on the phone; decide whether to build the ultrasonic audio mode; update to Xcode 27.
2. Laptop Shooter: confirm full gameplay on a real phone; add the hotspot tip to `shooter/README.md`.
3. Try Gion Taxi on a phone, and try crew play with real phones.
4. Laptop Shooter: check the corner calibration on a real phone.
