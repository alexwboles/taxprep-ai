/* TaxPrep AI — tax document checklist + deadline engine.
 * Pure logic, no DOM. Works in the browser (window.TaxPrep)
 * and in node (module.exports) so tests can require() it.
 *
 * NOTE: general guidance only — not tax advice. Deadlines below are
 * recurring U.S. federal dates; state dates and holiday shifts vary. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TaxPrep = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITUATIONS = {
    employee: {
      label: 'W-2 employee',
      blurb: 'You earn wages from an employer.',
      docs: [
        { id: 'w2', name: 'W-2 wage statements', desc: 'Wages and withholding from each employer.', where: 'Mailed by Jan 31, or your employer payroll portal' },
        { id: 'intdiv', name: '1099-INT / 1099-DIV', desc: 'Bank interest and brokerage dividends.', where: 'Bank / brokerage online tax documents' },
        { id: '1098e', name: '1098-E student loan interest', desc: 'Interest you paid on student loans.', where: 'Loan servicer portal' },
        { id: 'donations', name: 'Charitable donation receipts', desc: 'Cash and goods donations through the year.', where: 'Charity emails and your receipts drawer' },
        { id: 'hsa', name: 'HSA/MSA contribution records', desc: 'Health savings account contributions (5498-SA).', where: 'HSA provider statements' },
        { id: 'prior', name: "Last year's tax return", desc: 'Helps carry forward figures and check consistency.', where: 'Your files or tax software' }
      ]
    },
    freelancer: {
      label: 'Freelancer / 1099',
      blurb: 'Self-employment, gig, or contract income.',
      docs: [
        { id: 'nec', name: '1099-NEC / 1099-MISC / 1099-K', desc: 'Income reported by clients and platforms.', where: 'Client emails; Stripe / PayPal / Upwork tax docs' },
        { id: 'expenses', name: 'Business expense receipts', desc: '12 months of deductible business spending.', where: 'Email receipts and accounting app' },
        { id: 'mileage', name: 'Mileage log', desc: 'Business miles driven with dates and purpose.', where: 'Mileage app or notebook' },
        { id: 'homeoffice', name: 'Home office records', desc: 'Square footage, rent/mortgage, utility bills if claiming.', where: 'Your own records' },
        { id: 'estimated', name: '1040-ES payment records', desc: 'Quarterly estimated payments you already made.', where: 'IRS online account / bank statements' },
        { id: 'retirement', name: 'SEP-IRA / Solo 401(k) records', desc: 'Retirement contributions for the year.', where: 'Brokerage statements' }
      ]
    },
    homeowner: {
      label: 'Homeowner',
      blurb: 'You own (or sold) a home this year.',
      docs: [
        { id: '1098', name: '1098 mortgage interest', desc: 'Mortgage interest paid, from your servicer.', where: 'Servicer portal or mail' },
        { id: 'proptax', name: 'Property tax records', desc: 'County property tax bills and receipts.', where: 'County assessor website' },
        { id: 'closing', name: 'Closing / refinance documents', desc: 'Points paid and closing disclosure, if you bought or refinanced.', where: 'Title company / lender' },
        { id: 'energy', name: 'Energy-efficiency receipts', desc: 'Solar, windows, heat pumps, insulation.', where: 'Contractor invoices' }
      ]
    },
    investor: {
      label: 'Investor',
      blurb: 'Stocks, funds, crypto, or rental property.',
      docs: [
        { id: '1099b', name: '1099-B brokerage statements', desc: 'Sales of stocks, funds, and other securities.', where: 'Brokerage tax center' },
        { id: 'k1', name: 'Schedule K-1s', desc: 'Partnership / S-corp / trust income (often arrive in March).', where: 'Mailed by the entity' },
        { id: 'crypto', name: 'Crypto transaction history', desc: 'Every buy, sell, swap, and transfer.', where: 'Exchange CSV exports' },
        { id: 'rental', name: 'Rental income & expense records', desc: 'Rents collected and property expenses.', where: 'Property manager / your books' },
        { id: 'intdiv', name: '1099-INT / 1099-DIV', desc: 'Interest and dividends (shared with the W-2 checklist — listed once).', where: 'Bank / brokerage online tax documents' }
      ]
    }
  };

  // Recurring U.S. federal deadlines (month is 0-based).
  var DEADLINES = [
    { id: 'q1', name: 'Q1 estimated tax payment', month: 0, day: 15, note: 'For the current tax year' },
    { id: 'file', name: 'Federal filing deadline', month: 3, day: 15, note: 'File or request an extension' },
    { id: 'q2', name: 'Q2 estimated tax payment', month: 5, day: 15, note: '' },
    { id: 'q3', name: 'Q3 estimated tax payment', month: 8, day: 15, note: '' },
    { id: 'ext', name: 'Extended filing deadline', month: 9, day: 15, note: 'If you filed an extension' }
  ];

  var STATUSES = ['missing', 'received', 'na'];
  var STATUS_LABEL = { missing: 'Missing', received: 'Received', na: 'N/A' };

  function nextStatus(s) {
    var i = STATUSES.indexOf(s);
    return STATUSES[(i + 1) % STATUSES.length];
  }

  function situationIds() { return Object.keys(SITUATIONS); }

  /**
   * Merge checklists for the selected situations, grouped by situation.
   * Docs shared across situations (by id prefix match on name) appear once,
   * under the first selected situation that lists them.
   */
  function checklistFor(selected) {
    var seen = {};
    var groups = [];
    (selected || []).forEach(function (sid) {
      var sit = SITUATIONS[sid];
      if (!sit) return;
      var docs = sit.docs.filter(function (d) {
        if (seen[d.id]) return false;
        seen[d.id] = true;
        return true;
      });
      if (docs.length) groups.push({ id: sid, label: sit.label, docs: docs });
    });
    return groups;
  }

  function docCount(selected) {
    return checklistFor(selected).reduce(function (s, g) { return s + g.docs.length; }, 0);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysUntil(target, from) {
    var ms = startOfDay(target).getTime() - startOfDay(from).getTime();
    return Math.round(ms / 86400000);
  }

  /**
   * Next occurrence of each recurring deadline on/after `from`.
   * Returns sorted [{id, name, date, daysLeft, note}].
   */
  function nextDeadlines(fromDate) {
    var from = fromDate instanceof Date ? fromDate : new Date();
    return DEADLINES.map(function (dl) {
      var y = from.getFullYear();
      var d = new Date(y, dl.month, dl.day);
      if (startOfDay(d) < startOfDay(from)) d = new Date(y + 1, dl.month, dl.day);
      return {
        id: dl.id,
        name: dl.name,
        date: d,
        daysLeft: daysUntil(d, from),
        note: dl.note
      };
    }).sort(function (a, b) { return a.date - b.date; });
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function countdownLabel(daysLeft) {
    if (daysLeft < 0) return Math.abs(daysLeft) + 'd ago';
    if (daysLeft === 0) return 'today!';
    if (daysLeft === 1) return 'tomorrow';
    return 'in ' + daysLeft + 'd';
  }

  /**
   * Filter checklist groups by free-text query and/or missing-only.
   * Returns new groups with only matching docs; empty groups dropped.
   */
  function filterDocs(groups, query, onlyMissing, statusMap) {
    var q = String(query || '').trim().toLowerCase();
    var out = [];
    (groups || []).forEach(function (g) {
      var docs = g.docs.filter(function (d) {
        var st = (statusMap || {})[d.id] || 'missing';
        if (onlyMissing && st !== 'missing') return false;
        if (!q) return true;
        return (d.name + ' ' + d.desc + ' ' + d.where).toLowerCase().indexOf(q) !== -1;
      });
      if (docs.length) out.push({ id: g.id, label: g.label, docs: docs });
    });
    return out;
  }

  /**
   * Plain-text export of the vault — the "packet for your accountant".
   * groups: checklistFor() output. statusMap: {docId: status}. notesMap: {docId: note}.
   */
  function checklistText(groups, statusMap, notesMap) {
    var lines = [];
    lines.push('TAX DOCUMENT PACKET — generated by TaxPrep AI');
    lines.push('General guidance only — not tax advice.');
    lines.push('');
    (groups || []).forEach(function (g) {
      lines.push('== ' + g.label + ' ==');
      g.docs.forEach(function (d) {
        var st = STATUS_LABEL[((statusMap || {})[d.id]) || 'missing'];
        lines.push('[' + st + '] ' + d.name);
        lines.push('    ' + d.desc);
        lines.push('    Find it: ' + d.where);
        var note = (notesMap || {})[d.id];
        if (note) lines.push('    Note: ' + note);
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  // Simplified federal brackets + standard deductions per filing status
  // (2025 figures, rounded for estimation). General guidance only.
  var FILING_STATUSES = {
    single: {
      label: 'Single', stdDeduction: 15000,
      brackets: [
        [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
        [250525, 0.32], [626350, 0.35], [Infinity, 0.37]
      ]
    },
    married: {
      label: 'Married filing jointly', stdDeduction: 30000,
      brackets: [
        [23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24],
        [501050, 0.32], [751600, 0.35], [Infinity, 0.37]
      ]
    },
    hoh: {
      label: 'Head of household', stdDeduction: 22500,
      brackets: [
        [17000, 0.10], [64800, 0.12], [115150, 0.22], [205800, 0.24],
        [256225, 0.32], [641350, 0.35], [Infinity, 0.37]
      ]
    }
  };

  function filingStatusIds() { return Object.keys(FILING_STATUSES); }

  function statusOf(s) {
    return FILING_STATUSES[s] || FILING_STATUSES.single;
  }

  function federalIncomeTax(taxable, status) {
    var brackets = statusOf(status).brackets;
    var tax = 0, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      var cap = brackets[i][0], rate = brackets[i][1];
      if (taxable <= prev) break;
      tax += (Math.min(taxable, cap) - prev) * rate;
      prev = cap;
    }
    return tax;
  }

  /**
   * Rough quarterly estimated-payment calculator (simplified).
   * w2Income / seIncome: annual dollars. status: 'single'|'married'|'hoh'.
   * Returns { incomeTax, seTax, annualTotal, quarterly, status } rounded.
   * General guidance only — not tax advice.
   */
  function estimateQuarterly(w2Income, seIncome, status) {
    var st = statusOf(status);
    var w2 = Math.max(0, Number(w2Income) || 0);
    var se = Math.max(0, Number(seIncome) || 0);
    var seNet = se * 0.9235;
    var seTax = seNet * 0.153;
    var taxable = Math.max(0, w2 + seNet - seTax / 2 - st.stdDeduction);
    var incomeTax = federalIncomeTax(taxable, status);
    var annual = incomeTax + seTax;
    var r = function (n) { return Math.round(n); };
    return { incomeTax: r(incomeTax), seTax: r(seTax), annualTotal: r(annual), quarterly: r(annual / 4), status: status || 'single' };
  }

  var DEDUCTION_CATEGORIES = [
    'Mortgage interest', 'Property tax (SALT)', 'State/local income tax (SALT)',
    'Charitable cash', 'Charitable goods', 'Medical expenses',
    'Unreimbursed business expenses', 'Other'
  ];

  /**
   * Compare itemized deductions against the standard deduction.
   * expenses: [{category, amount}]. status: filing status id.
   * Returns {itemized, standard, better: 'itemized'|'standard', difference}.
   */
  function deductionComparison(expenses, status) {
    var st = statusOf(status);
    var total = (expenses || []).reduce(function (a, e) {
      return a + Math.max(0, Number(e && e.amount) || 0);
    }, 0);
    var better = total > st.stdDeduction ? 'itemized' : 'standard';
    return {
      itemized: Math.round(total),
      standard: st.stdDeduction,
      better: better,
      difference: Math.round(Math.abs(total - st.stdDeduction))
    };
  }

  /** Per-year localStorage key namespacing: 'taxprep.status.v1' + year -> 'taxprep.status.v1.2026'. */
  function yearKey(base, year) {
    var y = parseInt(year, 10);
    if (!isFinite(y)) throw new Error('bad tax year: ' + year);
    return String(base).replace(/\.+$/, '') + '.' + y;
  }

  function icsDate(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /**
   * Render deadlines (nextDeadlines() output) as an .ics calendar file.
   * Escape commas/semicolons minimally for SUMMARY/DESCRIPTION.
   */
  function deadlinesICS(deadlines) {
    function escICS(s) {
      return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
    }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TaxPrep AI//Deadlines//EN'];
    (deadlines || []).forEach(function (dl) {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:taxprep-' + dl.id + '@local');
      lines.push('DTSTAMP:' + icsDate(new Date()) + 'T000000');
      lines.push('DTSTART;VALUE=DATE:' + icsDate(dl.date));
      lines.push('SUMMARY:' + escICS(dl.name + ' (TaxPrep AI)'));
      if (dl.note) lines.push('DESCRIPTION:' + escICS(dl.note));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  return {
    SITUATIONS: SITUATIONS,
    DEADLINES: DEADLINES,
    STATUS_LABEL: STATUS_LABEL,
    situationIds: situationIds,
    checklistFor: checklistFor,
    docCount: docCount,
    nextStatus: nextStatus,
    nextDeadlines: nextDeadlines,
    daysUntil: daysUntil,
    fmtDate: fmtDate,
    countdownLabel: countdownLabel,
    filterDocs: filterDocs,
    checklistText: checklistText,
    estimateQuarterly: estimateQuarterly,
    federalIncomeTax: federalIncomeTax,
    FILING_STATUSES: FILING_STATUSES,
    filingStatusIds: filingStatusIds,
    DEDUCTION_CATEGORIES: DEDUCTION_CATEGORIES,
    deductionComparison: deductionComparison,
    yearKey: yearKey,
    deadlinesICS: deadlinesICS
  };
}));
