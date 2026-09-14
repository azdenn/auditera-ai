# AGENTS.md — Auditera AI

Operating contract for any AI agent working in this repo. Read this first.
Then read `docs/PROJECT_MEMORY.md` and `docs/ENGINEERING-GUIDE.md` before changing code.
The historical local handbook contains private examples and is not published in Git.
`START_HERE.md` indexes project continuity and review evidence.

## Project memory — owner-requested working practice

- Before work, read the compact current checkpoint in `docs/PROJECT_MEMORY.md`.
  Consult its linked review and lessons for the area being changed.
- After each material work slice, update the checkpoint and append an entry to
  `docs/WORK_LOG.md`: exact changes, verification and failures, unresolved issues,
  deployment status and the next action. Record reusable mistakes and their
  prevention in `docs/LESSONS.md`. Preserve earlier evidence when correcting it.
- Mark facts as verified, owner-stated, reported by an earlier handoff, proposed,
  or unknown. A passing unit test is not proof of deployment or customer success.
- Keep the checkpoint compact; move history into the log instead of continually
  prepending repeated status paragraphs. Never store credentials, resident
  documents, resident names, raw customer conversations or private extracts here.
- Project memory is documentation for agents to read, not model training or an
  autonomous background process. Another assistant must be given these files.
- Handoffs, plans and memory do not authorize Git mutations, deployment, purchases,
  production-data changes, credentials or external messages. Obtain current scope.
- Preserve existing dirty/untracked work. Review requests authorize diagnostics,
  not implementation of the proposed product fixes.

---

## What this product is

**Auditera AI** — audit tools for multifamily property management. Three tools,
each a single self-contained HTML file that runs **entirely in the customer's
browser**:

| Tool | Compares |
|---|---|
| **LeaseVerify** | signed lease PDFs vs. the ResMan rent roll |
| **ConcessionVerify** | move-in specials vs. resident ledgers |
| **DepositVerify** | deposit / LeaseLock coverage |

Sold at **$50 per property per month**. Customers are property managers; the
documents are real leases with real residents' names in them.

---

## The five rules that must never be broken

1. **Documents never leave the browser.** Each tool makes exactly ONE network
   call — the licence check — carrying only `{tool, detected_name,
   detected_address}`. Usage stats send exactly five numeric/enum fields. Never
   add a field to either without reading the tests that pin them
   (`deposit_tool/test_selfcontained.cjs`, `lease_tool/test_usage_stats.cjs`).
   This is the product's main selling point, not a nice-to-have.

2. **Never put a bypass switch inside a tool.** No "skip the licence check in
   test mode" flag. A bypass shipped in the product is a bypass shipped to
   whoever opens devtools. Tests pass the gate by doing what the real dashboard
   does — see `shared/test_gate_stub.cjs`.

3. **Never handle the Supabase `service_role` key in client code or in the
   Cloudflare Worker.** Edge Functions only.

4. **Softening a finding is the expensive mistake.** A row marked `soft` stops
   being counted. Prefer a false mismatch a human can dismiss over a real one
   the tool hides. Every automatic "this isn't really a finding" rule must be
   narrow and must be justified by the documents, not by convenience.

5. **Never fix a signature false-negative by lowering a threshold.** That is
   exactly how the detector came to report an unsigned lease as signed. See the
   Signatures section of the handbook.

---

## How the code is built

**Always edit `template.html`. Never edit `*_reconciler.html`** — it is
generated and overwritten on every build.

```
lease_tool/template.html      --  node build.cjs  -->  lease_tool/lease_reconciler.html
concession_tool/template.html --  node build.cjs  -->  concession_tool/concession_reconciler.html
deposit_tool/template.html    --  node build.cjs  -->  deposit_tool/deposit_reconciler.html
```

`build.cjs` inlines pdf.js, SheetJS, fflate and the shared modules at marker
comments, then asserts each one survived:

| Marker | Source |
|---|---|
| `<!--AUDIT_GATE-->` | `shared/audit_gate.js` |
| `<!--RR_PROPERTY_NAME-->` | `shared/rentroll_property_name.js` |
| `<!--PROPERTY_RULES-->` | `shared/property_rules.js` |

There is one copy of each shared module and three tools. Three divergent copies
of the rent-roll reader is what caused the "Current" outage — do not reintroduce
per-tool copies.

