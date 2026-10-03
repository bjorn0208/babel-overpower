CREATE OR REPLACE FUNCTION public.decay_episodios(p_decay_per_day numeric DEFAULT 0.02, p_threshold_desativar numeric DEFAULT 0.05)
 RETURNS TABLE(episodios_decaidos integer, episodios_desativados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_decaidos int := 0;
  v_desativados int := 0;
BEGIN
  WITH atualizados AS (
    UPDATE public.memoria_episodica em
       SET decay_factor = GREATEST(
             0.0,
             em.decay_factor - (EXTRACT(EPOCH FROM (now() - em.atualizado_em)) / 86400.0 * p_decay_per_day)
           ),
           atualizado_em = now()
     WHERE em.ativa = true
       AND em.decay_factor > 0
    RETURNING em.id, em.decay_factor
  ),
  desativados AS (
    UPDATE public.memoria_episodica em
       SET ativa = false,
           atualizado_em = now()
      FROM atualizados a
     WHERE em.id = a.id
       AND a.decay_factor <= p_threshold_desativar
    RETURNING em.id
  )
  SELECT
    (SELECT count(*) FROM atualizados),
    (SELECT count(*) FROM desativados)
  INTO v_decaidos, v_desativados;

  RETURN QUERY SELECT v_decaidos, v_desativados;
END;
$function$

