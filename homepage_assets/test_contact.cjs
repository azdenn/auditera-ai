/* The contact page. The thing that matters most here is that a message a
   person just spent five minutes writing is never silently lost -- so the
   failure paths get as much attention as the happy one. */
const { createRequire } = require('module');
const req = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = req('playwright');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

let INSERT_RESULT = { error: null };

function stubScript(){
  return `window.__INSERTS = [];
  window.supabase = {
    createClient: function(){
      return {
        auth: { getSession: async () => ({data:{session:null}}) },
        from: function(table){
          return {
            insert: async function(row){
              window.__INSERTS.push({table, row});
              return window.__INSERT_RESULT || {error:null};
            },
          };
        },
      };
    },
  };`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/supabase-js@2/**', r =>
    r.fulfill({status:200, contentType:'text/javascript', body: stubScript()}));

  await page.goto('file:///home/claude/dist/contact.html');
  await page.waitForTimeout(400);

  // --- an empty message must be refused, and say so ------------------------
  await page.click('#contact-form button[type=submit]');
  await page.waitForTimeout(250);
  check('An empty message is refused rather than sent',
    !(await page.$eval('#contact-error', el => el.classList.contains('hidden'))));
  check('...and the refusal names the missing piece',
    /message/i.test(await page.textContent('#contact-error')));
  check('...and nothing was written',
    (await page.evaluate(() => window.__INSERTS.length)) === 0);

  // --- a malformed email is caught before the message is thrown away -------
  await page.fill('#contact-message', 'The rent roll importer chokes on blank unit rows.');
  await page.fill('#contact-email', 'not-an-email');
  await page.click('#contact-form button[type=submit]');
  await page.waitForTimeout(250);
  check('A malformed email is caught', /email/i.test(await page.textContent('#contact-error')));
  check('...and the typed message is still in the box',
    (await page.inputValue('#contact-message')).includes('rent roll importer'));

  // --- the rating only appears where it means something --------------------
  check('No star rating on a bug report',
    !(await page.$eval('#stars', el => el.classList.contains('on'))));
  await page.click('label[for="kind-review"]');
  await page.waitForTimeout(200);
  check('Choosing "leave a review" reveals the rating',
    await page.$eval('#stars', el => el.classList.contains('on')));
  await page.click('label[for="star4"]');
  await page.click('label[for="kind-problem"]');
  await page.waitForTimeout(200);
  check('Switching away from a review clears the stale rating',
    (await page.$$eval('input[name=rating]:checked', els => els.length)) === 0);

  // --- the real send -------------------------------------------------------
  await page.click('label[for="kind-feature"]');
  await page.fill('#contact-email', 'manager@example.com');
  await page.fill('#contact-name', 'A Manager');
  await page.fill('#contact-company', 'Blanco Oaks');
  await page.click('#contact-form button[type=submit]');
  await page.waitForTimeout(400);

  const sent = await page.evaluate(() => window.__INSERTS);
  check('The message is written to the feedback table',
    sent.length === 1 && sent[0].table === 'feedback');
  check('...with the kind the person picked', sent[0] && sent[0].row.kind === 'feature');
  check('...and the message text intact',
    sent[0] && sent[0].row.message.includes('rent roll importer'));
  check('An anonymous sender is not tagged with somebody else\'s account',
    sent[0] && sent[0].row.user_id === undefined);
  check('No rating is attached to a non-review', sent[0] && sent[0].row.rating === null);
  check('The page it was sent from is recorded', sent[0] && /contact\.html/.test(sent[0].row.page || ''));

  check('Success replaces the form',
    !(await page.$eval('#contact-success', el => el.classList.contains('hidden'))));
  check('...and confirms where the reply will go',
    (await page.textContent('#contact-success-line')).includes('manager@example.com'));

  // --- sending another resets cleanly --------------------------------------
  await page.click('#contact-again');
  await page.waitForTimeout(250);
  check('"Send another" brings the form back',
    !(await page.$eval('#contact-form-state', el => el.classList.contains('hidden'))));
  check('...emptied out', (await page.inputValue('#contact-message')) === '');

  // --- the server refusing ---------------------------------------------
  await page.evaluate(() => { window.__INSERT_RESULT = {error:{message:'network unreachable'}}; });
  await page.fill('#contact-message', 'Six paragraphs of carefully considered feedback.');
  await page.click('#contact-form button[type=submit]');
  await page.waitForTimeout(400);
  const failMsg = await page.textContent('#contact-error');
  check('A failed send says so instead of pretending it worked',
    !(await page.$eval('#contact-error', el => el.classList.contains('hidden'))));
  check('...names the actual error rather than "something went wrong"',
    /network unreachable/.test(failMsg));
  check('...warns the text is only still in the box',
    /copy it/i.test(failMsg));
  check('...and does NOT show the success screen',
    await page.$eval('#contact-success', el => el.classList.contains('hidden')));
  check('...leaving the message recoverable',
    (await page.inputValue('#contact-message')).includes('carefully considered'));
  check('...with the button usable again',
    await page.$eval('#contact-form button[type=submit]', el => !el.disabled));

  check('No page errors', errs.length === 0);
  if (errs.length) console.log('ERRORS:', errs);

  console.log('\n=== PASS/FAIL ===');
  for (const [l, ok] of results) console.log((ok ? 'PASS -- ' : 'FAIL -- ') + l);
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})();
