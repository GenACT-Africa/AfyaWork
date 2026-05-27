/**
 * AfyaWork — Twilio WhatsApp Template Creator
 *
 * Run this ONCE to create all message templates in Twilio's Content Library
 * and submit them for WhatsApp / Meta approval.
 *
 * Usage:
 *   TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx \
 *     deno run --allow-net create-templates.ts
 *
 * After running:
 *   1. Templates appear in Twilio Console → Messaging → Content Template Builder
 *   2. WhatsApp approval typically takes 1–48 hours
 *   3. Copy the printed ContentSid values → set them as Supabase Edge Function
 *      Secrets (WA_TMPL_INVITE, WA_TMPL_SHIFT_OFFER, etc.)
 *
 * Once the SID env vars are set and templates are approved, the send-whatsapp
 * function automatically switches from free-form messages to approved templates
 * — which work 24/7, not just within the 24-hour WhatsApp messaging window.
 */

const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN');

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('Error: Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars before running.');
  Deno.exit(1);
}

const BASE = 'https://content.twilio.com/v1';
const AUTH = `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`;

// ── Template definitions ──────────────────────────────────────────────────────
//
// Rules for WhatsApp template bodies:
//   • Must NOT start with a variable placeholder
//   • Variable placeholders are {{1}}, {{2}}, etc. (consecutive, starting at 1)
//   • Body ≤ 1,024 characters
//   • Category UTILITY = transactional (highest approval rate for service apps)
//   • "variables" map provides sample values shown in Twilio Console preview

