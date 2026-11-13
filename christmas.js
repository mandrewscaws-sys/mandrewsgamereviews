/* Christmas Food (web) - type what you're after and get one tap per supermarket.
   Links open each shop's own website, so prices are always the shop's current ones.
   You can note prices and deals as you spot them in store; those notes stay on this device. */
(function () {
  'use strict';
  const A = window.GRApp, G = window.GR, el = A.el;
  const S = () => A.settings();
  const box = () => document.getElementById('christmas');
  const NOTES_KEY = 'gr_xmas_notes_v1';
  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  let notes = [];
  try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch (e) { notes = []; }
  const saveNotes = () => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) { A.toast("Couldn't save - this device's storage is full."); } };

  let query = '';
  let addChristmas = false;                         // add the word "christmas" to the search?
  let input;

  const searchText = () => (addChristmas && query && !/christmas/i.test(query) ? 'christmas ' : '') + query;
  const stores = () => S().xmasStores || [];
  const storeColour = name => (stores().find(s => s.name === name) || {}).color || '#8fa0a6';
  const isGoogle = url => /google\.com\/search/.test(url);
  const when = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // ------------------------------------------------------------------ the screen
  function render() {
    const root = box();
    root.replaceChildren();

    input = el('input', { type: 'search', placeholder: 'What are you after? e.g. spring rolls', value: query, enterkeyhint: 'search', autocomplete: 'off',
      onkeydown: e => { if (e.key === 'Enter') runSearch(); } });
    const withXmas = el('input', { type: 'checkbox', onchange: e => { addChristmas = e.target.checked; render(); } });
    withXmas.checked = addChristmas;
    root.append(el('div', { class: 'xm-search' },
      el('div', { class: 'xm-row' }, input, el('button', { class: 'primary', onclick: runSearch }, 'Search')),
      el('label', { class: 'xm-check' }, withXmas, ' add \u201Cchristmas\u201D to my search')));

    if (query.trim()) root.append(results());
    root.append(browse(), notesView(), el('div', { class: 'xm-foot' },
      'These buttons open each shop\u2019s own website in a new tab, so you always see their current prices and offers. ' +
      'Online prices can differ a little from what\u2019s on the shelf, and stock in your store can\u2019t be seen from here. ' +
      (stores().some(s => isGoogle(s.url)) ? 'Shops marked \u201Cvia Google\u201D open a Google search of that shop\u2019s site; you can change that in Settings.' : '')));
  }

  function runSearch() {
    query = input.value.trim();
    render();
    if (query) document.getElementById('xm-results') && document.getElementById('xm-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function results() {
    const text = searchText();
    const compare = S().xmasCompareUrl
      ? el('a', { class: 'xm-compare', href: G.buildStoreUrl(S().xmasCompareUrl, text), target: '_blank', rel: 'noopener noreferrer' }, 'Compare prices on Trolley \u2197') : null;
    return el('div', { class: 'xm-results', id: 'xm-results' },
      el('h3', {}, `\u201C${text}\u201D in the shops`), compare,
      stores().map(s => el('div', { class: 'xm-store' },
        el('i', { style: { background: s.color || '#8fa0a6' } }),
        el('div', { class: 'xm-name' }, el('b', {}, s.name), el('small', {}, [s.card ? 'Check your ' + s.card + ' price' : 'No card, just the shelf price', isGoogle(s.url) ? 'via Google' : ''].filter(Boolean).join('  \u00B7  '))),
        el('a', { class: 'xm-open', href: G.buildStoreUrl(s.url, text), target: '_blank', rel: 'noopener noreferrer' }, 'Open \u2197'),
        el('button', { title: 'Note a price', onclick: () => openNote(query, s.name) }, '\uFF0B price'))));
  }

  function browse() {
    return el('div', { class: 'xm-browse' }, el('h3', {}, 'Browse Christmas food'),
      G.XMAS_GROUPS.map(([title, terms]) => el('div', { class: 'xm-group' }, el('div', { class: 'xm-gt' }, title),
        el('div', { class: 'xm-chips' }, terms.map(t => el('button', { class: 'xm-chip', onclick: () => { query = t; render(); window.scrollTo(0, 0); } }, t))))));
  }

  // ------------------------------------------------------------------ price notes
  function notesView() {
    const groups = G.groupPriceNotes(notes);
    const header = el('div', { class: 'xm-notehead' }, el('h3', {}, 'My price notes'),
      notes.length ? el('div', {}, el('button', { onclick: copyText }, 'Copy as text'), el('button', { onclick: () => { if (confirm('Delete every price note?')) { notes = []; saveNotes(); render(); } } }, 'Clear')) : null);
    if (!groups.length) return el('div', { class: 'xm-notes' }, header, el('div', { class: 'meta' }, 'Nothing yet. After you search, tap \u201C\uFF0B price\u201D next to a shop to note what you saw, then you can compare per pack here. Notes stay on this device.'));
    return el('div', { class: 'xm-notes' }, header, groups.map(g => el('div', { class: 'fin-card' },
      el('div', { class: 'xm-ghead' }, el('b', {}, g.item), el('button', { onclick: () => openNote(g.item, '') }, '\uFF0B')),
      g.entries.map(n => el('div', { class: 'xm-entry' + (n.price === g.cheapest && g.entries.length > 1 ? ' best' : '') },
        el('i', { style: { background: storeColour(n.store) } }),
        el('div', { class: 'xm-what' }, el('b', {}, n.store), el('small', {}, [n.size, n.deal, when(n.date)].filter(Boolean).join('  \u00B7  '))),
        el('span', { class: 'xm-price' }, gbp.format(n.price) + (n.price === g.cheapest && g.entries.length > 1 ? ' \u2605' : '')),
        el('button', { 'aria-label': 'Delete this note', onclick: () => { notes = notes.filter(x => x.id !== n.id); saveNotes(); render(); } }, '\u2715'))),
      g.entries.length > 1 ? el('div', { class: 'meta' }, 'Cheapest per pack: ' + g.entries[0].store + ' (\u2605). Check pack sizes before you decide.') : null)));
  }

  function copyText() {
    const text = G.groupPriceNotes(notes).map(g => g.item + '\n' + g.entries.map(n => `  ${n.store}: ${gbp.format(n.price)}${n.size ? ' - ' + n.size : ''}${n.deal ? ' - ' + n.deal : ''}`).join('\n')).join('\n\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => A.toast('Copied'), () => { window.prompt('Copy this:', text); });
  }

  function openNote(item, store) {
    A.openOverlay(panel => {
      const itemIn = el('input', { type: 'text', value: item || '', placeholder: 'e.g. Spring rolls', maxlength: 60 });
      const storeIn = el('select', {}, el('option', { value: '' }, 'Choose a shop...'), stores().map(s => el('option', { value: s.name }, s.name)));
      storeIn.value = store || '';
      const size = el('input', { type: 'text', placeholder: 'e.g. 20 pack, 400g', maxlength: 40 });
      const price = el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0.00' });
      const deal = el('input', { type: 'text', placeholder: 'Clubcard price, 2 for \u00A34, was \u00A33...', maxlength: 60 });
      const error = el('div', { class: 'error' });
      const row = (label, node, hint) => [el('label', {}, label), node, hint ? el('div', { class: 'hint' }, hint) : null];
      panel.append(el('div', { class: 'nav' }, el('b', {}, 'Note a price'), el('div', { class: 'mid' }), A.closeButton()),
        el('div', { class: 'form' }, row('Item', itemIn), row('Shop', storeIn), row('Pack size', size), row('Price per pack (\u00A3)', price, 'The price for one pack, as on the shelf (with your card if that\u2019s the price you\u2019d pay).'), row('Deal or note', deal)),
        error, el('div', { class: 'footer' }, el('button', { onclick: A.closeOverlay }, 'Cancel'),
          el('button', { class: 'primary', onclick: () => {
            const value = Number(price.value);
            if (!itemIn.value.trim()) { error.textContent = 'What is the item?'; return; }
            if (!storeIn.value) { error.textContent = 'Choose a shop.'; return; }
            if (price.value === '' || !isFinite(value) || value < 0) { error.textContent = 'Type the price, like 2.50'; return; }
            notes.push({ id: String(Date.now()) + Math.random().toString(36).slice(2, 6), item: itemIn.value.trim(), store: storeIn.value, size: size.value.trim(), price: Math.round(value * 100) / 100, deal: deal.value.trim(), date: G.todayIso() });
            saveNotes(); A.closeOverlay(); A.toast('Saved'); render();
          } }, 'Save')));
      setTimeout(() => (itemIn.value ? price : itemIn).focus(), 50);
    }, 'editor');
  }

  function onShow() { render(); }
  window.Christmas = { onShow, rerender: render };
})();
