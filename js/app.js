/* TaxPrep AI — UI. Requires window.TaxPrep (js/tax.js). */
(function () {
  'use strict';
  var T = window.TaxPrep;

  /* Per-year storage: the vault tracks one tax year at a time. Keys are
   * namespaced per year ('taxprep.status.v1.2026'); switching the year
   * starts a fresh vault while the old year stays viewable. */
  var LS_YEAR = 'taxprep.year.v1';
  var LS_SIT, LS_STAT, LS_NOTES, LS_DED, LS_FILE, LS_PAY;

  function taxYear() {
    var y = load(LS_YEAR, new Date().getFullYear());
    return parseInt(y, 10) || new Date().getFullYear();
  }

  function refreshKeys() {
    var y = taxYear();
    LS_SIT = T.yearKey('taxprep.situations.v1', y);
    LS_STAT = T.yearKey('taxprep.status.v1', y);
    LS_NOTES = T.yearKey('taxprep.notes.v1', y);
    LS_DED = T.yearKey('taxprep.deductions.v1', y);
    LS_FILE = T.yearKey('taxprep.filing.v1', y);
    LS_PAY = T.yearKey('taxprep.payments.v1', y);
  }

  /* One-time migration: copy pre-year keys into the current year's keys. */
  function migrateYearKeys() {
    if (load('taxprep.migrated.v1', false)) return;
    refreshKeys();
    [['taxprep.situations.v1', LS_SIT], ['taxprep.status.v1', LS_STAT],
     ['taxprep.notes.v1', LS_NOTES]].forEach(function (pair) {
      var oldV = load(pair[0], undefined);
      if (oldV !== undefined && load(pair[1], undefined) === undefined) save(pair[1], oldV);
    });
    save('taxprep.migrated.v1', true);
  }

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function el(id) { return document.getElementById(id); }

  function selected() {
    var s = load(LS_SIT, ['employee']);
    return s.filter(function (id) { return T.SITUATIONS[id]; });
  }

  var SIT_CODES = { employee: 'W-2', freelancer: '1099', homeowner: 'HOME', investor: 'INV' };

  function renderSituations() {
    var box = el('sitBox');
    box.innerHTML = '';
    var sel = selected();
    T.situationIds().forEach(function (id) {
      var sit = T.SITUATIONS[id];
      var lab = document.createElement('label');
      lab.className = 'sit' + (sel.indexOf(id) >= 0 ? ' on' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sel.indexOf(id) >= 0;
      cb.addEventListener('change', function () {
        var cur = selected();
        if (cb.checked && cur.indexOf(id) < 0) cur.push(id);
        if (!cb.checked) cur = cur.filter(function (x) { return x !== id; });
        save(LS_SIT, cur.length ? cur : ['employee']);
        render();
      });
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = SIT_CODES[id] || id.slice(0, 4).toUpperCase();
      var span = document.createElement('span');
      var strong = document.createElement('strong');
      strong.textContent = sit.label;
      var small = document.createElement('small');
      small.textContent = sit.blurb;
      span.appendChild(strong);
      span.appendChild(document.createElement('br'));
      span.appendChild(small);
      lab.appendChild(cb);
      lab.appendChild(code);
      lab.appendChild(span);
      box.appendChild(lab);
    });
  }

  function statusBtn(docId, statusMap) {
    var st = statusMap[docId] || 'missing';
    var b = document.createElement('button');
    b.className = 'status st-' + st;
    b.textContent = T.STATUS_LABEL[st];
    b.title = 'Click to change status';
    b.addEventListener('click', function () {
      var m = load(LS_STAT, {});
      m[docId] = T.nextStatus(m[docId] || 'missing');
      save(LS_STAT, m);
      render();
    });
    return b;
  }

  function renderChecklist() {
    var sel = selected();
    var statusMap = load(LS_STAT, {});
    var notesMap = load(LS_NOTES, {});
    var box = el('checklist');
    box.innerHTML = '';
    var q = el('docSearch') ? el('docSearch').value : '';
    var onlyMissing = el('missingOnly') ? el('missingOnly').checked : false;
    var allGroups = T.checklistFor(sel);
    var groups = T.filterDocs(allGroups, q, onlyMissing, statusMap);
    var total = 0, done = 0;
    // progress always reflects the full checklist, not the filtered view
    allGroups.forEach(function (g) {
      g.docs.forEach(function (d) {
        total++;
        if ((statusMap[d.id] || 'missing') !== 'missing') done++;
      });
    });
    var shown = 0;

    groups.forEach(function (g) {
      var h = document.createElement('h3');
      h.className = 'group-title';
      h.textContent = g.label;
      box.appendChild(h);
      g.docs.forEach(function (d) {
        shown++;
        var st = statusMap[d.id] || 'missing';
        var row = document.createElement('div');
        row.className = 'doc-row st-' + st;
        var main = document.createElement('div');
        main.className = 'doc-main';
        var name = document.createElement('strong');
        name.textContent = d.name;
        var desc = document.createElement('p');
        desc.className = 'doc-desc';
        desc.textContent = d.desc;
        var where = document.createElement('p');
        where.className = 'doc-where';
        where.textContent = d.where;
        main.appendChild(name);
        main.appendChild(desc);
        main.appendChild(where);

        var note = notesMap[d.id];
        if (note) {
          var np = document.createElement('p');
          np.className = 'doc-note';
          np.textContent = note;
          main.appendChild(np);
        }

        var side = document.createElement('div');
        side.className = 'doc-side';
        side.appendChild(statusBtn(d.id, statusMap));
        var noteBtn = document.createElement('button');
        noteBtn.className = 'btn ghost small';
        noteBtn.textContent = note ? 'Edit note' : 'Add note';
        noteBtn.addEventListener('click', function () {
          var cur = notesMap[d.id] || '';
          var val = prompt('Note for "' + d.name + '":', cur);
          if (val !== null) {
            var m = load(LS_NOTES, {});
            if (val.trim()) m[d.id] = val.trim(); else delete m[d.id];
            save(LS_NOTES, m);
            render();
          }
        });
        side.appendChild(noteBtn);
        row.appendChild(main);
        row.appendChild(side);
        box.appendChild(row);
      });
    });

    var pct = total ? Math.round((done / total) * 100) : 0;
    el('progFill').style.width = pct + '%';
    el('progText').textContent = done + ' of ' + total + ' documents ready (' + pct + '%)';
    var sv = el('stepVault');
    if (sv) sv.textContent = done + '/' + total;
    if (!shown && (q || onlyMissing)) {
      var empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No documents match this filter. Clear the search or uncheck "Missing only".';
      box.appendChild(empty);
    }
  }

  function renderDeadlines() {
    var box = el('deadlines');
    box.innerHTML = '';
    T.nextDeadlines(new Date()).forEach(function (dl) {
      var card = document.createElement('div');
      var urgent = dl.daysLeft <= 30 ? ' urgent' : '';
      card.className = 'dl-card' + urgent;
      var h = document.createElement('div');
      h.className = 'dl-count';
      h.textContent = T.countdownLabel(dl.daysLeft);
      var n = document.createElement('div');
      n.className = 'dl-name';
      n.textContent = dl.name;
      var d = document.createElement('div');
      d.className = 'dl-date';
      d.textContent = T.fmtDate(dl.date) + (dl.note ? ' — ' + dl.note : '');
      card.appendChild(h);
      card.appendChild(n);
      card.appendChild(d);
      box.appendChild(card);
    });
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  }

  function exportPacket() {
    var w = window.open('', '_blank');
    if (!w) return;
    var st = filingStatus();
    var dc = T.deductionComparison(deductions(), st);
    var q = T.estimateQuarterly(el('w2Inc').value, el('seInc').value, st);
    var txt = T.accountantPacketText({
      year: taxYear(),
      groups: T.checklistFor(selected()),
      statusMap: load(LS_STAT, {}),
      notesMap: load(LS_NOTES, {}),
      deduction: {
        itemized: dc.itemized, standard: dc.standard,
        better: dc.better, difference: dc.difference,
        statusLabel: T.FILING_STATUSES[st].label
      },
      payments: T.paymentSummary(payments(), q.quarterly),
      deadlines: T.nextDeadlines(new Date()).slice(0, 5)
    });
    w.document.write('<html><head><title>TaxPrep AI — document packet</title></head><body>' +
      '<pre style="font-family:monospace;white-space:pre-wrap">' + escHtml(txt) + '</pre></body></html>');
    w.document.close();
    w.focus();
    w.print();
  }

  function downloadICS() {
    var ics = T.deadlinesICS(T.nextDeadlines(new Date()));
    var blob = new Blob([ics], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taxprep-deadlines.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function filingStatus() {
    var s = load(LS_FILE, 'single');
    return T.FILING_STATUSES[s] ? s : 'single';
  }

  /* ---------- live refund ticker (TurboTax monitor pattern) ---------- */
  function updateTicker() {
    var st = filingStatus();
    var paidSoFar = payments().reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    var rf = T.estimateRefund(el('w2Inc').value, el('seInc').value, st, el('w2With').value, paidSoFar);
    var tick = el('ticker');
    tick.classList.toggle('owed', rf.verdict === 'owed');
    el('tickerLabel').textContent = rf.verdict === 'refund' ? 'EST. REFUND' : 'EST. OWED';
    el('tickerNum').textContent = money(Math.abs(rf.net));
    var next = T.nextDeadlines(new Date())[0];
    el('tickerDl').innerHTML = next
      ? 'Next: <b>' + escapeHtml(next.name) + '</b> ' + T.countdownLabel(next.daysLeft)
      : '—';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function calcQuarterly() {
    var out = el('calcOut');
    var st = filingStatus();
    save(LS_FILE, st);
    var r = T.estimateQuarterly(el('w2Inc').value, el('seInc').value, st);
    var rf = T.estimateRefund(el('w2Inc').value, el('seInc').value, st,
      el('w2With').value, payments().reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0));
    var verdictHtml = rf.verdict === 'refund'
      ? '<div class="verdict"><span>Estimated refund</span><strong>' + money(rf.net) + '</strong></div>'
      : '<div class="verdict owed"><span>Estimated amount owed</span><strong>' + money(-rf.net) + '</strong></div>';
    out.innerHTML =
      verdictHtml +
      '<div class="calc-nums">' +
      '<div><span>Income tax (annual)</span><strong>' + money(r.incomeTax) + '</strong></div>' +
      '<div><span>Self-employment tax</span><strong>' + money(r.seTax) + '</strong></div>' +
      '<div><span>Total annual</span><strong>' + money(r.annualTotal) + '</strong></div>' +
      '<div class="big"><span>Per quarter</span><strong>' + money(r.quarterly) + '</strong></div>' +
      '</div>' +
      '<div class="calc-nums">' +
      '<div><span>Already paid (withholding + logged payments)</span><strong>' + money(rf.alreadyPaid) + '</strong></div>' +
      '</div>' +
      '<p class="muted small">Rough estimate: ' + T.FILING_STATUSES[st].label.toLowerCase() +
      ' filer, standard deduction, simplified brackets. ' +
      'State taxes not included. Confirm with a tax professional before paying.</p>';
    renderPayments(); // refresh suggested per-quarter targets
    updateTicker();
  }

  /* ---------- standard vs itemized deduction tracker ---------- */
  function deductions() { return load(LS_DED, []); }

  function renderDeductions() {
    var exps = deductions();
    var list = el('dedList');
    list.innerHTML = '';
    if (!exps.length) {
      list.innerHTML = '<p class="muted small">No expenses logged yet. Add deductible spending above as it happens.</p>';
    }
    exps.forEach(function (e, i) {
      var row = document.createElement('div');
      row.className = 'ded-row';
      var lbl = document.createElement('span');
      lbl.textContent = e.category;
      var amt = document.createElement('strong');
      amt.textContent = money(e.amount);
      var rm = document.createElement('button');
      rm.className = 'btn ghost small';
      rm.textContent = 'Remove';
      rm.onclick = function () {
        var a = deductions();
        a.splice(i, 1);
        save(LS_DED, a);
        renderDeductions();
      };
      row.appendChild(lbl); row.appendChild(amt); row.appendChild(rm);
      list.appendChild(row);
    });
    var st = filingStatus();
    var c = T.deductionComparison(exps, st);
    el('dedOut').innerHTML =
      '<div class="calc-nums">' +
      '<div><span>Your itemized total</span><strong>' + money(c.itemized) + '</strong></div>' +
      '<div><span>Standard (' + T.FILING_STATUSES[st].label.toLowerCase() + ')</span><strong>' + money(c.standard) + '</strong></div>' +
      '<div class="big"><span>' + (c.better === 'itemized' ? 'Itemized wins' : 'Standard wins') +
      '</span><strong>by ' + money(c.difference) + '</strong></div>' +
      '</div>';
  }

  function addDeduction() {
    var cat = el('dedCat').value;
    var amt = Math.max(0, Math.round(Number(el('dedAmt').value) || 0));
    if (!amt) return;
    var a = deductions();
    a.push({ category: cat, amount: amt });
    save(LS_DED, a);
    el('dedAmt').value = '0';
    renderDeductions();
  }

  /* ---------- quarterly estimated-payment tracker ---------- */
  function payments() { return load(LS_PAY, []); }

  function renderPayments() {
    var pays = payments();
    var list = el('payList');
    list.innerHTML = '';
    if (!pays.length) {
      list.innerHTML = '<p class="muted small">No payments logged yet. Log each quarterly payment as you make it.</p>';
    }
    var sorted = pays.slice().sort(function (a, b) {
      return (a.quarter - b.quarter) || String(a.date).localeCompare(String(b.date));
    });
    sorted.forEach(function (p) {
      var idx = pays.indexOf(p);
      var row = document.createElement('div');
      row.className = 'ded-row';
      var lbl = document.createElement('span');
      lbl.textContent = 'Q' + p.quarter + ' · ' + p.date;
      var amt = document.createElement('strong');
      amt.textContent = money(p.amount);
      var rm = document.createElement('button');
      rm.className = 'btn ghost small';
      rm.textContent = 'Remove';
      rm.onclick = function () {
        var a = payments();
        a.splice(idx, 1);
        save(LS_PAY, a);
        renderPayments();
      };
      row.appendChild(lbl); row.appendChild(amt); row.appendChild(rm);
      list.appendChild(row);
    });
    // suggested per-quarter amount comes from the estimator inputs above
    var st = filingStatus();
    var target = T.estimateQuarterly(el('w2Inc').value, el('seInc').value, st).quarterly;
    var s = T.paymentSummary(pays, target);
    el('payOut').innerHTML =
      '<div class="calc-nums">' +
      s.quarters.map(function (q) {
        return '<div class="' + (q.met && target ? 'good' : '') + '"><span>Q' + q.quarter +
          (target ? ' · suggested ' + money(q.target) : '') + '</span><strong>' +
          money(q.paid) + ' paid' + (q.remaining && target ? ' · ' + money(q.remaining) + ' left' : '') +
          '</strong></div>';
      }).join('') +
      '<div class="big"><span>Total paid this year</span><strong>' + money(s.totalPaid) + '</strong></div>' +
      '</div>' +
      (target ? '' : '<p class="muted small">Enter income above and hit Calculate to see suggested per-quarter amounts.</p>');
  }

  function addPayment() {
    var q = parseInt(el('payQ').value, 10);
    var date = el('payDate').value;
    var amt = Math.max(0, Math.round(Number(el('payAmt').value) || 0));
    if (!(q >= 1 && q <= 4) || !date || !amt) return;
    var a = payments();
    a.push({ quarter: q, date: date, amount: amt });
    save(LS_PAY, a);
    el('payAmt').value = '0';
    renderPayments();
    updateTicker();
  }

  /* ---------- tax year ---------- */
  function buildYearSel() {
    var sel = el('yearSel');
    var y0 = new Date().getFullYear();
    sel.innerHTML = '';
    [y0 - 1, y0, y0 + 1].forEach(function (y) {
      var o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      sel.appendChild(o);
    });
    sel.value = taxYear();
    sel.onchange = function () {
      save(LS_YEAR, parseInt(sel.value, 10));
      refreshKeys();
      render();
      renderDeductions();
      renderPayments();
    };
  }

  function render() {
    refreshKeys();
    el('filingStatus').value = filingStatus();
    renderSituations();
    renderChecklist();
    renderDeadlines();
    renderPayments();
    updateTicker();
  }

  document.addEventListener('DOMContentLoaded', function () {
    migrateYearKeys();
    refreshKeys();
    buildYearSel();
    el('resetBtn').addEventListener('click', function () {
      if (confirm('Reset all document statuses and notes?')) {
        save(LS_STAT, {});
        save(LS_NOTES, {});
        render();
      }
    });
    el('docSearch').addEventListener('input', renderChecklist);
    el('missingOnly').addEventListener('change', renderChecklist);
    el('exportBtn').addEventListener('click', exportPacket);
    el('icsBtn').addEventListener('click', downloadICS);
    el('calcBtn').addEventListener('click', calcQuarterly);
    el('filingStatus').addEventListener('change', function () { calcQuarterly(); });
    // live ticker: recompute on every keystroke like TurboTax's refund monitor
    ['w2Inc', 'seInc', 'w2With'].forEach(function (id) {
      el(id).addEventListener('input', updateTicker);
    });
    el('filingStatus').addEventListener('change', updateTicker);
    el('dedCat').innerHTML = T.DEDUCTION_CATEGORIES.map(function (c) {
      return '<option>' + c + '</option>';
    }).join('');
    el('dedAddBtn').addEventListener('click', addDeduction);
    el('payAddBtn').addEventListener('click', addPayment);
    render();
    renderDeductions();
  });
})();
