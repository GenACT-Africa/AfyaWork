/**
 * AfyaWork — send-push Edge Function
 *
 * Called by a Database Webhook on INSERT into public.notifications.
 * Sends the notification as a Web Push message to every device the user
 * has enabled, and removes subscriptions the browser has discarded.
 *
 * Required secrets:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   — from scripts/generate-vapid-keys.mjs
 *   VAPID_SUBJECT                          — e.g. mailto:support@afyawork.com
 *   INTERNAL_WEBHOOK_SECRET                — sent by the webhook as x-webhook-secret
 * Deploy with: supabase functions deploy --no-verify-jwt send-push
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireService } from '../_shared/auth.ts';
import { sendWebPush, type VapidKeys } from '../_shared/webpush.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const VAPID: VapidKeys = {
  publicKey:  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject:    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@afyawork.com',
};

// Events where a few minutes' delay matters → high urgency; the rest normal
const URGENT = new Set(['shift_offer', 'co_checked_in', 'co_checked_out', 'checkin_approved',
                        'checkout_approved', 'shift_cancelled', 'offer_declined']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const denied = requireService(req);
  if (denied) return denied;

  if (!VAPID.publicKey || !VAPID.privateKey) {
    console.warn('send-push: VAPID keys not configured — skipping');
    return json({ skipped: 'vapid keys not configured' });
  }

  try {
    const payload = await req.json();
    if (payload?.type !== 'INSERT' || payload?.table !== 'notifications') {
      return json({ skipped: 'not a notification insert' });
    }
    const n = payload.record as {
      id: string; user_id: string | null; type: string; title: string; body: string | null;
      action_url: string | null; shift_id: string | null;
    };
    if (!n?.user_id) return json({ skipped: 'no recipient' });

    const { data: subs, error } = await db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', n.user_id);
    if (error) throw error;
    if (!subs || subs.length === 0) return json({ sent: 0, note: 'user has no devices' });

    // Only same-origin paths may be opened from a notification
    const url = n.action_url && n.action_url.startsWith('/') ? n.action_url : '/';
    const message = {
      title: n.title,
      body: n.body ?? '',
      url,
      tag: `${n.type}-${n.shift_id ?? n.id}`,
      notificationId: n.id,
    };

    let sent = 0, removed = 0, failed = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        const r = await sendWebPush(s, message, VAPID, {
          urgency: URGENT.has(n.type) ? 'high' : 'normal',
          topic: message.tag,
        });
        if (r.ok) {
          sent++;
          await db.from('push_subscriptions')
            .update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id);
        } else if (r.gone) {
          removed++;
          await db.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          failed++;
          console.warn('send-push: push service refused', r.status, r.body);
          await db.rpc('record_push_failure', { p_id: s.id });
        }
      } catch (e) {
        failed++;
        console.error('send-push: error sending to one device', e);
      }
    }));

    return json({ sent, removed, failed });
  } catch (e) {
    console.error('send-push error:', e);
    return json({ error: String(e) }, 500);
  }
});
