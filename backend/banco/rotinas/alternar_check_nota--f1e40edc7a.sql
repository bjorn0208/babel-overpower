CREATE OR REPLACE FUNCTION public.alternar_check_nota(p_nota_id uuid, p_check_id text, p_marcado boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.notas_app
  SET checks = (
    SELECT jsonb_agg(
      CASE WHEN elem->>'id' = p_check_id
        THEN jsonb_set(elem, '{marcado}', to_jsonb(p_marcado))
        ELSE elem
      END
    )
    FROM jsonb_array_elements(checks) elem
  )
  WHERE id = p_nota_id;
END;
$function$

