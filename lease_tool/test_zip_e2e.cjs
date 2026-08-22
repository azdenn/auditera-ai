const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  // Switch to ZIP mode
  await page.evaluate(() => setUploadMode('zip'));  // mode chips are now hidden; the prompt is the user-facing path (see test_upload_choice.cjs)
  await page.setInputFiles('#zip-file', '/tmp/test_resman_export.zip');
  await page.waitForTimeout(150);
  console.log('=== zip filename label ===');
  console.log(await page.$eval('#zip-filename', e => e.textContent));

  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.waitForTimeout(150);

  console.log('=== process button enabled? ===', await page.$eval('#process-btn', e => !e.disabled));

  await page.click('#process-btn');
  await page.waitForFunction(() => {
    const t = document.getElementById('parse-status').textContent;
    return t.startsWith('Done.') || t.startsWith('Cancelled.') || t.indexOf('Error') !== -1;
  }, {timeout: 120000});

  console.log('=== status line ===');
  console.log(await page.$eval('#parse-status', e => e.textContent));

  console.log('=== KPI row ===');
  console.log(await page.$eval('#kpi-row', e => e.innerText.replace(/\n+/g,' | ')));

  console.log('=== KPI sub ===');
  console.log(await page.$eval('#kpi-sub', e => e.innerText));

  console.log('=== Unit rows (unit, badge, summary) ===');
  const rows = await page.$$eval('#results-body tr.unit-row', trs => trs.map(tr => {
    const tds = tr.querySelectorAll('td');
    return {
      unit: tds[1] ? tds[1].textContent.trim() : '',
      badge: tds[3] ? tds[3].textContent.trim() : '',
      summary: tds[4] ? tds[4].textContent.trim() : '',
    };
  }));
  console.log(JSON.stringify(rows, null, 2));

  // Expand the A101 row (should be a duplicate -- confirm it reconciled, not needs-review,
  // since both A101 candidates are byte-identical copies of the same lease).
  const allRows = await page.$$('#results-body tr.unit-row');
  for (const r of allRows) {
    const unitText = await r.$eval('td:nth-child(2)', el => el.textContent.trim());
    if (unitText === 'A101') { await r.click(); break; }
  }
  await page.waitForTimeout(200);
  console.log('=== A101 detail (should mention duplicate-copy reasoning) ===');
  console.log(await page.$eval('.detail-row .detail-inner', el => el.innerText));

  console.log('=== Console/page errors ===');
  console.log(errors);

  await browser.close();
})();
