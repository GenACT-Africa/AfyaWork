/**
 * AfyaWork — process-disbursement-batch Edge Function
 *
 * Triggered nightly at 9:00pm EAT (18:00 UTC) via pg_cron,
 * OR manually from the Admin Payments dashboard.
 *
 * Process:
 *  1. Creates a disbursement_batch record.
 *  2. Collects all shift_payments with status = 'scheduled'.
 *  3. Groups them by CO.
 *  4. For each CO: calls the Selcom Disbursement API with the combined total.
 *  5. Marks included payments as 'processing'.
 *  6. Webhook handler (selcom-webhook) finalises to 'disbursed' or 'failed'.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 *   SELCOM_API_KEY     — Selcom API key
 *   SELCOM_API_SECRET  — Selcom API secret
 *   SELCOM_WEBHOOK_URL — Public URL of the selcom-webhook edge function
 *                        e.g. https://[project].supabase.co/functions/v1/selcom-webhook
 *
 * Selcom API documentation: https://developer.selcom.co.tz
 * ⚠️  Update SELCOM_BASE_URL and request shape per official Selcom documentation.
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

const SELCOM_API_KEY    = Deno.env.get('SELCOM_API_KEY')    ?? '';
const SELCOM_API_SECRET = Deno.env.get('SELCOM_API_SECRET') ?? '';
const SELCOM_WEBHOOK_URL = Deno.env.get('SELCOM_WEBHOOK_URL') ?? '';

// ⚠️  Update per Selcom documentation. Sandbox vs production toggled by selcom_environment config.
const SELCOM_BASE = {
  sandbox:    'https://apigw.selcom.net/v1',
  production: 'https://apigw.selcom.net/v1',
};

// Provider code mapping for Selcom API
const PROVIDER_CHANNEL: Record<string, string> = {
  mpesa:        'MPESA',
  mixx_by_yas:  'TIGOPESA',
  airtel_money: 'AIRTEL',
  halopesa:     'HALOPESA',
};

// ── Selcom HMAC-SHA256 authentication ────────────────────────────
// ⚠️  Update signing logic per official Selcom authentication documentation.
async function buildSelcomHeaders(
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const nonce     = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  // Build sorted parameter string for signing
  const allParams = { ...params, timestamp, nonce };
  const sortedKeys = Object.keys(allParams).sort();
  const signStr = sortedKeys.map((k) => `${k}=${allParams[k]}`).join('&');

  // HMAC-SHA256
  const keyBytes = new TextEncoder().encode(apiSecret);
  const msgBytes = new TextEncoder().encode(signStr);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return {
    'Content-Type':  'application/json',
    'Authorization': `SELCOM ${btoa(`${apiKey}:${sigBase64}`)}`,
    'Timestamp':     timestamp,
    'Nonce':         nonce,
    'Signed-Fields': sortedKeys.join(','),
  };
}

// ── Call Selcom disbursement API ──────────────────────────────────
interface SelcomTransferResult {
  success: boolean;
  transactionRef: string | null;
  responseCode: string;
  responseDescription: string;
  rawResponse: Record<string, unknown>;
  isPending: boolean;
}

async function callSelcomDisbursement(
  baseUrl: string,
  reference: string,
  phoneNumber: string,
  provider: string,
  amountTZS: number,
  description: string,
): Promise<SelcomTransferResult> {
  // ⚠️  Adapt request body shape to Selcom's actual disbursement endpoint spec.
  const body = {
    reference,
    destination_account: phoneNumber,
    destination_channel: PROVIDER_CHANNEL[provider] ?? provider.toUpperCase(),
    amount:              amountTZS,
    currency:            'TZS',
    description,
    callback_url:        SELCOM_WEBHOOK_URL,
  };

  const headers = await buildSelcomHeaders(
    { reference, amount: String(amountTZS) },
    SELCOM_API_KEY,
    SELCOM_API_SECRET,
  );

  let rawResponse: Record<string, unknown> = {};

  try {
    const res = await fetch(`${baseUrl}/disburse`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
    });
    rawResponse = await res.json() as Record<string, unknown>;
  } catch (err) {
    return {
      success: false, transactionRef: null,
      responseCode: 'NETWORK_ERROR',
      responseDescription: String(err),
      rawResponse: { error: String(err) },
      isPending: false,
    };
  }

  // ⚠️  Map Selcom response codes per official documentation.
  const code        = String(rawResponse.resultcode ?? rawResponse.code ?? '');
  const description = String(rawResponse.resultdescription ?? rawResponse.description ?? '');
  const txRef       = String(rawResponse.transid ?? rawResponse.transaction_id ?? '');

  const isSuccess = ['0', '00', 'SUCCESS'].includes(code.toUpperCase());
  const isPending = ['PENDING', '100', '01'].includes(code.toUpperCase());

  return {
    success:             isSuccess,
    transactionRef:      txRef || null,
    responseCode:        code,
    responseDescription: description,
    rawResponse,
    isPending,
  };
}

// ── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const now       = new Date();
    const batchDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // ── Read selcom config ────────────────────────────────────────
    const { data: configs } = await db
      .from('system_config')
      .select('key, value')
      .in('key', ['selcom_environment', 'selcom_status']);

    const cfgMap = Object.fromEntries((configs || []).map((c: any) => [c.key, c.value]));
    const selcomEnv    = cfgMap.selcom_environment ?? 'sandbox';
    const selcomStatus = cfgMap.selcom_status ?? 'active';

    if (selcomStatus === 'paused') {
      return new Response(JSON.stringify({ ok: false, reason: 'Selcom disbursements are paused by admin' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = SELCOM_BASE[selcomEnv as 'sandbox' | 'production'] ?? SELCOM_BASE.sandbox;

    // ── Create batch record ───────────────────────────────────────
    const { data: batch, error: batchErr } = await db
      .from('disbursement_batches')
      .insert({
        batch_date:            batchDate,
        cutoff_time:           now.toISOString(),
        processing_started_at: now.toISOString(),
        batch_status:          'processing',
      })
      .select('id')
      .single();

    if (batchErr || !batch) {
      console.error('process-disbursement-batch: failed to create batch', batchErr);
      return new Response(JSON.stringify({ error: 'Failed to create batch' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const batchId = batch.id as string;

    // ── Fetch all scheduled payments ──────────────────────────────
    const { data: payments, error: paymentsErr } = await db
      .from('shift_payments')
      .select(`
        id, co_id, facility_id, shift_id,
        co_total_pay, adjusted_pay_amount,
        mobile_money_provider, mobile_money_number
      `)
      .eq('payment_status', 'scheduled');

    if (paymentsErr) {
      console.error('process-disbursement-batch: fetch payments failed', paymentsErr);
      return new Response(JSON.stringify({ error: paymentsErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!payments || payments.length === 0) {
      // Nothing to process — mark batch complete
      await db.from('disbursement_batches').update({
        batch_status:           'completed',
        processing_completed_at: new Date().toISOString(),
        total_cos_paid:          0,
        total_shifts_covered:    0,
        total_amount_disbursed:  0,
      }).eq('id', batchId);

      return new Response(JSON.stringify({ ok: true, message: 'No scheduled payments', batch_id: batchId }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Group payments by CO ──────────────────────────────────────
    type CoGroup = {
      coId:     string;
      provider: string;
      number:   string;
      total:    number;
      paymentIds: string[];
      shiftIds:   string[];
    };

    const byCoMap: Record<string, CoGroup> = {};

    for (const p of payments as any[]) {
      if (!p.mobile_money_provider || !p.mobile_money_number) {
        // No mobile money details — mark as failed immediately
        await db.from('shift_payments').update({
          payment_status:  'failed',
          failure_reason:  'No mobile money details on file',
          failure_logged_at: new Date().toISOString(),
          disbursement_batch_id: batchId,
        }).eq('id', p.id);
        continue;
      }

      if (!byCoMap[p.co_id]) {
        byCoMap[p.co_id] = {
          coId:       p.co_id,
          provider:   p.mobile_money_provider,
          number:     p.mobile_money_number,
          total:      0,
          paymentIds: [],
          shiftIds:   [],
        };
      }

      const effectivePay = p.adjusted_pay_amount ?? p.co_total_pay;
      byCoMap[p.co_id].total += effectivePay;
      byCoMap[p.co_id].paymentIds.push(p.id);
      byCoMap[p.co_id].shiftIds.push(p.shift_id);
    }

    const coGroups = Object.values(byCoMap);

    // Provider totals tracking for batch summary
    const providerStats: Record<string, { count: number; total_amount: number; failed: number }> = {
      mpesa:        { count: 0, total_amount: 0, failed: 0 },
      mixx_by_yas:  { count: 0, total_amount: 0, failed: 0 },
      airtel_money: { count: 0, total_amount: 0, failed: 0 },
      halopesa:     { count: 0, total_amount: 0, failed: 0 },
    };

    let totalCOsPaid       = 0;
    let totalDisbursed     = 0;
    let totalFailed        = 0;
    let totalProcessing    = 0;

    // ── Process each CO ───────────────────────────────────────────
    for (const grp of coGroups) {
      const shiftCount = grp.paymentIds.length;
      const reference  = `AFW-${batchId.slice(0, 8).toUpperCase()}-${grp.coId.slice(0, 6).toUpperCase()}`;
      const description = `AfyaWork payment for ${shiftCount} shift${shiftCount > 1 ? 's' : ''} — ${batchDate}`;

      // Mark as processing immediately
      await db.from('shift_payments').update({
        payment_status:        'processing',
        disbursement_batch_id: batchId,
        selcom_transaction_ref: reference, // optimistic — overwritten by Selcom response
      }).in('id', grp.paymentIds);

      // Call Selcom
      const result = await callSelcomDisbursement(
        baseUrl, reference, grp.number, grp.provider, grp.total, description,
      );

      if (providerStats[grp.provider]) {
        providerStats[grp.provider].count       += shiftCount;
        providerStats[grp.provider].total_amount += grp.total;
      }

      if (result.success) {
        // Mark disbursed
        await db.from('shift_payments').update({
          payment_status:           'disbursed',
          selcom_transaction_ref:   result.transactionRef,
          selcom_response_code:     result.responseCode,
          selcom_response_description: result.responseDescription,
          selcom_raw_response:      result.rawResponse,
          disbursed_at:             new Date().toISOString(),
        }).in('id', grp.paymentIds);

        totalCOsPaid++;
        totalDisbursed += grp.total;
        totalProcessing += shiftCount; // will be subtracted below — tracked as disbursed

        // Send WhatsApp notification (fire-and-forget)
        await db.functions.invoke('send-whatsapp', {
          body: { event: 'payment_disbursed', co_id: grp.coId, batch_id: batchId },
        }).catch(() => {});

      } else if (result.isPending) {
        // Selcom returned PENDING — wait for webhook. Keep status as 'processing'.
        await db.from('shift_payments').update({
          selcom_transaction_ref:      result.transactionRef,
          selcom_response_code:        result.responseCode,
          selcom_response_description: result.responseDescription,
          selcom_raw_response:         result.rawResponse,
          selcom_webhook_received_at:  null, // will be set by webhook
        }).in('id', grp.paymentIds);

        totalProcessing += shiftCount;

      } else {
        // Failed
        await db.from('shift_payments').update({
          payment_status:              'failed',
          selcom_transaction_ref:      result.transactionRef,
          selcom_response_code:        result.responseCode,
          selcom_response_description: result.responseDescription,
          selcom_raw_response:         result.rawResponse,
          failure_reason:              result.responseDescription,
          failure_logged_at:           new Date().toISOString(),
        }).in('id', grp.paymentIds);

        if (providerStats[grp.provider]) {
          providerStats[grp.provider].failed += shiftCount;
        }

        totalFailed += shiftCount;

        // Alert admin (fire-and-forget)
        await db.functions.invoke('send-whatsapp', {
          body: { event: 'payment_failed_admin', co_id: grp.coId, batch_id: batchId, error: result.responseDescription },
        }).catch(() => {});
      }
    }

    // ── Finalise batch record ─────────────────────────────────────
    const hasFailures  = totalFailed > 0;
    const hasProcessing = totalProcessing > 0;
    const batchStatus = hasFailures && !hasProcessing ? 'partial_failure' : 'completed';

    await db.from('disbursement_batches').update({
      processing_completed_at: new Date().toISOString(),
      total_cos_paid:          totalCOsPaid,
      total_shifts_covered:    payments.length,
      total_amount_disbursed:  totalDisbursed,
      total_failed_transfers:  totalFailed,
      total_processing:        totalProcessing,
      batch_status:            batchStatus,
      transfers_by_provider:   providerStats,
    }).eq('id', batchId);

    return new Response(JSON.stringify({
      ok:              true,
      batch_id:        batchId,
      total_cos:       coGroups.length,
      total_shifts:    payments.length,
      total_disbursed: totalDisbursed,
      total_failed:    totalFailed,
      total_processing: totalProcessing,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('process-disbursement-batch error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
