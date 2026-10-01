# Push notifications — setup (about 10 minutes)

AfyaWork now sends phone and desktop notifications through the browser's own
push system. You don't need an SMS or WhatsApp account, and there's no cost
per message. Every in-app notification becomes a push, including four new
event types:

| Event | Who gets it |
|---|---|
| Selected for a shift, check-in/out approved, disputes resolved | CO |
| **New open shift posted** (new) | All active COs |
| **New applicant** (new) | Facility |
| CO accepted / declined, CO checked in / out | Facility |
| **Shift cancelled** (new) | Selected CO and anyone still waiting |
| **Payment sent** (new) | CO |

## 1. Create the keys (once)

In Terminal, from the `afyawork` folder:

```bash
node scripts/generate-vapid-keys.mjs
```

It prints two things:
- A `VITE_VAPID_PUBLIC_KEY=…` line. Add it to `.env` **and** to Vercel → Settings → Environment Variables.
- A `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=…` command. Run it as-is,
  with `SUPABASE_ACCESS_TOKEN` exported. **Never share the private key or put it in `.env`.**

Only do this once. If you make new keys later, everyone has to turn notifications on again.

## 2. Database

Supabase → SQL Editor → paste `supabase/migrations/20261001000000_push_notifications.sql` → Run.
It runs as one transaction and is safe to run again.

## 3. Deploy the function

```bash
supabase functions deploy --no-verify-jwt send-push
```

## 4. Add the secret to the new webhook

The migration creates a webhook named **send-push**. Edit it the same way as the
other three: Integrations → Database Webhooks → Webhooks → send-push → HTTP Headers
→ add `x-webhook-secret`, with the same value as the other webhooks → Update webhook.

## 5. Deploy the app

Push to GitHub / redeploy on Vercel (after step 1's Vercel variable is saved).

## How users turn it on

- **Android (Chrome) and computers:** a banner appears at the top of the dashboard.
  The user taps **Turn on notifications**, then **Allow**.
- **iPhone (iOS 16.4+):** the banner explains how to add AfyaWork to the Home Screen
  (Share → *Add to Home Screen*). After they open it from there, the same
  **Turn on notifications** banner appears.
- **Shared phones:** signing out unlinks the device, and the next person who signs in takes it over.
- If someone taps **Not now**, the banner comes back after a week.

## Test it

1. Sign in on your phone as a CO and turn on notifications.
2. Post a shift from a facility account on another device.
3. The CO phone should show "New shift: …" within a few seconds.
   - If nothing arrives, check the logs: Edge Functions → send-push → Logs.
   - `user has no devices` means notifications aren't on for that account yet.
   - `401` means the webhook header is missing or wrong.

## What changed in the code

- `public/sw.js`: service worker that shows the notifications. It does no caching, so it can't serve stale pages.
- `public/manifest.webmanifest` and `public/icons/`: let iPhone users install the app.
- `src/lib/push.js` and `src/components/common/PushPrompt.jsx`: the banner and the device registration.
- `supabase/functions/send-push` and `_shared/webpush.ts`: send the pushes, with no third-party library.
  The encryption is checked against the official RFC 8291 test vector
  (`deno test supabase/functions/_shared/webpush.test.ts`).
- WhatsApp through Twilio is now **off** in the app (`VITE_WHATSAPP_ENABLED=false`).
  Set it to `true` if you ever recover the Twilio account.
