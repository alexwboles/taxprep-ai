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
    var groups = T.checklistFor(sel);
    var total = 0, done = 0;

    groups.forEach(function (g) {
      var h = document.createElement('h3');
      h.className = 'group-title';
      h.textContent = g.label;
      box.appendChild(h);
      g.docs.forEach(function (d) {
        total++;
        var st = statusMap[d.id] || 'missing';
        if (st !== 'missing') done++;
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
    render();
  });
})();
