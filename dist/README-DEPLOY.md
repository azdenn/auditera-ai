# Deploying Auditera AI

## Two sites, one folder

| | URL | Deployed by | Who sees it |
|---|---|---|---|
| **Testing** | `auditera-testing.azden-kumar.workers.dev` | `redeploy-testing.bat` | just you |
| **Live** | `auditera.net` | `redeploy.bat` | Janine, your dad, customers |

Both serve the files in **this folder**. Nothing else differs — same Supabase
project, same accounts, same licences. What makes them separate sites is the
worker name in `wrangler.testing.jsonc`.

## The loop

```
apply-update.bat        Claude's changes land in the repo
push.bat                saved to the testing branch on GitHub
dist\redeploy-testing.bat    ->  try it on the testing site
        ... when it looks right ...
dist\redeploy.bat            ->  the SAME files go live
promote-to-main-safe.bat     ->  record it on main
```

**Git does not deploy anything.** `push.bat` and `promote-to-main-safe.bat` are
version control — they keep a record of what shipped so a bad change can be
undone. Only the two `redeploy` scripts change what a browser sees.

**Testing and live come from the same folder, so promoting is not a rebuild.**
Once the testing site looks right, `redeploy.bat` publishes the identical
files. There is no step in between where something can drift.

## First-time setup (once, and only once)

The testing site needs its address allowed for sign-in, or logging in there
will fail while working fine on the live site:

**Supabase → Authentication → URL Configuration → Redirect URLs**, add:

```
https://auditera-testing.azden-kumar.workers.dev/**
```

Checkout already accepts it — `create-checkout.ts` allows any `*.workers.dev`
origin.

## Both branches share one database

An account created while testing is a real account. A property licensed while
testing is really licensed. **Be deliberate about test data.** A second Supabase
project for testing is on the roadmap and worth doing before anyone outside the
family is using this.

## If a deploy doesn't work

Open PowerShell in this folder and run the command the batch file runs, to see
the full error:

```
npx wrangler deploy                                   # live
npx wrangler deploy --config wrangler.testing.jsonc   # testing
```

- **Not logged in** — `npx wrangler login`, then try again.
- **Node not installed** — `node -v` should print a version. If not, install
  the LTS build from nodejs.org.

## Do not edit anything in this folder by hand

These files are generated. Anything changed here is overwritten on the next
update, and the source lives elsewhere. The exceptions are the four config
files this README lists — `wrangler.jsonc`, `wrangler.testing.jsonc`,
`_headers`, `.assetsignore` — which are maintained here on purpose.

## The one setting that must not be removed

Both wrangler configs contain:

```jsonc
"run_worker_first": ["/tools/*"]
```

Without it Cloudflare serves the tool files directly and **never runs the
gate** — the site looks fine and the licence check silently does nothing. This
was a real bug, not a hypothetical one. It matters on the testing site too: a
testing site without it is a way to get the tools without a licence.
