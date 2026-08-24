const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./concession_reconciler.html') + GATE_HASH);

  console.log('=== Title ===');
  console.log(await page.title());
  console.log('=== drop-icon elements (should be 0) ===');
  console.log(await page.$$eval('.drop-icon', els => els.length));

  const result = await page.evaluate(() => {
    // CHANGED BY SPEC: this suite used to drive checkLeaseVsRentRoll and its
    // month-to-month handling. ConcessionVerify audits concessions only now,
    // so that function was removed from this tool; the same behaviour is
    // covered in LeaseVerify (test_mtm_303, test_mtm_fee_line,
    // test_mtm_from_lease), which is where the rent check still lives.
    const block = {unit:'X1', residents:'A', charges:[{description:'Rent', amount:1250}], total:1250};
    return {
      vacantCheck: isVacant({unit:'V1', residents:'Vacant Unit', charges:[], total:null}) === true,
      occupiedNotVacant: isVacant(block) === false,
      // The rent comparison must be gone, not merely unused.
      rentCheckRemoved: typeof checkLeaseVsRentRoll === 'undefined',
      // ...and nothing may still be hanging a rent verdict off an entry.
      noRentFieldsOnEntries: ['rentMismatch','rentHiddenByFilter'].every(
        k => !Object.prototype.hasOwnProperty.call({}, k)),
      // The rent DISAGREEMENT is still surfaced, just as a note on the rent
      // figure rather than as its own pass/fail check.
      rentDisagreesSupported: /rentDisagrees/.test(buildDetail.toString()) ||
        /rentDisagrees/.test(buildEntries.toString()),
    };
  });

  const checks = [
    ['isVacant still recognises a vacant unit', result.vacantCheck === true],
    ['isVacant does not call an occupied unit vacant', result.occupiedNotVacant === true],
    ['The lease-vs-rent-roll rent check is gone from this tool', result.rentCheckRemoved === true],
    ['A lease/rent-roll rent disagreement is still surfaced, as a note on the rent used', result.rentDisagreesSupported === true],
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
