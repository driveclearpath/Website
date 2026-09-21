import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const file = process.argv.find(x => x.endsWith('.json')) || 'content/founding-list-update.example.json';
const send = process.argv.includes('--send');
const content = JSON.parse(await fs.readFile(file, 'utf8'));
for (const key of ['subject','eyebrow','headline','paragraphs']) if (!content[key]) throw new Error(`Missing ${key} in ${file}`);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: leads, error } = await db.from('automotive_founding_list').select('email,unsubscribe_token').eq('status','subscribed').eq('marketing_email_opt_in',true);
if (error) throw error;
console.log(`${send ? 'SEND' : 'DRY RUN'}: ${leads.length} subscribed recipient(s); subject: ${content.subject}`);
if (!send) { console.log('Review the JSON, then rerun with --send to deliver.'); process.exit(0); }
const resend = new Resend(process.env.RESEND_API_KEY);
const { data: campaign, error: campaignError } = await db.from('automotive_founding_list_updates').insert({ subject: content.subject, headline: content.headline, recipient_count: leads.length, status: 'sending' }).select('id').single();
if (campaignError) throw campaignError;
let sent=0,failed=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for (const lead of leads) { const unsubscribe=`https://driveclearpath.com/founding-list/unsubscribe?token=${lead.unsubscribe_token}`; const paragraphs=content.paragraphs.map(p=>`<p style="margin:0 0 18px;font-size:16px;line-height:1.75">${esc(p)}</p>`).join(''); const html=`<!doctype html><html><body style="margin:0;background:#eef3f2;font-family:Arial,sans-serif;color:#10202b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:640px;background:#fdfcf8;border-radius:14px;overflow:hidden"><tr><td style="background:#0b2139;padding:30px 38px"><img src="https://driveclearpath.com/assets/clearpath-automotive-white.png" width="250" alt="ClearPath Automotive"></td></tr><tr><td style="padding:42px 38px"><div style="color:#e9683b;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">${esc(content.eyebrow)}</div><h1 style="color:#0b2139;font:400 44px Georgia,serif">${esc(content.headline)}</h1>${paragraphs}<a href="${esc(content.buttonUrl||'https://driveclearpath.com')}" style="display:inline-block;background:#e9683b;color:#fff;text-decoration:none;border-radius:7px;padding:14px 20px;font-size:12px;font-weight:800">${esc(content.buttonLabel||'Visit ClearPath')} →</a></td></tr><tr><td style="background:#071727;padding:24px 38px;color:#9ca9b3;font-size:12px">Clear answers. Confident repairs.<br><a href="${unsubscribe}" style="color:#b4d4df">Unsubscribe</a> from founding-list updates.</td></tr></table></td></tr></table></body></html>`; try { const result=await resend.emails.send({ from: process.env.FOUNDING_LIST_FROM || 'ClearPath Automotive <noreply@driveclearpath.com>', to: lead.email, replyTo:'info@driveclearpath.com', subject:content.subject, html, text:`${content.headline}\n\n${content.paragraphs.join('\n\n')}\n\n${content.buttonUrl||'https://driveclearpath.com'}\n\nUnsubscribe: ${unsubscribe}` }); if(result.error) throw result.error; sent++; } catch(e) { failed++; console.error(`Delivery failed for ${lead.email}: ${e.message}`); } }
await db.from('automotive_founding_list_updates').update({ sent_count:sent, failed_count:failed, status:failed?(sent?'partial':'failed'):'sent', sent_at:new Date().toISOString() }).eq('id',campaign.id);
console.log(`Finished: ${sent} sent, ${failed} failed.`);
