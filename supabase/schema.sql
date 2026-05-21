-- ============================================================
-- AfyaWork MVP Database Schema v1.0
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────────

-- users: one row per registered user, extends auth.users
CREATE TABLE public.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('co', 'facility')),
  display_name TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- co_profiles: extended profile for Clinical Officers
CREATE TABLE public.co_profiles (
  user_id           UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  license_number    TEXT NOT NULL,
  specialization    TEXT,
  verified          BOOLEAN DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  subscription_tier TEXT DEFAULT 'msingi' CHECK (subscription_tier IN ('msingi', 'daktari', 'bingwa'))
);

-- facility_profiles: extended profile for healthcare facilities
CREATE TABLE public.facility_profiles (
  user_id           UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  facility_name     TEXT NOT NULL,
  facility_type     TEXT,
  address           TEXT,
  subscription_plan TEXT DEFAULT 'payg' CHECK (subscription_plan IN ('payg', 'starter', 'growth', 'enterprise'))
);

-- shifts: a shift posted by a facility
CREATE TABLE public.shifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shift_date     DATE NOT NULL,
  shift_type     TEXT NOT NULL CHECK (shift_type IN (
    'Day (8AM-4PM)',
    'Evening (4PM-10PM)',
    'Night (10PM-6AM)',
    '24-Hour',
    'Weekend'
  )),
  pay_amount     INTEGER NOT NULL CHECK (pay_amount >= 10000 AND pay_amount <= 500000),
  description    TEXT CHECK (char_length(description) <= 500),
  status         TEXT DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  assigned_co_id UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- applications: a CO's application to a shift
CREATE TABLE public.applications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id   UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  co_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (shift_id, co_id)
);

-- ─────────────────────────────────────────────
-- 2. UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- 3. AUTO-CREATE PUBLIC.USERS ON AUTH SIGNUP
-- Reads role + display_name from raw_user_meta_data
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, role, display_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'display_name',
    NEW.email
  );

  -- Create role-specific profile row
  IF NEW.raw_user_meta_data->>'role' = 'co' THEN
    INSERT INTO public.co_profiles (user_id, license_number, specialization)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'license_number',
      NEW.raw_user_meta_data->>'specialization'
    );
  ELSIF NEW.raw_user_meta_data->>'role' = 'facility' THEN
    INSERT INTO public.facility_profiles (user_id, facility_name, facility_type, address)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'facility_name',
      NEW.raw_user_meta_data->>'facility_type',
      NEW.raw_user_meta_data->>'address'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- 4. ROW-LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role from public.users
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── users ──
CREATE POLICY "Users can read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Authenticated users can read all user rows"
  ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── co_profiles ──
CREATE POLICY "Any authenticated user can read CO profiles"
  ON public.co_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "CO can update own profile"
  ON public.co_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ── facility_profiles ──
CREATE POLICY "Any authenticated user can read facility profiles"
  ON public.facility_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Facility can update own profile"
  ON public.facility_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ── shifts ──
CREATE POLICY "Authenticated users can read open shifts"
  ON public.shifts FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Facilities can insert shifts"
  ON public.shifts FOR INSERT
  WITH CHECK (public.current_user_role() = 'facility' AND auth.uid() = facility_id);

CREATE POLICY "Facility owner can update own shifts"
  ON public.shifts FOR UPDATE
  USING (auth.uid() = facility_id);

-- ── applications ──
CREATE POLICY "CO sees own applications"
  ON public.applications FOR SELECT
  USING (auth.uid() = co_id);

CREATE POLICY "Facility sees applications on own shifts"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts
      WHERE shifts.id = applications.shift_id
        AND shifts.facility_id = auth.uid()
    )
  );

CREATE POLICY "CO can apply to shifts"
  ON public.applications FOR INSERT
  WITH CHECK (public.current_user_role() = 'co' AND auth.uid() = co_id);

CREATE POLICY "Facility can approve or reject applicants on own shifts"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts
      WHERE shifts.id = applications.shift_id
        AND shifts.facility_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 5. APPROVE APPLICATION — STORED PROCEDURE
-- Atomic: approve one CO, reject others, fill shift
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_application(application_id UUID)
RETURNS VOID AS $$
DECLARE
  v_shift_id UUID;
  v_co_id    UUID;
BEGIN
  -- Get shift and CO from the application
  SELECT shift_id, co_id INTO v_shift_id, v_co_id
  FROM public.applications
  WHERE id = application_id;

  -- Verify calling user owns the shift
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts
    WHERE id = v_shift_id AND facility_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Verify shift is still open
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts WHERE id = v_shift_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Shift is not open';
  END IF;

  -- Approve the selected application
  UPDATE public.applications
  SET status = 'approved'
  WHERE id = application_id;

  -- Reject all other applications on the same shift
  UPDATE public.applications
  SET status = 'rejected'
  WHERE shift_id = v_shift_id AND id != application_id;

  -- Mark shift as filled and set assigned CO
  UPDATE public.shifts
  SET status = 'filled', assigned_co_id = v_co_id
  WHERE id = v_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
