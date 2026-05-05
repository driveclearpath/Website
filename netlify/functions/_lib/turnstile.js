// Cloudflare Turnstile verification — OPTIONAL extra layer.
//
// Turnstile is a free invisible CAPTCHA. The public intake's other defenses
// (magic-link confirmation, per-IP rate limit, honeypot, disposable-email
// blocklist, AI in-conversation judgment, quality gate) cover the spam case
// well enough on their own — Turnstile only uniquely defends against botnet
// IP rotation burning Anthropic API quota.
//
// If TURNSTILE_SECRET_KEY is unset, verification is bypassed silently. To
// turn Turnstile on later: get a Cloudflare site key + secret, paste the
// site key into intake-public.html (replaces __TURNSTILE_SITE_KEY__), and
// set TURNSTILE_SECRET_KEY in Netlify env. No code changes needed.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let warnedOnce = false;

/**
 * Verify a Turnstile token. Returns { ok: bool, reason?: string, bypassed?: bool }.
 * @param {string} token - The token from the cf-turnstile-response field.
 * @param {string} [remoteIp] - Optional client IP for stricter verification.
 */
export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (!warnedOnce) {
      console.log('Turnstile not configured (TURNSTILE_SECRET_KEY unset) — bypassing. Other spam defenses still active.');
      warnedOnce = true;
    }
    return { ok: true, bypassed: true };
  }

  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing_token' };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.append('remoteip', remoteIp);

  let resp;
  try {
    resp = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    console.error('Turnstile verify fetch failed:', err);
    return { ok: false, reason: 'turnstile_unreachable' };
  }

  if (!resp.ok) {
    return { ok: false, reason: `turnstile_http_${resp.status}` };
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, reason: 'turnstile_bad_json' };
  }

  if (!data.success) {
    return { ok: false, reason: 'turnstile_rejected', codes: data['error-codes'] || [] };
  }

  return { ok: true };
}
