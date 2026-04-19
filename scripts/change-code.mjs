// Rename an invite code and reset its session. Usage: node --env-file=.env change-code.mjs OLD NEW
import { createClient } from '@supabase/supabase-js';

const [oldCode, newCode] = process.argv.slice(2);
if (!oldCode || !newCode) { console.error('Usage: change-code.mjs OLD NEW'); process.exit(1); }

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: invite, error } = await db
  .from('expert_intake_invites')
  .update({ code: newCode, opened_at: null, consumed_at: null })
  .eq('code', oldCode)
  .select('id, code')
  .maybeSingle();

if (error || !invite) { console.error('Update failed:', error?.message || 'no match'); process.exit(1); }

await db.from('expert_intake_responses').delete().eq('invite_id', invite.id);

console.log(`Renamed: ${oldCode} → ${invite.code}, response reset.`);
