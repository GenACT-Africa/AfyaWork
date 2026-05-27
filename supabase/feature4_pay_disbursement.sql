-- ============================================================
-- AfyaWork Feature 4 — Pay Calculation & Disbursement
-- Run in Supabase SQL Editor AFTER all prior migrations
-- ============================================================

-- ── Helper: is_admin() if not already defined ─────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────
-- 1. SYSTEM CONFIGURATION
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage system config" ON public.system_config;
CREATE POLICY "Admin can manage system config"
  ON public.system_config FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role reads system config" ON public.system_config;
CREATE POLICY "Service role reads system config"
  ON public.system_config FOR SELECT
  USING (auth.role() = 'service_role');

-- Seed default configuration values (ON CONFLICT DO NOTHING = safe to re-run)
INSERT INTO public.system_config (key, value) VALUES
  ('platform_overtime_hourly_rate',  '5000'),   -- TZS 5,000 per overtime hour
  ('platform_fee_per_shift',         '2000'),   -- TZS 2,000 platform fee per shift
  ('daily_disbursement_cutoff_eat',  '20:00'),  -- 8:00pm EAT daily cutoff
  ('payment_due_day',                '15'),     -- facilities must pay by 15th
  ('overdue_escalation_day',         '20'),     -- escalation if unpaid by 20th
  ('selcom_environment',             'sandbox'),
  ('selcom_status',                  'active'),
  ('mpesa_till_number',              ''),
  ('mixx_by_yas_till_number',        ''),
  ('airtel_money_till_number',       ''),
  ('halopesa_till_number',           ''),
  ('bank_name',                      ''),
  ('bank_account_number',            ''),
  ('bank_account_name',              ''),
  ('invoice_admin_name',             'AfyaWork Admin'),
  ('invoice_admin_whatsapp',         '')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. CO MOBILE MONEY PROFILE
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.co_mobile_money (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  co_id                          UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  mobile_money_provider          TEXT        NOT NULL
    CHECK (mobile_money_provider IN ('mpesa', 'mixx_by_yas', 'airtel_money', 'halopesa')),
  mobile_money_number            TEXT        NOT NULL,
  account_name                   TEXT,
  number_verified                BOOLEAN     DEFAULT FALSE,
  provider_mismatch_warning_shown BOOLEAN    DEFAULT FALSE,
  created_at                     TIMESTAMPTZ DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.co_mobile_money ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CO reads own mobile money" ON public.co_mobile_money;
CREATE POLICY "CO reads own mobile money"
  ON public.co_mobile_money FOR SELECT
  USING (auth.uid() = co_id OR public.is_admin());

DROP POLICY IF EXISTS "CO inserts own mobile money" ON public.co_mobile_money;
CREATE POLICY "CO inserts own mobile money"
  ON public.co_mobile_money FOR INSERT
  WITH CHECK (auth.uid() = co_id);

DROP POLICY IF EXISTS "CO updates own mobile money" ON public.co_mobile_money;
CREATE POLICY "CO updates own mobile money"
  ON public.co_mobile_money FOR UPDATE
  USING (auth.uid() = co_id OR public.is_admin());

CREATE TRIGGER set_co_mobile_money_updated_at
  BEFORE UPDATE ON public.co_mobile_money
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 3. DISBURSEMENT BATCHES
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.disbursement_batches (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_date               DATE        NOT NULL,
  cutoff_time              TIMESTAMPTZ,
  processing_started_at    TIMESTAMPTZ,
  processing_completed_at  TIMESTAMPTZ,
  total_cos_paid           INTEGER     DEFAULT 0,
  total_shifts_covered     INTEGER     DEFAULT 0,
  total_amount_disbursed   BIGINT      DEFAULT 0,
  total_failed_transfers   INTEGER     DEFAULT 0,
  total_processing         INTEGER     DEFAULT 0,
  selcom_batch_reference   TEXT,
  transfers_by_provider    JSONB       DEFAULT '{}',
  batch_status             TEXT        NOT NULL DEFAULT 'processing'
    CHECK (batch_status IN ('processing', 'completed', 'partial_failure')),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.disbursement_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages disbursement batches" ON public.disbursement_batches;
CREATE POLICY "Admin manages disbursement batches"
  ON public.disbursement_batches FOR ALL
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 4. SHIFT PAYMENTS
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shift_payments (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                      UUID        NOT NULL UNIQUE REFERENCES public.shifts(id) ON DELETE CASCADE,
  co_id                         UUID        NOT NULL REFERENCES public.users(id),
  facility_id                   UUID        NOT NULL REFERENCES public.users(id),

  -- Pay calculation
  flat_shift_rate               BIGINT      NOT NULL,          -- TZS
  scheduled_shift_duration_minutes INTEGER  NOT NULL,
  approved_hours_worked_minutes INTEGER,
  overtime_minutes              INTEGER     NOT NULL DEFAULT 0,
  overtime_rate_applied         BIGINT      NOT NULL DEFAULT 0, -- TZS/hr at time of calculation
  overtime_pay                  BIGINT      NOT NULL DEFAULT 0, -- TZS
  co_total_pay                  BIGINT      NOT NULL,           -- TZS
  platform_fee                  BIGINT      NOT NULL DEFAULT 0, -- TZS
  facility_total_charge         BIGINT      NOT NULL,           -- TZS
  tax_withheld_amount           BIGINT      NOT NULL DEFAULT 0, -- v1 always 0

  -- Status
  payment_status                TEXT        NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN (
      'pending', 'held', 'released', 'scheduled',
      'processing', 'disbursed', 'failed', 'cancelled'
    )),
  hold_reason                   TEXT,
  dispute_resolution_adjustment BOOLEAN     DEFAULT FALSE,
  adjusted_pay_amount           BIGINT,                         -- nullable override

  -- Mobile money snapshot (captured at scheduling time)
  mobile_money_provider         TEXT
    CHECK (mobile_money_provider IN ('mpesa', 'mixx_by_yas', 'airtel_money', 'halopesa')),
  mobile_money_number           TEXT,

  -- Selcom integration
  disbursement_batch_id         UUID        REFERENCES public.disbursement_batches(id),
  selcom_transaction_ref        TEXT,
  selcom_response_code          TEXT,
  selcom_response_description   TEXT,
  selcom_raw_response           JSONB,
  selcom_webhook_received_at    TIMESTAMPTZ,

  -- Audit trail
  disbursed_at                  TIMESTAMPTZ,
  failure_reason                TEXT,
  failure_logged_at             TIMESTAMPTZ,
  retry_count                   INTEGER     NOT NULL DEFAULT 0,
  last_retry_at                 TIMESTAMPTZ,
  scheduled_at                  TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shift_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CO sees own payments" ON public.shift_payments;
CREATE POLICY "CO sees own payments"
  ON public.shift_payments FOR SELECT
  USING (auth.uid() = co_id OR public.is_admin());

DROP POLICY IF EXISTS "Facility sees payments on own shifts" ON public.shift_payments;
CREATE POLICY "Facility sees payments on own shifts"
  ON public.shift_payments FOR SELECT
  USING (auth.uid() = facility_id OR public.is_admin());

CREATE TRIGGER set_shift_payments_updated_at
  BEFORE UPDATE ON public.shift_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_shift_payments_co_id        ON public.shift_payments(co_id);
CREATE INDEX IF NOT EXISTS idx_shift_payments_facility_id  ON public.shift_payments(facility_id);
CREATE INDEX IF NOT EXISTS idx_shift_payments_status       ON public.shift_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_shift_payments_batch_id     ON public.shift_payments(disbursement_batch_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. FACILITY INVOICES
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_invoices (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number          TEXT        NOT NULL UNIQUE,  -- AFW-YYYY-MM-FACILITYID
  facility_id             UUID        NOT NULL REFERENCES public.users(id),
  invoice_period_start    TIMESTAMPTZ NOT NULL,
  invoice_period_end      TIMESTAMPTZ NOT NULL,
  total_shifts            INTEGER     NOT NULL DEFAULT 0,
  total_co_pay            BIGINT      NOT NULL DEFAULT 0,  -- TZS
  total_overtime_pay      BIGINT      NOT NULL DEFAULT 0,  -- TZS
  total_platform_fees     BIGINT      NOT NULL DEFAULT 0,  -- TZS
  grand_total             BIGINT      NOT NULL DEFAULT 0,  -- TZS
  invoice_status          TEXT        NOT NULL DEFAULT 'draft'
    CHECK (invoice_status IN ('draft', 'sent', 'paid', 'overdue')),
  sent_at                 TIMESTAMPTZ,
  due_date                DATE,
  paid_at                 TIMESTAMPTZ,
  payment_method          TEXT
    CHECK (payment_method IN ('mpesa', 'mixx_by_yas', 'airtel_money', 'halopesa', 'bank_transfer', 'cash')),
  payment_reference       TEXT,
  amount_received         BIGINT,                          -- TZS
  marked_paid_by          UUID        REFERENCES public.users(id),
  overdue_reminder_sent_at TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.facility_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Facility sees own invoices" ON public.facility_invoices;
CREATE POLICY "Facility sees own invoices"
  ON public.facility_invoices FOR SELECT
  USING (auth.uid() = facility_id OR public.is_admin());

DROP POLICY IF EXISTS "Admin manages invoices" ON public.facility_invoices;
CREATE POLICY "Admin manages invoices"
  ON public.facility_invoices FOR ALL
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_facility_invoices_facility_id ON public.facility_invoices(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_invoices_status      ON public.facility_invoices(invoice_status);

-- ─────────────────────────────────────────────────────────────────
-- 6. FACILITY INVOICE LINE ITEMS
-- Per-shift breakdown stored against each invoice
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_invoice_line_items (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID    NOT NULL REFERENCES public.facility_invoices(id) ON DELETE CASCADE,
  shift_id         UUID    NOT NULL REFERENCES public.shifts(id),
  shift_date       DATE    NOT NULL,
  shift_type       TEXT    NOT NULL,
  co_name          TEXT    NOT NULL,
  scheduled_hours  NUMERIC(5,2) NOT NULL,
  approved_hours   NUMERIC(5,2),
  flat_rate        BIGINT  NOT NULL,
  overtime_pay     BIGINT  NOT NULL DEFAULT 0,
  platform_fee     BIGINT  NOT NULL DEFAULT 0,
  line_total       BIGINT  NOT NULL
);

ALTER TABLE public.facility_invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Facility sees own invoice lines" ON public.facility_invoice_line_items;
CREATE POLICY "Facility sees own invoice lines"
  ON public.facility_invoice_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_invoices fi
      WHERE fi.id = invoice_id
        AND (fi.facility_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Admin manages invoice lines" ON public.facility_invoice_line_items;
CREATE POLICY "Admin manages invoice lines"
  ON public.facility_invoice_line_items FOR ALL
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 7. RPC HELPERS FOR PAYMENT MANAGEMENT
-- ─────────────────────────────────────────────────────────────────

-- Hold a shift payment (called when dispute is raised)
CREATE OR REPLACE FUNCTION public.hold_shift_payment(p_shift_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE public.shift_payments
  SET
    payment_status = 'held',
    hold_reason    = COALESCE(p_reason, hold_reason),
    updated_at     = NOW()
  WHERE shift_id = p_shift_id
    AND payment_status IN ('pending', 'scheduled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Release a held payment back to scheduled (admin resolves dispute → pay approved)
CREATE OR REPLACE FUNCTION public.release_shift_payment(
  p_shift_id           UUID,
  p_adjusted_amount    BIGINT DEFAULT NULL,
  p_is_adjustment      BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.shift_payments
  SET
    payment_status                = 'scheduled',
    hold_reason                   = NULL,
    dispute_resolution_adjustment = p_is_adjustment,
    adjusted_pay_amount           = p_adjusted_amount,
    co_total_pay                  = COALESCE(p_adjusted_amount, co_total_pay),
    scheduled_at                  = NOW(),
    updated_at                    = NOW()
  WHERE shift_id = p_shift_id
    AND payment_status IN ('held', 'released', 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel a shift payment (no-show or CO fault)
CREATE OR REPLACE FUNCTION public.cancel_shift_payment(p_shift_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.shift_payments
  SET
    payment_status = 'cancelled',
    hold_reason    = NULL,
    updated_at     = NOW()
  WHERE shift_id = p_shift_id
    AND payment_status NOT IN ('disbursed', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get system config value by key
CREATE OR REPLACE FUNCTION public.get_config(p_key TEXT)
RETURNS TEXT AS $$
  SELECT value FROM public.system_config WHERE key = p_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────
-- 8. ADMIN PAYMENT STATS VIEW
-- Used by the admin payments dashboard
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.admin_payment_stats AS
SELECT
  COUNT(*) FILTER (WHERE payment_status = 'pending')    AS pending_count,
  COUNT(*) FILTER (WHERE payment_status = 'scheduled')  AS scheduled_count,
  COUNT(*) FILTER (WHERE payment_status = 'processing') AS processing_count,
  COUNT(*) FILTER (WHERE payment_status = 'disbursed')  AS disbursed_count,
  COUNT(*) FILTER (WHERE payment_status = 'failed')     AS failed_count,
  COUNT(*) FILTER (WHERE payment_status = 'held')       AS held_count,
  COUNT(*) FILTER (WHERE payment_status = 'cancelled')  AS cancelled_count,

  COALESCE(SUM(co_total_pay) FILTER (WHERE payment_status = 'disbursed'), 0) AS total_disbursed,
  COALESCE(SUM(co_total_pay) FILTER (WHERE payment_status = 'scheduled'), 0) AS upcoming_total,
  COALESCE(SUM(co_total_pay) FILTER (WHERE payment_status = 'held'),      0) AS held_total,
  COALESCE(SUM(co_total_pay) FILTER (WHERE payment_status = 'failed'),    0) AS failed_total,

  -- This month's disbursements
  COALESCE(SUM(co_total_pay) FILTER (
    WHERE payment_status = 'disbursed'
      AND disbursed_at >= date_trunc('month', NOW())
  ), 0) AS disbursed_this_month,

  COUNT(*) FILTER (
    WHERE payment_status = 'disbursed'
      AND disbursed_at >= date_trunc('month', NOW())
  ) AS disbursed_this_month_count

FROM public.shift_payments;

-- ─────────────────────────────────────────────────────────────────
-- 9. EXTEND resolve_dispute TO HANDLE PAYMENT STATE
-- ─────────────────────────────────────────────────────────────────
-- The existing resolve_dispute RPC transitions shift status.
-- We now also update the payment record based on resolution.
-- resolution values: 'completed' | 'no_show' | 'pro_rated:MINUTES' | 'cancellation_fee_co' | 'cancellation_fee_facility'

-- Note: payment resolution is handled in the Edge Function
-- `resolve-dispute-payment` called from api.js after resolve_dispute RPC.

-- ─────────────────────────────────────────────────────────────────
-- 10. pg_cron NOTES (run manually after verifying credentials)
-- ─────────────────────────────────────────────────────────────────
-- To schedule the nightly disbursement (9pm EAT = 18:00 UTC):
--
--   SELECT cron.schedule(
--     'nightly-disbursement',
--     '0 18 * * *',
--     $$ SELECT net.http_post(
--       url     := current_setting('app.supabase_url') || '/functions/v1/process-disbursement-batch',
--       headers := json_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))::jsonb,
--       body    := '{}'::jsonb
--     ); $$
--   );
--
-- To schedule monthly invoice generation (1st of month, 08:00 EAT = 05:00 UTC):
--
--   SELECT cron.schedule(
--     'monthly-invoices',
--     '0 5 1 * *',
--     $$ SELECT net.http_post(
--       url     := current_setting('app.supabase_url') || '/functions/v1/generate-monthly-invoices',
--       headers := json_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))::jsonb,
--       body    := '{}'::jsonb
--     ); $$
--   );
