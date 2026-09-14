/* A bundle the property prices below its parts.
   ----------------------------------------------------------------------
   The Rail runs two plans for the same charge. Confirmed against the real
   rent roll, 100 units, zero exceptions:

     unbundled  Community Fee $70  +  Cable / Internet $50   = $120
     bundled    Community Fee $115, no cable line at all

   Cable goes in at $45 rather than the $50 it costs standalone. Rajeev
   confirmed that is deliberate -- "intentional... idea is to save money with
   a bundle" -- so five dollars must stop being reported as a discrepancy on
   33 units, WITHOUT loosening the exact-sum test that catches real gaps.

   The answer is a DECLARED difference on the bundle rule. The arithmetic
   still has to close; it closes at the declared number instead of at zero,
   and the same evidence check that governs every rule re-proves that number
   every run.

   Three things this must never do, all asserted below:
     1. fire on the 67 units that bill cable separately
     2. apply itself without someone approving it
     3. absorb a gap too large to be a package price -- the $45 that started
        this investigation has to stay a finding
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' -- ' + name); cond ? pass++ : fail++; };

// A bundled unit: one Community Fee line, no cable line on the rent roll.
const bundledUnit = (unit, billed) => ({
  unit, unitKey: unit, residents: 'R ' + unit, category: 'mismatch',
  lease: [ {rawLabel:'Community Fee - 1 Bedroom', amount:70}, {rawLabel:'Cable / Internet', amount:50} ],
  resman: [ {description:'Community Fee', amount:billed} ],
});
// An unbundled unit: both lines billed separately.
const unbundledUnit = (unit) => ({
  unit, unitKey: unit, residents: 'R ' + unit, category: 'mismatch',
  lease: [ {rawLabel:'Community Fee - 1 Bedroom', amount:70}, {rawLabel:'Cable / Internet', amount:50} ],
  resman: [ {description:'Community Fee', amount:70}, {description:'Cable / Internet Fee', amount:50} ],
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const out = await page.evaluate(({ bundled, unbundled }) => {
    const mk = u => ({ ...u, rows: reconcileUnit(u.lease,
      { unit: u.unit, residents: u.residents, charges: u.resman, total: 0 }, null).rows });

    // ---- detection, across a mix of both plans ----
    BUNDLE_RULES = [];
    const mixed = [ ...bundled.map(mk), ...unbundled.map(mk) ];
    const cands = detectBundleCandidates(mixed);
    const cf = cands.find(c => /community fee/i.test(c.rentRollLabel));

    // ---- a gapped candidate must not auto-apply ----
    BUNDLE_RULES = [];
    unitEntries = mixed;
    const autoApplied = autoApplyDetectedBundles();
    const autoRules = BUNDLE_RULES.slice();

    // ---- with the rule approved ----
    BUNDLE_RULES = [{ id:'b1', enabled:true, rentRollLabel:'Community Fee',
                      leaseLabels:['Community Fee - 1 Bedroom','Cable / Internet'], difference:-5 }];
    const bundledRows = reconcileUnit(bundled[0].lease,
      { unit:'C1', residents:'x', charges: bundled[0].resman, total:0 }, null).rows;
    const unbundledRows = reconcileUnit(unbundled[0].lease,
      { unit:'A2', residents:'x', charges: unbundled[0].resman, total:0 }, null).rows;

    // ---- a unit where the gap is NOT the declared one ----
    const offRows = reconcileUnit(bundled[0].lease,
      { unit:'X', residents:'x', charges:[{description:'Community Fee', amount:95}], total:0 }, null).rows;

    const rule = { type:'bundle', rentRollLabel:'Community Fee',
                   leaseLabels:['Community Fee - 1 Bedroom','Cable / Internet'], difference:-5 };
    const vocab = ['Community Fee','Community Fee - 1 Bedroom','Cable / Internet'];
    const ev = prCheckRuleAgainstData(rule, bundled.map(mk));
    const evMixedGap = prCheckRuleAgainstData(rule,
      [ mk(bundled[0]), mk(bundled[1]), mk({ ...bundled[2], resman:[{description:'Community Fee', amount:95}] }) ]);

    /* A PLAIN, EXACT bundle re-checked AFTER it has been applied.
       This is the latent bug this feature's tests uncovered: the applied
       bundle collapses its lease lines into one row, every label then resolved
       to that same row, and summing per-label counted the total twice -- so an
       ordinary saved bundle contradicted itself and suspended on its second
       run. Nothing had ever re-checked a bundle across two runs before. */
    const plainRule = { type:'bundle', rentRollLabel:'Amenities',
                        leaseLabels:['WiFi','Trash'] };
    BUNDLE_RULES = [{ id:'b2', enabled:true, ...plainRule }];
    const plainRows = reconcileUnit(
      [ {rawLabel:'WiFi', amount:30}, {rawLabel:'Trash', amount:20} ],
      { unit:'P1', residents:'x', charges:[{description:'Amenities', amount:50}], total:0 }, null).rows;
    const evPlainAfterApply = prCheckRuleAgainstData(plainRule,
      [{ unit:'P1', rows: plainRows }]);

    return {
      plainApplied: !!plainRows.find(r => r.bundle),
      evPlain: { holds: evPlainAfterApply.holdsOn, contradicts: evPlainAfterApply.contradictedOn },
      cand: cf ? { difference: cf.difference, units: cf.units.length } : null,
      autoApplied, autoRuleCount: autoRules.length,
      bundledRow: bundledRows.find(r => r.bundle) || null,
      unbundledBundleRow: unbundledRows.find(r => r.bundle) || null,
      unbundledStatuses: unbundledRows.map(r => ({label:r.label, status:r.status})),
      offRow: offRows.find(r => r.bundle) || null,
      ev: { holds: ev.holdsOn, contradicts: ev.contradictedOn, confident: ev.confident },
      evMixedGap: { holds: evMixedGap.holdsOn, contradicts: evMixedGap.contradictedOn, confident: evMixedGap.confident },
      describe: prDescribeRule(rule),
      okBig: prValidateRule({ ...rule, difference:-45 }, vocab),
      okSmall: prValidateRule(rule, vocab),
      keysDiffer: prRuleKey(rule) !== prRuleKey({ ...rule, difference: undefined }),
    };
  }, { bundled: [bundledUnit('C1',115), bundledUnit('C2',115), bundledUnit('G2',115)],
       unbundled: [unbundledUnit('A2'), unbundledUnit('B4'), unbundledUnit('H1')] });

  check('The $5 gap is detected, and read as a bundle price of -$5',
        !!out.cand && out.cand.difference === -5);
  check('...only from the units actually on that plan (3 of the 6)',
        !!out.cand && out.cand.units === 3);
  check('A priced bundle NEVER applies on its own — it waits for approval',
        out.autoApplied === false && out.autoRuleCount === 0);

  check('APPROVED: the bundled unit reconciles instead of showing a $5 discrepancy',
        !!out.bundledRow && out.bundledRow.status !== 'mismatch');
  check('...and still shows the real itemised lease total, $120, not our arithmetic',
        !!out.bundledRow && out.bundledRow.leaseVal === 120 && out.bundledRow.resmanVal === 115);
  check('...with the discount stated out loud rather than silently absorbed',
        !!out.bundledRow && /prices the bundle \$5\.00 BELOW/.test(out.bundledRow.note));

  check('THE 67 OTHER UNITS ARE UNTOUCHED: no bundle fires where cable is billed separately',
        out.unbundledBundleRow === null);
  check('...and those units still reconcile cleanly, line for line',
        out.unbundledStatuses.every(r => r.status === 'match' || r.status === 'probable'));

  check('A unit whose gap is NOT the declared one is still a mismatch',
        !!out.offRow && out.offRow.status === 'mismatch');
  check('...and says so in terms of the bundle price, not the raw total',
        !!out.offRow && /even allowing for the \$5\.00 bundle price/.test(out.offRow.note));

  check('Evidence: the rule holds on every unit of that plan',
        out.ev.holds === 3 && out.ev.contradicts === 0 && out.ev.confident === true);
  check('Evidence: one unit with a different gap contradicts it — the rule can be suspended',
        out.evMixedGap.contradicts === 1 && out.evMixedGap.confident === false);

  check('THE $45 CANNOT BE ABSORBED: too large to be a package price',
        out.okBig.ok === false && /too large to be a bundle price/.test(out.okBig.errors.join(' ')));
  check('...while $5 on a $115 line is accepted', out.okSmall.ok === true);
  check('A priced bundle is a different rule from a plain one',
        out.keysDiffer === true);
  check('The description says the price in words someone can approve',
        /billed \$5\.00 LESS than those lines add up to/.test(out.describe));
  check('REGRESSION: an applied bundle is still counted once, not once per label',
        out.plainApplied === true && out.evPlain.holds === 1 && out.evPlain.contradicts === 0);
  check('No page or console errors', errors.length === 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (errors.length) console.log('=== errors ===', errors);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
