# Finds coordinates for Epoch data centers that geocoded.json doesn't have yet, with OpenStreetMap
# Nominatim (at most one request a second, per its usage policy). Run build.py once first so the
# Epoch data is downloaded.
import csv, json, os, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'geocoded.json')
UA = 'AIMap/0.3 (one-time geocoding of public data center addresses for a local hobby map)'
FALLBACK = {
  'Google Mesa': 'Mesa, Arizona, USA',
  'OpenAI Stargate Michigan': 'Saline Township, Washtenaw County, Michigan, USA',
  'OpenAI Stargate Milam': 'Milam County, Texas, USA',
  'OpenAI Stargate New Mexico': 'Santa Teresa, New Mexico, USA',
  'OpenAI Stargate Wisconsin': 'Port Washington, Wisconsin, USA',
  'DayOne Nusajaya': 'Iskandar Puteri, Johor, Malaysia',
  'Google Storey County': 'McCarran, Storey County, Nevada, USA',
  'Google Kansas City East': 'Kansas City, Missouri, USA',
  'Microsoft Narvik Norway': 'Narvik, Norway',
  'Nebius Mantsala': 'Mäntsälä, Finland',
  'Southgate Melbourne': 'Melbourne, Victoria, Australia',
  'Oracle Batam': 'Batam, Indonesia',
  'Envision Galaxy Ulanqab': 'Ulanqab, Inner Mongolia, China',
  'VNET Bayin Ulanqab': 'Ulanqab, Inner Mongolia, China',
  'Anthropic Barber Lake': 'Colorado City, Texas, USA',
  'Huawei Horinger': 'Horinger County, Inner Mongolia, China',
  'Huawei Wuhu': 'Wuhu, Anhui, China',
  'Alibaba Zhangbei': 'Zhangbei County, Hebei, China',
  'Goodnight': 'Claude, Texas, USA',
  'Amazon Madison Mega Site': 'Canton, Mississippi, USA',
  'AWS New Albany': 'New Albany, Ohio, USA',
  'Stream Phoenix': 'Goodyear, Arizona, USA',
  'Start Campus Sines Data Campus': 'Sines, Portugal',
  'Bridge Data Centres MY06': 'Sedenak Tech Park, Kulai, Johor, Malaysia',
  'OpenAI Stargate UAE': 'Abu Dhabi, United Arab Emirates',
  'Google Waltham Cross': 'Waltham Cross, United Kingdom',
  'Meta Cheyenne': 'Cheyenne, Wyoming, USA',
  'Meta Hyperion': 'Holly Ridge, Louisiana, USA',
  'OpenAI Stargate Shackelford': 'Shackelford County, Texas, USA',
  'EcoDataCenter 2': 'Borlänge, Sweden',
  'CoreWeave Norway': 'Øvrebø, Norway',
  'Nscale Keflavik': 'Reykjanesbær, Iceland',
  'Meta Huntsville': 'Huntsville, Alabama, USA',
  'Meta Montgomery': 'Montgomery, Alabama, USA',
}
def query(q):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': 1})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)
    time.sleep(1.2)
    return res[0] if res else None
rows = list(csv.DictReader(open(os.path.join(HERE, 'epoch', 'data_centers.csv'), encoding='utf8')))
out = json.load(open(CACHE, encoding='utf8')) if os.path.exists(CACHE) else {}
for r in rows:
    name, addr, country = r['Name'], (r['Address'] or '').strip(), r['Country']
    if name in out and out[name]['lat'] is not None:
        continue
    tries = []
    if name in FALLBACK: tries.append(FALLBACK[name])
    if addr:
        tries.append(f"{addr}, {country}")
        parts = [p.strip() for p in addr.split(',') if p.strip()]
        if len(parts) >= 2: tries.append(', '.join(parts[-2:]) + f", {country}")
    hit = None
    for q in tries:
        try:
            hit = query(q)
        except Exception as e:
            print('ERR', name, e); time.sleep(2)
        if hit: break
    out[name] = {'q': q if hit else None, 'lat': float(hit['lat']) if hit else None, 'lng': float(hit['lon']) if hit else None, 'display': hit['display_name'][:90] if hit else None}
    print(name, '->', out[name]['display'])
json.dump(out, open(CACHE, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
