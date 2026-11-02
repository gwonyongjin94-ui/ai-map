(() => {
  'use strict';

  const COMPANIES = window.AI_COMPANIES || [];
  const DATA_AS_OF = window.AI_DATA_AS_OF || '';

  const CATEGORIES = [
    { id: 'all', label: '전체' },
    { id: 'frontier', label: 'AI 모델 연구소' },
    { id: 'bigtech', label: '빅테크' },
    { id: 'infra', label: '반도체·인프라' },
    { id: 'app', label: 'AI 서비스' },
  ];
  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
  const CATEGORY_ORDER = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i]));

  const esriCanvas = (name) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${name}/MapServer/tile/{z}/{y}/{x}`;
  const TILES = {
    light: { base: esriCanvas('World_Light_Gray_Base'), labels: esriCanvas('World_Light_Gray_Reference') },
    dark: { base: esriCanvas('World_Dark_Gray_Base'), labels: esriCanvas('World_Dark_Gray_Reference') },
  };
  const QUOTE_REFRESH_MS = 2 * 60 * 1000;
  const NEWS_TTL_MS = 10 * 60 * 1000;
  const NEWS_LANGS = [['ko', '한국어'], ['en', 'English']];
  const CITY_ZOOM = 11;
  const THEME_KEY = 'aimap-theme';
  const NEWS_LANG_KEY = 'aimap-news-lang';
  const SIDEBAR_MODE_KEY = 'aimap-sidebar-mode';
  const FAVORITES_KEY = 'aimap-favorites';
  const BRIEFING_POLL_MS = 8 * 1000; // while Claude is writing a briefing
  const BRIEFING_REFRESH_MS = 15 * 60 * 1000;
  const STORY_ZOOM_MAX = 5;
  const MOBILE_QUERY = window.matchMedia('(max-width: 820px)');
  const COUNTRY_OVERRIDES = { HK: '홍콩' };
  const ZERO_DECIMAL_CURRENCIES = new Set(['KRW', 'JPY']);

  const state = {
    category: 'all',
    query: '',
    listedOnly: false,
    selectedId: null,
    detailTab: 'overview', // kept across companies so you can browse news company by company
    newsLang: storageGet(NEWS_LANG_KEY) === 'en' ? 'en' : 'ko',
    quotes: {},
    quotesStatus: 'idle', // idle | loading | ok | unavailable
    sidebarMode: ['briefing', 'datacenters', 'power'].includes(storageGet(SIDEBAR_MODE_KEY)) ? storageGet(SIDEBAR_MODE_KEY) : 'companies',
    briefing: null, // last /api/briefing response
    selectedStoryId: null,
  };

  const els = {
    app: document.getElementById('app'),
    search: document.getElementById('search'),
    chips: document.getElementById('categoryChips'),
    listedOnly: document.getElementById('listedOnly'),
    listMeta: document.getElementById('listMeta'),
    list: document.getElementById('companyList'),
    detail: document.getElementById('detail'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    viewSwitch: document.getElementById('viewSwitch'),
    scrim: document.getElementById('scrim'),
    themeToggle: document.getElementById('themeToggle'),
    dataFoot: document.getElementById('dataFoot'),
    sidebarModes: document.getElementById('sidebarModes'),
    companyPane: document.getElementById('companyPane'),
    briefingPane: document.getElementById('briefingPane'),
    dcPane: document.getElementById('dcPane'),
    powerPane: document.getElementById('powerPane'),
    briefingBadge: document.getElementById('briefingBadge'),
  };

  const byId = new Map(COMPANIES.map((c) => [c.id, c]));
  const RELATION_TYPES = window.AI_RELATION_TYPES || {};
  const RELATIONS = (window.AI_RELATIONS || []).filter((r) => byId.has(r.from) && byId.has(r.to) && RELATION_TYPES[r.type]);

  function relationsOf(id) {
    return RELATIONS.filter((r) => r.from === id || r.to === id);
  }

  const MODEL_KINDS = window.AI_MODEL_KINDS || {};
  const MODELS = (window.AI_MODELS || []).filter((m) => byId.has(m.company) && MODEL_KINDS[m.kind]);

  // Newest first; a month-only date ('2026-01') sorts as the start of that month.
  function modelsOf(id) {
    return MODELS.filter((m) => m.company === id).sort((a, b) => b.date.localeCompare(a.date));
  }
  const allSymbols = [...new Set(COMPANIES.flatMap((c) => c.listings.map((l) => l.symbol)))];

  // ───────── Favorites ─────────
  // Starred companies, in the order they were starred. Kept in this browser only.
  function readFavorites() {
    try {
      const ids = JSON.parse(storageGet(FAVORITES_KEY) || '[]');
      return Array.isArray(ids) ? ids.filter((id) => byId.has(id)) : [];
    } catch {
      return [];
    }
  }
  let favorites = new Set(readFavorites());

  function toggleFavorite(id) {
    if (!byId.has(id)) return;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    storageSet(FAVORITES_KEY, JSON.stringify([...favorites]));
    onFavoritesChanged();
  }

  // Every view that marks or filters by favorites listens for 'aimap:favorites'.
  function onFavoritesChanged() {
    const filtering = state.category === 'favorites';
    if (filtering && !favorites.size) state.category = 'all';
    // Re-adding markers would collapse a spiderfied cluster around the open company, so the
    // map is only rebuilt when the favorites filter decides which pins show.
    if (filtering) applyFilters();
    else {
      renderChips();
      renderList();
    }
    for (const id of markers.keys()) syncMarkerDecor(id);
    if (!filtering) cluster.refreshClusters();
    renderBriefingPane();
    const btn = els.detail.querySelector('[data-action="favorite"]');
    if (btn) syncFavoriteButton(btn, state.selectedId);
    window.dispatchEvent(new CustomEvent('aimap:favorites'));
  }

  const STAR_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="star-path" d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.7l-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  function favoriteLabel(id) {
    return favorites.has(id) ? '관심 기업에서 빼기' : '관심 기업에 추가';
  }

  function syncFavoriteButton(btn, id) {
    btn.setAttribute('aria-pressed', String(favorites.has(id)));
    btn.setAttribute('aria-label', favoriteLabel(id));
    btn.title = favoriteLabel(id);
  }

  // ───────── Utilities ─────────
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  }

  const regionNames = (() => {
    try { return new Intl.DisplayNames(['ko'], { type: 'region' }); } catch { return null; }
  })();

  function countryName(code) {
    return COUNTRY_OVERRIDES[code] || (regionNames && regionNames.of(code)) || code;
  }

  function flag(code) {
    return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
  }

  function initials(name) {
    const words = name.replace(/\(.*?\)/g, '').split(/[\s·]+/).filter(Boolean);
    const text = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
    return text.toUpperCase();
  }

  function isListed(c) {
    return c.listings.length > 0 && !c.parent;
  }

  function buildSearchText(c) {
    return [
      c.name, c.nameKo, c.leader.name, c.leader.nameKo, c.city, countryName(c.country),
      CATEGORY_LABEL[c.category],
      ...c.products.map((p) => p.name),
      ...c.listings.map((l) => l.ticker),
    ].join(' ').toLowerCase();
  }

  const searchIndex = new Map(COMPANIES.map((c) => [c.id, buildSearchText(c)]));

  function logoHTML(c) {
    const fallback = `<span class="logo__fallback">${esc(initials(c.name))}</span>`;
    const logoDomain = 'logoDomain' in c ? c.logoDomain : c.domain;
    if (!logoDomain) return `<span class="logo cat-${c.category} is-broken">${fallback}</span>`;
    const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(logoDomain)}&sz=128`;
    return `<span class="logo cat-${c.category}"><img src="${src}" alt="" referrerpolicy="no-referrer">${fallback}</span>`;
  }

  // Logos come from a third-party favicon service; fall back to initials when one fails.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.parentElement && img.parentElement.classList.contains('logo')) img.parentElement.classList.add('is-broken');
    else if (img.classList.contains('news-item__icon')) img.remove();
  }, true);

  // ───────── Formatting ─────────
  function fmtPrice(value, currency) {
    const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    try {
      return new Intl.NumberFormat('ko-KR', {
        style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
      }).format(value);
    } catch {
      return value.toFixed(digits);
    }
  }

  function fmtChange(q) {
    const digits = ZERO_DECIMAL_CURRENCIES.has(q.currency) ? 0 : 2;
    const arrow = q.change > 0 ? '▲' : q.change < 0 ? '▼' : '';
    const abs = Math.abs(q.change).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${arrow} ${abs} (${fmtPct(q.changePct)})`.trim();
  }

  function fmtPct(pct) {
    if (pct == null || !isFinite(pct)) return '–';
    return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
  }

  function trendClass(v) {
    return v > 0 ? 'is-up' : v < 0 ? 'is-down' : 'is-flat';
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function sparkline(closes) {
    if (!closes || closes.length < 2) return '';
    const w = 112;
    const h = 36;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const points = closes
      .map((v, i) => `${((i / (closes.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
      .join(' ');
    const cls = trendClass(closes[closes.length - 1] - closes[0]);
    return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  // ───────── Theme ─────────
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    return storageGet(THEME_KEY) || (systemDark.matches ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.themeToggle.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    if (baseLayer) {
      baseLayer.setUrl(TILES[theme].base);
      labelLayer.setUrl(TILES[theme].labels);
    }
  }

  // ───────── Map ─────────
  const map = L.map('map', {
    minZoom: 2,
    maxZoom: 16,
    worldCopyJump: true,
    attributionControl: false,
    zoomSnap: 0.5,
  });
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

  const initialTiles = TILES[currentTheme()];
  const baseLayer = L.tileLayer(initialTiles.base, {
    maxZoom: 16,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  }).addTo(map);
  const labelLayer = L.tileLayer(initialTiles.labels, { maxZoom: 16, pane: 'overlayPane' }).addTo(map);

  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 44,
    spiderfyDistanceMultiplier: 1.7,
    iconCreateFunction: (group) => {
      const children = group.getAllChildMarkers();
      const inBriefing = children.some((m) => storyCompanyIds().has(m.options.companyId));
      const starred = children.some((m) => favorites.has(m.options.companyId));
      return L.divIcon({
        className: 'pin-icon',
        html: `<div class="cluster${inBriefing ? ' has-story' : ''}${starred ? ' is-favorite' : ''}">${group.getChildCount()}</div>`,
        iconSize: [44, 44],
      });
    },
  });
  map.addLayer(cluster);

  const markers = new Map();
  for (const c of COMPANIES) {
    const marker = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'pin-icon',
        html: `<div class="pin cat-${c.category}" data-id="${esc(c.id)}">${logoHTML(c)}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      title: c.name,
      alt: c.name,
      riseOnHover: true,
      companyId: c.id,
    });
    marker.on('click', () => select(c.id, { source: 'map' }));
    // Cluster re-adds marker elements as you zoom; keep the highlight in sync.
    marker.on('add', () => syncMarkerDecor(c.id));
    markers.set(c.id, marker);
  }

  // Selected ring + "in today's briefing" dot.
  function syncMarkerDecor(id) {
    const el = markers.get(id).getElement();
    if (!el) return;
    const pin = el.querySelector('.pin');
    pin.classList.toggle('is-selected', id === state.selectedId);
    pin.classList.toggle('has-story', storyCompanyIds().has(id));
    pin.classList.toggle('is-favorite', favorites.has(id));
  }

  // Where a selected company should sit on screen so the detail panel
  // (right card on desktop, bottom sheet on mobile) doesn't cover it.
  function focusPoint() {
    const size = map.getSize();
    if (MOBILE_QUERY.matches) return L.point(size.x / 2, size.y * 0.16);
    return L.point((size.x - els.detail.offsetWidth - 32) / 2, size.y / 2);
  }

  function isCovered(pt) {
    const size = map.getSize();
    if (MOBILE_QUERY.matches) return pt.y > size.y * 0.26 || pt.x < 24 || pt.x > size.x - 24;
    return pt.x > size.x - els.detail.offsetWidth - 56 || pt.x < 24 || pt.y < 24 || pt.y > size.y - 24;
  }

  function panToCompany(c) {
    const pt = map.latLngToContainerPoint([c.lat, c.lng]);
    if (isCovered(pt)) map.panBy(pt.subtract(focusPoint()), { animate: true, duration: 0.4 });
  }

  // Fly so the company lands on the focus point at `zoom`. Companies in the same city stay
  // clustered at that zoom, so fan the cluster out instead of zooming down to street level.
  function flyToCompany(c, zoom) {
    const offset = focusPoint().subtract(map.getSize().divideBy(2));
    const center = map.unproject(map.project([c.lat, c.lng], zoom).subtract(offset), zoom);
    const reveal = () => {
      if (state.selectedId !== c.id) return;
      // spiderfy() is a no-op while the group re-clusters after a zoom; retry once it settles
      // (same check markercluster's own zoomToShowLayer uses).
      if (cluster._inZoomAnimation) return cluster.once('animationend', reveal);
      const parent = cluster.getVisibleParent(markers.get(c.id));
      if (parent instanceof L.MarkerCluster) parent.spiderfy();
    };

    const alreadyThere = map.getZoom() === zoom && map.latLngToContainerPoint(center).distanceTo(map.getSize().divideBy(2)) < 2;
    if (alreadyThere) return reveal();
    map.once('moveend', reveal);
    map.flyTo(center, zoom, { duration: 0.8 });
  }

  // ───────── Filtering & list ─────────
  function matchesFilters(c, { ignoreCategory = false } = {}) {
    if (!ignoreCategory && state.category === 'favorites') {
      if (!favorites.has(c.id)) return false;
    } else if (!ignoreCategory && state.category !== 'all' && c.category !== state.category) return false;
    if (state.listedOnly && !isListed(c)) return false;
    if (state.query && !searchIndex.get(c.id).includes(state.query)) return false;
    return true;
  }

  function filteredCompanies() {
    return COMPANIES.filter((c) => matchesFilters(c)).sort(
      (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.name.localeCompare(b.name)
    );
  }

  function renderChips() {
    const base = COMPANIES.filter((c) => matchesFilters(c, { ignoreCategory: true }));
    els.chips.innerHTML = CATEGORIES.map((cat) => {
      const count = cat.id === 'all' ? base.length : base.filter((c) => c.category === cat.id).length;
      const dot = cat.id === 'all' ? '' : `<span class="chip__dot" style="--dot: var(--cat-${cat.id})"></span>`;
      return `<button type="button" class="chip" data-category="${cat.id}" aria-pressed="${state.category === cat.id}">${dot}${cat.label}<span class="chip__count">${count}</span></button>`;
    }).join('') + `<button type="button" class="chip" data-category="favorites" aria-pressed="${state.category === 'favorites'}"><span class="fav-mark" aria-hidden="true">★</span>관심<span class="chip__count">${base.filter((c) => favorites.has(c.id)).length}</span></button>`;
  }

  function listQuoteHTML(c) {
    if (!c.listings.length) return '<span class="company-item__ticker">비상장</span>';
    const listing = c.listings[0];
    const q = state.quotes[listing.symbol];
    const change = q && q.price != null ? `<span class="${trendClass(q.changePct)}">${fmtPct(q.changePct)}</span>` : '';
    return `<span class="company-item__ticker">${esc(listing.ticker)}</span>${change}`;
  }

  function renderList() {
    const items = filteredCompanies();
    const listedCount = items.filter(isListed).length;
    els.listMeta.textContent = `${items.length}개 기업 · 상장 ${listedCount}`;

    if (!items.length) {
      els.list.innerHTML = state.category === 'favorites' && !favorites.size
        ? '<li class="empty">아직 관심 기업이 없어요. 기업을 열고 ☆를 누르면 여기에 모여요.</li>'
        : '<li class="empty">조건에 맞는 기업이 없어요.</li>';
      return;
    }
    els.list.innerHTML = items.map((c) => `
      <li>
        <button type="button" class="company-item" data-id="${esc(c.id)}" aria-current="${c.id === state.selectedId}">
          ${logoHTML(c)}
          <span class="company-item__body">
            <span class="company-item__name">${favorites.has(c.id) ? '<span class="fav-mark" title="관심 기업">★</span> ' : ''}${esc(c.name)}${storyCompanyIds().has(c.id) ? '<span class="story-dot" title="오늘의 AI 브리핑에 등장"></span>' : ''}</span>
            <span class="company-item__meta">${flag(c.country)} ${esc(c.city)} · ${esc(c.leader.nameKo)}</span>
          </span>
          <span class="company-item__quote">${listQuoteHTML(c)}</span>
        </button>
      </li>`).join('');
  }

  function renderMarkers({ fit = false } = {}) {
    const visible = filteredCompanies();
    cluster.clearLayers();
    cluster.addLayers(visible.map((c) => markers.get(c.id)));
    if (fit && visible.length) {
      map.fitBounds(L.latLngBounds(visible.map((c) => [c.lat, c.lng])), { padding: [48, 48], maxZoom: 6 });
    }
  }

  function applyFilters({ fit = false } = {}) {
    renderChips();
    renderList();
    renderMarkers({ fit });
  }

  // ───────── Detail panel ─────────
  function quoteBodyHTML(listing) {
    const q = state.quotes[listing.symbol];
    if (q && q.price != null && !q.error) {
      return `
        <div class="stock__body">
          <div>
            <div class="stock__price">${fmtPrice(q.price, q.currency)}</div>
            <div class="stock__change ${trendClass(q.change)}">${fmtChange(q)}</div>
          </div>
          <div class="stock__spark">${sparkline(q.closes)}1개월</div>
        </div>
        ${q.marketTime ? `<div class="stock__time">${fmtTime(q.marketTime)} 기준 · 지연 시세</div>` : ''}`;
    }
    if (state.quotesStatus === 'loading' || state.quotesStatus === 'idle') {
      return `<div class="stock__body"><div><span class="skeleton" style="width:120px;height:26px"></span><br><span class="skeleton" style="width:90px;margin-top:6px"></span></div></div>`;
    }
    const why = location.protocol === 'file:' ? '로컬 서버(node server.js)로 열면 실시간 시세가 표시돼요.' : '시세를 불러오지 못했어요.';
    return `<div class="stock__muted">${why}</div>`;
  }

  function stockHTML(c) {
    if (!c.listings.length) {
      const p = c.private || {};
      const investors = p.investors && p.investors.length
        ? `<div class="section__title" style="margin:14px 0 0">주요 투자자</div><div class="tags">${p.investors.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</div>`
        : '';
      return `
        <div class="private-card">
          <div class="private-card__title">비상장 기업</div>
          ${p.status ? `<div class="private-card__status">${esc(p.status)}</div>` : ''}
          ${investors}
        </div>`;
    }
    return c.listings.map((l, i) => `
      <div class="stock" data-symbol="${esc(l.symbol)}">
        <div class="stock__top">
          <span class="stock__exchange"><b>${esc(l.ticker)}</b> · ${esc(l.exchange)}</span>
          ${c.listings.length > 1 && i === 0 ? '<span class="pill pill--neutral">대표 상장</span>' : ''}
        </div>
        <div class="stock__quote">${quoteBodyHTML(l)}</div>
      </div>`).join('');
  }

  function refreshDetailQuotes() {
    if (els.detail.hidden) return;
    const c = byId.get(state.selectedId);
    if (!c) return;
    for (const l of c.listings) {
      const el = els.detail.querySelector(`.stock[data-symbol="${CSS.escape(l.symbol)}"] .stock__quote`);
      if (el) el.innerHTML = quoteBodyHTML(l);
    }
  }

  // ───────── News ─────────
  // `${id}:${lang}` -> { status: 'loading' | 'ok' | 'error' | 'unavailable', data?, at }
  const newsCache = new Map();
  const relativeTime = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

  function fmtAgo(ms) {
    const diff = ms - Date.now();
    const minutes = Math.round(diff / 60000);
    if (minutes > -1) return '방금';
    if (minutes > -60) return relativeTime.format(minutes, 'minute');
    const hours = Math.round(diff / 3600000);
    if (hours > -24) return relativeTime.format(hours, 'hour');
    const days = Math.round(diff / 86400000);
    if (days > -7) return relativeTime.format(days, 'day');
    const date = new Date(ms);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('ko-KR', { year: sameYear ? undefined : 'numeric', month: 'short', day: 'numeric' });
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  function currentNews() {
    return newsCache.get(`${state.selectedId}:${state.newsLang}`);
  }

  async function loadNews(id, lang, { force = false } = {}) {
    const key = `${id}:${lang}`;
    const cached = newsCache.get(key);
    const fresh = cached && cached.status === 'ok' && Date.now() - cached.at < NEWS_TTL_MS;
    if (!force && (fresh || (cached && cached.status === 'loading'))) return;

    if (location.protocol === 'file:') {
      newsCache.set(key, { status: 'unavailable', at: Date.now() });
      refreshDetailNews();
      return;
    }
    newsCache.set(key, { status: 'loading', at: Date.now() });
    refreshDetailNews();
    try {
      const res = await fetch(`api/news?id=${encodeURIComponent(id)}&lang=${lang}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      newsCache.set(key, { status: 'ok', data: await res.json(), at: Date.now() });
    } catch (err) {
      console.warn('[AI Map] 뉴스 조회 실패:', err);
      newsCache.set(key, { status: 'error', at: Date.now() });
    }
    refreshDetailNews();
  }

  function newsItemHTML(item) {
    const host = hostOf(item.sourceUrl);
    const icon = host
      ? `<img class="news-item__icon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" alt="" referrerpolicy="no-referrer">`
      : '';
    const time = item.publishedAt
      ? `<span aria-hidden="true">·</span><time datetime="${new Date(item.publishedAt).toISOString()}">${fmtAgo(item.publishedAt)}</time>`
      : '';
    return `
      <li>
        <a class="news-item" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
          <span class="news-item__title">${esc(item.title)}</span>
          <span class="news-item__meta">${icon}<span>${esc(item.source)}</span>${time}</span>
        </a>
      </li>`;
  }

  function newsPanelHTML(entry) {
    const langButtons = NEWS_LANGS.map(
      ([lang, label]) => `<button type="button" data-news-lang="${lang}" aria-pressed="${state.newsLang === lang}">${label}</button>`
    ).join('');
    const ok = entry && entry.status === 'ok';
    const range = ok ? `<span class="news-toolbar__hint">${entry.data.windowDays ? `최근 ${entry.data.windowDays}일` : '최근 기사가 적어 기간 전체'}</span>` : '';

    let body;
    if (!entry || entry.status === 'loading') {
      body = `<ul class="news-list" aria-busy="true">${'<li class="news-item"><span class="skeleton" style="width:92%"></span><span class="skeleton" style="width:60%;margin-top:6px"></span><span class="skeleton" style="width:34%;margin-top:8px;height:.8em"></span></li>'.repeat(4)}</ul>`;
    } else if (entry.status === 'unavailable') {
      body = '<p class="news-empty">로컬 서버(node server.js)로 열면 뉴스가 표시돼요.</p>';
    } else if (entry.status === 'error') {
      body = '<div class="news-empty">뉴스를 불러오지 못했어요.<button type="button" class="link-btn" data-action="retry-news">다시 시도</button></div>';
    } else if (!entry.data.items.length) {
      body = '<p class="news-empty">관련 뉴스가 없어요.</p>';
    } else {
      body = `<ul class="news-list">${entry.data.items.map(newsItemHTML).join('')}</ul>`;
    }

    return `
      <div class="news-toolbar">
        <div class="segmented" role="group" aria-label="뉴스 언어">${langButtons}</div>
        ${range}
      </div>
      ${body}
      ${ok ? `<a class="link-btn news-more" href="${esc(entry.data.moreUrl)}" target="_blank" rel="noopener">Google 뉴스에서 더 보기 ↗</a>` : ''}
      <p class="detail__foot">출처 Google 뉴스 · 제목에 기업명이 들어간 기사만, 같은 내용은 하나로 묶어 최신순으로 보여줘요.</p>`;
  }

  function newsTeaserHTML(entry) {
    const item = entry && entry.status === 'ok' && entry.data.items[0];
    if (!item) return '';
    return `
      <button type="button" class="news-teaser" data-tab="news">
        <span class="news-teaser__label">최신 소식${item.publishedAt ? ` · ${fmtAgo(item.publishedAt)}` : ''}</span>
        <span class="news-teaser__title">${esc(item.title)}</span>
        <span class="news-teaser__more">${esc(item.source)} · 뉴스 ${entry.data.items.length}건 보기 →</span>
      </button>`;
  }

  // Re-render only the news-dependent parts so switching tabs/languages keeps scroll position.
  function refreshDetailNews() {
    if (els.detail.hidden || !state.selectedId) return;
    const entry = currentNews();
    const panel = els.detail.querySelector('[data-panel="news"]');
    const teaser = els.detail.querySelector('.news-teaser-slot');
    const badge = els.detail.querySelector('#tab-news .tab__badge');
    if (panel) panel.innerHTML = newsPanelHTML(entry);
    if (teaser) teaser.innerHTML = newsTeaserHTML(entry);
    if (badge) badge.textContent = entry && entry.status === 'ok' && entry.data.items.length ? entry.data.items.length : '';
  }

  function setDetailTab(tab) {
    state.detailTab = tab;
    for (const btn of els.detail.querySelectorAll('.tab')) {
      btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
    }
    for (const panel of els.detail.querySelectorAll('.tabpanel')) {
      panel.hidden = panel.dataset.panel !== tab;
    }
    const scroll = els.detail.querySelector('.detail__scroll');
    const tabs = els.detail.querySelector('.tabs');
    scroll.scrollTop = Math.min(scroll.scrollTop, tabs.offsetTop);
  }

  function renderDetail(c) {
    const place = `${flag(c.country)} ${esc(c.city)}, ${esc(countryName(c.country))}`;
    const founded = typeof c.founded === 'number' ? `${c.founded}년` : esc(c.founded);
    const stockTitle = !c.listings.length ? '상장 여부' : c.parent ? `주식 · 모회사 ${esc(c.parent)}` : '주식';
    const primary = c.listings[0];
    const tab = state.detailTab;

    els.detail.className = `detail cat-${c.category}`;
    els.detail.innerHTML = `
      <button type="button" class="icon-btn detail__fav" data-action="favorite" aria-pressed="${favorites.has(c.id)}" aria-label="${favoriteLabel(c.id)}" title="${favoriteLabel(c.id)}">${STAR_ICON}</button>
      <button type="button" class="icon-btn detail__close" data-action="close" aria-label="닫기">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="detail__scroll">
        <div class="detail__head">
          ${logoHTML(c)}
          <div>
            <h2 class="detail__title">${esc(c.name)}</h2>
            <div class="detail__subtitle">${esc(c.nameKo)}</div>
            <div class="pill-row">
              <span class="pill">${esc(CATEGORY_LABEL[c.category])}</span>
              <span class="pill pill--neutral">${place}</span>
            </div>
          </div>
        </div>

        <div class="tabs" role="tablist" aria-label="상세 정보">
          <button type="button" class="tab" role="tab" id="tab-overview" data-tab="overview" aria-controls="panel-overview" aria-selected="${tab === 'overview'}">개요</button>
          <button type="button" class="tab" role="tab" id="tab-news" data-tab="news" aria-controls="panel-news" aria-selected="${tab === 'news'}">뉴스 <span class="tab__badge"></span></button>
          <button type="button" class="tab" role="tab" id="tab-relations" data-tab="relations" aria-controls="panel-relations" aria-selected="${tab === 'relations'}">관계 <span class="tab__badge">${relationsOf(c.id).length || ''}</span></button>
          <button type="button" class="tab" role="tab" id="tab-models" data-tab="models" aria-controls="panel-models" aria-selected="${tab === 'models'}">모델 <span class="tab__badge">${modelsOf(c.id).length || ''}</span></button>
        </div>

        <div class="tabpanel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" data-panel="overview"${tab === 'overview' ? '' : ' hidden'}>
          <p class="detail__summary">${esc(c.summary)}</p>
          ${c.note ? `<div class="note"><strong>최근</strong><span>${esc(c.note)}</span></div>` : ''}
          <div class="news-teaser-slot"></div>
          ${briefingMentionsHTML(c)}

          <section class="section">
            <h3 class="section__title">기업 정보</h3>
            <div class="facts">
              <div class="fact fact--wide">
                <span class="fact__label">이끄는 사람 · ${esc(c.leader.title)}</span>
                <span class="fact__value">${esc(c.leader.nameKo)}</span>
                <span class="fact__sub">${esc(c.leader.name)}</span>
              </div>
              <div class="fact"><span class="fact__label">설립</span><span class="fact__value">${founded}</span></div>
              <div class="fact"><span class="fact__label">본사</span><span class="fact__value">${esc(c.city)}</span></div>
            </div>
          </section>

          <section class="section">
            <h3 class="section__title">주력 AI 제품</h3>
            <ul class="products">
              ${c.products.map((p) => `<li class="product"><span class="product__name">${esc(p.name)}</span><span class="product__desc">${esc(p.desc)}</span></li>`).join('')}
            </ul>
          </section>

          ${window.AIMapDatacenters.sectionHTML(c.id)}
          ${window.AIMapPower.companySectionHTML(c.id)}

          <section class="section">
            <h3 class="section__title">${stockTitle}</h3>
            ${stockHTML(c)}
          </section>

          <section class="section">
            <div class="links">
              <a class="link-btn" href="https://${esc(c.domain)}" target="_blank" rel="noopener">공식 사이트 ↗</a>
              ${primary ? `<a class="link-btn" href="https://finance.yahoo.com/quote/${encodeURIComponent(primary.symbol)}" target="_blank" rel="noopener">Yahoo Finance ↗</a>` : ''}
            </div>
          </section>

          <p class="detail__foot">정보 기준 ${esc(DATA_AS_OF)} · 본사 위치는 근사치 · 시세 출처 Yahoo Finance (지연될 수 있음)</p>
        </div>

        <div class="tabpanel" id="panel-news" role="tabpanel" aria-labelledby="tab-news" data-panel="news"${tab === 'news' ? '' : ' hidden'}></div>

        <div class="tabpanel" id="panel-relations" role="tabpanel" aria-labelledby="tab-relations" data-panel="relations"${tab === 'relations' ? '' : ' hidden'}>
          ${relationsPanelHTML(c)}
        </div>

        <div class="tabpanel" id="panel-models" role="tabpanel" aria-labelledby="tab-models" data-panel="models"${tab === 'models' ? '' : ' hidden'}>
          ${modelsPanelHTML(c)}
        </div>
      </div>`;
    els.detail.hidden = false;
    refreshDetailNews();
  }

  // ───────── Relations (detail tab) ─────────
  function fmtSince(since) {
    if (!since) return '';
    const [y, m] = since.split('-');
    return m ? `${y}년 ${Number(m)}월` : `${y}년`;
  }

  function shortName(c) {
    return c.nameKo.split(' · ')[0].replace(/\s*\(.*?\)/g, '');
  }

  // Groups by type and direction: "투자한 곳" / "투자받은 곳", …; undirected types in one group.
  function relationGroups(id) {
    const rels = relationsOf(id);
    const groups = [];
    for (const [type, def] of Object.entries(RELATION_TYPES)) {
      const out = rels.filter((r) => r.type === type && r.from === id);
      const inc = rels.filter((r) => r.type === type && r.to === id);
      if (def.directed) {
        if (out.length) groups.push({ type, title: def.out, items: out });
        if (inc.length) groups.push({ type, title: def.in, items: inc });
      } else if (out.length + inc.length) {
        groups.push({ type, title: def.label, items: [...out, ...inc] });
      }
    }
    return groups;
  }

  function relationsPanelHTML(c) {
    const groups = relationGroups(c.id);
    const foot = `<p class="detail__foot">관계 정리 기준 ${esc(window.AI_RELATIONS_AS_OF || '')} · 공개 보도 기반이라 빠진 관계가 있을 수 있어요.</p>`;
    if (!groups.length) {
      return `<p class="news-empty">이 데이터에 정리된 관계가 아직 없어요. 지도에 있는 56개 기업 사이의 관계만 담고 있어요.</p>${foot}`;
    }
    const item = (r) => {
      const other = byId.get(r.from === c.id ? r.to : r.from);
      const source = r.source
        ? `<a class="rel-source" href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(r.source.title)}">출처 ↗</a>`
        : '';
      return `
        <li class="rel-row">
          <button type="button" class="rel-item" data-company="${esc(other.id)}">
            ${logoHTML(other)}
            <span class="rel-item__body">
              <span class="rel-item__name">${esc(shortName(other))}</span>
              <span class="rel-item__label">${esc(r.label)}${r.since ? ` · ${fmtSince(r.since)}` : ''}</span>
              <span class="rel-item__detail">${esc(r.detail)}</span>
            </span>
          </button>
          ${source}
        </li>`;
    };
    return `
      <div class="rel-actions">
        <button type="button" class="link-btn" data-action="rel-map">지도에 연결선 보기</button>
        <button type="button" class="link-btn" data-action="rel-graph">관계도에서 보기 →</button>
      </div>
      ${groups.map((g) => `
        <section class="section">
          <h3 class="section__title rel-title rel-${g.type}"><span class="rel-key" aria-hidden="true"></span>${esc(g.title)} · ${g.items.length}</h3>
          <ul class="rel-list">${g.items.map(item).join('')}</ul>
        </section>`).join('')}
      ${foot}`;
  }

  // ───────── Models (detail tab) ─────────
  const DETAIL_MODELS_MAX = 12;

  function fmtModelDate(date) {
    const [y, m, d] = date.split('-');
    return d ? `${y}. ${Number(m)}. ${Number(d)}.` : `${y}. ${Number(m)}.`;
  }

  function modelsPanelHTML(c) {
    const list = modelsOf(c.id);
    const foot = `<p class="detail__foot">모델 정리 기준 ${esc(window.AI_MODELS_AS_OF || '')} · 2022년 11월 ChatGPT 이후의 주요 모델만 담았어요.</p>`;
    if (!list.length) {
      return `
        <p class="news-empty">타임라인에 정리된 이 기업의 모델이 아직 없어요. 반도체·인프라 기업처럼 자체 AI 모델을 내지 않는 곳도 있어요.</p>
        <div class="rel-actions"><button type="button" class="link-btn" data-action="models-all">모델 타임라인 보기 →</button></div>
        ${foot}`;
    }
    const item = (m) => `
      <li class="dm-item">
        <span class="dm-item__date">${fmtModelDate(m.date)}</span>
        <span class="dm-item__body">
          <span class="dm-item__head"><strong>${esc(m.name)}</strong><span class="kind-tag kind-${m.kind}"><span class="kind-dot" aria-hidden="true"></span>${esc(MODEL_KINDS[m.kind].label)}</span>${m.open ? '<span class="ml-flag">오픈 웨이트</span>' : ''}</span>
          <span class="dm-item__desc">${esc(m.desc)}</span>
        </span>
      </li>`;
    const more = list.length > DETAIL_MODELS_MAX ? `<p class="dm-more">이전 모델 ${list.length - DETAIL_MODELS_MAX}개는 타임라인에서 볼 수 있어요.</p>` : '';
    return `
      <div class="rel-actions"><button type="button" class="link-btn" data-action="models-company">타임라인에서 보기 →</button></div>
      <section class="section">
        <h3 class="section__title">최근 낸 모델 · ${list.length}</h3>
        <ol class="dm-list">${list.slice(0, DETAIL_MODELS_MAX).map(item).join('')}</ol>
        ${more}
      </section>
      ${foot}`;
  }

  // ───────── AI briefing ─────────
  const SPARKLE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z" fill="currentColor"/></svg>';

  function briefingStories() {
    const b = state.briefing && state.briefing.briefing;
    return (b && b.stories) || [];
  }

  let storyCompanyCache = { stories: null, ids: new Set() };
  function storyCompanyIds() {
    const stories = briefingStories();
    if (storyCompanyCache.stories !== stories) {
      storyCompanyCache = { stories, ids: new Set(stories.flatMap((s) => s.companyIds)) };
    }
    return storyCompanyCache.ids;
  }

  function fmtClock(ms) {
    return new Date(ms).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function briefingFootText(b) {
    return b.fixture
      ? '샘플 데이터: 실제 기사 제목을 사람이 직접 묶어 만든 예시예요. API 키를 설정하면 Claude가 만든 브리핑으로 바뀌어요.'
      : `Claude(${b.model})가 기사 제목만 보고 묶고 요약했어요. 사실관계는 원문에서 확인하세요.`;
  }

  function storyCardHTML(s) {
    const logos = s.companyIds.slice(0, 4).map((id) => byId.get(id)).filter(Boolean).map(logoHTML).join('');
    return `
      <li>
        <button type="button" class="story-card" data-story="${esc(s.id)}" aria-current="${s.id === state.selectedStoryId}">
          <span class="story-card__top">
            <span class="story-topic">${esc(s.topic)}</span>
            ${s.importance === 'major' ? '<span class="story-major">주요</span>' : ''}
            ${s.companyIds.some((id) => favorites.has(id)) ? '<span class="story-fav"><span class="fav-mark" aria-hidden="true">★</span>관심</span>' : ''}
            <span class="story-card__time">${fmtAgo(s.latestAt)}</span>
          </span>
          <span class="story-card__title">${esc(s.title)}</span>
          <span class="story-card__summary">${esc(s.summary)}</span>
          <span class="story-card__foot"><span class="story-logos">${logos}</span><span>기사 ${s.articles.length}건</span></span>
        </button>
      </li>`;
  }

  function briefingNoticeHTML(res, hasStories) {
    if (!res) {
      return `<ul class="story-list" aria-busy="true">${'<li class="story-card story-card--skeleton"><span class="skeleton" style="width:40%"></span><span class="skeleton" style="width:90%;height:1.2em"></span><span class="skeleton" style="width:75%"></span></li>'.repeat(3)}</ul>`;
    }
    switch (res.status) {
      case 'generating':
        return `<div class="briefing-notice"><span class="spinner" aria-hidden="true"></span><span>${hasStories
          ? '새 브리핑을 만드는 중이에요. 끝나면 자동으로 바뀌어요.'
          : 'Claude가 최근 기사들을 읽고 브리핑을 만드는 중이에요. 1~2분 걸려요.'}</span></div>`;
      case 'error':
        return `<div class="briefing-notice briefing-notice--error">브리핑을 만들지 못했어요. ${esc(res.error)}</div>`;
      case 'unavailable':
        return '<div class="briefing-notice">로컬 서버(node server.js)로 열면 AI 브리핑이 표시돼요.</div>';
      case 'unconfigured':
        return `
          <div class="briefing-setup">
            <strong>AI 브리핑을 켜려면 Anthropic API 키가 필요해요</strong>
            <ol>
              <li><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Claude Console</a>에서 API 키를 만들어요.</li>
              <li>프로젝트 폴더의 <code>.env</code> 파일에 <code>ANTHROPIC_API_KEY=발급받은키</code>를 적어요.</li>
              <li>이 페이지를 새로고침하면 브리핑을 만들기 시작해요. 이후 3시간마다 새로 만들어요.</li>
            </ol>
          </div>`;
      default:
        return '';
    }
  }

  function renderBriefingPane() {
    const res = state.briefing;
    const b = res && res.briefing;
    const stories = briefingStories();
    els.briefingBadge.textContent = stories.length || '';

    const head = b
      ? `<div class="briefing-head">
          <div class="briefing-head__title">${SPARKLE_ICON} 오늘의 AI 브리핑${b.fixture ? ' <span class="sample-badge">샘플</span>' : ''}</div>
          <div class="briefing-head__meta">최근 ${b.windowHours}시간 기사 ${b.articleCount}건 → 이슈 ${stories.length}개 · ${fmtClock(b.generatedAt)}</div>
        </div>`
      : '';
    const list = stories.length ? `<ul class="story-list">${stories.map(storyCardHTML).join('')}</ul>` : '';
    const archiveLink = '<a class="briefing-archive-link" href="#report">지난 브리핑 · 주간 리포트 →</a>';
    const foot = b ? `<p class="sidebar__foot">${esc(briefingFootText(b))}</p>${archiveLink}` : '';
    const notice = res && res.status === 'ready' ? '' : briefingNoticeHTML(res, stories.length > 0);
    els.briefingPane.innerHTML = `${head}${notice}${list}${foot}`;
  }

  function syncStoryCards() {
    for (const card of els.briefingPane.querySelectorAll('.story-card[data-story]')) {
      card.setAttribute('aria-current', String(card.dataset.story === state.selectedStoryId));
    }
  }

  let briefingTimer = null;
  async function loadBriefing() {
    clearTimeout(briefingTimer);
    if (location.protocol === 'file:') {
      state.briefing = { status: 'unavailable' };
      renderBriefingPane();
      return;
    }
    const before = state.briefing && state.briefing.briefing;
    try {
      const res = await fetch('api/briefing');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.briefing = await res.json();
    } catch (err) {
      console.warn('[AI Map] 브리핑 조회 실패:', err);
      if (!state.briefing) state.briefing = { status: 'error', error: '서버에 연결하지 못했어요.' };
    }
    const after = state.briefing.briefing;
    if ((before && before.generatedAt) !== (after && after.generatedAt)) onBriefingChanged();
    renderBriefingPane();
    briefingTimer = setTimeout(loadBriefing, state.briefing.status === 'generating' ? BRIEFING_POLL_MS : BRIEFING_REFRESH_MS);
  }

  function onBriefingChanged() {
    if (state.selectedStoryId && !briefingStories().some((s) => s.id === state.selectedStoryId)) closeDetail();
    for (const id of markers.keys()) syncMarkerDecor(id);
    cluster.refreshClusters();
    renderList();
    if (state.selectedId && !els.detail.hidden) renderDetail(byId.get(state.selectedId));
    window.dispatchEvent(new CustomEvent('aimap:briefing'));
  }

  // Map overlay (briefing stories, company relations): a few companies are redrawn in their own
  // pane above the dimmed map and linked to the main one.
  map.createPane('storyPane').style.zIndex = 650;
  const storyRenderer = L.svg({ pane: 'storyPane' });
  const storyLayer = L.layerGroup().addTo(map);
  let overlayKind = null; // 'story' | 'relations'
  let overlayPoints = null; // [{ c, latlng (true position), marker, line }], main first

  // others: [{ c, linkClass }]
  // `mainHTML` draws the main point when it isn't a company (a data center, a power plant); an
  // entry of `others` may do the same with `html` (+ `onClick`).
  function showOverlay(kind, main, others, { mainHTML = null } = {}) {
    storyLayer.clearLayers();
    overlayKind = kind;
    // Unwrap longitudes around the main company so links take the short way (e.g. across the Pacific).
    const points = [{ c: main }, ...others].map((p) => {
      let lng = p.c.lng;
      while (lng - main.lng > 180) lng -= 360;
      while (lng - main.lng < -180) lng += 360;
      return { ...p, latlng: L.latLng(p.c.lat, lng) };
    });

    for (const p of points.slice(1)) {
      p.line = L.polyline([points[0].latlng, p.latlng], { renderer: storyRenderer, className: p.linkClass, interactive: false }).addTo(storyLayer);
    }
    for (const p of points) {
      const { c } = p;
      const custom = c === main ? mainHTML : p.html;
      p.marker = L.marker(p.latlng, {
        pane: 'storyPane',
        title: c.name,
        zIndexOffset: c === main ? 1000 : 0, // the main company's pin and label stay on top
        icon: L.divIcon({
          className: 'pin-icon',
          html: custom
            ? `<div class="story-pin">${custom}<span class="story-pin__label">${esc(c.label || c.name)}</span></div>`
            : `<div class="story-pin"><div class="pin cat-${c.category}${c === main ? ' is-selected' : ''}">${logoHTML(c)}</div><span class="story-pin__label">${esc(c.name)}</span></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        }),
      });
      if (!custom) p.marker.on('click', () => select(c.id));
      else if (p.onClick) p.marker.on('click', p.onClick);
      p.marker.addTo(storyLayer);
    }
    overlayPoints = points;
    layoutOverlay();

    // Relations can span the globe (SF → Seoul → Abu Dhabi); let the fit zoom out one more level.
    map.setMinZoom(1);
    map.getContainer().classList.add('is-story-mode');
    const size = map.getSize();
    const padding = MOBILE_QUERY.matches
      ? { paddingTopLeft: [48, 64], paddingBottomRight: [48, Math.min(els.detail.offsetHeight + 24, size.y * 0.72)] }
      : { paddingTopLeft: [80, 80], paddingBottomRight: [els.detail.offsetWidth + 80, 80] };
    map.flyToBounds(L.latLngBounds(points.map((p) => p.latlng)), { ...padding, maxZoom: STORY_ZOOM_MAX, duration: 0.8 });
  }

  // Companies in the same city would sit on top of each other (OpenAI has ten partners around
  // San Francisco). At the current zoom, fan clashing pins out on a small spiral around their
  // true spot (lines follow), then hide labels that would still overlap — they show on hover.
  // Recomputed from the true positions after every zoom.
  const OVERLAY_MIN_GAP = 38;
  function layoutOverlay() {
    if (!overlayPoints) return;
    const placed = [];
    for (const p of overlayPoints) {
      const base = map.latLngToLayerPoint(p.latlng);
      let pt = base;
      for (let k = 1; k < 60 && placed.some((q) => q.distanceTo(pt) < OVERLAY_MIN_GAP); k++) {
        const angle = k * 2.39996;
        const rad = 24 + 15 * Math.sqrt(k);
        pt = base.add(L.point(Math.cos(angle) * rad, Math.sin(angle) * rad));
      }
      placed.push(pt);
      p.marker.setLatLng(map.layerPointToLatLng(pt));
    }
    const mainPos = overlayPoints[0].marker.getLatLng();
    for (const p of overlayPoints.slice(1)) p.line.setLatLngs([mainPos, p.marker.getLatLng()]);

    const kept = [];
    for (const p of overlayPoints) {
      const label = p.marker.getElement() && p.marker.getElement().querySelector('.story-pin__label');
      if (!label) continue;
      label.classList.remove('is-hidden');
      const r = label.getBoundingClientRect();
      const clash = kept.some((k) => r.left < k.right + 4 && k.left < r.right + 4 && r.top < k.bottom && k.top < r.bottom);
      if (clash) label.classList.add('is-hidden');
      else kept.push(r);
    }
  }
  map.on('zoomend', layoutOverlay);

  function clearOverlay() {
    overlayPoints = null;
    overlayKind = null;
    map.setMinZoom(2);
    storyLayer.clearLayers();
    map.getContainer().classList.remove('is-story-mode');
  }

  function showStoryOnMap(story) {
    const companies = story.companyIds.map((id) => byId.get(id)).filter(Boolean);
    if (!companies.length) return;
    showOverlay('story', companies[0], companies.slice(1).map((c) => ({ c, linkClass: 'story-link' })));
  }

  function clearStory() {
    if (!state.selectedStoryId) return;
    state.selectedStoryId = null;
    clearOverlay();
    syncStoryCards();
  }

  // One line per related company, colored by its first relation type.
  function showRelationsOnMap(c) {
    const others = new Map();
    for (const r of relationsOf(c.id)) {
      const otherId = r.from === c.id ? r.to : r.from;
      if (!others.has(otherId)) others.set(otherId, { c: byId.get(otherId), linkClass: `rel-link rel-${r.type}` });
    }
    if (others.size) showOverlay('relations', c, [...others.values()]);
  }

  function renderStoryDetail(s) {
    const b = state.briefing.briefing;
    const companies = s.companyIds.map((id) => byId.get(id)).filter(Boolean);
    els.detail.className = 'detail detail--story';
    els.detail.innerHTML = `
      <button type="button" class="icon-btn detail__close" data-action="close" aria-label="닫기">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="detail__scroll">
        <div class="story-meta">
          <span class="story-topic">${esc(s.topic)}</span>
          ${s.importance === 'major' ? '<span class="story-major">주요</span>' : ''}
          <span>${fmtAgo(s.latestAt)} · 기사 ${s.articles.length}건</span>
        </div>
        <h2 class="detail__title story-title">${esc(s.title)}</h2>
        <p class="detail__summary">${esc(s.summary)}</p>
        <p class="ai-note">${SPARKLE_ICON}<span>${b.fixture ? '샘플 요약이에요.' : 'Claude가 아래 기사 제목들을 묶어 요약했어요.'} 자세한 내용은 원문에서 확인하세요.</span></p>

        <section class="section">
          <h3 class="section__title">관련 기업</h3>
          <div class="company-chips">
            ${companies.map((c) => `<button type="button" class="company-chip" data-company="${esc(c.id)}">${logoHTML(c)}<span>${esc(c.name)}</span></button>`).join('')}
          </div>
        </section>

        <section class="section">
          <h3 class="section__title">관련 기사 ${s.articles.length}건</h3>
          <ul class="news-list">${s.articles.map(newsItemHTML).join('')}</ul>
        </section>

        <p class="detail__foot">${fmtClock(b.generatedAt)} 브리핑 · ${esc(briefingFootText(b))}</p>
      </div>`;
    els.detail.hidden = false;
  }

  function selectStory(id) {
    const story = briefingStories().find((s) => s.id === id);
    if (!story) return;
    clearCompanySelection();
    state.selectedStoryId = id;
    renderStoryDetail(story);
    syncStoryCards();
    setHash(null);
    setSidebarOpen(false);
    showStoryOnMap(story);
  }

  function briefingMentionsHTML(c) {
    const stories = briefingStories().filter((s) => s.companyIds.includes(c.id));
    if (!stories.length) return '';
    return `
      <div class="mentions">
        <span class="mentions__label">${SPARKLE_ICON} 오늘의 AI 브리핑</span>
        ${stories.map((s) => `<button type="button" class="mention" data-story="${esc(s.id)}">${esc(s.title)}</button>`).join('')}
      </div>`;
  }

  function setSidebarMode(mode) {
    state.sidebarMode = mode;
    storageSet(SIDEBAR_MODE_KEY, mode);
    els.companyPane.hidden = mode !== 'companies';
    els.briefingPane.hidden = mode !== 'briefing';
    els.dcPane.hidden = mode !== 'datacenters';
    els.powerPane.hidden = mode !== 'power';
    // Company pins step back while the data center or power list is open.
    map.getContainer().classList.toggle('is-dc-mode', mode === 'datacenters' || mode === 'power');
    if (mode === 'datacenters') window.AIMapDatacenters.setVisible(true);
    if (mode === 'power') window.AIMapPower.setVisible(true);
    for (const btn of els.sidebarModes.querySelectorAll('[data-mode]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    }
  }

  // ───────── Selection ─────────
  function clearCompanySelection() {
    const prev = state.selectedId;
    state.selectedId = null;
    if (prev) syncMarkerDecor(prev);
    for (const btn of els.list.querySelectorAll('.company-item[aria-current="true"]')) {
      btn.setAttribute('aria-current', 'false');
    }
  }

  function select(id, { source = 'list' } = {}) {
    const c = byId.get(id);
    if (!c) return;
    clearStory();
    if (['relations', 'datacenter', 'power'].includes(overlayKind)) clearOverlay();
    window.AIMapDatacenters.deselect();
    window.AIMapPower.deselect();
    const prev = state.selectedId;
    state.selectedId = id;

    renderDetail(c);
    loadNews(id, state.newsLang);
    if (prev && markers.has(prev)) syncMarkerDecor(prev);
    syncMarkerDecor(id);
    for (const btn of els.list.querySelectorAll('.company-item')) {
      btn.setAttribute('aria-current', String(btn.dataset.id === id));
    }
    setHash(id);
    setSidebarOpen(false);

    if (source === 'map') {
      panToCompany(c);
    } else if (cluster.hasLayer(markers.get(id))) {
      flyToCompany(c, Math.max(map.getZoom(), CITY_ZOOM));
    } else {
      // Filtered out of the map (e.g. deep link while a filter is active): just center on it.
      map.setView([c.lat, c.lng], Math.max(map.getZoom(), CITY_ZOOM));
    }
  }

  function closeDetail() {
    els.detail.hidden = true;
    clearCompanySelection();
    clearStory();
    clearOverlay();
    window.AIMapDatacenters.deselect();
    window.AIMapPower.deselect();
    setHash(null);
  }

  // The detail panel for something that isn't a company (a data center).
  function showPanel(html, className) {
    clearCompanySelection();
    clearStory();
    els.detail.className = `detail ${className}`;
    els.detail.innerHTML = html;
    els.detail.hidden = false;
    setHash(null);
    setSidebarOpen(false);
  }

  function setHash(id) {
    const url = id ? `#${id}` : location.pathname + location.search;
    history.replaceState(null, '', url);
  }

  function setSidebarOpen(open) {
    els.app.classList.toggle('sidebar-open', open);
    els.scrim.hidden = !open;
    els.sidebarToggle.setAttribute('aria-expanded', String(open));
  }

  // ───────── Quotes ─────────
  async function loadQuotes() {
    if (!allSymbols.length) return;
    if (location.protocol === 'file:') {
      state.quotesStatus = 'unavailable';
      refreshDetailQuotes();
      return;
    }
    if (state.quotesStatus !== 'ok') state.quotesStatus = 'loading';
    try {
      const res = await fetch(`api/quotes?symbols=${encodeURIComponent(allSymbols.join(','))}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.quotes = data.quotes || {};
      state.quotesStatus = 'ok';
    } catch (err) {
      console.warn('[AI Map] 시세 조회 실패:', err);
      if (state.quotesStatus !== 'ok') state.quotesStatus = 'unavailable';
    }
    renderList();
    refreshDetailQuotes();
    window.dispatchEvent(new CustomEvent('aimap:quotes'));
  }

  // ───────── Views (map / comparison board) ─────────
  let view = 'map';

  // Full-page views besides the map, keyed by view name: module + hash.
  const PAGE_VIEWS = {
    board: { module: () => window.AIMapBoard, hash: 'board' },
    graph: { module: () => window.AIMapRelations, hash: 'relations' },
    models: { module: () => window.AIMapModels, hash: 'models' },
    bench: { module: () => window.AIMapBench, hash: 'bench' },
    report: { module: () => window.AIMapReport, hash: 'report' },
    watchlist: { module: () => window.AIMapWatchlist, hash: 'watchlist' },
  };

  function setView(next) {
    if (next === view) return;
    view = next;
    els.app.classList.toggle('is-page-view', view !== 'map');
    els.app.classList.toggle('is-board', view === 'board');
    const tab = view === 'bench' ? 'models' : view; // performance comparison is a sub-tab of 모델
    for (const btn of els.viewSwitch.querySelectorAll('[data-view]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.view === tab));
    }
    setSidebarOpen(false);
    for (const [name, v] of Object.entries(PAGE_VIEWS)) {
      if (name !== view) v.module().hide();
    }
    if (PAGE_VIEWS[view]) {
      const mod = PAGE_VIEWS[view].module();
      mod.setQuery(state.query);
      mod.show();
      history.replaceState(null, '', `#${PAGE_VIEWS[view].hash}`);
    } else {
      map.invalidateSize(); // the map was display:none while a page view was up
      setHash(state.selectedId);
    }
  }

  function openRelationsGraph(id) {
    setView('graph');
    window.AIMapRelations.focus(id);
  }

  function openModelTimeline(id) {
    if (id) window.AIMapModels.focusCompany(id);
    setView('models');
  }

  // One floating tooltip shared by the board's charts. `fill` builds its content with DOM
  // nodes (textContent), never HTML strings.
  const tooltipEl = document.getElementById('vizTooltip');
  function showTooltip(point, fill) {
    tooltipEl.textContent = '';
    fill(tooltipEl);
    tooltipEl.hidden = false;
    const { width, height } = tooltipEl.getBoundingClientRect();
    const left = point.x + 14 + width > innerWidth - 8 ? point.x - 14 - width : point.x + 14;
    const top = Math.min(point.y + 14, innerHeight - height - 8);
    tooltipEl.style.left = `${Math.max(8, left)}px`;
    tooltipEl.style.top = `${Math.max(8, top)}px`;
  }
  function hideTooltip() {
    tooltipEl.hidden = true;
  }

  window.AIMap = {
    byId,
    CATEGORIES,
    CATEGORY_LABEL,
    esc,
    logoHTML,
    fmtPrice,
    fmtClock,
    trendClass,
    storageGet,
    storageSet,
    showTooltip,
    hideTooltip,
    isMobile: () => MOBILE_QUERY.matches,
    openCompany(id) {
      setView('map');
      select(id);
    },
    relationsOf,
    shortName,
    fmtSince,
    fmtAgo,
    fmtChange,
    sparkline,
    modelsOf,
    quoteOf(c) {
      return c.listings.length ? state.quotes[c.listings[0].symbol] || null : null;
    },
    quotesStatus: () => state.quotesStatus,
    // The current AI briefing's stories about a company.
    storiesOf: (id) => briefingStories().filter((s) => s.companyIds.includes(id)),
    favorites: {
      has: (id) => favorites.has(id),
      list: () => [...favorites],
      toggle: toggleFavorite,
    },
    openRelations: openRelationsGraph,
    openModels: openModelTimeline,
  };

  // ───────── Events ─────────
  els.viewSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });

  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.category;
    applyFilters({ fit: true });
  });

  els.listedOnly.addEventListener('change', () => {
    state.listedOnly = els.listedOnly.checked;
    applyFilters({ fit: true });
  });

  els.search.addEventListener('input', () => {
    state.query = els.search.value.trim().toLowerCase();
    // Search also narrows the board and highlights matches in the relations graph.
    window.AIMapBoard.setQuery(state.query);
    window.AIMapRelations.setQuery(state.query);
    window.AIMapModels.setQuery(state.query);
    window.AIMapBench.setQuery(state.query);
    window.AIMapReport.setQuery(state.query);
    window.AIMapWatchlist.setQuery(state.query);
    window.AIMapDatacenters.setQuery(state.query);
    window.AIMapPower.setQuery(state.query);
    if (view !== 'map') return;
    // Results show in the company list — or the data center list when that's open.
    if (state.sidebarMode === 'briefing') setSidebarMode('companies');
    applyFilters();
  });

  els.search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || view !== 'map') return;
    const first = filteredCompanies()[0];
    if (first) select(first.id);
  });

  els.list.addEventListener('click', (e) => {
    const item = e.target.closest('.company-item');
    if (item) select(item.dataset.id);
  });

  els.sidebarModes.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) setSidebarMode(btn.dataset.mode);
  });

  els.briefingPane.addEventListener('click', (e) => {
    const card = e.target.closest('[data-story]');
    if (card) selectStory(card.dataset.story);
  });

  els.detail.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action], [data-tab], [data-news-lang], [data-story], [data-company], [data-dc], [data-plant], [data-power-co]');
    if (!target) return;
    if (target.dataset.action === 'close') {
      closeDetail();
    } else if (target.dataset.dc) {
      window.AIMapDatacenters.open(target.dataset.dc);
    } else if (target.dataset.plant) {
      window.AIMapPower.openPlant(target.dataset.plant);
    } else if (target.dataset.powerCo) {
      window.AIMapPower.openCompany(target.dataset.powerCo);
    } else if (target.dataset.action === 'favorite') {
      toggleFavorite(state.selectedId);
    } else if (target.dataset.story) {
      selectStory(target.dataset.story);
    } else if (target.dataset.company) {
      select(target.dataset.company);
    } else if (target.dataset.action === 'rel-map') {
      showRelationsOnMap(byId.get(state.selectedId));
    } else if (target.dataset.action === 'rel-graph') {
      openRelationsGraph(state.selectedId);
    } else if (target.dataset.action === 'models-company') {
      openModelTimeline(state.selectedId);
    } else if (target.dataset.action === 'models-all') {
      openModelTimeline(null);
    } else if (target.dataset.action === 'retry-news') {
      loadNews(state.selectedId, state.newsLang, { force: true });
    } else if (target.dataset.tab) {
      setDetailTab(target.dataset.tab);
    } else if (target.dataset.newsLang && target.dataset.newsLang !== state.newsLang) {
      state.newsLang = target.dataset.newsLang;
      storageSet(NEWS_LANG_KEY, state.newsLang);
      refreshDetailNews();
      loadNews(state.selectedId, state.newsLang);
    }
  });

  els.sidebarToggle.addEventListener('click', () => setSidebarOpen(!els.app.classList.contains('sidebar-open')));
  els.scrim.addEventListener('click', () => setSidebarOpen(false));

  els.themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    storageSet(THEME_KEY, next);
    applyTheme(next);
  });

  systemDark.addEventListener('change', () => {
    if (!storageGet(THEME_KEY)) applyTheme(currentTheme());
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.app.classList.contains('sidebar-open')) setSidebarOpen(false);
    else if (!els.detail.hidden) closeDetail();
  });

  window.addEventListener('storage', (e) => {
    if (e.key !== FAVORITES_KEY) return;
    favorites = new Set(readFavorites());
    onFavoritesChanged();
  });

  // Places on the map that other pages link to (the data watch's data center / power news):
  // #dc/<id>, #plant/<id>, #power/<id>.
  function openPlaceFromHash(id) {
    const [kind, placeId] = id.split('/');
    const open = {
      dc: () => window.AIMapDatacenters.open(placeId, { fly: true }),
      plant: () => window.AIMapPower.openPlant(placeId, { fly: true }),
      power: () => window.AIMapPower.openCompany(placeId),
    }[kind];
    if (!open || !placeId) return false;
    setView('map');
    open();
    return true;
  }

  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const page = Object.keys(PAGE_VIEWS).find((name) => PAGE_VIEWS[name].hash === id);
    if (page) setView(page);
    else if (openPlaceFromHash(id)) return;
    else if (byId.has(id)) {
      setView('map');
      if (id !== state.selectedId) select(id);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadQuotes();
  });

  // ───────── Boot ─────────
  applyTheme(currentTheme());
  const updatedAt = window.AI_DATA_UPDATED_AT
    ? ` (${new Date(window.AI_DATA_UPDATED_AT).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 일부 갱신)`
    : '';
  els.dataFoot.textContent = `정보 기준 ${DATA_AS_OF}${updatedAt} · 기업 ${COMPANIES.length}곳 · 시세 Yahoo Finance`;
  window.AIMapDatacenters.init({
    map,
    pane: els.dcPane,
    esc,
    logoHTML,
    flag,
    byId,
    shortName,
    showPanel,
    showOverlay,
    clearOverlay,
    overlayKind: () => overlayKind,
    isMobile: () => MOBILE_QUERY.matches,
    detailWidth: () => els.detail.offsetWidth,
  });
  window.AIMapPower.init({
    map,
    pane: els.powerPane,
    esc,
    logoHTML,
    flag,
    byId,
    shortName,
    showPanel,
    showOverlay,
    clearOverlay,
    overlayKind: () => overlayKind,
  });
  setSidebarMode(state.sidebarMode);
  renderBriefingPane();
  applyFilters({ fit: true });

  const initialId = decodeURIComponent(location.hash.slice(1));
  const initialPage = Object.keys(PAGE_VIEWS).find((name) => PAGE_VIEWS[name].hash === initialId);
  if (initialPage) setView(initialPage);
  else if (openPlaceFromHash(initialId)) {
    // opened above
  } else if (byId.has(initialId)) select(initialId);

  loadQuotes();
  loadBriefing();
  setInterval(() => {
    if (document.visibilityState === 'visible') loadQuotes();
  }, QUOTE_REFRESH_MS);
})();
