const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));

  // Top-of-page screenshot: header + how-it-works strip + upload card.
  await page.screenshot({ path: path.resolve(__dirname, 'debug_units', 'polish_top.png') });

  await page.setInputFiles('#lease-files', [path.resolve(__dirname, 'sample_lease.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});

  // Results section: kpis, legend, hint, table with new Details buttons.
  const resultsCard = await page.$('#results-card');
  await resultsCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await resultsCard.screenshot({ path: path.resolve(__dirname, 'debug_units', 'polish_results.png') });

  // Expand the A109 row to show the Details button in its open state + the verify table.
  const allRows = await page.$$('#results-body tr.unit-row');
  for (const r of allRows) {
    const u = await r.$eval('td:nth-child(2)', el => el.textContent.trim());
    if (u === 'A109') { await r.click(); break; }
  }
  await page.waitForTimeout(300);
  await resultsCard.screenshot({ path: path.resolve(__dirname, 'debug_units', 'polish_expanded.png') });

  console.log('done');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
