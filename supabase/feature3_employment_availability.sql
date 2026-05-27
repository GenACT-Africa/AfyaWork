-- ============================================================
-- AfyaWork — Feature 3: CO Employment Availability Profile
--
-- Adds columns to co_profiles so COs can declare whether they
-- are open to full-time / permanent employment.
-- Facilities can search and filter by availability.
--
-- Run in Supabase SQL Editor AFTER feature2_checkin_ratings.sql
-- ============================================================

-- ── Extend co_profiles ────────────────────────────────────────────

ALTER TABLE public.co_profiles
  ADD COLUMN IF NOT EXISTS employment_availability_status TEXT
    CHECK (employment_availability_status IN ('open_fulltime', 'open_parttime', 'not_looking')),

  ADD COLUMN IF NOT EXISTS available_from_immediately BOOLEAN NOT NULL DEFAULT FALSE,

  -- Stored as the first day of the target month, e.g. 2026-09-01
  ADD COLUMN IF NOT EXISTS available_from_date DATE,

  ADD COLUMN IF NOT EXISTS preferred_location TEXT
    CHECK (preferred_location IN ('dar_only', 'open_regions', 'specific_region')),

  ADD COLUMN IF NOT EXISTS preferred_location_text TEXT,

  ADD COLUMN IF NOT EXISTS current_employment_status TEXT
    CHECK (current_employment_status IN ('employed_looking', 'locum_only', 'unemployed')),

  ADD COLUMN IF NOT EXISTS availability_note TEXT,

  ADD COLUMN IF NOT EXISTS availability_last_updated_at TIMESTAMPTZ;

-- Length guards
ALTER TABLE public.co_profiles
  ADD CONSTRAINT preferred_location_text_length
    CHECK (char_length(preferred_location_text) <= 100),
  ADD CONSTRAINT availability_note_length
    CHECK (char_length(availability_note) <= 150);

-- Index so facility search is fast
CREATE INDEX IF NOT EXISTS co_profiles_avail_status_idx
  ON public.co_profiles (employment_availability_status)
  WHERE employment_availability_status IS NOT NULL
    AND employment_availability_status <> 'not_looking';

-- ── RLS: COs can update their own availability ────────────────────
-- (co_profiles already has update RLS for owners — no new policy needed
--  as long as the existing "co update own profile" policy selects all columns)

-- ── Helper view for facility browse (optional, for convenience) ───

CREATE OR REPLACE VIEW public.co_availability_view AS
SELECT
  cp.user_id,
  u.display_name,
  u.avatar_url,
  u.bio,
  cp.specialization,
  cp.verified,
  cp.subscription_tier,
  cp.employment_availability_status,
  cp.available_from_immediately,
  cp.available_from_date,
  cp.preferred_location,
  cp.preferred_location_text,
  cp.current_employment_status,
  cp.availability_note,
  cp.availability_last_updated_at
FROM public.co_profiles cp
JOIN public.users u ON u.id = cp.user_id
WHERE cp.employment_availability_status IN ('open_fulltime', 'open_parttime');

-- Grant read access to authenticated users (facilities)
GRANT SELECT ON public.co_availability_view TO authenticated;
