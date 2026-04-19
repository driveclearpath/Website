// Claude smoke test — exercises the full chat-turn pipeline against Anthropic
// without Netlify. Confirms: model access, tool calling, prompt quality.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt, buildOpeningMessage } from '../netlify/functions/_lib/prompt.js';
import { TOOLS } from '../netlify/functions/_lib/tools.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
const supaUrl = process.env.SUPABASE_URL;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!apiKey || !supaUrl || !supaKey) { console.error('Missing env vars'); process.exit(1); }

const db = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

// Pull Rick + template from DB — exact path chat-turn takes
const { data: invite } = await db
  .from('expert_intake_invites')
  .select('*, expert_prospects(*), expert_intake_templates(*)')
  .eq('code', 'RICKB')
  .single();

const prospect = invite.expert_prospects;
const template = invite.expert_intake_templates;
const system = buildSystemPrompt({ prospect, template, channel: 'text' });
const opener = buildOpeningMessage(prospect);

console.log('=== SYSTEM PROMPT (first 400 chars) ===');
console.log(system.slice(0, 400) + '...\n');
console.log('=== OPENER ===');
console.log(opener + '\n');

const client = new Anthropic({ apiKey });

// Simulate: opener already shown, Rick replies
const messages = [
  { role: 'assistant', content: opener },
  { role: 'user', content: "Yeah that all looks right. Brother Paul joined a few years back and runs our Manchester South office — about 14 reps under him now. Biggest pain these days is I'm answering the same recruiting objections over and over. New reps all hit the wall at the same spot with the 'I already have a Northwestern Mutual guy' response." },
];

console.log('=== USER MESSAGE ===');
console.log(messages[1].content + '\n');

console.log('=== CALLING CLAUDE (model: ' + (template.model_id || 'claude-opus-4-7') + ') ===');
const t0 = Date.now();

let resp;
try {
  resp = await client.messages.create({
    model: template.model_id || 'claude-opus-4-7',
    max_tokens: 1024,
    system,
    tools: TOOLS,
    messages,
  });
} catch (err) {
  console.error('\u2717 Claude API error:', err.status, err.message);
  if (err.message?.includes('model')) {
    console.error('\nLikely fix: the model id is wrong or your key lacks access.');
    console.error('Try: update expert_intake_templates.model_id to claude-sonnet-4-6');
  }
  process.exit(1);
}

const ms = Date.now() - t0;
console.log(`\u2713 Response in ${ms}ms, stop_reason: ${resp.stop_reason}\n`);

const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
const tools = resp.content.filter((b) => b.type === 'tool_use');

console.log('=== ASSISTANT TEXT ===');
console.log(text || '(none)');

console.log('\n=== TOOL CALLS ===');
if (tools.length === 0) {
  console.log('(none — model did not call any tools)');
} else {
  for (const t of tools) {
    console.log(`\n[${t.name}]`);
    console.log(JSON.stringify(t.input, null, 2));
  }
}

console.log('\n=== USAGE ===');
console.log(`  input_tokens:  ${resp.usage.input_tokens}`);
console.log(`  output_tokens: ${resp.usage.output_tokens}`);
