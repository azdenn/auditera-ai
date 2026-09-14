/* ===========================================================================
   Auditera AI — licence gate
   ---------------------------------------------------------------------------
   Cloudflare Pages "advanced mode": every request to the site enters here.
   Everything except /tools/ is served straight from the static assets. A
   request for a TOOL has to prove three things first:

     1. it carries a Supabase session token,
     2. Supabase agrees that token is currently valid,
     3. the account behind it holds at least one ACTIVE property licence.

   Why this exists: the tools used to be base64'd into the homepage, so anyone
   who could load the page already had all three files -- no login needed, and
   revoking an account revoked nothing. Now the file itself is unobtainable
   without a working login.

   It is a gate, not DRM. Someone who signs in legitimately can still save a
   copy of the page they were served. That is a detection problem -- see the
   usage analytics work -- not something a lock can solve, because the tools
   run entirely in the browser by design.

   NO SECRETS LIVE HERE. Validation is done by asking Supabase, using the
   publishable anon key that is already public in the homepage. The
   service_role key and the JWT secret are never needed and must never be put
   in this Worker's environment.

   Required environment variables (Pages -> Settings -> Variables):
     SUPABASE_URL       e.g. https://xxxx.supabase.co
     SUPABASE_ANON_KEY  the publishable anon key (safe to expose)
   =========================================================================== */

const TOOL_PREFIX = '/tools/';

/* KEEPING THE TESTING SITE OUT OF GOOGLE.
   ---------------------------------------------------------------------------
   The testing site moved from a workers.dev subdomain to testing.auditera.net
   on 2026-09-02, because workers.dev has none of the caching a real zone has
   and was unusably slow for a second person. That fixed the speed and created
   a new problem: it is now a perfectly ordinary, crawlable subdomain of the
   real site, serving a byte-identical copy of the marketing pages.

   Left alone, Google indexes it. Then there are two Auditera sites in the
   results, a customer eventually lands on the one that exists to be broken,
   and the real site is competing with its own duplicate for ranking.

   This cannot be solved with a robots.txt file, because BOTH sites serve the
   same dist/ folder -- a file that blocks crawlers on testing would block them
   on auditera.net too. So it is decided per REQUEST, from the hostname: the
   canonical host is indexable and every other host that reaches this Worker
   (testing, workers.dev, anything future) is not.

   Belt and braces on purpose: a robots.txt is only a request, so an
   X-Robots-Tag header goes on every response as well -- that one is an
   instruction, and it covers pages a crawler reaches without reading robots. */
const CANONICAL_HOST = 'auditera.net';

function isPublicSite(url){
  return url.hostname === CANONICAL_HOST || url.hostname === 'www.' + CANONICAL_HOST;
}

function deny(status, message){
  return new Response(JSON.stringify({error: true, message}), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const indexable = isPublicSite(url);

    // Every non-live host answers robots.txt with a flat refusal, before
    // anything else can serve a file of that name.
    if (!indexable && url.pathname === '/robots.txt'){
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // Anything that isn't a tool is public: marketing page, sign-in, assets.
    if (!url.pathname.startsWith(TOOL_PREFIX)){
      const assetRes = await env.ASSETS.fetch(request);
      if (indexable) return assetRes;
      const tagged = new Response(assetRes.body, assetRes);
      tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return tagged;
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY){
      // Fail CLOSED. A misconfigured deploy must not quietly start handing the
      // tools out to anyone who asks.
      return deny(503, 'This site is not fully configured yet. Please contact support.');
    }

    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return deny(401, 'Please sign in to open this tool.');

    const auth = {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
    };

    // 1 + 2. Is this a real, current session?
    let who;
    try {
      who = await fetch(env.SUPABASE_URL + '/auth/v1/user', {headers: auth});
    } catch (e){
      return deny(503, 'Could not verify your sign-in just now. Please try again in a moment.');
    }
    if (who.status === 401 || who.status === 403){
      return deny(401, 'Your session has expired. Please sign in again.');
    }
    if (!who.ok) return deny(503, 'Could not verify your sign-in just now. Please try again in a moment.');

    // 3. Is the account behind it entitled to use the tools right now?
    //
    // This asks the database rather than deciding here, because "licensed" is
    // not a simple status check any more -- a trialing property counts until
    // its trial expires. has_active_licence() is the single definition of it;
    // duplicating that rule in this Worker would guarantee the two drift, and
    // a gate that disagrees with billing fails open or locks out customers.
    //
    // The call runs as the USER, so row level security and auth.uid() scope it
    // to their own account. This Worker cannot see, and cannot be tricked into
    // seeing, anyone else's.
    let licences;
    try {
      licences = await fetch(
        env.SUPABASE_URL + '/rest/v1/rpc/has_active_licence',
        {method: 'POST', headers: Object.assign({'Content-Type': 'application/json'}, auth), body: '{}'});
    } catch (e){
      return deny(503, 'Could not check your licence just now. Please try again in a moment.');
    }
    if (!licences.ok) return deny(503, 'Could not check your licence just now. Please try again in a moment.');

    // The function returns a bare boolean. Anything that is not exactly true
    // -- null, a parse failure, an unexpected shape -- is treated as "no",
    // because this gate must fail closed.
    let entitled = false;
    try { entitled = (await licences.json()) === true; } catch (e){ entitled = false; }
    if (!entitled){
      return deny(403, 'There is no active property on this account yet. Add one to start your free trial, or get in touch if your trial has ended.');
    }

    /* Cleared. Serve the tool.

       WHY THIS IS NOT 'no-store' ANY MORE
       -----------------------------------
       It was, and that made every single open of the tool re-download 2.6 MB.
       'no-store' forbids the BROWSER from keeping a copy too, so a person
       opening the tool three times in a morning paid for it three times.
       Reported as "loading the tool takes a very long time, it's not usable".

       'private' is what actually carries the security requirement: no shared
       cache -- no CDN, no company proxy -- may keep a copy, so the file still
       cannot be obtained without passing this gate. 'max-age=0,
       must-revalidate' then forces the browser back here on EVERY open, so the
       licence check below still runs every single time and revoking an account
       still takes effect immediately. What changes is only that a browser
       holding an unchanged copy gets a 304 with no body instead of the whole
       file again.

       env.ASSETS already emits a strong ETag and answers If-None-Match itself,
       so the 304 comes from the asset layer -- but only AFTER the gate above
       has said yes, because run_worker_first means nothing reaches the assets
       without coming through here first. The gate is unchanged; only the size
       of the reply on a repeat open is. */
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
    out.headers.set('X-Content-Type-Options', 'nosniff');
    if (!indexable) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    // Never let a shared cache key this on anything but the exact URL.
    out.headers.set('Vary', 'Accept-Encoding');
    return out;
  },
};
