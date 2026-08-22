# Your real accounts (Supabase) — status & how to manage them

**This is already set up and live** — connected directly to your "LeaseProof" Supabase project, project ref `kyfvrkghqohkhwidqwst`. You don't need to do the setup steps below; they're kept here just as a record of what was configured, in case you ever need to recreate it (a new environment, a second property brand, etc).

## What's live right now

A table called `subscriptions` in your Supabase project, one row per customer account:

```sql
create table subscriptions (
  user_id uuid references auth.users(id) primary key,
  username text not null unique,
  contact_email text,          -- nullable: not known when the login is created
  property_name text,          -- nullable: "(not set)" until you license them
  created_at timestamptz default now()
);

alter table subscriptions enable row level security;

-- A signed-in user can see their own row, and only their own row.
create policy "Users can view own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own subscription"
  on subscriptions for insert
  with check (auth.uid() = user_id);

-- The property can be claimed exactly ONCE by the account itself (at signup).
-- The `property_name is null` condition is what makes it one-time: after it's
-- set, the row is read-only to its owner again, so nobody can quietly
-- relicense themselves to a different property later. You can still change it
-- from the SQL Editor / Table Editor.
create policy "Users can claim their property once"
  on subscriptions for update to authenticated
  using (auth.uid() = user_id and property_name is null)
  with check (auth.uid() = user_id);
```

Every login automatically gets its `subscriptions` row from a trigger, so an
account can never again exist without one:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
```

- `username` — what the customer types to log in (e.g. `Texoplex`).
- `contact_email` — their real email, kept only for you to reach them / reset a password. Never used to log in.
- `property_name` — the one property their subscription covers.

The homepage's sign-in code and the reconciler tool's property-match check are both already wired to this table — nothing left to configure.

## Why usernames instead of email logins

Supabase's login system needs something shaped like an email internally — that part can't change. So a customer's typed username (e.g. `Texoplex`) gets silently converted to a fake, never-used address like `texoplex@leaseproof-login.test` before it's sent to Supabase. The customer never sees this. Their real email is stored separately in `contact_email` and has nothing to do with logging in.

One consequence: Supabase's built-in "forgot password" flow can't reach that fake address, so self-service password reset doesn't work. If a customer forgets their password, reset it yourself: **Authentication → Users** in the dashboard, find them, use the "..." menu to send a reset or set a new password directly.

## Adding a customer account yourself

Until self-serve signup on the homepage has been tested live (it should work, but this sandbox can't verify it end-to-end — see the note at the bottom), the reliable way to add someone is directly in the dashboard:

1. **Authentication → Users → Add user → Create new user.**
2. **Email:** take their chosen username, lowercase it, and replace anything that isn't a letter or number with a dash, then add `@leaseproof-login.test`. Example: username `Texoplex` → `texoplex@leaseproof-login.test`.
3. **Password:** whatever you're giving them.
4. Check **Auto Confirm User**.
5. Click Create.
6. **Nothing else to do.** The account's `subscriptions` row is created
   automatically by a database trigger the moment the login is created, with
   the username taken from the login address. This used to be a separate,
   easily-forgotten SQL step, and forgetting it is what left both of the first
   two accounts with no row at all (see "If an account shows (not set)" below).

Setting or changing their licensed property afterwards:

```sql
update subscriptions set property_name = '<Property Name>', contact_email = '<their real email>'
where username = '<username>';
```

## If an account shows "(not set)" for its property

That means the login exists but has no property licence attached. The account
still works and the tools still open; the only thing missing is the warning
when someone uploads a rent roll for a property they aren't licensed for.

Set it with the `update` above. You can see every account and its licence at a
glance with:

```sql
select s.username, s.property_name, u.last_sign_in_at
from subscriptions s join auth.users u on u.id = s.user_id
order by u.created_at;
```

## If someone suddenly can't sign in

Check `updated_at` on their row in **Authentication → Users**. If it changed
recently and `last_sign_in_at` hasn't moved since, their password was almost
certainly changed — usually by accident while editing users. Fix: "..." menu →
reset or set a new password. You do not need to create them a new account.

## Checking on things / catching abuse

- **Table Editor → subscriptions** is your customer list: every account and the one property it's bound to.
- **Authentication → Users** shows every login and last-sign-in time.
- The property-match warning a customer sees in the reconciler tool (if their rent roll doesn't match their licensed property) is only shown to them, in their browser — it isn't logged anywhere you can see today. If you want an actual record of mismatches you can review, that's a small additional feature (sends just the detected property name — never documents — back to Supabase each time someone processes a rent roll).

## One thing worth doing once you have a minute

**Authentication → Providers → Email → "Confirm email"** — recommend turning this off so new accounts work immediately rather than needing an (unreachable, fake) confirmation email. The code already handles either setting correctly, so this isn't urgent, just simpler.

## What's still manual

- **Payment**: nothing here checks whether someone's paid. For now that means either you create accounts yourself after collecting payment (the flow above), or open up the self-serve "Set up your property" form and treat it as trust-based. A Stripe integration to automate that is a separate, future piece of work.
- **Setting or changing a customer's licensed property**: the `update` shown above, or edit their row in Table Editor → subscriptions directly.
- **End-to-end live testing**: everything on the database side (table, security rules, keys) has been directly verified from here. The actual browser login flow hasn't been tested against the live project from this environment, since this sandbox's network can't reach Supabase's API. Worth doing one real signup/login test yourself before relying on it.
