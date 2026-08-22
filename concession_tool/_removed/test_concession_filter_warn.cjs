// Regression for: "I clicked to not show me move in specials, and i still saw
// a move in special mismatch."
//
// Concessions produce two kinds of finding: a hard 'bad' mismatch and a
// softer 'warn' ("nothing states how long this concession runs -- check
// manually"). The Option Filter only suppressed the 'bad' kind, so a unit
// whose remaining finding was the warn (real unit A110) kept its concession
// badge, kept being pulled into the "review" category, and kept printing the
// full concession description in its summary line -- visibly a move-in
// special, after the user had switched move-in specials off.
//
// WHAT CHANGED, AND WHY THE COVERAGE IS STILL REAL:
// the concession engine was rewritten so one week of free rent is
// monthlyRent / 4. Under that math A110's $1,528.58 no longer lands on a
// whole number of weeks, so the same ledger now raises a 'bad' AND a 'warn'
// instead of the warn alone -- no fixture in this directory produces a
// warn-only unit any more. The bug this test exists for is still caught,
// because it only ever showed up in the warn handling:
//   * if the filter suppressed the 'bad' but not the 'warn', buildEntries()
//     would compute hasWarnOnly === true and the unit would land in "review"
//     (asserted: it must land in "clean"), and
//   * hiddenProblemCount would be 1 instead of bads + warns
//     (asserted: every suppressed finding is still counted).
// Assertions that used to key off "review"/"6-week" wording were repointed at
// those two facts rather than dropped.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./concession_reconciler.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles('#ledger-files', [
    path.resolve('./Ledger_A109_badcharges.xlsx'),
    path.resolve('./Ledger_A110_6wk.xlsx'),
  ]);
  await page.setInputFiles('#rentroll-file', path.resolve('./RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:90000});
  await page.waitForTimeout(300);

  const grab = () => page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === 'A110');
    const rowText = () => {
      const r = Array.from(document.querySelectorAll('#results-body tr.unit-row'))
        .find(x => x.textContent.includes('A110'));
      return r ? r.innerText.replace(/\s+/g,' ').trim() : null;
    };
    return e ? {
      category: e.category, hidden: !!e.concessionHiddenByFilter,
      hiddenCount: e.hiddenProblemCount, problems: e.problemCount,
      warns: e.concession.issues.filter(i=>i.severity==='warn').length,
      bads: e.concession.issues.filter(i=>i.severity==='bad').length,
      warnText: (e.concession.issues.find(i=>i.severity==='warn')||{}).text || null,
      summary: summaryFor(e), row: rowText(),
    } : null;
  });

  const before = await grab();
  await page.evaluate(() => { document.getElementById('issue-filter-panel').open = true; });
  await page.click('input[data-issue-key="concession"]');
  await page.waitForTimeout(300);
  const after = await grab();
  // Unticking restores it.
  await page.click('input[data-issue-key="concession"]');
  await page.waitForTimeout(300);
  const restored = await grab();

  console.log(JSON.stringify({before, after, restored}, null, 1));

  const checks = [
    // Was "warn-only"; the rent/4 rewrite means this ledger now raises both
    // severities. Both must exist for the rest of the test to mean anything.
    ['Baseline: A110 has a move-in concession raising both a hard and a soft finding', before.warns > 0 && before.bads > 0],
    ['Baseline: the soft finding is the "not stated anywhere, check it" one', /states how long|check|not stated/i.test(before.warnText||'')],
    // Was 'review' (warn-only); the same ledger is a hard mismatch now.
    ['Baseline: it is flagged to the user', before.category === 'issue' && before.problems === 1],
    ['Baseline: its summary describes the move-in special', /credited up front/i.test(before.summary)],
    ['After hiding: it is marked hidden by the filter', after.hidden === true],
    // The heart of the bug: suppressing only the 'bad' would leave
    // hasWarnOnly true and drop the unit into "review" instead of "clean".
    ['After hiding: the warn is suppressed too -- the unit is clean, not merely demoted to "review"', after.category === 'clean'],
    ['After hiding: the summary no longer describes the move-in special', !/credited up front|weeks of free rent|check manually/i.test(after.summary)],
    ['After hiding: the summary says it was hidden by the filter', /hidden by your filters/i.test(after.summary)],
    ['After hiding: the visible table row shows "Hidden by Filter"', !!after.row && /Hidden by Filter/.test(after.row)],
    // Was: row must not say "check manually". Same intent, checked against
    // the wording this fixture actually puts on the row.
    ['After hiding: the row no longer shows the concession mismatch', !!after.row && !/Mismatch/.test(after.row) && !/credited up front/i.test(after.row)],
    // Was: hiddenCount > 0 -- tightened, because "> 0" would still pass if
    // the warn were silently dropped from the property-wide total.
    ['After hiding: BOTH findings are still counted in the hidden total (nothing vanishes)', after.hiddenCount === before.bads + before.warns],
    ['Unticking restores the flagged state', restored.category === before.category && restored.hidden === false && restored.hiddenCount === 0],
    ['Unticking restores the concession description', /credited up front/i.test(restored.summary)],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await page.evaluate(() => localStorage.clear());
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
