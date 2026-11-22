"""Make globe/world.js, the world map for the city-selection globe in index.html (build.py inlines it).

Data: Natural Earth (public domain, https://www.naturalearthdata.com): land at 1:110m via the world-atlas package
(land-110m.json, TopoJSON), lakes and populated places at 1:110m (GeoJSON). Download them once, then:
    python3 gion-drive/globe/make_world.py LAND_110M_JSON LAKES_GEOJSON PLACES_GEOJSON
Sources used:
    https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_lakes.geojson
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_populated_places_simple.geojson
Output: window.GT_WORLD = { land: [polygon...], lakes: [polygon...], each polygon a list of rings (outer first, then holes), places: [[name, country, lat, lon, rank]...] (rank: Natural Earth's scalerank, 0 = biggest) }, rings as flat
[lon, lat, lon, lat...] arrays in hundredths of a degree.
"""
import json, os, sys

land_p, lakes_p, places_p = sys.argv[1:4]
Q = 100   # hundredths of a degree

def topo_rings(topo, obj):
    t = topo.get('transform')
    arcs = []
    for arc in topo['arcs']:
        x = y = 0; pts = []
        for p in arc:
            if t: x += p[0]; y += p[1]; pts.append((x * t['scale'][0] + t['translate'][0], y * t['scale'][1] + t['translate'][1]))
            else: pts.append(tuple(p))
        arcs.append(pts)
    def ring(ids):
        out = []
        for i in ids:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a if not out else a[1:])
        return out
    polys = []
    for g in topo['objects'][obj]['geometries']:
        for poly in (g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]):
            polys.append([ring(r) for r in poly])
    return polys

def geo_polys(fc):
    polys = []
    for f in fc['features']:
        g = f['geometry']; polys.extend(g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']])
    return polys

def pack(r):
    out, last = [], None
    for lon, lat in r:
        q = (round(lon * Q), round(lat * Q))
        if q != last: out.extend(q); last = q
    return out

land = [[pack(r) for r in poly] for poly in topo_rings(json.load(open(land_p)), 'land')]
land = [[r for r in poly if len(r) >= 8] for poly in land if len(poly[0]) >= 8]
lakes = [[pack(r) for r in poly] for poly in geo_polys(json.load(open(lakes_p)))]
places = []
for f in json.load(open(places_p, encoding='utf-8'))['features']:
    p = f['properties']
    places.append([p['name'], p['adm0name'], round(p['latitude'], 2), round(p['longitude'], 2), p['scalerank']])
# tandem's own cities that the 1:110m set leaves out
for extra in [['London', 'Canada', 42.98, -81.25, 6]]:
    if not any(q[0] == extra[0] and q[1] == extra[1] for q in places): places.append(extra)
places.sort(key=lambda q: (q[1], q[0]))
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'world.js')
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('/* The world for tandem\'s city-selection globe. Natural Earth (public domain), made by make_world.py. */\n')
    fh.write('window.GT_WORLD = ' + json.dumps({'land': land, 'lakes': lakes, 'places': places}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{out}: {len(land)} land polygons, {len(lakes)} lakes, {len(places)} places, {os.path.getsize(out) // 1024} KB')
