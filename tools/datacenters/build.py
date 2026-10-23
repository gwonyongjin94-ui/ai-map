# Builds public/data/datacenters.js from Epoch AI's data center dataset (CC BY 4.0) plus a few
# hand-checked sites (MANUAL below).
#
#   python3 tools/datacenters/build.py            # downloads the Epoch data if it isn't here yet
#   python3 tools/datacenters/build.py --refresh  # downloads it again (Epoch updates often)
#
# New Epoch sites need coordinates first: python3 tools/datacenters/geocode.py (adds only the
# missing ones to geocoded.json). The output overwrites public/data/datacenters.js, so make lasting
# edits here (NAME_KO, DESC, MANUAL, GEO_FIX), not in the generated file.
import csv, json, collections, re, os, sys, io, zipfile, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
EPOCH_DIR = os.path.join(HERE, 'epoch')
OUT = os.path.join(HERE, '..', '..', 'public', 'data', 'datacenters.js')
TODAY = datetime.date.today().isoformat()

def fetch_epoch(force=False):
    if os.path.exists(os.path.join(EPOCH_DIR, 'data_centers.csv')) and not force:
        return
    req = urllib.request.Request('https://epoch.ai/data/data_centers/data_centers.zip', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        zipfile.ZipFile(io.BytesIO(r.read())).extractall(EPOCH_DIR)

fetch_epoch('--refresh' in sys.argv)

dcs = list(csv.DictReader(open(os.path.join(EPOCH_DIR, 'data_centers.csv'), encoding='utf8')))
tl = collections.defaultdict(list)
for r in csv.DictReader(open(os.path.join(EPOCH_DIR, 'data_center_timelines.csv'), encoding='utf8')):
    tl[r['Data center']].append(r)
geo = json.load(open(os.path.join(HERE, 'geocoded.json'), encoding='utf8'))

GEO_FIX = {
    'Meta Rosemount': (44.7394, -93.1258, 'Rosemount, MN'),
    'Meta Jeffersonville': (38.2776, -85.7372, 'Jeffersonville, IN'),
    'Meta Kuna': (43.4918, -116.4201, 'Kuna, ID'),
    'Google Papillion': (41.1544, -96.0422, 'Papillion, NE'),
    'Meta Sarpy': (41.0822, -96.1328, 'Springfield, NE'),
    'Meta Aiken': (33.7404, -81.8418, 'Trenton, SC'),
    'CoreWeave Muskogee OK': (35.7479, -95.3697, 'Muskogee, OK'),
}
PLACE_FALLBACK = {
    'Google Mesa': 'Mesa, AZ', 'OpenAI Stargate Michigan': 'Saline Township, MI', 'OpenAI Stargate Milam': 'Milam County, TX',
    'OpenAI Stargate New Mexico': 'Doña Ana County, NM', 'OpenAI Stargate Wisconsin': 'Port Washington, WI',
    'DayOne Nusajaya': 'Iskandar Puteri, Johor', 'Google Storey County': 'Storey County, NV', 'Google Kansas City East': 'Kansas City, MO',
    'Microsoft Narvik Norway': 'Narvik', 'Nebius Mantsala': 'Mäntsälä', 'Southgate Melbourne': 'Melbourne', 'Oracle Batam': 'Batam',
    'Envision Galaxy Ulanqab': 'Ulanqab, Inner Mongolia', 'VNET Bayin Ulanqab': 'Ulanqab, Inner Mongolia',
    'Anthropic Barber Lake': 'Colorado City, TX', 'Huawei Horinger': 'Horinger, Inner Mongolia', 'Huawei Wuhu': 'Wuhu, Anhui',
    'Alibaba Zhangbei': 'Zhangbei, Hebei', 'Goodnight': 'Claude, TX', 'Amazon Madison Mega Site': 'Madison County, MS',
    'OpenAI Stargate UAE': 'Abu Dhabi', 'OpenAI Stargate Shackelford': 'Shackelford County, TX', 'OpenAI Stargate Lordstown': 'Lordstown, OH',
    'Meta Hyperion': 'Richland Parish, LA', 'EcoDataCenter 2': 'Borlänge', 'CoreWeave Norway': 'Vennesla', 'Nscale Keflavik': 'Reykjanesbær',
    'Start Campus Sines Data Campus': 'Sines', 'Bridge Data Centres MY06': 'Kulai, Johor', 'DayOne Kempas': 'Johor Bahru',
    'Google Waltham Cross': 'Waltham Cross', 'Meta Cheyenne': 'Cheyenne, WY', 'Stream Phoenix': 'Goodyear, AZ',
    'AWS New Albany': 'New Albany, OH', 'Meta Huntsville': 'Huntsville, AL', 'Meta Montgomery': 'Montgomery, AL',
}
COUNTRY = {'United States': 'US', 'Malaysia': 'MY', 'China': 'CN', 'United Kingdom': 'GB', 'Portugal': 'PT', 'Finland': 'FI',
           'Indonesia': 'ID', 'Norway': 'NO', 'Australia': 'AU', 'Sweden': 'SE', 'Iceland': 'IS', 'United Arab Emirates': 'AE'}
COMPANY = {'SpaceXAI': 'spacex-xai', 'Amazon': 'amazon', 'Microsoft': 'microsoft', 'Meta': 'meta', 'Google': 'alphabet',
           'Google DeepMind': 'google-deepmind', 'Oracle': 'oracle', 'CoreWeave': 'coreweave', 'Coreweave': 'coreweave',
           'Softbank': 'softbank', 'SoftBank': 'softbank', 'G42': 'g42', 'Core42': 'g42', 'Huawei': 'huawei', 'Alibaba': 'alibaba',
           'ByteDance': 'bytedance', 'Tencent': 'tencent', 'Mistral AI': 'mistral', 'OpenAI': 'openai', 'Anthropic': 'anthropic',
           'Cursor': 'cursor'}
NAME_KO = {
    'Colossus 2': '콜로서스 2', 'Colossus 1': '콜로서스 1', 'Anthropic-Amazon New Carlisle': '프로젝트 레이니어 (뉴칼라일)',
    'OpenAI Stargate Abilene': '스타게이트 애빌린', 'Microsoft Fairwater Wisconsin': '페어워터 위스콘신',
    'Microsoft Fairwater Atlanta': '페어워터 애틀랜타', 'Meta Prometheus': '메타 프로메테우스', 'Meta Hyperion': '메타 하이페리온',
    'OpenAI Stargate New Mexico': '스타게이트 뉴멕시코', 'OpenAI Stargate Shackelford': '스타게이트 섀클퍼드',
    'OpenAI Stargate Milam': '스타게이트 마일럼', 'OpenAI Stargate Michigan': '스타게이트 미시간',
    'OpenAI Stargate Wisconsin': '스타게이트 위스콘신', 'OpenAI Stargate Lordstown': '스타게이트 로즈타운',
    'OpenAI Stargate UAE': '스타게이트 UAE', 'Crusoe Abilene Expansion': '크루소 애빌린 확장', 'Coreweave Helios': '코어위브 헬리오스',
    'EcoDataCenter 2': '미스트랄 보를렝에 (스웨덴)', 'Anthropic Lake Mariner': '앤트로픽 레이크 매리너',
    'Anthropic Barber Lake': '앤트로픽 바버 레이크', 'Microsoft Narvik Norway': '나르비크 (노르웨이)',
    'DayOne Nusajaya': 'DayOne 누사자야', 'DayOne Kempas': 'DayOne 켐파스', 'Bridge Data Centres MY06': '브리지 MY06 (조호르)',
}
DESC = {
    'Colossus 2': 'xAI(현 스페이스X)의 두 번째 멤피스 슈퍼컴퓨터. 2026년 6월부터 앤트로픽도 이곳 컴퓨팅을 쓴다.',
    'Colossus 1': 'xAI가 2024년 몇 달 만에 세운 첫 슈퍼컴퓨터. 지금은 앤트로픽이 쓰는 것으로 파악된다.',
    'Anthropic-Amazon New Carlisle': 'AWS가 앤트로픽용으로 지은 트레이니엄 칩 캠퍼스(프로젝트 레이니어). 현재 가동 전력 기준 세계 최대급.',
    'OpenAI Stargate Abilene': '오라클·크루소가 오픈AI용으로 지은 첫 스타게이트 캠퍼스. 8개 건물을 2026년 말까지 차례로 가동한다.',
    'Microsoft Fairwater Wisconsin': '마이크로소프트가 가장 강력한 AI 데이터센터로 소개한 캠퍼스. 2028년까지 크게 증설할 예정이다.',
    'Microsoft Fairwater Atlanta': '위스콘신 페어워터와 전용망(AI WAN)으로 묶여 하나처럼 쓰는 두 번째 캠퍼스.',
    'Meta Prometheus': '메타의 첫 기가와트급 AI 클러스터. 텐트형 건물과 자체 가스 발전소로 빠르게 늘리고 있다.',
    'Meta Hyperion': '메타가 루이지애나에 수년에 걸쳐 짓는 초대형 캠퍼스.',
    'OpenAI Stargate UAE': '아부다비 대형 AI 캠퍼스 안의 스타게이트 부지. G42가 짓고 오픈AI가 쓴다.',
    'Crusoe Abilene Expansion': '스타게이트 애빌린 옆 부지. 오픈AI가 확장을 접은 뒤 마이크로소프트가 쓰기로 했다.',
    'EcoDataCenter 2': '미스트랄이 에코데이터센터와 손잡고 스웨덴에 짓는 캠퍼스. 2027년 가동 예정.',
    'OpenAI Stargate Milam': '소프트뱅크 자회사 SB에너지가 짓는 스타게이트 부지.',
    'OpenAI Stargate Lordstown': '소프트뱅크·폭스콘의 AI 서버 공장 부지에 함께 계획된 스타게이트 시설.',
    'DayOne Nusajaya': '싱가포르와 맞닿은 말레이시아 조호르는 아시아에서 AI 데이터센터가 가장 빨리 늘어나는 지역이다.',
}
EPOCH_SOURCE = {'title': "Epoch AI, 'AI data centers' (CC BY 4.0)", 'url': 'https://epoch.ai/data/ai-data-centers'}

def num(x):
    try:
        return float(x)
    except Exception:
        return 0.0

def names(field):
    """'Amazon #confident, Anthropic #speculative' -> [('Amazon', 'confident')]: speculative ones dropped."""
    out = []
    for part in (field or '').split(','):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'(.+?)\s*#(\w+)$', part)
        name, conf = (m.group(1).strip(), m.group(2)) if m else (part, 'confident')
        if conf != 'speculative':
            out.append((name, conf))
    return out

