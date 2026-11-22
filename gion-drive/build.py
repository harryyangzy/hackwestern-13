#!/usr/bin/env python3
"""Build Gion Taxi: the Pocket City skill's Gion Shirakawa scene with a drivable taxi and crew play on top.

  python3 build.py [--skill ~/Downloads/pocket-city] [--out gion-taxi.html]

Two ways to build, same result:
  * With the skill (the default path, or --skill PATH): runs the skill's build.py on its Gion example (scene, city,
    landmarks + player.js), then wires the game in.
  * Without it (the skill folder is missing, or --from-built): rebuilds from the existing gion-taxi.html, swapping in the
    current player.js and game files between the <gion-taxi …> markers. Use this to ship source edits when the skill
    isn't installed; the base scene stays exactly as it was last built.

Wiring: the page sends window.PLAYER to the render worker with each frame, and the worker sends back the traffic near
the taxi. The game files (drive.css, mp.css, wt.css, qr.js, drive.js, mp.js, wt.js) go in before </body>. pad.html (the phone
controller) and server.js are served beside the page by `node server.js`; they aren't part of the build.
"""
import argparse, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--skill', default=os.path.expanduser('~/Downloads/pocket-city'))
ap.add_argument('--out', default=os.path.join(HERE, 'gion-taxi.html'))
ap.add_argument('--from-built', action='store_true', help='rebuild from the existing --out file even if the skill is installed')
a = ap.parse_args()
read = lambda p: open(p, encoding='utf-8').read()
src = lambda name: read(os.path.join(HERE, name))

P_OPEN, P_CLOSE = '/* <gion-taxi player.js> */\n', '\n/* </gion-taxi player.js> */'
G_OPEN, G_CLOSE = '<!-- <gion-taxi game> -->\n', '<!-- </gion-taxi game> -->\n'
player = P_OPEN + src('player.js') + P_CLOSE

gion = os.path.join(a.skill, 'assets', 'examples', 'gion')
if not a.from_built and os.path.isfile(os.path.join(a.skill, 'scripts', 'build.py')):
    mode = 'skill ' + a.skill
    with tempfile.TemporaryDirectory() as tmp:
        lm = os.path.join(tmp, 'landmarks.js')
        open(lm, 'w', encoding='utf-8').write(read(os.path.join(gion, 'landmarks.js')) + '\n' + player)
        base = os.path.join(tmp, 'base.html')
        subprocess.run([sys.executable, os.path.join(a.skill, 'scripts', 'build.py'), '--scene', os.path.join(gion, 'scene.json'),
                        '--city', os.path.join(gion, 'city.json'), '--landmarks', lm, '--out', base], check=True)
        html = read(base)
else:
    if not os.path.isfile(a.out):
        sys.exit(f'No Pocket City skill at {a.skill} and no {a.out} to rebuild from. Pass --skill PATH.')
    mode = 'existing ' + os.path.basename(a.out) + ('' if a.from_built else f' (no skill at {a.skill})')
    html = read(a.out)
    for o, c in ((P_OPEN, P_CLOSE), (G_OPEN, G_CLOSE)):
        if html.count(o) != 1 or html.count(c) != 1:
            sys.exit(f'{a.out} has no single {o.strip()} … {c.strip()} region; rebuild once with the skill (--skill PATH).')
    html = re.sub(re.escape(P_OPEN) + '.*?' + re.escape(P_CLOSE), lambda _: player, html, flags=re.S)
    html = re.sub(re.escape(G_OPEN) + '.*?' + re.escape(G_CLOSE), '', html, flags=re.S)

# Each patch is applied once. Rebuilding from an already-built page finds the new text instead, which is fine.
LICENSE = ('<!-- Gion Taxi. The city, its drawing engine and the street simulation are Pocket City by April Zhu '
           '(MIT licence, https://april-zhu.com/pocketcity). Map data © OpenStreetMap contributors (ODbL). -->')
PATCHES = [
    # the game ↔ render worker wiring
    ('self.onmessage=({data:m})=>{try{const r=renderFrame(m);postMessage({...r,seq:m.seq',
     'self.onmessage=({data:m})=>{try{self.PLAYER=m.player;const r=renderFrame(m);postMessage({...r,near:self.NEAR,seq:m.seq'),
    ('const m={width:W,height:H,', 'const m={player:window.PLAYER||null,width:W,height:H,'),
    ('function display(frame,g){', 'function display(frame,g){if(frame.near!==undefined)window.NEAR_IN=frame.near;'),
    # branding: the page is Gion Taxi. The engine credit stays in the field notes and the licence notice above.
    ('<!doctype html>\n<html', '<!doctype html>\n' + LICENSE + '\n<html'),
    ('<title>Pocket City</title>', '<title>Gion Taxi</title>'),
    ('<span class="wordmark">Pocket City</span>', '<span class="wordmark">Gion Taxi</span>'),
    ('document.title=\'Pocket City · \'+(CITY.title||CITY.name);', 'document.title=\'Gion Taxi · \'+(CITY.title||CITY.name);'),
    ("<dt>Drawing</dt><dd>Pocket City by April Zhu.", "<dt>Drawing</dt><dd>City drawing engine by April Zhu (MIT licence)."),
    ('''<meta name="description" content="Turn a hand-drawn, register-built miniature of Amsterdam's Reguliersgracht and Keizersgracht. Explore its seasons, bridges and street life.">''',
     '<meta name="description" content="Gion Taxi: drive a taxi through the lanes of Gion Shirakawa, Kyoto, alone or with a crew of phones.">'),
]
for old, new in PATCHES:
    if html.count(new) == 1: continue
    if html.count(old) != 1: sys.exit(f'patch anchor not found exactly once (the skill changed?): {old[:60]}')
    html = html.replace(old, new)

script = lambda name: '<script>\n' + src(name).replace('</script', '<\\/script') + '\n</script>\n'
game = (G_OPEN + '<style>\n' + src('drive.css') + src('mp.css') + src('wt.css') + '</style>\n'
        + script('qr.js') + script('drive.js') + script('mp.js') + script('wt.js') + G_CLOSE)
if html.count('</body></html>') != 1: sys.exit('</body></html> not found exactly once')
html = html.replace('</body></html>', game + '</body></html>')
open(a.out, 'w', encoding='utf-8').write(html)
print(f'Built {a.out} ({len(html) // 1024} KB) from {mode}.')
print('Solo: open it in a browser and press Start driving. Crew: node server.js, then open http://localhost:8090')
