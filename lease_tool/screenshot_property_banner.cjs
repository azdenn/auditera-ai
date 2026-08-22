const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + '#property=' + encodeURIComponent('Blanco Oaks Apartments'));
  await page.setInputFiles('#lease-files', [path.resolve(__dirname, 'sample_lease.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});
  await page.waitForTimeout(200);
  const card = await page.$('#results-card');
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve(__dirname, 'debug_units', 'property_mismatch_banner.png') });
  await browser.close();
})();