LINK_RE = re.compile(r'\[([^\]]+)\]\((https?://[^)\s]+)\)')

def sources_of(text):
    """Epoch's 'Selected Sources' markdown list -> [{title, url, note}] (note = the rest of the line)."""
    out = []
    for line in (text or '').splitlines():
        m = LINK_RE.search(line)
        if not m:
            continue
        note = LINK_RE.sub(lambda x: x.group(1), line[m.end():]).strip().strip('-–:,.').strip()
        out.append({k: v for k, v in {'title': m.group(1).strip(), 'url': m.group(2), 'note': note[:240]}.items() if v})
    return out[:8]

def clip(text, n=360):
    return text if len(text) <= n else text[: n - 1].rsplit(' ', 1)[0] + '…'

def plain(note):
    """Markdown links in Epoch's construction notes -> their text."""
    return re.sub(r'\s+', ' ', LINK_RE.sub(lambda x: x.group(1), note or '')).strip()

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def place_of(name, addr):
    if name in GEO_FIX:
        return GEO_FIX[name][2]
    if name in PLACE_FALLBACK:
        return PLACE_FALLBACK[name]
    parts = [p.strip() for p in addr.split(',') if p.strip()]
    for i in range(len(parts) - 1, -1, -1):
        m = re.match(r'([A-Z]{2})\s+\d{5}', parts[i])
        if m and i > 0:
            return f'{parts[i - 1]}, {m.group(1)}'
    return parts[-2] if len(parts) >= 2 else (parts[0] if parts else '')

