CREATE OR REPLACE FUNCTION public.obter_uso_armazenamento(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'used_bytes', COALESCE(storage_used_bytes, 0),
    'max_bytes', COALESCE(max_storage_bytes, 209715200),
    'used_mb', ROUND(COALESCE(storage_used_bytes, 0) / 1048576.0, 1),
    'max_mb', ROUND(COALESCE(max_storage_bytes, 209715200) / 1048576.0, 0),
    'percent', CASE WHEN max_storage_bytes > 0 THEN ROUND(COALESCE(storage_used_bytes, 0) * 100.0 / max_storage_bytes, 1) ELSE 0 END
  ) INTO v_result FROM public.assinaturas_usuario WHERE user_id = p_user_id AND status IN ('active','ativa') LIMIT 1;
  RETURN COALESCE(v_result, '{"used_bytes":0,"max_bytes":209715200,"used_mb":0,"max_mb":200,"percent":0}'::jsonb);
END;
$function$

