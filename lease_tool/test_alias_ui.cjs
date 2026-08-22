const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  // process A101 synthetic (has an unmapped "Yard Premium" resman charge) alongside rent roll
  await page.setInputFiles('#lease-files', [path.resolve('./synthetic_A101.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout:30000});

  let entry = await page.evaluate(() => unitEntries.find(e=>e.unit==='A101'));
  console.log('BEFORE custom alias -- Yard Premium row:', JSON.stringify(entry.rows.find(r=>r.label.includes('Yard') || (r.resmanRaw||[]).includes('Yard Premium'))));
  console.log('issueCount before:', entry.issueCount);

  // open alias panel, add "Yard Premium" -> PARKING (arbitrary reclassification) to prove live-reconcile works
  await page.click('#alias-panel summary');
  await page.fill('#alias-new-phrase', 'Yard Premium');
  await page.selectOption('#alias-new-category', 'PARKING');
  await page.click('#alias-add-btn');
  await page.waitForTimeout(150);

  entry = await page.evaluate(() => unitEntries.find(e=>e.unit==='A101'));
  const parkingRow = entry.rows.find(r=>r.category==='PARKING');
  console.log('\nAFTER adding alias -- PARKING row:', JSON.stringify(parkingRow));
  console.log('issueCount after:', entry.issueCount);

  // remove the alias via chip "x" and confirm it reverts
  await page.evaluate(() => {
    ALIAS_MAP['PARKING'] = ALIAS_MAP['PARKING'].filter(a => a !== 'Yard Premium');
  });
  await page.evaluate(() => { renderAliasPanel(); reconcileAll(); });
  await page.waitForTimeout(150);
  entry = await page.evaluate(() => unitEntries.find(e=>e.unit==='A101'));
  console.log('\nissueCount after removing alias again:', entry.issueCount);

  // export mapping JSON download check
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#alias-export-btn'),
  ]);
  const p = path.resolve('./alias_export_test.json');
  await download.saveAs(p);
  console.log('\nExported alias JSON:', require('fs').readFileSync(p,'utf8').slice(0,300));

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
