// Dump the raw Claude message history for the current intake.
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: invite } = await db.from('expert_intake_invites').select('id').eq('code', 'RICKB').single();
const { data: row } = await db.from('expert_intake_responses').select('messages').eq('invite_id', invite.id).single();

const msgs = row.messages || [];
console.log(`Total messages: ${msgs.length}\n`);

msgs.forEach((m, i) => {
  const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
  console.log(`[${i}] role=${m.role}`);
  blocks.forEach((b, j) => {
    if (b.type === 'text') {
      console.log(`   text: ${(b.text || '').slice(0, 200)}${(b.text || '').length > 200 ? '…' : ''}`);
    } else if (b.type === 'tool_use') {
      console.log(`   tool_use: ${b.name}(${JSON.stringify(b.input).slice(0, 150)})`);
    } else if (b.type === 'tool_result') {
      console.log(`   tool_result: ${String(b.content).slice(0, 80)}`);
    } else {
      console.log(`   ${b.type}: ${JSON.stringify(b).slice(0, 120)}`);
    }
  });
});
