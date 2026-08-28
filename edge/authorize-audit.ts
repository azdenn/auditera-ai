// Decides whether this account may audit the property its uploaded documents
// belong to -- and records that it asked.
//
// WHY THIS IS SERVER-SIDE NOW
// The tools used to be handed their licence list in the URL hash. Anyone could
// edit that hash and audit anything. The decision now happens here, from the
// caller's own JWT and the database, and the tool refuses to render results
// without a "yes" from this function.
//
// WHAT THIS RECEIVES, AND WHAT IT MUST NEVER RECEIVE
// It receives property IDENTIFIERS ONLY: a property name and a street address,
// pulled by the tool out of the documents. It must NEVER be sent document
// text, resident names, rents, or anything else off a lease, rent roll or
// ledger. Those never leave the browser and that promise is the reason
// property managers are willing to use this at all. If a future change needs
// "just a bit more context", the answer is no -- match on identifiers or
// don't match.
//
// WHAT THIS CAN AND CANNOT DO
// It stops the realistic sharing case completely: someone handed a password
// uploads their own property's exports, those name a different property, and
// they are refused. It cannot stop someone who patches the tool's JavaScript
// to lie about what the documents said -- nothing running in a browser can,
// because the documents are supplied by the person being checked. That is why
// every call is logged: a patched client can lie about the property, but it
// cannot make the attempt invisible, and an account auditing six properties
// is plain to see.
//
// verify_jwt is false so the CORS preflight survives; authentication is the
// getUser() check below. Same reasoning as create-checkout.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200){
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/* ---------------------------------------------------------------------------
   Developer accounts.

   These accounts may audit ANY property's documents, licensed or not, so that
   the people who build, test and demo this product are not locked out of it by
   their own gate.

   WHY THIS IS SAFE, AND WHY IT LIVES HERE AND NOWHERE ELSE
   This is a SERVER-side allow-list, consulted only after the caller's JWT has
   been verified. Nothing in the browser knows it exists, nothing in the browser
   can opt into it, and no amount of patching the tool's JavaScript can put an
   account onto it. That is the whole difference between this and the "skip the
   check while testing" flag this project has always refused to ship: that would
   have been a switch handed to anyone who opened devtools, whereas this is a
   fact about two specific rows in auth.users.

   KEYED ON USER ID, NOT EMAIL, ON PURPOSE
   A signed-in user can change their own email address. Nobody can change their
   user id. An email-keyed list would be one account-takeover away from being a
   licence to audit anything, and it would silently transfer if an address were
   ever recycled. Ids are immutable and unguessable, so they are what this
   matches on. The addresses are comments -- they carry no authority.

   Dev runs are still logged, with verdict 'dev', so the audit trail stays
   honest: they appear as what they are, and never inflate the 'allowed' count
   that the anti-sharing review depends on.
   ------------------------------------------------------------------------- */

const DEV_USER_IDS = new Set<string>([
  'feb96d01-e806-4233-b814-1798ffc259fb', // azden.kumar@gmail.com
  '4fdbb62b-2773-4288-832f-6461f17ecdb3', // rkjeev69@gmail.com
]);

/* ---------------------------------------------------------------------------
   Matching. Kept character-for-character in step with shared/property_guard.js
   so the instant in-browser hint and this authoritative answer can never
   disagree with each other. If you change one, change both.
   ------------------------------------------------------------------------- */

