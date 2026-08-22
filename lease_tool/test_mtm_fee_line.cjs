// Regression for: "not flagging a month to month fee as long as the AI
// analyzes last term license is a month to month fee" -- using the REAL
// Blanco Oaks BOA_2026.14_Rent_Roll.xlsx the user uploaded. Unit 406 (John
// Lane) has a genuinely expired lease (07/22/2025-07/20/2026, already ended
// relative to today) and a real "Month to Month Fee" ($250) charge on the
// Rent Roll -- a charge that can never appear on a fixed-term lease PDF,
// since it only exists because the resident is staying past their term.
// Before this fix, that charge had no category of its own, so it fell
// through as an unresolved "ResMan only" extra charge -- a hard, red
// mismatch. It should instead be recognized as expected/non-issue, the same
// way the existing Rent premium month-to-month case already is.
//
// Direct unit-level checks exercise reconcileUnit() in isolation (fast,
// deterministic, covers the tier-gating logic precisely); the second half
// runs the actual bulk pipeline against the real uploaded rent roll plus a
// synthetic lease PDF built to match unit 406's real dates/rent, to prove
// this isn't just correct in isolation but actually reaches the real unit's
// results.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  const direct = await page.evaluate(() => {
    const block406Expired = { unit:'406', residents:'John Lane', status:'C',
      charges: [ {description:'Rent', amount:1499}, {description:'Month to Month Fee', amount:250} ],
      total: 1749, deposits: 0 };
    const leaseItems = [ {rawLabel:'Rent', amount:1499} ];
    const verificationExpired = { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2025,6,22)), leaseTermEnd:new Date(Date.UTC(2026,6,20)) };
    const cmpExpired = reconcileUnit(leaseItems, block406Expired, verificationExpired);
    const mtmRowExpired = cmpExpired.rows.find(r => r.category === 'MONTH_TO_MONTH_FEE');

    // Negative control: same charge, but the lease is CURRENTLY ACTIVE (not
    // expired) -- a Month to Month Fee showing up here would be a genuine
    // billing error (charging an M2M premium under an active fixed term),
    // so it must stay a real, flagged mismatch, not get softened.
    const verificationActive = { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2026,0,1)), leaseTermEnd:new Date(Date.UTC(2027,0,1)) };
    const cmpActive = reconcileUnit(leaseItems, block406Expired, verificationActive);
    const mtmRowActive = cmpActive.rows.find(r => r.category === 'MONTH_TO_MONTH_FEE');

    // Negative control 2: no Month to Month Fee charge, and the lease is
    // still ACTIVE -- must not spuriously produce an M2M row of any kind.
    //
    // NOTE: this control originally used verificationExpired. It was changed
    // deliberately, not to make a failing test pass: when the term HAS ended
    // and no fee is on the Rent Roll, the tool now intentionally synthesizes
    // a flagged "Month-to-Month Fee was never added" row -- that absence is
    // an expensive silent under-bill ($250/mo here) and was the whole point
    // of the unit-303 fix (see test_mtm_303.cjs, which covers that case
    // directly). The protective intent of this control -- "don't invent an
    // M2M row out of nowhere" -- is preserved by asserting it against a unit
    // that genuinely isn't month-to-month.
    const blockNoFee = { unit:'999', residents:'Nobody', status:'C', charges:[{description:'Rent', amount:1000}], total:1000, deposits:0 };
    const cmpNoFee = reconcileUnit([{rawLabel:'Rent', amount:1000}], blockNoFee, verificationActive);
    const mtmRowNoFee = cmpNoFee.rows.find(r => r.category === 'MONTH_TO_MONTH_FEE');

    return {
      expired: mtmRowExpired ? { status: mtmRowExpired.status, soft: mtmRowExpired.soft, note: mtmRowExpired.note, resmanVal: mtmRowExpired.resmanVal } : null,
      active: mtmRowActive ? { status: mtmRowActive.status, soft: !!mtmRowActive.soft } : null,
      noFeePresent: !!mtmRowNoFee,
    };
  });

  console.log('=== direct reconcileUnit checks ===');
  console.log(JSON.stringify(direct, null, 2));

  // ---- End to end: real rent roll + synthetic lease matching unit 406 ----
  await page.setInputFiles('#lease-files', path.resolve('./boa_test/406_expired_lease.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const e2e = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '406');
    if (!e) return null;
    const mtmRow = (e.rows||[]).find(r => r.category === 'MONTH_TO_MONTH_FEE');
    return {
      found: true,
      mtmRow: mtmRow ? { status: mtmRow.status, soft: !!mtmRow.soft, note: mtmRow.note } : null,
      rowLabels: (e.rows||[]).map(r => r.label + ':' + r.status),
    };
  });
  console.log('=== e2e (real BOA rent roll, unit 406) ===');
  console.log(JSON.stringify(e2e, null, 2));

  const checks = [
    ['Direct: expired lease + M2M fee charge -> status "mtm"', direct.expired && direct.expired.status === 'mtm'],
    ['Direct: expired lease + M2M fee charge -> soft (not counted as issue)', direct.expired && direct.expired.soft === true],
    // Note wording changed from "not a discrepancy" to "not a mismatch":
    // the project-wide status vocabulary standard bans "discrepancy".
    ['Direct: note explains it and says "not a mismatch"', direct.expired && /not a mismatch/i.test(direct.expired.note)],
    ['Direct: note mentions the actual dollar amount ($250)', direct.expired && /\$250/.test(direct.expired.note)],
    ['Negative control: M2M fee under an ACTIVE (non-expired) lease stays a real flagged mismatch', direct.active && direct.active.status !== 'mtm' && direct.active.soft !== true],
    ['Negative control: active lease + no M2M Fee charge -> no phantom row created', direct.noFeePresent === false],
    ['E2E: real unit 406 found in results', !!e2e && e2e.found],
    ['E2E: real unit 406\'s Month-to-Month Fee row is recognized as non-issue', e2e && e2e.mtmRow && e2e.mtmRow.status === 'mtm' && e2e.mtmRow.soft === true],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) {
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
