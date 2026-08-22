# Deploying Auditera AI

## The short version

**Double-click `redeploy.bat`.** That's it.

Claude writes updated files straight into this folder, so there is nothing to
download or unzip — just run the batch file when you want the changes live.

Live at: https://auditera.azden-kumar.workers.dev

## What's in here

| File | What it is |
|---|---|
| `index.html` | The homepage — marketing, sign-in, tool launcher. Public. |
| `tools/*.html` | The three tools. **Never served without a valid licence.** |
| `_worker.js` | The gate. Checks session + licence before serving any tool. |
| `wrangler.jsonc` | Cloudflare config, including the Supabase values. |
| `redeploy.bat` | Double-click to deploy. |
| `_headers`, `_redirects`, `.assetsignore` | Cloudflare housekeeping. |

## If `redeploy.bat` doesn't work

Open PowerShell in this folder and run `npx wrangler deploy` to see the full
error. Most likely causes:

- **Not logged in** — run `npx wrangler login`, then try again.
- **Node not installed** — `node -v` should print a version. If not, install
  the LTS build from nodejs.org.

## Do not edit anything in this folder by hand

These files are generated. Anything changed here is overwritten on the next
update, and the source lives elsewhere. Ask Claude to make the change instead.

## The one setting that must not be removed

`wrangler.jsonc` contains:

```jsonc
"run_worker_first": ["/tools/*"]
```

Without it Cloudflare serves the tool files directly and **never runs the
gate** — the site looks fine and the licence check silently does nothing.
This was a real bug, not a hypothetical one.
