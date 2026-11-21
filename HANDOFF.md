# Handoff: Harry's work on Hack Western 13

Last updated: 2026-11-21 (evening). Repo: https://github.com/harryyangzy/hackwestern-13

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
| GripSense (iOS) | Estimates grip force from vibration damping, and now from ultrasonic sound | `GripSense/` | Build 2: branch `vibrate-grip` (`9a4e322`), PR #3 open. **Builds 3–4 (sound mode, haptic feedback) are on TestFlight but uncommitted** |
| Grip Sense Web | Browser version of GripSense for phones (vibrates on Android only) | `web/index.html` | Yes: branch `vibrate-grip` (commit `9a4e322`); not in `main` yet |
| Laptop Shooter | Phone is the gun, laptop screen is the target | `shooter/` | Yes: branch `laptop-shooter` (`9a1132d`), PR #4 open. Played on a real phone. **Corner calibration is uncommitted** |

> **Branches:** every project is committed and pushed, each on its own branch: Gion Taxi in `main`, GripSense and
> Grip Sense Web on `vibrate-grip`, Laptop Shooter on `laptop-shooter`, this doc on `handoff-doc`.
> `laptop-shooter` was branched from `vibrate-grip`'s first commit, so it also contains GripSense v1 (not build 2).
> Harry's working folder is checked out on `laptop-shooter`, so GripSense files show as modified and `web/`
> as untracked there. That's expected: their latest versions are committed on `vibrate-grip`. Switch to
> `vibrate-grip` before working on GripSense.

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
  Calibrate "light" and "hard" grip, then a meter shows how hard you're squeezing. Build 3 adds a second
  method that uses sound instead (see below).
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
- **Likely cause of the weak signal:** the iPhone's motion sensors are capped at about 100 Hz, which is why
  build 3 adds a sound-based mode.
- **Build 3 (on TestFlight, uncommitted in git):** a ForcePhone-style *Sound* mode.
  - The app now opens on a "Sound (new) / Vibration" switch.
  - Sound mode plays 18, 19 and 20 kHz tones through the speaker or earpiece and measures each tone's amplitude
    and phase at the microphone (48 kHz, lock-in demodulation). It calibrates "loose" and "squeeze", then
    projects onto that direction to give a 0–100% grip. Needs microphone permission.
  - New files: `GripSense/GripSense/AudioGripSensor.swift` and `SoundView.swift`; build number 3.
- **Build 4 (on TestFlight, uncommitted in git):** Sound mode gets a *Haptic feedback* setting: Off /
  Stronger when squeezing / Fades when squeezing. The vibration strength follows the calibrated grip. Recording
  from the mic while playing haptics is allowed via `setAllowHapticsAndSystemSoundsDuringRecording`. New file:
  `GripSense/GripSense/GripHaptics.swift`.
- **Builds 3 and 4 are not tested on a device yet.**
- **Where the code is:** a separate worktree, `~/Downloads/hw13-grip` (branch `vibrate-grip`), **not committed**.
  PR #3 has build 2 only. Harry hasn't decided whether to commit builds 3–4 into PR #3 before merging it, or
  merge PR #3 first and add them afterwards.
- **Next:** test builds 3–4 on the phone; decide how to commit them.

### Grip Sense Web (`web/index.html`)
- A browser version of GripSense for phones: Start/Stop, sensor choice, live graph and grip meter.
- **Vibration only works on Android** (`navigator.vibrate`). The trick of rapidly toggling an iOS switch
  control to get haptic ticks does **not** work: Harry felt no vibration on his iPhone.
- Served from Harry's Mac through a temporary ngrok URL (the link changes, so don't hand it out as permanent).
- On branch `vibrate-grip` (commit `9a4e322`).

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
  **Harry has played it on his real phone** (over his phone's hotspot).
- **Aim calibration (new, uncommitted):** aim was a bit off at first, so there's now a two-corner calibration. The
  phone asks you to aim at the laptop screen's top-left, then bottom-right corner, while the laptop shows a pulsing
  marker in that corner. The phone also has a new *Calibrate* button. These changes (`shooter/public/gun.html`,
  `shooter/public/screen.html`, `shooter/server.js`) sit uncommitted on top of `9a1132d`, so they aren't in
  PR #4 yet. Harry hasn't tried the calibration on his phone yet.
- Harry has a separate private setup & troubleshooting doc for sharing with friends (ask him for it; the link
  isn't kept in the repo).
- On branch `laptop-shooter` (commit `9a1132d`). The HTTPS certificate in `shooter/.cert/` is made locally
  and is git-ignored, so a fresh clone generates its own.

## Open items
1. GripSense: test builds 3–4 (sound mode, haptic feedback) on the phone; decide whether builds 3–4 go into PR #3; update to Xcode 27.
2. Laptop Shooter: try the corner calibration on the phone, then commit it; add the hotspot tip to `shooter/README.md`.
3. Merge PR #3 (GripSense build 2 + web) and then PR #4 (Laptop Shooter) into `main`, in that order.
4. Try Gion Taxi on a phone.
