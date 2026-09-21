import { Resend } from 'resend';
import { supabase } from './_lib/supabase.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  let body = {};
  try { body = event?.body ? JSON.parse(event.body) : {}; } catch { /* malformed event body */ }
  const payload = event?.payload || body?.payload || {};
  const formName = payload.form_name || payload.formName || payload?.form?.name;
  if (formName !== 'opening-list') return response(200, { ignored: true });

  const data = payload.data || {};
  const email = String(data.email || '').trim();
  const zip = String(data.zip || '').trim();
  if (!email || !email.includes('@')) {
    console.warn('Opening-list submission did not contain a valid email address.');
    return response(200, { skipped: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured; signup remains stored in Netlify Forms.');
    return response(200, { stored: true, emailSkipped: true });
  }

  const resend = new Resend(apiKey);
  const from = process.env.FOUNDING_LIST_FROM || 'ClearPath Automotive <noreply@driveclearpath.com>';
  const notifyEmail = process.env.FOUNDING_LIST_NOTIFY_EMAIL || process.env.INTAKE_NOTIFY_EMAIL || 'info@driveclearpath.com';
  const submittedAt = payload.created_at || new Date().toISOString();
  const emailNormalized = email.toLowerCase();
  const submissionId = payload.id ? String(payload.id) : null;
  const consentLanguage = 'Meaningful opening updates only. No spam. No sold lists. Unsubscribe anytime.';

  let foundingRecord = null;
  try {
    const db = supabase();
    const { data: row, error } = await db
      .from('automotive_founding_list')
      .upsert({
        email,
        email_normalized: emailNormalized,
        zip: zip || null,
        status: 'subscribed',
        source: 'website_opening_list',
        marketing_email_opt_in: true,
        consent_language: consentLanguage,
        consented_at: submittedAt,
        netlify_submission_id: submissionId,
        last_signup_at: submittedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email_normalized' })
      .select('id, confirmation_sent_at, unsubscribe_token')
      .single();
    if (error) throw error;
    foundingRecord = row;
  } catch (error) {
    // Netlify Forms remains the durable fallback if Supabase is unavailable.
    console.error('Could not sync founding-list signup to Supabase:', error);
  }

  const unsubscribeUrl = foundingRecord?.unsubscribe_token ? `https://driveclearpath.com/founding-list/unsubscribe?token=${foundingRecord.unsubscribe_token}` : 'mailto:info@driveclearpath.com?subject=Unsubscribe%20from%20the%20ClearPath%20founding%20list';
  const subject = 'Thank you for believing in ClearPath';
  const text = `You’re in early.

I sincerely appreciate you joining the ClearPath Automotive founding list. Your support for this vision means more to me and my family than you may realize.

Our family has faced an unexpected health setback that changed the pace of this journey. It has also reinforced why ClearPath needs to be built thoughtfully—with patience, strong standards, and the right foundation.

We hope to bring this vision together sooner rather than later, but I do not want to promise a date before the location, team, tools, systems, and timing are truly ready. We plan to do this right.

Thank you for being here early and for supporting what we are working toward. We will share meaningful milestones as ClearPath takes shape, and you will be among the first to know when scheduling begins.

With sincere appreciation,
Brad Fournier
Founder, ClearPath Automotive

Clear answers. Confident repairs.
Greater Manchester, New Hampshire
https://driveclearpath.com

Email preferences: ${unsubscribeUrl}
`;

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#eef3f2;font-family:Arial,Helvetica,sans-serif;color:#10202b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fdfcf8;border-radius:14px;overflow:hidden;border:1px solid rgba(11,33,57,.12)">
        <tr><td style="background:#0b2139;padding:30px 38px;color:#fff">
          <img src="https://driveclearpath.com/assets/clearpath-automotive-white.png?v=20260920-straight" width="250" alt="ClearPath Automotive" style="display:block;width:250px;max-width:100%;height:auto;border:0;color:#fff;font-size:18px;font-weight:700">
        </td></tr>
        <tr><td style="padding:42px 38px 20px">
          <div style="color:#e9683b;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">A personal note from Brad</div>
          <h1 style="margin:18px 0 22px;color:#0b2139;font-family:Georgia,'Times New Roman',serif;font-size:46px;line-height:1.02;font-weight:400">You’re in early.</h1>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75">I sincerely appreciate you joining the ClearPath Automotive founding list. Your support for this vision means more to me and my family than you may realize.</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75">Our family has faced an unexpected health setback that changed the pace of this journey. It has also reinforced why ClearPath needs to be built thoughtfully—with patience, strong standards, and the right foundation.</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75">We hope to bring this vision together sooner rather than later, but I don’t want to promise a date before the location, team, tools, systems, and timing are truly ready. <strong style="color:#0b2139">We plan to do this right.</strong></p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.75">Thank you for being here early and for supporting what we’re working toward. We’ll share meaningful milestones as ClearPath takes shape, and you’ll be among the first to know when scheduling begins.</p>
          <p style="margin:0;color:#0b2139;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.5"><em>With sincere appreciation,</em><br><strong>Brad Fournier</strong><br><span style="font-family:Arial,Helvetica,sans-serif;color:#60707a;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Founder, ClearPath Automotive</span></p>
        </td></tr>
        <tr><td style="padding:18px 38px 40px">
          <a href="https://driveclearpath.com" style="display:inline-block;background:#e9683b;color:#fff;text-decoration:none;border-radius:7px;padding:14px 20px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase">Visit ClearPath &nbsp;→</a>
        </td></tr>
        <tr><td style="background:#071727;padding:24px 38px;color:rgba(255,255,255,.7);font-size:12px;line-height:1.6">
          <strong style="color:#fff">Clear answers. Confident repairs.</strong><br>
          Greater Manchester, New Hampshire<br>
          <span style="color:rgba(255,255,255,.48)">You received this because you joined the founding list at driveclearpath.com. <a href="${unsubscribeUrl}" style="color:#b4d4df">Unsubscribe</a>.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  let visitorSend = null;
  if (!foundingRecord?.confirmation_sent_at) {
    visitorSend = await resend.emails.send({
      from,
      to: email,
      replyTo: 'info@driveclearpath.com',
      subject,
      text,
      html,
    });
    if (visitorSend?.error) throw new Error(visitorSend.error.message || 'Resend confirmation failed');

    if (foundingRecord?.id) {
      try {
        const db = supabase();
        const { error } = await db
          .from('automotive_founding_list')
          .update({
            confirmation_sent_at: new Date().toISOString(),
            resend_email_id: visitorSend?.data?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', foundingRecord.id);
        if (error) throw error;
      } catch (error) {
        console.error('Confirmation sent, but delivery metadata could not be saved:', error);
      }
    }
  }

  const internalHtml = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#10202b;line-height:1.6">
    <h2 style="color:#0b2139">New ClearPath founding-list signup</h2>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br>
    <strong>ZIP code:</strong> ${escapeHtml(zip || 'Not provided')}<br>
    <strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
    <p style="color:#60707a;font-size:13px">The full submission is stored in Netlify Forms under <strong>opening-list</strong>.</p>
  </body></html>`;

  if (visitorSend || !foundingRecord) {
    try {
      const notification = await resend.emails.send({
        from,
        to: notifyEmail,
        replyTo: email,
        subject: `New founding-list signup${zip ? ` — ${zip}` : ''}`,
        html: internalHtml,
      });
      if (notification?.error) throw new Error(notification.error.message || 'Resend notification failed');
    } catch (error) {
      console.error('Visitor confirmation sent, but internal signup notification failed:', error);
    }
  }

  return response(200, {
    sent: Boolean(visitorSend),
    alreadyConfirmed: Boolean(foundingRecord?.confirmation_sent_at),
    id: visitorSend?.data?.id || null,
    storedInSupabase: Boolean(foundingRecord?.id),
  });
}
