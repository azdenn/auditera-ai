const { chromium } = require('playwright');
const path = require('path');
const { installGateStub, GATE_HASH } = require('../shared/test_gate_stub.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('console', msg => { if (msg.type()==='error') console.log('CONSOLE ERR:', msg.text()); });

  await installGateStub(page);
  await page.goto('file://' + path.resolve('./lease_reconciler.html') + GATE_HASH);

  const files = [
    path.resolve('./sample_lease.pdf'),        // A109
    path.resolve('./sample_lease.pdf'),        // A109 again (duplicate, same path ok for input multiple? need distinct File objects - browser allows same path twice via setInputFiles array)
    path.resolve('./synthetic_A101.pdf'),
    path.resolve('./synthetic_A110.pdf'),
    path.resolve('./synthetic_Z999.pdf'),
  ];
  await page.setInputFiles('#lease-files', files);
  await page.setInputFiles('#rentroll-file', path.resolve('./sample_rentroll.xlsx'));

  await page.click('#process-btn');
  await page.waitForSelector('#results-card:not(.hidden)', {timeout: 60000});
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});

  const kpi = await page.$$eval('.kpi-tile', els => els.map(e => e.textContent.trim()));
  console.log('KPI tiles:', kpi);
  const kpiSub = await page.textContent('#kpi-sub');
  console.log('KPI sub:', kpiSub);

  const tabs = await page.$$eval('.tab', els => els.map(e => e.textContent.trim()));
  console.log('Tabs:', tabs);

  // list all unit rows with category badges
  const allRows = await page.$$eval('#results-body tr.unit-row', trs => trs.map(tr => {
    const tds = tr.querySelectorAll('td');
    return { unit: tds[1].textContent.trim(), status: tds[3].textContent.trim(), summary: tds[4].textContent.trim() };
  }));
  console.log('Total rows in "All" view:', allRows.length);
  console.log('First 10 rows:', JSON.stringify(allRows.slice(0,10), null, 2));

  // find A109 row (should be duplicate + clean or mismatch), A101 (mismatch), A110 (mismatch/resmanonly), Z999 (unmatched)
  for (const u of ['A109','A101','A110','Z999','A103']) {
    const row = allRows.find(r => r.unit === u);
    console.log(u, '=>', row);
  }

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
