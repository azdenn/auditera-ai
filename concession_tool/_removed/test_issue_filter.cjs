// End-to-end regression for the Discrepancy Filters feature (real files,
// real upload flow): hides an issue type and confirms the flagged unit's
// category flips without needing to re-upload/re-process, the KPI "Hidden by
// your filters" tile appears with the right count, the per-unit detail still
// shows the real finding (muted, not deleted), and toggling back off restores
// normal flagging -- all against the cached parsed data from the one real
// upload, exercising the buildEntries() refactor end to end (not just the
// isolated unit-level logic).
//
// WHY THIS TEST NOW FILTERS "concession" AND NOT "charges":
// the "recurring charges: rent roll vs. ledger" audit was removed from this
// tool by design, so there is no `charges` issue key, no
// `input[data-issue-key="charges"]` checkbox and no `entry.charges` any more.
// FILTERABLE_ISSUE_TYPES is now exactly {concession, rent}. The filter
// machinery being covered here (live rebuild, KPI total, muted-not-deleted
// detail, "Hidden by Filter" row badge, localStorage persistence) is
// unchanged -- only the issue type it is pointed at moved. Unit A110
// (Ledger_A110_6wk.xlsx) is the unit that carries a real concession finding;
// A109 is uploaded alongside it as the "nothing to report" control.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./concession_reconciler.html'));

  await page.evaluate(() => localStorage.removeItem('leaseproof_concession_hidden_issue_types'));
  await page.reload();

  const LEDGERS = [path.resolve('./Ledger_A110_6wk.xlsx'), path.resolve('./Ledger_A109_badcharges.xlsx')];
  await page.setInputFiles('#ledger-files', LEDGERS);
  await page.setInputFiles('#rentroll-file', path.resolve('./RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  // A110 is the unit under test (it has the real move-in concession);
  // A109 rides along as the untouched control -- filtering one issue type
  // must not disturb a unit that had nothing to report.
  const getEntries = () => page.evaluate(() => {
    const proj = u => {
      const e = unitEntries.find(x => x.unit === u);
      if (!e) return null;
      return {
        category: e.category, problemCount: e.problemCount, hiddenProblemCount: e.hiddenProblemCount,
        // Replaces the old charges.issueCount probe: concession findings come
        // in two severities and the filter has to suppress both.
        concessionBad: e.concession.issues.filter(i => i.severity === 'bad').length,
        concessionWarn: e.concession.issues.filter(i => i.severity === 'warn').length,
        concessionHiddenByFilter: e.concessionHiddenByFilter,
        concessionCell: concessionCellState(e),
      };
    };
    return {a110: proj('A110'), a109: proj('A109')};
  });

  const baseline = (await getEntries()).a110;
  const controlBefore = (await getEntries()).a109;

  // Open the filter panel and hide "Move-in specials & concessions" via the
  // real UI checkbox (the "charges" checkbox this test used to click no
  // longer exists -- that audit was removed from the tool).
  await page.evaluate(() => { document.getElementById('issue-filter-panel').open = true; });
  await page.click('input[data-issue-key="concession"]');
  await page.waitForTimeout(200);
  const both = await getEntries();
  const afterHide = both.a110;
  const controlAfter = both.a109;

  // Detail must still show the real finding, muted (not deleted).
  const detailHtml = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === 'A110');
    return typeof buildDetail === 'function' ? buildDetail(e) : null;
  });

  const kpiHtml = await page.evaluate(() => {
    const tile = document.querySelector('.kpi-tile.hidden-filter');
    return tile ? tile.textContent : null;
  });

  // Table badge for this row should read "Hidden by Filter", not a raw "Correct".
  const rowBadgeHtml = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#results-body tr.unit-row'));
    const row = rows.find(r => r.textContent.includes('A110'));
    return row ? row.innerHTML : null;
  });

  // Persistence across reload.
  await page.reload();
  const afterReloadChecked = await page.evaluate(() => {
    const cb = document.querySelector('input[data-issue-key="concession"]');
    return cb ? cb.checked : null;
  });

  // Re-upload after reload and confirm the filter is still effective.
  await page.setInputFiles('#ledger-files', LEDGERS);
  await page.setInputFiles('#rentroll-file', path.resolve('./RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);
  const afterReloadEntry = (await getEntries()).a110;

  // Uncheck it -- must restore normal flagging WITHOUT re-uploading.
  await page.evaluate(() => { document.getElementById('issue-filter-panel').open = true; });
  await page.click('input[data-issue-key="concession"]');
  await page.waitForTimeout(200);
  const afterUnhide = (await getEntries()).a110;

  const result = { baseline, controlBefore, afterHide, controlAfter, kpiHtml, afterReloadChecked, afterReloadEntry, afterUnhide };
  console.log(JSON.stringify(result, null, 2));
  console.log('=== detail snippet ===', (detailHtml||'').slice(0, 900));
  console.log('=== row badge snippet ===', (rowBadgeHtml||'').slice(0, 400));

  // The whole property-wide hidden total the KPI/detail must agree with:
  // both severities of the suppressed concession, so nothing goes invisible.
  const hideable = baseline.concessionBad + baseline.concessionWarn;

  const checks = [
    ['Baseline: A110 has a real concession finding', baseline.concessionBad > 0],
    ['Baseline: category is issue', baseline.category === 'issue'],
    ['Baseline: nothing hidden yet', baseline.hiddenProblemCount === 0],
    ['Baseline: the concession column flags it as a mismatch', baseline.concessionCell === 'mismatch'],
    // Was: hiddenProblemCount === charges.issueCount. Same contract, counted
    // off the concession findings now: everything suppressed is still totalled.
    ['After hiding "concessions" LIVE (no re-upload): hiddenProblemCount reflects every suppressed finding', afterHide.hiddenProblemCount === hideable && hideable > 0],
    ['After hiding: concessionHiddenByFilter is true', afterHide.concessionHiddenByFilter === true],
    ['After hiding: category no longer "issue" (does not pop up)', afterHide.category !== 'issue'],
    ['After hiding: its displayed problem count drops to zero', afterHide.problemCount === 0],
    ['After hiding: the concession column shows the hidden state, not a match', afterHide.concessionCell === 'hidden'],
    ['Hiding one issue type leaves an unrelated clean unit untouched',
      controlAfter.category === controlBefore.category && controlAfter.hiddenProblemCount === 0],
    ['KPI tile shows the true hidden count', !!kpiHtml && kpiHtml.startsWith(String(hideable)) && /hidden/i.test(kpiHtml)],
    // Was: /doesn't match|no matching charge/ (recurring-charge wording).
    // The surviving finding is the concession one, quoted verbatim in the detail.
    ['Detail still shows the real finding info, just muted (not deleted)', !!detailHtml && /credited up front/i.test(detailHtml) && /1,528\.58/.test(detailHtml)],
    ['Detail explains it\'s hidden by filter', !!detailHtml && /hidden.*from view|hide Concessions \/ Specials/i.test(detailHtml)],
    ['Row badge shows "Hidden by Filter", not a plain "Correct"', !!rowBadgeHtml && /Hidden by Filter/.test(rowBadgeHtml)],
    ['Row no longer advertises the concession mismatch', !!rowBadgeHtml && !/credited up front/i.test(rowBadgeHtml) && !/badge mismatch/.test(rowBadgeHtml)],
    ['Filter checkbox state persists across reload', afterReloadChecked === true],
    ['After reload + reprocess: filter still effective', afterReloadEntry.category !== 'issue' && afterReloadEntry.hiddenProblemCount > 0],
    ['Unchecking LIVE restores normal flagging (category back to issue)', afterUnhide.category === 'issue'],
    ['Unchecking LIVE restores normal flagging (hiddenProblemCount back to 0)', afterUnhide.hiddenProblemCount === 0],
    ['Unchecking LIVE restores the per-unit problem count', afterUnhide.problemCount === baseline.problemCount && baseline.problemCount > 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);

  await page.evaluate(() => localStorage.removeItem('leaseproof_concession_hidden_issue_types'));

  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
