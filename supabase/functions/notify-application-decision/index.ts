import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM = 'AfyaWork <onboarding@resend.dev>';
const ADMIN = 'admin@genactafrica.org';
const APP_URL = 'https://afyawork.netlify.app';

serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload.type !== 'UPDATE') return ok({ skipped: true });

    const { record, old_record } = payload;
    const newStatus: string = record.status;
    const oldStatus: string = old_record?.status;

    // Only notify on transitions to approved or rejected
    if (newStatus === oldStatus) return ok({ skipped: 'no status change' });
    if (newStatus !== 'approved' && newStatus !== 'rejected') return ok({ skipped: 'irrelevant status' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: shift }, { data: coUser }] = await Promise.all([
      supabase.from('shifts').select('shift_type, shift_date, facility_id').eq('id', record.shift_id).single(),
      supabase.from('users').select('email, display_name').eq('id', record.co_id).single(),
    ]);

    if (!coUser?.email || !shift) return ok({ skipped: 'missing data' });

    const { data: facility } = await supabase
      .from('facility_profiles')
      .select('facility_name')
      .eq('user_id', shift.facility_id)
      .single();

    const facilityName = facility?.facility_name ?? 'the facility';
    const shiftDate = formatDate(shift.shift_date);
    const coName = coUser.display_name ?? 'there';

    const isApproved = newStatus === 'approved';

    await sendEmail({
      to: coUser.email,
      cc: ADMIN,
      subject: isApproved
        ? `Congratulations! You've been selected for the ${shift.shift_type} shift`
        : `Application update — ${shift.shift_type} at ${facilityName}`,
      html: isApproved
        ? `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">You've Been Selected!</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${coName},</p>
    <p>Great news — <strong>${facilityName}</strong> has selected you for their locum shift.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:15px;">
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;color:#6b7280;width:40%;">Shift</td>
        <td style="padding:10px 8px;font-weight:600;">${shift.shift_type}</td>
      </tr>
      <tr style="background:#f9fafb;border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;color:#6b7280;">Facility</td>
        <td style="padding:10px 8px;">${facilityName}</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;color:#6b7280;">Date</td>
        <td style="padding:10px 8px;">${shiftDate}</td>
      </tr>
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:24px 0;">
      <p style="margin:0;color:#15803d;font-weight:600;">Next step: The facility will contact you directly with further details and reporting instructions.</p>
    </div>

    <a href="${APP_URL}/co/applications"
       style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      View My Applications →
    </a>

    <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
      AfyaWork · Dar es Salaam, Tanzania
    </p>
  </div>
</div>`
        : `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#6b7280;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">Application Update</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${coName},</p>
    <p>Thank you for applying through AfyaWork. Unfortunately, <strong>${facilityName}</strong> has selected another candidate for this shift.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:15px;">
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;color:#6b7280;width:40%;">Shift</td>
        <td style="padding:10px 8px;font-weight:600;">${shift.shift_type}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 8px;color:#6b7280;">Facility</td>
        <td style="padding:10px 8px;">${facilityName}</td>
      </tr>
    </table>

    <p>Don't be discouraged — new shifts are posted regularly. Keep browsing!</p>

    <a href="${APP_URL}/co/shifts"
       style="display:inline-block;background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      Browse Open Shifts →
    </a>

    <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
      AfyaWork · Dar es Salaam, Tanzania
    </p>
  </div>
</div>`,
    });

    return ok({ sent: 1, status: newStatus });
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
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], ...(cc ? { cc: [cc] } : {}), subject, html }),
  });
  if (!res.ok) console.error('Resend error:', await res.text());
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
