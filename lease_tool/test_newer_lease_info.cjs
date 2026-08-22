// Regression for: "I like that you notify us of this, but it shouldnt be a
// mismatch... I want this to just be a comment that you have because your
// pulling the correct lease, the lease hasnt ended yet. I just want you to
// tell us that theres a future lease that exists, this shouldnt be a
// mismatch." Directly exercises appendNewerLeaseCheck's output shape: the
// note must still be produced (so nothing is silently lost), but it must be
// status:'info', not 'fail', and must not be counted in
// failCount/total/issueCount or flip a unit's category to 'mismatch'.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  const result = await page.evaluate(() => {
    const now = new Date(2026, 7, 12);
    const older = { filename: 'older.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2025,9,10)), leaseTermEnd:new Date(Date.UTC(2026,9,5)), leaseTermStartRaw:'10/10/2025', leaseTermEndRaw:'10/05/2026', signatureFindings:[{kind:'row-resident',present:true},{kind:'anchor-owner',present:true}] } };
    const newer = { filename: 'newer.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2026,9,6)), leaseTermEnd:new Date(Date.UTC(2027,9,5)), leaseTermStartRaw:'10/06/2026', leaseTermEndRaw:'10/05/2027', signatureFindings:[{kind:'row-resident',present:true},{kind:'anchor-owner',present:true}] } };
    const block = { leaseStart: new Date(Date.UTC(2025,9,10)), leaseEnd: new Date(Date.UTC(2026,9,5)), unit: '105', residents: 'Test Resident', charges: [], total: 1000, deposits: 0 };

    const pick = pickBestLeaseCandidate([older, newer], block, now);
    const verify = buildVerificationCheck(older.verification, block);
    const beforeFailCount = verify.failCount, beforeTotal = verify.total;
    appendNewerLeaseCheck(verify, pick, older.verification, block);
    const newerCheck = verify.checks.find(c => c.key === 'newerLease');

    return {
      newerCheck,
      failCountUnchanged: verify.failCount === beforeFailCount,
      totalUnchanged: verify.total === beforeTotal,
      checksArrayGrew: verify.checks.length === beforeTotal + 1, // still appended, just not counted
    };
  });

  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['The newer-lease note is still produced (nothing silently dropped)', !!result.newerCheck],
    ['Status is "info", not "fail"', result.newerCheck && result.newerCheck.status === 'info'],
    ['Note explicitly says this is not a mismatch', result.newerCheck && /not a mismatch/i.test(result.newerCheck.note)],
    ['failCount is unaffected (does not count as a discrepancy)', result.failCountUnchanged],
    ['total (the 7-check tally) is unaffected', result.totalUnchanged],
    ['The check is still appended to verify.checks (still visible in the table)', result.checksArrayGrew],
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
