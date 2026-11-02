// AI performance comparison: Epoch AI's test scores per model — a ranking for one test at a time,
// with each score's uncertainty, and how the best score has climbed since 2023. Lives next to the
// model timeline (#models ↔ #bench). Loaded before app.js; uses window.AIMap only at call time.
(() => {
  'use strict';

  const METRICS = window.AI_BENCH_METRICS || [];
  const METRIC = new Map(METRICS.map((m) => [m.id, m]));
  const TOP_N = 15;
  const CHART_H = 320;
  const PAD = { l: 46, r: 18, t: 16, b: 30 };
  const HIT_RADIUS = 10;
  const DAY = 86400000;
  const BASIS = {
    est: { label: '추정', tip: '여러 시험 결과를 통계 모형으로 묶어 낸 값이에요. 흐리게 표시해요.' },
    epoch: { label: 'Epoch 측정', tip: 'Epoch AI가 모든 모델을 같은 방식으로 직접 시험한 점수예요.' },
    ext: { label: '외부 집계', tip: '시험을 만든 곳의 리더보드 점수를 Epoch AI가 모은 값이에요.' },
  };
  const SETTINGS = { max: '최대', xhigh: '매우 높음', high: '높음', medium: '중간', low: '낮음', minimal: '최소' };

  const state = {
    metric: METRICS.length ? METRICS[0].id : '',
    bestPerCo: true, // one row per company: its best model on this test
    openOnly: false,
    favOnly: false,
    company: '',
    query: '',
    showAll: false,
  };

  let A = null; // window.AIMap
  let els = null;
  let models = null;
  let points = []; // drawn dots with positions, for hover
  let hot = null;
  let resizeFrame = 0;

  // ───────── Data ─────────
  function toTime(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  }

  function fmtMonth(date) {
    if (!date) return '';
    const [y, m] = date.split('-');
    return `${y}년 ${Number(m)}월`;
  }

  function fmtLong(date) {
    if (!date) return '날짜 미상';
    const [y, m, d] = date.split('-');
    return d ? `${y}년 ${Number(m)}월 ${Number(d)}일` : fmtMonth(date);
  }

  function load() {
    models = (window.AI_BENCH_MODELS || []).map((m) => {
      const c = m.company && A.byId.has(m.company) ? A.byId.get(m.company) : null;
      return {
        ...m,
        c,
        group: c ? c.id : m.org || m.name, // "per company" groups by map company, else by maker
        maker: c ? A.shortName(c) : m.org || '만든 곳 미상',
        t: m.date ? toTime(m.date) : null,
      };
    });
  }

  const metric = () => METRIC.get(state.metric);

  function matchesQuery(m) {
    const q = state.query;
    return !q || [m.name, m.maker, m.org || '', m.c ? m.c.nameKo : ''].some((s) => s.toLowerCase().includes(q));
  }

  // Models with a score on the current test that pass the filters (every model, not one per company).
  function scored() {
    const id = state.metric;
    return models.filter(
      (m) =>
        m.s[id] &&
        (!state.openOnly || m.open) &&
        (!state.favOnly || (m.c && A.favorites.has(m.c.id))) &&
        (!state.company || (m.c && m.c.id === state.company)) &&
        matchesQuery(m)
    );
  }

  function ranking(list) {
    const id = state.metric;
    const sorted = [...list].sort((a, b) => b.s[id].v - a.s[id].v || (b.t || 0) - (a.t || 0));
    if (!state.bestPerCo) return sorted;
    const seen = new Set();
    return sorted.filter((m) => !seen.has(m.group) && seen.add(m.group));
  }

  // ───────── Formatting ─────────
  function fmtValue(mt, v) {
    return mt.kind === 'index' ? String(Math.round(v)) : `${(v * 100).toFixed(1)}%`;
  }

  function fmtGap(mt, d) {
    return `${about(mt)}${mt.kind === 'index' ? `${Math.round(d)}점` : `${(d * 100).toFixed(1)}%p`}`;
  }

  // Estimates say "약" wherever their numbers appear in sentences.
  const about = (mt) => (mt.basis === 'est' ? '약 ' : '');
  const said = (mt, v) => `${about(mt)}${fmtValue(mt, v)}`;

  // A score as text: estimates are faint and say "약".
  function valueHTML(mt, sc) {
    const est = mt.basis === 'est';
    const range = sc.lo != null ? `${intervalName(mt)} ${fmtValue(mt, sc.lo)}~${fmtValue(mt, sc.hi)}` : '오차 범위 공개 안 됨';
    return `<span class="bn-val${est ? ' is-est' : ''}" title="${A.esc(range)}">${est ? '약 ' : ''}${fmtValue(mt, sc.v)}</span>`;
  }

  const intervalName = (mt) => (mt.basis === 'est' ? '90% 신뢰구간' : '95% 오차 범위');

  function settingText(sc) {
    const parts = [];
    if (sc.set) parts.push(`추론 ${SETTINGS[sc.set] || sc.set}`);
    if (sc.tool) parts.push(`도구 ${sc.tool}`);
    return parts.join(' · ');
  }

  // Score axis: tests in % run 0–100; the index has no zero, so it spans what is shown.
  function scale(mt, list) {
    if (mt.kind !== 'index') return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const id = mt.id;
    const lo = Math.min(...list.map((m) => m.s[id].lo ?? m.s[id].v));
    const hi = Math.max(...list.map((m) => m.s[id].hi ?? m.s[id].v));
    const step = hi - lo > 40 ? 20 : hi - lo > 16 ? 10 : 5;
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
    return { min, max, ticks };
  }

  // ───────── Shell ─────────
  function renderShell() {
    const esc = A.esc;
    const perCompany = new Map();
    for (const m of models) if (m.c) perCompany.set(m.c.id, (perCompany.get(m.c.id) || 0) + 1);
    const companyOpts = [...perCompany.entries()]
      .sort((a, b) => b[1] - a[1] || A.shortName(A.byId.get(a[0])).localeCompare(A.shortName(A.byId.get(b[0])), 'ko'))
      .map(([id, n]) => `<option value="${esc(id)}">${esc(A.shortName(A.byId.get(id)))} (${n})</option>`)
      .join('');
    els.root.innerHTML = `
      <div class="board__inner">
        <header class="board__header">
          <nav class="sub-tabs" aria-label="모델 화면"><a href="#models">출시 타임라인</a><a href="#bench" aria-current="page">성능 비교</a></nav>
          <h1 class="board__title">AI 성능 비교</h1>
          <p class="board__sub">Epoch AI가 모은 시험 점수로 모델 ${models.length}개의 실력을 비교해요 · 자료 ${esc(fmtLong(window.AI_BENCH_AS_OF || ''))} 기준</p>
        </header>
        <div class="board__filters">
          <div class="chips" role="group" aria-label="시험 고르기" data-ref="metrics">
            ${METRICS.map((mt) => `<button type="button" class="chip" data-metric="${esc(mt.id)}" aria-pressed="false" title="${esc(`${mt.nameKo} · ${mt.name}`)}">${esc(mt.chip)}</button>`).join('')}
          </div>
        </div>
        <div class="board__filters">
          <label class="switch"><input type="checkbox" data-ref="bestPerCo"><span class="switch__track" aria-hidden="true"></span>회사별 최고 모델만</label>
          <label class="switch"><input type="checkbox" data-ref="openOnly"><span class="switch__track" aria-hidden="true"></span>오픈 웨이트만</label>
          <label class="switch"><input type="checkbox" data-ref="favOnly"><span class="switch__track" aria-hidden="true"></span>관심 기업만</label>
          <select class="ml-select" data-ref="company" aria-label="기업 고르기"><option value="">모든 기업</option>${companyOpts}</select>
        </div>
        <section class="card bn-explain" data-ref="explain" aria-live="polite"></section>
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title" data-ref="rankTitle">순위</h2>
              <p class="card__desc" data-ref="rankDesc"></p>
            </div>
            <div class="ml-legend" aria-hidden="true">
              <span><span class="bn-key"></span>비공개 가중치</span>
              <span><span class="bn-key bn-key--open"></span>오픈 웨이트</span>
              <span><span class="bn-key bn-key--range"></span>오차 범위</span>
            </div>
          </div>
          <div data-ref="rank"></div>
        </section>
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">최고 기록은 어떻게 올라왔나요?</h2>
              <p class="card__desc">점 하나가 모델 하나 · 선은 그때까지의 최고 기록 · 점에 올리면 모델 이름</p>
            </div>
            <div class="ml-legend" aria-hidden="true">
              <span><span class="bn-key bn-key--muted"></span>비공개 가중치</span>
              <span><span class="bn-key bn-key--open bn-key--muted"></span>오픈 웨이트</span>
              <span><span class="bn-line"></span>비공개 최고 기록</span>
              <span><span class="bn-line bn-line--open"></span>오픈 웨이트 최고 기록</span>
            </div>
          </div>
          <div class="bn-chart-wrap" data-ref="chart"></div>
        </section>
        <p class="bn-foot">출처: Epoch AI, <a href="https://epoch.ai/benchmarks" target="_blank" rel="noopener noreferrer">Capabilities &amp; benchmarking ↗</a> (CC BY 4.0). 시험 문제와 외부 리더보드 점수의 권리는 각 시험을 만든 곳에 있어요. 같은 모델을 여러 설정(추론 강도 등)으로 시험했으면 가장 높은 점수를 보여줘요.</p>
      </div>`;
    for (const el of els.root.querySelectorAll('[data-ref]')) els[el.dataset.ref] = el;
  }

  // ───────── What the test is, and a plain reading of the result ─────────
  // Sentences avoid a particle right after a name ("Argon과" vs "Astra와"): 의/보다 read the same either way.
  function summary(mt, rank, all) {
    const id = mt.id;
    const out = [];
    const [top, second] = rank;
    const who = (m) => `${m.name}(${said(mt, m.s[id].v)})`;
    if (top && second) {
      const a = top.s[id];
      const b = second.s[id];
      if (a.lo == null || b.hi == null) out.push(`1위 ${who(top)}, 2위 ${who(second)}. 이 시험은 오차 범위가 공개되지 않아 작은 차이는 우연일 수 있어요.`);
      else if (a.lo <= b.hi) out.push(`1위 ${who(top)}·2위 ${who(second)}의 ${mt.basis === 'est' ? '90% 신뢰구간이' : '95% 오차 범위가'} 겹쳐요. 이 시험만으로는 누가 낫다고 말하기 어려워요.`);
      else out.push(`1위 ${who(top)}의 점수는 오차를 감안해도 2위 ${who(second)}보다 높아요.`);
    } else if (top) {
      out.push(`조건에 맞는 모델은 ${who(top)} 하나예요.`);
    }
    if (!state.openOnly) {
      const sorted = [...all].sort((x, y) => y.s[id].v - x.s[id].v);
      const open = sorted.find((m) => m.open);
      const closed = sorted.find((m) => !m.open);
      if (open && closed && closed.s[id].v > open.s[id].v) {
        out.push(`오픈 웨이트 중 최고는 ${open.name}(${open.maker})의 ${said(mt, open.s[id].v)}, 비공개 최고보다 ${fmtGap(mt, closed.s[id].v - open.s[id].v)} 낮아요.`);
      } else if (open && closed) {
        out.push(`오픈 웨이트인 ${open.name}(${open.maker})의 점수가 비공개 모델까지 포함한 전체 최고예요.`);
      }
    }
    return out;
  }

  function renderExplain(rank, all) {
    const esc = A.esc;
    const mt = metric();
    const b = BASIS[mt.basis];
    const lines = summary(mt, rank, all);
    els.explain.innerHTML = `
      <div class="bn-explain__head">
        <div>
          <h2 class="card__title">${esc(mt.nameKo)} <span class="bn-explain__en">${esc(mt.name)}</span></h2>
        </div>
        <span class="bn-basis bn-basis--${esc(mt.basis)}" title="${esc(b.tip)}">${esc(b.label)}</span>
      </div>
      <p class="bn-explain__what">${esc(mt.what)}</p>
      ${lines.length ? `<div class="bn-reading"><strong>한눈에</strong><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
      <details class="bn-more">
        <summary>어떻게 읽나요? · 주의할 점</summary>
        <p>${esc(mt.read)}</p>
        <p class="bn-caveat">${esc(mt.caveat)}</p>
        <p class="bn-sources">근거: ${mt.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join(' · ')}</p>
      </details>`;
  }

  // ───────── Ranking ─────────
  function logoHTML(m) {
    if (m.c) return `<button type="button" class="bn-logo" data-open="${A.esc(m.c.id)}" aria-label="${A.esc(m.maker)} 지도에서 보기">${A.logoHTML(m.c)}</button>`;
    // Makers that aren't on the map get initials, like a company whose logo failed to load.
    return `<span class="bn-logo">${A.logoHTML({ name: m.maker, category: 'none', logoDomain: null })}</span>`;
  }

  function rowHTML(m, i, mt, sc) {
    const esc = A.esc;
    const s = m.s[mt.id];
    const x = (v) => (((v - sc.min) / (sc.max - sc.min)) * 100).toFixed(2);
    const refs = [mt.random != null ? { v: mt.random, cls: 'is-random' } : null, mt.human ? { v: mt.human.value, cls: 'is-human' } : null]
      .filter(Boolean)
      .map((r) => `<span class="bn-ref ${r.cls}" style="left:${x(r.v)}%"></span>`)
      .join('');
    const range = s.lo != null ? `<span class="bn-range" style="left:${x(s.lo)}%;width:${(x(s.hi) - x(s.lo)).toFixed(2)}%"></span>` : '';
    const setting = settingText(s);
    const fav = m.c && A.favorites.has(m.c.id) ? '<span class="fav-mark" title="관심 기업">★</span>' : '';
    return `
      <li class="bn-row${m.open ? ' is-open' : ''}">
        <span class="bn-rank">${i + 1}</span>
        ${logoHTML(m)}
        <div class="bn-name">
          <strong>${esc(m.name)}${fav}</strong>
          <span class="bn-meta">${esc(m.maker)}${m.date ? ` · ${fmtMonth(m.date)}` : ''}${m.open ? ' · 오픈 웨이트' : ''}${setting ? ` · ${esc(setting)}` : ''}</span>
        </div>
        <div class="bn-track" aria-hidden="true">${refs}${range}<span class="bn-dot" style="left:${x(s.v)}%"></span></div>
        ${valueHTML(mt, s)}
      </li>`;
  }

  function axisHTML(mt, sc) {
    const x = (v) => (((v - sc.min) / (sc.max - sc.min)) * 100).toFixed(2);
    const ticks = sc.ticks.map((v) => `<span class="bn-tick" style="left:${x(v)}%">${mt.kind === 'index' ? v : `${Math.round(v * 100)}%`}</span>`).join('');
    const refs = [
      mt.random != null ? `<span class="bn-ref-label is-random" style="left:${x(mt.random)}%">찍기 ${Math.round(mt.random * 100)}%</span>` : '',
      mt.human ? `<span class="bn-ref-label is-human" style="left:${x(mt.human.value)}%">${A.esc(mt.human.label)} ${(mt.human.value * 100).toFixed(1).replace(/\.0$/, '')}%</span>` : '',
    ].join('');
    return `<div class="bn-axis" aria-hidden="true"><span></span><div class="bn-axis__track">${ticks}${refs}</div><span></span></div>`;
  }

  function renderRanking(rank) {
    const mt = metric();
    const company = state.company && A.byId.get(state.company);
    els.rankTitle.textContent = company ? `${A.shortName(company)} 모델 순위` : state.bestPerCo ? '회사별 최고 모델 순위' : '모델 순위';
    els.rankDesc.textContent = `${mt.nameKo} 점수가 높은 순 · 로고를 누르면 지도에서 열려요`;
    if (!rank.length) {
      els.rank.innerHTML = state.favOnly && !A.favorites.list().length
        ? '<p class="chart-empty">아직 관심 기업이 없어요. 기업에 별표(☆)를 달면 그 기업 모델만 골라 볼 수 있어요.</p>'
        : '<p class="chart-empty">이 시험 점수가 있는 모델이 조건에 없어요. 다른 시험이나 필터를 골라 보세요.</p>';
      return;
    }
    const shown = state.showAll ? rank : rank.slice(0, TOP_N);
    const sc = scale(mt, shown);
    els.rank.innerHTML = `
      ${axisHTML(mt, sc)}
      <ol class="bn-list">${shown.map((m, i) => rowHTML(m, i, mt, sc)).join('')}</ol>
      ${rank.length > TOP_N ? `<button type="button" class="link-btn bn-toggle" data-action="toggle-all">${state.showAll ? `위 ${TOP_N}개만 보기` : `모두 보기 (${rank.length}개)`}</button>` : ''}`;
  }

  // ───────── Record chart ─────────
  // Each model that beat every earlier one (by release date) sets a new record.
  function records(list, id) {
    const out = [];
    let best = -Infinity;
    for (const m of [...list].sort((a, b) => a.t - b.t || b.s[id].v - a.s[id].v)) {
      if (m.s[id].v > best) {
        best = m.s[id].v;
        out.push(m);
      }
    }
    return out;
  }

  function renderChart(list) {
    const esc = A.esc;
    const mt = metric();
    const id = mt.id;
    A.hideTooltip();
    hot = null;
    points = [];
    const dated = list.filter((m) => m.t);
    if (dated.length < 2) {
      els.chart.innerHTML = '<p class="chart-empty">흐름을 그릴 만큼 모델이 없어요.</p>';
      return;
    }
    const W = Math.max(320, els.chart.clientWidth);
    const H = CHART_H;
    const now = Date.now();
    const t0 = Math.min(...dated.map((m) => m.t));
    const start = Date.UTC(new Date(t0).getUTCFullYear(), Math.floor(new Date(t0).getUTCMonth() / 3) * 3, 1);
    const end = now + 20 * DAY;
    let yMin = 0;
    let yMax = 1;
    let yTicks = [0, 0.25, 0.5, 0.75, 1];
    if (mt.kind === 'index') {
      const vs = dated.map((m) => m.s[id].v);
      const step = Math.max(...vs) - Math.min(...vs) > 40 ? 20 : 10;
      yMin = Math.floor(Math.min(...vs) / step) * step;
      yMax = Math.ceil(Math.max(...vs) / step) * step;
      yTicks = [];
      for (let v = yMin; v <= yMax; v += step) yTicks.push(v);
    }
    const x = (t) => PAD.l + ((t - start) / (end - start)) * (W - PAD.l - PAD.r);
    const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const parts = [];

    for (const v of yTicks) {
      parts.push(`<line class="bn-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`);
      parts.push(`<text class="bn-axis-text" x="${PAD.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${mt.kind === 'index' ? v : `${Math.round(v * 100)}%`}</text>`);
    }
    for (let yr = new Date(start).getUTCFullYear(); Date.UTC(yr, 0, 1) < end; yr++) {
      const t = Date.UTC(yr, 0, 1);
      if (t < start) continue;
      parts.push(`<line class="bn-year" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}"/>`);
      parts.push(`<text class="bn-axis-text" x="${(x(t) + 4).toFixed(1)}" y="${H - PAD.b + 18}">${yr}</text>`);
    }
    // Reference levels (guessing, people) as labeled dashed lines.
    for (const r of [mt.random != null ? { v: mt.random, label: `찍기 ${Math.round(mt.random * 100)}%` } : null, mt.human ? { v: mt.human.value, label: `${mt.human.label} ${(mt.human.value * 100).toFixed(1).replace(/\.0$/, '')}%` } : null]) {
      if (!r) continue;
      parts.push(`<line class="bn-refline" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(r.v).toFixed(1)}" y2="${y(r.v).toFixed(1)}"/>`);
      parts.push(`<text class="bn-ref-text" x="${PAD.l + 6}" y="${(y(r.v) - 5).toFixed(1)}">${esc(r.label)}</text>`);
    }

    // Record lines, closed and open weights, stepping until the next record and on to today.
    const lines = [];
    for (const [cls, group, label] of [['', dated.filter((m) => !m.open), '비공개 최고'], ['is-open', dated.filter((m) => m.open), '오픈 웨이트 최고']]) {
      const rec = records(group, id);
      if (!rec.length) continue;
      let d = '';
      rec.forEach((m, i) => {
        const px = x(m.t).toFixed(1);
        const py = y(m.s[id].v).toFixed(1);
        d += i ? ` H${px} V${py}` : `M${px} ${py}`;
      });
      d += ` H${x(now).toFixed(1)}`;
      lines.push(`<path class="bn-record ${cls}" d="${d}"/>`);
      const last = rec[rec.length - 1];
      lines.push({ last, cls, label });
    }

    // Dots: older first so newer ones sit on top.
    const dots = [];
    for (const m of [...dated].sort((a, b) => a.t - b.t)) {
      const cx = x(m.t);
      const cy = y(m.s[id].v);
      dots.push(`<circle class="bn-pt${m.open ? ' is-open' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" data-id="${esc(m.id)}"/>`);
      points.push({ m, cx, cy });
    }

    // Label the current record holders at the line ends (one per line), nudged apart if close.
    // Top to bottom, each kept at least one line below the one above it.
    const labels = [];
    const ends = lines.filter((l) => typeof l === 'object');
    let prevY = -Infinity;
    for (const l of ends.sort((a, b) => b.last.s[id].v - a.last.s[id].v)) {
      const ly = Math.max(PAD.t + 10, y(l.last.s[id].v) - 8, prevY + 14);
      prevY = ly;
      const text = `${l.label}: ${l.last.name}`;
      labels.push(`<text class="bn-record-label ${l.cls}" x="${(W - PAD.r).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end">${esc(text)}</text>`);
    }

    els.chart.innerHTML = `
      <svg class="bn-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${mt.nameKo} 점수와 출시일 (${dated.length}개 모델). 위 순위 목록에서 같은 점수를 볼 수 있어요.`)}">
        ${parts.join('')}
        ${lines.filter((l) => typeof l === 'string').join('')}
        ${dots.join('')}
        ${labels.join('')}
      </svg>`;
  }

  function nearestPoint(evt) {
    const svg = els.chart.querySelector('.bn-chart');
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const px = evt.clientX - box.left;
    const py = evt.clientY - box.top;
    let best = null;
    let bestD = HIT_RADIUS;
    for (const p of points) {
      const d = Math.hypot(p.cx - px, p.cy - py);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  function setHot(p) {
    const id = p ? p.m.id : null;
    if (hot === id) return;
    hot = id;
    for (const el of els.chart.querySelectorAll('.bn-pt.is-hot')) el.classList.remove('is-hot');
    if (p) {
      const el = [...els.chart.querySelectorAll('.bn-pt')].find((c) => c.dataset.id === id);
      if (el) {
        el.classList.add('is-hot');
        el.parentNode.appendChild(el); // on top of its neighbours
      }
    }
  }

  function pointTip(p, at) {
    const mt = metric();
    const m = p.m;
    const s = m.s[mt.id];
    A.showTooltip(at, (tip) => {
      const title = document.createElement('div');
      title.className = 'viz-tooltip__title';
      title.textContent = m.name;
      const row = document.createElement('div');
      row.className = 'viz-tooltip__row';
      const value = document.createElement('strong');
      value.textContent = `${mt.basis === 'est' ? '약 ' : ''}${fmtValue(mt, s.v)}`;
      const name = document.createElement('span');
      name.textContent = mt.nameKo;
      row.append(name, value);
      tip.append(title, row);
      const lines = [
        `${m.maker} · ${fmtLong(m.date)}${m.open ? ' · 오픈 웨이트' : ''}`,
        s.lo != null ? `${intervalName(mt)} ${fmtValue(mt, s.lo)}~${fmtValue(mt, s.hi)}` : '',
        settingText(s),
      ];
      for (const text of lines.filter(Boolean)) {
        const line = document.createElement('div');
        line.className = 'viz-tooltip__line';
        line.textContent = text;
        tip.append(line);
      }
    });
  }

  // ───────── Render ─────────
  function render() {
    const all = scored();
    const rank = ranking(all);
    renderExplain(rank, all);
    renderRanking(rank);
    renderChart(all);
  }

  function syncControls() {
    for (const b of els.metrics.querySelectorAll('[data-metric]')) b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric));
    els.bestPerCo.checked = state.bestPerCo;
    els.bestPerCo.disabled = Boolean(state.company);
    els.openOnly.checked = state.openOnly;
    els.favOnly.checked = state.favOnly;
    els.company.value = state.company;
  }

  // ───────── Events ─────────
  function bind() {
    els.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-metric], [data-open], [data-action]');
      if (!t) return;
      if (t.dataset.metric) {
        state.metric = t.dataset.metric;
        state.showAll = false;
        A.storageSet('aimap-bench-metric', state.metric);
        syncControls();
        render();
      } else if (t.dataset.open) {
        A.openCompany(t.dataset.open);
      } else if (t.dataset.action === 'toggle-all') {
        state.showAll = !state.showAll;
        renderRanking(ranking(scored()));
      }
    });
    els.root.addEventListener('change', (e) => {
      if (e.target === els.bestPerCo) state.bestPerCo = els.bestPerCo.checked;
      else if (e.target === els.openOnly) state.openOnly = els.openOnly.checked;
      else if (e.target === els.favOnly) state.favOnly = els.favOnly.checked;
      else if (e.target === els.company) state.company = els.company.value;
      else return;
      state.showAll = false;
      syncControls();
      render();
    });
    els.chart.addEventListener('pointermove', (e) => {
      const p = nearestPoint(e);
      setHot(p);
      if (p) pointTip(p, { x: e.clientX, y: e.clientY });
      else A.hideTooltip();
    });
    els.chart.addEventListener('pointerleave', () => {
      setHot(null);
      A.hideTooltip();
    });
    els.root.addEventListener('scroll', () => A.hideTooltip(), { passive: true });
    window.addEventListener('resize', () => {
      if (els.root.hidden) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => renderChart(scored()));
    });
    window.addEventListener('aimap:favorites', () => {
      if (!els.root.hidden) render();
    });
  }

  function ensure() {
    if (els) return;
    A = window.AIMap;
    els = { root: document.getElementById('bench') };
    const saved = A.storageGet('aimap-bench-metric');
    if (saved && METRIC.has(saved)) state.metric = saved;
    load();
    renderShell();
    bind();
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapBench = {
    show() {
      ensure();
      els.root.hidden = false;
      syncControls();
      render();
    },
    hide() {
      if (els) els.root.hidden = true;
      if (A) A.hideTooltip();
    },
    setQuery(q) {
      state.query = q;
      if (els && !els.root.hidden) render();
    },
  };
})();
