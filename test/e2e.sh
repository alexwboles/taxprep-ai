#!/bin/bash
# TaxPrep AI e2e tests — full checklist + deadline flows.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
node << 'NODEEOF'
const T = require('/home/hatch/workspace/taxprep-ai/js/tax.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

const from = new Date(2026, 8, 28); // fixed "today"

// Flow 1: freelancer selects freelancer+homeowner -> merged checklist, grouped
const groups = T.checklistFor(['freelancer', 'homeowner']);
groups.length === 2 ? ok('flow1: 2 groups for freelancer+homeowner') : bad('flow1: ' + groups.length + ' groups');
const n = groups.reduce((s, g) => s + g.docs.length, 0);
n === 10 ? ok('flow1: 10 docs total (6 freelancer + 4 homeowner)') : bad('flow1: ' + n + ' docs');

// Flow 2: all four situations -> every doc unique by id
const all = T.checklistFor(['employee', 'freelancer', 'homeowner', 'investor']);
const ids = all.flatMap(g => g.docs.map(d => d.id));
const uniq = new Set(ids);
uniq.size === ids.length
  ? ok('flow2: all-situation checklist has ' + ids.length + ' unique docs, zero dupes')
  : bad('flow2: duplicate doc ids');
T.docCount(['employee', 'freelancer', 'homeowner', 'investor']) === ids.length
  ? ok('flow2: docCount() agrees with checklist') : bad('flow2: docCount mismatch');

// Flow 3: deadline countdowns are chronological and non-negative
const dls = T.nextDeadlines(from);
const sorted = dls.every((d, i) => i === 0 || dls[i - 1].date <= d.date);
const nonNeg = dls.every(d => d.daysLeft >= 0);
sorted && nonNeg ? ok('flow3: 5 deadlines chronological, all upcoming') : bad('flow3: deadline order broken');
dls[0].daysLeft === 17 && dls[dls.length - 1].daysLeft > 300
  ? ok('flow3: countdowns span 17d (Oct 15 2026) to next Sep 15 (' + dls[dls.length-1].daysLeft + 'd)')
  : bad('flow3: countdown range wrong');

// Flow 4: vault progress math — simulate statuses over the employee checklist
const empDocs = T.checklistFor(['employee'])[0].docs;
const statusMap = {};
empDocs.forEach((d, i) => { statusMap[d.id] = i < 4 ? 'received' : (i === 4 ? 'na' : 'missing'); });
const total = empDocs.length;
const done = empDocs.filter(d => statusMap[d.id] !== 'missing').length;
const pct = Math.round((done / total) * 100);
done === 5 && pct === 83
  ? ok('flow4: vault progress 5/6 ready = 83%') : bad('flow4: progress math wrong (' + done + '/' + total + ')');

// Flow 5: unknown situation ids are ignored safely
const weird = T.checklistFor(['employee', 'nope', null]);
weird.length === 1 && weird[0].id === 'employee'
  ? ok('flow5: unknown situation ids ignored') : bad('flow5: bad input not handled');
T.checklistFor([]).length === 0 ? ok('flow5: empty selection -> empty checklist') : bad('flow5: empty selection broken');

// Flow 6: deadline formatting + countdown copy for the nearest deadline
const near = dls[0];
const label = T.fmtDate(near.date) + ' — ' + T.countdownLabel(near.daysLeft);
label === 'Oct 15, 2026 — in 17d'
  ? ok('flow6: nearest deadline renders "' + label + '"') : bad('flow6: render wrong: ' + label);

// Flow 7: each deadline has a stable id and human name
const idsOk = ['q1', 'file', 'q2', 'q3', 'ext'].every(id => dls.some(d => d.id === id));
const namesOk = dls.every(d => d.name && d.name.length > 5);
idsOk && namesOk ? ok('flow7: all 5 deadline ids/names present') : bad('flow7: deadline metadata incomplete');

console.log('---');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
