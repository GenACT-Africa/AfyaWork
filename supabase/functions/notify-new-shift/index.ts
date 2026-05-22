import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const ADMIN = 'admin@genactafrica.org';
const APP_URL = 'https://afyawork.netlify.app';

serve(async (req) => {
  try {
    const payload = await req.json();

    // Only fire on new open shifts
    if (payload.type !== 'INSERT' || payload.record?.status !== 'open') {
      return ok({ skipped: true });
    }

    const shift = payload.record;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: facility }, { data: coUsers }] = await Promise.all([
      supabase.from('facility_profiles').select('facility_name').eq('user_id', shift.facility_id).single(),
      supabase.from('users').select('email, display_name').eq('role', 'co'),
    ]);

    if (!coUsers?.length) return ok({ sent: 0 });

    const facilityName = facility?.facility_name ?? 'a facility';
    const shiftDate = formatDate(shift.shift_date);

    await Promise.all(
      coUsers.map((co) =>
        sendEmail({
          to: co.email,
          cc: ADMIN,
          subject: `New shift available — ${shift.shift_type} at ${facilityName}`,
          html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#0d9488;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:22px;">New Shift Available</h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin-top:0;">Hi ${co.display_name ?? 'there'},</p>
    <p>A new locum shift has just been posted on AfyaWork.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:15px;">
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;color:#6b7280;width:40%;">Shift type</td>
        <td style="padding:10px 8px;font-weight:600;">${shift.shift_type}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6;background:#f9fafb;">
        <td style="padding:10px 8px;color:#6b7280;">Facility</td>
        <td style="padding:10px 8px;">${facilityName}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;color:#6b7280;">Date</td>
        <td style="padding:10px 8px;">${shiftDate}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 8px;color:#6b7280;">Pay</td>
        <td style="padding:10px 8px;font-weight:700;color:#0d9488;">TZS ${shift.pay_amount.toLocaleString()}</td>
      </tr>
    </table>

    <a href="${APP_URL}/co/shifts"
       style="display:inline-block;background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      View &amp; Apply →
    </a>

    <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
      You're receiving this because you're registered as a Clinical Officer on AfyaWork.<br>
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
