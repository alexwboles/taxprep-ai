# 🧾 TaxPrep AI

**Tax season, minus the shoebox.** Tell it your tax situation — W-2 employee, freelancer, homeowner, investor — and get a personalized document checklist, a vault tracker for what you've gathered, and countdowns to every federal deadline.

## The problem

Tax prep fails in February for decisions you made in April: a missing 1099-NEC from a client, no mileage log, the K-1 that arrives in March that you forgot existed. People discover what they needed *after* the deadline pressure starts.

## The solution

TaxPrep AI runs **100% locally in your browser**:

1. **Pick your situations** — W-2 employee, freelancer/1099, homeowner, investor (mix and match). Your checklist merges automatically, with shared documents deduplicated.
2. **Document vault** — every document shows what it is and where to find it. Tap its status to cycle **Missing → Received → N/A**, and attach notes ("in the filing cabinet", "emailed accountant 3/2"). A progress bar tracks your readiness.
3. **Deadline countdowns** — Q1–Q3 estimated payments, the April 15 filing deadline, and the October 15 extended deadline, each with a live "in N days" countdown. Urgent ones (≤30 days) are highlighted.
4. **Situation-specific guidance** — 21 documents across the four situations, each with a plain-English description and where to actually find it.

Optional: set `OPENAI_API_KEY` for AI document help in a future version — everything works fully offline without it.

## Privacy

**Nothing leaves your device.** No account, no server, no analytics. Your tax situation stays in your browser's localStorage.

## Run it

No build step, no dependencies.

```bash
# any static server works:
npx serve .
# or
python3 -m http.server 8080
```

Then open http://localhost:8080 (or :3000 for `serve`).

## Pricing vision

- **Free** — unlimited checklists, vault tracking, deadline countdowns, forever.
- **Plus ($6/mo)** — cloud sync, April email reminders, printable document packet for your accountant.

## Tests

```bash
bash test/smoke.sh   # file/syntax/logic checks
bash test/e2e.sh     # end-to-end checklist + deadline flows
```

## Disclaimer

> ⚠️ **General guidance only — not tax advice.** Deadlines shown are recurring U.S. federal dates; state dates and holiday shifts vary. When in doubt, ask a tax professional.
