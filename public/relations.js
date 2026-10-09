// Relationship graph: who invests in, supplies, hosts, partners with or came out of whom.
// Loaded before app.js; uses window.AIMap only at call time. d3 (force layout, zoom, drag) is
// fetched the first time the view opens — the relation table below the graph works without it.
(() => {
  'use strict';

  const D3_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js';
  const TYPES = window.AI_RELATION_TYPES || {};
  const TYPE_KEYS = Object.keys(TYPES);
  // Rough cluster centers per category so the layout reads as four neighborhoods.
  const CLUSTER = { frontier: [-430, 0], bigtech: [0, -300], infra: [430, 0], app: [0, 310] };
  const LAYOUT_TICKS = 400;

  const state = {
    types: new Set(TYPE_KEYS),
    selected: null,
    hovered: null,
    query: '',
  };

  let A = null; // window.AIMap
  let els = null;
  let graph = null; // { nodes, links, nodeById }
  let d3ready = null;
  let svgParts = null; // { svg, root, zoom, linkSel, nodeSel, sim }

  // ───────── Data ─────────
  function buildGraph() {
    const rels = (window.AI_RELATIONS || []).filter((r) => A.byId.has(r.from) && A.byId.has(r.to) && TYPES[r.type]);
    const degree = new Map();
    for (const r of rels) {
      degree.set(r.from, (degree.get(r.from) || 0) + 1);
      degree.set(r.to, (degree.get(r.to) || 0) + 1);
    }
    const nodes = [...A.byId.values()].map((c, i) => {
      const [cx, cy] = CLUSTER[c.category] || [0, 0];
      const d = degree.get(c.id) || 0;
      // Deterministic start (golden-angle spiral around the cluster) → the same layout every visit.
      const angle = i * 2.39996;
      const rad = 30 + 9 * Math.sqrt(i);
      return { id: c.id, c, degree: d, r: d ? Math.min(30, 14 + Math.sqrt(d) * 3.4) : 11, x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad };
    });
    // Several relations between the same pair are drawn as separate curves.
    const pairTotal = new Map();
    const links = rels.map((r) => {
      const key = [r.from, r.to].sort().join('|');
      const index = pairTotal.get(key) || 0;
      pairTotal.set(key, index + 1);
      return { ...r, source: r.from, target: r.to, pairKey: key, pairIndex: index };
    });
    links.forEach((l) => (l.pairTotal = pairTotal.get(l.pairKey)));
    return { nodes, links, nodeById: new Map(nodes.map((n) => [n.id, n])), rels };
  }

  const otherId = (r, id) => (r.from === id ? r.to : r.from);

  // ───────── Shell ─────────
  function renderShell() {
    const counts = Object.fromEntries(TYPE_KEYS.map((t) => [t, graph.rels.filter((r) => r.type === t).length]));
    els.root.innerHTML = `
      <div class="board__inner">
        <header class="board__header">
          <h1 class="board__title">AI 기업 관계도</h1>
          <p class="board__sub">${graph.nodes.length}개 기업 · 관계 ${graph.rels.length}개 · ${A.esc(window.AI_RELATIONS_AS_OF || '')} 기준 공개 보도 정리 · 같은 분야 기업끼리 모아 배치했어요</p>
        </header>
        <div class="board__filters">
          <div class="chips" role="group" aria-label="관계 종류" data-ref="types">
            ${TYPE_KEYS.map((t) => `
              <button type="button" class="chip rel-chip rel-${t}" data-type="${t}" aria-pressed="true">
                <span class="rel-key" aria-hidden="true"></span>${A.esc(TYPES[t].label)}<span class="chip__count">${counts[t]}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="graph-layout">
          <section class="card graph-card">
            <div class="graph" data-ref="graph" role="img" aria-label="AI 기업 관계 네트워크. 아래 관계 목록에서 같은 내용을 볼 수 있어요."></div>
            <p class="card__desc graph-hint">끌어서 이동 · 스크롤·핀치로 확대 · 기업을 누르면 그 기업의 관계만 보여요 · 화살표는 돈·물건이 가는 방향</p>
          </section>
          <aside class="card graph-side" data-ref="side" aria-live="polite"></aside>
        </div>
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title" data-ref="tableTitle">관계 목록</h2>
              <p class="card__desc">관계도와 같은 내용을 표로 정리했어요 · 출처가 없는 항목은 관련 뉴스 검색으로 연결돼요</p>
            </div>
          </div>
          <div class="table-wrap"><table class="board-table rel-table" data-ref="table"></table></div>
        </section>
      </div>`;
    for (const el of els.root.querySelectorAll('[data-ref]')) els[el.dataset.ref] = el;
  }

  function loadD3() {
    if (window.d3) return Promise.resolve();
    if (!d3ready) {
      d3ready = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = D3_SRC;
        s.onload = resolve;
        s.onerror = () => reject(new Error('d3를 불러오지 못했어요'));
        document.head.appendChild(s);
      });
    }
    return d3ready;
  }

  // ───────── Graph ─────────
  // Curved when a pair has several relations; ends trimmed to the node edge so arrows show.
  function linkPath(l) {
    const s = l.source;
    const t = l.target;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Normal relative to the pair's canonical order, so A→B and B→A bend to opposite sides.
    const sign = s.id < t.id ? 1 : -1;
    const nx = (-dy / dist) * sign;
    const ny = (dx / dist) * sign;
    const spread = (l.pairIndex - (l.pairTotal - 1) / 2) * 26;
    const mx = (s.x + t.x) / 2 + nx * spread;
    const my = (s.y + t.y) / 2 + ny * spread;
    const trim = (n, px, py, by) => {
      const ddx = px - n.x;
      const ddy = py - n.y;
      const d = Math.hypot(ddx, ddy) || 1;
      return [n.x + (ddx / d) * by, n.y + (ddy / d) * by];
    };
    const [x1, y1] = trim(s, mx, my, s.r + 2);
    const [x2, y2] = trim(t, mx, my, t.r + (TYPES[l.type].directed ? 4 : 2));
    return spread ? `M${x1},${y1}Q${mx},${my} ${x2},${y2}` : `M${x1},${y1}L${x2},${y2}`;
  }

  function drawGraph() {
    const d3 = window.d3;
    const box = els.graph;
    box.textContent = '';
    const W = box.clientWidth;
    const H = box.clientHeight;

    const sim = d3
      .forceSimulation(graph.nodes)
      // Weak links + bounded repulsion + a pull toward the category center: the four
      // neighborhoods keep their shape, links run between them, and companies without
      // relations stay in their neighborhood instead of drifting to the edge.
      .force('link', d3.forceLink(graph.links).id((d) => d.id).distance(120).strength(0.06))
      .force('charge', d3.forceManyBody().strength((d) => -200 - d.degree * 30).distanceMax(380))
      .force('collide', d3.forceCollide((d) => d.r + 20))
      .force('x', d3.forceX((d) => (CLUSTER[d.c.category] || [0, 0])[0]).strength((d) => (d.degree ? 0.1 : 0.3)))
      .force('y', d3.forceY((d) => (CLUSTER[d.c.category] || [0, 0])[1]).strength((d) => (d.degree ? 0.1 : 0.3)))
      .stop();
    for (let i = 0; i < LAYOUT_TICKS; i++) sim.tick(); // settle before the first paint: no jiggle

    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('class', 'rg');
    const defs = svg.append('defs');
    for (const t of TYPE_KEYS) {
      if (!TYPES[t].directed) continue;
      defs.append('marker').attr('id', `rg-arrow-${t}`).attr('class', `rel-${t}`)
        .attr('viewBox', '0 -5 10 10').attr('refX', 9).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4.5L9,0L0,4.5').attr('class', 'rg-arrow');
    }
    const root = svg.append('g');

    // Faint neighborhood labels behind everything.
    const clusterLabels = root.append('g').attr('class', 'rg-clusters');
    for (const cat of A.CATEGORIES.filter((c) => c.id !== 'all')) {
      const members = graph.nodes.filter((n) => n.c.category === cat.id);
      if (!members.length) continue;
      const x = d3.mean(members, (n) => n.x);
      const y = d3.min(members, (n) => n.y - n.r) - 26;
      clusterLabels.append('text').attr('x', x).attr('y', y).attr('text-anchor', 'middle').text(cat.label);
    }

    const linkSel = root.append('g').attr('class', 'rg-links').selectAll('path').data(graph.links).join('path')
      .attr('class', (l) => `rg-link rel-${l.type}`)
      .attr('marker-end', (l) => (TYPES[l.type].directed ? `url(#rg-arrow-${l.type})` : null));
    // Wide invisible twins make thin links easy to hover.
    const hitSel = root.append('g').attr('class', 'rg-hits').selectAll('path').data(graph.links).join('path').attr('class', 'rg-hit');

    const nodeSel = root.append('g').attr('class', 'rg-nodes').selectAll('g').data(graph.nodes).join('g')
      .attr('class', (n) => `rg-node${n.degree ? '' : ' is-isolated'}`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (n) => `${A.shortName(n.c)} · 관계 ${n.degree}개`);
    nodeSel.append('circle').attr('class', 'rg-node__ring').attr('r', (n) => n.r);
    nodeSel.append('text').attr('class', 'rg-node__initials').attr('dy', '0.35em').attr('text-anchor', 'middle')
      .text((n) => n.c.name.replace(/\(.*?\)/g, '').split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
    nodeSel.filter((n) => ('logoDomain' in n.c ? n.c.logoDomain : n.c.domain))
      .append('image')
      .attr('href', (n) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent('logoDomain' in n.c ? n.c.logoDomain : n.c.domain)}&sz=64`)
      .attr('width', (n) => n.r * 1.25).attr('height', (n) => n.r * 1.25)
      .attr('x', (n) => -n.r * 0.625).attr('y', (n) => -n.r * 0.625)
      .on('error', function onError() { this.remove(); });
    nodeSel.append('text').attr('class', 'rg-node__label').attr('text-anchor', 'middle').attr('y', (n) => n.r + 14).text((n) => A.shortName(n.c));

    const draw = () => {
      nodeSel.attr('transform', (n) => `translate(${n.x},${n.y})`);
      linkSel.attr('d', linkPath);
      hitSel.attr('d', linkPath);
    };
    draw();
    sim.on('tick', draw);

    // Zoom & pan; start fitted to the whole network.
    const zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => root.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.zoom', null);

    // Drag nodes; a short drag still counts as a click.
    nodeSel.call(
      d3.drag().clickDistance(4)
        .on('start', (e, n) => {
          if (!e.active) sim.alphaTarget(0.2).restart();
          n.fx = n.x;
          n.fy = n.y;
        })
        .on('drag', (e, n) => {
          n.fx = e.x;
          n.fy = e.y;
        })
        .on('end', (e, n) => {
          if (!e.active) sim.alphaTarget(0);
          n.fx = null;
          n.fy = null;
        })
    );

    nodeSel
      .on('pointerenter', (e, n) => {
        state.hovered = n.id;
        applyHighlight();
        nodeTip(n, { x: e.clientX, y: e.clientY });
      })
      .on('pointermove', (e, n) => nodeTip(n, { x: e.clientX, y: e.clientY }))
      .on('pointerleave', () => {
        state.hovered = null;
        applyHighlight();
        A.hideTooltip();
      })
      .on('click', (e, n) => {
        e.stopPropagation();
        selectNode(state.selected === n.id ? null : n.id);
      })
      .on('keydown', (e, n) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectNode(state.selected === n.id ? null : n.id);
        }
      });
    hitSel
      .on('pointermove', (e, l) => linkTip(l, { x: e.clientX, y: e.clientY }))
      .on('pointerleave', () => A.hideTooltip());
    svg.on('click', () => selectNode(null));

    svgParts = { svg, root, zoom, linkSel, hitSel, nodeSel, sim, W, H };
    fitAll(false);
    applyHighlight();
  }

  function fitAll(animate = true) {
    if (!svgParts) return;
    const d3 = window.d3;
    const { svg, zoom, W, H } = svgParts;
    const pad = 30;
    const x0 = d3.min(graph.nodes, (n) => n.x - n.r) - pad;
    const x1 = d3.max(graph.nodes, (n) => n.x + n.r) + pad;
    const y0 = d3.min(graph.nodes, (n) => n.y - n.r) - pad - 30; // room for the cluster labels
    const y1 = d3.max(graph.nodes, (n) => n.y + n.r + 18) + pad;
    const k = Math.min(W / (x1 - x0), H / (y1 - y0), 1.4);
    const t = d3.zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k);
    (animate ? svg.transition().duration(500) : svg).call(zoom.transform, t);
  }

  function nodeTip(n, point) {
    A.showTooltip(point, (tip) => {
      const title = document.createElement('div');
      title.className = 'viz-tooltip__title';
      title.textContent = `${A.shortName(n.c)} · ${n.c.name}`;
      tip.appendChild(title);
      const counts = TYPE_KEYS.map((t) => [t, graph.rels.filter((r) => r.type === t && (r.from === n.id || r.to === n.id)).length]).filter(([, c]) => c);
      if (!counts.length) {
        const none = document.createElement('div');
        none.className = 'viz-tooltip__line';
        none.textContent = '정리된 관계 없음';
        tip.appendChild(none);
      }
      for (const [t, c] of counts) {
        const row = document.createElement('div');
        row.className = `viz-tooltip__row rel-${t}`;
        const key = document.createElement('span');
        key.className = 'viz-tooltip__key';
        key.style.setProperty('--key', 'var(--rel)');
        const val = document.createElement('strong');
        val.textContent = `${c}`;
        const label = document.createElement('span');
        label.textContent = TYPES[t].label;
        row.append(key, val, label);
        tip.appendChild(row);
      }
    });
  }

  function linkTip(l, point) {
    if (!state.types.has(l.type)) return;
    A.showTooltip(point, (tip) => {
      const title = document.createElement('div');
      title.className = 'viz-tooltip__title';
      title.textContent = `${A.shortName(l.source.c)} ${TYPES[l.type].directed ? '→' : '↔'} ${A.shortName(l.target.c)}`;
      const row = document.createElement('div');
      row.className = `viz-tooltip__row rel-${l.type}`;
      const key = document.createElement('span');
      key.className = 'viz-tooltip__key';
      key.style.setProperty('--key', 'var(--rel)');
      const val = document.createElement('strong');
      val.textContent = l.label;
      row.append(key, val);
      const meta = document.createElement('div');
      meta.className = 'viz-tooltip__line';
      meta.textContent = `${TYPES[l.type].label}${l.since ? ` · ${A.fmtSince(l.since)}` : ''}`;
      tip.append(title, row, meta);
    });
  }

  // Focus = hovered or selected node: it and its neighbors stay, everything else fades.
  function applyHighlight() {
    if (!svgParts) return;
    const focus = state.hovered || state.selected;
    const neighbors = new Set();
    if (focus) {
      for (const l of graph.links) {
        if (!state.types.has(l.type)) continue;
        if (l.source.id === focus) neighbors.add(l.target.id);
        if (l.target.id === focus) neighbors.add(l.source.id);
      }
    }
    const q = state.query;
    const matches = (n) => q && `${n.c.name} ${n.c.nameKo}`.toLowerCase().includes(q);
    svgParts.nodeSel
      .classed('is-focus', (n) => n.id === focus)
      .classed('is-selected', (n) => n.id === state.selected)
      .classed('is-dim', (n) => (focus ? n.id !== focus && !neighbors.has(n.id) : Boolean(q) && !matches(n)))
      .classed('is-match', (n) => Boolean(matches(n)));
    svgParts.linkSel
      .classed('is-hidden', (l) => !state.types.has(l.type))
      .classed('is-dim', (l) => Boolean(focus) && l.source.id !== focus && l.target.id !== focus)
      .classed('is-focus', (l) => Boolean(focus) && (l.source.id === focus || l.target.id === focus));
    svgParts.hitSel.style('display', (l) => (state.types.has(l.type) ? null : 'none'));
  }

  function selectNode(id) {
    state.selected = id;
    applyHighlight();
    renderSide();
    renderTable();
  }

  // ───────── Side panel & table ─────────
  function renderSide() {
    const side = els.side;
    if (!state.selected) {
      const top = [...graph.nodes].sort((a, b) => b.degree - a.degree).slice(0, 8);
      const max = top[0] ? top[0].degree : 1;
      side.innerHTML = `
        <h2 class="card__title">관계가 많은 기업</h2>
        <p class="card__desc">기업을 누르면 그 기업의 관계가 여기에 정리돼요.</p>
        <ol class="hub-list">
          ${top.map((n) => `
            <li><button type="button" class="hub" data-node="${A.esc(n.id)}">
              ${A.logoHTML(n.c)}<span class="hub__name">${A.esc(A.shortName(n.c))}</span>
              <span class="hub__bar"><span style="width:${((n.degree / max) * 100).toFixed(0)}%"></span></span>
              <span class="hub__count">${n.degree}</span>
            </button></li>`).join('')}
        </ol>`;
      return;
    }
    const n = graph.nodeById.get(state.selected);
    const rels = graph.rels.filter((r) => (r.from === n.id || r.to === n.id) && state.types.has(r.type));
    const groups = [];
    for (const t of TYPE_KEYS) {
      if (!state.types.has(t)) continue;
      const def = TYPES[t];
      const out = rels.filter((r) => r.type === t && r.from === n.id);
      const inc = rels.filter((r) => r.type === t && r.to === n.id);
      if (def.directed) {
        if (out.length) groups.push({ t, title: def.out, items: out });
        if (inc.length) groups.push({ t, title: def.in, items: inc });
      } else if (out.length + inc.length) {
        groups.push({ t, title: def.label, items: [...out, ...inc] });
      }
    }
    side.innerHTML = `
      <div class="graph-side__head">
        ${A.logoHTML(n.c)}
        <div>
          <h2 class="card__title">${A.esc(A.shortName(n.c))}</h2>
          <p class="card__desc">${A.esc(n.c.name)} · ${A.esc(A.CATEGORY_LABEL[n.c.category])} · 관계 ${n.degree}개</p>
        </div>
      </div>
      <div class="rel-actions">
        <button type="button" class="link-btn" data-open="${A.esc(n.id)}">지도에서 보기</button>
        <button type="button" class="link-btn" data-clear>전체 보기</button>
      </div>
      ${groups.length ? groups.map((g) => `
        <section class="section">
          <h3 class="section__title rel-title rel-${g.t}"><span class="rel-key" aria-hidden="true"></span>${A.esc(g.title)} · ${g.items.length}</h3>
          <ul class="rel-list">
            ${g.items.map((r) => {
              const o = graph.nodeById.get(otherId(r, n.id)).c;
              return `<li class="rel-row"><button type="button" class="rel-item" data-node="${A.esc(o.id)}">
                ${A.logoHTML(o)}
                <span class="rel-item__body">
                  <span class="rel-item__name">${A.esc(A.shortName(o))}</span>
                  <span class="rel-item__label">${A.esc(r.label)}${r.since ? ` · ${A.fmtSince(r.since)}` : ''}</span>
                </span></button></li>`;
            }).join('')}
          </ul>
        </section>`).join('') : '<p class="news-empty">선택한 관계 종류로 정리된 관계가 없어요.</p>'}`;
  }

  function sourceCell(r) {
    if (r.source) return `<a href="${A.esc(r.source.url)}" target="_blank" rel="noopener noreferrer" title="${A.esc(r.source.title)}">기사 ↗</a>`;
    const a = A.byId.get(r.from).name.replace(/\s*\(.*?\)/g, '');
    const b = A.byId.get(r.to).name.replace(/\s*\(.*?\)/g, '');
    const q = encodeURIComponent(`"${a}" "${b}"`);
    return `<a class="muted-link" href="https://news.google.com/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko" target="_blank" rel="noopener noreferrer">뉴스 검색 ↗</a>`;
  }

  function renderTable() {
    const sel = state.selected;
    const rows = graph.rels
      .filter((r) => state.types.has(r.type) && (!sel || r.from === sel || r.to === sel))
      .sort((a, b) => TYPE_KEYS.indexOf(a.type) - TYPE_KEYS.indexOf(b.type) || String(b.since || '').localeCompare(String(a.since || '')));
    els.tableTitle.textContent = sel ? `${A.shortName(A.byId.get(sel))}의 관계 ${rows.length}개` : `관계 목록 ${rows.length}개`;
    const cell = (id) => {
      const c = A.byId.get(id);
      return `<button type="button" class="table-company" data-node="${A.esc(id)}">${A.logoHTML(c)}<span><span class="table-company__name">${A.esc(A.shortName(c))}</span></span></button>`;
    };
    els.table.innerHTML = `
      <thead><tr><th scope="col">관계</th><th scope="col">기업</th><th scope="col" class="rel-dir"></th><th scope="col">상대 기업</th><th scope="col">내용</th><th scope="col">시기</th><th scope="col">출처</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td><span class="rel-tag rel-${r.type}"><span class="rel-key" aria-hidden="true"></span>${A.esc(TYPES[r.type].label)}</span></td>
          <td>${cell(r.from)}</td>
          <td class="rel-dir" aria-label="${TYPES[r.type].directed ? '에서' : '와'}">${TYPES[r.type].directed ? '→' : '↔'}</td>
          <td>${cell(r.to)}</td>
          <td class="rel-desc"><strong>${A.esc(r.label)}</strong><span>${A.esc(r.detail)}</span></td>
          <td class="num">${r.since ? A.esc(A.fmtSince(r.since)) : '–'}</td>
          <td>${sourceCell(r)}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="empty">선택한 조건의 관계가 없어요.</td></tr>'}</tbody>`;
  }

  // ───────── Events ─────────
  function bind() {
    els.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-type], [data-node], [data-open], [data-clear]');
      if (!t) return;
      if (t.dataset.type) {
        const type = t.dataset.type;
        // Clicking the only active type turns everything back on instead of showing nothing.
        if (state.types.has(type) && state.types.size === 1) TYPE_KEYS.forEach((k) => state.types.add(k));
        else if (state.types.has(type)) state.types.delete(type);
        else state.types.add(type);
        for (const b of els.types.querySelectorAll('[data-type]')) b.setAttribute('aria-pressed', String(state.types.has(b.dataset.type)));
        applyHighlight();
        renderSide();
        renderTable();
      } else if (t.dataset.node) {
        selectNode(t.dataset.node);
        centerOn(t.dataset.node);
      } else if (t.dataset.open) {
        A.openCompany(t.dataset.open);
      } else if (t.hasAttribute('data-clear')) {
        selectNode(null);
        fitAll();
      }
    });
    els.root.addEventListener('scroll', () => A.hideTooltip(), { passive: true });
  }

  function centerOn(id) {
    if (!svgParts) return;
    const n = graph.nodeById.get(id);
    const t = window.d3.zoomTransform(svgParts.svg.node());
    const k = Math.max(t.k, 0.9);
    svgParts.svg.transition().duration(500).call(
      svgParts.zoom.transform,
      window.d3.zoomIdentity.translate(svgParts.W / 2 - n.x * k, svgParts.H / 2 - n.y * k).scale(k)
    );
  }

  function ensureGraph() {
    if (svgParts) return;
    els.graph.innerHTML = '<p class="chart-empty">관계도를 그리는 중…</p>';
    loadD3()
      .then(() => {
        drawGraph();
        if (state.selected) centerOn(state.selected);
      })
      .catch((err) => {
        els.graph.innerHTML = `<p class="chart-empty">${A.esc(err.message)}. 아래 관계 목록은 그대로 볼 수 있어요.</p>`;
      });
  }

  // ───────── Public API (used by app.js) ─────────
  window.AIMapRelations = {
    show() {
      if (!els) {
        A = window.AIMap;
        els = { root: document.getElementById('relations') };
        graph = buildGraph();
        renderShell();
        bind();
      }
      els.root.hidden = false;
      renderSide();
      renderTable();
      ensureGraph();
    },
    hide() {
      if (els) els.root.hidden = true;
      if (A) A.hideTooltip();
    },
    focus(id) {
      if (!els || !graph.nodeById.has(id)) return;
      selectNode(id);
      centerOn(id);
    },
    setQuery(q) {
      state.query = q;
      applyHighlight();
    },
  };
})();
