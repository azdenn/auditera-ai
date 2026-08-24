// Regression test built from the user's real Blanco Oaks A105 lease files --
// 5 renewals spanning 2022-2027, uploaded after a report that the tool was
// "getting the detection wrong for the most recent lease" (the one ending
// 2027). Diagnosed root cause: A105 has a lease currently in effect
// (2025-10-10 - 2026-10-05) AND an already-signed renewal for the next term
// (2026-10-06 - 2027-10-05) with identical rent -- picking between them
// correctly requires knowing which one ResMan itself has already rolled
// onto, not just which one covers today's calendar date. See the
// rrMatch===2 priority added to pickBestLeaseCandidate.
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

  const files = ['A105_2022-2023.pdf', 'A105_2023-2024.pdf', 'A105_2024-2025.pdf', 'A105_2025-2026_current.pdf', 'A105_2026-2027_signed_renewal.pdf'];
  const parsed = [];
  for (const f of files) {
    await page.setInputFiles('#lease-files', [path.resolve('./a105_test/' + f)]);
    const result = await page.evaluate(async (fname) => {
      const file = document.getElementById('lease-files').files[0];
      const r = await parseLeasePdf(file);
      return { filename: fname, unit: r.unit, verification: r.verification };
    }, f);
    parsed.push(result);
  }

  const diag = await page.evaluate((parsed) => {
    const group = parsed.map(p => ({
      filename: p.filename,
      verification: {
        ...p.verification,
        leaseTermStart: p.verification.leaseTermStart ? new Date(p.verification.leaseTermStart) : null,
        leaseTermEnd: p.verification.leaseTermEnd ? new Date(p.verification.leaseTermEnd) : null,
      },
    }));
    const now = new Date(2026, 7, 12); // fixed "today" so this test doesn't drift as real time passes
    const noBlock = pickBestLeaseCandidate(group, null, now);
    const renewalRecorded = pickBestLeaseCandidate(group, { leaseStart: new Date(Date.UTC(2026,9,6)), leaseEnd: new Date(Date.UTC(2027,9,5)) }, now);
    const currentRecorded = pickBestLeaseCandidate(group, { leaseStart: new Date(Date.UTC(2025,9,10)), leaseEnd: new Date(Date.UTC(2026,9,5)) }, now);
    return {
      allExtracted: parsed.map(p => ({ file: p.filename, found: p.verification.leaseTermFound, start: p.verification.leaseTermStartRaw, end: p.verification.leaseTermEndRaw })),
      noBlock: noBlock.chosen && noBlock.chosen.filename,
      renewalRecorded: renewalRecorded.chosen && renewalRecorded.chosen.filename,
      currentRecorded: currentRecorded.chosen && currentRecorded.chosen.filename,
    };
  }, parsed);

  console.log(JSON.stringify(diag, null, 2));

  const checks = [
    ['All 5 real leases had their term dates extracted', diag.allExtracted.every(x => x.found)],
    ['With no Rent Roll lease-date data: picks the calendar-current lease (safe default)', diag.noBlock === 'A105_2025-2026_current.pdf'],
    // Even when the Rent Roll's recorded dates already match the signed
    // renewal, the renewal hasn't calendar-started yet -- some properties
    // fully execute renewals well in advance for residents who are going
    // to renew, so an exact Rent Roll match alone can't be trusted as
    // proof the renewal is actually in use yet. The lease that's actually
    // currently in effect must still be selected; the renewal is instead
    // surfaced separately as a "newer signed lease" notification.
    ['When Rent Roll reflects the signed renewal early (not yet started): still picks the lease actually in effect today (2026), not the future renewal', diag.renewalRecorded === 'A105_2025-2026_current.pdf'],
    ['When Rent Roll still reflects the outgoing lease: picks the current one (2026)', diag.currentRecorded === 'A105_2025-2026_current.pdf'],
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
