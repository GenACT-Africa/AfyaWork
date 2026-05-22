-- ============================================================
-- AfyaWork — Create Admin User via SQL
-- Run this in the Supabase SQL Editor after admin_setup.sql
--
-- BEFORE RUNNING: replace 'ChangeMe123!' below with a strong
-- password of your choice.
-- ============================================================

-- 1. Allow 'admin' as a valid role (schema only had 'co'/'facility')
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('co', 'facility', 'admin'));

-- 2. Create the admin user (wrapped in a transaction)
DO $$
DECLARE
  new_id uuid := gen_random_uuid();
  admin_email  text := 'admin@genactafrica.org';
  admin_pass   text := 'ChangeMe123!';   -- ← change this
BEGIN

  -- Guard: skip if this email already exists in auth
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
    RAISE NOTICE 'User % already exists in auth.users — skipping insert.', admin_email;
    -- Still make sure public.users has the admin role
    UPDATE public.users SET role = 'admin', display_name = 'AfyaWork Admin'
    WHERE email = admin_email;
    RETURN;
  END IF;

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
    '{"display_name":"AfyaWork Admin"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    '',
    false
  );

  -- Insert into auth.identities (required for email login)
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
    new_id,
    new_id,
    jsonb_build_object('sub', new_id::text, 'email', admin_email),
    'email',
    admin_email,
    now(),
    now(),
    now()
  );

  -- Insert into public.users with admin role
  -- (the normal trigger creates a row for 'co'/'facility' signups,
  --  but won't run here since we're inserting directly)
  INSERT INTO public.users (id, email, role, display_name, created_at, updated_at)
  VALUES (new_id, admin_email, 'admin', 'AfyaWork Admin', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin', display_name = 'AfyaWork Admin';

  RAISE NOTICE 'Admin user created successfully with id = %', new_id;
END;
$$;
