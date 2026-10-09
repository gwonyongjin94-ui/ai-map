// AI 기업 사이의 관계 — 정리 기준: 2026년 10월, 공개 보도 기반.
//
// from → to 방향의 의미는 type마다 다르다 (AI_RELATION_TYPES 참고).
// label:  한 줄 요약 (관계도·목록에 표시)
// detail: 한두 문장 설명
// since:  시작 시점 'YYYY' 또는 'YYYY-MM' (모르면 생략)
// source: 확인한 기사 { title, url } (없으면 화면에서 관련 뉴스 검색 링크를 대신 보여 준다)
window.AI_RELATIONS_AS_OF = '2026년 10월';

// 순서가 곧 색 순서다 (styles.css의 --series-1…6, 색각 이상 검증을 거친 고정 순서).
window.AI_RELATION_TYPES = {
  invest: { label: '투자', out: '투자한 곳', in: '투자받은 곳', directed: true },
  supply: { label: '반도체·장비 공급', out: '공급하는 곳', in: '공급받는 곳', directed: true },
  cloud: { label: '클라우드·컴퓨팅', out: '컴퓨팅을 제공하는 곳', in: '컴퓨팅을 쓰는 곳', directed: true },
  partner: { label: '제휴', out: '제휴', in: '제휴', directed: false },
  alumni: { label: '출신·분사', out: '이곳 출신이 세운 곳', in: '창업자 출신', directed: true },
  own: { label: '인수·자회사', out: '자회사', in: '모회사', directed: true },
};

const OPENAI_ROUND_2026 = {
  title: 'Nvidia와 OpenAI의 1,000억 달러 딜 무산, 이를 대신한 2026년 라운드 (Investing.com)',
  url: 'https://www.investing.com/analysis/nvidia-and-openais-100-billion-deal-is-dead-what-replaced-it-matters-more-200680620',
};
const STARGATE_KOREA = {
  title: 'Samsung, SK Hynix join OpenAI’s Stargate with HBM supply pacts (KED Global)',
  url: 'https://www.kedglobal.com/artificial-intelligence/newsView/ked202510010013',
};
const TML_SEED = {
  title: "Thinking Machines Lab $2B seed: Nvidia, AMD, Cisco… (Techmeme/Reuters)",
  url: 'https://www.techmeme.com/250715/p18',
};

