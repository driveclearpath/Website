import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './_lib/supabase.js';
import { buildSystemPrompt, buildOpeningMessage } from './_lib/prompt.js';
import { TOOLS } from './_lib/tools.js';
import { sendIntakeEmail } from './_lib/email.js';

const MAX_TOOL_LOOPS = 5;
const MAX_TURNS = Number(process.env.MAX_INTAKE_TURNS || 40);

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function extractText(contentBlocks) {
  return contentBlocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function extractToolUses(contentBlocks) {
  return contentBlocks.filter((b) => b.type === 'tool_use');
}

async function handleToolCall({ db, inviteId, responseRow, toolUse }) {
  const { name, input } = toolUse;
  const updates = {};

  if (name === 'capture_answer') {
    const key = `${input.objective_id}.${input.field}`;
    const answers = { ...(responseRow.answers || {}) };
    answers[key] = {
      value: input.value,
      confidence: input.confidence,
      notes: input.notes || null,
      captured_at: new Date().toISOString(),
    };
    updates.answers = answers;
    return { updates, result: 'ok', done: false };
  }

  if (name === 'flag_for_brad') {
    const flags = [...(responseRow.flags || [])];
    flags.push({
      reason: input.reason,
      content: input.content,
      context: input.context || null,
      flagged_at: new Date().toISOString(),
    });
    updates.flags = flags;
    return { updates, result: 'flagged', done: false };
  }

  if (name === 'skip_topic') {
    const skipped = [...(responseRow.skipped || [])];
    skipped.push({
      objective_id: input.objective_id,
      reason: input.reason,
      skipped_at: new Date().toISOString(),
    });
    updates.skipped = skipped;
    return { updates, result: 'skipped', done: false };
  }

  if (name === 'conclude_intake') {
    updates.conclusion_reason = input.reason;
    updates.conclusion_summary = input.summary;
    return { updates, result: 'concluded', done: true };
  }

  return { updates: {}, result: 'unknown_tool', done: false };
}

function buildTranscript(messages) {
  const lines = [];
  for (const m of messages) {
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

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const { invite_id, user_message } = payload;
  if (!invite_id) return json(400, { error: 'Missing invite_id' });
  if (!user_message || typeof user_message !== 'string') {
    return json(400, { error: 'Missing user_message' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'Server missing ANTHROPIC_API_KEY' });

  const db = supabase();

  // Load invite + prospect + template + response row
  const { data: invite, error: inviteErr } = await db
    .from('expert_intake_invites')
    .select('*, expert_prospects(*), expert_intake_templates(*)')
    .eq('id', invite_id)
    .maybeSingle();

  if (inviteErr || !invite) return json(404, { error: 'Invite not found' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return json(410, { error: 'Invite expired' });
  }

  const prospect = invite.expert_prospects;
  const template = invite.expert_intake_templates;

  const { data: responseRow, error: respErr } = await db
    .from('expert_intake_responses')
    .select('*')
    .eq('invite_id', invite.id)
    .maybeSingle();

  if (respErr || !responseRow) return json(500, { error: 'Response row missing — validate invite first' });

  if (responseRow.submitted_at) {
    return json(409, { error: 'This intake has already been submitted.', done: true });
  }

  if ((responseRow.turn_count || 0) >= MAX_TURNS) {
    return json(429, { error: 'Conversation turn cap reached.' });
  }

  // Build messages array. If empty, seed with the pre-written opener as the first assistant message.
  let messages = Array.isArray(responseRow.messages) ? [...responseRow.messages] : [];
  if (messages.length === 0) {
    messages.push({
      role: 'assistant',
      content: buildOpeningMessage(prospect),
    });
  }

  // Append the new user message
  messages.push({ role: 'user', content: user_message });

  // Run Claude with tool-use loop
  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt({ prospect, template, channel: 'text' });

  let aggregatedUpdates = {
    answers: { ...(responseRow.answers || {}) },
    flags: [...(responseRow.flags || [])],
    skipped: [...(responseRow.skipped || [])],
  };
  let concluded = false;
  let conclusionFields = {};
  let finalText = '';

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    let claudeResp;
    try {
      claudeResp = await client.messages.create({
        model: template.model_id || 'claude-opus-4-7',
        max_tokens: 1024,
        system,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      console.error('Claude API error:', err);
      return json(502, { error: 'AI service error', detail: err.message });
    }

    const contentBlocks = claudeResp.content || [];
    const toolUses = extractToolUses(contentBlocks);
    const text = extractText(contentBlocks);

    // Persist the assistant message (with any tool_use blocks)
    messages.push({ role: 'assistant', content: contentBlocks });

    // Accumulate text across every iteration. Claude often emits text + tool_use in one
    // response, and the post-tool-result response may be empty — we must not lose the
    // first-iteration text.
    if (text) finalText += (finalText ? '\n\n' : '') + text;

    // No tool calls → this response was final, break
    if (toolUses.length === 0) break;

    // Execute each tool and append tool_result back to messages
    const toolResultBlocks = [];
    for (const tu of toolUses) {
      const snapshot = {
        ...responseRow,
        answers: aggregatedUpdates.answers,
        flags: aggregatedUpdates.flags,
        skipped: aggregatedUpdates.skipped,
      };
      const { updates, result, done } = await handleToolCall({
        db,
        inviteId: invite.id,
        responseRow: snapshot,
        toolUse: tu,
      });
      if (updates.answers) aggregatedUpdates.answers = updates.answers;
      if (updates.flags) aggregatedUpdates.flags = updates.flags;
      if (updates.skipped) aggregatedUpdates.skipped = updates.skipped;
      if (updates.conclusion_reason) conclusionFields.conclusion_reason = updates.conclusion_reason;
      if (updates.conclusion_summary) conclusionFields.conclusion_summary = updates.conclusion_summary;
      if (done) concluded = true;

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result,
      });
    }

    // Tool results go in the next user-role message
    messages.push({ role: 'user', content: toolResultBlocks });

    // If concluded, the wrap-up text from this iteration is already in finalText — break
    if (concluded) break;
  }

  // Compose transcript
  const transcript = buildTranscript(messages);

  // Persist response row
  const nextTurnCount = (responseRow.turn_count || 0) + 1;
  const patch = {
    messages,
    answers: aggregatedUpdates.answers,
    flags: aggregatedUpdates.flags,
    skipped: aggregatedUpdates.skipped,
    turn_count: nextTurnCount,
    transcript,
  };
  if (concluded) {
    patch.conclusion_reason = conclusionFields.conclusion_reason;
    patch.conclusion_summary = conclusionFields.conclusion_summary;
    patch.submitted_at = new Date().toISOString();
  }

  const { error: updateErr } = await db
    .from('expert_intake_responses')
    .update(patch)
    .eq('invite_id', invite.id);

  if (updateErr) console.error('Response update failed:', updateErr);

  // If concluded, mark invite consumed and fire email
  if (concluded) {
    await db
      .from('expert_intake_invites')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', invite.id);

    try {
      await sendIntakeEmail({
        prospect,
        invite,
        response: { ...responseRow, ...patch, channel: responseRow.channel },
        conversationText: transcript,
      });
    } catch (err) {
      console.error('Email send failed:', err);
    }
  }

  return json(200, {
    ok: true,
    text: finalText,
    done: concluded,
    turn_count: nextTurnCount,
  });
}
