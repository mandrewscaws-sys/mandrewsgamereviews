/* Friends (web) - the friend meetup tracker. Your friends live in a private Google
   spreadsheet and this page talks to it through the Friends helper script. */
(function () {
  'use strict';
  const A = window.GRApp, G = window.GR, el = A.el;
  const CACHE = 'gr_friends_cache_v2';

  let friends = [];            // [{ id, name, greenDays, amberDays, nextPlanned, photo, meetups: [{ id, date, note }] }]
  let loaded = false;          // true once we have real data (saved or fresh)
  let current = null;          // the friend page that is open: { panel, id }

  const S = () => A.settings();
  const today = () => G.todayIso();
  const find = id => friends.find(f => f.id === id);
  const configured = () => !!(S().friendsUrl && S().friendsKey);
  const hhmm = () => new Date().toTimeString().slice(0, 5);

  // ------------------------------------------------------------------ talking to the helper
  async function call(action, data) {
    if (!configured()) return { ok: false, error: 'Set up the Friends helper in Settings first.' };
    try {
      const r = await fetch(S().friendsUrl, { method: 'POST', body: JSON.stringify(Object.assign({ key: S().friendsKey, action }, data || {})) });
      const text = await r.text();
      try { return JSON.parse(text); }
      catch (e) { return { ok: false, error: 'The helper did not reply properly. Check it is deployed with access set to "Anyone".' }; }
    } catch (e) {
      return { ok: false, error: "couldn't reach the helper (are you online?)" };
    }
  }

  function saveCache() { try { localStorage.setItem(CACHE, JSON.stringify(friends)); } catch (e) { /* too big - fine */ } }
  function loadCache() {
    try { const saved = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (Array.isArray(saved)) { friends = saved; loaded = true; } } catch (e) { /* ignore */ }
  }

  async function refresh(manual) {
    if (!configured()) { render(); return; }
    A.setStatus('Refreshing...', 'friends');
    const r = await call('list');
    if (r.ok) {
      friends = G.normalizeFriends(r); loaded = true; saveCache();
      A.setStatus('Updated ' + hhmm(), 'friends');
      if (manual) A.toast('Up to date');
    } else {
      A.setStatus(loaded ? 'Offline - showing saved data' : "Couldn't load: " + r.error, 'friends');
      if (manual) A.toast("Couldn't refresh: " + r.error);
    }
    render();
    if (r.ok && current && document.body.contains(current.panel) && !current.panel.contains(document.activeElement)) renderFriend(current.panel, current.id);
  }

  // ------------------------------------------------------------------ the list
  function photoEl(f, cls) {
    if (f.photo) return el('img', { class: cls, src: f.photo, alt: '' });
    return el('div', { class: cls + ' nophoto' }, (f.name || '?').trim().charAt(0).toUpperCase());
  }

  function statusOf(f) {
    const days = G.friendDays(f, today());
    const key = G.friendColourKey(days, f.greenDays, f.amberDays);
    return { days, last: G.lastMeetup(f, today()), colour: key === 'none' ? '#cbd5e1' : S().friendColours[key] };
  }

  function row(f) {
    const { days, last, colour } = statusOf(f);
    return el('div', { class: 'fr-row', tabindex: '0', role: 'button', onclick: () => openFriend(f.id), onkeydown: e => { if (e.key === 'Enter') openFriend(f.id); } },
      photoEl(f, 'fr-photo'),
      el('div', { class: 'fr-name' }, f.name, f.nextPlanned ? el('small', {}, 'Next: ' + G.formatIso(f.nextPlanned)) : null),
      el('div', { class: 'fr-date' }, last ? G.formatIso(last) : 'Not met yet'),
      el('div', { class: 'fr-days', style: { color: colour } }, G.daysLabel(days)));
  }

  function render() {
    const box = document.getElementById('friends');
    box.replaceChildren();
    if (!configured()) {
      box.append(el('div', { class: 'fr-message' }, el('b', {}, 'Set up your friends list'),
        el('p', {}, 'Your friends are stored in a private Google spreadsheet. Follow the setup steps, then paste the helper address and secret key into Settings.'),
        el('button', { class: 'primary', onclick: A.openSettings }, 'Open Settings')));
      return;
    }
    if (!friends.length) {
      box.append(el('div', { class: 'fr-message' }, el('b', {}, loaded ? 'No friends yet' : 'Loading your friends...'),
        loaded ? el('p', {}, 'Press "＋ Add friend" at the top to add the first one.') : null));
      return;
    }
    box.append(el('div', { class: 'fr-head' }, el('span'), el('span', {}, 'Name'), el('span', {}, 'Last Meetup'), el('span', {}, 'Days Ago')),
      ...G.sortFriends(friends, today()).map(row));
  }

  // ------------------------------------------------------------------ a friend's page
  function openFriend(id) {
    A.openOverlay((panel, o) => {
      current = { panel, id };
      o.onClose = () => { if (current && current.panel === panel) current = null; };
      renderFriend(panel, id);
    }, 'friend');
  }

  function renderFriend(panel, id) {
    const f = find(id);
    if (!f) { A.closeOverlay(); return; }
    const keepScroll = panel.scrollTop;
    const { days, last, colour } = statusOf(f);
    panel.replaceChildren();
    panel.append(el('div', { class: 'nav' }, el('b', {}, f.name), el('div', { class: 'mid' }),
      el('button', { onclick: () => openEditor(f) }, 'Edit'), A.closeButton()));

    panel.append(el('div', { class: 'fr-hero' }, photoEl(f, 'fr-big'),
      el('div', {}, el('div', { class: 'bigscore', style: { color: colour } }, G.daysLabel(days)),
        el('div', { class: 'meta' }, last ? 'since you last met on ' + G.formatIso(last) : 'No meetups yet'),
        el('div', { class: 'meta' }, f.nextPlanned ? 'Next planned: ' + G.formatIso(f.nextPlanned) + nextIn(f.nextPlanned) : ''))));

    // add a meetup
    const date = el('input', { type: 'date', value: today() });
    const note = el('input', { type: 'text', placeholder: 'What did you do? (optional)', maxlength: 120 });
    const add = el('button', { class: 'primary', onclick: () => { if (!date.value) { A.toast('Choose a date first.'); return; } addMeetup(f, date.value, note.value.trim(), panel); } }, 'Add meetup');
    panel.append(el('div', { class: 'section' }, el('h3', { style: { marginTop: 0 } }, 'Add a meetup'),
      el('div', { class: 'fr-form' }, date, note, add)));

    // next planned
    const next = el('input', { type: 'date', value: f.nextPlanned || '' });
    panel.append(el('div', { class: 'section' }, el('h3', { style: { marginTop: 0 } }, 'Next planned meetup'),
      el('div', { class: 'fr-form' }, next,
        el('button', { onclick: () => setNext(f, next.value, panel) }, 'Save'),
        el('button', { onclick: () => setNext(f, '', panel) }, 'Clear'))));

    // numbers
    const past = f.meetups.filter(m => m.date <= today());
    const years = G.yearCounts(f.meetups, today());
    const avg = G.averageGap(f.meetups, today()), longest = G.longestGap(f.meetups, today());
    panel.append(el('div', { class: 'section' }, el('h3', { style: { marginTop: 0 } }, 'Numbers'),
      el('div', { class: 'fr-stats' },
        stat(past.length, 'meetups in total'),
        stat((years.find(y => y[0] === today().slice(0, 4)) || [0, 0])[1], 'so far this year'),
        stat(avg === null ? '--' : avg, 'days between meetups, on average'),
        stat(longest === null ? '--' : longest, 'days, the longest gap')),
      years.length ? el('div', { class: 'chips', style: { marginTop: '10px' } }, years.map(([y, n]) => el('span', { class: 'chip' }, `${y}: ${n}`))) : null));

    // history
    panel.append(el('div', { class: 'section' }, el('h3', { style: { marginTop: 0 } }, 'History'),
      f.meetups.length ? el('div', {}, f.meetups.map(m => el('div', { class: 'fr-hist' },
        el('span', { class: 'when' }, G.formatIso(m.date) + (m.date > today() ? ' (upcoming)' : '')),
        el('span', { class: 'what' }, m.note),
        el('button', { 'aria-label': 'Delete this meetup', onclick: () => { if (confirm('Delete the meetup on ' + G.formatIso(m.date) + '?')) deleteMeetup(f, m, panel); } }, '\u2715'))))
        : el('div', { class: 'meta' }, 'Nothing yet. Add your first meetup above.')));
    panel.scrollTop = keepScroll;
  }

  const stat = (value, label) => el('div', { class: 'fr-stat' }, el('b', {}, String(value)), el('span', {}, label));
  function nextIn(iso) {
    const d = G.daysBetween(today(), iso);
    return d === null ? '' : d === 0 ? ' (today)' : d === 1 ? ' (tomorrow)' : d > 1 ? ` (in ${d} days)` : ` (${-d} days ago)`;
  }
  const refreshViews = panel => { render(); if (panel && document.body.contains(panel)) renderFriend(panel, current ? current.id : null); };

  // These update the screen at once, then tell the spreadsheet. If that fails they undo themselves.
  async function addMeetup(f, date, note, panel) {
    const item = { id: 'tmp' + Date.now(), date, note };
    f.meetups.push(item); f.meetups.sort((a, b) => b.date.localeCompare(a.date));
    saveCache(); refreshViews(panel); A.toast('Meetup added');
    const r = await call('addMeetup', { friendId: f.id, date, note });
    if (r.ok) { item.id = r.id; saveCache(); }
    else { f.meetups = f.meetups.filter(m => m !== item); saveCache(); refreshViews(panel); A.toast("Couldn't save that meetup: " + r.error); }
  }

  async function deleteMeetup(f, item, panel) {
    f.meetups = f.meetups.filter(m => m !== item); saveCache(); refreshViews(panel);
    const r = await call('deleteMeetup', { id: item.id });
    if (!r.ok) { f.meetups.push(item); f.meetups.sort((a, b) => b.date.localeCompare(a.date)); saveCache(); refreshViews(panel); A.toast("Couldn't delete it: " + r.error); }
  }

  async function setNext(f, iso, panel) {
    const before = f.nextPlanned;
    f.nextPlanned = iso; saveCache(); refreshViews(panel);
    const r = await call('saveFriend', { id: f.id, name: f.name, greenDays: f.greenDays, amberDays: f.amberDays, nextPlanned: iso });
    if (r.ok) A.toast(iso ? 'Next meetup saved' : 'Cleared');
    else { f.nextPlanned = before; saveCache(); refreshViews(panel); A.toast("Couldn't save it: " + r.error); }
  }

  // ------------------------------------------------------------------ add / edit a friend
  // Shrinks a picked photo so it fits in the spreadsheet. Pictures with see-through parts
  // (cut-outs) keep their shape; ordinary photos are cropped square.
  async function processPhoto(file) {
    const bmp = await createImageBitmap(file);
    const max = 240;
    const probe = document.createElement('canvas');
    probe.width = Math.min(bmp.width, 64); probe.height = Math.min(bmp.height, 64);
    const px = probe.getContext('2d', { willReadFrequently: true });
    px.drawImage(bmp, 0, 0, probe.width, probe.height);
    const data = px.getImageData(0, 0, probe.width, probe.height).data;
    let cutout = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { cutout = true; break; }
    const c = document.createElement('canvas'), x = c.getContext('2d');
    if (cutout) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      x.drawImage(bmp, 0, 0, c.width, c.height);
    } else {
      const side = Math.min(bmp.width, bmp.height);
      c.width = c.height = Math.min(side, max);
      x.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, c.width, c.height);
    }
    const encode = q => {
      const webp = c.toDataURL('image/webp', q);
      if (webp.startsWith('data:image/webp')) return webp;
      return cutout ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
    };
    let q = 0.8, url = encode(q);
    while (url.length > 60000 && q > 0.35) { q -= 0.1; url = encode(q); }
    if (url.length > 90000) throw new Error('That picture is too detailed to store. Try a smaller one.');
    return url;
  }

  function addFriend() {
    if (!configured()) { A.toast('Set up the Friends helper in Settings first.'); A.openSettings(); return; }
    openEditor(null);
  }

  function openEditor(f) {
    const adding = !f;
    A.openOverlay((panel, o) => {
      const text = (value, attrs) => el('input', Object.assign({ type: 'text', value: value || '' }, attrs));
      let photo;                                   // undefined = leave as it is, '' = remove, text = new picture
      const preview = el('div', { class: 'fr-preview' });
      const showPhoto = () => {
        const shown = photo === undefined ? (f ? f.photo : '') : photo;
        preview.replaceChildren(shown ? el('img', { src: shown, alt: '' }) : el('div', { class: 'nophoto' }, '?'));
      };
      showPhoto();
      const file = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async e => {
        const picked = e.target.files[0]; if (!picked) return;
        try { photo = await processPhoto(picked); showPhoto(); } catch (err) { error.textContent = err.message || "Couldn't read that picture."; }
        file.value = '';
      } });
      const name = text(f && f.name, { placeholder: 'Their name', maxlength: 60 });
      const green = el('input', { type: 'number', min: 0, step: 1, value: f ? f.greenDays : S().defaultGreenDays });
      const amber = el('input', { type: 'number', min: 0, step: 1, value: f ? f.amberDays : S().defaultAmberDays });
      const lastDate = el('input', { type: 'date' }), lastNote = text('', { placeholder: 'What did you do? (optional)', maxlength: 120 });
      const next = el('input', { type: 'date', value: f ? f.nextPlanned : '' });
      const error = el('div', { class: 'error' });
      const save = el('button', { class: 'primary', onclick: submit }, adding ? 'Add friend' : 'Save');
      const swatch = key => el('span', { class: 'swatch', style: { background: S().friendColours[key] } });
      const row = (label, node, hint) => [el('label', {}, label), node, hint ? el('div', { class: 'hint' }, hint) : null];

      panel.append(el('div', { class: 'nav' }, el('b', {}, adding ? 'Add a friend' : 'Edit ' + f.name), el('div', { class: 'mid' }), A.closeButton()),
        el('div', { class: 'form' },
          row('Name', name),
          row('Picture', el('div', { class: 'fr-pick' }, preview,
            el('div', {}, el('button', { onclick: () => file.click() }, 'Choose picture'),
              el('button', { onclick: () => { photo = ''; showPhoto(); } }, 'Remove'), file)),
            'Photos are cropped square; pictures with a see-through background (cut-outs) keep their shape.'),
          adding ? row('Last met', lastDate, 'Optional - the date you last saw them.') : null,
          adding ? row('What you did', lastNote) : null,
          row('Next planned', next, 'Optional.'),
          el('div', { class: 'sethead' }, 'Colours for days since you met'),
          row([swatch('green'), ' Green until'], el('div', {}, green, ' days')),
          row([swatch('amber'), ' Amber until'], el('div', {}, amber, ' days'), 'After that the days turn red. Different for each friend.')),
        error, el('div', { class: 'footer' },
          adding ? null : el('button', { onclick: remove, style: { marginRight: 'auto', color: '#ff7b7b' } }, 'Delete friend'),
          el('button', { onclick: A.closeOverlay }, 'Cancel'), save));

      async function submit() {
        error.textContent = '';
        const fail = t => { error.textContent = t; };
        const n = name.value.trim(); if (!n) return fail('Please enter a name.');
        const g = Number(green.value), a = Number(amber.value);
        if (!Number.isInteger(g) || !Number.isInteger(a) || g < 0 || a < 0) return fail('Green and amber should be whole numbers of days.');
        if (a < g) return fail('Amber should be the same as green or more.');
        save.disabled = true; error.style.color = 'var(--dim)'; error.textContent = 'Saving...';
        const payload = { name: n, greenDays: g, amberDays: a, nextPlanned: next.value };
        if (f) payload.id = f.id;
        if (photo !== undefined) payload.photo = photo;
        if (adding && lastDate.value) payload.firstMeetup = { date: lastDate.value, note: lastNote.value.trim() };
        const r = await call('saveFriend', payload);
        error.style.color = '';
        if (!r.ok) { save.disabled = false; fail("Couldn't save: " + r.error); return; }
        A.closeOverlay();
        A.toast(adding ? 'Friend added' : 'Saved');
        refresh(false);
      }

      async function remove() {
        if (!confirm(`Delete ${f.name} and all their meetups? This can't be undone.`)) return;
        const r = await call('deleteFriend', { id: f.id });
        if (!r.ok) { error.textContent = "Couldn't delete: " + r.error; return; }
        A.closeAll(); A.toast('Deleted'); refresh(false);
      }
    }, 'editor');
  }

  // ------------------------------------------------------------------ hooks for the main app
  function onShow() {
    A.applyBackgroundTo(document.getElementById('friends'), S().friendsBackground, S().friendsBackgroundMirror);
    render();
    refresh(false);
  }

  loadCache();
  window.Friends = { onShow, refresh, addFriend, rerender: render };
})();
