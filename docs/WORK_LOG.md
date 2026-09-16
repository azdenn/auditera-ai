# Auditera work log

## 2026-09-15 — Replacement Garden Creek archive / A114 follow-up

Owner supplied `GCA Resident_Documents_09-15-2026_10_41_50.zip` in the existing
local real-estate document folder (1,079,931,398 bytes; readable, replacing the
previously unusable August export for diagnostics). Inspected both A114-folder
signed candidates and visually reviewed each LeaseLock addendum. Current deployed
parser recognizes $33 and all five required fields on pages 33/32, with no missing
signature findings in either packet. One candidate's document unit is different
from its folder unit; never infer identity only from folder placement.

Full original ZIP + available August 12 rent-roll upload completed locally with
network-blocked test routing. The acceptance assertion that A114 was in results
failed twice (first exact lookup, then normalized lookup). Investigation using
the real application rent-roll parser confirmed A114 is vacant with no charges
or lease dates in that older roll; normal reconciliation intentionally excludes it.
This is a fixture-period mismatch, not evidence of a new reconciliation failure.
Do not call the A114 end-to-end issue resolved yet. Owner asked for a current roll.

Root build parity passes for all three tools and the public testing manifest
still exactly matches the locally tested artifact. No product changes, deploy,
backend changes or production changes in this follow-up. Only continuity docs
updated; private PDFs, renders and diagnostic scripts remain outside canonical Git.

## 2026-09-15 — Real-document signature/waiver fixes and one-page assistant

Owner requested fixing the acceptance feedback, testing only. Reviewed actual local
Blanco PDFs and Janine archive/rent roll. No resident documents/names were added to
the repo; diagnostics and rendered private pages are outside the canonical repo.

Changes: lease template isolates resident caption columns, does not mask whitespace,
gives ordinary underscores the same thin structural treatment as encoded rules,
and masks at each glyph's actual baseline. No detection thresholds were lowered.
Real typed/handwritten false negatives recovered; original unsigned control retains
22 missing locations. Supported the actual one-page LeaseLock addendum, including
integer $ amount, written-out date and separate signature/date captions, without
borrowing subsequent certificate evidence. Agreement rows now distinguish the
signed-form check from the already-existing charge-category match. Similar known
waiver names classify together; equal amounts do not imply equivalence.

Assistant: all questions on one review page, visible selection states, optional
written explanation, batch preview/approval, and explicit continue-unchanged action
when validation rejects a selection. Structure raw labels resolve only through a
unique observed comparison label. Cable is offered with other package members.
No new API/network payload, model provider, shared-rule write, or global property rule.

Verification: 28/28 focused suites; names 21/21, waiver 27/27, ink 16/16; new review
page browser test verifies multi-question batch, highlight, mobile width, approval
and blocked-validator exit. Real Janine normal upload/Process/choices/approval flow
completed offline for 102 units: 5 eligible cable, 14 washer/dryer, pet separate,
results visible. First harness attempt used file origin (pilot disabled) and timed
out; corrected to testing-origin mocked routing. Not evidence of live authentication.
Dry-run testing deployment and root build parity pass.

Unresolved: A114 requires a readable Garden Creek lease/export; discovered Downloads
archive is empty (0 bytes). Do not assert that exact report resolved. Some local
Blanco exports differ from the screenshots' resident/version; reviewed cases do
not prove every screenshot row is fixed. Further manager acceptance remains needed.

Release: testing deployed September 15 local time (2026-09-16 01:36 UTC), Worker
version `53396760-4824-4638-a0e6-c6101b20461f`. Public build manifest matches local
bytes: `3c714361f389babaaf85757a97913189416ddd837ca4856eaa882988dfb7d846`.
Testing app 200/noindex/nofollow; unauthenticated tool 401. Production homepage
SHA-256 unchanged: `cf22c309afccd6dab157a423feb7160aa34e693dd4e4f27f046a0e19fc485def`.
Release commit `4ca3820b29f7051e58bfacf989c60ab96b3a766d` pushed to GitHub testing;
`ls-remote` confirmed the exact SHA. Owner is arranging the replacement source file;
A114 remains unverified until that arrives. Main and backend were not changed.

## 2026-09-13 — Local-only storage migration

