const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  await page.setInputFiles('#lease-files', [path.resolve(__dirname, 'sample_lease.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});

  // Expand the A109 row.
  const allRows = await page.$$('#results-body tr.unit-row');
  for (const r of allRows) {
    const u = await r.$eval('td:nth-child(2)', el => el.textContent.trim());
    if (u === 'A109') { await r.click(); break; }
  }
  await page.waitForTimeout(300);

  const verifyCard = await page.$('.verify-card');
  if (verifyCard) {
    await verifyCard.screenshot({ path: path.resolve(__dirname, 'debug_units', 'verify_table_screenshot.png') });
  } else {
    console.log('verify-card not found');
  }
  console.log('done');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
