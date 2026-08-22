// End-to-end regression using the user's real Blanco Oaks A105 files: all 5
// lease renewals (2022-2027) plus the actual ResMan rent roll export. This
// confirms the full pipeline -- not just pickBestLeaseCandidate in isolation
// -- lands on the right lease and the right verdict.
//
// Ground truth confirmed from the real rent roll: ResMan's own recorded
// Lease Start/End for A105 is 10/10/2025 - 10/05/2026 (it has NOT rolled
// onto the already-signed 2026-2027 renewal yet). So the tool matching that
// 2025-2026 lease -- not the 2027 one -- is the CORRECT behavior, not a bug.
// The only genuine ISSUE on this unit is an unrelated Security Deposit
// mismatch ($400 on the lease vs $1000 on the rent roll). The already-signed
// 2027 renewal is real and worth knowing about, but per explicit feedback
// it must NOT be counted as a mismatch/issue -- the correct lease is being
// used, a future one simply also exists -- so it's an 'info' note only.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  const files = [
    'A105_2022-2023.pdf', 'A105_2023-2024.pdf', 'A105_2024-2025.pdf',
    'A105_2025-2026_current.pdf', 'A105_2026-2027_signed_renewal.pdf',
  ].map(f => path.resolve('./a105_test/' + f));

  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./a105_test/A105_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const entry = await page.evaluate(() => {
    const e = unitEntries.find(x => x.unit === '105');
    if (!e) return null;
    return {
      category: e.category, issueCount: e.issueCount, pickReason: e.pickReason,
      rentRow: e.rows.find(r => r.category === 'RENT'),
      verify: e.verify ? {
        endDate: e.verify.checks.find(c => c.key === 'endDate'),
        startDate: e.verify.checks.find(c => c.key === 'startDate'),
        deposit: e.verify.checks.find(c => c.key === 'deposit'),
        newerLease: e.verify.checks.find(c => c.key === 'newerLease'),
      } : null,
    };
  });

  console.log(JSON.stringify(entry, null, 2));

  const checks = [
    ['Found the A105 entry', !!entry],
    ['Picked the lease actually currently in effect, not the future 2027 renewal', /currently in effect/.test(entry.pickReason || '')],
    ['Lease Start Date check: MATCH (10/10/2025)', entry.verify.startDate.status === 'pass'],
    ['Lease End Date check: MATCH (10/05/2026, not 2027)', entry.verify.endDate.status === 'pass' && entry.verify.endDate.leaseValue === '10/05/2026'],
    ['Rent: MATCH ($1085 both sides)', entry.rentRow.status === 'match' && entry.rentRow.leaseVal === 1085 && entry.rentRow.resmanVal === 1085],
    ['The security deposit issue is still correctly flagged', entry.verify.deposit.status === 'fail'],
    ['Still notes that a newer signed lease (2027) exists, as an INFO note, not a mismatch', !!entry.verify.newerLease && entry.verify.newerLease.status === 'info'],
    ['Newer-lease note mentions both the 2027 term and the 2026 term still in effect', /2027/.test(entry.verify.newerLease.note) && /2026/.test(entry.verify.newerLease.note)],
    ['Newer-lease note explicitly says it is not a mismatch', /not a mismatch/i.test(entry.verify.newerLease.note)],
    ['Total issues on this unit = 1 (deposit only -- the future lease note does NOT count as an issue)', entry.issueCount === 1],
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
