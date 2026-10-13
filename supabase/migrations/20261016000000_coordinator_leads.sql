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

-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 3: evidence files, contract flag, approval gate, the lead board
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 5. Files (private bucket 'lead-files', path <lead_id>/<file>) ─────────────
CREATE TABLE IF NOT EXISTS public.lead_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES public.facility_leads(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('registration_cert', 'annual_licence', 'site_photo', 'visit_report', 'contract_scan')),
  storage_path  text NOT NULL UNIQUE,
  file_name     text CHECK (length(file_name) <= 200),
  mime_type     text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  size_bytes    integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path LIKE lead_id::text || '/%')
);
CREATE INDEX IF NOT EXISTS lead_files_lead_idx ON public.lead_files (lead_id, created_at);

CREATE OR REPLACE FUNCTION public.lead_files_stamp()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF public._is_end_user_request() THEN
    NEW.uploaded_by := auth.uid();
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lead_files_stamp ON public.lead_files;
CREATE TRIGGER lead_files_stamp BEFORE INSERT ON public.lead_files
  FOR EACH ROW EXECUTE FUNCTION public.lead_files_stamp();

CREATE OR REPLACE FUNCTION public.lead_files_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._lead_event(NEW.lead_id, 'file_uploaded', jsonb_build_object('kind', NEW.kind, 'file', NEW.file_name, 'id', NEW.id));
    UPDATE public.facility_leads SET updated_at = now() WHERE id = NEW.lead_id;
    RETURN NEW;
  END IF;
  PERFORM public._lead_event(OLD.lead_id, 'file_deleted', jsonb_build_object('kind', OLD.kind, 'file', OLD.file_name, 'id', OLD.id));
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS lead_files_audit ON public.lead_files;
CREATE TRIGGER lead_files_audit AFTER INSERT OR DELETE ON public.lead_files
  FOR EACH ROW EXECUTE FUNCTION public.lead_files_audit();

ALTER TABLE public.lead_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS files_select ON public.lead_files;
DROP POLICY IF EXISTS files_insert ON public.lead_files;
DROP POLICY IF EXISTS files_delete ON public.lead_files;
CREATE POLICY files_select ON public.lead_files FOR SELECT TO authenticated USING ((SELECT public.is_lead_staff()));
CREATE POLICY files_insert ON public.lead_files FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_lead_staff()));
CREATE POLICY files_delete ON public.lead_files FOR DELETE TO authenticated USING ((SELECT public.is_admin()));
REVOKE UPDATE ON public.lead_files FROM anon, authenticated;
REVOKE ALL ON public.lead_files FROM anon;

-- Storage: private bucket, images and PDF up to 10 MB
INSERT INTO storage.buckets (id, name, public) VALUES ('lead-files', 'lead-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit') THEN
    EXECUTE $q$UPDATE storage.buckets SET file_size_limit = 10485760,
              allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
              WHERE id = 'lead-files'$q$;
  END IF;
END $$;

DROP POLICY IF EXISTS "lead files: staff read"   ON storage.objects;
DROP POLICY IF EXISTS "lead files: staff upload" ON storage.objects;
DROP POLICY IF EXISTS "lead files: admin delete" ON storage.objects;
DROP POLICY IF EXISTS "lead files: coordinators only here" ON storage.objects;
CREATE POLICY "lead files: staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-files' AND (SELECT public.is_lead_staff()));
CREATE POLICY "lead files: staff upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-files' AND (SELECT public.is_lead_staff())
              AND EXISTS (SELECT 1 FROM public.facility_leads l WHERE l.id::text = split_part(objects.name, '/', 1)));
CREATE POLICY "lead files: admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-files' AND (SELECT public.is_admin()));
-- Coordinators touch no other bucket
CREATE POLICY "lead files: coordinators only here" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id = 'lead-files' OR NOT (SELECT public._is_coordinator_role()))
  WITH CHECK (bucket_id = 'lead-files' OR NOT (SELECT public._is_coordinator_role()));

-- ── 6. Contract flag: no signature, no approval ─────────────────────────────
ALTER TABLE public.facility_profiles
  ADD COLUMN IF NOT EXISTS contract_signed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS contract_file_id      uuid REFERENCES public.lead_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_note         text,
  ADD COLUMN IF NOT EXISTS contract_confirmed_by uuid;
-- (facilities cannot set these: facility_profiles_guard_update only lets them change listed columns)

