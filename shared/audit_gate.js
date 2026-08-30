/* =========================================================================
   Audit gate — inlined into all three tools by their build scripts.

   WHAT CHANGED AND WHY
   The tools used to be handed their licence list in the URL hash and, at
   most, warned when the uploaded documents belonged to a property the
   account was not licensed for. A hash is editable, and a warning is not a
   lock, so per-property pricing was effectively voluntary.

   Now: the tool sends the property identifiers it read out of the documents
   to authorize-audit, and refuses to produce results unless that function
   says yes. The licence list is no longer in the client at all.

   WHAT LEAVES THE BROWSER
   A property name and a street address. Nothing else. Not the rent roll, not
   a lease, not a resident name, not a rent figure. That boundary is the whole
   product promise and this file is the only place in a tool that talks to a
   server, so it is the only place that could break it. Keep it that way.

   FAIL CLOSED
   Every path that is not an explicit "allowed: true" refuses: no token, an
   expired session, a network failure, a malformed answer, a thrown error.
   A tool that shows results when it could not check is worse than one that
   refuses too often, because the failure is silent.

   THE HONEST LIMIT
   Someone who opens devtools can patch this out. Nothing running in the
   customer's own browser can prevent that, and pretending otherwise would be
   a lie. What they cannot do is hide: every call is logged server-side with
   the account it came from, so a shared login shows up as one account
   auditing properties it does not own.
   ========================================================================= */

var AG_SUPABASE_URL = 'https://kyfvrkghqohkhwidqwst.supabase.co';
var AG_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZnZya2docW9oa2h3aWRxd3N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.PZQsIhFAxM-PiHwSuSfSWeIx2mVeDZ4FgVR3wDJLXu4';

/* The session token the dashboard put in the hash when it opened this tool.

   Read once at load, stashed in sessionStorage, then removed from the URL so
   it is not left sitting in the address bar for a screenshot or a shoulder to
   pick up. A hash never reaches any server, so it was never transmitted --
   this is hygiene, not secrecy.

   The sessionStorage copy is what makes a page refresh survivable. Stripping
   the hash alone meant reloading the tool produced "this was not opened from
   your dashboard", which is a baffling thing to tell someone who just pressed
   F5. sessionStorage is scoped to this one tab and dies with it, which is
   exactly the lifetime the token should have. */
