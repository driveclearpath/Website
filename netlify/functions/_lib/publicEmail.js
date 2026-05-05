// Email templates for the public intake — magic-link confirmation to the visitor,
// and the post-confirmation handoff to Brad.

import { Resend } from 'resend';

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function siteUrl() {
  return process.env.PUBLIC_SITE_URL || 'https://driveclearpath.com';
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Send the magic-link confirmation to the visitor. Brad is NOT notified until
 * they click this link.
 */
export async function sendVisitorConfirmation({ visitorName, visitorEmail, confirmationToken }) {
  const resend = getResend();
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping confirmation email');
    return { skipped: true };
  }

  const from = process.env.PUBLIC_INTAKE_FROM || 'Brad at ClearPath <intake@driveclearpath.com>';
  const confirmUrl = `${siteUrl()}/api/confirm-intake?token=${encodeURIComponent(confirmationToken)}`;
  const firstName = visitorName.split(/\s+/)[0] || 'there';

  const subject = 'One click to send your notes to Brad';

  const text = `Hi ${firstName},

Thanks for taking five minutes with my AI assistant. To send your notes over and let me reach back out, click here:

${confirmUrl}

This is a one-step spam check — without the click, I never see what you wrote. Most people click and I get the email within seconds.

If you didn't start this on driveclearpath.com, you can ignore this message. Nothing else happens.

— Brad
`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.55">
  <p style="margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
  <p style="margin:0 0 16px">Thanks for taking five minutes with my AI assistant. To send your notes over and let me reach back out, click the button below.</p>
  <p style="margin:24px 0">
    <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Send my notes to Brad &rarr;</a>
  </p>
  <p style="margin:0 0 16px;color:#555;font-size:14px">This is a one-step spam check — without the click, I never see what you wrote. Most people click and I get the email within seconds.</p>
  <p style="margin:0 0 16px;color:#555;font-size:14px">If the button doesn't work, paste this link into your browser:<br><a href="${escapeHtml(confirmUrl)}" style="color:#1a1a1a;word-break:break-all">${escapeHtml(confirmUrl)}</a></p>
  <p style="margin:24px 0 0;color:#888;font-size:13px">If you didn't start this on driveclearpath.com, ignore this message. Nothing else happens.</p>
  <p style="margin:16px 0 0;color:#1a1a1a">— Brad</p>
</body></html>`;

  await resend.emails.send({
    from,
    to: visitorEmail,
    subject,
    text,
    html,
  });

  return { sent: true };
}

function renderAnswers(answers = {}) {
  const entries = Object.entries(answers);
  if (!entries.length) return '<p><em>No structured answers captured.</em></p>';
  const rows = entries
    .map(([key, data]) => {
      const value = typeof data === 'string' ? data : data?.value || JSON.stringify(data);
      const confidence = data?.confidence ? ` <span style="color:#888;font-size:12px">(${data.confidence})</span>` : '';
      const notes = data?.notes ? `<div style="color:#666;font-size:13px;margin-top:4px">${escapeHtml(data.notes)}</div>` : '';
      return `<tr>
        <td style="padding:8px 12px;vertical-align:top;border-bottom:1px solid #eee;font-weight:600;width:30%">${escapeHtml(key)}${confidence}</td>
        <td style="padding:8px 12px;vertical-align:top;border-bottom:1px solid #eee">${escapeHtml(value)}${notes}</td>
      </tr>`;
    })
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;
}

function renderFlags(flags = []) {
  if (!flags.length) return '<p><em>No flags.</em></p>';
  return (
    '<ul style="padding-left:18px;font-size:14px">' +
    flags
      .map(
        (f) =>
          `<li style="margin-bottom:10px"><strong style="color:#c0392b;text-transform:uppercase;font-size:12px">${escapeHtml(f.reason)}</strong><br>${escapeHtml(f.content)}${f.context ? `<div style="color:#666;margin-top:3px">${escapeHtml(f.context)}</div>` : ''}</li>`
      )
      .join('') +
    '</ul>'
  );
}

function fitBadge(fit) {
  const colors = {
    strong: '#0a7c33',
    possible: '#0a5c7c',
    unclear: '#7a6a00',
    weak: '#9a4400',
    not_a_fit: '#7a1a1a',
  };
  const color = colors[fit] || '#666';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${color};color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(fit || 'unknown')}</span>`;
}

/**
 * Send the post-confirmation handoff to Brad. Only called after the visitor
 * has clicked the magic link AND the quality gate passed.
 */
export async function sendBradHandoff({ row, transcript }) {
  const resend = getResend();
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping Brad handoff email');
    return { skipped: true };
  }

  const to = process.env.PUBLIC_INTAKE_NOTIFY_EMAIL || process.env.INTAKE_NOTIFY_EMAIL || 'info@driveclearpath.com';
  const from = process.env.PUBLIC_INTAKE_FROM || process.env.INTAKE_NOTIFY_FROM || 'intake@driveclearpath.com';

  const subject = `Public intake — ${row.visitor_name} (${row.fit_read || 'unknown fit'})`;

  const newVerticalFlag = (row.flags || []).some((f) => f.reason === 'new_vertical_pattern_fit');
  const verticalBanner = newVerticalFlag
    ? `<div style="padding:12px 16px;margin-bottom:16px;background:rgba(10,124,51,0.08);border:1px solid rgba(10,124,51,0.3);border-radius:8px;color:#0a5c33;font-size:13px"><strong>New-vertical pattern fit.</strong> The AI flagged this as a vertical you haven't built for yet but where the operator pattern fits — worth a closer look.</div>`
    : '';

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#222">
  <h2 style="margin:0 0 4px">${escapeHtml(row.visitor_name)} &middot; ${fitBadge(row.fit_read)}</h2>
  <div style="color:#666;margin-bottom:18px"><a href="mailto:${escapeHtml(row.visitor_email)}" style="color:#444">${escapeHtml(row.visitor_email)}</a></div>
  ${verticalBanner}

  <h3>Summary (AI)</h3>
  <p>${escapeHtml(row.conclusion_summary || '')}</p>
  <p style="color:#888;font-size:13px">Reason: ${escapeHtml(row.conclusion_reason || '')}</p>

  <h3>Flags</h3>
  ${renderFlags(row.flags)}

  <h3>Captured answers</h3>
  ${renderAnswers(row.answers)}

  <h3>Full transcript</h3>
  <pre style="background:#f5f5f5;padding:14px;border-radius:6px;white-space:pre-wrap;word-wrap:break-word;font-size:13px;font-family:ui-monospace,'Menlo',monospace">${escapeHtml(transcript || '')}</pre>

  <p style="color:#999;font-size:12px;margin-top:28px">Session: ${escapeHtml(row.id)} &middot; Started ${escapeHtml(row.started_at || '')} &middot; Submitted ${escapeHtml(row.submitted_at || '')} &middot; Confirmed ${escapeHtml(row.confirmed_at || '')}</p>
</body></html>`;

  await resend.emails.send({ from, to, subject, html });
  return { sent: true, to };
}
