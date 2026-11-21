# Handoff: Harry's work on Hack Western 13

Last updated: 2026-11-21. Repo: https://github.com/harryyangzy/hackwestern-13

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
| Gion Taxi | Driving game on an isometric map of Gion, Kyoto | `gion-drive/` | Yes: merged into `main` (PR #1) |
| GripSense (iOS) | Estimates grip force from how much the hand damps the phone's vibration | `GripSense/` | v1 on branch `vibrate-grip`. Newer changes (pulsed mode) are **local only, uncommitted** |
| Grip Sense Web | Browser version of GripSense for phones | `web/index.html` | **No, local only (untracked)** |
| Laptop Shooter | Phone is the gun, laptop screen is the target | `shooter/` | **No, local only (untracked)**. Local branch `laptop-shooter` exists but isn't pushed |

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
- **Status:** merged into `main` via PR #1 (https://github.com/harryyangzy/hackwestern-13/pull/1).

### GripSense iOS app (`GripSense/`)
- **Idea:** the phone vibrates; a tighter grip damps the vibration, so the accelerometer/gyro energy drops.
  Calibrate "light" and "hard" grip, then a meter shows how hard you're squeezing.
- **On GitHub (branch `vibrate-grip`, commit `2a948ad`):** first version: continuous vibration, accel/gyro RMS,
  chart, calibration, grip meter.
- **Local, uncommitted changes:**
  - A *Sharpness* slider (changes the vibration frequency).
  - A *Pulsed* mode (on by default): the vibration switches on and off at 5 Hz and the app measures only the
    sensor energy that follows that rhythm (lock-in detection), so hand movement doesn't look like grip.
  - A *Signal* readout so you can check vibration is actually detected; build number bumped to 2.
- **Next:** test pulsed mode on a device, then commit and push.

### Grip Sense Web (`web/index.html`)
- A browser version of GripSense for phones: Start/Stop, sensor choice, live graph and grip meter. It makes the
  phone buzz by rapidly toggling an iOS 18+ switch control (which gives a haptic tick).
- Local only; not committed yet.

### Laptop Shooter (`shooter/`)
- "Your laptop is the target, your phone is the gun." Run `node shooter/server.js` (Node 18+, no install).
  Laptop opens http://localhost:8080; phones on the same Wi-Fi open the `https://…:8443/gun` URL shown
  (self-signed cert; HTTPS is needed for motion sensors). Tilt to aim, tap to fire, shake to reload. Several
  phones can play at once; mouse works as a fallback. Full instructions in `shooter/README.md`.
- Local only; not committed yet.

## Open items
1. Commit and push the GripSense pulsed-mode changes, `web/` and `shooter/`, then update the table above.
2. Try Gion Taxi on a phone.
