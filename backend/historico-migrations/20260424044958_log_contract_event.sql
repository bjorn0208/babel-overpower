-- Coluna meta na tabela de log (detalhes estruturados por evento)
ALTER TABLE public.contract_access_log
  ADD COLUMN IF NOT EXISTS meta jsonb;

-- RPC callable por anon/authenticated para registrar eventos do fluxo público do contrato.
-- Rate limit 60/h por token protege contra abuse.
CREATE OR REPLACE FUNCTION public.log_contract_event(
  p_token uuid,
  p_event text,
  p_meta jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_agent text;
  v_ip text;
  v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF p_event IS NULL OR btrim(p_event) = '' THEN
    RAISE EXCEPTION 'event obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- Rate limit: 60 eventos/hora por token (generoso, mas bloqueia abuse anon)
  PERFORM public.check_public_rate_limit(p_token::text, 'log_contract_event', 60);

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(
      split_part(v_headers->>'x-forwarded-for', ',', 1),
      v_headers->>'cf-connecting-ip'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
    v_ip := NULL;
  END;

  INSERT INTO public.contract_access_log (token, event, user_agent, ip, meta)
  VALUES (p_token, p_event, v_user_agent, v_ip, p_meta);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_contract_event(uuid, text, jsonb) TO anon, authenticated, service_role;
;
