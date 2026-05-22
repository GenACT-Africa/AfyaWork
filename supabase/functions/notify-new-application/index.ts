import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const ADMIN = 'admin@genactafrica.org';
const APP_URL = 'https://afyawork.netlify.app';

serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload.type !== 'INSERT') return ok({ skipped: true });

    const application = payload.record;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch shift, facility email, and CO name in parallel
    const [{ data: shift }, { data: coUser }] = await Promise.all([
      supabase.from('shifts').select('shift_type, shift_date, facility_id').eq('id', application.shift_id).single(),
      supabase.from('users').select('display_name').eq('id', application.co_id).single(),
    ]);

    if (!shift) return ok({ skipped: 'shift not found' });

    const [{ data: facilityUser }] = await Promise.all([
      supabase.from('users').select('email, display_name').eq('id', shift.facility_id).single(),
    ]);

    if (!facilityUser?.email) return ok({ skipped: 'facility email not found' });

    const coName = coUser?.display_name ?? 'A Clinical Officer';
    const shiftDate = formatDate(shift.shift_date);

    await sendEmail({
      to: facilityUser.email,
      cc: ADMIN,
      subject: `New application for your ${shift.shift_type} shift`,
      html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#0d9488;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">New Application Received</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${facilityUser.display_name ?? 'there'},</p>
    <p><strong>${coName}</strong> has applied for one of your shifts on AfyaWork.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:15px;">
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;color:#6b7280;width:40%;">Applicant</td>
        <td style="padding:10px 8px;font-weight:600;">${coName}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6;background:#f9fafb;">
        <td style="padding:10px 8px;color:#6b7280;">Shift</td>
        <td style="padding:10px 8px;">${shift.shift_type}</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;color:#6b7280;">Shift date</td>
        <td style="padding:10px 8px;">${shiftDate}</td>
      </tr>
    </table>

    <a href="${APP_URL}/facility/shifts/${application.shift_id}"
       style="display:inline-block;background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      Review Applicants →
    </a>

    <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
      AfyaWork · Dar es Salaam, Tanzania
    </p>
  </div>
</div>`,
    });

    return ok({ sent: 1 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-TZ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

async function sendEmail({ to, cc, subject, html }: { to: string; cc?: string; subject: string; html: string }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'AfyaWork', email: 'admin@genactafrica.org' },
      to: [{ email: to }],
      ...(cc ? { cc: [{ email: cc }] } : {}),
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) console.error('Brevo error:', await res.text());
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
