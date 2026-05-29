-- ─────────────────────────────────────────────────────────────────────────────
-- AfyaWork — Beta Feedback table
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name                TEXT,
  role                TEXT NOT NULL,
  usability_rating    INTEGER CHECK (usability_rating BETWEEN 1 AND 5),
  issues              TEXT[],
  usability_comment   TEXT,
  shift_rating        INTEGER CHECK (shift_rating BETWEEN 1 AND 5),
  checkin_clarity     TEXT,
  shift_comment       TEXT,
  notif_clarity       TEXT,
  notif_pref          TEXT[],
  nps                 INTEGER CHECK (nps BETWEEN 0 AND 10),
  top_improvement     TEXT NOT NULL,
  other_comments      TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Allow authenticated users to insert their own feedback
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can submit feedback"
  ON public.beta_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read all feedback"
  ON public.beta_feedback FOR SELECT
  USING (public.is_admin());