const TEMPLATES = [
  // ── 1. User invite ──────────────────────────────────────────────────────────
  {
    envKey:        'WA_TMPL_INVITE',
    friendlyName:  'afyawork_invite',
    waName:        'afyawork_invite',
    category:      'UTILITY',
    body:
      'Hi {{1}}, you have been invited to join AfyaWork as a {{2}}.\n\n' +
      'AfyaWork connects healthcare facilities with Clinical Officers for locum shifts in Tanzania.\n\n' +
      'Activate your account here:\n{{3}}\n\n' +
      'This link expires in 72 hours.',
    sampleVars: {
      '1': 'Amina',
      '2': 'Clinical Officer',
      '3': 'https://afyawork.netlify.app/auth/set-password?token=sample',
    },
  },

  // ── 2. Shift offer sent to CO ───────────────────────────────────────────────
  {
    envKey:        'WA_TMPL_SHIFT_OFFER',
    friendlyName:  'afyawork_shift_offer',
    waName:        'afyawork_shift_offer',
    category:      'UTILITY',
    body:
      'Hello {{1}}, you have been selected for a shift on AfyaWork!\n\n' +
      'Shift: {{2}}\n' +
      'Pay: {{3}}\n' +
      'Facility: {{4}}\n\n' +
      'You have 24 hours to accept or decline. Log in to respond:\n{{5}}',
    sampleVars: {
      '1': 'Amina',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'TZS 80,000',
      '4': 'Muhimbili National Hospital',
      '5': 'https://afyawork.netlify.app/co/applications',
    },
  },

  // ── 3. Offer accepted — notify facility ────────────────────────────────────
  {
    envKey:        'WA_TMPL_OFFER_ACCEPTED',
    friendlyName:  'afyawork_offer_accepted',
    waName:        'afyawork_offer_accepted',
    category:      'UTILITY',
    body:
      'Good news from AfyaWork! {{1}} has accepted your shift offer for {{2}}.\n\n' +
      'They will check in on shift day and you will receive a notification when they arrive.\n\n' +
      'View shift details:\n{{3}}',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'https://afyawork.netlify.app/facility/shifts/abc123',
    },
  },

  // ── 4. Offer declined — notify facility ────────────────────────────────────
  {
    envKey:        'WA_TMPL_OFFER_DECLINED',
    friendlyName:  'afyawork_offer_declined',
    waName:        'afyawork_offer_declined',
    category:      'UTILITY',
    body:
      'AfyaWork update: {{1}} has declined the shift offer for {{2}}.\n\n' +
      'The shift is now open again. Log in to select a new applicant:\n{{3}}',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'https://afyawork.netlify.app/facility/shifts/abc123',
    },
  },

  // ── 5. CO checked in — notify facility ─────────────────────────────────────
  {
    envKey:        'WA_TMPL_CO_CHECKED_IN',
    friendlyName:  'afyawork_co_checked_in',
    waName:        'afyawork_co_checked_in',
    category:      'UTILITY',
    body:
      'AfyaWork: {{1}} has checked in for {{2}} at {{3}}.\n\n' +
      'Please confirm they are on-site to start the shift:\n{{4}}',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': '8:04 AM',
      '4': 'https://afyawork.netlify.app/facility/shifts/abc123',
    },
  },

  // ── 6. Check-in confirmed — notify CO ──────────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKIN_APPROVED',
    friendlyName:  'afyawork_checkin_approved',
    waName:        'afyawork_checkin_approved',
    category:      'UTILITY',
    body:
      'AfyaWork: Your check-in for {{1}} has been confirmed by {{2}}.\n\n' +
      'Your shift is now in progress. Remember to check out when you are done:\n{{3}}',
    sampleVars: {
      '1': 'Day (8AM-4PM) · 12 Jun 2026',
      '2': 'Muhimbili National Hospital',
      '3': 'https://afyawork.netlify.app/co/applications',
    },
  },

  // ── 7. Check-in disputed — notify admin ────────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKIN_DISPUTED',
    friendlyName:  'afyawork_checkin_disputed',
    waName:        'afyawork_checkin_disputed',
    category:      'UTILITY',
    body:
      'AfyaWork alert: A check-in dispute has been raised.\n\n' +
      'Shift: {{1}}\n' +
      'Facility: {{2}}\n' +
      'Clinical Officer: {{3}}\n' +
      'Reason: {{4}}\n\n' +
      'Please review in the admin dashboard.',
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
    friendlyName:  'afyawork_co_checked_out',
    waName:        'afyawork_co_checked_out',
    category:      'UTILITY',
    body:
      'AfyaWork: {{1}} has checked out for {{2}} at {{3}}.\n\n' +
      'Please confirm to mark the shift complete and process payment:\n{{4}}',
    sampleVars: {
      '1': 'Dr. Amina Said',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': '4:02 PM',
      '4': 'https://afyawork.netlify.app/facility/shifts/abc123',
    },
  },

  // ── 9. Checkout confirmed — notify CO ──────────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKOUT_APPROVED',
    friendlyName:  'afyawork_checkout_approved',
    waName:        'afyawork_checkout_approved',
    category:      'UTILITY',
    body:
      'AfyaWork: Your shift is complete! {{1}} has confirmed your checkout for {{2}}.\n\n' +
      'Your payment of {{3}} has been queued for admin approval.\n\n' +
      'View payment details:\n{{4}}',
    sampleVars: {
      '1': 'Muhimbili National Hospital',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'TZS 80,000',
      '4': 'https://afyawork.netlify.app/co/payments',
    },
  },

  // ── 10. Checkout disputed — notify admin ───────────────────────────────────
  {
    envKey:        'WA_TMPL_CHECKOUT_DISPUTED',
    friendlyName:  'afyawork_checkout_disputed',
    waName:        'afyawork_checkout_disputed',
    category:      'UTILITY',
    body:
      'AfyaWork alert: A checkout dispute has been raised.\n\n' +
      'Shift: {{1}}\n' +
      'Facility: {{2}}\n' +
      'Clinical Officer: {{3}}\n' +
      'Reason: {{4}}\n\n' +
      'Please review in the admin dashboard.',
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
    friendlyName:  'afyawork_dispute_resolved',
    waName:        'afyawork_dispute_resolved',
    category:      'UTILITY',
    body:
      'AfyaWork: The dispute for your shift {{1}} has been resolved.\n\n' +
      'Outcome: {{2}}\n' +
      'Note: {{3}}\n\n' +
      'View details:\n{{4}}',
    sampleVars: {
      '1': 'Day (8AM-4PM) · 12 Jun 2026',
      '2': 'Resolved in your favour',
      '3': 'Facility confirmed CO was present',
      '4': 'https://afyawork.netlify.app/co/applications',
    },
  },

  // ── 12. Payment sent — notify CO ───────────────────────────────────────────
  {
    envKey:        'WA_TMPL_PAYMENT_DISBURSED',
    friendlyName:  'afyawork_payment_disbursed',
    waName:        'afyawork_payment_disbursed',
    category:      'UTILITY',
    body:
      'AfyaWork: Your payment has been sent!\n\n' +
      'Amount: {{1}}\n' +
      'Shift: {{2}}\n' +
      'Sent to: {{3}} ending in {{4}}\n' +
      'Reference: {{5}}\n\n' +
      'View payment history:\n{{6}}',
    sampleVars: {
      '1': 'TZS 80,000',
      '2': 'Day (8AM-4PM) · 12 Jun 2026',
      '3': 'M-Pesa',
      '4': '4321',
      '5': 'MPesa-ABC123',
      '6': 'https://afyawork.netlify.app/co/payments',
    },
  },

  // ── 13. Payment failed — notify admin ──────────────────────────────────────
  {
    envKey:        'WA_TMPL_PAYMENT_FAILED',
    friendlyName:  'afyawork_payment_failed',
    waName:        'afyawork_payment_failed',
    category:      'UTILITY',
    body:
      'AfyaWork alert: A payment has failed.\n\n' +
      'Amount: {{1}}\n' +
      'Clinical Officer: {{2}}\n' +
      'Shift: {{3}}\n' +
      'Reason: {{4}}\n\n' +
      'Please review in the admin dashboard.',
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

console.log(`\nCreating ${TEMPLATES.length} AfyaWork WhatsApp templates in Twilio...\n`);
console.log('Account SID:', ACCOUNT_SID.slice(0, 8) + '...\n');

const results: { envKey: string; sid: string; status: string }[] = [];

for (const tmpl of TEMPLATES) {
  const enc = new TextEncoder();
  Deno.stdout.write(enc.encode(`  Creating "${tmpl.friendlyName}"... `));

  try {
    // Step 1 — Create content in Twilio's Content Library
    const content = await apiRequest(`${BASE}/Content`, {
      friendly_name: tmpl.friendlyName,
      language:      'en',
      variables:     tmpl.sampleVars,
      types:         { 'twilio/text': { body: tmpl.body } },
    });

    const contentSid = content.sid as string;
    console.log(`created (${contentSid})`);

    // Step 2 — Submit for WhatsApp approval
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

// ── Print summary ─────────────────────────────────────────────────────────────

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

console.log('\nApproval timeline: WhatsApp/Meta typically reviews templates within 1–48 hours.');
console.log('Check status: Twilio Console → Messaging → Content Template Builder\n');
