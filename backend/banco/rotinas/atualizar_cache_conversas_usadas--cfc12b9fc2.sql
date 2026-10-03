CREATE OR REPLACE FUNCTION public.atualizar_cache_conversas_usadas(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count int;
BEGIN
  v_count := public.get_conversas_usadas(p_tenant_id);
  UPDATE public.assinaturas_usuario SET conversas_usadas = v_count, updated_at = now()
  WHERE user_id = p_tenant_id AND status IN ('active', 'ativa');
  RETURN v_count;
END;
$function$

