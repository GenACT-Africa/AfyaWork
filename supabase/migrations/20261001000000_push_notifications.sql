-- ============================================================================
-- AfyaWork — Browser push notifications
-- 2026-10-01 · run after 20260927000000_security_hardening.sql
--
--  1. push_subscriptions: one row per device that has allowed notifications.
--     Written only through save_/remove_push_subscription(), read only by its owner.
--  2. More events now create in-app notifications (and therefore pushes):
--     new open shift → COs, new applicant → facility, shift cancelled → COs,
--     payment sent → CO.
--  3. A webhook on notifications INSERT calls the send-push edge function.
--     After running, add the header x-webhook-secret to it in the dashboard
--     (Integrations → Database Webhooks), exactly like the other three.
-- ============================================================================

BEGIN;

-- ── 1. Device subscriptions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint        text        NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) < 1000),
  p256dh          text        NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 100),
  auth            text        NOT NULL CHECK (length(auth) BETWEEN 16 AND 30),
  user_agent      text        CHECK (length(user_agent) <= 300),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count   integer     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS "Users see own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users see own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Save (or move to the current user) this browser's subscription.
-- A device belongs to whoever signed in on it last, so a shared phone never
-- keeps receiving the previous user's notifications.
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent, failure_count = 0;
  -- Cap devices per user (oldest dropped)
  DELETE FROM public.push_subscriptions
  WHERE user_id = auth.uid()
    AND id NOT IN (SELECT id FROM public.push_subscriptions WHERE user_id = auth.uid()
                   ORDER BY created_at DESC LIMIT 10);
END $$;

CREATE OR REPLACE FUNCTION public.remove_push_subscription(p_endpoint text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$ DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid() $$;

-- Used by send-push: drop a device after repeated delivery failures
CREATE OR REPLACE FUNCTION public.record_push_failure(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._caller_is_trusted() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.push_subscriptions SET failure_count = failure_count + 1 WHERE id = p_id;
  DELETE FROM public.push_subscriptions WHERE id = p_id AND failure_count >= 5;
END $$;

REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_push_subscription(text)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_push_failure(uuid)                      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_push_subscription(text)                 TO authenticated;
GRANT  EXECUTE ON FUNCTION public.record_push_failure(uuid)                      TO service_role;

-- ── 2. Notifications for events that previously only sent email ────────────
CREATE OR REPLACE FUNCTION public._shift_label(p_type text, p_date date)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT split_part(p_type, ' (', 1) || ' · ' || to_char(p_date, 'Dy DD Mon') $$;

-- New open shift → every active CO (only verified ones once require_verified_cos is on)
CREATE OR REPLACE FUNCTION public.notify_new_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_facility text;
BEGIN
  IF NEW.status <> 'open' THEN RETURN NEW; END IF;
  SELECT facility_name INTO v_facility FROM public.facility_profiles WHERE user_id = NEW.facility_id;
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  SELECT u.id, NEW.id, 'new_shift',
         'New shift: ' || coalesce(v_facility, 'a facility'),
         public._shift_label(NEW.shift_type, NEW.shift_date) || ' · TZS ' || to_char(NEW.pay_amount, 'FM999,999,999'),
         '/co/shifts'
  FROM public.users u JOIN public.co_profiles cp ON cp.user_id = u.id
  WHERE u.role = 'co' AND u.account_status = 'active'
    AND (public.get_config('require_verified_cos') IS DISTINCT FROM 'true' OR cp.verified);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_new_shift ON public.shifts;
CREATE TRIGGER notify_new_shift
  AFTER INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_shift();

-- New application → the facility
CREATE OR REPLACE FUNCTION public.notify_new_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s RECORD; v_name text;
BEGIN
  SELECT id, facility_id, shift_type, shift_date INTO s FROM public.shifts WHERE id = NEW.shift_id;
  SELECT display_name INTO v_name FROM public.users WHERE id = NEW.co_id;
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (s.facility_id, s.id, 'new_application', 'New applicant',
          coalesce(v_name, 'A Clinical Officer') || ' applied for ' || public._shift_label(s.shift_type, s.shift_date),
          '/facility/shifts/' || s.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_new_application ON public.applications;
CREATE TRIGGER notify_new_application
  AFTER INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_application();

-- Shift cancelled → the selected CO and anyone still waiting on their application
CREATE OR REPLACE FUNCTION public.notify_shift_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  SELECT DISTINCT r.uid, NEW.id, 'shift_cancelled', 'Shift cancelled',
         'The ' || public._shift_label(NEW.shift_type, NEW.shift_date) || ' shift was cancelled by the facility.',
         '/co/applications'
  FROM (
    SELECT OLD.assigned_co_id AS uid WHERE OLD.assigned_co_id IS NOT NULL
    UNION
    SELECT co_id FROM public.applications WHERE shift_id = NEW.id AND status IN ('pending', 'approved')
  ) r;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_shift_cancelled ON public.shifts;
CREATE TRIGGER notify_shift_cancelled
  AFTER UPDATE OF status ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.notify_shift_cancelled();

-- Payment sent → the CO
CREATE OR REPLACE FUNCTION public.notify_payment_disbursed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status <> 'disbursed' OR OLD.payment_status = 'disbursed' THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, shift_id, type, title, body, action_url)
  VALUES (NEW.co_id, NEW.shift_id, 'payment_disbursed', 'Payment sent 💸',
          'TZS ' || to_char(coalesce(NEW.adjusted_pay_amount, NEW.co_total_pay), 'FM999,999,999')
            || ' has been sent to your mobile money.',
          '/co/payments');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_payment_disbursed ON public.shift_payments;
CREATE TRIGGER notify_payment_disbursed
  AFTER UPDATE OF payment_status ON public.shift_payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_disbursed();

REVOKE EXECUTE ON FUNCTION public.notify_new_shift()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_application()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_shift_cancelled()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_payment_disbursed() FROM PUBLIC, anon, authenticated;

-- ── 3. Webhook: every new notification → send-push ─────────────────────────
DO $$
BEGIN
  IF to_regprocedure('supabase_functions.http_request()') IS NULL
     AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'supabase_functions' AND p.proname = 'http_request') THEN
    RAISE NOTICE 'Database Webhooks are not enabled — create the send-push webhook in the dashboard instead';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS "send-push" ON public.notifications';
  EXECUTE $t$
    CREATE TRIGGER "send-push" AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
      'https://pwikwrzuixxmcjqyzfyq.supabase.co/functions/v1/send-push',
      'POST', '{"Content-type":"application/json"}', '{}', '5000')
  $t$;
END $$;

COMMIT;
