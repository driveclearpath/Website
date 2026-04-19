// Verifies the seed landed. Queries Rick's invite + prospect via the Supabase SDK.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: invite, error: inviteErr } = await db
  .from('expert_intake_invites')
  .select('code, expires_at, expert_prospects(slug, display_name, title, firm), expert_intake_templates(id, name, version, model_id)')
  .eq('code', 'RICKB')
  .maybeSingle();

if (inviteErr) { console.error('Query error:', inviteErr); process.exit(1); }
if (!invite) { console.error('No invite found for RICKB'); process.exit(1); }

console.log('Invite found:');
console.log(JSON.stringify(invite, null, 2));

const { count: prospectCount } = await db.from('expert_prospects').select('*', { count: 'exact', head: true });
const { count: templateCount } = await db.from('expert_intake_templates').select('*', { count: 'exact', head: true });
const { count: inviteCount }   = await db.from('expert_intake_invites').select('*', { count: 'exact', head: true });
const { count: responseCount } = await db.from('expert_intake_responses').select('*', { count: 'exact', head: true });

console.log('\nRow counts:');
console.log('  expert_prospects:         ', prospectCount);
console.log('  expert_intake_templates:  ', templateCount);
console.log('  expert_intake_invites:    ', inviteCount);
console.log('  expert_intake_responses:  ', responseCount);
