import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const APP_URL = 'https://afyawork.netlify.app';
const ADMIN_EMAIL = 'admin@genactafrica.org';

serve(async (req) => {
  try {
    const { email, display_name, role, invite_token, facility_name, is_resend } =
      await req.json();

    if (!email || !invite_token || !role) {
      return err('Missing required fields: email, invite_token, role');
    }

    const inviteUrl = `${APP_URL}/invite/setup?token=${invite_token}`;
    const name = display_name ?? (role === 'facility' ? facility_name : null) ?? 'there';
    const isFacility = role === 'facility';
    const subjectPrefix = is_resend ? 'Reminder: ' : '';

    const subject = isFacility
      ? `${subjectPrefix}You're invited to list shifts on AfyaWork`
      : `${subjectPrefix}You're invited to find locum shifts on AfyaWork`;

    const html = isFacility
      ? facilityTemplate({ name, facility_name: facility_name ?? name, inviteUrl, is_resend })
      : workerTemplate({ name, inviteUrl, is_resend });

    await sendEmail({ to: email, cc: ADMIN_EMAIL, subject, html });

    return ok({ sent: true });
  } catch (err_) {
    console.error(err_);
    return err(err_.message, 500);
  }
});

// ── Email templates ──────────────────────────────────────────────

function facilityTemplate({
  name,
  facility_name,
  inviteUrl,
  is_resend,
}: {
  name: string;
  facility_name: string;
  inviteUrl: string;
  is_resend?: boolean;
}) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#0d9488;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">Welcome to AfyaWork${is_resend ? ' — Reminder' : ''}</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${name},</p>
    ${
      is_resend
        ? `<p>This is a reminder that <strong>${facility_name}</strong> has been invited to join AfyaWork — Tanzania's healthcare staffing platform. Your invitation link is still waiting for you.</p>`
        : `<p>You've been invited to create an AfyaWork account for <strong>${facility_name}</strong>. AfyaWork connects healthcare facilities with qualified Clinical Officers for locum shifts across Tanzania.</p>`
    }

    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:20px;margin:24px 0;">
      <p style="margin:0 0 8px;font-weight:600;color:#0f766e;">What you can do on AfyaWork:</p>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li>Post locum shifts for your facility</li>
        <li>Review applications from verified Clinical Officers</li>
        <li>Select the right candidate in one click</li>
        <li>Track all your shifts and hiring history</li>
      </ul>
    </div>

    <p style="color:#6b7280;font-size:14px;">Click the button below to set your password and activate your account. This link expires in <strong>7 days</strong>.</p>

    <a href="${inviteUrl}"
       style="display:inline-block;background:#0d9488;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:8px 0 24px;">
      Activate My Account →
    </a>

    <p style="font-size:13px;color:#9ca3af;">Or copy this link into your browser:<br/>
      <span style="color:#0d9488;word-break:break-all;">${inviteUrl}</span>
    </p>

    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Questions? Reply to this email or contact <a href="mailto:${ADMIN_EMAIL}" style="color:#0d9488;">${ADMIN_EMAIL}</a><br/>
      AfyaWork · Dar es Salaam, Tanzania
    </p>
  </div>
</div>`;
}

function workerTemplate({
  name,
  inviteUrl,
  is_resend,
}: {
  name: string;
  inviteUrl: string;
  is_resend?: boolean;
}) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#0d9488;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">Welcome to AfyaWork${is_resend ? ' — Reminder' : ''}</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${name},</p>
    ${
      is_resend
        ? `<p>This is a friendly reminder — your AfyaWork invitation is still waiting! Set your password to start browsing locum shifts.</p>`
        : `<p>You've been invited to join AfyaWork as a Clinical Officer. AfyaWork connects qualified healthcare workers with facilities across Tanzania for locum shifts.</p>`
    }

    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:20px;margin:24px 0;">
      <p style="margin:0 0 8px;font-weight:600;color:#0f766e;">With AfyaWork you can:</p>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
        <li>Browse locum shifts at facilities across Dar es Salaam</li>
        <li>Apply with one click and track your applications</li>
        <li>Get notified instantly when you're selected</li>
        <li>Build your professional healthcare profile</li>
      </ul>
    </div>

    <p style="color:#6b7280;font-size:14px;">Click the button below to set your password and activate your account. This link expires in <strong>7 days</strong>.</p>

    <a href="${inviteUrl}"
       style="display:inline-block;background:#0d9488;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:8px 0 24px;">
      Activate My Account →
    </a>

    <p style="font-size:13px;color:#9ca3af;">Or copy this link into your browser:<br/>
      <span style="color:#0d9488;word-break:break-all;">${inviteUrl}</span>
    </p>

    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Questions? Contact <a href="mailto:${ADMIN_EMAIL}" style="color:#0d9488;">${ADMIN_EMAIL}</a><br/>
      AfyaWork · Dar es Salaam, Tanzania
    </p>
  </div>
</div>`;
}

// ── Helpers ──────────────────────────────────────────────────────

async function sendEmail({
  to,
  cc,
  subject,
  html,
}: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AfyaWork <noreply@afyawork.com>',
      to: [to],
      ...(cc ? { cc: [cc] } : {}),
      subject,
      html,
    }),
  });
  if (!res.ok) console.error('Resend error:', await res.text());
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
