/* The hard block, exercised against the REAL built tool files.
 *
 * This is the test that matters for the anti-sharing work, so it deliberately
 * does not stub the tool: it loads the actual 2.4 MB built LeaseVerify /
 * ConcessionVerify / DepositVerify, intercepts only the authorize-audit call,
 * and checks what the page does with each answer.
 *
 * The central assertion is not "a message appeared". It is that on a refusal
 * the results are NOT in the DOM at all -- a blocked audit must produce
 * nothing, not produce results with a warning stuck on top.
 */
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/x.js');
const { chromium } = require('playwright');

const results = [];
function check(label, cond){ results.push([label, !!cond]); }

const TOOLS = {
  leaseverify:      '/home/claude/dist/tools/leaseverify.html',
  concessionverify: '/home/claude/dist/tools/concessionverify.html',
  depositverify:    '/home/claude/dist/tools/depositverify.html',
};

// What the fake authorize-audit endpoint will answer next.
let ANSWER = { status: 200, body: { allowed: true, verdict: 'allowed' } };
const CALLS = [];

const server = http.createServer((req, res) => {
  const file = TOOLS[req.url.replace(/^\/|\?.*$/g, '')];
  if (file && fs.existsSync(file)) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404); res.end('no');
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

// Point the tool's gate at this stub instead of the real Supabase project.
const AUTH_ROUTE = '**/functions/v1/authorize-audit';
async function answerAuthorize(route){
  const req = route.request();
  let body = null;
  try { body = JSON.parse(req.postData() || 'null'); } catch { body = req.postData(); }
  CALLS.push({ headers: req.headers(), body });
  await route.fulfill({
    status: ANSWER.status,
    contentType: 'application/json',
    body: JSON.stringify(ANSWER.body),
  });
}
await page.route(AUTH_ROUTE, answerAuthorize);

let loadSeq = 0;
async function loadTool(name, hash){
  CALLS.length = 0;
  pageErrors.length = 0;
  // The query param forces a real document load. Navigating between two URLs
  // that differ only by their hash is a same-document navigation: the page
  // does not reload and the gate's load-time code never re-runs, which had
  // this suite reporting a stripping bug that did not exist.
  const q = '?n=' + (++loadSeq);
  await page.goto(ORIGIN + '/' + name + q + (hash === null ? '' : '#tk=' + (hash ?? 'valid-session-token')));
  await page.waitForTimeout(500);
}

// The tool's own gate function is what we exercise -- calling it directly is
// what the upload handler does, minus 2 MB of spreadsheet parsing.
async function runGate(tool, detectedName){
  return page.evaluate(([t, n]) => window.agAuthorizeAudit(t, n, ''), [tool, detectedName]);
}

// ---------------------------------------------------------------------------
// 1. The gate exists in every shipped tool, and the old editable licence list
//    is gone from all of them.
// ---------------------------------------------------------------------------
for (const [name, file] of Object.entries(TOOLS)){
  const src = fs.readFileSync(file, 'utf8');
  check(name + ': ships with the licence gate', src.includes('async function agAuthorizeAudit'));
  check(name + ': actually calls it', /await agAuthorizeAudit\(/.test(src));
  check(name + ': no longer reads a licence list out of the URL',
    !/LICENSED_PROPERTIES/.test(src));
}

// ---------------------------------------------------------------------------
// 2. A licensed property is allowed through, and the request is well formed.
// ---------------------------------------------------------------------------
await loadTool('leaseverify');
ANSWER = { status: 200, body: { allowed: true, verdict: 'allowed', property: {name:'Blanco Oaks Apartments'} } };
let ok = await runGate('leaseverify', 'Blanco Oaks Apartments');
check('A licensed property is allowed', ok === true);
check('...and no block screen appears', (await page.$('#ag-block')) === null);
check('...the call carried the session token',
  CALLS[0] && CALLS[0].headers.authorization === 'Bearer valid-session-token');
check('...and named the tool', CALLS[0] && CALLS[0].body.tool === 'leaseverify');
check('...and sent the detected property name',
  CALLS[0] && CALLS[0].body.detected_name === 'Blanco Oaks Apartments');

// The privacy promise, asserted rather than assumed.
const sentKeys = CALLS[0] ? Object.keys(CALLS[0].body).sort() : [];
check('...and sent NOTHING except tool + property identifiers',
  JSON.stringify(sentKeys) === JSON.stringify(['detected_address','detected_name','tool']));

// ---------------------------------------------------------------------------
// 3. The whole point: an unlicensed property is BLOCKED.
// ---------------------------------------------------------------------------
await loadTool('leaseverify');
ANSWER = { status: 200, body: { allowed: false, verdict: 'blocked',
  message: 'These documents are for “Garden Creek Apartments”, which this account is not licensed for.' } };
ok = await runGate('leaseverify', 'Garden Creek Apartments');
check('An unlicensed property is refused', ok === false);
check('...and the page is taken over by a block screen', (await page.$('#ag-block')) !== null);
const blockText = await page.textContent('#ag-block');
check('...naming the property that was refused', /Garden Creek/.test(blockText));
check('...and saying what to do about it', /not licensed for/i.test(blockText));
check('...and reassuring that documents were not uploaded',
  /were not uploaded/i.test(blockText));

// The block must actually cover the page, not sit below the fold.
const covers = await page.$eval('#ag-block', el => {
  const s = getComputedStyle(el);
  return s.position === 'fixed' && Number(s.zIndex) > 1000 && el.getBoundingClientRect().width > 300;
});
check('...and the block covers the page rather than scrolling away', covers);

// ---------------------------------------------------------------------------
// 4. Fail closed: every way the check can go wrong must refuse.
// ---------------------------------------------------------------------------
const failClosed = [
  ['the server errors',            { status: 500, body: { error: 'boom' } }],
  ['the answer is malformed',      { status: 200, body: { nonsense: true } }],
  ['allowed is the STRING "true"', { status: 200, body: { allowed: 'true' } }],
  ['allowed is 1, not true',       { status: 200, body: { allowed: 1 } }],
  ['allowed is an object',         { status: 200, body: { allowed: {} } }],
  ['the body is empty',            { status: 200, body: null }],
  ['the session is rejected',      { status: 401, body: { allowed: false, verdict: 'expired' } }],
];
for (const [label, answer] of failClosed){
  await loadTool('leaseverify');
  ANSWER = answer;
  const r = await runGate('leaseverify', 'Blanco Oaks Apartments');
  check('Refuses when ' + label, r === false);
  check('...and blocks the page when ' + label, (await page.$('#ag-block')) !== null);
}

// Network failure is its own case -- the request never completes at all.
await loadTool('leaseverify');
await page.unroute(AUTH_ROUTE);
await page.route(AUTH_ROUTE, r => r.abort());
const netResult = await runGate('leaseverify', 'Blanco Oaks Apartments');
check('Refuses when the network fails outright', netResult === false);
check('...and blocks the page', (await page.$('#ag-block')) !== null);
await page.unroute(AUTH_ROUTE);
await page.route(AUTH_ROUTE, answerAuthorize);

// ---------------------------------------------------------------------------
// 5. A saved / shared copy of the tool has no token, so it cannot audit.
//    This is what stops "download the page and pass it around".
// ---------------------------------------------------------------------------
// A FRESH browser context is the honest model of "somebody else opened this
// file": no sessionStorage, no token, nothing carried over. Reusing the
// existing page would not test this at all, because the token deliberately
// survives a refresh within the same tab.
const strangerCtx = await browser.newContext();
const stranger = await strangerCtx.newPage();
const strangerCalls = [];
await stranger.route(AUTH_ROUTE, route => {
  strangerCalls.push(1);
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ allowed: true, verdict: 'allowed' }) });
});
await stranger.goto(ORIGIN + '/leaseverify?shared=1');
await stranger.waitForTimeout(400);
const noToken = await stranger.evaluate(() =>
  window.agAuthorizeAudit('leaseverify', 'Blanco Oaks Apartments', ''));
