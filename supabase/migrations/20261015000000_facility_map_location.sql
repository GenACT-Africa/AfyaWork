-- ═════════════════════════════════════════════════════════════════════════════
-- Facility Google Maps location  (15 Oct 2026)
--
-- COs need to find the facility. Each facility gives a Google Maps link and/or
-- its GPS position (location_lat / location_lng, from "Use my current
-- location" or read out of a full Maps link). COs get a "Directions" button.
--
-- Facilities must have a location before they can post a shift (admins can
-- still post for them). Only real Google Maps links are accepted, so a
-- facility can't send COs to some other website.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._is_google_maps_url(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$
  SELECT p ~* '^https?://(www\.)?(google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})/maps|maps\.google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})(/|\?|$)|maps\.app\.goo\.gl/|goo\.gl/maps|g\.co/kgs/)'
     AND length(p) <= 1000
     AND p !~ '\s'
$$;

ALTER TABLE public.facility_profiles
  ADD COLUMN IF NOT EXISTS location_url text,
  ADD COLUMN IF NOT EXISTS location_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS location_lng numeric(9,6);

ALTER TABLE public.facility_profiles DROP CONSTRAINT IF EXISTS facility_profiles_location_check;
ALTER TABLE public.facility_profiles ADD CONSTRAINT facility_profiles_location_check CHECK (
      (location_url IS NULL OR public._is_google_maps_url(location_url))
  AND ((location_lat IS NULL) = (location_lng IS NULL))
  AND (location_lat IS NULL OR (location_lat BETWEEN -90 AND 90 AND location_lng BETWEEN -180 AND 180))
);

CREATE OR REPLACE FUNCTION public.facility_has_location(p_facility uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.facility_profiles
                 WHERE user_id = p_facility AND (location_url IS NOT NULL OR location_lat IS NOT NULL))
$$;

-- Self-edits: the HFR version (20261013) plus the three location columns
CREATE OR REPLACE FUNCTION public.facility_profiles_guard_update()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.location_url IS DISTINCT FROM OLD.location_url THEN
    NEW.location_url := nullif(btrim(coalesce(NEW.location_url, '')), '');
  END IF;
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
          'location_url', 'location_lat', 'location_lng',
          -- reset by the block above when the code changes:
          'hfr_status', 'hfr_name', 'hfr_checked_at', 'verified', 'verified_at', 'verification_note'],
    'Subscription plan and verification can only be changed by AfyaWork');
  IF NEW.hfr_code IS NOT DISTINCT FROM OLD.hfr_code AND (
       NEW.hfr_status IS DISTINCT FROM OLD.hfr_status OR NEW.hfr_name IS DISTINCT FROM OLD.hfr_name
    OR NEW.hfr_checked_at IS DISTINCT FROM OLD.hfr_checked_at OR NEW.verified IS DISTINCT FROM OLD.verified
    OR NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.verification_note IS DISTINCT FROM OLD.verification_note) THEN
    RAISE EXCEPTION 'Verification can only be changed by AfyaWork' USING ERRCODE = '42501';
  END IF;
  -- A facility cannot remove its location once shifts depend on it
  IF NOT (NEW.location_url IS NOT NULL OR NEW.location_lat IS NOT NULL)
     AND (OLD.location_url IS NOT NULL OR OLD.location_lat IS NOT NULL) THEN
    RAISE EXCEPTION 'Your Google Maps location is required — COs use it to find you' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

-- No location → cannot post a shift (admins can still post on a facility's behalf)
CREATE OR REPLACE FUNCTION public.shifts_guard_facility_location()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN RETURN NEW; END IF;
  IF NOT public.facility_has_location(NEW.facility_id) THEN
    RAISE EXCEPTION 'Add your facility''s Google Maps location on your profile before posting a shift, so COs can find you.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shifts_guard_facility_location ON public.shifts;
CREATE TRIGGER shifts_guard_facility_location
  BEFORE INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_guard_facility_location();

-- Signup: the 20261013 version plus the location (invalid values are dropped, not fatal)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := NEW.raw_user_meta_data->>'role';
  v_hfr  text;
  v_url  text;
  v_lat  numeric;
  v_lng  numeric;
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

    v_url := nullif(btrim(coalesce(NEW.raw_user_meta_data->>'location_url', '')), '');
    IF v_url IS NOT NULL AND NOT public._is_google_maps_url(v_url) THEN v_url := NULL; END IF;
    BEGIN
      v_lat := (NEW.raw_user_meta_data->>'location_lat')::numeric;
      v_lng := (NEW.raw_user_meta_data->>'location_lng')::numeric;
    EXCEPTION WHEN others THEN v_lat := NULL; v_lng := NULL;
    END;
    IF v_lat IS NULL OR v_lng IS NULL OR v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180 THEN
      v_lat := NULL; v_lng := NULL;
    END IF;

    INSERT INTO public.facility_profiles (user_id, facility_name, facility_type, address, hfr_code,
                                          location_url, location_lat, location_lng)
    VALUES (NEW.id,
            NEW.raw_user_meta_data->>'facility_name',
            NEW.raw_user_meta_data->>'facility_type',
            NEW.raw_user_meta_data->>'address',
            v_hfr, v_url, round(v_lat, 6), round(v_lng, 6));
  END IF;
  RETURN NEW;
END $$;
