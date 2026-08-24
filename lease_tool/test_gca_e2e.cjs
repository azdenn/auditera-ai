// Full end-to-end regression: the real A309, C101, and C301 lease PDFs
// uploaded together alongside the real GCA rent roll, exactly like the
// user's actual bulk-upload workflow -- not just the parser in isolation
// (see test_gca_signatures.cjs for that). Confirms the fixes for "the
// signatures are saying that they didnt sign them when they did" actually
// reach the final results table: the Signatures check must come back
// 'pass', not 'fail', for all three units.
const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  // A309_v1.pdf is the exact file the user actually had in their ResMan
  // export (renamed from "Garden Creek Standard.pdf") -- using it here,
  // not the alternate v2 copy, so this test matches their real workflow.
  const leaseFiles = ['A309_v1.pdf', 'C101.pdf', 'C301.pdf'].map(f => path.resolve('./gca_test/' + f));
  await page.setInputFiles('#lease-files', leaseFiles);
  await page.setInputFiles('#rentroll-file', path.resolve('./gca_test/GCA_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 90000});
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const pick = unit => {
      const e = unitEntries.find(x => x.unit === unit);
      if (!e) return null;
      return {
        category: e.category,
        signatures: e.verify ? e.verify.checks.find(c => c.key === 'signatures') : null,
      };
    };
    return { A309: pick('A309'), C101: pick('C101'), C301: pick('C301'), allUnits: unitEntries.map(e => e.unit) };
  });

  console.log(JSON.stringify(result, null, 2));

  const checks = [
    ['A309 found in the results', !!result.A309],
    ['A309 Signatures check: pass (not flagged as unsigned)', result.A309 && result.A309.signatures && result.A309.signatures.status === 'pass'],
    ['C101 found in the results', !!result.C101],
    ['C101 Signatures check: pass (not flagged as unsigned)', result.C101 && result.C101.signatures && result.C101.signatures.status === 'pass'],
    ['C301 found in the results', !!result.C301],
    ['C301 Signatures check: pass (not flagged as unsigned)', result.C301 && result.C301.signatures && result.C301.signatures.status === 'pass'],
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
