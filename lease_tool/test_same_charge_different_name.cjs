/* The same charge, spelled differently by two systems.
   ----------------------------------------------------------------------
   Reported by Azden, 2026-09-06, from Garden Creek A109:

     "on the rent roll it says 'furnished apartment rental' and on the lease it
      says 'furnished package rental' and Auditera didn't match the two, it made
      up a different name. It needs to look at the name and look at how much is
      charged and make the right call, that these are the same charge, the name
      is just different."

   Before this, Pass 2 paired them on the money, labelled the row
   "Furnished Package Rental / Furnished Apartment Rental" and marked it
   Review. Two problems: the slash-mashup is a name neither document uses, and
   a Review on something obviously fine teaches people to click past reviews --
   which is how a real one gets missed.

   THE LINE IS TWO SHARED MEANINGFUL WORDS, and it is drawn there on purpose.
   "Furnished ... Rental" is two, and those are one charge. "Pet Rent" and
   "Storage Rent" share exactly one ("rent") and are nothing like each other --
   that pair must keep asking for a human, and the last case below proves it
   still does.
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
    BUNDLE_RULES = []; PROPERTY_LABEL_ALIASES = new Map();
    const run = (leaseLabel, leaseAmt, rrLabel, rrAmt) =>
      reconcileUnit([{ rawLabel: leaseLabel, amount: leaseAmt }],
        { unit: 'A109', residents: 'x', charges: [{ description: rrLabel, amount: rrAmt }], total: 0 },
        null).rows;

    return {
      a109:      run('Furnished Package Rental', 250, 'Furnished Apartment Rental', 250),
      oneWord:   run('Pet Rent', 35, 'Storage Rent', 35),
      noWords:   run('Covered Parking', 40, 'Trash Valet', 40),
      different: run('Furnished Package Rental', 250, 'Furnished Apartment Rental', 300),
      words:     { a109: looksLikeSameCharge('Furnished Package Rental', 'Furnished Apartment Rental'),
                   pet:  looksLikeSameCharge('Pet Rent', 'Storage Rent'),
                   none: looksLikeSameCharge('Covered Parking', 'Trash Valet') },
    };
  });

  const a = out.a109[0];
  check('A109: the two names are recognised as one charge',
        !!a && a.status === 'match');
  check('...and it is NOT called "X / Y" any more',
        !!a && !/\//.test(a.label));
  check('...it carries the rent roll\'s name, which is what they will search for',
        !!a && a.label === 'Furnished Apartment Rental');
  check('...with both spellings kept in the note, so nothing is hidden',
        !!a && /Furnished Package Rental/.test(a.note) && /Furnished Apartment Rental/.test(a.note));
  check('...and both sides still carry their own original wording',
        !!a && a.leaseRaw[0] === 'Furnished Package Rental' && a.resmanRaw[0] === 'Furnished Apartment Rental');

  check('THE LINE HOLDS: "Pet Rent" vs "Storage Rent" is never merged',
        out.oneWord.length === 2 && !out.oneWord.some(r => r.status === 'match'));
  check('...and two unrelated names at the same price are never merged',
        out.noWords.length === 2 && !out.noWords.some(r => r.status === 'match'));
  check('...because after the filler words are dropped they share nothing',
        out.words.a109 === true && out.words.pet === false && out.words.none === false);

  check('DIFFERENT AMOUNTS ARE NEVER MERGED, however alike the names',
        out.different.length === 2 && !out.different.some(r => r.status === 'match'));

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