def month(d):
    return d[:7] if d else None

items = []
for d in dcs:
    name = d['Name']
    rows = sorted(tl.get(name, []), key=lambda r: r['Date'])
    past = [r for r in rows if r['Date'] <= TODAY]
    now = round(num(past[-1]['Power (MW)'])) if past else 0
    mx = round(max([num(r['Power (MW)']) for r in rows] or [0]))
    mx_at = next((r['Date'] for r in rows if round(num(r['Power (MW)'])) >= mx and mx > 0), '')
    first = next((r['Date'] for r in rows if num(r['Power (MW)']) > 0), '')
    if now == 0:
        status = 'construction' if past else 'planned'
    elif mx > now * 1.05:
        status = 'partial'
    else:
        status = 'operating'
    owner_names = names(d['Owner'])
    user_names = names(d['Users'])
    owner_hit = next(((COMPANY[n], c) for n, c in owner_names if n in COMPANY), (None, None))
    owner, owner_conf = owner_hit
    owner_other = [n for n, c in owner_names if n not in COMPANY]
    if not owner and owner_names:
        owner_conf = owner_names[0][1]
    users, users_likely = [], []
    for n, c in user_names:
        if n in COMPANY:
            target = users if c == 'confident' else users_likely
            if COMPANY[n] not in users and COMPANY[n] not in users_likely:
                target.append(COMPANY[n])
    user_other = [n for n, c in user_names if n not in COMPANY and c == 'confident']
    user_other_likely = [n for n, c in user_names if n not in COMPANY and c != 'confident']
    # The site is "confirmed" when Epoch is confident who runs or uses it and buildings are visibly
    # there (running, or under construction) — not a plan on paper or an unnamed operator.
    certain = (owner_conf == 'confident' or bool(users) or bool(user_other)) and status != 'planned'
    log = [{'date': r['Date'], 'mw': round(num(r['Power (MW)'])), 'note': clip(plain(r['Construction status']))} for r in past[-3:] if r['Construction status']]
    nxt = next((r for r in rows if r['Date'] > TODAY), None)
    if nxt and nxt['Construction status']:
        log.append({'date': nxt['Date'], 'mw': round(num(nxt['Power (MW)'])), 'note': clip(plain(nxt['Construction status'])), 'future': True})
    if name in GEO_FIX:
        lat, lng = GEO_FIX[name][:2]
    else:
        g = geo.get(name)
        if not g or g['lat'] is None:
            print(f'skipped (no coordinates, run geocode.py): {name}')
            continue
        lat, lng = g['lat'], g['lng']
    chips = d['Current chip types'] or d['All chip types']
    item = {
        'id': slug(name), 'name': name, 'nameKo': NAME_KO.get(name), 'lat': round(lat, 4), 'lng': round(lng, 4),
        'place': place_of(name, d['Address'] or ''), 'country': COUNTRY.get(d['Country'], ''),
        'owner': owner, 'ownerName': ', '.join(owner_other) or None, 'ownerConf': owner_conf,
        'users': users, 'usersLikely': users_likely, 'userNames': user_other, 'userNamesLikely': user_other_likely,
        'certain': certain, 'basis': 'estimate',
        'nowMW': now, 'maxMW': mx, 'maxAt': month(mx_at) if mx > now else None, 'firstAt': month(first), 'status': status,
        'h100e': round(num(d['Current H100 equivalents'])) or None,
        'chips': chips.replace(',', ', ') or None,
        'energy': d['Energy companies'].replace(',', ', ') or None,
        'project': re.sub(r'\s*#\w+', '', d['Project']).strip() or None,
        'desc': DESC.get(name), 'sources': sources_of(d['Selected Sources']), 'log': log, 'epoch': True,
    }
    items.append(item)

