// The rent-&-fees check was reporting a wall of findings that weren't real.
// Against the REAL BOA archive it flagged 12 of 25 units, several with 6-11
// "items off". Every one of the following was verified by hand with
// pdftotext against the real ledgers and rent roll before this test was
// written.
//
// Three distinct causes:
//
//  1. Reversed charges counted as real. Unit 102: a $29.81 Deposit Waiver Fee
//     (LeaseLock) posted 08/04 and reversed the same day ("Traditional
//     deposit"). The filter kept charge>0 and dropped the negative reversal,
//     so the unit was reported as billed a fee it isn't billed.
//
//  2. Part-month bills compared against full-month rent roll figures. Unit
//     102 moved in mid-July, so its only bill is prorated: Rent $859.87 /
//     Trash $10.84 / Pest $7.23 against a rent roll of $952 / $12 / $8 --
//     seven "mismatches", none real. Same at the other end: units 303 and 202
//     are on notice, so August bills a part month ($752.94 against $1,373).
//
//  3. One-off incidentals treated as recurring-charge discrepancies. Units
//     205 and 206 accrue Late Charges ($35 then $5/day); eleven identical
//     late-fee lines each were reported as "unexpected charges", burying the
//     real findings.
const { chromium } = require('playwright');
const path = require('path');
const ZIP = path.resolve('./real/BOA Resident Ledgers 08-14-2026.zip');
const RR  = path.resolve('./real/BOA 2026.14- Rent Roll.xlsx');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./concession_reconciler.html'));

  // Unit-level: reversal netting and incidental classification.
  const unit = await page.evaluate(() => {
    const t = (description, charge, d) => ({description, charge, credit:0, date:d?new Date(d):null, notes:''});
    return {
      netted: netChargeReversals([
        t('Rent', 1000), t('Deposit Waiver Fee (LeaseLock)', 29.81),
        t('Reversed Deposit Waiver Fee (LeaseLock)', -29.81),
      ]).map(x => x.description),
      netsByAmountWhenWordingDiffers: netChargeReversals([
        t('Rent', 500), t('Admin Fee', 150), t('Reversed Administrative Fee', -150),
      ]).map(x => x.description),
      keepsUnmatched: netChargeReversals([t('Rent', 900)]).map(x => x.description),
      incidental: ['Late Charges','NSF Fee','Application Fee (non-refundable)','Administrative Fee',
                   'Damage - carpet','Lock Out Fee','Eviction filing','Utility Rebill']
                   .map(d => isIncidentalCharge(d)),
      // Recurring charges must NOT be classed as incidental.
      recurring: ['Rent','Trash Service Fee','Pest Control Fees','Credit Builder - A B',
                  'Deposit Waiver Fee (LeaseLock)'].map(d => isIncidentalCharge(d)),
    };
  });
  console.log('unit-level:', JSON.stringify(unit));

  await page.evaluate(() => { localStorage.clear(); setUploadMode('zip'); });
  await page.setInputFiles('#ledger-zip-file', ZIP);
  await page.setInputFiles('#rentroll-file', RR);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout:180000});
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const act = unitEntries.filter(e => e.category !== 'vacant');
    const pick = u => { const e = act.find(x => x.unit === u); return e && e.charges ? {
      cycle:e.charges.cycleMonth, prorated:!!e.charges.prorated, reason:e.charges.proratedReason||null,
      issues:e.charges.issueCount,
      rrOnly:(e.charges.rentRollOnly||[]).map(x=>x.description),
      ledOnly:(e.charges.ledgerOnly||[]).map(x=>x.description),
      incidentals:(e.charges.incidentals||[]).length } : null; };
    return {
      totalChecked: act.length,
      needAttention: act.filter(e => e.category === 'issue').length,
      u102: pick('102'), u303: pick('303'), u202: pick('202'),
      u205: pick('205'), u206: pick('206'), u104: pick('104'),
    };
  });
  console.log('real archive:', JSON.stringify(r, null, 1));

  const checks = [
    ['A posted-then-reversed charge nets to nothing', JSON.stringify(unit.netted) === JSON.stringify(['Rent'])],
    ['A reversal worded differently still nets by amount', JSON.stringify(unit.netsByAmountWhenWordingDiffers) === JSON.stringify(['Rent'])],
    ['A charge with no reversal is kept', JSON.stringify(unit.keepsUnmatched) === JSON.stringify(['Rent'])],
    ['Late fees, NSF, application/admin, damages are classed as incidental', unit.incidental.every(Boolean)],
    ['Recurring charges are NOT classed as incidental', unit.recurring.every(v => v === false)],
    ['Unit 102 (mid-month move-in) is recognised as a prorated cycle', !!r.u102 && r.u102.prorated === true && r.u102.reason === 'move-in'],
    ['Unit 102 raises no billing errors off that part-month', !!r.u102 && r.u102.issues === 0],
    ['Unit 102 no longer reports the reversed LeaseLock fee', !!r.u102 && !r.u102.ledOnly.some(d => /Deposit Waiver/i.test(d))],
    ['Unit 303 (on notice) compares against a FULL month, not the part-month', !!r.u303 && r.u303.cycle === '2026-07'],
    ['Unit 303 is clean against that full month', !!r.u303 && r.u303.issues === 0],
    ['Unit 202 likewise compares against a full month and is clean', !!r.u202 && r.u202.cycle === '2026-07' && r.u202.issues === 0],
    ['Unit 205\'s accruing late fees are listed as incidentals, not discrepancies', !!r.u205 && r.u205.incidentals >= 10 && r.u205.issues === 0],
    ['Unit 206 likewise', !!r.u206 && r.u206.incidentals >= 10 && r.u206.issues === 0],
    ['Unit 104\'s genuine finding survives (unposted monthly concession credit)', !!r.u104 && r.u104.issues === 1 && r.u104.rrOnly.some(d => /Move In Special/i.test(d))],
    ['Across the real archive, far fewer units are flagged than the old 12', r.needAttention <= 6],
    ['...but the real ones are still flagged, not zero', r.needAttention >= 1],
    ['All 25 occupied units still checked', r.totalChecked === 25],
    ['No page errors', errors.length === 0],
  ];
  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