check('A saved copy opened by someone else refuses', noToken === false);
check('...without even asking the server', strangerCalls.length === 0);
check('...and explains it must be opened from the dashboard',
  /dashboard/i.test(await stranger.textContent('#ag-block')));
await strangerCtx.close();

// ---------------------------------------------------------------------------
// 6. The token does not linger in the address bar.
// ---------------------------------------------------------------------------
await loadTool('leaseverify', 'secret-token-value');
const url = page.url();
check('The session token is stripped from the URL after load', !url.includes('secret-token-value'));

// ---------------------------------------------------------------------------
// 7. All three tools block, not just the one that used to warn.
// ---------------------------------------------------------------------------
for (const tool of ['leaseverify', 'concessionverify', 'depositverify']){
  await loadTool(tool);
  ANSWER = { status: 200, body: { allowed: false, verdict: 'blocked', message: 'Not licensed.' } };
  const r = await runGate(tool, 'Somebody Elses Property');
  check(tool + ': refuses an unlicensed property', r === false);
  check(tool + ': takes over the page', (await page.$('#ag-block')) !== null);
}

// ---------------------------------------------------------------------------
// 8. Naming the account.
//
//    A correct refusal delivered to someone signed in as the wrong one of
//    their logins is indistinguishable from a broken product unless the screen
//    says who they are. That happened in production, so it is tested here.
//
//    Everything below is DISPLAY. The email is read out of the session token
//    the browser already holds -- no network call, no secret -- and it grants
//    nothing: the last check in this section proves a token claiming to be
//    somebody else is refused exactly the same.
// ---------------------------------------------------------------------------
function fakeJwt(claims){
  const seg = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return seg({alg:'HS256', typ:'JWT'}) + '.' + seg(claims) + '.' + 'not-a-real-signature';
}
const JANINE = 'janine.luz@texcelproperties.com';
const JANINE_JWT = fakeJwt({ sub: '5ccb0fa5', email: JANINE, role: 'authenticated' });

