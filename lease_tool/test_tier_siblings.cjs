/* The lease prints every floorplan's price. The resident owes one of them.
   ----------------------------------------------------------------------
   Every lease at The Rail carries both lines:

       Other: Community Fee - 1 Bedroom     $115.00
       Other: Community Fee - 2 Bedroom     $145.00

   A one-bedroom is billed $115, so the $115 line reconciles and the $145 line
   has no counterpart -- and was reported as a real "on the lease, not on the
   Rent Roll" finding on every single unit of the property, on the charge the
   property cares most about.

   A tier rule already existed but only fired once somebody had SAVED a house
   rule declaring the two labels to be one charge. The lease already says so
   in its own labels, and the Rent Roll already says which tier is owed. This
   reads that without being told.

   The danger is over-softening: a charge marked soft stops being checked. So
   the sibling test is exact -- the labels must be identical apart from tier
   words -- and there must be a reconciled sibling proving which tier was
   billed. "Pet Rent" and "Pet Fee" share a stem and are NOT tiers. */
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
    const sib = (a,b) => looksLikeTierSibling(a,b);
    const run = (rows) => { applyTierSiblingPass(rows); return rows; };

    // The real Rail unit: a 1-bed billed $115, both tiers on the lease.
    const rail = run([
      {label:'Rent', leaseVal:930, resmanVal:930, status:'match', leaseRaw:['Monthly Base Rent']},
      {label:'Community Fee', leaseVal:115, resmanVal:115, status:'match', leaseRaw:['Community Fee - 1 Bedroom']},
      {label:'Community Fee - 2 Bedroom', leaseVal:145, resmanVal:null, status:'leaseonly', leaseRaw:['Community Fee - 2 Bedroom']},
    ]);

    // A two-bedroom on the same property: the OTHER tier is the billed one.
    const twoBed = run([
      {label:'Community Fee', leaseVal:145, resmanVal:145, status:'match', leaseRaw:['Community Fee - 2 Bedroom']},
      {label:'Community Fee - 1 Bedroom', leaseVal:115, resmanVal:null, status:'leaseonly', leaseRaw:['Community Fee - 1 Bedroom']},
    ]);

    // Two genuinely different charges that merely share a word.
    const petRows = run([
      {label:'Pet Rent', leaseVal:20, resmanVal:20, status:'match', leaseRaw:['Pet Rent']},
      {label:'Pet Fee', leaseVal:300, resmanVal:null, status:'leaseonly', leaseRaw:['Pet Fee']},
    ]);

    // A tier line at the SAME amount as the billed one is a duplicate, and a
    // real question -- not something to quietly soften.
    const dupe = run([
      {label:'Community Fee', leaseVal:115, resmanVal:115, status:'match', leaseRaw:['Community Fee - 1 Bedroom']},
      {label:'Community Fee - 2 Bedroom', leaseVal:115, resmanVal:null, status:'leaseonly', leaseRaw:['Community Fee - 2 Bedroom']},
    ]);

    // No reconciled sibling: nothing proves which tier is owed, so neither
    // line may be softened.
    const unproven = run([
      {label:'Community Fee - 1 Bedroom', leaseVal:115, resmanVal:null, status:'leaseonly', leaseRaw:['Community Fee - 1 Bedroom']},
      {label:'Community Fee - 2 Bedroom', leaseVal:145, resmanVal:null, status:'leaseonly', leaseRaw:['Community Fee - 2 Bedroom']},
    ]);

    return {
      sibBedroom: sib('Community Fee - 1 Bedroom', 'Community Fee - 2 Bedroom'),
      sibStudio: sib('Amenity Fee Studio', 'Amenity Fee 2 Bedroom'),
      sibPet: sib('Pet Rent', 'Pet Fee'),
      sibSame: sib('Community Fee - 1 Bedroom', 'Community Fee - 1 Bedroom'),
      sibDifferent: sib('Community Fee - 1 Bedroom', 'Valet Trash - 1 Bedroom'),
      sibNoTierWord: sib('Cable', 'Internet'),
      rail, twoBed, petRows, dupe, unproven,
    };
  });

  check('Two floorplan tiers of one charge are siblings', out.sibBedroom === true);
  check('...including studio vs 2 bedroom', out.sibStudio === true);
  check('Pet Rent and Pet Fee are NOT tiers of one charge', out.sibPet === false);
  check('A label is not a tier sibling of itself', out.sibSame === false);
  check('Two different charges at the same tier are not siblings', out.sibDifferent === false);
  check('Two unrelated charges with no tier word are not siblings', out.sibNoTierWord === false);

  check('THE REAL CASE: the unbilled 2-bedroom tier stops being a mismatch',
        out.rail[2].soft === true && out.rail[2].tierOption === true);
  check('...and the note says which tier was billed', /\$115\.00/.test(out.rail[2].note || ''));
  check('...while the tier that WAS billed is untouched', !out.rail[1].soft);
  check('...and unrelated rows are untouched', !out.rail[0].soft);

  check('It works the other way round on a two-bedroom', out.twoBed[1].soft === true);

  check('Pet Fee is still a real finding', !out.petRows[1].soft);
  check('A second line at the SAME amount stays a real finding', !out.dupe[1].soft);
  check('With nothing reconciled, neither tier is softened',
        !out.unproven[0].soft && !out.unproven[1].soft);
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass+fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
