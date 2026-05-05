// Entry point for the public "Talk to us" AI intake.
// Runs the spam defense gauntlet (honeypot → rate limit → Turnstile → email validation),
// then creates a session and returns a session_token + opening message.

import { supabase } from './_lib/supabase.js';
import { verifyTurnstile } from './_lib/turnstile.js';
import { checkRateLimit, logAttempt, clientIp } from './_lib/rateLimit.js';
import { isDisposableEmail, isValidEmailFormat } from './_lib/disposableEmailDomains.js';
import { buildPublicOpeningMessage } from './_lib/publicPrompt.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const NAME_MIN = 2;
const NAME_MAX = 80;
const EMAIL_MAX = 254;

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const ipAddress = clientIp(event);
  const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
  const db = supabase();

  // -------- Layer 1a: honeypot --------
  // If the hidden bot-trap field is filled, this is almost certainly a bot.
  // Return a fake-success response to avoid signalling that we caught them.
  if (payload.company_website && String(payload.company_website).trim().length > 0) {
    await logAttempt(db, { ipAddress, userAgent, outcome: 'honeypot_tripped' });
    return json(200, {
      ok: true,
      session_token: '00000000-0000-0000-0000-000000000000',
      opening_message: buildPublicOpeningMessage(null),
      visitor_name: payload.name || 'there',
    });
  }

  // -------- Layer 1b: payload basic shape --------
  const name = (payload.name || '').toString().trim();
  const email = (payload.email || '').toString().trim();
  const turnstileToken = (payload.turnstile_token || '').toString();

  if (!name || name.length < NAME_MIN || name.length > NAME_MAX) {
    await logAttempt(db, { ipAddress, userAgent, outcome: 'invalid_name' });
    return json(400, { error: 'Please tell me your name (2 characters or more).' });
  }

  if (!email || email.length > EMAIL_MAX || !isValidEmailFormat(email)) {
    await logAttempt(db, { ipAddress, userAgent, outcome: 'invalid_email', emailNormalized: email.toLowerCase() });
    return json(400, { error: "That email doesn't look right. Double-check the address?" });
  }

  if (isDisposableEmail(email)) {
    await logAttempt(db, { ipAddress, userAgent, outcome: 'disposable_email', emailNormalized: email.toLowerCase() });
    return json(400, {
      error: "I can't send a confirmation to a temporary email. Use a permanent address — or email me directly at info@driveclearpath.com.",
    });
  }

  // -------- Layer 2: rate limit (BEFORE Turnstile so we don't burn quota on spammers) --------
  const rate = await checkRateLimit(db, ipAddress);
  if (!rate.ok) {
    await logAttempt(db, {
      ipAddress,
      userAgent,
      outcome: rate.reason || 'rate_limited_minute',
      emailNormalized: email.toLowerCase(),
    });
    return json(429, {
      error:
        rate.reason === 'rate_limited_day'
          ? "You've started a few of these recently. Email me directly at info@driveclearpath.com instead."
          : "One moment — please wait a minute before trying again.",
      retry_after_seconds: rate.retry_after_seconds,
    });
  }

  // -------- Layer 3: Turnstile --------
  const turnstile = await verifyTurnstile(turnstileToken, ipAddress);
  if (!turnstile.ok) {
    await logAttempt(db, {
      ipAddress,
      userAgent,
      outcome: 'turnstile_failed',
      emailNormalized: email.toLowerCase(),
    });
    return json(400, {
      error: 'Could not verify you as a human. Refresh and try again, or email info@driveclearpath.com.',
      detail: turnstile.reason,
    });
  }

  // -------- All gates passed: create the session --------
  const { data: row, error: insertErr } = await db
    .from('public_intake_responses')
    .insert({
      visitor_name: name,
      visitor_email: email,
      visitor_email_normalized: email.toLowerCase(),
      ip_address: ipAddress,
      user_agent: userAgent,
      channel: 'text',
      messages: [],
    })
    .select('id, session_token, visitor_name')
    .single();

  if (insertErr || !row) {
    console.error('Failed to insert public_intake_responses row:', insertErr);
    await logAttempt(db, {
      ipAddress,
      userAgent,
      outcome: 'invalid_payload',
      emailNormalized: email.toLowerCase(),
    });
    return json(500, { error: 'Could not start your session. Please try again.' });
  }

  await logAttempt(db, {
    ipAddress,
    userAgent,
    outcome: 'created',
    emailNormalized: email.toLowerCase(),
    sessionId: row.id,
  });

  return json(200, {
    ok: true,
    session_token: row.session_token,
    opening_message: buildPublicOpeningMessage(name),
    visitor_name: name,
  });
}
