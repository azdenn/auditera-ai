/* One bundle rule has to cover every floorplan.
   ----------------------------------------------------------------------
   Reported by Azden from the first real run, 2026-09-01: units 4 and 5 still
   showed a Community Fee mismatch after the bundle was approved. Both are
   two-bedrooms.

   The approved bundle names "Community Fee - 1 Bedroom", because that is what
   the twenty-odd one-bedrooms it was found on happen to say. A two-bedroom
   lease says "Community Fee - 2 Bedroom", so it never matched — even though
   the TIERS rule already sitting beside it says those two spellings are the
   same charge. Two true rules that were not talking to each other.

   Real numbers from The Rail, both floorplans, same $5 bundle price:
       1-bed   70 + 50 - 5 = 115
       2-bed  100 + 50 - 5 = 145

   Only six units are bundled two-bedrooms and two of those have leases already
   written in bundled form, so a separate two-bedroom bundle would never have
   reached RULE_MIN_UNITS to be offered in the first place. Composing the two
   rules is not a shortcut here; it is the only way those units are ever
   covered.
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
    const bundleRule = { id:'b1', enabled:true, rentRollLabel:'Community Fee',
                         leaseLabels:['Community Fee - 1 Bedroom','Cable / Internet'], difference:-5 };
    const run = (lease, billed) => reconcileUnit(lease,
      { unit:'U', residents:'x', charges:[{description:'Community Fee', amount:billed}], total:0 }, null).rows;

    const twoBed  = [ {rawLabel:'Community Fee - 2 Bedroom', amount:100}, {rawLabel:'Cable / Internet', amount:50} ];
    const oneBed  = [ {rawLabel:'Community Fee - 1 Bedroom', amount:70},  {rawLabel:'Cable / Internet', amount:50} ];
    // A lease that prints BOTH tiers, which is the normal Rail form.
    const bothTiers = [ {rawLabel:'Community Fee - 1 Bedroom', amount:70},
                        {rawLabel:'Community Fee - 2 Bedroom', amount:100},
                        {rawLabel:'Cable / Internet', amount:50} ];

    // Without the tier rule the two-bedroom cannot match -- that is the bug.
    PROPERTY_LABEL_ALIASES = new Map();
    BUNDLE_RULES = [bundleRule];
    const before = run(twoBed, 145).find(r => r.bundle) || null;

    // With the tier rule approved, the same one bundle covers it.
    PROPERTY_LABEL_ALIASES = new Map([
      ['community fee 1 bedroom', 'Community Fee'],
      ['community fee 2 bedroom', 'Community Fee'],
    ].map(([k,v]) => [k, v]));
    // rebuild uses prNormalizeLabel keys; mirror that exactly
    PROPERTY_LABEL_ALIASES = new Map([
      [prNormalizeLabel('Community Fee - 1 Bedroom'), 'Community Fee'],
      [prNormalizeLabel('Community Fee - 2 Bedroom'), 'Community Fee'],
    ]);

    const two   = run(twoBed, 145);
    const one   = run(oneBed, 115);
    const both  = run(bothTiers, 115);
    const bothB = run(bothTiers, 145);

    return {
      before,
      two:   two.find(r => r.bundle)   || null,
      one:   one.find(r => r.bundle)   || null,
      both:  both.find(r => r.bundle)  || null,
      bothB: bothB.find(r => r.bundle) || null,
      twoIssues:  two.filter(r => r.status === 'mismatch' || r.status === 'leaseonly' || r.status === 'resmanonly').length,
      bothIssues: both.filter(r => (r.status === 'mismatch' || r.status === 'leaseonly' || r.status === 'resmanonly') && !r.soft).length,
    };
  });

  check('THE BUG: without the tier rule, a two-bedroom never matched the bundle',
        out.before === null);

  check('With the tier rule, ONE bundle now covers the two-bedroom',
        !!out.two && out.two.status !== 'mismatch');
  check('...at the real numbers: $100 + $50 on the lease against $145 billed',
        !!out.two && out.two.leaseVal === 150 && out.two.resmanVal === 145);
  check('...and the unit raises nothing else', out.twoIssues === 0);
  check('The one-bedroom still works exactly as before',
        !!out.one && out.one.status !== 'mismatch' && out.one.leaseVal === 120 && out.one.resmanVal === 115);

  check('A lease printing BOTH tiers takes the one that applies, not both',
        !!out.both && out.both.leaseVal === 120 && out.both.status !== 'mismatch');
  check('...and the same lease on a two-bedroom bill takes the other tier',
        !!out.bothB && out.bothB.leaseVal === 150 && out.bothB.status !== 'mismatch');
  check('...without the unused tier becoming a finding of our own making',
        out.bothIssues === 0);

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
