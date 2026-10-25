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
    const t = String(text || '').trim();
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
    const t = String(text || '').trim();
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

  // The address the app downloads the sheet from.
  function sheetCsvUrl(s) {
    const url = (s.sheetUrl || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//.test(url)) return url;                  // a file next to the app (testing)
    if (/\/pub\?|output=csv/.test(url)) return url;             // a "Publish to web" link
    const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(url);
    if (!m) return null;
    let out = `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&headers=1`;
    const gid = /[#&?]gid=(\d+)/.exec(url);
    if (s.sheetTab) out += '&sheet=' + encodeURIComponent(s.sheetTab);
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

  function sortGames(games, sortName) {
    const { get, desc } = SORTS[sortName] || SORTS['Sheet order'];
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
    if (!GROUPS.includes(mode) || mode === 'No grouping' || !games.length) return [{ title: null, color: null, games }];
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
    const column = { 'Genre': 'Type', 'Platform': 'Platform', 'Year played': 'Year' }[mode];
    const missing = { 'Genre': 'No genre', 'Platform': 'No platform', 'Year played': 'No year' }[mode];
    const buckets = new Map();
    for (const g of games) { const k = g.meta[column] || ''; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(g); }
    let names = [...buckets.keys()].filter(Boolean);
    if (mode === 'Year played') names.sort((a, b) => (numberIn(b) || 0) - (numberIn(a) || 0));
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

  root.GR = { MAX_CATEGORY, DEFAULTS, formatNumber, parseScore, numberIn, splitTags, parseDate, toIsoDate,
    parseCsv, parseSheet, sheetCsvUrl, colourFor, SORTS, sortGames, GROUPS, bandLabel, groupGames, FILTERS,
    gameValues, rankLines, comparePool, weightsFor, overallPercent, buildAddPayload, safeFileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GR;
})(typeof window !== 'undefined' ? window : globalThis);
