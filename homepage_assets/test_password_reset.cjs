/* Forgotten password, end to end.
 *
 * The trap this flow is built around: following a reset link SIGNS YOU IN, on
 * a short-lived recovery session. So the page loads with a valid session and,
 * without care, shows the dashboard to someone who came to set a password and
 * never offers them the chance. Several checks below exist only to hold that
 * behaviour in place.
 */
const { createRequire } = require('module');
const req = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = req('playwright');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

function stubScript(){
  return `
  window.__calls = { reset: [], update: [] };
  window.__RESET_ERROR = null;
  window.__UPDATE_ERROR = null;
  window.__SESSION = null;
  window.__recoveryCb = null;
  window.supabase = {
    createClient: function(){
      return {
        auth: {
          getSession: async () => ({data:{session: window.__SESSION}}),
          signOut: async () => ({}),
          onAuthStateChange: function(cb){ window.__recoveryCb = cb; return {data:{subscription:{unsubscribe(){}}}}; },
          signInWithPassword: async () => ({data:{user:{id:'u1'},session:{access_token:'t'}}, error:null}),
          signUp: async () => ({data:{user:{id:'u1'},session:{access_token:'t'}}, error:null}),
          resetPasswordForEmail: async (email, opts) => {
            window.__calls.reset.push({email, opts});
            return { data:{}, error: window.__RESET_ERROR };
          },
          updateUser: async (attrs) => {
            window.__calls.update.push(attrs);
            if (window.__UPDATE_ERROR) return { data:null, error: window.__UPDATE_ERROR };
            return { data:{ user:{ id:'u1', email:'azden.kumar@gmail.com' } }, error:null };
          },
        },
        from: function(table){
          const q = {
            select: () => q, eq: () => q, update: () => q, insert: () => q,
            maybeSingle: async () => ({data:{username:'azden.kumar', property_name:'Blanco Oaks Apartments'}, error:null}),
            then: (res) => res({data: (table === 'properties' ? (window.__PROPS||[]) : []), error:null}),
          };
          return q;
        },
        rpc: async () => ({data:null, error:null}),
      };
    },
  };`;
}

