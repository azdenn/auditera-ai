# Auditera project memory

Owner direction and local technical snapshot verified: 2026-09-14 (America/Chicago).
This is the compact current checkpoint. First repairs and the browser-local
LeaseVerify property-assistant pilot are deployed to TESTING ONLY.
It is maintained external memory for development, not a model-training system.

## Owner direction

Owner-stated in the Auditera Main Chat:

- Continue the existing business and repository in Codex; do not rebuild or replace it.
- Owner preference (September 13): on the first line of the first response to each
  new work request, show a prominent bold Markdown heading naming the recommended
  model and reasoning effort, briefly explain why, and PAUSE until the owner confirms
  the switch and says to continue. Do not repeat that pause within the same work slice.
  Conserve usage; Astra is not the default. Do not switch models automatically or
  promise exact savings. Owner confirmed Astra/medium for the September 14 work.
- Understand goals, changes, what worked, what failed and next steps across sessions.
- Preserve a portable, maintained master memory; ask specific questions when a
  material ambiguity would change the result. Explain technical tradeoffs plainly.
- Product goal: a manager can explain a property's unusual billing convention,
  review the interpretation, save it for that property and reuse it on later audits.
  The assistant should ask useful clarifying questions rather than force managers
  to learn exact parser phrasing. This is a desired capability, not a finished feature.
- Early usage is expected to be small (roughly ten people); reliability and low
  ongoing cost matter. Do not infer a paid API budget from this expectation.
- On September 13, after clarifying the assistant interaction, the owner explicitly
  requested implementation, starting with the review fixes. The first repair batch
  is now implemented and locally tested. Deployment, paid calls, production changes
  and the assistant's unresolved data contract remain separate.

### Pre-results clarification — owner requirement, September 13

The assistant should proactively recognize repeated/ambiguous mismatch patterns in
the preliminary audit and ask about the property's convention BEFORE presenting
final results. It must not depend on the manager first seeing dozens of repetitive
findings and opening a chatbot. The owner used roughly 80 similar mismatches as an
example, not a fixed trigger threshold.

Desired sequence: local preliminary audit -> detect a pattern needing clarification
-> contextual question -> interpret and validate the answer -> approved property rule
-> rerun affected checks -> final results. Later runs reuse the property's approved
configuration and revalidate it against new documents.

Engineering recommendations, not yet owner-selected details: repetition is evidence
of a pattern, not proof that billing is correct or the tool is wrong. Questions should
distinguish a convention, missing evidence, extraction error and real discrepancy.
Never remove findings solely because many residents share them or a manager calls
them normal. Preserve raw findings and accurately label incomplete checks.

Owner decision, September 13: require an explicit response to a presented clarification
before releasing results. Agreement is NOT required. "No", "do not change anything",
or rejection of the interpretation must allow continuation with the affected baseline
findings unchanged and no new property rule saved. The baseline includes any already
approved rules that remain valid; rejecting a new proposal does not reset those rules.

Recommended interaction details: offer explain/correct, approve a validated preview,
and "Keep original findings". "I don't know" may explicitly retain the findings too;
it must never mean "verified correct". Ask once per meaningful pattern, not per unit,
and do not demand answers when no clarification is needed. Do not repeatedly press
for agreement after rejection. A bare "no" never creates a permanent hide/ignore rule.
Cross-run treatment of declined proposals and provider-failure recovery are still
design details, not implemented behavior.

## Location and release checkpoint — verified locally

- Canonical repository on this machine:
  `C:/Users/azden/CodexLocal/Projects/Auditera/repo` (owner-authorized relocation
  September 13; OneDrive original retained; file hashes and Git status verified).
- Remote: `https://github.com/azdenn/auditera-ai.git`; branch `testing`, HEAD `f5934c0`.
  Remote configuration does not prove current GitHub write authorization.
- This older Codex task started in
  `C:/Users/azden/OneDrive/Documents/ChatGPT/Auditera`, a separate reconstructed copy.
  Do not treat it as the canonical source or overlay its code automatically.
  Its preserved local copy is now
  `C:/Users/azden/CodexLocal/Projects/Auditera/previous-workspace`.
- Pre-existing `dist/_worker.js` and `dist/app.html` remain byte-for-byte unchanged.
  Many additional source/test/generated changes are now local and uncommitted.
- Source/build drift reconciled: restored 22 newer/missing source and test entries
  from canonical `auditera-update.zip`, skipping its dist and generated files.
  Restored LeaseVerify rebuilt byte-for-byte equal to the pre-existing newer dist
  artifact BEFORE repairs. Old source backup is in the older workspace under
  `.tooling/pre-repair-20260913`. This was selective recovery, not a project rewrite.
- All tools now use locked dependencies in `lease_tool/node_modules` and one shared
  builder. Root `node build.cjs` builds/copies all three to dist; `node build.cjs --check`
  validates source/artifact/manifest parity. Both redeploy batch scripts check first.