MANUAL = [
    {'id': 'sk-ai-dc-ulsan', 'name': 'SK AI Data Center Ulsan', 'nameKo': 'SK AI 데이터센터 울산', 'lat': 35.4867, 'lng': 129.3678,
     'place': '울산 미포국가산단', 'country': 'KR', 'owner': None, 'ownerName': 'SK텔레콤·SK에코플랜트', 'users': ['amazon'], 'userNames': [],
     'nowMW': 0, 'maxMW': 103, 'maxAt': '2029-02', 'firstAt': '2027-11', 'status': 'construction',
     'energy': 'SK멀티유틸리티 LNG 열병합 발전', 'desc': 'SK와 AWS가 약 7조 원을 들여 짓는 비수도권 최대 AI 데이터센터. 2025년 8월 기공, 2027년 11월 41MW로 1단계 가동, 장기적으로 1GW까지 넓히는 구상이다.',
     'basis': 'announced', 'certain': True,
     'sources': [{'title': "'SK AI 데이터센터 울산' 기공식 개최 (SK텔레콤 뉴스룸)", 'url': 'https://news.sktelecom.com/214708', 'note': '2025년 8월 29일 기공식, SK멀티유틸리티 LNG 발전 전력 사용'},
                 {'title': 'SK·AWS, 울산에 AI센터 착공…비수도권 최대 (한국경제)', 'url': 'https://www.hankyung.com/article/202508290952i', 'note': '총 7조 원, 1단계 41MW(2027년 11월) → 103MW(2029년 2월)'},
                 {'title': "AWS-SK, 울산에 '7조 규모' AI 데이터센터 구축 (SBS)", 'url': 'https://news.sbs.co.kr/news/endPage.do?news_id=N1008141630'}]},
    {'id': 'naver-gak-sejong', 'name': 'NAVER GAK Sejong', 'nameKo': '네이버 각 세종', 'lat': 36.4985, 'lng': 127.3290,
     'place': '세종시 집현동', 'country': 'KR', 'owner': 'naver', 'ownerName': None, 'users': ['naver'], 'userNames': [],
     'nowMW': None, 'maxMW': 270, 'maxAt': None, 'firstAt': '2023-11', 'status': 'partial',
     'desc': '네이버의 두 번째 자체 데이터센터. 2023년 11월 문을 열었고 수전 용량은 첫 센터(각 춘천)의 6.7배인 270MW다. 하이퍼클로바X 학습·서비스에 쓴다.',
     'basis': 'reported', 'certain': True,
     'sources': [{'title': '네이버 데이터센터 각 세종 (일간스포츠)', 'url': 'https://isplus.com/article/view/isp202310280009', 'note': '2023년 11월 개관, 수전 용량 270MW(각 춘천의 6.7배)'}]},
    {'id': 'kakao-dc-ansan', 'name': 'Kakao Data Center Ansan', 'nameKo': '카카오 데이터센터 안산', 'lat': 37.2965, 'lng': 126.8352,
     'place': '안산 한양대 ERICA 캠퍼스', 'country': 'KR', 'owner': 'kakao', 'ownerName': None, 'users': ['kakao'], 'userNames': [],
     'nowMW': None, 'maxMW': 40, 'maxAt': None, 'firstAt': '2023-09', 'status': 'operating',
     'desc': '2022년 판교 데이터센터 화재 뒤 문을 연 카카오의 첫 자체 데이터센터. 서버 10만 대 이상을 둘 수 있는 하이퍼스케일 센터로, 전력 용량은 약 40MW로 보도됐다.',
     'basis': 'reported', 'certain': True,
     'sources': [{'title': "카카오, 첫 자체 데이터센터 '카카오 데이터센터 안산' 준공 (카카오 보도자료)", 'url': 'https://www.kakaocorp.com/page/detail/10638', 'note': '2023년 9월 26일 준공, 서버 12만 대·연면적 4만 7,378㎡'},
                 {'title': "'1호' 안산 데이터센터에 12만대 서버 넣어 내년 완공 (뉴시스, 2022)", 'url': 'https://www.newsis.com/view/NISX20221019_0002054191', 'note': '전력 용량 약 40MW (준공 전 보도)'},
                 {'title': '카카오, 안산에 자체 데이터센터 건립한다 (바이라인네트워크, 2020)', 'url': 'https://byline.network/2020/09/7-78/'}]},
    {'id': 'stargate-korea-pohang', 'name': 'Stargate Korea Pohang (planned)', 'nameKo': '스타게이트 코리아 포항 (계획)', 'lat': 36.0190, 'lng': 129.3435,
     'place': '경북 포항 (부지 미확정)', 'country': 'KR', 'owner': 'samsung', 'ownerName': None, 'users': ['openai'], 'userNames': [],
     'nowMW': 0, 'maxMW': 20, 'maxAt': None, 'firstAt': None, 'status': 'planned', 'project': 'Stargate',
     'desc': '2025년 10월 오픈AI·삼성 협력 때 거론된 초기 20MW 데이터센터. 2026년 가을 기준 삼성SDS는 "확정된 것이 없다"고 밝혔다.',
     'basis': 'reported', 'certain': False,
     'sources': [{'title': "포항·전남에 '오픈AI 데이터센터'가 선다 (베타뉴스, 2026년 5월)", 'url': 'https://www.betanews.net/article/view/beta202605260016', 'note': '삼성전자와 포항, 초기 20MW'},
                 {'title': "오픈AI 주도 '스타게이트 코리아' 1년째 제자리 (중앙일보)", 'url': 'https://www.koreajoongangdaily.com/business/opeunai-judo-seutageiteu-kolia-peulojegteu-1nyeonjjae-jejalisamseongskdo-hwagjeongdoen-geos-eobsda/12860695', 'note': '삼성SDS "확정된 것 없다"'}]},
    {'id': 'stargate-korea-jeonnam', 'name': 'Stargate Korea Jeonnam (planned)', 'nameKo': '스타게이트 코리아 전남 (계획)', 'lat': 34.8679, 'lng': 126.9910,
     'place': '전라남도 (부지 미공개)', 'country': 'KR', 'owner': None, 'ownerName': 'SK', 'users': ['openai'], 'userNames': [],
     'nowMW': 0, 'maxMW': 20, 'maxAt': None, 'firstAt': None, 'status': 'planned', 'project': 'Stargate',
     'desc': '오픈AI·SK가 함께 짓기로 한 초기 20MW 데이터센터 계획. 지도 위치는 전라남도 중심이며 실제 부지는 공개되지 않았다. 2026년 가을 기준 진척이 없다.',
     'basis': 'reported', 'certain': False,
     'sources': [{'title': "포항·전남에 '오픈AI 데이터센터'가 선다 (베타뉴스, 2026년 5월)", 'url': 'https://www.betanews.net/article/view/beta202605260016', 'note': 'SK하이닉스와 전남, 초기 20MW'},
                 {'title': "오픈AI 주도 '스타게이트 코리아' 1년째 제자리 (중앙일보)", 'url': 'https://www.koreajoongangdaily.com/business/opeunai-judo-seutageiteu-kolia-peulojegteu-1nyeonjjae-jejalisamseongskdo-hwagjeongdoen-geos-eobsda/12860695', 'note': 'SK텔레콤 "MOU 이후 진전 없다"'}]},
    {'id': 'softbank-sakai', 'name': 'SoftBank Sakai AI Data Center', 'nameKo': '소프트뱅크 사카이', 'lat': 34.5987, 'lng': 135.4415,
     'place': '오사카 사카이 (옛 샤프 LCD 공장)', 'country': 'JP', 'owner': 'softbank', 'ownerName': None, 'users': ['softbank', 'openai'], 'userNames': [],
     'nowMW': None, 'maxMW': 150, 'maxAt': None, 'firstAt': '2026', 'status': 'construction',
     'desc': '소프트뱅크가 약 1,000억 엔에 사들인 샤프 액정 공장을 AI 데이터센터로 바꾼다. 150MW로 시작해 2028 회계연도에 250MW로 늘릴 계획이며, 오픈AI와의 일본 합작에도 쓴다. 2026년 가동 목표(가동 여부 미확인).',
     'basis': 'announced', 'certain': True,
     'sources': [{'title': "Japan's SoftBank plans 150MW data center at LCD panel site in Osaka (DCD)", 'url': 'https://www.datacenterdynamics.com/en/news/japans-softbank-plans-150mw-8-million-sq-ft-data-center-at-lcd-panel-manufacturing-site-in-osaka/', 'note': '150MW로 시작, 2026년 가동 목표'},
                 {'title': 'SoftBank, OpenAI to build AI data center in defunct Sharp LCD factory (W.Media)', 'url': 'https://w.media/softbank-openai-to-build-ai-data-center-in-defunct-sharp-lcd-factory/', 'note': '약 1,000억 엔에 부지 인수, 2028 회계연도 250MW'}]},
    {'id': 'google-visakhapatnam', 'name': 'Google Visakhapatnam AI Hub', 'nameKo': '구글 비사카파트남 AI 허브', 'lat': 17.7900, 'lng': 83.2700,
     'place': '인도 안드라프라데시 비사카파트남', 'country': 'IN', 'owner': 'alphabet', 'ownerName': None, 'users': [], 'userNames': [],
     'nowMW': 0, 'maxMW': 1000, 'maxAt': '2028-07', 'firstAt': None, 'status': 'construction',
     'desc': '구글이 150억 달러를 들이는 해외 최대 AI 인프라. 2026년 4월 착공, 아다니·에어텔과 함께 세 캠퍼스로 짓고 2028년 7월 가동이 목표다.',
     'basis': 'reported', 'certain': True,
     'sources': [{'title': "Google's ₹1.35 lakh crore AI data centre in Visakhapatnam (Drishti IAS)", 'url': 'https://www.drishtiias.com/state-pcs-current-affairs/googles-1-35-lakh-crore-ai-data-centre-in-visakhapatnam/print_manually', 'note': '2026년 4월 28일 착공, 1GW 규모로 보도'},
                 {'title': 'Google confirms $15bn data center project in Andhra Pradesh, India (DCD)', 'url': 'https://www.datacenterdynamics.com/en/news/google-confirms-15bn-data-center-project-in-andhra-pradesh-india/', 'note': '구글은 150억 달러 투자를 확인했지만 용량은 밝히지 않았다'},
                 {'title': "Inside Google's largest overseas AI infrastructure project (Technology Magazine)", 'url': 'https://technologymagazine.com/news/inside-googles-largest-overseas-ai-infrastructure-project', 'note': '아다니코넥스·에어텔 넥스트라가 건설, 2028년 7월 가동 목표'}]},
    {'id': 'google-west-memphis', 'name': 'Google West Memphis', 'nameKo': '구글 웨스트멤피스', 'lat': 35.1080, 'lng': -90.2120,
     'place': 'West Memphis, AR', 'country': 'US', 'owner': 'alphabet', 'ownerName': None, 'users': ['alphabet'], 'userNames': [],
     'nowMW': 0, 'maxMW': None, 'maxAt': None, 'firstAt': '2027', 'status': 'construction', 'energy': 'Entergy Arkansas',
     'desc': '구글의 첫 아칸소 데이터센터. 2025년 10월 미시시피강 건너 멤피스 맞은편 약 1,100에이커 부지에서 착공했고, 2027년까지 40억 달러를 들인다. 공사 기간이 18~24개월로 보도돼 2027년 가동이 예상된다. 전력 규모는 공개되지 않았다. 엔터지 아칸소가 전기를 대며, 2026년 10월 구글이 더 많은 전력을 더 빨리 쓰겠다며 2단계 계약(태양광 440MW 구매·배터리·변전소 증설, 약 6억 달러 구글 부담)을 주 공공서비스위원회에 신청했다.',
     'basis': 'reported', 'certain': True,
     'sources': [{'title': 'Google is investing in Arkansas with a new data center (Google 블로그, 2025-10-02)', 'url': 'https://blog.google/company-news/inside-google/company-announcements/google-american-innovation-arkansas/', 'note': '첫 아칸소 데이터센터, 2027년까지 40억 달러, 엔터지와 새 600MW 태양광'},
                 {'title': 'Google hiring for new West Memphis data center (Action News 5, 2026-02-26)', 'url': 'https://www.actionnews5.com/2026/02/26/google-hiring-new-west-memphis-data-center/', 'note': '2025년 10월 착공, 1,100에이커, 공사 18~24개월, 상시 일자리 약 300개'},
                 {'title': 'Entergy Arkansas, Google expansion to bring additional energy resources (T&D World, 2026-10-20)', 'url': 'https://www.tdworld.com/distributed-energy-resources/news/55413318/entergy-arkansas-google-expansion-to-bring-additional-energy-resources-to-arkansas-grid', 'note': '2단계: 빅아일랜드 태양광 440MW, 배터리 1,400MWh, 갈렛 변전소 증설·230kV 송전선 2개 — 규제 승인 대기'}]},
    {'id': 'mistral-bruyeres-le-chatel', 'name': 'Mistral Compute Bruyères-le-Châtel', 'nameKo': '미스트랄 브뤼에르르샤텔', 'lat': 48.5900, 'lng': 2.1900,
     'place': '프랑스 에손 브뤼에르르샤텔', 'country': 'FR', 'owner': None, 'ownerName': 'Eclairion', 'users': ['mistral'], 'userNames': [],
     'nowMW': None, 'maxMW': 44, 'maxAt': None, 'firstAt': '2026-06', 'status': 'construction', 'chips': 'GB300 13,800개',
     'desc': '미스트랄이 첫 차입금 8.3억 달러로 엔비디아 GB300 1만 3,800개를 들이는 파리 근교 데이터센터. 2026년 여름 가동 예정이었다(가동 여부 미확인).',
     'basis': 'announced', 'certain': True,
     'sources': [{'title': 'Mistral AI secures $830 million in debt to build Paris data center (Unite.AI)', 'url': 'https://www.unite.ai/mistral-ai-secures-830-million-in-debt-to-build-paris-data-center/', 'note': 'GB300 1만 3,800개, 약 44MW, 운영 Eclairion'},
                 {'title': 'Mistral AI sécurise 830 millions de dollars en dette (Maddyness)', 'url': 'https://www.maddyness.com/2026/03/30/mistral-ai-securise-830-millions-de-dollars-en-dette-pour-exploiter-son-premier-centre-de-donnees-en-france/', 'note': '2026년 여름 전 가동 목표'}]},
]
for m in MANUAL:
    m['ownerConf'] = 'confident' if (m.get('owner') or m.get('ownerName')) and m['certain'] else 'likely'
    m.setdefault('h100e', None)
    m.setdefault('chips', None)
    m.setdefault('energy', None)
    m.setdefault('project', None)
    m['epoch'] = False
