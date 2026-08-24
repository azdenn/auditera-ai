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

  const result = await page.evaluate(() => {
    const out = {};

    // ---- Month-to-month detection: unit 406-style example ----
    // Lease ended in the past (leaseTier === 2), rent differs by $250 --
    // should render GREEN (soft) with an explanatory note, not a red mismatch.
    const pastEnd = new Date(); pastEnd.setUTCFullYear(pastEnd.getUTCFullYear() - 1);
    const pastStart = new Date(pastEnd); pastStart.setUTCFullYear(pastStart.getUTCFullYear() - 1);
    const mtmVerification = {
      leaseTermFound: true,
      leaseTermStart: pastStart,
      leaseTermEnd: pastEnd,
      // The amount the lease's own Special Provisions state. The property-wide
      // box now defaults to 0, so this is where the expected figure comes from.
      mtmPremium: 250,
    };
    const mtmLeaseItems = [{ rawLabel: 'Monthly Base Rent', amount: 1000 }];
    // A month-to-month resident is only "properly" month-to-month when the
    // Rent Roll actually carries the separate Month-to-Month Fee line item
    // (this property bills $250 -- see real unit 406). Rent sitting above the
    // old lease rate is NOT itself the month-to-month fee; conflating the two
    // is what let unit 303's real discrepancy get excused, so this scenario
    // now includes the real fee line to exercise the legitimate soft case.
    const mtmBlock = { unit: '406', residents: 'Jane MTM', total: 1500, charges: [
      { description: 'Rent', amount: 1250 },
      { description: 'Month to Month Fee', amount: 250 },
    ]};
    const mtmCmp = reconcileUnit(mtmLeaseItems, mtmBlock, mtmVerification);
    const mtmRentRow = mtmCmp.rows.find(r => r.category === 'RENT');
    out.mtm = { status: mtmRentRow.status, soft: !!mtmRentRow.soft, note: mtmRentRow.note, lease: mtmRentRow.leaseVal, resman: mtmRentRow.resmanVal };

    // Same expired lease and same rent gap, but the Rent Roll has NO
    // Month-to-Month Fee -- the fee was forgotten. Must stay a real mismatch
    // and additionally surface the missing fee.
    const mtmNoFeeBlock = { unit: '406c', residents: 'No Fee', total: 1250, charges: [{ description: 'Rent', amount: 1250 }]};
    const mtmNoFeeCmp = reconcileUnit(mtmLeaseItems, mtmNoFeeBlock, mtmVerification);
    const noFeeRent = mtmNoFeeCmp.rows.find(r => r.category === 'RENT');
    out.mtmNoFee = { rentStatus: noFeeRent.status, rentSoft: !!noFeeRent.soft, missingRow: !!mtmNoFeeCmp.rows.find(r => r.missingMtmFee) };

    // Negative control: same $250 rent gap, but lease term is CURRENT (not expired)
    // -- must stay a real mismatch, not be softened.
    const now = new Date();
    const futureEnd = new Date(now); futureEnd.setUTCFullYear(futureEnd.getUTCFullYear() + 1);
    const currentStart = new Date(now); currentStart.setUTCMonth(currentStart.getUTCMonth() - 1);
    const currentVerification = { leaseTermFound: true, leaseTermStart: currentStart, leaseTermEnd: futureEnd };
    const cmpCurrent = reconcileUnit(mtmLeaseItems, mtmBlock, currentVerification);
    const currentRentRow = cmpCurrent.rows.find(r => r.category === 'RENT');
    out.currentLeaseStillFlagged = { status: currentRentRow.status, soft: !!currentRentRow.soft };

    // Negative control: lease expired, but rent MATCHES (no reason to add an MTM note).
    const cmpExpiredMatch = reconcileUnit(mtmLeaseItems, { unit:'406b', residents:'Match', total:1000, charges:[{description:'Rent', amount:1000}] }, mtmVerification);
    const expiredMatchRow = cmpExpiredMatch.rows.find(r => r.category === 'RENT');
    out.expiredButMatching = { status: expiredMatchRow.status, soft: !!expiredMatchRow.soft };

    // ---- Deposit Waiver / LeaseLock directionality ----
    // resmanonly (charged in ResMan, absent from lease) -- should be a REAL flagged issue now.
    const dwResmanOnly = reconcileUnit(
      [{ rawLabel: 'Monthly Base Rent', amount: 1000 }],
      { unit:'DW1', residents:'A', total:1015, charges:[{description:'Rent',amount:1000},{description:'LeaseLock',amount:15}] }
    );
    const dwRow1 = dwResmanOnly.rows.find(r => r.category === 'DEPOSIT_WAIVER');
    out.depositWaiverResmanOnly = { status: dwRow1.status, soft: !!dwRow1.soft };

    // leaseonly (on lease, ResMan hasn't started billing) -- should remain soft/non-issue.
    const dwLeaseOnly = reconcileUnit(
      [{ rawLabel: 'Monthly Base Rent', amount: 1000 }, { rawLabel: 'Deposit Waiver Fee', amount: 15 }],
      { unit:'DW2', residents:'B', total:1000, charges:[{description:'Rent',amount:1000}] }
    );
    const dwRow2 = dwLeaseOnly.rows.find(r => r.category === 'DEPOSIT_WAIVER');
    out.depositWaiverLeaseOnly = { status: dwRow2.status, soft: !!dwRow2.soft };

    // ---- pickBestLeaseCandidate: tier beats signature-completeness ----
    // Reported bug: a newer, currently-valid lease with a (falsely) incomplete
    // signature read should still beat an older, expired-but-fully-signed one.
    const oldExpiredSigned = {
      filename: 'old_expired_signed.pdf',
      verification: {
        leaseTermFound: true,
        leaseTermStart: new Date(now.getFullYear()-3, 0, 1),
        leaseTermEnd: new Date(now.getFullYear()-2, 0, 1),
        // Fully signed -- confidently detected.
        signatureFindings: [
          { kind: 'row-resident', present: true },
          { kind: 'anchor-owner', present: true },
        ],
      },
    };
    const newCurrentUnsignedRead = {
      filename: 'new_current_misread.pdf',
      verification: {
        leaseTermFound: true,
        leaseTermStart: new Date(now.getFullYear()-1, 0, 1),
        leaseTermEnd: new Date(now.getFullYear()+1, 0, 1),
        // Actually signed in real life, but the ink-detection heuristic
        // false-negatived on the resident's messy signature -- this is
        // exactly the reported bug scenario.
        signatureFindings: [
          { kind: 'row-resident', present: false },
          { kind: 'anchor-owner', present: true },
        ],
      },
    };
    const group = [oldExpiredSigned, newCurrentUnsignedRead];
    const pick = pickBestLeaseCandidate(group, null, now);
    out.pickTierOverSignature = {
      chosenFilename: pick.chosen ? pick.chosen.filename : null,
      ambiguous: pick.ambiguous,
      reason: pick.reason,
    };

    return out;
  });

  console.log('=== New feature checks ===');
  console.log(JSON.stringify(result, null, 2));

  console.log('=== PASS/FAIL ===');
  const checks = [
    ['MTM row is green/soft with note', result.mtm.status === 'mtm' && result.mtm.soft === true && !!result.mtm.note],
    ['MTM note mentions the $250 gap', /250/.test(result.mtm.note)],
    ['Expired lease + rent gap but NO M2M fee on the Rent Roll: rent stays a real mismatch', result.mtmNoFee.rentStatus === 'mismatch' && result.mtmNoFee.rentSoft === false],
    ['Expired lease + no M2M fee: the forgotten fee is surfaced as its own flagged row', result.mtmNoFee.missingRow === true],
    ['Current (non-expired) lease with rent gap stays a real mismatch', result.currentLeaseStillFlagged.status === 'mismatch' && result.currentLeaseStillFlagged.soft === false],
    ['Expired lease with MATCHING rent stays a plain match (no false MTM)', result.expiredButMatching.status === 'match' && result.expiredButMatching.soft === false],
    ['LeaseLock resmanonly is now a real flagged mismatch', result.depositWaiverResmanOnly.status === 'resmanonly' && result.depositWaiverResmanOnly.soft === false],
    ['LeaseLock leaseonly stays soft/non-issue', result.depositWaiverLeaseOnly.status === 'leaseonly' && result.depositWaiverLeaseOnly.soft === true],
    ['Picked the newer/current lease over the older expired-but-signed one', result.pickTierOverSignature.chosenFilename === 'new_current_misread.pdf'],
  ];
  let allPass = true;
  for (const [label, pass] of checks) {
    console.log((pass ? 'PASS' : 'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length) { console.error('SOME CHECKS FAILED'); process.exit(1); }

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
