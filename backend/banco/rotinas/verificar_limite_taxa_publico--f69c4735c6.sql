CREATE OR REPLACE FUNCTION public.verificar_limite_taxa_publico(p_identifier text, p_endpoint text, p_max_per_hour integer DEFAULT 20)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RAISE EXCEPTION 'identifier obrigatorio' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.limites_taxa
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at > now() - interval '1 hour';

  IF v_count >= p_max_per_hour THEN
    RAISE EXCEPTION 'rate limit excedido' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.limites_taxa (identifier, endpoint)
  VALUES (p_identifier, p_endpoint);
END;
$function$

