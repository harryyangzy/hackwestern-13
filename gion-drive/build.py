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
mp.css, shoot.css, wt.css, theme.css, qr.js, drive.js, cuties.js, shoot.js, mp.js, wt.js, flow.js) go in before </body>. pad.html, pad-shoot.js, wt-pad.js
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

# brand: the game's name (tandem, in every city); bowl: the bonus mode's name (Joyride); drivePaths: the taxi may also use footpaths
# (Western's main campus is almost all paths); open: drive anywhere on the plot except through buildings (London: the
# paths are only ~2.6 m wide, too skinny to be fun); blurb: the menu's first line.
# money: scores are kept in yen (the fare rules were tuned in yen) and shown in the city's currency, at a rate that makes
# a typical ~¥2,500 fare look like a real short taxi ride there ($25 in Ontario, €15 in Amsterdam)
YEN = dict(sym='¥', rate=1, dec=0, label='Yen')
CAD = dict(sym='$', rate=.01, dec=2, label='Dollars')
EUR = dict(sym='€', rate=.006, dec=2, label='Euros')
CITIES = {
    'gion': dict(src=os.path.join(a.skill, 'assets', 'examples', 'gion'), out='gion-taxi.html', name='Kyoto', place='Gion Shirakawa', brand='tandem',
                 bowl='Joyride', money=YEN, blurb='Drive a taxi through the lanes of Gion, Kyoto.', drivePaths=False),
    'london': dict(src=os.path.join(HERE, 'cities', 'london', 'work'), out='taxi-london.html', name='London', place='Western University, Ontario', brand='tandem',
                   bowl='Joyride', money=CAD, blurb='Drive a taxi across Western University’s main campus in London, Ontario: the whole campus is open, just not through the buildings.', drivePaths=True, open=True),
    'toronto': dict(src=os.path.join(HERE, 'cities', 'toronto', 'work'), out='taxi-toronto.html', name='Toronto', place='Nathan Phillips Square', brand='tandem',
                    bowl='Joyride', money=CAD, blurb='Drive a taxi around Nathan Phillips Square and Toronto City Hall.', drivePaths=False),
    'amsterdam': dict(src=os.path.join(HERE, 'cities', 'amsterdam', 'work'), out='taxi-amsterdam.html', name='Amsterdam', place='Reguliersgracht × Keizersgracht', brand='tandem',
                      bowl='Joyride', money=EUR, blurb='Drive a taxi along the canals where the Reguliersgracht crosses the Keizersgracht.', drivePaths=False),
}
P_OPEN, P_CLOSE = '/* <gion-taxi player.js> */\n', '\n/* </gion-taxi player.js> */'
G_OPEN, G_CLOSE = '<!-- <gion-taxi game> -->\n', '<!-- </gion-taxi game> -->\n'
LICENSE = ('<!-- {brand}. The city, its drawing engine and the street simulation are Pocket City by April Zhu '
           '(MIT licence, https://april-zhu.com/pocketcity). Map data © OpenStreetMap contributors (ODbL). -->')
VEIL = ('<style>#gt-veil{{position:fixed;inset:0;z-index:60;background:#f6f3e9;display:flex;flex-direction:column;align-items:center;'
        'justify-content:center;gap:4px;transition:opacity .5s cubic-bezier(.4,0,.2,1)}}#gt-veil.out{{opacity:0;pointer-events:none}}'
        '#gt-veil b{{font:700 44px Inter,"Helvetica Neue",Arial,sans-serif;letter-spacing:-.02em;color:#263c35}}#gt-veil small{{font:11px Inter,"Helvetica Neue",Arial,sans-serif;'
        'color:#626c60;text-transform:uppercase;letter-spacing:.08em}}#gt-veil i{{width:28px;height:2px;background:#ac4931;margin-top:10px;'
        'animation:gt-veil 1.1s ease-in-out infinite alternate}}@keyframes gt-veil{{from{{transform:scaleX(.3);opacity:.4}}to{{transform:scaleX(1);opacity:1}}}}'
        '@media (prefers-reduced-motion:reduce){{#gt-veil,#gt-veil i{{transition:none;animation:none}}}}</style>'
        '<div id="gt-veil" aria-hidden="true"><b>{name}</b><small>{place}</small><i></i></div>')
