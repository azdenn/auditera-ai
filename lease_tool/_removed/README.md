# Retired tests

`test_e2e.cjs` and `test_e2e2.cjs` drive a single-lease UI that no longer exists:
they look for `#lease-file`, `#parse-btn`, `#c-pest`, `#c-trash` and `#compare-btn`,
none of which are in `lease_reconciler.html` any more. The tool moved to a
multi-lease / ZIP upload flow, and that flow is covered by `test_a105_e2e.cjs`,
`test_bulk*.cjs`, `test_combo.cjs` and `test_zip_e2e.cjs`. These two were failing
on a missing selector, not on a real behaviour, so they were retired rather than
left to give a permanently red run.
