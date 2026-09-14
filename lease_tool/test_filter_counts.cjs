/* Option Filters: a box that would change nothing has to SAY so.
   ----------------------------------------------------------------------
   Reported by Azden, 2026-09-01: "toggling the optional filters sometimes
   results in numbers changing and sometimes do not."

   Two different things were behind that.

   ONE, AND IT WAS A REAL BUG. A bundled row's category is BUNDLE, which is not
   a filter option and never can be -- "bundled" is a shape, not a kind of
   charge. So the moment a bundle applied, its contents stopped being
   filterable: ticking Cable/Internet did nothing to a bundle with cable inside
   it. Bundled rows now carry the categories of the lease lines they were built
   from.

   TWO, AND IT WAS NOT A BUG. Most of the time the category simply had no
   flagged rows, so hiding it removed nothing. That is correct -- but a
   checkbox that behaves identically whether it is working or has nothing to do
   is indistinguishable from a broken one. Each filter now shows how many
   findings it holds.
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
  await page.evaluate(() => localStorage.removeItem('leaseproof_hidden_discrepancy_checks'));
  await page.reload();

  const out = await page.evaluate(() => {
    HIDDEN_CHECK_KEYS = new Set();
    // A bundle that does NOT reconcile, built from cable + a community fee,
    // so it is a real visible issue and a candidate for filtering.
    BUNDLE_RULES = [{ id:'b1', enabled:true, rentRollLabel:'Community Fee',
                      leaseLabels:['Community Fee - 1 Bedroom','Cable / Internet'] }];
    PROPERTY_LABEL_ALIASES = new Map();
    const rows = reconcileUnit(
      [ {rawLabel:'Community Fee - 1 Bedroom', amount:70}, {rawLabel:'Cable / Internet', amount:50} ],
      { unit:'C1', residents:'x', charges:[{description:'Community Fee', amount:115}], total:0 }, null).rows;
    const bundleRow = rows.find(r => r.bundle);

    unitEntries = [{ unit:'C1', unitKey:'C1', residents:'x', category:'mismatch', rows, verify:{ checks:[] } }];

    const cableKey = CHARGE_FILTER_PREFIX + (bundleRow.bundleCategories || [])
      .find(c => /CABLE/i.test(c));
    const beforeHidden = isRowFiltered(bundleRow);
    HIDDEN_CHECK_KEYS.add(cableKey);
    const afterHidden = isRowFiltered(bundleRow);
    HIDDEN_CHECK_KEYS.delete(cableKey);

    const counts = optionFilterCounts(unitEntries);
    renderDiscrepancyFilterPanel();
    const panel = document.getElementById('discrepancy-filter-checks').textContent;

    // and with nothing processed at all, no counts are shown
    const saved = unitEntries; unitEntries = [];
    renderDiscrepancyFilterPanel();
    const emptyPanel = document.getElementById('discrepancy-filter-checks').textContent;
    unitEntries = saved;

    return { cats: bundleRow.bundleCategories, cableKey, beforeHidden, afterHidden,
             cableCount: counts.get(cableKey) || 0,
             depositCount: counts.get('deposit') || 0,
             panel, emptyPanel };
  });

  check('A bundled row records the categories of the lines inside it',
        Array.isArray(out.cats) && out.cats.length === 2 && !!out.cableKey);
  check('THE BUG: switching off Cable/Internet now hides a bundle containing cable',
        out.beforeHidden === false && out.afterHidden === true);

  check('Each filter reports how many findings it is holding',
        out.cableCount === 1);
  check('...and a filter with nothing to hide reports zero rather than staying silent',
        out.depositCount === 0);
  check('The panel actually shows the counts',
        /\(1\)/.test(out.panel));
  /* Added 2026-09-06. The filter list is now drawn from THIS RUN's documents,
     so a category the property does not charge is absent rather than sitting
     there at zero. Azden: "the optional filters are strictly optional based on
     what is uploaded... it shouldn't look the same for everyone." */
  check('A category this property never charges is not listed at all',
        !/Security Deposit|Pet Rent|Animal Deposit/.test(out.panel));
  check('...while the categories it DOES charge are',
        /Cable/i.test(out.panel));
  check('Before anything is processed there are no counts at all — "(0)" everywhere would read as broken',
        !/\(\d+\)/.test(out.emptyPanel));

  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
