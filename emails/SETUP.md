# Email setup — three things, in order

Everything here is in the Supabase dashboard. None of it is reachable from any
tool Claude has, so these are yours to do. They are quick.

Project: **kyfvrkghqohkhwidqwst**

---

## 1. Fix the reset link landing on the old site — DO THIS FIRST

**What's happening.** When the app asks Supabase to send a reset link, it says
"send them back to `<this site>/app.html?mode=reset` afterwards". Supabase only
honours that if the address is on its allow-list. It isn't, so Supabase throws
it away and falls back to the **Site URL** in your settings — which still
points at the old build. That is the entire bug. Nothing is wrong with the
link, the email, or the reset code.

**Go to:** Authentication → **URL Configuration**

**Site URL** — set to:

```
https://auditera.azden-kumar.workers.dev
```

**Redirect URLs** — add all three:

```
https://auditera.azden-kumar.workers.dev/**
https://*.auditera.azden-kumar.workers.dev/**
https://*.workers.dev/**
```

The second and third cover Cloudflare's preview builds — the
`ea925c68-auditera...` style addresses. Without them, resetting from a preview
deployment bounces you to production, which is a confusing way to lose an hour.

Save, then request a fresh reset link. **The old email will still go to the old
site** — the destination is baked in when the mail is sent, so links you
already have are stale. Send yourself a new one.

> When texoplex.com (or an Auditera domain) goes live, come back and add it
> here too, or reset silently breaks again.

---

## 2. Use the proper emails

**Go to:** Authentication → **Emails** (older dashboards: Email Templates)

| Template | File to paste |
|---|---|
| Reset Password | `reset_password.html` |
| Confirm signup | `confirm_signup.html` |

Open the file, copy the whole thing, paste it over the message body, save.

Also set the **subject lines**:

- Reset Password → `Reset your Auditera AI password`
- Confirm signup → `Confirm your email address`

Both templates use `{{ .ConfirmationURL }}` and `{{ .Email }}`, which Supabase
fills in. Don't rename those.

**Why they look plain.** Email clients are not browsers — Outlook renders with
Word's engine and Gmail strips stylesheets — so these are old-fashioned tables
with inline styles. That's deliberate; it renders correctly everywhere. They're
also light rather than matching the dark site: dark HTML email renders badly in
many clients and is a known spam signal, and an email from an unfamiliar sender
needs every advantage it can get at reaching an inbox.

---

## 3. Send from your own address

Right now Supabase sends from its own shared address. Two reasons to change it
beyond looking unprofessional:

- **It's rate-limited to a handful of emails per hour.** Fine for testing, not
  for customers.
- Shared sender reputation means more spam-foldering.

### First: decide the domain

You own `texoplex.com`, and the product is called Auditera AI. Sending password
resets for "Auditera AI" from `@texoplex.com` looks wrong to a recipient and
looks like phishing to a spam filter — sender and brand should match.

Cleanest is an Auditera domain (`auditera.ai`, `auditeraai.com`, whatever's
available) used for both the site and email. Worth settling before you print it
on anything.

### Then: connect a real sender

**Resend** is the easiest fit — free for 3,000 emails/month, which is far more
than you'll send, and its setup walks you through the DNS records.

1. Sign up at resend.com, add your domain.
2. It gives you DNS records (SPF, DKIM, and usually DMARC). Add them wherever
   the domain's DNS lives — Cloudflare, if that's where it is.
3. Wait for verification. Usually minutes.
4. Create an API key.
5. In Supabase: **Project Settings → Authentication → SMTP Settings**, enable
   custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key
   - Sender email: `noreply@yourdomain`
   - Sender name: `Auditera AI`

**Do not skip the DNS records.** Without SPF and DKIM, mail from a new domain
goes straight to spam, and a password reset that lands in spam is
indistinguishable from a broken product.

Send yourself a reset afterwards and confirm it arrives in the inbox, not spam.

---

## Why this is worth doing properly

A customer who cannot get back into their account and cannot find the reset
email will assume the product is broken and will not write in to say so. This
is the least glamorous part of the system and one of the few that can silently
lose you a paying customer.
