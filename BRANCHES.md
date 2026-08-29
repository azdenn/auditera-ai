# How the two branches — and the two sites — work

Rewritten 2026-08-29. The earlier version described Cloudflare preview URLs
appearing automatically per branch. **That never existed**, and believing it
cost several rounds of "the fix isn't working" when nothing had been deployed.

## The two things that are easy to confuse

**Branches are a record. Sites are what people see.** They are separate, and
git does not connect them.

| | `testing` | `main` |
|---|---|---|
| what it is | where changes land first | a record of what actually shipped |
| changes the site? | **no** | **no** |

| | testing site | live site |
|---|---|---|
| URL | `auditera-testing.azden-kumar.workers.dev` | `auditera.net` |
| deployed by | `dist\redeploy-testing.bat` | `dist\redeploy.bat` |
| who sees it | just you | Janine, your dad, customers |

## Day to day

```
apply-update.bat                 Claude's changes land in the repo
push.bat                         saved to the testing branch
dist\redeploy-testing.bat        try it, on a site nobody else uses
      ... when it looks right ...
dist\redeploy.bat                the SAME files go live
promote-to-main-safe.bat         record on main what just shipped
```

Both sites serve the same `dist/` folder, so going live is not a rebuild —
it is the identical files, published to a second worker. Nothing can drift
between what you tested and what customers get.

`push.bat` warns if you are somehow on `main`. `promote-to-main-safe.bat`
never checks out `main` locally (OneDrive used to corrupt the working folder
when it did) — it fast-forwards `main` on GitHub and leaves you on `testing`.

## Two things to know

**The testing site needs its URL allowed once**, or sign-in fails there while
working fine live: Supabase → Authentication → URL Configuration → Redirect
URLs → add `https://auditera-testing.azden-kumar.workers.dev/**`. Checkout
already accepts any `*.workers.dev` origin.

**Both sites share one database.** An account created while testing is a real
account; a property licensed while testing is really licensed. Be deliberate
about test data. A second Supabase project is on the roadmap and worth doing
before anyone outside the family is using this.

## If a change breaks the live site

Because `main` records what shipped, the last good `dist/` is recoverable:

```
git checkout main
git revert HEAD
git push
```

…then run `dist\redeploy.bat` — **the revert alone changes nothing until you
deploy.** That last sentence is the whole reason this file was rewritten.
