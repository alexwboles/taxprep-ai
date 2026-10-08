#!/bin/bash
# TaxPrep AI smoke tests — file presence, syntax, core logic sanity.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# 1-6. expected files exist
for f in index.html css/style.css js/tax.js js/app.js README.md test/e2e.sh; do
  [ -f "$f" ] && ok "file exists: $f" || bad "missing file: $f"
done

# 7-8. JS syntax valid
for f in js/tax.js js/app.js; do
  node --check "$f" 2>/dev/null && ok "syntax ok: $f" || bad "syntax error: $f"
done

# 9. disclaimer present in app and README (not tax advice)
grep -qi "not tax advice" index.html && grep -qi "not tax advice" README.md \
  && ok "disclaimer present in app + README" || bad "disclaimer missing"

# 10+. logic checks via node
node << 'NODEEOF'
const T = require('/home/hatch/workspace/taxprep-ai/js/tax.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

// 4 situations defined
T.situationIds().length === 4 ? ok('4 filer situations defined') : bad('situation count wrong');

// every situation has >= 4 docs, each with id/name/desc/where
let docOk = true, total = 0;
T.situationIds().forEach(id => {
  const docs = T.SITUATIONS[id].docs;
  total += docs.length;
  if (docs.length < 4) docOk = false;
  docs.forEach(d => { if (!d.id || !d.name || !d.desc || !d.where) docOk = false; });
});
docOk ? ok(total + ' docs across situations, all fully specified') : bad('doc spec incomplete');

// employee-only checklist = 6 docs
T.checklistFor(['employee']).reduce((s, g) => s + g.docs.length, 0) === 6
  ? ok('employee checklist has 6 docs') : bad('employee checklist wrong size');

// shared doc deduped: 1099-INT/DIV appears in employee + investor, merged once
const merged = T.checklistFor(['employee', 'investor']);
const names = merged.flatMap(g => g.docs.map(d => d.name));
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
dupes.length === 0 ? ok('shared docs deduped across situations') : bad('duplicates: ' + dupes.join(','));

// deadline math from a fixed date: 2026-09-28 -> next is Oct 15 2026 (17 days)
const from = new Date(2026, 8, 28);
const dls = T.nextDeadlines(from);
dls[0].id === 'ext' && dls[0].daysLeft === 17
  ? ok('next deadline Oct 15 2026, 17 days out') : bad('next deadline wrong: ' + JSON.stringify(dls[0]));
dls.length === 5 ? ok('5 recurring federal deadlines') : bad('deadline count wrong');
const file = dls.find(d => d.id === 'file');
file && file.date.getFullYear() === 2027 && file.date.getMonth() === 3 && file.date.getDate() === 15
  ? ok('filing deadline rolls to Apr 15 2027') : bad('filing deadline wrong');

// countdown labels
T.countdownLabel(0) === 'today!' && T.countdownLabel(1) === 'tomorrow' && T.countdownLabel(17) === 'in 17d'
  ? ok('countdown labels correct') : bad('countdown labels broken');

// status cycle: missing -> received -> na -> missing
const cyc = [T.nextStatus('missing'), T.nextStatus('received'), T.nextStatus('na')];
(cyc[0] === 'received' && cyc[1] === 'na' && cyc[2] === 'missing')
  ? ok('status cycle correct') : bad('status cycle broken: ' + cyc.join(','));

// filterDocs: free-text search across name/desc/where
const home = T.checklistFor(['homeowner']);
T.filterDocs(home, 'mortgage', false, {})[0].docs.length === 1
  ? ok('filterDocs finds the mortgage doc by search') : bad('filterDocs search broken');
T.filterDocs(home, '', false, {})[0].docs.length === 4
  ? ok('filterDocs empty query returns all docs') : bad('filterDocs empty query broken');
const sm = { '1098': 'received' };
T.filterDocs(home, '', true, sm).reduce((s, g) => s + g.docs.length, 0) === 3
  ? ok('filterDocs missing-only hides the received doc') : bad('filterDocs missing-only broken');
T.filterDocs(home, 'zzz-no-match', false, {}).length === 0
  ? ok('filterDocs no-match returns no groups') : bad('filterDocs no-match broken');

// checklistText: printable packet with statuses + notes
const txt = T.checklistText(T.checklistFor(['employee']), { w2: 'received' }, { w2: 'in the filing cabinet' });
txt.indexOf('== W-2 employee ==') !== -1 && txt.indexOf('[Received] W-2 wage statements') !== -1 &&
txt.indexOf('Note: in the filing cabinet') !== -1 && txt.indexOf('not tax advice') !== -1
  ? ok('checklistText packet has groups, statuses, notes, disclaimer') : bad('checklistText broken');

// estimateQuarterly: zero income -> zeros; $60k W-2 -> $5,162 income tax, $1,290/quarter
const z = T.estimateQuarterly(0, 0);
z.annualTotal === 0 && z.quarterly === 0 && z.seTax === 0
  ? ok('estimateQuarterly zero income -> zero') : bad('estimateQuarterly zero broken: ' + JSON.stringify(z));
const w = T.estimateQuarterly(60000, 0);
w.incomeTax === 5162 && w.seTax === 0 && w.quarterly === 1290
  ? ok('estimateQuarterly $60k W-2 -> $5,162 tax, $1,290/qtr') : bad('estimateQuarterly W-2 wrong: ' + JSON.stringify(w));
const se = T.estimateQuarterly(0, 100000);
se.seTax === Math.round(100000 * 0.9235 * 0.153) && se.quarterly === Math.round(se.annualTotal / 4)
  ? ok('estimateQuarterly $100k SE -> SE tax ' + se.seTax + ', quarterly ' + se.quarterly) : bad('estimateQuarterly SE wrong');
const neg = T.estimateQuarterly(-500, -200);
neg.annualTotal === 0 ? ok('estimateQuarterly negative inputs clamped to 0') : bad('estimateQuarterly negative broken');

// deadlinesICS: valid calendar payload for the 5 deadlines
const ics = T.deadlinesICS(T.nextDeadlines(from));
const vevents = (ics.match(/BEGIN:VEVENT/g) || []).length;
ics.indexOf('BEGIN:VCALENDAR') === 0 && vevents === 5 && ics.indexOf('DTSTART;VALUE=DATE:20261015') !== -1 &&
ics.trim().endsWith('END:VCALENDAR') && ics.indexOf('UID:taxprep-ext@local') !== -1
  ? ok('deadlinesICS: 5 events, Oct 15 2026 dated, well-formed') : bad('deadlinesICS broken');

console.log('---');
console.log('NODE PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
[ "$?" -eq 0 ] && ok "node logic suite green" || bad "node logic suite had failures"

# new UI wiring: search, missing-only, export, ics, calculator controls exist + are wired
missingIds=""
for id in docSearch missingOnly exportBtn icsBtn w2Inc seInc calcBtn calcOut; do
  grep -q "id=\"$id\"" index.html || missingIds="$missingIds $id"
done
[ -z "$missingIds" ] && ok "index.html has search/filter/export/ics/calculator controls" || bad "index.html missing:$missingIds"
missing=""
for needle in filterDocs checklistText estimateQuarterly deadlinesICS exportPacket downloadICS calcQuarterly; do
  grep -q "$needle" js/app.js || grep -q "$needle" js/tax.js || missing="$missing $needle"
done
[ -z "$missing" ] && ok "app.js/tax.js wire all 5 new features" || bad "missing wiring:$missing"

echo "---"
echo "SMOKE PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
