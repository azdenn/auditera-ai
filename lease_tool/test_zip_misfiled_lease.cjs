/* A lease that is in the archive but not in the folder it belongs in.
   ------------------------------------------------------------------
   Reported from a real ResMan export: a unit's lease was sitting in the ZIP
   the whole time, just not inside that unit's "Signed Lease Documents"
   folder. The tool only ever looked in that folder, so the unit came back as
   "no lease uploaded" and the audit reported a missing lease the customer
   could see with their own eyes.

   The fix searches the rest of a unit's documents -- but ONLY for units whose
   signed-lease folder produced nothing. That restriction is the whole design:
   a unit with a lease already filed correctly must not start pulling in
   whatever else is lying around it, because documents get moved OUT of that
   folder deliberately when they are superseded, and auditing against a
   replaced lease is worse than reporting a missing one.

   The fixture (sample_zip_misfiled.zip):
     A101/Signed Lease Documents/Blanco Oaks - Standard Lease.pdf  <- correct
     A101/Other Documents/Some Other Lease.pdf                     <- DECOY
     A110/Other Documents/Blanco Oaks - Standard Lease.pdf         <- misfiled

   A101 is answered by its own folder, so the decoy beside it must never be
   opened. A110 has no signed-lease folder at all, so the fallback should find
   its lease and reconcile the unit normally.
*/
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  // ---- the pure helpers first -------------------------------------------
  const helpers = await page.evaluate(() => ({
    dirAt0:      unitDirPathAtDepth('A110/Other Documents/lease.pdf', 0),
    dirAt1:      unitDirPathAtDepth('Property/A110/Other/lease.pdf', 1),
    dirRootFile: unitDirPathAtDepth('loose.pdf', 0),
    nameAt0:     unitFolderNameAtDepth('A110/Other Documents/lease.pdf', 0),
    nameRoot:    unitFolderNameAtDepth('loose.pdf', 0),
    looksLease:  looksLikeLeaseFilename('A110/x/Blanco Oaks - Standard Lease.pdf'),
    looksNot:    looksLikeLeaseFilename('A110/x/drivers licence scan.pdf'),
  }));
  check('A unit folder is read at the depth the archive actually uses', helpers.dirAt0 === 'A110');
  check('...including archives with a wrapper folder around everything', helpers.dirAt1 === 'Property/A110');
  check('A PDF loose at the archive root belongs to no unit and is not guessed at',
    helpers.dirRootFile === null && helpers.nameRoot === null);
  check('The unit folder name is read back for matching to the rent roll', helpers.nameAt0 === 'A110');
  check('Lease-sounding filenames are recognised so they are opened first', helpers.looksLease === true);
  check('...and unrelated documents are not', helpers.looksNot === false);

  // ---- end to end --------------------------------------------------------
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#zip-file', path.resolve(__dirname, 'sample_zip_misfiled.zip'));
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => {
    const t = document.getElementById('parse-status').textContent;
    return t.startsWith('Done.') || t.startsWith('Cancelled') || t.indexOf('Error') !== -1;
  }, {timeout: 90000});
  await page.waitForTimeout(400);

  const status = await page.$eval('#parse-status', e => e.textContent);
  const state = await page.evaluate(() => {
    const byUnit = {};
    for (const e of unitEntries){
      byUnit[e.unit] = {
        category: e.category,
        filenames: (e.filenames || []).slice(),
        isDuplicate: !!e.isDuplicate,
      };
    }
    return { byUnit, units: unitEntries.map(e => e.unit), errorEntries: unitEntries.filter(e => e.category === 'error').length };
  });

  const a101 = state.byUnit['A101'] || null;
  const a110 = state.byUnit['A110'] || null;

  check('THE BUG: the misfiled lease is found, so A110 is no longer "missing"',
    !!a110 && a110.category !== 'missing');
  check('...and it is the file that was actually sitting outside the folder',
    !!a110 && a110.filenames.some(f => /A110\/Other Documents\//.test(f)));
  check('...matched to the right unit from its folder name, not the PDF text',
    !!a110 && a110.filenames.length === 1);

  check('A101 is still answered by its own Signed Lease Documents folder',
    !!a101 && a101.filenames.some(f => /A101\/Signed Lease Documents\//.test(f)));
  check('THE RESTRICTION: the decoy beside A101 was never opened',
    !!a101 && !a101.filenames.some(f => /Other Documents/.test(f)));
  check('...so A101 is not reported as having several possible leases',
    !!a101 && a101.isDuplicate === false);

  check('The status line says leases were found outside their folders',
    /found elsewhere in the archive/i.test(status));
  check('...and does not report them as failures', !/Error/i.test(status));
  check('Nothing was surfaced as an unreadable file', state.errorEntries === 0);
  check('No page errors', errors.length === 0);

  console.log('\n=== status ===\n' + status);
  console.log('\n=== units ===', JSON.stringify(state.byUnit, null, 1));
  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  if (errors.length) console.log('ERRORS:', errors);
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