function pgNormalizeName(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(apartments?|apts?|the|at|of|llc|lp|ltd|inc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PG_STREET_WORDS: Record<string, string> = {
  avenue:'ave', av:'ave', street:'st', road:'rd', drive:'dr', circle:'cir',
  lane:'ln', boulevard:'blvd', court:'ct', place:'pl', parkway:'pkwy',
  highway:'hwy', terrace:'ter', trail:'trl', north:'n', south:'s',
  east:'e', west:'w',
};

function pgNormalizeAddress(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => PG_STREET_WORDS[w] || w)
    .join(' ');
}

// House number + first street word: "525 jones". Short enough to survive PDF
// line wrapping, specific enough to identify a building.
function pgAddressKey(address: unknown): string | null {
  const m = /(\d{1,6})\s+([a-z]+)/.exec(pgNormalizeAddress(address));
  return m ? (m[1] + ' ' + m[2]) : null;
}

type Prop = { id: string; name: string; address: string | null; status: string };

// Names must match EXACTLY once normalised -- no substring matching. It is
// tempting to allow "Blanco Oaks" to match "Blanco Oaks Estates", but those
// are two different buildings, and a rule that lets one pass for the other is
// a rule that licences the wrong property. Normalisation already absorbs the
// differences that actually occur (case, punctuation, "Apartments"/"Apts").
function decide(detectedName: unknown, detectedAddress: unknown, licensed: Prop[]) {
  if (!licensed.length) return { verdict: 'unlicensed' as const, property: null, via: null };

  const dn = pgNormalizeName(detectedName);
  if (dn){
    for (const p of licensed){
      if (dn === pgNormalizeName(p.name)) {
        return { verdict: 'allowed' as const, property: p, via: 'name' as const };
      }
    }
  }

  const dkey = pgAddressKey(detectedAddress);
  if (dkey){
    for (const p of licensed){
      if (dkey === pgAddressKey(p.address)) {
        return { verdict: 'allowed' as const, property: p, via: 'address' as const };
      }
    }
  }

  // Something identifiable was found and it matched nothing licensed. That is
  // a decision, not an absence of one.
  if (dn || dkey) return { verdict: 'blocked' as const, property: null, via: null };

  // Nothing identifiable at all -- a scanned lease with no extractable text,
  // say. Callers still refuse, but the wording differs because the fix is
  // different.
  return { verdict: 'unknown' as const, property: null, via: null };
}

/* WHY THE ACCOUNT IS NAMED IN EVERY REFUSAL
   These messages used to say "this account is not licensed for that property"
   without ever saying which account "this" was. Anyone who manages properties
   for more than one owner holds more than one login, and the first real
   report of "the licence check is broken" was exactly that: the right gate,
   the right verdict, the wrong login — and nothing on screen to reveal it.
   A refusal that does not identify the account is a refusal that cannot be
   acted on, so the email goes in the message and the "wrong login" case is
   named explicitly as the first thing to check. */
function messageFor(
  verdict: string, licensed: Prop[], detectedName: string, detectedAddress: string,
  email: string | null,
){
  const list = listNames(licensed.map((p) => p.name).filter(Boolean));
  const who = email ? 'The account you are signed in to (' + email + ')' : 'This account';

  if (verdict === 'unlicensed'){
    return who + ' has no active property licence, so documents cannot be audited.\n\n'
      + 'If you have more than one login, check you are signed in to the right one. '
      + 'If your free month has ended, add a payment method from your dashboard to carry on.';
  }
  if (verdict === 'blocked'){
    const what = detectedName
      ? '“' + detectedName + '”'
      : (detectedAddress ? detectedAddress : 'a different property');
    return 'These documents are for ' + what + '.\n\n'
      + who + ' is licensed for ' + list + ' — not this property.\n\n'
      + 'If this property sits on another one of your logins, sign out and sign back in as that one. '
      + 'Otherwise each property is licensed separately, so add this one to your subscription to audit it.';
  }
  if (verdict === 'unknown'){
    return 'These documents do not identify which property they belong to, so they cannot be '
      + 'checked against your licence.\n\n'
      + 'A full ResMan rent roll names the property in its header — if you exported a summary, '
      + 'or the file is a scan with no readable text, re-export it and try again.';
  }
  return '';
}

/* "A", "A and B", "A, B and C". Joining four property names with "and" three
   times over reads like a ransom note, and four is an ordinary number for one
   manager to hold.

   Deliberately declared BELOW messageFor. test_authorize_logic.cjs lifts the
   matching rules out of this file by slicing from pgNormalizeName to
   messageFor and running them in plain Node; anything that lands inside that
   slice has to survive its TypeScript stripper. Keeping message formatting
   outside the slice keeps that extraction honest about what it is testing. */
function listNames(names: string[]): string {
  const q = names.map((n) => '“' + n + '”');
  if (!q.length) return 'no properties';
  if (q.length === 1) return q[0];
  return q.slice(0, -1).join(', ') + ' and ' + q[q.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ allowed: false, error: 'Method not allowed' }, 405);

  // Every failure path below returns allowed:false. This gate exists to refuse,
  // so anything unexpected must land on "no".
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')){
      return json({ allowed: false, verdict: 'expired',
        message: 'Your session has expired. Reopen this tool from your dashboard to carry on.' }, 401);
    }

    let body: any = {};
    try { body = await req.json(); } catch (_e){ body = {}; }

    const tool = String(body.tool ?? '');
    if (!['leaseverify','concessionverify','depositverify'].includes(tool)){
      return json({ allowed: false, error: 'Unknown tool.' }, 400);
    }
    // Truncated on arrival. These are identifiers; anything longer is either a
    // bug or an attempt to use this log as storage.
    const detectedName    = String(body.detected_name ?? '').slice(0, 200).trim();
    const detectedAddress = String(body.detected_address ?? '').slice(0, 300).trim();

    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await asUser.auth.getUser();
    if (userErr || !user){
      return json({ allowed: false, verdict: 'expired',
        message: 'Your session has expired. Reopen this tool from your dashboard to carry on.' }, 401);
    }

    // "Licensed" is defined once, in the database, and both the download gate
    // and billing already defer to it. Asking it here too means this cannot
    // drift into letting an expired trial keep auditing.
    const { data: entitled } = await asUser.rpc('has_active_licence');
    const { data: sub } = await asUser
      .from('subscriptions').select('account_id').eq('user_id', user.id).maybeSingle();
    const accountId = sub?.account_id ?? null;

    const { data: rawProps } = await asUser
      .from('properties').select('id, name, address, status, trial_ends_at');

    // Only properties that are actually paid up (or still inside their trial)
    // count. A past_due or suspended property is not a licence.
    const now = Date.now();
    const licensed: Prop[] = (rawProps ?? []).filter((p: any) => {
      if (p.status === 'active') return true;
      if (p.status === 'trialing'){
        return p.trial_ends_at ? new Date(p.trial_ends_at).getTime() > now : false;
      }
      return false;
    });

    // A developer account skips the property match entirely -- deliberately
    // ahead of the entitlement check too, so a lapsed trial on a dev's own
    // account cannot lock the people who maintain this out of their own tools.
    //
    // It still RESOLVES the property when one matches, though the verdict
    // stays 'dev'. Without that, a maintainer auditing their own building had
    // no property id, so the tool could not load or save that property's house
    // rules -- the two accounts most likely to be testing them were the only
    // two that could not use them.
    const devMatch = DEV_USER_IDS.has(user.id)
      ? decide(detectedName, detectedAddress, licensed)
      : null;

    const outcome = DEV_USER_IDS.has(user.id)
      ? { verdict: 'dev' as const,
          property: devMatch && devMatch.verdict === 'allowed' ? devMatch.property : null,
          via: 'dev' as const }
      : entitled === true
        ? decide(detectedName, detectedAddress, licensed)
        : { verdict: 'unlicensed' as const, property: null, via: null };

    // Log it. Uses the service role because customers deliberately cannot write
    // here -- an audit trail the audited party can edit is not an audit trail.
    // A logging failure must not turn a refusal into a pass, so this is wrapped
    // and the decision stands either way.
    if (accountId){
      try {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await admin.from('audit_runs').insert({
          account_id: accountId,
          user_id: user.id,
          tool,
          detected_name: detectedName || null,
          // The key, not the address: enough to tell two buildings apart,
          // without keeping a street address we have no need for.
          detected_address_key: pgAddressKey(detectedAddress),
          matched_property_id: outcome.property?.id ?? null,
          verdict: outcome.verdict,
          via: outcome.via,
        });
      } catch (_e){ /* decision already made; logging is not the gate */ }
    }

    return json({
      // Two verdicts open the gate: a real licence match, and a developer
      // override. Everything else -- including anything unforeseen -- is a no.
      allowed: outcome.verdict === 'allowed' || outcome.verdict === 'dev',
      verdict: outcome.verdict,
      // The id is what lets the tool load and save this property's house
      // rules. It identifies a row the caller already owns and grants
      // nothing -- every read and write of those rules is gated by the same
      // row-level policies as the properties table itself.
      property: outcome.property ? { id: outcome.property.id, name: outcome.property.name } : null,
      via: outcome.via,
      // Told back to the caller so a refusal can name the account on screen.
      // This is the address on the token the caller already holds -- it
      // discloses nothing they did not send us, and it authorises nothing.
      account_email: user.email ?? null,
      message: messageFor(outcome.verdict, licensed, detectedName, detectedAddress, user.email ?? null),
    });
  } catch (_err){
    return json({ allowed: false, verdict: 'unknown',
      message: 'Your licence could not be checked just now, so this audit was stopped. '
             + 'Check your connection and try again.' }, 503);
  }
});
