// Chat turn handler for the public "Talk to us" AI intake.
// Mirrors chat-turn.js but uses session_token (not invite codes), the public
// system prompt, and the public tool set. Magic-link confirmation happens at
// conclude time — Brad is NOT notified here.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { supabase } from './_lib/supabase.js';
import { buildPublicSystemPrompt, buildPublicOpeningMessage } from './_lib/publicPrompt.js';
import { PUBLIC_TOOLS } from './_lib/publicTools.js';
import { sendVisitorConfirmation } from './_lib/publicEmail.js';
import { evaluateQuality } from './_lib/quality.js';
import { MODELS } from './_lib/aiModels.js';

const MAX_TOOL_LOOPS = 5;
const MAX_TURNS = Number(process.env.PUBLIC_MAX_INTAKE_TURNS || 30);
const MAX_MESSAGE_CHARS = 8000;

// Screenshot policy: images are passed to the AI for THIS turn only, then discarded.
// Only a text placeholder is persisted — no image bytes ever reach Supabase or email.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_B64_CHARS = 5_000_000; // ~3.7MB binary; client downscales well below this

function validImage(image) {
  return (
    image &&
    typeof image === 'object' &&
    ALLOWED_IMAGE_TYPES.includes(image.media_type) &&
    typeof image.data === 'string' &&
    image.data.length >= 100 &&
    image.data.length <= MAX_IMAGE_B64_CHARS &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
  );
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Progress sections for the client breadcrumb, keyed by objective_id prefix
// (see intake-public/OBJECTIVES.md: who_*, whats_broken_*, vision_*, stakes_*).
const SECTION_PREFIXES = ['who', 'whats_broken', 'vision', 'stakes'];

function coveredSections(answers = {}, skipped = []) {
  const ids = [
    ...Object.keys(answers).map((k) => k.split('.')[0]),
    ...skipped.map((s) => s.objective_id || ''),
  ];
  return SECTION_PREFIXES.filter((p) => ids.some((id) => id === p || id.startsWith(p + '_')));
}

function extractText(blocks) {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function extractToolUses(blocks) {
  return blocks.filter((b) => b.type === 'tool_use');
}

function buildTranscript(messages, visitorName) {
  const userLabel = (visitorName?.split(/\s+/)[0] || 'VISITOR').toUpperCase();
  const lines = [];
  for (const m of messages) {
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

function applyToolCall(toolUse, agg) {
  const { name, input } = toolUse;

  if (name === 'capture_answer') {
    const key = `${input.objective_id}.${input.field}`;
    agg.answers[key] = {
      value: input.value,
      confidence: input.confidence,
      notes: input.notes || null,
      captured_at: new Date().toISOString(),
    };
    return { result: 'ok', concluded: false };
  }

  if (name === 'flag_for_brad') {
    agg.flags.push({
      reason: input.reason,
      content: input.content,
      context: input.context || null,
      flagged_at: new Date().toISOString(),
    });
    return { result: 'flagged', concluded: false };
  }

  if (name === 'skip_topic') {
    agg.skipped.push({
      objective_id: input.objective_id,
      reason: input.reason,
      skipped_at: new Date().toISOString(),
    });
    return { result: 'skipped', concluded: false };
  }

  if (name === 'conclude_intake') {
    agg.conclusion_reason = input.reason;
    agg.conclusion_summary = input.summary;
    agg.fit_read = input.fit_read;
    return { result: 'concluded', concluded: true };
  }

  return { result: 'unknown_tool', concluded: false };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const { session_token, user_message, image } = payload;
  if (!session_token) return json(400, { error: 'Missing session_token' });

  const userText = typeof user_message === 'string' ? user_message.trim() : '';
  if (userText.length > MAX_MESSAGE_CHARS) {
    return json(400, { error: 'Message too long' });
  }
  if (image != null && !validImage(image)) {
    return json(400, { error: 'Invalid image' });
  }
  if (!userText && !image) {
    return json(400, { error: 'Missing user_message' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'Server missing ANTHROPIC_API_KEY' });

  const db = supabase();

  const { data: row, error: rowErr } = await db
    .from('public_intake_responses')
    .select('*')
    .eq('session_token', session_token)
    .maybeSingle();

  if (rowErr || !row) return json(404, { error: 'Session not found' });
  if (row.submitted_at) {
    return json(409, { error: 'This session is already complete.', done: true });
  }
  if ((row.turn_count || 0) >= MAX_TURNS) {
    return json(429, { error: 'Conversation length cap reached.' });
  }

  // Per-session pacing: humans take seconds to read and reply; sustained
  // faster-than-every-3s traffic on one session is automation burning API spend.
  // Allows a burst of 6 turns, then caps the average pace at one turn per 3s.
  const elapsedSec = Math.max(0, (Date.now() - new Date(row.started_at).getTime()) / 1000);
  if ((row.turn_count || 0) >= 6 + elapsedSec / 3) {
    return json(429, { error: "You're moving faster than I can read — give it a few seconds and try again." });
  }

  // Build messages — seed opener if first turn.
  // Two parallel arrays: `apiMessages` is what Claude sees this turn (may contain the live
  // image), `storedMessages` is what gets persisted (image replaced by a text placeholder,
  // so screenshot bytes never touch the database). Assistant/tool turns are appended to both.
  const storedMessages = Array.isArray(row.messages) ? [...row.messages] : [];
  if (storedMessages.length === 0) {
    storedMessages.push({
      role: 'assistant',
      content: buildPublicOpeningMessage(row.visitor_name),
    });
  }

  let apiUserContent;
  let storedUserContent;
  if (image) {
    apiUserContent = [
      { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
      { type: 'text', text: userText || '(Visitor sent a screenshot with no caption.)' },
    ];
    storedUserContent =
      '[Visitor attached a screenshot — analyzed in that turn, image not stored.]' +
      (userText ? `\n${userText}` : '');
  } else {
    apiUserContent = userText;
    storedUserContent = userText;
  }

  const apiMessages = [...storedMessages, { role: 'user', content: apiUserContent }];
  storedMessages.push({ role: 'user', content: storedUserContent });

  const client = new Anthropic({ apiKey });
  let system = buildPublicSystemPrompt({ visitorName: row.visitor_name });

  // Graceful tapering: near the turn cap, tell the AI to land the plane instead
  // of getting cut off mid-question by the hard MAX_TURNS limit.
  const remainingTurns = MAX_TURNS - (row.turn_count || 0);
  if (remainingTurns <= 5) {
    system += `\n\n---\n\n# Time pressure — wrap up now\n\nOnly ${remainingTurns} exchange${remainingTurns === 1 ? '' : 's'} remain before this conversation hits its hard length cap. Do NOT open new topics. This turn or the next, reflect what you've heard, ask the single "anything I should have asked?" closer if you haven't, and call conclude_intake. Ending warmly on time beats getting cut off mid-question.`;
  }

  const agg = {
    answers: { ...(row.answers || {}) },
    flags: [...(row.flags || [])],
    skipped: [...(row.skipped || [])],
    conclusion_reason: null,
    conclusion_summary: null,
    fit_read: null,
  };
  let concluded = false;
  let finalText = '';

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    let resp;
    try {
      resp = await client.messages.create({
        model: process.env.PUBLIC_INTAKE_MODEL || MODELS.OPUS,
        max_tokens: 1024,
        system,
        tools: PUBLIC_TOOLS,
        messages: apiMessages,
      });
    } catch (err) {
      console.error('Claude API error:', err);
      return json(502, { error: 'AI service error' });
    }

    const blocks = resp.content || [];
    const toolUses = extractToolUses(blocks);
    const text = extractText(blocks);

    apiMessages.push({ role: 'assistant', content: blocks });
    storedMessages.push({ role: 'assistant', content: blocks });
    if (text) finalText += (finalText ? '\n\n' : '') + text;

    if (toolUses.length === 0) break;

    const toolResultBlocks = [];
    for (const tu of toolUses) {
      const { result, concluded: toolConcluded } = applyToolCall(tu, agg);
      if (toolConcluded) concluded = true;
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result,
      });
    }

    apiMessages.push({ role: 'user', content: toolResultBlocks });
    storedMessages.push({ role: 'user', content: toolResultBlocks });
    if (concluded) break;
  }

  const transcript = buildTranscript(storedMessages, row.visitor_name);
  const nextTurnCount = (row.turn_count || 0) + 1;

  const patch = {
    messages: storedMessages,
    answers: agg.answers,
    flags: agg.flags,
    skipped: agg.skipped,
    turn_count: nextTurnCount,
    transcript,
  };

  // -------- Concluded path --------
  let confirmationRequired = false;
  let silentDrop = false;

  if (concluded) {
    patch.conclusion_reason = agg.conclusion_reason;
    patch.conclusion_summary = agg.conclusion_summary;
    patch.fit_read = agg.fit_read;
    patch.submitted_at = new Date().toISOString();

    // Evaluate quality on the post-conclusion row shape
    const quality = evaluateQuality({
      ...row,
      ...patch,
    });
    patch.quality_passed = quality.passed;
    patch.quality_reasons = quality.reasons;

    if (agg.conclusion_reason === 'not_legitimate') {
      // Silent drop — no email, no confirmation, no Brad notification
      silentDrop = true;
    } else if (quality.passed) {
      // Generate magic-link token + send visitor confirmation
      const token = randomUUID();
      patch.confirmation_token = token;
      patch.confirmation_sent_at = new Date().toISOString();
      confirmationRequired = true;

      try {
        await sendVisitorConfirmation({
          visitorName: row.visitor_name,
          visitorEmail: row.visitor_email,
          confirmationToken: token,
        });
      } catch (err) {
        console.error('Visitor confirmation send failed:', err);
        // Don't block conclusion — the row will still be saved with the token,
        // and Brad's admin surface can re-send if needed.
      }
    }
    // else: quality_passed=false, no email sent, just sits in Supabase
  }

  const { error: updateErr } = await db
    .from('public_intake_responses')
    .update(patch)
    .eq('id', row.id);

  if (updateErr) console.error('Failed to update public_intake_responses row:', updateErr);

  return json(200, {
    ok: true,
    text: finalText,
    done: concluded,
    turn_count: nextTurnCount,
    confirmation_required: confirmationRequired,
    silent_drop: silentDrop,
    progress: coveredSections(agg.answers, agg.skipped),
    // The recap shown on the "check your inbox" screen — only when a real
    // confirmation is in flight (never on silent drops or quality fails).
    ...(concluded && confirmationRequired && agg.conclusion_summary
      ? { summary: agg.conclusion_summary }
      : {}),
  });
}