TEMPLATE_DESC = '''<meta name="description" content="Turn a hand-drawn, register-built miniature of Amsterdam's Reguliersgracht and Keizersgracht. Explore its seasons, bridges and street life.">'''


def build(cid):
    c = CITIES[cid]
    out = os.path.join(HERE, c['out'])
    cfg = {k: c[k] for k in ('name', 'brand', 'bowl', 'blurb', 'drivePaths')}
    cfg['open'] = c.get('open', False)
    cfg['money'] = c['money']
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
        # arriving from city selection: the page opens on the same paper with the city's name, and flow.js lifts it once
        # the first picture of the city is drawn (no flash of the page being built, no loading text)
        ('</head><body>', '</head><body>' + VEIL.format(name=c['name'], place=c['place'])),
    ]
    for old, new in patches:
        if html.count(new) == 1: continue
        if html.count(old) != 1: sys.exit(f'{cid}: patch anchor not found exactly once (the skill changed?): {old[:60]}')
        html = html.replace(old, new)

    script = lambda name: '<script>\n' + src(name).replace('</script', '<\\/script') + '\n</script>\n'
    # shoot.js goes before mp.js so it hears the 'stop' event first and can add the shooter's stats to the results
    game = (G_OPEN + '<style>\n' + src('drive.css') + src('mp.css') + src('shoot.css') + src('wt.css') + src('theme.css') + '</style>\n'
            + '<script>window.GT_CITY = ' + json.dumps(cfg, ensure_ascii=False).replace('</', '<\\/') + ';</script>\n'
            + script('qr.js') + script('drive.js') + script('cuties.js') + script('shoot.js') + script('mp.js') + script('wt.js') + script('flow.js') + G_CLOSE)
    if html.count('</body></html>') != 1: sys.exit(f'{cid}: </body></html> not found exactly once')
    html = html.replace('</body></html>', game + '</body></html>')
    open(out, 'w', encoding='utf-8').write(html)
    print(f'Built {c["out"]} ({len(html) // 1024} KB) from {mode}.')


def preview(c):
    """A small map of the city's plot (streets, water, buildings) from its scene, for the city cards."""
    try: sc = json.load(open(os.path.join(c['src'], 'scene.json'), encoding='utf-8'))
    except OSError: return None
    H = sc['meta']['half']
    ring = lambda r: 'M' + 'L'.join(f'{p[0]:.0f} {-p[1]:.0f}' for p in r) + 'Z'
    group = lambda gs: ''.join(ring(r) for g in gs for r in g)
    streets = group(sc['roads']) + (group(sc.get('paths', [])) if c.get('drivePaths') else '')
    return (f'<svg viewBox="{-H} {-H} {2 * H} {2 * H}" aria-hidden="true"><rect x="{-H}" y="{-H}" width="{2 * H}" height="{2 * H}" fill="#efe7d4"/>'
            f'<path d="{group(sc.get("water", []))}" fill="#9cc3c4" fill-rule="evenodd"/><path d="{streets}" fill="#cbbab3" fill-rule="evenodd"/>'
            f'<path d="{"".join(ring(b["ring"]) for b in sc["buildings"])}" fill="#d9c7a8" stroke="#a89a85" stroke-width="{H / 160:.2f}"/></svg>')


def build_index():
    cards = []
    for cid, c in CITIES.items():
        playable = os.path.isfile(os.path.join(HERE, c['out']))
        svg = preview(c) or ''
        cards.append(f'<button class="city" data-href="{c["out"]}" {"" if playable else "disabled"}>{svg}'
                     f'<span><b>{c["name"]}</b><small>{c["place"]}</small><em>{c["blurb"]}</em></span></button>')
    html = read(os.path.join(HERE, 'index.template.html')).replace('<!--CITIES-->', '\n'.join(cards))
    open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(html)
    print('Built index.html (title and city selection).')


for cid in (CITIES if a.city == 'all' else [a.city]):
    if cid not in CITIES: sys.exit(f'unknown city {cid}; choose from {", ".join(CITIES)}')
    build(cid)
build_index()
print('Solo: open a page in a browser and press Start driving. Crew: node server.js, then open http://localhost:8090')
