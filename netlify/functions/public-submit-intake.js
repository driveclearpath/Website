// Manual / forced-end endpoint for the public intake. Called when the visitor
// clicks "End & send" or when the page unloads via sendBeacon. Idempotent.
//
// This DOES NOT notify Brad — Brad is only notified after the visitor confirms
// via the magic link (handled in confirm-intake.js).

import { randomUUID } from 'crypto';
import { supabase } from './_lib/supabase.js';
import { sendVisitorConfirmation } from './_lib/publicEmail.js';
import { evaluateQuality } from './_lib/quality.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const HARD_CLOSE_REASONS = new Set([
  'user_ended_manually',
  'objectives_covered',
  'visitor_ready_to_end',
  'out_of_time',
  'no_email',
  'low_engagement',
  'not_legitimate',
  'expired',
]);

function buildTranscript(messages, visitorName) {
  const userLabel = (visitorName?.split(/\s+/)[0] || 'VISITOR').toUpperCase();
  const lines = [];
  for (const m of messages || []) {
    if (m.role === 'user') {
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content || []).filter((b) => b.type !== 'tool_result').map((b) => b.text || '').join(' ');
      if (text.trim()) lines.push(`${userLabel}: ${text.trim()}`);
    } else if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (text) lines.push(`ASSISTANT: ${text}`);
    }
  }
  return lines.join('\n\n');
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { session_token, reason } = payload;
  if (!session_token) return json(400, { error: 'Missing session_token' });

  const db = supabase();
  const { data: row } = await db
    .from('public_intake_responses')
    .select('*')
    .eq('session_token', session_token)
    .maybeSingle();

  if (!row) return json(404, { error: 'Session not found' });
  if (row.submitted_at) return json(200, { ok: true, already_submitted: true });

  const transcript = buildTranscript(row.messages, row.visitor_name);
  const isHardClose = HARD_CLOSE_REASONS.has(reason);

  const patch = {
    transcript,
    conclusion_reason: reason || 'user_ended_manually',
  };

  if (isHardClose) {
    patch.conclusion_summary = row.conclusion_summary || '(Ended manually — no AI summary generated.)';
    patch.fit_read = row.fit_read || 'unclear';
    patch.submitted_at = new Date().toISOString();

    const quality = evaluateQuality({ ...row, ...patch });
    patch.quality_passed = quality.passed;
    patch.quality_reasons = quality.reasons;

    // Manual-end emails the visitor a magic link IF the gate passed and we don't
    // already have a confirmation token. (Don't double-send if conclude_intake fired first.)
    if (quality.passed && !row.confirmation_token && reason !== 'not_legitimate') {
      const token = randomUUID();
      patch.confirmation_token = token;
      patch.confirmation_sent_at = new Date().toISOString();
      try {
        await sendVisitorConfirmation({
          visitorName: row.visitor_name,
          visitorEmail: row.visitor_email,
          confirmationToken: token,
        });
      } catch (err) {
        console.error('Visitor confirmation send failed (manual end):', err);
      }
    }
  }

  const { error: updateErr } = await db
    .from('public_intake_responses')
    .update(patch)
    .eq('id', row.id);

  if (updateErr) console.error('public-submit-intake update failed:', updateErr);

  return json(200, {
    ok: true,
    submitted: isHardClose,
    confirmation_required: isHardClose && !!patch.confirmation_token,
  });
}
