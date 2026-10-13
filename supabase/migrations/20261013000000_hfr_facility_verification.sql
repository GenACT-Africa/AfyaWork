-- ═════════════════════════════════════════════════════════════════════════════
-- HFR verification for facilities  (13 Oct 2026)
--
-- Mirrors MCT verification for COs. The verify-facility edge function looks up
-- each facility's HFR code on the Ministry of Health's Health Facility Registry
-- (public portal at hfrs.moh.go.tz) and writes the result here.
--
--   facility_profiles.hfr_*   – latest result, shown on profiles (safe to expose)
--   facility_hfr_checks       – full lookup history incl. HFR record (admins only)
--
-- verified is the admin's decision: the HFR listing is public, so anyone can type
-- a real facility's code. The admin confirms the person signing up actually
-- represents that facility (call the official phone listed on HFR). The
-- function never sets verified = true. It DOES set verified = false when a
-- re-check finds the facility no longer operating or no longer on the register.
--
-- Enforcement is off until require_verified_facilities = 'true'; after that an
-- unverified facility cannot post shifts.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.facility_profiles
  ADD COLUMN IF NOT EXISTS hfr_code            text,
  ADD COLUMN IF NOT EXISTS hfr_status          text NOT NULL DEFAULT 'unchecked'
    CHECK (hfr_status IN ('unchecked', 'operating', 'not_operating', 'not_found', 'no_code', 'error')),
  ADD COLUMN IF NOT EXISTS hfr_name            text,
  ADD COLUMN IF NOT EXISTS hfr_checked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS verified            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by         uuid,   -- admin user id; no FK on purpose (keeps PostgREST users(...) embeds unambiguous)
  ADD COLUMN IF NOT EXISTS verification_note   text;

-- "125039 8", "1250398", "hfr 125039-8" → "125039-8"; anything else is kept (trimmed) so the check can report it
CREATE OR REPLACE FUNCTION public._normalise_hfr_code(p text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN c ~ '^[0-9]{5,7}-?[0-9]$' THEN regexp_replace(c, '^([0-9]{5,7})-?([0-9])$', '\1-\2')
    ELSE nullif(btrim(p), '')
  END
  FROM (SELECT regexp_replace(upper(coalesce(p, '')), '(HFR|CODE|[:#[:space:]])', '', 'g') AS c) x
$$;

-- One AfyaWork account per registered facility
CREATE UNIQUE INDEX IF NOT EXISTS facility_profiles_hfr_code_key
  ON public.facility_profiles (hfr_code) WHERE hfr_code IS NOT NULL;

INSERT INTO public.system_config (key, value) VALUES ('require_verified_facilities', 'false')
ON CONFLICT (key) DO NOTHING;

-- Self-edits: facilities may now also set their HFR code. Everything else
-- (verified, hfr_status, plan) stays AfyaWork-only. A new code resets the check.
CREATE OR REPLACE FUNCTION public.facility_profiles_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.hfr_code IS DISTINCT FROM OLD.hfr_code THEN
    NEW.hfr_code := public._normalise_hfr_code(NEW.hfr_code);
  END IF;
  IF NEW.hfr_code IS DISTINCT FROM OLD.hfr_code THEN
    NEW.hfr_status        := 'unchecked';
    NEW.hfr_name          := NULL;
    NEW.hfr_checked_at    := NULL;
    NEW.verified          := false;
    NEW.verified_at       := NULL;
    NEW.verification_note := CASE WHEN OLD.verified THEN 'Auto-removed: HFR code changed' ELSE OLD.verification_note END;
  END IF;
  IF NOT public._is_end_user_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  PERFORM public._assert_only_changed(
    to_jsonb(OLD), to_jsonb(NEW),
    ARRAY['facility_name', 'facility_type', 'address', 'hfr_code',
          -- reset by the block above when the code changes:
          'hfr_status', 'hfr_name', 'hfr_checked_at', 'verified', 'verified_at', 'verification_note'],
    'Subscription plan and verification can only be changed by AfyaWork');
  IF NEW.hfr_code IS NOT DISTINCT FROM OLD.hfr_code AND (
       NEW.hfr_status IS DISTINCT FROM OLD.hfr_status OR NEW.hfr_name IS DISTINCT FROM OLD.hfr_name
    OR NEW.hfr_checked_at IS DISTINCT FROM OLD.hfr_checked_at OR NEW.verified IS DISTINCT FROM OLD.verified
    OR NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.verification_note IS DISTINCT FROM OLD.verification_note) THEN
    RAISE EXCEPTION 'Verification can only be changed by AfyaWork' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
-- (trigger facility_profiles_guard_update already exists and points at this function)

-- Full history of lookups (admins only)
CREATE TABLE IF NOT EXISTS public.facility_hfr_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  trigger_source  text NOT NULL,              -- 'signup' | 'admin' | 'batch' | 'self'
  searched_code   text,
  status          text NOT NULL,
  hfr_code        text,
  hfr_name        text,
  hfr_type        text,
  hfr_region      text,
  hfr_council     text,
  hfr_address     text,
  hfr_ownership   text,
  hfr_owner_name  text,
  hfr_authority   text,                       -- PHAB, PHLB, DCS…
  hfr_operating   text,                       -- 'Operating' or what HFR shows instead
  hfr_opened      date,
  hfr_phone       text,                       -- official phone on HFR: call it to confirm the sign-up
  name_match      numeric,                    -- 0..1 share of name words that match
  message         text,
  hfr_record      jsonb
);
CREATE INDEX IF NOT EXISTS facility_hfr_checks_fac_idx ON public.facility_hfr_checks (facility_id, checked_at DESC);

