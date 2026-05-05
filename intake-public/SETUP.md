# Setup — Public "Talk to Brad" Intake

> What Brad needs to do once before this goes live. ~20 minutes total.

## 1. Run the Supabase migration

The intake reads/writes two new tables (`public_intake_responses`, `public_intake_attempts`) plus a view (`public_intake_summary`). Run the migration against the same Supabase project that Rick's intake uses:

```bash
node --env-file=.env scripts/run-migration.mjs supabase/migrations/2026-05-05_public_intake.sql
```

Required env vars (already set up for Rick — same ones):
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

After it runs, sanity-check in Supabase Studio that the two tables exist with RLS enabled.

## 2. Cloudflare Turnstile — OPTIONAL, skip for v1

Turnstile is a free invisible CAPTCHA that blocks bots at the entry form. **You don't need it for v1.** The other four spam layers (magic-link confirmation, per-IP rate limit, disposable-email blocklist, in-conversation AI judgment) cover real-world spam fine on their own.

The one thing Turnstile uniquely protects: **Anthropic API spend.** Without it, a bot could pass the entry form and start a chat that costs ~$0.05 in tokens before getting blocked at the magic-link step. Per-IP rate limiting caps this to 3 burned chats per IP per day. Only matters if you start seeing botnet attacks (you won't, at low traffic).

**The code is wired up either way.** With no `TURNSTILE_SECRET_KEY` set, verification is silently bypassed and the site key placeholder in the HTML triggers a small "(Turnstile not configured)" note in dev only — production visitors see nothing.

### To turn it on later (when/if you need it):

1. Sign in at https://dash.cloudflare.com → **Turnstile** in the left sidebar
2. Click **Add site** → **Site name:** `driveclearpath.com` → **Domain:** add your domains → **Widget mode:** Managed → **Pre-clearance:** off → **Create**
3. You get a **site key** (public) + **secret key** (private)
4. Paste the site key into [intake-public.html](../intake-public.html) — replace `__TURNSTILE_SITE_KEY__`
5. Add `TURNSTILE_SECRET_KEY` to Netlify env vars

That's it. No code changes needed.

## 3. Set the rest of the env vars in Netlify

These already exist for Rick's intake — confirm they're set, and add the public-specific ones below:

### Already set (from Rick's intake — verify they're there)
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

### New for the public intake
- `PUBLIC_SITE_URL` — `https://driveclearpath.com` (used to build the magic-link absolute URL — required for the click-through to work in production)
- `PUBLIC_INTAKE_FROM` — sender for visitor confirmation email. Default: `Brad at ClearPath <intake@driveclearpath.com>`
- `PUBLIC_INTAKE_NOTIFY_EMAIL` — where Brad receives the post-confirmation handoff. Default falls through to existing `INTAKE_NOTIFY_EMAIL` or `info@driveclearpath.com`
- `TURNSTILE_SECRET_KEY` — *only if you set up Turnstile in step 2 (skip otherwise)*

### Optional / fine to skip
- `PUBLIC_MAX_INTAKE_TURNS` — conversation length cap. Default 30.
- `PUBLIC_INTAKE_MODEL` — Claude model override. Default uses the central `MODELS.OPUS` value.

## 4. Confirm Resend can send from `intake@driveclearpath.com`

The visitor confirmation email is sent from `intake@driveclearpath.com` (override via `PUBLIC_INTAKE_FROM`). For Resend to deliver this, the `driveclearpath.com` domain must be verified in your Resend dashboard with SPF / DKIM / Return-Path records on. If Rick's intake emails are already arriving cleanly, this is already done.

## 5. Smoke test before announcing

Once deployed:

1. Open https://driveclearpath.com/contact.html in an incognito window — confirm you see the AI card and the "or just email me" link.
2. Click **Talk to my AI first** → land on `/intake-public.html`.
3. Fill in name + email (use your real email — you'll need to click the magic link).
4. Solve the Turnstile if it appears.
5. Have a short conversation — say enough to clear the quality gate (business type, what's broken with > 50 chars).
6. Let the AI conclude OR click **End & send**.
7. You should land on the "Check your inbox" page.
8. Open the email Brad-from-AI sent you — click the link.
9. You should land on the "Brad has your notes" page.
10. Check `info@driveclearpath.com` (or wherever `PUBLIC_INTAKE_NOTIFY_EMAIL` points) for the formatted handoff email with the captured answers, flags, and full transcript.

If anything fails at a step, pull the row from Supabase Studio:

```sql
select * from public_intake_summary order by started_at desc limit 5;
```

The `quality_passed` and `quality_reasons` columns explain why an intake didn't notify.

## 6. Future polish (not required for v1)

- Admin review surface (`/admin/intakes`) showing all intakes including quarantined ones — small build, currently you'd query Supabase directly.
- Auto-resend confirmation emails for unclicked links (after 24h) — nice-to-have.
- Per-domain rate limit on top of per-IP — kicks in if a single business email domain hammers the form.
- Slack / SMS notification when a `new_vertical_pattern_fit` flag fires — tells you when an unexpected vertical is knocking.

## File map

```
clearpath-website/
├── contact.html                              ← two-path landing (AI card + email link)
├── intake-public.html                        ← AI conversation page
├── css/intake-public.css
├── js/intake-public.js
├── supabase/migrations/
│   └── 2026-05-05_public_intake.sql          ← run this once
├── netlify/functions/
│   ├── public-validate-entry.js              ← spam gauntlet + session creation
│   ├── public-chat-turn.js                   ← Claude conversation handler
│   ├── public-submit-intake.js               ← manual end + beacon submit
│   ├── confirm-intake.js                     ← magic-link landing + Brad notification
│   └── _lib/
│       ├── disposableEmailDomains.js
│       ├── turnstile.js
│       ├── rateLimit.js
│       ├── publicTools.js
│       ├── publicPrompt.js                   ← MIRROR of intake-public/SYSTEM_PROMPT.md
│       ├── publicEmail.js
│       └── quality.js
├── intake-public/                            ← spec docs (not deployed)
│   ├── OBJECTIVES.md
│   ├── SYSTEM_PROMPT.md
│   ├── UX_TWO_PATHS.md
│   └── SETUP.md                              ← this file
└── netlify.toml                              ← function route config
```

## When you edit the AI behavior

The system prompt has TWO copies — one in source-of-truth Markdown and one inlined in JS:

- **Source of truth:** [intake-public/SYSTEM_PROMPT.md](SYSTEM_PROMPT.md)
- **Runtime:** [netlify/functions/_lib/publicPrompt.js](../netlify/functions/_lib/publicPrompt.js)

If you change one, mirror the change to the other. (Same pattern Rick's intake uses — a deliberate trade so the runtime function has zero filesystem reads on the hot path.)

The objectives are similarly twinned:
- **Source of truth:** [intake-public/OBJECTIVES.md](OBJECTIVES.md)
- **Runtime:** referenced inside `publicPrompt.js`'s sections list. If you reorder objectives or rename ids, update the prompt.
