// Magic-link confirmation endpoint. Visitor clicks the link in their email →
// we mark the session confirmed and notify Brad. Without this click, Brad
// never sees the intake.
//
// GET /api/confirm-intake?token=<uuid>
// → 302 redirect to /intake-public.html?confirmed=1 on success
// → 302 redirect to /intake-public.html?confirmed=0&reason=<...> on failure

import { supabase } from './_lib/supabase.js';
import { sendBradHandoff } from './_lib/publicEmail.js';

const SITE = process.env.PUBLIC_SITE_URL || 'https://driveclearpath.com';

function redirect(query) {
  return {
    statusCode: 302,
    headers: { Location: `${SITE}/intake-public.html?${query}` },
    body: '',
  };
}

export async function handler(event) {
  // Magic links are GETs. Accept POST too for testability.
  const params = event.queryStringParameters || {};
  const token = params.token;

  if (!token) return redirect('confirmed=0&reason=missing_token');

  const db = supabase();
  const { data: row, error } = await db
    .from('public_intake_responses')
    .select('*')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (error || !row) return redirect('confirmed=0&reason=invalid_token');

  // Re-clicking an already-confirmed link should still land on the success page.
  if (row.confirmed_at) return redirect('confirmed=1');

  // Quality gate failure should not have produced a token in the first place,
  // but defend against it: only confirm + notify when the row is in good standing.
  if (!row.quality_passed) return redirect('confirmed=0&reason=quarantined');

  const nowIso = new Date().toISOString();
  const updates = { confirmed_at: nowIso };

  // Send Brad's handoff email. Only mark notified_brad_at if it actually sent —
  // a Resend failure shouldn't strand the row in a "looks-notified-but-isn't" state.
  let notified = false;
  try {
    const result = await sendBradHandoff({
      row: { ...row, confirmed_at: nowIso },
      transcript: row.transcript || '',
    });
    if (result?.sent) {
      updates.notified_brad_at = nowIso;
      notified = true;
    }
  } catch (err) {
    console.error('Brad handoff email failed:', err);
  }

  await db.from('public_intake_responses').update(updates).eq('id', row.id);

  return redirect(notified ? 'confirmed=1' : 'confirmed=1&notify=pending');
}
