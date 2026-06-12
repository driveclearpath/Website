// Weekly intake digest — Monday morning summary of every public intake session
// from the past 7 days, including the ones the quality gate held back. Closes the
// blind spot where a misclassified real owner sits invisible in Supabase forever.
//
// Scheduled via netlify.toml ([functions."intake-digest"] schedule). Can also be
// invoked manually with ?key=<INTAKE_DIGEST_KEY> for testing.

import { Resend } from 'resend';
import { supabase } from './_lib/supabase.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bucketOf(row) {
  if (row.confirmed_at) return 'confirmed';
  if (row.conclusion_reason === 'not_legitimate') return 'dropped';
  if (row.submitted_at && row.quality_passed === false) return 'held';
  if (row.confirmation_token && !row.confirmed_at) return 'unconfirmed';
  if (!row.submitted_at) return 'abandoned';
  return 'other';
}

const BUCKET_META = {
  confirmed:   { label: 'Confirmed — you were notified', color: '#0a7c33' },
  unconfirmed: { label: 'Quality passed, magic link never clicked', color: '#0a5c7c' },
  held:        { label: 'Held by the quality gate — worth a skim', color: '#9a4400' },
  abandoned:   { label: 'Started but never finished', color: '#7a6a00' },
  dropped:     { label: 'Dropped as not legitimate', color: '#7a1a1a' },
  other:       { label: 'Other', color: '#666' },
};

function renderRow(row) {
  const summary = row.conclusion_summary || '(no AI summary)';
  const what = row.answers?.['whats_broken.pain_summary']?.value
    || Object.values(row.answers || {}).map((a) => a?.value).filter(Boolean)[0]
    || '';
  return `<li style="margin-bottom:14px">
    <strong>${escapeHtml(row.visitor_name || '?')}</strong>
    &middot; <a href="mailto:${escapeHtml(row.visitor_email || '')}" style="color:#444">${escapeHtml(row.visitor_email || '')}</a>
    &middot; <span style="color:#888">fit: ${escapeHtml(row.fit_read || 'unknown')} · ${escapeHtml(String(row.turn_count || 0))} turns</span>
    <div style="color:#555;font-size:13px;margin-top:3px">${escapeHtml(summary !== '(no AI summary)' ? summary : what || summary)}</div>
    ${row.quality_reasons?.length ? `<div style="color:#9a4400;font-size:12px;margin-top:2px">gate: ${escapeHtml(row.quality_reasons.join(', '))}</div>` : ''}
  </li>`;
}

export async function handler(event) {
  // Allow scheduled invocations (Netlify sends next_run in the body) and manual
  // runs that present the key. Anything else is rejected.
  const expectedKey = process.env.INTAKE_DIGEST_KEY;
  let isScheduled = false;
  try { isScheduled = !!JSON.parse(event.body || '{}').next_run; } catch { /* not scheduled */ }
  const givenKey = event.queryStringParameters?.key;
  if (!isScheduled && (!expectedKey || givenKey !== expectedKey)) {
    return json(403, { error: 'Forbidden' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(500, { error: 'RESEND_API_KEY not set' });

  const db = supabase();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await db
    .from('public_intake_responses')
    .select('id, visitor_name, visitor_email, fit_read, turn_count, conclusion_reason, conclusion_summary, quality_passed, quality_reasons, confirmation_token, confirmed_at, submitted_at, started_at, answers')
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('digest query failed:', error);
    return json(500, { error: 'Query failed' });
  }

  const buckets = { confirmed: [], unconfirmed: [], held: [], abandoned: [], dropped: [], other: [] };
  for (const row of rows || []) buckets[bucketOf(row)].push(row);

  const total = (rows || []).length;
  const sections = Object.entries(buckets)
    .filter(([, list]) => list.length)
    .map(([key, list]) => {
      const meta = BUCKET_META[key];
      return `<h3 style="margin:24px 0 8px;color:${meta.color}">${meta.label} (${list.length})</h3>
        <ul style="padding-left:18px;font-size:14px;margin:0">${list.map(renderRow).join('')}</ul>`;
    })
    .join('');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#222;line-height:1.5">
  <h2 style="margin:0 0 4px">Weekly intake digest</h2>
  <div style="color:#666;margin-bottom:12px">${total} session${total === 1 ? '' : 's'} in the last 7 days on /talk</div>
  ${total === 0 ? '<p style="color:#888">Quiet week — no public intake sessions.</p>' : sections}
  <p style="color:#999;font-size:12px;margin-top:28px">Sent automatically every Monday. Sessions live in Supabase &middot; public_intake_responses.</p>
</body></html>`;

  const resend = new Resend(apiKey);
  const to = process.env.PUBLIC_INTAKE_NOTIFY_EMAIL || process.env.INTAKE_NOTIFY_EMAIL || 'info@driveclearpath.com';
  const from = process.env.PUBLIC_INTAKE_FROM || process.env.INTAKE_NOTIFY_FROM || 'intake@driveclearpath.com';

  await resend.emails.send({
    from,
    to,
    subject: `Intake digest — ${total} session${total === 1 ? '' : 's'} this week`,
    html,
  });

  console.log(`Intake digest sent: ${total} sessions`);
  return json(200, { ok: true, total });
}
