import { supabase } from './_lib/supabase.js';

export async function handler(event) {
  const token = String(event.queryStringParameters?.token || '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { statusCode: 400, body: 'Invalid unsubscribe link.' };
  const now = new Date().toISOString();
  const { data, error } = await supabase().from('automotive_founding_list').update({ status: 'unsubscribed', marketing_email_opt_in: false, unsubscribed_at: now, updated_at: now }).eq('unsubscribe_token', token).select('id').maybeSingle();
  if (error) return { statusCode: 500, body: 'We could not update your preferences. Please email info@driveclearpath.com.' };
  if (!data) return { statusCode: 404, body: 'This unsubscribe link was not found.' };
  return { statusCode: 302, headers: { location: '/unsubscribe.html' }, body: '' };
}
