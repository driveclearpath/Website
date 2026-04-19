// Inspect the current intake response row — what got captured, flagged, skipped.
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row } = await db
  .from('expert_intake_responses')
  .select('*, expert_intake_invites(code), expert_prospects(display_name)')
  .eq('expert_intake_invites.code', 'RICKB')
  .order('started_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!row) { console.log('No response row yet.'); process.exit(0); }

console.log('Channel:', row.channel, '| Turns:', row.turn_count, '| Submitted:', row.submitted_at || '(in progress)');
console.log('\nAnswers captured:');
for (const [k, v] of Object.entries(row.answers || {})) {
  console.log(`  [${v.confidence}] ${k}`);
  console.log(`    "${v.value}"`);
}
console.log('\nFlags:');
for (const f of (row.flags || [])) {
  console.log(`  [${f.reason}] ${f.content}`);
  if (f.context) console.log(`    → ${f.context}`);
}
console.log('\nSkipped:', (row.skipped || []).length ? JSON.stringify(row.skipped, null, 2) : '(none)');
console.log('\nMessage count in history:', (row.messages || []).length);
