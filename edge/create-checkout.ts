// Creates a Stripe Checkout Session for the signed-in account.
//
// This runs server-side for one reason: it holds the Stripe secret key and the
// Supabase service role key, neither of which may ever reach a browser or the
// Cloudflare Worker. The browser calls this, gets back a URL, and redirects.
//
// It deliberately does NOT trust anything the caller sends about price,
// quantity or which account to bill. All of that is derived from the caller's
// own JWT and the database, because a client that can name its own price can
// buy ten properties for a dollar.
//
// DEPLOYED WITH verify_jwt: false -- ON PURPOSE, and it is not a weakening.
// The browser sends a cross-origin POST carrying Authorization + apikey, which
// makes it a *preflighted* request: the browser first sends OPTIONS with NO
// Authorization header (it strips it by spec). With verify_jwt: true the
// platform gateway rejected that preflight before this code ever ran, the
// browser then refused to send the real POST, and the page could only report
// "could not reach the server". Authentication is instead done below, in this
// function, on every non-OPTIONS request -- see the getUser() check, which is
// the real boundary. Do not "restore" verify_jwt without also proving the
// preflight still succeeds.

import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// supabase-js adds x-client-info; the browser adds apikey and content-type.
// Every one of them has to be named here or the preflight fails and the real
// request is never sent.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200){
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Where to send the customer after Stripe. Taken from the Origin the request
// actually came from, so a preview deployment returns to that preview rather
// than bouncing the user to production mid-checkout -- but only for origins we
// recognise, so this can never be turned into an open redirect.
function siteUrlFor(req: Request): string {
  const fallback = Deno.env.get('SITE_URL') ?? 'https://auditera.azden-kumar.workers.dev';
  const origin = req.headers.get('Origin') ?? '';
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return fallback;
    if (u.hostname.endsWith('.workers.dev') || u.hostname === 'texoplex.com'
        || u.hostname.endsWith('.texoplex.com')){
      return u.origin;
    }
  } catch (_e){ /* no or malformed Origin -- use the configured default */ }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const STRIPE_PRICE_ID   = Deno.env.get('STRIPE_PRICE_ID');
  // Fail loudly and closed rather than half-creating a broken session.
  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID){
    return json({ error: 'Billing is not configured yet.' }, 503);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in.' }, 401);

  // Who is calling? Answered by Supabase from the token, never by the request
  // body. This is the authentication boundary for this function.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: 'Not signed in.' }, 401);

  // Row level security scopes both of these to the caller's own account.
  const { data: sub } = await asUser
    .from('subscriptions').select('account_id').eq('user_id', user.id).maybeSingle();
  if (!sub?.account_id) return json({ error: 'No account found for this login.' }, 400);

  const { data: props } = await asUser
    .from('properties').select('id, name, status');
  const toBill = (props ?? []).filter((p: any) => p.status !== 'active' && p.status !== 'cancelled');
  if (!toBill.length) return json({ error: 'Everything on this account is already paid for.' }, 400);

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });

  // Writing the customer id back needs elevated rights: customers are
  // deliberately unable to set it themselves, since a client that could would
  // be able to attach itself to somebody else's subscription.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: account } = await admin
    .from('accounts').select('id, name, stripe_customer_id').eq('id', sub.account_id).maybeSingle();

  let customerId = account?.stripe_customer_id ?? null;
  if (!customerId){
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: account?.name ?? undefined,
      metadata: { account_id: sub.account_id },
    });
    customerId = customer.id;
    await admin.from('accounts')
      .update({ stripe_customer_id: customerId, billing_email: user.email })
      .eq('id', sub.account_id);
  }

  const SITE_URL = siteUrlFor(req);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    // Quantity comes from the database, not the request. One line item, one
    // price, N properties -- so the bill always matches what they actually hold.
    line_items: [{ price: STRIPE_PRICE_ID, quantity: toBill.length }],
    // The trial already ran in our own database, so Stripe bills immediately.
    // Anything else would hand out a second free month on every checkout.
    subscription_data: { metadata: { account_id: sub.account_id } },
    // Needed by the webhook to know who paid, on the one event that does not
    // carry the subscription metadata.
    metadata: { account_id: sub.account_id },
    allow_promotion_codes: true,
    success_url: `${SITE_URL}/app.html?checkout=success`,
    cancel_url: `${SITE_URL}/app.html?checkout=cancelled`,
  });

  return json({ url: session.url });
});
