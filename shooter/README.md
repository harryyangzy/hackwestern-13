# Laptop Shooter

Your laptop is the target, your phone is the gun.

## Run

```sh
node shooter/server.js        # Node 18+, no npm install needed
```

1. On the laptop, open **http://localhost:8080** (press `f` for fullscreen, click once to enable sound).
2. On your phone (same Wi-Fi), open the **https://…:8443/gun** URL shown on the laptop.
   Accept the self-signed certificate warning — HTTPS is required for motion sensors.
3. Enter a name, tap **ARM**, allow motion access.
4. Hold the phone like a remote (screen up, top edge toward the laptop), point at the
   middle of the screen and tap **Recenter**. Pull the trigger to start.

- Twist/tilt the phone to aim, tap **FIRE** to shoot, shake the phone (or tap Reload) to reload.
- Shoot 🐛 bugs, 🌈 beach balls, popups and ⭐ stars. Don't shoot the 📄 unsaved thesis.
- Every shot cracks the laptop screen. Multiple phones can play at once.
- No phone? Click on the laptop page to play with the mouse (`r` reloads).

If the phone can't connect, allow `node` through the macOS firewall.
