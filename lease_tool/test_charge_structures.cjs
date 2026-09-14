/* Finding a property's pricing structure by comparing its units.
   ----------------------------------------------------------------------
   Everything else in the tool examines one unit and then groups the answers,
   which is why it could not see what a person saw in a minute at The Rail:
   cable is its own $50 line on 67 units and folded into the Community Fee on
   the other 33, and on those 33 the Community Fee is exactly $45 higher.

   No unit contains that fact. It exists only BETWEEN units.

   The fixture below is The Rail's real shape, at 1/3 scale and with its real
   numbers: one-beds at $70 and two-beds at $100 where cable is separate,
   $115 and $145 where it is not. The tiers are the point -- a test that
   compared one number against one number would pass on the one-beds and miss
   the two-beds entirely.

   The last two cases are the ones that matter most. This pass must stay quiet
   when the numbers do not actually line up, because an audit tool that starts
   narrating imagined structures is worse than one that says nothing.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' -- ' + name); cond ? pass++ : fail++; };

const u = (unit, charges) => ({ unit, rawResman: charges.map(([description, amount]) => ({ description, amount })) });

// itemised: Community Fee at its base, cable on its own line
const itemised = (unit, cf) => u(unit, [['Community Fee', cf], ['Cable / Internet Fee', 50], ['Resident Liability Insurance', 10]]);
// bundled: cable gone, Community Fee $45 higher
const bundled  = (unit, cf) => u(unit, [['Community Fee', cf], ['Resident Liability Insurance', 10]]);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const out = await page.evaluate(({ rail, noisy, flat, dirty }) => {
    const pick = (list) => {
      const all = detectChargeStructures(list);
      return all.find(s => /community fee/i.test(s.inside)) || null;
    };
    const s = pick(rail);
    return {
      s, text: s ? describeChargeStructure(s) : null, q: s ? chargeStructureQuestion(s) : null,
      total: detectChargeStructures(rail).length,
      noisy: detectChargeStructures(noisy).length,
      flat: detectChargeStructures(flat).length,
      dirty: (() => { const d = pick(dirty); return d ? { tiers: d.itemisedPrices, q: chargeStructureQuestion(d), price: d.partPrice } : null; })(),
    };
  }, {
    // The Rail's real shape: two tiers on each side of the split.
    rail: [
      itemised('A1', 70), itemised('A2', 70), itemised('A3', 70), itemised('B4', 70), itemised('H1', 70),
      itemised('26', 100), itemised('6', 100), itemised('3', 100),
      bundled('C1', 115), bundled('C2', 115), bundled('G2', 115), bundled('L1', 115),
      bundled('1', 145), bundled('22', 145), bundled('4', 145),
    ],
    // Same split, but the amounts do not line up on any single constant.
    noisy: [
      itemised('A1', 70), itemised('A2', 70), itemised('A3', 70),
      bundled('C1', 115), bundled('C2', 132), bundled('G2', 149),
    ],
    /* The Rail's real export, plus the one bad row it actually contains: a
       totals line read as a unit, carrying a $8,930 Community Fee and a $3,350
       cable charge. One bad row in a hundred must not silence the finding or
       make it print nonsense tiers. */
    dirty: [
      itemised('A1', 70), itemised('A2', 70), itemised('A3', 70), itemised('B4', 70),
      itemised('26', 100), itemised('6', 100), itemised('3', 100),
      u('Y4', [['Community Fee', 8930], ['Cable / Internet Fee', 3350]]),
      bundled('C1', 115), bundled('C2', 115), bundled('G2', 115),
      bundled('1', 145), bundled('22', 145), bundled('4', 145),
    ],
    // Cable comes and goes, but Community Fee never moves. No structure.
    flat: [
      itemised('A1', 70), itemised('A2', 70), itemised('A3', 70),
      bundled('C1', 70), bundled('C2', 70), bundled('G2', 70),
    ],
  });

  check('It finds the structure nobody told it about',
        !!out.s && /community fee/i.test(out.s.inside) && /cable/i.test(out.s.part));
  check('...and reads the constant correctly as $45',
        !!out.s && out.s.offset === 45);
  check('...across BOTH tiers, which a single-value test would have missed',
        !!out.s && out.s.itemisedPrices.join(',') === '70,100' && out.s.bundledPrices.join(',') === '115,145');
  check('...with the right units on each side (7 bundled, 8 itemised)',
        !!out.s && out.s.bundledUnits.length === 7 && out.s.itemisedUnits.length === 8);

  check('It says it in a sentence a property manager would recognise',
        !!out.text && /no “Cable \/ Internet Fee” line at all/.test(out.text) && /\$45\.00 higher/.test(out.text));
  check('...and names the tiers rather than hiding them behind an average',
        !!out.text && /\$70\.00 and \$100\.00 become \$115\.00 and \$145\.00/.test(out.text));

  check('THE POINT: it asks about the one thing the documents cannot answer',
        !!out.q && /costs \$50\.00 where it is billed on its own, but only \$45\.00 goes into/.test(out.q));
  check('...naming the gap as $5 and calling it a question, not a finding',
        !!out.q && /difference of \$5\.00/.test(out.q) && /Is that an intentional bundle price/.test(out.q));
  check('...and it knows the $5 is unexplained, not zero',
        !!out.s && out.s.unexplained === 5 && out.s.partPrice === 50);

  check('ONE BAD ROW does not silence the question — a price is what nearly every unit pays',
        !!out.dirty && out.dirty.price === 50 && !!out.dirty.q);
  check('...and the stray $8,930 is never printed as a tier',
        !!out.dirty && out.dirty.tiers.join(',') === '70,100');

  check('IT STAYS QUIET when the amounts do not fit one constant', out.noisy === 0);
  check('IT STAYS QUIET when the charge does not move at all', out.flat === 0);
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
