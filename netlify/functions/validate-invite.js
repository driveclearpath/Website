import { supabase } from './_lib/supabase.js';
import { buildOpeningMessage } from './_lib/prompt.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const code = (payload.code || '').trim().toUpperCase();
  if (!code) return json(400, { error: 'Missing code' });

  const db = supabase();

  const { data: invite, error: inviteErr } = await db
    .from('expert_intake_invites')
    .select('*, expert_prospects(*), expert_intake_templates(*)')
    .eq('code', code)
    .maybeSingle();

  if (inviteErr) return json(500, { error: inviteErr.message });
  if (!invite) return json(404, { error: 'Invalid code' });

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return json(410, { error: 'This invite has expired' });
  }

  const prospect = invite.expert_prospects;
  const template = invite.expert_intake_templates;

  // Mark opened_at on first validation
  if (!invite.opened_at) {
    await db
      .from('expert_intake_invites')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', invite.id);
  }

  // Ensure a response row exists (idempotent)
  const { data: existingResponse } = await db
    .from('expert_intake_responses')
    .select('id, channel, messages, submitted_at')
    .eq('invite_id', invite.id)
    .maybeSingle();

  if (!existingResponse) {
    await db.from('expert_intake_responses').insert({
      invite_id: invite.id,
      prospect_id: prospect.id,
      template_id: template.id,
      channel: 'text',
      messages: [],
    });
  }

  // If there's an in-progress session, return simplified renderable messages so the
  // frontend can replay history and let the prospect resume exactly where they left off.
  const renderableHistory = [];
  if (existingResponse && !existingResponse.submitted_at && Array.isArray(existingResponse.messages)) {
    for (const m of existingResponse.messages) {
      if (m.role === 'user') {
        // Skip tool_result-only turns (no user text)
        const blocks = Array.isArray(m.content) ? m.content : null;
        if (blocks && blocks.every((b) => b.type === 'tool_result')) continue;
        const text = typeof m.content === 'string'
          ? m.content
          : (blocks || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
        if (text.trim()) renderableHistory.push({ role: 'user', text: text.trim() });
      } else if (m.role === 'assistant') {
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (text) renderableHistory.push({ role: 'assistant', text });
      }
    }
  }

  return json(200, {
    ok: true,
    invite_id: invite.id,
    prospect: {
      display_name: prospect.display_name,
      title: prospect.title,
      firm: prospect.firm,
      office_location: prospect.office_location,
      tenure_years: prospect.tenure_years,
      start_year: prospect.start_year,
      licenses: prospect.licenses,
      known_facts: prospect.known_facts,
    },
    opening_message: buildOpeningMessage(prospect),
    history: renderableHistory,
    resuming: renderableHistory.length > 0,
    already_submitted: existingResponse?.submitted_at ? true : false,
  });
}
