/**
 * AfyaWork — Twilio WhatsApp Template Creator (v2)
 *
 * Recreates all templates WITHOUT URL variables, which is the main reason
 * Meta rejects templates for business-initiated (proactive) messaging.
 * URLs are now hardcoded as afyawork.com — only non-URL data is
 * passed as variables.
 *
 * Usage:
 *   TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx \
 *     deno run --allow-net --allow-env create-templates.ts
 *
 * Before running:
 *   1. In Twilio Console → Content Template Builder, DELETE the old rejected
 *      templates (afyawork_shift_offer, afyawork_offer_accepted, etc.)
 *   2. Run this script — it creates v2 templates with _v2 suffix
 *   3. Set the printed SIDs as Supabase Edge Function Secrets
 *
 * After WhatsApp approves business-initiated, messages will reach users
 * at any time — not just within the 24-hour messaging window.
 */

const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN');

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('Error: Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars before running.');
  Deno.exit(1);
}

const BASE = 'https://content.twilio.com/v1';
const AUTH = `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`;

// ── Template definitions (v2 — no URL variables) ──────────────────────────────
//
// Key rule: Meta rejects business-initiated templates that have full URLs
// inside variables ({{n}} = "https://..."). Fix: hardcode the domain and
// use "Open the AfyaWork app" as the CTA, or hardcode specific app paths.
//
// The invite template is the ONLY exception — it MUST have a unique link
// per user, so we keep the URL variable there.

