-- ============================================================
-- AfyaWork — Admin CRUD SQL Functions & RLS Policies
-- Run in Supabase SQL Editor after admin_setup.sql
-- ============================================================

-- ── Additional RLS policies ──

CREATE POLICY "Admin updates all facility_profiles"
  ON public.facility_profiles FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin updates all co_profiles"
  ON public.co_profiles FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin inserts facility_profiles"
  ON public.facility_profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin inserts co_profiles"
  ON public.co_profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin deletes users"
  ON public.users FOR DELETE TO authenticated
  USING (is_admin());

-- ── Create Facility (SECURITY DEFINER to write into auth schema) ──

CREATE OR REPLACE FUNCTION public.admin_create_facility(
  p_email        text,
  p_password     text,
  p_facility_name text,
  p_facility_type text DEFAULT NULL,
  p_address      text DEFAULT NULL,
  p_phone        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id      uuid := gen_random_uuid();
  identity_id uuid := gen_random_uuid();
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
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', 'facility', 'display_name', p_facility_name),
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

  -- handle_new_user trigger creates the public.users row;
  -- upsert ensures role/phone are set correctly regardless.
  INSERT INTO public.users (id, email, role, display_name, phone, created_at, updated_at)
  VALUES (new_id, p_email, 'facility', p_facility_name, p_phone, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'facility', display_name = p_facility_name, phone = p_phone;

  INSERT INTO public.facility_profiles (user_id, facility_name, facility_type, address)
  VALUES (new_id, p_facility_name, p_facility_type, p_address)
  ON CONFLICT (user_id) DO UPDATE
    SET facility_name = p_facility_name, facility_type = p_facility_type, address = p_address;

  RETURN new_id;
END;
$$;

-- ── Create Worker ──

CREATE OR REPLACE FUNCTION public.admin_create_worker(
  p_email          text,
  p_password       text,
  p_display_name   text,
  p_license_number text,
  p_specialization text DEFAULT NULL,
  p_phone          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id      uuid := gen_random_uuid();
  identity_id uuid := gen_random_uuid();
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
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', 'co', 'display_name', p_display_name),
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

  INSERT INTO public.users (id, email, role, display_name, phone, created_at, updated_at)
  VALUES (new_id, p_email, 'co', p_display_name, p_phone, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'co', display_name = p_display_name, phone = p_phone;

  INSERT INTO public.co_profiles (user_id, license_number, specialization)
  VALUES (new_id, p_license_number, p_specialization)
  ON CONFLICT (user_id) DO UPDATE
    SET license_number = p_license_number, specialization = p_specialization;

  RETURN new_id;
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
