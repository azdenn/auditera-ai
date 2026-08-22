const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('file://' + path.resolve(__dirname, 'homepage_final.html'));
  await page.waitForTimeout(300);

  console.log('=== Title ===');
  console.log(await page.title());

  console.log('=== Nav links present ===');
  const navLinks = await page.$$eval('nav.top .links a', els => els.map(e => e.textContent.trim() + ' -> ' + e.getAttribute('href')));
  console.log(navLinks);

  console.log('=== Sections present (by id) ===');
  const sectionIds = await page.$$eval('section[id], header[id]', els => els.map(e => e.id));
  console.log(sectionIds);
  const oldSections = await page.$$eval('#problem, #faq, #features', els => els.length);
  console.log('old sections still present (should be 0, except #features renamed):', oldSections);

  console.log('=== Anchor scroll test: click "What It Does" ===');
  await page.click('nav.top .links a[href="#what-it-does"]');
  await page.waitForTimeout(600);
  const scrollY1 = await page.evaluate(() => window.scrollY);
  console.log('scrollY after clicking What It Does:', scrollY1);

  console.log('=== Accordion test ===');
  const items = await page.$$('#accordion [data-item]');
  console.log('accordion items:', items.length);
  const initiallyOpen = await page.$$eval('#accordion [data-item].open', els => els.length);
  console.log('initially open (should be 0 -- both closed by default):', initiallyOpen);
  const accordionButtons = await page.$$eval('#accordion button.tool-launch-btn', els => els.length);
  console.log('launch buttons inside accordion (should be 0 -- removed):', accordionButtons);
  // click second item
  await page.click('#accordion [data-item]:nth-child(2) [data-trigger]');
  await page.waitForTimeout(400);
  const openAfterClick = await page.$$eval('#accordion [data-item].open', els => els.map(e => e.querySelector('.at-text b').textContent));
  console.log('open after clicking item 2:', openAfterClick);
  // click it again to confirm it can close
  await page.click('#accordion [data-item]:nth-child(2) [data-trigger]');
  await page.waitForTimeout(400);
  const openAfterSecondClick = await page.$$eval('#accordion [data-item].open', els => els.length);
  console.log('open after clicking item 2 again (should be 0):', openAfterSecondClick);

  console.log('=== Sign-in gating: tools hidden before login ===');
  await page.click('nav.top .links a[href="#signin"]');
  await page.waitForTimeout(400);
  console.log('signed-in panel hidden before login:', await page.$eval('#signedin-panel', el => el.classList.contains('hidden')));
  console.log('launchTool blocked pre-login (alert)?');
  page.once('dialog', d => { console.log('  dialog:', d.message()); d.accept(); });
  await page.evaluate(() => launchTool('reconciler'));
  await page.waitForTimeout(200);

  console.log('=== Create account flow (username-based) ===');
  await page.click('#show-signup');
  await page.fill('#signup-username', 'TestDad');
  await page.fill('#signup-password', 'hunter2');
  await page.fill('#signup-contact-email', 'dad@example.com');
  await page.fill('#signup-property', 'Blanco Oaks Apartments');
  await page.click('#signup-form button[type=submit]');
  await page.waitForTimeout(300);
  console.log('signed-in panel visible after signup:', !(await page.$eval('#signedin-panel', el => el.classList.contains('hidden'))));
  console.log('signed-in-as shows username, not email:', await page.$eval('#signedin-email', el => el.textContent));
  console.log('licensed property shown:', await page.$eval('#signedin-property', el => el.textContent));

  // CHANGED BY DESIGN: the tools are no longer embedded in this page. Clicking
  // Launch now fetches /tools/... with the signed-in user's token, and the
  // Cloudflare Worker only answers if that account holds an active property
  // licence. Over file:// there is no Worker and no real session, so the
  // correct behaviour here is a clean refusal -- the tab that was opened for
  // the tool gets closed again and the user is told why. The gate and the
  // successful path are covered properly against a live server in
  // test_gate_integration.mjs.
  console.log('=== Launch Tool with no reachable Worker (file://) ===');
  let launchDialog = null;
  page.once('dialog', d => { launchDialog = d.message(); d.accept(); });
  const before = context.pages().length;
  await page.click('.tools-grid .tool-card:nth-child(1) button.tool-launch-btn');
  await page.waitForTimeout(1200);
  const after = context.pages().length;
  console.log('  dialog:', launchDialog);
  console.log('  left no orphan tab open:', after === before);
  const stillSignedIn = await page.$eval('#signedin-panel', el => !el.classList.contains('hidden'));
  console.log('  did NOT wrongly sign the user out:', stillSignedIn);
  if (!launchDialog) throw new Error('Launch gave no explanation when the tool could not be fetched');
  if (after !== before) throw new Error('Launch left an orphan blank tab open after failing');
  // A tool that can't be reached is not the same as a session that expired.
  // Signing the user out here would look like a bug and lose their state.
  if (!stillSignedIn) throw new Error('Launch signed the user out when the tool merely could not be reached');

  console.log('=== Log out, then log back in with same username ===');
  await page.click('#logout-link');
  await page.waitForTimeout(300);
  console.log('signed-out view visible after logout:', !(await page.$eval('#signedout-view', el => el.classList.contains('hidden'))));
  await page.fill('#login-username', 'TestDad');
  await page.fill('#login-password', 'hunter2');
  await page.click('#login-form button[type=submit]');
  await page.waitForTimeout(300);
  console.log('signed back in, property:', await page.$eval('#signedin-property', el => el.textContent));

  console.log('=== Wrong password rejected ===');
  await page.click('#logout-link');
  await page.waitForTimeout(200);
  await page.fill('#login-username', 'TestDad');
  await page.fill('#login-password', 'wrongpass');
  await page.click('#login-form button[type=submit]');
  await page.waitForTimeout(200);
  console.log('login error shown:', !(await page.$eval('#login-error', el => el.classList.contains('hidden'))));

  console.log('=== Console/page errors ===');
  console.log(errors);

  console.log('=== Screenshot: desktop full page ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: '/tmp/homepage_desktop.png', fullPage: true });

  console.log('=== Screenshot: mobile full page ===');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('file://' + path.resolve(__dirname, 'homepage_final.html'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/homepage_mobile.png', fullPage: true });

  await browser.close();
})();
