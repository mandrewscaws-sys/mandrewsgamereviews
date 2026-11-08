/* Finances (web) - your private Finance spreadsheet, behind a PIN.
   Nothing from here is ever saved on the phone: the data and the PIN only live in memory
   while the area is unlocked, and it locks itself when you leave, switch app or go idle. */
(function () {
  'use strict';
  const A = window.GRApp, G = window.GR, el = A.el;
  const S = () => A.settings();
  const box = () => document.getElementById('finance');

  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const money = n => n === null || n === undefined ? '--' : gbp.format(n);
  const short = n => { const a = Math.abs(n), sign = n < 0 ? '-' : ''; return a >= 1e6 ? `${sign}£${(a / 1e6).toFixed(1)}m` : a >= 1e3 ? `${sign}£${Math.round(a / 1e3)}k` : `${sign}£${Math.round(a)}`; };
  const monthName = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthShort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' });

  let pin = null;          // only ever in memory
  let data = null;         // only ever in memory
  let tab = 'spending';
  let month = null;
  let draft = [];          // the five scenarios being edited on the Forecast tab
  let idleTimer = null;
  let overlayOpen = false;
  let lockKey = null;      // the key handler for the PIN screen, if it is showing

  const configured = () => !!(S().financeUrl && S().financeKey);

  // ------------------------------------------------------------------ talking to the helper
  async function call(action, extra, pinToUse) {
    if (!configured()) return { ok: false, error: 'Set up the Finance helper in Settings first.' };
    try {
      const r = await fetch(S().financeUrl, { method: 'POST',
        body: JSON.stringify(Object.assign({ key: S().financeKey, pin: pinToUse === undefined ? pin : pinToUse, action }, extra || {})) });
      const text = await r.text();
      try { return JSON.parse(text); }
      catch (e) { return { ok: false, error: 'The helper did not reply properly. Check it is deployed with access set to "Anyone".' }; }
    } catch (e) {
      return { ok: false, error: "couldn't reach the helper (are you online?)" };
    }
  }

  // ------------------------------------------------------------------ locking
  function lock(message) {
    pin = null; data = null; draft = [];
    clearTimeout(idleTimer); idleTimer = null;
    if (overlayOpen) A.closeAll();
    if (!configured()) { renderSetup(); return; }
    renderLock(message);
  }
  function resetIdle() {
    if (!pin) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => lock('Locked - nothing was touched for a while.'), (S().financeIdleSeconds || 120) * 1000);
  }
  for (const type of ['pointerdown', 'keydown', 'input']) document.addEventListener(type, resetIdle, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && (pin || data)) lock(); });
  document.addEventListener('keydown', e => { if (lockKey && !box().hidden) lockKey(e); });

  function renderSetup() {
    lockKey = null;
    box().replaceChildren(el('div', { class: 'fr-message' }, el('b', {}, 'Set up your finances'),
      el('p', {}, 'Your finances stay in a private Google spreadsheet. Follow the setup steps, then paste the helper address and secret key into Settings.'),
      el('button', { class: 'primary', onclick: A.openSettings }, 'Open Settings')));
  }

  function renderLock(message) {
    const length = S().financePinLength || 4;
    let typed = '', busy = false;
    const dots = el('div', { class: 'pindots' });
    const note = el('div', { class: 'pinmsg' }, message || '');
    const draw = () => dots.replaceChildren(...Array.from({ length }, (_, i) => el('span', { class: i < typed.length ? 'on' : '' })));
    draw();

    async function press(key) {
      if (busy) return;
      if (key === 'back') typed = typed.slice(0, -1);
      else if (typed.length < length) typed += key;
      draw();
      if (typed.length < length) return;
      busy = true; note.textContent = 'Checking...';
      const attempt = typed;
      const result = await call('list', null, attempt);
      busy = false;
      if (result.ok) {
        pin = attempt; data = result; month = latestMonth(); draft = copyScenarios(); tab = 'spending';
        lockKey = null; render(); resetIdle();
      } else {
        typed = ''; draw(); note.textContent = result.error;
        dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 400);
      }
    }
    lockKey = e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('back'); };

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
    const pad = el('div', { class: 'pinpad' }, keys.map(k => k === '' ? el('span') :
      el('button', { class: 'pinkey', 'aria-label': k === 'back' ? 'Delete' : k, onclick: () => press(k) }, k === 'back' ? '\u232B' : k)));
    box().replaceChildren(el('div', { class: 'pinscreen' }, el('div', { class: 'pinicon' }, '\uD83D\uDD12'),
      el('h2', {}, 'Finances'), el('div', { class: 'pintext' }, 'Enter your PIN'), dots, note, pad));
  }

  function latestMonth() {
    const months = data.spending.months.map(m => m.month).filter(m => m <= data.today);
    return months.length ? months[months.length - 1] : (data.spending.months.length ? data.spending.months[data.spending.months.length - 1].month : null);
  }
  const copyScenarios = () => data.forecast.scenarios.map(s => Object.assign({}, s));

  async function refresh(manual) {
    if (!pin) { if (manual) A.toast('Unlock first.'); return; }
    A.setStatus('Refreshing...', 'finance');
    const result = await call('list');
    if (result.ok) {
      data = result; draft = copyScenarios();
      if (!data.spending.months.some(m => m.month === month)) month = latestMonth();
      A.setStatus('Updated ' + new Date().toTimeString().slice(0, 5), 'finance');
      render();
      if (manual) A.toast('Up to date');
    } else if (result.locked || result.wrong) {
      lock(result.error);
    } else {
      A.setStatus("Couldn't refresh", 'finance');
      A.toast("Couldn't refresh: " + result.error);
    }
  }

  // ------------------------------------------------------------------ small drawing helpers
  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.append(n);
    return n;
  }

  // One bar per item (negatives hang below the line).
  function barChart(items, height) {
    const W = 360, H = height || 190, top = 14, bottom = 28, left = 8, right = 8;
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fin-chart' });
    if (!items.length) return root;
    const hi = Math.max(0, ...items.map(i => i.value)), lo = Math.min(0, ...items.map(i => i.value));
    const span = hi - lo || 1, plotH = H - top - bottom;
    const y = v => top + (hi - v) / span * plotH;
    const slot = (W - left - right) / items.length, barW = Math.max(6, slot * 0.62);
    svg('line', { x1: left, x2: W - right, y1: y(0), y2: y(0), stroke: '#3a464c' }, root);
    items.forEach((item, i) => {
      const x = left + slot * i + (slot - barW) / 2;
      svg('rect', { x, y: Math.min(y(item.value), y(0)), width: barW, height: Math.max(1, Math.abs(y(item.value) - y(0))), fill: item.color || '#4cc9f0', rx: 2 }, root);
      svg('text', { x: x + barW / 2, y: H - 10, 'text-anchor': 'middle', fill: '#9aa5a8', 'font-size': 9 }, root, item.label);
    });
    svg('text', { x: left, y: 10, fill: '#9aa5a8', 'font-size': 9 }, root, short(hi));
    return root;
  }

  const COLOURS = ['#4cc9f0', '#f9c74f', '#90be6d', '#f94144', '#b388eb'];
  function lineChart(series) {
    const W = 360, H = 230, left = 44, right = 10, top = 10, bottom = 26;
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fin-chart' });
    const live = series.filter(s => s.values);
    if (!live.length) return root;
    const hi = Math.max(1, ...live.map(s => Math.max(...s.values)));
    const x = i => left + i / 240 * (W - left - right), y = v => top + (1 - v / hi) * (H - top - bottom);
    for (let t = 0; t <= 4; t++) {
      const v = hi * t / 4;
      svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: '#2b3338' }, root);
      svg('text', { x: left - 4, y: y(v) + 3, 'text-anchor': 'end', fill: '#9aa5a8', 'font-size': 9 }, root, short(v));
    }
    [0, 5, 10, 15, 20].forEach(yr => svg('text', { x: x(yr * 12), y: H - 8, 'text-anchor': 'middle', fill: '#9aa5a8', 'font-size': 9 }, root, yr === 0 ? 'now' : yr + 'y'));
    live.forEach(s => svg('polyline', { points: s.values.filter((_, i) => i % 3 === 0 || i === 240).map((v, k, arr) => `${x(k * 3 > 240 ? 240 : k * 3).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, root));
    return root;
  }

  const stat = (label, value, tone) => el('div', { class: 'fin-stat' + (tone ? ' ' + tone : '') }, el('span', {}, label), el('b', {}, value));
  const tone = n => n === null || n === undefined ? '' : n < 0 ? 'neg' : n > 0 ? 'pos' : '';

  // ------------------------------------------------------------------ the screens
  function render() {
    const root = box();
    root.replaceChildren(
      el('div', { class: 'fin-tabs' }, [['spending', 'Spending'], ['isa', 'ISA'], ['forecast', 'Forecast']].map(([key, label] ) =>
        el('button', { class: key === tab ? 'on' : '', onclick: () => { tab = key; render(); window.scrollTo(0, 0); } }, label))),
      el('div', { class: 'fin-body' }, tab === 'spending' ? spendingView() : tab === 'isa' ? isaView() : forecastView()));
  }

  function spendingView() {
    const sp = data.spending, months = sp.months;
    if (!months.length) return el('div', { class: 'fr-message' }, 'No transactions found yet.');
    const idx = Math.max(0, months.findIndex(m => m.month === month));
    const m = months[idx];
    const rows = sp.types.map((t, i) => [t, m.byType[i]]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const biggest = rows.length ? rows[0][1] : 1;
    const last12 = months.filter(x => x.month <= data.today).slice(-12);
    return el('div', {},
      el('div', { class: 'fin-step' },
        el('button', { disabled: idx <= 0, onclick: () => { month = months[idx - 1].month; render(); }, 'aria-label': 'Earlier month' }, '\u25C0'),
        el('b', {}, monthName(m.month)),
        el('button', { disabled: idx >= months.length - 1, onclick: () => { month = months[idx + 1].month; render(); }, 'aria-label': 'Later month' }, '\u25B6')),
      el('div', { class: 'fin-stats' }, stat('Spent', money(m.spent)), stat('Income', money(m.income)), stat('Moved to ISA', money(m.toIsa)),
        stat('Left over', money(m.left), tone(m.left))),
      el('h3', {}, 'Where it went'),
      rows.length ? rows.map(([type, value]) => el('div', { class: 'fin-row' },
        el('div', { class: 'fin-rowtop' }, el('span', {}, type), el('span', {}, `${money(value)}  \u00B7  ${m.spent ? Math.round(value / m.spent * 100) : 0}%`)),
        el('div', { class: 'fin-bar' }, el('div', { style: { width: (value / biggest * 100) + '%' } })))) : el('div', { class: 'meta' }, 'Nothing spent this month yet.'),
      el('h3', {}, 'Total spent, last 12 months'),
      barChart(last12.map(x => ({ label: monthShort(x.month), value: x.spent, color: x.month === m.month ? '#f9c74f' : '#4cc9f0' }))),
      el('div', { style: { marginTop: '14px' } }, el('button', { class: 'primary', onclick: addTransaction }, '\uFF0B Add a transaction')));
  }

  function isaView() {
    const isa = data.isa, thisMonth = data.today.slice(0, 7) + '-01';
    const prev = new Date(thisMonth + 'T12:00:00'); prev.setMonth(prev.getMonth() - 1);
    const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
    const rows = isa.rows.filter(r => r.month <= thisMonth);
    const byMonth = Object.fromEntries(rows.map(r => [r.month, r]));
    const pick = el('select', { onchange: e => { input.value = (byMonth[e.target.value] && byMonth[e.target.value].value !== null) ? byMonth[e.target.value].value : ''; } },
      [[thisMonth, 'This month'], [lastMonth, 'Last month']].filter(([m]) => byMonth[m]).map(([m, label]) => el('option', { value: m }, label)));
    const current = byMonth[thisMonth];
    const input = el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: 'What is in the ISA now?', value: current && current.value !== null ? current.value : '' });
    const note = el('div', { class: 'error' });
    const save = el('button', { class: 'primary', onclick: async () => {
      const value = Number(input.value);
      if (input.value === '' || !isFinite(value) || value < 0) { note.textContent = 'Type the ISA total, like 5432.10'; return; }
      save.disabled = true; note.style.color = 'var(--dim)'; note.textContent = 'Saving...';
      const result = await call('setIsaValue', { month: pick.value, value });
      note.style.color = '';
      if (!result.ok) { save.disabled = false; note.textContent = result.error; return; }
      A.toast('Saved'); refresh(false);
    } }, 'Save');
    const last12 = rows.filter(r => r.gain !== null).slice(-12);
    return el('div', {},
      el('div', { class: 'fin-stats' }, stat('Worth now', money(isa.worth)), stat('Gained this month so far', money(isa.gainedThisMonth), tone(isa.gainedThisMonth)),
        stat('Paid in (from Transactions)', money(isa.paidIn)), stat('Total gained', money(isa.totalGained), tone(isa.totalGained))),
      el('h3', {}, 'Update the ISA total'),
      el('div', { class: 'fin-card' }, el('div', { class: 'fin-form' }, pick, input, save), note,
        el('div', { class: 'meta' }, 'Money you move into the ISA goes in Transactions with the type ' + data.spending.isaType + '. It is never counted as a gain.')),
      el('h3', {}, 'Gained each month'),
      barChart(last12.map(r => ({ label: monthShort(r.month), value: r.gain, color: r.gain < 0 ? '#e63946' : '#22b14c' }))),
      el('h3', {}, 'Month by month'),
      el('div', { class: 'fin-table' }, el('div', { class: 'fin-tr head' }, ['Month', 'Paid in', 'Value', 'Gain'].map(h => el('span', {}, h))),
        rows.slice().reverse().map(r => el('div', { class: 'fin-tr' },
          el('span', {}, `${monthShort(r.month)} ${r.month.slice(2, 4)}${r.status === 'In progress' ? ' \u2022' : ''}`), el('span', {}, r.paid ? money(r.paid) : '\u2013'),
          el('span', {}, r.value !== null ? money(r.value) : '\u2013'), el('span', { class: tone(r.gain) }, r.gain !== null ? money(r.gain) : '\u2013')))));
  }

  function forecastView() {
    const start = data.forecast.start;
    const results = el('div', { class: 'fin-table' }), chart = el('div'), note = el('div', { class: 'error' });
    const redraw = () => {
      const lines = draft.map((s, i) => s.name.trim() ? { name: s.name, color: COLOURS[i], values: G.projectScenario(start, s.growth, s.deposit, 240) } : null);
      chart.replaceChildren(lineChart(lines.map(l => l || {})), el('div', { class: 'fin-legend' }, lines.filter(Boolean).map(l => el('span', {}, el('i', { style: { background: l.color } }), l.name))));
      results.replaceChildren(el('div', { class: 'fin-tr head f' }, ['Scenario', '5 yrs', '10 yrs', '15 yrs', '20 yrs'].map(h => el('span', {}, h))),
        ...lines.filter(Boolean).map((l, k) => el('div', { class: 'fin-tr f' }, el('span', { style: { color: l.color } }, l.name),
          [60, 120, 180, 240].map(n => el('span', {}, short(l.values[n]))))));
    };
    const cards = draft.map((s, i) => {
      const name = el('input', { type: 'text', value: s.name, maxlength: 40, placeholder: 'Scenario ' + (i + 1) + ' (blank = not used)' });
      const growth = el('input', { type: 'number', step: '0.01', inputmode: 'decimal', value: +(s.growth * 100).toFixed(4) });
      const deposit = el('input', { type: 'number', step: '1', min: '0', inputmode: 'decimal', value: s.deposit });
      name.oninput = () => { s.name = name.value; redraw(); };
      growth.oninput = () => { s.growth = (Number(growth.value) || 0) / 100; redraw(); };
      deposit.oninput = () => { s.deposit = Number(deposit.value) || 0; redraw(); };
      return el('div', { class: 'fin-card scen' }, el('i', { style: { background: COLOURS[i] } }), name,
        el('label', {}, 'Growth per month (%)', growth), el('label', {}, 'Deposit per month (\u00A3)', deposit));
    });
    const save = el('button', { class: 'primary', onclick: async () => {
      save.disabled = true; note.style.color = 'var(--dim)'; note.textContent = 'Saving...';
      const result = await call('setScenarios', { scenarios: draft.map(s => ({ name: s.name, growth: s.growth, deposit: s.deposit })) });
      note.style.color = ''; save.disabled = false;
      if (!result.ok) { note.textContent = result.error; return; }
      note.textContent = ''; A.toast('Saved to your sheet');
    } }, 'Save to my sheet');
    redraw();
    return el('div', {}, el('div', { class: 'meta' }, `Starting from ${money(start)} (what the ISA is worth now). Deposits go in at the end of each month. This is simple maths from your numbers, not a prediction.`),
      chart, results, el('h3', {}, 'Your scenarios'), ...cards, note, el('div', {}, save));
  }

  // ------------------------------------------------------------------ add a transaction
  function addTransaction() {
    const sp = data.spending;
    const types = [...new Set([...sp.types, sp.incomeType, sp.isaType].filter(Boolean))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    A.openOverlay((panel, o) => {
      overlayOpen = true;
      o.onClose = () => { overlayOpen = false; };
      const date = el('input', { type: 'date', value: data.today });
      const description = el('input', { type: 'text', placeholder: 'What was it?', maxlength: 80 });
      const amount = el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0.00' });
      const type = el('select', {}, el('option', { value: '' }, 'Choose a type...'), types.map(t => el('option', { value: t }, t)));
      const error = el('div', { class: 'error' });
      const save = el('button', { class: 'primary', onclick: submit }, 'Add to sheet');
      const row = (label, node, hint) => [el('label', {}, label), node, hint ? el('div', { class: 'hint' }, hint) : null];
      panel.append(el('div', { class: 'nav' }, el('b', {}, 'Add a transaction'), el('div', { class: 'mid' }), A.closeButton()),
        el('div', { class: 'form' }, row('Date', date), row('Description', description), row('Amount (\u00A3)', amount, 'Always a plus number. The type decides whether it counts as income or spending.'), row('Type', type)),
        error, el('div', { class: 'footer' }, el('button', { onclick: A.closeOverlay }, 'Cancel'), save));

      async function submit() {
        error.style.color = ''; error.textContent = '';
        const fail = t => { error.textContent = t; };
        const value = Number(amount.value);
        if (!date.value) return fail('Choose a date.');
        if (!description.value.trim()) return fail('Add a short description.');
        if (!isFinite(value) || value <= 0 || amount.value === '') return fail('The amount should be more than 0.');
        if (!type.value) return fail('Choose a type.');
        save.disabled = true; error.style.color = 'var(--dim)'; error.textContent = 'Saving to your sheet...';
        const result = await call('addTransaction', { date: date.value, description: description.value.trim(), amount: value, type: type.value });
        error.style.color = '';
        if (!result.ok) { save.disabled = false; fail("Couldn't add it: " + result.error); return; }
        A.closeOverlay(); A.toast('Added'); refresh(false);
      }
    }, 'editor');
  }

  // ------------------------------------------------------------------ hooks for the main app
  function onShow() {
    if (!configured()) { renderSetup(); return; }
    if (!pin) renderLock();
  }

  window.Finance = { onShow, refresh, lock: () => lock(), rerender: () => { lock(); } };
})();
