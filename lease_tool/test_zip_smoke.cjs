const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'lease_reconciler.html'));
  await page.waitForTimeout(300);

  console.log('=== Title ===');
  console.log(await page.title());

  console.log('=== fflate global present ===');
  console.log(await page.evaluate(() => typeof window.fflate, ));
  console.log(await page.evaluate(() => typeof window.fflate?.Unzip));

  console.log('=== Mode toggle present ===');
  console.log(await page.$$eval('#upload-choice-modal .choice-opt', els => els.map(e => e.textContent.replace(/\s+/g,' ').trim())));

  console.log('=== Switch to ZIP mode ===');
  await page.evaluate(() => setUploadMode('zip'));
  await page.waitForTimeout(200);
  console.log('drop-lease hidden:', await page.$eval('#drop-lease', e => e.classList.contains('hidden')));
  console.log('drop-zip hidden:', await page.$eval('#drop-zip', e => e.classList.contains('hidden')));

  console.log('=== Switch back to individual ===');
  await page.evaluate(() => setUploadMode('individual'));
  await page.waitForTimeout(200);
  console.log('drop-lease hidden:', await page.$eval('#drop-lease', e => e.classList.contains('hidden')));
  console.log('drop-zip hidden:', await page.$eval('#drop-zip', e => e.classList.contains('hidden')));

  console.log('=== Console/page errors on load ===');
  console.log(errors);

  await browser.close();
})();
