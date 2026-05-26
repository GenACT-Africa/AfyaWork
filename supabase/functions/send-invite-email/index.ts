import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')!;
const APP_URL         = 'https://afyawork.netlify.app';
const ADMIN_EMAIL     = 'admin@genactafrica.org';
const ADMIN_PHONE     = Deno.env.get('ADMIN_PHONE') ?? '+255 000 000 000';
const ADMIN_WHATSAPP  = Deno.env.get('ADMIN_WHATSAPP') ?? '+255 000 000 000';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { email, display_name, role, invite_token, facility_name, is_resend } =
      await req.json();

    if (!email || !invite_token || !role) {
      return err('Missing required fields: email, invite_token, role');
    }

    const inviteUrl  = `${APP_URL}/invite/setup?token=${invite_token}`;
    const name       = display_name ?? (role === 'facility' ? facility_name : null) ?? 'there';
    const isFacility = role === 'facility';

    const contact = { adminEmail: ADMIN_EMAIL, adminPhone: ADMIN_PHONE, adminWhatsApp: ADMIN_WHATSAPP };

    let subject: string;
    let html: string;

    if (is_resend) {
      subject = isFacility
        ? 'Reminder: Your AfyaWork facility invitation is still waiting'
        : 'Reminder: Your AfyaWork invite is about to expire';
      html = resendTemplate({ name, inviteUrl, isFacility, contact });
    } else if (isFacility) {
      subject = 'You\'re invited to manage shifts on AfyaWork';
      html = facilityTemplate({ name, facility_name: facility_name ?? name, inviteUrl, contact });
    } else {
      subject = 'You\'re invited to find locum shifts on AfyaWork';
      html = workerTemplate({ name, inviteUrl, contact });
    }

    await sendEmail({ to: email, cc: ADMIN_EMAIL, subject, html });

    return ok({ sent: true });
  } catch (err_: unknown) {
    const msg = err_ instanceof Error ? err_.message : String(err_);
    console.error(err_);
    return err(msg, 500);
  }
});

// ── Shared types & helpers ────────────────────────────────────────

interface Contact {
  adminEmail: string;
  adminPhone: string;
  adminWhatsApp: string;
}

function contactFooter({ adminEmail, adminPhone, adminWhatsApp }: Contact) {
  return `
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0 20px;" />
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;font-weight:600;">Need help? Reach us:</p>
    <table cellpadding="0" cellspacing="0" style="font-size:12px;color:#6b7280;line-height:1.8;">
      <tr>
        <td style="padding-right:8px;">📧</td>
        <td><a href="mailto:${adminEmail}" style="color:#0d9488;text-decoration:none;">${adminEmail}</a></td>
      </tr>
      <tr>
        <td style="padding-right:8px;">📞</td>
        <td><a href="tel:${adminPhone}" style="color:#0d9488;text-decoration:none;">${adminPhone}</a></td>
      </tr>
      <tr>
        <td style="padding-right:8px;">💬</td>
        <td>
          <a href="https://wa.me/${adminWhatsApp.replace(/\D/g, '')}"
             style="color:#0d9488;text-decoration:none;">
            WhatsApp: ${adminWhatsApp}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
      AfyaWork · Dar es Salaam, Tanzania
    </p>`;
}

function ctaButton(url: string, label = 'Activate My Account →') {
  return `
    <a href="${url}"
       style="display:inline-block;background:#0d9488;color:#fff;padding:14px 36px;
              border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;
              margin:8px 0 20px;letter-spacing:0.01em;">
      ${label}
    </a>`;
}

function expireNote() {
  return `<p style="color:#6b7280;font-size:13px;margin:0 0 20px;">
    ⏱ This link expires in <strong>72 hours</strong>. Set up your account before it does.
  </p>`;
}

function fallbackLink(url: string) {
  return `<p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">
    Or copy this link into your browser:<br/>
    <span style="color:#0d9488;word-break:break-all;">${url}</span>
  </p>`;
}

// ── Template: Facility (new invite) ──────────────────────────────

