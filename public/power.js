// Power for AI: the plants AI companies buy electricity from or build next to their data centers
// (diamond pins, glyph = fuel, fill = status), and the power companies that run them or supply the
// data centers. A plant's panel draws lines to the data centers it feeds and the companies buying
// its power; a power company's panel draws lines from its headquarters to its plants and the data
// centers it supplies. Same rules as the data center layer: confirmed plants by default, plans
// faint in "전체", every number with its basis and every entry with sources.
// Loaded before app.js, which calls init() with the map and the panel helpers it owns.
(() => {
  'use strict';

  const PLANTS = window.AI_POWER_PLANTS || [];
  const COMPANIES = window.AI_POWER_COMPANIES || [];
  const FUELS = window.AI_POWER_FUELS || {};
  const STATUS = window.AI_POWER_STATUS || {};
  const FUEL_KEYS = Object.keys(FUELS);
  const plantById = new Map(PLANTS.map((p) => [p.id, p]));
  const companyById = new Map(COMPANIES.map((c) => [c.id, c]));
  const MAX_MW = Math.max(...PLANTS.map((p) => p.mw || 0), 1);

  const GLYPHS = {
    nuclear: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9.5" ry="3.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(120 12 12)"/><circle class="fill" cx="12" cy="12" r="1.8"/></svg>',
    advanced: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M12 2.5l2.1 6.6 6.4 2.9-6.4 2.9L12 21.5l-2.1-6.6L3.5 12l6.4-2.9z"/></svg>',
    gas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 3.2 4.8 5.3 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.2 1.1-3.6 2.2-4.8.3 1.6 1 2.6 2 2.9C11.2 8.6 11 5.6 12 3z"/></svg>',
  };
  const HQ_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9l6-4v15M10 20V5l10 5v10M4 20h16M13 13h4M13 16h4"/></svg>';
  const BASIS = { ann: '발표', rep: '보도' };

  const state = {
    visible: false,
    scope: 'certain', // certain | all
    fuels: new Set(FUEL_KEYS),
    query: '',
    selected: null, // 'plant:<id>' | 'co:<id>'
  };

  let ctx = null; // from app.js
  let layer = null;
  let toggleBtn = null;
  const markers = new Map();

  // ───────── Helpers ─────────
  function fmtMW(mw) {
    if (mw == null) return '–';
    if (mw >= 1000) return `${(mw / 1000).toFixed(1)}GW`;
    return `${Math.round(mw)}MW`;
  }

  function fmtWhen(s) {
    if (!s) return '';
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    return m ? `${m[1]}년 ${Number(m[2])}월` : /^\d{4}$/.test(s) ? `${s}년` : s;
  }

  const label = (p) => p.nameKo || p.name;
  const coLabel = (c) => c.nameKo || c.name;
  const pinSize = (p) => Math.round(18 + 18 * Math.sqrt((p.mw || 0) / MAX_MW));
  const DC = () => window.AIMapDatacenters;

  function pinHTML(p, size = pinSize(p), extra = '') {
    return `<div class="pw-pin pw-${p.status}${p.certain === false ? ' is-uncertain' : ''}${extra}" style="--size:${size}px"><span class="pw-pin__glyph">${GLYPHS[p.fuel] || ''}</span></div>`;
  }

  function mwHTML(p) {
    if (p.mw == null) return '<span class="dc-num is-none" title="규모가 공개되지 않았어요">비공개</span>';
    return `<span class="dc-num" title="${BASIS[p.basis] === '발표' ? '회사 발표·공시 수치예요.' : '언론·업계 보도 수치예요.'}">${fmtMW(p.mw)}<span class="dc-basis dc-basis--${p.basis}">${BASIS[p.basis]}</span></span>`;
  }

  // Data centers a power company supplies, from the data center data's energy field.
  function dcsOfCompany(c) {
    const names = c.epochNames || [];
    if (!names.length || !DC()) return [];
    return (window.AI_DATACENTERS || []).filter((d) => d.energy && d.energy.split(', ').some((e) => names.includes(e)));
  }

  function plantsOfCompany(c) {
    return PLANTS.filter((p) => p.operator === c.id);
  }

  function matchesPlant(p) {
    if (state.scope === 'certain' && !p.certain) return false;
    if (!state.fuels.has(p.fuel)) return false;
    const q = state.query;
    if (!q) return true;
    const buyers = p.buyers.flatMap((id) => {
      const c = ctx.byId.get(id);
      return c ? [c.name, c.nameKo] : [];
    });
    const op = companyById.get(p.operator);
    return [p.name, p.nameKo, p.place, p.operatorName || '', op ? coLabel(op) : '', op ? op.name : '', ...buyers].some((t) => t.toLowerCase().includes(q));
  }

  // ───────── Map layer ─────────
  function buildLayer() {
    layer = L.layerGroup();
    for (const p of [...PLANTS].sort((a, b) => (b.mw || 0) - (a.mw || 0))) {
      const size = pinSize(p);
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'pin-icon', html: pinHTML(p, size), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        title: label(p),
        alt: label(p),
        riseOnHover: true,
      });
      m.bindTooltip(
        `<strong>${ctx.esc(label(p))}</strong>${p.certain ? '' : ' <span class="dc-tooltip__doubt">계획</span>'}<br>${FUELS[p.fuel].label} · ${STATUS[p.status].label}${p.mw ? ` · ${fmtMW(p.mw)}` : ''}`,
        { direction: 'top', offset: [0, -size / 2], className: 'dc-tooltip' }
      );
      m.on('click', () => openPlant(p.id));
      m.on('add', () => {
        const el = m.getElement();
        if (el) el.querySelector('.pw-pin').classList.toggle('is-selected', state.selected === `plant:${p.id}`);
      });
      markers.set(p.id, m);
    }
    syncLayer();
  }

  function syncLayer() {
    if (!layer) return;
    layer.clearLayers();
    for (const p of PLANTS) if (matchesPlant(p)) layer.addLayer(markers.get(p.id));
    if (state.visible && !ctx.map.hasLayer(layer)) layer.addTo(ctx.map);
    if (!state.visible && ctx.map.hasLayer(layer)) ctx.map.removeLayer(layer);
  }

  function addToggleControl() {
    const Toggle = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const btn = L.DomUtil.create('button', 'dc-toggle pw-toggle');
        btn.type = 'button';
        btn.innerHTML = `${GLYPHS.gas}<span>발전소</span>`;
        btn.title = 'AI 데이터센터에 전기를 대는 발전소 지도에 표시';
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
    const box = ctx.pane.querySelector('[data-pw-visible]');
    if (box) box.checked = on;
  }

  // ───────── Sidebar pane ─────────
  function renderPane() {
    const esc = ctx.esc;
    const list = PLANTS.filter(matchesPlant).sort((a, b) => Number(b.certain) - Number(a.certain) || (b.mw || 0) - (a.mw || 0));
    const certainCount = PLANTS.filter((p) => p.certain).length;
    const counts = Object.fromEntries(FUEL_KEYS.map((k) => [k, PLANTS.filter((p) => p.fuel === k && (state.scope === 'all' || p.certain)).length]));
    const q = state.query;
    const cos = COMPANIES.filter((c) => !q || [c.name, c.nameKo].some((t) => t.toLowerCase().includes(q)))
      .map((c) => ({ c, plants: plantsOfCompany(c).length, dcs: dcsOfCompany(c).length, deals: (c.deals || []).length + plantsOfCompany(c).filter((p) => p.buyers.length).length }))
      .sort((a, b) => b.plants + b.dcs + b.deals - (a.plants + a.dcs + a.deals));
    const plantItem = (p) => {
      const logos = p.buyers.map((id) => ctx.byId.get(id)).filter(Boolean).map(ctx.logoHTML).join('');
      return `
        <li>
          <button type="button" class="dc-item${p.certain ? '' : ' is-uncertain'}" data-plant="${esc(p.id)}" aria-current="${state.selected === `plant:${p.id}`}">
            ${pinHTML(p, 22)}
            <span class="dc-item__body">
              <span class="dc-item__name">${esc(label(p))}${p.certain ? '' : ' <span class="dc-doubt">계획</span>'}</span>
              <span class="dc-item__meta">${p.country ? `${ctx.flag(p.country)} ` : ''}${esc(FUELS[p.fuel].label)} · ${esc(STATUS[p.status].label)}${logos ? ` <span class="dc-logos">${logos}</span>` : ''}</span>
            </span>
            <span class="dc-item__mw">${p.mw ? `<strong>${fmtMW(p.mw)}</strong>` : '<span>비공개</span>'}<span>${esc(fmtWhen(p.since) || '')}</span></span>
          </button>
        </li>`;
    };
    const coItem = ({ c, plants, dcs, deals }) => `
      <li>
        <button type="button" class="pw-co" data-power-co="${esc(c.id)}" aria-current="${state.selected === `co:${c.id}`}">
          <span class="pw-co__icon" aria-hidden="true">${HQ_ICON}</span>
          <span class="dc-item__body"><span class="dc-item__name">${esc(coLabel(c))}</span><span class="dc-item__meta">${esc(c.kind)} · ${esc(c.hq.place)}</span></span>
          <span class="pw-co__counts">${[plants && `발전소 ${plants}`, dcs && `데이터센터 ${dcs}`, deals && `계약 ${deals}`].filter(Boolean).join(' · ')}</span>
        </button>
      </li>`;
    ctx.pane.innerHTML = `
      <div class="dc-head">
        <div class="briefing-head__title">AI 전력</div>
        <div class="briefing-head__meta">AI 기업이 전기를 사기로 했거나 데이터센터 옆에 짓는 발전소 ${PLANTS.length}곳 · 전력 회사 ${COMPANIES.length}곳</div>
        <div class="dc-head__row">
          <div class="segmented" role="group" aria-label="보기 범위">
            <button type="button" data-pw-scope="certain" aria-pressed="${state.scope === 'certain'}" title="실제로 있거나 공사 중인 발전소">확인된 곳 ${certainCount}</button>
            <button type="button" data-pw-scope="all" aria-pressed="${state.scope === 'all'}" title="계획·승인 단계까지 흐리게 함께 보기">전체 ${PLANTS.length}</button>
          </div>
          <label class="switch"><input type="checkbox" data-pw-visible${state.visible ? ' checked' : ''}><span class="switch__track" aria-hidden="true"></span>지도에 표시</label>
        </div>
      </div>
      <div class="dc-controls">
        <div class="chips" role="group" aria-label="연료">
          ${FUEL_KEYS.map((k) => `
            <button type="button" class="chip dc-chip" data-pw-fuel="${k}" aria-pressed="${state.fuels.has(k)}" title="${esc(FUELS[k].desc || '')}">
              ${pinHTML({ fuel: k, status: 'operating', certain: true }, 15)}${esc(FUELS[k].label)}<span class="chip__count">${counts[k]}</span>
            </button>`).join('')}
        </div>
        <details class="dc-legend">
          <summary>보는 법 · 숫자의 근거</summary>
          <ul>
            <li>마름모 안 그림이 연료예요: ${pinHTML({ fuel: 'nuclear', status: 'operating', certain: true }, 15)} 원자력 ${pinHTML({ fuel: 'advanced', status: 'operating', certain: true }, 15)} 차세대 원자력·핵융합 ${pinHTML({ fuel: 'gas', status: 'operating', certain: true }, 15)} 천연가스</li>
            <li>채움은 상태예요: ${pinHTML({ fuel: 'nuclear', status: 'operating', certain: true }, 15)} 가동 ${pinHTML({ fuel: 'nuclear', status: 'partial', certain: true }, 15)} 일부 가동 ${pinHTML({ fuel: 'nuclear', status: 'construction', certain: true }, 15)} 재가동 준비·건설 중 ${pinHTML({ fuel: 'nuclear', status: 'planned', certain: true }, 15)} 계획</li>
            <li>규모는 회사 <b>발표</b>·공시나 언론 <b>보도</b> 수치예요. 원전 계약은 발전소 전체가 아니라 계약 물량일 수 있어요(상세에 표시).</li>
            <li>전력 회사와 데이터센터의 연결은 Epoch AI 데이터센터 자료의 전력 공급사 기준이에요.</li>
          </ul>
        </details>
      </div>
      <div class="pw-scroll">
        <h3 class="pw-section">발전소</h3>
        ${list.length ? `<ul class="dc-list pw-list">${list.map(plantItem).join('')}</ul>` : '<p class="empty">조건에 맞는 발전소가 없어요.</p>'}
        <h3 class="pw-section">전력 회사</h3>
        ${cos.length ? `<ul class="dc-list pw-list">${cos.map(coItem).join('')}</ul>` : '<p class="empty">조건에 맞는 전력 회사가 없어요.</p>'}
      </div>
      <p class="sidebar__foot">발전소 위치는 부지 근사치예요. 각 항목을 누르면 근거 자료를 볼 수 있어요.</p>`;
  }

  function bindPane() {
    ctx.pane.addEventListener('click', (e) => {
      const t = e.target.closest('[data-plant], [data-power-co], [data-pw-fuel], [data-pw-scope]');
      if (!t) return;
      if (t.dataset.plant) openPlant(t.dataset.plant, { fly: true });
      else if (t.dataset.powerCo) openCompany(t.dataset.powerCo);
      else if (t.dataset.pwScope) {
        state.scope = t.dataset.pwScope;
        syncLayer();
        renderPane();
      } else if (t.dataset.pwFuel) {
        const k = t.dataset.pwFuel;
        if (state.fuels.has(k) && state.fuels.size === 1) FUEL_KEYS.forEach((f) => state.fuels.add(f));
        else if (state.fuels.has(k)) state.fuels.delete(k);
        else state.fuels.add(k);
        syncLayer();
        renderPane();
      }
    });
    ctx.pane.addEventListener('change', (e) => {
      if (e.target.matches('[data-pw-visible]')) setVisible(e.target.checked);
    });
  }

  // ───────── Shared panel pieces ─────────
  const closeBtn = '<button type="button" class="icon-btn detail__close" data-action="close" aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';

  function companyChip(id, role) {
    const c = ctx.byId.get(id);
    if (!c) return '';
    return `<button type="button" class="dc-company" data-company="${ctx.esc(id)}">${ctx.logoHTML(c)}<span><strong>${ctx.esc(ctx.shortName(c))}</strong><span class="dc-company__role">${role}</span></span></button>`;
  }

  function dcChip(d, role) {
    const esc = ctx.esc;
    return `<button type="button" class="dc-company${d.certain ? '' : ' is-likely'}" data-dc="${esc(d.id)}">${DC().pinHTML(d, 28)}<span><strong>${esc(DC().label(d))}</strong><span class="dc-company__role">${role}${d.certain ? '' : ' · 미확인 데이터센터'}</span></span></button>`;
  }

  function plantRow(p, extra = '') {
    const esc = ctx.esc;
    return `
      <li>
        <button type="button" class="dc-mini__item${p.certain ? '' : ' is-uncertain'}" data-plant="${esc(p.id)}">
          ${pinHTML(p, 20)}
          <span class="dc-mini__body"><span class="dc-mini__name">${esc(label(p))}</span><span class="dc-mini__meta">${extra || `${esc(FUELS[p.fuel].label)} · ${esc(STATUS[p.status].label)}`}</span></span>
          <span class="dc-mini__mw">${p.mw ? fmtMW(p.mw) : ''}</span>
        </button>
      </li>`;
  }

  function sourcesHTML(list) {
    const esc = ctx.esc;
    return `<ul class="dc-sources">${list.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></li>`).join('')}</ul>`;
  }

  // Lines from `main` to other points: companies (their pins) or data centers / plants (custom pins).
  function overlayTo(kind, main, mainHTML, targets) {
    const others = targets.map((t) => {
      if (t.company) return { c: t.company, linkClass: t.cls };
      return { c: { id: t.id, name: t.name, label: t.label, lat: t.lat, lng: t.lng }, linkClass: t.cls, html: t.html, onClick: t.onClick };
    });
    if (others.length) ctx.showOverlay(kind, main, others, { mainHTML });
    else if (ctx.overlayKind() === kind) ctx.clearOverlay();
    return others.length > 0;
  }

  // ───────── Plant panel ─────────
  function plantHTML(p) {
    const esc = ctx.esc;
    const op = companyById.get(p.operator);
    const dcs = p.datacenters.map((id) => DC() && DC().get(id)).filter(Boolean);
    const fact = (k, v) => `<div class="fact"><span class="fact__label">${k}</span><span class="fact__value">${v}</span></div>`;
    return `
      ${closeBtn}
      <div class="detail__scroll">
        <div class="detail__head">
          ${pinHTML(p, 52)}
          <div>
            <h2 class="detail__title">${esc(label(p))}</h2>
            <div class="detail__subtitle">${p.nameKo ? `${esc(p.name)} · ` : ''}${p.country ? `${ctx.flag(p.country)} ` : ''}${esc(p.place)}</div>
            <div class="pill-row">
              <span class="pill pw-fuel-pill">${esc(FUELS[p.fuel].label)}</span>
              <span class="pill pill--neutral">${esc(STATUS[p.status].label)}</span>
              <span class="pill ${p.certain ? 'dc-certain' : 'dc-uncertain'}">${p.certain ? '✓ 확인된 곳' : '? 계획 단계'}</span>
            </div>
          </div>
        </div>
        ${p.certain ? '' : '<p class="dc-doubt-note">계획·승인 단계라 아직 공사가 확인되지 않았어요. 위치·규모·일정은 바뀔 수 있어요.</p>'}

        <section class="section">
          <div class="facts">
            ${fact('규모', mwHTML(p))}
            ${p.since ? fact(p.status === 'operating' || p.status === 'partial' ? '가동' : '목표', esc(fmtWhen(p.since))) : ''}
            ${fact('운영', op ? `<button type="button" class="pw-link" data-power-co="${esc(op.id)}">${esc(coLabel(op))} →</button>` : esc(p.operatorName || '–'))}
          </div>
          ${p.deal ? `<p class="pw-deal"><strong>계약</strong> ${esc(p.deal)}</p>` : ''}
        </section>

        <section class="section">
          <h3 class="section__title">설명</h3>
          <p class="detail__summary">${esc(p.desc)}</p>
        </section>

        ${p.buyers.length || dcs.length ? `
          <section class="section">
            <h3 class="section__title">이 전기를 쓰는 곳</h3>
            <div class="dc-companies">${p.buyers.map((id) => companyChip(id, '전력 구매')).join('')}${dcs.map((d) => dcChip(d, '직접 공급받는 데이터센터')).join('')}</div>
            ${!dcs.length ? '<p class="dm-more">특정 데이터센터에 직접 잇지 않고 전력망으로 보내는 계약이에요.</p>' : ''}
          </section>` : ''}

        <section class="section">
          <h3 class="section__title">근거 자료 · ${p.sources.length}</h3>
          ${sourcesHTML(p.sources)}
        </section>
        <p class="detail__foot">정리 기준 ${esc(window.AI_POWER_AS_OF || '')} · 발전소 위치는 근사치예요.</p>
      </div>`;
  }

  function openPlant(id, { fly = false } = {}) {
    const p = plantById.get(id);
    if (!p) return;
    if (!state.visible) setVisible(true);
    if (DC()) DC().deselect();
    if (!p.certain && state.scope === 'certain') state.scope = 'all';
    ctx.showPanel(plantHTML(p), 'detail--dc detail--power');
    state.selected = `plant:${id}`;
    syncLayer();
    renderPane();
    const targets = [
      ...p.datacenters.map((dcId) => DC() && DC().get(dcId)).filter(Boolean).map((d) => ({
        id: d.id, name: d.name, label: DC().label(d), lat: d.lat, lng: d.lng, cls: 'pw-link-line', html: DC().pinHTML(d, 30), onClick: () => DC().open(d.id),
      })),
      ...p.buyers.map((bid) => ctx.byId.get(bid)).filter(Boolean).map((c) => ({ company: c, cls: 'pw-link-line pw-link-line--buyer' })),
    ];
    const linked = overlayTo('power', { id: p.id, name: p.name, label: label(p), lat: p.lat, lng: p.lng }, pinHTML(p, 40, ' is-selected'), targets);
    if (!linked && fly) ctx.map.flyTo([p.lat, p.lng], Math.max(ctx.map.getZoom(), 7), { duration: 0.8 });
  }

  // ───────── Power company panel ─────────
  function companyHTML(c) {
    const esc = ctx.esc;
    const plants = plantsOfCompany(c);
    const dcs = dcsOfCompany(c).sort((a, b) => Number(b.certain) - Number(a.certain) || (b.maxMW || 0) - (a.maxMW || 0));
    const deals = c.deals || [];
    return `
      ${closeBtn}
      <div class="detail__scroll">
        <div class="detail__head">
          <span class="pw-co__icon pw-co__icon--big" aria-hidden="true">${HQ_ICON}</span>
          <div>
            <h2 class="detail__title">${esc(coLabel(c))}</h2>
            <div class="detail__subtitle">${esc(c.name)} · 본사 ${esc(c.hq.place)}</div>
            <div class="pill-row"><span class="pill pill--neutral">${esc(c.kind)}</span></div>
          </div>
        </div>
        ${c.desc ? `<p class="detail__summary">${esc(c.desc)}</p>` : ''}
        ${plants.length ? `
          <section class="section">
            <h3 class="section__title">운영하는 발전소 · ${plants.length}</h3>
            <ul class="dc-mini">${plants.map((p) => plantRow(p)).join('')}</ul>
          </section>` : ''}
        ${deals.length ? `
          <section class="section">
            <h3 class="section__title">AI 기업과의 계약</h3>
            <ul class="pw-deals">${deals.map((d) => `
              <li>${companyChip(d.buyer, esc(fmtWhen(d.date)))}
                <p>${esc(d.what)}</p>
                <a href="${esc(d.source.url)}" target="_blank" rel="noopener noreferrer">${esc(d.source.title)} ↗</a>
              </li>`).join('')}</ul>
          </section>` : ''}
        ${dcs.length ? `
          <section class="section">
            <h3 class="section__title">전력을 공급하는 데이터센터 · ${dcs.length}</h3>
            <div class="dc-companies">${dcs.map((d) => dcChip(d, d.place)).join('')}</div>
            <p class="dm-more">Epoch AI 데이터센터 자료의 전력 공급사 기준이에요. 각 데이터센터의 근거 자료에서 확인할 수 있어요.</p>
          </section>` : ''}
        <p class="detail__foot">본사 위치에서 선을 이어 보여 줘요 · 정리 기준 ${esc(window.AI_POWER_AS_OF || '')}</p>
      </div>`;
  }

  function openCompany(id) {
    const c = companyById.get(id);
    if (!c) return;
    if (!state.visible) setVisible(true);
    if (DC()) DC().deselect();
    ctx.showPanel(companyHTML(c), 'detail--dc detail--power');
    state.selected = `co:${id}`;
    syncLayer();
    renderPane();
    const targets = [
      ...plantsOfCompany(c).map((p) => ({ id: p.id, name: p.name, label: label(p), lat: p.lat, lng: p.lng, cls: 'pw-link-line', html: pinHTML(p, 30), onClick: () => openPlant(p.id) })),
      ...dcsOfCompany(c).map((d) => ({ id: d.id, name: d.name, label: DC().label(d), lat: d.lat, lng: d.lng, cls: `pw-link-line pw-link-line--dc${d.certain ? '' : ' dc-link--likely'}`, html: DC().pinHTML(d, 28), onClick: () => DC().open(d.id) })),
      ...(c.deals || []).map((d) => ctx.byId.get(d.buyer)).filter(Boolean).map((co) => ({ company: co, cls: 'pw-link-line pw-link-line--buyer' })),
    ];
    overlayTo('power', { id: `hq-${c.id}`, name: c.name, label: `${coLabel(c)} 본사`, lat: c.hq.lat, lng: c.hq.lng }, `<span class="pw-co__icon pw-co__icon--pin" aria-hidden="true">${HQ_ICON}</span>`, targets);
  }

  function deselect() {
    if (!state.selected) return;
    state.selected = null;
    syncLayer();
    renderPane();
  }

  // ───────── Sections in other panels ─────────
  // In a data center's panel: the plants feeding it and the power companies supplying it.
  function dcSectionHTML(d) {
    if (!ctx) return '';
    const esc = ctx.esc;
    const plants = PLANTS.filter((p) => p.datacenters.includes(d.id));
    const energy = d.energy ? d.energy.split(', ') : [];
    const cos = COMPANIES.filter((c) => (c.epochNames || []).some((n) => energy.includes(n)));
    const unknown = energy.filter((e) => !cos.some((c) => (c.epochNames || []).includes(e)));
    if (!plants.length && !energy.length) return '';
    return `
      <section class="section">
        <h3 class="section__title">전력</h3>
        ${plants.length ? `<ul class="dc-mini">${plants.map((p) => plantRow(p, `${esc(FUELS[p.fuel].label)} · 전용 발전`)).join('')}</ul>` : ''}
        ${cos.length || unknown.length ? `<div class="tags pw-cos">${cos.map((c) => `<button type="button" class="tag pw-co-tag" data-power-co="${esc(c.id)}">${esc(coLabel(c))} →</button>`).join('')}${unknown.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div>
          <p class="dm-more">전력 공급사는 ${d.epoch ? 'Epoch AI 자료' : '공개 보도'} 기준이에요.</p>` : ''}
      </section>`;
  }

  // In a company's panel: the plants it buys power from and its other power deals.
  function companySectionHTML(companyId) {
    if (!ctx) return '';
    const esc = ctx.esc;
    const plants = PLANTS.filter((p) => p.buyers.includes(companyId)).sort((a, b) => Number(b.certain) - Number(a.certain) || (b.mw || 0) - (a.mw || 0));
    const deals = COMPANIES.flatMap((c) => (c.deals || []).filter((d) => d.buyer === companyId).map((d) => ({ c, d })));
    if (!plants.length && !deals.length) return '';
    return `
      <section class="section">
        <h3 class="section__title">전력 계약 · ${plants.length + deals.length}</h3>
        ${plants.length ? `<ul class="dc-mini">${plants.map((p) => plantRow(p, `${esc(FUELS[p.fuel].label)} · ${esc(STATUS[p.status].label)}${p.since ? ` · ${esc(fmtWhen(p.since))}` : ''}`)).join('')}</ul>` : ''}
        ${deals.length ? `<ul class="dc-mini">${deals.map(({ c, d }) => `
          <li><button type="button" class="dc-mini__item" data-power-co="${esc(c.id)}">
            <span class="pw-co__icon" aria-hidden="true">${HQ_ICON}</span>
            <span class="dc-mini__body"><span class="dc-mini__name">${esc(coLabel(c))}</span><span class="dc-mini__meta">${esc(d.what)}</span></span>
            <span class="dc-mini__mw">${esc(fmtWhen(d.date))}</span>
          </button></li>`).join('')}</ul>` : ''}
      </section>`;
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapPower = {
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
    openPlant,
    openCompany,
    deselect,
    dcSectionHTML,
    companySectionHTML,
  };
})();
