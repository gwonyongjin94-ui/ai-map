#!/usr/bin/env python3
# Builds public/data/benchmarks.js from Epoch AI's 'Capabilities & benchmarking' data (CC BY 4.0).
#
#   python3 tools/benchmarks/build.py            # uses tools/benchmarks/epoch/ if it is there
#   python3 tools/benchmarks/build.py --refresh  # downloads it again (Epoch updates every few days)
#
# Per model and test it keeps the best score across the settings Epoch ran (e.g. reasoning effort
# "high" vs "max") and notes which one. Scores Epoch ran itself carry their standard error; the
# composite index (ECI) carries its 90% interval.
import csv, io, json, math, os, re, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EPOCH_DIR = os.path.join(ROOT, 'tools', 'benchmarks', 'epoch')
OUT = os.path.join(ROOT, 'public', 'data', 'benchmarks.js')
ZIP_URL = 'https://epoch.ai/data/benchmark_data.zip'


def fetch_epoch(refresh):
    if os.path.exists(os.path.join(EPOCH_DIR, 'model_metadata.csv')) and not refresh:
        return
    os.makedirs(EPOCH_DIR, exist_ok=True)
    req = urllib.request.Request(ZIP_URL, headers={'User-Agent': 'AIMap/0.2 (data build)'})
    data = urllib.request.urlopen(req, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            # flat CSVs plus the ECI folder; nothing outside EPOCH_DIR
            target = os.path.normpath(os.path.join(EPOCH_DIR, name))
            if not target.startswith(EPOCH_DIR + os.sep) or name.endswith('/'):
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as f:
                f.write(z.read(name))


fetch_epoch('--refresh' in sys.argv)


def rows(name):
    with open(os.path.join(EPOCH_DIR, name), newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


# Epoch organization names → companies.js ids. A model made by several organizations goes to the
# first one that is on the map.
ORG_TO_COMPANY = {
    'OpenAI': 'openai', 'Anthropic': 'anthropic', 'Google DeepMind': 'google-deepmind', 'Google': 'google-deepmind',
    'xAI': 'spacex-xai', 'Mistral AI': 'mistral', 'DeepSeek': 'deepseek', 'Moonshot': 'moonshot',
    'Z.ai (Zhipu AI)': 'zhipu', 'MiniMax': 'minimax', 'Thinking Machines': 'thinking-machines', 'Cohere': 'cohere',
    'Microsoft': 'microsoft', 'Microsoft Research': 'microsoft', 'Meta AI': 'meta', 'Alibaba': 'alibaba',
    'Nvidia': 'nvidia', 'Databricks': 'databricks', 'Salesforce': 'salesforce', 'Hugging Face': 'hugging-face',
    'Cerebras Systems': 'cerebras', 'Amazon': 'amazon', 'Baidu': 'baidu', 'Tencent': 'tencent', 'ByteDance': 'bytedance',
    'LG AI Research': 'lg-ai-research', 'Upstage': 'upstage', 'NAVER': 'naver', 'Sakana AI': 'sakana', 'Apple': 'apple',
    'Cursor': 'cursor', 'Kakao': 'kakao', 'SenseTime': 'sensetime', 'Huawei': 'huawei', 'Samsung': 'samsung',
}

# The tests shown, in chip order. `basis`: est = statistical estimate (faint), epoch = Epoch ran it
# under one setup, ext = the test maker's own leaderboard, collected by Epoch. Every sentence here
# is from the test's Epoch page or the maker's page linked in `sources`.
METRICS = [
    {'id': 'eci', 'file': None, 'name': 'Epoch Capabilities Index (ECI)', 'nameKo': '종합 능력 지수', 'chip': '종합',
     'kind': 'index', 'basis': 'est',
     'what': 'GPQA·FrontierMath·ARC-AGI처럼 50개 넘는 시험 점수를 한 눈금으로 합친 값이에요. 어려운 시험을 잘 풀수록 높아져요.',
     'read': '클로드 3.5 소닛을 130, GPT-5를 150으로 맞춘 눈금이라 숫자 자체보다 모델끼리의 차이가 의미 있어요. 최고점은 따로 없어요. 가는 선은 90% 신뢰구간으로, 구간이 겹치면 순위 차이를 확신할 수 없어요.',
     'caveat': '여러 시험 결과를 통계 모형으로 묶어 낸 추정치예요. 시험 결과가 4개 이상 있는 모델만 계산되고, 새 모델·시험이 들어오면 값이 조금씩 바뀌어요. 회사가 잘 나온 점수만 알리면 실제보다 높게 나올 수 있어요.',
     'sources': [{'title': 'Epoch Capabilities Index (Epoch AI)', 'url': 'https://epoch.ai/eci'}]},
    {'id': 'gpqa', 'file': 'gpqa_diamond.csv', 'col': 'Best score (across scorers)', 'se': 'stderr',
     'name': 'GPQA Diamond', 'nameKo': '박사급 과학 문제', 'chip': '과학', 'kind': 'pct', 'basis': 'epoch',
     'random': 0.25, 'human': {'value': 0.697, 'label': '박사급 전문가'},
     'what': '생물·화학·물리 박사(과정)들이 쓴 4지선다 198문제예요. 인터넷을 찾아봐도 비전문가는 풀기 어렵게 만들었어요.',
     'read': '찍으면 25%, OpenAI가 모은 박사급 전문가는 69.7%를 맞혔어요. Epoch이 모든 모델을 같은 방식으로 직접 시험한 점수예요. 가는 선은 95% 오차 범위예요.',
     'caveat': '최신 모델들이 95% 안팎에 몰려 있어 이제는 차이를 가리기 어려운 시험이에요. Epoch 자료는 이 시험의 사실상 최고점을 97%로 둬요.',
     'sources': [{'title': 'GPQA Diamond (Epoch AI)', 'url': 'https://epoch.ai/benchmarks/gpqa-diamond'}]},
    {'id': 'frontiermath', 'file': 'frontiermath_tiers_1_3_v2.csv', 'col': 'Best score (across scorers)', 'se': 'stderr',
     'name': 'FrontierMath (1~3단계)', 'nameKo': '연구 수준 수학', 'chip': '수학', 'kind': 'pct', 'basis': 'epoch',
     'what': '수학자들이 새로 만들고 공개하지 않은 어려운 문제 295개예요. 정수론·해석학·대수기하 같은 분야이고, 답을 파이썬 함수로 내야 해서 찍어 맞히기 어려워요.',
     'read': 'Epoch이 직접 시험한 점수예요. 문제 오류를 고친 2026년 6월 2판 기준이에요. 가는 선은 95% 오차 범위예요.',
     'caveat': 'OpenAI가 이 시험의 개발 자금을 댔고 문제 일부를 독점적으로 볼 수 있어요(Epoch 공개). OpenAI 모델의 점수를 볼 때 참고하세요.',
     'sources': [{'title': 'FrontierMath (Epoch AI)', 'url': 'https://epoch.ai/benchmarks/frontiermath'}]},
    {'id': 'frontiercode', 'file': 'frontiercode_external.csv', 'col': 'Main score', 'setting': 'Reasoning effort', 'tool': 'Harness',
     'name': 'FrontierCode', 'nameKo': '실전 코딩', 'chip': '코딩', 'kind': 'pct', 'basis': 'ext',
     'what': '오픈소스 저장소 관리자가 직접 낸 실제 개발 과제를 풀게 하고, "관리자가 이 코드를 실제로 받아 줄까?"를 기준으로 정확성·테스트·범위·코드 스타일까지 채점해요.',
     'read': 'AI 코딩 회사 Cognition(데빈 개발사)의 리더보드 점수를 Epoch이 모은 값이에요. 다섯 번 풀어 낸 평균이에요.',
     'caveat': '모델마다 쓰는 코딩 도구(하네스)가 달라서 모델 실력만 따로 잰 값은 아니에요. 시험을 만든 Cognition의 자체 모델도 들어 있어요.',
     'sources': [{'title': 'FrontierCode (Cognition)', 'url': 'https://cognition.com/frontiercode'}]},
    {'id': 'arc2', 'file': 'arc_agi_2_external.csv', 'col': 'Score',
     'name': 'ARC-AGI-2', 'nameKo': '처음 보는 퍼즐', 'chip': '퍼즐', 'kind': 'pct', 'basis': 'ext',
     'human': {'value': 0.60, 'label': '사람 평균'},
     'what': '색칠된 격자 예시 몇 개를 보고 규칙을 찾아 새 격자에 적용하는 퍼즐이에요. 외워서는 못 풀고 그 자리에서 추론해야 해요.',
     'read': 'ARC Prize 재단의 점수를 Epoch이 모은 값이에요. 400명 넘는 사람에게 시험했을 때 평균 60%였고, 모든 문제를 적어도 두 사람이 두 번 안에 풀었어요. 2025년 3월 공개 당시 AI는 한 자릿수였어요.',
     'caveat': '문제 하나에 쓴 계산 비용이 모델마다 크게 달라요. 이 화면은 점수만 비교해요.',
     'sources': [{'title': 'ARC-AGI-2 (Epoch AI)', 'url': 'https://epoch.ai/benchmarks/arc-agi-2'},
                 {'title': 'ARC Prize 리더보드', 'url': 'https://arcprize.org/leaderboard'}]},
    {'id': 'hle', 'file': 'hle_external.csv', 'col': 'Accuracy', 'se': 'Accuracy Standard Error',
     'name': "Humanity's Last Exam", 'nameKo': '인류의 마지막 시험', 'chip': '최고난도', 'kind': 'pct', 'basis': 'ext',
     'what': '50개국 1,000명 가까운 전문가가 100개 넘는 분야에서 낸 2,500문제예요. 당시 최고 AI들이 못 푼 문제만 골랐고, 대부분 답을 정확히 써야 해요.',
     'read': 'Epoch이 직접 시험하지 않고 외부에서 모은 점수예요. 가는 선은 95% 오차 범위예요.',
     'caveat': 'Epoch은 이 시험을 "결함 있는 시험(Flawed)"으로 분류하고 종합 지수 계산에서도 빼요. 뉴스에 자주 나오지만 순위를 너무 믿지는 마세요.',
     'sources': [{'title': "Humanity's Last Exam (Epoch AI)", 'url': 'https://epoch.ai/benchmarks/hle'}]},
    {'id': 'simpleqa', 'file': 'simpleqa_verified.csv', 'col': 'Best score (across scorers)', 'se': 'stderr',
     'name': 'SimpleQA Verified', 'nameKo': '사실 지식', 'chip': '사실', 'kind': 'pct', 'basis': 'epoch',
     'what': '정치·과학·예술·스포츠 등에서 정답이 하나뿐인 짧은 사실 질문 1,000개예요. Google이 OpenAI의 SimpleQA를 다듬어 만들었어요.',
     'read': 'Epoch이 직접 시험해 맞힌 비율이에요. 2026년 8월부터는 모르면 찍어 보라는 안내를 붙여 시험해요. 가는 선은 95% 오차 범위예요.',
     'caveat': '원래는 틀린 답과 "모르겠다"를 구분하는 시험인데, 이 점수는 맞힌 비율만 봐요(Google은 다른 방식으로 집계해요).',
     'sources': [{'title': 'SimpleQA Verified (Epoch AI)', 'url': 'https://epoch.ai/benchmarks/simpleqa-verified'}]},
]

# Epoch leaves the maker blank for a few models (their ECI rows then also say "API access" by
# default). These names say who made them and whether the weights were released; None = not sure.
NAME_MAKERS = [
    (r'granite-', 'IBM', True), (r'(code)?qwen', 'Alibaba', True), (r'deepseek', 'DeepSeek', True),
    (r'(chat)?glm', 'Z.ai (Zhipu AI)', True), (r'seed-oss', 'ByteDance', True), (r'codex-mini', 'OpenAI', False),
    (r'palm', 'Google', False), (r'internlm', 'Shanghai AI Laboratory', True), (r'yi-', '01.AI', True),
    (r'stablelm', 'Stability AI', True), (r'vicuna', 'LMSYS', True), (r'redpajama', 'Together', True),
    (r'open_llama', 'OpenLM Research', True), (r'tiny-recursion-model', 'Samsung', None),
]
# A setting written into the name ("glm-4.7-flash_none") is the same model.
SETTING_SUFFIX = re.compile(r'_(none|minimal|low|medium|high|xhigh|max|unknown)$')

meta = {r['model_version']: r for r in rows('model_metadata.csv') if r['model_version']}
eci_rows = rows(os.path.join('epoch_capabilities_index', 'eci_scores.csv'))

models = {}  # name key → record
merged = []  # (kept name, other spelling), printed so a wrong merge is easy to spot


def name_key(name):
    # "Qwen 3.7 Plus" and "Qwen3.7-Plus" are one model: compare letters and digits only.
    return re.sub(r'[^a-z0-9]', '', name.lower())


def org_of(org):
    names = [o.strip() for o in (org or '').split(',') if o.strip()]
    company = next((ORG_TO_COMPANY[n] for n in names if n in ORG_TO_COMPANY), None)
    return (names[0] if names else None), company


def model(name, org, date, access):
    name = SETTING_SUFFIX.sub('', name)
    m = models.get(name_key(name))
    if not m:
        org_name, company = org_of(org)
        m = models[name_key(name)] = {'name': name, 'org': org_name, 'company': company, 'date': date or None, 'access': access or None, 's': {}}
    else:
        if m['name'] != name and (m['name'], name) not in merged:
            merged.append((m['name'], name))
        if not m['org'] and org:
            m['org'], m['company'] = org_of(org)
        if not m['date'] and date:
            m['date'] = date
        if not m['access'] and access:
            m['access'] = access
    return m


r4 = lambda x: None if x is None else round(x, 4)

for r in eci_rows:
    v, lo, hi = num(r['eci']), num(r['eci_ci_low']), num(r['eci_ci_high'])
    if v is None:
        continue
    m = model(r['Model'], r['Organization'], r['date'], r['Model accessibility'])
    m['s']['eci'] = {'v': round(v, 1), 'lo': None if lo is None else round(lo, 1), 'hi': None if hi is None else round(hi, 1)}

for spec in METRICS:
    if not spec['file']:
        continue
    for r in rows(spec['file']):
        v = num(r.get(spec['col']))
        if v is None:
            continue
        version = r['Model version']
        md = meta.get(version) or {}
        name = md.get('model_group') or r.get('Name') or version
        if not name:
            continue
        m = model(name, r.get('Organization') or md.get('organization'), r.get('Release date') or md.get('date'), md.get('accessibility'))
        setting = (r.get(spec.get('setting', '')) or '').strip() or (version.rsplit('_', 1)[1] if '_' in version else '')
        if setting in ('unknown', 'none'):
            setting = ''
        se = num(r.get(spec.get('se', ''))) if spec.get('se') else None
        prev = m['s'].get(spec['id'])
        if prev and prev['v'] >= v:
            continue
        rec = {'v': r4(v)}
        if se is not None:
            rec['lo'], rec['hi'] = r4(max(0.0, v - 1.96 * se)), r4(min(1.0, v + 1.96 * se))
        if setting:
            rec['set'] = setting
        tool = (r.get(spec.get('tool', '')) or '').strip()
        if tool:
            rec['tool'] = tool
        m['s'][spec['id']] = rec


for m in models.values():
    if m['org']:
        continue
    for pattern, org, is_open in NAME_MAKERS:
        if re.match(pattern, m['name'], re.I):
            m['org'], m['company'] = org_of(org)
            m['access'] = None if is_open is None else 'Open weights' if is_open else 'API access'
            break
    else:
        print('  maker unknown:', m['name'])


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


out = []
for m in models.values():
    if not m['s']:
        continue
    access = m['access'] or ''
    out.append({
        'id': slug(m['name']), 'name': m['name'], 'org': m['org'], 'company': m['company'], 'date': m['date'],
        'open': access.startswith('Open weights'), 'access': access or None, 's': m['s'],
    })
out.sort(key=lambda m: (m['date'] or '', m['name']), reverse=True)

ids = [m['id'] for m in out]
assert len(ids) == len(set(ids)), 'duplicate model ids'

as_of = max(m['date'] for m in out if m['date'])
stats = {spec['id']: sum(1 for m in out if spec['id'] in m['s']) for spec in METRICS}
print(len(out), 'models; per test', stats, '; latest model', as_of)
for kept, other in merged:
    print('  merged:', repr(other), '→', repr(kept))
for spec in METRICS:
    top = sorted((m for m in out if spec['id'] in m['s']), key=lambda m: -m['s'][spec['id']]['v'])[:3]
    print(' ', spec['id'], [(m['name'], m['s'][spec['id']]['v']) for m in top])

clean = lambda o: {k: v for k, v in o.items() if v not in (None, '', [], {})}
public_metrics = [clean({k: v for k, v in spec.items() if k not in ('file', 'col', 'se', 'setting', 'tool')}) for spec in METRICS]

from datetime import date
header = f"""// AI 성능 비교 — tools/benchmarks/build.py가 만든 파일이다. 고칠 내용은 build.py에 적고 다시 만든다.
//
// 출처: Epoch AI, 'Capabilities & benchmarking' (CC BY 4.0, https://epoch.ai/benchmarks).
// 시험 문제와 외부 리더보드 점수의 권리는 각 시험을 만든 곳에 있다.
//
// AI_BENCH_METRICS: 보여 주는 시험. basis — est: 통계 추정(흐리게), epoch: Epoch이 직접 시험, ext: 시험을 만든 곳의 집계
// AI_BENCH_MODELS:  모델별 점수 s[시험 id] = {{ v: 점수(0~1, ECI는 지수), lo·hi: 구간, set: 가장 잘 나온 설정, tool: 코딩 도구 }}
//                   같은 모델의 여러 설정(추론 강도 등) 중 가장 높은 점수를 남겼다. company는 companies.js의 id(지도에 없으면 없음)
//                   Epoch이 만든 곳을 비워 둔 모델은 이름으로 채웠다(build.py의 NAME_MAKERS).
"""
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(header)
    f.write(f"window.AI_BENCH_AS_OF = '{date.today().isoformat()}';\n")
    f.write('window.AI_BENCH_METRICS = ' + json.dumps(public_metrics, ensure_ascii=False, indent=2) + ';\n')
    f.write('window.AI_BENCH_MODELS = [\n' + ',\n'.join('  ' + json.dumps(clean(m), ensure_ascii=False) for m in out) + '\n];\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
