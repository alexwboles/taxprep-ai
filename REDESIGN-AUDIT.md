# REDESIGN-AUDIT — taxprep-ai (2026-10-13)

Competitors referenced: **TurboTax** (live refund/owed monitor ticker, interview-style section progress, document import checklist, "Explain my taxes"), **H&R Block** (guided prep flow, refund tracker), **FreeTaxUSA** (no-nonsense form-first layout, running totals).

## Visual gaps vs competitors
- No live refund/owed monitor. TurboTax's signature pattern is the ever-present refund ticker; here the estimate only appears after clicking "Calculate quarterly" and lives at the bottom of the results.
- The quarterly calculator buries the verdict: results stack income-tax → SE-tax → annual → per-quarter → already-paid → verdict. The single most motivating artifact (refund vs owed) should lead.
- No section wayfinding. TurboTax shows section progress (Income → Deductions → Review → File); this page is five stacked dossiers with no stepper.
- The filing-office identity (FORM TP-26 stamp, dossier sections) is distinctive and category-appropriate — keep and elevate, don't replace.

## Functional gaps vs competitors
1. **Estimate is click-to-compute, not live.** TurboTax recomputes the refund ticker on every keystroke. Here `calcQuarterly` only runs on button click.
2. No per-section completion signal in the stepper (e.g. vault readiness already exists as `progText` — surface it in the nav).
3. Deadline cards show countdowns but the nearest deadline isn't surfaced in the masthead area.

## What this redesign does (bounded)
- **Live refund ticker**: sticky strip under the masthead, recomputed on every input/payment change via the existing `estimateRefund` — green "EST. REFUND $X" / amber "EST. OWED $X", TurboTax-monitor pattern. The calculator button still writes the full breakdown.
- **Section stepper**: sticky anchor nav (Profile · Calendar · Estimate · Deductions · Vault) with live vault-readiness count.
- **Calculator results reordered**: verdict hero first, then the breakdown numbers.
- **Nearest-deadline chip** in the ticker strip ("Q2 estimates due in 12 days").
- Identity stays "the filing office" — FORM TP-26 masthead, dossier sections, stamp; elevated with the ticker, stepper, and verdict-first results.
- All existing features preserved: situation picker, merged checklist + search + missing-only, deadline countdown + .ics, quarterly calculator, payment ledger vs suggested, deduction comparison, tax-year vaults, accountant packet print.
