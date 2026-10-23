// AI 데이터센터에 전기를 대는 발전소와 전력 회사 — 정리 기준: 2026년 10월, 공개 보도·공시 기반.
//
// 발전소(AI_POWER_PLANTS): AI 기업이 장기 전력구매계약(PPA)을 맺었거나, 데이터센터 전용·옆에 짓는 곳.
//   fuel:    AI_POWER_FUELS 중 하나 · status: AI_POWER_STATUS 중 하나
//   mw:      발전소(또는 계약) 규모, basis: 'ann'(회사 발표·공시) | 'rep'(언론·업계 보도)
//   buyers:  전기를 사기로 한 지도 기업 id · datacenters: 직접 전기를 받는 데이터센터 id (datacenters.js)
//   operator: 발전소를 운영·개발하는 회사 (AI_POWER_COMPANIES의 id)
//   certain: 발전소가 실제로 있거나 공사 중인 곳. 계획·승인 단계는 '전체' 보기에서만 흐리게 보인다
//   위치는 발전소 부지의 근사 좌표다.
// 전력 회사(AI_POWER_COMPANIES): 발전소 운영사와, Epoch AI 데이터센터 자료의 전력 공급사.
//   epochNames: datacenters.js의 energy 칸에 나오는 이름 — 이 이름으로 공급하는 데이터센터를 찾는다
//   deals: AI 기업과 맺은 계약 (특정 발전소에 묶이지 않은 계약도 여기에)
window.AI_POWER_AS_OF = '2026년 10월';

window.AI_POWER_FUELS = {
  nuclear: { label: '원자력', desc: '가동 중이거나 다시 돌리는 원전' },
  advanced: { label: '차세대 원자력·핵융합', desc: '소형모듈원전(SMR)·4세대 원전·핵융합' },
  gas: { label: '천연가스', desc: '데이터센터 전용 가스터빈·열병합' },
};

window.AI_POWER_STATUS = {
  operating: { label: '가동' },
  partial: { label: '일부 가동' },
  restarting: { label: '재가동 준비' },
  construction: { label: '건설 중' },
  planned: { label: '계획·승인' },
};

const POWER_SRC = {
  usnews: { title: 'US Is Reviving Shuttered Nuclear Plants to Power Data Centers (U.S. News, 2026-10-16)', url: 'https://www.usnews.com/news/best-states/iowa/articles/2026-10-16/us-is-reviving-shuttered-nuclear-plants-to-meet-growing-electricity-demand-and-to-power-data-centers' },
  smrintel: { title: 'Every Nuclear-Powered Data Center Deal (SMR Intel, 2026)', url: 'https://smrintel.com/nuclear-data-center-deals/' },
  nnn: { title: 'Nuclear power for data centers, explained: every deal tracked (Nuclear News Network)', url: 'https://www.nuclearnewsnetwork.com/news/nuclear-power-data-centers-explained' },
  wnnMeta: { title: "Meta announces 'landmark' agreements for new nuclear (World Nuclear News, 2026-01)", url: 'https://world-nuclear-news.org/articles/meta-announces-landmark-agreements-for-new-nuclear' },
  ansMeta: { title: 'Meta strikes deals with Vistra, Oklo, TerraPower (ANS, 2026-01-12)', url: 'https://www.ans.org/news/2026-01-12/article-7666/meta-strikes-deals-with-vistra-oklo-terrapower/' },
};