Owner requested copying this application and its separate historical workspace
outside OneDrive. Every file was SHA-256 verified and Git status matched before
migration documentation edits. Original folders were retained; prior destination
versions and settings backups are under `C:/Users/azden/CodexLocal/migration-20260913`.
Updated canonical location in project memory and historical workspace instructions.
Saved app-server project roots were changed. The open desktop app still holds
conversation locks; the offline finish helper must complete before claiming all
existing tasks are switched. No product code, deployment, push or backend changes.

Append compact evidence-backed records. Keep current priorities in PROJECT_MEMORY.md.
Report local implementation, test result, customer confirmation and deployment
separately. Earlier handoff claims remain historical unless independently reverified.

## 2026-09-12 — Owner-requested memory implementation and project review

Request: implement durable development memory; inspect other tasks' approaches;
review the existing project and advise on property-specific AI clarification.

Changed in the canonical repo:

- `AGENTS.md`: mandatory startup/update memory workflow and evidence/authority boundary.
- `START_HERE.md`: portable entrypoint.
- `docs/PROJECT_MEMORY.md`: owner goals, actual checkpoint, next work and open decisions.
- `docs/LESSONS.md`: reusable failure patterns and prevention.
- `docs/REVIEW-2026-09-12.md`: prioritized findings, proposed architecture, UI review,
  checks and limits.
- `docs/review-checks.cjs`: repeatable read-only/synthetic diagnostics; optional offline
  headless browser inspection. Not production code and not an acceptance gate.
- This work log.

Also added canonical-memory pointers to `AGENTS.md` and `START_HERE.md` in the
older `Documents/ChatGPT/Auditera` workspace, without removing its historical files.

Inspected the AZDEN Main Chat's project-memory/index instructions and CXR Main Chat's
character checkpoint. Task retrieval returned no recent item bodies, so the actual
local memory files supplied the usable evidence. Adopted compact checkpoint + log +
lessons; did not copy other projects' goals, data, execution permissions or active work.

Preserved pre-existing changes to `dist/_worker.js`, `dist/app.html`,
`dist/tools/leaseverify.html` and all other dirty/untracked work. No source archive
was applied. No build, product fix, commit, push, deploy, backend write or paid model call.

Verification:

- Existing shared rule suite 58/58; property guard 18/18; legacy Worker suite 19/19.
- Authorization suite initially ENOENT (hardcoded `/home/claude` source path), then
  47/47 with that source path replaced in memory only; file unchanged.
- Six mocked cases against `dist/_worker.js` passed.
- Rule status and negative-language defects reproduced in source and deployable HTML.
- Browser engine reproduced an undisclosed fee losing issue status through a saved
  rollup, and an extreme invoice softening solely because coverage exceeded 31 days.
- Homepage and all three upload screens loaded offline without page errors; no initial
  horizontal overflow at desktop/mobile widths. Screenshots inspected, not full UI QA.
- Read-only HTTP HEAD checks: public/testing roots 200; testing lacks X-Robots-Tag.
- Full commands, scope and limits in the review; synthetic diagnostic command:
  `node docs/review-checks.cjs` from the canonical repository.
- Final validation: diagnostic syntax check passed; memory links have zero missing
  targets; `git diff --check` found no whitespace errors. SHA-256 checks confirm
  all three pre-existing modified dist files are byte-for-byte unchanged from the
  review's starting snapshot. Documentation remains local/uncommitted, not on GitHub.

Initial browser launch/network checks were sandbox-blocked; scoped approved retries
succeeded. No permission setting was weakened. A first attempt to create a nested
review directory failed; the diagnostic was saved directly under existing `docs/`.

Current recommendation: reconcile source/build safely, fix evidence-suppression and
intent handling, then pilot one scoped property-clarification workflow. Implementation
of those product changes requires the owner's next request. Live billing, actual
customer persistence, private fixtures and full security readiness remain unverified.

## 2026-09-13 — Pre-results assistant requirement clarified

- Owner requested fixing the review's defects, then asked to clarify the assistant
  design before starting implementation. No product fixes started in this turn.
- Updated PROJECT_MEMORY.md: assistant proactively asks about ambiguous/repeated
  patterns after preliminary analysis but before final results, remembers approved
  property conventions and rechecks them on later runs. Around 80 mismatches was
  an example, not an approved detection threshold.
- Distinguished owner requirements from proposed safeguards and the unresolved
  skip/provisional-results interaction. Repetition alone must never suppress a finding.
- Documentation-only update; technical findings remain the September 12 snapshot.
  No tests, builds, Git mutations, deployments, backend changes or paid calls.
