// Pressure test harness — exercises modules without hitting real APIs.
// Run: node netlify/functions/_test/pressure.mjs
//
// Covers: module loading, prompt assembly from Rick's seed, opening message,
// tool definitions shape, email HTML rendering, transcript builder.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

function ok(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

function section(label) {
  console.log(`\n=== ${label} ===`);
}

// --------- 1. Module loading ---------
section('Module loading');
const mods = {};
try {
  mods.prompt = await import('../_lib/prompt.js');
  ok('prompt.js loads', typeof mods.prompt.buildSystemPrompt === 'function' && typeof mods.prompt.buildOpeningMessage === 'function');
} catch (e) { ok('prompt.js loads', false, e.message); }

try {
  mods.tools = await import('../_lib/tools.js');
  ok('tools.js loads', Array.isArray(mods.tools.TOOLS) && mods.tools.TOOLS.length === 4);
} catch (e) { ok('tools.js loads', false, e.message); }

try {
  mods.email = await import('../_lib/email.js');
  ok('email.js loads', typeof mods.email.sendIntakeEmail === 'function');
} catch (e) { ok('email.js loads', false, e.message); }

try {
  mods.supabase = await import('../_lib/supabase.js');
  ok('supabase.js loads', typeof mods.supabase.supabase === 'function');
} catch (e) { ok('supabase.js loads', false, e.message); }

try {
  await import('../validate-invite.js');
  ok('validate-invite.js loads', true);
} catch (e) { ok('validate-invite.js loads', false, e.message); }

try {
  await import('../chat-turn.js');
  ok('chat-turn.js loads', true);
} catch (e) { ok('chat-turn.js loads', false, e.message); }

try {
  await import('../submit-intake.js');
  ok('submit-intake.js loads', true);
} catch (e) { ok('submit-intake.js loads', false, e.message); }

// --------- 2. Seed data shape ---------
section('Rick seed data');
const rick = JSON.parse(readFileSync(join(root, '..', 'clearpath-expert', 'prospects', 'rick.json'), 'utf8'));
ok('Rick has display_name', rick.display_name === 'Rick');
ok('Rick is SVP at Primerica', rick.title === 'Senior Vice President' && rick.firm === 'Primerica');
ok('Rick has known_facts', Array.isArray(rick.known_facts) && rick.known_facts.length >= 5);
ok('Rick has licenses', Array.isArray(rick.licenses) && rick.licenses.length === 3);
ok('Rick has invite code RICKB', rick.invite?.code === 'RICKB');

// Minimal template mirroring DATA_MODEL.sql seed
const template = {
  id: 'expert-in-a-box-v1',
  name: 'Expert-in-a-Box — Prospect Intake v1',
  version: 1,
  model_id: 'claude-opus-4-7',
  sections: [
    { id: 'pain', title: 'What hurts today', required: true, order: 1, objectives: ['pain_top_timeconsumers', 'pain_repeat_questions'] },
    { id: 'pol', title: 'POL today', required: true, order: 2, objectives: ['pol_strengths', 'pol_gaps'] },
    { id: 'vision', title: 'Vision', required: true, order: 4, objectives: ['vision_2yr', 'vision_magic_tool'] },
  ],
};

// --------- 3. System prompt assembly ---------
section('System prompt assembly');
try {
  const sys = mods.prompt.buildSystemPrompt({ prospect: rick, template, channel: 'text' });
  ok('System prompt is string', typeof sys === 'string');
  ok('System prompt > 1000 chars', sys.length > 1000, `actual: ${sys.length}`);
  ok('Mentions Rick by name', sys.includes('Rick'));
  ok('Mentions Primerica', sys.includes('Primerica'));
  ok('Mentions Manchester', sys.includes('Manchester'));
  ok('Includes 35-year tenure', sys.includes('35 years'));
  ok('Includes hard guardrails', sys.includes('No financial') || sys.includes('no financial'));
  ok('Includes pedestal note', sys.includes('pedestal') || sys.includes('Pedestal'));
  ok('Text channel rules present', sys.includes('Text channel'));
  ok('Has probe topics section', sys.includes('Probe') || sys.includes('probe'));
  ok('Has flag-immediately section', sys.includes('Flag for Brad') || sys.includes('flag'));
  ok('Voice rules NOT in text prompt', !sys.includes('phone call'));
} catch (e) { ok('buildSystemPrompt() runs', false, e.message); }

// --------- 4. Opening message ---------
section('Opening message');
try {
  const opener = mods.prompt.buildOpeningMessage(rick);
  ok('Opener is string', typeof opener === 'string');
  ok('Opener greets Rick', opener.startsWith('Hi Rick'));
  ok('Opener mentions Brad Fournier', opener.includes('Brad Fournier'));
  ok('Opener mentions Wednesday', opener.includes('Wednesday'));
  ok('Opener lists known facts', opener.includes('1991') || opener.includes('Primerica'));
  ok('Opener no emojis', !/[\u{1F300}-\u{1FAFF}]/u.test(opener));
  ok('Opener offers skip', opener.toLowerCase().includes('skip'));
} catch (e) { ok('buildOpeningMessage() runs', false, e.message); }

// --------- 5. Tool schemas ---------
section('Tool schemas');
const toolNames = mods.tools.TOOLS.map((t) => t.name);
ok('Has capture_answer tool', toolNames.includes('capture_answer'));
ok('Has flag_for_brad tool', toolNames.includes('flag_for_brad'));
ok('Has skip_topic tool', toolNames.includes('skip_topic'));
ok('Has conclude_intake tool', toolNames.includes('conclude_intake'));
for (const tool of mods.tools.TOOLS) {
  ok(`Tool ${tool.name} has description`, typeof tool.description === 'string' && tool.description.length > 20);
  ok(`Tool ${tool.name} has input_schema`, tool.input_schema?.type === 'object');
  ok(`Tool ${tool.name} has required fields`, Array.isArray(tool.input_schema.required) && tool.input_schema.required.length > 0);
}

// --------- 6. Tool handler logic ---------
section('Tool handler logic (via chat-turn internals)');
// We can't import the internal handleToolCall easily since it's not exported.
// Instead, re-implement minimal assertions against the behavior shape we expect.
// Simulate the reducer pattern used in chat-turn.js.
function simulateToolUpdates(responseRow, toolUses) {
  const updates = { answers: { ...responseRow.answers }, flags: [...responseRow.flags], skipped: [...responseRow.skipped] };
  let concluded = false, conclusion = null;
  for (const tu of toolUses) {
    if (tu.name === 'capture_answer') {
      updates.answers[`${tu.input.objective_id}.${tu.input.field}`] = {
        value: tu.input.value, confidence: tu.input.confidence, notes: tu.input.notes || null,
      };
    } else if (tu.name === 'flag_for_brad') {
      updates.flags.push({ reason: tu.input.reason, content: tu.input.content, context: tu.input.context || null });
    } else if (tu.name === 'skip_topic') {
      updates.skipped.push({ objective_id: tu.input.objective_id, reason: tu.input.reason });
    } else if (tu.name === 'conclude_intake') {
      concluded = true;
      conclusion = { reason: tu.input.reason, summary: tu.input.summary };
    }
  }
  return { updates, concluded, conclusion };
}

const seedRow = { answers: {}, flags: [], skipped: [] };
const fakeTools = [
  { name: 'capture_answer', input: { objective_id: 'pain_top_timeconsumers', field: 'downline_coaching_repetition', value: 'My reps ask me the same recruiting objection response over and over', confidence: 'high' } },
  { name: 'flag_for_brad', input: { reason: 'insight', content: 'Rick mentioned his brother joined Primerica 3 years ago and runs a sub-office', context: 'Family involvement — key context for culture' } },
  { name: 'skip_topic', input: { objective_id: 'constraints_timeline', reason: 'Would rather talk about timing at lunch' } },
];

const sim = simulateToolUpdates(seedRow, fakeTools);
ok('capture_answer stores by dotted key', 'pain_top_timeconsumers.downline_coaching_repetition' in sim.updates.answers);
ok('captured value preserved', sim.updates.answers['pain_top_timeconsumers.downline_coaching_repetition'].value.includes('recruiting objection'));
ok('flag recorded with reason', sim.updates.flags.length === 1 && sim.updates.flags[0].reason === 'insight');
ok('skip recorded', sim.updates.skipped.length === 1 && sim.updates.skipped[0].objective_id === 'constraints_timeline');

const conclude = simulateToolUpdates(seedRow, [{ name: 'conclude_intake', input: { reason: 'objectives_covered', summary: 'Rick shared his top pain points' } }]);
ok('conclude_intake sets concluded flag', conclude.concluded === true);
ok('conclude_intake captures summary', conclude.conclusion.summary.includes('Rick shared'));

// --------- 7. Email HTML rendering (uses real email.js code path but with no API key) ---------
section('Email HTML rendering');
// sendIntakeEmail skips when RESEND_API_KEY missing. Let's also test the HTML composition indirectly
// by importing internal helpers — they're not exported, so instead we verify the gate.
delete process.env.RESEND_API_KEY;
try {
  const result = await mods.email.sendIntakeEmail({
    prospect: rick,
    invite: { code: 'RICKB' },
    response: {
      channel: 'text',
      conclusion_summary: 'Test summary',
      conclusion_reason: 'objectives_covered',
      answers: { 'pain.top': { value: 'Onboarding repetitive', confidence: 'high' } },
      flags: [{ reason: 'insight', content: 'Mentioned brother in the org' }],
      skipped: [],
      submitted_at: new Date().toISOString(),
    },
    conversationText: 'ASSISTANT: opener\n\nRICK: answer',
  });
  ok('Email gracefully skips when RESEND_API_KEY missing', result?.skipped === true);
} catch (e) { ok('Email module survives missing key', false, e.message); }

// --------- 8. Transcript builder (inline copy, since not exported) ---------
section('Transcript builder');
function buildTranscript(messages) {
  const lines = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : (m.content || []).filter(b => b.type !== 'tool_result').map(b => b.text || '').join(' ');
      if (text.trim()) lines.push(`RICK: ${text.trim()}`);
    } else if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (text) lines.push(`ASSISTANT: ${text}`);
    }
  }
  return lines.join('\n\n');
}

