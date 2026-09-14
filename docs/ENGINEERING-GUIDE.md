# Auditera engineering guide

Portable development context without customer document extracts. Read AGENTS.md,
PROJECT_MEMORY.md and LESSONS.md first. Historical local handbooks and exports may
contain private examples; they are not part of this release commit.

## Build and release

Edit each tool's template.html, not generated reconciler HTML. Shared code is in
shared/. Root `node build.cjs` inlines locked dependencies and shared modules into
all three tools, copies them to dist/tools, and updates tools-build-manifest.json.
`node build.cjs --check` verifies exact source, dependency and output hashes.

Use locked dependencies in lease_tool/node_modules. Playwright is separately required
for browser tests; NODE_PATH may point to that installation. `node test-local.cjs`
uses synthetic fixtures and mocked browser networking. Private-fixture suites are
not included. Missing private fixtures must never be described as passing tests.

Git does not deploy. The testing Worker is selected explicitly by
dist/wrangler.testing.jsonc. Never deploy production or push a branch without current
owner authority. Both sites share backend accounts and billing, so testing is not
a sandbox for purchases or account changes. Verify the deployed manifest, access
gate and testing noindex separately from local tests.

## Audit boundaries

Current tools process documents locally. Do not add outbound document, resident or
chat data. License checks and outcome telemetry have pinned payload tests. Never
introduce a gate bypass or put service-role credentials into client/Worker code.

Reconciliation matches charge categories, approved aliases, named/amount pairs and
validated bundles. Preserve unresolved amounts, missing disclosure and signatures.
The browser-local assistant may propose a convention, but the manager approves its
meaning and deterministic code validates and applies it. Repetition alone is not
evidence that a mismatch is harmless.

Bedroom defaults are alternatives, not additive bundle components. Only a uniquely
matching amount can resolve the billed tier; equal-price duplicates remain reviewable.
Never lower signature thresholds to repair a false negative: preserve structural
printed-line rejection and regression tests for unsigned documents.

## Local assistant memory

The pilot runs on testing/local origins, not production. It stores compact approved
alias, includes and separate conventions by origin, signed-in user and property.
Separate is a local constraint, not a shared/backend schema extension. Unknown
answers create no persistent rule. No raw conversation or document evidence is stored.

Uniform inclusion requires consistent evidence. Explicit unitemised scope applies
only where the grouped bill and an unresolved lease-side member exist without a
separate bill for that member. Missing groups and separately billed amounts stay
checked. Revalidate saved membership against baseline each run; suspend unsupported
rules. Shared conventions take precedence over conflicting local drafts.

Approval previews show scope and eligible/excluded counts. A failed persistence
operation must apply none of a multi-rule approval. Individual removal and forgetting
all rules must restore checks. Tests must exercise actual reconciliation, not inject
assistant state to imitate an end-to-end flow.

This is a limited local interpreter, not a hosted AI model. General conversation,
arbitrary unit exceptions and cross-browser shared memory need further design and
verification. Current status and next acceptance steps belong in PROJECT_MEMORY.md.
