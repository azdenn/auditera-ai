# Property assistant: testing pilot

Updated September 14, 2026. LeaseVerify only. This is a browser-local guided
assistant with a limited sentence interpreter, NOT a hosted language model.

## Try it

After the testing deployment is confirmed, hard-refresh testing.auditera.net/app,
close previously opened tool tabs, then open LeaseVerify from the dashboard.
Process a property's rent roll and leases normally. Documents remain in the browser.

A question can trigger only for a supported, potentially actionable pattern across
at least eight units and at least 10% of the audited property. Missing-disclosure
findings do not gate results: this local pilot cannot safely turn an explanation of
missing signed terms into a rule. No questions are required for a run with no
qualifying patterns. The threshold is an initial grouping heuristic, not evidence
that billing is wrong.
Protected subjects such as Rent and signatures never become assistant questions;
they remain final findings because no convention is allowed to alter them.

- **Keep original findings**, or answer **no**: continue without a new convention.
  Answer each presented pattern; existing valid conventions remain in effect.
- **Explain/correct**: describe a naming relationship or select the signed lease
  charges included in a grouped bill. Unsupported/uncertain answers do not change
  findings. This pilot does not understand arbitrary natural-language explanations.
- **Preview**: read the interpretation and evidence summary. This is not a full
  before/after report. No change happens until **Approve and rerun checks**.
- **Remember**: optionally select the checkbox before approval. Otherwise the rule
  lasts for this run only. Browser memory is separate for each user/property/testing
  origin. It is not shared with coworkers, other devices or production.
- **Forget this browser's pilot conventions**: removes local conventions for the
  current user/property and recalculates; shared live rules are untouched.

Naming does not verify amounts. Group membership does not establish a package
price. Unsupported price discounts, hiding, rollups, conflicting rules, missing
signed terms and true discrepancies must not be silently approved by this pilot.
Every reused convention is revalidated against untouched document comparisons.
Shared conventions win over overlapping browser drafts. The skipped browser rule is
shown rather than silently overwriting an order-sensitive alias/membership map.
Grouped-member choices are the intersection across all grouped units, not the union:
each candidate needs its own repeated evidence. Uniform inclusion requires consistency
across grouped units. The explicit mixed-plan choice applies only to qualifying units
without a separate member bill; the preview shows eligible/excluded counts. The grouped
charge and its floor-plan tiers cannot be included in themselves. Separate conventions
can be remembered to prevent automatic grouping while retaining ordinary checks.
Unknown choices stay unsaved. Individual conventions can also be forgotten.

## Privacy and testing isolation

No external AI API calls. No documents, explanations or evidence are sent by the
assistant. Only compact, explicitly approved rule labels are optionally persisted
in browser localStorage. Tokens and chat text are not stored by this feature.
Browser storage can be cleared or unavailable; it is not an account backup.

Testing and production still share Supabase/Stripe. Testing's existing shared-rule
save/delete helpers now refuse writes; its panel is read-only for shared rules.
This does NOT isolate account creation, licensing, payments or other backend actions.
No database/RLS change is part of this pilot. Production origin does not enable the
pilot, even if an artifact is accidentally copied there; this is not a licence bypass.

## Evidence and open work

`shared/test_property_assistant.cjs` tests grouping, no-change responses, compact
storage, user/property keys, corrupt/quota failures, production exclusion and missing
disclosure. `shared/test_assistant_browser.cjs` uses the built tool, real reconciliation
and mocked network requests with invented residents. It exercises approval, rejection,
exports gating, stale preview invalidation, reuse, revalidation, forgetting, protected
amount differences, shared-write refusal, convention collisions, the dashboard's
actual generated blob-page launch and mobile overflow.

These tests are not a full customer upload/parse run, authenticated live acceptance,
privacy/security certification, or proof that Janine's current case is solved.
Next acceptance needs a local owner-confirmed example and expected results.
Any external model requires a separately approved outbound data contract and budget.
