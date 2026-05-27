/**
 * AfyaWork — send-whatsapp Edge Function
 *
 * Sends WhatsApp messages for every step in the shift lifecycle.
 * Provider: Twilio WhatsApp API (swap by setting WHATSAPP_PROVIDER=vonage, etc.)
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID       — Twilio Account SID
 *   TWILIO_AUTH_TOKEN        — Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM     — Sender number, e.g. "whatsapp:+14155238886" (sandbox)
 *                              or your verified WhatsApp Business number
 *   SUPABASE_URL             — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 *
 * Optional:
 *   APP_URL                  — defaults to https://afyawork.netlify.app
 *   ADMIN_PHONE              — admin phone for dispute alerts
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⚠️  Set these in Supabase Dashboard → Edge Functions → Secrets
// Never hardcode credentials here — GitHub will block the push.
const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_FROM  = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886';
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://afyawork.netlify.app';
const ADMIN_PHONE  = Deno.env.get('ADMIN_PHONE') ?? '+255712168011';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supabase admin client — bypasses RLS to fetch phone numbers
const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ── Event types handled ───────────────────────────────────────────
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { event, shift_id } = body;

    if (!event) return err('Missing event');

    if (event === 'invite') {
      await handleInvite(body);
      return ok({ sent: true });
    }

    if (!shift_id) return err('Missing shift_id');

    // Fetch full shift context once — used by all handlers
    const ctx = await fetchShiftContext(shift_id);
    if (!ctx) return err('Shift not found', 404);

    switch (event) {
      case 'shift_offer':         await onShiftOffer(ctx);         break;
      case 'offer_accepted':      await onOfferAccepted(ctx);      break;
      case 'offer_declined':      await onOfferDeclined(ctx);      break;
      case 'co_checked_in':       await onCOCheckedIn(ctx);        break;
      case 'checkin_approved':    await onCheckinApproved(ctx);    break;
      case 'checkin_disputed':    await onCheckinDisputed(ctx);    break;
      case 'co_checked_out':      await onCOCheckedOut(ctx);       break;
      case 'checkout_approved':   await onCheckoutApproved(ctx);   break;
      case 'checkout_disputed':   await onCheckoutDisputed(ctx);   break;
      case 'dispute_resolved':    await onDisputeResolved(ctx, body); break;
      default: return err(`Unknown event: ${event}`);
    }

    return ok({ sent: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('send-whatsapp error:', e);
    return err(msg, 500);
  }
});

// ── Context fetcher ───────────────────────────────────────────────

interface ShiftContext {
  shift:         Record<string, unknown>;
  co_name:       string;
  co_phone:      string | null;
  facility_name: string;
  facility_phone: string | null;
  shift_label:   string; // e.g. "Day (8AM-4PM) · 12 Jun 2026"
  pay_label:     string; // e.g. "TZS 80,000"
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

// ── Event handlers ────────────────────────────────────────────────

async function handleInvite(body: {
  to_phone?: string;
  display_name?: string;
  role?: string;
  invite_url?: string;
}) {
  const { to_phone, display_name, role, invite_url } = body;
  if (!to_phone || !invite_url) return;

  const name = display_name ?? 'there';
  const roleLabel = role === 'facility' ? 'healthcare facility' : 'Clinical Officer';

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

async function onShiftOffer(ctx: ShiftContext) {
  if (!ctx.co_phone) return;
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

async function onOfferAccepted(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;
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

async function onOfferDeclined(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;
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

async function onCOCheckedIn(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;
  const checkinTime = ctx.shift.checkin_at
    ? new Date(String(ctx.shift.checkin_at)).toLocaleTimeString('en-TZ', { timeStyle: 'short' })
    : '';
  await send(ctx.facility_phone, [
    `📍 *${ctx.co_name} has checked in*`,
    ``,
    `📋 ${ctx.shift_label}`,
    checkinTime ? `🕐 Check-in time: ${checkinTime}` : '',
    ``,
    `Please *confirm* they are on-site to start the shift:`,
    `👉 ${APP_URL}/facility/shifts/${ctx.shift.id}`,
  ].filter(Boolean).join('\n'));
}

async function onCheckinApproved(ctx: ShiftContext) {
  if (!ctx.co_phone) return;
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

async function onCheckinDisputed(ctx: ShiftContext) {
  // Notify admin
  const adminPhone = ADMIN_PHONE;
  if (!adminPhone) return;
  await send(adminPhone, [
    `🚨 *Check-in dispute raised*`,
    ``,
    `*Facility:* ${ctx.facility_name}`,
    `*CO:* ${ctx.co_name}`,
    `📋 ${ctx.shift_label}`,
    `*Reason:* ${ctx.shift.dispute_reason ?? 'No reason given'}`,
    ``,
    `Review in admin dashboard.`,
  ].join('\n'));
}

async function onCOCheckedOut(ctx: ShiftContext) {
  if (!ctx.facility_phone) return;
  const checkoutTime = ctx.shift.checkout_at
    ? new Date(String(ctx.shift.checkout_at)).toLocaleTimeString('en-TZ', { timeStyle: 'short' })
    : '';
  await send(ctx.facility_phone, [
    `🔔 *${ctx.co_name} has checked out*`,
    ``,
    `📋 ${ctx.shift_label}`,
    checkoutTime ? `🕐 Check-out time: ${checkoutTime}` : '',
    ``,
    `Please *confirm* to mark the shift as complete and release payment:`,
    `👉 ${APP_URL}/facility/shifts/${ctx.shift.id}`,
  ].filter(Boolean).join('\n'));
}

async function onCheckoutApproved(ctx: ShiftContext) {
  if (!ctx.co_phone) return;
  await send(ctx.co_phone, [
    `🎉 *Shift complete!*`,
    ``,
    `*${ctx.facility_name}* confirmed your checkout.`,
    `📋 ${ctx.shift_label}`,
    `💰 ${ctx.pay_label}`,
    ``,
    `Don't forget to rate your experience with this facility!`,
    `👉 ${APP_URL}/co/applications`,
  ].join('\n'));
}

async function onCheckoutDisputed(ctx: ShiftContext) {
  const adminPhone = ADMIN_PHONE;
  if (!adminPhone) return;
  await send(adminPhone, [
    `🚨 *Checkout dispute raised*`,
    ``,
    `*Facility:* ${ctx.facility_name}`,
    `*CO:* ${ctx.co_name}`,
    `📋 ${ctx.shift_label}`,
    `*Reason:* ${ctx.shift.dispute_reason ?? 'No reason given'}`,
    ``,
    `Review in admin dashboard.`,
  ].join('\n'));
}

async function onDisputeResolved(ctx: ShiftContext, body: Record<string, unknown>) {
  const resolution = body.resolution as string;
  const note       = (body.note as string) ?? '';

  // Notify CO
  if (ctx.co_phone) {
    const outcome = resolution === 'approve' ? '✅ Resolved in your favour' : '⚠️ Not resolved in your favour';
    await send(ctx.co_phone, [
      `⚖️ *Dispute resolved*`,
      ``,
      `📋 ${ctx.shift_label}`,
      `${outcome}`,
      note ? `Admin note: ${note}` : '',
      ``,
      `View details: ${APP_URL}/co/applications`,
    ].filter(Boolean).join('\n'));
  }
}

// ── Twilio sender ─────────────────────────────────────────────────

/**
 * Normalize phone to international format for Tanzania (+255…).
 * If the number already has a + it's passed through unchanged.
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length >= 12) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10)  return '+255' + digits.slice(1);
  if ((digits.startsWith('7') || digits.startsWith('6')) && digits.length === 9)
    return '+255' + digits;
  // Already has country code or unknown format — prepend + if missing
  return raw.startsWith('+') ? raw : '+' + digits;
}

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
    // Don't throw — WA notifications are best-effort
  } else {
    const json = await res.json();
    console.log(`WhatsApp sent → ${to} (sid: ${json.sid})`);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────

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
