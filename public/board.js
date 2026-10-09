// Comparison board for listed companies: market-cap heatmap, indexed return chart, sortable table.
// Loaded before app.js; uses the helpers app.js publishes on window.AIMap only at call time.
(() => {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const REFRESH_MS = 5 * 60 * 1000;
  const MAX_COMPARE = 6; // categorical slots 1–6, validated as an adjacent set in both themes
  const COMPARE_KEY = 'aimap-board-compare';
  const PERIOD_KEY = 'aimap-board-period';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // heat: |return| thresholds (%) for the three steps on each arm of the diverging scale.
  const PERIODS = [
    { id: '1d', label: '1일', chart: '1m', heat: [0.5, 2, 4] },
    { id: '1m', label: '1개월', chart: '1m', heat: [2, 6, 12] },
    { id: '3m', label: '3개월', chart: '3m', heat: [4, 12, 25] },
    { id: 'ytd', label: 'YTD', chart: 'ytd', heat: [8, 25, 60] },
    { id: '1y', label: '1년', chart: '1y', heat: [8, 25, 60] },
  ];
  const CHART_LABEL = { '1m': '최근 1개월', '3m': '최근 3개월', ytd: '올해 들어', '1y': '최근 1년' };
  const RETURN_KEYS = ['1d', '1m', '3m', 'ytd', '1y'];

  const state = {
    data: null,
    error: null,
    loading: false,
    period: '1m',
    category: 'all',
    query: '',
    sort: { key: 'marketCapUsd', dir: 'desc' },
    compare: new Map(), // id -> series slot (1..6); a company keeps its slot until removed
    hover: null, // chart crosshair day
  };

  let els = null;
  let A = null; // window.AIMap
  let refreshTimer = null;

  // ───────── Helpers ─────────
  const periodOf = (id) => PERIODS.find((p) => p.id === id) || PERIODS[1];
  const shortName = (c) => c.nameKo.split(' · ')[0].replace(/\s*\(.*?\)/g, '');
  const rowById = (id) => state.data && state.data.rows.find((r) => r.id === id);

  function fmtUsdCompact(v) {
    if (v == null) return '–';
    return `${new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)} 달러`;
  }

  function fmtSignedPct(v) {
    if (v == null) return '–';
    return `${v > 0 ? '+' : ''}${v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}%`;
  }

  function trendArrow(v) {
    return v > 0 ? '▲' : v < 0 ? '▼' : '';
  }

  function heatClass(v, period) {
    if (v == null) return 'hm-na';
    const [t1, t2, t3] = period.heat;
    const a = Math.abs(v);
    const step = a < t1 ? 0 : a < t2 ? 1 : a < t3 ? 2 : 3;
    return step === 0 ? 'hm-0' : `hm-${v > 0 ? 'up' : 'down'}${step}`;
  }

  function closeAsOf(points, day) {
    let close = null;
    for (const [d, c] of points) {
      if (d > day) break;
      close = c;
    }
    return close;
  }

  function lastDayOf(rows) {
    return Math.max(...rows.map((r) => r.points[r.points.length - 1][0]));
  }

  function chartStartDay(chartId, lastDay) {
    if (chartId === 'ytd') return Math.floor(Date.UTC(new Date(lastDay * DAY_MS).getUTCFullYear(), 0, 1) / DAY_MS) - 1;
    return lastDay - { '1m': 30, '3m': 91, '1y': 365 }[chartId];
  }

  // Returns indexed to 0% at the period start; a company listed later starts at its first close.
  function indexedSeries(row, startDay) {
    const pts = row.points;
    let base = closeAsOf(pts, startDay);
    let from = startDay;
    if (base == null) {
      const first = pts.find(([d]) => d > startDay);
      if (!first) return [];
      [from, base] = first;
    }
    const out = [[from, 0]];
    for (const [d, c] of pts) if (d > from) out.push([d, (c / base - 1) * 100]);
    return out;
  }

  function valueAt(series, day) {
    let v = null;
    for (const [d, y] of series) {
      if (d > day) break;
      v = y;
    }
    return v;
  }

  function niceStep(span, target = 5) {
    const raw = span / target;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  }

  function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(text, px, weight = 700) {
    measureCtx.font = `${weight} ${px}px 'Pretendard Variable', Pretendard, system-ui, sans-serif`;
    return measureCtx.measureText(text).width;
  }

  // Squarified treemap: rectangles for `values` (sorted descending) inside x,y,w,h.
  function squarify(values, x, y, w, h) {
    const total = values.reduce((a, b) => a + b, 0);
    if (!total || w <= 0 || h <= 0) return values.map(() => ({ x, y, w: 0, h: 0 }));
    const areas = values.map((v) => (v / total) * w * h);
    const worst = (row, side) => {
      const s = row.reduce((a, b) => a + b, 0);
      return Math.max((side * side * Math.max(...row)) / (s * s), (s * s) / (side * side * Math.min(...row)));
    };
    const rects = [];
    let i = 0;
    while (i < areas.length) {
      const side = Math.min(w, h);
      const row = [areas[i]];
      let j = i + 1;
      while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
      const thick = row.reduce((a, b) => a + b, 0) / side;
      let offset = 0;
      for (const a of row) {
        const len = a / thick;
        rects.push(w >= h ? { x, y: y + offset, w: thick, h: len } : { x: x + offset, y, w: len, h: thick });
        offset += len;
      }
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      i = j;
    }
    return rects;
  }

  // ───────── Data & persistence ─────────
  function loadPrefs() {
    const period = A.storageGet(PERIOD_KEY);
    if (PERIODS.some((p) => p.id === period)) state.period = period;
    try {
      const saved = JSON.parse(A.storageGet(COMPARE_KEY) || 'null');
      if (Array.isArray(saved)) state.compare = new Map(saved.filter(([id, slot]) => A.byId.has(id) && slot >= 1 && slot <= MAX_COMPARE));
    } catch { /* ignore bad saved state */ }
  }

  function saveCompare() {
    A.storageSet(COMPARE_KEY, JSON.stringify([...state.compare]));
  }

  async function load() {
    clearTimeout(refreshTimer);
    if (location.protocol === 'file:') {
      state.error = '로컬 서버(node server.js)로 열면 비교 보드가 표시돼요.';
      renderAll();
      return;
    }
    state.loading = true;
    els.root.classList.add('is-refreshing');
    try {
      const res = await fetch('api/board');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      state.error = null;
      if (!state.compare.size) {
        // Default comparison: the five largest by market cap.
        [...state.data.rows]
          .sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0))
          .slice(0, 5)
          .forEach((r, i) => state.compare.set(r.id, i + 1));
      }
    } catch (err) {
      console.warn('[AI Map] 비교 보드 조회 실패:', err);
      if (!state.data) state.error = '시세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
    state.loading = false;
    els.root.classList.remove('is-refreshing');
    renderAll();
    refreshTimer = setTimeout(() => {
      if (!els.root.hidden) load();
    }, REFRESH_MS);
  }

  function filteredRows() {
    if (!state.data) return [];
    const q = state.query;
    return state.data.rows.filter((r) => {
      const c = A.byId.get(r.id);
      if (state.category !== 'all' && c.category !== state.category) return false;
      if (q && !`${c.name} ${c.nameKo} ${r.ticker}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function toggleCompare(id) {
    if (state.compare.has(id)) {
      state.compare.delete(id);
    } else {
      if (state.compare.size >= MAX_COMPARE) return;
      const used = new Set(state.compare.values());
      let slot = 1;
      while (used.has(slot)) slot++;
      state.compare.set(id, slot);
    }
    saveCompare();
    renderHeatmap();
    renderChart();
    renderTable();
  }

  // ───────── Shell ─────────
  function renderShell() {
    els.root.innerHTML = `
      <div class="board__inner">
        <header class="board__header">
          <h1 class="board__title">상장 AI 기업 비교</h1>
          <p class="board__sub" data-ref="sub"></p>
        </header>

        <div class="board__filters">
          <div class="segmented" role="group" aria-label="기간" data-ref="periods">
            ${PERIODS.map((p) => `<button type="button" data-period="${p.id}" aria-pressed="false">${p.label}</button>`).join('')}
          </div>
          <div class="chips" role="group" aria-label="분야" data-ref="cats">
            ${A.CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false">${c.id === 'all' ? '' : `<span class="chip__dot" style="--dot: var(--cat-${c.id})"></span>`}${A.esc(c.label)}</button>`).join('')}
          </div>
        </div>

        <p class="board__error" data-ref="error" hidden></p>
        <div class="stat-row" data-ref="stats"></div>

        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">시가총액 히트맵</h2>
              <p class="card__desc">크기는 시가총액(달러 환산), 색은 <span data-ref="heatPeriod"></span> 수익률 · 타일을 누르면 아래 비교 차트에 추가돼요</p>
            </div>
            <div class="heat-legend" data-ref="heatLegend" aria-label="색 범례"></div>
          </div>
          <div class="treemap" data-ref="treemap"></div>
        </section>

        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">수익률 비교</h2>
              <p class="card__desc"><span data-ref="chartPeriod"></span> 기간 시작일을 0%로 맞춘 누적 수익률 · 최대 ${MAX_COMPARE}개</p>
            </div>
          </div>
          <div class="series-legend" data-ref="legend"></div>
          <div class="linechart" data-ref="chart"></div>
        </section>

        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">전체 종목</h2>
              <p class="card__desc">열 제목을 누르면 정렬돼요 · 체크하면 비교 차트에 추가돼요 · 기업명을 누르면 지도에서 열려요</p>
            </div>
          </div>
          <div class="table-wrap"><table class="board-table" data-ref="table"></table></div>
        </section>
      </div>`;
    for (const el of els.root.querySelectorAll('[data-ref]')) els[el.dataset.ref] = el;
  }

  // ───────── Filters & stats ─────────
  function renderFilters() {
    for (const b of els.periods.querySelectorAll('[data-period]')) b.setAttribute('aria-pressed', String(b.dataset.period === state.period));
    for (const b of els.cats.querySelectorAll('[data-cat]')) b.setAttribute('aria-pressed', String(b.dataset.cat === state.category));
    const p = periodOf(state.period);
    els.heatPeriod.textContent = p.id === '1d' ? '전일 대비' : `${p.label}`;
    els.chartPeriod.textContent = CHART_LABEL[p.chart] + (p.id === '1d' ? '(1일 선택 시)' : '');

    const d = state.data;
    if (d) {
      const fx = d.fx.KRW ? ` · 환율 1달러 = ${Math.round(d.fx.KRW).toLocaleString('ko-KR')}원` : '';
      els.sub.textContent = `${d.rows.length}개 상장사 · ${A.fmtClock(d.generatedAt)} 기준 지연 시세 · 시가총액은 달러 환산${fx}`;
    }
    els.error.hidden = !state.error;
    els.error.textContent = state.error || '';
  }

  function renderStats() {
    const rows = filteredRows();
    const key = state.period;
    const p = periodOf(key);
    const withRet = rows.filter((r) => r.returns[key] != null);
    const up = withRet.filter((r) => r.returns[key] > 0).length;
    const down = withRet.filter((r) => r.returns[key] < 0).length;
    const sorted = [...withRet].sort((a, b) => b.returns[key] - a.returns[key]);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const total = rows.reduce((s, r) => s + (r.marketCapUsd || 0), 0);
    const tile = (label, value, sub, cls = '') => `
      <div class="stat">
        <span class="stat__label">${label}</span>
        <span class="stat__value ${cls}">${value}</span>
        <span class="stat__sub">${sub}</span>
      </div>`;
    const who = (r) => (r ? A.esc(shortName(A.byId.get(r.id))) : '–');
    els.stats.innerHTML = rows.length
      ? [
          tile('시가총액 합계', A.esc(fmtUsdCompact(total)), `${rows.length}개 기업`),
          tile(`${p.label} 상승 · 하락`, `<span class="is-up">${up}</span> <span class="stat__slash">/</span> <span class="is-down">${down}</span>`, `${withRet.length}개 중 · 보합 ${withRet.length - up - down}`),
          tile(`${p.label} 최고`, best ? `${trendArrow(best.returns[key])} ${fmtSignedPct(best.returns[key])}` : '–', who(best), best ? A.trendClass(best.returns[key]) : ''),
          tile(`${p.label} 최저`, worst ? `${trendArrow(worst.returns[key])} ${fmtSignedPct(worst.returns[key])}` : '–', who(worst), worst ? A.trendClass(worst.returns[key]) : ''),
        ].join('')
      : '';
  }

  // ───────── Heatmap ─────────
  function renderHeatLegend() {
    const [t1, t2, t3] = periodOf(state.period).heat;
    const steps = ['hm-down3', 'hm-down2', 'hm-down1', 'hm-0', 'hm-up1', 'hm-up2', 'hm-up3'];
    const ticks = [-t3, -t2, -t1, t1, t2, t3].map((t) => `${t > 0 ? '+' : ''}${t}%`);
    els.heatLegend.innerHTML = `
      <div class="heat-legend__swatches">${steps.map((s) => `<span class="${s}"></span>`).join('')}</div>
      <div class="heat-legend__ticks">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>`;
  }

  function renderHeatmap() {
    renderHeatLegend();
    const box = els.treemap;
    const W = box.clientWidth;
    const H = box.clientHeight;
    const period = periodOf(state.period);
    const rows = filteredRows().filter((r) => r.marketCapUsd > 0);
    if (!rows.length || !W) {
      box.innerHTML = state.data && !state.data.hasMarketCap ? '<p class="chart-empty">시가총액 정보를 불러오지 못했어요.</p>' : '';
      return;
    }

    const groups = A.CATEGORIES.filter((c) => c.id !== 'all')
      .map((cat) => {
        const items = rows.filter((r) => A.byId.get(r.id).category === cat.id).sort((a, b) => b.marketCapUsd - a.marketCapUsd);
        return { cat, items, total: items.reduce((s, r) => s + r.marketCapUsd, 0) };
      })
      .filter((g) => g.items.length)
      .sort((a, b) => b.total - a.total);

    const GROUP_GAP = 6;
    const html = [];
    squarify(groups.map((g) => g.total), 0, 0, W, H).forEach((gr, gi) => {
      const g = groups[gi];
      const gx = gr.x + (gr.x > 0 ? GROUP_GAP / 2 : 0);
      const gy = gr.y + (gr.y > 0 ? GROUP_GAP / 2 : 0);
      const gw = gr.w - (gr.x > 0 ? GROUP_GAP / 2 : 0) - (gr.x + gr.w < W - 1 ? GROUP_GAP / 2 : 0);
      const gh = gr.h - (gr.y > 0 ? GROUP_GAP / 2 : 0) - (gr.y + gr.h < H - 1 ? GROUP_GAP / 2 : 0);
      // Longest header that fits: "분야 · 합계" → "분야" → none.
      const label = [`${g.cat.label} · ${fmtUsdCompact(g.total)}`, g.cat.label].find((l) => gw > textWidth(l, 12, 600) + 8);
      const head = gh > 60 && label ? 20 : 0;
      if (head) html.push(`<div class="hm-group" style="left:${gx}px;top:${gy}px;width:${gw}px">${A.esc(label)}</div>`);

      squarify(g.items.map((r) => r.marketCapUsd), gx, gy + head, gw, gh - head).forEach((t, ti) => {
        const r = g.items[ti];
        const c = A.byId.get(r.id);
        const ret = r.returns[period.id];
        // 2px surface gap between tiles: inset each tile by 1px on every side.
        const x = t.x + 1;
        const y = t.y + 1;
        const w = Math.max(0, t.w - 2);
        const h = Math.max(0, t.h - 2);
        const name = shortName(c);
        const value = ret == null ? '신규 상장' : fmtSignedPct(ret); // listed after the period start
        // Size text to the tile, stepping down until the name fits; below 11px it moves to the tooltip.
        let fs = Math.max(11, Math.min(20, Math.sqrt(w * h) / 8));
        while (fs > 11 && textWidth(name, fs) > w - 12) fs -= 1;
        const fitsName = h >= fs + 12 && textWidth(name, fs) <= w - 12;
        const fitsValue = fitsName && h >= fs * 2.4 + 12 && textWidth(value, fs * 0.85, 600) <= w - 12;
        const slot = state.compare.get(r.id);
        html.push(`
          <button type="button" class="hm-tile ${heatClass(ret, period)}" data-id="${r.id}" aria-pressed="${Boolean(slot)}"
            aria-label="${A.esc(`${name} ${value}`)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--fs:${fs.toFixed(1)}px">
            ${slot ? `<span class="hm-tile__key" style="--key: var(--series-${slot})"></span>` : ''}
            ${fitsName ? `<span class="hm-tile__name">${A.esc(name)}</span>` : ''}
            ${fitsValue ? `<span class="hm-tile__value">${value}</span>` : ''}
          </button>`);
      });
    });
    box.innerHTML = html.join('');
  }

  // ───────── Line chart ─────────
  function renderLegend(visible) {
    const hidden = [...state.compare.keys()].filter((id) => !visible.some((s) => s.row.id === id));
    els.legend.innerHTML =
      visible
        .map(
          (s) => `
        <span class="series-chip">
          <span class="series-chip__key" style="--key: var(--series-${s.slot})"></span>
          ${A.esc(shortName(A.byId.get(s.row.id)))}
          <button type="button" class="series-chip__remove" data-remove="${s.row.id}" aria-label="${A.esc(shortName(A.byId.get(s.row.id)))} 비교에서 빼기">×</button>
        </span>`
        )
        .join('') +
      (hidden.length ? `<span class="series-legend__hint">필터로 숨긴 비교 기업 ${hidden.length}개</span>` : '');
  }

  function renderChart() {
    const box = els.chart;
    box.textContent = '';
    if (!state.data) return;
    const period = periodOf(state.period);
    const rowsAll = state.data.rows;
    const visibleIds = new Set(filteredRows().map((r) => r.id));
    const selected = [...state.compare.entries()]
      .map(([id, slot]) => ({ row: rowById(id), slot }))
      .filter((s) => s.row && visibleIds.has(s.row.id))
      .sort((a, b) => a.slot - b.slot);
    renderLegend(selected);

    if (!selected.length) {
      box.innerHTML = '<p class="chart-empty">표에서 체크하거나 히트맵 타일을 눌러 비교할 기업을 골라 주세요.</p>';
      return;
    }

    const lastDay = lastDayOf(rowsAll);
    const startDay = chartStartDay(period.chart, lastDay);
    const series = selected.map((s) => ({ ...s, pts: indexedSeries(s.row, startDay) })).filter((s) => s.pts.length);
    const allVals = series.flatMap((s) => s.pts.map(([, v]) => v));
    let yMin = Math.min(0, ...allVals);
    let yMax = Math.max(0, ...allVals);
    const pad = (yMax - yMin) * 0.08 || 1;
    yMin -= pad;
    yMax += pad;
    const step = niceStep(yMax - yMin, 5);
    yMin = Math.floor(yMin / step) * step;
    yMax = Math.ceil(yMax / step) * step;

    const W = box.clientWidth;
    const H = A.isMobile() ? 260 : 320;
    const labelled = series.length <= 4; // ≤4 series also get direct end labels
    const M = { top: 12, right: labelled ? 118 : 16, bottom: 28, left: 52 };
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const x = (d) => M.left + ((d - startDay) / (lastDay - startDay)) * iw;
    const y = (v) => M.top + (1 - (v - yMin) / (yMax - yMin)) * ih;

    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'lc', role: 'img', 'aria-label': `${CHART_LABEL[period.chart]} 누적 수익률 비교` }, box);

    // y grid + ticks (solid hairlines; the 0% baseline one step stronger)
    for (let v = yMin; v <= yMax + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      svg('line', { x1: M.left, x2: M.left + iw, y1: yy, y2: yy, class: Math.abs(v) < 1e-9 ? 'lc-base' : 'lc-grid' }, root);
      const t = svg('text', { x: M.left - 8, y: yy + 4, class: 'lc-tick', 'text-anchor': 'end' }, root);
      t.textContent = `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}%`;
    }

    // x ticks: month starts for long ranges, weekly otherwise
    const ticks = [];
    if (lastDay - startDay > 62) {
      const dt = new Date(startDay * DAY_MS);
      let m = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
      const every = lastDay - startDay > 200 ? 2 : 1;
      let k = 0;
      while (m.getTime() / DAY_MS <= lastDay) {
        if (k++ % every === 0) ticks.push([m.getTime() / DAY_MS, `${m.getUTCMonth() + 1}월`]);
        m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
      }
    } else {
      for (let d = lastDay; d > startDay + 2; d -= 7) {
        const dt = new Date(d * DAY_MS);
        ticks.unshift([d, `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`]);
      }
    }
    for (const [d, label] of ticks) {
      const t = svg('text', { x: x(d), y: H - 8, class: 'lc-tick', 'text-anchor': 'middle' }, root);
      t.textContent = label;
    }

    // lines + end markers
    for (const s of series) {
      const dAttr = s.pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join('');
      svg('path', { d: dAttr, class: 'lc-line', style: `--key: var(--series-${s.slot})` }, root);
      const [ld, lv] = s.pts[s.pts.length - 1];
      svg('circle', { cx: x(ld), cy: y(lv), r: 4, class: 'lc-dot', style: `--key: var(--series-${s.slot})` }, root);
    }

    // direct end labels, nudged apart so they never overlap
    if (labelled) {
      const labels = series
        .map((s) => {
          const [ld, lv] = s.pts[s.pts.length - 1];
          return { s, ld, lv, y: y(lv) };
        })
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 16);
      const overflow = labels.length ? labels[labels.length - 1].y - (M.top + ih) : 0;
      if (overflow > 0) labels.forEach((l) => (l.y -= overflow));
      for (const l of labels) {
        const t = svg('text', { x: x(l.ld) + 10, y: l.y + 4, class: 'lc-endlabel' }, root);
        const name = svg('tspan', {}, t);
        name.textContent = `${shortName(A.byId.get(l.s.row.id))} `;
        const val = svg('tspan', { class: 'lc-endlabel__value' }, t);
        val.textContent = fmtSignedPct(l.lv);
      }
    }

    // crosshair: hairline snaps to the nearest trading day; one tooltip lists every series
    const days = [...new Set(series.flatMap((s) => s.pts.map(([d]) => d)))].sort((a, b) => a - b);
    const cross = svg('line', { y1: M.top, y2: M.top + ih, class: 'lc-cross', visibility: 'hidden' }, root);
    const hoverDots = series.map((s) => svg('circle', { r: 4, class: 'lc-dot', style: `--key: var(--series-${s.slot})`, visibility: 'hidden' }, root));
    const hit = svg('rect', { x: M.left, y: M.top, width: iw, height: ih, class: 'lc-hit', tabindex: 0, 'aria-label': '차트 탐색: 좌우 화살표로 날짜 이동' }, root);

    const show = (idx, clientPoint) => {
      const day = days[Math.max(0, Math.min(days.length - 1, idx))];
      state.hover = day;
      const cx = x(day);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.setAttribute('visibility', 'visible');
      const readings = series.map((s, i) => {
        const v = valueAt(s.pts, day);
        if (v == null) hoverDots[i].setAttribute('visibility', 'hidden');
        else {
          hoverDots[i].setAttribute('cx', cx);
          hoverDots[i].setAttribute('cy', y(v));
          hoverDots[i].setAttribute('visibility', 'visible');
        }
        return { s, v };
      });
      const dt = new Date(day * DAY_MS);
      const rect = root.getBoundingClientRect();
      const anchor = clientPoint || { x: rect.left + cx, y: rect.top + M.top + 20 };
      A.showTooltip(anchor, (tip) => {
        const title = document.createElement('div');
        title.className = 'viz-tooltip__title';
        title.textContent = `${dt.getUTCFullYear()}년 ${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일`;
        tip.appendChild(title);
        readings
          .filter((r) => r.v != null)
          .sort((a, b) => b.v - a.v)
          .forEach(({ s, v }) => {
            const row = document.createElement('div');
            row.className = 'viz-tooltip__row';
            const key = document.createElement('span');
            key.className = 'viz-tooltip__key';
            key.style.setProperty('--key', `var(--series-${s.slot})`);
            const val = document.createElement('strong');
            val.textContent = fmtSignedPct(v);
            const name = document.createElement('span');
            name.textContent = shortName(A.byId.get(s.row.id));
            row.append(key, val, name);
            tip.appendChild(row);
          });
      });
    };
    const hide = () => {
      state.hover = null;
      cross.setAttribute('visibility', 'hidden');
      hoverDots.forEach((d) => d.setAttribute('visibility', 'hidden'));
      A.hideTooltip();
    };
    const nearestIdx = (px) => {
      const day = startDay + ((px - M.left) / iw) * (lastDay - startDay);
      let best = 0;
      days.forEach((d, i) => {
        if (Math.abs(d - day) < Math.abs(days[best] - day)) best = i;
      });
      return best;
    };
    hit.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      show(nearestIdx(e.clientX - r.left), { x: e.clientX, y: e.clientY });
    });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const cur = state.hover == null ? days.length - 1 : days.indexOf(state.hover);
      show(cur + (e.key === 'ArrowRight' ? 1 : -1));
    });
    hit.addEventListener('focus', () => show(days.length - 1));
  }

  // ───────── Table ─────────
  const COLUMNS = [
    { key: 'select', label: '<span class="sr-only">비교</span>' },
    { key: 'name', label: '기업', sort: (r) => shortName(A.byId.get(r.id)), text: true },
    { key: 'category', label: '분야', sort: (r) => A.CATEGORY_LABEL[A.byId.get(r.id).category], text: true },
    { key: 'marketCapUsd', label: '시가총액', num: true, sort: (r) => r.marketCapUsd },
    { key: 'price', label: '현재가', num: true },
    ...RETURN_KEYS.map((k) => ({ key: k, label: periodOf(k).label, num: true, sort: (r) => r.returns[k] })),
    { key: 'range52', label: '52주 범위', sort: (r) => (r.high52 > r.low52 ? (r.price - r.low52) / (r.high52 - r.low52) : null) },
    { key: 'pe', label: 'PER', num: true, sort: (r) => r.pe },
    { key: 'trend', label: '추이' },
  ];

  function sparkline(row) {
    const period = periodOf(state.period);
    const startDay = chartStartDay(period.chart, lastDayOf(state.data.rows));
    const pts = indexedSeries(row, startDay);
    if (pts.length < 2) return '';
    const w = 84;
    const h = 24;
    const vals = pts.map(([, v]) => v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const d0 = pts[0][0];
    const dn = pts[pts.length - 1][0] - d0 || 1;
    const path = pts.map(([d, v], i) => `${i ? 'L' : 'M'}${(((d - d0) / dn) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join('');
    return `<svg class="${A.trendClass(vals[vals.length - 1])}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function rangeBar(r) {
    if (!(r.high52 > r.low52)) return '–';
    const pos = Math.max(0, Math.min(1, (r.price - r.low52) / (r.high52 - r.low52)));
    const lo = A.fmtPrice(r.low52, r.currency);
    const hi = A.fmtPrice(r.high52, r.currency);
    return `<span class="range52" title="52주 최저 ${A.esc(lo)} · 최고 ${A.esc(hi)}" aria-label="52주 최저 ${A.esc(lo)}, 최고 ${A.esc(hi)} 중 ${Math.round(pos * 100)}% 위치"><span class="range52__dot" style="left:${(pos * 100).toFixed(1)}%"></span></span>`;
  }

  function renderTable() {
    const rows = filteredRows();
    const col = COLUMNS.find((c) => c.key === state.sort.key);
    const dir = state.sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // missing values always last
      if (vb == null) return -1;
      return (col.text ? String(va).localeCompare(String(vb), 'ko') : va - vb) * dir;
    });

    const full = state.compare.size >= MAX_COMPARE;
    const head = COLUMNS.map((c) => {
      const cls = [c.num ? 'num' : '', c.key === state.period ? 'is-period' : '', c.key === 'select' || c.key === 'name' ? 'sticky' : '', `col-${c.key}`].filter(Boolean).join(' ');
      if (!c.sort) return `<th scope="col" class="${cls}">${c.label}</th>`;
      const sorted = state.sort.key === c.key;
      const aria = sorted ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" class="${cls}" aria-sort="${aria}"><button type="button" data-sort="${c.key}">${c.label}<span class="sort-mark" aria-hidden="true">${sorted ? (state.sort.dir === 'asc' ? '↑' : '↓') : ''}</span></button></th>`;
    }).join('');

    const body = rows.map((r) => {
      const c = A.byId.get(r.id);
      const slot = state.compare.get(r.id);
      const returns = RETURN_KEYS.map((k) => {
        const v = r.returns[k];
        return `<td class="num ${k === state.period ? 'is-period' : ''} ${v == null ? '' : A.trendClass(v)}"${v == null ? ' title="상장 이후 기간이 짧아 계산할 수 없어요"' : ''}>${fmtSignedPct(v)}</td>`;
      }).join('');
      return `
        <tr${slot ? ' class="is-compared"' : ''}>
          <td class="sticky col-select">
            <input type="checkbox" class="cmp-check" data-compare="${r.id}" ${slot ? `checked style="--key: var(--series-${slot})"` : ''} ${!slot && full ? 'disabled title="최대 6개까지 비교할 수 있어요"' : ''}
              aria-label="${A.esc(shortName(c))} 비교 차트에 ${slot ? '포함됨' : '추가'}">
          </td>
          <td class="sticky col-name">
            <button type="button" class="table-company" data-open="${r.id}" title="지도에서 보기">
              ${A.logoHTML(c)}
              <span><span class="table-company__name">${A.esc(shortName(c))}</span><span class="table-company__ticker">${A.esc(r.ticker)} · ${A.esc(r.exchange)}</span></span>
            </button>
          </td>
          <td><span class="cat-label cat-${c.category}">${A.esc(A.CATEGORY_LABEL[c.category])}</span></td>
          <td class="num">${A.esc(fmtUsdCompact(r.marketCapUsd))}</td>
          <td class="num">${A.esc(A.fmtPrice(r.price, r.currency))}</td>
          ${returns}
          <td>${rangeBar(r)}</td>
          <td class="num">${r.pe == null ? '–' : r.pe.toFixed(1)}</td>
          <td>${sparkline(r)}</td>
        </tr>`;
    }).join('');

    els.table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${COLUMNS.length}" class="empty">조건에 맞는 상장사가 없어요.</td></tr>`}</tbody>`;
  }

  function renderAll() {
    if (!els || !els.periods) return;
    renderFilters();
    renderStats();
    renderHeatmap();
    renderChart();
    renderTable();
  }

  // ───────── Events ─────────
  function bind() {
    els.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-period], [data-cat], [data-sort], [data-remove], [data-open], .hm-tile');
      if (!t) return;
      if (t.dataset.period) {
        state.period = t.dataset.period;
        A.storageSet(PERIOD_KEY, state.period);
        renderAll();
      } else if (t.dataset.cat) {
        state.category = t.dataset.cat;
        renderAll();
      } else if (t.dataset.sort) {
        const key = t.dataset.sort;
        const text = COLUMNS.find((c) => c.key === key).text;
        state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: text ? 'asc' : 'desc' };
        renderTable();
      } else if (t.dataset.remove) {
        toggleCompare(t.dataset.remove);
      } else if (t.dataset.open) {
        A.openCompany(t.dataset.open);
      } else if (t.classList.contains('hm-tile')) {
        toggleCompare(t.dataset.id);
      }
    });

    els.root.addEventListener('change', (e) => {
      if (e.target.matches('[data-compare]')) toggleCompare(e.target.dataset.compare);
    });

    // Heatmap tooltip (hover and keyboard focus show the same thing)
    const tileTip = (tile, point) => {
      const r = rowById(tile.dataset.id);
      if (!r) return;
      const c = A.byId.get(r.id);
      const period = periodOf(state.period);
      const ret = r.returns[period.id];
      A.showTooltip(point, (tip) => {
        const title = document.createElement('div');
        title.className = 'viz-tooltip__title';
        title.textContent = `${shortName(c)} · ${r.ticker}`;
        const valueRow = document.createElement('div');
        valueRow.className = 'viz-tooltip__row';
        const value = document.createElement('strong');
        value.className = ret == null ? '' : A.trendClass(ret);
        value.textContent = ret == null ? '–' : `${trendArrow(ret)} ${fmtSignedPct(ret)}`.trim();
        const valueLabel = document.createElement('span');
        valueLabel.textContent = ret == null ? `상장한 지 ${period.label}이 안 됐어요` : period.id === '1d' ? '전일 대비' : `${period.label} 수익률`;
        valueRow.append(value, valueLabel);
        const lines = [
          `시가총액 ${fmtUsdCompact(r.marketCapUsd)}`,
          `현재가 ${A.fmtPrice(r.price, r.currency)}`,
          state.compare.has(r.id) ? '누르면 비교 차트에서 빠져요' : '누르면 비교 차트에 추가돼요',
        ];
        tip.append(title, valueRow);
        for (const line of lines) {
          const el = document.createElement('div');
          el.className = 'viz-tooltip__line';
          el.textContent = line;
          tip.appendChild(el);
        }
      });
    };
    els.root.addEventListener('pointermove', (e) => {
      const tile = e.target.closest('.hm-tile');
      if (tile) tileTip(tile, { x: e.clientX, y: e.clientY });
    });
    els.root.addEventListener('pointerout', (e) => {
      if (e.target.closest('.hm-tile') && !e.relatedTarget?.closest?.('.hm-tile')) A.hideTooltip();
    });
    els.root.addEventListener('focusin', (e) => {
      const tile = e.target.closest('.hm-tile');
      if (tile) {
        const rect = tile.getBoundingClientRect();
        tileTip(tile, { x: rect.left + rect.width / 2, y: rect.top + 12 });
      }
    });
    els.root.addEventListener('focusout', (e) => {
      if (e.target.closest('.hm-tile')) A.hideTooltip();
    });

    // The tooltip is position:fixed; don't leave it floating over content that scrolled away.
    els.root.addEventListener('scroll', () => A.hideTooltip(), { passive: true });

    let resizeRaf = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (!els.root.hidden && state.data) {
          renderHeatmap();
          renderChart();
        }
      });
    }).observe(els.root);
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapBoard = {
    show() {
      if (!els) {
        A = window.AIMap;
        els = { root: document.getElementById('board') };
        loadPrefs();
        renderShell();
        bind();
      }
      els.root.hidden = false;
      renderAll();
      if (!state.data || Date.now() - state.data.generatedAt > REFRESH_MS) load();
    },
    hide() {
      if (els) els.root.hidden = true;
      if (A) A.hideTooltip();
    },
    setQuery(q) {
      state.query = q;
      if (els && !els.root.hidden) renderAll();
    },
  };
})();
