const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

// Regression test for the versioning fix: A101 has two lease files in its
// "Signed Lease Documents" folder. "Blanco Oaks - Standard Lease 1 2 3.pdf"
// LOOKS newest under the old filename-trailing-number heuristic, but its
// Initial Lease Term date is actually the OLDER one (2023) and it's
// unsigned. "Blanco Oaks - Standard Lease.pdf" has no trailing numbers at
// all (would have looked "oldest"/original under the old rule), but its
// Initial Lease Term date is the NEWER one (2025) and it's fully signed.
// A correct content-based picker must select the "boring filename" one.
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  // Unit test the pure helper functions directly first.
  const helperChecks = await page.evaluate(() => ({
    keyA: signedLeaseFolderKey('A101/Signed Lease Documents/Lease 1 2.pdf'),
    keyNone: signedLeaseFolderKey('A101/Other Documents/insurance.pdf'),
  }));
  console.log('=== helper checks (folder-key resolution only -- filename version counting was removed) ===');
  console.log(helperChecks);

  await page.evaluate(() => setUploadMode('zip'));  // mode chips are now hidden; the prompt is the user-facing path (see test_upload_choice.cjs)
  await page.setInputFiles('#zip-file', '/tmp/test_v3.zip');
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => {
    const t = document.getElementById('parse-status').textContent;
    return t.startsWith('Done.') || t.startsWith('Cancelled') || t.indexOf('Error') !== -1;
  }, {timeout: 60000});

  console.log('=== status line (should mention "extra lease version" found, no "skipped" filename-version language) ===');
  console.log(await page.$eval('#parse-status', e => e.textContent));

  console.log('=== Unit rows for A101 / A110 / Z999 / A102 ===');
  const rows = await page.$$eval('#results-body tr.unit-row', trs => trs.map(tr => {
    const tds = tr.querySelectorAll('td');
    return { unit: tds[1].textContent.trim(), badge: tds[3].textContent.trim(), summary: tds[4].textContent.trim() };
  }));
  console.log(rows.filter(r => ['A101','A110','Z999','A102'].includes(r.unit)));

  // Expand A101 -- should show the NEW-content/OLD-filename file was chosen
  // (dup badge expected, since both files were parsed as candidates), and
  // the pick-reason text should explain the content-based choice.
  const allRows = await page.$$('#results-body tr.unit-row');
  for (const r of allRows) {
    const u = await r.$eval('td:nth-child(2)', el => el.textContent.trim());
    if (u === 'A101') { await r.click(); break; }
  }
  await page.waitForTimeout(200);
  const detailText = await page.$eval('.detail-row .detail-inner', el => el.innerText);
  console.log('=== A101 detail (first 5 lines) ===');
  console.log(detailText.split('\n').slice(0,5).join(' | '));
  console.log('=== A101 detail mentions the correct (newer, signed) filename? ===',
    detailText.includes('Blanco Oaks - Standard Lease.pdf') && !detailText.includes('Blanco Oaks - Standard Lease 1 2 3.pdf a used'));
  console.log('=== A101 detail explicitly names the OLD/wrong filename anywhere (informational, e.g. as a rejected candidate) ===',
    detailText.includes('1 2 3'));
  console.log('=== A101 pick reasoning mentions signed vs term/date, not filename ===');
  const pickReasonLine = detailText.split('\n').find(l => /Multiple leases were found/i.test(l));
  console.log(pickReasonLine || '(no multi-lease note shown -- check if pick was unambiguous/non-dup)');

  console.log('=== errors ===', errors);
  await browser.close();
})();