window.AI_POWER_PLANTS = [
  // ───────── 원자력: 장기 계약·재가동 ─────────
  {
    id: 'crane', name: 'Crane Clean Energy Center', nameKo: '크레인 원전 (옛 스리마일섬 1호기)', place: '펜실베이니아 미들타운', country: 'US',
    lat: 40.1531, lng: -76.7247, fuel: 'nuclear', status: 'restarting', mw: 835, basis: 'ann', since: '2027', certain: true,
    operator: 'constellation', buyers: ['microsoft'], datacenters: [],
    deal: '마이크로소프트 20년 전력구매계약 (2024년 9월, 약 160억 달러)',
    desc: '2019년 경제성 문제로 멈춘 원전을 마이크로소프트와의 20년 계약으로 다시 돌린다. 2027년 첫 발전이 목표이며, 2026년 6월 송전 관련 규제 승인을 받았다. 특정 데이터센터에 직접 잇지 않고 전력망(PJM)으로 보내는 계약이다.',
    sources: [POWER_SRC.smrintel, POWER_SRC.nnn, POWER_SRC.usnews],
  },
  {
    id: 'susquehanna', name: 'Susquehanna Steam Electric Station', nameKo: '서스퀘해나 원전', place: '펜실베이니아 버윅', country: 'US',
    lat: 41.0889, lng: -76.1467, fuel: 'nuclear', status: 'operating', mw: 1920, basis: 'ann', certain: true,
    operator: 'talen', buyers: ['amazon'], datacenters: ['aws-berwick'],
    deal: '아마존 최대 1,920MW, 2042년까지 (2025년 6월 확대)',
    desc: '탈렌에너지의 원전 바로 옆에 AWS 데이터센터 캠퍼스가 있다. 아마존이 2024년 캠퍼스를 사들였고, 2025년 계약을 넓혀 데이터센터용 원전 계약으로는 가장 큰 규모가 됐다. 규모는 원전 전체가 아니라 계약 물량이다.',
    sources: [POWER_SRC.smrintel, POWER_SRC.usnews],
  },
  {
    id: 'clinton', name: 'Clinton Clean Energy Center', nameKo: '클린턴 원전', place: '일리노이 클린턴', country: 'US',
    lat: 40.1719, lng: -88.8344, fuel: 'nuclear', status: 'operating', mw: 1121, basis: 'ann', since: '2027-06', certain: true,
    operator: 'constellation', buyers: ['meta'], datacenters: [],
    deal: '메타 20년 가상 전력구매계약 (2027년 6월부터)',
    desc: '주 정부 보조금이 끝나는 2027년 중반 이후 문을 닫을 수 있던 원전을 메타의 20년 계약이 지킨다. 실제 전기는 전력망으로 가고 메타는 그만큼의 청정전력을 사는 구조다.',
    sources: [POWER_SRC.nnn, POWER_SRC.smrintel],
  },
  {
    id: 'duane-arnold', name: 'Duane Arnold Energy Center', nameKo: '듀안 아널드 원전', place: '아이오와 팰로', country: 'US',
    lat: 42.1006, lng: -91.7773, fuel: 'nuclear', status: 'restarting', mw: 615, basis: 'rep', since: '2029', certain: true,
    operator: 'nextera', buyers: ['alphabet'], datacenters: [],
    deal: '구글 25년 전력구매계약 (2025년 10월), 2029년 초 재가동 목표',
    desc: '2020년 폭풍 피해 뒤 닫은 아이오와 유일의 원전을 넥스트에라가 구글과 손잡고 다시 연다. 구글 몫이 얼마인지는 공개되지 않았다.',
    sources: [{ title: 'Duane Arnold Energy Center — Wikipedia', url: 'https://en.wikipedia.org/wiki/Duane_Arnold_Energy_Center' }, POWER_SRC.usnews, POWER_SRC.smrintel],
  },
  {
    id: 'perry', name: 'Perry Nuclear Power Plant', nameKo: '페리 원전', place: '오하이오 노스페리', country: 'US',
    lat: 41.8006, lng: -81.1433, fuel: 'nuclear', status: 'operating', mw: null, basis: 'ann', certain: true,
    operator: 'vistra', buyers: ['meta'], datacenters: [],
    deal: '메타 20년 계약 — 데이비스베시와 합쳐 2,176MW (2026년 1월)',
    desc: '비스트라가 운영하는 원전. 메타가 데이비스베시 원전과 함께 2,176MW를 20년간 사기로 했고, 두 원전과 비버밸리 원전의 출력 증강분 433MW도 2034년까지 더해진다.',
    sources: [POWER_SRC.wnnMeta, POWER_SRC.ansMeta],
  },
  {
    id: 'davis-besse', name: 'Davis-Besse Nuclear Power Station', nameKo: '데이비스베시 원전', place: '오하이오 오크하버', country: 'US',
    lat: 41.5967, lng: -83.0864, fuel: 'nuclear', status: 'operating', mw: null, basis: 'ann', certain: true,
    operator: 'vistra', buyers: ['meta'], datacenters: [],
    deal: '메타 20년 계약 — 페리와 합쳐 2,176MW (2026년 1월)',
    desc: '비스트라가 운영하는 원전. 페리 원전과 함께 메타의 2026년 원전 계약(최대 6.6GW)의 한 축이다.',
    sources: [POWER_SRC.wnnMeta, POWER_SRC.ansMeta],
  },

  // ───────── 차세대 원자력·핵융합 ─────────
  {
    id: 'kairos-hermes-2', name: 'Kairos Power Hermes 2', nameKo: '카이로스 헤르메스 2', place: '테네시 오크리지', country: 'US',
    lat: 35.9310, lng: -84.3910, fuel: 'advanced', status: 'construction', mw: 50, basis: 'ann', since: '2030', certain: true,
    operator: 'kairos', buyers: ['alphabet'], datacenters: [],
    deal: 'TVA 전력망을 거쳐 구글에 최대 50MW (2025년 8월)',
    desc: '용융염으로 식히는 4세대 원자로. 2026년 4월 착공해 2030년 가동이 목표다. 전기는 TVA 전력망으로 들어가 테네시·앨라배마의 구글 데이터센터를 돕는다. 구글은 2035년까지 카이로스 원자로에서 500MW를 사기로 했다.',
    sources: [
      { title: 'Google, Kairos Power, TVA announce collaboration (World Nuclear News)', url: 'https://wnn.world-nuclear.org/articles/google-kairos-power-tva-announce-collaboration' },
      { title: 'A new collaboration among Kairos, TVA, and Google (ANS, 2025-08-19)', url: 'https://www.ans.org/news/2025-08-19/article-7291/a-new-collaboration-among-kairos-tva-and-google/' },
      { title: 'Kairos breaks ground on Hermes 2 (Power Technology, 2026-04)', url: 'https://www.power-technology.com/newsletters/kairos-breaks-ground-on-hermes-2' },
    ],
  },
  {
    id: 'helion-orion', name: 'Helion Orion', nameKo: '헬리온 오리온 (핵융합)', place: '워싱턴 말라가', country: 'US',
    lat: 47.3600, lng: -120.2000, fuel: 'advanced', status: 'construction', mw: 50, basis: 'ann', since: '2028', certain: true,
    operator: 'helion', buyers: ['microsoft'], datacenters: [],
    deal: '마이크로소프트 전력구매계약 (2023년 5월) — 2028년부터 50MW 이상',
    desc: '세계 첫 핵융합 발전소를 목표로 2025년 7월 공사를 시작했고, 2026년 6월 주 정부 인허가를 받았다. 2028년 발전이 목표지만 회사 임원은 2030년에야 정격 출력에 이를 수 있다고 했고, 물리학자들의 회의적인 논문도 나왔다.',
    sources: [
      { title: 'Helion secures new licenses from Washington (ANS, 2026-06-23)', url: 'https://www.ans.org/news/2026-06-23/article-8140/helion-secures-new-licenses-from-washington/' },
      { title: "Helion funding round grows to $500M amid uncertainty over Microsoft timeline (GeekWire, 2026)", url: 'https://www.geekwire.com/2026/helion-funding-round-grows-to-500m-amid-uncertainty-over-fusion-startups-microsoft-timeline/' },
    ],
  },
  {
    id: 'x-energy-cascade', name: 'Cascade Advanced Energy Facility', nameKo: '캐스케이드 SMR (X-에너지)', place: '워싱턴 리치랜드', country: 'US',
    lat: 46.4711, lng: -119.3339, fuel: 'advanced', status: 'planned', mw: 320, basis: 'ann', since: '2030년대', certain: false,
    operator: 'energy-northwest', buyers: ['amazon'], datacenters: [],
    deal: '아마존 투자·전력 — 1단계 4기 320MW, 최대 12기 960MW',
    desc: '아마존이 투자한 X-에너지의 소형모듈원전(Xe-100)을 에너지노스웨스트가 짓는다. 시공 컨소시엄은 정했지만 2026년 기준 건설 허가를 아직 신청하지 않았다. 가동은 2030년대 목표다.',
    sources: [
      { title: 'Cascade Advanced Energy Facility — Wikipedia', url: 'https://en.wikipedia.org/wiki/Cascade_Advanced_Energy_Facility' },
      { title: 'Joint venture selected to deliver Cascade SMR facility (World Nuclear News)', url: 'https://world-nuclear-news.org/articles/joint-venture-selected-to-deliver-cascade-smr-facility' },
      { title: 'Amazon reveals further information on planned SMR facility in Richland (DCD)', url: 'https://www.datacenterdynamics.com/en/news/amazon-reveals-further-information-on-planned-smr-facility-in-richland-washington/' },
    ],
  },
  {
    id: 'oklo-pike', name: 'Oklo Pike County Campus', nameKo: '오클로 파이크 카운티 (계획)', place: '오하이오 파이크 카운티', country: 'US',
    lat: 39.0080, lng: -82.9980, fuel: 'advanced', status: 'planned', mw: 1200, basis: 'rep', since: '2034', certain: false,
    operator: 'oklo', buyers: ['meta'], datacenters: [],
    deal: '메타 계약 (2026년 1월) — 오하이오에 새 원전 단지',
    desc: '메타의 2026년 원전 계약 중 오클로 몫. 소형 고속로 여러 기를 모은 새 단지를 짓는 계획이다. 1.2GW(2034년까지)는 업계 매체 일부만 전한 수치다.',
    sources: [POWER_SRC.wnnMeta, POWER_SRC.ansMeta],
  },

  // ───────── 데이터센터 전용 가스 발전 ─────────
  {
    id: 'xai-southaven', name: 'xAI Southaven Power Plant', nameKo: 'xAI 사우스헤이븐 가스발전소', place: '미시시피 사우스헤이븐', country: 'US',
    lat: 34.9930, lng: -90.0200, fuel: 'gas', status: 'operating', mw: 1200, basis: 'rep', certain: true,
    operator: null, operatorName: 'xAI(스페이스X) 자회사', buyers: ['spacex-xai'], datacenters: ['colossus-2'],
    deal: '자체 발전 — 옛 듀크에너지 발전소 부지',
    desc: '주 경계 너머 멤피스의 콜로서스 2에 중압 송전선으로 전기를 보낸다. 미시시피 환경청이 2026년 가스터빈 41대(1.2GW) 영구 허가를 냈다. 그 전까지 허가 없이 돌린 임시 터빈들은 2027년 7월까지 모두 철거하기로 했고, 환경단체의 소송 예고 등 논란이 이어지고 있다.',
    sources: [
      { title: "Musk's xAI gets go-ahead for 41 natural gas turbines in Mississippi (DCD)", url: 'https://www.datacenterdynamics.com/en/news/musks-xai-gets-go-ahead-for-41-natural-gas-turbines-in-mississippi-to-power-colossus-data-centers' },
      { title: 'A battle over data centers heats up along the Mississippi-Tennessee state line (Tennessee Lookout, 2026-03-18)', url: 'https://tennesseelookout.com/2026/03/18/a-battle-over-data-centers-heats-up-along-the-mississippi-tennessee-state-line/' },
      { title: 'SpaceX agrees to remove temporary gas turbines at Colossus data center by 2027 (Gizmodo)', url: 'https://gizmodo.com/spacex-agrees-to-remove-temporary-gas-turbines-at-colossus-data-center-by-2027-2000793559' },
    ],
  },
  {
    id: 'williams-socrates', name: 'Williams Socrates', nameKo: '윌리엄스 소크라테스 (메타 전용)', place: '오하이오 뉴올버니', country: 'US',
    lat: 40.0830, lng: -82.7620, fuel: 'gas', status: 'partial', mw: 556, basis: 'ann', since: '2026-07', certain: true,
    operator: 'williams', buyers: ['meta'], datacenters: ['meta-prometheus'],
    deal: '메타 계열사와 10년 고정가 전력구매계약',
    desc: '메타 프로메테우스만을 위한 전력망 밖 가스 발전소 두 곳. 소크라테스 사우스가 2026년 7월 가동했고, 노스는 2026년 4분기 가동 예정이다. 규모는 윌리엄스 공시 기준이다.',
    sources: [
      { title: 'Williams Companies Form 10-Q, Q2 2026 (SEC)', url: 'https://www.sec.gov/Archives/edgar/data/0000107263/000010726326000026/wmb-20260630.htm' },
      { title: 'Onsite gas turbines, reciprocating engines to power Meta data center (Power Engineering)', url: 'https://www.power-eng.com/gas/onsite-gas-turbines-reciprocating-engines-to-power-meta-data-center/' },
      { title: 'Socrates North fact sheet (Williams)', url: 'https://www.williams.com/wp-content/uploads/sites/8/2025/08/1355-Socrates-North-Fact-Sheet_v6.pdf' },
    ],
  },
  {
    id: 'stargate-abilene-gas', name: 'Stargate Abilene on-site gas', nameKo: '스타게이트 애빌린 현장 가스발전', place: '텍사스 애빌린', country: 'US',
    lat: 32.4950, lng: -99.7700, fuel: 'gas', status: 'operating', mw: 360, basis: 'rep', certain: true,
    operator: null, operatorName: 'Crusoe', buyers: ['openai'], datacenters: ['openai-stargate-abilene'],
    deal: '데이터센터 부지 안 자체 발전 + 텍사스 전력망(ERCOT)',
    desc: '크루소가 캠퍼스 안에 가스터빈을 두고 전력망과 함께 쓴다. 360MW는 인허가 서류 기준 초기 용량이며, 크루소의 터빈 주문 총량(약 1GW)이 어디에 쓰일지는 확인되지 않았다.',
    sources: [
      { title: 'Stargate Abilene — behind-the-meter report (Cleanview)', url: 'https://cleanview.co/reports/behind-the-meter-data-centers/full-report/stargate-abilene' },
      { title: 'OpenAI Stargate: where the US sites stand (Epoch AI)', url: 'https://epoch.ai/publications/openai-stargate-where-the-us-sites-stand' },
    ],
  },
  {
    id: 'entergy-richland', name: 'Entergy Richland Parish plants', nameKo: '엔터지 리치랜드 패리시 가스발전 (메타 전용)', place: '루이지애나 리치랜드 패리시', country: 'US',
    lat: 32.4050, lng: -91.6400, fuel: 'gas', status: 'planned', mw: null, basis: 'rep', since: '2028', certain: false,
    operator: 'entergy', buyers: ['meta'], datacenters: ['meta-hyperion'],
    deal: '메타 하이페리온용 — 2025년 주 규제당국 승인',
    desc: '메타 하이페리온 옆에 짓는 가스 발전소 2기로 2028년 말 가동 예정이다. 2026년 3월 메타와 엔터지는 7기를 더 짓기로 했지만(합계 10기), 추가분은 승인 대기 중이다.',
    sources: [
      { title: 'Meta orders 10 gas power plants for Hyperion (Fortune, 2026-03-27)', url: 'https://fortune.com/2026/03/27/meta-hyperion-10-gas-power-plants-louisiana-entergy/' },
      { title: 'Meta triples order of gas-fired power plants for its AI campus in Louisiana (The Lens, 2026-03-30)', url: 'https://thelensnola.org/2026/03/30/meta-triples-order-of-gas-fired-power-plants-for-its-ai-campus-in-louisiana/' },
      { title: "Entergy to build gas plants for Meta's AI data center (Gas Processing News, 2025-08)", url: 'https://admin.gasprocessingnews.com/news/2025/08/entergy-to-build-gas-plants-for-metas-ai-data-center/' },
    ],
  },
  {
    id: 'entergy-waterford', name: 'Entergy Waterford site plant', nameKo: '엔터지 워터퍼드 가스발전 (메타 전용)', place: '루이지애나 세인트찰스 패리시', country: 'US',
    lat: 29.9970, lng: -90.4710, fuel: 'gas', status: 'planned', mw: null, basis: 'rep', since: '2029', certain: false,
    operator: 'entergy', buyers: ['meta'], datacenters: ['meta-hyperion'],
    deal: '메타 하이페리온용 — 2025년 주 규제당국 승인',
    desc: '엔터지의 기존 워터퍼드 발전 부지에 메타 하이페리온을 위한 가스 발전소를 더 짓는다. 2029년 말 가동 예정이다.',
    sources: [
      { title: 'Meta triples order of gas-fired power plants for its AI campus in Louisiana (The Lens, 2026-03-30)', url: 'https://thelensnola.org/2026/03/30/meta-triples-order-of-gas-fired-power-plants-for-its-ai-campus-in-louisiana/' },
      { title: 'Meta orders 10 gas power plants for Hyperion (Fortune, 2026-03-27)', url: 'https://fortune.com/2026/03/27/meta-hyperion-10-gas-power-plants-louisiana-entergy/' },
    ],
  },
  {
    id: 'sk-multiutility-ulsan', name: 'SK Multi-Utility Ulsan', nameKo: 'SK멀티유틸리티 울산 열병합', place: '울산 남구', country: 'KR',
    lat: 35.4780, lng: 129.3600, fuel: 'gas', status: 'operating', mw: null, basis: 'ann', certain: true,
    operator: 'sk-multiutility', buyers: [], datacenters: ['sk-ai-dc-ulsan'],
    deal: 'SK AI 데이터센터 울산에 한전보다 싼 값에 전력 공급',
    desc: 'LNG 열병합 발전소. SK와 AWS가 짓는 울산 AI 데이터센터에 전력망 대신 직접 전기를 대기로 했다.',
    sources: [{ title: "'SK AI 데이터센터 울산' 기공식 개최 (SK텔레콤 뉴스룸)", url: 'https://news.sktelecom.com/214708' }],
  },
];

