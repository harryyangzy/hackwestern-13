"""London (Western's campus): rebuild scene.json with footpaths wide enough for the taxi.
The campus is almost all footpaths, mapped 2-2.4 m wide; the taxi is 1.75 m wide, so it couldn't turn on them.
This runs the Pocket City skill's prep.py with wider footpaths (and service roads), drawn that wide too, so the kerbs
and the drivable area match what's on screen. Needs shapely (pip install shapely).
    python3 gion-drive/cities/london/widen.py [--skill ~/Downloads/pocket-city]   then   python3 gion-drive/build.py --city london
"""
import os, sys
skill = os.path.expanduser(sys.argv[sys.argv.index('--skill') + 1] if '--skill' in sys.argv else '~/Downloads/pocket-city')
sys.path.insert(0, os.path.join(skill, 'scripts'))
import prep
prep.FOOT.update({'footway': 5.5, 'path': 5, 'cycleway': 5.5, 'steps': 4, 'bridleway': 5, 'track': 5.5, 'corridor': 4})
prep.DRIVE.update({'service': 6.5})
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work')
sys.argv = ['prep.py', '--osm', f'{W}/osm.json', '--plot', f'{W}/plot.json', '--drive', 'right', '--green-open', '12', '--out', f'{W}/scene.json']
prep.main()
