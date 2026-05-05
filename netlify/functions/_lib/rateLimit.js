// IP-based rate limiting for the public intake entry point.
// Backed by the `public_intake_attempts` table — every entry attempt is logged
// regardless of outcome, so even rejections count toward the limit. This stops
// spammers from hammering the endpoint to probe for bypasses.

const PER_MINUTE_LIMIT = 1;     // max 1 successful + reject attempts in any 60s window
const PER_DAY_LIMIT = 3;        // max 3 successful + reject attempts in any 24h window

/**
 * Check whether this IP can attempt entry right now.
 * Returns { ok: bool, retry_after_seconds?: number, reason?: string }.
 */
export async function checkRateLimit(db, ipAddress) {
  if (!ipAddress) {
    // Without an IP we can't rate-limit — let it through. This shouldn't happen
    // on Netlify (we always get x-forwarded-for) but don't block on it.
    return { ok: true, no_ip: true };
  }

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  const { count: minuteCount, error: minuteErr } = await db
    .from('public_intake_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ipAddress)
    .gte('attempted_at', oneMinuteAgo);

  if (minuteErr) {
    console.error('rate-limit minute check failed:', minuteErr);
    return { ok: true, db_error: true };
  }

  if ((minuteCount || 0) >= PER_MINUTE_LIMIT) {
    return { ok: false, reason: 'rate_limited_minute', retry_after_seconds: 60 };
  }

  const { count: dayCount, error: dayErr } = await db
    .from('public_intake_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ipAddress)
    .gte('attempted_at', oneDayAgo);

  if (dayErr) {
    console.error('rate-limit day check failed:', dayErr);
    return { ok: true, db_error: true };
  }

  if ((dayCount || 0) >= PER_DAY_LIMIT) {
    return { ok: false, reason: 'rate_limited_day', retry_after_seconds: 24 * 60 * 60 };
  }

  return { ok: true };
}

/**
 * Log an entry attempt outcome to the audit/rate-limit table. Fire-and-forget
 * — failures here are logged but don't block the user response.
 */
export async function logAttempt(db, { ipAddress, userAgent, outcome, emailNormalized, sessionId }) {
  try {
    await db.from('public_intake_attempts').insert({
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      outcome,
      email_normalized: emailNormalized || null,
      session_id: sessionId || null,
    });
  } catch (err) {
    console.error('Failed to log intake attempt:', err);
  }
}

/**
 * Pull the client IP from a Netlify request event. Netlify sets x-nf-client-connection-ip
 * (preferred) or x-forwarded-for (fallback). Strip out comma-separated proxy chain.
 */
export function clientIp(event) {
  const headers = event.headers || {};
  const direct = headers['x-nf-client-connection-ip'] || headers['X-NF-Client-Connection-Ip'];
  if (direct) return direct.trim();
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return null;
}
