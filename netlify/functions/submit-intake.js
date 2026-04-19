// Manual fallback: force-submit an intake (e.g. if the user closes the page without
// triggering conclude_intake). Used by the frontend "End conversation" button.

import { supabase } from './_lib/supabase.js';
import { sendIntakeEmail } from './_lib/email.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function buildTranscript(messages) {
  const lines = [];
  for (const m of messages || []) {
    if (m.role === 'user') {
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content || []).filter((b) => b.type !== 'tool_result').map((b) => b.text || '').join(' ');
      if (text.trim()) lines.push(`RICK: ${text.trim()}`);
    } else if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (text) lines.push(`ASSISTANT: ${text}`);
    }
  }
  return lines.join('\n\n');
}

// Reasons that lock the session (hard close — explicit user or AI wrap).
// Other reasons (e.g. window_closed, tab_hidden) notify Brad but keep the session
// resumable so the prospect can return and continue.
const HARD_CLOSE_REASONS = new Set([
  'user_ended_manually',
  'objectives_covered',
  'rick_ready_to_end',
  'out_of_time',
  'technical_issue',
  'expired',
]);

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { invite_id, reason } = payload;
  if (!invite_id) return json(400, { error: 'Missing invite_id' });

  const db = supabase();

  const { data: invite } = await db
    .from('expert_intake_invites')
    .select('*, expert_prospects(*)')
    .eq('id', invite_id)
    .maybeSingle();

  if (!invite) return json(404, { error: 'Invite not found' });

  const { data: responseRow } = await db
    .from('expert_intake_responses')
    .select('*')
    .eq('invite_id', invite.id)
    .maybeSingle();

  if (!responseRow) return json(404, { error: 'Response not found' });
  if (responseRow.submitted_at) return json(200, { ok: true, already_submitted: true });

  const transcript = buildTranscript(responseRow.messages);
  const isHardClose = HARD_CLOSE_REASONS.has(reason);
  const isPartial = !isHardClose;

  const patch = {
    transcript,
    conclusion_reason: reason || 'user_ended_manually',
  };
  if (isHardClose) {
    patch.conclusion_summary =
      responseRow.conclusion_summary || '(Ended manually — no AI summary generated.)';
    patch.submitted_at = new Date().toISOString();
  }

  await db.from('expert_intake_responses').update(patch).eq('invite_id', invite.id);
  if (isHardClose) {
    await db
      .from('expert_intake_invites')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', invite.id);
  }

  try {
    await sendIntakeEmail({
      prospect: invite.expert_prospects,
      invite,
      response: { ...responseRow, ...patch, channel: responseRow.channel },
      conversationText: transcript,
      partial: isPartial,
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }

  return json(200, { ok: true, submitted: isHardClose });
}
