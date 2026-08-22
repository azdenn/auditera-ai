# Auditly AI — status vocabulary (applies to EVERY tool, current and future)

One fixed set of words. Never invent a synonym for one of these, in any tool,
in any surface (row badge, detail table, tab label, KPI tile, PDF export, CSV).

| Word | Means | Colour class |
|---|---|---|
| `Match` | Checked, and the documents agree. | `match` |
| `Mismatch` | Checked, and something is **wrong**. | `mismatch` |
| `Review` | Worth a human look; not proven wrong. | `review` |
| `Unable to verify` | Could not be checked (missing document, unreadable field). | `unable` |
| `Info` | Context, not a pass/fail check. | `info` |
| `Hidden by Filter` | Suppressed by the user's Option Filters. Still counted. | `unable` |
| `—` | Not applicable to this unit. | `unable` |

## The rule that matters

**Anything wrong is called `Mismatch`. Always that exact word.**

These are all BANNED as ways of saying "wrong": "Needs attention", "Discrepancy",
"Discrepancies", "1 problem", "N problems", "⚠ Needs attention", "Issue", "Flagged",
"Not clean", "Fails".

Also banned as ways of saying the other states:
- "Clean", "Clean match", "All good", "✓ All good", "OK", "Passes" → use `Match`
- "Double-check", "Probable match", "Needs review", "Worth a look" → use `Review`
- "Unable to Verify" (capital V), "Couldn't check", "Unknown" → use `Unable to verify`
- "FYI", "Note" → use `Info`
- "Not a discrepancy" → use `Match` (it was checked and it is fine)

## Counts

Where a count is shown next to a label, the label is still the word above,
pluralised only by the count sitting beside it:
`Mismatch 3`, `Review 2`, `Match 20`. Not "3 Mismatches flagged", not
"Mismatches: 3", not "3 problems".

## Descriptive states are allowed, but only as the NOTE

A check can still explain itself ("on the lease only", "in ResMan only",
"month-to-month"). That explanation belongs in the row's note text, not in the
badge. The badge is one of the seven words above. If the descriptive state
means something is wrong, the badge says `Mismatch` and the note says why.
