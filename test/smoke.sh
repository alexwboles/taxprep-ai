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

console.log('---');
console.log('NODE PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
[ "$?" -eq 0 ] && ok "node logic suite green" || bad "node logic suite had failures"

echo "---"
echo "SMOKE PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
