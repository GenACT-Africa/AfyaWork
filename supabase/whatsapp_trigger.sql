-- ============================================================
-- AfyaWork — WhatsApp DB Trigger (optional, backup layer)
--
-- This trigger fires send-whatsapp Edge Function directly from
-- Postgres using pg_net whenever a notification row is inserted.
-- It acts as a reliable backup in case the JS client call fails.
--
-- Prerequisites:
--   1. Enable pg_net extension:
--      Dashboard → Database → Extensions → pg_net → Enable
--   2. Set Postgres settings for your project's URL + service key:
--        ALTER DATABASE postgres
--          SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
--        ALTER DATABASE postgres
--          SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
--   3. Run this file AFTER feature2_checkin_ratings.sql
--
-- NOTE: If you call send-whatsapp from JS already (via api.js),
-- this trigger will cause duplicate messages unless you guard
-- against it. Choose ONE approach:
--   A. JS only (current default, simpler)
--   B. DB trigger only (more reliable, remove wa() calls in api.js)
--   C. DB trigger + dedup (use a sent_at column on notifications)
--
-- For now, this file is provided as reference. Only run it if you
-- want the DB-level approach.
-- ============================================================

-- Enable pg_net (run separately if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Trigger function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_whatsapp_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_url     TEXT;
  v_key     TEXT;
  v_phone   TEXT;
BEGIN
  v_url := current_setting('app.supabase_url', true) || '/functions/v1/send-whatsapp';
  v_key := current_setting('app.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map notification type → Edge Function event
  -- (same event names used in send-whatsapp/index.ts)
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'event',    NEW.type,
      'shift_id', NEW.shift_id
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let WA errors block the notification insert
  RAISE WARNING 'WhatsApp trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ── Attach trigger ────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_notification_wa ON public.notifications;
CREATE TRIGGER on_notification_wa
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_whatsapp_on_notification();
