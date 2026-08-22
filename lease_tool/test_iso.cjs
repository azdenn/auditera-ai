const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const f of ['iso_xlsx.html','iso_pdf.html']) {
    const page = await browser.newPage();
    page.on('console', msg => console.log(f, 'CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log(f, 'PAGEERROR:', err.message));
    await page.goto('file://' + path.resolve('./'+f));
    await page.waitForTimeout(500);
    await page.close();
  }
  await browser.close();
})();
