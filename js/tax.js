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
    countdownLabel: countdownLabel
  };
}));