// Power companies. `hq` is where the overlay lines start from.
window.AI_POWER_COMPANIES = [
  { id: 'constellation', name: 'Constellation Energy', nameKo: '컨스텔레이션 에너지', kind: '원전 운영사', hq: { lat: 39.2904, lng: -76.6122, place: '메릴랜드 볼티모어' },
    desc: '미국 최대 원전 운영사. 마이크로소프트(크레인 재가동)·메타(클린턴)에 이어 2026년 10월 구글과도 계약했다.',
    deals: [
      { buyer: 'alphabet', what: '새 원자력 890MW 20년 + 기존 원전 2,700MW 15년 (발전소 비공개, PJM 전력망)', date: '2026-10', source: { title: 'Google goes nuclear: 890 MW from Constellation (SiliconANGLE, 2026-10-06)', url: 'https://siliconangle.com/2026/10/06/google-goes-nuclear-to-power-its-ai-data-centers-committing-to-purchase-890-megawatts-of-energy-from-constellation/' } },
    ] },
  { id: 'talen', name: 'Talen Energy', nameKo: '탈렌 에너지', kind: '발전사', hq: { lat: 29.7604, lng: -95.3698, place: '텍사스 휴스턴' },
    desc: '서스퀘해나 원전을 운영하며 바로 옆 데이터센터 캠퍼스를 아마존에 팔았다.' },
  { id: 'nextera', name: 'NextEra Energy', nameKo: '넥스트에라 에너지', kind: '발전·전력 회사', hq: { lat: 26.8798, lng: -80.0534, place: '플로리다 주노비치' }, epochNames: ['NextEra Energy Resources'],
    desc: '세계 최대 재생에너지 발전사. 구글과 듀안 아널드 원전을 다시 열고, 메타 헌츠빌 데이터센터에 전력을 공급한다.' },
  { id: 'vistra', name: 'Vistra', nameKo: '비스트라', kind: '발전사', hq: { lat: 32.8140, lng: -96.9489, place: '텍사스 어빙' },
    desc: '페리·데이비스베시·비버밸리 원전을 운영하며 2026년 1월 메타와 20년 계약을 맺었다.' },
  { id: 'williams', name: 'Williams', nameKo: '윌리엄스', kind: '가스 인프라 회사', hq: { lat: 36.1540, lng: -95.9928, place: '오클라호마 털사' }, epochNames: ['Williams'],
    desc: '가스관 회사가 메타 데이터센터 전용 발전소까지 짓는다. Epoch 자료상 메타 데이터센터 여러 곳의 전력 공급사다.' },
  { id: 'entergy', name: 'Entergy', nameKo: '엔터지', kind: '전력 회사', hq: { lat: 29.9511, lng: -90.0715, place: '루이지애나 뉴올리언스' }, epochNames: ['Entergy'],
    desc: '메타 하이페리온을 위해 가스 발전소 10기를 짓기로 한 남부 전력 회사.' },
  { id: 'tva', name: 'Tennessee Valley Authority', nameKo: '테네시강 유역 개발공사 (TVA)', kind: '연방 전력 공사', hq: { lat: 35.9606, lng: -83.9207, place: '테네시 녹스빌' }, epochNames: ['Tennessee Valley Authority'],
    desc: '미국 남동부 연방 전력 회사. 카이로스 헤르메스 2의 전기를 사서 구글 데이터센터 쪽 전력망에 보낸다.',
    deals: [{ buyer: 'alphabet', what: '카이로스 헤르메스 2의 50MW를 사서 구글에 공급 (2030년~)', date: '2025-08', source: { title: 'A new collaboration among Kairos, TVA, and Google (ANS)', url: 'https://www.ans.org/news/2025-08-19/article-7291/a-new-collaboration-among-kairos-tva-and-google/' } }] },
  { id: 'mlgw', name: 'Memphis Light, Gas and Water', nameKo: '멤피스 전력·가스·수도청 (MLGW)', kind: '지역 공기업', hq: { lat: 35.1495, lng: -90.0490, place: '테네시 멤피스' }, epochNames: ['MLGW'],
    desc: '콜로서스 1에 전력망 전기를 공급하는 멤피스 공기업.' },
  { id: 'georgia-power', name: 'Georgia Power', nameKo: '조지아 파워', kind: '전력 회사', hq: { lat: 33.7490, lng: -84.3880, place: '조지아 애틀랜타' }, epochNames: ['Georgia Power'],
    desc: '마이크로소프트 페어워터 애틀랜타에 전력을 공급한다.' },
  { id: 'aep', name: 'American Electric Power', nameKo: '아메리칸 일렉트릭 파워 (AEP)', kind: '전력 회사', hq: { lat: 39.9612, lng: -82.9988, place: '오하이오 콜럼버스' }, epochNames: ['American Electric Power'],
    desc: '스타게이트 애빌린(텍사스)과 메타 프로메테우스(오하이오)에 전력망 전기를 공급한다.' },
  { id: 'we-energies', name: 'WE Energies', nameKo: 'WE 에너지', kind: '전력 회사', hq: { lat: 43.0389, lng: -87.9065, place: '위스콘신 밀워키' }, epochNames: ['WE Energies'],
    desc: '마이크로소프트 페어워터 위스콘신에 전력을 공급한다.' },
  { id: 'dominion', name: 'Dominion Energy', nameKo: '도미니언 에너지', kind: '전력 회사', hq: { lat: 37.5407, lng: -77.4360, place: '버지니아 리치먼드' }, epochNames: ['Dominion Energy'],
    desc: '세계 최대 데이터센터 밀집 지역인 버지니아의 전력 회사.' },
  { id: 'idaho-power', name: 'Idaho Power', nameKo: '아이다호 파워', kind: '전력 회사', hq: { lat: 43.6150, lng: -116.2023, place: '아이다호 보이시' }, epochNames: ['Idaho Power Company'],
    desc: '메타 쿠나 데이터센터에 전력을 공급한다.' },
  { id: 'alliant', name: 'Alliant Energy', nameKo: '얼라이언트 에너지', kind: '전력 회사', hq: { lat: 43.0731, lng: -89.4012, place: '위스콘신 매디슨' }, epochNames: ['Alliant Energy'],
    desc: '아이오와 시더래피즈 데이터센터 단지에 전력을 공급한다.' },
  { id: 'portland-general', name: 'Portland General Electric', nameKo: '포틀랜드 제너럴 일렉트릭', kind: '전력 회사', hq: { lat: 45.5152, lng: -122.6784, place: '오리건 포틀랜드' }, epochNames: ['Portland General Electric'] },
  { id: 'avangrid', name: 'Avangrid', nameKo: '아반그리드', kind: '재생에너지 발전사', hq: { lat: 41.2780, lng: -73.0257, place: '코네티컷 오렌지' }, epochNames: ['Avangrid'] },
  { id: 'first-solar', name: 'First Solar', nameKo: '퍼스트 솔라', kind: '태양광 회사', hq: { lat: 33.4255, lng: -111.9400, place: '애리조나 템피' }, epochNames: ['First Solar'] },
  { id: 'bloom', name: 'Bloom Energy', nameKo: '블룸 에너지', kind: '연료전지 회사', hq: { lat: 37.3382, lng: -121.8863, place: '캘리포니아 새너제이' }, epochNames: ['Bloom Energy'],
    desc: '부지 안 연료전지로 전기를 만든다. Epoch 자료상 스타게이트 뉴멕시코의 전력 공급사다.' },
  { id: 'shell-energy-europe', name: 'Shell Energy Europe', nameKo: '셸 에너지 유럽', kind: '에너지 회사', hq: { lat: 51.5072, lng: -0.1276, place: '영국 런던' }, epochNames: ['Shell Energy Europe'] },
  { id: 'engie', name: 'Engie', nameKo: '엔지', kind: '에너지 회사', hq: { lat: 48.8566, lng: 2.3522, place: '프랑스 파리' }, epochNames: ['Engie'] },
  { id: 'kairos', name: 'Kairos Power', nameKo: '카이로스 파워', kind: '차세대 원전 개발사', hq: { lat: 37.7652, lng: -122.2416, place: '캘리포니아 앨러미다' },
    desc: '구글과 2035년까지 500MW를 공급하기로 한 용융염 냉각 원자로 개발사.' },
  { id: 'helion', name: 'Helion Energy', nameKo: '헬리온 에너지', kind: '핵융합 개발사', hq: { lat: 47.9790, lng: -122.2021, place: '워싱턴 에버렛' },
    desc: '마이크로소프트와 세계 첫 핵융합 전력 계약을 맺은 스타트업.' },
  { id: 'energy-northwest', name: 'Energy Northwest', nameKo: '에너지 노스웨스트', kind: '공공 발전 기관', hq: { lat: 46.2857, lng: -119.2845, place: '워싱턴 리치랜드' },
    desc: 'X-에너지의 소형모듈원전 캐스케이드를 짓고 운영할 워싱턴주 공공 발전 기관.' },
  { id: 'oklo', name: 'Oklo', nameKo: '오클로', kind: '차세대 원전 개발사', hq: { lat: 37.3541, lng: -121.9552, place: '캘리포니아 샌타클래라' },
    desc: '소형 고속로 개발사. 메타와 오하이오 새 원전 단지 계약을 맺었다.' },
  { id: 'terrapower', name: 'TerraPower', nameKo: '테라파워', kind: '차세대 원전 개발사', hq: { lat: 47.6101, lng: -122.2015, place: '워싱턴 벨뷰' },
    desc: '빌 게이츠가 세운 나트륨 냉각 원자로(나트리움) 개발사.',
    deals: [{ buyer: 'meta', what: '나트리움 2기 + 최대 6기 추가 권리, 2035년까지 합계 2.8GW (부지 미공개)', date: '2026-01', source: POWER_SRC.wnnMeta }] },
  { id: 'sk-multiutility', name: 'SK Multi-Utility', nameKo: 'SK멀티유틸리티', kind: '열병합 발전사', hq: { lat: 35.4780, lng: 129.3600, place: '울산' }, epochNames: ['SK멀티유틸리티 LNG 열병합 발전'],
    desc: 'LNG 열병합 발전소를 운영하는 SK 계열 발전사.' },
];