ALTER TABLE public.facility_hfr_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facility_hfr_checks_admin_read ON public.facility_hfr_checks;
CREATE POLICY facility_hfr_checks_admin_read ON public.facility_hfr_checks
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.facility_hfr_checks FROM anon, authenticated;

-- Admin decision (facility confirmed / rejected)
CREATE OR REPLACE FUNCTION public.admin_set_facility_verification(p_facility_id uuid, p_verified boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_verified AND NOT EXISTS (
       SELECT 1 FROM public.facility_profiles
       WHERE user_id = p_facility_id AND hfr_status = 'operating') THEN
    RAISE EXCEPTION 'HFR check must show an operating facility before approving' USING ERRCODE = '22023';
  END IF;
  UPDATE public.facility_profiles
     SET verified          = p_verified,
         verified_at       = CASE WHEN p_verified THEN now() ELSE NULL END,
         verified_by       = auth.uid(),
         verification_note = p_note
   WHERE user_id = p_facility_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_facility_verification(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_facility_verification(uuid, boolean, text) TO authenticated;

-- Unverified facilities cannot post shifts (only once verification is enforced)
CREATE OR REPLACE FUNCTION public.shifts_guard_facility_verified()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN RETURN NEW; END IF;
  IF public.get_config('require_verified_facilities') IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.facility_profiles WHERE user_id = NEW.facility_id AND verified) THEN
    RAISE EXCEPTION 'AfyaWork needs to verify your facility before you can post shifts. Add your HFR facility code on your profile.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shifts_guard_facility_verified ON public.shifts;
CREATE TRIGGER shifts_guard_facility_verified
  BEFORE INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_guard_facility_verified();

-- Signup: same as the 20260927 version plus
--   * phone: the signup form always collected it but never saved it. It is now
--     stored on users.phone (required for facilities in the signup form, since
--     it is how AfyaWork reaches them; optional for COs).
--   * hfr_code (facilities, optional). A code already used by another account
--     is dropped rather than failing the signup; AfyaWork follows up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := NEW.raw_user_meta_data->>'role';
  v_hfr  text;
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

  INSERT INTO public.users (id, role, display_name, email, phone)
  VALUES (NEW.id, v_role, NEW.raw_user_meta_data->>'display_name', NEW.email,
          nullif(btrim(coalesce(NEW.raw_user_meta_data->>'phone', '')), ''));

  IF v_role = 'co' THEN
    INSERT INTO public.co_profiles (user_id, license_number, specialization)
    VALUES (NEW.id,
            NEW.raw_user_meta_data->>'license_number',
            NEW.raw_user_meta_data->>'specialization');
  ELSE
    v_hfr := public._normalise_hfr_code(NEW.raw_user_meta_data->>'hfr_code');
    IF v_hfr IS NOT NULL AND EXISTS (SELECT 1 FROM public.facility_profiles WHERE hfr_code = v_hfr) THEN
      v_hfr := NULL;
    END IF;
    INSERT INTO public.facility_profiles (user_id, facility_name, facility_type, address, hfr_code)
    VALUES (NEW.id,
            NEW.raw_user_meta_data->>'facility_name',
            NEW.raw_user_meta_data->>'facility_type',
            NEW.raw_user_meta_data->>'address',
            v_hfr);
  END IF;
  RETURN NEW;
END $$;
