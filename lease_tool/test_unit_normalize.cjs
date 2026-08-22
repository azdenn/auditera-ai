const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('console', msg => { if (msg.type()==='error') console.log('CONSOLE ERR:', msg.text()); });

  await page.goto('file://' + path.resolve('./lease_reconciler.html'));

  await page.setInputFiles('#lease-files', [path.resolve('./synthetic_301_bare.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});

  const allRows = await page.$$eval('#results-body tr.unit-row', trs => trs.map(tr => {
    const tds = tr.querySelectorAll('td');
    return { unit: tds[1].textContent.trim(), status: tds[3].textContent.trim(), summary: tds[4].textContent.trim() };
  }));
  console.log('Total rows:', allRows.length);
  const a301 = allRows.find(r => r.unit === 'A301' || r.unit === '301');
  console.log('Row for unit "301"/"A301":', a301);
  // A301 should NOT also separately appear as "Missing lease" -- it should
  // be a single merged row now.
  console.log('Any stray A301 duplicate row?', allRows.filter(r => r.unit === 'A301' || r.unit === '301'));

  // Expand it and check the pick-reason / unit-number-mismatch note is shown.
  const allTrs = await page.$$('#results-body tr.unit-row');
  for (const r of allTrs) {
    const u = await r.$eval('td:nth-child(2)', el => el.textContent.trim());
    if (u === '301' || u === 'A301') { await r.click(); break; }
  }
  await page.waitForTimeout(200);
  const detail = await page.$eval('.detail-row .detail-inner', el => el.innerText);
  console.log('=== Detail (should mention matched-by-unit-number note + Unit Number Mismatch check) ===');
  console.log(detail);

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
