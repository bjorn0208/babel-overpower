CREATE OR REPLACE FUNCTION public.limpar_intencoes_antigas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_apagadas int;
BEGIN
  WITH ranqueadas AS (
    SELECT id,
           row_number() OVER (PARTITION BY conversa_id ORDER BY criado_em DESC) AS pos
    FROM public.intencoes_pendentes
  ),
  apagar AS (
    DELETE FROM public.intencoes_pendentes ip
    USING ranqueadas r
    WHERE ip.id = r.id
      AND r.pos > 5
      AND ip.criado_em < now() - interval '30 days'
    RETURNING ip.id
  )
  SELECT count(*)::int INTO v_apagadas FROM apagar;
  RETURN v_apagadas;
END;
$function$

