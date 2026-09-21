import { Resend } from 'resend';

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

  const subject = 'You’re on the ClearPath founding list';
  const text = `You’re in early.

Thank you for joining the ClearPath Automotive founding list.

We do not have an opening timeline to announce yet—and we will not manufacture one simply to create urgency. We are working deliberately toward the goal. The location, team, tools, systems, and timing all need to come together properly.

Our standards are high because they need to be. We want every important detail to be right before the doors open.

We will send meaningful milestones as ClearPath takes shape, and you will be among the first to know when scheduling begins.

Clear answers. Confident repairs.
Greater Manchester, New Hampshire
https://driveclearpath.com
`;

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#eef3f2;font-family:Arial,Helvetica,sans-serif;color:#10202b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fdfcf8;border-radius:14px;overflow:hidden;border:1px solid rgba(11,33,57,.12)">
        <tr><td style="background:#0b2139;padding:30px 38px;color:#fff">
          <div style="font-size:24px;font-weight:800;letter-spacing:.12em">CLEARPATH</div>
          <div style="margin-top:5px;font-size:9px;font-weight:700;letter-spacing:.52em">AUTOMOTIVE</div>
        </td></tr>
        <tr><td style="padding:42px 38px 20px">
          <div style="color:#e9683b;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">The road to opening</div>
          <h1 style="margin:18px 0 22px;color:#0b2139;font-family:Georgia,'Times New Roman',serif;font-size:46px;line-height:1.02;font-weight:400">You’re in early.</h1>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75">Thank you for joining the ClearPath Automotive founding list.</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75">We do not have an opening timeline to announce yet—and we will not manufacture one simply to create urgency. We are working deliberately toward the goal. The location, team, tools, systems, and timing all need to come together properly.</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.75"><strong style="color:#0b2139">Our standards are high because they need to be.</strong> We want every important detail to be right before the doors open.</p>
          <p style="margin:0;font-size:16px;line-height:1.75">We’ll send meaningful milestones as ClearPath takes shape, and you’ll be among the first to know when scheduling begins.</p>
        </td></tr>
        <tr><td style="padding:18px 38px 40px">
          <a href="https://driveclearpath.com" style="display:inline-block;background:#e9683b;color:#fff;text-decoration:none;border-radius:7px;padding:14px 20px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase">Visit ClearPath &nbsp;→</a>
        </td></tr>
        <tr><td style="background:#071727;padding:24px 38px;color:rgba(255,255,255,.7);font-size:12px;line-height:1.6">
          <strong style="color:#fff">Clear answers. Confident repairs.</strong><br>
          Greater Manchester, New Hampshire<br>
          <span style="color:rgba(255,255,255,.48)">You received this because you joined the founding list at driveclearpath.com.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const visitorSend = await resend.emails.send({
    from,
    to: email,
    replyTo: 'info@driveclearpath.com',
    subject,
    text,
    html,
  });

  const internalHtml = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#10202b;line-height:1.6">
    <h2 style="color:#0b2139">New ClearPath founding-list signup</h2>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br>
    <strong>ZIP code:</strong> ${escapeHtml(zip || 'Not provided')}<br>
    <strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
    <p style="color:#60707a;font-size:13px">The full submission is stored in Netlify Forms under <strong>opening-list</strong>.</p>
  </body></html>`;

  try {
    await resend.emails.send({
      from,
      to: notifyEmail,
      replyTo: email,
      subject: `New founding-list signup${zip ? ` — ${zip}` : ''}`,
      html: internalHtml,
    });
  } catch (error) {
    console.error('Visitor confirmation sent, but internal signup notification failed:', error);
  }

  return response(200, { sent: true, id: visitorSend?.data?.id || null });
}
