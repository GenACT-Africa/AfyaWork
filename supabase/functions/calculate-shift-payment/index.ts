/**
 * AfyaWork — calculate-shift-payment Edge Function
 *
 * Called fire-and-forget from api.js after approveCheckout() succeeds.
 * 1. Reads the completed shift and CO mobile money details.
 * 2. Reads system config for platform_fee_per_shift and overtime rate.
 * 3. Calculates overtime (if approved hours exceed scheduled by ≥60 min).
 * 4. Creates (or upserts) a shift_payments record.
 * 5. Sets payment_status to 'pending' — an admin must approve it to
 *    'scheduled' from the Payments dashboard before the batch can pick it up.
 *    The flat rate is always charged in full regardless of how long the CO
 *    actually worked (checking out early does not reduce the flat rate).
 *
 * Required env vars (auto-injected by Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Shift type → scheduled duration in minutes
const SHIFT_DURATION_MINUTES: Record<string, number> = {
  'Day (8AM-4PM)':       480,
  'Evening (4PM-10PM)':  360,
  'Night (10PM-6AM)':    480,
  '24-Hour':            1440,
  'Weekend':             480,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { shift_id } = await req.json();
    if (!shift_id) {
      return new Response(JSON.stringify({ error: 'shift_id required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Fetch shift ────────────────────────────────────────────
    const { data: shift, error: shiftErr } = await db
      .from('shifts')
      .select('id, facility_id, assigned_co_id, shift_type, pay_amount, checkin_approved_at, checkout_approved_at')
      .eq('id', shift_id)
      .eq('status', 'completed')
      .single();

    if (shiftErr || !shift) {
      console.error('calculate-shift-payment: shift not found or not completed', shiftErr);
      return new Response(JSON.stringify({ error: 'Shift not found or not completed' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const coId = shift.assigned_co_id;
    if (!coId) {
      return new Response(JSON.stringify({ error: 'No CO assigned to shift' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Read system config ─────────────────────────────────────
    const { data: configs } = await db
      .from('system_config')
      .select('key, value')
      .in('key', ['platform_fee_per_shift', 'platform_overtime_hourly_rate']);

    const configMap = Object.fromEntries((configs || []).map((c: any) => [c.key, c.value]));
    const platformFee         = parseInt(configMap.platform_fee_per_shift         || '2000', 10);
    const overtimeHourlyRate  = parseInt(configMap.platform_overtime_hourly_rate  || '5000', 10);

    // ── 4. Calculate pay ──────────────────────────────────────────
    const flatRate                    = shift.pay_amount as number;
    const scheduledDurationMinutes    = SHIFT_DURATION_MINUTES[shift.shift_type] ?? 480;

    let approvedMinutes = 0;
    if (shift.checkin_approved_at && shift.checkout_approved_at) {
      const ms = new Date(shift.checkout_approved_at).getTime() -
                 new Date(shift.checkin_approved_at).getTime();
      approvedMinutes = Math.round(ms / 60_000);
    }

    // Overtime: approved minutes exceed scheduled by ≥60 minutes
    const OVERTIME_THRESHOLD = 60;
    let overtimeMinutes = 0;
    let overtimePay     = 0;

    if (approvedMinutes > 0 && (approvedMinutes - scheduledDurationMinutes) >= OVERTIME_THRESHOLD) {
      overtimeMinutes = approvedMinutes - scheduledDurationMinutes;
      overtimePay     = Math.round((overtimeMinutes / 60) * overtimeHourlyRate);
    }

    const coTotalPay         = flatRate + overtimePay;
    const facilityTotalCharge = coTotalPay + platformFee;

    // ── 5. Fetch CO mobile money details ──────────────────────────
    const { data: mmProfile } = await db
      .from('co_mobile_money')
      .select('mobile_money_provider, mobile_money_number')
      .eq('co_id', coId)
      .maybeSingle();

    // ── 6. Upsert payment record ──────────────────────────────────
    // approve_checkout() (SECURITY DEFINER) already created a basic record.
    // We try INSERT first; on unique conflict we UPDATE only the calculation
    // fields — and only while the payment is still 'pending' so we never
    // overwrite an admin-approved or disbursed record.
    const calcFields = {
      flat_shift_rate:                  flatRate,
      scheduled_shift_duration_minutes: scheduledDurationMinutes,
      approved_hours_worked_minutes:    approvedMinutes || null,
      overtime_minutes:                 overtimeMinutes,
      overtime_rate_applied:            overtimeHourlyRate,
      overtime_pay:                     overtimePay,
      co_total_pay:                     coTotalPay,
      adjusted_pay_amount:              coTotalPay,
      platform_fee:                     platformFee,
      facility_total_charge:            facilityTotalCharge,
      mobile_money_provider:            mmProfile?.mobile_money_provider ?? null,
      mobile_money_number:              mmProfile?.mobile_money_number ?? null,
    };

    const { error: insertErr } = await db
      .from('shift_payments')
      .insert({
        shift_id:           shift_id,
        co_id:              coId,
        facility_id:        shift.facility_id,
        tax_withheld_amount: 0,
        payment_status:     'pending',
        scheduled_at:       null,
        ...calcFields,
      });

    if (insertErr?.code === '23505') {
      // Record already exists (created by approve_checkout RPC) — update calc fields only
      console.log('calculate-shift-payment: refining basic record for shift', shift_id);
      const { error: updateErr } = await db
        .from('shift_payments')
        .update(calcFields)
        .eq('shift_id', shift_id)
        .eq('payment_status', 'pending');  // never touch already-approved payments

      if (updateErr) {
        console.error('calculate-shift-payment: update failed', updateErr);
        // Non-fatal — basic record exists, just not fully calculated
      }
    } else if (insertErr) {
      console.error('calculate-shift-payment: insert failed', insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 8. If no mobile money details, flag in notification table ─
    if (!mmProfile) {
      console.warn(`calculate-shift-payment: CO ${coId} has no mobile money details — payment set to pending`);
      // Insert admin notification (best-effort)
      await db.from('notifications').insert({
        user_id: null, // admin notification (handled by is_admin filter if needed)
        title:   '⚠️ CO missing mobile money details',
        body:    `CO ${coId} completed a shift but has no mobile money details. Payment is pending until details are added.`,
        type:    'admin_alert',
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      ok:            true,
      co_total_pay:  coTotalPay,
      overtime_pay:  overtimePay,
      platform_fee:  platformFee,
      status:        'pending',
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('calculate-shift-payment error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
