const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await page.goto('file://' + path.resolve('./lease_reconciler.html'));
  await page.setInputFiles('#lease-file', path.resolve('./sample_lease.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));
  await page.click('#parse-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent.includes('Done'), {timeout: 20000});

  // Simulate a discrepancy: change pest control to 12 (should have been 8) and clear trash (simulate lease says 0 but resman still bills 17)
  await page.fill('#c-pest', '12');
  await page.fill('#c-trash', '0');

  await page.click('#compare-btn');
  await page.waitForSelector('#results-card:not(.hidden)');

  const rows = await page.$$eval('#results-body tr', trs => trs.map(tr => {
    const tds = tr.querySelectorAll('td');
    return { label: tds[0].textContent.trim().split('\n')[0], lease: tds[1].textContent.trim(), resman: tds[2].textContent.trim(), status: tds[3].textContent.trim() };
  }));
  console.log('Mismatch test rows:', JSON.stringify(rows, null, 2));

  // Test unknown unit
  await page.fill('#unit-input', 'Z999');
  await page.click('#compare-btn');
  await page.waitForTimeout(300);
  const err = await page.textContent('#compare-status');
  console.log('Unknown unit status:', err);

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