function facilityTemplate({ name, facility_name, inviteUrl, contact }: {
  name: string; facility_name: string; inviteUrl: string; contact: Contact;
}) {
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;background:#f9fafb;padding:20px 0;">
  <div style="background:#0d9488;padding:28px 32px 24px;border-radius:14px 14px 0 0;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">AfyaWork</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;line-height:1.2;">
      Welcome to AfyaWork,<br/>${facility_name}
    </h1>
  </div>

  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;">
    <p style="margin:0 0 16px;font-size:15px;">Hi ${name},</p>

    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      You've been selected to join <strong>AfyaWork</strong> — Tanzania's dedicated platform for
      healthcare staffing. Your facility account is ready and waiting for you to activate it.
    </p>

    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;color:#0f766e;font-size:14px;">
        What you can do on AfyaWork:
      </p>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:2;font-size:14px;">
        <li>Post locum shifts for any role or time slot</li>
        <li>Instantly review verified Clinical Officer profiles</li>
        <li>Approve your preferred candidate in one click</li>
        <li>Track check-in, check-out and shift completion</li>
        <li>Rate COs and build your facility's reputation</li>
      </ul>
    </div>

    ${expireNote()}
    ${ctaButton(inviteUrl)}
    ${fallbackLink(inviteUrl)}
    ${contactFooter(contact)}
  </div>
</div>`;
}

// ── Template: Worker / CO (new invite) ───────────────────────────

function workerTemplate({ name, inviteUrl, contact }: {
  name: string; inviteUrl: string; contact: Contact;
}) {
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;background:#f9fafb;padding:20px 0;">
  <div style="background:#0d9488;padding:28px 32px 24px;border-radius:14px 14px 0 0;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">AfyaWork</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;line-height:1.2;">
      You've been invited,<br/>${name}
    </h1>
  </div>

  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;">
    <p style="margin:0 0 16px;font-size:15px;">Hi ${name},</p>

    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      You've been invited to join <strong>AfyaWork</strong> as a <strong>Clinical Officer</strong>.
      AfyaWork connects qualified healthcare workers with facilities across Tanzania for locum shifts —
      on your schedule, at fair pay.
    </p>

    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 10px;font-weight:700;color:#0f766e;font-size:14px;">
        With AfyaWork you can:
      </p>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:2;font-size:14px;">
        <li>Browse locum shifts at facilities across Dar es Salaam</li>
        <li>Apply with one tap and track your applications</li>
        <li>Accept or decline offers on your terms</li>
        <li>Check in and out digitally — no paperwork</li>
        <li>Build your verified healthcare profile and earn ratings</li>
      </ul>
    </div>

    ${expireNote()}
    ${ctaButton(inviteUrl)}
    ${fallbackLink(inviteUrl)}
    ${contactFooter(contact)}
  </div>
</div>`;
}

// ── Template: Resend / Reminder ───────────────────────────────────

function resendTemplate({ name, inviteUrl, isFacility, contact }: {
  name: string; inviteUrl: string; isFacility: boolean; contact: Contact;
}) {
  const roleLabel = isFacility ? 'facility' : 'Clinical Officer';
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;background:#f9fafb;padding:20px 0;">
  <div style="background:#0f766e;padding:28px 32px 24px;border-radius:14px 14px 0 0;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">AfyaWork · Reminder</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;line-height:1.3;">
      Your invitation is still waiting!
    </h1>
  </div>

  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;">
    <p style="margin:0 0 16px;font-size:15px;">Hi ${name},</p>

    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      This is a friendly reminder that your AfyaWork <strong>${roleLabel}</strong> invitation
      is still waiting. We've refreshed your link — it's valid for another <strong>72 hours</strong>.
    </p>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:14px;color:#92400e;">
        ⚠️ <strong>Don't miss out.</strong> Once this link expires you'll need to contact admin to get a new one.
      </p>
    </div>

    ${expireNote()}
    ${ctaButton(inviteUrl, 'Activate My Account →')}
    ${fallbackLink(inviteUrl)}
    ${contactFooter(contact)}
  </div>
</div>`;
}

// ── HTTP helpers ─────────────────────────────────────────────────

async function sendEmail({
  to, cc, subject, html,
}: { to: string; cc?: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AfyaWork <noreply@afyawork.com>',
      to:   [to],
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
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
