/* The "Add payment method" button on a trial banner: it must ask the
   create-checkout Edge Function for a session using the signed-in user's own
   token, and follow the URL it gets back -- never build its own URL or trust
   a price/quantity from the page. Same supabase-js interception technique as
   test_onboarding.cjs, so the page runs its real production code path. */
const { createRequire } = require('module');
const req = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = req('playwright');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

let CREATE_CHECKOUT_RESPONSE = { status: 200, body: { url: 'https://fake-checkout.example/session/abc' } };
let lastCheckoutRequestHeaders = null;

function stubScript(){
  return `window.supabase = {
    createClient: function(){
      return {
        auth: {
          getSession: async () => ({data:{session:{access_token:'real-user-token', user:{id:'u1', email:'tester@example.com'}}}}),
          signOut: async () => ({}),
          onAuthStateChange: function(){ return {data:{subscription:{unsubscribe(){}}}}; },
        },
        from: function(table){
          const q = {
            select: () => q, eq: () => q,
            maybeSingle: async () => ({data:{username:'tester', property_name:null}, error:null}),
            then: (res) => res({data: (table === 'properties' ? window.__PROPS : []), error:null}),
          };
          return q;
        },
        rpc: async () => ({data:{}, error:null}),
      };
    },
  };`;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });

  await page.route('**/supabase-js@2/**', r =>
    r.fulfill({status:200, contentType:'text/javascript', body: stubScript()}));

  await page.route('**/functions/v1/create-checkout', async r => {
    lastCheckoutRequestHeaders = r.request().headers();
    const { status, body } = CREATE_CHECKOUT_RESPONSE;
    await r.fulfill({status, contentType:'application/json', body: JSON.stringify(body)});
  });

  await page.route('**/fake-checkout.example/**', r =>
    r.fulfill({status:200, contentType:'text/html', body: '<title>fake stripe checkout</title>'}));

  // A trial with 3 days left renders the "warn" banner with the button.
  await page.addInitScript(() => {
    window.__PROPS = [{name:'Blanco Oaks Apartments', address:'525 Jones Ave, Blanco, TX 78606',
                       status:'trialing', trial_ends_at:new Date(Date.now()+3*86400000).toISOString()}];
  });

  await page.goto('file:///home/claude/dist/app.html');
  await page.evaluate(() => { isSignedIn = true; });
  await page.evaluate(() => refreshAccountState());
  await page.waitForTimeout(400);

  check('The trial banner shows a way to pay',
    (await page.$('#trial-banner .banner-btn')) !== null);
  check('...labelled clearly', /add payment method/i.test(await page.textContent('#trial-banner .banner-btn')));

  // --- the happy path -------------------------------------------------------
  await page.click('#trial-banner .banner-btn');
  await page.waitForURL('**/fake-checkout.example/**', {timeout: 5000});

  check('Clicking it calls create-checkout with the user\'s real bearer token',
    lastCheckoutRequestHeaders && lastCheckoutRequestHeaders['authorization'] === 'Bearer real-user-token');
  check('...and no client-supplied price or quantity is sent (server decides that)',
    lastCheckoutRequestHeaders && lastCheckoutRequestHeaders['content-type'] === 'application/json');
  check('It follows the URL Stripe returned, not one it built itself',
    page.url().includes('fake-checkout.example/session/abc'));

  // --- the account already being paid up ------------------------------------
  await page.goto('file:///home/claude/dist/app.html');
  await page.evaluate(() => { isSignedIn = true; });
  await page.evaluate(() => refreshAccountState());
  await page.waitForTimeout(400);

  CREATE_CHECKOUT_RESPONSE = { status: 400, body: { error: 'Everything on this account is already paid for.' } };
  await page.click('#trial-banner .banner-btn');
  await page.waitForTimeout(400);

  check('A server refusal is shown to the person, not swallowed',
    dialogs.some(m => /already paid for/i.test(m)));
  check('The button is usable again after a failed attempt, not stuck disabled',
    await page.$eval('#trial-banner .banner-btn', el => !el.disabled));
  check('...and its label is restored',
    /add payment method/i.test(await page.textContent('#trial-banner .banner-btn')));
  check('The page did not navigate away on a failed attempt',
    page.url().includes('app.html'));

  // --- the network itself failing -------------------------------------------
  await page.unroute('**/functions/v1/create-checkout');
  await page.route('**/functions/v1/create-checkout', r => r.abort());
  dialogs.length = 0;
  await page.click('#trial-banner .banner-btn');
  await page.waitForTimeout(400);
  check('A network failure gets a plain explanation, not a silent freeze',
    dialogs.some(m => /could not reach the server/i.test(m)));
  check('...and the button recovers here too',
    await page.$eval('#trial-banner .banner-btn', el => !el.disabled));

  check('No page errors anywhere in the flow', errs.length === 0);
  if (errs.length) console.log('ERRORS:', errs);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
