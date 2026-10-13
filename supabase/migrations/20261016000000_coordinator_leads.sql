-- ═════════════════════════════════════════════════════════════════════════════
-- Coordinator page: facility leads pipeline  (16 Oct 2026)
-- Spec: "Coordinator Page: Build Spec" (Claude Doc, 13 Oct 2026)
--
-- Coordinators are employees who take a facility from lead to first shift
-- using the 8-stage onboarding SOP. They share one pipeline, each with their
-- own login, and they can see NOTHING else in the database.
--
--   users.role = 'coordinator'   only via an admin invite (app_metadata, which a
--                                public sign-up cannot set); revoked = 'disabled'
--   facility_leads               one row per prospect facility
--   lead_steps                   manual ticks (auto steps are computed, never stored)
--   lead_files                   uploaded evidence, private bucket 'lead-files'
--   lead_events                  audit trail (admins read)
--   facility_profiles.contract_signed_at  set only by admin_set_contract_signed;
--                                admin_set_facility_verification now requires it
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Role and account status ─────────────────────────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('co', 'facility', 'admin', 'coordinator'));
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('pending_invite', 'active', 'expired', 'disabled'));

-- An active coordinator (a revoked one is 'disabled' and gets nothing)
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.users
                     WHERE id = auth.uid() AND role = 'coordinator' AND account_status = 'active') $$;

-- Who may work the pipeline: admins and active coordinators
CREATE OR REPLACE FUNCTION public.is_lead_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.is_admin() OR public.is_coordinator() $$;

-- Signup: the 20261015 version, plus coordinators. A coordinator can only be
-- created by the coordinator-admin edge function, which sets
-- app_metadata.afyawork_role (end users cannot write app_metadata).
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

  IF NEW.raw_app_meta_data->>'afyawork_role' = 'coordinator' THEN
    INSERT INTO public.users (id, role, display_name, email, phone)
    VALUES (NEW.id, 'coordinator', coalesce(NEW.raw_user_meta_data->>'display_name', 'Coordinator'), NEW.email,
            nullif(btrim(coalesce(NEW.raw_user_meta_data->>'phone', '')), ''));
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

-- ── 2. Coordinators see nothing outside the pipeline ───────────────────────
-- A RESTRICTIVE policy is ANDed with every existing policy, so whatever a
-- table already allows, a coordinator (active or revoked) gets no rows —
-- except their own user row, notifications and push subscriptions.
CREATE OR REPLACE FUNCTION public._is_coordinator_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT coalesce((SELECT role = 'coordinator' FROM public.users WHERE id = auth.uid()), false) $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relname NOT IN ('facility_leads', 'lead_steps', 'lead_files', 'lead_events')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS no_coordinators ON public.%I', t);
    IF t = 'users' THEN
      EXECUTE 'CREATE POLICY no_coordinators ON public.users AS RESTRICTIVE FOR ALL TO authenticated
               USING (id = auth.uid() OR NOT (SELECT public._is_coordinator_role()))
               WITH CHECK (id = auth.uid() OR NOT (SELECT public._is_coordinator_role()))';
    ELSIF t IN ('notifications', 'push_subscriptions') THEN
      EXECUTE format('CREATE POLICY no_coordinators ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
               USING (user_id = auth.uid() OR NOT (SELECT public._is_coordinator_role()))
               WITH CHECK (user_id = auth.uid() OR NOT (SELECT public._is_coordinator_role()))', t);
    ELSE
      EXECUTE format('CREATE POLICY no_coordinators ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
               USING (NOT (SELECT public._is_coordinator_role()))
               WITH CHECK (NOT (SELECT public._is_coordinator_role()))', t);
    END IF;
  END LOOP;
END $$;

-- ── 3. Leads ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.facility_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  hfr_code             text CHECK (length(hfr_code) <= 40),
  official_phone       text CHECK (length(official_phone) <= 40),
  contact_name         text CHECK (length(contact_name) <= 120),
  contact_role         text CHECK (length(contact_role) <= 120),
  language             text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'sw')),
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cold', 'later', 'declined')),
  owner_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_date             date,
  notes                text CHECK (length(notes) <= 5000),
  pay_per_shift_tzs    integer CHECK (pay_per_shift_tzs BETWEEN 0 AND 10000000),
  cos_per_month        integer CHECK (cos_per_month BETWEEN 0 AND 1000),
  licence_expiry       date,
  map_url              text CHECK (map_url IS NULL OR public._is_google_maps_url(map_url)
                                   OR map_url ~ '^-?[0-9]{1,2}\.[0-9]+,\s*-?[0-9]{1,3}\.[0-9]+$'),
  facility_profile_id  uuid UNIQUE REFERENCES public.facility_profiles(user_id) ON DELETE SET NULL,
  hfr_status           text CHECK (hfr_status IN ('operating', 'not_operating', 'not_found', 'error')),
  hfr_name             text,
  hfr_checked_at       timestamptz,
  created_by           uuid,     -- no FK on purpose (a 2nd FK to users makes users(...) embeds ambiguous)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facility_leads_hfr_code_key ON public.facility_leads (hfr_code) WHERE hfr_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS facility_leads_owner_idx ON public.facility_leads (owner_id);
