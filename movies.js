/* Movies (web) - your Film Ratings tab shown as a wall of posters.
   Same idea as the Game Reviews area, but with one rating per film. */
(function () {
  'use strict';
  const A = window.GRApp, G = window.GR, el = A.el;
  const CACHE = 'gr_movies_cache_v1', POSTERS = 'gr_tmdb_cache_v1', VIEW_KEY = 'gr_movies_view_v1';
  const ALL = 'All';
  const S = () => A.settings();
  const $ = id => document.getElementById(id);
  const pct = score => score === null || score === undefined ? '--' : Math.round(score) + '%';
  const hhmm = () => new Date().toTimeString().slice(0, 5);

  let films = [], columns = {}, view = [], lastText = null, loaded = false;
  let V = { sort: 'Rating: high to low', group: 'No grouping', filters: {} };
  try { Object.assign(V, JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')); } catch (e) { /* ignore */ }
  const saveView = () => localStorage.setItem(VIEW_KEY, JSON.stringify(V));

  // ------------------------------------------------------------------ reading the Film Ratings tab
  function setData(parsed) { films = parsed.films; columns = parsed.columns; loaded = true; fillFilters(); applyView(); }

  async function refresh(manual) {
    const url = G.sheetCsvUrl(S(), S().filmSheetTab);
    if (!url) { A.setStatus("The sheet link in Settings isn't valid", 'movies'); return; }
    A.setStatus('Refreshing...', 'movies');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('the sheet answered with error ' + r.status);
      const text = await r.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Google asked for a login - share the sheet as "Anyone with the link can view"');
      const parsed = G.parseFilms(text);
      try { localStorage.setItem(CACHE, text); } catch (e) { /* too big - fine */ }
      if (text !== lastText) { lastText = text; setData(parsed); }
      A.setStatus('Updated ' + hhmm(), 'movies');
      if (manual) A.toast('Up to date');
    } catch (e) {
      const hint = e instanceof TypeError ? "couldn't reach the sheet (if you're online, try a 'Publish to web' link in Settings)" : e.message;
      A.setStatus(loaded ? 'Offline - showing saved data' : "Couldn't load: " + hint, 'movies');
      if (manual) A.toast("Couldn't refresh: " + hint);
    }
  }

  function loadCache() {
    const text = localStorage.getItem(CACHE);
    if (!text) return;
    try { lastText = text; setData(G.parseFilms(text)); A.setStatus('Showing saved data', 'movies'); } catch (e) { lastText = null; }
  }

  // ------------------------------------------------------------------ posters
  // 1. a picture of your own in the posters folder  2. a Poster column in the sheet
  // 3. a match found on TMDB (needs the free key in Settings)
  let found = {};
  try { found = JSON.parse(localStorage.getItem(POSTERS) || '{}'); } catch (e) { /* ignore */ }
  const saveFound = () => { try { localStorage.setItem(POSTERS, JSON.stringify(found)); } catch (e) { /* ignore */ } };
  const tmdbImage = (path, size) => `https://image.tmdb.org/t/p/${size}${path}`;
  const normal = text => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function directPoster(film, size) {
    if (/^https?:\/\//.test(film.poster)) return film.poster;
    if (/^\//.test(film.poster)) return tmdbImage(film.poster, size);
    return null;
  }

  // Looks things up four at a time, so a big list doesn't flood TMDB.
  const waiting = []; let running = 0;
  function schedule(job) {
    return new Promise(resolve => {
      waiting.push(async () => { try { resolve(await job()); } catch (e) { resolve(null); } running--; pump(); });
      pump();
    });
  }
  function pump() { while (running < 4 && waiting.length) { running++; waiting.shift()(); } }

  let warnedAboutKey = false;
  async function tmdbSearch(title, year) {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(S().tmdbKey)}&query=${encodeURIComponent(title)}${year ? '&year=' + year : ''}&include_adult=false`;
    const r = await fetch(url);
    if (r.status === 401) {
      if (!warnedAboutKey) { warnedAboutKey = true; A.toast("TMDB didn't accept your key. Check it in Settings."); }
      throw new Error('bad key');
    }
    if (!r.ok) throw new Error('TMDB ' + r.status);
    return (await r.json()).results || [];
  }

  async function bestMatch(film) {
    const { title, year } = G.splitFilmTitle(film.name);
    const released = G.parseDate(film.release);
    const hint = year || (released !== null ? new Date(released).getUTCFullYear() : null);
    let results = await tmdbSearch(title, hint);
    if (!results.length && hint) results = await tmdbSearch(title, null);
    const withPoster = results.filter(r => r.poster_path);
    return withPoster.find(r => normal(r.title) === normal(title)) || withPoster[0] || null;
  }

  const lookups = new Map();
  function findPoster(film) {
    const saved = found[film.name];
    if (saved) return Promise.resolve(saved.none ? null : saved);
    if (!S().tmdbKey) return Promise.resolve(null);
    if (!lookups.has(film.name)) {
      lookups.set(film.name, schedule(async () => {
        const match = await bestMatch(film);
        found[film.name] = match ? { path: match.poster_path, title: match.title, year: (match.release_date || '').slice(0, 4) } : { none: true };
        saveFound();
        return match ? found[film.name] : null;
      }).then(entry => { lookups.delete(film.name); return entry; }));
    }
    return lookups.get(film.name);
  }

  function posterInto(img, film, size, onFail) {
    A.loadPicture(img, S().postersFolder, film.name, () => {
      img.onload = null;                       // don't remember this as a file of your own
      const direct = directPoster(film, size);
      if (direct) { img.onerror = onFail; img.src = direct; return; }
      findPoster(film).then(entry => {
        if (entry && entry.path) { img.onerror = onFail; img.src = tmdbImage(entry.path, size); } else onFail();
      });
    });
  }

  // ------------------------------------------------------------------ sort / group / filter bar
  const controls = { filters: {} };
  const FILTERS = [['Genre', 'Type'], ['Year', 'Year'], ['Tag', 'Tags']];
  function select(options, value, onchange) {
    const s = el('select', { onchange: e => onchange(e.target.value) }, options.map(o => el('option', { value: o }, o)));
    s.value = options.includes(value) ? value : options[0];
    return s;
  }
  function buildControls() {
    const bar = $('movie-controls');
    controls.sort = select(Object.keys(G.MOVIE_SORTS), V.sort, v => { V.sort = v; saveView(); applyView(); });
    controls.group = select(G.MOVIE_GROUPS, V.group, v => { V.group = v; saveView(); applyView(); });
    bar.append(el('label', {}, 'Sort', controls.sort), el('label', {}, 'Group', controls.group));
    for (const [label, column] of FILTERS) {
      const s = select([ALL], ALL, v => { V.filters[column] = v; saveView(); applyView(); });
      controls.filters[column] = s;
      bar.append(el('label', {}, label, s));
    }
    bar.append(el('button', { onclick: () => { V.filters = {}; saveView(); fillFilters(); applyView(); } }, 'Clear'));
    controls.count = el('span', { class: 'count' });
    bar.append(controls.count);
  }
  function fillFilters() {
    for (const [, column] of FILTERS) {
      const unique = new Map();
      for (const f of films) for (const v of G.gameValues(f, column)) if (!unique.has(v.toLowerCase())) unique.set(v.toLowerCase(), v);
      let values = [...unique.values()];
      values = column === 'Year' ? values.sort((a, b) => (G.numberIn(b) || 0) - (G.numberIn(a) || 0)) : values.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const s = controls.filters[column], chosen = (V.filters[column] || '').toLowerCase();
      s.replaceChildren(...[ALL, ...values].map(o => el('option', { value: o }, o)));
      const keep = values.find(v => v.toLowerCase() === chosen);
      s.value = keep || ALL;
      if (!keep) delete V.filters[column];
    }
  }
  function applyView() {
    let list = films;
    for (const [, column] of FILTERS) {
      const wanted = V.filters[column] || ALL;
      if (wanted !== ALL) list = list.filter(f => G.gameValues(f, column).some(v => v.toLowerCase() === wanted.toLowerCase()));
    }
    list = G.sortGames(list, V.sort, G.MOVIE_SORTS);
    view = G.groupGames(list, V.group, S().movieRanges).flatMap(g => g.games);
    controls.count.textContent = `${view.length} of ${films.length} films`;
    renderGrid(list);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ the poster wall
  function nameSize(name) {
    const n = name.length;
    return (n <= 14 ? 6.8 : n <= 22 ? 5.9 : n <= 30 ? 5.1 : 4.5) + 'cqw';
  }

  function makeTile(f) {
    const tile = el('div', { class: 'tile poster', tabindex: '0', role: 'button', 'aria-label': f.name, 'data-name': f.name,
      onclick: () => openFilm(f.id), onkeydown: e => { if (e.key === 'Enter') openFilm(f.id); } });
    const cover = el('img', { class: 'cover', alt: '', loading: 'lazy', decoding: 'async' });
    posterInto(cover, f, 'w342', () => { tile.classList.add('nocover'); cover.remove(); });
    tile.append(cover);

    if (S().showTagsOnCovers && f.tags.length) {
      const strip = el('div', { class: 'tagstrip' });
      for (const tag of f.tags.slice(0, 6)) {
        const icon = el('img', { alt: tag, title: tag });
        strip.append(icon);
        A.loadPicture(icon, S().tagsFolder, tag, () => icon.remove(), () => strip.classList.add('show'));
      }
      tile.append(strip);
    }

    const genre = el('span', { class: 'plat' });       // the small genre picture, bottom left
    if (f.meta.Type) {
      const logo = el('img', { alt: f.meta.Type });
      genre.append(logo);
      A.loadPicture(logo, S().genresFolder, f.meta.Type, () => { logo.remove(); genre.textContent = f.meta.Type; genre.classList.add('text'); });
    }
    tile.append(el('div', { class: 'bar' }, genre, el('span', { class: 'name', style: { fontSize: nameSize(f.name) } }, f.name),
      el('span', { class: 'score', style: { color: G.colourFor(f.score, S().movieRanges) } }, f.score === null ? '--' : String(Math.round(f.score)))));
    return tile;
  }

  function renderGrid(list) {
    const box = $('movies');
    box.style.setProperty('--tile', A.tileSize() + 'px');
    box.replaceChildren();
    if (!view.length) {
      box.append(el('div', { class: 'message' }, films.length ? 'No films match these filters.' : loaded ? 'No films found in the Film Ratings tab.' : 'Loading your films...'));
      return;
    }
    for (const group of G.groupGames(list, V.group, S().movieRanges)) {
      if (group.title !== null)
        box.append(el('div', { class: 'heading', style: group.color ? { color: group.color, borderColor: group.color } : {} }, `${group.title}   (${group.games.length})`));
      box.append(el('div', { class: 'grid' }, group.games.map(makeTile)));
    }
    if (S().tmdbKey) box.append(el('div', { class: 'attrib' }, 'This product uses the TMDB API but is not endorsed or certified by TMDB.'));
  }

  // ------------------------------------------------------------------ a film's page
  function artBox(f, size) {
    const art = el('div', { class: 'art poster' });
    const img = el('img', { alt: f.name });
    art.append(img);
    posterInto(img, f, size, () => { art.classList.add('nocover'); art.setAttribute('data-name', f.name); img.remove(); });
    return art;
  }

  function openFilm(id) {
    const index = view.findIndex(f => f.id === id);
    if (index < 0) return;
    A.openOverlay((panel, o) => {
      o.index = index;
      const go = d => { const n = o.index + d; if (n >= 0 && n < view.length) { o.index = n; renderFilm(panel, o); panel.scrollTop = 0; } };
      o.go = go;
      o.rerender = () => renderFilm(panel, o);
      o.onKey = e => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
      A.swipe(panel, dx => go(dx < 0 ? 1 : -1));
      renderFilm(panel, o);
    }, 'game');
  }

  function renderFilm(panel, o) {
    const f = view[o.index];
    if (!f) { A.closeOverlay(); return; }
    const colour = G.colourFor(f.score, S().movieRanges);
    panel.replaceChildren();
    panel.append(el('div', { class: 'nav' },
      el('button', { onclick: () => o.go(-1), disabled: o.index === 0, 'aria-label': 'Previous film' }, '\u25C0', el('span', { class: 'long' }, ' Previous')),
      el('div', { class: 'mid' }, `${o.index + 1} of ${view.length}`),
      el('button', { onclick: () => o.go(1), disabled: o.index === view.length - 1, 'aria-label': 'Next film' }, el('span', { class: 'long' }, 'Next '), '\u25B6'),
      A.closeButton()));

    const bits = [f.meta.Type, f.release ? 'Released ' + f.release : null, f.watched ? 'Watched ' + f.watched : null].filter(Boolean);
    const info = el('div', { class: 'info' }, el('h2', {}, f.name), el('div', { class: 'meta' }, bits.join('  |  ')));
    if (f.tags.length) {
      info.append(el('div', { class: 'chips' }, f.tags.map(tag => {
        const chip = el('span', { class: 'chip' }), icon = el('img', { alt: '' });
        chip.append(icon, tag);
        A.loadPicture(icon, S().tagsFolder, tag, () => icon.remove());
        return chip;
      })));
    }
    info.append(el('div', { class: 'bigscore', style: { color: colour } }, pct(f.score)));
    for (const [rank, rest] of G.rankLines(f, films)) info.append(el('div', { class: 'rank' }, el('b', { style: { color: colour } }, rank), ' ' + rest));
    info.append(el('div', { class: 'btnrow' },
      el('button', { onclick: () => openCompare(f) }, 'Compare with other films'),
      el('button', { onclick: () => changePoster(f, o) }, 'Change poster')));
    panel.append(el('div', { class: 'gamehead' }, artBox(f, 'w500'), info));
    panel.append(el('div', { class: 'section' }, el('h3', { style: { marginTop: 0 } }, 'Review'),
      el('div', { class: 'review' }, f.review || 'No review written yet.')));
  }

  // ------------------------------------------------------------------ choosing a different poster
  function changePoster(film, filmOverlay) {
    if (!S().tmdbKey) {
      A.toast('To look up posters, add your free TMDB key in Settings. Or save your own picture as ' + S().postersFolder + '/' + film.name + '.png');
      return;
    }
    A.openOverlay(panel => {
      const start = G.splitFilmTitle(film.name);
      const query = el('input', { type: 'text', value: start.title }), year = el('input', { type: 'number', placeholder: 'year', value: start.year || '', style: { width: '90px' } });
      const results = el('div', { class: 'pickgrid' });
      const message = el('div', { class: 'meta', style: { padding: '0 18px' } });
      const search = async () => {
        results.replaceChildren(); message.textContent = 'Searching...';
        try {
          const list = (await tmdbSearch(query.value.trim(), Number(year.value) || null)).filter(r => r.poster_path).slice(0, 18);
          message.textContent = list.length ? 'Tap the right poster.' : 'Nothing found. Try a different name or year.';
          results.append(...list.map(r => el('div', { class: 'pick', onclick: () => {
            found[film.name] = { path: r.poster_path, title: r.title, year: (r.release_date || '').slice(0, 4), manual: true };
            saveFound(); A.closeOverlay(); A.toast('Poster changed'); applyView(); if (filmOverlay && filmOverlay.rerender) setTimeout(filmOverlay.rerender, 0);
          } }, el('img', { src: tmdbImage(r.poster_path, 'w185'), alt: r.title, loading: 'lazy' }), el('span', {}, `${r.title}${r.release_date ? ' (' + r.release_date.slice(0, 4) + ')' : ''}`))));
        } catch (e) { message.textContent = "Couldn't search: " + e.message; }
      };
      panel.append(el('div', { class: 'nav' }, el('b', {}, 'Choose a poster'), el('div', { class: 'mid' }), A.closeButton()),
        el('div', { class: 'section' }, el('div', { class: 'fr-form' }, query, year, el('button', { class: 'primary', onclick: search }, 'Search'))),
        message, results);
      query.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
      search();
    }, 'editor');
  }

  // ------------------------------------------------------------------ compare two films
  function openCompare(start) {
    if (films.length < 2) { A.toast('You need at least two films to compare.'); return; }
    start = start || view[0] || films[0];
    A.openOverlay((panel, o) => {
      const ordered = films.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      const label = f => `${f.name}  (${f.meta.Type ? f.meta.Type + ', ' : ''}${pct(f.score)})`;
      o.left = start; o.pool = []; o.index = 0;
      o.mode = G.comparePool(start, films, 'genre').length ? 'genre' : 'all';
      const currentId = () => o.pool[o.index] ? o.pool[o.index].id : null;
      const leftSel = el('select', { onchange: e => { o.left = films.find(f => f.id === +e.target.value); reload(currentId()); } }, ordered.map(f => el('option', { value: f.id }, label(f))));
      leftSel.value = start.id;
      const rightSel = el('select', { onchange: e => { o.index = +e.target.value; draw(); } });
      const modeSel = el('select', { onchange: e => { o.mode = e.target.value; reload(currentId()); } },
        [['genre', 'Same genre'], ['all', 'Any film']].map(([v, t]) => el('option', { value: v }, t)));
      modeSel.value = o.mode;
      const count = el('span', { class: 'mid', style: { color: 'var(--dim)', fontSize: '12px' } });
      const body = el('div', {});
      const step = d => { const n = o.index + d; if (n >= 0 && n < o.pool.length) { o.index = n; rightSel.value = n; draw(); } };
      const swap = () => { const right = o.pool[o.index]; if (!right) return; const was = o.left.id; o.left = right; leftSel.value = right.id; reload(was); };
      o.onKey = e => { if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); };
      panel.append(el('div', { class: 'cmp-controls' }, leftSel, el('b', {}, 'vs'), rightSel,
        el('button', { onclick: () => step(-1) }, '\u25C0'), el('button', { onclick: () => step(1) }, '\u25B6'),
        el('button', { onclick: swap }, '\u21C4 Swap'), modeSel, count, A.closeButton()), body);

      function reload(keepId) {
        o.pool = G.comparePool(o.left, films, o.mode);
        const genre = o.mode === 'genre' ? (o.left.meta.Type || '') : '';
        count.textContent = `${o.pool.length} ${genre ? genre + ' ' : ''}films to choose from`;
        rightSel.replaceChildren(...o.pool.map((f, i) => el('option', { value: i }, label(f))));
        rightSel.disabled = !o.pool.length;
        o.index = Math.max(0, o.pool.findIndex(f => f.id === keepId));
        rightSel.value = o.index;
        draw();
      }
      function draw() {
        body.replaceChildren();
        const a = o.left, b = o.pool[o.index];
        if (!b) { body.append(el('div', { class: 'message', style: { textAlign: 'center', color: 'var(--dim)' } }, 'There are no other films to compare with yet. Try another option in the box on the right.')); return; }
        const grid = el('div', { class: 'cmp-grid' });
        const heading = f => [el('div', { class: 'title' }, f.name), el('div', { class: 'sub' }, [f.meta.Type, f.watched ? 'Watched ' + f.watched : null].filter(Boolean).join('  |  '))];
        const total = (f, other) => el('div', { class: 'cmp-total', style: { color: G.colourFor(f.score, S().movieRanges) } },
          pct(f.score) + (f.score !== null && (other.score === null || f.score > other.score) ? ' \u2605' : ''));
        const [ta, sa] = heading(a), [tb, sb] = heading(b);
        grid.append(artBox(a, 'w342'), el('div', { class: 'center', style: { fontSize: '20px', fontWeight: 800 } }, 'VS'), artBox(b, 'w342'),
          ta, el('div', {}), tb, sa, el('div', {}), sb, total(a, b), el('div', { class: 'center' }, 'RATING'), total(b, a));
        if (a.score !== null && b.score !== null && a.score !== b.score) {
          const winner = a.score > b.score ? a : b;
          grid.append(el('div', { class: 'cmp-diff' }, `${winner.name} is ${Math.round(Math.abs(a.score - b.score))} points higher`));
        }
        body.append(grid);
      }
      reload(null);
    }, 'compare');
  }

  // ------------------------------------------------------------------ add a film
  async function sendToHelper(payload) {
    try {
      const r = await fetch(S().addUrl, { method: 'POST', body: JSON.stringify(payload) });
      const text = await r.text();
      try { return JSON.parse(text); } catch (e) { return { ok: false, error: 'The helper did not reply properly. Check it is deployed with access set to "Anyone", and that you pasted the newest helper script.' }; }
    } catch (e) {
      return { ok: false, error: "couldn't reach the helper, so I can't tell if it was added. Press refresh to check." };
    }
  }

  function openAdd() {
    if (!S().addUrl || !S().addKey) { A.toast('Add the helper address and secret key in Settings first.'); A.openSettings(); return; }
    A.openOverlay(panel => {
      const genres = [...new Set(films.map(f => f.meta.Type).filter(Boolean))].sort();
      const known = [...new Set(films.flatMap(f => f.tags))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const text = attrs => el('input', Object.assign({ type: 'text' }, attrs));
      const name = text({ placeholder: 'Film name' }), genre = text({ list: 'dl-film-genres', placeholder: 'pick or type (optional)' });
      const release = text({ placeholder: '24/11/1998 (optional)' });
      const watched = el('input', { type: 'date', value: G.todayIso() });
      const rating = el('input', { type: 'number', min: 0, max: 100, step: 1, inputmode: 'numeric', placeholder: '0 to 100' });
      const review = el('textarea', {}), tags = text({ placeholder: 'tag, another tag' });
      const pick = el('select', { onchange: e => { if (e.target.value) tags.value = G.splitTags(tags.value + ',' + e.target.value).join(', '); e.target.value = ''; } },
        el('option', { value: '' }, 'add an existing tag...'), known.map(t => el('option', { value: t }, t)));
      const preview = el('div', { class: 'preview' }), error = el('div', { class: 'error' });
      const row = (label, node, hint) => [el('label', {}, label), node, hint ? el('div', { class: 'hint' }, hint) : null];
      const update = () => { const n = Number(rating.value); if (rating.value === '' || Number.isNaN(n)) { preview.textContent = ''; return; } preview.textContent = 'Rating: ' + Math.round(n) + '%'; preview.style.color = G.colourFor(n, S().movieRanges); };
      rating.addEventListener('input', update);
      const save = el('button', { class: 'primary', onclick: submit }, 'Add to sheet');
      panel.append(el('div', { class: 'nav' }, el('b', {}, 'Add a film'), el('div', { class: 'mid' }), A.closeButton()),
        el('datalist', { id: 'dl-film-genres' }, genres.map(g => el('option', { value: g }))),
        el('div', { class: 'form' }, row('Film', name), row('Genre', genre), row('Release date', release, 'day/month/year'),
          row('Date watched', watched), row('Rating', rating, 'out of 100'), row('Tags', el('div', {}, tags, pick)), row('Review', review)),
        preview, error, el('div', { class: 'footer' }, el('button', { onclick: A.closeOverlay }, 'Cancel'), save));

      async function submit() {
        error.textContent = ''; error.style.color = '';
        const fail = t => { error.textContent = t; };
        const n = name.value.trim(); if (!n) return fail("Please enter the film's name.");
        const score = Number(rating.value);
        if (rating.value === '' || !Number.isFinite(score) || score < 0 || score > 100) return fail('The rating should be a number from 0 to 100.');
        let releaseIso = '';
        if (release.value.trim()) { releaseIso = G.toIsoDate(release.value); if (!releaseIso) return fail('The release date should look like 24/11/1998 (day/month/year).'); }
        if (!watched.value) return fail('Please choose the date you watched it.');
        if (films.some(f => f.name.toLowerCase() === n.toLowerCase()) && !confirm(`'${n}' is already in your list.\nAdd it again anyway? (Remakes need the year in the name, like Running Man (2025).)`)) return;
        save.disabled = true; error.style.color = 'var(--dim)'; error.textContent = 'Saving to your sheet...';
        const result = await sendToHelper(G.buildAddFilmPayload({ key: S().addKey, sheet: S().filmSheetTab, name: n, genre: genre.value.trim(), releaseIso,
          watchedIso: watched.value, rating: Math.round(score), review: review.value.trim(), tags: tags.value, columns }));
        error.style.color = '';
        if (result.ok) { A.closeOverlay(); A.toast('Added ' + n); setTimeout(() => refresh(false), 1500); }
        else { save.disabled = false; fail("Couldn't add the film: " + (result.error || 'unknown problem')); }
      }
    }, 'add');
  }

  // ------------------------------------------------------------------ hooks for the main app
  function onShow() {
    A.applyBackgroundTo($('movies'), S().backgroundImage, S().backgroundMirror);
    applyView();
    refresh(false);
  }

  buildControls();
  loadCache();
  window.Movies = { onShow, refresh, compare: openCompare, add: openAdd, rerender: () => { fillFilters(); applyView(); } };
})();
