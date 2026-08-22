const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  const fileUrl = 'file://' + path.resolve('./lease_reconciler.html');
  await page.goto(fileUrl);

  await page.setInputFiles('#lease-file', path.resolve('./sample_lease.pdf'));
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));

  await page.click('#parse-btn');
  await page.waitForFunction(() => {
    const el = document.getElementById('parse-status');
    return el && el.textContent && el.textContent.length > 0 && !el.textContent.includes('Reading');
  }, {timeout: 20000});

  const parseStatus = await page.textContent('#parse-status');
  console.log('PARSE STATUS:', parseStatus);

  const unitVal = await page.inputValue('#unit-input');
  const rentVal = await page.inputValue('#rent-input');
  console.log('Unit:', unitVal, 'Rent:', rentVal);

  await page.click('#compare-btn');
  await page.waitForSelector('#results-card:not(.hidden)', {timeout: 10000});

  const residentInfo = await page.textContent('#resident-info');
  console.log('Resident info:', residentInfo);

  const rows = await page.$$eval('#results-body tr', trs => trs.map(tr => {
    const tds = tr.querySelectorAll('td');
    return {
      label: tds[0].textContent.trim(),
      lease: tds[1].textContent.trim(),
      resman: tds[2].textContent.trim(),
      status: tds[3].textContent.trim()
    };
  }));
  console.log('RESULTS ROWS:', JSON.stringify(rows, null, 2));

  const summary = await page.textContent('#summary-bar');
  console.log('SUMMARY:', summary);

  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
