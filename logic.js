/* Game Reviews (web) - the thinking part: reading the sheet, sorting, grouping,
   ranking and so on. No buttons or screens in here. */
(function (root) {
  'use strict';

  const MAX_CATEGORY = 5;

  const DEFAULTS = {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/11PpaKANU3UowM-utHZcqPPsles2ZoLzGqwKzbgBD_GI/edit?gid=1801733828',
    sheetTab: 'Game Ratings',
    coversFolder: 'covers',
    platformsFolder: 'platforms',
    tagsFolder: 'tags',
    coverSize: 0,                       // 0 = pick a sensible size for the screen
    showTagsOnCovers: true,
    backgroundImage: 'background.png',
    backgroundMirror: true,
    filmSheetTab: 'Film Ratings',       // the tab that holds your films
    postersFolder: 'posters',           // your own poster pictures, named after the film
    genresFolder: 'genres',             // small genre pictures: Horror.png, Comedy.png ...
    tmdbKey: '',                        // optional: lets the app look up missing posters (kept on this device only)
    movieRanges: [
      { min: 90, color: '#22b14c' },
      { min: 75, color: '#9acd32' },
      { min: 60, color: '#ff9f1c' },
      { min: 0,  color: '#e63946' },
    ],
    financeUrl: '',                     // the Finance helper web address (kept on this device only)
    financeKey: '',                     // the Finance secret key (kept on this device only)
    financePinLength: 4,                // how many digits your Finance PIN has (the PIN itself is never saved)
    financeIdleSeconds: 120,            // Finances locks itself after this long with nothing touched
    // Christmas Food: where each shop's own search page lives. {q} is replaced by your search words.
    xmasStores: [
      { name: 'Tesco',      url: 'https://www.tesco.com/groceries/en-GB/search?query={q}',        card: 'Clubcard',          color: '#00539f' },
      { name: "Sainsbury's", url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/{q}',          card: 'Nectar',            color: '#f06c00' },
      { name: 'Morrisons',  url: 'https://groceries.morrisons.com/search?entry={q}',               card: 'More Card',         color: '#007531' },
      { name: 'M&S',        url: 'https://www.marksandspencer.com/search?searchTerm={q}',          card: 'Sparks',            color: '#a3a3a3' },
      { name: 'Aldi',       url: 'https://www.google.com/search?q=site%3Aaldi.co.uk+{q+}',         card: '',                  color: '#00aadb' },
      { name: 'Lidl',       url: 'https://www.google.com/search?q=site%3Alidl.co.uk+{q+}',         card: 'Lidl Plus',         color: '#0050aa' },
      { name: 'Co-op',      url: 'https://www.google.com/search?q=site%3Acoop.co.uk+{q+}',         card: 'Co-op membership',  color: '#00b1eb' },
    ],
    xmasCompareUrl: 'https://www.trolley.co.uk/search/?q={q+}',
    menuFolder: 'menu',                 // optional pictures for the menu tiles (Game Reviews.png, Friends.png)
    friendsUrl: '',                     // the Friends helper web address (kept on this device only)
    friendsKey: '',                     // the Friends secret key (kept on this device only)
    friendColours: { green: '#5a9a50', amber: '#fbb12c', red: '#ff2a2a' },
    defaultGreenDays: 30,               // new friends start with these (each friend can have their own)
    defaultAmberDays: 60,
    friendsBackground: 'friends-background.png',
    friendsBackgroundMirror: true,
    addUrl: '',                         // the helper web address (kept on this device only)
    addKey: '',                         // the secret key (kept on this device only)
    ranges: [
      { min: 90, color: '#22b14c' },
      { min: 75, color: '#9acd32' },
      { min: 60, color: '#ff9f1c' },
      { min: 0,  color: '#e63946' },
    ],
    barRanges: [
      { min: 4.5,  color: '#22b14c' },
      { min: 3.75, color: '#9acd32' },
      { min: 3,    color: '#ff9f1c' },
      { min: 0,    color: '#e63946' },
    ],
    // Overall weights per genre, for the nine ratings in columns N to V.
    // A rating that isn't listed for a genre isn't used (or asked for) for that genre.
    genreWeightsV2: {
      'Action':   { Story: 0.15, Combat: 0.20, Gameplay: 0.25, Audio: 0.10, Visual: 0.30 },
      'Fighting': { Characters: 0.20, Combat: 0.30, Audio: 0.10, Visual: 0.10, Variety: 0.30 },
      'Misc':     { Gameplay: 0.50, Audio: 0.10, Visual: 0.20, Variety: 0.20 },
      'Platform': { Story: 0.10, Gameplay: 0.40, Control: 0.20, 'Level Design': 0.10, Audio: 0.10, Visual: 0.10 },
      'RPG':      { Story: 0.20, Characters: 0.10, Combat: 0.25, Gameplay: 0.25, Audio: 0.10, Visual: 0.10 },
      'Sports':   { Characters: 0.20, Gameplay: 0.30, Audio: 0.10, Visual: 0.10, Variety: 0.30 },
      // any genre that isn't listed: every rating counts about the same
      'Other':    { Story: 0.12, Characters: 0.11, Combat: 0.11, Gameplay: 0.11, Control: 0.11, 'Level Design': 0.11, Audio: 0.11, Visual: 0.11, Variety: 0.11 },
    },
  };

  // ---------- small helpers ----------
  function formatNumber(v) {
    v = Number(v);
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
  }

  function parseScore(text) {
    const n = parseFloat(String(text == null ? '' : text).replace('%', '').trim());
    return Number.isNaN(n) ? null : n;
  }

  function numberIn(text) {
    const m = /\d+/.exec(text || '');
    return m ? parseInt(m[0], 10) : null;
  }

  function splitTags(text) {
    const seen = new Set(), tags = [];
    for (const part of String(text || '').split(/[,;\n]/)) {
      const tag = part.trim();
      if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); tags.push(tag); }
    }
    return tags;
  }

  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  function monthNumber(name) {
    const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
    return i < 0 ? null : i + 1;
  }
  function makeDate(y, mo, d) {
    if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 ? dt.getTime() : null;
  }

  // Dates are read DAY first (UK): 24/11/1998. Returns a number that sorts by date.
  function parseDate(text) {
    const t = String(text || '').trim().replace(/([\/.\-])\1+/g, '$1');
    let m;
    if (!t) return null;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(t))) return makeDate(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/.exec(t))) { const y = +m[3]; return makeDate(y >= 69 ? 1900 + y : 2000 + y, +m[2], +m[1]); }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return makeDate(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(t))) return makeDate(+m[3], monthNumber(m[2]), +m[1]);
    if ((m = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(t))) return makeDate(+m[2], monthNumber(m[1]), 1);
    if ((m = /^(\d{4})$/.exec(t))) return makeDate(+m[1], 1, 1);
    return null;
  }

  // '24/11/1998' -> '1998-11-24' (only full dates)
  function toIsoDate(text) {
    const t = String(text || '').trim().replace(/([\/.\-])\1+/g, '$1');
    let m, y, mo, d;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3] >= 69 ? 1900 + +m[3] : 2000 + +m[3]; }
    else return null;
    if (makeDate(y, mo, d) === null) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  // ---------- reading the sheet ----------
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parseSheet(text) {
    const rows = parseCsv(text.replace(/^\uFEFF/, ''));
    if (!rows.length) return { games: [], categories: [] };
    const headers = rows[0].map(h => h.trim());
    const col = name => { const i = headers.indexOf(name); return i < 0 ? null : i; };
    const overallCols = headers.map((h, j) => h === 'Overall' ? j : -1).filter(j => j >= 0);
    const iGame = col('Game'), iRel = col('Release'), iRev = col('Review');
    const iAll = overallCols.length ? overallCols[overallCols.length - 1] : null;   // the LAST "Overall" counts
    const iTags = col('Tags') !== null ? col('Tags') : col('Tag');
    if (iGame === null || iAll === null) throw new Error("Couldn't find the 'Game' and 'Overall' columns in the sheet.");
    // The ratings sit between the previous "Overall" (old ratings, ignored) and the last one.
    // With only one "Overall" they start after Release.
    const catCols = [];
    const start = overallCols.length > 1 ? overallCols[overallCols.length - 2] + 1 : (iRel !== null ? iRel + 1 : null);
    if (start !== null) for (let j = start; j < iAll; j++) if (headers[j] && j !== iTags && j !== iRev) catCols.push(j);
    const metaCols = headers.map((h, j) => ['Type', 'Platform', 'Year'].includes(h) ? j : -1).filter(j => j >= 0);
    const games = [];
    for (const raw of rows.slice(1)) {
      const row = raw.concat(Array(Math.max(0, headers.length - raw.length)).fill(''));
      const name = (row[iGame] || '').trim();
      if (!name) continue;
      const meta = {};
      for (const j of metaCols) if (row[j].trim()) meta[headers[j]] = row[j].trim();
      games.push({
        id: games.length,
        name,
        release: iRel !== null ? row[iRel].trim() : '',
        score: parseScore(row[iAll]),
        review: iRev !== null ? row[iRev].trim() : '',
        tags: iTags !== null ? splitTags(row[iTags]) : [],
        meta,
        cats: catCols.filter(j => row[j].trim()).map(j => [headers[j], row[j].trim()]),
      });
    }
    // If the sheet hands over 0.71 instead of 71%, turn it into 71.
    const scored = games.filter(g => g.score !== null);
    if (scored.length && scored.every(g => g.score <= 1) && scored.some(g => g.score > 0)) scored.forEach(g => { g.score = Math.round(g.score * 10000) / 100; });
    return { games, categories: catCols.map(j => headers[j]) };
  }

  // The Film Ratings tab: # | Film Name | Genre | Release Date | Date Watched | Rating  (+ optional Review, Tags, Poster)
  function parseFilms(text) {
    const rows = parseCsv(text.replace(/^\uFEFF/, ''));
    if (!rows.length) return { films: [], columns: {} };
    const headers = rows[0].map(h => h.trim());
    const find = (...names) => { for (const n of names) { const i = headers.findIndex(h => h.toLowerCase() === n.toLowerCase()); if (i >= 0) return i; } return null; };
    const iName = find('Film Name', 'Film', 'Movie', 'Title'), iGenre = find('Genre'), iRel = find('Release Date', 'Release'),
      iWatched = find('Date Watched', 'Watched'), iRating = find('Rating', 'Overall'), iNum = find('#', 'No.'),
      iReview = find('Review'), iTags = find('Tags', 'Tag'), iPoster = find('Poster');
    if (iName === null || iRating === null) throw new Error("Couldn't find the 'Film Name' and 'Rating' columns in the Film Ratings tab.");
    const cell = (row, i) => i === null ? '' : (row[i] || '').trim();
    const films = [];
    for (const row of rows.slice(1)) {
      const name = cell(row, iName);
      if (!name) continue;
      const watched = cell(row, iWatched), genre = cell(row, iGenre);
      const date = parseDate(watched), meta = {};
      if (genre) meta.Type = genre;
      if (date !== null) meta.Year = String(new Date(date).getUTCFullYear());
      films.push({ id: films.length, number: cell(row, iNum), name, release: cell(row, iRel), watched, score: parseScore(cell(row, iRating)),
        review: cell(row, iReview), tags: iTags !== null ? splitTags(cell(row, iTags)) : [], poster: cell(row, iPoster), meta, cats: [] });
    }
    const scored = films.filter(f => f.score !== null);
    if (scored.length && scored.every(f => f.score <= 1) && scored.some(f => f.score > 0)) scored.forEach(f => { f.score = Math.round(f.score * 10000) / 100; });
    const name = i => i === null ? null : headers[i];
    return { films, columns: { title: name(iName), genre: name(iGenre), release: name(iRel), watched: name(iWatched), rating: name(iRating), review: name(iReview), tags: name(iTags), number: name(iNum) } };
  }

  // What the helper script needs to add a film to the Film Ratings tab.
  function buildAddFilmPayload(o) {
    const c = { title: 'Film Name', genre: 'Genre', release: 'Release Date', watched: 'Date Watched', rating: 'Rating', review: 'Review', tags: 'Tags', number: '#' };
    for (const [k, v] of Object.entries(o.columns || {})) if (v) c[k] = v;      // use the sheet's own heading names
    const fields = { [c.title]: o.name };
    const dates = [];
    if (o.genre) fields[c.genre] = o.genre;
    if (o.releaseIso) { fields[c.release] = o.releaseIso; dates.push(c.release); }
    if (o.watchedIso) { fields[c.watched] = o.watchedIso; dates.push(c.watched); }
    fields[c.rating] = o.rating;
    if (o.review) fields[c.review] = o.review;
    const tags = splitTags(o.tags).join(', ');
    if (tags) fields[c.tags] = tags;
    return { key: o.key, sheet: o.sheet || 'Film Ratings', titleColumn: c.title, numberColumn: c.number, fields, dates };
  }

  // 'Running Man (1987)' -> { title: 'Running Man', year: 1987 }
  function splitFilmTitle(name) {
    const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(String(name || '').trim());
    return m ? { title: m[1], year: +m[2] } : { title: String(name || '').trim(), year: null };
  }

  // The address the app downloads the sheet from.
  function sheetCsvUrl(s, tabOverride) {
    const url = (s.sheetUrl || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//.test(url)) return url;                  // a file next to the app (testing)
    if (/\/pub\?|output=csv/.test(url)) return url;             // a "Publish to web" link
    const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(url);
    if (!m) return null;
    let out = `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&headers=1`;
    const gid = /[#&?]gid=(\d+)/.exec(url);
    const tab = tabOverride || s.sheetTab;
    if (tab) out += '&sheet=' + encodeURIComponent(tab);
    else if (gid) out += '&gid=' + gid[1];
    return out;
  }

  // ---------- colours ----------
  function colourFor(score, ranges) {
    if (score === null || score === undefined) return '#8a8a8a';
    const ordered = ranges.slice().sort((a, b) => b.min - a.min);
    for (const r of ordered) if (score >= r.min) return r.color;
    return ordered[ordered.length - 1].color;
  }

  // ---------- sorting ----------
  const SORTS = {
    'Sheet order':            { get: g => g.id, desc: false },
    'Rating: high to low':    { get: g => g.score, desc: true },
    'Rating: low to high':    { get: g => g.score, desc: false },
    'Name: A to Z':           { get: g => g.name.toLowerCase(), desc: false },
    'Name: Z to A':           { get: g => g.name.toLowerCase(), desc: true },
    'Release: newest first':  { get: g => parseDate(g.release), desc: true },
    'Release: oldest first':  { get: g => parseDate(g.release), desc: false },
    'Year: newest first':     { get: g => numberIn(g.meta.Year), desc: true },
    'Year: oldest first':     { get: g => numberIn(g.meta.Year), desc: false },
  };

  // Films have no categories or platforms, but they do have the date you watched them.
  const watchedDate = g => parseDate(g.watched);
  const MOVIE_SORTS = {
    'Sheet order':           { get: g => g.id, desc: false },
    'Rating: high to low':   { get: g => g.score, desc: true },
    'Rating: low to high':   { get: g => g.score, desc: false },
    'Name: A to Z':          { get: g => g.name.toLowerCase(), desc: false },
    'Name: Z to A':          { get: g => g.name.toLowerCase(), desc: true },
    'Watched: newest first': { get: watchedDate, desc: true },
    'Watched: oldest first': { get: watchedDate, desc: false },
    'Release: newest first': { get: g => parseDate(g.release), desc: true },
    'Release: oldest first': { get: g => parseDate(g.release), desc: false },
  };

  function sortGames(games, sortName, table) {
    const sorts = table || SORTS;
    const { get, desc } = sorts[sortName] || sorts['Sheet order'];
    const have = games.filter(g => get(g) !== null && get(g) !== undefined);
    const lack = games.filter(g => get(g) === null || get(g) === undefined);   // always last
    have.sort((a, b) => {
      const x = get(a), y = get(b);
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return desc ? -c : c;
    });
    return have.concat(lack);
  }

  // ---------- grouping ----------
  const GROUPS = ['No grouping', 'Overall score', 'Genre', 'Platform', 'Year played'];
  const MOVIE_GROUPS = ['No grouping', 'Overall score', 'Genre', 'Year watched'];

  function bandLabel(i, bands) {
    const low = bands[i].min;
    if (bands.length === 1) return 'All games';
    if (i === 0) return `${formatNumber(low)} and above`;
    const higher = bands[i - 1].min;
    if (i === bands.length - 1 && low <= 0) return `Under ${formatNumber(higher)}`;
    if (Number.isInteger(low) && Number.isInteger(higher)) return `${formatNumber(low)} to ${formatNumber(higher - 1)}`;
    return `${formatNumber(low)} to under ${formatNumber(higher)}`;
  }

  function groupGames(games, mode, ranges) {
    if (!(GROUPS.includes(mode) || MOVIE_GROUPS.includes(mode)) || mode === 'No grouping' || !games.length) return [{ title: null, color: null, games }];
    if (mode === 'Overall score') {
      const bands = ranges.slice().sort((a, b) => b.min - a.min);
      const buckets = bands.map(() => []), none = [];
      for (const g of games) {
        if (g.score === null) { none.push(g); continue; }
        let placed = false;
        for (let i = 0; i < bands.length; i++) if (g.score >= bands[i].min) { buckets[i].push(g); placed = true; break; }
        if (!placed) buckets[buckets.length - 1].push(g);
      }
      const out = [];
      bands.forEach((b, i) => { if (buckets[i].length) out.push({ title: bandLabel(i, bands), color: b.color, games: buckets[i] }); });
      if (none.length) out.push({ title: 'No score yet', color: null, games: none });
      return out;
    }
    const column = { 'Genre': 'Type', 'Platform': 'Platform', 'Year played': 'Year', 'Year watched': 'Year' }[mode];
    const missing = { 'Genre': 'No genre', 'Platform': 'No platform', 'Year played': 'No year', 'Year watched': 'No date' }[mode];
    const buckets = new Map();
    for (const g of games) { const k = g.meta[column] || ''; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(g); }
    let names = [...buckets.keys()].filter(Boolean);
    if (mode === 'Year played' || mode === 'Year watched') names.sort((a, b) => (numberIn(b) || 0) - (numberIn(a) || 0));
    else names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const out = names.map(n => ({ title: n, color: null, games: buckets.get(n) }));
    if (buckets.has('')) out.push({ title: missing, color: null, games: buckets.get('') });
    return out;
  }

  // ---------- filters ----------
  const FILTERS = [['Platform', 'Platform'], ['Genre', 'Type'], ['Year', 'Year'], ['Tag', 'Tags']];
  function gameValues(game, column) {
    if (column === 'Tags') return game.tags || [];
    return game.meta[column] ? [game.meta[column]] : [];
  }

  // ---------- rankings ----------
  function rankLines(game, all) {
    if (game.score === null) return [];
    function rankIn(pool) {
      const scored = pool.filter(g => g.score !== null);
      const better = scored.filter(g => g.score > game.score).length;
      const tied = scored.filter(g => g.score === game.score).length > 1;
      return ['#' + (better + 1) + (tied ? '=' : ''), scored.length];
    }
    let [rank, total] = rankIn(all);
    const lines = [[rank, `of ${total} overall`]];
    const genre = game.meta.Type;
    if (genre) {
      [rank, total] = rankIn(all.filter(g => (g.meta.Type || '').toLowerCase() === genre.toLowerCase()));
      lines.push([rank, `of ${total} in ${genre}`]);
    }
    return lines;
  }

  // ---------- compare ----------
  function comparePool(game, all, mode) {
    const field = { genre: 'Type', platform: 'Platform' }[mode];
    const wanted = field ? (game.meta[field] || '').trim().toLowerCase() : '';
    return all.filter(g => g.id !== game.id && (!wanted || (g.meta[field] || '').trim().toLowerCase() === wanted))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  // ---------- adding a game ----------
  function weightsFor(genre, table, categories) {
    const wanted = (genre || '').trim().toLowerCase();
    let chosen = null;
    for (const [name, w] of Object.entries(table)) if (name.trim().toLowerCase() === wanted) { chosen = w; break; }
    if (!chosen) chosen = table.Other || DEFAULTS.genreWeightsV2.Other;
    const out = {};
    for (const c of categories) out[c] = Number(chosen[c] || 0);
    return out;
  }

  function overallPercent(scores, weights) {
    let total = 0;
    for (const [cat, s] of Object.entries(scores)) total += (weights[cat] || 0) * s;
    return total / MAX_CATEGORY * 100;
  }

  function buildAddPayload(o) {
    const fields = { Game: o.name, Year: o.year, Type: o.genre, Platform: o.platform };
    const dates = [];
    if (o.isoDate) { fields.Release = o.isoDate; dates.push('Release'); }
    Object.assign(fields, o.scores);
    fields.Review = o.review;
    const tags = splitTags(o.tags).join(', ');
    if (tags) fields.Tags = tags;
    return { key: o.key, fields, dates, weights: o.weights, max_score: MAX_CATEGORY };
  }

  // ---------- picture file names ----------
  function safeFileName(name) { return String(name || '').replace(/[\\/:*?"<>|]/g, '').trim(); }

  // ---------- friends ----------
  const DAY_MS = 86400000;
  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  function isoToUtc(iso) { const m = ISO.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
  function todayIso(now) {
    const d = now || new Date(), pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function daysBetween(fromIso, toIso) {
    const a = isoToUtc(fromIso), b = isoToUtc(toIso);
    return a === null || b === null ? null : Math.round((b - a) / DAY_MS);
  }
  function formatIso(iso) { const m = ISO.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }

  // The most recent meetup that has already happened.
  function lastMeetup(friend, today) {
    const past = (friend.meetups || []).map(m => m.date).filter(d => ISO.test(d) && d <= today);
    return past.length ? past.sort().pop() : null;
  }
  function friendDays(friend, today) { const last = lastMeetup(friend, today); return last ? daysBetween(last, today) : null; }
  // green until greenDays, amber until amberDays, red after that
  function friendColourKey(days, green, amber) {
    if (days === null) return 'none';
    return days <= green ? 'green' : days <= amber ? 'amber' : 'red';
  }
  function daysLabel(days) { return days === null ? '--' : days === 0 ? 'Today' : days === 1 ? '1 Day' : days + ' Days'; }

  // Longest time since you met first; friends you haven't met yet go last.
  function sortFriends(friends, today) {
    return friends.slice().sort((a, b) => {
      const da = friendDays(a, today), db = friendDays(b, today);
      if (da === null && db === null) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }
  function yearCounts(meetups, today) {
    const counts = {};
    for (const m of meetups) if (ISO.test(m.date) && (!today || m.date <= today)) counts[m.date.slice(0, 4)] = (counts[m.date.slice(0, 4)] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[0] - a[0]);
  }
  function gaps(meetups, today) {
    const dates = meetups.map(m => m.date).filter(d => ISO.test(d) && (!today || d <= today)).sort();
    const out = [];
    for (let i = 1; i < dates.length; i++) out.push(daysBetween(dates[i - 1], dates[i]));
    return out;
  }
  const averageGap = (meetups, today) => { const g = gaps(meetups, today); return g.length ? Math.round(g.reduce((a, b) => a + b, 0) / g.length) : null; };
  const longestGap = (meetups, today) => { const g = gaps(meetups, today); return g.length ? Math.max(...g) : null; };

  // What the helper sends back -> friends with their meetups attached (newest first)
  function normalizeFriends(raw) {
    const byFriend = {};
    for (const m of (raw.meetups || [])) (byFriend[m.friendId] = byFriend[m.friendId] || []).push({ id: m.id, date: m.date, note: m.note || '' });
    return (raw.friends || []).map(f => ({
      id: f.id, name: f.name, greenDays: f.greenDays, amberDays: f.amberDays,
      nextPlanned: f.nextPlanned || '', photo: f.photo || '',
      meetups: (byFriend[f.id] || []).sort((a, b) => b.date.localeCompare(a.date)),
    }));
  }

  // The forecast maths: value after each month. Deposits go in at the end of the month.
  function projectScenario(start, growth, deposit, months) {
    const out = [start];
    for (let i = 1; i <= (months === undefined ? 240 : months); i++) out.push(out[i - 1] * (1 + growth) + deposit);
    return out;
  }

  // ---------- Christmas food ----------
  // 'spring rolls' + 'https://shop/search?q={q}' -> 'https://shop/search?q=spring%20rolls'   ({q+} puts + between words)
  function buildStoreUrl(template, query) {
    const words = String(query || '').trim().replace(/\s+/g, ' ');
    return String(template || '').split('{q+}').join(encodeURIComponent(words).replace(/%20/g, '+')).split('{q}').join(encodeURIComponent(words));
  }

  const XMAS_GROUPS = [
    ['Party food', ['spring rolls', 'sausage rolls', 'mini quiches', 'samosas', 'onion bhajis', 'prawn toast', 'mozzarella sticks', 'garlic bread', 'party platter', 'dips', 'nibbles']],
    ['Christmas dinner', ['turkey', 'turkey crown', 'gammon', 'beef joint', 'nut roast', 'salmon', 'christmas dinner for one']],
    ['Trimmings', ['pigs in blankets', 'stuffing', 'cranberry sauce', 'brussels sprouts', 'roast potatoes', 'red cabbage', 'gravy', 'bread sauce']],
    ['Sweet treats', ['mince pies', 'christmas pudding', 'christmas cake', 'yule log', 'stollen', 'trifle', 'panettone', 'chocolates', 'christmas biscuits']],
    ['Cheese & deli', ['cheese board', 'brie', 'stilton', 'pate', 'smoked salmon', 'cured meats', 'cheese biscuits', 'chutney']],
  ];

  // Price notes: [{ id, item, store, size, price, deal, date }] grouped by item, cheapest per pack first.
  function groupPriceNotes(notes) {
    const groups = new Map();
    for (const n of notes) {
      const key = String(n.item).trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { item: String(n.item).trim(), entries: [] });
      groups.get(key).entries.push(n);
    }
    const out = [...groups.values()];
    out.forEach(g => g.entries.sort((a, b) => a.price - b.price || a.store.localeCompare(b.store)));
    out.forEach(g => { g.cheapest = g.entries[0].price; });
    return out.sort((a, b) => a.item.toLowerCase().localeCompare(b.item.toLowerCase()));
  }

  root.GR = { buildStoreUrl, XMAS_GROUPS, groupPriceNotes, projectScenario, MOVIE_SORTS, MOVIE_GROUPS, parseFilms, buildAddFilmPayload, splitFilmTitle, MAX_CATEGORY, isoToUtc, todayIso, daysBetween, formatIso, lastMeetup, friendDays, friendColourKey, daysLabel,
    sortFriends, yearCounts, averageGap, longestGap, normalizeFriends, DEFAULTS, formatNumber, parseScore, numberIn, splitTags, parseDate, toIsoDate,
    parseCsv, parseSheet, sheetCsvUrl, colourFor, SORTS, sortGames, GROUPS, bandLabel, groupGames, FILTERS,
    gameValues, rankLines, comparePool, weightsFor, overallPercent, buildAddPayload, safeFileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GR;
})(typeof window !== 'undefined' ? window : globalThis);