CREATE INDEX IF NOT EXISTS facility_leads_due_idx   ON public.facility_leads (due_date);

-- Step ids are defined in src/lib/leadSteps.js. Only MANUAL steps can be stored;
-- auto steps (1a 1b 1c 6a 6b 6d 6f 6g 7d 7e 7f) are computed from live data.
CREATE TABLE IF NOT EXISTS public.lead_steps (
  lead_id   uuid NOT NULL REFERENCES public.facility_leads(id) ON DELETE CASCADE,
  step_id   text NOT NULL CHECK (step_id IN (
              '1d', '2a', '2b', '2c', '2d', '2e',
              '3a', '3b', '3c', '3d', '3e', '3f',
              '4a', '4b', '4c', '4d', '4e', '4f', '4g', '4h', '4i',
              '5a', '5b', '5c', '5d', '5e',
              '6c', '6e', '6h',
              '7a', '7b', '7c',
              '8a', '8b', '8c')),
  done_at   timestamptz NOT NULL DEFAULT now(),
  done_by   uuid,
  PRIMARY KEY (lead_id, step_id)
);

CREATE TABLE IF NOT EXISTS public.lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid,           -- no FK: history outlives a deleted lead
  actor_id    uuid,
  action      text NOT NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON public.lead_events (lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._lead_event(p_lead uuid, p_action text, p_detail jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$ INSERT INTO public.lead_events (lead_id, actor_id, action, detail) VALUES (p_lead, auth.uid(), p_action, p_detail) $$;
REVOKE EXECUTE ON FUNCTION public._lead_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- The facility that signed up with this HFR code, if no other lead claims it.
-- SECURITY DEFINER because coordinators cannot read facility_profiles.
CREATE OR REPLACE FUNCTION public._facility_for_hfr(p_code text, p_lead uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fp.user_id FROM public.facility_profiles fp
   WHERE p_code IS NOT NULL AND fp.hfr_code = p_code
     AND NOT EXISTS (SELECT 1 FROM public.facility_leads l WHERE l.facility_profile_id = fp.user_id AND l.id <> p_lead)
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public._facility_for_hfr(text, uuid) FROM PUBLIC, anon, authenticated;

-- Guard: what a coordinator may write, HFR code rules, automatic link to a facility.
-- Not SECURITY DEFINER: it must see who is really writing (_is_end_user_request).
CREATE OR REPLACE FUNCTION public.facility_leads_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_other RECORD; v_end_user boolean := public._is_end_user_request() AND NOT public.is_admin();
BEGIN
  IF v_end_user THEN
    IF TG_OP = 'INSERT' THEN
      NEW.owner_id := coalesce(NEW.owner_id, auth.uid());
      IF NEW.owner_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'You can only add leads for yourself — ask an admin to assign them' USING ERRCODE = '42501';
      END IF;
      IF NEW.facility_profile_id IS NOT NULL OR NEW.hfr_status IS NOT NULL OR NEW.hfr_name IS NOT NULL
         OR NEW.hfr_checked_at IS NOT NULL THEN
        RAISE EXCEPTION 'HFR results and facility links are set by AfyaWork' USING ERRCODE = '42501';
      END IF;
      NEW.created_by := auth.uid();
      NEW.created_at := now();
    ELSE
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'Only an admin can change who owns a lead' USING ERRCODE = '42501';
      END IF;
      IF NEW.id <> OLD.id OR NEW.facility_profile_id IS DISTINCT FROM OLD.facility_profile_id
         OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
         OR NEW.hfr_status IS DISTINCT FROM OLD.hfr_status OR NEW.hfr_name IS DISTINCT FROM OLD.hfr_name
         OR NEW.hfr_checked_at IS DISTINCT FROM OLD.hfr_checked_at THEN
        RAISE EXCEPTION 'HFR results and facility links are set by AfyaWork' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
  END IF;

  NEW.name           := btrim(NEW.name);
  NEW.official_phone := nullif(btrim(coalesce(NEW.official_phone, '')), '');
  NEW.map_url        := nullif(btrim(coalesce(NEW.map_url, '')), '');
  NEW.hfr_code       := public._normalise_hfr_code(NEW.hfr_code);

  IF NEW.hfr_code IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.hfr_code IS DISTINCT FROM OLD.hfr_code) THEN
    SELECT id, name INTO v_other FROM public.facility_leads WHERE hfr_code = NEW.hfr_code AND id <> NEW.id;
    IF FOUND THEN
      RAISE EXCEPTION 'HFR code % is already on the lead "%"', NEW.hfr_code, v_other.name
        USING ERRCODE = '23505', DETAIL = v_other.id::text, HINT = 'Open that lead instead of adding a new one.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.hfr_code IS DISTINCT FROM OLD.hfr_code THEN
    NEW.hfr_status := NULL; NEW.hfr_name := NULL; NEW.hfr_checked_at := NULL;   -- run the lookup again
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS facility_leads_guard ON public.facility_leads;
CREATE TRIGGER facility_leads_guard
  BEFORE INSERT OR UPDATE ON public.facility_leads
  FOR EACH ROW EXECUTE FUNCTION public.facility_leads_guard();

-- Link to a facility that already signed up with this HFR code (the link never
-- verifies anything; admin still approves). Runs as definer, after the guard.
CREATE OR REPLACE FUNCTION public.facility_leads_autolink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fac uuid;
BEGIN
  IF NEW.facility_profile_id IS NULL AND NEW.hfr_code IS NOT NULL THEN
    v_fac := public._facility_for_hfr(NEW.hfr_code, NEW.id);
    IF v_fac IS NOT NULL THEN
      UPDATE public.facility_leads SET facility_profile_id = v_fac WHERE id = NEW.id AND facility_profile_id IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS facility_leads_autolink ON public.facility_leads;
CREATE TRIGGER facility_leads_autolink
  AFTER INSERT OR UPDATE OF hfr_code ON public.facility_leads
  FOR EACH ROW EXECUTE FUNCTION public.facility_leads_autolink();

-- …and the other way round: a facility signs up (or adds its code) after the lead exists
CREATE OR REPLACE FUNCTION public.facility_profiles_link_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hfr_code IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.hfr_code IS DISTINCT FROM OLD.hfr_code)
     AND NOT EXISTS (SELECT 1 FROM public.facility_leads WHERE facility_profile_id = NEW.user_id) THEN
    UPDATE public.facility_leads SET facility_profile_id = NEW.user_id
     WHERE hfr_code = NEW.hfr_code AND facility_profile_id IS NULL;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS facility_profiles_link_lead ON public.facility_profiles;
CREATE TRIGGER facility_profiles_link_lead
  AFTER INSERT OR UPDATE OF hfr_code ON public.facility_profiles
  FOR EACH ROW EXECUTE FUNCTION public.facility_profiles_link_lead();

-- Audit: creation, owner / status / HFR code changes, link, deletion
CREATE OR REPLACE FUNCTION public.facility_leads_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._lead_event(NEW.id, 'created', jsonb_build_object('name', NEW.name, 'owner_id', NEW.owner_id, 'hfr_code', NEW.hfr_code));
    IF NEW.facility_profile_id IS NOT NULL THEN
      PERFORM public._lead_event(NEW.id, 'linked', jsonb_build_object('facility_profile_id', NEW.facility_profile_id));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public._lead_event(OLD.id, 'deleted', jsonb_build_object('name', OLD.name, 'hfr_code', OLD.hfr_code));
    RETURN OLD;
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM public._lead_event(NEW.id, 'owner_changed', jsonb_build_object('from', OLD.owner_id, 'to', NEW.owner_id));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public._lead_event(NEW.id, 'status_changed', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.hfr_code IS DISTINCT FROM OLD.hfr_code THEN
    PERFORM public._lead_event(NEW.id, 'hfr_code_changed', jsonb_build_object('from', OLD.hfr_code, 'to', NEW.hfr_code));
  END IF;
  IF NEW.facility_profile_id IS DISTINCT FROM OLD.facility_profile_id THEN
    PERFORM public._lead_event(NEW.id, CASE WHEN NEW.facility_profile_id IS NULL THEN 'unlinked' ELSE 'linked' END,
      jsonb_build_object('from', OLD.facility_profile_id, 'to', NEW.facility_profile_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS facility_leads_audit ON public.facility_leads;
CREATE TRIGGER facility_leads_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.facility_leads
  FOR EACH ROW EXECUTE FUNCTION public.facility_leads_audit();

-- Steps: stamp who/when, keep the lead's updated_at fresh, log ticks
CREATE OR REPLACE FUNCTION public.lead_steps_stamp()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF public._is_end_user_request() THEN
    NEW.done_at := now();
    NEW.done_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lead_steps_stamp ON public.lead_steps;
CREATE TRIGGER lead_steps_stamp BEFORE INSERT ON public.lead_steps
  FOR EACH ROW EXECUTE FUNCTION public.lead_steps_stamp();

CREATE OR REPLACE FUNCTION public.lead_steps_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lead uuid := coalesce(NEW.lead_id, OLD.lead_id);
BEGIN
  UPDATE public.facility_leads SET updated_at = now() WHERE id = v_lead;
  PERFORM public._lead_event(v_lead, CASE TG_OP WHEN 'INSERT' THEN 'step_ticked' ELSE 'step_unticked' END,
    jsonb_build_object('step', coalesce(NEW.step_id, OLD.step_id)));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS lead_steps_audit ON public.lead_steps;
CREATE TRIGGER lead_steps_audit AFTER INSERT OR DELETE ON public.lead_steps
  FOR EACH ROW EXECUTE FUNCTION public.lead_steps_audit();

-- RLS
ALTER TABLE public.facility_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_select ON public.facility_leads;
DROP POLICY IF EXISTS leads_insert ON public.facility_leads;
DROP POLICY IF EXISTS leads_update ON public.facility_leads;
DROP POLICY IF EXISTS leads_delete ON public.facility_leads;
CREATE POLICY leads_select ON public.facility_leads FOR SELECT TO authenticated USING ((SELECT public.is_lead_staff()));
CREATE POLICY leads_insert ON public.facility_leads FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_lead_staff()));
CREATE POLICY leads_update ON public.facility_leads FOR UPDATE TO authenticated
  USING ((SELECT public.is_lead_staff())) WITH CHECK ((SELECT public.is_lead_staff()));
CREATE POLICY leads_delete ON public.facility_leads FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS steps_select ON public.lead_steps;
DROP POLICY IF EXISTS steps_insert ON public.lead_steps;
DROP POLICY IF EXISTS steps_delete ON public.lead_steps;
CREATE POLICY steps_select ON public.lead_steps FOR SELECT TO authenticated USING ((SELECT public.is_lead_staff()));
-- 6c (name/address match) and 6e (official phone call) are an admin's judgement
CREATE POLICY steps_insert ON public.lead_steps FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_lead_staff()) AND (step_id NOT IN ('6c', '6e') OR (SELECT public.is_admin())));
CREATE POLICY steps_delete ON public.lead_steps FOR DELETE TO authenticated
  USING ((SELECT public.is_lead_staff()) AND (step_id NOT IN ('6c', '6e') OR (SELECT public.is_admin())));
