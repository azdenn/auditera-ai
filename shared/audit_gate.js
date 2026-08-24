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

function agEscape(v){
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* A refusal takes over the whole page rather than showing a banner above the
   results. A banner next to real output invites "just ignore the red bit",
   and the entire point of this change is that a mismatch stops the audit
   instead of annotating it. */
function agBlockScreen(message, verdict){
  var existing = document.getElementById('ag-block');
  if (existing) existing.remove();

  var heading = verdict === 'expired' ? 'Your session has expired'
              : verdict === 'unlicensed' ? 'No active licence on this account'
              : verdict === 'unknown' ? 'These documents could not be identified'
              : 'This property is not licensed on your account';

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
    + '<p style="margin:0 0 22px;color:#a7adc0;font-size:14.5px;line-height:1.6;">'
      + agEscape(message) + '</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      + '<button type="button" id="ag-block-close" style="background:#171a28;border:1px solid #2a3040;'
        + 'border-radius:9px;padding:11px 20px;font-size:14px;font-weight:600;color:#eef0f6;cursor:pointer;'
        + 'font-family:inherit;">Choose different files</button>'
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
  if (payload && payload.allowed === true) return true;

  agBlockScreen(
    (payload && payload.message)
      ? payload.message
      : 'Your licence could not be confirmed, so this audit was stopped.',
    (payload && payload.verdict) || 'unknown');
  return false;
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { agAuthorizeAudit, agBlockScreen, agEscape };
}
