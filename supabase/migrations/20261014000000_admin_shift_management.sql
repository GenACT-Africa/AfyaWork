-- ═════════════════════════════════════════════════════════════════════════════
-- Admin shift & application management  (14 Oct 2026)
--
-- Admins could only read shifts and applications. These RPCs let them act,
-- with the same rules the app enforces for facilities, plus notifications to
-- everyone affected and an audit log (admin_shift_actions).
--
--   admin_create_shift          post a shift on a facility's behalf
--   admin_update_shift          edit date / type / pay / notes until check-in
--   admin_cancel_shift          cancel (reason required) until check-in
--   admin_unassign_co           remove the selected CO, shift back to open
--   admin_approve_application   select a CO (same 24h offer flow)
--   admin_set_application_status  reject / restore an application
--   admin_add_applicant         add a CO as an applicant
--
-- All are SECURITY DEFINER and refuse non-admins. Admins still have no direct
-- UPDATE/INSERT policy on shifts or applications.
-- ═════════════════════════════════════════════════════════════════════════════

-- 'admin' is a new cancelled_by value
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_cancelled_by_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_cancelled_by_check
  CHECK (cancelled_by IN ('facility', 'co', 'admin'));

-- ── Audit log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_shift_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id    uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  admin_id    uuid,                 -- no FK on purpose (keeps users(...) embeds unambiguous)
  action      text NOT NULL,        -- create | update | cancel | unassign | approve | reject | restore | add_applicant
  co_id       uuid,
  detail      jsonb,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_shift_actions_shift_idx ON public.admin_shift_actions (shift_id, created_at DESC);
ALTER TABLE public.admin_shift_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_shift_actions_admin_read ON public.admin_shift_actions;
CREATE POLICY admin_shift_actions_admin_read ON public.admin_shift_actions
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.admin_shift_actions FROM anon, authenticated;

