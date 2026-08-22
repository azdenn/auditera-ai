/* ===========================================================================
   Auditly AI — licence gate
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

    // Anything that isn't a tool is public: marketing page, sign-in, assets.
    if (!url.pathname.startsWith(TOOL_PREFIX)) return env.ASSETS.fetch(request);

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

    // 3. Does the account behind it hold an active property licence? The query
    // runs as the USER, so row level security scopes it to their own account --
    // this Worker cannot see, and cannot be tricked into seeing, anyone else's.
    let licences;
    try {
      licences = await fetch(
        env.SUPABASE_URL + '/rest/v1/properties?select=id&status=eq.active&limit=1',
        {headers: auth});
    } catch (e){
      return deny(503, 'Could not check your licence just now. Please try again in a moment.');
    }
    if (!licences.ok) return deny(503, 'Could not check your licence just now. Please try again in a moment.');

    let rows = [];
    try { rows = await licences.json(); } catch (e){ rows = []; }
    if (!Array.isArray(rows) || rows.length === 0){
      return deny(403, 'There is no active property on this account yet. Get in touch and we\'ll add one.');
    }

    // Cleared. Serve the tool, and make sure no shared cache keeps a copy.
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.set('X-Content-Type-Options', 'nosniff');
    return out;
  },
};
