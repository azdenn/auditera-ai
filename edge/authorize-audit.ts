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

function messageFor(verdict: string, licensed: Prop[], detectedName: string, detectedAddress: string){
  const names = licensed.map((p) => p.name).filter(Boolean);
  const list = names.length ? names.map((n) => '“' + n + '”').join(' and ') : 'no properties';

  if (verdict === 'unlicensed'){
    return 'This account has no active property licence, so documents cannot be audited. '
      + 'If your free month has ended, add a payment method from your dashboard to carry on.';
  }
  if (verdict === 'blocked'){
    const what = detectedName
      ? '“' + detectedName + '”'
      : (detectedAddress ? detectedAddress : 'a different property');
    return 'These documents are for ' + what + ', which this account is not licensed for. '
      + 'This account is licensed for ' + list + '. '
      + 'Each property is licensed separately — add this one to your subscription to audit it.';
  }
  if (verdict === 'unknown'){
    return 'These documents do not identify which property they belong to, so they cannot be '
      + 'checked against your licence. A full ResMan rent roll names the property in its header — '
      + 'if you exported a summary, or the file is a scan with no readable text, re-export it and try again.';
  }
  return '';
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

    const outcome = entitled === true
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
      allowed: outcome.verdict === 'allowed',
      verdict: outcome.verdict,
      property: outcome.property ? { name: outcome.property.name } : null,
      via: outcome.via,
      message: messageFor(outcome.verdict, licensed, detectedName, detectedAddress),
    });
  } catch (_err){
    return json({ allowed: false, verdict: 'unknown',
      message: 'Your licence could not be checked just now, so this audit was stopped. '
             + 'Check your connection and try again.' }, 503);
  }
});
