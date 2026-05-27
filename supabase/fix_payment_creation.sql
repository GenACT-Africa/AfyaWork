-- ─────────────────────────────────────────────────────────────────────────────
-- AfyaWork — Fix: payment record creation on checkout approval
--
-- Problem: shift_payments has no INSERT RLS policy, so browser-side inserts
--          are silently blocked. The fallback in api.js also misses the NOT NULL
--          column `scheduled_shift_duration_minutes`.
--
-- Fix: embed a basic payment record INSERT into the approve_checkout()
--      SECURITY DEFINER function so it always succeeds regardless of RLS.
--      The calculate-shift-payment edge function then UPSERTs on top of this
--      with the full overtime/fee calculation.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_checkout(p_shift_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_shift  RECORD;
  v_mm     RECORD;
  v_sched_minutes INTEGER;
BEGIN
  -- ── Validate ──────────────────────────────────────────────────────
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.facility_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'pending_checkout_approval' THEN
    RAISE EXCEPTION 'No checkout pending approval';
  END IF;

  -- ── Mark shift completed ──────────────────────────────────────────
  UPDATE public.shifts
  SET status = 'completed', checkout_approved_at = now()
  WHERE id = p_shift_id;

  -- ── Create basic payment record ───────────────────────────────────
  -- SECURITY DEFINER bypasses RLS so this always works.
  -- The calculate-shift-payment edge function will UPSERT over this
  -- with the full calculation (overtime, config rates, etc.).

  -- Scheduled duration by shift type
  v_sched_minutes := CASE v_shift.shift_type
    WHEN 'Day (8AM-4PM)'    THEN 480
    WHEN 'Evening (4PM-10PM)' THEN 360
    WHEN 'Night (10PM-6AM)' THEN 480
    WHEN '24-Hour'          THEN 1440
    WHEN 'Weekend'          THEN 480
    ELSE 480
  END;

  -- Fetch CO's mobile money details (NULL if not configured)
  SELECT mobile_money_provider, mobile_money_number
  INTO v_mm
  FROM public.co_mobile_money
  WHERE co_id = v_shift.assigned_co_id
  LIMIT 1;

  INSERT INTO public.shift_payments (
    shift_id,
    co_id,
    facility_id,
    flat_shift_rate,
    scheduled_shift_duration_minutes,
    co_total_pay,
    adjusted_pay_amount,
    overtime_pay,
    overtime_minutes,
    overtime_rate_applied,
    platform_fee,
    facility_total_charge,
    tax_withheld_amount,
    mobile_money_provider,
    mobile_money_number,
    payment_status,
    scheduled_at
  ) VALUES (
    p_shift_id,
    v_shift.assigned_co_id,
    v_shift.facility_id,
    v_shift.pay_amount,           -- flat rate
    v_sched_minutes,
    v_shift.pay_amount,           -- edge fn will update with overtime if any
    v_shift.pay_amount,
    0,                            -- overtime_pay — edge fn recalculates
    0,                            -- overtime_minutes
    0,                            -- overtime_rate_applied
    0,                            -- platform_fee — edge fn reads from config
    v_shift.pay_amount,           -- facility_total_charge (basic: = co pay, no fee yet)
    0,
    v_mm.mobile_money_provider,   -- NULL-safe: SELECT INTO gives NULL row when not found
    v_mm.mobile_money_number,
    'pending',                    -- admin must approve to 'scheduled'
    NULL                          -- scheduled_at set by admin on approval
  )
  ON CONFLICT (shift_id) DO NOTHING;  -- idempotent: edge fn may have run first

  -- ── Notifications ─────────────────────────────────────────────────
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.assigned_co_id, p_shift_id, 'checkout_approved',
    'Shift completed! 🎉',
    'The facility confirmed your checkout. Please take a moment to rate your experience.',
    '/co/applications'
  );

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.facility_id, p_shift_id, 'rate_co',
    'Rate this Clinical Officer',
    'The shift is complete. Share feedback for the CO.',
    '/facility/shifts/' || p_shift_id
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.approve_checkout(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin RLS policies for shift_payments
--
-- The existing policies only cover SELECT for CO and facility.
-- Without these, adminApprovePayment / adminMarkPaymentPaid silently affect
-- 0 rows — no error, but the status never changes.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admin full access to payments" ON public.shift_payments;
CREATE POLICY "Admin full access to payments"
  ON public.shift_payments
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
