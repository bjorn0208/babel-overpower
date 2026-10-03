CREATE OR REPLACE FUNCTION public.verificar_incrementar_armazenamento(p_user_id uuid, p_bytes bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_used bigint; v_max bigint;
BEGIN
  SELECT storage_used_bytes, max_storage_bytes INTO v_used, v_max FROM public.assinaturas_usuario
  WHERE user_id = p_user_id AND status IN ('active','ativa') LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (v_used + p_bytes) > v_max THEN RETURN false; END IF;
  UPDATE public.assinaturas_usuario SET storage_used_bytes = storage_used_bytes + p_bytes, updated_at = now()
  WHERE user_id = p_user_id AND status IN ('active','ativa');
  RETURN true;
END;
$function$

