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
    const now = new Date(2026, 7, 12);

    // Case 1: single lease, no duplicates -- must never fire.
    const single = [{ filename: 'only.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2025,9,10)), leaseTermEnd:new Date(Date.UTC(2026,9,5)), signatureFindings:[{kind:'row-resident',present:true},{kind:'anchor-owner',present:true}] } }];
    out.singleLease = pickBestLeaseCandidate(single, null, now).newerUnreflectedLease;

    // Case 2: two candidates, Rent Roll already reflects the newest one --
    // must NOT fire (nothing "unreflected"). Also: even though the Rent
    // Roll's recorded dates exactly match the newer (not-yet-started)
    // lease, "chosen" must still be the one actually in effect today --
    // some properties fully execute a renewal well ahead of its start date
    // for residents who are going to renew, and that must never be treated
    // as the operative lease before its term actually begins.
    const older = { filename: 'older.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2025,9,10)), leaseTermEnd:new Date(Date.UTC(2026,9,5)), signatureFindings:[{kind:'row-resident',present:true},{kind:'anchor-owner',present:true}] } };
    const newer = { filename: 'newer.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2026,9,6)), leaseTermEnd:new Date(Date.UTC(2027,9,5)), signatureFindings:[{kind:'row-resident',present:true},{kind:'anchor-owner',present:true}] } };
    const blockReflectsNewer = { leaseStart: new Date(Date.UTC(2026,9,6)), leaseEnd: new Date(Date.UTC(2027,9,5)) };
    const pickEarlyRenewal = pickBestLeaseCandidate([older, newer], blockReflectsNewer, now);
    out.rentRollAlreadyUpdated = pickEarlyRenewal.newerUnreflectedLease;
    out.stillPicksCurrentlyEffectiveLease = pickEarlyRenewal.chosen && pickEarlyRenewal.chosen.filename;

    // Case 3: two candidates, Rent Roll still reflects the older one -- MUST fire.
    const blockReflectsOlder = { leaseStart: new Date(Date.UTC(2025,9,10)), leaseEnd: new Date(Date.UTC(2026,9,5)) };
    const pickOlderReflected = pickBestLeaseCandidate([older, newer], blockReflectsOlder, now);
    out.rentRollStale = pickOlderReflected.newerUnreflectedLease ? { filename: pickOlderReflected.newerUnreflectedLease.item.filename } : null;

    // Case 4: newer candidate exists but is NOT fully signed -- must NOT fire
    // (an unsigned draft renewal isn't a real "executed but unreflected" lease).
    const unsignedNewer = { filename: 'unsigned_newer.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2026,9,6)), leaseTermEnd:new Date(Date.UTC(2027,9,5)), signatureFindings:[{kind:'row-resident',present:false},{kind:'anchor-owner',present:true}] } };
    out.unsignedNewerIgnored = pickBestLeaseCandidate([older, unsignedNewer], null, now).newerUnreflectedLease;

    // Case 5: "newer" candidate is actually OLDER (started before chosen) --
    // must NOT fire (only genuinely later-starting leases count).
    const evenOlder = { filename: 'even_older.pdf', verification: { leaseTermFound:true, leaseTermStart:new Date(Date.UTC(2023,9,10)), leaseTermEnd:new Date(Date.UTC(2024,9,5)), signatureFindings:[{kind:'row-resident',present:true},{kind:'anchor-owner',present:true}] } };
    out.olderCandidateIgnored = pickBestLeaseCandidate([older, evenOlder], null, now).newerUnreflectedLease;

    return out;
  });

  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['Single lease (no duplicates): never fires', result.singleLease === null],
    ['Rent Roll already reflects the newest lease: does not fire', result.rentRollAlreadyUpdated === null],
    ['Advance-signed renewal not yet started: still picks the lease actually currently in effect, even though the Rent Roll already reflects the renewal\'s dates', result.stillPicksCurrentlyEffectiveLease === 'older.pdf'],
    ['Rent Roll still reflects the older lease: FIRES, names the newer file', result.rentRollStale && result.rentRollStale.filename === 'newer.pdf'],
    ['Newer candidate not fully signed: does not fire', result.unsignedNewerIgnored === null],
    ['"Newer" candidate that actually started earlier: does not fire', result.olderCandidateIgnored === null],
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
