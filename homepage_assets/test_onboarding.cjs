/* The new customer path, end to end in a real browser:
   pricing -> create account -> add property -> trial dashboard.

   Supabase is stubbed by intercepting the supabase-js script itself, so the
   page builds its real client from the stub and every code path it takes is
   the production one -- same technique as test_gate_integration.mjs. */
const { createRequire } = require('module');
const req = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = req('playwright');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

// Server-side state the stub pretends to hold.
let PROPS = [];
let RPC_CALLS = [];

function stubScript(){
  return `window.supabase = {
    createClient: function(){
      return {
        auth: {
          getSession: async () => ({data:{session:null}}),
          signOut: async () => ({}),
          signInWithPassword: async () => ({data:{user:{id:'u1'},session:{access_token:'t'}}, error:null}),
          signUp: async () => ({data:{user:{id:'u1'},session:{access_token:'t'}}, error:null}),
        },
        from: function(table){
          const q = {
            select: () => q, eq: () => q, update: () => q, insert: () => q,
            maybeSingle: async () => ({data:{username:'tester', property_name:null}, error:null}),
            then: (res) => res({data: (table === 'properties' ? window.__PROPS : []), error:null}),
          };
          return q;
        },
        rpc: async function(name, args){
          window.__RPC.push({name, args});
          if (name === 'start_trial_property'){
            if (!args.p_address) return {data:null, error:{message:'Property address is required'}};
            if (window.__PROPS.length) return {data:null, error:{message:'This account already has a property. Additional properties are added through billing.'}};
            const ends = new Date(Date.now() + 30*86400000).toISOString();
            window.__PROPS.push({name: args.p_name, address: args.p_address, status:'trialing', trial_ends_at: ends});
            return {data:{}, error:null};
          }
          return {data:null, error:{message:'unknown rpc'}};
        },
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
  await page.route('**/supabase-js@2/**', r =>
    r.fulfill({status:200, contentType:'text/javascript', body: stubScript()}));
  await page.addInitScript(() => { window.__PROPS = []; window.__RPC = []; });

  // --- pricing page sends new customers to the create-account form ---------
  await page.goto('file:///home/claude/dist/pricing.html');
  const cta = await page.$eval('.plan .btn-primary', el => el.getAttribute('href'));
  check('Pricing CTA points at the app with the trial flag', cta === 'app.html?start=trial');
  check('Pricing page shows the real price', (await page.textContent('.amount .num')).includes('$50'));
  check('Pricing page states the trial', (await page.textContent('.amount-note')).toLowerCase().includes('30 days free'));

  // --- arriving with ?start=trial opens signup, not sign-in ----------------
  await page.goto('file:///home/claude/dist/app.html?start=trial');
  await page.waitForTimeout(600);
  check('?start=trial opens the create-account form',
    !(await page.$eval('#signup-card', el => el.classList.contains('hidden'))));
  check('Signup no longer asks for a property', (await page.$('#signup-property')) === null);

  // --- create the account --------------------------------------------------
  await page.fill('#signup-contact-email', 'newcustomer@example.com');
  await page.fill('#signup-password', 'hunter2hunter2');
  await page.click('#signup-form button[type=submit]');
  await page.waitForTimeout(700);

  check('A brand-new account is asked to add a property',
    !(await page.$eval('#onboarding-card', el => el.classList.contains('hidden'))));
  check('...and is NOT shown a dashboard it cannot use',
    await page.$eval('#signedin-panel', el => el.classList.contains('hidden')));

  // --- refusing an incomplete property ------------------------------------
  await page.fill('#onboard-name', 'Somewhere Apartments');
  await page.$eval('#onboard-address', el => el.removeAttribute('required'));
  await page.click('#onboarding-form button[type=submit]');
  await page.waitForTimeout(400);
  const addrErr = await page.$eval('#onboarding-error', el => el.textContent);
  check('A property with no address is refused', /address is required/i.test(addrErr));
  check('...and the refusal says exactly what is wrong', addrErr.trim().length > 10);

  // --- the real thing ------------------------------------------------------
  await page.fill('#onboard-address', '525 Jones Ave, Blanco, TX 78606');
  await page.click('#onboarding-form button[type=submit]');
  await page.waitForTimeout(700);

  const rpc = await page.evaluate(() => window.__RPC);
  const started = rpc.filter(r => r.name === 'start_trial_property').pop();
  check('The trial is started through the database function, not an insert',
    started && started.args.p_name === 'Somewhere Apartments' &&
    started.args.p_address === '525 Jones Ave, Blanco, TX 78606');

  check('The dashboard replaces the onboarding card',
    await page.$eval('#onboarding-card', el => el.classList.contains('hidden')) &&
    !(await page.$eval('#signedin-panel', el => el.classList.contains('hidden'))));

  const banner = await page.textContent('#trial-banner');
  check('The trial banner appears', !(await page.$eval('#trial-banner', el => el.classList.contains('hidden'))));
  check('...and says how long is left', /\d+ days left/.test(banner));
  check('...and says no card is needed', /no card/i.test(banner));

  const rows = await page.textContent('#prop-rows');
  check('The property is listed with its address',
    rows.includes('Somewhere Apartments') && rows.includes('525 Jones Ave'));
  check('...and is marked as trialing', rows.includes('trialing'));

  // --- a name containing HTML must not break the page ----------------------
  await page.evaluate(() => {
    window.__PROPS = [{name:'<img src=x onerror=alert(1)>Evil', address:'1 X St',
                       status:'trialing', trial_ends_at:new Date(Date.now()+3*86400000).toISOString()}];
  });
  await page.evaluate(() => refreshAccountState());
  await page.waitForTimeout(400);
  const imgs = await page.$$eval('#prop-rows img', els => els.length);
  check('A property name containing markup is escaped, not rendered', imgs === 0);

  const nearBanner = await page.textContent('#trial-banner');
  check('A trial ending soon is called out differently', /3 days left/.test(nearBanner));
  const cls = await page.$eval('#trial-banner', el => el.className);
  check('...and is styled as a warning', cls.includes('warn'));

  // --- an expired trial ----------------------------------------------------
  await page.evaluate(() => {
    window.__PROPS = [{name:'Lapsed Place', address:'2 Y St', status:'trialing',
                       trial_ends_at:new Date(Date.now()-86400000).toISOString()}];
  });
  await page.evaluate(() => refreshAccountState());
  await page.waitForTimeout(400);
  const expired = await page.textContent('#trial-banner');
  check('An expired trial says so plainly', /free month has ended/i.test(expired));
  check('...and reassures nothing was deleted', /nothing has been deleted/i.test(expired));

  check('No page errors anywhere in the flow', errs.length === 0);
  if (errs.length) console.log('ERRORS:', errs);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
