const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  await page.goto('file://' + path.resolve(__dirname, 'homepage_final.html'));
  await page.waitForTimeout(300);

  // Hero with new CTA
  await page.screenshot({ path: '/tmp/signin_hero.png' });

  // Sign-in section, logged out (default: login card)
  await page.click('nav.top .links a[href="#signin"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/signin_login.png' });

  // Sign-up card
  await page.click('#show-signup');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/signin_signup.png' });

  // Fill and submit signup -> signed-in panel
  await page.fill('#signup-email', 'azdenkumar@gmail.com');
  await page.fill('#signup-password', 'demopass123');
  await page.fill('#signup-property', 'Blanco Oaks Apartments');
  await page.click('#signup-form button[type=submit]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/signin_signedin.png' });

  await browser.close();
})();
