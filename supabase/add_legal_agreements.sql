-- ─────────────────────────────────────────────────────────────────────────────
-- AfyaWork — Legal agreements tracking
--
-- Adds two timestamp columns:
--   users.tos_agreed_at        — when the user agreed to Terms of Service
--   co_profiles.ica_signed_at  — when the CO signed the Independent Contractor
--                                Agreement (required before first shift)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tos_agreed_at TIMESTAMPTZ;

ALTER TABLE public.co_profiles
  ADD COLUMN IF NOT EXISTS ica_signed_at TIMESTAMPTZ;
