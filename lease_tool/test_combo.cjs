const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message, '\n', err.stack));
  await page.goto('file://' + path.resolve('./iso_combo.html'));
  await page.waitForTimeout(800);
  await browser.close();
})();
