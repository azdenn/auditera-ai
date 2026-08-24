const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await installGateStub(page);
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + GATE_HASH);

  const leaseFiles = [
    path.resolve(__dirname, 'sample_lease.pdf'), // A109 real
    ...['A108','A113','A214','A309','B304','B305','C302'].map(u => path.resolve(__dirname, 'synthetic_leases', u + '.pdf')),
  ];
  await page.setInputFiles('#lease-files', leaseFiles);
  await page.setInputFiles('#rentroll-file', [path.resolve(__dirname, 'sample_rentroll.xlsx')]);
  await page.click('#process-btn');
  await page.waitForSelector('#results-card:not(.hidden)', { timeout: 60000 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const targets = ['A109','A108','A113','A214','A309','B304','B305','C302'];
    return targets.map(u => {
      const e = unitEntries.find(x => x.unit === u);
      if (!e) return { unit: u, error: 'NOT FOUND IN unitEntries' };
      if (!e.verify) return { unit: u, category: e.category, note: e.note, error: 'NO verify OBJECT' };
      return {
        unit: u, category: e.category,
        passCount: e.verify.passCount, failCount: e.verify.failCount, unableCount: e.verify.unableCount,
        checks: e.verify.checks.map(c => ({
          key: c.key, status: c.status,
          leaseValue: c.leaseValue, rentRollValue: c.rentRollValue,
          note: c.note, months: c.months, clean: c.clean,
          missingSigners: c.key==='signatures' && c.missing ? c.missing.map(f=>f.signer+' (p'+f.page+')') : undefined,
        })),
      };
    });
  });

  console.log(JSON.stringify(result, null, 2));
  console.log('---console errors---');
  errors.forEach(e => console.log(e));

  await browser.close();
})();
