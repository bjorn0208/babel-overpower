-- FASE 11.5.b: retry automatico de scheduled_actions failed (max 3 tentativas + 5min).
-- Adiciona coluna `tentativas` (default 0) e trigger BEFORE UPDATE OF status.

ALTER TABLE public.scheduled_actions
  ADD COLUMN IF NOT EXISTS tentativas int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.retry_failed_scheduled_actions()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'failed' AND COALESCE(NEW.tentativas, 0) < 3 THEN
    NEW.scheduled_at := now() + interval '5 minutes';
    NEW.status := 'pending';
    NEW.tentativas := COALESCE(OLD.tentativas, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_retry_failed_actions ON public.scheduled_actions;
CREATE TRIGGER trg_retry_failed_actions
  BEFORE UPDATE OF status ON public.scheduled_actions
  FOR EACH ROW EXECUTE FUNCTION public.retry_failed_scheduled_actions();
;
