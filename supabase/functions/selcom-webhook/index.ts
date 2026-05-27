/**
 * AfyaWork — selcom-webhook Edge Function
 *
 * Receives POST callbacks from Selcom after a disbursement
 * is confirmed (success or failure).
 *
 * Selcom will POST to this URL with a JSON body containing:
 *   - transid / transaction_id   — Selcom transaction reference
 *   - resultcode / code          — result code (0/00 = success)
 *   - resultdescription          — human-readable description
 *   - reference                  — our reference (batch-prefixed)
 *
 * ⚠️  Adapt the payload field names to Selcom's actual callback spec.
 *
 * Retry/timeout handling:
 *   - If Selcom never calls back within 2 hours, the admin payments dashboard
 *     highlights 'processing' payments for admin review.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SELCOM_WEBHOOK_SECRET — shared secret to verify Selcom callbacks
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

const WEBHOOK_SECRET = Deno.env.get('SELCOM_WEBHOOK_SECRET') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json() as Record<string, unknown>;
    console.log('selcom-webhook received:', JSON.stringify(body));

    // ── Optional: verify webhook authenticity ─────────────────────
    // ⚠️  Implement per Selcom's webhook signature documentation.
    // const signature = req.headers.get('X-Selcom-Signature') ?? '';
    // if (WEBHOOK_SECRET && !verifySignature(body, signature, WEBHOOK_SECRET)) {
    //   return new Response('Unauthorized', { status: 401 });
    // }

    // ── Extract fields from Selcom payload ────────────────────────
    // ⚠️  Update field names per Selcom's actual callback payload spec.
    const transactionRef = String(body.transid ?? body.transaction_id ?? body.reference ?? '');
    const resultCode     = String(body.resultcode ?? body.code ?? body.status ?? '');
    const resultDesc     = String(body.resultdescription ?? body.description ?? '');

    if (!transactionRef) {
      console.warn('selcom-webhook: no transaction reference in payload');
      return new Response(JSON.stringify({ ok: false, error: 'No transaction reference' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Find matching payment record(s) ───────────────────────────
    // Our reference format: AFW-{BATCHID_SHORT}-{COID_SHORT}
    // All payments in the same CO batch share the same selcom_transaction_ref
    const { data: payments, error: fetchErr } = await db
      .from('shift_payments')
      .select('id, co_id, co_total_pay, adjusted_pay_amount, mobile_money_provider, mobile_money_number, retry_count')
      .eq('selcom_transaction_ref', transactionRef)
      .eq('payment_status', 'processing');

    if (fetchErr || !payments || payments.length === 0) {
      console.warn('selcom-webhook: no processing payments found for ref', transactionRef);
      // Return 200 so Selcom does not retry the webhook
      return new Response(JSON.stringify({ ok: true, note: 'No matching payments found' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const isSuccess = ['0', '00', 'SUCCESS'].includes(resultCode.toUpperCase());
    const isFailure = !isSuccess;

    const paymentIds = payments.map((p: any) => p.id as string);
    const coId       = payments[0].co_id as string;

    if (isSuccess) {
      // ── Mark disbursed ─────────────────────────────────────────
      await db.from('shift_payments').update({
        payment_status:              'disbursed',
        selcom_response_code:        resultCode,
        selcom_response_description: resultDesc,
        selcom_raw_response:         body,
        selcom_webhook_received_at:  new Date().toISOString(),
        disbursed_at:                new Date().toISOString(),
      }).in('id', paymentIds);

      // ── Notify CO via WhatsApp ─────────────────────────────────
      await db.functions.invoke('send-whatsapp', {
        body: {
          event:       'payment_disbursed',
          co_id:       coId,
          payment_ids: paymentIds,
        },
      }).catch(() => {});

    } else {
      // ── Mark failed ────────────────────────────────────────────
      await db.from('shift_payments').update({
        payment_status:              'failed',
        selcom_response_code:        resultCode,
        selcom_response_description: resultDesc,
        selcom_raw_response:         body,
        selcom_webhook_received_at:  new Date().toISOString(),
        failure_reason:              resultDesc,
        failure_logged_at:           new Date().toISOString(),
      }).in('id', paymentIds);

      // ── Alert admin + notify CO ────────────────────────────────
      await db.functions.invoke('send-whatsapp', {
        body: {
          event:       'payment_failed',
          co_id:       coId,
          payment_ids: paymentIds,
          error:       resultDesc,
        },
      }).catch(() => {});
    }

    // Acknowledge receipt to Selcom
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('selcom-webhook error:', err);
    // Return 200 to prevent Selcom retry storms on our errors
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
