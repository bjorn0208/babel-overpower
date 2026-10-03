CREATE OR REPLACE FUNCTION public.registrar_evento_contrato(p_token uuid, p_evento text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_agent text;
  v_ip text;
  v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF p_evento IS NULL OR btrim(p_evento) = '' THEN
    RAISE EXCEPTION 'evento obrigatorio' USING ERRCODE = '22023';
  END IF;

  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'registrar_evento_contrato', 60);

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(split_part(v_headers->>'x-forwarded-for', ',', 1),
                     v_headers->>'cf-connecting-ip');
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
    v_ip := NULL;
  END;

  INSERT INTO public.log_acesso_contrato (chave_publica, evento, user_agent, ip, meta)
  VALUES (p_token, p_evento, v_user_agent, v_ip, p_meta);
END;
$function$

