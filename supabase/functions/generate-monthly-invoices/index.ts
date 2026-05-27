/**
 * AfyaWork — generate-monthly-invoices Edge Function
 *
 * Triggered on the 1st of every month at 8am EAT (05:00 UTC) via pg_cron,
 * OR manually from the Admin Payments dashboard.
 *
 * For each facility that had ≥1 completed shift in the previous calendar month:
 *  1. Creates a facility_invoices record (status: 'draft').
 *  2. Creates facility_invoice_line_items for each shift.
 *  3. Sends WhatsApp + marks as 'sent'.
 *
 * Handles disputed shifts at month-end:
 *  - Only includes shifts with payment_status IN ('disbursed', 'scheduled', 'processing').
 *  - Held payments (disputed) are excluded — a supplementary invoice is issued on resolution.
 *
 * Required env vars:
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({})) as { year?: number; month?: number };

    // Default: previous calendar month
    const now = new Date();
    let targetYear  = body.year  ?? now.getUTCFullYear();
    let targetMonth = body.month ?? now.getUTCMonth(); // 0-based: previous month

    if (!body.year && !body.month) {
      // Subtract one month
      if (now.getUTCMonth() === 0) {
        targetYear  = now.getUTCFullYear() - 1;
        targetMonth = 11;
      } else {
        targetYear  = now.getUTCFullYear();
        targetMonth = now.getUTCMonth() - 1;
      }
    }

    const periodStart = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0));
    const periodEnd   = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59));

    const monthStr  = String(targetMonth + 1).padStart(2, '0');
    const yearStr   = String(targetYear);
    const periodLabel = `${targetYear}-${monthStr}`;

    console.log(`generate-monthly-invoices: generating for ${periodLabel}`);

    // ── Read system config ────────────────────────────────────────
    const { data: configs } = await db
      .from('system_config')
      .select('key, value')
      .in('key', ['payment_due_day']);

    const cfgMap     = Object.fromEntries((configs || []).map((c: any) => [c.key, c.value]));
    const paymentDueDay = parseInt(cfgMap.payment_due_day ?? '15', 10);

    // Due date: paymentDueDay of the CURRENT month (i.e. next month after invoice period)
    const dueDate = new Date(Date.UTC(targetYear, targetMonth + 1, paymentDueDay));
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    // ── Fetch all completed shift payments in the period ──────────
    const { data: payments, error: fetchErr } = await db
      .from('shift_payments')
      .select(`
        id, shift_id, co_id, facility_id,
        flat_shift_rate, overtime_pay, platform_fee,
        facility_total_charge, co_total_pay,
        scheduled_shift_duration_minutes, approved_hours_worked_minutes,
        disbursed_at, created_at
      `)
      .in('payment_status', ['disbursed', 'scheduled', 'processing'])
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!payments || payments.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No completed payments for period', invoices_created: 0 }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch shift and CO details in bulk ────────────────────────
    const shiftIds    = payments.map((p: any) => p.shift_id as string);
    const coIds       = [...new Set(payments.map((p: any) => p.co_id as string))];
    const facilityIds = [...new Set(payments.map((p: any) => p.facility_id as string))];

    const [{ data: shifts }, { data: coUsers }, { data: facilityProfiles }] = await Promise.all([
      db.from('shifts').select('id, shift_date, shift_type').in('id', shiftIds),
      db.from('users').select('id, display_name').in('id', coIds),
      db.from('facility_profiles').select('user_id, facility_name').in('user_id', facilityIds),
    ]);

    const shiftMap    = Object.fromEntries((shifts || []).map((s: any) => [s.id, s]));
    const coMap       = Object.fromEntries((coUsers || []).map((u: any) => [u.id, u]));
    const facilityMap = Object.fromEntries((facilityProfiles || []).map((f: any) => [f.user_id, f]));

    // ── Group payments by facility ────────────────────────────────
    const byFacility: Record<string, any[]> = {};
    for (const p of payments as any[]) {
      if (!byFacility[p.facility_id]) byFacility[p.facility_id] = [];
      byFacility[p.facility_id].push(p);
    }

    const results: string[] = [];

    for (const [facilityId, facilityPayments] of Object.entries(byFacility)) {
      const facilityProfile = facilityMap[facilityId];
      const facilitySlug    = facilityId.replace(/-/g, '').slice(0, 6).toUpperCase();
      const invoiceNumber   = `AFW-${yearStr}-${monthStr}-${facilitySlug}`;

      // Check if invoice already exists (idempotency)
      const { data: existing } = await db
        .from('facility_invoices')
        .select('id')
        .eq('invoice_number', invoiceNumber)
        .maybeSingle();

      if (existing) {
        console.log(`generate-monthly-invoices: invoice ${invoiceNumber} already exists, skipping`);
        continue;
      }

      // Calculate invoice totals
      const totalCoPay       = facilityPayments.reduce((s: number, p: any) => s + (p.co_total_pay ?? 0), 0);
      const totalOvertimePay = facilityPayments.reduce((s: number, p: any) => s + (p.overtime_pay ?? 0), 0);
      const totalPlatformFee = facilityPayments.reduce((s: number, p: any) => s + (p.platform_fee ?? 0), 0);
      const grandTotal       = facilityPayments.reduce((s: number, p: any) => s + (p.facility_total_charge ?? 0), 0);

      // ── Create invoice record ──────────────────────────────────
      const { data: invoice, error: invoiceErr } = await db
        .from('facility_invoices')
        .insert({
          invoice_number:       invoiceNumber,
          facility_id:          facilityId,
          invoice_period_start: periodStart.toISOString(),
          invoice_period_end:   periodEnd.toISOString(),
          total_shifts:         facilityPayments.length,
          total_co_pay:         totalCoPay,
          total_overtime_pay:   totalOvertimePay,
          total_platform_fees:  totalPlatformFee,
          grand_total:          grandTotal,
          invoice_status:       'draft',
          due_date:             dueDateStr,
        })
        .select('id')
        .single();

      if (invoiceErr || !invoice) {
        console.error('generate-monthly-invoices: failed to create invoice for', facilityId, invoiceErr);
        continue;
      }

      const invoiceId = invoice.id as string;

      // ── Create line items ──────────────────────────────────────
      const lineItems = facilityPayments.map((p: any) => {
        const shift = shiftMap[p.shift_id] ?? {};
        const co    = coMap[p.co_id]       ?? {};
        return {
          invoice_id:      invoiceId,
          shift_id:        p.shift_id,
          shift_date:      shift.shift_date ?? periodStart.toISOString().slice(0, 10),
          shift_type:      shift.shift_type ?? 'Unknown',
          co_name:         co.display_name  ?? 'Unknown CO',
          scheduled_hours: Number((p.scheduled_shift_duration_minutes / 60).toFixed(2)),
          approved_hours:  p.approved_hours_worked_minutes
                            ? Number((p.approved_hours_worked_minutes / 60).toFixed(2))
                            : null,
          flat_rate:       p.flat_shift_rate ?? 0,
          overtime_pay:    p.overtime_pay    ?? 0,
          platform_fee:    p.platform_fee    ?? 0,
          line_total:      p.facility_total_charge ?? 0,
        };
      });

      await db.from('facility_invoice_line_items').insert(lineItems);

      // ── Send WhatsApp to facility & mark as sent ───────────────
      await db.functions.invoke('send-whatsapp', {
        body: {
          event:          'invoice_generated',
          facility_id:    facilityId,
          invoice_id:     invoiceId,
          invoice_number: invoiceNumber,
          grand_total:    grandTotal,
          due_date:       dueDateStr,
        },
      }).catch(() => {});

      // Mark as sent
      await db.from('facility_invoices').update({
        invoice_status: 'sent',
        sent_at:        new Date().toISOString(),
      }).eq('id', invoiceId);

      results.push(invoiceNumber);
    }

    return new Response(JSON.stringify({
      ok:               true,
      period:           periodLabel,
      invoices_created: results.length,
      invoice_numbers:  results,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-monthly-invoices error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