- Next: settle pre-results question behavior, then perform the requested defect fixes
  in dependency order, beginning with source/artifact reconciliation.

## 2026-09-13 — Explicit response required; agreement optional

- Owner selected mandatory response before results, including an explicit "no" or
  "keep original findings" path that applies no proposed change.
- Updated PROJECT_MEMORY.md with that decision and separated recommended details:
  group questions by pattern; preserve baseline findings/valid prior rules; never
  equate rejection with a verified match or permanent suppression.
- Memory-only change. No application changes, tests, release or external mutations.
- Mandatory-response choice is settled. Cross-run declined-proposal behavior and
  service-failure recovery remain design details; no new paid/data-flow authority.

## 2026-09-13 — First implementation batch, local only

Owner requested implementation, starting with the previously reviewed defects.
Worked directly in the canonical repository, not the historical Codex workspace.
No Apply Update batch was run. No new task, branch, commit, push, deploy, backend
write, credential change or paid model call. Testing remains at HEAD f5934c0.

Source recovery:

- Inspected canonical auditera-update.zip (29 entries); its three dist artifacts
  matched the existing dirty versions. Selected only 22 newer/missing source/test
  entries, explicitly skipping dist and generated reconciler files. Checked source
  targets for pre-existing changes before replacing; saved replaced originals under
  `C:/Users/azden/OneDrive/Documents/ChatGPT/Auditera/.tooling/pre-repair-20260913`.
- Recovered newer lease template, shared gate/rules, Edge authorization/outcome
  source, analytics SQL and later lease regressions. These are recovered prior work,
  not claims that this agent newly implemented the archived features.
- Rebuilt recovered LeaseVerify before repairs: exact SHA-256 match to the prior
  dist tool e3bf89227e471234082d9c2717bb76a1a0f9b1472d2e477ee7452379d644e362.
  This establishes the previously missing source/artifact relationship.
- `npm ci --ignore-scripts --omit=optional --no-audit --no-fund` succeeded in lease_tool.
  Attempts in concession/deposit failed because they have no package-lock files.
  Resolved by using the one existing locked dependency set for every tool, not by
  inventing different dependency versions. No dependency vulnerability audit claimed.

Implemented changes:

- New shared/build_tool.cjs, root build.cjs, three thin per-tool build entrypoints:
  exact inline-marker checks, common vendor inputs, source/script/dependency hashes,
  automatic dist copies and tools-build-manifest.json. Root --check fails on missing
  or changed artifacts and a stale manifest. Both redeploy scripts check first.
- shared/property_rules.js and lease template: blocked evidence suspends; invalid
  loaded shapes suspend; malformed keys cannot crash proposal rendering; only active
  saved rules apply; reruns derive evidence without saved-rule transformations;
  saved hide state is separate from user filters and cleared on rebuild. Billed but
  unsigned rows remain findings even with stale hide/rollup rules. Negative or
  uncertain instructions do not imply aliases; explicit original-findings language
  produces no proposal. Raw typed hide reasons replaced with a fixed description.
- shared/audit_gate.js and lease template: disclose failed/malformed loads, reload on
  every processing run, clear property state when unresolved, require returned-row
  evidence for deletion, and reject empty/malformed save responses. Updated mocked
  persistence to model affected rows. This does not prove real RLS or concurrency.
- Deposit template: duration alone no longer softens invoice differences; notes say
  rate/proration remains unverified. Updated the private-fixture expectation for the
  45-day example to remain a discrepancy (that fixture suite was not executed).
- Concession template: consistent required ledger/rent-roll and optional/recommended
  lease copy, with limits of signed-term verification and recurring-fee coverage.
- Actual dist Worker now imported by unit and local HTTP/browser integration tests;
  portable authorization source path; all three Wrangler configs use worker-first.
  Removed legacy Worker overwrite from homepage assembly (assembly itself not run).
- Added test-only browser bootstrap, regression suites and root test-local.cjs. No
  test bypass added to shipped customer code. Test requests use fake sessions and
  explicit mocks; other browser network traffic is blocked.

Final verification:

- `node build.cjs` and `node build.cjs --check`: all three built and verified.
- `node test-local.cjs`: **24/24 suites passed, 470 assertions**. Breakdown:
  build guard 5; review repairs 17; shared rules 58; property guard 18;
  authorization logic 47; deployable Worker unit 30; browser licence gate 61;
  dashboard/Worker/tool HTTP integration 15; saved-rule/invoice browser repairs 19;
  invoice-row parsing 14; fourteen restored lease suites 186 combined.