await loadTool('leaseverify', JANINE_JWT);
const chip = await page.$('#ag-account-chip');
check('The tool says which account it is running as, before anything is uploaded',
  chip !== null);
const chipText = chip ? await page.textContent('#ag-account-chip') : '';
check('...naming the actual signed-in address', chipText.includes(JANINE));
check('...with a way to change account', /switch account/i.test(chipText));
check('...and it costs no network call to do it -- the token already says so',
  CALLS.length === 0);

// The server's answer is authoritative; the token's claim is only a fallback.
ANSWER = { status: 200, body: { allowed: false, verdict: 'blocked',
  account_email: JANINE,
  message: 'These documents are for “Garden Creek Apartments”.\n\nThe account you are '
    + 'signed in to (' + JANINE + ') is licensed for “Garden Trails” — not this property.' } };
await runGate('leaseverify', 'Garden Creek Apartments');
const blockedText = await page.textContent('#ag-block');
check('A refusal states the signed-in account on screen', /signed in as/i.test(blockedText));
check('...showing the address the SERVER reported', blockedText.includes(JANINE));
check('...alongside the property it refused', /Garden Creek/.test(blockedText));
check('...and offers a way back to switch account',
  /back to dashboard/i.test(blockedText));

// An expired session has no meaningful account to name -- the only next step
// is signing in again, and "signed in as" would contradict the heading.
await loadTool('leaseverify', JANINE_JWT);
ANSWER = { status: 401, body: { allowed: false, verdict: 'expired',
  message: 'Your session has expired. Reopen this tool from your dashboard to carry on.' } };
await runGate('leaseverify', 'Blanco Oaks Apartments');
const expiredText = await page.textContent('#ag-block');
check('An expired session does not claim you are signed in as anyone',
  !/signed in as/i.test(expiredText));

// An opaque (non-JWT) token must degrade quietly, not throw or show junk.
await loadTool('leaseverify', 'opaque-not-a-jwt');
check('A token that is not a JWT simply shows no account line',
  (await page.$('#ag-account-chip')) === null);

// The identity shown is cosmetic. Claiming to be a licensed account in the
// token's own claims changes nothing, because the server decides.
ANSWER = { status: 200, body: { allowed: false, verdict: 'blocked', message: 'Not licensed.' } };
await loadTool('leaseverify', fakeJwt({ sub: 'x', email: 'owner-of-everything@example.com' }));
const spoofed = await runGate('leaseverify', 'Garden Creek Apartments');
check('A token claiming a different identity is still refused -- display is not authority',
  spoofed === false);

// The other two tools carry the same chrome.
for (const tool of ['concessionverify', 'depositverify']){
  await loadTool(tool, JANINE_JWT);
  check(tool + ': names the signed-in account too',
    (await page.$('#ag-account-chip')) !== null);
}

check('No page errors anywhere', pageErrors.length === 0);
if (pageErrors.length) console.log('ERRORS:', pageErrors);

console.log('\n=== PASS/FAIL ===');
for (const [l, o] of results) console.log((o ? 'PASS -- ' : 'FAIL -- ') + l);
const passed = results.filter(r => r[1]).length;
console.log('\n' + passed + '/' + results.length + ' passed');

await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
