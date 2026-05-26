-- ============================================================
-- AfyaWork — Admin-Initiated Invite Flow
-- Run in Supabase SQL Editor AFTER admin_setup.sql
-- Then run updated admin_crud.sql (v2) to replace create functions
-- ============================================================

-- ── Extend public.users with invite columns ──

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_token        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_token_expiry TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status      TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('pending_invite', 'active', 'expired')),
  ADD COLUMN IF NOT EXISTS invited_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at        TIMESTAMPTZ;

-- ── Invite audit log ──

CREATE TABLE IF NOT EXISTS public.invite_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action       TEXT        NOT NULL, -- 'invited' | 'resent' | 'activated' | 'expired'
  performed_by UUID        REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view invite audit log" ON public.invite_audit_log;
CREATE POLICY "Admin can view invite audit log"
  ON public.invite_audit_log FOR SELECT TO authenticated
  USING (is_admin());

-- ── validate_invite_token ──
-- Called from InviteSetup page (unauthenticated). Checks token is valid + unexpired.

CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT id, role, display_name, email, account_status, invite_token_expiry
  INTO rec
  FROM public.users
  WHERE invite_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid or already-used invite link.');
  END IF;

  IF rec.invite_token_expiry IS NOT NULL AND rec.invite_token_expiry < now() THEN
    UPDATE public.users SET account_status = 'expired' WHERE id = rec.id;
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite link has expired. Please ask the admin to resend.');
  END IF;

  IF rec.account_status = 'expired' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite link has expired. Please ask the admin to resend.');
  END IF;

  RETURN jsonb_build_object(
    'valid',        true,
    'user_id',      rec.id,
    'role',         rec.role,
    'display_name', rec.display_name,
    'email',        rec.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invite_token(text) TO anon;

-- ── activate_account ──
-- Called from InviteSetup page (unauthenticated).
-- Sets the user's real password, marks account active, clears the token.

CREATE OR REPLACE FUNCTION public.activate_account(p_token TEXT, p_new_password TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec        RECORD;
  validation jsonb;
BEGIN
  -- Re-use validation logic
  validation := public.validate_invite_token(p_token);
  IF NOT (validation->>'valid')::boolean THEN
    RETURN validation;
  END IF;

  SELECT id, email INTO rec FROM public.users WHERE invite_token = p_token;

  -- Set real password in auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at         = now()
  WHERE id = rec.id;

  -- Mark account active and clear invite token
  UPDATE public.users
  SET account_status       = 'active',
      invite_token         = NULL,
      invite_token_expiry  = NULL,
      activated_at         = now()
  WHERE id = rec.id;

  -- Audit
  INSERT INTO public.invite_audit_log (user_id, action)
  VALUES (rec.id, 'activated');

  RETURN jsonb_build_object('success', true, 'user_id', rec.id, 'email', rec.email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_account(text, text) TO anon;

-- ── admin_resend_invite ──
-- Generates a fresh token for a pending/expired account and returns invite data
-- so the caller (admin page) can trigger the send-invite-email Edge Function.

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
      invite_token_expiry = now() + interval '7 days',
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
