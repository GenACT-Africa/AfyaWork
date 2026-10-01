/**
 * AfyaWork — calculate-shift-payment Edge Function
 *
 * The payment calculation now lives in the database (compute_shift_payment),
 * and approve_checkout() runs it automatically. This function is kept so the
 * existing app call keeps working; it simply asks the database to recalculate
 * a still-'pending' payment (e.g. after an admin changes the fee or overtime rate).
 *
 * Allowed callers: service role, admins, and the facility that owns the shift.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS, isServiceCall, getCaller, deny } from '../_shared/auth.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { shift_id } = await req.json();
    if (!shift_id) return json({ error: 'shift_id required' }, 400);

    if (!isServiceCall(req)) {
      const caller = await getCaller(req);
      if (!caller) return deny(401, 'Sign in required');
      if (caller.role !== 'admin') {
        const { data: s } = await db.from('shifts').select('facility_id').eq('id', shift_id).single();
        if (!s || s.facility_id !== caller.id) return deny(403, 'Not your shift');
      }
    }

    const { error } = await db.rpc('recalculate_shift_payment', { p_shift_id: shift_id });
    if (error) return json({ error: error.message }, 400);

    const { data: payment } = await db
      .from('shift_payments')
      .select('co_total_pay, overtime_pay, platform_fee, facility_total_charge, payment_status')
      .eq('shift_id', shift_id)
      .maybeSingle();

    return json({ ok: true, ...payment });
  } catch (err) {
    console.error('calculate-shift-payment error:', err);
    return json({ error: String(err) }, 500);
  }
});
