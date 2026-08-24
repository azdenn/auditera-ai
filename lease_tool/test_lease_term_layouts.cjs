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

    // Layout A (original, already-handled quirk): both dates bunched together
    // after the second label.
    const layoutA = 'B. Initial Lease Term. Begins:____ Ends at 11:59 p.m. on:____ 08/04/2025 08/04/2027';
    out.layoutA = extractLeaseTermDates(layoutA);

    // Layout B (the newly-added case): each date filled in inline, right
    // after its own label -- this is the layout that was previously
    // returning found:false entirely (leaseTermFound: false -> tier 3
    // "unreadable" -> loses the lease-selection tiebreak to any other
    // candidate with a readable, even if expired, term).
    const layoutB = 'B. Initial Lease Term. Begins: 08/04/2025 Ends at 11:59 p.m. on: 08/04/2027';
    out.layoutB = extractLeaseTermDates(layoutB);

    // Layout B with extra boilerplate between the two labels (real leases
    // often have more text in between than the minimal examples above) --
    // confirms the two labels are matched independently, not as one
    // contiguous phrase.
    const layoutBNoisy = 'B. Initial Lease Term. Begins: 08/04/2025 and continues until the Lease is terminated. Ends at 11:59 p.m. on: 08/04/2027, unless renewed or terminated earlier as provided below.';
    out.layoutBNoisy = extractLeaseTermDates(layoutBNoisy);

    // A lease with no recognizable term section at all should still cleanly
    // report not-found, not throw or match garbage.
    out.noTermSection = extractLeaseTermDates('This document has no lease term language in it whatsoever.');

    // ---- The actual reported bug: a lease ending 2027 (i.e. currently
    // valid, tier 0) using Layout B must now correctly outrank an older,
    // already-expired Layout-A lease during selection -- previously it
    // would have been tier 3 (unreadable) and LOST that comparison. ----
    const oldExpiredLayoutA = {
      filename: 'old_expired.pdf',
      verification: (() => {
        const t = extractLeaseTermDates('Initial Lease Term. Begins:____ Ends at 11:59 p.m. on:____ 01/01/2023 12/31/2023');
        return { leaseTermFound: t.found, leaseTermStart: t.start, leaseTermEnd: t.end, signatureFindings: [{kind:'row-resident', present:true},{kind:'anchor-owner', present:true}] };
      })(),
    };
    const currentLayoutB2027 = {
      filename: 'a105_current_2027.pdf',
      verification: (() => {
        const t = extractLeaseTermDates('Initial Lease Term. Begins: 08/04/2025 Ends at 11:59 p.m. on: 08/04/2027');
        return { leaseTermFound: t.found, leaseTermStart: t.start, leaseTermEnd: t.end, signatureFindings: [{kind:'row-resident', present:true},{kind:'anchor-owner', present:true}] };
      })(),
    };
    const pick = pickBestLeaseCandidate([oldExpiredLayoutA, currentLayoutB2027], null, new Date(2026, 7, 12));
    out.a105Scenario = { chosenFilename: pick.chosen ? pick.chosen.filename : null, ambiguous: pick.ambiguous, reason: pick.reason };

    // ---- UTC/local timezone consistency check: a lease ending literally
    // "today" (per UTC) must land in tier 0 (current), not accidentally
    // tier 2 (expired) due to a timezone-offset mismatch between how "today"
    // and the lease's own dates are computed. ----
    const now = new Date(2026, 7, 12); // Aug 12 2026, LOCAL
    const todayUTCStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const endsToday = { leaseTermFound:true, leaseTermStart: new Date(Date.UTC(2026,0,1)), leaseTermEnd: new Date(Date.UTC(2026,7,12)) };
    out.tierForLeaseEndingToday = leaseTier(endsToday, todayUTCStart);

    return out;
  });

  console.log('=== Layout extraction checks ===');
  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['Layout A still works (unchanged)', result.layoutA.found && result.layoutA.startRaw==='08/04/2025' && result.layoutA.endRaw==='08/04/2027'],
    ['Layout B (inline dates) now extracts correctly', result.layoutB.found && result.layoutB.startRaw==='08/04/2025' && result.layoutB.endRaw==='08/04/2027'],
    ['Layout B with noisy text between labels still works', result.layoutBNoisy.found && result.layoutBNoisy.startRaw==='08/04/2025' && result.layoutBNoisy.endRaw==='08/04/2027'],
    ['No term section -> found:false, no crash/garbage match', result.noTermSection.found === false],
    ['A105-style scenario: current 2027-end Layout-B lease beats old expired Layout-A lease', result.a105Scenario.chosenFilename === 'a105_current_2027.pdf'],
    ['Lease ending exactly "today" (UTC) is tier 0 (current), not tier 2', result.tierForLeaseEndingToday === 0],
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