REVOKE UPDATE ON public.lead_steps FROM anon, authenticated;

DROP POLICY IF EXISTS events_select ON public.lead_events;
CREATE POLICY events_select ON public.lead_events FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
REVOKE INSERT, UPDATE, DELETE ON public.lead_events FROM anon, authenticated;
REVOKE ALL ON public.facility_leads, public.lead_steps, public.lead_events FROM anon;

-- ── 4. Helper RPCs ──────────────────────────────────────────────────────────
-- Names for owners / "ticked by" (coordinators cannot read users)
CREATE OR REPLACE FUNCTION public.lead_staff()
RETURNS TABLE (id uuid, display_name text, role text, account_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_lead_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT u.id, u.display_name, u.role, u.account_status FROM public.users u
               WHERE u.role IN ('admin', 'coordinator') ORDER BY u.display_name;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_lead_owner(p_lead_id uuid, p_owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_admin();
  IF p_owner_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = p_owner_id AND role IN ('admin', 'coordinator') AND account_status = 'active') THEN
    RAISE EXCEPTION 'The new owner must be an active coordinator or admin' USING ERRCODE = '22023';
  END IF;
  UPDATE public.facility_leads SET owner_id = p_owner_id WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found' USING ERRCODE = '22023'; END IF;
END $$;

-- Move every lead of one person to another (e.g. when a coordinator leaves)
CREATE OR REPLACE FUNCTION public.admin_reassign_leads(p_from uuid, p_to uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  PERFORM public._require_admin();
  IF p_to IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = p_to AND role IN ('admin', 'coordinator') AND account_status = 'active') THEN
    RAISE EXCEPTION 'The new owner must be an active coordinator or admin' USING ERRCODE = '22023';
  END IF;
  UPDATE public.facility_leads SET owner_id = p_to WHERE owner_id = p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.lead_staff()', 'public.admin_set_lead_owner(uuid, uuid)',
                           'public.admin_reassign_leads(uuid, uuid)', 'public.is_coordinator()', 'public.is_lead_staff()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- Live updates for the pipeline (RLS still applies to what each client receives)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.facility_leads; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_steps;     EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
