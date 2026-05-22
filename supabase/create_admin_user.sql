-- ============================================================
-- AfyaWork — Create Admin User via SQL
-- Run this in the Supabase SQL Editor after admin_setup.sql
--
-- STEP 1: Run the CLEANUP block below to remove any partial user
--         from previous failed attempts.
-- STEP 2: Replace 'ChangeMe123!' with your chosen password.
-- STEP 3: Run the full file.
-- ============================================================

-- ── STEP 1: Clean up any partial user from previous attempts ──
DELETE FROM auth.users WHERE email = 'admin@genactafrica.org';
-- Cascades automatically to auth.identities and public.users

-- ── STEP 2: Allow 'admin' as a valid role ──
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('co', 'facility', 'admin'));

-- ── STEP 3: Create the admin user ──
DO $$
DECLARE
  new_id       uuid := gen_random_uuid();
  identity_id  uuid := gen_random_uuid();   -- separate ID for the identity row
  admin_email  text := 'admin@genactafrica.org';
  admin_pass   text := 'ChangeMe123!';      -- ← change this before running
BEGIN

  -- Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    is_super_admin
  ) VALUES (
    new_id,
    '00000000-0000-0000-0000-000000000000',
    admin_email,
    crypt(admin_pass, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"admin","display_name":"AfyaWork Admin"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    '',
    false
  );

  -- Insert into auth.identities — email_verified is required for sign-in to work
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at,
    last_sign_in_at
  ) VALUES (
    identity_id,
    new_id,
    jsonb_build_object(
      'sub',            new_id::text,
      'email',          admin_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    admin_email,
    now(),
    now(),
    now()
  );

  -- The handle_new_user trigger fires on the auth.users insert and creates
  -- the public.users row. This upsert ensures role = 'admin' is set correctly.
  INSERT INTO public.users (id, email, role, display_name, created_at, updated_at)
  VALUES (new_id, admin_email, 'admin', 'AfyaWork Admin', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin', display_name = 'AfyaWork Admin';

  RAISE NOTICE 'Admin user created with id = %', new_id;
END;
$$;
