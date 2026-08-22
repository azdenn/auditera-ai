# How the two branches work

## The short version

- **`testing`** — where changes land first. Has its own URL. Break things here.
- **`main`** — the live site your dad and customers use. Only gets changes that
  already worked on testing.

You stay on `testing` by default. `setup-github.bat` leaves you there on
purpose.

## Day to day

| You want to... | Double-click |
|---|---|
| Put changes on the testing site | `push.bat` |
| Make the live site match testing | `promote-to-main.bat` |

`push.bat` warns you if you are somehow on `main`, since that is the live site.
`promote-to-main.bat` merges testing into main, pushes, and puts you back on
testing so you cannot accidentally keep working on the live branch.

## Two things to know

**The testing site has a different URL.** Cloudflare gives non-production
branches their own preview address. That URL has to be added to Supabase under
Authentication → URL Configuration → Redirect URLs, or sign-in will fail on the
testing site while working fine on the live one. Add it once, after Cloudflare
shows you the preview URL.

**Both branches share one database.** Testing and production point at the same
Supabase project today, so an account created while testing is a real account,
and a property licensed while testing is really licensed. Be deliberate about
test data. The proper fix is a second Supabase project for testing — it is on
the roadmap (Phase 1) and worth doing before anyone outside the family is using
this.

## If a change breaks the live site

```
git checkout main
git revert HEAD
git push
```

That undoes the last change and redeploys. This is the main reason the repo is
worth having.
