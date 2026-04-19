import { Resend } from 'resend';

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function renderSkipped(skipped = []) {
  if (!skipped.length) return '';
  return (
    '<h3>Skipped topics</h3><ul style="padding-left:18px;font-size:14px">' +
    skipped.map((s) => `<li><strong>${escapeHtml(s.objective_id)}</strong> — ${escapeHtml(s.reason)}</li>`).join('') +
    '</ul>'
  );
}

export async function sendIntakeEmail({ prospect, invite, response, conversationText, partial = false }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email.');
    return { skipped: true };
  }
  const resend = new Resend(apiKey);
  const to = process.env.INTAKE_NOTIFY_EMAIL || 'info@driveclearpath.com';
  const from = process.env.INTAKE_NOTIFY_FROM || 'intake@driveclearpath.com';

  const subject = partial
    ? `Intake in progress (partial) — ${prospect.display_name} (${prospect.firm || 'Prospect'})`
    : `Intake complete — ${prospect.display_name} (${prospect.firm || 'Prospect'})`;

  const partialBanner = partial
    ? `<div style="padding:10px 14px;margin-bottom:16px;background:rgba(255,176,0,0.08);border:1px solid rgba(255,176,0,0.3);border-radius:8px;color:#a67700;font-size:13px"><strong>Partial — session still open.</strong> ${escapeHtml(prospect.display_name)} closed the tab early. They can return with their code and continue. You'll get a final "complete" email if/when they do.</div>`
    : '';

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#222">
  <h2 style="margin:0 0 4px">${escapeHtml(prospect.display_name)} — intake ${partial ? 'in progress' : 'submitted'}</h2>
  <div style="color:#666;margin-bottom:18px">${escapeHtml(prospect.title || '')}${prospect.firm ? ' · ' + escapeHtml(prospect.firm) : ''} · channel: ${escapeHtml(response.channel)}</div>
  ${partialBanner}

  <h3>Summary (AI)</h3>
  <p>${escapeHtml(response.conclusion_summary || '')}</p>
  <p style="color:#888;font-size:13px">Reason: ${escapeHtml(response.conclusion_reason || '')}</p>

  <h3>Flags</h3>
  ${renderFlags(response.flags)}

  <h3>Captured answers</h3>
  ${renderAnswers(response.answers)}

  ${renderSkipped(response.skipped)}

  <h3>Full transcript</h3>
  <pre style="background:#f5f5f5;padding:14px;border-radius:6px;white-space:pre-wrap;word-wrap:break-word;font-size:13px;font-family:ui-monospace,'Menlo',monospace">${escapeHtml(conversationText || '')}</pre>

  <p style="color:#999;font-size:12px;margin-top:28px">Invite code: ${escapeHtml(invite.code)} · Submitted at ${escapeHtml(response.submitted_at || new Date().toISOString())}</p>
</body></html>`;

  await resend.emails.send({ from, to, subject, html });
  return { sent: true, to };
}
