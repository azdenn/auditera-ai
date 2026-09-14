# Auditera AI — start here

This is the existing Auditera repository, not a replacement project.

1. Read `AGENTS.md` for safety and development rules.
2. Read `docs/PROJECT_MEMORY.md` for owner intent, current state and next work.
3. Read `docs/ENGINEERING-GUIDE.md` for portable domain and engineering guidance.
4. Read the relevant evidence and lessons linked from the project memory.

The memory is maintained project documentation. It does not train a model,
guarantee automatic recall in another product, or authorize deployment, billing,
production-data changes, credentials, Git mutations or external messages.

Historical handoffs remain useful references. Their proposed next steps are not
current authorization, and their test/deployment claims require verification.

## Local build and focused checks

Install the shared locked dependencies with `npm ci --prefix lease_tool --ignore-scripts --omit=optional`.
From the repository root, `node build.cjs` builds all tools and updates `dist/tools/`;
`node build.cjs --check` verifies the exact deployable artifacts without writing.
`node test-local.cjs` runs the focused acceptance suite, not the absent private fixtures.
Playwright must be resolvable (via installation or NODE_PATH). The test bootstrap uses
installed Edge on Windows, or AUDITERA_BROWSER_PATH / AUDITERA_BROWSER_CHANNEL when
set, and blocks external browser traffic except explicit test stubs. See the work log
for this machine's runtime location. These commands do not push or deploy.
