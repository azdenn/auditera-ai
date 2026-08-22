const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.goto('file://' + path.resolve('./lease_reconciler.html'));
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

  // expand A101 row
  const rows = await page.$$('#results-body tr.unit-row');
  for (const r of rows) {
    const unitText = await r.$eval('td:nth-child(2)', el => el.textContent.trim());
    if (unitText === 'A101') { await r.click(); break; }
  }
  await page.waitForTimeout(200);
  const detailHtml = await page.$eval('.detail-row .detail-inner', el => el.innerText);
  console.log('A101 detail:\n', detailHtml);

  // test CSV export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-csv-btn'),
  ]);
  const csvPath = path.resolve('./export_test.csv');
  await download.saveAs(csvPath);
  console.log('\nCSV export contents:\n', fs.readFileSync(csvPath, 'utf8'));

  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-xlsx-btn'),
  ]);
  const xlsxPath = path.resolve('./export_test.xlsx');
  await download2.saveAs(xlsxPath);
  console.log('\nXLSX export saved, size:', fs.statSync(xlsxPath).size);

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