`shared/property_guard.js` is duplicated **character-for-character** inside
`edge/authorize-audit.ts`. **Change one, change both**, or the browser hint and
the server's authoritative answer will disagree.

The root `node build.cjs` now builds all three tools using the shared locked
`lease_tool/node_modules` dependencies and copies them into `dist/tools/` — that is
what deploys. Root `node build.cjs --check` verifies the inputs/artifacts/manifest.
Both redeploy batch scripts require this check to pass. Per-tool builds still emit
local reconciler files only. `node test-local.cjs` is focused coverage, not the full
private-document suite. No build/test command grants deployment permission.

---

## Deployment — git does NOT deploy

```
dist\redeploy-testing.bat   ->  testing.auditera.net     (Azden only)
dist\redeploy.bat           ->  auditera.net             (LIVE - customers)
push.bat                    ->  pushes the `testing` branch    (record only)
promote-to-main-safe.bat    ->  fast-forwards `main`           (record only)
```

Branches are a **record**, not a deployment target. Reverting `main` changes
nothing until a redeploy runs. This has caused three separate rounds of "the fix
shipped" when nothing had shipped — if code is provably correct everywhere
except in the browser, the missing step is a **deploy**, not a push.

`promote-to-main.bat` (without `-safe`) is broken. Use the `-safe` one.

Both sites serve the same `dist/` folder; only the worker `name` in
`wrangler.testing.jsonc` differs. **They share one Supabase project and one
Stripe account** — an account created while testing is a real account, a
property licensed while testing is really licensed, a checkout completed on
testing is a real charge.

After a deploy, hard-refresh (Ctrl+Shift+R) and close any open tool tab.

---

## Testing

Plain Node scripts, no framework. `node test_x.cjs` from the tool's directory.
Playwright drives the browser ones; Chromium lives at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (adjust for your machine).

Any test that loads a tool page needs `installGateStub(page)` and `GATE_HASH`
from `shared/test_gate_stub.cjs`, or it hangs at the licence check.

~19 LeaseVerify test files need **real resident documents** that are not in the
repo (`a105_test/`, `gca_test/`, `boa_test/` PDFs). They fail with `ENOENT`.
That is expected in a clean checkout — it is not a regression. The synthetic
fixtures regenerate from the committed `gen_*.cjs` scripts.

### Two blind spots, both proven repeatedly

1. **Configuration is untested.** Almost every serious bug in this project lived
   in Cloudflare, Supabase or Stripe settings, not in code. Verifying against
   the live URL after deploying is its own required step.
2. **A test can silently test nothing.** An RLS-blocked `UPDATE` affects zero
   rows and raises nothing. `INSERT ... SELECT` from an RLS-hidden table inserts
   nothing and raises nothing. Navigating between two URLs differing only by
   hash never re-runs page-load code. **Seed real state first, and confirm the
   code under test actually ran.**

---

## Working style Azden expects

- **Recommend a model before each new work slice.** The first line of the first
  response to a new request must be a prominent Markdown heading with bold model
  and reasoning effort (for example, `# **MODEL: TERRA — MEDIUM**`). Briefly state
  why, then pause work until Azden says the model is changed/continue. Once confirmed,
  proceed without repeating the pause during that same slice. Optimize for usage as
  well as quality; do not default every task to Astra. Reserve stronger reasoning for
  genuinely difficult architecture/security/debugging. Do not claim exact subscription
  savings from API prices or change models automatically.
- **Do it, don't delegate it.** If you have a tool that can perform a step,
  perform it and say it is done. Only hand a step back when you genuinely
  cannot reach it, and say plainly why.
- **One step at a time** for multi-step setup. Give the next step and wait.
- **Verify, don't assume.** Nearly every serious bug here was invisible to the
  test suite and only appeared when something real was poked.
- **Say the honest limit out loud**, including the inconvenient parts.
- **Never paste credentials into chat.**

---

## Privacy rules for test fixtures

Real resident documents must **never** be committed. The Rail's export contains
700+ real residents. Rent rolls contain hundreds of rows of real names. When a
fixture is needed, reproduce the real *shape* with invented names — that is what
`test_property_quirks.cjs` does.

The one exception already in the repo: `lease_tool/gca_test/a309_p18_crop.png`,
a small rendered crop of one signature block, used as the real-world regression
case for ink detection.
