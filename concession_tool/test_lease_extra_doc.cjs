/* Reported on unit 405: ResMan had dropped a second document into the unit's
   "Signed Lease Documents" folder alongside the real signed lease, and the
   tool reported the unit as having no lease and no documents. The lease was
   right there.

   The failure was one of attribution, not of parsing: a PDF in a unit's folder
   that could not be read as a lease was reported as a floating "couldn't read
   this file" row divorced from any unit, so nothing on the unit itself ever
   mentioned that documents had been found. This pins the fixed behaviour:
     - the real lease in the folder is still found and used
     - the unreadable sibling is named ON THE UNIT, with its filename
     - the unit never claims there were no documents
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
  await page.goto('file://' + path.resolve(__dirname, 'concession_reconciler.html') + GATE_HASH);
  await page.evaluate(() => setUploadMode('zip'));
  await page.setInputFiles('#ledger-zip-file', path.resolve(__dirname, 'real/BOA Resident Ledgers 08-14-2026.zip'));
  await page.setInputFiles('#lease-zip-file', '/tmp/leases_405.zip');
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'real/BOA 2026.14- Rent Roll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done/.test(document.getElementById('parse-status').textContent), {timeout: 300000});
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const e = unitEntries.find(x => String(x.unit) === '405');
    if (!e) return null;
    expandedUnits.add(e.unitKey); renderTable();
    const row = Array.from(document.querySelectorAll('tr.detail-row')).map(t => t.innerText).join('\n');
    return {
      leaseFilenames: e.leaseFilenames || [],
      unreadable: (e.unreadableLeases || []).map(f => f.filename),
      leaseMissing: !!e.leaseMissing,
      rentSource: e.concession && e.concession.details ? e.concession.details.rentSource : null,
      termSource: e.concession && e.concession.details ? e.concession.details.termSource : null,
      detailText: row,
      // A file inside a unit folder must not also appear as a floating error row.
      floatingErrors: unitEntries.filter(x => x.category === 'error').map(x => String(x.unit)),
    };
  });

  const checks = [
    ['Unit 405 is still reconciled at all', !!r],
    ['The real signed lease in the folder was found', !!r && r.leaseFilenames.some(f => /405 signed lease\.pdf/.test(f))],
    ['The unit is NOT reported as having no lease', !!r && r.leaseMissing === false],
    ['The unreadable sibling is attributed to the unit, by name', !!r && r.unreadable.some(f => /insurance cert\.pdf/.test(f))],
    ['The detail names the file it could not read', !!r && /insurance cert\.pdf/.test(r.detailText)],
    ['The detail says the lease it did read is the one used', !!r && /read fine and is the one used/i.test(r.detailText)],
    ['The unit never claims there were no documents', !!r && !/no documents/i.test(r.detailText)],
    ['The bad sibling is not ALSO reported as a floating unattributed error',
      !!r && !r.floatingErrors.some(u => /insurance cert/i.test(u))],
    ['With a lease present, the lease is the source of truth for the rent', !!r && r.rentSource === 'lease'],
    ['...and for the lease term', !!r && r.termSource === 'the lease'],
    ['No page errors', errors.length === 0],
  ];
  let ok = true;
  console.log('=== PASS/FAIL ===');
  for (const [l,p] of checks){ console.log((p?'PASS':'FAIL') + ' -- ' + l); if(!p) ok=false; }
  console.log('unreadable:', r && r.unreadable, '| leases:', r && r.leaseFilenames);
  console.log('=== errors ===', errors);
  if (!ok || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