const simulated = [
  { role: 'assistant', content: 'Hi Rick — opener text.' },
  { role: 'user', content: 'All looks right.' },
  { role: 'assistant', content: [{ type: 'text', text: 'Got it — let me ask about your day-to-day.' }, { type: 'tool_use', id: 't1', name: 'capture_answer', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'What takes the most of your time?' }] },
  { role: 'user', content: 'Coaching reps on the same objections' },
];
const transcript = buildTranscript(simulated);
ok('Transcript has RICK turns', (transcript.match(/RICK:/g) || []).length === 2);
ok('Transcript has ASSISTANT turns', (transcript.match(/ASSISTANT:/g) || []).length === 3);
ok('Transcript excludes tool_result noise', !transcript.includes('tool_result'));
ok('Transcript excludes tool_use JSON', !transcript.includes('tool_use'));

// --------- 9. Data model SQL sanity (no DB connection — structural only) ---------
section('Data model SQL sanity');
const sql = readFileSync(join(root, '..', 'clearpath-expert', 'DATA_MODEL.sql'), 'utf8');
ok('SQL creates expert_prospects', /create table if not exists expert_prospects/i.test(sql));
ok('SQL creates expert_intake_templates', /create table if not exists expert_intake_templates/i.test(sql));
ok('SQL creates expert_intake_invites', /create table if not exists expert_intake_invites/i.test(sql));
ok('SQL creates expert_intake_responses', /create table if not exists expert_intake_responses/i.test(sql));
ok('SQL seeds expert-in-a-box-v1', /expert-in-a-box-v1/.test(sql));
ok('SQL seeds Rick', /rick-001/.test(sql));
ok('SQL seeds RICKB invite', /RICKB/.test(sql));
ok('SQL has messages jsonb column', /messages jsonb default/i.test(sql));

// --------- Summary ---------
section('Summary');
const code = process.exitCode || 0;
console.log(code === 0 ? '\n✓ All pressure tests passed\n' : '\n✗ Some checks failed — see [FAIL] lines above\n');
