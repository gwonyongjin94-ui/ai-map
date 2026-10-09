// Data watch review page: see what changed, fix proposals up, apply or dismiss, revert.
// Relation proposals (from deal news) add edges to the relations graph the same way.
(() => {
  'use strict';

  const POLL_MS = 3000;
  const CHECK_LABELS = {
    wikidata: 'CEO 변동 (Wikidata)',
    listing: '신규 상장 (Yahoo)',
    quotes: '종목 상태 (Yahoo)',
    news: '뉴스 신호',
    relations: '관계 제안 (인수·합병 기사)',
    ai: 'Claude 검토',
  };
  const SOURCE_LABELS = { wikidata: 'Wikidata', yahoo: 'Yahoo Finance', news: '기사 제목', claude: 'Claude', manual: '직접 수정' };
  const CONFIDENCE_LABELS = { high: '신뢰도 높음', medium: '신뢰도 보통', low: '신뢰도 낮음' };
  const FIELD_LABELS = { leader: '리더', listings: '상장', private: '비상장 정보', parent: '모회사', note: '최근 소식', summary: '소개' };
  const AI_DECISION = { update: '변경 필요', 'no-change': '변경 없음', unclear: '불확실' };

  const root = document.getElementById('admin');
  const byId = new Map((window.AI_COMPANIES || []).map((c) => [c.id, c]));
  const companyOptions = [...byId.values()].sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko'));
  let data = null;
  let tab = 'proposals';
  let pollTimer = null;
  let flash = null; // { kind: 'ok'|'error', text }

  // ───────── Helpers ─────────
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function fmtTime(ms) {
    if (!ms) return '–';
    return new Date(ms).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function fmtDate(ms) {
    return new Date(ms).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }

  function record(id) {
    return (data && data.records[id]) || byId.get(id) || { name: id, nameKo: id, category: 'app' };
  }

  function logoHTML(c) {
    const initials = (c.name || '?').replace(/\(.*?\)/g, '').split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const domain = 'logoDomain' in c ? c.logoDomain : c.domain;
    const img = domain ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="" referrerpolicy="no-referrer">` : '';
    return `<span class="logo cat-${esc(c.category)}${domain ? '' : ' is-broken'}">${img}<span class="logo__fallback">${esc(initials)}</span></span>`;
  }

  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('logo')) e.target.parentElement.classList.add('is-broken');
  }, true);

  function fmtField(key, v) {
    if (v == null || v === '') return '<span class="muted">없음</span>';
    switch (key) {
      case 'leader':
        return `${esc(v.nameKo)} <span class="muted">(${esc(v.name)}) · ${esc(v.title)}</span>`;
      case 'listings':
        return v.length ? v.map((l) => `${esc(l.exchange)} ${esc(l.ticker)} <span class="muted">(${esc(l.symbol)})</span>`).join(', ') : '<span class="muted">없음</span>';
      case 'private':
        return [v.status && esc(v.status), v.investors && v.investors.length && `<span class="muted">투자자: ${esc(v.investors.join(', '))}</span>`].filter(Boolean).join('<br>') || '<span class="muted">비상장</span>';
      default:
        return esc(v);
    }
  }

  // ───────── API ─────────
  async function api(action, body) {
    const res = await fetch(`api/watch${action ? `/${action}` : ''}`, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {});
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  async function refresh() {
    clearTimeout(pollTimer);
    try {
      data = await api();
    } catch (err) {
      flash = { kind: 'error', text: `점검 상태를 불러오지 못했어요: ${err.message}` };
    }
    render();
    if (data && data.running) pollTimer = setTimeout(refresh, POLL_MS);
  }

  async function act(action, body, okText) {
    try {
      data = await api(action, body);
      flash = okText ? { kind: 'ok', text: okText } : null;
    } catch (err) {
      flash = { kind: 'error', text: err.message };
    }
    render();
    if (data && data.running) pollTimer = setTimeout(refresh, POLL_MS);
  }

  // ───────── Forms ─────────
  // One form builder for proposals (fields = the patch's keys) and manual edits (a fixed set).
  function formFields(keys, values, c) {
    return keys.map((key) => {
      const v = values[key];
      switch (key) {
        case 'leader':
          return `<fieldset class="field-group"><legend>리더</legend>
            <label>한글 이름<input name="leader.nameKo" value="${esc(v && v.nameKo)}"></label>
            <label>영문 이름<input name="leader.name" value="${esc(v && v.name)}"></label>
            <label>직함<input name="leader.title" value="${esc(v && v.title)}"></label></fieldset>`;
        case 'listings': {
          const l = (v && v[0]) || {};
          return `<fieldset class="field-group"><legend>상장</legend>
            <label>거래소<input name="listing.exchange" value="${esc(l.exchange)}"></label>
            <label>티커<input name="listing.ticker" value="${esc(l.ticker)}"></label>
            <label>Yahoo 심볼<input name="listing.symbol" value="${esc(l.symbol)}"></label></fieldset>`;
        }
        case 'private':
          if (v === null) return '<p class="field-note">상장으로 바뀌어 비상장 정보(투자자·상장 추진 현황)는 지워져요.</p>';
          return `<label class="field">비상장 현황<input name="private.status" value="${esc((v && v.status) || (c.private && c.private.status) || '')}" placeholder="예: 2026년 10월 나스닥 상장 추진"></label>`;
        case 'parent':
          return `<label class="field">모회사<input name="parent" value="${esc(v)}" placeholder="없으면 비워 두세요"></label>`;
        case 'note':
          return `<label class="field">최근 소식 (지도 상세에 표시)<textarea name="note" rows="2">${esc(v)}</textarea></label>`;
        case 'summary':
          return `<label class="field">소개<textarea name="summary" rows="2">${esc(v)}</textarea></label>`;
        default:
          return '';
      }
    }).join('');
  }

  function readForm(form, keys, base) {
    const val = (name) => (form.elements[name] ? form.elements[name].value.trim() : '');
    const patch = {};
    for (const key of keys) {
      if (key === 'leader') patch.leader = { name: val('leader.name'), nameKo: val('leader.nameKo'), title: val('leader.title') };
      else if (key === 'listings') patch.listings = [{ exchange: val('listing.exchange'), ticker: val('listing.ticker'), symbol: val('listing.symbol') }];
      else if (key === 'private') {
        const status = val('private.status');
        if (base.private === null) patch.private = null;
        else if (status || base.private) patch.private = { ...(base.private || {}), status: status || undefined };
      }
      else if (key === 'parent') patch.parent = val('parent') || null;
      else if (key === 'note') patch.note = val('note') || null;
      else if (key === 'summary') patch.summary = val('summary');
    }
    return patch;
  }

  // Manual edit: only send the fields that actually changed.
  function changedFields(patch, current) {
    return Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(current[k] ?? null)));
  }

  // ───────── Rendering ─────────
  function statusHTML() {
    const last = data.lastRun;
    const checks = last ? last.checks : {};
    const items = Object.entries(CHECK_LABELS).map(([key, label]) => {
      const c = checks[key];
      const cls = !c ? 'is-idle' : c.ok === true ? 'is-ok' : c.ok === false ? 'is-error' : 'is-skip';
      const icon = !c ? '–' : c.ok === true ? '✓' : c.ok === false ? '!' : '–';
      return `<li class="check ${cls}"><span class="check__icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><span class="check__msg">${esc(c ? c.message : '아직 실행 전')}</span></span></li>`;
    }).join('');
    const running = data.running;
    return `
      <section class="card watch-status">
        <div class="watch-status__head">
          <div>
            <h1 class="board__title">데이터 점검</h1>
            <p class="board__sub">${last ? `마지막 점검 ${fmtTime(last.at)}${last.trigger === 'schedule' ? ' (자동)' : ''}` : '아직 점검한 적이 없어요'} · ${data.intervalHours}시간마다 자동 점검${data.nextRunAt && !running ? ` · 다음 ${fmtTime(data.nextRunAt)}` : ''}</p>
          </div>
          <button type="button" class="btn btn--primary" data-action="run" ${running ? 'disabled' : ''}>
            ${running ? '<span class="spinner" aria-hidden="true"></span> 점검 중…' : '지금 점검'}
          </button>
        </div>
        <ul class="check-list">${items}</ul>
        ${data.aiEnabled ? '' : '<p class="watch-hint">.env에 ANTHROPIC_API_KEY를 넣으면 Claude가 뉴스 신호를 읽고 변경 제안으로 바꿔 줘요.</p>'}
      </section>`;
  }

  function companyHead(c, extra = '') {
    return `<div class="watch-card__company">${logoHTML(c)}<span><strong>${esc(c.nameKo || c.name)}</strong> <span class="muted">${esc(c.name)}</span></span>${extra}</div>`;
  }

  function evidenceHTML(list) {
    if (!list || !list.length) return '';
    return `<ul class="evidence">${list.map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.label)} ↗</a></li>`).join('')}</ul>`;
  }

  // ───────── Relations ─────────
  const relTypes = () => (data && data.relationTypes) || window.AI_RELATION_TYPES || {};

  function relTypeTag(type) {
    const t = relTypes()[type];
    return `<span class="rel-tag rel-${esc(type)}"><span class="rel-key" aria-hidden="true"></span>${esc(t ? t.label : type)}</span>`;
  }

  function companyChip(id) {
    const c = record(id);
    return `<span class="rel-company">${logoHTML(c)}<strong>${esc(c.nameKo || c.name)}</strong></span>`;
  }

  function relationLine(r) {
    const t = relTypes()[r.type];
    return `<span class="rel-line">${companyChip(r.from)}<span class="rel-line__arrow" aria-hidden="true">${t && !t.directed ? '↔' : '→'}</span>${companyChip(r.to)}</span>`;
  }

  // How the graph will read it, e.g. "스페이스X · xAI의 자회사: 커서".
  function relationReading(r) {
    const t = relTypes()[r.type];
    return t ? `${esc(record(r.from).nameKo)}의 ${esc(t.out)}: ${esc(record(r.to).nameKo)}` : '';
  }

  // Evidence is labelled "출처 · 제목"; relations.js titles read "제목 (출처)".
  function evidenceSource(e) {
    const i = e.label.indexOf(' · ');
    return { title: i > 0 ? `${e.label.slice(i + 3)} (${e.label.slice(0, i)})` : e.label, url: e.url };
  }

  function uniqueSources(list) {
    return list.filter((s, i) => s && s.url && list.findIndex((x) => x && x.url === s.url) === i);
  }

  const proposalSources = (p) => uniqueSources([p.relation.source, ...(p.evidence || []).map(evidenceSource)]);
  const signalSources = (s) => uniqueSources((s.headlines || []).map((h) => ({ title: `${h.title} (${h.source})`, url: h.url })));

  function relationFields(r, sources) {
    const companies = (selected) =>
      `<option value="">기업 선택</option>${companyOptions.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.nameKo)}</option>`).join('')}`;
    const types = Object.entries(relTypes()).map(([k, t]) => `<option value="${esc(k)}"${k === r.type ? ' selected' : ''}>${esc(t.label)}</option>`).join('');
    const srcs = sources.map((s, i) => `<option value="${i}"${r.source && r.source.url === s.url ? ' selected' : ''}>${esc(s.title)}</option>`).join('');
    return `
      <div class="rel-pick">
        <label class="field">주체 (인수·투자·공급하는 쪽)<select name="from">${companies(r.from)}</select></label>
        <button type="button" class="btn rel-swap" data-action="swap" aria-label="방향 바꾸기" title="방향 바꾸기">⇄</button>
        <label class="field">대상<select name="to">${companies(r.to)}</select></label>
      </div>
      <div class="rel-pick rel-pick--meta">
        <label class="field">종류<select name="type">${types}</select></label>
        <label class="field">시기<input name="since" value="${esc(r.since)}" placeholder="2026 또는 2026-06"></label>
      </div>
      <label class="field">한 줄 요약 (관계도에 표시)<input name="label" value="${esc(r.label)}" maxlength="60" placeholder="예: 자회사 (2026년 인수)"></label>
      <label class="field">설명<textarea name="detail" rows="2" maxlength="300" placeholder="한두 문장으로">${esc(r.detail)}</textarea></label>
      <label class="field">출처 기사<select name="source"><option value="">없음 (관계도에서 관련 뉴스 검색 링크를 대신 보여 줘요)</option>${srcs}</select></label>`;
  }

  function readRelationForm(form, sources) {
    const val = (name) => form.elements[name].value.trim();
    const source = sources[val('source')];
    return {
      from: val('from'),
      to: val('to'),
      type: val('type'),
      label: val('label'),
      detail: val('detail'),
      since: val('since') || undefined,
      source: source ? { title: source.title, url: source.url } : null,
    };
  }

  function relationProposalHTML(p) {
    const r = p.relation;
    const current = p.current && p.current.length
      ? p.current.map((x) => `<div>${relTypeTag(x.type)} <span class="muted">${esc(record(x.from).nameKo)} → ${esc(record(x.to).nameKo)} · ${esc(x.label)}</span></div>`).join('')
      : '<span class="muted">없음</span>';
    return `
      <article class="card watch-card" data-proposal="${esc(p.id)}">
        <header class="watch-card__head">
          ${relationLine(r)}
          <span class="pill-row">
            <span class="tag tag--kind">${esc(p.title)}</span>
            <span class="tag tag--${esc(p.confidence)}">${CONFIDENCE_LABELS[p.confidence] || ''}</span>
            <span class="tag">${SOURCE_LABELS[p.source] || esc(p.source)}</span>
          </span>
        </header>
        <p class="watch-card__summary">${esc(p.summary)}</p>
        <table class="diff"><tbody>
          <tr><th scope="row">지금 관계</th><td>${current}</td></tr>
          <tr><th scope="row">제안</th><td class="is-new">
            <div>${relTypeTag(r.type)} <strong>${esc(r.label)}</strong>${r.since ? ` <span class="muted">· ${esc(r.since)}</span>` : ''}</div>
            <div class="rel-proposal__detail">${esc(r.detail)}</div>
            <div class="muted">${relationReading(r)}</div>
          </td></tr>
        </tbody></table>
        ${evidenceHTML(p.evidence)}
        <form class="watch-form" data-form="relation-proposal">
          <details><summary>반영하기 전에 고치기 (방향·종류·문구)</summary><div class="watch-form__fields">${relationFields(r, proposalSources(p))}</div></details>
          <div class="watch-card__actions">
            <button type="submit" class="btn btn--primary">관계도에 추가</button>
            <button type="button" class="btn" data-action="dismiss">무시</button>
            <span class="muted">${fmtTime(p.createdAt)} 발견</span>
          </div>
        </form>
      </article>`;
  }

  function addedRelationsHTML() {
    const list = data.addedRelations || [];
    if (!list.length) return '';
    const items = list.map((r) => `
      <li data-relation="${esc(r.id)}">
        <div class="added-rel">${relationLine(r)}<span>${relTypeTag(r.type)} <strong>${esc(r.label)}</strong>${r.since ? ` <span class="muted">· ${esc(r.since)}</span>` : ''}</span></div>
        <div class="rel-proposal__detail">${esc(r.detail)}${r.source ? ` <a class="muted-link" href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">출처 ↗</a>` : ''}</div>
        <div class="watch-card__actions">
          <span class="muted">${fmtTime(r.addedAt)} · ${SOURCE_LABELS[r.origin] || esc(r.origin)}</span>
          <button type="button" class="btn" data-action="remove-relation">관계도에서 빼기</button>
        </div>
      </li>`).join('');
    return `
      <article class="card watch-card">
        <header class="watch-card__head"><strong>추가한 관계</strong><span class="muted">relations.js는 그대로 두고 overrides.js에 기록돼요</span></header>
        <ul class="history">${items}</ul>
      </article>`;
  }

  function proposalHTML(p) {
    const c = record(p.companyId);
    const keys = Object.keys(p.patch);
    const rows = keys.map((k) => `<tr><th scope="row">${FIELD_LABELS[k] || k}</th><td>${fmtField(k, p.current && p.current[k])}</td><td class="is-new">${fmtField(k, p.patch[k])}</td></tr>`).join('');
    return `
      <article class="card watch-card" data-proposal="${esc(p.id)}">
        <header class="watch-card__head">
          ${companyHead(c)}
          <span class="pill-row">
            <span class="tag tag--kind">${esc(p.title)}</span>
            <span class="tag tag--${esc(p.confidence)}">${CONFIDENCE_LABELS[p.confidence] || ''}</span>
            <span class="tag">${SOURCE_LABELS[p.source] || esc(p.source)}</span>
          </span>
        </header>
        <p class="watch-card__summary">${esc(p.summary)}</p>
        <table class="diff"><thead><tr><th></th><th>지금</th><th>제안</th></tr></thead><tbody>${rows}</tbody></table>
        ${evidenceHTML(p.evidence)}
        <form class="watch-form" data-form="proposal">
          <details><summary>반영하기 전에 고치기</summary><div class="watch-form__fields">${formFields(keys, p.patch, c)}</div></details>
          <div class="watch-card__actions">
            <button type="submit" class="btn btn--primary">반영</button>
            <button type="button" class="btn" data-action="dismiss">무시</button>
            <span class="muted">${fmtTime(p.createdAt)} 발견</span>
          </div>
        </form>
      </article>`;
  }

  function signalBody(s) {
    if (s.headlines) {
      return `<ul class="news-list">${s.headlines.map((h) => `
        <li><a class="news-item" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">
          <span class="news-item__title">${esc(h.title)}</span>
          <span class="news-item__meta"><span>${esc(h.source)}</span><span aria-hidden="true">·</span><span>${fmtDate(h.publishedAt)}</span></span>
        </a></li>`).join('')}</ul>`;
    }
    if (s.kind === 'rename') return `<p class="watch-card__summary">Yahoo 종목명이 바뀌었어요: <strong>${esc(s.detail.from)}</strong> → <strong>${esc(s.detail.to)}</strong> (${esc(s.detail.symbol)})</p>`;
    return `<p class="watch-card__summary">${esc(s.detail.symbol)} 시세를 ${s.detail.count}번 연속 불러오지 못했어요 (${esc(s.detail.error)}). 상장 폐지나 심볼 변경일 수 있어요.</p>`;
  }

  function signalHTML(s) {
    const c = record(s.companyId);
    const editKeys = ['leader', 'note', ...(c.listings && c.listings.length ? [] : ['private']), 'parent'];
    const ai = s.ai ? `<p class="ai-verdict ai-verdict--${esc(s.ai.decision)}"><strong>Claude: ${AI_DECISION[s.ai.decision] || esc(s.ai.decision)}</strong> ${esc(s.ai.reason)}</p>` : '';
    return `
      <article class="card watch-card" data-signal="${esc(s.id)}">
        <header class="watch-card__head">
          ${companyHead(c)}
          <span class="pill-row"><span class="tag tag--kind">${esc(s.label)}</span>${s.headlines ? `<span class="tag">기사 ${s.headlines.length}건</span>` : ''}</span>
        </header>
        ${ai}
        ${signalBody(s)}
        ${s.kind === 'deal' ? `
        <form class="watch-form" data-form="add-relation">
          <details><summary>관계도에 관계 직접 추가</summary>
            <div class="watch-form__fields">${relationFields({ from: s.companyId, to: '', type: 'own', label: '', detail: '', source: null }, signalSources(s))}</div>
            <div class="watch-card__actions"><button type="submit" class="btn btn--primary">관계도에 추가</button></div>
          </details>
        </form>` : ''}
        <form class="watch-form" data-form="edit" data-company="${esc(s.companyId)}">
          <details><summary>기업 정보 직접 고치기</summary>
            <div class="watch-form__fields">${formFields(editKeys, c, c)}</div>
            <div class="watch-card__actions"><button type="submit" class="btn btn--primary">저장하고 신호 닫기</button></div>
          </details>
          <div class="watch-card__actions"><button type="button" class="btn" data-action="dismiss-signal">무시</button></div>
        </form>
      </article>`;
  }

  function historyHTML(o) {
    const c = record(o.companyId);
    const entries = [...o.history].reverse().map((h) => `
      <li>
        <span class="muted">${fmtTime(h.at)} · ${SOURCE_LABELS[h.source] || esc(h.source)}${h.label ? ` · ${esc(h.label)}` : ''}</span>
        ${h.fields.map((k) => `<div class="history-change"><span class="history-change__field">${FIELD_LABELS[k] || k}</span> ${fmtField(k, h.before[k])} → ${fmtField(k, h.after[k])}</div>`).join('')}
      </li>`).join('');
    return `
      <article class="card watch-card" data-override="${esc(o.companyId)}">
        <header class="watch-card__head">
          ${companyHead(c)}
          <button type="button" class="btn" data-action="revert">되돌리기</button>
        </header>
        <ul class="history">${entries}</ul>
      </article>`;
  }

  function render() {
    if (!data) {
      root.innerHTML = flash ? `<p class="board__error">${esc(flash.text)}</p>` : '<p class="muted">불러오는 중…</p>';
      return;
    }
    const tabs = [
      ['proposals', '변경 제안', data.proposals.length],
      ['signals', '살펴볼 신호', data.signals.length],
      ['history', '반영 이력', data.overrides.length + (data.addedRelations || []).length],
    ];
    let list = '';
    if (tab === 'proposals') {
      list = data.proposals.length
        ? data.proposals.map((p) => (p.kind === 'relation' ? relationProposalHTML(p) : proposalHTML(p))).join('')
        : `<p class="watch-empty">지금은 반영할 제안이 없어요.${data.signals.length ? ' 살펴볼 신호 탭도 확인해 보세요.' : ''}</p>`;
    } else if (tab === 'signals') {
      list = data.signals.length ? data.signals.map(signalHTML).join('') : '<p class="watch-empty">새 신호가 없어요.</p>';
    } else {
      list = data.overrides.length || (data.addedRelations || []).length
        ? addedRelationsHTML() + data.overrides.map(historyHTML).join('')
        : '<p class="watch-empty">아직 반영한 변경이 없어요. 반영하면 companies.js·relations.js는 그대로 두고 data/overrides.js에 기록돼요.</p>';
    }
    root.innerHTML = `
      <div class="admin__inner">
        ${statusHTML()}
        ${flash ? `<p class="flash flash--${flash.kind}" role="status">${esc(flash.text)}</p>` : ''}
        <div class="segmented admin-tabs" role="tablist">
          ${tabs.map(([id, label, n]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}" aria-pressed="${tab === id}">${label}${n ? ` <span class="mode-badge">${n}</span>` : ''}</button>`).join('')}
        </div>
        <div class="watch-list">${list}</div>
      </div>`;
  }

  // ───────── Events ─────────
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action], [data-tab]');
    if (!t) return;
    if (t.dataset.tab) {
      tab = t.dataset.tab;
      flash = null;
      render();
      return;
    }
    const proposal = t.closest('[data-proposal]');
    const signal = t.closest('[data-signal]');
    const override = t.closest('[data-override]');
    switch (t.dataset.action) {
      case 'run':
        act('run', {}, '점검을 시작했어요. 30초쯤 걸려요.');
        break;
      case 'dismiss':
        act('dismiss', { id: proposal.dataset.proposal }, '제안을 무시했어요. 같은 내용은 다시 제안하지 않아요.');
        break;
      case 'dismiss-signal':
        act('dismiss-signal', { id: signal.dataset.signal }, '신호를 닫았어요. 이후 새 기사가 나오면 다시 알려 드려요.');
        break;
      case 'swap': {
        const form = t.closest('form');
        [form.elements.from.value, form.elements.to.value] = [form.elements.to.value, form.elements.from.value];
        break;
      }
      case 'remove-relation': {
        const r = data.addedRelations.find((x) => x.id === t.closest('[data-relation]').dataset.relation);
        if (r && confirm(`${record(r.from).nameKo} → ${record(r.to).nameKo} (${r.label}) 관계를 관계도에서 뺄까요?`)) {
          act('remove-relation', { id: r.id }, '관계를 뺐어요. 관계도를 새로고침하면 사라져요.');
        }
        break;
      }
      case 'revert':
        if (confirm(`${record(override.dataset.override).nameKo}의 반영 내용을 모두 되돌릴까요? companies.js 값으로 돌아가요.`)) {
          act('revert', { companyId: override.dataset.override }, '되돌렸어요.');
        }
        break;
      default:
        break;
    }
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form === 'relation-proposal') {
      const id = form.closest('[data-proposal]').dataset.proposal;
      const p = data.proposals.find((x) => x.id === id);
      act('apply', { id, relation: readRelationForm(form, proposalSources(p)) }, '관계도에 추가했어요. 관계도를 새로고침하면 보여요.');
    } else if (form.dataset.form === 'add-relation') {
      const s = data.signals.find((x) => x.id === form.closest('[data-signal]').dataset.signal);
      act('add-relation', { relation: readRelationForm(form, signalSources(s)) }, '관계도에 추가했어요. 신호는 그대로 두니 다 봤으면 무시를 눌러 닫아 주세요.');
    } else if (form.dataset.form === 'proposal') {
      const id = form.closest('[data-proposal]').dataset.proposal;
      const p = data.proposals.find((x) => x.id === id);
      act('apply', { id, patch: readForm(form, Object.keys(p.patch), p.patch) }, `${record(p.companyId).nameKo} 정보에 반영했어요. 지도를 새로고침하면 보여요.`);
    } else if (form.dataset.form === 'edit') {
      const companyId = form.dataset.company;
      const c = record(companyId);
      const keys = [...form.querySelectorAll('[name]')].map((el) => el.name.split('.')[0]).filter((k, i, a) => a.indexOf(k) === i);
      const patch = changedFields(readForm(form, keys, c), c);
      if (!Object.keys(patch).length) {
        flash = { kind: 'error', text: '바뀐 내용이 없어요.' };
        render();
        return;
      }
      act('edit', { companyId, patch, signalId: form.closest('[data-signal]').dataset.signal }, `${c.nameKo} 정보를 고쳤어요.`);
    }
  });

  refresh();
})();
