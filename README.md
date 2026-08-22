# Auditly AI

Audit tools for multifamily property teams. Three browser-only tools —
**LeaseVerify**, **ConcessionVerify**, **DepositVerify** — behind a licence gate.

**Live:** https://auditera.azden-kumar.workers.dev

## The one rule

**Documents never leave the browser.** Lease PDFs, rent rolls and ledgers are
parsed entirely client-side. Nothing is uploaded, stored, or logged. This is the
product's main selling point — protect it in every change.

## Layout

| Path | What |
|---|---|
| `lease_tool/` | LeaseVerify — leases vs. rent roll |
| `concession_tool/` | ConcessionVerify — move-in specials vs. ledgers |
| `deposit_tool/` | DepositVerify — deposit coverage |
| `homepage_assets/` | Homepage, the Worker gate, and the site build |
| `dist/` | The deployable site (generated — see below) |

## Building

Each tool is one hand-edited `template.html` compiled by its `build.cjs` into a
single self-contained `*_reconciler.html`. **Edit `template.html`, never the
built file.**

```
node lease_tool/build.cjs
node concession_tool/build.cjs
node deposit_tool/build.cjs
node homepage_assets/assemble.cjs   # assembles dist/
```

## Deploying

```
cd dist
npx wrangler deploy
```

`dist/wrangler.jsonc` must keep `"run_worker_first": ["/tools/*"]`. Without it
Cloudflare serves the tool files directly and **never runs the licence gate** —
the site looks fine and the protection silently does nothing.

## Tests

Plain Node scripts, no framework. `node <file>`.

- `homepage_assets/test_worker_gate.mjs` — 19 gate unit checks
- `homepage_assets/test_gate_integration.mjs` — 15 checks, real browser + real Worker
- `lease_tool/`, `concession_tool/`, `deposit_tool/` — `test_*.cjs` per tool

Note: the suite covers application code only. Deployment and platform config
(Cloudflare routing, Supabase auth settings) are **not** covered and have been
the source of real bugs. Verify against the live URL after deploying.

## Branches

- `main` — production
- `testing` — staging / work in progress
