/* TaxPrep AI — UI. Requires window.TaxPrep (js/tax.js). */
(function () {
  'use strict';
  var T = window.TaxPrep;
  var LS_SIT = 'taxprep.situations.v1';
  var LS_STAT = 'taxprep.status.v1';
  var LS_NOTES = 'taxprep.notes.v1';

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
    var txt = T.checklistText(T.checklistFor(selected()), load(LS_STAT, {}), load(LS_NOTES, {}));
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

  function calcQuarterly() {
    var out = el('calcOut');
    var r = T.estimateQuarterly(el('w2Inc').value, el('seInc').value);
    out.innerHTML =
      '<div class="calc-nums">' +
      '<div><span>Income tax (annual)</span><strong>' + money(r.incomeTax) + '</strong></div>' +
      '<div><span>Self-employment tax</span><strong>' + money(r.seTax) + '</strong></div>' +
      '<div><span>Total annual</span><strong>' + money(r.annualTotal) + '</strong></div>' +
      '<div class="big"><span>Per quarter</span><strong>' + money(r.quarterly) + '</strong></div>' +
      '</div>' +
      '<p class="muted small">Rough estimate: single filer, standard deduction, simplified brackets. ' +
      'State taxes not included. Confirm with a tax professional before paying.</p>';
  }

  function render() {
    renderSituations();
    renderChecklist();
    renderDeadlines();
  }

  document.addEventListener('DOMContentLoaded', function () {
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
    render();
  });
})();
