const { chromium } = require('playwright');
const path = require('path');

async function run(hashSuffix, label){
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html') + hashSuffix);

  await page.setInputFiles('#lease-files', [path.resolve(__dirname, 'sample_lease.pdf')]);
  await page.setInputFiles('#rentroll-file', path.resolve(__dirname, 'sample_rentroll.xlsx'));
  await page.click('#process-btn');
  await page.waitForFunction(() => document.getElementById('parse-status').textContent === 'Done.', {timeout: 60000});
  await page.waitForTimeout(200);

  const banner = await page.$eval('#property-match-banner', el => ({ hidden: el.classList.contains('hidden'), cls: el.className, text: el.textContent.trim() }));
  console.log(`=== ${label} (hash=${hashSuffix || '(none)'}) ===`);
  console.log(JSON.stringify(banner, null, 2));
  console.log('errors:', errors);
  await browser.close();
}

(async () => {
  await run('', 'No expected property (not launched from homepage)');
  await run('#property=' + encodeURIComponent('Garden Creek Apartments'), 'Matching property');
  await run('#property=' + encodeURIComponent('Blanco Oaks Apartments'), 'Mismatched property');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
