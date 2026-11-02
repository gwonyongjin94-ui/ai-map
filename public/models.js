// Model timeline: which company released which model when — a swimlane chart of release cadence
// per company, and the full list below it. Loaded before app.js; uses window.AIMap only at call time.
(() => {
  'use strict';

  const KINDS = window.AI_MODEL_KINDS || {};
  const KIND_KEYS = Object.keys(KINDS);
  const MAX_ROWS = 14; // companies drawn as their own lane; the rest share one
  const ROW_H = 28;
  const AXIS_H = 26;
  const LABEL_W = 118;
  const MIN_CHART_W = 640;
  const HIT_RADIUS = 9;
  const DAY = 86400000;

  const state = {
    kinds: new Set(KIND_KEYS),
    openOnly: false,
    majorOnly: false,
    favOnly: false, // starred companies only
    company: '', // '' = every company
    query: '',
  };

  let A = null; // window.AIMap
  let els = null;
  let models = null;
  let dots = []; // drawn dots with positions, for hover and click
  let hot = null;
  let resizeFrame = 0;
  let scrollToTop = false; // set while hidden: a hidden element can't be scrolled

  // ───────── Data ─────────
  const modelKey = (m) => `${m.company}|${m.name}`;

  // A month-only date counts as the 1st, so it never claims to be newer than a dated release
  // of the same month (the same order modelsOf() in app.js gives by comparing the strings).
  function toTime(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d || 1);
  }

  function fmtShort(date) {
    const [, m, d] = date.split('-');
    return d ? `${Number(m)}월 ${Number(d)}일` : `${Number(m)}월`;
  }

  function fmtLong(date) {
    const [y, m, d] = date.split('-');
    return d ? `${y}년 ${Number(m)}월 ${Number(d)}일` : `${y}년 ${Number(m)}월`;
  }

  function load() {
    models = (window.AI_MODELS || [])
      .filter((m) => A.byId.has(m.company) && KINDS[m.kind])
      .map((m) => ({ ...m, key: modelKey(m), t: toTime(m.date), c: A.byId.get(m.company) }))
      .sort((a, b) => b.t - a.t || b.date.length - a.date.length || a.name.localeCompare(b.name));
  }

  function matchesQuery(m) {
    const q = state.query;
    return !q || [m.name, m.c.name, m.c.nameKo, m.desc].some((s) => s.toLowerCase().includes(q));
  }

  function filtered() {
    return models.filter(
      (m) =>
        state.kinds.has(m.kind) &&
        (!state.openOnly || m.open) &&
        (!state.majorOnly || m.major) &&
        (!state.favOnly || A.favorites.has(m.company)) &&
        (!state.company || m.company === state.company) &&
        matchesQuery(m)
    );
  }

  // ───────── Shell ─────────
  function renderShell() {
    const esc = A.esc;
    const counts = Object.fromEntries(KIND_KEYS.map((k) => [k, models.filter((m) => m.kind === k).length]));
    const perCompany = new Map();
    for (const m of models) perCompany.set(m.company, (perCompany.get(m.company) || 0) + 1);
    const companyOpts = [...perCompany.entries()]
      .sort((a, b) => b[1] - a[1] || A.shortName(A.byId.get(a[0])).localeCompare(A.shortName(A.byId.get(b[0])), 'ko'))
      .map(([id, n]) => `<option value="${esc(id)}">${esc(A.shortName(A.byId.get(id)))} (${n})</option>`)
      .join('');
    els.root.innerHTML = `
      <div class="board__inner">
        <header class="board__header">
          <nav class="sub-tabs" aria-label="모델 화면"><a href="#models" aria-current="page">출시 타임라인</a><a href="#bench">성능 비교</a></nav>
          <h1 class="board__title">AI 모델 타임라인</h1>
          <p class="board__sub">2022년 11월 ChatGPT부터 지도에 있는 기업이 낸 주요 모델 ${models.length}개 · ${esc(window.AI_MODELS_AS_OF || '')} 기준 공개 보도 정리</p>
        </header>
        <div class="board__filters">
          <div class="chips" role="group" aria-label="모델 종류" data-ref="kinds">
            ${KIND_KEYS.map((k) => `
              <button type="button" class="chip kind-chip kind-${k}" data-kind="${k}" aria-pressed="true" title="${esc(KINDS[k].desc || '')}">
                <span class="kind-dot" aria-hidden="true"></span>${esc(KINDS[k].label)}<span class="chip__count">${counts[k]}</span>
              </button>`).join('')}
          </div>
          <label class="switch"><input type="checkbox" data-ref="openOnly"><span class="switch__track" aria-hidden="true"></span>오픈 웨이트만</label>
          <label class="switch"><input type="checkbox" data-ref="majorOnly"><span class="switch__track" aria-hidden="true"></span>주요 출시만</label>
          <label class="switch"><input type="checkbox" data-ref="favOnly"><span class="switch__track" aria-hidden="true"></span>관심 기업만</label>
          <select class="ml-select" data-ref="company" aria-label="기업 고르기"><option value="">모든 기업</option>${companyOpts}</select>
        </div>
        <div class="stat-row" data-ref="stats"></div>
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">출시 흐름</h2>
              <p class="card__desc">기업마다 언제 모델을 냈는지 · 점에 올리면 모델 이름, 누르면 아래 목록으로 이동</p>
            </div>
            <div class="ml-legend" aria-hidden="true">
              ${KIND_KEYS.map((k) => `<span class="kind-${k}"><span class="kind-dot"></span>${esc(KINDS[k].label)}</span>`).join('')}
              <span><span class="kind-dot kind-dot--open"></span>오픈 웨이트</span>
              <span><span class="kind-dot kind-dot--major"></span>주요 출시</span>
            </div>
          </div>
          <div class="ml-chart-wrap" data-ref="chart"></div>
        </section>
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title" data-ref="listTitle">모델 목록</h2>
              <p class="card__desc">최신순 · 회사 로고를 누르면 지도에서 열려요 · 출처가 없는 항목은 2025년 상반기 이전 공식 발표 기준</p>
            </div>
          </div>
          <div data-ref="list"></div>
        </section>
      </div>`;
    for (const el of els.root.querySelectorAll('[data-ref]')) els[el.dataset.ref] = el;
  }

  // ───────── Stats ─────────
  // Plain counts only: the list is a curated selection, so per-year or per-company release rates
  // would say more about what was picked than about the industry.
  function renderStats(list) {
    const esc = A.esc;
    const open = list.filter((m) => m.open).length;
    const companies = new Set(list.map((m) => m.company)).size;
    const latest = list[0];
    const stat = (label, value, sub, cls = '') => `<div class="stat${cls}"><span class="stat__label">${label}</span><span class="stat__value">${value}</span><span class="stat__sub">${sub}</span></div>`;
    els.stats.innerHTML = [
      stat('모델', `${list.length}<span class="stat__slash"> / ${models.length}</span>`, list.length === models.length ? '전체' : '고른 조건'),
      stat('낸 기업', `${companies}곳`, `지도의 ${A.byId.size}곳 중`),
      stat('오픈 웨이트', list.length ? `${Math.round((open / list.length) * 100)}%` : '–', `${open}개`),
      stat('가장 최근 출시', latest ? esc(latest.name) : '–', latest ? `${esc(A.shortName(latest.c))} · ${fmtShort(latest.date)}` : '조건에 맞는 모델 없음', ' stat--name'),
    ].join('');
  }

  // ───────── Swimlane chart ─────────
  function lanes(list) {
    const byCompany = new Map();
    for (const m of list) {
      if (!byCompany.has(m.company)) byCompany.set(m.company, []);
      byCompany.get(m.company).push(m);
    }
    const rows = [...byCompany.entries()]
      .map(([id, items]) => ({ id, label: A.shortName(A.byId.get(id)), items }))
      .sort((a, b) => b.items.length - a.items.length || b.items[0].t - a.items[0].t);
    if (rows.length <= MAX_ROWS) return rows;
    const rest = rows.slice(MAX_ROWS - 1);
    return [...rows.slice(0, MAX_ROWS - 1), { id: null, label: `그 외 ${rest.length}곳`, items: rest.flatMap((r) => r.items) }];
  }

  function renderChart(list) {
    const esc = A.esc;
    A.hideTooltip();
    hot = null;
    if (!list.length) {
      els.chart.innerHTML = '<p class="chart-empty">조건에 맞는 모델이 없어요.</p>';
      dots = [];
      return;
    }
    const rows = lanes(list);
    // Company labels stay put in their own column; only the plot scrolls on a narrow screen.
    const oldScroll = els.chart.querySelector('.ml-chart-scroll');
    const scrolled = oldScroll ? oldScroll.scrollLeft : 0;
    const W = Math.max(MIN_CHART_W, els.chart.clientWidth) - LABEL_W;
    const H = AXIS_H + rows.length * ROW_H + 8;
    // Fixed domain (every model, not just the filtered ones) so the axis doesn't jump around.
    const start = Date.UTC(2022, 9, 1);
    const end = Math.max(Date.now(), models[0].t) + 40 * DAY;
    const x0 = 8;
    const x1 = W - 14;
    const x = (t) => x0 + ((t - start) / (end - start)) * (x1 - x0);
    const rowY = (i) => AXIS_H + i * ROW_H + ROW_H / 2;

    const parts = [];
    const labels = [];
    rows.forEach((r, i) => {
      if (i % 2) return;
      // One band split across the two SVGs, rounded only on its outer ends.
      labels.push(`<rect class="ml-band" x="0" y="${AXIS_H + i * ROW_H}" width="${LABEL_W + 6}" height="${ROW_H}" rx="6"/>`);
      parts.push(`<rect class="ml-band" x="-6" y="${AXIS_H + i * ROW_H}" width="${W + 6}" height="${ROW_H}" rx="6"/>`);
    });
    for (let y = 2023; Date.UTC(y, 0, 1) < end; y++) {
      for (let q = 0; q < 4; q++) {
        const t = Date.UTC(y, q * 3, 1);
        if (t >= end) break;
        const cx = x(t).toFixed(1);
        parts.push(`<line class="${q ? 'ml-q-line' : 'ml-year-line'}" x1="${cx}" x2="${cx}" y1="${q ? AXIS_H : 6}" y2="${H - 4}"/>`);
        if (!q) parts.push(`<text class="ml-axis-label" x="${(+cx + 5).toFixed(1)}" y="16">${y}</text>`);
      }
    }
    const nowX = x(Date.now()).toFixed(1);
    parts.push(`<line class="ml-today" x1="${nowX}" x2="${nowX}" y1="${AXIS_H - 4}" y2="${H - 4}"/>`);
    parts.push(`<text class="ml-today-label" x="${nowX}" y="${AXIS_H - 8}" text-anchor="middle">오늘</text>`);

    dots = [];
    rows.forEach((r, i) => {
      const cy = rowY(i);
      const name = r.label.length > 9 ? `${r.label.slice(0, 8)}…` : r.label;
      labels.push(`<text class="ml-row-label" x="${LABEL_W - 12}" y="${cy + 4}" text-anchor="end">${esc(name)}<tspan class="ml-row-count"> ${r.items.length}</tspan></text>`);
      // Older first, so the newest dot is drawn on top where releases crowd together.
      for (const m of [...r.items].sort((a, b) => a.t - b.t)) {
        const cx = x(m.t);
        const rad = m.major ? 6 : 4.5;
        if (m.major) parts.push(`<circle class="ml-major-ring" cx="${cx.toFixed(1)}" cy="${cy}" r="${rad + 3}"/>`);
        parts.push(`<circle class="ml-dot kind-${m.kind}${m.open ? ' is-open' : ''}" cx="${cx.toFixed(1)}" cy="${cy}" r="${rad}" data-key="${esc(m.key)}"/>`);
        dots.push({ m, cx, cy });
      }
    });

    const kinds = [...state.kinds].map((k) => KINDS[k].label).join('·');
    els.chart.innerHTML = `
      <div class="ml-chart-box" role="img" aria-label="기업별 AI 모델 출시 시점 (${esc(kinds)} ${list.length}개). 아래 모델 목록에서 같은 내용을 볼 수 있어요.">
        <svg class="ml-labels" width="${LABEL_W}" height="${H}" viewBox="0 0 ${LABEL_W} ${H}" aria-hidden="true">${labels.join('')}</svg>
        <div class="ml-chart-scroll">
          <svg class="ml-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>
        </div>
      </div>`;
    // On a narrow screen the plot scrolls sideways; start at the recent end.
    const scroller = els.chart.querySelector('.ml-chart-scroll');
    scroller.scrollLeft = scrolled || scroller.scrollWidth;
  }

  function nearestDot(evt) {
    const svg = els.chart.querySelector('.ml-chart');
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const px = evt.clientX - box.left;
    const py = evt.clientY - box.top;
    let best = null;
    let bestD = HIT_RADIUS;
    for (const d of dots) {
      if (Math.abs(d.cy - py) > ROW_H / 2) continue;
      const dist = Math.hypot(d.cx - px, d.cy - py);
      if (dist <= bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  function setHot(d) {
    const key = d ? d.m.key : null;
    if (hot === key) return;
    hot = key;
    for (const el of els.chart.querySelectorAll('.ml-dot.is-hot')) el.classList.remove('is-hot');
    if (d) {
      const el = [...els.chart.querySelectorAll('.ml-dot')].find((c) => c.dataset.key === key);
      if (el) el.classList.add('is-hot');
    }
  }

  function dotTip(d, point) {
    const m = d.m;
    A.showTooltip(point, (tip) => {
      const title = document.createElement('div');
      title.className = 'viz-tooltip__title';
      title.textContent = m.name;
      const row = document.createElement('div');
      row.className = `viz-tooltip__row kind-${m.kind}`;
      const key = document.createElement('span');
      key.className = 'viz-tooltip__key';
      key.style.setProperty('--key', 'var(--kind)');
      const company = document.createElement('strong');
      company.textContent = A.shortName(m.c);
      const kind = document.createElement('span');
      kind.textContent = `${KINDS[m.kind].label}${m.open ? ' · 오픈 웨이트' : ''}`;
      row.append(key, company, kind);
      const date = document.createElement('div');
      date.className = 'viz-tooltip__line';
      date.textContent = fmtLong(m.date);
      tip.append(title, row, date);
    });
  }

  // ───────── List ─────────
  function itemHTML(m) {
    const esc = A.esc;
    const source = m.source
      ? ` · <a href="${esc(m.source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(m.source.title)}">출처 ↗</a>`
      : '';
    return `
      <li class="ml-item" data-key="${esc(m.key)}">
        <time class="ml-item__date" datetime="${esc(m.date)}">${fmtShort(m.date)}</time>
        <button type="button" class="ml-item__logo" data-open="${esc(m.company)}" aria-label="${esc(A.shortName(m.c))} 지도에서 보기">${A.logoHTML(m.c)}</button>
        <div class="ml-item__body">
          <div class="ml-item__head">
            <strong class="ml-item__name">${esc(m.name)}</strong>
            <span class="kind-tag kind-${m.kind}"><span class="kind-dot" aria-hidden="true"></span>${esc(KINDS[m.kind].label)}</span>
            ${m.open ? '<span class="ml-flag">오픈 웨이트</span>' : ''}
            ${m.major ? '<span class="ml-flag ml-flag--major">주요 출시</span>' : ''}
          </div>
          <div class="ml-item__meta"><button type="button" class="ml-company" data-company="${esc(m.company)}">${esc(A.shortName(m.c))}</button>${source}</div>
          <p class="ml-item__desc">${esc(m.desc)}</p>
        </div>
      </li>`;
  }

  function renderList(list) {
    const company = state.company && A.byId.get(state.company);
    els.listTitle.textContent = company ? `${A.shortName(company)}의 모델 ${list.length}개` : `모델 목록 ${list.length}개`;
    if (!list.length) {
      els.list.innerHTML = state.favOnly && !A.favorites.list().length
        ? '<p class="chart-empty">아직 관심 기업이 없어요. 기업에 별표(☆)를 달면 그 기업 모델만 골라 볼 수 있어요.</p>'
        : '<p class="chart-empty">조건에 맞는 모델이 없어요. 필터를 바꾸거나 검색어를 지워 보세요.</p>';
      return;
    }
    const years = new Map();
    for (const m of list) {
      const y = m.date.slice(0, 4);
      if (!years.has(y)) years.set(y, []);
      years.get(y).push(m);
    }
    els.list.innerHTML = [...years.entries()]
      .map(([y, items]) => `
        <section class="ml-year">
          <h3 class="ml-year__title">${y}년 <span>${items.length}개</span></h3>
          <ol class="ml-list">${items.map(itemHTML).join('')}</ol>
        </section>`)
      .join('');
  }

  function render() {
    const list = filtered();
    renderStats(list);
    renderChart(list);
    renderList(list);
  }

  function syncControls() {
    for (const b of els.kinds.querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(state.kinds.has(b.dataset.kind)));
    els.openOnly.checked = state.openOnly;
    els.majorOnly.checked = state.majorOnly;
    els.favOnly.checked = state.favOnly;
    els.company.value = state.company;
  }

  function flashItem(key) {
    const item = [...els.list.querySelectorAll('.ml-item')].find((el) => el.dataset.key === key);
    if (!item) return;
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    item.classList.remove('is-flash');
    void item.offsetWidth; // restart the animation
    item.classList.add('is-flash');
  }

  // ───────── Events ─────────
  function bind() {
    els.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-kind], [data-open], [data-company]');
      if (!t) return;
      if (t.dataset.kind) {
        const kind = t.dataset.kind;
        // Clicking the only active kind turns everything back on instead of showing nothing.
        if (state.kinds.has(kind) && state.kinds.size === 1) KIND_KEYS.forEach((k) => state.kinds.add(k));
        else if (state.kinds.has(kind)) state.kinds.delete(kind);
        else state.kinds.add(kind);
        syncControls();
        render();
      } else if (t.dataset.open) {
        A.openCompany(t.dataset.open);
      } else if (t.dataset.company) {
        state.company = t.dataset.company;
        syncControls();
        render();
        els.root.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    els.root.addEventListener('change', (e) => {
      if (e.target === els.openOnly) state.openOnly = els.openOnly.checked;
      else if (e.target === els.majorOnly) state.majorOnly = els.majorOnly.checked;
      else if (e.target === els.favOnly) state.favOnly = els.favOnly.checked;
      else if (e.target === els.company) state.company = els.company.value;
      else return;
      render();
    });
    els.chart.addEventListener('pointermove', (e) => {
      const d = nearestDot(e);
      setHot(d);
      els.chart.style.cursor = d ? 'pointer' : '';
      if (d) dotTip(d, { x: e.clientX, y: e.clientY });
      else A.hideTooltip();
    });
    els.chart.addEventListener('pointerleave', () => {
      setHot(null);
      A.hideTooltip();
    });
    els.chart.addEventListener('click', (e) => {
      const d = nearestDot(e);
      if (d) flashItem(d.m.key);
    });
    els.root.addEventListener('scroll', () => A.hideTooltip(), { passive: true });
    window.addEventListener('resize', () => {
      if (els.root.hidden) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => renderChart(filtered()));
    });
    window.addEventListener('aimap:favorites', () => {
      if (state.favOnly && !els.root.hidden) render();
    });
  }

  function ensure() {
    if (els) return;
    A = window.AIMap;
    els = { root: document.getElementById('models') };
    load();
    renderShell();
    bind();
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapModels = {
    show() {
      ensure();
      els.root.hidden = false;
      syncControls();
      render();
      if (scrollToTop) els.root.scrollTop = 0;
      scrollToTop = false;
    },
    hide() {
      if (els) els.root.hidden = true;
      if (A) A.hideTooltip();
    },
    setQuery(q) {
      state.query = q;
      if (els && !els.root.hidden) render();
    },
    // From a company's detail panel: that company's models only, every kind.
    focusCompany(id) {
      ensure();
      state.company = id;
      KIND_KEYS.forEach((k) => state.kinds.add(k));
      state.openOnly = false;
      state.majorOnly = false;
      state.favOnly = false;
      syncControls();
      if (els.root.hidden) {
        scrollToTop = true;
      } else {
        render();
        els.root.scrollTop = 0;
      }
    },
  };
})();
