# Two-Path Contact UX — driveclearpath.com

> How the "Talk to us" button on the website should split into AI intake vs. direct email, in a way that makes the AI path feel like the *better* option, not the impersonal one.

## The framing principle

The instinct in most "AI vs. human" UX is to apologize for the AI ("Or talk to a real person!"). That's wrong here. The AI path is genuinely better for both sides:

- **Visitor:** Brad shows up to the follow-up already knowing their situation. No "tell me about your business" call. No repeating themselves.
- **Brad:** A structured intake means a real reply, not a generic "let's set up a call."

The email path is the cop-out — "I'd rather skip the questions" — and that's fine. But it should not be presented as the high-status option.

## The page — proposed copy

### Headline + subhead (top of contact page)

```
Tell us about your business.

Brad reads every message personally. Help him show up with something real
instead of "let's set up a call."
```

### The two paths

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│   Talk to my AI first  →                                      │
│                                                               │
│   Five minutes. I'll show up to our follow-up already         │
│   knowing your situation — no repeating yourself.             │
│                                                               │
│   [ Start →  ]                                                │
│                                                               │
└───────────────────────────────────────────────────────────────┘

   Or just email me — info@driveclearpath.com
```

The visual weight goes to the AI card. Email is a single line of plain text underneath, not a button.

## What "exciting" looks like for the AI path

The user mentioned wanting to make the AI path *feel exciting*. A few mechanics that earn that without being gimmicky:

1. **Progress signal.** A subtle "1 of 4" or section name at the top — "What's broken" → "Vision" → "Stakes." Feels like a guided conversation, not an open-ended chatbot. People stay engaged when they can see the end.

2. **Real reflection at the end.** When the AI calls `conclude_intake`, show the visitor a 2-3 sentence summary the AI is sending Brad — *in the AI's words*. Lets them correct, but more importantly, it shows that the conversation produced something real. They didn't just fill out a form.

3. **No "thank you for your submission" page.** End on a personal beat — "Brad has this. He'll reach out personally." Maybe a one-line note from Brad himself, recorded once, not generated.

4. **Skippable, always.** Anywhere in the flow, a "skip — let me just email Brad" link in the corner. The exit ramp being visible makes the path feel less trapped, which paradoxically makes people stay longer.

## What NOT to do

- **No gamification.** No badges, no streaks, no "you've unlocked the next question." Brad's brand is grown-up; gamification undercuts that.
- **No fake personality.** The AI is not "Sparky from ClearPath." It's Brad's assistant. Quiet competence.
- **No required fields with red errors.** Conversational AI handles missing info by asking again, not by yelling at the form.
- **No "Brad will respond within 24 hours" promise.** He won't always. "Brad will reach out personally — usually within a few days" is honest.

## Implementation notes

- **Channel:** Text only. No voice. Cold visitors don't need it and it doubles complexity.
- **Backend:** Reuse the Netlify functions pattern from Rick's intake — [chat-turn.js](../netlify/functions/chat-turn.js), [submit-intake.js](../netlify/functions/submit-intake.js). Drop the `validate-invite` code-gate; replace with the spam defenses below.
- **Storage:** New Supabase table `public_intake_responses` — distinct from Rick's `expert_intake_responses` because the schema is different (fit_read enum, public objective_ids, no Primerica fields). RLS: only Brad's auth role can read.
- **Page:** New `intake-public.html` modeled on the existing `intake.html`, minus the code gate, plus the entry-page spam defenses.
- **Email handoff:** On `conclude_intake`, ONLY notify Brad if the intake clears the quality bar (see anti-spam design below). Otherwise the row sits in Supabase silent.

## Decisions locked in

- **No voice channel.** Text only.
- **AI never names specific ClearPath products.** It frames around scope and adjacent verticals already in flight ("we've built similar things for X and Y — adapting to your case is well within what we do"). Defers the actual fit call to Brad. See [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) "What ClearPath does" section for exact framing.
- **Spam-proof, not spam-tolerant.** Brad only sees legitimate intakes. Everything else is dropped or quarantined silently.

## Anti-spam design — layered defense

The goal is that Brad's inbox only contains real prospects. We layer cheap defenses up front (kill bots before they cost us anything) and expensive defenses at the back (kill anything that slipped through before it pages Brad).

### Layer 1 — Page entry (kill bots before they start)

- **Cloudflare Turnstile** (free, invisible-by-default CAPTCHA) on the "Start" button. Blocks 95%+ of automated traffic with no UX cost for real humans.
- **Honeypot field** in the entry form (hidden input that real users won't touch). Anything that fills it gets a fake "thanks" page and is silently dropped — never reaches the backend.
- **Rate limit per IP:** max 3 intake starts per 24 hours, max 1 per minute. Stored in a tiny Supabase table or Netlify Edge KV. Spammers retrying get a polite "you've started a few of these recently — drop me an email at info@driveclearpath.com instead."

### Layer 2 — Email validation (kill fake addresses)

- **Format check** + **disposable-domain blocklist** (tempmail, guerrillamail, mailinator, 10minutemail, etc. — there are maintained lists on GitHub).
- **Optional but strong: magic-link confirmation** before the intake ever notifies Brad. After conversation wraps, send a "click here to confirm and Brad will reply" email. Only confirmed intakes hit Brad's inbox. This adds friction (real people will click, bots can't), but it shifts the bar from "spammer proof on average" to "spammer proof in absolute terms." Recommend turning this on for v1 — we can soften it later if the friction kills conversion.

### Layer 3 — In-conversation AI judgment (kill bad-faith humans)

- AI watches for: nonsense answers, vendor pitches at us ("we offer SEO services"), recruiter/sales attempts, off-topic chatter, hostility. Calls `conclude_intake` with `reason: "not_legitimate"` — the backend drops these silently.
- AI also flags low-engagement (`reason: "low_engagement"`) — real human, just shallow. These are stored but don't notify Brad.

### Layer 4 — Quality threshold (kill weak intakes from notifying)

Before the backend emails Brad, the intake must pass:
- Real name (>2 chars, not "asdf", not just an email prefix)
- Validated email (format + non-disposable + magic-link confirmed if Layer 2 is on)
- Section 1 (Who and what): business type AND role both substantively answered
- Section 2 (What's broken): at least one substantive answer (>50 chars of real content)
- `fit_read` from AI is one of: `strong`, `possible`, `unclear` (NOT `weak` or `not_a_fit`)

Anything that fails the bar is stored with a `quality: low` flag and Brad can review on demand. Default: he never sees them.

### Layer 5 — Brad's inbox stays clean (review surface for the rest)

A simple `/admin/intakes` page (auth-gated, just Brad) shows everything in Supabase — passed, low-quality, and dropped — so nothing is truly invisible. He can promote a low-quality intake to "respond" if he wants. But the default mode is: only the high-quality ones hit his email.

### What this costs us

- Turnstile: free
- Disposable-domain list: free
- Magic-link confirmation: ~1 extra round trip and a custom transactional email — minor build cost, real anti-spam value
- AI judgment: zero marginal cost (already in the conversation)
- Admin review page: small build, optional for v1

The whole stack is cheap to build relative to the value of "Brad never gets a spam intake." Worth doing all five layers from day one.
