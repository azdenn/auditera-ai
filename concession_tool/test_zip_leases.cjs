// ZIP upload mode, leases half: the leases ZIP is uploaded as-is, in the
// ResMan shape ("<unit>/Signed Lease Documents/<every lease that unit has
// ever had>"). Five real A105 leases go in; the tool has to (a) file all of
// them under rent roll unit A105 even though each PDF's own "Apartment No."
// field reads "105" with no building letter, (b) ignore documents outside
// the "Signed Lease Documents" folder, and (c) hand the whole group to the
// SAME pickCurrentLease used by individual uploads, so the lease actually in
// effect today wins rather than the newest file or the last one read.
const { chromium } = require('playwright');
const path = require('path');
const { buildLeaseZip, writeZip, read, ledgerWithUnit, A105 } = require('./zip_fixtures.cjs');

const HERE = __dirname;
const LEASE_ZIP = '/tmp/fixture_leases.zip';
const LEDGER_ZIP_A105 = '/tmp/fixture_ledgers_a105.zip';
const LEASE_ZIP_NOPDF = '/tmp/fixture_leases_nopdf.zip';

(async () => {
  buildLeaseZip(LEASE_ZIP);
  // A ledger for A105 so the unit actually appears in the results and the
  // chosen lease's rent is the one used for that unit.
  writeZip(LEDGER_ZIP_A105, {'A105/ledger.xlsx': ledgerWithUnit('Ledger_A110_6wk.xlsx', 'A105')});
  writeZip(LEASE_ZIP_NOPDF, {'notes.txt': new Uint8Array(Buffer.from('nothing here'))});

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(HERE, 'concession_reconciler.html'));
  await page.evaluate(() => localStorage.removeItem('leaseproof_concession_hidden_issue_types'));
  await page.reload();

  await page.evaluate(() => setUploadMode('zip'));  // chips are hidden now; the prompt is the user path (test_concession_zip_ui.cjs)
  await page.setInputFiles('#ledger-zip-file', LEDGER_ZIP_A105);
  await page.setInputFiles('#lease-zip-file', LEASE_ZIP);
  await page.setInputFiles('#rentroll-file', path.resolve(HERE, 'RentRoll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 300000});
  await page.waitForTimeout(300);

  const run = await page.evaluate(() => {
    const groups = {};
    for (const [k, g] of cachedLeaseByUnit.entries()) groups[k] = g.map(x => ({f:x.filename, unit:x.data.unit, rent:x.data.monthlyBaseRent, start:x.data.leaseStart ? x.data.leaseStart.toISOString().slice(0,10) : null, end:x.data.leaseEnd ? x.data.leaseEnd.toISOString().slice(0,10) : null}));
    const g = cachedLeaseByUnit.get('A105') || [];
    const pick = pickCurrentLease(g);
    const entry = unitEntries.find(e => e.unit === 'A105');
    return {
      summary: document.getElementById('zip-summary').textContent,
      groups,
      pickFilename: pick.data ? (g.find(x => x.data === pick.data) || {}).filename : null,
      pickRent: pick.data ? pick.data.monthlyBaseRent : null,
      pickReason: pick.reason,
      entryLeaseFiles: entry ? entry.leaseFilenames : null,
      entryLeaseMissing: entry ? entry.leaseMissing : null,
      entryPickReason: entry ? entry.leasePickReason : null,
      entryRent: entry ? entry.monthlyBaseRent : null,
      failed: (cachedLeaseFailed||[]).map(f => f.filename),
      today: new Date().toISOString().slice(0,10),
    };
  });
  console.log(JSON.stringify(run, null, 1));

  const a105 = run.groups['A105'] || [];
  const inEffect = a105.find(x => x.start <= run.today && x.end >= run.today);

  // --- A leases ZIP with no PDFs in it at all ---
  await page.setInputFiles('#lease-zip-file', LEASE_ZIP_NOPDF);
  await page.click('#process-btn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('parse-status').textContent), {timeout: 120000});
  await page.waitForTimeout(200);
  const noPdf = await page.evaluate(() => ({
    summary: document.getElementById('zip-summary').textContent,
    bad: document.getElementById('zip-summary').classList.contains('bad'),
    leaseCount: cachedLeaseByUnit.size,
    a105Rent: (unitEntries.find(e => e.unit === 'A105')||{}).monthlyBaseRent,
  }));
  console.log('=== leases zip with no PDFs ===', JSON.stringify(noPdf));

  const checks = [
    ['All five leases in the unit\'s "Signed Lease Documents" folder are kept as candidates', a105.length === 5],
    ['Each lease PDF\'s own unit field reads "105", but they are filed under rent roll unit A105 via the ZIP folder name',
      a105.every(x => x.unit === '105') && !run.groups['105']],
    ['A document outside "Signed Lease Documents" is never parsed (A105/Other Documents/insurance.pdf)',
      !a105.some(x => /Other Documents/.test(x.f)) && !run.failed.some(f => /Other Documents/.test(f))],
    ['A lease whose term covers today exists in the fixture (sanity)', !!inEffect],
    ['The lease actually in effect today is the one chosen', run.pickFilename === (inEffect||{}).f],
    ['The chosen lease is the currently-in-effect one, not the newest file on disk (the signed 2026-2027 renewal is not picked)',
      !/2026-2027_signed_renewal/.test(run.pickFilename||'')],
    ['That choice is the one the unit\'s results actually use', run.entryLeaseMissing === false && run.entryRent === run.pickRent],
    ['The unit\'s results list every lease found for it', (run.entryLeaseFiles||[]).length === 5],
    ['The tool explains it chose between several leases', /5 lease files were on file/.test(run.entryPickReason||'') && /currently in effect/.test(run.entryPickReason||'')],
    ['Summary reports the "Signed Lease Documents" folder it read', /"Signed Lease Documents" folder/.test(run.summary) && /5 lease PDFs found/.test(run.summary)],
    ['No lease failed to parse', run.failed.length === 0],
    ['A leases ZIP with no PDFs in it says so, and the run still completes on rent roll amounts',
      noPdf.bad === true && /no PDFs were found/i.test(noPdf.summary) && noPdf.leaseCount === 0 && typeof noPdf.a105Rent === 'number'],
    ['No page errors', errors.length === 0],
  ];

  let allPass = true;
  console.log('=== PASS/FAIL ===');
  for (const [label, pass] of checks){
    console.log((pass?'PASS':'FAIL') + ' -- ' + label);
    if (!pass) allPass = false;
  }
  console.log('=== errors ===', errors);
  if (!allPass || errors.length){ console.error('SOME CHECKS FAILED'); process.exit(1); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
