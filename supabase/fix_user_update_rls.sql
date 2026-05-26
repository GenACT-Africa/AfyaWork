-- ============================================================
-- AfyaWork — Fix: missing UPDATE RLS policy on public.users
-- Run in Supabase SQL Editor
-- ============================================================

-- Allow each authenticated user to update their own row.
-- This enables saving display_name, phone, bio, avatar_url, etc.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow admins to update any user row (needed for adminUpdateFacility /
-- adminUpdateWorker which update display_name and phone via the JS client).
DROP POLICY IF EXISTS "Admin updates all users" ON public.users;
CREATE POLICY "Admin updates all users"
  ON public.users FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());