- Those fourteen lease suites: bundle_price 18, bundle_tiers 9,
  same_charge_different_name 10, bundle_coincidence 7, includes_picker 16,
  tier_siblings 15, filter_counts 9, signature_summary 9, charge_structures 14,
  usage_stats 12, signature_names 17, deposit_waiver_agreement 20,
  signature_ink 16, lease_filed_wrong_unit 14. The permitted committed small
  signature crop was present and its ink checks ran locally; no full leases used.
- `test_option_filters.cjs` additionally attempted: initial coverage check ran, then
  ENOENT for its missing private lease fixture. Excluded from the passing suite count.
  Full private-fixture/signature/export/privacy runs remain outstanding.
- Read-only docs/review-checks.cjs reproductions now show blocked rules suspended
  with unchanged findings and oversized invoices flagged at both 31 and 32 days.
  Six mocked Worker cases pass. Initial four-page desktop/mobile inspection has no
  script errors or horizontal overflow; concession screenshot visually checked.
- Screenshots: older workspace `.tooling/repair-2026-09-13/`. This is limited initial
  rendering QA, not a complete accessibility or real-results review.
- Git diff --check passed. Original dirty dist Worker hash remains
  397e94c993d706ef7bcfd1753c6ff657f2293db6a5e69166a9b926b40f1043c7;
  original dirty app hash remains
  1cde9ec18abcab6f22d4f4d85fd7c880844385a3abe012318f35de7f0b187562.

Reproducing on this Windows machine: Node 24.19.0; Playwright is available under
`C:/Users/azden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`.
Add that directory and the canonical lease_tool/node_modules to NODE_PATH, then run
`node test-local.cjs` from the repo root. Bootstrap uses headless installed Edge.
Scoped sandbox approval was needed for canonical build/dependency writes and browser
launches; no permission configuration was weakened. An apply_patch initially applied
some edits before a missing-directory failure; inspected state before completing it.

Remaining: mandatory pre-results assistant and API not built; outbound data contract,
budget and rule-approval role unresolved. Need a current local property example with
expected output and explicit testing-release approval. Live persistence/tenant isolation,
shared testing backend, billing/webhook retry handling, broad allowed origins, full
rule payload allowlisting, chained/conflicting rules, customer exports, accessibility
and security/dependency audit remain open. Do not equate these local passes with
production readiness or claim the sites have changed. Next: testing verification
with owner approval, then the scoped property-clarification pilot.

## 2026-09-13 — Testing release, local assistant pilot, usage preference

Owner explicitly approved continuing repairs and the first assistant on testing
only, with main unchanged. Owner planned to be away about an hour. A local-vs-hosted
question was unanswered; preserved browser privacy and made no paid API calls.
Owner additionally requested a usage-conscious model recommendation before each
new slice (task + model/effort + reason). Saved that contract in AGENTS.md and
PROJECT_MEMORY.md. Recommended Sol/medium for bounded implementation/tests, Astra
for difficult safety/architecture review. No model was switched automatically.
Owner later refined the workflow: make the first line a prominent bold Markdown
model/effort heading and pause until the owner confirms the switch. Recorded the
refinement; owner confirmed Terra/medium for the current authenticated check.

Changes:

- `shared/property_assistant.js`: pure grouping, explicit keep responses, compact
  alias/includes conventions, allowlisted local storage keyed by origin/user/property.
- `shared/property_assistant_ui.js` plus LeaseVerify template integration: mandatory
  pre-results questions, interpretation preview, explicit approval/revalidation/rerun,
  optional browser memory and forget. Editing an answer invalidates its old approval.
  Exports remain gated while clarification is pending. No general language model,
  price-offset/rollup/hide approval, or shared/team memory is claimed.
- Build inlines both modules; three artifacts rebuilt/copied with manifest parity.
  Shared gate helpers block testing-origin rule writes/deletes, and testing's house
  rules panel displays shared conventions read-only. No backend changes made.
- Added pilot guide, two assistant suites to test-local, and lessons L11/L12.
- `dist/.assetsignore` excludes Wrangler caches/env/log/map files from uploads.

Verification:

- Final `node test-local.cjs`: 26/26 suites passed. New pure module suite 13/13;
  actual built-tool browser suite 14/14. Existing focused repair suites still pass.
