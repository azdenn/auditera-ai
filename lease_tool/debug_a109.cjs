const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));
  await page.setInputFiles('#lease-files', [path.resolve('./sample_lease.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 30000});
  const entry = await page.evaluate(() => unitEntries.find(e => e.unit === 'A109'));
  console.log(JSON.stringify(entry, null, 2));
  await browser.close();
})();
