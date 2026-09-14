# Auditera engineering lessons

Keep reusable lessons here, with evidence and the rule that prevents recurrence.
Do not convert customer conventions into global assumptions without validation.

## L1 — A deployable artifact can be ahead of its source

Verified 2026-09-12: LeaseVerify's shared rule source has four verbs; the HTML in
`dist/tools/` has five. A normal build would use the older source.
Prevention: record source revision and artifact hashes; compare all source/build
inputs before rebuilding, then test exactly the artifact intended for release.

## L2 — Evidence rejection must reach the application decision

Verified by synthetic reproduction: `prCheckRuleAgainstData` returns `blocked:true`
for hiding an undisclosed charge, but `prRuleStatus` returns `active`. The existing
58-check rule suite still passes because it tests rejection, not this full lifecycle.
Prevention: test save -> reload -> contradictory upload -> suspended -> unchanged
finding, and revalidate against an unmodified baseline before applying rules.

## L3 — Mentioning two charges is not consent to merge them

Verified in source and deployable HTML: "Internet and Washer/Dryer are separate
charges, not the same charge" becomes an alias candidate.
Prevention: ambiguous/negative language should ask a question, not propose a reversed
meaning. Confirmation must show the effect; schema validation alone is insufficient.

## L4 — An explanation must explain the size of the difference

The DepositVerify amount branch uses coverage longer than 31 days as sufficient
reason to soften a higher invoice. A longer period alone does not establish that
an arbitrarily large amount is correct. Validate contractual rate/period arithmetic
or retain an unresolved finding, never invent a billing formula.

## L5 — A passing legacy test may not test today's shipped implementation

Verified: the Worker gate test imports `homepage_assets/worker.mjs`, while deployment
uses `dist/_worker.js`. They use different entitlement paths/cache behavior.
Prevention: exercise the actual release entrypoint and its configuration together.

## L6 — Distinguish an environment failure from a regression

Verified: the authorization logic suite attempts `/home/claude/edge/authorize-audit.ts`
on Windows and fails before assertions. Some other tests require absent private
fixtures or a Linux-only browser path. A missing source path is not a missing resident
fixture. Report each precisely and never call an unexecuted suite green.

## L7 — Inherited lessons remain useful, but keep their provenance

Handbook/handoff reports: do not lower signature thresholds; remove printed-line
structure from ink detection. Never equate a scanned or unsigned document with a
verified signature. Do not infer an overcharge from a parser that missed a line.
Do not copy a shared rent-roll reader into divergent per-tool versions.
These are established project constraints; the historical real-document tests were
not rerun in this memory slice.

## L8 — Memory needs an evidence boundary

Keep owner goals, proposed designs, local test results and live verification separate.
The other projects' checkpoints illustrate useful continuity practices; their product
facts, permissions, active work and model preferences do not transfer to Auditera.
Updating these files helps later agents continue; it does not alter model weights or
guarantee that an assistant in another product reads them automatically.

## L9 — Revalidate against evidence the saved rule has not already changed

September 13 repair: a saved hide must not remain in manual filter state after
removal or suspension. Baseline reconciliation clears saved aliases/bundles/includes/
rollups/hide filters, then validates before applying active rules. Test the whole
rerun with a previously active rule, not just an isolated validator returning false.

## L10 — HTTP success is not proof that a row changed

September 13 mocked persistence tests: deleting a stored rule returns one affected
row; deleting it again returns an empty array. Only the first is success. Production
RLS can also produce zero-row operations. Require returned-row evidence and verify
real policy behavior separately; mocks do not certify production access control.

## L11 — Repeated unmatched rows are not automatically missing disclosure

September 13 pilot browser test caught a same-name price difference represented as
one lease-only and one rent-roll-only row. Grouping each status naively asked both
a disclosure question and an empty package-membership question. Compare the same
unit's lease-side labels before choosing the question; never infer missing signed
terms from a row status alone. Test against actual reconciliation, not only invented
final row shapes. Keep the underlying amount finding unchanged.

## L12 — A testing URL does not isolate saved property conventions

The two sites share the live backend. This pilot explicitly blocks testing-side
shared-rule writes and scopes optional local memory by origin, user and property.
That protection is specific to conventions; it does not isolate billing or accounts.

## L13 — Test the dashboard's generated blob page, not only a direct tool URL