- No commit, push, main deployment, backend/account change or paid model call.
  Git remains `testing` at `f5934c0`. Testing was deployed separately; see below.

## First repair batch — locally verified September 13

September 13 continuation: owner approved testing deployment and starting the first
assistant version, explicitly keeping main untouched. Owner expects to be away about
an hour; do not interrupt with further questions while away. Asked whether v1 should
remain browser-local/no paid calls; no answer received yet, so preserve the existing
privacy boundary. Scope does not approve unrestricted outbound chat or a paid budget.

Testing repair deployment verified: Worker auditera-testing, version
`dcd5b367-023f-4b81-8817-b2f4aef72326`, previous version
`d7cf474f-13fa-407f-924b-5d549900f9ff`. Testing root now carries noindex; its manifest
matches local exactly; unauthorized tool requests return 401. Main homepage hash
remains `cf22c309afccd6dab157a423feb7160aa34e693dd4e4f27f046a0e19fc485def`.
No main Worker deploy, Git push, database change or payment. Live authenticated tool
download is not yet verified; local mocked dashboard integration previously passed.
Pilot design: LeaseVerify first; mandatory grouped question -> validated preview ->
explicit approve/keep original -> results. Saved test conventions stay local, scoped
to signed-in user and property, to avoid changing shared live property rules.

- F1: matching source restored; shared reproducible builds, manifest, release guard.
- F2: blocked/invalid saved rules suspend; evaluate against a baseline without saved
  rules; only active rules apply. Rollup/hide cannot suppress undisclosed billed rows.
  Saved hiding no longer leaks into manual filters or survives removal/suspension.
- F3: long invoice coverage alone never verifies a price increase. Keep the mismatch
  and explain the missing rate/proration evidence; do not guess a daily-rate formula.
- F4: negative/uncertain statements and merely naming two charges no longer imply
  an alias. Typed hide explanations are no longer stored as raw free-text reasons.
- F5: unit and HTTP/browser integration tests import the actual dist Worker. All
  three routing configs use worker-first for public-page testing noindex behavior;
  homepage assembly cannot overwrite that Worker with the legacy implementation.
- F6: ConcessionVerify upload instructions agree with optional lease support and
  disclose that signed terms cannot be verified without leases.
- Related persistence failures: failed/malformed rule loads are visibly disclosed;
  repeat processing reloads rules; deletion requires an affected row, not just 2xx.
- Final `node test-local.cjs`: 24/24 focused suites passed (470 assertions). Includes
  actual deployable browser engines, mocked persistence, offline dashboard launch,
  strict licence gate, existing tier/bundle/ink regressions and source/build guard.
  No full private-fixture run. `test_option_filters.cjs` stopped at a missing private
  PDF; the legacy DepositVerify real-fixture expectations were updated but not run.
- Initial homepage and three upload screens loaded without script errors or horizontal
  overflow at 1440px/390px. Concession screenshot visually inspected. Not full UI QA.
- The repair batch did not include the assistant. The local pilot below follows it;
  an external AI API remains unimplemented and unauthorized.

## Local property-assistant pilot — September 13

Implemented in LeaseVerify and deployed to testing as Worker version
`6a07fcd7-eadb-4ef3-828f-f27d0edb55c0`; preceding token-cleanup version was
`717c8dcc-3bee-4edd-bd33-f8fd3f0fed6a`. All 26 focused suites passed, including
29 assistant browser assertions after hardening. Live testing
manifest exactly matches local; root has noindex; unauthorized tool download is 401.
Main homepage hash is unchanged. No main deploy, Git push, database mutation or
paid API call. The real testing dashboard authenticated and rendered its licensed
property/tool state. After owner closed the older tab and relaunched, the actual new
LeaseVerify blob URL had no session-token fragment. No customer documents were
uploaded; end-to-end audit acceptance is still outstanding.
See [pilot scope and testing](ASSISTANT-PILOT.md). New shared assistant modules are
inlined by the guarded build. No external model, paid request or new network payload.

- After preliminary reconciliation, one question per repeated pattern gates final
  results and exports. An explicit no/keep response retains the original comparisons;
  it does not save a rule or discard existing valid conventions.
- Supported v1 interpretations: naming aliases and grouped-charge membership.
  Preview states the proposed interpretation/evidence, not simulated final totals.
  Explicit approval validates untouched baseline evidence, then reruns the engine.
  No hide/rollup/price-offset approval; conflicting overlapping rules are refused.
- Optional Remember is unchecked by default. Approved compact conventions persist
  only in this browser, scoped by testing origin, signed-in user and server-resolved
  property. Explanations, resident evidence and tokens are not stored by this feature.
  Later runs revalidate remembered rules; missing evidence suspends/dormants them.
