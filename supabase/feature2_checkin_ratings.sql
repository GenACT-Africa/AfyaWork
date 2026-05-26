-- ============================================================
-- AfyaWork Feature 2 — Shift Check-In / Check-Out & Ratings
-- Run in Supabase SQL Editor AFTER schema.sql is applied
-- ============================================================

-- ── 1. Expand shifts.status CHECK constraint ──────────────────────
-- Drop old constraint then re-add with the full status list.

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_status_check;

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_status_check
  CHECK (status IN (
    'open',
    'filled',                    -- facility selected a CO; offer pending CO acceptance
    'confirmed',                 -- CO accepted the offer
    'pending_checkin_approval',  -- CO checked in; awaiting facility confirmation
    'in_progress',               -- facility confirmed check-in; shift running
    'pending_checkout_approval', -- CO checked out; awaiting facility confirmation
    'completed',                 -- facility confirmed checkout; shift done
    'disputed_checkin',          -- facility disputed the CO check-in (admin review)
    'disputed_checkout',         -- facility disputed the CO checkout (admin review)
    'no_show',                   -- CO never showed up (admin-resolved dispute)
    'cancelled'
  ));

-- ── 2. New columns on public.shifts ──────────────────────────────

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS offer_expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_responded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS co_declined_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason    TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by           TEXT CHECK (cancelled_by IN ('facility', 'co')),
  ADD COLUMN IF NOT EXISTS checkin_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_lat            NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS checkin_lng            NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS checkin_approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_lat           NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS checkout_lng           NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS checkout_approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason         TEXT,
  ADD COLUMN IF NOT EXISTS dispute_raised_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by    UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reliability_flag       BOOLEAN DEFAULT FALSE;

-- ── 3. shift_ratings table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shift_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  rater_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ratee_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating_type     TEXT NOT NULL CHECK (rating_type IN ('co_rates_facility', 'facility_rates_co')),
  stars           INT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         TEXT,
  published_at    TIMESTAMPTZ DEFAULT NOW(),
  reported        BOOLEAN DEFAULT FALSE,
  hidden_by_admin BOOLEAN DEFAULT FALSE,
  UNIQUE (shift_id, rater_id)
);

ALTER TABLE public.shift_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own ratings" ON public.shift_ratings;
CREATE POLICY "Users see own ratings"
  ON public.shift_ratings FOR SELECT
  USING (auth.uid() = ratee_id OR auth.uid() = rater_id OR is_admin());

DROP POLICY IF EXISTS "Users submit ratings" ON public.shift_ratings;
CREATE POLICY "Users submit ratings"
  ON public.shift_ratings FOR INSERT
  WITH CHECK (auth.uid() = rater_id);

DROP POLICY IF EXISTS "Users update own ratings" ON public.shift_ratings;
CREATE POLICY "Users update own ratings"
  ON public.shift_ratings FOR UPDATE
  USING (auth.uid() = rater_id OR is_admin());

-- ── 4. notifications table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shift_id   UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  action_url TEXT,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- SECURITY DEFINER functions will insert; bypass RLS via function privilege
DROP POLICY IF EXISTS "Allow notification inserts" ON public.notifications;
CREATE POLICY "Allow notification inserts"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- ── 5. Update approve_application to set offer_expires_at & notify CO ──

CREATE OR REPLACE FUNCTION public.approve_application(application_id UUID)
RETURNS VOID AS $$
DECLARE
  v_shift_id UUID;
  v_co_id    UUID;
