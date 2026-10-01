-- ============================================================================
-- AfyaWork — Security hardening migration
-- 2026-09-27
--
-- Run AFTER all existing scripts in supabase/*.sql. Test on a STAGING copy of
-- the database first (Supabase Dashboard → SQL Editor, or `supabase db push`).
-- The whole file runs in one transaction: if anything fails, nothing changes.
--
-- What this fixes
--   1. Privilege escalation to admin (self-update of users.role; role=admin at signup)
--   2. Invite-token takeover (tokens now stored as SHA-256 hashes)
--   3. Self-editing of protected fields (verified, subscription tier/plan,
--      shift lifecycle fields, application status, mobile-money verification)
--   4. Payment functions callable by anyone (hold/release/cancel_shift_payment)
--   5. Open notification inserts (spoofed notifications + WhatsApp spam)
--   6. Direct rating inserts/edits bypassing submit_rating()
--   7. Everyone's email/phone and everyone's shift GPS data readable by all users
--   8. Platform fee: invoices now use platform_fee_rate (18.6% by default),
--      matching the Post Shift quote and the Facility Terms
--   9. Overtime measured from actual check-in/out, not approval timestamps
--  10. Disputed-then-approved checkouts never created a payment record
--  11. Double disbursement if the batch runs twice at once (claim function)
--  12. Missing search_path on SECURITY DEFINER functions
--
-- Two settings are added to system_config:
--   platform_fee_rate    = '0.186'   (fraction of CO pay; keep VITE_PLATFORM_FEE_RATE in sync)
--   require_verified_cos = 'false'   (set to 'true' once you have verified your COs —
--                                     unverified COs then cannot apply or be approved)
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- True when the current statement comes straight from an end user via the API
-- (PostgREST switches to the 'authenticated' / 'anon' role). Inside SECURITY
-- DEFINER functions current_user is the function owner, so this is false there,
-- which is exactly what lets our vetted RPCs change protected columns.
CREATE OR REPLACE FUNCTION public._is_end_user_request()
RETURNS boolean LANGUAGE sql STABLE
SET search_path = public
AS $$ SELECT current_user IN ('authenticated', 'anon') $$;

-- True for the service role (edge functions, cron) or a direct DB session
-- (SQL editor / migrations). Used inside SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public._caller_is_trusted()
RETURNS boolean LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR session_user IN ('postgres', 'supabase_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM public.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.get_config(p_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT value FROM public.system_config WHERE key = p_key $$;

-- Today's date in Tanzania (EAT, UTC+3)
CREATE OR REPLACE FUNCTION public._today_eat()
RETURNS date LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date $$;

-- Raise if any column outside p_allowed differs between two row images
CREATE OR REPLACE FUNCTION public._assert_only_changed(p_old jsonb, p_new jsonb, p_allowed text[], p_msg text)
RETURNS void LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF (p_new - p_allowed) IS DISTINCT FROM (p_old - p_allowed) THEN
    RAISE EXCEPTION '%', p_msg USING ERRCODE = '42501';
  END IF;
END $$;

INSERT INTO public.system_config (key, value) VALUES
  ('platform_fee_rate',    '0.186'),
  ('require_verified_cos', 'false')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Signup: never trust the role sent by the browser
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := NEW.raw_user_meta_data->>'role';
BEGIN
  -- 'admin' is only honoured for rows inserted from a direct DB session
  -- (e.g. create_admin_user.sql in the SQL editor), never from a signup.
  IF v_role = 'admin' AND session_user IN ('postgres', 'supabase_admin') THEN
    INSERT INTO public.users (id, role, display_name, email)
    VALUES (NEW.id, 'admin', coalesce(NEW.raw_user_meta_data->>'display_name', 'Admin'), NEW.email);
    RETURN NEW;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('co', 'facility') THEN
    RAISE EXCEPTION 'Invalid account role' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.users (id, role, display_name, email)
  VALUES (NEW.id, v_role, NEW.raw_user_meta_data->>'display_name', NEW.email);

  IF v_role = 'co' THEN
    INSERT INTO public.co_profiles (user_id, license_number, specialization)
    VALUES (NEW.id,
            NEW.raw_user_meta_data->>'license_number',
            NEW.raw_user_meta_data->>'specialization');
  ELSE
    INSERT INTO public.facility_profiles (user_id, facility_name, facility_type, address)
    VALUES (NEW.id,
            NEW.raw_user_meta_data->>'facility_name',
            NEW.raw_user_meta_data->>'facility_type',
            NEW.raw_user_meta_data->>'address');
  END IF;
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. users: protected columns, hashed invite tokens, scoped reads
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hash_invite_token(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT 'sha256:' || encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- Hash any plaintext token on write (covers admin-create-user edge fn and the
-- admin_create_* / admin_resend_invite SQL functions without changing them;
-- they still return the plaintext token to the admin for the invite link).
CREATE OR REPLACE FUNCTION public.users_hash_invite_token()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_token IS NOT NULL AND NEW.invite_token NOT LIKE 'sha256:%' THEN
    NEW.invite_token := public.hash_invite_token(NEW.invite_token);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_hash_invite_token ON public.users;
CREATE TRIGGER users_hash_invite_token
  BEFORE INSERT OR UPDATE OF invite_token ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_hash_invite_token();

-- Existing pending invites keep working: hash what is stored now.
UPDATE public.users
SET invite_token = public.hash_invite_token(invite_token)
WHERE invite_token IS NOT NULL AND invite_token NOT LIKE 'sha256:%';

CREATE OR REPLACE FUNCTION public.users_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(
    to_jsonb(OLD), to_jsonb(NEW),
    ARRAY['display_name', 'phone', 'bio', 'avatar_url', 'tos_agreed_at', 'updated_at'],
    'You can only change your name, phone, bio, photo and terms agreement');
  -- ToS agreement: set once, with server time
  IF NEW.tos_agreed_at IS DISTINCT FROM OLD.tos_agreed_at THEN
    NEW.tos_agreed_at := coalesce(OLD.tos_agreed_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_guard_update ON public.users;
CREATE TRIGGER users_guard_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_guard_update();

-- Invite validation / activation now compare hashes
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid or already-used invite link.');
  END IF;

  SELECT id, role, display_name, email, account_status, invite_token_expiry
  INTO rec
  FROM public.users
  WHERE invite_token = public.hash_invite_token(p_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid or already-used invite link.');
  END IF;

  IF rec.invite_token_expiry IS NOT NULL AND rec.invite_token_expiry < now() THEN
    UPDATE public.users SET account_status = 'expired' WHERE id = rec.id;
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite link has expired. Please ask the admin to resend.');
  END IF;

  IF rec.account_status = 'expired' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite link has expired. Please ask the admin to resend.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 'user_id', rec.id, 'role', rec.role,
    'display_name', rec.display_name, 'email', rec.email);
END $$;

CREATE OR REPLACE FUNCTION public.activate_account(p_token text, p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  validation jsonb;
  v_id       uuid;
  v_email    text;
BEGIN
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Password must be at least 8 characters.');
  END IF;

  validation := public.validate_invite_token(p_token);
  IF NOT (validation->>'valid')::boolean THEN
    RETURN validation;
  END IF;

  v_id    := (validation->>'user_id')::uuid;
  v_email := validation->>'email';

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now()
  WHERE id = v_id;

  UPDATE public.users
  SET account_status = 'active', invite_token = NULL, invite_token_expiry = NULL, activated_at = now()
  WHERE id = v_id;

  INSERT INTO public.invite_audit_log (user_id, action) VALUES (v_id, 'activated');

  RETURN jsonb_build_object('success', true, 'user_id', v_id, 'email', v_email);
END $$;

-- Who may see whose user row (and therefore email/phone)
CREATE OR REPLACE FUNCTION public.can_see_user(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- facility ↔ COs who applied to / are assigned to its shifts
    EXISTS (SELECT 1 FROM public.applications a JOIN public.shifts s ON s.id = a.shift_id
            WHERE a.co_id = p_user AND s.facility_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.shifts s
               WHERE s.assigned_co_id = p_user AND s.facility_id = auth.uid())
    -- facilities browsing COs who opted in to being found for employment
    OR (public.current_user_role() = 'facility'
        AND EXISTS (SELECT 1 FROM public.co_profiles cp
                    WHERE cp.user_id = p_user
                      AND cp.employment_availability_status IN ('open_fulltime', 'open_parttime')))
$$;

DROP POLICY IF EXISTS "Users can read own row"                    ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read all user rows" ON public.users;
DROP POLICY IF EXISTS "Admin reads all users"                      ON public.users;
DROP POLICY IF EXISTS "users_select_scoped"                        ON public.users;
CREATE POLICY "users_select_scoped"
  ON public.users FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR role = 'facility'            -- facility accounts are business listings
    OR public.can_see_user(id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. co_profiles / facility_profiles: protected columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.co_profiles_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(
    to_jsonb(OLD), to_jsonb(NEW),
    ARRAY['license_number', 'specialization', 'ica_signed_at',
          'employment_availability_status', 'available_from_immediately', 'available_from_date',
          'preferred_location', 'preferred_location_text', 'current_employment_status',
          'availability_note', 'availability_last_updated_at'],
    'Verification status and subscription tier can only be changed by AfyaWork');
  -- A new licence number must be re-verified
  IF NEW.license_number IS DISTINCT FROM OLD.license_number THEN
    NEW.verified    := false;
    NEW.verified_at := NULL;
  END IF;
  -- ICA signature: set once, with server time
  IF NEW.ica_signed_at IS DISTINCT FROM OLD.ica_signed_at THEN
    NEW.ica_signed_at := coalesce(OLD.ica_signed_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS co_profiles_guard_update ON public.co_profiles;
CREATE TRIGGER co_profiles_guard_update
  BEFORE UPDATE ON public.co_profiles
  FOR EACH ROW EXECUTE FUNCTION public.co_profiles_guard_update();

CREATE OR REPLACE FUNCTION public.facility_profiles_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(
    to_jsonb(OLD), to_jsonb(NEW),
    ARRAY['facility_name', 'facility_type', 'address'],
    'Subscription plan can only be changed by AfyaWork');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS facility_profiles_guard_update ON public.facility_profiles;
CREATE TRIGGER facility_profiles_guard_update
  BEFORE UPDATE ON public.facility_profiles
  FOR EACH ROW EXECUTE FUNCTION public.facility_profiles_guard_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. shifts: scoped reads, safe inserts, only edit/cancel before booking
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_applied(p_shift uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.applications WHERE shift_id = p_shift AND co_id = auth.uid()) $$;

DROP POLICY IF EXISTS "Anyone can read open shifts"               ON public.shifts;
DROP POLICY IF EXISTS "Authenticated users can read open shifts"  ON public.shifts;
DROP POLICY IF EXISTS "Admin reads all shifts"                    ON public.shifts;
DROP POLICY IF EXISTS "shifts_select_open"                        ON public.shifts;
DROP POLICY IF EXISTS "shifts_select_parties"                     ON public.shifts;
CREATE POLICY "shifts_select_open"
  ON public.shifts FOR SELECT TO anon, authenticated
  USING (status = 'open');
CREATE POLICY "shifts_select_parties"
  ON public.shifts FOR SELECT TO authenticated
  USING (facility_id = auth.uid()
         OR assigned_co_id = auth.uid()
         OR public.is_admin()
         OR public.has_applied(id));

CREATE OR REPLACE FUNCTION public.shifts_guard_insert()
RETURNS trigger LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed text[] := ARRAY['id', 'facility_id', 'shift_date', 'shift_type', 'pay_amount',
                            'description', 'status', 'created_at', 'updated_at', 'reliability_flag'];
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'open' OR coalesce(NEW.reliability_flag, false) THEN
    RAISE EXCEPTION 'New shifts must be posted as open' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(to_jsonb(NEW) - v_allowed) e WHERE e.value <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'New shifts cannot include assignment, check-in or dispute data' USING ERRCODE = '42501';
  END IF;
  IF NEW.shift_date < public._today_eat() THEN
    RAISE EXCEPTION 'Shift date must be today or later' USING ERRCODE = '22023';
  END IF;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shifts_guard_insert ON public.shifts;
CREATE TRIGGER shifts_guard_insert
  BEFORE INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_guard_insert();

CREATE OR REPLACE FUNCTION public.shifts_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'open' THEN
    -- Before anyone is selected: details may be edited, or the shift cancelled
    PERFORM public._assert_only_changed(
      to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['shift_date', 'shift_type', 'pay_amount', 'description',
            'status', 'cancellation_reason', 'cancelled_by', 'updated_at'],
      'Only shift details can be edited on an open shift');
    IF NEW.status NOT IN ('open', 'cancelled') THEN
      RAISE EXCEPTION 'Use the approve flow to fill a shift' USING ERRCODE = '42501';
    END IF;
    IF NEW.shift_date IS DISTINCT FROM OLD.shift_date AND NEW.shift_date < public._today_eat() THEN
      RAISE EXCEPTION 'Shift date must be today or later' USING ERRCODE = '22023';
    END IF;

  ELSIF OLD.status IN ('filled', 'confirmed') THEN
    -- A CO has been selected: the only allowed change is cancellation
    PERFORM public._assert_only_changed(
      to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['status', 'cancellation_reason', 'cancelled_by', 'updated_at'],
      'Date, type and pay cannot change after a CO is selected — cancel and repost instead');
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Only cancellation is allowed once a CO is selected' USING ERRCODE = '42501';
    END IF;

  ELSE
    RAISE EXCEPTION 'This shift can no longer be changed (status: %)', OLD.status USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'cancelled' THEN
    NEW.cancelled_by := 'facility';   -- only facilities hold a direct UPDATE policy
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shifts_guard_update ON public.shifts;
CREATE TRIGGER shifts_guard_update
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_guard_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. applications: honest inserts, facilities may only reject directly
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.applications_guard_insert()
RETURNS trigger LANGUAGE plpgsql
AS $$
DECLARE
  v_shift RECORD;
  v_co    RECORD;
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT status, shift_date, facility_id INTO v_shift FROM public.shifts WHERE id = NEW.shift_id;
  IF NOT FOUND OR v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'This shift is no longer open' USING ERRCODE = '22023';
  END IF;
  IF v_shift.shift_date < public._today_eat() THEN
    RAISE EXCEPTION 'This shift date has passed' USING ERRCODE = '22023';
  END IF;

  SELECT verified, ica_signed_at INTO v_co FROM public.co_profiles WHERE user_id = NEW.co_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only Clinical Officers can apply' USING ERRCODE = '42501';
  END IF;
  IF v_co.ica_signed_at IS NULL THEN
    RAISE EXCEPTION 'Please sign the Independent Contractor Agreement before applying' USING ERRCODE = '42501';
  END IF;
  IF public.get_config('require_verified_cos') = 'true' AND NOT coalesce(v_co.verified, false) THEN
    RAISE EXCEPTION 'Your licence must be verified by AfyaWork before you can apply' USING ERRCODE = '42501';
  END IF;

  NEW.status     := 'pending';
  NEW.applied_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS applications_guard_insert ON public.applications;
CREATE TRIGGER applications_guard_insert
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_guard_insert();

CREATE OR REPLACE FUNCTION public.applications_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status'],
    'Only the application status can change');
  IF NOT (OLD.status = 'pending' AND NEW.status = 'rejected') THEN
    RAISE EXCEPTION 'Applications can only be rejected here — use Approve to select a CO' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS applications_guard_update ON public.applications;
CREATE TRIGGER applications_guard_update
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_guard_update();

-- Approve: lock the shift row (no double-approval race), check the application
CREATE OR REPLACE FUNCTION public.approve_application(application_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app   RECORD;
  v_shift RECORD;
BEGIN
  SELECT id, shift_id, co_id, status INTO v_app FROM public.applications WHERE id = application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  SELECT * INTO v_shift FROM public.shifts WHERE id = v_app.shift_id FOR UPDATE;
  IF v_shift.facility_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF v_shift.status <> 'open' THEN RAISE EXCEPTION 'Shift is not open'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'This application is no longer pending'; END IF;
  IF public.get_config('require_verified_cos') = 'true' AND NOT EXISTS (
       SELECT 1 FROM public.co_profiles WHERE user_id = v_app.co_id AND verified) THEN
    RAISE EXCEPTION 'This CO has not been verified yet';
  END IF;

  UPDATE public.applications SET status = 'approved' WHERE id = application_id;
  UPDATE public.applications SET status = 'rejected'
    WHERE shift_id = v_app.shift_id AND id <> application_id AND status = 'pending';

  UPDATE public.shifts
  SET status = 'filled', assigned_co_id = v_app.co_id, offer_expires_at = now() + interval '24 hours'
  WHERE id = v_app.shift_id;

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (v_app.co_id, v_app.shift_id, 'shift_offer',
          'You''ve been selected! 🎉',
          'A facility has chosen you for a shift. Accept or decline the offer within 24 hours.',
          '/co/applications');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Ratings: only through submit_rating(); only admins moderate
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users submit ratings"      ON public.shift_ratings;
DROP POLICY IF EXISTS "Users update own ratings"  ON public.shift_ratings;
DROP POLICY IF EXISTS "Admin moderates ratings"   ON public.shift_ratings;
CREATE POLICY "Admin moderates ratings"
  ON public.shift_ratings FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Notifications: no direct inserts; users may only mark as read
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow notification inserts" ON public.notifications;

CREATE OR REPLACE FUNCTION public.notifications_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['read'],
    'Notifications can only be marked as read');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_guard_update ON public.notifications;
CREATE TRIGGER notifications_guard_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_guard_update();

-- Beta feedback: can't submit on someone else's behalf
DROP POLICY IF EXISTS "Anyone authenticated can submit feedback" ON public.beta_feedback;
CREATE POLICY "Anyone authenticated can submit feedback"
  ON public.beta_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Mobile money: COs cannot self-verify; changing the number resets it
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.co_mobile_money_guard()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.number_verified := false;
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(to_jsonb(OLD), to_jsonb(NEW),
    ARRAY['mobile_money_provider', 'mobile_money_number', 'account_name',
          'provider_mismatch_warning_shown', 'updated_at'],
    'Only AfyaWork can verify a mobile money number');
  IF NEW.mobile_money_number IS DISTINCT FROM OLD.mobile_money_number
     OR NEW.mobile_money_provider IS DISTINCT FROM OLD.mobile_money_provider THEN
    NEW.number_verified := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS co_mobile_money_guard ON public.co_mobile_money;
CREATE TRIGGER co_mobile_money_guard
  BEFORE INSERT OR UPDATE ON public.co_mobile_money
  FOR EACH ROW EXECUTE FUNCTION public.co_mobile_money_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Payments: one calculation, correct fee and overtime, admin-only release
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shift_scheduled_minutes(p_shift_type text)
RETURNS integer LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_shift_type
    WHEN 'Day (8AM-4PM)'      THEN 480
    WHEN 'Evening (4PM-10PM)' THEN 360
    WHEN 'Night (10PM-6AM)'   THEN 480
    WHEN '24-Hour'            THEN 1440
    WHEN 'Weekend'            THEN 480
    ELSE 480
  END
$$;

-- Internal: create or refresh the payment record for a completed shift.
-- Only touches records still in 'pending' (never an approved/disbursed one).
CREATE OR REPLACE FUNCTION public.compute_shift_payment(p_shift_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s         RECORD;
  mm        RECORD;
  v_sched   integer;
  v_worked  integer;
  v_ot_min  integer := 0;
  v_ot_rate bigint;
  v_ot_pay  bigint  := 0;
  v_rate    numeric;
  v_fee     bigint;
  v_co_pay  bigint;
BEGIN
  SELECT * INTO s FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND OR s.status <> 'completed' OR s.assigned_co_id IS NULL THEN
    RAISE EXCEPTION 'Shift is not completed';
  END IF;

  v_sched := public.shift_scheduled_minutes(s.shift_type);

  -- Actual time on site: CO check-in → CO check-out (both confirmed by the facility)
  IF s.checkin_at IS NOT NULL AND s.checkout_at IS NOT NULL THEN
    v_worked := round(extract(epoch FROM (s.checkout_at - s.checkin_at)) / 60);
  END IF;

  v_ot_rate := coalesce(nullif(public.get_config('platform_overtime_hourly_rate'), '')::bigint, 5000);
  IF v_worked IS NOT NULL AND v_worked - v_sched >= 60 THEN
    v_ot_min := v_worked - v_sched;
    v_ot_pay := round(v_ot_min * v_ot_rate / 60.0);
  END IF;

  v_rate   := coalesce(nullif(public.get_config('platform_fee_rate'), '')::numeric, 0.186);
  v_fee    := round(s.pay_amount * v_rate);
  v_co_pay := s.pay_amount + v_ot_pay;

  SELECT mobile_money_provider, mobile_money_number INTO mm
  FROM public.co_mobile_money WHERE co_id = s.assigned_co_id;

  INSERT INTO public.shift_payments (
    shift_id, co_id, facility_id, flat_shift_rate, scheduled_shift_duration_minutes,
    approved_hours_worked_minutes, overtime_minutes, overtime_rate_applied, overtime_pay,
    co_total_pay, adjusted_pay_amount, platform_fee, facility_total_charge, tax_withheld_amount,
    mobile_money_provider, mobile_money_number, payment_status, scheduled_at
  ) VALUES (
    p_shift_id, s.assigned_co_id, s.facility_id, s.pay_amount, v_sched,
    v_worked, v_ot_min, v_ot_rate, v_ot_pay,
    v_co_pay, v_co_pay, v_fee, v_co_pay + v_fee, 0,
    mm.mobile_money_provider, mm.mobile_money_number, 'pending', NULL
  )
  ON CONFLICT (shift_id) DO UPDATE SET
    flat_shift_rate                  = EXCLUDED.flat_shift_rate,
    scheduled_shift_duration_minutes = EXCLUDED.scheduled_shift_duration_minutes,
    approved_hours_worked_minutes    = EXCLUDED.approved_hours_worked_minutes,
    overtime_minutes                 = EXCLUDED.overtime_minutes,
    overtime_rate_applied            = EXCLUDED.overtime_rate_applied,
    overtime_pay                     = EXCLUDED.overtime_pay,
    co_total_pay                     = EXCLUDED.co_total_pay,
    adjusted_pay_amount              = EXCLUDED.adjusted_pay_amount,
    platform_fee                     = EXCLUDED.platform_fee,
    facility_total_charge            = EXCLUDED.facility_total_charge,
    mobile_money_provider            = EXCLUDED.mobile_money_provider,
    mobile_money_number              = EXCLUDED.mobile_money_number
  WHERE public.shift_payments.payment_status = 'pending';
END $$;

-- Called by the calculate-shift-payment edge function (kept for compatibility)
CREATE OR REPLACE FUNCTION public.recalculate_shift_payment(p_shift_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public._caller_is_trusted() OR public.is_admin()
          OR EXISTS (SELECT 1 FROM public.shifts WHERE id = p_shift_id AND facility_id = auth.uid())) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public.compute_shift_payment(p_shift_id);
END $$;

CREATE OR REPLACE FUNCTION public.approve_checkout(p_shift_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_shift RECORD;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.facility_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your shift'; END IF;
  IF v_shift.status <> 'pending_checkout_approval' THEN RAISE EXCEPTION 'No checkout pending approval'; END IF;

  UPDATE public.shifts SET status = 'completed', checkout_approved_at = now() WHERE id = p_shift_id;
  PERFORM public.compute_shift_payment(p_shift_id);

  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (v_shift.assigned_co_id, p_shift_id, 'checkout_approved', 'Shift completed! 🎉',
          'The facility confirmed your checkout. Please take a moment to rate your experience.',
          '/co/applications');
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (v_shift.facility_id, p_shift_id, 'rate_co', 'Rate this Clinical Officer',
          'The shift is complete. Share feedback for the CO.',
          '/facility/shifts/' || p_shift_id);
END $$;

-- Dispute resolution: shifts that end 'completed' now get a payment record
CREATE OR REPLACE FUNCTION public.resolve_dispute(p_shift_id uuid, p_resolution text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_shift RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF v_shift.status NOT IN ('disputed_checkin', 'disputed_checkout') THEN
    RAISE EXCEPTION 'Shift is not in a disputed state';
  END IF;

  IF p_resolution = 'approve' THEN
    IF v_shift.status = 'disputed_checkin' THEN
      UPDATE public.shifts SET status = 'in_progress', checkin_approved_at = now() WHERE id = p_shift_id;
      INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
      VALUES (v_shift.assigned_co_id, p_shift_id, 'dispute_resolved', 'Dispute resolved — Check-in approved',
              'An admin reviewed the dispute and approved your check-in.', '/co/applications');
    ELSE
      UPDATE public.shifts SET status = 'completed', checkout_approved_at = now() WHERE id = p_shift_id;
      PERFORM public.compute_shift_payment(p_shift_id);
      INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
      VALUES (v_shift.assigned_co_id, p_shift_id, 'dispute_resolved', 'Dispute resolved — Shift completed',
              'An admin reviewed the dispute and your shift is now complete.', '/co/applications');
    END IF;
  ELSE
    IF v_shift.status = 'disputed_checkin' THEN
      UPDATE public.shifts SET status = 'no_show', reliability_flag = true WHERE id = p_shift_id;
      INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
      VALUES (v_shift.assigned_co_id, p_shift_id, 'dispute_resolved', 'Dispute resolved — No-show recorded',
              'An admin reviewed the dispute and recorded a no-show on your account.', '/co/applications');
    ELSE
      UPDATE public.shifts SET status = 'completed', reliability_flag = true WHERE id = p_shift_id;
      PERFORM public.compute_shift_payment(p_shift_id);
    END IF;
  END IF;

  UPDATE public.shifts SET dispute_resolved_at = now(), dispute_resolved_by = auth.uid() WHERE id = p_shift_id;
END $$;

CREATE OR REPLACE FUNCTION public.hold_shift_payment(p_shift_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Holding is protective, so the facility on the shift may do it too
  IF NOT (public._caller_is_trusted() OR public.is_admin()
          OR EXISTS (SELECT 1 FROM public.shifts WHERE id = p_shift_id AND facility_id = auth.uid())) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.shift_payments
  SET payment_status = 'held', hold_reason = coalesce(p_reason, hold_reason), updated_at = now()
  WHERE shift_id = p_shift_id AND payment_status IN ('pending', 'scheduled');
END $$;

CREATE OR REPLACE FUNCTION public.release_shift_payment(
  p_shift_id uuid, p_adjusted_amount bigint DEFAULT NULL, p_is_adjustment boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public._caller_is_trusted() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_adjusted_amount IS NOT NULL AND (p_adjusted_amount < 0 OR p_adjusted_amount > 2000000) THEN
    RAISE EXCEPTION 'Adjusted amount out of range';
  END IF;
  UPDATE public.shift_payments
  SET payment_status = 'scheduled',
      hold_reason = NULL,
      dispute_resolution_adjustment = p_is_adjustment,
      adjusted_pay_amount = coalesce(p_adjusted_amount, adjusted_pay_amount, co_total_pay),
      co_total_pay = coalesce(p_adjusted_amount, co_total_pay),
      scheduled_at = now(),
      updated_at = now()
  WHERE shift_id = p_shift_id AND payment_status IN ('held', 'released', 'pending');
END $$;

CREATE OR REPLACE FUNCTION public.cancel_shift_payment(p_shift_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public._caller_is_trusted() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.shift_payments
  SET payment_status = 'cancelled', hold_reason = NULL, updated_at = now()
  WHERE shift_id = p_shift_id AND payment_status NOT IN ('disbursed', 'cancelled');
END $$;

-- Atomically claim scheduled payments for a batch; concurrent runs can't both
-- claim the same row, so a double trigger cannot pay a CO twice.
CREATE OR REPLACE FUNCTION public.claim_scheduled_payments(p_batch_id uuid)
RETURNS SETOF public.shift_payments LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._caller_is_trusted() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    UPDATE public.shift_payments
    SET payment_status = 'processing', disbursement_batch_id = p_batch_id, updated_at = now()
    WHERE payment_status = 'scheduled'
    RETURNING *;
END $$;

-- Stats view: evaluate with the caller's permissions (was readable by everyone)
DO $$ BEGIN
  EXECUTE 'ALTER VIEW public.admin_payment_stats SET (security_invoker = true)';
EXCEPTION WHEN others THEN
  -- Postgres < 15: view stays as-is (aggregate totals only); upgrade Postgres to close this
  RAISE NOTICE 'security_invoker not supported on this Postgres version; admin_payment_stats unchanged';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Lock down function execution
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE f record;
BEGIN
  -- All SECURITY DEFINER functions in public: no anonymous access
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.proname NOT IN ('compute_shift_payment', 'claim_scheduled_payments') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
  END LOOP;
END $$;

-- The invite page runs before login
GRANT EXECUTE ON FUNCTION public.validate_invite_token(text)   TO anon;
GRANT EXECUTE ON FUNCTION public.activate_account(text, text)  TO anon;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- AFTER RUNNING
--  • Change the admin password if create_admin_user.sql was run with the default.
--  • Deploy the updated edge functions (see README-SECURITY.md) and set
--    INTERNAL_WEBHOOK_SECRET and SELCOM_WEBHOOK_SECRET.
--  • Supabase Dashboard → Auth → set minimum password length to 8+.
-- ─────────────────────────────────────────────────────────────────────────────
