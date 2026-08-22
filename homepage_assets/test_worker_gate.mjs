/* The licence gate, exercised directly.
   Supabase and the static-asset binding are stubbed so every branch can be
   driven, including the ones that only happen when something is broken.
   The cases that matter most are the FAILURE ones: a gate that fails open is
   worse than no gate, because it looks like protection and isn't. */
import worker from './worker.mjs';

const ASSET_BODY = '<html>THE TOOL</html>';
const ASSETS = { fetch: async () => new Response(ASSET_BODY, {status:200, headers:{'Content-Type':'text/html'}}) };
const ENV = { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_ANON_KEY: 'anon-key', ASSETS };

function req(path, token){
  return new Request('https://auditly.example' + path, token ? {headers:{Authorization:'Bearer ' + token}} : {});
}
// Stub Supabase: token 'good' is valid; 'licensed' is valid AND has a licence.
function stubSupabase({userStatus = 200, propsStatus = 200, props = [], throwOn = null} = {}){
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (throwOn && u.includes(throwOn)) throw new Error('network down');
    if (u.includes('/auth/v1/user')) return new Response('{}', {status: userStatus});
    if (u.includes('/rest/v1/properties')) return new Response(JSON.stringify(props), {status: propsStatus});
    throw new Error('unexpected call: ' + u);
  };
}
async function read(r){
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch(e){}
  return {status: r.status, text, json, cache: r.headers.get('Cache-Control') || ''};
}

const results = [];
const check = (label, pass) => results.push([label, pass]);

// --- public paths are untouched ------------------------------------------
stubSupabase();
let x = await read(await worker.fetch(req('/'), ENV));
check('The homepage is public and served without any check', x.status === 200 && x.text === ASSET_BODY);
x = await read(await worker.fetch(req('/index.html'), ENV));
check('Static assets are public', x.status === 200);

// --- the gate -------------------------------------------------------------
x = await read(await worker.fetch(req('/tools/leaseverify.html'), ENV));
check('A tool request with NO token is refused', x.status === 401);
check('...and does not leak the tool', !x.text.includes('THE TOOL'));

stubSupabase({userStatus: 401});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'expired'), ENV));
check('An expired or forged token is refused', x.status === 401);
check('...with a message telling them to sign in again', /sign in again/i.test((x.json||{}).message || ''));

stubSupabase({userStatus: 200, props: []});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'good'), ENV));
check('A valid session with NO active property licence is refused', x.status === 403);
check('...and does not leak the tool', !x.text.includes('THE TOOL'));
check('...and says what is missing', /no active property/i.test((x.json||{}).message || ''));

stubSupabase({userStatus: 200, props: [{id: 'p1'}]});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'licensed'), ENV));
check('A valid session WITH an active licence gets the tool', x.status === 200 && x.text.includes('THE TOOL'));
check('...and it is never stored in a shared cache', /no-store/.test(x.cache));

// --- failure modes must fail CLOSED --------------------------------------
stubSupabase({userStatus: 200, props: [{id:'p1'}]});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'licensed'), {...ENV, SUPABASE_URL: ''}));
check('A deploy missing its config refuses rather than serving the tool', x.status === 503);
check('...and does not leak the tool', !x.text.includes('THE TOOL'));

// Supabase answering with a SERVER ERROR is different from answering "no":
// it means we do not know whether this session is valid, and not knowing must
// never resolve to "serve the tool".
stubSupabase({userStatus: 500});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'licensed'), ENV));
check('A Supabase error on the token check refuses rather than serving the tool', x.status === 503);
check('...and does not leak the tool', !x.text.includes('THE TOOL'));

stubSupabase({throwOn: '/auth/v1/user'});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'licensed'), ENV));
check('Supabase being unreachable refuses rather than serving the tool', x.status === 503);

stubSupabase({userStatus: 200, throwOn: '/rest/v1/properties'});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'licensed'), ENV));
check('A licence lookup failure refuses rather than serving the tool', x.status === 503);

stubSupabase({userStatus: 200, propsStatus: 500});
x = await read(await worker.fetch(req('/tools/leaseverify.html', 'licensed'), ENV));
check('A licence lookup ERROR refuses rather than serving the tool', x.status === 503);

// --- the token is passed through as the USER, so RLS scopes the query -----
let sawAuth = null;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/rest/v1/properties')) sawAuth = init.headers.Authorization;
  return new Response(u.includes('/auth/v1/user') ? '{}' : '[{"id":"p1"}]', {status:200});
};
await worker.fetch(req('/tools/leaseverify.html', 'licensed'), ENV);
check('The licence query runs as the signed-in user, so RLS scopes it to their own account',
  sawAuth === 'Bearer licensed');

let pass = true;
console.log('=== PASS/FAIL ===');
for (const [l,p] of results){ console.log((p?'PASS':'FAIL') + ' -- ' + l); if(!p) pass = false; }
console.log(results.filter(x=>x[1]).length + '/' + results.length + ' passed');
if (!pass) process.exit(1);