window.AI_RELATIONS = [
  // ───────── 투자 (투자자 → 투자받은 기업) ─────────
  { from: 'microsoft', to: 'openai', type: 'invest', label: '주요 주주 (약 27%)', since: '2019', detail: '2019년부터 130억 달러 이상을 투자했고, 2025년 10월 구조 개편 뒤 OpenAI 지분 약 27%를 보유한다.' },
  { from: 'softbank', to: 'openai', type: 'invest', label: '400억 + 300억 달러 투자', since: '2025', detail: '2025년 400억 달러 라운드를 주도했고, 2026년 1,220억 달러 라운드에 300억 달러를 더 넣었다.', source: OPENAI_ROUND_2026 },
  { from: 'amazon', to: 'openai', type: 'invest', label: '500억 달러 투자', since: '2026-02', detail: '2026년 2월 OpenAI의 1,100억 달러(최종 1,220억 달러) 라운드를 500억 달러로 주도했다.', source: OPENAI_ROUND_2026 },
  { from: 'nvidia', to: 'openai', type: 'invest', label: '300억 달러 투자', since: '2026-02', detail: '2025년에 밝힌 최대 1,000억 달러 투자 구상은 무산됐고, 대신 2026년 라운드에 300억 달러를 투자했다.', source: OPENAI_ROUND_2026 },
  { from: 'openai', to: 'cursor', type: 'invest', label: '초기 투자', since: '2023', detail: 'OpenAI 스타트업 펀드가 2023년 Anysphere(커서)의 시드 투자를 주도했다.' },
  { from: 'amazon', to: 'anthropic', type: 'invest', label: '80억 달러 투자', since: '2023', detail: '2023~2024년 총 80억 달러를 투자한 주요 주주다.' },
  { from: 'alphabet', to: 'anthropic', type: 'invest', label: '30억 달러 이상 투자', since: '2023', detail: '2023년부터 여러 차례 투자한 주요 주주다.' },
  { from: 'microsoft', to: 'anthropic', type: 'invest', label: '최대 50억 달러 투자', since: '2025-11', detail: '2025년 11월 엔비디아와 함께 투자를 발표했다.' },
  { from: 'nvidia', to: 'anthropic', type: 'invest', label: '최대 100억 달러 투자', since: '2025-11', detail: '2025년 11월 투자를 발표하고 Claude를 엔비디아 시스템에 맞춰 최적화하기로 했다.' },
  { from: 'salesforce', to: 'anthropic', type: 'invest', label: '투자', since: '2023', detail: 'Salesforce Ventures가 2023년 투자했다.' },
  { from: 'meta', to: 'scale-ai', type: 'invest', label: '지분 49% (143억 달러)', since: '2025-06', detail: '2025년 6월 143억 달러에 지분 49%를 사들였다.' },
  { from: 'asml', to: 'mistral', type: 'invest', label: '최대 주주 (13억 유로)', since: '2025-09', detail: '2025년 9월 시리즈 C를 주도하며 약 11% 지분의 최대 주주가 됐다.' },
  { from: 'nvidia', to: 'mistral', type: 'invest', label: '투자', since: '2024', detail: '여러 투자 라운드에 참여했다.' },
  { from: 'microsoft', to: 'mistral', type: 'invest', label: '1,500만 유로 투자', since: '2024-02', detail: '2024년 소규모 지분 투자와 함께 Azure에서 Mistral 모델을 제공하는 제휴를 맺었다.' },
  { from: 'alibaba', to: 'moonshot', type: 'invest', label: '주요 주주', since: '2024', detail: '2024년 대규모 투자로 주요 주주가 됐다.' },
  { from: 'tencent', to: 'moonshot', type: 'invest', label: '투자', since: '2024', detail: '2024년 투자 라운드에 참여했다.' },
  { from: 'alibaba', to: 'zhipu', type: 'invest', label: '투자', since: '2023', detail: '상장 전 투자 라운드에 참여했다.' },
  { from: 'tencent', to: 'zhipu', type: 'invest', label: '투자', since: '2023', detail: '상장 전 투자 라운드에 참여했다.' },
  { from: 'alibaba', to: 'minimax', type: 'invest', label: '투자', since: '2024', detail: '2024년 6억 달러 투자 라운드를 주도했다.' },
  { from: 'tencent', to: 'minimax', type: 'invest', label: '투자', since: '2023', detail: '초기 투자사다.' },
  { from: 'nvidia', to: 'coreweave', type: 'invest', label: '지분 투자', since: '2023', detail: '지분을 보유한 주요 주주이고, 쓰이지 않은 클라우드 용량을 사 주는 계약도 맺었다.' },
  { from: 'nvidia', to: 'perplexity', type: 'invest', label: '투자', since: '2024', detail: '여러 투자 라운드에 참여했다.' },
  { from: 'softbank', to: 'perplexity', type: 'invest', label: '투자', since: '2024', detail: '비전펀드 2를 통해 투자했다.' },
  { from: 'nvidia', to: 'cohere', type: 'invest', label: '투자', since: '2023', detail: '2023년 투자 라운드에 참여했다.' },
  { from: 'oracle', to: 'cohere', type: 'invest', label: '투자·제휴', since: '2023', detail: '2023년 투자했고, 오라클 클라우드(OCI)에서 Cohere 모델을 제공한다.' },
  { from: 'salesforce', to: 'cohere', type: 'invest', label: '투자', since: '2023', detail: 'Salesforce Ventures가 투자했다.' },
  { from: 'nvidia', to: 'sakana', type: 'invest', label: '투자', since: '2024', detail: '2024년 투자하고 일본 AI 연구에서 협력한다.' },
  { from: 'nvidia', to: 'databricks', type: 'invest', label: '투자', since: '2023', detail: '2023년부터 투자 라운드에 참여했다.' },
  { from: 'nvidia', to: 'spacex-xai', type: 'invest', label: '투자 (xAI 시절)', since: '2024', detail: 'SpaceX에 합병되기 전 xAI의 투자 라운드에 참여했다.' },
  { from: 'alphabet', to: 'ssi', type: 'invest', label: '투자·TPU 공급', since: '2025-04', detail: '2025년 4월 투자했고, SSI는 연구에 구글 TPU를 쓴다.' },
  { from: 'nvidia', to: 'ssi', type: 'invest', label: '투자', since: '2025-04', detail: '2025년 4월 투자 라운드에 참여했다.' },
  { from: 'nvidia', to: 'thinking-machines', type: 'invest', label: '투자', since: '2025-07', detail: '2025년 20억 달러 시드 라운드에 참여했다.', source: TML_SEED },
  { from: 'amd', to: 'thinking-machines', type: 'invest', label: '투자', since: '2025-07', detail: 'AMD 벤처스가 2025년 시드 라운드에 참여했다.', source: TML_SEED },
  { from: 'microsoft', to: 'g42', type: 'invest', label: '15억 달러 투자', since: '2024-04', detail: '2024년 지분 투자와 함께 Azure 기반 협력을 맺었다.' },
  { from: 'samsung', to: 'rebellions', type: 'invest', label: '투자', since: '2025', detail: '삼성벤처투자가 2025년 시리즈 C에 참여했다.', source: { title: '리벨리온, Arm 전략적 투자 3400억 조달 (이데일리)', url: 'https://www.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02961846642305368' } },
  { from: 'arm', to: 'rebellions', type: 'invest', label: '전략적 투자', since: '2025', detail: '2025년 시리즈 C에 전략적 투자자로 참여했다. Arm의 첫 아시아·태평양 스타트업 투자다.', source: { title: '리벨리온, Arm 전략적 투자 3400억 조달 (이데일리)', url: 'https://www.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02961846642305368' } },
  { from: 'salesforce', to: 'hugging-face', type: 'invest', label: '투자 (시리즈 D 주도)', since: '2023-08', detail: 'Salesforce Ventures가 2023년 시리즈 D를 주도했다.' },
  { from: 'alphabet', to: 'hugging-face', type: 'invest', label: '투자', since: '2023-08', detail: '2023년 시리즈 D에 참여했다.' },
  { from: 'amazon', to: 'hugging-face', type: 'invest', label: '투자', since: '2023-08', detail: '2023년 시리즈 D에 참여했다.' },
  { from: 'nvidia', to: 'hugging-face', type: 'invest', label: '투자', since: '2023-08', detail: '2023년 시리즈 D에 참여했다.' },
  { from: 'g42', to: 'cerebras', type: 'invest', label: '투자·최대 고객', since: '2023', detail: '지분을 보유했고, 슈퍼컴퓨터 Condor Galaxy를 함께 만든 최대 고객이다.' },

  // ───────── 인수·자회사 (모회사 → 자회사) ─────────
  { from: 'alphabet', to: 'google-deepmind', type: 'own', label: '자회사 (2014년 인수)', since: '2014', detail: '2014년 딥마인드를 인수했고, 2023년 구글 브레인과 합쳐 구글 딥마인드가 됐다.' },
  { from: 'softbank', to: 'arm', type: 'own', label: '모회사 (약 90%)', since: '2016', detail: '2016년 320억 달러에 인수했고, 2023년 재상장 뒤에도 약 90%를 보유한다.' },
  { from: 'spacex-xai', to: 'cursor', type: 'own', label: '자회사 (2026년 인수)', since: '2026-06', detail: '2026년 6월 600억 달러(전액 주식) 인수를 발표하고 8월 마무리했다.', source: { title: 'SpaceX to acquire the AI coding startup Cursor for $60 billion (CNBC)', url: 'https://www.cnbc.com/2026/06/16/spacex-spcx-cursor-acquisition-ipo.html' } },

  // ───────── 반도체·장비 공급 (공급사 → 고객) ─────────
  { from: 'tsmc', to: 'nvidia', type: 'supply', label: 'GPU 위탁생산', detail: '엔비디아 AI GPU를 생산하고 CoWoS 첨단 패키징을 맡는다.' },
  { from: 'tsmc', to: 'amd', type: 'supply', label: 'GPU·CPU 위탁생산', detail: 'Instinct GPU와 EPYC CPU를 생산한다.' },
  { from: 'tsmc', to: 'apple', type: 'supply', label: '칩 위탁생산', detail: '아이폰·맥에 들어가는 Apple 실리콘을 생산한다.' },
  { from: 'tsmc', to: 'broadcom', type: 'supply', label: '맞춤형 칩 생산', detail: '구글 TPU 등 브로드컴이 설계한 AI 칩을 생산한다.' },
  { from: 'tsmc', to: 'cerebras', type: 'supply', label: '웨이퍼 칩 생산', detail: '웨이퍼 한 장 크기의 WSE 칩을 생산한다.' },
  { from: 'asml', to: 'tsmc', type: 'supply', label: 'EUV 노광장비', detail: '첨단 공정에 필요한 EUV 노광장비를 공급한다.' },
  { from: 'asml', to: 'samsung', type: 'supply', label: 'EUV 노광장비', detail: '메모리·파운드리 첨단 공정에 EUV 장비를 공급한다.' },
  { from: 'asml', to: 'sk-hynix', type: 'supply', label: 'EUV 노광장비', detail: 'D램 첨단 공정에 EUV 장비를 공급한다.' },
  { from: 'sk-hynix', to: 'nvidia', type: 'supply', label: 'HBM 주 공급사', detail: '엔비디아 AI GPU에 들어가는 고대역폭 메모리(HBM)의 최대 공급사다.' },
  { from: 'samsung', to: 'nvidia', type: 'supply', label: 'HBM 공급', since: '2025', detail: '2025년 HBM3E 품질 검증을 통과해 엔비디아에 HBM을 공급한다.' },
  { from: 'samsung', to: 'amd', type: 'supply', label: 'HBM 공급', detail: 'AMD Instinct GPU에 HBM3E를 공급한다.' },
  { from: 'samsung', to: 'openai', type: 'supply', label: '스타게이트 메모리', since: '2025-10', detail: '2025년 10월 스타게이트에 HBM·D램을 공급하고 한국에 데이터센터를 짓는 의향서를 맺었다.', source: STARGATE_KOREA },
  { from: 'sk-hynix', to: 'openai', type: 'supply', label: '스타게이트 메모리', since: '2025-10', detail: '2025년 10월 삼성전자와 함께 스타게이트에 월 최대 90만 장 규모의 D램 웨이퍼를 공급하기로 했다.', source: STARGATE_KOREA },
  { from: 'arm', to: 'nvidia', type: 'supply', label: 'CPU 설계 IP', detail: '엔비디아 Grace CPU가 Arm 아키텍처를 쓴다.' },
  { from: 'arm', to: 'apple', type: 'supply', label: 'CPU 설계 IP', detail: 'Apple 실리콘이 Arm 아키텍처를 쓴다.' },
  { from: 'broadcom', to: 'alphabet', type: 'supply', label: 'TPU 공동 개발', detail: '구글 TPU를 함께 설계하고 공급한다.' },
  { from: 'broadcom', to: 'meta', type: 'supply', label: '맞춤형 AI 칩', detail: 'Meta의 자체 AI 칩(MTIA)을 함께 만든다.' },
  { from: 'broadcom', to: 'openai', type: 'supply', label: '맞춤형 칩 10GW', since: '2025-10', detail: '2025년 10월 OpenAI 자체 AI 가속기 10GW를 함께 개발해 배치하기로 했다.' },
  { from: 'broadcom', to: 'anthropic', type: 'supply', label: 'TPU 랙 210억 달러', since: '2025-12', detail: '앤트로픽이 구글 TPU(Ironwood) 랙을 브로드컴을 통해 총 210억 달러어치 주문했다.', source: { title: 'Anthropic places $21 billion order for Google chips via Broadcom (The Decoder)', url: 'https://the-decoder.com/anthropic-places-21-billion-order-for-google-chips-via-broadcom/' } },
  { from: 'nvidia', to: 'openai', type: 'supply', label: 'GPU 5GW', since: '2026-02', detail: '2026년 투자와 함께 OpenAI가 엔비디아 시스템으로 추론 3GW·학습 2GW를 쓰기로 했다.', source: OPENAI_ROUND_2026 },
  { from: 'nvidia', to: 'microsoft', type: 'supply', label: 'GPU 공급', detail: 'Azure AI 인프라의 핵심 GPU 공급사다.' },
  { from: 'nvidia', to: 'meta', type: 'supply', label: 'GPU 공급', detail: 'Meta의 대규모 학습 클러스터에 GPU를 공급한다.' },
  { from: 'nvidia', to: 'oracle', type: 'supply', label: 'GPU 공급', detail: '오라클 클라우드와 스타게이트 데이터센터에 GPU를 공급한다.' },
  { from: 'nvidia', to: 'coreweave', type: 'supply', label: 'GPU 공급', detail: 'GPU 클라우드의 핵심 공급사다.' },
  { from: 'nvidia', to: 'spacex-xai', type: 'supply', label: 'GPU 공급', detail: '멤피스 Colossus 슈퍼컴퓨터에 GPU를 공급한다.' },
  { from: 'amd', to: 'openai', type: 'supply', label: 'GPU 6GW', since: '2025-10', detail: '2025년 10월 6GW 규모 Instinct GPU 공급 계약을 맺었고, OpenAI는 AMD 지분을 최대 10%까지 받을 수 있는 워런트를 받았다.' },
  { from: 'amd', to: 'oracle', type: 'supply', label: 'GPU 공급', since: '2025-10', detail: '2025년 10월 오라클 클라우드에 MI450 GPU 5만 개를 배치한다고 발표했다.' },
  { from: 'amd', to: 'meta', type: 'supply', label: 'GPU 공급', detail: 'Meta에 Instinct GPU를 공급한다.' },
  { from: 'cerebras', to: 'openai', type: 'supply', label: '추론 컴퓨팅 200억 달러+', since: '2026-01', detail: '2026년 1월 750MW 규모 저지연 추론 컴퓨팅 계약을 맺었고, 이후 200억 달러 이상으로 커졌다.', source: { title: 'Cerebras scores OpenAI deal worth over $10 billion (CNBC)', url: 'https://www.cnbc.com/2026/01/14/cerebras-scores-openai-deal-worth-over-10-billion.html' } },
  { from: 'furiosa', to: 'lg-ai-research', type: 'supply', label: 'NPU 공급', since: '2025-07', detail: '2025년 LG AI연구원이 엑사원 추론에 퓨리오사의 RNGD 칩을 도입했다.' },

  // ───────── 클라우드·컴퓨팅 (제공 → 사용) ─────────
  { from: 'microsoft', to: 'openai', type: 'cloud', label: 'Azure (2,500억 달러 추가 계약)', since: '2019', detail: '2019년부터 OpenAI의 주 클라우드였고, 2025년 10월 개편 때 OpenAI가 Azure를 2,500억 달러어치 더 쓰기로 했다.' },
  { from: 'oracle', to: 'openai', type: 'cloud', label: '스타게이트 (3,000억 달러)', since: '2025-09', detail: '2025년 5년간 3,000억 달러 규모의 컴퓨팅 계약을 맺은 스타게이트 핵심 파트너다.' },
  { from: 'coreweave', to: 'openai', type: 'cloud', label: 'GPU 클라우드 224억 달러', since: '2025', detail: '2025년 세 차례 계약을 합쳐 224억 달러 규모다.' },
  { from: 'amazon', to: 'openai', type: 'cloud', label: 'AWS 380억 달러', since: '2025-11', detail: '2025년 11월 7년간 380억 달러 규모의 AWS 계약을 맺었다.' },
  { from: 'amazon', to: 'anthropic', type: 'cloud', label: '주 클라우드 (Trainium)', since: '2023', detail: 'Trainium 칩 기반의 대규모 학습 인프라(Project Rainier)를 제공한다.' },
  { from: 'alphabet', to: 'anthropic', type: 'cloud', label: 'TPU 최대 100만 개', since: '2025-10', detail: '2025년 10월 1GW 이상, TPU 최대 100만 개를 쓰는 계약을 맺었다.' },
  { from: 'microsoft', to: 'anthropic', type: 'cloud', label: 'Azure 300억 달러', since: '2025-11', detail: '2025년 11월 앤트로픽이 Azure 컴퓨팅을 300억 달러어치 쓰기로 했다.' },
  { from: 'coreweave', to: 'microsoft', type: 'cloud', label: 'GPU 클라우드', detail: '초기부터 코어위브의 최대 고객 중 하나다.' },
  { from: 'g42', to: 'openai', type: 'cloud', label: '스타게이트 UAE', since: '2025-05', detail: '2025년 아부다비에 1GW 규모 스타게이트 UAE를 함께 짓기로 했다.' },

  // ───────── 제휴 (방향 없음) ─────────
  { from: 'softbank', to: 'openai', type: 'partner', label: '스타게이트·일본 합작사', since: '2025-01', detail: '스타게이트를 함께 추진하고 일본 합작사 SB OAI Japan을 세웠다.' },
  { from: 'apple', to: 'openai', type: 'partner', label: 'ChatGPT 연동', since: '2024-06', detail: '2024년부터 Siri와 Apple Intelligence에서 ChatGPT를 쓸 수 있다.' },
  { from: 'apple', to: 'alphabet', type: 'partner', label: 'Gemini 기반 Siri', since: '2026-01', detail: '2026년 1월 차세대 Apple 파운데이션 모델을 Gemini 기반으로 만든다고 발표했다.', source: { title: "Google's Gemini to power Apple's AI features like Siri (TechCrunch)", url: 'https://techcrunch.com/2026/01/12/googles-gemini-to-power-apples-ai-features-like-siri/' } },
  { from: 'samsung', to: 'alphabet', type: 'partner', label: 'Galaxy AI·Gemini', since: '2024', detail: 'Galaxy 기기에 Gemini를 기본으로 넣는다.' },
  { from: 'kakao', to: 'openai', type: 'partner', label: '전략적 제휴', since: '2025-02', detail: '2025년 제휴를 맺고 카카오톡 안에서 ChatGPT를 제공한다.' },
  { from: 'naver', to: 'nvidia', type: 'partner', label: '소버린 AI 협력', since: '2025', detail: '국가·기업용 AI 인프라와 피지컬 AI에서 협력한다.' },
  { from: 'meta', to: 'naver', type: 'partner', label: 'AI 안경 지도', since: '2026-09', detail: '2026년 Meta AI 안경에 네이버지도 도보 길안내를 넣는다.' },
  { from: 'palantir', to: 'anthropic', type: 'partner', label: '공공·국방 AI', since: '2024-11', detail: '2024년 AWS와 함께 미국 정부·국방 고객에게 Claude를 제공하기로 했다.' },
  { from: 'databricks', to: 'anthropic', type: 'partner', label: '1억 달러 제휴', since: '2025-03', detail: '2025년 3월 5년간 데이터브릭스에서 Claude를 제공하는 제휴를 맺었다.' },
  { from: 'salesforce', to: 'anthropic', type: 'partner', label: 'Agentforce 모델', since: '2025', detail: 'Agentforce에서 Claude를 기본 모델로 제공한다.' },
  { from: 'salesforce', to: 'openai', type: 'partner', label: 'Agentforce·ChatGPT', since: '2025-10', detail: '2025년 10월 Agentforce와 ChatGPT를 서로 연결했다.' },
  { from: 'sap', to: 'mistral', type: 'partner', label: '유럽 소버린 AI', since: '2025-11', detail: '2025년 11월 SAP 플랫폼에서 Mistral 모델을 제공하는 소버린 AI 제휴를 확대했다.', source: { title: 'SAP and Mistral AI: A New Alliance for European Sovereign AI (SAP News)', url: 'https://news.sap.com/2025/11/sap-mistral-ai-new-alliance-european-sovereign-ai/' } },

  // ───────── 출신·분사 (출신 기업 → 새로 세운 기업) ─────────
  { from: 'openai', to: 'anthropic', type: 'alumni', label: 'OpenAI 연구진이 창업', since: '2021', detail: '2021년 다리오 아모데이 등 OpenAI 연구진이 나와 세웠다.' },
  { from: 'openai', to: 'ssi', type: 'alumni', label: '공동창업자 수츠케버', since: '2024', detail: 'OpenAI 공동창업자 일리야 수츠케버가 2024년 세웠다.' },
  { from: 'openai', to: 'thinking-machines', type: 'alumni', label: '전 CTO 무라티', since: '2025', detail: 'OpenAI CTO였던 미라 무라티가 2025년 세웠다.' },
  { from: 'openai', to: 'perplexity', type: 'alumni', label: 'CEO가 OpenAI 연구원 출신', since: '2022', detail: 'CEO 아라빈드 스리니바스가 OpenAI 연구원 출신이다.' },
  { from: 'alphabet', to: 'cohere', type: 'alumni', label: '트랜스포머 저자가 창업', since: '2019', detail: '구글 브레인에서 트랜스포머 논문을 쓴 에이단 고메즈가 세웠다.' },
  { from: 'alphabet', to: 'sakana', type: 'alumni', label: '구글 연구자 출신', since: '2023', detail: '구글 출신 데이비드 하와 트랜스포머 공저자 라이언 존스가 세웠다.' },
  { from: 'google-deepmind', to: 'mistral', type: 'alumni', label: 'CEO가 딥마인드 출신', since: '2023', detail: 'CEO 아르튀르 망슈가 딥마인드 출신이다.' },
  { from: 'meta', to: 'mistral', type: 'alumni', label: '라마 개발진 출신', since: '2023', detail: '공동창업자 기욤 랑플·티모테 라크루아가 Meta 출신이다.' },
  { from: 'naver', to: 'upstage', type: 'alumni', label: '네이버 클로바 출신', since: '2020', detail: '김성훈 대표 등 네이버 클로바 AI 출신이 세웠다.' },
  { from: 'scale-ai', to: 'meta', type: 'alumni', label: '창업자 왕 → Meta', since: '2025-06', detail: '창업자 알렉산더 왕이 2025년 Meta의 최고 AI 책임자로 옮겼다.' },
];