-- ── Helpers (not callable from the API) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS void LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._log_shift_action(p_shift uuid, p_action text, p_co uuid, p_detail jsonb, p_note text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.admin_shift_actions (shift_id, admin_id, action, co_id, detail, note)
  VALUES (p_shift, auth.uid(), p_action, p_co, p_detail, nullif(btrim(coalesce(p_note, '')), ''));
$$;

CREATE OR REPLACE FUNCTION public._notify(p_user uuid, p_shift uuid, p_type text, p_title text, p_body text, p_url text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  SELECT p_user, p_shift, p_type, p_title, p_body, p_url WHERE p_user IS NOT NULL;
$$;

-- " Reason: …" suffix for notification bodies
CREATE OR REPLACE FUNCTION public._reason_suffix(p_note text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN '' ELSE ' Reason: ' || btrim(p_note) END $$;

REVOKE EXECUTE ON FUNCTION public._log_shift_action(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._notify(uuid, uuid, text, text, text, text)     FROM PUBLIC, anon, authenticated;

-- Statuses before the CO has started work
CREATE OR REPLACE FUNCTION public._shift_before_checkin(p_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$ SELECT p_status IN ('open', 'filled', 'confirmed', 'pending_checkin_approval') $$;

-- ── Cancellation notice: say who cancelled; tell the facility when it wasn't them
CREATE OR REPLACE FUNCTION public.notify_shift_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_by text := CASE NEW.cancelled_by WHEN 'admin' THEN 'AfyaWork' WHEN 'co' THEN 'the Clinical Officer' ELSE 'the facility' END;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  SELECT DISTINCT r.uid, NEW.id, 'shift_cancelled', 'Shift cancelled',
         'The ' || public._shift_label(NEW.shift_type, NEW.shift_date) || ' shift was cancelled by ' || v_by || '.'
           || CASE WHEN NEW.cancelled_by = 'admin' THEN public._reason_suffix(NEW.cancellation_reason) ELSE '' END,
         '/co/applications'
  FROM (
    SELECT OLD.assigned_co_id AS uid WHERE OLD.assigned_co_id IS NOT NULL
    UNION
    SELECT co_id FROM public.applications WHERE shift_id = NEW.id AND status IN ('pending', 'approved')
  ) r;
  IF NEW.cancelled_by = 'admin' THEN
    PERFORM public._notify(NEW.facility_id, NEW.id, 'shift_cancelled', 'Shift cancelled by AfyaWork',
      'Your ' || public._shift_label(NEW.shift_type, NEW.shift_date) || ' shift was cancelled by AfyaWork.'
        || public._reason_suffix(NEW.cancellation_reason),
      '/facility/shifts/' || NEW.id);
  END IF;
  RETURN NEW;
END $$;

-- ── Create ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_shift(
  p_facility_id uuid, p_shift_date date, p_shift_type text, p_pay_amount integer,
  p_description text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.facility_profiles WHERE user_id = p_facility_id) THEN
    RAISE EXCEPTION 'Facility not found' USING ERRCODE = '22023';
  END IF;
  IF p_shift_date < public._today_eat() THEN
    RAISE EXCEPTION 'Shift date must be today or later' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount, description, status)
  VALUES (p_facility_id, p_shift_date, p_shift_type, p_pay_amount, nullif(btrim(coalesce(p_description, '')), ''), 'open')
  RETURNING id INTO v_id;
  PERFORM public._log_shift_action(v_id, 'create', NULL,
    jsonb_build_object('shift_date', p_shift_date, 'shift_type', p_shift_type, 'pay_amount', p_pay_amount), p_note);
  PERFORM public._notify(p_facility_id, v_id, 'shift_posted_by_admin', 'AfyaWork posted a shift for you',
    public._shift_label(p_shift_type, p_shift_date) || ' · TZS ' || to_char(p_pay_amount, 'FM999,999,999')
      || '. You will get applicants here as usual.',
    '/facility/shifts/' || v_id);
  RETURN v_id;
END $$;

-- ── Edit (until the CO checks in) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_shift(
  p_shift_id uuid, p_shift_date date, p_shift_type text, p_pay_amount integer,
  p_description text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  v_changes jsonb := '{}'::jsonb;
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_msg text;
BEGIN
  PERFORM public._require_admin();
  SELECT * INTO s FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found' USING ERRCODE = '22023'; END IF;
  IF s.status NOT IN ('open', 'filled', 'confirmed') THEN
    RAISE EXCEPTION 'This shift can no longer be edited (status: %)', s.status USING ERRCODE = '22023';
  END IF;
  IF p_shift_date IS DISTINCT FROM s.shift_date AND p_shift_date < public._today_eat() THEN
    RAISE EXCEPTION 'Shift date must be today or later' USING ERRCODE = '22023';
  END IF;

  IF p_shift_date IS DISTINCT FROM s.shift_date THEN v_changes := v_changes || jsonb_build_object('shift_date', jsonb_build_array(s.shift_date, p_shift_date)); END IF;
  IF p_shift_type IS DISTINCT FROM s.shift_type THEN v_changes := v_changes || jsonb_build_object('shift_type', jsonb_build_array(s.shift_type, p_shift_type)); END IF;
  IF p_pay_amount IS DISTINCT FROM s.pay_amount THEN v_changes := v_changes || jsonb_build_object('pay_amount', jsonb_build_array(s.pay_amount, p_pay_amount)); END IF;
  IF v_desc IS DISTINCT FROM s.description THEN v_changes := v_changes || jsonb_build_object('description', jsonb_build_array(s.description, v_desc)); END IF;
  IF v_changes = '{}'::jsonb THEN RETURN; END IF;

  UPDATE public.shifts
     SET shift_date = p_shift_date, shift_type = p_shift_type, pay_amount = p_pay_amount,
         description = v_desc, updated_at = now()
   WHERE id = p_shift_id;

  PERFORM public._log_shift_action(p_shift_id, 'update', s.assigned_co_id, v_changes, p_note);

  v_msg := 'Now: ' || public._shift_label(p_shift_type, p_shift_date) || ' · TZS ' || to_char(p_pay_amount, 'FM999,999,999') || '.'
           || public._reason_suffix(p_note);
  PERFORM public._notify(s.facility_id, p_shift_id, 'shift_updated', 'AfyaWork updated your shift', v_msg,
                         '/facility/shifts/' || p_shift_id);
  -- the selected CO and everyone still waiting on an application
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  SELECT DISTINCT r.uid, p_shift_id, 'shift_updated', 'Shift details changed',
         v_msg || CASE WHEN r.uid = s.assigned_co_id THEN ' Contact AfyaWork if you can no longer take it.' ELSE '' END,
         '/co/applications'
  FROM (
    SELECT s.assigned_co_id AS uid WHERE s.assigned_co_id IS NOT NULL
    UNION
    SELECT co_id FROM public.applications WHERE shift_id = p_shift_id AND status = 'pending'
  ) r;
END $$;

-- ── Cancel (until check-in) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_cancel_shift(p_shift_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s RECORD;
BEGIN
  PERFORM public._require_admin();
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for cancelling' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found' USING ERRCODE = '22023'; END IF;
  IF NOT public._shift_before_checkin(s.status) THEN
    RAISE EXCEPTION 'Only shifts that have not started can be cancelled (status: %)', s.status USING ERRCODE = '22023';
  END IF;
  -- notify_shift_cancelled tells the CO(s) and the facility
  UPDATE public.shifts
     SET status = 'cancelled', cancelled_by = 'admin', cancellation_reason = btrim(p_reason), updated_at = now()
   WHERE id = p_shift_id;
  PERFORM public._log_shift_action(p_shift_id, 'cancel', s.assigned_co_id,
    jsonb_build_object('from_status', s.status), p_reason);
END $$;

-- ── Unassign the selected CO (until check-in) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_unassign_co(p_shift_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s RECORD;
BEGIN
  PERFORM public._require_admin();
  SELECT * INTO s FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found' USING ERRCODE = '22023'; END IF;
  IF s.assigned_co_id IS NULL OR s.status NOT IN ('filled', 'confirmed', 'pending_checkin_approval') THEN
    RAISE EXCEPTION 'No CO to remove before check-in (status: %)', s.status USING ERRCODE = '22023';
  END IF;
  IF s.shift_date < public._today_eat() THEN
    RAISE EXCEPTION 'This shift date has passed — cancel it instead' USING ERRCODE = '22023';
  END IF;

  UPDATE public.shifts
     SET status = 'open', assigned_co_id = NULL, offer_expires_at = NULL, offer_responded_at = NULL,
         checkin_at = NULL, checkin_lat = NULL, checkin_lng = NULL, updated_at = now()
   WHERE id = p_shift_id;
  UPDATE public.applications SET status = 'rejected'
   WHERE shift_id = p_shift_id AND co_id = s.assigned_co_id;
  -- give the other applicants another chance (same as when a CO declines)
  UPDATE public.applications SET status = 'pending'
   WHERE shift_id = p_shift_id AND co_id <> s.assigned_co_id AND status = 'rejected';

  PERFORM public._log_shift_action(p_shift_id, 'unassign', s.assigned_co_id,
    jsonb_build_object('from_status', s.status), p_reason);
  PERFORM public._notify(s.assigned_co_id, p_shift_id, 'removed_from_shift', 'Removed from shift',
    'AfyaWork removed you from the ' || public._shift_label(s.shift_type, s.shift_date) || ' shift.' || public._reason_suffix(p_reason),
    '/co/applications');
  PERFORM public._notify(s.facility_id, p_shift_id, 'co_unassigned', 'Your shift is open again',
    'AfyaWork removed the selected CO from ' || public._shift_label(s.shift_type, s.shift_date)
      || '. Select another applicant.' || public._reason_suffix(p_reason),
    '/facility/shifts/' || p_shift_id);
END $$;

-- ── Select a CO on the facility's behalf ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_application(p_application_id uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a RECORD; s RECORD; v_name text;
BEGIN
  PERFORM public._require_admin();
  SELECT id, shift_id, co_id, status INTO a FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM public.shifts WHERE id = a.shift_id FOR UPDATE;
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'The shift is not open (status: %). Remove the selected CO first.', s.status USING ERRCODE = '22023';
  END IF;
  IF s.shift_date < public._today_eat() THEN RAISE EXCEPTION 'This shift date has passed' USING ERRCODE = '22023'; END IF;
  IF a.status = 'approved' THEN RAISE EXCEPTION 'This application is already approved' USING ERRCODE = '22023'; END IF;
  IF public.get_config('require_verified_cos') = 'true' AND NOT EXISTS (
       SELECT 1 FROM public.co_profiles WHERE user_id = a.co_id AND verified) THEN
    RAISE EXCEPTION 'This CO has not been verified yet' USING ERRCODE = '22023';
  END IF;

  UPDATE public.applications SET status = 'approved' WHERE id = p_application_id;
  UPDATE public.applications SET status = 'rejected'
   WHERE shift_id = a.shift_id AND id <> p_application_id AND status = 'pending';
  UPDATE public.shifts
     SET status = 'filled', assigned_co_id = a.co_id, offer_expires_at = now() + interval '24 hours',
         offer_responded_at = NULL, updated_at = now()
   WHERE id = a.shift_id;

  SELECT display_name INTO v_name FROM public.users WHERE id = a.co_id;
  PERFORM public._log_shift_action(a.shift_id, 'approve', a.co_id, NULL, p_note);
  PERFORM public._notify(a.co_id, a.shift_id, 'shift_offer', 'You''ve been selected! 🎉',
    'You have been chosen for ' || public._shift_label(s.shift_type, s.shift_date)
      || '. Accept or decline the offer within 24 hours.',
    '/co/applications');
  PERFORM public._notify(s.facility_id, a.shift_id, 'co_selected_by_admin', 'AfyaWork selected a CO',
    coalesce(v_name, 'A Clinical Officer') || ' was offered your ' || public._shift_label(s.shift_type, s.shift_date)
      || ' shift. They have 24 hours to accept.',
    '/facility/shifts/' || a.shift_id);
END $$;

-- ── Reject / restore an application (shift must be open) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_set_application_status(p_application_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a RECORD; s RECORD;
BEGIN
  PERFORM public._require_admin();
  IF p_status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Use approve to select a CO' USING ERRCODE = '22023';
  END IF;
  SELECT id, shift_id, co_id, status INTO a FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM public.shifts WHERE id = a.shift_id FOR UPDATE;
  IF a.status = 'approved' THEN
    RAISE EXCEPTION 'This CO is the selected CO — use Remove CO instead' USING ERRCODE = '22023';
  END IF;
  IF a.status = p_status THEN RETURN; END IF;
  IF p_status = 'pending' AND s.status <> 'open' THEN
    RAISE EXCEPTION 'Applications can only be restored on an open shift' USING ERRCODE = '22023';
  END IF;

  UPDATE public.applications SET status = p_status WHERE id = p_application_id;
  PERFORM public._log_shift_action(a.shift_id, CASE p_status WHEN 'rejected' THEN 'reject' ELSE 'restore' END,
                                   a.co_id, NULL, p_note);
  IF p_status = 'rejected' THEN
    PERFORM public._notify(a.co_id, a.shift_id, 'application_rejected', 'Application not selected',
      'Your application for ' || public._shift_label(s.shift_type, s.shift_date) || ' was not selected.'
        || public._reason_suffix(p_note),
      '/co/applications');
  END IF;
END $$;

-- ── Add a CO as an applicant ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_applicant(p_shift_id uuid, p_co_id uuid, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s RECORD; c RECORD; v_id uuid; v_existing RECORD;
BEGIN
  PERFORM public._require_admin();
  SELECT * INTO s FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found' USING ERRCODE = '22023'; END IF;
  IF s.status <> 'open' THEN RAISE EXCEPTION 'Applicants can only be added to an open shift' USING ERRCODE = '22023'; END IF;
  IF s.shift_date < public._today_eat() THEN RAISE EXCEPTION 'This shift date has passed' USING ERRCODE = '22023'; END IF;
  SELECT cp.ica_signed_at, cp.verified INTO c FROM public.co_profiles cp WHERE cp.user_id = p_co_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinical Officer not found' USING ERRCODE = '22023'; END IF;
  IF c.ica_signed_at IS NULL THEN
    RAISE EXCEPTION 'This CO has not signed the Independent Contractor Agreement yet' USING ERRCODE = '22023';
  END IF;
  IF public.get_config('require_verified_cos') = 'true' AND NOT coalesce(c.verified, false) THEN
    RAISE EXCEPTION 'This CO has not been verified yet' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_existing FROM public.applications WHERE shift_id = p_shift_id AND co_id = p_co_id;
  IF FOUND THEN
    IF v_existing.status = 'pending' THEN RAISE EXCEPTION 'This CO has already applied' USING ERRCODE = '22023'; END IF;
    UPDATE public.applications SET status = 'pending' WHERE id = v_existing.id;   -- was rejected
    v_id := v_existing.id;
  ELSE
    -- notify_new_application tells the facility
    INSERT INTO public.applications (shift_id, co_id, status, applied_at)
    VALUES (p_shift_id, p_co_id, 'pending', now()) RETURNING id INTO v_id;
  END IF;

  PERFORM public._log_shift_action(p_shift_id, 'add_applicant', p_co_id, NULL, p_note);
  PERFORM public._notify(p_co_id, p_shift_id, 'added_as_applicant', 'AfyaWork added you to a shift',
    'You are now an applicant for ' || public._shift_label(s.shift_type, s.shift_date)
      || ' · TZS ' || to_char(s.pay_amount, 'FM999,999,999') || '. The facility will choose a CO.',
    '/co/applications');
  RETURN v_id;
END $$;

-- ── Permissions ─────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_create_shift(uuid, date, text, integer, text, text)',
    'public.admin_update_shift(uuid, date, text, integer, text, text)',
    'public.admin_cancel_shift(uuid, text)',
    'public.admin_unassign_co(uuid, text)',
    'public.admin_approve_application(uuid, text)',
    'public.admin_set_application_status(uuid, text, text)',
    'public.admin_add_applicant(uuid, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