BEGIN
  SELECT shift_id, co_id INTO v_shift_id, v_co_id
  FROM public.applications
  WHERE id = application_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.shifts WHERE id = v_shift_id AND facility_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.shifts WHERE id = v_shift_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Shift is not open';
  END IF;

  UPDATE public.applications SET status = 'approved' WHERE id = application_id;
  UPDATE public.applications SET status = 'rejected'
    WHERE shift_id = v_shift_id AND id != application_id;

  UPDATE public.shifts
  SET status           = 'filled',
      assigned_co_id   = v_co_id,
      offer_expires_at = now() + interval '24 hours'
  WHERE id = v_shift_id;

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_co_id, v_shift_id, 'shift_offer',
    'You''ve been selected! 🎉',
    'A facility has chosen you for a shift. Accept or decline the offer within 24 hours.',
    '/co/applications'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. accept_shift_offer ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_shift_offer(p_shift_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.assigned_co_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not the assigned CO for this shift';
  END IF;
  IF v_shift.status != 'filled' THEN
    RAISE EXCEPTION 'No pending offer to accept';
  END IF;

  UPDATE public.shifts
  SET status = 'confirmed', offer_responded_at = now()
  WHERE id = p_shift_id;

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.facility_id, p_shift_id, 'offer_accepted',
    'Shift offer accepted',
    'A Clinical Officer has accepted your shift offer and confirmed attendance.',
    '/facility/shifts/' || p_shift_id
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.accept_shift_offer(UUID) TO authenticated;

-- ── 7. decline_shift_offer ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decline_shift_offer(p_shift_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.assigned_co_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not the assigned CO for this shift';
  END IF;
  IF v_shift.status != 'filled' THEN
    RAISE EXCEPTION 'No pending offer to decline';
  END IF;

  UPDATE public.shifts
  SET status             = 'open',
      assigned_co_id     = NULL,
      co_declined_at     = now(),
      cancellation_reason = p_reason
  WHERE id = p_shift_id;

  UPDATE public.applications SET status = 'rejected'
    WHERE shift_id = p_shift_id AND co_id = auth.uid();

  -- Let other rejected applicants be re-considered
  UPDATE public.applications SET status = 'pending'
    WHERE shift_id = p_shift_id AND co_id != auth.uid() AND status = 'rejected';

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.facility_id, p_shift_id, 'offer_declined',
    'Shift offer declined',
    'A Clinical Officer declined your offer. The shift is open — select a new applicant.',
    '/facility/shifts/' || p_shift_id
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.decline_shift_offer(UUID, TEXT) TO authenticated;

-- ── 8. co_checkin ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.co_checkin(
  p_shift_id UUID,
  p_lat      NUMERIC DEFAULT NULL,
  p_lng      NUMERIC DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.assigned_co_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'confirmed' THEN
    RAISE EXCEPTION 'Shift must be confirmed before checking in';
  END IF;

  UPDATE public.shifts
  SET status      = 'pending_checkin_approval',
      checkin_at  = now(),
      checkin_lat = p_lat,
      checkin_lng = p_lng
  WHERE id = p_shift_id;

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.facility_id, p_shift_id, 'co_checked_in',
    'CO has checked in',
    'A Clinical Officer has checked in and is waiting for your confirmation.',
    '/facility/shifts/' || p_shift_id
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.co_checkin(UUID, NUMERIC, NUMERIC) TO authenticated;

-- ── 9. approve_checkin ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_checkin(p_shift_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.facility_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'pending_checkin_approval' THEN
    RAISE EXCEPTION 'No check-in pending approval';
  END IF;

  UPDATE public.shifts
  SET status = 'in_progress', checkin_approved_at = now()
  WHERE id = p_shift_id;

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.assigned_co_id, p_shift_id, 'checkin_approved',
    'Check-in approved ✓',
    'Your check-in has been confirmed. Your shift is now in progress.',
    '/co/applications'
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.approve_checkin(UUID) TO authenticated;

-- ── 10. dispute_checkin ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dispute_checkin(p_shift_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.facility_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'pending_checkin_approval' THEN
    RAISE EXCEPTION 'No check-in to dispute';
  END IF;

  UPDATE public.shifts
  SET status            = 'disputed_checkin',
      dispute_reason    = p_reason,
      dispute_raised_at = now()
  WHERE id = p_shift_id;
END;$$;

GRANT EXECUTE ON FUNCTION public.dispute_checkin(UUID, TEXT) TO authenticated;

-- ── 11. co_checkout ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.co_checkout(
  p_shift_id UUID,
  p_lat      NUMERIC DEFAULT NULL,
  p_lng      NUMERIC DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.assigned_co_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'in_progress' THEN
    RAISE EXCEPTION 'Shift must be in progress to check out';
  END IF;

  UPDATE public.shifts
  SET status       = 'pending_checkout_approval',
      checkout_at  = now(),
      checkout_lat = p_lat,
      checkout_lng = p_lng
  WHERE id = p_shift_id;

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (
    v_shift.facility_id, p_shift_id, 'co_checked_out',
    'CO has checked out',
    'A Clinical Officer has checked out. Please confirm to mark the shift complete.',
    '/facility/shifts/' || p_shift_id
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.co_checkout(UUID, NUMERIC, NUMERIC) TO authenticated;

-- ── 12. approve_checkout ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_checkout(p_shift_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.facility_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'pending_checkout_approval' THEN
    RAISE EXCEPTION 'No checkout pending approval';
  END IF;

  UPDATE public.shifts
  SET status = 'completed', checkout_approved_at = now()
  WHERE id = p_shift_id;

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

-- ── 13. dispute_checkout ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dispute_checkout(p_shift_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.facility_id != auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status != 'pending_checkout_approval' THEN
    RAISE EXCEPTION 'No checkout to dispute';
  END IF;

  UPDATE public.shifts
  SET status            = 'disputed_checkout',
      dispute_reason    = p_reason,
      dispute_raised_at = now()
  WHERE id = p_shift_id;
END;$$;

GRANT EXECUTE ON FUNCTION public.dispute_checkout(UUID, TEXT) TO authenticated;

-- ── 14. submit_rating ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_rating(
  p_shift_id UUID,
  p_ratee_id UUID,
  p_stars    INT,
  p_comment  TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_shift RECORD;
  v_type  TEXT;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.status != 'completed' THEN
    RAISE EXCEPTION 'Shift must be completed before rating';
  END IF;
  IF p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'Stars must be between 1 and 5';
  END IF;

  IF auth.uid() = v_shift.assigned_co_id AND p_ratee_id = v_shift.facility_id THEN
    v_type := 'co_rates_facility';
  ELSIF auth.uid() = v_shift.facility_id AND p_ratee_id = v_shift.assigned_co_id THEN
    v_type := 'facility_rates_co';
  ELSE
    RAISE EXCEPTION 'Invalid rater or ratee for this shift';
  END IF;

  INSERT INTO public.shift_ratings (shift_id, rater_id, ratee_id, rating_type, stars, comment)
  VALUES (p_shift_id, auth.uid(), p_ratee_id, v_type, p_stars, p_comment)
  ON CONFLICT (shift_id, rater_id) DO UPDATE
    SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, published_at = now();
END;$$;

GRANT EXECUTE ON FUNCTION public.submit_rating(UUID, UUID, INT, TEXT) TO authenticated;

-- ── 15. resolve_dispute (admin only) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_shift_id   UUID,
  p_resolution TEXT,   -- 'approve' | 'reject'
  p_note       TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_shift RECORD;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.status NOT IN ('disputed_checkin', 'disputed_checkout') THEN
    RAISE EXCEPTION 'Shift is not in a disputed state';
  END IF;

  IF p_resolution = 'approve' THEN
    IF v_shift.status = 'disputed_checkin' THEN
      UPDATE public.shifts SET status = 'in_progress', checkin_approved_at = now() WHERE id = p_shift_id;
      INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
      VALUES (v_shift.assigned_co_id, p_shift_id, 'dispute_resolved',
        'Dispute resolved — Check-in approved',
        'An admin reviewed the dispute and approved your check-in.',
        '/co/applications');
    ELSE
      UPDATE public.shifts SET status = 'completed', checkout_approved_at = now() WHERE id = p_shift_id;
      INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
      VALUES (v_shift.assigned_co_id, p_shift_id, 'dispute_resolved',
        'Dispute resolved — Shift completed',
        'An admin reviewed the dispute and your shift is now complete.',
        '/co/applications');
    END IF;
  ELSE
    IF v_shift.status = 'disputed_checkin' THEN
      UPDATE public.shifts SET status = 'no_show', reliability_flag = true WHERE id = p_shift_id;
      INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
      VALUES (v_shift.assigned_co_id, p_shift_id, 'dispute_resolved',
        'Dispute resolved — No-show recorded',
        'An admin reviewed the dispute and recorded a no-show on your account.',
        '/co/applications');
    ELSE
      UPDATE public.shifts SET status = 'completed', reliability_flag = true WHERE id = p_shift_id;
    END IF;
  END IF;

  UPDATE public.shifts
  SET dispute_resolved_at = now(),
      dispute_resolved_by = auth.uid()
  WHERE id = p_shift_id;
END;$$;

GRANT EXECUTE ON FUNCTION public.resolve_dispute(UUID, TEXT, TEXT) TO authenticated;