items += MANUAL
items.sort(key=lambda x: -(x['maxMW'] or 0))

def clean(o):
    return {k: v for k, v in o.items() if v not in (None, [], '')}

print('confirmed', sum(1 for i in items if i['certain']), 'of', len(items))

lines = ',\n'.join('  ' + json.dumps(clean(i), ensure_ascii=False) for i in items)
as_of = f'{TODAY[:4]}년 {int(TODAY[5:7])}월'
header = """// AI 데이터센터 — 정리 기준: {as_of}. tools/datacenters/build.py가 만든 파일이다.
//
// 대부분은 Epoch AI의 'AI data centers' 데이터(CC BY 4.0, https://epoch.ai/data/ai-data-centers)를 옮겼다.
// 위성 사진·인허가·공시로 건물마다 가동 시점과 전력을 추정한 값이며, 미래 값은 Epoch의 예상이다.
// 한국·일본·인도·프랑스·미국 몇 곳(epoch: false)은 공식 발표·공개 보도로 보탰다. 위치는 Epoch 주소를 OpenStreetMap
// Nominatim으로 찾은 좌표(주소가 없으면 도시 단위)다. 고칠 내용은 build.py에 적고 다시 만든다.
//
// nowMW:   2026년 10월 현재 시설 전체 전력(MW, 냉각 포함). null이면 공개된 값 없음
// maxMW:   계획 최대 전력 · maxAt: 그 전력에 이르는 예상 시점 · firstAt: 처음 가동한(할) 때
// status:  AI_DATACENTER_STATUS 중 하나
// owner:   짓거나 운영하는 기업, users: 컴퓨팅을 쓰는 기업 (companies.js의 id, 지도에 없으면 ownerName·userNames)
//          Epoch가 '확실(confident)'로 본 곳은 users, '유력(likely)'은 usersLikely. '추측'은 넣지 않았다
// certain: 운영하거나 쓰는 기업 중 하나라도 확실하고, 건물이 실제로 있는(가동·공사 중) 곳.
//          아니면(운영사 미공개·유력뿐·계획만 발표) '전체 보기'에서만 흐리게 보인다
// basis:   숫자의 근거 — estimate(Epoch가 위성·서류로 계산한 추정), announced(회사 발표), reported(언론 보도)
// sources: 근거 자료, log: Epoch의 날짜별 확인 메모(영어 원문, future는 예상)
// h100e:   현재 컴퓨팅을 H100 개수로 환산한 값 (Epoch)
window.AI_DATACENTERS_AS_OF = '{as_of}';

window.AI_DATACENTER_STATUS = {
  operating: { label: '가동' },
  partial: { label: '일부 가동·증설 중' },
  construction: { label: '건설 중' },
  planned: { label: '계획' },
};

window.AI_DATACENTERS = [
"""
open(OUT, 'w', encoding='utf8').write(header.replace('{as_of}', as_of) + lines + '\n];\n')
print(len(items), 'written')
by = collections.Counter(i['status'] for i in items)
print(by)
print('now GW', sum(i['nowMW'] or 0 for i in items) / 1000, 'max GW', sum(i['maxMW'] or 0 for i in items) / 1000)
for i in items[:12]:
    print(i['maxMW'], i['nowMW'], i['status'], i.get('nameKo') or i['name'], i['place'], i['owner'], i['users'])
