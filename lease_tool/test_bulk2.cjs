const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);
  const files = [
    path.resolve('./sample_lease.pdf'),
    path.resolve('./synthetic_A101.pdf'),
    path.resolve('./synthetic_A110.pdf'),
    path.resolve('./synthetic_Z999.pdf'),
  ];
  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});

  // click filter "Missing / Unmatched" then find error rows and expand them
  const entries = await page.evaluate(() => unitEntries.filter(e=>e.category==='error'));
  console.log('Error entries:', JSON.stringify(entries, null, 2));

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
