# AfyaWork security hardening — how to roll out

Everything here was tested against a local Postgres copy built from the repo's
existing `supabase/*.sql` scripts: **61/61 checks pass after the migration, and
26/61 before it** (every failure before was a real hole). Re-run the tests any time with
`supabase/tests/security/run.sh`.

Do this on a **staging** Supabase project first, then production.

## 1. Database (SQL editor or `supabase db push`)

Run `supabase/migrations/20260927000000_security_hardening.sql`. It runs as one
transaction, so if anything fails, nothing changes. It is safe to run twice.

Before you run it, compare the live database with the repo. If you added columns
or policies in the dashboard, check them against the lists of editable columns in
sections 2–4 of the migration.

## 2. Edge functions

Deploy all of them. `_shared/auth.ts` is new, and every function now checks who is calling:

| Function | Who may call |
|---|---|
| process-disbursement-batch, generate-monthly-invoices, send-invite-email | admins, or the service role (pg_cron) |
| calculate-shift-payment | service role, admins, the facility on that shift |
| send-whatsapp | service role / admins for everything; signed-in users only for their own shift's events |
| notify-* (database webhooks) | service role key **or** `x-webhook-secret` header |
| selcom-webhook | requests carrying `SELCOM_WEBHOOK_SECRET` (it rejects everything if the secret isn't set) |

```bash
supabase secrets set INTERNAL_WEBHOOK_SECRET=$(openssl rand -hex 32)
supabase secrets set SELCOM_WEBHOOK_SECRET=$(openssl rand -hex 32)
supabase functions deploy --no-verify-jwt selcom-webhook
supabase functions deploy process-disbursement-batch generate-monthly-invoices send-invite-email \
  calculate-shift-payment send-whatsapp activate-account admin-create-user \
  notify-new-shift notify-new-application notify-application-decision notify-shift-cancelled
```

Then:

- **Database webhooks (notify-\*)**: in Dashboard → Database → Webhooks, give each one
  an `Authorization: Bearer <service_role key>` header.
- **Selcom callback URL**: `https://<project>.functions.supabase.co/selcom-webhook?secret=<SELCOM_WEBHOOK_SECRET>`.
  Swap this for Selcom's official signature check once you have their callback spec.
- **WhatsApp trigger**: `app.service_role_key` must be the same service role key.

## 3. Frontend (two small changes)

- `src/lib/api.js`: pro-rated dispute payouts now use the shift's real scheduled length.
  Before, 24-hour shifts were treated as 8 hours, which added about TZS 80k of false overtime.
- `src/pages/admin/Payments.jsx`: the "Platform Fee per Shift (TZS)" field is now
  "Platform Fee Rate" (`platform_fee_rate`, default 0.186). Keep it the same as
  `VITE_PLATFORM_FEE_RATE`, which drives the quote on Post Shift.

## 4. Settings to decide

- `require_verified_cos` (system_config, default `'false'`). Verify your COs in the admin
  portal, then set it to `'true'`. After that, unverified COs can't apply and can't be approved.
- Supabase Auth → set the minimum password length to 8 or more.
- If you ever ran `create_admin_user.sql` with `ChangeMe123!`, **change that password now**.

## 5. Behaviour changes users may notice

- Facilities can edit a shift only while it's open. Once a CO is selected, they can only
  cancel, and once the CO has checked in they can't cancel at all.
- COs must sign the ICA before applying. The app's apply gate already expected this, and
  now the database enforces it too.
- COs can't see other COs' email or phone. Facilities see contact details only for
  their own applicants and assigned COs, and for COs who opted in to Browse COs.
- Signing up with any role other than `co` or `facility` is refused.
- Invite tokens are stored hashed. Existing invite links keep working.

## Not covered here (next steps)

- Facility self-signup still gives immediate posting access. The Terms say accounts are reviewed first.
- The 30-minute early access for paid tiers isn't built.
- Applicants' phone and email are visible to the facility before approval. A "reveal
  contact on approval" function would close that.
- The rating screen says "Your feedback is anonymous" (MyApplications.jsx), but ratees
  can see who rated them.
- Loose SQL scripts should be turned into ordered migrations. There are also no
  automated tests besides these, and 44 ESLint errors.
