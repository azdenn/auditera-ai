/* The three remaining edge cases, plus invoice-format tolerance.

   The real Blanco Oaks rent roll has full coverage on every occupied unit, so
   fixtures/BOA_rentroll_edge.xlsx is that same export with exactly two cells
   zeroed (see gen_fixtures.cjs):
     • 105 — its $1,000 security deposit removed. No LeaseLock charge and no
             bond either, so nobody is covering that deposit -> must be flagged.
     • 205 — its $1,178 surety bond removed, and added to the invoice instead,
             so LeaseLock bills us while the resident is never charged -> must
             be flagged as direct lost revenue.
   The invoice also carries unit 999, which isn't in the rent roll at all.

   The invoice for this run is .xlsx (not .csv), uses completely different
   column headers ("Apt #", "Premium Billed", "Policy Effective Date"), ISO
   dates, and writes some units as "Unit 203" / "#208" -- all of which must
   still line up with the rent roll.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'deposit_reconciler.html') + GATE_HASH);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();

  await page.setInputFiles('#invoice-file', path.resolve(__dirname, 'fixtures/leaselock_invoice_edge.xlsx'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'fixtures/BOA_rentroll_edge.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:60000});

  const d = await page.evaluate(() => {
    const byUnit = {};
    for (const e of unitEntries) byUnit[e.unit] = {
      coverage: e.coverageLabel, charged: e.charged, invoiced: e.invoiced,
      flags: e.findings.filter(f=>f.severity==='flag' && !f.hiddenByFilter).map(f=>f.key),
      notes: e.findings.map(f=>f.note), invoiceOnly: !!e.invoiceOnly,
    };
    return {
      byUnit,
      invoiceLines: invoiceData.lines.length,
      invoiceHasDates: invoiceData.hasDateColumns,
      invoiceHasResident: invoiceData.hasResidentColumn,
      // the loosely-formatted invoice unit labels must normalise onto the rent roll
      normalisedKeys: invoiceData.lines.map(l => l.unitRaw + '=>' + l.unitKey),
      coverageDays: invoiceData.lines[0].coverageDays,
      discrepancyUnits: unitEntries.filter(e=>e.category==='discrepancy').map(e=>e.unit).sort(),
      onSurety: unitEntries.filter(e=>e.cov.onSurety).length,
      onDeposit: unitEntries.filter(e=>e.cov.onDeposit).length,
      noCoverageCount: unitEntries.filter(e=>e.findings.some(f=>f.key==='noCoverage')).length,
      entries: unitEntries.length,
    };
  });

  console.log('invoice lines:', d.invoiceLines, '| dates:', d.invoiceHasDates, '| resident col:', d.invoiceHasResident, '| first period days:', d.coverageDays);
  console.log('normalised unit keys:', JSON.stringify(d.normalisedKeys));
  console.log('discrepancy units:', JSON.stringify(d.discrepancyUnits));
  console.log('105:', JSON.stringify(d.byUnit['105']));
  console.log('205:', JSON.stringify(d.byUnit['205']));
  console.log('999:', JSON.stringify(d.byUnit['999']));
  console.log('203:', JSON.stringify(d.byUnit['203']));

  const checks = [
    ['.xlsx invoice with unfamiliar headers ("Apt #", "Premium Billed") parses', d.invoiceLines === 13],
    ['"Policy Effective/Expiration Date" are recognised as the coverage period', d.invoiceHasDates === true && d.coverageDays === 30],
    ['"Resident Name" is recognised as the resident column', d.invoiceHasResident === true],
    ['"Unit 203" and "#208" normalise onto rent roll units 203 and 208',
      d.normalisedKeys.includes('Unit 203=>203') && d.normalisedKeys.includes('#208=>208') &&
      d.byUnit['203'].invoiced === 31 && d.byUnit['208'].invoiced === 31],
    ['Those loosely-formatted units reconcile clean rather than looking un-invoiced',
      d.byUnit['203'].flags.length === 0 && d.byUnit['208'].flags.length === 0],

    ['MISSING ALL THREE: unit 105 (no LeaseLock, no bond, no deposit) IS flagged',
      d.byUnit['105'] && d.byUnit['105'].flags.length === 1 && d.byUnit['105'].flags[0] === 'noCoverage'],
    ['Its coverage reads "None"', d.byUnit['105'].coverage === 'None'],
    ['Its note says nobody is covering the deposit', /Nobody is covering/.test(d.byUnit['105'].notes.join(' '))],
    ['Exactly one unit on this fixture has no coverage at all', d.noCoverageCount === 1],
    ['Zeroing 105\'s deposit drops the deposit count from 9 to 8', d.onDeposit === 8],
    ['Zeroing 205\'s bond drops the surety count from 7 to 6', d.onSurety === 6],

    ['ON THE INVOICE BUT NOT CHARGED: unit 205 IS flagged',
      d.byUnit['205'] && d.byUnit['205'].flags.length === 1 && d.byUnit['205'].flags[0] === 'llNotCharged'],
    ['Its note calls out the money coming out of the property\'s pocket',
      /out of the property/.test(d.byUnit['205'].notes.join(' '))],
    ['It shows an invoice amount and no rent-roll charge',
      d.byUnit['205'].invoiced === 31 && d.byUnit['205'].charged === null],

    ['An invoice line for a unit that is not in the rent roll at all (999) still surfaces',
      d.byUnit['999'] && d.byUnit['999'].flags.length === 1 && d.byUnit['999'].flags[0] === 'llNotCharged' && d.byUnit['999'].invoiceOnly === true],
    ['It says the unit does not appear in the rent roll', /does not appear in the Rent Roll/.test(d.byUnit['999'].notes.join(' '))],

    ['Exactly three units are flagged on this fixture (105, 205, 999)',
      JSON.stringify(d.discrepancyUnits) === JSON.stringify(['105','205','999'])],
    ['The invoice-only unit is added as its own row rather than being dropped', d.entries === 26],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL')+' -- '+l); if(!p) allPass=false; }
  console.log('=== errors ===', errors);
  await browser.close();
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
