CREATE OR REPLACE FUNCTION public.reconsolidar_episodios(
  p_ids uuid[],
  p_boost numeric DEFAULT 0.08
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH upd AS (
    UPDATE public.memoria_episodica
       SET decay_factor  = LEAST(1.0, COALESCE(decay_factor, 1.0) + p_boost),
           relevancia    = LEAST(1.0, COALESCE(relevancia, 0.5) + p_boost),
           atualizado_em = now()
     WHERE id = ANY(p_ids)
       AND ativa = true
    RETURNING id
  )
  SELECT count(*)::int FROM upd;
$function$;
;
