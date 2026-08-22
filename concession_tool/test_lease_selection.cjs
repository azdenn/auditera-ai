// Regression for: "the concessions upload of ledger is not working, handled
// [the same as] current leases and lease verify." Root cause found in the
// code: when a unit has more than one lease PDF on file (completely normal
// -- renewals, old leases, re-signed copies all pile up in the same ResMan
// export folder, same as the main Lease Verify tool already has to handle),
// this tool used to just overwrite leaseByUnit.set(unit, parsed) for every
// file processed, so whichever lease happened to be LAST in upload order
// silently won -- regardless of whether it was the lease actually in effect.
// That could easily pick an already-expired lease or a not-yet-started
// renewal, throwing off the concession math and rent comparison.
//
// Fix: leaseByUnit now keeps every lease file per unit, and pickCurrentLease
// ranks them by tier (currently in effect > future > ended > undated) before
// falling back to most-recent-start as a tiebreak -- the same philosophy as
// pickBestLeaseCandidate in the main Lease Verify tool.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('./concession_reconciler.html'));

  const result = await page.evaluate(() => {
    const now = new Date();
    const y = now.getFullYear();
    const mkDate = (yOff, m, d) => new Date(y+yOff, m, d);

    const expired = { unit:'406', monthlyBaseRent:1000, leaseStart: mkDate(-2,0,1), leaseEnd: mkDate(-1,0,1) };
    const current = { unit:'406', monthlyBaseRent:1300, leaseStart: mkDate(-1,6,1), leaseEnd: mkDate(1,6,1) };
    const future  = { unit:'406', monthlyBaseRent:1400, leaseStart: mkDate(1,0,1), leaseEnd: mkDate(2,0,1) };
    const undated = { unit:'406', monthlyBaseRent:999, leaseStart: null, leaseEnd: null };

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const out = {};

    out.tiers = {
      expired: leaseTier(expired, todayStart),
      current: leaseTier(current, todayStart),
      future: leaseTier(future, todayStart),
      undated: leaseTier(undated, todayStart),
    };

    // The critical case: expired lease processed/uploaded AFTER the current
    // one (this exact ordering is what the old Map.set() bug got wrong --
    // it would have kept "expired" here since it's last in the array).
    const groupExpiredLast = [
      {filename:'406_current_2026.pdf', data: current},
      {filename:'406_expired_2024.pdf', data: expired},
    ];
    const pickA = pickCurrentLease(groupExpiredLast);
    out.pickA = { rent: pickA.data.monthlyBaseRent, filename: pickA.data===current?'current':'expired', hasReason: !!pickA.reason };

    // Same two leases, opposite upload order -- must still pick "current"
    // (proves it's not accidentally still just "first wins" either).
    const groupExpiredFirst = [
      {filename:'406_expired_2024.pdf', data: expired},
      {filename:'406_current_2026.pdf', data: current},
    ];
    const pickB = pickCurrentLease(groupExpiredFirst);
    out.pickB = { rent: pickB.data.monthlyBaseRent, filename: pickB.data===current?'current':'expired' };

    // Three files: expired, current, and an advance-signed future renewal --
    // must still pick "current", not the future one (mirrors the exact
    // "renewal already on file but not yet in effect" scenario from the
    // main Lease Verify tool fix).
    const groupThree = [
      {filename:'406_future_renewal.pdf', data: future},
      {filename:'406_expired_2024.pdf', data: expired},
      {filename:'406_current_2026.pdf', data: current},
    ];
    const pickC = pickCurrentLease(groupThree);
    out.pickC = { rent: pickC.data.monthlyBaseRent, isCurrent: pickC.data===current, count: pickC.count };

    // Single lease file -- must still work exactly as before (no reason text
    // needed when there's nothing to disambiguate).
    const pickSingle = pickCurrentLease([{filename:'only.pdf', data: current}]);
    out.pickSingle = { rent: pickSingle.data.monthlyBaseRent, hasReason: !!pickSingle.reason };

    // No leases at all for a unit -- must return null cleanly, not throw.
    const pickEmpty = pickCurrentLease([]);
    out.pickEmpty = { isNull: pickEmpty.data === null };

    // Two undated leases -- can't rank by tier, must not crash; should still
    // return SOME lease (tier 3 for both, tiebreak by date, both null -- so
    // stable pick of one of them) rather than throwing.
    const pickUndated = pickCurrentLease([{filename:'a.pdf', data: undated}, {filename:'b.pdf', data: {...undated, monthlyBaseRent:888}}]);
    out.pickUndated = { didNotThrow: true, gotSomething: pickUndated.data != null };

    return out;
  });

  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['leaseTier: currently-in-effect lease -> tier 0', result.tiers.current === 0],
    ['leaseTier: future/not-yet-started lease -> tier 1', result.tiers.future === 1],
    ['leaseTier: already-ended lease -> tier 2', result.tiers.expired === 2],
    ['leaseTier: undated/unreadable lease -> tier 3', result.tiers.undated === 3],
    ['Expired lease uploaded LAST does not win -- current lease is picked ($1300)', result.pickA.rent === 1300 && result.pickA.filename === 'current'],
    ['pickCurrentLease explains its reasoning when there was more than one file', result.pickA.hasReason === true],
    ['Same two leases, opposite upload order -- still picks current (not order-dependent)', result.pickB.rent === 1300 && result.pickB.filename === 'current'],
    ['Three files including an advance-signed future renewal -- still picks the one actually in effect, not the future one', result.pickC.isCurrent === true],
    ['pickCurrentLease reports how many files it chose between', result.pickC.count === 3],
    ['Single lease file: picked as-is', result.pickSingle.rent === 1300],
    ['Single lease file: no disambiguation reason needed', result.pickSingle.hasReason === false],
    ['No lease files for a unit: returns null cleanly, no crash', result.pickEmpty.isNull === true],
    ['Two undated leases: does not throw, still returns a lease', result.pickUndated.didNotThrow === true && result.pickUndated.gotSomething === true],
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
