CREATE OR REPLACE FUNCTION public.incrementar_meta_blocos_uso(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.blocos_meta
     SET vezes_usado = coalesce(vezes_usado, 0) + 1,
         updated_at = now()
   WHERE id = ANY(p_ids)
     AND ativo = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$

