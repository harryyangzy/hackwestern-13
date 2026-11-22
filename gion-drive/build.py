#!/usr/bin/env python3
"""Build the taxi game for each city: a Pocket City scene with a drivable taxi and crew play on top.

  python3 build.py                     # every city
  python3 build.py --city london       # one city: gion, london, toronto, amsterdam
  python3 build.py [--skill ~/Downloads/pocket-city] [--from-built]

Cities (CITIES below): Gion (the skill's own Gion example) → gion-taxi.html; London, Toronto and Amsterdam (scenes made
with the skill's pipeline, in cities/<id>/work/: scene.json, city.json, landmarks.js) → taxi-<id>.html.

Two ways to build, same result:
  * With the skill (the default path, or --skill PATH): runs the skill's build.py on the city's scene, city and
    landmarks (+ player.js), then wires the game in.
  * Without it (the skill folder is missing, or --from-built): rebuilds from the existing page, swapping in the current
    player.js and game files between the <gion-taxi …> markers. The base scene stays exactly as it was last built.

Wiring: the page sends window.PLAYER to the render worker with each frame, and the worker sends back the traffic near
the taxi. window.GT_CITY (and GT_CITY inside the worker) carries the city's settings. The game files (drive.css,
mp.css, shoot.css, wt.css, qr.js, drive.js, shoot.js, mp.js, wt.js) go in before </body>. pad.html, pad-shoot.js, wt-pad.js
(the phone controller) and server.js are served beside the pages by `node server.js`; they aren't part of the build.
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--skill', default=os.path.expanduser('~/Downloads/pocket-city'))
ap.add_argument('--city', default='all')
ap.add_argument('--from-built', action='store_true', help='rebuild from the existing page even if the skill is installed')
a = ap.parse_args()
read = lambda p: open(p, encoding='utf-8').read()
src = lambda name: read(os.path.join(HERE, name))

# brand: the game's name (tandem, in every city); bowl: the bonus mode's name; drivePaths: the taxi may also use footpaths
# (Western's main campus is almost all paths); open: drive anywhere on the plot except through buildings (London: the
# paths are only ~2.6 m wide, too skinny to be fun); blurb: the menu's first line.
CITIES = {
    'gion': dict(src=os.path.join(a.skill, 'assets', 'examples', 'gion'), out='gion-taxi.html', name='Gion', brand='tandem',
                 bowl='Gion Bowling', blurb='Drive a taxi through the lanes of Gion, Kyoto.', drivePaths=False),
    'london': dict(src=os.path.join(HERE, 'cities', 'london', 'work'), out='taxi-london.html', name='London', brand='tandem',
                   bowl='Campus Bowling', blurb='Drive a taxi across Western University’s main campus in London, Ontario: the whole campus is open, just not through the buildings.', drivePaths=True, open=True),
    'toronto': dict(src=os.path.join(HERE, 'cities', 'toronto', 'work'), out='taxi-toronto.html', name='Toronto', brand='tandem',
                    bowl='Square Bowling', blurb='Drive a taxi around Nathan Phillips Square and Toronto City Hall.', drivePaths=False),
    'amsterdam': dict(src=os.path.join(HERE, 'cities', 'amsterdam', 'work'), out='taxi-amsterdam.html', name='Amsterdam', brand='tandem',
                      bowl='Canal Bowling', blurb='Drive a taxi along the canals where the Reguliersgracht crosses the Keizersgracht.', drivePaths=False),
}
P_OPEN, P_CLOSE = '/* <gion-taxi player.js> */\n', '\n/* </gion-taxi player.js> */'
G_OPEN, G_CLOSE = '<!-- <gion-taxi game> -->\n', '<!-- </gion-taxi game> -->\n'
LICENSE = ('<!-- {brand}. The city, its drawing engine and the street simulation are Pocket City by April Zhu '
           '(MIT licence, https://april-zhu.com/pocketcity). Map data © OpenStreetMap contributors (ODbL). -->')
TEMPLATE_DESC = '''<meta name="description" content="Turn a hand-drawn, register-built miniature of Amsterdam's Reguliersgracht and Keizersgracht. Explore its seasons, bridges and street life.">'''


def build(cid):
    c = CITIES[cid]
    out = os.path.join(HERE, c['out'])
    cfg = {k: c[k] for k in ('name', 'brand', 'bowl', 'blurb', 'drivePaths')}
    cfg['open'] = c.get('open', False)
    cfg['id'] = cid
    cfg['cities'] = [{'id': k, 'name': v['name'], 'href': v['out']} for k, v in CITIES.items()]
    player = P_OPEN + 'const GT_CITY = ' + json.dumps({'drivePaths': c['drivePaths'], 'open': c.get('open', False)}) + ';\n' + src('player.js') + P_CLOSE
    skill_build = os.path.join(a.skill, 'scripts', 'build.py')
    if not a.from_built and os.path.isfile(skill_build) and os.path.isfile(os.path.join(c['src'], 'scene.json')):
        mode = 'skill ' + a.skill
        with tempfile.TemporaryDirectory() as tmp:
            lm = os.path.join(tmp, 'landmarks.js')
            open(lm, 'w', encoding='utf-8').write(read(os.path.join(c['src'], 'landmarks.js')) + '\n' + player)
            base = os.path.join(tmp, 'base.html')
            subprocess.run([sys.executable, skill_build, '--scene', os.path.join(c['src'], 'scene.json'),
                            '--city', os.path.join(c['src'], 'city.json'), '--landmarks', lm, '--out', base],
                           check=True, stdout=subprocess.DEVNULL)
            html = read(base)
    else:
        if not os.path.isfile(out):
            sys.exit(f'{cid}: no Pocket City skill at {a.skill} and no {out} to rebuild from. Pass --skill PATH.')
        mode = 'existing ' + c['out']
        html = read(out)
        for o, cl in ((P_OPEN, P_CLOSE), (G_OPEN, G_CLOSE)):
            if html.count(o) != 1 or html.count(cl) != 1:
                sys.exit(f'{out} has no single {o.strip()} … {cl.strip()} region; rebuild once with the skill (--skill PATH).')
        html = re.sub(re.escape(P_OPEN) + '.*?' + re.escape(P_CLOSE), lambda _: player, html, flags=re.S)
        html = re.sub(re.escape(G_OPEN) + '.*?' + re.escape(G_CLOSE), '', html, flags=re.S)

    b = c['brand']
    # Each patch is applied once. Rebuilding from an already-built page finds the new text instead, which is fine.
    patches = [
        # the game ↔ render worker wiring
        ('self.onmessage=({data:m})=>{try{const r=renderFrame(m);postMessage({...r,seq:m.seq',
         'self.onmessage=({data:m})=>{try{self.PLAYER=m.player;const r=renderFrame(m);postMessage({...r,near:self.NEAR,seq:m.seq'),
        ('const m={width:W,height:H,', 'const m={player:window.PLAYER||null,width:W,height:H,'),
        ('function display(frame,g){', 'function display(frame,g){if(frame.near!==undefined)window.NEAR_IN=frame.near;'),
        # driving redraws every frame (the camera follows the taxi), and a frame costs ~10 ms, so draw at 60 fps while driving
        ('const interval=1000/(phone?20:30);', 'const interval=1000/(window.PLAYER?(phone?30:60):(phone?20:30));'),
        # branding: the page is the taxi game. The engine credit stays in the field notes and the licence notice.
        ('<!doctype html>\n<html', '<!doctype html>\n' + LICENSE.format(brand=b) + '\n<html'),
        ('<title>Pocket City</title>', f'<title>{b}</title>'),
        ('<span class="wordmark">Pocket City</span>', f'<span class="wordmark">{b}</span>'),
        ('document.title=\'Pocket City · \'+(CITY.title||CITY.name);', f'document.title=\'{b} · \'+(CITY.title||CITY.name);'),
        ("<dt>Drawing</dt><dd>Pocket City by April Zhu.", "<dt>Drawing</dt><dd>City drawing engine by April Zhu (MIT licence)."),
        (TEMPLATE_DESC, f'<meta name="description" content="{b}: {c["blurb"]} Alone or with a crew of phones.">'),
    ]
    for old, new in patches:
        if html.count(new) == 1: continue
        if html.count(old) != 1: sys.exit(f'{cid}: patch anchor not found exactly once (the skill changed?): {old[:60]}')
        html = html.replace(old, new)

    script = lambda name: '<script>\n' + src(name).replace('</script', '<\\/script') + '\n</script>\n'
    # shoot.js goes before mp.js so it hears the 'stop' event first and can add the shooter's stats to the results
    game = (G_OPEN + '<style>\n' + src('drive.css') + src('mp.css') + src('shoot.css') + src('wt.css') + '</style>\n'
            + '<script>window.GT_CITY = ' + json.dumps(cfg, ensure_ascii=False).replace('</', '<\\/') + ';</script>\n'
            + script('qr.js') + script('drive.js') + script('shoot.js') + script('mp.js') + script('wt.js') + G_CLOSE)
    if html.count('</body></html>') != 1: sys.exit(f'{cid}: </body></html> not found exactly once')
    html = html.replace('</body></html>', game + '</body></html>')
    open(out, 'w', encoding='utf-8').write(html)
    print(f'Built {c["out"]} ({len(html) // 1024} KB) from {mode}.')


for cid in (CITIES if a.city == 'all' else [a.city]):
    if cid not in CITIES: sys.exit(f'unknown city {cid}; choose from {", ".join(CITIES)}')
    build(cid)
print('Solo: open a page in a browser and press Start driving. Crew: node server.js, then open http://localhost:8090')
