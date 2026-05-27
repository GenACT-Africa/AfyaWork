/**
 * AfyaWork — send-whatsapp Edge Function
 *
 * Sends WhatsApp messages for every step in the shift lifecycle.
 * Provider: Twilio WhatsApp API
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   TWILIO_ACCOUNT_SID        — Twilio Account SID
 *   TWILIO_AUTH_TOKEN         — Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM      — e.g. "whatsapp:+14155238886" (sandbox)
 *   SUPABASE_URL              — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 *
 * Optional:
 *   APP_URL      — defaults to https://afyawork.netlify.app
 *   ADMIN_PHONE  — admin phone for dispute/payment alerts
 *
 * WhatsApp Template SIDs — set AFTER templates are approved by Meta.
 * Without these, the function falls back to free-form messages
 * (only delivered within the 24-hour WhatsApp messaging window).
 * Run create-templates.ts once to create & submit templates, then
 * copy the printed HX... SIDs here as Supabase Secrets.
 *
 *   WA_TMPL_INVITE
 *   WA_TMPL_SHIFT_OFFER
 *   WA_TMPL_OFFER_ACCEPTED
 *   WA_TMPL_OFFER_DECLINED
 *   WA_TMPL_CO_CHECKED_IN
 *   WA_TMPL_CHECKIN_APPROVED
 *   WA_TMPL_CHECKIN_DISPUTED
 *   WA_TMPL_CO_CHECKED_OUT
 *   WA_TMPL_CHECKOUT_APPROVED
 *   WA_TMPL_CHECKOUT_DISPUTED
 *   WA_TMPL_DISPUTE_RESOLVED
 *   WA_TMPL_PAYMENT_DISBURSED
 *   WA_TMPL_PAYMENT_FAILED
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Credentials & config ──────────────────────────────────────────────────────
// ⚠️  NEVER hardcode credentials — set them in Supabase Edge Function Secrets

const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+255742770669';
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://afyawork.netlify.app';
const ADMIN_PHONE  = Deno.env.get('ADMIN_PHONE') ?? '+255712168011';

// ── Template SIDs — set once approved by Meta ─────────────────────────────────
const TMPL_INVITE            = Deno.env.get('WA_TMPL_INVITE');
const TMPL_SHIFT_OFFER       = Deno.env.get('WA_TMPL_SHIFT_OFFER');
const TMPL_OFFER_ACCEPTED    = Deno.env.get('WA_TMPL_OFFER_ACCEPTED');
const TMPL_OFFER_DECLINED    = Deno.env.get('WA_TMPL_OFFER_DECLINED');
const TMPL_CO_CHECKED_IN     = Deno.env.get('WA_TMPL_CO_CHECKED_IN');
const TMPL_CHECKIN_APPROVED  = Deno.env.get('WA_TMPL_CHECKIN_APPROVED');
const TMPL_CHECKIN_DISPUTED  = Deno.env.get('WA_TMPL_CHECKIN_DISPUTED');
const TMPL_CO_CHECKED_OUT    = Deno.env.get('WA_TMPL_CO_CHECKED_OUT');
const TMPL_CHECKOUT_APPROVED = Deno.env.get('WA_TMPL_CHECKOUT_APPROVED');
const TMPL_CHECKOUT_DISPUTED = Deno.env.get('WA_TMPL_CHECKOUT_DISPUTED');
const TMPL_DISPUTE_RESOLVED  = Deno.env.get('WA_TMPL_DISPUTE_RESOLVED');
const TMPL_PAYMENT_DISBURSED = Deno.env.get('WA_TMPL_PAYMENT_DISBURSED');
const TMPL_PAYMENT_FAILED    = Deno.env.get('WA_TMPL_PAYMENT_FAILED');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ── Provider display labels ───────────────────────────────────────────────────
const PROVIDER_LABELS: Record<string, string> = {
  mpesa:        'M-Pesa',
  mixx_by_yas:  'Mixx by Yas',
  airtel_money: 'Airtel Money',
  halopesa:     'Halopesa',
};

// ── Handled events ────────────────────────────────────────────────────────────
//
//  INVITE FLOW
//  'invite'                → new user invited (CO or facility)
//
//  SHIFT LIFECYCLE (shift_id required)
//  'shift_offer'           → CO selected, has 24hr to accept/decline
//  'offer_accepted'        → CO accepted, notify facility
//  'offer_declined'        → CO declined, notify facility
//  'co_checked_in'         → CO checked in, notify facility to confirm
//  'checkin_approved'      → facility confirmed check-in, notify CO
//  'checkin_disputed'      → facility disputed check-in, notify admin
//  'co_checked_out'        → CO checked out, notify facility to confirm
//  'checkout_approved'     → facility confirmed checkout, notify CO
//  'checkout_disputed'     → facility disputed checkout, notify admin
//  'dispute_resolved'      → admin resolved dispute, notify CO
//
//  PAYMENT EVENTS (payment_id required)
//  'payment_disbursed'     → admin marked payment paid, notify CO
//  'payment_failed_admin'  → payment failed, notify admin

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { event, shift_id } = body;

    if (!event) return err('Missing event');

    // ── Events that don't need shift_id ────────────────────────────
    if (event === 'invite') {
      await handleInvite(body);
      return ok({ sent: true });
    }

    if (event === 'payment_disbursed') {
      await onPaymentDisbursed(body);
      return ok({ sent: true });
    }

    if (event === 'payment_failed_admin') {
      await onPaymentFailedAdmin(body);
      return ok({ sent: true });
    }

    // ── Shift lifecycle events ─────────────────────────────────────
    if (!shift_id) return err('Missing shift_id');

    const ctx = await fetchShiftContext(shift_id);
    if (!ctx) return err('Shift not found', 404);

    switch (event) {
      case 'shift_offer':        await onShiftOffer(ctx);              break;
      case 'offer_accepted':     await onOfferAccepted(ctx);           break;
      case 'offer_declined':     await onOfferDeclined(ctx);           break;
      case 'co_checked_in':      await onCOCheckedIn(ctx);             break;
      case 'checkin_approved':   await onCheckinApproved(ctx);         break;
      case 'checkin_disputed':   await onCheckinDisputed(ctx);         break;
      case 'co_checked_out':     await onCOCheckedOut(ctx);            break;
      case 'checkout_approved':  await onCheckoutApproved(ctx);        break;
      case 'checkout_disputed':  await onCheckoutDisputed(ctx);        break;
      case 'dispute_resolved':   await onDisputeResolved(ctx, body);   break;
      default: return err(`Unknown event: ${event}`);
    }

    return ok({ sent: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('send-whatsapp error:', e);
    return err(msg, 500);
  }
});

// ── Shift context fetcher ─────────────────────────────────────────────────────

interface ShiftContext {
  shift:          Record<string, unknown>;
  co_name:        string;
  co_phone:       string | null;
  facility_name:  string;
  facility_phone: string | null;
  shift_label:    string;  // e.g. "Day (8AM-4PM) · 12 Jun 2026"
  pay_label:      string;  // e.g. "TZS 80,000"
}

async function fetchShiftContext(shiftId: string): Promise<ShiftContext | null> {
  const { data: shift } = await db.from('shifts').select('*').eq('id', shiftId).single();
  if (!shift) return null;

  const [coRes, facilityRes, facilityProfileRes] = await Promise.all([
    shift.assigned_co_id
      ? db.from('users').select('display_name, phone').eq('id', shift.assigned_co_id).single()
      : Promise.resolve({ data: null }),
    db.from('users').select('display_name, phone').eq('id', shift.facility_id).single(),
    db.from('facility_profiles').select('facility_name').eq('user_id', shift.facility_id).single(),
  ]);

  const shiftDate = new Date(String(shift.shift_date) + 'T00:00:00').toLocaleDateString('en-TZ', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return {
    shift,
    co_name:        coRes.data?.display_name ?? 'The Clinical Officer',
    co_phone:       coRes.data?.phone ?? null,
    facility_name:  facilityProfileRes.data?.facility_name ?? facilityRes.data?.display_name ?? 'The Facility',
    facility_phone: facilityRes.data?.phone ?? null,
    shift_label:    `${shift.shift_type} · ${shiftDate}`,
    pay_label:      `TZS ${Number(shift.pay_amount).toLocaleString()}`,
  };
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleInvite(body: {
  to_phone?: string;
  display_name?: string;
  role?: string;
  invite_url?: string;
}) {
  const { to_phone, display_name, role, invite_url } = body;
  if (!to_phone || !invite_url) return;

  const name      = display_name ?? 'there';
  const roleLabel = role === 'facility' ? 'healthcare facility' : 'Clinical Officer';

  if (TMPL_INVITE) {
    await sendTemplate(to_phone, TMPL_INVITE, { '1': name, '2': roleLabel, '3': invite_url });
  } else {
    await send(to_phone, [
      `👋 Hi ${name}!`,
      ``,
      `You've been invited to join *AfyaWork* as a ${roleLabel}.`,
      `AfyaWork connects healthcare facilities with Clinical Officers for locum shifts across Tanzania.`,
      ``,
      `Tap the link below to set your password and activate your account:`,
      `🔗 ${invite_url}`,
      ``,
      `⏱ This link expires in *72 hours*.`,
      ``,
      `_AfyaWork · Dar es Salaam, Tanzania_`,
    ].join('\n'));
  }
}

async function onShiftOffer(ctx: ShiftContext) {
  if (!ctx.co_phone) return;

  if (TMPL_SHIFT_OFFER) {
    await sendTemplate(ctx.co_phone, TMPL_SHIFT_OFFER, {
      '1': ctx.co_name,
      '2': ctx.shift_label,
      '3': ctx.pay_label,
      '4': ctx.facility_name,
      '5': `${APP_URL}/co/applications`,
    });
  } else {
    await send(ctx.co_phone, [
      `🎉 *You've been selected for a shift!*`,
      ``,
      `*Shift:* ${ctx.shift_label}`,
      `*Pay:* ${ctx.pay_label}`,
      `*Facility:* ${ctx.facility_name}`,
      ``,
      `You have *24 hours* to accept or decline this offer.`,
      ``,
      `Open AfyaWork to respond:`,
      `👉 ${APP_URL}/co/applications`,
    ].join('\n'));
  }
}

async function onOfferAccepted(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;

  if (TMPL_OFFER_ACCEPTED) {
    await sendTemplate(ctx.facility_phone, TMPL_OFFER_ACCEPTED, {
      '1': ctx.co_name,
      '2': ctx.shift_label,
      '3': `${APP_URL}/facility/shifts/${ctx.shift.id}`,
    });
  } else {
    await send(ctx.facility_phone, [
      `✅ *Shift offer accepted!*`,
      ``,
      `*${ctx.co_name}* has confirmed attendance for:`,
      `📋 ${ctx.shift_label}`,
      ``,
      `They will check in on shift day. You'll receive a WhatsApp when they arrive.`,
      ``,
      `View shift details:`,
      `👉 ${APP_URL}/facility/shifts/${ctx.shift.id}`,
    ].join('\n'));
  }
}

async function onOfferDeclined(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;

  if (TMPL_OFFER_DECLINED) {
    await sendTemplate(ctx.facility_phone, TMPL_OFFER_DECLINED, {
      '1': ctx.co_name,
      '2': ctx.shift_label,
      '3': `${APP_URL}/facility/shifts/${ctx.shift.id}`,
    });
  } else {
    await send(ctx.facility_phone, [
      `⚠️ *Shift offer declined*`,
      ``,
      `*${ctx.co_name}* has declined your offer for:`,
      `📋 ${ctx.shift_label}`,
      ``,
      `The shift is now *open* again. Log in to select a new applicant.`,
      `👉 ${APP_URL}/facility/shifts/${ctx.shift.id}`,
    ].join('\n'));
  }
}

async function onCOCheckedIn(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;

  const checkinTime = ctx.shift.checkin_at
    ? new Date(String(ctx.shift.checkin_at)).toLocaleTimeString('en-TZ', { timeStyle: 'short' })
    : 'just now';

  if (TMPL_CO_CHECKED_IN) {
    await sendTemplate(ctx.facility_phone, TMPL_CO_CHECKED_IN, {
      '1': ctx.co_name,
      '2': ctx.shift_label,
      '3': checkinTime,
      '4': `${APP_URL}/facility/shifts/${ctx.shift.id}`,
    });
  } else {
    await send(ctx.facility_phone, [
      `📍 *${ctx.co_name} has checked in*`,
      ``,
      `📋 ${ctx.shift_label}`,
      `🕐 Check-in time: ${checkinTime}`,
      ``,
      `Please *confirm* they are on-site to start the shift:`,
      `👉 ${APP_URL}/facility/shifts/${ctx.shift.id}`,
    ].join('\n'));
  }
}

async function onCheckinApproved(ctx: ShiftContext) {
  if (!ctx.co_phone) return;

  if (TMPL_CHECKIN_APPROVED) {
    await sendTemplate(ctx.co_phone, TMPL_CHECKIN_APPROVED, {
      '1': ctx.shift_label,
      '2': ctx.facility_name,
      '3': `${APP_URL}/co/applications`,
    });
  } else {
    await send(ctx.co_phone, [
      `✅ *Check-in confirmed!*`,
      ``,
      `*${ctx.facility_name}* confirmed you're on-site.`,
      `📋 Your shift is now *in progress*.`,
      ``,
      `Remember to check out when you're done!`,
      `👉 ${APP_URL}/co/applications`,
    ].join('\n'));
  }
}

async function onCheckinDisputed(ctx: ShiftContext) {
  if (!ADMIN_PHONE) return;

  const reason = String(ctx.shift.dispute_reason ?? 'No reason given');

  if (TMPL_CHECKIN_DISPUTED) {
    await sendTemplate(ADMIN_PHONE, TMPL_CHECKIN_DISPUTED, {
      '1': ctx.shift_label,
      '2': ctx.facility_name,
      '3': ctx.co_name,
      '4': reason,
    });
  } else {
    await send(ADMIN_PHONE, [
      `🚨 *Check-in dispute raised*`,
      ``,
      `*Facility:* ${ctx.facility_name}`,
      `*CO:* ${ctx.co_name}`,
      `📋 ${ctx.shift_label}`,
      `*Reason:* ${reason}`,
      ``,
      `Review in admin dashboard.`,
    ].join('\n'));
  }
}

async function onCOCheckedOut(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;

  const checkoutTime = ctx.shift.checkout_at
    ? new Date(String(ctx.shift.checkout_at)).toLocaleTimeString('en-TZ', { timeStyle: 'short' })
    : 'just now';

  if (TMPL_CO_CHECKED_OUT) {
    await sendTemplate(ctx.facility_phone, TMPL_CO_CHECKED_OUT, {
      '1': ctx.co_name,
      '2': ctx.shift_label,
      '3': checkoutTime,
      '4': `${APP_URL}/facility/shifts/${ctx.shift.id}`,
    });
  } else {
    await send(ctx.facility_phone, [
      `🔔 *${ctx.co_name} has checked out*`,
      ``,
      `📋 ${ctx.shift_label}`,
      `🕐 Check-out time: ${checkoutTime}`,
      ``,
      `Please *confirm* to mark the shift as complete and release payment:`,
      `👉 ${APP_URL}/facility/shifts/${ctx.shift.id}`,
    ].join('\n'));
  }
}

async function onCheckoutApproved(ctx: ShiftContext) {
  if (!ctx.co_phone) return;

  if (TMPL_CHECKOUT_APPROVED) {
    await sendTemplate(ctx.co_phone, TMPL_CHECKOUT_APPROVED, {
      '1': ctx.facility_name,
      '2': ctx.shift_label,
      '3': ctx.pay_label,
      '4': `${APP_URL}/co/payments`,
    });
  } else {
    await send(ctx.co_phone, [
      `🎉 *Shift complete!*`,
      ``,
      `*${ctx.facility_name}* confirmed your checkout.`,
      `📋 ${ctx.shift_label}`,
      `💰 ${ctx.pay_label} — queued for admin approval`,
      ``,
      `View your payment status:`,
      `👉 ${APP_URL}/co/payments`,
    ].join('\n'));
  }
}

async function onCheckoutDisputed(ctx: ShiftContext) {
  if (!ADMIN_PHONE) return;

  const reason = String(ctx.shift.dispute_reason ?? 'No reason given');

  if (TMPL_CHECKOUT_DISPUTED) {
    await sendTemplate(ADMIN_PHONE, TMPL_CHECKOUT_DISPUTED, {
      '1': ctx.shift_label,
      '2': ctx.facility_name,
      '3': ctx.co_name,
      '4': reason,
    });
  } else {
    await send(ADMIN_PHONE, [
      `🚨 *Checkout dispute raised*`,
      ``,
      `*Facility:* ${ctx.facility_name}`,
      `*CO:* ${ctx.co_name}`,
      `📋 ${ctx.shift_label}`,
      `*Reason:* ${reason}`,
      ``,
      `Review in admin dashboard.`,
    ].join('\n'));
  }
}

async function onDisputeResolved(ctx: ShiftContext, body: Record<string, unknown>) {
  if (!ctx.co_phone) return;

  const resolution = body.resolution as string;
  const note       = (body.note as string | undefined) ?? '';
  const outcome    = resolution === 'approve' ? 'Resolved in your favour' : 'Not resolved in your favour';
  const noteText   = note || 'No additional notes';

  if (TMPL_DISPUTE_RESOLVED) {
    await sendTemplate(ctx.co_phone, TMPL_DISPUTE_RESOLVED, {
      '1': ctx.shift_label,
      '2': outcome,
      '3': noteText,
      '4': `${APP_URL}/co/applications`,
    });
  } else {
    await send(ctx.co_phone, [
      `⚖️ *Dispute resolved*`,
      ``,
      `📋 ${ctx.shift_label}`,
      `${resolution === 'approve' ? '✅' : '⚠️'} ${outcome}`,
      note ? `Admin note: ${note}` : '',
      ``,
      `View details: ${APP_URL}/co/applications`,
    ].filter(Boolean).join('\n'));
  }
}

// ── Payment event handlers ────────────────────────────────────────────────────

async function onPaymentDisbursed(body: Record<string, unknown>) {
  const paymentId = body.payment_id as string | undefined;
  if (!paymentId) return;

  const { data: payment } = await db
    .from('shift_payments')
    .select('co_id, shift_id, adjusted_pay_amount, co_total_pay, mobile_money_provider, mobile_money_number, selcom_transaction_ref')
    .eq('id', paymentId)
    .single();

  if (!payment) return;

  const [coRes, shiftRes] = await Promise.all([
    db.from('users').select('display_name, phone').eq('id', payment.co_id).single(),
    db.from('shifts').select('shift_type, shift_date').eq('id', payment.shift_id).single(),
  ]);

  if (!coRes.data?.phone) return;

  const amount    = payment.adjusted_pay_amount ?? payment.co_total_pay ?? 0;
  const provider  = PROVIDER_LABELS[String(payment.mobile_money_provider)] ?? String(payment.mobile_money_provider ?? 'mobile money');
  const last4     = payment.mobile_money_number ? String(payment.mobile_money_number).slice(-4) : '????';
  const reference = String(payment.selcom_transaction_ref ?? 'N/A');

  let shiftLabel = 'your shift';
  if (shiftRes.data) {
    const d = new Date(String(shiftRes.data.shift_date) + 'T00:00:00')
      .toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
    shiftLabel = `${shiftRes.data.shift_type} · ${d}`;
  }

  const amountLabel = `TZS ${Number(amount).toLocaleString()}`;

  if (TMPL_PAYMENT_DISBURSED) {
    await sendTemplate(coRes.data.phone, TMPL_PAYMENT_DISBURSED, {
      '1': amountLabel,
      '2': shiftLabel,
      '3': provider,
      '4': last4,
      '5': reference,
      '6': `${APP_URL}/co/payments`,
    });
  } else {
    await send(coRes.data.phone, [
      `💸 *Payment sent!*`,
      ``,
      `*${amountLabel}* has been transferred for ${shiftLabel}.`,
      `Sent to ${provider} ···${last4}`,
      `Reference: ${reference}`,
      ``,
      `View payment history:`,
      `👉 ${APP_URL}/co/payments`,
    ].join('\n'));
  }
}

async function onPaymentFailedAdmin(body: Record<string, unknown>) {
  if (!ADMIN_PHONE) return;

  const paymentId = body.payment_id as string | undefined;
  if (!paymentId) return;

  const { data: payment } = await db
    .from('shift_payments')
    .select('co_id, shift_id, adjusted_pay_amount, co_total_pay, failure_reason')
    .eq('id', paymentId)
    .single();

  if (!payment) return;

  const [coRes, shiftRes] = await Promise.all([
    db.from('users').select('display_name').eq('id', payment.co_id).single(),
    db.from('shifts').select('shift_type, shift_date').eq('id', payment.shift_id).single(),
  ]);

  const amount    = payment.adjusted_pay_amount ?? payment.co_total_pay ?? 0;
  const coName    = coRes.data?.display_name ?? 'CO';
  const reason    = String(payment.failure_reason ?? 'Unknown reason');

  let shiftLabel = 'shift';
  if (shiftRes.data) {
    const d = new Date(String(shiftRes.data.shift_date) + 'T00:00:00')
      .toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
    shiftLabel = `${shiftRes.data.shift_type} · ${d}`;
  }

  const amountLabel = `TZS ${Number(amount).toLocaleString()}`;

  if (TMPL_PAYMENT_FAILED) {
    await sendTemplate(ADMIN_PHONE, TMPL_PAYMENT_FAILED, {
      '1': amountLabel,
      '2': coName,
      '3': shiftLabel,
      '4': reason,
    });
  } else {
    await send(ADMIN_PHONE, [
      `🚨 *Payment failed*`,
      ``,
      `*CO:* ${coName}`,
      `*Shift:* ${shiftLabel}`,
      `*Amount:* ${amountLabel}`,
      `*Reason:* ${reason}`,
      ``,
      `Review in admin dashboard.`,
    ].join('\n'));
  }
}

// ── Twilio senders ────────────────────────────────────────────────────────────

/**
 * Normalize phone to international format (+255…).
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length >= 12) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10)  return '+255' + digits.slice(1);
  if ((digits.startsWith('7') || digits.startsWith('6')) && digits.length === 9)
    return '+255' + digits;
  return raw.startsWith('+') ? raw : '+' + digits;
}

/**
 * Send a pre-approved WhatsApp template message.
 * Works 24/7 — not restricted by the WhatsApp messaging window.
 * contentVariables maps "1" → value, "2" → value, etc.
 */
async function sendTemplate(
  rawPhone: string,
  contentSid: string,
  contentVariables: Record<string, string>,
): Promise<void> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn('Twilio credentials not set — WhatsApp template message skipped');
    return;
  }

  const to   = `whatsapp:${normalizePhone(rawPhone)}`;
  const from = TWILIO_FROM;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From:             from,
        To:               to,
        ContentSid:       contentSid,
        ContentVariables: JSON.stringify(contentVariables),
      }).toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`Twilio template error (${res.status}):`, text);
  } else {
    const json = await res.json();
    console.log(`WhatsApp template sent → ${to} (sid: ${json.sid})`);
  }
}

/**
 * Send a free-form WhatsApp message.
 * Only works within 24 hours of the recipient last messaging this number.
 * Falls back gracefully — WA notifications are best-effort.
 */
async function send(rawPhone: string, message: string): Promise<void> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn('Twilio credentials not set — WhatsApp message skipped');
    return;
  }

  const to   = `whatsapp:${normalizePhone(rawPhone)}`;
  const from = TWILIO_FROM;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: message }).toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`Twilio error (${res.status}):`, text);
  } else {
    const json = await res.json();
    console.log(`WhatsApp sent → ${to} (sid: ${json.sid})`);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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
