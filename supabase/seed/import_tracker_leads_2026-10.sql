-- One-off import of the 20 leads from the standalone tracker artifact
-- (https://claude.ai/artifact/9nruRKGmKToqDBJ8mifuok), exported 13 Oct 2026.
-- Run ONCE in the Supabase SQL Editor after 20261016000000_coordinator_leads.sql.
-- Leads come in unassigned: give them owners in Admin → Coordinators (Reassign)
-- or on each lead. Re-running skips leads whose name already exists.

BEGIN;
CREATE TEMP TABLE _import (key text, name text, language text, status text, due date, notes text, created timestamptz, steps jsonb) ON COMMIT DROP;
INSERT INTO _import VALUES
  ('seed-adventist', 'Dar es Salaam Adventist', 'sw', 'later', NULL, 'Seeded from batch 2 (2 Oct, Kiswahili DM). Instagram says the hospital is under construction at Mbezi Beach (coming soon). Future lead: revisit when it opens.', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-agakhan', 'Aga Khan Hospital, Dar es Salaam', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-alexia', 'Alexia', 'en', 'open', '2026-10-06', 'Seeded from outreach notes. DM''d 1 Oct, replied. Planned follow-up on WhatsApp 6 Oct. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-01", "2d": "2026-10-02"}'),
  ('seed-avianna', 'Avianna', 'en', 'open', '2026-10-16', 'Seeded from outreach notes. DM''d 1 Oct. Confirm Stage 1 (HFR code) and whether follow-ups were sent.', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-13"}'),
  ('seed-careplus', 'Careplus Msasani', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-decca', 'Decca Medical Centre', 'sw', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, Kiswahili DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-epicare', 'Epicare', 'sw', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, Kiswahili DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-kairuki', 'Kairuki', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-kitengule', 'Kitengule', 'sw', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, Kiswahili DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-massana', 'Massana', 'sw', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, Kiswahili DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-megra', 'Megra', 'en', 'open', '2026-10-04', 'Seeded from outreach notes. DM''d 1 Oct. Confirm Stage 1 (HFR code) and whether follow-ups were sent.', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-01"}'),
  ('seed-qualitas', 'Qualitas', 'en', 'open', '2026-10-04', 'Seeded from outreach notes. DM''d 1 Oct. Confirm Stage 1 (HFR code) and whether follow-ups were sent.', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-01"}'),
  ('seed-rabininsia', 'Rabininsia Memorial', 'sw', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, Kiswahili DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-regency', 'Regency', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-saifee', 'Saifee', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-sali', 'Sali International', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-shreehindu', 'Shree Hindu Mandal', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-tabata', 'Tabata General', 'sw', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, Kiswahili DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}'),
  ('seed-tmhs', 'TMHS', 'en', 'open', '2026-10-04', 'Seeded from outreach notes. DM''d 1 Oct. Confirm Stage 1 (HFR code) and whether follow-ups were sent.', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-01"}'),
  ('seed-tmj', 'TMJ', 'en', 'open', '2026-10-05', 'Seeded from batch 2 (2 Oct, English DM). No reply recorded. Confirm Stage 1 (HFR code).', '2026-10-13T08:00:00.000Z', '{"2a": "2026-10-02"}');

WITH ins AS (
  INSERT INTO public.facility_leads (name, language, status, due_date, notes, created_at)
  SELECT i.name, i.language, i.status, i.due, i.notes, i.created FROM _import i
   WHERE NOT EXISTS (SELECT 1 FROM public.facility_leads l WHERE lower(l.name) = lower(i.name))
  RETURNING id, name
)
INSERT INTO public.lead_steps (lead_id, step_id, done_at)
SELECT ins.id, s.key, (s.value #>> '{}')::date + time '12:00' AT TIME ZONE 'Africa/Dar_es_Salaam'
  FROM ins JOIN _import i ON i.name = ins.name
  CROSS JOIN LATERAL jsonb_each(i.steps) s;

SELECT count(*) AS leads_now FROM public.facility_leads;
COMMIT;