- Testing shared-rule writes/deletes are blocked in the client helpers and UI;
  shared live rules remain readable. Forget clears only this local pilot's memory.
- Verified the exact dashboard blob-page launch in Edge: testing origin, localStorage
  scope and read-only guard survive the generated blob URL. If a browser convention
  overlaps a shared or earlier convention, it is skipped and visibly disclosed;
  order-sensitive maps cannot silently let the browser rule overwrite the shared one.
- Real authenticated launch exposed that token cleanup rebuilt a blob URL from
  `pathname`; `history.replaceState` threw and left the session token in the fragment.
  Cleanup now preserves the exact blob URL and replaces only its fragment. The blob
  regression asserts both empty hash and no `tk=` in the address. Close tool tabs
  opened before Worker version `717c8dcc...`; they contain the older artifact. Owner
  did so; a fresh authenticated testing launch was verified clean.
- First real-document acceptance run reached the assistant locally: 183 leases
  matched and five grouped questions appeared before results. The missing-disclosure
  questions grouped repeated findings as intended. The run also exposed two pilot
  defects before any rule was approved: grouped membership used a union of lease-only
  labels (including the charge's own tiers), and protected Rent discrepancies produced
  an unanswerable assistant question. Testing version `6a07fcd7...` fixes both: only
  components lease-only on every grouped unit are offered; self/tier/separately-billed
  members are refused; protected schema subjects bypass questions and remain findings.
  Owner must rerun with a fresh tool tool tab to complete acceptance.
- Follow-up real-document acceptance (owner stopped after the first three of 14
  questions): the remaining-question count proved that ordinary recurring
  unmatched charges were still being treated as mandatory conversations. This is
  a planner defect, not evidence that the corresponding findings are wrong.
  Local change is built but not yet deployed: missing-disclosure rows never gate
  results because the local rule schema cannot safely act on an explanation; all
  other candidate questions now require at least eight units and 10% of the
  audited property, plus a supported action. Pure assistant suite passed 15/15
  and the guarded root build completed. Browser suites could not start because
  this checkout lacks the Playwright package; full launcher result was 7/26
  suites passed and 19 dependency failures, not product assertion failures.
  Browser coverage was subsequently restored locally: Playwright plus its local
  Chromium runtime were installed without changing application source, and the
  assistant browser suite passed 16/16. Testing-only Worker version
  `51a0151d-9da5-4dc7-92c8-ad2833d7c181` was then deployed with `--keep-vars`;
  only LeaseVerify and the tools manifest uploaded. The deployed manifest equals
  the local manifest and testing has `X-Robots-Tag: noindex, nofollow`. No main
  deploy, Git push, backend mutation, paid API call or customer-document upload
  occurred. Production was not a deployment target, but its currently observed
  stable homepage hash differs from the historical hash recorded above; do not
  claim byte-for-byte production continuity until that external change is audited.
- Explicit limitations: deterministic interpreter, not a general AI chatbot; no
  cross-device/team memory, complex package-price exception support, or current
  customer-document acceptance run. Other two tools do not have the question flow.

## Product and safety boundaries

LeaseVerify checks leases against rent rolls; ConcessionVerify checks concessions;
DepositVerify checks deposit/LeaseLock coverage. Audits run in the browser.
Preserve AGENTS.md's privacy, licensing, signature and evidence protections.

Saved house-rule load/save/delete code already exists through Supabase. The typed
rule interpreter is deterministic; it is not an AI API. Live persistence, RLS and
cross-account isolation were not verified in this slice.

Documentation conflict: the "exactly one network call" statement is not a complete
description of today's code, which also has property-rule persistence and, in the
newer artifact, usage telemetry. This does NOT authorize widening any payload.
Inventory and pin each existing contract before proposing an AI endpoint. Free-text
reasons and charge labels are not automatically free of resident information.

## Current assessment and next work

Detailed evidence and recommendations: [review](REVIEW-2026-09-12.md).

Next work (testing-only release approved; main and external AI data flows are not):

1. Verify authenticated pilot behavior with the owner's current local files and
   expected results. Testing sign-in is open for the owner; do not handle credentials.
   Testing uses the real backend; never run real charges as tests.
2. Obtain/identify a current local property example and its expected result; complete
   private-document regressions without uploading or committing resident documents.
3. Improve evidence-first results: separate unresolved findings, grouped findings,
   reviewed exceptions, missing documents and excluded checks; preserve counts/export.
4. Exercise the local clarification pilot on an owner-confirmed example before
   expanding its interpreter or adding an optional external model. Deterministic
   checks calculate; local evidence and manager confirmation govern conventions.
5. Verify customer onboarding/licensing/billing and isolate testing data before a
   broader launch. Testing and live currently share backend configuration.

Still open: live RLS/tenant isolation and deletion behavior; checkout/webhook retry and
error handling; broad workers.dev origins; raw rule-label privacy and full payload
allowlisting; conflicting/chained property conventions; complete exports/accessibility;
global concession assumptions and dependency/security audit. The focused repairs
do not establish launch readiness. Do not rerun homepage assembly blindly: the newer
dist app was preserved, not reconciled with every historical marketing source.

## Questions still requiring owner/customer input

- For the first assisted workflow, confirm the exact current wrong result and the
  expected result using a local example; historical Rail examples may already be fixed.
- Before implementation, choose who may approve property-wide rules (recommend a
  designated property/account manager), and whether changes need a second reviewer.
- Before any external AI call, approve its precise outbound data contract, privacy
  wording and budget. Do not send resident documents or unrestricted chat text.
- Handoff records the cable bundle discount as intentionally confirmed; do not
  re-ask it as if unknown. Missing insurance disclosure, duplicate billing and which
  signed exports to use remain reported questions, not facts this review resolved.

## Continuity library

- [Work log](WORK_LOG.md): changed files, actual checks, failures and release status.
- [Lessons](LESSONS.md): reusable mistakes, evidence and prevention.
- [Review](REVIEW-2026-09-12.md): prioritized findings, design and verification limits.
- [Handbook](AUDITERA-HANDBOOK.md): existing detailed domain/engineering history.
- [Historical handoff](HANDOFF-2026-09-12.md) and [setup](CODEX-SETUP.md): provenance,
  not current authority. Reverify deployment and capability claims before relying on them.

For another AI: provide `AGENTS.md`, `START_HERE.md`, this file and relevant linked
records, plus repository access. Keep secrets and resident fixtures out of the packet.

## September 14 — Astra review and testing repair checkpoint

Owner confirmed Astra/medium and requested continued implementation/review, testing
only. Current testing Worker version: `d87f962a-61fc-477e-952f-1a07482bbbe4`.
Live manifest matches local SHA-256
`a88a0034923b4bb7206a20d2f120ec1bd5bb40c3dc606c6b02a9f6065c468f0e`.

- Corrected prior browser coverage: removed forced assistant state; restored the
  assertion that declining actually releases results/exports. Original 16/16 was
  not evidence of that complete lifecycle. Actual reconciliation now drives tests.
- Grouped-member questions offer Included / Separate / Not sure, defaulting to
  uncertainty. Changes invalidate approval. Unsupported prose requests guided
  clarification instead of labeling the manager's answer negative or erroneous.
- Membership requires a billed group on the same unit and cannot cover a
  separately billed member's mismatch. Missing disclosure stays untouched.
- Bedroom price matching already existed (the earlier claim it was wholly unbuilt
  was incorrect). Fixed a second tier-softening path that hid equal-price duplicate
  defaults; blocked bundles summing explicit bedroom alternatives. Legitimate
  approved bundle discounts retain their existing regression coverage.
- Verified: all 27 focused suites pass; assistant pure 19/19, browser 26/26,
  new memory browser 13/13; build parity;
  synthetic mobile screen visually inspected. Live testing gate returns 401 without
  authentication and testing remains noindex. Production homepage fingerprint is
  unchanged using the same pre/post read method. No main deployment, Git commit/push,
  backend change, private-document processing, or paid API call.
- Follow-on completed: local separate constraints can be approved/remembered, prevent
  automatic grouping, and coexist with disjoint included members. Explicit mixed-plan
  scope includes only units with a grouped bill and unresolved lease-side member that
  is not separately billed. Preview names eligible/excluded counts; uniform inclusion
  still rejects inconsistent evidence. Revalidation suspends unsupported rules.
  Multi-rule saves are atomic; unknown choices are not remembered. Users can forget
  one convention or all; shared rules remain read-only and retain precedence.
- Bounded language support now recognizes simple included/separate statements and
  does not mistake the source phrase rent roll for Rent. Uncertain, reversed or
  complex explanations still need guided clarification. This is NOT hosted AI.
- Next: manager acceptance on a freshly opened testing tool with the actual property
  files (not rerun by the agent in this slice). Confirm convention interpretations,
  eligibility exclusions and remaining findings. Arbitrary unit-specific exceptions,
  package-price interpretation from prose, shared cross-browser memory, and general
  AI conversation remain outside this pilot. Do not claim all property cases solved.

## Git release authorization — September 14

Owner explicitly authorized updating GitHub testing and refreshing the testing site
for manager acceptance. The tested release is being recorded on testing, not main.
See Git history for its exact commit. The application build above is live-verified.
Private historical handbooks/exports and unrelated diagnostics are left local;
ENGINEERING-GUIDE.md is the portable, privacy-safe development reference. Inherited
resident names in new test examples/comments were replaced with invented names.
Build-input and artifact line endings are pinned to LF for byte-hash reproducibility.
