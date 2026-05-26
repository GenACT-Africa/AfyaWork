-- ============================================================
-- AfyaWork — Fix: Change invite token expiry from 7 days → 72 hours
-- Run in Supabase SQL Editor
-- ============================================================

-- ── admin_resend_invite ──
CREATE OR REPLACE FUNCTION public.admin_resend_invite(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec       RECORD;
  new_token TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT id, email, display_name, role, account_status
  INTO rec
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF rec.account_status = 'active' THEN
    RAISE EXCEPTION 'This account is already active and does not need an invitation.';
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  UPDATE public.users
  SET invite_token        = new_token,
      invite_token_expiry = now() + interval '72 hours',
      account_status      = 'pending_invite',
      invited_at          = now()
  WHERE id = p_user_id;

  INSERT INTO public.invite_audit_log (user_id, action, performed_by)
  VALUES (p_user_id, 'resent', auth.uid());

  RETURN jsonb_build_object(
    'user_id',      rec.id,
    'invite_token', new_token,
    'email',        rec.email,
    'display_name', rec.display_name,
    'role',         rec.role
  );
END;
$$;

-- ── admin_create_facility ──
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

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role,
    created_at, updated_at, confirmation_token, recovery_token, is_super_admin
  ) VALUES (
    new_id, '00000000-0000-0000-0000-000000000000', p_email,
    crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
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

  UPDATE public.users
  SET phone               = p_phone,
      invite_token        = invite_tok,
      invite_token_expiry = now() + interval '72 hours',
      account_status      = 'pending_invite',
      invited_at          = now()
  WHERE id = new_id;

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

-- ── admin_create_worker ──
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
      invite_token_expiry = now() + interval '72 hours',
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
