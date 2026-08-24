// Regression for the unit-303 month-to-month bug:
//
//   "For 303 ... it inaccurately said that the rent was the month to month
//    charge. There was no ... 250 month to month charge on the rent roll so
//    that needs to be sent in as an error ... it's 20 dollars off on 303 and
//    it's not flagged as a mismatch ... if you don't see a substantial number
//    like 250 ... and there's no current lease, then we forgot to put the
//    month to month in and that should be a mismatch"
//
// Two distinct defects were behind this, both fixed here:
//
//  1. "Month-to-month" was decided purely from the uploaded lease PDF's own
//     term dates. But the Rent Roll is the system of record: real unit 303's
//     Rent Roll term runs 01/13/2026 - 01/12/2027 (LIVE), and the resident
//     merely has an older, expired lease PDF on file. Treating that PDF as
//     proof of month-to-month let a genuine $20 rent discrepancy be waved
//     away as a "month-to-month premium".
//
//  2. Even when a resident IS genuinely month-to-month, a small rent gap was
//     being read AS the month-to-month fee. A real M2M fee is a substantial,
//     deliberate line item (this property bills $250). If the term has ended
//     and no such fee is on the Rent Roll, the fee was forgotten -- an
//     expensive, silent under-bill that must be flagged, not excused.
//
// Uses the REAL BOA_2026.14_Rent_Roll.xlsx throughout. Unit 406 (a genuine
// month-to-month with a real $250 fee) is the control that must STAY quiet.
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
  await page.evaluate(() => { localStorage.removeItem('leaseproof_mtm_fee_expected'); localStorage.removeItem('leaseproof_hidden_discrepancy_checks'); });
  await page.reload();

  // ---- Direct unit-level checks of the decision logic ----
  const direct = await page.evaluate(() => {
    const mkBlock = (unit, charges, leaseStart, leaseEnd) => ({
      unit, residents:'Test R', status:'NTV', charges, total:0, deposits:0,
      leaseStart: leaseStart ? new Date(leaseStart) : null,
      leaseEnd: leaseEnd ? new Date(leaseEnd) : null,
    });
    // mtmPremium is what the lease's own Special Provisions (Par. 32) state.
    // The property-wide box now defaults to 0 -- "if there isnt [one on the
    // lease] then just keep as 0" -- so the expected amount has to come from
    // somewhere explicit, exactly as it does on a real lease.
    const expiredPdf = { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2025,0,9)), leaseTermEnd:new Date(Date.UTC(2026,0,12)), mtmPremium:250 };

    // (a) 303-shaped: Rent Roll term is LIVE (to 01/12/2027), old expired PDF,
    //     rent $20 higher, no M2M fee. Must be a hard mismatch.
    const b303 = mkBlock('303', [{description:'Rent', amount:1373}], '2026-01-13', '2027-01-12');
    const c303 = reconcileUnit([{rawLabel:'Rent', amount:1353}], b303, expiredPdf);
    const rent303 = c303.rows.find(r => r.category === 'RENT');
    const missing303 = c303.rows.find(r => r.missingMtmFee);

    // (b) Genuinely month-to-month (Rent Roll term ended) WITH a real $250
    //     fee -- the 406 shape. Rent gap should still be excused.
    const b406 = mkBlock('406', [{description:'Rent', amount:1499},{description:'Month to Month Fee', amount:250}], '2025-07-22', '2026-07-20');
    const c406 = reconcileUnit([{rawLabel:'Rent', amount:1400}], b406, expiredPdf);
    const rent406 = c406.rows.find(r => r.category === 'RENT');
    const fee406 = c406.rows.find(r => r.category === 'MONTH_TO_MONTH_FEE' && !r.missingMtmFee);

    // (c) Genuinely month-to-month (Rent Roll term ended) but NO M2M fee at
    //     all. Must synthesize a flagged "missing month-to-month fee" row.
    const bNoFee = mkBlock('501', [{description:'Rent', amount:1420}], '2024-01-01', '2025-06-30');
    const cNoFee = reconcileUnit([{rawLabel:'Rent', amount:1400}], bNoFee, expiredPdf);
    const missingNoFee = cNoFee.rows.find(r => r.missingMtmFee);
    const rentNoFee = cNoFee.rows.find(r => r.category === 'RENT');

    // (d) Month-to-month with a trivial "M2M fee" of $20 -- far below the
    //     $250 this property charges. Must NOT count as the fee being billed.
    const bTiny = mkBlock('502', [{description:'Rent', amount:1400},{description:'Month to Month Fee', amount:20}], '2024-01-01', '2025-06-30');
    const cTiny = reconcileUnit([{rawLabel:'Rent', amount:1400}], bTiny, expiredPdf);
    const feeTiny = cTiny.rows.find(r => r.category === 'MONTH_TO_MONTH_FEE');

    // (e) Configurability: a property that charges no M2M fee at all (0)
    //     must not get a phantom "missing fee" row.
    // A lease that states no premium AND a property-wide value of 0 -- there
    // is no amount to expect, so no phantom row.
    const noPremiumPdf = { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2025,0,9)), leaseTermEnd:new Date(Date.UTC(2026,0,12)) };
    const prev = MTM_FEE_EXPECTED; MTM_FEE_EXPECTED = 0;
    const cZero = reconcileUnit([{rawLabel:'Rent', amount:1400}], mkBlock('503', [{description:'Rent', amount:1400}], '2024-01-01', '2025-06-30'), noPremiumPdf);
    const missingZero = cZero.rows.find(r => r.missingMtmFee);
    MTM_FEE_EXPECTED = prev;

    return {
      rent303: rent303 ? {status:rent303.status, soft:!!rent303.soft, note:rent303.note} : null,
      missing303Present: !!missing303,
      rent406: rent406 ? {status:rent406.status, soft:!!rent406.soft} : null,
      fee406: fee406 ? {status:fee406.status, soft:!!fee406.soft} : null,
      missingNoFee: missingNoFee ? {status:missingNoFee.status, note:missingNoFee.note} : null,
      rentNoFeeStatus: rentNoFee ? rentNoFee.status : null,
      feeTiny: feeTiny ? {status:feeTiny.status, soft:!!feeTiny.soft, note:feeTiny.note} : null,
      missingZeroPresent: !!missingZero,
    };
  });
  console.log('=== direct ===');
  console.log(JSON.stringify(direct, null, 2));

  // ---- End to end against the real rent roll ----
  await page.setInputFiles('#lease-files', [
    path.resolve('./boa_test/303_old_expired_lease.pdf'),
    path.resolve('./boa_test/406_expired_lease.pdf'),
  ]);
  await page.setInputFiles('#rentroll-file', path.resolve('./boa_test/BOA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const e2e = await page.evaluate(() => {
    const pick = u => {
      const e = unitEntries.find(x => x.unit === u);
      if (!e) return null;
      return {
        category: e.category, issueCount: e.issueCount,
        rows: (e.rows||[]).map(r => ({label:r.label, cat:r.category, status:r.status, soft:!!r.soft, missingMtmFee:!!r.missingMtmFee, note:r.note})),
      };
    };
    return { u303: pick('303'), u406: pick('406') };
  });
  console.log('=== e2e real rent roll ===');
  console.log(JSON.stringify(e2e, null, 2));

  const r303 = e2e.u303 && e2e.u303.rows.find(r => r.cat === 'RENT');
  const r406rent = e2e.u406 && e2e.u406.rows.find(r => r.cat === 'RENT');
  const r406fee = e2e.u406 && e2e.u406.rows.find(r => r.cat === 'MONTH_TO_MONTH_FEE');

  const checks = [
    ['303 shape: $20 rent gap under a LIVE Rent Roll term is a real mismatch, not softened', direct.rent303 && direct.rent303.status === 'mismatch' && direct.rent303.soft === false],
    ['303 shape: no phantom "missing M2M fee" row (they are not month-to-month)', direct.missing303Present === false],
    ['Control: genuine M2M WITH a real $250 fee still excuses the rent gap', direct.rent406 && direct.rent406.status === 'mtm' && direct.rent406.soft === true],
    ['Control: the real $250 M2M fee line itself stays a non-issue', direct.fee406 && direct.fee406.status === 'mtm' && direct.fee406.soft === true],
    ['Genuine M2M with NO fee: a flagged "missing Month-to-Month Fee" row is created', !!direct.missingNoFee && direct.missingNoFee.status === 'mismatch'],
    ['Missing-fee note names the expected amount ($250)', !!direct.missingNoFee && /\$250/.test(direct.missingNoFee.note)],
    ['Missing-fee note explains the fee was never added', !!direct.missingNoFee && /never added|no Month-to-Month Fee/i.test(direct.missingNoFee.note)],
    ['A trivial $20 "M2M fee" does NOT count as the fee being billed', direct.feeTiny && direct.feeTiny.soft === false],
    ['Under-billed M2M fee is called out as under-billed', direct.feeTiny && /under-billed/i.test(direct.feeTiny.note||'')],
    ['No stated premium anywhere (lease silent, box 0) produces no phantom missing-fee row', direct.missingZeroPresent === false],
    ['E2E: real unit 303 found', !!e2e.u303],
    ['E2E: real 303 rent row is a flagged mismatch (the $20)', !!r303 && r303.status === 'mismatch' && r303.soft === false],
    ['E2E: real 303 is categorized as a mismatch unit', e2e.u303 && e2e.u303.category === 'mismatch'],
    ['E2E: real 303 has NO missing-M2M-fee row (Rent Roll term is live)', e2e.u303 && !e2e.u303.rows.some(r => r.missingMtmFee)],
    ['E2E: real unit 406 still treats its rent gap as month-to-month', !r406rent || r406rent.status === 'match' || r406rent.status === 'mtm'],
    ['E2E: real unit 406 $250 fee still a non-issue', !!r406fee && r406fee.soft === true],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks) { console.log((pass?'PASS':'FAIL') + ' -- ' + label); if (!pass) allPass = false; }
  console.log('=== errors ===', errors);
  await page.evaluate(() => localStorage.removeItem('leaseproof_mtm_fee_expected'));
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
