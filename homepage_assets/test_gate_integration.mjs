/* The licence gate, end to end over real HTTP.
   ---------------------------------------------------------------------------
   The unit tests in test_worker_gate.mjs drive worker.fetch() directly. This
   one stands the whole thing up: the real worker.js, the real built dist/
   folder, the real homepage, and the real tool files, served over a socket,
   with Supabase stubbed at the URL the Worker is configured with.

   It exists because the two halves can each be right and still not work
   together -- the browser has to actually send the token, and the Worker has
   to actually refuse without it. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// playwright is installed globally in this environment, not beside the tests.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
import worker from './worker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const MIME = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css'};

// Whether the stubbed account currently holds a licence. Flipped mid-test.
let LICENSED = true;
let VALID_TOKEN = 'good-token';

const ASSETS = {
  async fetch(request){
    const p = new URL(request.url).pathname;
    const file = path.join(DIST, p === '/' ? 'index.html' : p);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
      return new Response('not found', {status: 404});
    }
    return new Response(fs.readFileSync(file), {
      status: 200, headers: {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'},
    });
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  // --- stubbed Supabase, mounted on the same origin -----------------------
  if (url.pathname === '/auth/v1/user'){
    res.writeHead(token === VALID_TOKEN ? 200 : 401, {'Content-Type':'application/json'});
    return res.end('{}');
  }
  // The gate asks the database whether the caller is entitled, rather than
  // deciding from a status column -- a trialing property counts too. The RPC
  // returns a bare boolean.
  if (url.pathname === '/rest/v1/rpc/has_active_licence'){
    if (token !== VALID_TOKEN){ res.writeHead(401); return res.end('false'); }
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(LICENSED ? 'true' : 'false');
  }

  // --- everything else goes through the real Worker ----------------------
  const headers = new Headers();
  for (const [k,v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(url.toString(), {method: req.method, headers});
  const env = {SUPABASE_URL: 'http://' + req.headers.host, SUPABASE_ANON_KEY: 'anon', ASSETS};
  const out = await worker.fetch(request, env);
  const buf = Buffer.from(await out.arrayBuffer());
  const h = {}; out.headers.forEach((v,k) => h[k] = v);
  res.writeHead(out.status, h);
  res.end(buf);
});

await new Promise(r => server.listen(0, r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

const results = [];
const check = (l,p) => results.push([l,p]);

// --- the gate as seen from the network ------------------------------------
let r = await fetch(ORIGIN + '/tools/leaseverify.html');
check('Fetching a tool with no token over HTTP is refused', r.status === 401);
check('...and the response body is not the tool', !(await r.text()).includes('<title>'));

r = await fetch(ORIGIN + '/tools/leaseverify.html', {headers:{Authorization:'Bearer wrong'}});
check('A bad token is refused', r.status === 401);

LICENSED = false;
r = await fetch(ORIGIN + '/tools/leaseverify.html', {headers:{Authorization:'Bearer good-token'}});
check('A valid session with no licence is refused', r.status === 403);
check('...and the response body is not the tool', !(await r.text()).includes('<title>'));

LICENSED = true;
r = await fetch(ORIGIN + '/tools/leaseverify.html', {headers:{Authorization:'Bearer good-token'}});
const toolHtml = await r.text();
check('A licensed session gets the real tool file', r.status === 200 && toolHtml.includes('process-btn'));
check('...and it is the LeaseVerify build specifically', /LeaseVerify/.test(toolHtml));

// The homepage itself must stay public AND must not carry the tools.
r = await fetch(ORIGIN + '/');
const home = await r.text();
check('The homepage is public', r.status === 200);
check('The homepage does not contain the tools', !home.includes('process-btn') && home.length < 400000);

// --- and from the browser, through launchTool ------------------------------
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const context = await browser.newContext();
const page = await context.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
// `sb` is a const created at load time from window.supabase, so it cannot be
// replaced afterwards. The supabase-js library itself is intercepted instead:
// the page then builds its real client from this stub and every code path it
// takes -- including launchTool's getSession() -- is the production one.
await page.route('**/supabase-js@2/**', route => route.fulfill({
  status: 200,
  contentType: 'text/javascript',
  body: `window.supabase = {
    createClient: function(){
      return {
        auth: {
          getSession: async () => ({data:{session:{access_token:'good-token', user:{id:'u1', email:'tester@leaseproof-login.test'}}}}),
          signOut: async () => ({}),
          onAuthStateChange: function(){ return {data:{subscription:{unsubscribe(){}}}}; },
          signInWithPassword: async () => ({data:{user:{id:'u1'},session:{access_token:'good-token'}}, error:null}),
          signUp: async () => ({data:{user:{id:'u1'},session:{access_token:'good-token'}}, error:null}),
        },
        from: function(){
          const q = {
            select: () => q, eq: () => q, update: () => q, insert: () => q,
            maybeSingle: async () => ({data:{username:'tester', property_name:'Blanco Oaks Apartments'}, error:null}),
            then: (res) => res({data:[], error:null}),
          };
          return q;
        },
      };
    },
  };`,
}));
// The tool launcher moved to the app page; the homepage is marketing only.
await page.goto(ORIGIN + '/app.html');
await page.waitForTimeout(400);
await page.evaluate(() => { isSignedIn = true; currentProperty = 'Blanco Oaks Apartments'; });

const [popup] = await Promise.all([
  context.waitForEvent('page'),
  page.evaluate(() => launchTool('reconciler')),
]);
await popup.waitForLoadState('domcontentloaded');
await popup.waitForSelector('#process-btn', {timeout: 15000});
check('Clicking Launch opens the real tool for a licensed account',
  await popup.$eval('#process-btn', el => el.textContent.trim()) === 'Process');
check('...and the licensed property is passed through to it',
  /property=/.test(popup.url()) || (await popup.evaluate(() => location.hash)).includes('property='));
await popup.close();

// Now revoke the licence and try again: the same click must be refused.
LICENSED = false;
let dialog = null;
page.once('dialog', d => { dialog = d.message(); d.accept(); });
const tabsBefore = context.pages().length;
await page.evaluate(() => launchTool('reconciler'));
await page.waitForTimeout(1500);
check('With the licence revoked, the same click is refused', !!dialog);
check('...with the reason shown to the user', /no active property/i.test(dialog || ''));
check('...and no orphan tab is left open', context.pages().length === tabsBefore);
if (errs.length) console.log('page errors:', errs);
check('No page errors', errs.length === 0);

await browser.close();
server.close();

let ok = true;
console.log('=== PASS/FAIL ===');
for (const [l,p] of results){ console.log((p?'PASS':'FAIL') + ' -- ' + l); if(!p) ok = false; }
console.log(results.filter(x=>x[1]).length + '/' + results.length + ' passed');
if (!ok) process.exit(1);
