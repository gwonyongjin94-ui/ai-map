// Weekly report: the AI briefing's stories kept by date, one week at a time, with the week's
// recap (written by Claude once the week is over), the companies and topics that came up most,
// and the models released that week (from the model timeline). Loaded before app.js; uses
// window.AIMap only at call time.
(() => {
  'use strict';

  const POLL_MS = 5000;
  const TOP_COMPANIES = 8;
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const IMPORTANCE_LABEL = { major: '주요', notable: '눈여겨볼', minor: '단신' };
  const KINDS = window.AI_MODEL_KINDS || {};

  const state = {
    week: null, // requested week id; null = the server's default
    data: null,
    loading: false,
    error: null,
    query: '',
    favOnly: false, // stories and models of starred companies only
  };

  let A = null; // window.AIMap
  let els = null;
  let pollTimer = null;

  // ───────── Dates ─────────
  function parts(date) {
    const [y, m, d] = date.split('-').map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }

  function fmtDay(date) {
    const p = parts(date);
    return `${p.m}월 ${p.d}일 (${WEEKDAYS[p.dow]})`;
  }

  function fmtRange(w) {
    const a = parts(w.start);
    const b = parts(w.end);
    const end = a.y !== b.y ? `${b.y}년 ${b.m}월 ${b.d}일` : a.m !== b.m ? `${b.m}월 ${b.d}일` : `${b.d}일`;
    return `${a.y !== b.y ? `${a.y}년 ` : ''}${a.m}월 ${a.d}일 ~ ${end}`;
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // ───────── Data ─────────
  async function load(week) {
    clearTimeout(pollTimer);
    if (location.protocol === 'file:') {
      state.error = '로컬 서버(node server.js)로 열면 주간 리포트가 보여요.';
      render();
      return;
    }
    state.loading = true;
    renderLoading();
    try {
      const res = await fetch(`api/archive${week ? `?week=${encodeURIComponent(week)}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      state.week = state.data.week.id;
      state.error = null;
    } catch (err) {
      state.error = `리포트를 불러오지 못했어요: ${err.message}`;
    }
    state.loading = false;
    render();
    if (state.data && state.data.recapStatus === 'generating' && !els.root.hidden) {
      pollTimer = setTimeout(() => load(state.week), POLL_MS);
    }
  }

  function matchesQuery(s) {
    const q = state.query;
    if (!q) return true;
    const names = s.companyIds.map((id) => A.byId.get(id)).filter(Boolean).flatMap((c) => [c.name, c.nameKo]);
    return [s.title, s.summary, s.topic, ...names].some((t) => t.toLowerCase().includes(q));
  }

  const starred = (ids) => !state.favOnly || ids.some((id) => A.favorites.has(id));

  function weekModels(w) {
    return (window.AI_MODELS || [])
      .filter((m) => A.byId.has(m.company) && m.date.length === 10 && m.date >= w.start && m.date <= w.end)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ───────── Rendering ─────────
  function renderLoading() {
    if (state.data) els.root.classList.add('is-refreshing');
    else render();
  }

  function render() {
    const esc = A.esc;
    els.root.classList.remove('is-refreshing');
    if (state.error && !state.data) {
      els.root.innerHTML = `<div class="board__inner"><p class="board__error">${esc(state.error)}</p></div>`;
      return;
    }
    if (!state.data) {
      els.root.innerHTML = '<div class="board__inner"><p class="chart-empty">불러오는 중…</p></div>';
      return;
    }
    const d = state.data;
    const w = d.week;
    const stories = d.stories;
    const shown = stories.filter((s) => matchesQuery(s) && starred(s.companyIds));
    const models = weekModels(w);
    const shownModels = models.filter((m) => starred([m.company]));
    const idx = d.weeks.findIndex((x) => x.id === w.id);
    const older = d.weeks[idx + 1];
    const newer = idx > 0 ? d.weeks[idx - 1] : null;

    els.root.innerHTML = `
      <div class="board__inner">
        <header class="board__header">
          <h1 class="board__title">주간 AI 리포트${d.sample ? ' <span class="sample-badge">샘플</span>' : ''}</h1>
          <p class="board__sub">AI 브리핑에 실린 이슈를 날짜별로 모아 둬요 · 한 주는 월요일~일요일 (한국 시간)</p>
        </header>
        <div class="rp-nav">
          <button type="button" class="btn rp-nav__btn" data-week="${older ? esc(older.id) : ''}" ${older ? '' : 'disabled'} aria-label="이전 주">←</button>
          <select class="ml-select rp-nav__select" data-ref="weekSelect" aria-label="주 고르기">
            ${d.weeks.map((x) => `<option value="${esc(x.id)}"${x.id === w.id ? ' selected' : ''}>${fmtRange(x)}${x.id === weekIdOf(d.today, d.weeks) ? ' · 이번 주' : ` · 이슈 ${x.storyCount}개`}</option>`).join('')}
          </select>
          <button type="button" class="btn rp-nav__btn" data-week="${newer ? esc(newer.id) : ''}" ${newer ? '' : 'disabled'} aria-label="다음 주">→</button>
          <span class="rp-nav__label" data-ref="weekLabel">${w.year}년 ${w.week}주차${w.isCurrent ? ' · 진행 중' : ''}</span>
          <label class="switch rp-nav__fav"><input type="checkbox" data-ref="favOnly"${state.favOnly ? ' checked' : ''}><span class="switch__track" aria-hidden="true"></span>관심 기업만</label>
        </div>
        ${statsHTML(stories, models)}
        ${recapHTML(d)}
        <div class="rp-grid">
          <section class="card">
            <div class="card__head"><div><h2 class="card__title">많이 나온 기업</h2><p class="card__desc">이 주 이슈에 등장한 횟수</p></div></div>
            ${companyBarsHTML(stories)}
          </section>
          <section class="card">
            <div class="card__head"><div><h2 class="card__title">분야별 이슈</h2><p class="card__desc">브리핑이 붙인 분야 기준</p></div></div>
            ${topicBarsHTML(stories)}
          </section>
        </div>
        <section class="card">
          <div class="card__head">
            <div><h2 class="card__title">이번 주 나온 모델 ${shownModels.length ? `<span class="rp-count">${shownModels.length}</span>` : ''}</h2><p class="card__desc">모델 타임라인에서 출시일이 이 주인 모델</p></div>
            <a class="link-btn" href="#models">모델 타임라인 →</a>
          </div>
          ${modelsHTML(shownModels)}
        </section>
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">날짜별 이슈</h2>
              <p class="card__desc">${state.query || state.favOnly ? `고른 조건에 맞는 이슈 ${shown.length}개 / ${stories.length}개` : '이슈는 가장 이른 기사 날짜에 놓여요 · 같은 이슈가 여러 번 브리핑되면 하나로 합쳐 최신 요약을 보여 줘요'}</p>
            </div>
          </div>
          ${daysHTML(shown, d)}
        </section>
      </div>`;
    for (const el of els.root.querySelectorAll('[data-ref]')) els[el.dataset.ref] = el;
  }

  function weekIdOf(today, weeks) {
    const w = weeks.find((x) => today >= x.start && today <= x.end);
    return w ? w.id : null;
  }

  function statsHTML(stories, models) {
    const esc = A.esc;
    const major = stories.filter((s) => s.importance === 'major').length;
    const articles = stories.reduce((n, s) => n + s.articles.length, 0);
    const top = topCompanies(stories)[0];
    const stat = (label, value, sub) => `<div class="stat"><span class="stat__label">${label}</span><span class="stat__value">${value}</span><span class="stat__sub">${sub}</span></div>`;
    return `<div class="stat-row">${[
      stat('이슈', stories.length, stories.length ? `주요 이슈 ${major}개` : '쌓인 이슈 없음'),
      stat('기사', articles, '이슈에 묶인 기사'),
      stat('가장 많이 나온 기업', top ? esc(A.shortName(top.c)) : '–', top ? `이슈 ${top.n}개` : '–'),
      stat('새 모델', models.length, models.length ? esc(models.slice(0, 2).map((m) => m.name).join(', ')) : '이 주 출시 없음'),
    ].join('')}</div>`;
  }

  function recapHTML(d) {
    const esc = A.esc;
    const r = d.recap;
    let body;
    switch (d.recapStatus) {
      case 'ready':
        body = `
          <p class="rp-recap__headline">${esc(r.headline)}</p>
          <p class="rp-recap__overview">${esc(r.overview)}</p>
          ${r.points.length ? `<ol class="rp-recap__points">${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
          <p class="detail__foot">Claude(${esc(r.model)})가 이 주의 브리핑 이슈 ${r.storyCount}개만 읽고 정리했어요 · ${fmtTime(r.generatedAt)}</p>`;
        break;
      case 'generating':
        body = '<div class="briefing-notice"><span class="spinner" aria-hidden="true"></span><span>Claude가 한 주를 정리하는 중이에요. 잠시 뒤 자동으로 나타나요.</span></div>';
        break;
      case 'in-progress':
        body = d.aiEnabled
          ? '<p class="rp-recap__note">이번 주는 아직 진행 중이에요. 일요일이 지나면 Claude가 한 주를 정리해요. 지금까지 쌓인 이슈는 아래에 있어요.</p>'
          : `<p class="rp-recap__note">이번 주는 아직 진행 중이에요. ${d.sample ? '샘플 모드에서는 요약을 만들지 않아요.' : '<code>.env</code>에 <code>ANTHROPIC_API_KEY</code>를 넣으면 한 주가 끝날 때 Claude가 정리해요.'}</p>`;
        break;
      case 'too-few':
        body = '<p class="rp-recap__note">이 주는 쌓인 이슈가 3개보다 적어서 요약을 쓰지 않았어요.</p>';
        break;
      case 'error':
        body = `<p class="rp-recap__note">요약을 만들지 못했어요. ${esc(d.recapError || '')} 잠시 뒤 다시 시도해요.</p>`;
        break;
      default: // unconfigured
        body = d.sample
          ? '<p class="rp-recap__note">샘플 모드에서는 요약을 만들지 않아요. 실제 서버에서 API 키가 있으면 지난 한 주가 끝날 때 Claude가 정리해요.</p>'
          : '<p class="rp-recap__note"><code>.env</code>에 <code>ANTHROPIC_API_KEY</code>를 넣으면 한 주가 끝날 때 Claude가 그 주의 이슈를 정리해요.</p>';
    }
    return `<section class="card rp-recap"><div class="card__head"><div><h2 class="card__title">한 주 요약</h2></div></div>${body}</section>`;
  }

  function topCompanies(stories) {
    const counts = new Map();
    for (const s of stories) for (const id of new Set(s.companyIds)) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts.entries()]
      .filter(([id]) => A.byId.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ c: A.byId.get(id), n }));
  }

  function barsHTML(rows, label) {
    if (!rows.length) return '<p class="chart-empty">이 주에 쌓인 이슈가 없어요.</p>';
    const max = Math.max(...rows.map((r) => r.n));
    return `<ol class="rp-bars" aria-label="${label}">${rows
      .map((r) => `
        <li class="rp-bar">
          <span class="rp-bar__label">${r.label}</span>
          <span class="rp-bar__track"><span class="rp-bar__fill" style="width:${Math.max(4, (r.n / max) * 100).toFixed(1)}%"></span></span>
          <span class="rp-bar__value">${r.n}</span>
        </li>`)
      .join('')}</ol>`;
  }

  function companyBarsHTML(stories) {
    const esc = A.esc;
    const rows = topCompanies(stories)
      .slice(0, TOP_COMPANIES)
      .map(({ c, n }) => ({ n, label: `<button type="button" class="rp-company" data-open="${esc(c.id)}">${A.logoHTML(c)}<span>${esc(A.shortName(c))}</span></button>` }));
    return barsHTML(rows, '기업별 이슈 수');
  }

  function topicBarsHTML(stories) {
    const counts = new Map();
    for (const s of stories) counts.set(s.topic, (counts.get(s.topic) || 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, n]) => ({ n, label: `<span class="rp-topic">${A.esc(topic)}</span>` }));
    return barsHTML(rows, '분야별 이슈 수');
  }

  function modelsHTML(models) {
    const esc = A.esc;
    if (!models.length) return '<p class="rp-empty">타임라인에 이 주 출시로 기록된 모델이 없어요.</p>';
    return `<ul class="rp-models">${models
      .map((m) => {
        const c = A.byId.get(m.company);
        return `
          <li class="rp-model">
            <button type="button" class="rp-model__logo" data-open="${esc(c.id)}" aria-label="${esc(A.shortName(c))} 지도에서 보기">${A.logoHTML(c)}</button>
            <span class="rp-model__body">
              <span class="rp-model__head"><strong>${esc(m.name)}</strong><span class="kind-tag kind-${esc(m.kind)}"><span class="kind-dot" aria-hidden="true"></span>${esc((KINDS[m.kind] || {}).label || m.kind)}</span>${m.open ? '<span class="ml-flag">오픈 웨이트</span>' : ''}</span>
              <span class="rp-model__meta">${esc(A.shortName(c))} · ${fmtDay(m.date)}</span>
              <span class="rp-model__desc">${esc(m.desc)}</span>
            </span>
          </li>`;
      })
      .join('')}</ul>`;
  }

  function storyHTML(s) {
    const esc = A.esc;
    const logos = s.companyIds
      .map((id) => A.byId.get(id))
      .filter(Boolean)
      .slice(0, 5)
      .map((c) => `<button type="button" class="rp-story__logo" data-open="${esc(c.id)}" title="${esc(A.shortName(c))} 지도에서 보기">${A.logoHTML(c)}</button>`)
      .join('');
    const articles = s.articles
      .map((a) => `
        <li><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a>
        <span class="rp-article__meta">${esc(a.source)} · ${fmtTime(a.publishedAt)}</span></li>`)
      .join('');
    return `
      <article class="rp-story rp-story--${esc(s.importance)}">
        <div class="rp-story__top">
          <span class="story-topic">${esc(s.topic)}</span>
          ${s.importance === 'major' ? '<span class="story-major">주요</span>' : `<span class="rp-story__imp">${IMPORTANCE_LABEL[s.importance] || ''}</span>`}
          <span class="rp-story__logos">${logos}</span>
        </div>
        <h4 class="rp-story__title">${esc(s.title)}</h4>
        <p class="rp-story__summary">${esc(s.summary)}</p>
        <details class="rp-story__articles"><summary>기사 ${s.articles.length}건</summary><ul>${articles}</ul></details>
      </article>`;
  }

  function daysHTML(stories, d) {
    if (!stories.length) {
      if (state.query || (state.favOnly && stories.length === 0 && d.stories.length)) {
        return `<p class="rp-empty">${state.favOnly && !A.favorites.list().length ? '아직 관심 기업이 없어요. 기업에 별표(☆)를 달아 보세요.' : '고른 조건에 맞는 이슈가 없어요.'}</p>`;
      }
      const first = d.firstDate
        ? `보관된 이슈는 ${fmtDay(d.firstDate)}부터 있어요.`
        : d.sample
          ? ''
          : '브리핑 보관은 API 키를 넣은 뒤 만들어지는 AI 브리핑부터 시작돼요. 서버가 켜져 있으면 하루 한 번 이상 쌓여요.';
      return `<p class="rp-empty">이 주에 쌓인 브리핑 이슈가 없어요. ${first}</p>`;
    }
    const days = new Map();
    for (const s of stories) {
      if (!days.has(s.date)) days.set(s.date, []);
      days.get(s.date).push(s);
    }
    return [...days.entries()]
      .map(([date, items]) => `
        <section class="rp-day">
          <h3 class="ml-year__title">${fmtDay(date)} <span>이슈 ${items.length}개</span></h3>
          <div class="rp-day__list">${items.map(storyHTML).join('')}</div>
        </section>`)
      .join('');
  }

  // ───────── Events ─────────
  function bind() {
    els.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-week], [data-open]');
      if (!t) return;
      if (t.dataset.open) A.openCompany(t.dataset.open);
      else if (t.dataset.week) load(t.dataset.week);
    });
    els.root.addEventListener('change', (e) => {
      if (e.target === els.weekSelect) load(els.weekSelect.value);
      else if (e.target === els.favOnly) {
        state.favOnly = els.favOnly.checked;
        render();
      }
    });
    window.addEventListener('aimap:favorites', () => {
      if (state.favOnly && state.data && !els.root.hidden) render();
    });
  }

  function ensure() {
    if (els) return;
    A = window.AIMap;
    els = { root: document.getElementById('report') };
    bind();
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapReport = {
    show() {
      ensure();
      els.root.hidden = false;
      // Re-fetch on every visit: a new briefing or a finished recap may have arrived.
      load(state.week);
    },
    hide() {
      if (els) els.root.hidden = true;
      clearTimeout(pollTimer);
    },
    setQuery(q) {
      state.query = q;
      if (els && !els.root.hidden && state.data) render();
    },
  };
})();
