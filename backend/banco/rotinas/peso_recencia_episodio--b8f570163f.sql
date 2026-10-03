CREATE OR REPLACE FUNCTION public.peso_recencia_episodio(p_criado_em timestamp with time zone, p_half_life_dias numeric DEFAULT 60)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT POWER(
    2.0,
    -1.0 * (EXTRACT(EPOCH FROM (now() - p_criado_em)) / 86400.0) / GREATEST(p_half_life_dias, 1.0)
  )::numeric;
$function$