CREATE OR REPLACE FUNCTION public.admin_set_contract_signed(
  p_facility_id uuid, p_signed boolean, p_file_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lead uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM public._require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.facility_profiles WHERE user_id = p_facility_id) THEN
    RAISE EXCEPTION 'Facility not found' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_lead FROM public.facility_leads WHERE facility_profile_id = p_facility_id;

  IF p_signed THEN
    IF p_file_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.lead_files f JOIN public.facility_leads l ON l.id = f.lead_id
          WHERE f.id = p_file_id AND f.kind = 'contract_scan' AND l.facility_profile_id = p_facility_id) THEN
      RAISE EXCEPTION 'That file is not a contract scan for this facility' USING ERRCODE = '22023';
    END IF;
    IF p_file_id IS NULL AND v_note IS NULL THEN
      RAISE EXCEPTION 'Pick the contract scan, or note where the signed paper copy is' USING ERRCODE = '22023';
    END IF;
    UPDATE public.facility_profiles
       SET contract_signed_at = now(), contract_file_id = p_file_id, contract_note = v_note, contract_confirmed_by = auth.uid()
     WHERE user_id = p_facility_id;
  ELSE
    UPDATE public.facility_profiles
       SET contract_signed_at = NULL, contract_file_id = NULL, contract_note = v_note, contract_confirmed_by = auth.uid(),
           verified = false, verified_at = NULL,
           verification_note = CASE WHEN verified THEN 'Auto-removed: contract confirmation withdrawn' ELSE verification_note END
     WHERE user_id = p_facility_id;
  END IF;
  IF v_lead IS NOT NULL THEN
    PERFORM public._lead_event(v_lead, CASE WHEN p_signed THEN 'contract_confirmed' ELSE 'contract_withdrawn' END,
      jsonb_build_object('facility_profile_id', p_facility_id, 'file_id', p_file_id, 'note', v_note));
  END IF;
END $$;

-- Approval now needs the contract too (HFR version + contract check)
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
  IF p_verified AND NOT EXISTS (
       SELECT 1 FROM public.facility_profiles
       WHERE user_id = p_facility_id AND contract_signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm the signed contract before approving' USING ERRCODE = '22023';
  END IF;
  UPDATE public.facility_profiles
     SET verified          = p_verified,
         verified_at       = CASE WHEN p_verified THEN now() ELSE NULL END,
         verified_by       = auth.uid(),
         verification_note = p_note
   WHERE user_id = p_facility_id;
END $$;

-- ── 7. The lead board: leads + manual ticks + auto ticks + limited facility status
-- Auto steps are computed here from live data, so they cannot drift.
CREATE OR REPLACE FUNCTION public.lead_board(p_lead_id uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_lead_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT to_jsonb(l)
      || jsonb_build_object(
           'owner_name', (SELECT u.display_name FROM public.users u WHERE u.id = l.owner_id),
           'steps', coalesce((SELECT jsonb_object_agg(s.step_id, jsonb_build_object('at', s.done_at, 'by', s.done_by))
                                FROM public.lead_steps s WHERE s.lead_id = l.id), '{}'::jsonb),
           'auto', jsonb_strip_nulls(jsonb_build_object(
              '1a', CASE WHEN l.hfr_status IN ('operating', 'not_operating') THEN to_jsonb(l.hfr_checked_at) END,
              '1b', CASE WHEN l.hfr_status = 'operating' THEN to_jsonb(l.hfr_checked_at) END,
              '1c', CASE WHEN l.hfr_status = 'operating' AND l.hfr_code IS NOT NULL AND l.official_phone IS NOT NULL
                         THEN to_jsonb(l.hfr_checked_at) END,
              '6a', CASE WHEN fp.user_id IS NOT NULL THEN to_jsonb(fu.created_at) END,
              '6b', CASE WHEN fp.hfr_status = 'operating' THEN to_jsonb(coalesce(fp.hfr_checked_at, now())) END,
              '6d', CASE WHEN fp.location_url IS NOT NULL OR fp.location_lat IS NOT NULL THEN 'true'::jsonb END,
              '6f', to_jsonb(fp.contract_signed_at),
              '6g', CASE WHEN fp.verified THEN to_jsonb(coalesce(fp.verified_at, now())) END,
              '7d', to_jsonb(sh.first_posted),
              '7e', to_jsonb(sh.first_selected),
              '7f', to_jsonb(sh.first_checkin))),
           'facility', CASE WHEN fp.user_id IS NULL THEN NULL ELSE jsonb_build_object(
              'hfr_status', fp.hfr_status, 'verified', coalesce(fp.verified, false),
              'map_set', (fp.location_url IS NOT NULL OR fp.location_lat IS NOT NULL),
              'contract_signed', fp.contract_signed_at IS NOT NULL,
              'shifts_posted', coalesce(sh.n, 0)) END,
           'file_count', (SELECT count(*) FROM public.lead_files f WHERE f.lead_id = l.id),
           'files', CASE WHEN p_lead_id IS NULL THEN NULL ELSE coalesce((
              SELECT jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'file_name', f.file_name, 'mime_type', f.mime_type,
                                                  'size_bytes', f.size_bytes, 'storage_path', f.storage_path,
                                                  'uploaded_by', f.uploaded_by, 'created_at', f.created_at) ORDER BY f.created_at)
                FROM public.lead_files f WHERE f.lead_id = l.id), '[]'::jsonb) END)
    FROM public.facility_leads l
    LEFT JOIN public.facility_profiles fp ON fp.user_id = l.facility_profile_id
    LEFT JOIN public.users fu ON fu.id = fp.user_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS n,
             min(s.created_at) AS first_posted,
             min(s.created_at) FILTER (WHERE s.assigned_co_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.applications a WHERE a.shift_id = s.id AND a.status = 'approved')) AS first_selected,
             min(s.checkin_at) AS first_checkin
        FROM public.shifts s WHERE s.facility_id = fp.user_id
    ) sh ON fp.user_id IS NOT NULL
   WHERE p_lead_id IS NULL OR l.id = p_lead_id
   ORDER BY l.due_date NULLS LAST, l.updated_at DESC;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.lead_board(uuid)', 'public.admin_set_contract_signed(uuid, boolean, uuid, text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_files; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
