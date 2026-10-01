# Finish moving AfyaWork to the new Supabase project

New project: **pwikwrzuixxmcjqyzfyq** (your Gmail account, eu-central-1)
Old project: tldrtoaneyqynagzhnav (GenACT account, paused; keep it as a backup for now)

## Done already

- **Database restored:** 34 accounts, 15 shifts, 24 applications, 5 payments and 22 ratings.
  People keep their passwords, but everyone has to sign in again.
- **Security migration applied.** It was checked on the live project: a CO trying to make
  themselves admin is refused.
- **`.env` points at the new project.** The old file is saved as `.env.genact-old.local`, which git ignores.

## 1. Edge functions (in Terminal, from the `afyawork` folder)

```bash
supabase login                                  # sign in with the Gmail account
supabase link --project-ref pwikwrzuixxmcjqyzfyq

# Secrets: reuse the values you had on the old project
supabase secrets set APP_URL=https://afyawork.com
supabase secrets set RESEND_API_KEY=...
supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_FROM=...
supabase secrets set ADMIN_PHONE=... ADMIN_WHATSAPP=...
# (plus any WA_TMPL_* template IDs you had set)
supabase secrets set INTERNAL_WEBHOOK_SECRET=$(openssl rand -hex 32)
supabase secrets set SELCOM_WEBHOOK_SECRET=$(openssl rand -hex 32)
# Selcom keys only when you go live with payouts:
# supabase secrets set SELCOM_API_KEY=... SELCOM_API_SECRET=... SELCOM_WEBHOOK_URL=...

supabase functions deploy --no-verify-jwt selcom-webhook
supabase functions deploy --no-verify-jwt notify-new-shift notify-new-application \
  notify-application-decision notify-shift-cancelled
supabase functions deploy admin-create-user activate-account send-invite-email send-whatsapp \
  calculate-shift-payment process-disbursement-batch generate-monthly-invoices
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
automatically, so don't set them.

## 2. Database webhooks (done except the secret header)

The three webhooks now exist in the new project and point at its functions:
notify-new-application, notify-application-decision and notify-shift-cancelled.
The functions reject calls until each webhook sends your secret. After step 1:

Dashboard → Integrations → Database Webhooks → Webhooks → edit each one →
HTTP Headers → add `x-webhook-secret` = your INTERNAL_WEBHOOK_SECRET → Save.

(Optional: add a `notify-new-shift` webhook on shifts / Insert. The old project never had one.)

## 3. Auth settings (done)

- Site URL: `https://afyawork.com`
- Redirect URLs: `https://afyawork.com/**` and `http://localhost:5173/**`.
  Add your Vercel preview URL too if you test there.
- Minimum password length: 8
- Still to check: **Email / SMTP**. If the old project sent auth emails through Resend or
  another provider, enter it under Authentication → Emails → SMTP Settings. Otherwise
  Supabase's built-in sender only allows a few emails per hour.

## 4. Vercel

Project → Settings → Environment Variables: update `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` to the values now in `.env`, then **Redeploy**.

## 5. Tidy up

- Delete `afyawork-migration-PRIVATE/`. It holds users' personal data and password hashes.
- In the SQL Editor, delete the saved query "AfyaWork MVP Schema & Shift Approval Workflow"
  so no one re-runs it by accident.
- Tell users to sign in again. The 11 who had profile photos will need to re-upload them.
- Once everything works for a week or two, you can delete the old GenACT project.
