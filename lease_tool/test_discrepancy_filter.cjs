// Regression for the discrepancy-visibility filter feature:
// "where you can choose what discrepancy you want to see and what you want
// to ignore ... i dont want to see signature discrepancies, so even if
// there are, they dont pop up. Still say the total amount of discrepancies
// and make it known that they are there, but again dont make them pop up."
//
// Uses the real Blanco Oaks A105 fixtures, which have one genuine, isolated
// real-world discrepancy (a Security Deposit mismatch: $400 on the lease vs
// $1000 on the rent roll -- see test_a105_e2e.cjs). This test hides the
// "Security Deposit" check type via the UI checkbox and confirms:
//   - the unit no longer flags as a mismatch (category flips to 'clean')
//   - issueCount excludes the hidden check
//   - the property-wide "Hidden by your filters" KPI tile appears with the
//     right count
//   - the per-unit detail still SHOWS the deposit check, muted as "Hidden by
//     Filter" (never silently deleted) with the real fail values intact
//   - the setting survives a bare page reload, but EVERY new run clears it
//     (this supersedes the old behaviour -- see the note on the checks)
//   - unchecking restores normal flagging
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  // Start from a clean slate: make sure nothing is hidden yet.
  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));
  await page.reload();

  const files = [
    'A105_2022-2023.pdf', 'A105_2023-2024.pdf', 'A105_2024-2025.pdf',
    'A105_2025-2026_current.pdf', 'A105_2026-2027_signed_renewal.pdf',
  ].map(f => path.resolve('./a105_test/' + f));

  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./a105_test/A105_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const getEntry105 = () => page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '105');
    if (!e) return null;
    return {
      category: e.category, issueCount: e.issueCount,
      effectiveFailCount: e.verify.effectiveFailCount, hiddenFailCount: e.verify.hiddenFailCount,
      deposit: e.verify.checks.find(c => c.key === 'deposit'),
    };
  });

  const baseline = await getEntry105();

  // The filter panel is a collapsed <details> element by default -- open it
  // (as the "adjust filters" KPI link would) before interacting with the
  // checkboxes inside, since Playwright won't click a hidden element.
  await page.evaluate(() => { document.getElementById('discrepancy-filter-panel').open = true; });

  // Checkbox rendering: confirm the panel exists and 'deposit' is unchecked initially.
  const depositCbChecked = await page.evaluate(() => {
    const cb = document.querySelector('input[data-check-key="deposit"]');
    return cb ? cb.checked : null;
  });

  // Now hide the "Security Deposit" check via the actual UI checkbox.
  await page.click('input[data-check-key="deposit"]');
  await page.waitForTimeout(300);
  const afterHide = await getEntry105();

  // KPI tile should now show the hidden count.
  const kpiHtml = await page.evaluate(() => {
    const tile = document.querySelector('.kpi-tile.hidden-filter');
    return tile ? tile.textContent : null;
  });

  // Per-unit detail: the deposit row should still be present, but rendered
  // muted/"Hidden by Filter" rather than a red mismatch. Open that unit's
  // detail to check the rendered table row.
  await page.click('[data-unit="105"], .unit-row[data-unit="105"], tr:has-text("105")').catch(() => {});
  const detailHtml = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '105');
    // Directly call the render helper used for this unit's verify section
    // rather than depending on exact click-to-expand DOM structure. It
    // returns a DOM node, so pull its outerHTML to get a serializable string.
    const node = typeof buildVerifySection === 'function' ? buildVerifySection(e) : null;
    return node ? node.outerHTML : null;
  });

  // localStorage persistence: reload the page (files are gone, but the
  // hidden-key setting should survive) and confirm the checkbox is still
  // checked and isCheckHidden('deposit') is still true.
  await page.reload();
  const afterReload = await page.evaluate(() => {
    const cb = document.querySelector('input[data-check-key="deposit"]');
    return { checked: cb ? cb.checked : null, isHidden: typeof isCheckHidden === 'function' ? isCheckHidden('deposit') : null };
  });

  // Re-upload and confirm the filter is still effective after reload.
  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./a105_test/A105_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);
  const afterReloadEntry = await getEntry105();
  const afterReloadCb = await page.evaluate(() => {
    const cb = document.querySelector('input[data-check-key="deposit"]');
    return { checked: cb ? cb.checked : null, isHidden: isCheckHidden('deposit') };
  });

  // Re-tick it and confirm hiding still works after the reset.
  await page.evaluate(() => { document.getElementById('discrepancy-filter-panel').open = true; });
  await page.click('input[data-check-key="deposit"]');
  await page.waitForTimeout(300);
  const afterUnhide = await getEntry105();

  const result = { baseline, depositCbChecked, afterHide, kpiHtml, detailHtml, afterReload, afterReloadEntry, afterUnhide };
  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['Baseline: deposit check is a real fail', baseline.deposit.status === 'fail'],
    ['Baseline: unit category is mismatch (1 real issue)', baseline.category === 'mismatch' && baseline.issueCount === 1],
    ['Baseline: nothing hidden yet', baseline.hiddenFailCount === 0],
    ['Deposit checkbox starts unchecked', depositCbChecked === false],
    ['After hiding deposit: hiddenFailCount is 1', afterHide.hiddenFailCount === 1],
    ['After hiding deposit: effectiveFailCount is 0', afterHide.effectiveFailCount === 0],
    ['After hiding deposit: issueCount excludes it', afterHide.issueCount === 0],
    ['After hiding deposit: category flips to clean (does not pop up as a mismatch)', afterHide.category === 'clean'],
    ['After hiding deposit: the check itself is unchanged/still a real fail underneath', afterHide.deposit.status === 'fail'],
    ['KPI tile shows the true hidden count (1)', !!kpiHtml && /^1/.test(kpiHtml) && /hidden/i.test(kpiHtml)],
    ['Per-unit detail still shows the deposit row (never silently deleted)', !!detailHtml && /Security Deposit/i.test(detailHtml)],
    ['Per-unit detail marks it "Hidden by Filter" instead of a plain mismatch', !!detailHtml && /Hidden by Filter/i.test(detailHtml)],
    // A reload on its own processes nothing, so the tick is still there.
    ['The hidden setting survives a bare page reload (checkbox)', afterReload.checked === true],
    ['The hidden setting survives a bare page reload (isCheckHidden)', afterReload.isHidden === true],

    /* SUPERSEDES the earlier behaviour, deliberately. This used to assert the
       filter was STILL effective after re-processing. It is not any more, and
       that is the fix: Option Filters are cleared by every run.

       They were the tool's only memory when that was written. They are not
       now -- a property's standing conventions live in its house rules, saved
       against that property. What was left of localStorage was the dangerous
       half: it is per-browser, not per-property, so a filter ticked while
       auditing one building silently followed the user into the next set of
       documents and suppressed findings at a property nobody tuned it for. */
    ['A NEW RUN CLEARS THE FILTERS: the finding is reported again',
      afterReloadEntry.category === 'mismatch' && afterReloadEntry.issueCount === 1],
    ['...and nothing is left counted as hidden', afterReloadEntry.hiddenFailCount === 0],
    ['...with the checkbox visibly cleared, not just ignored',
      afterReloadCb.checked === false && afterReloadCb.isHidden === false],
    ['Hiding still works after the reset: category flips to clean', afterUnhide.category === 'clean'],
    ['Hiding still works after the reset: issueCount excludes it', afterUnhide.issueCount === 0],
    ['Hiding still works after the reset: it is counted as hidden', afterUnhide.hiddenFailCount === 1],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);

  // Clean up localStorage so re-running this test (or any other test) starts fresh.
  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));

  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
