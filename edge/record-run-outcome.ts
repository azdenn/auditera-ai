// How a run actually ended.
//
// WHY THIS IS A SECOND CALL AND NOT PART OF authorize-audit
// The licence check happens BEFORE the audit runs, so at that moment nothing
// is known about how long it took, how many units were in it, or whether it
// finished at all. Those facts only exist afterwards.
//
// WHY IT FINDS THE ROW ITSELF INSTEAD OF BEING HANDED AN ID
// The first version had authorize-audit return the row id it had just written,
// and the browser passed it back here. That is the more precise design and it
// was reverted, on purpose: shipping it meant REDEPLOYING THE LICENCE GATE to
// add an analytics feature, and the gate is the one piece of this system that
// must never break. Trading a small risk of breaking the thing that protects
// the product for a small gain in the accuracy of a usage statistic is a bad
// trade at any level of care.
//
// So this finds the caller's OWN most recent run of that tool which has not
// been finished yet. Two tabs open on the same tool could attribute a duration
// to the wrong one of the two. That is the entire downside, it is a
// mislabelled statistic rather than a wrong decision about anyone's licence,
// and nothing here can affect what a person is allowed to audit.
//
// WHAT THIS ACCEPTS, AND WHAT IT MUST NEVER ACCEPT
// A tool name and four facts about SHAPE: milliseconds, a count of units, a
// count of findings, and one of two status words. That is the entire payload.
//
// It must NEVER accept -- and there must never be a "just a bit more context"
// exception for -- charge labels, amounts, resident names, unit numbers, or
// any text off a lease or rent roll. Those never leave the browser, and that
// promise is the reason property managers are willing to use this at all.
// Analytics is the classic place where such a promise gets quietly broken, so
// the shape of this function is deliberately too narrow to break it: every
// field below is coerced to a number or to one of two literal strings, and
// anything else in the body is ignored rather than stored.
//
// AUTHORISATION
// The row is located from the caller's OWN user and account, taken off their
// verified JWT and never from the request body, so there is no input that can
// name someone else's run. A row that already has an outcome is never
// rewritten -- a completed run does not become a failed one later.
//
// verify_jwt is false so the CORS preflight survives; authentication is the
// getUser() check below. Same reasoning as authorize-audit and create-checkout.

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

// A count that is missing, negative, absurd or not a number at all becomes
// null rather than a stored lie. Ceilings are generous but finite: nothing
// legitimate has four million units, and an unbounded integer from a browser
// is an invitation.
function count(v: unknown, max: number): number | null {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  // Nothing here is worth failing a user's audit over. Every error path returns
  // a plain ok:false and the tool ignores it -- a run whose statistics were not
  // recorded is a run that still worked, and this must never be able to turn a
  // finished audit into an error message on someone's screen.
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ ok: false }, 401);

    let body: any = {};
    try { body = await req.json(); } catch (_e){ body = {}; }

    const tool = String(body.tool ?? '');
    if (!['leaseverify','concessionverify','depositverify'].includes(tool)){
      return json({ ok: false, error: 'Unknown tool' }, 400);
    }

    const outcome = body.outcome === 'error' ? 'error'
                  : body.outcome === 'completed' ? 'completed'
                  : null;
    if (!outcome) return json({ ok: false, error: 'Bad outcome' }, 400);

    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await asUser.auth.getUser();
    if (userErr || !user) return json({ ok: false }, 401);

    const { data: sub } = await asUser
      .from('subscriptions').select('account_id').eq('user_id', user.id).maybeSingle();
    const accountId = sub?.account_id ?? null;
    if (!accountId) return json({ ok: false }, 403);

    // Service role to write, because customers deliberately cannot write to
    // audit_runs -- a record the audited party can edit is not a record. The
    // WHERE clause is what makes that safe: the row must already belong to
    // this caller's account, and must not already have been finished.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // The caller's own most recent unfinished run of this tool. Scoped to
    // their user AND their account, so no reachable input names anyone else's
    // row. Older than six hours is not this run -- better to leave a stale row
    // unfinished, which is itself a truthful record of a run that never
    // reported back, than to attribute today's numbers to last week.
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: candidate } = await admin
      .from('audit_runs')
      .select('id')
      .eq('user_id', user.id)
      .eq('account_id', accountId)
      .eq('tool', tool)
      .is('outcome', null)
      .gte('created_at', sixHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candidate) return json({ ok: false, error: 'No open run' }, 404);

    const { data, error } = await admin
      .from('audit_runs')
      .update({
        outcome,
        duration_ms:   count(body.duration_ms,   1000 * 60 * 60 * 6),
        unit_count:    count(body.unit_count,    100000),
        finding_count: count(body.finding_count, 1000000),
        finished_at:   new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .is('outcome', null)
      .select('id')
      .maybeSingle();

    if (error) return json({ ok: false }, 500);
    return json({ ok: !!data });
  } catch (_err){
    return json({ ok: false }, 500);
  }
});
