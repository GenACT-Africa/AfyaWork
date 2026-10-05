-- ═════════════════════════════════════════════════════════════════════════════
-- MCT licence verification for Clinical Officers  (5 Oct 2026)
--
-- The verify-co edge function looks up each CO's registration number on the
-- Ministry of Health HPRS portal (MCT register) and writes the result here.
--
--   co_profiles.mct_*      – latest result, shown on profiles (safe to expose)
--   co_mct_checks          – full lookup history incl. HPRS record (admins only)
--
-- verified is still the admin's decision (identity check: HPRS photo vs the
-- CO). The function never sets verified = true. It DOES set verified = false
-- when a re-check finds the licence expired, suspended or not found.
--
-- Extra guard: once require_verified_cos = 'true', a CO whose MCT licence has
-- lapsed (mct_licence_expires < today) cannot apply, even if verified earlier.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.co_profiles
  ADD COLUMN IF NOT EXISTS mct_status          text NOT NULL DEFAULT 'unchecked'
    CHECK (mct_status IN ('unchecked', 'valid', 'grace', 'expired', 'not_licensed',
                          'suspended', 'not_found', 'wrong_profession', 'error')),
  ADD COLUMN IF NOT EXISTS mct_reg_number      text,
  ADD COLUMN IF NOT EXISTS mct_licence_expires date,
  ADD COLUMN IF NOT EXISTS mct_checked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by         uuid,   -- admin user id; no FK on purpose (a 2nd FK to users makes PostgREST users(...) embeds ambiguous)
  ADD COLUMN IF NOT EXISTS verification_note   text;

ALTER TABLE public.co_profiles DROP CONSTRAINT IF EXISTS co_profiles_verified_by_fkey;

-- Self-edits are already limited to a whitelist by co_profiles_guard_update,
-- so COs cannot touch any of the new columns. A changed licence number also
-- resets the MCT result:
CREATE OR REPLACE FUNCTION public.co_profiles_reset_mct_on_licence_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.license_number IS DISTINCT FROM OLD.license_number THEN
    NEW.mct_status          := 'unchecked';
    NEW.mct_reg_number      := NULL;
    NEW.mct_licence_expires := NULL;
    NEW.mct_checked_at      := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS co_profiles_reset_mct ON public.co_profiles;
CREATE TRIGGER co_profiles_reset_mct
  BEFORE UPDATE OF license_number ON public.co_profiles
  FOR EACH ROW EXECUTE FUNCTION public.co_profiles_reset_mct_on_licence_change();

-- Full history of lookups (admins only)
CREATE TABLE IF NOT EXISTS public.co_mct_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  co_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  trigger_source  text NOT NULL,              -- 'signup' | 'admin' | 'batch' | 'self'
  searched_number text,
  status          text NOT NULL,
  reg_number      text,
  hprs_name       text,
  hprs_profession text,
  licence_expires date,
  name_match      numeric,                     -- 0..1 share of name words that match
  caveat          text,
  message         text,
  hprs_photo_url  text,
  hprs_record     jsonb
);
CREATE INDEX IF NOT EXISTS co_mct_checks_co_idx ON public.co_mct_checks (co_id, checked_at DESC);

ALTER TABLE public.co_mct_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS co_mct_checks_admin_read ON public.co_mct_checks;
CREATE POLICY co_mct_checks_admin_read ON public.co_mct_checks
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.co_mct_checks FROM anon, authenticated;

-- Admin decision (identity confirmed / rejected)
CREATE OR REPLACE FUNCTION public.admin_set_co_verification(p_co_id uuid, p_verified boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_verified AND NOT EXISTS (
       SELECT 1 FROM public.co_profiles
       WHERE user_id = p_co_id AND mct_status IN ('valid', 'grace')) THEN
    RAISE EXCEPTION 'MCT check must show a valid licence before approving' USING ERRCODE = '22023';
  END IF;
  UPDATE public.co_profiles
     SET verified          = p_verified,
         verified_at       = CASE WHEN p_verified THEN now() ELSE NULL END,
         verified_by       = auth.uid(),
         verification_note = p_note
   WHERE user_id = p_co_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_co_verification(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_co_verification(uuid, boolean, text) TO authenticated;

-- Lapsed licence blocks new applications (only once verification is enforced)
CREATE OR REPLACE FUNCTION public.applications_guard_mct_licence()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_exp date;
BEGIN
  IF NOT public._is_end_user_request() OR public.is_admin() THEN RETURN NEW; END IF;
  IF public.get_config('require_verified_cos') IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
  SELECT mct_licence_expires INTO v_exp FROM public.co_profiles WHERE user_id = NEW.co_id;
  IF v_exp IS NOT NULL AND v_exp < public._today_eat() THEN
    RAISE EXCEPTION 'Your MCT practising licence has expired. Renew it, then ask AfyaWork to re-check.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS applications_guard_mct_licence ON public.applications;
CREATE TRIGGER applications_guard_mct_licence
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_guard_mct_licence();
