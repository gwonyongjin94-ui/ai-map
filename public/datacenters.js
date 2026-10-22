// AI data centers on the map: a layer of square pins (size = planned power, fill = status), a
// sidebar list, a detail panel with lines to the companies that run and use each site, and a
// section in each company's detail. Loaded before app.js, which calls init() with the map and the
// panel helpers it owns.
//
// What is known and what is guessed stays visible: by default only confirmed sites show (someone
// is confidently known to run or use it, and buildings are really there). Estimated and forecast
// numbers are drawn faint with an "추정"/"예상" mark; announced and reported ones are solid. Every
// site lists its evidence.
(() => {
  'use strict';

  const DCS = window.AI_DATACENTERS || [];
  const STATUS = window.AI_DATACENTER_STATUS || {};
  const STATUS_KEYS = Object.keys(STATUS);
  const byId = new Map(DCS.map((d) => [d.id, d]));
  const MAX_MW = Math.max(...DCS.map((d) => d.maxMW || 0), 1);
  const PIN_MIN = 16;
  const PIN_MAX = 40;
  const SERVER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="16" height="6.5" rx="1.6"/><circle cx="7.6" cy="7.25" r="1.1"/><circle cx="7.6" cy="16.75" r="1.1"/></svg>';

  // How sure a number is. est/fcst are drawn faint.
  const BASIS = {
    est: { label: '추정', tip: 'Epoch AI가 위성 사진·인허가 서류로 계산한 추정치예요.' },
    fcst: { label: '예상', tip: 'Epoch AI가 공사 속도로 내다본 예상치예요. 실제 일정과 다를 수 있어요.' },
    ann: { label: '발표', tip: '회사가 공식 발표한 수치예요.' },
    rep: { label: '보도', tip: '언론 보도로 알려진 수치예요.' },
  };

  const state = {
    visible: false,
    scope: 'certain', // certain | all
    statuses: new Set(STATUS_KEYS),
    sort: 'max', // max | now
    query: '',
    selected: null,
  };

  let ctx = null; // from app.js
  let layer = null;
  let toggleBtn = null;
  const markers = new Map();

  // ───────── Formatting ─────────
  function fmtMW(mw) {
    if (mw == null) return '–';
    if (mw >= 1000) return `${(mw / 1000).toFixed(mw >= 10000 ? 0 : 1)}GW`;
    return `${Math.round(mw)}MW`;
  }

  function fmtMonth(m) {
    if (!m) return '';
    const [y, mo] = m.split('-');
    return mo ? `${y}년 ${Number(mo)}월` : `${y}년`;
  }

  function fmtDate(date) {
    const [y, m, d] = date.split('-');
    return `${y}.${m}.${d}`;
  }

  const label = (d) => d.nameKo || d.name;
  // "계획" for what is still to come, "규모" for a site that's running with no growth planned.
  const sizeLabel = (d) => (d.maxAt || d.status === 'construction' || d.status === 'planned' ? '계획' : '규모');
  const pinSize = (d) => Math.round(PIN_MIN + (PIN_MAX - PIN_MIN) * Math.sqrt((d.maxMW || 0) / MAX_MW));

  // Which kind of number "now" and "planned" are for a site.
  function basisOf(d, which) {
    if (!d.epoch) return d.basis === 'announced' ? 'ann' : 'rep';
    if (which === 'max' && d.maxAt) return 'fcst';
    return 'est';
  }

  // A number with its basis: faint "약 …" with a mark when it is an estimate or forecast.
  function numHTML(mw, basis, { mark = true } = {}) {
    if (mw == null) return '<span class="dc-num is-none" title="공개된 수치가 없어요">공개 안 됨</span>';
    if (mw === 0) return '<span class="dc-num is-none">가동 전</span>';
    const b = BASIS[basis];
    const faint = basis === 'est' || basis === 'fcst';
    return `<span class="dc-num${faint ? ' is-est' : ''}" title="${b.label}: ${b.tip}">${faint ? '약 ' : ''}${fmtMW(mw)}${mark ? `<span class="dc-basis dc-basis--${basis}">${b.label}</span>` : ''}</span>`;
  }

  function pinHTML(d, size = pinSize(d), extra = '') {
    return `<div class="dc-pin dc-${d.status}${d.certain === false ? ' is-uncertain' : ''}${extra}" style="--size:${size}px">${SERVER_ICON}</div>`;
  }

  const companyIds = (ids) => (ids || []).filter((id) => ctx.byId.has(id));

  function companiesOf(d) {
    return [...new Set([d.owner, ...(d.users || []), ...(d.usersLikely || [])].filter(Boolean))].filter((id) => ctx.byId.has(id));
  }

  // Why a site isn't in the confirmed view.
  function doubtOf(d) {
    if (d.certain) return '';
    if (d.status === 'planned') return '계획만 발표됐고 아직 공사가 확인되지 않았어요.';
    if (!d.owner && !d.ownerName) return '누가 운영하는지 공개되지 않았어요.';
    return '운영·사용 기업이 "유력"하다는 정도로만 알려졌어요.';
  }

  function matches(d) {
    if (state.scope === 'certain' && !d.certain) return false;
    if (!state.statuses.has(d.status)) return false;
    const q = state.query;
    if (!q) return true;
    const names = companiesOf(d).flatMap((id) => {
      const c = ctx.byId.get(id);
      return [c.name, c.nameKo];
    });
    return [d.name, d.nameKo || '', d.place, d.ownerName || '', ...(d.userNames || []), d.project || '', ...names]
      .some((t) => t.toLowerCase().includes(q));
  }

  // ───────── Map layer ─────────
  // Sites cluster among themselves (square clusters showing the count and planned power), apart
  // from the round company clusters.
  function buildLayer() {
    layer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 34,
      spiderfyDistanceMultiplier: 1.5,
      iconCreateFunction: (group) => {
        const sites = group.getAllChildMarkers().map((m) => byId.get(m.options.dcId));
        const mw = sites.reduce((n, d) => n + (d.maxMW || 0), 0);
        return L.divIcon({
          className: 'pin-icon',
          html: `<div class="dc-cluster"><strong>${sites.length}</strong><span>${fmtMW(mw)}</span></div>`,
          iconSize: [46, 38],
        });
      },
    });
    // Biggest first, so small sites in the same metro stay clickable on top.
    for (const d of [...DCS].sort((a, b) => (b.maxMW || 0) - (a.maxMW || 0))) {
      const size = pinSize(d);
      const m = L.marker([d.lat, d.lng], {
        icon: L.divIcon({ className: 'pin-icon', html: pinHTML(d, size), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        title: label(d),
        alt: label(d),
        riseOnHover: true,
        dcId: d.id,
      });
      const now = d.nowMW == null ? '공개 안 됨' : `${basisOf(d, 'now') === 'est' ? '약 ' : ''}${fmtMW(d.nowMW)}`;
      m.bindTooltip(
        `<strong>${ctx.esc(label(d))}</strong>${d.certain ? '' : ' <span class="dc-tooltip__doubt">미확인</span>'}<br>${STATUS[d.status].label} · 지금 ${now} / 계획 ${fmtMW(d.maxMW)}${d.epoch ? ' (추정)' : ''}`,
        { direction: 'top', offset: [0, -size / 2], className: 'dc-tooltip' }
      );
      m.on('click', () => open(d.id));
      // Cluster re-adds marker elements as you zoom; keep the selection ring in sync.
      m.on('add', () => {
        const el = m.getElement();
        if (el) el.querySelector('.dc-pin').classList.toggle('is-selected', d.id === state.selected);
      });
      markers.set(d.id, m);
    }
    syncLayer();
  }

  function syncLayer() {
    if (!layer) return;
    layer.clearLayers();
    layer.addLayers(DCS.filter(matches).map((d) => markers.get(d.id)));
    if (state.visible && !ctx.map.hasLayer(layer)) layer.addTo(ctx.map);
    if (!state.visible && ctx.map.hasLayer(layer)) ctx.map.removeLayer(layer);
  }

  // A button under the zoom control, so the layer can be shown without opening the sidebar.
  function addToggleControl() {
    const Toggle = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const btn = L.DomUtil.create('button', 'dc-toggle');
        btn.type = 'button';
        btn.innerHTML = `${SERVER_ICON}<span>데이터센터</span>`;
        btn.title = 'AI 데이터센터 지도에 표시';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', () => setVisible(!state.visible));
        toggleBtn = btn;
        return btn;
      },
    });
    new Toggle().addTo(ctx.map);
  }

  function setVisible(on) {
    state.visible = on;
    if (toggleBtn) toggleBtn.setAttribute('aria-pressed', String(on));
    syncLayer();
    const box = ctx.pane.querySelector('[data-dc-visible]');
    if (box) box.checked = on;
  }

  // ───────── Sidebar pane ─────────
  function legendHTML() {
    const pin = (status) => pinHTML({ status, certain: true }, 16);
    return `
      <details class="dc-legend">
        <summary>보는 법 · 숫자의 근거</summary>
        <ul>
          <li>${pin('operating')} 가동 ${pin('partial')} 가동하며 증설 중 ${pin('construction')} 건설 중 ${pin('planned')} 계획 · 크기는 계획 전력</li>
          <li><span class="dc-num">270MW<span class="dc-basis dc-basis--ann">발표</span></span> <span class="dc-num">40MW<span class="dc-basis dc-basis--rep">보도</span></span> 회사 발표나 언론 보도로 확인된 숫자</li>
          <li><span class="dc-num is-est">약 1.3GW<span class="dc-basis dc-basis--est">추정</span></span> <span class="dc-num is-est">약 2.1GW<span class="dc-basis dc-basis--fcst">예상</span></span> Epoch AI가 위성 사진·인허가 서류로 계산하거나 내다본 숫자 — 흐리게 보여요</li>
          <li>${pinHTML({ status: 'operating', certain: false }, 16)} 흐린 핀: 운영사가 공개되지 않았거나 계획만 있는 곳 ("전체" 보기에서만)</li>
          <li>전력은 냉각까지 포함한 시설 전체 기준이에요.</li>
        </ul>
      </details>`;
  }

  function renderPane() {
    const esc = ctx.esc;
    const inScope = DCS.filter((d) => state.scope === 'all' || d.certain);
    const list = DCS.filter(matches).sort((a, b) =>
      state.sort === 'now' ? (b.nowMW || 0) - (a.nowMW || 0) || (b.maxMW || 0) - (a.maxMW || 0) : (b.maxMW || 0) - (a.maxMW || 0)
    );
    const now = inScope.reduce((n, d) => n + (d.nowMW || 0), 0);
    const planned = inScope.reduce((n, d) => n + (d.maxMW || 0), 0);
    const certainCount = DCS.filter((d) => d.certain).length;
    const counts = Object.fromEntries(STATUS_KEYS.map((k) => [k, inScope.filter((d) => d.status === k).length]));
    const item = (d) => {
      const logos = companiesOf(d).slice(0, 3).map((id) => ctx.logoHTML(ctx.byId.get(id))).join('');
      const share = d.maxMW ? Math.min(100, ((d.nowMW || 0) / d.maxMW) * 100) : 0;
      return `
        <li>
          <button type="button" class="dc-item${d.certain ? '' : ' is-uncertain'}" data-dc="${esc(d.id)}" aria-current="${d.id === state.selected}">
            ${pinHTML(d, 22)}
            <span class="dc-item__body">
              <span class="dc-item__name">${esc(label(d))}${d.certain ? '' : ' <span class="dc-doubt">미확인</span>'}</span>
              <span class="dc-item__meta">${d.country ? `${ctx.flag(d.country)} ` : ''}${esc(d.place)}${logos ? ` <span class="dc-logos">${logos}</span>` : ''}</span>
              <span class="dc-bar${d.epoch ? ' is-est' : ''}"><span style="width:${share.toFixed(1)}%"></span></span>
            </span>
            <span class="dc-item__mw">${numHTML(d.maxMW, basisOf(d, 'max'), { mark: false })}<span>${d.nowMW == null ? '지금 –' : d.nowMW === 0 ? '가동 전' : `지금 ${numHTML(d.nowMW, basisOf(d, 'now'), { mark: false })}`}</span></span>
          </button>
        </li>`;
    };
    ctx.pane.innerHTML = `
      <div class="dc-head">
        <div class="briefing-head__title">AI 데이터센터</div>
        <div class="briefing-head__meta">${inScope.length}곳 · 지금 <span class="dc-num is-est">약 ${fmtMW(now)}</span> 가동 · 계획 합계 <span class="dc-num is-est">약 ${fmtMW(planned)}</span> (대부분 추정)</div>
        <div class="dc-head__row">
          <div class="segmented" role="group" aria-label="보기 범위">
            <button type="button" data-dc-scope="certain" aria-pressed="${state.scope === 'certain'}" title="운영·사용 기업이 확실하고 건물이 실제로 있는 곳">확인된 곳 ${certainCount}</button>
            <button type="button" data-dc-scope="all" aria-pressed="${state.scope === 'all'}" title="운영사 미공개·계획 단계까지 흐리게 함께 보기">전체 ${DCS.length}</button>
          </div>
          <label class="switch"><input type="checkbox" data-dc-visible${state.visible ? ' checked' : ''}><span class="switch__track" aria-hidden="true"></span>지도에 표시</label>
        </div>
      </div>
      <div class="dc-controls">
        <div class="chips" role="group" aria-label="상태">
          ${STATUS_KEYS.map((k) => `
            <button type="button" class="chip dc-chip" data-dc-status="${k}" aria-pressed="${state.statuses.has(k)}">
              ${pinHTML({ status: k, certain: true }, 14)}${esc(STATUS[k].label)}<span class="chip__count">${counts[k]}</span>
            </button>`).join('')}
        </div>
        <div class="segmented dc-sort" role="group" aria-label="정렬">
          <button type="button" data-dc-sort="max" aria-pressed="${state.sort === 'max'}">계획 규모순</button>
          <button type="button" data-dc-sort="now" aria-pressed="${state.sort === 'now'}">지금 가동순</button>
        </div>
        ${legendHTML()}
      </div>
      ${list.length ? `<ul class="dc-list">${list.map(item).join('')}</ul>` : '<p class="empty">조건에 맞는 데이터센터가 없어요.</p>'}
      <p class="sidebar__foot">대부분 <a href="https://epoch.ai/data/ai-data-centers" target="_blank" rel="noopener noreferrer">Epoch AI</a> 데이터(CC BY)이고, 한국·일본·인도·프랑스 몇 곳은 공개 보도로 보탰어요. 각 데이터센터를 누르면 근거 자료를 볼 수 있어요.</p>`;
  }

  function bindPane() {
    ctx.pane.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dc], [data-dc-status], [data-dc-sort], [data-dc-scope]');
      if (!t) return;
      if (t.dataset.dc) {
        open(t.dataset.dc, { fly: true });
      } else if (t.dataset.dcScope) {
        state.scope = t.dataset.dcScope;
        syncLayer();
        renderPane();
      } else if (t.dataset.dcStatus) {
        const k = t.dataset.dcStatus;
        // Clicking the only active status turns every status back on instead of showing nothing.
        if (state.statuses.has(k) && state.statuses.size === 1) STATUS_KEYS.forEach((s) => state.statuses.add(s));
        else if (state.statuses.has(k)) state.statuses.delete(k);
        else state.statuses.add(k);
        syncLayer();
        renderPane();
      } else if (t.dataset.dcSort) {
        state.sort = t.dataset.dcSort;
        renderPane();
      }
    });
    ctx.pane.addEventListener('change', (e) => {
      if (e.target.matches('[data-dc-visible]')) setVisible(e.target.checked);
    });
  }

  // ───────── Detail panel ─────────
  // One plain-language paragraph built from the data, so every site has an explanation.
  function summaryHTML(d) {
    // No marks inside the sentence (they'd sit between a number and its particle); the faint
    // style and the box below say which numbers are estimates.
    const now = numHTML(d.nowMW, basisOf(d, 'now'), { mark: false });
    const max = numHTML(d.maxMW, basisOf(d, 'max'), { mark: false });
    const first = d.firstAt ? fmtMonth(d.firstAt) : '';
    switch (d.status) {
      case 'operating':
        return `${first ? `${first}부터 가동하고 있고, ` : '가동 중이며 '}지금 ${now} 전력을 쓰는 것으로 보여요. 더 늘리는 계획은 확인되지 않았어요.`;
      case 'partial':
        return `${first ? `${first}에 첫 건물이 가동됐고, ` : '일부 건물이 가동 중이며 '}지금 ${now}${d.maxAt ? `에서 ${fmtMonth(d.maxAt)}까지 ${max}로` : `, 모두 지으면 ${max}로`} 늘어날 전망이에요.`;
      case 'construction':
        return `아직 가동 전이에요. ${first ? `${fmtMonth(d.firstAt)}에 첫 가동, ` : ''}${d.maxAt ? `${fmtMonth(d.maxAt)}까지 ` : ''}${max} 규모가 될 전망이에요.`;
      default:
        return `계획만 발표된 단계예요. 알려진 규모는 ${max}예요.`;
    }
  }

  function methodHTML(d) {
    if (d.epoch) {
      return `
        <div class="dc-method">
          <strong>숫자는 어떻게 나왔나요?</strong>
          <p>비영리 연구기관 Epoch AI가 위성 사진으로 건물마다 지붕·냉각 설비·발전기가 갖춰진 시점을 보고, 냉각 설비 규모와 인허가·시공 서류로 전력을 계산했어요. 그래서 지금 전력과 가동 시점은 <b>추정</b>, 앞으로의 규모와 시점은 <b>예상</b>이에요. 아래 근거 자료와 확인 기록에서 계산의 바탕을 볼 수 있어요.</p>
        </div>`;
    }
    return `
      <div class="dc-method">
        <strong>숫자는 어떻게 나왔나요?</strong>
        <p>${d.basis === 'announced' ? '회사가 공식 발표한 계획 수치예요.' : '언론 보도로 알려진 수치예요. 회사가 공식 확인하지 않은 값이 섞여 있을 수 있어요.'} 현재 실제로 쓰는 전력은 공개되지 않았어요.</p>
      </div>`;
  }

  function detailHTML(d) {
    const esc = ctx.esc;
    const chip = (id, role, likely = false) => {
      const c = ctx.byId.get(id);
      return `<button type="button" class="dc-company${likely ? ' is-likely' : ''}" data-company="${esc(id)}">${ctx.logoHTML(c)}<span><strong>${esc(ctx.shortName(c))}</strong><span class="dc-company__role">${role}${likely ? ' · 유력 (확정 아님)' : ''}</span></span></button>`;
    };
    const ownerLikely = d.ownerConf && d.ownerConf !== 'confident';
    const runs = d.owner && ctx.byId.has(d.owner)
      ? [chip(d.owner, d.users && d.users.includes(d.owner) ? '운영·사용' : '운영', ownerLikely)]
      : [];
    const uses = companyIds(d.users).filter((id) => id !== d.owner).map((id) => chip(id, '사용'));
    const usesLikely = companyIds(d.usersLikely).filter((id) => id !== d.owner).map((id) => chip(id, '사용', true));
    const others = [
      d.ownerName ? `<span class="tag${ownerLikely ? ' is-likely' : ''}">운영 ${esc(d.ownerName)}${ownerLikely ? ' (유력)' : ''}</span>` : '',
      ...(d.userNames || []).map((n) => `<span class="tag">사용 ${esc(n)}</span>`),
      ...(d.userNamesLikely || []).map((n) => `<span class="tag is-likely">사용 ${esc(n)} (유력)</span>`),
    ].join('');
    const share = d.maxMW ? Math.min(100, ((d.nowMW || 0) / d.maxMW) * 100) : 0;
    const fact = (k, v) => `<div class="fact"><span class="fact__label">${k}</span><span class="fact__value">${v}</span></div>`;
    const firstLabel = d.status === 'operating' || d.status === 'partial' ? '가동 시작' : '가동 예정';
    const firstValue = d.firstAt
      ? d.epoch ? `<span class="dc-num is-est">${fmtMonth(d.firstAt)}<span class="dc-basis dc-basis--${d.firstAt > new Date().toISOString().slice(0, 7) ? 'fcst' : 'est'}">${d.firstAt > new Date().toISOString().slice(0, 7) ? '예상' : '추정'}</span></span>` : fmtMonth(d.firstAt)
      : '미정';
    const sources = (d.sources || []).map((s) => `
      <li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>${s.note ? `<span class="dc-source__note">${esc(s.note)}</span>` : ''}</li>`).join('');
    const log = (d.log || []).map((l) => `
      <li class="${l.future ? 'is-future' : ''}"><span class="dc-log__date">${fmtDate(l.date)}${l.future ? ' · 예상' : ''}</span><span class="dc-log__mw">${l.mw ? `약 ${fmtMW(l.mw)}` : '가동 전'}</span><span class="dc-log__note" lang="en">${esc(l.note)}</span></li>`).join('');
    return `
      <button type="button" class="icon-btn detail__close" data-action="close" aria-label="닫기">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="detail__scroll">
        <div class="detail__head">
          ${pinHTML(d, 52)}
          <div>
            <h2 class="detail__title">${esc(label(d))}</h2>
            <div class="detail__subtitle">${d.nameKo ? `${esc(d.name)} · ` : ''}${d.country ? `${ctx.flag(d.country)} ` : ''}${esc(d.place)}</div>
            <div class="pill-row">
              <span class="pill dc-status-pill dc-${d.status}">${esc(STATUS[d.status].label)}</span>
              <span class="pill ${d.certain ? 'dc-certain' : 'dc-uncertain'}">${d.certain ? '✓ 확인된 곳' : '? 미확인'}</span>
              ${d.project ? `<span class="pill pill--neutral">${esc(d.project)}</span>` : ''}
            </div>
          </div>
        </div>
        ${d.certain ? '' : `<p class="dc-doubt-note">${doubtOf(d)} 위치·규모를 참고로만 봐 주세요.</p>`}

        <section class="section">
          <h3 class="section__title">전력 규모 (시설 전체)</h3>
          <div class="dc-power">
            <div class="dc-power__row"><span>지금 ${numHTML(d.nowMW, basisOf(d, 'now'))}</span><span>${sizeLabel(d)} ${numHTML(d.maxMW, basisOf(d, 'max'))}${d.maxAt ? ` <span class="dc-num is-est">${fmtMonth(d.maxAt)}</span>` : ''}</span></div>
            <div class="dc-bar dc-bar--big${d.epoch ? ' is-est' : ''}"><span style="width:${share.toFixed(1)}%"></span></div>
          </div>
          <p class="dc-summary">${summaryHTML(d)}</p>
          <div class="facts">
            ${fact(firstLabel, firstValue)}
            ${d.h100e ? fact('컴퓨팅 (H100 환산)', `<span class="dc-num is-est" title="지금 들어 있는 칩의 성능을 엔비디아 H100 개수로 바꾼 값 (추정)">약 ${d.h100e >= 10000 ? `${Math.round(d.h100e / 10000)}만` : d.h100e.toLocaleString('ko-KR')}개<span class="dc-basis dc-basis--est">추정</span></span>`) : ''}
            ${d.chips ? fact('칩', esc(d.chips)) : ''}
            ${d.energy ? fact('전력 공급', esc(d.energy)) : ''}
          </div>
          ${methodHTML(d)}
        </section>

        ${d.desc ? `<section class="section"><h3 class="section__title">설명</h3><p class="detail__summary">${esc(d.desc)}</p></section>` : ''}

        ${runs.length || uses.length || usesLikely.length || others ? `
          <section class="section">
            <h3 class="section__title">운영·사용 기업</h3>
            <div class="dc-companies">${runs.join('')}${uses.join('')}${usesLikely.join('')}</div>
            ${others ? `<div class="tags">${others}</div>` : ''}
          </section>` : ''}

        <section class="section">
          <h3 class="section__title">근거 자료 · ${(d.sources || []).length}</h3>
          <ul class="dc-sources">${sources}</ul>
          ${log ? `
            <details class="dc-log">
              <summary>Epoch AI 위성 확인 기록 (영어 원문)</summary>
              <ul>${log}</ul>
            </details>` : ''}
        </section>

        <p class="detail__foot">${d.epoch ? `자료: <a href="https://epoch.ai/data/ai-data-centers" target="_blank" rel="noopener noreferrer">Epoch AI, 'AI data centers'</a> (CC BY 4.0) · ` : ''}정리 기준 ${esc(window.AI_DATACENTERS_AS_OF || '')}</p>
      </div>`;
  }

  // Lines from the site to the headquarters of the companies that run and use it.
  function showLinks(d) {
    const others = [];
    const add = (id, cls) => {
      if (id && ctx.byId.has(id) && !others.some((o) => o.c.id === id)) others.push({ c: ctx.byId.get(id), linkClass: cls });
    };
    add(d.owner, `dc-link dc-link--owner${d.ownerConf === 'confident' ? '' : ' dc-link--likely'}`);
    for (const id of d.users || []) add(id, 'dc-link dc-link--user');
    for (const id of d.usersLikely || []) add(id, 'dc-link dc-link--user dc-link--likely');
    const main = { id: d.id, name: d.name, label: label(d), lat: d.lat, lng: d.lng };
    if (others.length) ctx.showOverlay('datacenter', main, others, { mainHTML: pinHTML(d, 40, ' is-selected') });
    else if (ctx.overlayKind() === 'datacenter') ctx.clearOverlay();
    return others.length > 0;
  }

  function open(id, { fly = false } = {}) {
    const d = byId.get(id);
    if (!d) return;
    if (!state.visible) setVisible(true);
    // Opening a site that the confirmed view hides (e.g. from a company's detail) widens the view.
    if (!d.certain && state.scope === 'certain') state.scope = 'all';
    ctx.showPanel(detailHTML(d), 'detail--dc');
    state.selected = id;
    syncLayer();
    renderPane();
    const linked = showLinks(d);
    if (!linked && fly) ctx.map.flyTo([d.lat, d.lng], Math.max(ctx.map.getZoom(), 7), { duration: 0.8 });
  }

  function deselect() {
    if (!state.selected) return;
    state.selected = null;
    syncLayer();
    renderPane();
  }

  // ───────── Company detail section ─────────
  function sectionHTML(companyId) {
    if (!ctx) return '';
    const esc = ctx.esc;
    const role = (d) => {
      if (d.owner === companyId) return d.ownerConf === 'confident' ? '운영' : '운영(유력)';
      if ((d.users || []).includes(companyId)) return '사용';
      return '사용(유력)';
    };
    const list = DCS.filter((d) => d.owner === companyId || (d.users || []).includes(companyId) || (d.usersLikely || []).includes(companyId))
      // Confirmed sites first, then by planned size.
      .sort((a, b) => Number(b.certain) - Number(a.certain) || (b.maxMW || 0) - (a.maxMW || 0));
    if (!list.length) return '';
    const shown = list.slice(0, 6);
    return `
      <section class="section">
        <h3 class="section__title">AI 데이터센터 · ${list.length}</h3>
        <ul class="dc-mini">${shown.map((d) => `
          <li>
            <button type="button" class="dc-mini__item${d.certain ? '' : ' is-uncertain'}" data-dc="${esc(d.id)}">
              ${pinHTML(d, 20)}
              <span class="dc-mini__body"><span class="dc-mini__name">${esc(label(d))}${d.certain ? '' : ' <span class="dc-doubt">미확인</span>'}</span><span class="dc-mini__meta">${role(d)} · ${esc(d.place)} · ${esc(STATUS[d.status].label)}</span></span>
              <span class="dc-mini__mw">${numHTML(d.maxMW, basisOf(d, 'max'), { mark: false })}</span>
            </button>
          </li>`).join('')}</ul>
        ${list.length > shown.length ? `<p class="dm-more">나머지 ${list.length - shown.length}곳은 사이드바의 데이터센터 목록에서 볼 수 있어요.</p>` : ''}
        <p class="dm-more">흐린 숫자는 위성 사진으로 계산한 추정·예상치예요.</p>
      </section>`;
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapDatacenters = {
    init(context) {
      ctx = context;
      buildLayer();
      addToggleControl();
      renderPane();
      bindPane();
    },
    setVisible,
    setQuery(q) {
      state.query = q;
      if (!ctx) return;
      syncLayer();
      renderPane();
    },
    open,
    deselect,
    sectionHTML,
  };
})();