const APP = 'file:///home/claude/dist/app.html';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/supabase-js@2/**', r =>
    r.fulfill({status:200, contentType:'text/javascript', body: stubScript()}));

  const hidden = sel => page.$eval(sel, el => el.classList.contains('hidden'));

  // --- getting to the form -------------------------------------------------
  await page.goto(APP);
  await page.waitForTimeout(400);
  check('The sign-in card offers a way out when you are locked out',
    (await page.$('#show-reset')) !== null);

  await page.fill('#login-username', 'azden.kumar@gmail.com');
  await page.click('#show-reset');
  await page.waitForTimeout(250);
  check('Asking to reset opens the reset form', !(await hidden('#reset-request-card')));
  check('...and hides the sign-in form', await hidden('#login-card'));
  check('...carrying over the address already typed, rather than asking twice',
    (await page.inputValue('#reset-email')) === 'azden.kumar@gmail.com');

  // --- a bad address is caught before anything is sent ---------------------
  // Two layers here. The input is type=email required, so the browser refuses
  // first and the submit handler never runs -- that is the refusal a real
  // person meets. The handler's own check is the backstop for anything the
  // browser lets through, so it is exercised separately below.
  await page.fill('#reset-email', 'not-an-email');
  await page.click('#reset-request-form button[type=submit]');
  await page.waitForTimeout(250);
  check('A malformed address never reaches the server',
    (await page.evaluate(() => window.__calls.reset.length)) === 0);
  check('...and the form stays put rather than claiming success',
    !(await hidden('#reset-request-card')) && (await hidden('#reset-sent-card')));

  await page.$eval('#reset-email', el => { el.removeAttribute('required'); el.type = 'text'; });
  await page.fill('#reset-email', 'still-not-an-email');
  await page.click('#reset-request-form button[type=submit]');
  await page.waitForTimeout(250);
  check('The handler refuses it too, if the browser ever lets it through',
    !(await hidden('#reset-request-error')));
  check('...still without sending anything',
    (await page.evaluate(() => window.__calls.reset.length)) === 0);
  await page.$eval('#reset-email', el => { el.type = 'email'; });

  // --- sending -------------------------------------------------------------
  await page.fill('#reset-email', 'azden.kumar@gmail.com');
  await page.click('#reset-request-form button[type=submit]');
  await page.waitForTimeout(400);

  const sent = await page.evaluate(() => window.__calls.reset);
  check('The reset email is requested from Supabase', sent.length === 1);
  check('...for the address given', sent[0] && sent[0].email === 'azden.kumar@gmail.com');
  check('...telling it to come back to the app page',
    sent[0] && /\/app\.html\?mode=reset$/.test(sent[0].opts.redirectTo));
  check('The confirmation replaces the form', !(await hidden('#reset-sent-card')));
  check('...and repeats the address so a typo is visible',
    (await page.textContent('#reset-sent-email')) === 'azden.kumar@gmail.com');
  check('...without confirming whether that account exists',
    /if there'?s an account/i.test(await page.textContent('#reset-sent-card')));
  check('...and warns that a differently-spelled address is a different account',
    /different account/i.test(await page.textContent('#reset-sent-card')));

  // --- an unknown address must look identical ------------------------------
  await page.click('#reset-sent-back');
  await page.waitForTimeout(200);
  await page.click('#show-reset');
  await page.evaluate(() => { window.__RESET_ERROR = {message: 'User not found'}; });
  await page.fill('#reset-email', 'nobody@example.com');
  await page.click('#reset-request-form button[type=submit]');
  await page.waitForTimeout(400);
  check('An address with no account gets the SAME answer, not "no such user"',
    !(await hidden('#reset-sent-card')) && (await hidden('#reset-request-error')));

  // --- a genuine failure IS surfaced ---------------------------------------
  await page.click('#reset-sent-back');
  await page.click('#show-reset');
  await page.evaluate(() => { window.__RESET_ERROR = {message: 'Email rate limit exceeded'}; });
  await page.fill('#reset-email', 'azden.kumar@gmail.com');
  await page.click('#reset-request-form button[type=submit]');
  await page.waitForTimeout(400);
  check('A real failure is shown rather than a fake success',
    !(await hidden('#reset-request-error')));
  check('...naming the actual problem',
    /rate limit/i.test(await page.textContent('#reset-request-error')));
  check('...and does NOT claim the mail was sent', await hidden('#reset-sent-card'));

  // --- THE TRAP: arriving from the link, already signed in -----------------
  // A recovery session exists at load. The dashboard must not appear.
  await page.addInitScript(() => {
    window.__PENDING_SESSION = {access_token:'recovery-token', user:{id:'u1', email:'azden.kumar@gmail.com'}};
    // A real recovering account has a property. With none, the app correctly
    // shows onboarding instead of the dashboard -- a different screen, and not
    // the one this section is about.
    window.__PROPS = [{name:'Blanco Oaks Apartments', address:'525 Jones Ave, Blanco, TX 78606',
                       status:'active', trial_ends_at:null}];
  });
  await page.goto(APP + '?mode=reset#access_token=abc&type=recovery');
  await page.evaluate(() => { window.__SESSION = window.__PENDING_SESSION; });
  await page.waitForTimeout(600);

  check('Following the link asks for a new password', !(await hidden('#reset-password-card')));
  check('...and does NOT drop them into the dashboard instead',
    await hidden('#signedin-panel'));
  check('...nor show the sign-in form', await hidden('#login-card'));

  // --- setting the password ------------------------------------------------
  await page.fill('#new-password', 'short');
  await page.fill('#new-password-2', 'short');
  await page.$eval('#new-password', el => el.removeAttribute('minlength'));
  await page.$eval('#new-password-2', el => el.removeAttribute('minlength'));
  await page.click('#reset-password-form button[type=submit]');
  await page.waitForTimeout(250);
  check('Too short a password is refused', !(await hidden('#reset-password-error')));
  check('...saying how long it must be',
    /8 characters/.test(await page.textContent('#reset-password-error')));

  await page.fill('#new-password', 'a-good-password');
  await page.fill('#new-password-2', 'a-different-one');
  await page.click('#reset-password-form button[type=submit]');
  await page.waitForTimeout(250);
  check('Mismatched passwords are refused',
    /do not match/i.test(await page.textContent('#reset-password-error')));
  check('...and nothing was saved', (await page.evaluate(() => window.__calls.update.length)) === 0);

  await page.fill('#new-password', 'a-good-password');
  await page.fill('#new-password-2', 'a-good-password');
  await page.click('#reset-password-form button[type=submit]');
  await page.waitForTimeout(600);

  const updates = await page.evaluate(() => window.__calls.update);
  check('The new password is saved', updates.length === 1 && updates[0].password === 'a-good-password');
  check('...and they end up signed in, not asked to log in again',
    !(await hidden('#signedin-panel')));
  check('...with the password form gone', await hidden('#reset-password-card'));

  // --- an expired link -----------------------------------------------------
  await page.goto(APP + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.waitForTimeout(500);
  check('An expired link says so', !(await hidden('#reset-request-error')));
  check('...in plain language, not "otp_expired"',
    /expired/i.test(await page.textContent('#reset-request-error')));
  check('...and puts them straight back on the request form',
    !(await hidden('#reset-request-card')));
  check('...rather than the dashboard', await hidden('#signedin-panel'));

  // --- updateUser failing on a stale link ----------------------------------
  await page.goto(APP + '?mode=reset#type=recovery');
  await page.evaluate(() => {
    window.__SESSION = {access_token:'x', user:{id:'u1'}};
    window.__UPDATE_ERROR = {message: 'invalid claim: missing sub claim'};
  });
  await page.waitForTimeout(400);
  await page.fill('#new-password', 'another-password');
  await page.fill('#new-password-2', 'another-password');
  await page.click('#reset-password-form button[type=submit]');
  await page.waitForTimeout(400);
  const staleMsg = await page.textContent('#reset-password-error');
  check('A stale link failure is explained, not shown as "invalid claim"',
    /expired or was already used/i.test(staleMsg));
  check('...and tells them what to do next', /request a new one/i.test(staleMsg));

  // --- the normal path is untouched ---------------------------------------
  await page.goto(APP);
  await page.waitForTimeout(400);
  check('A plain visit still shows the sign-in form', !(await hidden('#login-card')));
  check('...with no reset cards showing',
    (await hidden('#reset-request-card')) && (await hidden('#reset-password-card')));

  await page.goto(APP + '?start=trial');
  await page.waitForTimeout(400);
  check('The signup link from pricing still works', !(await hidden('#signup-card')));

  check('No page errors anywhere in the flow', errs.length === 0);
  if (errs.length) console.log('ERRORS:', errs);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
