-- ============================================================
-- AfyaWork — Admin CRUD SQL Functions & RLS Policies
-- v2 — Invite Flow (no passwords; invite tokens generated here)
-- Prerequisites: run admin_setup.sql, then invite_flow.sql first.
-- ============================================================

-- ── Additional RLS policies ──

DROP POLICY IF EXISTS "Admin updates all facility_profiles" ON public.facility_profiles;
CREATE POLICY "Admin updates all facility_profiles"
  ON public.facility_profiles FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin updates all co_profiles" ON public.co_profiles;
CREATE POLICY "Admin updates all co_profiles"
  ON public.co_profiles FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin inserts facility_profiles" ON public.facility_profiles;
CREATE POLICY "Admin inserts facility_profiles"
  ON public.facility_profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin inserts co_profiles" ON public.co_profiles;
CREATE POLICY "Admin inserts co_profiles"
  ON public.co_profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin deletes users" ON public.users;
CREATE POLICY "Admin deletes users"
  ON public.users FOR DELETE TO authenticated
  USING (is_admin());

-- ── Drop old 6-param create functions (return type changes uuid → jsonb) ──

DROP FUNCTION IF EXISTS public.admin_create_facility(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_worker(text, text, text, text, text, text);

-- ── Create Facility (no password — invite token generated instead) ──

CREATE OR REPLACE FUNCTION public.admin_create_facility(
  p_email         text,
  p_facility_name text,
  p_facility_type text DEFAULT NULL,
  p_address       text DEFAULT NULL,
  p_phone         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id      uuid := gen_random_uuid();
  identity_id uuid := gen_random_uuid();
  invite_tok  text := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'A user with this email already exists';
  END IF;

  -- Create auth user with a random placeholder password (user sets real password via invite)
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role,
    created_at, updated_at, confirmation_token, recovery_token, is_super_admin
  ) VALUES (
    new_id, '00000000-0000-0000-0000-000000000000', p_email,
    crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    -- handle_new_user trigger reads these to create public.users + facility_profiles
    jsonb_build_object(
      'role',          'facility',
      'display_name',  p_facility_name,
      'facility_name', p_facility_name,
      'facility_type', p_facility_type,
      'address',       p_address
    ),
    'authenticated', 'authenticated', now(), now(), '', '', false
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    created_at, updated_at, last_sign_in_at
  ) VALUES (
    identity_id, new_id,
    jsonb_build_object(
      'sub', new_id::text, 'email', p_email,
      'email_verified', true, 'phone_verified', false
    ),
    'email', p_email, now(), now(), now()
  );

  -- Trigger already created public.users and facility_profiles; set invite fields + phone
  UPDATE public.users
  SET phone               = p_phone,
      invite_token        = invite_tok,
      invite_token_expiry = now() + interval '7 days',
      account_status      = 'pending_invite',
      invited_at          = now()
  WHERE id = new_id;

  -- Log invite
  INSERT INTO public.invite_audit_log (user_id, action, performed_by)
  VALUES (new_id, 'invited', auth.uid());

  RETURN jsonb_build_object(
    'user_id',      new_id,
    'invite_token', invite_tok,
    'email',        p_email,
    'display_name', p_facility_name,
    'role',         'facility'
  );
END;
$$;

-- ── Create Worker (no password — invite token generated instead) ──

CREATE OR REPLACE FUNCTION public.admin_create_worker(
  p_email          text,
  p_display_name   text,
  p_license_number text,
  p_specialization text DEFAULT NULL,
  p_phone          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id      uuid := gen_random_uuid();
  identity_id uuid := gen_random_uuid();
  invite_tok  text := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'A user with this email already exists';
  END IF;

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role,
    created_at, updated_at, confirmation_token, recovery_token, is_super_admin
  ) VALUES (
    new_id, '00000000-0000-0000-0000-000000000000', p_email,
    crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'role',           'co',
      'display_name',   p_display_name,
      'license_number', p_license_number,
      'specialization', p_specialization
    ),
    'authenticated', 'authenticated', now(), now(), '', '', false
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    created_at, updated_at, last_sign_in_at
  ) VALUES (
    identity_id, new_id,
    jsonb_build_object(
      'sub', new_id::text, 'email', p_email,
      'email_verified', true, 'phone_verified', false
    ),
    'email', p_email, now(), now(), now()
  );

  UPDATE public.users
  SET phone               = p_phone,
      invite_token        = invite_tok,
      invite_token_expiry = now() + interval '7 days',
      account_status      = 'pending_invite',
      invited_at          = now()
  WHERE id = new_id;

  INSERT INTO public.invite_audit_log (user_id, action, performed_by)
  VALUES (new_id, 'invited', auth.uid());

  RETURN jsonb_build_object(
    'user_id',      new_id,
    'invite_token', invite_tok,
    'email',        p_email,
    'display_name', p_display_name,
    'role',         'co'
  );
END;
$$;

-- ── Delete User (cascades through auth → public → profiles) ──

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;
