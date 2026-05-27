import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN = 'admin@genactafrica.org';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://afyawork.com';

serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload.type !== 'UPDATE') return ok({ skipped: true });

    const { record, old_record } = payload;

    // Only fire when shift transitions into cancelled
    if (old_record?.status === 'cancelled' || record.status !== 'cancelled') {
      return ok({ skipped: 'not a cancellation transition' });
    }

    const shift = record;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: facility }, { data: applications }] = await Promise.all([
      supabase.from('facility_profiles').select('facility_name').eq('user_id', shift.facility_id).single(),
      // Notify pending and approved applicants (not already rejected ones)
      supabase
        .from('applications')
        .select('co_id')
        .eq('shift_id', shift.id)
        .in('status', ['pending', 'approved']),
    ]);

    if (!applications?.length) return ok({ sent: 0 });

    const facilityName = facility?.facility_name ?? 'the facility';
    const shiftDate = formatDate(shift.shift_date);

    // Get CO emails
    const coIds = applications.map((a) => a.co_id);
    const { data: coUsers } = await supabase
      .from('users')
      .select('email, display_name')
      .in('id', coIds);

    if (!coUsers?.length) return ok({ sent: 0 });

    await Promise.all(
      coUsers.map((co) =>
        sendEmail({
          to: co.email,
          cc: ADMIN,
          subject: `Shift cancelled — ${shift.shift_type} at ${facilityName}`,
          html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#dc2626;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">Shift Cancelled</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${co.display_name ?? 'there'},</p>
    <p>We're sorry to inform you that the following shift has been cancelled by the facility.</p>

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
        <td style="padding:10px 8px;color:#6b7280;">Original date</td>
        <td style="padding:10px 8px;">${shiftDate}</td>
      </tr>
    </table>

    <p>Your application has been automatically withdrawn. There are other open shifts available — browse and apply below.</p>

    <a href="${APP_URL}/co/shifts"
       style="display:inline-block;background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      Browse Open Shifts →
    </a>

    <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
      AfyaWork · Dar es Salaam, Tanzania
    </p>
  </div>
</div>`,
        })
      ),
    );

    return ok({ sent: coUsers.length });
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
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
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
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
