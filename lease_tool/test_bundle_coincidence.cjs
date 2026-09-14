/* When two numbers add up by accident.
   ----------------------------------------------------------------------
   Reported by Azden, 2026-09-06, from the real Rail run. Units 4, 5, 6, M3,
   V3 and Y1 all showed:

       Community Fee (bundled)   $70.00   $145.00   Mismatch
       "Animal rent $20.00 + Washer/Dryer $50.00 = $70.00 on the lease,
        against the single Community Fee line of $145.00"

   while the lease's own "Community Fee - 2 Bedroom $145.00" sat directly
   underneath, unmatched. His words: "I want you to see how it's 145 in the
   rent roll and then there's a 145 in the lease and then that should match."

   WHAT WENT WRONG. Animal rent $20 + Washer/Dryer $50 = $70, and the base
   one-bedroom Community Fee at The Rail is also exactly $70. On one one-bedroom
   those numbers lined up, the tool took the arithmetic as proof of a bundle,
   and then applied that rule to every unit in the property -- including the
   two-bedrooms billed $145, where it is simply false.

   TWO GUARDS, AND BOTH ARE NEEDED.

   1. A two-part bundle must share wording with the line it claims to be.
      Three or more parts summing to the exact cent is not luck and may still
      stand on arithmetic alone -- that case is real and is what bundles exist
      for (see test_bundled_charges: WiFi + Trash + Pet Rent + Pest Control =
      Amenities, which shares no wording with "Amenities").

   2. A bundle never takes a rent roll line that already has its own match on
      the lease at the same amount. $145 and $145 are each other.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' -- ' + name); cond ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const out = await page.evaluate(() => {
    PROPERTY_LABEL_ALIASES = new Map();

    // The Rail's real lease lines on a two-bedroom, and the real rent roll.
    const twoBedLease = [
      { rawLabel: 'Animal rent', amount: 20 },
      { rawLabel: 'Washer/Dryer', amount: 50 },
      { rawLabel: 'Community Fee - 1 Bedroom', amount: 115 },
      { rawLabel: 'Community Fee - 2 Bedroom', amount: 145 },
    ];
    const billedAsRail = [{ description: 'Community Fee', amount: 145 }];

    // --- the coincidence, as a rule that already exists ---
    BUNDLE_RULES = [{ id: 'b1', enabled: true, rentRollLabel: 'Community Fee',
                      leaseLabels: ['Animal rent', 'Washer/Dryer'] }];
    const railRows = reconcileUnit(twoBedLease,
      { unit: '4', residents: 'x', charges: billedAsRail, total: 0 }, null).rows;

    // --- would the tool CREATE that rule on its own? ---
    BUNDLE_RULES = [];
    const oneBedLease = [
      { rawLabel: 'Animal rent', amount: 20 },
      { rawLabel: 'Washer/Dryer', amount: 50 },
    ];
    const coincidenceUnits = ['A1','A2','A3'].map(u => ({
      unit: u,
      rows: reconcileUnit(oneBedLease,
        { unit: u, residents: 'x', charges: [{ description: 'Community Fee', amount: 70 }], total: 0 }).rows,
    }));
    unitEntries = coincidenceUnits;
    const autoApplied = coincidenceUnits.length ? autoApplyDetectedBundles() : false;
    const autoRules = BUNDLE_RULES.slice();
    // ...but it is still OFFERED, with its evidence.
    const offered = detectBundleCandidates(coincidenceUnits)
      .filter(c => /community fee/i.test(c.rentRollLabel));

    return {
      railBundleRow: railRows.find(r => r.bundle) || null,
      railCommunityFee: railRows.find(r => /community fee/i.test(r.label) && !r.bundle) || null,
      railRows: railRows.map(r => ({ label: r.label, status: r.status, l: r.leaseVal, m: r.resmanVal, soft: !!r.soft })),
      autoApplied, autoRuleCount: autoRules.length,
      offeredCount: offered.length,
      offeredParts: offered[0] ? offered[0].leaseLabels : null,
    };
  });

  check('THE BUG: no bundle steals the $145 line any more',
        out.railBundleRow === null);

  const cf = out.railCommunityFee;
  check('$145 on the lease matches $145 on the rent roll',
        !!cf && cf.leaseVal === 145 && cf.resmanVal === 145);
  check('...and it is not a mismatch',
        !!cf && cf.status !== 'mismatch' && cf.status !== 'leaseonly' && cf.status !== 'resmanonly');
  check('...and no row anywhere claims $70 against $145',
        !out.railRows.some(r => r.l === 70 && r.m === 145));

  check('A TWO-PART COINCIDENCE NEVER APPLIES ITSELF, even where the sum is exact',
        out.autoApplied === false && out.autoRuleCount === 0);
  check('...but it is still offered, so a person can recognise it',
        out.offeredCount === 1 && (out.offeredParts || []).length === 2);

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
