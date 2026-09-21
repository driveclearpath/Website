import crypto from 'node:crypto';
import { supabase } from './_lib/supabase.js';

const reply = (statusCode, body, extra = {}) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const safeEqual = (a, b) => { const aa = Buffer.from(a || ''), bb = Buffer.from(b || ''); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); };
const csvCell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;

export async function handler(event) {
  const expected = process.env.FOUNDING_LIST_ADMIN_TOKEN;
  if (!expected) return reply(503, { error: 'Dashboard access is not configured.' });
  const supplied = String(event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized.' });
  const { data: rows, error } = await supabase().from('automotive_founding_list').select('email,zip,status,marketing_email_opt_in,confirmation_sent_at,consented_at,last_signup_at,created_at').order('created_at', { ascending: false }).limit(5000);
  if (error) return reply(500, { error: 'Could not load founding-list data.' });
  if (event.queryStringParameters?.format === 'csv') {
    const fields = ['email','zip','status','marketing_email_opt_in','confirmation_sent_at','consented_at','last_signup_at','created_at'];
    const csv = [fields.join(','), ...rows.map(row => fields.map(k => csvCell(row[k])).join(','))].join('\r\n');
    return reply(200, csv, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="clearpath-founding-list.csv"' });
  }
  const zips = new Map(); rows.forEach(r => { if (r.zip) zips.set(r.zip, (zips.get(r.zip) || 0) + 1); });
  return reply(200, { summary: { total: rows.length, subscribed: rows.filter(r => r.status === 'subscribed').length, confirmed: rows.filter(r => r.confirmation_sent_at).length, unsubscribed: rows.filter(r => r.status === 'unsubscribed').length }, zipDistribution: [...zips].map(([zip,count]) => ({zip,count})).sort((a,b) => b.count-a.count), recent: rows.slice(0,100) });
}
