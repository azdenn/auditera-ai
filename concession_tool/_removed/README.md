# Retired ConcessionVerify tests

Tests in this folder are kept, not deleted, so the behaviour they used to
guard stays on the record. Each entry says what was removed from the tool,
why, and where the surviving behaviour is covered now.

---

## `test_charge_accuracy.cjs`

Retired with the **recurring rent-&-fees check**. That audit compared every
recurring charge on the ledger against the rent roll and produced a wall of
findings that weren't real (part-month bills, reversed fees, one-off late
charges). ConcessionVerify checks concessions and nothing else, so the check
and its test both went.

---

## `test_concession_filter_warn.cjs` and `test_issue_filter.cjs`

Retired with **Option Filters**, which were removed from ConcessionVerify by
design.

Option Filters existed so a user could switch off a whole class of finding
they didn't care about. This tool now checks exactly one thing — move-in
concessions — so there is nothing left to switch off: switching concessions
off would switch the entire tool off. The rent check that made a second
filterable class meaningful was removed too (a lease-vs-rent-roll rent
disagreement is now a note on the "Monthly rent used for the math" fact tile,
via `entry.rentDisagrees`, not a filterable issue).

Everything these two tests touched is gone from the tool: `FILTERABLE_ISSUE_TYPES`,
`HIDDEN_ISSUE_TYPES`, `isIssueTypeHidden`, `renderIssueFilterPanel`,
`#issue-filter-panel`, `input[data-issue-key=...]`, `entry.concessionHiddenByFilter`,
`entry.hiddenProblemCount`, `HIDDEN_BADGE`, the "Hidden by your filters" KPI
tile, and the `hidden` state in `concessionCellState` / `CONCESSION_RANK`.
There is no way to re-point these assertions, because there is no subject
left — every one of them asserts something about suppression.

### Where the non-filter behaviour they also touched is covered now

These suites incidentally asserted a few things that still exist. Those
assertions are covered elsewhere, so nothing was lost by retiring them:

| What the retired test asserted | Where it lives now |
|---|---|
| A110's ledger raises a real concession mismatch, and its baseline category is `issue` | `test_concession_math.cjs` (A110 6-week fixture: up-front dollars, weeks and `upfrontOk`) |
| `concessionCellState(entry)` returns `mismatch` for a flagged unit | `test_concession_ui.cjs` — the Move-in discount column badge (`Mismatch` / `Review` / `Match` / `No concession`) |
| The row badge and summary describe the finding rather than going blank | `test_concession_ui.cjs` — row badge vocabulary and `summaryFor()` checks |
| The detail panel quotes the real finding rather than deleting it | `test_concession_spec.cjs` and `test_concession_ui.cjs` — detail-panel fact tiles and Expected/Actual rows |
| Per-unit `problemCount` and the property-wide totals agree | `test_concession_math.cjs` — the 25-unit BOA ground truth (2 Mismatch, 2 Review, 21 Match) |

If Option Filters are ever reinstated in a *different* tool, start from these
files — the filter contract they encode (live rebuild with no re-upload,
nothing silently vanishing from the totals, muted-not-deleted detail,
localStorage persistence across reload) is still the right contract.
