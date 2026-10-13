-- ═════════════════════════════════════════════════════════════════════════════
-- Fix: inviting a coordinator failed with "Database error creating new user"
-- (17 Oct 2026)
--
-- Supabase's admin createUser inserts the auth user first and writes
-- app_metadata in a second step, so handle_new_user never saw
-- app_metadata.afyawork_role and rejected the new account.
--
-- Now the coordinator-admin edge function first stores a random one-time token
-- for the email in staff_invites (service role only), then creates the user with
-- user_metadata.role = 'coordinator' + that token. handle_new_user accepts the
-- coordinator role only when the token matches (and deletes it). A public
-- sign-up asking for role 'coordinator' still fails: it cannot know a token.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_invites (
  email       text PRIMARY KEY,                       -- lower-case
  token       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;   -- no policies: service role / definer only
REVOKE ALL ON public.staff_invites FROM anon, authenticated;
DROP POLICY IF EXISTS no_coordinators ON public.staff_invites;

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

  -- Coordinators: only with a one-time token the coordinator-admin edge function
  -- stored in staff_invites (service role only) seconds before creating the user.
  -- (Supabase applies app_metadata AFTER this insert, so it can't be used here.)
  IF v_role = 'coordinator' OR NEW.raw_app_meta_data->>'afyawork_role' = 'coordinator' THEN
    IF NEW.raw_app_meta_data->>'afyawork_role' = 'coordinator'
       OR EXISTS (SELECT 1 FROM public.staff_invites si
                   WHERE si.email = lower(NEW.email)
                     AND si.token = NEW.raw_user_meta_data->>'staff_invite_token'
                     AND si.expires_at > now()) THEN
      DELETE FROM public.staff_invites WHERE email = lower(NEW.email);
      INSERT INTO public.users (id, role, display_name, email, phone)
      VALUES (NEW.id, 'coordinator', coalesce(NEW.raw_user_meta_data->>'display_name', 'Coordinator'), NEW.email,
              nullif(btrim(coalesce(NEW.raw_user_meta_data->>'phone', '')), ''));
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Invalid account role' USING ERRCODE = '22023';
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
