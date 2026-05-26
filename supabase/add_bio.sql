-- ============================================================
-- AfyaWork — Add bio column to public.users
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio TEXT;
