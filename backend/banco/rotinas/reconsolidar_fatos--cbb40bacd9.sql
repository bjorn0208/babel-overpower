CREATE OR REPLACE FUNCTION public.reconsolidar_fatos(p_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH upd AS (
    UPDATE public.memoria_lead
       SET vezes_evocado      = COALESCE(vezes_evocado, 0) + 1,
           ultima_evocacao_em = now(),
           atualizado_em      = now()
     WHERE id = ANY(p_ids)
       AND ativa = true
    RETURNING id
  )
  SELECT count(*)::int FROM upd;
$function$

