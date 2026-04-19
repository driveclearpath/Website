// Reset an invite to a fresh state — deletes any response row and clears opened/consumed timestamps.
// Usage: node --env-file=.env scripts/reset-invite.mjs CHESTNUT-735

import { createClient } from '@supabase/supabase-js';

const code = process.argv[2];
if (!code) { console.error('Usage: reset-invite.mjs <code>'); process.exit(1); }

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: invite } = await db
  .from('expert_intake_invites')
  .select('id')
  .eq('code', code)
  .maybeSingle();

if (!invite) { console.error(`No invite "${code}"`); process.exit(1); }

const del = await db.from('expert_intake_responses').delete().eq('invite_id', invite.id);
const upd = await db
  .from('expert_intake_invites')
  .update({ opened_at: null, consumed_at: null })
  .eq('id', invite.id);

console.log(`Reset invite ${code}: response deleted, opened/consumed cleared.`);
console.log('Ready for a fresh session.');
