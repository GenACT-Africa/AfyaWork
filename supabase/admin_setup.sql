-- ============================================================
-- AfyaWork Admin Setup
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. Helper: fast, RLS-safe admin check (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. RLS policies — admin can SELECT everything
CREATE POLICY "Admin reads all users"
  ON public.users FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admin updates all users"
  ON public.users FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin reads all shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admin reads all applications"
  ON public.applications FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admin reads all co_profiles"
  ON public.co_profiles FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admin reads all facility_profiles"
  ON public.facility_profiles FOR SELECT TO authenticated
  USING (is_admin());


-- ============================================================
-- AFTER running the above, create the admin account:
--
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" → enter:
--      Email:    admin@genactafrica.org
--      Password: (choose a strong password)
-- 3. Then run the UPDATE below to grant admin role:
-- ============================================================

-- UPDATE public.users
-- SET role = 'admin', display_name = 'AfyaWork Admin'
-- WHERE email = 'admin@genactafrica.org';