const TEMPLATES = [
  // ── 1. User invite (keeps URL variable — unique per user, no other option) ───
  {
    envKey:        'WA_TMPL_INVITE',
    friendlyName:  'afyawork_invite_v2',
    waName:        'afyawork_invite_v2',
    category:      'UTILITY',
    body:
      'Hi {{1}}, you have been invited to join AfyaWork as a {{2}}.\n\n' +
      'AfyaWork connects healthcare facilities with Clinical Officers for locum shifts in Tanzania.\n\n' +
      'Activate your account:\n{{3}}\n\n' +
      'This link expires in 72 hours.',
    sampleVars: {
      '1': 'Amina',
      '2': 'Clinical Officer',
      '3': 'https://afyawork.com/auth/set-password?token=sample123',
    },
  },

  // ── 2. Shift offer to CO ────────────────────────────────────────────────────
  {
    envKey:        'WA_TMPL_SHIFT_OFFER',
    friendlyName:  'afyawork_shift_offer_v2',
    waName:        'afyawork_shift_offer_v2',
    category:      'UTILITY',
    body:
      'Hello {{1}}, you have been selected for a shift on AfyaWork!\n\n' +
      'Shift: {{2}}\n' +
      'Pay: {{3}}\n' +
      'Facility: {{4}}\n\n' +
      'You have 24 hours to accept or decline. Open the AfyaWork app to respond.',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'TZS 80,000',
      '4': 'Muhimbili National Hospital',
    },
  },

  // ── 3. Offer accepted — notify facility ────────────────────────────────────
  {
    envKey:        'WA_TMPL_OFFER_ACCEPTED',
    friendlyName:  'afyawork_offer_accepted_v2',
    waName:        'afyawork_offer_accepted_v2',
    category:      'UTILITY',
    body:
      'Good news from AfyaWork! {{1}} has accepted your shift offer for {{2}}.\n\n' +
      'They will check in on shift day. You will receive a notification when they arrive.\n\n' +
      'Open the AfyaWork app to view shift details.',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
    },
  },

  // ── 4. Offer declined — notify facility ────────────────────────────────────
  {
    envKey:        'WA_TMPL_OFFER_DECLINED',
    friendlyName:  'afyawork_offer_declined_v2',
    waName:        'afyawork_offer_declined_v2',
    category:      'UTILITY',
    body:
      'AfyaWork update: {{1}} has declined the shift offer for {{2}}.\n\n' +
      'The shift is now open again. Open the AfyaWork app to select a new applicant.',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
    },
  },

  // ── 5. CO checked in — notify facility ─────────────────────────────────────
  {
    envKey:        'WA_TMPL_CO_CHECKED_IN',
    friendlyName:  'afyawork_co_checked_in_v2',
    waName:        'afyawork_co_checked_in_v2',
    category:      'UTILITY',
    body:
      'AfyaWork: {{1}} has checked in for {{2}} at {{3}}.\n\n' +
      'Please open the AfyaWork app to confirm they are on-site and start the shift.',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': '8:04 AM',
    },
  },

  // ── 6. Check-in confirmed — notify CO ──────────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKIN_APPROVED',
    friendlyName:  'afyawork_checkin_approved_v2',
    waName:        'afyawork_checkin_approved_v2',
    category:      'UTILITY',
    body:
      'AfyaWork: Your check-in for {{1}} has been confirmed by {{2}}.\n\n' +
      'Your shift is now in progress. Remember to check out when you are done.',
    sampleVars: {
      '1': 'Day (8AM-4PM) · 12 Jun 2026',
      '2': 'Muhimbili National Hospital',
    },
  },

  // ── 7. Check-in disputed — notify admin ────────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKIN_DISPUTED',
    friendlyName:  'afyawork_checkin_disputed_v2',
    waName:        'afyawork_checkin_disputed_v2',
    category:      'UTILITY',
    body:
      'AfyaWork alert: A check-in dispute has been raised.\n\n' +
      'Shift: {{1}}\n' +
      'Facility: {{2}}\n' +
      'Clinical Officer: {{3}}\n' +
      'Reason: {{4}}\n\n' +
      'Please review in the AfyaWork admin dashboard.',
    sampleVars: {
      '1': 'Day (8AM-4PM) · 12 Jun 2026',
      '2': 'Muhimbili National Hospital',
      '3': 'Dr. Amina Said',
      '4': 'CO did not appear on site',
    },
  },

  // ── 8. CO checked out — notify facility ────────────────────────────────────
  {
    envKey:        'WA_TMPL_CO_CHECKED_OUT',
    friendlyName:  'afyawork_co_checked_out_v2',
    waName:        'afyawork_co_checked_out_v2',
    category:      'UTILITY',
    body:
      'AfyaWork: {{1}} has checked out for {{2}} at {{3}}.\n\n' +
      'Please open the AfyaWork app to confirm and mark the shift complete.',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': '4:02 PM',
    },
  },

  // ── 9. Checkout confirmed — notify CO ──────────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKOUT_APPROVED',
    friendlyName:  'afyawork_checkout_approved_v2',
    waName:        'afyawork_checkout_approved_v2',
    category:      'UTILITY',
    body:
      'AfyaWork: Your shift is complete! {{1}} has confirmed your checkout for {{2}}.\n\n' +
      'Your payment of {{3}} has been queued for admin approval.\n\n' +
      'Open the AfyaWork app to view your payment status.',
    sampleVars: {
      '1': 'Muhimbili National Hospital',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'TZS 80,000',
    },
  },

  // ── 10. Checkout disputed — notify admin ───────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKOUT_DISPUTED',
    friendlyName:  'afyawork_checkout_disputed_v2',
    waName:        'afyawork_checkout_disputed_v2',
    category:      'UTILITY',
    body:
      'AfyaWork alert: A checkout dispute has been raised.\n\n' +
      'Shift: {{1}}\n' +
      'Facility: {{2}}\n' +
      'Clinical Officer: {{3}}\n' +
      'Reason: {{4}}\n\n' +
      'Please review in the AfyaWork admin dashboard.',
    sampleVars: {
      '1': 'Day (8AM-4PM) · 12 Jun 2026',
      '2': 'Muhimbili National Hospital',
      '3': 'Dr. Amina Said',
      '4': 'CO left before shift ended',
    },
  },

  // ── 11. Dispute resolved — notify CO ───────────────────────────────────────
  {
    envKey:        'WA_TMPL_DISPUTE_RESOLVED',
    friendlyName:  'afyawork_dispute_resolved_v2',
    waName:        'afyawork_dispute_resolved_v2',
    category:      'UTILITY',
    body:
      'AfyaWork: The dispute for your shift {{1}} has been resolved.\n\n' +
      'Outcome: {{2}}\n' +
      'Note: {{3}}\n\n' +
      'Open the AfyaWork app to view details.',
    sampleVars: {
      '1': 'Day (8AM-4PM) · 12 Jun 2026',
      '2': 'Resolved in your favour',
      '3': 'Facility confirmed CO was present',
    },
  },

  // ── 12. Payment sent — notify CO ───────────────────────────────────────────
  {
    envKey:        'WA_TMPL_PAYMENT_DISBURSED',
    friendlyName:  'afyawork_payment_disbursed_v2',
    waName:        'afyawork_payment_disbursed_v2',
    category:      'UTILITY',
    body:
      'AfyaWork: Your payment has been sent!\n\n' +
      'Amount: {{1}}\n' +
      'Shift: {{2}}\n' +
      'Sent to: {{3}} ending in {{4}}\n' +
      'Reference: {{5}}\n\n' +
      'Open the AfyaWork app to view your payment history.',
    sampleVars: {
      '1': 'TZS 80,000',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'M-Pesa',
      '4': '4321',
      '5': 'MPesa-ABC123',
    },
  },

  // ── 13. Payment failed — admin alert ───────────────────────────────────────
  {
    envKey:        'WA_TMPL_PAYMENT_FAILED',
    friendlyName:  'afyawork_payment_failed_v2',
    waName:        'afyawork_payment_failed_v2',
    category:      'UTILITY',
    body:
      'AfyaWork alert: A payment could not be processed.\n\n' +
      'Amount: {{1}}\n' +
      'Clinical Officer: {{2}}\n' +
      'Shift: {{3}}\n' +
      'Reason: {{4}}\n\n' +
      'Please review in the AfyaWork admin dashboard.',
    sampleVars: {
      '1': 'TZS 80,000',
      '2': 'Dr. Amina Said',
      '3': 'Day (8AM-4PM) · 12 Jun 2026',
      '4': 'Invalid mobile money number',
    },
  },
];

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiRequest(url: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`API error ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nCreating ${TEMPLATES.length} AfyaWork WhatsApp templates (v2 — no URL variables)...\n`);

