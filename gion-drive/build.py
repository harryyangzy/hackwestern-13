#!/usr/bin/env python3
"""Build Gion Taxi: the Pocket City skill's Gion Shirakawa scene with a drivable taxi on top.

  python3 build.py [--skill ~/Downloads/pocket-city] [--out gion-taxi.html]

Runs the skill's build.py on its Gion example (scene, city, landmarks + player.js), then wires the game in:
the page sends window.PLAYER to the render worker with each frame, and the worker sends back the traffic near the taxi.
"""
import argparse, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--skill', default=os.path.expanduser('~/Downloads/pocket-city'))
ap.add_argument('--out', default=os.path.join(HERE, 'gion-taxi.html'))
a = ap.parse_args()
gion = os.path.join(a.skill, 'assets', 'examples', 'gion')
read = lambda p: open(p, encoding='utf-8').read()

with tempfile.TemporaryDirectory() as tmp:
    lm = os.path.join(tmp, 'landmarks.js')
    open(lm, 'w', encoding='utf-8').write(read(os.path.join(gion, 'landmarks.js')) + '\n' + read(os.path.join(HERE, 'player.js')))
    base = os.path.join(tmp, 'base.html')
    subprocess.run([sys.executable, os.path.join(a.skill, 'scripts', 'build.py'), '--scene', os.path.join(gion, 'scene.json'),
                    '--city', os.path.join(gion, 'city.json'), '--landmarks', lm, '--out', base], check=True)
    html = read(base)

PATCHES = [
    ('self.onmessage=({data:m})=>{try{const r=renderFrame(m);postMessage({...r,seq:m.seq',
     'self.onmessage=({data:m})=>{try{self.PLAYER=m.player;const r=renderFrame(m);postMessage({...r,near:self.NEAR,seq:m.seq'),
    ('const m={width:W,height:H,', 'const m={player:window.PLAYER||null,width:W,height:H,'),
    ('function display(frame,g){', 'function display(frame,g){if(frame.near!==undefined)window.NEAR_IN=frame.near;'),
]
for old, new in PATCHES:
    if html.count(old) != 1: sys.exit(f'patch anchor not found exactly once (the skill changed?): {old[:60]}')
    html = html.replace(old, new)
game = '<style>\n' + read(os.path.join(HERE, 'drive.css')) + '</style>\n<script>\n' + read(os.path.join(HERE, 'drive.js')).replace('</script', '<\\/script') + '\n</script>\n'
html = html.replace('</body></html>', game + '</body></html>')
open(a.out, 'w', encoding='utf-8').write(html)
print(f'Built {a.out} ({len(html) // 1024} KB). Open it in a browser and press Start driving.')
