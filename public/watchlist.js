// Watchlist: the companies you starred, each with its stock, latest news, today's briefing
// stories, recent models and relations on one card. Stars live in this browser only (see
// favorites in app.js). Loaded before app.js; uses window.AIMap only at call time.
(() => {
  'use strict';

  const NEWS_TTL_MS = 10 * 60 * 1000;
  const NEWS_SHOWN = 3;
  const MODELS_SHOWN = 2;
  const NEWS_CONCURRENCY = 3;
  const KINDS = window.AI_MODEL_KINDS || {};
  const PICKER_GROUPS = [
    ['frontier', 'AI 모델 연구소'],
    ['bigtech', '빅테크'],
    ['infra', '반도체·인프라'],
    ['app', 'AI 서비스'],
  ];

  const state = { query: '' };
  const news = new Map(); // id -> { status: 'loading' | 'ok' | 'error', items, moreUrl, at }

  let A = null; // window.AIMap
  let els = null;

  // ───────── News ─────────
  async function loadNews(ids) {
    const due = ids.filter((id) => {
      const n = news.get(id);
      return !n || (n.status !== 'loading' && Date.now() - n.at > NEWS_TTL_MS);
    });
    if (!due.length || location.protocol === 'file:') return;
    for (const id of due) news.set(id, { status: 'loading', at: Date.now() });
    const queue = [...due];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        try {
          const res = await fetch(`api/news?id=${encodeURIComponent(id)}&lang=ko`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          news.set(id, { status: 'ok', items: data.items, moreUrl: data.moreUrl, at: Date.now() });
        } catch {
          news.set(id, { status: 'error', at: Date.now() });
        }
        renderCard(id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(NEWS_CONCURRENCY, queue.length) }, worker));
  }

  // ───────── Rendering ─────────
  function render() {
    const esc = A.esc;
    const ids = A.favorites.list();
    const shown = ids.filter((id) => {
      if (!state.query) return true;
      const c = A.byId.get(id);
      return [c.name, c.nameKo].some((t) => t.toLowerCase().includes(state.query));
    });
    els.root.innerHTML = `
      <div class="board__inner">
        <header class="board__header">
          <h1 class="board__title">관심 기업</h1>
          <p class="board__sub">${ids.length ? `${ids.length}곳 · 별표한 순서` : '아직 별표한 기업이 없어요'} · 이 브라우저에만 저장돼요</p>
        </header>
        ${ids.length ? '' : `
          <section class="card wl-intro">
            <p>기업에 별표(☆)를 달면 주가·최근 뉴스·오늘의 브리핑·새 모델·관계를 여기서 한꺼번에 봐요. 지도에서 기업을 열고 ☆를 누르거나, 아래에서 바로 골라 보세요.</p>
            <p class="wl-intro__more">지도 목록의 <b>★ 관심</b> 칩, 모델 타임라인과 주간 리포트의 <b>관심 기업만</b> 스위치로 별표한 기업만 골라 볼 수도 있어요.</p>
          </section>`}
        ${state.query && ids.length && !shown.length ? '<p class="rp-empty">검색어에 맞는 관심 기업이 없어요.</p>' : ''}
        <div class="wl-grid">${shown.map((id) => `<article class="card wl-card" data-card="${esc(id)}">${cardHTML(A.byId.get(id))}</article>`).join('')}</div>
        ${pickerHTML(ids.length === 0)}
      </div>`;
    loadNews(shown);
  }

  function renderCard(id) {
    const el = els && els.root.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (el && A.favorites.has(id)) el.innerHTML = cardHTML(A.byId.get(id));
  }

  function stockHTML(c) {
    const esc = A.esc;
    if (!c.listings.length) {
      const status = c.private && c.private.status;
      return `<div class="wl-stock wl-stock--private"><span class="wl-label">비상장</span>${status ? `<span class="wl-stock__status">${esc(status)}</span>` : ''}</div>`;
    }
    const l = c.listings[0];
    const q = A.quoteOf(c);
    const label = `<span class="wl-label">${esc(l.ticker)} · ${esc(l.exchange)}${c.parent ? ` (모회사 ${esc(c.parent)})` : ''}</span>`;
    if (q && q.price != null && !q.error) {
      return `
        <div class="wl-stock">
          ${label}
          <div class="wl-stock__row">
            <span class="wl-stock__price">${A.fmtPrice(q.price, q.currency)}</span>
            <span class="wl-stock__change ${A.trendClass(q.change)}">${A.fmtChange(q)}</span>
            <span class="wl-stock__spark">${A.sparkline(q.closes)}</span>
          </div>
        </div>`;
    }
    const status = A.quotesStatus();
    const why = status === 'loading' || status === 'idle' ? '<span class="skeleton" style="width:110px"></span>' : '<span class="muted">시세를 불러오지 못했어요</span>';
    return `<div class="wl-stock">${label}<div class="wl-stock__row">${why}</div></div>`;
  }

  function newsHTML(c) {
    const esc = A.esc;
    const n = news.get(c.id);
    let body;
    if (!n || n.status === 'loading') body = '<li><span class="skeleton" style="width:90%"></span></li><li><span class="skeleton" style="width:70%"></span></li>';
    else if (n.status === 'error') body = '<li class="muted">뉴스를 불러오지 못했어요.</li>';
    else if (!n.items.length) body = '<li class="muted">최근 기사가 없어요.</li>';
    else {
      body = n.items
        .slice(0, NEWS_SHOWN)
        .map((it) => `<li><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a><span class="wl-meta">${esc(it.source)}${it.publishedAt ? ` · ${A.fmtAgo(it.publishedAt)}` : ''}</span></li>`)
        .join('');
    }
    const more = n && n.status === 'ok' && n.moreUrl ? `<a class="wl-more" href="${esc(n.moreUrl)}" target="_blank" rel="noopener noreferrer">더 보기 ↗</a>` : '';
    return `<section class="wl-section"><h3 class="wl-section__title">최근 뉴스 ${more}</h3><ul class="wl-news">${body}</ul></section>`;
  }

  function cardHTML(c) {
    const esc = A.esc;
    const stories = A.storiesOf(c.id);
    const models = A.modelsOf(c.id).slice(0, MODELS_SHOWN);
    const rels = A.relationsOf(c.id);
    const storyBlock = stories.length
      ? `<section class="wl-section"><h3 class="wl-section__title">오늘의 AI 브리핑</h3><ul class="wl-stories">${stories
          .map((s) => `<li><span class="story-topic">${esc(s.topic)}</span> ${esc(s.title)}</li>`)
          .join('')}</ul></section>`
      : '';
    const modelBlock = models.length
      ? models
          .map((m) => `<li><span class="kind-tag kind-${esc(m.kind)}"><span class="kind-dot" aria-hidden="true"></span>${esc((KINDS[m.kind] || {}).label || m.kind)}</span> <b>${esc(m.name)}</b> <span class="wl-meta">${esc(m.date.replace(/-/g, '.'))}</span></li>`)
          .join('')
      : '<li class="muted">타임라인에 정리된 모델이 없어요.</li>';
    return `
      <header class="wl-card__head">
        <button type="button" class="wl-card__company" data-open="${esc(c.id)}" title="지도에서 보기">
          ${A.logoHTML(c)}
          <span><strong>${esc(A.shortName(c))}</strong><span class="wl-card__sub">${esc(c.name)} · ${esc(A.CATEGORY_LABEL[c.category])}</span></span>
        </button>
        <button type="button" class="icon-btn wl-unstar" data-unstar="${esc(c.id)}" aria-label="${esc(A.shortName(c))} 관심 기업에서 빼기" title="관심 기업에서 빼기">★</button>
      </header>
      ${stockHTML(c)}
      ${storyBlock}
      ${newsHTML(c)}
      <section class="wl-section">
        <h3 class="wl-section__title">최근 모델 <button type="button" class="wl-more" data-models="${esc(c.id)}">타임라인 →</button></h3>
        <ul class="wl-models">${modelBlock}</ul>
      </section>
      <footer class="wl-card__foot">
        <button type="button" class="link-btn" data-relations="${esc(c.id)}">관계 ${rels.length}개 · 관계도 →</button>
        <button type="button" class="link-btn" data-open="${esc(c.id)}">지도에서 보기</button>
      </footer>`;
  }

  function pickerHTML(open) {
    const esc = A.esc;
    const all = [...A.byId.values()];
    const groups = PICKER_GROUPS.map(([cat, label]) => {
      const items = all
        .filter((c) => c.category === cat)
        .sort((a, b) => A.shortName(a).localeCompare(A.shortName(b), 'ko'))
        .map((c) => {
          const on = A.favorites.has(c.id);
          return `<button type="button" class="wl-pick${on ? ' is-on' : ''}" data-toggle="${esc(c.id)}" aria-pressed="${on}">${A.logoHTML(c)}<span>${esc(A.shortName(c))}</span><span class="wl-pick__star" aria-hidden="true">${on ? '★' : '☆'}</span></button>`;
        })
        .join('');
      return `<div class="wl-picker__group"><h3 class="wl-section__title">${label}</h3><div class="wl-picker__items">${items}</div></div>`;
    }).join('');
    return `
      <section class="card">
        <details class="wl-picker"${open ? ' open' : ''}>
          <summary><span class="card__title">관심 기업 고르기</span> <span class="card__desc">눌러서 별표를 달거나 빼요</span></summary>
          ${groups}
        </details>
      </section>`;
  }

  // ───────── Events ─────────
  function bind() {
    els.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-open], [data-unstar], [data-toggle], [data-models], [data-relations]');
      if (!t) return;
      if (t.dataset.unstar) A.favorites.toggle(t.dataset.unstar);
      else if (t.dataset.toggle) A.favorites.toggle(t.dataset.toggle);
      else if (t.dataset.models) A.openModels(t.dataset.models);
      else if (t.dataset.relations) A.openRelations(t.dataset.relations);
      else if (t.dataset.open) A.openCompany(t.dataset.open);
    });
    const rerender = () => {
      if (els.root.hidden) return;
      // Keep the picker open across re-renders if it was.
      const picker = els.root.querySelector('.wl-picker');
      const keepOpen = picker && picker.open;
      render();
      const next = els.root.querySelector('.wl-picker');
      if (next && keepOpen) next.open = true;
    };
    window.addEventListener('aimap:favorites', rerender);
    window.addEventListener('aimap:quotes', rerender);
    window.addEventListener('aimap:briefing', rerender);
  }

  function ensure() {
    if (els) return;
    A = window.AIMap;
    els = { root: document.getElementById('watchlist') };
    bind();
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapWatchlist = {
    show() {
      ensure();
      els.root.hidden = false;
      render();
    },
    hide() {
      if (els) els.root.hidden = true;
    },
    setQuery(q) {
      state.query = q;
      if (els && !els.root.hidden) render();
    },
  };
})();
