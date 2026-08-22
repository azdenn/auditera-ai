const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await page.goto('file://' + path.resolve(__dirname, 'homepage_final.html'));
  await page.waitForTimeout(300);

  const loginCard = await page.$('#login-card');
  await loginCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await loginCard.screenshot({ path: '/tmp/card_login.png' });

  await page.click('#show-signup');
  await page.waitForTimeout(200);
  const signupCard = await page.$('#signup-card');
  await signupCard.screenshot({ path: '/tmp/card_signup.png' });

  await page.fill('#signup-email', 'azdenkumar@gmail.com');
  await page.fill('#signup-password', 'demopass123');
  await page.fill('#signup-property', 'Blanco Oaks Apartments');
  await page.click('#signup-form button[type=submit]');
  await page.waitForTimeout(300);
  const panel = await page.$('#signedin-panel');
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await panel.screenshot({ path: '/tmp/card_signedin.png' });

  await browser.close();
})();
