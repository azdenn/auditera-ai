# Changelog

Newest first. One entry per deployed change.

## 2026-08-22

**Renamed to Auditera AI.** "Auditly AI" was taken. Every customer-visible
mention updated across the homepage, all three tools, and the PDF reports.
Internal storage keys deliberately left on their old names — renaming them
would wipe saved settings (bundle rules, hidden checks, LeaseLock markup).

**Real loading screen when opening a tool.** The tools are ~2.5 MB, so the new
tab used to sit on an unstyled white "Checking your licence" page that read as
broken. Now a branded screen that names the tool and shows real download
progress.

**Version control and two branches.** Code is on GitHub with `main` (live) and
`testing`. Cloudflare deploys on push. Before this, the only copies were a
disposable sandbox and one desktop folder.

**Licence gate is live and enforcing.** Tools are served only to a signed-in
account holding an active property licence — verified against the live site, an
unauthenticated request returns 401. Four bugs fixed getting here:

- Cloudflare served static files without ever running the Worker, so the gate
  deployed cleanly and did nothing (`run_worker_first`)
- Supabase rejected the synthetic login domain because `.test` is a reserved
  TLD, making real signup impossible
- "Confirm email" was on, mailing confirmation links to addresses that cannot
  receive mail
- Signup created a login but no account row, so the gate refused users *even
  when a property was licensed to them*

**First real account.** Two licensed properties, signed in and opened a tool
end to end.
