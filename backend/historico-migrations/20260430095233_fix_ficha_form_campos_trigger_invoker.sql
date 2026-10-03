-- Trigger de updated_at não precisa de SECURITY DEFINER nem ser exposta via RPC.
-- Troca pra SECURITY INVOKER e revoga EXECUTE pra anon/authenticated.

CREATE OR REPLACE FUNCTION public.tg_ficha_form_campos_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.tg_ficha_form_campos_updated_at() FROM anon, authenticated, public;

;
