CREATE OR REPLACE FUNCTION public.recalcular_armazenamento(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total bigint;
BEGIN
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  INTO v_total
  FROM storage.objects
  WHERE (path_tokens[1] = p_user_id::text);

  UPDATE public.assinaturas_usuario
  SET storage_used_bytes = v_total, updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$

