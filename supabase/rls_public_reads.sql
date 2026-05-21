-- ============================================================
-- Allow public (unauthenticated) reads of open shifts and
-- facility profiles so the homepage can show real data
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop the authenticated-only read policy on shifts
DROP POLICY IF EXISTS "Authenticated users can read open shifts" ON public.shifts;

-- Allow anyone (anon + authenticated) to read open shifts
CREATE POLICY "Anyone can read open shifts"
  ON public.shifts FOR SELECT
  USING (status = 'open' OR auth.role() = 'authenticated');

-- Allow anyone to read facility profiles (for homepage provider cards)
DROP POLICY IF EXISTS "Any authenticated user can read facility profiles" ON public.facility_profiles;

CREATE POLICY "Anyone can read facility profiles"
  ON public.facility_profiles FOR SELECT
  USING (true);

-- Allow anyone to read CO profiles (facilities need this to see applicant details)
DROP POLICY IF EXISTS "Any authenticated user can read CO profiles" ON public.co_profiles;

CREATE POLICY "Anyone can read CO profiles"
  ON public.co_profiles FOR SELECT
  USING (auth.role() = 'authenticated');