var AG_TOKEN = (function(){
  var KEY = 'ag_session_token';

  function remember(t){
    try { sessionStorage.setItem(KEY, t); } catch (_e){ /* private mode, file:// -- fine */ }
  }
  function recall(){
    try { return sessionStorage.getItem(KEY) || null; } catch (_e){ return null; }
  }

  try {
    var m = /(?:^|[#&])tk=([^&]+)/.exec(window.location.hash || '');
    if (!m) return recall();

    var t = decodeURIComponent(m[1]) || null;
    if (!t) return recall();
    remember(t);

    try {
      var cleaned = (window.location.hash || '')
        .replace(/(?:^|[#&])tk=[^&]*/, '')
        .replace(/^#?&/, '#');
      history.replaceState(null, '', window.location.pathname + window.location.search
        + (cleaned && cleaned !== '#' ? cleaned : ''));
    } catch (_e){ /* cosmetic only */ }

    return t;
  } catch (_e){ return null; }
})();

/* Which account this session belongs to, read out of the token itself.

   A Supabase session token is a JWT: three dot-separated base64url segments
   whose middle segment is a plain JSON object of claims, one of which is the
   signed-in email. Reading it costs no network call and no secret -- the
   browser is already holding its own session.

   WHY THIS IS HERE
   Anyone managing properties for more than one owner will eventually be signed
   in as the wrong one. Before this, a refusal said "this account is not
   licensed for that property" without ever saying WHICH account, so being
   signed in as the wrong person looked identical to a broken licence. That is
   not a hypothetical: it cost a real round-trip of "the gate is broken" when
   it was working exactly as designed. Naming the account turns that into a
   one-glance answer.

   DISPLAY ONLY. Nothing is authorised from this. The server reads the account
   out of the verified token on its own side and never trusts a word the
   browser says about who it is -- so a patched client can change what this
   SHOWS and change nothing about what it is ALLOWED to do. */
function agAccountEmail(){
  try {
    if (!AG_TOKEN) return null;
    var parts = String(AG_TOKEN).split('.');
    if (parts.length < 2) return null;
    var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var raw = atob(b64);
    // Claims may carry non-ASCII. Decode as UTF-8 rather than mangling it.
    var json = decodeURIComponent(raw.split('').map(function(c){
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    var claims = JSON.parse(json);
    var email = claims && claims.email;
    return (typeof email === 'string' && email.indexOf('@') !== -1) ? email : null;
  } catch (_e){ return null; }
}

/* The dashboard this tool was launched from, derived rather than hardcoded.
   Tools run from a blob: URL, whose origin is the page that created it, so
   this resolves to the real site in production and to nothing at all when a
   tool is opened straight off disk. Returns null when it cannot be sure --
   callers then simply omit the link rather than offering a broken one. */
function agDashboardUrl(){
  try {
    var o = window.location.origin;
    if (o && /^https?:\/\/./.test(o)) return o + '/app';
  } catch (_e){ /* fall through */ }
  return null;
}

/* Set by agAuthorizeAudit on a yes. Null until then, and null again for any
   refusal — a tool that was not authorised has no property to act on. */
var AG_PROPERTY = null;
var AG_VERDICT = null;

/* Read and write this property's house rules.

   WHAT TRAVELS: charge labels the property writes on its own paperwork, and
   nothing else. No amounts, no residents, no document text. The arithmetic
   that decides whether a rule still holds runs here, in the browser, against
   documents that never leave it — the server stores the convention, never the
   evidence for it. */
function agRulesEndpoint(query){
  return AG_SUPABASE_URL + '/rest/v1/property_rules' + (query || '');
}
function agRulesHeaders(extra){
  var h = { 'Authorization': 'Bearer ' + AG_TOKEN, 'apikey': AG_ANON_KEY,
            'Content-Type': 'application/json' };
  for (var k in (extra || {})) h[k] = extra[k];
  return h;
}

async function agLoadRules(propertyId){
  if (!AG_TOKEN || !propertyId) return [];
  try {
    var res = await fetch(agRulesEndpoint('?property_id=eq.' + encodeURIComponent(propertyId) +
      '&enabled=is.true&select=id,rule,source,created_at'),
      { headers: agRulesHeaders(), cache: 'no-store' });
    if (!res.ok) return [];
    var rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_e){ return []; }   // rules are a convenience; never block an audit
}

async function agSaveRule(propertyId, rule, source){
  if (!AG_TOKEN || !propertyId) return null;
  try {
    var res = await fetch(agRulesEndpoint(''), {
      method: 'POST',
      headers: agRulesHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify({ property_id: propertyId, rule: rule, source: source || 'proposed' }),
    });
    if (!res.ok) return null;
    var rows = await res.json();
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  } catch (_e){ return null; }
}

async function agDeleteRule(id){
  if (!AG_TOKEN || !id) return false;
  try {
    var res = await fetch(agRulesEndpoint('?id=eq.' + encodeURIComponent(id)),
      { method: 'DELETE', headers: agRulesHeaders() });
    return res.ok;
  } catch (_e){ return false; }
}

function agEscape(v){
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* A refusal takes over the whole page rather than showing a banner above the
   results. A banner next to real output invites "just ignore the red bit",
   and the entire point of this change is that a mismatch stops the audit
   instead of annotating it. */
function agBlockScreen(message, verdict, accountEmail){
  var existing = document.getElementById('ag-block');
  if (existing) existing.remove();

  var heading = verdict === 'expired' ? 'Your session has expired'
              : verdict === 'unlicensed' ? 'No active licence on this account'
              : verdict === 'unknown' ? 'These documents could not be identified'
              : 'This property is not licensed on this account';

  // Prefer what the server said the account is -- it read that from the
  // verified token. Fall back to the browser's own copy only so the line still
  // appears when the request never reached the server at all (no token, dead
  // network), which are precisely the cases where "who am I signed in as?" is
  // the most useful thing on the screen.
  var email = accountEmail || agAccountEmail();
  var dash = agDashboardUrl();

  // Shown for every refusal except an expired session, where the account is
  // no longer a meaningful thing to state and the only next step is signing
  // in again.
  var whoRow = (email && verdict !== 'expired')
    ? '<div style="margin:0 0 18px;padding:11px 14px;background:#121524;border:1px solid #262c3d;'
        + 'border-radius:10px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#767d94" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>'
        + '<circle cx="12" cy="7" r="4"/></svg>'
      + '<span style="color:#767d94;font-size:13px;">Signed in as</span>'
      + '<b style="color:#eef0f6;font-size:13px;font-weight:600;word-break:break-all;">'
        + agEscape(email) + '</b>'
    + '</div>'
    : '';

  var el = document.createElement('div');
  el.id = 'ag-block';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(9,11,17,.97);'
    + 'display:flex;align-items:center;justify-content:center;padding:24px;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;'
    + '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);';
  el.innerHTML =
    '<div style="max-width:560px;background:#161926;border:1px solid #5c2b30;border-radius:16px;'
      + 'padding:32px 32px 28px;box-shadow:0 24px 70px -20px rgba(0,0,0,.85);text-align:left;">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">'
      + '<div style="flex:0 0 auto;width:38px;height:38px;border-radius:10px;background:#2c1a1e;'
        + 'border:1px solid #5c2b30;display:flex;align-items:center;justify-content:center;">'
        + '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ff8080" stroke-width="2.2" '
        + 'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/>'
        + '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      + '</div>'
      + '<h2 style="margin:0;font-size:19px;color:#eef0f6;font-weight:700;letter-spacing:-.01em;">'
        + agEscape(heading) + '</h2>'
    + '</div>'
    + whoRow
    + '<p style="margin:0 0 22px;color:#a7adc0;font-size:14.5px;line-height:1.6;white-space:pre-line;">'
      + agEscape(message) + '</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      + '<button type="button" id="ag-block-close" style="background:#171a28;border:1px solid #2a3040;'
        + 'border-radius:9px;padding:11px 20px;font-size:14px;font-weight:600;color:#eef0f6;cursor:pointer;'
        + 'font-family:inherit;">Choose different files</button>'
      + (dash
          ? '<a href="' + agEscape(dash) + '" style="background:transparent;border:1px solid #2a3040;'
            + 'border-radius:9px;padding:11px 20px;font-size:14px;font-weight:600;color:#a7adc0;'
            + 'text-decoration:none;font-family:inherit;">Back to dashboard</a>'
          : '')
    + '</div>'
    + '<p style="margin:18px 0 0;color:#767d94;font-size:12px;line-height:1.5;">'
      + 'Your documents were read on this computer only and were not uploaded. '
      + 'Only the property name was checked against your licence.'
    + '</p>'
    + '</div>';
  document.body.appendChild(el);

  var close = document.getElementById('ag-block-close');
  if (close) close.addEventListener('click', function(){
    // Reload rather than just hiding the overlay: whatever half-built state
    // the run left behind must not be reachable by dismissing a dialog.
    window.location.reload();
  });
}

/* Ask the server whether this audit may proceed.
   Resolves to true only on an explicit yes. */
async function agAuthorizeAudit(tool, detectedName, detectedAddress){
  if (!AG_TOKEN){
    agBlockScreen(
      'This tool was not opened from your dashboard, or the link it was opened with has already '
      + 'been used. Sign in and launch it from your dashboard to audit a property.',
      'expired');
    return false;
  }

  var res, payload;
  try {
    res = await fetch(AG_SUPABASE_URL + '/functions/v1/authorize-audit', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + AG_TOKEN,
        'apikey': AG_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: tool,
        detected_name: detectedName || '',
        detected_address: detectedAddress || '',
      }),
      cache: 'no-store',
    });
  } catch (_e){
    agBlockScreen(
      'Your licence could not be checked just now, so this audit was stopped. '
      + 'Check your internet connection and try again.',
      'unknown');
    return false;
  }

  try { payload = await res.json(); } catch (_e){ payload = null; }

  // Strictly true, not truthy. A string, a 1, an object -- anything other than
  // the boolean the server promised -- is treated as a refusal.
  if (payload && payload.allowed === true){
    /* The property this audit was authorised against, kept for the tool to
       read. It is how the tool knows which property's house rules to load and
       save — the server resolved it from the documents' own identifiers and
       the caller's licence, so the browser never has to guess or be trusted
       about which building it is looking at. */
    AG_PROPERTY = (payload.property && payload.property.id)
      ? { id: payload.property.id, name: payload.property.name || null }
      : null;
    /* Kept so the tool can explain an ABSENT property rather than silently
       dropping features that depend on one. A developer override authorises
       the audit without resolving a property the account owns, and a feature
       that just vanishes in that case looks broken. */
    AG_VERDICT = payload.verdict || null;
    return true;
  }

  agBlockScreen(
    (payload && payload.message)
      ? payload.message
      : 'Your licence could not be confirmed, so this audit was stopped.',
    (payload && payload.verdict) || 'unknown',
    (payload && payload.account_email) || null);
  return false;
}

/* A quiet line under the tool's header naming the account in use.

   The refusal screen explains a wrong login after the fact; this is what stops
   the wrong login happening in the first place. It costs one line of chrome
   and it is the difference between "why is this blocked" and "oh, I'm Janine
   right now". */
function agRenderAccountChip(){
  try {
    if (document.getElementById('ag-account-chip')) return;
    var email = agAccountEmail();
    if (!email) return;
    var header = document.querySelector('header.page');
    if (!header || !header.parentNode) return;

    var dash = agDashboardUrl();
    var chip = document.createElement('div');
    chip.id = 'ag-account-chip';
    chip.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
      + 'margin:-4px 0 20px;font-size:12.5px;color:#767d94;';
    chip.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto;">'
        + '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      + '<span>Signed in as <b style="color:#a7adc0;font-weight:600;">' + agEscape(email) + '</b></span>'
      + (dash
          ? '<a href="' + agEscape(dash) + '" style="color:#767d94;text-decoration:underline;'
            + 'text-underline-offset:2px;">Switch account</a>'
          : '');
    header.parentNode.insertBefore(chip, header.nextSibling);
  } catch (_e){ /* chrome only -- never let this stop a tool loading */ }
}

if (typeof document !== 'undefined'){
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', agRenderAccountChip);
  } else {
    agRenderAccountChip();
  }
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { agAuthorizeAudit, agBlockScreen, agEscape,
                     agAccountEmail, agDashboardUrl, agRenderAccountChip,
                     agLoadRules, agSaveRule, agDeleteRule };
}
