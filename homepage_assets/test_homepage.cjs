/* The marketing homepage, after the app was split out of it.
 *
 * What this file used to cover -- sign in, signup, launching a tool -- now
 * lives on app.html and is covered by test_onboarding.cjs and
 * test_gate_integration.mjs. What is left here is the job the homepage still
 * has: sell the thing, and route people to the right door.
 */
const path = require('path');
const { chromium } = require('playwright');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.waitForTimeout(400);

  // --- the two doors -------------------------------------------------------
  const nav = await page.$$eval('nav.top .links a',
    els => els.map(e => ({ text: e.textContent.trim(), href: e.getAttribute('href'), cls: e.className })));

  check('Nav has a quiet way in for existing customers',
    nav.some(l => /sign in/i.test(l.text) && l.href === 'app.html'));
  check('Nav has a prominent way in for new ones',
    nav.some(l => /start free trial/i.test(l.text) && l.href === 'pricing.html' && /btn-primary/.test(l.cls)));
  check('Those two are distinct links, not one merged button',
    nav.filter(l => /sign in|start free trial/i.test(l.text)).length === 2);
  check('Pricing is reachable from the nav', nav.some(l => l.href === 'pricing.html'));
  check('Client results is still in the nav', nav.some(l => /client results/i.test(l.text)));
  check('Contact is still in the nav', nav.some(l => /contact/i.test(l.text)));
  check('The nav was trimmed of the section links',
    !nav.some(l => /what it does|how it works/i.test(l.text)));

  // --- the homepage must no longer BE the app ------------------------------
  check('No sign-in form on the marketing page', (await page.$('#login-form')) === null);
  check('No signed-in dashboard on the marketing page', (await page.$('#signedin-panel')) === null);
  check('No tool launch buttons on the marketing page', (await page.$('.tool-launch-btn')) === null);
  check('The Supabase library is not loaded on a page that has no login',
    (await page.$$eval('script[src]', els => els.map(e => e.src))).every(s => !/supabase/.test(s)));

  const bytes = await page.evaluate(() => document.documentElement.outerHTML.length);
  check('The homepage stayed small (was ~9.6 MB when tools were embedded)', bytes < 200000);

  // --- it still works as a page -------------------------------------------
  const before = await page.evaluate(() => window.scrollY);
  await page.click('a[href="#what-it-does"]').catch(() => {});
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.scrollY);
  check('In-page anchors still scroll', after > before);

  const accordion = await page.$$('#accordion [data-trigger]');
  if (accordion.length > 1){
    await accordion[1].click();
    await page.waitForTimeout(250);
    const open1 = await page.$$eval('#accordion [data-item].open', els => els.length);
    await accordion[0].click();
    await page.waitForTimeout(250);
    const open2 = await page.$$eval('#accordion [data-item].open', els => els.length);
    check('Accordion opens one item at a time', open1 === 1 && open2 === 1);
  }

  // --- the closing CTA should sell the trial, not open an email client -----
  const ctas = await page.$$eval('.cta-band a', els => els.map(e => e.getAttribute('href')));
  check('The closing call to action leads to the trial', ctas.some(h => h === 'pricing.html'));

  check('No page errors', errors.length === 0);
  if (errors.length) console.log('ERRORS:', errors);

  console.log('=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