- Browser tests use invented data, real reconciliation and mocked network requests;
  tested no-change path, approval, true amount finding preservation, reuse/revalidation,
  stale approval, exports gating, forgetting, shared-write refusal and mobile overflow.
  Unit tests cover 80-row grouping, identity scoping, corrupt/quota failures and guards.
- First browser attempt failed on a redundant question: split same-label price rows
  were mistaken for missing disclosure and empty membership. Fixed planner, added
  regression. Another assertion incorrectly demanded status `mismatch`; actual engine
  retained a counted unmatched amount finding. Assert the real finding/filter semantics.
- Root build --check passes. git diff --check returned no errors (Windows line-ending
  conversion warnings only). Existing dist Worker/app hashes remain unchanged locally.
- Updated mobile screenshot visually inspected: older workspace
  `.tooling/repair-2026-09-13/assistant-mobile.png`. Limited synthetic UI QA only.

Deployment, actually performed using cached Wrangler 4.129.0 and --keep-vars:

- Repair-only testing version `dcd5b367-023f-4b81-8817-b2f4aef72326`, replacing
  `d7cf474f-13fa-407f-924b-5d549900f9ff`.
- Pilot testing version `173e362d-354b-4dc3-be9f-cf7759e34eb3`, replacing repair-only.
- Hardening testing version `2eefc818-3aaa-488d-85e7-ba8eb9c0b3ed`, replacing the
  initial pilot. Tested the exact dashboard blob URL: it preserves testing origin,
  browser storage and shared-rule read-only behavior. Overlapping browser rules now
  yield to shared/earlier conventions with a visible warning. Browser suite 16/16;
  full focused suite still 26/26. Live manifest matches local after deployment;
  testing remains noindex/401 gated and main root hash remains unchanged.
- Opened the actual testing dashboard in an isolated visible in-app browser for the
  authenticated smoke check. It correctly reached Auditera's sign-in page and had no
  existing session. Left that tab ready for owner sign-in; did not request, read or
  enter credentials. Authenticated customer-file behavior therefore remains unverified.
- Owner signed in; authenticated dashboard and licensed tool launcher rendered. The
  first actual LeaseVerify launch exposed its bearer token still present in the blob
  URL. No documents were selected or uploaded. Root cause: cleanup passed a rebuilt
  pathname to `history.replaceState`, invalid for a blob document. Updated shared
  `audit_gate.js` to preserve the full blob URL and remove only the fragment; rebuilt
  all tools. Regression explicitly asserts empty hash/no `tk=` on the exact blob path.
  Assistant browser 16/16, gate 61/61, full focused suite 26/26.
- Deployed token cleanup to testing only as Worker version
  `717c8dcc-3bee-4edd-bd33-f8fd3f0fed6a`, replacing `2eefc818...`; all tests passed.
  Live testing manifest matches local and main root hash remains unchanged. An older
  already-open tool tab retains its older code until closed; do not use it for files.
- Owner closed the older tool tab and launched LeaseVerify again from the authenticated
  testing dashboard. Browser inventory verified the new blob URL contains no fragment
  or token. This is live authenticated launch evidence; no resident documents were
  selected and no audit was processed yet.
