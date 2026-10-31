/* Game Reviews (web) - the screens and buttons. */
(function () {
  'use strict';
  const G = window.GR;

  // ------------------------------------------------------------------ helpers
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }
  const $ = s => document.querySelector(s);
  const ALL = 'All';
  const pct = s => (s === null || s === undefined) ? '--' : Math.round(s) + '%';

  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // ------------------------------------------------------------------ settings (kept on this device)
  const SETTINGS_KEY = 'gr_settings_v1', VIEW_KEY = 'gr_view_v1', CACHE_KEY = 'gr_sheet_cache_v1';
  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { /* ignore */ }
    return Object.assign(JSON.parse(JSON.stringify(G.DEFAULTS)), saved);
  }
  let S = loadSettings();
  const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(S));

  let V = { sort: 'Rating: high to low', group: 'No grouping', filters: {} };
  try { Object.assign(V, JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')); } catch (e) { /* ignore */ }
  const saveView = () => localStorage.setItem(VIEW_KEY, JSON.stringify(V));

  // ------------------------------------------------------------------ data
  let allGames = [], categories = [], view = [], lastText = null;
  let area = 'menu';        // 'menu', 'games' or 'friends'

  // The status line belongs to whichever area is on screen.
  const statuses = { games: '', friends: '' };
  function setStatus(text, which) {
    which = which || 'games';
    statuses[which] = text;
    if (which === area) $('#status').textContent = text;
  }

  function setData(parsed) {
    allGames = parsed.games; categories = parsed.categories;
    fillFilterOptions(); applyView();
  }

  async function refresh(manual) {
    const url = G.sheetCsvUrl(S);
    if (!url) { setStatus("The sheet link in Settings isn't valid"); return; }
    setStatus('Refreshing...');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('the sheet answered with error ' + r.status);
      const text = await r.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Google asked for a login - share the sheet as "Anyone with the link can view"');
      const parsed = G.parseSheet(text);
      try { localStorage.setItem(CACHE_KEY, text); } catch (e) { /* too big - fine */ }
      if (text !== lastText) { lastText = text; setData(parsed); }
      setStatus('Updated ' + new Date().toTimeString().slice(0, 5));
      if (manual) toast('Up to date');
    } catch (e) {
      const hint = e instanceof TypeError ? "couldn't reach the sheet (if you're online, try a 'Publish to web' link in Settings)" : e.message;
      setStatus(allGames.length ? 'Offline - showing saved data' : "Couldn't load: " + hint);
      if (manual) toast("Couldn't refresh: " + hint);
    }
  }

  function loadCache() {
    const text = localStorage.getItem(CACHE_KEY);
    if (!text) return;
    try { lastText = text; setData(G.parseSheet(text)); setStatus('Showing saved data'); } catch (e) { lastText = null; }
  }

  // ------------------------------------------------------------------ pictures
  const resolved = new Map();
  function imageUrls(folder, name) {
    const safe = G.safeFileName(name);
    const out = [];
    for (const base of new Set([safe, safe.toLowerCase()]))
      for (const ext of ['png', 'jpg', 'jpeg', 'webp']) out.push(`${folder}/${encodeURIComponent(base)}.${ext}`);
    return out;
  }
  // Try each possible file name until one loads.
  function loadPicture(img, folder, name, onFail, onOk) {
    const key = folder + '|' + name;
    if (resolved.has(key)) {
      const u = resolved.get(key);
      Promise.resolve().then(() => { if (u) { img.src = u; if (onOk) onOk(); } else onFail(); });
      return;
    }
    const urls = imageUrls(folder, name);
    let i = 0;
    img.onerror = () => { i++; if (i < urls.length) img.src = urls[i]; else { resolved.set(key, null); img.onerror = null; onFail(); } };
    img.onload = () => { resolved.set(key, img.currentSrc || img.src); if (onOk) onOk(); };
    img.src = urls[0];
  }

  const tileSize = () => S.coverSize || (window.innerWidth < 640 ? 150 : 240);

  // ------------------------------------------------------------------ the grid
  // Longer names get a smaller font so they still fit on two lines.
  function nameSize(name) {
    const n = name.length;
    return (n <= 14 ? 6.8 : n <= 22 ? 5.9 : n <= 30 ? 5.1 : 4.5) + 'cqw';
  }

  function makeTile(g) {
    const tile = el('div', { class: 'tile', tabindex: '0', role: 'button', 'aria-label': g.name, onclick: () => openGame(g.id),
      onkeydown: e => { if (e.key === 'Enter') openGame(g.id); } });
    const cover = el('img', { class: 'cover', alt: '', loading: 'lazy', decoding: 'async' });
    loadPicture(cover, S.coversFolder, g.name, () => { tile.classList.add('nocover'); cover.remove(); });
    tile.append(cover);

    if (S.showTagsOnCovers && g.tags.length) {
      const strip = el('div', { class: 'tagstrip' });
      for (const tag of g.tags.slice(0, 6)) {
        const icon = el('img', { alt: tag, title: tag });
        loadPicture(icon, S.tagsFolder, tag, () => icon.remove(), () => strip.classList.add('show'));
        strip.append(icon);
      }
      tile.append(strip);
    }

    const plat = el('span', { class: 'plat' });
    const pname = g.meta.Platform || '';
    if (pname) {
      const logo = el('img', { alt: pname });
      loadPicture(logo, S.platformsFolder, pname, () => { logo.remove(); plat.textContent = pname; plat.classList.add('text'); });
      plat.append(logo);
    }
    tile.append(el('div', { class: 'bar' }, plat, el('span', { class: 'name', style: { fontSize: nameSize(g.name) } }, g.name),
      el('span', { class: 'score', style: { color: G.colourFor(g.score, S.ranges) } }, g.score === null ? '--' : String(Math.round(g.score)))));
    return tile;
  }

  function renderGrid() {
    const content = $('#content');
    content.style.setProperty('--tile', tileSize() + 'px');
    content.replaceChildren();
    if (!view.length) {
      content.append(el('div', { class: 'message' }, allGames.length ? 'No games match these filters.' : 'No games to show yet. Press refresh (the arrow at the top).'));
      return;
    }
    for (const group of G.groupGames(view, V.group, S.ranges)) {
      if (group.title !== null)
        content.append(el('div', { class: 'heading', style: group.color ? { color: group.color, borderColor: group.color } : {} }, `${group.title}   (${group.games.length})`));
      content.append(el('div', { class: 'grid' }, group.games.map(makeTile)));
    }
  }

  // ------------------------------------------------------------------ sort / group / filter bar
  const controls = { filters: {} };
  function select(options, value, onchange) {
    const s = el('select', { onchange: e => onchange(e.target.value) }, options.map(o => el('option', { value: o }, o)));
    s.value = options.includes(value) ? value : options[0];
    return s;
  }
  function buildControls() {
    const bar = $('#controls');
    controls.sort = select(Object.keys(G.SORTS), V.sort, v => { V.sort = v; saveView(); applyView(); });
    controls.group = select(G.GROUPS, V.group, v => { V.group = v; saveView(); applyView(); });
    bar.append(el('label', {}, 'Sort', controls.sort), el('label', {}, 'Group', controls.group));
    for (const [label, column] of G.FILTERS) {
      const s = select([ALL], ALL, v => { V.filters[column] = v; saveView(); applyView(); });
      controls.filters[column] = s;
      bar.append(el('label', {}, label, s));
    }
    bar.append(el('button', { onclick: () => { V.filters = {}; saveView(); fillFilterOptions(); applyView(); } }, 'Clear'));
    controls.count = el('span', { class: 'count' });
    bar.append(controls.count);
  }
  function fillFilterOptions() {
    for (const [, column] of G.FILTERS) {
      const unique = new Map();
      for (const g of allGames) for (const v of G.gameValues(g, column)) if (!unique.has(v.toLowerCase())) unique.set(v.toLowerCase(), v);
      let values = [...unique.values()];
      values = column === 'Year' ? values.sort((a, b) => (G.numberIn(b) || 0) - (G.numberIn(a) || 0)) : values.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const s = controls.filters[column];
      const chosen = V.filters[column];
      s.replaceChildren(...[ALL, ...values].map(o => el('option', { value: o }, o)));
      s.value = values.some(v => v.toLowerCase() === (chosen || '').toLowerCase()) ? values.find(v => v.toLowerCase() === chosen.toLowerCase()) : ALL;
      if (s.value === ALL) delete V.filters[column];
    }
  }
  function applyView() {
    let games = allGames;
    for (const [, column] of G.FILTERS) {
      const wanted = (V.filters[column] || ALL);
      if (wanted !== ALL) games = games.filter(g => G.gameValues(g, column).some(v => v.toLowerCase() === wanted.toLowerCase()));
    }
    view = G.sortGames(games, V.sort);
    // grouped order is what the arrows follow
    view = G.groupGames(view, V.group, S.ranges).flatMap(g => g.games);
    controls.count.textContent = `${view.length} of ${allGames.length} games`;
    renderGrid();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ pop-up pages (the back button closes them)
  const overlays = [];
  function openOverlay(build, cls) {
    const panel = el('div', { class: 'panel ' + (cls || '') });
    const root = el('div', { class: 'overlay', onclick: e => { if (e.target === root) closeOverlay(); } }, panel);
    document.body.append(root);
    document.body.classList.add('noscroll');
    history.pushState({ area, overlay: overlays.length + 1 }, '');
    const o = { root, panel };
    overlays.push(o);
    build(panel, o);
    return o;
  }
  const closeOverlay = () => { if (overlays.length) history.back(); };
  function removeTop() {
    const o = overlays.pop();
    if (o) { o.root.remove(); if (o.onClose) o.onClose(); }
    if (!overlays.length) document.body.classList.remove('noscroll');
  }
  const closeAll = () => { if (overlays.length) history.go(-overlays.length); };
  window.addEventListener('popstate', () => {
    const state = history.state || {};
    while (overlays.length > (state.overlay || 0)) removeTop();
    if ((state.area || 'menu') !== area) showArea(state.area || 'menu', false);      // the phone's back button
  });
  document.addEventListener('keydown', e => {
    const o = overlays[overlays.length - 1];
    if (!o) return;
    if (e.key === 'Escape') closeOverlay();
    else if (o.onKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) o.onKey(e);
  });
  function swipe(node, callback) {
    let sx = 0, sy = 0;
    node.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    node.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) callback(dx);
    }, { passive: true });
  }
  const closeButton = () => el('button', { onclick: closeOverlay, 'aria-label': 'Close' }, '\u2715');

  // ------------------------------------------------------------------ radar chart
  function radar(items, colour) {
    const NS = 'http://www.w3.org/2000/svg', W = 340, H = 290;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const add = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; svg.append(n); return n; };
    const n = items.length, cx = W / 2, cy = H / 2, radius = Math.min(W, H) / 2 - 52;
    const angles = items.map((_, k) => -Math.PI / 2 + 2 * Math.PI * k / n);
    const point = (a, f, extra = 0) => [cx + (radius * f + extra) * Math.cos(a), cy + (radius * f + extra) * Math.sin(a)];
    for (let ring = 1; ring <= 5; ring++) add('polygon', { points: angles.map(a => point(a, ring / 5).join(',')).join(' '), fill: 'none', stroke: '#3a464c' });
    for (const a of angles) add('line', { x1: cx, y1: cy, x2: point(a, 1)[0], y2: point(a, 1)[1], stroke: '#3a464c' });
    const fr = items.map(([, v]) => Math.max(0, Math.min(v / G.MAX_CATEGORY, 1)));
    add('polygon', { points: angles.map((a, k) => point(a, fr[k]).join(',')).join(' '), fill: colour, 'fill-opacity': '.45', stroke: colour, 'stroke-width': 2 });
    items.forEach(([label, value], k) => {
      const [x, y] = point(angles[k], fr[k]);
      add('circle', { cx: x, cy: y, r: 4, fill: colour, stroke: '#000' });
      const [lx, ly] = point(angles[k], 1, 12), c = Math.cos(angles[k]), s = Math.sin(angles[k]);
      const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
      const dy = c > 0.3 || c < -0.3 ? 0 : (s < 0 ? -16 : 10);
      add('text', { x: lx, y: ly + dy - (anchor === 'middle' ? 0 : 0), 'text-anchor': anchor, fill: '#f2f2f2', 'font-size': 12, 'font-weight': 700 }, label);
      add('text', { x: lx, y: ly + dy + 14, 'text-anchor': anchor, fill: '#f2f2f2', 'font-size': 12, 'font-weight': 700 }, G.formatNumber(value));
    });
    return el('div', { class: 'radar' }, svg);
  }

  // ------------------------------------------------------------------ game page
  function artBox(g) {
    const art = el('div', { class: 'art' });
    const img = el('img', { alt: g.name });
    loadPicture(img, S.coversFolder, g.name, () => { art.classList.add('nocover'); img.remove(); });
    art.append(img);
    return art;
  }

  function openGame(id) {
    const index = view.findIndex(g => g.id === id);
    if (index < 0) return;
    openOverlay((panel, o) => {
      o.index = index;
      const go = d => { const n = o.index + d; if (n >= 0 && n < view.length) { o.index = n; renderGame(panel, o); panel.scrollTop = 0; } };
      o.onKey = e => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
      swipe(panel, dx => go(dx < 0 ? 1 : -1));
      o.go = go;
      renderGame(panel, o);
    }, 'game');
  }

  function renderGame(panel, o) {
    const g = view[o.index];
    const colour = G.colourFor(g.score, S.ranges);
    panel.replaceChildren();
    panel.append(el('div', { class: 'nav' },
      el('button', { onclick: () => o.go(-1), disabled: o.index === 0, 'aria-label': 'Previous game' }, '\u25C0', el('span', { class: 'long' }, ' Previous')),
      el('div', { class: 'mid' }, `${o.index + 1} of ${view.length}`),
      el('button', { onclick: () => o.go(1), disabled: o.index === view.length - 1, 'aria-label': 'Next game' }, el('span', { class: 'long' }, 'Next '), '\u25B6'),
      closeButton()));

    const info = el('div', { class: 'info' }, el('h2', {}, g.name));
    const bits = [g.meta.Type, g.meta.Platform, g.meta.Year ? 'Played ' + g.meta.Year : null, g.release ? 'Released ' + g.release : null].filter(Boolean);
    info.append(el('div', { class: 'meta' }, bits.join('  |  ')));
    if (g.tags.length) {
      info.append(el('div', { class: 'chips' }, g.tags.map(tag => {
        const chip = el('span', { class: 'chip' });
        const icon = el('img', { alt: '' });
        loadPicture(icon, S.tagsFolder, tag, () => icon.remove());
        chip.append(icon, tag);
        return chip;
      })));
    }
    info.append(el('div', { class: 'bigscore', style: { color: colour } }, pct(g.score)));
    for (const [rank, rest] of G.rankLines(g, allGames))
      info.append(el('div', { class: 'rank' }, el('b', { style: { color: colour } }, rank), ' ' + rest));
    info.append(el('div', { style: { marginTop: '12px' } }, el('button', { onclick: () => openCompare(g) }, 'Compare with other games')));

    const head = el('div', { class: 'gamehead' }, artBox(g), info);
    const points = g.cats.map(([l, v]) => [l, parseFloat(v)]).filter(([, v]) => !Number.isNaN(v));
    if (points.length >= 3) head.append(radar(points, colour));
    panel.append(head);

    const bars = el('div', { class: 'section' });
    for (const [label, value] of g.cats) {
      const n = parseFloat(value);
      bars.append(el('div', { class: 'catrow' }, el('div', { class: 'label' }, label),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: (Number.isNaN(n) ? 0 : Math.max(0, Math.min(n / G.MAX_CATEGORY, 1)) * 100) + '%', background: G.colourFor(Number.isNaN(n) ? null : n, S.barRanges) } })),
        el('div', { class: 'value' }, value)));
    }
    bars.append(el('h3', {}, 'Review'), el('div', { class: 'review' }, g.review || 'No review written yet.'));
    panel.append(bars);
  }

  // ------------------------------------------------------------------ compare
  const gameLabel = (g, extra) => `${g.name}  (${g.meta[extra] ? g.meta[extra] + ', ' : ''}${pct(g.score)})`;

  function openCompare(start) {
    if (allGames.length < 2) { toast('You need at least two games to compare.'); return; }
    start = start || view[0] || allGames[0];
    openOverlay((panel, o) => {
      const ordered = allGames.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      o.left = start; o.pool = []; o.index = 0;
      o.mode = ['genre', 'platform', 'all'].find(m => G.comparePool(start, allGames, m).length) || 'all';

      const leftSel = el('select', { onchange: e => { o.left = allGames.find(g => g.id === +e.target.value); reload(currentId()); } },
        ordered.map(g => el('option', { value: g.id }, gameLabel(g, 'Platform'))));
      leftSel.value = start.id;
      const rightSel = el('select', { onchange: e => { o.index = +e.target.value; draw(); } });
      const modeSel = el('select', { onchange: e => { o.mode = e.target.value; reload(currentId()); } },
        [['genre', 'Same genre'], ['platform', 'Same console'], ['all', 'Any game']].map(([v, t]) => el('option', { value: v }, t)));
      modeSel.value = o.mode;
      const count = el('span', { class: 'mid', style: { color: 'var(--dim)', fontSize: '12px' } });
      const body = el('div', {});
      const currentId = () => o.pool[o.index] ? o.pool[o.index].id : null;
      const step = d => { const n = o.index + d; if (n >= 0 && n < o.pool.length) { o.index = n; rightSel.value = n; draw(); } };
      const swap = () => { const right = o.pool[o.index]; if (!right) return; const oldLeft = o.left.id; o.left = right; leftSel.value = right.id; reload(oldLeft); };
      o.onKey = e => { if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); };

      panel.append(el('div', { class: 'cmp-controls' }, leftSel, el('b', {}, 'vs'), rightSel,
        el('button', { onclick: () => step(-1) }, '\u25C0'), el('button', { onclick: () => step(1) }, '\u25B6'),
        el('button', { onclick: swap }, '\u21C4 Swap'), modeSel, count, closeButton()), body);

      function reload(keepId) {
        o.pool = G.comparePool(o.left, allGames, o.mode);
        const field = { genre: 'Type', platform: 'Platform' }[o.mode];
        const kind = field ? (o.left.meta[field] || '') : '';
        count.textContent = `${o.pool.length} ${kind ? kind + ' ' : ''}games to choose from`;
        rightSel.replaceChildren(...o.pool.map((g, i) => el('option', { value: i }, gameLabel(g, o.mode === 'platform' ? 'Type' : 'Platform'))));
        rightSel.disabled = !o.pool.length;
        o.index = Math.max(0, o.pool.findIndex(g => g.id === keepId));
        rightSel.value = o.index;
        draw();
      }

      function draw() {
        body.replaceChildren();
        const a = o.left, b = o.pool[o.index];
        if (!b) { body.append(el('div', { class: 'message', style: { textAlign: 'center', color: 'var(--dim)' } }, `There are no other ${(o.mode === 'all' ? '' : (a.meta[{ genre: 'Type', platform: 'Platform' }[o.mode]] || '') + ' ')}games to compare with yet. Try another option in the box on the right.`)); return; }
        const grid = el('div', { class: 'cmp-grid' });
        const cover = g => artBox(g);
        const side = g => [el('div', { class: 'title' }, g.name), el('div', { class: 'sub' }, [g.meta.Platform, g.release ? 'Released ' + g.release : null].filter(Boolean).join('  |  '))];
        grid.append(cover(a), el('div', { class: 'center', style: { fontSize: '20px', fontWeight: 800 } }, 'VS'), cover(b));
        const [ta, sa] = side(a), [tb, sb] = side(b);
        grid.append(ta, el('div', {}), tb, sa, el('div', {}), sb);
        const av = Object.fromEntries(a.cats), bv = Object.fromEntries(b.cats);
        for (const cat of categories.length ? categories : a.cats.map(c => c[0])) {
          if (!(cat in av) && !(cat in bv)) continue;          // neither game has this rating
          const na = parseFloat(av[cat]), nb = parseFloat(bv[cat]);
          const part = (n, text, leftSide, other) => {
            const win = !Number.isNaN(n) && (Number.isNaN(other) || n > other);
            const fill = el('div', { class: 'fill', style: { width: (Number.isNaN(n) ? 0 : Math.min(n / G.MAX_CATEGORY, 1) * 100) + '%', background: G.colourFor(Number.isNaN(n) ? null : n, S.barRanges) } });
            const val = el('div', { class: 'value' + (win ? ' win' : '') }, Number.isNaN(n) ? '-' : text);
            const track = el('div', { class: 'track' }, fill);
            return el('div', { class: 'cmp-side ' + (leftSide ? 'left' : 'right') }, leftSide ? [val, track] : [track, val]);
          };
          grid.append(part(na, av[cat], true, nb), el('div', { class: 'center' }, cat), part(nb, bv[cat], false, na));
        }
        grid.append(el('div', { class: 'rule' }));
        const total = (g, other) => el('div', { class: 'cmp-total', style: { color: G.colourFor(g.score, S.ranges) } },
          pct(g.score) + (g.score !== null && (other.score === null || g.score > other.score) ? ' \u2605' : ''));
        grid.append(total(a, b), el('div', { class: 'center' }, 'OVERALL'), total(b, a));
        body.append(grid);
      }
      reload(null);
    }, 'compare');
  }

  // ------------------------------------------------------------------ add a game
  function openAdd() {
    if (!S.addUrl || !S.addKey) { toast('Add the helper address and secret key in Settings first.'); openSettings(); return; }
    const cats = categories.length ? categories : ['Story', 'Characters', 'Combat', 'Gameplay', 'Control', 'Level Design', 'Audio', 'Visual', 'Variety'];
    openOverlay((panel, o) => {
      const genres = [...new Set(allGames.map(g => g.meta.Type).filter(Boolean))].sort();
      const platforms = [...new Set(allGames.map(g => g.meta.Platform).filter(Boolean))].sort();
      const known = [...new Set(allGames.flatMap(g => g.tags))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const inp = (attrs) => el('input', Object.assign({ type: 'text' }, attrs));
      const name = inp({ placeholder: 'Game name' }), year = inp({ inputmode: 'numeric', value: String(new Date().getFullYear()) });
      const genre = inp({ list: 'dl-genres', placeholder: 'pick or type' }), platform = inp({ list: 'dl-platforms', placeholder: 'pick or type' });
      const release = inp({ placeholder: '24/11/1998' }), tags = inp({ placeholder: 'co-op, retro' });
      const scores = Object.fromEntries(cats.map(c => [c, inp({ type: 'number', min: 0, max: 5, step: 0.25, inputmode: 'decimal' })]));
      const review = el('textarea', {});
      const preview = el('div', { class: 'preview' }), error = el('div', { class: 'error' });
      const pick = el('select', { onchange: e => { if (e.target.value) tags.value = G.splitTags(tags.value + ',' + e.target.value).join(', '); e.target.value = ''; } },
        el('option', { value: '' }, 'add an existing tag...'), known.map(t => el('option', { value: t }, t)));

      const rows = {};
      function update() {
        const w = G.weightsFor(genre.value, S.genreWeightsV2, cats), sc = {};
        for (const c of cats) for (const node of rows[c] || []) if (node) node.style.display = w[c] > 0 ? '' : 'none';   // only the ratings this genre uses
        for (const c of cats) {
          const t = scores[c].value.trim();
          if (!w[c]) { sc[c] = 0; continue; }
          if (t === '' || Number.isNaN(Number(t))) { preview.textContent = 'Overall: fill in all the scores to see it'; preview.style.color = ''; return; }
          sc[c] = Number(t);
        }
        const overall = G.overallPercent(sc, w);
        preview.textContent = 'Overall: ' + Math.round(overall) + '%'; preview.style.color = G.colourFor(overall, S.ranges);
      }
      [genre, ...Object.values(scores)].forEach(i => i.addEventListener('input', update));
      update();

      const row = (label, node, hint) => [el('label', {}, label), node, hint ? el('div', { class: 'hint' }, hint) : null];
      const save = el('button', { class: 'primary', onclick: submit }, 'Add to sheet');
      panel.append(
        el('div', { class: 'nav' }, el('b', {}, 'Add a game'), el('div', { class: 'mid' }), closeButton()),
        el('datalist', { id: 'dl-genres' }, genres.map(g => el('option', { value: g }))),
        el('datalist', { id: 'dl-platforms' }, platforms.map(g => el('option', { value: g }))),
        el('div', { class: 'form' },
          row('Game', name), row('Year played', year), row('Genre', genre), row('Platform', platform),
          row('Release date', release, 'day/month/year, e.g. 24/11/1998'),
          cats.map(c => (rows[c] = row(c, scores[c], '0 to 5'))),
          row('Tags', el('div', {}, tags, pick), 'comma separated, e.g. co-op, retro'),
          row('Review', review)),
        preview, error, el('div', { class: 'footer' }, el('button', { onclick: closeOverlay }, 'Cancel'), save));
      update();

      async function submit() {
        error.textContent = '';
        const fail = t => { error.textContent = t; };
        const n = name.value.trim(); if (!n) return fail("Please enter the game's name.");
        if (!/^\d{4}$/.test(year.value.trim())) return fail('The year played should be four digits, like 2026.');
        if (!genre.value.trim() || !platform.value.trim()) return fail('Please choose a genre and a platform.');
        let iso = null;
        if (release.value.trim()) { iso = G.toIsoDate(release.value); if (!iso) return fail('The release date should look like 24/11/1998 (day/month/year).'); }
        const w = G.weightsFor(genre.value, S.genreWeightsV2, cats), sc = {};
        for (const c of cats) {
          const t = scores[c].value.trim();
          if (!w[c]) continue;                                 // this genre doesn't use that rating
          const v = Number(t);
          if (t === '' || Number.isNaN(v)) return fail('Please enter a score for ' + c + '.');
          if (v < 0 || v > G.MAX_CATEGORY) return fail(c + ' must be between 0 and 5.');
          sc[c] = v;
        }
        if (allGames.some(g => g.name.toLowerCase() === n.toLowerCase()) && !confirm(`'${n}' is already in your list.\nAdd it again anyway?`)) return;
        save.disabled = true; error.style.color = 'var(--dim)'; error.textContent = 'Saving to your sheet...';
        const payload = G.buildAddPayload({ key: S.addKey, name: n, year: +year.value, genre: genre.value.trim(), platform: platform.value.trim(),
          isoDate: iso, scores: sc, review: review.value.trim(), weights: w, tags: tags.value });
        const result = await sendToHelper(payload);
        error.style.color = '';
        if (result.ok) { closeOverlay(); toast('Added ' + n); setTimeout(() => refresh(false), 1500); }
        else { save.disabled = false; fail("Couldn't add the game: " + (result.error || 'unknown problem')); }
      }
    }, 'add');
  }

  async function sendToHelper(payload) {
    try {
      const r = await fetch(S.addUrl, { method: 'POST', body: JSON.stringify(payload) });   // plain text, so no pre-check needed
      const text = await r.text();
      try { return JSON.parse(text); } catch (e) { return { ok: false, error: 'The helper did not reply properly. Check it is deployed with access set to "Anyone".' }; }
    } catch (e) {
      return { ok: false, error: "couldn't reach the helper, so I can't tell if it was added. Press refresh to check, and check your internet." };
    }
  }

  // ------------------------------------------------------------------ settings page
  function openSettings() {
    openOverlay((panel, o) => {
      const text = (value, attrs) => el('input', Object.assign({ type: 'text', value: value == null ? '' : value }, attrs));
      const sheetUrl = text(S.sheetUrl, { placeholder: 'Sheet link or Publish-to-web link' }), sheetTab = text(S.sheetTab);
      const covers = text(S.coversFolder), platforms = text(S.platformsFolder), tagsF = text(S.tagsFolder);
      const bg = text(S.backgroundImage, { placeholder: 'background.png (blank = plain colour)' });
      const mirror = el('input', { type: 'checkbox' }); mirror.checked = !!S.backgroundMirror;
      const showTags = el('input', { type: 'checkbox' }); showTags.checked = !!S.showTagsOnCovers;
      const size = el('input', { type: 'range', min: 90, max: 400, step: 10, value: S.coverSize || tileSize() });
      const sizeAuto = el('input', { type: 'checkbox' }); sizeAuto.checked = !S.coverSize;
      const addUrl = text(S.addUrl, { placeholder: 'https://script.google.com/macros/s/.../exec' }), addKey = text(S.addKey);
      const friendsUrl = text(S.friendsUrl, { placeholder: 'https://script.google.com/macros/s/.../exec' }), friendsKey = text(S.friendsKey);
      const colour = key => el('input', { type: 'color', value: S.friendColours[key] });
      const cGreen = colour('green'), cAmber = colour('amber'), cRed = colour('red');
      const defGreen = el('input', { type: 'number', min: 0, step: 1, value: S.defaultGreenDays });
      const defAmber = el('input', { type: 'number', min: 0, step: 1, value: S.defaultAmberDays });
      const friendsBg = text(S.friendsBackground, { placeholder: 'friends-background.png (blank = plain colour)' });
      const friendsMirror = el('input', { type: 'checkbox' }); friendsMirror.checked = !!S.friendsBackgroundMirror;
      const menuFolder = text(S.menuFolder);

      function rangeEditor(list, low, high, step) {
        const box = el('div', {});
        const add = (min, color) => {
          const r = el('div', { class: 'rangerow' }, el('input', { type: 'number', min: low, max: high, step, value: min }),
            el('input', { type: 'color', value: color }), el('button', { onclick: () => r.remove() }, 'Remove'));
          box.append(r);
        };
        list.slice().sort((a, b) => b.min - a.min).forEach(r => add(r.min, r.color));
        return { node: el('div', {}, box, el('button', { onclick: () => add(low, '#ffffff') }, 'Add range')),
          read() {
            const out = [...box.children].map(r => ({ min: Number(r.children[0].value), color: r.children[1].value }));
            if (!out.length) throw new Error('Keep at least one colour range.');
            if (out.some(r => Number.isNaN(r.min) || r.min < low || r.min > high)) throw new Error(`Range scores must be between ${low} and ${high}.`);
            return out;
          } };
      }
      const overall = rangeEditor(S.ranges, 0, 100, 1), bars = rangeEditor(S.barRanges, 0, 5, 0.25);

      const cats = categories.length ? categories : ['Story', 'Characters', 'Combat', 'Gameplay', 'Control', 'Level Design', 'Audio', 'Visual', 'Variety'];
      const wbody = el('tbody', {});
      const addWeight = (genre, w, fixed) => {
        const inputs = cats.map(c => el('input', { type: 'number', min: 0, max: 100, step: 5, value: +((w[c] || 0) * 100).toFixed(2) }));
        const total = el('td', {});
        const upd = () => { const t = inputs.reduce((s, i) => s + Number(i.value || 0), 0); total.textContent = G.formatNumber(+t.toFixed(2)) + '%'; total.style.color = Math.abs(t - 100) < 0.01 ? '' : '#ff9f1c'; };
        inputs.forEach(i => i.addEventListener('input', upd)); upd();
        const row = el('tr', {}, el('td', {}, el('input', { class: 'genre', type: 'text', value: genre, readonly: fixed })), inputs.map(i => el('td', {}, i)), total,
          el('td', {}, fixed ? '' : el('button', { onclick: () => row.remove() }, 'Remove')));
        wbody.append(row);
      };
      for (const [genre, w] of Object.entries(S.genreWeightsV2)) addWeight(genre, w, genre === 'Other');
      if (!('Other' in S.genreWeightsV2)) addWeight('Other', G.DEFAULTS.genreWeightsV2.Other, true);
      const readWeights = () => {
        const out = {};
        for (const row of wbody.children) {
          const genre = row.querySelector('.genre').value.trim();
          if (!genre) throw new Error('Every genre row needs a name (or press Remove).');
          if (genre.toLowerCase() in Object.fromEntries(Object.keys(out).map(k => [k.toLowerCase(), 1]))) throw new Error(`'${genre}' appears twice in the weights table.`);
          const w = {}; let sum = 0;
          cats.forEach((c, i) => { const v = Number(row.querySelectorAll('input[type=number]')[i].value); if (Number.isNaN(v) || v < 0) throw new Error(`Check the ${c} weight for '${genre}'.`); w[c] = +(v / 100).toFixed(4); sum += v; });
          if (sum <= 0) throw new Error(`'${genre}' needs at least one weight above 0.`);
          out[genre] = w;
        }
        return out;
      };

      const code = el('textarea', { style: { minHeight: '90px', fontFamily: 'monospace', fontSize: '12px' } }, JSON.stringify(S, null, 2));
      const error = el('div', { class: 'error' });
      const f = (label, node, hint) => [el('label', {}, label), node, hint ? el('div', { class: 'hint' }, hint) : null];

      panel.append(
        el('div', { class: 'nav' }, el('b', {}, 'Settings'), el('div', { class: 'mid' }), closeButton()),
        el('div', { class: 'form' },
          el('div', { class: 'sethead' }, 'Your sheet'),
          f('Sheet link', sheetUrl, "Your normal Google Sheet link, or the link from File > Share > Publish to web (CSV)."),
          f('Tab name', sheetTab, 'The tab at the bottom of the sheet that holds your games.'),
          el('div', { class: 'sethead' }, 'Pictures'),
          f('Covers folder', covers), f('Platform logos folder', platforms), f('Tag pictures folder', tagsF),
          f('Show tags on covers', showTags),
          f('Background picture', bg), f('Flip every other repeat', mirror, 'Makes a repeating background join up with no seams.'),
          f('Cover size', el('div', {}, size, el('label', {}, sizeAuto, ' automatic for this screen'))),
          el('div', { class: 'sethead' }, 'Colours'),
          f('Overall score (out of 100)', overall.node), f('Category bars (out of 5)', bars.node),
          el('div', { class: 'sethead' }, 'Adding games (stays on this device only)'),
          f('Helper web address', addUrl), f('Secret key', addKey),
          el('div', { class: 'sethead' }, 'Friends (stays on this device only)'),
          f('Friends helper address', friendsUrl), f('Friends secret key', friendsKey),
          f('Colours', el('div', { class: 'rangerow' }, cGreen, ' green ', cAmber, ' amber ', cRed, ' red')),
          f('New friends start with', el('div', {}, 'green until ', defGreen, ' days, amber until ', defAmber, ' days'), 'Each friend can have their own numbers when you add or edit them.'),
          f('Friends background', friendsBg), f('Flip every other repeat', friendsMirror),
          f('Menu pictures folder', menuFolder, 'Optional: a picture named Friends.png or Game Reviews.png replaces that menu box.'),
          el('div', { class: 'sethead' }, 'Overall score weights by genre (%)'),
          el('div', { style: { gridColumn: '1 / -1', overflowX: 'auto' } },
            el('table', { class: 'wtable' }, el('thead', {}, el('tr', {}, el('th', {}, 'Genre'), cats.map(c => el('th', {}, c)), el('th', {}, 'Total'), el('th', {}))), wbody),
            el('div', { class: 'hint', style: { marginTop: '6px' } }, "A genre that isn't listed uses the 'Other' row."),
            el('button', { style: { marginTop: '8px' }, onclick: () => addWeight('', {}, false) }, 'Add genre')),
          el('div', { class: 'sethead' }, 'Move settings to another device'),
          el('div', { style: { gridColumn: '1 / -1' } }, code,
            el('div', { class: 'hint' }, 'Copy this text to put the same settings (including colours) on your phone or PC. Paste into the box and press Import.'),
            el('button', { style: { marginTop: '6px' }, onclick: importCode }, 'Import'))),
        error,
        el('div', { class: 'footer' }, el('button', { onclick: reset }, 'Reset all'), el('button', { onclick: closeOverlay }, 'Cancel'), el('button', { class: 'primary', onclick: save }, 'Save')));

      function reset() { if (confirm('Put every setting back to the default (including your helper address and key)?')) { localStorage.removeItem(SETTINGS_KEY); S = loadSettings(); closeOverlay(); finish(true); } }
      function importCode() {
        try { const parsed = JSON.parse(code.value); S = Object.assign(JSON.parse(JSON.stringify(G.DEFAULTS)), parsed); saveSettings(); closeOverlay(); finish(true); toast('Settings imported'); }
        catch (e) { error.textContent = "That text isn't valid settings code."; }
      }
      function save() {
        try {
          const next = Object.assign({}, S, {
            sheetUrl: sheetUrl.value.trim(), sheetTab: sheetTab.value.trim(),
            coversFolder: covers.value.trim() || 'covers', platformsFolder: platforms.value.trim() || 'platforms', tagsFolder: tagsF.value.trim() || 'tags',
            showTagsOnCovers: showTags.checked, backgroundImage: bg.value.trim(), backgroundMirror: mirror.checked,
            coverSize: sizeAuto.checked ? 0 : Number(size.value),
            addUrl: addUrl.value.trim(), addKey: addKey.value.trim(),
            friendsUrl: friendsUrl.value.trim(), friendsKey: friendsKey.value.trim(),
            friendColours: { green: cGreen.value, amber: cAmber.value, red: cRed.value },
            defaultGreenDays: Number(defGreen.value), defaultAmberDays: Number(defAmber.value),
            friendsBackground: friendsBg.value.trim(), friendsBackgroundMirror: friendsMirror.checked,
            menuFolder: menuFolder.value.trim() || 'menu',
            ranges: overall.read(), barRanges: bars.read(), genreWeightsV2: readWeights() });
          if (!G.sheetCsvUrl(next)) throw new Error("That doesn't look like a Google Sheet link.");
          if (next.addUrl && !/^https:\/\//.test(next.addUrl)) throw new Error('The helper web address should start with https://');
          if (next.friendsUrl && !/^https:\/\//.test(next.friendsUrl)) throw new Error('The Friends helper address should start with https://');
          if (![next.defaultGreenDays, next.defaultAmberDays].every(n => Number.isInteger(n) && n >= 0) || next.defaultAmberDays < next.defaultGreenDays)
            throw new Error('For new friends, green and amber should be whole numbers of days, with amber the same as green or more.');
          const sheetChanged = G.sheetCsvUrl(next) !== G.sheetCsvUrl(S);
          S = next; saveSettings(); closeOverlay(); finish(sheetChanged);
        } catch (e) { error.textContent = e.message; }
      }
    }, 'settings');
  }
  function finish(sheetChanged) {
    resolved.clear(); applyBackground(); applyView(); renderMenu(); setHeader();
    applyBackgroundTo($('#friends'), S.friendsBackground, S.friendsBackgroundMirror);
    if (window.Friends) window.Friends.rerender();
    if (sheetChanged) { lastText = null; refresh(false); }
  }

  // ------------------------------------------------------------------ background picture
  // Puts a (repeating) picture behind an area. Mirrored, so the edges always join up.
  function applyBackgroundTo(container, image, mirror) {
    container.style.backgroundImage = '';
    container.style.backgroundSize = '';
    if (!image) return;
    const img = new Image();
    img.onload = () => {
      if (!mirror) { container.style.backgroundImage = `url("${image}")`; return; }
      const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas');   // 2x2 mirrored tile
      c.width = w * 2; c.height = h * 2;
      const x = c.getContext('2d');
      for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        x.save(); x.translate(mx * w + (mx ? w : 0), my * h + (my ? h : 0)); x.scale(mx ? -1 : 1, my ? -1 : 1); x.drawImage(img, 0, 0); x.restore();
      }
      container.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.9)})`;
      container.style.backgroundSize = `${w * 2}px ${h * 2}px`;
    };
    img.src = image;
  }
  const applyBackground = () => applyBackgroundTo($('#content'), S.backgroundImage, S.backgroundMirror);

  // ------------------------------------------------------------------ the menu and the areas
  const TITLES = { menu: 'My Life', games: 'Game Reviews', friends: 'Friends' };

  function setHeader() {
    document.title = TITLES[area];
    $('#title').textContent = TITLES[area];
    $('#btn-menu').hidden = area === 'menu';
    $('#controls').hidden = area !== 'games';
    $('#status').textContent = statuses[area] || '';
    const buttons = area === 'games'
      ? [['\u21BB', () => refresh(true), 'Refresh from the sheet'], ['Compare', () => openCompare()], ['\uFF0B Add', openAdd], ['\u2699', openSettings, 'Settings']]
      : area === 'friends'
        ? [['\u21BB', () => Friends.refresh(true), 'Refresh'], ['\uFF0B Add friend', () => Friends.addFriend()], ['\u2699', openSettings, 'Settings']]
        : [['\u2699', openSettings, 'Settings']];
    $('#buttons').replaceChildren(...buttons.map(([label, handler, title]) => el('button', { onclick: handler, title: title || '' }, label)));
  }

  function showArea(name, push) {
    area = name;
    $('#menu').hidden = name !== 'menu';
    $('#content').hidden = name !== 'games';
    $('#friends').hidden = name !== 'friends';
    if (push) history.pushState({ area: name, overlay: 0 }, '');
    setHeader();
    window.scrollTo(0, 0);
    if (name === 'friends' && window.Friends) window.Friends.onShow();
  }

  function renderMenu() {
    const menu = $('#menu');
    menu.style.setProperty('--tile', tileSize() + 'px');
    const tile = (label, key) => {
      const go = () => showArea(key, true);
      const t = el('div', { class: 'tile menutile texttile', tabindex: '0', role: 'button', 'aria-label': label, onclick: go, onkeydown: e => { if (e.key === 'Enter') go(); } });
      const img = el('img', { class: 'cover', alt: '' });
      t.append(img, el('div', { class: 'bigname' }, label), el('div', { class: 'bar' }, el('span', { class: 'name', style: { fontSize: '8cqw' } }, label)));
      // a picture named after the tile (menu/Friends.png) replaces the plain box
      loadPicture(img, S.menuFolder, label, () => img.remove(), () => t.classList.remove('texttile'));
      return t;
    };
    menu.replaceChildren(el('div', { class: 'grid' }, tile('Game Reviews', 'games'), tile('Friends', 'friends')));
  }

  // ------------------------------------------------------------------ start up
  function start() {
    buildControls();
    $('#btn-menu').onclick = () => { if (history.state && history.state.area) history.back(); else showArea('menu', false); };
    window.addEventListener('resize', () => { $('#content').style.setProperty('--tile', tileSize() + 'px'); $('#menu').style.setProperty('--tile', tileSize() + 'px'); });
    history.replaceState(null, '');
    renderMenu();
    showArea('menu', false);
    applyBackground();
    loadCache();
    refresh(false);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.GRApp = { el, toast, openOverlay, closeOverlay, closeAll, closeButton, swipe, settings: () => S, setStatus, loadPicture, applyBackgroundTo, openSettings, start };
  window.__GR = { get games() { return allGames; }, get view() { return view; } };   // handy for testing
})();