const results: { envKey: string; sid: string; status: string }[] = [];
const enc = new TextEncoder();

for (const tmpl of TEMPLATES) {
  Deno.stdout.write(enc.encode(`  Creating "${tmpl.friendlyName}"... `));

  try {
    const content = await apiRequest(`${BASE}/Content`, {
      friendly_name: tmpl.friendlyName,
      language:      'en',
      variables:     tmpl.sampleVars,
      types:         { 'twilio/text': { body: tmpl.body } },
    });

    const contentSid = content.sid as string;
    console.log(`created (${contentSid})`);

    Deno.stdout.write(enc.encode(`    Submitting for WhatsApp approval... `));
    await apiRequest(`${BASE}/Content/${contentSid}/ApprovalRequests/whatsapp`, {
      name:     tmpl.waName,
      category: tmpl.category,
    });
    console.log('submitted ✓');

    results.push({ envKey: tmpl.envKey, sid: contentSid, status: 'submitted' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAILED — ${msg}`);
    results.push({ envKey: tmpl.envKey, sid: 'ERROR', status: msg });
  }
}

console.log('\n' + '─'.repeat(70));
console.log('RESULTS — Add these as Supabase Edge Function Secrets');
console.log('(Dashboard → Edge Functions → send-whatsapp → Secrets)');
console.log('─'.repeat(70) + '\n');

for (const r of results) {
  if (r.sid === 'ERROR') {
    console.log(`  ✗ ${r.envKey}  [FAILED: ${r.status}]`);
  } else {
    console.log(`  ${r.envKey}=${r.sid}`);
  }
}

console.log('\nApproval timeline: 1–48 hours. Check status in Twilio → Content Template Builder.');
console.log('Templates without URL variables are much more likely to get business-initiated approval.\n');