- Owner then selected real local documents and processed them in the clean testing
  blob tab. The page reported 183 matched leases and produced five questions before
  results. No assistant rule was approved or remembered. Missing-disclosure groups
  behaved as intended. Acceptance screenshots exposed two defects: the grouped-charge
  checklist combined the UNION of every lease-only label across 26 units (including
  the charge's own bedroom tiers and unrelated charges), and a protected Rent pattern
  on 8 of 102 units became a mandatory question despite being impossible to override.
- Reworked package candidates to require a member on every grouped unit, exclude the
  anchor's charge family/tier labels and protected labels, and re-check at approval
  that every selected member is lease-only on every anchored unit. Question generation
  now consumes the property-rule schema's protected patterns and skips Rent/signature
  questions while preserving their findings. Added synthetic union/tier/inconsistent
  approval coverage. Assistant pure suite 15/15; browser 16/16; full focused 26/26.
- First deployment invocation after these tests contained a mistyped cached-Wrangler
  path and failed locally with MODULE_NOT_FOUND before any network/deploy action.
  Corrected command deployed testing-only Worker version
  `6a07fcd7-eadb-4ef3-828f-f27d0edb55c0`. Live manifest matches local; main root hash
  remains cf22c309afccd6dab157a423feb7160aa34e693dd4e4f27f046a0e19fc485def.
  Current real-document tab still contains the preceding build and must be closed;
  acceptance needs a fresh launch/rerun. No main deploy, push or backend/payment change.
- Only auditera-testing deployed. Post-deploy testing manifest exactly equals local;
  root HTTP 200/noindex, robots HTTP 200, unauthenticated tool HTTP 401/no-store.
- Main root/robots/unauthenticated gate are unchanged; main root hash
  cf22c309afccd6dab157a423feb7160aa34e693dd4e4f27f046a0e19fc485def.
- No main deployment, commit/push, schema/RLS/account/payment changes. Existing
  testing branch remains f5934c0 with preserved dirty/untracked work.

Honest limits and next step: no authenticated live customer upload was exercised;
private-document suites remain missing/outside the focused run. Janine's current
case is not proven fixed. Need a local owner-confirmed example/expected result,
then test the deployed flow from a fresh dashboard tool tab. External AI needs a
separate privacy/data contract and budget; broader launch risks remain in the review.

## Entry template for future work

## 2026-09-13 — Reduce pre-results assistant friction (testing source only)

- Owner observed a fresh real-document testing run begin with 14 required
  questions; stopped after retaining the original findings for the first three.
  Do not retain resident data or exact customer document contents in this log.
- Changed `shared/property_assistant.js`: a question must now affect at least
  eight units and 10% of the property. Missing-disclosure rows remain visible as
  findings and no longer create a mandatory question because the local pilot has
  no safe rule it can apply from an explanation. Applied the same threshold to
  proposed conventions, grouped memberships, structural patterns and generic
  repeats.
- Updated pure tests and browser-test seed data so small clusters are explicitly
  non-blocking and meaningful groups still exercise the question flow.
- Verification: `node shared/test_property_assistant.cjs` passed 15/15. Root
  `node build.cjs` completed after sandbox approval regenerated all artifacts.
  `node test-local.cjs` ran under approved local process spawning: 7/26 suites
  passed; the other 19 failed before assertions because `playwright` is absent
  from this checkout. No browser suite result is claimed for this change.
- No deployment, main change, Git commit/push, external API, backend, billing or
  customer-document action. Next: restore the committed/locked browser-test
  dependency or use an equivalent approved test environment, run browser
  coverage, then deploy to testing only and repeat the owner acceptance run.

### Continuation — browser coverage and testing deployment

- With owner approval, installed Playwright into the existing LeaseVerify local
  dependency folder using `--no-save`, then downloaded its local Chromium test
  runtime. The installer reported four pre-existing dependency audit findings;
  no automatic audit upgrade/fix was run.
- The assistant browser suite passed 16/16 with invented data, including the
  dashboard-generated blob page, gated exports, remembered-rule boundaries and
  mobile layout. The focused launcher also passed its initial source and browser
  suites after the dependency restore; preserve the exact captured output rather
  than inferring unreported later-suite counts.
- Ran Wrangler 4.129.0 dry run from `dist` with `--keep-vars` against
  `wrangler.testing.jsonc`; it read only existing asset/Supabase bindings. Then
  deployed only Worker `auditera-testing`, version
  `51a0151d-9da5-4dc7-92c8-ad2833d7c181`. Two assets uploaded:
  `tools-build-manifest.json` and LeaseVerify. No production deployment.
- Read-only verification: deployed testing manifest SHA-256 equals local
  `2f1fdb64798f0889d24d7013f8447e87e03b06eebebcc287ead8036a0bc8f9b3`;
  testing returned `X-Robots-Tag: noindex, nofollow`. The command did not target
  production. Current production root content hash is stable across two reads but
  differs from the historical hash in PROJECT_MEMORY; this is uninvestigated
  external state, not evidence of this testing deployment changing production.
- Next: owner and dad hard-refresh testing, launch a fresh LeaseVerify tool tab,
  rerun their local documents, and report whether only meaningful actionable
  questions appear before results. Main remains untouched.

- Date / user request / scope:
- Exact changes and affected files:
- Tests actually run; passes, failures and missing evidence:
- Owner/customer confirmation (if any):
- Deployment and Git state (do not infer one from the other):
- Remaining issue / next action / required owner decision:
- Reusable lesson added or corrected:

## 2026-09-14 — Guided local assistant follow-ups (testing only)

- Owner-provided manager feedback showed the local pilot rejected normal answers
  about tiered Community Fee and bundled/separate amenities. No customer names,
  documents, amounts, or raw answers were stored here.
- Removed generic repeated-finding questions: they had no safe supported action.
  Supported bundle-structure questions now carry the candidate component and
  render direct Yes / No / I’m not sure choices. No/unsure retain findings.
- Tests: assistant logic 16/16 and Playwright browser suite 16/16, using invented
  data only. Root build check passed.
- Testing-only deployment: `auditera-testing` version
  `3843fd2f-3066-4b9f-bdc3-a4e15ef28752`; only LeaseVerify and manifest uploaded,
  with `--keep-vars`. No main deploy, push, backend mutation, or API call.
- Next: fresh testing run with manager review. Tiered default lease charges and a
  multi-amenity questionnaire remain the next separate build; this release does
  not pretend to understand arbitrary prose.

## 2026-09-14 — Astra verification and safety corrections

- Scope: owner explicitly resumed implementation and asked to check prior-model
  work; testing only. Preserved the dirty worktree, branch testing at f5934c0.
- Source changes: `shared/property_assistant_ui.js` now offers tri-state guided
  amenity choices and useful clarification on unsupported prose. Separate/unknown
  never approve inclusion; separate explanations are acknowledged for this run only.
  Changing any choice invalidates pending approval. No shared writes or API added.
- `lease_tool/template.html`: requires a billed group on the same unit before
  applying includes; separately billed member differences remain findings. Tightened
  both tier-sibling paths to require a resolved amount (allowing already-approved
  bundle discounts). Equal-price duplicate defaults remain unresolved. Both detected
  and saved bundles refuse summing explicit bedroom alternatives.
- `shared/test_assistant_browser.cjs`: removed manual PA.current/PA.pending injection
  after reconcileAll, which left PA.finished true and invalidated the prior gate
  completion test. Restored completion/visible-results/export assertions. Added actual
  engine tests for no billed group, lease-only group, separately billed mismatch,
  unique/duplicate bedroom prices, summed defaults, guided uncertainty and stale
  approval. All fixtures invented; no resident documents loaded.
- Failures preserved: first direct browser invocation lacked NODE_PATH (not a code
  failure). Stronger duplicate-price test exposed an actual premature softening bug.
  First full run then failed bundle_tiers (25/26 suites): an overly narrow equality
  guard missed a legitimate approved bundle discount. Corrected to compare the
  declared expected amount without relaxing duplicate safeguards. Final full run:
  26/26 focused suites pass, browser 26/26. Private-fixture suites not run.
- Built all three tools through root builder; only LeaseVerify and manifest changed
  at deployment. Synthetic mobile screenshot inspected. Build check passed.
- Used existing cached Wrangler 4.129.0; verified command help, dry run, and deployed
  auditera-testing with explicit testing config and --keep-vars. Version
  e7bb71ee-2237-4752-bbae-5e9ed87d8c78. Live manifest byte-for-byte equals local,
  SHA-256 76ab4cd651c9bcba0b9d8a934c99f251d67be90b646f7b82404e29664d7d67a6;
  unauthenticated tool 401; testing noindex. Production manifest endpoint is 404,
  not an empty manifest. Homepage fingerprint via PowerShell text was b9b2b136...927c
  before AND after; raw fetch bytes hash cf22c309...5def matches the historical raw
  fingerprint. Do not compare hashes across these different decoding methods.
- No main deployment, commit/push, backend/account/payment change, or hosted model.
  Remaining: mixed unit/amenity scope, reusable separate constraints, richer contextual
  interpretation, and a real manager acceptance run. Existing strict global membership
  validation still refuses mixed cases rather than softening them. This release is a
  verified repair slice, not completion of the overall chatbot.

## 2026-09-14 — Mixed-plan conventions and reusable separation

- Owner clarified that continued work was authorized where work remained. Continued
  on Astra/medium; kept scope to the local pilot and testing, no hosted API/backend.
- Added local-only `separate` constraints and explicit `includes` scope `unitemised`.
  Neither extends the shared backend rule schema. Separate decisions prevent matching
  automatic/saved bundles and inclusion without hiding bill/lease discrepancies.
  Shared conventions retain precedence; conflicting local members cannot stack.
- Mixed-plan eligibility is evaluated independently per selected member, requiring
  at least three units with an actual grouped bill and an unresolved lease-only member
  without its own bill. Uniform inclusion still rejects mixed evidence. Explicitly
  scoped inclusion skips separately billed, missing-group and unsupported units.
  All local memberships revalidate against baseline on every new audit and suspend
  when evidence disappears. Preview counts only actionable rows, not already matched
  or softened evidence. Scope does not certify price, signatures or disclosure.
- Group questions can offer independently repeated candidates, rather than requiring
  the same members across every unit. No selections are assumed. Unknown decisions
  remain unsaved; approved distinct included/separate decisions are saved together
  only after validation. Storage failure applies none. On later audits, questions
  omit decided members and retain still-unknown ones. Individual rules can be removed
  without discarding other local memory; removing all restores baseline behavior.
- Added bounded parsing for one explicit membership relationship, including the
  reported included/separate phrasing. Source phrase `rent roll` is not charge Rent.
  Reversed membership, unsupported negation, uncertainty and complex/multiple-subject
  explanations do not infer a positive rule. This remains deterministic grammar,
  NOT general AI understanding. All interpretations still require approval.
- Source: `shared/property_assistant.js`, `shared/property_assistant_ui.js`,
  `lease_tool/template.html`. Added `shared/test_assistant_memory.cjs` to focused
  launcher; strengthened pure and existing browser suites. Tests use invented data.
  Mobile mixed-plan preview inspected; counts, decisions and scope are readable.
- Verification/release completion is recorded below after the final suite finishes.

### Final verification and testing-only release

- Final focused launcher: 27/27 suites passed. Assistant pure 19/19; existing browser
  26/26; new memory browser 13/13, including quota failure and single-rule removal.
  No private-fixture run and no real-account document audit claimed. Build parity
  passed for all tools; mobile preview visually inspected with invented inputs.
- Deployed using cached Wrangler 4.129.0, explicit wrangler.testing.jsonc and
  --keep-vars, after dry run and build check. Only LeaseVerify and manifest uploaded.
  Testing Worker version dae6f578-51dd-403c-9623-3569806219df, replacing e7bb71ee... .
  Live manifest exactly matches local SHA-256
  7a83ce45c9aa1934ee9f5ef5a78a8796646c1fe7a5e4e6095d1a7aee977aaae4.
  Testing noindex and unauthenticated tool 401 verified. Production raw homepage
  hash cf22c309afccd6dab157a423feb7160aa34e693dd4e4f27f046a0e19fc485def is unchanged
  before/after. Git remains testing at f5934c0; no commit/push or main deploy.
- No backend, billing, credentials, external model calls or privacy-contract changes.
  Next: fresh testing acceptance with the manager's actual files. This version handles
  the supported conventions and retains unknowns; it is not general natural-language
  AI or a guarantee that every property-specific exception is understood.

## 2026-09-14 — Owner-authorized Git testing release

- Owner explicitly requested both testing deployment and Git testing update, then
  a clear handoff for manager testing. Git fetch confirmed local and remote testing
  initially identical at f5934c0. No main change authorized or performed.
- Prepared the accumulated tested source, generated release assets, regression tests
  and privacy-safe continuity docs. Excluded private historical documents, analytics
  and unrelated diagnostic leftovers. Added a portable engineering guide and LF
  attributes for byte-hashed build inputs/artifacts.
- Replaced inherited resident names in new tests and source comments with invented
  names. No application behavior change. Full 27/27 focused suites passed after the
  first anonymization; a subsequent synthetic-name refinement required updating its
  expected surname too. Corrected the fixture assertion; final signature test 17/17.
  One targeted invocation used the wrong working directory and failed before testing;
  the correct tool directory was used for the final pass.
- Staged source input hashes matched the build manifest. Pattern scan detected no
  private credential values or service-role JWTs; no PDF/ZIP/spreadsheet/image uploads
  are included in the release. This targeted check is not a full security audit.
- Refreshed auditera-testing only, version d87f962a-61fc-477e-952f-1a07482bbbe4.
  Live manifest exactly matches a88a0034923b4bb7206a20d2f120ec1bd5bb40c3dc606c6b02a9f6065c468f0e.
  Git commit/push follow as the explicit owner-authorized release action; verify
  origin/testing equals local HEAD before reporting the Git update successful.
- Verified completion: application commit e889d9e5cc4f9ca69e9e58e6e9e568684ef3d0c4
  pushed to origin/testing; git ls-remote returned that exact SHA. No main push.
  This documentation-only follow-up records the successful release action.