The dashboard downloads a gated tool, creates a `blob:` HTML document, adds the
session token in the fragment and opens that generated URL. A direct HTTPS/file test
does not prove the blob document sees the intended origin or storage. The Edge
browser regression now executes this exact launch shape and proves testing origin,
localStorage and the shared-rule write guard. Keep this path in release coverage.

## L14 — Local and shared convention maps need deterministic precedence

Alias and membership maps are order-sensitive. A browser draft created earlier can
overlap a shared convention saved later. Revalidating each in isolation is not enough:
both can be individually plausible while their combination changes meaning. Shared
rules now win; overlapping browser drafts are skipped and disclosed. Test collisions,
not just corrupt individual rule shapes.

## L15 — Removing a fragment from a blob URL must preserve the full blob URL

The gate read a dashboard session token from the hash, then attempted to clean the
address with `pathname + search`. That works on ordinary pages but is not the same
blob document URL; `history.replaceState` throws and the catch made failure invisible.
Keep `location.href` through `#`, replace only the fragment, and assert the final URL
contains neither a hash nor `tk=`. A test that proves blob storage/origin but never
checks the resulting address is incomplete.

## L16 — A grouped-member checklist needs intersection evidence, not a union

The first real run offered every lease-only label seen on any grouped unit, including
the grouped charge's own bedroom tiers and unrelated fees. That makes a confident but
wrong click easy. Candidates now must be lease-only on every unit in the group; self/
tier and protected labels are excluded. Approval independently repeats the per-member,
per-unit check and refuses anything separately billed. UI filtering is not a validator.

## L17 — Never interrupt for an explanation the rule schema cannot accept

The real run asked a mandatory question about eight Rent comparisons. Rent is protected,
so every possible answer would be rejected and the manager could only keep findings.
Question detection now uses the same protected-subject schema as rule validation.
Protected discrepancies go directly to results. A question must lead to at least one
safe supported action or it is friction disguised as intelligence.

## L18 — Repetition alone does not justify blocking every result

The next real acceptance rerun produced fourteen questions, beginning with ordinary
missing-disclosure rows. Even a large count cannot make such a question actionable
when the local rule schema has no safe way to approve the explanation. Keep the
finding; do not force the manager through a conversation. A pre-results question now
needs a supported action, at least eight units and at least 10% of the property.
Treat that threshold as a triage control, not proof that billing is valid.

## L19 — A useful answer deserves a guided follow-up, not a parser error

Manager feedback about included and separate amenities was meaningful but outside
the local sentence parser's tiny grammar. Do not label that as user error or ask
them to learn magic wording. Until hosted AI is approved, replace only supported
cases with explicit Yes/No/unsure controls; keep all uncertain findings visible.

## L20 — Never force a UI state to make an end-to-end test green

September 14 review: a test manually injected a question after real reconciliation
had already finished, leaving finished=true. The assertion proving decline released
results was then removed. Passing that test proved neither question detection nor
completion. Use real raw synthetic inputs through reconciliation; assert pending,
visible results, unchanged rows, and released exports. Separate UI unit tests from
end-to-end claims. New tests exposed a duplicate-tier bug missed by isolated helpers.

## L21 — A property rule still needs a per-unit application boundary

An includes rule used to soften lease-only members even when that unit had no grouped
rent-roll charge. A matching label on a lease-only row was also mistaken for a bill.
Require an actual unambiguous billed group and preserve separately billed member
differences. Do not rely on preview validation alone: remembered rules apply later
to different units and documents. Distinct bedroom defaults cannot be added together
to manufacture a package match, and equal-price defaults are ambiguous, not proof.

## L22 — A negative relationship can be useful without hiding anything

“Separate” is not the same as “unknown” or “ignore.” The local assistant now records
an approved separation to prevent automated grouping, while retaining all ordinary
checks. Such constraints stay out of the shared schema. Negated inclusion must never
be parsed as positive inclusion; test contractions, reversed subjects and uncertainty.

## L23 — Mixed plans need explicit scope, not a weaker global validator

The owner needs conventions for properties with both grouped and separately billed
plans. Uniform inclusion still requires uniform evidence. A separately chosen limited
scope may apply only on qualifying units, per member, with excluded counts in preview.
The application guard and next-run baseline revalidation must enforce the same scope.
This refines L16: a mixed-plan QUESTION may offer independently repeated members, but
that is not permission to approve them globally. Never infer scope or package prices
from correlation alone; unknown answers create no remembered rule.
